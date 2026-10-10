/*
 * Planet Merge (Drop & Merge) — drop planets into the jar. Two of the same
 * kind merge into the next one: Moon → Mercury → … → Sun. Don't let the
 * jar overflow past the red line.
 */
(function () {
  'use strict';
  const { clamp, rand, sfx } = Kit;
  const W = 540, H = 960;
  const JAR = { l: 36, r: 504, top: 230, bottom: 905 };
  const LINE = 250;
  const GRAV = 1700;

  const TIERS = [
    { name: 'Moon', r: 19, c1: '#e8e8f0', c2: '#9a9aae' },
    { name: 'Mercury', r: 25, c1: '#d6b38a', c2: '#8a6b4a' },
    { name: 'Mars', r: 32, c1: '#ff7a4d', c2: '#b8401f' },
    { name: 'Venus', r: 39, c1: '#ffe0a3', c2: '#d99a2b' },
    { name: 'Earth', r: 47, c1: '#5fb8ff', c2: '#1f6fd1', land: '#3fbf5f' },
    { name: 'Neptune', r: 56, c1: '#5f7bff', c2: '#2a37b8' },
    { name: 'Uranus', r: 66, c1: '#9ff0f0', c2: '#3fb8c4' },
    { name: 'Saturn', r: 77, c1: '#ffe7a3', c2: '#c4a052', ring: true },
    { name: 'Jupiter', r: 90, c1: '#f2c89a', c2: '#b8763a', bands: true },
    { name: 'Sun', r: 106, c1: '#fff6a3', c2: '#ff9a1f', glow: true },
  ];

  let save = { best: 0 };
  let G = null;
  const st = Kit.stage(W, H, { letterbox: '#090a1c' });
  const ctx = st.ctx;
  const hud = Kit.hud(
    [{ id: 'score', label: 'Score', value: 0 }, { id: 'best', label: 'Best', value: 0 }],
    [
      { id: 'clean', label: '🧹 Clear small', title: 'Watch an ad to remove all Moons and Mercurys', onClick: cleanSmall },
      { id: 'retry', label: '↻', title: 'Restart', onClick: () => confirmRestart() },
    ]
  );
  hud.btn('clean').classList.add('ad');

  const stars = Array.from({ length: 70 }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(0.5, 2), t: rand(0, 6) }));

  function newGame() {
    G = {
      bodies: [], score: 0, aimX: W / 2, next: randTier(), queue: randTier(), cooldown: 0,
      over: false, danger: 0, fx: [], cleaned: false, revived: false, id: 0,
    };
    hud.set('score', 0);
    hud.set('best', save.best);
    hud.btn('clean').disabled = false;
  }
  function randTier() {
    // smaller planets are more common
    const r = Math.random();
    return r < 0.35 ? 0 : r < 0.62 ? 1 : r < 0.82 ? 2 : r < 0.94 ? 3 : 4;
  }

  function confirmRestart() {
    if (!G || G.over) return;
    Kit.panel({
      title: 'Restart?', body: '<p>Your current jar will be lost.</p>',
      buttons: [{ label: 'Restart', cls: 'primary', onClick: newGame }, { label: 'Cancel', cls: 'ghost' }],
    });
  }

  function cleanSmall() {
    if (!G || G.over || G.cleaned) return;
    YT.rewarded('clear_small').then((ok) => {
      if (!ok || !G) return;
      G.cleaned = true;
      hud.btn('clean').disabled = true;
      G.bodies = G.bodies.filter((b) => {
        if (b.tier <= 1) { burst(b.x, b.y, TIERS[b.tier].c1, 10); return false; }
        return true;
      });
      sfx.good();
    });
  }

  // --- input ----------------------------------------------------------------------
  function aim(p) { if (G && !G.over) G.aimX = clamp(p.x, JAR.l + TIERS[G.next].r, JAR.r - TIERS[G.next].r); }
  st.on('down', aim);
  st.on('move', (p) => { if (p.pressed) aim(p); });
  st.on('up', (p) => {
    if (!G || G.over || G.cooldown > 0) return;
    aim(p);
    const t = TIERS[G.next];
    G.bodies.push({ id: G.id++, x: G.aimX, y: LINE - t.r - 30, vx: 0, vy: 120, r: t.r, tier: G.next, age: 0, rot: rand(0, 6) });
    G.next = G.queue;
    G.queue = randTier();
    G.cooldown = 0.45;
    Kit.audio.blip(300, 0.08, 'sine', 0.1, 0.7);
  });

  // --- physics --------------------------------------------------------------------
  function burst(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(80, 320);
      G.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), col, r: rand(2, 5) });
    }
  }

  function step(h) {
    const B = G.bodies;
    for (const b of B) {
      b.vy += GRAV * h;
      b.vx *= 0.999;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.rot += b.vx * h * 0.02;
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < B.length; i++) {
        const a = B[i];
        for (let j = i + 1; j < B.length; j++) {
          const b = B[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01;
          if (a.tier === b.tier && !a.dead && !b.dead) { a.merge = b; continue; }
          const nx = dx / d, ny = dy / d;
          const overlap = min - d;
          const ma = a.r * a.r, mb = b.r * b.r, tot = ma + mb;
          a.x -= nx * overlap * (mb / tot);
          a.y -= ny * overlap * (mb / tot);
          b.x += nx * overlap * (ma / tot);
          b.y += ny * overlap * (ma / tot);
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const imp = (-(1.15) * rv) / (1 / ma + 1 / mb);
            a.vx -= (imp / ma) * nx; a.vy -= (imp / ma) * ny;
            b.vx += (imp / mb) * nx; b.vy += (imp / mb) * ny;
          }
        }
      }
      for (const b of B) {
        if (b.x - b.r < JAR.l) { b.x = JAR.l + b.r; b.vx = Math.abs(b.vx) * 0.3; }
        if (b.x + b.r > JAR.r) { b.x = JAR.r - b.r; b.vx = -Math.abs(b.vx) * 0.3; }
        if (b.y + b.r > JAR.bottom) { b.y = JAR.bottom - b.r; b.vy = -Math.abs(b.vy) * 0.15; b.vx *= 0.96; }
      }
    }
    // merges
    for (const a of B) {
      const b = a.merge;
      a.merge = null;
      if (!b || a.dead || b.dead) continue;
      a.dead = b.dead = true;
      const tier = a.tier + 1;
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      burst(x, y, TIERS[a.tier].c1, 14);
      if (tier >= TIERS.length) {
        G.score += 500;
        Kit.toast('☀️ Supernova! +500');
        sfx.win();
        continue;
      }
      G.score += (tier + 1) * (tier + 2);
      const t = TIERS[tier];
      B.push({ id: G.id++, x, y, vx: (a.vx + b.vx) / 2, vy: (a.vy + b.vy) / 2 - 60, r: t.r * 0.6, grow: t.r, tier, age: 1, rot: 0 });
      Kit.audio.blip(300 + tier * 70, 0.12, 'triangle', 0.15, 1.5);
      if (tier >= 7) Kit.toast(t.name + '!');
    }
    G.bodies = B.filter((b) => !b.dead);
    for (const b of G.bodies) if (b.grow) { b.r = Math.min(b.grow, b.r + h * 260); if (b.r >= b.grow) b.grow = 0; }
  }

  function update(dt) {
    if (!G) return;
    for (const s of stars) s.t += dt;
    G.fx.forEach((f) => { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 400 * dt; });
    G.fx = G.fx.filter((f) => f.life > 0);
    if (G.over) return;
    G.cooldown -= dt;
    const sub = 4;
    for (let i = 0; i < sub; i++) step(dt / sub);
    G.bodies.forEach((b) => (b.age += dt));
    // overflow check: settled planets poking above the line
    const over = G.bodies.some((b) => b.age > 1 && b.y - b.r < LINE && Math.abs(b.vy) < 120);
    G.danger = over ? G.danger + dt : Math.max(0, G.danger - dt * 2);
    if (G.danger > 2.2) gameOver();
    hud.set('score', G.score);
  }

  function gameOver() {
    G.over = true;
    sfx.lose();
    const record = G.score > save.best;
    save.best = Math.max(save.best, G.score);
    YT.save(save);
    YT.sendScore(save.best);
    hud.set('best', save.best);
    const buttons = [];
    if (!G.revived) {
      buttons.push({
        label: 'Second chance', cls: 'ad', onClick: () => YT.rewarded('revive').then((ok) => {
          if (!ok) return endPanel(record);
          G.revived = true;
          // clear the top third of the jar
          G.bodies = G.bodies.filter((b) => { if (b.y < 520) { burst(b.x, b.y, TIERS[b.tier].c1, 8); return false; } return true; });
          G.danger = 0;
          G.over = false;
        }),
      });
    }
    buttons.push({ label: 'New game', cls: 'primary', onClick: () => YT.interstitial().then(newGame) });
    Kit.panel({ title: record ? 'New best! 🏆' : 'Jar overflowed!', body: '<div class="big">' + G.score + '</div><p>Best: ' + save.best + '</p>', buttons });
  }
  function endPanel(record) {
    Kit.panel({ title: record ? 'New best! 🏆' : 'Game over', body: '<div class="big">' + G.score + '</div>', buttons: [{ label: 'New game', cls: 'primary', onClick: () => YT.interstitial().then(newGame) }] });
  }

  // --- render ---------------------------------------------------------------------
  function planet(tier, x, y, r, rot) {
    const t = TIERS[tier];
    ctx.save();
    ctx.translate(x, y);
    if (t.glow) {
      const g = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.35);
      g.addColorStop(0, 'rgba(255,200,60,.5)');
      g.addColorStop(1, 'rgba(255,200,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2); ctx.fill();
    }
    if (t.ring) {
      ctx.strokeStyle = 'rgba(230,200,140,.85)';
      ctx.lineWidth = r * 0.14;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.35, -0.35, Math.PI, Math.PI * 2); ctx.stroke();
    }
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, t.c1);
    g.addColorStop(1, t.c2);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.rotate(rot || 0);
    if (t.land) {
      ctx.fillStyle = t.land;
      ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.1, r * 0.35, r * 0.25, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.35, r * 0.3, r * 0.3, r * 0.2, -0.3, 0, Math.PI * 2); ctx.fill();
    }
    if (t.bands) {
      ctx.fillStyle = 'rgba(160,90,40,.45)';
      for (let i = -2; i <= 2; i++) ctx.fillRect(-r, i * r * 0.3 - r * 0.06, r * 2, r * 0.12);
    }
    if (tier === 0 || tier === 1) {
      ctx.fillStyle = 'rgba(0,0,0,.15)';
      ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.arc(-r * 0.25, r * 0.35, r * 0.16, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (t.ring) {
      ctx.strokeStyle = 'rgba(230,200,140,.85)';
      ctx.lineWidth = r * 0.14;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.35, -0.35, 0, Math.PI); ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    st.begin();
    ctx.fillStyle = '#0d0f2b';
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      ctx.globalAlpha = 0.4 + Math.sin(s.t * 2) * 0.3;
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    if (!G) { st.end(); return; }
    // jar
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    Kit.roundRect(ctx, JAR.l - 6, JAR.top - 30, JAR.r - JAR.l + 12, JAR.bottom - JAR.top + 36, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(JAR.l - 3, JAR.top - 30);
    ctx.lineTo(JAR.l - 3, JAR.bottom + 3);
    ctx.lineTo(JAR.r + 3, JAR.bottom + 3);
    ctx.lineTo(JAR.r + 3, JAR.top - 30);
    ctx.stroke();
    // danger line
    ctx.strokeStyle = G.danger > 0 ? 'rgba(255,77,94,' + (0.5 + Math.sin(performance.now() / 80) * 0.5) + ')' : 'rgba(255,77,94,.35)';
    ctx.setLineDash([12, 10]);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(JAR.l, LINE); ctx.lineTo(JAR.r, LINE); ctx.stroke();
    ctx.setLineDash([]);
    // aim guide + next
    if (!G.over) {
      const t = TIERS[G.next];
      ctx.strokeStyle = 'rgba(255,255,255,.15)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(G.aimX, LINE - 20); ctx.lineTo(G.aimX, JAR.bottom); ctx.stroke();
      ctx.globalAlpha = G.cooldown > 0 ? 0.4 : 1;
      planet(G.next, G.aimX, LINE - t.r - 30, t.r, 0);
      ctx.globalAlpha = 1;
    }
    for (const b of G.bodies) planet(b.tier, b.x, b.y, b.r, b.rot);
    for (const f of G.fx) {
      ctx.globalAlpha = clamp(f.life * 2, 0, 1);
      ctx.fillStyle = f.col;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // next-up bubble
    Kit.text(ctx, 'NEXT', W - 70, 112, 13, 'rgba(255,255,255,.7)');
    planet(G.queue, W - 70, 150, Math.min(26, TIERS[G.queue].r), 0);
    // evolution strip
    const sx = 30, sy = 935;
    TIERS.forEach((t, i) => planet(i, sx + i * 53 + 10, sy, 11, 0));
    st.end();
  }

  Kit.boot('drop-merge', (data) => {
    save = Object.assign(save, data);
    newGame();
    Kit.loop(update, render);
  });
})();
