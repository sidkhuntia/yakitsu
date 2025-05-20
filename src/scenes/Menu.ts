import Phaser from 'phaser';
import { loadData } from '../systems/persistence';

export default class Menu extends Phaser.Scene {
    constructor() {
        super('Menu');
    }

    create() {
        const { width, height } = this.scale;
        const bestScore = loadData().bestScore;
        this.add.text(width / 2, height / 2 - 60, 'Yatiksu', {
            font: '48px monospace',
            color: '#fff',
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2, `Best Score: ${bestScore}`, {
            font: '24px monospace',
            color: '#fff',
        }).setOrigin(0.5);

        const startBtn = this.add.text(width / 2, height / 2 + 60, '[ Start Game ]', {
            font: '32px monospace',
            color: '#0f0',
            backgroundColor: '#222',
            padding: { left: 16, right: 16, top: 8, bottom: 8 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        startBtn.on('pointerdown', () => {
            this.scene.start('Play'); // Play scene to be implemented
        });
    }
} 