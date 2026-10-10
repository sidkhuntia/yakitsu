/**
 * The AI opponent: a simulated typist.
 *
 * It presses keys into its own `PlayerDeck` through the same `BotHost` entry
 * point a human or a network client uses, so it has no privileged path into
 * the rules. It reads the deck, the meter and the block offer, and nothing
 * else.
 *
 * Pure and clock-free. The owner calls `tick(host, now)` with whatever `now`
 * it likes and asks `nextActionAt()` when to wake the bot next. Every decision
 * is taken at its own scheduled timestamp, so coarse and fine stepping produce
 * the same key log.
 */

import type { Card, PlayerDeck, Slot } from './playerDeck'
import type { MoveId, Side } from './duelTuning'

export interface BotHost {
	deck(side: Side): Pick<PlayerDeck, 'active' | 'card' | 'isUnlocked'>
	meter(side: Side): number
	/** Own attack pending or a finished attack buffered. */
	busy(side: Side): boolean
	/** The live block offer for `side`, with the time it was offered. */
	blockOffer(side: Side): { word: string; offeredAt: number } | null
	key(side: Side, ch: string, at: number): void
	backspace(side: Side, at: number): void
}

export interface BotProfile {
	wpm: number // keystroke interval = 12000 / wpm
	accuracy: number // per-key chance of the right letter, 0..1
	reactionMs: number // offer → decision to parry
	parryChance: number // chance it tries to parry a parryable attack
	moveWeights: Record<MoveId, number> // choice weights when free; special only if unlocked
	jitter: number // ± fraction applied to each key interval
}

export type BotStyle = 'mixed' | 'jabber' | 'heavy' | 'turtle'

/**
 * Per-style move mix and parry appetite.
 *
 * `jabber` spams short words and parries less, so it is fast but leaks
 * damage. `turtle` parries almost everything and attacks rarely. These are
 * the knobs the balance harness compares; change them with a fresh
 * `pnpm balance` run.
 */
const STYLES: Record<
	BotStyle,
	{ moves: Record<MoveId, number>; parryChance: number }
> = {
	mixed: {
		moves: { jab: 3, heavy: 3, special: 4 },
		parryChance: 0.7,
	},
	jabber: {
		moves: { jab: 10, heavy: 1, special: 1 },
		parryChance: 0.4,
	},
	heavy: {
		moves: { jab: 1, heavy: 6, special: 4 },
		parryChance: 0.6,
	},
	turtle: {
		moves: { jab: 2, heavy: 2, special: 3 },
		parryChance: 0.95,
	},
}

/** WPM at which the bot is at its weakest, and where it is strongest. */
const WPM_FLOOR = 30
const WPM_CEIL = 110

/**
 * Skill curve: a linear interpolation between a 30 WPM novice and a 110 WPM
 * expert, clamped at both ends.
 *
 * - accuracy: 0.90 → 0.98. Even fast typists slip, but the slips get rarer.
 * - reactionMs: 900 → 350. A slow player reads the telegraph late, a fast one
 *   answers it almost at once.
 *
 * Linear is deliberate: it keeps the curve easy to reason about when the
 * balance harness sweeps WPM.
 *
 * `overrides` are merged last, so a caller can pin one knob (for example
 * `parryChance`) without changing the curve or the style.
 */
export function botProfile(
	wpm: number,
	style: BotStyle = 'mixed',
	overrides?: Partial<BotProfile>,
): BotProfile {
	const t = Math.min(
		1,
		Math.max(0, (wpm - WPM_FLOOR) / (WPM_CEIL - WPM_FLOOR)),
	)
	const { moves, parryChance } = STYLES[style]
	return {
		wpm,
		accuracy: 0.9 + 0.08 * t,
		reactionMs: Math.round(900 - 550 * t),
		parryChance,
		moveWeights: { ...moves },
		jitter: 0.25,
		...overrides,
	}
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const ATTACK_MOVES: MoveId[] = ['jab', 'heavy', 'special']
const ALL_SLOTS: Slot[] = [...ATTACK_MOVES, 'block']

interface Offer {
	word: string
	offeredAt: number
}

/**
 * The bot is a wake-up scheduler. Each wake-up either takes one action
 * (a key, a backspace, or a deliberate wait) or decides a pending parry, and
 * always schedules the next wake-up. Between wake-ups the bot does nothing,
 * so its behaviour depends only on the timestamps it is woken at.
 */
export class TypistBot {
	/** Next time the bot acts. Infinity until `reset`. */
	private wakeAt = Infinity
	/** Last offer seen, so each offer is decided exactly once. */
	private seen: Offer | null = null
	/** A decision waiting for its reaction time to pass. */
	private pending: (Offer & { at: number }) | null = null
	/** The offer the bot chose to parry. Cleared when the offer goes away. */
	private parrying: Offer | null = null
	/** The last key was a wrong letter, so the next action is a backspace. */
	private typo = false

	constructor(
		private readonly side: Side,
		private readonly profile: BotProfile,
		private readonly rng: () => number,
	) {}

	/**
	 * New round: forget every plan and make the first key land one reaction
	 * time from now, so the bot does not know the round has started instantly.
	 */
	reset(now: number): void {
		this.seen = null
		this.pending = null
		this.parrying = null
		this.typo = false
		this.wakeAt = now + this.profile.reactionMs
	}

	/**
	 * When the bot next needs attention. Always finite after `reset`: it never
	 * sleeps waiting on host state, because a busy or offer change can happen
	 * at any time and must be noticed within one key interval.
	 */
	nextActionAt(): number {
		return Math.min(this.wakeAt, this.pending?.at ?? Infinity)
	}

	/**
	 * Run every wake-up and decision due at or before `now`, in timestamp
	 * order. A decision at the same instant as a wake-up goes first, so the
	 * key typed at that instant already sees the parry.
	 */
	tick(host: BotHost, now: number): void {
		for (;;) {
			const decideAt = this.pending?.at ?? Infinity
			if (decideAt <= this.wakeAt) {
				if (decideAt > now) return
				this.decide(host)
			} else {
				if (this.wakeAt > now) return
				this.act(host, this.wakeAt)
			}
		}
	}

	// ----------------------------------------------------------------- internals

	/**
	 * Roll the parry decision for the pending offer. Rolled once per offer, at
	 * the reaction time, so the bot cannot react faster than a human could.
	 */
	private decide(host: BotHost): void {
		const pending = this.pending
		this.pending = null
		if (!pending) return
		if (!isSameOffer(host.blockOffer(this.side), pending)) return
		if (this.rng() < this.profile.parryChance) this.parrying = pending
	}

	private act(host: BotHost, at: number): void {
		const offer = host.blockOffer(this.side)
		if (!offer) {
			this.seen = null
			this.pending = null
			this.parrying = null
		} else if (!isSameOffer(offer, this.seen)) {
			// A new offer: the previous decision, if any, is moot.
			this.seen = { word: offer.word, offeredAt: offer.offeredAt }
			this.parrying = null
			// If the bot noticed the offer after its reaction time had already
			// passed, it decides now rather than pretending it was faster.
			const due = Math.max(offer.offeredAt + this.profile.reactionMs, at)
			this.pending = { ...this.seen, at: due }
			if (due <= at) this.decide(host)
		}

		const deck = host.deck(this.side)

		// Clean up a wrong letter before anything else. A backspace is always
		// one interval after the mistake, the same beat a human would take.
		if (this.typo || this.activeHasErrors(host)) {
			this.typo = false
			host.backspace(this.side, at)
			this.wakeAt = at + this.interval()
			return
		}

		const parrying = this.parryingNow(host)
		let card: Card | undefined
		if (parrying) card = deck.card('block')
		else if (deck.active) card = deck.card(deck.active)

		if (!card) {
			const slot = this.pickSlot(host)
			card = slot ? deck.card(slot) : undefined
			if (!card) {
				this.wait(at)
				return
			}
		}

		// Stop one letter short of an attack while the side is busy, so the
		// finished word is not buffered behind the attack already in flight.
		// Block words are not attacks and are typed regardless.
		const caret = card.engine.getCaret()
		if (
			card.slot !== 'block' &&
			host.busy(this.side) &&
			caret >= card.word.length - 1
		) {
			this.wait(at)
			return
		}

		const expected = card.word[caret]
		if (this.rng() < this.profile.accuracy) {
			host.key(this.side, expected, at)
		} else {
			host.key(this.side, this.wrongLetter(host, expected), at)
			this.typo = true
		}
		this.wakeAt = at + this.interval()
	}

	/** Re-check after one plain key interval (unjittered, so it stays bounded). */
	private wait(at: number): void {
		this.wakeAt = at + 12_000 / this.profile.wpm
	}

	private parryingNow(host: BotHost): boolean {
		if (!this.parrying) return false
		return isSameOffer(host.blockOffer(this.side), this.parrying)
	}

	private activeHasErrors(host: BotHost): boolean {
		const deck = host.deck(this.side)
		if (!deck.active) return false
		return deck.card(deck.active)?.engine.hasErrors() === true
	}

	/**
	 * Choose an attack card to start, by weight, among those the meter
	 * unlocks. Null when nothing is affordable.
	 */
	private pickSlot(host: BotHost): MoveId | null {
		const deck = host.deck(this.side)
		const meter = host.meter(this.side)
		let total = 0
		for (const slot of ATTACK_MOVES) {
			if (deck.isUnlocked(slot, meter))
				total += this.profile.moveWeights[slot]
		}
		if (total <= 0) return null

		let roll = this.rng() * total
		let last: MoveId | null = null
		for (const slot of ATTACK_MOVES) {
			if (!deck.isUnlocked(slot, meter)) continue
			const weight = this.profile.moveWeights[slot]
			if (weight <= 0) continue
			last = slot
			roll -= weight
			if (roll < 0) return slot
		}
		return last
	}

	/**
	 * A wrong letter that the deck cannot misread.
	 *
	 * It must not be the expected letter (that would be a right key), and it
	 * must not be any card's first letter: on a clean word the deck treats a
	 * matching first letter as a switch to that card, so a typo would silently
	 * change the move.
	 */
	private wrongLetter(host: BotHost, expected: string): string {
		const deck = host.deck(this.side)
		const taken = new Set<string>([expected])
		for (const slot of ALL_SLOTS) {
			const card = deck.card(slot)
			if (card) taken.add(card.word[0])
		}
		const pool = [...ALPHABET].filter((c) => !taken.has(c))
		return pool[Math.floor(this.rng() * pool.length)]
	}

	/** One keystroke interval, jittered. */
	private interval(): number {
		const base = 12_000 / this.profile.wpm
		const j = this.profile.jitter
		return base * (1 + j * (2 * this.rng() - 1))
	}
}

function isSameOffer(a: Offer | null, b: Offer | null): boolean {
	return (
		a !== null &&
		b !== null &&
		a.word === b.word &&
		a.offeredAt === b.offeredAt
	)
}
