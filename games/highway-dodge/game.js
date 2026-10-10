/*
 * Highway Dodge — one-thumb lane switching. Tap the left or right side (or
 * swipe / arrow keys) to change lanes, weave through traffic, grab coins.
 * Passing cars closely builds a near-miss combo. Coins unlock new cars.
 */
(function () {
  'use strict';
  const { clamp, rand, sfx } = Kit;
  const W = 540, H = 960;
  const LANES = 4;
  const ROAD_L = 50, ROAD_R = 490;
  const LANE_W = (ROAD_R - ROAD_L) / LANES;
  const PLAYER_Y = 790;
  const CAR_W = 62, CAR_H = 112;
  const laneX = (i) => ROAD_L + LANE_W * (i + 0.5);

  const CARS = [
    { id: 'red', name: 'Red Rocket', color: '#e8384f', trim: '#ffd6d6', price: 0 },
    { id: 'blue', name: 'Blue Bolt', color: '#3d8bff', trim: '#d6e6ff', price: 150 },
    { id: 'lime', name: 'Lime Racer', color: '#7ed957', trim: '#1b1b2f', price: 400 },
    { id: 'gold', name: 'Gold Rush', color: '#ffcc33', trim: '#1b1b2f', price: 900 },
    { id: 'police', name: 'Patrol', color: '#1b1b2f', trim: '#ffffff', price: 1600, siren: true },
    { id: 'taxi', name: 'Taxi', color: '#ffd23f', trim: '#1b1b2f', price: 0, adOnly: true },
  ];
  const TRAFFIC_COLORS = ['#9aa0b4', '#6c5ce7', '#ff8f2b', '#21d4d4', '#ffffff', '#2ecc71', '#b45cff', '#8a6b4a'];

  let save = { coins: 0, best: 0, car: 'red', owned: { red: true }, runs: 0 };
  let G = null;
  const st = Kit.stage(W, H, { letterbox: '#101318' });
  const ctx = st.ctx;
  const hud = Kit.hud(
    [{ id: 'dist', label: 'Score', value: 0 }, { id: 'coins', label: 'Coins', value: 0 }, { id: 'combo', label: 'Combo', value: 'x1' }],
    [{ id: 'garage', label: '🚗 Garage', title: 'Change car', onClick: () => { if (!G || G.phase !== 'run') showGarage(); } }]
  );

  function newGame() {
    G = {
      phase: 'ready', lane: 1, x: laneX(1), speed: 520, dist: 0, score: 0, coinsRun: 0,
      traffic: [], coins: [], spawnT: 0.6, coinT: 1.2, combo: 1, comboT: 0, scroll: 0, revived: false, fx: [], t: 0,
    };
    hud.set('dist', 0);
    hud.set('coins', save.coins);
    hud.set('combo', 'x1');
  }

  function carDef() { return CARS.find((c) => c.id === save.car) || CARS[0]; }

  // --- input ------------------------------------------------------------------------
  let swipe = null;
  function shift(d) {
    if (!G) return;
    if (G.phase === 'ready') { G.phase = 'run'; return; }
    if (G.phase !== 'run') return;
    const nl = clamp(G.lane + d, 0, LANES - 1);
    if (nl !== G.lane) { G.lane = nl; Kit.audio.blip(500, 0.04, 'square', 0.05); }
  }
  st.on('down', (p) => { swipe = { x: p.x, y: p.y, used: false }; });
  st.on('move', (p) => {
    if (!swipe || swipe.used) return;
    const dx = p.x - swipe.x;
    if (Math.abs(dx) > 40) { shift(Math.sign(dx)); swipe.used = true; }
  });
  st.on('up', (p) => {
    if (swipe && !swipe.used) shift(p.x < W / 2 ? -1 : 1);
    swipe = null;
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') shift(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') shift(1);
  });

  // --- game loop ----------------------------------------------------------------------
  function spawnTraffic() {
    // never block every lane in the same row
    const free = [];
    for (let i = 0; i < LANES; i++) {
      const blocked = G.traffic.some((t) => t.lane === i && t.y < CAR_H * 1.6);
      if (!blocked) free.push(i);
    }
    if (free.length <= 1) return;
    const lane = Kit.pick(free);
    const rowFull = G.traffic.filter((t) => t.y < CAR_H * 2.2).map((t) => t.lane);
    if (new Set(rowFull.concat([lane])).size >= LANES) return;
    G.traffic.push({ lane, y: -CAR_H, v: rand(0.25, 0.55), color: Kit.pick(TRAFFIC_COLORS), passed: false, truck: Math.random() < 0.18 });
  }

  function update(dt) {
    if (!G) return;
    G.t += dt;
    G.fx.forEach((f) => { f.life -= dt; f.y += f.vy * dt; });
    G.fx = G.fx.filter((f) => f.life > 0);
    const tx = laneX(G.lane);
    G.x += (tx - G.x) * Math.min(1, dt * 16);
    if (G.phase !== 'run') return;
    G.speed = Math.min(1250, G.speed + dt * 9);
    G.dist += G.speed * dt;
    G.scroll = (G.scroll + G.speed * dt) % 80;
    G.score = Math.floor(G.dist / 40) + G.coinsRun * 5;
    G.comboT -= dt;
    if (G.comboT <= 0 && G.combo > 1) { G.combo = 1; hud.set('combo', 'x1'); }
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      spawnTraffic();
      G.spawnT = clamp(0.95 - G.speed / 2200, 0.32, 0.8) * rand(0.7, 1.2);
    }
    G.coinT -= dt;
    if (G.coinT <= 0) {
      G.coinT = rand(0.8, 1.8);
      const lane = Kit.randInt(0, LANES - 1);
      if (!G.traffic.some((t) => t.lane === lane && t.y < 200)) {
        for (let i = 0; i < 3; i++) G.coins.push({ lane, y: -40 - i * 70 });
      }
    }
    const pl = { x: G.x - CAR_W / 2 + 6, y: PLAYER_Y - CAR_H / 2 + 8, w: CAR_W - 12, h: CAR_H - 16 };
    for (const t of G.traffic) {
      t.y += G.speed * (1 - t.v) * dt;
      const h = t.truck ? CAR_H * 1.5 : CAR_H;
      const tb = { x: laneX(t.lane) - CAR_W / 2 + 4, y: t.y - h / 2 + 4, w: CAR_W - 8, h: h - 8 };
      if (pl.x < tb.x + tb.w && pl.x + pl.w > tb.x && pl.y < tb.y + tb.h && pl.y + pl.h > tb.y) { crash(); return; }
      // near miss: passing a car in the next lane
      if (!t.passed && t.y - h / 2 > PLAYER_Y + CAR_H / 2) {
        t.passed = true;
        if (Math.abs(laneX(t.lane) - G.x) < LANE_W * 1.2) {
          G.combo = Math.min(10, G.combo + 1);
          G.comboT = 2.2;
          const bonus = 5 * G.combo;
          G.dist += bonus * 40;
          hud.set('combo', 'x' + G.combo);
          G.fx.push({ x: G.x, y: PLAYER_Y - 80, text: 'NEAR MISS +' + bonus, life: 0.8, vy: -60 });
          Kit.audio.blip(700 + G.combo * 60, 0.06, 'triangle', 0.1);
        }
      }
    }
    G.traffic = G.traffic.filter((t) => t.y < H + 200);
    for (const c of G.coins) {
      c.y += G.speed * dt;
      if (!c.got && c.lane === G.lane && Math.abs(c.y - PLAYER_Y) < CAR_H / 2) {
        c.got = true;
        G.coinsRun++;
        sfx.coin();
      }
    }
    G.coins = G.coins.filter((c) => !c.got && c.y < H + 40);
    hud.set('dist', G.score);
    hud.set('coins', save.coins + G.coinsRun);
  }

  function crash() {
    G.phase = 'crashed';
    sfx.crash();
    G.shake = 0.4;
    setTimeout(() => {
      const buttons = [];
      if (!G.revived) {
        buttons.push({
          label: 'Revive', cls: 'ad', onClick: () => YT.rewarded('revive').then((ok) => {
            if (!ok) return endRun();
            G.revived = true;
            G.traffic = G.traffic.filter((t) => t.y < PLAYER_Y - 400);
            G.phase = 'run';
            Kit.toast('Go go go!');
          }),
        });
      }
      buttons.push({ label: 'End run', cls: 'primary', onClick: endRun });
      Kit.panel({ title: 'Crash! 💥', body: '<div class="big">' + G.score + '</div><p>🪙 ' + G.coinsRun + ' coins this run</p>', buttons });
    }, 600);
  }

  function endRun() {
    const record = G.score > save.best;
    save.best = Math.max(save.best, G.score);
    save.runs++;
    YT.sendScore(save.best);
    const bank = (m) => {
      save.coins += G.coinsRun * m;
      YT.save(save);
      const next = () => newGame();
      if (save.runs % 3 === 0) YT.interstitial().then(next); else next();
    };
    Kit.panel({
      title: record ? 'New best! 🏆' : 'Run over',
      body: '<div class="big">' + G.score + '</div><p>Best: ' + save.best + ' · Coins: 🪙 ' + G.coinsRun + '</p>',
      buttons: [
        { label: 'Double coins', cls: 'ad', disabled: !G.coinsRun, onClick: () => YT.rewarded('double_coins').then((ok) => bank(ok ? 2 : 1)) },
        { label: 'Play again', cls: 'primary', onClick: () => bank(1) },
      ],
    });
  }

  function showGarage() {
    const body = Kit.el('div');
    body.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center';
    const p = Kit.panel({ title: '🚗 Garage', body, buttons: [{ label: 'Close', cls: 'ghost' }] });
    CARS.forEach((c) => {
      const owned = !!save.owned[c.id];
      const b = Kit.el('button', 'kit-btn' + (save.car === c.id ? ' green' : c.adOnly && !owned ? ' ad' : ''),
        '<span style="display:inline-block;width:18px;height:28px;border-radius:5px;vertical-align:middle;margin-right:6px;background:' + c.color + ';border:2px solid ' + c.trim + '"></span>' +
        c.name + '<br><small style="font-weight:600;opacity:.8">' + (save.car === c.id ? 'Driving' : owned ? 'Select' : c.adOnly ? 'Watch ad' : '🪙 ' + c.price) + '</small>');
      b.type = 'button';
      b.style.fontSize = '13px';
      b.disabled = !owned && !c.adOnly && save.coins < c.price;
      b.addEventListener('click', () => {
        if (owned) { save.car = c.id; YT.save(save); p.close(); sfx.tap(); return; }
        if (c.adOnly) {
          YT.rewarded('car_' + c.id).then((ok) => {
            if (!ok) return;
            save.owned[c.id] = true; save.car = c.id; YT.save(save); p.close(); sfx.good();
          });
          return;
        }
        if (save.coins >= c.price) {
          save.coins -= c.price; save.owned[c.id] = true; save.car = c.id;
          YT.save(save); hud.set('coins', save.coins); p.close(); sfx.coin();
        }
      });
      body.appendChild(b);
    });
  }

  // --- render -------------------------------------------------------------------------
  function drawCar(x, y, color, trim, truck, siren) {
    const h = truck ? CAR_H * 1.5 : CAR_H;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    Kit.roundRect(ctx, -CAR_W / 2 + 4, -h / 2 + 8, CAR_W, h, 14);
    ctx.fill();
    ctx.fillStyle = color;
    Kit.roundRect(ctx, -CAR_W / 2, -h / 2, CAR_W, h, 14);
    ctx.fill();
    if (truck) {
      ctx.fillStyle = 'rgba(0,0,0,.15)';
      ctx.fillRect(-CAR_W / 2 + 6, -h / 2 + 44, CAR_W - 12, h - 52);
      ctx.fillStyle = '#29324a';
      Kit.roundRect(ctx, -CAR_W / 2 + 8, h / 2 - 34, CAR_W - 16, 18, 5);
      ctx.fill();
    } else {
      ctx.fillStyle = '#29324a';
      Kit.roundRect(ctx, -CAR_W / 2 + 8, -h / 2 + 22, CAR_W - 16, 22, 6);
      ctx.fill();
      Kit.roundRect(ctx, -CAR_W / 2 + 8, h / 2 - 34, CAR_W - 16, 16, 5);
      ctx.fill();
      ctx.fillStyle = trim;
      ctx.fillRect(-4, -h / 2 + 50, 8, h - 90);
    }
    if (siren) {
      ctx.fillStyle = Math.floor(performance.now() / 150) % 2 ? '#ff3b3b' : '#3b7bff';
      ctx.fillRect(-14, -6, 28, 10);
    }
    ctx.fillStyle = '#fff6b0';
    ctx.fillRect(-CAR_W / 2 + 6, -h / 2 + 2, 12, 6);
    ctx.fillRect(CAR_W / 2 - 18, -h / 2 + 2, 12, 6);
    ctx.restore();
  }

  function render() {
    st.begin();
    if (G && G.shake > 0) { G.shake -= 1 / 60; ctx.translate(rand(-8, 8), rand(-8, 8)); }
    ctx.fillStyle = '#3c8d3a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2f3542';
    ctx.fillRect(ROAD_L - 10, 0, ROAD_R - ROAD_L + 20, H);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(ROAD_L - 10, 0, 6, H);
    ctx.fillRect(ROAD_R + 4, 0, 6, H);
    if (!G) { st.end(); return; }
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 1; i < LANES; i++) {
      const x = ROAD_L + LANE_W * i - 3;
      for (let y = -80 + G.scroll; y < H; y += 80) ctx.fillRect(x, y, 6, 40);
    }
    // roadside trees
    for (let y = -120 + ((G.scroll * 1.5) % 120); y < H; y += 120) {
      ctx.font = '30px serif';
      ctx.textAlign = 'center';
      ctx.fillText('🌲', 22, y);
      ctx.fillText('🌳', W - 22, y + 60);
    }
    for (const c of G.coins) {
      const x = laneX(c.lane);
      ctx.fillStyle = '#ffcc33';
      ctx.beginPath(); ctx.arc(x, c.y, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b8860b';
      ctx.beginPath(); ctx.arc(x, c.y, 8, 0, Math.PI * 2); ctx.fill();
    }
    for (const t of G.traffic) drawCar(laneX(t.lane), t.y, t.color, 'rgba(0,0,0,.2)', t.truck);
    const me = carDef();
    drawCar(G.x, PLAYER_Y, me.color, me.trim, false, me.siren);
    for (const f of G.fx) {
      ctx.globalAlpha = clamp(f.life * 2, 0, 1);
      Kit.text(ctx, f.text, f.x, f.y, 24, '#ffd84d');
    }
    ctx.globalAlpha = 1;
    if (G.phase === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      Kit.roundRect(ctx, 60, 330, W - 120, 200, 24);
      ctx.fill();
      Kit.text(ctx, 'HIGHWAY DODGE', W / 2, 385, 40, '#fff');
      Kit.text(ctx, 'Tap left / right to switch lanes', W / 2, 440, 20, 'rgba(255,255,255,.85)', 'center', '600');
      Kit.text(ctx, 'Tap to start', W / 2, 490, 26, '#ffd84d');
    }
    st.end();
  }

  Kit.boot('highway-dodge', (data) => {
    save = Object.assign(save, data);
    save.owned = Object.assign({ red: true }, data.owned || {});
    newGame();
    Kit.loop(update, render);
  });
})();
