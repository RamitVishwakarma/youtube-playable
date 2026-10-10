/*
 * Brain Trick — riddles whose answer breaks the rules. Drag things off the
 * screen, tap words in the question, flip numbers… Each level is a tiny
 * scene built from draggable / tappable objects.
 */
(function () {
  'use strict';
  const { sfx } = Kit;
  const W = 540, H = 960;

  // --- scene objects -----------------------------------------------------------
  // kind: emoji | text | button | custom
  function obj(o) {
    return Object.assign({ x: 0, y: 0, size: 80, visible: true, drag: false, z: 0, shake: 0 }, o);
  }

  const LEVELS = [
    {
      q: 'Tap the BIGGEST animal',
      hint: 'Size on screen is not real size…',
      init(S) {
        S.add(obj({ id: 'mouse', kind: 'emoji', label: '🐭', x: 150, y: 470, size: 170 }));
        S.add(obj({ id: 'elephant', kind: 'emoji', label: '🐘', x: 400, y: 420, size: 90 }));
        S.add(obj({ id: 'whale', kind: 'emoji', label: '🐋', x: 380, y: 700, size: 48 }));
        S.add(obj({ id: 'cat', kind: 'emoji', label: '🐈', x: 150, y: 720, size: 110 }));
      },
      onTap(S, o) { o.id === 'whale' ? S.win() : S.wrong(o); },
    },
    {
      q: 'Which is heavier?',
      hint: 'Read the weights carefully.',
      init(S) {
        S.add(obj({ id: 'a', kind: 'button', label: '1 kg of feathers 🪶', x: W / 2, y: 430, w: 400, h: 90 }));
        S.add(obj({ id: 'b', kind: 'button', label: '1 kg of iron 🔩', x: W / 2, y: 550, w: 400, h: 90 }));
        S.add(obj({ id: 'c', kind: 'button', label: 'Neither', x: W / 2, y: 670, w: 400, h: 90 }));
      },
      onTap(S, o) { o.id === 'c' ? S.win() : S.wrong(o); },
    },
    {
      q: 'Help the baby fall asleep',
      hint: 'Babies sleep at night. Move the sun away.',
      init(S) {
        S.add(obj({ id: 'sun', kind: 'emoji', label: '☀️', x: 400, y: 330, size: 120, drag: true }));
        S.add(obj({ id: 'baby', kind: 'emoji', label: '👶', x: W / 2, y: 650, size: 150 }));
      },
      onTap(S, o) { if (o.id === 'baby') S.wrong(o); },
      onDrop(S, o) {
        if (o.id === 'sun' && (o.y > 820 || o.x < 20 || o.x > W - 20 || o.y < 230)) {
          o.visible = false;
          S.night = true;
          S.get('baby').label = '😴';
          S.win();
        }
      },
    },
    {
      q: 'Tap the odd one out',
      hint: 'One of them is not like the others.',
      init(S) {
        const items = ['🍎', '🍎', '🍎', '🍅', '🍎', '🍎', '🍎', '🍎', '🍎'];
        items.forEach((e, i) => S.add(obj({ id: 'f' + i, kind: 'emoji', label: e, x: 135 + (i % 3) * 135, y: 400 + Math.floor(i / 3) * 140, size: 96, odd: e === '🍅' })));
      },
      onTap(S, o) { o.odd ? S.win() : S.wrong(o); },
    },
    {
      q: 'Put the elephant in the fridge',
      hint: 'Open the door first. Then close it!',
      init(S) {
        S.add(obj({ id: 'fridge', kind: 'custom', x: 380, y: 560, w: 180, h: 320, draw: drawFridge }));
        S.add(obj({ id: 'el', kind: 'emoji', label: '🐘', x: 130, y: 720, size: 120, drag: true, z: 2 }));
        S.step = 0; // 0 closed, 1 open, 2 elephant in, 3 closed again
      },
      onTap(S, o) {
        if (o.id !== 'fridge') return;
        if (S.step === 0) { S.step = 1; sfx.tap(); }
        else if (S.step === 2) { S.step = 3; S.win(); }
        else if (S.step === 1) { S.step = 0; sfx.tap(); }
      },
      onDrop(S, o) {
        const f = S.get('fridge');
        if (o.id === 'el' && S.step === 1 && Math.abs(o.x - f.x) < 100 && Math.abs(o.y - f.y) < 170) {
          o.visible = false;
          S.step = 2;
          sfx.good();
        }
      },
    },
    {
      q: 'Find the hidden apple',
      hint: 'Something is hiding behind the bush.',
      init(S) {
        S.add(obj({ id: 'apple', kind: 'emoji', label: '🍎', x: 360, y: 650, size: 70 }));
        S.add(obj({ id: 'bush', kind: 'emoji', label: '🌳', x: 360, y: 620, size: 220, drag: true, z: 2 }));
        S.add(obj({ id: 'house', kind: 'emoji', label: '🏠', x: 130, y: 640, size: 150 }));
      },
      onTap(S, o) {
        if (o.id === 'apple') S.win();
        else if (o.id === 'house') S.wrong(o);
      },
    },
    {
      q: 'Make the sum correct',
      hint: 'Tap a number… what happens if you turn it upside down?',
      init(S) {
        const parts = ['6', '+', '3', '=', '6'];
        parts.forEach((p, i) => S.add(obj({ id: 'p' + i, kind: 'text', label: p, x: 110 + i * 80, y: 560, size: 110 })));
      },
      onTap(S, o) {
        if (o.label === '6' || o.label === '9') {
          o.label = o.label === '6' ? '9' : '6';
          o.spin = 1;
          sfx.tap();
          const a = +S.get('p0').label, b = +S.get('p2').label, c = +S.get('p4').label;
          if (a + b === c) S.win();
        } else S.wrong(o);
      },
    },
    {
      q: 'Which line is longer?',
      hint: 'Ignore the arrows. Measure the lines.',
      init(S) {
        S.add(obj({ id: 'lines', kind: 'custom', x: W / 2, y: 470, w: 400, h: 260, draw: drawIllusion }));
        S.add(obj({ id: 'top', kind: 'button', label: 'Top', x: 130, y: 740, w: 140, h: 80 }));
        S.add(obj({ id: 'bottom', kind: 'button', label: 'Bottom', x: 270, y: 740, w: 140, h: 80 }));
        S.add(obj({ id: 'same', kind: 'button', label: 'Same', x: 410, y: 740, w: 140, h: 80 }));
      },
      onTap(S, o) {
        if (o.id === 'same') S.win();
        else if (o.kind === 'button') S.wrong(o);
      },
    },
    {
      q: 'Tap the button 10 times',
      hint: 'It runs away… but it always stays on screen.',
      init(S) {
        S.count = 0;
        S.add(obj({ id: 'btn', kind: 'button', label: 'TAP (0)', x: W / 2, y: 600, w: 170, h: 80 }));
      },
      onTap(S, o) {
        if (o.id !== 'btn') return;
        S.count++;
        o.label = 'TAP (' + S.count + ')';
        sfx.tap();
        if (S.count >= 10) { S.win(); return; }
        o.x = Kit.rand(100, W - 100);
        o.y = Kit.rand(330, 860);
      },
    },
    {
      q: 'Wake him up!',
      hint: 'Tapping is not loud enough. Use the clock.',
      init(S) {
        S.add(obj({ id: 'man', kind: 'emoji', label: '😴', x: W / 2, y: 520, size: 170 }));
        S.add(obj({ id: 'clock', kind: 'emoji', label: '⏰', x: 110, y: 820, size: 80, drag: true, z: 2 }));
      },
      onTap(S, o) { if (o.id === 'man') S.wrong(o); },
      onDrop(S, o) {
        const m = S.get('man');
        if (o.id === 'clock' && Math.hypot(o.x - m.x, o.y - m.y) < 120) {
          m.label = '😳';
          Kit.audio.blip(1200, 0.4, 'square', 0.08);
          S.win();
        }
      },
    },
    {
      q: 'Get an apple from the tree',
      hint: 'Grab the tree and shake it left and right!',
      init(S) {
        S.shakes = 0;
        S.add(obj({ id: 'tree', kind: 'emoji', label: '🌳', x: W / 2, y: 520, size: 300, drag: true, lockY: true }));
        S.add(obj({ id: 'apple', kind: 'emoji', label: '🍎', x: W / 2 + 40, y: 470, size: 54, visible: false, z: 3 }));
      },
      onDrag(S, o, dx) {
        if (o.id !== 'tree') return;
        const dir = Math.sign(dx);
        if (dir && dir !== S.lastDir && Math.abs(o.x - W / 2) > 30) { S.shakes++; S.lastDir = dir; }
        if (S.shakes >= 4 && !S.get('apple').visible) {
          const a = S.get('apple');
          a.visible = true;
          a.falling = true;
          sfx.pop();
        }
      },
      onDrop(S, o) { if (o.id === 'tree') o.x = W / 2; },
      update(S, dt) {
        const a = S.get('apple');
        if (a.falling) { a.vy = (a.vy || 0) + 1600 * dt; a.y += a.vy * dt; if (a.y > 800) { a.y = 800; a.falling = false; } }
      },
      onTap(S, o) { if (o.id === 'apple') S.win(); },
    },
    {
      q: 'Open the lock 🔒 with the key',
      hint: 'The key is somewhere in the question…',
      textQ: true,
      init(S) {
        S.add(obj({ id: 'lock', kind: 'emoji', label: '🔒', x: W / 2, y: 620, size: 150 }));
        S.add(obj({ id: 'key', kind: 'text', label: 'key', x: 383, y: 265, size: 30, drag: true, z: 3, color: '#fff', home: true }));
      },
      onTap(S, o) { if (o.id === 'lock') S.wrong(o); },
      onDrop(S, o) {
        const l = S.get('lock');
        if (o.id === 'key' && Math.hypot(o.x - l.x, o.y - l.y) < 110) {
          l.label = '🔓';
          o.visible = false;
          S.win();
        }
      },
    },
    {
      q: 'Light the candle',
      hint: 'Fire is hot. Drag it.',
      init(S) {
        S.add(obj({ id: 'candle', kind: 'emoji', label: '🕯️', x: 160, y: 640, size: 150 }));
        S.add(obj({ id: 'water', kind: 'emoji', label: '💧', x: 400, y: 420, size: 80, drag: true }));
        S.add(obj({ id: 'fire', kind: 'emoji', label: '🔥', x: 400, y: 800, size: 70, drag: true }));
      },
      onTap(S, o) { if (o.id === 'candle') S.wrong(o); },
      onDrop(S, o) {
        const c = S.get('candle');
        if (Math.hypot(o.x - c.x, o.y - (c.y - 50)) < 90) {
          if (o.id === 'fire') { o.x = c.x; o.y = c.y - 90; o.drag = false; S.win(); }
          else { S.wrong(c); o.x = 400; o.y = 420; }
        }
      },
    },
    {
      q: 'Stop the rain',
      hint: 'No cloud, no rain.',
      init(S) {
        S.add(obj({ id: 'cloud', kind: 'emoji', label: '🌧️', x: W / 2, y: 380, size: 180, drag: true }));
        S.add(obj({ id: 'girl', kind: 'emoji', label: '😢', x: W / 2, y: 760, size: 130 }));
        S.add(obj({ id: 'umbrella', kind: 'emoji', label: '☂️', x: 100, y: 860, size: 70, drag: true }));
      },
      onTap(S, o) { if (o.id === 'girl') S.wrong(o); },
      onDrop(S, o) {
        if (o.id === 'cloud' && (o.x < 30 || o.x > W - 30 || o.y < 240)) {
          o.visible = false;
          S.get('girl').label = '😄';
          S.win();
        }
      },
      update(S, dt) {
        const c = S.get('cloud');
        S.drops = S.drops || [];
        if (c.visible && Math.random() < 0.6) S.drops.push({ x: c.x + Kit.rand(-60, 60), y: c.y + 40 });
        S.drops.forEach((d) => (d.y += 700 * dt));
        S.drops = S.drops.filter((d) => d.y < H);
      },
    },
    {
      q: 'Help the chick find its mom',
      hint: 'The chick is too small to walk that far. Mom can.',
      init(S) {
        S.add(obj({ id: 'wall', kind: 'custom', x: W / 2, y: 600, w: 30, h: 420, draw: drawWall }));
        S.add(obj({ id: 'chick', kind: 'emoji', label: '🐥', x: 110, y: 760, size: 80 }));
        S.add(obj({ id: 'hen', kind: 'emoji', label: '🐔', x: 430, y: 520, size: 120, drag: true }));
      },
      onTap(S, o) { if (o.id === 'chick') S.wrong(o); },
      onDrop(S, o) {
        const c = S.get('chick');
        if (o.id === 'hen' && Math.hypot(o.x - c.x, o.y - c.y) < 130) { c.label = '🐣'; S.win(); }
      },
    },
  ];

  function drawFridge(ctx, o, S) {
    ctx.fillStyle = '#e8edf5';
    Kit.roundRect(ctx, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 16);
    ctx.fill();
    ctx.fillStyle = '#c4ccdb';
    ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2 + 110, o.w, 6);
    if (S.step === 1 || S.step === 2) {
      ctx.fillStyle = '#9fd6ff';
      Kit.roundRect(ctx, o.x - o.w / 2 + 10, o.y - o.h / 2 + 10, o.w - 20, o.h - 20, 10);
      ctx.fill();
      if (S.step === 2) { ctx.font = '90px serif'; ctx.textAlign = 'center'; ctx.fillText('🐘', o.x, o.y + 30); }
      ctx.fillStyle = '#d6dce8';
      ctx.fillRect(o.x - o.w / 2 - 70, o.y - o.h / 2, 60, o.h);
    } else {
      ctx.fillStyle = '#8b93a7';
      ctx.fillRect(o.x + o.w / 2 - 26, o.y - o.h / 2 + 40, 8, 50);
      ctx.fillRect(o.x + o.w / 2 - 26, o.y - o.h / 2 + 140, 8, 70);
    }
  }
  function drawIllusion(ctx, o) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    const L = 260;
    const draw = (y, outward) => {
      const x1 = o.x - L / 2, x2 = o.x + L / 2, a = 34 * (outward ? -1 : 1);
      ctx.beginPath();
      ctx.moveTo(x1, y); ctx.lineTo(x2, y);
      ctx.moveTo(x1, y); ctx.lineTo(x1 - a, y - 30); ctx.moveTo(x1, y); ctx.lineTo(x1 - a, y + 30);
      ctx.moveTo(x2, y); ctx.lineTo(x2 + a, y - 30); ctx.moveTo(x2, y); ctx.lineTo(x2 + a, y + 30);
      ctx.stroke();
    };
    draw(o.y - 70, true);
    draw(o.y + 70, false);
  }
  function drawWall(ctx, o) {
    ctx.fillStyle = '#9c6b3f';
    Kit.roundRect(ctx, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 8);
    ctx.fill();
  }

  // --- engine ---------------------------------------------------------------
  let save = { level: 0 };
  let S = null;
  const st = Kit.stage(W, H, { letterbox: '#1b1035' });
  const ctx = st.ctx;
  const hud = Kit.hud(
    [{ id: 'lvl', label: 'Level', value: 1 }],
    [
      { id: 'hint', label: 'Hint', title: 'Watch an ad for a hint', onClick: showHint },
      { id: 'skip', label: 'Skip', title: 'Watch an ad to skip', onClick: skip },
    ]
  );
  hud.btn('hint').classList.add('ad');
  hud.btn('skip').classList.add('ad');

  function startLevel(n) {
    const def = LEVELS[n % LEVELS.length];
    S = {
      n, def, objs: [], done: false,
      add(o) { this.objs.push(o); return o; },
      get(id) { return this.objs.find((o) => o.id === id); },
      win() {
        if (this.done) return;
        this.done = true;
        sfx.win();
        setTimeout(onWin, 700);
      },
      wrong(o) { o.shake = 0.4; sfx.bad(); },
    };
    def.init(S);
    hud.set('lvl', n + 1);
  }

  function onWin() {
    const n = S.n;
    save.level = Math.max(save.level, n + 1);
    YT.save(save);
    YT.sendScore(save.level);
    const lap = n + 1 === LEVELS.length;
    Kit.panel({
      title: lap ? 'Genius! 🧠' : 'Correct! ✅',
      body: lap ? '<p>You solved every riddle. Play them again?</p>' : '<p>Level ' + (n + 1) + ' solved.</p>',
      buttons: [{
        label: 'Next', cls: 'primary',
        onClick: () => (n % 3 === 2 ? YT.interstitial() : Promise.resolve()).then(() => startLevel(n + 1)),
      }],
    });
  }

  function showHint() {
    if (!S || S.done) return;
    YT.rewarded('hint').then((ok) => {
      if (ok) Kit.panel({ title: '💡 Hint', body: '<p>' + S.def.hint + '</p>', buttons: [{ label: 'Got it', cls: 'primary' }] });
    });
  }
  function skip() {
    if (!S || S.done) return;
    YT.rewarded('skip_level').then((ok) => {
      if (!ok) return;
      save.level = Math.max(save.level, S.n + 1);
      YT.save(save);
      startLevel(S.n + 1);
    });
  }

  function measure(o) {
    if (o.kind === 'button' || o.kind === 'custom') return { w: o.w, h: o.h };
    if (o.kind === 'text') {
      ctx.font = '800 ' + o.size + 'px system-ui, sans-serif';
      return { w: ctx.measureText(o.label).width + 16, h: o.size };
    }
    return { w: o.size * 1.05, h: o.size * 1.05 };
  }
  function hit(p) {
    const list = S.objs.filter((o) => o.visible).sort((a, b) => b.z - a.z);
    for (const o of list) {
      const m = measure(o);
      if (Math.abs(p.x - o.x) <= m.w / 2 && Math.abs(p.y - o.y) <= m.h / 2) return o;
    }
    return null;
  }

  let grab = null;
  st.on('down', (p) => {
    if (!S || S.done) return;
    const o = hit(p);
    if (!o) return;
    grab = { o, sx: p.x, sy: p.y, ox: o.x, oy: o.y, lx: p.x, moved: false };
  });
  st.on('move', (p) => {
    if (!grab || !S || S.done) return;
    if (Math.hypot(p.x - grab.sx, p.y - grab.sy) > 10) grab.moved = true;
    const o = grab.o;
    if (o.drag && grab.moved) {
      o.home = false;
      o.x = Kit.clamp(grab.ox + p.x - grab.sx, 0, W);
      if (!o.lockY) o.y = Kit.clamp(grab.oy + p.y - grab.sy, 0, H);
      if (S.def.onDrag) S.def.onDrag(S, o, p.x - grab.lx);
      grab.lx = p.x;
    }
  });
  st.on('up', () => {
    if (!grab || !S) { grab = null; return; }
    const g = grab;
    grab = null;
    if (S.done) return;
    if (!g.moved) { if (S.def.onTap) S.def.onTap(S, g.o); }
    else if (g.o.drag && S.def.onDrop) S.def.onDrop(S, g.o);
  });

  function update(dt) {
    if (!S) return;
    for (const o of S.objs) {
      if (o.shake > 0) o.shake = Math.max(0, o.shake - dt);
      if (o.spin > 0) o.spin = Math.max(0, o.spin - dt * 3);
    }
    if (S.def.update) S.def.update(S, dt);
  }

  function wrapText(str, x, y, maxW, size) {
    ctx.font = '800 ' + size + 'px system-ui, sans-serif';
    const words = str.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    lines.push(line);
    lines.forEach((l, i) => Kit.text(ctx, l, x, y + i * size * 1.2, size, '#fff'));
  }

  function render() {
    st.begin();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (S && S.night) { g.addColorStop(0, '#0b1030'); g.addColorStop(1, '#1d2552'); }
    else { g.addColorStop(0, '#5b2bb5'); g.addColorStop(1, '#2a1a6b'); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (!S) { st.end(); return; }
    // question card
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    Kit.roundRect(ctx, 30, 200, W - 60, 130, 22);
    ctx.fill();
    if (S.def.textQ) {
      // the word "key" is a separate draggable object sitting in the sentence
      const lead = 'Open the lock 🔒 with the ';
      ctx.font = '800 30px system-ui, sans-serif';
      const lw = ctx.measureText(lead).width;
      const kw = ctx.measureText('key').width;
      const x0 = (W - lw - kw) / 2;
      Kit.text(ctx, lead, x0, 265, 30, '#fff', 'left');
      const k = S.get('key');
      if (k.home) { k.x = x0 + lw + kw / 2; k.y = 265; }
    } else {
      wrapText(S.def.q, W / 2, 250, W - 100, 34);
    }
    if (S.drops) {
      ctx.strokeStyle = 'rgba(160,200,255,.7)';
      ctx.lineWidth = 3;
      for (const d of S.drops) { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y + 16); ctx.stroke(); }
    }
    const list = S.objs.filter((o) => o.visible).sort((a, b) => a.z - b.z);
    for (const o of list) {
      ctx.save();
      const sx = o.shake > 0 ? Math.sin(o.shake * 60) * 8 : 0;
      ctx.translate(o.x + sx, o.y);
      if (o.spin) ctx.rotate(o.spin * Math.PI);
      if (o.kind === 'emoji') {
        ctx.font = o.size + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(o.label, 0, 0);
      } else if (o.kind === 'text') {
        Kit.text(ctx, o.label, 0, 0, o.size, o.color || '#ffd84d');
      } else if (o.kind === 'button') {
        ctx.fillStyle = '#ff5a8a';
        Kit.roundRect(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 18);
        ctx.fill();
        Kit.text(ctx, o.label, 0, 0, 26, '#fff');
      } else if (o.kind === 'custom') {
        ctx.translate(-o.x - sx, -o.y);
        o.draw(ctx, o, S);
      }
      ctx.restore();
    }
    st.end();
  }

  Kit.boot('brain-trick', (data) => {
    save = Object.assign({ level: 0 }, data);
    startLevel(save.level);
    Kit.loop(update, render);
  });
})();
