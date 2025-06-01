import Phaser from 'phaser'
import { loadData, saveRun } from '../systems/persistence'

export default class GameOver extends Phaser.Scene {
	private score: number = 0
	private bestScore: number = 0
	private wpm: number = 0
	private accuracy: number = 100

	constructor() {
		super('GameOver')
	}

	init(data: { score?: number; wpm?: number; accuracy?: number }) {
		this.score = data.score ?? 0
		this.wpm = data.wpm ?? 0
		this.accuracy = data.accuracy ?? 100
		saveRun(this.score)
		this.bestScore = loadData().bestScore
	}

	create() {
		const { width, height } = this.scale
		this.add
			.image(width / 2, height / 2, 'gameOverBackground')
			.setOrigin(0.5)
		this.add
			.text(width / 2, height / 2 - 80, 'Game Over', {
				font: '42px Retro Font',
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
				.text(width / 2, height / 2 - 130, congrats, {
					font: '26px Retro Font',
					color: '#0ff',
				})
				.setOrigin(0.5)
		}

		this.add
			.text(
				width / 2,
				height / 2 - 30,
				`Score: ${this.score}\nBest: ${this.bestScore}`,
				{
					font: '28px Retro Font',
					color: '#fff',
					align: 'center',
					lineSpacing: 8,
				},
			)
			.setOrigin(0.5)

		// Add typing statistics
		this.add
			.text(
				width / 2,
				height / 2 + 30,
				`Average WPM: ${this.wpm}\nAverage Accuracy: ${this.accuracy}%`,
				{
					font: '20px Retro Font',
					color: '#f39c12',
					align: 'center',
					lineSpacing: 6,
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
			.text(width / 2, height / 2 + 90, '[ Menu ]', {
				font: '24px Retro Font',
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
