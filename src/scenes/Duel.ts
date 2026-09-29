import Phaser from 'phaser'
import { WordBank } from '../systems/wordBank'
import { Juice } from '../systems/Juice'
import { Particles } from '../systems/Hud'
import { displayFont } from '../systems/font'
import { loadData, recordDuel, type Settings } from '../systems/persistence'
import { DuelSim, type DuelEvent } from '../systems/duel/duelSim'
import { GoblinBrain } from '../systems/duel/goblinBrain'
import { mixSeed, randomSeed, seededRng } from '../systems/duel/rng'
import {
	MAX_LEVEL,
	clampLevel,
	duelLevel,
	type DuelLevel,
} from '../systems/duel/duelLevels'
import { PlayerDeck, MOVE_SLOTS, type Slot } from '../systems/duel/playerDeck'
import { CardView } from '../systems/duel/CardView'
import { DuelHud } from '../systems/duel/DuelHud'
import {
	DUEL,
	ENEMY_ATTACKS,
	MOVES,
	enemyWindupMs,
	type EnemyAttackDef,
	type MoveId,
} from '../systems/duel/duelTuning'

type Phase = 'intro' | 'fight' | 'between' | 'over'

const PLAYER_HOME_X = 440
const GOBLIN_HOME_X = 840
const PLAYER_SCALE = 3
const GOBLIN_SCALE = 3
/** Goblin attack sheet runs at 16fps; the spear lands on frame 6. */
const GOBLIN_ATTACK_FPS = 16
const GOBLIN_STRIKE_LEAD_MS = (6 / GOBLIN_ATTACK_FPS) * 1000

const BG_LAYERS = [11, 8, 5, 3, 2]

const CARD_STYLE: Record<Slot, { accent: number; fontSize: number }> = {
	jab: { accent: 0x64ffda, fontSize: 30 },
	heavy: { accent: 0xffb300, fontSize: 30 },
	special: { accent: 0xffd600, fontSize: 30 },
	block: { accent: 0xff5252, fontSize: 44 },
}

interface Telegraph {
	def: EnemyAttackDef
	startedAt: number
	landsAt: number
	striking: boolean
}

/**
 * Prototype duel: you vs the goblin, best of three, on a level ladder.
 *
 * Rules live in `DuelSim`; this scene only feeds it input and draws its
 * events. The sim runs on its own clock (`simNow`), which advances in real
 * time and stops only for pause. Hitstop and slow-mo are purely visual: when
 * they also slowed the sim, every hit you landed froze the goblin's windup
 * while your keystrokes kept counting, which was free typing time.
 */
export default class Duel extends Phaser.Scene {
	private level!: DuelLevel
	/** One number both players would share online; it fixes every word. */
	private seed = 0
	private settings!: Settings
	private sim!: DuelSim
	private brain!: GoblinBrain
	private deck!: PlayerDeck
	private hud!: DuelHud
	private juice!: Juice
	private particles!: Particles

	private player!: Phaser.GameObjects.Sprite
	private goblin!: Phaser.GameObjects.Sprite
	private cards = new Map<Slot, CardView>()
	private dizzy?: Phaser.GameObjects.Text

	private phase: Phase = 'intro'
	private paused = false
	private simNow = 0
	private clockMs: number = DUEL.roundTimeMs
	private telegraph: Telegraph | null = null
	/** A move finished while the player could not act, fired on recovery. */
	private buffered: { move: MoveId; perfect: boolean } | null = null
	private sfx: Record<string, Phaser.Sound.BaseSound> = {}
	private music?: Phaser.Sound.BaseSound
	private pauseText!: Phaser.GameObjects.Text
	private pauseShade!: Phaser.GameObjects.Rectangle
	private passiveText!: Phaser.GameObjects.Text
	private won = false
	private timers: Phaser.Time.TimerEvent[] = []

	constructor() {
		super('Duel')
	}

	init(): void {
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)
		this.phase = 'intro'
		this.paused = false
		this.simNow = 0
		this.clockMs = DUEL.roundTimeMs
		this.telegraph = null
		this.buffered = null
		this.cards = new Map()
		this.sfx = {}
		this.timers = []
		this.won = false
	}

	create(): void {
		this.level = duelLevel(
			clampLevel(Number(this.registry.get('duelLevel') ?? 1)),
		)
		this.settings = loadData().settings

		const bank = new WordBank(window.THESAURUS)
		this.seed = randomSeed()
		this.sim = new DuelSim({ maxHp: { p2: this.level.goblinHp } })
		this.brain = new GoblinBrain(
			'p2',
			seededRng(mixSeed(this.seed, 0xb0b)),
			this.level.brain,
		)
		this.deck = new PlayerDeck(
			(tier, reject, rng) => bank.pickFromTier(tier, reject, rng),
			this.seed,
		)
		this.juice = new Juice(this, this.settings.screenShake)
		this.particles = new Particles(this)

		this.buildWorld()
		this.buildFighters()
		this.buildCards()
		this.hud = new DuelHud(this, {
			p1: 'YOU',
			p2: `LV ${this.level.level} · ${this.level.title.toUpperCase()}`,
		})
		this.add
			.text(
				this.scale.width / 2,
				this.scale.height - 28,
				'Type a card to attack · type the RED word to parry (your word waits) · Backspace to cancel',
				{
					fontFamily: displayFont(),
					fontSize: '16px',
					color: '#8fa3bd',
				},
			)
			.setOrigin(0.5)
			.setDepth(40)
		this.passiveText = this.add
			.text(PLAYER_HOME_X, this.groundY() - 250, '', {
				fontFamily: displayFont(),
				fontSize: '22px',
				color: '#ff5252',
				stroke: '#000000',
				strokeThickness: 5,
			})
			.setOrigin(0.5)
			.setDepth(45)
		// Opaque enough that a paused telegraph cannot be read at leisure.
		this.pauseShade = this.add
			.rectangle(
				0,
				0,
				this.scale.width,
				this.scale.height,
				0x05080d,
				0.92,
			)
			.setOrigin(0)
			.setDepth(79)
			.setVisible(false)
		this.pauseText = this.add
			.text(
				this.scale.width / 2,
				this.scale.height / 2,
				'PAUSED\nEsc to resume',
				{
					fontFamily: displayFont(),
					fontSize: '48px',
					color: '#ffffff',
					align: 'center',
					stroke: '#000',
					strokeThickness: 6,
				},
			)
			.setOrigin(0.5)
			.setDepth(80)
			.setVisible(false)

		this.setupAudio()
		this.bindInput()
		this.game.events.on('yk-autopause', this.onAutoPause, this)
		this.beginRoundIntro()

		// Dev-only handle for poking at a live duel from the console.
		if (import.meta.env.DEV) {
			;(window as unknown as { __duel?: Duel }).__duel = this
		}
	}

	// -------------------------------------------------------------------- world

	private groundY(): number {
		return this.scale.height - 90
	}

	private buildWorld(): void {
		const { width, height } = this.scale
		this.cameras.main.setBackgroundColor('#0a0f16')
		BG_LAYERS.forEach((n, i) => {
			const key = `layer_${String(n).padStart(4, '0')}`
			if (this.textures.exists(key))
				this.add
					.tileSprite(0, 0, width, height, key)
					.setOrigin(0)
					.setDepth(-20 + i)
		})
		for (const [key, depth] of [
			['ground_back', -1],
			['ground_front', 0],
		] as const) {
			if (this.textures.exists(key))
				this.add
					.tileSprite(0, 0, width, height, key)
					.setOrigin(0)
					.setDepth(depth)
		}
		// Darken the backdrop so the fighters and cards own the frame.
		this.add
			.rectangle(0, 0, width, height, 0x000000, 0.35)
			.setOrigin(0)
			.setDepth(-2)
	}

	private buildFighters(): void {
		const anim = (
			key: string,
			sheet: string,
			end: number,
			fps: number,
			repeat = 0,
		) => {
			if (this.anims.exists(key) || !this.textures.exists(sheet)) return
			this.anims.create({
				key,
				frames: this.anims.generateFrameNumbers(sheet, {
					start: 0,
					end,
				}),
				frameRate: fps,
				repeat,
			})
		}
		anim('hero-dash', 'avatar_run', 7, 24, -1)
		anim('hero-hit', 'avatar_hit', 3, 12)
		anim('hero-death', 'avatar_death', 10, 10)
		anim('gob-idle', 'monster_Goblin_idle', 3, 11, -1)
		anim('gob-attack', 'monster_Goblin_attack', 7, GOBLIN_ATTACK_FPS)
		anim('gob-hit', 'monster_Goblin_hit', 3, 12)
		anim('gob-death', 'monster_Goblin_death', 3, 8)

		const y = this.groundY()
		// The hero pack in the repo has no idle sheet, so a held run frame plus
		// a breathing bob stands in for a stance.
		this.player = this.add
			.sprite(PLAYER_HOME_X, y - 40, 'avatar_run', 3)
			.setScale(PLAYER_SCALE)
			.setDepth(10)
		this.tweens.add({
			targets: this.player,
			scaleY: PLAYER_SCALE * 1.02,
			duration: 600,
			yoyo: true,
			repeat: -1,
			ease: 'Sine.easeInOut',
		})

		this.goblin = this.add
			.sprite(GOBLIN_HOME_X, y - 70, 'monster_Goblin_idle', 0)
			.setScale(GOBLIN_SCALE)
			.setFlipX(true)
			.setDepth(10)
		this.goblin.play('gob-idle')
	}

	private buildCards(): void {
		const { width } = this.scale
		const y = 180
		const xs: Record<MoveId, number> = {
			jab: width / 2 - 330,
			heavy: width / 2,
			special: width / 2 + 330,
		}
		for (const slot of MOVE_SLOTS) {
			const move = MOVES[slot]
			const caption =
				slot === 'special'
					? `${move.label} · ${move.damage} · FULL METER`
					: `${move.label} · ${move.damage}`
			this.cards.set(
				slot,
				new CardView(this, xs[slot], y, {
					...CARD_STYLE[slot],
					caption,
				}),
			)
		}
		const block = new CardView(this, width / 2, 330, {
			...CARD_STYLE.block,
			caption: 'PARRY!',
		})
		block.setVisible(false)
		this.cards.set('block', block)
		this.renderCards()
	}

	private renderCards(): void {
		const meter = this.sim.fighters.p1.meter
		const active = this.deck.active
		for (const [slot, view] of this.cards) {
			const card = this.deck.card(slot)
			if (!card) {
				view.setVisible(false)
				continue
			}
			view.setVisible(this.phase === 'fight' && !this.paused)
			view.render(
				card,
				active === slot,
				!this.deck.isUnlocked(slot, meter),
				active !== null && active !== slot,
			)
		}
		const tg = this.telegraph
		this.cards
			.get('block')
			?.setTimer(
				tg
					? (tg.landsAt - this.simNow) / (tg.landsAt - tg.startedAt)
					: null,
			)
	}

	// -------------------------------------------------------------------- input

	private bindInput(): void {
		const kb = this.input.keyboard
		if (!kb) return
		kb.on('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				if (this.phase === 'over') this.toMenu()
				else this.togglePause()
				return
			}
			if (this.phase === 'over') {
				this.onMatchOverKey(e.key)
				return
			}
			// Auto-repeat from a held key is not typing.
			if (e.repeat || this.paused || this.phase !== 'fight') return

			if (e.key === 'Backspace') {
				e.preventDefault()
				this.deck.backspace()
				this.renderCards()
				return
			}
			if (!/^[a-zA-Z]$/.test(e.key)) return
			e.preventDefault()
			this.onLetter(e.key)
		})
	}

	private onLetter(ch: string): void {
		const r = this.deck.key(ch, this.sim.fighters.p1.meter)
		switch (r.kind) {
			case 'progress':
				this.play('type', 1 + Math.random() * 0.1)
				break
			case 'mistake':
				this.play('error')
				this.sim.mistake('p1', this.simNow)
				this.brain.onOpponentMistake(this.simNow)
				if (r.slot) this.cards.get(r.slot)?.shake()
				this.juice.shake(2, 120)
				break
			case 'locked':
				this.cards.get(r.slot)?.shake()
				this.floatText(
					this.scale.width / 2 + 330,
					140,
					'NEED FULL METER',
					'#8fa3bd',
				)
				break
			case 'complete':
				this.cards.get(r.slot)?.pop()
				if (r.slot === 'block') this.tryParry(r.perfect)
				else this.queueMove(r.slot, r.perfect)
				break
		}
		this.renderCards()
	}

	private onMatchOverKey(key: string): void {
		const next = this.won && this.level.level < MAX_LEVEL
		if (key === 'Enter') {
			this.registry.set(
				'duelLevel',
				next ? this.level.level + 1 : this.level.level,
			)
			this.scene.restart()
		} else if (key === 'r' || key === 'R') {
			this.scene.restart()
		}
	}

	private tryParry(perfect: boolean): void {
		// The sim is the judge; the visuals follow from its 'parried' event.
		if (!this.sim.parry('p1', perfect, this.simNow)) {
			this.floatText(
				PLAYER_HOME_X,
				this.groundY() - 260,
				'TOO LATE',
				'#8fa3bd',
			)
		}
	}

	private queueMove(move: MoveId, perfect: boolean): void {
		this.buffered = { move, perfect }
		this.flushBuffered()
	}

	private flushBuffered(): void {
		if (!this.buffered || !this.sim.canAct('p1', this.simNow)) return
		const def = MOVES[this.buffered.move]
		const ok = this.sim.attack(
			'p1',
			{
				move: def.id,
				damage: def.damage,
				startupMs: def.startupMs,
				interrupts: def.interrupts,
				hitstunMs: def.hitstunMs,
				meterCost: def.meterCost,
				perfect: this.buffered.perfect,
			},
			this.simNow,
		)
		if (ok) this.buffered = null
	}

	// --------------------------------------------------------------- round flow

	private beginRoundIntro(): void {
		this.phase = 'intro'
		this.deck.resetAll()
		this.renderCards()
		const round = this.sim.round + 1
		const final =
			this.sim.fighters.p1.roundsWon === DUEL.roundsToWin - 1 &&
			this.sim.fighters.p2.roundsWon === DUEL.roundsToWin - 1
		this.hud.announce(
			final ? 'FINAL ROUND' : `ROUND ${round}`,
			round === 1
				? `LEVEL ${this.level.level} · ${this.level.title.toUpperCase()}`
				: '',
			DUEL.introMs - 700,
		)
		this.later(DUEL.introMs - 400, () => {
			this.hud.announce('FIGHT!', '', 400, '#ff5252')
			this.play('go')
			this.sim.startRound(this.simNow)
			this.clockMs = DUEL.roundTimeMs
			this.brain.reset(this.simNow)
			this.phase = 'fight'
			this.resetPoses()
			this.renderCards()
		})
	}

	private resetPoses(): void {
		this.tweens.killTweensOf([this.goblin])
		this.goblin
			.setPosition(GOBLIN_HOME_X, this.groundY() - 70)
			.clearTint()
			.setAlpha(1)
		this.goblin.play('gob-idle')
		this.player.setX(PLAYER_HOME_X).clearTint().setAlpha(1)
		this.player.stop().setTexture('avatar_run', 3)
		this.dizzy?.destroy()
		this.dizzy = undefined
	}

	// ---------------------------------------------------------------- the loop

	update(_time: number, delta: number): void {
		this.juice.update(delta)
		if (this.paused) return
		this.simNow += delta

		if (this.phase === 'fight') {
			const choice = this.brain.think(
				this.simNow,
				this.sim,
				this.deck.isLoaded(),
			)
			if (choice) this.startEnemyAttack(choice)
			this.flushBuffered()
			this.driveGoblinStrike()
		}

		this.sim.advance(this.simNow)
		for (const e of this.sim.drain()) this.onEvent(e)

		// Hold the clock between rounds instead of reading 0.
		if (this.sim.phase === 'fight')
			this.clockMs = this.sim.timeLeftMs(this.simNow)
		this.hud.update(this.sim.fighters, this.clockMs, delta)
		if (this.telegraph) this.renderCards()
		this.updatePassiveWarning()
		this.dizzy?.setPosition(this.goblin.x, this.goblin.y - 150)
	}

	/** Warn before the passivity rule kicks in, then while it applies. */
	private updatePassiveWarning(): void {
		if (this.phase !== 'fight') {
			this.passiveText.setText('')
			return
		}
		const idle = this.simNow - this.sim.fighters.p1.lastAttackAt
		const left = DUEL.passiveMs - idle
		if (left > 3000) this.passiveText.setText('')
		else if (left > 0)
			this.passiveText.setText(
				`ATTACK! PASSIVE IN ${Math.ceil(left / 1000)}`,
			)
		else this.passiveText.setText('PASSIVE: PARRIES LEAK DAMAGE')
	}

	private startEnemyAttack(def: EnemyAttackDef): void {
		const word = this.deck.offerBlock(def.blockTier)
		const windup =
			enemyWindupMs(
				word.length,
				def,
				this.level.msPerChar,
				this.sim.round,
				this.level.reactionMs,
			) / Math.max(0.5, this.settings.assistLevel)
		const ok = this.sim.attack(
			'p2',
			{
				move: def.id,
				damage: this.enemyDamage(def),
				startupMs: windup,
				interrupts: def.interrupts,
				armored: def.armored,
				rewardsParry: def.rewardsParry,
				hitstunMs: def.hitstunMs,
			},
			this.simNow,
		)
		// Never leave a block card up for an attack that is not coming.
		if (!ok) this.deck.clearBlock()
	}

	private enemyDamage(def: EnemyAttackDef): number {
		return Math.round(def.damage * this.level.damageScale)
	}

	/** Start the swing so the spear connects exactly when the sim lands it. */
	private driveGoblinStrike(): void {
		const tg = this.telegraph
		if (!tg || tg.striking) return
		if (this.simNow < tg.landsAt - GOBLIN_STRIKE_LEAD_MS) return
		tg.striking = true
		this.goblin.clearTint()
		this.goblin.play('gob-attack')
		this.tweens.add({
			targets: this.goblin,
			x: PLAYER_HOME_X + 170,
			duration: GOBLIN_STRIKE_LEAD_MS,
			ease: 'Quad.easeIn',
		})
	}

	private goblinRetreat(): void {
		this.tweens.killTweensOf(this.goblin)
		this.tweens.add({
			targets: this.goblin,
			x: GOBLIN_HOME_X,
			duration: 260,
			ease: 'Quad.easeOut',
		})
	}

	private endTelegraph(): void {
		this.telegraph = null
		this.deck.clearBlock()
		this.goblin.clearTint()
		this.tweens.killTweensOf(this.goblin)
	}

	// ----------------------------------------------------------------- events

	private onEvent(e: DuelEvent): void {
		switch (e.t) {
			case 'attackStarted':
				if (e.side === 'p1') this.heroDash(e.move as MoveId, e.landsAt)
				else this.goblinTelegraph(e.move, e.landsAt)
				break
			case 'hit':
				if (e.attacker === 'p1')
					this.onHeroHit(e.move as MoveId, e.damage, e.counter)
				else this.onGoblinHit(e.damage)
				break
			case 'parried':
				if (e.rewarded) this.onParry(e.perfect)
				else this.onDeflect(e.chip)
				break
			case 'interrupted':
				if (e.side === 'p2') {
					this.endTelegraph()
					this.goblinRetreat()
					this.floatText(
						GOBLIN_HOME_X,
						this.groundY() - 300,
						'INTERRUPTED!',
						'#ffb300',
					)
				}
				break
			case 'roundOver':
				this.onRoundOver(e.winner, e.reason)
				break
			case 'matchOver':
				this.onMatchOver(e.winner === 'p1')
				break
		}
		this.renderCards()
	}

	private goblinTelegraph(move: string, landsAt: number): void {
		const def = ENEMY_ATTACKS[move as keyof typeof ENEMY_ATTACKS]
		this.telegraph = {
			def,
			startedAt: this.simNow,
			landsAt,
			striking: false,
		}
		this.cards
			.get('block')
			?.setCaption(
				`PARRY ${def.label} · ${this.enemyDamage(def)}${def.armored ? ' · ARMORED' : def.rewardsParry ? '' : ' · DEFLECT ONLY'}`,
			)
		this.goblin.setTint(0xff8080)
		// Anticipation: a small step back before the lunge.
		this.tweens.add({
			targets: this.goblin,
			x: GOBLIN_HOME_X + 30,
			duration: 220,
			ease: 'Quad.easeOut',
		})
		this.floatText(this.goblin.x, this.groundY() - 300, '!', '#ff5252', 48)
		this.play('danger')
	}

	private heroDash(move: MoveId, landsAt: number): void {
		const ms = Math.max(60, landsAt - this.simNow)
		this.tweens.killTweensOf(this.player)
		this.player.setScale(PLAYER_SCALE)
		this.player.play('hero-dash')
		this.tweens.add({
			targets: this.player,
			x: this.goblin.x - 200,
			duration: ms,
			ease: 'Quad.easeIn',
		})
		if (move === 'special') {
			this.juice.slowMo(0.35, 260)
			this.player.setTint(0xffd600)
		}
	}

	private heroRetreat(): void {
		this.tweens.add({
			targets: this.player,
			x: PLAYER_HOME_X,
			duration: 240,
			delay: 80,
			ease: 'Quad.easeOut',
			onComplete: () => {
				this.player.stop().setTexture('avatar_run', 3).clearTint()
			},
		})
	}

	private onHeroHit(move: MoveId, damage: number, counter: boolean): void {
		const heavy = move !== 'jab'
		this.slash(this.goblin.x - 30, this.goblin.y + 20, move)
		this.goblin.play('gob-hit')
		this.goblin.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
			if (this.sim.fighters.p2.hp > 0 && !this.telegraph?.striking) {
				this.goblin.play('gob-idle')
			}
		})
		// Knock back, then return home unless mid-strike.
		if (!this.telegraph) {
			this.tweens.add({
				targets: this.goblin,
				x: GOBLIN_HOME_X + (heavy ? 40 : 15),
				duration: 90,
				yoyo: true,
				ease: 'Quad.easeOut',
			})
		}
		this.juice.hitstop(heavy ? 90 : 40)
		this.juice.shake(heavy ? 9 : 4, heavy ? 260 : 140)
		this.particles.burst(
			this.goblin.x - 20,
			this.goblin.y + 10,
			0xffffff,
			heavy ? 22 : 10,
		)
		this.play('hit', heavy ? 0.8 : 1.2)
		this.floatText(
			this.goblin.x,
			this.goblin.y - 120,
			counter ? `COUNTER ${damage}` : String(damage),
			counter ? '#ffd600' : '#ffffff',
			counter ? 40 : 32,
		)
		this.heroRetreat()
	}

	private onGoblinHit(damage: number): void {
		this.endTelegraph()
		this.goblinRetreat()
		this.goblin.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
			if (this.sim.fighters.p2.hp > 0) this.goblin.play('gob-idle')
		})
		this.player.play('hero-hit')
		this.player.setTint(0xff6666)
		this.time.delayedCall(300, () => this.player.clearTint())
		this.player.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
			if (this.sim.fighters.p1.hp > 0)
				this.player.stop().setTexture('avatar_run', 3)
		})
		this.juice.hitstop(80)
		this.juice.shake(8, 240)
		this.juice.flash(0xff1744, 120)
		this.particles.burst(this.player.x + 30, this.player.y, 0xff5252, 16)
		this.play('hurt')
		this.floatText(
			this.player.x,
			this.player.y - 150,
			String(damage),
			'#ff5252',
			32,
		)
	}

	/**
	 * A parry that pays nothing: the attack was a punish, or you have been
	 * passive and leak chip damage through your guard.
	 */
	private onDeflect(chip: number): void {
		this.endTelegraph()
		this.goblinRetreat()
		this.juice.shake(3, 120)
		this.play('parry', 1.3)
		this.floatText(
			(this.player.x + this.goblin.x) / 2,
			this.groundY() - 320,
			chip > 0 ? `PASSIVE -${chip}` : 'DEFLECT',
			chip > 0 ? '#ff5252' : '#8fa3bd',
			32,
		)
	}

	private onParry(perfect: boolean): void {
		this.endTelegraph()
		this.goblin.play('gob-hit')
		this.tweens.add({
			targets: this.goblin,
			x: GOBLIN_HOME_X + 60,
			duration: 160,
			ease: 'Quad.easeOut',
		})
		this.goblin.setTint(0x80d8ff)
		this.juice.hitstop(110)
		this.juice.flash(0x80d8ff, 120)
		this.juice.shake(5, 180)
		this.particles.burst(
			this.goblin.x - 60,
			this.goblin.y,
			0x80d8ff,
			24,
			300,
		)
		this.play('parry')
		this.floatText(
			(this.player.x + this.goblin.x) / 2,
			this.groundY() - 320,
			perfect ? 'PERFECT PARRY!' : 'PARRY!',
			'#80d8ff',
			44,
		)
		// Stars over its head for the length of the counter window.
		this.dizzy?.destroy()
		this.dizzy = this.add
			.text(this.goblin.x, this.goblin.y - 150, '✦ ✦ ✦', {
				fontFamily: displayFont(),
				fontSize: '28px',
				color: '#ffd600',
			})
			.setOrigin(0.5)
			.setDepth(30)
		this.later(DUEL.parryStaggerMs, () => {
			this.dizzy?.destroy()
			this.dizzy = undefined
			this.goblin.clearTint()
			this.goblinRetreat()
			if (this.sim.fighters.p2.hp > 0) this.goblin.play('gob-idle')
		})
	}

	private onRoundOver(
		winner: 'p1' | 'p2' | null,
		reason: 'ko' | 'time',
	): void {
		this.endTelegraph()
		this.buffered = null
		this.phase = 'between'
		this.deck.resetAll()
		if (winner === 'p2') this.player.play('hero-death')
		if (winner === 'p1') this.goblin.play('gob-death')
		this.juice.slowMo(0.3, 700)
		const title = reason === 'ko' ? 'K.O.' : 'TIME'
		const sub =
			winner === null
				? 'DRAW'
				: winner === 'p1'
					? 'YOU TAKE THE ROUND'
					: 'GOBLIN TAKES THE ROUND'
		this.hud.announce(title, sub, DUEL.roundOverMs - 500, '#ff5252')
		this.later(DUEL.roundOverMs, () => {
			if (this.sim.phase === 'matchOver') return
			this.resetPoses()
			this.beginRoundIntro()
		})
	}

	private onMatchOver(won: boolean): void {
		this.won = won
		const unlocked = recordDuel(
			this.level.level,
			won,
			this.simNow,
			MAX_LEVEL,
			this.settings.assistLevel < 1,
		)
		const next = won && this.level.level < MAX_LEVEL
		const prompt = next
			? 'Enter: next level  ·  R: replay  ·  Esc: menu'
			: 'Enter: rematch  ·  Esc: menu'
		this.later(DUEL.roundOverMs, () => {
			this.phase = 'over'
			this.renderCards()
			this.hud.announce(
				won
					? this.level.level === MAX_LEVEL
						? 'CHAMPION'
						: 'VICTORY'
					: 'DEFEAT',
				unlocked
					? `LEVEL ${this.level.level + 1} UNLOCKED\n${prompt}`
					: prompt,
				0,
				won ? '#00e676' : '#ff5252',
			)
		})
	}

	// ------------------------------------------------------------------- juice

	private slash(x: number, y: number, move: MoveId): void {
		const g = this.add.graphics().setDepth(28)
		const color =
			move === 'special'
				? 0xffd600
				: move === 'heavy'
					? 0xffb300
					: 0xffffff
		const r = move === 'jab' ? 60 : move === 'heavy' ? 95 : 130
		g.lineStyle(move === 'jab' ? 6 : 10, color, 1)
		g.beginPath()
		g.arc(x, y, r, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(60))
		g.strokePath()
		g.setBlendMode(Phaser.BlendModes.ADD)
		this.tweens.add({
			targets: g,
			alpha: 0,
			duration: 220,
			onComplete: () => g.destroy(),
		})
	}

	private floatText(
		x: number,
		y: number,
		text: string,
		color: string,
		size = 24,
	): void {
		const t = this.add
			.text(x, y, text, {
				fontFamily: displayFont(),
				fontSize: `${size}px`,
				color,
				stroke: '#000000',
				strokeThickness: 5,
			})
			.setOrigin(0.5)
			.setDepth(50)
		this.tweens.add({
			targets: t,
			y: y - 50,
			alpha: 0,
			duration: 800,
			ease: 'Quad.easeOut',
			onComplete: () => t.destroy(),
		})
	}

	// ------------------------------------------------------------------- audio

	private setupAudio(): void {
		const s = this.settings
		if (this.cache.audio.exists('bgMusic')) {
			this.music = this.sound.add('bgMusic', {
				volume: s.muted ? 0 : s.musicVolume * 0.7,
				loop: true,
			})
			if (!s.muted) this.music.play()
		}
		const map: Record<string, [string, number]> = {
			type: ['clickSound', 0.2],
			error: ['monsterHitSound', 0.25],
			hit: ['monsterHitSound', 0.7],
			hurt: ['monsterHitSound', 0.7],
			parry: ['speedUpSound', 0.6],
			danger: ['pauseSound', 0.35],
			go: ['speedUpSound', 0.5],
			pause: ['pauseSound', 0.5],
			unpause: ['unpauseSound', 0.5],
		}
		for (const [name, [key, gain]] of Object.entries(map)) {
			if (!this.cache.audio.exists(key)) continue
			this.sfx[name] = this.sound.add(key, {
				volume: s.muted ? 0 : s.sfxVolume * gain,
			})
		}
	}

	private play(name: string, rate = 1): void {
		const s = this.sfx[name]
		if (!s || this.settings.muted) return
		if (s instanceof Phaser.Sound.WebAudioSound) s.setRate(rate)
		s.play()
	}

	// ------------------------------------------------------------------- misc

	private togglePause(): void {
		if (this.phase === 'over') return
		this.paused = !this.paused
		this.pauseText.setVisible(this.paused)
		this.pauseShade.setVisible(this.paused)
		this.renderCards()
		if (this.paused) {
			this.tweens.pauseAll()
			this.anims.pauseAll()
			this.time.paused = true
			this.play('pause')
		} else {
			this.tweens.resumeAll()
			this.anims.resumeAll()
			this.time.paused = false
			this.play('unpause')
		}
	}

	private onAutoPause(): void {
		if (!this.paused && this.phase !== 'over') this.togglePause()
	}

	private toMenu(): void {
		window.dispatchEvent(new CustomEvent('returnToMenu'))
	}

	/** Scene-time delayed call that is cleaned up on shutdown. */
	private later(ms: number, fn: () => void): void {
		this.timers.push(this.time.delayedCall(ms, fn))
	}

	shutdown(): void {
		this.game.events.off('yk-autopause', this.onAutoPause, this)
		for (const t of this.timers) t.remove(false)
		this.timers = []
		this.music?.stop()
		for (const s of Object.values(this.sfx)) s.destroy()
		this.music?.destroy()
		this.juice.setEnabled(false)
		this.tweens.resumeAll()
		this.anims.resumeAll()
		this.time.paused = false
		for (const c of this.cards.values()) c.destroy()
		this.cards.clear()
		this.hud.destroy()
		this.input.keyboard?.removeAllListeners()
	}
}
