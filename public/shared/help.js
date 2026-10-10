/*
 * In-game "?" button. Reads the how-to-play text from
 * <meta name="game-help" content="..."> and shows it in a sheet over the game,
 * pausing play while it's open (YT.hold). The button docks into the game's HUD
 * when there is one (flagship .fs-right or kit .kit-hud__actions) and floats
 * in the top-right corner otherwise; data-right / data-top on the meta tag
 * nudge the floating spot for games with their own corner buttons.
 */
(function () {
  'use strict';
  const meta = document.querySelector('meta[name="game-help"]');
  if (!meta || !meta.content) return;

  const css = document.createElement('style');
  css.textContent = `
    .yt-help-btn { font: 900 20px system-ui, sans-serif; line-height: 1; cursor: pointer; touch-action: manipulation; }
    .yt-help-btn.float { position: fixed; z-index: 900; width: 40px; height: 40px; border-radius: 50%; border: 0;
      top: calc(max(10px, env(safe-area-inset-top)) + var(--yt-help-top, 0px));
      right: calc(max(10px, env(safe-area-inset-right)) + var(--yt-help-right, 0px));
      color: #fff; background: rgba(15, 12, 30, .55); box-shadow: inset 0 0 0 2px rgba(255,255,255,.25), 0 4px 10px rgba(0,0,0,.25); }
    .yt-help-btn.float:active { transform: scale(.92); }
    .yt-help-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 18px;
      background: rgba(8, 6, 20, .62); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
    .yt-help-card { width: min(380px, 100%); max-height: 86vh; overflow-y: auto; border-radius: 22px; padding: 20px 20px 16px;
      background: linear-gradient(180deg, #2b2350, #1b1636); color: #fff; font: 600 16px/1.5 system-ui, sans-serif;
      box-shadow: inset 0 0 0 2px rgba(255,255,255,.14), 0 24px 50px rgba(0,0,0,.45); animation: yt-help-pop .25s cubic-bezier(.2,1.4,.4,1); }
    .yt-help-card h2 { margin: 0 0 4px; font: 900 22px system-ui, sans-serif; }
    .yt-help-card .t { margin: 0 0 12px; opacity: .65; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; }
    .yt-help-card p { margin: 0 0 16px; }
    .yt-help-card button { width: 100%; border: 0; border-radius: 14px; padding: 12px; cursor: pointer;
      font: 900 17px system-ui, sans-serif; color: #fff; background: linear-gradient(180deg, #3ddc97, #1fae5f); box-shadow: 0 4px 0 #148a4a; }
    @keyframes yt-help-pop { from { transform: scale(.85); opacity: 0; } }
  `;
  document.head.appendChild(css);

  const right = parseFloat(meta.dataset.right || '0');
  const top = parseFloat(meta.dataset.top || '0');
  document.documentElement.style.setProperty('--yt-help-right', right + 'px');
  document.documentElement.style.setProperty('--yt-help-top', top + 'px');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'yt-help-btn';
  btn.textContent = '?';
  btn.title = 'How to play';
  btn.setAttribute('aria-label', 'How to play');
  // keep the tap from reaching the game underneath
  ['pointerdown', 'pointerup', 'touchstart', 'mousedown'].forEach((t) => btn.addEventListener(t, (e) => e.stopPropagation()));
  btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); open(); });

  const HOSTS = [
    ['.fs-hud .fs-right', 'fs-icon'],
    ['.kit-hud__actions', 'kit-icon-btn'],
  ];
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  function place() {
    for (const [sel, cls] of HOSTS) {
      const host = document.querySelector(sel);
      if (visible(host)) {
        if (btn.parentElement !== host) { btn.className = 'yt-help-btn ' + cls; host.appendChild(btn); }
        return;
      }
    }
    if (btn.parentElement !== document.body) { btn.className = 'yt-help-btn float'; document.body.appendChild(btn); }
  }

  let sheet = null;
  function open() {
    if (sheet) return;
    if (window.YT && window.YT.hold) window.YT.hold(true);
    sheet = document.createElement('div');
    sheet.className = 'yt-help-overlay';
    const card = document.createElement('div');
    card.className = 'yt-help-card';
    const h = document.createElement('h2');
    h.textContent = 'How to play';
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = document.title;
    const p = document.createElement('p');
    p.textContent = meta.content;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Got it';
    ok.addEventListener('click', close);
    card.append(h, t, p, ok);
    sheet.appendChild(card);
    ['pointerdown', 'pointerup', 'touchstart', 'mousedown', 'click'].forEach((ty) => sheet.addEventListener(ty, (e) => {
      e.stopPropagation();
      if (ty === 'click' && e.target === sheet) close();
    }));
    document.body.appendChild(sheet);
  }
  function close() {
    if (!sheet) return;
    sheet.remove();
    sheet = null;
    if (window.YT && window.YT.hold) window.YT.hold(false);
  }
  window.addEventListener('keydown', (e) => { if (sheet && e.key === 'Escape') close(); });

  const start = () => { place(); setInterval(place, 400); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
