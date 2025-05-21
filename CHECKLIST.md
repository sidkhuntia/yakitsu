# Yatiksu Development Checklist

## Project Setup
- [x] Update .gitignore for Vite + TypeScript + Phaser, pnpm, IDE, and OS artifacts
- [x] Initialize Vite + TypeScript + Phaser 4 project
- [x] Set up pnpm and install dependencies
- [x] Add MIT LICENSE and README.md

## Core Game Structure
- [x] Create directory structure: `src/`, `public/`, `assets/`, `data/`, `scenes/`, `systems/`
- [x] Implement Boot Scene (load assets, show placeholder sprite)
- [x] Implement Menu Scene (start game, show best score)
- [x] Implement Play Scene (main gameplay loop)
- [x] Implement GameOver Scene (show score, retry/back to menu)

## Gameplay Mechanics
- [x] Implement typing engine (caret, highlights, word-complete logic)
- [x] Add avatar, ground, obstacle rendering and collision
- [x] Implement scoring, combo, and lives system
- [x] Add power-ups: ICE (freeze), BOMB (clear obstacle)
- [x] Integrate word lists (easy, medium, hard) and level progression

## UI/UX
- [x] Set up 960x540 canvas with pixelated scaling (now responsive fullscreen)
- [x] Implement HUD: hearts (lives), score, combo
- [x] Add settings modal (ESC): music/SFX toggle, dyslexic font, clear highscores

## Persistence & Offline
- [x] Implement localStorage save/load for scores and settings
- [ ] Add PWA support with vite-plugin-pwa and manifest

## Assets
- [x] Add placeholder sprites, SFX, and music
- [ ] Replace with custom 16x16 sprites, Bfxr SFX, BeepBox music

## Testing & CI
- [ ] Set up GitHub Actions: lint, build, Cypress smoke test

## Polish & Launch
- [ ] Accessibility pass (dyslexic font, keyboard nav)
- [ ] Performance optimization
- [ ] Deploy to Vercel/Netlify (optional)

---
## New features
- [x] Punish player for wrong key presses
- [ ] Make the game more challenging over time
- [ ] Add a tutorial modal on game startup with instructions
- [ ] make the game look like infinite runner, right now its just a static background
- [ ] there should be different types of obstacles, some that move, some that don't
- [ ] the avatar should have different animations when it runs
- [ ] Add game over screen, it should show the score and a button to restart the game

---
## Refactor: Player/Obstacle/Background/Score Improvements
- [ ] Refactor movement logic: player moves, obstacle fixed
- [ ] On word complete, destroy and respawn obstacle
- [ ] Fix obstacle y-position to align with ground
- [ ] Move ground tiles for background movement effect
- [ ] Update settings to only clear the game's storage key, not all localStorage

*Refer to `app.md` for detailed specs and sprint plan. Mark items as complete as you progress.* 