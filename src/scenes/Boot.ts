import Phaser from 'phaser'

export default class Boot extends Phaser.Scene {
	constructor() {
		super('Boot')
	}

	preload() {
		this.load.image('logo', 'assets/placeholder.webp') // Replace with your logo file
		this.load.image('menuBackground', 'assets/menu_background.webp')
		this.load.image('gameOverBackground', 'assets/gameover_background.webp')

		// Load background music
		this.load.audio('bgMusic', 'assets/audio/background_music.mp3')
		this.load.audio(
			'menuMusic',
			'assets/audio/ui/menu_background_music.mp3',
		)

		// Load UI sounds
		this.load.audio('clickSound', 'assets/audio/ui/click.mp3')
		this.load.audio('pauseSound', 'assets/audio/ui/pause.mp3')
		this.load.audio('unpauseSound', 'assets/audio/ui/unpause.mp3')

		// Load avatar sounds
		this.load.audio('runSound', 'assets/audio/avatar/run.mp3')
		this.load.audio('speedUpSound', 'assets/audio/avatar/speed_up.mp3')

		// Load monster sounds
		this.load.audio('monsterHitSound', 'assets/audio/monsters/hit.mp3')
	}

	create() {
		const { width, height } = this.scale
		this.cameras.main.setBackgroundColor('#181820')
		// Logo
		const logo = this.add
			.image(width / 2, height / 2 - 40, 'logo')
			.setOrigin(0.5)
			.setAlpha(0)
		this.tweens.add({
			targets: logo,
			alpha: 1,
			duration: 600,
			ease: 'Quad.easeIn',
		})
		// Loading text
		const loadingText = this.add
			.text(width / 2, height / 2 + 60, 'Loading...', {
				font: '24px Retro Font',
				color: '#aaa',
			})
			.setOrigin(0.5)
			.setAlpha(0)
		this.tweens.add({
			targets: loadingText,
			alpha: 1,
			delay: 400,
			duration: 400,
			ease: 'Quad.easeIn',
		})
		// Fade out and transition
		this.time.delayedCall(1400, () => {
			this.cameras.main.fadeOut(400, 24, 24, 32)
		})
		this.cameras.main.once('camerafadeoutcomplete', () => {
			// Don't auto-start any scene - let HTML interface control startup
			// this.scene.start('Menu')
		})
	}
}
