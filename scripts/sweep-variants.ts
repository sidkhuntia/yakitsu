/**
 * Rule-variant sweep: which parry-rule variant and reward knobs keep the
 * duel close without making parrying either worthless or the whole game.
 *
 *   pnpm sweep:variants
 *
 * Grid: `parryResetsWord` x `blockDamageShare` x `parryStaggerMs` x
 * `meterOnParry` (72 configs; counterMultiplier stays at DUEL's 1.5).
 *
 * Every match is a hero mirror, `N` fixed seeds per rate, sides swapped on
 * odd seeds. Every bot has `parryChance` 1 unless stated.
 *
 *   A  heavy vs jabber at 40 / 70 / 100 WPM (heavy's win rate)
 *   B  mixed vs jabber at 40 / 70 / 100 WPM (mixed's win rate)
 *   C  at 70 WPM, mixed with parryChance 0.5 vs 1.0, and 0.8 vs 1.0
 *      (the lower-parry side's win rate)
 *   D  at 70 WPM, mixed vs mixed: mean match length and KO share
 *
 * A config's score is the worst |rate - 0.5| over the six A and B rates, so
 * lower is better. The best 15 are printed; the best 3 are then repeated on
 * every fighter's mirror (A and B only). Results go to
 * scripts/out/sweep-variants.json.
 *
 * Deterministic: seeds come from `mixSeed` on fixed inputs, and nothing reads
 * the clock into the results.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { simulateMatch } from '../src/systems/duel/balance'
import type { DuelRules, Side } from '../src/systems/duel/duelTuning'
import { FIGHTER_IDS, type FighterId } from '../src/systems/duel/fighters'
import type { WordPicker } from '../src/systems/duel/playerDeck'
import { mixSeed } from '../src/systems/duel/rng'
import {
	botProfile,
	type BotProfile,
	type BotStyle,
} from '../src/systems/duel/typistBot'
import { loadWordPicker } from '../src/systems/duel/__tests__/wordsFixture'

type Knobs = Pick<
	DuelRules,
	'parryResetsWord' | 'blockDamageShare' | 'parryStaggerMs' | 'meterOnParry'
>

/** Matches per rate. The same seeds are used for every config. */
const N = 200
const WPMS = [40, 70, 100]
const GRID: { [K in keyof Knobs]: number[] } = {
	parryResetsWord: [0, 1],
	blockDamageShare: [0, 0.25, 0.4, 0.6],
	parryStaggerMs: [0, 600, 1300],
	meterOnParry: [0, 12, 25],
}
const SEED_ROOT = 0x5eed
const TABLE_ROWS = 15
const TOP_FIGHTER_CHECK = 3
const OUT_FILE = fileURLToPath(
	new URL('./out/sweep-variants.json', import.meta.url),
)

const pick: WordPicker = loadWordPicker()

interface Rate {
	/** Wins for the `pa` profile. */
	rate: number
	avgDurationMs: number
	koShare: number
}

/** A bot of `style` at `wpm`, with `parryChance` pinned (default 1). */
function bot(wpm: number, style: BotStyle, parryChance = 1): BotProfile {
	return botProfile(wpm, style, { parryChance })
}

/**
 * Play `N` matches of `fighter` vs `fighter`, bot `pa` against bot `pb`.
 * `code` and `wpm` pick the seed stream, so each measurement has its own
 * matches but every config plays the same ones.
 */
function duel(
	fighter: FighterId,
	pa: BotProfile,
	pb: BotProfile,
	rules: Partial<DuelRules>,
	code: number,
	wpm: number,
): Rate {
	let wins = 0
	let duration = 0
	let rounds = 0
	let koRounds = 0
	for (let i = 0; i < N; i++) {
		const swap = i % 2 === 1
		const r = simulateMatch({
			a: fighter,
			b: fighter,
			profileA: swap ? pb : pa,
			profileB: swap ? pa : pb,
			seed: mixSeed(SEED_ROOT, code, wpm, i),
			pick,
			rules,
		})
		const paSide: Side = swap ? 'p2' : 'p1'
		if (r.winner === paSide) wins++
		duration += r.durationMs
		rounds += r.rounds
		koRounds += r.koRounds
	}
	return {
		rate: wins / N,
		avgDurationMs: duration / N,
		koShare: rounds === 0 ? 0 : koRounds / rounds,
	}
}

function pct(x: number): string {
	return `${(x * 100).toFixed(1)}%`
}

function deviation(rate: number): number {
	return Math.abs(rate - 0.5)
}

interface Measures {
	/** Heavy-style hero vs jabber-style hero, by WPM. */
	A: Record<string, number>
	/** Mixed-style hero vs jabber-style hero, by WPM. */
	B: Record<string, number>
	/** Parry 0.5 mixed vs parry 1.0 mixed, at 70 WPM: the 0.5 side's rate. */
	C05v10: number
	/** Parry 0.8 mixed vs parry 1.0 mixed, at 70 WPM: the 0.8 side's rate. */
	C08v10: number
	/** Mixed vs mixed (both parry 1), at 70 WPM. */
	D: { durationS: number; koShare: number }
}

interface ConfigResult {
	knobs: Knobs
	measures: Measures
	score: number
	worst: string
}

function evaluate(knobs: Knobs): ConfigResult {
	const rules: Partial<DuelRules> = knobs
	const A: Record<string, number> = {}
	const B: Record<string, number> = {}
	for (const wpm of WPMS) {
		A[`${wpm}`] = duel(
			'hero',
			bot(wpm, 'heavy'),
			bot(wpm, 'jabber'),
			rules,
			1,
			wpm,
		).rate
		B[`${wpm}`] = duel(
			'hero',
			bot(wpm, 'mixed'),
			bot(wpm, 'jabber'),
			rules,
			2,
			wpm,
		).rate
	}
	const c05 = duel(
		'hero',
		bot(70, 'mixed', 0.5),
		bot(70, 'mixed', 1),
		rules,
		3,
		70,
	).rate
	const c08 = duel(
		'hero',
		bot(70, 'mixed', 0.8),
		bot(70, 'mixed', 1),
		rules,
		4,
		70,
	)
	const d = duel('hero', bot(70, 'mixed'), bot(70, 'mixed'), rules, 5, 70)

	const scored = [
		...Object.entries(A).map(([w, r]) => ({
			label: `A heavy@${w}`,
			rate: r,
		})),
		...Object.entries(B).map(([w, r]) => ({
			label: `B mixed@${w}`,
			rate: r,
		})),
	]
	const worst = scored.reduce((w, c) =>
		deviation(c.rate) > deviation(w.rate) ? c : w,
	)
	return {
		knobs,
		measures: {
			A,
			B,
			C05v10: c05,
			C08v10: c08.rate,
			D: { durationS: d.avgDurationMs / 1000, koShare: d.koShare },
		},
		score: deviation(worst.rate),
		worst: worst.label,
	}
}

function knobLabel(k: Knobs): string {
	return (
		`reset=${k.parryResetsWord} share=${k.blockDamageShare} ` +
		`stagger=${k.parryStaggerMs} meter=${k.meterOnParry}`
	)
}

function allConfigs(): Knobs[] {
	const out: Knobs[] = []
	for (const parryResetsWord of GRID.parryResetsWord) {
		for (const blockDamageShare of GRID.blockDamageShare) {
			for (const parryStaggerMs of GRID.parryStaggerMs) {
				for (const meterOnParry of GRID.meterOnParry) {
					out.push({
						parryResetsWord,
						blockDamageShare,
						parryStaggerMs,
						meterOnParry,
					})
				}
			}
		}
	}
	return out
}

const start = performance.now()
const configs = allConfigs()
console.log(
	`sweep:variants: ${configs.length} configs, n=${N} per rate, ` +
		`${WPMS.join('/')} WPM, hero mirrors`,
)

const results: ConfigResult[] = []
configs.forEach((knobs, i) => {
	const t0 = performance.now()
	const r = evaluate(knobs)
	results.push(r)
	const secs = ((performance.now() - t0) / 1000).toFixed(1)
	console.log(
		`[${String(i + 1).padStart(2)}/${configs.length}] ${knobLabel(knobs)} ` +
			`score=${r.score.toFixed(3)} worst=${r.worst} (${secs}s)`,
	)
})

// Stable sort, so equal scores keep grid order.
const ranked = [...results].sort((a, b) => a.score - b.score)

const tableRows = Object.fromEntries(
	ranked.slice(0, TABLE_ROWS).map((r, i) => {
		const m = r.measures
		const row: Record<string, string | number> = {
			score: Number(r.score.toFixed(3)),
			reset: r.knobs.parryResetsWord,
			share: r.knobs.blockDamageShare,
			stagger: r.knobs.parryStaggerMs,
			meter: r.knobs.meterOnParry,
		}
		for (const w of WPMS) row[`A heavy@${w}`] = pct(m.A[`${w}`])
		for (const w of WPMS) row[`B mixed@${w}`] = pct(m.B[`${w}`])
		row['C 0.5v1.0'] = pct(m.C05v10)
		row['C 0.8v1.0'] = pct(m.C08v10)
		row['D dur s'] = Number(m.D.durationS.toFixed(1))
		row['D KO share'] = pct(m.D.koShare)
		return [`#${i + 1}`, row]
	}),
)

console.log(`\n== top ${TABLE_ROWS} configs by score (lower is better) ==`)
console.table(tableRows)

const finalists = ranked.slice(0, TOP_FIGHTER_CHECK)
const fighterCheck = finalists.map((r) => {
	const rules: Partial<DuelRules> = r.knobs
	const perFighter = FIGHTER_IDS.map((id) => {
		const cells: { label: string; rate: number }[] = []
		for (const wpm of WPMS) {
			cells.push({
				label: `heavy vs jabber @${wpm}`,
				rate: duel(
					id,
					bot(wpm, 'heavy'),
					bot(wpm, 'jabber'),
					rules,
					1,
					wpm,
				).rate,
			})
			cells.push({
				label: `mixed vs jabber @${wpm}`,
				rate: duel(
					id,
					bot(wpm, 'mixed'),
					bot(wpm, 'jabber'),
					rules,
					2,
					wpm,
				).rate,
			})
		}
		const worst = cells.reduce((w, c) =>
			deviation(c.rate) > deviation(w.rate) ? c : w,
		)
		return {
			fighter: id,
			worst: worst.label,
			rate: worst.rate,
			distance: deviation(worst.rate),
		}
	})
	return { knobs: r.knobs, perFighter }
})

console.log(
	`\n== all-fighter check, top ${TOP_FIGHTER_CHECK} configs (A and B on each fighter's mirror, n=${N}) ==`,
)
fighterCheck.forEach((c, i) => {
	console.log(`\n-- #${i + 1} ${knobLabel(c.knobs)} --`)
	console.table(
		Object.fromEntries(
			c.perFighter.map((f) => [
				f.fighter,
				{
					'worst rate': pct(f.rate),
					'worst case': f.worst,
					'distance from 50%': Number(f.distance.toFixed(3)),
				},
			]),
		),
	)
})

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
			runtimeS: Number(runtimeS.toFixed(1)),
			configs: ranked,
			top: ranked
				.slice(0, TABLE_ROWS)
				.map((r, i) => ({ rank: i + 1, ...r })),
			allFighterCheck: fighterCheck,
		},
		null,
		2,
	) + '\n',
)
console.log(`\nwrote ${OUT_FILE}`)
console.log(`done in ${runtimeS.toFixed(1)} s`)
