/**
 * The duel ladder.
 *
 * Levels replace the runner's difficulty picker. There are no lives in a
 * duel: every level is the same best-of-three, and what changes is how fast
 * you must type to parry, how often the goblin swings, how hard it hits, and
 * how well it reads you. Beating a level unlocks the next.
 */

import { GOBLIN, type BrainProfile } from './goblinBrain'
import { DUEL } from './duelTuning'

export const MAX_LEVEL = 12

export interface DuelLevel {
	level: number
	title: string
	/** Typing speed the block words are budgeted for. */
	targetWpm: number
	/** Milliseconds per character that `targetWpm` implies. */
	msPerChar: number
	/** Multiplier on the goblin's damage. */
	damageScale: number
	/** The goblin's health. The player always has `DUEL.maxHp`. */
	goblinHp: number
	/** Time to notice a telegraph and switch to the block word. */
	reactionMs: number
	brain: BrainProfile
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
 * Everything about a level, interpolated from level 1 to `MAX_LEVEL`.
 *
 * Every knob moves in the same direction, so a higher level is never easier
 * in any respect.
 */
export function duelLevel(level: number): DuelLevel {
	const n = clampLevel(level)
	const t = (n - 1) / (MAX_LEVEL - 1)
	const targetWpm = Math.round(lerp(22, 95, t))
	return {
		level: n,
		title: TITLES[n - 1],
		targetWpm,
		// A "word" is five characters, so ms per char = 60000 / (wpm * 5).
		msPerChar: 12_000 / targetWpm,
		damageScale: lerp(1.3, 1.45, t),
		// Your damage per second rises with your typing speed, so the goblin's
		// health has to as well, or a typist just above a level's target
		// deletes it before parrying ever matters.
		// The extra ramp keeps top levels from being won well under target.
		goblinHp: Math.round(
			((DUEL.maxHp * targetWpm) / HP_PER_WPM) * lerp(1, 1.05, t),
		),
		// Beginners need longer to notice a telegraph and switch words.
		reactionMs: Math.round(lerp(900, 520, t)),
		brain: {
			...GOBLIN,
			// Level 1 leaves room to finish a heavy between swings even at
			// beginner speed; by the top there is barely a breath.
			idleMinMs: lerp(1900, 450, t),
			idleMaxMs: lerp(3200, 1000, t),
			lungeChance: lerp(0.25, 0.4, t),
			punishChance: lerp(0.35, 0.7, t),
			chainChance: lerp(0.15, 0.45, t),
			readChance: lerp(0.35, 0.9, t),
		},
	}
}
