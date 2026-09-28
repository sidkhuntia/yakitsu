/**
 * The goblin's decision-making.
 *
 * It only ever *chooses* an attack; timing and the block word are resolved by
 * the scene and the sim. That keeps the AI swappable for a network opponent:
 * both are just "something that decides when p2 attacks".
 */

import type { DuelSim } from './duelSim'
import { ENEMY_ATTACKS, type EnemyAttackDef, type Side } from './duelTuning'
import type { DifficultyId } from '../tuning'

/** Small seeded PRNG (mulberry32), so a match can be replayed exactly. */
export function seededRng(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

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
}

export const GOBLIN: BrainProfile = {
	idleMinMs: 1500,
	idleMaxMs: 3000,
	lungeChance: 0.35,
	punishChance: 0.55,
	punishDelayMs: 220,
	recoverMs: 300,
}

/**
 * Difficulty changes how often the goblin swings, not just how fast its block
 * words must be typed. Without this, anyone who could type the block words at
 * all won every match, whatever the setting.
 */
const IDLE_BY_DIFFICULTY: Record<DifficultyId, [number, number]> = {
	easy: [1700, 3000],
	medium: [1100, 2200],
	hard: [700, 1500],
	'i-am-god': [400, 1000],
}

export function goblinFor(difficulty: DifficultyId): BrainProfile {
	const [idleMinMs, idleMaxMs] = IDLE_BY_DIFFICULTY[difficulty]
	return { ...GOBLIN, idleMinMs, idleMaxMs }
}

export class GoblinBrain {
	private nextActionAt: number
	private queued: EnemyAttackDef | null = null
	/** Mid-attack or stunned on the last think(). */
	private busy = false
	/** Whether that busy stretch included one of its own attacks. */
	private attackedWhileBusy = false

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
		this.nextActionAt = now + this.idleGap()
	}

	/** The opponent fumbled. Maybe jump on it. */
	onOpponentMistake(now: number): void {
		if (this.busy || this.queued?.id === 'punish') return
		if (this.rng() >= this.profile.punishChance) return
		const at = now + this.profile.punishDelayMs
		if (at < this.nextActionAt) {
			this.nextActionAt = at
			this.queued = ENEMY_ATTACKS.punish
		}
	}

	/**
	 * Returns the attack to start now, or null. The caller starts it on the
	 * sim; the brain waits for it to resolve before scheduling the next one.
	 */
	think(now: number, sim: DuelSim): EnemyAttackDef | null {
		if (!sim.canAct(this.side, now)) {
			this.busy = true
			if (sim.fighters[this.side].pending) this.attackedWhileBusy = true
			return null
		}
		if (this.busy) {
			// After its own attack the goblin backs off for a full idle gap.
			// After merely being hit it only takes a short beat: resetting the
			// full gap on every hit let a steady stream of heavies stunlock it
			// so it never swung at all.
			const gap = this.attackedWhileBusy
				? this.idleGap()
				: this.profile.recoverMs
			this.busy = false
			this.attackedWhileBusy = false
			this.queued = null
			this.nextActionAt = Math.max(this.nextActionAt, now + gap)
		}
		if (now < this.nextActionAt) return null

		const choice =
			this.queued ??
			(this.rng() < this.profile.lungeChance
				? ENEMY_ATTACKS.lunge
				: ENEMY_ATTACKS.slash)
		this.queued = null
		return choice
	}

	private idleGap(): number {
		const { idleMinMs, idleMaxMs } = this.profile
		return idleMinMs + this.rng() * (idleMaxMs - idleMinMs)
	}
}
