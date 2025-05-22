export class TypingEngine {
	private word: string
	private typed: string

	constructor(word: string) {
		this.word = word
		this.typed = ''
	}

	input(char: string): boolean {
		if (
			this.typed.length < this.word.length &&
			char === this.word[this.typed.length]
		) {
			this.typed += char
			return true
		}
		return false
	}

	isComplete(): boolean {
		return this.typed === this.word
	}

	getCaret(): number {
		return this.typed.length
	}

	getTyped(): string {
		return this.typed
	}

	getWord(): string {
		return this.word
	}

	reset(word: string) {
		this.word = word
		this.typed = ''
	}
}
