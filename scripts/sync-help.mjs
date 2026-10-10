// Copies each game's "how to play" text from lib/games.json into its page as
// <meta name="game-help">, read by public/shared/help.js (the in-game "?"),
// and makes sure the page loads help.js. Idempotent; run after editing the
// catalog text:
//   node scripts/sync-help.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const { games } = JSON.parse(await readFile(join(ROOT, 'lib', 'games.json'), 'utf8'));
// games with their own top-right buttons: nudge the floating "?" left of them
const NUDGE = { 'block-burst': 'data-right="54"', 'stack-tower': 'data-right="60"' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

let changed = 0;
for (const g of games) {
  const file = join(ROOT, 'public', 'games', g.slug, 'index.html');
  const before = await readFile(file, 'utf8');
  const tag = `<meta name="game-help" content="${esc(g.how)}"${NUDGE[g.slug] ? ' ' + NUDGE[g.slug] : ''}>`;
  let html = before.replace(/[ \t]*<meta name="game-help"[^>]*>\n?/, '');
  html = html.replace(/([ \t]*)<title>/, `$1${tag}\n$1<title>`);
  if (!html.includes('shared/help.js')) html = html.replace(/([ \t]*)<\/body>/, '$1  <script src="../../shared/help.js" defer></script>\n$1</body>');
  if (!html.includes('game-help') || !html.includes('shared/help.js')) throw new Error(g.slug + ': could not add help');
  if (html !== before) { await writeFile(file, html); changed++; }
}
console.log('help synced:', changed, 'page(s) updated of', games.length);
