/**
 * The word cards a player chooses moves from.
 *
 * Every card on screen starts with a different letter, so typing a first
 * letter unambiguously commits to that move. Pure, like `TypingEngine`, so the
 * targeting rules can be tested without a scene.
 */

import { TypingEngine } from '../typingEngine'
import type { MoveId } from './duelTuning'
import type { FighterDef } from './fighters'
import { mixSeed, seededRng } from './rng'

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
	rng: () => number,
) => string

/** Stable ids for seeding, so a slot's stream never depends on Map order. */
const SLOT_STREAM: Record<Slot, number> = {
	jab: 1,
	heavy: 2,
	special: 3,
	block: 4,
}

export class PlayerDeck {
	private readonly cards = new Map<Slot, Card>()
	private activeSlot: Slot | null = null
	/**
	 * The attack card you were on when you switched to the block word. It
	 * keeps its progress and gets the caret back once the block resolves.
	 * Resetting it instead made parrying a net loss for slow typists: every
	 * telegraph wiped a half-typed heavy, so ignoring parries won more.
	 */
	private suspendedSlot: Slot | null = null
	/** How many words each slot has dealt so far. */
	private readonly dealt: Record<Slot, number> = {
		jab: 0,
		heavy: 0,
		special: 0,
		block: 0,
	}

	/**
	 * @param seed  the match seed. Two decks built with the same seed deal the
	 *   same n-th word to each slot, which is what makes an online match fair:
	 *   neither player can be luckier with their words.
	 * @param fighter  supplies each attack card's word tier and the special's
	 *   meter cost
	 * @param options.suspendOnBlock  default true: switching from an attack
	 *   word to the block word parks the attack word. False: the switch resets
	 *   the attack word you leave, and nothing is parked.
	 */
	constructor(
		private readonly pick: WordPicker,
		readonly seed: number,
		readonly fighter: FighterDef,
		private readonly options: { suspendOnBlock?: boolean } = {},
	) {
		for (const slot of MOVE_SLOTS)
			this.deal(slot, this.fighter.moves[slot].tier)
	}

	get active(): Slot | null {
		return this.activeSlot
	}

	private get suspendOnBlock(): boolean {
		return this.options.suspendOnBlock ?? true
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
					if (target.slot === 'block' && this.suspendOnBlock) {
						this.suspendedSlot = active.slot
					} else {
						// Changing attacks, or switching to a block when blocks do
						// not suspend, is a commitment: the card you leave and
						// anything parked behind it start over.
						this.resetCard(active)
						this.dropSuspended()
					}
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
			if (active.slot === 'block') this.resumeSuspended()
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
		this.resumeSuspended()
	}

	/** Fresh words everywhere, e.g. between rounds. */
	resetAll(): void {
		this.clearBlock()
		this.activeSlot = null
		this.suspendedSlot = null
		for (const slot of MOVE_SLOTS) this.cards.delete(slot)
		for (const slot of MOVE_SLOTS)
			this.deal(slot, this.fighter.moves[slot].tier)
	}

	/**
	 * A heavy or special one keystroke from done. The goblin reads this, the
	 * same way a human opponent will read your visible progress online, and
	 * answers with an attack that cannot be interrupted.
	 */
	isLoaded(): boolean {
		if (this.activeSlot !== 'heavy' && this.activeSlot !== 'special')
			return false
		const card = this.cards.get(this.activeSlot)
		if (!card || card.engine.hasErrors()) return false
		return card.engine.getCaret() >= card.word.length - 1
	}

	isUnlocked(slot: Slot, meter: number): boolean {
		if (slot === 'block') return true
		return meter >= this.fighter.moves[slot].meterCost
	}

	/** The attack card parked behind the block word, if any. */
	get suspended(): Slot | null {
		return this.suspendedSlot
	}

	// ----------------------------------------------------------------- internals

	private resumeSuspended(): void {
		const slot = this.suspendedSlot
		this.suspendedSlot = null
		if (!slot || this.activeSlot) return
		const card = this.cards.get(slot)
		if (card && card.engine.getCaret() > 0) this.activeSlot = slot
	}

	private dropSuspended(): void {
		const card = this.suspendedSlot && this.cards.get(this.suspendedSlot)
		if (card) this.resetCard(card)
		this.suspendedSlot = null
	}

	private resetCard(card: Card): void {
		card.engine.reset(card.word)
		card.slipped = false
	}

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
		else this.deal(card.slot, this.fighter.moves[card.slot].tier)
		return done
	}

	private cardStartingWith(c: string, except: Slot | null): Card | undefined {
		for (const card of this.cards.values()) {
			if (card.slot !== except && card.word[0] === c) return card
		}
		return undefined
	}

	/**
	 * Letters still to be typed on the card in hand and on the one parked
	 * behind a block. A typo leaves the caret past the mistake, but backspacing
	 * returns to it, so the count starts at the first wrong letter.
	 */
	private liveLetters(): Set<string> {
		const letters = new Set<string>()
		for (const slot of [this.activeSlot, this.suspendedSlot]) {
			if (!slot || slot === 'block') continue
			const card = this.cards.get(slot)
			if (!card) continue
			const states = card.engine.getStates()
			const wrong = states.indexOf('wrong')
			const from = wrong === -1 ? card.engine.getCaret() : wrong
			for (const ch of card.word.slice(from)) letters.add(ch)
		}
		return letters
	}

	private deal(slot: Slot, tier: number): Card {
		const previous = this.cards.get(slot)?.word
		const taken = new Set(
			[...this.cards.values()]
				.filter((card) => card.slot !== slot)
				.map((card) => card.word[0]),
		)
		const loose = (w: string) => w === previous || taken.has(w[0])
		// Counter-based: the n-th word of a slot comes from its own seed, so it
		// does not shift when other slots are dealt in a different order.
		const n = this.dealt[slot]++
		const seed = mixSeed(this.seed, SLOT_STREAM[slot], n)
		let raw: string
		if (slot === 'block') {
			// key() gives the active attack priority over a switch. A block word
			// starting with a letter the player still has to type on the card in
			// hand would therefore advance that attack and never start the block.
			// Remaining letters only shrink as they are typed, so a word that
			// clears this stricter rule keeps clearing it while the block is up.
			const live = this.liveLetters()
			const strict = (w: string) =>
				loose(w) || live.has(w[0].toUpperCase())
			raw = this.pick(tier, strict, seededRng(seed))
			// A tiny pool may leave no word that clears the strict rule. A word
			// must still be dealt, so fall back to the original rule. The retry
			// reuses the same seed, so the result stays deterministic.
			if (strict(raw)) raw = this.pick(tier, loose, seededRng(seed))
		} else {
			raw = this.pick(tier, loose, seededRng(seed))
		}
		const word = raw.toUpperCase()
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
