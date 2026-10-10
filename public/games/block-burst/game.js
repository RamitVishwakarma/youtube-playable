/*
 * Block Burst — drag pieces onto the 8×8 board, fill rows or columns to
 * clear them, chain clears for combos. The game ends when none of the three
 * pieces in the tray fit anywhere.
 *
 * Everything (art, UI, sound) is generated in code: no image or audio
 * assets, no network. Rendering is a single full-bleed canvas whose layout
 * adapts to portrait and landscape.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const N = 8;
  const COLORS = ['#ff4d6d', '#ff9f1c', '#ffd60a', '#2ee59d', '#22c7ff', '#4f6bff', '#b15cff', '#ff6fd8'];
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const PRAISE = [null, null, 'Great!', 'Excellent!', 'Amazing!', 'Unbelievable!', 'Legendary!'];
  const COMBO_WINDOW = 3; // placements without a clear before the combo resets

  // Piece shapes ('#' = block). Weight = how often it's dealt (scaled by difficulty).
  const SHAPE_DEFS = [
    ['#', 1, 6],
    ['##', 2, 7], ['#|#', 2, 7],
    ['###', 3, 7], ['#|#|#', 3, 7],
    ['####', 4, 5], ['#|#|#|#', 4, 5],
    ['#####', 5, 3], ['#|#|#|#|#', 5, 3],
    ['##|##', 4, 8],
    ['###|###|###', 9, 3],
    ['###|###', 6, 3], ['##|##|##', 6, 3],
    ['#.|##', 3, 5], ['.#|##', 3, 5], ['##|#.', 3, 5], ['##|.#', 3, 5],
    ['#..|#..|###', 5, 3], ['..#|..#|###', 5, 3], ['###|#..|#..', 5, 3], ['###|..#|..#', 5, 3],
    ['###|.#.', 4, 4], ['.#.|###', 4, 4], ['#.|##|#.', 4, 4], ['.#|##|.#', 4, 4],
    ['##.|.##', 4, 3], ['.##|##.', 4, 3], ['#.|##|.#', 4, 3], ['.#|##|#.', 4, 3],
    ['#..|###', 4, 4], ['..#|###', 4, 4], ['###|#..', 4, 4], ['###|..#', 4, 4],
    ['#.|#.|##', 4, 4], ['.#|.#|##', 4, 4], ['##|#.|#.', 4, 4], ['##|.#|.#', 4, 4],
  ];
  const SHAPES = SHAPE_DEFS.map(([src, size, weight], id) => {
    const rows = src.split('|');
    const cells = [];
    rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') cells.push([r, c]); }));
    return { id, cells, h: rows.length, w: Math.max(...rows.map((r) => r.length)), size, weight };
  });

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInCubic = (t) => t * t * t;

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) { /* not allowed here */ }
  }

  // ---------------------------------------------------------------------------
  // Persistence (YouTube cloud save inside Playables, localStorage elsewhere)
  // ---------------------------------------------------------------------------
  let save = { best: 0, games: 0, tutorial: false, sound: true, game: null };
  let saveTimer = 0;
  function persist(now) {
    clearTimeout(saveTimer);
    if (now) YT.save(save);
    else saveTimer = setTimeout(() => YT.save(save), 400);
  }

  // ---------------------------------------------------------------------------
  // Sound: tiny synth with a little echo for sparkle
  // ---------------------------------------------------------------------------
  const Sound = (function () {
    let ac = null, out = null;
    function init() {
      if (ac) return;
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        out = ac.createGain();
        out.gain.value = 0.55;
        const delay = ac.createDelay();
        delay.delayTime.value = 0.11;
        const fb = ac.createGain();
        fb.gain.value = 0.22;
        const wet = ac.createGain();
        wet.gain.value = 0.22;
        out.connect(ac.destination);
        out.connect(delay);
        delay.connect(fb).connect(delay);
        delay.connect(wet).connect(ac.destination);
      } catch (_) { ac = null; }
    }
    const on = () => ac && save.sound && YT.audioEnabled() && !paused;
    function tone(freq, at, dur, type, vol, glide) {
      if (!on()) return;
      const t = ac.currentTime + (at || 0);
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    function noise(at, dur, vol, freq) {
      if (!on()) return;
      const t = ac.currentTime + (at || 0);
      const len = Math.max(1, Math.floor(ac.sampleRate * dur));
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource();
      const f = ac.createBiquadFilter();
      const g = ac.createGain();
      f.type = 'bandpass';
      f.frequency.value = freq || 1200;
      g.gain.value = vol || 0.2;
      src.buffer = buf;
      src.connect(f).connect(g).connect(out);
      src.start(t);
    }
    const NOTES = [0, 4, 7, 12, 16, 19, 24];
    return {
      init,
      suspend() { if (ac) ac.suspend().catch(() => {}); },
      resume() { if (ac) ac.resume().catch(() => {}); },
      click() { tone(880, 0, 0.05, 'sine', 0.08); },
      pick() { tone(440, 0, 0.07, 'sine', 0.12, 660); },
      drop() { tone(200, 0, 0.1, 'sine', 0.3, 90); noise(0, 0.05, 0.12, 1600); },
      bad() { tone(220, 0, 0.12, 'triangle', 0.12, 150); },
      clear(lines, combo) {
        const root = 392 * Math.pow(2, Math.min(combo - 1, 8) / 12);
        const n = Math.min(3 + lines, NOTES.length);
        for (let i = 0; i < n; i++) {
          const f = root * Math.pow(2, NOTES[i] / 12);
          tone(f, i * 0.045, 0.4, 'triangle', 0.13);
          tone(f * 2, i * 0.045 + 0.01, 0.25, 'sine', 0.05);
        }
        noise(0, 0.25, 0.1, 3000);
      },
      allClear() { [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(523 * Math.pow(2, s / 12), i * 0.06, 0.5, 'triangle', 0.14)); },
      over() { [0, -3, -7, -12].forEach((s, i) => tone(330 * Math.pow(2, s / 12), i * 0.14, 0.45, 'triangle', 0.14)); },
      best() { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone(523 * Math.pow(2, s / 12), i * 0.09, 0.32, 'square', 0.06)); },
      deal() { [0, 1, 2].forEach((i) => tone(600 + i * 120, i * 0.06, 0.06, 'sine', 0.06)); },
    };
  })();

  // ---------------------------------------------------------------------------
  // Canvas + layout
  // ---------------------------------------------------------------------------
  const canvas = document.createElement('canvas');
  (document.getElementById('game') || document.body).appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  const L = {}; // layout, CSS px
  const sprites = {}; // color -> pre-rendered block

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    layout();
    buildSprites();
  }

  function layout() {
    const portrait = H >= W * 1.12;
    L.portrait = portrait;
    let size;
    if (portrait) {
      size = Math.min(W * 0.92, H * 0.56, 560);
      L.bx = (W - size) / 2;
      L.by = Math.max(H * 0.2, 120);
      L.cell = size / N;
      L.size = size;
      const trayTop = L.by + size + 14;
      const trayH = Math.max(80, H - trayTop - 14);
      L.slots = [0, 1, 2].map((i) => ({ x: (W / 3) * i, y: trayTop, w: W / 3, h: trayH }));
      L.scoreX = W / 2;
      L.scoreY = L.by * 0.58;
    } else {
      size = Math.min(H * 0.86, W * 0.56, 620);
      L.cell = size / N;
      L.size = size;
      L.bx = Math.max(16, (W * 0.6 - size) / 2);
      L.by = (H - size) / 2;
      const px = L.bx + size + 24;
      const pw = W - px - 16;
      const top = H * 0.32;
      const sw = pw / 3;
      L.slots = [0, 1, 2].map((i) => ({ x: px + sw * i, y: top, w: sw, h: H - top - 10 }));
      L.scoreX = px + pw / 2;
      L.scoreY = H * 0.16;
    }
    // tray pieces are drawn smaller than board blocks
    const slot = L.slots[0];
    L.trayScale = Math.min(0.62, (slot.w * 0.82) / (5 * L.cell), (slot.h * 0.82) / (5 * L.cell));
    L.btn = Math.max(40, Math.min(52, W * 0.11));
  }

  function buildSprites() {
    const s = Math.max(8, Math.round((L.cell - Math.max(2, L.cell * 0.06)) * DPR));
    COLORS.concat(['#8a90b8']).forEach((col) => {
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      const r = s * 0.2;
      const path = (x, y, w, h, rad) => {
        g.beginPath();
        g.moveTo(x + rad, y);
        g.arcTo(x + w, y, x + w, y + h, rad);
        g.arcTo(x + w, y + h, x, y + h, rad);
        g.arcTo(x, y + h, x, y, rad);
        g.arcTo(x, y, x + w, y, rad);
        g.closePath();
      };
      // bevel base
      path(0, 0, s, s, r);
      g.fillStyle = shade(col, -0.38);
      g.fill();
      // face
      const inset = s * 0.07;
      const face = g.createLinearGradient(0, 0, 0, s);
      face.addColorStop(0, shade(col, 0.35));
      face.addColorStop(0.5, col);
      face.addColorStop(1, shade(col, -0.12));
      path(inset, inset * 0.6, s - inset * 2, s - inset * 2.2, r * 0.8);
      g.fillStyle = face;
      g.fill();
      // gloss
      const gloss = g.createLinearGradient(0, 0, 0, s * 0.55);
      gloss.addColorStop(0, 'rgba(255,255,255,0.55)');
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      path(inset * 1.8, inset * 1.2, s - inset * 3.6, s * 0.4, r * 0.6);
      g.fillStyle = gloss;
      g.fill();
      // sparkle
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.arc(s * 0.27, s * 0.27, s * 0.055, 0, Math.PI * 2);
      g.fill();
      sprites[col] = c;
    });
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  let scene = 'title'; // title | play | over
  let paused = false; // YouTube pause / tab hidden
  let menuOpen = false;
  let board = new Array(N * N).fill(0); // 0 empty, else color index + 1
  let tray = [null, null, null];
  let score = 0, shownScore = 0, combo = 0, sinceClear = 0, revived = false, newBest = false;
  let placedAt = new Array(N * N).fill(-1); // time a cell was placed (pop anim)
  let time = 0;
  let drag = null;
  let clearing = []; // cells being cleared
  let particles = [];
  let floaters = [];
  let banner = null;
  let shake = 0;
  let overT = -1; // game-over sweep progress
  let overPanelAt = 0;
  let trayDealtAt = 0;
  let pendingOverCheck = 0;
  let overBest = false;
  let tutorial = null;
  let sceneT = 0;
  const bg = Array.from({ length: 18 }, () => ({ x: Math.random(), y: Math.random(), s: rand(0.03, 0.09), v: rand(0.004, 0.012), r: rand(0, 6), c: COLORS[(Math.random() * COLORS.length) | 0] }));

  const idx = (r, c) => r * N + c;

  function canPlace(piece, r, c) {
    for (const [dr, dc] of piece.shape.cells) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N || board[idx(rr, cc)]) return false;
    }
    return true;
  }
  function fitsAnywhere(piece) {
    for (let r = 0; r <= N - piece.shape.h; r++) {
      for (let c = 0; c <= N - piece.shape.w; c++) if (canPlace(piece, r, c)) return true;
    }
    return false;
  }
  /** Rows and columns that would be complete after placing piece at r,c. */
  function linesAfter(piece, r, c) {
    const filled = board.slice();
    for (const [dr, dc] of piece.shape.cells) filled[idx(r + dr, c + dc)] = 1;
    const rows = [], cols = [];
    for (let i = 0; i < N; i++) {
      let fr = true, fc = true;
      for (let j = 0; j < N; j++) {
        if (!filled[idx(i, j)]) fr = false;
        if (!filled[idx(j, i)]) fc = false;
      }
      if (fr) rows.push(i);
      if (fc) cols.push(i);
    }
    return { rows, cols };
  }

  // --- fair dealing ------------------------------------------------------------
  function weightedShape(bias) {
    let total = 0;
    const ws = SHAPES.map((s) => {
      // bias > 0 favours small pieces (crowded board), bias < 0 big ones (late game)
      const w = Math.max(0.05, s.weight * (s.size <= 3 ? 1 + bias : s.size >= 6 ? 1 - bias * 0.8 : 1));
      total += w;
      return w;
    });
    let x = Math.random() * total;
    for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return SHAPES[i]; }
    return SHAPES[0];
  }
  /** Shapes that would complete a line somewhere on the current board. */
  function helpfulShapes() {
    const options = [];
    for (const s of SHAPES) {
      const p = { shape: s };
      search: for (let r = 0; r <= N - s.h; r++) {
        for (let c = 0; c <= N - s.w; c++) {
          if (!canPlace(p, r, c)) continue;
          const l = linesAfter(p, r, c);
          if (l.rows.length + l.cols.length) { options.push(s); break search; }
        }
      }
    }
    return options;
  }
  function deal() {
    const fill = board.filter(Boolean).length / (N * N);
    const bias = fill > 0.55 ? 0.9 : fill > 0.4 ? 0.4 : score > 3000 ? -0.3 : 0;
    // be kind on crowded boards: often include a piece that clears a line
    const helpful = fill > 0.45 ? helpfulShapes() : [];
    let set = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const s = [weightedShape(bias), weightedShape(bias), weightedShape(bias)];
      if (helpful.length && Math.random() < 0.6) {
        s[(Math.random() * 3) | 0] = helpful[(Math.random() * helpful.length) | 0];
      }
      const pieces = s.map((shape) => ({ shape }));
      if (pieces.some((p) => fitsAnywhere(p))) { set = s; break; }
      set = s;
    }
    const usedColors = [];
    tray = set.map((shape) => {
      let col;
      do { col = (Math.random() * COLORS.length) | 0; } while (usedColors.includes(col) && usedColors.length < COLORS.length);
      usedColors.push(col);
      return { shape, color: col };
    });
    trayDealtAt = time;
    Sound.deal();
  }

  // --- game flow ---------------------------------------------------------------
  function newGame() {
    board = new Array(N * N).fill(0);
    placedAt = new Array(N * N).fill(-1);
    score = shownScore = 0;
    combo = sinceClear = 0;
    revived = newBest = false;
    clearing = []; particles = []; floaters = []; banner = null;
    overT = -1;
    menuOpen = false;
    scene = 'play';
    sceneT = 0;
    deal();
    if (!save.tutorial) startTutorial();
    snapshot();
  }

  function resumeGame(g) {
    board = g.board.slice();
    placedAt = new Array(N * N).fill(-1);
    tray = g.tray.map((t) => (t ? { shape: SHAPES[t.s], color: t.c } : null));
    score = shownScore = g.score;
    combo = g.combo || 0;
    sinceClear = g.sinceClear || 0;
    revived = !!g.revived;
    newBest = false;
    clearing = []; particles = []; floaters = []; banner = null;
    overT = -1;
    menuOpen = false;
    scene = 'play';
    sceneT = 0;
    trayDealtAt = time;
    if (!tray.some(Boolean)) deal();
    pendingOverCheck = time + 0.4;
  }

  /** Save the in-progress game so closing YouTube and coming back resumes it. */
  function snapshot() {
    save.game = scene === 'play' ? {
      board: board.slice(),
      tray: tray.map((t) => (t ? { s: t.shape.id, c: t.color } : null)),
      score, combo, sinceClear, revived,
    } : null;
    persist(false);
  }

  function place(i, r, c) {
    const piece = tray[i];
    const color = piece.color + 1;
    for (const [dr, dc] of piece.shape.cells) {
      board[idx(r + dr, c + dc)] = color;
      placedAt[idx(r + dr, c + dc)] = time;
    }
    tray[i] = null;
    score += piece.shape.cells.length;
    Sound.drop();
    buzz(8);
    dismissTutorial();

    // clear complete lines
    const rows = [], cols = [];
    for (let k = 0; k < N; k++) {
      let fr = true, fc = true;
      for (let j = 0; j < N; j++) {
        if (!board[idx(k, j)]) fr = false;
        if (!board[idx(j, k)]) fc = false;
      }
      if (fr) rows.push(k);
      if (fc) cols.push(k);
    }
    const lines = rows.length + cols.length;
    if (lines) {
      combo++;
      sinceClear = 0;
      const cells = new Map();
      // stagger from the placed piece outward
      const pr = r + piece.shape.h / 2, pc = c + piece.shape.w / 2;
      rows.forEach((rr) => { for (let j = 0; j < N; j++) cells.set(idx(rr, j), [rr, j]); });
      cols.forEach((cc) => { for (let j = 0; j < N; j++) cells.set(idx(j, cc), [j, cc]); });
      cells.forEach(([rr, cc], k) => {
        const dist = Math.hypot(rr + 0.5 - pr, cc + 0.5 - pc);
        clearing.push({ r: rr, c: cc, color: board[k] - 1, t0: time + dist * 0.035 });
        board[k] = 0;
      });
      const base = 10 * lines * (lines + 1) / 2 * N / 4; // 20, 60, 120, 200…
      const gained = Math.round(base * Math.max(1, combo));
      score += gained;
      const allClear = board.every((v) => !v);
      if (allClear) score += 300;
      // feedback
      const cx = L.bx + (pc) * L.cell, cy = L.by + (pr) * L.cell;
      floaters.push({ text: '+' + gained, x: cx, y: cy, t0: time, size: L.cell * 0.7, color: '#fff' });
      if (lines >= 2 || combo >= 2 || allClear) {
        banner = {
          t0: time,
          title: allClear ? 'All Clear!' : PRAISE[Math.min(lines, PRAISE.length - 1)] || 'Nice!',
          sub: allClear ? '+300 bonus' : combo >= 2 ? 'Combo ×' + combo : lines + ' lines',
        };
      }
      if (lines >= 3 || allClear) shake = Math.min(1, 0.4 + lines * 0.15);
      Sound.clear(lines, combo);
      if (allClear) setTimeout(() => Sound.allClear(), 250);
      buzz(lines >= 3 ? [20, 30, 20] : 15);
    } else {
      sinceClear++;
      if (sinceClear >= COMBO_WINDOW) combo = 0;
    }

    if (score > save.best && !newBest && save.best > 0) {
      newBest = true;
      floaters.push({ text: 'New best!', x: L.scoreX, y: L.scoreY + L.cell, t0: time + 0.2, size: L.cell * 0.55, color: '#ffd60a' });
      setTimeout(() => Sound.best(), 300);
    }

    if (!tray.some(Boolean)) deal();
    pendingOverCheck = time + (lines ? 0.6 : 0.15);
    snapshot();
  }

  function checkGameOver() {
    const left = tray.filter(Boolean);
    if (!left.length || left.some((p) => fitsAnywhere(p))) return;
    scene = 'over';
    overT = 0;
    overPanelAt = time + 1.3;
    drag = null;
    Sound.over();
    buzz([30, 40, 60]);
    save.games++;
    overBest = score > save.best;
    if (overBest) save.best = score;
    save.game = null;
    persist(true);
    YT.sendScore(save.best);
  }

  async function revive() {
    if (revived) return;
    const ok = await YT.rewarded('revive');
    if (!ok) return;
    revived = true;
    scene = 'play';
    overT = -1;
    // blast the middle of the board
    for (let r = 2; r < 6; r++) {
      for (let c = 2; c < 6; c++) {
        const k = idx(r, c);
        if (board[k]) clearing.push({ r, c, color: board[k] - 1, t0: time + Math.hypot(r - 3.5, c - 3.5) * 0.05 });
        board[k] = 0;
      }
    }
    shake = 0.8;
    Sound.clear(4, 3);
    banner = { t0: time, title: 'Second chance!', sub: 'Keep going' };
    deal();
    pendingOverCheck = time + 0.8;
    snapshot();
  }

  function restart() {
    YT.interstitial().then(newGame);
  }

  // --- tutorial ---------------------------------------------------------------------
  function startTutorial() {
    // pick the first tray piece and a spot for it near the middle of the board
    const p = tray[0];
    if (!p) return;
    tutorial = { piece: 0, r: Math.max(0, 4 - Math.ceil(p.shape.h / 2)), c: Math.max(0, 4 - Math.ceil(p.shape.w / 2)), t0: time };
  }
  function dismissTutorial() {
    if (!tutorial) return;
    tutorial = null;
    save.tutorial = true;
    persist(false);
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  let buttons = []; // rebuilt every frame: {x,y,w,h,id,action}
  let pressed = null;

  function slotPieceRect(i) {
    const s = L.slots[i];
    const p = tray[i];
    if (!p) return null;
    const sc = L.cell * L.trayScale;
    const w = p.shape.w * sc, h = p.shape.h * sc;
    return { x: s.x + (s.w - w) / 2, y: s.y + (s.h - h) / 2, w, h, sc };
  }

  function pointerPos(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    Sound.init();
    Sound.resume();
    const p = pointerPos(ev);
    try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
    const b = hitButton(p);
    if (b) { pressed = b.id; b.pressT = time; return; }
    if (scene !== 'play' || menuOpen || paused) return;
    for (let i = 0; i < 3; i++) {
      if (!tray[i]) continue;
      const s = L.slots[i];
      if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) {
        const pr = slotPieceRect(i);
        drag = {
          i, piece: tray[i], x: p.x, y: p.y, t0: time,
          from: { x: pr.x + pr.w / 2, y: pr.y + pr.h / 2 },
          // lift the piece above a finger so it isn't hidden; mice need less
          lift: ev.pointerType === 'mouse' ? L.cell * 0.4 : L.cell * 1.7,
          target: null, returning: false,
        };
        Sound.pick();
        buzz(5);
        return;
      }
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!drag || drag.returning) return;
    const p = pointerPos(ev);
    drag.x = p.x;
    drag.y = p.y;
    updateTarget();
  });
  const endPointer = (ev) => {
    const p = pointerPos(ev);
    if (pressed) {
      const b = hitButton(p);
      const id = pressed;
      pressed = null;
      if (b && b.id === id) { Sound.click(); b.action(); }
      return;
    }
    if (!drag || drag.returning) return;
    updateTarget();
    if (drag.target) {
      place(drag.i, drag.target.r, drag.target.c);
      drag = null;
    } else {
      // fly back to the tray
      const pos = dragPiecePos();
      drag.returning = true;
      drag.rx = pos.x; drag.ry = pos.y; drag.rt = time;
      if (pos.overBoard) Sound.bad();
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function hitButton(p) {
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }

  /** Centre of the dragged piece in CSS px. */
  function dragPiecePos() {
    const x = drag.x, y = drag.y - drag.lift;
    return { x, y, overBoard: x > L.bx && x < L.bx + L.size && y > L.by && y < L.by + L.size };
  }
  function updateTarget() {
    const { x, y } = dragPiecePos();
    const s = drag.piece.shape;
    const c = Math.round((x - (s.w * L.cell) / 2 - L.bx) / L.cell);
    const r = Math.round((y - (s.h * L.cell) / 2 - L.by) / L.cell);
    drag.target = canPlace(drag.piece, r, c) ? { r, c, lines: linesAfter(drag.piece, r, c) } : null;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  function update(dt) {
    time += dt;
    sceneT += dt;
    for (const b of bg) { b.y -= b.v * dt * 6; b.r += dt * 0.2; if (b.y < -0.1) { b.y = 1.1; b.x = Math.random(); } }
    shownScore += (score - shownScore) * Math.min(1, dt * 10);
    if (Math.abs(score - shownScore) < 0.5) shownScore = score;
    shake = Math.max(0, shake - dt * 2.2);

    for (const cl of clearing) {
      if (!cl.burst && time >= cl.t0) {
        cl.burst = true;
        const cx = L.bx + (cl.c + 0.5) * L.cell, cy = L.by + (cl.r + 0.5) * L.cell;
        for (let k = 0; k < 7; k++) {
          const a = rand(0, Math.PI * 2), sp = rand(60, 320);
          particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: rand(0.45, 0.9), max: 0.9, size: rand(L.cell * 0.08, L.cell * 0.2), color: COLORS[cl.color], rot: rand(0, 6), vr: rand(-8, 8) });
        }
        particles.push({ x: cx, y: cy, vx: 0, vy: 0, life: 0.35, max: 0.35, ring: true, size: L.cell * 0.5, color: '#fff' });
      }
    }
    clearing = clearing.filter((cl) => time - cl.t0 < 0.45);
    for (const p of particles) {
      p.life -= dt;
      if (p.ring) continue;
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    particles = particles.filter((p) => p.life > 0);
    floaters = floaters.filter((f) => time - f.t0 < 1.2);
    if (banner && time - banner.t0 > 1.6) banner = null;
    if (drag && drag.returning && time - drag.rt > 0.22) drag = null;

    if (scene === 'play' && pendingOverCheck && time >= pendingOverCheck && !clearing.length) {
      pendingOverCheck = 0;
      checkGameOver();
    }
    if (scene === 'over' && overT >= 0) overT = Math.min(1, overT + dt * 0.9);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function text(str, x, y, size, color, opts) {
    opts = opts || {};
    ctx.font = (opts.weight || 900) + ' ' + size + 'px ' + FONT;
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = 'middle';
    if (opts.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = opts.stroke;
      ctx.strokeStyle = opts.strokeColor || 'rgba(10,12,40,0.9)';
      ctx.strokeText(str, x, y);
    }
    if (opts.shadow) {
      ctx.fillStyle = opts.shadow;
      ctx.fillText(str, x, y + size * 0.08);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function block(color, x, y, size, alpha) {
    const spr = sprites[color] || sprites[COLORS[0]];
    const g = Math.max(1, L.cell * 0.03) * (size / L.cell);
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(spr, x + g, y + g, size - g * 2, size - g * 2);
    if (alpha !== undefined) ctx.globalAlpha = 1;
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, '#2a1b6e');
    g.addColorStop(0.55, '#141a52');
    g.addColorStop(1, '#0b0f33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const m = Math.min(W, H);
    for (const b of bg) {
      const s = b.s * m;
      ctx.save();
      ctx.translate(b.x * W, b.y * H);
      ctx.rotate(b.r);
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = b.c;
      rrect(-s / 2, -s / 2, s, s, s * 0.22);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const v = ctx.createRadialGradient(W / 2, H / 2, m * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBoard() {
    const { bx, by, size, cell } = L;
    const pad = cell * 0.18;
    // panel
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = cell * 0.6;
    ctx.shadowOffsetY = cell * 0.15;
    rrect(bx - pad, by - pad, size + pad * 2, size + pad * 2, cell * 0.35);
    ctx.fillStyle = '#1d2466';
    ctx.fill();
    ctx.restore();
    rrect(bx - pad * 0.45, by - pad * 0.45, size + pad * 0.9, size + pad * 0.9, cell * 0.25);
    ctx.fillStyle = '#0e1342';
    ctx.fill();
    // slots
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const x = bx + c * cell, y = by + r * cell;
        rrect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.16);
        ctx.fillStyle = (r + c) % 2 ? '#161c55' : '#181f5c';
        ctx.fill();
      }
    }
  }

  function drawCells() {
    const { bx, by, cell } = L;
    const hl = drag && drag.target ? drag.target.lines : null;
    const hlColor = drag ? COLORS[drag.piece.color] : null;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = board[idx(r, c)];
        if (!v) continue;
        let color = COLORS[v - 1];
        // game over sweep greys the board out cell by cell
        if (overT >= 0 && (r + c) / (2 * N - 2) <= overT * 1.4) color = '#8a90b8';
        // lines about to clear preview in the dragged piece's colour
        if (hl && (hl.rows.includes(r) || hl.cols.includes(c))) color = hlColor;
        let s = cell;
        const pt = placedAt[idx(r, c)];
        if (pt >= 0 && time - pt < 0.25) s = cell * (1 + 0.18 * Math.sin(((time - pt) / 0.25) * Math.PI));
        const off = (s - cell) / 2;
        block(color, bx + c * cell - off, by + r * cell - off, s);
      }
    }
    if (hl) {
      // glow over the lines that will clear
      const pulse = 0.25 + Math.sin(time * 10) * 0.12;
      ctx.fillStyle = 'rgba(255,255,255,' + pulse + ')';
      hl.rows.forEach((r) => { rrect(bx, by + r * cell, cell * N, cell, cell * 0.2); ctx.fill(); });
      hl.cols.forEach((c) => { rrect(bx + c * cell, by, cell, cell * N, cell * 0.2); ctx.fill(); });
    }
    // clearing cells: flash, spin and shrink away
    for (const cl of clearing) {
      const t = (time - cl.t0) / 0.45;
      const x = bx + (cl.c + 0.5) * cell, y = by + (cl.r + 0.5) * cell;
      if (t < 0) { block(COLORS[cl.color], x - cell / 2, y - cell / 2, cell); continue; }
      const s = cell * (1 - easeInCubic(t)) * (1 + 0.25 * Math.sin(Math.min(1, t * 3) * Math.PI));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 1.2);
      block(COLORS[cl.color], -s / 2, -s / 2, s, 1 - t * 0.4);
      if (t < 0.35) {
        ctx.globalAlpha = (0.35 - t) / 0.35 * 0.9;
        ctx.fillStyle = '#fff';
        rrect(-s / 2, -s / 2, s, s, s * 0.2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  function drawPiece(piece, cx, cy, cellSize, alpha, ghostColor) {
    const s = piece.shape;
    const x0 = cx - (s.w * cellSize) / 2, y0 = cy - (s.h * cellSize) / 2;
    for (const [r, c] of s.cells) {
      if (ghostColor) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = ghostColor;
        rrect(x0 + c * cellSize + cellSize * 0.08, y0 + r * cellSize + cellSize * 0.08, cellSize * 0.84, cellSize * 0.84, cellSize * 0.18);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else block(COLORS[piece.color], x0 + c * cellSize, y0 + r * cellSize, cellSize, alpha);
    }
  }

  function drawTray() {
    for (let i = 0; i < 3; i++) {
      const p = tray[i];
      if (!p || (drag && drag.i === i)) continue;
      const pr = slotPieceRect(i);
      const k = clamp((time - trayDealtAt - i * 0.07) / 0.35, 0, 1);
      const e = easeOutBack(k);
      const fits = scene !== 'play' || fitsAnywhere(p);
      const dx = (1 - e) * (L.portrait ? W * 0.4 : 0), dy = (1 - e) * (L.portrait ? 0 : H * 0.3);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(pr.x + pr.w / 2 + dx, pr.y + pr.h / 2 + dy);
      const bob = tutorial && tutorial.piece === i ? 1 + Math.sin(time * 6) * 0.04 : 1;
      ctx.scale(bob, bob);
      drawPiece(p, 0, 0, pr.sc, fits ? 1 : 0.35);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawDrag() {
    if (!drag) return;
    const s = drag.piece.shape;
    if (drag.returning) {
      const k = easeOutCubic(clamp((time - drag.rt) / 0.22, 0, 1));
      const pr = slotPieceRect(drag.i);
      if (!pr) return;
      const x = lerp(drag.rx, pr.x + pr.w / 2, k), y = lerp(drag.ry, pr.y + pr.h / 2, k);
      drawPiece(drag.piece, x, y, lerp(L.cell, pr.sc, k));
      return;
    }
    // ghost on the board
    if (drag.target) {
      const gx = L.bx + (drag.target.c + s.w / 2) * L.cell, gy = L.by + (drag.target.r + s.h / 2) * L.cell;
      drawPiece(drag.piece, gx, gy, L.cell, 0.42);
    }
    const k = easeOutBack(clamp((time - drag.t0) / 0.14, 0, 1));
    const pos = dragPiecePos();
    const size = lerp(L.cell * L.trayScale, L.cell, k);
    const x = lerp(drag.from.x, pos.x, k), y = lerp(drag.from.y, pos.y, k);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = L.cell * 0.5;
    ctx.shadowOffsetY = L.cell * 0.25;
    drawPiece(drag.piece, x, y, size * 1.04);
    ctx.restore();
  }

  function drawEffects() {
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.ring) {
        ctx.strokeStyle = 'rgba(255,255,255,' + a * 0.8 + ')';
        ctx.lineWidth = L.cell * 0.08 * a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (1 - a) * 1.6), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      rrect(-p.size / 2, -p.size / 2, p.size, p.size, p.size * 0.25);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (const f of floaters) {
      const t = (time - f.t0) / 1.2;
      if (t < 0) continue;
      const a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.globalAlpha = clamp(a, 0, 1);
      const s = f.size * (t < 0.15 ? easeOutBack(t / 0.15) : 1);
      text(f.text, f.x, f.y - t * L.cell * 1.2, s, f.color, { stroke: s * 0.18 });
    }
    ctx.globalAlpha = 1;
    if (banner) {
      const t = (time - banner.t0) / 1.6;
      const inK = easeOutBack(clamp(t / 0.22, 0, 1));
      const out = t > 0.8 ? (t - 0.8) / 0.2 : 0;
      const cx = L.bx + L.size / 2, cy = L.by + L.size * 0.42;
      ctx.save();
      ctx.globalAlpha = 1 - out;
      ctx.translate(cx, cy - out * L.cell);
      ctx.scale(inK, inK);
      const size = Math.min(L.cell * 1.15, L.size / 7);
      const grad = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
      grad.addColorStop(0, '#fff7ae');
      grad.addColorStop(1, '#ffb703');
      text(banner.title, 0, 0, size, grad, { stroke: size * 0.2, strokeColor: '#5a1a8a' });
      text(banner.sub, 0, size * 0.85, size * 0.42, '#ffffff', { stroke: size * 0.12, strokeColor: '#2b1460', weight: 800 });
      ctx.restore();
    }
  }

  function drawHUD() {
    const sz = Math.min(L.cell * 1.05, 64);
    const pulse = score !== Math.round(shownScore) ? 1.06 : 1;
    ctx.save();
    ctx.translate(L.scoreX, L.scoreY);
    ctx.scale(pulse, pulse);
    text(String(Math.round(shownScore)), 0, 0, sz, '#ffffff', { shadow: 'rgba(0,0,0,0.35)' });
    ctx.restore();
    const best = Math.max(save.best, score);
    text('👑 ' + best, L.scoreX, L.scoreY - sz * 0.95, sz * 0.36, '#ffd60a', { weight: 800 });
    if (combo >= 2) {
      text('Combo ×' + combo, L.scoreX, L.scoreY + sz * 0.8, sz * 0.32, '#7cf5ff', { weight: 800 });
    }
    // menu + sound buttons
    const b = L.btn, m = 12;
    iconButton('menu', m, m, b, '❚❚', () => { menuOpen = true; });
    iconButton('sound', W - m - b, m, b, save.sound ? '🔊' : '🔇', toggleSound);
  }

  function toggleSound() {
    save.sound = !save.sound;
    persist(false);
  }

  function iconButton(id, x, y, s, glyph, action) {
    const isDown = pressed === id;
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    if (isDown) ctx.scale(0.92, 0.92);
    rrect(-s / 2, -s / 2, s, s, s * 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(glyph, 0, 1, s * 0.42, '#fff', { weight: 800 });
    ctx.restore();
    buttons.push({ id, x, y, w: s, h: s, action });
  }

  function button(id, cx, cy, w, h, label, style, action) {
    const isDown = pressed === id;
    const colors = {
      primary: ['#ff7a59', '#ff3d6e', '#b8164a'],
      green: ['#4ef0a0', '#16c172', '#0a7a47'],
      gold: ['#ffe066', '#ffb703', '#a86b00'],
      ghost: ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.25)'],
    }[style || 'primary'];
    const breathe = style === 'primary' && !isDown ? 1 + Math.sin(time * 4) * 0.025 : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(isDown ? 0.95 : breathe, isDown ? 0.95 : breathe);
    rrect(-w / 2, -h / 2 + h * 0.08, w, h, h * 0.42);
    ctx.fillStyle = colors[2];
    ctx.fill();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    rrect(-w / 2, -h / 2, w, h * 0.96, h * 0.42);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 0.35;
    rrect(-w / 2 + h * 0.2, -h / 2 + h * 0.1, w - h * 0.4, h * 0.3, h * 0.15);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.globalAlpha = 1;
    text(label, 0, 0, h * 0.4, '#fff', { stroke: h * 0.06, strokeColor: 'rgba(0,0,0,0.25)' });
    ctx.restore();
    buttons.push({ id, x: cx - w / 2, y: cy - h / 2, w, h, action });
  }

  function drawLogo(cx, cy, size) {
    // "BLOCK" as glossy candy tiles, "BURST" as gradient text
    const word = 'BLOCK';
    const tile = size * 0.95;
    const total = tile * word.length;
    for (let i = 0; i < word.length; i++) {
      const bounce = Math.sin(time * 3 + i * 0.7) * tile * 0.06;
      const x = cx - total / 2 + i * tile, y = cy - tile / 2 + bounce;
      block(COLORS[[0, 1, 2, 3, 4][i]], x, y, tile);
      text(word[i], x + tile / 2, y + tile * 0.52, tile * 0.55, '#fff', { stroke: tile * 0.08, strokeColor: 'rgba(0,0,0,0.25)' });
    }
    const g = ctx.createLinearGradient(0, cy + tile * 0.6, 0, cy + tile * 1.6);
    g.addColorStop(0, '#fff7ae');
    g.addColorStop(1, '#ff9f1c');
    text('BURST', cx, cy + tile * 1.15, tile * 1.05, g, { stroke: tile * 0.18, strokeColor: '#5a1a8a' });
  }

  function drawTitle() {
    const m = Math.min(W, H);
    const cx = W / 2;
    const logoSize = Math.min(W / 6.2, H / 9, 96);
    drawLogo(cx, H * 0.25, logoSize);
    // preview pieces dancing
    const demo = [[SHAPES[9], 4], [SHAPES[21], 6], [SHAPES[17], 0]];
    demo.forEach(([s, col], i) => {
      const x = cx + (i - 1) * m * 0.26, y = H * 0.5 + Math.sin(time * 2 + i) * m * 0.015;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(time * 1.5 + i) * 0.08);
      drawPiece({ shape: s, color: col }, 0, 0, m * 0.055);
      ctx.restore();
    });
    const bw = Math.min(W * 0.7, 320), bh = Math.min(70, H * 0.09);
    let y = H * 0.68;
    if (save.game) {
      button('continue', cx, y, bw, bh, 'Continue', 'primary', () => resumeGame(save.game));
      y += bh * 1.3;
      button('new', cx, y, bw, bh * 0.85, 'New game', 'ghost', newGame);
    } else {
      button('play', cx, y, bw, bh, 'Play', 'primary', newGame);
    }
    if (save.best) text('Best  ' + save.best, cx, Math.min(H - 30, y + bh * 1.2), Math.min(22, m * 0.045), '#ffd60a', { weight: 800 });
    iconButton('sound', W - 12 - L.btn, 12, L.btn, save.sound ? '🔊' : '🔇', toggleSound);
  }

  function drawOverPanel() {
    const t = clamp((time - overPanelAt) / 0.35, 0, 1);
    if (t <= 0) {
      text('No more space!', L.bx + L.size / 2, L.by + L.size / 2, Math.min(L.cell * 0.8, 44), '#fff', { stroke: 8, strokeColor: '#3a0f5c' });
      return;
    }
    ctx.fillStyle = 'rgba(5,6,25,' + 0.65 * t + ')';
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.86, 380), ph = Math.min(H * 0.7, 440);
    const cx = W / 2, cy = H / 2;
    const k = easeOutBack(t);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    const g = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
    g.addColorStop(0, '#3b2a9a');
    g.addColorStop(1, '#1d1d63');
    rrect(-pw / 2, -ph / 2, pw, ph, 28);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const isBest = overBest;
    text(isBest ? 'New Best!' : 'Game Over', 0, -ph * 0.36, Math.min(40, pw * 0.11), isBest ? '#ffd60a' : '#fff', { stroke: 7, strokeColor: '#2b1460' });
    text('SCORE', 0, -ph * 0.2, 15, 'rgba(255,255,255,0.65)', { weight: 800 });
    text(String(score), 0, -ph * 0.09, Math.min(64, pw * 0.17), '#fff', { shadow: 'rgba(0,0,0,0.35)' });
    text('👑 Best ' + save.best, 0, ph * 0.03, 18, '#ffd60a', { weight: 800 });
    ctx.restore();
    if (t >= 1) {
      const bw = pw * 0.78, bh = Math.min(58, ph * 0.14);
      let y = cy + ph * 0.12;
      if (!revived) {
        button('revive', cx, y, bw, bh, '▶ Second chance', 'gold', revive);
        y += bh * 1.18;
      }
      button('again', cx, y, bw, bh, 'Play again', revived ? 'primary' : 'green', restart);
      y += bh * 1.1;
      button('home', cx, y, bw * 0.6, bh * 0.75, 'Home', 'ghost', () => { scene = 'title'; sceneT = 0; });
    }
  }

  function drawMenu() {
    ctx.fillStyle = 'rgba(5,6,25,0.7)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    text('Paused', cx, cy - 140, 42, '#fff', { stroke: 8, strokeColor: '#2b1460' });
    const bw = Math.min(W * 0.7, 300), bh = 58;
    button('resume', cx, cy - 50, bw, bh, 'Resume', 'green', () => { menuOpen = false; });
    button('restart', cx, cy + 25, bw, bh, 'Restart', 'primary', () => { save.game = null; restart(); });
    button('sound2', cx, cy + 100, bw, bh * 0.85, save.sound ? 'Sound: on' : 'Sound: off', 'ghost', toggleSound);
    button('home2', cx, cy + 165, bw * 0.6, bh * 0.75, 'Home', 'ghost', () => { menuOpen = false; snapshot(); scene = 'title'; });
  }

  function drawTutorial() {
    if (!tutorial || scene !== 'play' || drag || menuOpen) return;
    const p = tray[tutorial.piece];
    if (!p) { tutorial = null; return; }
    const pr = slotPieceRect(tutorial.piece);
    const from = { x: pr.x + pr.w / 2, y: pr.y + pr.h / 2 };
    const to = { x: L.bx + (tutorial.c + p.shape.w / 2) * L.cell, y: L.by + (tutorial.r + p.shape.h / 2) * L.cell };
    const cyc = ((time - tutorial.t0) % 2.2) / 2.2;
    const k = cyc < 0.15 ? 0 : cyc > 0.8 ? 1 : easeOutCubic((cyc - 0.15) / 0.65);
    const x = lerp(from.x, to.x, k), y = lerp(from.y, to.y, k);
    ctx.globalAlpha = 0.5 * Math.min(1, k * 4);
    drawPiece(p, to.x, to.y, L.cell, 0.35, '#ffffff');
    ctx.globalAlpha = cyc > 0.9 ? (1 - cyc) * 10 : 1;
    text('👆', x + L.cell * 0.4, y + L.cell * 0.7, L.cell * 1.1, '#fff');
    ctx.globalAlpha = 1;
    text('Drag a piece onto the board', W / 2, L.portrait ? L.by - L.cell * 0.55 : L.by - 18, Math.min(20, W * 0.045), '#fff', { weight: 800, stroke: 5 });
  }

  function render() {
    buttons = [];
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground();
    if (scene === 'title') {
      drawTitle();
      return;
    }
    ctx.save();
    if (shake > 0) ctx.translate(rand(-1, 1) * shake * L.cell * 0.18, rand(-1, 1) * shake * L.cell * 0.18);
    drawBoard();
    drawCells();
    drawTray();
    drawEffects();
    drawDrag();
    ctx.restore();
    drawHUD();
    drawTutorial();
    if (scene === 'over') drawOverPanel();
    if (menuOpen) drawMenu();
  }

  // ---------------------------------------------------------------------------
  // Loop, pause, boot
  // ---------------------------------------------------------------------------
  let last = performance.now();
  let firstFrame = true;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) update(dt);
    render();
    if (firstFrame) { firstFrame = false; YT.firstFrameReady(); }
    requestAnimationFrame(frame);
  }

  YT.onPause(() => {
    paused = true;
    Sound.suspend();
    if (drag && !drag.returning) drag = null;
    if (scene === 'play') snapshot();
  });
  YT.onResume(() => {
    paused = false;
    last = performance.now();
    Sound.resume();
  });

  window.addEventListener('resize', resize);
  resize();

  // Read-only hook for the automated smoke test (layout + state summary).
  window.__blockBurst = {
    info: () => ({
      scene, score, layout: { bx: L.bx, by: L.by, cell: L.cell, slots: L.slots },
      tray: tray.map((p, i) => (p ? { i, w: p.shape.w, h: p.shape.h, rect: slotPieceRect(i) } : null)),
      board: board.slice(),
    }),
  };

  (async function boot() {
    YT.init('block-burst');
    const data = await YT.load();
    save = Object.assign(save, data || {});
    requestAnimationFrame(frame);
    // ready once the title screen has painted and accepts input
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    YT.gameReady();
  })();
})();
