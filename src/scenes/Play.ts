import Phaser from 'phaser'
import { TypingEngine } from '../systems/typingEngine'
import { RunState } from '../systems/runState'
import { WordBank } from '../systems/wordBank'
import { Juice } from '../systems/Juice'
import { Hud, Particles } from '../systems/Hud'
import { WordDisplay } from '../systems/WordDisplay'
import { Monster, MONSTER_TYPES, type MonsterType } from '../systems/Monster'
import { bodyFont, displayFont } from '../systems/font'
import { SettingsModal } from '../systems/SettingsModal'
import { GameOverModal, type GameOverSummary } from '../systems/GameOverModal'
import {
	claimMilestone,
	loadData,
	saveRun,
	type Settings,
} from '../systems/persistence'
import {
	DIFFICULTIES,
	TUNING,
	type DifficultyId,
	type DifficultyProfile,
} from '../systems/tuning'

type Phase = 'countdown' | 'running' | 'dead'

interface Box {
	x: number
	y: number
	w: number
	h: number
}

/** Combo milestones that earn a banner. */
const MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500]

/** Ceiling on simultaneous death animations, so kills don't stack up. */
const MAX_CORPSES = 3

const AVATAR_FRAME = 180
/** Parallax layers, far to near. */
const BG_LAYERS = [11, 8, 5, 3, 2]

function overlaps(a: Box, b: Box): boolean {
	return (
		a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
	)
}

export default class Play extends Phaser.Scene {
	private difficulty!: DifficultyProfile
	private state!: RunState
	private bank!: WordBank
	private engine!: TypingEngine
	private juice!: Juice
	private particles!: Particles
	private hud!: Hud
	private display!: WordDisplay
	private settings!: Settings

	private avatar!: Phaser.GameObjects.Sprite
	private monster: Monster | null = null
	private vignette!: Phaser.GameObjects.Image
	private powerUp?: Phaser.GameObjects.Image
	private powerUpKind: 'ice' | 'bomb' | null = null
	private transient: Phaser.GameObjects.GameObject[] = []

	private monsterSpeed = 0
	private monsterHomeX = 0
	/** Distance covered so far this word, independent of knockback. */
	private travel = 0
	private knockback = 0

	private phase: Phase = 'countdown'
	private invulnUntil = 0
	private frozenUntil = 0
	private spikeUntil = 0
	private dangerSounded = false

	private paused = false
	private settingsOpen = false
	private audioUnlocked = false
	private transientTimers: Phaser.Time.TimerEvent[] = []

	/** Coach line, shown only for the first few words of a run. */
	private tipText!: Phaser.GameObjects.Text
	/** Live "time bought back" readout for the current word. */
	private timeBankText!: Phaser.GameObjects.Text
	private countdownLabel?: Phaser.GameObjects.Text

	/** How many words into the run we are still showing hints. */
	private static readonly HINT_WORDS = 3

	private backgroundLayers: Phaser.GameObjects.TileSprite[] = []
	private groundLayers: Phaser.GameObjects.TileSprite[] = []

	/**
	 * `sound.add` hands back NoAudioSound / HTML5AudioSound / WebAudioSound
	 * depending on what the browser supports, and only WebAudioSound exposes
	 * setVolume / setRate. Everything is stored as BaseSound and mutated through
	 * these guards, so the game degrades to silence instead of throwing.
	 */
	private bgMusic?: Phaser.Sound.BaseSound
	private runLoop?: Phaser.Sound.BaseSound
	private sfx: Record<string, Phaser.Sound.BaseSound> = {}

	constructor() {
		super('Play')
	}

	// ------------------------------------------------------------------ assets

	preload(): void {
		this.load.image('ice', 'assets/ice.png')
		this.load.image('bomb', 'assets/bomb.png')
		this.load.script('words', 'data/words/words.js')

		// The old build drew 14 full-screen layers every frame. Five is visually
		// equivalent and roughly a third of the fill cost.
		for (const n of BG_LAYERS) {
			this.load.image(
				`layer_${String(n).padStart(4, '0')}`,
				`assets/background/Layer_${String(n).padStart(4, '0')}.png`,
			)
		}
		this.load.image('ground_back', 'assets/background/Layer_0001.png')
		this.load.image('ground_front', 'assets/background/Layer_0000.png')

		this.load.spritesheet('avatar_run', 'assets/character/Run.png', {
			frameWidth: AVATAR_FRAME,
			frameHeight: AVATAR_FRAME,
		})

		for (const type of MONSTER_TYPES) {
			const dir = `assets/monsters/${type}`
			this.load.spritesheet(`monster_${type}_run`, `${dir}/Run.png`, {
				frameWidth: 150,
				frameHeight: 150,
			})
			this.load.spritesheet(`monster_${type}_death`, `${dir}/Death.png`, {
				frameWidth: 150,
				frameHeight: 150,
			})
			this.load.spritesheet(
				`monster_${type}_hit`,
				`${dir}/Take Hit.png`,
				{
					frameWidth: 150,
					frameHeight: 150,
				},
			)
		}
	}

	create(): void {
		const requested =
			(this.registry.get('difficulty') as DifficultyId) ?? 'medium'
		this.difficulty = DIFFICULTIES[requested] ?? DIFFICULTIES.medium
		this.registry.set('difficulty', this.difficulty.id)

		this.settings = loadData().settings
		this.bank = new WordBank(window.THESAURUS)
		// assistLevel was persisted and shown in the settings modal but never
		// read by gameplay, so the accessibility knob did nothing. It is passed
		// in now and applied in RunState.speedFor.
		this.state = new RunState(
			this.difficulty,
			this.time.now,
			this.settings.assistLevel,
		)
		this.juice = new Juice(this, this.settings.screenShake)
		this.particles = new Particles(this)

		this.cameras.main.setBackgroundColor('#0a0f16')
		this.buildParallax()
		this.buildAvatar()
		this.buildVignette()

		this.display = new WordDisplay(this)
		this.hud = new Hud(this, this.difficulty)
		// The tips are prose the player has to read mid-run, so they follow the
		// accessibility font rather than the pixel face.
		this.tipText = this.add
			.text(this.scale.width / 2, this.scale.height * 0.25 + 58, '', {
				fontFamily: bodyFont(),
				fontSize: '18px',
				color: '#8fa3bd',
			})
			.setOrigin(0.5)
			.setDepth(20)

		// Sits just under the word plate. This is the feedback that makes the
		// shove legible as a resource rather than an invisible stat.
		this.timeBankText = this.add
			.text(this.scale.width / 2, this.scale.height * 0.25 + 86, '', {
				fontFamily: displayFont(),
				fontSize: '16px',
				color: '#64ffda',
			})
			.setOrigin(0.5)
			.setDepth(20)
			.setVisible(false)

		this.setupAudio()
		this.bindInput()
		this.onResize()
		this.scale.on('resize', this.onResize, this)
		// Alt-tabbing away should pause, not cost a life.
		this.game.events.on('yk-autopause', this.onAutoPause, this)

		this.dealWord(true)
		this.startCountdown()

		// Dev-only handle so the run can be driven headlessly in tests. Stripped
		// from production builds by Vite's dead-code elimination.
		if (import.meta.env.DEV) {
			;(window as unknown as Record<string, unknown>).__play = this
		}
	}

	/** Current word, exposed for automated play-throughs. */
	get debugWord(): string {
		return this.engine?.getWord() ?? ''
	}

	// ---------------------------------------------------------------- countdown

	private startCountdown(): void {
		this.phase = 'countdown'
		const label = this.add
			.text(this.scale.width / 2, this.scale.height * 0.25, '', {
				fontFamily: 'Retro Font',
				fontSize: '72px',
				color: '#ffffff',
			})
			.setOrigin(0.5)
			.setDepth(45)
		this.countdownLabel = label

		const step = (text: string, next: () => void) => {
			label.setText(text).setScale(1.7).setAlpha(1)
			this.tweens.add({
				targets: label,
				scale: 1,
				alpha: 0.2,
				duration: 620,
				ease: 'Quad.easeOut',
				onComplete: next,
			})
		}

		step('3', () =>
			step('2', () =>
				step('1', () => {
					// Reuse the label for GO! — destroying it here and then
					// calling setText on it threw inside Phaser's text renderer.
					label.setText('GO!')
					this.countdownLabel = undefined
					this.phase = 'running'
					// Clock starts at GO, so the countdown is not billed as play.
					this.state.startClock(this.time.now)
					this.juice.shake(0.5, 200)
					this.playSfx('levelup')
					this.tweens.add({
						targets: label,
						scale: 2.4,
						alpha: 0,
						duration: 400,
						onComplete: () => label.destroy(),
					})
					this.showBanner(
						`${this.difficulty.label.toUpperCase()}  ·  ${this.state.lives} LIVES`,
						this.difficulty.color,
					)
				}),
			),
		)
	}

	// -------------------------------------------------------------------- words

	private dealWord(first = false): void {
		const word = this.bank.pick(this.state.wordsCompleted)
		this.engine = new TypingEngine(word)
		this.display.setWord(word)
		this.display.render(this.engine)

		this.knockback = 0
		this.travel = 0
		this.scrollX = 0
		this.monsterHomeX = this.scale.width + 100
		this.monsterSpeed = this.state.speedFor(word)
		this.dangerSounded = false

		this.spawnMonster(this.pickMonsterType())
		// Coach the first few words only; after that the tip line is noise.
		if (first) this.setTip('Type the word to strike')
		else if (this.state.wordsCompleted < Play.HINT_WORDS) {
			this.setTip('Correct keys shove it back')
		} else {
			this.setTip('')
		}
		if (!first) this.display.animateIn()
	}

	private pickMonsterType(): MonsterType {
		return MONSTER_TYPES[Math.floor(Math.random() * MONSTER_TYPES.length)]
	}

	private spawnMonster(type: MonsterType): void {
		this.monster?.destroy()
		const m = new Monster(
			this,
			this.monsterHomeX,
			this.groundY() - 10,
			type,
		)
		this.add.existing(m)
		this.monster = m
	}

	// -------------------------------------------------------------------- input

	private bindInput(): void {
		const kb = this.input.keyboard
		if (!kb) return

		kb.on('keydown', (e: KeyboardEvent) => {
			this.unlockAudio()
			if (this.phase !== 'running' || this.paused || this.settingsOpen)
				return

			if (e.key === 'Backspace') {
				e.preventDefault()
				if (this.engine.backspace()) this.display.render(this.engine)
				return
			}
			if (!/^[a-zA-Z]$/.test(e.key)) return
			e.preventDefault()
			this.handleKeystroke(e.key)
		})

		// Escape only. A letter hotkey is not an option here: every letter is a
		// game input, so binding P to pause meant typing words like "PIG" or
		// "PEARS" threw up the menu mid-word.
		kb.on('keydown-ESC', () => this.togglePause())

		// Browsers require a gesture before audio can start.
		this.input.once('pointerdown', () => this.unlockAudio())
		window.addEventListener('pointerdown', () => this.unlockAudio(), {
			once: true,
		})
	}

	private unlockAudio(): void {
		if (this.audioUnlocked) return
		this.audioUnlocked = true
		try {
			this.sound.unlock()
		} catch {
			// Non-fatal: the run just stays silent.
		}
	}

	private handleKeystroke(key: string): void {
		// Guard against a keypress landing in the window between a word
		// completing and the next one being dealt. Without this, the keystroke
		// is scored as a mistake AND completeWord() fires a second time, so the
		// player is charged for a word they already finished.
		if (this.engine.isComplete()) return

		/**
		 * `lockInputOnMistake` ("Strict typing") was persisted and displayed but
		 * never enforced. When on, a wrong key rejects input until the player
		 * backspaces it out, so one typo costs real time instead of being
		 * immediately overwritten by the next keystroke.
		 */
		if (this.settings.lockInputOnMistake && this.engine.hasErrors()) {
			this.juice.shake(0.3, 80)
			this.playSfx('error')
			return
		}

		const correct = this.engine.input(key)
		this.state.recordKeystroke(correct, this.time.now)
		this.state.tick(this.time.now)
		this.display.render(this.engine)

		if (correct) {
			this.onCorrectKey()
		} else {
			this.onWrongKey()
		}

		if (this.engine.isComplete()) {
			this.completeWord()
		} else if (this.engine.isExhausted()) {
			this.setTip('Backspace to fix the red letters')
		} else {
			this.setTip('')
		}
	}

	private onCorrectKey(): void {
		// Typing is the weapon: every correct key shoves the monster back, and
		// the shove HOLDS until the kill rather than bleeding away. It is paid
		// out as score in `completeWord`.
		this.knockback = Math.min(
			TUNING.maxKnockbackPx,
			this.knockback + TUNING.knockbackPx,
		)
		this.monster?.playHitAnimation()
		this.juice.shake(0.14, 90)
		this.playSfx('type', 1 + Math.min(0.55, this.state.combo * 0.012))
	}

	private onWrongKey(): void {
		this.spikeUntil = this.time.now + TUNING.mistakeSpikeMs
		this.juice.shake(0.6, 190)
		this.juice.flash(0xff0000, 90)
		this.playSfx('error')
	}

	// --------------------------------------------------------------- resolution

	private completeWord(): void {
		const word = this.engine.getWord()
		const progress = this.monsterProgress()
		const nearMiss = progress >= 1 - TUNING.nearMissFraction

		// The shove still on the monster is read BEFORE it is destroyed, and is
		// paid out as score by `completeWord`. This is the mechanic that makes
		// "hold it off" worth points rather than just surviving.
		const bankedShove = this.knockback

		const result = this.state.completeWord(
			word.length,
			this.engine.getMistakes(),
			nearMiss,
			bankedShove,
		)
		this.setTip('')

		this.juice.hitstop(TUNING.killHitstopMs)
		this.juice.shake(result.perfect ? 0.75 : 0.45, 200)
		this.playSfx('kill')

		const m = this.monster
		const burstX = m?.x ?? this.scale.width / 2
		const burstY = m?.y ?? this.groundY() - 40
		if (m) {
			this.particles.burst(
				burstX,
				burstY - 20,
				result.perfect ? 0x00e676 : 0xffd166,
				result.perfect ? 24 : 14,
			)
			this.monster = null
			// Fires its callback exactly once and never blocks a frame, so the
			// next monster can be dealt immediately.
			m.playDeathAnimation(() => m.destroy())
			this.tweens.add({
				targets: m,
				alpha: 0,
				scaleY: 0.6,
				duration: 380,
				delay: 160,
			})
			this.cullCorpses()
		}

		// Deal the next word straight away. Waiting on an out-animation left a
		// ~260ms window where keystrokes were dropped, which punished fast
		// typists and broke their rhythm at exactly the moment they were
		// flowing. The kill feedback (hitstop, particles, floating score) is
		// already carrying the "you landed it" message.
		this.dealWord()
		// Celebrate AFTER the new word is dealt. The old code called this first,
		// and `dealWord` -> `display.setWord` then destroyed the very character
		// objects the punch tween was targeting, so the "you landed it" flourish
		// never rendered a single frame.
		this.display.celebrate()
		this.floatScore(
			burstX,
			burstY - 90,
			result.earned,
			result.perfect || result.banked,
		)

		if (result.levelledUp) this.onLevelUp()
		this.checkMilestone()
		if (this.state.combo > 0 && this.state.combo % 10 === 0) {
			this.hud.punchCombo()
		}
		this.maybeDropPowerUp()
	}

	private onLevelUp(): void {
		this.juice.shake(0.85, 320)
		this.juice.flash(this.difficulty.color, 130)
		this.playSfx('levelup')
		this.showBanner(
			`LEVEL ${this.state.level} — FASTER`,
			this.difficulty.color,
		)
	}

	private checkMilestone(): void {
		const combo = this.state.combo
		const hit = MILESTONES.find((m) => m === combo)
		if (hit === undefined) return
		// claimMilestone persists, so this is a first-time-only celebration.
		if (!claimMilestone(hit)) return
		this.showBanner(`COMBO ×${hit}!`, 0xffd166)
		this.juice.slowMo(0.6, 320)
	}

	// ------------------------------------------------------------------ effects

	private showBanner(text: string, color: number): void {
		const b = this.add
			.text(this.scale.width / 2, this.scale.height - 40, text, {
				fontFamily: 'Retro Font',
				fontSize: '34px',
				color: `#${color.toString(16).padStart(6, '0')}`,
				stroke: '#000000',
				strokeThickness: 6,
			})
			.setOrigin(0.5)
			.setDepth(44)
		this.transient.push(b)
		// Slides up from below the play area so it never covers the word.
		b.setY(this.scale.height - 20)
		this.tweens.add({
			targets: b,
			y: this.scale.height - 60,
			alpha: 0,
			duration: 1100,
			ease: 'Quad.easeIn',
			onComplete: () => {
				b.destroy()
				this.transient = this.transient.filter((o) => o !== b)
			},
		})
	}

	private floatScore(
		x: number,
		y: number,
		amount: number,
		perfect: boolean,
	): void {
		const t = this.add
			.text(x, y, `+${amount}${perfect ? '  PERFECT' : ''}`, {
				fontFamily: 'Retro Font',
				fontSize: perfect ? '32px' : '24px',
				color: perfect ? '#00e676' : '#ffd166',
				stroke: '#000000',
				strokeThickness: 5,
			})
			.setOrigin(0.5)
			.setDepth(38)
		this.transient.push(t)
		this.tweens.add({
			targets: t,
			y: y - 64,
			alpha: 0,
			duration: 820,
			ease: 'Quad.easeOut',
			onComplete: () => {
				t.destroy()
				this.transient = this.transient.filter((o) => o !== t)
			},
		})
	}

	private setTip(text: string): void {
		if (this.tipText.text !== text) this.tipText.setText(text)
	}

	/**
	 * Live readout of how much travel the player has bought back this word.
	 *
	 * Only shown once there is something worth showing. Without this the shove
	 * is an invisible stat the player has no way of learning to think about,
	 * which is the main reason the previous decay made it feel absent.
	 */
	private updateTimeBank(): void {
		if (this.phase !== 'running' || this.monsterSpeed <= 0) {
			this.timeBankText.setVisible(false)
			return
		}
		const sec = this.knockback / this.monsterSpeed
		if (sec < TUNING.timeBankShowThreshold) {
			this.timeBankText.setVisible(false)
			return
		}
		this.timeBankText
			.setText(`HELD BACK ${sec.toFixed(1)}s`)
			.setVisible(true)
	}

	/**
	 * Cap how many death animations may overlap.
	 *
	 * A fast player kills roughly every 150ms, which is quicker than the death
	 * animation plays, so corpses would otherwise pile up without bound. Only
	 * dying monsters are considered; the live one is never touched.
	 */
	private cullCorpses(): void {
		const corpses = this.children.list.filter(
			(c): c is Monster =>
				c instanceof Monster && c !== this.monster && c.isDying,
		)
		for (let i = 0; i <= corpses.length - MAX_CORPSES; i++) {
			corpses[i]?.destroy()
		}
	}

	// ------------------------------------------------------------------- damage

	private takeHit(): void {
		if (this.phase !== 'running' || this.paused) return
		const now = this.time.now
		if (now < this.invulnUntil) return

		this.invulnUntil = now + TUNING.hitInvulnSec * 1000
		const dead = this.state.loseLife()
		this.hud.punchLives()
		this.juice.shake(1.3, 400)
		this.juice.flash(0xff0000, 200)
		this.playSfx('hurt')
		this.particles.burst(
			this.avatar.x,
			this.groundY() - 60,
			0xff1744,
			20,
			200,
		)

		this.tweens.add({
			targets: this.avatar,
			x: TUNING.avatarX - 16,
			duration: 70,
			yoyo: true,
			repeat: 3,
		})

		if (dead) {
			this.endRun()
			return
		}

		/**
		 * Retry the SAME word rather than dealing a new one.
		 *
		 * The old build called `dealWord()` here, which charged the player three
		 * times for a single event: a life, the whole combo, AND the progress on
		 * a word they had already read. Re-dealing a *different* word is the
		 * worst of the three, because the retry is now a cold read under time
		 * pressure.
		 *
		 * Instead the monster is shoved back to a fixed distance and the same
		 * word is re-armed with a tighter clock (see `registerRetreat`), so the
		 * cost of a hit is time pressure rather than lost progress.
		 */
		this.state.registerRetreat()
		this.setTip('Pushed back — same word, less time')
		this.reArmSameWord()
	}

	/**
	 * Re-arm the current word after a hit.
	 *
	 * Keeps the TypingEngine (so the player's caret and any corrected mistakes
	 * survive) but resets the monster's approach and re-derives its speed from
	 * the now-shortened budget.
	 */
	private reArmSameWord(): void {
		this.knockback = 0
		this.travel = 0
		this.scrollX = 0
		this.monsterHomeX = this.scale.width + 100
		this.monsterSpeed = this.state.speedFor(this.engine.getWord())
		this.dangerSounded = false
		this.spikeUntil = 0
		this.spawnMonster(this.pickMonsterType())
	}

	private endRun(): void {
		this.phase = 'dead'
		this.state.tick(this.time.now)
		this.stopAllSounds()
		this.juice.slowMo(0.3, 800)
		this.cameras.main.shake(360, 0.01)
		this.avatar.anims.stop()
		this.avatar.setTint(0x8a3030)
		this.monster?.destroy()
		this.monster = null
		this.clearPowerUp()

		const isRecord = saveRun({
			score: this.state.score,
			wpm: this.state.wpm,
			accuracy: this.state.accuracy,
			wordsCompleted: this.state.wordsCompleted,
			maxCombo: this.state.maxCombo,
			difficulty: this.difficulty.id,
			durationMs: this.state.elapsedMs,
		})

		this.display.setVisible(false)
		this.tipText.setVisible(false)
		this.timeBankText.setVisible(false)
		this.hud.setVisible(false)
		this.vignette.setAlpha(0)
		this.killTransient()

		const data = loadData()
		const record = data.records[this.difficulty.id]
		const summary: GameOverSummary = {
			score: this.state.score,
			wpm: this.state.wpm,
			accuracy: this.state.accuracy,
			combo: this.state.maxCombo,
			words: this.state.wordsCompleted,
			level: this.state.level,
			durationSec: this.state.elapsedMs / 1000,
			isRecord,
			difficulty: this.difficulty,
			personalBests: {
				score: record.bestScore,
				wpm: record.bestWPM,
				accuracy: record.bestAccuracy,
				combo: record.longestCombo,
			},
			retry: () => this.scene.restart(),
			menu: () => window.dispatchEvent(new CustomEvent('returnToMenu')),
		}

		const modal = new GameOverModal(this, summary)
		this.children.add(modal)
		modal.setDepth(100)
	}

	// ----------------------------------------------------------------- powerups

	private maybeDropPowerUp(): void {
		if (Math.random() > TUNING.powerUpDropChance) return
		this.clearPowerUp()

		const roll = Math.random()
		this.powerUpKind = roll < TUNING.powerUpTypeWeights.ice ? 'ice' : 'bomb'
		this.powerUp = this.add
			.image(this.scale.width + 40, this.groundY() - 70, this.powerUpKind)
			.setScale(2)
			.setDepth(11)
		this.playSfx('powerup')
		this.tweens.add({
			targets: this.powerUp,
			x: TUNING.avatarX + 6,
			y: this.groundY() - 70,
			duration: 900,
			ease: 'Sine.easeInOut',
			onComplete: () => this.applyPowerUp(),
		})
	}

	private applyPowerUp(): void {
		const kind = this.powerUpKind
		if (!this.powerUp || !kind) return
		const { x, y } = this.powerUp
		this.particles.burst(x, y, 0x00e5ff, 18, 180)
		this.clearPowerUp()

		if (kind === 'ice') {
			this.frozenUntil = this.time.now + TUNING.iceDurationSec * 1000
			this.juice.slowMo(0.5, 700)
			this.showBanner('FROZEN', 0x66d9ff)
		} else {
			// Blitz: wipe whatever is on screen and deal straight to the next word.
			this.showBanner('BLITZ!', 0xff7043)
			this.juice.hitstop(110)
			if (this.monster) {
				this.particles.burst(
					this.monster.x,
					this.monster.y - 20,
					0xff7043,
					26,
					260,
				)
				this.monster.destroy()
				this.monster = null
			}
			this.dealWord()
		}
	}

	private clearPowerUp(): void {
		if (!this.powerUp) return
		this.tweens.killTweensOf(this.powerUp)
		this.powerUp.destroy()
		this.powerUp = undefined
		this.powerUpKind = null
	}

	// --------------------------------------------------------------------- loop

	/** 0 = just spawned, 1 = reached the avatar. */
	private monsterProgress(): number {
		if (!this.monster) return 1
		const from = this.scale.width + 100
		return Phaser.Math.Clamp(
			(from - this.monster.x) / (from - TUNING.avatarX),
			0,
			1,
		)
	}

	update(time: number, delta: number): void {
		this.state.tick(time)
		this.juice.update(delta)

		// dt is the ONLY clock the simulation reads. The previous build advanced
		// the monster by a fixed number of pixels per frame, which made a 144Hz
		// display 2.4x harder than a 60Hz one.
		const dt = (delta / 1000) * this.juice.scale

		if (!this.paused && !this.settingsOpen) {
			this.scrollWorld(dt)
			if (this.phase === 'running') this.stepMonster(dt)
		}

		this.updateAvatarBlink(time)
		this.updateDanger()
		this.updateTimeBank()
		this.updateHud(delta)
	}

	/**
	 * Advance the parallax by the monster's actual travel.
	 *
	 * The previous build scrolled at a constant rate regardless of monster
	 * speed, so the background visibly slipped against the action once the pace
	 * ramped. Deriving scroll from `travel` keeps ground, parallax and monster
	 * locked together at every speed.
	 */
	private scrollWorld(dt: number): void {
		this.scrollX += this.monsterSpeed * dt
		for (let i = 0; i < this.backgroundLayers.length; i++) {
			// Index 0 is the most distant layer, so it scrolls slowest.
			this.backgroundLayers[i].tilePositionX =
				this.scrollX * (0.06 + i * 0.07)
		}
		for (let i = 0; i < this.groundLayers.length; i++) {
			this.groundLayers[i].tilePositionX = this.scrollX * (1.0 + i * 0.25)
		}
	}

	/** Monotonic scroll offset, in pixels. */
	private scrollX = 0

	private stepMonster(dt: number): void {
		const m = this.monster
		if (!m) return

		if (this.time.now < this.frozenUntil) {
			m.setTint(0x66d9ff)
		} else {
			m.clearTint()
			// NOTE: knockback is deliberately NOT decayed here. It is a bank that
			// holds until the monster dies, and is then paid out as score. The old
			// 110px/sec bleed-out put the break-even typing rate at ~94 WPM, so
			// below that the accumulated shove decayed faster than it was built
			// and the mechanic was invisible.
			const spike =
				this.time.now < this.spikeUntil ? TUNING.mistakeSpeedSpike : 1
			this.travel += this.monsterSpeed * spike * dt
			m.x = this.monsterHomeX - this.travel - this.knockback
		}

		// Exact AABB. The previous Arcade bodies were mis-sized per monster type
		// and their offsets were tuned by trial and error.
		if (
			this.time.now >= this.invulnUntil &&
			overlaps(m.getHitbox(), this.avatarBox())
		) {
			this.takeHit()
		}
	}

	/**
	 * Avatar collision box. Deliberately forgiving — players tolerate
	 * near-misses far better than hits that read as unfair.
	 */
	private avatarBox(): Box {
		const w = 82
		const h = 104
		return {
			x: TUNING.avatarX - w / 2,
			y: this.groundY() - h - 6,
			w,
			h,
		}
	}

	private updateAvatarBlink(time: number): void {
		if (time >= this.invulnUntil) {
			if (this.avatar.alpha !== 1) this.avatar.setAlpha(1)
			return
		}
		this.avatar.setAlpha(Math.floor(time / 60) % 2 === 0 ? 0.35 : 1)
	}

	private updateDanger(): void {
		// showDangerZone was persisted but never read, so the toggle did nothing.
		if (
			this.phase !== 'running' ||
			!this.monster ||
			!this.settings.showDangerZone
		) {
			this.vignette.setAlpha(0)
			this.display.setDanger(0)
			return
		}
		const gap = Math.max(0, this.monster.x - TUNING.avatarX)
		const threat = Phaser.Math.Clamp(1 - gap / TUNING.dangerThreshold, 0, 1)

		this.display.setDanger(threat)
		this.vignette.setAlpha(threat * 0.45)

		if (threat > 0.8 && !this.dangerSounded) {
			this.dangerSounded = true
			this.playSfx('danger')
		} else if (threat < 0.55) {
			this.dangerSounded = false
		}
	}

	private updateHud(delta: number): void {
		this.hud.update(delta, {
			score: this.state.score,
			combo: this.state.combo,
			lives: this.state.lives,
			wpm: this.state.wpm,
			accuracy: this.state.accuracy,
			level: this.state.level,
			levelProgress:
				(this.state.wordsCompleted % TUNING.wordsPerLevel) /
				TUNING.wordsPerLevel,
			elapsedSec: this.state.elapsedMs / 1000,
		})
	}

	// ------------------------------------------------------------------- layout

	private groundY(): number {
		return this.scale.height - 90
	}

	private buildParallax(): void {
		const { width, height } = this.scale
		BG_LAYERS.forEach((n, i) => {
			const key = `layer_${String(n).padStart(4, '0')}`
			if (!this.textures.exists(key)) return
			this.backgroundLayers.push(
				this.add
					.tileSprite(0, 0, width, height, key)
					.setOrigin(0, 0)
					.setDepth(-20 + i),
			)
		})
		for (const [key, depth] of [
			['ground_back', -1],
			['ground_front', 0],
		] as const) {
			if (!this.textures.exists(key)) continue
			this.groundLayers.push(
				this.add
					.tileSprite(0, 0, width, height, key)
					.setOrigin(0, 0)
					.setDepth(depth),
			)
		}
	}

	private buildAvatar(): void {
		this.avatar = this.add
			.sprite(TUNING.avatarX, this.groundY(), 'avatar_run', 0)
			.setOrigin(0.5)
			.setScale(2)
			.setDepth(10)
		if (!this.anims.exists('avatar-run')) {
			this.anims.create({
				key: 'avatar-run',
				frames: this.anims.generateFrameNumbers('avatar_run', {
					start: 0,
					end: 7,
				}),
				frameRate: 12,
				repeat: -1,
			})
		}
		this.avatar.play('avatar-run')
	}

	private buildVignette(): void {
		// Generated once, in Boot, as a soft radial falloff.
		const key = '__vignette'
		if (!this.textures.exists(key)) {
			const size = 256
			const canvas = document.createElement('canvas')
			canvas.width = size
			canvas.height = size
			const ctx = canvas.getContext('2d')
			if (ctx) {
				const g = ctx.createRadialGradient(
					size / 2,
					size / 2,
					size * 0.22,
					size / 2,
					size / 2,
					size * 0.5,
				)
				g.addColorStop(0, 'rgba(255,255,255,0)')
				g.addColorStop(1, 'rgba(255,255,255,1)')
				ctx.fillStyle = g
				ctx.fillRect(0, 0, size, size)
			}
			this.textures.addCanvas(key, canvas)
		}
		this.vignette = this.add
			.image(0, 0, key)
			.setOrigin(0.5)
			.setDisplaySize(this.scale.width, this.scale.height)
			.setTint(0xff0000)
			.setAlpha(0)
			.setDepth(35)
	}

	private onResize(): void {
		const { width, height } = this.scale
		for (const l of [...this.backgroundLayers, ...this.groundLayers]) {
			l.setSize(width, height)
		}
		this.avatar.setY(this.groundY())
		this.vignette.setPosition(width / 2, height / 2)
		this.vignette.setDisplaySize(width, height)
		this.display?.relayout()
		this.hud?.relayout()
		this.countdownLabel?.setPosition(width / 2, height * 0.25)
		this.tipText.setPosition(width / 2, height * 0.25 + 58)
		this.timeBankText.setPosition(width / 2, height * 0.25 + 86)
		this.monsterHomeX = width + 100
	}

	// -------------------------------------------------------------------- pause

	private onAutoPause(): void {
		if (this.phase === 'running' && !this.paused) this.pause()
	}

	private togglePause(): void {
		if (this.phase === 'dead' || this.settingsOpen) return
		if (this.paused) this.resume()
		else this.pause()
	}

	private pause(): void {
		this.paused = true
		this.state.pause(this.time.now)
		this.avatar.anims.pause()
		this.monster?.anims.pause()
		this.tweens.pauseAll()
		this.playSfx('pause')
		this.openSettings()
	}

	private resume(): void {
		this.paused = false
		this.state.resume(this.time.now)
		this.avatar.anims.resume()
		this.monster?.anims.resume()
		this.tweens.resumeAll()
		this.playSfx('unpause')
	}

	private openSettings(): void {
		this.settingsOpen = true
		const modal = new SettingsModal(this, () => {
			this.settingsOpen = false
			this.settings = loadData().settings
			this.juice.setEnabled(this.settings.screenShake)
			this.applyVolumes()
			this.resume()
		})
		this.children.add(modal)
		modal.setDepth(100)
	}

	// -------------------------------------------------------------------- audio

	private setupAudio(): void {
		const s = this.settings
		this.bgMusic = this.sound.add('bgMusic', {
			volume: s.muted ? 0 : s.musicVolume,
			loop: true,
		})
		if (!s.muted) this.bgMusic.play()

		// This loop was created and then never started, so the run ambience was
		// silent. Play it only when unmuted, matching bgMusic.
		this.runLoop = this.sound.add('runSound', {
			volume: s.muted ? 0 : s.sfxVolume * 0.22,
			loop: true,
		})
		if (!s.muted) this.runLoop.play()

		const map: Record<string, string> = {
			type: 'clickSound',
			error: 'monsterHitSound',
			hurt: 'monsterHitSound',
			kill: 'monsterHitSound',
			levelup: 'speedUpSound',
			powerup: 'speedUpSound',
			danger: 'monsterHitSound',
			pause: 'pauseSound',
			unpause: 'unpauseSound',
		}
		for (const [logical, physical] of Object.entries(map)) {
			if (!this.cache.audio.exists(physical)) continue
			this.sfx[logical] = this.sound.add(physical, {
				volume: s.sfxVolume * this.sfxGain(logical),
			})
		}
		this.applyVolumes()
	}

	private sfxGain(key: string): number {
		switch (key) {
			case 'type':
				return 0.22
			case 'error':
				return 0.3
			case 'danger':
				return 0.25
			case 'pause':
			case 'unpause':
				return 0.5
			default:
				return 0.65
		}
	}

	/** Volume/rate are WebAudio-only; guard so other backends stay silent, not broken. */
	private setVolume(s: Phaser.Sound.BaseSound | undefined, v: number): void {
		if (s instanceof Phaser.Sound.WebAudioSound) s.setVolume(v)
	}

	private applyVolumes(): void {
		const s = this.settings
		this.setVolume(this.bgMusic, s.muted ? 0 : s.musicVolume)
		this.setVolume(this.runLoop, s.muted ? 0 : s.sfxVolume * 0.22)
		for (const [key, sfx] of Object.entries(this.sfx)) {
			this.setVolume(sfx, s.sfxVolume * this.sfxGain(key))
		}
	}

	private playSfx(key: string, rate = 1): void {
		const s = this.sfx[key]
		if (!s) return
		if (s instanceof Phaser.Sound.WebAudioSound) s.setRate(rate)
		s.play()
	}

	private stopAllSounds(): void {
		this.bgMusic?.stop()
		this.runLoop?.stop()
		for (const s of Object.values(this.sfx)) s.stop()
	}

	// ----------------------------------------------------------------- shutdown

	private killTransient(): void {
		for (const t of this.transientTimers) t.remove(false)
		this.transientTimers = []
		for (const o of this.transient) o.destroy()
		this.transient = []
		this.countdownLabel?.destroy()
		this.countdownLabel = undefined
	}

	shutdown(): void {
		// Phaser does NOT call a method named shutdown(); it emits an event.
		// The old build defined this method and it never ran, so every restart
		// leaked a listener, a timer and a set of sounds.
		this.scale.off('resize', this.onResize, this)
		this.game.events.off('yk-autopause', this.onAutoPause, this)
		this.stopAllSounds()
		this.juice.setEnabled(false)
		this.tweens.resumeAll()
		this.killTransient()
		this.clearPowerUp()
		this.monster?.destroy()
		this.monster = null
		this.display?.destroy()
		this.hud?.destroy()
		this.input.keyboard?.removeAllListeners()
		this.phase = 'dead'
	}

	/** Registered so Phaser's shutdown event actually reaches our cleanup. */
	init(): void {
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)
	}
}
