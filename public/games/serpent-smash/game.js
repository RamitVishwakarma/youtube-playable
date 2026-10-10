/*
 * Serpent Smash 3D — steer your snake around the arena, eat orbs to grow,
 * and swallow any snake smaller than you. Touch a bigger one and you're
 * lunch. Eat the crowned boss to clear the level.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ARENA = 46; // half size (m)
const ORBS = 140;
const SEG_SPACING = 0.55;
const PATH_STEP = 0.12;
const BASE_SPEED = 6.2;
const SKINS = [
  { id: 'lime', name: 'Lime', color: '#7ed957', color2: '#2f9e44', price: 0 },
  { id: 'ocean', name: 'Ocean', color: '#3da5ff', color2: '#ffffff', price: 150 },
  { id: 'tiger', name: 'Tiger', color: '#ff9f1c', color2: '#2b2d42', price: 300 },
  { id: 'candy', name: 'Candy', color: '#ff6fd8', color2: '#ffffff', price: 450 },
  { id: 'lava', name: 'Lava', color: '#ff3d3d', color2: '#ffd60a', price: 650 },
  { id: 'royal', name: 'Royal', color: '#8a4dff', color2: '#ffd60a', price: 850 },
  { id: 'mint', name: 'Mint', color: '#2ee5c4', color2: '#1b4332', price: 1100 },
  { id: 'ghost', name: 'Ghost', color: '#f2f4f8', color2: '#9aa3b5', price: 1400 },
  { id: 'rainbow', name: 'Prism', color: 'linear-gradient(135deg,#ff4d6d,#ffd60a,#2ee59d,#22c7ff)', mat: '#ff4d6d', mat2: '#22c7ff', price: 0, ad: true },
];
const ENEMY_SKINS = [['#ff4d6d', '#ffd6e0'], ['#ffc300', '#7a4f00'], ['#3d8bff', '#bde0ff'], ['#b15cff', '#f3e8ff'], ['#ff8f2b', '#2b2d42'], ['#22c7ff', '#003049'], ['#e9ff70', '#386641'], ['#ff6fd8', '#5a189a']];
const NAMES = ['Zig', 'Noodle', 'Sly', 'Slinky', 'Coil', 'Hiss', 'Wiggles', 'Fang', 'Viper', 'Mamba', 'Kaa', 'Scales'];

let save = { level: 1, coins: 0, skin: 'lime', owned: { lime: true }, sound: true, tutorial: false, best: 0 };
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fd3ff');
scene.fog = new THREE.Fog('#8fd3ff', 60, 140);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6d8f4e, 1.25));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
scene.add(sun, sun.target);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 58 : 45;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------
function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b8f28a';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#a6e878';
  g.fillRect(0, 0, 64, 64);
  g.fillRect(64, 64, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ARENA / 2, ARENA / 2);
  t.magFilter = THREE.NearestFilter;
  return t;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const outside = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: '#5fbf52', roughness: 1 }));
outside.rotation.x = -Math.PI / 2;
outside.position.y = -0.6;
scene.add(outside);
// walls
const wallMat = new THREE.MeshStandardMaterial({ color: '#ff9fc8', roughness: 0.6 });
[[0, -ARENA - 0.6, ARENA * 2 + 2.4, 1.2], [0, ARENA + 0.6, ARENA * 2 + 2.4, 1.2], [-ARENA - 0.6, 0, 1.2, ARENA * 2], [ARENA + 0.6, 0, 1.2, ARENA * 2]].forEach(([x, z, w, d]) => {
  const m = new THREE.Mesh(new THREE.RoundedBoxGeometry(w, 1.4, d, 2, 0.4), wallMat);
  m.position.set(x, 0.5, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
});
// trees around the arena
(function decor() {
  const trunk = new THREE.CylinderGeometry(0.4, 0.6, 2.5, 6);
  const crown = new THREE.IcosahedronGeometry(2.2, 0);
  const mT = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 1 });
  const mC = [new THREE.MeshStandardMaterial({ color: '#2f9e44', flatShading: true }), new THREE.MeshStandardMaterial({ color: '#57c44f', flatShading: true }), new THREE.MeshStandardMaterial({ color: '#ffb3d1', flatShading: true })];
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = ARENA + 6 + Math.random() * 30;
    const g = new THREE.Group();
    const t = new THREE.Mesh(trunk, mT);
    t.position.y = 1.25;
    const c = new THREE.Mesh(crown, mC[i % 3]);
    c.position.y = 3.6;
    g.add(t, c);
    g.position.set(Math.cos(a) * r, -0.6, Math.sin(a) * r);
    g.scale.setScalar(0.8 + Math.random() * 0.8);
    g.traverse((o) => { o.castShadow = true; });
    scene.add(g);
  }
})();

// ---------------------------------------------------------------------------
// Orbs (instanced)
// ---------------------------------------------------------------------------
const orbGeo = new THREE.IcosahedronGeometry(0.32, 1);
const orbMesh = new THREE.InstancedMesh(orbGeo, new THREE.MeshStandardMaterial({ roughness: 0.25, emissive: '#222', emissiveIntensity: 0.5 }), ORBS);
orbMesh.castShadow = true;
scene.add(orbMesh);
const ORB_COLORS = ['#ff4d6d', '#ffd60a', '#2ee59d', '#22c7ff', '#b15cff', '#ff9f1c'];
const orbs = [];
const tmpO = new THREE.Object3D(), tmpC = new THREE.Color();
function placeOrb(o) {
  o.x = (Math.random() * 2 - 1) * (ARENA - 2);
  o.z = (Math.random() * 2 - 1) * (ARENA - 2);
  o.v = Math.random() < 0.12 ? 3 : 1;
  o.ph = Math.random() * 6;
  o.alive = true;
}
for (let i = 0; i < ORBS; i++) { const o = {}; placeOrb(o); orbs.push(o); orbMesh.setColorAt(i, tmpC.set(ORB_COLORS[i % ORB_COLORS.length])); }

// ---------------------------------------------------------------------------
// Snakes
// ---------------------------------------------------------------------------
const MAX_SEGS = 140;
const segGeo = new THREE.SphereGeometry(1, 16, 12);
const eyeGeo = new THREE.SphereGeometry(1, 10, 8);
const eyeWhite = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 });
const eyeBlack = new THREE.MeshBasicMaterial({ color: '#111' });
const crownGeo = new THREE.CylinderGeometry(0.55, 0.45, 0.45, 5, 1, true);
const crownMat = new THREE.MeshStandardMaterial({ color: '#ffd60a', metalness: 0.6, roughness: 0.25, side: THREE.DoubleSide, emissive: '#5a4200', emissiveIntensity: 0.4 });

function makeLabel() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.renderOrder = 10;
  let last = '';
  return {
    sprite, tex,
    set(text, color) {
      const key = text + color;
      if (key === last) return;
      last = key;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 256, 96);
      g.font = '900 64px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 12;
      g.strokeStyle = '#1b1440';
      g.strokeText(text, 128, 52);
      g.fillStyle = color || '#fff';
      g.fillText(text, 128, 52);
      tex.needsUpdate = true;
    },
  };
}

function makeSnake({ color, color2, x, z, mass, isPlayer = false, name = '', boss = false }) {
  const mat1 = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
  const mat2 = new THREE.MeshStandardMaterial({ color: color2, roughness: 0.3 });
  // body segments alternate two colours: two instanced meshes
  const bodyA = new THREE.InstancedMesh(segGeo, mat1, MAX_SEGS);
  const bodyB = new THREE.InstancedMesh(segGeo, mat2, MAX_SEGS);
  bodyA.castShadow = bodyB.castShadow = true;
  bodyA.frustumCulled = bodyB.frustumCulled = false;
  const head = new THREE.Group();
  const skull = new THREE.Mesh(segGeo, mat1);
  skull.castShadow = true;
  head.add(skull);
  [-1, 1].forEach((s) => {
    const w = new THREE.Mesh(eyeGeo, eyeWhite);
    w.scale.setScalar(0.32);
    w.position.set(s * 0.42, 0.42, 0.55);
    const p = new THREE.Mesh(eyeGeo, eyeBlack);
    p.scale.setScalar(0.16);
    p.position.set(s * 0.45, 0.46, 0.8);
    head.add(w, p);
  });
  if (boss) {
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.y = 1.15;
    head.add(crown);
  }
  const label = makeLabel();
  head.add(label.sprite);
  scene.add(bodyA, bodyB, head);
  const sn = {
    isPlayer, name, boss, mat1, mat2, bodyA, bodyB, head, label,
    x, z, dir: Math.random() * Math.PI * 2, target: 0, mass, alive: true,
    path: [], speedMul: 1, ai: { t: 0, goal: null }, flash: 0, pop: 0,
  };
  sn.target = sn.dir;
  for (let i = 0; i < 200; i++) sn.path.push({ x, z });
  return sn;
}
function removeSnake(sn) {
  scene.remove(sn.bodyA, sn.bodyB, sn.head);
  sn.bodyA.dispose(); sn.bodyB.dispose();
  sn.mat1.dispose(); sn.mat2.dispose();
  sn.label.tex.dispose(); sn.label.sprite.material.dispose();
}
const radiusOf = (m) => 0.45 + Math.sqrt(m) * 0.055;
const segCount = (m) => Math.min(MAX_SEGS, 4 + Math.floor(m / 2.2));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = 'title';
let paused = false, menuOpen = false;
let time = 0, shake = 0, playT = 0;
let player = null, enemies = [];
let hud = null, stopHand = null, revived = false, eatenCount = 0, startMass = 10;
const steer = { active: false, id: 0, x0: 0, y0: 0, dx: 0, dy: 0 };
let joyEl = null;

function skin() { return SKINS.find((s) => s.id === save.skin) || SKINS[0]; }

function setupLevel(n) {
  if (player) removeSnake(player);
  enemies.forEach(removeSnake);
  enemies = [];
  orbs.forEach(placeOrb);
  const sk = skin();
  startMass = 10;
  player = makeSnake({ color: sk.mat || sk.color, color2: sk.mat2 || sk.color2, x: 0, z: 0, mass: startMass, isPlayer: true, name: 'You' });
  const count = Math.min(9, 4 + Math.floor(n / 2));
  const bossMass = Math.round(40 + n * 14);
  for (let i = 0; i < count; i++) {
    const boss = i === 0;
    const a = (i / count) * Math.PI * 2 + 0.4;
    const r = 18 + Math.random() * 20;
    const mass = boss ? bossMass : Math.round(4 + Math.random() * (10 + n * 6));
    const [c1, c2] = ENEMY_SKINS[i % ENEMY_SKINS.length];
    enemies.push(makeSnake({ color: c1, color2: c2, x: Math.cos(a) * r, z: Math.sin(a) * r, mass, name: boss ? 'BOSS' : NAMES[(i + n) % NAMES.length], boss }));
  }
  revived = false;
  eatenCount = 0;
}

// ---------------------------------------------------------------------------
// Input: drag anywhere = joystick
// ---------------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (paused || menuOpen || state !== 'play') return;
  Object.assign(steer, { active: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  if (joyEl) { joyEl.style.display = 'block'; joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; joyEl.firstChild.style.transform = 'translate(-50%,-50%)'; }
  if (stopHand) { stopHand(); stopHand = null; save.tutorial = true; persist(); }
});
canvas.addEventListener('pointermove', (e) => {
  if (!steer.active || e.pointerId !== steer.id) return;
  steer.dx = e.clientX - steer.x0;
  steer.dy = e.clientY - steer.y0;
  const len = Math.hypot(steer.dx, steer.dy);
  // a floating joystick: the base follows the finger once pulled far enough
  if (len > 60) { steer.x0 = e.clientX - (steer.dx / len) * 60; steer.y0 = e.clientY - (steer.dy / len) * 60; steer.dx = e.clientX - steer.x0; steer.dy = e.clientY - steer.y0; }
  if (joyEl) {
    joyEl.style.left = steer.x0 + 'px';
    joyEl.style.top = steer.y0 + 'px';
    joyEl.firstChild.style.transform = 'translate(calc(-50% + ' + steer.dx + 'px), calc(-50% + ' + steer.dy + 'px))';
  }
});
const endSteer = (e) => { if (e.pointerId === steer.id) { steer.active = false; if (joyEl) joyEl.style.display = 'none'; } };
canvas.addEventListener('pointerup', endSteer);
canvas.addEventListener('pointercancel', endSteer);
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; if (stopHand && /Arrow|Key[WASD]/.test(e.code)) { stopHand(); stopHand = null; } });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .ss-joy { position:absolute; width:120px; height:120px; margin:-60px 0 0 -60px; border-radius:50%; display:none; pointer-events:none !important;
    background: radial-gradient(circle, rgba(255,255,255,.18), rgba(255,255,255,.06)); box-shadow: inset 0 0 0 3px rgba(255,255,255,.35); }
  .ss-joy i { position:absolute; left:50%; top:50%; width:54px; height:54px; border-radius:50%; transform:translate(-50%,-50%);
    background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.75), rgba(217,230,255,.55)); box-shadow: 0 4px 12px rgba(0,0,0,.2); }
  .ss-board { position:absolute; right:12px; top:72px; min-width:132px; padding:8px 10px; border-radius:14px; pointer-events:none !important;
    background: rgba(20,16,60,.45); color:#fff; font:800 13px var(--font); box-shadow: inset 0 0 0 2px rgba(255,255,255,.14); }
  .ss-board div { display:flex; justify-content:space-between; gap:10px; padding:1px 0; }
  .ss-board .me { color:#ffe066; }
`;
document.head.appendChild(css);
let boardEl = null;

function ensureHud() {
  if (hud) return;
  hud = UI.hud({ coins: save.coins, level: 'Arena 1', right: [UI.iconButton('❚❚', 'Pause', openPause)] });
  joyEl = document.createElement('div');
  joyEl.className = 'ss-joy';
  joyEl.innerHTML = '<i></i>';
  boardEl = document.createElement('div');
  boardEl.className = 'ss-board';
  const ui = document.getElementById('ui');
  ui.appendChild(joyEl);
  ui.appendChild(boardEl);
}
function showHud(v) { if (hud) { hud.show(v); boardEl.style.display = v ? '' : 'none'; } }

function showTitle() {
  state = 'title';
  showHud(false);
  setupLevel(save.level);
  UI.titleScreen({
    line1: 'SERPENT', line2: 'SMASH 3D',
    tagline: 'Eat orbs, grow huge, swallow every smaller snake.',
    best: 'Arena ' + save.level + (save.best ? ' · Biggest ' + save.best : ''),
    onPlay: startLevel,
    extra: [
      UI.button('🐍 Skins', openShop, { style: 'blue', small: true }),
      UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true }),
    ],
  });
}

function startLevel() {
  initAudio(() => save.sound);
  ensureHud();
  if (state !== 'title') setupLevel(save.level);
  showHud(true);
  hud.setLevel('Arena ' + save.level);
  hud.setCoins(save.coins);
  state = 'play';
  playT = 0;
  sfx.whoosh();
  if (!save.tutorial) stopHand = UI.tutorialHand(() => [[window.innerWidth * 0.45, window.innerHeight * 0.7], [window.innerWidth * 0.62, window.innerHeight * 0.58]], 'Drag to steer');
}

function openPause() {
  if (state !== 'play') return;
  menuOpen = true;
  steer.active = false;
  const p = UI.panel({
    title: 'Paused',
    buttons: [
      UI.button('Resume', () => { p.close(); menuOpen = false; }, { style: 'green' }),
      UI.button('Restart arena', () => { p.close(); menuOpen = false; startLevel(); }),
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
      title: 'Snake skins', items: SKINS, owned: save.owned, current: save.skin, coins: save.coins,
      onSelect: (it) => { save.skin = it.id; persist(); recolourPlayer(); render(); },
      onBuy: (it) => { if (save.coins < it.price) return; save.coins -= it.price; save.owned[it.id] = true; save.skin = it.id; persist(true); recolourPlayer(); sfx.good(); render(); },
      onAdUnlock: async (it) => { if (await YT.rewarded('skin_' + it.id)) { save.owned[it.id] = true; save.skin = it.id; persist(true); recolourPlayer(); sfx.fanfare(); } render(); },
      onClose: () => p.close(),
    });
  };
  render();
}
function recolourPlayer() {
  if (!player) return;
  const sk = skin();
  player.mat1.color.set(sk.mat || sk.color);
  player.mat2.color.set(sk.mat2 || sk.color2);
}

const proj = new THREE.Vector3();
function toScreen(x, y, z) {
  proj.set(x, y, z).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function angleTo(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function aiThink(sn, dt) {
  sn.ai.t -= dt;
  if (sn.ai.t > 0 && sn.ai.goal) return;
  sn.ai.t = 0.3 + Math.random() * 0.4;
  // the boss doesn't hunt rivals or farm orbs (so it stays beatable): it
  // roams, and only goes for the player up close
  if (sn.boss) {
    const d = Math.hypot(player.x - sn.x, player.z - sn.z);
    if (player.alive && playT > 6 && d < 10 && player.mass < sn.mass) sn.ai.goal = { x: player.x, z: player.z };
    else if (!sn.ai.goal || Math.hypot(sn.ai.goal.x - sn.x, sn.ai.goal.z - sn.z) < 3 || sn.ai.goal.player) sn.ai.goal = { x: (Math.random() * 2 - 1) * (ARENA - 8), z: (Math.random() * 2 - 1) * (ARENA - 8) };
    return;
  }
  const all = [player, ...enemies].filter((o) => o && o.alive && o !== sn);
  // flee anything clearly bigger that is close; chase anything clearly smaller
  let best = null, bestScore = -1e9;
  for (const o of all) {
    const d = Math.hypot(o.x - sn.x, o.z - sn.z);
    if (d > 22) continue;
    // a grace period at the start, and nobody hunts the player from across the map
    if (o.isPlayer && (playT < 6 || d > 12)) continue;
    if (o.mass > sn.mass * 1.05) {
      const s = 30 - d;
      if (s > bestScore) { bestScore = s; best = { x: sn.x * 2 - o.x, z: sn.z * 2 - o.z, flee: true }; }
    } else if (o.mass < sn.mass * 0.95) {
      const s = 18 - d + (o.isPlayer ? 2 : 0);
      if (s > bestScore) { bestScore = s; best = { x: o.x, z: o.z }; }
    }
  }
  if (!best) {
    // nearest orb
    let od = 1e9;
    for (const o of orbs) {
      if (!o.alive) continue;
      const d = (o.x - sn.x) ** 2 + (o.z - sn.z) ** 2;
      if (d < od) { od = d; best = { x: o.x, z: o.z }; }
    }
  }
  sn.ai.goal = best;
}

function stepSnake(sn, dt) {
  if (sn.isPlayer) {
    let jx = steer.active ? steer.dx : 0, jy = steer.active ? steer.dy : 0;
    if (keys.ArrowLeft || keys.KeyA) jx -= 1;
    if (keys.ArrowRight || keys.KeyD) jx += 1;
    if (keys.ArrowUp || keys.KeyW) jy -= 1;
    if (keys.ArrowDown || keys.KeyS) jy += 1;
    if (Math.hypot(jx, jy) > 8 || (Math.abs(jx) + Math.abs(jy) > 0 && !steer.active)) sn.target = Math.atan2(jx, jy);
  } else {
    aiThink(sn, dt);
    if (sn.ai.goal) sn.target = Math.atan2(sn.ai.goal.x - sn.x, sn.ai.goal.z - sn.z);
    // keep away from walls
    const m = ARENA - 5;
    if (Math.abs(sn.x) > m || Math.abs(sn.z) > m) sn.target = Math.atan2(-sn.x, -sn.z);
  }
  const turn = 3.6 / (1 + radiusOf(sn.mass) * 0.25);
  sn.dir += THREE.MathUtils.clamp(angleTo(sn.dir, sn.target), -turn * dt, turn * dt);
  // big snakes are slower, so a small player can always run away
  const speed = BASE_SPEED * (sn.isPlayer ? 1.05 : 0.92) * (1.18 - Math.min(0.4, Math.sqrt(sn.mass) * 0.035));
  sn.x += Math.sin(sn.dir) * speed * dt;
  sn.z += Math.cos(sn.dir) * speed * dt;
  const r = radiusOf(sn.mass);
  sn.x = THREE.MathUtils.clamp(sn.x, -ARENA + r, ARENA - r);
  sn.z = THREE.MathUtils.clamp(sn.z, -ARENA + r, ARENA - r);
  // record the path at a fixed 0.12 m spacing (frame-rate independent) so
  // body segments stay evenly spaced
  let last = sn.path[0];
  let gap = Math.hypot(sn.x - last.x, sn.z - last.z);
  while (gap >= PATH_STEP) {
    const k = PATH_STEP / gap;
    last = { x: last.x + (sn.x - last.x) * k, z: last.z + (sn.z - last.z) * k };
    sn.path.unshift(last);
    gap -= PATH_STEP;
  }
  const need = Math.ceil((segCount(sn.mass) * SEG_SPACING * (1 + r)) / PATH_STEP) + 10;
  if (sn.path.length > need) sn.path.length = need;
  sn.flash = Math.max(0, sn.flash - dt * 3);
  sn.pop = Math.max(0, sn.pop - dt * 4);
}

function eatOrbs(sn) {
  const r = radiusOf(sn.mass) + 0.5;
  for (let i = 0; i < ORBS; i++) {
    const o = orbs[i];
    if (!o.alive) continue;
    if ((o.x - sn.x) ** 2 + (o.z - sn.z) ** 2 < r * r) {
      o.alive = false;
      sn.mass += o.v;
      sn.pop = 1;
      setTimeout(() => placeOrb(o), 2500 + Math.random() * 2000);
      if (sn.isPlayer) { sfx.coin(eatCombo++ % 8); comboT = 0.6; }
    }
  }
}
let eatCombo = 0, comboT = 0;

/** Does any part of b touch a's head? */
function headHits(a, b) {
  const ra = radiusOf(a.mass), rb = radiusOf(b.mass);
  const reach = (ra + rb) * 0.9;
  if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 < reach * reach) return true;
  const n = segCount(b.mass);
  const step = Math.max(1, Math.round((SEG_SPACING * (1 + rb)) / PATH_STEP));
  for (let i = 1; i <= n; i++) {
    const p = b.path[Math.min(b.path.length - 1, i * step)];
    const rr = (ra + rb * 0.85) * 0.85;
    if ((a.x - p.x) ** 2 + (a.z - p.z) ** 2 < rr * rr) return true;
  }
  return false;
}

function resolveClashes() {
  const all = [player, ...enemies].filter((s) => s.alive);
  for (const a of all) {
    for (const b of all) {
      if (a === b || !a.alive || !b.alive) continue;
      if (!headHits(a, b)) continue;
      if (Math.abs(a.mass - b.mass) < 1) continue; // equals just slide past
      const big = a.mass > b.mass ? a : b, small = big === a ? b : a;
      swallow(big, small);
    }
  }
}

function swallow(big, small) {
  small.alive = false;
  big.mass += Math.round(small.mass * 0.6);
  big.pop = 1;
  big.flash = 1;
  // burst of orbs where the small snake was
  const pos = new THREE.Vector3(small.x, 1, small.z);
  burst(pos, small.mat1.color.getStyle(), 26);
  if (big.isPlayer) {
    eatenCount += 1;
    sfx.good();
    noise(0, 0.25, 0.2, 700);
    shake = 0.5;
    UI.buzz([15, 30]);
    const s = toScreen(small.x, 2, small.z);
    UI.floatText('+' + Math.round(small.mass * 0.6), s.x, s.y, '#7dffb2');
    UI.praise(small.boss ? 'BOSS EATEN!' : ['YUM!', 'GULP!', 'CHOMP!', 'DELICIOUS!'][eatenCount % 4], small.boss ? '#ffd60a' : '#7dffb2');
  }
  if (small.isPlayer) { lose(big); return; }
  removeSnake(small);
  enemies = enemies.filter((e) => e !== small);
  if (small.boss && big.isPlayer) setTimeout(winLevel, 600);
  else if (small.boss) {
    // the boss was eaten by a rival: the rival inherits the crown
    big.boss = true;
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.y = 1.15;
    big.head.add(crown);
    big.name = 'BOSS';
  }
  // keep the arena lively
  if (enemies.length < 3 && state === 'play') spawnEnemy();
}

function spawnEnemy() {
  const a = Math.random() * Math.PI * 2;
  const [c1, c2] = ENEMY_SKINS[(Math.random() * ENEMY_SKINS.length) | 0];
  const m = Math.max(4, Math.round(player.mass * (0.3 + Math.random() * 0.6)));
  enemies.push(makeSnake({ color: c1, color2: c2, x: Math.cos(a) * (ARENA - 6), z: Math.sin(a) * (ARENA - 6), mass: m, name: NAMES[(Math.random() * NAMES.length) | 0] }));
}

function lose(by) {
  state = 'dead';
  sfx.lose();
  UI.hitFlash();
  UI.buzz([40, 60, 40]);
  player.head.visible = false;
  player.bodyA.visible = player.bodyB.visible = false;
  setTimeout(() => {
    const btns = [];
    if (!revived) {
      btns.push(UI.button('Revive', async () => {
        if (!(await YT.rewarded('revive'))) return;
        p.close();
        revived = true;
        player.alive = true;
        player.head.visible = player.bodyA.visible = player.bodyB.visible = true;
        // respawn far from the snake that ate you, a bit bigger
        player.x = -by.x * 0.5; player.z = -by.z * 0.5;
        player.path.forEach((pt) => { pt.x = player.x; pt.z = player.z; });
        player.mass = Math.max(player.mass, 15);
        state = 'play';
        UI.praise('REVIVED!', '#7dffb2');
      }, { style: 'gold', ad: true }));
    }
    btns.push(UI.button('Try again', () => { p.close(); startLevel(); }, { style: revived ? 'green' : '' }));
    btns.push(UI.button('Home', () => { p.close(); showTitle(); }, { style: 'ghost', small: true }));
    const p = UI.panel({ title: 'Eaten!', sub: 'Swallowed by ' + by.name + ' (' + Math.round(by.mass) + '). Grow before you clash!', buttons: btns });
  }, 900);
}

function winLevel() {
  state = 'win';
  sfx.fanfare();
  UI.buzz([20, 40, 20, 40, 60]);
  const size = Math.round(player.mass);
  if (size > save.best) save.best = size;
  const stars = eatenCount >= 4 ? 3 : eatenCount >= 2 ? 2 : 1;
  const reward = 25 + Math.round(size / 3) + eatenCount * 8;
  for (let k = 0; k < 4; k++) setTimeout(() => burst(new THREE.Vector3(player.x, 2, player.z), ORB_COLORS[k], 30), k * 150);
  setTimeout(() => {
    const body = document.createElement('div');
    body.innerHTML = UI.starsHtml(stars) + '<div class="sub">Size ' + size + ' · ' + eatenCount + ' snakes eaten</div><div class="reward"><span class="fs-coin" style="position:static;margin:0"></span><b>0</b></div>';
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
        if (save.level % 2 === 1) YT.interstitial().then(next); else next();
      }, 1000);
    };
    const p = UI.panel({
      title: 'Arena cleared!', gold: true, body,
      buttons: [
        UI.button('Claim ×3', async () => { if (await YT.rewarded('triple_coins')) collect(3, p); }, { style: 'gold', ad: true }),
        UI.button('Next arena', () => collect(1, p), { style: 'green' }),
      ],
    });
  }, 1400);
}

// burst particles
const MAXP = 200;
const pMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ roughness: 0.4 }), MAXP);
pMesh.frustumCulled = false;
pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(pMesh);
const parts = [];
function burst(pos, color, n) {
  for (let i = 0; i < n; i++) {
    if (parts.length >= MAXP) parts.shift();
    const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 6;
    parts.push({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * sp, vy: 4 + Math.random() * 6, vz: Math.sin(a) * sp, life: 0.8 + Math.random() * 0.5, color });
  }
}
const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3();
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy -= 20 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.2) { p.y = 0.2; p.vy *= -0.4; p.vx *= 0.7; p.vz *= 0.7; }
  }
  for (let i = 0; i < MAXP; i++) {
    const p = parts[i];
    if (!p) { tm.makeScale(0, 0, 0); pMesh.setMatrixAt(i, tm); continue; }
    const s = Math.min(1, p.life * 2);
    tm.compose(tv.set(p.x, p.y, p.z), tq.identity(), ts.set(s, s, s));
    pMesh.setMatrixAt(i, tm);
    pMesh.setColorAt(i, tmpC.set(p.color));
  }
  pMesh.instanceMatrix.needsUpdate = true;
  if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------
function drawSnake(sn) {
  const r = radiusOf(sn.mass);
  const n = segCount(sn.mass);
  const step = Math.max(1, Math.round((SEG_SPACING * (1 + r)) / PATH_STEP));
  let ia = 0, ib = 0;
  for (let i = n; i >= 1; i--) {
    const p = sn.path[Math.min(sn.path.length - 1, i * step)];
    const taper = 0.55 + 0.45 * Math.min(1, (n - i + 4) / n * 1.2);
    const s = r * taper * (1 + (i < 4 ? sn.pop * 0.15 : 0));
    const y = s * 0.9 + Math.sin(time * 8 + i * 0.6) * 0.04;
    tmpO.position.set(p.x, y, p.z);
    tmpO.rotation.set(0, 0, 0);
    tmpO.scale.set(s, s * 0.9, s);
    tmpO.updateMatrix();
    if ((i >> 1) % 2 === 0) sn.bodyA.setMatrixAt(ia++, tmpO.matrix);
    else sn.bodyB.setMatrixAt(ib++, tmpO.matrix);
  }
  sn.bodyA.count = ia;
  sn.bodyB.count = ib;
  sn.bodyA.instanceMatrix.needsUpdate = true;
  sn.bodyB.instanceMatrix.needsUpdate = true;
  const hs = r * 1.18 * (1 + sn.pop * 0.2);
  sn.head.position.set(sn.x, hs * 0.85, sn.z);
  sn.head.rotation.y = sn.dir;
  sn.head.scale.setScalar(hs);
  sn.label.set(String(Math.round(sn.mass)), sn.isPlayer ? '#ffe066' : sn.mass > player.mass ? '#ff8fa3' : '#ffffff');
  sn.label.sprite.position.set(0, 1.9, 0);
  sn.label.sprite.scale.set(2.4 / Math.max(0.9, hs * 0.6), 0.9 / Math.max(0.9, hs * 0.6), 1);
  sn.mat1.emissive.set(sn.flash > 0 ? '#ffffff' : '#000000');
  sn.mat1.emissiveIntensity = sn.flash * 0.6;
}

function drawOrbs() {
  for (let i = 0; i < ORBS; i++) {
    const o = orbs[i];
    const s = o.alive ? (o.v > 1 ? 1.7 : 1) : 0;
    tmpO.position.set(o.x, 0.45 + Math.sin(time * 3 + o.ph) * 0.12, o.z);
    tmpO.rotation.set(time + o.ph, time * 0.7, 0);
    tmpO.scale.setScalar(s);
    tmpO.updateMatrix();
    orbMesh.setMatrixAt(i, tmpO.matrix);
  }
  orbMesh.instanceMatrix.needsUpdate = true;
}

function updateBoard() {
  const all = [player, ...enemies].filter((s) => s.alive).sort((a, b) => b.mass - a.mass).slice(0, 5);
  boardEl.innerHTML = all.map((s, i) => '<div class="' + (s.isPlayer ? 'me' : '') + '"><span>' + (i + 1) + '. ' + (s.boss ? '👑 ' : '') + s.name + '</span><b>' + Math.round(s.mass) + '</b></div>').join('');
  const boss = enemies.find((e) => e.boss);
  hud.setProgress(boss ? Math.min(1, player.mass / (boss.mass + 1)) : 1);
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const camPos = new THREE.Vector3(0, 30, 20);
let boardT = 0;
function update(dt) {
  time += dt;
  if (state === 'play') playT += dt;
  shake = Math.max(0, shake - dt * 2.5);
  comboT -= dt;
  if (comboT <= 0) eatCombo = 0;
  if (state === 'play' || state === 'title' || state === 'win') {
    const movers = state === 'play' ? [player, ...enemies] : enemies;
    for (const sn of movers) if (sn.alive) stepSnake(sn, dt);
    if (state === 'title' || state === 'win') { player.dir += dt * 0.6; player.target = player.dir; stepSnake(player, dt); }
    for (const sn of [player, ...enemies]) if (sn.alive && !sn.boss) eatOrbs(sn);
    if (state === 'play') resolveClashes();
  }
  for (const sn of [player, ...enemies]) if (sn.alive || sn === player) drawSnake(sn);
  drawOrbs();
  updateParts(dt);
  if (hud && state === 'play') {
    boardT -= dt;
    if (boardT <= 0) { boardT = 0.25; updateBoard(); }
  }
  // camera zooms out as the player grows
  const r = radiusOf(player.mass);
  const h = (camera.aspect < 1 ? 12.5 : 10.5) + r * 7;
  const target = new THREE.Vector3(player.x, h, player.z + h * 0.62);
  camPos.lerp(target, Math.min(1, dt * 3));
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, 0, (Math.random() - 0.5) * shake));
  camera.lookAt(player.x, 0, player.z);
  sun.position.set(player.x + 15, 40, player.z + 10);
  sun.target.position.set(player.x, 0, player.z);
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

YT.onPause(() => { paused = true; steer.active = false; suspendAudio(); });
YT.onResume(() => { paused = false; last = performance.now(); resumeAudio(); });

window.__serpent = {
  info: () => ({
    state, level: save.level, mass: player ? player.mass : 0, x: player ? player.x : 0, z: player ? player.z : 0,
    enemies: enemies.map((e) => ({ x: e.x, z: e.z, mass: e.mass, boss: e.boss, body: e.path.filter((_, i) => i % 12 === 0).map((p) => [p.x, p.z]) })),
  }),
};

(async function boot() {
  YT.init('serpent-smash');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  save.owned = Object.assign({ lime: true }, save.owned);
  showTitle();
  requestAnimationFrame(frame);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
