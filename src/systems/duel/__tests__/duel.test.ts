import { describe, expect, it } from 'vitest'
import { DuelSim, type AttackSpec } from '../duelSim'
import { PlayerDeck, type WordPicker } from '../playerDeck'
import { GoblinBrain, goblinFor, seededRng } from '../goblinBrain'
import { DUEL, ENEMY_ATTACKS, MOVES, enemyWindupMs } from '../duelTuning'
import { DIFFICULTIES } from '../../tuning'

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
})

/** Deterministic picker: first word in the list the deck will accept. */
function pickerFrom(words: Record<number, string[]>): WordPicker {
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
		const deck = new PlayerDeck(pickerFrom(WORDS))
		const firsts = ['jab', 'heavy', 'special'].map(
			(s) => deck.card(s as 'jab')!.word[0],
		)
		expect(new Set(firsts).size).toBe(3)
	})

	it('the first letter commits to a card', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS))
		expect(deck.key('h', 0)).toEqual({ kind: 'progress', slot: 'heavy' })
		expect(deck.active).toBe('heavy')
	})

	it('completing a word reports perfection and re-deals', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS))
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
		const deck = new PlayerDeck(pickerFrom(WORDS))
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
		const deck = new PlayerDeck(pickerFrom(WORDS))
		expect(deck.key('S', 0)).toEqual({ kind: 'locked', slot: 'special' })
		expect(deck.key('S', MOVES.special.meterCost).kind).toBe('progress')
	})

	it('switches to the block word mid-word', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS))
		deck.key('H', 0)
		deck.key('A', 0)
		const block = deck.offerBlock(1)
		expect(deck.key(block[0], 0)).toEqual({
			kind: 'progress',
			slot: 'block',
		})
		// The abandoned card starts over.
		expect(deck.card('heavy')!.engine.getCaret()).toBe(0)
	})

	it('never reinterprets a typo as a switch', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS))
		deck.key('H', 0)
		deck.key('Q', 0)
		const block = deck.offerBlock(1)
		expect(deck.key(block[0], 0).kind).toBe('mistake')
		expect(deck.active).toBe('heavy')
	})

	it('backspacing to empty releases the card', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS))
		deck.key('H', 0)
		deck.backspace()
		expect(deck.active).toBeNull()
	})

	it('clearing an active block frees the input', () => {
		const deck = new PlayerDeck(pickerFrom(WORDS))
		const block = deck.offerBlock(1)
		deck.key(block[0], 0)
		deck.clearBlock()
		expect(deck.active).toBeNull()
		expect(deck.card('block')).toBeUndefined()
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

	it('scales aggression with difficulty', () => {
		expect(goblinFor('i-am-god').idleMaxMs).toBeLessThan(
			goblinFor('easy').idleMinMs,
		)
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
	it('gives at least the runner budget for the block word', () => {
		const ms = enemyWindupMs(3, ENEMY_ATTACKS.slash, DIFFICULTIES.medium, 1)
		expect(ms).toBeGreaterThanOrEqual(1150)
	})

	it('tightens in later rounds', () => {
		const d = DIFFICULTIES.hard
		expect(enemyWindupMs(4, ENEMY_ATTACKS.slash, d, 3)).toBeLessThan(
			enemyWindupMs(4, ENEMY_ATTACKS.slash, d, 1),
		)
	})
})
