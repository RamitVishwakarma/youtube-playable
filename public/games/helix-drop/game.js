/*
 * Helix Drop 3D — spin the tower, drop the ball through the gaps, never
 * land on red. Fall through three floors in a row and the ball turns into a
 * fireball that smashes whatever it hits next.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';
import { studio, canvasTexture, skyGradient, blob } from 'look';

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
  { bg: ['#4b3bff', '#a35cff', '#ff9bd6'], pole: '#fff4fb', plat: '#6a3df0', accent: '#ffd60a' },
  { bg: ['#0077c2', '#2bb8e8', '#b8f1ff'], pole: '#ffffff', plat: '#0b5ad9', accent: '#ff9f1c' },
  { bg: ['#ff5e62', '#ff9a76', '#ffe2b8'], pole: '#fff7e6', plat: '#9b2fae', accent: '#2ee59d' },
  { bg: ['#0ca678', '#5fe3b5', '#dcfce7'], pole: '#ffffff', plat: '#1e7f4f', accent: '#ff4d6d' },
  { bg: ['#0d0a2b', '#2c1466', '#6a2bb8'], pole: '#e6c8ff', plat: '#3a1a8c', accent: '#ffd60a', night: true },
  { bg: ['#ff8a00', '#ffc23d', '#fff2bf'], pole: '#ffffff', plat: '#0f7c8c', accent: '#3d8bff' },
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
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
studio(renderer, scene, { intensity: 0.5 });
const hemi = new THREE.HemisphereLight(0xffffff, 0x8070ff, 0.35);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff4e8, 2.0);
key.position.set(4, 10, 8);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.03;
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 40 });
scene.add(key, key.target);
// cool rim from behind so the platform bevels catch an edge highlight
const rim = new THREE.DirectionalLight(0xd8e4ff, 0.8);
rim.position.set(-6, 4, -8);
scene.add(rim, rim.target);
scene.fog = new THREE.Fog('#ff8fd2', 24, 52);

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
const BEVEL = 0.09;
/** Darkens a geometry towards its underside so slabs read as glossy candy. */
function shadeVertical(g, lo = 0.52, hi = 1) {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - min.y) / (max.y - min.y || 1);
    const v = lo + (hi - lo) * Math.pow(t, 0.8);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/** A ring wedge between radii r0..r1 and shape angles a0..a1, top face at y = 0. */
function wedge(r0, r1, a0, a1, bevel, segs) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r1 - bevel, a0, a1, false);
  s.absarc(0, 0, r0 + bevel, a1, a0, true);
  const depth = THICK - bevel * 2;
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 4, curveSegments: segs });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(depth + bevel), 0);
  return shadeVertical(g);
}
// one bevelled slab per run of equal slices, cached by run length
const runGeos = [];
const runGeo = (len) => runGeos[len] || (runGeos[len] = wedge(R_IN, R_OUT, 0.02, len * SLICE_A - 0.02, BEVEL, Math.min(60, 5 * len)));
// shatter shards: each slice breaks into 2 x 2 chunks
const shardGeos = [[R_IN, (R_IN + R_OUT) / 2 - 0.03], [(R_IN + R_OUT) / 2 + 0.03, R_OUT]].map(([r0, r1]) => {
  const g = wedge(r0, r1, 0.05, SLICE_A / 2 - 0.05, 0.06, 4);
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  return { geo: g, c };
});

const splatTex = canvasTexture(128, 128, (g, w) => {
  // an irregular paint blob with a few flung droplets
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = w * (0.26 + 0.05 * Math.sin(a * 5 + 1) + 0.03 * Math.sin(a * 9 + 2) + (i % 7 === 0 ? 0.06 : 0));
    const x = w / 2 + Math.cos(a) * r, y = w / 2 + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.fill();
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39, r = w * (0.36 + (i % 3) * 0.04);
    g.beginPath(); g.arc(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, w * (0.025 + (i % 2) * 0.02), 0, Math.PI * 2); g.fill();
  }
}, { srgb: false });
const splatGeo = new THREE.PlaneGeometry(1, 1);
splatGeo.rotateX(-Math.PI / 2);
const splatMats = {};
function splatMat(color) {
  if (!splatMats[color]) splatMats[color] = new THREE.MeshBasicMaterial({ map: splatTex, color, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return splatMats[color];
}

// soft diagonal candy stripes for the pole, tinted by the material colour
const stripeTex = canvasTexture(128, 128, (g, w) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w);
  g.fillStyle = '#dcdcea';
  for (let i = -2; i < 4; i++) {
    g.beginPath();
    g.moveTo(i * 64, w); g.lineTo(i * 64 + 32, w); g.lineTo(i * 64 + 32 + w, 0); g.lineTo(i * 64 + w, 0);
    g.closePath(); g.fill();
  }
}, { repeat: [2, 1] });

const mats = {
  pole: new THREE.MeshStandardMaterial({ color: '#ffffff', map: stripeTex, roughness: 0.28, metalness: 0 }),
  collar: new THREE.MeshPhysicalMaterial({ color: '#ffd60a', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }),
  plat: new THREE.MeshPhysicalMaterial({ color: '#3b2a9a', vertexColors: true, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 }),
  red: new THREE.MeshPhysicalMaterial({ color: '#ff1f4b', vertexColors: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, emissive: '#ff0030', emissiveIntensity: 0.35 }),
  finish: new THREE.MeshStandardMaterial({ color: '#ffc83d', vertexColors: true, roughness: 0.22, metalness: 0.85, emissive: '#5a3a00', emissiveIntensity: 0.5 }),
  ball: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06 }),
  fire: new THREE.MeshStandardMaterial({ color: '#ffb000', emissive: '#ff5a00', emissiveIntensity: 1.7, roughness: 0.35 }),
  shard: new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
};

// local angle of each slice: instance k covers [k*SLICE_A, (k+1)*SLICE_A]
// measured with atan2(x, z); the extruded shape starts at +90°, hence -PI/2.
const sliceRot = (k) => k * SLICE_A - Math.PI / 2;

// the rounded hub where each platform meets the pole
const collarGeo = new THREE.LatheGeometry([
  [R_IN - 0.08, -THICK - 0.2], [R_IN + 0.06, -THICK - 0.18], [R_IN + 0.15, -THICK - 0.1], [R_IN + 0.17, -THICK],
  [R_IN + 0.17, 0.02], [R_IN + 0.14, 0.1], [R_IN + 0.05, 0.15], [R_IN - 0.08, 0.16],
].map(([x, y]) => new THREE.Vector2(x, y)), 40);

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
const tower = new THREE.Group();
scene.add(tower);
let pole = null, collars = null;
let platforms = [];
let theme = THEMES[0];
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 28), mats.ball);
scene.add(ball);
const ballShadow = blob(BALL_R * 1.15, 0.42);
scene.add(ballShadow);

// tapered ribbon trail that streams above the ball while it falls
const trailTex = canvasTexture(64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(0, h); g.quadraticCurveTo(w * 0.1, h * 0.4, w * 0.5, 0); g.quadraticCurveTo(w * 0.9, h * 0.4, w, h); g.closePath(); g.fill();
}, { srgb: false });
const trailGeo = new THREE.PlaneGeometry(1, 1);
trailGeo.translate(0, 0.5, 0);
const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ map: trailTex, transparent: true, depthWrite: false, toneMapped: false }));
trail.renderOrder = 1;
scene.add(trail);
// warm glow sprite around the fireball
const glowTex = canvasTexture(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,220,120,1)'); gr.addColorStop(0.35, 'rgba(255,120,0,0.55)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
}, { srgb: false });
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
glow.visible = false;
scene.add(glow);

// floating bokeh dots behind the tower, recycled as the camera descends
const BOKEH = 46;
const bokehTex = canvasTexture(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
}, { srgb: false });
const bokehPos = new Float32Array(BOKEH * 3);
for (let i = 0; i < BOKEH; i++) {
  const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 14;
  bokehPos.set([Math.cos(a) * r, 10 - Math.random() * 50, -Math.abs(Math.sin(a)) * r - 4], i * 3);
}
const bokehGeo = new THREE.BufferGeometry();
bokehGeo.setAttribute('position', new THREE.BufferAttribute(bokehPos, 3));
const bokeh = new THREE.Points(bokehGeo, new THREE.PointsMaterial({ map: bokehTex, size: 1.6, transparent: true, opacity: 0.45, depthWrite: false, fog: false, color: '#ffffff' }));
bokeh.frustumCulled = false;
scene.add(bokeh);

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
  if (collars) collars.dispose();
  tower.clear();
  platforms = [];
}

function buildLevel(n) {
  clearTower();
  tower.rotation.y = 0; // the first platform is aligned for an unrotated tower
  theme = THEMES[(n - 1) % THEMES.length];
  if (scene.background) scene.background.dispose();
  scene.background = skyGradient([[0, theme.bg[0]], [0.55, theme.bg[1]], [1, theme.bg[2]]]);
  scene.fog.color.set(theme.bg[2]);
  hemi.groundColor.set(theme.bg[0]);
  bokeh.material.opacity = theme.night ? 0.9 : 0.4;
  bokeh.material.size = theme.night ? 0.7 : 1.6;
  mats.pole.color.set(theme.pole);
  mats.plat.color.set(theme.plat);
  mats.collar.color.set(theme.accent);
  const rng = mulberry32(n * 2654435761);
  const count = Math.min(42, 14 + n * 2);
  const poleH = count * SPACING + 14;
  pole = new THREE.Mesh(new THREE.CylinderGeometry(R_IN - 0.05, R_IN - 0.05, poleH, 40, 1, true), mats.pole);
  pole.position.y = -(count * SPACING) / 2 + 4;
  pole.receiveShadow = true;
  stripeTex.repeat.set(2, poleH / 3.2);
  tower.add(pole);
  collars = new THREE.InstancedMesh(collarGeo, mats.collar, count + 1);
  collars.receiveShadow = true;
  for (let i = 0; i <= count; i++) collars.setMatrixAt(i, tm.makeTranslation(0, -i * SPACING, 0));
  tower.add(collars);
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
    const meshes = new Array(SLICES).fill(null);
    let s0 = kind.findIndex((kd, k) => kd !== kind[(k + SLICES - 1) % SLICES]);
    if (s0 < 0) s0 = 0;
    for (let c = 0; c < SLICES;) {
      const k = (s0 + c) % SLICES, kd = kind[k];
      let len = 1;
      while (c + len < SLICES && kind[(k + len) % SLICES] === kd) len++;
      if (kd !== 'gap') {
        const m = new THREE.Mesh(runGeo(len), finish ? mats.finish : kd === 'red' ? mats.red : mats.plat);
        m.rotation.y = sliceRot(k);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
        for (let j = 0; j < len; j++) meshes[(k + j) % SLICES] = m;
      }
      c += len;
    }
    const spin = n > 5 && !finish && rng() < Math.min(0.4, (n - 5) * 0.05) ? (rng() < 0.5 ? -1 : 1) * (0.4 + rng() * 0.5) : 0;
    g.rotation.y = rng() * Math.PI * 2;
    tower.add(g);
    platforms.push({ group: g, kind, meshes, passed: false, finish, spin, splats: [], y: g.position.y, dip: 0, dipV: 0 });
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
const tm = new THREE.Matrix4(), tm2 = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), tc = new THREE.Color(), te = new THREE.Euler();
const SHARDS = 220;
const shardSets = shardGeos.map((s) => {
  const mesh = new THREE.InstancedMesh(s.geo, mats.shard, SHARDS);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tm.makeScale(0, 0, 0);
  for (let i = 0; i < SHARDS; i++) { mesh.setMatrixAt(i, tm); mesh.setColorAt(i, tc.set('#ffffff')); }
  scene.add(mesh);
  const list = Array.from({ length: SHARDS }, () => ({ life: 0, p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3(), w: new THREE.Vector3() }));
  return { mesh, list, c: s.c, cur: 0, live: 0 };
});
function shatter(p, fire) {
  tower.updateMatrixWorld(true);
  const vis = p.meshes.map((m) => !!m && m.visible);
  p.meshes.forEach((m, k) => {
    if (!vis[k]) return;
    const col = m.material === mats.red ? '#ff2a50' : fire ? '#ff8a00' : theme.plat;
    for (const set of shardSets) {
      for (let j = 0; j < 2; j++) {
        const s = set.list[set.cur];
        const idx = set.cur;
        set.cur = (set.cur + 1) % SHARDS;
        tm2.makeRotationY(sliceRot(k) + j * SLICE_A / 2);
        tm.copy(p.group.matrixWorld).multiply(tm2).multiply(tm2.makeTranslation(set.c.x, set.c.y, set.c.z));
        tm.decompose(s.p, s.q, ts);
        const out = tv.set(s.p.x, 0, s.p.z).normalize();
        s.v.copy(out).multiplyScalar(4 + Math.random() * 5).add(ts.set((Math.random() - 0.5) * 2, 2.5 + Math.random() * 4, (Math.random() - 0.5) * 2));
        s.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 14);
        s.life = 0.9 + Math.random() * 0.4;
        set.mesh.setColorAt(idx, tc.set(col));
      }
      set.live = SHARDS;
      set.mesh.instanceColor.needsUpdate = true;
    }
  });
  p.meshes.forEach((m) => { if (m) m.visible = false; });
}
const DROPS = 160;
const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.08, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), DROPS);
drops.frustumCulled = false;
drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(drops);
const dropList = [];
function splash(pos, color, n, o = {}) {
  for (let i = 0; i < n; i++) {
    if (dropList.length >= DROPS) dropList.shift();
    const a = Math.random() * Math.PI * 2, sp = (o.speed || 1) * (1 + Math.random() * 3);
    dropList.push({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * sp, vy: (o.up ?? 2) + Math.random() * 4, vz: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, g: o.g ?? 0.6, size: o.size || 1, color: Array.isArray(color) ? color[i % color.length] : color });
  }
}
function updateFx(dt) {
  for (const set of shardSets) {
    if (!set.live) continue;
    let alive = 0;
    for (let i = 0; i < SHARDS; i++) {
      const s = set.list[i];
      if (s.life <= 0) { tm.makeScale(0, 0, 0); set.mesh.setMatrixAt(i, tm); continue; }
      alive++;
      s.life -= dt;
      s.v.y += GRAVITY * 0.55 * dt;
      s.p.addScaledVector(s.v, dt);
      s.q.multiply(tq.setFromEuler(te.set(s.w.x * dt, s.w.y * dt, s.w.z * dt)));
      const k = Math.max(0.001, Math.min(1, s.life / 0.35));
      tm.compose(s.p, s.q, ts.set(k, k, k));
      set.mesh.setMatrixAt(i, tm);
    }
    set.live = alive;
    set.mesh.instanceMatrix.needsUpdate = true;
  }
  for (let i = dropList.length - 1; i >= 0; i--) {
    const d = dropList[i];
    d.life -= dt;
    if (d.life <= 0) { dropList.splice(i, 1); continue; }
    d.vy += GRAVITY * d.g * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
  }
  for (let i = 0; i < DROPS; i++) {
    const d = dropList[i];
    if (!d) { tm.makeScale(0, 0, 0); drops.setMatrixAt(i, tm); continue; }
    const s = Math.min(1, d.life * 3) * d.size;
    tm.compose(tv.set(d.x, d.y, d.z), tq.identity(), ts.set(s, s, s));
    drops.setMatrixAt(i, tm);
    drops.setColorAt(i, tc.set(d.color));
  }
  drops.instanceMatrix.needsUpdate = true;
  if (drops.instanceColor) drops.instanceColor.needsUpdate = true;
}

function addSplat(p) {
  // a paint splat where the ball landed, stuck to the slice it hit
  const m = p.meshes[sliceUnderBall(p)];
  if (!m) return;
  const s = new THREE.Mesh(splatGeo, splatMat(ballColor()));
  m.updateWorldMatrix(true, false);
  const local = m.worldToLocal(new THREE.Vector3(0, p.y, BALL_DIST));
  s.position.set(local.x, 0.004, local.z);
  s.scale.setScalar(0.95 + Math.random() * 0.45);
  s.rotation.y = Math.random() * 6;
  s.renderOrder = 1;
  m.add(s);
  p.splats.push(s);
  if (p.splats.length > 6) { const old = p.splats.shift(); old.removeFromParent(); }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = 'title'; // title | play | dead | win
let paused = false, menuOpen = false;
let time = 0;
const B = { y: 1.6, vy: 0, next: 0, combo: 0, fire: false, squash: 0 };
let score = 0, levelScore = 0, camY = 0, revived = false, shake = 0, punch = 0, bounces = 0, emberT = 0;
function dismissHand() { if (stopHand) { stopHand(); stopHand = null; save.tutorial = true; persist(); } }
let hud = null, scoreEl = null, stopHand = null;

function ballColor() {
  const s = SKINS.find((k) => k.id === save.skin) || SKINS[0];
  return s.mat || s.color;
}
function applySkin() { mats.ball.color.set(ballColor()); trail.material.color.set(ballColor()); }

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
  for (let k = 0; k < 4; k++) setTimeout(() => splash(ball.position.clone().add(new THREE.Vector3(0, 1, 0)), ['#ffd60a', '#ff4d6d', '#2ee59d', '#3da5ff'][k], 30, { speed: 1.6, up: 4, size: 1.3 }), k * 150);
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
    if (B.y - BALL_R <= 0) { B.y = BALL_R; B.vy = BOUNCE * 0.8; B.squash = 1; if (platforms[0]) platforms[0].dipV = -0.8; }
  } else if (state === 'play') {
    const prevY = B.y;
    B.vy += GRAVITY * dt;
    B.y += B.vy * dt;
    let p = platforms[B.next];
    let guard = 0;
    while (p && guard++ < 3) {
      const top = p.y;
      if (!(prevY - BALL_R >= top - 0.001 && B.y - BALL_R < top) && !(B.y - BALL_R < top && B.vy < 0 && prevY >= top)) break;
      const k = sliceUnderBall(p);
      const kd = p.kind[k];
      if (p.finish) {
        B.y = top + BALL_R;
        B.vy = BOUNCE * 0.6;
        B.squash = 1;
        p.dipV = -1.4;
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
        if (wasFire) {
          B.fire = false; B.combo = 0; noise(0, 0.35, 0.3, 500); UI.buzz([20, 30]); shake = 0.6; punch = 1;
          splash(tv.set(0, top, BALL_DIST), ['#ffd60a', '#ff8a00', '#ff4d00'], 24, { speed: 2, size: 1.3 });
        }
        else if (B.combo >= 3 && !B.fire) { B.fire = true; UI.praise('FIREBALL!', '#ff9f1c'); noise(0, 0.4, 0.2, 1500); punch = 0.6; }
        else if (B.combo === 2) UI.floatText('Nice!', window.innerWidth / 2, window.innerHeight * 0.4, '#7dffb2');
        hud.setProgress(B.next / (platforms.length - 1));
        p = platforms[B.next];
        continue;
      }
      if (kd === 'red') {
        B.y = top + BALL_R;
        B.squash = 1.3;
        shake = 0.5;
        die();
        break;
      }
      // bounce
      B.y = top + BALL_R;
      B.vy = BOUNCE;
      B.squash = 1;
      B.combo = 0;
      bounces += 1;
      p.dipV = -1.2;
      addSplat(p);
      splash(tv.set(0, top + 0.05, BALL_DIST), ballColor(), 8, { size: 0.9 });
      tone(520, 0, 0.08, 'sine', 0.15, 300);
      UI.buzz(5);
      break;
    }
  } else if (state === 'win') {
    B.vy += GRAVITY * dt;
    B.y += B.vy * dt;
    const top = platforms[platforms.length - 1].y;
    if (B.y - BALL_R <= top) { B.y = top + BALL_R; B.vy = BOUNCE * 0.6; B.squash = 0.8; }
  }

  // jelly dip of the platform the ball just bounced on
  for (let i = Math.max(0, B.next - 1); i <= Math.min(platforms.length - 1, B.next + 1); i++) {
    const p = platforms[i];
    if (!p.dip && !p.dipV) continue;
    p.dipV += (-220 * p.dip - 14 * p.dipV) * dt;
    p.dip += p.dipV * dt;
    if (Math.abs(p.dip) < 0.0005 && Math.abs(p.dipV) < 0.01) p.dip = p.dipV = 0;
    p.group.position.y = p.y + p.dip * 0.08;
  }
  mats.red.emissiveIntensity = 0.28 + 0.22 * Math.sin(time * 6);
  mats.finish.emissiveIntensity = 0.4 + 0.25 * Math.sin(time * 4);

  // ball: squash on landing, stretch while falling fast
  B.squash = Math.max(0, B.squash - dt * 6);
  const sq = Math.min(1, B.squash);
  const st = state === 'play' || state === 'win' ? Math.min(0.28, Math.max(0, -B.vy - 4) * 0.012) : 0;
  const sy = (1 - sq * 0.32) * (1 + st), sxz = (1 + sq * 0.26) / Math.sqrt(1 + st);
  ball.scale.set(sxz, sy, sxz);
  ball.position.set(0, B.y - BALL_R * (1 - sy), BALL_DIST);
  ball.rotation.x -= B.vy * dt * 0.3;
  ball.material = B.fire ? mats.fire : mats.ball;
  // ribbon trail: grows with fall speed, always on as a fireball
  const trailLen = state === 'play' ? (B.fire ? 2.6 + Math.sin(time * 30) * 0.15 : Math.max(0, Math.min(2.4, (-B.vy - 5) * 0.14))) : 0;
  trail.visible = trailLen > 0.05;
  if (trail.visible) {
    trail.position.copy(ball.position);
    trail.scale.set(BALL_R * 1.9 * sxz, trailLen, 1);
    trail.material.color.set(B.fire ? '#ff9a1a' : ballColor());
    trail.material.opacity = B.fire ? 1 : 0.75;
  }
  glow.visible = B.fire && state === 'play';
  if (glow.visible) {
    glow.position.copy(ball.position);
    glow.scale.setScalar(1.9 + Math.sin(time * 22) * 0.15);
    emberT -= dt;
    if (emberT <= 0) { emberT = 0.025; splash(ball.position, ['#ffd60a', '#ff8a00', '#ff5a00'], 1, { speed: 0.4, up: 1, g: -0.05, size: 0.9 }); }
  }
  // contact shadow on the next platform, if there is ground under the ball
  const np = platforms[B.next];
  const under = np && np.kind[sliceUnderBall(np)] !== 'gap' && np.meshes[sliceUnderBall(np)]?.visible !== false;
  ballShadow.visible = !!under && state !== 'dead';
  if (ballShadow.visible) {
    const h = Math.max(0, B.y - BALL_R - np.y);
    const k = Math.max(0.25, 1 - h / 5);
    ballShadow.position.set(0, np.group.position.y + 0.008, BALL_DIST);
    ballShadow.scale.set(BALL_R * 2.3 * k * sxz, 1, BALL_R * 2.3 * k * sxz);
    ballShadow.material.opacity = 0.42 * k;
  }

  // camera follows the ball down, never back up
  const targetY = Math.min(camY, B.y - 0.5);
  camY += (targetY - camY) * Math.min(1, dt * 6);
  if (state === 'title') camY = Math.min(camY, 0);
  shake = Math.max(0, shake - dt * 3);
  punch = Math.max(0, punch - dt * 3);
  const back = (camera.aspect < 1 ? 13 : 11) - punch * 0.8;
  camera.position.set((Math.random() - 0.5) * shake * 0.3, camY + 4.6 + (Math.random() - 0.5) * shake * 0.2, back);
  camera.lookAt(0, camY - 0.6, 0);
  key.position.set(4, camY + 10, 8);
  key.target.position.set(0, camY - 2, 0);
  rim.target.position.set(0, camY, 0);
  // keep the bokeh layer wrapped around the camera
  let moved = false;
  for (let i = 0; i < BOKEH; i++) {
    const y = bokehPos[i * 3 + 1];
    if (y > camY + 16) { bokehPos[i * 3 + 1] -= 46; moved = true; } else if (y < camY - 30) { bokehPos[i * 3 + 1] += 46; moved = true; }
  }
  if (moved) bokehGeo.attributes.position.needsUpdate = true;
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
