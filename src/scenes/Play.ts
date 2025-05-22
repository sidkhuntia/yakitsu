import Phaser from 'phaser';
import { TypingEngine } from '../systems/typingEngine';
import { loadData, saveRun, type SaveData } from '../systems/persistence';
import { SettingsModal } from '../systems/SettingsModal';
import { GameOverModal } from '../systems/GameOverModal';
import { Monster } from '../systems/Monster';

declare global {
    interface Window {
        THESAURUS: any;
    }
}

function getRandom(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
}

export default class Play extends Phaser.Scene {
    private engine!: TypingEngine;
    private typedText!: Phaser.GameObjects.Text;
    private caretText!: Phaser.GameObjects.Text;
    private remainingText!: Phaser.GameObjects.Text;
    private infoText!: Phaser.GameObjects.Text;
    private avatar!: Phaser.GameObjects.Sprite;
    private monster!: Monster;
    // private groundTiles: Phaser.GameObjects.Image[] = [];
    private score: number = 0;
    private combo: number = 0;
    private lives: number = 3;
    private scoreText!: Phaser.GameObjects.Text;
    private comboText!: Phaser.GameObjects.Text;
    private livesText!: Phaser.GameObjects.Text;
    private gameOverTriggered = false;
    private easyWords: string[] = [];
    private mediumWords: string[] = [];
    private hardWords: string[] = [];
    private bigWords: string[] = [];
    private largeWords: string[] = [];
    private wordsCompleted = 0;
    private caretFlashTimer?: Phaser.Time.TimerEvent;
    private powerUpType: 'ice' | 'bomb' | null = null;
    private powerUpSprite?: Phaser.GameObjects.Image;
    private obstacleFrozen = false;
    private inputLocked = false;
    private obstacleSpeed = 2;
    private baseObstacleSpeed = 2;
    private difficultyLevel = 1;
    private settingsModalOpen = false;
    private backgroundLayers: Phaser.GameObjects.TileSprite[] = [];
    private groundLayers: Phaser.GameObjects.TileSprite[] = [];
    // private avatarMoving: boolean = false;
    private fullscreenBtn!: Phaser.GameObjects.DOMElement;
    private fullscreenChangeHandler?: () => void;
    private resizeHandler?: () => void;
    private speedMultiplier = 1.1;
    private escKeyHandler: (event: KeyboardEvent) => void = () => this.handleEscKey();
    private avatarBody!: Phaser.Physics.Arcade.Sprite;
    private monsterBody!: Phaser.Physics.Arcade.Sprite;
    private runSound!: Phaser.Sound.BaseSound;
    private speedUpSound!: Phaser.Sound.BaseSound;
    private monsterHitSound!: Phaser.Sound.BaseSound;
    private clickSound!: Phaser.Sound.BaseSound;
    private bgMusic!: Phaser.Sound.BaseSound;
    private settings!: Partial<SaveData['settings']>;

    constructor() {
        super('Play');
    }

    preload() {
        // All assets are preloaded by the Menu scene.
        // This method can be kept for scene-specific logic if needed in the future,
        // or for assets that are *only* used if this scene is reached through a specific path
        // (though generally, preloading in a dedicated loading/menu scene is better).

        // Example: if you had a very specific, rarely used asset just for Play:
        // this.load.image('rare_play_asset', 'assets/rare_play_asset.png');
    }

    create() {
        this.score = 0;
        this.combo = 0;
        this.lives = 3;
        this.gameOverTriggered = false;
        this.wordsCompleted = 0;
        this.obstacleSpeed = this.baseObstacleSpeed;
        this.difficultyLevel = 1;

        // Access words from the global THESAURUS object (loaded by Menu scene)
        this.easyWords = window.THESAURUS?.three || [];
        this.mediumWords = window.THESAURUS?.small || [];
        this.hardWords = window.THESAURUS?.medium || [];
        this.bigWords = window.THESAURUS?.big || [];
        this.largeWords = window.THESAURUS?.large || [];

        if (this.easyWords.length === 0 && this.mediumWords.length === 0 && this.hardWords.length === 0) {
            console.warn('Word lists are empty! Falling back to default word.');
        }

        const firstWord = this.getNextWord();
        this.engine = new TypingEngine(firstWord);
        this.settings = loadData().settings;

        this.bgMusic = this.sound.add('bgMusic', {
            volume: 0.17,
            loop: true
        });
        this.game.registry.set('bgMusic', this.bgMusic); // Make bgMusic accessible from SettingsModal
        if (!this.settings.muted) {
            this.bgMusic.play();
        } else {
            this.bgMusic.pause();
        }

        this.runSound = this.sound.add('runSound', { volume: 1, loop: true });
        if (!this.settings.muted) {
            this.runSound.play();
        } else {
            this.runSound.pause();
        }
        this.speedUpSound = this.sound.add('speedUpSound', { volume: 0.5 });
        this.monsterHitSound = this.sound.add('monsterHitSound', { volume: 0.6 });
        this.clickSound = this.sound.add('clickSound', { volume: 0.7 });

        this.cameras.main.setBackgroundColor('#94AAB0');
        this.createParallaxBackground();
        this.createGroundLayers();
        this.createSprites();
        this.createText();
        this.createHUD();
        this.updateWordDisplay();
        this.updateHUD();

        this.physics.world.enable([this.avatar, this.monster]);
        this.avatarBody = this.avatar as unknown as Phaser.Physics.Arcade.Sprite;
        this.monsterBody = this.monster as unknown as Phaser.Physics.Arcade.Sprite;

        if (this.avatarBody.body) {
            this.avatarBody.body.setSize(40, 70, true);
            this.avatarBody.body.setOffset(70, 60);
        }
        if (this.monsterBody && this.monsterBody.body) {
            this.monsterBody.body.setSize(30, 60, true);
            this.monsterBody.body.setOffset(60, 50);
        }

        this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
            if (this.engine.isComplete() || this.gameOverTriggered || this.inputLocked) return;
            if (!/^[a-zA-Z]$/.test(event.key)) return;
            const ok = this.engine.input(event.key);
            this.updateWordDisplay();
            if (ok) {
                this.flashCaret('#0f0');
                this.infoText.setText('');
                if (this.monster) {
                    this.monster.playHitAnimation();
                }
                if (this.engine.isComplete()) {
                    if (this.powerUpType) {
                        this.handlePowerUp();
                    }
                    this.handleWordComplete();
                }
            } else {
                this.flashCaret('#f44');
                this.combo = 0;
                this.updateHUD();
                this.infoText.setText('Wrong key!');
                this.obstacleSpeed *= this.speedMultiplier;
                this.time.delayedCall(500, () => {
                    this.obstacleSpeed /= this.speedMultiplier;
                });
                if (this.settings.lockInputOnMistake) {
                    this.inputLocked = true;
                    this.time.delayedCall(500, () => { this.inputLocked = false; });
                }
            }
        });

        this.input.keyboard!.on('keydown-ESC', this.escKeyHandler);
        this.scale.on('resize', this.handleResize, this);
        this.createFullscreenButton();
    }

    createHUD() {
        this.livesText = this.add.text(20, 20, '', {
            fontFamily: 'Retro Font',
            fontSize: '34px',
            color: '#f44',
        }).setOrigin(0, 0).setDepth(20);
        this.scoreText = this.add.text(this.scale.width - 20, 20, '', {
            fontFamily: 'Retro Font',
            fontSize: '28px',
            color: '#fff',
        }).setOrigin(1, 0).setDepth(20);
        this.comboText = this.add.text(this.scale.width - 20, 60, '', {
            fontFamily: 'Retro Font',
            fontSize: '20px',
            color: '#0ff',
        }).setOrigin(1, 0).setDepth(20);
    }

    updateHUD() {
        this.livesText.setText('❤️'.repeat(this.lives));
        this.scoreText.setText(`Score: ${this.score}`);
        this.comboText.setText(`Combo: ${this.combo}`);
        this.scoreText.setX(this.scale.width - 20);
        this.comboText.setX(this.scale.width - 20);
    }

    getNextWord(): string {
        const w = this.wordsCompleted;
        if (w < 10 && this.easyWords.length) return getRandom(this.easyWords);
        if (w < 20 && this.mediumWords.length) return getRandom(this.mediumWords);
        if (w < 40 && this.hardWords.length) return getRandom(this.hardWords);
        if (w < 60 && this.bigWords?.length) return getRandom(this.bigWords);
        if (this.largeWords?.length) return getRandom(this.largeWords);
        return 'yakitsu';
    }

    handleWordComplete() {
        const base = 10 * this.engine.getWord().length;
        const bonus = 1 + Math.floor(this.combo / 20) * 0.25;
        this.score += Math.floor(base * bonus);
        this.combo++;
        this.wordsCompleted++;
        this.infoText.setText('Word complete!');
        this.updateHUD();
        this.spawnPowerUp();
        if (this.wordsCompleted % 5 === 0) {
            this.increaseDifficulty();
        }
        this.spawnNewMonster();
        const nextWord = this.getNextWord();
        this.engine.reset(nextWord);
        this.updateWordDisplay();
        this.infoText.setText('');
    }

    loseLife() {
        if (this.gameOverTriggered) return;
        this.lives--;
        this.combo = 0;
        this.updateHUD();
        if (this.lives <= 0) {
            this.triggerGameOver();
        } else {
            this.spawnNewMonster();
        }
    }

    triggerGameOver() {
        this.gameOverTriggered = true;
        this.stopAllSounds();
        if (typeof saveRun === 'function') {
            saveRun(this.score);
        }
        this.typedText.setVisible(false);
        this.caretText.setVisible(false);
        this.remainingText.setVisible(false);
        this.infoText.setVisible(false);
        this.scoreText.setVisible(false);
        this.comboText.setVisible(false);
        this.livesText.setVisible(false);
        this.avatar.setVisible(false);
        const bestScore = (typeof loadData === 'function') ? loadData().bestScore : 0;
        const modal = new GameOverModal(this, this.score, bestScore,
            () => { this.scene.restart(); },
            () => { this.scene.start('Menu'); }
        );
        this.children.add(modal);
        this.time.delayedCall(2000, () => {
            if (this.scene.isActive('Play')) {
                this.scene.start('GameOver', { score: this.score });
            }
        });
    }

    createSprites() {
        const { height } = this.scale;
        this.avatar = this.add.sprite(120, height - 90, 'avatar_run', 0)
            .setOrigin(0.5)
            .setScale(2)
            .setDepth(10);
        if (!this.anims.exists('avatar-run')) {
            this.anims.create({
                key: 'avatar-run',
                frames: this.anims.generateFrameNumbers('avatar_run', { start: 0, end: 7 }),
                frameRate: 10,
                repeat: -1
            });
        }
        this.avatar.play('avatar-run');
        const monsterType = Monster.getRandomType();
        this.monster = new Monster(this, this.scale.width + 100, height - 80, monsterType);
        this.add.existing(this.monster);
    }

    createText() {
        const { width, height } = this.scale;
        const letterSpacing = 5;
        this.typedText = this.add.text(width / 2, height / 2 - 20, '', {
            fontFamily: 'Retro Font',
            fontSize: '32px',
            color: '#0f0',
            letterSpacing,
        }).setOrigin(0, 0.5).setDepth(20).setAlpha(0.2);

        this.caretText = this.add.text(-20, height / 2 - 20, '', {
            fontFamily: 'Retro Font',
            fontSize: '32px',
            color: '#ff0',
            letterSpacing,
        }).setOrigin(0, 0.5).setDepth(20);

        this.remainingText = this.add.text(0, height / 2 - 20, '', {
            fontFamily: 'Retro Font',
            fontSize: '32px',
            color: '#fff',
            letterSpacing,
        }).setOrigin(0, 0.5).setDepth(20);

        this.infoText = this.add.text(width / 2, height / 2 + 40, '', {
            fontFamily: 'Retro Font',
            fontSize: '24px',
            color: '#0ff',
        }).setOrigin(0.5).setDepth(20);
    }

    handleResize(_gameSize: Phaser.Structs.Size) { }

    update() {
        if (!this.gameOverTriggered && !this.settingsModalOpen) {
            const baseSpeed = this.obstacleSpeed * 0.5;
            for (let i = 0; i < this.backgroundLayers.length; i++) {
                const layerIndex = this.backgroundLayers.length - 1 - i;
                const speedFactor = 0.1 + (layerIndex * 0.1);
                this.backgroundLayers[i].tilePositionX += baseSpeed * speedFactor;
            }
            for (let i = 0; i < this.groundLayers.length; i++) {
                const speedFactor = 1.0 + (i * 0.2);
                this.groundLayers[i].tilePositionX += baseSpeed * speedFactor;
            }
            if (!this.obstacleFrozen) {
                this.monster.x -= this.obstacleSpeed * 2;
                if (this.monsterBody && this.monsterBody.body) {
                    this.monsterBody.x = this.monster.x;
                    this.monsterBody.y = this.monster.y;
                }
                if (this.monster.x < -100) {
                    this.spawnNewMonster(false);
                    if (this.engine.isComplete()) {
                        this.handleWordComplete();
                    }
                }
            }
            if (this.avatarBody && this.monsterBody) {
                this.physics.overlap(
                    this.avatarBody,
                    this.monsterBody,
                    this.handleCollision.bind(this),
                    undefined,
                    this
                );
            }
        }
    }

    handleCollision() {
        if (this.gameOverTriggered || this.obstacleFrozen) return;
        this.loseLife();
        if (this.gameOverTriggered) {
            this.monster.setVisible(false);
            this.monster.setActive(false);
        }
    }

    updateWordDisplay() {
        const word = this.engine.getWord().toUpperCase();
        const caret = this.engine.getCaret();
        const typed = word.slice(0, caret);
        const caretChar = caret < word.length ? word[caret] : '';
        const remaining = caret < word.length ? word.slice(caret + 1) : '';
        this.typedText.setText(typed);
        this.caretText.setText(caretChar);
        this.remainingText.setText(remaining);
        const totalWidth = this.typedText.width + this.caretText.width + this.remainingText.width;
        let startX = this.scale.width / 2 - totalWidth / 2;
        this.typedText.setX(startX);
        this.caretText.setX(startX + this.typedText.width);
        this.remainingText.setX(startX + this.typedText.width + this.caretText.width);
    }

    flashCaret(color: string) {
        this.caretText.setColor(color);
        if (this.caretFlashTimer) this.caretFlashTimer.remove(false);
        this.caretFlashTimer = this.time.delayedCall(120, () => {
            this.caretText.setColor('#ff0');
        });
    }

    spawnPowerUp() {
        this.powerUpType = null;
        if (this.powerUpSprite) {
            this.powerUpSprite.setVisible(false);
        }
        if (Math.random() < 0.05) {
            this.powerUpType = Math.random() < 0.5 ? 'ice' : 'bomb';
            if (!this.powerUpSprite) {
                this.powerUpSprite = this.add.image(this.monster.x, this.monster.y - 40, this.powerUpType)
                    .setOrigin(0.5)
                    .setScale(1.5)
                    .setDepth(9);
            } else {
                this.powerUpSprite.setTexture(this.powerUpType);
                this.powerUpSprite.setX(this.monster.x);
                this.powerUpSprite.setY(this.monster.y - 40);
                this.powerUpSprite.setVisible(true);
            }
        }
    }

    handlePowerUp() {
        if (this.powerUpType === 'ice') {
            this.obstacleFrozen = true;
            if (this.powerUpSprite) this.powerUpSprite.setTint(0x00eaff);
            this.time.delayedCall(1000, () => {
                this.obstacleFrozen = false;
                if (this.powerUpSprite) {
                    this.powerUpSprite.clearTint();
                    this.powerUpSprite.setVisible(false);
                }
            });
        } else if (this.powerUpType === 'bomb') {
            if (this.powerUpSprite) {
                this.powerUpSprite.setTint(0xff4444);
            }
            this.spawnNewMonster(true);
            this.time.delayedCall(200, () => {
                if (this.powerUpSprite) {
                    this.powerUpSprite.clearTint();
                    this.powerUpSprite.setVisible(false);
                }
            });
        }
        this.powerUpType = null;
    }

    createGroundLayers() {
        const { width, height } = this.scale;
        this.groundLayers = [];
        if (this.textures.exists('ground_back')) {
            const groundLayer1 = this.add.tileSprite(0, 0, width, height, 'ground_back')
                .setOrigin(0, 0)
                .setDepth(-1);
            this.groundLayers.push(groundLayer1);
        }
        if (this.textures.exists('ground_front')) {
            const groundLayer0 = this.add.tileSprite(0, 0, width, height, 'ground_front')
                .setOrigin(0, 0)
                .setDepth(0);
            this.groundLayers.push(groundLayer0);
        }
    }

    createParallaxBackground() {
        this.backgroundLayers = [];
        const { width, height } = this.scale;
        for (let i = 2; i <= 11; i++) {
            const layerNum = i.toString().padStart(4, '0');
            const layerKey = `layer_${layerNum}`;
            if (this.textures.exists(layerKey)) {
                const depth = -1 * i;
                const layer = this.add.tileSprite(0, 0, width, height, layerKey)
                    .setOrigin(0)
                    .setScrollFactor(0)
                    .setDepth(depth);
                this.backgroundLayers.push(layer);
            } else {
                console.warn(`Texture ${layerKey} not found`);
            }
        }
    }

    createMinimalBackground() {
        const ground = this.add.graphics();
        ground.fillStyle(0x228B22, 0.5);
        ground.fillRect(0, 600, 1280, 120);
    }

    createFullscreenButton() {
        const btn = document.createElement('button');
        btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="6" height="2" rx="1" fill="#0ff"/><rect x="2" y="2" width="2" height="6" rx="1" fill="#0ff"/><rect x="14" y="2" width="6" height="2" rx="1" fill="#0ff"/><rect x="18" y="2" width="2" height="6" rx="1" fill="#0ff"/><rect x="2" y="18" width="6" height="2" rx="1" fill="#0ff"/><rect x="2" y="14" width="2" height="6" rx="1" fill="#0ff"/><rect x="14" y="18" width="6" height="2" rx="1" fill="#0ff"/><rect x="18" y="14" width="2" height="6" rx="1" fill="#0ff"/></svg>`;
        btn.title = 'Toggle Fullscreen';
        btn.style.cssText = `
            background: rgba(30,40,50,0.85);
            border: 2px solid #0ff;
            border-radius: 50%;
            width: 48px; height: 48px;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 12px #0008;
            cursor: pointer;
            position: absolute;
            top: 24px; right: 32px;
            z-index: 100;
            transition: background 0.2s, border 0.2s;
        `;
        btn.onmouseenter = () => btn.style.background = 'rgba(0,255,255,0.18)';
        btn.onmouseleave = () => btn.style.background = 'rgba(30,40,50,0.85)';
        btn.onfocus = () => btn.onmouseenter?.(undefined as any);
        btn.onblur = () => btn.onmouseleave?.(undefined as any);
        btn.tabIndex = 0;
        btn.onclick = async () => {
            const canvas = this.sys.game.canvas;
            try {
                if (!document.fullscreenElement) {
                    await canvas.requestFullscreen();
                    btn.style.border = '2px solid #fff';
                } else {
                    await document.exitFullscreen();
                    btn.style.border = '2px solid #0ff';
                }
            } catch (err) {
                console.warn('Fullscreen request failed:', err);
            }
        };
        this.fullscreenBtn = this.add.dom(this.scale.width - 40, 40, btn).setOrigin(1, 0).setDepth(100);
        this.resizeHandler = () => {
            this.fullscreenBtn.setPosition(this.scale.width - 40, 40);
        };
        this.scale.on('resize', this.resizeHandler);
        this.fullscreenChangeHandler = () => {
            if (!document.fullscreenElement) {
                btn.style.border = '2px solid #0ff';
            } else {
                btn.style.border = '2px solid #fff';
            }
        };
        document.addEventListener('fullscreenchange', this.fullscreenChangeHandler);
    }

    stopAllSounds() {
        if (this.bgMusic && this.bgMusic.isPlaying) this.bgMusic.stop();
        if (this.runSound && this.runSound.isPlaying) this.runSound.stop();
    }

    shutdown() {
        this.stopAllSounds();
        if (this.resizeHandler) {
            this.scale.off('resize', this.resizeHandler);
            this.resizeHandler = undefined;
        }
        if (this.fullscreenChangeHandler) {
            document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);
            this.fullscreenChangeHandler = undefined;
        }
        this.input.keyboard?.off('keydown-ESC', this.escKeyHandler);
    }

    async spawnNewMonster(playDeathAnimation = true) {
        if (this.monster) {
            if (playDeathAnimation) {
                this.obstacleFrozen = true;
                await this.monster.playDeathAnimation();
                if (!this.settings.muted) {
                    this.monsterHitSound.play();
                }
                this.obstacleFrozen = false;
            }
            this.monster.destroy();
        }
        const { height } = this.scale;
        const monsterType = Monster.getRandomType();
        this.monster = new Monster(this, this.scale.width + 100, height - 80, monsterType);
        this.add.existing(this.monster);
        this.physics.world.enable(this.monster);
        this.monsterBody = this.monster as unknown as Phaser.Physics.Arcade.Sprite;
        if (this.monsterBody.body) {
            this.monsterBody.body.setSize(30, 60, true);
            this.monsterBody.body.setOffset(60, 50);
        }
        if (this.powerUpSprite) {
            this.powerUpSprite.setX(this.monster.x);
            this.powerUpSprite.setY(this.monster.y - 40);
            this.powerUpSprite.setVisible(this.powerUpType !== null);
        }
    }

    increaseDifficulty() {
        this.difficultyLevel++;
        const maxSpeedMultiplier = 2.0;
        const speedIncrease = Math.min(0.1 * this.difficultyLevel, maxSpeedMultiplier);
        this.baseObstacleSpeed = this.baseObstacleSpeed * (1 + speedIncrease * 0.1);
        this.obstacleSpeed = this.baseObstacleSpeed;
        if (!this.settings.muted) {
            this.speedUpSound.play();
        }
    }

    pauseGameAnimations(pause: boolean) {
        this.settings = loadData().settings;
        if (this.monster) {
            if (pause) {
                this.monster.anims.pause();
            } else {
                this.monster.anims.resume();
            }
        }
        if (this.avatar) {
            if (pause) {
                this.avatar.anims.pause();
                if (this.runSound && this.runSound.isPlaying) {
                    this.runSound.pause();
                }
                if (this.speedUpSound && this.speedUpSound.isPlaying) {
                    this.speedUpSound.pause();
                }
            } else {
                this.avatar.anims.resume();
                if (this.runSound && !this.settings.muted) {
                    this.runSound.resume();
                }
                if (this.speedUpSound && !this.settings.muted) {
                    this.speedUpSound.resume();
                }
            }
        }
        this.obstacleFrozen = pause;
    }

    pauseAllGameSounds() {
        if (this.bgMusic && this.bgMusic.isPlaying) this.bgMusic.pause();
        if (this.runSound && this.runSound.isPlaying) this.runSound.pause();
        if (this.speedUpSound && this.speedUpSound.isPlaying) this.speedUpSound.pause();
        if (this.monsterHitSound && this.monsterHitSound.isPlaying) this.monsterHitSound.pause();
        if (this.clickSound && this.clickSound.isPlaying) this.clickSound.pause();
    }

    resumeAllGameSounds() {
        this.settings = loadData().settings;
        if (!this.settings.muted) {
            if (this.bgMusic && this.bgMusic.isPaused) this.bgMusic.resume();
            if (this.runSound && this.runSound.isPaused) this.runSound.resume();
            if (this.speedUpSound && this.speedUpSound.isPaused) this.speedUpSound.resume();
        } else {
            if (this.bgMusic && this.bgMusic.isPlaying) this.bgMusic.pause();
            if (this.runSound && this.runSound.isPlaying) this.runSound.pause();
            if (this.speedUpSound && this.speedUpSound.isPlaying) this.speedUpSound.pause();
        }
    }

    handleEscKey() {
        if (this.settingsModalOpen) return;
        this.settings = loadData().settings;
        this.settingsModalOpen = true;
        this.input.keyboard!.enabled = false;
        this.pauseGameAnimations(true);
        this.pauseAllGameSounds();
        if (!this.settings.muted) {
            this.sound.play('pauseSound');
        }
        const modal = new SettingsModal(this, () => {
            this.settingsModalOpen = false;
            this.input.keyboard!.enabled = true;
            this.pauseGameAnimations(false);
            this.resumeAllGameSounds();
            this.settings = loadData().settings;
            if (!this.settings.muted) {
                this.sound.play('unpauseSound');
            }
        });
        this.children.add(modal);
        modal.setDepth(100);
    }
} 