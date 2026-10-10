# Asset research for milestone 2 (assets)

Date of research: 2026-10-10. Read-only. Nothing was downloaded or installed, no git commands were run, and no repo file was edited except this one.

Quoting note: page wording is paraphrased, apart from licence field values, which are metadata. Confirm exact wording on the pages before publishing credits.

## Summary

1. README.md line 192 says art and audio "inherit the same licence" (MIT). That is wrong. Only the code is MIT (LICENSE). Art and audio need per-asset credits.
2. Monsters (Goblin, Skeleton, Mushroom, Flying Eye) match LuizMelo's "Monsters Creatures Fantasy" (CC0 1.0). Frame counts match every sheet. Confidence high.
3. The three existing hero sheets (Run 8 frames, Take Hit 4, Death 11) match LuizMelo's "Hero Knight" (CC0 1.0) on frame counts only. Confidence medium. Frame size (180x180 in the repo) is unverified, because no page or public code states the pack's frame size. The repo's Run sheet shows a sword-carrying fighter, which fits an armed knight better than the martial-artist "Martial Hero" line.
4. Backgrounds (Layer_0000 to 0011, 12 files) are unconfirmed. Eder Muniz's "Free Pixel Art Forest" is CC BY-ND 4.0 and says "9 layers", not 12. Two layers are grey-plus-alpha (possibly overlays) and two are opaque. The original canvas size is unknown. This is a release blocker until resolved.
5. Audio (8 MP3s), the font (gaming_font.woff2) and the word list have no provenance in the repo. These are release blockers until the developer confirms source and licence.
6. No free CC0 hero candidate has a Block or Defend animation. That item is nice-to-have, so it can be treated as unmet for M2.
7. Recommended hero pack: "Hero Knight" by LuizMelo (CC0, name-your-own-price). It has Idle 11, Run 8, Attack1 7, Attack2 7, Take Hit 4, Death 11. Conditional on confirming frame size. Do not confuse it with Sven Thole's different "Hero Knight" (different licence).
8. Fight music: OpenGameArt "Fast fight / battle music (looped)" (CC0, optional credit). Menu music: OpenGameArt "Bossa Nova" (CC0, verified).
9. SFX: Kenney "Impact Sounds" (130 files), "Interface Sounds" (100), "RPG Audio" (50) are all CC0 and verified on kenney.nl. No dedicated parry or whoosh pack was found, so that remains a gap.
10. The git history of asset files was not checked. The brief asked for `git log` but also said not to run git, so I followed the no-git rule.

## 1. Inventory

Paths are relative to the repo root. Sizes are file bytes. Image dimensions come from `sips`.

### Monster sprite sheets (`public/assets/monsters/`)

Frame size is 150x150 (inferred from sheet height 150 and the widths divided by 150). Frame count is sheet width / 150.

| Monster    | Sheet        | Size (px) | Frames | Bytes |
| ---------- | ------------ | --------- | ------ | ----- |
| Goblin     | Idle.png     | 600x150   | 4      | 2573  |
| Goblin     | Run.png      | 1200x150  | 8      | 4883  |
| Goblin     | Attack.png   | 1200x150  | 8      | 4967  |
| Goblin     | Take Hit.png | 600x150   | 4      | 3039  |
| Goblin     | Death.png    | 600x150   | 4      | 2935  |
| Mushroom   | Idle.png     | 600x150   | 4      | 1737  |
| Mushroom   | Run.png      | 1200x150  | 8      | 3415  |
| Mushroom   | Attack.png   | 1200x150  | 8      | 3937  |
| Mushroom   | Take Hit.png | 600x150   | 4      | 2333  |
| Mushroom   | Death.png    | 600x150   | 4      | 2490  |
| Skeleton   | Idle.png     | 600x150   | 4      | 2767  |
| Skeleton   | Run.png      | 600x150   | 4      | 2793  |
| Skeleton   | Attack.png   | 1200x150  | 8      | 5605  |
| Skeleton   | Shield.png   | 600x150   | 4      | 2510  |
| Skeleton   | Take Hit.png | 600x150   | 4      | 3425  |
| Skeleton   | Death.png    | 600x150   | 4      | 3513  |
| Flying eye | Run.png      | 1200x150  | 8      | 3508  |
| Flying eye | Attack.png   | 1200x150  | 8      | 3492  |
| Flying eye | Take Hit.png | 600x150   | 4      | 2104  |
| Flying eye | Death.png    | 600x150   | 4      | 2242  |

### Hero sheets (`public/assets/character/`)

Frame size is 180x180 (from loader code in `src/scenes/Boot.ts`). Frame count is sheet width / 180.

| Sheet        | Size (px) | Frames | Bytes |
| ------------ | --------- | ------ | ----- |
| Run.png      | 1440x180  | 8      | 7994  |
| Take Hit.png | 720x180   | 4      | 4623  |
| Death.png    | 1980x180  | 11     | 10649 |

Missing for M2: hero Idle and Attack. The duel code (`src/scenes/Duel.ts`) uses monster idle and attack only.

### Backgrounds (`public/assets/background/`)

All are 1280x720 PNG. Layer_0000 is the ground foreground and Layer_0001 the ground back (`Boot.ts` lines 85 to 86). The other layers are loaded as `layer_0002` to `layer_0011`.

| File           | Bytes |
| -------------- | ----- |
| Layer_0000.png | 18748 |
| Layer_0001.png | 76167 |
| Layer_0002.png | 69411 |
| Layer_0003.png | 98984 |
| Layer_0004.png | 9731  |
| Layer_0005.png | 78773 |
| Layer_0006.png | 62549 |
| Layer_0007.png | 8225  |
| Layer_0008.png | 36573 |
| Layer_0009.png | 11290 |
| Layer_0010.png | 1442  |
| Layer_0011.png | 1570  |

Total is about 473 KB.

### Other images (misc)

| File                                     | Size (px) | Bytes  | Used by / note                              |
| ---------------------------------------- | --------- | ------ | ------------------------------------------- |
| `public/assets/menu_background.webp`     | 1280x720  | 30096  | `Boot.ts`                                   |
| `public/assets/gameover_background.webp` | 1280x720  | 15500  | `Boot.ts`                                   |
| `public/assets/placeholder.webp`         | 512x512   | 19314  | loaded as `logo` in `Boot.ts`               |
| `public/assets/bomb.png`                 | 27x32     | 2453   | power-up                                    |
| `public/assets/ice.png`                  | 32x32     | 2149   | power-up                                    |
| `public/metadata.webp`                   | 963x543   | 17644  | social or meta image, origin unknown        |
| `public/yakitsu.png`                     | 500x500   | 236411 | game logo or icon, origin unknown           |
| `public/favicon.png`                     | 32x32     | 1781   | favicon                                     |
| `public/vite.svg`                        | ~32x32    | 1497   | likely the Vite template logo, not verified |

### Audio (`public/assets/audio/`)

All are MP3 (LAME 3.100). Bitrates were read from file headers.

| File                           | Bytes  | Bitrate and channels | ID3 or metadata clues                          |
| ------------------------------ | ------ | -------------------- | ---------------------------------------------- |
| `background_music.mp3`         | 955297 | 64 kbps stereo       | none (no artist or copyright tag)              |
| `ui/menu_background_music.mp3` | 144637 | 56 kbps mono         | none                                           |
| `ui/click.mp3`                 | 28968  | 64 kbps stereo       | "Logic Pro X", TDRC 2021-09-27, "Tempo: 140.0" |
| `ui/pause.mp3`                 | 8761   | 64 kbps stereo       | "REAPER", TDRC 2022-02-03                      |
| `ui/unpause.mp3`               | 8318   | 64 kbps stereo       | "REAPER", TDRC 2022-02-03                      |
| `avatar/run.mp3`               | 1972   | 56 kbps mono         | none                                           |
| `avatar/speed_up.mp3`          | 4921   | 56 kbps mono         | none                                           |
| `monsters/hit.mp3`             | 2614   | 56 kbps mono         | "Logic Pro X", TDRC 2016-02-08, "Tempo: 136.0" |

The DAW tags suggest some clips were made in Logic or REAPER. That does not show who made them, so this is not evidence of a licence.

### Fonts and data

| File                                    | Bytes   | Note                                                                                                                                                           |
| --------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/assets/fonts/gaming_font.woff2` | 6812    | used as `'Retro Font'` in `src/style.css` line 2. Identity unknown. Cannot decode here (fontTools and brotli are not installed, and installs are not allowed). |
| `public/data/words/words.js`            | 30949   | word list (`THESAURUS`), loaded as a script. Provenance unknown.                                                                                               |
| `index.html` line 27                    | runtime | loads Google Fonts "Jersey 10" at runtime. Not a repo file.                                                                                                    |

### Licence and credits in the repo

- `LICENSE` is MIT, copyright "Siddhartha Khuntia", 2025. That covers code.
- `README.md` line 190 to 192 says the art and audio inherit MIT. This is the claim to correct.
- No `CREDITS.md`, no per-asset source list, and no asset URLs were found in `README.md`, `docs/`, `src/`, `index.html` or `public/data/`. The only URLs are localhost and the production site.

## 2. Origins and licences

Confidence: high means verified on the primary page. Medium means strong evidence without a direct file check. Low means a guess.

### A. Monsters (`public/assets/monsters/*`): LuizMelo, "Monsters Creatures Fantasy"

- Page: https://luizmelo.itch.io/monsters-creatures-fantasy
- Author: LuizMelo
- Asset licence field: Creative Commons Zero v1.0 Universal (CC0)
- Price: name your own price. A $0 download was not confirmed on the page.
- Commercial use: yes. The page says the package can be used in commercial and non-commercial projects.
- Redistribution in a public repo: yes (CC0).
- Attribution: not required. The page asks for credit, and that is recommended.
- Frame counts on the page: Skeleton idle 4, walk 4, attack 8, shield 4, take hit 4, death 4. Mushroom idle 4, run 8, attack 8, take hit 4, death 4. Goblin idle 4, run 8, attack 8, take hit 4, death 4. Flying Eye flight 8, attack 8, take hit 4, death 4.
- Every repo sheet count matches these. Frame sizes are not stated on the page, so 150x150 is inferred.
- Version note: the page lists zip versions 1.2 and 1.3 plus the main pack. The repo's exact version is unknown.
- Confidence: origin and licence high. Exact file match medium-high.

### B. Hero (`public/assets/character/*`): probably LuizMelo, "Hero Knight"

- Page: https://luizmelo.itch.io/hero-knight
- Author: LuizMelo
- Asset licence field: CC0 1.0 Universal
- Price: name your own price
- Frame counts on the page: Idle 11, Run 8, Jump 3, Fall 3, Attack1 7, Attack2 7, Take Hit 4, Death 11. No block or defend.
- Repo sheets: Run 8, Take Hit 4, Death 11. The frame counts match exactly. This is the main evidence.
- Frame size is not stated on the page, and a search for public code using this pack found no frame size either. The repo's 180x180 canvas is therefore unverified. The repo's Run.png shows a small sword-carrying fighter in a mostly transparent 180px frame, which fits an armed knight.
- Name collision: Sven Thole also has a pixel-art "Hero Knight" (https://sventhole.itch.io/hero-knight) with different frame counts and a licence that reportedly forbids reselling as an asset. Do not use it. Snippet only, not checked on the page.
- Confidence: medium on the match (frame counts only). Licence for LuizMelo's pack is high.

### C. Backgrounds (`public/assets/background/Layer_0000` to `0011`): unconfirmed

Best candidate: Eder Muniz, "Free Pixel Art Forest".

- Page: https://edermunizz.itch.io/free-pixel-art-forest
- Asset licence field: Creative Commons Attribution-NoDerivatives 4.0 International (CC BY-ND 4.0)
- Description: says commercial use is allowed with credit. It also bans use in NFT or crypto games and any crypto product. Those are extra restrictions that CC BY-ND does not allow, so the terms conflict.
- ND term: no adaptations. Cropping, scaling, recolouring or re-tiling may count as adaptations. The repo files are unmodified 1280x720 layers, so they may be fine, but this needs a check.
- Redistribution in a public repo: allowed only verbatim, with attribution (CC BY-ND permits unmodified redistribution).
- Count mismatch: the page says "1 Background with 9 layers" and gives no dimensions. The repo has 12 layers, all 1280x720. Layers 0004 and 0007 are grey-plus-alpha, which suggests overlay or shade layers. Layers 0010 and 0011 have no alpha. If the 9 painted layers plus overlays explain the count, the mismatch could resolve. The original canvas size is unknown, so the repo files may have been resized or cropped, which matters under CC BY-ND.
- Images viewed: Layer_0000 is a flat dark ground silhouette on transparency. Layer_0005 is dark trunks and bushes with a stylised look. Both fit a flat silhouette style, but the match is not confirmed.
- Confidence: low on origin. The licence is high-confidence for this page, but whether it applies to these files is unconfirmed.

Second candidate: Eder Muniz, "Pixel Art Forest" (https://edermunizz.itch.io/pixel-art-forest). It has no licence field. Old author comments (2017 to 2022) say commercial use is fine with credit. Comments are not terms. Confidence low.

### D. Audio (`public/assets/audio/**`): unknown

- No artist, copyright or licence tags in the files.
- Clues: "Logic Pro X" and "REAPER" tags on some clips (see inventory). These suggest in-house or licensed-purchase production, but that is a guess.
- Confidence: none. The developer must confirm source and licence for each file.

### E. Font (`gaming_font.woff2`): unknown

- Cannot identify without decoding. Confidence: none.

### F. Other images: unknown

- `placeholder.webp`, `metadata.webp`, `yakitsu.png`, `favicon.png`, `bomb.png`, `ice.png`, `menu_background.webp`, `gameover_background.webp`: origin unknown. Probably project-made, but unconfirmed.
- `vite.svg`: likely the Vite template logo. Not verified.

### G. Runtime font: Jersey 10 (Google Fonts)

- Loaded from fonts.googleapis.com. Not a repo file.
- Believed to be under the SIL Open Font Licence 1.1, which allows web use. Not verified this session. List it in credits.

## 3. Hero candidates (free, CC0 or free commercial)

All candidates are LuizMelo packs with a name-your-own-price setting. The $0 download was not confirmed on any page. Frame size is not stated on the pages unless noted.

| Pack                    | URL                                              | Licence field | Idle | Run | Attack  | Block / Defend | Take Hit | Death | Other                       | Matches repo?                         | Notes                    |
| ----------------------- | ------------------------------------------------ | ------------- | ---- | --- | ------- | -------------- | -------- | ----- | --------------------------- | ------------------------------------- | ------------------------ |
| Hero Knight             | https://luizmelo.itch.io/hero-knight             | CC0 1.0       | 11   | 8   | 7, 7    | none           | 4        | 11    | jump 3, fall 3              | Run, Take Hit, Death all match        | **Recommended**          |
| Hero Knight 2           | https://luizmelo.itch.io/hero-knight-2           | CC0 1.0       | 11   | 8   | 6       | none           | 4        | 9     | dash 4                      | Death differs                         | second choice, adds dash |
| Martial Hero 3          | https://luizmelo.itch.io/martial-hero-3          | CC0 1.0       | 10   | 8   | 7, 6, 9 | none           | 3        | 11    | up/down 3                   | Run and Death match, Take Hit differs | alternative              |
| Fantasy Warrior         | https://luizmelo.itch.io/fantasy-warrior         | CC0 1.0       | 10   | 8   | 7, 7, 8 | none           | 3        | 7     | sprite 27x45                | no                                    | smaller sprite           |
| Medieval Warrior Pack 3 | https://luizmelo.itch.io/medieval-warrior-pack-3 | CC0 1.0       | 10   | 6   | 4, 4, 5 | none           | 3        | 9     | sprite 26x38                | no                                    | smaller sprite           |
| Medieval Warrior Pack   | https://luizmelo.itch.io/medieval-warrior-pack   | CC0 1.0       | 6    | 8   | 4, 4, 4 | none           | 3        | 9     | crouch, roll, slide         | no                                    |                          |
| Martial Hero 2          | https://luizmelo.itch.io/martial-hero-2          | CC0 1.0       | 4    | 8   | 4, 4    | none           | 3        | 7     | size 33x56 (author comment) | no                                    |                          |

Rejected:

- Elite Knight (elthen): https://elthen.itch.io/2d-pixel-art-elite-knight-sprites. Has a block animation, but it is paid (minimum $5) and its licence was not CC0 on the snippet seen. Not checked on the page.
- Warrior Character (LuizMelo): paid.
- Ghost Warrior and Plague Warrior: not warriors, or have minimum prices.

**Recommendation: Hero Knight (LuizMelo).** It has all frame counts that match the existing repo hero sheets and includes Idle and Attack, which are missing from the repo. It is CC0, so it needs no credit (credit is recommended anyway).

Check before relying on it: compare the zip's Death sheet to the repo's `Death.png` (1980x180 should match). Confirm the sprite frame size.

Block: no free CC0 candidate found has a Block or Defend animation. Options for M2: reuse an Idle or Attack frame with a shield overlay, or drop block from M2.

## 4. Audio candidates

All links were verified on the page unless marked "snippet only".

### Fight-music loop

1. "Fast fight / battle music (looped)", OpenGameArt: https://opengameart.org/content/fast-fight-battle-music-looped
    - Licence field: CC0. Author: Ville Nousiainen (loop edit by XCVG). File: `fight_looped.wav`, 4.4 MB (WAV, convert to MP3 or OGG).
    - Attribution: the author asks for credit as "totally optional". Credit is recommended.
    - Commercial and redistribution: yes.
2. "Short Battle Loop", OpenGameArt: https://opengameart.org/content/short-battle-loop
    - CC0, author "Some Weirdo". WAV plus an LMMS project. Short and sparse. Attribution optional.
3. "Boss Battle Music" and "Chiptune Battle Music" (snippet only): OpenGameArt. Not checked on the pages. Do not use until confirmed.

### Menu loop

1. "Bossa Nova", OpenGameArt: https://opengameart.org/content/bossa-nova
    - CC0 verified. Author Joth. MP3. Tagged "loop", "calm", 129 BPM. No attribution requested.
    - Calm and tuned for long sequences, which suits a menu.
2. "8Bit Title Screen", OpenGameArt: https://opengameart.org/content/8bit-title-screen
    - CC0 verified. Author Joth. MP3, described as a short loop for an opening screen.

### UI and hit SFX

1. Kenney "Impact Sounds": https://kenney.nl/assets/impact-sounds
    - CC0 verified. 130 files. Hit and impact sounds. No parry or whoosh. No attribution requested.
2. Kenney "Interface Sounds": https://kenney.nl/assets/interface-sounds
    - CC0 verified. 100 files. Clicks and blips. No attribution requested.
3. Kenney "RPG Audio": https://kenney.nl/assets/rpg-audio
    - CC0 verified. 50 files. Tagged foley, rpg, footstep, weapon. Categories not verified. May contain weapon sounds for whoosh or parry.
4. Kenney "UI Audio": reached through a GitHub repackaging (https://github.com/Calinou/kenney-ui-audio), which says CC0 1.0 and 50 SFX. Not checked on kenney.nl.

Gap: no dedicated CC0 parry or whoosh pack was found in these searches. A second search is needed for that item.

## 5. Risks

Release blockers are items whose licence forbids redistribution in a public repo, or whose licence is unknown.

| #   | Item                                                                                                                                                                    | Status      | Issue                                                                                                                                                                                                                                                              | Action                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | README line 192                                                                                                                                                         | must fix    | claims art and audio inherit MIT. False for any non-CC0 item.                                                                                                                                                                                                      | Rewrite: code is MIT. Art and audio are per-asset, see `CREDITS.md`.                                                                                                  |
| 2   | Backgrounds `Layer_0000` to `0011`                                                                                                                                      | **blocker** | origin unconfirmed. Best candidate is CC BY-ND 4.0, which needs credit and bans adaptation. Its NFT or crypto clause conflicts with CC licence rules. Layer count differs (9 vs 12), and the original canvas size is unknown, so resizing or cropping is possible. | Developer confirms source and licence file. If Free Pixel Art Forest, add credit and check no adaptation. Ask the author about the NFT clause, or replace the layers. |
| 3   | Audio (8 MP3s)                                                                                                                                                          | **blocker** | source and licence unknown. No tags.                                                                                                                                                                                                                               | Developer states origin for each file. Replace with CC0 if unknown.                                                                                                   |
| 4   | `gaming_font.woff2`                                                                                                                                                     | **blocker** | identity and licence unknown.                                                                                                                                                                                                                                      | Developer identifies the font and its licence. Replace if unknown.                                                                                                    |
| 5   | `public/data/words/words.js`                                                                                                                                            | check       | provenance unknown. A word list may derive from a licensed dictionary.                                                                                                                                                                                             | Developer confirms it is project-made or from a permissive list.                                                                                                      |
| 6   | Other images (`yakitsu.png`, `metadata.webp`, `placeholder.webp`, `favicon.png`, `bomb.png`, `ice.png`, `menu_background.webp`, `gameover_background.webp`, `vite.svg`) | check       | origin unknown. `vite.svg` is probably the Vite logo.                                                                                                                                                                                                              | Developer confirms.                                                                                                                                                   |
| 7   | Monsters (LuizMelo, CC0)                                                                                                                                                | low         | no blocker. Name-your-own-price, $0 not confirmed.                                                                                                                                                                                                                 | Confirm the zip has a licence file. Credit recommended.                                                                                                               |
| 8   | Hero (LuizMelo Hero Knight, CC0, if confirmed)                                                                                                                          | low         | no blocker on licence. Name collision with Sven Thole's "Hero Knight" (do not use it).                                                                                                                                                                             | Confirm the frame size and file match by comparing the zip's sheets to the repo's sheets.                                                                             |
| 9   | Jersey 10 (Google Fonts, runtime)                                                                                                                                       | low         | believed OFL 1.1, not verified this session.                                                                                                                                                                                                                       | Credit in `CREDITS.md`.                                                                                                                                               |
| 10  | OpenGameArt CC0 tracks                                                                                                                                                  | low         | no blocker. Uploaders ask for optional credit.                                                                                                                                                                                                                     | Include credit anyway.                                                                                                                                                |
| 11  | Kenney packs                                                                                                                                                            | none        | CC0, no credit needed.                                                                                                                                                                                                                                             | None.                                                                                                                                                                 |

## 6. Proposed CREDITS.md draft

Draft only. Not a file. Items in brackets need confirmation.

```
# Credits

The source code is licensed under the MIT licence (see LICENSE).
Art and audio are not MIT. Each asset is listed below with its source and licence.

## Monsters
- Goblin, Skeleton, Mushroom and Flying Eye sprite sheets: "Monsters Creatures Fantasy" by LuizMelo.
  https://luizmelo.itch.io/monsters-creatures-fantasy
  Licence: CC0 1.0 Universal (public domain dedication). Credit appreciated.

## Hero
- Hero sprite sheets (Run, Take Hit, Death) and any further hero sheets: "Hero Knight" by LuizMelo.
  https://luizmelo.itch.io/hero-knight
  Licence: CC0 1.0 Universal. Credit appreciated.
  [CONFIRM: sheets originate from this pack.]

## Backgrounds
- Layer_0000 to Layer_0011: [CONFIRM SOURCE]. If Free Pixel Art Forest by Eder Muniz,
  https://edermunizz.itch.io/free-pixel-art-forest, licence CC BY-ND 4.0, credit required.

## Other art
- [CONFIRM SOURCE for placeholder, metadata, yakitsu.png, favicon, bomb, ice, menu and game-over backgrounds, vite.svg.]

## Music and sound
- Fight music: [CONFIRM SOURCE. Candidate: "Fast fight / battle music (looped)" by Ville Nousiainen, OpenGameArt, CC0.]
- Menu music: [CONFIRM SOURCE. Candidate: "Bossa Nova" by Joth, OpenGameArt, CC0.]
- Sound effects: [CONFIRM SOURCE. If Kenney: "Impact Sounds", "Interface Sounds" and "RPG Audio" by Kenney, kenney.nl, CC0.]

## Fonts
- "Retro Font" (gaming_font.woff2): [CONFIRM SOURCE AND LICENCE]
- "Jersey 10" (Google Fonts, runtime): SIL Open Font Licence 1.1. [verify]
```

## Recommended hero pack

**Hero Knight** by LuizMelo: https://luizmelo.itch.io/hero-knight. CC0 1.0, name your own price. Idle 11, Run 8, Attack1 7, Attack2 7, Take Hit 4, Death 11. Confirm the frame size before relying on it. No block animation.

## Unresolved

- Backgrounds, audio, font and words.js have no confirmed source.
- No parry or whoosh SFX pack was identified.
- Git history of asset files was not checked (per the no-git rule).
- The $0 download on the name-your-own-price pages was not checked on the purchase pages. These pages state no minimum price, so $0 is expected, but this is not verified.
- No upstream project credits were found. `README.md` and `package.json` (license MIT, no repository or fork field) say nothing about a base project, so the blockers for audio, font and words.js have no upstream lead.
- Frame size for the Hero Knight pack (and for the other hero candidates) is not stated on any page, and no public code was found that states it.
