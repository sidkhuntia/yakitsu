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
