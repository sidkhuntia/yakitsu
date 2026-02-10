export interface ScoreEntry {
	score: number
	date: string
	wpm?: number
	accuracy?: number
}

export interface SaveData {
	bestScore: number
	lastScores: ScoreEntry[]
	bestWPM: number
	bestAccuracy: number
	totalWordsTyped: number
	longestCombo: number
	settings: {
		muted: boolean
		dyslexicFont: boolean
		lockInputOnMistake: boolean
	}
}

export interface RunStats {
	score: number
	wpm?: number
	accuracy?: number
	wordsCompleted?: number
	maxCombo?: number
}

const STORAGE_KEY = 'yatiksu-save-v1'

const DEFAULT_SAVE_DATA: SaveData = {
	bestScore: 0,
	lastScores: [],
	bestWPM: 0,
	bestAccuracy: 0,
	totalWordsTyped: 0,
	longestCombo: 0,
	settings: {
		muted: false,
		dyslexicFont: false,
		lockInputOnMistake: false,
	},
}

export function loadData(): SaveData {
	const raw = localStorage.getItem(STORAGE_KEY)
	if (raw) {
		try {
			const parsed = JSON.parse(raw)
			return {
				...DEFAULT_SAVE_DATA,
				...parsed,
				settings: {
					...DEFAULT_SAVE_DATA.settings,
					...parsed?.settings,
				},
			}
		} catch {
			// fallback to default
		}
	}
	return { ...DEFAULT_SAVE_DATA }
}

export function saveRun(stats: RunStats | number): void {
	const data = loadData()
	const runStats: RunStats =
		typeof stats === 'number' ? { score: stats } : stats

	data.bestScore = Math.max(data.bestScore, runStats.score)
	if (runStats.wpm !== undefined)
		data.bestWPM = Math.max(data.bestWPM, runStats.wpm)
	if (runStats.accuracy !== undefined)
		data.bestAccuracy = Math.max(data.bestAccuracy, runStats.accuracy)
	if (runStats.wordsCompleted !== undefined)
		data.totalWordsTyped += runStats.wordsCompleted
	if (runStats.maxCombo !== undefined)
		data.longestCombo = Math.max(data.longestCombo, runStats.maxCombo)

	data.lastScores.unshift({
		score: runStats.score,
		date: new Date().toISOString(),
		wpm: runStats.wpm,
		accuracy: runStats.accuracy,
	})
	data.lastScores = data.lastScores.slice(0, 10)

	localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function clearHighscores(): void {
	const data = loadData()
	data.bestScore = 0
	data.lastScores = []
	data.bestWPM = 0
	data.bestAccuracy = 0
	data.totalWordsTyped = 0
	data.longestCombo = 0
	localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function updateSettings(patch: Partial<SaveData['settings']>): void {
	const data = loadData()
	data.settings = { ...data.settings, ...patch }
	localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
