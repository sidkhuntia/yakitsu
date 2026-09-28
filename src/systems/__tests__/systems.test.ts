import { describe, expect, it } from 'vitest'
import { TypingEngine } from '../typingEngine'
import { RunState } from '../runState'
import { WordBank } from '../wordBank'
import {
	DIFFICULTIES,
	TUNING,
	WORD_TIERS,
	budgetMsFor,
	levelForWords,
	speedForBudget,
	tierForWordsCompleted,
	type DifficultyId,
} from '../tuning'

/** A steady typist, in characters per second. */
const CPM_200WPM = (200 / 60) * 5 // 16.7
const CASUAL_CPS = (70 / 60) * 5 // 5.8

describe('TypingEngine', () => {
	it('advances only on a correct character', () => {
		const e = new TypingEngine('CAT')
		expect(e.input('C')).toBe(true)
		expect(e.getCaret()).toBe(1)
		expect(e.isComplete()).toBe(false)
	})

	it('accepts either case', () => {
		const e = new TypingEngine('CAT')
		expect(e.input('c')).toBe(true)
		expect(e.input('A')).toBe(true)
		expect(e.input('t')).toBe(true)
		expect(e.isComplete()).toBe(true)
	})

	it('records a wrong character rather than silently dropping it', () => {
		const e = new TypingEngine('CAT')
		e.input('C')
		expect(e.input('X')).toBe(false)
		expect(e.getCaret()).toBe(2)
		expect(e.hasErrors()).toBe(true)
		expect(e.getMistakes()).toBe(1)
		// Blocked until the error is corrected.
		expect(e.isComplete()).toBe(false)
	})

	it('backspace clears a wrong character and refunds the mistake', () => {
		const e = new TypingEngine('CAT')
		e.input('C')
		e.input('X')
		e.backspace()
		expect(e.getCaret()).toBe(1)
		expect(e.getStates()[1]).toBe('pending')
		expect(e.getMistakes()).toBe(0)
		expect(e.input('A')).toBe(true)
	})

	it('backspace at position zero is a no-op', () => {
		const e = new TypingEngine('CAT')
		expect(e.backspace()).toBe(false)
		expect(e.getCaret()).toBe(0)
	})

	it('ignores input past the end of the word', () => {
		const e = new TypingEngine('CAT')
		'CAT'.split('').forEach((c) => e.input(c))
		expect(e.input('Z')).toBe(false)
		expect(e.getCaret()).toBe(3)
	})

	it('reset clears word, caret and mistakes', () => {
		const e = new TypingEngine('CAT')
		e.input('X')
		e.reset('DOG')
		expect(e.getWord()).toBe('DOG')
		expect(e.getCaret()).toBe(0)
		expect(e.getMistakes()).toBe(0)
		expect(e.hasErrors()).toBe(false)
	})
})

describe('difficulty fairness', () => {
	/**
	 * The central invariant of this game: a mode must never demand a typing
	 * speed no human can sustain. The old model ramped monster speed and word
	 * length independently, so "hard" needed 1140 WPM on the first word.
	 */
	it.each(Object.keys(DIFFICULTIES) as DifficultyId[])(
		'%s stays winnable at 200 WPM well past level 80',
		(id) => {
			for (let level = 1; level <= 80; level++) {
				const words = (level - 1) * TUNING.wordsPerLevel
				const tier = WORD_TIERS[tierForWordsCompleted(words)]
				const budget = budgetMsFor(tier.maxLen, level, DIFFICULTIES[id])
				const requiredCps = tier.maxLen / (budget / 1000)
				expect(requiredCps).toBeLessThan(CPM_200WPM)
			}
		},
	)

	it('gates the easy modes at a casual typist for a long run', () => {
		for (const id of ['easy', 'medium'] as DifficultyId[]) {
			for (let level = 1; level <= 80; level++) {
				const words = (level - 1) * TUNING.wordsPerLevel
				const tier = WORD_TIERS[tierForWordsCompleted(words)]
				const budget = budgetMsFor(tier.maxLen, level, DIFFICULTIES[id])
				expect(tier.maxLen / (budget / 1000)).toBeLessThan(CASUAL_CPS)
			}
		}
	})

	it('orders difficulty so higher modes are strictly harder', () => {
		const order: DifficultyId[] = ['easy', 'medium', 'hard', 'i-am-god']
		for (let i = 1; i < order.length; i++) {
			expect(DIFFICULTIES[order[i]].msPerChar).toBeLessThan(
				DIFFICULTIES[order[i - 1]].msPerChar,
			)
		}
	})

	it('scales the time budget with word length', () => {
		const d = DIFFICULTIES.medium
		expect(budgetMsFor(12, 1, d)).toBeGreaterThan(budgetMsFor(3, 1, d))
	})

	/**
	 * The retry penalty must not be able to produce a budget the player cannot
	 * physically meet. `takeHit` used to re-deal a fresh word; it now keeps the
	 * same word with a tighter clock, so this is the invariant that keeps that
	 * change fair.
	 */
	it.each(Object.keys(DIFFICULTIES) as DifficultyId[])(
		'%s stays winnable at 200 WPM even after repeated hits on one word',
		(id) => {
			for (const retreats of [1, 3, 10, 50, 500]) {
				for (let level = 1; level <= 80; level++) {
					const words = (level - 1) * TUNING.wordsPerLevel
					const tier = WORD_TIERS[tierForWordsCompleted(words)]
					const s = new RunState(DIFFICULTIES[id], 0)
					for (let r = 0; r < retreats; r++) s.registerRetreat()
					const budget = s.liveBudgetMsFor('x'.repeat(tier.maxLen))
					expect(tier.maxLen / (budget / 1000)).toBeLessThan(
						CPM_200WPM,
					)
				}
			}
		},
	)

	it('tightens the clock on each hit but never below the penalty floor', () => {
		const s = new RunState(DIFFICULTIES.medium, 0)
		const word = 'MONSTER'
		const first = s.liveBudgetMsFor(word)
		s.registerRetreat()
		const second = s.liveBudgetMsFor(word)
		expect(second).toBeLessThan(first)
		for (let i = 0; i < 200; i++) s.registerRetreat()
		const floored = s.liveBudgetMsFor(word)
		// Still >= the absolute budget floor, and no longer degrading.
		expect(floored).toBeGreaterThanOrEqual(TUNING.minBudgetMs)
		s.registerRetreat()
		expect(s.liveBudgetMsFor(word)).toBe(floored)
	})

	it('resets the hit count on a completed word', () => {
		const s = new RunState(DIFFICULTIES.medium, 0)
		s.registerRetreat()
		s.registerRetreat()
		expect(s.retreats).toBe(2)
		s.completeWord(6, 0, false)
		expect(s.retreats).toBe(0)
	})

	it('floors the budget so very short words stay readable', () => {
		const d = DIFFICULTIES['i-am-god']
		for (let level = 1; level <= 100; level++) {
			expect(budgetMsFor(3, level, d)).toBeGreaterThanOrEqual(
				TUNING.minBudgetMs,
			)
		}
	})

	it('tightens the budget with level but plateaus at the decay floor', () => {
		const d = DIFFICULTIES.medium
		const early = budgetMsFor(10, 1, d)
		const mid = budgetMsFor(10, 20, d)
		const late = budgetMsFor(10, 47, d)
		const floor = budgetMsFor(10, 100, d)
		expect(mid).toBeLessThan(early)
		expect(late).toBeLessThan(mid)
		// Plateau: no runaway difficulty past the floor.
		expect(floor).toBe(late)
	})

	it('never asks for less than zero time', () => {
		for (const id of Object.keys(DIFFICULTIES) as DifficultyId[]) {
			expect(budgetMsFor(1, 1, DIFFICULTIES[id])).toBeGreaterThan(0)
		}
	})
})

describe('progression', () => {
	it('always starts every run on the easiest tier', () => {
		for (const id of Object.keys(DIFFICULTIES) as DifficultyId[]) {
			expect(tierForWordsCompleted(0)).toBe(0)
			expect(id).toBeTruthy()
		}
	})

	it('ramps tiers monotonically', () => {
		let prev = -1
		for (let w = 0; w < 120; w += 5) {
			const t = tierForWordsCompleted(w)
			expect(t).toBeGreaterThanOrEqual(prev)
			prev = t
		}
	})

	it('levels up every wordsPerLevel words', () => {
		expect(levelForWords(0)).toBe(1)
		expect(levelForWords(TUNING.wordsPerLevel - 1)).toBe(1)
		expect(levelForWords(TUNING.wordsPerLevel)).toBe(2)
		expect(levelForWords(TUNING.wordsPerLevel * 2)).toBe(3)
	})

	it('gives higher modes fewer lives', () => {
		expect(DIFFICULTIES.easy.lives).toBeGreaterThan(
			DIFFICULTIES.medium.lives,
		)
		expect(DIFFICULTIES.medium.lives).toBeGreaterThan(
			DIFFICULTIES.hard.lives,
		)
		expect(DIFFICULTIES.hard.lives).toBeGreaterThan(
			DIFFICULTIES['i-am-god'].lives,
		)
	})
})

describe('RunState scoring', () => {
	const fresh = () => new RunState(DIFFICULTIES.medium, 0)

	it('awards more for longer words', () => {
		const a = fresh()
		const short = a.completeWord(3, 0, false).earned
		const longRun = fresh()
		const long = longRun.completeWord(12, 0, false).earned
		expect(long).toBeGreaterThan(short)
	})

	it('pays a perfect-word bonus', () => {
		const perfect = fresh().completeWord(6, 0, false).earned
		const sloppy = fresh().completeWord(6, 2, false).earned
		expect(perfect).toBeGreaterThan(sloppy)
	})

	it('pays a near-miss bonus', () => {
		const near = fresh().completeWord(6, 0, true).earned
		const clean = fresh().completeWord(6, 0, false).earned
		expect(near).toBeGreaterThan(clean)
	})

	it('grows the combo multiplier with streak', () => {
		const s = fresh()
		let first = 0
		for (let i = 0; i < 12; i++) {
			const r = s.completeWord(6, 0, false)
			if (i === 0) first = r.earned
		}
		const last = s.completeWord(6, 0, false).earned
		expect(last).toBeGreaterThan(first)
		expect(s.combo).toBe(13)
		expect(s.maxCombo).toBe(13)
	})

	it('reports a level-up exactly on each boundary', () => {
		const s = fresh()
		const upsAt: number[] = []
		for (let i = 0; i < TUNING.wordsPerLevel * 3; i++) {
			if (s.completeWord(5, 0, false).levelledUp) {
				// 1-based word number that triggered the level-up.
				upsAt.push(i + 1)
			}
		}
		expect(upsAt).toEqual([
			TUNING.wordsPerLevel,
			TUNING.wordsPerLevel * 2,
			TUNING.wordsPerLevel * 3,
		])
	})

	it('ends the run only when the last life is gone', () => {
		const s = new RunState(DIFFICULTIES['i-am-god'], 0)
		expect(s.lives).toBe(1)
		expect(s.loseLife()).toBe(true)
	})

	it('resets combo but not the run on a hit', () => {
		const s = new RunState(DIFFICULTIES.easy, 0)
		s.completeWord(5, 0, false)
		s.loseLife()
		expect(s.combo).toBe(0)
		expect(s.wordsCompleted).toBe(1)
		expect(s.lives).toBe(3)
	})

	describe('assist', () => {
		it('defaults to the fair speed', () => {
			const s = new RunState(DIFFICULTIES.medium, 0)
			expect(s.speedFor('MONSTER')).toBeCloseTo(
				TUNING.travelDistance / (s.liveBudgetMsFor('MONSTER') / 1000),
				5,
			)
		})

		it('scales monster speed down at 70% assist', () => {
			const fair = new RunState(DIFFICULTIES.medium, 0)
			const assisted = new RunState(DIFFICULTIES.medium, 0, 0.7)
			expect(assisted.speedFor('MONSTER')).toBeCloseTo(
				fair.speedFor('MONSTER') * 0.7,
				5,
			)
		})

		it('gives the player proportionally more time, not a relabelled timer', () => {
			const fair = new RunState(DIFFICULTIES.medium, 0)
			const assisted = new RunState(DIFFICULTIES.medium, 0, 0.7)
			const travelFair = TUNING.travelDistance / fair.speedFor('MONSTER')
			const travelAssisted =
				TUNING.travelDistance / assisted.speedFor('MONSTER')
			expect(travelAssisted).toBeGreaterThan(travelFair)
		})

		it('clamps a corrupt save value into the winnable range', () => {
			const tooFast = new RunState(DIFFICULTIES.hard, 0, 5)
			const fair = new RunState(DIFFICULTIES.hard, 0)
			expect(tooFast.assistLevel).toBe(1)
			expect(tooFast.speedFor('CAT')).toBeCloseTo(fair.speedFor('CAT'), 5)

			const tooSlow = new RunState(DIFFICULTIES.hard, 0, 0)
			expect(tooSlow.assistLevel).toBeGreaterThan(0)
			expect(tooSlow.speedFor('CAT')).toBeLessThan(fair.speedFor('CAT'))
		})
	})

	describe('time bank', () => {
		it('pays more for a bigger shove', () => {
			const a = fresh().completeWord(6, 0, false, 0).earned
			const some = fresh().completeWord(6, 0, false, 100).earned
			const lots = fresh().completeWord(6, 0, false, 200).earned
			expect(some).toBeGreaterThan(a)
			expect(lots).toBeGreaterThan(some)
		})

		it('caps the bonus so it cannot run away', () => {
			const huge = fresh().completeWord(6, 0, false, 100_000).earned
			const base = fresh().completeWord(6, 0, false, 0).earned
			const maxMult = 1 + TUNING.timeBankBonusCap
			expect(huge / base).toBeLessThanOrEqual(maxMult + 0.01)
		})

		it('rewards the shove in seconds, so it is comparable across word lengths', () => {
			// A long word runs at a lower px/sec, so the same pixel shove is worth
			// MORE seconds. The reward therefore scales with how much reading and
			// typing the player actually did.
			const sameShove = fresh().completeWord(3, 0, false, 66).bankedSec
			const sameShoveLong = fresh().completeWord(
				12,
				0,
				false,
				66,
			).bankedSec
			expect(sameShoveLong).toBeGreaterThan(sameShove)

			// With a realistic per-word shove, longer words bank meaningfully more
			// time. Short words bank very little by construction, which is honest:
			// there are only three keystrokes to spend.
			const realisticShort = fresh().completeWord(
				3,
				0,
				false,
				3 * TUNING.knockbackPx,
			).bankedSec
			const realisticLong = fresh().completeWord(
				12,
				0,
				false,
				12 * TUNING.knockbackPx,
			).bankedSec
			expect(realisticLong).toBeGreaterThan(realisticShort)
			expect(realisticLong).toBeGreaterThan(0.15)
		})

		it('reports a negligible shove as not banked', () => {
			expect(fresh().completeWord(6, 0, false, 0).banked).toBe(false)
			expect(fresh().completeWord(6, 0, false, 300).banked).toBe(true)
		})

		/**
		 * Regression guard for the reason the mechanic was reworked. The old
		 * model granted a small amount per key and bled a large amount per
		 * second, which put the break-even typing rate above what most players
		 * sustain — the shove decayed faster than it was built.
		 *
		 * The invariant now is structural: there is no decay term in the tuning
		 * table at all, so every correct key banks its full value regardless of
		 * how slowly the player types.
		 */
		it('banks the full grant per key, with no decay to outrun', () => {
			const tuning = TUNING as unknown as Record<string, unknown>
			expect(tuning.knockbackDecayPerSec).toBeUndefined()
			expect(TUNING.knockbackPx).toBeGreaterThan(0)
		})

		it('turns a full word of typing into a meaningful time bank', () => {
			for (const id of Object.keys(DIFFICULTIES) as DifficultyId[]) {
				for (const len of [4, 6, 8, 11]) {
					const banked = len * TUNING.knockbackPx
					const speed = speedForBudget(
						budgetMsFor(len, 1, DIFFICULTIES[id]),
					)
					// A player who types every letter cleanly gets at least a
					// fifth of a second of travel bought back, and it grows with
					// word length.
					expect(banked / speed).toBeGreaterThan(0.15)
				}
			}
		})

		it('rewards reading and typing, not elapsed time', () => {
			// The shove is a function of keystrokes, not of how long the player
			// took, so a long word banks more travel than a short one regardless
			// of pacing. Pacing is expressed by the near-miss bonus instead.
			const secsFor = (len: number) => {
				const travel = len * TUNING.knockbackPx
				const budget = budgetMsFor(len, 1, DIFFICULTIES.medium)
				const speed = TUNING.travelDistance / (budget / 1000)
				return travel / speed
			}
			expect(secsFor(10)).toBeGreaterThan(secsFor(3))
		})

		it('keeps the shove from ever stalling the monster', () => {
			// Travel always accumulates, so even a fully banked shove leaves the
			// monster guaranteed to arrive.
			expect(TUNING.maxKnockbackPx).toBeLessThan(TUNING.travelDistance)
		})
	})

	it('derives a speed that spends exactly the budget', () => {
		const s = fresh()
		const word = 'MONSTER'
		const seconds = s.budgetFor(word) / 1000
		expect(TUNING.travelDistance / s.speedFor(word)).toBeCloseTo(seconds, 5)
	})

	it('reports 100% accuracy with no input and degrades on errors', () => {
		const s = fresh()
		expect(s.accuracy).toBe(100)
		s.recordKeystroke(true, 100)
		s.recordKeystroke(true, 200)
		s.recordKeystroke(false, 300)
		expect(s.accuracy).toBe(67)
	})

	it('freezes the clock across a pause', () => {
		const s = fresh()
		s.tick(0)
		s.tick(10_000)
		const before = s.elapsedMs
		s.pause(10_000)
		s.tick(30_000)
		s.resume(30_000)
		s.tick(40_000)
		expect(s.elapsedMs).toBe(before + 10_000)
	})

	it('does not bill the countdown as play time', () => {
		const s = new RunState(DIFFICULTIES.medium, 0)
		// Scene created at t=0, but the clock only starts at GO.
		s.startClock(5_000)
		s.tick(8_000)
		expect(s.elapsedMs).toBe(3_000)
	})

	it('never reports a negative or shrinking duration', () => {
		const s = new RunState(DIFFICULTIES.medium, 0)
		s.startClock(1_000)
		s.tick(1_000)
		expect(s.elapsedMs).toBe(0)
		s.tick(2_000)
		const a = s.elapsedMs
		s.tick(3_000)
		expect(s.elapsedMs).toBeGreaterThan(a)
	})
})

describe('WordBank', () => {
	const thesaurus = {
		three: ['CAT', 'DOG', 'SUN', 'BAT', 'PIG'],
		small: ['CRANE', 'TIGER', 'HORSE'],
		medium: ['MONSTER', 'KNIGHT', 'CASTLE', 'DRAGON'],
		big: ['ADVENTURER', 'TREASURE', 'BATTLEFIELD'],
		large: ['EXTRAORDINARY', 'HANDKERCHIEF', 'PARLIAMENT'],
	}

	it('only emits words from the promised tier', () => {
		const bank = new WordBank(thesaurus)
		for (let w = 0; w < 60; w++) {
			const tier = WORD_TIERS[tierForWordsCompleted(w)]
			const word = bank.pick(w)
			expect(word.length).toBeGreaterThanOrEqual(tier.minLen)
			expect(word.length).toBeLessThanOrEqual(tier.maxLen)
		}
	})

	it('normalises case', () => {
		const bank = new WordBank({ three: ['cat'] })
		expect(bank.pick(0)).toBe('CAT')
	})

	it('avoids immediate repeats when the pool allows it', () => {
		const bank = new WordBank(thesaurus)
		const seen: string[] = []
		for (let i = 0; i < 40; i++) seen.push(bank.pick(0))
		for (let i = 1; i < seen.length; i++) {
			expect(seen[i]).not.toBe(seen[i - 1])
		}
	})

	it('degrades to a lower tier when one is missing', () => {
		const bank = new WordBank({ three: ['CAT', 'DOG'] })
		// At word 40 the bank asks for the "big" tier, which does not exist.
		const word = bank.pick(40)
		expect(['CAT', 'DOG']).toContain(word)
	})

	it('falls back rather than throwing on an empty thesaurus', () => {
		const bank = new WordBank(undefined)
		expect(bank.isUsable).toBe(false)
		expect(bank.pick(0)).toBe('YAKITSU')
	})
})
