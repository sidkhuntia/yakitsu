import Phaser from 'phaser'
import { TUNING, type DifficultyProfile } from './tuning'

/**
 * A lightweight particle burst. Uses a procedurally generated square texture so
 * it needs no art asset.
 */
export class Particles {
	private static key = '__spark'
	private emitter?: Phaser.GameObjects.Particles.ParticleEmitter

	constructor(private readonly scene: Phaser.Scene) {
		if (!scene.textures.exists(Particles.key)) {
			const tex = scene.textures.createCanvas(Particles.key, 8, 8)
			if (tex) {
				const ctx = tex.getContext()
				ctx.fillStyle = '#ffffff'
				ctx.fillRect(0, 0, 8, 8)
				tex.refresh()
			}
		}
	}

	/**
	 * One-shot burst. A single emitter is reused and reconfigured rather than
	 * allocated per hit, so sustained play doesn't churn GPU resources.
	 */
	burst(x: number, y: number, color: number, count = 14, speed = 220): void {
		if (!this.emitter) {
			this.emitter = this.scene.add
				.particles(0, 0, Particles.key, {
					lifespan: { min: 260, max: 620 },
					scale: { start: 1.6, end: 0 },
					rotate: { min: 0, max: 360 },
					alpha: { start: 1, end: 0 },
					blendMode: 'ADD',
					emitting: false,
				})
				.setDepth(30)
		}

		// setConfig re-applies the EmitterOps, so one emitter serves every
		// burst without allocating a new GPU buffer per hit.
		this.emitter.setConfig({
			speed: { min: speed * 0.35, max: speed },
		})
		this.emitter.setParticleTint(color)
		this.emitter.emitParticleAt(x, y, count)
	}
}

/**
 * The heads-up display. Owns its own layout so resizing is a single concern
 * and the play scene doesn't juggle a dozen text objects.
 */
export class Hud {
	readonly depth = 40
	private readonly scoreText: Phaser.GameObjects.Text
	private readonly comboText: Phaser.GameObjects.Text
	private readonly livesText: Phaser.GameObjects.Text
	private readonly wpmText: Phaser.GameObjects.Text
	private readonly accuracyText: Phaser.GameObjects.Text
	private readonly levelText: Phaser.GameObjects.Text
	private readonly levelBarBg: Phaser.GameObjects.Rectangle
	private readonly levelBarFill: Phaser.GameObjects.Rectangle
	private readonly timerText: Phaser.GameObjects.Text
	private displayedScore = 0
	private targetScore = 0

	constructor(
		private readonly scene: Phaser.Scene,
		private readonly difficulty: DifficultyProfile,
	) {
		const font = (size: number, color: string) => ({
			fontFamily: 'Retro Font',
			fontSize: `${size}px`,
			color,
		})

		this.scoreText = scene.add
			.text(0, 14, '0', font(40, '#ffffff'))
			.setOrigin(1, 0)
			.setDepth(this.depth)
		this.comboText = scene.add
			.text(0, 62, '', font(22, '#ffd166'))
			.setOrigin(1, 0)
			.setDepth(this.depth)
		this.wpmText = scene.add
			.text(0, 92, '', font(18, '#e0f2fe'))
			.setOrigin(1, 0)
			.setDepth(this.depth)
		this.accuracyText = scene.add
			.text(0, 116, '', font(18, '#e0f2fe'))
			.setOrigin(1, 0)
			.setDepth(this.depth)

		this.livesText = scene.add
			.text(20, 14, '', font(34, '#ff4d6d'))
			.setOrigin(0, 0)
			.setDepth(this.depth)

		// Level + progress bar, centred at the top.
		this.levelText = scene.add
			.text(0, 12, '', font(20, '#ffffff'))
			.setOrigin(0.5, 0)
			.setDepth(this.depth)
		const barW = 220
		this.levelBarBg = scene.add
			.rectangle(0, 42, barW, 8, 0x0b1622, 0.85)
			.setOrigin(0.5, 0)
			.setDepth(this.depth)
			.setStrokeStyle(1, 0xffffff, 0.25)
		this.levelBarFill = scene.add
			.rectangle(0, 42, 0, 8, this.difficulty.color, 1)
			.setOrigin(0, 0.5)
			.setDepth(this.depth + 1)

		this.timerText = scene.add
			.text(20, 52, '', font(18, '#9fb3c8'))
			.setOrigin(0, 0)
			.setDepth(this.depth)

		this.layout()
	}

	private layout(): void {
		const w = this.scene.scale.width
		this.scoreText.setX(w - 24)
		this.comboText.setX(w - 24)
		this.wpmText.setX(w - 24)
		this.accuracyText.setX(w - 24)
		this.levelText.setX(w / 2)
		this.levelBarBg.setX(w / 2)
	}

	relayout(): void {
		this.layout()
	}

	update(
		dt: number,
		state: {
			score: number
			combo: number
			lives: number
			wpm: number
			accuracy: number
			level: number
			levelProgress: number
			elapsedSec: number
		},
	): void {
		this.targetScore = state.score
		// Ease the score readout so it rolls up instead of snapping.
		this.displayedScore +=
			(this.targetScore - this.displayedScore) * Math.min(1, dt * 9)
		if (Math.abs(this.targetScore - this.displayedScore) < 1) {
			this.displayedScore = this.targetScore
		}
		this.scoreText.setText(Math.floor(this.displayedScore).toLocaleString())

		this.comboText.setText(state.combo > 1 ? `${state.combo}x COMBO` : '')

		this.livesText.setText('❤'.repeat(Math.max(0, state.lives)))

		this.wpmText.setText(`${state.wpm} WPM`)
		this.accuracyText.setText(`${state.accuracy}%`)

		this.levelText.setText(`LEVEL ${state.level}`)
		const p = Phaser.Math.Clamp(state.levelProgress, 0, 1)
		this.levelBarFill.width = this.levelBarBg.width * p
		this.levelBarFill.setX(this.levelBarBg.x - this.levelBarBg.width / 2)

		const s = Math.floor(state.elapsedSec)
		this.timerText.setText(
			`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`,
		)
	}

	/** Flash the combo readout when the multiplier tier goes up. */
	punchCombo(): void {
		this.comboText.setScale(1.5)
		this.scene.tweens.add({
			targets: this.comboText,
			scale: 1,
			duration: 260,
			ease: 'Back.easeOut',
		})
	}

	punchLives(): void {
		this.livesText.setScale(1.4)
		this.scene.tweens.add({
			targets: this.livesText,
			scale: 1,
			duration: 380,
			ease: 'Elastic.easeOut',
		})
	}

	setVisible(v: boolean): void {
		for (const o of [
			this.scoreText,
			this.comboText,
			this.livesText,
			this.wpmText,
			this.accuracyText,
			this.levelText,
			this.levelBarBg,
			this.levelBarFill,
			this.timerText,
		]) {
			o.setVisible(v)
		}
	}

	/** Danger colour ramp applied to the word while the monster closes in. */
	get dangerColorFor(): (t: number) => number {
		return (t: number) => {
			if (t > 0.8) return 0xff1744
			if (t > 0.55) return 0xff9100
			if (t > 0.3) return 0xffd600
			return 0x00e676
		}
	}

	get dangerThreshold(): number {
		return TUNING.dangerThreshold
	}

	destroy(): void {
		for (const o of [
			this.scoreText,
			this.comboText,
			this.livesText,
			this.wpmText,
			this.accuracyText,
			this.levelText,
			this.levelBarBg,
			this.levelBarFill,
			this.timerText,
		]) {
			o.destroy()
		}
	}
}
