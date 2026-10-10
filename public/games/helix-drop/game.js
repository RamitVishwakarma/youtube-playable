/*
 * Helix Drop 3D — spin the tower, drop the ball through the gaps, never
 * land on red. Fall through three floors in a row and the ball turns into a
 * fireball that smashes whatever it hits next.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SLICES = 12;
const SLICE_A = (Math.PI * 2) / SLICES;
const R_IN = 1.05, R_OUT = 3.1, THICK = 0.42;
const SPACING = 3.3;
const BALL_R = 0.34;
const BALL_DIST = 2.05; // ball distance from the pole
const GRAVITY = -32;
const BOUNCE = 10.2;
const THEMES = [
  { bg: ['#6a5cff', '#ff8fd2'], pole: '#ffffff', plat: '#3b2a9a', accent: '#ffd60a' },
  { bg: ['#00b4d8', '#90e0ef'], pole: '#ffffff', plat: '#023e8a', accent: '#ff9f1c' },
  { bg: ['#ff7a59', '#ffd6a5'], pole: '#fff7e6', plat: '#6a2c70', accent: '#2ee59d' },
  { bg: ['#2ee59d', '#b9fbc0'], pole: '#ffffff', plat: '#1b4332', accent: '#ff4d6d' },
  { bg: ['#1b1440', '#5a189a'], pole: '#c77dff', plat: '#10002b', accent: '#ffd60a' },
  { bg: ['#ffb703', '#ffe8a3'], pole: '#ffffff', plat: '#8d3b00', accent: '#3d8bff' },
];
const SKINS = [
  { id: 'classic', name: 'Classic', color: '#ff3d6e', price: 0 },
  { id: 'white', name: 'Pearl', color: '#ffffff', price: 150 },
  { id: 'blue', name: 'Sky', color: '#3da5ff', price: 250 },
  { id: 'green', name: 'Lime', color: '#7dff6b', price: 350 },
  { id: 'gold', name: 'Gold', color: '#ffc300', price: 500 },
  { id: 'purple', name: 'Grape', color: '#b15cff', price: 700 },
  { id: 'black', name: 'Eight', color: '#22223b', price: 900 },
  { id: 'pink', name: 'Bubble', color: '#ff6fd8', price: 1200 },
  { id: 'rainbow', name: 'Prism', color: 'linear-gradient(135deg,#ff4d6d,#ffd60a,#2ee59d,#22c7ff,#b15cff)', mat: '#9fefff', price: 0, ad: true },
];

let save = { level: 1, coins: 0, best: 0, skin: 'classic', owned: { classic: true }, sound: true, tutorial: false };
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8070ff, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(4, 10, 8);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 40 });
scene.add(key, key.target);

function bgTexture(a, b) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, a);
  grd.addColorStop(1, b);
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 56 : 44;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
function sliceGeometry() {
  const s = new THREE.Shape();
  const a0 = 0.012, a1 = SLICE_A - 0.012;
  s.absarc(0, 0, R_OUT, a0, a1, false);
  s.absarc(0, 0, R_IN, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: THICK, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -THICK, 0);
  return g;
}
const sliceGeo = sliceGeometry();
const splatGeo = new THREE.CircleGeometry(0.42, 18);
splatGeo.rotateX(-Math.PI / 2);

const mats = {
  pole: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }),
  plat: new THREE.MeshStandardMaterial({ color: '#3b2a9a', roughness: 0.45 }),
  red: new THREE.MeshStandardMaterial({ color: '#ff1f4b', roughness: 0.25, emissive: '#5a0010', emissiveIntensity: 0.6 }),
  finish: new THREE.MeshStandardMaterial({ color: '#ffd60a', roughness: 0.3, metalness: 0.2, emissive: '#5a4200', emissiveIntensity: 0.4 }),
  ball: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15, metalness: 0.05 }),
  fire: new THREE.MeshStandardMaterial({ color: '#ff8a00', emissive: '#ff4d00', emissiveIntensity: 1.4, roughness: 0.3 }),
  trail: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }),
};

// local angle of each slice: instance k covers [k*SLICE_A, (k+1)*SLICE_A]
// measured with atan2(x, z); the extruded shape starts at +90°, hence -PI/2.
const sliceRot = (k) => k * SLICE_A - Math.PI / 2;

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
const tower = new THREE.Group();
scene.add(tower);
let pole = null;
let platforms = [];
let theme = THEMES[0];
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), mats.ball);
ball.castShadow = true;
scene.add(ball);
const trail = Array.from({ length: 10 }, () => {
  const m = new THREE.Mesh(ball.geometry, mats.trail.clone());
  scene.add(m);
  return m;
});
const trailPos = [];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clearTower() {
  tower.traverse((o) => { if (o.material && o.userData.ownMat) o.material.dispose(); });
  if (pole) pole.geometry.dispose();
  tower.clear();
  platforms = [];
}

function buildLevel(n) {
  clearTower();
  tower.rotation.y = 0; // the first platform is aligned for an unrotated tower
  theme = THEMES[(n - 1) % THEMES.length];
  scene.background = bgTexture(theme.bg[0], theme.bg[1]);
  mats.pole.color.set(theme.pole);
  mats.plat.color.set(theme.plat);
  const rng = mulberry32(n * 2654435761);
  const count = Math.min(42, 14 + n * 2);
  pole = new THREE.Mesh(new THREE.CylinderGeometry(R_IN - 0.05, R_IN - 0.05, count * SPACING + 14, 32), mats.pole);
  pole.position.y = -(count * SPACING) / 2 + 4;
  pole.receiveShadow = true;
  tower.add(pole);
  for (let i = 0; i <= count; i++) {
    const finish = i === count;
    const g = new THREE.Group();
    g.position.y = -i * SPACING;
    // gaps: 1–3 contiguous runs, never under the ball at the very start
    const kind = new Array(SLICES).fill('solid');
    if (!finish) {
      const gapLen = Math.max(1, 3 - Math.floor(n / 6) + (rng() < 0.3 ? 1 : 0));
      const gapStart = Math.floor(rng() * SLICES);
      for (let k = 0; k < gapLen; k++) kind[(gapStart + k) % SLICES] = 'gap';
      if (n > 4 && rng() < 0.35) kind[(gapStart + 6) % SLICES] = 'gap';
      const reds = Math.min(5, Math.floor(rng() * (1 + n * 0.45)));
      for (let k = 0; k < reds; k++) {
        const idx = Math.floor(rng() * SLICES);
        if (kind[idx] === 'solid' && !(i === 0 && (idx === 0 || idx === SLICES - 1))) kind[idx] = 'red';
      }
      if (i === 0) { kind[0] = kind[0] === 'gap' ? 'gap' : 'solid'; }
    }
    const meshes = kind.map((kd, k) => {
      if (kd === 'gap') return null;
      const m = new THREE.Mesh(sliceGeo, finish ? mats.finish : kd === 'red' ? mats.red : mats.plat);
      m.rotation.y = sliceRot(k);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    });
    const spin = n > 5 && !finish && rng() < Math.min(0.4, (n - 5) * 0.05) ? (rng() < 0.5 ? -1 : 1) * (0.4 + rng() * 0.5) : 0;
    g.rotation.y = rng() * Math.PI * 2;
    tower.add(g);
    platforms.push({ group: g, kind, meshes, passed: false, finish, spin, splats: [] });
  }
  // the first platform: rotate so the ball starts above solid ground
  const p0 = platforms[0];
  let k0 = p0.kind.findIndex((kd) => kd === 'solid');
  if (k0 < 0) k0 = 0;
  p0.group.rotation.y = -(k0 + 0.5) * SLICE_A;
}

// ---------------------------------------------------------------------------
// Particles: shattered slices + droplets
// ---------------------------------------------------------------------------
const flying = [];
function shatter(p, fire) {
  p.group.updateMatrixWorld(true);
  p.meshes.forEach((m, k) => {
    if (!m) return;
    const world = new THREE.Mesh(sliceGeo, m.material === mats.red ? mats.red : fire ? mats.fire : mats.plat);
    m.getWorldPosition(world.position);
    m.getWorldQuaternion(world.quaternion);
    scene.add(world);
    const a = p.group.rotation.y + tower.rotation.y + sliceRot(k) + Math.PI / 2 + SLICE_A / 2;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    flying.push({ m: world, v: dir.multiplyScalar(5 + Math.random() * 4).add(new THREE.Vector3(0, 3 + Math.random() * 3, 0)), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), life: 1.1 });
    m.visible = false;
  });
}
const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 120);
drops.frustumCulled = false;
drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(drops);
const dropList = [];
const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), tc = new THREE.Color();
function splash(pos, color, n) {
  for (let i = 0; i < n; i++) {
    if (dropList.length >= 120) dropList.shift();
    const a = Math.random() * Math.PI * 2;
    dropList.push({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * (1 + Math.random() * 3), vy: 2 + Math.random() * 4, vz: Math.sin(a) * (1 + Math.random() * 3), life: 0.5 + Math.random() * 0.4, color });
  }
}
function updateFx(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.life -= dt;
    f.v.y += GRAVITY * 0.5 * dt;
    f.m.position.addScaledVector(f.v, dt);
    f.m.rotation.x += f.r.x * dt;
    f.m.rotation.y += f.r.y * dt;
    f.m.scale.setScalar(Math.max(0.01, f.life / 1.1));
    if (f.life <= 0) { scene.remove(f.m); flying.splice(i, 1); }
  }
  for (let i = dropList.length - 1; i >= 0; i--) {
    const d = dropList[i];
    d.life -= dt;
    if (d.life <= 0) { dropList.splice(i, 1); continue; }
    d.vy += GRAVITY * 0.6 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
  }
  for (let i = 0; i < 120; i++) {
    const d = dropList[i];
    if (!d) { tm.makeScale(0, 0, 0); drops.setMatrixAt(i, tm); continue; }
    const s = Math.min(1, d.life * 3);
    tm.compose(tv.set(d.x, d.y, d.z), tq.identity(), ts.set(s, s, s));
    drops.setMatrixAt(i, tm);
    drops.setColorAt(i, tc.set(d.color));
  }
  drops.instanceMatrix.needsUpdate = true;
  if (drops.instanceColor) drops.instanceColor.needsUpdate = true;
}

function addSplat(p) {
  // a flat colour splat where the ball landed, stuck to the platform
  const mat = new THREE.MeshBasicMaterial({ color: ballColor(), transparent: true, opacity: 0.85, depthWrite: false });
  const s = new THREE.Mesh(splatGeo, mat);
  s.userData.ownMat = true;
  // the ball sits at world (0, top, BALL_DIST); store it in the platform's frame
  const local = p.group.worldToLocal(new THREE.Vector3(0, p.group.position.y + 0.02, BALL_DIST));
  s.position.copy(local);
  s.scale.setScalar(0.8 + Math.random() * 0.5);
  s.rotation.y = Math.random() * 6;
  p.group.add(s);
  p.splats.push(s);
  if (p.splats.length > 6) { const old = p.splats.shift(); p.group.remove(old); old.material.dispose(); }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = 'title'; // title | play | dead | win
let paused = false, menuOpen = false;
let time = 0;
const B = { y: 1.6, vy: 0, next: 0, combo: 0, fire: false, squash: 0 };
let score = 0, levelScore = 0, camY = 0, revived = false, shake = 0, bounces = 0;
function dismissHand() { if (stopHand) { stopHand(); stopHand = null; save.tutorial = true; persist(); } }
let hud = null, scoreEl = null, stopHand = null;

function ballColor() {
  const s = SKINS.find((k) => k.id === save.skin) || SKINS[0];
  return s.mat || s.color;
}
function applySkin() { mats.ball.color.set(ballColor()); trail.forEach((t) => t.material.color.set(ballColor())); }

// ---------------------------------------------------------------------------
// Input: drag rotates the tower
// ---------------------------------------------------------------------------
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (paused || menuOpen) return;
  drag = { id: e.pointerId, x: e.clientX };
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  if (stopHand && state === 'play') { stopHand(); stopHand = null; save.tutorial = true; persist(); }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  drag.x = e.clientX;
  if (state === 'play') tower.rotation.y += dx * ((Math.PI * 2.2) / Math.min(window.innerWidth, 800));
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; if (state === 'play' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) dismissHand(); });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .hd-score { position:absolute; left:50%; top:96px; transform:translateX(-50%); font:900 54px/1 var(--font); color:#fff;
    -webkit-text-stroke:.12em #1b1440; paint-order:stroke fill; pointer-events:none !important; text-shadow:0 4px 0 rgba(0,0,0,.2); }
  .hd-score.bump { animation: fs-bump .25s ease-out; }
`;
document.head.appendChild(css);

function ensureHud() {
  if (hud) return;
  hud = UI.hud({ coins: save.coins, level: 'Level 1', right: [UI.iconButton('❚❚', 'Pause', openPause)] });
  scoreEl = document.createElement('div');
  scoreEl.className = 'hd-score';
  document.getElementById('ui').appendChild(scoreEl);
}
function showHud(v) { if (hud) { hud.show(v); scoreEl.style.display = v ? '' : 'none'; } }

function resetBall() {
  B.y = 1.6; B.vy = 0; B.next = 0; B.combo = 0; B.fire = false; B.squash = 0;
  camY = 0;
  trailPos.length = 0;
}

function showTitle() {
  state = 'title';
  showHud(false);
  buildLevel(save.level);
  resetBall();
  UI.titleScreen({
    line1: 'HELIX', line2: 'DROP 3D',
    tagline: 'Spin the tower. Fall through the gaps. Never touch red.',
    best: 'Level ' + save.level + (save.best ? ' · Best ' + save.best : ''),
    onPlay: startLevel,
    extra: [
      UI.button('⚪ Balls', openShop, { style: 'blue', small: true }),
      UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true }),
    ],
  });
}

function startLevel() {
  ensureHud();
  showHud(true);
  if (state !== 'title') buildLevel(save.level);
  resetBall();
  levelScore = 0;
  bounces = 0;
  revived = false;
  hud.setLevel('Level ' + save.level);
  hud.setCoins(save.coins);
  hud.setProgress(0);
  scoreEl.textContent = String(score);
  state = 'play';
  if (!save.tutorial) stopHand = UI.tutorialHand(() => [[window.innerWidth * 0.3, window.innerHeight * 0.7], [window.innerWidth * 0.7, window.innerHeight * 0.7]], 'Drag to spin the tower');
}

function openPause() {
  if (state !== 'play') return;
  menuOpen = true;
  const p = UI.panel({
    title: 'Paused',
    buttons: [
      UI.button('Resume', () => { p.close(); menuOpen = false; }, { style: 'green' }),
      UI.button('Restart level', () => { p.close(); menuOpen = false; score -= levelScore; startLevel(); }),
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
      title: 'Balls', items: SKINS, owned: save.owned, current: save.skin, coins: save.coins,
      onSelect: (it) => { save.skin = it.id; applySkin(); persist(); render(); },
      onBuy: (it) => { if (save.coins < it.price) return; save.coins -= it.price; save.owned[it.id] = true; save.skin = it.id; applySkin(); persist(true); sfx.good(); render(); },
      onAdUnlock: async (it) => { if (await YT.rewarded('ball_' + it.id)) { save.owned[it.id] = true; save.skin = it.id; applySkin(); persist(true); sfx.fanfare(); } render(); },
      onClose: () => p.close(),
    });
  };
  render();
}

function addScore(v) {
  score += v;
  levelScore += v;
  scoreEl.textContent = String(score);
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
}

function die() {
  state = 'dead';
  dismissHand();
  sfx.lose();
  UI.buzz([40, 60, 40]);
  UI.hitFlash();
  splash(ball.position, '#ff1f4b', 20);
  setTimeout(showFail, 700);
}

function showFail() {
  const btns = [];
  if (!revived) {
    btns.push(UI.button('Continue', async () => {
      if (!(await YT.rewarded('revive'))) return;
      p.close();
      revived = true;
      // clear the red slices on the platform below
      const pl = platforms[B.next];
      pl.kind.forEach((kd, k) => { if (kd === 'red') { pl.kind[k] = 'solid'; pl.meshes[k].material = mats.plat; } });
      B.vy = BOUNCE;
      state = 'play';
      UI.praise('SECOND CHANCE!', '#7dffb2');
    }, { style: 'gold', ad: true }));
  }
  btns.push(UI.button('Try again', () => { p.close(); if (score > save.best) { save.best = score; persist(); } score -= levelScore; startLevel(); }, { style: revived ? 'green' : '' }));
  btns.push(UI.button('Home', () => { p.close(); score -= levelScore; showTitle(); }, { style: 'ghost', small: true }));
  const done = Math.round((B.next / (platforms.length - 1)) * 100);
  const p = UI.panel({ title: 'Game over', sub: done + '% of the tower · Score ' + score, buttons: btns });
}

function win() {
  state = 'win';
  dismissHand();
  sfx.fanfare();
  UI.buzz([20, 40, 20, 40, 60]);
  UI.praise('LEVEL CLEAR!', '#ffd60a');
  for (let k = 0; k < 4; k++) setTimeout(() => splash(ball.position.clone().add(new THREE.Vector3(0, 1, 0)), ['#ffd60a', '#ff4d6d', '#2ee59d', '#3da5ff'][k], 30), k * 150);
  if (score > save.best) save.best = score;
  const reward = 15 + Math.round(levelScore / 4);
  setTimeout(() => {
    const body = document.createElement('div');
    // fewer bounces = cleaner run
    const floors = platforms.length - 1;
    const stars = bounces <= floors * 0.6 ? 3 : bounces <= floors * 1.3 ? 2 : 1;
    body.innerHTML = UI.starsHtml(stars) + '<div class="sub">Score ' + score + ' · Best ' + save.best + '</div><div class="reward"><span class="fs-coin" style="position:static;margin:0"></span><b>0</b></div>';
    UI.countUp(body.querySelector('.reward b'), 0, reward, 700);
    const collect = (mult, p) => {
      p.close();
      const gained = reward * mult;
      UI.coinBurst(window.innerWidth / 2, window.innerHeight / 2, 10, hud.coinEl, (i) => { sfx.coin(i); hud.setCoins(Math.round(save.coins - gained + gained * (i + 1) / 10), true); });
      save.coins += gained;
      save.level += 1;
      persist(true);
      YT.sendScore(save.best);
      setTimeout(() => {
        hud.setCoins(save.coins);
        const next = () => startLevel();
        if (save.level % 3 === 0) YT.interstitial().then(next); else next();
      }, 1000);
    };
    const p = UI.panel({
      title: 'Level ' + save.level + ' clear!', gold: true, body,
      buttons: [
        UI.button('Claim ×3', async () => { if (await YT.rewarded('triple_coins')) collect(3, p); }, { style: 'gold', ad: true }),
        UI.button('Next level', () => collect(1, p), { style: 'green' }),
      ],
    });
  }, 1200);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function sliceUnderBall(p) {
  // ball sits at world angle 0 (toward the camera); convert to the platform's frame
  const a = -(tower.rotation.y + p.group.rotation.y);
  const m = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor(m / SLICE_A) % SLICES;
}

function update(dt) {
  time += dt;
  if (keys.ArrowLeft || keys.KeyA) tower.rotation.y -= dt * 3.2;
  if (keys.ArrowRight || keys.KeyD) tower.rotation.y += dt * 3.2;
  for (const p of platforms) if (p.spin) p.group.rotation.y += p.spin * dt;

  if (state === 'title') {
    B.vy += GRAVITY * dt;
    B.y += B.vy * dt;
    if (B.y - BALL_R <= 0) { B.y = BALL_R; B.vy = BOUNCE * 0.8; }
  } else if (state === 'play') {
    const prevY = B.y;
    B.vy += GRAVITY * dt;
    B.y += B.vy * dt;
    let p = platforms[B.next];
    let guard = 0;
    while (p && guard++ < 3) {
      const top = p.group.position.y;
      if (!(prevY - BALL_R >= top - 0.001 && B.y - BALL_R < top) && !(B.y - BALL_R < top && B.vy < 0 && prevY >= top)) break;
      const k = sliceUnderBall(p);
      const kd = p.kind[k];
      if (p.finish) {
        B.y = top + BALL_R;
        B.vy = BOUNCE * 0.6;
        win();
        break;
      }
      if (kd === 'gap' || B.fire) {
        // fall through (or smash through as a fireball)
        p.passed = true;
        shatter(p, B.fire);
        const wasFire = B.fire;
        B.combo += 1;
        B.next += 1;
        addScore(B.combo * (wasFire ? 3 : 1) * 2);
        sfx.whoosh();
        tone(330 * Math.pow(2, Math.min(B.combo, 12) / 12), 0, 0.15, 'triangle', 0.13);
        if (wasFire) { B.fire = false; B.combo = 0; noise(0, 0.35, 0.3, 500); UI.buzz([20, 30]); shake = 0.6; }
        else if (B.combo >= 3 && !B.fire) { B.fire = true; UI.praise('FIREBALL!', '#ff9f1c'); noise(0, 0.4, 0.2, 1500); }
        else if (B.combo === 2) UI.floatText('Nice!', window.innerWidth / 2, window.innerHeight * 0.4, '#7dffb2');
        hud.setProgress(B.next / (platforms.length - 1));
        p = platforms[B.next];
        continue;
      }
      if (kd === 'red') {
        B.y = top + BALL_R;
        die();
        break;
      }
      // bounce
      B.y = top + BALL_R;
      B.vy = BOUNCE;
      B.squash = 1;
      B.combo = 0;
      bounces += 1;
      addSplat(p);
      splash(new THREE.Vector3(0, top + 0.05, BALL_DIST), ballColor(), 6);
      tone(520, 0, 0.08, 'sine', 0.15, 300);
      UI.buzz(5);
      break;
    }
  } else if (state === 'win') {
    B.vy += GRAVITY * dt;
    B.y += B.vy * dt;
    const top = platforms[platforms.length - 1].group.position.y;
    if (B.y - BALL_R <= top) { B.y = top + BALL_R; B.vy = BOUNCE * 0.6; }
  }

  // ball + trail
  B.squash = Math.max(0, B.squash - dt * 6);
  ball.position.set(0, B.y, BALL_DIST);
  const sq = B.squash;
  ball.scale.set(1 + sq * 0.25, 1 - sq * 0.3, 1 + sq * 0.25);
  ball.material = B.fire ? mats.fire : mats.ball;
  trailPos.unshift(ball.position.clone());
  if (trailPos.length > trail.length) trailPos.pop();
  trail.forEach((t, i) => {
    const p = trailPos[i + 1];
    t.visible = !!p && (B.fire || B.vy < -6) && state === 'play';
    if (p) {
      t.position.copy(p);
      const s = 1 - (i + 1) / (trail.length + 2);
      t.scale.setScalar(s);
      t.material.opacity = s * 0.5;
      t.material.color.set(B.fire ? '#ff8a00' : ballColor());
    }
  });

  // camera follows the ball down, never back up
  const targetY = Math.min(camY, B.y - 0.5);
  camY += (targetY - camY) * Math.min(1, dt * 6);
  if (state === 'title') camY = Math.min(camY, 0);
  shake = Math.max(0, shake - dt * 3);
  const back = camera.aspect < 1 ? 13 : 11;
  camera.position.set((Math.random() - 0.5) * shake * 0.3, camY + 4.6, back);
  camera.lookAt(0, camY - 0.6, 0);
  key.position.set(4, camY + 10, 8);
  key.target.position.set(0, camY - 2, 0);
  updateFx(dt);
}

let last = performance.now(), first = true;
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (!paused && !menuOpen) {
    // fixed sub-steps keep the fall-through checks exact at low frame rates
    const steps = Math.ceil(dt / 0.012);
    for (let i = 0; i < steps; i++) update(dt / steps);
  }
  renderer.render(scene, camera);
  if (first) { first = false; YT.firstFrameReady(); }
  requestAnimationFrame(frame);
}

YT.onPause(() => { paused = true; drag = null; suspendAudio(); });
YT.onResume(() => { paused = false; last = performance.now(); resumeAudio(); });

window.__helixDrop = {
  info: () => ({ state, level: save.level, next: B.next, total: platforms.length - 1, y: B.y, vy: B.vy, score, fire: B.fire }),
  // which slices of the next platform are safe, and where the ball is over it
  next: () => {
    const p = platforms[B.next];
    if (!p) return null;
    return { kinds: p.kind, under: sliceUnderBall(p), groupRot: p.group.rotation.y, towerRot: tower.rotation.y, spin: p.spin };
  },
};

(async function boot() {
  YT.init('helix-drop');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  save.owned = Object.assign({ classic: true }, save.owned);
  applySkin();
  showTitle();
  requestAnimationFrame(frame);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
