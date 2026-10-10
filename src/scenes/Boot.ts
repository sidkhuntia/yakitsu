import Phaser from 'phaser'
import { loadAudio } from '../systems/sfx'
import { displayFont } from '../systems/font'
import { loadBackdrop } from '../systems/backdrop'

/**
 * Asset preloader.
 *
 * Loads everything for every scene up front and shows a real progress bar, so
 * the first word of a run is never gated on a lazy load.
 */
export default class Boot extends Phaser.Scene {
	private barFill?: Phaser.GameObjects.Rectangle
	private label?: Phaser.GameObjects.Text
	private readonly barWidth = 420

	constructor() {
		super('Boot')
	}

	preload(): void {
		const { width, height } = this.scale
		this.cameras.main.setBackgroundColor('#0a0f16')

		const barX = width / 2
		const barY = height / 2 + 40

		this.add
			.rectangle(barX, barY, this.barWidth, 18, 0x141d2b)
			.setStrokeStyle(2, 0x2c3e50)

		this.barFill = this.add
			.rectangle(barX - this.barWidth / 2, barY, 0, 14, 0x00e676)
			.setOrigin(0, 0.5)

		this.add
			.text(barX, barY - 60, 'YAKITSU', {
				fontFamily: displayFont(),
				fontSize: '52px',
				color: '#ffb347',
			})
			.setOrigin(0.5)

		this.label = this.add
			.text(barX, barY + 40, 'LOADING 0%', {
				fontFamily: displayFont(),
				fontSize: '16px',
				color: '#7f8fa6',
			})
			.setOrigin(0.5)

		this.load.on('progress', (value: number) => {
			this.barFill?.setSize(this.barWidth * value, 14)
			this.label?.setText(`LOADING ${Math.round(value * 100)}%`)
		})

		// --- shared assets ---------------------------------------------------

		loadAudio(this.load)

		// --- power-ups -------------------------------------------------------
		this.load.svg('ice', 'assets/ice.svg', { width: 32, height: 32 })
		this.load.svg('bomb', 'assets/bomb.svg', { width: 32, height: 32 })

		// --- word list -------------------------------------------------------
		this.load.script('words', 'data/words/words.js')

		// --- world -----------------------------------------------------------
		loadBackdrop(this.load)

		// --- actors ----------------------------------------------------------
		this.load.spritesheet('avatar_run', 'assets/character/Run.png', {
			frameWidth: 180,
			frameHeight: 180,
		})

		// Duel mode: hero stance, swings, reactions, and the goblin's stance and swing.
		for (const [key, file] of [
			['avatar_idle', 'Idle'],
			['avatar_attack1', 'Attack1'],
			['avatar_attack2', 'Attack2'],
		] as const) {
			this.load.spritesheet(key, `assets/character/${file}.png`, {
				frameWidth: 180,
				frameHeight: 180,
			})
		}
		this.load.spritesheet('avatar_hit', 'assets/character/Take Hit.png', {
			frameWidth: 180,
			frameHeight: 180,
		})
		this.load.spritesheet('avatar_death', 'assets/character/Death.png', {
			frameWidth: 180,
			frameHeight: 180,
		})
		for (const [key, file] of [
			['idle', 'Idle'],
			['attack', 'Attack'],
		] as const) {
			this.load.spritesheet(
				`monster_Goblin_${key}`,
				`assets/monsters/Goblin/${file}.png`,
				{ frameWidth: 150, frameHeight: 150 },
			)
		}

		for (const type of ['Skeleton', 'Flying eye', 'Mushroom', 'Goblin']) {
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
		// Everything is in the cache now; unblock any queued start request.
		this.game.events.emit('yk-assets-ready')

		this.cameras.main.fadeOut(260, 10, 15, 22)
		this.cameras.main.once(
			Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
			() => {
				// The HTML menu drives scene start, so Boot just gets out of the way.
				this.scene.stop()
			},
		)
	}
}
