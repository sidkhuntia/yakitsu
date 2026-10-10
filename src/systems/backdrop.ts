import type Phaser from 'phaser'

/**
 * The forest backdrop shared by the runner and the duel.
 *
 * The art is "Parallax background forest pixel art" by MatiasVME (CC0): eight
 * 1280x360 layers, listed far to near. They are drawn at 2x so they fill the
 * 720px canvas, and tile sprites use `setTileScale`, so the pixels stay crisp.
 */

/** Integer scale for every backdrop layer; keeps pixel art crisp. */
export const BACKDROP_SCALE = 2

/**
 * Screen y where both fighters stand: the top edge of the rocks layer. The
 * duel places its sprites from this line, and the runner's avatar is centred
 * so its feet land here too.
 */
export const FLOOR_Y = 680

/**
 * `scroll` is how far a layer moves per pixel the ground travels. The rocks
 * are the ground, so they move exactly with the monsters; the sky does not
 * move at all.
 */
export const BACKDROP_LAYERS = [
	{ key: 'bg_sky', file: 'forest-sky.png', scroll: 0 },
	{ key: 'bg_sun', file: 'forest-sun.png', scroll: 0.02 },
	{ key: 'bg_clouds', file: 'forest-clouds.png', scroll: 0.05 },
	{ key: 'bg_mountains_3', file: 'forest-mountains-3.png', scroll: 0.1 },
	{ key: 'bg_mountains_2', file: 'forest-mountains-2.png', scroll: 0.18 },
	{ key: 'bg_mountains_1', file: 'forest-mountains-1.png', scroll: 0.28 },
	{ key: 'bg_trees', file: 'forest-trees.png', scroll: 0.5 },
	{ key: 'bg_rocks', file: 'forest-rocks.png', scroll: 1 },
] as const

/** Queue every backdrop layer on the loader. */
export function loadBackdrop(load: Phaser.Loader.LoaderPlugin): void {
	for (const { key, file } of BACKDROP_LAYERS) {
		load.image(key, `assets/background/${file}`)
	}
}

/**
 * Depth of the darkening shade. It sits above every backdrop layer except the
 * rocks (the ground, -13), so the sky, clouds, mountains and trees dim while
 * the ground, fighters, runner and cards stay at full brightness.
 */
export const SHADE_DEPTH = -13.5
/** Black over the whole backdrop. Dark enough for 12px captions on clouds. */
export const SHADE_ALPHA = 0.5
/** Height of the extra-dark band behind the top card row and the HUD. */
export const TOP_BAND_HEIGHT = 260
const TOP_BAND_ALPHA = 0.6
const TOP_BAND_KEY = '__backdrop_top_band'

/**
 * Darken the sky and mountain side of the backdrop, plus a gradient band across
 * the top. Call after `loadBackdrop` layers have been added.
 */
export function addBackdropShade(scene: Phaser.Scene): void {
	const { width, height } = scene.scale
	scene.add
		.rectangle(0, 0, width, height, 0x000000, SHADE_ALPHA)
		.setOrigin(0)
		.setDepth(SHADE_DEPTH)

	if (!scene.textures.exists(TOP_BAND_KEY)) {
		const canvas = document.createElement('canvas')
		canvas.width = 4
		canvas.height = TOP_BAND_HEIGHT
		const ctx = canvas.getContext('2d')
		if (ctx) {
			const g = ctx.createLinearGradient(0, 0, 0, TOP_BAND_HEIGHT)
			g.addColorStop(0, `rgba(0,0,0,${TOP_BAND_ALPHA})`)
			g.addColorStop(1, 'rgba(0,0,0,0)')
			ctx.fillStyle = g
			ctx.fillRect(0, 0, canvas.width, canvas.height)
		}
		scene.textures.addCanvas(TOP_BAND_KEY, canvas)
	}
	scene.add
		.image(0, 0, TOP_BAND_KEY)
		.setOrigin(0)
		.setDisplaySize(width, TOP_BAND_HEIGHT)
		.setDepth(SHADE_DEPTH + 0.1)
}
