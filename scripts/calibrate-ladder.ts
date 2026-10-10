/**
 * Ladder calibration: `pnpm calibrate:ladder`.
 *
 *   pnpm calibrate:ladder               the shipped ladder, measured on the check seeds
 *   pnpm calibrate:ladder -- --search   per level, the goblin HP that puts a
 *                                       target-speed player at 72.5 %, on the
 *                                       search seeds (the derivation input)
 *
 * The goal, per level: a Hero player-bot typing at the level's `targetWpm`
 * beats the goblin 65-80 % of the time, and at 0.75 x targetWpm wins at most
 * 35 %. Every match is a fixed-seed `simulateMatch` through `ladderWinRate`,
 * the same function the ladder test calls.
 *
 * The search seeds and the check seeds are different families (see
 * `LADDER_CHECK_SEED`). The default mode is the confirmation: it measures the
 * formulas in `duelLevels.ts` on the seeds the test uses.
 */

import {
	LADDER_CHECK_SEED,
	ladderWinRate,
	type LadderPoint,
} from '../src/systems/duel/balance'
import {
	MAX_LEVEL,
	duelLevel,
	type DuelLevel,
} from '../src/systems/duel/duelLevels'
import { loadWordPicker } from '../src/systems/duel/__tests__/wordsFixture'

/** Matches per point when confirming. */
const N = 200
/** Matches per point when searching. More than `N`, since the search is noisy at 200. */
const SEARCH_N = 600
/** Seed family the goblin HP is searched on. Not the check family. */
const SEARCH_SEED = 1
/** Win rate the search aims for at the level's target speed. */
const SEARCH_AIM = 0.725
/** The pass band the ladder test enforces. */
const AT_TARGET_MIN = 0.65
const AT_TARGET_MAX = 0.8
const SLOW_MAX = 0.35
/** The slow point: the player types this share of the target speed. */
const SLOW_SHARE = 0.75

const pick = loadWordPicker()

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`

function slowWpmOf(lv: DuelLevel): number {
	return Math.round(lv.targetWpm * SLOW_SHARE)
}

/** Goblin HP at which the target-speed player wins `SEARCH_AIM` of matches. */
function searchHp(lv: DuelLevel): number {
	// Win rate falls as goblin HP rises, so bisect on the share of wins.
	let lo = 20
	let hi = 2000
	while (hi - lo > 2) {
		const mid = Math.round((lo + hi) / 2)
		const rate = ladderWinRate(
			{ ...lv, goblinHp: mid },
			lv.targetWpm,
			SEARCH_N,
			SEARCH_SEED,
			pick,
		).rate
		if (rate > SEARCH_AIM) lo = mid
		else hi = mid
	}
	return Math.round((lo + hi) / 2)
}

function confirm(): void {
	const rows = []
	for (let n = 1; n <= MAX_LEVEL; n++) {
		const lv = duelLevel(n)
		const at = ladderWinRate(lv, lv.targetWpm, N, LADDER_CHECK_SEED, pick)
		const slow = ladderWinRate(
			lv,
			slowWpmOf(lv),
			N,
			LADDER_CHECK_SEED,
			pick,
		)
		rows.push(row(lv, at, slow))
	}
	console.log(
		`\nshipped ladder, check seeds ${LADDER_CHECK_SEED}.., n=${N} per point`,
	)
	console.table(rows)
	const failing = rows.filter((r) => r.band !== 'ok').map((r) => r.level)
	console.log(
		failing.length === 0
			? 'every level inside the band'
			: `outside the band: levels ${failing.join(', ')}`,
	)
}

function search(): void {
	const rows = []
	for (let n = 1; n <= MAX_LEVEL; n++) {
		const lv = duelLevel(n)
		const hp = searchHp(lv)
		const tuned = { ...lv, goblinHp: hp }
		const at = ladderWinRate(
			tuned,
			lv.targetWpm,
			SEARCH_N,
			SEARCH_SEED,
			pick,
		)
		const slow = ladderWinRate(
			tuned,
			slowWpmOf(lv),
			SEARCH_N,
			SEARCH_SEED,
			pick,
		)
		rows.push({ ...row(tuned, at, slow), shipped: lv.goblinHp })
	}
	console.log(
		`\ngoblin HP searched for ${pct(SEARCH_AIM)} at target, seeds ${SEARCH_SEED}.., n=${SEARCH_N}`,
	)
	console.table(rows)
}

function row(lv: DuelLevel, at: LadderPoint, slow: LadderPoint) {
	const band =
		at.rate >= AT_TARGET_MIN &&
		at.rate <= AT_TARGET_MAX &&
		slow.rate <= SLOW_MAX
			? 'ok'
			: 'out'
	return {
		level: lv.level,
		targetWpm: lv.targetWpm,
		goblinHp: lv.goblinHp,
		botWpm: lv.bot.wpm,
		parryChance: lv.bot.parryChance,
		windupScale: lv.windupScale,
		'win@target': pct(at.rate),
		[`win@${SLOW_SHARE}x`]: pct(slow.rate),
		capped: `${at.capped}/${slow.capped}`,
		band,
	}
}

if (process.argv.includes('--search')) search()
else confirm()
