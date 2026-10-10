import { describe, expect, it } from 'vitest'
import { PlayerDeck, type WordPicker } from '../playerDeck'
import { FIGHTERS, type FighterDef } from '../fighters'
import { mixSeed } from '../rng'
import { WordBank } from '../../wordBank'
import { WORD_TIERS } from '../../tuning'

/** Deterministic picker: first word in the list the deck will accept. */
function pickerFrom(words: Record<number, string[]>): WordPicker {
	// Ignores the rng on purpose: these tests are about targeting, not draws.
	return (tier, reject) =>
		(words[tier] ?? []).find((w) => !reject(w)) ?? 'ZZZ'
}

const WORDS = {
	0: ['CAT', 'COW', 'BIG', 'ASK', 'DOG'],
	1: ['PARRY', 'BLOCK', 'DUCK'],
	2: ['HAMMER', 'HARPOON', 'KNUCKLE'],
	3: ['SHOWSTOPPER', 'SPECTACULAR'],
}

describe('PlayerDeck', () => {
	it('deals cards with distinct first letters', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		const firsts = ['jab', 'heavy', 'special'].map(
			(s) => deck.card(s as 'jab')!.word[0],
		)
		expect(new Set(firsts).size).toBe(3)
	})

	it('the first letter commits to a card', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		expect(deck.key('h', 0)).toEqual({ kind: 'progress', slot: 'heavy' })
		expect(deck.active).toBe('heavy')
	})

	it('completing a word reports perfection and re-deals', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		let last
		for (const ch of 'CAT') last = deck.key(ch, 0)
		expect(last).toEqual({
			kind: 'complete',
			slot: 'jab',
			word: 'CAT',
			perfect: true,
		})
		expect(deck.active).toBeNull()
		expect(deck.card('jab')!.word).not.toBe('CAT')
	})

	it('a corrected typo still costs the perfect bonus', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		deck.key('C', 0)
		expect(deck.key('X', 0).kind).toBe('mistake')
		deck.backspace()
		deck.key('A', 0)
		expect(deck.key('T', 0)).toMatchObject({
			kind: 'complete',
			perfect: false,
		})
	})

	it('the special is locked without meter', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		expect(deck.key('S', 0)).toEqual({ kind: 'locked', slot: 'special' })
		expect(deck.key('S', FIGHTERS.hero.moves.special.meterCost).kind).toBe(
			'progress',
		)
	})

	it('switches to the block word mid-word', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		deck.key('H', 0)
		deck.key('A', 0)
		const block = deck.offerBlock(1)
		expect(deck.key(block[0], 0)).toEqual({
			kind: 'progress',
			slot: 'block',
		})
		expect(deck.suspended).toBe('heavy')
	})

	it('a parried block hands the caret back to the suspended word', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		deck.key('H', 0)
		deck.key('A', 0)
		const block = deck.offerBlock(1)
		for (const ch of block) deck.key(ch, 0)
		expect(deck.active).toBe('heavy')
		expect(deck.card('heavy')!.engine.getCaret()).toBe(2)
		expect(deck.key('M', 0).kind).toBe('progress')
	})

	it('the suspended word also resumes when the attack lands', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		deck.key('H', 0)
		const block = deck.offerBlock(1)
		deck.key(block[0], 0)
		deck.clearBlock()
		expect(deck.active).toBe('heavy')
	})

	it('backing out of the block word resumes the suspended word', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		deck.key('H', 0)
		const block = deck.offerBlock(1)
		deck.key(block[0], 0)
		deck.backspace()
		expect(deck.active).toBe('heavy')
	})

	it('switching between attacks resets the card you leave', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		deck.key('H', 0)
		deck.key('A', 0)
		deck.key('C', 0) // jab starts with C
		expect(deck.active).toBe('jab')
		expect(deck.card('heavy')!.engine.getCaret()).toBe(0)
	})

	it('never reinterprets a typo as a switch', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		deck.key('H', 0)
		deck.key('Q', 0)
		const block = deck.offerBlock(1)
		expect(deck.key(block[0], 0).kind).toBe('mistake')
		expect(deck.active).toBe('heavy')
	})

	it('backspacing to empty releases the card', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		deck.key('H', 0)
		deck.backspace()
		expect(deck.active).toBeNull()
	})

	it('reports a heavy held one key from done as loaded', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		const word = deck.card('heavy')!.word
		for (const ch of word.slice(0, -2)) deck.key(ch, 0)
		expect(deck.isLoaded()).toBe(false)
		deck.key(word[word.length - 2], 0)
		expect(deck.isLoaded()).toBe(true)
	})

	it('a jab is never "loaded"', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		deck.key('C', 0)
		deck.key('A', 0)
		expect(deck.isLoaded()).toBe(false)
	})

	it('clearing an active block frees the input', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, FIGHTERS.hero)
		const block = deck.offerBlock(1)
		deck.key(block[0], 0)
		deck.clearBlock()
		expect(deck.active).toBeNull()
		expect(deck.card('block')).toBeUndefined()
	})
})

describe('PlayerDeck suspendOnBlock', () => {
	/** Heavy typed to "HA", then the block word's first letter. */
	function blockSwitch(suspendOnBlock?: boolean) {
		const deck = new PlayerDeck(
			pickerFrom(WORDS),
			1,
			FIGHTERS.hero,
			suspendOnBlock === undefined ? {} : { suspendOnBlock },
		)
		deck.key('H', 0)
		deck.key('A', 0)
		const block = deck.offerBlock(1)
		expect(deck.key(block[0], 0)).toEqual({
			kind: 'progress',
			slot: 'block',
		})
		return { deck, block }
	}

	it('default (true) parks the attack word and resumes it after the block', () => {
		const { deck, block } = blockSwitch()
		expect(deck.suspended).toBe('heavy')
		for (const ch of block.slice(1)) deck.key(ch, 0)
		expect(deck.active).toBe('heavy')
		expect(deck.card('heavy')!.engine.getCaret()).toBe(2)
	})

	it('false: the switch to block resets the attack word you leave', () => {
		const { deck } = blockSwitch(false)
		expect(deck.active).toBe('block')
		expect(deck.suspended).toBeNull()
		expect(deck.card('heavy')!.engine.getCaret()).toBe(0)
	})

	it('false: nothing resumes when the block is parried', () => {
		const { deck, block } = blockSwitch(false)
		for (const ch of block.slice(1)) deck.key(ch, 0)
		expect(deck.active).toBeNull()
		expect(deck.card('heavy')!.engine.getCaret()).toBe(0)
	})

	it('false: nothing resumes when the attack lands and clears the block', () => {
		const { deck } = blockSwitch(false)
		deck.clearBlock()
		expect(deck.active).toBeNull()
		expect(deck.card('heavy')!.engine.getCaret()).toBe(0)
	})

	it('false: nothing resumes when the block is backed out of', () => {
		const { deck } = blockSwitch(false)
		deck.backspace()
		expect(deck.active).toBeNull()
		expect(deck.card('heavy')!.engine.getCaret()).toBe(0)
	})
})

describe('seeded decks', () => {
	const bank = new WordBank({
		three: ['CAT', 'COW', 'BIG', 'ASK', 'DOG', 'EGG', 'FOX', 'HAT', 'ICE'],
		small: ['PARRY', 'BLOCK', 'DUCK', 'GUARD', 'EVADE', 'LEAP'],
		medium: [
			'HAMMER',
			'KNUCKLE',
			'RAPIER',
			'LANTERN',
			'OCTOPUS',
			'TORNADO',
		],
		big: ['SHOWSTOPPER', 'WATERFALL', 'BUTTERFLY', 'NIGHTMARE'],
		large: [],
	})
	const seeded = (seed: number, fighter: FighterDef = FIGHTERS.hero) =>
		new PlayerDeck(
			(t, r, rng) => bank.pickFromTier(t, r, rng),
			seed,
			fighter,
		)
	/** Complete the current word on a slot, returning it. */
	const finish = (deck: PlayerDeck, slot: 'jab' | 'heavy') => {
		const word = deck.card(slot)!.word
		for (const ch of word) deck.key(ch, 0)
		return word
	}

	it('the same seed deals the same opening hand', () => {
		const a = seeded(99)
		const b = seeded(99)
		for (const slot of ['jab', 'heavy', 'special'] as const) {
			expect(a.card(slot)!.word).toBe(b.card(slot)!.word)
		}
	})

	it('the n-th heavy matches even if the players typed different jabs', () => {
		const a = seeded(7)
		const b = seeded(7)
		// Player A spams jabs, player B does not.
		for (let i = 0; i < 4; i++) finish(a, 'jab')
		const heaviesA = [finish(a, 'heavy'), finish(a, 'heavy')]
		const heaviesB = [finish(b, 'heavy'), finish(b, 'heavy')]
		// Words only diverge when a first-letter clash forces a re-draw.
		const clashes = heaviesA.filter((w, i) => w !== heaviesB[i]).length
		expect(clashes).toBeLessThanOrEqual(1)
	})

	it('different seeds deal different hands', () => {
		const hands = new Set(
			[1, 2, 3, 4, 5, 6].map((s) => {
				const d = seeded(s)
				return ['jab', 'heavy', 'special']
					.map((slot) => d.card(slot as 'jab')!.word)
					.join()
			}),
		)
		expect(hands.size).toBeGreaterThan(1)
	})

	it('block words are seeded too', () => {
		const a = seeded(3)
		const b = seeded(3)
		expect(a.offerBlock(1)).toBe(b.offerBlock(1))
	})

	it('block words follow the same typing history the same way', () => {
		// Each round starts a heavy, offers a block over it, then releases it.
		const run = (deck: PlayerDeck) => {
			const offers: string[] = []
			for (let i = 0; i < 4; i++) {
				deck.key(deck.card('heavy')!.word[0], 0)
				offers.push(deck.offerBlock(0))
				deck.clearBlock()
				deck.backspace()
			}
			return offers
		}
		expect(run(seeded(3))).toEqual(run(seeded(3)))
	})

	it('mixSeed separates streams', () => {
		expect(mixSeed(1, 2, 3)).not.toBe(mixSeed(1, 3, 2))
		expect(mixSeed(1, 2, 3)).toBe(mixSeed(1, 2, 3))
	})

	it('the goblin heavy uses tier 1 words, the hero heavy tier 2', () => {
		const inTier = (word: string, tier: number) =>
			word.length >= WORD_TIERS[tier].minLen &&
			word.length <= WORD_TIERS[tier].maxLen
		for (let seed = 1; seed <= 20; seed++) {
			const goblin = seeded(seed, FIGHTERS.goblin)
			const hero = seeded(seed, FIGHTERS.hero)
			const goblinHeavy = goblin.card('heavy')!.word
			const heroHeavy = hero.card('heavy')!.word
			expect(inTier(goblinHeavy, 1)).toBe(true)
			expect(inTier(heroHeavy, 2)).toBe(true)
		}
	})
})

describe('block words never swallowed by the active attack', () => {
	it('a block word does not start with a letter the active attack still needs', () => {
		// HAEIOU's E is next after H and A. EXX would have been swallowed by it.
		const words = {
			0: ['JXX', 'EXX', 'KXX'],
			2: ['HAEIOU'],
			3: ['SHOWSTOPPER'],
		}
		const deck = new PlayerDeck(pickerFrom(words), 1, FIGHTERS.hero)
		deck.key('H', 0)
		deck.key('A', 0)
		const block = deck.offerBlock(0)
		expect(block).not.toBe('EXX')
		expect('EIOU').not.toContain(block[0])
		expect(deck.key(block[0], 0)).toEqual({
			kind: 'progress',
			slot: 'block',
		})
		expect(deck.suspended).toBe('heavy')
	})

	it('still deals a word when every candidate collides', () => {
		let calls = 0
		// Returns the first word the reject accepts, or the first word anyway.
		const lists: Record<number, string[]> = {
			0: ['JXX', 'EXX'],
			2: ['HAEIOU'],
		}
		const picker: WordPicker = (tier, reject) => {
			calls++
			const list = lists[tier] ?? ['SHOWSTOPPER']
			return list.find((w) => !reject(w)) ?? list[0]
		}
		const deck = new PlayerDeck(picker, 1, FIGHTERS.hero)
		deck.key('H', 0)
		deck.key('A', 0)
		calls = 0
		// The strict pass finds nothing, so the loose pass deals EXX.
		expect(deck.offerBlock(0)).toBe('EXX')
		expect(calls).toBe(2)
	})
})

describe('PlayerDeck meter cost', () => {
	it('isUnlocked follows the fighter special meterCost', () => {
		const costly: FighterDef = {
			...FIGHTERS.hero,
			moves: {
				...FIGHTERS.hero.moves,
				special: { ...FIGHTERS.hero.moves.special, meterCost: 50 },
			},
		}
		const deck = new PlayerDeck(pickerFrom(WORDS), 1, costly)
		expect(deck.isUnlocked('special', 49)).toBe(false)
		expect(deck.isUnlocked('special', 50)).toBe(true)
		expect(deck.isUnlocked('jab', 0)).toBe(true)
		expect(deck.isUnlocked('block', 0)).toBe(true)
	})
})
