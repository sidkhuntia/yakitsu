import Phaser from 'phaser'

/**
 * "Juice": the small, cheap effects that make actions read as impactful.
 *
 * Centralised so timing curves are tunable in one place and so Play.ts stays
 * about game rules rather than tween bookkeeping.
 */
export class Juice {
	/** Simulated time is scaled by this; 1 = normal. */
	private timeScale = 1
	private targetTimeScale = 1
	private hitstopUntil = 0

	/** Screen shake magnitude, decayed each frame. */
	private shakeIntensity = 0
	private shakeDecayPerSec = 0

	constructor(
		private readonly scene: Phaser.Scene,
		private enabled = true,
	) {}

	/**
	 * Turn camera effects on or off.
	 *
	 * Guarded because shutdown can run after Phaser has torn down the camera
	 * manager, and an unguarded resetFX() there throws and aborts the rest of
	 * the scene's cleanup.
	 */
	setEnabled(on: boolean): void {
		this.enabled = on
		if (on) return
		this.shakeIntensity = 0
		this.scene.cameras?.main?.resetFX()
	}

	/**
	 * Freeze the simulation briefly. This is the single highest-impact effect in
	 * action games — it makes a hit *land*.
	 */
	hitstop(ms: number): void {
		if (!this.enabled) return
		this.hitstopUntil = Math.max(
			this.hitstopUntil,
			this.scene.time.now + ms,
		)
	}

	/** Ramp the whole scene to a new speed and hold it, then ease back. */
	slowMo(scale: number, holdMs: number): void {
		if (!this.enabled) return
		this.targetTimeScale = scale
		this.scene.time.delayedCall(holdMs, () => {
			this.targetTimeScale = 1
		})
	}

	shake(intensity: number, durationMs: number, decayPerSec = 4): void {
		if (!this.enabled) return
		// Never let a weak shake replace a strong in-flight one.
		this.shakeIntensity = Math.max(this.shakeIntensity, intensity)
		this.shakeDecayPerSec = decayPerSec / (durationMs / 1000)
	}

	flash(color: number, ms: number): void {
		if (!this.enabled) return
		this.scene.cameras.main.flash(
			ms,
			(color >> 16) & 0xff,
			(color >> 8) & 0xff,
			color & 0xff,
			true,
		)
	}

	/** Run per frame from the scene's update. */
	update(deltaMs: number): void {
		const now = this.scene.time.now
		const frozen = now < this.hitstopUntil

		// Ease the time scale rather than snapping, so slow-mo feels like weight.
		const goal = frozen ? 0.06 : this.targetTimeScale
		this.timeScale += (goal - this.timeScale) * Math.min(1, deltaMs / 40)

		if (this.shakeIntensity > 0.001) {
			this.scene.cameras.main.shake(
				16,
				(this.shakeIntensity * 0.004) / this.scene.scale.width,
				true,
			)
			this.shakeIntensity -= (this.shakeDecayPerSec * deltaMs) / 1000
		}
	}

	get scale(): number {
		return this.timeScale
	}
}
