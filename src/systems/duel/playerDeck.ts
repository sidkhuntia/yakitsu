/**
 * The word cards a player chooses moves from.
 *
 * Every card on screen starts with a different letter, so typing a first
 * letter unambiguously commits to that move. Pure, like `TypingEngine`, so the
 * targeting rules can be tested without a scene.
 */

import { TypingEngine } from '../typingEngine'
import { MOVES, type MoveId } from './duelTuning'

export type Slot = MoveId | 'block'

export const MOVE_SLOTS: MoveId[] = ['jab', 'heavy', 'special']

export interface Card {
	slot: Slot
	word: string
	engine: TypingEngine
	/** Any mistake at all on this word, even if later corrected. */
	slipped: boolean
}

export type KeyResult =
	| { kind: 'progress'; slot: Slot }
	| { kind: 'complete'; slot: Slot; word: string; perfect: boolean }
	| { kind: 'mistake'; slot: Slot | null }
	/** Typed the special's letter without enough meter. */
	| { kind: 'locked'; slot: Slot }

export type WordPicker = (
	tier: number,
	reject: (w: string) => boolean,
) => string

export class PlayerDeck {
	private readonly cards = new Map<Slot, Card>()
	private activeSlot: Slot | null = null

	constructor(private readonly pick: WordPicker) {
		for (const slot of MOVE_SLOTS) this.deal(slot, MOVES[slot].tier)
	}

	get active(): Slot | null {
		return this.activeSlot
	}

	card(slot: Slot): Card | undefined {
		return this.cards.get(slot)
	}

	/**
	 * Feed one letter.
	 *
	 * @param meter  the player's current meter, which gates the special
	 */
	key(char: string, meter: number): KeyResult {
		const c = char.toUpperCase()
		const active = this.activeSlot ? this.cards.get(this.activeSlot) : null

		if (active) {
			const expected = active.word[active.engine.getCaret()]
			if (c === expected) return this.advance(active, c)

			// Switching target mid-word is how you react to a telegraph: just
			// start typing the block word. Only allowed from a clean word, so a
			// typo is never silently reinterpreted as a switch.
			if (!active.engine.hasErrors()) {
				const target = this.cardStartingWith(c, active.slot)
				if (target && this.isUnlocked(target.slot, meter)) {
					active.engine.reset(active.word)
					active.slipped = false
					this.activeSlot = target.slot
					return this.advance(target, c)
				}
			}

			active.engine.input(c)
			active.slipped = true
			return { kind: 'mistake', slot: active.slot }
		}

		const target = this.cardStartingWith(c, null)
		if (!target) return { kind: 'mistake', slot: null }
		if (!this.isUnlocked(target.slot, meter)) {
			return { kind: 'locked', slot: target.slot }
		}
		this.activeSlot = target.slot
		return this.advance(target, c)
	}

	/** Backspacing to the start of a word releases the commitment. */
	backspace(): boolean {
		const active = this.activeSlot ? this.cards.get(this.activeSlot) : null
		if (!active) return false
		active.engine.backspace()
		if (active.engine.getCaret() === 0) {
			active.slipped = false
			this.activeSlot = null
		}
		return true
	}

	/** Show the block card for an incoming attack and return its word. */
	offerBlock(tier: number): string {
		this.clearBlock()
		return this.deal('block', tier).word
	}

	/** The attack landed, was interrupted, or the round ended. */
	clearBlock(): void {
		if (!this.cards.has('block')) return
		this.cards.delete('block')
		if (this.activeSlot === 'block') this.activeSlot = null
	}

	/** Fresh words everywhere, e.g. between rounds. */
	resetAll(): void {
		this.clearBlock()
		this.activeSlot = null
		for (const slot of MOVE_SLOTS) this.cards.delete(slot)
		for (const slot of MOVE_SLOTS) this.deal(slot, MOVES[slot].tier)
	}

	isUnlocked(slot: Slot, meter: number): boolean {
		if (slot === 'block') return true
		return meter >= MOVES[slot].meterCost
	}

	// ----------------------------------------------------------------- internals

	private advance(card: Card, c: string): KeyResult {
		card.engine.input(c)
		if (!card.engine.isComplete())
			return { kind: 'progress', slot: card.slot }

		const done: KeyResult = {
			kind: 'complete',
			slot: card.slot,
			word: card.word,
			perfect: !card.slipped,
		}
		this.activeSlot = null
		if (card.slot === 'block') this.clearBlock()
		else this.deal(card.slot, MOVES[card.slot].tier)
		return done
	}

	private cardStartingWith(c: string, except: Slot | null): Card | undefined {
		for (const card of this.cards.values()) {
			if (card.slot !== except && card.word[0] === c) return card
		}
		return undefined
	}

	private deal(slot: Slot, tier: number): Card {
		const previous = this.cards.get(slot)?.word
		const taken = new Set(
			[...this.cards.values()]
				.filter((card) => card.slot !== slot)
				.map((card) => card.word[0]),
		)
		const word = this.pick(
			tier,
			(w) => w === previous || taken.has(w[0]),
		).toUpperCase()
		const card: Card = {
			slot,
			word,
			engine: new TypingEngine(word),
			slipped: false,
		}
		this.cards.set(slot, card)
		return card
	}
}
