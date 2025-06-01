import Phaser from 'phaser'
import { TypingEngine } from '../systems/typingEngine'
import { loadData, saveRun, type SaveData } from '../systems/persistence'
import { SettingsModal } from '../systems/SettingsModal'
import { GameOverModal } from '../systems/GameOverModal'
import { Monster } from '../systems/Monster'
import type { MonsterType } from '../systems/Monster'

declare global {
	interface Window {
		THESAURUS: {
			three: string[]
			small: string[]
			medium: string[]
			big: string[]
			large: string[]
		}
	}
}

function getRandom(arr: string[]): string {
	return arr[Math.floor(Math.random() * arr.length)]
}

export default class Play extends Phaser.Scene {
	private engine!: TypingEngine
	private typedText!: Phaser.GameObjects.Text
	private caretText!: Phaser.GameObjects.Text
	private remainingText!: Phaser.GameObjects.Text
	private infoText!: Phaser.GameObjects.Text
	private avatar!: Phaser.GameObjects.Sprite
	private monster!: Monster
	// private groundTiles: Phaser.GameObjects.Image[] = [];
	public score: number = 0
	private combo: number = 0
	private lives: number = 3
	private scoreText!: Phaser.GameObjects.Text
	private comboText!: Phaser.GameObjects.Text
	private livesText!: Phaser.GameObjects.Text
	private wpmText!: Phaser.GameObjects.Text
	private accuracyText!: Phaser.GameObjects.Text
	private gameOverTriggered = false
	private easyWords: string[] = []
	private mediumWords: string[] = []
	private hardWords: string[] = []
	private bigWords: string[] = []
	private largeWords: string[] = []
	private wordsCompleted = 0
	private caretFlashTimer?: Phaser.Time.TimerEvent
	private powerUpType: 'ice' | 'bomb' | null = null
	private powerUpSprite?: Phaser.GameObjects.Image
	private obstacleFrozen = false
	private inputLocked = false
	private obstacleSpeed = 2
	private baseObstacleSpeed = 2
	private difficultyLevel = 1
	private settingsModalOpen = false
	private backgroundLayers: Phaser.GameObjects.TileSprite[] = []
	private groundLayers: Phaser.GameObjects.TileSprite[] = []
	// private avatarMoving: boolean = false;
	private speedMultiplier = 1.1
	private escKeyHandler: (event: KeyboardEvent) => void = () =>
		this.handleEscKey()
	private avatarBody!: Phaser.Physics.Arcade.Sprite
	private monsterBody!: Phaser.Physics.Arcade.Sprite
	private runSound!: Phaser.Sound.BaseSound
	private speedUpSound!: Phaser.Sound.BaseSound
	private monsterHitSound!: Phaser.Sound.BaseSound
	private clickSound!: Phaser.Sound.BaseSound
	private bgMusic!: Phaser.Sound.BaseSound
	private settings!: Partial<SaveData['settings']>
	// Typing statistics
	private totalKeystrokes = 0
	private correctKeystrokes = 0
	private gameStartTime = 0
	private currentWPM = 0
	private currentAccuracy = 100
	private statsUpdateTimer?: Phaser.Time.TimerEvent

	constructor() {
		super('Play')
	}

	preload() {
		this.load.image('ice', 'assets/ice.png')
		this.load.image('bomb', 'assets/bomb.png')
		this.load.script('words', 'data/words/words.js')

		// Load all background layers
		for (let i = 2; i <= 11; i++) {
			const layerNum = i.toString().padStart(4, '0')
			this.load.image(
				`layer_${layerNum}`,
				`assets/background/Layer_${layerNum}.png`,
			)
		}

		// Load ground layers
		this.load.image('ground_back', 'assets/background/Layer_0001.png')
		this.load.image('ground_front', 'assets/background/Layer_0000.png')

		// Avatar run frames - fixed to 21x32
		this.load.spritesheet('avatar_run', 'assets/character/Run.png', {
			frameWidth: 180,
			frameHeight: 180,
		})

		// Load monster spritesheets
		const monsterTypes: MonsterType[] = [
			'Skeleton',
			'Flying eye',
			'Mushroom',
			'Goblin',
		]
		monsterTypes.forEach((type) => {
			// Run animation
			this.load.spritesheet(
				`monster_${type}_run`,
				`assets/monsters/${type}/Run.png`,
				{ frameWidth: 150, frameHeight: 150 },
			)

			// Death animation
			this.load.spritesheet(
				`monster_${type}_death`,
				`assets/monsters/${type}/Death.png`,
				{ frameWidth: 150, frameHeight: 150 },
			)

			// Hit animation
			this.load.spritesheet(
				`monster_${type}_hit`,
				`assets/monsters/${type}/Take Hit.png`,
				{ frameWidth: 150, frameHeight: 150 },
			)
		})

		// Add load error handler
		this.load.on('loaderror', (fileObj: Phaser.Loader.File) => {
			console.error('Error loading asset:', fileObj.key)
		})
	}

	create() {
		this.score = 0
		this.combo = 0
		this.lives = 3
		this.gameOverTriggered = false
		this.wordsCompleted = 0
		this.obstacleSpeed = this.baseObstacleSpeed
		this.difficultyLevel = 1
		// Reset typing statistics
		this.totalKeystrokes = 0
		this.correctKeystrokes = 0
		this.gameStartTime = this.time.now
		this.currentWPM = 0
		this.currentAccuracy = 100
		// Use THESAURUS from words.js
		this.easyWords = window.THESAURUS?.three || []
		this.mediumWords = window.THESAURUS?.small || []
		this.hardWords = window.THESAURUS?.medium || []
		this.bigWords = window.THESAURUS?.big || []
		this.largeWords = window.THESAURUS?.large || []
		const firstWord = this.getNextWord()
		this.engine = new TypingEngine(firstWord)
		this.settings = loadData().settings

		// Set up sounds
		// Background music for gameplay
		this.bgMusic = this.sound.add('bgMusic', {
			volume: 0.17,
			loop: true,
		})

		// Register the game music globally
		this.game.registry.set('bgMusic', this.bgMusic)

		// Only play if not muted
		if (!this.settings.muted) {
			this.bgMusic.play()
		} else {
			this.bgMusic.pause()
		}

		// Add sound effects
		this.runSound = this.sound.add('runSound', {
			volume: 1,
			loop: true,
		})

		// Play running sound if not muted
		if (!this.settings.muted) {
			this.runSound.play()
		} else {
			this.runSound.pause()
		}
		this.speedUpSound = this.sound.add('speedUpSound', { volume: 0.5 })
		this.monsterHitSound = this.sound.add('monsterHitSound', {
			volume: 0.6,
		})
		this.clickSound = this.sound.add('clickSound', { volume: 0.7 })

		// Set camera background to transparent
		// this.cameras.main.setBackgroundColor('rgba(0, 0, 0, 0)');
		this.cameras.main.setBackgroundColor('#94AAB0')

		// Create parallax background with the layers
		this.createParallaxBackground()

		// Add ground layers
		this.createGroundLayers()

		this.createSprites()
		this.createText()
		this.createHUD()
		this.updateWordDisplay()
		this.updateHUD()

		// Enable physics
		this.physics.world.enable([this.avatar, this.monster])

		// Set up avatar and monster physics bodies
		this.avatarBody = this.avatar as unknown as Phaser.Physics.Arcade.Sprite
		this.monsterBody = this
			.monster as unknown as Phaser.Physics.Arcade.Sprite

		// Adjust hitbox size for avatar (smaller than the visual sprite)
		if (this.avatarBody.body) {
			this.avatarBody.body.setSize(40, 70, true)
			this.avatarBody.body.setOffset(70, 60)
		}

		// Initialize the first monster's hitbox properly
		if (this.monsterBody && this.monsterBody.body) {
			// Make hitbox much smaller and more precise for better collision
			this.monsterBody.body.setSize(30, 60, true)

			// Calculate precise offset based on monster type
			// const monsterType = this.monster.monsterType || Monster.getRandomType();
			// const config = Monster.getFrameConfig(monsterType);

			// Position hitbox in the monster's torso/center
			this.monsterBody.body.setOffset(60, 50)
		}

		this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
			if (
				this.engine.isComplete() ||
				this.gameOverTriggered ||
				this.inputLocked
			)
				return
			// Only allow a-z or A-Z
			if (!/^[a-zA-Z]$/.test(event.key)) return

			// Track typing statistics
			this.totalKeystrokes++

			const ok = this.engine.input(event.key.toUpperCase())
			this.updateWordDisplay()
			if (ok) {
				this.correctKeystrokes++
				this.flashCaret('#0f0')
				this.infoText.setText('')
				// Play hit animation and sound on correct key press
				if (this.monster) {
					this.monster.playHitAnimation()
				}
				if (this.engine.isComplete()) {
					// if (this.powerUpType) {
					// 	this.handlePowerUp()
					// }
					this.handleWordComplete()
				}
			} else {
				this.flashCaret('#f44')
				this.combo = 0
				this.updateHUD()
				this.infoText.setText('Wrong key!')
				this.obstacleSpeed *= this.speedMultiplier

				this.time.delayedCall(500, () => {
					this.obstacleSpeed /= this.speedMultiplier
				})
				if (this.settings.lockInputOnMistake) {
					this.inputLocked = true
					this.time.delayedCall(500, () => {
						this.inputLocked = false
					})
				}
			}

			// Update typing statistics
			this.updateTypingStats()
		})

		// Set up the ESC key handler
		this.input.keyboard!.on('keydown-ESC', this.escKeyHandler)

		// Set up continuous statistics updates
		this.statsUpdateTimer = this.time.addEvent({
			delay: 1000, // Update every second
			callback: this.updateTypingStats,
			callbackScope: this,
			loop: true,
		})
	}

	createHUD() {
		// Lives (hearts)
		this.livesText = this.add
			.text(20, 20, '', {
				fontFamily: 'Retro Font',
				fontSize: '34px',
				color: '#f44',
			})
			.setOrigin(0, 0)
			.setDepth(20)
		// Score
		this.scoreText = this.add
			.text(this.scale.width - 20, 20, '', {
				fontFamily: 'Retro Font',
				fontSize: '28px',
				color: '#fff',
			})
			.setOrigin(1, 0)
			.setDepth(20)
		// Combo
		this.comboText = this.add
			.text(this.scale.width - 20, 60, '', {
				fontFamily: 'Retro Font',
				fontSize: '20px',
				color: '#0ff',
			})
			.setOrigin(1, 0)
			.setDepth(20)
		// WPM (Words Per Minute) - Changed to bright white with dark outline
		this.wpmText = this.add
			.text(this.scale.width - 20, 100, '', {
				fontFamily: 'Retro Font',
				fontSize: '18px',
				color: '#ffffff',
				stroke: '#000000',
				strokeThickness: 2,
			})
			.setOrigin(1, 0)
			.setDepth(20)
		// Accuracy - Changed to bright yellow with dark outline
		this.accuracyText = this.add
			.text(this.scale.width - 20, 130, '', {
				fontFamily: 'Retro Font',
				fontSize: '18px',
				color: '#ffff00',
				stroke: '#000000',
				strokeThickness: 2,
			})
			.setOrigin(1, 0)
			.setDepth(20)
	}

	updateHUD() {
		this.livesText.setText('❤️'.repeat(this.lives))
		this.scoreText.setText(`Score: ${this.score}`)
		this.comboText.setText(`Combo: ${this.combo}`)
		this.wpmText.setText(`WPM: ${this.currentWPM}`)
		this.accuracyText.setText(`Accuracy: ${this.currentAccuracy}%`)
		// Reposition on resize
		this.scoreText.setX(this.scale.width - 20)
		this.comboText.setX(this.scale.width - 20)
		this.wpmText.setX(this.scale.width - 20)
		this.accuracyText.setX(this.scale.width - 20)
	}

	getNextWord(): string {
		// Level progression: 0-9: three, 10-19: small, 20-39: medium, 40-59: big, 60+: large
		const w = this.wordsCompleted
		if (w < 10 && this.easyWords.length) return getRandom(this.easyWords)
		if (w < 20 && this.mediumWords.length)
			return getRandom(this.mediumWords)
		if (w < 40 && this.hardWords.length) return getRandom(this.hardWords)
		if (w < 60 && this.bigWords?.length) return getRandom(this.bigWords)
		if (this.largeWords?.length) return getRandom(this.largeWords)
		return 'yakitsu'
	}

	handleWordComplete() {
		const base = 10 * this.engine.getWord().length
		const bonus = 1 + Math.floor(this.combo / 20) * 0.25
		this.score += Math.floor(base * bonus)
		this.combo++
		this.wordsCompleted++
		this.infoText.setText('Word complete!')
		this.updateHUD()
		// this.spawnPowerUp()

		// Increase difficulty every 5 words
		if (this.wordsCompleted % 5 === 0) {
			this.increaseDifficulty()
		}

		// Spawn new monster
		this.spawnNewMonster()

		// Pick next word
		const nextWord = this.getNextWord()
		this.engine.reset(nextWord)
		this.updateWordDisplay()
		// Clear infoText for new word
		this.infoText.setText('')
	}

	loseLife() {
		if (this.gameOverTriggered) return
		this.lives--
		this.combo = 0
		this.updateHUD()
		if (this.lives <= 0) {
			this.triggerGameOver()
		} else {
			// Reset monster by spawning a new one
			this.spawnNewMonster()
		}
	}

	triggerGameOver() {
		this.gameOverTriggered = true

		// Stop all sounds
		this.stopAllSounds()

		// Save best score before showing game over modal
		if (typeof saveRun === 'function') {
			saveRun(this.score)
		}

		// Hide all main game text objects to prevent overlap with modal
		this.typedText.setVisible(false)
		this.caretText.setVisible(false)
		this.remainingText.setVisible(false)
		this.infoText.setVisible(false)
		this.scoreText.setVisible(false)
		this.comboText.setVisible(false)
		this.livesText.setVisible(false)
		this.wpmText.setVisible(false)
		this.accuracyText.setVisible(false)
		this.avatar.setVisible(false)
		// Show modal overlay
		const bestScore =
			typeof loadData === 'function' ? loadData().bestScore : 0
		const modal = new GameOverModal(
			this,
			this.score,
			bestScore,
			this.currentWPM,
			this.currentAccuracy,
			() => {
				this.scene.restart()
			},
			() => {
				this.scene.start('Menu')
			},
		)
		this.children.add(modal)
		// Fallback: also switch to GameOver scene after 10s if modal not used
		this.time.delayedCall(2000, () => {
			if (this.scene.isActive('Play')) {
				this.scene.start('GameOver', {
					score: this.score,
					wpm: this.currentWPM,
					accuracy: this.currentAccuracy,
				})
			}
		})
	}

	createSprites() {
		const { height } = this.scale
		// Use sprite for avatar - adjusted scale for 32x32 frames
		// Keep avatar stationary at a fixed position on the left side
		this.avatar = this.add
			.sprite(120, height - 90, 'avatar_run', 0)
			.setOrigin(0.5)
			.setScale(2)
			.setDepth(10) // Ensure avatar is above background

		// Create avatar run animation if it doesn't exist
		if (!this.anims.exists('avatar-run')) {
			// Force use of 8 frames regardless of what Phaser detects
			this.anims.create({
				key: 'avatar-run',
				frames: this.anims.generateFrameNumbers('avatar_run', {
					start: 0,
					end: 7,
				}),
				frameRate: 10,
				repeat: -1,
			})
		}

		// Play animation after ensuring it exists
		this.avatar.play('avatar-run')

		// Create a monster instead of an obstacle
		const monsterType = Monster.getRandomType()
		this.monster = new Monster(
			this,
			this.scale.width + 100,
			height - 80,
			monsterType,
		)
		this.add.existing(this.monster)
	}

	createText() {
		const { width, height } = this.scale
		const letterSpacing = 5
		this.typedText = this.add
			.text(width / 2, height / 2 - 20, '', {
				fontFamily: 'Retro Font',
				fontSize: '32px',
				color: '#0f0',
				letterSpacing,
			})
			.setOrigin(0, 0.5)
			.setDepth(20)
			.setAlpha(0.1)

		this.caretText = this.add
			.text(-20, height / 2 - 20, '', {
				fontFamily: 'Retro Font',
				fontSize: '32px',
				color: '#ff0',
				letterSpacing,
			})
			.setOrigin(0, 0.5)
			.setDepth(20)

		this.remainingText = this.add
			.text(0, height / 2 - 20, '', {
				fontFamily: 'Retro Font',
				fontSize: '32px',
				color: '#fff',
				letterSpacing,
			})
			.setOrigin(0, 0.5)
			.setDepth(20)

		this.infoText = this.add
			.text(width / 2, height / 2 + 40, '', {
				fontFamily: 'Retro Font',
				fontSize: '24px',
				color: '#0ff',
			})
			.setOrigin(0.5)
			.setDepth(20)
	}

	update() {
		if (!this.gameOverTriggered && !this.settingsModalOpen) {
			// Calculate base speed factor based on obstacle speed
			const baseSpeed = this.obstacleSpeed * 0.5

			// Update background layers with parallax effect
			// Farthest layers (higher numbers) move slowest
			for (let i = 0; i < this.backgroundLayers.length; i++) {
				// Calculate speed factor based on layer position (0 = closest, length-1 = farthest)
				// Reverse the index to make higher layers move slower
				const layerIndex = this.backgroundLayers.length - 1 - i
				const speedFactor = 0.1 + layerIndex * 0.1 // 0.1, 0.2, 0.3, etc.
				this.backgroundLayers[i].tilePositionX +=
					baseSpeed * speedFactor
			}

			// Update ground layers - these move faster than backgrounds
			for (let i = 0; i < this.groundLayers.length; i++) {
				// Ground layers move at full speed or slightly faster
				const speedFactor = 1.0 + i * 0.2 // 1.0, 1.2 for front and back
				this.groundLayers[i].tilePositionX += baseSpeed * speedFactor
			}

			// Move monster from right to left (instead of moving avatar)
			if (!this.obstacleFrozen) {
				this.monster.x -= this.obstacleSpeed * 2 // Move monster towards the player

				// Update the physics body position to match the sprite
				if (this.monsterBody && this.monsterBody.body) {
					this.monsterBody.x = this.monster.x
					this.monsterBody.y = this.monster.y
				}

				// Reset monster position when it moves off-screen to the left
				if (this.monster.x < -100) {
					// Spawn new monster without death animation (it's off-screen)
					this.spawnNewMonster(false)

					// Spawn a new word when monster resets
					if (this.engine.isComplete()) {
						this.handleWordComplete()
					}
				}
			}

			// Check collision using physics instead of rectangle bounds
			if (this.avatarBody && this.monsterBody) {
				this.physics.overlap(
					this.avatarBody,
					this.monsterBody,
					this.handleCollision.bind(this), // Use bind to fix 'this' context
					undefined, // Use undefined instead of null
					this,
				)
			}
		}
	}

	// New method to handle collision
	handleCollision() {
		if (this.gameOverTriggered || this.obstacleFrozen) return

		this.loseLife()

		if (this.gameOverTriggered) {
			this.monster.setVisible(false)
			this.monster.setActive(false)
		}
	}

	updateWordDisplay() {
		const word = this.engine.getWord().toUpperCase()
		const caret = this.engine.getCaret()
		const typed = word.slice(0, caret)
		const caretChar = caret < word.length ? word[caret] : ''
		const remaining = caret < word.length ? word.slice(caret + 1) : ''
		this.typedText.setText(typed)
		this.caretText.setText(caretChar)
		this.remainingText.setText(remaining)
		// Position segments in sequence, centered
		const totalWidth =
			this.typedText.width +
			this.caretText.width +
			this.remainingText.width
		const startX = this.scale.width / 2 - totalWidth / 2
		this.typedText.setX(startX)
		this.caretText.setX(startX + this.typedText.width)
		this.remainingText.setX(
			startX + this.typedText.width + this.caretText.width,
		)
	}

	flashCaret(color: string) {
		this.caretText.setColor(color)
		if (this.caretFlashTimer) this.caretFlashTimer.remove(false)
		this.caretFlashTimer = this.time.delayedCall(120, () => {
			this.caretText.setColor('#ff0')
		})
	}

	spawnPowerUp() {
		this.powerUpType = null
		if (this.powerUpSprite) {
			this.powerUpSprite.setVisible(false)
		}
		if (Math.random() < 0.05) {
			this.powerUpType = Math.random() < 0.5 ? 'ice' : 'bomb'
			if (!this.powerUpSprite) {
				this.powerUpSprite = this.add
					.image(
						this.monster.x,
						this.monster.y - 40,
						this.powerUpType,
					)
					.setOrigin(0.5)
					.setScale(1.5)
					.setDepth(9) // Just below the monster
			} else {
				this.powerUpSprite.setTexture(this.powerUpType)
				this.powerUpSprite.setX(this.monster.x)
				this.powerUpSprite.setY(this.monster.y - 40)
				this.powerUpSprite.setVisible(true)
			}
		}
	}

	handlePowerUp() {
		if (this.powerUpType === 'ice') {
			this.obstacleFrozen = true
			if (this.powerUpSprite) this.powerUpSprite.setTint(0x00eaff)
			this.time.delayedCall(1000, () => {
				this.obstacleFrozen = false
				if (this.powerUpSprite) {
					this.powerUpSprite.clearTint()
					this.powerUpSprite.setVisible(false)
				}
			})
		} else if (this.powerUpType === 'bomb') {
			if (this.powerUpSprite) {
				this.powerUpSprite.setTint(0xff4444)
			}
			// Spawn a new monster with death animation for bomb
			this.spawnNewMonster(true)
			this.time.delayedCall(200, () => {
				if (this.powerUpSprite) {
					this.powerUpSprite.clearTint()
					this.powerUpSprite.setVisible(false)
				}
			})
		}
		this.powerUpType = null
	}

	// Create ground layers using Layer_0000.png and Layer_0001.png
	createGroundLayers() {
		const { width, height } = this.scale
		this.groundLayers = []

		// Add Layer_0001.png (back ground layer)
		if (this.textures.exists('ground_back')) {
			const groundLayer1 = this.add
				.tileSprite(0, 0, width, height, 'ground_back')
				.setOrigin(0, 0)
				.setDepth(-1) // Above all background layers
			this.groundLayers.push(groundLayer1)
		}

		// Add Layer_0000.png (front ground layer)
		if (this.textures.exists('ground_front')) {
			const groundLayer0 = this.add
				.tileSprite(0, 0, width, height, 'ground_front')
				.setOrigin(0, 0)
				.setDepth(0) // Above the back ground layer
			this.groundLayers.push(groundLayer0)
		}
	}

	// Create a parallax background using the Layer_00XX.png files
	createParallaxBackground() {
		// Clear any previous background layers
		this.backgroundLayers = []
		const { width, height } = this.scale

		// Create layers from back to front (Layer_0011 to Layer_0002)
		for (let i = 2; i <= 11; i++) {
			const layerNum = i.toString().padStart(4, '0')
			const layerKey = `layer_${layerNum}`

			if (this.textures.exists(layerKey)) {
				// Calculate depth: farthest (Layer_0011) = -9, closest (Layer_0002) = 0
				const depth = -1 * i // This gives -9 for i=2, up to 0 for i=11

				const layer = this.add
					.tileSprite(0, 0, width, height, layerKey)
					.setOrigin(0)
					.setScrollFactor(0)
					.setDepth(depth)

				this.backgroundLayers.push(layer)
			} else {
				console.warn(`Texture ${layerKey} not found`)
			}
		}
	}

	// Keep the minimal background as a fallback
	createMinimalBackground() {
		// Just add a simple ground
		const ground = this.add.graphics()
		ground.fillStyle(0x228b22, 0.5) // Semi-transparent green
		ground.fillRect(0, 600, 1280, 120)
	}

	stopAllSounds() {
		if (this.bgMusic) this.bgMusic.stop()
		if (this.runSound) this.runSound.stop()
	}

	shutdown() {
		// Stop all sounds
		this.stopAllSounds()

		// Clean up timers
		if (this.statsUpdateTimer) {
			this.statsUpdateTimer.remove()
		}

		// Remove the ESC key handler
		this.input.keyboard?.off('keydown-ESC', this.escKeyHandler)
	}

	// Modify the spawnNewMonster method to update physics body
	async spawnNewMonster(playDeathAnimation = true) {
		if (this.monster) {
			if (playDeathAnimation) {
				// Disable collision detection during death animation
				this.obstacleFrozen = true

				if (!this.settings.muted) {
					this.monsterHitSound.play()
				}
				// Play death animation and wait for it to complete
				await this.monster.playDeathAnimation()
				// Re-enable collision detection
				this.obstacleFrozen = false
			}

			// Destroy the monster after animation completes
			this.monster.destroy()
		}

		const { height } = this.scale
		const monsterType = Monster.getRandomType()

		// Create monster at the right side of the screen
		this.monster = new Monster(
			this,
			this.scale.width + 100,
			height - 80,
			monsterType,
		)
		this.add.existing(this.monster)

		// Enable physics on the new monster
		this.physics.world.enable(this.monster)
		this.monsterBody = this
			.monster as unknown as Phaser.Physics.Arcade.Sprite

		// Adjust hitbox size for monster based on type
		if (this.monsterBody.body) {
			// Make the hitbox much smaller than the visual sprite for more accurate collision
			this.monsterBody.body.setSize(30, 60, true)

			// Position hitbox in the monster's torso/center area
			this.monsterBody.body.setOffset(60, 50)
		}

		// Update power-up position if needed
		if (this.powerUpSprite) {
			this.powerUpSprite.setX(this.monster.x)
			this.powerUpSprite.setY(this.monster.y - 40)
			this.powerUpSprite.setVisible(this.powerUpType !== null)
		}
	}

	// Add a new method to increase difficulty
	increaseDifficulty() {
		this.difficultyLevel++

		// Cap the max speed increase at 100% faster than base speed
		const maxSpeedMultiplier = 2.0
		const speedIncrease = Math.min(
			0.1 * this.difficultyLevel,
			maxSpeedMultiplier,
		)

		this.baseObstacleSpeed =
			this.baseObstacleSpeed * (1 + speedIncrease * 0.1)
		this.obstacleSpeed = this.baseObstacleSpeed

		// Play speed up sound on mistake
		if (!this.settings.muted) {
			this.speedUpSound.play()
		}
	}

	// Add a new method to pause/resume game animations
	pauseGameAnimations(pause: boolean) {
		this.settings = loadData().settings

		// Pause/resume monster animations
		if (this.monster) {
			if (pause) {
				this.monster.anims.pause()
			} else {
				this.monster.anims.resume()
			}
		}

		// Pause/resume avatar animations
		if (this.avatar) {
			if (pause) {
				this.avatar.anims.pause()
				// Pause running sound
				if (this.runSound && this.runSound.isPlaying) {
					this.runSound.pause()
				}

				if (this.speedUpSound && this.speedUpSound.isPlaying) {
					this.speedUpSound.pause()
				}
			} else {
				this.avatar.anims.resume()
				// Resume running sound if not muted
				if (this.runSound && !this.settings.muted) {
					this.runSound.resume()
				}
				if (this.speedUpSound && !this.settings.muted) {
					this.speedUpSound.resume()
				}
			}
		}

		// Pause/resume background movement by setting a flag
		this.obstacleFrozen = pause
	}

	// Pause all game sounds (music + SFX)
	pauseAllGameSounds() {
		if (this.bgMusic && this.bgMusic.isPlaying) this.bgMusic.pause()
		if (this.runSound && this.runSound.isPlaying) this.runSound.pause()
		if (this.speedUpSound && this.speedUpSound.isPlaying)
			this.speedUpSound.pause()
		if (this.monsterHitSound && this.monsterHitSound.isPlaying)
			this.monsterHitSound.pause()
		if (this.clickSound && this.clickSound.isPlaying)
			this.clickSound.pause()
	}

	// Resume all game sounds if not muted, otherwise keep them paused
	resumeAllGameSounds() {
		this.settings = loadData().settings
		if (!this.settings.muted) {
			if (this.bgMusic && this.bgMusic.isPaused) this.bgMusic.resume()
			if (this.runSound && this.runSound.isPaused) this.runSound.resume()
			if (this.speedUpSound && this.speedUpSound.isPaused)
				this.speedUpSound.resume()
			// SFX like monsterHitSound/clickSound are one-shots, don't resume
		} else {
			if (this.bgMusic && this.bgMusic.isPlaying) this.bgMusic.pause()
			if (this.runSound && this.runSound.isPlaying) this.runSound.pause()
			if (this.speedUpSound && this.speedUpSound.isPlaying)
				this.speedUpSound.pause()
		}
	}

	handleEscKey() {
		if (this.settingsModalOpen) return

		this.settings = loadData().settings

		this.settingsModalOpen = true
		this.input.keyboard!.enabled = false

		// Pause animations and game physics
		this.pauseGameAnimations(true)
		// Pause all sounds
		this.pauseAllGameSounds()

		// Play pause sound if not muted
		if (!this.settings.muted) {
			this.sound.play('pauseSound')
		}

		const modal = new SettingsModal(this, () => {
			this.settingsModalOpen = false
			this.input.keyboard!.enabled = true

			// Resume animations and game physics
			this.pauseGameAnimations(false)
			// Resume or keep paused all sounds based on mute
			this.resumeAllGameSounds()

			this.settings = loadData().settings
			// Play unpause sound if not muted
			if (!this.settings.muted) {
				this.sound.play('unpauseSound')
			}
		})
		this.children.add(modal)

		// Set higher depth to ensure modal appears above all game elements
		modal.setDepth(100)
	}

	// Add method to update typing statistics
	updateTypingStats() {
		// Calculate time elapsed in minutes
		const timeElapsed = (this.time.now - this.gameStartTime) / 60000 // Convert to minutes

		// Calculate WPM (assuming average word length of 5 characters)
		if (timeElapsed > 0) {
			this.currentWPM = Math.round(
				this.correctKeystrokes / 5 / timeElapsed,
			)
		}

		// Calculate accuracy - continuous calculation
		if (this.totalKeystrokes > 0) {
			this.currentAccuracy = Math.round(
				(this.correctKeystrokes / this.totalKeystrokes) * 100,
			)
		} else if (timeElapsed > 0.05) {
			// After 3 seconds, start showing 0% if no input
			this.currentAccuracy = 0
		}

		this.updateHUD()
	}
}
