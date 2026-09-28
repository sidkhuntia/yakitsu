import Phaser from 'phaser'

/**
 * Asset preloader.
 *
 * Loads everything for every scene up front and shows a real progress bar, so
 * the first word of a run is never gated on a lazy load.
 */
export default class Boot extends Phaser.Scene {
	private barFill?: Phaser.GameObjects.Rectangle
	private label?: Phaser.GameObjects.Text
	private readonly barWidth = 420

	constructor() {
		super('Boot')
	}

	preload(): void {
		const { width, height } = this.scale
		this.cameras.main.setBackgroundColor('#0a0f16')

		const barX = width / 2
		const barY = height / 2 + 40

		this.add
			.rectangle(barX, barY, this.barWidth, 18, 0x141d2b)
			.setStrokeStyle(2, 0x2c3e50)

		this.barFill = this.add
			.rectangle(barX - this.barWidth / 2, barY, 0, 14, 0x00e676)
			.setOrigin(0, 0.5)

		this.add
			.text(barX, barY - 60, 'YAKITSKU', {
				fontFamily: 'Retro Font',
				fontSize: '52px',
				color: '#ffb347',
			})
			.setOrigin(0.5)

		this.label = this.add
			.text(barX, barY + 40, 'LOADING 0%', {
				fontFamily: 'Retro Font',
				fontSize: '16px',
				color: '#7f8fa6',
			})
			.setOrigin(0.5)

		this.load.on('progress', (value: number) => {
			this.barFill?.setSize(this.barWidth * value, 14)
			this.label?.setText(`LOADING ${Math.round(value * 100)}%`)
		})

		// --- shared assets ---------------------------------------------------
		this.load.image('logo', 'assets/placeholder.webp')
		this.load.image('menuBackground', 'assets/menu_background.webp')
		this.load.image('gameOverBackground', 'assets/gameover_background.webp')

		this.load.audio('bgMusic', 'assets/audio/background_music.mp3')
		this.load.audio(
			'menuMusic',
			'assets/audio/ui/menu_background_music.mp3',
		)
		this.load.audio('clickSound', 'assets/audio/ui/click.mp3')
		this.load.audio('pauseSound', 'assets/audio/ui/pause.mp3')
		this.load.audio('unpauseSound', 'assets/audio/ui/unpause.mp3')
		this.load.audio('runSound', 'assets/audio/avatar/run.mp3')
		this.load.audio('speedUpSound', 'assets/audio/avatar/speed_up.mp3')
		this.load.audio('monsterHitSound', 'assets/audio/monsters/hit.mp3')

		// --- power-ups -------------------------------------------------------
		this.load.image('ice', 'assets/ice.png')
		this.load.image('bomb', 'assets/bomb.png')

		// --- word list -------------------------------------------------------
		this.load.script('words', 'data/words/words.js')

		// --- world -----------------------------------------------------------
		for (let n = 2; n <= 11; n++) {
			this.load.image(
				`layer_${String(n).padStart(4, '0')}`,
				`assets/background/Layer_${String(n).padStart(4, '0')}.png`,
			)
		}
		this.load.image('ground_back', 'assets/background/Layer_0001.png')
		this.load.image('ground_front', 'assets/background/Layer_0000.png')

		// --- actors ----------------------------------------------------------
		this.load.spritesheet('avatar_run', 'assets/character/Run.png', {
			frameWidth: 180,
			frameHeight: 180,
		})

		for (const type of ['Skeleton', 'Flying eye', 'Mushroom', 'Goblin']) {
			const dir = `assets/monsters/${type}`
			this.load.spritesheet(`monster_${type}_run`, `${dir}/Run.png`, {
				frameWidth: 150,
				frameHeight: 150,
			})
			this.load.spritesheet(`monster_${type}_death`, `${dir}/Death.png`, {
				frameWidth: 150,
				frameHeight: 150,
			})
			this.load.spritesheet(
				`monster_${type}_hit`,
				`${dir}/Take Hit.png`,
				{
					frameWidth: 150,
					frameHeight: 150,
				},
			)
		}
	}

	create(): void {
		// Everything is in the cache now; unblock any queued start request.
		this.game.events.emit('yk-assets-ready')

		this.cameras.main.fadeOut(260, 10, 15, 22)
		this.cameras.main.once(
			Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
			() => {
				// The HTML menu drives scene start, so Boot just gets out of the way.
				this.scene.stop()
			},
		)
	}
}
