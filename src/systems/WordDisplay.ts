import Phaser from 'phaser'
import type { TypingEngine } from './typingEngine'
import { bodyFont } from './font'

const COL_PENDING = '#ffffff'
const COL_TYPED = '#00e676'
const COL_WRONG = '#ff1744'
const COL_CARET = '#ffd600'

/** Spacing between characters, and the panel's inner padding. */
const LETTER_GAP = 6
const PANEL_PAD = 22

/**
 * Renders the current word one character at a time.
 *
 * Per-character objects (rather than three bulk Text runs) are what make it
 * possible to show a wrong letter in red, animate each keystroke, and let the
 * player backspace — all of which the previous approach could not do.
 */
export class WordDisplay {
	private readonly chars: Phaser.GameObjects.Text[] = []
	private readonly panel: Phaser.GameObjects.Rectangle
	private readonly container: Phaser.GameObjects.Container
	private charWidths: number[] = []
	private dangerTint = 0

	constructor(
		private readonly scene: Phaser.Scene,
		private readonly fontSize = 44,
	) {
		// The panel lives INSIDE the same container as the letters. Positioning
		// both independently in world space let them drift apart on resize and
		// read as a misaligned box; sharing a parent makes that impossible.
		this.container = scene.add
			.container(scene.scale.width / 2, this.baseY)
			.setDepth(20)

		this.panel = scene.add
			.rectangle(0, 0, 10, this.fontSize + 40, 0x05080d, 0.55)
			.setOrigin(0.5, 0.5)
			.setStrokeStyle(2, 0xffffff, 0.08)
		this.container.add(this.panel)
	}

	/**
	 * Word plate height, kept clear of the treeline so the whole plate reads as
	 * one shape. The lower half of the screen belongs to the runner, ground and
	 * monster, and must stay unobstructed.
	 */
	private get baseY(): number {
		return this.scene.scale.height * 0.25
	}

	/** Rebuild the character objects for a new word. */
	setWord(word: string): void {
		for (const c of this.chars) c.destroy()
		this.chars.length = 0
		this.charWidths = []

		// Resolved per word rather than cached in the constructor, so a change in
		// the pause menu applies to the next word without a reload.
		const family = bodyFont()

		for (let i = 0; i < word.length; i++) {
			const t = this.scene.add
				.text(0, 0, word[i], {
					fontFamily: family,
					fontSize: `${this.fontSize}px`,
					color: COL_PENDING,
				})
				.setOrigin(0, 0.5)
			this.charWidths.push(t.width + LETTER_GAP)
			this.chars.push(t)
			this.container.add(t)
		}
		this.layout()
	}

	private get totalWidth(): number {
		return this.charWidths.reduce((a, b) => a + b, 0)
	}

	/**
	 * Centre the word inside the container.
	 *
	 * Letters are laid out in container-local coordinates starting at
	 * -totalWidth/2, and the plate is sized from the same measurement, so the
	 * two are centred by construction rather than by two parallel calculations
	 * that can disagree.
	 */
	private layout(): void {
		let x = -this.totalWidth / 2
		for (let i = 0; i < this.chars.length; i++) {
			this.chars[i].setX(x)
			x += this.charWidths[i]
		}
		this.panel.setSize(
			this.totalWidth - LETTER_GAP + PANEL_PAD * 2,
			this.fontSize + 40,
		)
	}

	/** Sync colours and the caret highlight from engine state. */
	render(engine: TypingEngine): void {
		const states = engine.getStates()
		const caret = engine.getCaret()
		for (let i = 0; i < this.chars.length; i++) {
			const state = states[i]
			let color = COL_PENDING
			if (state === 'correct') color = COL_TYPED
			else if (state === 'wrong') color = COL_WRONG
			else if (i === caret) color = COL_CARET

			this.chars[i].setColor(color)
			// Slight scale pop on the active caret sells the keystroke.
			const want = i === caret ? 1.18 : 1
			this.chars[i].setScale(
				Phaser.Math.Linear(this.chars[i].scaleX, want, 0.4),
			)
		}
		// The plate is a readability aid, so it must not compete with the
		// letters for attention even at full danger.
		this.panel.setAlpha(0.55)
	}

	/**
	 * @param threat 0 = monster far away, 1 = about to hit. Ramps the panel tint.
	 */
	setDanger(threat: number): void {
		this.dangerTint = Phaser.Math.Clamp(threat, 0, 1)
		const r = Math.floor(Phaser.Math.Linear(5, 40, this.dangerTint))
		const g = Math.floor(Phaser.Math.Linear(8, 6, this.dangerTint))
		const b = Math.floor(Phaser.Math.Linear(13, 12, this.dangerTint))
		this.panel.setFillStyle((r << 16) | (g << 8) | b, 0.55)
		this.panel.setStrokeStyle(
			2,
			this.dangerTint > 0.45 ? 0xff1744 : 0xffffff,
			0.1 + this.dangerTint * 0.5,
		)
	}

	/** Slide the new word in. Called when a word is dealt, not every frame. */
	animateIn(): void {
		this.container.setAlpha(0)
		this.scene.tweens.add({
			targets: this.container,
			alpha: 1,
			duration: 140,
			ease: 'Quad.easeOut',
		})
		// One tween per character, delayed by index, so the word assembles
		// left-to-right instead of popping in as a block.
		this.chars.forEach((c, i) => {
			c.setScale(0.55)
			this.scene.tweens.add({
				targets: c,
				scale: 1,
				duration: 220,
				delay: i * 18,
				ease: 'Back.easeOut',
			})
		})
	}

	/**
	 * Punch the word forward when it is completed.
	 *
	 * Deliberately not a fly-apart animation: the next word is dealt
	 * immediately, so a long flourish would lock the player out of typing for
	 * the duration of it.
	 */
	celebrate(): void {
		this.scene.tweens.add({
			targets: this.chars,
			scale: 1.35,
			duration: 110,
			yoyo: true,
			ease: 'Quad.easeOut',
		})
	}

	relayout(): void {
		this.container.setPosition(this.scene.scale.width / 2, this.baseY)
		this.layout()
	}

	setVisible(v: boolean): void {
		// The panel is a child of the container, so this covers both.
		this.container.setVisible(v)
	}

	destroy(): void {
		for (const c of this.chars) c.destroy()
		this.chars.length = 0
		// Destroying the container takes the panel with it.
		this.container.destroy()
	}
}
