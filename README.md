# Playables Arcade

Ten small HTML5 games built for **YouTube Playables**, plus a website where anyone can play them in a browser.

Each game is plain JavaScript drawing to a Canvas. There are no frameworks, no build step and no external assets. Each one is under 50 KB, works in both portrait and landscape, and calls the YouTube Playables SDK for saves, pause/resume, audio, scores and ads.

| Game | Genre | Rewarded-ad hooks |
|---|---|---|
| 🐶 [Draw to Save](games/draw-to-save) | Physics puzzle | +50% ink, skip level |
| 🔩 [Bolt Sort](games/bolt-sort) | Sort puzzle (solver-verified levels) | Extra bolt |
| 🚗 [Parking Jam Escape](games/parking-jam) | Spatial puzzle (solvability-checked) | Hint, continue |
| 🧠 [Brain Trick](games/brain-trick) | Trick riddles (15 levels) | Hint, skip level |
| 💥 [Mega Ramp Crash](games/mega-ramp-crash) | Car physics + upgrades | Double coins |
| 🤸 [Ragdoll Tumble](games/ragdoll-tumble) | Verlet ragdoll physics | Double coins |
| 🍜 [Tiny Shop Tycoon](games/tiny-shop-tycoon) | Idle tycoon with offline earnings | 2× income, double offline earnings |
| 👗 [Makeover Showdown](games/makeover-showdown) | Fashion vs rival | Unlock premium items, triple coins |
| 🪐 [Planet Merge](games/drop-merge) | Drop & merge physics | Clear small planets, second chance |
| 🏎️ [Highway Dodge](games/highway-dodge) | One-thumb arcade racer | Revive, double coins, unlock taxi |

Interstitial ads only show at natural breaks: between levels or after a run, at most once a minute.

## Run it locally

```bash
npm start            # serves the repo at http://localhost:3000
```

Open `/` for the portal, or go straight to a game, e.g. `/games/bolt-sort/`.

## Project layout

```
index.html, play.html      portal website (game grid + player page)
assets/                    portal styles and script
games.json                 game catalog used by the portal and the tests
games/<slug>/              one folder per game: index.html + game.js
shared/yt.js               YouTube Playables SDK wrapper (+ browser fallbacks)
shared/kit.js              canvas stage, game loop, input, audio, UI panels
shared/game.css            shared HUD / panel styles
scripts/package.mjs        builds standalone Playables bundles (zip per game)
tests/smoke.mjs            headless Chromium smoke test for every game
```

## YouTube Playables integration

Every game loads the SDK first (`<script src="https://www.youtube.com/game_api/v1">`) and goes through `shared/yt.js`, which does the following:

| Requirement | How it's handled |
|---|---|
| `firstFrameReady()` then `gameReady()` | `Kit.loop` reports the first painted frame. `Kit.boot` calls `gameReady()` after the save loads and the game is interactive. |
| Cloud save only, ≤ 3 MiB | `YT.save/load` use `ytgame.game.saveData/loadData` inside YouTube and `localStorage` only on the website. |
| Pause / resume | `ytgame.system.onPause/onResume` stop the game loop and suspend audio. |
| Audio setting | Sound effects respect `ytgame.system.isAudioEnabled()` and `onAudioEnabledChange`. |
| Scores | `ytgame.engagement.sendScore` with the game's main metric. |
| Ads | `ytgame.ads.requestInterstitialAd()` at breaks. `requestRewardedAd(id)` grants the reward only after the ad resolves successfully. On the website, rewarded ads show a short demo overlay. |
| Errors | Uncaught errors are reported via `ytgame.health.logError()`. |
| Any aspect ratio, no orientation lock | Fixed design resolution, scaled and letterboxed by `Kit.stage`. |
| No external calls | Everything ships in the bundle; the SDK script is the only remote file. |

## Ship to YouTube Playables

```bash
npm run package      # -> dist/playables/<slug>.zip (one self-contained bundle per game)
```

Each zip contains `index.html`, `game.js` and a copy of `shared/`. Upload the zips in the Playables Developer Portal, or send them to a publishing partner. Access to the portal is currently by invitation: apply through YouTube's Playables interest form.

Note that YouTube does not allow duplicate builds. Each game here is a separate design, so keep them distinct if you fork one.

## Host the website (GitHub Pages)

The portal is static and needs no build step. In the repository settings, go to **Pages → Deploy from a branch → `main` / root**. The site will then be live at `https://<user>.github.io/youtube-playable/`.

## Tests

```bash
npm install          # installs Playwright (Chromium must be available)
npm test
```

The smoke test opens every game in portrait and landscape and drives it with taps and drags. It fails on any page error or if `gameReady` never fires. It also loads both portal pages. CI runs the smoke test and builds the bundles on every pull request.
