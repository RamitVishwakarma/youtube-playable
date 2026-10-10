/*
 * Makeover Showdown — style your model for the theme, then face a rival on
 * the runway. The judge scores how well each piece fits the theme and how
 * well the colours go together. Win coins, unlock premium pieces.
 */
(function () {
  'use strict';
  const { sfx } = Kit;
  const W = 540, H = 620;

  const THEMES = [
    { id: 'beach', name: 'Beach Party', icon: '🏖️', tags: { beach: 3, casual: 1, cute: 1 }, palette: ['#ffd23f', '#21d4d4', '#ff8f2b', '#ffffff', '#ff6fd1'] },
    { id: 'gala', name: 'Red Carpet Gala', icon: '🌟', tags: { formal: 3, party: 2 }, palette: ['#e8384f', '#1b1b2f', '#ffd700', '#ffffff', '#7b2cbf'] },
    { id: 'winter', name: 'Winter Wonderland', icon: '❄️', tags: { winter: 3, cute: 1, casual: 1 }, palette: ['#ffffff', '#9fd6ff', '#3d8bff', '#c0c0d0', '#e8384f'] },
    { id: 'rock', name: 'Rock Concert', icon: '🎸', tags: { rock: 3, party: 1 }, palette: ['#1b1b2f', '#e8384f', '#7a7a8c', '#ffffff', '#b45cff'] },
    { id: 'gym', name: 'Gym Day', icon: '🏋️', tags: { sporty: 3, casual: 1 }, palette: ['#2ecc71', '#3d8bff', '#1b1b2f', '#ffffff', '#ff8f2b'] },
    { id: 'office', name: 'Office Boss', icon: '💼', tags: { formal: 3, casual: 1 }, palette: ['#1b1b2f', '#ffffff', '#3d4a6b', '#c0c0d0', '#8a6b4a'] },
    { id: 'picnic', name: 'Spring Picnic', icon: '🌸', tags: { cute: 3, casual: 2 }, palette: ['#ff6fd1', '#ffd23f', '#2ecc71', '#ffffff', '#9fd6ff'] },
  ];

  // style: shape key used by the renderer. tags: theme fit.
  const ITEMS = {
    hair: [
      { id: 'bob', name: 'Bob', style: 'bob', color: '#3b2416', tags: ['casual', 'formal'] },
      { id: 'long', name: 'Long waves', style: 'long', color: '#c98a3d', tags: ['beach', 'cute', 'party'] },
      { id: 'bun', name: 'Neat bun', style: 'bun', color: '#1b1b2f', tags: ['formal', 'sporty'] },
      { id: 'spiky', name: 'Spikes', style: 'spiky', color: '#b45cff', tags: ['rock', 'party'] },
      { id: 'pony', name: 'Ponytail', style: 'pony', color: '#e2b04a', tags: ['sporty', 'casual', 'beach'] },
      { id: 'curls', name: 'Pink curls', style: 'curls', color: '#ff6fd1', tags: ['cute', 'party'], premium: true },
      { id: 'silver', name: 'Silver mane', style: 'long', color: '#d8d8e6', tags: ['formal', 'winter', 'party'], premium: true },
    ],
    top: [
      { id: 'tee', name: 'Tee', style: 'tee', color: '#ffffff', tags: ['casual', 'sporty'] },
      { id: 'tank', name: 'Tank top', style: 'tank', color: '#ffd23f', tags: ['beach', 'sporty'] },
      { id: 'hoodie', name: 'Hoodie', style: 'hoodie', color: '#3d8bff', tags: ['winter', 'casual'] },
      { id: 'blazer', name: 'Blazer', style: 'blazer', color: '#1b1b2f', tags: ['formal'] },
      { id: 'leather', name: 'Leather jacket', style: 'blazer', color: '#2b2b33', tags: ['rock', 'winter'] },
      { id: 'blouse', name: 'Frill blouse', style: 'tee', color: '#ff6fd1', tags: ['cute', 'party'] },
      { id: 'sequin', name: 'Sequin top', style: 'tank', color: '#ffd700', tags: ['party', 'formal'], premium: true },
      { id: 'parka', name: 'Snow parka', style: 'hoodie', color: '#ffffff', tags: ['winter', 'cute'], premium: true },
    ],
    bottom: [
      { id: 'jeans', name: 'Jeans', style: 'pants', color: '#3d5a99', tags: ['casual', 'rock'] },
      { id: 'shorts', name: 'Shorts', style: 'shorts', color: '#21d4d4', tags: ['beach', 'sporty'] },
      { id: 'skirt', name: 'Skirt', style: 'skirt', color: '#ff8f2b', tags: ['cute', 'party'] },
      { id: 'slacks', name: 'Slacks', style: 'pants', color: '#3d4a6b', tags: ['formal'] },
      { id: 'leggings', name: 'Leggings', style: 'leggings', color: '#1b1b2f', tags: ['sporty', 'winter'] },
      { id: 'gown', name: 'Ball gown', style: 'gown', color: '#e8384f', tags: ['formal', 'party'], premium: true },
      { id: 'tartan', name: 'Tartan skirt', style: 'skirt', color: '#b8213a', tags: ['rock', 'winter'] },
    ],
    shoes: [
      { id: 'sneakers', name: 'Sneakers', style: 'sneakers', color: '#ffffff', tags: ['sporty', 'casual'] },
      { id: 'sandals', name: 'Sandals', style: 'sandals', color: '#c98a3d', tags: ['beach', 'casual'] },
      { id: 'heels', name: 'Heels', style: 'heels', color: '#e8384f', tags: ['formal', 'party'] },
      { id: 'boots', name: 'Combat boots', style: 'boots', color: '#1b1b2f', tags: ['rock', 'winter'] },
      { id: 'fluffy', name: 'Fluffy boots', style: 'boots', color: '#f0e6d8', tags: ['winter', 'cute'] },
      { id: 'glass', name: 'Glass slippers', style: 'heels', color: '#9fd6ff', tags: ['formal', 'cute', 'party'], premium: true },
    ],
    extra: [
      { id: 'none', name: 'Nothing', style: 'none', color: '#000', tags: [] },
      { id: 'shades', name: 'Sunglasses', style: 'shades', color: '#1b1b2f', tags: ['beach', 'rock'] },
      { id: 'scarf', name: 'Scarf', style: 'scarf', color: '#e8384f', tags: ['winter', 'cute'] },
      { id: 'cap', name: 'Cap', style: 'cap', color: '#2ecc71', tags: ['sporty', 'casual'] },
      { id: 'phones', name: 'Headphones', style: 'phones', color: '#b45cff', tags: ['rock', 'sporty'] },
      { id: 'bow', name: 'Hair bow', style: 'bow', color: '#ff6fd1', tags: ['cute', 'party'] },
      { id: 'crown', name: 'Tiara', style: 'crown', color: '#ffd700', tags: ['formal', 'party'], premium: true },
    ],
  };
  const CATS = [
    { id: 'hair', label: 'Hair', icon: '💇' },
    { id: 'top', label: 'Top', icon: '👚' },
    { id: 'bottom', label: 'Bottom', icon: '👖' },
    { id: 'shoes', label: 'Shoes', icon: '👟' },
    { id: 'extra', label: 'Extra', icon: '🕶️' },
  ];
  const SKINS = ['#ffd6a5', '#e0a878', '#a86b45', '#6b4226'];
  const PREMIUM_PRICE = 120;

  let save = { coins: 0, wins: 0, round: 0, owned: {} };
  let game = null;

  // --- layout -------------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `
    body { background: linear-gradient(180deg,#ffb3d9,#c49bff); }
    #stagebox { position:fixed; left:0; right:0; top:0; height:58%; }
    .wardrobe { position:fixed; left:0; right:0; bottom:0; height:42%; background:#fff; color:#2b2236;
      border-radius:24px 24px 0 0; display:flex; flex-direction:column; box-shadow:0 -10px 30px rgba(0,0,0,.15); }
    .tabs { display:flex; gap:6px; padding:10px 10px 0; overflow-x:auto; flex:none; }
    .tabs button { flex:1; border:0; border-radius:12px; padding:8px 4px; font:800 12px system-ui; background:#f3ecff; color:#5b3a99; cursor:pointer; white-space:nowrap; }
    .tabs button.on { background:#7b2cbf; color:#fff; }
    .items { flex:1; overflow-y:auto; touch-action:pan-y; display:grid; grid-template-columns:repeat(auto-fill,minmax(88px,1fr)); gap:8px; padding:10px; align-content:start; }
    .it { border:2px solid #eee; border-radius:14px; background:#faf7ff; padding:6px 4px; cursor:pointer; font:700 11px system-ui; color:#2b2236; position:relative; }
    .it.on { border-color:#7b2cbf; background:#efe3ff; }
    .it .sw { width:34px; height:34px; border-radius:50%; margin:2px auto 4px; border:2px solid rgba(0,0,0,.1); }
    .it .lock { position:absolute; top:4px; right:6px; font-size:12px; }
    .it .tg { display:block; font-weight:600; font-size:9px; opacity:.6; margin-top:2px; }
    .go { margin:0 10px 10px; flex:none; }
    .theme { position:fixed; top:58px; left:50%; transform:translateX(-50%); background:rgba(255,255,255,.9); color:#5b3a99;
      padding:6px 14px; border-radius:999px; font:900 15px system-ui; white-space:nowrap; z-index:2; box-shadow:0 3px 0 rgba(0,0,0,.08); }
    @media (min-aspect-ratio: 1/1) {
      #stagebox { right:50%; height:100%; }
      .wardrobe { left:50%; top:56px; height:auto; border-radius:24px 0 0 0; }
      .theme { left:25%; }
    }
  `;
  document.head.appendChild(css);
  const box = Kit.el('div');
  box.id = 'stagebox';
  document.getElementById('game').appendChild(box);
  const st = Kit.stage(W, H, { parent: box, fitParent: true, letterbox: 'rgba(0,0,0,0)' });
  const ctx = st.ctx;

  const hud = Kit.hud([{ id: 'coins', label: 'Coins', value: 0 }, { id: 'wins', label: 'Wins', value: 0 }], []);
  const themeTag = Kit.el('div', 'theme');
  const wardrobe = Kit.el('div', 'wardrobe');
  const tabs = Kit.el('div', 'tabs');
  const items = Kit.el('div', 'items');
  const goBtn = Kit.el('button', 'kit-btn primary go', 'Walk the runway ✨');
  goBtn.type = 'button';
  wardrobe.appendChild(tabs);
  wardrobe.appendChild(items);
  wardrobe.appendChild(goBtn);
  const ui = document.getElementById('ui');
  ui.appendChild(themeTag);
  ui.appendChild(wardrobe);

  // --- scoring --------------------------------------------------------------------
  function itemFit(theme, it) {
    return it.tags.reduce((s, t) => s + (theme.tags[t] || 0), 0);
  }
  function scoreOutfit(theme, outfit) {
    let raw = 0, max = 0;
    for (const c of CATS) {
      const best = Math.max(...ITEMS[c.id].map((it) => itemFit(theme, it)));
      max += best;
      raw += itemFit(theme, outfit[c.id]);
    }
    // colour harmony: pieces whose colour sits in the theme palette
    const pieces = ['top', 'bottom', 'shoes'].map((k) => outfit[k].color.toLowerCase());
    const harmony = pieces.filter((c) => theme.palette.includes(c)).length;
    const fit = raw / max;
    return Math.round(Math.min(100, fit * 80 + harmony * 7));
  }

  function rivalOutfit(theme, round) {
    const rng = Kit.seeded(round * 7 + 11);
    const skill = Math.min(0.85, 0.35 + round * 0.04);
    const o = {};
    for (const c of CATS) {
      const sorted = ITEMS[c.id].slice().sort((a, b) => itemFit(theme, b) - itemFit(theme, a));
      o[c.id] = rng() < skill ? sorted[0] : sorted[Math.floor(rng() * sorted.length)];
    }
    o.skin = SKINS[Math.floor(rng() * SKINS.length)];
    return o;
  }

  // --- flow -----------------------------------------------------------------------
  function newRound() {
    const theme = THEMES[save.round % THEMES.length];
    game = {
      theme, cat: 'hair', phase: 'dress', t: 0,
      outfit: { hair: ITEMS.hair[0], top: ITEMS.top[0], bottom: ITEMS.bottom[0], shoes: ITEMS.shoes[0], extra: ITEMS.extra[0], skin: SKINS[0] },
    };
    themeTag.textContent = theme.icon + ' Theme: ' + theme.name;
    wardrobe.style.display = '';
    renderTabs();
    renderItems();
    hud.set('coins', save.coins);
    hud.set('wins', save.wins);
  }

  function renderTabs() {
    tabs.innerHTML = '';
    CATS.forEach((c) => {
      const b = Kit.el('button', c.id === game.cat ? 'on' : '', c.icon + ' ' + c.label);
      b.type = 'button';
      b.addEventListener('click', () => { game.cat = c.id; sfx.tap(); renderTabs(); renderItems(); });
      tabs.appendChild(b);
    });
    const sk = Kit.el('button', game.cat === 'skin' ? 'on' : '', '🎨 Skin');
    sk.type = 'button';
    sk.addEventListener('click', () => { game.cat = 'skin'; sfx.tap(); renderTabs(); renderItems(); });
    tabs.appendChild(sk);
  }

  function renderItems() {
    items.innerHTML = '';
    if (game.cat === 'skin') {
      SKINS.forEach((s) => {
        const b = Kit.el('button', 'it' + (game.outfit.skin === s ? ' on' : ''), '<div class="sw" style="background:' + s + '"></div>Skin');
        b.type = 'button';
        b.addEventListener('click', () => { game.outfit.skin = s; sfx.tap(); renderItems(); });
        items.appendChild(b);
      });
      return;
    }
    ITEMS[game.cat].forEach((it) => {
      const locked = it.premium && !save.owned[it.id];
      const b = Kit.el('button', 'it' + (game.outfit[game.cat] === it ? ' on' : ''),
        (locked ? '<span class="lock">🔒</span>' : '') +
        '<div class="sw" style="background:' + (it.style === 'none' ? 'transparent' : it.color) + '"></div>' + it.name +
        '<span class="tg">' + (it.tags.join(' · ') || '—') + '</span>');
      b.type = 'button';
      b.addEventListener('click', () => {
        if (locked) { unlockPrompt(it); return; }
        game.outfit[game.cat] = it;
        sfx.tap();
        renderItems();
      });
      items.appendChild(b);
    });
  }

  function unlockPrompt(it) {
    Kit.panel({
      title: '✨ ' + it.name,
      body: '<p>Premium piece. Great for: <b>' + it.tags.join(', ') + '</b></p>',
      buttons: [
        { label: 'Unlock free', cls: 'ad', onClick: () => YT.rewarded('unlock_' + it.id).then((ok) => { if (ok) own(it); }) },
        {
          label: 'Buy for 🪙 ' + PREMIUM_PRICE, cls: 'primary', disabled: save.coins < PREMIUM_PRICE,
          onClick: () => { if (save.coins >= PREMIUM_PRICE) { save.coins -= PREMIUM_PRICE; own(it); } },
        },
        { label: 'Not now', cls: 'ghost' },
      ],
    });
  }
  function own(it) {
    save.owned[it.id] = true;
    YT.save(save);
    sfx.good();
    hud.set('coins', save.coins);
    renderItems();
  }

  goBtn.addEventListener('click', () => {
    if (game.phase !== 'dress') return;
    sfx.tap();
    const theme = game.theme;
    game.rival = rivalOutfit(theme, save.round);
    game.myScore = scoreOutfit(theme, game.outfit);
    game.rivalScore = scoreOutfit(theme, game.rival);
    game.phase = 'runway';
    game.t = 0;
    wardrobe.style.display = 'none';
    setTimeout(showResult, 2600);
  });

  function showResult() {
    const win = game.myScore >= game.rivalScore;
    const coins = win ? 50 : 15;
    if (win) { save.wins++; sfx.win(); } else sfx.lose();
    save.round++;
    YT.sendScore(save.wins);
    const done = (m) => {
      save.coins += coins * m;
      YT.save(save);
      const next = () => newRound();
      if (save.round % 3 === 0) YT.interstitial().then(next); else next();
    };
    Kit.panel({
      title: win ? 'You win! 👑' : 'Rival wins 😤',
      body: '<p>Your look: <b>' + game.myScore + '</b> · Rival: <b>' + game.rivalScore + '</b></p>' +
        '<p>' + (win ? 'The judge loved it!' : 'Tip: match the theme tags shown under each piece.') + '</p><p>+🪙 ' + coins + '</p>',
      buttons: [
        { label: 'Collect ×3', cls: 'ad', onClick: () => YT.rewarded('triple_coins').then((ok) => done(ok ? 3 : 1)) },
        { label: 'Next theme', cls: 'primary', onClick: () => done(1) },
      ],
    });
  }

  // --- avatar renderer --------------------------------------------------------------
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function drawAvatar(o, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const skin = o.skin;
    const hair = o.hair, top = o.top, bot = o.bottom, shoes = o.shoes, ex = o.extra;
    // back hair
    ctx.fillStyle = hair.color;
    if (hair.style === 'long') { Kit.roundRect(ctx, -46, -205, 92, 150, 40); ctx.fill(); }
    if (hair.style === 'pony') { ctx.beginPath(); ctx.ellipse(44, -150, 16, 50, -0.3, 0, Math.PI * 2); ctx.fill(); }
    if (hair.style === 'curls') { for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(-40 + (i % 4) * 27, -170 + Math.floor(i / 4) * 50, 22, 0, Math.PI * 2); ctx.fill(); } }
    // legs
    ctx.fillStyle = skin;
    ctx.fillRect(-26, 20, 18, 150);
    ctx.fillRect(8, 20, 18, 150);
    // shoes
    ctx.fillStyle = shoes.color;
    if (shoes.style === 'boots') { Kit.roundRect(ctx, -30, 115, 26, 62, 8); ctx.fill(); Kit.roundRect(ctx, 4, 115, 26, 62, 8); ctx.fill(); }
    else if (shoes.style === 'heels') {
      Kit.roundRect(ctx, -32, 162, 28, 14, 7); ctx.fill(); Kit.roundRect(ctx, 4, 162, 28, 14, 7); ctx.fill();
      ctx.fillRect(-30, 170, 5, 16); ctx.fillRect(26, 170, 5, 16);
    } else if (shoes.style === 'sandals') {
      ctx.fillRect(-32, 172, 30, 6); ctx.fillRect(4, 172, 30, 6); ctx.fillRect(-26, 160, 4, 14); ctx.fillRect(12, 160, 4, 14);
    } else { Kit.roundRect(ctx, -34, 160, 32, 20, 9); ctx.fill(); Kit.roundRect(ctx, 2, 160, 32, 20, 9); ctx.fill(); ctx.fillStyle = shade(shoes.color, -60); ctx.fillRect(-34, 175, 32, 5); ctx.fillRect(2, 175, 32, 5); }
    // bottoms
    ctx.fillStyle = bot.color;
    if (bot.style === 'pants') { ctx.fillRect(-30, 10, 60, 30); ctx.fillRect(-30, 20, 26, 140); ctx.fillRect(4, 20, 26, 140); }
    else if (bot.style === 'leggings') { ctx.fillRect(-28, 10, 56, 30); ctx.fillRect(-27, 20, 21, 135); ctx.fillRect(6, 20, 21, 135); }
    else if (bot.style === 'shorts') { ctx.fillRect(-30, 10, 60, 30); ctx.fillRect(-31, 25, 28, 40); ctx.fillRect(3, 25, 28, 40); }
    else if (bot.style === 'skirt') { ctx.beginPath(); ctx.moveTo(-30, 8); ctx.lineTo(30, 8); ctx.lineTo(50, 85); ctx.lineTo(-50, 85); ctx.closePath(); ctx.fill(); }
    else if (bot.style === 'gown') { ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(30, 0); ctx.quadraticCurveTo(80, 120, 85, 185); ctx.lineTo(-85, 185); ctx.quadraticCurveTo(-80, 120, -30, 0); ctx.fill(); ctx.fillStyle = shade(bot.color, 40); ctx.fillRect(-60, 170, 120, 6); }
    // arms
    ctx.strokeStyle = skin;
    ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(-36, -80); ctx.lineTo(-54, 0); ctx.moveTo(36, -80); ctx.lineTo(54, 0); ctx.stroke();
    // top
    ctx.fillStyle = top.color;
    if (top.style === 'tank') { Kit.roundRect(ctx, -32, -92, 64, 106, 12); ctx.fill(); }
    else {
      Kit.roundRect(ctx, -38, -96, 76, 112, 16); ctx.fill();
      ctx.strokeStyle = top.color;
      ctx.lineWidth = 18;
      const sleeve = top.style === 'tee' ? -55 : 0;
      ctx.beginPath(); ctx.moveTo(-38, -86); ctx.lineTo(-52, sleeve); ctx.moveTo(38, -86); ctx.lineTo(52, sleeve); ctx.stroke();
      if (top.style === 'blazer') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(-12, -96); ctx.lineTo(12, -96); ctx.lineTo(0, -40); ctx.fill();
        ctx.fillStyle = shade(top.color, 50);
        ctx.beginPath(); ctx.arc(0, -20, 4, 0, Math.PI * 2); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      }
      if (top.style === 'hoodie') { ctx.fillStyle = shade(top.color, -30); Kit.roundRect(ctx, -20, -40, 40, 26, 8); ctx.fill(); }
    }
    if (top.id === 'sequin') { ctx.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 18; i++) ctx.fillRect(-26 + (i * 13) % 52, -82 + Math.floor(i / 4) * 20, 3, 3); }
    // neck + head
    ctx.fillStyle = skin;
    ctx.fillRect(-9, -112, 18, 22);
    ctx.beginPath();
    ctx.ellipse(0, -150, 38, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    // face
    ctx.fillStyle = '#2b2236';
    ctx.beginPath(); ctx.arc(-13, -150, 4, 0, Math.PI * 2); ctx.arc(13, -150, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c2445c';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -134, 9, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,140,.35)';
    ctx.beginPath(); ctx.arc(-22, -136, 7, 0, Math.PI * 2); ctx.arc(22, -136, 7, 0, Math.PI * 2); ctx.fill();
    // front hair
    ctx.fillStyle = hair.color;
    if (hair.style === 'spiky') {
      ctx.beginPath(); ctx.moveTo(-40, -160);
      for (let i = 0; i <= 6; i++) ctx.lineTo(-40 + i * 13.3, i % 2 ? -225 : -180);
      ctx.lineTo(40, -160); ctx.closePath(); ctx.fill();
    } else if (hair.style !== 'curls') {
      ctx.beginPath(); ctx.ellipse(0, -172, 42, 30, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillRect(-42, -175, 84, 12);
      if (hair.style === 'bob') { ctx.fillRect(-44, -172, 14, 50); ctx.fillRect(30, -172, 14, 50); }
      if (hair.style === 'bun') { ctx.beginPath(); ctx.arc(0, -205, 20, 0, Math.PI * 2); ctx.fill(); }
      if (hair.style === 'long') { ctx.fillRect(-46, -172, 14, 90); ctx.fillRect(32, -172, 14, 90); }
    } else {
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-36 + i * 18, -185, 15, 0, Math.PI * 2); ctx.fill(); }
    }
    // extras
    ctx.fillStyle = ex.color;
    ctx.strokeStyle = ex.color;
    if (ex.style === 'shades') { Kit.roundRect(ctx, -30, -160, 26, 16, 6); ctx.fill(); Kit.roundRect(ctx, 4, -160, 26, 16, 6); ctx.fill(); ctx.fillRect(-6, -156, 12, 4); }
    else if (ex.style === 'scarf') { Kit.roundRect(ctx, -26, -110, 52, 18, 8); ctx.fill(); ctx.fillRect(10, -100, 14, 50); }
    else if (ex.style === 'cap') { ctx.beginPath(); ctx.ellipse(0, -182, 42, 24, 0, Math.PI, Math.PI * 2); ctx.fill(); Kit.roundRect(ctx, 0, -186, 62, 10, 5); ctx.fill(); }
    else if (ex.style === 'phones') { ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, -160, 44, Math.PI, Math.PI * 2); ctx.stroke(); Kit.roundRect(ctx, -52, -168, 16, 30, 6); ctx.fill(); Kit.roundRect(ctx, 36, -168, 16, 30, 6); ctx.fill(); }
    else if (ex.style === 'bow') { ctx.beginPath(); ctx.moveTo(20, -195); ctx.lineTo(0, -210); ctx.lineTo(0, -180); ctx.closePath(); ctx.moveTo(20, -195); ctx.lineTo(40, -210); ctx.lineTo(40, -180); ctx.closePath(); ctx.fill(); }
    else if (ex.style === 'crown') { ctx.beginPath(); ctx.moveTo(-26, -192); ctx.lineTo(-20, -222); ctx.lineTo(-8, -202); ctx.lineTo(0, -230); ctx.lineTo(8, -202); ctx.lineTo(20, -222); ctx.lineTo(26, -192); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }

  function update(dt) { if (game) game.t += dt; }

  function render() {
    st.begin();
    ctx.clearRect(0, 0, W, H);
    if (!game) { st.end(); return; }
    // spotlight floor
    const fl = ctx.createRadialGradient(W / 2, 560, 10, W / 2, 560, 260);
    fl.addColorStop(0, 'rgba(255,255,255,.6)');
    fl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fl;
    ctx.fillRect(0, 300, W, 320);
    if (game.phase === 'dress') {
      const bob = Math.sin(game.t * 2) * 3;
      drawAvatar(game.outfit, W / 2, 360 + bob, 1.15);
    } else {
      const k = Math.min(1, game.t / 1.2);
      const ease = 1 - Math.pow(1 - k, 3);
      drawAvatar(game.outfit, W / 2 - 130 * ease, 380, 1.0 - 0.1 * ease);
      drawAvatar(game.rival, W + 200 - 330 * ease, 380, 0.9);
      Kit.text(ctx, 'YOU', W / 2 - 130 * ease, 120, 22, '#5b3a99');
      if (k >= 1) Kit.text(ctx, 'RIVAL', W - 130, 120, 22, '#5b3a99');
      if (game.t > 1.6) {
        Kit.text(ctx, String(game.myScore), W / 2 - 130, 595, 34, '#2b2236');
        Kit.text(ctx, String(game.rivalScore), W - 130, 595, 34, '#2b2236');
      }
    }
    st.end();
  }

  Kit.boot('makeover-showdown', (data) => {
    save = Object.assign(save, data);
    save.owned = data.owned || {};
    newRound();
    Kit.loop(update, render);
  });
})();
