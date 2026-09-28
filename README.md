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
- Every correct key **shoves the monster back**. Fast typing buys real time.
- A mistype makes the monster surge forward.
- If the monster reaches you, you lose a life. Lose them all and the run ends.
- <kbd>Esc</kbd> pauses (and doubles as the settings menu).
- Chaining words builds a combo multiplier. A word with no mistakes pays +50%.

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

Every constant lives in `src/systems/tuning.ts`; nothing in the gameplay code
should contain a bare number.

## Notable fixes over the previous build

- **Frame-rate independence.** Movement was `px * 2` per _frame_, making a 144 Hz
  monitor 2.4× harder than a 60 Hz one.
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
