/*
 * Turbo Racer 3D — a one-thumb arcade racer. Hold and slide to steer and
 * accelerate, release to brake. Corner too fast and you drift wide; leave
 * the road and you spin out. Beat five rivals to the line.
 *
 * Every level is a generated point-to-point road (spline ribbon with
 * curbs, hills, ramps and boost pads). All models and textures are made in
 * code.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio, loopVoice } from 'sfx';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROAD_W = 5;          // half width (m)
const CURB = 0.9;
const DS = 2;              // track sample spacing (m)
const RIVALS = 5;
const RIVAL_COLORS = ['#3d8bff', '#2ecc71', '#ffc300', '#9b5de5', '#ff8f2b'];
const PAINTS = [
  { id: 'red', name: 'Rosso', color: '#e8203a', price: 0 },
  { id: 'white', name: 'Pearl', color: '#f2f4f8', price: 200 },
  { id: 'black', name: 'Stealth', color: '#20232c', price: 300 },
  { id: 'cyan', name: 'Neon', color: '#00d5ff', price: 450 },
  { id: 'lime', name: 'Venom', color: '#9cff2e', price: 600 },
  { id: 'pink', name: 'Candy', color: '#ff5fd2', price: 800 },
  { id: 'orange', name: 'Blaze', color: '#ff7a1a', price: 1000 },
  { id: 'purple', name: 'Nebula', color: '#8a4dff', price: 1300 },
  { id: 'gold', name: 'Champion', color: 'linear-gradient(135deg,#fff3a0,#ffb703,#a86b00)', mat: '#ffbf1f', price: 0, ad: true },
];
const UPGRADES = [
  { id: 'engine', name: 'Engine', icon: '⚙️', desc: 'Top speed' },
  { id: 'grip', name: 'Tyres', icon: '🛞', desc: 'Corner grip' },
  { id: 'boost', name: 'Turbo', icon: '🔥', desc: 'Boost power' },
];
const MAX_UP = 10;
const upCost = (l) => Math.round(80 * Math.pow(1.45, l));

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------
let save = { level: 1, coins: 0, paint: 'red', owned: { red: true }, up: { engine: 0, grip: 0, boost: 0 }, sound: true, tutorial: false, wins: 0 };
let saveTimer = 0;
function persist(now) {
  clearTimeout(saveTimer);
  if (now) YT.save(save);
  else saveTimer = setTimeout(() => YT.save(save), 300);
}

// ---------------------------------------------------------------------------
// Renderer / scene
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
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = skyTexture();
scene.fog = new THREE.Fog(0xcfe8ff, 90, 420);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5e8a3a, 1.15));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#2f7dff');
  grd.addColorStop(0.55, '#8fc4ff');
  grd.addColorStop(1, '#ffe2c4');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let baseFov = 62;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  baseFov = camera.aspect < 1 ? 74 : 60;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; }
  return t;
}
const roadTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#3b3f4a';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) {
    const v = 50 + Math.random() * 30;
    g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 8) + ',0.5)';
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.fillStyle = '#f4f4f4';
  g.fillRect(w * 0.03, 0, w * 0.025, h);
  g.fillRect(w * 0.945, 0, w * 0.025, h);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  [1 / 3, 2 / 3].forEach((u) => { g.fillRect(w * u - 3, 0, 6, h * 0.5); });
}, true);
const curbTex = canvasTex(32, 64, (g, w, h) => {
  g.fillStyle = '#e8203a';
  g.fillRect(0, 0, w, h / 2);
  g.fillStyle = '#ffffff';
  g.fillRect(0, h / 2, w, h / 2);
}, true);
const checkTex = canvasTex(256, 64, (g, w, h) => {
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 16, j * 16, 16, 16); }
});
const grassTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#6fbf4a';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(90,170,60,0.6)' : 'rgba(130,205,90,0.5)';
    g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }
});
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
grassTex.repeat.set(300, 300);

const M = {
  road: new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92 }),
  curb: new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6 }),
  skirt: new THREE.MeshStandardMaterial({ color: '#b58a5c', roughness: 1, side: THREE.DoubleSide }),
  grass: new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }),
  trunk: new THREE.MeshStandardMaterial({ color: '#7a4f2e', roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#2f9e44', roughness: 0.9, flatShading: true }),
  leaf2: new THREE.MeshStandardMaterial({ color: '#57c44f', roughness: 0.9, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: '#9aa3b5', roughness: 0.95, flatShading: true }),
  glass: new THREE.MeshStandardMaterial({ color: '#16233d', roughness: 0.15, metalness: 0.5 }),
  tyre: new THREE.MeshStandardMaterial({ color: '#16161a', roughness: 0.85 }),
  rim: new THREE.MeshStandardMaterial({ color: '#d7dbe3', roughness: 0.3, metalness: 0.8 }),
  head: new THREE.MeshStandardMaterial({ color: '#fffbe0', emissive: '#fff3b0', emissiveIntensity: 1.2 }),
  tail: new THREE.MeshStandardMaterial({ color: '#ff2040', emissive: '#ff1030', emissiveIntensity: 1.0 }),
  post: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
  check: new THREE.MeshStandardMaterial({ map: checkTex, side: THREE.DoubleSide }),
  boost: new THREE.MeshBasicMaterial({ color: '#00e5ff', transparent: true, opacity: 0.85 }),
  ramp: new THREE.MeshStandardMaterial({ color: '#ffb703', roughness: 0.5 }),
  rail: new THREE.MeshStandardMaterial({ color: '#c9ced8', metalness: 0.6, roughness: 0.35 }),
  mountain: new THREE.MeshStandardMaterial({ color: '#8fa7c9', roughness: 1, flatShading: true }),
};
const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), M.grass);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.25;
ground.receiveShadow = true;
scene.add(ground);

// distant mountains ring (static)
(function mountains() {
  const geo = new THREE.ConeGeometry(1, 1, 5);
  const inst = new THREE.InstancedMesh(geo, M.mountain, 40);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 700 + Math.random() * 120;
    const h = 90 + Math.random() * 120;
    p.set(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r);
    s.set(80 + Math.random() * 90, h, 80 + Math.random() * 90);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 3);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  mountainsMesh = inst;
  scene.add(inst);
})();
var mountainsMesh;

// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------
const carGeo = {
  body: new THREE.RoundedBoxGeometry(1.9, 0.55, 4.2, 3, 0.2),
  nose: new THREE.RoundedBoxGeometry(1.7, 0.3, 1.2, 2, 0.12),
  cabin: new THREE.RoundedBoxGeometry(1.5, 0.5, 1.9, 3, 0.22),
  wing: new THREE.RoundedBoxGeometry(1.9, 0.08, 0.45, 1, 0.03),
  strut: new THREE.BoxGeometry(0.08, 0.35, 0.12),
  wheel: new THREE.CylinderGeometry(0.42, 0.42, 0.34, 18),
  rim: new THREE.CylinderGeometry(0.24, 0.24, 0.36, 10),
  light: new THREE.BoxGeometry(0.42, 0.12, 0.06),
};
function makeCar(color) {
  const root = new THREE.Group();
  const tilt = new THREE.Group(); // body roll / pitch / spin
  root.add(tilt);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.35 });
  const add = (geo, m, x, y, z, parent) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    (parent || tilt).add(mesh);
    return mesh;
  };
  add(carGeo.body, paint, 0, 0.62, 0);
  add(carGeo.nose, paint, 0, 0.5, -2.2);
  add(carGeo.cabin, M.glass, 0, 1.08, 0.25);
  add(carGeo.wing, paint, 0, 1.25, 1.95);
  add(carGeo.strut, M.tyre, -0.6, 1.02, 1.95);
  add(carGeo.strut, M.tyre, 0.6, 1.02, 1.95);
  add(carGeo.light, M.head, -0.6, 0.66, -2.12);
  add(carGeo.light, M.head, 0.6, 0.66, -2.12);
  add(carGeo.light, M.tail, -0.6, 0.72, 2.11);
  add(carGeo.light, M.tail, 0.6, 0.72, 2.11);
  const wheels = [];
  [[-0.95, -1.35], [0.95, -1.35], [-0.95, 1.35], [0.95, 1.35]].forEach(([x, z]) => {
    const w = new THREE.Group();
    w.position.set(x, 0.42, z);
    const tyre = new THREE.Mesh(carGeo.wheel, M.tyre);
    tyre.rotation.z = Math.PI / 2;
    tyre.castShadow = true;
    const rim = new THREE.Mesh(carGeo.rim, M.rim);
    rim.rotation.z = Math.PI / 2;
    w.add(tyre, rim);
    tilt.add(w);
    wheels.push(w);
  });
  return { root, tilt, paint, wheels };
}

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------
const trackGroup = new THREE.Group();
scene.add(trackGroup);
let T = null; // track data

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function disposeGroup(g) {
  const keepGeo = new Set(Object.values(carGeo));
  const keepMat = new Set(Object.values(M));
  g.traverse((o) => {
    if (o.geometry && !keepGeo.has(o.geometry)) o.geometry.dispose();
    if (o.material && !keepMat.has(o.material)) o.material.dispose();
  });
  g.clear();
}

function buildTrack(n) {
  disposeGroup(trackGroup);
  const rng = mulberry32(n * 104729 + 3);
  const pts = [new THREE.Vector3(0, 0, 40), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -70)];
  let heading = 0;
  let y = 0;
  const pos = pts[2].clone();
  const segs = Math.min(22, 10 + n);
  const amp = Math.min(1.25, 0.7 + n * 0.05);
  for (let i = 0; i < segs; i++) {
    heading = THREE.MathUtils.clamp(heading + (rng() - 0.5) * 2 * amp, -1.5, 1.5);
    y = THREE.MathUtils.clamp(y + (rng() - 0.5) * 7, 0, 6);
    const len = 70 + rng() * 55;
    pos.x += Math.sin(heading) * len;
    pos.z -= Math.cos(heading) * len;
    pos.y = y;
    pts.push(pos.clone());
  }
  // final straight to the line
  pos.x += Math.sin(heading) * 90;
  pos.z -= Math.cos(heading) * 90;
  pos.y = 0;
  pts.push(pos.clone());
  pos.x += Math.sin(heading) * 60;
  pos.z -= Math.cos(heading) * 60;
  pts.push(pos.clone());

  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const total = curve.getLength();
  const count = Math.floor(total / DS);
  const P = curve.getSpacedPoints(count);
  const tan = [], right = [], head = [], kappa = [];
  for (let i = 0; i <= count; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(count, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a).normalize();
    tan.push(t);
    right.push(new THREE.Vector3(-t.z, 0, t.x).normalize());
    head.push(Math.atan2(t.x, -t.z));
  }
  for (let i = 0; i <= count; i++) {
    const a = head[Math.max(0, i - 2)], b = head[Math.min(count, i + 2)];
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    kappa.push(d / (DS * (Math.min(count, i + 2) - Math.max(0, i - 2))));
  }
  // smooth curvature for AI planning
  const kSmooth = kappa.map((_, i) => {
    let m = 0;
    for (let j = i; j < Math.min(count, i + 25); j++) m = Math.max(m, Math.abs(kappa[j]));
    return m;
  });
  // the start sits 40 m in (first control point is behind the grid)
  const startS = 40;
  const finishS = (count - 30) * DS;
  T = { P, tan, right, head, kappa, kSmooth, count, total: count * DS, startS, finishS, pads: [], ramps: [] };

  // features
  for (let s = startS + 180; s < finishS - 120; s += 160 + rng() * 140) {
    const lane = [-3, 0, 3][(rng() * 3) | 0];
    T.pads.push({ s, d: lane });
  }
  if (n >= 2) {
    for (let s = startS + 300; s < finishS - 150; s += 420 + rng() * 300) {
      // ramps only on fairly straight bits
      const i = Math.floor(s / DS);
      if (kSmooth[i] < 0.006) T.ramps.push({ s });
    }
  }
  buildTrackMeshes(rng);
}

function ribbon(offA, offB, yA, yB, vScale, mat, everyN = 1) {
  const n = T.count;
  const pos = [], uv = [], idx = [];
  let k = 0;
  for (let i = 0; i <= n; i += everyN) {
    const p = T.P[i], r = T.right[i];
    pos.push(p.x + r.x * offA, p.y + yA, p.z + r.z * offA, p.x + r.x * offB, p.y + yB, p.z + r.z * offB);
    const v = (i * DS) / vScale;
    uv.push(0, v, 1, v);
    if (k > 0) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    k++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  trackGroup.add(m);
  return m;
}

function buildTrackMeshes(rng) {
  // road: right offset positive. Winding order so normals face up.
  // left edge first so the faces point up
  ribbon(-ROAD_W, ROAD_W, 0.02, 0.02, 12, M.road);
  ribbon(-ROAD_W - CURB, -ROAD_W, 0.06, 0.06, 2, M.curb);
  ribbon(ROAD_W, ROAD_W + CURB, 0.06, 0.06, 2, M.curb);
  // embankment skirts down to the ground
  const skirt = (off) => {
    const n = T.count, pos = [], idx = [];
    for (let i = 0, k = 0; i <= n; i += 2, k++) {
      const p = T.P[i], r = T.right[i];
      const x = p.x + r.x * off, z = p.z + r.z * off, out = off > 0 ? 3 : -3;
      pos.push(x, p.y + 0.05, z, x + r.x * out, -0.4, z + r.z * out);
      if (k > 0) { const a = (k - 1) * 2; idx.push(...(off > 0 ? [a, a + 2, a + 1, a + 1, a + 2, a + 3] : [a, a + 1, a + 2, a + 1, a + 3, a + 2])); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.skirt);
    m.receiveShadow = true;
    trackGroup.add(m);
  };
  skirt(ROAD_W + CURB);
  skirt(-ROAD_W - CURB);

  // start & finish gantries
  const gantry = (s, label) => {
    const i = Math.min(T.count, Math.floor(s / DS));
    const p = T.P[i];
    const g = new THREE.Group();
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), M.post);
      post.position.set(side * (ROAD_W + 1.5), 3.5, 0);
      post.castShadow = true;
      g.add(post);
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry((ROAD_W + 1.5) * 2, 1.6), label === 'finish' ? M.check : bannerMat('TURBO RACER'));
    banner.position.y = 6.4;
    g.add(banner);
    g.position.copy(p);
    g.rotation.y = -T.head[i];
    trackGroup.add(g);
    if (label === 'finish') {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W * 2, 1.4), M.check);
      line.rotation.x = -Math.PI / 2;
      line.position.y = 0.05;
      g.add(line);
    }
  };
  gantry(T.startS, 'start');
  gantry(T.finishS, 'finish');

  // boost pads
  T.pads.forEach((pad) => {
    const i = Math.floor(pad.s / DS);
    const g = new THREE.Group();
    const geo = new THREE.ShapeGeometry(chevron());
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(geo, M.boost);
      m.rotation.set(-Math.PI / 2, 0, Math.PI); // chevrons point down the road
      m.position.set(0, 0.07, -k * 1.4);
      g.add(m);
    }
    placeOnTrack(g, pad.s, pad.d, 0);
    pad.mesh = g;
    trackGroup.add(g);
  });
  // ramps
  T.ramps.forEach((ramp) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(6, 0);
    shape.lineTo(6, 1.3);
    shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: ROAD_W * 2 - 1, bevelEnabled: false });
    geo.translate(-3, 0, -(ROAD_W - 0.5));
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, M.ramp);
    m.castShadow = true;
    m.receiveShadow = true;
    placeOnTrack(m, ramp.s, 0, 0);
    trackGroup.add(m);
  });
  // guard rails on the outside of sharp corners
  const railGeo = new THREE.BoxGeometry(0.2, 0.6, DS * 2.1);
  const rails = [];
  for (let i = 4; i < T.count - 4; i += 2) {
    const k = T.kappa[i];
    if (Math.abs(k) < 0.012) continue;
    rails.push({ i, side: k > 0 ? -1 : 1 });
  }
  if (rails.length) {
    const inst = new THREE.InstancedMesh(railGeo, M.rail, rails.length);
    rails.forEach((r, j) => {
      const p = T.P[r.i], rr = T.right[r.i];
      tmpObj.position.set(p.x + rr.x * r.side * (ROAD_W + CURB + 1.2), p.y + 0.45, p.z + rr.z * r.side * (ROAD_W + CURB + 1.2));
      tmpObj.rotation.set(0, -T.head[r.i], 0);
      tmpObj.scale.set(1, 1, 1);
      tmpObj.updateMatrix();
      inst.setMatrixAt(j, tmpObj.matrix);
    });
    inst.castShadow = true;
    trackGroup.add(inst);
  }
  // trees and rocks
  const coarse = T.P.filter((_, i) => i % 6 === 0);
  const nearRoad = (x, z, minD) => coarse.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < minD * minD);
  const trees = [], rocks = [];
  for (let i = 0; i < T.count; i += 3) {
    for (let t = 0; t < 2; t++) {
      const side = rng() < 0.5 ? -1 : 1;
      const off = 12 + rng() * 55;
      const p = T.P[i], r = T.right[i];
      const x = p.x + r.x * side * off + (rng() - 0.5) * 6, z = p.z + r.z * side * off + (rng() - 0.5) * 6;
      if (nearRoad(x, z, 10)) continue;
      (rng() < 0.82 ? trees : rocks).push({ x, z, s: 0.8 + rng() * 1.2, r: rng() * 6 });
    }
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 6), M.trunk, trees.length);
  const leafA = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 3.6, 7), M.leaf, trees.length);
  const leafB = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 2.6, 7), M.leaf2, trees.length);
  trees.forEach((t, j) => {
    const setI = (mesh, y, sy) => {
      tmpObj.position.set(t.x, y * t.s, t.z);
      tmpObj.rotation.set(0, t.r, 0);
      tmpObj.scale.set(t.s, t.s * sy, t.s);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(j, tmpObj.matrix);
    };
    setI(trunk, 1, 1);
    setI(leafA, 3.4, 1);
    setI(leafB, 5.2, 1);
  });
  [trunk, leafA, leafB].forEach((m) => { m.castShadow = true; trackGroup.add(m); });
  const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), M.rock, rocks.length);
  rocks.forEach((r, j) => {
    tmpObj.position.set(r.x, 0.3 * r.s, r.z);
    tmpObj.rotation.set(r.r, r.r * 2, 0);
    tmpObj.scale.set(r.s * 1.4, r.s, r.s * 1.2);
    tmpObj.updateMatrix();
    rock.setMatrixAt(j, tmpObj.matrix);
  });
  rock.castShadow = true;
  trackGroup.add(rock);
}
const tmpObj = new THREE.Object3D();

function chevron() {
  const s = new THREE.Shape();
  s.moveTo(-1.1, 0.4);
  s.lineTo(0, -0.6);
  s.lineTo(1.1, 0.4);
  s.lineTo(1.1, 0.9);
  s.lineTo(0, -0.1);
  s.lineTo(-1.1, 0.9);
  s.lineTo(-1.1, 0.4);
  return s;
}

function bannerMat(text) {
  const t = canvasTex(512, 96, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#e8203a');
    grd.addColorStop(1, '#ff7a1a');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.font = '900 60px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(text, w / 2, h / 2 + 4);
  });
  return new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide });
}

/** Sample the track at distance s: position, heading, right vector, slope. */
const _p = new THREE.Vector3();
function sample(s) {
  const f = THREE.MathUtils.clamp(s / DS, 0, T.count - 1.001);
  const i = Math.floor(f), t = f - i;
  const a = T.P[i], b = T.P[i + 1];
  _p.lerpVectors(a, b, t);
  let h0 = T.head[i], h1 = T.head[i + 1];
  let dh = h1 - h0;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const tanv = T.tan[i];
  return { pos: _p, head: h0 + dh * t, right: T.right[i], slope: Math.asin(THREE.MathUtils.clamp(tanv.y, -1, 1)), kappa: T.kappa[i], kAhead: T.kSmooth[i] };
}
function placeOnTrack(obj, s, d, lift) {
  const sm = sample(s);
  obj.position.set(sm.pos.x + sm.right.x * d, sm.pos.y + (lift || 0), sm.pos.z + sm.right.z * d);
  obj.rotation.set(0, -sm.head, 0);
}

// ---------------------------------------------------------------------------
// Racers
// ---------------------------------------------------------------------------
let player = null;
let rivals = [];
function makeRacer(color, isPlayer, grid) {
  const car = makeCar(color);
  scene.add(car.root);
  return {
    car, isPlayer,
    s: T.startS - 6 - Math.floor(grid / 2) * 9, d: grid % 2 ? 2.5 : -2.5,
    v: 0, vd: 0, h: 0, vh: 0, air: false, spin: 0, crashT: 0, boostT: 0, offT: 0, drift: 0,
    finished: false, finishTime: 0, skill: 1, lane: grid % 2 ? 2.5 : -2.5, laneT: 0, wheelRot: 0,
    targetD: grid % 2 ? 2.5 : -2.5,
  };
}
function clearRacers() {
  [player, ...rivals].forEach((r) => {
    if (!r) return;
    scene.remove(r.car.root);
    r.car.paint.dispose();
  });
  rivals = [];
  player = null;
}
function paintColor() {
  const p = PAINTS.find((k) => k.id === save.paint) || PAINTS[0];
  return p.mat || p.color;
}

function setupRace() {
  clearRacers();
  buildTrack(save.level);
  // grid: player starts 4th of 6
  const order = [0, 1, 2, 4, 5];
  player = makeRacer(paintColor(), true, 3);
  rivals = order.map((g, k) => {
    const r = makeRacer(RIVAL_COLORS[k], false, g);
    // the front of the grid is quicker; the field gets stronger with level
    r.skill = 0.86 + (k < 2 ? 0.06 : 0) + Math.min(0.12, save.level * 0.012) + Math.random() * 0.04;
    return r;
  });
  [player, ...rivals].forEach(placeRacer);
}

const UPS = () => ({
  vmax: 36 + save.up.engine * 1.8,
  grip: 15 + save.up.grip * 1.3,      // lateral m/s² before sliding
  boost: 14 + save.up.boost * 1.4,
});

function updateRacer(r, dt) {
  const up = UPS();
  const sm = sample(r.s);
  if (r.crashT > 0) {
    r.crashT -= dt;
    r.v *= Math.pow(0.2, dt);
    r.spin += dt * 9;
    if (r.crashT <= 0) {
      // back on track at the centre line, rolling slowly
      r.d = THREE.MathUtils.clamp(r.d, -2, 2);
      r.targetD = r.d;
      r.spin = 0;
      r.v = 8;
      r.offT = 0;
    }
    r.s += r.v * dt;
    return;
  }
  let vmax, accel;
  if (r.isPlayer) {
    vmax = up.vmax * (r.boostT > 0 ? 1.35 : 1);
    accel = input.down || r.boostT > 0 ? 14 : -16;
    if (state !== 'race') accel = state === 'finish' ? -6 : 0;
  } else {
    // AI: brake for the sharpest bend coming up
    const corner = Math.sqrt((15 + save.level * 0.6) / Math.max(0.0005, sm.kAhead));
    vmax = Math.min(up.vmax * r.skill, corner) * (r.boostT > 0 ? 1.3 : 1);
    // gentle rubber band keeps the pack together
    const gap = r.s - player.s;
    if (gap > 60) vmax *= 0.93;
    else if (gap < -60) vmax *= 1.06;
    accel = r.v < vmax ? 11 : -12;
    if (state === 'countdown') accel = 0;
    // lane changes
    r.laneT -= dt;
    if (r.laneT <= 0) { r.laneT = 2 + Math.random() * 3; r.targetD = [-3, 0, 3][(Math.random() * 3) | 0]; }
  }
  if (state === 'countdown') accel = 0;
  r.v = THREE.MathUtils.clamp(r.v + accel * dt, 0, Math.max(vmax, r.v - 20 * dt));
  if (r.v > vmax) r.v = Math.max(vmax, r.v - 9 * dt);
  r.boostT = Math.max(0, r.boostT - dt);

  // steering toward target lateral position
  const steer = (r.targetD - r.d) * 5;
  r.vd += (steer - r.vd) * Math.min(1, dt * 8);
  // corner forces: too fast and the car slides wide
  const lat = r.v * r.v * sm.kappa;
  const grip = r.isPlayer ? up.grip : 15 + save.level * 0.6;
  r.drift = 0;
  if (!r.air && Math.abs(lat) > grip) {
    const excess = (Math.abs(lat) - grip) * Math.sign(lat);
    r.vd -= excess * dt * 0.9;
    r.v -= Math.abs(excess) * dt * 0.08;
    r.drift = Math.min(1, Math.abs(excess) / grip);
  }
  r.d += r.vd * dt;

  // off road
  const off = Math.abs(r.d) - ROAD_W;
  if (off > 0 && !r.air) {
    r.offT += dt;
    r.v *= Math.pow(0.55, dt);
    if (off > 2.6) crash(r);
  } else r.offT = 0;
  if (Math.abs(r.d) > ROAD_W + 4) r.d = Math.sign(r.d) * (ROAD_W + 4);

  // ramps: climb the wedge, launch off the top
  for (const ramp of T.ramps) {
    if (r.air || Math.abs(r.d) > ROAD_W) continue;
    const into = r.s - (ramp.s - 3);
    if (into >= 0 && into < 6) r.h = (into / 6) * 1.3;
    if (r.s < ramp.s + 3 && r.s + r.v * dt >= ramp.s + 3) {
      r.air = true;
      r.vh = Math.min(13, r.v * 0.32);
      r.h = 1.3;
      if (r.isPlayer) { sfx.whoosh(); UI.praise('BIG AIR!', '#ffd60a'); }
    } else if (into >= 6 && into < 7) r.h = 0;
  }
  if (r.air) {
    r.vh -= 24 * dt;
    r.h += r.vh * dt;
    if (r.h <= 0) {
      r.h = 0;
      r.air = false;
      if (r.isPlayer) { sfx.thud(); shake = 0.5; UI.buzz(20); }
    }
  }
  // boost pads
  for (const pad of T.pads) {
    if (!r.air && Math.abs(r.s - pad.s) < 2.5 && Math.abs(r.d - pad.d) < 1.8 && r.boostT < 0.2) {
      r.boostT = 1.6;
      r.v += r.isPlayer ? up.boost * 0.5 : 6;
      if (r.isPlayer) { sfx.good(); noise(0, 0.5, 0.18, 2200, 0.6); UI.buzz(15); }
    }
  }
  r.s += r.v * dt;
  if (!r.finished && r.s >= T.finishS) {
    r.finished = true;
    r.finishTime = raceT;
    finishers.push(r);
    if (r.isPlayer) onPlayerFinish();
  }
}

function crash(r) {
  if (r.crashT > 0) return;
  r.crashT = 1.2;
  r.vd = 0;
  if (r.isPlayer) {
    sfx.bad();
    noise(0, 0.5, 0.35, 400, 0.6);
    shake = 1;
    UI.hitFlash();
    UI.buzz([40, 50, 40]);
    UI.praise('SPIN OUT!', '#ff8fa3');
  }
}

function collide(dt) {
  const all = [player, ...rivals];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.air || b.air || a.crashT > 0 || b.crashT > 0) continue;
      const ds = b.s - a.s, dd = b.d - a.d;
      if (Math.abs(ds) < 4.3 && Math.abs(dd) < 2.0) {
        // push apart sideways, rear car loses speed
        const push = (2.0 - Math.abs(dd)) * 0.5 * (dd >= 0 ? 1 : -1);
        a.d -= push; b.d += push;
        a.vd -= push * 4; b.vd += push * 4;
        const rear = ds > 0 ? a : b, front = ds > 0 ? b : a;
        if (rear.v > front.v) { const dv = (rear.v - front.v) * 0.6; rear.v -= dv; front.v += dv * 0.4; }
        if (a.isPlayer || b.isPlayer) {
          if (bumpCd <= 0) { sfx.thud(); tone(90, 0, 0.12, 'square', 0.12); shake = Math.max(shake, 0.35); UI.buzz(12); bumpCd = 0.3; }
        }
      }
    }
  }
}
let bumpCd = 0;

function placeRacer(r) {
  const sm = sample(r.s);
  const car = r.car;
  car.root.position.set(sm.pos.x + sm.right.x * r.d, sm.pos.y + r.h, sm.pos.z + sm.right.z * r.d);
  // yaw follows the road plus a slide angle while drifting / steering
  const slip = THREE.MathUtils.clamp(r.vd * 0.04, -0.35, 0.35) + (r.drift ? r.drift * 0.35 * -Math.sign(sm.kappa) : 0);
  car.root.rotation.order = 'YXZ';
  car.root.rotation.set(r.air ? -0.08 : sm.slope, -sm.head - slip + r.spin, 0);
  car.tilt.rotation.z = THREE.MathUtils.clamp(-r.vd * 0.02 + sm.kappa * r.v * 0.05, -0.12, 0.12);
  r.wheelRot += r.v * 0.016 / 0.42;
  car.wheels.forEach((w, k) => {
    w.children[0].rotation.x = r.wheelRot;
    w.children[1].rotation.x = r.wheelRot;
    if (k < 2) w.rotation.y = THREE.MathUtils.clamp(-r.vd * 0.08, -0.4, 0.4);
  });
}

// ---------------------------------------------------------------------------
// Particles: tyre smoke + boost flames (instanced)
// ---------------------------------------------------------------------------
const MAXP = 220;
const pMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }), MAXP);
pMesh.frustumCulled = false;
pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(pMesh);
const parts = [];
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
function puff(pos, color, size, vy, life) {
  if (parts.length >= MAXP) parts.shift();
  parts.push({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 2, vy: vy || 1, vz: (Math.random() - 0.5) * 2, s: size, life, max: life, color });
}
function updateParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
  for (let i = 0; i < MAXP; i++) {
    const p = parts[i];
    if (!p) { tmpM.makeScale(0, 0, 0); pMesh.setMatrixAt(i, tmpM); continue; }
    const k = p.life / p.max;
    const s = p.s * (1.6 - k);
    tmpM.compose(tmpV.set(p.x, p.y, p.z), tmpQ.identity(), tmpS.set(s, s, s));
    pMesh.setMatrixAt(i, tmpM);
    pMesh.setColorAt(i, tmpC.set(p.color).multiplyScalar(0.6 + k * 0.4));
  }
  pMesh.instanceMatrix.needsUpdate = true;
  if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// State, UI
// ---------------------------------------------------------------------------
let state = 'title'; // title | countdown | race | finish
let paused = false, menuOpen = false;
let time = 0, raceT = 0, countT = 0, shake = 0;
let finishers = [];
let hud = null, posEl = null, speedEl = null, speedLines = null;
let stopHand = null;
const input = { down: false, x0: 0, d0: 0 };
const engine = loopVoice('sawtooth', 700);
const engine2 = loopVoice('square', 400);

const css = document.createElement('style');
css.textContent = `
  .tr-pos { position:absolute; left:12px; top:66px; font:900 44px/1 var(--font); color:#fff; -webkit-text-stroke:.12em #1b1440; paint-order:stroke fill; pointer-events:none !important; }
  .tr-pos small { font-size:22px; }
  .tr-speed { position:absolute; right:14px; bottom:max(18px, env(safe-area-inset-bottom)); text-align:right; font:900 40px/1 var(--font); color:#fff; -webkit-text-stroke:.12em #1b1440; paint-order:stroke fill; pointer-events:none !important; }
  .tr-speed small { display:block; font-size:13px; -webkit-text-stroke:0; color:rgba(255,255,255,.85); letter-spacing:.1em; }
  .tr-lines { position:absolute; inset:0; pointer-events:none !important; opacity:0; transition:opacity .2s;
    background: repeating-conic-gradient(from 0deg at 50% 45%, rgba(255,255,255,.0) 0deg, rgba(255,255,255,.0) 5deg, rgba(255,255,255,.35) 5.4deg, rgba(255,255,255,0) 6deg);
    -webkit-mask: radial-gradient(circle at 50% 45%, transparent 28%, #000 70%); mask: radial-gradient(circle at 50% 45%, transparent 28%, #000 70%); }
  .tr-count { position:absolute; left:50%; top:38%; transform:translate(-50%,-50%); font:900 120px/1 var(--font); color:#fff; -webkit-text-stroke:.1em #1b1440; paint-order:stroke fill; pointer-events:none; animation: tr-count .9s ease-out forwards; }
  @keyframes tr-count { 0% { transform:translate(-50%,-50%) scale(2.2); opacity:0 } 20% { transform:translate(-50%,-50%) scale(1); opacity:1 } 80% { opacity:1 } 100% { transform:translate(-50%,-50%) scale(.8); opacity:0 } }
  .tr-results { text-align:left; margin:10px auto 0; width:100%; max-width:300px; }
  .tr-results div { display:flex; align-items:center; gap:10px; padding:7px 12px; border-radius:12px; font:800 16px var(--font); margin-bottom:6px; background:rgba(255,255,255,.08); }
  .tr-results div.me { background:rgba(255,224,102,.22); box-shadow: inset 0 0 0 2px #ffe066; }
  .tr-results i { width:18px; height:18px; border-radius:6px; display:inline-block; }
  .tr-results b { width:28px; }
  .tr-garage { display:grid; gap:10px; margin-top:8px; }
  .tr-garage button { display:flex; align-items:center; justify-content:space-between; gap:10px; border:0; border-radius:16px; padding:12px 14px; cursor:pointer;
    background:rgba(255,255,255,.1); color:#fff; font:800 15px var(--font); box-shadow: inset 0 0 0 2px rgba(255,255,255,.12); }
  .tr-garage button:disabled { opacity:.5; cursor:default; }
  .tr-garage .lv { display:flex; gap:3px; } .tr-garage .lv span { width:8px; height:14px; border-radius:3px; background:rgba(255,255,255,.18); } .tr-garage .lv span.on { background:#ffe066; }
  .tr-garage .price { color:#ffe066; white-space:nowrap; }
`;
document.head.appendChild(css);

function ensureHud() {
  if (hud) return;
  hud = UI.hud({ coins: save.coins, level: 'Race 1', right: [UI.iconButton('❚❚', 'Pause', openPause)] });
  posEl = document.createElement('div');
  posEl.className = 'tr-pos';
  speedEl = document.createElement('div');
  speedEl.className = 'tr-speed';
  speedLines = document.createElement('div');
  speedLines.className = 'tr-lines';
  const ui = document.getElementById('ui');
  ui.appendChild(speedLines);
  ui.appendChild(posEl);
  ui.appendChild(speedEl);
}
function showHud(v) {
  if (!hud) return;
  hud.show(v);
  posEl.style.display = speedEl.style.display = v ? '' : 'none';
}

function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }
function playerPlace() {
  if (player.finished) return finishers.indexOf(player) + 1;
  const ahead = rivals.filter((r) => r.finished || r.s > player.s).length;
  return ahead + 1;
}

function showTitle() {
  state = 'title';
  showHud(false);
  engine.stop(); engine2.stop();
  setupRace();
  UI.titleScreen({
    line1: 'TURBO', line2: 'RACER 3D',
    tagline: 'Hold to drive, slide to steer, let go to brake.',
    best: 'Race ' + save.level + (save.wins ? ' · ' + save.wins + ' wins' : ''),
    playLabel: 'RACE',
    onPlay: startCountdown,
    extra: [
      UI.button('🔧 Garage', openGarage, { style: 'blue', small: true }),
      UI.button('🎨 Paint', openPaint, { style: 'blue', small: true }),
      UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true }),
    ],
  });
}

function startCountdown() {
  initAudio(() => save.sound);
  ensureHud();
  setupRace();
  showHud(true);
  hud.setCoins(save.coins);
  hud.setLevel('Race ' + save.level);
  hud.setProgress(0);
  finishers = [];
  raceT = 0;
  countT = 3.6;
  state = 'countdown';
  lastCount = 4;
}
let lastCount = 4;

function showCount(text) {
  const el = document.createElement('div');
  el.className = 'tr-count';
  el.textContent = text;
  UI.fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function onPlayerFinish() {
  state = 'finish';
  const place = playerPlace();
  if (place === 1) { sfx.fanfare(); UI.praise('1ST PLACE!', '#ffd60a'); } else if (place <= 3) { sfx.win(); UI.praise(ordinal(place).toUpperCase() + '!', '#7dffb2'); } else { sfx.lose(); }
  UI.buzz(place === 1 ? [30, 40, 30, 40, 80] : 30);
  setTimeout(showResults, 2600);
}

function showResults() {
  // rivals still racing finish in their current order
  const rest = rivals.filter((r) => !r.finished).sort((a, b) => b.s - a.s);
  const order = finishers.concat(rest);
  const place = order.indexOf(player) + 1;
  const reward = [0, 120, 70, 45, 25, 15, 10][place] + save.level * (place <= 3 ? 8 : 2);
  const stars = place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0;
  const advance = place <= 3;
  const body = document.createElement('div');
  body.innerHTML = UI.starsHtml(stars) +
    '<div class="tr-results">' + order.map((r, i) => '<div class="' + (r.isPlayer ? 'me' : '') + '"><b>' + ordinal(i + 1) + '</b><i style="background:' + (r.isPlayer ? paintColor() : '#' + r.car.paint.color.getHexString()) + '"></i>' + (r.isPlayer ? 'You' : 'Rival ' + (rivals.indexOf(r) + 1)) + '</div>').join('') + '</div>' +
    '<div class="reward"><span class="fs-coin" style="position:static;margin:0"></span><b>0</b></div>';
  UI.countUp(body.querySelector('.reward b'), 0, reward, 800);
  const collect = (mult, p) => {
    p.close();
    const gained = reward * mult;
    UI.coinBurst(window.innerWidth / 2, window.innerHeight / 2, 10, hud.coinEl, (i) => { sfx.coin(i); hud.setCoins(Math.round(save.coins - gained + gained * (i + 1) / 10), true); });
    save.coins += gained;
    if (advance) { save.level += 1; if (place === 1) save.wins += 1; }
    persist(true);
    YT.sendScore(save.wins);
    setTimeout(() => {
      hud.setCoins(save.coins);
      const next = () => showTitle();
      if (advance && save.level % 2 === 1) YT.interstitial().then(next); else next();
    }, 1100);
  };
  const p = UI.panel({
    title: place === 1 ? 'Victory!' : advance ? ordinal(place) + ' place' : ordinal(place) + ' place',
    gold: place === 1,
    sub: advance ? 'Next race unlocked' : 'Finish in the top 3 to advance',
    body,
    buttons: [
      UI.button('Claim ×3', async () => { if (await YT.rewarded('triple_coins')) collect(3, p); }, { style: 'gold', ad: true }),
      UI.button(advance ? 'Continue' : 'Collect', () => collect(1, p), { style: 'green' }),
    ],
  });
}

function openPause() {
  if (state !== 'race' && state !== 'countdown') return;
  menuOpen = true;
  input.down = false;
  engine.stop(); engine2.stop();
  const p = UI.panel({
    title: 'Paused',
    buttons: [
      UI.button('Resume', () => { p.close(); menuOpen = false; }, { style: 'green' }),
      UI.button('Restart race', () => { p.close(); menuOpen = false; startCountdown(); }),
      UI.button(save.sound ? 'Sound: on' : 'Sound: off', (b) => { save.sound = !save.sound; b.lastChild.textContent = save.sound ? 'Sound: on' : 'Sound: off'; persist(); }, { style: 'ghost' }),
      UI.button('Quit', () => { p.close(); menuOpen = false; showTitle(); }, { style: 'ghost', small: true }),
    ],
  });
}

function openGarage() {
  let p = null;
  const render = () => {
    if (p) p.close();
    const box = document.createElement('div');
    box.className = 'tr-garage';
    UPGRADES.forEach((u) => {
      const lvl = save.up[u.id];
      const cost = upCost(lvl);
      const maxed = lvl >= MAX_UP;
      const b = document.createElement('button');
      b.type = 'button';
      b.disabled = maxed || save.coins < cost;
      b.innerHTML = '<span>' + u.icon + ' ' + u.name + '<br><small style="opacity:.7;font-weight:700">' + u.desc + '</small></span>' +
        '<span class="lv">' + Array.from({ length: MAX_UP }, (_, i) => '<span class="' + (i < lvl ? 'on' : '') + '"></span>').join('') + '</span>' +
        '<span class="price">' + (maxed ? 'MAX' : '🪙 ' + cost) + '</span>';
      b.addEventListener('click', () => {
        if (b.disabled) return;
        save.coins -= cost;
        save.up[u.id] += 1;
        persist(true);
        sfx.good();
        render();
      });
      box.appendChild(b);
    });
    p = UI.panel({ title: 'Garage', sub: '🪙 ' + save.coins + ' coins', body: box, buttons: [UI.button('Done', () => p.close(), { style: 'ghost', small: true })] });
  };
  render();
}

function openPaint() {
  let p = null;
  const render = () => {
    if (p) p.close();
    p = UI.shopPanel({
      title: 'Paint shop', items: PAINTS, owned: save.owned, current: save.paint, coins: save.coins,
      onSelect: (it) => { save.paint = it.id; player.car.paint.color.set(paintColor()); persist(); render(); },
      onBuy: (it) => { if (save.coins < it.price) return; save.coins -= it.price; save.owned[it.id] = true; save.paint = it.id; player.car.paint.color.set(paintColor()); persist(true); sfx.good(); render(); },
      onAdUnlock: async (it) => { if (await YT.rewarded('paint_' + it.id)) { save.owned[it.id] = true; save.paint = it.id; player.car.paint.color.set(paintColor()); persist(true); sfx.fanfare(); } render(); },
      onClose: () => p.close(),
    });
  };
  render();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (paused || menuOpen) return;
  input.down = true;
  input.id = e.pointerId;
  input.x0 = e.clientX;
  input.d0 = player ? player.targetD : 0;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  if (stopHand && state === 'race') { stopHand(); stopHand = null; save.tutorial = true; persist(); }
});
canvas.addEventListener('pointermove', (e) => {
  if (!input.down || e.pointerId !== input.id || !player) return;
  const sens = (ROAD_W * 2.6) / Math.min(window.innerWidth, 700);
  player.targetD = THREE.MathUtils.clamp(input.d0 + (e.clientX - input.x0) * sens, -ROAD_W - 1, ROAD_W + 1);
});
const release = (e) => { if (e.pointerId === input.id) input.down = false; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Space' || e.code === 'ArrowUp') input.down = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Space' || e.code === 'ArrowUp') input.down = false; });

// ---------------------------------------------------------------------------
// Update / render
// ---------------------------------------------------------------------------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;

function update(dt) {
  time += dt;
  shake = Math.max(0, shake - dt * 2.2);
  bumpCd -= dt;
  if (state === 'countdown') {
    countT -= dt;
    const c = Math.ceil(countT - 0.6);
    if (c !== lastCount && c >= 0) {
      lastCount = c;
      if (c > 0) { showCount(String(c)); tone(440, 0, 0.18, 'square', 0.1); }
      else { showCount('GO!'); tone(880, 0, 0.35, 'square', 0.12); state = 'race'; if (!save.tutorial) stopHand = UI.tutorialHand(() => [[window.innerWidth * 0.35, window.innerHeight * 0.75], [window.innerWidth * 0.65, window.innerHeight * 0.75]], 'Hold & slide to steer'); }
    }
  }
  if (state === 'race' || state === 'finish') raceT += dt;
  if (player && state !== 'title') {
    if (keys.ArrowLeft || keys.KeyA) player.targetD = Math.max(-ROAD_W - 1, player.targetD - dt * 9);
    if (keys.ArrowRight || keys.KeyD) player.targetD = Math.min(ROAD_W + 1, player.targetD + dt * 9);
    if (state === 'finish') player.targetD = 0;
    [player, ...rivals].forEach((r) => updateRacer(r, dt));
    collide(dt);
    [player, ...rivals].forEach(placeRacer);
    // effects
    [player, ...rivals].forEach((r) => {
      const p = r.car.root.position;
      if (r.drift > 0.05 || r.offT > 0) {
        for (let k = 0; k < 2; k++) puff(tmpV.set(p.x + (Math.random() - 0.5) * 2, p.y + 0.3, p.z + (Math.random() - 0.5) * 2), r.offT > 0 ? '#c8a878' : '#f2f2f2', 0.5 + Math.random() * 0.4, 1.2, 0.8);
      }
      if (r.boostT > 0) puff(tmpV.set(p.x, p.y + 0.7, p.z).addScaledVector(new THREE.Vector3(Math.sin(r.car.root.rotation.y), 0, Math.cos(r.car.root.rotation.y)), 2.4), Math.random() < 0.5 ? '#ffb703' : '#ff4d2e', 0.35, 0.3, 0.35);
    });
    // HUD
    const place = playerPlace();
    posEl.innerHTML = place + '<small>/' + (RIVALS + 1) + '</small>';
    const kmh = Math.round(player.v * 3.6);
    speedEl.innerHTML = kmh + '<small>KM/H</small>';
    hud.setProgress((player.s - T.startS) / (T.finishS - T.startS));
    speedLines.style.opacity = player.boostT > 0 ? 1 : Math.max(0, (player.v / UPS().vmax - 0.85) * 4);
    // engine
    const rpm = 60 + player.v * 4.5 + (input.down ? 20 : 0);
    engine.set(rpm, state === 'race' || state === 'countdown' ? 0.05 : 0.02);
    engine2.set(rpm * 0.5, state === 'race' || state === 'countdown' ? 0.03 : 0.01);
    if (player.drift > 0.2 && Math.random() < dt * 8) noise(0, 0.15, 0.06 * player.drift, 2800, 1.5);
  } else if (state === 'title' && player) {
    [player, ...rivals].forEach(placeRacer);
  }
  updateParticles(dt);
  updateCamera(dt);
}

function updateCamera(dt) {
  if (!player) return;
  const p = player.car.root.position;
  const sm = sample(player.s);
  const fwd = new THREE.Vector3(Math.sin(sm.head), 0, -Math.cos(sm.head));
  let target, look;
  if (state === 'title') {
    const a = time * 0.25;
    target = new THREE.Vector3(p.x + Math.sin(a) * 9, p.y + 3.2, p.z + Math.cos(a) * 9);
    look = new THREE.Vector3(p.x, p.y + 0.8, p.z);
  } else {
    const speedK = player.v / 40;
    target = p.clone().addScaledVector(fwd, -(7.5 + speedK * 1.5)).add(new THREE.Vector3(0, 3 + speedK * 0.4, 0));
    look = p.clone().addScaledVector(fwd, 7).add(new THREE.Vector3(0, 1, 0));
  }
  if (!camInit) { camPos.copy(target); camLook.copy(look); camInit = true; }
  camPos.lerp(target, Math.min(1, dt * (state === 'title' ? 2 : 6)));
  camLook.lerp(look, Math.min(1, dt * 8));
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.4, (Math.random() - 0.5) * shake * 0.4, 0));
  camera.lookAt(camLook);
  const fov = baseFov + (state === 'race' ? Math.min(14, (player.v / 40) * 8 + (player.boostT > 0 ? 6 : 0)) : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  sun.position.set(p.x + 20, p.y + 40, p.z + 15);
  sun.target.position.copy(p);
  mountainsMesh.position.set(p.x, 0, p.z);
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

YT.onPause(() => { paused = true; input.down = false; engine.stop(); engine2.stop(); suspendAudio(); });
YT.onResume(() => { paused = false; last = performance.now(); resumeAudio(); });

window.__turboRacer = {
  info: () => ({ state, level: save.level, place: player ? playerPlace() : 0, s: player ? player.s : 0, d: player ? player.d : 0, v: player ? player.v : 0, finishS: T ? T.finishS : 0, kappa: player ? sample(player.s).kappa : 0, kAhead: player ? sample(player.s).kAhead : 0 }),
};

(async function boot() {
  YT.init('turbo-racer');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  save.owned = Object.assign({ red: true }, save.owned);
  save.up = Object.assign({ engine: 0, grip: 0, boost: 0 }, save.up);
  showTitle();
  requestAnimationFrame(frame);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
