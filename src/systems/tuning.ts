/**
 * Central tuning table for the game.
 *
 * Everything the designer touches lives here. No magic numbers in gameplay code.
 */

export type DifficultyId = 'easy' | 'medium' | 'hard' | 'i-am-god'

export interface DifficultyProfile {
	id: DifficultyId
	label: string
	/**
	 * Milliseconds the player is allotted per character of the word, at level 1.
	 * Lower = harder. 330ms ~= 180 CPM, which is a brisk-but-fair casual pace.
	 */
	msPerChar: number
	/** Starting lives. */
	lives: number
	/** Hue used for this difficulty in the menu + level banner. */
	color: number
}

/**
 * The difficulty contract:
 *
 *   timeBudget = reactionMs + wordLength * msPerChar * levelDecay
 *   speed      = travelDistance / timeBudget        (pixels per SECOND)
 *
 * Because speed is *derived* from the word rather than ramped independently,
 * a run is always theoretically completable at the difficulty you chose.
 */
export const DIFFICULTIES: Record<DifficultyId, DifficultyProfile> = {
	easy: {
		id: 'easy',
		label: 'Easy',
		msPerChar: 430,
		lives: 4,
		color: 0x00e676,
	},
	medium: {
		id: 'medium',
		label: 'Medium',
		msPerChar: 335,
		lives: 3,
		color: 0x64ffda,
	},
	hard: {
		id: 'hard',
		label: 'Hard',
		msPerChar: 250,
		lives: 2,
		color: 0xffb300,
	},
	'i-am-god': {
		id: 'i-am-god',
		label: 'I am God',
		msPerChar: 190,
		lives: 1,
		color: 0xff5252,
	},
}

export const TUNING = {
	/** Fixed reading/reaction allowance added to every word's budget. */
	reactionMs: 620,
	/** Absolute floor on a word's budget so 3-letter words stay readable. */
	minBudgetMs: 1150,

	/**
	 * Budget multiplier applied *each* time the monster reaches you mid-word.
	 *
	 * The retry keeps the same word, so the cost of a hit is a tighter clock
	 * rather than a fresh word plus a lost life. Previously `takeHit` re-dealt a
	 * random word, which taxed the player three times over (life, combo, and
	 * the progress on a word they could already read).
	 */
	retryBudgetPenalty: 0.85,
	/**
	 * Floor on the stacked retry multiplier. Without it, a long streak of hits
	 * on a long word would eventually demand an impossible typing speed, which
	 * is exactly the failure mode the fairness tests exist to prevent.
	 */
	retryBudgetPenaltyFloor: 0.45,

	/**
	 * Per-level decay applied to msPerChar. 0.985^n means the pace tightens
	 * smoothly and reaches the floor (0.5) around level 47.
	 */
	levelDecay: 0.985,
	/** Never let msPerChar fall below this fraction of the base. */
	minDecayFactor: 0.5,

	/** Words completed per level-up. */
	wordsPerLevel: 5,

	/** Distance the monster travels from spawn to the avatar. */
	travelDistance: 1260,
	/** Where the avatar stands. */
	avatarX: 120,

	/**
	 * Pixels the monster is shoved backwards per correct keystroke.
	 * This is what makes typing feel like a weapon rather than a timer.
	 *
	 * The shove is a *bank*, not a spring: it does not bleed off. It survives
	 * until the monster dies, then converts to score via `timeBankMultiplier`.
	 *
	 * The previous model bled 110px/second while granting 14px/key. That put the
	 * break-even typing rate at 7.9 keys/sec (~94 WPM), so for anyone below that
	 * — i.e. most players — the accumulated shove decayed to zero faster than it
	 * was ever built. The "typing is your weapon" fantasy was not present in the
	 * simulation at all.
	 *
	 * Bounded by design: the monster's position is
	 * `spawn - travel - knockback`, and travel always accumulates, so a capped
	 * knockback can delay the monster but can never stall it. At the cap below
	 * that headroom is 33% of the crossing, so a strong run visibly buys time
	 * without letting a fast typist stall out.
	 */
	knockbackPx: 36,
	/**
	 * Hard cap on banked knockback. Below `travelDistance` so it cannot stall.
	 *
	 * 480/36 = 13 keystrokes, so any word up to 13 characters banks its full
	 * shove and never touches the cap. Past that the cap deliberately truncates:
	 * an unbounded shove on a 20-letter word would let a patient typist stall the
	 * run outright.
	 *
	 * The grant is set so that even the *worst* case in the game — a 4-letter
	 * word on I am God, where the monster is fastest — still banks more than a
	 * sixth of a second of travel. Below ~36px/key the payout was effectively
	 * invisible on short words, because the fixed reaction allowance dominates a
	 * short word's budget and dilutes the shove.
	 */
	maxKnockbackPx: 480,
	/**
	 * Score bonus per *second* of travel the player pushed back, and the ceiling
	 * on that bonus. Scored in seconds rather than pixels so the reward means
	 * the same thing on a 3-letter word and a 12-letter one.
	 */
	timeBankBonusPerSec: 0.5,
	timeBankBonusCap: 0.6,
	/** Seconds of banked shove before the HUD readout appears. */
	timeBankShowThreshold: 0.15,

	/** Multiplier spike applied to speed for 450ms after a mistype. */
	mistakeSpeedSpike: 1.18,
	mistakeSpikeMs: 450,

	/** Base score for a word before multipliers. */
	scorePerChar: 12,
	/** Score multiplier granted at each combo tier. */
	comboTierBonus: 0.25,
	/** Bonus multiplier for a word typed with zero mistakes. */
	perfectBonus: 1.5,
	/** Bonus multiplier when the monster is killed in its last 22% of travel. */
	nearMissBonus: 1.35,
	/** Fraction of travel distance counted as the "near miss" window. */
	nearMissFraction: 0.22,

	/** Seconds of invulnerability after taking a hit. */
	hitInvulnSec: 1.35,
	/** Seconds of hitstop (frozen simulation) on a successful kill. */
	killHitstopMs: 70,

	/** Chance a killed monster drops a power-up. */
	powerUpDropChance: 0.16,
	/** Chance of ice vs bomb, given a drop happens. */
	powerUpTypeWeights: { ice: 0.5, bomb: 0.5 } as Record<
		'ice' | 'bomb',
		number
	>,
	/** Seconds the ice power-up freezes all monsters. */
	iceDurationSec: 2.2,

	/** Distance at which the danger telegraph activates. */
	dangerThreshold: 230,
} as const

/** Word length tiers, ordered easiest first. */
export interface WordTier {
	name: string
	minLen: number
	maxLen: number
}

/**
 * Which tier a word belongs to. `THESAURUS` ships five buckets whose lengths
 * line up with these bounds.
 */
export const WORD_TIERS: WordTier[] = [
	{ name: 'three', minLen: 1, maxLen: 3 },
	{ name: 'small', minLen: 4, maxLen: 5 },
	{ name: 'medium', minLen: 6, maxLen: 8 },
	{ name: 'big', minLen: 9, maxLen: 11 },
	{ name: 'large', minLen: 12, maxLen: 99 },
]

/**
 * Pick a word tier for a given run position.
 *
 * Ramping by *completed words* (not by adding a difficulty offset) means a run
 * always eases the player in from 3-letter words regardless of difficulty —
 * the difficulty setting changes pace, not whether the game is playable.
 */
export function tierForWordsCompleted(completed: number): number {
	if (completed < 6) return 0
	if (completed < 16) return 1
	if (completed < 32) return 2
	if (completed < 52) return 3
	return 4
}

/** Level derived from words completed. Level 1 at the start of a run. */
export function levelForWords(completed: number): number {
	return Math.floor(completed / TUNING.wordsPerLevel) + 1
}

/**
 * The heart of the fairness model: how long the player gets for this word.
 *
 * msPerChar tightens with level but never below `minDecayFactor`, and the
 * result is floored at `minBudgetMs` so short words remain readable.
 */
export function budgetMsFor(
	wordLength: number,
	level: number,
	difficulty: DifficultyProfile,
): number {
	const decay = Math.max(
		TUNING.minDecayFactor,
		Math.pow(TUNING.levelDecay, Math.max(0, level - 1)),
	)
	const budget = TUNING.reactionMs + wordLength * difficulty.msPerChar * decay
	return Math.max(TUNING.minBudgetMs, budget)
}

/**
 * The monster speed, in pixels per SECOND, that spends exactly the word's
 * budget crossing the screen. This is frame-rate independent by construction.
 */
export function speedForBudget(budgetMs: number): number {
	return TUNING.travelDistance / (budgetMs / 1000)
}

/**
 * Budget after stacking `retreats` mid-word hits.
 *
 * Kept as a pure function so the "still winnable after a hit" invariant can be
 * asserted directly rather than inferred from the scene.
 */
export function retryBudgetFactor(retreats: number): number {
	const stacked = Math.pow(TUNING.retryBudgetPenalty, Math.max(0, retreats))
	return Math.max(TUNING.retryBudgetPenaltyFloor, stacked)
}

/**
 * Score multiplier earned by how far the player pushed the monster back.
 *
 * @param knockbackPx  banked shove at the moment of the kill
 * @param speedPxPerSec  the monster's speed for this word
 */
export function timeBankMultiplier(
	knockbackPx: number,
	speedPxPerSec: number,
): number {
	if (knockbackPx <= 0 || speedPxPerSec <= 0) return 1
	const bankedSec = knockbackPx / speedPxPerSec
	return (
		1 +
		Math.min(
			TUNING.timeBankBonusCap,
			bankedSec * TUNING.timeBankBonusPerSec,
		)
	)
}
