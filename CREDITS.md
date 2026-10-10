# Credits and licences

The source code is MIT licensed (see [LICENSE](./LICENSE)). Art, audio and fonts
are **not** MIT. Each group below names its author, source and licence.

`docs/asset-manifest.json` maps every file under `public/` to its credit line.
`npm run check:assets` fails if a file has no entry there.

## Monsters: CC0 1.0

Goblin, Mushroom, Skeleton and Flying Eye sprite sheets (`public/assets/monsters/`).

- Author: LuizMelo
- Source: "Monsters Creatures Fantasy", https://luizmelo.itch.io/monsters-creatures-fantasy
- Licence: Creative Commons Zero 1.0 Universal. Credit is not required; it is appreciated.

## Hero: CC0 1.0

Run, Take Hit, Death, Idle, Attack1 and Attack2 sheets (`public/assets/character/`).

- Author: LuizMelo
- Source: "Hero Knight", https://luizmelo.itch.io/hero-knight
- Licence: Creative Commons Zero 1.0 Universal. Credit is not required; it is appreciated.
- Run, Take Hit and Death are byte-identical to the pack's files. Idle, Attack1 and Attack2 are copied unchanged.

## Backdrop: CC0 1.0

Eight layers, `public/assets/background/forest-*.png` (sky, sun, clouds,
mountains 1 to 3, trees, rocks).

- Author: MatiasVME
- Source: "Parallax background forest pixel art", https://opengameart.org/content/parallax-background-forest-pixel-art
- Licence: CC0 1.0 Universal ("No attribution required" on the page).
- Files are unmodified. Scaling to fill the screen happens at runtime.

## Music: CC0 1.0

- `audio/music/fight-loop.mp3`: "Fast fight / battle music (looped)", by Ville
  Nousiainen, loop edit by XCVG. https://opengameart.org/content/fast-fight-battle-music-looped
  Converted from the WAV to MP3. Credit is optional on the page; given here.
- `audio/music/menu-bossa-nova.mp3`: "Bossa Nova", by Joth. https://opengameart.org/content/bossa-nova
  No attribution requested. No code path plays it yet (the menu is HTML).

## Sound effects: CC0 1.0

All from Kenney (https://kenney.nl). Each file was converted from OGG to MP3 and
is otherwise unchanged. No credit is required.

- "Impact Sounds", https://kenney.nl/assets/impact-sounds: `hit-light`, `hit-heavy`, `parry`, `ko`
- "Interface Sounds", https://kenney.nl/assets/interface-sounds: `key-type`, `mistake`, `ui-click`, `round-start`, `pause`, `unpause`, `danger`, `power-up`, `level-up`
- "RPG Audio", https://kenney.nl/assets/rpg-audio: `whoosh` (a blade draw)

## Font: SIL Open Font License 1.1

- `assets/fonts/PressStart2P-Regular.ttf` ("Press Start 2P"), unmodified.
- Copyright: The Press Start 2P Project Authors (cody@zone38.net).
- Source: https://github.com/google/fonts/tree/main/ofl/pressstart2p
- Licence text: `assets/fonts/OFL.txt`, shipped with the font as the OFL requires.

## Word list: CC0 1.0

`data/words/words.js` is a word list written for this project, with Claude
(Haiku). It is released under CC0 1.0, as its header says.

## Original art: CC0 1.0

Made for this project, released under CC0 1.0:

- `assets/ice.svg`, `assets/bomb.svg`: power-up icons
- `yakitsu-logo.svg`: the YAKITSU wordmark
- `social-card.svg`, `social-card.png` (1200x630): the social preview image
- `favicon.svg`, `favicon.png` (32x32)

## Loaded at runtime, not shipped

- "Jersey 10", loaded by `index.html` from Google Fonts. The Google Fonts
  listing gives SIL Open Font License 1.1. This was not checked against the
  font's own licence file in the asset-check session, so confirm it before
  release.
