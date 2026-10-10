// Builds one self-contained YouTube Playables bundle per game:
//   dist/playables/<slug>/        index.html, game.js, shared/*
//   dist/playables/<slug>.zip     ready to upload in the Playables portal
//
// The shared files are copied into each bundle and the ../../shared/ paths
// are rewritten, so every zip stands alone. The YouTube Playables SDK script is
// added here: only YouTube builds load it (the website must not, see
// public/shared/yt.js). Checks the certification size
// limits (initial bundle <= 30 MiB, recommended <= 15 MiB; files < 30 MiB).
//
//   node scripts/package.mjs
import { readFile, writeFile, mkdir, rm, readdir, stat, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dist', 'playables');
const SHARED = ['yt.js', 'kit.js', 'game.css'];
const MiB = 1024 * 1024;

const { games } = JSON.parse(await readFile(join(ROOT, 'lib', 'games.json'), 'utf8'));
const SDK_TAG = '<script src="https://www.youtube.com/game_api/v1"></script>';
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

let hasZip = true;
try { execFileSync('zip', ['-v'], { stdio: 'ignore' }); } catch { hasZip = false; }

async function dirSize(dir) {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(p);
    else {
      const s = (await stat(p)).size;
      if (s >= 30 * MiB) throw new Error(p + ' exceeds the 30 MiB single-file limit');
      total += s;
    }
  }
  return total;
}

let failed = false;
for (const g of games) {
  const src = join(ROOT, 'public', 'games', g.slug);
  const dst = join(OUT, g.slug);
  await mkdir(join(dst, 'shared'), { recursive: true });
  for (const f of await readdir(src)) {
    if (f === 'index.html') {
      const html = (await readFile(join(src, f), 'utf8'))
        .replace(/[ \t]*<!-- site-only:start[\s\S]*?<!-- site-only:end -->\n?/, '')
        // the SDK must load before any game code, so it replaces the marker in <head>
        .replace(/[ \t]*<!-- playables-sdk:[\s\S]*?-->/, '  ' + SDK_TAG)
        .replaceAll('../../shared/', 'shared/');
      if (html.includes('site-only') || !html.includes(SDK_TAG)) throw new Error(g.slug + ': bad index.html after packaging');
      await writeFile(join(dst, f), html);
    } else {
      await copyFile(join(src, f), join(dst, f));
    }
  }
  for (const f of SHARED) await copyFile(join(ROOT, 'public', 'shared', f), join(dst, 'shared', f));
  const size = await dirSize(dst);
  if (size > 30 * MiB) failed = true;
  const note = size > 30 * MiB ? 'OVER 30 MiB LIMIT' : size > 15 * MiB ? 'over 15 MiB recommendation' : 'ok';
  if (hasZip) execFileSync('zip', ['-qr', join(OUT, g.slug + '.zip'), '.'], { cwd: dst });
  console.log(g.slug.padEnd(20), (size / 1024).toFixed(1).padStart(7) + ' KiB', note);
}
if (!hasZip) console.log('\n`zip` not found: bundles were built as folders only.');
console.log('\nBundles written to', OUT);
if (failed) process.exit(1);
