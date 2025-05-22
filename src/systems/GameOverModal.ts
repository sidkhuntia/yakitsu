import Phaser from 'phaser'
import { loadData } from './persistence'

export class GameOverModal extends Phaser.GameObjects.Container {
	private bg: Phaser.GameObjects.Rectangle
	private panel: Phaser.GameObjects.Rectangle
	private congratsText: Phaser.GameObjects.Text
	private scoreText: Phaser.GameObjects.Text
	private retryBtn: Phaser.GameObjects.Text
	private menuBtn: Phaser.GameObjects.Text
	private onRestart: () => void
	private onMenu: () => void
	private escKeyHandler?: () => void
	private clickSound: Phaser.Sound.BaseSound

	constructor(
		scene: Phaser.Scene,
		score: number,
		bestScore: number,
		onRestart: () => void,
		onMenu: () => void,
	) {
		super(scene)
		this.onRestart = onRestart
		this.onMenu = onMenu
		const { width, height } = scene.scale

		// Add click sound
		this.clickSound = scene.sound.add('clickSound', { volume: 0.7 })

		this.bg = scene.add
			.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5)
			.setInteractive()
		this.panel = scene.add
			.rectangle(width / 2, height / 2, 440, 300, 0x222233, 0.98)
			.setStrokeStyle(2, 0x8888aa)

		let congrats = ''
		if (score >= bestScore && score > 0) {
			congrats = 'New Best! Congratulations!'
		} else if (score >= 1000) {
			congrats = 'Congratulations!'
		}
		this.congratsText = scene.make
			.text({
				x: width / 2,
				y: height / 2 - 80,
				text: congrats,
				style: { font: '28px Retro Font', color: '#0ff' },
				add: false,
			})
			.setOrigin(0.5)
		this.scoreText = scene.make
			.text({
				x: width / 2,
				y: height / 2 - 20,
				text: `Score: ${score}\nBest: ${bestScore}`,
				style: {
					font: '28px Retro Font',
					color: '#fff',
					align: 'center',
				},
				add: false,
			})
			.setOrigin(0.5)
		this.retryBtn = scene.make
			.text({
				x: width / 2,
				y: height / 2 + 50,
				text: '[ Retry ]',
				style: {
					font: '24px Retro Font',
					color: '#0f0',
					backgroundColor: '#222',
					padding: { left: 16, right: 16, top: 8, bottom: 8 },
				},
				add: false,
			})
			.setOrigin(0.5)
			.setInteractive({ useHandCursor: true })
			.setVisible(false)
		this.menuBtn = scene.make
			.text({
				x: width / 2,
				y: height / 2 + 100,
				text: '[ Menu ]',
				style: {
					font: '24px Retro Font',
					color: '#0ff',
					backgroundColor: '#222',
					padding: { left: 16, right: 16, top: 8, bottom: 8 },
				},
				add: false,
			})
			.setOrigin(0.5)
			.setInteractive({ useHandCursor: true })
		this.add([
			this.bg,
			this.panel,
			this.congratsText,
			this.scoreText,
			this.retryBtn,
			this.menuBtn,
		])
		this.retryBtn.on('pointerdown', () => {
			// Play click sound if not muted
			const settings = loadData().settings
			if (!settings.muted) {
				this.clickSound.play()
			}

			this.destroy()
			this.onRestart()
		})
		this.menuBtn.on('pointerdown', () => {
			// Play click sound if not muted
			const settings = loadData().settings
			if (!settings.muted) {
				this.clickSound.play()
			}

			this.destroy()
			this.onMenu()
		})
		this.escKeyHandler = () => {
			this.destroy()
			this.onMenu()
		}
		scene.input.keyboard!.on('keydown-ESC', this.escKeyHandler)
		this.setInteractive(
			new Phaser.Geom.Rectangle(0, 0, width, height),
			Phaser.Geom.Rectangle.Contains,
		)
		if (this.input) {
			this.input.enabled = true
		}
	}

	destroy(fromScene?: boolean) {
		if (this.escKeyHandler) {
			this.scene.input.keyboard!.off('keydown-ESC', this.escKeyHandler)
			this.escKeyHandler = undefined
		}
		super.destroy(fromScene)
	}
}
