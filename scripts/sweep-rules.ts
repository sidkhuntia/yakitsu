/**
 * Rule sweep: which parry-reward values keep any one style from dominating.
 *
 *   pnpm sweep
 *
 * Grid over the three parry knobs (`parryStaggerMs`, `meterOnParry`,
 * `counterMultiplier`). For each config the hero mirror is played for turtle,
 * heavy and jabber against mixed at 40, 70 and 100 WPM. A config's score is
 * the worst distance of any of those nine rates from 50%, so lower is more
 * balanced. Mixed vs mixed at 70 WPM gives the match length and KO share.
 *
 * The best configs are then checked on every fighter's mirror. Everything is
 * deterministic: fixed seeds, and nothing reads the clock into the results.
 * Results go to scripts/out/sweep-rules.json.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mirrorRate } from '../src/systems/duel/balance'
import type { DuelRules } from '../src/systems/duel/duelTuning'
import { FIGHTER_IDS, type FighterId } from '../src/systems/duel/fighters'
import type { BotStyle } from '../src/systems/duel/typistBot'
import { loadWordPicker } from '../src/systems/duel/__tests__/wordsFixture'

type Knobs = Pick<
	DuelRules,
	'parryStaggerMs' | 'meterOnParry' | 'counterMultiplier'
>

/** Matches per rate. The same seeds are used for every config. */
const N = 200
const WPMS = [40, 70, 100]
const STYLES: BotStyle[] = ['turtle', 'heavy', 'jabber']
const GRID: { [K in keyof Knobs]: number[] } = {
	parryStaggerMs: [0, 400, 700, 1000, 1300],
	meterOnParry: [0, 8, 15, 25],
	counterMultiplier: [1, 1.25, 1.5],
}
const TABLE_ROWS = 15
const TOP_FIGHTER_CHECK = 3
const OUT_FILE = fileURLToPath(
	new URL('./out/sweep-rules.json', import.meta.url),
)

const pick = loadWordPicker()

interface Cell {
	label: string
	rate: number
}

interface ConfigResult {
	knobs: Knobs
	/** Rates keyed `style@wpm`, the style's win rate vs mixed. */
	rates: Record<string, number>
	score: number
	worst: string
	mixedDurationS: number
	mixedKoShare: number
}

function pct(x: number): string {
	return `${(x * 100).toFixed(1)}%`
}

function deviation(c: Cell): number {
	return Math.abs(c.rate - 0.5)
}

/** The fighter's nine hero-style rates: each style vs mixed at each WPM. */
function nineRates(fighter: FighterId, knobs: Knobs): Cell[] {
	const cells: Cell[] = []
	for (const style of STYLES) {
		for (const wpm of WPMS) {
			const r = mirrorRate(fighter, style, 'mixed', wpm, N, pick, {
				rules: knobs,
			})
			cells.push({ label: `${style}@${wpm}`, rate: r.rate })
		}
	}
	return cells
}

function worstOf(cells: Cell[]): Cell {
	return cells.reduce((w, c) => (deviation(c) > deviation(w) ? c : w))
}

function evaluateConfig(knobs: Knobs): ConfigResult {
	const cells = nineRates('hero', knobs)
	const worst = worstOf(cells)
	const mixed = mirrorRate('hero', 'mixed', 'mixed', 70, N, pick, {
		rules: knobs,
	})
	return {
		knobs,
		rates: Object.fromEntries(cells.map((c) => [c.label, c.rate])),
		score: deviation(worst),
		worst: worst.label,
		mixedDurationS: mixed.avgDurationMs / 1000,
		mixedKoShare: mixed.koShare,
	}
}

function knobLabel(k: Knobs): string {
	return `stagger=${k.parryStaggerMs} meter=${k.meterOnParry} counter=${k.counterMultiplier}`
}

function allConfigs(): Knobs[] {
	const out: Knobs[] = []
	for (const parryStaggerMs of GRID.parryStaggerMs) {
		for (const meterOnParry of GRID.meterOnParry) {
			for (const counterMultiplier of GRID.counterMultiplier) {
				out.push({ parryStaggerMs, meterOnParry, counterMultiplier })
			}
		}
	}
	return out
}

const start = performance.now()
const configs = allConfigs()
console.log(
	`sweep: ${configs.length} configs x ${STYLES.length * WPMS.length} rates, n=${N} per rate`,
)

const results: ConfigResult[] = []
configs.forEach((knobs, i) => {
	const t0 = performance.now()
	const r = evaluateConfig(knobs)
	results.push(r)
	const secs = ((performance.now() - t0) / 1000).toFixed(1)
	console.log(
		`[${String(i + 1).padStart(2)}/${configs.length}] ${knobLabel(knobs)} ` +
			`score=${r.score.toFixed(3)} worst=${r.worst} (${secs}s)`,
	)
})

// Stable sort, so equal scores keep grid order.
const ranked = [...results].sort((a, b) => a.score - b.score)

const cellLabels = STYLES.flatMap((s) => WPMS.map((w) => `${s}@${w}`))
const tableRows = Object.fromEntries(
	ranked.slice(0, TABLE_ROWS).map((r, i) => {
		const row: Record<string, string | number> = {
			parryStaggerMs: r.knobs.parryStaggerMs,
			meterOnParry: r.knobs.meterOnParry,
			counterMultiplier: r.knobs.counterMultiplier,
			score: Number(r.score.toFixed(3)),
		}
		for (const label of cellLabels) row[label] = pct(r.rates[label])
		row['mixed dur s'] = Number(r.mixedDurationS.toFixed(1))
		row['mixed KO share'] = pct(r.mixedKoShare)
		return [`#${i + 1}`, row]
	}),
)

console.log(`\n== top ${TABLE_ROWS} configs by score (hero mirror) ==`)
console.table(tableRows)

const top = ranked.slice(0, TOP_FIGHTER_CHECK)
const allFighters = top.map((r) => {
	const perFighter = FIGHTER_IDS.map((id) => {
		const cells = nineRates(id, r.knobs)
		const worst = worstOf(cells)
		return {
			fighter: id,
			worst: worst.label,
			rate: worst.rate,
			score: deviation(worst),
		}
	})
	return { knobs: r.knobs, perFighter }
})

console.log(
	`\n== all-fighter check, top ${TOP_FIGHTER_CHECK} configs (worst of 9 rates per fighter, n=${N}) ==`,
)
allFighters.forEach((c, i) => {
	console.log(`\n-- #${i + 1} ${knobLabel(c.knobs)} --`)
	console.table(
		Object.fromEntries(
			c.perFighter.map((f) => [
				f.fighter,
				{
					'worst rate': pct(f.rate),
					'worst case': f.worst,
					'distance from 50%': Number(f.score.toFixed(3)),
				},
			]),
		),
	)
})

mkdirSync(fileURLToPath(new URL('./out/', import.meta.url)), {
	recursive: true,
})
writeFileSync(
	OUT_FILE,
	JSON.stringify(
		{
			n: N,
			wpms: WPMS,
			styles: STYLES,
			grid: GRID,
			configs: ranked,
			allFighterCheck: allFighters,
		},
		null,
		2,
	) + '\n',
)
console.log(`\nwrote ${OUT_FILE}`)

console.log(`done in ${((performance.now() - start) / 1000).toFixed(1)} s`)
