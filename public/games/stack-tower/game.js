/*
 * Stack Tower 3D — one tap. A block slides across the top of the tower; tap
 * to drop it. Whatever hangs over the edge is sliced off and falls. Land
 * perfectly to keep the full size, chain perfects to grow it back.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';

const H = 1;               // block height
const START = 6;           // starting block size
const PERFECT = 0.18;      // tolerance for a perfect drop
const SKINS = [
  { id: 'aurora', name: 'Aurora', color: 'linear-gradient(135deg,#ff6b9d,#c56cf0,#45aaf2)', hue: 320, price: 0 },
  { id: 'sunset', name: 'Sunset', color: 'linear-gradient(135deg,#ff9f1c,#ff4d6d)', hue: 20, price: 150 },
  { id: 'ocean', name: 'Ocean', color: 'linear-gradient(135deg,#22c7ff,#3d5afe)', hue: 200, price: 250 },
  { id: 'forest', name: 'Forest', color: 'linear-gradient(135deg,#2ee59d,#1b998b)', hue: 140, price: 350 },
  { id: 'candy', name: 'Candy', color: 'linear-gradient(135deg,#ff6fd8,#ffd6f5)', hue: 300, price: 500 },
  { id: 'lava', name: 'Lava', color: 'linear-gradient(135deg,#ff3d00,#ffd60a)', hue: 10, price: 700 },
  { id: 'mint', name: 'Mint', color: 'linear-gradient(135deg,#7fffd4,#2ec4b6)', hue: 165, price: 900 },
  { id: 'night', name: 'Night', color: 'linear-gradient(135deg,#3a0ca3,#4361ee)', hue: 240, price: 1200 },
  { id: 'gold', name: 'Gold', color: 'linear-gradient(135deg,#fff3a0,#ffb703)', hue: 45, price: 0, ad: true },
];

let save = { best: 0, coins: 0, games: 0, skin: 'aurora', owned: { aurora: true }, sound: true, tutorial: false };
let saveTimer = 0;
function persist(now) {
  clearTimeout(saveTimer);
  if (now) YT.save(save);
  else saveTimer = setTimeout(() => YT.save(save), 300);
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const canvas = document.createElement('canvas');
canvas.id = 'scene';
document.getElementById('game').appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping; // keeps the pastel colours saturated
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
// orthographic camera: the classic isometric stack look
const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.95));
const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 80 });
scene.add(key, key.target);

let viewSize = 15;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  applyZoom();
}
function applyZoom() {
  const a = window.innerWidth / window.innerHeight;
  const v = viewSize * (a < 1 ? 1.25 : 1);
  camera.left = -v * a; camera.right = v * a; camera.top = v; camera.bottom = -v;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// background: vertical gradient that follows the tower colour
const bgCanvas = document.createElement('canvas');
bgCanvas.width = 4;
bgCanvas.height = 256;
const bgTex = new THREE.CanvasTexture(bgCanvas);
bgTex.colorSpace = THREE.SRGBColorSpace;
scene.background = bgTex;
function paintBackground(hue) {
  const g = bgCanvas.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'hsl(' + ((hue + 30) % 360) + ',70%,72%)');
  grd.addColorStop(1, 'hsl(' + ((hue + 340) % 360) + ',60%,40%)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  bgTex.needsUpdate = true;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const tower = new THREE.Group();
scene.add(tower);
let baseHue = 320;
const colorFor = (i) => new THREE.Color().setHSL((((baseHue + i * 4.5) % 360) + 360) % 360 / 360, 0.72, 0.6, THREE.SRGBColorSpace);

function addBlock(x, z, w, d, y, i) {
  const m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: colorFor(i), roughness: 0.55 }));
  m.scale.set(w, H, d);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  tower.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = 'title'; // title | play | over
let paused = false, menuOpen = false;
let stack = [];      // {x,z,w,d,mesh}
let moving = null;   // {axis,dir,t,mesh,...}
let falling = [];    // sliced pieces
let score = 0, combo = 0, speed = 1, time = 0, camY = 0, shake = 0, revived = false;
let hud = null, scoreEl = null, stopHand = null;
let ripples = [];

function skinHue() { const s = SKINS.find((k) => k.id === save.skin) || SKINS[0]; return s.hue; }

function resetTower() {
  tower.traverse((o) => { if (o.material) o.material.dispose(); });
  tower.clear();
  falling.forEach((f) => scene.remove(f.mesh));
  falling = [];
  stack = [];
  baseHue = skinHue();
  paintBackground(baseHue);
  // the base pillar
  const base = addBlock(0, 0, START, START, -H * 6, -1);
  base.scale.y = H * 12;
  stack.push({ x: 0, z: 0, w: START, d: START, mesh: base, y: 0 });
  stack[0].mesh.position.y = -H * 6 + 0.5;
  score = 0;
  combo = 0;
  speed = 1;
  camY = 0;
  revived = false;
  viewSize = 15;
  applyZoom();
}

function spawnMoving() {
  const top = stack[stack.length - 1];
  const i = stack.length;
  const axis = i % 2 ? 'x' : 'z';
  const y = top.y + H;
  const mesh = addBlock(top.x, top.z, top.w, top.d, y, i);
  const range = 9;
  moving = { axis, mesh, t: Math.random() < 0.5 ? 0 : Math.PI, range, y, w: top.w, d: top.d, x: top.x, z: top.z };
  updateMoving(0);
}

function updateMoving(dt) {
  if (!moving) return;
  moving.t += dt * (1.6 + Math.min(1.6, stack.length * 0.025)) * speed;
  const off = Math.sin(moving.t) * moving.range;
  const top = stack[stack.length - 1];
  if (moving.axis === 'x') { moving.x = top.x + off; moving.z = top.z; } else { moving.z = top.z + off; moving.x = top.x; }
  moving.mesh.position.set(moving.x, moving.y, moving.z);
}

function drop() {
  if (!moving) return;
  const top = stack[stack.length - 1];
  const m = moving;
  const axis = m.axis;
  const size = axis === 'x' ? m.w : m.d;
  const delta = axis === 'x' ? m.x - top.x : m.z - top.z;
  const overlap = size - Math.abs(delta);
  if (overlap <= 0) {
    // missed completely: the whole block falls
    sliceOff(m.mesh, m.x, m.z, m.w, m.d, m.y, axis, Math.sign(delta) || 1);
    moving = null;
    gameOver();
    return;
  }
  let nx = m.x, nz = m.z, nw = m.w, nd = m.d;
  if (Math.abs(delta) <= PERFECT) {
    // perfect: snap, keep the size, grow back after a streak
    nx = top.x; nz = top.z;
    combo += 1;
    if (combo >= 3) {
      const grow = 0.35;
      if (axis === 'x') nw = Math.min(START, nw + grow); else nd = Math.min(START, nd + grow);
    }
    ripple(nx, m.y, nz, nw, nd);
    perfectSound(combo);
    UI.buzz(10);
    if (combo >= 2) UI.praise(combo >= 5 ? 'INCREDIBLE ×' + combo : 'PERFECT ×' + combo, '#fff7ae');
    else UI.floatText('Perfect!', window.innerWidth / 2, window.innerHeight * 0.36, '#fff7ae');
  } else {
    combo = 0;
    const cut = Math.abs(delta);
    const sign = Math.sign(delta);
    if (axis === 'x') {
      nw = overlap;
      nx = top.x + delta / 2;
      // the overhang piece
      const px = nx + sign * (overlap / 2 + cut / 2);
      sliceOff(null, px, m.z, cut, m.d, m.y, axis, sign);
    } else {
      nd = overlap;
      nz = top.z + delta / 2;
      const pz = nz + sign * (overlap / 2 + cut / 2);
      sliceOff(null, m.x, pz, m.w, cut, m.y, axis, sign);
    }
    tone(260 + Math.random() * 40, 0, 0.1, 'triangle', 0.15, 180);
    noise(0, 0.08, 0.12, 900);
    UI.buzz(6);
  }
  m.mesh.scale.set(nw, H, nd);
  m.mesh.position.set(nx, m.y, nz);
  stack.push({ x: nx, z: nz, w: nw, d: nd, mesh: m.mesh, y: m.y });
  score += 1;
  scoreEl.textContent = String(score);
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
  moving = null;
  if (score % 25 === 0) { UI.praise(score + '!', '#ffd60a'); sfx.fanfare(); }
  spawnMoving();
}

function perfectSound(c) {
  const notes = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const f = 523 * Math.pow(2, notes[Math.min(c - 1, notes.length - 1)] / 12);
  tone(f, 0, 0.35, 'triangle', 0.16);
  tone(f * 2, 0.02, 0.25, 'sine', 0.06);
}

function sliceOff(existing, x, z, w, d, y, axis, sign) {
  const mesh = existing || addBlock(x, z, w, d, y, stack.length);
  if (!existing) tower.remove(mesh);
  scene.add(mesh);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, H, d);
  falling.push({ mesh, vy: 0, vx: axis === 'x' ? sign * 1.5 : 0, vz: axis === 'z' ? sign * 1.5 : 0, rx: axis === 'z' ? sign * 1.6 : 0, rz: axis === 'x' ? -sign * 1.6 : 0, life: 3 });
}

function ripple(x, y, z, w, d) {
  const geo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));
  const mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
  const line = new THREE.LineSegments(geo, mat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(x, y + H / 2 + 0.01, z);
  line.scale.set(w, d, 1);
  scene.add(line);
  ripples.push({ line, t: 0, w, d });
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .st-score { position:absolute; left:50%; top:14%; transform:translateX(-50%); font:900 76px/1 var(--font); color:#fff;
    text-shadow: 0 6px 0 rgba(0,0,0,.12); pointer-events:none !important; }
  .st-score.bump { animation: fs-bump .22s ease-out; }
  .st-best { position:absolute; left:50%; top:calc(14% + 84px); transform:translateX(-50%); font:800 15px var(--font); color:rgba(255,255,255,.85); pointer-events:none !important; }
  .st-top { position:absolute; left:12px; right:12px; top:max(12px, env(safe-area-inset-top)); display:flex; justify-content:space-between; pointer-events:none !important; }
  .st-top > * { pointer-events:auto; }
`;
document.head.appendChild(css);
let bestEl = null, topBar = null, coinPill = null;

function ensureHud() {
  if (scoreEl) return;
  const ui = document.getElementById('ui');
  scoreEl = document.createElement('div');
  scoreEl.className = 'st-score';
  bestEl = document.createElement('div');
  bestEl.className = 'st-best';
  topBar = document.createElement('div');
  topBar.className = 'st-top';
  coinPill = document.createElement('div');
  coinPill.className = 'fs-pill';
  coinPill.innerHTML = '<span class="ico"><span class="fs-coin" style="position:static;margin:0;width:20px;height:20px;display:block"></span></span><b>0</b>';
  topBar.appendChild(coinPill);
  topBar.appendChild(UI.iconButton('❚❚', 'Pause', openPause));
  ui.appendChild(scoreEl);
  ui.appendChild(bestEl);
  ui.appendChild(topBar);
}
function showHud(v) { if (scoreEl) [scoreEl, bestEl, topBar].forEach((e) => (e.style.display = v ? '' : 'none')); }
function setCoins(v, bump) {
  coinPill.querySelector('b').textContent = String(v);
  if (bump) { coinPill.classList.remove('bump'); void coinPill.offsetWidth; coinPill.classList.add('bump'); }
}

function showTitle() {
  state = 'title';
  showHud(false);
  resetTower();
  // a decorative pre-built tower for the title screen
  for (let i = 0; i < 12; i++) {
    const top = stack[stack.length - 1];
    const mesh = addBlock(top.x, top.z, top.w, top.d, top.y + H, stack.length);
    stack.push({ x: top.x, z: top.z, w: top.w, d: top.d, mesh, y: top.y + H });
  }
  UI.titleScreen({
    line1: 'STACK', line2: 'TOWER 3D',
    tagline: 'Tap to drop. Stack it perfectly. Build it higher.',
    best: save.best ? 'Best ' + save.best : '',
    playLabel: 'TAP TO PLAY',
    onPlay: startGame,
    extra: [
      UI.button('🎨 Colours', openShop, { style: 'blue', small: true }),
      UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true }),
    ],
  });
}

function startGame() {
  initAudio(() => save.sound);
  ensureHud();
  resetTower();
  showHud(true);
  scoreEl.textContent = '0';
  bestEl.textContent = save.best ? 'BEST ' + save.best : '';
  setCoins(save.coins);
  state = 'play';
  spawnMoving();
  if (!save.tutorial) stopHand = UI.tutorialHand([[window.innerWidth * 0.5, window.innerHeight * 0.72], [window.innerWidth * 0.5, window.innerHeight * 0.68]], 'Tap to drop the block');
}

function openPause() {
  if (state !== 'play') return;
  menuOpen = true;
  const p = UI.panel({
    title: 'Paused',
    buttons: [
      UI.button('Resume', () => { p.close(); menuOpen = false; }, { style: 'green' }),
      UI.button('Restart', () => { p.close(); menuOpen = false; startGame(); }),
      UI.button(save.sound ? 'Sound: on' : 'Sound: off', (b) => { save.sound = !save.sound; b.lastChild.textContent = save.sound ? 'Sound: on' : 'Sound: off'; persist(); }, { style: 'ghost' }),
      UI.button('Home', () => { p.close(); menuOpen = false; showTitle(); }, { style: 'ghost', small: true }),
    ],
  });
}

function openShop() {
  let p = null;
  const render = () => {
    if (p) p.close();
    p = UI.shopPanel({
      title: 'Colours', items: SKINS, owned: save.owned, current: save.skin, coins: save.coins,
      onSelect: (it) => { save.skin = it.id; persist(); recolour(); render(); },
      onBuy: (it) => { if (save.coins < it.price) return; save.coins -= it.price; save.owned[it.id] = true; save.skin = it.id; persist(true); recolour(); sfx.good(); render(); },
      onAdUnlock: async (it) => { if (await YT.rewarded('colour_' + it.id)) { save.owned[it.id] = true; save.skin = it.id; persist(true); recolour(); sfx.fanfare(); } render(); },
      onClose: () => p.close(),
    });
  };
  render();
}
function recolour() {
  baseHue = skinHue();
  paintBackground(baseHue);
  stack.forEach((s, i) => { if (i > 0) s.mesh.material.color.copy(colorFor(i)); });
}

function gameOver() {
  state = 'over';
  if (stopHand) { stopHand(); stopHand = null; }
  sfx.lose();
  UI.buzz([30, 50, 30]);
  shake = 0.6;
  const isBest = score > save.best;
  if (isBest) save.best = score;
  save.games += 1;
  const reward = Math.round(score / 2) + (isBest ? 20 : 0);
  persist(true);
  YT.sendScore(save.best);
  // zoom out to show off the whole tower
  zoomOut = true;
  setTimeout(() => {
    const body = document.createElement('div');
    body.innerHTML = '<div class="big">' + score + '</div><div class="sub">' + (isBest ? '🏆 New best!' : 'Best ' + save.best) + '</div><div class="reward"><span class="fs-coin" style="position:static;margin:0"></span><b>0</b></div>';
    UI.countUp(body.querySelector('.reward b'), 0, reward, 700);
    const btns = [];
    if (!revived && score >= 5) {
      btns.push(UI.button('Continue', async () => {
        if (!(await YT.rewarded('continue'))) return;
        p.close();
        revived = true;
        zoomOut = false;
        state = 'play';
        viewSize = 15;
        applyZoom();
        spawnMoving();
        UI.praise('KEEP STACKING!', '#7dffb2');
      }, { style: 'gold', ad: true }));
    }
    const collect = (mult) => {
      p.close();
      const gained = reward * mult;
      UI.coinBurst(window.innerWidth / 2, window.innerHeight / 2, 10, coinPill, (i) => { sfx.coin(i); setCoins(Math.round(save.coins - gained + gained * (i + 1) / 10), true); });
      save.coins += gained;
      persist(true);
      setTimeout(() => {
        setCoins(save.coins);
        zoomOut = false;
        const next = () => startGame();
        if (save.games % 3 === 0) YT.interstitial().then(next); else next();
      }, 900);
    };
    btns.push(UI.button('Claim ×2', async () => { if (await YT.rewarded('double_coins')) collect(2); }, { style: 'blue', ad: true }));
    btns.push(UI.button('Play again', () => collect(1), { style: 'green' }));
    btns.push(UI.button('Home', () => { p.close(); save.coins += reward; persist(true); zoomOut = false; showTitle(); }, { style: 'ghost', small: true }));
    const p = UI.panel({ title: isBest ? 'New best!' : 'Game over', gold: isBest, body, buttons: btns });
  }, 1200);
}
let zoomOut = false;

// ---------------------------------------------------------------------------
// Input: tap anywhere
// ---------------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (paused || menuOpen) return;
  if (state === 'play') {
    if (stopHand) { stopHand(); stopHand = null; save.tutorial = true; persist(); }
    drop();
  }
  e.preventDefault();
});
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'Enter') && state === 'play' && !menuOpen && !paused) {
    e.preventDefault();
    if (stopHand) { stopHand(); stopHand = null; save.tutorial = true; persist(); }
    drop();
  }
});

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
function update(dt) {
  time += dt;
  if (state === 'play') updateMoving(dt);
  if (state === 'title') tower.rotation.y = Math.sin(time * 0.4) * 0.3;
  else tower.rotation.y += (0 - tower.rotation.y) * Math.min(1, dt * 4);
  for (let i = falling.length - 1; i >= 0; i--) {
    const f = falling[i];
    f.life -= dt;
    f.vy -= 30 * dt;
    f.mesh.position.x += f.vx * dt;
    f.mesh.position.y += f.vy * dt;
    f.mesh.position.z += f.vz * dt;
    f.mesh.rotation.x += f.rx * dt;
    f.mesh.rotation.z += f.rz * dt;
    if (f.life <= 0) { scene.remove(f.mesh); f.mesh.material.dispose(); falling.splice(i, 1); }
  }
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.t += dt;
    const k = 1 + r.t * 1.4;
    r.line.scale.set(r.w * k, r.d * k, 1);
    r.line.material.opacity = Math.max(0, 0.9 - r.t * 1.8);
    if (r.t > 0.5) { scene.remove(r.line); r.line.geometry.dispose(); r.line.material.dispose(); ripples.splice(i, 1); }
  }
  // camera rises with the tower; zooms out at game over
  const topY = stack.length ? stack[stack.length - 1].y : 0;
  const targetY = zoomOut ? topY / 2 : topY;
  camY += (targetY - camY) * Math.min(1, dt * 3);
  const targetView = zoomOut ? Math.max(15, topY * 0.75 + 6) : 15;
  if (Math.abs(viewSize - targetView) > 0.01) { viewSize += (targetView - viewSize) * Math.min(1, dt * 2.5); applyZoom(); }
  shake = Math.max(0, shake - dt * 2);
  camera.position.set(20 + (Math.random() - 0.5) * shake, camY + 20, 20);
  camera.lookAt(0, camY, 0);
  key.position.set(10, camY + 25, 15);
  key.target.position.set(0, camY, 0);
}

let last = performance.now(), first = true;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused && !menuOpen) update(dt);
  renderer.render(scene, camera);
  if (first) { first = false; YT.firstFrameReady(); }
  requestAnimationFrame(frame);
}

YT.onPause(() => { paused = true; suspendAudio(); });
YT.onResume(() => { paused = false; last = performance.now(); resumeAudio(); });

window.__stackTower = {
  info: () => {
    const top = stack[stack.length - 1];
    return { state, score, combo, top: top && { x: top.x, z: top.z, w: top.w, d: top.d }, moving: moving && { x: moving.x, z: moving.z, axis: moving.axis } };
  },
};

(async function boot() {
  YT.init('stack-tower');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  save.owned = Object.assign({ aurora: true }, save.owned);
  resize();
  showTitle();
  requestAnimationFrame(frame);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
