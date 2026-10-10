/*
 * Flagship UI kit (ES module) shared by the 3D games: title screen, HUD,
 * result / pause / shop panels, praise pops, flying coins, tutorial hand.
 * Pure DOM over the WebGL canvas, styled by flagship.css.
 */
import { sfx, initAudio } from 'sfx';

const root = () => document.getElementById('ui');
const fxRoot = () => {
  let el = document.getElementById('fx');
  if (!el) { el = document.createElement('div'); el.id = 'fx'; document.body.appendChild(el); }
  return el;
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) { /* blocked in iframes */ }
}

/** Chunky candy button. style: '' (red) | green | gold | blue | ghost; ad: shows an ad badge. */
export function button(label, onClick, { style = '', ad = false, small = false, pulse = false } = {}) {
  const b = el('button', 'fs-btn ' + style + (small ? ' small' : '') + (pulse ? ' pulse' : ''), (ad ? '<span class="ad">AD</span>' : '') + label);
  b.type = 'button';
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    initAudio();
    sfx.click();
    buzz(6);
    onClick && onClick(b);
  });
  return b;
}

export function iconButton(glyph, title, onClick) {
  const b = el('button', 'fs-icon', glyph);
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', (ev) => { ev.stopPropagation(); initAudio(); sfx.click(); onClick(b); });
  return b;
}

/**
 * Title screen over the live 3D scene.
 * opts: { line1, line2, tagline, best, onPlay, extra: [button elements] }
 */
export function titleScreen(opts) {
  const wrap = el('div', 'fs-title');
  const logo = el('div', 'fs-logo');
  logo.innerHTML = '<span class="l1 fs-stroke">' + opts.line1 + '</span>' +
    (opts.line2 ? '<span class="l2 fs-stroke">' + opts.line2 + '</span>' : '') +
    (opts.tagline ? '<span class="tag">' + opts.tagline + '</span>' : '');
  wrap.appendChild(logo);
  const actions = el('div', 'fs-actions');
  const play = button(opts.playLabel || 'PLAY', () => { close(); opts.onPlay(); }, { pulse: true });
  play.style.minWidth = '240px';
  play.style.fontSize = '26px';
  actions.appendChild(play);
  if (opts.extra && opts.extra.length) {
    const row = el('div', 'fs-row');
    opts.extra.forEach((b) => row.appendChild(b));
    actions.appendChild(row);
  }
  if (opts.best) actions.appendChild(el('div', 'fs-best', opts.best));
  wrap.appendChild(actions);
  root().appendChild(wrap);
  function close() { wrap.remove(); }
  return { close, el: wrap };
}

/** Modal panel. opts: { title, sub, body (html|node), buttons: [elements], cls } */
export function panel(opts) {
  const ov = el('div', 'fs-overlay');
  const p = el('div', 'fs-panel' + (opts.cls ? ' ' + opts.cls : ''));
  if (opts.title) p.appendChild(el('h2', 'fs-stroke' + (opts.gold ? ' fs-gold' : ''), opts.title));
  if (opts.sub) p.appendChild(el('div', 'sub', opts.sub));
  if (opts.body) {
    if (typeof opts.body === 'string') p.insertAdjacentHTML('beforeend', opts.body);
    else p.appendChild(opts.body);
  }
  const btns = el('div', 'btns');
  (opts.buttons || []).forEach((b) => btns.appendChild(b));
  p.appendChild(btns);
  ov.appendChild(p);
  root().appendChild(ov);
  return { close: () => ov.remove(), el: p, btns };
}

export function starsHtml(n) {
  return '<div class="fs-stars">' + [0, 1, 2].map((i) => '<span class="' + (i < n ? 'on' : '') + '">★</span>').join('') + '</div>';
}

/**
 * HUD: level label + progress bar in the middle, coins top-left, buttons
 * top-right. Returns setters.
 */
export function hud({ coins = 0, level = '', right = [] } = {}) {
  const bar = el('div', 'fs-hud');
  const left = el('div', '');
  const coinPill = el('div', 'fs-pill', '<span class="ico"><span class="fs-coin" style="position:static;margin:0;width:20px;height:20px;display:block"></span></span><b>' + coins + '</b>');
  left.appendChild(coinPill);
  const mid = el('div', 'mid');
  const lvl = el('div', 'fs-level fs-stroke', level);
  const prog = el('div', 'fs-progress', '<i></i>');
  mid.appendChild(lvl);
  mid.appendChild(prog);
  const rightBox = el('div', 'fs-right');
  right.forEach((b) => rightBox.appendChild(b));
  bar.appendChild(left);
  bar.appendChild(mid);
  bar.appendChild(rightBox);
  root().appendChild(bar);
  const coinText = coinPill.querySelector('b');
  const fill = prog.querySelector('i');
  return {
    el: bar,
    coinEl: coinPill,
    setCoins(v, bump) {
      coinText.textContent = String(v);
      if (bump) { coinPill.classList.remove('bump'); void coinPill.offsetWidth; coinPill.classList.add('bump'); }
    },
    setLevel(t) { lvl.textContent = t; },
    setProgress(p) { fill.style.width = Math.max(0, Math.min(1, p)) * 100 + '%'; },
    show(v) { bar.style.display = v ? '' : 'none'; },
  };
}

/** Big centre praise word ("PERFECT!"). */
export function praise(text, color) {
  const p = el('div', 'fs-praise fs-stroke', text);
  if (color) p.style.color = color;
  fxRoot().appendChild(p);
  setTimeout(() => p.remove(), 1150);
}

/** Small floating text at screen position. */
export function floatText(text, x, y, color) {
  const f = el('div', 'fs-float fs-stroke', text);
  f.style.left = x + 'px';
  f.style.top = y + 'px';
  if (color) f.style.color = color;
  fxRoot().appendChild(f);
  setTimeout(() => f.remove(), 950);
}

/** Red flash at the screen edges (hit feedback). */
export function hitFlash() {
  const v = el('div', 'fs-vignette');
  fxRoot().appendChild(v);
  setTimeout(() => v.remove(), 520);
}

/**
 * Coins fly from (x, y) to the HUD coin pill. onArrive(i) fires per coin.
 */
export function coinBurst(x, y, n, targetEl, onArrive) {
  const tr = targetEl.getBoundingClientRect();
  const tx = tr.left + 20, ty = tr.top + tr.height / 2;
  const count = Math.min(n, 14);
  for (let i = 0; i < count; i++) {
    const c = el('div', 'fs-coin');
    fxRoot().appendChild(c);
    const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 60;
    const mx = x + Math.cos(a) * r, my = y + Math.sin(a) * r;
    const t0 = performance.now() + i * 45;
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - t0) / 650));
      const k = t < 0.35 ? t / 0.35 : 1;
      const m = t < 0.35 ? 0 : (t - 0.35) / 0.65;
      const e = m * m;
      const px = (x + (mx - x) * (1 - (1 - k) * (1 - k))) * (1 - e) + tx * e;
      const py = (y + (my - y) * (1 - (1 - k) * (1 - k))) * (1 - e) + ty * e;
      c.style.transform = 'translate(' + px + 'px,' + py + 'px) scale(' + (1 - e * 0.4) + ')';
      if (t < 1) requestAnimationFrame(step);
      else { c.remove(); onArrive && onArrive(i); }
    };
    c.style.left = '0px';
    c.style.top = '0px';
    requestAnimationFrame(step);
  }
}

/** Looping tutorial hand that swipes between points (screen px). Returns stop(). */
export function tutorialHand(points, hint) {
  const h = el('div', 'fs-hand', '👆');
  const tip = hint ? el('div', 'fs-hint fs-stroke', hint) : null;
  fxRoot().appendChild(h);
  if (tip) fxRoot().appendChild(tip);
  let alive = true;
  const t0 = performance.now();
  const step = (now) => {
    if (!alive) return;
    const pts = typeof points === 'function' ? points() : points;
    const cyc = ((now - t0) / 1600) % 1;
    const k = 0.5 - Math.cos(cyc * Math.PI * 2) / 2;
    const x = pts[0][0] + (pts[1][0] - pts[0][0]) * k;
    const y = pts[0][1] + (pts[1][1] - pts[0][1]) * k;
    h.style.left = x + 'px';
    h.style.top = y + 'px';
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return () => { alive = false; h.remove(); if (tip) tip.remove(); };
}

/** Shop grid. items: [{id, name, color, price}], owned: {id:true}, current id. */
export function shopPanel({ title = 'Skins', items, owned, current, coins, onBuy, onSelect, onAdUnlock, onClose }) {
  const grid = el('div', 'fs-shop');
  items.forEach((it) => {
    const has = !!owned[it.id];
    const b = el('button', 'fs-item' + (it.id === current ? ' on' : '') + (has ? '' : ' locked'),
      '<div class="sw" style="background:' + it.color + '"></div>' + it.name +
      '<span class="price">' + (it.id === current ? 'Equipped' : has ? 'Use' : it.ad ? '▶ Free' : '🪙 ' + it.price) + '</span>');
    b.type = 'button';
    b.disabled = !has && !it.ad && coins < it.price;
    b.addEventListener('click', () => {
      sfx.click();
      if (has) onSelect(it);
      else if (it.ad) onAdUnlock(it);
      else onBuy(it);
    });
    grid.appendChild(b);
  });
  return panel({ title, sub: '🪙 ' + coins + ' coins', body: grid, buttons: [button('Close', onClose, { style: 'ghost', small: true })] });
}

/** Count a number up inside an element. */
export function countUp(elm, from, to, ms = 700) {
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    elm.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
