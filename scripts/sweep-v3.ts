/**
 * Stale-and-parry sweep (v3): move staling x block damage x parry rules.
 *
 *   pnpm sweep:v3
 *
 * Grid: staleFactor {1, 0.8, 0.65, 0.5} x blockDamageShare {0, 0.3, 0.5} x
 * parryResetsWord {0, 1} x parryStaggerMs {0, 600, 1300} = 72 configs.
 * meterOnParry 12, counterMultiplier 1.5 and staleFloor 0.4 are fixed.
 *
 * Every bot has parryChance 1 (a rational defender) unless stated. Per config,
 * for every fighter's mirror at 40 / 70 / 100 WPM, the one-trick styles
 * (jabber, heavy) play mixed. At 70 WPM, hero mixed at parryChance 0.5 plays
 * parryChance 1.0, and hero mixed vs mixed gives the match length and KO share.
 *
 * Score (lower is better):
 *   dominance + 0.5 x max(0, |parryMatters - 0.35| - 0.10) + penalty
 * where dominance is the largest one-trick win rate (want <= 0.55),
 * parryMatters is the 0.5 side's win rate (want 0.25-0.45), and penalty is 1
 * when the mirror's match length is outside 30-75 s or its KO share is under
 * 80%.
 *
 * The best 15 are printed. The best 3 each get a 10-pair fighter matrix (mixed
 * vs mixed, parryChance 1) at 40 / 70 / 100 WPM. Configs run on worker threads
 * (scripts/sweepV3Worker.ts). Everything is deterministic. Results go to
 * scripts/out/sweep-v3.json.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import {
	FIXED_RULES,
	N,
	WPMS,
	rulesFor,
	type ConfigResult,
	type Job,
	type JobResult,
	type Knobs,
	type MatrixResult,
} from './sweepV3Worker'

const GRID = {
	staleFactor: [1, 0.8, 0.65, 0.5],
	blockDamageShare: [0, 0.3, 0.5],
	parryResetsWord: [0, 1],
	parryStaggerMs: [0, 600, 1300],
}
const WORKERS = 10
const TABLE_ROWS = 15
const FINALISTS = 3
const OUT_FILE = fileURLToPath(new URL('./out/sweep-v3.json', import.meta.url))

function allConfigs(): Knobs[] {
	const out: Knobs[] = []
	for (const staleFactor of GRID.staleFactor) {
		for (const blockDamageShare of GRID.blockDamageShare) {
			for (const parryResetsWord of GRID.parryResetsWord) {
				for (const parryStaggerMs of GRID.parryStaggerMs) {
					out.push({
						staleFactor,
						blockDamageShare,
						parryResetsWord,
						parryStaggerMs,
					})
				}
			}
		}
	}
	return out
}

/**
 * Run every job on a pool of worker threads. Each worker takes the next job as
 * soon as it finishes one, so uneven jobs keep every thread busy.
 */
function runPool(
	jobs: Job[],
	onResult: (r: JobResult, done: number) => void,
): Promise<JobResult[]> {
	return new Promise((resolve, reject) => {
		const results: JobResult[] = []
		let next = 0
		const feed = (w: Worker) => {
			if (next < jobs.length) w.postMessage(jobs[next++])
			else void w.terminate()
		}
		for (let k = 0; k < Math.min(WORKERS, jobs.length); k++) {
			const w = new Worker(
				new URL('./sweepV3Worker.ts', import.meta.url),
				{
					execArgv: ['--import', 'tsx'],
				},
			)
			w.on('message', (r: JobResult) => {
				results.push(r)
				onResult(r, results.length)
				if (results.length === jobs.length) resolve(results)
				feed(w)
			})
			w.on('error', reject)
			feed(w)
		}
	})
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const knobLabel = (k: Knobs) =>
	`stale=${k.staleFactor} share=${k.blockDamageShare} ` +
	`reset=${k.parryResetsWord} stagger=${k.parryStaggerMs}`
const cellLabel = (c: ConfigResult['worstCell']) =>
	`${c.fighter} @${c.wpm} ${c.style}`

const start = performance.now()
const configs = allConfigs()
console.log(
	`sweep:v3: ${configs.length} configs, n=${N} per cell, ` +
		`${WPMS.join('/')} WPM, ${WORKERS} workers`,
)

const configJobs: Job[] = configs.map((knobs, index) => ({
	kind: 'config',
	index,
	knobs,
	rules: rulesFor(knobs),
}))
const configResults = (
	await runPool(configJobs, (r, done) => {
		if (r.kind !== 'config') return
		const secs = ((performance.now() - start) / 1000).toFixed(0)
		console.log(
			`[${String(done).padStart(2)}/${configs.length}] ${knobLabel(r.knobs)} ` +
				`score=${r.score.toFixed(3)} dom=${pct(r.dominance)} ` +
				`parryMatters=${pct(r.parryMatters)} ` +
				`dur=${r.durationS.toFixed(1)}s KO=${pct(r.koShare)} (${secs}s)`,
		)
	})
).filter((r): r is ConfigResult => r.kind === 'config')

// Stable sort: equal scores keep grid order.
const ranked = [...configResults].sort(
	(a, b) => a.score - b.score || a.index - b.index,
)

const table = Object.fromEntries(
	ranked.slice(0, TABLE_ROWS).map((r, i) => [
		`#${i + 1}`,
		{
			score: Number(r.score.toFixed(3)),
			dominance: pct(r.dominance),
			'worst cell': cellLabel(r.worstCell),
			'parry 0.5v1.0': pct(r.parryMatters),
			'dur s': Number(r.durationS.toFixed(1)),
			'KO share': pct(r.koShare),
			penalty: r.penalty,
			stale: r.knobs.staleFactor,
			share: r.knobs.blockDamageShare,
			reset: r.knobs.parryResetsWord,
			stagger: r.knobs.parryStaggerMs,
		},
	]),
)
console.log(`\n== top ${TABLE_ROWS} configs by score (lower is better) ==`)
console.table(table)

const finalists = ranked.slice(0, FINALISTS)
const matrixJobs: Job[] = finalists.map((r) => ({
	kind: 'matrix',
	index: r.index,
	knobs: r.knobs,
	rules: rulesFor(r.knobs),
}))
const matrixResults = (await runPool(matrixJobs, () => {})).filter(
	(r): r is MatrixResult => r.kind === 'matrix',
)
const matrices = finalists.map((f, rank) => {
	const m = matrixResults.find((x) => x.index === f.index)
	if (!m) throw new Error(`missing matrix for config ${f.index}`)
	return { rank: rank + 1, m }
})

console.log(
	`\n== fighter matrices, top ${FINALISTS} configs (mixed vs mixed, parryChance 1, n=${N}) ==`,
)
for (const { rank, m } of matrices) {
	console.log(`\n-- #${rank} ${knobLabel(m.knobs)} --`)
	const rows: Record<string, Record<string, string>> = {}
	const first = m.byWpm[String(WPMS[0])]
	first.forEach((pair, p) => {
		rows[`${pair.a} vs ${pair.b}`] = Object.fromEntries(
			WPMS.map((w) => [`${w} WPM`, pct(m.byWpm[String(w)][p].rate)]),
		)
	})
	console.table(rows)
	console.log(
		`worst |rate - 0.5| = ${m.worstDeviation.toFixed(3)} (${m.worstCase})`,
	)
}

const runtimeS = (performance.now() - start) / 1000
mkdirSync(fileURLToPath(new URL('./out/', import.meta.url)), {
	recursive: true,
})
writeFileSync(
	OUT_FILE,
	JSON.stringify(
		{
			n: N,
			wpms: WPMS,
			grid: GRID,
			fixedRules: FIXED_RULES,
			runtimeS: Number(runtimeS.toFixed(1)),
			configs: ranked,
			top: ranked
				.slice(0, TABLE_ROWS)
				.map((r, i) => ({ rank: i + 1, ...r })),
			finalistMatrices: matrices.map(({ rank, m }) => ({ rank, ...m })),
		},
		null,
		2,
	) + '\n',
)
console.log(`\nwrote ${OUT_FILE}`)
console.log(`done in ${runtimeS.toFixed(1)} s`)
