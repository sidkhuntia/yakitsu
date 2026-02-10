import Phaser from 'phaser'
import Boot from './scenes/Boot'
import Play from './scenes/Play'
import GameOver from './scenes/GameOver'

const config: Phaser.Types.Core.GameConfig = {
	type: Phaser.AUTO,
	width: 1280,
	height: 720,
	backgroundColor: '#222',
	pixelArt: true,
	scene: [Boot, Play, GameOver],
	parent: 'app',
	physics: {
		default: 'arcade',
		arcade: {
			gravity: { x: 0, y: 0 },
			debug: false,
		},
	},
}

// Create game instance
const game = new Phaser.Game(config)

// --- Fullscreen Button Logic ---
window.addEventListener('DOMContentLoaded', () => {
	const btn = document.getElementById('fullscreen-btn')
	const getCanvas = () =>
		document.querySelector('#app canvas') as HTMLCanvasElement | null
	const setFullscreenLabel = (text: string) => {
		const label = btn?.querySelector('.fullscreen-label')
		if (label) label.textContent = text
	}

	if (btn) {
		btn.addEventListener('click', async () => {
			const canvas = getCanvas()
			if (!canvas) return
			if (!document.fullscreenElement) {
				await canvas.requestFullscreen()
				canvas.classList.add('fullscreen-canvas')
				setFullscreenLabel('Exit Fullscreen')
			} else {
				await document.exitFullscreen()
				canvas.classList.remove('fullscreen-canvas')
				setFullscreenLabel('Fullscreen')
			}
		})
	}

	document.addEventListener('fullscreenchange', () => {
		const canvas = getCanvas()
		if (!canvas) return
		if (!document.fullscreenElement) {
			canvas.classList.remove('fullscreen-canvas')
			setFullscreenLabel('Fullscreen')
		} else {
			canvas.classList.add('fullscreen-canvas')
			setFullscreenLabel('Exit Fullscreen')
		}
	})

	// Listen for start game event from HTML
	window.addEventListener('startGame', (e: Event) => {
		const detail = (e as CustomEvent<{ difficulty?: string }>).detail
		const difficulty = detail?.difficulty || 'medium'

		// Pass difficulty to Play scene
		game.registry.set('difficulty', difficulty)

		// Always restart the Play scene to ensure clean state
		const playScene = game.scene.getScene('Play')
		if (playScene && playScene.scene.isActive()) {
			playScene.scene.restart()
		} else {
			game.scene.start('Play')
		}

		// Hide HTML interface and show game screen
		const landingScreen = document.getElementById('landing-screen')
		const gameScreen = document.getElementById('game-screen')

		if (landingScreen) {
			landingScreen.classList.add('hidden')
		}

		if (gameScreen) {
			gameScreen.classList.remove('hidden')
		}
	})

	// Listen for return to menu event
	window.addEventListener('returnToMenu', () => {
		// Exit fullscreen first so landing screen is visible
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {})
		}

		// Stop all active game scenes
		const playScene = game.scene.getScene('Play')
		const gameOverScene = game.scene.getScene('GameOver')

		if (playScene && playScene.scene.isActive()) {
			game.scene.stop('Play')
		}

		if (gameOverScene && gameOverScene.scene.isActive()) {
			game.scene.stop('GameOver')
		}

		// Ensure the HTML interface is properly shown
		const landingScreen = document.getElementById('landing-screen')
		const gameScreen = document.getElementById('game-screen')

		if (landingScreen) {
			landingScreen.classList.remove('hidden')
		}

		if (gameScreen) {
			gameScreen.classList.add('hidden')
		}

		// Update high score display in case it changed
		const highScoreElement = document.getElementById('high-score-value')
		if (highScoreElement) {
			const savedData = JSON.parse(
				localStorage.getItem('yatiksu-save-v1') || '{"bestScore": 0}',
			)
			highScoreElement.textContent = savedData.bestScore.toString()
		}
	})
})
