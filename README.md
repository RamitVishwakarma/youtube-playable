# Playables Arcade

HTML5 games built for **YouTube Playables**, plus a website where anyone can play them in a browser.

The website is a Next.js app. The flagship games are full 3D (three.js, bundled locally) or polished canvas games, and the original ten are small canvas games (under 50 KB each). None of them use external assets. Every game works in portrait and landscape and calls the YouTube Playables SDK for saves, pause/resume, audio, scores and ads.

| Game | Genre | Rewarded-ad hooks |
|---|---|---|
| 🏪 [Mini Mart Empire 3D](public/games/mini-mart) **(3D flagship)** | Supermarket tycoon: stock, serve, hire staff, buy new stores (three.js) | 2× cash, collect ×2 away earnings |
| 🏃 [Grow Rush 3D](public/games/grow-rush) **(3D flagship)** | Gate runner + boss duel (three.js) | Revive, claim ×3 coins, Hero skin |
| 🏎️ [Turbo Racer 3D](public/games/turbo-racer) **(3D flagship)** | Arcade racer vs 5 AI rivals (three.js) | Claim ×3 coins, Champion paint |
| 🌀 [Helix Drop 3D](public/games/helix-drop) **(3D flagship)** | Helix tower drop with fireball combos (three.js) | Second chance, claim ×3 coins, Prism ball |
| 🐍 [Serpent Smash 3D](public/games/serpent-smash) **(3D flagship)** | Snake arena: grow, swallow, beat the boss (three.js) | Revive, claim ×3 coins, Prism skin |
| 🏗️ [Stack Tower 3D](public/games/stack-tower) **(3D flagship)** | One-tap stacker with slicing and perfect chains (three.js) | Continue, double coins, block colours |
| 🛒 [Checkout Rush 3D](public/games/checkout-rush) **(3D flagship)** | Supermarket till sim: scan, take payment, count change (three.js) | Claim ×3, free upgrades |
| 🚌 [Bus Rush 3D](public/games/bus-rush) **(3D flagship)** | Colour bus-sorting puzzle with solver-checked levels (three.js) | +2 benches, claim ×3 coins |
| 🏀 [Hoop Shot 3D](public/games/hoop-shot) **(3D flagship)** | Swipe-to-shoot arcade basketball with rim physics (three.js) | +15 s, claim ×3, Beach ball |
| 🔪 [Knife Hit 3D](public/games/knife-hit) **(3D flagship)** | Knife-throwing at spinning logs, apples and boss targets (three.js) | Continue, claim ×3, Candy knife |
| 🎳 [Bowling Strike 3D](public/games/bowling-strike) **(3D flagship)** | Ten-pin bowling with hook and pin chain reactions (three.js) | Retry roll, claim ×2, Gold ball |
| 🧱 [Block Burst](public/games/block-burst) **(flagship)** | 8×8 block puzzle | Second chance |
| 🐶 [Draw to Save](public/games/draw-to-save) | Physics puzzle | +50% ink, skip level |
| 🔩 [Bolt Sort](public/games/bolt-sort) | Sort puzzle (solver-verified levels) | Extra bolt |
| 🚗 [Parking Jam Escape](public/games/parking-jam) | Spatial puzzle (solvability-checked) | Hint, continue |
| 🧠 [Brain Trick](public/games/brain-trick) | Trick riddles (15 levels) | Hint, skip level |
| 💥 [Mega Ramp Crash](public/games/mega-ramp-crash) | Car physics + upgrades | Double coins |
| 🤸 [Ragdoll Tumble](public/games/ragdoll-tumble) | Verlet ragdoll physics | Double coins |
| 🍜 [Tiny Shop Tycoon](public/games/tiny-shop-tycoon) | Idle tycoon with offline earnings | 2× income, double offline earnings |
| 👗 [Makeover Showdown](public/games/makeover-showdown) | Fashion vs rival | Unlock premium items, triple coins |
| 🪐 [Planet Merge](public/games/drop-merge) | Drop & merge physics | Clear small planets, second chance |
| 🏎️ [Highway Dodge](public/games/highway-dodge) | One-thumb arcade racer | Revive, double coins, unlock taxi |

Interstitial ads only show at natural breaks: between levels or after a run, at most once a minute.

## Run it locally

```bash
npm install
npm run dev          # Next.js dev server at http://localhost:3000
```

`npm run build` writes the complete static site to `out/`. Run `npm start` to serve that folder.

## Project layout

```
app/                       Next.js App Router pages
  page.tsx                 home: filterable game grid
  play/[slug]/page.tsx     player page (one static page per game)
components/                GameGrid, Player, Brand
lib/games.json             game catalog (portal, packager and tests read it)
lib/games.ts               typed catalog + path helpers
public/games/<slug>/       each game: index.html + game.js (plain JS, no build)
public/shared/yt.js        YouTube Playables SDK wrapper (+ browser fallbacks)
public/shared/kit.js       canvas stage, game loop, input, audio, UI panels
public/shared/game.css     shared HUD / panel styles
public/shared/flagship.*   UI kit for the 3D games (title, HUD, panels, shop, praise)
public/shared/sfx.js       synth sound effects shared by the 3D games
public/shared/help.js      in-game "?" how-to-play sheet (text from lib/games.json via scripts/sync-help.mjs)
public/thumbs/             gameplay screenshots used on the portal cards
public/shared/vendor/      three.js (bundled, MIT) — rebuild with scripts/vendor-three.sh
scripts/package.mjs        builds standalone YouTube bundles (zip per game)
tests/smoke.mjs            headless Chromium tests for the site and bundles
```

The website is a Next.js app exported as static files (`output: 'export'`). The games are not React: they are self-contained HTML5 pages in `public/games/`, shown in an iframe by the player page. That way the files that ship to YouTube are exactly the files that run on the website.

## YouTube Playables integration

The YouTube bundles load the SDK first (`<script src="https://www.youtube.com/game_api/v1">`). `scripts/package.mjs` adds that tag. The website never loads the SDK: outside YouTube its calls wait forever for a YouTube host, which leaves the game on a black screen.

All SDK use goes through `public/shared/yt.js`, which does the following:

| Requirement | How it's handled |
|---|---|
| `firstFrameReady()` then `gameReady()` | `Kit.loop` reports the first painted frame. `Kit.boot` calls `gameReady()` after the save loads and the game is interactive. |
| Never hang on the host | Every SDK promise is raced against a timeout (3 s; 90 s for ads). If the cloud save can't be read, the game starts fresh and doesn't overwrite the save. |
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

Each zip contains `index.html` (with the SDK tag added), `game.js` and a copy of `shared/`. Upload the zips in the Playables Developer Portal, or send them to a publishing partner. Access to the portal is currently by invitation: apply through YouTube's Playables interest form.

Note that YouTube does not allow duplicate builds. Each game here is a separate design, so keep them distinct if you fork one.

## Deploy the website

**Vercel (recommended).** Import the repository in Vercel. `vercel.json` selects the Next.js preset, so no settings are needed. To use your own domain, add it under Project → Settings → Domains, then create the DNS record Vercel shows you. For a subdomain like `games.example.com`, that's a `CNAME` pointing to `cname.vercel-dns.com`. Every push to `main` redeploys.

**GitHub Pages.** Set Settings → Pages → Source to **GitHub Actions**. Then add the repository variable `DEPLOY_GITHUB_PAGES` = `true` (Settings → Secrets and variables → Actions → Variables). The `GitHub Pages` workflow builds with `BASE_PATH=/<repo>` and publishes to `https://<user>.github.io/<repo>/`.

**Any other static host.** Run `npm run build` and upload `out/`. Set `BASE_PATH=/sub/path` if the site won't live at the domain root.

## Tests

```bash
npm run build && npm run package
npm install --no-save playwright@1.56.1   # Chromium must be available
npm test
```

The smoke test covers both the website and the YouTube bundles:

- **Website games:** every game boots in portrait and landscape, its in-game "?" help opens and closes, and it survives taps and drags, including at a URL without the trailing slash.
- **Portal:** every card shows its gameplay screenshot and opens its own game, both on a full page load and with client-side navigation.
- **No SDK on the website:** the website never requests the YouTube SDK.
- **Stuck SDK:** each bundle still boots with a fake SDK whose calls never resolve.
- **Working SDK:** each bundle reads its cloud save through a fake SDK that does respond.

CI runs a typecheck, both builds and the smoke test on every pull request.
