import Phaser from 'phaser'
import { loadData } from './persistence'

export class GameOverModal extends Phaser.GameObjects.Container {
	private bg: Phaser.GameObjects.Rectangle
	private panel: Phaser.GameObjects.Rectangle
	private scoreText: Phaser.GameObjects.Text
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
		thisRunCombo: number,
		bestWPM: number,
		bestAccuracy: number,
		longestCombo: number,
		onRetry: () => void,
		onMenu: () => void,
	) {
		super(scene)
		this.onRetry = onRetry
		this.onMenu = onMenu
		const { width, height } = scene.scale

		// Add click sound
		this.clickSound = scene.sound.add('clickSound', { volume: 0.7 })

		const cx = width / 2
		const cy = height / 2

		this.bg = scene.add
			.rectangle(cx, cy, width, height, 0x000000, 0.7)
			.setInteractive()

		// MonkeyType-style: compact stats grid, larger panel for breathing room
		const panelWidth = 480
		const panelHeight = 420
		this.panel = scene.add
			.rectangle(cx, cy, panelWidth, panelHeight, 0x0f1419, 0.98)
			.setStrokeStyle(3, 0x00e676)

		// Title
		let titleStr = 'Game Over'
		if (score >= bestScore && score > 0) {
			titleStr = 'New Best!'
		}
		this.titleText = scene.add
			.text(cx, cy - panelHeight / 2 + 45, titleStr, {
				fontFamily: 'Retro Font',
				fontSize: '32px',
				color: '#ff5722',
			})
			.setOrigin(0.5)

		// Score row (MonkeyType-style: big numbers)
		this.scoreText = scene.add
			.text(cx - 60, cy - panelHeight / 2 + 95, `${score}`, {
				fontFamily: 'Retro Font',
				fontSize: '28px',
				color: '#e1f5fe',
			})
			.setOrigin(0.5)

		this.bestText = scene.add
			.text(cx + 60, cy - panelHeight / 2 + 95, `${bestScore}`, {
				fontFamily: 'Retro Font',
				fontSize: '28px',
				color: '#64ffda',
			})
			.setOrigin(0.5)

		// Stats grid (MonkeyType-style: label above value)
		const statStyle = { fontFamily: 'Retro Font', fontSize: '16px' }
		const statLabelStyle = {
			fontFamily: 'Retro Font',
			fontSize: '12px',
			color: '#78909c',
		}
		const statY = cy - 30
		const statSpacing = 100

		// This run stats - add to container
		const statEls: Phaser.GameObjects.GameObject[] = []
		statEls.push(
			scene.add
				.text(cx - statSpacing, statY - 18, 'wpm', statLabelStyle)
				.setOrigin(0.5),
		)
		statEls.push(
			scene.add
				.text(cx - statSpacing, statY, `${wpm}`, {
					...statStyle,
					color: '#00e676',
				})
				.setOrigin(0.5),
		)
		statEls.push(
			scene.add
				.text(cx, statY - 18, 'acc', statLabelStyle)
				.setOrigin(0.5),
		)
		statEls.push(
			scene.add
				.text(cx, statY, `${accuracy}%`, {
					...statStyle,
					color: '#00e676',
				})
				.setOrigin(0.5),
		)
		statEls.push(
			scene.add
				.text(cx + statSpacing, statY - 18, 'combo', statLabelStyle)
				.setOrigin(0.5),
		)
		statEls.push(
			scene.add
				.text(cx + statSpacing, statY, `${thisRunCombo}`, {
					...statStyle,
					color: '#00e676',
				})
				.setOrigin(0.5),
		)

		// Personal bests (only if we have any)
		if (bestWPM > 0 || bestAccuracy > 0 || longestCombo > 0) {
			const pbY = statY + 55
			statEls.push(
				scene.add
					.text(cx, pbY - 32, 'personal bests', {
						fontFamily: 'Retro Font',
						fontSize: '12px',
						color: '#78909c',
					})
					.setOrigin(0.5),
			)
			statEls.push(
				scene.add
					.text(cx - statSpacing, pbY - 8, 'wpm', statLabelStyle)
					.setOrigin(0.5),
			)
			statEls.push(
				scene.add
					.text(cx - statSpacing, pbY + 10, `${bestWPM}`, {
						...statStyle,
						color: '#64ffda',
					})
					.setOrigin(0.5),
			)
			statEls.push(
				scene.add
					.text(cx, pbY - 8, 'acc', statLabelStyle)
					.setOrigin(0.5),
			)
			statEls.push(
				scene.add
					.text(cx, pbY + 10, `${bestAccuracy}%`, {
						...statStyle,
						color: '#64ffda',
					})
					.setOrigin(0.5),
			)
			statEls.push(
				scene.add
					.text(cx + statSpacing, pbY - 8, 'combo', statLabelStyle)
					.setOrigin(0.5),
			)
			statEls.push(
				scene.add
					.text(cx + statSpacing, pbY + 10, `${longestCombo}`, {
						...statStyle,
						color: '#64ffda',
					})
					.setOrigin(0.5),
			)
		}

		// Buttons with clear spacing
		this.retryBtn = scene.make
			.text({
				x: cx,
				y: cy + panelHeight / 2 - 100,
				text: '[ Try Again ]',
				style: {
					font: '22px Retro Font',
					color: '#e1f5fe',
					backgroundColor: '#1976d2',
					padding: { left: 14, right: 14, top: 6, bottom: 6 },
				},
				add: false,
			})
			.setOrigin(0.5)
			.setInteractive({ useHandCursor: true })

		this.menuBtn = scene.make
			.text({
				x: cx,
				y: cy + panelHeight / 2 - 55,
				text: '[ Menu ]',
				style: {
					font: '20px Retro Font',
					color: '#e1f5fe',
					backgroundColor: '#2e7d32',
					padding: { left: 14, right: 14, top: 6, bottom: 6 },
				},
				add: false,
			})
			.setOrigin(0.5)
			.setInteractive({ useHandCursor: true })

		// Add score labels (created with scene.add, need to be in container)
		const scoreLabelLeft = scene.add
			.text(cx - 60, cy - panelHeight / 2 + 125, 'score', {
				fontFamily: 'Retro Font',
				fontSize: '14px',
				color: '#78909c',
			})
			.setOrigin(0.5)
		const scoreLabelRight = scene.add
			.text(cx + 60, cy - panelHeight / 2 + 125, 'best', {
				fontFamily: 'Retro Font',
				fontSize: '14px',
				color: '#78909c',
			})
			.setOrigin(0.5)

		this.add([
			this.bg,
			this.panel,
			this.titleText,
			this.scoreText,
			this.bestText,
			scoreLabelLeft,
			scoreLabelRight,
			...statEls,
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
