/**
 * The goblin's decision-making.
 *
 * It only ever *chooses* an attack; timing and the block word are resolved by
 * the scene and the sim. That keeps the AI swappable for a network opponent:
 * both are just "something that decides when p2 attacks".
 */

import type { DuelSim } from './duelSim'
import { ENEMY_ATTACKS, type EnemyAttackDef, type Side } from './duelTuning'

export { seededRng } from './rng'

export interface BrainProfile {
	/** Pause between attacks, randomised inside this range. */
	idleMinMs: number
	idleMaxMs: number
	/** Chance the heavier lunge is picked over a slash. */
	lungeChance: number
	/** Chance a player mistake triggers a quick punish. */
	punishChance: number
	/** Reaction delay before a punish starts. */
	punishDelayMs: number
	/** Beat before swinging back after being hit (not after its own attack). */
	recoverMs: number
	/** Chance an attack that was not parried is followed straight up. */
	chainChance: number
	/** Gap before a chained follow-up. */
	chainGapMs: number
	/**
	 * Chance that, seeing the opponent holding a heavy one key from done, it
	 * answers with the armored lunge. This is what makes pre-loading an
	 * interrupt a risk rather than a free win against every slash.
	 */
	readChance: number
	/** Minimum time between two punishes, so mistakes cannot steer it. */
	punishCooldownMs: number
}

export const GOBLIN: BrainProfile = {
	idleMinMs: 1500,
	idleMaxMs: 3000,
	lungeChance: 0.35,
	punishChance: 0.55,
	punishDelayMs: 220,
	recoverMs: 250,
	chainChance: 0.45,
	chainGapMs: 180,
	readChance: 0.5,
	punishCooldownMs: 2500,
}

export class GoblinBrain {
	private nextActionAt: number
	private queued: EnemyAttackDef | null = null
	/** Mid-attack or stunned on the last think(). */
	private busy = false
	/** Whether that busy stretch included one of its own attacks. */
	private attackedWhileBusy = false
	/** ...and whether that attack got parried, which rules out a chain. */
	private parriedWhileBusy = false
	private lastPunishAt = -Infinity

	constructor(
		private readonly side: Side,
		private readonly rng: () => number,
		private readonly profile: BrainProfile = GOBLIN,
		now = 0,
	) {
		this.nextActionAt = now + this.idleGap()
	}

	/** Push the first attack back after a round starts. */
	reset(now: number): void {
		this.queued = null
		this.busy = false
		this.attackedWhileBusy = false
		this.parriedWhileBusy = false
		this.nextActionAt = now + this.idleGap()
	}

	/** The opponent fumbled. Maybe jump on it. */
	onOpponentMistake(now: number): void {
		if (this.busy || this.queued?.id === 'punish') return
		if (now - this.lastPunishAt < this.profile.punishCooldownMs) return
		if (this.rng() >= this.profile.punishChance) return
		const at = now + this.profile.punishDelayMs
		if (at < this.nextActionAt) {
			this.nextActionAt = at
			this.queued = ENEMY_ATTACKS.punish
			this.lastPunishAt = now
		}
	}

	/**
	 * Returns the attack to start now, or null. The caller starts it on the
	 * sim; the brain waits for it to resolve before scheduling the next one.
	 */
	think(
		now: number,
		sim: DuelSim,
		opponentLoaded = false,
	): EnemyAttackDef | null {
		if (!sim.canAct(this.side, now)) {
			this.busy = true
			if (sim.fighters[this.side].pending) this.attackedWhileBusy = true
			// A stagger only ever comes from a parried attack, even if the
			// parry landed before we got to see the attack in flight.
			if (sim.isStaggered(this.side, now)) {
				this.attackedWhileBusy = true
				this.parriedWhileBusy = true
			}
			return null
		}
		if (this.busy) {
			// After its own attack the goblin backs off for a full idle gap.
			// After merely being hit it only takes a short beat: resetting the
			// full gap on every hit let a steady stream of heavies stunlock it
			// so it never swung at all.
			// An attack that went unanswered may roll straight into a second
			// one, so the player cannot relax the moment a hit resolves.
			let gap = this.attackedWhileBusy
				? this.idleGap()
				: this.profile.recoverMs
			this.queued = null
			if (
				this.attackedWhileBusy &&
				!this.parriedWhileBusy &&
				this.rng() < this.profile.chainChance
			) {
				gap = this.profile.chainGapMs
				this.queued = ENEMY_ATTACKS.slash
			}
			this.busy = false
			this.attackedWhileBusy = false
			this.parriedWhileBusy = false
			this.nextActionAt = now + gap
		}
		if (now < this.nextActionAt) return null

		let choice = this.queued
		if (!choice && opponentLoaded && this.rng() < this.profile.readChance) {
			choice = ENEMY_ATTACKS.lunge
		}
		choice ??=
			this.rng() < this.profile.lungeChance
				? ENEMY_ATTACKS.lunge
				: ENEMY_ATTACKS.slash
		this.queued = null
		return choice
	}

	private idleGap(): number {
		const { idleMinMs, idleMaxMs } = this.profile
		return idleMinMs + this.rng() * (idleMaxMs - idleMinMs)
	}
}
