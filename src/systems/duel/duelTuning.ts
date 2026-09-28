/**
 * Balance table for duel mode.
 *
 * Kept apart from the runner's `TUNING` so the two modes can be balanced
 * independently while the prototype is being playtested.
 */

import {
	budgetMsFor,
	type DifficultyId,
	type DifficultyProfile,
} from '../tuning'

export type Side = 'p1' | 'p2'

export const other = (side: Side): Side => (side === 'p1' ? 'p2' : 'p1')

/** The player's offensive options. Each one is a word card on screen. */
export type MoveId = 'jab' | 'heavy' | 'special'

export interface MoveDef {
	id: MoveId
	label: string
	/** Index into `WORD_TIERS`, which fixes the word length for this move. */
	tier: number
	damage: number
	/** Delay between finishing the word and the hit landing. */
	startupMs: number
	/** A move that lands during the target's windup cancels that attack. */
	interrupts: boolean
	/** Meter spent to use the move. */
	meterCost: number
	/** Hit reaction applied to the target. */
	hitstunMs: number
}

/**
 * The core trade-off: short words are safe and weak, long words hit hard but
 * leave you typing for longer while the goblin is winding up.
 */
export const MOVES: Record<MoveId, MoveDef> = {
	jab: {
		id: 'jab',
		label: 'JAB',
		tier: 0,
		damage: 4,
		startupMs: 110,
		interrupts: false,
		meterCost: 0,
		hitstunMs: 220,
	},
	heavy: {
		id: 'heavy',
		label: 'HEAVY',
		tier: 2,
		damage: 13,
		startupMs: 160,
		interrupts: true,
		meterCost: 0,
		hitstunMs: 420,
	},
	special: {
		id: 'special',
		label: 'SPECIAL',
		tier: 3,
		damage: 26,
		startupMs: 200,
		interrupts: true,
		meterCost: 100,
		hitstunMs: 900,
	},
}

export type EnemyAttackId = 'slash' | 'lunge' | 'punish'

export interface EnemyAttackDef {
	id: EnemyAttackId
	label: string
	/** Tier of the block word the player must type to parry it. */
	blockTier: number
	damage: number
	/** Multiplier on the fair typing budget for the block word. */
	windupScale: number
	interrupts: boolean
	/** Heavies will not stop it; it has to be parried. */
	armored: boolean
	hitstunMs: number
}

export const ENEMY_ATTACKS: Record<EnemyAttackId, EnemyAttackDef> = {
	slash: {
		id: 'slash',
		label: 'SLASH',
		blockTier: 0,
		damage: 8,
		windupScale: 1,
		interrupts: false,
		armored: false,
		hitstunMs: 300,
	},
	lunge: {
		id: 'lunge',
		label: 'LUNGE',
		blockTier: 1,
		damage: 15,
		windupScale: 1.1,
		interrupts: true,
		armored: true,
		hitstunMs: 520,
	},
	/** Thrown when the player fumbles a key. Quick, but short word to parry. */
	punish: {
		id: 'punish',
		label: 'PUNISH',
		blockTier: 0,
		damage: 6,
		windupScale: 0.85,
		interrupts: true,
		armored: false,
		hitstunMs: 300,
	},
}

export const DUEL = {
	maxHp: 100,
	maxMeter: 100,
	roundsToWin: 2,
	roundTimeMs: 75_000,
	/** Countdown before each round, handled by the scene. */
	introMs: 1800,
	/** Pause after a KO before the next round starts. */
	roundOverMs: 2200,

	/** How long a parried fighter stays open. Hits during it are counters. */
	parryStaggerMs: 1300,
	counterMultiplier: 1.5,
	/** A word finished without ever mistyping. */
	perfectMultiplier: 1.2,

	meterOnHit: 8,
	meterOnPerfect: 6,
	meterOnParry: 25,
	/** Getting hit builds a little meter, so a losing player has a way back. */
	meterOnTakeHit: 5,
	meterOnMistake: -3,
} as const

/**
 * How long the goblin telegraphs an attack before it lands.
 *
 * Reuses the runner's fairness budget, so on every difficulty the block word
 * is typeable at the pace that difficulty promises. Later rounds tighten it
 * by treating them as a higher level.
 */
export function enemyWindupMs(
	blockWordLength: number,
	attack: EnemyAttackDef,
	difficulty: DifficultyProfile,
	round: number,
): number {
	const level = 1 + (Math.max(1, round) - 1) * 4
	return budgetMsFor(blockWordLength, level, difficulty) * attack.windupScale
}

/** Goblin damage multiplier per difficulty, paired with `goblinFor`. */
export const ENEMY_DAMAGE_SCALE: Record<DifficultyId, number> = {
	easy: 0.8,
	medium: 1,
	hard: 1.25,
	'i-am-god': 1.5,
}
