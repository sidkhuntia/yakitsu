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
import { mirrorRate, winRateMatrix } from '../src/systems/duel/balance'
import type { MoveId } from '../src/systems/duel/duelTuning'
import {
	FIGHTERS,
	type FighterDef,
	type FighterId,
	type Signature,
} from '../src/systems/duel/fighters'
import type { WordPicker } from '../src/systems/duel/playerDeck'
import type { BotProfile, BotStyle } from '../src/systems/duel/typistBot'
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
	unit: 1,
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
	unit: 1,
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
	maxHpKnob('goblin', 55, 100, 3),
	damageKnob('goblin', 'jab', 3, 5, 1),
	damageKnob('goblin', 'heavy', 11, 16, 1),
	damageKnob('goblin', 'special', 21, 31, 1),
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
	maxHpKnob('skeleton', 100, 150, 3),
	damageKnob('skeleton', 'jab', 3, 5, 1),
	damageKnob('skeleton', 'heavy', 11, 16, 1),
	damageKnob('skeleton', 'special', 21, 31, 1),
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
	maxHpKnob('mushroom', 80, 140, 3),
	damageKnob('mushroom', 'jab', 3, 5, 1),
	damageKnob('mushroom', 'heavy', 11, 16, 1),
	damageKnob('mushroom', 'special', 21, 31, 1),
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
	maxHpKnob('eye', 55, 100, 3),
	damageKnob('eye', 'jab', 3, 5, 1),
	damageKnob('eye', 'heavy', 11, 16, 1),
	damageKnob('eye', 'special', 21, 31, 1),
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
 * Ratio rule: every tuned fighter's special/heavy must stay within 20% of the
 * hero's ratio (26/13 = 2.0), i.e. 1.6 <= special/heavy <= 2.4. Written as
 * integer inequalities (5s >= 8h and 5s <= 12h) so float rounding cannot
 * change a verdict.
 */
export function ratiosOk(ks: readonly number[]): boolean {
	return TUNED.every((f) => {
		const h = valueOf(ks, `${f}.heavy`)
		const s = valueOf(ks, `${f}.special`)
		return 5 * s >= 8 * h && 5 * s <= 12 * h
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
	/** Mean round-end HP margin, same perspective as `rate`. */
	margin: number
}

let pickCache: WordPicker | null = null
function pick(): WordPicker {
	pickCache ??= loadWordPicker()
	return pickCache
}

export function runJob(job: Job): JobResult {
	if (job.kind === 'pair') {
		const [row] = winRateMatrix({
			wpm: job.wpm,
			n: job.n,
			pick: pick(),
			profileOverrides: RATIONAL,
			defs: job.defs,
			fighters: [job.a, job.b],
		})
		return { rate: row.rate, margin: row.margin }
	}
	const style: BotStyle = job.style
	const row = mirrorRate(
		job.fighter,
		style,
		'mixed',
		job.wpm,
		job.n,
		pick(),
		{
			profileOverrides: RATIONAL,
			defs: job.defs,
		},
	)
	return { rate: row.rate, margin: row.margin }
}

if (!isMainThread && parentPort) {
	const port = parentPort
	port.on('message', (job: Job) => port.postMessage(runJob(job)))
}
