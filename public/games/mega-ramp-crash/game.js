/*
 * Mega Ramp Crash — roll down the mega ramp, launch, and smash through crate
 * towers. Hold anywhere to use the engine on the ramp and the rocket boost
 * in the air. Earn coins, buy upgrades, go further.
 */
(function () {
  'use strict';
  const { clamp, rand, sfx } = Kit;
  const W = 960, H = 540;
  const GROUND = 470;
  const G_ACC = 900;
  const PX_PER_M = 10;

  const UPGRADES = [
    { id: 'engine', name: 'Engine', icon: '⚙️', desc: 'Faster on the ramp' },
    { id: 'fuel', name: 'Rocket fuel', icon: '🚀', desc: 'Longer boost' },
    { id: 'ramp', name: 'Ramp height', icon: '📐', desc: 'Bigger launch' },
  ];
  const MAX_LVL = 12;
  const cost = (lvl) => Math.round(40 * Math.pow(1.55, lvl));

  let save = { coins: 0, best: 0, runs: 0, up: { engine: 0, fuel: 0, ramp: 0 } };
  let R = null; // current run
  let holding = false;

  const st = Kit.stage(W, H, { letterbox: '#10131f' });
  const ctx = st.ctx;
  const hud = Kit.hud(
    [{ id: 'coins', label: 'Coins', value: 0 }, { id: 'dist', label: 'Distance', value: '0 m' }, { id: 'best', label: 'Best', value: '0 m' }],
    []
  );

  // --- world --------------------------------------------------------------------
  function buildRamp() {
    const h0 = 230 + save.up.ramp * 34;
    const pts = [];
    const topX = -260;
    // long drop that flattens out, then a launch kicker
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = topX + t * 760;
      const y = GROUND - 20 - h0 * Math.pow(1 - t, 2.2);
      pts.push({ x, y });
    }
    const kx = pts[pts.length - 1].x;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      pts.push({ x: kx + t * 150, y: GROUND - 20 - t * t * 95 });
    }
    // precompute lengths
    let acc = 0;
    pts[0].s = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      pts[i].s = acc;
    }
    return { pts, len: acc, h0 };
  }

  function rampAt(ramp, s) {
    const p = ramp.pts;
    for (let i = 1; i < p.length; i++) {
      if (p[i].s >= s) {
        const seg = p[i].s - p[i - 1].s;
        const t = (s - p[i - 1].s) / seg;
        return {
          x: p[i - 1].x + (p[i].x - p[i - 1].x) * t,
          y: p[i - 1].y + (p[i].y - p[i - 1].y) * t,
          ang: Math.atan2(p[i].y - p[i - 1].y, p[i].x - p[i - 1].x),
        };
      }
    }
    const a = p[p.length - 2], b = p[p.length - 1];
    return { x: b.x, y: b.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  function buildObstacles(seed) {
    const rng = Kit.seeded(seed);
    const boxes = [];
    const pads = [];
    let x = 900;
    for (let i = 0; i < 40; i++) {
      x += 380 + rng() * 520;
      if (rng() < 0.22) {
        pads.push({ x, w: 90 });
        continue;
      }
      const cols = 1 + Math.floor(rng() * 3);
      const rows = 2 + Math.floor(rng() * (4 + i / 6));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          boxes.push({ x: x + c * 42, y: GROUND - 40 - r * 40, w: 40, h: 40, hit: false, vx: 0, vy: 0, rot: 0, vr: 0, gold: rng() < 0.08 });
        }
      }
    }
    return { boxes, pads };
  }

  function newRun() {
    const ramp = buildRamp();
    const obs = buildObstacles(save.runs * 17 + 3);
    const start = rampAt(ramp, 0);
    R = {
      phase: 'ready', ramp, s: 0, v: 0,
      car: { x: start.x, y: start.y, vx: 0, vy: 0, ang: start.ang },
      fuel: 1 + save.up.fuel * 0.45, fuelMax: 1 + save.up.fuel * 0.45,
      boxes: obs.boxes, pads: obs.pads, smashed: 0, bonus: 0, launchX: 0, maxX: 0,
      cam: { x: start.x - 200, y: Math.min(0, start.y - 200) },
      parts: [], boosting: false, t: 0, shake: 0,
    };
    updateHud();
  }

  function updateHud() {
    hud.set('coins', save.coins);
    hud.set('best', save.best + ' m');
    hud.set('dist', (R ? distM() : 0) + ' m');
  }
  function distM() { return R.launchX ? Math.max(0, Math.round((R.maxX - R.launchX) / PX_PER_M)) : 0; }

  // --- garage UI ------------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent =
    '.garage{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:10px;align-items:stretch;width:min(720px,calc(100% - 24px))}' +
    '.garage .card{flex:1;background:rgba(14,18,36,.86);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:8px;text-align:center;cursor:pointer;color:#fff;font:inherit}' +
    '.garage .card b{display:block;font-size:14px}.garage .card small{display:block;font-size:11px;opacity:.7}' +
    '.garage .card .lv{font-size:11px;color:#8fd3ff}.garage .card .price{margin-top:4px;font-weight:800;color:#ffd84d}' +
    '.garage .card:disabled{opacity:.45;cursor:default}' +
    '.garage .go{flex:1.3;font-size:22px}';
  document.head.appendChild(css);
  let garage = null;
  function showGarage() {
    hideGarage();
    garage = Kit.el('div', 'garage');
    UPGRADES.forEach((u) => {
      const lvl = save.up[u.id];
      const maxed = lvl >= MAX_LVL;
      const price = cost(lvl);
      const b = Kit.el('button', 'card',
        '<b>' + u.icon + ' ' + u.name + '</b><small>' + u.desc + '</small><div class="lv">Lv ' + lvl + '/' + MAX_LVL + '</div><div class="price">' + (maxed ? 'MAX' : '🪙 ' + price) + '</div>');
      b.type = 'button';
      b.disabled = maxed || save.coins < price;
      b.addEventListener('click', () => {
        if (save.coins < price || maxed) return;
        save.coins -= price;
        save.up[u.id]++;
        YT.save(save);
        sfx.coin();
        newRun();
        showGarage();
      });
      garage.appendChild(b);
    });
    const go = Kit.el('button', 'kit-btn primary go', 'LAUNCH 🚀');
    go.type = 'button';
    go.addEventListener('click', () => { hideGarage(); launch(); });
    garage.appendChild(go);
    document.getElementById('ui').appendChild(garage);
  }
  function hideGarage() { if (garage) { garage.remove(); garage = null; } }

  function launch() {
    if (!R || R.phase !== 'ready') return;
    R.phase = 'ramp';
    sfx.tap();
    Kit.toast('Hold to boost!');
  }

  st.on('down', () => { holding = true; });
  st.on('up', () => { holding = false; });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space') { holding = true; if (R && R.phase === 'ready') { hideGarage(); launch(); } } });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') holding = false; });
  YT.onPause(() => { holding = false; });

  // --- simulation -----------------------------------------------------------------
  function update(dt) {
    if (!R) return;
    R.t += dt;
    const c = R.car;
    R.boosting = false;
    if (R.phase === 'ramp') {
      const here = rampAt(R.ramp, R.s);
      let a = G_ACC * Math.sin(here.ang) - 30;
      if (holding) a += 260 + save.up.engine * 70;
      R.v = Math.max(20, R.v + a * dt);
      R.s += R.v * dt;
      if (R.s >= R.ramp.len) {
        const end = rampAt(R.ramp, R.ramp.len);
        c.x = end.x; c.y = end.y; c.ang = end.ang;
        c.vx = Math.cos(end.ang) * R.v;
        c.vy = Math.sin(end.ang) * R.v;
        R.phase = 'air';
        R.launchX = c.x;
        Kit.audio.blip(220, 0.3, 'sawtooth', 0.08, 2);
      } else {
        const p = rampAt(R.ramp, R.s);
        c.x = p.x; c.y = p.y; c.ang = p.ang;
        if (Math.random() < 0.3) Kit.audio.blip(80 + R.v * 0.2, 0.05, 'sawtooth', 0.02);
      }
    } else if (R.phase === 'air' || R.phase === 'ground') {
      if (holding && R.fuel > 0) {
        R.fuel = Math.max(0, R.fuel - dt);
        const ta = R.phase === 'air' ? c.ang : 0;
        c.vx += Math.cos(ta) * 780 * dt;
        c.vy += Math.sin(ta) * 780 * dt - 250 * dt;
        R.boosting = true;
        R.parts.push({ x: c.x - Math.cos(c.ang) * 34, y: c.y - Math.sin(c.ang) * 34, vx: -c.vx * 0.2 + rand(-40, 40), vy: rand(-40, 40), life: 0.4, col: Math.random() < 0.5 ? '#ffb238' : '#ff5a3c', r: rand(4, 9) });
        if (Math.random() < 0.4) Kit.audio.noise(0.05, 0.05);
      }
      c.vy += G_ACC * dt;
      c.vx *= 1 - 0.04 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (R.phase === 'air') {
        const target = Math.atan2(c.vy, Math.max(1, c.vx));
        c.ang += (target - c.ang) * Math.min(1, dt * 3);
      }
      // ground contact
      if (c.y >= GROUND - 14) {
        c.y = GROUND - 14;
        // bounce pads
        // each pad fires once, and only for a moving car (no endless bouncing)
        const pad = R.pads.find((p) => !p.used && c.x > p.x && c.x < p.x + p.w);
        if (pad && c.vx > 120) {
          pad.used = true;
          c.vy = -Math.max(650, Math.abs(c.vy) * 0.9);
          R.phase = 'air';
          R.bonus += 50;
          sfx.pop();
          floatText(c.x, c.y - 40, 'BOING +50', '#7dff9a');
        } else if (c.vy > 120) {
          if (c.vy > 650) { crashFx(c.x, c.y, 18); R.shake = 0.3; sfx.crash(); }
          else sfx.thud();
          c.vy = -c.vy * 0.32;
          c.vx *= 0.86;
          R.phase = c.vy < -80 ? 'air' : 'ground';
        } else {
          c.vy = 0;
          R.phase = 'ground';
          c.ang += (0 - c.ang) * Math.min(1, dt * 8);
          c.vx = Math.max(0, c.vx - 320 * dt);
          if (c.vx < 4 && !(holding && R.fuel > 0)) finish();
        }
      }
      // crates
      for (const b of R.boxes) {
        if (b.hit) continue;
        if (Math.abs(c.x - (b.x + 20)) < 46 && Math.abs(c.y - (b.y + 20)) < 34) {
          b.hit = true;
          b.vx = c.vx * rand(0.6, 1.2) + rand(-60, 60);
          b.vy = -rand(200, 520) + c.vy * 0.3;
          b.vr = rand(-8, 8);
          c.vx *= b.gold ? 1.0 : 0.965;
          R.smashed++;
          const pts = b.gold ? 100 : 10;
          R.bonus += pts;
          if (b.gold) floatText(b.x, b.y, '+100', '#ffd84d');
          Kit.audio.noise(0.08, 0.15);
          crashFx(b.x + 20, b.y + 20, 5);
        }
      }
      R.maxX = Math.max(R.maxX, c.x);
    }
    // debris + particles
    for (const b of R.boxes) {
      if (!b.hit || b.rest) continue;
      b.vy += G_ACC * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.y > GROUND - 40) {
        b.y = GROUND - 40;
        b.vy *= -0.3;
        b.vx *= 0.7;
        b.vr *= 0.6;
        if (Math.abs(b.vy) < 40 && Math.abs(b.vx) < 20) b.rest = true;
      }
    }
    R.parts.forEach((p) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += 600 * dt; });
    R.parts = R.parts.filter((p) => p.life > 0);
    if (R.shake > 0) R.shake -= dt;
    // camera
    const tx = c.x - 280;
    const ty = Math.min(0, c.y - 220);
    R.cam.x += (tx - R.cam.x) * Math.min(1, dt * 6);
    R.cam.y += (ty - R.cam.y) * Math.min(1, dt * 4);
    hud.set('dist', distM() + ' m');
  }

  function floatText(x, y, text, col) {
    R.parts.push({ x, y, vx: 0, vy: -60, life: 1, text, col });
  }
  function crashFx(x, y, n) {
    for (let i = 0; i < n; i++) {
      R.parts.push({ x, y, vx: rand(-250, 250), vy: rand(-380, -40), life: rand(0.4, 0.9), col: Math.random() < 0.5 ? '#c78c4a' : '#e9d5a1', r: rand(3, 7), g: true });
    }
  }

  function finish() {
    if (R.phase === 'done') return;
    R.phase = 'done';
    const dist = distM();
    const coins = Math.round(dist * 0.6 + R.bonus * 0.5);
    const newBest = dist > save.best;
    save.best = Math.max(save.best, dist);
    save.runs++;
    YT.sendScore(save.best);
    updateHud();
    const collect = (mult) => {
      save.coins += coins * mult;
      YT.save(save);
      sfx.coin();
      const next = () => { newRun(); showGarage(); };
      if (save.runs % 3 === 0) YT.interstitial().then(next); else next();
    };
    setTimeout(() => {
      Kit.panel({
        title: newBest ? 'New record! 🏆' : 'Crashed! 💥',
        body: '<div class="big">' + dist + ' m</div><p>Crates smashed: <b>' + R.smashed + '</b> · Bonus: <b>' + R.bonus + '</b></p><p>Coins earned: <b>🪙 ' + coins + '</b></p>',
        buttons: [
          { label: 'Collect ×2', cls: 'ad', onClick: () => YT.rewarded('double_coins').then((ok) => collect(ok ? 2 : 1)) },
          { label: 'Collect', cls: 'primary', onClick: () => collect(1) },
        ],
      });
    }, 600);
  }

  // --- render ---------------------------------------------------------------------
  function render() {
    st.begin();
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#5fb8ff');
    sky.addColorStop(1, '#ffe7b8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    if (!R) { st.end(); return; }
    const cx = R.cam.x + (R.shake > 0 ? rand(-6, 6) : 0);
    const cy = R.cam.y + (R.shake > 0 ? rand(-6, 6) : 0);
    // parallax hills
    ctx.fillStyle = '#b6d7a8';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 330 - cy * 0.3 + Math.sin((x + cx * 0.3) / 140) * 40);
    ctx.lineTo(W, H);
    ctx.fill();
    ctx.save();
    ctx.translate(-cx, -cy);
    // ground
    ctx.fillStyle = '#6aa84f';
    ctx.fillRect(cx - 10, GROUND, W + 20, H - cy + 600);
    ctx.fillStyle = '#8b5e34';
    ctx.fillRect(cx - 10, GROUND + 14, W + 20, H + 600);
    // distance markers
    if (R.launchX) {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      const step = 50 * PX_PER_M;
      for (let m = Math.floor((cx - R.launchX) / step) * step; m < cx - R.launchX + W + step; m += step) {
        if (m <= 0) continue;
        const x = R.launchX + m;
        ctx.fillRect(x - 2, GROUND - 30, 4, 30);
        Kit.text(ctx, m / PX_PER_M + 'm', x, GROUND - 42, 16, '#fff');
      }
    }
    // pads
    for (const p of R.pads) {
      ctx.fillStyle = '#2bd66b';
      Kit.roundRect(ctx, p.x, GROUND - 10, p.w, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#1a7a3f';
      ctx.fillRect(p.x + 8, GROUND - 2, p.w - 16, 4);
    }
    // ramp
    const pts = R.ramp.pts;
    ctx.fillStyle = '#c9ccd6';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, GROUND);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, GROUND);
    ctx.closePath();
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#7a8092';
    ctx.lineWidth = 4;
    for (let i = 0; i < pts.length; i += 4) {
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i].x, GROUND);
      ctx.stroke();
    }
    ctx.strokeStyle = '#ff6b3d';
    ctx.lineWidth = 12;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    // crates
    for (const b of R.boxes) {
      if (b.x < cx - 100 || b.x > cx + W + 100) continue;
      ctx.save();
      ctx.translate(b.x + 20, b.y + 20);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.gold ? '#ffcc33' : '#c78c4a';
      ctx.fillRect(-20, -20, 40, 40);
      ctx.strokeStyle = b.gold ? '#b8860b' : '#7a4e22';
      ctx.lineWidth = 4;
      ctx.strokeRect(-18, -18, 36, 36);
      ctx.beginPath();
      ctx.moveTo(-18, -18); ctx.lineTo(18, 18);
      ctx.stroke();
      ctx.restore();
    }
    // car
    const c = R.car;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.ang);
    ctx.translate(0, -14);
    if (R.boosting) {
      ctx.fillStyle = '#ffb238';
      ctx.beginPath();
      ctx.moveTo(-34, -6); ctx.lineTo(-60 - Math.random() * 20, 0); ctx.lineTo(-34, 6);
      ctx.fill();
    }
    ctx.fillStyle = '#e8384f';
    Kit.roundRect(ctx, -34, -14, 68, 22, 7);
    ctx.fill();
    ctx.fillStyle = '#c42339';
    Kit.roundRect(ctx, -14, -28, 34, 18, 7);
    ctx.fill();
    ctx.fillStyle = '#9fd6ff';
    Kit.roundRect(ctx, -8, -25, 24, 12, 4);
    ctx.fill();
    ctx.fillStyle = '#555';
    Kit.roundRect(ctx, -40, -10, 10, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#1b1b22';
    [-20, 22].forEach((wx) => { ctx.beginPath(); ctx.arc(wx, 9, 10, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#bbb';
    [-20, 22].forEach((wx) => { ctx.beginPath(); ctx.arc(wx, 9, 4, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
    // particles
    for (const p of R.parts) {
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      if (p.text) Kit.text(ctx, p.text, p.x, p.y, 24, p.col);
      else { ctx.fillStyle = p.col; ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // fuel gauge
    if (R.phase !== 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      Kit.roundRect(ctx, 20, H - 40, 220, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#ffb238';
      Kit.roundRect(ctx, 20, H - 40, Math.max(18, 220 * (R.fuel / R.fuelMax)), 18, 9);
      ctx.fill();
      Kit.text(ctx, '🚀 BOOST', 300, H - 31, 16, '#fff', 'center');
      if (R.phase === 'ramp' && R.t < 3) Kit.text(ctx, 'HOLD to accelerate', W / 2, 120, 34, '#fff');
    } else {
      Kit.text(ctx, 'MEGA RAMP CRASH', W / 2, 110, 46, '#fff');
      Kit.text(ctx, 'Upgrade, then launch!', W / 2, 160, 22, 'rgba(255,255,255,.9)', 'center', '600');
    }
    st.end();
  }

  Kit.boot('mega-ramp-crash', (data) => {
    save = Object.assign(save, data);
    save.up = Object.assign({ engine: 0, fuel: 0, ramp: 0 }, data.up || {});
    newRun();
    showGarage();
    Kit.loop(update, render);
  });
})();
