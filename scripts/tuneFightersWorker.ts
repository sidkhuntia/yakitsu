/**
 * Worker half of `pnpm tune`, and the shared search space.
 *
 * `KNOBS` is every number the tuner may change, each as an integer search
 * index `k` with value `min + k * unit`. `buildDefs` turns a vector of indices
 * into fighter defs for the four non-hero fighters. A job is one cell of the
 * objective: a pairing at one speed (`pair`), or one fighter's one-trick
 * mirror (`one`), played with those defs. The hero is never overridden.
 *
 * Deterministic: a job depends only on its own fields, so a candidate always
 * scores the same, whichever worker runs it.
 */

import { isMainThread, parentPort } from 'node:worker_threads'
import { simulateMatch } from '../src/systems/duel/balance'
import { mixSeed } from '../src/systems/duel/rng'
import type { MoveId } from '../src/systems/duel/duelTuning'
import {
	FIGHTERS,
	FIGHTER_IDS,
	type FighterDef,
	type FighterId,
	type Signature,
} from '../src/systems/duel/fighters'
import type { WordPicker } from '../src/systems/duel/playerDeck'
import { botProfile, type BotProfile } from '../src/systems/duel/typistBot'
import { loadWordPicker } from '../src/systems/duel/__tests__/wordsFixture'

export const WPMS = [40, 70, 100]
export const ONE_TRICKS = ['jabber', 'heavy'] as const
export type OneTrick = (typeof ONE_TRICKS)[number]
/** The fighters whose numbers are tuned. Hero is the fixed anchor. */
export const TUNED: FighterId[] = ['goblin', 'skeleton', 'mushroom', 'eye']
export type Defs = Partial<Record<FighterId, FighterDef>>

/** Every bot is a rational defender, as in the balance test. */
const RATIONAL: Partial<BotProfile> = { parryChance: 1 }

export interface Knob {
	/** Stable name for logs and checkpoints, e.g. `goblin.maxHp`. */
	name: string
	fighter: FighterId
	/** Value at search index 0. */
	min: number
	/** Value at search index `kMax`. */
	max: number
	/** Value difference between neighbouring search indices (the grid step). */
	unit: number
	/** Starting pattern-search step, in units. */
	step: number
	/** `maxHp` and `damage` knobs are the refinement set. */
	group: 'maxHp' | 'damage' | 'signature'
	get(def: FighterDef): number
	set(def: FighterDef, value: number): void
}

export const kMax = (k: Knob): number => Math.round((k.max - k.min) / k.unit)

/** The value at search index `k`. Rounded so float grids stay exact. */
export function knobValue(k: Knob, index: number): number {
	return Number((k.min + index * k.unit).toFixed(6))
}

/** The search index of the value `v`. */
export function knobIndex(k: Knob, v: number): number {
	return Math.round((v - k.min) / k.unit)
}

function sigOf<K extends Signature['kind']>(
	d: FighterDef,
	kind: K,
): Extract<Signature, { kind: K }> {
	if (d.signature.kind !== kind)
		throw new Error(`${d.id}: expected a ${kind} signature`)
	return d.signature as Extract<Signature, { kind: K }>
}

const maxHpKnob = (
	fighter: FighterId,
	min: number,
	max: number,
	step: number,
): Knob => ({
	name: `${fighter}.maxHp`,
	fighter,
	min,
	max,
	unit: 0.1,
	step,
	group: 'maxHp',
	get: (d) => d.maxHp,
	set: (d, v) => {
		d.maxHp = v
	},
})

const damageKnob = (
	fighter: FighterId,
	move: MoveId,
	min: number,
	max: number,
	step: number,
): Knob => ({
	name: `${fighter}.${move}`,
	fighter,
	min,
	max,
	unit: 0.1,
	step,
	group: 'damage',
	get: (d) => d.moves[move].damage,
	set: (d, v) => {
		d.moves[move] = { ...d.moves[move], damage: v }
	},
})

/**
 * Bounds: damages within 50%-160% of the starting value (rounded inwards),
 * maxHp within the identity ranges in the task. Starting values are the
 * numbers in `fighters.ts` when the tuner was first run.
 */
export const KNOBS: Knob[] = [
	maxHpKnob('goblin', 55, 100, 10),
	damageKnob('goblin', 'jab', 3, 5, 10),
	damageKnob('goblin', 'heavy', 11, 16, 10),
	damageKnob('goblin', 'special', 21, 31, 10),
	{
		name: 'goblin.bonusPerLink',
		fighter: 'goblin',
		min: 1,
		max: 3,
		unit: 1,
		step: 1,
		group: 'signature',
		get: (d) => sigOf(d, 'combo').bonusPerLink,
		set: (d, v) => {
			d.signature = { ...sigOf(d, 'combo'), bonusPerLink: v }
		},
	},
	{
		name: 'goblin.maxBonus',
		fighter: 'goblin',
		min: 2,
		max: 8,
		unit: 1,
		step: 2,
		group: 'signature',
		get: (d) => sigOf(d, 'combo').maxBonus,
		set: (d, v) => {
			d.signature = { ...sigOf(d, 'combo'), maxBonus: v }
		},
	},
	maxHpKnob('skeleton', 100, 150, 10),
	damageKnob('skeleton', 'jab', 3, 5, 10),
	damageKnob('skeleton', 'heavy', 11, 16, 10),
	damageKnob('skeleton', 'special', 21, 31, 10),
	{
		name: 'skeleton.damageTakenScale',
		fighter: 'skeleton',
		min: 0.7,
		max: 0.92,
		unit: 0.02,
		step: 1,
		group: 'signature',
		get: (d) => sigOf(d, 'armor').damageTakenScale,
		set: (d, v) => {
			d.signature = { ...sigOf(d, 'armor'), damageTakenScale: v }
		},
	},
	maxHpKnob('mushroom', 80, 140, 10),
	damageKnob('mushroom', 'jab', 3, 5, 10),
	damageKnob('mushroom', 'heavy', 11, 16, 10),
	damageKnob('mushroom', 'special', 21, 31, 10),
	{
		name: 'mushroom.dps',
		fighter: 'mushroom',
		min: 2,
		max: 6,
		unit: 1,
		step: 1,
		group: 'signature',
		get: (d) => sigOf(d, 'poison').dps,
		set: (d, v) => {
			d.signature = { ...sigOf(d, 'poison'), dps: v }
		},
	},
	{
		name: 'mushroom.durationMs',
		fighter: 'mushroom',
		min: 3000,
		max: 7000,
		unit: 500,
		step: 1,
		group: 'signature',
		get: (d) => sigOf(d, 'poison').durationMs,
		set: (d, v) => {
			d.signature = { ...sigOf(d, 'poison'), durationMs: v }
		},
	},
	maxHpKnob('eye', 55, 100, 10),
	damageKnob('eye', 'jab', 3, 5, 10),
	damageKnob('eye', 'heavy', 11, 16, 10),
	damageKnob('eye', 'special', 21, 31, 10),
	{
		name: 'eye.meterPerHit',
		fighter: 'eye',
		min: 4,
		max: 14,
		unit: 1,
		step: 2,
		group: 'signature',
		get: (d) => sigOf(d, 'drain').meterPerHit,
		set: (d, v) => {
			d.signature = { ...sigOf(d, 'drain'), meterPerHit: v }
		},
	},
]

/** Defs for the tuned fighters at the given search indices. */
export function buildDefs(ks: readonly number[]): Defs {
	const defs: Defs = {}
	KNOBS.forEach((knob, i) => {
		const base =
			defs[knob.fighter] ?? structuredClone(FIGHTERS[knob.fighter])
		knob.set(base, knobValue(knob, ks[i]))
		defs[knob.fighter] = base
	})
	return defs
}

/**
 * Ratio rule: every tuned fighter's special/heavy must stay within 30% of the
 * hero's ratio (26/13 = 2.0), i.e. 1.4 <= special/heavy <= 2.6. Written as
 * integer inequalities (5s >= 7h and 5s <= 13h) so float rounding cannot
 * change a verdict.
 */
export function ratiosOk(ks: readonly number[]): boolean {
	return TUNED.every((f) => {
		const h = valueOf(ks, `${f}.heavy`)
		const s = valueOf(ks, `${f}.special`)
		const S = Math.round(s * 10)
		const H = Math.round(h * 10)
		return 5 * S >= 7 * H && 5 * S <= 13 * H
	})
}

function valueOf(ks: readonly number[], name: string): number {
	const i = KNOBS.findIndex((k) => k.name === name)
	if (i < 0) throw new Error(`no knob ${name}`)
	return knobValue(KNOBS[i], ks[i])
}

export type Job =
	| {
			kind: 'pair'
			a: FighterId
			b: FighterId
			wpm: number
			n: number
			defs: Defs
	  }
	| {
			kind: 'one'
			fighter: FighterId
			style: OneTrick
			wpm: number
			n: number
			defs: Defs
	  }

export interface JobResult {
	/** Win rate of the first fighter (`pair`) or of the one-trick (`one`). */
	rate: number
}

let pickCache: WordPicker | null = null
function pick(): WordPicker {
	pickCache ??= loadWordPicker()
	return pickCache
}

/**
 * Seed family for the tuner. Measurement seeds (`balance.ts`, `balance.test.ts`)
 * are `mixSeed(ia, ib, k)` for pairs and `mixSeed(fi, 0x5171, k)` for mirrors.
 * `seedCheck` confirms the two families share no seed.
 */
const RUN6_SEED = 0x7e5a
const RUN6_PAIR_N = 500
const TUNE_SEED = 0x51ed
const TUNE_PAIR_N = 800
const TUNE_MIRROR_N = 40
/** Measurement n used by the release gate and `pnpm balance`. */
const MEASURE_N = 1000

/**
 * Win rate of `a` over `n` matches against `b`, sides swapped on odd matches
 * (the same scheme as `balance.ts`'s `winRateMatrix`), with its own seeds.
 */
function winRate(
	a: FighterId,
	b: FighterId,
	pa: BotProfile,
	pb: BotProfile,
	n: number,
	seedOf: (i: number) => number,
	defs: Defs,
): number {
	let wins = 0
	for (let i = 0; i < n; i++) {
		const swap = i % 2 === 1
		const first = swap ? b : a
		const second = swap ? a : b
		const r = simulateMatch({
			a: first,
			b: second,
			profileA: swap ? pb : pa,
			profileB: swap ? pa : pb,
			seed: seedOf(i),
			pick: pick(),
			defs: { a: defs[first], b: defs[second] },
		})
		if (r.winner === (swap ? 'p2' : 'p1')) wins++
	}
	return wins / n
}

export function runJob(job: Job): JobResult {
	const mixed = botProfile(job.wpm, 'mixed', RATIONAL)
	if (job.kind === 'pair') {
		const ia = FIGHTER_IDS.indexOf(job.a)
		const ib = FIGHTER_IDS.indexOf(job.b)
		const rate = winRate(
			job.a,
			job.b,
			mixed,
			mixed,
			job.n,
			(i) => mixSeed(TUNE_SEED, ia, ib, job.wpm, i),
			job.defs,
		)
		return { rate }
	}
	const fi = FIGHTER_IDS.indexOf(job.fighter)
	const rate = winRate(
		job.fighter,
		job.fighter,
		botProfile(job.wpm, job.style, RATIONAL),
		mixed,
		job.n,
		(i) => mixSeed(TUNE_SEED, fi, 0x5171, job.wpm, i),
		job.defs,
	)
	return { rate }
}

/**
 * Counts the measurement seeds (n up to MEASURE_N) and the tuner's seeds, and
 * how many values they share. The tuner must report zero shared.
 */
export function seedCheck(): {
	measure: number
	run6: number
	tune: number
	sharedMeasure: number
	sharedRun6: number
} {
	const family = (seed: number, pairN: number, mirrorN: number) => {
		const out = new Set<number>()
		for (let ia = 0; ia < FIGHTER_IDS.length; ia++) {
			for (let ib = ia + 1; ib < FIGHTER_IDS.length; ib++) {
				for (const wpm of WPMS) {
					for (let k = 0; k < pairN; k++)
						out.add(mixSeed(seed, ia, ib, wpm, k))
				}
			}
		}
		for (let fi = 0; fi < FIGHTER_IDS.length; fi++) {
			for (const wpm of WPMS) {
				for (let k = 0; k < mirrorN; k++)
					out.add(mixSeed(seed, fi, 0x5171, wpm, k))
			}
		}
		return out
	}
	const measure = new Set<number>()
	for (let ia = 0; ia < FIGHTER_IDS.length; ia++) {
		for (let ib = ia + 1; ib < FIGHTER_IDS.length; ib++) {
			for (let k = 0; k < MEASURE_N; k++) measure.add(mixSeed(ia, ib, k))
		}
	}
	for (let fi = 0; fi < FIGHTER_IDS.length; fi++) {
		for (let k = 0; k < MEASURE_N; k++) measure.add(mixSeed(fi, 0x5171, k))
	}
	const run6 = family(RUN6_SEED, RUN6_PAIR_N, TUNE_MIRROR_N)
	const tune = family(TUNE_SEED, TUNE_PAIR_N, TUNE_MIRROR_N)
	const shared = (x: Set<number>, y: Set<number>) => {
		let n = 0
		for (const v of x) if (y.has(v)) n++
		return n
	}
	return {
		measure: measure.size,
		run6: run6.size,
		tune: tune.size,
		sharedMeasure: shared(tune, measure),
		sharedRun6: shared(tune, run6),
	}
}

if (!isMainThread && parentPort) {
	const port = parentPort
	port.on('message', (job: Job) => port.postMessage(runJob(job)))
}
