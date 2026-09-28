import Phaser from 'phaser'

export type MonsterType = 'Skeleton' | 'Flying eye' | 'Mushroom' | 'Goblin'

export const MONSTER_TYPES: MonsterType[] = [
	'Skeleton',
	'Flying eye',
	'Mushroom',
	'Goblin',
]

interface MonsterConfig {
	frameCount: number
	deathFrameCount: number
	hitFrameCount: number
	scale: number
	yOffset: number
	/**
	 * Hitbox in frame-local pixels (frames are 150x150). Monsters are drawn with
	 * lots of transparent padding, so the collision box is much smaller than the
	 * sprite and biased toward the torso.
	 */
	hitW: number
	hitH: number
	hitOffsetX: number
	hitOffsetY: number
}

const CONFIGS: Record<MonsterType, MonsterConfig> = {
	Skeleton: {
		frameCount: 4,
		deathFrameCount: 4,
		hitFrameCount: 4,
		scale: 1.6,
		yOffset: 0,
		hitW: 34,
		hitH: 62,
		hitOffsetX: 58,
		hitOffsetY: 48,
	},
	'Flying eye': {
		frameCount: 8,
		deathFrameCount: 4,
		hitFrameCount: 4,
		scale: 2,
		yOffset: -20,
		hitW: 38,
		hitH: 56,
		hitOffsetX: 56,
		hitOffsetY: 52,
	},
	Mushroom: {
		frameCount: 8,
		deathFrameCount: 4,
		hitFrameCount: 4,
		scale: 2,
		yOffset: -12,
		hitW: 34,
		hitH: 60,
		hitOffsetX: 58,
		hitOffsetY: 50,
	},
	Goblin: {
		frameCount: 8,
		deathFrameCount: 4,
		hitFrameCount: 4,
		scale: 2,
		yOffset: -15,
		hitW: 32,
		hitH: 60,
		hitOffsetX: 59,
		hitOffsetY: 50,
	},
}

/** Keys of the currently-dying monsters, so we never process one twice. */
export class Monster extends Phaser.GameObjects.Sprite {
	public readonly monsterType: MonsterType
	private dying = false
	private readonly runAnimKey: string
	private readonly deathAnimKey: string
	private readonly hitAnimKey: string
	/** Guards against a queued hit anim clobbering a death anim. */
	private hitTimeout?: Phaser.Time.TimerEvent

	constructor(scene: Phaser.Scene, x: number, y: number, type: MonsterType) {
		const config = CONFIGS[type]
		super(scene, x, y + config.yOffset, `monster_${type}_run`, 0)

		this.monsterType = type
		const safe = type.toLowerCase().replace(/\s+/g, '_')
		this.runAnimKey = `monster-${safe}-run`
		this.deathAnimKey = `monster-${safe}-death`
		this.hitAnimKey = `monster-${safe}-hit`

		this.setOrigin(0.5).setScale(config.scale).setDepth(10).setFlipX(true)

		Monster.ensureAnims(scene, type, config)

		this.play(this.runAnimKey)
	}

	/**
	 * World-space collision box, in pixels.
	 *
	 * Computed directly from the frame geometry rather than via an Arcade body.
	 * The body version relied on scale/offset interaction that was impossible to
	 * reason about and drifted per monster type; this is exact and tunable.
	 */
	getHitbox(): { x: number; y: number; w: number; h: number } {
		const c = CONFIGS[this.monsterType]
		const half = 75 // frame is 150x150
		const cx = (c.hitOffsetX + c.hitW / 2 - half) * c.scale
		const cy = (c.hitOffsetY + c.hitH / 2 - half) * c.scale
		return {
			x: this.x + cx - (c.hitW * c.scale) / 2,
			y: this.y + cy - (c.hitH * c.scale) / 2,
			w: c.hitW * c.scale,
			h: c.hitH * c.scale,
		}
	}

	private static ensureAnims(
		scene: Phaser.Scene,
		type: MonsterType,
		config: MonsterConfig,
	): void {
		const safe = type.toLowerCase().replace(/\s+/g, '_')
		const build = (
			key: string,
			sheet: string,
			count: number,
			repeat: number,
		) => {
			if (scene.anims.exists(key)) return
			scene.anims.create({
				key,
				frames: scene.anims.generateFrameNumbers(sheet, {
					start: 0,
					end: count - 1,
				}),
				frameRate: 10,
				repeat,
			})
		}
		build(
			`monster-${safe}-run`,
			`monster_${type}_run`,
			config.frameCount,
			-1,
		)
		build(
			`monster-${safe}-death`,
			`monster_${type}_death`,
			config.deathFrameCount,
			0,
		)
		build(
			`monster-${safe}-hit`,
			`monster_${type}_hit`,
			config.hitFrameCount,
			0,
		)
	}

	/** The frames we actually got, so a mis-sized sheet can't break a run. */
	get isDying(): boolean {
		return this.dying
	}

	/**
	 * Kick off the hit reaction.
	 *
	 * Returns immediately — the run animation is restored by a timer rather than
	 * by a promise, so nothing in the hot path has to await anything.
	 */
	playHitAnimation(): void {
		if (this.dying) return
		this.clearTint()
		this.setTexture(`monster_${this.monsterType}_hit`)
		this.play(this.hitAnimKey)
		this.hitTimeout?.remove(false)
		this.hitTimeout = this.scene.time.delayedCall(280, () => {
			if (this.dying || !this.active) return
			this.setTexture(`monster_${this.monsterType}_run`)
			this.play(this.runAnimKey)
		})
	}

	/**
	 * Play the death animation, then invoke `onDone` exactly once.
	 *
	 * Non-blocking by design: the caller deals the next monster immediately, so
	 * a corpse can still be on screen for a few hundred ms while the next
	 * monster walks in. That is intended — it reads as a kill rather than a
	 * pop — so `isCorpse` lets the scene count and cap them.
	 */
	playDeathAnimation(onDone: () => void): void {
		if (this.dying) return
		this.dying = true
		this.hitTimeout?.remove(false)
		this.hitTimeout = undefined
		this.clearTint()
		// Retired from simulation but left visible and rendering.
		this.setActive(false)
		this.setTexture(`monster_${this.monsterType}_death`)
		this.play(this.deathAnimKey)

		// Latch so the two completion paths below can only ever fire once.
		let settled = false
		const finish = (): void => {
			if (settled) return
			settled = true
			onDone()
		}
		this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, finish)
		// Safety net: if the sheet is short or the event is missed, the corpse
		// is still cleaned up rather than accumulating forever.
		this.scene.time.delayedCall(700, finish)
	}
}
