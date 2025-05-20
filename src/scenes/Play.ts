import Phaser from 'phaser';
import { TypingEngine } from '../systems/typingEngine';
import { loadData } from '../systems/persistence';
import { SettingsModal } from '../systems/SettingsModal';

function getRandom(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
}

export default class Play extends Phaser.Scene {
    private engine!: TypingEngine;
    private typedText!: Phaser.GameObjects.Text;
    private caretText!: Phaser.GameObjects.Text;
    private remainingText!: Phaser.GameObjects.Text;
    private infoText!: Phaser.GameObjects.Text;
    private avatar!: Phaser.GameObjects.Image;
    private obstacle!: Phaser.GameObjects.Image;
    private groundTiles: Phaser.GameObjects.Image[] = [];
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
    private wordsLoaded = false;
    private wordsCompleted = 0;
    private caretFlashTimer?: Phaser.Time.TimerEvent;
    private powerUpType: 'ice' | 'bomb' | null = null;
    private powerUpSprite?: Phaser.GameObjects.Image;
    private obstacleFrozen = false;
    private inputLocked = false;
    private obstacleSpeed = 2;
    private settingsModalOpen = false;

    constructor() {
        super('Play');
    }

    preload() {
        this.load.image('avatar', 'assets/avatar.png');
        this.load.image('ground', 'assets/ground.png');
        this.load.image('obstacle', 'assets/obstacle.png');
        this.load.image('ice', 'assets/ice.png');
        this.load.image('bomb', 'assets/bomb.png');
        this.load.json('easyWords', 'data/words/easy.json');
        this.load.json('mediumWords', 'data/words/medium.json');
        this.load.json('hardWords', 'data/words/hard.json');
    }

    create() {
        this.score = 0;
        this.combo = 0;
        this.lives = 3;
        this.gameOverTriggered = false;
        this.wordsCompleted = 0;
        this.easyWords = this.cache.json.get('easyWords') || [];
        this.mediumWords = this.cache.json.get('mediumWords') || [];
        this.hardWords = this.cache.json.get('hardWords') || [];
        this.wordsLoaded = this.easyWords.length > 0 && this.mediumWords.length > 0 && this.hardWords.length > 0;
        const firstWord = this.getNextWord();
        this.engine = new TypingEngine(firstWord);
        this.createGround();
        this.createSprites();
        this.createText();
        this.createHUD();
        this.updateWordDisplay();
        this.updateHUD();

        this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
            if (this.engine.isComplete() || this.gameOverTriggered || this.inputLocked) return;
            // Only allow a-z or A-Z
            if (!/^[a-zA-Z]$/.test(event.key)) return;
            const expected = this.engine.getWord()[this.engine.getCaret()];
            const ok = this.engine.input(event.key);
            this.updateWordDisplay();
            if (ok) {
                this.flashCaret('#0f0');
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
                // Speed up obstacle for 1s
                this.obstacleSpeed = this.obstacleSpeed * 1.20;
                this.time.delayedCall(500, () => { this.obstacleSpeed = this.obstacleSpeed / 1.20; });
                // Lock input if setting enabled
                const { lockInputOnMistake } = loadData().settings;
                if (lockInputOnMistake) {
                    this.inputLocked = true;
                    this.time.delayedCall(500, () => { this.inputLocked = false; });
                }
            }
        });

        this.input.keyboard!.on('keydown-ESC', () => {
            if (this.settingsModalOpen) return;
            this.settingsModalOpen = true;
            this.input.keyboard!.enabled = false;
            const modal = new SettingsModal(this, () => {
                this.settingsModalOpen = false;
                this.input.keyboard!.enabled = true;
            });
            this.children.add(modal);
        });

        this.scale.on('resize', this.handleResize, this);
    }

    createHUD() {
        // Lives (hearts)
        this.livesText = this.add.text(20, 20, '', {
            font: '28px monospace',
            color: '#f44',
        }).setOrigin(0, 0);
        // Score
        this.scoreText = this.add.text(this.scale.width - 20, 20, '', {
            font: '28px monospace',
            color: '#fff',
        }).setOrigin(1, 0);
        // Combo
        this.comboText = this.add.text(this.scale.width - 20, 60, '', {
            font: '20px monospace',
            color: '#0ff',
        }).setOrigin(1, 0);
    }

    updateHUD() {
        this.livesText.setText('♥'.repeat(this.lives));
        this.scoreText.setText(`Score: ${this.score}`);
        this.comboText.setText(`Combo: ${this.combo}`);
        // Reposition on resize
        this.scoreText.setX(this.scale.width - 20);
        this.comboText.setX(this.scale.width - 20);
    }

    getNextWord(): string {
        // Level progression: every 10 words, increase tier
        const level = Math.floor(this.wordsCompleted / 10);
        if (level === 0 && this.easyWords.length) return getRandom(this.easyWords);
        if (level === 1 && this.mediumWords.length) return getRandom(this.mediumWords);
        if (level >= 2 && this.hardWords.length) return getRandom(this.hardWords);
        // fallback
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
        // Reset obstacle position smoothly off-screen
        this.obstacle.setX(this.scale.width + this.obstacle.width);
        if (this.powerUpSprite) {
            this.powerUpSprite.setX(this.obstacle.x);
            this.powerUpSprite.setVisible(true);
        }
        // Pick next word
        const nextWord = this.getNextWord();
        this.engine.reset(nextWord);
        this.updateWordDisplay();
        // Clear infoText for new word
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
            // Reset obstacle position smoothly off-screen
            this.obstacle.setX(this.scale.width + this.obstacle.width);
        }
    }

    triggerGameOver() {
        this.gameOverTriggered = true;
        this.infoText.setText('Game Over!');
        this.scene.pause();
        this.time.delayedCall(1000, () => {
            this.scene.start('GameOver', { score: this.score });
        });
    }

    createGround() {
        // Remove old tiles
        this.groundTiles.forEach(tile => tile.destroy());
        this.groundTiles = [];
        const { width, height } = this.scale;
        const groundTile = this.textures.get('ground').getSourceImage();
        const tileWidth = groundTile.width;
        const tileHeight = groundTile.height;
        const y = height - tileHeight / 2;
        for (let x = 0; x < width; x += tileWidth) {
            const tile = this.add.image(x + tileWidth / 2, y, 'ground').setOrigin(0.5);
            this.groundTiles.push(tile);
        }
    }

    createSprites() {
        const { height } = this.scale;
        this.avatar = this.add.image(80, height - 80, 'avatar').setOrigin(0.5).setScale(2);
        this.obstacle = this.add.image(this.scale.width + 32, height - 80, 'obstacle').setOrigin(0.5).setScale(2);
    }

    createText() {
        const { width, height } = this.scale;
        this.typedText = this.add.text(width / 2, height / 2 - 20, '', {
            font: '32px monospace',
            color: '#0f0',
        }).setOrigin(0, 0.5);
        this.caretText = this.add.text(0, height / 2 - 20, '', {
            font: '32px monospace',
            color: '#ff0',
        }).setOrigin(0, 0.5);
        this.remainingText = this.add.text(0, height / 2 - 20, '', {
            font: '32px monospace',
            color: '#fff',
        }).setOrigin(0, 0.5);
        this.infoText = this.add.text(width / 2, height / 2 + 40, '', {
            font: '24px monospace',
            color: '#0ff',
        }).setOrigin(0.5);
    }

    handleResize(gameSize: Phaser.Structs.Size) {
        this.createGround();
        // Reposition avatar and obstacle
        const { height, width } = this.scale;
        if (this.avatar) this.avatar.setY(height - 80);
        if (this.obstacle) this.obstacle.setY(height - 80);
        this.updateWordDisplay();
        if (this.infoText) this.infoText.setY(height / 2 + 40);
        this.updateHUD();
    }

    update() {
        if (this.obstacle && !this.gameOverTriggered && !this.settingsModalOpen) {
            if (!this.obstacleFrozen) {
                this.obstacle.x -= this.obstacleSpeed;
                if (this.powerUpSprite && this.powerUpSprite.visible) {
                    this.powerUpSprite.x = this.obstacle.x;
                }
            }
            const avatarBounds = this.avatar.getBounds();
            const obstacleBounds = this.obstacle.getBounds();
            if (Phaser.Geom.Intersects.RectangleToRectangle(avatarBounds, obstacleBounds)) {
                this.loseLife();
            }
        }
    }

    updateWordDisplay() {
        const word = this.engine.getWord();
        const caret = this.engine.getCaret();
        const { width } = this.scale;
        const typed = word.slice(0, caret);
        const caretChar = caret < word.length ? word[caret] : '';
        const remaining = caret < word.length ? word.slice(caret + 1) : '';
        this.typedText.setText(typed);
        this.caretText.setText(caretChar);
        this.remainingText.setText(remaining);
        // Position segments in sequence, centered
        const totalWidth = this.typedText.width + this.caretText.width + this.remainingText.width;
        let startX = width / 2 - totalWidth / 2;
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
                this.powerUpSprite = this.add.image(this.obstacle.x, this.obstacle.y - 40, this.powerUpType).setOrigin(0.5).setScale(1.5);
            } else {
                this.powerUpSprite.setTexture(this.powerUpType);
                this.powerUpSprite.setX(this.obstacle.x);
                this.powerUpSprite.setY(this.obstacle.y - 40);
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
            this.obstacle.setX(this.scale.width + this.obstacle.width);
            this.time.delayedCall(200, () => {
                if (this.powerUpSprite) {
                    this.powerUpSprite.clearTint();
                    this.powerUpSprite.setVisible(false);
                }
            });
        }
        this.powerUpType = null;
    }
} 