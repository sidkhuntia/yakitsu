/**
 * Worker half of `pnpm sweep:v3`. Each job is either one config's full metric
 * set (`config`) or one config's 10-pair fighter matrix (`matrix`). Results go
 * back over the message port; the main thread sorts and prints them.
 *
 * Every match is `simulateMatch`, with the seeds derived from fixed integers,
 * so the same job always gives the same numbers.
 */

import { isMainThread, parentPort } from 'node:worker_threads'
import { simulateMatch } from '../src/systems/duel/balance'
import type { DuelRules } from '../src/systems/duel/duelTuning'
import { FIGHTER_IDS, type FighterId } from '../src/systems/duel/fighters'
import type { WordPicker } from '../src/systems/duel/playerDeck'
import { mixSeed } from '../src/systems/duel/rng'
import { botProfile, type BotProfile } from '../src/systems/duel/typistBot'
import { loadWordPicker } from '../src/systems/duel/__tests__/wordsFixture'

/** Matches per cell. The same seeds are used for every config. */
export const N = 120
export const WPMS = [40, 70, 100]
const SEED_ROOT = 0x5e3
/** The one-trick styles: each is measured against `mixed`. */
const ONE_TRICKS = ['jabber', 'heavy'] as const
type OneTrick = (typeof ONE_TRICKS)[number]

/** The three knobs the grid varies, plus staleFactor. */
export interface Knobs {
	staleFactor: number
	blockDamageShare: number
	parryResetsWord: number
	parryStaggerMs: number
}

/** Held fixed across the whole sweep. */
export const FIXED_RULES = {
	meterOnParry: 12,
	counterMultiplier: 1.5,
	staleFloor: 0.4,
} as const

export function rulesFor(k: Knobs): Partial<DuelRules> {
	return {
		...FIXED_RULES,
		staleFactor: k.staleFactor,
		blockDamageShare: k.blockDamageShare,
		parryResetsWord: k.parryResetsWord,
		parryStaggerMs: k.parryStaggerMs,
	}
}

export type Job =
	| { kind: 'config'; index: number; knobs: Knobs; rules: Partial<DuelRules> }
	| { kind: 'matrix'; index: number; knobs: Knobs; rules: Partial<DuelRules> }

export interface Cell {
	fighter: FighterId
	wpm: number
	style: OneTrick
	/** The one-trick's win rate against mixed. */
	rate: number
}

export interface ConfigResult {
	kind: 'config'
	index: number
	knobs: Knobs
	cells: Cell[]
	/** Largest one-trick win rate over every cell. */
	dominance: number
	worstCell: Cell
	/** Win rate of the parryChance 0.5 side in hero mixed vs hero mixed (1.0), 70 WPM. */
	parryMatters: number
	/** Mean match length of hero mixed vs hero mixed at 70 WPM, seconds. */
	durationS: number
	/** KO share of rounds in that same mirror. */
	koShare: number
	penalty: number
	score: number
}

export interface MatrixPair {
	a: FighterId
	b: FighterId
	/** Win rate of `a` (p1 side on even seeds, p2 on odd). */
	rate: number
}

export interface MatrixResult {
	kind: 'matrix'
	index: number
	knobs: Knobs
	/** Keyed by WPM as a string. Pairs in roster order. */
	byWpm: Record<string, MatrixPair[]>
	worstDeviation: number
	worstCase: string
}

export type JobResult = ConfigResult | MatrixResult

let pickCache: WordPicker | null = null
function pick(): WordPicker {
	pickCache ??= loadWordPicker()
	return pickCache
}

/** A bot of `style` at `wpm`, with `parryChance` pinned (default 1). */
function bot(
	wpm: number,
	style: 'mixed' | OneTrick,
	parryChance = 1,
): BotProfile {
	return botProfile(wpm, style, { parryChance })
}

interface Series {
	/** Matches the subject won. */
	subjectWins: number
	/** Sum of match lengths, ms. */
	durationMs: number
	koRounds: number
	rounds: number
}

/**
 * `N` matches of fighter `a` vs fighter `b`. The subject bot plays `a`, the
 * other plays `b`. On odd matches the seats swap, so the subject sits in p2.
 */
function series(opts: {
	a: FighterId
	b: FighterId
	subject: BotProfile
	other: BotProfile
	seedOf: (i: number) => number
	rules: Partial<DuelRules>
}): Series {
	const { a, b, subject, other, seedOf, rules } = opts
	const out: Series = {
		subjectWins: 0,
		durationMs: 0,
		koRounds: 0,
		rounds: 0,
	}
	for (let i = 0; i < N; i++) {
		const swap = i % 2 === 1
		const r = simulateMatch({
			a: swap ? b : a,
			b: swap ? a : b,
			profileA: swap ? other : subject,
			profileB: swap ? subject : other,
			seed: seedOf(i),
			pick: pick(),
			rules,
		})
		if (r.winner === (swap ? 'p2' : 'p1')) out.subjectWins++
		out.durationMs += r.durationMs
		out.koRounds += r.koRounds
		out.rounds += r.rounds
	}
	return out
}

/** Every metric the score is built from, for one config. */
export function evaluateConfig(
	index: number,
	knobs: Knobs,
	rules: Partial<DuelRules>,
): ConfigResult {
	const cells: Cell[] = []
	FIGHTER_IDS.forEach((f, fi) => {
		for (const wpm of WPMS) {
			for (const style of ONE_TRICKS) {
				const s = series({
					a: f,
					b: f,
					subject: bot(wpm, style),
					other: bot(wpm, 'mixed'),
					seedOf: (i) =>
						mixSeed(
							SEED_ROOT,
							1,
							fi,
							wpm,
							ONE_TRICKS.indexOf(style),
							i,
						),
					rules,
				})
				cells.push({
					fighter: f,
					wpm,
					style,
					rate: s.subjectWins / N,
				})
			}
		}
	})
	const worstCell = cells.reduce((w, c) => (c.rate > w.rate ? c : w))
	const dominance = worstCell.rate

	const parry = series({
		a: 'hero',
		b: 'hero',
		subject: bot(70, 'mixed', 0.5),
		other: bot(70, 'mixed', 1),
		seedOf: (i) => mixSeed(SEED_ROOT, 2, i),
		rules,
	})
	const parryMatters = parry.subjectWins / N

	const mirror = series({
		a: 'hero',
		b: 'hero',
		subject: bot(70, 'mixed'),
		other: bot(70, 'mixed'),
		seedOf: (i) => mixSeed(SEED_ROOT, 3, i),
		rules,
	})
	const durationS = mirror.durationMs / N / 1000
	const koShare = mirror.rounds === 0 ? 0 : mirror.koRounds / mirror.rounds
	const outOfRange = durationS < 30 || durationS > 75 || koShare < 0.8
	const penalty = outOfRange ? 1 : 0

	const score =
		dominance +
		0.5 * Math.max(0, Math.abs(parryMatters - 0.35) - 0.1) +
		penalty

	return {
		kind: 'config',
		index,
		knobs,
		cells,
		dominance,
		worstCell,
		parryMatters,
		durationS,
		koShare,
		penalty,
		score,
	}
}

/** Mixed vs mixed (parryChance 1), every unordered pair, at each WPM. */
export function matrixFor(
	index: number,
	knobs: Knobs,
	rules: Partial<DuelRules>,
): MatrixResult {
	const byWpm: Record<string, MatrixPair[]> = {}
	let worstDeviation = -1
	let worstCase = ''
	for (const wpm of WPMS) {
		const pairs: MatrixPair[] = []
		for (let i = 0; i < FIGHTER_IDS.length; i++) {
			for (let j = i + 1; j < FIGHTER_IDS.length; j++) {
				const a = FIGHTER_IDS[i]
				const b = FIGHTER_IDS[j]
				const s = series({
					a,
					b,
					subject: bot(wpm, 'mixed'),
					other: bot(wpm, 'mixed'),
					seedOf: (k) => mixSeed(SEED_ROOT, 4, i, j, wpm, k),
					rules,
				})
				const rate = s.subjectWins / N
				pairs.push({ a, b, rate })
				const dev = Math.abs(rate - 0.5)
				if (dev > worstDeviation) {
					worstDeviation = dev
					worstCase = `${a} vs ${b} @${wpm}`
				}
			}
		}
		byWpm[String(wpm)] = pairs
	}
	return { kind: 'matrix', index, knobs, byWpm, worstDeviation, worstCase }
}

export function runJob(job: Job): JobResult {
	return job.kind === 'config'
		? evaluateConfig(job.index, job.knobs, job.rules)
		: matrixFor(job.index, job.knobs, job.rules)
}

if (!isMainThread && parentPort) {
	const port = parentPort
	port.on('message', (job: Job) => port.postMessage(runJob(job)))
}
