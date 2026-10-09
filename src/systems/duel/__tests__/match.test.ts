import { describe, expect, it } from 'vitest'
import { DuelMatch, type MatchEvent } from '../duelMatch'
import { DUEL, type Side } from '../duelTuning'
import { FIGHTERS, type FighterDef } from '../fighters'
import type { WordPicker } from '../playerDeck'
import { seededRng } from '../rng'
import { TypistBot, botProfile } from '../typistBot'

const HERO = FIGHTERS.hero

/** Word length per tier, matching WORD_TIERS' minLen/maxLen choices. */
const TIER_LEN = [3, 4, 6, 9, 12]

/**
 * Stub picker: each word is one first letter followed by Qs. First letters
 * are distinct (the deck's rule), and Q never starts a word.
 *
 * The filler is deliberately not vowels. The deck gives the active attack
 * priority over a block word whose first letter equals the attack's next
 * letter (block dealing avoids that, see `PlayerDeck.liveLetters`), so a stub
 * whose filler collides with block first letters would make parries depend
 * on that routing rather than on the match rules under test.
 */
const pick: WordPicker = (tier, reject, rng) => {
	const len = TIER_LEN[tier]
	const pool = [...'ABCDEFGHIJKLMNOPRSTUVWXYZ']
		.map((c) => c + 'Q'.repeat(len - 1))
		.filter((w) => !reject(w))
	return pool[Math.floor(rng() * pool.length)]
}

function newMatch(
	seed = 5,
	p1: FighterDef = HERO,
	p2: FighterDef = HERO,
): DuelMatch {
	return new DuelMatch({
		seed,
		fighters: { p1, p2 },
		pick,
	})
}

/**
 * Type `word` on `side`, one key every `gap` ms from `start`. Returns the
 * time of the last key, which is when a finished word takes effect.
 */
function typeWord(
	m: DuelMatch,
	side: Side,
	word: string,
	start: number,
	gap = 100,
): number {
	let t = start
	for (const ch of word) {
		m.key(side, ch, t)
		t += gap
	}
	return t - gap
}

type Of<T extends MatchEvent['t']> = Extract<MatchEvent, { t: T }>

function findEvent<T extends MatchEvent['t']>(
	events: MatchEvent[],
	t: T,
): Of<T> | undefined {
	return events.find((e): e is Of<T> => e.t === t)
}

describe('DuelMatch: blocks and parries', () => {
	it('a heavy starts on completion, the defender is offered a block, and typing it parries', () => {
		const m = newMatch()
		m.startRound(0)
		m.drain()

		const heavy = m.decks.p1.card('heavy')!.word
		const doneAt = typeWord(m, 'p1', heavy, 1000)
		const opened = m.drain()

		const windup = HERO.moves.heavy.windupMs
		expect(findEvent(opened, 'attackStarted')).toMatchObject({
			side: 'p1',
			move: 'heavy',
			landsAt: doneAt + windup,
			blockTier: HERO.moves.heavy.blockTier,
		})
		const offer = findEvent(opened, 'blockOffered')!
		expect(offer).toMatchObject({
			side: 'p2',
			at: doneAt,
			landsAt: doneAt + windup,
		})
		expect(offer.word).toHaveLength(TIER_LEN[HERO.moves.heavy.blockTier!])

		const parryAt = typeWord(m, 'p2', offer.word, doneAt + 200)
		expect(parryAt).toBeLessThan(doneAt + windup)
		const resolved = m.drain()

		expect(findEvent(resolved, 'parried')).toMatchObject({
			defender: 'p2',
			move: 'heavy',
			rewarded: true,
		})
		expect(resolved).toContainEqual({ t: 'blockCleared', side: 'p2' })
		expect(m.sim.fighters.p1.staggerUntil).toBe(
			parryAt + DUEL.parryStaggerMs,
		)
		expect(m.sim.fighters.p2.hp).toBe(HERO.maxHp)
		expect(m.blockOffer('p2')).toBeNull()
		expect(m.decks.p2.card('block')).toBeUndefined()
	})

	it('a jab (no block tier) produces no block offer, and lands', () => {
		const m = newMatch()
		m.startRound(0)
		m.drain()

		const jab = m.decks.p1.card('jab')!.word
		const doneAt = typeWord(m, 'p1', jab, 1000)
		const started = m.drain()

		expect(findEvent(started, 'attackStarted')).toMatchObject({
			side: 'p1',
			move: 'jab',
			blockTier: null,
		})
		expect(started.some((e) => e.t === 'blockOffered')).toBe(false)
		expect(m.blockOffer('p2')).toBeNull()
		expect(m.decks.p2.card('block')).toBeUndefined()

		m.advance(doneAt + HERO.moves.jab.windupMs)
		expect(findEvent(m.drain(), 'hit')).toMatchObject({
			attacker: 'p1',
			move: 'jab',
		})
	})

	it('a block cleared by a hit (not a parry) emits blockCleared', () => {
		const m = newMatch()
		m.startRound(0)
		m.drain()

		const doneAt = typeWord(m, 'p1', m.decks.p1.card('heavy')!.word, 0)
		const landsAt = doneAt + HERO.moves.heavy.windupMs
		expect(findEvent(m.drain(), 'blockOffered')?.side).toBe('p2')

		m.advance(landsAt)
		const events = m.drain()
		expect(findEvent(events, 'hit')).toMatchObject({
			attacker: 'p1',
			move: 'heavy',
		})
		expect(events.some((e) => e.t === 'parried')).toBe(false)
		expect(events).toContainEqual({ t: 'blockCleared', side: 'p2' })
		expect(m.blockOffer('p2')).toBeNull()
		expect(m.decks.p2.card('block')).toBeUndefined()
	})

	it('a block cleared by an interrupt emits blockCleared for the cancelled side', () => {
		const m = newMatch()
		m.startRound(0)
		m.drain()

		// p1's heavy lands at 1600 and interrupts p2's heavy, which started at
		// 600 and would land at 1700. p2's heavy offers p1 a block, and p1's
		// heavy offers p2 one. Both are cleared by the time it resolves.
		const p1Heavy = m.decks.p1.card('heavy')!.word
		const p2Heavy = m.decks.p2.card('heavy')!.word
		typeWord(m, 'p1', p1Heavy, 0)
		typeWord(m, 'p2', p2Heavy, 100)
		expect(m.blockOffer('p1')).not.toBeNull()
		expect(m.blockOffer('p2')).not.toBeNull()
		m.drain()

		m.advance(1600)
		const events = m.drain()
		expect(findEvent(events, 'hit')).toMatchObject({
			attacker: 'p1',
			move: 'heavy',
		})
		expect(findEvent(events, 'interrupted')).toMatchObject({
			side: 'p2',
			move: 'heavy',
		})
		expect(events).toContainEqual({ t: 'blockCleared', side: 'p2' })
		expect(events).toContainEqual({ t: 'blockCleared', side: 'p1' })
		expect(m.blockOffer('p1')).toBeNull()
		expect(m.blockOffer('p2')).toBeNull()
	})
})

describe('DuelMatch: buffering', () => {
	it('a word finished in hitstun starts exactly at readyAt, however late advance is called', () => {
		const m = newMatch()
		m.startRound(0)
		m.drain()

		// p2's jab lands on p1 at 500, which puts p1 in hitstun until 720.
		typeWord(m, 'p2', m.decks.p2.card('jab')!.word, 0)
		m.drain()
		// p1 finishes a jab at 650, inside that hitstun (500 to 720).
		typeWord(m, 'p1', m.decks.p1.card('jab')!.word, 550, 50)
		expect(m.busy('p1')).toBe(true)
		expect(m.sim.fighters.p1.pending).toBeNull()

		const readyAt = m.sim.readyAt('p1')
		expect(readyAt).toBe(720)

		// Nothing starts before the side can act.
		m.advance(readyAt - 1)
		expect(
			m.drain().some((e) => e.t === 'attackStarted' && e.side === 'p1'),
		).toBe(false)

		m.advance(10_000)
		expect(findEvent(m.drain(), 'attackStarted')).toMatchObject({
			side: 'p1',
			move: 'jab',
			landsAt: readyAt + HERO.moves.jab.windupMs,
		})
	})

	it('the latest buffered attack wins', () => {
		const m = newMatch()
		m.startRound(0)
		m.drain()

		// A heavy to keep p1 busy until 1600.
		const firstHeavy = m.decks.p1.card('heavy')!.word
		typeWord(m, 'p1', firstHeavy, 0)
		// A second heavy is buffered at 1100, then replaced by a jab at 1400.
		const secondHeavy = m.decks.p1.card('heavy')!.word
		typeWord(m, 'p1', secondHeavy, 600)
		expect(m.busy('p1')).toBe(true)
		typeWord(m, 'p1', m.decks.p1.card('jab')!.word, 1200)

		m.advance(10_000)
		const starts = m
			.drain()
			.flatMap((e) =>
				e.t === 'attackStarted' && e.side === 'p1' ? [e] : [],
			)
		expect(starts.map((e) => e.move)).toEqual(['heavy', 'jab'])
		expect(starts[1].landsAt).toBe(1600 + HERO.moves.jab.windupMs)
	})
})

describe('DuelMatch: rounds', () => {
	it('round over resets decks and clears buffers and offers; keys between rounds return null', () => {
		const m = newMatch()
		m.startRound(0)
		m.drain()

		// A heavy at 74500 lands after the round clock (75000), so its offer
		// is still live when the round ends.
		const heavyBefore = m.decks.p1.card('heavy')!.word
		typeWord(m, 'p1', heavyBefore, 74000)
		expect(m.blockOffer('p2')).not.toBeNull()

		// A jab completes at 74800 while the heavy is pending, so it buffers.
		const jabWord = m.decks.p1.card('jab')!.word
		typeWord(m, 'p1', jabWord, 74600)
		expect(m.busy('p1')).toBe(true)
		// Start the next jab, so p1 is mid-word when the round ends.
		const nextJab = m.decks.p1.card('jab')!.word
		m.key('p1', nextJab[0], 74900)
		expect(m.decks.p1.active).toBe('jab')
		m.drain()

		m.advance(75_000)
		const ended = m.drain()
		expect(findEvent(ended, 'roundOver')).toMatchObject({
			reason: 'time',
			round: 1,
		})
		expect(ended).toContainEqual({ t: 'blockCleared', side: 'p2' })
		expect(m.blockOffer('p2')).toBeNull()
		expect(m.busy('p1')).toBe(false)
		expect(m.decks.p1.active).toBeNull()
		expect(m.decks.p1.card('jab')!.engine.getCaret()).toBe(0)
		expect(m.decks.p1.card('heavy')!.word).not.toBe(heavyBefore)
		expect(m.sim.phase).toBe('roundOver')

		expect(m.key('p1', 'A', 75_100)).toBeNull()
		expect(m.drain().some((e) => e.t === 'key')).toBe(false)

		m.startRound(75_000 + DUEL.introMs)
		expect(findEvent(m.drain(), 'roundStart')).toMatchObject({ round: 2 })
		const heavy = m.decks.p1.card('heavy')!.word
		expect(m.key('p1', heavy[0], 75_000 + DUEL.introMs + 10)).not.toBeNull()
	})
})

// --------------------------------------------------------------- granularity

interface Input {
	at: number
	side: Side
	/** The key typed, or null for a backspace. */
	ch: string | null
}

/** Append `word` to `out` one key every `gap` ms from `start`. */
function typeInto(
	out: Input[],
	side: Side,
	word: string,
	start: number,
	gap: number,
): void {
	let t = start
	for (const ch of word) {
		out.push({ at: t, side, ch })
		t += gap
	}
}

/**
 * A fixed script of about eight seconds: attacks, a mistake, a backspace, a
 * locked special and some stray keys. The words are the seeded opening deal,
 * so the script is the same on every run. Keys that no longer match a card
 * after a completion count as mistakes, which is fine: this test is about
 * whether the result depends on stepping, not on the script being good.
 */
function script(): Input[] {
	const probe = newMatch(7)
	probe.startRound(0)
	const jab = probe.decks.p1.card('jab')!.word
	const heavy = probe.decks.p1.card('heavy')!.word
	const p2heavy = probe.decks.p2.card('heavy')!.word
	const p2special = probe.decks.p2.card('special')!.word
	const p2jab = probe.decks.p2.card('jab')!.word
	const p1special = probe.decks.p1.card('special')!.word

	const out: Input[] = []
	typeInto(out, 'p1', jab, 300, 150)
	typeInto(out, 'p2', p2heavy, 700, 150)
	out.push({ at: 1500, side: 'p1', ch: heavy[0] })
	// Typing another card's first letter mid-word, with no meter for the
	// special, is a mistake.
	out.push({ at: 1600, side: 'p1', ch: p1special[0] })
	out.push({ at: 1700, side: 'p1', ch: null })
	typeInto(out, 'p1', heavy.slice(1), 1800, 120)
	typeInto(out, 'p2', p2special, 3000, 200)
	typeInto(out, 'p1', jab, 4000, 150)
	out.push({ at: 5000, side: 'p2', ch: 'Q' })
	out.push({ at: 5100, side: 'p2', ch: null })
	typeInto(out, 'p2', p2jab, 5500, 150)
	out.push({ at: 7000, side: 'p1', ch: 'Q' })
	out.push({ at: 7100, side: 'p2', ch: 'Q' })
	return out.sort((a, b) => a.at - b.at)
}

const SCRIPT_END = 8000

interface Snapshot {
	events: MatchEvent[]
	fighters: ReturnType<typeof stateOf>
}

function stateOf(m: DuelMatch) {
	return structuredClone(m.sim.fighters)
}

/**
 * Replay the script. `gap` = null advances only at input times; otherwise
 * the match is advanced every `gap` ms between inputs.
 */
function replay(gap: number | null): Snapshot {
	const inputs = script()
	const m = newMatch(7)
	m.startRound(0)
	let now = 0
	for (const inp of inputs) {
		if (gap !== null) {
			for (let t = now + gap; t < inp.at; t += gap) m.advance(t)
		}
		now = inp.at
		if (inp.ch === null) m.backspace(inp.side, inp.at)
		else m.key(inp.side, inp.ch, inp.at)
	}
	if (gap !== null) {
		for (let t = now + gap; t < SCRIPT_END; t += gap) m.advance(t)
	}
	m.advance(SCRIPT_END)
	return { events: m.drain(), fighters: stateOf(m) }
}

describe('DuelMatch: granularity', () => {
	it('a scripted input log gives identical events and state at any advance granularity', () => {
		expect(script().length).toBeGreaterThanOrEqual(20)

		const atInputs = replay(null)
		expect(replay(1)).toEqual(atInputs)
		expect(replay(16)).toEqual(atInputs)

		// The script must actually exercise the rules, or the equality above
		// proves nothing.
		expect(atInputs.events.some((e) => e.t === 'hit')).toBe(true)
		expect(atInputs.events.some((e) => e.t === 'attackStarted')).toBe(true)
		expect(atInputs.events.some((e) => e.t === 'mistake')).toBe(true)
	})
})

// ------------------------------------------------------------------ bot driven

const BOT_END = 60_000

/** Two mixed-style bots at 70 WPM, each with a fixed rng. */
function bots(seed: number): Record<Side, TypistBot> {
	return {
		p1: new TypistBot('p1', botProfile(70, 'mixed'), seededRng(seed)),
		p2: new TypistBot('p2', botProfile(70, 'mixed'), seededRng(seed + 1)),
	}
}

/**
 * A bot match from the first round start, stepped in frames of `frame` ms
 * up to BOT_END. `Infinity` gives one giant step.
 */
function runBotMatch(frame: number): Snapshot {
	const m = newMatch(11, HERO, FIGHTERS.mushroom)
	const b = bots(5)
	m.startRound(0)
	b.p1.reset(0)
	b.p2.reset(0)
	const events: MatchEvent[] = [...m.drain()]
	for (let t = frame; ; t += frame) {
		const to = Math.min(t, BOT_END)
		m.step(to, b)
		events.push(...m.drain())
		if (to === BOT_END) break
	}
	return { events, fighters: stateOf(m) }
}

describe('DuelMatch: bot granularity', () => {
	it('bot-driven matches give identical events and state for any step frame', () => {
		const reference = runBotMatch(1)
		expect(runBotMatch(16)).toEqual(reference)
		expect(runBotMatch(33)).toEqual(reference)
		expect(runBotMatch(Infinity)).toEqual(reference)

		// The match must have contained the interesting interactions.
		const kinds = new Set(reference.events.map((e) => e.t))
		expect(kinds.has('hit')).toBe(true)
		expect(kinds.has('parried')).toBe(true)
		expect(kinds.has('poison')).toBe(true)
	})
})

describe('DuelMatch: full match', () => {
	it('a bot-vs-bot match runs to matchOver', () => {
		const m = newMatch(3, HERO, FIGHTERS.goblin)
		const b = bots(21)
		m.startRound(0)
		b.p1.reset(0)
		b.p2.reset(0)
		const events: MatchEvent[] = [...m.drain()]

		// Every time the match or a bot needs attention, go to that instant.
		// The restart is then exactly introMs after the round over, because
		// every sim event happens at one of these instants.
		const LIMIT = 600_000
		let restartAt: number | null = null
		let over = false
		while (!over) {
			const wake = Math.min(
				m.nextDueAt(),
				b.p1.nextActionAt(),
				b.p2.nextActionAt(),
				restartAt ?? Infinity,
			)
			if (!Number.isFinite(wake) || wake > LIMIT) break

			m.step(wake, b)
			if (restartAt !== null && wake >= restartAt) {
				m.startRound(wake)
				b.p1.reset(wake)
				b.p2.reset(wake)
				restartAt = null
			}
			for (const e of m.drain()) {
				events.push(e)
				if (e.t === 'roundOver') restartAt = wake + DUEL.introMs
				if (e.t === 'matchOver') over = true
			}
		}

		expect(over).toBe(true)
		expect(m.sim.phase).toBe('matchOver')
		const rounds = events.filter((e) => e.t === 'roundOver').length
		expect(rounds).toBeGreaterThanOrEqual(2)
		expect(rounds).toBeLessThanOrEqual(3)
		expect(findEvent(events, 'matchOver')?.winner).toBeDefined()
	})
})
