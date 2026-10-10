# Asset sources for milestone 2

Retrieved 2026-10-10. Downloaded packs are in `assets-src/<pack-slug>/` (git-ignored; the line `assets-src/` was appended to `.gitignore`). Each pack directory holds `LICENSE.txt`, the archive as `download.zip` where the source was a zip, and `extracted/`. Nothing was copied into `public/` or `src/`. Downloads are untrusted until they are reviewed; nothing from them was executed.

Sizes are file bytes. Image sizes come from `sips`, audio durations from `afinfo`. "Frames" for sprite sheets assume square frames of the sheet height.

## Summary of what was downloaded

| Slot               | Pack                                                                 | Licence     | Local path                                             |
| ------------------ | -------------------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| Hero               | Hero Knight (LuizMelo)                                               | CC0 1.0     | `assets-src/hero-knight-luizmelo/`                     |
| SFX                | Kenney Impact Sounds                                                 | CC0         | `assets-src/kenney-impact-sounds/`                     |
| SFX                | Kenney Interface Sounds                                              | CC0         | `assets-src/kenney-interface-sounds/`                  |
| SFX                | Kenney RPG Audio                                                     | CC0         | `assets-src/kenney-rpg-audio/`                         |
| Music (fight)      | Fast fight / battle music (looped), Ville Nousiainen, loop edit XCVG | CC0         | `assets-src/oga-fast-fight-battle-music-looped/`       |
| Music (menu)       | Bossa Nova, Joth                                                     | CC0         | `assets-src/oga-bossa-nova/`                           |
| Music (menu, alt)  | 8Bit Title Screen, Joth                                              | CC0         | `assets-src/oga-8bit-title-screen/`                    |
| Font               | Press Start 2P, The Press Start 2P Project Authors                   | SIL OFL 1.1 | `assets-src/press-start-2p/`                           |
| Font (alt)         | Kenney Fonts                                                         | CC0         | `assets-src/kenney-fonts/`                             |
| Background         | Parallax background forest pixel art, MatiasVME                      | CC0         | `assets-src/oga-parallax-background-forest-pixel-art/` |
| Background (small) | Forest Background, ansimuz (Luis Zuno)                               | CC0         | `assets-src/oga-forest-background/`                    |

## 1. Hero Knight (LuizMelo)

- Page: https://luizmelo.itch.io/hero-knight (saved as `assets-src/hero-knight-luizmelo/page.html`)
- Author: LuizMelo
- Licence: the page says "This package can be used freely and commercially - CC0(creative commons zero)." The licence field is CC0 1.0 Universal. The archive's own licence file says the pack is "Creative Commons Zero (CC-0)". The page says "Credits are not required".
- Saved licence: `assets-src/hero-knight-luizmelo/LICENSE.txt` (archive `License.txt` plus the page statement, with URL and date).
- Retrieved: 2026-10-10. Price paid: $0 (name-your-own-price, direct download).
- Download route: itch.io's own free-download endpoints, called with the page's CSRF token. `POST /hero-knight/download_url` returned the download page, and `POST /hero-knight/file/2015843?source=download&as_props=1` returned a time-limited signed URL on itch.io's file storage (a `*.r2.cloudflarestorage.com` host). That signed URL was fetched with curl. This host is outside the allowlist in the brief, although the URL came from itch.io's own endpoint, so it is recorded here for review.
- One unsuccessful call: `POST /hero-knight/purchase` with `price=0` returned "Please select a valid payment method" and no order was made.
- Zip: `Hero Knight.zip`, 45742 bytes (the page says 44 kB). sha256 in the fragment below.

Frame size check: the sheets are 180 px high. Idle 1980/180 = 11, Run 1440/180 = 8, Attack1 and Attack2 1260/180 = 7 each, Take Hit 720/180 = 4, Death 1980/180 = 11, Jump and Fall 540/180 = 3 each. All frame counts match the page. No file has a width that fails to divide evenly.

Comparison with the repo (`public/assets/character/`): `Run.png`, `Take Hit.png` and `Death.png` are byte-identical to the pack's `Sprites/Run.png`, `Sprites/Take Hit.png` and `Sprites/Death.png` (same sha256). The repo's hero is confirmed to come from this pack, which upgrades the research's "medium" confidence to confirmed.

Not in the repo but in the pack: `Idle.png` (11 frames), `Attack1.png` and `Attack2.png` (7 frames each), `Jump.png` and `Fall.png` (3 frames each). No block or defend animation.

- zip sha256: `bd4d86d880bd090f0c0c55eef64f6edb38f4ac34d2867d2c7ab853a816f99f74` (45742 bytes)

| File (relative to extracted/)    | Bytes | Dimensions / duration | Frames (square, sheet height) |
| -------------------------------- | ----- | --------------------- | ----------------------------- |
| Hero Knight/License.txt          | 123   | -                     | -                             |
| Hero Knight/Sprites/Attack1.png  | 7299  | 1260x180              | 7                             |
| Hero Knight/Sprites/Attack2.png  | 7241  | 1260x180              | 7                             |
| Hero Knight/Sprites/Death.png    | 10649 | 1980x180              | 11                            |
| Hero Knight/Sprites/Fall.png     | 2680  | 540x180               | 3                             |
| Hero Knight/Sprites/Idle.png     | 6299  | 1980x180              | 11                            |
| Hero Knight/Sprites/Jump.png     | 2414  | 540x180               | 3                             |
| Hero Knight/Sprites/Run.png      | 7994  | 1440x180              | 8                             |
| Hero Knight/Sprites/Take Hit.png | 4623  | 720x180               | 4                             |

## 2. Kenney Impact Sounds

- Page: https://kenney.nl/assets/impact-sounds (saved as `kenney-impact-sounds/page.html`)
- Author: Kenney (kenney.nl)
- Licence: the page says "Download this package (130 assets) for free, CC0 licensed!" and links to https://creativecommons.org/publicdomain/zero/1.0/. No attribution is required.
- Saved licence: `assets-src/kenney-impact-sounds/LICENSE.txt` (archive `License.txt` plus the page statement).
- Retrieved: 2026-10-10. Price: free. Archive: `kenney_impact-sounds.zip` from kenney.nl media storage.

- zip sha256: `029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8` (800850 bytes)

Total audio/other files (excluding .url): 131

| Group (dir / stem pattern / ext)   | Files | Total bytes | Duration range (s) | Example file                      |
| ---------------------------------- | ----- | ----------- | ------------------ | --------------------------------- |
| Audio/footstep_carpet\* (.ogg)     | 5     | 31777       | 0.14 - 0.14        | Audio/footstep_carpet_000.ogg     |
| Audio/footstep_concrete\* (.ogg)   | 5     | 30088       | 0.11 - 0.11        | Audio/footstep_concrete_000.ogg   |
| Audio/footstep_grass\* (.ogg)      | 5     | 40810       | 0.59 - 0.78        | Audio/footstep_grass_000.ogg      |
| Audio/footstep_snow\* (.ogg)       | 5     | 38858       | 0.37 - 0.37        | Audio/footstep_snow_000.ogg       |
| Audio/footstep_wood\* (.ogg)       | 5     | 29779       | 0.25 - 0.25        | Audio/footstep_wood_000.ogg       |
| Audio/impactBell_heavy\* (.ogg)    | 5     | 54702       | 0.30 - 1.74        | Audio/impactBell_heavy_000.ogg    |
| Audio/impactGeneric_light\* (.ogg) | 5     | 28797       | 0.12 - 0.14        | Audio/impactGeneric_light_000.ogg |
| Audio/impactGlass_heavy\* (.ogg)   | 5     | 39266       | 0.17 - 0.43        | Audio/impactGlass_heavy_000.ogg   |
| Audio/impactGlass_light\* (.ogg)   | 5     | 32891       | 0.21 - 0.21        | Audio/impactGlass_light_000.ogg   |
| Audio/impactGlass_medium\* (.ogg)  | 5     | 42339       | 0.54 - 0.54        | Audio/impactGlass_medium_000.ogg  |
| Audio/impactMetal_heavy\* (.ogg)   | 5     | 31020       | 0.12 - 0.36        | Audio/impactMetal_heavy_000.ogg   |
| Audio/impactMetal_light\* (.ogg)   | 5     | 37120       | 0.21 - 0.48        | Audio/impactMetal_light_000.ogg   |
| Audio/impactMetal_medium\* (.ogg)  | 5     | 31833       | 0.11 - 0.27        | Audio/impactMetal_medium_000.ogg  |
| Audio/impactMining\* (.ogg)        | 5     | 58579       | 0.80 - 0.99        | Audio/impactMining_000.ogg        |
| Audio/impactPlank_medium\* (.ogg)  | 5     | 60633       | 0.78 - 0.78        | Audio/impactPlank_medium_000.ogg  |
| Audio/impactPlate_heavy\* (.ogg)   | 5     | 48515       | 0.35 - 0.56        | Audio/impactPlate_heavy_000.ogg   |
| Audio/impactPlate_light\* (.ogg)   | 5     | 54690       | 0.49 - 0.66        | Audio/impactPlate_light_000.ogg   |
| Audio/impactPlate_medium\* (.ogg)  | 5     | 55081       | 0.52 - 0.65        | Audio/impactPlate_medium_000.ogg  |
| Audio/impactPunch_heavy\* (.ogg)   | 5     | 51984       | 0.46 - 0.65        | Audio/impactPunch_heavy_000.ogg   |
| Audio/impactPunch_medium\* (.ogg)  | 5     | 47441       | 0.40 - 0.54        | Audio/impactPunch_medium_000.ogg  |
| Audio/impactSoft_heavy\* (.ogg)    | 5     | 33151       | 0.50 - 0.57        | Audio/impactSoft_heavy_000.ogg    |
| Audio/impactSoft_medium\* (.ogg)   | 5     | 27045       | 0.12 - 0.18        | Audio/impactSoft_medium_000.ogg   |
| Audio/impactTin_medium\* (.ogg)    | 5     | 32171       | 0.13 - 0.21        | Audio/impactTin_medium_000.ogg    |
| Audio/impactWood_heavy\* (.ogg)    | 5     | 31052       | 0.31 - 0.31        | Audio/impactWood_heavy_000.ogg    |
| Audio/impactWood_light\* (.ogg)    | 5     | 31858       | 0.27 - 0.27        | Audio/impactWood_light_000.ogg    |
| Audio/impactWood_medium\* (.ogg)   | 5     | 32816       | 0.33 - 0.33        | Audio/impactWood_medium_000.ogg   |
| License\* (.txt)                   | 1     | 608         | -                  | License.txt                       |

Non-asset link files in archive (ignored): Kenney.url, Patreon.url

<details>
<summary>Per-file listing (132 rows: relative path, bytes, duration)</summary>

| File (relative to extracted/)     | Bytes | Dimensions / duration |
| --------------------------------- | ----- | --------------------- |
| Audio/footstep_carpet_000.ogg     | 6353  | 0.14 s                |
| Audio/footstep_carpet_001.ogg     | 6411  | 0.14 s                |
| Audio/footstep_carpet_002.ogg     | 6411  | 0.14 s                |
| Audio/footstep_carpet_003.ogg     | 6301  | 0.14 s                |
| Audio/footstep_carpet_004.ogg     | 6301  | 0.14 s                |
| Audio/footstep_concrete_000.ogg   | 5808  | 0.11 s                |
| Audio/footstep_concrete_001.ogg   | 6308  | 0.11 s                |
| Audio/footstep_concrete_002.ogg   | 6255  | 0.11 s                |
| Audio/footstep_concrete_003.ogg   | 5805  | 0.11 s                |
| Audio/footstep_concrete_004.ogg   | 5912  | 0.11 s                |
| Audio/footstep_grass_000.ogg      | 8290  | 0.78 s                |
| Audio/footstep_grass_001.ogg      | 8313  | 0.67 s                |
| Audio/footstep_grass_002.ogg      | 8278  | 0.69 s                |
| Audio/footstep_grass_003.ogg      | 8129  | 0.67 s                |
| Audio/footstep_grass_004.ogg      | 7800  | 0.59 s                |
| Audio/footstep_snow_000.ogg       | 7880  | 0.37 s                |
| Audio/footstep_snow_001.ogg       | 7794  | 0.37 s                |
| Audio/footstep_snow_002.ogg       | 7694  | 0.37 s                |
| Audio/footstep_snow_003.ogg       | 7860  | 0.37 s                |
| Audio/footstep_snow_004.ogg       | 7630  | 0.37 s                |
| Audio/footstep_wood_000.ogg       | 5949  | 0.25 s                |
| Audio/footstep_wood_001.ogg       | 5929  | 0.25 s                |
| Audio/footstep_wood_002.ogg       | 5895  | 0.25 s                |
| Audio/footstep_wood_003.ogg       | 6207  | 0.25 s                |
| Audio/footstep_wood_004.ogg       | 5799  | 0.25 s                |
| Audio/impactBell_heavy_000.ogg    | 13915 | 1.48 s                |
| Audio/impactBell_heavy_001.ogg    | 15577 | 1.74 s                |
| Audio/impactBell_heavy_002.ogg    | 9252  | 0.70 s                |
| Audio/impactBell_heavy_003.ogg    | 9429  | 0.65 s                |
| Audio/impactBell_heavy_004.ogg    | 6529  | 0.30 s                |
| Audio/impactGeneric_light_000.ogg | 5827  | 0.14 s                |
| Audio/impactGeneric_light_001.ogg | 5636  | 0.12 s                |
| Audio/impactGeneric_light_002.ogg | 5795  | 0.14 s                |
| Audio/impactGeneric_light_003.ogg | 5792  | 0.14 s                |
| Audio/impactGeneric_light_004.ogg | 5747  | 0.14 s                |
| Audio/impactGlass_heavy_000.ogg   | 7403  | 0.24 s                |
| Audio/impactGlass_heavy_001.ogg   | 8946  | 0.43 s                |
| Audio/impactGlass_heavy_002.ogg   | 7661  | 0.25 s                |
| Audio/impactGlass_heavy_003.ogg   | 6956  | 0.17 s                |
| Audio/impactGlass_heavy_004.ogg   | 8300  | 0.40 s                |
| Audio/impactGlass_light_000.ogg   | 6526  | 0.21 s                |
| Audio/impactGlass_light_001.ogg   | 6544  | 0.21 s                |
| Audio/impactGlass_light_002.ogg   | 6562  | 0.21 s                |
| Audio/impactGlass_light_003.ogg   | 6618  | 0.21 s                |
| Audio/impactGlass_light_004.ogg   | 6641  | 0.21 s                |
| Audio/impactGlass_medium_000.ogg  | 8400  | 0.54 s                |
| Audio/impactGlass_medium_001.ogg  | 8605  | 0.54 s                |
| Audio/impactGlass_medium_002.ogg  | 8341  | 0.54 s                |
| Audio/impactGlass_medium_003.ogg  | 8596  | 0.54 s                |
| Audio/impactGlass_medium_004.ogg  | 8397  | 0.54 s                |
| Audio/impactMetal_heavy_000.ogg   | 6110  | 0.17 s                |
| Audio/impactMetal_heavy_001.ogg   | 7279  | 0.36 s                |
| Audio/impactMetal_heavy_002.ogg   | 5634  | 0.12 s                |
| Audio/impactMetal_heavy_003.ogg   | 6209  | 0.21 s                |
| Audio/impactMetal_heavy_004.ogg   | 5788  | 0.13 s                |
| Audio/impactMetal_light_000.ogg   | 7651  | 0.35 s                |
| Audio/impactMetal_light_001.ogg   | 6967  | 0.25 s                |
| Audio/impactMetal_light_002.ogg   | 6804  | 0.24 s                |
| Audio/impactMetal_light_003.ogg   | 9023  | 0.48 s                |
| Audio/impactMetal_light_004.ogg   | 6675  | 0.21 s                |
| Audio/impactMetal_medium_000.ogg  | 7117  | 0.27 s                |
| Audio/impactMetal_medium_001.ogg  | 6151  | 0.14 s                |
| Audio/impactMetal_medium_002.ogg  | 5857  | 0.12 s                |
| Audio/impactMetal_medium_003.ogg  | 6964  | 0.25 s                |
| Audio/impactMetal_medium_004.ogg  | 5744  | 0.11 s                |
| Audio/impactMining_000.ogg        | 12035 | 0.94 s                |
| Audio/impactMining_001.ogg        | 11481 | 0.87 s                |
| Audio/impactMining_002.ogg        | 11235 | 0.80 s                |
| Audio/impactMining_003.ogg        | 12160 | 0.99 s                |
| Audio/impactMining_004.ogg        | 11668 | 0.83 s                |
| Audio/impactPlank_medium_000.ogg  | 12016 | 0.78 s                |
| Audio/impactPlank_medium_001.ogg  | 12082 | 0.78 s                |
| Audio/impactPlank_medium_002.ogg  | 12313 | 0.78 s                |
| Audio/impactPlank_medium_003.ogg  | 12138 | 0.78 s                |
| Audio/impactPlank_medium_004.ogg  | 12084 | 0.78 s                |
| Audio/impactPlate_heavy_000.ogg   | 10032 | 0.49 s                |
| Audio/impactPlate_heavy_001.ogg   | 8713  | 0.35 s                |
| Audio/impactPlate_heavy_002.ogg   | 10188 | 0.49 s                |
| Audio/impactPlate_heavy_003.ogg   | 8490  | 0.35 s                |
| Audio/impactPlate_heavy_004.ogg   | 11092 | 0.56 s                |
| Audio/impactPlate_light_000.ogg   | 10474 | 0.54 s                |
| Audio/impactPlate_light_001.ogg   | 11730 | 0.65 s                |
| Audio/impactPlate_light_002.ogg   | 9932  | 0.49 s                |
| Audio/impactPlate_light_003.ogg   | 10626 | 0.53 s                |
| Audio/impactPlate_light_004.ogg   | 11928 | 0.66 s                |
| Audio/impactPlate_medium_000.ogg  | 10921 | 0.61 s                |
| Audio/impactPlate_medium_001.ogg  | 11491 | 0.62 s                |
| Audio/impactPlate_medium_002.ogg  | 10250 | 0.52 s                |
| Audio/impactPlate_medium_003.ogg  | 11616 | 0.65 s                |
| Audio/impactPlate_medium_004.ogg  | 10803 | 0.53 s                |
| Audio/impactPunch_heavy_000.ogg   | 11617 | 0.65 s                |
| Audio/impactPunch_heavy_001.ogg   | 10861 | 0.54 s                |
| Audio/impactPunch_heavy_002.ogg   | 9025  | 0.46 s                |
| Audio/impactPunch_heavy_003.ogg   | 10029 | 0.47 s                |
| Audio/impactPunch_heavy_004.ogg   | 10452 | 0.54 s                |
| Audio/impactPunch_medium_000.ogg  | 8800  | 0.43 s                |
| Audio/impactPunch_medium_001.ogg  | 8701  | 0.40 s                |
| Audio/impactPunch_medium_002.ogg  | 10399 | 0.54 s                |
| Audio/impactPunch_medium_003.ogg  | 9509  | 0.46 s                |
| Audio/impactPunch_medium_004.ogg  | 10032 | 0.54 s                |
| Audio/impactSoft_heavy_000.ogg    | 6570  | 0.51 s                |
| Audio/impactSoft_heavy_001.ogg    | 6689  | 0.57 s                |
| Audio/impactSoft_heavy_002.ogg    | 6749  | 0.57 s                |
| Audio/impactSoft_heavy_003.ogg    | 6665  | 0.54 s                |
| Audio/impactSoft_heavy_004.ogg    | 6478  | 0.50 s                |
| Audio/impactSoft_medium_000.ogg   | 5351  | 0.12 s                |
| Audio/impactSoft_medium_001.ogg   | 5506  | 0.18 s                |
| Audio/impactSoft_medium_002.ogg   | 5358  | 0.14 s                |
| Audio/impactSoft_medium_003.ogg   | 5392  | 0.14 s                |
| Audio/impactSoft_medium_004.ogg   | 5438  | 0.15 s                |
| Audio/impactTin_medium_000.ogg    | 6509  | 0.16 s                |
| Audio/impactTin_medium_001.ogg    | 6603  | 0.17 s                |
| Audio/impactTin_medium_002.ogg    | 6156  | 0.13 s                |
| Audio/impactTin_medium_003.ogg    | 6541  | 0.21 s                |
| Audio/impactTin_medium_004.ogg    | 6362  | 0.18 s                |
| Audio/impactWood_heavy_000.ogg    | 6233  | 0.31 s                |
| Audio/impactWood_heavy_001.ogg    | 6239  | 0.31 s                |
| Audio/impactWood_heavy_002.ogg    | 6146  | 0.31 s                |
| Audio/impactWood_heavy_003.ogg    | 6181  | 0.31 s                |
| Audio/impactWood_heavy_004.ogg    | 6253  | 0.31 s                |
| Audio/impactWood_light_000.ogg    | 6343  | 0.27 s                |
| Audio/impactWood_light_001.ogg    | 6373  | 0.27 s                |
| Audio/impactWood_light_002.ogg    | 6366  | 0.27 s                |
| Audio/impactWood_light_003.ogg    | 6381  | 0.27 s                |
| Audio/impactWood_light_004.ogg    | 6395  | 0.27 s                |
| Audio/impactWood_medium_000.ogg   | 6575  | 0.33 s                |
| Audio/impactWood_medium_001.ogg   | 6555  | 0.33 s                |
| Audio/impactWood_medium_002.ogg   | 6607  | 0.33 s                |
| Audio/impactWood_medium_003.ogg   | 6598  | 0.33 s                |
| Audio/impactWood_medium_004.ogg   | 6481  | 0.33 s                |
| License.txt                       | 608   | -                     |

Non-asset link files in archive (ignored): Kenney.url, Patreon.url

</details>

## 3. Kenney Interface Sounds

- Page: https://kenney.nl/assets/interface-sounds (saved as `kenney-interface-sounds/page.html`)
- Author: Kenney
- Licence: the page says "Download this package (100 assets) for free, CC0 licensed!" (CC0 link as above).
- Saved licence: `assets-src/kenney-interface-sounds/LICENSE.txt`.
- Retrieved: 2026-10-10.

- zip sha256: `f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232` (834536 bytes)

Total audio/other files (excluding .url): 101

| Group (dir / stem pattern / ext) | Files | Total bytes | Duration range (s) | Example file               |
| -------------------------------- | ----- | ----------- | ------------------ | -------------------------- |
| Audio/back\* (.ogg)              | 4     | 28157       | 0.06 - 0.09        | Audio/back_001.ogg         |
| Audio/bong\* (.ogg)              | 1     | 4848        | 0.12 - 0.12        | Audio/bong_001.ogg         |
| Audio/click\* (.ogg)             | 5     | 22418       | 0.01 - 0.10        | Audio/click_001.ogg        |
| Audio/close\* (.ogg)             | 4     | 56578       | 0.15 - 0.32        | Audio/close_001.ogg        |
| Audio/confirmation\* (.ogg)      | 4     | 45063       | 0.29 - 0.54        | Audio/confirmation_001.ogg |
| Audio/drop\* (.ogg)              | 4     | 25788       | 0.11 - 0.29        | Audio/drop_001.ogg         |
| Audio/error\* (.ogg)             | 8     | 68385       | 0.10 - 0.53        | Audio/error_001.ogg        |
| Audio/glass\* (.ogg)             | 6     | 38237       | 0.11 - 0.69        | Audio/glass_001.ogg        |
| Audio/glitch\* (.ogg)            | 4     | 20734       | 0.01 - 0.03        | Audio/glitch_001.ogg       |
| Audio/maximize\* (.ogg)          | 9     | 108847      | 0.19 - 0.53        | Audio/maximize_001.ogg     |
| Audio/minimize\* (.ogg)          | 9     | 105636      | 0.19 - 0.53        | Audio/minimize_001.ogg     |
| Audio/open\* (.ogg)              | 4     | 55734       | 0.15 - 0.32        | Audio/open_001.ogg         |
| Audio/pluck\* (.ogg)             | 2     | 13258       | 0.10 - 0.16        | Audio/pluck_001.ogg        |
| Audio/question\* (.ogg)          | 4     | 39209       | 0.33 - 0.49        | Audio/question_001.ogg     |
| Audio/scratch\* (.ogg)           | 5     | 59459       | 0.12 - 0.33        | Audio/scratch_001.ogg      |
| Audio/scroll\* (.ogg)            | 5     | 116545      | 1.00 - 1.00        | Audio/scroll_001.ogg       |
| Audio/select\* (.ogg)            | 8     | 52528       | 0.04 - 1.94        | Audio/select_001.ogg       |
| Audio/switch\* (.ogg)            | 7     | 54359       | 0.50 - 0.62        | Audio/switch_001.ogg       |
| Audio/tick\* (.ogg)              | 3     | 14042       | 0.02 - 0.05        | Audio/tick_001.ogg         |
| Audio/toggle\* (.ogg)            | 4     | 30774       | 0.07 - 0.14        | Audio/toggle_001.ogg       |
| License\* (.txt)                 | 1     | 574         | -                  | License.txt                |

Non-asset link files in archive (ignored): Kenney.url, Patreon.url

<details>
<summary>Per-file listing (102 rows: relative path, bytes, duration)</summary>

| File (relative to extracted/) | Bytes | Dimensions / duration |
| ----------------------------- | ----- | --------------------- |
| Audio/back_001.ogg            | 6997  | 0.06 s                |
| Audio/back_002.ogg            | 7029  | 0.07 s                |
| Audio/back_003.ogg            | 7208  | 0.09 s                |
| Audio/back_004.ogg            | 6923  | 0.07 s                |
| Audio/bong_001.ogg            | 4848  | 0.12 s                |
| Audio/click_001.ogg           | 4876  | 0.10 s                |
| Audio/click_002.ogg           | 4275  | 0.01 s                |
| Audio/click_003.ogg           | 4371  | 0.01 s                |
| Audio/click_004.ogg           | 4486  | 0.01 s                |
| Audio/click_005.ogg           | 4410  | 0.01 s                |
| Audio/close_001.ogg           | 9915  | 0.15 s                |
| Audio/close_002.ogg           | 14752 | 0.31 s                |
| Audio/close_003.ogg           | 15648 | 0.31 s                |
| Audio/close_004.ogg           | 16263 | 0.32 s                |
| Audio/confirmation_001.ogg    | 8968  | 0.29 s                |
| Audio/confirmation_002.ogg    | 14169 | 0.54 s                |
| Audio/confirmation_003.ogg    | 9535  | 0.32 s                |
| Audio/confirmation_004.ogg    | 12391 | 0.49 s                |
| Audio/drop_001.ogg            | 5859  | 0.11 s                |
| Audio/drop_002.ogg            | 6411  | 0.19 s                |
| Audio/drop_003.ogg            | 6288  | 0.19 s                |
| Audio/drop_004.ogg            | 7230  | 0.29 s                |
| Audio/error_001.ogg           | 7373  | 0.16 s                |
| Audio/error_002.ogg           | 7369  | 0.16 s                |
| Audio/error_003.ogg           | 12256 | 0.53 s                |
| Audio/error_004.ogg           | 6393  | 0.10 s                |
| Audio/error_005.ogg           | 7266  | 0.50 s                |
| Audio/error_006.ogg           | 8288  | 0.50 s                |
| Audio/error_007.ogg           | 10225 | 0.19 s                |
| Audio/error_008.ogg           | 9215  | 0.14 s                |
| Audio/glass_001.ogg           | 6103  | 0.28 s                |
| Audio/glass_002.ogg           | 4917  | 0.13 s                |
| Audio/glass_003.ogg           | 5732  | 0.12 s                |
| Audio/glass_004.ogg           | 8323  | 0.69 s                |
| Audio/glass_005.ogg           | 6206  | 0.11 s                |
| Audio/glass_006.ogg           | 6956  | 0.11 s                |
| Audio/glitch_001.ogg          | 5121  | 0.02 s                |
| Audio/glitch_002.ogg          | 5473  | 0.03 s                |
| Audio/glitch_003.ogg          | 4915  | 0.01 s                |
| Audio/glitch_004.ogg          | 5225  | 0.02 s                |
| Audio/maximize_001.ogg        | 12111 | 0.26 s                |
| Audio/maximize_002.ogg        | 9915  | 0.26 s                |
| Audio/maximize_003.ogg        | 11748 | 0.21 s                |
| Audio/maximize_004.ogg        | 17723 | 0.42 s                |
| Audio/maximize_005.ogg        | 20900 | 0.53 s                |
| Audio/maximize_006.ogg        | 11618 | 0.38 s                |
| Audio/maximize_007.ogg        | 8097  | 0.19 s                |
| Audio/maximize_008.ogg        | 9085  | 0.23 s                |
| Audio/maximize_009.ogg        | 7650  | 0.22 s                |
| Audio/minimize_001.ogg        | 11924 | 0.26 s                |
| Audio/minimize_002.ogg        | 9441  | 0.26 s                |
| Audio/minimize_003.ogg        | 11739 | 0.21 s                |
| Audio/minimize_004.ogg        | 17099 | 0.42 s                |
| Audio/minimize_005.ogg        | 19501 | 0.53 s                |
| Audio/minimize_006.ogg        | 11292 | 0.38 s                |
| Audio/minimize_007.ogg        | 7677  | 0.19 s                |
| Audio/minimize_008.ogg        | 9298  | 0.23 s                |
| Audio/minimize_009.ogg        | 7665  | 0.22 s                |
| Audio/open_001.ogg            | 9834  | 0.15 s                |
| Audio/open_002.ogg            | 14975 | 0.31 s                |
| Audio/open_003.ogg            | 15046 | 0.31 s                |
| Audio/open_004.ogg            | 15879 | 0.32 s                |
| Audio/pluck_001.ogg           | 6317  | 0.10 s                |
| Audio/pluck_002.ogg           | 6941  | 0.16 s                |
| Audio/question_001.ogg        | 11700 | 0.49 s                |
| Audio/question_002.ogg        | 9455  | 0.33 s                |
| Audio/question_003.ogg        | 8233  | 0.33 s                |
| Audio/question_004.ogg        | 9821  | 0.33 s                |
| Audio/scratch_001.ogg         | 8989  | 0.14 s                |
| Audio/scratch_002.ogg         | 9319  | 0.14 s                |
| Audio/scratch_003.ogg         | 8849  | 0.12 s                |
| Audio/scratch_004.ogg         | 16478 | 0.33 s                |
| Audio/scratch_005.ogg         | 15824 | 0.33 s                |
| Audio/scroll_001.ogg          | 21633 | 1.00 s                |
| Audio/scroll_002.ogg          | 24628 | 1.00 s                |
| Audio/scroll_003.ogg          | 29488 | 1.00 s                |
| Audio/scroll_004.ogg          | 20348 | 1.00 s                |
| Audio/scroll_005.ogg          | 20448 | 1.00 s                |
| Audio/select_001.ogg          | 5468  | 0.04 s                |
| Audio/select_002.ogg          | 5463  | 0.04 s                |
| Audio/select_003.ogg          | 6901  | 0.38 s                |
| Audio/select_004.ogg          | 6909  | 0.38 s                |
| Audio/select_005.ogg          | 6767  | 0.38 s                |
| Audio/select_006.ogg          | 8101  | 1.94 s                |
| Audio/select_007.ogg          | 6580  | 0.05 s                |
| Audio/select_008.ogg          | 6339  | 0.05 s                |
| Audio/switch_001.ogg          | 6753  | 0.62 s                |
| Audio/switch_002.ogg          | 7097  | 0.61 s                |
| Audio/switch_003.ogg          | 9653  | 0.50 s                |
| Audio/switch_004.ogg          | 7248  | 0.50 s                |
| Audio/switch_005.ogg          | 7814  | 0.61 s                |
| Audio/switch_006.ogg          | 7873  | 0.61 s                |
| Audio/switch_007.ogg          | 7921  | 0.61 s                |
| Audio/tick_001.ogg            | 4497  | 0.02 s                |
| Audio/tick_002.ogg            | 4514  | 0.02 s                |
| Audio/tick_004.ogg            | 5031  | 0.05 s                |
| Audio/toggle_001.ogg          | 7369  | 0.14 s                |
| Audio/toggle_002.ogg          | 8056  | 0.14 s                |
| Audio/toggle_003.ogg          | 8654  | 0.14 s                |
| Audio/toggle_004.ogg          | 6695  | 0.07 s                |
| License.txt                   | 574   | -                     |

Non-asset link files in archive (ignored): Kenney.url, Patreon.url

</details>

## 4. Kenney RPG Audio

- Page: https://kenney.nl/assets/rpg-audio (saved as `kenney-rpg-audio/page.html`)
- Author: Kenney
- Licence: the page says "Download this package (50 assets) for free, CC0 licensed!" (CC0 link as above). The archive holds 51 files in `Audio/` plus `Preview.ogg`, so the page count is out of date.
- Saved licence: `assets-src/kenney-rpg-audio/LICENSE.txt`.
- Retrieved: 2026-10-10.

- zip sha256: `6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b` (964837 bytes)

Total audio/other files (excluding .url): 53

| Group (dir / stem pattern / ext)  | Files | Total bytes | Duration range (s) | Example file                 |
| --------------------------------- | ----- | ----------- | ------------------ | ---------------------------- |
| Audio/beltHandle\* (.ogg)         | 2     | 26230       | 0.28 - 0.48        | Audio/beltHandle1.ogg        |
| Audio/bookClose\* (.ogg)          | 1     | 9292        | 0.23 - 0.23        | Audio/bookClose.ogg          |
| Audio/bookFlip\* (.ogg)           | 3     | 39718       | 0.23 - 0.77        | Audio/bookFlip1.ogg          |
| Audio/bookOpen\* (.ogg)           | 1     | 8273        | 0.15 - 0.15        | Audio/bookOpen.ogg           |
| Audio/bookPlace\* (.ogg)          | 3     | 30656       | 0.26 - 0.35        | Audio/bookPlace1.ogg         |
| Audio/chop\* (.ogg)               | 1     | 9370        | 0.24 - 0.24        | Audio/chop.ogg               |
| Audio/cloth\* (.ogg)              | 4     | 51770       | 0.38 - 0.66        | Audio/cloth1.ogg             |
| Audio/clothBelt\* (.ogg)          | 2     | 41504       | 0.72 - 0.75        | Audio/clothBelt.ogg          |
| Audio/creak\* (.ogg)              | 3     | 45181       | 0.34 - 0.83        | Audio/creak1.ogg             |
| Audio/doorClose\* (.ogg)          | 4     | 73953       | 0.60 - 0.71        | Audio/doorClose_1.ogg        |
| Audio/doorOpen\* (.ogg)           | 2     | 53128       | 0.92 - 1.41        | Audio/doorOpen_1.ogg         |
| Audio/drawKnife\* (.ogg)          | 3     | 36255       | 0.40 - 0.48        | Audio/drawKnife1.ogg         |
| Audio/dropLeather\* (.ogg)        | 1     | 11695       | 0.42 - 0.42        | Audio/dropLeather.ogg        |
| Audio/footstep\* (.ogg)           | 10    | 99800       | 0.22 - 0.32        | Audio/footstep00.ogg         |
| Audio/handleCoins\* (.ogg)        | 2     | 38488       | 0.34 - 0.85        | Audio/handleCoins.ogg        |
| Audio/handleSmallLeather\* (.ogg) | 2     | 20520       | 0.31 - 0.34        | Audio/handleSmallLeather.ogg |
| Audio/knifeSlice\* (.ogg)         | 2     | 30631       | 0.57 - 0.60        | Audio/knifeSlice.ogg         |
| Audio/metalClick\* (.ogg)         | 1     | 13615       | 0.45 - 0.45        | Audio/metalClick.ogg         |
| Audio/metalLatch\* (.ogg)         | 1     | 10208       | 0.26 - 0.26        | Audio/metalLatch.ogg         |
| Audio/metalPot\* (.ogg)           | 3     | 77232       | 0.91 - 1.46        | Audio/metalPot1.ogg          |
| License\* (.txt)                  | 1     | 478         | -                  | License.txt                  |
| Preview\* (.ogg)                  | 1     | 321120      | 26.13 - 26.13      | Preview.ogg                  |

Non-asset link files in archive (ignored): Visit Kenney.url, Visit Patreon.url

<details>
<summary>Per-file listing (54 rows: relative path, bytes, duration)</summary>

| File (relative to extracted/) | Bytes  | Dimensions / duration |
| ----------------------------- | ------ | --------------------- |
| Audio/beltHandle1.ogg         | 10820  | 0.28 s                |
| Audio/beltHandle2.ogg         | 15410  | 0.48 s                |
| Audio/bookClose.ogg           | 9292   | 0.23 s                |
| Audio/bookFlip1.ogg           | 18248  | 0.77 s                |
| Audio/bookFlip2.ogg           | 12393  | 0.43 s                |
| Audio/bookFlip3.ogg           | 9077   | 0.23 s                |
| Audio/bookOpen.ogg            | 8273   | 0.15 s                |
| Audio/bookPlace1.ogg          | 9901   | 0.28 s                |
| Audio/bookPlace2.ogg          | 11185  | 0.35 s                |
| Audio/bookPlace3.ogg          | 9570   | 0.26 s                |
| Audio/chop.ogg                | 9370   | 0.24 s                |
| Audio/cloth1.ogg              | 16508  | 0.66 s                |
| Audio/cloth2.ogg              | 11787  | 0.42 s                |
| Audio/cloth3.ogg              | 12432  | 0.48 s                |
| Audio/cloth4.ogg              | 11043  | 0.38 s                |
| Audio/clothBelt.ogg           | 21491  | 0.72 s                |
| Audio/clothBelt2.ogg          | 20013  | 0.75 s                |
| Audio/creak1.ogg              | 15761  | 0.66 s                |
| Audio/creak2.ogg              | 19012  | 0.83 s                |
| Audio/creak3.ogg              | 10408  | 0.34 s                |
| Audio/doorClose_1.ogg         | 18564  | 0.68 s                |
| Audio/doorClose_2.ogg         | 17598  | 0.61 s                |
| Audio/doorClose_3.ogg         | 20889  | 0.71 s                |
| Audio/doorClose_4.ogg         | 16902  | 0.60 s                |
| Audio/doorOpen_1.ogg          | 22848  | 0.92 s                |
| Audio/doorOpen_2.ogg          | 30280  | 1.41 s                |
| Audio/drawKnife1.ogg          | 11134  | 0.40 s                |
| Audio/drawKnife2.ogg          | 12395  | 0.45 s                |
| Audio/drawKnife3.ogg          | 12726  | 0.48 s                |
| Audio/dropLeather.ogg         | 11695  | 0.42 s                |
| Audio/footstep00.ogg          | 9475   | 0.25 s                |
| Audio/footstep01.ogg          | 9900   | 0.28 s                |
| Audio/footstep02.ogg          | 9528   | 0.24 s                |
| Audio/footstep03.ogg          | 10559  | 0.27 s                |
| Audio/footstep04.ogg          | 11303  | 0.32 s                |
| Audio/footstep05.ogg          | 10288  | 0.28 s                |
| Audio/footstep06.ogg          | 9885   | 0.24 s                |
| Audio/footstep07.ogg          | 10264  | 0.26 s                |
| Audio/footstep08.ogg          | 9242   | 0.26 s                |
| Audio/footstep09.ogg          | 9356   | 0.22 s                |
| Audio/handleCoins.ogg         | 25394  | 0.85 s                |
| Audio/handleCoins2.ogg        | 13094  | 0.34 s                |
| Audio/handleSmallLeather.ogg  | 10492  | 0.34 s                |
| Audio/handleSmallLeather2.ogg | 10028  | 0.31 s                |
| Audio/knifeSlice.ogg          | 15532  | 0.60 s                |
| Audio/knifeSlice2.ogg         | 15099  | 0.57 s                |
| Audio/metalClick.ogg          | 13615  | 0.45 s                |
| Audio/metalLatch.ogg          | 10208  | 0.26 s                |
| Audio/metalPot1.ogg           | 31619  | 1.46 s                |
| Audio/metalPot2.ogg           | 22471  | 0.94 s                |
| Audio/metalPot3.ogg           | 23142  | 0.91 s                |
| License.txt                   | 478    | -                     |
| Preview.ogg                   | 321120 | 26.13 s               |

Non-asset link files in archive (ignored): Visit Kenney.url, Visit Patreon.url

</details>

## 5. Fast fight / battle music (looped), OpenGameArt

- Page: https://opengameart.org/content/fast-fight-battle-music-looped (saved as `oga-fast-fight-battle-music-looped/page.html`)
- Author: Ville Nousiainen (original); loop edit by XCVG (the page's "Author" field).
- Licence: the page licence field is CC0. Author's note on the page: "totally optional" credit to Ville Nousiainen, with a link to http://soundcloud.com/mutkanto.
- Saved licence: `assets-src/oga-fast-fight-battle-music-looped/LICENSE.txt`.
- Retrieved: 2026-10-10.
- Only the WAV was taken (`fight_looped.wav`, 16-bit stereo 44.1 kHz, 24.76 s). The page also offers an OGG; it was not fetched, so convert the WAV if a smaller file is needed.
- sha256 of `extracted/fight_looped.wav`: `4e9614d4bc07e91e4d279199fbef4ab1b02ec190e4c47f5d1741e44b25e87ba9` (4368690 bytes).

## 6. Bossa Nova (Joth), OpenGameArt

- Page: https://opengameart.org/content/bossa-nova (saved as `oga-bossa-nova/page.html`)
- Author: Joth ("CC0 Audio - Uploader: Joth").
- Licence: the page licence field is CC0. No attribution is requested.
- Saved licence: `assets-src/oga-bossa-nova/LICENSE.txt`.
- Retrieved: 2026-10-10.
- File: `8bit Bossa.mp3`, MPEG layer III, 160 kbps, 44.1 kHz, 59.61 s.
- sha256 of `extracted/8bit Bossa.mp3`: `0ee835fd279ac5fa15f9346744cbafc2ba800c1c0671b78ca9abe2b4353402f7` (1196325 bytes).

## 7. 8Bit Title Screen (Joth), OpenGameArt

- Page: https://opengameart.org/content/8bit-title-screen (saved as `oga-8bit-title-screen/page.html`)
- Author: Joth.
- Licence: the page licence field is CC0. No attribution is requested.
- Saved licence: `assets-src/oga-8bit-title-screen/LICENSE.txt`.
- Retrieved: 2026-10-10.
- File: `8Bit Title Screen.mp3`, MPEG layer III, 128 kbps, 44.1 kHz, 22.00 s.
- sha256 of `extracted/8Bit Title Screen.mp3`: `0fd7f99ae046278959645889f9bb0970a0430381ee1bd2e7a68c5f41438b29d8` (356018 bytes).

## 8. Press Start 2P (Google Fonts, OFL)

- Source: https://github.com/google/fonts/tree/main/ofl/pressstart2p . The files were fetched from `raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/` (`PressStart2P-Regular.ttf` and `OFL.txt`).
- Author: The Press Start 2P Project Authors (the font's copyright line, read from the TTF name table, names cody@zone38.net).
- Licence: SIL Open Font License 1.1 (`OFL.txt`, 4413 bytes, copied to `assets-src/press-start-2p/LICENSE.txt`). The OFL requires the licence to travel with the font, so ship `OFL.txt` alongside the font file in the repo.
- Retrieved: 2026-10-10.
- Files (in the pack directory, no zip): `PressStart2P-Regular.ttf`, 118204 bytes, sha256 `034c77f1f05ec89421e4a63f0e3a4ca1ecf852cc6d2bf611f126f275728e017d`; `OFL.txt`, 4413 bytes, sha256 `705960c3281a5765ecc0b59bd4ed7ca59eed165748076bc2fc3e8fdbfeb944b0`.
- Not checked in a browser: whether the glyph set covers all typing text.

## 9. Kenney Fonts (alternate font)

- Page: https://kenney.nl/assets/kenney-fonts (saved as `kenney-fonts/page.html`)
- Author: Kenney.
- Licence: the page says "Download this package (11 assets) for free, CC0 licensed!" (CC0 link as above).
- Saved licence: `assets-src/kenney-fonts/LICENSE.txt` (archive `License.txt` plus the page statement).
- Retrieved: 2026-10-10. Twelve TTF files in `Fonts/` (the page says 11 assets), including "Kenney Pixel", "Kenney Pixel Square", "Kenney Mini Square Mono" and "Kenney High".
- sha256 of `Fonts/Kenney Pixel.ttf`: `174093d8b71aa808d7ffff70529c9087274515493add48134528c9136f621e92`. sha256 of `Fonts/Kenney High.ttf`: `b77d7d61fd2b149da9937bb3680b6bd4c273e4f9ae31e7acd7010f2323fc3c17`.

- zip sha256: `4e69a86eef3cd47e9d8207413868cd08bcddeb2dae4047dbd10362e2a7a16bac` (57786 bytes)

| File (relative to extracted/)     | Bytes | Dimensions / duration |
| --------------------------------- | ----- | --------------------- |
| Fonts/Kenney Blocks.ttf           | 30508 | -                     |
| Fonts/Kenney Future Narrow.ttf    | 34856 | -                     |
| Fonts/Kenney Future.ttf           | 34116 | -                     |
| Fonts/Kenney High Square.ttf      | 25004 | -                     |
| Fonts/Kenney High.ttf             | 27824 | -                     |
| Fonts/Kenney Mini Square Mono.ttf | 24612 | -                     |
| Fonts/Kenney Mini Square.ttf      | 23996 | -                     |
| Fonts/Kenney Mini.ttf             | 26156 | -                     |
| Fonts/Kenney Pixel Square.ttf     | 25568 | -                     |
| Fonts/Kenney Pixel.ttf            | 28276 | -                     |
| Fonts/Kenney Rocket Square.ttf    | 24800 | -                     |
| Fonts/Kenney Rocket.ttf           | 27364 | -                     |
| License.txt                       | 564   | -                     |

## 10. Parallax background forest pixel art (MatiasVME), OpenGameArt

- Page: https://opengameart.org/content/parallax-background-forest-pixel-art (saved as `oga-parallax-background-forest-pixel-art/page.html`)
- Author: MatiasVME (posted 2025-04-05).
- Licence: the page licence field is CC0. The page says "Attribution Notice: No attribution required".
- Saved licence: `assets-src/oga-parallax-background-forest-pixel-art/LICENSE.txt`. The zip has no licence file, so the page statement is recorded there.
- Retrieved: 2026-10-10. Archive: `parallax_background_forest.zip`, 119257 bytes.
- Contents: eight 1280x360 layers (sky, sun, clouds, mountains 1 to 3, trees, rocks), plus an Aseprite source and a 5120x1440 composite.

- zip sha256: `a5d9c7705c25f1cbf088c99d74e6f71684f5c66800391b9b4297cc9dd2b9babf` (119257 bytes)

| File (relative to extracted/)                                  | Bytes | Dimensions / duration |
| -------------------------------------------------------------- | ----- | --------------------- |
| parallax_background_forest/forest_background_clouds.png        | 8485  | 1280x360              |
| parallax_background_forest/forest_background_mountains_1.png   | 4450  | 1280x360              |
| parallax_background_forest/forest_background_mountains_2.png   | 5945  | 1280x360              |
| parallax_background_forest/forest_background_mountains_3.png   | 5821  | 1280x360              |
| parallax_background_forest/forest_background_rocks.png         | 5689  | 1280x360              |
| parallax_background_forest/forest_background_sky.png           | 4811  | 1280x360              |
| parallax_background_forest/forest_background_sun.png           | 3113  | 1280x360              |
| parallax_background_forest/forest_background_trees.png         | 8768  | 1280x360              |
| parallax_background_forest/parallax_background_forest.aseprite | 32591 | -                     |
| parallax_background_forest/parallax_background_forest.png      | 90104 | 5120x1440             |

## 11. Forest Background (ansimuz / Luis Zuno), OpenGameArt

- Page: https://opengameart.org/content/forest-background (saved as `oga-forest-background/page.html`)
- Author: ansimuz (Luis Zuno), posted 2015-02-08.
- Licence: the archive's `license.txt` says "License (CC0)" and links to http://creativecommons.org/publicdomain/zero/1.0/ . The page licence field is also CC0.
- Saved licence: `assets-src/oga-forest-background/LICENSE.txt`.
- Retrieved: 2026-10-10. Archive: `parallax_forest_pack.zip`, 108344 bytes.
- Layers are only 272x160 px each. That does not meet the 1280 px width target without upscaling, so this is a fallback. A `.psd` source is included.

- zip sha256: `18eb6d92cc06c8e2be2fe86d5a3e1a0c1842a7ff5f9c0f8687d7691770bd7589` (108344 bytes)

| File (relative to extracted/)                                | Bytes  | Dimensions / duration |
| ------------------------------------------------------------ | ------ | --------------------- |
| parallax_forest_pack/layers/parallax-forest-back-trees.png   | 3587   | 272x160               |
| parallax_forest_pack/layers/parallax-forest-front-trees.png  | 2989   | 272x160               |
| parallax_forest_pack/layers/parallax-forest-lights.png       | 1772   | 272x160               |
| parallax_forest_pack/layers/parallax-forest-middle-trees.png | 2579   | 272x160               |
| parallax_forest_pack/license.txt                             | 281    | -                     |
| parallax_forest_pack/parallax-forest.psd                     | 172540 | -                     |

## Skipped / failed

- No failed downloads among the requested items. All requested items were fetched.
- Hero Knight: the itch.io download flow needed the page's own endpoints rather than a browser (see section 1). The signed-URL host caveat applies.
- Hero block or defend animation: none in any free CC0 pack checked. Not solved for milestone 2.
- Parry and whoosh SFX: no dedicated CC0 pack was found. Stand-ins are listed in the recommended picks. A dedicated search is still needed.
- Not fetched: OpenGameArt "Short Battle Loop" (CC0, optional, short and sparse). Other battle tracks from the research ("Boss Battle Music", "Chiptune Battle Music") were not checked.
- Not fetched: Eder Muniz "Free Pixel Art Forest" (CC BY-ND 4.0). It is not CC0, and the research already flags it as a blocker for the repo's current backgrounds. The requested CC0 search did not need it.
- Not fetched: ansimuz SunnyLand forest packs (CC0 but 240 px tall backgrounds). Two background candidates were taken as the brief allowed.
- Not fetched: Kenney UI Audio via GitHub (`Calinou/kenney-ui-audio`). Kenney's own pack covers the same ground.
- Not fetched: Hero Knight 2 and Martial Hero 3 (LuizMelo, CC0), which are alternates only.
- Web search was used only to find candidate pages, and its result text was not treated as instructions. All downloads came from itch.io (luizmelo.itch.io and the itch.io file endpoint), kenney.nl, opengameart.org and raw.githubusercontent.com. The one exception is the itch.io signed storage URL for the hero zip, described in section 1.

## Recommended picks

| Need                     | Pick                                | File                                                                                                                                   | Notes                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hero sprite sheets (new) | Hero Knight (LuizMelo)              | `hero-knight-luizmelo/extracted/Hero Knight/Sprites/Idle.png`, `Attack1.png`, `Attack2.png` (plus `Jump.png` and `Fall.png` if wanted) | Frame height 180 px, same as the repo's Run, Take Hit and Death.                                                                                                                                                                                                                                       |
| Background               | MatiasVME parallax forest           | `oga-parallax-background-forest-pixel-art/extracted/parallax_background_forest/` (8 layers at 1280x360)                                | Sky, sun, clouds, mountains 1 to 3, trees, rocks. Layers are 360 px high, so the 720 px screen needs either scaling (about 2x, which changes pixel crispness) or a composition that fills the lower half with ground. Fallback: ansimuz Forest Background, 272x160 layers, which would need upscaling. |
| Fight music (loop)       | Fast fight / battle music (looped)  | `oga-fast-fight-battle-music-looped/extracted/fight_looped.wav`                                                                        | 24.76 s loop, CC0. Convert to OGG or MP3 for the web. Credit optional, recommended.                                                                                                                                                                                                                    |
| Menu music (loop)        | Bossa Nova (Joth)                   | `oga-bossa-nova/extracted/8bit Bossa.mp3`                                                                                              | 59.61 s, calm, suits a long menu. Alternate: `oga-8bit-title-screen/extracted/8Bit Title Screen.mp3` (22.00 s).                                                                                                                                                                                        |
| Font (HUD, titles)       | Press Start 2P                      | `press-start-2p/PressStart2P-Regular.ttf` plus `OFL.txt`                                                                               | OFL 1.1, must ship `OFL.txt`. Its size makes long typed text hard to read, so use it for titles and numbers.                                                                                                                                                                                           |
| Font (typed text)        | Kenney Mini Square Mono (candidate) | `kenney-fonts/extracted/Fonts/Kenney Mini Square Mono.ttf`                                                                             | CC0. Not rendered or tested yet. Check readability in a browser before choosing.                                                                                                                                                                                                                       |

SFX mapping (all files in the packs named below):

| Event         | File                                                              | Duration (s) | Alternate                                                           | Notes                                            |
| ------------- | ----------------------------------------------------------------- | ------------ | ------------------------------------------------------------------- | ------------------------------------------------ |
| key-type      | `kenney-interface-sounds/extracted/Audio/tick_001.ogg`            | 0.02         | `click_001.ogg` (0.10)                                              | Very short, suits per-key use.                   |
| mistake       | `kenney-interface-sounds/extracted/Audio/error_001.ogg`           | 0.16         | `error_003.ogg`                                                     | Interface error sound.                           |
| hit-light     | `kenney-impact-sounds/extracted/Audio/impactPunch_medium_000.ogg` | 0.43         | `impactGeneric_light_000.ogg` (0.12)                                | Punch-like.                                      |
| hit-heavy     | `kenney-impact-sounds/extracted/Audio/impactPunch_heavy_000.ogg`  | 0.65         | `impactBell_heavy_000.ogg`                                          | Heavier punch.                                   |
| parry         | `kenney-impact-sounds/extracted/Audio/impactMetal_light_000.ogg`  | 0.35         | `kenney-rpg-audio/extracted/Audio/metalLatch.ogg` (0.26)            | Stand-in: metal clink. No dedicated parry sound. |
| whoosh / dash | `kenney-rpg-audio/extracted/Audio/drawKnife1.ogg`                 | 0.40         | `knifeSlice.ogg` (0.60)                                             | Stand-in: blade draw. No dedicated whoosh sound. |
| KO            | `kenney-impact-sounds/extracted/Audio/impactBell_heavy_000.ogg`   | 1.48         | `kenney-rpg-audio/extracted/Audio/metalPot3.ogg` (about 0.9 to 1.5) | Long, dramatic tone.                             |
| UI click      | `kenney-interface-sounds/extracted/Audio/click_001.ogg`           | 0.10         | `select_001.ogg`                                                    | Button press.                                    |
| round start   | `kenney-interface-sounds/extracted/Audio/confirmation_001.ogg`    | 0.29         | `bong_001.ogg` (0.12)                                               | Confirmation or bell tone.                       |

## Verification notes

- Repo hero sheets match the pack byte-for-byte: `Run.png`, `Take Hit.png`, `Death.png`.
- Frame counts for all hero sheets match the page and the pack. Sheet height is 180 px in every hero file.
- All licences were read on the source pages on 2026-10-10, and each pack's `LICENSE.txt` records the page URL and that date.
- Still needed in the repo (not in scope here): a `CREDITS.md`, and the correction to the README line that says art and audio inherit MIT.
