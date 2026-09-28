import Phaser from 'phaser'
import Boot from './scenes/Boot'
import Play from './scenes/Play'
import Duel from './scenes/Duel'
import { initMenu } from './menu'
import './style.css'

const GAME_WIDTH = 1280
const GAME_HEIGHT = 720

const config: Phaser.Types.Core.GameConfig = {
	type: Phaser.AUTO,
	parent: 'app',
	width: GAME_WIDTH,
	height: GAME_HEIGHT,
	backgroundColor: '#0a0f16',
	pixelArt: true,
	roundPixels: true,
	// FIT keeps the playfield fully visible on any window size. The old build
	// used a fixed canvas, so the game overflowed on laptops and looked tiny on
	// large displays.
	scale: {
		mode: Phaser.Scale.FIT,
		autoCenter: Phaser.Scale.CENTER_BOTH,
	},
	// No Arcade physics: collision is explicit AABB in the Play scene, which
	// avoids the scale/offset interaction that made the old hitboxes a guessing
	// game.
	scene: [Boot, Play, Duel],
}

const game = new Phaser.Game(config)

/**
 * A run can be requested before Boot has finished preloading. Queue the request
 * rather than starting Play against a half-loaded cache, which produced
 * missing-texture and missing-audio failures on a fast click.
 */
let assetsReady = false
let pendingDifficulty: string | null = null
let pendingMode: GameMode = 'runner'

/** Which scene a run starts: the original runner, or the duel prototype. */
type GameMode = 'runner' | 'duel'
const SCENE_FOR: Record<GameMode, string> = { runner: 'Play', duel: 'Duel' }

// Registered synchronously after the Game is constructed, so it is always in
// place before Boot reaches create().
game.events.on('yk-assets-ready', () => {
	assetsReady = true
	if (pendingDifficulty) {
		const d = pendingDifficulty
		pendingDifficulty = null
		startRun(d, pendingMode)
	}
})

/**
 * Hide/show the two HTML screens with a single, consistent class.
 *
 * The canvas lives inside the game screen, which starts `display: none`, so
 * Phaser measures a 0x0 parent at construction and scales the canvas to
 * nothing. Unhiding has to be followed by a re-measure on the next frame,
 * once the browser has actually laid the parent out.
 */
function setScreen(
	id: 'landing-screen' | 'game-screen',
	visible: boolean,
): void {
	const node = document.getElementById(id)
	if (!node) return
	node.classList.toggle('hidden', !visible)
	if (id !== 'game-screen') return

	// The landing screen is a full viewport tall, so the document is scrolled
	// when a run starts. Without this reset the player lands mid-page with the
	// canvas below the fold and has to scroll to find the game.
	if (visible) window.scrollTo({ top: 0, behavior: 'instant' })

	const rescaleNow = () => rescale()
	// One synchronous pass in case layout is already current, plus frame-based
	// passes for the case where the class change has not been painted yet.
	rescaleNow()
	requestAnimationFrame(rescaleNow)
	requestAnimationFrame(() => {
		rescaleNow()
		// Belt and braces: never leave the player with a zero-pixel canvas.
		if (game.scale.parentSize.width === 0) {
			game.scale.setParentSize(GAME_WIDTH, GAME_HEIGHT)
			game.scale.refresh()
		}
	})
}

function refreshHighScore(): void {
	const el = document.getElementById('high-score-value')
	if (!el) return
	try {
		const raw = localStorage.getItem('yatiksu-save-v1')
		const best = raw ? (JSON.parse(raw)?.bestScore ?? 0) : 0
		el.textContent = Number(best).toLocaleString()
	} catch {
		el.textContent = '0'
	}
}

/** Boot a run at the given difficulty, always from a clean scene. */
function startRun(difficulty: string, mode: GameMode = 'runner'): void {
	game.registry.set('difficulty', difficulty)
	const key = SCENE_FOR[mode]
	for (const other of Object.values(SCENE_FOR)) {
		if (other !== key && game.scene.isActive(other)) game.scene.stop(other)
	}
	const scene = game.scene.getScene(key)
	if (scene?.scene.isActive()) scene.scene.restart()
	else game.scene.start(key)
}

function getCanvas(): HTMLCanvasElement | null {
	return document.querySelector('#app canvas')
}

function setFullscreenLabel(text: string): void {
	const label = document.querySelector('#fullscreen-btn .fullscreen-label')
	if (label) label.textContent = text
}

async function toggleFullscreen(): Promise<void> {
	const canvas = getCanvas()
	if (!canvas) return
	try {
		if (!document.fullscreenElement) {
			await canvas.requestFullscreen()
			game.scale.refresh()
		} else {
			await document.exitFullscreen()
		}
	} catch (err) {
		console.warn('Fullscreen unavailable:', err)
	}
}

function syncFullscreenChrome(): void {
	const active = Boolean(document.fullscreenElement)
	getCanvas()?.classList.toggle('fullscreen-canvas', active)
	setFullscreenLabel(active ? 'Exit Fullscreen' : 'Fullscreen')
	rescale()
}

/**
 * Size the canvas to the space the page chrome leaves over, and hand that
 * number to Phaser.
 *
 * The canvas is a fixed 1280x720. Rather than letting flex decide its size
 * (which measures mid-layout and can feed the canvas its own dimensions back,
 * making it grow on every pass) the available box is computed explicitly from
 * the viewport minus the header, hint bar and container chrome. The scale is
 * clamped to 1 so the game never upscales past its native resolution, which
 * would only blur the pixel art.
 */
function rescale(): void {
	const app = document.getElementById('app')
	const container = document.querySelector<HTMLElement>('.game-container')
	if (!app || !container) return

	const screen = document.getElementById('game-screen')
	if (screen?.classList.contains('hidden')) return

	const styles = getComputedStyle(container)
	const chromeX =
		parseFloat(styles.borderLeftWidth) +
		parseFloat(styles.borderRightWidth) +
		parseFloat(styles.paddingLeft) +
		parseFloat(styles.paddingRight)
	const chromeY =
		parseFloat(styles.borderTopWidth) +
		parseFloat(styles.borderBottomWidth) +
		parseFloat(styles.paddingTop) +
		parseFloat(styles.paddingBottom)

	// Everything in the column above the canvas: header + hint bar + gaps.
	const siblings = Array.from(container.parentElement?.children ?? []).filter(
		(el): el is HTMLElement =>
			el instanceof HTMLElement && el !== container,
	)
	const aboveH = siblings.reduce((sum, el) => {
		const r = el.getBoundingClientRect()
		return sum + r.height
	}, 0)
	const marginH = siblings.reduce(
		(sum, el) => sum + parseFloat(getComputedStyle(el).marginBottom || '0'),
		0,
	)

	const screenStyles = screen ? getComputedStyle(screen) : null
	const padY = screenStyles
		? parseFloat(screenStyles.paddingTop) +
			parseFloat(screenStyles.paddingBottom)
		: 0
	const padX = screenStyles
		? parseFloat(screenStyles.paddingLeft) +
			parseFloat(screenStyles.paddingRight)
		: 0

	const availW = window.innerWidth - padX - chromeX
	const availH = window.innerHeight - padY - chromeY - aboveH - marginH
	if (availW <= 0 || availH <= 0) return

	const scale = Math.min(availW / GAME_WIDTH, availH / GAME_HEIGHT, 1)

	// Give the canvas an explicit box, then tell Phaser that size.
	const w = Math.floor(GAME_WIDTH * scale)
	const h = Math.floor(GAME_HEIGHT * scale)
	app.style.width = `${w}px`
	app.style.height = `${h}px`
	game.scale.setParentSize(w, h)
	game.scale.refresh()
}

window.addEventListener('DOMContentLoaded', () => {
	initMenu()

	// Keep the canvas fitted to the window. Debounced: resize fires in bursts
	// while dragging, and every pass does a forced layout read.
	let resizeTimer = 0
	const scheduleRescale = (): void => {
		window.clearTimeout(resizeTimer)
		resizeTimer = window.setTimeout(rescale, 80)
	}
	window.addEventListener('resize', scheduleRescale)
	// Mobile browsers change the viewport height when the URL bar hides.
	window.addEventListener('orientationchange', scheduleRescale)

	document
		.getElementById('fullscreen-btn')
		?.addEventListener('click', () => void toggleFullscreen())
	document.addEventListener('fullscreenchange', syncFullscreenChrome)

	// The inline menu script in index.html dispatches these once the player has
	// chosen a difficulty.
	window.addEventListener('startGame', (e) => {
		const detail = (
			e as CustomEvent<{ difficulty?: string; mode?: GameMode }>
		).detail
		const difficulty = detail?.difficulty ?? 'medium'
		const mode: GameMode = detail?.mode === 'duel' ? 'duel' : 'runner'

		setScreen('landing-screen', false)
		setScreen('game-screen', true)

		if (!assetsReady) {
			pendingDifficulty = difficulty
			pendingMode = mode
			return
		}
		startRun(difficulty, mode)
	})

	window.addEventListener('returnToMenu', () => {
		if (document.fullscreenElement)
			void document.exitFullscreen().catch(() => {})

		for (const key of Object.values(SCENE_FOR)) {
			const s = game.scene.getScene(key)
			if (s?.scene.isActive()) game.scene.stop(key)
		}

		pendingDifficulty = null
		setScreen('game-screen', false)
		setScreen('landing-screen', true)
	})

	// Settings are read at Play.create(), so a change simply applies to the
	// next run. Restarting a live run here would be a surprising data loss.
	window.addEventListener('settingsChanged', refreshHighScore)

	// Alt-tabbing away and coming back to a dead avatar is never fair.
	window.addEventListener('blur', () => {
		const running = Object.values(SCENE_FOR).some((key) =>
			game.scene.isActive(key),
		)
		if (running) game.events.emit('yk-autopause')
	})
})
