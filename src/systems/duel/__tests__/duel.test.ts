import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DuelSim, type AttackSpec } from '../duelSim'
import { PlayerDeck, type WordPicker } from '../playerDeck'
import { GOBLIN, GoblinBrain } from '../goblinBrain'
import { DUEL, ENEMY_ATTACKS, MOVES, enemyWindupMs } from '../duelTuning'
import { MAX_LEVEL, clampLevel, duelLevel } from '../duelLevels'
import { mixSeed, seededRng } from '../rng'
import { WordBank } from '../../wordBank'
import { loadData, recordDuel } from '../../persistence'

const goblinFor = (level: number) => duelLevel(level).brain

const jab: AttackSpec = {
	move: 'jab',
	damage: 10,
	startupMs: 100,
	interrupts: false,
	hitstunMs: 200,
}
const heavy: AttackSpec = {
	...jab,
	move: 'heavy',
	damage: 20,
	interrupts: true,
}

function fightingSim(): DuelSim {
	const sim = new DuelSim()
	sim.startRound(0)
	sim.drain()
	return sim
}

describe('DuelSim', () => {
	it('lands an attack after its startup, not before', () => {
		const sim = fightingSim()
		expect(sim.attack('p1', jab, 0)).toBe(true)
		sim.advance(99)
		expect(sim.fighters.p2.hp).toBe(DUEL.maxHp)
		sim.advance(100)
		expect(sim.fighters.p2.hp).toBe(DUEL.maxHp - 10)
	})

	it('refuses a second attack while one is in flight', () => {
		const sim = fightingSim()
		sim.attack('p1', jab, 0)
		expect(sim.attack('p1', jab, 50)).toBe(false)
	})

	it('a parry cancels the attack and staggers the attacker', () => {
		const sim = fightingSim()
		sim.attack('p2', { ...jab, startupMs: 1500 }, 0)
		expect(sim.parry('p1', true, 800)).toBe(true)
		sim.advance(2000)
		expect(sim.fighters.p1.hp).toBe(DUEL.maxHp)
		expect(sim.isStaggered('p2', 900)).toBe(true)
		expect(sim.canAct('p2', 900)).toBe(false)
	})

	it('a parry with nothing incoming does nothing', () => {
		const sim = fightingSim()
		expect(sim.parry('p1', true, 100)).toBe(false)
		expect(sim.fighters.p1.meter).toBe(0)
	})

	it('hits on a staggered fighter are counters', () => {
		const sim = fightingSim()
		sim.attack('p2', { ...jab, startupMs: 1500 }, 0)
		sim.parry('p1', false, 500)
		sim.attack('p1', jab, 600)
		sim.advance(700)
		const hit = sim.drain().find((e) => e.t === 'hit')
		expect(hit).toMatchObject({ counter: true, damage: 15 })
	})

	it('an interrupting hit cancels the target windup', () => {
		const sim = fightingSim()
		sim.attack('p2', { ...jab, startupMs: 2000 }, 0)
		sim.attack('p1', heavy, 100)
		sim.advance(3000)
		expect(sim.fighters.p1.hp).toBe(DUEL.maxHp)
		expect(sim.drain().some((e) => e.t === 'interrupted')).toBe(true)
	})

	it('an armored windup cannot be interrupted', () => {
		const sim = fightingSim()
		sim.attack('p2', { ...jab, startupMs: 2000, armored: true }, 0)
		sim.attack('p1', heavy, 100)
		sim.advance(3000)
		expect(sim.fighters.p2.hp).toBe(DUEL.maxHp - 20)
		expect(sim.fighters.p1.hp).toBe(DUEL.maxHp - 10)
	})

	it('a jab does not interrupt', () => {
		const sim = fightingSim()
		sim.attack('p2', { ...jab, startupMs: 2000 }, 0)
		sim.attack('p1', jab, 100)
		sim.advance(3000)
		expect(sim.fighters.p1.hp).toBe(DUEL.maxHp - 10)
	})

	it('KO ends the round and two rounds end the match', () => {
		const sim = fightingSim()
		const kill = { ...jab, damage: 999 }
		sim.attack('p1', kill, 0)
		sim.advance(100)
		expect(sim.phase).toBe('roundOver')
		expect(sim.fighters.p1.roundsWon).toBe(1)

		sim.startRound(5000)
		expect(sim.fighters.p2.hp).toBe(DUEL.maxHp)
		sim.attack('p1', kill, 5000)
		sim.advance(5100)
		expect(sim.phase).toBe('matchOver')
		expect(sim.drain().pop()).toEqual({ t: 'matchOver', winner: 'p1' })
	})

	it('time out goes to the fighter with more HP', () => {
		const sim = fightingSim()
		sim.attack('p1', jab, 0)
		sim.advance(DUEL.roundTimeMs)
		const over = sim.drain().find((e) => e.t === 'roundOver')
		expect(over).toMatchObject({ winner: 'p1', reason: 'time' })
	})

	it('meter gates a costly move', () => {
		const sim = fightingSim()
		expect(sim.attack('p1', { ...jab, meterCost: 50 }, 0)).toBe(false)
	})

	it('parrying a deflect-only attack pays no stagger and no meter', () => {
		const sim = fightingSim()
		sim.attack('p2', { ...jab, startupMs: 1000, rewardsParry: false }, 0)
		expect(sim.parry('p1', true, 300)).toBe(true)
		expect(sim.isStaggered('p2', 400)).toBe(false)
		expect(sim.fighters.p1.meter).toBe(0)
		expect(sim.drain().pop()).toMatchObject({
			t: 'parried',
			rewarded: false,
		})
	})

	it('quick successive hits stun for less each time', () => {
		const sim = fightingSim()
		const stunAfter = (t: number) => {
			sim.attack('p1', { ...jab, startupMs: 0, hitstunMs: 300 }, t)
			sim.advance(t)
			return sim.fighters.p2.hitstunUntil - t
		}
		const first = stunAfter(0)
		const second = stunAfter(400)
		const third = stunAfter(800)
		expect(second).toBeLessThan(first)
		expect(third).toBeLessThan(second)
	})

	it('no rhythm of jabs can stunlock', () => {
		// The old exploit: a jab every ~400ms kept the goblin in hitstun forever.
		const sim = fightingSim()
		let freeFrames = 0
		for (let t = 0; t < 10_000; t += 10) {
			if (t % 400 === 0)
				sim.attack(
					'p1',
					{ ...jab, damage: 0, startupMs: 110, hitstunMs: 220 },
					t,
				)
			sim.advance(t)
			if (sim.canAct('p2', t)) freeFrames++
		}
		expect(freeFrames).toBeGreaterThan(300)
	})

	it('a long gap resets the chain', () => {
		const sim = fightingSim()
		for (const t of [0, 300, 600]) {
			sim.attack('p1', { ...jab, startupMs: 0 }, t)
			sim.advance(t)
		}
		sim.attack('p1', { ...jab, startupMs: 0, hitstunMs: 300 }, 5000)
		sim.advance(5000)
		expect(sim.fighters.p2.hitstunUntil).toBe(5300)
	})
})

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
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		const firsts = ['jab', 'heavy', 'special'].map(
			(s) => deck.card(s as 'jab')!.word[0],
		)
		expect(new Set(firsts).size).toBe(3)
	})

	it('the first letter commits to a card', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		expect(deck.key('h', 0)).toEqual({ kind: 'progress', slot: 'heavy' })
		expect(deck.active).toBe('heavy')
	})

	it('completing a word reports perfection and re-deals', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
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
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
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
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		expect(deck.key('S', 0)).toEqual({ kind: 'locked', slot: 'special' })
		expect(deck.key('S', MOVES.special.meterCost).kind).toBe('progress')
	})

	it('switches to the block word mid-word', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
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
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		deck.key('H', 0)
		deck.key('A', 0)
		const block = deck.offerBlock(1)
		for (const ch of block) deck.key(ch, 0)
		expect(deck.active).toBe('heavy')
		expect(deck.card('heavy')!.engine.getCaret()).toBe(2)
		expect(deck.key('M', 0).kind).toBe('progress')
	})

	it('the suspended word also resumes when the attack lands', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		deck.key('H', 0)
		const block = deck.offerBlock(1)
		deck.key(block[0], 0)
		deck.clearBlock()
		expect(deck.active).toBe('heavy')
	})

	it('backing out of the block word resumes the suspended word', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		deck.key('H', 0)
		const block = deck.offerBlock(1)
		deck.key(block[0], 0)
		deck.backspace()
		expect(deck.active).toBe('heavy')
	})

	it('switching between attacks resets the card you leave', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		deck.key('H', 0)
		deck.key('A', 0)
		deck.key('C', 0) // jab starts with C
		expect(deck.active).toBe('jab')
		expect(deck.card('heavy')!.engine.getCaret()).toBe(0)
	})

	it('never reinterprets a typo as a switch', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		deck.key('H', 0)
		deck.key('Q', 0)
		const block = deck.offerBlock(1)
		expect(deck.key(block[0], 0).kind).toBe('mistake')
		expect(deck.active).toBe('heavy')
	})

	it('backspacing to empty releases the card', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		deck.key('H', 0)
		deck.backspace()
		expect(deck.active).toBeNull()
	})

	it('reports a heavy held one key from done as loaded', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		const word = deck.card('heavy')!.word
		for (const ch of word.slice(0, -2)) deck.key(ch, 0)
		expect(deck.isLoaded()).toBe(false)
		deck.key(word[word.length - 2], 0)
		expect(deck.isLoaded()).toBe(true)
	})

	it('a jab is never "loaded"', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		deck.key('C', 0)
		deck.key('A', 0)
		expect(deck.isLoaded()).toBe(false)
	})

	it('clearing an active block frees the input', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS), 1)
		const block = deck.offerBlock(1)
		deck.key(block[0], 0)
		deck.clearBlock()
		expect(deck.active).toBeNull()
		expect(deck.card('block')).toBeUndefined()
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
	const seeded = (seed: number) =>
		new PlayerDeck((t, r, rng) => bank.pickFromTier(t, r, rng), seed)
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

	it('mixSeed separates streams', () => {
		expect(mixSeed(1, 2, 3)).not.toBe(mixSeed(1, 3, 2))
		expect(mixSeed(1, 2, 3)).toBe(mixSeed(1, 2, 3))
	})
})

describe('GoblinBrain', () => {
	it('waits out its idle gap, then attacks', () => {
		const sim = fightingSim()
		const brain = new GoblinBrain('p2', seededRng(1), undefined, 0)
		expect(brain.think(0, sim)).toBeNull()
		let t = 0
		let choice = null
		while (!choice && t < 10_000) choice = brain.think((t += 16), sim)
		expect(choice).not.toBeNull()
		expect(t).toBeGreaterThanOrEqual(1500)
	})

	it('holds off while it cannot act', () => {
		const sim = fightingSim()
		sim.attack('p2', { ...jab, startupMs: 60_000 }, 0)
		const brain = new GoblinBrain('p2', seededRng(1), undefined, 0)
		expect(brain.think(5000, sim)).toBeNull()
	})

	it('being hit does not reset its attack timer', () => {
		const sim = fightingSim()
		const brain = new GoblinBrain('p2', seededRng(3), undefined, 0)
		// A steady stream of jabs, each stunning it briefly.
		let attacked = false
		for (let t = 0; t < 8000 && !attacked; t += 16) {
			if (t % 1200 === 0) sim.attack('p1', jab, t)
			sim.advance(t)
			attacked = brain.think(t, sim) !== null
		}
		expect(attacked).toBe(true)
	})

	it('chains a follow-up after an unparried attack', () => {
		const sim = fightingSim()
		const profile = { ...goblinFor(4), chainChance: 1 }
		const brain = new GoblinBrain('p2', seededRng(5), profile, 0)
		let t = 0
		let first = null
		while (!first) first = brain.think((t += 16), sim)
		sim.attack('p2', { ...jab, startupMs: 500 }, t)
		const landed = t + 500
		let next = null
		while (!next && t < landed + 2000) {
			t += 16
			sim.advance(t)
			next = brain.think(t, sim)
		}
		expect(next?.id).toBe('slash')
		expect(t - landed).toBeLessThan(400)
	})

	it('never chains after being parried', () => {
		const sim = fightingSim()
		const profile = { ...goblinFor(4), chainChance: 1 }
		const brain = new GoblinBrain('p2', seededRng(5), profile, 0)
		let t = 0
		while (!brain.think((t += 16), sim));
		sim.attack('p2', { ...jab, startupMs: 500 }, t)
		sim.parry('p1', true, t + 100)
		const parriedAt = t + 100
		let next = null
		while (!next && t < parriedAt + 10_000) {
			t += 16
			sim.advance(t)
			next = brain.think(t, sim)
		}
		expect(t - parriedAt).toBeGreaterThan(DUEL.parryStaggerMs)
		expect(t - (parriedAt + DUEL.parryStaggerMs)).toBeGreaterThan(400)
	})

	it('answers a loaded heavy with the armored lunge', () => {
		const sim = fightingSim()
		const profile = { ...GOBLIN, lungeChance: 0, readChance: 1 }
		const brain = new GoblinBrain('p2', seededRng(9), profile, 0)
		let t = 0
		let choice = null
		while (!choice) choice = brain.think((t += 16), sim, true)
		expect(choice.id).toBe('lunge')
		expect(choice.armored).toBe(true)
	})

	it('mistakes cannot summon punishes back to back', () => {
		const sim = fightingSim()
		const profile = {
			...GOBLIN,
			punishChance: 1,
			idleMinMs: 9e9,
			idleMaxMs: 9e9,
		}
		const brain = new GoblinBrain('p2', seededRng(2), profile, 0)
		const punishes: number[] = []
		for (let t = 0; t < 6000; t += 16) {
			brain.onOpponentMistake(t) // mistyping every frame
			sim.advance(t)
			const c = brain.think(t, sim)
			if (c) {
				if (c.id === 'punish') punishes.push(t)
				sim.attack('p2', { ...jab, startupMs: 100 }, t)
			}
		}
		expect(punishes.length).toBeGreaterThan(1)
		for (let i = 1; i < punishes.length; i++) {
			expect(punishes[i] - punishes[i - 1]).toBeGreaterThanOrEqual(
				GOBLIN.punishCooldownMs,
			)
		}
	})

	it('is deterministic for a given seed', () => {
		const run = () => {
			const sim = fightingSim()
			const brain = new GoblinBrain('p2', seededRng(42), undefined, 0)
			const picks: string[] = []
			for (let t = 0; t < 30_000 && picks.length < 5; t += 16) {
				const c = brain.think(t, sim)
				if (c) picks.push(`${c.id}@${t}`)
			}
			return picks
		}
		expect(run()).toEqual(run())
	})
})

describe('enemyWindupMs', () => {
	it('never drops below the readable floor, even for the quick punish', () => {
		const fastest = duelLevel(MAX_LEVEL).msPerChar
		const ms = enemyWindupMs(3, ENEMY_ATTACKS.punish, fastest, 9)
		expect(ms).toBeGreaterThanOrEqual(DUEL.minWindupMs)
	})

	it('tightens in later rounds', () => {
		const m = duelLevel(6).msPerChar
		expect(enemyWindupMs(4, ENEMY_ATTACKS.slash, m, 3)).toBeLessThan(
			enemyWindupMs(4, ENEMY_ATTACKS.slash, m, 1),
		)
	})

	it('is typeable at the level target speed', () => {
		for (let n = 1; n <= MAX_LEVEL; n++) {
			const lv = duelLevel(n)
			const typing = 3 * lv.msPerChar
			const windup = enemyWindupMs(
				3,
				ENEMY_ATTACKS.slash,
				lv.msPerChar,
				1,
			)
			expect(windup).toBeGreaterThan(typing)
		}
	})
})

describe('duel levels', () => {
	it('every knob gets harder as the level rises, none gets easier', () => {
		for (let n = 2; n <= MAX_LEVEL; n++) {
			const a = duelLevel(n - 1)
			const b = duelLevel(n)
			expect(b.msPerChar).toBeLessThan(a.msPerChar)
			expect(b.damageScale).toBeGreaterThan(a.damageScale)
			expect(b.brain.idleMinMs).toBeLessThan(a.brain.idleMinMs)
			expect(b.brain.idleMaxMs).toBeLessThan(a.brain.idleMaxMs)
			expect(b.brain.chainChance).toBeGreaterThan(a.brain.chainChance)
			expect(b.brain.readChance).toBeGreaterThan(a.brain.readChance)
			expect(b.brain.punishChance).toBeGreaterThan(a.brain.punishChance)
		}
	})

	it('clamps out-of-range levels', () => {
		expect(clampLevel(0)).toBe(1)
		expect(clampLevel(99)).toBe(MAX_LEVEL)
		expect(clampLevel(Number.NaN)).toBe(1)
	})
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
