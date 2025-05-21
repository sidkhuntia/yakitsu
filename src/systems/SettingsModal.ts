import Phaser from 'phaser';
import { updateSettings, loadData } from './persistence';
import { saveRun } from './persistence';

export class SettingsModal extends Phaser.GameObjects.Container {
    private bg: Phaser.GameObjects.Rectangle;
    private panel: Phaser.GameObjects.Rectangle;
    private musicBtn: Phaser.GameObjects.Text;
    private fontBtn: Phaser.GameObjects.Text;
    private lockInputBtn: Phaser.GameObjects.Text;
    private clearBtn: Phaser.GameObjects.Text;
    private closeBtn: Phaser.GameObjects.Text;
    private onClose: () => void;

    constructor(scene: Phaser.Scene, onClose: () => void) {
        super(scene);
        this.onClose = onClose;
        const { width, height } = scene.scale;
        this.bg = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5).setInteractive();
        this.panel = scene.add.rectangle(width / 2, height / 2, 400, 320, 0x222233, 0.98).setStrokeStyle(2, 0x8888aa);
        const baseY = height / 2 - 60;
        this.musicBtn = scene.add.text(width / 2, baseY, '', { font: '24px monospace', color: '#fff', backgroundColor: '#333', padding: { left: 12, right: 12, top: 6, bottom: 6 } }).setOrigin(0.5).setInteractive();
        this.fontBtn = scene.add.text(width / 2, baseY + 60, '', { font: '24px monospace', color: '#fff', backgroundColor: '#333', padding: { left: 12, right: 12, top: 6, bottom: 6 } }).setOrigin(0.5).setInteractive();
        this.lockInputBtn = scene.add.text(width / 2, baseY + 120, '', { font: '20px monospace', color: '#fff', backgroundColor: '#333', padding: { left: 12, right: 12, top: 6, bottom: 6 } }).setOrigin(0.5).setInteractive();
        this.clearBtn = scene.add.text(width / 2, baseY + 180, 'Clear Highscores', { font: '20px monospace', color: '#f44', backgroundColor: '#333', padding: { left: 12, right: 12, top: 6, bottom: 6 } }).setOrigin(0.5).setInteractive();
        this.closeBtn = scene.add.text(width / 2, baseY + 240, '[ Close ]', { font: '20px monospace', color: '#0ff', backgroundColor: '#222', padding: { left: 12, right: 12, top: 6, bottom: 6 } }).setOrigin(0.5).setInteractive();
        this.add([this.bg, this.panel, this.musicBtn, this.fontBtn, this.lockInputBtn, this.clearBtn, this.closeBtn]);
        this.refresh();
        this.musicBtn.on('pointerdown', () => {
            const settings = loadData().settings;
            updateSettings({ muted: !settings.muted });
            this.refresh();
        });
        this.fontBtn.on('pointerdown', () => {
            const settings = loadData().settings;
            updateSettings({ dyslexicFont: !settings.dyslexicFont });
            this.refresh();
        });
        this.lockInputBtn.on('pointerdown', () => {
            const settings = loadData().settings;
            updateSettings({ lockInputOnMistake: !settings.lockInputOnMistake });
            this.refresh();
        });
        this.clearBtn.on('pointerdown', () => {
            localStorage.removeItem('yatiksu-save-v1');
            saveRun(0);
            this.refresh();
        });
        this.closeBtn.on('pointerdown', () => {
            this.destroy();
            this.onClose();
        });
        this.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
        this.input && (this.input.enabled = true);
    }
    refresh() {
        const settings = loadData().settings;
        this.musicBtn.setText(settings.muted ? 'Music/SFX: OFF' : 'Music/SFX: ON');
        this.fontBtn.setText(settings.dyslexicFont ? 'Dyslexic Font: ON' : 'Dyslexic Font: OFF');
        this.lockInputBtn.setText(settings.lockInputOnMistake ? 'Lock Input on Mistake: ON' : 'Lock Input on Mistake: OFF');
    }
} 