# Yatiksu

A desktop-first, offline 8-bit typing runner built with Phaser 4, TypeScript, and Vite.

## Setup

```bash
pnpm install
pnpm dev
```

For full specs and engineering blueprint, see `app.md`.

Next Steps:
I've thoroughly reviewed the full codebase. Here are my suggestions, prioritized by impact:

---

## High Impact - Core Mechanics

### 1. Enable and polish power-ups

Power-ups are fully coded (`spawnPowerUp` at line 683, `handlePowerUp` at line 709 in `src/scenes/Play.ts`) but commented out at line 293. The 5% spawn rate is also too low -- bump it to 15-20% initially, and tie spawn chance to combo streak to reward consistent play.

### 2. Multiple simultaneous monsters

Currently only one monster exists at a time. Spawning 2-3 monsters with different words (especially at higher difficulty) would create a prioritization mechanic -- the player must choose which word to type first based on which monster is closest. This is the single biggest gameplay depth improvement.

### 3. Monster types should have distinct behaviors

Right now `Monster.ts` types (Skeleton, Flying eye, Mushroom, Goblin) are purely cosmetic -- same speed, same collision. Give them traits:

- **Skeleton**: slow, tanky (requires a longer word)
- **Flying eye**: fast, sinusoidal movement
- **Mushroom**: average speed, splits into 2 smaller words on "death"
- **Goblin**: rushes in bursts, pauses briefly

### 4. Implement life recovery from the blueprint

`app.md` line 61 specifies `+1 life every 40-word flawless streak (cap 5)` but it's not implemented. This gives skilled players a safety net and rewards accuracy.

### 5. Monster reaching avatar should penalize, not silently respawn

When a monster goes off-screen left (line 617-625), it just respawns quietly. It should call `loseLife()` -- the player failed to type the word in time. Currently the only life loss is physics collision, which feels inconsistent.

---

## Medium Impact - Game Feel / Juice

### 6. Screen shake and flash on damage

`loseLife()` at line 435 just decrements lives and updates HUD. Add camera shake and a red flash:

```typescript
this.cameras.main.shake(200, 0.01)
this.cameras.main.flash(150, 255, 0, 0, false, null, null, 0.3)
```

### 7. Particle burst on monster kill

When a monster dies, emit a particle burst at its position (blood, bones, or sparks depending on type). Phaser 3's particle system handles this natively. Adds massive "game feel."

### 8. Combo milestone celebrations

The combo text (`Combo: N`) updates silently. Add visual pop-ups at milestones (10, 25, 50, 100) with tween scale + fade:

```typescript
if ([10, 25, 50, 100].includes(this.combo)) {
	const popup = this.add
		.text(
			this.scale.width / 2,
			this.scale.height / 2 - 80,
			`${this.combo}x COMBO!`,
			{ fontSize: '48px', color: '#ff0' },
		)
		.setOrigin(0.5)
	this.tweens.add({
		targets: popup,
		y: popup.y - 60,
		alpha: 0,
		duration: 1000,
		onComplete: () => popup.destroy(),
	})
}
```

### 9. Danger zone warning

When the monster is within ~200px of the avatar, tint the word red and pulse the border or play a warning sound. Gives the player urgency cues instead of sudden death.

### 10. Word display on the monster itself

Show the word floating above the monster sprite (not in the center of the screen). This creates a direct visual link between the word and the threat. The center-screen text can stay as a secondary display.

---

## Lower Impact - Polish & Retention

### 11. Backspace support in `TypingEngine`

`TypingEngine.input()` (line 10 of `src/systems/typingEngine.ts`) is forward-only. Adding optional backspace support (toggled via settings) would make the game more accessible on easier difficulties.

### 12. Adaptive word difficulty

`getNextWord()` at line 396 picks randomly within a tier. Track the player's recent accuracy -- if they're acing it, jump a tier early; if struggling, stay on the current tier longer. This creates a flow state.

### 13. Streak bonus scoring

Beyond combo multiplier, add a "perfect word" bonus (no mistakes on that word) worth +50% of the base score. This rewards precision and gives a reason to not just mash keys.

### 14. Score persistence improvements

`persistence.ts` only tracks `bestScore` and `lastScores`. Add:

- Best WPM / best accuracy
- Total words typed (all-time)
- Longest combo ever
- Per-difficulty leaderboards

### 15. Progressive speed curve

`increaseDifficulty()` at line 886 uses a linear ramp. A logarithmic curve (`baseSpeed * (1 + 0.3 * Math.log(difficultyLevel + 1))`) feels fairer -- fast initial ramp, then plateaus, keeping it challenging but not impossible.

---

## Summary Table

| #   | Suggestion                     | Effort | Impact    |
| --- | ------------------------------ | ------ | --------- |
| 1   | Enable power-ups               | Low    | High      |
| 2   | Multiple simultaneous monsters | Medium | Very High |
| 3   | Distinct monster behaviors     | Medium | High      |
| 4   | Life recovery (40-word streak) | Low    | Medium    |
| 5   | Penalize off-screen monster    | Low    | High      |
| 6   | Screen shake / flash           | Low    | Medium    |
| 7   | Death particles                | Low    | Medium    |
| 8   | Combo milestones               | Low    | Medium    |
| 9   | Danger zone warning            | Low    | Medium    |
| 10  | Word on monster sprite         | Medium | High      |
| 11  | Backspace support              | Low    | Low       |
| 12  | Adaptive difficulty            | Medium | High      |
| 13  | Perfect word bonus             | Low    | Medium    |
| 14  | Richer persistence             | Low    | Medium    |
| 15  | Logarithmic speed curve        | Low    | Medium    |

Want me to implement any of these? I'd recommend starting with **#1, #4, #5, #6** as quick wins, then tackling **#2 + #3 + #10** together as the big gameplay upgrade.
