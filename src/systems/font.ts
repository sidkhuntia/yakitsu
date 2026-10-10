import { loadData } from './persistence'

/**
 * The pixel display face used for chrome: banners, HUD, menus.
 *
 * Deliberately distinct from `bodyFont`. The pixel face is low-legibility by
 * design, which is fine for a score readout and actively hostile for a 12-letter
 * word the player has to read under a deadline.
 *
 * The family name is quoted. Phaser writes the canvas `ctx.font` shorthand as
 * `<size> <family>`, and an unquoted name must be an identifier sequence, so
 * `Press Start 2P` (its `2P` starts with a digit) makes the whole shorthand
 * invalid. The canvas then silently keeps its default `10px sans-serif`, and
 * every canvas text renders at 10px. Quoting makes the shorthand valid.
 */
const DISPLAY_FONT = '"Press Start 2P", monospace'

/**
 * The face used for anything the player has to actually READ as language:
 * the word being typed, and the tips that explain it.
 *
 * Atkinson Hyperlegible is the reference face for low-vision and dyslexia
 * legibility (distinguishing I/l/1, b/d/p/q by shape rather than by position).
 * It is not bundled, so this falls through to Verdana, which is on essentially
 * every desktop platform and has the same wide-aperture, high-x-height,
 * distinct-letterform properties. `monospace` is the last resort.
 */
const READABLE_FONT =
	"'Atkinson Hyperlegible', 'Atkinson', Verdana, 'DejaVu Sans', Geneva, sans-serif"

/**
 * Resolves once the web fonts Phaser draws with are in the browser's cache.
 *
 * `@font-face` faces are fetched lazily, and a canvas text drawn before its
 * face has loaded keeps the fallback face's metrics for its whole life. Boot
 * waits on this before it creates any text or announces the assets as ready.
 * A failed load resolves anyway, so the game still starts in the fallback face.
 */
export function fontsReady(): Promise<void> {
	if (typeof document === 'undefined' || !('fonts' in document))
		return Promise.resolve()
	const loads = ['16px "Press Start 2P"', "16px 'Atkinson Hyperlegible'"].map(
		(spec) => document.fonts.load(spec).catch(() => []),
	)
	return Promise.all(loads).then(() => undefined)
}

/**
 * Resolve the font family for readable text, honouring `dyslexicFont`.
 *
 * The setting was persisted and offered in the menu but was never read by any
 * renderer, so toggling it changed nothing. Read per call rather than cached at
 * module load so a mid-run change in the pause menu takes effect immediately.
 */
export function bodyFont(): string {
	return loadData().settings.dyslexicFont ? READABLE_FONT : DISPLAY_FONT
}

/** Pixel font, for chrome that is not prose. */
export function displayFont(): string {
	return DISPLAY_FONT
}

/** True when the readable face is in use. Used to pick a matching caret colour. */
export function usingReadableFont(): boolean {
	return loadData().settings.dyslexicFont
}
