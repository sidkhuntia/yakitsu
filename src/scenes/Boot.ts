import Phaser from 'phaser';

export default class Boot extends Phaser.Scene {
    constructor() {
        super('Boot');
    }

    preload() {
        this.load.image('logo', 'assets/placeholder.png'); // Replace with your logo file
    }

    create() {
        const { width, height } = this.scale;
        this.cameras.main.setBackgroundColor('#181820');
        // Logo
        const logo = this.add.image(width / 2, height / 2 - 40, 'logo').setOrigin(0.5).setAlpha(0);
        this.tweens.add({
            targets: logo,
            alpha: 1,
            duration: 600,
            ease: 'Quad.easeIn',
        });
        // Loading text
        const loadingText = this.add.text(width / 2, height / 2 + 60, 'Loading...', {
            font: '24px monospace',
            color: '#aaa',
        }).setOrigin(0.5).setAlpha(0);
        this.tweens.add({
            targets: loadingText,
            alpha: 1,
            delay: 400,
            duration: 400,
            ease: 'Quad.easeIn',
        });
        // Fade out and transition
        this.time.delayedCall(1400, () => {
            this.cameras.main.fadeOut(400, 24, 24, 32);
        });
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('Menu');
        });
    }
} 