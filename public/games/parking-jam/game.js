/*
 * Parking Jam Escape — every car can only drive forward (the way its
 * headlights point). Tap a car to drive it; if anything is in the way it
 * bumps. Clear the lot with fewer than 3 bumps. Levels are generated and
 * checked so that a full clearing order always exists.
 */
(function () {
  'use strict';
  const { sfx } = Kit;
  const W = 540, H = 960;
  const BOARD = 500;
  const DIRS = { R: [1, 0], L: [-1, 0], U: [0, -1], D: [0, 1] };
  const CAR_COLORS = ['#ff4d5e', '#3d8bff', '#ffd23f', '#2ecc71', '#b45cff', '#ff8f2b', '#21d4d4', '#ff6fd1', '#f0f0f5'];
  const MAX_BUMPS = 3;

  let save = { level: 0, stars: {} };
  let G = null;

  const st = Kit.stage(W, H, { letterbox: '#20232e' });
  const hud = Kit.hud(
    [{ id: 'lvl', label: 'Level', value: 1 }, { id: 'cars', label: 'Cars', value: 0 }, { id: 'bumps', label: 'Bumps', value: '0/3' }],
    [
      { id: 'hint', label: 'Hint', title: 'Watch an ad to see a free car', onClick: hint },
      { id: 'retry', label: '↻', title: 'Restart', onClick: () => startLevel(save.level) },
    ]
  );
  hud.btn('hint').classList.add('ad');

  // --- generation -------------------------------------------------------------
  function cellsOf(c) {
    const horiz = c.dir === 'R' || c.dir === 'L';
    const out = [];
    for (let i = 0; i < c.len; i++) out.push(horiz ? [c.x + i, c.y] : [c.x, c.y + i]);
    return out;
  }
  function frontCell(c) {
    if (c.dir === 'R') return [c.x + c.len - 1, c.y];
    if (c.dir === 'D') return [c.x, c.y + c.len - 1];
    return [c.x, c.y];
  }
  /** Number of free cells ahead of the car, and whether the path reaches the edge. */
  function pathInfo(c, grid, size) {
    const [dx, dy] = DIRS[c.dir];
    let [x, y] = frontCell(c);
    let free = 0;
    for (;;) {
      x += dx; y += dy;
      if (x < 0 || y < 0 || x >= size || y >= size) return { clear: true, free };
      if (grid[y][x] !== null) return { clear: false, free };
      free++;
    }
  }
  function buildGrid(cars, size) {
    const g = Array.from({ length: size }, () => Array(size).fill(null));
    cars.forEach((c) => cellsOf(c).forEach(([x, y]) => (g[y][x] = c.id)));
    return g;
  }
  function stuckAfterGreedy(cars, size) {
    let left = cars.slice();
    let progress = true;
    while (progress && left.length) {
      progress = false;
      const g = buildGrid(left, size);
      for (const c of left) {
        if (pathInfo(c, g, size).clear) {
          left = left.filter((q) => q !== c);
          progress = true;
          break;
        }
      }
    }
    return left;
  }

  function genLevel(n) {
    const size = n < 4 ? 5 : n < 12 ? 6 : n < 25 ? 7 : 8;
    const rng = Kit.seeded(n * 31337 + 99);
    const target = Math.floor(size * size * Math.min(0.78, 0.55 + n * 0.012));
    let best = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      let cars = [];
      let id = 0;
      const occ = Array.from({ length: size }, () => Array(size).fill(false));
      let filled = 0;
      for (let tries = 0; tries < 400 && filled < target; tries++) {
        const dir = 'RLUD'[Math.floor(rng() * 4)];
        const len = rng() < 0.75 ? 2 : 3;
        const horiz = dir === 'R' || dir === 'L';
        const x = Math.floor(rng() * (horiz ? size - len + 1 : size));
        const y = Math.floor(rng() * (horiz ? size : size - len + 1));
        const c = { id: id, x, y, len, dir };
        const cells = cellsOf(c);
        if (cells.some(([cx, cy]) => occ[cy][cx])) continue;
        cells.forEach(([cx, cy]) => (occ[cy][cx] = true));
        cars.push(c);
        id++;
        filled += len;
      }
      let stuck = stuckAfterGreedy(cars, size);
      while (stuck.length) {
        const drop = stuck[Math.floor(rng() * stuck.length)];
        cars = cars.filter((c) => c !== drop);
        stuck = stuckAfterGreedy(cars, size);
      }
      // prefer layouts where few cars are free at the start (harder to read)
      const g = buildGrid(cars, size);
      const freeNow = cars.filter((c) => pathInfo(c, g, size).clear).length;
      const score = cars.length * 2 - freeNow;
      if (!best || score > best.score) best = { cars, score };
    }
    best.cars.forEach((c, i) => {
      c.color = CAR_COLORS[i % CAR_COLORS.length];
      c.bump = 0;
    });
    return { size, cars: best.cars };
  }

  function startLevel(n) {
    const lv = genLevel(n);
    G = { n, size: lv.size, cars: lv.cars, leaving: [], bumps: 0, over: false, hintId: -1 };
    G.cell = BOARD / G.size;
    G.ox = (W - BOARD) / 2;
    G.oy = 250;
    refresh();
    hud.set('lvl', n + 1);
  }
  function refresh() {
    G.grid = buildGrid(G.cars, G.size);
    hud.set('cars', G.cars.length);
    hud.set('bumps', G.bumps + '/' + MAX_BUMPS);
  }

  function carAt(p) {
    const gx = Math.floor((p.x - G.ox) / G.cell);
    const gy = Math.floor((p.y - G.oy) / G.cell);
    if (gx < 0 || gy < 0 || gx >= G.size || gy >= G.size) return null;
    const id = G.grid[gy][gx];
    return id === null ? null : G.cars.find((c) => c.id === id);
  }

  st.on('down', (p) => {
    if (!G || G.over) return;
    const c = carAt(p);
    if (!c || c.bump > 0) return;
    const info = pathInfo(c, G.grid, G.size);
    if (info.clear) {
      G.cars = G.cars.filter((q) => q !== c);
      G.leaving.push({ car: c, d: 0, v: 0 });
      if (G.hintId === c.id) G.hintId = -1;
      refresh();
      Kit.audio.blip(300, 0.25, 'sawtooth', 0.06, 2.5);
      if (!G.cars.length) win();
    } else {
      c.bump = 1;
      c.bumpDist = info.free;
      G.bumps++;
      refresh();
      sfx.thud();
      if (G.bumps >= MAX_BUMPS) lose();
    }
  });

  function hint() {
    if (!G || G.over || !G.cars.length) return;
    YT.rewarded('hint').then((ok) => {
      if (!ok || !G) return;
      const free = G.cars.find((c) => pathInfo(c, G.grid, G.size).clear);
      if (free) { G.hintId = free.id; Kit.toast('Try the glowing car'); }
    });
  }

  function stars() { return G.bumps === 0 ? 3 : G.bumps === 1 ? 2 : 1; }

  function win() {
    G.over = true;
    const n = G.n, s = stars();
    save.stars[n] = Math.max(save.stars[n] || 0, s);
    save.level = Math.max(save.level, n + 1);
    YT.save(save);
    YT.sendScore(Object.values(save.stars).reduce((a, b) => a + b, 0));
    sfx.win();
    setTimeout(() => {
      Kit.panel({
        title: 'Lot cleared! 🚗',
        body: '<div class="stars">' + '★'.repeat(s) + '<span class="off">' + '★'.repeat(3 - s) + '</span></div><p>' + G.bumps + ' bump' + (G.bumps === 1 ? '' : 's') + '</p>',
        buttons: [{
          label: 'Next level', cls: 'primary',
          onClick: () => (n % 3 === 2 ? YT.interstitial() : Promise.resolve()).then(() => startLevel(n + 1)),
        }],
      });
    }, 600);
  }

  function lose() {
    G.over = true;
    sfx.lose();
    setTimeout(() => {
      Kit.panel({
        title: 'Too many bumps!',
        body: '<p>Look at the headlights: cars only drive forward.</p>',
        buttons: [
          {
            label: 'Keep going (+1 bump)', cls: 'ad', onClick: () => {
              YT.rewarded('continue').then((ok) => {
                if (ok && G) { G.bumps = MAX_BUMPS - 1; G.over = false; refresh(); }
                else startLevel(save.level);
              });
            },
          },
          { label: 'Restart', cls: 'primary', onClick: () => startLevel(G.n) },
        ],
      });
    }, 500);
  }

  function update(dt) {
    if (!G) return;
    for (const c of G.cars) {
      if (c.bump > 0) c.bump = Math.max(0, c.bump - dt * 2.2);
    }
    for (const l of G.leaving) { l.v += dt * 2400; l.d += l.v * dt; }
    G.leaving = G.leaving.filter((l) => l.d < 900);
  }

  // --- render -----------------------------------------------------------------
  const ctx = st.ctx;
  function drawCar(c, offset, glow) {
    const cs = G.cell;
    const horiz = c.dir === 'R' || c.dir === 'L';
    const [dx, dy] = DIRS[c.dir];
    const x = G.ox + c.x * cs + dx * offset;
    const y = G.oy + c.y * cs + dy * offset;
    const w = horiz ? c.len * cs : cs;
    const h = horiz ? cs : c.len * cs;
    const pad = cs * 0.1;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    const ang = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 }[c.dir];
    ctx.rotate(ang);
    const L = c.len * cs - pad * 2;
    const T = cs - pad * 2;
    if (glow) {
      ctx.shadowColor = '#ffd84d';
      ctx.shadowBlur = 24;
    }
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    Kit.roundRect(ctx, -L / 2 + 3, -T / 2 + 5, L, T, T * 0.3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = c.color;
    Kit.roundRect(ctx, -L / 2, -T / 2, L, T, T * 0.3);
    ctx.fill();
    // windshield + roof
    ctx.fillStyle = 'rgba(20,30,50,.75)';
    Kit.roundRect(ctx, L / 2 - T * 0.95, -T * 0.36, T * 0.32, T * 0.72, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    Kit.roundRect(ctx, -L / 2 + T * 0.3, -T * 0.3, L - T * 1.4, T * 0.6, 6);
    ctx.fill();
    // headlights
    ctx.fillStyle = '#fff6b0';
    ctx.beginPath();
    ctx.arc(L / 2 - 5, -T * 0.3, 4, 0, Math.PI * 2);
    ctx.arc(L / 2 - 5, T * 0.3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,246,176,.25)';
    ctx.beginPath();
    ctx.moveTo(L / 2, -T * 0.4);
    ctx.lineTo(L / 2 + cs * 0.35, -T * 0.5);
    ctx.lineTo(L / 2 + cs * 0.35, T * 0.5);
    ctx.lineTo(L / 2, T * 0.4);
    ctx.fill();
    ctx.restore();
  }

  function render() {
    st.begin();
    ctx.fillStyle = '#2c3140';
    ctx.fillRect(0, 0, W, H);
    if (!G) { st.end(); return; }
    Kit.text(ctx, 'Tap cars to drive them out', W / 2, 150, 26, 'rgba(255,255,255,.9)');
    Kit.text(ctx, 'They can only go forward ➜', W / 2, 190, 18, 'rgba(255,255,255,.55)', 'center', '600');
    // lot
    ctx.fillStyle = '#454b5e';
    Kit.roundRect(ctx, G.ox - 14, G.oy - 14, BOARD + 28, BOARD + 28, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= G.size; i++) {
      ctx.beginPath();
      ctx.moveTo(G.ox + i * G.cell, G.oy);
      ctx.lineTo(G.ox + i * G.cell, G.oy + BOARD);
      ctx.moveTo(G.ox, G.oy + i * G.cell);
      ctx.lineTo(G.ox + BOARD, G.oy + i * G.cell);
      ctx.stroke();
    }
    for (const c of G.cars) {
      const off = c.bump > 0 ? Math.sin((1 - c.bump) * Math.PI) * (c.bumpDist * G.cell + G.cell * 0.18) : 0;
      drawCar(c, off, c.id === G.hintId);
    }
    for (const l of G.leaving) drawCar(l.car, l.d, false);
    st.end();
  }

  Kit.boot('parking-jam', (data) => {
    save = Object.assign({ level: 0, stars: {} }, data);
    startLevel(save.level);
    Kit.loop(update, render);
  });
})();
