# M1 spec — one ruleset, five fighters, a balance gate

This is the contract every M1 change is built against. If code and this file
disagree, the file wins until it is deliberately changed.

## Why

The prototype was asymmetric. The player typed a word and the hit landed
~110 ms later, unblockable; the goblin attacked through a separate system
(`ENEMY_ATTACKS`, `enemyWindupMs`, `GoblinBrain`) with long telegraphs. Online
PvP needs both sides to play by the **same** rules, so M1 makes the model
symmetric:

- Both sides own a `PlayerDeck` (jab / heavy / special cards).
- Finishing an attack word starts that move's **windup** (`FighterMove.windupMs`).
  The windup is the telegraph the defender sees.
- If the move is parryable (`blockTier !== null`), the defender is offered a
  block word of that tier and can type it before the hit lands.
- The AI is a **typist bot** pressing keys into its own deck through the same
  path a human (or a network client) uses. There is no separate AI ruleset.

## Files and owners

| File                                                        | Status                                                      | Notes                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/systems/duel/fighters.ts`                              | **frozen contract** (data may be tuned by the balance step) | `FighterDef`, `FighterMove`, `Signature`, `FIGHTERS`, `parryBudgetOk` |
| `src/systems/duel/duelSim.ts`                               | rewrite                                                     | rules + signatures                                                    |
| `src/systems/duel/playerDeck.ts`                            | change                                                      | tiers/costs from a `FighterDef`                                       |
| `src/systems/duel/typistBot.ts`                             | new                                                         | bot against the `BotHost` interface                                   |
| `src/systems/duel/duelMatch.ts`                             | new                                                         | sim + two decks + block offers + buffering                            |
| `src/systems/duel/balance.ts` + `scripts/balance.ts`        | new                                                         | headless harness                                                      |
| `src/scenes/Duel.ts`, `duelLevels.ts`                       | change                                                      | scene drives a `DuelMatch`; ladder maps to bot profiles               |
| `goblinBrain.ts`, `ENEMY_ATTACKS`, `enemyWindupMs`, `MOVES` | delete in the scene step                                    | not before: the scene still imports them                              |

`duelTuning.ts` keeps `Side`, `other`, `MoveId`, `DUEL`. Do not remove
`MOVES`, `ENEMY_ATTACKS`, `enemyWindupMs` until the scene step.

## DuelSim (rewrite)

```ts
export interface DuelOptions {
	fighters: Record<Side, FighterDef>
	/** Overrides FighterDef.maxHp (ladder raises the AI's). */
	maxHp?: Partial<Record<Side, number>>
	/** Multiplier on windups of attacks thrown BY this side. Default 1. */
	windupScale?: Partial<Record<Side, number>>
}

class DuelSim {
	constructor(options: DuelOptions)
	readonly fighters: Record<Side, FighterState>
	readonly defs: Record<Side, FighterDef>
	phase: DuelPhase
	round: number
	startRound(now: number): void
	timeLeftMs(now: number): number
	canAct(side: Side, now: number): boolean
	isStaggered(side: Side, now: number): boolean
	isPassive(side: Side, now: number): boolean
	/** Earliest time `side` could start an attack if nothing else happens; Infinity while its own attack is pending. */
	readyAt(side: Side): number
	attack(side: Side, move: MoveId, perfect: boolean, now: number): boolean
	parry(side: Side, perfect: boolean, now: number): boolean
	mistake(side: Side, now: number): void
	advance(now: number): void
	/** Earliest future time at which advance() would change anything (a landing, a poison tick, the round clock). Infinity when none. */
	nextDueAt(): number
	drain(): DuelEvent[]
}
```

`FighterState` gains `poison: { dps: number; until: number; nextTickAt: number } | null`.
Pending attacks carry `move: MoveId, damage, landsAt, startedAt, perfect, armored, interrupts, blockTier, hitstunMs`.

Events (`DuelEvent`):

```ts
| { t: 'roundStart'; round: number }
| { t: 'attackStarted'; side: Side; move: MoveId; landsAt: number; blockTier: number | null; armored: boolean }
| { t: 'hit'; attacker: Side; move: MoveId; damage: number; counter: boolean; perfect: boolean }
| { t: 'parried'; defender: Side; move: MoveId; perfect: boolean; rewarded: boolean; chip: number }
| { t: 'interrupted'; side: Side; move: MoveId }
| { t: 'poison'; side: Side; damage: number }          // side = victim
| { t: 'drain'; from: Side; amount: number }           // meter stolen from `from`
| { t: 'mistake'; side: Side }
| { t: 'roundOver'; winner: Side | null; reason: 'ko' | 'time'; round: number }
| { t: 'matchOver'; winner: Side }
```

Rules (everything not listed is unchanged from the prototype, including
`DUEL` constants, chain/hitstun decay, passivity, counters, meter gains):

- `attack`: needs `canAct` and `meter >= move.meterCost`. Windup =
  `move.windupMs × windupScale[side] × (defender signature 'guard' ? incomingWindupScale : 1)`.
- `parry`: false unless an incoming attack exists **and** its `blockTier !== null`.
  Passive defender → `rewarded: false` plus chip (as before). Otherwise
  rewarded: stagger attacker + meter. (`rewardsParry`/punish no longer exist.)
- Landing damage, in this order: base → ×`perfectMultiplier` if perfect →
  ×`counterMultiplier` if counter → attacker `resolve` (×damageScale when
  attacker hp/maxHp ≤ hpThreshold) → attacker `combo` (+min(maxBonus,
  newChain × bonusPerLink), where newChain is the defender's chain count
  after this hit) → `Math.round`.
- `poison` signature: when the named move lands, set defender poison to
  `{ dps, until: landsAt + durationMs, nextTickAt: landsAt + 1000 }` (refresh,
  never stack). Each tick deals `dps`, emits `poison`, can KO (winner is the
  other side). Ticks while `nextTickAt <= until`. Cleared on `startRound`.
- `drain` signature: on hit, `amount = min(defender.meter, meterPerHit)`; move
  it from defender to attacker (attacker capped at max); emit `drain` when > 0.
- **Time order.** `advance(now)` repeatedly takes the earliest due item
  (pending landing, poison tick, round end) with time ≤ now and resolves it at
  its own timestamp. Ties: landings before ticks before round end; two
  landings at the same ms resolve p1 first.
- **Granularity invariance (hard requirement).** For the same sequence of
  `attack/parry/mistake` calls at the same timestamps, calling `advance` once
  at the end or every 1 ms / 16 ms must give identical HP, meter, phase and
  event list. This is what lets the M4 server and the client agree.

## PlayerDeck (change)

`new PlayerDeck(pick: WordPicker, seed: number, fighter: FighterDef)`.
Card tiers and meter costs come from `fighter.moves`; nothing else changes.
Keep suspend/resume, typo-never-switches, counter-based seeding.

## TypistBot (new) — `typistBot.ts`

```ts
export interface BotHost {
	deck(side: Side): Pick<PlayerDeck, 'active' | 'card' | 'isUnlocked'>
	meter(side: Side): number
	/** Own attack pending or a finished attack buffered. */
	busy(side: Side): boolean
	/** The live block offer for `side`, with the time it was offered. */
	blockOffer(side: Side): { word: string; offeredAt: number } | null
	key(side: Side, ch: string, at: number): void
	backspace(side: Side, at: number): void
}

export interface BotProfile {
	wpm: number // keystroke interval = 12000 / wpm
	accuracy: number // per-key chance of the right letter, 0..1
	reactionMs: number // offer → decision to parry
	parryChance: number // chance it tries to parry a parryable attack
	moveWeights: Record<MoveId, number> // choice weights when free; special only if unlocked
	jitter: number // ± fraction applied to each key interval
}

export type BotStyle = 'mixed' | 'jabber' | 'heavy' | 'turtle'
export function botProfile(wpm: number, style?: BotStyle): BotProfile

export class TypistBot {
	constructor(side: Side, profile: BotProfile, rng: () => number)
	reset(now: number): void // new round
	nextActionAt(): number
	tick(host: BotHost, now: number): void
}
```

Behaviour:

- `tick` performs every action whose scheduled time is ≤ `now`, passing **that
  scheduled time** (not `now`) to `host.key/backspace`.
- Typing: one key per interval. With probability `1 - accuracy` it presses a
  wrong letter (never the expected one, never another card's first letter),
  then a backspace one interval later, then continues.
- Picking: when no card is active, choose by `moveWeights` among unlocked
  cards. While `busy`, it may type an attack word up to its last letter, then
  waits until not busy to press the last letter.
- Parrying: when `blockOffer` shows a new word, decide once (rng <
  `parryChance`) at `offeredAt + reactionMs`. If parrying: backspace the
  active word if it has errors, then type the block word. If the offer
  disappears, continue whatever `deck.active` is.
- Fully deterministic for a given rng.

## DuelMatch (new) — `duelMatch.ts`

```ts
export interface MatchOptions {
	seed: number
	fighters: Record<Side, FighterDef>
	pick: WordPicker
	maxHp?: Partial<Record<Side, number>>
	windupScale?: Partial<Record<Side, number>>
}
export type MatchEvent =
	| DuelEvent
	| {
			t: 'blockOffered'
			side: Side
			word: string
			landsAt: number
			at: number
	  }
	| { t: 'blockCleared'; side: Side }
	| { t: 'key'; side: Side; result: KeyResult; at: number }

export class DuelMatch implements BotHost {
	constructor(options: MatchOptions)
	readonly sim: DuelSim
	readonly decks: Record<Side, PlayerDeck> // both seeded with options.seed
	startRound(now: number): void // sim.startRound + decks.resetAll + clear buffers/offers
	key(side: Side, ch: string, now: number): KeyResult | null // null outside 'fight'
	backspace(side: Side, now: number): void
	advance(now: number): void
	nextDueAt(): number
	drain(): MatchEvent[]
	/** Event-stepped driver shared by the scene and the balance harness. */
	step(now: number, bots: Partial<Record<Side, TypistBot>>): void
	// + BotHost methods
}
```

- `key`: advance to `now` first. Mistake → `sim.mistake`. Completed block →
  `sim.parry`. Completed attack → buffer `{ move, perfect }` (latest wins) and
  start it immediately if `canAct`.
- A buffered attack starts at the exact moment the side becomes able
  (`sim.readyAt`), not at the next `advance` call: `advance(now)` loops over
  `min(sim.nextDueAt(), readyAt of buffered sides)` ≤ now.
- `attackStarted` with `blockTier !== null` → `decks[defender].offerBlock(tier)`,
  emit `blockOffered`. The defender's block is cleared (and `blockCleared`
  emitted) on that attack's `hit`, `parried`, `interrupted`, or `roundOver`.
- `roundOver` → reset both decks and buffers.
- Same granularity invariance as the sim, including bot-driven matches.
- Bots only observe the match when they wake, so anything driving bots must
  go through `step()`, which advances to each bot wake time in order. The
  scene calls `step(simNow, { p2: bot })` once per frame.

## Balance harness — `balance.ts`, `scripts/balance.ts`

- `simulateMatch(a, b, profileA, profileB, seed): { winner: Side; rounds; durationMs }`
  runs a full best-of-three with two bots, event-stepped
  (`t = min(bots.nextActionAt, match.nextDueAt, next round start)`), with
  `DUEL.introMs` between rounds. Word picker: a fixed in-repo word list.
- `winRateMatrix(wpm, style, n)`: each unordered pair, n seeds, sides swapped
  on half.
- `pnpm balance` prints matrices at 40 / 70 / 100 WPM × styles.
- **Release gate (test):** at 70 WPM, `mixed` vs `mixed`, every pairing of
  different fighters wins 45–55 %. Fixed seeds, runs in < 20 s.
- **Dominance check (test):** for every fighter, `jabber` vs `mixed` mirror at
  70 WPM must not exceed 60 %.
- **Fairness test:** every parryable move passes `parryBudgetOk` with its
  block tier's `maxLen`.

## Test ledger — invariants that must survive the rewrite

Ported into the new test files, never deleted or loosened:

1. Attack lands after its windup, not before; no second attack while one is in flight.
2. Parry cancels + staggers + pays meter; parry with nothing incoming does nothing.
3. Hits on a staggered fighter are counters (×1.5).
4. Interrupting hit cancels a non-armored windup; armored cannot be interrupted; jab does not interrupt.
5. KO ends round, two rounds end match; time-out goes to higher HP **fraction**.
6. Meter gates the special.
7. Hitstun decays along a chain; no rhythm of jabs stunlocks; a long gap resets the chain.
8. Passive rule: passive parries deflect only and leak chip.
9. Deck: distinct first letters; first letter commits; perfect tracking incl. corrected typos; special locked without meter; block switch mid-word; suspend/resume on parry, on landing, on backing out; switching attacks resets the card left; typo never becomes a switch; backspace to empty releases; loaded detection; clearing an active block frees input.
10. Seeding: same seed → same hand; n-th heavy equal regardless of jabs typed; different seeds differ; block words seeded.
11. Ladder/progress: knobs monotonic; clamping; unlock rules; assisted win sets no best time; tampered save repaired.
12. New: granularity invariance (sim and match); signatures each have a test; `parryBudgetOk` for all moves.
