/*
 * Stack Tower 3D — one tap. A block slides across the top of the tower; tap
 * to drop it. Whatever hangs over the edge is sliced off and falls. Land
 * perfectly to keep the full size, chain perfects to grow it back.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';
import { studio, canvasTexture, fitShadow } from 'look';

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
studio(renderer, scene, { intensity: 0.55 });
const hemi = new THREE.HemisphereLight(0xffffff, 0x50406a, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff2e2, 2.1);
fitShadow(key, 16, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 90;
key.shadow.camera.updateProjectionMatrix();
key.shadow.bias = -0.0006;
scene.add(key, key.target);
// soft cool fill from the opposite side keeps the shadowed faces colourful
const fill = new THREE.DirectionalLight(0xbcd2ff, 0.55);
fill.position.set(-14, 6, 4);
scene.add(fill, fill.target);

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

// ---------------------------------------------------------------------------
// Sky: a gradient that drifts from day to dusk to deep space as the tower rises
// ---------------------------------------------------------------------------
const bgCanvas = document.createElement('canvas');
bgCanvas.width = 4;
bgCanvas.height = 256;
const bgTex = new THREE.CanvasTexture(bgCanvas);
bgTex.colorSpace = THREE.SRGBColorSpace;
scene.background = bgTex;
const SKY_TOP = [[0, 0.62, 0.74], [250, 0.55, 0.52], [245, 0.6, 0.16]];
const SKY_BOT = [[340, 0.62, 0.84], [20, 0.8, 0.7], [270, 0.5, 0.3]];
const skyT = (y) => Math.max(0, Math.min(2, y / 45));
function mixHsl(stops, t, hue, out) {
  const i = Math.min(1, Math.floor(t)), f = t - i, a = stops[i], b = stops[i + 1];
  // the first stop follows the tower colour so each skin gets its own sky
  const ha = i === 0 ? (hue + 30 + a[0]) % 360 : a[0];
  let dh = b[0] - ha;
  dh = ((dh % 360) + 540) % 360 - 180;
  return out.setHSL((((ha + dh * f) % 360) + 360) % 360 / 360, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, THREE.SRGBColorSpace);
}
const skyA = new THREE.Color(), skyB = new THREE.Color();
let paintedAt = -1, paintedHue = -1;
function paintBackground(hue, y = 0) {
  const t = skyT(y);
  if (Math.abs(t - paintedAt) < 0.01 && hue === paintedHue) return;
  paintedAt = t; paintedHue = hue;
  mixHsl(SKY_TOP, t, hue, skyA);
  mixHsl(SKY_BOT, t, hue - 60, skyB);
  const g = bgCanvas.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#' + skyA.getHexString(THREE.SRGBColorSpace));
  grd.addColorStop(1, '#' + skyB.getHexString(THREE.SRGBColorSpace));
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  bgTex.needsUpdate = true;
  hemi.color.copy(skyA).lerp(new THREE.Color('#ffffff'), 0.6);
  clouds.forEach((c) => (c.material.opacity = Math.max(0, 1 - Math.max(0, t - 0.6) * 1.6) * c.userData.alpha));
  stars.material.opacity = Math.max(0, Math.min(1, (t - 1) * 1.4));
  stars.visible = stars.material.opacity > 0.01;
}

// backdrop layers sit on a plane behind the tower, facing the camera
const VIEW_DIR = new THREE.Vector3(1, 1, 1).normalize();
const SIDE = new THREE.Vector3(1, 0, -1).normalize();
const backAt = (u, v, depth, out) => out.copy(SIDE).multiplyScalar(u).addScaledVector(VIEW_DIR, -depth).setY(v - depth * VIEW_DIR.y);
const cloudTex = canvasTexture(256, 128, (g, w, h) => {
  // a few overlapping soft puffs with a flat-ish bottom
  const puffs = [[0.3, 0.62, 0.22], [0.5, 0.48, 0.3], [0.7, 0.6, 0.22], [0.42, 0.68, 0.2], [0.6, 0.7, 0.2]];
  for (const [x, y, r] of puffs) {
    const gr = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
}, { srgb: false });
const clouds = [];
for (let i = 0; i < 9; i++) {
  const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false }));
  const s = 7 + Math.random() * 7;
  c.scale.set(s, s * 0.5, 1);
  c.userData = { u: (Math.random() - 0.5) * 44, v: i * 7 - 18, alpha: 0.55 + Math.random() * 0.35, drift: 0.2 + Math.random() * 0.4, depth: 30 + Math.random() * 20 };
  c.renderOrder = -2;
  scene.add(c);
  clouds.push(c);
}
const STARS = 220;
const starPos = new Float32Array(STARS * 3);
const tv = new THREE.Vector3();
for (let i = 0; i < STARS; i++) backAt((Math.random() - 0.5) * 120, (Math.random() - 0.5) * 90, 60, tv).toArray(starPos, i * 3);
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starTex = canvasTexture(32, 32, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
}, { srgb: false });
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ map: starTex, size: 5, sizeAttenuation: false, transparent: true, depthWrite: false, opacity: 0 }));
stars.frustumCulled = false;
stars.renderOrder = -3;
scene.add(stars);
function updateBackdrop(dt) {
  const zoom = viewSize / 15;
  for (const c of clouds) {
    const d = c.userData;
    d.u += d.drift * dt;
    if (d.u > 26) d.u -= 52;
    // clouds scroll slower than the tower for a bit of parallax
    let v = d.v - camY * 0.45;
    v = ((v + 30) % 60 + 60) % 60 - 30;
    backAt(d.u * zoom, camY + v * zoom, d.depth, c.position);
  }
  stars.position.set(0, camY, 0);
  stars.scale.setScalar(Math.max(1, zoom));
}

// ---------------------------------------------------------------------------
// Blocks: rounded slabs, rebuilt at their exact size so corners stay round
// ---------------------------------------------------------------------------
function slabGeo(w, d, h = H) {
  const r = Math.max(0.02, Math.min(0.14, w * 0.3, d * 0.3));
  const g = new THREE.RoundedBoxGeometry(w, h, d, 2, r);
  // a gentle top-to-bottom gradient so every layer reads on its own
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + h / 2) / h;
    const v = 0.74 + 0.26 * t;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const tower = new THREE.Group();
scene.add(tower);
let baseHue = 320;
const colorFor = (i) => new THREE.Color().setHSL((((baseHue + i * 4.5) % 360) + 360) % 360 / 360, 0.74, 0.6, THREE.SRGBColorSpace);
function blockMat(i) {
  const s = SKINS.find((k) => k.id === save.skin) || SKINS[0];
  const shiny = s.id === 'gold';
  return new THREE.MeshStandardMaterial({ color: colorFor(i), vertexColors: true, roughness: shiny ? 0.22 : 0.3, metalness: shiny ? 0.65 : 0.05, emissive: 0xffffff, emissiveIntensity: 0 });
}

function addBlock(x, z, w, d, y, i) {
  const m = new THREE.Mesh(slabGeo(w, d), blockMat(i));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  tower.add(m);
  return m;
}
function resizeBlock(m, w, d) {
  m.geometry.dispose();
  m.geometry = slabGeo(w, d);
}

// the pedestal: a porcelain column with gold trims, kept between runs
const pedestal = new THREE.Group();
pedestal.userData.keep = true;
{
  const porcelain = new THREE.MeshPhysicalMaterial({ color: '#f4efe9', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, vertexColors: true });
  const gold = new THREE.MeshStandardMaterial({ color: '#f2c14e', roughness: 0.25, metalness: 0.9 });
  const plain = new THREE.MeshPhysicalMaterial({ color: '#e9e2da', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const part = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = m.receiveShadow = true; pedestal.add(m); return m; };
  const col = slabGeo(START, START, 11.2);
  part(col, porcelain, -5.1);
  part(new THREE.RoundedBoxGeometry(START + 0.5, 0.35, START + 0.5, 2, 0.12), gold, -0.55);
  part(new THREE.RoundedBoxGeometry(START + 0.9, 0.5, START + 0.9, 2, 0.16), plain, -9.2);
  part(new THREE.RoundedBoxGeometry(START + 1.3, 0.3, START + 1.3, 2, 0.1), gold, -9.6);
  part(new THREE.RoundedBoxGeometry(START + 2.2, 1.6, START + 2.2, 3, 0.3), plain, -10.5);
}
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = 'title'; // title | play | over
let paused = false, menuOpen = false;
let stack = [];      // {x,z,w,d,mesh}
let moving = null;   // {axis,dir,t,mesh,...}
let falling = [];    // sliced pieces
let score = 0, combo = 0, speed = 1, time = 0, camY = 0, shake = 0, thud = 0, revived = false;
let hud = null, scoreEl = null, stopHand = null;
let ripples = [];

function skinHue() { const s = SKINS.find((k) => k.id === save.skin) || SKINS[0]; return s.hue; }

function resetTower() {
  tower.remove(pedestal);
  tower.traverse((o) => { if (o.isMesh) { o.material.dispose(); o.geometry.dispose(); } });
  tower.clear();
  tower.add(pedestal);
  falling.forEach((f) => { scene.remove(f.mesh); f.mesh.material.dispose(); f.mesh.geometry.dispose(); });
  falling = [];
  stack = [];
  baseHue = skinHue();
  paintBackground(baseHue, 0);
  // the pedestal top is the first layer
  stack.push({ x: 0, z: 0, w: START, d: START, mesh: pedestal, y: 0 });
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
    ripple(nx, m.y, nz, nw, nd, combo);
    sparkle(nx, m.y + H / 2, nz, nw, nd, combo >= 3 ? '#ffe066' : '#ffffff');
    m.mesh.material.emissiveIntensity = 0.55;
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
  if (nw !== m.w || nd !== m.d) resizeBlock(m.mesh, nw, nd);
  m.mesh.position.set(nx, m.y, nz);
  m.mesh.userData.squash = 1;
  stack.push({ x: nx, z: nz, w: nw, d: nd, mesh: m.mesh, y: m.y });
  thud = 1;
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
  // tumble away from the tower, spinning about the cut edge
  const push = 1.6 + Math.random() * 1.2;
  falling.push({
    mesh, vy: 1.5 + Math.random(), vx: axis === 'x' ? sign * push : (Math.random() - 0.5) * 0.6, vz: axis === 'z' ? sign * push : (Math.random() - 0.5) * 0.6,
    rx: axis === 'z' ? sign * (2.2 + Math.random() * 2) : (Math.random() - 0.5) * 1.2, ry: (Math.random() - 0.5) * 2.4, rz: axis === 'x' ? -sign * (2.2 + Math.random() * 2) : (Math.random() - 0.5) * 1.2, life: 2.6,
  });
}

/** A glowing rounded outline that rings out from a perfect drop. */
function ringGeo(w, d, t) {
  const rr = (W, D, r) => {
    const p = new THREE.Shape(), x = -W / 2, y = -D / 2;
    p.moveTo(x + r, y); p.lineTo(x + W - r, y); p.quadraticCurveTo(x + W, y, x + W, y + r); p.lineTo(x + W, y + D - r);
    p.quadraticCurveTo(x + W, y + D, x + W - r, y + D); p.lineTo(x + r, y + D); p.quadraticCurveTo(x, y + D, x, y + D - r);
    p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
    return p;
  };
  const outer = rr(w + t * 2, d + t * 2, 0.35 + t);
  outer.holes.push(rr(w, d, 0.35));
  const g = new THREE.ShapeGeometry(outer, 4);
  g.rotateX(-Math.PI / 2);
  return g;
}
function ripple(x, y, z, w, d, c = 1) {
  const n = c >= 3 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const mat = new THREE.MeshBasicMaterial({ color: c >= 3 ? '#fff3a0' : '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(ringGeo(w + 0.25, d + 0.25, 0.22), mat);
    ring.position.set(x, y - H / 2 + 0.05, z);
    scene.add(ring);
    ripples.push({ line: ring, t: -k * 0.14 });
  }
}

// little glitter bits that pop off the rim of a perfect drop
const SPARKS = 90;
const sparkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), SPARKS);
sparkMesh.frustumCulled = false;
sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(sparkMesh);
const sparks = [];
const sm = new THREE.Matrix4(), sq = new THREE.Quaternion(), ss = new THREE.Vector3(), se = new THREE.Euler(), sc = new THREE.Color();
function sparkle(x, y, z, w, d, color) {
  for (let i = 0; i < 16; i++) {
    if (sparks.length >= SPARKS) sparks.shift();
    // a random point on the slab outline
    const e = Math.random() * 2 * (w + d);
    let px, pz;
    if (e < w) { px = -w / 2 + e; pz = -d / 2; } else if (e < w + d) { px = w / 2; pz = -d / 2 + e - w; } else if (e < 2 * w + d) { px = w / 2 - (e - w - d); pz = d / 2; } else { px = -w / 2; pz = d / 2 - (e - 2 * w - d); }
    const len = Math.hypot(px, pz) || 1;
    sparks.push({ p: new THREE.Vector3(x + px, y, z + pz), v: new THREE.Vector3((px / len) * (1.5 + Math.random() * 2), 2 + Math.random() * 3, (pz / len) * (1.5 + Math.random() * 2)), life: 0.5 + Math.random() * 0.4, r: Math.random() * 6, color });
  }
}
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.life -= dt;
    if (p.life <= 0) { sparks.splice(i, 1); continue; }
    p.v.y -= 9 * dt;
    p.p.addScaledVector(p.v, dt);
    p.r += dt * 8;
  }
  for (let i = 0; i < SPARKS; i++) {
    const p = sparks[i];
    if (!p) { sm.makeScale(0, 0, 0); sparkMesh.setMatrixAt(i, sm); continue; }
    const k = Math.min(1, p.life * 3);
    sm.compose(p.p, sq.setFromEuler(se.set(p.r, p.r * 0.7, 0)), ss.set(k, k, k));
    sparkMesh.setMatrixAt(i, sm);
    sparkMesh.setColorAt(i, sc.set(p.color));
  }
  sparkMesh.instanceMatrix.needsUpdate = true;
  if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
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
  paintBackground(baseHue, camY);
  stack.forEach((s, i) => {
    if (i === 0) return;
    s.mesh.material.dispose();
    s.mesh.material = blockMat(i);
  });
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
    f.vy -= 26 * dt;
    f.mesh.position.x += f.vx * dt;
    f.mesh.position.y += f.vy * dt;
    f.mesh.position.z += f.vz * dt;
    f.mesh.rotation.x += f.rx * dt;
    f.mesh.rotation.y += f.ry * dt;
    f.mesh.rotation.z += f.rz * dt;
    if (f.life < 0.5) f.mesh.scale.setScalar(Math.max(0.01, f.life / 0.5));
    if (f.life <= 0) { scene.remove(f.mesh); f.mesh.material.dispose(); f.mesh.geometry.dispose(); falling.splice(i, 1); }
  }
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.t += dt;
    const t = Math.max(0, r.t);
    const k = 1 + t * 0.9;
    r.line.scale.set(k, 1, k);
    r.line.material.opacity = r.t < 0 ? 0 : Math.max(0, 0.95 - t * 1.9);
    if (r.t > 0.5) { scene.remove(r.line); r.line.geometry.dispose(); r.line.material.dispose(); ripples.splice(i, 1); }
  }
  // landing squash and perfect flash on the freshest layers
  for (let i = Math.max(1, stack.length - 3); i < stack.length; i++) {
    const m = stack[i].mesh, u = m.userData;
    if (u.squash) {
      u.squash = Math.max(0, u.squash - dt * 5);
      const q = Math.sin(u.squash * Math.PI) * 0.12;
      m.scale.set(1 + q * 0.4, 1 - q, 1 + q * 0.4);
    }
    if (m.material.emissiveIntensity > 0) m.material.emissiveIntensity = Math.max(0, m.material.emissiveIntensity - dt * 2.2);
  }
  updateSparks(dt);
  // camera rises with the tower; zooms out at game over
  const topY = stack.length ? stack[stack.length - 1].y : 0;
  const targetY = zoomOut ? topY / 2 : topY;
  camY += (targetY - camY) * Math.min(1, dt * 3);
  const targetView = zoomOut ? Math.max(15, topY * 0.75 + 6) : 15;
  if (Math.abs(viewSize - targetView) > 0.01) { viewSize += (targetView - viewSize) * Math.min(1, dt * 2.5); applyZoom(); }
  shake = Math.max(0, shake - dt * 2);
  thud = Math.max(0, thud - dt * 6);
  camera.position.set(20 + (Math.random() - 0.5) * shake, camY + 20 - thud * 0.12, 20 + (Math.random() - 0.5) * shake);
  camera.lookAt(0, camY - thud * 0.12, 0);
  key.position.set(10, camY + 25, 15);
  key.target.position.set(0, camY - 4, 0);
  const half = Math.max(16, viewSize * 1.4);
  if (key.shadow.camera.top !== half) { Object.assign(key.shadow.camera, { left: -half, right: half, top: half, bottom: -half }); key.shadow.camera.updateProjectionMatrix(); }
  paintBackground(baseHue, camY);
  updateBackdrop(dt);
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
