import Phaser from 'phaser'
import { WordBank } from '../systems/wordBank'
import { Juice } from '../systems/Juice'
import { Particles } from '../systems/Hud'
import { displayFont } from '../systems/font'
import { loadData, recordDuel, type Settings } from '../systems/persistence'
import type { DuelSim } from '../systems/duel/duelSim'
import { DuelMatch, type MatchEvent } from '../systems/duel/duelMatch'
import { FIGHTERS } from '../systems/duel/fighters'
import { TypistBot } from '../systems/duel/typistBot'
import { mixSeed, randomSeed, seededRng } from '../systems/duel/rng'
import {
	MAX_LEVEL,
	clampLevel,
	duelLevel,
	type DuelLevel,
} from '../systems/duel/duelLevels'
import {
	MOVE_SLOTS,
	type PlayerDeck,
	type Slot,
} from '../systems/duel/playerDeck'
import { CardView } from '../systems/duel/CardView'
import { DuelHud } from '../systems/duel/DuelHud'
import { DUEL, type MoveId, type Side } from '../systems/duel/duelTuning'
import { MUSIC, SFX } from '../systems/sfx'
import { BACKDROP_LAYERS, BACKDROP_SCALE, FLOOR_Y } from '../systems/backdrop'

type Phase = 'intro' | 'fight' | 'between' | 'over'

const PLAYER_HOME_X = 440
const GOBLIN_HOME_X = 840
const PLAYER_SCALE = 3
const GOBLIN_SCALE = 3
/** Goblin attack sheet runs at 16fps; the spear lands on frame 6. */
const GOBLIN_ATTACK_FPS = 16
const GOBLIN_STRIKE_LEAD_MS = (6 / GOBLIN_ATTACK_FPS) * 1000
/** The hero holds through most of its windup and dashes in over this long. */
const HERO_DASH_MAX_MS = 180
/** Hero Knight swing sheets run at 14fps; the sword connects on frame 3. */
const HERO_ATTACK_FPS = 14
const HERO_STRIKE_FRAME = 3
/** The guard pose (Take Hit, tinted blue) is held for this long. */
const HERO_GUARD_MS = 260
/**
 * Where the feet sit below the centre of a frame, measured from each sheet's
 * alpha bounds: Hero Knight at row 114 of 180, goblin at row 101 of 150.
 */
const PLAYER_FEET_PX = 24
const GOBLIN_FEET_PX = 26

const CARD_STYLE: Record<Slot, { accent: number; fontSize: number }> = {
	jab: { accent: 0x64ffda, fontSize: 30 },
	heavy: { accent: 0xffb300, fontSize: 30 },
	special: { accent: 0xffd600, fontSize: 30 },
	block: { accent: 0xff5252, fontSize: 44 },
}

/**
 * The goblin's attack in flight, from the moment it starts to its landing.
 * Only one can be in flight at a time, so a single slot is enough.
 */
interface Swing {
	move: MoveId
	armored: boolean
	/** A block word is offered, so the windup gets the full telegraph. */
	parryable: boolean
	landsAt: number
	striking: boolean
}

/** The block word on the player's screen, and its timer. */
interface BlockOffer {
	landsAt: number
	offeredAt: number
}

/**
 * Prototype duel: you vs the goblin, best of three, on a level ladder.
 *
 * Both fighters play by the same rules. `DuelMatch` owns the referee, both
 * decks and the block offers; the goblin is a `TypistBot` pressing keys
 * through that same path a human uses. This scene only feeds input in and
 * draws the events that come out.
 *
 * The match runs on its own clock (`simNow`), which advances in real time and
 * stops only for pause. Hitstop and slow-mo are purely visual: when they also
 * slowed the match, every hit you landed froze the goblin's windup while your
 * keystrokes kept counting, which was free typing time.
 */
export default class Duel extends Phaser.Scene {
	private level!: DuelLevel
	/** One number both players would share online; it fixes every word. */
	private seed = 0
	private settings!: Settings
	private match!: DuelMatch
	private bot!: TypistBot
	private hud!: DuelHud
	private juice!: Juice
	private particles!: Particles

	private player!: Phaser.GameObjects.Sprite
	private goblin!: Phaser.GameObjects.Sprite
	private cards = new Map<Slot, CardView>()
	/** The bot's live word above the goblin, so you can read what it types. */
	private oppTyping?: CardView
	private dizzy?: Phaser.GameObjects.Text

	private phase: Phase = 'intro'
	private paused = false
	private simNow = 0
	private clockMs: number = DUEL.roundTimeMs
	private swing: Swing | null = null
	/** The hero's swing in flight, from the dash until it lands or is stopped. */
	private heroStrike: {
		move: MoveId
		landsAt: number
		striking: boolean
	} | null = null
	private blockOffer: BlockOffer | null = null
	/**
	 * The player just finished a block word. If no `parried` follows in the
	 * same batch, the parry came too late.
	 */
	private awaitingParry = false
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

	/** The player's deck, read-only from here: the match owns every change. */
	private get deck(): PlayerDeck {
		return this.match.decks.p1
	}

	private get sim(): DuelSim {
		return this.match.sim
	}

	init(): void {
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)
		this.phase = 'intro'
		this.paused = false
		this.simNow = 0
		this.clockMs = DUEL.roundTimeMs
		this.swing = null
		this.heroStrike = null
		this.blockOffer = null
		this.awaitingParry = false
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
		this.match = new DuelMatch({
			seed: this.seed,
			fighters: { p1: FIGHTERS.hero, p2: FIGHTERS.goblin },
			pick: (tier, reject, rng) => bank.pickFromTier(tier, reject, rng),
			maxHp: { p2: this.level.goblinHp },
			// Assist below 1 stretches every goblin windup, so the floor keeps
			// a tiny setting from making the windup absurdly long.
			windupScale: {
				p2:
					this.level.windupScale /
					Math.max(0.5, this.settings.assistLevel),
			},
		})
		// Same stream the old goblin brain used, so a seed fixes the bot's rolls.
		this.bot = new TypistBot(
			'p2',
			this.level.bot,
			seededRng(mixSeed(this.seed, 0xb0b)),
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
		BACKDROP_LAYERS.forEach(({ key }, i) => {
			if (this.textures.exists(key))
				this.add
					.tileSprite(0, 0, width, height, key)
					.setOrigin(0)
					.setTileScale(BACKDROP_SCALE)
					.setDepth(-20 + i)
		})
		// Darken the backdrop so the fighters and cards own the frame. Sits
		// above every layer (-20 to -13) and below the fighters (10).
		this.add
			.rectangle(0, 0, width, height, 0x000000, 0.35)
			.setOrigin(0)
			.setDepth(-12)
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
		anim('hero-idle', 'avatar_idle', 10, 10, -1)
		anim('hero-attack1', 'avatar_attack1', 6, HERO_ATTACK_FPS)
		anim('hero-attack2', 'avatar_attack2', 6, HERO_ATTACK_FPS)
		anim('hero-hit', 'avatar_hit', 3, 12)
		anim('hero-death', 'avatar_death', 10, 10)
		anim('gob-idle', 'monster_Goblin_idle', 3, 11, -1)
		anim('gob-attack', 'monster_Goblin_attack', 7, GOBLIN_ATTACK_FPS)
		anim('gob-hit', 'monster_Goblin_hit', 3, 12)
		anim('gob-death', 'monster_Goblin_death', 3, 8)

		this.player = this.add
			.sprite(
				PLAYER_HOME_X,
				FLOOR_Y - PLAYER_FEET_PX * PLAYER_SCALE,
				'avatar_idle',
				0,
			)
			.setScale(PLAYER_SCALE)
			.setDepth(10)
		this.player.play('hero-idle')

		this.goblin = this.add
			.sprite(GOBLIN_HOME_X, this.goblinHomeY(), 'monster_Goblin_idle', 0)
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
			const move = FIGHTERS.hero.moves[slot]
			const cost =
				move.meterCost >= DUEL.maxMeter
					? 'FULL METER'
					: `${move.meterCost} METER`
			const caption =
				move.meterCost > 0
					? `${move.label} · ${Math.round(move.damage)} · ${cost}`
					: `${move.label} · ${Math.round(move.damage)}`
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
		this.oppTyping = new CardView(
			this,
			GOBLIN_HOME_X,
			this.groundY() - 240,
			{
				fontSize: 22,
				accent: 0xff5252,
				caption: 'GOBLIN IS TYPING',
			},
		)
		this.oppTyping.setVisible(false)
		this.renderCards()
	}

	private renderCards(): void {
		const meter = this.sim.fighters.p1.meter
		const deck = this.deck
		const active = deck.active
		for (const [slot, view] of this.cards) {
			const card = deck.card(slot)
			if (!card) {
				view.setVisible(false)
				continue
			}
			view.setVisible(this.phase === 'fight' && !this.paused)
			view.render(
				card,
				active === slot,
				!deck.isUnlocked(slot, meter),
				active !== null && active !== slot,
			)
		}
		const offer = this.blockOffer
		this.cards
			.get('block')
			?.setTimer(
				offer
					? (offer.landsAt - this.simNow) /
							Math.max(1, offer.landsAt - offer.offeredAt)
					: null,
			)
	}

	/**
	 * Show the goblin's live word above it, with typed letters lit, so the
	 * player can read what a human opponent would be typing.
	 */
	private renderOpponentTyping(): void {
		const typing = this.oppTyping
		if (!typing) return
		const deck = this.match.decks.p2
		const card = deck.active ? deck.card(deck.active) : undefined
		const show =
			card !== undefined && this.phase === 'fight' && !this.paused
		typing.setVisible(show)
		if (!card) return
		typing.container.setPosition(this.goblin.x, this.goblin.y - 175)
		typing.render(card, true, false, false)
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
				this.match.backspace('p1', this.simNow)
				this.renderCards()
				return
			}
			if (!/^[a-zA-Z]$/.test(e.key)) return
			e.preventDefault()
			this.onLetter(e.key)
		})
	}

	/**
	 * Hand a player letter to the match and play the feedback for what it
	 * reports. Whether a key parries, buffers or does nothing is the match's
	 * call, not the scene's.
	 */
	private onLetter(ch: string): void {
		const r = this.match.key('p1', ch, this.simNow)
		if (r) {
			switch (r.kind) {
				case 'progress':
					this.play('type', 1 + Math.random() * 0.1)
					break
				case 'mistake':
					this.play('error')
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
					break
			}
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

	// --------------------------------------------------------------- round flow

	private beginRoundIntro(): void {
		this.phase = 'intro'
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
			this.match.startRound(this.simNow)
			this.clockMs = DUEL.roundTimeMs
			this.bot.reset(this.simNow)
			this.phase = 'fight'
			this.resetPoses()
			this.renderCards()
		})
	}

	private resetPoses(): void {
		this.tweens.killTweensOf([this.goblin])
		this.goblin
			.setPosition(GOBLIN_HOME_X, this.goblinHomeY())
			.clearTint()
			.setAlpha(1)
		this.goblin.play('gob-idle')
		this.heroStrike = null
		this.player.setX(PLAYER_HOME_X).setAlpha(1)
		this.restHero()
		this.dizzy?.destroy()
		this.dizzy = undefined
	}

	// ---------------------------------------------------------------- the loop

	update(_time: number, delta: number): void {
		this.juice.update(delta)
		if (this.paused) return
		this.simNow += delta

		// Step the match and the bot together, then draw what came out. The
		// goblin's swing is started after the drain, so an attack that began
		// this frame is swung at once.
		if (this.phase === 'fight')
			this.match.step(this.simNow, { p2: this.bot })
		for (const e of this.match.drain()) this.onEvent(e)
		if (this.phase === 'fight') {
			this.driveGoblinStrike()
			this.driveHeroStrike()
		}

		// Hold the clock between rounds instead of reading 0.
		if (this.phase === 'fight')
			this.clockMs = this.sim.timeLeftMs(this.simNow)
		this.hud.update(this.sim.fighters, this.clockMs, delta)
		this.renderCards()
		this.renderOpponentTyping()
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

	/**
	 * Swing the goblin so its spear connects when the match lands the attack.
	 * A jab's windup is shorter than the swing itself, so its swing starts at
	 * once and the tween is timed to land on `landsAt`.
	 */
	private driveGoblinStrike(): void {
		const s = this.swing
		if (!s || s.striking) return
		if (this.simNow < s.landsAt - GOBLIN_STRIKE_LEAD_MS) return
		s.striking = true
		this.goblin.clearTint()
		this.goblin.play('gob-attack')
		this.tweens.add({
			targets: this.goblin,
			x: PLAYER_HOME_X + 170,
			duration: Math.max(60, s.landsAt - this.simNow),
			ease: 'Quad.easeIn',
		})
	}

	/**
	 * Swing the hero so the sword connects at `landsAt`. The swing starts a
	 * fixed lead before the hit, the goblin's approach, and its frame rate is
	 * set so the strike frame lands on the hit even when the windup is short.
	 */
	private driveHeroStrike(): void {
		const s = this.heroStrike
		if (!s || s.striking) return
		const lead = (HERO_STRIKE_FRAME / HERO_ATTACK_FPS) * 1000
		if (this.simNow < s.landsAt - lead) return
		s.striking = true
		const left = Math.max(1, s.landsAt - this.simNow)
		this.player.play({
			key: s.move === 'jab' ? 'hero-attack1' : 'hero-attack2',
			frameRate: Math.min(60, (HERO_STRIKE_FRAME * 1000) / left),
		})
		this.play('whoosh')
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

	/** The goblin's attack is over: it landed, was parried or was interrupted. */
	private endSwing(): void {
		this.swing = null
		this.goblin.clearTint()
		this.tweens.killTweensOf(this.goblin)
	}

	/** Remove the player's block card, and forget its timer. */
	private hideBlock(): void {
		this.blockOffer = null
		this.cards.get('block')?.setVisible(false)
	}

	// ----------------------------------------------------------------- events

	private onEvent(e: MatchEvent): void {
		switch (e.t) {
			case 'key':
				if (
					e.side === 'p1' &&
					e.result.kind === 'complete' &&
					e.result.slot === 'block'
				)
					this.awaitingParry = true
				break
			case 'blockOffered':
				if (e.side === 'p1') this.showBlock(e.landsAt, e.at)
				break
			case 'blockCleared':
				if (e.side === 'p1') {
					// The word was typed too late: the attack resolved first.
					if (this.awaitingParry)
						this.floatText(
							PLAYER_HOME_X,
							this.groundY() - 260,
							'TOO LATE',
							'#8fa3bd',
						)
					this.awaitingParry = false
					this.hideBlock()
				}
				break
			case 'attackStarted':
				if (e.side === 'p1') this.heroDash(e.move, e.landsAt)
				else
					this.goblinWindup(
						e.move,
						e.landsAt,
						e.blockTier !== null,
						e.armored,
					)
				break
			case 'hit':
				if (e.attacker === 'p1')
					this.onHeroHit(e.move, e.damage, e.counter)
				else this.onGoblinHit(e.damage, e.counter)
				break
			case 'parried':
				if (e.defender === 'p1') this.awaitingParry = false
				if (!e.rewarded) this.onDeflect(e.defender, e.chip)
				else if (e.defender === 'p1') this.onParry(e.perfect)
				else this.onHeroParried(e.perfect)
				break
			case 'interrupted':
				if (e.side === 'p2') {
					this.endSwing()
					this.goblinRetreat()
					this.floatText(
						GOBLIN_HOME_X,
						this.groundY() - 300,
						'INTERRUPTED!',
						'#ffb300',
					)
				} else {
					this.heroRetreat()
					this.floatText(
						PLAYER_HOME_X,
						this.groundY() - 300,
						'INTERRUPTED!',
						'#ffb300',
					)
				}
				break
			case 'poison': {
				const s = this.spriteOf(e.side)
				this.floatText(s.x, s.y - 120, `-${e.damage}`, '#69f0ae', 30)
				break
			}
			case 'drain': {
				const s = this.spriteOf(e.from)
				this.floatText(
					s.x,
					s.y - 90,
					`-${e.amount} METER`,
					'#b388ff',
					22,
				)
				break
			}
			case 'roundOver':
				this.onRoundOver(e.winner, e.reason)
				break
			case 'matchOver':
				this.onMatchOver(e.winner === 'p1')
				break
		}
		this.renderCards()
	}

	private spriteOf(side: Side): Phaser.GameObjects.Sprite {
		return side === 'p1' ? this.player : this.goblin
	}

	/**
	 * The goblin winds up. A parryable swing gets the full telegraph: a red
	 * tint, a step back, a warning. A jab is just a swing, with no warning.
	 */
	private goblinWindup(
		move: MoveId,
		landsAt: number,
		parryable: boolean,
		armored: boolean,
	): void {
		this.swing = { move, armored, parryable, landsAt, striking: false }
		if (!parryable) return
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

	/** The block card for the goblin's incoming swing. */
	private showBlock(landsAt: number, offeredAt: number): void {
		// The match emits the attack just before its block offer, so the swing
		// it describes is still the current one.
		const s = this.swing
		const move = s ? FIGHTERS.goblin.moves[s.move] : null
		const caption = move
			? `PARRY ${move.label} · ${Math.round(move.damage)}${s?.armored ? ' · ARMORED' : ''}`
			: 'PARRY!'
		this.cards.get('block')?.setCaption(caption)
		this.blockOffer = { landsAt, offeredAt }
		this.awaitingParry = false
	}

	/**
	 * The hero's attack is in flight. It holds through most of the windup and
	 * dashes in over the last stretch, so the approach reads as the strike.
	 */
	private heroDash(move: MoveId, landsAt: number): void {
		const left = Math.max(0, landsAt - this.simNow)
		const dash = Math.min(HERO_DASH_MAX_MS, Math.max(60, left))
		// The swing animation starts on its own timer (driveHeroStrike); the
		// dash only moves the body in over the last stretch.
		this.heroStrike = { move, landsAt, striking: false }
		this.tweens.killTweensOf(this.player)
		this.player.setScale(PLAYER_SCALE)
		this.tweens.add({
			targets: this.player,
			x: this.goblin.x - 200,
			duration: dash,
			delay: Math.max(0, left - dash),
			ease: 'Quad.easeIn',
		})
		if (move === 'special') {
			this.juice.slowMo(0.35, 260)
			this.player.setTint(0xffd600)
		}
	}

	private heroRetreat(): void {
		this.heroStrike = null
		this.tweens.killTweensOf(this.player)
		this.tweens.add({
			targets: this.player,
			x: PLAYER_HOME_X,
			duration: 240,
			delay: 80,
			ease: 'Quad.easeOut',
			onComplete: () => this.restHero(),
		})
	}

	/** Back to the stance. Skipped while a swing or a guard owns the sprite. */
	private restHero(): void {
		if (this.heroStrike || this.sim.fighters.p1.hp <= 0) return
		this.player.clearTint()
		this.player.play('hero-idle', true)
	}

	/** The hero's guard: the Take Hit sheet held on frame 0, tinted blue. */
	private blockPose(ms: number): void {
		this.heroStrike = null
		this.tweens.killTweensOf(this.player)
		this.player.stop().setTexture('avatar_hit', 0).setTint(0x80d8ff)
		this.later(ms, () => this.restHero())
	}

	private goblinHomeY(): number {
		return FLOOR_Y - GOBLIN_FEET_PX * GOBLIN_SCALE
	}

	private onHeroHit(move: MoveId, damage: number, counter: boolean): void {
		const heavy = move !== 'jab'
		this.slash(this.goblin.x - 30, this.goblin.y + 20, move)
		this.goblin.play('gob-hit')
		this.goblin.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
			if (this.sim.fighters.p2.hp > 0 && !this.swing?.striking) {
				this.goblin.play('gob-idle')
			}
		})
		// Knock back, then return home unless mid-strike.
		if (!this.swing) {
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
		this.play(heavy ? 'hitHeavy' : 'hitLight')
		this.floatText(
			this.goblin.x,
			this.goblin.y - 120,
			counter ? `COUNTER ${damage}` : String(damage),
			counter ? '#ffd600' : '#ffffff',
			counter ? 40 : 32,
		)
		this.heroRetreat()
	}

	private onGoblinHit(damage: number, counter: boolean): void {
		this.endSwing()
		this.goblinRetreat()
		this.goblin.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
			if (this.sim.fighters.p2.hp > 0) this.goblin.play('gob-idle')
		})
		this.heroStrike = null
		this.player.play('hero-hit')
		this.player.setTint(0xff6666)
		this.time.delayedCall(300, () => this.player.clearTint())
		this.player.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
			this.restHero(),
		)
		this.juice.hitstop(80)
		this.juice.shake(8, 240)
		this.juice.flash(0xff1744, 120)
		this.particles.burst(this.player.x + 30, this.player.y, 0xff5252, 16)
		this.play('hitHeavy')
		this.floatText(
			this.player.x,
			this.player.y - 150,
			counter ? `COUNTER ${damage}` : String(damage),
			counter ? '#ffd600' : '#ff5252',
			counter ? 40 : 32,
		)
	}

	/**
	 * A parry that pays nothing: the attack was a punish, or the defender has
	 * been passive and leaks chip damage through its guard.
	 */
	private onDeflect(defender: Side, chip: number): void {
		if (defender === 'p1') {
			this.endSwing()
			this.goblinRetreat()
			this.blockPose(HERO_GUARD_MS)
		} else {
			// The goblin deflected your attack, so your dash is over.
			this.heroRetreat()
		}
		this.juice.shake(3, 120)
		this.play('parry')
		this.floatText(
			(this.player.x + this.goblin.x) / 2,
			this.groundY() - 320,
			chip > 0 ? `PASSIVE -${chip}` : 'DEFLECT',
			chip > 0 ? '#ff5252' : '#8fa3bd',
			32,
		)
	}

	/** You parried the goblin's swing: it is staggered and open to counters. */
	private onParry(perfect: boolean): void {
		this.endSwing()
		this.blockPose(HERO_GUARD_MS)
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

	/** The goblin parried your attack: you are staggered and open to counters. */
	private onHeroParried(perfect: boolean): void {
		this.heroRetreat()
		this.juice.hitstop(110)
		this.juice.flash(0xff8a80, 120)
		this.juice.shake(6, 200)
		this.particles.burst(
			this.player.x + 30,
			this.player.y,
			0xff8a80,
			24,
			300,
		)
		this.play('hitHeavy')
		this.floatText(
			(this.player.x + this.goblin.x) / 2,
			this.groundY() - 320,
			perfect ? 'PERFECT PARRY!' : 'PARRIED!',
			'#ff8a80',
			44,
		)
	}

	private onRoundOver(winner: Side | null, reason: 'ko' | 'time'): void {
		this.endSwing()
		this.hideBlock()
		this.phase = 'between'
		if (winner === 'p2') this.player.play('hero-death')
		if (winner === 'p1') this.goblin.play('gob-death')
		if (reason === 'ko') this.play('ko')
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
		if (this.cache.audio.exists(MUSIC.fight.key)) {
			this.music = this.sound.add(MUSIC.fight.key, {
				volume: s.muted ? 0 : s.musicVolume * 0.7,
				loop: true,
			})
			if (!s.muted) this.music.play()
		}
		// Logical event -> sound key, with the gain each one is mixed at.
		const map: Record<string, [string, number]> = {
			type: [SFX.keyType.key, 0.2],
			error: [SFX.mistake.key, 0.25],
			hitLight: [SFX.hitLight.key, 0.7],
			hitHeavy: [SFX.hitHeavy.key, 0.8],
			whoosh: [SFX.whoosh.key, 0.4],
			parry: [SFX.parry.key, 0.6],
			danger: [SFX.danger.key, 0.35],
			go: [SFX.roundStart.key, 0.5],
			ko: [SFX.ko.key, 0.6],
			pause: [SFX.pause.key, 0.5],
			unpause: [SFX.unpause.key, 0.5],
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
		this.renderOpponentTyping()
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
		this.oppTyping?.destroy()
		this.oppTyping = undefined
		this.hud.destroy()
		this.input.keyboard?.removeAllListeners()
	}
}
