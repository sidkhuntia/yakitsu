/**
 * Balance harness: bot-vs-bot duels, reduced to win rates.
 *
 * Pure. No Phaser, no DOM, no `Date`, no `Math.random`. The word picker is
 * injected, so the caller decides which word list the duels are played with
 * (the tests and `scripts/balance.ts` both use the real one).
 *
 * Every match is event-stepped: the clock jumps to the earliest of the
 * match's next due item and each bot's next action, so the result never
 * depends on a frame rate.
 */

import { DuelMatch, type MatchEvent } from './duelMatch'
import { other, type DuelRules, type MoveId, type Side } from './duelTuning'
import {
	FIGHTERS,
	FIGHTER_IDS,
	type FighterDef,
	type FighterId,
} from './fighters'
import type { WordPicker } from './playerDeck'
import { mixSeed, seededRng } from './rng'
import {
	TypistBot,
	botProfile,
	type BotProfile,
	type BotStyle,
} from './typistBot'

/** A match that reaches this many rounds is stopped and decided on rounds. */
export const MAX_ROUNDS = 10

/** Outcome of one side's attacks with one move. Each attack ends in one way. */
export interface MoveStats {
	started: number
	landed: number
	/** The defender typed the block word in time. */
	parried: number
	/** Cancelled by the opponent landing during this attack's windup. */
	interrupted: number
}

export interface SideStats {
	/** Attacks that landed from this side. */
	hits: number
	/** Attacks this side parried (blocked in time). */
	parries: number
	/** Total damage this side dealt. */
	damage: number
	/** Per-move outcomes of this side's own attacks. */
	moves: Record<MoveId, MoveStats>
}

/** Tuning that every match in a batch shares. */
export interface RuleOverrides {
	/** Overrides for `DUEL`. */
	rules?: Partial<DuelRules>
	/** Replaces `FIGHTERS[id]` for that fighter's matches. */
	defs?: Partial<Record<FighterId, FighterDef>>
}

/** Batch tuning: rules and fighter defs, plus bot profile overrides. */
export interface BatchOptions extends RuleOverrides {
	/**
	 * Merged into both bots' profiles, after the WPM curve and the style. For
	 * example `{ parryChance: 1 }` pins every bot to a rational defender.
	 */
	profileOverrides?: Partial<BotProfile>
}

export interface SimulateOptions {
	/** Fighter on the p1 side. */
	a: FighterId
	/** Fighter on the p2 side. */
	b: FighterId
	profileA: BotProfile
	profileB: BotProfile
	seed: number
	pick: WordPicker
	/** Overrides for `DUEL`. */
	rules?: Partial<DuelRules>
	maxHp?: Partial<Record<Side, number>>
	windupScale?: Partial<Record<Side, number>>
	/** Replaces the FIGHTERS entry for the p1 side (`a`) or the p2 side (`b`). */
	defs?: { a?: FighterDef; b?: FighterDef }
}

export interface MatchResult {
	winner: Side
	/** Rounds that were played to a result (KO, time or draw). */
	rounds: number
	/** Clock time at which the match ended, intros included. */
	durationMs: number
	/** Rounds decided by a KO. */
	koRounds: number
	/** Rounds decided by the clock. */
	timeRounds: number
	/** How the final round ended. `cap` when MAX_ROUNDS stopped the match. */
	endedBy: 'ko' | 'time' | 'cap'
	/** True when the MAX_ROUNDS cap decided the winner. */
	capped: boolean
	/**
	 * Mean over rounds of (p1 HP fraction - p2 HP fraction), read at each
	 * roundOver. Positive favours p1. 0 when no round was played.
	 */
	margin: number
	stats: Record<Side, SideStats>
}

function emptySide(): SideStats {
	const none = (): MoveStats => ({
		started: 0,
		landed: 0,
		parried: 0,
		interrupted: 0,
	})
	return {
		hits: 0,
		parries: 0,
		damage: 0,
		moves: { jab: none(), heavy: none(), special: none() },
	}
}

function emptyStats(): Record<Side, SideStats> {
	return { p1: emptySide(), p2: emptySide() }
}

/**
 * Play one full best-of-three between two bots.
 *
 * Each round starts `rules.introMs` after the previous `roundOver`. Both bots
 * are reset at every round start. A draw counts as a round with no winner
 * and the match goes on.
 */
export function simulateMatch(opts: SimulateOptions): MatchResult {
	const match = new DuelMatch({
		seed: opts.seed,
		fighters: {
			p1: opts.defs?.a ?? FIGHTERS[opts.a],
			p2: opts.defs?.b ?? FIGHTERS[opts.b],
		},
		pick: opts.pick,
		maxHp: opts.maxHp,
		windupScale: opts.windupScale,
		rules: opts.rules,
	})
	const bots: Record<Side, TypistBot> = {
		p1: new TypistBot(
			'p1',
			opts.profileA,
			seededRng(mixSeed(opts.seed, 1)),
		),
		p2: new TypistBot(
			'p2',
			opts.profileB,
			seededRng(mixSeed(opts.seed, 2)),
		),
	}

	const stats = emptyStats()
	let rounds = 0
	let koRounds = 0
	let timeRounds = 0
	let endedBy: MatchResult['endedBy'] = 'time'
	let winner: Side | null = null
	let capped = false
	let endAt = 0
	let marginSum = 0
	/** Set after a roundOver, cleared when the next round starts. */
	let restartAt: number | null = null

	match.startRound(0)
	bots.p1.reset(0)
	bots.p2.reset(0)

	// A bounded loop: every iteration consumes at least one due item, so a
	// stall is a bug. Far above any real match's step count.
	for (let guard = 0; winner === null && !capped; guard++) {
		if (guard > 5_000_000) throw new Error('simulateMatch: no progress')

		let now: number
		if (restartAt !== null) {
			// Intro: no bots act, nothing in the match is due.
			now = restartAt
			restartAt = null
			match.startRound(now)
			bots.p1.reset(now)
			bots.p2.reset(now)
		} else {
			// The earliest moment anything needs attention. `step` resolves
			// every stop at exactly this time, so a roundOver drained below
			// happened at `now`.
			now = Math.min(
				match.nextDueAt(),
				bots.p1.nextActionAt(),
				bots.p2.nextActionAt(),
			)
			if (!Number.isFinite(now))
				throw new Error('simulateMatch: nothing left to do')
			match.step(now, bots)
		}

		let roundEnded = false
		for (const e of match.drain()) {
			tally(e, stats)
			if (e.t === 'roundOver') {
				roundEnded = true
				rounds++
				endedBy = e.reason
				if (e.reason === 'ko') koRounds++
				else timeRounds++
				// Read now, before the next round's startRound resets HP.
				marginSum += hpFraction(match, 'p1') - hpFraction(match, 'p2')
			} else if (e.t === 'matchOver') {
				winner = e.winner
				endAt = now
			}
		}

		if (winner !== null) continue
		if (rounds >= MAX_ROUNDS) {
			capped = true
			endedBy = 'cap'
			endAt = now
		} else if (roundEnded) {
			restartAt = now + match.sim.rules.introMs
		}
	}

	if (winner === null) {
		// Capped: decide on rounds won, a tie goes to p1.
		const won = (s: Side) => match.sim.fighters[s].roundsWon
		winner = won('p2') > won('p1') ? 'p2' : 'p1'
	}

	return {
		winner,
		rounds,
		durationMs: endAt,
		koRounds,
		timeRounds,
		endedBy,
		capped,
		margin: rounds === 0 ? 0 : marginSum / rounds,
		stats,
	}
}

function hpFraction(match: DuelMatch, side: Side): number {
	const f = match.sim.fighters[side]
	return f.hp / f.maxHp
}

function tally(e: MatchEvent, stats: Record<Side, SideStats>): void {
	switch (e.t) {
		case 'attackStarted':
			stats[e.side].moves[e.move].started++
			break
		case 'hit':
			stats[e.attacker].hits++
			stats[e.attacker].damage += e.damage
			stats[e.attacker].moves[e.move].landed++
			break
		case 'parried': {
			const attacker = other(e.defender)
			stats[e.defender].parries++
			stats[attacker].moves[e.move].parried++
			break
		}
		// `side` is the cancelled attacker.
		case 'interrupted':
			stats[e.side].moves[e.move].interrupted++
			break
	}
}

// ------------------------------------------------------------- matrices

export interface PairRow {
	a: FighterId
	b: FighterId
	/** Wins for `a`. */
	aWins: number
	n: number
	/** `aWins / n`. */
	rate: number
	/** Mean match length over the n matches. */
	avgDurationMs: number
	/** Share of all rounds in these matches decided by a KO. */
	koShare: number
	/** Matches stopped by the MAX_ROUNDS cap. */
	capped: number
	/**
	 * Mean round-end HP margin from `a`'s perspective: over every round, the
	 * fraction of max HP `a`'s fighter has left minus `b`'s, measured at each
	 * roundOver and averaged. Positive favours `a`. A smooth surrogate for
	 * `rate`, since a win rate hides how close the matches were.
	 */
	margin: number
	/** Move outcomes of fighter `a`'s attacks, summed over the n matches. */
	movesA: Record<MoveId, MoveStats>
	/** Move outcomes of fighter `b`'s attacks, summed over the n matches. */
	movesB: Record<MoveId, MoveStats>
}

export interface MatrixOptions extends BatchOptions {
	wpm: number
	/** Style of the fighter listed first in each pair. Default 'mixed'. */
	styleA?: BotStyle
	/** Style of the fighter listed second in each pair. Default 'mixed'. */
	styleB?: BotStyle
	/** Matches per pair. */
	n: number
	pick: WordPicker
	/** Fighters to pair up. Default: the whole roster. */
	fighters?: FighterId[]
}

/**
 * Fighter a always keeps styleA and fighter b always keeps styleB. On odd
 * seeds the sides are swapped, so each pairing's side bias averages out.
 */
function playPair(
	a: FighterId,
	b: FighterId,
	pa: BotProfile,
	pb: BotProfile,
	n: number,
	pairSeed: (i: number) => number,
	pick: WordPicker,
	extra: RuleOverrides,
): PairRow {
	const defOf = (id: FighterId) => extra.defs?.[id]
	let aWins = 0
	let duration = 0
	let rounds = 0
	let koRounds = 0
	let capped = 0
	let marginSum = 0
	const movesA = emptySide().moves
	const movesB = emptySide().moves
	for (let i = 0; i < n; i++) {
		const swap = i % 2 === 1
		const seed = pairSeed(i)
		const shared = { seed, pick, rules: extra.rules }
		const r = swap
			? simulateMatch({
					...shared,
					a: b,
					b: a,
					profileA: pb,
					profileB: pa,
					defs: { a: defOf(b), b: defOf(a) },
				})
			: simulateMatch({
					...shared,
					a,
					b,
					profileA: pa,
					profileB: pb,
					defs: { a: defOf(a), b: defOf(b) },
				})
		const aSide: Side = swap ? 'p2' : 'p1'
		if (r.winner === aSide) aWins++
		duration += r.durationMs
		rounds += r.rounds
		koRounds += r.koRounds
		if (r.capped) capped++
		// Seat p1 is fighter a unless the sides were swapped. `margin` is from
		// p1's seat, so it flips when a sits in p2.
		const seatA: Side = swap ? 'p2' : 'p1'
		marginSum += swap ? -r.margin * r.rounds : r.margin * r.rounds
		accumulate(movesA, r.stats[seatA].moves)
		accumulate(movesB, r.stats[other(seatA)].moves)
	}
	return {
		a,
		b,
		aWins,
		n,
		rate: n === 0 ? 0 : aWins / n,
		avgDurationMs: n === 0 ? 0 : duration / n,
		koShare: rounds === 0 ? 0 : koRounds / rounds,
		capped,
		margin: rounds === 0 ? 0 : marginSum / rounds,
		movesA,
		movesB,
	}
}

function accumulate(
	into: Record<MoveId, MoveStats>,
	from: Record<MoveId, MoveStats>,
): void {
	for (const m of Object.keys(into) as MoveId[]) {
		into[m].started += from[m].started
		into[m].landed += from[m].landed
		into[m].parried += from[m].parried
		into[m].interrupted += from[m].interrupted
	}
}

/**
 * Every unordered pair of different fighters, `n` matches each, at a single
 * typing speed. Rows are in roster order (`a` comes before `b`).
 */
export function winRateMatrix(opts: MatrixOptions): PairRow[] {
	const ids = opts.fighters ?? FIGHTER_IDS
	const pa = botProfile(
		opts.wpm,
		opts.styleA ?? 'mixed',
		opts.profileOverrides,
	)
	const pb = botProfile(
		opts.wpm,
		opts.styleB ?? 'mixed',
		opts.profileOverrides,
	)
	const rows: PairRow[] = []
	for (let i = 0; i < ids.length; i++) {
		for (let j = i + 1; j < ids.length; j++) {
			const ia = FIGHTER_IDS.indexOf(ids[i])
			const ib = FIGHTER_IDS.indexOf(ids[j])
			rows.push(
				playPair(
					ids[i],
					ids[j],
					pa,
					pb,
					opts.n,
					(k) => mixSeed(ia, ib, k),
					opts.pick,
					opts,
				),
			)
		}
	}
	return rows
}

/**
 * Same fighter on both sides, one bot in `styleA` and one in `styleB`. The
 * row's `aWins` and `rate` belong to `styleA`.
 */
export function mirrorRate(
	fighter: FighterId,
	styleA: BotStyle,
	styleB: BotStyle,
	wpm: number,
	n: number,
	pick: WordPicker,
	extra: BatchOptions = {},
): PairRow {
	const fi = FIGHTER_IDS.indexOf(fighter)
	return playPair(
		fighter,
		fighter,
		botProfile(wpm, styleA, extra.profileOverrides),
		botProfile(wpm, styleB, extra.profileOverrides),
		n,
		(k) => mixSeed(fi, 0x5171, k),
		pick,
		extra,
	)
}
