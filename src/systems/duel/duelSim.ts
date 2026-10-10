/**
 * The duel referee: HP, meter, pending attacks, parries, poison, rounds.
 *
 * Pure and clock-injected. Nothing here reads Phaser, the DOM or `Date.now()`,
 * and both fighters go through the same `attack` / `parry` calls. That is
 * deliberate: for online play this same class runs on the server, fed by
 * actions from two clients, and the scene becomes a renderer of its events.
 *
 * Time is driven by `advance(now)`, which resolves every due item (a landing,
 * a poison tick, the round clock) at its own timestamp, in time order. Calling
 * `advance` coarsely or finely therefore gives the same result; see
 * `advance` below.
 */

import type { FighterDef, FighterMove } from './fighters'
import {
	DUEL,
	other,
	type DuelRules,
	type MoveId,
	type Side,
} from './duelTuning'

const SIDES: readonly Side[] = ['p1', 'p2']

/** Poison ticks once a second for its duration. */
const POISON_TICK_MS = 1000

interface PendingAttack {
	move: MoveId
	damage: number
	startedAt: number
	landsAt: number
	perfect: boolean
	armored: boolean
	interrupts: boolean
	blockTier: number | null
	hitstunMs: number
	/** Move-staling multiplier on base damage, 1 when unstaled. */
	stale: number
}

/** Consecutive-use tracking for move staling, kept per side. */
interface Streak {
	lastMove: MoveId | null
	/** Repeats of `lastMove` in a row: 0 for the first use. */
	staleCount: number
}

export interface PoisonState {
	dps: number
	/** The poison ends after this time. */
	until: number
	nextTickAt: number
}

export interface FighterState {
	hp: number
	maxHp: number
	meter: number
	roundsWon: number
	pending: PendingAttack | null
	/** Parried: cannot act, and takes counter damage. */
	staggerUntil: number
	/** Just got hit: cannot start an attack. */
	hitstunUntil: number
	/** Consecutive hits taken, each within `chainWindowMs` of the last. */
	chain: number
	lastHitAt: number
	/** Last time this fighter started an attack, for the passivity rule. */
	lastAttackAt: number
	/** Set by the opponent's poison signature. Null when not poisoned. */
	poison: PoisonState | null
}

export type DuelPhase = 'waiting' | 'fight' | 'roundOver' | 'matchOver'

export type DuelEvent =
	| { t: 'roundStart'; round: number }
	| {
			t: 'attackStarted'
			side: Side
			move: MoveId
			landsAt: number
			/** Tier of the block word the defender must type, or null. */
			blockTier: number | null
			armored: boolean
			/** Staling multiplier this attack will land with. */
			stale: number
	  }
	| {
			t: 'hit'
			attacker: Side
			move: MoveId
			damage: number
			counter: boolean
			perfect: boolean
			/** Staling multiplier applied to the base damage. */
			stale: number
	  }
	| {
			t: 'parried'
			defender: Side
			move: MoveId
			perfect: boolean
			/** False for a passive defender: no stagger, no meter. */
			rewarded: boolean
			/**
			 * Total HP the defender lost on this parry: passive chip plus any
			 * `blockDamageShare` damage. Zero under the default rules.
			 */
			chip: number
	  }
	| { t: 'interrupted'; side: Side; move: MoveId }
	/** `side` is the victim. */
	| { t: 'poison'; side: Side; damage: number }
	/** Meter stolen from `from` by a drain signature. */
	| { t: 'drain'; from: Side; amount: number }
	| { t: 'mistake'; side: Side }
	| {
			t: 'roundOver'
			winner: Side | null
			reason: 'ko' | 'time'
			round: number
	  }
	| { t: 'matchOver'; winner: Side }

function freshFighter(maxHp: number, roundsWon = 0): FighterState {
	return {
		hp: maxHp,
		maxHp,
		meter: 0,
		roundsWon,
		pending: null,
		staggerUntil: 0,
		hitstunUntil: 0,
		chain: 0,
		lastHitAt: -Infinity,
		lastAttackAt: 0,
		poison: null,
	}
}

export interface DuelOptions {
	fighters: Record<Side, FighterDef>
	/** Overrides FighterDef.maxHp (the ladder raises the AI's). */
	maxHp?: Partial<Record<Side, number>>
	/** Multiplier on windups of attacks thrown BY this side. Default 1. */
	windupScale?: Partial<Record<Side, number>>
	/** Overrides for `DUEL`. Unset keys keep the DUEL value. */
	rules?: Partial<DuelRules>
}

/** Something `advance` has to resolve. */
type Due =
	| { at: number; kind: 'roundEnd' }
	| { at: number; kind: 'landing' | 'tick'; side: Side }

/** Ties at one timestamp: landings, then ticks, then round end. */
const DUE_RANK: Record<Due['kind'], number> = {
	landing: 0,
	tick: 1,
	roundEnd: 2,
}

function compareDue(a: Due, b: Due): number {
	const sideA = 'side' in a && a.side === 'p2' ? 1 : 0
	const sideB = 'side' in b && b.side === 'p2' ? 1 : 0
	return a.at - b.at || DUE_RANK[a.kind] - DUE_RANK[b.kind] || sideA - sideB
}

export class DuelSim {
	readonly defs: Record<Side, FighterDef>
	readonly fighters: Record<Side, FighterState>
	private readonly windupScale: Record<Side, number>
	/** Every rule value this sim uses: `DUEL`, with any overrides applied. */
	readonly rules: DuelRules

	constructor(options: DuelOptions) {
		this.rules = { ...DUEL, ...options.rules }
		this.defs = options.fighters
		this.fighters = {
			p1: freshFighter(options.maxHp?.p1 ?? options.fighters.p1.maxHp),
			p2: freshFighter(options.maxHp?.p2 ?? options.fighters.p2.maxHp),
		}
		this.windupScale = {
			p1: options.windupScale?.p1 ?? 1,
			p2: options.windupScale?.p2 ?? 1,
		}
	}

	phase: DuelPhase = 'waiting'
	round = 0
	private roundEndsAt = 0
	private events: DuelEvent[] = []
	private streaks: Record<Side, Streak> = {
		p1: { lastMove: null, staleCount: 0 },
		p2: { lastMove: null, staleCount: 0 },
	}

	/** Begin the next round. Meter carries over; HP and state do not. */
	startRound(now: number): void {
		// Whatever was due before the new round belongs to the old one.
		this.advance(now)
		if (this.phase === 'matchOver') return
		this.round++
		for (const side of SIDES) {
			this.streaks[side] = { lastMove: null, staleCount: 0 }
			const prev = this.fighters[side]
			this.fighters[side] = {
				...freshFighter(prev.maxHp, prev.roundsWon),
				meter: prev.meter,
				lastAttackAt: now,
			}
		}
		this.roundEndsAt = now + this.rules.roundTimeMs
		this.phase = 'fight'
		this.emit({ t: 'roundStart', round: this.round })
	}

	timeLeftMs(now: number): number {
		if (this.phase !== 'fight') return 0
		return Math.max(0, this.roundEndsAt - now)
	}

	/** True when `side` is free to start an attack. */
	canAct(side: Side, now: number): boolean {
		const f = this.fighters[side]
		return (
			this.phase === 'fight' &&
			f.pending === null &&
			now >= f.staggerUntil &&
			now >= f.hitstunUntil
		)
	}

	isStaggered(side: Side, now: number): boolean {
		return now < this.fighters[side].staggerUntil
	}

	/**
	 * A fighter who has not thrown anything for `passiveMs`.
	 *
	 * Closes the turtle: land one jab for the lead, then parry until the clock
	 * runs out. A passive fighter's parries only deflect, pay nothing, and
	 * leak chip damage, so running down the clock costs you the lead.
	 */
	isPassive(side: Side, now: number): boolean {
		return (
			this.phase === 'fight' &&
			now - this.fighters[side].lastAttackAt > this.rules.passiveMs
		)
	}

	/**
	 * Earliest time `side` could start an attack if nothing else happens.
	 * Infinity while its own attack is pending or no round is running.
	 */
	readyAt(side: Side): number {
		const f = this.fighters[side]
		if (this.phase !== 'fight' || f.pending !== null) return Infinity
		return Math.max(f.staggerUntil, f.hitstunUntil)
	}

	/**
	 * Start `move` for `side`. Returns false when it is not allowed right now.
	 *
	 * The windup is the telegraph the defender sees. It is lengthened when the
	 * defender is a guard fighter, and scaled by this side's `windupScale`.
	 */
	attack(side: Side, move: MoveId, perfect: boolean, now: number): boolean {
		this.advance(now)
		if (!this.canAct(side, now)) return false
		const f = this.fighters[side]
		const def: FighterMove = this.defs[side].moves[move]
		if (f.meter < def.meterCost) return false
		f.meter -= def.meterCost
		f.lastAttackAt = now

		const streak = this.streaks[side]
		streak.staleCount = streak.lastMove === move ? streak.staleCount + 1 : 0
		streak.lastMove = move
		const stale = Math.max(
			this.rules.staleFloor,
			this.rules.staleFactor ** streak.staleCount,
		)

		const defenderSig = this.defs[other(side)].signature
		const guardScale =
			defenderSig.kind === 'guard' ? defenderSig.incomingWindupScale : 1
		// Rounded so every landing sits on a whole millisecond.
		const windup = Math.round(
			def.windupMs * this.windupScale[side] * guardScale,
		)
		const pending: PendingAttack = {
			move,
			damage: def.damage,
			startedAt: now,
			landsAt: now + Math.max(0, windup),
			perfect,
			armored: def.armored,
			interrupts: def.interrupts,
			blockTier: def.blockTier,
			hitstunMs: def.hitstunMs,
			stale,
		}
		f.pending = pending
		this.emit({
			t: 'attackStarted',
			side,
			move,
			landsAt: pending.landsAt,
			blockTier: pending.blockTier,
			armored: pending.armored,
			stale,
		})
		return true
	}

	/**
	 * `side` deflects the opponent's incoming attack.
	 *
	 * Succeeds only while an attack is in flight whose `blockTier` is not
	 * null, so jabs cannot be parried. A successful parry cancels the attack
	 * and opens the attacker up for a counter. A passive defender's parry only
	 * deflects: no stagger, no meter, but chip damage. Any parry also deals
	 * `blockDamageShare` of the attack's base damage to the defender.
	 */
	parry(side: Side, perfect: boolean, now: number): boolean {
		this.advance(now)
		if (this.phase !== 'fight') return false
		const attacker = this.fighters[other(side)]
		const incoming = attacker.pending
		if (!incoming || incoming.blockTier === null) return false

		attacker.pending = null
		const passive = this.isPassive(side, now)
		const rewarded = !passive
		if (rewarded) {
			attacker.staggerUntil = now + this.rules.parryStaggerMs
			this.gainMeter(
				side,
				this.rules.meterOnParry +
					(perfect ? this.rules.meterOnPerfect : 0),
			)
		}
		const passiveChip = passive
			? Math.max(1, Math.round(incoming.damage * this.rules.passiveChip))
			: 0
		// Base damage only: no perfect, counter or signature multipliers.
		const blockChip = Math.max(
			0,
			Math.round(incoming.damage * this.rules.blockDamageShare),
		)
		const chip = passiveChip + blockChip
		const defender = this.fighters[side]
		defender.hp = Math.max(0, defender.hp - chip)
		this.emit({
			t: 'parried',
			defender: side,
			move: incoming.move,
			perfect,
			rewarded,
			chip,
		})
		if (defender.hp <= 0) this.endRound(other(side), 'ko')
		return true
	}

	mistake(side: Side, now: number): void {
		this.advance(now)
		if (this.phase !== 'fight') return
		this.gainMeter(side, this.rules.meterOnMistake)
		this.emit({ t: 'mistake', side })
	}

	/**
	 * Resolve everything due by `now`, each at its own timestamp.
	 *
	 * Repeatedly takes the earliest due item (a pending landing, a poison
	 * tick, the round clock) with time <= `now`, and resolves it. Nothing a
	 * resolution creates is due earlier than the item that created it: a
	 * landing can only schedule ticks one second later. So the order is fixed
	 * by the timestamps alone, and it does not matter whether the caller
	 * advances once or every millisecond. Same-time ties: landings, then
	 * ticks, then round end; p1 before p2.
	 */
	advance(now: number): void {
		while (this.phase === 'fight') {
			const due = this.nextDue(now)
			if (!due) return
			this.fire(due)
		}
	}

	/**
	 * Earliest future time at which `advance` would change anything: a
	 * landing, a poison tick, or the round clock. Infinity when none.
	 */
	nextDueAt(): number {
		if (this.phase !== 'fight') return Infinity
		let next = this.roundEndsAt
		for (const side of SIDES) {
			const f = this.fighters[side]
			if (f.pending) next = Math.min(next, f.pending.landsAt)
			if (f.poison) next = Math.min(next, f.poison.nextTickAt)
		}
		return next
	}

	/** Hand the renderer everything that happened since the last drain. */
	drain(): DuelEvent[] {
		const out = this.events
		this.events = []
		return out
	}

	// ----------------------------------------------------------------- internals

	private nextDue(limit: number): Due | null {
		const candidates: Due[] = [{ at: this.roundEndsAt, kind: 'roundEnd' }]
		for (const side of SIDES) {
			const f = this.fighters[side]
			if (f.pending) {
				candidates.push({
					at: f.pending.landsAt,
					kind: 'landing',
					side,
				})
			}
			if (f.poison) {
				candidates.push({
					at: f.poison.nextTickAt,
					kind: 'tick',
					side,
				})
			}
		}
		const due = candidates.filter((d) => d.at <= limit).sort(compareDue)
		return due[0] ?? null
	}

	private fire(due: Due): void {
		if (due.kind === 'roundEnd') {
			this.endRoundOnTime()
			return
		}
		if (due.kind === 'tick') {
			this.tickPoison(due.side, due.at)
			return
		}
		const f = this.fighters[due.side]
		const hit = f.pending
		if (!hit) return
		f.pending = null
		this.land(due.side, hit)
	}

	/**
	 * Damage order: base, x staling, x perfect, x counter, x resolve (attacker
	 * below its threshold), + combo (attacker, from the defender's chain), then
	 * round.
	 */
	private land(attacker: Side, hit: PendingAttack): void {
		const defenderSide = other(attacker)
		const defender = this.fighters[defenderSide]
		const attackerState = this.fighters[attacker]
		const sig = this.defs[attacker].signature
		const counter = hit.landsAt < defender.staggerUntil

		let damage = hit.damage * hit.stale
		if (hit.perfect) damage *= this.rules.perfectMultiplier
		if (counter) damage *= this.rules.counterMultiplier
		if (
			sig.kind === 'resolve' &&
			attackerState.hp / attackerState.maxHp <= sig.hpThreshold
		) {
			damage *= sig.damageScale
		}
		// Each hit that follows quickly on the last stuns for less, so no
		// rhythm of attacks can keep a fighter locked down indefinitely.
		defender.chain =
			hit.landsAt - defender.lastHitAt <= this.rules.chainWindowMs
				? defender.chain + 1
				: 0
		defender.lastHitAt = hit.landsAt
		if (sig.kind === 'combo') {
			damage += Math.min(sig.maxBonus, defender.chain * sig.bonusPerLink)
		}
		damage = Math.round(damage)

		defender.hp = Math.max(0, defender.hp - damage)
		const stunScale = Math.max(
			0,
			1 - defender.chain * this.rules.hitstunDecayPerHit,
		)
		defender.hitstunUntil = Math.max(
			defender.hitstunUntil,
			hit.landsAt + hit.hitstunMs * stunScale,
		)
		this.gainMeter(
			attacker,
			this.rules.meterOnHit +
				(hit.perfect ? this.rules.meterOnPerfect : 0),
		)
		this.gainMeter(defenderSide, this.rules.meterOnTakeHit)

		this.emit({
			t: 'hit',
			attacker,
			move: hit.move,
			damage,
			counter,
			perfect: hit.perfect,
			stale: hit.stale,
		})

		if (sig.kind === 'poison' && hit.move === sig.move) {
			const until = hit.landsAt + sig.durationMs
			const nextTickAt = hit.landsAt + POISON_TICK_MS
			// A refresh restarts the timer; poison never stacks.
			if (nextTickAt <= until) {
				defender.poison = { dps: sig.dps, until, nextTickAt }
			}
		}

		if (sig.kind === 'drain') {
			const room = this.rules.maxMeter - attackerState.meter
			const amount = Math.min(defender.meter, sig.meterPerHit, room)
			if (amount > 0) {
				defender.meter -= amount
				attackerState.meter += amount
				this.emit({ t: 'drain', from: defenderSide, amount })
			}
		}

		if (hit.interrupts && defender.pending && !defender.pending.armored) {
			const cancelled = defender.pending
			defender.pending = null
			this.emit({
				t: 'interrupted',
				side: defenderSide,
				move: cancelled.move,
			})
		}

		if (defender.hp <= 0) this.endRound(attacker, 'ko')
	}

	private tickPoison(side: Side, at: number): void {
		const f = this.fighters[side]
		const poison = f.poison
		if (!poison) return
		f.hp = Math.max(0, f.hp - poison.dps)
		this.emit({ t: 'poison', side, damage: poison.dps })
		const nextTickAt = at + POISON_TICK_MS
		f.poison = nextTickAt <= poison.until ? { ...poison, nextTickAt } : null
		if (f.hp <= 0) this.endRound(other(side), 'ko')
	}

	private endRoundOnTime(): void {
		const { p1, p2 } = this.fighters
		// Compare fractions: the goblin can have more raw HP than the player.
		const a = p1.hp / p1.maxHp
		const b = p2.hp / p2.maxHp
		const winner = a === b ? null : a > b ? 'p1' : 'p2'
		this.endRound(winner, 'time')
	}

	private endRound(winner: Side | null, reason: 'ko' | 'time'): void {
		for (const f of Object.values(this.fighters)) {
			f.pending = null
			f.poison = null
		}
		if (winner) this.fighters[winner].roundsWon++
		this.emit({ t: 'roundOver', winner, reason, round: this.round })

		const champion = SIDES.find(
			(s) => this.fighters[s].roundsWon >= this.rules.roundsToWin,
		)
		if (champion) {
			this.phase = 'matchOver'
			this.emit({ t: 'matchOver', winner: champion })
		} else {
			this.phase = 'roundOver'
		}
	}

	private gainMeter(side: Side, amount: number): void {
		const f = this.fighters[side]
		f.meter = Math.max(0, Math.min(this.rules.maxMeter, f.meter + amount))
	}

	private emit(e: DuelEvent): void {
		this.events.push(e)
	}
}
