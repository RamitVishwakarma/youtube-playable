/*
 * Bolt Sort — tap a bolt to lift the top nuts, tap another bolt to drop them.
 * Nuts only stack on an empty bolt or on a nut of the same colour.
 * Fill every bolt with a single colour to win. Every level is checked by a
 * solver before it is shown, so it is always solvable.
 */
(function () {
  'use strict';
  const { sfx } = Kit;
  const W = 540, H = 960;
  const CAP = 4;
  const COLORS = ['#ff4d5e', '#3d8bff', '#ffd23f', '#2ecc71', '#b45cff', '#ff8f2b', '#21d4d4', '#ff6fd1', '#8a6b4a', '#e8e8f0'];

  let save = { level: 0 };
  let G = null;

  const st = Kit.stage(W, H, { letterbox: '#16142b' });
  const hud = Kit.hud(
    [{ id: 'lvl', label: 'Level', value: 1 }, { id: 'moves', label: 'Moves', value: 0 }],
    [
      { id: 'undo', label: '↶', title: 'Undo', onClick: undo },
      { id: 'bolt', label: '+Bolt', title: 'Watch an ad for an extra bolt', onClick: extraBolt },
      { id: 'retry', label: '↻', title: 'Restart', onClick: () => startLevel(save.level) },
    ]
  );
  hud.btn('bolt').classList.add('ad');

  // --- level generation -----------------------------------------------------
  function colorsFor(n) { return Math.min(COLORS.length, 3 + Math.floor(n / 2)); }

  function solvable(bolts) {
    const key = (s) => s.map((b) => b.join('')).sort().join('|');
    const seen = new Set();
    let budget = 40000;
    function done(s) { return s.every((b) => b.length === 0 || (b.length === CAP && b.every((c) => c === b[0]))); }
    function dfs(s) {
      if (done(s)) return true;
      if (--budget <= 0) return false;
      const k = key(s);
      if (seen.has(k)) return false;
      seen.add(k);
      for (let i = 0; i < s.length; i++) {
        const a = s[i];
        if (!a.length) continue;
        const top = a[a.length - 1];
        let run = 1;
        while (run < a.length && a[a.length - 1 - run] === top) run++;
        const uniform = run === a.length;
        for (let j = 0; j < s.length; j++) {
          if (i === j) continue;
          const b = s[j];
          if (b.length >= CAP) continue;
          if (b.length && b[b.length - 1] !== top) continue;
          if (!b.length && uniform) continue; // pointless
          const moveN = Math.min(run, CAP - b.length);
          const next = s.map((x) => x.slice());
          for (let m = 0; m < moveN; m++) next[j].push(next[i].pop());
          if (dfs(next)) return true;
        }
      }
      return false;
    }
    return dfs(bolts.map((b) => b.slice()));
  }

  function genLevel(n) {
    const k = colorsFor(n);
    const rng = Kit.seeded(n * 104729 + 7);
    for (let attempt = 0; attempt < 60; attempt++) {
      const nuts = [];
      for (let c = 0; c < k; c++) for (let i = 0; i < CAP; i++) nuts.push(c);
      for (let i = nuts.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [nuts[i], nuts[j]] = [nuts[j], nuts[i]];
      }
      const bolts = [];
      for (let c = 0; c < k; c++) bolts.push(nuts.slice(c * CAP, c * CAP + CAP));
      bolts.push([], []);
      const trivial = bolts.some((b) => b.length === CAP && b.every((x) => x === b[0]));
      if (!trivial && solvable(bolts)) return bolts;
    }
    // Fallback: an easy but valid layout.
    const bolts = [];
    for (let c = 0; c < k; c++) bolts.push([c, c, c, (c + 1) % k]);
    bolts.push([], []);
    return bolts;
  }

  function layout() {
    const n = G.bolts.length;
    const perRow = n <= 5 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / perRow);
    const gap = Math.min(96, (W - 40) / perRow);
    G.pos = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - r * perRow);
      const c = i - r * perRow;
      const x = W / 2 + (c - (inRow - 1) / 2) * gap;
      const y = rows === 1 ? 640 : 470 + r * 330;
      G.pos.push({ x, y });
    }
    G.nutW = Math.min(78, gap - 12);
  }

  function startLevel(n) {
    G = { n, bolts: genLevel(n), sel: -1, moves: 0, history: [], extra: false, done: [], anim: [], won: false };
    G.done = G.bolts.map(() => false);
    layout();
    hud.set('lvl', n + 1);
    hud.set('moves', 0);
    hud.btn('bolt').disabled = false;
  }

  function runOf(b) {
    if (!b.length) return 0;
    const top = b[b.length - 1];
    let run = 1;
    while (run < b.length && b[b.length - 1 - run] === top) run++;
    return run;
  }

  function hitBolt(p) {
    for (let i = 0; i < G.pos.length; i++) {
      const q = G.pos[i];
      if (Math.abs(p.x - q.x) < G.nutW / 2 + 8 && p.y > q.y - 260 && p.y < q.y + 40) return i;
    }
    return -1;
  }

  st.on('down', (p) => {
    if (!G || G.won) return;
    const i = hitBolt(p);
    if (i < 0) { G.sel = -1; return; }
    if (G.sel < 0) {
      if (G.bolts[i].length && !G.done[i]) { G.sel = i; sfx.tap(); }
      return;
    }
    if (i === G.sel) { G.sel = -1; return; }
    tryMove(G.sel, i);
  });

  function tryMove(a, b) {
    const A = G.bolts[a], B = G.bolts[b];
    const top = A[A.length - 1];
    if (B.length >= CAP || (B.length && B[B.length - 1] !== top) || G.done[b]) {
      sfx.bad();
      G.shake = { i: b, t: 0.3 };
      if (G.bolts[b].length && !G.done[b]) G.sel = b; else G.sel = -1;
      return;
    }
    const moveN = Math.min(runOf(A), CAP - B.length);
    G.history.push(G.bolts.map((x) => x.slice()));
    for (let m = 0; m < moveN; m++) B.push(A.pop());
    G.sel = -1;
    G.moves++;
    hud.set('moves', G.moves);
    Kit.audio.blip(520 + B.length * 60, 0.07, 'triangle', 0.14);
    if (B.length === CAP && B.every((c) => c === B[0])) {
      G.done[b] = true;
      G.anim.push({ i: b, t: 0 });
      sfx.good();
    }
    checkWin();
  }

  function undo() {
    if (!G || G.won || !G.history.length) return;
    G.bolts = G.history.pop();
    G.done = G.bolts.map((B) => B.length === CAP && B.every((c) => c === B[0]));
    G.sel = -1;
    layout();
  }

  function extraBolt() {
    if (!G || G.won || G.extra) return;
    YT.rewarded('extra_bolt').then((ok) => {
      if (!ok || !G) return;
      G.extra = true;
      G.bolts.push([]);
      G.done.push(false);
      G.history = G.history.map((s) => s.concat([[]]));
      layout();
      hud.btn('bolt').disabled = true;
      Kit.toast('Extra bolt added!');
    });
  }

  function checkWin() {
    if (!G.bolts.every((b) => b.length === 0 || (b.length === CAP && b.every((c) => c === b[0])))) return;
    G.won = true;
    const n = G.n;
    save.level = Math.max(save.level, n + 1);
    YT.save(save);
    YT.sendScore(save.level);
    sfx.win();
    setTimeout(() => {
      Kit.panel({
        title: 'Sorted! 🔩',
        body: '<p>Level ' + (n + 1) + ' cleared in <b>' + G.moves + '</b> moves.</p>',
        buttons: [{
          label: 'Next level', cls: 'primary',
          onClick: () => (n % 3 === 2 ? YT.interstitial() : Promise.resolve()).then(() => startLevel(n + 1)),
        }],
      });
    }, 700);
  }

  function update(dt) {
    if (!G) return;
    G.anim.forEach((a) => (a.t += dt));
    G.anim = G.anim.filter((a) => a.t < 1);
    if (G.shake) { G.shake.t -= dt; if (G.shake.t <= 0) G.shake = null; }
  }

  // --- render ---------------------------------------------------------------
  const ctx = st.ctx;
  function nut(x, y, w, color, glow) {
    const h = 34;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    Kit.roundRect(ctx, -w / 2, -h / 2 + 4, w, h, 9);
    ctx.fill();
    ctx.fillStyle = color;
    Kit.roundRect(ctx, -w / 2, -h / 2, w, h, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    Kit.roundRect(ctx, -w / 2 + 5, -h / 2 + 4, w - 10, 7, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(-w / 2 + w * 0.32, -h / 2, 2, h);
    ctx.fillRect(w / 2 - w * 0.32, -h / 2, 2, h);
    if (glow) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      Kit.roundRect(ctx, -w / 2, -h / 2, w, h, 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    st.begin();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b2257');
    g.addColorStop(1, '#151332');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (!G) { st.end(); return; }
    Kit.text(ctx, 'Sort the nuts by colour', W / 2, 120, 26, 'rgba(255,255,255,.85)');
    G.bolts.forEach((B, i) => {
      let { x, y } = G.pos[i];
      if (G.shake && G.shake.i === i) x += Math.sin(G.shake.t * 60) * 6;
      const w = G.nutW;
      // base & rod
      ctx.fillStyle = '#5b6079';
      Kit.roundRect(ctx, x - w / 2 - 6, y + 6, w + 12, 18, 8);
      ctx.fill();
      ctx.fillStyle = '#a9aec6';
      Kit.roundRect(ctx, x - 7, y - 40 * CAP - 22, 14, 40 * CAP + 30, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      for (let k = 0; k < CAP * 3; k++) ctx.fillRect(x - 7, y - 10 - k * 13, 14, 3);
      const lift = G.sel === i ? runOf(B) : 0;
      B.forEach((c, k) => {
        let ny = y - 20 - k * 40;
        const lifted = k >= B.length - lift;
        if (lifted) ny -= 70;
        nut(x, ny, w, COLORS[c], lifted);
      });
      const a = G.anim.find((q) => q.i === i);
      if (G.done[i]) {
        ctx.fillStyle = '#ffd84d';
        Kit.text(ctx, '✓', x, y + 52, 26, '#ffd84d');
        if (a) {
          ctx.globalAlpha = 1 - a.t;
          ctx.strokeStyle = '#ffd84d';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(x, y - 80, 40 + a.t * 80, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    });
    st.end();
  }

  Kit.boot('bolt-sort', (data) => {
    save = Object.assign({ level: 0 }, data);
    startLevel(save.level);
    Kit.loop(update, render);
  });
})();
