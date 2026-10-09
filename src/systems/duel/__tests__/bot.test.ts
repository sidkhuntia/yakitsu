import { describe, expect, it } from 'vitest'
import { FIGHTERS } from '../fighters'
import {
	PlayerDeck,
	type KeyResult,
	type Slot,
	type WordPicker,
} from '../playerDeck'
import { seededRng } from '../rng'
import type { Side } from '../duelTuning'
import {
	TypistBot,
	botProfile,
	type BotHost,
	type BotProfile,
} from '../typistBot'

/** Word length per tier, matching WORD_TIERS' minLen/maxLen choices. */
const TIER_LEN = [3, 4, 6, 9, 12]

/**
 * Stub picker: a word of the tier's length for each letter, so every card has
 * a distinct first letter. Chosen by the rng so the deck still depends on seed.
 */
const pick: WordPicker = (tier, reject, rng) => {
	const len = TIER_LEN[tier]
	const pool = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
		.map((c) => c + 'AEIOU'.repeat(4).slice(0, len - 1))
		.filter((w) => !reject(w))
	return pool[Math.floor(rng() * pool.length)]
}

interface Entry {
	at: number
	/** The key typed, or null for a backspace. */
	ch: string | null
	result: KeyResult['kind'] | 'backspace'
	/** Right letter for the active card before the key, if a card was active. */
	expected: string | undefined
	/** First letters of every card on the deck before the key. */
	firsts: string[]
}

/** A BotHost on a real PlayerDeck, logging every key the bot presses. */
class FakeHost implements BotHost {
	readonly deckOf: PlayerDeck
	readonly log: Entry[] = []
	busyFlag = false
	meterValue = 0
	private offer: { word: string; offeredAt: number } | null = null

	constructor(seed: number) {
		this.deckOf = new PlayerDeck(pick, seed, FIGHTERS.hero)
	}

	/** Put a block card on the deck, as an incoming attack would. */
	offerBlock(tier: number, at: number): void {
		const word = this.deckOf.offerBlock(tier)
		this.offer = { word, offeredAt: at }
	}

	/** These tests only model p1; anything else is a bug in the test. */
	private only(side: Side): PlayerDeck {
		if (side !== 'p1') throw new Error('FakeHost only models p1')
		return this.deckOf
	}

	deck(side: Side): PlayerDeck {
		return this.only(side)
	}

	meter(side: Side): number {
		this.only(side)
		return this.meterValue
	}

	busy(side: Side): boolean {
		this.only(side)
		return this.busyFlag
	}

	blockOffer(side: Side): { word: string; offeredAt: number } | null {
		this.only(side)
		// The deck clears its block card when the block resolves; the offer goes
		// with it, the same way DuelMatch clears offers on parry or landing.
		if (!this.deckOf.card('block')) this.offer = null
		return this.offer
	}

	key(side: Side, ch: string, at: number): void {
		const d = this.only(side)
		const active = d.active ? d.card(d.active) : undefined
		const expected = active?.word[active.engine.getCaret()]
		const firsts = slots()
			.map((s) => d.card(s)?.word[0])
			.filter((c): c is string => c !== undefined)
		const r = d.key(ch, this.meterValue)
		this.log.push({ at, ch, result: r.kind, expected, firsts })
	}

	backspace(side: Side, at: number): void {
		this.only(side).backspace()
		this.log.push({
			at,
			ch: null,
			result: 'backspace',
			expected: undefined,
			firsts: [],
		})
	}
}

function slots(): Slot[] {
	return ['jab', 'heavy', 'special', 'block']
}

/** Jab-only, perfect typist, no jitter: every timing is exact. */
function jabOnly(): BotProfile {
	return {
		...botProfile(60, 'mixed'),
		accuracy: 1,
		jitter: 0,
		parryChance: 0,
		moveWeights: { jab: 1, heavy: 0, special: 0 },
	}
}

/** Drive a bot to `end` using the given stepping strategy. */
function run(
	bot: TypistBot,
	host: BotHost,
	end: number,
	step: 'ms1' | 'ms50' | 'jump',
): void {
	if (step === 'jump') {
		for (let t = bot.nextActionAt(); t <= end; t = bot.nextActionAt()) {
			bot.tick(host, t)
		}
		return
	}
	const dt = step === 'ms1' ? 1 : 50
	for (let t = 0; t <= end; t += dt) bot.tick(host, t)
}

describe('botProfile', () => {
	it('gets more accurate and faster as WPM rises, clamped at the ends', () => {
		const slow = botProfile(10)
		const mid = botProfile(70)
		const fast = botProfile(200)
		expect(slow.accuracy).toBeCloseTo(0.9)
		expect(fast.accuracy).toBeCloseTo(0.98)
		expect(slow.reactionMs).toBe(900)
		expect(fast.reactionMs).toBe(350)
		expect(mid.accuracy).toBeGreaterThan(slow.accuracy)
		expect(mid.reactionMs).toBeLessThan(slow.reactionMs)
	})

	it('style sets the move mix and parry appetite', () => {
		expect(botProfile(70, 'jabber').moveWeights.jab).toBeGreaterThan(
			botProfile(70, 'mixed').moveWeights.jab,
		)
		expect(botProfile(70, 'turtle').parryChance).toBeGreaterThan(
			botProfile(70, 'jabber').parryChance,
		)
	})
})

describe('TypistBot', () => {
	it('types a jab word at 60 WPM one key every 200 ms', () => {
		const host = new FakeHost(7)
		const profile = jabOnly()
		const bot = new TypistBot('p1', profile, seededRng(1))
		bot.reset(0)
		run(bot, host, 2000, 'ms1')

		const keys = host.log.filter((e) => e.ch !== null)
		const first = keys[0].at
		expect(first).toBe(profile.reactionMs)
		keys.forEach((e, i) => expect(e.at).toBe(first + i * 200))

		// The first key of the next word comes len × 200 ms after this word's
		// first key: one keystroke per interval, no gaps between words.
		const len = TIER_LEN[0]
		expect(keys[len].at - keys[0].at).toBe(len * 200)
		expect(keys[len - 1].result).toBe('complete')
	})

	it('is deterministic: same seeds give an identical key log', () => {
		const logOf = () => {
			const host = new FakeHost(42)
			const bot = new TypistBot('p1', botProfile(60), seededRng(9))
			bot.reset(0)
			run(bot, host, 30_000, 'ms50')
			return JSON.stringify(host.log)
		}
		expect(logOf()).toBe(logOf())
	})

	it('wrong letters are never the expected letter or a card first letter, and are followed by a backspace', () => {
		const host = new FakeHost(3)
		const profile = { ...botProfile(40), accuracy: 0.6, jitter: 0.25 }
		const bot = new TypistBot('p1', profile, seededRng(5))
		bot.reset(0)
		run(bot, host, 60_000, 'ms50')

		const mistakes = host.log.filter((e) => e.result === 'mistake')
		expect(mistakes.length).toBeGreaterThan(10)
		for (let i = 0; i < host.log.length; i++) {
			const e = host.log[i]
			if (e.result !== 'mistake') continue
			expect(e.ch).not.toBe(e.expected)
			expect(e.firsts).not.toContain(e.ch)
			expect(host.log[i + 1]?.result).toBe('backspace')
		}
	})

	it('never presses the last letter of an attack while busy', () => {
		const host = new FakeHost(11)
		host.busyFlag = true
		const bot = new TypistBot('p1', jabOnly(), seededRng(2))
		bot.reset(0)
		run(bot, host, 10_000, 'ms1')

		expect(host.log.some((e) => e.result === 'complete')).toBe(false)
		const jab = host.deck('p1').card('jab')
		expect(host.deck('p1').active).toBe('jab')
		expect(jab?.engine.getCaret()).toBe(TIER_LEN[0] - 1)
	})

	it('parries a block offer after its reaction time when parryChance is 1', () => {
		const host = new FakeHost(21)
		const profile = { ...jabOnly(), parryChance: 1 }
		const bot = new TypistBot('p1', profile, seededRng(4))
		host.offerBlock(0, 0)
		const blockWord = host.deck('p1').card('block')!.word
		bot.reset(0)
		run(bot, host, profile.reactionMs + 500, 'ms1')

		const first = host.log[0]
		expect(first.at).toBe(profile.reactionMs)
		expect(first.ch).toBe(blockWord[0])
		expect(host.log.some((e) => e.result === 'complete')).toBe(true)
	})

	it('ignores a block offer when parryChance is 0', () => {
		const host = new FakeHost(21)
		const profile = { ...jabOnly(), parryChance: 0 }
		const bot = new TypistBot('p1', profile, seededRng(4))
		const jabWord = host.deck('p1').card('jab')!.word
		host.offerBlock(0, 0)
		const blockWord = host.deck('p1').card('block')!.word
		bot.reset(0)
		run(bot, host, 5000, 'ms1')

		expect(host.log[0].ch).toBe(jabWord[0])
		expect(host.log.some((e) => e.ch === blockWord[0])).toBe(false)
		expect(host.deck('p1').card('block')?.engine.getCaret()).toBe(0)
	})

	it('same key log whether ticked every 1 ms, every 50 ms, or jumped to nextActionAt()', () => {
		const logWith = (step: 'ms1' | 'ms50' | 'jump') => {
			const host = new FakeHost(77)
			const bot = new TypistBot(
				'p1',
				botProfile(70, 'mixed'),
				seededRng(13),
			)
			host.offerBlock(0, 0)
			bot.reset(0)
			run(bot, host, 15_000, step)
			return JSON.stringify(host.log)
		}
		const fine = logWith('ms1')
		expect(logWith('ms50')).toBe(fine)
		expect(logWith('jump')).toBe(fine)
	})
})
