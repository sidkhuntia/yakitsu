import Phaser from 'phaser'
import { displayFont } from '../font'
import { DUEL, type Side } from './duelTuning'
import type { FighterState } from './duelSim'

const BAR_W = 480
const BAR_H = 22
const DEPTH = 40

interface BarSet {
	back: Phaser.GameObjects.Rectangle
	/** Trails behind the real HP so a chunk of damage reads as a chunk. */
	ghost: Phaser.GameObjects.Rectangle
	fill: Phaser.GameObjects.Rectangle
	meter: Phaser.GameObjects.Rectangle
	meterBack: Phaser.GameObjects.Rectangle
	name: Phaser.GameObjects.Text
	pips: Phaser.GameObjects.Arc[]
	ghostHp: number
}

/**
 * Classic fighting-game chrome: mirrored HP bars, round pips, a clock, and
 * the meter under each bar.
 */
export class DuelHud {
	private readonly bars: Record<Side, BarSet>
	private readonly clock: Phaser.GameObjects.Text
	private readonly banner: Phaser.GameObjects.Text
	private readonly sub: Phaser.GameObjects.Text

	constructor(
		private readonly scene: Phaser.Scene,
		names: Record<Side, string>,
	) {
		const { width } = scene.scale
		this.bars = {
			p1: this.buildBar(40, false, names.p1, 0x00e676),
			p2: this.buildBar(width - 40, true, names.p2, 0xff5252),
		}
		this.clock = scene.add
			.text(width / 2, 44, '75', {
				fontFamily: displayFont(),
				fontSize: '44px',
				color: '#ffffff',
			})
			.setOrigin(0.5)
			.setDepth(DEPTH)
		this.banner = scene.add
			.text(width / 2, scene.scale.height * 0.4, '', {
				fontFamily: displayFont(),
				fontSize: '96px',
				color: '#ffd600',
				stroke: '#000000',
				strokeThickness: 8,
			})
			.setOrigin(0.5)
			.setDepth(60)
			.setAlpha(0)
		this.sub = scene.add
			.text(width / 2, scene.scale.height * 0.4 + 76, '', {
				fontFamily: displayFont(),
				fontSize: '26px',
				color: '#e0e6f0',
				stroke: '#000000',
				strokeThickness: 5,
			})
			.setOrigin(0.5)
			.setDepth(60)
			.setAlpha(0)
	}

	private buildBar(
		x: number,
		mirrored: boolean,
		name: string,
		color: number,
	): BarSet {
		const s = this.scene
		const ox = mirrored ? 1 : 0
		const y = 30
		const back = s.add
			.rectangle(x, y, BAR_W, BAR_H, 0x1a0d10)
			.setOrigin(ox, 0)
			.setStrokeStyle(2, 0xffffff, 0.5)
			.setDepth(DEPTH)
		const ghost = s.add
			.rectangle(x, y, BAR_W, BAR_H, 0xffffff, 0.7)
			.setOrigin(ox, 0)
			.setDepth(DEPTH)
		const fill = s.add
			.rectangle(x, y, BAR_W, BAR_H, color)
			.setOrigin(ox, 0)
			.setDepth(DEPTH)
		const meterBack = s.add
			.rectangle(x, y + BAR_H + 8, BAR_W * 0.6, 10, 0x0b1320)
			.setOrigin(ox, 0)
			.setStrokeStyle(1, 0x64ffda, 0.4)
			.setDepth(DEPTH)
		const meter = s.add
			.rectangle(x, y + BAR_H + 8, 0, 10, 0x64ffda)
			.setOrigin(ox, 0)
			.setDepth(DEPTH)
		const label = s.add
			.text(x, y + BAR_H + 24, name, {
				fontFamily: displayFont(),
				fontSize: '20px',
				color: '#ffffff',
			})
			.setOrigin(ox, 0)
			.setDepth(DEPTH)

		const pips: Phaser.GameObjects.Arc[] = []
		for (let i = 0; i < DUEL.roundsToWin; i++) {
			const px = mirrored
				? x - BAR_W + 12 + i * 22
				: x + BAR_W - 12 - i * 22
			pips.push(
				s.add
					.circle(px, y + BAR_H + 30, 7, 0x000000, 0.6)
					.setStrokeStyle(2, 0xffd600)
					.setDepth(DEPTH),
			)
		}
		return {
			back,
			ghost,
			fill,
			meter,
			meterBack,
			name: label,
			pips,
			ghostHp: DUEL.maxHp,
		}
	}

	update(
		fighters: Record<Side, FighterState>,
		timeLeftMs: number,
		deltaMs: number,
	): void {
		for (const side of ['p1', 'p2'] as const) {
			const f = fighters[side]
			const b = this.bars[side]
			const hpW = (f.hp / DUEL.maxHp) * BAR_W
			b.fill.setSize(hpW, BAR_H)
			// The ghost drains only after a short beat, like every fighter.
			b.ghostHp = Math.max(f.hp, b.ghostHp - (deltaMs / 1000) * 40)
			b.ghost.setSize((b.ghostHp / DUEL.maxHp) * BAR_W, BAR_H)
			b.fill.setFillStyle(
				f.hp < 30 ? 0xff1744 : side === 'p1' ? 0x00e676 : 0xff5252,
			)
			const full = f.meter >= DUEL.maxMeter
			b.meter.setSize((f.meter / DUEL.maxMeter) * BAR_W * 0.6, 10)
			b.meter.setFillStyle(full ? 0xffd600 : 0x64ffda)
			b.pips.forEach((p, i) =>
				p.setFillStyle(
					i < f.roundsWon ? 0xffd600 : 0x000000,
					i < f.roundsWon ? 1 : 0.6,
				),
			)
		}
		this.clock.setText(String(Math.ceil(timeLeftMs / 1000)))
		this.clock.setColor(timeLeftMs < 10_000 ? '#ff5252' : '#ffffff')
	}

	/** Big centred text: "ROUND 1", "FIGHT!", "K.O.". */
	announce(text: string, sub = '', holdMs = 900, color = '#ffd600'): void {
		this.scene.tweens.killTweensOf([this.banner, this.sub])
		this.banner.setText(text).setColor(color).setScale(1.8).setAlpha(1)
		this.sub.setText(sub).setAlpha(sub ? 1 : 0)
		this.scene.tweens.add({
			targets: this.banner,
			scale: 1,
			duration: 260,
			ease: 'Back.easeOut',
		})
		if (holdMs <= 0) return
		this.scene.tweens.add({
			targets: [this.banner, this.sub],
			alpha: 0,
			delay: holdMs,
			duration: 260,
		})
	}

	destroy(): void {
		for (const b of Object.values(this.bars)) {
			for (const o of [
				b.back,
				b.ghost,
				b.fill,
				b.meter,
				b.meterBack,
				b.name,
				...b.pips,
			])
				o.destroy()
		}
		this.clock.destroy()
		this.banner.destroy()
		this.sub.destroy()
	}
}
