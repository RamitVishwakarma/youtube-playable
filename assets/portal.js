// Portal: renders the game grid (index.html) and the player page (play.html)
// from games.json.
(function () {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const thumbBg = (g) => 'linear-gradient(135deg,' + g.colors[0] + ',' + g.colors[1] + ')';

  function loadCatalog() {
    return fetch('games.json').then((r) => r.json()).then((d) => d.games);
  }

  function renderHome(games) {
    const grid = document.getElementById('games');
    const filters = document.getElementById('filters');
    const groups = {
      All: () => true,
      Puzzle: (g) => /puzzle|riddle|sort/i.test(g.genre),
      Physics: (g) => /physics|ragdoll|merge/i.test(g.genre),
      Arcade: (g) => /arcade|racing/i.test(g.genre),
      Chill: (g) => /tycoon|fashion/i.test(g.genre),
    };
    let current = 'All';
    try { current = localStorage.getItem('portal:filter') || 'All'; } catch (_) { /* ignore */ }
    if (!groups[current]) current = 'All';

    function draw() {
      filters.innerHTML = '';
      Object.keys(groups).forEach((name) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = name;
        b.className = name === current ? 'on' : '';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(name === current));
        b.addEventListener('click', () => {
          current = name;
          try { localStorage.setItem('portal:filter', name); } catch (_) { /* ignore */ }
          draw();
        });
        filters.appendChild(b);
      });
      grid.innerHTML = games.filter(groups[current]).map((g) =>
        '<a class="card" href="play.html?g=' + encodeURIComponent(g.slug) + '">' +
          '<div class="thumb" style="background:' + thumbBg(g) + '"><span class="genre">' + esc(g.genre) + '</span><span class="ico">' + g.icon + '</span></div>' +
          '<div class="body"><h3>' + esc(g.title) + '</h3><p>' + esc(g.tagline) + '</p><span class="play">▶ Play</span></div>' +
        '</a>').join('');
    }
    draw();
  }

  function renderPlay(games) {
    const slug = new URLSearchParams(location.search).get('g');
    const game = games.find((g) => g.slug === slug) || games[0];
    document.title = game.title + ' · Playables Arcade';
    document.getElementById('title').textContent = game.icon + ' ' + game.title;
    document.getElementById('how').textContent = game.how;
    document.getElementById('rewards').innerHTML = game.rewarded.map((r) => '<li>' + esc(r) + '</li>').join('');
    document.getElementById('more').innerHTML = games.filter((g) => g !== game).map((g) =>
      '<a class="mini" href="play.html?g=' + encodeURIComponent(g.slug) + '"><span style="background:' + thumbBg(g) + '">' + g.icon + '</span><b>' + esc(g.title) + '</b></a>').join('');
    const iframe = document.getElementById('game');
    const src = 'games/' + game.slug + '/';
    iframe.src = src;
    iframe.addEventListener('load', () => { try { iframe.contentWindow.focus(); } catch (_) { /* ignore */ } });

    const frame = document.getElementById('frame');
    const toggle = document.getElementById('frameToggle');
    let phone = true;
    try { phone = localStorage.getItem('portal:phone') !== '0'; } catch (_) { /* ignore */ }
    const applyFrame = () => {
      frame.classList.toggle('phone', phone);
      toggle.textContent = phone ? '🖥️ Wide' : '📱 Phone';
    };
    applyFrame();
    toggle.addEventListener('click', () => {
      phone = !phone;
      try { localStorage.setItem('portal:phone', phone ? '1' : '0'); } catch (_) { /* ignore */ }
      applyFrame();
    });
    document.getElementById('restart').addEventListener('click', () => { iframe.src = src; });
    document.getElementById('fullscreen').addEventListener('click', () => {
      const el = frame;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    });
  }

  loadCatalog().then((games) => {
    if (document.getElementById('games')) renderHome(games);
    else renderPlay(games);
  }).catch(() => {
    const target = document.getElementById('games') || document.getElementById('title');
    if (target) target.textContent = 'Could not load games.json. Serve this folder over HTTP (e.g. npx serve .).';
  });
})();
