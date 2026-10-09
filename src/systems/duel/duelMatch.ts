/**
 * One duel match: the referee plus both decks, block offers and attack
 * buffering.
 *
 * `DuelSim` decides what happens to HP and time. This class decides what a
 * player can do about it: which keys are live, which block word is on screen,
 * and the moment a finished word becomes an attack. It is pure and clock
 * injected, like the sim, so the scene, the balance harness and a future
 * server all drive it the same way.
 *
 * Everything is resolved at event timestamps (see `advance`), never at the
 * caller's `now`, so the match gives the same results however coarsely the
 * caller steps time.
 */

import { DuelSim, type DuelEvent } from './duelSim'
import type { FighterDef } from './fighters'
import { other, type MoveId, type Side } from './duelTuning'
import { PlayerDeck, type KeyResult, type WordPicker } from './playerDeck'
import type { BotHost, TypistBot } from './typistBot'

const SIDES: readonly Side[] = ['p1', 'p2']

export interface MatchOptions {
	seed: number
	fighters: Record<Side, FighterDef>
	pick: WordPicker
	maxHp?: Partial<Record<Side, number>>
	windupScale?: Partial<Record<Side, number>>
}

export type MatchEvent =
	| DuelEvent
	| {
			t: 'blockOffered'
			side: Side
			word: string
			landsAt: number
			at: number
	  }
	| { t: 'blockCleared'; side: Side }
	| { t: 'key'; side: Side; result: KeyResult; at: number }

interface Offer {
	word: string
	offeredAt: number
}

/** A finished attack word waiting for its side to be able to act. */
interface Buffered {
	move: MoveId
	perfect: boolean
}

export class DuelMatch implements BotHost {
	readonly sim: DuelSim
	/** Both decks share one seed, so neither player can be dealt luckier words. */
	readonly decks: Record<Side, PlayerDeck>

	/**
	 * Our own record of each live block offer. It is kept apart from the deck
	 * on purpose: completing a block word makes the deck drop its block card
	 * before the `parried` event arrives, so the deck cannot tell us whether a
	 * block was up.
	 */
	private readonly offers: Record<Side, Offer | null> = { p1: null, p2: null }
	private readonly buffered: Record<Side, Buffered | null> = {
		p1: null,
		p2: null,
	}
	private queue: MatchEvent[] = []

	constructor(options: MatchOptions) {
		this.sim = new DuelSim({
			fighters: options.fighters,
			maxHp: options.maxHp,
			windupScale: options.windupScale,
		})
		this.decks = {
			p1: new PlayerDeck(options.pick, options.seed, options.fighters.p1),
			p2: new PlayerDeck(options.pick, options.seed, options.fighters.p2),
		}
	}

	/**
	 * Begin a round. Anything due before `now` is resolved first, under this
	 * class's rules, so no reaction is skipped. Callers reset their bots.
	 */
	startRound(now: number): void {
		this.advance(now)
		if (this.sim.phase === 'matchOver') return
		this.sim.startRound(now)
		this.resetRound()
		this.processEvents(now)
	}

	/**
	 * Feed one letter for `side`. Returns null, and does nothing, unless a
	 * round is running at `now`.
	 *
	 * Completing a block word parries; completing an attack word buffers it
	 * (the latest one wins) and starts it at once if the side can act.
	 */
	key(side: Side, ch: string, now: number): KeyResult | null {
		if (this.sim.phase !== 'fight') return null
		this.advance(now)
		// The advance may have ended the round; a key after that is not live.
		if (this.sim.phase !== 'fight') return null

		const result = this.decks[side].key(ch, this.sim.fighters[side].meter)
		this.queue.push({ t: 'key', side, result, at: now })

		if (result.kind === 'mistake') {
			this.sim.mistake(side, now)
		} else if (result.kind === 'complete') {
			if (result.slot === 'block') {
				// The deck already dropped its block card. If the sim refuses
				// the parry there is nothing to parry, so clear our record too.
				if (!this.sim.parry(side, result.perfect, now))
					this.clearBlock(side)
			} else {
				this.buffered[side] = {
					move: result.slot,
					perfect: result.perfect,
				}
			}
		}

		this.settle(now)
		return result
	}

	/** Step back one letter. Ignored outside a running round. */
	backspace(side: Side, now: number): void {
		if (this.sim.phase !== 'fight') return
		this.advance(now)
		if (this.sim.phase !== 'fight') return
		this.decks[side].backspace()
	}

	/**
	 * Resolve everything due by `now`, each at its own timestamp.
	 *
	 * Repeatedly takes the earliest of the sim's next due item and the moment
	 * a buffered attack's side becomes able to act. Each step settles that
	 * instant completely before moving on, so the order of reactions depends
	 * only on timestamps.
	 */
	advance(now: number): void {
		let t = this.nextDueAt()
		while (t <= now) {
			this.settle(t)
			// Every step must consume something, so time moves strictly
			// forward. A stall here is a bug. Throwing would crash the live
			// scene, so log it and stop advancing.
			const next = this.nextDueAt()
			if (next <= t) {
				console.error(`DuelMatch: no progress at t=${t}`)
				break
			}
			t = next
		}
		this.settle(now)
	}

	/**
	 * Earliest future time at which `advance` would change anything: a sim
	 * event, or a buffered attack becoming startable. Infinity when none.
	 */
	nextDueAt(): number {
		let next = this.sim.nextDueAt()
		for (const side of SIDES) {
			if (this.buffered[side]) {
				next = Math.min(next, this.sim.readyAt(side))
			}
		}
		return next
	}

	/** Hand over everything since the last drain, in order. */
	drain(): MatchEvent[] {
		const out = this.queue
		this.queue = []
		return out
	}

	/**
	 * Drive the match and any bots, event-stepped.
	 *
	 * Bots only observe the match when they wake, so their decisions depend on
	 * the exact wake times. Stepping to each wake time in order makes results
	 * independent of how often the caller calls this: a 1 ms frame, a 16 ms
	 * frame and one giant call all produce the same key log. At each stop the
	 * match resolves first, then bots tick, p1 before p2.
	 */
	step(now: number, bots: Partial<Record<Side, TypistBot>>): void {
		let prev = -Infinity
		let stalls = 0
		for (;;) {
			let t = this.nextDueAt()
			for (const side of SIDES) {
				const bot = bots[side]
				if (bot) t = Math.min(t, bot.nextActionAt())
			}
			if (t > now) break

			// A bot tick always schedules its next wake strictly later, so this
			// only trips on a bug. Allow a few repeats in case of a zero-length
			// window, then fail rather than spin.
			stalls = t === prev ? stalls + 1 : 0
			if (stalls > 8) {
				// Log rather than throw, so the live scene keeps running.
				console.error(`DuelMatch.step: no progress at t=${t}`)
				break
			}
			prev = t

			this.advance(t)
			for (const side of SIDES) {
				const bot = bots[side]
				if (bot && bot.nextActionAt() <= t) bot.tick(this, t)
			}
		}
		this.advance(now)
	}

	// ----------------------------------------------------------------- BotHost

	deck(side: Side): PlayerDeck {
		return this.decks[side]
	}

	meter(side: Side): number {
		return this.sim.fighters[side].meter
	}

	busy(side: Side): boolean {
		return (
			this.sim.fighters[side].pending !== null ||
			this.buffered[side] !== null
		)
	}

	blockOffer(side: Side): { word: string; offeredAt: number } | null {
		const offer = this.offers[side]
		return offer ? { word: offer.word, offeredAt: offer.offeredAt } : null
	}

	// ----------------------------------------------------------------- internals

	/**
	 * Resolve everything at exactly `at`, then start any buffered attacks that
	 * can start now. A started attack can itself leave work due at `at` (a
	 * zero-length windup), so loop until nothing is left.
	 */
	private settle(at: number): void {
		for (;;) {
			this.sim.advance(at)
			this.processEvents(at)
			if (!this.flush(at)) return
		}
	}

	/** Start each buffered attack whose side can act at `at`. */
	private flush(at: number): boolean {
		let consumed = false
		for (const side of SIDES) {
			const b = this.buffered[side]
			if (!b || !this.sim.canAct(side, at)) continue
			this.buffered[side] = null
			consumed = true
			// A refusal here means the meter fell short after the word started,
			// e.g. after a mistake or a drain. The attack fizzles.
			this.sim.attack(side, b.move, b.perfect, at)
		}
		return consumed
	}

	/** Turn sim events into match events, and react where a block changes. */
	private processEvents(at: number): void {
		for (const e of this.sim.drain()) {
			this.queue.push(e)
			switch (e.t) {
				case 'attackStarted': {
					if (e.blockTier === null) break
					const defender = other(e.side)
					this.clearBlock(defender)
					const word = this.decks[defender].offerBlock(e.blockTier)
					this.offers[defender] = { word, offeredAt: at }
					this.queue.push({
						t: 'blockOffered',
						side: defender,
						word,
						landsAt: e.landsAt,
						at,
					})
					break
				}
				// The defender's block belongs to the attack that just resolved.
				case 'hit':
					this.clearBlock(other(e.attacker))
					break
				case 'parried':
					this.clearBlock(e.defender)
					break
				// The cancelled attacker's own block was offered by the other side.
				case 'interrupted':
					this.clearBlock(other(e.side))
					break
				case 'roundOver':
					this.resetRound()
					break
			}
		}
	}

	/** Remove `side`'s live block, if any, and say so. */
	private clearBlock(side: Side): void {
		this.decks[side].clearBlock()
		if (!this.offers[side]) return
		this.offers[side] = null
		this.queue.push({ t: 'blockCleared', side })
	}

	/** Clear offers and buffers, and deal fresh words. */
	private resetRound(): void {
		for (const side of SIDES) {
			this.clearBlock(side)
			this.buffered[side] = null
			this.decks[side].resetAll()
		}
	}
}
