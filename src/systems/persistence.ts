export interface ScoreEntry {
	score: number
	date: string
}

export interface SaveData {
	bestScore: number
	lastScores: ScoreEntry[]
	settings: {
		muted: boolean
		dyslexicFont: boolean
		lockInputOnMistake: boolean
	}
}

const STORAGE_KEY = 'yatiksu-save-v1'

export function loadData(): SaveData {
	const raw = localStorage.getItem(STORAGE_KEY)
	if (raw) {
		try {
			return JSON.parse(raw)
		} catch {
			// fallback to default
		}
	}
	return {
		bestScore: 0,
		lastScores: [],
		settings: {
			muted: false,
			dyslexicFont: false,
			lockInputOnMistake: false,
		},
	}
}

export function saveRun(score: number): void {
	const data = loadData()
	data.bestScore = Math.max(data.bestScore, score)
	data.lastScores.unshift({ score, date: new Date().toISOString() })
	data.lastScores = data.lastScores.slice(0, 10)
	localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function updateSettings(patch: Partial<SaveData['settings']>): void {
	const data = loadData()
	data.settings = { ...data.settings, ...patch }
	localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
