import Phaser from 'phaser'
import type { Card } from './playerDeck'
import { bodyFont, displayFont } from '../font'

const COL_PENDING = '#ffffff'
const COL_TYPED = '#00e676'
const COL_WRONG = '#ff1744'
const COL_CARET = '#ffd600'
const LETTER_GAP = 4
const PAD = 18

export interface CardStyle {
	fontSize: number
	accent: number
	caption: string
}

/**
 * One word card: a caption ("HEAVY · 13"), a plate, and per-letter text.
 *
 * Same approach as `WordDisplay`, but several can be on screen at once and
 * each tracks its own lit / dimmed / locked state.
 */
export class CardView {
	readonly container: Phaser.GameObjects.Container
	private readonly plate: Phaser.GameObjects.Rectangle
	private readonly caption: Phaser.GameObjects.Text
	private readonly timer: Phaser.GameObjects.Rectangle
	private chars: Phaser.GameObjects.Text[] = []
	private widths: number[] = []
	private word = ''
	private plateW = 0

	constructor(
		private readonly scene: Phaser.Scene,
		x: number,
		y: number,
		private readonly style: CardStyle,
	) {
		this.container = scene.add.container(x, y).setDepth(25)
		this.plate = scene.add
			.rectangle(0, 0, 10, style.fontSize + 26, 0x05080d, 0.72)
			.setStrokeStyle(2, style.accent, 0.35)
		this.caption = scene.add
			.text(0, -(style.fontSize / 2 + 26), style.caption, {
				fontFamily: displayFont(),
				fontSize: '16px',
				color: '#' + style.accent.toString(16).padStart(6, '0'),
			})
			.setOrigin(0.5)
		this.timer = scene.add
			.rectangle(0, style.fontSize / 2 + 17, 10, 5, style.accent, 1)
			.setVisible(false)
		this.container.add([this.plate, this.caption, this.timer])
	}

	setCaption(text: string): void {
		this.caption.setText(text)
	}

	setWord(word: string): void {
		if (word === this.word) return
		this.word = word
		for (const c of this.chars) c.destroy()
		this.chars = []
		this.widths = []
		const family = bodyFont()
		for (const ch of word) {
			const t = this.scene.add
				.text(0, 0, ch, {
					fontFamily: family,
					fontSize: `${this.style.fontSize}px`,
					color: COL_PENDING,
				})
				.setOrigin(0, 0.5)
			this.widths.push(t.width + LETTER_GAP)
			this.chars.push(t)
		}
		this.container.add(this.chars)

		const total = this.widths.reduce((a, b) => a + b, 0) - LETTER_GAP
		let x = -total / 2
		this.chars.forEach((c, i) => {
			c.setX(x)
			x += this.widths[i]
		})
		this.plateW = Math.max(120, total + PAD * 2)
		this.plate.setSize(this.plateW, this.style.fontSize + 26)
		this.plate.setDisplaySize(this.plateW, this.style.fontSize + 26)

		// Assemble left to right, like the runner's word plate.
		this.chars.forEach((c, i) => {
			c.setScale(0.5)
			this.scene.tweens.add({
				targets: c,
				scale: 1,
				duration: 180,
				delay: i * 14,
				ease: 'Back.easeOut',
			})
		})
	}

	/**
	 * @param active  this card has the caret
	 * @param locked  cannot be used yet (not enough meter)
	 * @param dimmed  another card is active
	 */
	render(
		card: Card,
		active: boolean,
		locked: boolean,
		dimmed: boolean,
	): void {
		this.setWord(card.word)
		const states = card.engine.getStates()
		const caret = card.engine.getCaret()
		this.chars.forEach((c, i) => {
			let color = COL_PENDING
			if (states[i] === 'correct') color = COL_TYPED
			else if (states[i] === 'wrong') color = COL_WRONG
			else if (active && i === caret) color = COL_CARET
			// The first letter is the "button": always pick it out.
			else if (!active && i === 0 && !locked) color = COL_CARET
			c.setColor(color)
		})
		this.container.setAlpha(locked ? 0.35 : dimmed ? 0.55 : 1)
		this.plate.setStrokeStyle(
			active ? 3 : 2,
			this.style.accent,
			active ? 1 : 0.35,
		)
	}

	/** 1 = full time left, 0 = about to land. Hidden when null. */
	setTimer(fraction: number | null): void {
		if (fraction === null) {
			this.timer.setVisible(false)
			return
		}
		const w = Math.max(0, Math.min(1, fraction)) * this.plateW
		this.timer.setVisible(true).setSize(w, 5).setDisplaySize(w, 5)
		this.timer.setFillStyle(fraction < 0.3 ? 0xff1744 : this.style.accent)
	}

	pop(): void {
		this.scene.tweens.add({
			targets: this.container,
			scale: 1.15,
			duration: 90,
			yoyo: true,
			ease: 'Quad.easeOut',
		})
	}

	shake(): void {
		const x = this.container.x
		this.scene.tweens.add({
			targets: this.container,
			x: x + 8,
			duration: 40,
			yoyo: true,
			repeat: 2,
			onComplete: () => this.container.setX(x),
		})
	}

	setVisible(v: boolean): void {
		this.container.setVisible(v)
	}

	destroy(): void {
		this.container.destroy()
	}
}
