import type Phaser from 'phaser'

/**
 * Every sound the game ships, in one place.
 *
 * Boot preloads this list, and the scenes map their events onto these keys.
 * Sources and licences for each file are in CREDITS.md.
 */

/** Looping background tracks. */
export const MUSIC = {
	fight: { key: 'bgMusic', file: 'assets/audio/music/fight-loop.mp3' },
	menu: { key: 'menuMusic', file: 'assets/audio/music/menu-bossa-nova.mp3' },
} as const

/** One-shot effects, keyed by the event they stand for. */
export const SFX = {
	keyType: { key: 'sfxKeyType', file: 'assets/audio/sfx/key-type.mp3' },
	mistake: { key: 'sfxMistake', file: 'assets/audio/sfx/mistake.mp3' },
	hitLight: { key: 'sfxHitLight', file: 'assets/audio/sfx/hit-light.mp3' },
	hitHeavy: { key: 'sfxHitHeavy', file: 'assets/audio/sfx/hit-heavy.mp3' },
	parry: { key: 'sfxParry', file: 'assets/audio/sfx/parry.mp3' },
	whoosh: { key: 'sfxWhoosh', file: 'assets/audio/sfx/whoosh.mp3' },
	ko: { key: 'sfxKo', file: 'assets/audio/sfx/ko.mp3' },
	uiClick: { key: 'sfxUiClick', file: 'assets/audio/sfx/ui-click.mp3' },
	roundStart: {
		key: 'sfxRoundStart',
		file: 'assets/audio/sfx/round-start.mp3',
	},
	pause: { key: 'sfxPause', file: 'assets/audio/sfx/pause.mp3' },
	unpause: { key: 'sfxUnpause', file: 'assets/audio/sfx/unpause.mp3' },
	danger: { key: 'sfxDanger', file: 'assets/audio/sfx/danger.mp3' },
	powerUp: { key: 'sfxPowerUp', file: 'assets/audio/sfx/power-up.mp3' },
	levelUp: { key: 'sfxLevelUp', file: 'assets/audio/sfx/level-up.mp3' },
} as const

/** Queue every track and effect on the loader. */
export function loadAudio(load: Phaser.Loader.LoaderPlugin): void {
	for (const { key, file } of [
		...Object.values(MUSIC),
		...Object.values(SFX),
	]) {
		load.audio(key, file)
	}
}
