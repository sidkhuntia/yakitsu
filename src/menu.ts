import {
	clearHighscores,
	loadData,
	updateSettings,
	type Settings,
} from './systems/persistence'
import { DIFFICULTIES, type DifficultyId } from './systems/tuning'
import { MAX_LEVEL, duelLevel } from './systems/duel/duelLevels'

/**
 * HTML shell controller: the landing menu, the modals, and the bridge events
 * into the Phaser game.
 *
 * This used to live as an untyped 250-line inline <script> in index.html with
 * three "TODO: implement" toggles that did nothing. It is here now so it is
 * type-checked, lint-checked, and shares one persistence module with the game.
 */

const SAVE_KEY = 'yatiksu-save-v1'

function el<T extends HTMLElement>(id: string): T | null {
	return document.getElementById(id) as T | null
}

function setHidden(id: string, hidden: boolean): void {
	el(id)?.classList.toggle('hidden', hidden)
}

function fmt(n: number): string {
	return Number(n || 0).toLocaleString()
}

/** Reads the save blob defensively; the menu must never throw. */
function readSave(): ReturnType<typeof loadData> {
	return loadData()
}

export function initMenu(): void {
	const landing = el('landing-screen')
	const gameScreen = el('game-screen')
	if (!landing || !gameScreen) return

	// Both screens start with the game hidden via CSS; make it explicit.
	setHidden('game-screen', true)

	const difficultyModal = el('difficulty-modal')
	const howToModal = el('how-to-play-modal')
	const settingsModal = el('settings-modal')
	const duelModal = el('duel-level-modal')
	const allModals = [
		difficultyModal,
		howToModal,
		settingsModal,
		duelModal,
	].filter((m): m is HTMLElement => m !== null)

	// --- modal plumbing ----------------------------------------------------
	let openModal: HTMLElement | null = null

	function closeModal(modal: HTMLElement | null): void {
		if (!modal) return
		modal.classList.remove('active')
		if (openModal === modal) openModal = null
		if (!allModals.some((m) => m.classList.contains('active'))) {
			document.body.style.overflow = ''
		}
	}

	function showModal(modal: HTMLElement | null): void {
		if (!modal) return
		allModals.forEach(
			(m) => m.classList.contains('active') && closeModal(m),
		)
		modal.classList.add('active')
		openModal = modal
		document.body.style.overflow = 'hidden'
		// Move focus into the dialog so keyboard and screen-reader users land
		// in the right place instead of staying on the button behind it.
		modal.querySelector<HTMLElement>('button')?.focus()
	}

	function closeAllModals(): void {
		allModals.forEach(closeModal)
	}

	document.addEventListener('click', (e) => {
		const target = e.target as HTMLElement
		const modalId =
			target.dataset.modal ??
			target.closest<HTMLElement>('[data-modal]')?.dataset.modal
		if (modalId) {
			closeModal(el(modalId))
			return
		}
		if (
			allModals.includes(target) &&
			!target.querySelector('.modal-content')?.contains(e.target as Node)
		) {
			closeModal(target)
		}
	})

	// --- high scores -------------------------------------------------------
	function renderRecords(): void {
		const data = readSave()
		const best = el('high-score-value')
		if (best) best.textContent = fmt(data.bestScore)

		const table = el('records-body')
		if (!table) return
		table.innerHTML = ''
		for (const id of Object.keys(DIFFICULTIES) as DifficultyId[]) {
			const r = data.records[id]
			const tr = document.createElement('tr')
			tr.innerHTML = `
				<td class="rec-name">${DIFFICULTIES[id].label}</td>
				<td>${fmt(r.bestScore)}</td>
				<td>${fmt(r.bestWPM)}</td>
				<td>${r.longestCombo}</td>
				<td>${r.runs}</td>`
			table.appendChild(tr)
		}

		const totals = el('totals-line')
		if (totals) {
			totals.textContent = `${fmt(data.totalWordsTyped)} words typed across ${fmt(data.totalRuns)} runs`
		}
	}

	// --- settings ----------------------------------------------------------
	const soundToggle = el<HTMLElement>('sound-toggle')
	const musicToggle = el<HTMLElement>('music-toggle')
	const shakeToggle = el<HTMLElement>('shake-toggle')

	function paintToggles(): void {
		const s: Settings = readSave().settings
		soundToggle?.classList.toggle('active', !s.muted)
		musicToggle?.classList.toggle('active', s.musicVolume > 0)
		shakeToggle?.classList.toggle('active', s.screenShake)
		soundToggle?.setAttribute('aria-pressed', String(!s.muted))
		musicToggle?.setAttribute('aria-pressed', String(s.musicVolume > 0))
		shakeToggle?.setAttribute('aria-pressed', String(s.screenShake))
	}

	function bindToggle(
		node: HTMLElement | null,
		apply: (current: Settings) => Partial<Settings>,
	): void {
		node?.addEventListener('click', () => {
			updateSettings(apply(readSave().settings))
			paintToggles()
			window.dispatchEvent(new CustomEvent('settingsChanged'))
		})
	}

	bindToggle(soundToggle, (s) => ({ muted: !s.muted }))
	bindToggle(musicToggle, (s) => ({
		musicVolume: s.musicVolume > 0 ? 0 : 0.35,
	}))
	bindToggle(shakeToggle, (s) => ({ screenShake: !s.screenShake }))

	el('reset-data-btn')?.addEventListener('click', () => {
		if (
			!confirm(
				'Delete all scores and reset settings? This cannot be undone.',
			)
		) {
			return
		}
		// clearHighscores preserves settings; the old handler called
		// localStorage.clear() and wiped the player's preferences too.
		clearHighscores()
		renderRecords()
		paintToggles()
		window.dispatchEvent(new CustomEvent('settingsChanged'))
	})

	// --- flow --------------------------------------------------------------
	el('start-game-btn')?.addEventListener('click', () =>
		showModal(difficultyModal),
	)

	// Duel has a level ladder instead of difficulties, and no lives: each
	// level is a harder goblin, unlocked by beating the one before it.
	function renderDuelLevels(): void {
		const grid = el('duel-levels')
		if (!grid) return
		const progress = readSave().duel
		grid.innerHTML = ''
		for (let n = 1; n <= MAX_LEVEL; n++) {
			const lv = duelLevel(n)
			const locked = n > progress.unlockedLevel
			const best = progress.bestMs[String(n)]
			const btn = document.createElement('button')
			btn.className = 'level-btn'
			btn.disabled = locked
			btn.dataset.level = String(n)
			btn.innerHTML = `
				<span class="level-num">${locked ? '🔒' : n}</span>
				<span class="level-title">${lv.title}</span>
				<span class="level-meta">~${lv.targetWpm} WPM${best ? ` · ${(best / 1000).toFixed(1)}s` : ''}</span>`
			btn.setAttribute(
				'aria-label',
				locked
					? `Level ${n}, locked`
					: `Level ${n}, ${lv.title}, about ${lv.targetWpm} words per minute`,
			)
			btn.addEventListener('click', () => {
				closeAllModals()
				window.dispatchEvent(
					new CustomEvent('startGame', {
						detail: { mode: 'duel', level: n },
					}),
				)
			})
			grid.appendChild(btn)
		}
	}

	el('start-duel-btn')?.addEventListener('click', () => {
		renderDuelLevels()
		showModal(duelModal)
		// Land focus on the newest unlocked level: that is the one to play.
		const open = readSave().duel.unlockedLevel
		duelModal?.querySelector<HTMLElement>(`[data-level="${open}"]`)?.focus()
	})

	document.querySelectorAll<HTMLElement>('.difficulty-btn').forEach((btn) => {
		btn.addEventListener('click', () => {
			const difficulty =
				(btn.dataset.difficulty as DifficultyId) ?? 'medium'
			closeAllModals()
			window.dispatchEvent(
				new CustomEvent('startGame', {
					detail: { difficulty, mode: 'runner' },
				}),
			)
		})
	})

	el('how-to-play-btn')?.addEventListener('click', () =>
		showModal(howToModal),
	)
	el('settings-btn')?.addEventListener('click', () =>
		showModal(settingsModal),
	)

	el('back-to-menu-btn')?.addEventListener('click', () => {
		closeAllModals()
		window.dispatchEvent(new CustomEvent('returnToMenu'))
	})

	document.addEventListener('keydown', (e) => {
		if (e.key !== 'Escape') return
		// In-game, ESC belongs to Phaser. Only the menu handles it here.
		if (gameScreen.classList.contains('hidden')) {
			if (openModal) {
				closeModal(openModal)
				e.preventDefault()
			}
		}
	})

	renderRecords()
	paintToggles()
	// Refresh when a run ends, so the menu shows the score you just earned.
	window.addEventListener('returnToMenu', () => {
		closeAllModals()
		renderRecords()
		paintToggles()
	})
	window.addEventListener('gameScoreUpdate', renderRecords)
}

export { SAVE_KEY }
