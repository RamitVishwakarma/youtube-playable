/*
 * Checkout Rush 3D — run the till. Customers unload groceries onto the
 * belt; tap each item to scan it, then take payment: tap the card reader,
 * or count out the right change from the drawer. Fast, accurate service
 * earns tips. Each day is a shift of customers; upgrade the store between
 * days.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const UPGRADES = [
  { id: 'belt', name: 'Faster belt', icon: '⚡', desc: 'Items arrive sooner' },
  { id: 'music', name: 'Store music', icon: '🎵', desc: 'Customers wait longer' },
  { id: 'jar', name: 'Tip jar', icon: '🫙', desc: 'Bigger tips' },
];
const MAX_UP = 8;
const upCost = (l) => Math.round(60 * Math.pow(1.55, l));
const DENOMS = [20, 10, 5, 1, 0.5, 0.1];

let save = { day: 1, coins: 0, up: { belt: 0, music: 0, jar: 0 }, sound: true, tutorial: false, served: 0, bestDay: 0 };
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
scene.background = new THREE.Color('#f5ead8');
scene.fog = new THREE.Fog('#f5ead8', 18, 40);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c7aa, 1.2));
const lamp = new THREE.DirectionalLight(0xffffff, 1.8);
lamp.position.set(3, 9, 4);
lamp.castShadow = true;
lamp.shadow.mapSize.set(1024, 1024);
Object.assign(lamp.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
scene.add(lamp);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  const portrait = camera.aspect < 1;
  camera.fov = portrait ? 60 : 46;
  // portrait needs to pull back to fit the belt, scanner and bag across the screen
  camera.position.set(portrait ? -0.2 : 0.3, portrait ? 6.8 : 5.6, portrait ? 8.6 : 7.0);
  camera.lookAt(portrait ? -0.3 : -0.1, portrait ? 0.9 : 1.2, -0.5);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// Store set
// ---------------------------------------------------------------------------
const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, o || {}));
const rbox = (w, h, d, r, m) => {
  const mesh = new THREE.Mesh(new THREE.RoundedBoxGeometry(w, h, d, 3, r), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
};
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat('#e9dcc5', { roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
// checkerboard tiles
(function tiles() {
  const g = new THREE.PlaneGeometry(1, 1);
  const m = mat('#dccbab', { roughness: 0.9 });
  const inst = new THREE.InstancedMesh(g, m, 400);
  const o = new THREE.Object3D();
  let k = 0;
  for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) {
    if ((x + z) % 2 || k >= 400) continue;
    o.position.set(x + 0.5, 0.005, z + 0.5);
    o.rotation.set(-Math.PI / 2, 0, 0);
    o.updateMatrix();
    inst.setMatrixAt(k++, o.matrix);
  }
  inst.count = k;
  inst.receiveShadow = true;
  scene.add(inst);
})();
// counter + belt (belt runs along x, toward the scanner at x≈0.6)
const counter = rbox(6.6, 1.0, 1.8, 0.08, mat('#3d5a80'));
counter.position.set(-0.4, 0.5, 0);
scene.add(counter);
const counterTop = rbox(6.8, 0.12, 2.0, 0.04, mat('#f2f4f8', { roughness: 0.3 }));
counterTop.position.set(-0.4, 1.06, 0);
scene.add(counterTop);
const beltTex = (() => {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2d36'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3a3d48'; g.fillRect(0, 0, 8, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const belt = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.06, 1.2), mat('#ffffff', { map: beltTex, roughness: 0.8 }));
belt.position.set(-1.25, 1.14, 0.1);
belt.receiveShadow = true;
scene.add(belt);
// scanner glass
const scanner = rbox(0.9, 0.08, 1.0, 0.03, mat('#1b263b', { roughness: 0.15, metalness: 0.4 }));
scanner.position.set(0.6, 1.15, 0.1);
scene.add(scanner);
const scanGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.75), new THREE.MeshBasicMaterial({ color: '#ff2d55', transparent: true, opacity: 0.35 }));
scanGlow.rotation.x = -Math.PI / 2;
scanGlow.position.set(0.6, 1.2, 0.1);
scene.add(scanGlow);
// bagging area
const bagArea = rbox(1.6, 0.06, 1.4, 0.03, mat('#cfd8e3'));
bagArea.position.set(2.0, 1.15, 0.1);
scene.add(bagArea);
const bag = new THREE.Group();
const bagBody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.7, 16, 1, true), mat('#c79a5b', { side: THREE.DoubleSide, roughness: 0.9 }));
bagBody.position.y = 0.35;
bagBody.castShadow = true;
bag.add(bagBody);
bag.position.set(2.0, 1.18, 0.1);
scene.add(bag);
// register screen (canvas texture) on a stand facing the camera
const regCanvas = document.createElement('canvas');
regCanvas.width = 512; regCanvas.height = 256;
const regTex = new THREE.CanvasTexture(regCanvas);
regTex.colorSpace = THREE.SRGBColorSpace;
const register = new THREE.Group();
const regBody = rbox(1.4, 0.8, 0.2, 0.06, mat('#22223b'));
const regScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.62), new THREE.MeshBasicMaterial({ map: regTex }));
regScreen.position.z = 0.11;
const regStand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), mat('#888'));
regStand.position.y = -0.6;
register.add(regBody, regScreen, regStand);
register.position.set(1.2, 2.25, 0.85);
register.rotation.x = -0.25;
scene.add(register);
function drawRegister(total, msg, color) {
  const g = regCanvas.getContext('2d');
  g.fillStyle = '#0b132b';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#5bc0be';
  g.font = '800 34px system-ui, Segoe UI, Roboto, Arial, sans-serif';
  g.fillText(msg || 'TOTAL', 28, 64);
  g.fillStyle = color || '#fdfffc';
  g.font = '900 104px system-ui, Segoe UI, Roboto, Arial, sans-serif';
  g.fillText('$' + total.toFixed(2), 28, 196);
  regTex.needsUpdate = true;
}
drawRegister(0, 'WELCOME');
// card reader
const reader = new THREE.Group();
const readerBody = rbox(0.42, 0.14, 0.62, 0.05, mat('#2b2d42'));
const readerScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), new THREE.MeshBasicMaterial({ color: '#3ddc97' }));
readerScreen.rotation.x = -Math.PI / 2;
readerScreen.position.set(0, 0.075, -0.12);
reader.add(readerBody, readerScreen);
reader.position.set(1.4, 1.2, -0.62);
reader.rotation.y = -0.3;
reader.userData.tap = 'reader';
readerBody.userData.tap = 'reader';
scene.add(reader);
// shelves in the background
(function shelves() {
  const colors = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f1c'];
  for (let s = 0; s < 4; s++) {
    const g = new THREE.Group();
    const frame = rbox(3.2, 2.6, 0.8, 0.05, mat('#f8f9fa'));
    frame.position.y = 1.3;
    g.add(frame);
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 7; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.3), mat(colors[(s * 3 + r + k) % colors.length]));
        b.position.set(-1.3 + k * 0.43, 0.5 + r * 0.8, 0.3);
        g.add(b);
      }
    }
    g.position.set(-7 + s * 3.7, 0, -6.5);
    scene.add(g);
  }
})();

// ---------------------------------------------------------------------------
// Products (procedural)
// ---------------------------------------------------------------------------
const PRODUCTS = [
  { name: 'Apple', price: 0.6, make: () => fruit('#e63946', 0.22) },
  { name: 'Orange', price: 0.7, make: () => fruit('#ff9f1c', 0.24) },
  { name: 'Milk', price: 1.9, make: () => carton('#ffffff', '#3a86ff') },
  { name: 'Juice', price: 2.4, make: () => carton('#ffd166', '#ef476f') },
  { name: 'Cereal', price: 3.5, make: () => box('#ffb703', '#fb8500', 0.55, 0.75, 0.2) },
  { name: 'Cookies', price: 2.2, make: () => box('#8338ec', '#ff006e', 0.6, 0.35, 0.25) },
  { name: 'Soda', price: 1.2, make: () => can('#e63946') },
  { name: 'Water', price: 0.9, make: () => bottle('#90e0ef') },
  { name: 'Bread', price: 2.8, make: () => loaf() },
  { name: 'Melon', price: 4.5, make: () => melon() },
  { name: 'Cheese', price: 3.2, make: () => cheese() },
  { name: 'Eggs', price: 2.6, make: () => box('#f1faee', '#a8dadc', 0.6, 0.18, 0.35) },
];
function fruit(color, r) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat(color, { roughness: 0.35 }));
  b.position.y = r;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1), mat('#6b4226'));
  stem.position.y = r * 2;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 4), mat('#2d6a4f'));
  leaf.scale.set(1.4, 0.3, 0.8);
  leaf.position.set(0.05, r * 2, 0);
  g.add(b, stem, leaf);
  return g;
}
function labelTex(bg, fg) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 64, 64);
  x.fillStyle = fg; x.fillRect(0, 24, 64, 18);
  x.beginPath(); x.arc(32, 33, 12, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function box(bg, fg, w, h, d) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: labelTex(bg, fg), roughness: 0.6 }));
  m.position.y = h / 2;
  g.add(m);
  return g;
}
function carton(bg, fg) {
  const g = box(bg, fg, 0.3, 0.55, 0.3);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 4), mat(bg));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.63;
  g.add(roof);
  return g;
}
function can(color) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 18), mat(color, { metalness: 0.5, roughness: 0.3 }));
  c.position.y = 0.18;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.03, 18), mat('#ced4da', { metalness: 0.8, roughness: 0.2 }));
  top.position.y = 0.37;
  g.add(c, top);
  return g;
}
function bottle(color) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.5, 16), mat(color, { transparent: true, opacity: 0.75, roughness: 0.1 }));
  b.position.y = 0.25;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.1, 0.16, 12), mat(color, { transparent: true, opacity: 0.75, roughness: 0.1 }));
  neck.position.y = 0.58;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12), mat('#1d3557'));
  cap.position.y = 0.68;
  g.add(b, neck, cap);
  return g;
}
function loaf() {
  const g = new THREE.Group();
  const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.36, 6, 12), mat('#d4a373', { roughness: 0.9 }));
  l.rotation.z = Math.PI / 2;
  l.scale.set(1, 1, 0.85);
  l.position.y = 0.15;
  g.add(l);
  return g;
}
function melon() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), mat('#52b788', { roughness: 0.5 }));
  m.scale.set(1.1, 0.9, 0.95);
  m.position.y = 0.29;
  g.add(m);
  return g;
}
function cheese() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(0.5, 0); shape.lineTo(0, 0.32); shape.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
  const m = new THREE.Mesh(geo, mat('#ffd166', { roughness: 0.7 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(-0.25, 0, 0.11);
  g.add(m);
  return g;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
const SKIN = ['#ffd6a5', '#e0a878', '#a86b45', '#6b4226'];
const SHIRTS = ['#ef476f', '#118ab2', '#06d6a0', '#ffd166', '#8338ec', '#ff7f50', '#3a86ff', '#fb5607'];
function makeCustomer() {
  const g = new THREE.Group();
  const shirt = mat(SHIRTS[(Math.random() * SHIRTS.length) | 0]);
  const skin = mat(SKIN[(Math.random() * SKIN.length) | 0]);
  const pants = mat(['#22223b', '#3d5a80', '#6c584c', '#495057'][(Math.random() * 4) | 0]);
  const torso = rbox(0.75, 0.9, 0.45, 0.18, shirt);
  torso.position.y = 1.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 20, 14), skin);
  head.position.y = 2.32;
  head.castShadow = true;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(['#2b2118', '#6f4e37', '#e9c46a', '#d62828', '#111'][(Math.random() * 5) | 0]));
  hair.position.y = 2.36;
  const eyes = [-0.11, 0.11].map((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat('#111')); e.position.set(x, 2.36, 0.3); return e; });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12, Math.PI), mat('#7a1f2b'));
  mouth.position.set(0, 2.22, 0.31);
  mouth.rotation.z = Math.PI;
  const legs = [-0.18, 0.18].map((x) => { const l = rbox(0.26, 1.0, 0.3, 0.1, pants); l.position.set(x, 0.55, 0); return l; });
  const arms = [-0.5, 0.5].map((x) => { const a = rbox(0.2, 0.8, 0.22, 0.09, shirt); a.position.set(x, 1.5, 0); return a; });
  g.add(torso, head, hair, ...eyes, mouth, ...legs, ...arms);
  // patience ring above the head
  const ringBg = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthTest: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 32, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: '#3ddc97', depthTest: false }));
  ringBg.position.y = ring.position.y = 2.95;
  ringBg.renderOrder = ring.renderOrder = 5;
  g.add(ringBg, ring);
  return { g, mouth, legs, arms, ring, ringBg, shirt, skin };
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
let state = 'title'; // title | day | summary
let paused = false, menuOpen = false;
let time = 0;
let queue = [];         // customers waiting / walking
let current = null;     // customer at the till
let items = [];         // items on the belt for the current customer
let flyers = [];        // items flying to the bag
let dayStats = null;
let hud = null, stopHand = null, changeUI = null;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let customersToday = 0, spawned = 0;
let leaving = []; // customers walking out of the store

const TILL = new THREE.Vector3(0.2, 0, -1.6);

function dayLength(d) { return Math.min(14, 5 + d); }

function startDay() {
  initAudio(() => save.sound);
  ensureHud();
  hud.show(true);
  hud.setLevel('Day ' + save.day);
  hud.setCoins(save.coins);
  hud.setProgress(0);
  clearCustomers();
  customersToday = dayLength(save.day);
  spawned = 0;
  dayStats = { served: 0, tips: 0, earned: 0, perfect: 0, angry: 0 };
  state = 'day';
  for (let i = 0; i < Math.min(3, customersToday); i++) spawnCustomer(i);
}

function clearCustomers() {
  queue.forEach((c) => scene.remove(c.model.g));
  if (current) scene.remove(current.model.g);
  items.forEach((it) => scene.remove(it.mesh));
  flyers.forEach((f) => scene.remove(f.mesh));
  leaving.forEach((c) => scene.remove(c.model.g));
  queue = []; current = null; items = []; flyers = []; leaving = [];
  if (changeUI) { changeUI.remove(); changeUI = null; }
}

function spawnCustomer(slot) {
  if (spawned >= customersToday) return;
  spawned++;
  const model = makeCustomer();
  model.g.position.set(-6 - slot * 1.6, 0, -1.8);
  model.g.rotation.y = Math.PI / 2;
  scene.add(model.g);
  const n = Math.min(9, 2 + Math.floor(Math.random() * (2 + save.day * 0.5)));
  const basket = Array.from({ length: n }, () => PRODUCTS[(Math.random() * PRODUCTS.length) | 0]);
  const patienceMax = 26 + save.up.music * 3 + n * 2.5;
  queue.push({ model, basket, patience: patienceMax, patienceMax, state: 'walking', target: null, pay: Math.random() < 0.5 ? 'card' : 'cash', total: 0 });
}

function queueTargets() {
  queue.forEach((c, i) => { c.target = new THREE.Vector3(TILL.x - 1.4 - i * 1.3, 0, TILL.z - 0.2); });
}

function callNext() {
  if (current || !queue.length) return;
  current = queue.shift();
  current.state = 'toTill';
  current.target = TILL.clone();
  queueTargets();
  spawnCustomer(queue.length);
  queueTargets();
}

function unloadBasket(c) {
  c.total = 0;
  c.scanned = 0;
  const spacing = 0.8;
  c.basket.forEach((p, i) => {
    const mesh = p.make();
    mesh.traverse((o) => { o.castShadow = true; o.userData.item = true; });
    // items are put down on the start of the belt one after another
    mesh.position.set(-2.55, 1.7, 0.1 + (Math.random() - 0.5) * 0.3);
    mesh.scale.setScalar(1.35); // a little larger than life so they're easy to tap
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.visible = false;
    scene.add(mesh);
    const it = { mesh, product: p, delay: i * (spacing / (0.9 + save.up.belt * 0.18)), scanned: false };
    mesh.traverse((o) => { o.userData.itemRef = it; });
    items.push(it);
  });
  drawRegister(0, c.basket.length + ' ITEMS');
  if (!save.tutorial && !stopHand) {
    stopHand = UI.tutorialHand(() => {
      const it = items.find((x) => !x.scanned);
      if (!it) return [[0, 0], [0, 0]];
      const p = toScreen(it.mesh.position.clone().add(new THREE.Vector3(0, 0.3, 0)));
      return [[p.x, p.y + 30], [p.x, p.y]];
    }, 'Tap items to scan them');
  }
}

const proj = new THREE.Vector3();
function toScreen(v) {
  proj.copy(v).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
}

function scan(it) {
  if (it.scanned) return;
  it.scanned = true;
  current.total = Math.round((current.total + it.product.price) * 100) / 100;
  current.scanned++;
  // fly over the scanner into the bag
  flyers.push({ mesh: it.mesh, t: 0, from: it.mesh.position.clone(), via: new THREE.Vector3(0.6, 1.7, 0.1), to: new THREE.Vector3(2.0 + (Math.random() - 0.5) * 0.3, 1.5, 0.1) });
  items = items.filter((x) => x !== it);
  tone(1760, 0, 0.09, 'square', 0.07);
  scanGlow.material.color.set('#3ddc97');
  scanGlow.material.opacity = 0.8;
  UI.buzz(6);
  const s = toScreen(new THREE.Vector3(0.6, 1.9, 0.1));
  UI.floatText('$' + it.product.price.toFixed(2), s.x, s.y, '#ffffff');
  drawRegister(current.total, it.product.name.toUpperCase());
  if (stopHand) { stopHand(); stopHand = null; }
  if (current.scanned === current.basket.length) setTimeout(askPayment, 450);
}

function askPayment() {
  if (!current) return;
  current.state = 'paying';
  drawRegister(current.total, current.pay === 'card' ? 'TAP CARD' : 'CASH');
  if (current.pay === 'card') {
    readerScreen.material.color.set('#ffd60a');
    UI.floatText('💳 Tap the card reader', window.innerWidth / 2, window.innerHeight * 0.55, '#ffffff');
  } else {
    showChangeUI();
  }
}

function cashGiven(total) {
  const notes = [5, 10, 20, 50, 100];
  const n = notes.find((v) => v > total + 0.001) || 100;
  return n; // the smallest note that covers the total
}

function showChangeUI() {
  const given = cashGiven(current.total);
  const due = Math.round((given - current.total) * 100) / 100;
  current.given = given;
  current.due = due;
  let giving = [];
  const box = document.createElement('div');
  box.className = 'cr-change';
  const sum = () => Math.round(giving.reduce((a, b) => a + b, 0) * 100) / 100;
  box.innerHTML =
    '<div class="cr-row"><span>Paid</span><b>$' + given.toFixed(2) + '</b></div>' +
    '<div class="cr-row"><span>Total</span><b>$' + current.total.toFixed(2) + '</b></div>' +
    '<div class="cr-row due"><span>Change due</span><b>$' + due.toFixed(2) + '</b></div>' +
    '<div class="cr-row give"><span>Giving</span><b class="g">$0.00</b></div>' +
    '<div class="cr-denoms"></div>' +
    '<div class="cr-actions"></div>';
  const dEl = box.querySelector('.cr-denoms');
  const g = box.querySelector('.g');
  const refresh = () => {
    const s = sum();
    g.textContent = '$' + s.toFixed(2);
    g.style.color = Math.abs(s - due) < 0.001 ? '#3ddc97' : s > due ? '#ff8fa3' : '#ffffff';
    giveBtn.disabled = s + 0.001 < due;
  };
  DENOMS.forEach((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cr-denom ' + (v >= 1 ? 'note' : 'coin');
    b.textContent = v >= 1 ? '$' + v : (v * 100).toFixed(0) + '¢';
    b.addEventListener('click', () => { giving.push(v); sfx.coin(giving.length); refresh(); });
    dEl.appendChild(b);
  });
  const actions = box.querySelector('.cr-actions');
  const undo = UI.button('↶ Undo', () => { giving.pop(); refresh(); }, { style: 'ghost', small: true });
  const giveBtn = UI.button('Give change', () => finishCash(sum()), { style: 'green', small: true });
  actions.appendChild(undo);
  actions.appendChild(giveBtn);
  document.getElementById('ui').appendChild(box);
  changeUI = box;
  refresh();
}

function finishCash(givenChange) {
  if (changeUI) { changeUI.remove(); changeUI = null; }
  const exact = Math.abs(givenChange - current.due) < 0.001;
  const over = givenChange - current.due;
  serve(exact ? 'perfect' : over > 0 ? 'over' : 'short', over);
}

function serve(quality, overpay) {
  const c = current;
  const speed = c.patience / c.patienceMax;
  let tip = 0;
  const jar = 1 + save.up.jar * 0.25;
  if (quality === 'perfect' || quality === 'card') tip = Math.round((1 + speed * 4) * jar);
  if (quality === 'over') tip = 0;
  const earn = Math.round(c.total) + tip - (quality === 'over' ? Math.ceil(overpay) : 0);
  dayStats.served++;
  dayStats.tips += tip;
  dayStats.earned += Math.max(0, earn);
  if (quality === 'perfect' || quality === 'card') { if (speed > 0.5) dayStats.perfect++; }
  const s = toScreen(c.model.g.position.clone().add(new THREE.Vector3(0, 2.8, 0)));
  if (tip > 0) {
    UI.floatText('+' + tip + ' tip!', s.x, s.y, '#ffe066');
    sfx.good();
    setMood(c, 'happy');
    if (speed > 0.7) UI.praise(['SUPER FAST!', 'EXCELLENT!', 'PERFECT SERVICE!'][dayStats.served % 3], '#7dffb2');
  } else {
    UI.floatText(quality === 'over' ? 'Too much change!' : 'Hmm…', s.x, s.y, '#ff8fa3');
    sfx.bad();
    setMood(c, 'sad');
  }
  UI.coinBurst(s.x, s.y, Math.min(8, 2 + tip), hud.coinEl, (i) => { sfx.coin(i); });
  save.coins += Math.max(0, earn);
  save.served += 1;
  hud.setCoins(save.coins, true);
  persist();
  drawRegister(c.total, 'THANK YOU!', '#3ddc97');
  readerScreen.material.color.set('#3ddc97');
  leave(c);
}

function leave(c) {
  c.state = 'leaving';
  c.target = new THREE.Vector3(6, 0, -1.6);
  leaving.push(c);
  current = null;
  hud.setProgress(dayStats.served / customersToday);
  setTimeout(() => {
    if (state !== 'day') return;
    if (dayStats.served + dayStats.angry >= customersToday) endDay();
    else callNext();
  }, 700);
}

function setMood(c, mood) {
  c.model.mouth.rotation.z = mood === 'happy' ? Math.PI : 0;
  c.model.mouth.position.y = mood === 'happy' ? 2.22 : 2.18;
}

function walkOut(c) {
  // ran out of patience
  dayStats.angry++;
  setMood(c, 'sad');
  sfx.bad();
  UI.hitFlash();
  const s = toScreen(c.model.g.position.clone().add(new THREE.Vector3(0, 2.8, 0)));
  UI.floatText('😠 Too slow!', s.x, s.y, '#ff8fa3');
  if (c === current) {
    items.forEach((it) => scene.remove(it.mesh));
    items = [];
    if (changeUI) { changeUI.remove(); changeUI = null; }
    readerScreen.material.color.set('#3ddc97');
    drawRegister(0, 'NEXT PLEASE');
    leave(c);
  } else {
    queue = queue.filter((q) => q !== c);
    c.state = 'leaving';
    c.target = new THREE.Vector3(-8, 0, -4);
    leaving.push(c);
    queueTargets();
    spawnCustomer(queue.length);
    queueTargets();
    hud.setProgress(dayStats.served / customersToday);
    if (dayStats.served + dayStats.angry >= customersToday && !current) endDay();
  }
}

function endDay() {
  if (state !== 'day') return;
  state = 'summary';
  const stars = dayStats.angry === 0 ? (dayStats.perfect >= customersToday * 0.6 ? 3 : 2) : dayStats.angry <= 1 ? 1 : 0;
  const bonus = 20 + stars * 15 + save.day * 5;
  sfx.fanfare();
  setTimeout(() => {
    const body = document.createElement('div');
    body.innerHTML = UI.starsHtml(stars) +
      '<div class="sub">Served ' + dayStats.served + ' · Tips ' + dayStats.tips + ' · Walk-outs ' + dayStats.angry + '</div>' +
      '<div class="sub">Day bonus</div><div class="reward"><span class="fs-coin" style="position:static;margin:0"></span><b>0</b></div>';
    UI.countUp(body.querySelector('.reward b'), 0, bonus, 700);
    const advance = stars >= 1;
    const collect = (mult, p) => {
      p.close();
      const gained = bonus * mult;
      UI.coinBurst(window.innerWidth / 2, window.innerHeight / 2, 10, hud.coinEl, (i) => { sfx.coin(i); hud.setCoins(Math.round(save.coins - gained + gained * (i + 1) / 10), true); });
      save.coins += gained;
      if (advance) { save.day += 1; save.bestDay = Math.max(save.bestDay, save.day - 1); }
      persist(true);
      YT.sendScore(save.served);
      setTimeout(() => {
        hud.setCoins(save.coins);
        const next = () => showTitle();
        if (save.day % 2 === 0) YT.interstitial().then(next); else next();
      }, 1000);
    };
    const p = UI.panel({
      title: advance ? 'Day ' + save.day + ' done!' : 'Rough day…', gold: advance, body,
      sub: advance ? '' : 'Keep walk-outs to 1 or fewer to open the next day',
      buttons: [
        UI.button('Claim ×3', async () => { if (await YT.rewarded('triple_coins')) collect(3, p); }, { style: 'gold', ad: true }),
        UI.button('Continue', () => collect(1, p), { style: 'green' }),
      ],
    });
  }, 800);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .cr-change { position:absolute; left:50%; bottom:max(12px, env(safe-area-inset-bottom)); transform:translateX(-50%); width:min(380px, calc(100% - 20px));
    background: linear-gradient(180deg, var(--panel-1), var(--panel-2)); border-radius:22px; padding:12px 14px; color:#fff; font:800 15px var(--font);
    box-shadow: inset 0 0 0 2px rgba(255,255,255,.16), 0 20px 40px rgba(0,0,0,.35); animation: fs-pop .3s cubic-bezier(.2,1.5,.4,1); }
  .cr-row { display:flex; justify-content:space-between; padding:2px 4px; }
  .cr-row.due b { color:#ffe066; font-size:19px; }
  .cr-row.give b { font-size:19px; }
  .cr-denoms { display:grid; grid-template-columns: repeat(6, 1fr); gap:6px; margin:10px 0; }
  .cr-denom { appearance:none; border:0; cursor:pointer; font:900 14px var(--font); padding:12px 0; border-radius:12px; }
  .cr-denom.note { background: linear-gradient(180deg, #b7efc5, #6ede8a); color:#0b3d20; box-shadow: 0 3px 0 #2d6a4f; }
  .cr-denom.coin { background: radial-gradient(circle at 35% 30%, #fff6b0, #ffd60a 50%, #e09b00); color:#5a3500; border-radius:999px; box-shadow: 0 3px 0 #a86b00; }
  .cr-denom:active { transform: translateY(2px); }
  .cr-actions { display:flex; gap:8px; justify-content:space-between; }
  .cr-actions .fs-btn { flex:1; min-width:0; }
  .cr-garage { display:grid; gap:10px; margin-top:8px; }
  .cr-garage button { display:flex; align-items:center; justify-content:space-between; gap:10px; border:0; border-radius:16px; padding:12px 14px; cursor:pointer;
    background:rgba(255,255,255,.1); color:#fff; font:800 15px var(--font); box-shadow: inset 0 0 0 2px rgba(255,255,255,.12); text-align:left; }
  .cr-garage button:disabled { opacity:.5; cursor:default; }
  .cr-garage .price { color:#ffe066; white-space:nowrap; }
`;
document.head.appendChild(css);

function ensureHud() {
  if (hud) return;
  hud = UI.hud({ coins: save.coins, level: 'Day 1', right: [UI.iconButton('❚❚', 'Pause', openPause)] });
}

function showTitle() {
  state = 'title';
  if (hud) hud.show(false);
  clearCustomers();
  drawRegister(0, 'WELCOME');
  UI.titleScreen({
    line1: 'CHECKOUT', line2: 'RUSH 3D',
    tagline: 'Scan fast, count change right, collect the tips.',
    best: 'Day ' + save.day + (save.served ? ' · ' + save.served + ' customers served' : ''),
    playLabel: 'OPEN STORE',
    onPlay: startDay,
    extra: [
      UI.button('🛠️ Upgrades', openUpgrades, { style: 'blue', small: true }),
      UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true }),
    ],
  });
}

function openPause() {
  if (state !== 'day') return;
  menuOpen = true;
  const p = UI.panel({
    title: 'Paused',
    buttons: [
      UI.button('Resume', () => { p.close(); menuOpen = false; }, { style: 'green' }),
      UI.button('Restart day', () => { p.close(); menuOpen = false; startDay(); }),
      UI.button(save.sound ? 'Sound: on' : 'Sound: off', (b) => { save.sound = !save.sound; b.lastChild.textContent = save.sound ? 'Sound: on' : 'Sound: off'; persist(); }, { style: 'ghost' }),
      UI.button('Close store', () => { p.close(); menuOpen = false; showTitle(); }, { style: 'ghost', small: true }),
    ],
  });
}

function openUpgrades() {
  let p = null;
  const render = () => {
    if (p) p.close();
    const box = document.createElement('div');
    box.className = 'cr-garage';
    UPGRADES.forEach((u) => {
      const lvl = save.up[u.id];
      const cost = upCost(lvl);
      const maxed = lvl >= MAX_UP;
      const b = document.createElement('button');
      b.type = 'button';
      // can't afford it: offer the upgrade for watching an ad instead
      const viaAd = !maxed && save.coins < cost;
      b.disabled = maxed;
      b.innerHTML = '<span>' + u.icon + ' ' + u.name + ' <small style="opacity:.7">Lv ' + lvl + '</small><br><small style="opacity:.7;font-weight:700">' + u.desc + '</small></span><span class="price">' + (maxed ? 'MAX' : viaAd ? '▶ Free' : '🪙 ' + cost) + '</span>';
      b.addEventListener('click', async () => {
        if (b.disabled) return;
        if (viaAd) {
          b.disabled = true;
          if (!(await YT.rewarded('upgrade_' + u.id))) { render(); return; }
        } else save.coins -= cost;
        save.up[u.id] += 1;
        persist(true);
        sfx.good();
        render();
      });
      box.appendChild(b);
    });
    p = UI.panel({ title: 'Upgrades', sub: '🪙 ' + save.coins + ' coins', body: box, buttons: [UI.button('Done', () => p.close(), { style: 'ghost', small: true })] });
  };
  render();
}

// ---------------------------------------------------------------------------
// Input: tap items / card reader
// ---------------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (paused || menuOpen || state !== 'day' || !current) return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = items.filter((it) => it.mesh.visible).map((it) => it.mesh).concat([reader]);
  const hits = raycaster.intersectObjects(targets, true);
  // generous touch target: also accept the nearest item to the tap on screen
  let it = hits.length ? hits[0].object.userData.itemRef : null;
  const readerHit = hits.length && !it && hits[0].object.userData.tap === 'reader';
  if (!it && !readerHit && current.state === 'scanning') {
    let bestD = 60;
    for (const x of items) {
      if (!x.mesh.visible) continue;
      const s = toScreen(x.mesh.position.clone().add(new THREE.Vector3(0, 0.25, 0)));
      const d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
      if (d < bestD && x.mesh.position.x > -2.3) { bestD = d; it = x; }
    }
  }
  if (it && current.state === 'scanning') {
    // only items that have reached the reachable part of the belt
    if (it.mesh.position.x > -2.3) scan(it);
    return;
  }
  if ((readerHit || nearReader(e)) && current.state === 'paying' && current.pay === 'card') {
    tone(1320, 0, 0.12, 'square', 0.06);
    tone(1760, 0.12, 0.18, 'square', 0.06);
    serve('card');
  }
});
function nearReader(e) {
  const s = toScreen(reader.position);
  return Math.hypot(s.x - e.clientX, s.y - e.clientY) < 70;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function walkTo(c, dt) {
  const g = c.model.g;
  if (!c.target) return true;
  const d = c.target.clone().sub(g.position);
  d.y = 0;
  const dist = d.length();
  if (dist < 0.05) {
    c.model.legs.forEach((l) => (l.rotation.x = 0));
    c.model.arms.forEach((a) => (a.rotation.x = 0));
    return true;
  }
  const step = Math.min(dist, dt * 2.6);
  g.position.addScaledVector(d.normalize(), step);
  g.rotation.y += (Math.atan2(d.x, d.z) - g.rotation.y) * Math.min(1, dt * 8);
  const ph = time * 9;
  c.model.legs[0].rotation.x = Math.sin(ph) * 0.5;
  c.model.legs[1].rotation.x = -Math.sin(ph) * 0.5;
  c.model.arms[0].rotation.x = -Math.sin(ph) * 0.4;
  c.model.arms[1].rotation.x = Math.sin(ph) * 0.4;
  return false;
}

function update(dt) {
  time += dt;
  // belt texture scrolls; items creep toward the scanner end
  const beltSpeed = 0.9 + save.up.belt * 0.18;
  beltTex.offset.x -= dt * beltSpeed * 0.25;
  scanGlow.material.opacity += (0.35 - scanGlow.material.opacity) * Math.min(1, dt * 4);
  if (scanGlow.material.opacity < 0.4) scanGlow.material.color.set('#ff2d55');
  let front = -0.35; // items stop before the scanner
  for (const it of items) {
    if (!it.mesh.visible) {
      it.delay -= dt;
      if (it.delay <= 0) { it.mesh.visible = true; tone(300 + Math.random() * 80, 0, 0.05, 'sine', 0.05); }
    }
  }
  const sorted = items.filter((it) => it.mesh.visible).sort((a, b) => b.mesh.position.x - a.mesh.position.x);
  for (const it of sorted) {
    const x = Math.min(front, it.mesh.position.x + beltSpeed * dt);
    it.mesh.position.x = x;
    it.mesh.position.y += (1.18 - it.mesh.position.y) * Math.min(1, dt * 12);
    front = x - 0.78;
  }
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i];
    f.t += dt * 2.6;
    const t = Math.min(1, f.t);
    const a = f.from.clone().lerp(f.via, t), b = f.via.clone().lerp(f.to, t);
    f.mesh.position.copy(a.lerp(b, t));
    f.mesh.rotation.y += dt * 6;
    if (t >= 1) {
      scene.remove(f.mesh);
      flyers.splice(i, 1);
      bag.scale.setScalar(1.12);
      noise(0, 0.08, 0.1, 1200);
    }
  }
  bag.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 8));

  if (state === 'day') {
    if (!current && queue.length) callNext();
    for (const c of queue) {
      if (walkTo(c, dt) && c.state === 'walking') c.state = 'waiting';
      c.patience -= dt * 0.35; // waiting in line drains slowly
    }
    if (current) {
      const arrived = walkTo(current, dt);
      if (arrived && current.state === 'toTill') {
        current.state = 'scanning';
        current.model.g.rotation.y = 0;
        unloadBasket(current);
      }
      if (current.state === 'scanning' || current.state === 'paying') current.patience -= dt;
    }
    for (const c of [current, ...queue]) {
      if (!c) continue;
      const k = Math.max(0, c.patience / c.patienceMax);
      c.model.ring.geometry.dispose();
      c.model.ring.geometry = new THREE.RingGeometry(0.2, 0.28, 32, 1, Math.PI / 2, Math.PI * 2 * k);
      c.model.ring.material.color.set(k > 0.5 ? '#3ddc97' : k > 0.25 ? '#ffd60a' : '#ff4d6d');
      c.model.ring.lookAt(camera.position);
      c.model.ringBg.lookAt(camera.position);
      if (c.patience <= 0 && c.state !== 'leaving') walkOut(c);
    }
  }
  // leaving customers walk off and are removed
  for (const c of leaving) {
    if (walkTo(c, dt)) { scene.remove(c.model.g); c.gone = true; }
  }
  leaving = leaving.filter((c) => !c.gone);
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

window.__checkout = {
  info: () => ({
    state, day: save.day, coins: save.coins,
    current: current && { state: current.state, pay: current.pay, due: current.due, total: current.total, left: current.basket.length - current.scanned },
    items: items.map((it) => ({ x: it.mesh.position.x, screen: toScreen(it.mesh.position.clone().add(new THREE.Vector3(0, 0.25, 0))) })),
    reader: toScreen(reader.position),
    stats: dayStats,
  }),
};

(async function boot() {
  YT.init('checkout-rush');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  save.up = Object.assign({ belt: 0, music: 0, jar: 0 }, save.up);
  resize();
  showTitle();
  requestAnimationFrame(frame);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
