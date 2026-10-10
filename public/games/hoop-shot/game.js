/*
 * Hoop Shot 3D — arcade basketball. Swipe up toward the hoop to shoot:
 * the direction aims, the length sets the power. The ball flies with real
 * physics, so it rattles off the rim and backboard. Beat the target score
 * before the clock runs out; the hoop starts moving in later levels. Three
 * baskets in a row and you're ON FIRE for double points.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';

const G = 11;              // gravity (a touch above real for snappy arcs)
const BALL_R = 0.12;
const RIM_R = 0.24;
const RIM_TUBE = 0.02;
const RIM_Y = 3.05;
const ROUND_TIME = 40;
const START = new THREE.Vector3(0, 1.15, 0);

const SKINS = [
  { id: 'classic', name: 'Classic', color: '#f37021', base: '#f37021', seam: '#2b1600', price: 0 },
  { id: 'street', name: 'Street', color: '#c0392b', base: '#c0392b', seam: '#ffffff', price: 150 },
  { id: 'ice', name: 'Ice', color: '#7fdbff', base: '#7fdbff', seam: '#0b3d91', price: 250 },
  { id: 'lime', name: 'Lime', color: '#9ef01a', base: '#9ef01a', seam: '#1b4332', price: 350 },
  { id: 'galaxy', name: 'Galaxy', color: 'linear-gradient(135deg,#3a0ca3,#f72585)', base: '#5a189a', seam: '#f72585', stars: true, price: 600 },
  { id: 'gold', name: 'Gold', color: 'linear-gradient(135deg,#ffe066,#e09b00)', base: '#f5c518', seam: '#7a4f00', metal: true, price: 900 },
  { id: 'beach', name: 'Beach', color: 'linear-gradient(90deg,#ff4d6d,#ffd60a,#3a86ff)', stripes: ['#ff4d6d', '#ffffff', '#ffd60a', '#ffffff', '#3a86ff', '#ffffff'], price: 0, ad: true },
  { id: 'neon', name: 'Neon', color: '#ff6fd8', base: '#ff6fd8', seam: '#ffffff', glow: true, price: 1400 },
];

let save = { level: 1, coins: 0, best: 0, sound: true, tutorial: false, skin: 'classic', owned: { classic: true } };
let saveTimer = 0;
function persist(now) {
  clearTimeout(saveTimer);
  if (now) YT.save(save);
  else saveTimer = setTimeout(() => YT.save(save), 300);
}

// ---------------------------------------------------------------------------
// Renderer + scene
// ---------------------------------------------------------------------------
const canvas = document.createElement('canvas');
canvas.id = 'scene';
document.getElementById('game').appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1d2b53');
scene.fog = new THREE.Fog('#1d2b53', 14, 30);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2a1a, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(3, 9, 4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 4, bottom: -10, near: 1, far: 25 });
scene.add(key);
const rimLight = new THREE.PointLight(0xffb36b, 8, 8, 1.6);
rimLight.position.set(0, 4.6, -4);
scene.add(rimLight);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  const portrait = camera.aspect < 1;
  camera.fov = portrait ? 58 : 44;
  camera.position.set(0, portrait ? 2.2 : 2.3, portrait ? 2.9 : 3.0);
  camera.lookAt(0, portrait ? 2.25 : 1.75, -4.5);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, o || {}));

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// court floor: wooden planks with the key painted on
const floorTex = canvasTex(512, 1024, (g, w, h) => {
  for (let i = 0; i < 16; i++) {
    const l = 52 + ((i * 37) % 9);
    g.fillStyle = `hsl(32, 55%, ${l}%)`;
    g.fillRect(i * (w / 16), 0, w / 16, h);
    g.fillStyle = 'rgba(0,0,0,.08)';
    g.fillRect(i * (w / 16), 0, 2, h);
    for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(i * (w / 16), ((i * 131 + k * 173) % h), w / 16, 2); }
  }
  // painted key (lane) and free-throw circle
  g.fillStyle = 'rgba(220, 40, 60, .75)';
  g.fillRect(w * 0.3, 0, w * 0.4, h * 0.42);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.strokeRect(w * 0.3, 0, w * 0.4, h * 0.42);
  g.beginPath(); g.arc(w / 2, h * 0.42, w * 0.2, 0, Math.PI); g.stroke();
  g.beginPath(); g.arc(w / 2, 0, w * 0.48, 0, Math.PI); g.stroke();
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 20), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.45, metalness: 0.05 }));
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, -6);
floor.receiveShadow = true;
scene.add(floor);

// back wall with an arcade light strip, side walls
const wallTex = canvasTex(1024, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#0f1733'); gr.addColorStop(1, '#283a7a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${0.05 + (i % 5) * 0.03})`;
    g.beginPath(); g.arc((i * 97) % w, 40 + ((i * 53) % 160), 3 + (i % 4), 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#ff6fd8'; g.fillRect(0, h * 0.62, w, 8);
  g.fillStyle = '#21d4d4'; g.fillRect(0, h * 0.66, w, 5);
});
const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, emissive: 0xffffff, emissiveMap: wallTex, emissiveIntensity: 0.25 }));
wall.position.set(0, 3.5, -9);
scene.add(wall);
for (const side of [-1, 1]) {
  const s = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), mat('#1a2550', { roughness: 0.95 }));
  s.rotation.y = -side * Math.PI / 2;
  s.position.set(side * 5, 3.5, -2);
  scene.add(s);
  // glowing light bars on the side walls
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 10), new THREE.MeshBasicMaterial({ color: side < 0 ? '#ff6fd8' : '#21d4d4' }));
  bar.position.set(side * 4.95, 4.2, -3);
  scene.add(bar);
}

// ---------------------------------------------------------------------------
// Hoop: backboard, rim, net, pole. Everything lives in `hoop` so it can move.
// ---------------------------------------------------------------------------
const hoop = new THREE.Group();
scene.add(hoop);
const boardTex = canvasTex(512, 300, (g, w, h) => {
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e63946'; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20);
  g.lineWidth = 10; g.strokeRect(w * 0.34, h * 0.42, w * 0.32, h * 0.42);
});
const BOARD = { w: 1.8, h: 1.05, d: 0.06, y: RIM_Y + 0.38, z: -RIM_R - 0.19 };
const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w, BOARD.h, BOARD.d), [
  mat('#dfe6ee'), mat('#dfe6ee'), mat('#dfe6ee'), mat('#dfe6ee'),
  new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.3 }), mat('#dfe6ee'),
]);
board.position.set(0, BOARD.y, BOARD.z);
board.castShadow = true;
hoop.add(board);
const rimMat = mat('#ff5a1f', { roughness: 0.35, metalness: 0.6, emissive: 0x401000 });
const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, RIM_TUBE, 10, 40), rimMat);
rim.rotation.x = Math.PI / 2;
rim.position.y = RIM_Y;
rim.castShadow = true;
hoop.add(rim);
const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.2), rimMat);
bracket.position.set(0, RIM_Y, -RIM_R - 0.08);
hoop.add(bracket);
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, BOARD.y + 0.2, 12), mat('#2b2d42', { metalness: 0.5, roughness: 0.4 }));
pole.position.set(0, (BOARD.y + 0.2) / 2, BOARD.z - 0.9);
pole.castShadow = true;
hoop.add(pole);
const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.9), pole.material);
arm.position.set(0, BOARD.y, BOARD.z - 0.47);
hoop.add(arm);
const padBase = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), mat('#e63946'));
padBase.position.set(0, 0.25, BOARD.z - 0.9);
hoop.add(padBase);

// net: a tapered open cylinder drawn as a wire mesh that swings on a score
const NET_SEG = 14, NET_ROWS = 4, NET_H = 0.42;
const netGeo = new THREE.BufferGeometry();
const netBase = [];
for (let r = 0; r <= NET_ROWS; r++) {
  const t = r / NET_ROWS;
  const rad = RIM_R * (1 - t * 0.42);
  for (let s = 0; s < NET_SEG; s++) {
    const a = (s + (r % 2) * 0.5) / NET_SEG * Math.PI * 2;
    netBase.push(new THREE.Vector3(Math.cos(a) * rad, -t * NET_H, Math.sin(a) * rad));
  }
}
const netIdx = [];
for (let r = 0; r < NET_ROWS; r++) {
  for (let s = 0; s < NET_SEG; s++) {
    const a = r * NET_SEG + s, b = (r + 1) * NET_SEG + s, c = (r + 1) * NET_SEG + ((s + (r % 2 ? 1 : NET_SEG - 1)) % NET_SEG);
    netIdx.push(a, b, a, c);
  }
}
for (let s = 0; s < NET_SEG; s++) netIdx.push(NET_ROWS * NET_SEG + s, NET_ROWS * NET_SEG + ((s + 1) % NET_SEG));
const netPos = new Float32Array(netBase.length * 3);
netGeo.setAttribute('position', new THREE.BufferAttribute(netPos, 3));
netGeo.setIndex(netIdx);
const net = new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
net.position.y = RIM_Y;
hoop.add(net);
let netSwish = 0, netPush = new THREE.Vector2();
function updateNet(dt) {
  netSwish = Math.max(0, netSwish - dt * 1.6);
  const k = Math.sin(netSwish * 14) * netSwish;
  for (let i = 0; i < netBase.length; i++) {
    const b = netBase[i];
    const depth = -b.y / NET_H;
    const stretch = 1 + k * 0.5 * depth;
    netPos[i * 3] = b.x * (1 - k * 0.25 * depth) + netPush.x * depth * netSwish;
    netPos[i * 3 + 1] = b.y * stretch;
    netPos[i * 3 + 2] = b.z * (1 - k * 0.25 * depth) + netPush.y * depth * netSwish;
  }
  netGeo.attributes.position.needsUpdate = true;
}
updateNet(0);

// glowing shooting spot under the ball
const spot = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 40), new THREE.MeshBasicMaterial({ color: '#ffd60a', transparent: true, opacity: 0.8 }));
spot.rotation.x = -Math.PI / 2;
spot.position.set(0, 0.01, 0);
scene.add(spot);

// ---------------------------------------------------------------------------
// Balls
// ---------------------------------------------------------------------------
const ballGeo = new THREE.SphereGeometry(BALL_R, 32, 20);
const ballMats = {};
function ballMaterial(id) {
  if (ballMats[id]) return ballMats[id];
  const s = SKINS.find((k) => k.id === id) || SKINS[0];
  const tex = canvasTex(512, 256, (g, w, h) => {
    if (s.stripes) {
      s.stripes.forEach((c, i) => { g.fillStyle = c; g.fillRect((i * w) / s.stripes.length, 0, w / s.stripes.length + 1, h); });
      return;
    }
    g.fillStyle = s.base; g.fillRect(0, 0, w, h);
    // pebbled leather
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.07)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    if (s.stars) for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.4 + Math.random() * 0.6) + ')'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, Math.random() * 2.2, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = s.seam; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    for (const x of [w / 4, (3 * w) / 4]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (const cx of [0, w / 2, w]) {
      for (const sgn of [-1, 1]) {
        g.beginPath();
        for (let y = 0; y <= h; y += 4) {
          const x = cx + sgn * (w * 0.11) * Math.sin((y / h) * Math.PI);
          if (y === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  });
  ballMats[id] = new THREE.MeshStandardMaterial({
    map: tex, roughness: s.metal ? 0.25 : 0.65, metalness: s.metal ? 0.7 : 0,
    emissive: s.glow ? 0xff2fbf : 0x000000, emissiveIntensity: s.glow ? 0.35 : 0,
  });
  return ballMats[id];
}
const fireMat = new THREE.MeshStandardMaterial({ color: '#ff7b00', emissive: '#ff3d00', emissiveIntensity: 0.9, roughness: 0.5 });

const balls = [];
let ready = null;          // the ball sitting on the ramp, ready to shoot
let readyT = 0;
function makeBall() {
  const m = new THREE.Mesh(ballGeo, ballMaterial(save.skin));
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.1, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(m, shadow);
  return { m, shadow, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, flying: false, scored: false, rimHits: 0, board: false, prevY: 0, fire: false, done: false };
}
function spawnReady() {
  const b = makeBall();
  b.pos.set(shooterX, START.y, START.z + 0.6);
  b.m.position.copy(b.pos);
  ready = b;
  readyT = 0;
}
function removeBall(b) {
  scene.remove(b.m, b.shadow);
  b.shadow.geometry.dispose();
}

// fire trail particles
const sparks = [];
const sparkGeo = new THREE.SphereGeometry(0.05, 6, 4);
function emitSpark(p, color) {
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
  m.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12));
  scene.add(m);
  sparks.push({ m, life: 0.45, vy: 0.6 + Math.random() * 0.6 });
}
// confetti burst when a basket drops
const confetti = [];
const confGeo = new THREE.PlaneGeometry(0.06, 0.1);
const confCols = ['#ffd60a', '#ff4d6d', '#3a86ff', '#3ddc97', '#ff6fd8', '#ffffff'];
function burstConfetti(at, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(confGeo, new THREE.MeshBasicMaterial({ color: confCols[i % confCols.length], side: THREE.DoubleSide, transparent: true }));
    m.position.copy(at);
    scene.add(m);
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2.5;
    confetti.push({ m, v: new THREE.Vector3(Math.cos(a) * s * 0.6, 2 + Math.random() * 3, Math.sin(a) * s * 0.4), r: new THREE.Vector3(Math.random() * 9, Math.random() * 9, 0), life: 1.6 });
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = 'title';
let paused = false, menuOpen = false;
let time = 0, clock = ROUND_TIME, score = 0, target = 10, streak = 0, onFire = false;
let shots = 0, makes = 0, swishes = 0, extended = false;
let hoopAmp = 0, hoopSpeed = 0, hoopZ = -4.6, hoopBob = 0, shooterX = 0;
let hud = null, stopHand = null;
const hoopCenter = new THREE.Vector3();

function levelSetup(n) {
  target = Math.min(45, 9 + n * 3);
  hoopZ = -4.4 - Math.min(1.4, (n - 1) * 0.12);
  hoopAmp = n < 3 ? 0 : Math.min(1.2, 0.3 + (n - 3) * 0.12);
  hoopSpeed = n < 3 ? 0 : Math.min(1.2, 0.5 + (n - 3) * 0.05);
  hoopBob = n < 8 ? 0 : Math.min(0.35, (n - 7) * 0.06);
}
function placeHoop() {
  hoop.position.set(Math.sin(time * hoopSpeed) * hoopAmp, Math.sin(time * hoopSpeed * 1.7) * hoopBob, hoopZ);
  hoopCenter.set(hoop.position.x, RIM_Y + hoop.position.y, hoop.position.z);
}

// ---------------------------------------------------------------------------
// Shooting
// ---------------------------------------------------------------------------
const proj = new THREE.Vector3();
function toScreen(v) {
  proj.copy(v).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
}

/**
 * Turn a swipe into a shot. The swipe line is extended up to the hoop on
 * screen to find where the player aimed; its length sets the power (how
 * deep the ball lands). A little assist pulls near-perfect shots in.
 */
function shoot(dx, dy) {
  if (!ready || state !== 'play') return;
  const b = ready;
  ready = null;
  const bs = toScreen(b.pos), hs = toScreen(hoopCenter);
  const right = toScreen(hoopCenter.clone().add(new THREE.Vector3(1, 0, 0)));
  const pxPerM = Math.max(1, right.x - hs.x);
  const sx = bs.x + (dx / dy) * (bs.y - hs.y);
  let aimX = hoopCenter.x + (sx - hs.x) / pxPerM;
  const power = dy / (window.innerHeight * 0.32);
  let depth = (power - 1) * 2.2; // metres past (+) or short (-) of the rim centre
  // assist: pull close shots toward the centre
  const ax = aimX - hoopCenter.x;
  if (Math.abs(ax) < 0.16) aimX = hoopCenter.x + ax * 0.6;
  if (Math.abs(depth) < 0.22) depth *= 0.6;
  const tgt = new THREE.Vector3(aimX, hoopCenter.y, hoopCenter.z - depth);
  // arc: apex ~0.9m above the rim, then solve the flight time down to rim height
  const apex = Math.max(tgt.y, b.pos.y) + 0.9 + Math.max(0, power - 1) * 0.3;
  const vy = Math.sqrt(2 * G * (apex - b.pos.y));
  const tUp = vy / G;
  const tDown = Math.sqrt(Math.max(0.01, (2 * (apex - tgt.y)) / G));
  const T = tUp + tDown;
  // half-lead a moving hoop for the player; they supply the rest
  tgt.x += hoopAmp * hoopSpeed * Math.cos(time * hoopSpeed) * T * 0.5;
  b.vel.set((tgt.x - b.pos.x) / T, vy, (tgt.z - b.pos.z) / T);
  b.spin.set(-6 - Math.random() * 2, 0, (Math.random() - 0.5) * 2);
  b.flying = true;
  b.fire = onFire;
  b.prevY = b.pos.y;
  if (onFire) b.m.material = fireMat;
  balls.push(b);
  shots++;
  sfx.whoosh();
  UI.buzz(8);
  setTimeout(() => { if (state === 'play' && !ready) spawnReady(); }, 520);
  if (stopHand) { stopHand(); stopHand = null; save.tutorial = true; persist(); }
}

function scoreBasket(b) {
  b.scored = true;
  const swish = b.rimHits === 0 && !b.board;
  streak++;
  makes++;
  if (swish) swishes++;
  let pts = swish ? 3 : 2;
  if (b.fire) pts *= 2;
  score += pts;
  hud.setProgress(score / target);
  updateScore(true);
  netSwish = 1;
  netPush.set((b.vel.x) * 0.02, (b.vel.z) * 0.02);
  const s = toScreen(hoopCenter.clone().add(new THREE.Vector3(0, 0.3, 0)));
  UI.floatText('+' + pts, s.x, s.y - 20, b.fire ? '#ffb703' : '#ffffff');
  noise(0, 0.25, 0.25, 5200, 0.8);
  if (swish) { tone(988, 0.02, 0.12, 'sine', 0.12); tone(1319, 0.1, 0.18, 'sine', 0.12); }
  else sfx.good();
  burstConfetti(hoopCenter.clone().add(new THREE.Vector3(0, -0.2, 0.1)), swish ? 26 : 14);
  if (streak === 3 && !onFire) {
    onFire = true;
    UI.praise('ON FIRE! 🔥', '#ff9f1c');
    sfx.win();
    UI.buzz([20, 30, 20]);
  } else if (swish) UI.praise(streak >= 3 ? 'SWISH x' + streak + '!' : 'SWISH!', '#7dffb2');
  if (score >= target && score - pts < target) { UI.praise('TARGET HIT!', '#ffd60a'); sfx.fanfare(); }
  if (score > save.best) save.best = score;
}

function missed() {
  if (onFire) { onFire = false; UI.floatText('Fire out', window.innerWidth / 2, window.innerHeight * 0.42, '#ffb3a7'); }
  streak = 0;
}

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------
const tmp = new THREE.Vector3(), n = new THREE.Vector3();
function bounce(b, normal, e, friction) {
  const vn = b.vel.dot(normal);
  if (vn >= 0) return false;
  b.vel.addScaledVector(normal, -(1 + e) * vn);
  // damp the tangential part a little
  tmp.copy(normal).multiplyScalar(b.vel.dot(normal));
  const tang = b.vel.clone().sub(tmp).multiplyScalar(friction);
  b.vel.copy(tmp).add(tang);
  return -vn;
}

function stepBall(b, dt) {
  b.vel.y -= G * dt;
  b.pos.addScaledVector(b.vel, dt);
  // rim: closest point on the hoop circle
  tmp.set(b.pos.x - hoopCenter.x, 0, b.pos.z - hoopCenter.z);
  const len = tmp.length() || 1e-4;
  const closest = new THREE.Vector3(hoopCenter.x + (tmp.x / len) * RIM_R, hoopCenter.y, hoopCenter.z + (tmp.z / len) * RIM_R);
  n.copy(b.pos).sub(closest);
  const d = n.length();
  if (d < BALL_R + RIM_TUBE && d > 1e-5) {
    n.multiplyScalar(1 / d);
    b.pos.copy(closest).addScaledVector(n, BALL_R + RIM_TUBE);
    const hit = bounce(b, n, 0.5, 0.88);
    if (hit > 0.4) { b.rimHits++; tone(420 + Math.random() * 60, 0, 0.09, 'triangle', Math.min(0.2, hit * 0.05)); rim.scale.setScalar(1.06); }
  }
  // backboard (axis-aligned box in hoop space)
  const bx = hoopCenter.x, by = BOARD.y + hoop.position.y, bz = hoopZ + BOARD.z;
  const cx = THREE.MathUtils.clamp(b.pos.x, bx - BOARD.w / 2, bx + BOARD.w / 2);
  const cy = THREE.MathUtils.clamp(b.pos.y, by - BOARD.h / 2, by + BOARD.h / 2);
  const cz = THREE.MathUtils.clamp(b.pos.z, bz - BOARD.d / 2, bz + BOARD.d / 2);
  n.set(b.pos.x - cx, b.pos.y - cy, b.pos.z - cz);
  const bd = n.length();
  if (bd < BALL_R && bd > 1e-5) {
    n.multiplyScalar(1 / bd);
    b.pos.set(cx, cy, cz).addScaledVector(n, BALL_R);
    const hit = bounce(b, n, 0.55, 0.9);
    if (hit > 0.4) { b.board = true; noise(0, 0.08, Math.min(0.25, hit * 0.04), 900); }
  }
  // pole (vertical cylinder)
  const px = hoopCenter.x, pz = hoopZ + BOARD.z - 0.9;
  tmp.set(b.pos.x - px, 0, b.pos.z - pz);
  const pd = tmp.length();
  if (pd < BALL_R + 0.1 && b.pos.y < BOARD.y + 0.2) { tmp.normalize(); b.pos.x = px + tmp.x * (BALL_R + 0.1); b.pos.z = pz + tmp.z * (BALL_R + 0.1); bounce(b, tmp, 0.5, 0.9); }
  // floor
  if (b.pos.y < BALL_R) {
    b.pos.y = BALL_R;
    const hit = bounce(b, n.set(0, 1, 0), 0.62, 0.92);
    if (hit > 1) { tone(110, 0, 0.08, 'sine', Math.min(0.25, hit * 0.04)); noise(0, 0.05, Math.min(0.12, hit * 0.02), 300); }
  }
  // side walls
  if (Math.abs(b.pos.x) > 4.8) { b.pos.x = Math.sign(b.pos.x) * 4.8; b.vel.x *= -0.6; }
  if (b.pos.z < -8.8) { b.pos.z = -8.8; b.vel.z *= -0.6; }
  // basket: the centre drops through the rim plane inside the ring
  if (!b.scored && b.prevY >= hoopCenter.y && b.pos.y < hoopCenter.y && b.vel.y < 0) {
    const r = Math.hypot(b.pos.x - hoopCenter.x, b.pos.z - hoopCenter.z);
    if (r < RIM_R - 0.03) scoreBasket(b);
  }
  b.prevY = b.pos.y;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .hs-board { position:absolute; left:50%; top:calc(max(10px, env(safe-area-inset-top)) + 64px); transform:translateX(-50%); display:flex; gap:10px; pointer-events:none !important; }
  .hs-chip { background:rgba(10,14,40,.72); color:#fff; border-radius:16px; padding:6px 14px; font:900 22px var(--font); text-align:center; min-width:74px;
    box-shadow: inset 0 0 0 2px rgba(255,255,255,.14); }
  .hs-chip small { display:block; font:800 11px var(--font); opacity:.7; letter-spacing:.08em; }
  .hs-chip.low b { color:#ff6b6b; }
  .hs-chip.fire { box-shadow: inset 0 0 0 2px #ff9f1c, 0 0 18px rgba(255,140,0,.7); }
  .hs-chip b.bump { display:inline-block; animation: fs-bump .25s ease-out; }
  @media (min-aspect-ratio: 1/1) { .hs-board { left:max(14px, env(safe-area-inset-left)); top:50%; transform:translateY(-50%); flex-direction:column; } }
`;
document.head.appendChild(css);
let boardEl = null, timeEl = null, scoreEl = null, scoreChip = null, timeChip = null;
function ensureHud() {
  if (hud) return;
  hud = UI.hud({ coins: save.coins, level: 'Level 1', right: [UI.iconButton('❚❚', 'Pause', openPause)] });
  boardEl = document.createElement('div');
  boardEl.className = 'hs-board';
  boardEl.innerHTML = '<div class="hs-chip t"><small>TIME</small><b>40</b></div><div class="hs-chip s"><small>SCORE</small><b>0</b></div><div class="hs-chip g"><small>TARGET</small><b>10</b></div>';
  document.getElementById('ui').appendChild(boardEl);
  timeChip = boardEl.querySelector('.t');
  timeEl = timeChip.querySelector('b');
  scoreChip = boardEl.querySelector('.s');
  scoreEl = scoreChip.querySelector('b');
}
function updateScore(bump) {
  scoreEl.textContent = String(score);
  boardEl.querySelector('.g b').textContent = String(target);
  scoreChip.classList.toggle('fire', onFire);
  if (bump) { scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump'); }
}
let lastSec = -1;
function updateClock() {
  const sec = Math.ceil(clock);
  if (sec === lastSec) return;
  lastSec = sec;
  timeEl.textContent = String(Math.max(0, sec));
  timeChip.classList.toggle('low', sec <= 5);
  if (sec <= 5 && sec > 0 && state === 'play') tone(880, 0, 0.06, 'square', 0.05);
}

function showTitle() {
  state = 'title';
  if (hud) { hud.show(false); boardEl.style.display = 'none'; }
  clearBalls();
  levelSetup(save.level);
  spawnReady();
  UI.titleScreen({
    line1: 'HOOP', line2: 'SHOT 3D',
    tagline: 'Swipe up to shoot. Swish it, catch fire, beat the clock.',
    best: 'Level ' + save.level + (save.best ? ' · Best ' + save.best : ''),
    onPlay: startLevel,
    extra: [
      UI.button('🏀 Balls', openShop, { style: 'blue', small: true }),
      UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true }),
    ],
  });
}

function clearBalls() {
  balls.forEach(removeBall);
  balls.length = 0;
  if (ready) { removeBall(ready); ready = null; }
}

function startLevel() {
  initAudio(() => save.sound);
  ensureHud();
  hud.show(true);
  boardEl.style.display = '';
  clearBalls();
  levelSetup(save.level);
  hud.setLevel('Level ' + save.level);
  hud.setCoins(save.coins);
  hud.setProgress(0);
  score = 0; streak = 0; onFire = false; shots = 0; makes = 0; swishes = 0; extended = false;
  clock = ROUND_TIME; lastSec = -1;
  shooterX = 0;
  updateScore(false);
  updateClock();
  spawnReady();
  state = 'play';
  if (save.level >= 3 && save.level === 3) UI.praise('MOVING HOOP!', '#7dd3fc');
  if (!save.tutorial) {
    stopHand = UI.tutorialHand(() => {
      const bs = ready ? toScreen(ready.pos) : { x: window.innerWidth / 2, y: window.innerHeight * 0.8 };
      return [[bs.x, bs.y], [bs.x, bs.y - window.innerHeight * 0.32]];
    }, 'Swipe up to shoot');
  }
}

function openPause() {
  if (state !== 'play') return;
  menuOpen = true;
  const p = UI.panel({
    title: 'Paused',
    buttons: [
      UI.button('Resume', () => { p.close(); menuOpen = false; }, { style: 'green' }),
      UI.button('Restart level', () => { p.close(); menuOpen = false; startLevel(); }),
      UI.button(save.sound ? 'Sound: on' : 'Sound: off', (b) => { save.sound = !save.sound; b.lastChild.textContent = save.sound ? 'Sound: on' : 'Sound: off'; persist(); }, { style: 'ghost' }),
      UI.button('Home', () => { p.close(); menuOpen = false; showTitle(); }, { style: 'ghost', small: true }),
    ],
  });
}

function openShop() {
  let p = null;
  const apply = () => { if (ready) ready.m.material = ballMaterial(save.skin); };
  const render = () => {
    if (p) p.close();
    p = UI.shopPanel({
      title: 'Balls', items: SKINS, owned: save.owned, current: save.skin, coins: save.coins,
      onSelect: (it) => { save.skin = it.id; persist(); apply(); render(); },
      onBuy: (it) => { if (save.coins < it.price) return; save.coins -= it.price; save.owned[it.id] = true; save.skin = it.id; persist(true); apply(); sfx.good(); render(); },
      onAdUnlock: async (it) => { if (await YT.rewarded('ball_' + it.id)) { save.owned[it.id] = true; save.skin = it.id; persist(true); apply(); sfx.fanfare(); } render(); },
      onClose: () => p.close(),
    });
  };
  render();
}

function endRound() {
  if (state !== 'play') return;
  state = 'settling';
  if (stopHand) { stopHand(); stopHand = null; }
  if (ready) { removeBall(ready); ready = null; }
  tone(523, 0, 0.5, 'square', 0.06);
  tone(392, 0.15, 0.6, 'square', 0.06);
  UI.praise("TIME'S UP!", '#ffffff');
  // let balls in the air finish
  const wait = () => {
    if (balls.some((b) => b.flying && b.t < 2.2 && !b.scored)) { setTimeout(wait, 150); return; }
    if (score >= target) win(); else lose();
  };
  setTimeout(wait, 700);
}

function lose() {
  state = 'lost';
  sfx.lose();
  UI.buzz([40, 60, 40]);
  const body = document.createElement('div');
  body.innerHTML = '<div class="big">' + score + ' / ' + target + '</div><div class="sub">' + makes + ' of ' + shots + ' shots · ' + swishes + ' swishes</div>';
  const btns = [];
  if (!extended) {
    btns.push(UI.button('+15 seconds', async () => {
      if (!(await YT.rewarded('extra_time'))) return;
      p.close();
      extended = true;
      clock = 15; lastSec = -1;
      state = 'play';
      spawnReady();
      UI.praise('+15 SECONDS!', '#7dffb2');
      sfx.win();
    }, { style: 'gold', ad: true }));
  }
  btns.push(UI.button('Try again', () => { p.close(); startLevel(); }, { style: extended ? 'green' : '' }));
  btns.push(UI.button('Home', () => { p.close(); showTitle(); }, { style: 'ghost', small: true }));
  const p = UI.panel({ title: 'So close!', sub: 'Score ' + target + ' points to clear the level.', body, buttons: btns });
}

function win() {
  state = 'won';
  sfx.fanfare();
  UI.buzz([20, 40, 20, 40, 60]);
  const ratio = score / target;
  const stars = ratio >= 1.6 ? 3 : ratio >= 1.25 ? 2 : 1;
  const reward = 20 + save.level * 4 + stars * 10 + swishes * 2;
  persist(true);
  YT.sendScore(save.best);
  const body = document.createElement('div');
  body.innerHTML = UI.starsHtml(stars) + '<div class="sub">' + score + ' points · ' + makes + '/' + shots + ' shots · ' + swishes + ' swishes</div><div class="reward"><span class="fs-coin" style="position:static;margin:0"></span><b>0</b></div>';
  UI.countUp(body.querySelector('.reward b'), 0, reward, 700);
  const collect = (mult) => {
    p.close();
    const gained = reward * mult;
    UI.coinBurst(window.innerWidth / 2, window.innerHeight / 2, 10, hud.coinEl, (i) => { sfx.coin(i); hud.setCoins(Math.round(save.coins - gained + (gained * (i + 1)) / 10), true); });
    save.coins += gained;
    save.level += 1;
    persist(true);
    setTimeout(() => {
      hud.setCoins(save.coins);
      const next = () => startLevel();
      if (save.level % 3 === 0) YT.interstitial().then(next); else next();
    }, 1000);
  };
  const p = UI.panel({
    title: 'Level ' + save.level + ' clear!', gold: true, body,
    buttons: [
      UI.button('Claim ×3', async () => { if (await YT.rewarded('triple_coins')) collect(3); }, { style: 'gold', ad: true }),
      UI.button('Next level', () => collect(1), { style: 'green' }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Input: swipe up
// ---------------------------------------------------------------------------
let swipe = null;
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (paused || menuOpen || state !== 'play') return;
  swipe = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  e.preventDefault();
});
window.addEventListener('pointerup', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = swipe.y - e.clientY;
  swipe = null;
  if (paused || menuOpen || state !== 'play') return;
  if (dy < 30) return;
  shoot(dx, dy);
});
window.addEventListener('pointercancel', () => { swipe = null; });

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function update(dt) {
  time += dt;
  placeHoop();
  if (state === 'play') {
    clock -= dt;
    updateClock();
    if (clock <= 0) endRound();
  }
  // ready ball rolls in and bobs
  if (ready) {
    readyT += dt;
    const k = Math.min(1, readyT * 4);
    ready.pos.set(shooterX, START.y + Math.abs(Math.sin(time * 3)) * 0.02, START.z + 0.6 * (1 - k));
    ready.m.position.copy(ready.pos);
    ready.m.rotation.x -= dt * 2 * (1 - k);
    ready.shadow.position.set(ready.pos.x, 0.005, ready.pos.z);
    ready.shadow.material.opacity = 0.3;
  }
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.t += dt;
    const sub = 6;
    for (let s = 0; s < sub; s++) stepBall(b, dt / sub);
    b.m.position.copy(b.pos);
    b.m.rotation.x += b.spin.x * dt;
    b.m.rotation.z += b.spin.z * dt;
    b.spin.multiplyScalar(1 - dt * 0.4);
    b.shadow.position.set(b.pos.x, 0.005, b.pos.z);
    b.shadow.material.opacity = Math.max(0, 0.35 - b.pos.y * 0.06);
    if (b.fire && b.t < 2) emitSpark(b.pos, Math.random() < 0.5 ? '#ff9f1c' : '#ffd60a');
    // a shot is over once it has had time to drop or it's rolling on the floor
    if (!b.done && (b.t > 2.4 || (b.t > 0.8 && b.pos.y < 0.3 && !b.scored))) {
      b.done = true;
      if (!b.scored && state === 'play') missed();
    }
    if (b.t > 4) { removeBall(b); balls.splice(i, 1); }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    s.m.position.y += s.vy * dt;
    s.m.scale.setScalar(Math.max(0.01, s.life * 2));
    s.m.material.opacity = Math.max(0, s.life * 2);
    if (s.life <= 0) { scene.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); }
  }
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.life -= dt;
    c.v.y -= 6 * dt;
    c.v.multiplyScalar(1 - dt * 1.5);
    c.m.position.addScaledVector(c.v, dt);
    c.m.rotation.x += c.r.x * dt;
    c.m.rotation.y += c.r.y * dt;
    c.m.material.opacity = Math.min(1, c.life * 2);
    if (c.life <= 0) { scene.remove(c.m); c.m.material.dispose(); confetti.splice(i, 1); }
  }
  rim.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 10));
  rimMat.emissive.setHex(onFire ? 0xff4000 : 0x401000);
  rimMat.emissiveIntensity = onFire ? 0.6 + Math.sin(time * 10) * 0.3 : 1;
  rimLight.intensity = onFire ? 14 : 8;
  spot.position.x = shooterX;
  spot.material.opacity = ready ? 0.55 + Math.sin(time * 5) * 0.25 : 0.2;
  rimLight.position.set(hoopCenter.x, 4.6, hoopZ + 0.6);
  updateNet(dt);
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

// read-only hook for automated play-tests
window.__hoop = {
  info: () => ({
    state, level: save.level, score, target, clock, streak, onFire, shots, makes, swishes,
    ready: !!ready, ball: ready ? toScreen(ready.pos) : null, hoop: toScreen(hoopCenter), hoopX: hoopCenter.x,
    hoopV: hoopAmp * hoopSpeed * Math.cos(time * hoopSpeed), pxm: toScreen(hoopCenter.clone().add(new THREE.Vector3(1, 0, 0))).x - toScreen(hoopCenter).x, flying: balls.filter((b) => !b.done).length,
  }),
};

(async function boot() {
  YT.init('hoop-shot');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  if (!save.owned) save.owned = { classic: true };
  resize();
  placeHoop();
  showTitle();
  requestAnimationFrame(frame);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
