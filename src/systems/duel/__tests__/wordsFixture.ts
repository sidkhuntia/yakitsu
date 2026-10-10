/**
 * The real word list, loaded for Node-side tests and the balance CLI.
 *
 * `public/data/words/words.js` is a browser script (`var THESAURUS = {...}`),
 * so it is evaluated in a fresh VM context and `THESAURUS` is read back. The
 * same `WordBank` the game uses picks the words, so balance numbers reflect
 * the real vocabulary, not a stub.
 */

import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { WordBank } from '../../wordBank'
import type { WordPicker } from '../playerDeck'

const WORDS_URL = new URL(
	'../../../../public/data/words/words.js',
	import.meta.url,
)

/** Load the thesaurus object from the browser script. */
export function loadThesaurus(): Record<string, string[]> {
	const source = readFileSync(WORDS_URL, 'utf8')
	const context: { THESAURUS?: Record<string, string[]> } = {}
	createContext(context)
	runInContext(source, context)
	if (!context.THESAURUS) throw new Error('words.js did not define THESAURUS')
	return context.THESAURUS
}

/** A `WordPicker` over the real word list. Deterministic given `rng`. */
export function loadWordPicker(): WordPicker {
	const bank = new WordBank(loadThesaurus())
	if (!bank.isUsable) throw new Error('word list is empty')
	return (tier, reject, rng) => bank.pickFromTier(tier, reject, rng)
}
