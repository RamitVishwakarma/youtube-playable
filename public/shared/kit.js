/*
 * Kit — tiny shared helpers for the games: a letterboxed canvas stage that
 * works in any aspect ratio, a pausable game loop, pointer input in design
 * coordinates, a WebAudio blip synth, DOM overlay panels and a few maths utils.
 * No dependencies, no network.
 */
(function () {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  // Deterministic PRNG so level N is the same for every player.
  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  // --- stage ------------------------------------------------------------------
  /**
   * Creates a full-window canvas that renders a fixed design-size area,
   * scaled to fit and letterboxed. Pointer events are converted to design
   * coordinates. Call stage.begin() at the start of each render.
   */
  function stage(W, H, opts) {
    opts = opts || {};
    const canvas = document.createElement('canvas');
    canvas.className = 'kit-stage';
    const parent = opts.parent || document.getElementById('game') || document.body;
    parent.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const st = { canvas, ctx, W, H, scale: 1, ox: 0, oy: 0, letterbox: opts.letterbox || '#000' };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // fitParent: size to the parent element instead of the whole window
      const cw = opts.fitParent ? parent.clientWidth : window.innerWidth;
      const ch = opts.fitParent ? parent.clientHeight : window.innerHeight;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      st.scale = Math.min(cw / W, ch / H);
      st.ox = (cw - W * st.scale) / 2;
      st.oy = (ch - H * st.scale) / 2;
      st.dpr = dpr;
      buildBackdrop(cw, ch, dpr);
      // let the HUD line up with the play area instead of the window edges
      const r = canvas.getBoundingClientRect();
      const root = document.documentElement.style;
      root.setProperty('--stage-x', Math.round(r.left + st.ox) + 'px');
      root.setProperty('--stage-y', Math.round(r.top + st.oy) + 'px');
      root.setProperty('--stage-w', Math.round(W * st.scale) + 'px');
      root.setProperty('--stage-h', Math.round(H * st.scale) + 'px');
      if (opts.onResize) opts.onResize(st);
    }

    // Letterbox backdrop, drawn once per resize: a soft radial glow in the
    // game's letterbox colour, a faint dot grid, and a shadow that lifts the
    // play area off it, so wide screens look framed rather than cut off.
    let backdrop = null;
    function shade(hex, k) {
      const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
      const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (k > 0 ? (255 - v) * k : v * k))));
      return 'rgb(' + ch(n >> 16) + ',' + ch((n >> 8) & 255) + ',' + ch(n & 255) + ')';
    }
    function buildBackdrop(cw, ch, dpr) {
      const bars = cw - W * st.scale > 24 || ch - H * st.scale > 24;
      if (!bars || !/^#[0-9a-f]{3,6}$/i.test(st.letterbox)) { backdrop = null; return; }
      const c = backdrop || document.createElement('canvas');
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const base = st.letterbox;
      const grad = g.createRadialGradient(cw / 2, ch / 2, 10, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      grad.addColorStop(0, shade(base, 0.16));
      grad.addColorStop(0.55, base);
      grad.addColorStop(1, shade(base, -0.45));
      g.fillStyle = grad;
      g.fillRect(0, 0, cw, ch);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let y = 12; y < ch; y += 26) for (let x = 12 + ((y / 26) % 2) * 13; x < cw; x += 26) { g.beginPath(); g.arc(x, y, 1.3, 0, Math.PI * 2); g.fill(); }
      const w = W * st.scale, h = H * st.scale;
      g.shadowColor = 'rgba(0,0,0,0.55)';
      g.shadowBlur = 40;
      g.fillStyle = shade(base, -0.3);
      g.beginPath();
      g.roundRect(st.ox, st.oy, w, h, Math.min(18, w * 0.03));
      g.fill();
      g.shadowBlur = 0;
      backdrop = c;
    }
    window.addEventListener('resize', resize);
    resize();

    st.begin = function () {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (backdrop) ctx.drawImage(backdrop, 0, 0);
      else {
        ctx.fillStyle = st.letterbox;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const s = st.scale * st.dpr;
      ctx.setTransform(s, 0, 0, s, st.ox * st.dpr, st.oy * st.dpr);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
    };
    st.end = function () { ctx.restore(); };

    st.toLocal = function (ev) {
      const r = canvas.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left - st.ox) / st.scale,
        y: (ev.clientY - r.top - st.oy) / st.scale,
      };
    };

    const handlers = { down: [], move: [], up: [] };
    st.on = function (type, fn) { handlers[type].push(fn); };
    let activeId = null;
    canvas.addEventListener('pointerdown', (ev) => {
      if (activeId !== null) return;
      activeId = ev.pointerId;
      try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
      audio.unlock();
      const p = st.toLocal(ev);
      handlers.down.forEach((fn) => fn(p, ev));
      ev.preventDefault();
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (activeId !== null && ev.pointerId !== activeId) return;
      const p = st.toLocal(ev);
      p.pressed = activeId !== null;
      handlers.move.forEach((fn) => fn(p, ev));
    });
    const up = (ev) => {
      if (ev.pointerId !== activeId) return;
      activeId = null;
      const p = st.toLocal(ev);
      handlers.up.forEach((fn) => fn(p, ev));
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    return st;
  }

  // --- loop -----------------------------------------------------------------
  /**
   * requestAnimationFrame loop that stops updating while paused (YouTube
   * pause, tab hidden, ad showing) but keeps rendering so the screen is never
   * blank. dt is in seconds and clamped to avoid physics explosions.
   */
  function loop(update, render) {
    const L = { paused: false, time: 0 };
    let last = performance.now();
    let first = true;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!L.paused) {
        L.time += dt;
        update(dt);
      }
      render();
      if (first) {
        first = false;
        if (window.YT) window.YT.firstFrameReady();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    L.pause = () => { L.paused = true; };
    L.resume = () => { L.paused = false; last = performance.now(); };
    if (window.YT) {
      window.YT.onPause(() => { L.pause(); audio.suspend(); });
      window.YT.onResume(() => { L.resume(); audio.resume(); });
    }
    return L;
  }

  // --- audio ----------------------------------------------------------------
  const audio = (function () {
    let ac = null;
    let muted = false;
    let suspended = false;
    function enabled() {
      return !muted && !suspended && (!window.YT || window.YT.audioEnabled());
    }
    return {
      unlock() {
        if (ac) return;
        try {
          ac = new (window.AudioContext || window.webkitAudioContext)();
        } catch (_) { ac = null; }
      },
      suspend() { suspended = true; if (ac) ac.suspend().catch(() => {}); },
      resume() { suspended = false; if (ac) ac.resume().catch(() => {}); },
      setMuted(m) { muted = m; },
      isMuted() { return muted; },
      /** Play a short synth blip. */
      blip(freq, dur, type, vol, slide) {
        if (!ac || !enabled()) return;
        const t = ac.currentTime;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
        g.gain.setValueAtTime((vol || 0.15), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ac.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
      },
      noise(dur, vol) {
        if (!ac || !enabled()) return;
        const len = Math.floor(ac.sampleRate * dur);
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ac.createBufferSource();
        const g = ac.createGain();
        g.gain.value = vol || 0.2;
        src.buffer = buf;
        src.connect(g).connect(ac.destination);
        src.start();
      },
    };
  })();
  document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  const sfx = {
    tap: () => audio.blip(660, 0.06, 'square', 0.08),
    good: () => { audio.blip(523, 0.08, 'triangle', 0.15); setTimeout(() => audio.blip(784, 0.12, 'triangle', 0.15), 80); },
    win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => audio.blip(f, 0.14, 'triangle', 0.16), i * 90)),
    lose: () => audio.blip(300, 0.4, 'sawtooth', 0.12, 0.4),
    bad: () => audio.blip(180, 0.12, 'square', 0.1),
    coin: () => { audio.blip(988, 0.05, 'square', 0.08); setTimeout(() => audio.blip(1319, 0.1, 'square', 0.08), 50); },
    pop: () => audio.blip(440, 0.08, 'sine', 0.18, 2),
    thud: () => audio.noise(0.12, 0.25),
    crash: () => audio.noise(0.45, 0.35),
  };

  // --- DOM UI ---------------------------------------------------------------
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  /**
   * Modal panel over the game. buttons: [{label, cls, onClick, keep}]
   * Returns {close, root}. Clicking a button closes the panel unless keep.
   */
  function panel(opts) {
    const root = el('div', 'kit-overlay');
    const box = el('div', 'kit-panel' + (opts.cls ? ' ' + opts.cls : ''));
    if (opts.title) box.appendChild(el('h2', '', opts.title));
    if (opts.body) {
      const body = el('div', 'kit-body');
      if (typeof opts.body === 'string') body.innerHTML = opts.body;
      else body.appendChild(opts.body);
      box.appendChild(body);
    }
    const row = el('div', 'kit-buttons');
    const api = {
      root,
      close() { root.remove(); },
    };
    (opts.buttons || []).forEach((b) => {
      const btn = el('button', 'kit-btn ' + (b.cls || ''), b.label);
      btn.type = 'button';
      if (b.disabled) btn.disabled = true;
      btn.addEventListener('click', () => {
        sfx.tap();
        if (!b.keep) api.close();
        if (b.onClick) b.onClick(btn);
      });
      row.appendChild(btn);
    });
    if (row.children.length) box.appendChild(row);
    root.appendChild(box);
    (document.getElementById('ui') || document.body).appendChild(root);
    return api;
  }

  /** Small fading message. */
  function toast(msg, ms) {
    const t = el('div', 'kit-toast', msg);
    (document.getElementById('ui') || document.body).appendChild(t);
    setTimeout(() => t.classList.add('out'), ms || 1400);
    setTimeout(() => t.remove(), (ms || 1400) + 400);
  }

  /** Top HUD bar: Kit.hud([{id,label}], [{id,label,onClick}]) */
  function hud(stats, actions) {
    const bar = el('div', 'kit-hud');
    const left = el('div', 'kit-hud__stats');
    const right = el('div', 'kit-hud__actions');
    const refs = {};
    (stats || []).forEach((s) => {
      const chip = el('div', 'kit-chip', '<small>' + s.label + '</small><b>' + (s.value ?? '') + '</b>');
      refs[s.id] = chip.querySelector('b');
      left.appendChild(chip);
    });
    (actions || []).forEach((a) => {
      const b = el('button', 'kit-icon-btn', a.label);
      b.type = 'button';
      b.title = a.title || '';
      b.addEventListener('click', (ev) => { ev.stopPropagation(); sfx.tap(); a.onClick(b); });
      refs[a.id] = b;
      right.appendChild(b);
    });
    bar.appendChild(left);
    bar.appendChild(right);
    (document.getElementById('ui') || document.body).appendChild(bar);
    return {
      set(id, v) { if (refs[id] && refs[id].textContent !== String(v)) refs[id].textContent = v; },
      btn(id) { return refs[id]; },
      root: bar,
    };
  }

  // --- canvas drawing helpers ----------------------------------------------
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(ctx, str, x, y, size, color, align, weight) {
    ctx.font = (weight || '800') + ' ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#fff';
    ctx.fillText(str, x, y);
  }

  // Segment / circle helpers used by several physics games.
  function closestOnSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
    return { x: ax + dx * t, y: ay + dy * t, t };
  }
  function segmentsIntersect(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }

  /** Common boot: load save, build, then signal gameReady. */
  async function boot(id, start) {
    if (window.YT) window.YT.init(id);
    const data = window.YT ? await window.YT.load() : {};
    await start(data || {});
    // Wait for two painted frames so the game is visibly interactive first.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (window.YT) window.YT.gameReady();
  }

  window.Kit = {
    clamp, lerp, rand, randInt, pick, shuffle, seeded,
    stage, loop, audio, sfx, panel, toast, hud, el,
    roundRect, text, closestOnSegment, segmentsIntersect, boot,
  };
})();
