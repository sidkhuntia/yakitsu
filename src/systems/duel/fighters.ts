/**
 * The roster.
 *
 * Every fighter shares the same four cards (jab, heavy, special, block) and
 * the same rules in `DuelSim`. What differs is the numbers on each move and
 * one signature mechanic. Keeping identity in data rather than code is what
 * lets the balance harness compare any two fighters on equal terms.
 *
 * Pure data. No Phaser, no DOM.
 */

import type { MoveId } from './duelTuning'

export type FighterId = 'hero' | 'goblin' | 'skeleton' | 'mushroom' | 'eye'

export const FIGHTER_IDS: FighterId[] = [
	'hero',
	'goblin',
	'skeleton',
	'mushroom',
	'eye',
]

export interface FighterMove {
	id: MoveId
	label: string
	/** Index into `WORD_TIERS`: the word the attacker types for this move. */
	tier: number
	damage: number
	/**
	 * Time from finishing the word to the hit landing. This is the telegraph
	 * the defender sees, and the window they have to type the block word.
	 */
	windupMs: number
	/** Tier of the defender's block word, or null when it cannot be parried. */
	blockTier: number | null
	/**
	 * The typing speed at which the block word is guaranteed typeable inside
	 * the windup (see `parryBudgetOk`). Null exactly when `blockTier` is null.
	 */
	parryableAtWpm: number | null
	/** Landing during the target's windup cancels that attack. */
	interrupts: boolean
	/** Cannot be interrupted; the only answer is a parry. */
	armored: boolean
	meterCost: number
	hitstunMs: number
}

/** One mechanic per fighter. Each kind is resolved inside `DuelSim`. */
export type Signature =
	/** Each consecutive hit in a chain adds damage, up to a cap. */
	| { kind: 'combo'; bonusPerLink: number; maxBonus: number }
	/** Attacks aimed at this fighter wind up longer, so it parries more. */
	| { kind: 'guard'; incomingWindupScale: number }
	/** Takes a fixed share of damage from everything, chip and poison included. */
	| { kind: 'armor'; damageTakenScale: number }
	/** The named move leaves a poison that ticks once per second. */
	| { kind: 'poison'; move: MoveId; dps: number; durationMs: number }
	/** Every hit steals meter from the target. */
	| { kind: 'drain'; meterPerHit: number }
	/** Below a share of max HP, all damage dealt is scaled up. */
	| { kind: 'resolve'; hpThreshold: number; damageScale: number }

export interface FighterDef {
	id: FighterId
	name: string
	/** One-line flavour for the select screen. */
	title: string
	maxHp: number
	moves: Record<MoveId, FighterMove>
	signature: Signature
	/** Player-facing explanation of the signature. */
	signatureText: string
}

/** Reaction allowance assumed by `parryableAtWpm`. */
export const PARRY_REACTION_MS = 450

/**
 * The fairness invariant that replaces the old per-level windup formula:
 * the longest word in the block tier, typed at the declared speed, plus a
 * reaction allowance, must fit inside the windup.
 */
export function parryBudgetOk(
	move: FighterMove,
	blockTierMaxLen: number,
	windupScale = 1,
): boolean {
	if (move.blockTier === null || move.parryableAtWpm === null) return true
	const msPerChar = 12_000 / move.parryableAtWpm
	return (
		PARRY_REACTION_MS + blockTierMaxLen * msPerChar <=
		move.windupMs * windupScale
	)
}

const jab = (o: Partial<FighterMove>): FighterMove => ({
	id: 'jab',
	label: 'JAB',
	tier: 0,
	damage: 4,
	windupMs: 300,
	blockTier: null,
	parryableAtWpm: null,
	interrupts: false,
	armored: false,
	meterCost: 0,
	hitstunMs: 220,
	...o,
})

const heavy = (o: Partial<FighterMove>): FighterMove => ({
	id: 'heavy',
	label: 'HEAVY',
	tier: 2,
	damage: 13,
	windupMs: 1100,
	blockTier: 0,
	parryableAtWpm: 56,
	interrupts: true,
	armored: false,
	meterCost: 0,
	hitstunMs: 420,
	...o,
})

const special = (o: Partial<FighterMove>): FighterMove => ({
	id: 'special',
	label: 'SPECIAL',
	tier: 3,
	damage: 26,
	windupMs: 1300,
	blockTier: 1,
	parryableAtWpm: 71,
	interrupts: true,
	armored: true,
	meterCost: 100,
	hitstunMs: 900,
	...o,
})

/**
 * Balance-tuned roster. Every fighter uses the hero's timing, word tiers,
 * block rules, interrupts and meter costs for its jab, heavy and special.
 * Fighters differ only in maxHp, the three damages, and their signature, so
 * the balance question is numbers and mechanism, not tier or windup scaling.
 *
 * Change these numbers only with a fresh `pnpm tune` and `pnpm balance` run.
 */
export const FIGHTERS: Record<FighterId, FighterDef> = {
	hero: {
		id: 'hero',
		name: 'Hero',
		title: 'The all-rounder',
		maxHp: 100,
		moves: {
			jab: jab({}),
			heavy: heavy({}),
			special: special({}),
		},
		signature: { kind: 'resolve', hpThreshold: 0.3, damageScale: 1.2 },
		signatureText: 'Resolve: below 30% HP, every hit deals 20% more.',
	},
	goblin: {
		id: 'goblin',
		name: 'Goblin',
		title: 'Chains quick hits',
		maxHp: 94,
		moves: {
			jab: jab({ damage: 3 }),
			heavy: heavy({ damage: 15 }),
			special: special({ damage: 31 }),
		},
		signature: { kind: 'combo', bonusPerLink: 2, maxBonus: 2 },
		signatureText:
			'Combo: each hit in a quick chain adds +2 damage (max +2).',
	},
	skeleton: {
		id: 'skeleton',
		name: 'Skeleton',
		title: 'Hard to put down',
		maxHp: 106,
		moves: {
			jab: jab({ damage: 3 }),
			heavy: heavy({ damage: 12 }),
			special: special({ damage: 22 }),
		},
		signature: { kind: 'armor', damageTakenScale: 0.9 },
		signatureText: 'Bone Armor: takes 10% less damage from everything.',
	},
	mushroom: {
		id: 'mushroom',
		name: 'Mushroom',
		title: 'Slow rot',
		maxHp: 101,
		moves: {
			jab: jab({ damage: 4 }),
			heavy: heavy({ damage: 13 }),
			special: special({ damage: 25 }),
		},
		signature: {
			kind: 'poison',
			move: 'special',
			dps: 2,
			durationMs: 4500,
		},
		signatureText:
			'Spores: its special poisons for 2 damage a second, 4.5s.',
	},
	eye: {
		id: 'eye',
		name: 'Flying Eye',
		title: 'Feeds on focus',
		maxHp: 93,
		moves: {
			jab: jab({ damage: 5 }),
			heavy: heavy({ damage: 13 }),
			special: special({ damage: 21 }),
		},
		signature: { kind: 'drain', meterPerHit: 9 },
		signatureText: 'Gaze: every hit steals 9 meter from the target.',
	},
}
