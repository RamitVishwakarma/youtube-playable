/*
 * Tiny Shop Tycoon — run a street-food stall empire. Tap a station to cook,
 * upgrade it to earn more, hire a manager to cook automatically. Managers
 * keep earning while you're away (offline earnings on return).
 */
(function () {
  'use strict';
  const { sfx } = Kit;

  const STATIONS = [
    { id: 'noodle', name: 'Noodle Cart', icon: '🍜', unlock: 0, profit: 1, time: 1.2 },
    { id: 'dumpling', name: 'Dumpling Steamer', icon: '🥟', unlock: 60, profit: 8, time: 3 },
    { id: 'tea', name: 'Bubble Tea Bar', icon: '🧋', unlock: 700, profit: 60, time: 6 },
    { id: 'sushi', name: 'Sushi Counter', icon: '🍣', unlock: 8000, profit: 540, time: 12 },
    { id: 'pizza', name: 'Wood-fire Pizza', icon: '🍕', unlock: 100000, profit: 4300, time: 24 },
    { id: 'hotpot', name: 'Hotpot House', icon: '🍲', unlock: 1.4e6, profit: 52000, time: 48 },
    { id: 'cake', name: 'Royal Bakery', icon: '🎂', unlock: 2e7, profit: 600000, time: 96 },
  ];
  const OFFLINE_CAP = 2 * 3600;
  const BOOST_SECS = 300;

  const fmt = (n) => {
    if (n < 1000) return '$' + Math.floor(n);
    const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
    let i = -1;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    return '$' + (n >= 100 ? n.toFixed(0) : n.toFixed(1)) + u[i];
  };
  const upCost = (s, lvl) => Math.ceil(Math.max(4, s.unlock * 0.6 || 4) * Math.pow(1.15, lvl));
  const mgrCost = (s) => Math.max(40, s.unlock * 6 || 40);
  // Every 25 levels doubles a station's speed.
  const speedMult = (lvl) => Math.pow(2, Math.floor(lvl / 25));

  let save = { money: 0, earned: 0, st: {}, t: Date.now(), boostUntil: 0 };
  let dirty = false;

  // --- styles ---------------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `
    body { background: linear-gradient(180deg,#ffcf8a,#ff9e6b 40%,#e8607a); }
    .tyc { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; padding:62px 12px 12px; }
    .street { width:min(560px,100%); height:110px; position:relative; flex:none; border-radius:18px; overflow:hidden;
      background: linear-gradient(180deg,#7fd3ff 0 55%, #9a9aa8 55% 100%); box-shadow: inset 0 -12px 0 #7f7f8c; }
    .street .sign { position:absolute; left:12px; top:10px; font:900 20px system-ui,sans-serif; color:#fff; text-shadow:0 2px 0 rgba(0,0,0,.25); }
    .street .rate { position:absolute; right:12px; top:12px; font:800 14px system-ui; color:#fff; background:rgba(0,0,0,.25); padding:4px 10px; border-radius:999px; }
    .walker { position:absolute; bottom:18px; font-size:34px; transition: left 4s linear; }
    .list { width:min(560px,100%); flex:1; overflow-y:auto; touch-action:pan-y; margin-top:10px; padding-bottom:12px; }
    .stn { display:grid; grid-template-columns:64px 1fr auto; gap:10px; align-items:center; background:rgba(255,255,255,.92);
      color:#2b2236; border-radius:18px; padding:10px; margin-bottom:10px; box-shadow:0 4px 0 rgba(0,0,0,.12); }
    .stn.locked { background:rgba(255,255,255,.45); }
    .stn .ic { width:64px; height:64px; border-radius:16px; background:#fff3e0; display:grid; place-items:center; font-size:38px;
      border:0; cursor:pointer; position:relative; }
    .stn .ic:active { transform:scale(.94); }
    .stn .ic .lv { position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); font:800 11px system-ui; background:#2b2236; color:#fff; border-radius:999px; padding:1px 7px; }
    .stn h3 { margin:0; font-size:15px; }
    .stn .meta { font-size:12px; opacity:.7; margin-top:2px; }
    .bar { height:12px; border-radius:6px; background:#eee1d3; margin-top:6px; overflow:hidden; }
    .bar i { display:block; height:100%; width:0; background:linear-gradient(90deg,#34d27b,#1fae5f); }
    .acts { display:flex; flex-direction:column; gap:6px; }
    .acts button { border:0; border-radius:12px; padding:8px 10px; font:800 12px system-ui; cursor:pointer; color:#fff; background:#ff5a5f; min-width:92px; }
    .acts button.mgr { background:#6c5ce7; }
    .acts button:disabled { opacity:.4; cursor:default; }
    .boostbar { font:800 13px system-ui; }
  `;
  document.head.appendChild(css);

  const hud = Kit.hud(
    [{ id: 'money', label: 'Cash', value: '$0' }, { id: 'rate', label: 'Per sec', value: '$0' }],
    [{ id: 'boost', label: '2× income', title: 'Watch an ad: double income for 5 minutes', onClick: boost }]
  );
  hud.btn('boost').classList.add('ad');

  const root = Kit.el('div', 'tyc');
  const street = Kit.el('div', 'street', '<div class="sign">🏮 Tiny Shop Street</div><div class="rate"></div>');
  const list = Kit.el('div', 'list');
  root.appendChild(street);
  root.appendChild(list);
  document.getElementById('ui').appendChild(root);

  // --- model ----------------------------------------------------------------------
  function S(id) {
    if (!save.st[id]) save.st[id] = { lvl: 0, mgr: false, prog: 0, running: false };
    return save.st[id];
  }
  function cycleTime(s) { return s.time / speedMult(S(s.id).lvl); }
  function profitOf(s) { return s.profit * S(s.id).lvl * (Date.now() < save.boostUntil ? 2 : 1); }
  function incomePerSec(offline) {
    let sum = 0;
    for (const s of STATIONS) {
      const m = S(s.id);
      if (m.lvl > 0 && m.mgr) sum += (s.profit * m.lvl) / cycleTime(s);
    }
    return offline ? sum : sum * (Date.now() < save.boostUntil ? 2 : 1);
  }

  const rows = {};
  function buildList() {
    list.innerHTML = '';
    for (const s of STATIONS) {
      const row = Kit.el('div', 'stn');
      row.innerHTML =
        '<button class="ic" type="button">' + s.icon + '<span class="lv"></span></button>' +
        '<div><h3>' + s.name + '</h3><div class="meta"></div><div class="bar"><i></i></div></div>' +
        '<div class="acts"><button class="buy" type="button"></button><button class="mgr" type="button"></button></div>';
      const r = {
        row, ic: row.querySelector('.ic'), lv: row.querySelector('.lv'), meta: row.querySelector('.meta'),
        bar: row.querySelector('.bar i'), buy: row.querySelector('.buy'), mgr: row.querySelector('.mgr'),
      };
      r.ic.addEventListener('click', () => cook(s));
      r.buy.addEventListener('click', () => buy(s));
      r.mgr.addEventListener('click', () => hire(s));
      rows[s.id] = r;
      list.appendChild(row);
    }
  }

  function cook(s) {
    const m = S(s.id);
    if (m.lvl === 0 || m.running) return;
    m.running = true;
    m.prog = 0;
    sfx.tap();
  }
  function buy(s) {
    const m = S(s.id);
    const price = m.lvl === 0 ? s.unlock : upCost(s, m.lvl);
    if (save.money < price) return;
    save.money -= price;
    const wasLocked = m.lvl === 0;
    m.lvl++;
    dirty = true;
    sfx.coin();
    if (m.lvl % 25 === 0) Kit.toast(s.icon + ' Speed ×2!');
    if (wasLocked && s.unlock > 0) {
      Kit.toast(s.icon + ' ' + s.name + ' opened!');
      YT.interstitial();
    }
  }
  function hire(s) {
    const m = S(s.id);
    if (m.mgr || m.lvl === 0 || save.money < mgrCost(s)) return;
    save.money -= mgrCost(s);
    m.mgr = true;
    m.running = true;
    dirty = true;
    sfx.good();
    Kit.toast('Manager hired: ' + s.name + ' runs itself!');
  }
  function boost() {
    YT.rewarded('income_boost').then((ok) => {
      if (!ok) return;
      save.boostUntil = Math.max(Date.now(), save.boostUntil) + BOOST_SECS * 1000;
      dirty = true;
      sfx.good();
      Kit.toast('2× income for 5 minutes!');
    });
  }

  function earn(v) {
    save.money += v;
    save.earned += v;
    if (Math.random() < 0.5) spawnWalker();
  }

  const WALKERS = ['🧑', '👩', '👨‍🦱', '👧', '🧔', '👵', '🧑‍🎓', '👨‍🍳'];
  let walkers = 0;
  function spawnWalker() {
    if (walkers > 6 || document.hidden) return;
    walkers++;
    const w = Kit.el('div', 'walker', Kit.pick(WALKERS));
    w.style.left = '-40px';
    street.appendChild(w);
    requestAnimationFrame(() => requestAnimationFrame(() => { w.style.left = 'calc(100% + 40px)'; }));
    setTimeout(() => { w.remove(); walkers--; }, 4200);
  }

  // --- loop -----------------------------------------------------------------------
  let saveTimer = 0;
  function update(dt) {
    for (const s of STATIONS) {
      const m = S(s.id);
      if (m.lvl === 0) continue;
      if (m.mgr) m.running = true;
      if (!m.running) continue;
      const ct = cycleTime(s);
      m.prog += dt / ct;
      if (m.prog >= 1) {
        // fast stations can finish several cycles per frame
        const cycles = m.mgr ? Math.floor(m.prog) : 1;
        earn(profitOf(s) * cycles);
        m.prog = m.mgr ? m.prog - cycles : 0;
        if (!m.mgr) m.running = false;
        if (ct > 0.8) Kit.audio.blip(880, 0.05, 'triangle', 0.05);
      }
    }
    saveTimer += dt;
    if (saveTimer > 5 || dirty) {
      saveTimer = 0;
      dirty = false;
      save.t = Date.now();
      YT.save(save);
      YT.sendScore(save.earned);
    }
  }

  function render() {
    hud.set('money', fmt(save.money));
    const rate = incomePerSec(false);
    hud.set('rate', fmt(rate));
    const boosting = Date.now() < save.boostUntil;
    const left = Math.ceil((save.boostUntil - Date.now()) / 1000);
    hud.set('boost', boosting ? '2× ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : '2× income');
    street.querySelector('.rate').textContent = boosting ? '🔥 2× BOOST' : 'Lifetime ' + fmt(save.earned);
    let shownLocked = false;
    for (const s of STATIONS) {
      const m = S(s.id);
      const r = rows[s.id];
      const locked = m.lvl === 0;
      if (locked && shownLocked) { r.row.style.display = 'none'; continue; }
      r.row.style.display = '';
      if (locked) shownLocked = true;
      r.row.classList.toggle('locked', locked);
      r.lv.textContent = locked ? '🔒' : 'Lv ' + m.lvl;
      r.meta.textContent = locked
        ? 'Unlock to earn ' + fmt(s.profit) + ' per order'
        : fmt(profitOf(s)) + ' / order · ' + cycleTime(s).toFixed(1) + 's' + (m.mgr ? ' · auto' : ' · tap icon');
      r.bar.style.width = (m.running ? Math.min(1, m.prog) * 100 : 0) + '%';
      const price = locked ? s.unlock : upCost(s, m.lvl);
      r.buy.textContent = (locked ? 'Open ' : 'Upgrade ') + fmt(price);
      r.buy.disabled = save.money < price;
      r.mgr.style.display = locked || m.mgr ? 'none' : '';
      r.mgr.textContent = 'Manager ' + fmt(mgrCost(s));
      r.mgr.disabled = save.money < mgrCost(s);
    }
  }

  function offlineEarnings() {
    const secs = Math.min(OFFLINE_CAP, Math.max(0, (Date.now() - (save.t || Date.now())) / 1000));
    const amount = incomePerSec(true) * secs * 0.5;
    if (amount < 1 || secs < 30) return;
    const mins = Math.round(secs / 60);
    Kit.panel({
      title: 'Welcome back! 👋',
      body: '<p>Your managers earned while you were away (' + mins + ' min):</p><div class="big">' + fmt(amount) + '</div>',
      buttons: [
        { label: 'Collect ×2', cls: 'ad', onClick: () => YT.rewarded('offline_double').then((ok) => { earn(amount * (ok ? 2 : 1)); dirty = true; }) },
        { label: 'Collect', cls: 'primary', onClick: () => { earn(amount); dirty = true; } },
      ],
    });
  }

  Kit.boot('tiny-shop-tycoon', (data) => {
    save = Object.assign(save, data);
    save.st = data.st || {};
    for (const s of STATIONS) { const m = S(s.id); if (!m.mgr) { m.running = false; m.prog = 0; } }
    if (S('noodle').lvl === 0) S('noodle').lvl = 1;
    buildList();
    offlineEarnings();
    Kit.loop(update, render);
    YT.onPause(() => { save.t = Date.now(); YT.save(save); });
  });
})();
