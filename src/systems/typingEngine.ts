/**
 * Pure, DOM-free typing model.
 *
 * Deliberately knows nothing about Phaser so it can be reasoned about and
 * unit-tested in isolation.
 */

export type CharState = 'pending' | 'correct' | 'wrong'

export class TypingEngine {
	private word: string
	/** Per-index state, so a wrong char can be shown and then corrected. */
	private states: CharState[]
	private caret = 0
	/** Total wrong keystrokes across the current word. */
	private mistakes = 0

	constructor(word: string) {
		this.word = word
		this.states = word.split('').map(() => 'pending' as CharState)
	}

	get length(): number {
		return this.word.length
	}

	/**
	 * Feed a keystroke. Returns true only when it advanced the caret correctly,
	 * which is what the scoring layer keys off.
	 */
	input(char: string): boolean {
		if (this.caret >= this.word.length) return false
		const expected = this.word[this.caret]
		const upper = char.toUpperCase()

		if (upper === expected) {
			this.states[this.caret] = 'correct'
			this.caret++
			return true
		}

		// A wrong char is *recorded*, not rejected. The player must backspace it
		// out. This is how real typing trainers behave and it removes the
		// "mash and hope" failure mode.
		this.states[this.caret] = 'wrong'
		this.caret++
		this.mistakes++
		return false
	}

	/** Step back one character, clearing its error. */
	backspace(): boolean {
		if (this.caret === 0) return false
		this.caret--
		if (this.states[this.caret] === 'wrong') {
			this.states[this.caret] = 'pending'
			this.mistakes--
		}
		return true
	}

	/** A word is complete only when every char is correct. */
	isComplete(): boolean {
		return this.caret >= this.word.length && !this.hasErrors()
	}

	hasErrors(): boolean {
		return this.states.some((s) => s === 'wrong')
	}

	/** True when the player has consumed the whole word but some chars are wrong. */
	isExhausted(): boolean {
		return this.caret >= this.word.length
	}

	getMistakes(): number {
		return this.mistakes
	}

	getCaret(): number {
		return this.caret
	}

	getStates(): readonly CharState[] {
		return this.states
	}

	getWord(): string {
		return this.word
	}

	reset(word: string): void {
		this.word = word
		this.states = word.split('').map(() => 'pending' as CharState)
		this.caret = 0
		this.mistakes = 0
	}
}
