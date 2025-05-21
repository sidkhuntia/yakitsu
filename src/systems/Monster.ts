import Phaser from 'phaser';

export type MonsterType = 'Skeleton' | 'Flying eye' | 'Mushroom' | 'Goblin';

interface MonsterConfig {
    type: MonsterType;
    frameCount: number;
    deathFrameCount: number;
    scale: number;
    xOffset: number;
    yOffset: number;
}

export class Monster extends Phaser.GameObjects.Sprite {
    private monsterType: MonsterType;
    private isDying: boolean = false;

    constructor(scene: Phaser.Scene, x: number, y: number, type: MonsterType) {
        super(scene, x, y, `monster_${type}_run`, 0);
        this.monsterType = type;

        const config = this.getFrameConfig(type);

        // Set origin, scale, and depth
        this.setOrigin(0.5)
            .setScale(config.scale)
            .setDepth(10)
            .setFlipX(true); // Flip horizontally to face left (towards player)

        // Apply position offsets for this monster type
        this.x += config.xOffset;
        this.y += config.yOffset;

        // Create run animation if it doesn't exist
        const runAnimKey = `monster-${type}-run`;
        if (!scene.anims.exists(runAnimKey)) {
            scene.anims.create({
                key: runAnimKey,
                frames: scene.anims.generateFrameNumbers(`monster_${type}_run`, {
                    start: 0,
                    end: config.frameCount - 1
                }),
                frameRate: 10,
                repeat: -1
            });
        }

        // Create death animation if it doesn't exist
        const deathAnimKey = `monster-${type}-death`;
        if (!scene.anims.exists(deathAnimKey)) {
            scene.anims.create({
                key: deathAnimKey,
                frames: scene.anims.generateFrameNumbers(`monster_${type}_death`, {
                    start: 0,
                    end: config.deathFrameCount - 1
                }),
                frameRate: 10,
                repeat: 0
            });
        }

        // Play run animation by default
        this.play(runAnimKey);
    }

    playDeathAnimation(): Promise<void> {
        if (this.isDying) return Promise.resolve();

        this.isDying = true;
        const deathAnimKey = `monster-${this.monsterType}-death`;

        return new Promise((resolve) => {
            // Switch to death spritesheet
            this.setTexture(`monster_${this.monsterType}_death`);

            // Play death animation
            this.play(deathAnimKey);

            // Listen for animation complete
            this.once('animationcomplete', () => {
                resolve();
            });
        });
    }

    private getFrameConfig(type: MonsterType): MonsterConfig {
        switch (type) {
            case 'Skeleton':
                return { type, frameCount: 4, deathFrameCount: 4, scale: 1.6, xOffset: 0, yOffset: 0 };
            case 'Flying eye':
                return { type, frameCount: 8, deathFrameCount: 4, scale: 2, xOffset: 0, yOffset: -20 };
            case 'Mushroom':
                return { type, frameCount: 8, deathFrameCount: 4, scale: 2, xOffset: 0, yOffset: -12 };
            case 'Goblin':
                return { type, frameCount: 8, deathFrameCount: 4, scale: 2, xOffset: 0, yOffset: -15 };
            default:
                return { type, frameCount: 4, deathFrameCount: 4, scale: 2, xOffset: 0, yOffset: 0 };
        }
    }

    static getRandomType(): MonsterType {
        const types: MonsterType[] = ['Skeleton', 'Flying eye', 'Mushroom', 'Goblin'];
        return types[Math.floor(Math.random() * types.length)];
    }
} 