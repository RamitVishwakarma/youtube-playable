/*
 * Bus Rush 3D — get everyone on the right bus. Tap a passenger who has a
 * clear path to the road: they walk out and board the waiting bus if it's
 * their colour, or wait on a bench. Full buses drive off and the next one
 * pulls in. Run out of benches and it's over. Every level is checked by a
 * solver so it can always be cleared.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';
import { makeHuman, animateHuman, SHARED_GEOMETRIES } from 'models';

const COLORS = [
  { id: 'red', hex: '#ff4d5e' }, { id: 'blue', hex: '#3d8bff' }, { id: 'yellow', hex: '#ffd23f' },
  { id: 'green', hex: '#2ecc71' }, { id: 'purple', hex: '#b15cff' }, { id: 'orange', hex: '#ff8f2b' },
  { id: 'cyan', hex: '#21d4d4' }, { id: 'pink', hex: '#ff6fd8' },
];
const SEATS = 3;
const BENCHES = 5;      // bench seats at the start of a level
const MAX_BENCHES = 7;  // a rewarded ad can add two more
const CELL = 1.1;

let save = { level: 1, coins: 0, sound: true, tutorial: false };
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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fd8ff');
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0x7aa36a, 1.25));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(5, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
scene.add(sun);

let gridW = 6, gridH = 6;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  frameCamera();
}
// Fit the camera to the play area (grid, benches, bus) for any aspect ratio.
const fitCorners = [];
function frameCamera() {
  const portrait = camera.aspect < 1;
  camera.fov = portrait ? 50 : 40;
  const halfW = Math.max(gridW * CELL / 2 + 0.3, 2.6);
  const back = -2.2 - (gridH - 1) * CELL - 0.6;
  fitCorners.length = 0;
  for (const x of [-halfW, halfW]) for (const z of [back, 2.35]) for (const y of [0, 1.8]) fitCorners.push(new THREE.Vector3(x, y, z));
  const target = new THREE.Vector3(0, 0, (back + 2.35) / 2);
  const pitch = portrait ? 0.98 : 0.92; // radians above the horizon
  const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  camera.clearViewOffset();
  const extent = () => {
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    let x = 0, y0 = 1, y1 = -1;
    for (const c of fitCorners) { const p = c.clone().project(camera); x = Math.max(x, Math.abs(p.x)); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    return { x, y0, y1 };
  };
  let lo = 4, hi = 60;
  for (let it = 0; it < 24; it++) {
    const d = (lo + hi) / 2;
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    const e = extent();
    if (e.x < 0.94 && e.y1 - e.y0 < 1.6) hi = d; else lo = d;
  }
  camera.position.copy(target).addScaledVector(dir, hi);
  camera.lookAt(target);
  // centre the play area a little below the middle, under the HUD
  const e = extent();
  const w = window.innerWidth, h = window.innerHeight;
  camera.setViewOffset(w, h, 0, ((-0.1 - (e.y0 + e.y1) / 2) * h) / 2, w, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// Static scenery: grass, road, kerb
// ---------------------------------------------------------------------------
const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, o || {}));
const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat('#8ed16f', { roughness: 1 }));
grass.rotation.x = -Math.PI / 2;
grass.receiveShadow = true;
scene.add(grass);
const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 3.2), mat('#3d4250', { roughness: 0.9 }));
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0.005, 1.5);
road.receiveShadow = true;
scene.add(road);
const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 0.14), mat('#f4f4f4'), 30);
for (let i = 0; i < 30; i++) {
  const o = new THREE.Object3D();
  o.rotation.x = -Math.PI / 2;
  o.position.set(-30 + i * 2.1, 0.012, 2.6);
  o.updateMatrix();
  dashes.setMatrixAt(i, o.matrix);
}
scene.add(dashes);
const kerb = new THREE.Mesh(new THREE.BoxGeometry(60, 0.18, 0.3), mat('#e9ecef'));
kerb.position.set(0, 0.09, -0.15);
scene.add(kerb);
const pavement = new THREE.Mesh(new THREE.PlaneGeometry(60, 1.1), mat('#cfd4dc', { roughness: 0.9 }));
pavement.rotation.x = -Math.PI / 2;
pavement.position.set(0, 0.01, -0.85);
pavement.receiveShadow = true;
scene.add(pavement);
const benchGroup = new THREE.Group();
scene.add(benchGroup);
const world = new THREE.Group();
scene.add(world);

// trees for decoration
(function trees() {
  const trunk = new THREE.CylinderGeometry(0.15, 0.2, 0.9, 6);
  const crown = new THREE.IcosahedronGeometry(0.8, 0);
  const mt = mat('#8b5a2b'), mc = [mat('#2f9e44', { flatShading: true }), mat('#57c44f', { flatShading: true })];
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    const g = new THREE.Group();
    const t = new THREE.Mesh(trunk, mt); t.position.y = 0.45;
    const c = new THREE.Mesh(crown, mc[i % 2]); c.position.y = 1.3;
    g.add(t, c);
    g.traverse((o) => { o.castShadow = true; });
    g.position.set(side * (7 + Math.random() * 10), 0, -12 + Math.random() * 20);
    g.scale.setScalar(0.8 + Math.random() * 0.8);
    scene.add(g);
  }
})();

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
const colorMats = COLORS.map((c) => mat(c.hex, { roughness: 0.4 }));
// passengers wear their bus colour: shirt and cap
function makePerson(ci) {
  const h = makeHuman({ shirt: COLORS[ci].hex, cap: COLORS[ci].hex, scale: 1.05 });
  h.root.userData.h = h;
  return h.root;
}
function makeBus(ci) {
  const g = new THREE.Group();
  const paint = colorMats[ci];
  const body = new THREE.Mesh(new THREE.RoundedBoxGeometry(3.4, 1.3, 1.5, 3, 0.25), paint);
  body.position.y = 0.95;
  const roof = new THREE.Mesh(new THREE.RoundedBoxGeometry(3.2, 0.12, 1.4, 2, 0.05), mat('#ffffff'));
  roof.position.y = 1.65;
  const glass = mat('#1b263b', { roughness: 0.15, metalness: 0.4 });
  for (let k = 0; k < 4; k++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.02), glass);
    w.position.set(-1.1 + k * 0.72, 1.18, 0.76);
    g.add(w);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.24, 16);
  const wheelMat = mat('#1b1b22');
  [[-1.1, 0.75], [1.1, 0.75], [-1.1, -0.75], [1.1, -0.75]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.3, z);
    g.add(w);
  });
  body.castShadow = roof.castShadow = true;
  g.add(body, roof);
  // seat markers on the roof
  const seats = [];
  for (let k = 0; k < SEATS; k++) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), mat('#2b2d42', { roughness: 0.5 }));
    s.rotation.x = -Math.PI / 2;
    s.position.set(-0.8 + k * 0.8, 1.72, 0);
    g.add(s);
    seats.push(s);
  }
  return { g, seats };
}

// ---------------------------------------------------------------------------
// Level generation + solver
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cells reachable from the exit row (row 0 is next to the road). */
function reachable(grid, w, h) {
  const seen = new Set();
  const out = new Set();
  const q = [];
  for (let c = 0; c < w; c++) {
    const k = c;
    if (grid[k] === -1) { q.push([0, c]); seen.add(k); }
    else if (grid[k] >= 0) out.add(k);
  }
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
      const k = rr * w + cc;
      if (seen.has(k)) continue;
      seen.add(k);
      if (grid[k] === -1) q.push([rr, cc]);
      else if (grid[k] >= 0) out.add(k);
    }
  }
  return out; // passengers who can walk out right now
}

function solves(grid, w, h, buses) {
  const g = grid.slice();
  const bench = [];
  let bi = 0, seats = 0;
  const board = () => {
    // fill the current bus from the bench
    let moved = true;
    while (moved && bi < buses.length) {
      moved = false;
      const i = bench.indexOf(buses[bi]);
      if (i >= 0) { bench.splice(i, 1); seats++; moved = true; if (seats === SEATS) { bi++; seats = 0; } }
    }
  };
  for (let guard = 0; guard < 400; guard++) {
    board();
    if (bi >= buses.length) return true;
    const reach = [...reachable(g, w, h)];
    if (!reach.length) return false;
    const want = buses[bi];
    let pick = reach.find((k) => g[k] === want);
    if (pick === undefined) {
      if (bench.length >= BENCHES) return false;
      // bench the passenger whose bus comes soonest
      const soon = (col) => { for (let j = bi; j < buses.length; j++) if (buses[j] === col) return j; return 1e9; };
      reach.sort((a, b) => soon(g[a]) - soon(g[b]));
      pick = reach[0];
      bench.push(g[pick]);
      g[pick] = -1;
      continue;
    }
    g[pick] = -1;
    seats++;
    if (seats === SEATS) { bi++; seats = 0; }
  }
  return false;
}

function genLevel(n) {
  const rng = mulberry32(n * 48271 + 11);
  const w = n < 3 ? 5 : n < 8 ? 6 : 7;
  const h = n < 3 ? 4 : n < 6 ? 5 : n < 12 ? 6 : 7;
  const colors = Math.min(COLORS.length, 3 + Math.floor(n / 3));
  for (let attempt = 0; attempt < 200; attempt++) {
    const cells = w * h;
    const walls = Math.floor(cells * (0.05 + Math.min(0.12, n * 0.01)));
    const people = Math.floor((cells - walls) * Math.min(0.85, 0.6 + n * 0.02) / SEATS) * SEATS;
    const pool = [];
    for (let i = 0; i < people / SEATS; i++) for (let k = 0; k < SEATS; k++) pool.push(i % colors);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const grid = new Array(cells).fill(-1);
    const order = Array.from({ length: cells }, (_, i) => i).sort(() => rng() - 0.5);
    let pi = 0, wi = 0;
    for (const k of order) {
      if (pi < pool.length) grid[k] = pool[pi++];
      else if (wi < walls && k >= w) { grid[k] = -2; wi++; }
    }
    // bus order: shuffled colours, one bus per three passengers
    const buses = [];
    for (let i = 0; i < people / SEATS; i++) buses.push(i % colors);
    for (let i = buses.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [buses[i], buses[j]] = [buses[j], buses[i]]; }
    if (solves(grid, w, h, buses)) return { w, h, grid, buses, colors };
  }
  // fallback: trivially solvable
  const grid = new Array(w * h).fill(-1);
  const buses = [0, 1];
  [0, 0, 0, 1, 1, 1].forEach((c, i) => (grid[i] = c));
  return { w, h, grid, buses, colors: 2 };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = 'title';
let paused = false, menuOpen = false;
let time = 0;
let L = null;           // level
let grid = [];          // -1 empty, -2 wall, >=0 colour
let people = new Map(); // cell index -> person record
let walkers = [];       // people currently walking
let bench = [];         // waiting people (records) in slots
let busIndex = 0, seatsFilled = 0, bus = null, busState = 'arriving';
let pendingBoard = 0, benchCount = BENCHES, peakBench = 0;
let hud = null, stopHand = null, revived = false;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const tiles = [];

const cellPos = (k) => {
  const r = Math.floor(k / L.w), c = k % L.w;
  return new THREE.Vector3((c - (L.w - 1) / 2) * CELL, 0, -2.2 - r * CELL);
};
const EXIT_Z = -1.45;
const BUS_POS = new THREE.Vector3(0, 0, 1.5);
// the first five benches sit in the middle, the two bonus ones at the ends
const BENCH_X = [-2, -1, 0, 1, 2, -3, 3];
const benchPos = (i) => new THREE.Vector3(BENCH_X[i] * 1.0, 0, -0.75);
const seatPos = (n) => BUS_POS.clone().add(new THREE.Vector3(-0.8 + n * 0.8, 1.75, 0));

function clearWorld() {
  world.traverse((o) => { if (o.geometry && !SHARED_GEOMETRIES.has(o.geometry)) o.geometry.dispose(); });
  world.clear();
  people.clear();
  walkers = [];
  bench = [];
  tiles.length = 0;
  if (bus) { scene.remove(bus.g); bus = null; }
}

function buildLevel(n) {
  clearWorld();
  L = genLevel(n);
  gridW = L.w; gridH = L.h;
  frameCamera();
  grid = L.grid.slice();
  // ground pad + tiles
  const pad = new THREE.Mesh(new THREE.RoundedBoxGeometry(L.w * CELL + 0.6, 0.2, L.h * CELL + 0.6, 2, 0.12), mat('#f1e3c7'));
  pad.position.set(0, 0.0, -2.2 - ((L.h - 1) / 2) * CELL);
  pad.receiveShadow = true;
  world.add(pad);
  const tileGeo = new THREE.RoundedBoxGeometry(CELL * 0.92, 0.08, CELL * 0.92, 2, 0.06);
  for (let k = 0; k < grid.length; k++) {
    const p = cellPos(k);
    if (grid[k] === -2) {
      const block = new THREE.Mesh(new THREE.RoundedBoxGeometry(CELL * 0.86, 0.7, CELL * 0.86, 2, 0.1), mat('#a0a7b8'));
      block.position.set(p.x, 0.45, p.z);
      block.castShadow = block.receiveShadow = true;
      world.add(block);
      continue;
    }
    const t = new THREE.Mesh(tileGeo, mat('#ffffff', { roughness: 0.8 }));
    t.position.set(p.x, 0.13, p.z);
    t.receiveShadow = true;
    world.add(t);
    tiles[k] = t;
    if (grid[k] >= 0) {
      const person = makePerson(grid[k]);
      person.position.set(p.x, 0.17, p.z);
      person.rotation.y = Math.PI;
      world.add(person);
      people.set(k, { k, color: grid[k], g: person, bob: Math.random() * 6 });
    }
  }
  // benches
  benchGroup.clear();
  for (let i = 0; i < MAX_BENCHES; i++) {
    const b = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.RoundedBoxGeometry(0.85, 0.12, 0.5, 2, 0.05), mat(i < BENCHES ? '#c9895b' : '#ffd23f'));
    seat.position.y = 0.2;
    const back = new THREE.Mesh(new THREE.RoundedBoxGeometry(0.85, 0.4, 0.08, 2, 0.03), seat.material);
    back.position.set(0, 0.45, -0.24);
    seat.castShadow = back.castShadow = true;
    b.add(seat, back);
    b.position.copy(benchPos(i));
    b.visible = i < BENCHES;
    benchGroup.add(b);
  }
  busIndex = 0; seatsFilled = 0; pendingBoard = 0; revived = false; benchCount = BENCHES; peakBench = 0;
  spawnBus();
  refreshReach();
  if (hud) hud.setProgress(0);
}

function spawnBus() {
  if (bus) scene.remove(bus.g);
  if (busIndex >= L.buses.length) { bus = null; return; }
  const ci = L.buses[busIndex];
  bus = makeBus(ci);
  bus.color = ci;
  bus.g.position.set(-16, 0, BUS_POS.z);
  scene.add(bus.g);
  busState = 'arriving';
  seatsFilled = 0;
  pendingBoard = 0;
  tone(220, 0, 0.18, 'square', 0.05);
  tone(196, 0.2, 0.25, 'square', 0.05);
}

let reachSet = new Set();
function refreshReach() {
  reachSet = reachable(grid, L.w, L.h);
  // reachable passengers stand up straight and glow a little; others dim
  for (const [k, p] of people) {
    const ok = reachSet.has(k);
    p.g.scale.setScalar(ok ? 1 : 0.92);
    if (tiles[k]) tiles[k].material.color.set(ok ? '#ffffff' : '#e4e4ec');
  }
}

function pathFrom(k) {
  // BFS from cell k to row 0 through empty cells, then to the road edge
  const w = L.w, h = L.h;
  const prev = new Map([[k, -1]]);
  const q = [k];
  let end = -1;
  while (q.length) {
    const cur = q.shift();
    const r = Math.floor(cur / w), c = cur % w;
    if (r === 0) { end = cur; break; }
    for (const [dr, dc] of [[-1, 0], [0, -1], [0, 1], [1, 0]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
      const nk = rr * w + cc;
      if (prev.has(nk) || grid[nk] !== -1) continue;
      prev.set(nk, cur);
      q.push(nk);
    }
  }
  if (end < 0) return null;
  const cells = [];
  for (let c = end; c !== -1; c = prev.get(c)) cells.unshift(c);
  return cells.map((c) => cellPos(c)).concat([new THREE.Vector3(cellPos(end).x, 0, EXIT_Z)]);
}

function tapPerson(k) {
  const p = people.get(k);
  if (!p || !reachSet.has(k)) {
    if (p) { p.shake = 0.35; sfx.bad(); UI.buzz(10); }
    return;
  }
  const path = pathFrom(k);
  if (!path) return;
  // decide the destination now so quick taps queue up correctly
  const toBus = bus && busState === 'waiting' && bus.color === p.color && seatsFilled + pendingBoard < SEATS;
  const slot = toBus ? -1 : firstFreeBench();
  if (!toBus && slot < 0) {
    p.shake = 0.35; sfx.bad(); UI.buzz(10);
    UI.floatText('Benches full!', window.innerWidth / 2, window.innerHeight * 0.3, '#ff6b6b');
    return;
  }
  people.delete(k);
  grid[k] = -1;
  const dest = toBus ? 'bus' : 'bench';
  if (toBus) { pendingBoard++; path.push(seatPos(seatsFilled + pendingBoard - 1)); }
  else {
    bench[slot] = 'reserved';
    path.push(benchPos(slot).add(new THREE.Vector3(0, 0.1, 0)));
    peakBench = Math.max(peakBench, bench.filter(Boolean).length);
  }
  walkers.push({ p, path, i: 0, dest, slot });
  tone(660 + Math.random() * 80, 0, 0.06, 'sine', 0.1);
  UI.buzz(6);
  if (stopHand) { stopHand(); stopHand = null; save.tutorial = true; persist(); }
  refreshReach();
}

function firstFreeBench() {
  for (let i = 0; i < benchCount; i++) if (!bench[i]) return i;
  return -1;
}

function arrive(wk) {
  const p = wk.p;
  if (wk.dest === 'bus') {
    pendingBoard = Math.max(0, pendingBoard - 1);
    boardBus(p);
  } else {
    bench[wk.slot] = p;
    p.g.rotation.y = 0;
    boardFromBench();
  }
}

function boardBus(p) {
  if (!bus) return;
  world.remove(p.g);
  seatsFilled++;
  bus.seats[seatsFilled - 1].material.color.set(COLORS[bus.color].hex);
  bus.g.scale.set(1.05, 0.95, 1.05);
  sfx.pop();
  const s = toScreen(bus.g.position.clone().add(new THREE.Vector3(0, 2.2, 0)));
  UI.floatText(seatsFilled + '/' + SEATS, s.x, s.y, '#ffffff');
  if (seatsFilled >= SEATS) departBus();
}

function departBus() {
  busState = 'leaving';
  sfx.good();
  tone(330, 0.1, 0.2, 'square', 0.05);
  noise(0.1, 0.6, 0.12, 400);
  busIndex++;
  hud.setProgress(busIndex / L.buses.length);
  if (busIndex >= L.buses.length) setTimeout(win, 900);
}

function boardFromBench() {
  if (!bus || busState !== 'waiting') return;
  for (let i = 0; i < benchCount; i++) {
    const p = bench[i];
    if (!p || p === 'reserved') continue;
    if (p.color === bus.color && seatsFilled + pendingBoard < SEATS) {
      bench[i] = null;
      pendingBoard++;
      const at = p.g.position.clone();
      walkers.push({ p, path: [new THREE.Vector3(at.x, 0, 0.3), seatPos(seatsFilled + pendingBoard - 1)], i: 0, dest: 'bus', slot: -1 });
    }
  }
}

const proj = new THREE.Vector3();
function toScreen(v) {
  proj.copy(v).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
function ensureHud() {
  if (hud) return;
  hud = UI.hud({ coins: save.coins, level: 'Level 1', right: [UI.iconButton('❚❚', 'Pause', openPause), UI.iconButton('↻', 'Restart', () => { if (state === 'play') startLevel(); })] });
}

function showTitle() {
  state = 'title';
  if (hud) hud.show(false);
  buildLevel(save.level);
  UI.titleScreen({
    line1: 'BUS', line2: 'RUSH 3D',
    tagline: 'Tap passengers to send them to the bus of their colour.',
    best: 'Level ' + save.level,
    onPlay: startLevel,
    extra: [UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true })],
  });
}

function startLevel() {
  initAudio(() => save.sound);
  ensureHud();
  if (state !== 'title') buildLevel(save.level);
  hud.show(true);
  hud.setLevel('Level ' + save.level);
  hud.setCoins(save.coins);
  hud.setProgress(0);
  state = 'play';
  if (!save.tutorial) {
    stopHand = UI.tutorialHand(() => {
      const k = [...reachSet].find((x) => people.get(x) && bus && people.get(x).color === bus.color) ?? [...reachSet][0];
      const p = k !== undefined ? toScreen(cellPos(k).add(new THREE.Vector3(0, 0.6, 0))) : { x: 0, y: 0 };
      return [[p.x, p.y + 24], [p.x, p.y]];
    }, 'Tap a passenger with a clear path');
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

function lose() {
  if (state !== 'play') return;
  state = 'lost';
  sfx.lose();
  UI.hitFlash();
  UI.buzz([40, 60, 40]);
  const btns = [];
  if (!revived) {
    btns.push(UI.button('+2 benches', async () => {
      if (!(await YT.rewarded('extra_benches'))) return;
      p.close();
      revived = true;
      benchCount = MAX_BENCHES;
      benchGroup.children.forEach((b) => { b.visible = true; });
      stuckT = 0;
      state = 'play';
      UI.praise('+2 BENCHES!', '#7dffb2');
      sfx.win();
    }, { style: 'gold', ad: true }));
  }
  btns.push(UI.button('Try again', () => { p.close(); startLevel(); }, { style: revived ? 'green' : '' }));
  btns.push(UI.button('Home', () => { p.close(); showTitle(); }, { style: 'ghost', small: true }));
  const p = UI.panel({ title: 'Benches full!', sub: 'Nobody can board this bus. Plan who to send first next time.', buttons: btns });
}

function win() {
  if (state !== 'play') return;
  state = 'won';
  sfx.fanfare();
  UI.buzz([20, 40, 20, 40, 60]);
  UI.praise('ALL ABOARD!', '#ffd60a');
  // stars for keeping the benches free
  const stars = revived ? 1 : peakBench <= 2 ? 3 : peakBench <= 4 ? 2 : 1;
  const reward = 20 + save.level * 4 + stars * 8;
  setTimeout(() => {
    const body = document.createElement('div');
    body.innerHTML = UI.starsHtml(stars) + '<div class="reward"><span class="fs-coin" style="position:static;margin:0"></span><b>0</b></div>';
    UI.countUp(body.querySelector('.reward b'), 0, reward, 700);
    const collect = (mult, p) => {
      p.close();
      const gained = reward * mult;
      UI.coinBurst(window.innerWidth / 2, window.innerHeight / 2, 10, hud.coinEl, (i) => { sfx.coin(i); hud.setCoins(Math.round(save.coins - gained + gained * (i + 1) / 10), true); });
      save.coins += gained;
      save.level += 1;
      persist(true);
      YT.sendScore(save.level - 1);
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
  }, 900);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (paused || menuOpen || state !== 'play') return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  // hit the ground plane, then snap to a grid cell (bigger touch targets than the people)
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5), hit);
  if (!hit) return;
  const c = Math.round(hit.x / CELL + (L.w - 1) / 2);
  const rr = Math.round((-2.2 - hit.z) / CELL);
  if (c < 0 || c >= L.w || rr < 0 || rr >= L.h) return;
  tapPerson(rr * L.w + c);
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function update(dt) {
  time += dt;
  for (const [, p] of people) {
    const s = p.shake > 0 ? Math.sin(p.shake * 50) * 0.08 : 0;
    p.shake = Math.max(0, (p.shake || 0) - dt);
    p.g.position.x = cellPos(p.k).x + s;
    p.g.position.y = 0.17 + (reachSet.has(p.k) ? Math.abs(Math.sin(time * 4 + p.bob)) * 0.06 : 0);
    animateHuman(p.g.userData.h, dt, 0);
  }
  for (let i = walkers.length - 1; i >= 0; i--) {
    const w = walkers[i];
    const target = w.path[w.i];
    const pos = w.p.g.position;
    const d = target.clone().sub(pos);
    const dist = d.length();
    const speed = 6;
    if (dist < 0.05) {
      w.i++;
      if (w.i >= w.path.length) { walkers.splice(i, 1); arrive(w); continue; }
    } else {
      pos.addScaledVector(d.normalize(), Math.min(dist, speed * dt));
      if (Math.abs(d.x) + Math.abs(d.z) > 0.01) w.p.g.rotation.y = Math.atan2(d.x, d.z);
      animateHuman(w.p.g.userData.h, dt, speed);
    }
  }
  // bus movement
  if (bus) {
    bus.g.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 8));
    if (busState === 'arriving') {
      bus.g.position.x += (BUS_POS.x - bus.g.position.x) * Math.min(1, dt * 3.5);
      if (Math.abs(bus.g.position.x - BUS_POS.x) < 0.05) { bus.g.position.x = BUS_POS.x; busState = 'waiting'; boardFromBench(); }
    } else if (busState === 'leaving' && !walkers.some((w) => w.dest === 'bus')) {
      bus.g.position.x += dt * (6 + (bus.g.position.x - BUS_POS.x) * 3);
      if (bus.g.position.x > 18) { spawnBus(); }
    }
  }
  if (state === 'play' && bus && busState === 'waiting') checkStuck(dt);
}

let stuckT = 0;
function checkStuck(dt) {
  // lose if the benches are full and nothing on them or reachable can board
  const benched = bench.filter((b) => b && b !== 'reserved');
  if (benched.length < benchCount || walkers.length || seatsFilled >= SEATS) { stuckT = 0; return; }
  if (benched.some((b) => b.color === bus.color)) { stuckT = 0; return; }
  if ([...reachSet].some((k) => people.get(k) && people.get(k).color === bus.color)) { stuckT = 0; return; }
  stuckT += dt;
  if (stuckT > 0.6) lose();
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

window.__busRush = {
  info: () => ({
    state, level: save.level, busIndex, buses: L ? L.buses.length : 0, busColor: bus ? bus.color : -1, busState, seatsFilled,
    bench: bench.map((b) => (b && b !== 'reserved' ? b.color : b ? 'r' : null)), benchCount, walkers: walkers.length, peakBench,
    reach: [...reachSet].map((k) => ({ k, color: people.get(k) ? people.get(k).color : -1, screen: toScreen(cellPos(k).add(new THREE.Vector3(0, 0.5, 0))) })),
    upcoming: L ? L.buses.slice(busIndex) : [],
  }),
};

(async function boot() {
  YT.init('bus-rush');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  resize();
  showTitle();
  requestAnimationFrame(frame);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
