import Phaser from 'phaser'
import {
	clearHighscores,
	loadData,
	updateSettings,
	type Settings,
} from './persistence'

const PANEL_W = 480
const ROW_H = 46
const ROWS_TOP = 92
/**
 * Derived from the row count rather than hand-tuned, so adding a setting cannot
 * silently push the action buttons outside the panel.
 *   rows bottom + hint + button stack (3 x 44) + bottom margin
 */
const ROW_COUNT = 7
const PANEL_H = ROWS_TOP + (ROW_COUNT - 1) * ROW_H + 30 + 60 + 3 * 44 + 28
/** Vertical gap between the settings rows and the action buttons. */
const BUTTONS_TOP = 60

type Row = {
	label: () => string
	toggle: (s: Settings) => boolean
	flip: (s: Settings) => Partial<Settings>
	help: string
}

/**
 * Pause / settings overlay.
 *
 * Doubles as the pause menu, so it is the only settings surface the player
 * needs during a run. Every control writes through to persistence immediately
 * so nothing is lost on restart.
 */
export class SettingsModal extends Phaser.GameObjects.Container {
	private readonly rows: Row[] = [
		{
			label: () => {
				const s = loadData().settings
				return `Sound: ${s.muted ? 'OFF' : 'ON'}`
			},
			toggle: (s) => !s.muted,
			flip: (s) => ({ muted: !s.muted }),
			help: 'Mute or unmute all audio',
		},
		{
			label: () => {
				const s = loadData().settings
				return `Music: ${Math.round(s.musicVolume * 100)}%`
			},
			toggle: (s) => s.musicVolume > 0,
			flip: (s) => ({
				musicVolume: s.musicVolume > 0 ? 0 : 0.35,
			}),
			help: 'Background music volume',
		},
		{
			label: () => {
				const s = loadData().settings
				return `Screen shake: ${s.screenShake ? 'ON' : 'OFF'}`
			},
			toggle: (s) => s.screenShake,
			flip: (s) => ({ screenShake: !s.screenShake }),
			help: 'Camera shake on hits and kills',
		},
		{
			label: () => {
				const s = loadData().settings
				return `Strict typing: ${s.lockInputOnMistake ? 'ON' : 'OFF'}`
			},
			toggle: (s) => s.lockInputOnMistake,
			flip: (s) => ({ lockInputOnMistake: !s.lockInputOnMistake }),
			help: 'Harder: a wrong key costs more time',
		},
		{
			label: () => {
				const s = loadData().settings
				return `Assist: ${Math.round(s.assistLevel * 100)}%`
			},
			toggle: (s) => s.assistLevel >= 1,
			flip: (s) => ({
				assistLevel: s.assistLevel >= 1 ? 0.7 : 1,
			}),
			help: 'Slower monsters if you need more time',
		},
		{
			label: () => {
				const s = loadData().settings
				return `Readability font: ${s.dyslexicFont ? 'ON' : 'OFF'}`
			},
			toggle: (s) => s.dyslexicFont,
			flip: (s) => ({ dyslexicFont: !s.dyslexicFont }),
			help: 'A clearer typeface for the words you have to read',
		},
		{
			label: () => {
				const s = loadData().settings
				return `Danger zone: ${s.showDangerZone ? 'ON' : 'OFF'}`
			},
			toggle: (s) => s.showDangerZone,
			flip: (s) => ({ showDangerZone: !s.showDangerZone }),
			help: 'Screen-edge warning as the monster closes in',
		},
	]

	private readonly buttons: Phaser.GameObjects.Text[] = []
	private readonly resumeBtn: Phaser.GameObjects.Text
	private readonly restartBtn: Phaser.GameObjects.Text
	private readonly menuBtn: Phaser.GameObjects.Text
	private readonly escHandler: () => void
	private clickSound?: Phaser.Sound.BaseSound

	constructor(
		private readonly hostScene: Phaser.Scene,
		private readonly onClose: () => void,
	) {
		super(hostScene)
		const scene = hostScene
		const { width, height } = scene.scale
		const cx = width / 2

		this.clickSound = scene.cache.audio.exists('clickSound')
			? scene.sound.add('clickSound', { volume: 0.5 })
			: undefined

		const dim = scene.add
			.rectangle(cx, height / 2, width, height, 0x05080d, 0.82)
			.setInteractive()

		// Lay the panel out from its top edge so the content can never overflow
		// the frame, whatever the row count.
		const top = height / 2 - PANEL_H / 2

		const panel = scene.add
			.rectangle(cx, height / 2, PANEL_W, PANEL_H, 0x0b1018, 0.98)
			.setStrokeStyle(3, 0x64ffda)

		const title = scene.add
			.text(cx, top + 40, 'PAUSED', {
				fontFamily: 'Retro Font',
				fontSize: '30px',
				color: '#ffffff',
			})
			.setOrigin(0.5)

		// Rows
		const startY = top + ROWS_TOP
		this.rows.forEach((row, i) => {
			const y = startY + i * ROW_H
			const btn = scene.add
				.text(cx, y, row.label(), {
					fontFamily: 'Retro Font',
					fontSize: '18px',
					color: '#e6f1ff',
					backgroundColor: '#141d2b',
					padding: { left: 14, right: 14, top: 7, bottom: 7 },
				})
				.setOrigin(0.5)
				.setInteractive({ useHandCursor: true })
			btn.on('pointerover', () => btn.setScale(1.04))
			btn.on('pointerout', () => btn.setScale(1))
			btn.on('pointerdown', () => {
				if (!loadData().settings.muted) this.clickSound?.play()
				const s = loadData().settings
				updateSettings(row.flip(s))
				this.refresh()
			})
			this.buttons.push(btn)
		})

		// One line of context for the whole panel rather than per-row help,
		// which would need hover state to be useful.
		const rowsBottom = startY + (this.rows.length - 1) * ROW_H
		const hint = scene.add
			.text(
				cx,
				rowsBottom + 30,
				'Lower Assist gives you more time per word',
				{
					fontFamily: 'Retro Font',
					fontSize: '13px',
					color: '#7f8fa6',
				},
			)
			.setOrigin(0.5)

		const mkBtn = (
			label: string,
			y: number,
			color: number,
			action: () => void,
		): Phaser.GameObjects.Text => {
			const t = scene.add
				.text(cx, y, label, {
					fontFamily: 'Retro Font',
					fontSize: '19px',
					color: '#08131f',
					backgroundColor: `#${color.toString(16).padStart(6, '0')}`,
					padding: { left: 16, right: 16, top: 7, bottom: 7 },
				})
				.setOrigin(0.5)
				.setInteractive({ useHandCursor: true })
			t.on('pointerover', () => t.setScale(1.05))
			t.on('pointerout', () => t.setScale(1))
			t.on('pointerdown', () => {
				if (!loadData().settings.muted) this.clickSound?.play()
				action()
			})
			return t
		}

		// Buttons stack downward from a computed anchor, with the last one
		// landing exactly on the panel's bottom margin.
		const btnTop = rowsBottom + BUTTONS_TOP
		this.resumeBtn = mkBtn('[ RESUME ]  ESC', btnTop, 0x00e676, () =>
			this.close(),
		)
		this.restartBtn = mkBtn('[ RESTART ]', btnTop + 44, 0xffb300, () => {
			this.destroy()
			this.hostScene.scene.restart()
		})
		this.menuBtn = mkBtn('[ QUIT TO MENU ]', btnTop + 88, 0x546e7a, () => {
			this.destroy()
			window.dispatchEvent(new CustomEvent('returnToMenu'))
		})

		// Clear save, tucked into the corner so it can't be hit by accident.
		const clear = scene.add
			.text(cx - PANEL_W / 2 + 18, top + PANEL_H - 16, 'reset data', {
				fontFamily: 'Retro Font',
				fontSize: '13px',
				color: '#ff5252',
			})
			.setOrigin(0, 0.5)
			.setInteractive({ useHandCursor: true })
		clear.on('pointerdown', () => {
			clearHighscores()
			this.refresh()
		})

		this.add([
			dim,
			panel,
			title,
			...this.buttons,
			hint,
			this.resumeBtn,
			this.restartBtn,
			this.menuBtn,
			clear,
		])

		this.escHandler = () => this.close()
		scene.input.keyboard?.on('keydown-ESC', this.escHandler)

		this.setInteractive(
			new Phaser.Geom.Rectangle(0, 0, width, height),
			Phaser.Geom.Rectangle.Contains,
		)
	}

	private close(): void {
		this.destroy()
		this.onClose()
	}

	refresh(): void {
		const s = loadData().settings
		this.rows.forEach((row, i) => this.buttons[i].setText(row.label()))
		void s
	}

	override destroy(fromScene?: boolean): void {
		this.hostScene.input.keyboard?.off('keydown-ESC', this.escHandler)
		this.clickSound?.destroy()
		super.destroy(fromScene)
	}
}
