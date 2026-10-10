/**
 * Balance report: prints the duel win-rate matrices.
 *
 *   pnpm balance
 *
 * Mixed vs mixed at 40, 70 and 100 WPM, each as a win-rate matrix and a
 * margin matrix (mean round-end HP lead, a smooth surrogate for win rate).
 * Then each fighter's jabber, heavy and turtle bot against a mixed bot of the
 * same fighter. Also per-move outcomes at 70 WPM, the average match length,
 * the KO share and the cap count.
 *
 * Every bot is pinned to parryChance 1 (a rational defender), as in the
 * balance test.
 */

import {
	mirrorRate,
	winRateMatrix,
	type MoveStats,
	type PairRow,
} from '../src/systems/duel/balance'
import { FIGHTER_IDS, type FighterId } from '../src/systems/duel/fighters'
import type { MoveId } from '../src/systems/duel/duelTuning'
import type { BotProfile, BotStyle } from '../src/systems/duel/typistBot'
import { loadWordPicker } from '../src/systems/duel/__tests__/wordsFixture'

const N = 400
const WPMS = [40, 70, 100]
const STYLES: BotStyle[] = ['jabber', 'heavy', 'turtle']
const MOVES: MoveId[] = ['jab', 'heavy', 'special']
/** Every bot is a rational defender: parries whenever it can. */
const RATIONAL: Partial<BotProfile> = { parryChance: 1 }

const pick = loadWordPicker()

function pct(x: number): string {
	return `${(x * 100).toFixed(1)}%`
}

/** Square table: cell (row, col) is the row fighter's win rate vs the column. */
function squareTable(rows: PairRow[]): Record<string, Record<string, string>> {
	const table: Record<string, Record<string, string>> = {}
	for (const id of FIGHTER_IDS) table[id] = {}
	for (const r of rows) {
		table[r.a][r.b] = pct(r.rate)
		table[r.b][r.a] = pct(1 - r.rate)
	}
	for (const id of FIGHTER_IDS) table[id][id] = '-'
	return table
}

/**
 * Square table of mean margin: cell (row, col) is the row fighter's mean
 * round-end HP lead over the column, as a signed share of max HP. Antisymmetric
 * by construction, so (b, a) is the negation of (a, b).
 */
function marginTable(rows: PairRow[]): Record<string, Record<string, string>> {
	const table: Record<string, Record<string, string>> = {}
	for (const id of FIGHTER_IDS) table[id] = {}
	for (const r of rows) {
		table[r.a][r.b] = signedPct(r.margin)
		table[r.b][r.a] = signedPct(-r.margin)
	}
	for (const id of FIGHTER_IDS) table[id][id] = '-'
	return table
}

function signedPct(x: number): string {
	return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
}

function summary(rows: PairRow[]): {
	meanDurationS: string
	koShare: string
	capped: number
} {
	const meanDuration =
		rows.reduce((s, r) => s + r.avgDurationMs, 0) / rows.length
	const meanKo = rows.reduce((s, r) => s + r.koShare, 0) / rows.length
	return {
		meanDurationS: (meanDuration / 1000).toFixed(1),
		koShare: pct(meanKo),
		capped: rows.reduce((s, r) => s + r.capped, 0),
	}
}

/**
 * Per fighter and move, over every match it attacked in: how often the
 * attack landed, was parried, or was interrupted. Each attack ends one way.
 */
function moveTable(rows: PairRow[]): Record<string, Record<string, string>> {
	const totals = new Map<FighterId, Record<MoveId, MoveStats>>()
	const add = (id: FighterId, moves: Record<MoveId, MoveStats>) => {
		const acc = totals.get(id) ?? emptyMoves()
		for (const m of MOVES) {
			acc[m].started += moves[m].started
			acc[m].landed += moves[m].landed
			acc[m].parried += moves[m].parried
			acc[m].interrupted += moves[m].interrupted
		}
		totals.set(id, acc)
	}
	for (const r of rows) {
		add(r.a, r.movesA)
		add(r.b, r.movesB)
	}
	const table: Record<string, Record<string, string>> = {}
	for (const id of FIGHTER_IDS) {
		table[id] = {}
		const acc = totals.get(id) ?? emptyMoves()
		for (const m of MOVES) {
			const s = acc[m]
			const n = s.started || 1
			table[id][m] =
				`n=${s.started} land ${pct(s.landed / n)}, ` +
				`parry ${pct(s.parried / n)}, intr ${pct(s.interrupted / n)}`
		}
	}
	return table
}

function emptyMoves(): Record<MoveId, MoveStats> {
	const none = (): MoveStats => ({
		started: 0,
		landed: 0,
		parried: 0,
		interrupted: 0,
	})
	return { jab: none(), heavy: none(), special: none() }
}

const start = performance.now()

for (const wpm of WPMS) {
	const rows = winRateMatrix({ wpm, n: N, pick, profileOverrides: RATIONAL })
	console.log(`\n== mixed vs mixed, ${wpm} WPM (row beats column, n=${N}) ==`)
	console.table(squareTable(rows))
	console.log(
		`\n== margin, mixed vs mixed, ${wpm} WPM (row's mean round-end HP lead, % of max HP) ==`,
	)
	console.table(marginTable(rows))
	console.log('summary:', summary(rows))
	if (wpm === 70) {
		console.log(`\n== per-move outcomes, mixed vs mixed, ${wpm} WPM ==`)
		console.table(moveTable(rows))
	}
}

console.log(
	`\n== mirrors at 70 WPM: style vs mixed, same fighter (n=${N}, parryChance 1) ==`,
)
const mirrorTable: Record<string, Record<string, string>> = {}
for (const id of FIGHTER_IDS) {
	mirrorTable[id] = {}
	for (const style of STYLES) {
		const r = mirrorRate(id, style, 'mixed', 70, N, pick, {
			profileOverrides: RATIONAL,
		})
		mirrorTable[id][`${style} win%`] = pct(r.rate)
		mirrorTable[id][`${style} KO share`] = pct(r.koShare)
		mirrorTable[id][`${style} avg s`] = (r.avgDurationMs / 1000).toFixed(1)
		mirrorTable[id][`${style} capped`] = String(r.capped)
	}
}
console.table(mirrorTable)

console.log(`\ndone in ${((performance.now() - start) / 1000).toFixed(1)} s`)
