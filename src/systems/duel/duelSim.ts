/**
 * The duel referee: HP, meter, pending attacks, parries, rounds.
 *
 * Pure and clock-injected. Nothing here reads Phaser, the DOM or `Date.now()`,
 * and both fighters go through the same `attack` / `parry` calls. That is
 * deliberate: for online play this same class runs on the server, fed by
 * actions from two clients, and the scene becomes a renderer of its events.
 */

import { DUEL, other, type Side } from './duelTuning'

export interface AttackSpec {
	/** Free-form id for the renderer ("jab", "lunge", ...). */
	move: string
	damage: number
	/** Time from now until the hit lands. For the AI this is the telegraph. */
	startupMs: number
	interrupts: boolean
	/** Cannot be interrupted; the only answer is a parry. */
	armored?: boolean
	/** Parrying it staggers the attacker and pays meter. Default true. */
	rewardsParry?: boolean
	hitstunMs: number
	meterCost?: number
	/** Finished without a mistake. Scales damage. */
	perfect?: boolean
}

interface PendingAttack extends AttackSpec {
	landsAt: number
	startedAt: number
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
}

export type DuelPhase = 'waiting' | 'fight' | 'roundOver' | 'matchOver'

export type DuelEvent =
	| { t: 'roundStart'; round: number }
	| { t: 'attackStarted'; side: Side; move: string; landsAt: number }
	| {
			t: 'hit'
			attacker: Side
			move: string
			damage: number
			counter: boolean
			perfect: boolean
	  }
	| {
			t: 'parried'
			defender: Side
			move: string
			perfect: boolean
			/** False for a plain deflect: no stagger, no meter. */
			rewarded: boolean
			/** HP the defender lost anyway, from being passive. */
			chip: number
	  }
	| { t: 'interrupted'; side: Side; move: string }
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
	}
}

export interface DuelOptions {
	/**
	 * Per-side health. Online both sides get the default; the ladder raises
	 * the goblin's so a round lasts the same time at every level's target
	 * speed, instead of a fast typist deleting it before its attacks matter.
	 */
	maxHp?: Partial<Record<Side, number>>
}

export class DuelSim {
	readonly fighters: Record<Side, FighterState>

	constructor(options: DuelOptions = {}) {
		this.fighters = {
			p1: freshFighter(options.maxHp?.p1 ?? DUEL.maxHp),
			p2: freshFighter(options.maxHp?.p2 ?? DUEL.maxHp),
		}
	}

	phase: DuelPhase = 'waiting'
	round = 0
	private roundEndsAt = 0
	private now = 0
	private events: DuelEvent[] = []

	/** Begin the next round. Meter carries over; HP and state do not. */
	startRound(now: number): void {
		if (this.phase === 'matchOver') return
		this.now = now
		this.round++
		for (const side of ['p1', 'p2'] as const) {
			const prev = this.fighters[side]
			this.fighters[side] = {
				...freshFighter(prev.maxHp, prev.roundsWon),
				meter: prev.meter,
				lastAttackAt: now,
			}
		}
		this.roundEndsAt = now + DUEL.roundTimeMs
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
			now - this.fighters[side].lastAttackAt > DUEL.passiveMs
		)
	}

	/** Returns false when the attack is not allowed right now. */
	attack(side: Side, spec: AttackSpec, now: number): boolean {
		this.advance(now)
		if (!this.canAct(side, now)) return false
		const f = this.fighters[side]
		const cost = spec.meterCost ?? 0
		if (f.meter < cost) return false
		f.meter -= cost
		f.lastAttackAt = now
		f.pending = {
			...spec,
			startedAt: now,
			landsAt: now + Math.max(0, spec.startupMs),
		}
		this.emit({
			t: 'attackStarted',
			side,
			move: spec.move,
			landsAt: f.pending.landsAt,
		})
		return true
	}

	/**
	 * `side` deflects the opponent's incoming attack.
	 *
	 * Succeeds only while an attack is actually in flight, so there is no
	 * value in parrying pre-emptively. A successful parry cancels the attack
	 * and opens the attacker up for a counter.
	 */
	parry(side: Side, perfect: boolean, now: number): boolean {
		this.advance(now)
		if (this.phase !== 'fight') return false
		const attacker = this.fighters[other(side)]
		const incoming = attacker.pending
		if (!incoming) return false

		attacker.pending = null
		const passive = this.isPassive(side, now)
		const rewarded = incoming.rewardsParry !== false && !passive
		if (rewarded) {
			attacker.staggerUntil = now + DUEL.parryStaggerMs
			this.gainMeter(
				side,
				DUEL.meterOnParry + (perfect ? DUEL.meterOnPerfect : 0),
			)
		}
		const chip = passive
			? Math.max(1, Math.round(incoming.damage * DUEL.passiveChip))
			: 0
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
		this.gainMeter(side, DUEL.meterOnMistake)
		this.emit({ t: 'mistake', side })
	}

	/** Resolve everything due by `now`. Call every frame. */
	advance(now: number): void {
		this.now = Math.max(this.now, now)
		if (this.phase !== 'fight') return

		// Resolve in landing order so two near-simultaneous attacks interact
		// the same way regardless of which side is listed first.
		const due = (['p1', 'p2'] as const)
			.filter((s) => {
				const p = this.fighters[s].pending
				return p !== null && p.landsAt <= this.now
			})
			.sort(
				(a, b) =>
					this.fighters[a].pending!.landsAt -
					this.fighters[b].pending!.landsAt,
			)

		for (const side of due) {
			const pending = this.fighters[side].pending
			// An earlier hit this frame may have interrupted it.
			if (!pending) continue
			this.fighters[side].pending = null
			this.land(side, pending)
			if (this.phase !== 'fight') return
		}

		if (this.now >= this.roundEndsAt) this.endRoundOnTime()
	}

	/** Hand the renderer everything that happened since the last drain. */
	drain(): DuelEvent[] {
		const out = this.events
		this.events = []
		return out
	}

	// ----------------------------------------------------------------- internals

	private land(attacker: Side, hit: PendingAttack): void {
		const defenderSide = other(attacker)
		const defender = this.fighters[defenderSide]
		const counter = hit.landsAt < defender.staggerUntil

		let damage = hit.damage
		if (hit.perfect) damage *= DUEL.perfectMultiplier
		if (counter) damage *= DUEL.counterMultiplier
		damage = Math.round(damage)

		defender.hp = Math.max(0, defender.hp - damage)
		// Each hit that follows quickly on the last stuns for less, so no
		// rhythm of attacks can keep a fighter locked down indefinitely.
		defender.chain =
			hit.landsAt - defender.lastHitAt <= DUEL.chainWindowMs
				? defender.chain + 1
				: 0
		defender.lastHitAt = hit.landsAt
		const stunScale = Math.max(
			0,
			1 - defender.chain * DUEL.hitstunDecayPerHit,
		)
		defender.hitstunUntil = Math.max(
			defender.hitstunUntil,
			hit.landsAt + hit.hitstunMs * stunScale,
		)
		this.gainMeter(
			attacker,
			DUEL.meterOnHit + (hit.perfect ? DUEL.meterOnPerfect : 0),
		)
		this.gainMeter(defenderSide, DUEL.meterOnTakeHit)

		this.emit({
			t: 'hit',
			attacker,
			move: hit.move,
			damage,
			counter,
			perfect: Boolean(hit.perfect),
		})

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

	private endRoundOnTime(): void {
		const { p1, p2 } = this.fighters
		// Compare fractions: the goblin can have more raw HP than the player.
		const a = p1.hp / p1.maxHp
		const b = p2.hp / p2.maxHp
		const winner = a === b ? null : a > b ? 'p1' : 'p2'
		this.endRound(winner, 'time')
	}

	private endRound(winner: Side | null, reason: 'ko' | 'time'): void {
		for (const f of Object.values(this.fighters)) f.pending = null
		if (winner) this.fighters[winner].roundsWon++
		this.emit({ t: 'roundOver', winner, reason, round: this.round })

		const champion = (['p1', 'p2'] as const).find(
			(s) => this.fighters[s].roundsWon >= DUEL.roundsToWin,
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
		f.meter = Math.max(0, Math.min(DUEL.maxMeter, f.meter + amount))
	}

	private emit(e: DuelEvent): void {
		this.events.push(e)
	}
}
