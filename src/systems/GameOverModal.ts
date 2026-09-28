import Phaser from 'phaser'
import { loadData } from './persistence'
import type { DifficultyProfile } from './tuning'

export interface GameOverSummary {
	score: number
	wpm: number
	accuracy: number
	combo: number
	words: number
	level: number
	durationSec: number
	isRecord: boolean
	difficulty: DifficultyProfile
	personalBests: {
		score: number
		wpm: number
		accuracy: number
		combo: number
	}
	retry: () => void
	menu: () => void
}

function fmtDuration(sec: number): string {
	const s = Math.floor(sec)
	return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * End-of-run results.
 *
 * Shows the run against the personal best for the difficulty that was just
 * played, which is the comparison a player actually cares about.
 */
export class GameOverModal extends Phaser.GameObjects.Container {
	private readonly onRetry: () => void
	private readonly onMenu: () => void
	private readonly escHandler: () => void
	private readonly enterHandler: () => void
	private clickSound?: Phaser.Sound.BaseSound

	constructor(scene: Phaser.Scene, summary: GameOverSummary) {
		super(scene)
		this.onRetry = summary.retry
		this.onMenu = summary.menu

		const { width, height } = scene.scale
		const cx = width / 2
		const cy = height / 2
		const accent = summary.difficulty.color
		const hex = `#${accent.toString(16).padStart(6, '0')}`

		this.clickSound = scene.cache.audio.exists('clickSound')
			? scene.sound.add('clickSound', { volume: 0.5 })
			: undefined

		const dim = scene.add
			.rectangle(cx, cy, width, height, 0x05080d, 0.86)
			.setInteractive()

		const panelW = 560
		const panelH = 470
		const panel = scene.add
			.rectangle(cx, cy, panelW, panelH, 0x0b1018, 0.98)
			.setStrokeStyle(3, accent)

		const title = scene.add
			.text(
				cx,
				cy - panelH / 2 + 44,
				summary.isRecord ? 'NEW RECORD' : 'RUN OVER',
				{
					fontFamily: 'Retro Font',
					fontSize: '34px',
					color: summary.isRecord ? '#00e676' : '#ff5252',
				},
			)
			.setOrigin(0.5)

		const diff = scene.add
			.text(
				cx,
				cy - panelH / 2 + 76,
				summary.difficulty.label.toUpperCase(),
				{
					fontFamily: 'Retro Font',
					fontSize: '16px',
					color: hex,
				},
			)
			.setOrigin(0.5)

		// Hero score.
		const scoreY = cy - panelH / 2 + 128
		const score = scene.add
			.text(cx, scoreY, summary.score.toLocaleString(), {
				fontFamily: 'Retro Font',
				fontSize: '56px',
				color: '#ffffff',
			})
			.setOrigin(0.5)
		const scoreLabel = scene.add
			.text(cx, scoreY + 36, 'SCORE', {
				fontFamily: 'Retro Font',
				fontSize: '13px',
				color: '#7f8fa6',
			})
			.setOrigin(0.5)

		// Stat grid: this run vs personal best for the same difficulty.
		const gridY = cy - 20
		const colX = [cx - 130, cx, cx + 130]
		const stats: Array<[string, string, string]> = [
			['wpm', String(summary.wpm), String(summary.personalBests.wpm)],
			[
				'acc',
				`${summary.accuracy}%`,
				`${summary.personalBests.accuracy}%`,
			],
			[
				'combo',
				String(summary.combo),
				String(summary.personalBests.combo),
			],
		]
		const statEls: Phaser.GameObjects.GameObject[] = []
		stats.forEach(([label, value, best], i) => {
			statEls.push(
				scene.add
					.text(colX[i], gridY - 30, label.toUpperCase(), {
						fontFamily: 'Retro Font',
						fontSize: '13px',
						color: '#7f8fa6',
					})
					.setOrigin(0.5),
			)
			statEls.push(
				scene.add
					.text(colX[i], gridY, value, {
						fontFamily: 'Retro Font',
						fontSize: '30px',
						color: '#ffffff',
					})
					.setOrigin(0.5),
			)
			statEls.push(
				scene.add
					.text(colX[i], gridY + 24, `best ${best}`, {
						fontFamily: 'Retro Font',
						fontSize: '13px',
						color: '#00e676',
					})
					.setOrigin(0.5),
			)
		})

		// Run summary line.
		const summaryText = scene.add
			.text(
				cx,
				gridY + 62,
				`${summary.words} words   ·   level ${summary.level}   ·   ${fmtDuration(summary.durationSec)}`,
				{
					fontFamily: 'Retro Font',
					fontSize: '15px',
					color: '#9fb3c8',
				},
			)
			.setOrigin(0.5)

		// A PB earned this run is worth calling out explicitly.
		const improvements: string[] = []
		if (summary.score >= summary.personalBests.score && summary.score > 0) {
			improvements.push('score')
		}
		const pbLine = improvements.length
			? scene.add
					.text(
						cx,
						gridY + 90,
						`NEW BEST ${improvements.join(' + ').toUpperCase()}!`,
						{
							fontFamily: 'Retro Font',
							fontSize: '16px',
							color: '#00e676',
						},
					)
					.setOrigin(0.5)
			: null

		const button = (
			label: string,
			y: number,
			color: number,
			action: () => void,
		): Phaser.GameObjects.Text => {
			const t = scene.add
				.text(cx, y, label, {
					fontFamily: 'Retro Font',
					fontSize: '20px',
					color: '#08131f',
					backgroundColor: `#${color.toString(16).padStart(6, '0')}`,
					padding: { left: 18, right: 18, top: 8, bottom: 8 },
				})
				.setOrigin(0.5)
				.setInteractive({ useHandCursor: true })
			t.on('pointerover', () => t.setScale(1.06))
			t.on('pointerout', () => t.setScale(1))
			t.on('pointerdown', () => {
				if (!loadData().settings.muted) this.clickSound?.play()
				this.destroy()
				action()
			})
			return t
		}

		const retryBtn = button(
			'[ RETRY ]  ⏎',
			cy + panelH / 2 - 78,
			0x00e676,
			this.onRetry,
		)
		const menuBtn = button(
			'[ MENU ]  ESC',
			cy + panelH / 2 - 30,
			0x2c3e50,
			this.onMenu,
		)

		this.add([
			dim,
			panel,
			title,
			diff,
			score,
			scoreLabel,
			...statEls,
			summaryText,
			...(pbLine ? [pbLine] : []),
			retryBtn,
			menuBtn,
		])

		// Entrance: scale the panel up so the result lands rather than appears.
		panel.setScale(0.9, 0.9)
		scene.tweens.add({
			targets: panel,
			scaleX: 1,
			scaleY: 1,
			duration: 220,
			ease: 'Back.easeOut',
		})
		for (const o of [title, score, summaryText]) {
			o.setAlpha(0)
			scene.tweens.add({
				targets: o,
				alpha: 1,
				duration: 260,
				delay: 90,
			})
		}

		// Keyboard: Enter retries, Escape returns to menu.
		this.enterHandler = () => {
			this.destroy()
			this.onRetry()
		}
		this.escHandler = () => {
			this.destroy()
			this.onMenu()
		}
		scene.input.keyboard?.on('keydown-ENTER', this.enterHandler)
		scene.input.keyboard?.on('keydown-ESC', this.escHandler)

		this.setInteractive(
			new Phaser.Geom.Rectangle(0, 0, width, height),
			Phaser.Geom.Rectangle.Contains,
		)
	}

	override destroy(fromScene?: boolean): void {
		const kb = this.scene.input.keyboard
		if (kb) {
			kb.off('keydown-ENTER', this.enterHandler)
			kb.off('keydown-ESC', this.escHandler)
		}
		this.clickSound?.destroy()
		super.destroy(fromScene)
	}
}
