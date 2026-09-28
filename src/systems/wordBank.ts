import { WORD_TIERS, tierForWordsCompleted } from './tuning'

type Thesaurus = Record<string, string[]>

declare global {
	interface Window {
		THESAURUS?: Thesaurus
	}
}

/**
 * Word selection.
 *
 * Two things matter for feel: the word must be *typeable* (never absurdly long
 * for the tier we promise) and it must not repeat back-to-back, which feels
 * broken when it happens.
 */
export class WordBank {
	private readonly pools: string[][]
	/** Last few words drawn, per tier, to avoid immediate repeats. */
	private readonly recent: string[][] = []

	constructor(thesaurus: Thesaurus | undefined) {
		this.pools = WORD_TIERS.map((tier) => {
			const raw = thesaurus?.[tier.name] ?? []
			return raw
				.map((w) => w.trim().toUpperCase())
				.filter(
					(w) => w.length >= tier.minLen && w.length <= tier.maxLen,
				)
		})
		this.recent = this.pools.map(() => [])
	}

	/** True when the thesaurus actually loaded. */
	get isUsable(): boolean {
		return this.pools.some((p) => p.length > 0)
	}

	pick(wordsCompleted: number): string {
		const tierIndex = tierForWordsCompleted(wordsCompleted)

		// Walk down to the nearest non-empty pool so a missing bucket degrades
		// gracefully instead of returning garbage.
		for (let i = tierIndex; i >= 0; i--) {
			const word = this.pickFrom(i)
			if (word) return word
		}
		return 'YAKITSU'
	}

	private pickFrom(tierIndex: number): string | null {
		const pool = this.pools[tierIndex]
		if (!pool || pool.length === 0) return null

		const seen = this.recent[tierIndex]
		// If the pool is small, don't exclude everything.
		const candidates =
			seen.length > 0 && seen.length < pool.length
				? pool.filter((w) => !seen.includes(w))
				: pool

		const word = candidates[Math.floor(Math.random() * candidates.length)]

		seen.unshift(word)
		if (seen.length > 3) seen.length = 3

		return word
	}
}
