import Phaser from 'phaser'
import { loadData, saveRun } from '../systems/persistence'

export default class GameOver extends Phaser.Scene {
	private score: number = 0
	private bestScore: number = 0

	constructor() {
		super('GameOver')
	}

	init(data: { score?: number }) {
		this.score = data.score ?? 0
		saveRun(this.score)
		this.bestScore = loadData().bestScore
	}

	create() {
		const { width, height } = this.scale
		this.add
			.image(width / 2, height / 2, 'gameOverBackground')
			.setOrigin(0.5)
		this.add
			.text(width / 2, height / 2 - 60, 'Game Over', {
				font: '48px Retro Font',
				color: '#f44',
			})
			.setOrigin(0.5)

		// Show congrats if new best or high score
		let congrats = ''
		if (this.score >= this.bestScore && this.score > 0) {
			congrats = 'New Best! Congratulations!'
		} else if (this.score >= 1000) {
			congrats = 'Congratulations!'
		}
		if (congrats) {
			this.add
				.text(width / 2, height / 2 - 110, congrats, {
					font: '32px Retro Font',
					color: '#0ff',
				})
				.setOrigin(0.5)
		}

		this.add
			.text(
				width / 2,
				height / 2,
				`Score: ${this.score}\nBest: ${this.bestScore}`,
				{
					font: '32px Retro Font',
					color: '#fff',
					align: 'center',
				},
			)
			.setOrigin(0.5)

		// const retryBtn = this.add.text(width / 2, height / 2 + 60, '[ Retry ]', {
		//     font: '28px monospace',
		//     color: '#0f0',
		//     backgroundColor: '#222',
		//     padding: { left: 16, right: 16, top: 8, bottom: 8 },
		// }).setOrigin(0.5).setInteractive({ useHandCursor: true });

		const menuBtn = this.add
			.text(width / 2, height / 2 + 110, '[ Menu ]', {
				font: '28px Retro Font',
				color: '#0ff',
				backgroundColor: '#222',
				padding: { left: 16, right: 16, top: 8, bottom: 8 },
			})
			.setOrigin(0.5)
			.setInteractive({ useHandCursor: true })

		// retryBtn.on('pointerdown', () => {
		//     this.scene.start('Play');
		// });
		menuBtn.on('pointerdown', () => {
			this.scene.start('Menu')
		})
	}
}
