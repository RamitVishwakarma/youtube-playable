// Smoke test for the built site (out/) and the YouTube bundles (dist/playables).
//
//   npm run build && npm run package && npm test   [-- --shots <dir>]
//
// Website:
//   - every game boots (gameReady) in portrait and landscape and survives taps
//     and drags, also when its URL has no trailing slash
//   - every card on the home page opens its own game in the player, both via
//     a full page load and via client-side navigation
//   - the website never requests the YouTube SDK (off YouTube its calls never
//     resolve, which used to leave every game on a black screen)
// YouTube bundles:
//   - with an SDK whose calls never resolve, each game still boots
//   - with a working SDK, each game reads its cloud save through it
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(ROOT, 'out');
const BUNDLES = join(ROOT, 'dist', 'playables');
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const SDK_URL = 'https://www.youtube.com/game_api/v1';

for (const [dir, cmd] of [[SITE, 'npm run build'], [BUNDLES, 'npm run package']]) {
  try { await stat(dir); } catch { console.error(dir + ' is missing: run `' + cmd + '` first'); process.exit(1); }
}
const { games } = JSON.parse(await readFile(join(ROOT, 'lib', 'games.json'), 'utf8'));

// Static server that mimics "clean URL" hosts: /x.html redirects to /x and
// drops the query; a folder without a trailing slash serves its index.html
// without redirecting. /bundles/* serves the YouTube bundles.
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    let root = SITE;
    if (p.startsWith('bundles/')) { root = BUNDLES; p = p.slice('bundles/'.length); }
    if (p.endsWith('.html') && !p.endsWith('index.html')) {
      res.writeHead(301, { location: '/' + p.slice(0, -5) });
      return res.end();
    }
    if (p === '' || p.endsWith('/')) p += 'index.html';
    let body;
    try { body = await readFile(join(root, p)); } catch {
      try { body = await readFile(join(root, p + '.html')); p += '.html'; } catch {
        body = await readFile(join(root, p, 'index.html')); p += '/index.html';
      }
    }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const base = 'http://127.0.0.1:' + server.address().port + '/';

const browser = await chromium.launch();
if (SHOTS) await mkdir(SHOTS, { recursive: true });
let failed = 0;
function report(ok, name, detail) {
  if (!ok) failed++;
  console.log((ok ? 'ok' : 'FAIL').padEnd(5), name, ok ? '' : '\n   ' + detail);
}

/** New page that collects errors and flags any request for the YouTube SDK. */
async function sitePage(opts) {
  const page = await browser.newPage(opts);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/youtube\.com|ERR_FAILED/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.route('https://www.youtube.com/**', (r) => { errors.push('website requested ' + r.request().url()); return r.abort(); });
  return { page, errors };
}
const readyIn = (target, ms) => target.waitForFunction(() => window.YT && window.YT.status().ready, null, { timeout: ms || 8000 });

// --- website: each game standalone ----------------------------------------------
const VIEWPORTS = [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 900, height: 420 },
];
for (const game of games) {
  for (const vp of VIEWPORTS) {
    const { page, errors } = await sitePage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(base + 'games/' + game.slug + '/');
    await readyIn(page).catch(() => errors.push('gameReady never fired'));
    const { width: w, height: h } = vp;
    for (let i = 0; i < 6; i++) {
      await page.mouse.click(w * (0.2 + 0.12 * i), h * (0.35 + 0.08 * (i % 4)));
      await page.waitForTimeout(120);
    }
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(w * 0.3, h * 0.4);
      await page.mouse.down();
      await page.mouse.move(w * 0.6, h * 0.55, { steps: 12 });
      await page.mouse.move(w * 0.7, h * 0.3, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1200);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, game.slug + '-' + vp.name + '.png') });
    report(!errors.length, 'game ' + game.slug + ' (' + vp.name + ')', errors.join('\n   '));
    await page.close();
  }
  const { page, errors } = await sitePage({ viewport: { width: 390, height: 844 } });
  await page.goto(base + 'games/' + game.slug);
  await readyIn(page).catch(() => errors.push('gameReady never fired'));
  if (!page.url().endsWith('/games/' + game.slug + '/')) errors.push('not redirected to the slash URL: ' + page.url());
  // The preload scanner may fetch game.js against the slash-less URL before
  // the redirect runs; those 404s are harmless, everything else is not.
  const real = errors.filter((e) => !/404|Failed to load resource/.test(e));
  report(!real.length, 'game ' + game.slug + ' (no trailing slash)', real.join('\n   '));
  await page.close();
}

// --- website: portal ------------------------------------------------------------
async function checkPlayer(page, game, errors) {
  const title = await page.textContent('#title');
  if (!title.includes(game.title)) errors.push('title shows "' + title + '"');
  const frame = await (await page.waitForSelector('#game')).contentFrame();
  await readyIn(frame).catch(() => errors.push('game in player never became ready'));
  if (!frame.url().includes('/games/' + game.slug + '/')) errors.push('iframe loaded ' + frame.url());
}
{
  const { page, errors } = await sitePage({ viewport: { width: 1200, height: 800 } });
  await page.goto(base);
  await page.waitForSelector('.card');
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'portal-home.png') });
  const hrefs = await page.$$eval('.card', (els) => els.map((a) => a.getAttribute('href')));
  if (hrefs.length !== games.length) errors.push('expected ' + games.length + ' cards, got ' + hrefs.length);
  report(!errors.length, 'portal home', errors.join('\n   '));

  for (const [i, game] of games.entries()) {
    errors.length = 0;
    await page.goto(new URL(hrefs[i], base).href);
    await checkPlayer(page, game, errors);
    if (SHOTS && i === 0) await page.screenshot({ path: join(SHOTS, 'portal-play.png') });
    report(!errors.length, 'player ' + game.slug + ' (page load)', errors.join('\n   '));
  }
  for (const [i, game] of games.entries()) {
    errors.length = 0;
    await page.goto(base);
    await page.locator('.card').nth(i).click();
    await page.waitForURL('**/play/' + game.slug + '/');
    await checkPlayer(page, game, errors);
    report(!errors.length, 'player ' + game.slug + ' (client navigation)', errors.join('\n   '));
  }
  await page.close();
}

// --- YouTube bundles with a fake SDK --------------------------------------------
// hang: IN_PLAYABLES_ENV is true but no promise ever settles (what the real
// SDK does without a YouTube host). ok: a minimal working host.
const fakeSdk = (mode) => `
  window.__yt = { calls: [] };
  (function () {
    const log = (n) => window.__yt.calls.push(n);
    const later = (v) => (${mode === 'hang'} ? new Promise(() => {}) : Promise.resolve(v));
    window.ytgame = {
      IN_PLAYABLES_ENV: true,
      game: {
        firstFrameReady: () => log('firstFrameReady'),
        gameReady: () => log('gameReady'),
        loadData: () => { log('loadData'); return later(''); },
        saveData: () => { log('saveData'); return later(); },
      },
      system: {
        isAudioEnabled: () => true,
        onAudioEnabledChange: () => () => {},
        onPause: () => () => {},
        onResume: () => () => {},
        getLanguage: () => later('en'),
      },
      engagement: { sendScore: () => { log('sendScore'); return later(); } },
      health: { logError: () => log('logError'), logWarning: () => log('logWarning') },
      ads: { requestInterstitialAd: () => later(), requestRewardedAd: () => later(true) },
    };
  })();`;

for (const mode of ['hang', 'ok']) {
  for (const game of games) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    let sdkRequested = false;
    await page.route(SDK_URL, (r) => { sdkRequested = true; return r.fulfill({ contentType: 'text/javascript', body: fakeSdk(mode) }); });
    await page.goto(base + 'bundles/' + game.slug + '/');
    await page.waitForFunction(() => window.__yt && window.__yt.calls.includes('gameReady'), null, { timeout: 10000 })
      .catch(() => errors.push('gameReady never reached the SDK'));
    if (!sdkRequested) errors.push('bundle does not load the SDK');
    const calls = await page.evaluate(() => (window.__yt ? window.__yt.calls : []));
    const ff = calls.indexOf('firstFrameReady');
    if (ff < 0 || ff > calls.indexOf('gameReady')) errors.push('firstFrameReady must come before gameReady: ' + calls.join(','));
    if (!calls.includes('loadData')) errors.push('cloud save never read');
    report(!errors.length, 'bundle ' + game.slug + ' (' + (mode === 'hang' ? 'SDK never answers' : 'working SDK') + ')', errors.join('\n   '));
    await page.close();
  }
}

await browser.close();
server.close();
if (failed) {
  console.error(failed + ' check(s) failed');
  process.exit(1);
}
console.log('all checks passed');
