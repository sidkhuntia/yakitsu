import Phaser from 'phaser'
import { loadData } from '../systems/persistence'

export default class Menu extends Phaser.Scene {
	private music!: Phaser.Sound.BaseSound
	private clickSound!: Phaser.Sound.BaseSound

	constructor() {
		super('Menu')
	}

	create() {
		const { width, height } = this.scale
		const bestScore = loadData().bestScore
		const settings = loadData().settings
		this.add
			.image(width / 2, height / 2, 'menuBackground')
			.setOrigin(0.5)
			.setAlpha(0.65)

		// Play menu background music
		this.music = this.sound.add('menuMusic', {
			volume: 0.2,
			loop: true,
		})

		// Only play if not muted
		if (!settings.muted) {
			this.music.play()
		} else {
			this.music.pause()
		}

		// Make music available globally
		this.game.registry.set('menuMusic', this.music)

		// Add click sound
		this.clickSound = this.sound.add('clickSound', { volume: 0.7 })

		this.add
			.text(width / 2, height / 2 - 70, 'YAKITSU', {
				fontFamily: 'Retro Font',
				fontSize: '72px',
				color: '#ffb347', // bright orange
				stroke: '#7a2d06', // dark brown outline
				strokeThickness: 10,
				shadow: {
					offsetX: 6,
					offsetY: 8,
					color: '#000',
					blur: 0,
					fill: true,
				},
				padding: { left: 16, right: 16, top: 8, bottom: 8 },
			})
			.setOrigin(0.5)

		this.add
			.text(width / 2, height / 2, `Best Score: ${bestScore}`, {
				font: '24px Retro Font',
				color: '#fff',
				backgroundColor: '#222',
				padding: { left: 16, right: 16, top: 8, bottom: 8 },
				align: 'center',
				stroke: '#000',
				strokeThickness: 2,
			})
			.setOrigin(0.5)

		const startBtn = this.add
			.text(width / 2, height / 2 + 60, '[ Start Game ]', {
				font: '32px Retro Font',
				color: '#0f0',
				backgroundColor: '#222',
				padding: { left: 16, right: 16, top: 8, bottom: 8 },
			})
			.setOrigin(0.5)
			.setInteractive({ useHandCursor: true })

		startBtn.on('pointerdown', () => {
			// Play click sound if not muted
			if (!settings.muted) {
				this.clickSound.play()
			}

			// Stop menu music before transitioning
			this.music.stop()

			this.scene.start('Play')
		})
	}
}
