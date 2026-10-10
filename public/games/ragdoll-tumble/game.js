/*
 * Ragdoll Tumble — drag from the ragdoll to aim, release to shove it down the
 * giant staircase. Every hard hit scores damage; bumpers and spikes score
 * more. Spend coins on push power and bonus multipliers.
 */
(function () {
  'use strict';
  const { clamp, sfx } = Kit;
  const W = 540, H = 960;
  const GRAV = 1500;
  const STEP = 1 / 120;
  const SW = 110, SH = 70, STEPS = 45;
  const TOP = 400;

  const UPGRADES = [
    { id: 'power', name: 'Push power', icon: '💪' },
    { id: 'combo', name: 'Damage bonus', icon: '💥' },
    { id: 'bumpers', name: 'More bumpers', icon: '🔴' },
  ];
  const MAX_LVL = 10;
  const cost = (l) => Math.round(30 * Math.pow(1.6, l));

  let save = { coins: 0, best: 0, runs: 0, up: { power: 0, combo: 0, bumpers: 0 } };
  let R = null;
  const st = Kit.stage(W, H, { letterbox: '#1a1424' });
  const ctx = st.ctx;
  const hud = Kit.hud(
    [{ id: 'coins', label: 'Coins', value: 0 }, { id: 'dmg', label: 'Damage', value: 0 }, { id: 'best', label: 'Best', value: 0 }],
    []
  );

  // --- ragdoll ------------------------------------------------------------------
  function makeRagdoll(x, y) {
    const P = (name, dx, dy, r) => ({ name, x: x + dx, y: y + dy, px: x + dx, py: y + dy, r: r || 7 });
    const pts = [
      P('head', 0, -78, 15), P('neck', 0, -58), P('chest', 0, -40), P('pelvis', 0, -8),
      P('lelbow', -18, -40), P('lhand', -28, -20), P('relbow', 18, -40), P('rhand', 28, -20),
      P('lknee', -9, 18), P('lfoot', -11, 44), P('rknee', 9, 18), P('rfoot', 11, 44),
    ];
    const idx = Object.fromEntries(pts.map((p, i) => [p.name, i]));
    const link = (a, b, vis) => ({ a: idx[a], b: idx[b], len: Math.hypot(pts[idx[a]].x - pts[idx[b]].x, pts[idx[a]].y - pts[idx[b]].y), vis: vis !== false });
    const sticks = [
      link('head', 'neck'), link('neck', 'chest'), link('chest', 'pelvis'),
      link('neck', 'lelbow'), link('lelbow', 'lhand'), link('neck', 'relbow'), link('relbow', 'rhand'),
      link('pelvis', 'lknee'), link('lknee', 'lfoot'), link('pelvis', 'rknee'), link('rknee', 'rfoot'),
      // hidden braces keep the torso from folding flat
      link('head', 'chest', false), link('neck', 'pelvis', false), link('lknee', 'rknee', false),
      link('lelbow', 'chest', false), link('relbow', 'chest', false),
    ];
    return { pts, sticks, idx };
  }

  // --- world ----------------------------------------------------------------------
  function buildWorld() {
    const rng = Kit.seeded(save.runs * 97 + 5);
    const rects = [{ x: -400, y: TOP, w: 400 + SW, h: 6000 }];
    const bumpers = [];
    const spikes = [];
    for (let i = 1; i < STEPS; i++) {
      const x = i * SW, y = TOP + i * SH;
      rects.push({ x, y, w: SW, h: 6000 });
      const roll = rng();
      if (roll < 0.12 + save.up.bumpers * 0.03) bumpers.push({ x: x + SW / 2, y: y - 26, r: 24, flash: 0 });
      else if (roll > 0.86) spikes.push({ x: x + 10, y, w: SW - 20 });
    }
    // flat floor at the bottom with a wall
    const fx = STEPS * SW, fy = TOP + STEPS * SH;
    rects.push({ x: fx, y: fy, w: 1200, h: 6000 });
    rects.push({ x: fx + 1100, y: fy - 600, w: 100, h: 6000 });
    return { rects, bumpers, spikes, bottom: fy };
  }

  function newRun() {
    const world = buildWorld();
    R = {
      phase: 'aim', world, doll: makeRagdoll(SW * 0.2, TOP - 46), dmg: 0, hits: 0, still: 0, t: 0,
      cam: { x: -W / 2 + 120, y: TOP - 520 }, aim: null, floats: [], acc: 0,
    };
    hud.set('dmg', 0);
    hud.set('coins', save.coins);
    hud.set('best', save.best);
  }

  function addDamage(amount, x, y, mult) {
    const v = Math.round(amount * (1 + save.up.combo * 0.15) * (mult || 1));
    if (v < 1) return;
    R.dmg += v;
    R.hits++;
    if (v >= 4) R.floats.push({ x, y, text: '+' + v, life: 0.9, col: v > 25 ? '#ff4d5e' : '#ffd84d' });
    if (v > 6) sfx.thud();
    if (v > 25) Kit.audio.blip(120, 0.15, 'square', 0.1, 0.5);
  }

  function collidePoint(p, isHead) {
    const W_ = R.world;
    for (const r of W_.rects) {
      if (p.x + p.r < r.x || p.x - p.r > r.x + r.w || p.y + p.r < r.y || p.y - p.r > r.y + r.h) continue;
      const pen = [
        { d: p.x + p.r - r.x, nx: -1, ny: 0 },
        { d: r.x + r.w - (p.x - p.r), nx: 1, ny: 0 },
        { d: p.y + p.r - r.y, nx: 0, ny: -1 },
        { d: r.y + r.h - (p.y - p.r), nx: 0, ny: 1 },
      ].sort((a, b) => a.d - b.d)[0];
      const vx = p.x - p.px, vy = p.y - p.py;
      const vn = vx * pen.nx + vy * pen.ny;
      p.x += pen.nx * pen.d;
      p.y += pen.ny * pen.d;
      if (vn < 0) {
        const tx = vx - vn * pen.nx, ty = vy - vn * pen.ny;
        const nvx = tx * 0.82 - vn * 0.25 * pen.nx;
        const nvy = ty * 0.82 - vn * 0.25 * pen.ny;
        p.px = p.x - nvx;
        p.py = p.y - nvy;
        const speed = -vn / STEP;
        if (speed > 260) {
          let mult = isHead ? 2 : 1;
          const onSpike = pen.ny === -1 && W_.spikes.some((s) => p.x > s.x && p.x < s.x + s.w && Math.abs(r.y - s.y) < 1);
          if (onSpike) mult *= 3;
          addDamage((speed - 260) / 40, p.x, p.y, mult);
        }
      }
    }
    for (const b of W_.bumpers) {
      const dx = p.x - b.x, dy = p.y - b.y;
      const d = Math.hypot(dx, dy);
      const min = b.r + p.r;
      if (d >= min || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      p.x = b.x + nx * min;
      p.y = b.y + ny * min;
      // bumpers kick hard
      const kick = 900 * STEP;
      p.px = p.x - nx * kick;
      p.py = p.y - ny * kick;
      if (b.flash <= 0) { addDamage(20, p.x, p.y, 1); sfx.pop(); }
      b.flash = 0.3;
    }
  }

  function step() {
    const d = R.doll;
    for (const p of d.pts) {
      const vx = (p.x - p.px) * 0.998;
      const vy = (p.y - p.py) * 0.998;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + GRAV * STEP * STEP;
    }
    for (let it = 0; it < 5; it++) {
      for (const s of d.sticks) {
        const a = d.pts[s.a], b = d.pts[s.b];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const diff = (dist - s.len) / dist / 2;
        a.x += dx * diff; a.y += dy * diff;
        b.x -= dx * diff; b.y -= dy * diff;
      }
      d.pts.forEach((p, i) => collidePoint(p, i === 0));
    }
  }

  // --- input ------------------------------------------------------------------
  function toWorld(p) { return { x: p.x + R.cam.x, y: p.y + R.cam.y }; }
  st.on('down', (p) => {
    if (!R || R.phase !== 'aim') return;
    const w = toWorld(p);
    R.aim = { sx: w.x, sy: w.y, x: w.x, y: w.y };
  });
  st.on('move', (p) => {
    if (!R || !R.aim) return;
    const w = toWorld(p);
    R.aim.x = w.x; R.aim.y = w.y;
  });
  st.on('up', () => {
    if (!R || !R.aim) return;
    const a = R.aim;
    R.aim = null;
    const dx = a.x - a.sx, dy = a.y - a.sy;
    const len = Math.hypot(dx, dy);
    if (len < 20) { Kit.toast('Drag to aim, release to push'); return; }
    const power = clamp(len / 180, 0.25, 1) * (900 + save.up.power * 160);
    const nx = dx / len, ny = dy / len;
    const kick = power * STEP;
    R.doll.pts.forEach((pt, i) => {
      const k = i < 4 ? 1 : 0.85;
      pt.px = pt.x - nx * kick * k;
      pt.py = pt.y - ny * kick * k;
    });
    R.phase = 'fall';
    if (shop) { shop.remove(); shop = null; }
    Kit.audio.blip(200, 0.15, 'square', 0.12, 0.5);
  });

  // --- loop -----------------------------------------------------------------------
  function update(dt) {
    if (!R) return;
    R.floats.forEach((f) => { f.life -= dt; f.y -= 50 * dt; });
    R.floats = R.floats.filter((f) => f.life > 0);
    R.world.bumpers.forEach((b) => (b.flash = Math.max(0, b.flash - dt)));
    if (R.phase === 'fall') {
      R.t += dt;
      R.acc += dt;
      while (R.acc >= STEP) { step(); R.acc -= STEP; }
      // settle detection
      const sp = R.doll.pts.reduce((s, p) => s + Math.hypot(p.x - p.px, p.y - p.py), 0) / R.doll.pts.length / STEP;
      R.still = sp < 25 ? R.still + dt : 0;
      if (R.still > 1.2 || R.t > 25) finish();
      hud.set('dmg', R.dmg);
    }
    const head = R.doll.pts[0];
    const tx = head.x - W / 2 + (R.phase === 'aim' ? 140 : 60);
    const ty = head.y - H * 0.42;
    R.cam.x += (tx - R.cam.x) * Math.min(1, dt * 5);
    R.cam.y += (ty - R.cam.y) * Math.min(1, dt * 5);
  }

  function finish() {
    R.phase = 'done';
    const dmg = R.dmg;
    const coins = Math.round(dmg / 4);
    const record = dmg > save.best;
    save.best = Math.max(save.best, dmg);
    save.runs++;
    YT.sendScore(save.best);
    const collect = (m) => {
      save.coins += coins * m;
      YT.save(save);
      sfx.coin();
      const next = () => { newRun(); showShop(); };
      if (save.runs % 3 === 0) YT.interstitial().then(next); else next();
    };
    Kit.panel({
      title: record ? 'New record! 🏆' : 'Ouch! 🤕',
      body: '<div class="big">' + dmg + '</div><p>damage from ' + R.hits + ' hits</p><p>Coins: <b>🪙 ' + coins + '</b></p>',
      buttons: [
        { label: 'Collect ×2', cls: 'ad', onClick: () => YT.rewarded('double_coins').then((ok) => collect(ok ? 2 : 1)) },
        { label: 'Collect', cls: 'primary', onClick: () => collect(1) },
      ],
    });
  }

  // --- shop -----------------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent =
    '.shop{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:8px;width:min(520px,calc(100% - 24px))}' +
    '.shop button{flex:1;background:rgba(20,14,36,.88);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:8px 4px;font:600 12px system-ui,sans-serif;cursor:pointer}' +
    '.shop button b{display:block;font-size:13px}.shop button i{display:block;font-style:normal;color:#ffd84d;font-weight:800;margin-top:2px}' +
    '.shop button:disabled{opacity:.45;cursor:default}';
  document.head.appendChild(css);
  let shop = null;
  function showShop() {
    if (shop) shop.remove();
    shop = Kit.el('div', 'shop');
    UPGRADES.forEach((u) => {
      const lvl = save.up[u.id];
      const price = cost(lvl);
      const maxed = lvl >= MAX_LVL;
      const b = Kit.el('button', '', '<b>' + u.icon + ' ' + u.name + '</b>Lv ' + lvl + '<i>' + (maxed ? 'MAX' : '🪙 ' + price) + '</i>');
      b.type = 'button';
      b.disabled = maxed || save.coins < price;
      b.addEventListener('click', () => {
        if (b.disabled) return;
        save.coins -= price;
        save.up[u.id]++;
        YT.save(save);
        sfx.coin();
        newRun();
        showShop();
      });
      shop.appendChild(b);
    });
    document.getElementById('ui').appendChild(shop);
  }

  // --- render ---------------------------------------------------------------------
  function render() {
    st.begin();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3a2a6b');
    g.addColorStop(1, '#ff8a6b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (!R) { st.end(); return; }
    ctx.save();
    ctx.translate(-R.cam.x, -R.cam.y);
    // stairs
    for (const r of R.world.rects) {
      if (r.x > R.cam.x + W || r.x + r.w < R.cam.x || r.y > R.cam.y + H) continue;
      ctx.fillStyle = '#d9d2e9';
      ctx.fillRect(r.x, r.y, r.w, Math.min(r.h, R.cam.y + H - r.y + 10));
      ctx.fillStyle = '#b4a9cf';
      ctx.fillRect(r.x, r.y, r.w, 10);
      ctx.fillStyle = 'rgba(0,0,0,.08)';
      ctx.fillRect(r.x + r.w - 6, r.y, 6, Math.min(r.h, R.cam.y + H - r.y + 10));
    }
    for (const s of R.world.spikes) {
      ctx.fillStyle = '#9aa0b4';
      ctx.beginPath();
      for (let x = s.x; x < s.x + s.w - 1; x += 18) {
        ctx.moveTo(x, s.y);
        ctx.lineTo(x + 9, s.y - 18);
        ctx.lineTo(x + 18, s.y);
      }
      ctx.fill();
    }
    for (const b of R.world.bumpers) {
      ctx.fillStyle = b.flash > 0 ? '#ffffff' : '#ff4d5e';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + (b.flash > 0 ? 4 : 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd84d';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // ragdoll
    const d = R.doll;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 13;
    d.sticks.forEach((s) => {
      if (!s.vis || s.a === 0) return;
      ctx.beginPath();
      ctx.moveTo(d.pts[s.a].x, d.pts[s.a].y);
      ctx.lineTo(d.pts[s.b].x, d.pts[s.b].y);
      ctx.stroke();
    });
    ctx.strokeStyle = '#4cc9f0';
    ctx.lineWidth = 16;
    const ch = d.pts[2], pe = d.pts[3], ne = d.pts[1];
    ctx.beginPath();
    ctx.moveTo(ne.x, ne.y); ctx.lineTo(ch.x, ch.y); ctx.lineTo(pe.x, pe.y);
    ctx.stroke();
    const head = d.pts[0];
    ctx.fillStyle = '#ffd6a5';
    ctx.beginPath();
    ctx.arc(head.x, head.y, head.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2d42';
    const hurt = R.dmg > 50;
    Kit.text(ctx, hurt ? 'x  x' : '•  •', head.x, head.y - 2, 12, '#2b2d42');
    // aim arrow
    if (R.aim) {
      const a = R.aim;
      const dx = a.x - a.sx, dy = a.y - a.sy;
      const len = Math.min(180, Math.hypot(dx, dy));
      if (len > 10) {
        const ang = Math.atan2(dy, dx);
        const ox = d.pts[2].x, oy = d.pts[2].y;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(255,216,77,.9)';
        ctx.fillRect(10, -6, len, 12);
        ctx.beginPath();
        ctx.moveTo(len + 10, -18); ctx.lineTo(len + 40, 0); ctx.lineTo(len + 10, 18);
        ctx.fill();
        ctx.restore();
      }
    }
    for (const f of R.floats) {
      ctx.globalAlpha = clamp(f.life * 2, 0, 1);
      Kit.text(ctx, f.text, f.x, f.y - 20, 26, f.col);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (R.phase === 'aim') {
      Kit.text(ctx, 'Drag to aim · release to push', W / 2, 140, 26, '#fff');
    }
    st.end();
  }

  Kit.boot('ragdoll-tumble', (data) => {
    save = Object.assign(save, data);
    save.up = Object.assign({ power: 0, combo: 0, bumpers: 0 }, data.up || {});
    newRun();
    showShop();
    Kit.loop(update, render);
  });
})();
