import { describe, expect, it } from 'vitest'
import {
	mirrorRate,
	simulateMatch,
	winRateMatrix,
	type PairRow,
} from '../balance'
import { FIGHTERS, FIGHTER_IDS, parryBudgetOk } from '../fighters'
import { botProfile, type BotStyle } from '../typistBot'
import { WORD_TIERS } from '../../tuning'
import { loadWordPicker } from './wordsFixture'

/** Matches per pairing for the release gate. Deterministic: fixed seeds. */
const GATE_N = 400
/** Matches per mirror for the dominance check. */
const MIRROR_N = 200
/** Matches per sanity comparison. */
const SANITY_N = 100

const pick = loadWordPicker()

let gateCache: PairRow[] | null = null
/** The 70 WPM mixed-vs-mixed matrix, computed once for the gate and sanity. */
function gate70(): PairRow[] {
	gateCache ??= winRateMatrix({ wpm: 70, n: GATE_N, pick })
	return gateCache
}

describe('balance: release gate', () => {
	it('at 70 WPM, mixed vs mixed, every pairing of different fighters wins 45-55%', () => {
		const rows = gate70()
		expect(rows).toHaveLength(
			(FIGHTER_IDS.length * (FIGHTER_IDS.length - 1)) / 2,
		)
		const off = rows
			.filter((r) => r.rate < 0.45 || r.rate > 0.55)
			.map((r) => `${r.a} vs ${r.b}: ${(r.rate * 100).toFixed(1)}%`)
		expect(off).toEqual([])
	})
})

describe('balance: dominance', () => {
	it('for every fighter, jabber vs mixed mirror at 70 WPM does not exceed 60%', () => {
		const over = FIGHTER_IDS.map((f) => ({
			f,
			rate: mirrorRate(f, 'jabber', 'mixed', 70, MIRROR_N, pick).rate,
		})).filter((r) => r.rate > 0.6)
		expect(over).toEqual([])
	})
})

describe('balance: fairness', () => {
	it('every parryable move passes parryBudgetOk with its block tier maxLen', () => {
		for (const id of FIGHTER_IDS) {
			for (const move of Object.values(FIGHTERS[id].moves)) {
				if (move.blockTier === null) {
					expect(move.parryableAtWpm).toBeNull()
					continue
				}
				expect(move.parryableAtWpm, `${id} ${move.id}`).not.toBeNull()
				const maxLen = WORD_TIERS[move.blockTier].maxLen
				expect(
					parryBudgetOk(move, maxLen),
					`${id} ${move.id} at ${move.parryableAtWpm} WPM`,
				).toBe(true)
			}
		}
	})
})

describe('balance: sanity', () => {
	it('a 100 WPM mixed hero beats a 40 WPM mixed hero at least 90% of the time', () => {
		const fast = botProfile(100, 'mixed')
		const slow = botProfile(40, 'mixed')
		let wins = 0
		for (let i = 0; i < SANITY_N; i++) {
			// Swap sides on odd seeds so side bias cannot decide the result.
			const swap = i % 2 === 1
			const r = swap
				? simulateMatch({
						a: 'hero',
						b: 'hero',
						profileA: slow,
						profileB: fast,
						seed: 9000 + i,
						pick,
					})
				: simulateMatch({
						a: 'hero',
						b: 'hero',
						profileA: fast,
						profileB: slow,
						seed: 9000 + i,
						pick,
					})
			if (r.winner === (swap ? 'p2' : 'p1')) wins++
		}
		expect(wins / SANITY_N).toBeGreaterThanOrEqual(0.9)
	})

	it('at 70 WPM matches end by KO more often than by time', () => {
		const rows = gate70()
		const meanKo = rows.reduce((sum, r) => sum + r.koShare, 0) / rows.length
		expect(meanKo).toBeGreaterThan(0.5)
	})

	it('the style mirror at 70 WPM is a valid rate (smoke check on styles)', () => {
		const styles: BotStyle[] = ['jabber', 'heavy', 'turtle']
		for (const s of styles) {
			const r = mirrorRate('hero', s, 'mixed', 70, 20, pick)
			expect(r.rate).toBeGreaterThanOrEqual(0)
			expect(r.rate).toBeLessThanOrEqual(1)
		}
	})
})
