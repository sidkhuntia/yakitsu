import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FIGHTERS, type FighterMove } from '../fighters'
import {
	MAX_LEVEL,
	clampLevel,
	duelLevel,
	requiredWindupScale,
	type DuelLevel,
} from '../duelLevels'
import { WORD_TIERS } from '../../tuning'
import { loadData, recordDuel } from '../../persistence'
import { LADDER_CHECK_SEED, ladderWinRate } from '../balance'
import { loadWordPicker } from './wordsFixture'

/** Matches per ladder point. Deterministic: fixed seeds. */
const LADDER_N = 200
const pick = loadWordPicker()

/** The goblin's parryable moves, each with the length of its block word. */
const parryable: { move: FighterMove; maxLen: number }[] = Object.values(
	FIGHTERS.goblin.moves,
).flatMap((m) =>
	m.blockTier === null
		? []
		: [{ move: m, maxLen: WORD_TIERS[m.blockTier].maxLen }],
)

/**
 * Whether every parryable goblin move is fair at this level when its windup
 * is scaled by `windupScale`. Fair means the reaction allowance plus the
 * longest block word, typed at the level's own speed, fits in the windup.
 */
function allFair(lv: DuelLevel, windupScale: number): boolean {
	return parryable.every(({ move, maxLen }) => {
		const budget = lv.reactionMs + maxLen * (12_000 / lv.targetWpm)
		return move.windupMs * windupScale >= budget
	})
}

describe('duel levels', () => {
	it('every knob gets harder as the level rises, none gets easier', () => {
		for (let n = 2; n <= MAX_LEVEL; n++) {
			const a = duelLevel(n - 1)
			const b = duelLevel(n)
			expect(b.targetWpm).toBeGreaterThan(a.targetWpm)
			expect(b.msPerChar).toBeLessThan(a.msPerChar)
			expect(b.reactionMs).toBeLessThanOrEqual(a.reactionMs)
			expect(b.windupScale).toBeLessThanOrEqual(a.windupScale)
			expect(b.goblinHp).toBeGreaterThanOrEqual(a.goblinHp)
			expect(b.bot.wpm).toBeGreaterThanOrEqual(a.bot.wpm)
			expect(b.bot.accuracy).toBeGreaterThanOrEqual(a.bot.accuracy)
			expect(b.bot.reactionMs).toBeLessThanOrEqual(a.bot.reactionMs)
			expect(b.bot.parryChance).toBeGreaterThanOrEqual(a.bot.parryChance)
		}
	})

	it('the opening windups are stretched, the top ones are not', () => {
		expect(duelLevel(1).windupScale).toBeGreaterThan(1)
		expect(duelLevel(MAX_LEVEL).windupScale).toBe(1)
	})

	it('every parryable goblin move is fair at the level target speed', () => {
		for (let n = 1; n <= MAX_LEVEL; n++) {
			const lv = duelLevel(n)
			expect(allFair(lv, lv.windupScale)).toBe(true)
		}
	})

	it('the windup scale is the smallest fair one, not a generous one', () => {
		for (let n = 1; n <= MAX_LEVEL; n++) {
			const lv = duelLevel(n)
			if (lv.windupScale > 1)
				expect(allFair(lv, lv.windupScale - 0.001)).toBe(false)
		}
	})

	it('the bot is slower than the target speed it is paired with', () => {
		for (let n = 1; n <= MAX_LEVEL; n++) {
			const lv = duelLevel(n)
			expect(lv.bot.wpm).toBeLessThan(lv.targetWpm)
		}
	})

	it('the required windup scale never drops below 1', () => {
		expect(requiredWindupScale(FIGHTERS.goblin, 1000, 0)).toBe(1)
		expect(requiredWindupScale(FIGHTERS.goblin, 22, 900)).toBeGreaterThan(1)
	})

	it('clamps out-of-range levels', () => {
		expect(clampLevel(0)).toBe(1)
		expect(clampLevel(99)).toBe(MAX_LEVEL)
		expect(clampLevel(Number.NaN)).toBe(1)
	})
})

describe('duel ladder calibration', () => {
	// A Hero that always parries, typing at the level's speed, against the
	// goblin of that level. Measured with `ladderWinRate` on the check seeds.
	it.each([1, 6, 12])(
		'level %i: a player at the target speed wins 65-80%, at 0.75x wins at most 35%',
		(n) => {
			const lv = duelLevel(n)
			const at = ladderWinRate(
				lv,
				lv.targetWpm,
				LADDER_N,
				LADDER_CHECK_SEED,
				pick,
			).rate
			const slow = ladderWinRate(
				lv,
				Math.round(lv.targetWpm * 0.75),
				LADDER_N,
				LADDER_CHECK_SEED,
				pick,
			).rate
			expect(at).toBeGreaterThanOrEqual(0.65)
			expect(at).toBeLessThanOrEqual(0.8)
			expect(slow).toBeLessThanOrEqual(0.35)
		},
		30_000,
	)
})

describe('duel progress', () => {
	let store: Record<string, string>
	beforeEach(() => {
		store = {}
		;(globalThis as { localStorage?: unknown }).localStorage = {
			getItem: (k: string) => store[k] ?? null,
			setItem: (k: string, v: string) => {
				store[k] = v
			},
		}
	})
	afterEach(() => {
		delete (globalThis as { localStorage?: unknown }).localStorage
	})

	it('a win unlocks the next level, a loss does not', () => {
		expect(recordDuel(1, false, 60_000, MAX_LEVEL)).toBe(false)
		expect(loadData().duel.unlockedLevel).toBe(1)
		expect(recordDuel(1, true, 60_000, MAX_LEVEL)).toBe(true)
		expect(loadData().duel.unlockedLevel).toBe(2)
	})

	it('replaying an old level never unlocks anything new', () => {
		recordDuel(1, true, 1, MAX_LEVEL)
		recordDuel(2, true, 1, MAX_LEVEL)
		expect(recordDuel(1, true, 1, MAX_LEVEL)).toBe(false)
		expect(loadData().duel.unlockedLevel).toBe(3)
	})

	it('cannot unlock past the top of the ladder', () => {
		recordDuel(MAX_LEVEL, true, 1, MAX_LEVEL)
		expect(loadData().duel.unlockedLevel).toBeLessThanOrEqual(MAX_LEVEL)
	})

	it('an assisted win unlocks but sets no best time', () => {
		expect(recordDuel(1, true, 5000, MAX_LEVEL, true)).toBe(true)
		expect(loadData().duel.bestMs).toEqual({})
	})

	it('repairs a tampered save', () => {
		store['yatiksu-save-v1'] = JSON.stringify({
			duel: { unlockedLevel: -4, bestMs: { 1: 'fast' }, wins: 'x' },
		})
		const d = loadData().duel
		expect(d.unlockedLevel).toBe(1)
		expect(d.bestMs).toEqual({})
		expect(d.wins).toBe(0)
	})
})
