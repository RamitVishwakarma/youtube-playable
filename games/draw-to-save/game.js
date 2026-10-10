/*
 * Draw to Save — draw one line to protect the dog from the bee swarm.
 * Lift your finger and the bees attack for 5 seconds. Less ink = more stars.
 */
(function () {
  'use strict';
  const { clamp, rand, sfx } = Kit;
  const W = 540, H = 960;
  const FLOOR = 820;
  const DOG_R = 30;
  const BEE_R = 10;
  const SURVIVE = 5;

  // Hand-made opening levels; later levels are generated from a seed.
  const LEVELS = [
    { dog: [270, FLOOR - DOG_R], hives: [[270, 220]], ink: 460, plats: [] },
    { dog: [150, FLOOR - DOG_R], hives: [[420, 240]], ink: 420, plats: [] },
    { dog: [270, FLOOR - DOG_R], hives: [[100, 220], [440, 220]], ink: 440, plats: [] },
    { dog: [270, 560 - DOG_R], hives: [[270, 170]], ink: 520, plats: [[170, 560, 200, 28]] },
    { dog: [60, FLOOR - DOG_R], hives: [[420, 200]], ink: 300, plats: [] },
    { dog: [270, FLOOR - DOG_R], hives: [[90, 200], [270, 140], [450, 200]], ink: 440, plats: [] },
    { dog: [420, 430 - DOG_R], hives: [[110, 760]], ink: 460, plats: [[330, 430, 190, 26]] },
    { dog: [270, FLOOR - DOG_R], hives: [[50, 560], [490, 560]], ink: 380, plats: [] },
    { dog: [100, 520 - DOG_R], hives: [[440, 300], [440, 760]], ink: 480, plats: [[20, 520, 170, 26]] },
    { dog: [270, FLOOR - DOG_R], hives: [[270, 600]], ink: 400, plats: [] },
    { dog: [480, FLOOR - DOG_R], hives: [[80, 160], [80, 700]], ink: 320, plats: [[200, 470, 140, 24]] },
    { dog: [270, 380 - DOG_R], hives: [[120, 760], [420, 760], [270, 120]], ink: 620, plats: [[180, 380, 180, 26]] },
  ];

  function genLevel(n) {
    const r = Kit.seeded(n * 7919 + 13);
    const plats = [];
    let dog;
    if (r() < 0.45) {
      const pw = 150 + r() * 80;
      const px = 30 + r() * (W - 60 - pw);
      const py = 380 + r() * 260;
      plats.push([px, py, pw, 26]);
      dog = [px + pw / 2, py - DOG_R];
    } else {
      dog = [60 + r() * (W - 120), FLOOR - DOG_R];
    }
    const hiveCount = 1 + Math.floor(r() * 3);
    const hives = [];
    for (let i = 0; i < hiveCount; i++) {
      let hx, hy, tries = 0;
      do {
        hx = 50 + r() * (W - 100);
        hy = 120 + r() * 640;
        tries++;
      } while (Math.hypot(hx - dog[0], hy - dog[1]) < 240 && tries < 40);
      hives.push([hx, hy]);
    }
    const ink = Math.round(Math.max(300, 560 - n * 6 + hiveCount * 30));
    return { dog, hives, ink, plats };
  }
  const levelData = (n) => (n < LEVELS.length ? LEVELS[n] : genLevel(n));

  let save = { level: 0, stars: {} };
  let L = null; // current level state

  const st = Kit.stage(W, H, { letterbox: '#0e1a2b' });
  const hud = Kit.hud(
    [{ id: 'lvl', label: 'Level', value: 1 }, { id: 'ink', label: 'Ink', value: '100%' }],
    [
      { id: 'boost', label: '+Ink', title: 'Watch an ad for 50% more ink', onClick: extraInk },
      { id: 'retry', label: '↻', title: 'Restart', onClick: () => startLevel(save.level) },
    ]
  );
  hud.btn('boost').classList.add('ad');

  function startLevel(n) {
    const d = levelData(n);
    L = {
      n,
      dog: { x: d.dog[0], y: d.dog[1], hurt: 0 },
      hives: d.hives.map(([x, y]) => ({ x, y, left: 10 + Math.min(8, Math.floor(n / 3)) })),
      plats: d.plats.map(([x, y, w, h]) => ({ x, y, w, h })),
      inkMax: d.ink,
      ink: d.ink,
      line: [],
      phase: 'draw', // draw | drawing | attack | won | lost
      t: 0,
      bees: [],
      spawnT: 0,
      bonusInk: false,
    };
    hud.set('lvl', n + 1);
    hud.btn('boost').disabled = false;
  }

  function extraInk() {
    if (!L || L.phase !== 'draw' || L.bonusInk) {
      Kit.toast(L && L.bonusInk ? 'Already boosted!' : 'Use it before drawing');
      return;
    }
    YT.rewarded('extra_ink').then((ok) => {
      if (!ok || !L || L.phase !== 'draw') return;
      L.bonusInk = true;
      L.inkMax = Math.round(L.inkMax * 1.5);
      L.ink = L.inkMax;
      hud.btn('boost').disabled = true;
      Kit.toast('+50% ink!');
      sfx.good();
    });
  }

  // --- input: one stroke --------------------------------------------------
  st.on('down', (p) => {
    if (!L || L.phase !== 'draw') return;
    if (Math.hypot(p.x - L.dog.x, p.y - L.dog.y) < DOG_R + 8) return;
    L.phase = 'drawing';
    L.line = [{ x: p.x, y: p.y }];
  });
  st.on('move', (p) => {
    if (!L || L.phase !== 'drawing') return;
    const last = L.line[L.line.length - 1];
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d < 6 || L.ink <= 0) return;
    // the line may not pass through the dog
    const c = Kit.closestOnSegment(L.dog.x, L.dog.y, last.x, last.y, p.x, p.y);
    if (Math.hypot(c.x - L.dog.x, c.y - L.dog.y) < DOG_R + 6) return;
    const step = Math.min(d, L.ink);
    const k = step / d;
    L.line.push({ x: last.x + (p.x - last.x) * k, y: last.y + (p.y - last.y) * k });
    L.ink -= step;
    if (L.ink <= 0) release();
  });
  st.on('up', () => { if (L && L.phase === 'drawing') release(); });

  function release() {
    if (L.line.length < 2) {
      L.phase = 'draw';
      L.line = [];
      return;
    }
    L.phase = 'attack';
    L.t = 0;
    hud.btn('boost').disabled = true;
    sfx.tap();
  }

  // --- simulation ---------------------------------------------------------
  function collideBee(b) {
    // walls
    if (b.x < BEE_R) { b.x = BEE_R; b.vx = Math.abs(b.vx); }
    if (b.x > W - BEE_R) { b.x = W - BEE_R; b.vx = -Math.abs(b.vx); }
    if (b.y < BEE_R) { b.y = BEE_R; b.vy = Math.abs(b.vy); }
    if (b.y > FLOOR - BEE_R) { b.y = FLOOR - BEE_R; b.vy = -Math.abs(b.vy); }
    // platforms
    for (const p of L.plats) {
      const cx = clamp(b.x, p.x, p.x + p.w);
      const cy = clamp(b.y, p.y, p.y + p.h);
      pushOut(b, cx, cy);
    }
    // drawn line
    const ln = L.line;
    for (let i = 1; i < ln.length; i++) {
      const c = Kit.closestOnSegment(b.x, b.y, ln[i - 1].x, ln[i - 1].y, ln[i].x, ln[i].y);
      pushOut(b, c.x, c.y);
    }
  }
  function pushOut(b, cx, cy) {
    let dx = b.x - cx, dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    const minD = BEE_R + 3;
    if (d >= minD) return;
    if (d < 0.001) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
    b.x = cx + dx * minD;
    b.y = cy + dy * minD;
    const vn = b.vx * dx + b.vy * dy;
    if (vn < 0) { b.vx -= 1.6 * vn * dx; b.vy -= 1.6 * vn * dy; }
  }

  function update(dt) {
    if (!L) return;
    for (const b of L.bees) b.wing += dt * 40;
    if (L.phase !== 'attack') return;
    L.t += dt;
    // spawn
    L.spawnT -= dt;
    if (L.spawnT <= 0 && L.t < 2) {
      L.spawnT = 0.12;
      for (const h of L.hives) {
        if (h.left-- > 0) {
          const a = rand(0, Math.PI * 2);
          L.bees.push({ x: h.x, y: h.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, wing: rand(0, 6), jit: rand(0, 6) });
          if (Math.random() < 0.3) Kit.audio.blip(rand(200, 260), 0.08, 'sawtooth', 0.03);
        }
      }
    }
    const sub = 3;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const b of L.bees) {
        const dx = L.dog.x - b.x, dy = L.dog.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        b.jit += h * 3;
        b.vx += (dx / d) * 700 * h + Math.cos(b.jit * 2.3) * 300 * h;
        b.vy += (dy / d) * 700 * h + Math.sin(b.jit * 1.7) * 300 * h;
        const sp = Math.hypot(b.vx, b.vy);
        const max = 260 + Math.min(80, L.n * 4);
        if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; }
        b.x += b.vx * h;
        b.y += b.vy * h;
        collideBee(b);
        if (Math.hypot(b.x - L.dog.x, b.y - L.dog.y) < DOG_R + BEE_R - 2) {
          lose();
          return;
        }
      }
    }
    if (L.t >= SURVIVE) win();
  }

  function starsFor() {
    const left = L.ink / L.inkMax;
    return left >= 0.5 ? 3 : left >= 0.25 ? 2 : 1;
  }

  function win() {
    L.phase = 'won';
    const stars = starsFor();
    const n = L.n;
    save.stars[n] = Math.max(save.stars[n] || 0, stars);
    save.level = Math.max(save.level, n + 1);
    YT.save(save);
    YT.sendScore(totalStars());
    sfx.win();
    setTimeout(() => {
      Kit.panel({
        title: 'Saved! 🐶',
        body: '<div class="stars">' + '★'.repeat(stars) + '<span class="off">' + '★'.repeat(3 - stars) + '</span></div><p>Ink left: ' + Math.round((L.ink / L.inkMax) * 100) + '%</p>',
        buttons: [
          { label: 'Next level', cls: 'primary', onClick: () => nextLevel(n + 1) },
          { label: 'Replay', cls: 'ghost', onClick: () => startLevel(n) },
        ],
      });
    }, 500);
  }

  function lose() {
    L.phase = 'lost';
    L.dog.hurt = 1;
    sfx.lose();
    const n = L.n;
    setTimeout(() => {
      Kit.panel({
        title: 'Ouch! 🐝',
        body: '<p>The bees got through. Try a different shape.</p>',
        buttons: [
          { label: 'Try again', cls: 'primary', onClick: () => startLevel(n) },
          {
            label: 'Skip level', cls: 'ad', onClick: () => {
              YT.rewarded('skip_level').then((ok) => {
                if (ok) {
                  save.level = Math.max(save.level, n + 1);
                  YT.save(save);
                  startLevel(n + 1);
                } else startLevel(n);
              });
            },
          },
        ],
      });
    }, 700);
  }

  function nextLevel(n) {
    if (n % 3 === 0) YT.interstitial().then(() => startLevel(n));
    else startLevel(n);
  }

  function totalStars() {
    return Object.values(save.stars).reduce((a, b) => a + b, 0);
  }

  // --- rendering ----------------------------------------------------------
  const ctx = st.ctx;
  function drawDog(d) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.font = '56px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.hurt ? '😵' : L.phase === 'won' ? '😄' : '🐶', 0, 2);
    ctx.restore();
  }
  function drawHive(h) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.fillStyle = '#d99a2b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a5a12';
    ctx.lineWidth = 4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      const y = i * 12;
      const w = Math.sqrt(Math.max(0, 1 - (y / 36) ** 2)) * 30;
      ctx.moveTo(-w, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#3a2405';
    ctx.beginPath();
    ctx.arc(0, 14, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawBee(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.scale(1.5, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    const flap = Math.sin(b.wing) * 3;
    ctx.beginPath();
    ctx.ellipse(-1, -6 - flap, 5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(-1, 6 + flap, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcf1f';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(-3, -6, 2.5, 12);
    ctx.fillRect(2, -5, 2.5, 10);
    ctx.restore();
  }

  function render() {
    st.begin();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#7fd3ff');
    g.addColorStop(1, '#d9f3ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // hills
    ctx.fillStyle = '#9be38f';
    ctx.beginPath();
    ctx.moveTo(0, FLOOR);
    for (let x = 0; x <= W; x += 30) ctx.lineTo(x, FLOOR - 40 - Math.sin(x / 90) * 30);
    ctx.lineTo(W, FLOOR);
    ctx.fill();
    ctx.fillStyle = '#5bbf4f';
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = '#3f9a37';
    ctx.fillRect(0, FLOOR, W, 10);
    if (!L) { st.end(); return; }
    for (const p of L.plats) {
      ctx.fillStyle = '#8d5a33';
      Kit.roundRect(ctx, p.x, p.y, p.w, p.h, 8);
      ctx.fill();
      ctx.fillStyle = '#5bbf4f';
      Kit.roundRect(ctx, p.x, p.y, p.w, 9, 6);
      ctx.fill();
    }
    L.hives.forEach(drawHive);
    // line
    if (L.line.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1c1c28';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(L.line[0].x, L.line[0].y);
      for (const p of L.line) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    drawDog(L.dog);
    L.bees.forEach(drawBee);
    // ink bar
    const pct = L.ink / L.inkMax;
    hud.set('ink', Math.round(pct * 100) + '%');
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    Kit.roundRect(ctx, 120, H - 70, 300, 18, 9);
    ctx.fill();
    ctx.fillStyle = pct > 0.5 ? '#2bb673' : pct > 0.25 ? '#f5a623' : '#e8384f';
    Kit.roundRect(ctx, 120, H - 70, Math.max(18, 300 * pct), 18, 9);
    ctx.fill();
    if (L.phase === 'draw') {
      Kit.text(ctx, 'Draw ONE line to protect the dog!', W / 2, H - 100, 24, '#17324d');
    } else if (L.phase === 'attack') {
      Kit.text(ctx, Math.max(0, SURVIVE - L.t).toFixed(1) + 's', W / 2, 130, 64, '#17324d');
    }
    st.end();
  }

  Kit.boot('draw-to-save', (data) => {
    save = Object.assign({ level: 0, stars: {} }, data);
    startLevel(save.level);
    Kit.loop(update, render);
  });
})();
