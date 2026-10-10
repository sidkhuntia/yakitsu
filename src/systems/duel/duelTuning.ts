/**
 * Balance table for duel mode.
 *
 * Kept apart from the runner's `TUNING` so the two modes can be balanced
 * independently while the prototype is being playtested.
 */

export type Side = 'p1' | 'p2'

export const other = (side: Side): Side => (side === 'p1' ? 'p2' : 'p1')

/** The offensive options every fighter has. Each one is a word card on screen. */
export type MoveId = 'jab' | 'heavy' | 'special'

export const DUEL = {
	maxHp: 100,
	maxMeter: 100,
	roundsToWin: 2,
	roundTimeMs: 75_000,
	/** Fixed reaction allowance in every goblin telegraph. */
	windupReactionMs: 380,
	/** Floor on a telegraph, so 3-letter block words stay readable. */
	minWindupMs: 850,

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

	/**
	 * Hits landing within this window of the previous one form a chain, and
	 * each link shortens the hitstun. Without it a fast enough stream of jabs
	 * kept the target stunned forever.
	 */
	chainWindowMs: 900,
	hitstunDecayPerHit: 0.34,
	/** No attack for this long and you count as passive. */
	passiveMs: 10_000,
	/** Share of a parried attack's damage a passive fighter still takes. */
	passiveChip: 0.4,
	/** Each later round of a match tightens the telegraph by this much. */
	roundTightening: 0.05,
} as const

/**
 * A full set of duel rule values, keyed like `DUEL`. Typed as plain numbers
 * (not the literal types `as const` gives DUEL) so the balance harness can
 * override any of them.
 */
export type DuelRules = { -readonly [K in keyof typeof DUEL]: number }
