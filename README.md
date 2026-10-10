# Yakitsu

A pixel-art endless typing runner. Type the word to strike the monster before it
reaches your runner. Built with Phaser 3, TypeScript and Vite.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run verify     # typecheck + lint + tests + production build
```

| Script              | Purpose                        |
| ------------------- | ------------------------------ |
| `npm run dev`       | Dev server with HMR            |
| `npm run build`     | Typecheck and build to `dist/` |
| `npm run preview`   | Serve the production build     |
| `npm run test`      | Unit tests (Vitest)            |
| `npm run typecheck` | `tsc --noEmit`                 |
| `npm run lint`      | ESLint                         |

## How to play

- Type the word shown to strike. Correct letters turn green.
- A wrong letter turns **red** — press <kbd>Backspace</kbd> to fix it before you
  can finish the word.
- Every correct key **shoves the monster back**, and the shove **holds** until you
  land the kill. The HUD shows how much travel you have bought back.
- A mistype makes the monster surge forward.
- If the monster reaches you, you lose a life — but you **keep the word and your
  progress on it**. The retry is the same word with a tighter clock, not a new one.
- <kbd>Esc</kbd> pauses (and doubles as the settings menu).
- Chaining words builds a combo multiplier. A word with no mistakes pays +50%,
  and a large shove pays up to +60% on top.

| Difficulty | Lives | Time per letter | Roughly gates at |
| ---------- | ----- | --------------- | ---------------- |
| Easy       | 4     | 430 ms          | casual typists   |
| Medium     | 3     | 335 ms          | casual typists   |
| Hard       | 2     | 250 ms          | ~70 WPM by lv 29 |
| I am God   | 1     | 190 ms          | ~70 WPM by lv 12 |

## Architecture

```
src/
├─ main.ts              # Game config, scale fitting, HTML bridge
├─ menu.ts              # Landing menu, modals, settings wiring
├─ style.css            # All styling
├─ scenes/
│  ├─ Boot.ts           # Preload with a progress bar
│  ├─ Play.ts           # Orchestrates the run
│  └─ Duel.ts           # Duel mode: a DuelMatch against the goblin bot
└─ systems/
   ├─ tuning.ts         # All balance constants + the difficulty model
   ├─ font.ts           # Readable vs pixel face, per the dyslexicFont setting
   ├─ runState.ts       # Score, combo, lives, WPM/accuracy. No Phaser.
   ├─ typingEngine.ts   # Word/caret/error state. No Phaser.
   ├─ wordBank.ts       # Word selection and repeat avoidance
   ├─ Monster.ts        # Sprite, animations, hitbox
   ├─ WordDisplay.ts    # Per-character word rendering
   ├─ Hud.ts            # HUD + particle helpers
   ├─ Juice.ts          # Hitstop, slow-mo, shake, flash
   ├─ persistence.ts    # Versioned save data
   ├─ SettingsModal.ts / GameOverModal.ts
   └─ duel/             # Duel engine, see "Duel engine" below. Pure unless noted.
      ├─ duelSim.ts     # DuelSim: referee for HP, meter, rounds and time
      ├─ duelMatch.ts   # DuelMatch: sim + both decks + block offers + step()
      ├─ playerDeck.ts  # PlayerDeck: one side's word cards and typing state
      ├─ typistBot.ts   # TypistBot: the AI typist, botProfile()
      ├─ fighters.ts    # Roster: FIGHTERS, moves, signatures, parryBudgetOk
      ├─ duelTuning.ts  # DUEL rule constants, Side, MoveId
      ├─ duelLevels.ts  # The 12-level vs-AI ladder and its formulas
      ├─ balance.ts     # Headless bot-vs-bot harness, ladderWinRate
      ├─ rng.ts         # Seeded RNG and seed mixing
      ├─ CardView.ts    # Phaser: draws a word card (scene only)
      ├─ DuelHud.ts     # Phaser: health, meter, round and timer (scene only)
      └─ __tests__/     # Sim, deck, bot, match, balance and ladder tests
scripts/                # Balance, tuning, sweep and calibration CLIs (see Duel engine)
```

`runState.ts`, `typingEngine.ts` and `wordBank.ts` are deliberately free of any
Phaser import, so the balance and input rules are unit-testable in plain Node.

## The difficulty model

This is the part worth understanding before changing balance.

The earlier design ramped monster speed and word length **independently**, so
nothing related them. On "hard" that required 1140 WPM for the very first
3-letter word — the mode was mathematically unwinnable.

The current model inverts it. Each word is given a **time budget**, and the
monster speed is _derived_ from that budget:

```
budgetMs = reactionMs + wordLength × msPerChar × levelDecay^level
speed    = travelDistance / (budgetMs / 1000)      // px per second
```

A longer word produces a faster monster, so the two stay coupled. Two properties
fall out of this and are covered by tests:

- **A run is always theoretically completable** at the chosen difficulty.
- **Difficulty plateaus** rather than running away: the decay term is floored at
  50% of base, reached around level 47, so runs have a defined skill ceiling.

Monsters also never move per-frame. Everything is delta-time, so a 144 Hz display
plays the same game as a 60 Hz one.

`assistLevel` scales the derived **speed** rather than the budget, so a player who
needs more time gets a genuinely slower monster instead of a relabelled timer.
It is clamped to `(0, 1]` on construction so a corrupt save cannot produce a
speed the model never accounted for.

Every constant lives in `src/systems/tuning.ts`; nothing in the gameplay code
should contain a bare number.

## Gameplay rework

Three changes to the core loop, all aimed at the same problem: the game had only
one verb, so every other number was a readout rather than a decision.

### The shove is a bank, not a spring

The knockback granted `14px` per correct key but bled `110px` per second. That
put the break-even typing rate at `110 / 14 = 7.9` keys/sec — about **94 WPM**.
Anyone below that lost ground faster than they gained it, so the accumulated
shove decayed to zero before it was ever visible. The mechanic the tuning
comment described as "typing feels like a weapon" was not present in the
simulation at all.

There is now no decay term. The shove accumulates for the word, is shown live as
`HELD BACK 0.4s`, and converts to score on the kill via `timeBankMultiplier`.
Scoring it in **seconds** rather than pixels means the reward means the same
thing on a 3-letter word and a 12-letter one.

`knockbackPx` is `36` rather than something smaller because of a real constraint
the tests surfaced: the fixed `reactionMs` allowance dominates a short word's
budget, so a small grant is diluted into invisibility exactly where the reward
should be clearest. At 36px even the worst case in the game — a 4-letter word on
I am God, where the monster is fastest — still banks more than a sixth of a
second. The cap is `480px` (below `travelDistance`, so it can never stall) and is
never reached before 13 keystrokes.

### A hit costs time, not progress

`takeHit` used to call `dealWord()`, which charged the player three times for one
event: a life, the whole combo, **and** the progress on a word they had already
read — replacing it with a _different_ word, so the retry was a cold read under
deadline.

The monster is now shoved back and the **same word is re-armed**, keeping the
caret and any corrected mistakes. The cost is a tighter clock: each hit stacks
`retryBudgetPenalty` (0.85) on the budget, floored at 0.45 so a long streak of
hits can never demand an impossible typing speed. A dedicated test asserts the
winnability invariant holds at 1, 3, 10, 50 and 500 consecutive hits.

### Four settings that did nothing

`assistLevel`, `lockInputOnMistake`, `showDangerZone` and `dyslexicFont` were
persisted, defaulted, and in two cases rendered in the settings modal — but
**never read by any gameplay code**. `assistLevel` was the worst: it was
documented as the safety valve for the fairness model above, and toggling it
changed nothing. All four are now wired up, and the last two gained a UI row
(there was no way to reach them at all).

## Notable fixes over the previous build

- **Frame-rate independence.** Movement was `px * 2` per _frame_, making a 144 Hz
  monitor 2.4× harder than a 60 Hz one.
- **The kill flourish never rendered.** `completeWord` called
  `display.celebrate()` and then `dealWord()`, whose `setWord` destroyed the very
  character objects the punch tween was targeting. The punch now runs after the
  next word is dealt.
- **The run loop was silent.** `runSound` was loaded and added to the sound
  manager but never started.
- **No leaks on restart.** `shutdown()` was defined but Phaser only _emits_ a
  shutdown event, so it never ran — every retry leaked listeners, timers and
  sounds. It is now registered against the event.
- **No async race.** `spawnNewMonster` was `async` and awaited at four call
  sites; overlapping spawns orphaned monsters. It is now synchronous and
  callbacks fire exactly once.
- **Async race in the world scroll** — parallax now derives from distance
  travelled, so ground and background stay locked to the monster at any speed.
- **Visible typing.** The typed-letters `Text` object was created at 10% alpha.
- **Backspace** support with per-character error state.
- **No `P` hotkey.** It collided with the letter P, so words like "PIG" opened
  the pause menu.
- **Canvas fits the viewport** and never needs scrolling; scale is clamped to
  1:1 so the pixel art is never upscaled.
- **Settings actually persist** and are shared by the menu and the pause screen.

## Duel engine

Duel mode is a best-of-three fight played by typing. Both sides play one
ruleset: each owns a `PlayerDeck` of word cards, and the AI is a `TypistBot`
that presses keys through the same `DuelMatch` entry points a human (or a
network client) uses. There is no separate AI ruleset.

- **`DuelSim`** (`duelSim.ts`) is the pure referee for HP, meter, rounds and the
  clock. `advance(now)` resolves each due item (a landing, a poison tick, the
  round end) at its own timestamp. Calling it once at the end or every 16 ms
  gives identical HP, meter, phase and events. The M4 server and the client rely
  on this.
- **`PlayerDeck`** (`playerDeck.ts`) is one side's typing: jab, heavy, special and
  block cards, seeded so the same seed deals the same hand.
- **`DuelMatch`** (`duelMatch.ts`) joins the sim, both decks, the block offers and
  the attack buffer. It implements `BotHost`. `step(now, bots)` is the
  event-stepped driver shared by the scene and the balance harness.
- **`TypistBot`** (`typistBot.ts`) types at `12000 / wpm` ms per key with a
  per-key accuracy, and decides once per block offer whether to parry.
  `botProfile(wpm, style, overrides)` maps WPM to accuracy (0.90 to 0.98) and
  reaction time (900 to 350 ms) over 30 to 110 WPM. Styles set the move mix and
  parry appetite: `mixed`, `jabber`, `heavy`, `turtle`.

### Rules

- **Windups.** Finishing an attack word starts that move's windup, which is the
  telegraph the defender sees. The hit lands when the windup ends, unless it is
  interrupted.
- **Parry.** A parryable move offers the defender a block word of its tier.
  Typing it in time cancels the attack, staggers the attacker for 600 ms (hits
  during the stagger are counters at ×1.5) and pays 12 meter. A passive defender
  (no attack for 10 s) only deflects and takes 40 % chip.
- **Block leak.** A parried attack still deals half its damage
  (`blockDamageShare`).
- **Interrupts and armour.** A heavy or special that lands during the target's
  windup cancels that attack. A jab never interrupts. The special is armoured and
  cannot be interrupted, so a parry is its only answer.
- **Staling.** Repeating a move back to back multiplies its damage by 0.8, then
  0.64 and so on, down to 0.4. Mixing moves pays. A new round resets the count.
- **Signatures.** Each fighter has one mechanic, below. Signature floors stop
  tuning from deleting one.

### Roster

| Fighter    | Signature                                                    |
| ---------- | ------------------------------------------------------------ |
| Hero       | Resolve: below 30 % HP, every hit deals 20 % more.           |
| Goblin     | Combo: each hit in a quick chain adds +2 damage (max +2).    |
| Skeleton   | Bone Armor: takes 10 % less damage from everything.          |
| Mushroom   | Spores: its special poisons for 2 damage a second for 4.5 s. |
| Flying Eye | Gaze: every hit steals 6 meter from the target.              |

Every fighter shares the hero's word tiers, windups, hitstun, parry windows and
meter costs. They differ only in max HP, the three damages and the signature.
The `guard` signature (attacks against it wind up longer) is implemented and
tested, but no fighter uses it. Guard only matters near the speed where a parry
is barely possible, so it made balance depend on typing speed.

### Balance tooling

All of these run headless on the real word list. Output goes to `scripts/out/`.

| Command                 | What it does                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm balance`          | Prints mixed-vs-mixed win and margin matrices at 40, 70 and 100 WPM (n = 1000), plus jabber, heavy and turtle mirrors.                                         |
| `pnpm tune`             | Deterministic coordinate search over fighter max HP and damages, within identity bounds.                                                                       |
| `pnpm sweep`            | Grid over parry stagger, parry meter and counter multiplier, scored on hero mirrors vs mixed at 40/70/100 WPM.                                                 |
| `pnpm sweep:variants`   | Grid over parry word handling, block leak, stagger and parry meter (72 configs), scored on heavy and jabber mirrors.                                           |
| `pnpm sweep:v3`         | Grid over staling, block leak, parry word handling and stagger (72 configs). Scores one-trick dominance, how much parrying matters, match length and KO share. |
| `pnpm calibrate:ladder` | Measures the vs-AI ladder against its band. `--search` derives goblin HP (see Ladder).                                                                         |

**Release gate** (`balance.test.ts`). At 40, 70 and 100 WPM, with both bots
always parrying, every pairing of different fighters wins 40 to 60 % over 1000
fixed-seed matches. The band is wider than the 45 to 55 % target because bots
are far more consistent than people, which exaggerates matchup gaps. Seven
optimiser runs reached 40.3 to 59.7 % but never 45 to 55 %. The product owner
agreed the 40 to 60 % gate on 2026-10-10. The 45 to 55 % target is re-tuned from
anonymous live match data after launch.

**Dominance check** (`balance.test.ts`). At 40, 70 and 100 WPM, in each
fighter's mirror, a jabber or heavy bot may not beat a mixed bot by more than
55 %. The first harness run had a turtle winning mirrors up to 97 %, so the
rules were changed. Turtle is printed by `pnpm balance` but not gated.

**Fairness** (`balance.test.ts`). Every parryable move passes `parryBudgetOk`:
the longest block word, typed at the move's declared speed, plus a 450 ms
reaction allowance, fits inside its windup.

### Ladder

The vs-AI ladder (`duelLevels.ts`) is 12 levels. The player is the Hero, and the
opponent is a goblin `TypistBot`. Each level's `t` runs from 0 (level 1) to 1
(level 12), and every knob is derived from it:

- **Target speed:** 22 to 95 WPM. **Reaction allowance:** 900 to 520 ms.
- **Goblin HP:** `143.6 + 59.7 × (1 − e^(−3.8t))`. This is a saturating fit to
  the HP that holds a target-speed player at 72.5 %, searched per level.
- **Goblin typing speed:** 0.85 × target. **Goblin parry rate:** 0.25 on every
  level. It is held flat on purpose: a goblin that parries more needs less HP to
  hold the same player, so a rising parry curve would make the top of the ladder
  easier. The difficulty lives in the HP curve.
- **Windup scale:** `requiredWindupScale`, the smallest multiplier that makes every
  parryable goblin move fair at the level's speed and reaction.

The goal per level is that a Hero typing at the target speed wins 65 to 80 %, and
at 0.75 × target wins at most 35 %. `pnpm calibrate:ladder` prints the shipped
ladder measured on the check seeds, and `pnpm calibrate:ladder -- --search`
derives the HP curve on separate search seeds (600 matches per point). The
ladder test enforces the band on levels 1, 6 and 12.

Level 10 is the known exception. On the check seeds it wins 64 %, a point under
the band. Its search optimum (about 190 HP) sits below the ramp, and a monotone
ramp cannot go lower at level 10 without taking level 8 out of the band. Read it
as a known limit of the monotone structure, not a tuning slip.

## Testing

`src/systems/__tests__/systems.test.ts` covers the typing model, the fairness
invariants, scoring, progression and word selection. The fairness tests are the
important ones: they fail if anyone reintroduces a difficulty setting that
requires an impossible typing speed.

## Licence

The code is MIT, see [LICENSE](./LICENSE).

Art, audio and fonts are not MIT. They are CC0 1.0 unless noted, and the
display font, Press Start 2P, is under the SIL Open Font License 1.1. Every file
under `public/` is credited in [CREDITS.md](./CREDITS.md) and listed in
`docs/asset-manifest.json`. `npm run check:assets` fails if one is missing.
