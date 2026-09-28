import {
	TUNING,
	budgetMsFor,
	levelForWords,
	retryBudgetFactor,
	speedForBudget,
	timeBankMultiplier,
	type DifficultyProfile,
} from './tuning'

export interface TypingSample {
	/** ms since the run started. */
	atMs: number
	correct: number
	total: number
}

/**
 * All run-scoped state and the scoring rules that act on it.
 *
 * Kept free of Phaser so the balance can be reasoned about (and tested)
 * without booting a renderer.
 */
export class RunState {
	score = 0
	combo = 0
	maxCombo = 0
	lives: number
	wordsCompleted = 0
	level = 1
	/**
	 * How many times the monster has reached the player on the current word.
	 *
	 * Reset on every completed word, and it is what makes a retry cost a tighter
	 * clock rather than a brand-new word. See `retryBudgetFactor`.
	 */
	retreats = 0

	/** Player-selected monster-speed assist, as a fraction of the fair speed. */
	readonly assistLevel: number

	/** Rolling window of keystrokes, used for live WPM/accuracy. */
	private samples: TypingSample[] = []
	private totalCorrect = 0
	private totalKeystrokes = 0
	private runStartMs = 0
	/** Set by the scene each frame so the clock can be read on demand. */
	private lastKnownMs = 0
	/** Freezes the run clock during pauses. */
	private pausedAccumMs = 0
	private pausedAt: number | null = null

	/** Multiplier window for accuracy, in ms. */
	private static readonly WINDOW_MS = 5000

	constructor(
		public readonly difficulty: DifficultyProfile,
		startMs: number,
		/**
		 * Monster-speed assist as a fraction of the fair budget, 0.1 - 1.
		 *
		 * This is a player setting rather than a difficulty property: it is an
		 * accessibility knob that applies on top of whatever mode is selected.
		 * Clamped in the constructor so a corrupt save cannot produce a speed
		 * the fairness model never accounted for.
		 */
		assistLevel = 1,
	) {
		this.lives = difficulty.lives
		this.runStartMs = startMs
		this.lastKnownMs = startMs
		this.assistLevel = Math.min(1, Math.max(0.1, assistLevel))
	}

	/**
	 * Wall-clock run duration in ms, excluding paused time and the countdown.
	 *
	 * Derived from `runStartMs` each read rather than accumulated, so a `tick`
	 * that lands between the death and the results screen cannot under-report
	 * the run.
	 */
	get elapsedMs(): number {
		// While paused the clock is held at the moment of the pause.
		const now = this.pausedAt ?? this.lastKnownMs
		return Math.max(0, now - this.runStartMs - this.pausedAccumMs)
	}

	/**
	 * Begin the clock. Called when the countdown ends, not at scene create, so
	 * reading the instructions is never billed as play time.
	 */
	startClock(nowMs: number): void {
		this.runStartMs = nowMs
		this.pausedAccumMs = 0
		this.pausedAt = null
		this.lastKnownMs = nowMs
	}

	get wpm(): number {
		const elapsed = this.elapsedMs / 60000
		if (elapsed <= 0) return 0
		return Math.round(this.totalCorrect / 5 / elapsed)
	}

	/** Accuracy over the rolling window, not the whole run — it should react. */
	get accuracy(): number {
		if (this.samples.length === 0) return 100
		let correct = 0
		let total = 0
		for (const s of this.samples) {
			correct += s.correct
			total += s.total
		}
		if (total === 0) return 100
		return Math.round((correct / total) * 100)
	}

	/** True once the player has made at least one keystroke. */
	get hasInput(): boolean {
		return this.totalKeystrokes > 0
	}

	recordKeystroke(correct: boolean, nowMs: number): void {
		this.totalKeystrokes++
		if (correct) this.totalCorrect++
		this.samples.push({
			atMs: nowMs,
			correct: correct ? 1 : 0,
			total: 1,
		})
		this.pruneSamples(nowMs)
	}

	private pruneSamples(nowMs: number): void {
		const cutoff = nowMs - RunState.WINDOW_MS
		while (this.samples.length > 0 && this.samples[0].atMs < cutoff) {
			this.samples.shift()
		}
	}

	tick(nowMs: number): void {
		this.lastKnownMs = nowMs
	}

	pause(nowMs: number): void {
		if (this.pausedAt === null) this.pausedAt = nowMs
	}

	resume(nowMs: number): void {
		if (this.pausedAt !== null) {
			this.pausedAccumMs += nowMs - this.pausedAt
			this.pausedAt = null
		}
	}

	/**
	 * How long the player has to type `word`, in ms.
	 *
	 * This is the *fair* budget, before the accessibility assist and before any
	 * mid-word hits. Kept separate from `speedFor` so the fairness tests can
	 * reason about the unassisted contract while the scene gets the real number.
	 */
	budgetFor(word: string): number {
		return budgetMsFor(word.length, this.level, this.difficulty)
	}

	/**
	 * The budget actually in play: the fair one, shortened by every hit already
	 * taken on this word.
	 */
	liveBudgetMsFor(word: string): number {
		return Math.max(
			TUNING.minBudgetMs,
			this.budgetFor(word) * retryBudgetFactor(this.retreats),
		)
	}

	/**
	 * Monster speed in px/sec for a given word.
	 *
	 * `assistLevel` scales the *speed*, not the budget, so a player who needs
	 * more time gets a slower monster rather than a mislabelled timer. Clamped
	 * to (0, 1] because a value above 1 would demand a speed the fairness model
	 * has not accounted for.
	 */
	speedFor(word: string): number {
		return speedForBudget(this.liveBudgetMsFor(word)) * this.assistLevel
	}

	/** Record a mid-word hit so the retry is tighter than the first attempt. */
	registerRetreat(): void {
		this.retreats++
	}

	/**
	 * Resolve one completed word.
	 *
	 * @param wordLength    length of the finished word
	 * @param mistakes      wrong keystrokes on that word
	 * @param nearMiss      true if the kill landed in the last sliver of travel
	 * @param bankedShovePx knockback still on the monster at the moment of the
	 *                       kill; converted to score via `timeBankMultiplier`
	 *                       so that holding the monster off actually pays
	 */
	completeWord(
		wordLength: number,
		mistakes: number,
		nearMiss: boolean,
		bankedShovePx = 0,
	): {
		earned: number
		levelledUp: boolean
		perfect: boolean
		bankedSec: number
		banked: boolean
	} {
		const perfect = mistakes === 0
		const comboTier = Math.floor(this.combo / 10)
		const comboMultiplier = 1 + comboTier * TUNING.comboTierBonus

		// Convert the shove to seconds using the speed this word actually ran at,
		// so the reward means the same thing regardless of difficulty or length.
		const speed = Math.max(1, this.speedFor('x'.repeat(wordLength)))
		const bankedSec = bankedShovePx / speed
		const bankMultiplier = timeBankMultiplier(bankedShovePx, speed)

		let earned = TUNING.scorePerChar * wordLength * comboMultiplier
		if (perfect) earned *= TUNING.perfectBonus
		if (nearMiss) earned *= TUNING.nearMissBonus
		earned *= bankMultiplier
		earned = Math.floor(earned)

		this.score += earned
		this.combo++
		this.maxCombo = Math.max(this.maxCombo, this.combo)
		this.wordsCompleted++
		// A new word starts with a full clock.
		this.retreats = 0

		const prevLevel = this.level
		this.level = levelForWords(this.wordsCompleted)

		return {
			earned,
			levelledUp: this.level > prevLevel,
			perfect,
			bankedSec,
			banked: bankedSec > 0.15,
		}
	}

	/** @returns true if the run just ended. */
	loseLife(): boolean {
		this.combo = 0
		this.lives--
		return this.lives <= 0
	}
}
