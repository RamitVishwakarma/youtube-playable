/*
 * Mini Mart Empire 3D — run your own supermarket chain. Walk with the
 * joystick: grab stock from the crates out back, fill the shelves, serve the
 * queue at the register and scoop up the cash. Stand on a price circle to
 * spend money there: new product lines, staff who work for you, bigger
 * arms, faster shoes, and finally a whole new store across town. Every store
 * you own keeps earning once it has a cashier and a stocker, and your net
 * worth keeps climbing.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';
import { makeHuman, animateHuman, SHARED_GEOMETRIES } from 'models';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
const PRODUCTS = {
  apple: { name: 'Apples', icon: '🍎', price: 2, regen: 1.4 },
  milk: { name: 'Milk', icon: '🥛', price: 4, regen: 1.7 },
  bread: { name: 'Bread', icon: '🍞', price: 7, regen: 2.0 },
  soda: { name: 'Soda', icon: '🥤', price: 11, regen: 2.3 },
  cheese: { name: 'Cheese', icon: '🧀', price: 18, regen: 1.6 },
  fish: { name: 'Fish', icon: '🐟', price: 28, regen: 1.9 },
  cake: { name: 'Cake', icon: '🎂', price: 42, regen: 2.2 },
  flower: { name: 'Flowers', icon: '💐', price: 60, regen: 2.5 },
  toy: { name: 'Toys', icon: '🧸', price: 95, regen: 1.8 },
  shoe: { name: 'Sneakers', icon: '👟', price: 140, regen: 2.1 },
  phone: { name: 'Phones', icon: '📱', price: 220, regen: 2.4 },
  tv: { name: 'TVs', icon: '📺', price: 360, regen: 2.8 },
};

// Each store: products (in unlock order), zone costs, sign colours.
const LOCATIONS = [
  {
    id: 'corner', name: 'Corner Shop', sign: '#ff5a5f', floor: ['#f3e6d3', '#e9d8c0'], wall: '#ffd6a5',
    products: ['apple', 'milk', 'bread', 'soda'], costs: [0, 40, 180, 520],
    cashier: 120, stocker: 320, arms: 260, shoes: 420, register2: 0, expand: 1600, mult: 1,
  },
  {
    id: 'super', name: 'City Supermarket', sign: '#3a86ff', floor: ['#e3f2fd', '#cfe6f8'], wall: '#bde0fe',
    products: ['cheese', 'fish', 'cake', 'flower'], costs: [900, 2400, 5200, 9800],
    cashier: 3000, stocker: 4200, arms: 3600, shoes: 5600, register2: 7500, expand: 24000, mult: 1,
  },
  {
    id: 'mall', name: 'Mega Mall', sign: '#9b5de5', floor: ['#f1e8ff', '#e2d4fb'], wall: '#d8c8ff',
    products: ['toy', 'shoe', 'phone', 'tv'], costs: [16000, 38000, 80000, 150000],
    cashier: 45000, stocker: 60000, arms: 52000, shoes: 70000, register2: 110000, expand: 0, mult: 1,
  },
];

const SHELF_CAP = 8;
const SUPPLY_CAP = 6;
const BASE_CARRY = 4;
const BASE_SPEED = 4.2;
const BOOST_SECS = 180;
const OFFLINE_CAP_H = 3;

let save = {
  cash: 0, loc: 0, owned: [true, false, false], stores: [{}, {}, {}],
  carry: BASE_CARRY, speed: 0, sound: true, tutorial: 0, boostUntil: 0, t: Date.now(), served: 0,
};
let saveTimer = 0;
function persist(now) {
  clearTimeout(saveTimer);
  save.t = Date.now();
  if (now) YT.save(save);
  else saveTimer = setTimeout(() => { save.t = Date.now(); YT.save(save); }, 600);
}
const S = () => {
  const st = save.stores[save.loc] || (save.stores[save.loc] = {});
  st.unlocked = st.unlocked || {};
  st.stock = st.stock || {};
  st.pile = st.pile || 0;
  st.paid = st.paid || {};
  st.lvl = st.lvl || {};
  return st;
};

const fmt = (n) => {
  n = Math.floor(n);
  if (n < 1000) return '$' + n;
  const u = ['K', 'M', 'B', 'T'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return '$' + (n >= 100 ? n.toFixed(0) : n.toFixed(1)) + u[i];
};

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
scene.background = new THREE.Color('#8fd3ff');
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(6, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
scene.add(sun, sun.target);

let portrait = true;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  portrait = camera.aspect < 1;
  camera.fov = portrait ? 50 : 38;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.65 }, o || {}));
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const rbox = (w, h, d, r, m) => new THREE.Mesh(new THREE.RoundedBoxGeometry(w, h, d, 2, r), m);

// ---------------------------------------------------------------------------
// Product models (small, ~0.3 m)
// ---------------------------------------------------------------------------
const productGeo = {};
function productMesh(id) {
  const g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  switch (id) {
    case 'apple': add(productGeo.sph || (productGeo.sph = new THREE.SphereGeometry(0.13, 14, 10)), mat('#e63946', { roughness: 0.35 }), 0, 0.13); add(new THREE.CylinderGeometry(0.012, 0.012, 0.07), mat('#6b3e1f'), 0, 0.28); break;
    case 'milk': add(new THREE.BoxGeometry(0.18, 0.28, 0.18), mat('#ffffff'), 0, 0.14); add(new THREE.BoxGeometry(0.19, 0.08, 0.19), mat('#3a86ff'), 0, 0.2); break;
    case 'bread': add(new THREE.CapsuleGeometry(0.1, 0.18, 4, 10), mat('#d4a373'), 0, 0.11).rotation.z = Math.PI / 2; break;
    case 'soda': add(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 14), mat('#e63946', { metalness: 0.4, roughness: 0.3 }), 0, 0.14); add(new THREE.CylinderGeometry(0.081, 0.081, 0.06, 14), mat('#ffffff'), 0, 0.16); break;
    case 'cheese': add(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 3), mat('#ffd166'), 0, 0.07); break;
    case 'fish': { const f = add(new THREE.SphereGeometry(0.11, 12, 8), mat('#4cc9f0', { roughness: 0.3 }), 0, 0.1); f.scale.set(1.8, 0.8, 0.8); add(new THREE.ConeGeometry(0.08, 0.12, 3), mat('#4895ef'), -0.22, 0.1).rotation.z = Math.PI / 2; break; }
    case 'cake': add(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 18), mat('#ffafcc'), 0, 0.08); add(new THREE.CylinderGeometry(0.155, 0.155, 0.04, 18), mat('#ffffff'), 0, 0.16); add(new THREE.SphereGeometry(0.035, 8, 6), mat('#e63946'), 0, 0.2); break;
    case 'flower': add(new THREE.CylinderGeometry(0.02, 0.02, 0.22), mat('#2a9d8f'), 0, 0.11); add(new THREE.SphereGeometry(0.09, 10, 8), mat('#ff6fd8'), 0, 0.26); add(new THREE.SphereGeometry(0.06, 10, 8), mat('#ffd60a'), 0.08, 0.22); break;
    case 'toy': add(rbox(0.24, 0.24, 0.24, 0.05, mat('#ff9f1c')), null); g.children[0].material = mat('#ff9f1c'); g.children[0].position.y = 0.12; add(new THREE.SphereGeometry(0.06, 8, 6), mat('#3a86ff'), 0, 0.29); break;
    case 'shoe': add(new THREE.BoxGeometry(0.3, 0.12, 0.13), mat('#ffffff'), 0, 0.06); add(new THREE.BoxGeometry(0.14, 0.12, 0.13), mat('#ff006e'), -0.07, 0.15); break;
    case 'phone': add(new THREE.BoxGeometry(0.15, 0.27, 0.03), mat('#1b1b22', { metalness: 0.5, roughness: 0.3 }), 0, 0.14); add(new THREE.BoxGeometry(0.13, 0.23, 0.005), mat('#4cc9f0', { emissive: '#1e6091', emissiveIntensity: 0.6 }), 0, 0.14, 0.018); break;
    case 'tv': add(new THREE.BoxGeometry(0.36, 0.24, 0.05), mat('#1b1b22'), 0, 0.17); add(new THREE.BoxGeometry(0.32, 0.2, 0.005), mat('#7209b7', { emissive: '#3a0ca3', emissiveIntensity: 0.7 }), 0, 0.17, 0.028); add(new THREE.BoxGeometry(0.1, 0.05, 0.08), mat('#333'), 0, 0.025); break;
    default: add(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat('#999'), 0, 0.1);
  }
  return g;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
function makePerson(shirt, opts = {}) {
  const h = makeHuman({ shirt, skin: opts.skin, hair: opts.hair, cap: opts.cap, apron: opts.apron, style: opts.style, scale: 1.3 });
  h.root.userData.h = h;
  return h.root;
}
/** Walk cycle; arms go forward while carrying a stack. */
function animateWalk(p, dt, moving, speed = 2.4, carrying = false) {
  const h = p.userData.h;
  animateHuman(h, dt, moving ? speed : 0);
  if (carrying) for (const a of h.arms) a.rotation.x = -1.2;
}

// ---------------------------------------------------------------------------
// World state for the current store
// ---------------------------------------------------------------------------
const world = new THREE.Group();
scene.add(world);
let L = null;          // location config
let fixtures = [];     // AABBs the player collides with
let lines = [];        // product lines { id, x, unlocked, shelf{mesh,items[],pos}, supply{mesh,items[],pos,count,t} }
let zones = [];        // unlock zones
let customers = [];
let staff = [];
let flyers = [];
let counter = null;    // checkout
let pileMeshes = [];
let signMesh = null;
const DOOR = new THREE.Vector3(0, 0, 7.2);
const REG = { x: 5.7, z: 3.2 };          // register counter
const CASHIER_SPOT = new THREE.Vector3(6.9, 0, 3.2);
const PILE = new THREE.Vector3(4.7, 0, 1.8);
// the queue runs west from the till, then bends toward the door
const queuePos = (i) => (i < 4 ? new THREE.Vector3(4.5 - i * 0.85, 0, 3.4) : new THREE.Vector3(1.95, 0, 3.4 + (i - 3) * 0.8));

// the first aisles open in the middle of the shop, later ones toward the walls
const LINE_X = [-1.45, 1.45, -4.35, 4.35];
function lineX(i) { return LINE_X[i]; }

function clearWorld() {
  world.traverse((o) => { if (o.isMesh && o.geometry && !SHARED_GEOMETRIES.has(o.geometry)) o.geometry.dispose(); });
  world.clear();
  fixtures = []; lines = []; zones = []; customers = []; staff = []; flyers = []; pileMeshes = [];
}

function buildStore() {
  clearWorld();
  L = LOCATIONS[save.loc];
  const st = S();
  st.unlocked.line0 = true; // every store you own opens with its first aisle
  // ground outside + sidewalk + street
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat('#9ad27a', { roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; grass.receiveShadow = true;
  world.add(grass);
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(40, 4), mat('#d6d6de', { roughness: 0.95 }));
  walk.rotation.x = -Math.PI / 2; walk.position.set(0, -0.01, 9); walk.receiveShadow = true;
  world.add(walk);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), mat('#3d4250', { roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, -0.015, 14);
  world.add(road);
  // floor tiles
  const tile = canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? L.floor[0] : L.floor[1]; g.fillRect(x * 64, y * 64, 64, 64); }
  });
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
  tile.repeat.set(4, 3.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), new THREE.MeshStandardMaterial({ map: tile, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  world.add(floor);
  // walls (back + sides, low front with a door gap)
  const wallMat = mat(L.wall, { roughness: 0.9 });
  const wall = (w, h, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat); m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; world.add(m); fixtures.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); };
  wall(16.4, 2.2, 0.3, 0, -7.1);
  wall(0.3, 2.2, 14.2, -8.1, 0);
  wall(0.3, 2.2, 14.2, 8.1, 0);
  wall(6.6, 0.9, 0.3, -4.9, 7.0);
  wall(6.6, 0.9, 0.3, 4.9, 7.0);
  // stockroom divider line on the floor
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.12), mat('#ffb703'));
  stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, 0.006, -3.6);
  world.add(stripe);
  // store sign over the door
  const signTex = canvasTex(1024, 192, (g, w, h) => {
    g.fillStyle = L.sign; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = '900 104px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(L.name.toUpperCase(), w / 2, h / 2 + 6);
  });
  signMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 0.2), [mat(L.sign), mat(L.sign), mat(L.sign), mat(L.sign), new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.25 }), mat(L.sign)]);
  signMesh.position.set(0, 2.6, 7.05);
  world.add(signMesh);
  for (const sx of [-2.4, 2.4]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.1), mat('#555')); post.position.set(sx, 1.05, 7.05); world.add(post); }
  // plants
  for (const [px, pz] of [[-7.4, 6.3], [7.4, 6.3], [-7.4, -2.8]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.45, 12), mat('#c97b4a'));
    pot.position.set(px, 0.22, pz);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat('#2a9d8f', { flatShading: true }));
    leaf.position.set(px, 0.85, pz);
    pot.castShadow = leaf.castShadow = true;
    world.add(pot, leaf);
  }
  // checkout counter
  counter = new THREE.Group();
  const top = rbox(1.0, 0.95, 2.2, 0.08, mat('#ffffff'));
  top.position.y = 0.475; top.castShadow = top.receiveShadow = true;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 1.6), mat('#2b2d42'));
  belt.position.y = 0.97;
  const reg = rbox(0.45, 0.35, 0.4, 0.05, mat('#3a3d5c'));
  reg.position.set(0.25, 1.12, -0.6);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.02), mat('#4cc9f0', { emissive: '#1e6091', emissiveIntensity: 0.8 }));
  screen.position.set(0.05, 1.25, -0.6); screen.rotation.y = -Math.PI / 2;
  counter.add(top, belt, reg, screen);
  counter.position.set(REG.x, 0, REG.z);
  world.add(counter);
  fixtures.push({ x0: REG.x - 0.5, x1: REG.x + 0.5, z0: REG.z - 1.1, z1: REG.z + 1.1 });
  // cashier floor spot
  const spot = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
  spot.rotation.x = -Math.PI / 2; spot.position.set(CASHIER_SPOT.x, 0.01, CASHIER_SPOT.z);
  world.add(spot);
  counter.userData.spot = spot;
  // product lines (shelf + supply crate)
  L.products.forEach((id, i) => {
    const x = lineX(i);
    const line = { id, i, x, unlocked: !!st.unlocked['line' + i], shelf: null, supply: null };
    lines.push(line);
    if (line.unlocked) buildLine(line, false);
  });
  buildZones();
  rebuildPile();
  // staff
  if (st.unlocked.cashier) addStaff('cashier');
  if (st.unlocked.stocker) addStaff('stocker');
  if (st.unlocked.register2) addStaff('stocker2');
  hud && hud.setLevel(L.name);
}

function buildLine(line, pop) {
  const st = S();
  // shelf: two-tier unit facing the shop floor (+z)
  const shelf = new THREE.Group();
  const base = rbox(1.9, 0.5, 0.8, 0.06, mat('#ffffff'));
  base.position.y = 0.25;
  const back = rbox(1.9, 1.5, 0.12, 0.04, mat(L.sign));
  back.position.set(0, 0.75, -0.36);
  const tier = rbox(1.85, 0.06, 0.6, 0.02, mat('#e5e5ee'));
  tier.position.set(0, 1.0, -0.06);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.32), new THREE.MeshBasicMaterial({ map: labelTex(PRODUCTS[line.id].icon + ' ' + fmt(priceOf(line.id))), transparent: true }));
  label.position.set(0, 1.42, -0.29);
  [base, back, tier].forEach((m) => { m.castShadow = m.receiveShadow = true; });
  shelf.add(base, back, tier, label);
  shelf.position.set(line.x, 0, -1.4);
  world.add(shelf);
  fixtures.push({ x0: line.x - 0.95, x1: line.x + 0.95, z0: -1.8, z1: -1.0 });
  line.shelf = { mesh: shelf, items: [], label, front: new THREE.Vector3(line.x, 0, -0.4), back: new THREE.Vector3(line.x, 0, -2.4) };
  // supply crate out back
  const crate = new THREE.Group();
  const pallet = rbox(1.3, 0.16, 1.0, 0.03, mat('#b08968'));
  pallet.position.y = 0.08;
  const box = rbox(1.2, 0.08, 0.9, 0.02, mat('#7f5539'));
  box.position.y = 0.2;
  pallet.castShadow = pallet.receiveShadow = true;
  crate.add(pallet, box);
  crate.position.set(line.x, 0, -5.6);
  world.add(crate);
  fixtures.push({ x0: line.x - 0.65, x1: line.x + 0.65, z0: -6.1, z1: -5.1 });
  line.supply = { mesh: crate, items: [], t: 0, stand: new THREE.Vector3(line.x, 0, -4.6) };
  if (st.stock['s' + line.i] === undefined) st.stock['s' + line.i] = line.i === 0 ? 3 : 0;
  if (st.stock['c' + line.i] === undefined) st.stock['c' + line.i] = SUPPLY_CAP;
  syncLineVisuals(line);
  if (pop) { shelf.scale.setScalar(0.01); crate.scale.setScalar(0.01); line.pop = 0; }
}

const labelCache = {};
function labelTex(text) {
  if (labelCache[text]) return labelCache[text];
  const t = canvasTex(320, 100, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 26); g.fill();
    g.fillStyle = '#2b2236'; g.font = '900 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
  labelCache[text] = t;
  return t;
}

function priceOf(id) {
  const st = S();
  const lv = st.lvl[id] || 0;
  return Math.round(PRODUCTS[id].price * (1 + lv * 0.5));
}

function syncLineVisuals(line) {
  const st = S();
  const want = st.stock['s' + line.i];
  const items = line.shelf.items;
  while (items.length < want) {
    const k = items.length;
    const m = productMesh(line.id);
    const tierIdx = k < 4 ? 0 : 1;
    m.position.set(-0.66 + (k % 4) * 0.44, tierIdx ? 1.03 : 0.5, -0.05);
    line.shelf.mesh.add(m);
    items.push(m);
  }
  while (items.length > want) line.shelf.mesh.remove(items.pop());
  const cw = st.stock['c' + line.i];
  const cit = line.supply.items;
  while (cit.length < cw) {
    const k = cit.length;
    const m = productMesh(line.id);
    m.position.set(-0.36 + (k % 3) * 0.36, 0.24 + Math.floor(k / 3) * 0.3, (k % 2) * 0.1 - 0.05);
    line.supply.mesh.add(m);
    cit.push(m);
  }
  while (cit.length > cw) line.supply.mesh.remove(cit.pop());
}

// ---------------------------------------------------------------------------
// Unlock zones: price circles on the floor
// ---------------------------------------------------------------------------
function zoneDefs() {
  const st = S();
  const defs = [];
  L.products.forEach((id, i) => {
    if (i === 0) return;
    defs.push({ key: 'line' + i, kind: 'line', i, cost: L.costs[i], icon: PRODUCTS[id].icon, name: PRODUCTS[id].name, pos: new THREE.Vector3(lineX(i), 0, -0.9), needs: i === 1 ? null : 'line' + (i - 1) });
  });
  defs.push({ key: 'cashier', kind: 'cashier', cost: L.cashier, icon: '🧑‍💼', name: 'Cashier', pos: new THREE.Vector3(6.8, 0, 5.5), needs: 'line1' });
  defs.push({ key: 'stocker', kind: 'stocker', cost: L.stocker, icon: '📦', name: 'Stocker', pos: new THREE.Vector3(-6.2, 0, 5.2), needs: L.products.length > 2 ? 'line2' : 'cashier' });
  defs.push({ key: 'arms', kind: 'arms', cost: L.arms, icon: '💪', name: '+2 carry', pos: new THREE.Vector3(-3.6, 0, 5.4), needs: 'cashier' });
  defs.push({ key: 'shoes', kind: 'shoes', cost: L.shoes, icon: '⚡', name: 'Fast shoes', pos: new THREE.Vector3(-1.2, 0, 4.0), needs: 'stocker' });
  if (L.register2) defs.push({ key: 'register2', kind: 'register2', cost: L.register2, icon: '🧺', name: '2nd stocker', pos: new THREE.Vector3(-6.2, 0, 2.6), needs: 'line3' });
  if (L.expand) {
    const next = LOCATIONS[save.loc + 1];
    defs.push({ key: 'expand', kind: 'expand', cost: L.expand, icon: '🏬', name: next.name, pos: new THREE.Vector3(1.6, 0, 5.6), needs: 'line3', once: save.owned[save.loc + 1] });
  }
  // endless: premium upgrades raise a product's price, once all lines are open
  L.products.forEach((id, i) => {
    const lv = st.lvl[id] || 0;
    if (lv >= 5) return;
    defs.push({ key: 'lvl' + i + '_' + lv, kind: 'lvl', i, id, cost: Math.round(L.costs[Math.max(1, i)] * 2.5 * Math.pow(2.2, lv) + PRODUCTS[id].price * 60), icon: '⭐', name: PRODUCTS[id].name + ' +50%', pos: new THREE.Vector3(lineX(i), 0, -3.0), needs: 'line3', repeat: true });
  });
  return defs;
}

const zoneRingGeo = new THREE.RingGeometry(0.72, 0.86, 48);
function buildZones() {
  zones.forEach((z) => world.remove(z.group));
  zones = [];
  const st = S();
  for (const d of zoneDefs()) {
    if (st.unlocked[d.key] || d.once) continue;
    if (d.needs && !st.unlocked[d.needs]) continue;
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.86, 40), new THREE.MeshBasicMaterial({ color: '#1b1640', transparent: true, opacity: 0.55, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    const ring = new THREE.Mesh(zoneRingGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    const fill = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.86, 48, 1, Math.PI / 2, 0.0001), new THREE.MeshBasicMaterial({ color: '#3ddc97', depthWrite: false }));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.002;
    const tex = canvasTex(256, 256, (cx, w, h) => {
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.font = '96px system-ui, sans-serif'; cx.fillText(d.icon, w / 2, h * 0.36);
      cx.font = '900 46px system-ui, sans-serif'; cx.fillStyle = '#ffe066'; cx.fillText(fmt(d.cost), w / 2, h * 0.68);
      cx.font = '800 26px system-ui, sans-serif'; cx.fillStyle = '#ffffff'; cx.fillText(d.name, w / 2, h * 0.86);
    });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    label.rotation.x = -Math.PI / 2;
    label.position.y = 0.004;
    g.add(disc, ring, fill, label);
    g.position.set(d.pos.x, 0.012, d.pos.z);
    world.add(g);
    zones.push({ ...d, group: g, fill, paid: st.paid[d.key] || 0, born: 0 });
  }
  updateProgress();
}

function setZoneFill(z) {
  const k = Math.min(1, z.paid / z.cost);
  z.fill.geometry.dispose();
  z.fill.geometry = new THREE.RingGeometry(0.72, 0.86, 48, 1, Math.PI / 2, -Math.max(0.0001, k * Math.PI * 2));
}

function completeZone(z) {
  const st = S();
  st.unlocked[z.key] = true;
  delete st.paid[z.key];
  sfx.fanfare();
  UI.buzz([20, 40, 20]);
  burst(z.pos.clone().setY(0.8), ['#ffd60a', '#3ddc97', '#ffffff', '#ff6fd8'], 30);
  if (z.kind === 'line') {
    const line = lines[z.i];
    line.unlocked = true;
    buildLine(line, true);
    UI.praise(PRODUCTS[line.id].icon + ' NEW AISLE!', '#7dffb2');
  } else if (z.kind === 'cashier') { addStaff('cashier'); UI.praise('CASHIER HIRED!', '#7dffb2'); }
  else if (z.kind === 'stocker') { addStaff('stocker'); UI.praise('STOCKER HIRED!', '#7dffb2'); }
  else if (z.kind === 'register2') { addStaff('stocker2'); UI.praise('2ND STOCKER!', '#7dffb2'); }
  else if (z.kind === 'arms') { save.carry += 2; UI.praise('CARRY +2!', '#7dffb2'); }
  else if (z.kind === 'shoes') { save.speed += 1; UI.praise('FASTER!', '#7dffb2'); }
  else if (z.kind === 'lvl') {
    st.lvl[z.id] = (st.lvl[z.id] || 0) + 1;
    delete st.unlocked[z.key];
    const line = lines[z.i];
    line.shelf.label.material.map = labelTex(PRODUCTS[z.id].icon + ' ' + fmt(priceOf(z.id)));
    UI.praise('PREMIUM ' + PRODUCTS[z.id].name.toUpperCase() + '!', '#ffd60a');
  } else if (z.kind === 'expand') {
    (save.stores[save.loc + 1] = save.stores[save.loc + 1] || {}).away = Date.now();
    save.owned[save.loc + 1] = true;
    persist(true);
    newStorePanel(save.loc + 1);
  }
  if (save.tutorial === 4 && z.key === 'line1') advanceTutorial();
  persist(true);
  buildZones();
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
const player = makePerson('#ff5a5f', { apron: '#ffffff', cap: '#ff5a5f', skin: '#ffd6b0', hair: '#2b2118' });
scene.add(player);
const P = { pos: new THREE.Vector3(0, 0, 4.5), vel: new THREE.Vector3(), carry: [], moving: false, tick: 0 };
const carryGroup = new THREE.Group();
carryGroup.position.set(0, 0.75, 0.42);
player.add(carryGroup);
function syncCarry(who, group, list) {
  while (group.children.length > list.length) group.remove(group.children[group.children.length - 1]);
  for (let k = group.children.length; k < list.length; k++) {
    const m = productMesh(list[k]);
    m.position.y = k * 0.26;
    group.add(m);
  }
}

function speedNow() { return BASE_SPEED * (1 + save.speed * 0.2); }

function collide(pos, r) {
  for (const f of fixtures) {
    const cx = Math.max(f.x0, Math.min(pos.x, f.x1));
    const cz = Math.max(f.z0, Math.min(pos.z, f.z1));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.0001;
      if (d2 === 0) { pos.z = f.z1 + r; continue; }
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
    }
  }
  pos.x = THREE.MathUtils.clamp(pos.x, -7.7, 7.7);
  pos.z = THREE.MathUtils.clamp(pos.z, -6.7, 8.6);
}

// ---------------------------------------------------------------------------
// Staff (NPC workers)
// ---------------------------------------------------------------------------
function addStaff(kind) {
  const colors = { cashier: '#3a86ff', stocker: '#2a9d8f', stocker2: '#f4a261' };
  const g = makePerson(colors[kind], { apron: '#ffffff', cap: colors[kind] });
  const s = { kind: kind === 'stocker2' ? 'stocker' : kind, g, pos: new THREE.Vector3(), carry: [], target: null, task: 'idle', wait: 0, path: [], tick: 0, group: new THREE.Group() };
  s.group.position.set(0, 0.75, 0.42);
  g.add(s.group);
  if (s.kind === 'cashier') s.pos.copy(CASHIER_SPOT);
  else s.pos.set(-5 + Math.random(), 0, 4);
  g.position.copy(s.pos);
  world.add(g);
  staff.push(s);
}

/** Route along the aisles: shop floor <-> stockroom go round the shelves. */
function routeTo(from, to) {
  const pts = [];
  const sideOf = (z) => (z < -2.0 ? 'back' : 'front');
  if (sideOf(from.z) !== sideOf(to.z)) {
    // cross through the nearest gap between shelves (x = lineX(i) + 1.35)
    const gaps = [-6.6, -2.9, 0, 2.9, 6.6];
    const gx = gaps.reduce((a, b) => (Math.abs(b - (from.x + to.x) / 2) < Math.abs(a - (from.x + to.x) / 2) ? b : a));
    const za = sideOf(from.z) === 'back' ? -2.6 : -0.3, zb = sideOf(from.z) === 'back' ? -0.3 : -2.6;
    pts.push(new THREE.Vector3(gx, 0, za), new THREE.Vector3(gx, 0, zb));
  }
  pts.push(to.clone());
  return pts;
}

function stepAlong(ent, dt, speed) {
  if (!ent.path.length) return true;
  const tgt = ent.path[0];
  const d = tgt.clone().sub(ent.pos).setY(0);
  const dist = d.length();
  if (dist < 0.08) { ent.path.shift(); return !ent.path.length; }
  ent.pos.addScaledVector(d.normalize(), Math.min(dist, speed * dt));
  ent.g.rotation.y = Math.atan2(d.x, d.z);
  return false;
}

function updateStaff(dt) {
  const st = S();
  for (const s of staff) {
    s.tick += dt;
    let moving = false;
    if (s.kind === 'cashier') {
      s.pos.lerp(CASHIER_SPOT, Math.min(1, dt * 4));
      s.g.rotation.y = -Math.PI / 2;
    } else {
      // stocker: refill the emptiest shelf
      if (s.task === 'idle') {
        const open = lines.filter((l) => l.unlocked);
        const need = open.map((l) => ({ l, k: st.stock['s' + l.i] / SHELF_CAP })).sort((a, b) => a.k - b.k)[0];
        if (need && need.k < 1) { s.line = need.l; s.task = 'toSupply'; s.path = routeTo(s.pos, need.l.supply.stand); }
      } else if (s.task === 'toSupply') {
        moving = true;
        if (stepAlong(s, dt, 2.6)) { s.task = 'loading'; s.wait = 0; }
      } else if (s.task === 'loading') {
        s.wait += dt;
        const cap = 4;
        if (s.wait > 0.25 && s.carry.length < cap && st.stock['c' + s.line.i] > 0) {
          s.wait = 0;
          st.stock['c' + s.line.i]--;
          s.carry.push(s.line.id);
          syncLineVisuals(s.line);
          syncCarry(s, s.group, s.carry);
        }
        if (s.carry.length >= cap || (s.wait > 2 && s.carry.length > 0)) { s.task = 'toShelf'; s.path = routeTo(s.pos, s.line.shelf.front); }
      } else if (s.task === 'toShelf') {
        moving = true;
        if (stepAlong(s, dt, 2.6)) { s.task = 'unloading'; s.wait = 0; }
      } else if (s.task === 'unloading') {
        s.wait += dt;
        if (s.wait > 0.2) {
          s.wait = 0;
          if (s.carry.length && st.stock['s' + s.line.i] < SHELF_CAP) {
            s.carry.pop();
            st.stock['s' + s.line.i]++;
            syncLineVisuals(s.line);
            syncCarry(s, s.group, s.carry);
          } else { s.carry.length = 0; syncCarry(s, s.group, s.carry); s.task = 'idle'; }
        }
      }
    }
    s.g.position.copy(s.pos);
    animateWalk(s.g, dt, moving, 2.6, s.carry.length > 0);
  }
}
const hasCashier = () => staff.some((s) => s.kind === 'cashier');

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
const SHIRTS = ['#ff9f1c', '#2ec4b6', '#e71d36', '#7209b7', '#3a86ff', '#ffbe0b', '#8338ec', '#06d6a0', '#ef476f'];
let spawnT = 2;
function bubbleTex(icon, n, mood) {
  return canvasTex(160, 110, (g, w, h) => {
    g.fillStyle = mood === 'angry' ? '#ff6b6b' : mood === 'happy' ? '#3ddc97' : '#ffffff';
    g.beginPath(); g.roundRect(6, 6, w - 12, h - 30, 22); g.fill();
    g.beginPath(); g.moveTo(w / 2 - 12, h - 26); g.lineTo(w / 2, h - 6); g.lineTo(w / 2 + 12, h - 26); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '48px system-ui, sans-serif';
    g.fillStyle = '#2b2236';
    g.fillText(mood === 'angry' ? '😡' : mood === 'happy' ? '💵' : icon, n > 1 && !mood ? w / 2 - 20 : w / 2, (h - 24) / 2 + 4);
    if (n > 1 && !mood) { g.font = '900 34px system-ui, sans-serif'; g.fillText('×' + n, w / 2 + 34, (h - 24) / 2 + 4); }
  });
}
function spawnCustomer() {
  const open = lines.filter((l) => l.unlocked);
  if (!open.length) return;
  const line = open[Math.floor(Math.random() * open.length)];
  const want = 1 + (Math.random() < 0.45 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0);
  const g = makePerson(SHIRTS[Math.floor(Math.random() * SHIRTS.length)]);
  const pos = DOOR.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, 1.4));
  g.position.copy(pos);
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex(PRODUCTS[line.id].icon, want), depthTest: false }));
  bubble.scale.set(0.9, 0.62, 1);
  bubble.position.y = 1.85;
  bubble.renderOrder = 10;
  g.add(bubble);
  const bag = new THREE.Group();
  bag.position.set(0.32, 0.45, 0.1);
  g.add(bag);
  world.add(g);
  // a free spot along the shelf front
  const slot = new THREE.Vector3(line.x + (Math.random() - 0.5) * 1.2, 0, line.shelf.front.z + 0.2 + Math.random() * 0.3);
  const c = { g, pos, line, want, got: 0, state: 'toShelf', path: [new THREE.Vector3(pos.x, 0, 5.0), slot], wait: 0, patience: 0, bubble, bag, tick: Math.random() * 5, pay: 0 };
  customers.push(c);
}
function setBubble(c, mood) {
  c.bubble.material.map.dispose();
  c.bubble.material.map = bubbleTex(PRODUCTS[c.line.id].icon, c.want - c.got, mood);
  c.bubble.material.needsUpdate = true;
}
function queueIndex(c) { return customers.filter((x) => x.state === 'queue' || x.state === 'serving').indexOf(c); }

let serveT = 0;
function updateCustomers(dt) {
  const st = S();
  const maxC = 3 + lines.filter((l) => l.unlocked).length * 2;
  spawnT -= dt;
  if (spawnT <= 0 && customers.length < maxC) { spawnCustomer(); spawnT = 2.2 + Math.random() * 2.2; }
  for (let i = customers.length - 1; i >= 0; i--) {
    const c = customers[i];
    c.tick += dt;
    let moving = false;
    if (c.state === 'toShelf') {
      moving = true;
      if (stepAlong(c, dt, 2.2)) { c.state = 'shopping'; c.wait = 0; c.g.rotation.y = Math.PI; }
    } else if (c.state === 'shopping') {
      c.wait += dt;
      c.patience += dt;
      if (c.wait > 0.45 && st.stock['s' + c.line.i] > 0) {
        c.wait = 0;
        st.stock['s' + c.line.i]--;
        c.got++;
        syncLineVisuals(c.line);
        const m = productMesh(c.line.id);
        m.scale.setScalar(0.7);
        m.position.set(0, c.bag.children.length * 0.18, 0);
        c.bag.add(m);
        setBubble(c);
        tone(700, 0, 0.04, 'sine', 0.05);
        if (c.got >= c.want) {
          c.state = 'queue';
          c.bubble.visible = false;
          c.patience = 0;
        }
      }
      if (c.patience > 28 && c.got === 0) {
        c.state = 'leaving';
        setBubble(c, 'angry');
        c.path = [new THREE.Vector3(c.pos.x, 0, 5), DOOR.clone().add(new THREE.Vector3(0, 0, 2))];
      }
    } else if (c.state === 'queue' || c.state === 'serving') {
      const qi = queueIndex(c);
      const spot = queuePos(qi);
      const d = spot.clone().sub(c.pos);
      if (d.length() > 0.08) { moving = true; c.pos.addScaledVector(d.normalize(), Math.min(d.length(), 2.2 * dt)); c.g.rotation.y = Math.atan2(d.x, d.z); }
      else c.g.rotation.y = Math.PI / 2;
      c.state = qi === 0 ? 'serving' : 'queue';
    } else if (c.state === 'leaving') {
      moving = true;
      if (stepAlong(c, dt, 2.4)) { world.remove(c.g); c.bubble.material.map.dispose(); customers.splice(i, 1); continue; }
    }
    c.g.position.copy(c.pos);
    animateWalk(c.g, dt, moving, 2.2);
  }
  // the register: the player at the till, or a hired cashier, serves the queue
  const head = customers.find((c) => c.state === 'serving' && c.pos.distanceTo(queuePos(0)) < 0.2);
  const playerAtTill = P.pos.distanceTo(CASHIER_SPOT) < 0.75;
  counter.userData.spot.material.color.set(playerAtTill || hasCashier() ? '#3ddc97' : '#ffffff');
  if (head && (playerAtTill || hasCashier())) {
    serveT += dt * (playerAtTill ? 1.6 : 1);
    if (serveT > 0.9) {
      serveT = 0;
      const amount = head.got * priceOf(head.line.id) * boostMult();
      st.pile += amount;
      save.served++;
      rebuildPile();
      setBubble(head, 'happy');
      head.bubble.visible = true;
      head.state = 'leaving';
      head.path = [new THREE.Vector3(3.6, 0, 5.4), DOOR.clone().add(new THREE.Vector3(0, 0, 2))];
      sfx.coin();
      tone(1046, 0.05, 0.08, 'square', 0.05);
      const s = toScreen(new THREE.Vector3(REG.x, 1.6, REG.z));
      UI.floatText('+' + fmt(amount), s.x, s.y, '#7dffb2');
      if (save.tutorial === 2) advanceTutorial();
    }
  } else serveT = Math.max(0, serveT - dt);
}
const boostMult = () => (Date.now() < save.boostUntil ? 2 : 1);

// cash pile beside the register
const billGeo = new THREE.BoxGeometry(0.34, 0.06, 0.18);
const billMat = mat('#57cc99', { roughness: 0.6 });
function rebuildPile() {
  pileMeshes.forEach((m) => world.remove(m));
  pileMeshes = [];
  const st = S();
  if (st.pile <= 0) return;
  const n = Math.min(36, Math.ceil(Math.log2(1 + st.pile) * 2.4));
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(billGeo, billMat);
    const col = k % 4, layer = Math.floor(k / 4);
    m.position.set(PILE.x + (col % 2) * 0.38 - 0.19, 0.04 + layer * 0.065, PILE.z + Math.floor(col / 2) * 0.22 - 0.11);
    m.rotation.y = (k * 0.37) % 0.3;
    m.castShadow = true;
    world.add(m);
    pileMeshes.push(m);
  }
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
const sparks = [];
const sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.02);
function burst(at, cols, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true }));
    m.position.copy(at);
    scene.add(m);
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3;
    sparks.push({ m, v: new THREE.Vector3(Math.cos(a) * s, 2.5 + Math.random() * 3, Math.sin(a) * s), life: 1.2, r: Math.random() * 8 });
  }
}
function fly(fromV, toV, mesh, dur = 0.28) {
  mesh.position.copy(fromV);
  scene.add(mesh);
  flyers.push({ m: mesh, a: fromV.clone(), b: toV.clone(), t: 0, dur });
}

const proj = new THREE.Vector3();
function toScreen(v) {
  proj.copy(v).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
}

// ---------------------------------------------------------------------------
// Player interactions
// ---------------------------------------------------------------------------
let actT = 0, payT = 0;
function interact(dt) {
  const st = S();
  actT += dt;
  const near = (v, r) => Math.hypot(P.pos.x - v.x, P.pos.z - v.z) < r;
  // pick up from crates
  for (const line of lines) {
    if (!line.unlocked) continue;
    if (near(line.supply.stand, 1.25) && actT > 0.13 && P.carry.length < save.carry && st.stock['c' + line.i] > 0) {
      actT = 0;
      st.stock['c' + line.i]--;
      P.carry.push(line.id);
      const src = line.supply.items[line.supply.items.length - 1];
      const from = new THREE.Vector3(); if (src) src.getWorldPosition(from); else from.copy(line.supply.stand);
      syncLineVisuals(line);
      fly(from, P.pos.clone().setY(1.2 + P.carry.length * 0.26), productMesh(line.id), 0.2);
      syncCarry(P, carryGroup, P.carry);
      tone(520 + P.carry.length * 40, 0, 0.05, 'triangle', 0.08);
      if (save.tutorial === 0) advanceTutorial();
    }
    // stock the shelf
    const idx = P.carry.lastIndexOf(line.id);
    if (idx >= 0 && (near(line.shelf.front, 1.35) || near(line.shelf.back, 1.2)) && actT > 0.11 && st.stock['s' + line.i] < SHELF_CAP) {
      actT = 0;
      P.carry.splice(idx, 1);
      st.stock['s' + line.i]++;
      syncCarry(P, carryGroup, P.carry);
      syncLineVisuals(line);
      const dst = line.shelf.items[line.shelf.items.length - 1];
      const to = new THREE.Vector3(); if (dst) dst.getWorldPosition(to);
      if (dst) { dst.visible = false; const m = productMesh(line.id); fly(P.pos.clone().setY(1.3), to, m, 0.22); setTimeout(() => { dst.visible = true; }, 230); }
      tone(760, 0, 0.05, 'sine', 0.08);
      if (save.tutorial === 1) advanceTutorial();
    }
  }
  // collect cash from the pile
  if (st.pile > 0 && near(PILE, 1.1)) {
    const amount = st.pile;
    st.pile = 0;
    rebuildPile();
    save.cash += amount;
    const s = toScreen(PILE.clone().setY(0.4));
    UI.coinBurst(s.x, s.y, Math.min(10, 3 + Math.floor(Math.log10(1 + amount) * 2)), hud.coinEl, (i) => { sfx.coin(i); hud.setCoins(fmt(save.cash), true); });
    UI.floatText('+' + fmt(amount), s.x, s.y - 30, '#ffe066');
    updateWorth();
    persist();
    if (save.tutorial === 3) advanceTutorial();
  }
  // pay into a zone
  payT += dt;
  const z = zones.find((zz) => near(zz.pos, 0.85));
  if (z && save.cash > 0 && payT > 0.05) {
    payT = 0;
    const rate = Math.max(1, z.cost * 0.022);
    const pay = Math.min(save.cash, z.cost - z.paid, rate);
    save.cash -= pay;
    z.paid += pay;
    st.paid[z.key] = z.paid;
    setZoneFill(z);
    hud.setCoins(fmt(save.cash));
    if (Math.random() < 0.5) { const b = new THREE.Mesh(billGeo, billMat); fly(P.pos.clone().setY(1.3), z.pos.clone().setY(0.1), b, 0.3); }
    tone(400 + (z.paid / z.cost) * 500, 0, 0.03, 'square', 0.03);
    if (z.paid >= z.cost - 0.001) completeZone(z);
    else persist();
  }
}

// ---------------------------------------------------------------------------
// Tutorial: a bouncing arrow over the next thing to do
// ---------------------------------------------------------------------------
const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 4), new THREE.MeshBasicMaterial({ color: '#ffd60a' }));
arrow.rotation.x = Math.PI;
scene.add(arrow);
const hintEl = document.createElement('div');
hintEl.className = 'mm-hint fs-stroke';
const HINTS = ['Walk to the crate to pick up apples', 'Bring them to the shelf', 'Stand at the register to serve', 'Grab your cash', 'Stand on the circle to unlock Milk'];
function tutorialTarget() {
  const l0 = lines[0];
  switch (save.tutorial) {
    case 0: return l0 && l0.supply.stand;
    case 1: return l0 && l0.shelf.front;
    case 2: return CASHIER_SPOT;
    case 3: return S().pile > 0 ? PILE : CASHIER_SPOT;
    case 4: { const z = zones.find((zz) => zz.key === 'line1'); return z && z.pos; }
    default: return null;
  }
}
function advanceTutorial() {
  save.tutorial++;
  sfx.good();
  persist();
}

// ---------------------------------------------------------------------------
// HUD + panels
// ---------------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .mm-worth { position:absolute; left:50%; top:calc(max(10px, env(safe-area-inset-top)) + 62px); transform:translateX(-50%);
    background:rgba(20,16,60,.55); color:#fff; border-radius:999px; padding:5px 14px; font:800 14px var(--font); pointer-events:none !important; white-space:nowrap; }
  .mm-worth b { color:#ffe066; }
  .mm-boost { color:#7dffb2; margin-left:8px; }
  .mm-hint { position:absolute; left:50%; bottom:calc(max(18px, env(safe-area-inset-bottom)) + 8px); transform:translateX(-50%); color:#fff;
    font:900 clamp(16px,4.6vw,22px) var(--font); white-space:nowrap; pointer-events:none !important; animation: fs-bob 1.2s ease-in-out infinite; }
  .mm-joy { position:fixed; width:110px; height:110px; margin:-55px 0 0 -55px; border-radius:50%; background:rgba(255,255,255,.18);
    box-shadow: inset 0 0 0 3px rgba(255,255,255,.4); pointer-events:none; z-index:5; display:none; }
  .mm-joy i { position:absolute; left:50%; top:50%; width:48px; height:48px; margin:-24px 0 0 -24px; border-radius:50%; background:rgba(255,255,255,.75); box-shadow:0 4px 10px rgba(0,0,0,.25); }
  .mm-map { display:grid; gap:10px; margin:8px 0 4px; }
  .mm-map button { display:flex; align-items:center; justify-content:space-between; gap:10px; border:0; border-radius:16px; padding:12px 14px; cursor:pointer;
    background:rgba(255,255,255,.1); color:#fff; font:800 15px var(--font); box-shadow: inset 0 0 0 2px rgba(255,255,255,.12); text-align:left; }
  .mm-map button.here { box-shadow: inset 0 0 0 2px #ffd60a; }
  .mm-map button:disabled { opacity:.5; cursor:default; }
  .mm-map small { display:block; opacity:.7; font-weight:700; font-size:12px; }
  .mm-map .tag { color:#ffe066; white-space:nowrap; font-size:13px; }
  @keyframes fs-bob { 0%,100% { transform:translate(-50%,0); } 50% { transform:translate(-50%,-6px); } }
`;
document.head.appendChild(css);
let hud = null, worthEl = null, joyEl = null;
function ensureHud() {
  if (hud) return;
  hud = UI.hud({
    coins: fmt(save.cash), level: L ? L.name : '',
    right: [UI.iconButton('❚❚', 'Pause', openPause), UI.iconButton('🗺️', 'Your stores', openMap), UI.iconButton('2×', 'Double cash', boost)],
  });
  const ui = document.getElementById('ui');
  worthEl = document.createElement('div');
  worthEl.className = 'mm-worth';
  ui.appendChild(worthEl);
  ui.appendChild(hintEl);
  joyEl = document.createElement('div');
  joyEl.className = 'mm-joy';
  joyEl.innerHTML = '<i></i>';
  document.body.appendChild(joyEl);
}

function netWorth() {
  let w = save.cash;
  LOCATIONS.forEach((loc, li) => {
    if (!save.owned[li]) return;
    const st = save.stores[li] || {};
    w += st.pile || 0;
    if (li > 0) w += LOCATIONS[li - 1].expand; // what you paid for the store
    const u = st.unlocked || {};
    loc.products.forEach((_, i) => { if (u['line' + i]) w += loc.costs[i]; });
    ['cashier', 'stocker', 'arms', 'shoes', 'register2'].forEach((k) => { if (u[k]) w += loc[k]; });
  });
  return w;
}
function updateWorth() {
  if (!worthEl) return;
  const boosting = Date.now() < save.boostUntil;
  const left = Math.ceil((save.boostUntil - Date.now()) / 1000);
  worthEl.innerHTML = 'Net worth <b>' + fmt(netWorth()) + '</b>' + (boosting ? '<span class="mm-boost">2× ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + '</span>' : '');
}
function updateProgress() {
  if (!hud || !L) return;
  const defs = zoneDefs().filter((d) => d.kind !== 'lvl');
  const st = S();
  const done = defs.filter((d) => st.unlocked[d.key] || d.once).length;
  hud.setProgress(done / defs.length);
}

/** Passive income per minute for a store that has a cashier and a stocker. */
function idleRate(li) {
  const st = save.stores[li] || {};
  const u = st.unlocked || {};
  if (!u.cashier || !u.stocker) return 0;
  const loc = LOCATIONS[li];
  let r = 0;
  loc.products.forEach((id, i) => {
    if (i === 0 || u['line' + i]) r += PRODUCTS[id].price * (1 + ((st.lvl || {})[id] || 0) * 0.5) * 1.6;
  });
  return r * (u.register2 ? 1.4 : 1) * 6; // ~6 sales a minute per aisle
}

function openMap() {
  if (state !== 'play') return;
  menuOpen = true;
  const box = document.createElement('div');
  box.className = 'mm-map';
  LOCATIONS.forEach((loc, li) => {
    const b = document.createElement('button');
    b.type = 'button';
    const owned = save.owned[li];
    const rate = idleRate(li);
    b.className = li === save.loc ? 'here' : '';
    b.innerHTML = '<span>' + (owned ? '🏪 ' : '🔒 ') + loc.name + '<small>' + (owned ? (rate ? 'Earns ' + fmt(rate) + '/min while you’re away' : 'Hire a cashier and a stocker to earn while away') : 'Buy it from the NEW STORE circle in ' + LOCATIONS[li - 1].name) + '</small></span><span class="tag">' + (li === save.loc ? 'You’re here' : owned ? 'Go ›' : '') + '</span>';
    b.disabled = !owned || li === save.loc;
    b.addEventListener('click', () => { p.close(); menuOpen = false; travel(li); });
    box.appendChild(b);
  });
  const p = UI.panel({
    title: 'Your stores', sub: 'Net worth ' + fmt(netWorth()), body: box,
    buttons: [UI.button('Close', () => { p.close(); menuOpen = false; }, { style: 'ghost', small: true })],
  });
}

let travels = 0;
function travel(li) {
  (save.stores[save.loc] || {}).away = Date.now();
  arriveAt(li);
  save.loc = li;
  persist(true);
  const go = () => {
    P.carry = []; syncCarry(P, carryGroup, P.carry);
    P.pos.set(0, 0, 5.5);
    buildStore();
    hud.setLevel(L.name);
    updateWorth();
    UI.praise(L.name.toUpperCase(), '#ffffff');
    sfx.whoosh();
  };
  travels++;
  if (travels % 2 === 0) YT.interstitial().then(go); else go();
}

function newStorePanel(li) {
  menuOpen = true;
  const loc = LOCATIONS[li];
  const p = UI.panel({
    title: 'New store! 🏬', gold: true,
    sub: 'You bought ' + loc.name + '. Hire a cashier and a stocker here so it keeps earning while you build the next one.',
    buttons: [
      UI.button('Go to ' + loc.name, () => { p.close(); menuOpen = false; travel(li); }, { style: 'green' }),
      UI.button('Stay here', () => { p.close(); menuOpen = false; }, { style: 'ghost', small: true }),
    ],
  });
}

function boost() {
  if (state !== 'play') return;
  menuOpen = true;
  const boosting = Date.now() < save.boostUntil;
  const p = UI.panel({
    title: '2× cash', sub: 'Every sale pays double for 3 minutes' + (boosting ? ' (stacks with your current boost)' : '') + '.',
    buttons: [
      UI.button('Watch ad', async () => {
        const ok = await YT.rewarded('double_cash');
        p.close(); menuOpen = false;
        if (!ok) return;
        save.boostUntil = Math.max(Date.now(), save.boostUntil) + BOOST_SECS * 1000;
        persist(true);
        sfx.fanfare();
        UI.praise('2× CASH!', '#ffe066');
        updateWorth();
      }, { style: 'gold', ad: true }),
      UI.button('Not now', () => { p.close(); menuOpen = false; }, { style: 'ghost', small: true }),
    ],
  });
}

function openPause() {
  if (state !== 'play') return;
  menuOpen = true;
  const p = UI.panel({
    title: 'Paused', sub: 'Served ' + save.served + ' customers',
    buttons: [
      UI.button('Resume', () => { p.close(); menuOpen = false; }, { style: 'green' }),
      UI.button(save.sound ? 'Sound: on' : 'Sound: off', (b) => { save.sound = !save.sound; b.lastChild.textContent = save.sound ? 'Sound: on' : 'Sound: off'; persist(); }, { style: 'ghost' }),
    ],
  });
}

// Staffed stores keep selling while you're elsewhere. Visiting a store adds
// what it made since you left to its cash pile; closing the game pays out
// half rate for every staffed store (capped) on your return.
function awayEarnings() {
  const now = Date.now();
  let total = 0;
  LOCATIONS.forEach((_, li) => {
    if (!save.owned[li]) return;
    const st = save.stores[li] || (save.stores[li] = {});
    const since = li === save.loc ? save.t || now : st.away || save.t || now;
    const mins = Math.min(OFFLINE_CAP_H * 60, Math.max(0, (now - since) / 60000));
    total += idleRate(li) * mins * 0.5;
    st.away = now;
  });
  return total;
}
function arriveAt(li) {
  const now = Date.now();
  const st = save.stores[li] || (save.stores[li] = {});
  if (st.away) {
    const mins = Math.min(OFFLINE_CAP_H * 60, Math.max(0, (now - st.away) / 60000));
    st.pile = (st.pile || 0) + idleRate(li) * mins;
  }
  st.away = now;
}

// ---------------------------------------------------------------------------
// Input: drag anywhere for a floating joystick (WASD / arrows too)
// ---------------------------------------------------------------------------
const joy = { on: false, id: 0, x0: 0, y0: 0, dx: 0, dy: 0 };
const keys = {};
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (paused || menuOpen || state !== 'play') return;
  Object.assign(joy, { on: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
  joyEl.style.display = 'block';
  joyEl.style.left = e.clientX + 'px';
  joyEl.style.top = e.clientY + 'px';
  joyEl.firstChild.style.transform = '';
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!joy.on || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.x0, dy = e.clientY - joy.y0;
  const d = Math.hypot(dx, dy), R = 44;
  if (d > R) { dx *= R / d; dy *= R / d; }
  joy.dx = dx / R; joy.dy = dy / R;
  joyEl.firstChild.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
});
const endJoy = (e) => { if (e.pointerId === joy.id) { joy.on = false; joy.dx = joy.dy = 0; joyEl.style.display = 'none'; } };
canvas.addEventListener('pointerup', endJoy);
canvas.addEventListener('pointercancel', endJoy);
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
let state = 'title', paused = false, menuOpen = false, time = 0;
const camPos = new THREE.Vector3(0, 14, 14);
const camLook = new THREE.Vector3();
let worthT = 0;
function update(dt) {
  time += dt;
  if (state === 'play') {
    // movement
    let mx = joy.dx, mz = joy.dy;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyW || keys.ArrowUp) mz -= 1;
    if (keys.KeyS || keys.ArrowDown) mz += 1;
    const m = Math.hypot(mx, mz);
    P.moving = m > 0.12;
    if (P.moving) {
      const k = Math.min(1, m);
      P.pos.x += (mx / m) * k * speedNow() * dt;
      P.pos.z += (mz / m) * k * speedNow() * dt;
      player.rotation.y = Math.atan2(mx, mz);
    }
    collide(P.pos, 0.38);
    P.tick += dt;
    interact(dt);
    updateCustomers(dt);
    updateStaff(dt);
    // supply crates restock themselves
    const st = S();
    for (const line of lines) {
      if (!line.unlocked) continue;
      if (st.stock['c' + line.i] < SUPPLY_CAP) {
        line.supply.t += dt;
        if (line.supply.t > PRODUCTS[line.id].regen) { line.supply.t = 0; st.stock['c' + line.i]++; syncLineVisuals(line); }
      }
      if (line.pop !== undefined) {
        line.pop = Math.min(1, line.pop + dt * 3);
        const s = 1 + Math.sin(line.pop * Math.PI) * 0.15 * (1 - line.pop);
        const e = line.pop < 1 ? THREE.MathUtils.smootherstep(line.pop, 0, 1) : 1;
        line.shelf.mesh.scale.setScalar(Math.max(0.01, e * s));
        line.supply.mesh.scale.setScalar(Math.max(0.01, e * s));
        if (line.pop >= 1) delete line.pop;
      }
    }
    // zones pulse
    zones.forEach((z) => { const s = 1 + Math.sin(time * 4 + z.pos.x) * 0.03; z.group.scale.set(s, 1, s); });
    // tutorial arrow
    const tgt = tutorialTarget();
    arrow.visible = !!tgt;
    hintEl.style.display = tgt ? '' : 'none';
    if (tgt) {
      arrow.position.set(tgt.x, 2.1 + Math.abs(Math.sin(time * 3.5)) * 0.4, tgt.z);
      arrow.rotation.y += dt * 2;
      hintEl.textContent = HINTS[save.tutorial] || '';
    }
    worthT += dt;
    if (worthT > 0.5) { worthT = 0; updateWorth(); }
  }
  player.position.copy(P.pos);
  animateWalk(player, dt, P.moving, speedNow(), P.carry.length > 0);
  // flyers
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i];
    f.t += dt / f.dur;
    const k = Math.min(1, f.t);
    f.m.position.lerpVectors(f.a, f.b, k);
    f.m.position.y += Math.sin(k * Math.PI) * 0.8;
    if (k >= 1) { scene.remove(f.m); flyers.splice(i, 1); }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    s.v.y -= 9 * dt;
    s.m.position.addScaledVector(s.v, dt);
    s.m.rotation.x += s.r * dt;
    s.m.material.opacity = Math.min(1, s.life * 2);
    if (s.life <= 0) { scene.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); }
  }
  // camera follows the player, angled down over the shop
  const dist = portrait ? 17.5 : 13;
  const tx = THREE.MathUtils.clamp(P.pos.x, portrait ? -3.5 : -2.5, portrait ? 3.5 : 2.5);
  const tz = THREE.MathUtils.clamp(P.pos.z, -3.5, 4.5);
  const look = state === 'title' ? new THREE.Vector3(0, 0, 0.5) : new THREE.Vector3(tx, 0, tz - 0.6);
  camLook.lerp(look, Math.min(1, dt * 4));
  camPos.lerp(new THREE.Vector3(camLook.x, dist * 0.92, camLook.z + dist * 0.62), Math.min(1, dt * 4));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  sun.target.position.copy(camLook);
  sun.position.copy(camLook).add(new THREE.Vector3(6, 14, 8));
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

YT.onPause(() => { paused = true; suspendAudio(); joy.on = false; joy.dx = joy.dy = 0; if (joyEl) joyEl.style.display = 'none'; save.t = Date.now(); YT.save(save); });
YT.onResume(() => { paused = false; last = performance.now(); resumeAudio(); });

function showTitle() {
  state = 'title';
  UI.titleScreen({
    line1: 'MINI MART', line2: 'EMPIRE 3D',
    tagline: 'Stock shelves, serve customers, buy new stores.',
    best: save.served ? 'Net worth ' + fmt(netWorth()) + ' · ' + save.owned.filter(Boolean).length + ' store' + (save.owned.filter(Boolean).length > 1 ? 's' : '') : 'Build a supermarket chain',
    playLabel: save.served ? 'CONTINUE' : 'OPEN SHOP',
    onPlay: start,
    extra: [UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true })],
  });
}

function start() {
  initAudio(() => save.sound);
  ensureHud();
  hud.show(true);
  hud.setLevel(L.name);
  hud.setCoins(fmt(save.cash));
  updateWorth();
  updateProgress();
  state = 'play';
  const awayMins = (Date.now() - (save.t || Date.now())) / 60000;
  const away = awayEarnings();
  if (away >= 10 && awayMins >= 1) {
    menuOpen = true;
    const p = UI.panel({
      title: 'Welcome back! 👋', gold: true,
      sub: 'Your staff kept the tills ringing while you were away.',
      body: '<div class="big">' + fmt(away) + '</div>',
      buttons: [
        UI.button('Collect ×2', async () => {
          const ok = await YT.rewarded('offline_double');
          p.close(); menuOpen = false;
          giveCash(away * (ok ? 2 : 1));
        }, { style: 'gold', ad: true }),
        UI.button('Collect', () => { p.close(); menuOpen = false; giveCash(away); }, { style: 'green' }),
      ],
    });
  } else if (away > 0) giveCash(away);
}
function giveCash(v) {
  save.cash += v;
  UI.coinBurst(window.innerWidth / 2, window.innerHeight / 2, 10, hud.coinEl, (i) => { sfx.coin(i); hud.setCoins(fmt(save.cash), true); });
  updateWorth();
  persist(true);
}

// read-only hook for automated play-tests
window.__mart = {
  info: () => {
    const st = S();
    const sp = (v) => toScreen(new THREE.Vector3(v.x, 0, v.z));
    return {
      state, loc: save.loc, cash: save.cash, worth: netWorth(), tutorial: save.tutorial, carry: P.carry.slice(), cap: save.carry, pile: st.pile,
      player: { x: P.pos.x, z: P.pos.z, screen: sp(P.pos) },
      lines: lines.map((l) => ({ id: l.id, unlocked: l.unlocked, shelf: st.stock['s' + l.i], crate: st.stock['c' + l.i], supply: l.supply && { x: l.supply.stand.x, z: l.supply.stand.z }, front: l.shelf && { x: l.shelf.front.x, z: l.shelf.front.z } })),
      zones: zones.map((z) => ({ key: z.key, cost: z.cost, paid: z.paid, x: z.pos.x, z: z.pos.z })),
      till: { x: CASHIER_SPOT.x, z: CASHIER_SPOT.z }, pileAt: { x: PILE.x, z: PILE.z },
      customers: customers.map((c) => c.state), staff: staff.map((s) => s.kind), served: save.served, owned: save.owned.slice(),
    };
  },
};

(async function boot() {
  YT.init('mini-mart');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  if (!Array.isArray(save.owned)) save.owned = [true, false, false];
  if (!Array.isArray(save.stores)) save.stores = [{}, {}, {}];
  // the first aisle is free
  const st0 = save.stores[0] || (save.stores[0] = {});
  st0.unlocked = st0.unlocked || {};
  st0.unlocked.line0 = true;
  LOCATIONS.forEach((_, li) => { const st = save.stores[li] || (save.stores[li] = {}); st.unlocked = st.unlocked || {}; if (save.owned[li]) st.unlocked.line0 = true; });
  resize();
  buildStore();
  camLook.set(0, 0, 0.5);
  showTitle();
  requestAnimationFrame(frame);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
