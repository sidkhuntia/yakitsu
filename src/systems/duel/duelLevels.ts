/**
 * The duel ladder.
 *
 * Levels replace the runner's difficulty picker. There are no lives in a
 * duel: every level is the same best-of-three. What changes is how fast you
 * must type to parry, how long the goblin telegraphs its swings, how well the
 * typist bot types and parries, and how much health the goblin has. Beating a
 * level unlocks the next.
 *
 * The numbers are calibrated against the symmetric rules, not the old
 * one-sided ones. The goal per level: a Hero typing at `targetWpm` beats the
 * goblin 65-80 % of the time, and at 0.75 x `targetWpm` wins at most 35 %.
 * `pnpm calibrate:ladder` measures this, and the ladder test enforces it on
 * levels 1, 6 and 12.
 */

import { FIGHTERS, type FighterDef } from './fighters'
import { botProfile, type BotProfile } from './typistBot'
import { WORD_TIERS } from '../tuning'

export const MAX_LEVEL = 12

export interface DuelLevel {
	level: number
	title: string
	/** Typing speed the block words are budgeted for. */
	targetWpm: number
	/** Milliseconds per character that `targetWpm` implies. */
	msPerChar: number
	/** The goblin's health. The player keeps the hero's own health. */
	goblinHp: number
	/** Time to notice a telegraph and switch to the block word. */
	reactionMs: number
	/** Multiplier on the goblin's windups; see `requiredWindupScale`. */
	windupScale: number
	/** The typist bot that plays the goblin. */
	bot: BotProfile
}

const TITLES = [
	'Goblin Whelp',
	'Goblin Scrapper',
	'Goblin Scout',
	'Goblin Raider',
	'Goblin Cutthroat',
	'Goblin Duelist',
	'Goblin Veteran',
	'Goblin Reaver',
	'Goblin Champion',
	'Goblin Warlord',
	'Goblin Blademaster',
	'Goblin King',
]

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * The goblin types at this share of the level's target speed. Below the
 * target, so a player typing at target is not outpaced by the goblin.
 */
const GOBLIN_WPM_SHARE = 0.85

/**
 * The goblin parries at this rate on every level, held flat on purpose. A
 * goblin that parries more needs less HP to hold a target-speed player at
 * 72.5 %. A rising parry curve would therefore make the HP fall toward the top
 * of the ladder, and the ladder must not get easier as it rises. The difficulty
 * lives in the HP curve, fitted with this parry rate (see `goblinHp` below).
 */
const GOBLIN_PARRY = 0.25

export function clampLevel(level: number): number {
	if (!Number.isFinite(level)) return 1
	return Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)))
}

/**
 * The smallest windup multiplier, never below 1, that makes every parryable
 * move of `fighter` fair at `wpm`. A move is fair when its reaction allowance
 * plus the longest word of its block tier, typed at `wpm`, fits inside its
 * windup.
 *
 * Rounded up to 0.001 so the bound holds exactly rather than one float ulp
 * short. Rounding up keeps the curve monotone.
 */
export function requiredWindupScale(
	fighter: FighterDef,
	wpm: number,
	reactionMs: number,
): number {
	let scale = 1
	for (const move of Object.values(fighter.moves)) {
		if (move.blockTier === null) continue
		const maxLen = WORD_TIERS[move.blockTier].maxLen
		const budget = reactionMs + maxLen * (12_000 / wpm)
		scale = Math.max(scale, budget / move.windupMs)
	}
	return Math.ceil(scale * 1000) / 1000
}

/**
 * Everything about a level, interpolated from level 1 to `MAX_LEVEL`.
 *
 * Every knob is non-decreasing in difficulty, so a higher level is never
 * easier in any respect.
 */
export function duelLevel(level: number): DuelLevel {
	const n = clampLevel(level)
	const t = (n - 1) / (MAX_LEVEL - 1)
	const targetWpm = Math.round(lerp(22, 95, t))
	const reactionMs = Math.round(lerp(900, 520, t))
	return {
		level: n,
		title: TITLES[n - 1],
		targetWpm,
		// A "word" is five characters, so ms per char = 60000 / (wpm * 5).
		msPerChar: 12_000 / targetWpm,
		// Searched so a target-speed player wins 72.5 % of matches at each level
		// (search seeds, n = 600 per point), then fitted with a saturating curve:
		// the optimum climbs steeply from level 1 and flattens toward the top.
		goblinHp: Math.round(143.6 + 59.7 * (1 - Math.exp(-3.8 * t))),
		// Beginners need longer to notice a telegraph and switch words.
		reactionMs,
		windupScale: requiredWindupScale(
			FIGHTERS.goblin,
			targetWpm,
			reactionMs,
		),
		bot: {
			...botProfile(Math.round(targetWpm * GOBLIN_WPM_SHARE), 'mixed', {
				parryChance: GOBLIN_PARRY,
			}),
		},
	}
}
