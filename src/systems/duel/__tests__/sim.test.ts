import { describe, expect, it } from 'vitest'
import { DuelSim, type DuelEvent, type DuelOptions } from '../duelSim'
import { FIGHTERS, type FighterDef, type FighterMove } from '../fighters'
import { DUEL, type MoveId, type Side } from '../duelTuning'

/** A copy of `base` with one move's numbers changed. */
function variant(
	base: FighterDef,
	move: MoveId,
	patch: Partial<FighterMove>,
): FighterDef {
	return {
		...base,
		moves: { ...base.moves, [move]: { ...base.moves[move], ...patch } },
	}
}

const HERO = FIGHTERS.hero

// Explicit mechanism fixtures. Each is the hero with one signature and the
// move numbers its tests assert. They do not read the roster, so tuning
// FIGHTERS cannot break a mechanism test.
const COMBO_GOBLIN: FighterDef = {
	...HERO,
	id: 'goblin',
	signature: { kind: 'combo', bonusPerLink: 2, maxBonus: 6 },
}
const GUARD_SKELETON: FighterDef = {
	...HERO,
	id: 'skeleton',
	moves: { ...HERO.moves, jab: { ...HERO.moves.jab, windupMs: 320 } },
	signature: { kind: 'guard', incomingWindupScale: 1.2 },
}
const ARMOR_SKELETON: FighterDef = {
	...HERO,
	id: 'skeleton',
	signature: { kind: 'armor', damageTakenScale: 0.85 },
}
const ARMOR_70: FighterDef = {
	...HERO,
	id: 'skeleton',
	signature: { kind: 'armor', damageTakenScale: 0.7 },
}
const ARMOR_40: FighterDef = {
	...HERO,
	id: 'skeleton',
	signature: { kind: 'armor', damageTakenScale: 0.4 },
}
const POISON_MUSHROOM: FighterDef = {
	...HERO,
	id: 'mushroom',
	moves: { ...HERO.moves, special: { ...HERO.moves.special, damage: 16 } },
	signature: { kind: 'poison', move: 'special', dps: 3, durationMs: 5000 },
}
const DRAIN_EYE: FighterDef = {
	...HERO,
	id: 'eye',
	moves: { ...HERO.moves, jab: { ...HERO.moves.jab, windupMs: 280 } },
	signature: { kind: 'drain', meterPerHit: 6 },
}

/** A started round with its opening events already drained. */
function sim(
	p1: FighterDef = HERO,
	p2: FighterDef = HERO,
	options: Omit<DuelOptions, 'fighters'> = {},
): DuelSim {
	const s = new DuelSim({ fighters: { p1, p2 }, ...options })
	s.startRound(0)
	s.drain()
	return s
}

const hitDamages = (events: DuelEvent[]): number[] =>
	events.flatMap((e) => (e.t === 'hit' ? [e.damage] : []))

const poisonDamages = (events: DuelEvent[]): number[] =>
	events.flatMap((e) => (e.t === 'poison' ? [e.damage] : []))

const attacksStarted = (events: DuelEvent[]) =>
	events.flatMap((e) => (e.t === 'attackStarted' ? [e] : []))

describe('DuelSim: core rules', () => {
	it('lands an attack after its windup, not before', () => {
		const s = sim()
		expect(s.attack('p1', 'jab', false, 0)).toBe(true)
		s.advance(299)
		expect(s.fighters.p2.hp).toBe(HERO.maxHp)
		s.advance(300)
		expect(s.fighters.p2.hp).toBe(HERO.maxHp - 4)
	})

	it('refuses a second attack while one is in flight', () => {
		const s = sim()
		s.attack('p1', 'jab', false, 0)
		expect(s.attack('p1', 'jab', false, 50)).toBe(false)
	})

	it('a parry cancels the attack, staggers the attacker and pays meter', () => {
		// Full cancel: pinned, since the default blockDamageShare leaks damage.
		const s = sim(HERO, HERO, { rules: { blockDamageShare: 0 } })
		s.attack('p2', 'heavy', false, 0) // windup 1100
		expect(s.parry('p1', false, 500)).toBe(true)
		s.advance(2000)
		expect(s.fighters.p1.hp).toBe(HERO.maxHp)
		expect(s.isStaggered('p2', 900)).toBe(true)
		expect(s.canAct('p2', 900)).toBe(false)
		expect(s.fighters.p1.meter).toBe(DUEL.meterOnParry)
	})

	it('a perfect parry pays the extra meter', () => {
		const s = sim()
		s.attack('p2', 'heavy', false, 0)
		expect(s.parry('p1', true, 500)).toBe(true)
		expect(s.fighters.p1.meter).toBe(
			DUEL.meterOnParry + DUEL.meterOnPerfect,
		)
	})

	it('a parry with nothing incoming does nothing', () => {
		const s = sim()
		expect(s.parry('p1', true, 100)).toBe(false)
		expect(s.fighters.p1.meter).toBe(0)
	})

	it('a jab cannot be parried (blockTier null)', () => {
		const s = sim()
		s.attack('p2', 'jab', false, 0)
		expect(s.parry('p1', false, 100)).toBe(false)
		s.advance(300)
		expect(s.fighters.p1.hp).toBe(HERO.maxHp - 4)
		expect(s.fighters.p1.meter).toBe(DUEL.meterOnTakeHit)
	})

	it('hits on a staggered fighter are counters (x1.5)', () => {
		const s = sim()
		s.attack('p2', 'heavy', false, 0)
		s.parry('p1', false, 500) // p2 staggered until 1800
		s.attack('p1', 'jab', false, 600) // lands 900
		s.advance(900)
		const hit = s.drain().find((e) => e.t === 'hit')
		expect(hit).toMatchObject({ counter: true, damage: 6 })
	})

	it('an interrupting hit cancels a non-armored windup', () => {
		// A quick heavy (windup 160) so it lands inside p2's 1100ms windup.
		const quickHeavy = variant(HERO, 'heavy', { windupMs: 160 })
		const s = sim(quickHeavy, HERO)
		s.attack('p2', 'heavy', false, 0) // lands 1100
		s.attack('p1', 'heavy', false, 100) // lands 260, interrupts
		s.advance(3000)
		expect(s.fighters.p1.hp).toBe(HERO.maxHp)
		expect(s.fighters.p2.hp).toBe(HERO.maxHp - 13)
		const events = s.drain()
		expect(events).toContainEqual({
			t: 'interrupted',
			side: 'p2',
			move: 'heavy',
		})
	})

	it('an armored windup cannot be interrupted', () => {
		const armoredHero = variant(HERO, 'heavy', { armored: true })
		const quickHeavy = variant(HERO, 'heavy', { windupMs: 160 })
		const s = sim(quickHeavy, armoredHero)
		s.attack('p2', 'heavy', false, 0) // armored, lands 1100
		s.attack('p1', 'heavy', false, 100) // lands 260, cannot interrupt
		s.advance(3000)
		expect(s.fighters.p2.hp).toBe(HERO.maxHp - 13)
		expect(s.fighters.p1.hp).toBe(HERO.maxHp - 13)
		expect(s.drain().some((e) => e.t === 'interrupted')).toBe(false)
	})

	it('a jab does not interrupt', () => {
		const s = sim()
		s.attack('p2', 'heavy', false, 0) // lands 1100
		s.attack('p1', 'jab', false, 100) // lands 400, no interrupt
		s.advance(3000)
		expect(s.fighters.p1.hp).toBe(HERO.maxHp - 13)
		expect(s.drain().some((e) => e.t === 'interrupted')).toBe(false)
	})

	it('KO ends the round and two rounds end the match', () => {
		const killer = variant(HERO, 'jab', { damage: 999 })
		const s = sim(killer, HERO)
		s.attack('p1', 'jab', false, 0)
		s.advance(300)
		expect(s.phase).toBe('roundOver')
		expect(s.fighters.p1.roundsWon).toBe(1)

		s.startRound(5000)
		expect(s.fighters.p2.hp).toBe(HERO.maxHp)
		s.attack('p1', 'jab', false, 5000)
		s.advance(5300)
		expect(s.phase).toBe('matchOver')
		expect(s.drain().pop()).toEqual({ t: 'matchOver', winner: 'p1' })
	})

	it('time out goes to the higher HP fraction, not the higher HP', () => {
		// p1: 96/100 = 0.96. p2: 188/200 = 0.94 but more raw HP than p1.
		const s = sim(HERO, HERO, { maxHp: { p2: 200 } })
		s.attack('p2', 'jab', false, 0) // lands 300
		s.attack('p1', 'jab', false, 600)
		s.attack('p1', 'jab', false, 1200)
		s.attack('p1', 'jab', false, 1800)
		s.advance(DUEL.roundTimeMs)
		expect(s.fighters.p1.hp).toBeLessThan(s.fighters.p2.hp)
		const over = s.drain().find((e) => e.t === 'roundOver')
		expect(over).toMatchObject({ winner: 'p1', reason: 'time' })
	})

	it('meter gates a costly move', () => {
		const s = sim()
		expect(s.attack('p1', 'special', false, 0)).toBe(false)
		s.fighters.p1.meter = 100
		expect(s.attack('p1', 'special', false, 0)).toBe(true)
		expect(s.fighters.p1.meter).toBe(0)
	})

	it('hitstun decays along a chain', () => {
		const s = sim(variant(HERO, 'jab', { windupMs: 0, hitstunMs: 300 }))
		const stunAfter = (t: number) => {
			s.attack('p1', 'jab', false, t)
			s.advance(t)
			return s.fighters.p2.hitstunUntil - t
		}
		const first = stunAfter(0)
		const second = stunAfter(400)
		const third = stunAfter(800)
		expect(second).toBeLessThan(first)
		expect(third).toBeLessThan(second)
	})

	it('no rhythm of jabs can stunlock', () => {
		// The old exploit: a jab every ~400ms kept the target in hitstun forever.
		const s = sim(
			variant(HERO, 'jab', { damage: 0, windupMs: 110, hitstunMs: 220 }),
		)
		let freeFrames = 0
		for (let t = 0; t < 10_000; t += 10) {
			if (t % 400 === 0) s.attack('p1', 'jab', false, t)
			s.advance(t)
			if (s.canAct('p2', t)) freeFrames++
		}
		expect(freeFrames).toBeGreaterThan(300)
	})

	it('a long gap resets the chain', () => {
		const s = sim(variant(HERO, 'jab', { windupMs: 0, hitstunMs: 300 }))
		for (const t of [0, 300, 600]) {
			s.attack('p1', 'jab', false, t)
			s.advance(t)
		}
		s.attack('p1', 'jab', false, 5000)
		s.advance(5000)
		expect(s.fighters.p2.hitstunUntil).toBe(5300)
	})

	it('a passive fighter parry only deflects and leaks chip', () => {
		const s = sim(HERO, HERO, { rules: { blockDamageShare: 0 } })
		// p1 has thrown nothing for over passiveMs, so its parry is passive.
		s.attack('p2', 'heavy', false, 10_500) // lands 11600
		expect(s.parry('p1', false, 11_000)).toBe(true)
		expect(s.isStaggered('p2', 11_100)).toBe(false)
		expect(s.fighters.p1.meter).toBe(0)
		expect(s.fighters.p1.hp).toBe(HERO.maxHp - 5) // round(13 * 0.4)
		expect(s.drain().pop()).toMatchObject({
			t: 'parried',
			rewarded: false,
			chip: 5,
		})
	})
})

describe('DuelSim: windups and timing', () => {
	it('windupScale lengthens only that side windups', () => {
		const s = sim(HERO, HERO, { windupScale: { p1: 2 } })
		s.attack('p1', 'jab', false, 0)
		s.attack('p2', 'jab', false, 0)
		const started = attacksStarted(s.drain())
		expect(started.find((e) => e.side === 'p1')).toMatchObject({
			landsAt: 600,
		})
		expect(started.find((e) => e.side === 'p2')).toMatchObject({
			landsAt: 300,
		})
	})

	it('reports blockTier and armored on attackStarted', () => {
		const s = sim()
		s.attack('p1', 'jab', false, 0)
		s.fighters.p2.meter = 100
		s.attack('p2', 'special', false, 0)
		const started = attacksStarted(s.drain())
		expect(started).toEqual([
			expect.objectContaining({
				side: 'p1',
				move: 'jab',
				blockTier: null,
				armored: false,
			}),
			expect.objectContaining({
				side: 'p2',
				move: 'special',
				blockTier: 1,
				armored: true,
			}),
		])
	})

	it('readyAt and nextDueAt follow the pending attack and the round clock', () => {
		const s = new DuelSim({ fighters: { p1: HERO, p2: HERO } })
		expect(s.nextDueAt()).toBe(Infinity)
		expect(s.readyAt('p1')).toBe(Infinity)

		s.startRound(0)
		expect(s.readyAt('p1')).toBe(0)
		expect(s.nextDueAt()).toBe(DUEL.roundTimeMs)

		s.attack('p1', 'jab', false, 0) // lands 300
		expect(s.readyAt('p1')).toBe(Infinity)
		expect(s.readyAt('p2')).toBe(0)
		expect(s.nextDueAt()).toBe(300)

		s.advance(300)
		expect(s.readyAt('p2')).toBe(300 + HERO.moves.jab.hitstunMs)
		expect(s.nextDueAt()).toBe(DUEL.roundTimeMs)

		s.advance(DUEL.roundTimeMs)
		expect(s.phase).toBe('roundOver')
		expect(s.nextDueAt()).toBe(Infinity)
	})
})

describe('DuelSim: signatures', () => {
	it('combo bonus grows with the chain and caps', () => {
		// Goblin's combo: +2 per link, max +6. Landings every 300ms stay in chain.
		const s = sim(COMBO_GOBLIN, HERO, { rules: { staleFactor: 1 } })
		for (let i = 0; i < 6; i++) s.attack('p1', 'jab', false, i * 300)
		s.advance(2000)
		expect(hitDamages(s.drain())).toEqual([4, 6, 8, 10, 10, 10])
	})

	it('combo bonus is staled too: a third consecutive jab gets 0.64 of its bonus', () => {
		// Jab 20, +2 per link. Stale 0.8: hit 2 = 16 + 1.6 -> 18; hit 3 =
		// 12.8 + 2.56 -> 15. An unscaled bonus would give 17 on hit 3.
		const s = sim(variant(COMBO_GOBLIN, 'jab', { damage: 20 }), HERO, {
			rules: { staleFactor: 0.8 },
		})
		for (let i = 0; i < 3; i++) s.attack('p1', 'jab', false, i * 300)
		s.advance(1000)
		expect(hitDamages(s.drain())).toEqual([20, 18, 15])
	})

	it('guard lengthens the windup of attacks aimed at it', () => {
		const s = sim(HERO, GUARD_SKELETON)
		s.attack('p1', 'jab', false, 0) // into the guard: 300 x 1.2
		s.attack('p2', 'jab', false, 0) // into hero: 320
		const started = attacksStarted(s.drain())
		expect(started.find((e) => e.side === 'p1')).toMatchObject({
			landsAt: 360,
		})
		expect(started.find((e) => e.side === 'p2')).toMatchObject({
			landsAt: 320,
		})
	})

	it('guard windup multiplies with windupScale', () => {
		const s = sim(HERO, GUARD_SKELETON, { windupScale: { p1: 2 } })
		s.attack('p1', 'jab', false, 0)
		expect(attacksStarted(s.drain())[0]).toMatchObject({ landsAt: 720 })
	})

	describe('poison', () => {
		// Meter cost is not what these tests are about.
		const freeSpecial = variant(POISON_MUSHROOM, 'special', {
			meterCost: 0,
		})

		it('ticks once a second for its duration, then stops', () => {
			const s = sim(freeSpecial, HERO)
			s.attack('p1', 'special', false, 0) // lands 1300, poison until 6300
			s.advance(2299)
			expect(s.fighters.p2.hp).toBe(HERO.maxHp - 16)
			s.advance(2300)
			expect(s.fighters.p2.hp).toBe(HERO.maxHp - 16 - 3)
			s.advance(6299)
			expect(s.fighters.p2.hp).toBe(HERO.maxHp - 16 - 12)
			s.advance(6300)
			expect(s.fighters.p2.hp).toBe(HERO.maxHp - 16 - 15)
			s.advance(10_000)
			expect(s.fighters.p2.hp).toBe(HERO.maxHp - 16 - 15)
			expect(s.fighters.p2.poison).toBeNull()
			expect(poisonDamages(s.drain())).toEqual([3, 3, 3, 3, 3])
		})

		it('a new poison refreshes the timer instead of stacking', () => {
			const s = sim(freeSpecial, HERO)
			s.attack('p1', 'special', false, 0) // lands 1300
			s.attack('p1', 'special', false, 3100) // lands 4400, refresh to 9400
			s.advance(20_000)
			// Ticks 2300, 3300, 4300 from the first; 5400..9400 from the refresh.
			expect(poisonDamages(s.drain())).toEqual(Array(8).fill(3))
		})

		it('can finish a fighter, ending the round', () => {
			const weak = variant(POISON_MUSHROOM, 'special', {
				meterCost: 0,
				damage: 5,
			})
			const s = sim(weak, HERO, { maxHp: { p2: 12 } })
			s.attack('p1', 'special', false, 0) // hit 5 -> 7, ticks 4, 1, 0
			s.advance(4299)
			expect(s.phase).toBe('fight')
			expect(s.fighters.p2.hp).toBe(1)
			s.advance(4300)
			expect(s.phase).toBe('roundOver')
			expect(s.fighters.p1.roundsWon).toBe(1)
			expect(s.drain().find((e) => e.t === 'roundOver')).toMatchObject({
				winner: 'p1',
				reason: 'ko',
			})
		})

		it('is cleared on a new round', () => {
			const poisoner = variant(
				variant(POISON_MUSHROOM, 'special', { meterCost: 0 }),
				'jab',
				{ damage: 999 },
			)
			const s = sim(poisoner, HERO)
			s.attack('p1', 'special', false, 0) // poisons p2 until 6300
			s.attack('p1', 'jab', false, 1400) // KO at 1700, before any tick
			s.advance(1700)
			expect(s.phase).toBe('roundOver')
			s.startRound(5000)
			expect(s.fighters.p2.poison).toBeNull()
			s.drain()
			s.advance(20_000)
			expect(poisonDamages(s.drain())).toEqual([])
		})
	})

	describe('drain', () => {
		it('moves meter from the hit side and emits an event', () => {
			// Eye hits hero. Eye gains 8 for the hit, hero gains 5 for being hit,
			// then the drain takes min(hero 5, 6, room) = 5 from hero.
			const s = sim(HERO, DRAIN_EYE)
			s.attack('p2', 'jab', false, 0)
			s.advance(280)
			expect(s.fighters.p1.meter).toBe(0)
			expect(s.fighters.p2.meter).toBe(13)
			expect(s.drain()).toContainEqual({
				t: 'drain',
				from: 'p1',
				amount: 5,
			})
		})

		it('steals at most meterPerHit', () => {
			const s = sim(HERO, DRAIN_EYE)
			s.fighters.p1.meter = 20
			s.attack('p2', 'jab', false, 0)
			s.advance(280)
			// hero 20 + 5 = 25, drain min(25, 6, room) = 6.
			expect(s.fighters.p1.meter).toBe(19)
			expect(s.fighters.p2.meter).toBe(8 + 6)
			expect(s.drain()).toContainEqual({
				t: 'drain',
				from: 'p1',
				amount: 6,
			})
		})
	})

	it('resolve scales damage only below its HP threshold', () => {
		// Repeated jabs: pinned so staling does not change the damage.
		const full = sim(HERO, HERO, { rules: { staleFactor: 1 } })
		full.attack('p1', 'jab', false, 0)
		full.advance(300)
		expect(hitDamages(full.drain())).toEqual([4])

		// Hero at 2 of 10 HP is below the 30% threshold: 4 x 1.2 = 4.8 -> 5.
		const low = sim(HERO, HERO, {
			maxHp: { p1: 10 },
			rules: { staleFactor: 1 },
		})
		low.attack('p2', 'jab', false, 0) // p1 6
		low.attack('p2', 'jab', false, 600) // p1 2
		low.attack('p1', 'jab', false, 1200)
		low.advance(1500)
		expect(low.fighters.p1.hp).toBe(2)
		expect(hitDamages(low.drain())).toEqual([4, 4, 5])
	})
})

describe('DuelSim: armor', () => {
	it('scales the damage of a landed hit taken by an armored fighter', () => {
		const s = sim(variant(HERO, 'jab', { damage: 20 }), ARMOR_SKELETON, {
			rules: { staleFactor: 1 },
		})
		s.attack('p1', 'jab', false, 0)
		s.advance(300)
		expect(hitDamages(s.drain())).toEqual([17]) // 20 x 0.85
		expect(s.fighters.p2.hp).toBe(HERO.maxHp - 17)
	})

	it("does not scale the armored fighter's own attacks", () => {
		const s = sim(ARMOR_SKELETON, HERO, { rules: { staleFactor: 1 } })
		s.attack('p1', 'jab', false, 0)
		s.advance(300)
		expect(hitDamages(s.drain())).toEqual([4])
	})

	it('a hit that would deal at least 1 still deals at least 1', () => {
		const s = sim(variant(HERO, 'jab', { damage: 1 }), ARMOR_40)
		s.attack('p1', 'jab', false, 0)
		s.advance(300)
		expect(hitDamages(s.drain())).toEqual([1]) // round(0.4) = 0, floored to 1
	})

	it('scales the parry chip taken by an armored fighter', () => {
		const s = sim(HERO, ARMOR_SKELETON, {
			rules: { blockDamageShare: 0.4 },
		})
		s.attack('p1', 'heavy', false, 0) // base damage 13
		expect(s.parry('p2', false, 500)).toBe(true)
		expect(s.fighters.p2.hp).toBe(HERO.maxHp - 4) // round(13 x 0.4) = 5, then x 0.85 -> 4
		expect(s.drain()).toContainEqual(
			expect.objectContaining({ t: 'parried', chip: 4 }),
		)
	})

	it('scales each poison tick taken by an armored fighter', () => {
		const s = sim(
			variant(POISON_MUSHROOM, 'special', { meterCost: 0 }),
			ARMOR_70,
		)
		s.attack('p1', 'special', false, 0) // lands 1300, first tick at 2300
		s.advance(2300)
		expect(poisonDamages(s.drain())).toEqual([2]) // round(3 x 0.7)
	})

	it('armor keeps granularity invariance', () => {
		const play = (step: number | null) => {
			const s = new DuelSim({
				fighters: { p1: HERO, p2: ARMOR_SKELETON },
			})
			s.startRound(0)
			const events: DuelEvent[] = [...s.drain()]
			let now = 0
			const catchUp = (to: number) => {
				if (step !== null) {
					while (now + step < to) {
						now += step
						s.advance(now)
						events.push(...s.drain())
					}
				}
				now = to
				s.advance(to)
				events.push(...s.drain())
			}
			const at = (t: number, act: () => void) => {
				catchUp(t)
				act()
				events.push(...s.drain())
			}
			at(0, () => s.attack('p1', 'jab', false, 0))
			at(150, () => s.attack('p2', 'heavy', false, 150))
			at(1000, () => s.parry('p1', false, 1000))
			at(1200, () => s.attack('p1', 'heavy', false, 1200))
			at(2600, () => s.attack('p2', 'jab', false, 2600))
			catchUp(4000)
			return { hp: structuredClone(s.fighters), events }
		}
		const coarse = play(null)
		expect(coarse.events).toContainEqual(
			expect.objectContaining({
				t: 'hit',
				attacker: 'p1',
				move: 'jab',
				damage: 3,
			}),
		)
		const everyMs = play(1)
		expect(everyMs.hp).toEqual(coarse.hp)
		expect(everyMs.events).toEqual(coarse.events)
	})
})

describe('DuelSim: granularity invariance', () => {
	type Op =
		| {
				t: number
				op: 'attack'
				side: Side
				move: MoveId
				perfect: boolean
		  }
		| { t: number; op: 'parry'; side: Side; perfect: boolean }
		| { t: number; op: 'mistake'; side: Side }

	const END = DUEL.roundTimeMs + 5000

	/**
	 * A scripted match. The p2 mushroom starts with its meter full so its
	 * poison special is available. Some ops are meant to be refused (staggered,
	 * in hitstun, parrying a jab), since refusals must also agree.
	 */
	const OPS: Op[] = [
		{ t: 0, op: 'attack', side: 'p1', move: 'jab', perfect: true },
		{ t: 150, op: 'attack', side: 'p2', move: 'heavy', perfect: false },
		{ t: 320, op: 'mistake', side: 'p1' },
		{ t: 600, op: 'attack', side: 'p1', move: 'jab', perfect: false },
		{ t: 1000, op: 'parry', side: 'p1', perfect: true },
		{ t: 1100, op: 'attack', side: 'p2', move: 'special', perfect: false },
		{ t: 1200, op: 'attack', side: 'p1', move: 'heavy', perfect: false },
		{ t: 2800, op: 'attack', side: 'p2', move: 'special', perfect: false },
		{ t: 2900, op: 'attack', side: 'p1', move: 'heavy', perfect: false },
		{ t: 3000, op: 'mistake', side: 'p2' },
		{ t: 3500, op: 'mistake', side: 'p1' },
		{ t: 4300, op: 'attack', side: 'p1', move: 'jab', perfect: false },
		{ t: 5200, op: 'attack', side: 'p1', move: 'jab', perfect: true },
		{ t: 5800, op: 'attack', side: 'p2', move: 'jab', perfect: false },
		{ t: 6000, op: 'attack', side: 'p1', move: 'heavy', perfect: false },
		{ t: 6300, op: 'attack', side: 'p2', move: 'heavy', perfect: false },
		{ t: 7600, op: 'mistake', side: 'p2' },
		{ t: 8000, op: 'parry', side: 'p2', perfect: false },
		{ t: 8500, op: 'attack', side: 'p2', move: 'jab', perfect: false },
		{ t: 9000, op: 'attack', side: 'p1', move: 'jab', perfect: false },
	]

	/**
	 * Plays OPS against a fresh sim. `step` is how often the clock is advanced
	 * between ops (null: only at each op's own timestamp, and at the end).
	 */
	function replay(step: number | null) {
		const s = new DuelSim({
			fighters: { p1: HERO, p2: POISON_MUSHROOM },
		})
		s.fighters.p2.meter = 100
		const events: DuelEvent[] = []
		const results: boolean[] = []
		const flush = () => events.push(...s.drain())

		s.startRound(0)
		flush()
		let now = 0
		const catchUp = (to: number) => {
			if (step !== null) {
				for (let t = now + step; t < to; t += step) {
					s.advance(t)
					flush()
				}
			}
			s.advance(to)
			flush()
			now = to
		}

		for (const op of OPS) {
			catchUp(op.t)
			if (op.op === 'attack') {
				results.push(s.attack(op.side, op.move, op.perfect, op.t))
			} else if (op.op === 'parry') {
				results.push(s.parry(op.side, op.perfect, op.t))
			} else {
				s.mistake(op.side, op.t)
			}
			flush()
		}
		catchUp(END)

		return {
			fighters: structuredClone(s.fighters),
			phase: s.phase,
			round: s.round,
			results,
			events,
		}
	}

	it('the scripted timeline exercises every kind of rule', () => {
		const kinds = new Set(replay(null).events.map((e) => e.t))
		for (const t of [
			'attackStarted',
			'hit',
			'parried',
			'interrupted',
			'poison',
			'mistake',
			'roundOver',
		] as const) {
			expect(kinds).toContain(t)
		}
		expect(replay(null).results).toContain(false)
	})

	it('one advance per op gap, every 1 ms, and every 16 ms agree', () => {
		const coarse = replay(null)
		const everyMs = replay(1)
		const every16 = replay(16)
		expect(everyMs.fighters).toEqual(coarse.fighters)
		expect(everyMs.phase).toBe(coarse.phase)
		expect(everyMs.round).toBe(coarse.round)
		expect(everyMs.results).toEqual(coarse.results)
		expect(everyMs.events).toEqual(coarse.events)
		expect(every16.fighters).toEqual(coarse.fighters)
		expect(every16.phase).toBe(coarse.phase)
		expect(every16.round).toBe(coarse.round)
		expect(every16.results).toEqual(coarse.results)
		expect(every16.events).toEqual(coarse.events)
	})
})

describe('DuelSim: blockDamageShare', () => {
	it('a successful parry still deals the share of base damage', () => {
		const s = sim(HERO, HERO, { rules: { blockDamageShare: 0.4 } })
		s.attack('p2', 'heavy', false, 0) // base damage 13
		expect(s.parry('p1', false, 500)).toBe(true)
		expect(s.fighters.p1.hp).toBe(HERO.maxHp - 5) // round(13 * 0.4)
		expect(s.isStaggered('p2', 900)).toBe(true)
		expect(s.fighters.p1.meter).toBe(DUEL.meterOnParry)
		expect(s.drain()).toContainEqual(
			expect.objectContaining({
				t: 'parried',
				rewarded: true,
				chip: 5,
			}),
		)
	})

	it('uses base damage only, so the perfect multiplier does not apply', () => {
		const s = sim(HERO, HERO, { rules: { blockDamageShare: 0.4 } })
		s.attack('p2', 'heavy', true, 0) // perfect would make it 15.6
		s.parry('p1', false, 500)
		expect(s.fighters.p1.hp).toBe(HERO.maxHp - 5)
	})

	it('adds to the passive chip', () => {
		const s = sim(HERO, HERO, { rules: { blockDamageShare: 0.4 } })
		// p1 is passive: passive chip 5 plus block chip 5.
		s.attack('p2', 'heavy', false, 10_500) // lands 11600
		expect(s.parry('p1', false, 11_000)).toBe(true)
		expect(s.fighters.p1.hp).toBe(HERO.maxHp - 10)
		expect(s.drain()).toContainEqual(
			expect.objectContaining({
				t: 'parried',
				rewarded: false,
				chip: 10,
			}),
		)
	})

	it('a block chip can knock the defender out', () => {
		const s = sim(HERO, HERO, {
			maxHp: { p1: 5 },
			rules: { blockDamageShare: 0.4 },
		})
		s.attack('p2', 'heavy', false, 0)
		s.parry('p1', false, 500)
		expect(s.fighters.p1.hp).toBe(0)
		expect(s.phase).toBe('roundOver')
		expect(s.drain()).toContainEqual(
			expect.objectContaining({
				t: 'roundOver',
				winner: 'p2',
				reason: 'ko',
			}),
		)
	})

	it('0 leaves a successful parry at no damage', () => {
		const s = sim(HERO, HERO, { rules: { blockDamageShare: 0 } })
		s.attack('p2', 'heavy', false, 0)
		s.parry('p1', false, 500)
		expect(s.fighters.p1.hp).toBe(HERO.maxHp)
		expect(s.drain()).toContainEqual(
			expect.objectContaining({ t: 'parried', chip: 0 }),
		)
	})
})

describe('DuelSim: rules', () => {
	it('uses DUEL unless a rule is overridden', () => {
		const s = new DuelSim({ fighters: { p1: HERO, p2: HERO } })
		expect(s.rules).toEqual(DUEL)
	})

	it('an override changes behaviour and leaves other rules alone', () => {
		const s = new DuelSim({
			fighters: { p1: HERO, p2: HERO },
			rules: { parryStaggerMs: 500 },
		})
		expect(s.rules.parryStaggerMs).toBe(500)
		expect(s.rules.meterOnParry).toBe(DUEL.meterOnParry)

		s.startRound(0)
		s.drain()
		s.attack('p2', 'heavy', false, 0)
		s.parry('p1', false, 500)
		expect(s.canAct('p2', 999)).toBe(false)
		expect(s.canAct('p2', 1000)).toBe(true)
	})
})

describe('DuelSim: move staling', () => {
	/** Rounded to 3 places, so 0.7 * 0.7 compares equal to 0.49. */
	const stalesOf = (events: DuelEvent[]) =>
		attacksStarted(events).map((e) => Number(e.stale.toFixed(3)))

	it('defaults to 0.8: the second repeat deals 0.8x, the third 0.64x', () => {
		expect(DUEL.staleFactor).toBe(0.8)
		const s = sim()
		s.attack('p1', 'jab', false, 0)
		s.attack('p1', 'jab', false, 300)
		s.attack('p1', 'jab', false, 600)
		s.advance(900)
		const events = s.drain()
		expect(stalesOf(events)).toEqual([1, 0.8, 0.64])
		// round(4 * 0.8) = 3, round(4 * 0.64) = 3
		expect(hitDamages(events)).toEqual([4, 3, 3])
	})

	it('staleFactor 1 turns staling off: every repeat deals full damage', () => {
		const s = sim(HERO, HERO, { rules: { staleFactor: 1 } })
		s.attack('p1', 'jab', false, 0)
		s.attack('p1', 'jab', false, 300)
		s.attack('p1', 'jab', false, 600)
		s.advance(900)
		const events = s.drain()
		expect(stalesOf(events)).toEqual([1, 1, 1])
		expect(hitDamages(events)).toEqual([4, 4, 4])
	})

	it('the second repeat deals 0.7x, the third 0.49x', () => {
		const s = sim(HERO, HERO, { rules: { staleFactor: 0.7 } })
		s.attack('p1', 'jab', false, 0)
		s.attack('p1', 'jab', false, 300)
		s.attack('p1', 'jab', false, 600)
		s.advance(900)
		const events = s.drain()
		expect(stalesOf(events)).toEqual([1, 0.7, 0.49])
		// round(4 * 0.7) = 3, round(4 * 0.49) = 2
		expect(hitDamages(events)).toEqual([4, 3, 2])
		expect(
			events.flatMap((e) =>
				e.t === 'hit' ? [Number(e.stale.toFixed(3))] : [],
			),
		).toEqual([1, 0.7, 0.49])
	})

	it('never goes below staleFloor', () => {
		const s = sim(HERO, HERO, { rules: { staleFactor: 0.5 } })
		s.attack('p1', 'jab', false, 0)
		s.attack('p1', 'jab', false, 300)
		s.attack('p1', 'jab', false, 600)
		s.attack('p1', 'jab', false, 900)
		s.advance(1500)
		const events = s.drain()
		// 0.5^2 = 0.25 and 0.5^3 = 0.125 are both under the 0.4 floor.
		expect(stalesOf(events)).toEqual([1, 0.5, 0.4, 0.4])
		// round(4 * 0.4) = 2, so the floor keeps the repeats at 2 damage.
		expect(hitDamages(events)).toEqual([4, 2, 2, 2])
	})

	it('a different move in between resets the count', () => {
		const s = sim(HERO, HERO, { rules: { staleFactor: 0.7 } })
		expect(s.attack('p1', 'jab', false, 0)).toBe(true)
		expect(s.attack('p1', 'heavy', false, 300)).toBe(true)
		expect(s.attack('p1', 'jab', false, 1400)).toBe(true)
		expect(s.attack('p1', 'jab', false, 1700)).toBe(true)
		s.advance(2100)
		expect(stalesOf(s.drain())).toEqual([1, 1, 1, 0.7])
	})

	it('a refused attack does not count as a repeat', () => {
		const s = sim(HERO, HERO, { rules: { staleFactor: 0.7 } })
		expect(s.attack('p1', 'jab', false, 0)).toBe(true)
		expect(s.attack('p1', 'jab', false, 100)).toBe(false) // still in flight
		expect(s.attack('p1', 'jab', false, 300)).toBe(true)
		s.advance(600)
		expect(stalesOf(s.drain())).toEqual([1, 0.7])
	})

	it('resets each round', () => {
		const s = sim(HERO, HERO, {
			maxHp: { p2: 5 },
			rules: { staleFactor: 0.7 },
		})
		s.attack('p1', 'jab', false, 0)
		s.attack('p1', 'jab', false, 300) // 4 + 3 KOs a 5 HP defender at 600
		s.advance(600)
		expect(s.phase).toBe('roundOver')
		s.startRound(1000)
		s.attack('p1', 'jab', false, 1000)
		s.advance(1300)
		expect(stalesOf(s.drain())).toEqual([1, 0.7, 1])
	})

	it('reports stale on attackStarted and hit', () => {
		const s = sim(HERO, HERO, { rules: { staleFactor: 0.7 } })
		s.attack('p1', 'jab', false, 0)
		s.attack('p1', 'jab', false, 300)
		s.advance(600)
		const events = s.drain()
		expect(events).toContainEqual(
			expect.objectContaining({ t: 'attackStarted', stale: 1 }),
		)
		expect(events).toContainEqual(
			expect.objectContaining({ t: 'hit', damage: 3, stale: 0.7 }),
		)
	})

	/** Same ops at a chosen advance granularity (null: only at each op). */
	function staledRun(step: number | null) {
		const s = sim(HERO, HERO, { rules: { staleFactor: 0.7 } })
		const ops: [number, MoveId][] = [
			[0, 'jab'],
			[300, 'jab'],
			[600, 'jab'],
			[900, 'heavy'],
			[2200, 'jab'],
			[2500, 'jab'],
		]
		let now = 0
		for (const [at, move] of ops) {
			if (step !== null)
				for (let t = now; t <= at; t += step) s.advance(t)
			s.advance(at)
			s.attack('p1', move, false, at)
			now = at
		}
		s.advance(3000)
		return {
			events: s.drain(),
			hp: [s.fighters.p1.hp, s.fighters.p2.hp],
		}
	}

	it('stays granularity-invariant with staling on', () => {
		const coarse = staledRun(null)
		expect(coarse.events.some((e) => e.t === 'hit' && e.stale < 1)).toBe(
			true,
		)
		expect(staledRun(1).events).toEqual(coarse.events)
		expect(staledRun(16).events).toEqual(coarse.events)
		expect(staledRun(1).hp).toEqual(coarse.hp)
	})
})
