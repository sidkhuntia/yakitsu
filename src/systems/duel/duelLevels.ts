/**
 * The duel ladder.
 *
 * Levels replace the runner's difficulty picker. There are no lives in a
 * duel: every level is the same best-of-three. What changes is how fast you
 * must type to parry, how long the goblin telegraphs its swings, how well the
 * typist bot types and parries, and how much health the goblin has. Beating a
 * level unlocks the next.
 */

import { FIGHTERS, type FighterDef } from './fighters'
import { DUEL } from './duelTuning'
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

/** Target WPM at which the goblin has exactly `DUEL.maxHp`. */
const HP_PER_WPM = 22

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
 * Every knob moves in the same direction, so a higher level is never easier
 * in any respect.
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
		// Your damage per second rises with your typing speed, so the goblin's
		// health has to as well, or a typist just above a level's target
		// deletes it before parrying ever matters.
		// The extra ramp keeps top levels from being won well under target.
		goblinHp: Math.round(
			((DUEL.maxHp * targetWpm) / HP_PER_WPM) * lerp(1, 1.05, t),
		),
		// Beginners need longer to notice a telegraph and switch words.
		reactionMs,
		windupScale: requiredWindupScale(
			FIGHTERS.goblin,
			targetWpm,
			reactionMs,
		),
		bot: {
			// The goblin types slower than the target, so a player typing at the
			// target speed is not outpaced by it.
			...botProfile(Math.round(targetWpm * 0.85), 'mixed'),
			parryChance: lerp(0.25, 0.8, t),
		},
	}
}
