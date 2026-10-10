// Smoke test: serves the repo, opens every game in portrait and landscape in
// headless Chromium, pokes at it with taps and drags, and fails on any page
// error or if the game never signals gameReady.
//
//   node tests/smoke.mjs [--shots <dir>]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// games.js is a browser script (window.GAMES_CATALOG = {...};) so the portal
// also works from file://; pull the JSON object out of it.
async function loadCatalog(root) {
  const src = await readFile(join(root, 'games.js'), 'utf8');
  return JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
}

// Behaves like common static hosts with "clean URLs" (e.g. `serve`, used by
// `npm start`): /x.html redirects to /x and drops the query string, /x serves
// x.html, and a folder without a trailing slash serves its index.html. Both
// quirks have broken the site before, so the tests run against them.
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (p.endsWith('.html') && !p.endsWith('index.html')) {
      res.writeHead(301, { location: '/' + p.slice(0, -5) });
      return res.end();
    }
    if (p === '' || p.endsWith('/')) p += 'index.html';
    let body;
    try { body = await readFile(join(ROOT, p)); } catch {
      try { body = await readFile(join(ROOT, p + '.html')); p += '.html'; } catch {
        body = await readFile(join(ROOT, p, 'index.html')); p += '/index.html';
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

const catalog = await loadCatalog(ROOT);
const browser = await chromium.launch();
if (SHOTS) await mkdir(SHOTS, { recursive: true });
let failed = 0;

const VIEWPORTS = [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 900, height: 420 },
];

for (const game of catalog.games) {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: false });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/game_api|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
    });
    // The real SDK is only meaningful inside YouTube; block it so tests are hermetic.
    await page.route('https://www.youtube.com/**', (r) => r.abort());
    await page.goto(base + 'games/' + game.slug + '/');
    await page.waitForFunction(() => window.YT && window.YT.status().ready, null, { timeout: 8000 }).catch(() => errors.push('gameReady never fired'));
    // poke: taps across the screen and a few drags
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
    await page.waitForTimeout(1500);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, game.slug + '-' + vp.name + '.png') });
    const status = errors.length ? 'FAIL' : 'ok';
    if (errors.length) failed++;
    console.log(status.padEnd(5), game.slug.padEnd(20), vp.name, errors.length ? '\n  ' + errors.join('\n  ') : '');
    await page.close();
  }
}

// direct game links without the trailing slash must still boot
for (const game of catalog.games) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('https://www.youtube.com/**', (r) => r.abort());
  await page.goto(base + 'games/' + game.slug);
  await page.waitForFunction(() => window.YT && window.YT.status().ready, null, { timeout: 8000 }).catch(() => errors.push('gameReady never fired'));
  if (errors.length) failed++;
  console.log((errors.length ? 'FAIL' : 'ok').padEnd(5), game.slug.padEnd(20), 'no trailing slash', errors.join('; '));
  await page.close();
}

// portal: every card must open its own game in the player page
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://www.youtube.com/**', (r) => r.abort());
  await page.goto(base);
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'portal-home.png') });
  const hrefs = await page.$$eval('.card', (els) => els.map((a) => a.getAttribute('href')));
  if (hrefs.length !== catalog.games.length) errors.push('expected ' + catalog.games.length + ' cards, got ' + hrefs.length);
  if (errors.length) failed++;
  console.log((errors.length ? 'FAIL' : 'ok').padEnd(5), 'portal home'.padEnd(20), errors.join('; '));
  for (const game of catalog.games) {
    const href = hrefs[catalog.games.indexOf(game)];
    const errs = [];
    await page.goto(base + href);
    const title = await page.textContent('#title');
    if (!title.includes(game.title)) errs.push('title shows "' + title + '"');
    const frame = await (await page.waitForSelector('#game')).contentFrame();
    await frame.waitForFunction(() => window.YT && window.YT.status().ready, null, { timeout: 8000 }).catch(() => errs.push('game in player never became ready'));
    if (!frame.url().includes('/games/' + game.slug + '/')) errs.push('iframe loaded ' + frame.url());
    if (SHOTS && game === catalog.games[0]) await page.screenshot({ path: join(SHOTS, 'portal-play.png') });
    if (errs.length) failed++;
    console.log((errs.length ? 'FAIL' : 'ok').padEnd(5), ('player ' + game.slug).padEnd(20), errs.join('; '));
  }
  await page.close();
}

await browser.close();
server.close();
if (failed) {
  console.error(failed + ' check(s) failed');
  process.exit(1);
}
console.log('all checks passed');
