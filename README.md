# Yakitsku

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
│  └─ Play.ts           # Orchestrates the run
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
   └─ SettingsModal.ts / GameOverModal.ts
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

## Testing

`src/systems/__tests__/systems.test.ts` covers the typing model, the fairness
invariants, scoring, progression and word selection. The fairness tests are the
important ones: they fail if anyone reintroduces a difficulty setting that
requires an impossible typing speed.

## Licence

MIT — see [LICENSE](./LICENSE). Original art and audio inherit the same licence.
