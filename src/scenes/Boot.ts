import Phaser from 'phaser';

export default class Boot extends Phaser.Scene {
    constructor() {
        super('Boot');
    }

    preload() {
        this.load.image('logo', 'assets/placeholder.png'); // Your logo
        this.load.image('menuBackground', 'assets/menu_background.png');
        // Removed: gameOverBackground - can load in Menu or a dedicated GameOver_Preload scene if large
        // Removed: bgMusic (Play scene)
        this.load.audio('menuMusic', 'assets/audio/ui/menu_background_music.mp3');

        // UI sounds needed early
        this.load.audio('clickSound', 'assets/audio/ui/click.mp3');
        this.load.audio('pauseSound', 'assets/audio/ui/pause.wav');
        this.load.audio('unpauseSound', 'assets/audio/ui/unpause.wav');

        // Removed: Avatar sounds (Play scene)
        // Removed: Monster sounds (Play scene)
        // Font 'Retro Font' is loaded via CSS @font-face, so not handled by Phaser's loader here.
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
            font: '24px Retro Font',
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