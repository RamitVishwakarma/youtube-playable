/*
 * Grow Rush 3D — run through gates that grow or shrink your giant, grab
 * crystals, dodge saws and walls, then out-size the boss at the finish.
 *
 * three.js scene with procedural models (no assets), DOM UI from the shared
 * flagship kit, YouTube Playables SDK through yt.js.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const TRACK_W = 7;
const HALF_TRACK = TRACK_W / 2;
const START_POWER = 10;
const SKINS = [
  { id: 'red', name: 'Classic', color: '#ff4d6d', price: 0 },
  { id: 'blue', name: 'Ocean', color: '#3d8bff', price: 150 },
  { id: 'green', name: 'Lime', color: '#2ecc71', price: 250 },
  { id: 'gold', name: 'Gold', color: '#ffc300', price: 400 },
  { id: 'purple', name: 'Royal', color: '#9b5de5', price: 600 },
  { id: 'mint', name: 'Mint', color: '#2ee5c4', price: 800 },
  { id: 'pink', name: 'Bubble', color: '#ff6fd8', price: 1000 },
  { id: 'black', name: 'Ninja', color: '#2b2d42', price: 1500 },
  { id: 'rainbow', name: 'Hero', color: 'linear-gradient(135deg,#ff4d6d,#ffd60a,#2ee59d,#22c7ff)', price: 0, ad: true, mat: '#ff9f1c' },
];

// ---------------------------------------------------------------------------
// Save data
// ---------------------------------------------------------------------------
let save = { level: 1, coins: 0, skin: 'red', owned: { red: true }, sound: true, tutorial: false };
let saveTimer = 0;
function persist(now) {
  clearTimeout(saveTimer);
  if (now) YT.save(save);
  else saveTimer = setTimeout(() => YT.save(save), 300);
}

// ---------------------------------------------------------------------------
// Renderer, scene, lights
// ---------------------------------------------------------------------------
const canvas = document.createElement('canvas');
canvas.id = 'scene';
document.getElementById('game').appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const SKY_TOP = '#5aa9ff', SKY_BOTTOM = '#ffd6f0';
scene.background = gradientTexture(SKY_TOP, SKY_BOTTOM);
scene.fog = new THREE.Fog(0xf6d9ff, 60, 170);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
const hemi = new THREE.HemisphereLight(0xffffff, 0x9b8cff, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(8, 18, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(sun.target);

function gradientTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, top);
  grd.addColorStop(1, bottom);
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
  // portrait screens need a wider view to see the whole track
  camera.fov = camera.aspect < 1 ? 66 : 52;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Materials + shared geometry
// ---------------------------------------------------------------------------
const mat = (color, opts) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.05 }, opts || {}));
const M = {
  track: mat('#fff1fb', { roughness: 0.8 }),
  trackEdge: mat('#ff7eb6'),
  stripe: mat('#ffd1e8', { roughness: 0.9 }),
  post: mat('#ffffff', { roughness: 0.35 }),
  skin: mat('#ffd2b0', { roughness: 0.6 }),
  shirt: mat('#ff4d6d'),
  pants: mat('#3a3f8f'),
  shoe: mat('#ffffff'),
  eye: new THREE.MeshBasicMaterial({ color: '#1b1440' }),
  boss: mat('#7a2cbf'),
  bossPants: mat('#2b1d4f'),
  saw: mat('#c9d3e6', { metalness: 0.7, roughness: 0.25 }),
  sawHub: mat('#ff3d6e'),
  brick: mat('#ff9f43', { roughness: 0.7 }),
  island: mat('#a0f0c0', { roughness: 0.9 }),
  islandRock: mat('#c7a4ff', { roughness: 0.9 }),
  cloud: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
  crystal: mat('#36e0ff', { roughness: 0.15, metalness: 0.1, emissive: '#0a6f9e', emissiveIntensity: 0.6 }),
  finish: mat('#ffffff'),
  arena: mat('#ffe3f2', { roughness: 0.8 }),
};
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new THREE.RoundedBoxGeometry(1, 1, 1, 3, 0.18),
  sphere: new THREE.SphereGeometry(1, 24, 16),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 12),
  crystal: new THREE.OctahedronGeometry(0.42, 0),
  saw: makeSawGeometry(),
};

function makeSawGeometry() {
  const shape = new THREE.Shape();
  const teeth = 14, r1 = 1, r2 = 0.78;
  for (let i = 0; i <= teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 ? r2 : r1;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  g.translate(0, 0, -0.06);
  return g;
}

// ---------------------------------------------------------------------------
// Characters (procedural)
// ---------------------------------------------------------------------------
function makeCharacter(shirtMat, pantsMat, { boss = false } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // scaled with power
  root.add(body);
  const part = (geo, m, sx, sy, sz, x, y, z, parent) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    (parent || body).add(mesh);
    return mesh;
  };
  // legs (pivot at the hip)
  const legs = [-0.17, 0.17].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.78, 0);
    body.add(pivot);
    part(G.capsule, pantsMat, 0.26, 0.42, 0.26, 0, -0.36, 0, pivot);
    part(G.rbox, M.shoe, 0.24, 0.14, 0.36, 0, -0.74, -0.06, pivot);
    return pivot;
  });
  part(G.rbox, shirtMat, 0.64, 0.66, 0.4, 0, 1.12, 0); // torso
  part(G.rbox, pantsMat, 0.62, 0.16, 0.38, 0, 0.82, 0); // belt
  const arms = [-0.42, 0.42].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.36, 0);
    body.add(pivot);
    part(G.capsule, shirtMat, 0.2, 0.3, 0.2, 0, -0.22, 0, pivot);
    part(G.sphere, M.skin, 0.11, 0.11, 0.11, 0, -0.56, 0, pivot);
    return pivot;
  });
  const head = new THREE.Group();
  head.position.set(0, 1.72, 0);
  body.add(head);
  part(G.sphere, M.skin, 0.3, 0.3, 0.3, 0, 0, 0, head);
  part(G.sphere, M.eye, 0.045, 0.06, 0.03, -0.1, 0.03, -0.27, head);
  part(G.sphere, M.eye, 0.045, 0.06, 0.03, 0.1, 0.03, -0.27, head);
  if (boss) {
    // angry brows + horns
    part(G.box, M.eye, 0.12, 0.03, 0.03, -0.1, 0.12, -0.27, head).rotation.z = -0.4;
    part(G.box, M.eye, 0.12, 0.03, 0.03, 0.1, 0.12, -0.27, head).rotation.z = 0.4;
    const horn = new THREE.ConeGeometry(0.07, 0.22, 10);
    [-0.18, 0.18].forEach((x) => { const h = part(horn, M.post, 1, 1, 1, x, 0.27, 0, head); h.rotation.z = x < 0 ? 0.4 : -0.4; });
  } else {
    // hair tuft
    part(G.sphere, pantsMat, 0.31, 0.16, 0.31, 0, 0.16, 0.03, head);
  }
  return { root, body, legs, arms, head, phase: 0 };
}

function animateRun(ch, speed, dt) {
  ch.phase += dt * speed * 1.4;
  const s = Math.sin(ch.phase), c = Math.cos(ch.phase * 2);
  ch.legs[0].rotation.x = s * 0.9;
  ch.legs[1].rotation.x = -s * 0.9;
  ch.arms[0].rotation.x = -s * 0.8;
  ch.arms[1].rotation.x = s * 0.8;
  ch.arms[0].rotation.z = 0.1;
  ch.arms[1].rotation.z = -0.1;
  ch.body.position.y = Math.abs(c) * 0.06;
  ch.head.rotation.z = s * 0.04;
}
function animateIdle(ch, t) {
  ch.legs.forEach((l) => (l.rotation.x *= 0.85));
  ch.arms[0].rotation.x = Math.sin(t * 2) * 0.1;
  ch.arms[1].rotation.x = -Math.sin(t * 2) * 0.1;
  ch.arms[0].rotation.z = 0.15;
  ch.arms[1].rotation.z = -0.15;
  ch.body.position.y = Math.sin(t * 3) * 0.02;
}

// Number label floating above a character (canvas texture sprite).
function makeLabel() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.renderOrder = 10;
  sprite.scale.set(2.4, 1.2, 1);
  let last = null;
  return {
    sprite,
    set(v, color) {
      const key = v + color;
      if (key === last) return;
      last = key;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 256, 128);
      g.font = '900 92px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 16;
      g.strokeStyle = '#1b1440';
      g.strokeText(String(v), 128, 68);
      g.fillStyle = color || '#ffffff';
      g.fillText(String(v), 128, 68);
      tex.needsUpdate = true;
    },
  };
}

const sizeFor = (p) => Math.min(4.2, 0.85 + Math.sqrt(Math.max(0, p)) * 0.2);

// ---------------------------------------------------------------------------
// Particles (instanced cubes)
// ---------------------------------------------------------------------------
const MAX_P = 260;
const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAX_P);
pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pMesh.frustumCulled = false;
scene.add(pMesh);
const parts = [];
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
function burst(pos, color, n, speed = 6, size = 0.18, up = 4) {
  for (let i = 0; i < n; i++) {
    if (parts.length >= MAX_P) parts.shift();
    parts.push({
      x: pos.x, y: pos.y, z: pos.z,
      vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed * 0.6 + up, vz: (Math.random() - 0.5) * speed,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, life: 0.7 + Math.random() * 0.6, max: 1.3, s: size * (0.6 + Math.random() * 0.8),
      color: Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color,
    });
  }
}
function updateParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy -= 18 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.05 && Math.abs(p.x) < HALF_TRACK && p.vy < 0) { p.y = 0.05; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
    p.r += p.vr * dt;
  }
  for (let i = 0; i < MAX_P; i++) {
    const p = parts[i];
    if (!p) { tmpM.makeScale(0, 0, 0); pMesh.setMatrixAt(i, tmpM); continue; }
    const s = p.s * Math.min(1, p.life / 0.3);
    tmpE.set(p.r, p.r * 0.7, 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(s, s, s));
    pMesh.setMatrixAt(i, tmpM);
    pMesh.setColorAt(i, tmpC.set(p.color));
  }
  pMesh.instanceMatrix.needsUpdate = true;
  if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Scenery that never changes: clouds and floating islands
// ---------------------------------------------------------------------------
const scenery = new THREE.Group();
scene.add(scenery);
(function buildScenery() {
  const rng = mulberry32(42);
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.6, 0.6, 7), M.island);
    const rock = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.2, 7), M.islandRock);
    rock.position.y = -1.4;
    rock.rotation.x = Math.PI;
    g.add(top, rock);
    const s = 2 + rng() * 4;
    g.scale.set(s, s, s);
    g.position.set(side * (14 + rng() * 30), -6 + rng() * 10, -i * 22 - rng() * 10);
    scenery.add(g);
  }
  for (let i = 0; i < 18; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(G.sphere, M.cloud);
      m.scale.setScalar(1.2 + rng() * 1.4);
      m.position.set(k * 1.6 - 2.4, rng() * 0.6, rng() * 0.8);
      g.add(m);
    }
    const s = 1.5 + rng() * 2;
    g.scale.set(s, s * 0.7, s);
    g.position.set((rng() - 0.5) * 140, 14 + rng() * 18, -i * 30 - rng() * 20);
    scenery.add(g);
  }
})();

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Level generation
// ---------------------------------------------------------------------------
const level = new THREE.Group();
scene.add(level);
let L = null; // current level data

function opText(o) { return o.op === '+' ? '+' + o.v : o.op === '-' ? '−' + o.v : o.op === 'x' ? '×' + o.v : '÷' + o.v; }
function applyOp(p, o) {
  if (o.op === '+') return p + o.v;
  if (o.op === '-') return p - o.v;
  if (o.op === 'x') return p * o.v;
  return Math.floor(p / o.v);
}
const isGood = (o) => o.op === '+' || o.op === 'x';

function genGatePair(rng, n, power) {
  const scale = 1 + n * 0.12;
  const plus = () => ({ op: '+', v: Math.round((5 + rng() * 20) * scale / 5) * 5 });
  const minus = () => ({ op: '-', v: Math.round((5 + rng() * 15) * scale / 5) * 5 });
  const mult = () => ({ op: 'x', v: rng() < 0.85 ? 2 : 3 });
  const div = () => ({ op: '/', v: 2 });
  const r = rng();
  let a, b;
  if (r < 0.45) { a = rng() < 0.75 ? plus() : mult(); b = rng() < 0.7 ? minus() : div(); }
  else if (r < 0.75) { a = plus(); b = rng() < 0.5 ? plus() : mult(); } // pick the bigger one
  else { a = minus(); b = rng() < 0.6 ? minus() : div(); } // pick the lesser evil
  // "×2" vs "+40": the better choice depends on your size
  if (power > 40 && rng() < 0.3) { a = mult(); b = plus(); }
  return rng() < 0.5 ? [a, b] : [b, a];
}

function buildLevel(n) {
  // free the previous level's own geometry, materials and textures
  const sharedGeo = new Set(Object.values(G));
  const sharedMat = new Set(Object.values(M));
  level.traverse((o) => {
    if (o.geometry && !sharedGeo.has(o.geometry)) o.geometry.dispose();
    if (o.material && !sharedMat.has(o.material)) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
  level.clear();
  const rng = mulberry32(n * 7919 + 17);
  const length = Math.min(330, 170 + n * 9);
  const finishZ = -length;
  const events = [];
  let sim = START_POWER; // best-play simulation to size the boss fairly
  let z = -26;
  let i = 0;
  while (z > finishZ + 22) {
    let type;
    if (i === 0) type = 'gates';
    else {
      const r = rng();
      type = r < 0.42 ? 'gates' : r < 0.66 ? 'crystals' : r < 0.84 ? 'saw' : 'wall';
      if (n === 1 && (type === 'saw' || type === 'wall') && i < 3) type = 'crystals';
    }
    if (type === 'gates') {
      const opts = genGatePair(rng, n, sim);
      events.push({ type, z, opts });
      sim = Math.max(applyOp(sim, opts[0]), applyOp(sim, opts[1]));
    } else if (type === 'crystals') {
      const lane = [-2.2, 0, 2.2][(rng() * 3) | 0];
      const count = 6 + ((rng() * 5) | 0);
      const zig = rng() < 0.35;
      const value = 1 + Math.floor(n / 4);
      const items = [];
      for (let k = 0; k < count; k++) items.push({ x: zig ? Math.sin(k * 0.8) * 2.2 : lane, z: z - k * 1.6, got: false });
      events.push({ type, z, items, value });
      sim += count * value;
      z -= count * 1.6;
    } else if (type === 'saw') {
      const lanes = rng() < 0.5 ? [[-2.2], [0], [2.2]][(rng() * 3) | 0] : [[-2.2, 2.2], [-2.2, 0], [0, 2.2]][(rng() * 3) | 0];
      events.push({ type, z, lanes, cost: Math.round((8 + n * 1.5) / 2) * 2, moving: n > 3 && rng() < 0.4 });
    } else {
      const lane = [-2.33, 0, 2.33][(rng() * 3) | 0];
      events.push({ type, z, x: lane, w: 2.3, cost: Math.round((15 + n * 3) / 5) * 5 });
    }
    z -= 15 + rng() * 9;
    i++;
  }
  const bossPower = Math.max(8, Math.round(sim * Math.min(0.72, 0.42 + n * 0.025)));
  L = { n, length, finishZ, events, bossPower, simBest: sim };
  buildLevelMeshes();
}

function labelTexture(text, bg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.globalAlpha = 0.0;
  g.fillRect(0, 0, 256, 160);
  g.globalAlpha = 1;
  g.font = '900 104px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 14;
  g.strokeStyle = 'rgba(20,10,60,0.85)';
  g.strokeText(text, 128, 86);
  g.fillStyle = '#ffffff';
  g.fillText(text, 128, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildLevelMeshes() {
  const len = L.length + 40;
  // track
  const track = new THREE.Mesh(G.box, M.track);
  track.scale.set(TRACK_W, 1, len);
  track.position.set(0, -0.5, -len / 2 + 12);
  track.receiveShadow = true;
  level.add(track);
  [-1, 1].forEach((s) => {
    const edge = new THREE.Mesh(G.rbox, M.trackEdge);
    edge.scale.set(0.5, 0.7, len);
    edge.position.set(s * (HALF_TRACK + 0.2), -0.25, -len / 2 + 12);
    edge.receiveShadow = true;
    edge.castShadow = true;
    level.add(edge);
  });
  const stripes = new THREE.InstancedMesh(G.box, M.stripe, Math.ceil(len / 6));
  for (let i = 0; i < stripes.count; i++) {
    tmpM.compose(tmpP.set(0, 0.005, 10 - i * 6), tmpQ.identity(), tmpS.set(TRACK_W - 0.6, 0.01, 0.9));
    stripes.setMatrixAt(i, tmpM);
  }
  stripes.receiveShadow = true;
  level.add(stripes);

  for (const e of L.events) {
    if (e.type === 'gates') {
      e.meshes = [];
      e.opts.forEach((o, k) => {
        const x = k === 0 ? -HALF_TRACK / 2 : HALF_TRACK / 2;
        const g = new THREE.Group();
        g.position.set(x, 0, e.z);
        const good = isGood(o);
        const color = good ? '#2fa8ff' : '#ff3b5c';
        const panelMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(HALF_TRACK - 0.25, 3.4), panelMat);
        panel.position.y = 1.7;
        g.add(panel);
        const tex = labelTexture(opText(o), color);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
        label.userData.ownTex = true;
        label.position.set(0, 2.1, 0.02);
        g.add(label);
        const top = new THREE.Mesh(G.rbox, new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
        top.scale.set(HALF_TRACK - 0.1, 0.32, 0.32);
        top.position.y = 3.5;
        top.castShadow = true;
        g.add(top);
        [-1, 1].forEach((s) => {
          const post = new THREE.Mesh(G.rbox, M.post);
          post.scale.set(0.28, 3.6, 0.28);
          post.position.set(s * (HALF_TRACK / 2 - 0.05), 1.8, 0);
          post.castShadow = true;
          g.add(post);
        });
        level.add(g);
        e.meshes.push({ group: g, panel, panelMat, label });
      });
    } else if (e.type === 'crystals') {
      const inst = new THREE.InstancedMesh(G.crystal, M.crystal, e.items.length);
      inst.castShadow = true;
      e.mesh = inst;
      level.add(inst);
    } else if (e.type === 'saw') {
      e.saws = e.lanes.map((x) => {
        const g = new THREE.Group();
        const blade = new THREE.Mesh(G.saw, M.saw);
        blade.scale.setScalar(1.05);
        blade.castShadow = true;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 16), M.sawHub);
        hub.rotation.x = Math.PI / 2;
        g.add(blade, hub);
        g.rotation.y = Math.PI / 2;
        g.position.set(x, 0.75, e.z);
        const slot = new THREE.Mesh(G.box, new THREE.MeshStandardMaterial({ color: '#3a2b6b' }));
        slot.scale.set(0.25, 0.04, 2.6);
        slot.position.set(x, 0.01, e.z);
        level.add(g, slot);
        return { g, blade, baseX: x };
      });
    } else if (e.type === 'wall') {
      const g = new THREE.Group();
      g.position.set(e.x, 0, e.z);
      e.bricks = [];
      const rows = 4, cols = 4;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const b = new THREE.Mesh(G.rbox, M.brick);
          const bw = e.w / cols;
          b.scale.set(bw * 0.96, 0.62, 0.7);
          b.position.set(-e.w / 2 + bw * (c + 0.5) + (r % 2 ? bw * 0.1 : 0), 0.32 + r * 0.64, 0);
          b.castShadow = true;
          b.receiveShadow = true;
          g.add(b);
          e.bricks.push(b);
        }
      }
      const tex = labelTexture('−' + e.cost, '#ff9f43');
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      label.userData.ownTex = true;
      label.position.set(0, 3.2, 0.1);
      g.add(label);
      e.group = g;
      e.label = label;
      level.add(g);
    }
  }

  // finish arena
  const fz = L.finishZ;
  const arena = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1, 40), M.arena);
  arena.position.set(0, -0.5, fz - 10);
  arena.receiveShadow = true;
  level.add(arena);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.35, 10, 48), M.trackEdge);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0, fz - 10);
  level.add(ring);
  // checkered finish line
  const check = document.createElement('canvas');
  check.width = 256;
  check.height = 32;
  const cg = check.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { cg.fillStyle = (i + j) % 2 ? '#1b1440' : '#ffffff'; cg.fillRect(i * 16, j * 16, 16, 16); }
  const ct = new THREE.CanvasTexture(check);
  ct.colorSpace = THREE.SRGBColorSpace;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W, 0.9), new THREE.MeshStandardMaterial({ map: ct }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.02, fz);
  line.userData.ownTex = true;
  level.add(line);
  // boss
  bossCh = makeCharacter(M.boss, M.bossPants, { boss: true });
  bossCh.root.position.set(0, 0, fz - 13);
  bossCh.root.rotation.y = Math.PI;
  const bs = sizeFor(L.bossPower) * 1.08;
  bossCh.body.scale.setScalar(bs);
  level.add(bossCh.root);
  bossLabel = makeLabel();
  bossLabel.set(L.bossPower, '#ffb3c6');
  bossLabel.sprite.position.set(0, 2.1 * bs + 0.8, 0);
  bossLabel.sprite.scale.set(2.4 * Math.max(1, bs * 0.6), 1.2 * Math.max(1, bs * 0.6), 1);
  bossCh.root.add(bossLabel.sprite);
  boss = { power: L.bossPower, shown: L.bossPower, size: bs, vel: null };
}

// ---------------------------------------------------------------------------
// Player + state
// ---------------------------------------------------------------------------
let playerCh = makeCharacter(M.shirt, M.pants);
scene.add(playerCh.root);
const playerLabel = makeLabel();
playerCh.root.add(playerLabel.sprite);
let bossCh = null, bossLabel = null, boss = null;

const P = {
  x: 0, z: 0, tx: 0, power: START_POWER, shownSize: sizeFor(START_POWER), speed: 0, hitT: 0, dead: false,
};
let state = 'title'; // title | run | boss | win | fail
let paused = false;
let menuOpen = false;
let time = 0;
let stateT = 0;
let shake = 0;
let slowmo = 1;
let duel = null;
let hud = null;
let titleUI = null;
let stopHand = null;
let runCoins = 0;

function applySkin() {
  const s = SKINS.find((k) => k.id === save.skin) || SKINS[0];
  M.shirt.color.set(s.mat || s.color);
}

function resetPlayer() {
  P.x = 0; P.tx = 0; P.z = 0; P.power = START_POWER; P.shownSize = sizeFor(START_POWER); P.speed = 0; P.hitT = 0; P.dead = false;
  playerCh.root.position.set(0, 0, 0);
  playerCh.root.rotation.set(0, 0, 0);
  playerCh.root.visible = true;
  playerLabel.set(P.power);
}

// ---------------------------------------------------------------------------
// Input: horizontal drag steers
// ---------------------------------------------------------------------------
let dragging = null;
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (state !== 'run' || paused || menuOpen) return;
  dragging = { id: e.pointerId, x0: e.clientX, tx0: P.tx };
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  if (stopHand) { stopHand(); stopHand = null; save.tutorial = true; persist(); }
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== dragging.id) return;
  const sens = (TRACK_W * 1.25) / Math.min(window.innerWidth, 700);
  P.tx = THREE.MathUtils.clamp(dragging.tx0 + (e.clientX - dragging.x0) * sens, -HALF_TRACK, HALF_TRACK);
});
const endDrag = (e) => { if (dragging && e.pointerId === dragging.id) dragging = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; if (stopHand && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { stopHand(); stopHand = null; } });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
function showTitle() {
  state = 'title';
  stateT = 0;
  if (hud) hud.show(false);
  buildLevel(save.level);
  resetPlayer();
  titleUI = UI.titleScreen({
    line1: 'GROW', line2: 'RUSH 3D',
    tagline: 'Pick the right gates. Become a giant.',
    best: 'Level ' + save.level,
    onPlay: startRun,
    extra: [
      UI.button('🎽 Skins', openShop, { style: 'blue', small: true }),
      UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true }),
    ],
  });
}

function ensureHud() {
  if (hud) return;
  hud = UI.hud({
    coins: save.coins,
    level: 'Level 1',
    right: [UI.iconButton('❚❚', 'Pause', openPause)],
  });
}

function startRun() {
  ensureHud();
  hud.show(true);
  hud.setCoins(save.coins);
  hud.setLevel('Level ' + save.level);
  hud.setProgress(0);
  buildLevel(save.level); // fresh copy: crystals, walls and gates reset on retry
  resetPlayer();
  runCoins = 0;
  reviveAvailable = true;
  playerCh.root.rotation.set(0, 0, 0);
  state = 'run';
  stateT = 0;
  slowmo = 1;
  sfx.whoosh();
  if (!save.tutorial) {
    stopHand = UI.tutorialHand(() => {
      const y = window.innerHeight * 0.72;
      return [[window.innerWidth * 0.3, y], [window.innerWidth * 0.7, y]];
    }, 'Drag to steer');
  }
}

function openPause() {
  if (state !== 'run' || menuOpen) return;
  menuOpen = true;
  const p = UI.panel({
    title: 'Paused',
    buttons: [
      UI.button('Resume', () => { p.close(); menuOpen = false; }, { style: 'green' }),
      UI.button('Restart', () => { p.close(); menuOpen = false; startRun(); }),
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
      items: SKINS, owned: save.owned, current: save.skin, coins: save.coins,
      onSelect: (it) => { save.skin = it.id; applySkin(); persist(); render(); },
      onBuy: (it) => {
        if (save.coins < it.price) return;
        save.coins -= it.price; save.owned[it.id] = true; save.skin = it.id; applySkin(); persist(true); sfx.good(); render();
      },
      onAdUnlock: async (it) => {
        if (await YT.rewarded('skin_' + it.id)) { save.owned[it.id] = true; save.skin = it.id; applySkin(); persist(true); sfx.fanfare(); }
        render();
      },
      onClose: () => p.close(),
    });
  };
  render();
}

// screen position of a world point (for DOM effects)
const proj = new THREE.Vector3();
function toScreen(v) {
  proj.copy(v).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
}

function changePower(delta, worldPos, kind) {
  const before = P.power;
  P.power = Math.max(0, Math.round(delta.op ? applyOp(P.power, delta) : P.power + delta));
  const d = P.power - before;
  playerLabel.set(P.power, d >= 0 ? '#ffffff' : '#ffb3c6');
  if (worldPos && kind !== 'crystal') {
    const s = toScreen(worldPos);
    UI.floatText((d >= 0 ? '+' : '−') + Math.abs(d), s.x, s.y, d >= 0 ? '#7dffb2' : '#ff8fa3');
  }
  if (P.power <= 0) failRun('shrunk');
}

function failRun(reason) {
  if (state !== 'run' && state !== 'boss') return;
  state = 'fail';
  stateT = 0;
  P.dead = true;
  sfx.lose();
  UI.buzz([40, 60, 40]);
  if (reason === 'shrunk') {
    burst(playerCh.root.position.clone().setY(1), ['#ffffff', '#ff4d6d', '#ffd60a'], 30, 7, 0.22);
    playerCh.root.visible = false;
  }
  setTimeout(showFailPanel, 1100);
}

function showFailPanel() {
  const canRevive = reviveAvailable && state === 'fail' && failReason() === 'run';
  const btns = [];
  if (canRevive) {
    btns.push(UI.button('Revive', async () => {
      if (!(await YT.rewarded('revive'))) return;
      p.close();
      reviveAvailable = false;
      P.power = Math.max(15, Math.round(L.bossPower * 0.2));
      P.dead = false;
      playerCh.root.visible = true;
      playerLabel.set(P.power);
      state = 'run';
      UI.praise('REVIVED!', '#7dffb2');
      sfx.fanfare();
    }, { style: 'gold', ad: true }));
  }
  btns.push(UI.button('Try again', () => { p.close(); startRun(); }, { style: canRevive ? '' : 'green' }));
  btns.push(UI.button('Home', () => { p.close(); showTitle(); }, { style: 'ghost', small: true }));
  const p = UI.panel({ title: 'Level failed', sub: P.z <= L.finishZ ? 'The boss was too strong. Grab bigger gates!' : 'You shrank to nothing!', buttons: btns });
}
let reviveAvailable = true;
const failReason = () => (P.z <= L.finishZ + 0.5 ? 'boss' : 'run');

function winRun() {
  state = 'win';
  stateT = 0;
  const surplus = P.power;
  const ratio = surplus / Math.max(1, L.bossPower);
  const stars = ratio >= 0.6 ? 3 : ratio >= 0.25 ? 2 : 1;
  const reward = 20 + Math.round(surplus * 0.5) + stars * 10 + runCoins;
  sfx.fanfare();
  UI.buzz([20, 40, 20, 40, 60]);
  confetti();
  setTimeout(() => {
    const body = document.createElement('div');
    body.innerHTML = UI.starsHtml(stars) + '<div class="reward"><span class="fs-coin" style="position:static;margin:0"></span><b>0</b></div>';
    const amount = body.querySelector('b');
    UI.countUp(amount, 0, reward, 800);
    const finish = (mult, panelRef) => {
      panelRef.close();
      const gained = reward * mult;
      const s = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      UI.coinBurst(s.x, s.y, 10, hud.coinEl, (i) => { sfx.coin(i); hud.setCoins(save.coins - gained + Math.round(gained * (i + 1) / 10), true); });
      save.coins += gained;
      save.level += 1;
      persist(true);
      YT.sendScore(save.level - 1);
      setTimeout(() => {
        hud.setCoins(save.coins);
        const next = () => { buildLevel(save.level); startRun(); };
        if ((save.level - 1) % 2 === 0) YT.interstitial().then(next); else next();
      }, 1100);
    };
    const p = UI.panel({
      title: 'Level ' + L.n + ' complete!', gold: true, body,
      buttons: [
        UI.button('Claim ×3', async () => { if (await YT.rewarded('triple_coins')) finish(3, p); }, { style: 'gold', ad: true }),
        UI.button('Next level', () => finish(1, p), { style: 'green' }),
      ],
    });
  }, 1600);
}

function confetti() {
  const pos = playerCh.root.position.clone();
  for (let k = 0; k < 4; k++) {
    setTimeout(() => burst(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 6 + Math.random() * 3, -3)), ['#ff4d6d', '#ffd60a', '#2ee59d', '#22c7ff', '#b15cff'], 40, 9, 0.16, 2), k * 180);
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
const camPos = new THREE.Vector3(0, 8, 12);
const camLook = new THREE.Vector3();

function update(dt) {
  time += dt;
  stateT += dt;
  const sdt = dt * slowmo;
  shake = Math.max(0, shake - dt * 2.5);
  P.hitT = Math.max(0, P.hitT - dt);

  if (state === 'run') updateRun(sdt);
  else if (state === 'boss') updateBoss(sdt);
  else if (state === 'title') {
    animateIdle(playerCh, time);
    playerCh.root.rotation.y = Math.PI + Math.sin(time * 0.6) * 0.5; // face the camera
  } else if (state === 'win') {
    // victory: arms up, little hops
    playerCh.arms[0].rotation.x = -2.6 + Math.sin(time * 8) * 0.2;
    playerCh.arms[1].rotation.x = -2.6 - Math.sin(time * 8) * 0.2;
    playerCh.body.position.y = Math.abs(Math.sin(time * 6)) * 0.4;
    playerCh.root.rotation.y += (Math.PI - playerCh.root.rotation.y) * Math.min(1, dt * 3);
    if (boss && boss.vel) {
      bossCh.root.position.addScaledVector(boss.vel, dt);
      boss.vel.y -= 25 * dt;
      bossCh.root.rotation.x -= dt * 6;
    }
  } else if (state === 'fail' && P.z <= L.finishZ + 0.5) {
    playerCh.root.position.z += 10 * dt;
    playerCh.root.position.y = Math.max(-30, playerCh.root.position.y + (8 - stateT * 22) * dt);
    playerCh.root.rotation.x += dt * 5;
  }

  // size follows power with a springy pop
  const target = sizeFor(P.power);
  P.shownSize += (target - P.shownSize) * Math.min(1, dt * 7);
  const pop = 1 + Math.sin(Math.min(1, P.hitT * 3) * Math.PI) * 0.06;
  playerCh.body.scale.setScalar(P.shownSize * pop);
  playerLabel.sprite.position.set(0, 2.1 * P.shownSize + 0.7, 0);
  const ls = Math.max(1, P.shownSize * 0.55);
  playerLabel.sprite.scale.set(2.4 * ls, 1.2 * ls, 1);
  M.shirt.emissive.set(P.hitT > 0 ? '#ff0033' : '#000000');
  M.shirt.emissiveIntensity = P.hitT > 0 ? P.hitT * 2 : 0;

  if (bossCh && state !== 'boss' && state !== 'win') animateIdle(bossCh, time + 1.3);
  updateParticles(dt);
  updateCamera(dt);
  // spin crystals, saws
  if (L) {
    for (const e of L.events) {
      if (e.type === 'crystals') {
        e.items.forEach((it, k) => {
          // collected crystals shrink and rise once, then stay hidden (s stays 0)
          const s = it.got ? Math.max(0, (it.s ?? 1) - dt * 8) : 1;
          it.s = s;
          tmpE.set(0, time * 2 + k, 0);
          tmpQ.setFromEuler(tmpE);
          tmpM.compose(tmpP.set(it.x, 0.8 + Math.sin(time * 3 + k) * 0.12 + (it.got ? (1 - s) * 2 : 0), it.z), tmpQ, tmpS.set(s, s * 1.4, s));
          e.mesh.setMatrixAt(k, tmpM);
        });
        e.mesh.instanceMatrix.needsUpdate = true;
      } else if (e.type === 'saw') {
        e.saws.forEach((s, k) => {
          s.blade.rotation.z += dt * 14;
          if (e.moving) { s.g.position.x = THREE.MathUtils.clamp(s.baseX + Math.sin(time * 1.6 + k) * 1.4, -2.6, 2.6); }
        });
      } else if (e.type === 'wall' && e.smashed) {
        e.bricks.forEach((b) => {
          if (!b.userData.v) return;
          b.position.addScaledVector(b.userData.v, dt);
          b.userData.v.y -= 20 * dt;
          b.rotation.x += b.userData.r * dt;
          b.rotation.y += b.userData.r * dt * 0.7;
        });
      } else if (e.type === 'gates' && e.passed) {
        e.meshes.forEach((m) => {
          m.panelMat.opacity = Math.max(0, m.panelMat.opacity - dt * 1.5);
          m.label.scale.multiplyScalar(1 + dt * 1.2);
          m.label.material.opacity = Math.max(0, (m.label.material.opacity ?? 1) - dt * 2);
        });
      }
    }
  }
}

function updateRun(dt) {
  const n = L.n;
  const maxSpeed = 10.5 + Math.min(4, n * 0.25);
  P.speed += (maxSpeed - P.speed) * Math.min(1, dt * 2.5);
  if (keys.ArrowLeft || keys.KeyA) P.tx = Math.max(-HALF_TRACK, P.tx - dt * 7);
  if (keys.ArrowRight || keys.KeyD) P.tx = Math.min(HALF_TRACK, P.tx + dt * 7);
  const half = 0.36 * P.shownSize;
  const lim = HALF_TRACK - half;
  P.tx = THREE.MathUtils.clamp(P.tx, -lim, lim);
  const prevX = P.x;
  P.x += (P.tx - P.x) * Math.min(1, dt * 12);
  const prevZ = P.z;
  P.z -= P.speed * dt;
  playerCh.root.position.set(P.x, 0, P.z);
  playerCh.root.rotation.y = THREE.MathUtils.clamp((P.x - prevX) / Math.max(dt, 0.001) * -0.05, -0.5, 0.5);
  animateRun(playerCh, P.speed, dt);
  hud.setProgress(P.z / L.finishZ);
  // dust trail
  if (Math.random() < dt * 14) burst(new THREE.Vector3(P.x + (Math.random() - 0.5) * half, 0.1, P.z + 0.4), '#ffffff', 1, 1.5, 0.12 * P.shownSize, 0.6);

  for (const e of L.events) {
    if (e.type === 'gates' && !e.passed && prevZ > e.z && P.z <= e.z) {
      e.passed = true;
      const k = P.x < 0 ? 0 : 1;
      const o = e.opts[k];
      const m = e.meshes[k];
      const pos = new THREE.Vector3(m.group.position.x, 2.4, e.z);
      burst(pos, isGood(o) ? ['#7fd3ff', '#ffffff', '#2fa8ff'] : ['#ff8fa3', '#ffffff', '#ff3b5c'], 26, 7, 0.2);
      changePower(o, pos, 'gate');
      if (state !== 'run') return;
      P.hitT = 0.35;
      if (isGood(o)) { sfx.good(); UI.buzz(12); if (o.op === 'x') UI.praise(o.v === 3 ? 'MEGA!' : 'DOUBLE!', '#7dffb2'); }
      else { sfx.bad(); UI.buzz([20, 30]); shake = 0.4; UI.hitFlash(); }
    } else if (e.type === 'crystals') {
      e.items.forEach((it, k) => {
        if (it.got) return;
        if (Math.abs(it.z - P.z) < 0.9 && Math.abs(it.x - P.x) < half + 0.5) {
          it.got = true;
          runCoins += 1;
          changePower(e.value, null, 'crystal');
          sfx.coin(k);
          burst(new THREE.Vector3(it.x, 0.9, it.z), ['#36e0ff', '#ffffff'], 5, 3, 0.1, 2);
        }
      });
    } else if (e.type === 'saw' && !e.hit) {
      for (const s of e.saws) {
        if (Math.abs(e.z - P.z) < 0.6 && Math.abs(s.g.position.x - P.x) < half + 0.75) {
          e.hit = true;
          shake = 0.7;
          P.hitT = 0.5;
          sfx.bad();
          noise(0, 0.3, 0.25, 2600, 2);
          UI.hitFlash();
          UI.buzz([30, 40, 30]);
          burst(new THREE.Vector3(P.x, 1.2, P.z), ['#ff3b5c', '#ffffff'], 18, 6, 0.18);
          changePower(-e.cost, new THREE.Vector3(P.x, 2.5, P.z), 'saw');
          break;
        }
      }
    } else if (e.type === 'wall' && !e.smashed && prevZ > e.z - 0.2 && P.z <= e.z + 0.2) {
      if (Math.abs(e.x - P.x) < half + e.w / 2) {
        e.smashed = true;
        shake = 0.8;
        P.hitT = 0.5;
        sfx.thud();
        noise(0, 0.25, 0.3, 300);
        UI.buzz([25, 30]);
        e.bricks.forEach((b) => { b.userData.v = new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 6, -6 - Math.random() * 8); b.userData.r = (Math.random() - 0.5) * 12; });
        e.label.visible = false;
        changePower(-e.cost, new THREE.Vector3(e.x, 3, e.z), 'wall');
      }
    }
    if (state !== 'run') return;
  }

  if (P.z <= L.finishZ) startBoss();
}

function startBoss() {
  state = 'boss';
  stateT = 0;
  P.speed = 0;
  duel = { t: 0, tick: 0, bossShown: L.bossPower, phase: 'approach' };
  UI.praise('BOSS FIGHT!', '#ffd60a');
  sfx.whoosh();
}

function updateBoss(dt) {
  const fz = L.finishZ;
  const meetZ = fz - 13 + 1.2 * (P.shownSize + boss.size);
  if (duel.phase === 'approach') {
    P.z += (meetZ - P.z) * Math.min(1, dt * 3);
    P.x += (0 - P.x) * Math.min(1, dt * 3);
    playerCh.root.position.set(P.x, 0, P.z);
    animateRun(playerCh, 6, dt);
    if (Math.abs(P.z - meetZ) < 0.15) { duel.phase = 'fight'; duel.t = 0; }
    animateIdle(bossCh, time);
    return;
  }
  if (duel.phase === 'fight') {
    duel.t += dt;
    duel.tick -= dt;
    // alternating punches
    const punch = Math.sin(duel.t * 14);
    playerCh.arms[1].rotation.x = -1.6 + punch * 0.9;
    playerCh.arms[0].rotation.x = -1.6 - punch * 0.9;
    bossCh.arms[1].rotation.x = -1.6 - punch * 0.9;
    bossCh.arms[0].rotation.x = -1.6 + punch * 0.9;
    if (duel.tick <= 0) {
      duel.tick = 0.09;
      const dmg = Math.max(1, Math.round(Math.min(P.power, boss.power) * 0.09));
      P.power = Math.max(0, P.power - dmg);
      boss.power = Math.max(0, boss.power - dmg);
      playerLabel.set(P.power);
      bossLabel.set(boss.power, '#ffb3c6');
      shake = 0.25;
      tone(160 + Math.random() * 60, 0, 0.07, 'square', 0.08);
      noise(0, 0.05, 0.12, 700);
      const mid = new THREE.Vector3(0, 1.6 * P.shownSize, (P.z + bossCh.root.position.z) / 2);
      burst(mid, ['#ffffff', '#ffd60a'], 3, 5, 0.12, 2);
      if (P.power <= 0 || boss.power <= 0) {
        duel.phase = 'done';
        if (P.power > 0) {
          // knockout: the boss flies off the arena
          boss.vel = new THREE.Vector3(0, 14, -18);
          UI.praise('KNOCKOUT!', '#ffd60a');
          shake = 1;
          slowmo = 0.35;
          setTimeout(() => { slowmo = 1; }, 600);
          winRun();
        } else {
          failRun('boss');
        }
      }
    }
  }
}

function updateCamera(dt) {
  const s = P.shownSize;
  let target, look;
  if (state === 'title') {
    target = new THREE.Vector3(Math.sin(time * 0.3) * 3.5, 3.2, 7.5);
    look = new THREE.Vector3(0, 1.6, 0);
  } else if (state === 'boss' || state === 'win' || (state === 'fail' && P.z <= L.finishZ + 0.5)) {
    const midZ = (P.z + L.finishZ - 13) / 2;
    const big = Math.max(s, boss ? boss.size : 1);
    target = new THREE.Vector3(9 + big * 2.2, 4 + big * 1.6, midZ + 4);
    look = new THREE.Vector3(0, 1.4 * big, midZ);
  } else {
    target = new THREE.Vector3(P.x * 0.45, 5.2 + s * 1.7, P.z + 8.5 + s * 2.4);
    look = new THREE.Vector3(P.x * 0.3, 1.2 + s * 0.8, P.z - 6);
  }
  camPos.lerp(target, Math.min(1, dt * 4));
  camLook.lerp(look, Math.min(1, dt * 6));
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.5, (Math.random() - 0.5) * shake * 0.5, 0));
  camera.lookAt(camLook);
  // keep the shadow camera on the action
  sun.position.set(camLook.x + 8, 18, camLook.z + 6);
  sun.target.position.set(camLook.x, 0, camLook.z);
  scenery.position.z = Math.min(0, camLook.z * 0.85);
}

// ---------------------------------------------------------------------------
// Loop, pause, boot
// ---------------------------------------------------------------------------
let last = performance.now();
let first = true;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused && !menuOpen) update(dt);
  renderer.render(scene, camera);
  if (first) { first = false; YT.firstFrameReady(); }
  requestAnimationFrame(frame);
}

YT.onPause(() => { paused = true; dragging = null; suspendAudio(); });
YT.onResume(() => { paused = false; last = performance.now(); resumeAudio(); });

// Read-only hook for the automated smoke test.
window.__growRush = {
  info: () => ({ state, level: L && L.n, power: P.power, x: P.x, z: P.z, finishZ: L && L.finishZ, boss: L && L.bossPower, best: L && L.simBest }),
  nextGate: () => {
    const e = L && L.events.find((ev) => ev.type === 'gates' && !ev.passed);
    return e ? { z: e.z, labels: e.opts.map(opText), results: e.opts.map((o) => applyOp(P.power, o)) } : null;
  },
};

(async function boot() {
  YT.init('grow-rush');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  save.owned = Object.assign({ red: true }, save.owned);
  applySkin();
  showTitle();
  requestAnimationFrame(frame);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
