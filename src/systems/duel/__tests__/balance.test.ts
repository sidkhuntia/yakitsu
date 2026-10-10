import { describe, expect, it } from 'vitest'
import {
	mirrorRate,
	simulateMatch,
	winRateMatrix,
	type PairRow,
} from '../balance'
import {
	FIGHTERS,
	FIGHTER_IDS,
	parryBudgetOk,
	type FighterId,
} from '../fighters'
import { botProfile, type BotProfile, type BotStyle } from '../typistBot'
import { WORD_TIERS } from '../../tuning'
import { loadWordPicker } from './wordsFixture'

/** Matches per pairing for the release gate. Deterministic: fixed seeds. */
const GATE_N = 1000
/** Matches per mirror for the dominance check. Deterministic: fixed seeds. */
const MIRROR_N = 80
/** Matches per sanity comparison. */
const SANITY_N = 100
/** Speeds the dominance check covers. */
const DOMINANCE_WPMS = [40, 70, 100]
/** A style may not win more than this share of a mirror against mixed. */
const DOMINANCE_MAX = 0.55

/**
 * Every bot is a rational defender: it parries whenever it can. Without this
 * a bot's own parry appetite, not the rules or the fighters, decides results.
 */
const RATIONAL: Partial<BotProfile> = { parryChance: 1 }

const pick = loadWordPicker()

let gateCache: PairRow[] | null = null
/** The 70 WPM mixed-vs-mixed matrix, computed once for the gate and sanity. */
function gate70(): PairRow[] {
	gateCache ??= winRateMatrix({
		wpm: 70,
		n: GATE_N,
		pick,
		profileOverrides: RATIONAL,
	})
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
	}, 30_000)
})

describe('balance: dominance', () => {
	it('for every fighter, at 40, 70 and 100 WPM, neither jabber nor heavy beats mixed in a mirror by more than 55%', () => {
		const over: {
			f: FighterId
			wpm: number
			style: BotStyle
			rate: number
		}[] = []
		for (const wpm of DOMINANCE_WPMS) {
			for (const f of FIGHTER_IDS) {
				for (const style of ['jabber', 'heavy'] as const) {
					const rate = mirrorRate(
						f,
						style,
						'mixed',
						wpm,
						MIRROR_N,
						pick,
						{
							profileOverrides: RATIONAL,
						},
					).rate
					if (rate > DOMINANCE_MAX) over.push({ f, wpm, style, rate })
				}
			}
		}
		expect(over).toEqual([])
	}, 30_000)
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
		const fast = botProfile(100, 'mixed', RATIONAL)
		const slow = botProfile(40, 'mixed', RATIONAL)
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
			const r = mirrorRate('hero', s, 'mixed', 70, 20, pick, {
				profileOverrides: RATIONAL,
			})
			expect(r.rate).toBeGreaterThanOrEqual(0)
			expect(r.rate).toBeLessThanOrEqual(1)
		}
	})
})
