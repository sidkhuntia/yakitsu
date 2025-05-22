import Phaser from 'phaser';
import { loadData } from '../systems/persistence';
import type { MonsterType } from '../systems/Monster'; // Import MonsterType

declare global {
    interface Window {
        THESAURUS: any; // For words.js
    }
}

export default class Menu extends Phaser.Scene {
    private music!: Phaser.Sound.BaseSound;
    private clickSound!: Phaser.Sound.BaseSound;
    private startGameButton!: Phaser.GameObjects.Text;
    private assetsLoaded: boolean = false;

    constructor() {
        super('Menu');
    }

    preload() {
        // Assets for Play scene - loaded in the background
        this.load.image('ice', 'assets/ice.png');
        this.load.image('bomb', 'assets/bomb.png');
        this.load.script('words', 'data/words/words.js');

        this.load.audio('bgMusic', 'assets/audio/background_music.wav');
        this.load.audio('runSound', 'assets/audio/avatar/run.wav');
        this.load.audio('speedUpSound', 'assets/audio/avatar/speed_up.wav');
        this.load.audio('monsterHitSound', 'assets/audio/monsters/hit.wav');

        for (let i = 2; i <= 11; i++) {
            const layerNum = i.toString().padStart(4, '0');
            this.load.image(`layer_${layerNum}`, `assets/background/Layer_${layerNum}.png`);
        }
        this.load.image('ground_back', 'assets/background/Layer_0001.png');
        this.load.image('ground_front', 'assets/background/Layer_0000.png');
        this.load.spritesheet('avatar_run', 'assets/character/Run.png', { frameWidth: 180, frameHeight: 180 });

        const monsterTypes: MonsterType[] = ['Skeleton', 'Flying eye', 'Mushroom', 'Goblin'];
        monsterTypes.forEach(type => {
            this.load.spritesheet(`monster_${type}_run`, `assets/monsters/${type}/Run.png`, { frameWidth: 150, frameHeight: 150 });
            this.load.spritesheet(`monster_${type}_death`, `assets/monsters/${type}/Death.png`, { frameWidth: 150, frameHeight: 150 });
            this.load.spritesheet(`monster_${type}_hit`, `assets/monsters/${type}/Take Hit.png`, { frameWidth: 150, frameHeight: 150 });
        });

        this.load.on('complete', () => {
            this.assetsLoaded = true;
            if (this.startGameButton) {
                this.startGameButton.setText('[ Start Game ]');
                this.startGameButton.setStyle({ color: '#0f0' }); // Restore original color
            }
        });
    }

    create() {
        const { width, height } = this.scale;
        const bestScore = loadData().bestScore;
        const settings = loadData().settings;
        this.add.image(width / 2, height / 2, 'menuBackground').setOrigin(0.5).setAlpha(0.65);

        // Play menu background music
        this.music = this.sound.add('menuMusic', {
            volume: 0.2,
            loop: true
        });

        // Only play if not muted
        if (!settings.muted) {
            this.music.play();
        } else {
            this.music.pause();
        }

        // Make music available globally
        this.game.registry.set('menuMusic', this.music);

        // Add click sound
        this.clickSound = this.sound.add('clickSound', { volume: 0.7 });

        this.add.text(width / 2, height / 2 - 70, 'YAKITSU', {
            fontFamily: 'Retro Font',
            fontSize: '72px',
            color: '#ffb347', // bright orange
            stroke: '#7a2d06', // dark brown outline
            strokeThickness: 10,
            shadow: {
                offsetX: 6,
                offsetY: 8,
                color: '#000',
                blur: 0,
                fill: true
            },
            padding: { left: 16, right: 16, top: 8, bottom: 8 },
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2, `Best Score: ${bestScore}`, {
            font: '24px Retro Font',
            color: '#fff',
            backgroundColor: '#222',
            padding: { left: 16, right: 16, top: 8, bottom: 8 },
            align: 'center',
            stroke: '#000',
            strokeThickness: 2,


        }).setOrigin(0.5);

        this.startGameButton = this.add.text(width / 2, height / 2 + 60, 'Loading Assets...', {
            font: '32px Retro Font',
            color: '#aaa', // Initial color for loading state
            backgroundColor: '#222',
            padding: { left: 16, right: 16, top: 8, bottom: 8 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        if (this.assetsLoaded) {
            this.startGameButton.setText('[ Start Game ]');
            this.startGameButton.setStyle({ color: '#0f0' });
        }

        this.startGameButton.on('pointerdown', () => {
            if (!this.assetsLoaded) return; // Don't start if assets not loaded

            if (!settings.muted) {
                this.clickSound.play();
            }
            this.music.stop();
            this.scene.start('Play');
        });
    }
} 