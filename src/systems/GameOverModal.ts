import Phaser from 'phaser'
import { loadData } from './persistence'

export class GameOverModal extends Phaser.GameObjects.Container {
	private bg: Phaser.GameObjects.Rectangle
	private panel: Phaser.GameObjects.Rectangle
	private scoreText: Phaser.GameObjects.Text
	private statsText: Phaser.GameObjects.Text
	private retryBtn: Phaser.GameObjects.Text
	private menuBtn: Phaser.GameObjects.Text
	private onRetry: () => void
	private onMenu: () => void
	private escKeyHandler?: () => void
	private clickSound: Phaser.Sound.BaseSound
	private titleText: Phaser.GameObjects.Text
	private bestText: Phaser.GameObjects.Text

	constructor(
		scene: Phaser.Scene,
		score: number,
		bestScore: number,
		wpm: number,
		accuracy: number,
		onRetry: () => void,
		onMenu: () => void,
	) {
		super(scene)
		this.onRetry = onRetry
		this.onMenu = onMenu
		const { width, height } = scene.scale

		// Add click sound
		this.clickSound = scene.sound.add('clickSound', { volume: 0.7 })

		this.bg = scene.add
			.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7)
			.setInteractive()
		this.panel = scene.add
			.rectangle(width / 2, height / 2, 500, 400, 0x0f1419, 0.98)
			.setStrokeStyle(3, 0x00e676)

		// Game Over title
		let titleText = 'Game Over'
		if (score >= bestScore && score > 0) {
			titleText = 'New Best! Game Over'
		}
		this.titleText = scene.add
			.text(width / 2, height / 2 - 120, titleText, {
				fontFamily: 'Retro Font',
				fontSize: '36px',
				color: '#ff5722',
			})
			.setOrigin(0.5)

		// Score display
		this.scoreText = scene.add
			.text(width / 2, height / 2 - 60, `Final Score: ${score}`, {
				fontFamily: 'Retro Font',
				fontSize: '24px',
				color: '#e1f5fe',
			})
			.setOrigin(0.5)

		// Best score display
		this.bestText = scene.add
			.text(width / 2, height / 2 - 30, `Best Score: ${bestScore}`, {
				fontFamily: 'Retro Font',
				fontSize: '20px',
				color: '#64ffda',
			})
			.setOrigin(0.5)

		// Stats display
		this.statsText = scene.add
			.text(
				width / 2,
				height / 2 + 10,
				`WPM: ${wpm} | Accuracy: ${accuracy}%`,
				{
					fontFamily: 'Retro Font',
					fontSize: '18px',
					color: '#00e676',
				},
			)
			.setOrigin(0.5)

		this.retryBtn = scene.make
			.text({
				x: width / 2,
				y: height / 2 + 60,
				text: '[ Try Again ]',
				style: {
					font: '24px Retro Font',
					color: '#e1f5fe',
					backgroundColor: '#1976d2',
					padding: { left: 16, right: 16, top: 8, bottom: 8 },
				},
				add: false,
			})
			.setOrigin(0.5)
			.setInteractive({ useHandCursor: true })

		this.menuBtn = scene.make
			.text({
				x: width / 2,
				y: height / 2 + 110,
				text: '[ Menu ]',
				style: {
					font: '20px Retro Font',
					color: '#e1f5fe',
					backgroundColor: '#2e7d32',
					padding: { left: 16, right: 16, top: 8, bottom: 8 },
				},
				add: false,
			})
			.setOrigin(0.5)
			.setInteractive({ useHandCursor: true })

		this.add([
			this.bg,
			this.panel,
			this.titleText,
			this.scoreText,
			this.bestText,
			this.statsText,
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
			this.onRetry()
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
