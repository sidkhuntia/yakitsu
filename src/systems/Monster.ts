import Phaser from 'phaser'

export type MonsterType = 'Skeleton' | 'Flying eye' | 'Mushroom' | 'Goblin'

interface MonsterConfig {
	type: MonsterType
	frameCount: number
	deathFrameCount: number
	hitFrameCount: number
	scale: number
	xOffset: number
	yOffset: number
}

export class Monster extends Phaser.GameObjects.Sprite {
	public monsterType: MonsterType
	private isDying: boolean = false
	private isHit: boolean = false
	private runAnimKey: string

	constructor(scene: Phaser.Scene, x: number, y: number, type: MonsterType) {
		// Get config first to calculate offset position
		const config = Monster.getFrameConfig(type)

		// Apply position offsets before calling super
		const adjustedX = x + config.xOffset
		const adjustedY = y + config.yOffset

		super(scene, adjustedX, adjustedY, `monster_${type}_run`, 0)
		this.monsterType = type
		const safeType = type.toLowerCase().replace(/\s+/g, '_')
		this.runAnimKey = `monster-${safeType}-run`

		// Set origin, scale, and depth
		this.setOrigin(0.5).setScale(config.scale).setDepth(10).setFlipX(true) // Flip horizontally to face left (towards player)

		// Create run animation if it doesn't exist
		if (!scene.anims.exists(this.runAnimKey)) {
			scene.anims.create({
				key: this.runAnimKey,
				frames: scene.anims.generateFrameNumbers(
					`monster_${type}_run`,
					{
						start: 0,
						end: config.frameCount - 1,
					},
				),
				frameRate: 10,
				repeat: -1,
			})
		}

		// Create death animation if it doesn't exist
		const deathAnimKey = `monster-${type}-death`
		if (!scene.anims.exists(deathAnimKey)) {
			scene.anims.create({
				key: deathAnimKey,
				frames: scene.anims.generateFrameNumbers(
					`monster_${type}_death`,
					{
						start: 0,
						end: config.deathFrameCount - 1,
					},
				),
				frameRate: 10,
				repeat: 0,
			})
		}

		// Create hit animation if it doesn't exist
		const hitAnimKey = `monster-${type}-hit`
		if (!scene.anims.exists(hitAnimKey)) {
			scene.anims.create({
				key: hitAnimKey,
				frames: scene.anims.generateFrameNumbers(
					`monster_${type}_hit`,
					{
						start: 0,
						end: config.hitFrameCount - 1,
					},
				),
				frameRate: 10,
				repeat: 0,
			})
		}

		// Play run animation by default
		this.play(this.runAnimKey)
	}

	playDeathAnimation(): Promise<void> {
		if (this.isDying) return Promise.resolve()

		this.isDying = true
		const deathAnimKey = `monster-${this.monsterType}-death`

		return new Promise((resolve) => {
			// Switch to death spritesheet
			this.setTexture(`monster_${this.monsterType}_death`)

			// Play death animation
			this.play(deathAnimKey)

			// Listen for animation complete
			this.once('animationcomplete', () => {
				this.isDying = false
				resolve()
			})
		})
	}

	playHitAnimation(): Promise<void> {
		if (this.isDying || this.isHit) return Promise.resolve()

		this.isHit = true
		const hitAnimKey = `monster-${this.monsterType}-hit`

		return new Promise((resolve) => {
			// Switch to hit spritesheet
			this.setTexture(`monster_${this.monsterType}_hit`)

			// Play hit animation
			this.play(hitAnimKey)

			// Listen for animation complete
			this.once('animationcomplete', () => {
				// Return to run animation if not dying
				if (!this.isDying) {
					this.setTexture(`monster_${this.monsterType}_run`)
					this.play(this.runAnimKey)
				}
				this.isHit = false
				resolve()
			})
		})
	}

	public static getFrameConfig(type: MonsterType): MonsterConfig {
		switch (type) {
			case 'Skeleton':
				return {
					type,
					frameCount: 4,
					deathFrameCount: 4,
					hitFrameCount: 4,
					scale: 1.6,
					xOffset: 0,
					yOffset: 0,
				}
			case 'Flying eye':
				return {
					type,
					frameCount: 8,
					deathFrameCount: 4,
					hitFrameCount: 4,
					scale: 2,
					xOffset: 0,
					yOffset: -20,
				}
			case 'Mushroom':
				return {
					type,
					frameCount: 8,
					deathFrameCount: 4,
					hitFrameCount: 4,
					scale: 2,
					xOffset: 0,
					yOffset: -12,
				}
			case 'Goblin':
				return {
					type,
					frameCount: 8,
					deathFrameCount: 4,
					hitFrameCount: 4,
					scale: 2,
					xOffset: 0,
					yOffset: -15,
				}
			default:
				throw new Error(`Unknown monster type "${type}"`)
		}
	}

	static getRandomType(): MonsterType {
		const types: MonsterType[] = [
			'Skeleton',
			'Flying eye',
			'Mushroom',
			'Goblin',
		]
		return types[Math.floor(Math.random() * types.length)]
	}
}
