/**
 * Deterministic randomness for duels.
 *
 * Everything that must match between two players (word decks, block words)
 * is derived from one match seed, so a server only has to agree on a single
 * 32-bit number for both clients to see the same words.
 */

/** Small seeded PRNG (mulberry32). */
export function seededRng(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Combine integers into one well-mixed seed.
 *
 * Used as a counter-based generator: `mixSeed(match, slot, n)` is the seed
 * for the n-th word of a slot. Because it depends only on its inputs, the
 * n-th heavy word is the same for both players no matter how many jabs either
 * of them has typed in between.
 */
export function mixSeed(...parts: number[]): number {
	let h = 0x811c9dc5
	for (const p of parts) {
		h = Math.imul(h ^ (p >>> 0), 0x01000193)
		h ^= h >>> 13
		h = Math.imul(h, 0x5bd1e995)
		h ^= h >>> 15
	}
	return h >>> 0
}

/** A fresh random match seed. */
export function randomSeed(): number {
	return (Math.random() * 0x100000000) >>> 0
}
