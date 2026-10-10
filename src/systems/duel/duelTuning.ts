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

	/**
	 * How long a parried fighter stays open. Hits during it are counters.
	 * 600 ms (was 1300). Chosen by the sweeps (`scripts/out/sweep-v3.json`),
	 * together with the partial block and staling below. A full-cancel parry
	 * made parrying dominant at high WPM.
	 */
	parryStaggerMs: 600,
	/** Damage multiplier on hits that land during a parry stagger. */
	counterMultiplier: 1.5,
	/** A word finished without ever mistyping. */
	perfectMultiplier: 1.2,

	meterOnHit: 8,
	meterOnPerfect: 6,
	/**
	 * Meter for a successful parry (was 25). Chosen by the sweeps with the
	 * other parry rules (`scripts/out/sweep-v3.json`).
	 */
	meterOnParry: 12,
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
	/**
	 * Parry word handling. 0: switching from a clean attack word to the block
	 * word suspends the attack and it resumes after the block. 1: the switch
	 * resets the attack word, so a parry costs its progress and nothing resumes.
	 * Default 0, chosen by the sweeps (`scripts/out/sweep-v3.json`): it keeps
	 * the parry cost low, so the reward rules are what decide a parry.
	 */
	parryResetsWord: 0,
	/**
	 * Share of a parried attack's base damage the defender still takes when the
	 * parry succeeds. Default 0.5, chosen by the sweeps
	 * (`scripts/out/sweep-v3.json`). A full-cancel parry made parrying dominant
	 * at high WPM. Partial blocks stop that, and they stack with the passive
	 * chip. A non-zero share can KO.
	 */
	blockDamageShare: 0.5,
	/**
	 * Move staling, as in Smash Bros. Each consecutive successful use of the
	 * same move multiplies that attack's base damage by `staleFactor` once
	 * more: with 0.8 the second repeat deals 0.8x, the third 0.64x. A different
	 * move in between, or a new round, resets the count. 1 turns staling off.
	 * Default 0.8, chosen by the sweeps (`scripts/out/sweep-v3.json`). With
	 * partial blocks it makes mixing moves beat any single-move style for the
	 * hero at 40, 70 and 100 WPM.
	 */
	staleFactor: 0.8,
	/** Lowest multiplier staling can reach. */
	staleFloor: 0.4,
	/** Each later round of a match tightens the telegraph by this much. */
	roundTightening: 0.05,
} as const

/**
 * A full set of duel rule values, keyed like `DUEL`. Typed as plain numbers
 * (not the literal types `as const` gives DUEL) so the balance harness can
 * override any of them.
 */
export type DuelRules = { -readonly [K in keyof typeof DUEL]: number }
