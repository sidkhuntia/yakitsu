/**
 * Fighter tuner: `pnpm tune`.
 *
 * A deterministic pattern search over the four non-hero fighters' numbers
 * (maxHp, damages, and one signature number each). Each candidate is scored
 * by the same balance harness as `pnpm balance`, with every bot pinned to
 * parryChance 1 and fixed seeds, so the same input always gives the same loss.
 *
 *   Phase 1 (margin): 10 pairings x {40, 70, 100} WPM at n=60, plus each
 *     fighter's jabber and heavy mirror vs mixed at n=40.
 *       loss = sum_P margin^2 + 2 * sum_D max(0, margin + 0.03)^2
 *     One-tricks should lose by at least 3% of max HP; mixed play should win.
 *   Phase 2 (win rate, release gate): 10 pairings at 70 WPM at n=200, plus
 *     the same mirrors at n=40.
 *       loss = sum_P max(0, |rate - 0.5| - 0.03)^2 + 2 * sum_D max(0, rate - 0.52)^2
 *     Refinement searches maxHp (step 1) first, then damages (step 1).
 *
 * Writes, under scripts/out/:
 *   tune-log.jsonl  one line per accepted move (plus start and end records)
 *   tune-best.json  checkpoint of the best numbers, rewritten on every move
 *
 * `--resume` restarts from tune-best.json.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import {
	FIGHTERS,
	FIGHTER_IDS,
	type FighterId,
} from '../src/systems/duel/fighters'
import {
	KNOBS,
	ONE_TRICKS,
	WPMS,
	buildDefs,
	kMax,
	knobIndex,
	knobValue,
	type Job,
	type JobResult,
	type OneTrick,
	type Defs,
	type Knob,
} from './tuneFightersWorker'

type Phase = 'margin' | 'win'

const WORKERS = 10
const MARGIN_MINUTES = 60
const WIN_MINUTES = 30
const N_MARGIN_PAIR = 60
const N_WIN_PAIR = 200
const N_ONE = 40
const EPS = 1e-12

const OUT_DIR = fileURLToPath(new URL('./out/', import.meta.url))
const LOG_FILE = `${OUT_DIR}tune-log.jsonl`
const BEST_FILE = `${OUT_DIR}tune-best.json`

const RESUME = process.argv.includes('--resume')
const T0 = Date.now()
const elapsedS = () => ((Date.now() - T0) / 1000).toFixed(1)

// ------------------------------------------------------------------ pool

class Pool {
	private readonly all: Worker[] = []
	private readonly idle: Worker[] = []
	private readonly queue: {
		job: Job
		resolve: (r: JobResult) => void
	}[] = []
	private readonly current = new Map<Worker, (r: JobResult) => void>()

	constructor(size: number) {
		for (let i = 0; i < size; i++) {
			const w = new Worker(
				new URL('./tuneFightersWorker.ts', import.meta.url),
				{
					execArgv: ['--import', 'tsx'],
				},
			)
			w.on('message', (r: JobResult) => {
				const resolve = this.current.get(w)
				this.current.delete(w)
				this.idle.push(w)
				resolve?.(r)
				this.pump()
			})
			w.on('error', (e) => {
				console.error('worker failed:', e)
				process.exit(1)
			})
			this.all.push(w)
			this.idle.push(w)
		}
	}

	run(job: Job): Promise<JobResult> {
		return new Promise((resolve) => {
			this.queue.push({ job, resolve })
			this.pump()
		})
	}

	private pump(): void {
		while (this.idle.length > 0 && this.queue.length > 0) {
			const w = this.idle.pop()!
			const next = this.queue.shift()!
			this.current.set(w, next.resolve)
			w.postMessage(next.job)
		}
	}

	close(): void {
		for (const w of this.all) void w.terminate()
	}
}

const pool = new Pool(WORKERS)

// ----------------------------------------------------------------- cells

interface PairCell {
	kind: 'pair'
	a: FighterId
	b: FighterId
	wpm: number
	n: number
}
interface OneCell {
	kind: 'one'
	fighter: FighterId
	style: OneTrick
	wpm: number
	n: number
}
type Cell = PairCell | OneCell

const PAIRS: [FighterId, FighterId][] = []
for (let i = 0; i < FIGHTER_IDS.length; i++) {
	for (let j = i + 1; j < FIGHTER_IDS.length; j++) {
		PAIRS.push([FIGHTER_IDS[i], FIGHTER_IDS[j]])
	}
}

function cellsFor(phase: Phase): Cell[] {
	const cells: Cell[] = []
	for (const [a, b] of PAIRS) {
		if (phase === 'margin') {
			for (const wpm of WPMS)
				cells.push({ kind: 'pair', a, b, wpm, n: N_MARGIN_PAIR })
		} else {
			cells.push({ kind: 'pair', a, b, wpm: 70, n: N_WIN_PAIR })
		}
	}
	for (const fighter of FIGHTER_IDS) {
		for (const style of ONE_TRICKS) {
			for (const wpm of WPMS) {
				cells.push({ kind: 'one', fighter, style, wpm, n: N_ONE })
			}
		}
	}
	return cells
}

function jobFor(c: Cell, defs: Defs): Job {
	return c.kind === 'pair'
		? { kind: 'pair', a: c.a, b: c.b, wpm: c.wpm, n: c.n, defs }
		: {
				kind: 'one',
				fighter: c.fighter,
				style: c.style,
				wpm: c.wpm,
				n: c.n,
				defs,
			}
}

function label(c: Cell): string {
	return c.kind === 'pair'
		? `${c.a} vs ${c.b} @${c.wpm}`
		: `${c.fighter} ${c.style} vs mixed @${c.wpm}`
}

// ----------------------------------------------------------------- score

interface CellOut {
	cell: Cell
	rate: number
	margin: number
}

interface Score {
	loss: number
	cells: CellOut[]
}

function lossOf(phase: Phase, cells: CellOut[]): number {
	let loss = 0
	for (const { cell, rate, margin } of cells) {
		if (cell.kind === 'pair') {
			loss +=
				phase === 'margin'
					? margin * margin
					: Math.max(0, Math.abs(rate - 0.5) - 0.03) ** 2
		} else {
			loss +=
				2 *
				(phase === 'margin'
					? Math.max(0, margin + 0.03) ** 2
					: Math.max(0, rate - 0.52) ** 2)
		}
	}
	return loss
}

const cache = new Map<string, Score>()

/** Score each candidate (search indices). Uncached jobs run on the pool. */
async function evaluate(cands: number[][], phase: Phase): Promise<Score[]> {
	const keyOf = (ks: number[]) => `${phase}:${ks.join(',')}`
	const todo = new Map<string, number[]>()
	for (const ks of cands) {
		const key = keyOf(ks)
		if (!cache.has(key) && !todo.has(key)) todo.set(key, ks)
	}
	const cells = cellsFor(phase)
	await Promise.all(
		[...todo].map(async ([key, ks]) => {
			const defs = buildDefs(ks)
			const outs = await Promise.all(
				cells.map((c) => pool.run(jobFor(c, defs))),
			)
			const withCells: CellOut[] = cells.map((cell, i) => ({
				cell,
				rate: outs[i].rate,
				margin: outs[i].margin,
			}))
			cache.set(key, { loss: lossOf(phase, withCells), cells: withCells })
		}),
	)
	return cands.map((ks) => cache.get(keyOf(ks))!)
}

// ----------------------------------------------------------------- state

// Starting point: the numbers currently in fighters.ts.
let ks: number[] = KNOBS.map((k) => knobIndex(k, k.get(FIGHTERS[k.fighter])))
let accepted = 0
let phaseNow: Phase = 'margin'

function named(vec: number[]): Record<string, number> {
	return Object.fromEntries(
		KNOBS.map((k, i) => [k.name, knobValue(k, vec[i])]),
	)
}

function checkpoint(loss: number, cur: Score, status: string): void {
	writeFileSync(
		BEST_FILE,
		JSON.stringify(
			{
				status,
				phase: phaseNow,
				loss,
				elapsedS: Number(elapsedS()),
				accepted,
				ks,
				params: named(ks),
				cells: cur.cells.map((o) => ({
					cell: label(o.cell),
					rate: Number(o.rate.toFixed(4)),
					margin: Number(o.margin.toFixed(4)),
				})),
			},
			null,
			2,
		) + '\n',
	)
}

function logLine(rec: Record<string, unknown>): void {
	appendFileSync(LOG_FILE, JSON.stringify(rec) + '\n')
}

// ---------------------------------------------------------------- search

interface SearchCtx {
	phase: Phase
	/** Indices into KNOBS to move, in order. */
	indices: number[]
	/** Current step per knob index, in units. Halved when a pass stalls. */
	steps: number[]
	deadline: number
	stopAtZero: boolean
}

async function search(ctx: SearchCtx): Promise<void> {
	const { phase, indices, steps, deadline } = ctx
	phaseNow = phase
	let cur = (await evaluate([ks], phase))[0]
	let pass = 0
	for (;;) {
		if (ctx.stopAtZero && cur.loss === 0) {
			console.log(`[${phase}] loss is 0, stopping`)
			break
		}
		if (Date.now() > deadline) {
			console.log(`[${phase}] time limit reached`)
			break
		}
		pass++
		let improved = false
		for (const i of indices) {
			if (Date.now() > deadline) break
			const knob: Knob = KNOBS[i]
			const cands: number[][] = []
			const targets: number[] = []
			for (const dir of [1, -1]) {
				const k = ks[i] + dir * steps[i]
				if (k < 0 || k > kMax(knob)) continue
				const cand = ks.slice()
				cand[i] = k
				cands.push(cand)
				targets.push(k)
			}
			if (cands.length === 0) continue
			const scores = await evaluate(cands, phase)
			let best = -1
			scores.forEach((s, j) => {
				if (
					s.loss < cur.loss - EPS &&
					(best < 0 || s.loss < scores[best].loss)
				)
					best = j
			})
			if (best < 0) continue
			const from = knobValue(knob, ks[i])
			const to = knobValue(knob, targets[best])
			const before = cur.loss
			ks = cands[best]
			cur = scores[best]
			accepted++
			improved = true
			console.log(
				`[${phase}] pass ${pass} ${knob.name} ${from} -> ${to}  ` +
					`loss ${before.toFixed(6)} -> ${cur.loss.toFixed(6)}  (${elapsedS()}s)`,
			)
			logLine({
				event: 'move',
				phase,
				pass,
				param: knob.name,
				from,
				to,
				lossBefore: before,
				lossAfter: cur.loss,
				elapsedS: Number(elapsedS()),
			})
			checkpoint(cur.loss, cur, 'running')
		}
		console.log(
			`[${phase}] pass ${pass} done: loss ${cur.loss.toFixed(6)}, ` +
				`${improved ? 'improved' : 'no improvement'} (${elapsedS()}s)`,
		)
		if (!improved) {
			if (indices.every((i) => steps[i] <= 1)) {
				console.log(`[${phase}] converged at minimal steps`)
				break
			}
			for (const i of indices)
				steps[i] = Math.max(1, Math.floor(steps[i] / 2))
			console.log(
				`[${phase}] halved steps: ${indices
					.map((i) => `${KNOBS[i].name}=${steps[i]}`)
					.join(' ')}`,
			)
		}
	}
}

// ------------------------------------------------------------------ main

async function main(): Promise<void> {
	mkdirSync(OUT_DIR, { recursive: true })

	let resumedPhase: Phase | 'done' | null = null
	if (RESUME) {
		const saved = JSON.parse(readFileSync(BEST_FILE, 'utf8')) as {
			phase: Phase | 'done'
			params: Record<string, number>
		}
		// Map by name, not position: the knob list can change between runs.
		// Out-of-bound values are clamped; new knobs start at fighters.ts.
		ks = KNOBS.map((k) => {
			const v = saved.params[k.name] ?? k.get(FIGHTERS[k.fighter])
			const clamped = Math.min(k.max, Math.max(k.min, v))
			if (clamped !== v)
				console.log(`clamped ${k.name} ${v} -> ${clamped}`)
			return knobIndex(k, clamped)
		})
		resumedPhase = saved.phase
		console.log(`resumed from ${BEST_FILE} (phase ${saved.phase})`)
	} else {
		writeFileSync(LOG_FILE, '')
	}
	logLine({
		event: 'start',
		resume: RESUME,
		resumedPhase,
		ks,
		params: named(ks),
	})

	const startScore = (await evaluate([ks], 'margin'))[0]
	console.log(
		`start: margin loss ${startScore.loss.toFixed(6)} (${cellsFor('margin').length} cells per candidate, ${WORKERS} workers)`,
	)
	logLine({ event: 'startLoss', loss: startScore.loss })

	// Always run the margin phase: a resumed checkpoint may come from before a
	// change to the objective (roster, combo rule), so it is re-optimised first.
	{
		await search({
			phase: 'margin',
			indices: KNOBS.map((_, i) => i),
			steps: KNOBS.map((k) => k.step),
			deadline: T0 + MARGIN_MINUTES * 60_000,
			stopAtZero: false,
		})
		const m = (await evaluate([ks], 'margin'))[0]
		console.log(`margin phase end: loss ${m.loss.toFixed(6)}`)
		logLine({ event: 'marginEnd', loss: m.loss, accepted })
		checkpoint(m.loss, m, 'margin done')
	}

	// Refinement: maxHp at step 1, then damages at step 1, on win rates.
	const refineIdx = KNOBS.map((_, i) => i).filter(
		(i) => KNOBS[i].group === 'maxHp' || KNOBS[i].group === 'damage',
	)
	const order = [
		...refineIdx.filter((i) => KNOBS[i].group === 'maxHp'),
		...refineIdx.filter((i) => KNOBS[i].group === 'damage'),
	]
	const stepsWin = KNOBS.map(() => 1)
	await search({
		phase: 'win',
		indices: order,
		steps: stepsWin,
		deadline: Date.now() + WIN_MINUTES * 60_000,
		stopAtZero: true,
	})
	const w = (await evaluate([ks], 'win'))[0]
	console.log(`win phase end: loss ${w.loss.toFixed(6)}`)
	logLine({
		event: 'end',
		loss: w.loss,
		accepted,
		elapsedS: Number(elapsedS()),
	})
	checkpoint(w.loss, w, 'done')

	// Report the final numbers and what each knob is pinned against.
	const m = (await evaluate([ks], 'margin'))[0]
	console.log('\n== final parameters ==')
	KNOBS.forEach((k, i) => {
		const v = knobValue(k, ks[i])
		const at =
			ks[i] === 0 ? ' (at min)' : ks[i] === kMax(k) ? ' (at max)' : ''
		console.log(`${k.name.padEnd(28)} ${String(v).padStart(6)}${at}`)
	})
	console.log('\n== final cells (margin phase) ==')
	for (const o of m.cells) {
		console.log(
			`${label(o.cell).padEnd(34)} margin ${(o.margin * 100).toFixed(1)}%  rate ${(o.rate * 100).toFixed(1)}%`,
		)
	}
	console.log('\n== final cells (win phase, n=200 pairs) ==')
	for (const o of w.cells) {
		console.log(
			`${label(o.cell).padEnd(34)} rate ${(o.rate * 100).toFixed(1)}%`,
		)
	}
	console.log(
		`\nmargin loss ${m.loss.toFixed(6)}, win loss ${w.loss.toFixed(6)}, ` +
			`accepted moves ${accepted}, runtime ${elapsedS()} s`,
	)
	pool.close()
}

await main()
