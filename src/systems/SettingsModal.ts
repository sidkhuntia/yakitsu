import Phaser from 'phaser'
import { updateSettings, loadData, saveRun } from './persistence'
import Play from '../scenes/Play'

export class SettingsModal extends Phaser.GameObjects.Container {
	private bg: Phaser.GameObjects.Rectangle
	private panel: Phaser.GameObjects.Rectangle
	private musicBtn: Phaser.GameObjects.Text
	private lockInputBtn: Phaser.GameObjects.Text
	private quitBtn: Phaser.GameObjects.Text
	private clearBtn: Phaser.GameObjects.Text
	private closeBtn: Phaser.GameObjects.Text
	private onClose: () => void
	private clickSound: Phaser.Sound.BaseSound

	constructor(scene: Phaser.Scene, onClose: () => void) {
		super(scene)
		this.onClose = onClose
		const { width, height } = scene.scale

		// Add click sound
		this.clickSound = scene.sound.add('clickSound', { volume: 0.7 })

		this.bg = scene.add
			.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5)
			.setInteractive()
		this.panel = scene.add
			.rectangle(width / 2, height / 2, 400, 320, 0x222233, 0.98)
			.setStrokeStyle(2, 0x8888aa)
		const baseY = height / 2 - 80
		this.musicBtn = scene.add
			.text(width / 2, baseY, '', {
				fontFamily: 'Retro Font',
				fontSize: '24px',
				color: '#fff',
				backgroundColor: '#333',
				padding: { left: 12, right: 12, top: 6, bottom: 6 },
			})
			.setOrigin(0.5)
			.setInteractive()
		this.lockInputBtn = scene.add
			.text(width / 2, baseY + 60, '', {
				fontFamily: 'Retro Font',
				fontSize: '20px',
				color: '#fff',
				backgroundColor: '#333',
				padding: { left: 12, right: 12, top: 6, bottom: 6 },
			})
			.setOrigin(0.5)
			.setInteractive()
		this.quitBtn = scene.add
			.text(width / 2, baseY + 120, 'Quit to Menu', {
				fontFamily: 'Retro Font',
				fontSize: '20px',
				color: '#f39c12',
				backgroundColor: '#333',
				padding: { left: 12, right: 12, top: 6, bottom: 6 },
			})
			.setOrigin(0.5)
			.setInteractive()
		this.clearBtn = scene.add
			.text(width / 2, baseY + 180, 'Clear Highscores', {
				fontFamily: 'Retro Font',
				fontSize: '20px',
				color: '#f44',
				backgroundColor: '#333',
				padding: { left: 12, right: 12, top: 6, bottom: 6 },
			})
			.setOrigin(0.5)
			.setInteractive()
		this.closeBtn = scene.add
			.text(width / 2, baseY + 240, '[ Close ]', {
				fontFamily: 'Retro Font',
				fontSize: '20px',
				color: '#0ff',
				backgroundColor: '#222',
				padding: { left: 12, right: 12, top: 6, bottom: 6 },
			})
			.setOrigin(0.5)
			.setInteractive()
		this.add([
			this.bg,
			this.panel,
			this.musicBtn,
			this.lockInputBtn,
			this.quitBtn,
			this.clearBtn,
			this.closeBtn,
		])
		this.refresh()

		this.musicBtn.on('pointerdown', () => {
			const settings = loadData().settings
			const newMutedSetting = !settings.muted
			updateSettings({ muted: newMutedSetting })

			// Play click sound if we're unmuting
			if (newMutedSetting) {
				this.clickSound.play()
			}

			// Handle all game sounds
			this.updateAllGameSounds(newMutedSetting)

			this.refresh()
		})

		this.lockInputBtn.on('pointerdown', () => {
			const settings = loadData().settings
			updateSettings({ lockInputOnMistake: !settings.lockInputOnMistake })

			// Play click sound if not muted
			if (!settings.muted) {
				this.clickSound.play()
			}

			this.refresh()
		})

		this.quitBtn.on('pointerdown', () => {
			const settings = loadData().settings
			// Play click sound if not muted
			if (!settings.muted) {
				this.clickSound.play()
			}

			// Get current score from the Play scene
			const playScene = this.scene.scene.get('Play') as Play
			if (playScene && playScene.score !== undefined) {
				// Save the current score
				saveRun(playScene.score)
			}

			// Destroy modal and quit to menu
			this.destroy()
			this.scene.scene.start('Menu')
		})

		this.clearBtn.on('pointerdown', () => {
			localStorage.removeItem('yatiksu-save-v1')
			saveRun(0)

			// Play click sound if not muted
			const settings = loadData().settings
			if (!settings.muted) {
				this.clickSound.play()
			}

			this.refresh()
		})

		this.closeBtn.on('pointerdown', () => {
			// Play click sound if not muted
			const settings = loadData().settings
			if (!settings.muted) {
				this.clickSound.play()
			}

			this.destroy()
			this.onClose()
		})

		this.setInteractive(
			new Phaser.Geom.Rectangle(0, 0, width, height),
			Phaser.Geom.Rectangle.Contains,
		)
		if (this.input) {
			this.input.enabled = true
		}
	}

	refresh() {
		const settings = loadData().settings
		this.musicBtn.setText(
			settings.muted ? 'Music/SFX: OFF' : 'Music/SFX: ON',
		)
		this.lockInputBtn.setText(
			settings.lockInputOnMistake
				? 'Lock Input on Mistake: ON'
				: 'Lock Input on Mistake: OFF',
		)
	}

	updateAllGameSounds(muted: boolean) {
		// Get all sound instances from the registry and current scene
		const menuMusic = this.scene.game.registry.get(
			'menuMusic',
		) as Phaser.Sound.BaseSound

		// Handle menu music
		if (menuMusic) {
			if (muted) {
				menuMusic.pause()
			} else {
				// Don't resume menu music if we're in the Play scene
				if (this.scene.scene.key === 'Menu') {
					menuMusic.resume()
				}
			}
		}
	}
}
