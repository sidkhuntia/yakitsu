import type { DifficultyId } from './tuning'

export interface ScoreEntry {
	score: number
	date: string
	wpm?: number
	accuracy?: number
	difficulty?: DifficultyId
}

export interface DifficultyRecord {
	bestScore: number
	bestWPM: number
	bestAccuracy: number
	longestCombo: number
	runs: number
	words: number
}

export interface SaveData {
	version: number
	bestScore: number
	lastScores: ScoreEntry[]
	bestWPM: number
	bestAccuracy: number
	totalWordsTyped: number
	longestCombo: number
	totalRuns: number
	totalPlayMs: number
	/** Per-difficulty records power the "PB" rows on the menu. */
	records: Record<DifficultyId, DifficultyRecord>
	settings: Settings
	unlocks: {
		/** Combo milestones already celebrated, so banners fire once each. */
		seenMilestones: number[]
	}
}

export interface Settings {
	muted: boolean
	/** Separate channel so players can drop the music but keep the SFX. */
	musicVolume: number
	sfxVolume: number
	dyslexicFont: boolean
	lockInputOnMistake: boolean
	showDangerZone: boolean
	screenShake: boolean
	/** Caps monster speed as a fraction of the fair budget. 1 = fair, <1 = easier. */
	assistLevel: number
}

export interface RunStats {
	score: number
	wpm?: number
	accuracy?: number
	wordsCompleted?: number
	maxCombo?: number
	difficulty?: DifficultyId
	durationMs?: number
}

const STORAGE_KEY = 'yatiksu-save-v1'
const VERSION = 2

const emptyRecord = (): DifficultyRecord => ({
	bestScore: 0,
	bestWPM: 0,
	bestAccuracy: 0,
	longestCombo: 0,
	runs: 0,
	words: 0,
})

const DEFAULT_SAVE_DATA: SaveData = {
	version: VERSION,
	bestScore: 0,
	lastScores: [],
	bestWPM: 0,
	bestAccuracy: 0,
	totalWordsTyped: 0,
	longestCombo: 0,
	totalRuns: 0,
	totalPlayMs: 0,
	records: {
		easy: emptyRecord(),
		medium: emptyRecord(),
		hard: emptyRecord(),
		'i-am-god': emptyRecord(),
	},
	settings: {
		muted: false,
		musicVolume: 0.35,
		sfxVolume: 0.8,
		dyslexicFont: false,
		lockInputOnMistake: false,
		showDangerZone: true,
		screenShake: true,
		assistLevel: 1,
	},
	unlocks: { seenMilestones: [] },
}

/**
 * Read + repair the save blob.
 *
 * Every field is defaulted individually so a partially-written or older save
 * can never crash the boot path.
 */
export function loadData(): SaveData {
	const fallback: SaveData = {
		...DEFAULT_SAVE_DATA,
		records: { ...DEFAULT_SAVE_DATA.records },
		settings: { ...DEFAULT_SAVE_DATA.settings },
		unlocks: { seenMilestones: [] },
	}

	let raw: string | null = null
	try {
		raw = localStorage.getItem(STORAGE_KEY)
	} catch {
		// Private-mode / storage disabled: play with in-memory defaults.
		return fallback
	}
	if (!raw) return fallback

	try {
		const parsed = JSON.parse(raw) as Partial<SaveData>
		const records = { ...fallback.records }
		for (const key of Object.keys(records) as DifficultyId[]) {
			records[key] = { ...emptyRecord(), ...parsed.records?.[key] }
		}
		return {
			...fallback,
			...parsed,
			version: VERSION,
			records,
			settings: { ...fallback.settings, ...parsed.settings },
			unlocks: {
				seenMilestones: Array.isArray(parsed.unlocks?.seenMilestones)
					? parsed.unlocks.seenMilestones.filter(
							(n): n is number => typeof n === 'number',
						)
					: [],
			},
			lastScores: Array.isArray(parsed.lastScores)
				? parsed.lastScores.slice(0, 10)
				: [],
		}
	} catch {
		return fallback
	}
}

function persist(data: SaveData): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
	} catch {
		// Storage full or blocked — the run still plays, it just isn't recorded.
	}
}

/** @returns true if this run set a new personal best for its difficulty. */
export function saveRun(stats: RunStats | number): boolean {
	const data = loadData()
	const run: RunStats = typeof stats === 'number' ? { score: stats } : stats
	const difficulty: DifficultyId = run.difficulty ?? 'medium'

	const record = data.records[difficulty] ?? emptyRecord()
	const isRecord = run.score > record.bestScore

	data.bestScore = Math.max(data.bestScore, run.score)
	if (run.wpm !== undefined) data.bestWPM = Math.max(data.bestWPM, run.wpm)
	if (run.accuracy !== undefined) {
		data.bestAccuracy = Math.max(data.bestAccuracy, run.accuracy)
	}
	if (run.wordsCompleted !== undefined) {
		data.totalWordsTyped += run.wordsCompleted
		record.words += run.wordsCompleted
	}
	if (run.maxCombo !== undefined) {
		data.longestCombo = Math.max(data.longestCombo, run.maxCombo)
		record.longestCombo = Math.max(record.longestCombo, run.maxCombo)
	}
	if (run.wpm !== undefined)
		record.bestWPM = Math.max(record.bestWPM, run.wpm)
	if (run.accuracy !== undefined) {
		record.bestAccuracy = Math.max(record.bestAccuracy, run.accuracy)
	}
	record.bestScore = Math.max(record.bestScore, run.score)
	record.runs++
	data.records[difficulty] = record

	data.totalRuns++
	data.totalPlayMs += run.durationMs ?? 0

	data.lastScores.unshift({
		score: run.score,
		date: new Date().toISOString(),
		wpm: run.wpm,
		accuracy: run.accuracy,
		difficulty,
	})
	data.lastScores = data.lastScores.slice(0, 10)

	persist(data)
	return isRecord
}

export function clearHighscores(): void {
	const data = loadData()
	data.bestScore = 0
	data.lastScores = []
	data.bestWPM = 0
	data.bestAccuracy = 0
	data.totalWordsTyped = 0
	data.longestCombo = 0
	data.totalRuns = 0
	data.totalPlayMs = 0
	data.records = {
		easy: emptyRecord(),
		medium: emptyRecord(),
		hard: emptyRecord(),
		'i-am-god': emptyRecord(),
	}
	data.unlocks = { seenMilestones: [] }
	persist(data)
}

export function updateSettings(patch: Partial<Settings>): void {
	const data = loadData()
	data.settings = { ...data.settings, ...patch }
	persist(data)
}

/** Mark a combo milestone as celebrated. @returns true the first time only. */
export function claimMilestone(milestone: number): boolean {
	const data = loadData()
	if (data.unlocks.seenMilestones.includes(milestone)) return false
	data.unlocks.seenMilestones.push(milestone)
	if (data.unlocks.seenMilestones.length > 64) {
		data.unlocks.seenMilestones = data.unlocks.seenMilestones.slice(-64)
	}
	persist(data)
	return true
}

export { STORAGE_KEY }
