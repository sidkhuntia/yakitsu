import { loadData } from './persistence'

/**
 * The pixel display face used for chrome: banners, HUD, menus.
 *
 * Deliberately distinct from `bodyFont`. The pixel face is low-legibility by
 * design, which is fine for a score readout and actively hostile for a 12-letter
 * word the player has to read under a deadline.
 */
const DISPLAY_FONT = 'Retro Font'

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
