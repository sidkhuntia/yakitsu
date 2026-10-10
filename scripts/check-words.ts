/**
 * Validates a Yakitsu word list (THESAURUS format) before it ships.
 *
 *   npx tsx scripts/check-words.ts public/data/words/words.next.js
 *
 * Exits 1 and lists every problem if the file fails any rule. The blocklist
 * below is never shown in-game; it only gates what gets shipped.
 */

import fs from 'node:fs'
import vm from 'node:vm'

type Thesaurus = Record<string, unknown>

interface TierRule {
	name: string
	minLen: number
	maxLen: number
	minCount: number
	/** Hard requirement (fails the run) or soft (warning only). */
	coverageHard: boolean
}

const TIERS: TierRule[] = [
	{ name: 'three', minLen: 1, maxLen: 3, minCount: 300, coverageHard: false },
	{ name: 'small', minLen: 4, maxLen: 5, minCount: 600, coverageHard: true },
	{ name: 'medium', minLen: 6, maxLen: 8, minCount: 600, coverageHard: true },
	{ name: 'big', minLen: 9, maxLen: 11, minCount: 400, coverageHard: true },
	{
		name: 'large',
		minLen: 12,
		maxLen: 14,
		minCount: 200,
		coverageHard: false,
	},
]

/** Letters that may be exempt from the per-letter coverage minimum. */
const EXEMPT_LETTERS = new Set(['Q', 'X', 'Z'])
const COVERAGE_MIN = 5
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * Substrings that must never appear anywhere inside a word. Each one is
 * chosen so that no common innocent English word contains it.
 */
const BLOCKED_SUBSTRINGS = [
	'FUCK',
	'SHIT',
	'CUNT',
	'DICK',
	'PUSSY',
	'BITCH',
	'BASTARD',
	'WHORE',
	'SLUT',
	'NIGG',
	'FAG',
	'KIKE',
	'CHINK',
	'GOOK',
	'WETBACK',
	'TRANNY',
	'RETARD',
	'NAZI',
	'HITLER',
	'TURD',
	'PISS',
	'PENIS',
	'VAGIN',
	'PORN',
	'DILDO',
	'WANK',
	'DAMN',
	'MOLEST',
	'INCEST',
	'ORGASM',
	'SUICID',
	'OVERDOSE',
	'RAPIST',
	'MURDER',
	'KILLER',
	'COCAINE',
	'HEROIN',
	'OPIUM',
	'METHAMPHET',
]

/**
 * Whole words only. These are too short or too common inside innocent words
 * to match as substrings (ASS in CLASS, CUM in CUMBERSOME, COCK in COCKPIT...).
 */
const BLOCKED_WHOLE_WORDS = new Set([
	'ASS',
	'ASSES',
	'ANAL',
	'ANUS',
	'COCK',
	'COCKS',
	'CUM',
	'CUMS',
	'BUTT',
	'BUTTS',
	'TIT',
	'TITS',
	'BOOB',
	'BOOBS',
	'BOOTY',
	'GAY',
	'SEX',
	'SEXY',
	'SEXUAL',
	'NUDE',
	'NAKED',
	'RAPE',
	'HOMO',
	'TWAT',
	'SPIC',
	'DYKE',
	'COON',
	'HOE',
	'HOES',
	'JUG',
	'JUGS',
	'HUMP',
	'BUNS',
	'CRAP',
	'ERECT',
	'PEDO',
	'WEED',
	'COKE',
	'CRACK',
	'METH',
	'DRUG',
	'DRUGS',
	'DRUNK',
	'BEER',
	'BOOZE',
	'VODKA',
	'WHISKEY',
	'CUTTING',
	'NOOSE',
	'KILL',
	'KILLS',
	'KILLED',
	'GUN',
	'GUNS',
	'STAB',
	'SHOOT',
	'BOMB',
	'DUMB',
	'IDIOT',
	'STUPID',
	'FAT',
	'NERD',
	'LOSER',
	'FREAK',
	'GOD',
	'GODS',
	'JESUS',
	'ALLAH',
	'DEVIL',
	'SATAN',
	'HOLY',
	'HELL',
	// Ethnic and other slurs, matched whole-word only.
	'NIP',
	'JAP',
	'WOP',
	'GYP',
	'GYPSY',
	'SPAZ',
	'MIDGET',
	'SQUAW',
	'REDSKIN',
	'BEANER',
	'HONKY',
	'POLACK',
	'YID',
	'PANSY',
	'QUEER',
	'PRICK',
	'BONER',
	// British vulgarities.
	'SOD',
	'KNOB',
	// Homophobic slur sense.
	'FRUITY',
	// Alcohol.
	'ALE',
	'RUM',
	'PUB',
	'WINE',
])

/** Self-test: innocent words must pass, real offensive words must fail. */
const MUST_PASS = [
	'ASSIGN',
	'CLASSIC',
	'CLASS',
	'PASS',
	'SCRAP',
	'SHIFT',
	'SKILL',
	'GRAPE',
	'TITLE',
	'TITAN',
	'ANALYZE',
	'METHOD',
	'BUTTER',
	'BUTTON',
	'SPICE',
	'RACCOON',
	'NIGHT',
	'SHELL',
	'COCKPIT',
	'PEACOCK',
	'CRACKER',
	'PENINSULA',
	'CHINESE',
	'HOMOGENEOUS',
	'DAMSEL',
	'CUMBERSOME',
	'HOMEWORK',
]
const MUST_FAIL = [
	'FUCKER',
	'BITCHES',
	'NIGGA',
	'SHITTY',
	'CUNT',
	'RAPE',
	'KILLER',
	'ASS',
	'NIP',
]

function isBlocked(word: string): boolean {
	if (BLOCKED_WHOLE_WORDS.has(word)) return true
	return BLOCKED_SUBSTRINGS.some((s) => word.includes(s))
}

function selfTest(): string[] {
	const problems: string[] = []
	for (const w of MUST_PASS) {
		if (isBlocked(w))
			problems.push(`self-test: innocent word "${w}" was blocked`)
	}
	for (const w of MUST_FAIL) {
		if (!isBlocked(w))
			problems.push(`self-test: offensive word "${w}" was not blocked`)
	}
	return problems
}

function loadThesaurus(file: string): Thesaurus {
	const src = fs.readFileSync(file, 'utf8')
	const ctx: Record<string, unknown> = {}
	vm.createContext(ctx)
	vm.runInContext(src, ctx, { filename: file, timeout: 5000 })
	const t = ctx.THESAURUS
	if (!t || typeof t !== 'object')
		throw new Error('THESAURUS not defined after running the file')
	return t as Thesaurus
}

function histogram(words: string[]): Record<string, number> {
	const h: Record<string, number> = {}
	for (const l of ALPHABET) h[l] = 0
	for (const w of words) {
		const first = w[0]
		if (first in h) h[first]++
	}
	return h
}

function main(): void {
	const file = process.argv[2]
	if (!file) {
		console.error('usage: tsx scripts/check-words.ts <words file>')
		process.exit(2)
	}

	const problems: string[] = []
	const warnings: string[] = []

	problems.push(...selfTest())

	let thesaurus: Thesaurus
	try {
		thesaurus = loadThesaurus(file)
	} catch (err) {
		console.error(`FAIL: could not load ${file}: ${(err as Error).message}`)
		process.exit(1)
	}

	const seenGlobal = new Map<string, string>()
	const counts: Record<string, number> = {}
	const hist: Record<string, Record<string, number>> = {}
	const hits: string[] = []

	for (const tier of TIERS) {
		const raw = thesaurus[tier.name]
		if (!Array.isArray(raw)) {
			problems.push(`tier "${tier.name}" is missing or not an array`)
			continue
		}

		const words: string[] = []
		const seenTier = new Set<string>()
		for (const entry of raw) {
			if (typeof entry !== 'string') {
				problems.push(
					`${tier.name}: non-string entry ${JSON.stringify(entry)}`,
				)
				continue
			}
			const w = entry
			if (!/^[A-Z]+$/.test(w)) {
				problems.push(`${tier.name}: "${w}" is not /^[A-Z]+$/`)
				continue
			}
			if (w.length < tier.minLen || w.length > tier.maxLen) {
				problems.push(
					`${tier.name}: "${w}" has ${w.length} letters, tier allows ${tier.minLen}-${tier.maxLen}`,
				)
			}
			if (seenTier.has(w)) {
				problems.push(`${tier.name}: duplicate "${w}" within tier`)
			}
			seenTier.add(w)
			const other = seenGlobal.get(w)
			if (other && other !== tier.name) {
				problems.push(
					`"${w}" appears in both ${other} and ${tier.name}`,
				)
			}
			if (!seenGlobal.has(w)) seenGlobal.set(w, tier.name)
			if (isBlocked(w)) hits.push(`${tier.name}: "${w}"`)
			words.push(w)
		}

		counts[tier.name] = words.length
		hist[tier.name] = histogram(words)

		if (words.length < tier.minCount) {
			problems.push(
				`${tier.name}: ${words.length} words, minimum is ${tier.minCount}`,
			)
		}

		for (const letter of ALPHABET) {
			if (EXEMPT_LETTERS.has(letter)) continue
			const n = hist[tier.name][letter]
			if (n >= COVERAGE_MIN) continue
			const msg = `${tier.name}: only ${n} word(s) start with ${letter}, need ${COVERAGE_MIN}`
			if (tier.coverageHard) problems.push(msg)
			else warnings.push(msg)
		}
	}

	if (hits.length > 0) {
		for (const h of hits) problems.push(`blocklist hit: ${h}`)
	}

	const total = Object.values(counts).reduce((a, b) => a + b, 0)
	console.log(`file: ${file}`)
	console.log('\nper-tier counts:')
	for (const tier of TIERS) {
		const n = counts[tier.name] ?? 0
		console.log(
			`  ${tier.name.padEnd(7)} ${String(n).padStart(5)}  (min ${tier.minCount}, ${tier.minLen}-${tier.maxLen} letters)`,
		)
	}
	console.log(`  total   ${String(total).padStart(5)}`)

	console.log('\nfirst-letter histograms:')
	console.log('  letter  ' + ALPHABET.map((l) => l.padStart(3)).join(''))
	for (const tier of TIERS) {
		const h = hist[tier.name]
		if (!h) continue
		console.log(
			`  ${tier.name.padEnd(7)} ` +
				ALPHABET.map((l) => String(h[l]).padStart(3)).join(''),
		)
	}

	if (warnings.length > 0) {
		console.log('\nwarnings (coverage soft-target for three and large):')
		for (const w of warnings) console.log('  - ' + w)
	}

	if (problems.length > 0) {
		console.log('\nFAIL:')
		for (const p of problems) console.log('  - ' + p)
		process.exit(1)
	}

	console.log('\nPASS')
}

main()
