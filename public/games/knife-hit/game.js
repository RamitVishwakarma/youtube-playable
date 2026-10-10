/*
 * Knife Hit 3D — tap to throw. Knives stick into a spinning log; hit a
 * knife that's already in it and the run is over. Slice apples on the rim
 * for coins. Clear a stage by landing every knife, and the log bursts
 * apart. Every fifth stage is a boss target with a nastier spin.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';

const R = 1.5;             // target radius
const DEPTH = 0.7;         // target thickness
const TY = 1.5;            // target centre height
const KNIFE_Y = -3.3;      // where knives wait to be thrown
const EMBED = 0.28;        // how deep a knife sinks in
const HIT_ANGLE = 0.15;    // knives closer than this (radians) collide
const THROW_SPEED = 30;

const SKINS = [
  { id: 'classic', name: 'Classic', color: 'linear-gradient(180deg,#e9ecef 55%,#8b5a2b 55%)', blade: '#dfe4ea', handle: '#8b5a2b', price: 0 },
  { id: 'ninja', name: 'Ninja', color: 'linear-gradient(180deg,#495057 55%,#111 55%)', blade: '#495057', handle: '#16161a', price: 150 },
  { id: 'ruby', name: 'Ruby', color: 'linear-gradient(180deg,#ff4d6d 55%,#2b2d42 55%)', blade: '#ff4d6d', handle: '#2b2d42', glow: 0x550010, price: 300 },
  { id: 'emerald', name: 'Emerald', color: 'linear-gradient(180deg,#2ee59d 55%,#1b4332 55%)', blade: '#2ee59d', handle: '#1b4332', glow: 0x003320, price: 450 },
  { id: 'ice', name: 'Ice', color: 'linear-gradient(180deg,#a5f3fc 55%,#0e7490 55%)', blade: '#a5f3fc', handle: '#0e7490', glow: 0x003344, price: 650 },
  { id: 'gold', name: 'Gold', color: 'linear-gradient(180deg,#ffe066 55%,#7a4f00 55%)', blade: '#ffd60a', handle: '#7a4f00', metal: 0.55, price: 900 },
  { id: 'candy', name: 'Candy', color: 'linear-gradient(180deg,#ff9ff3 55%,#ffffff 55%)', blade: '#ff9ff3', handle: '#ffffff', price: 0, ad: true },
  { id: 'plasma', name: 'Plasma', color: 'linear-gradient(180deg,#b15cff 55%,#21d4d4 55%)', blade: '#b15cff', handle: '#21d4d4', glow: 0x6a00ff, price: 1400 },
];

// boss targets: a different face every fifth stage
const BOSSES = [
  { name: 'Cheese Wheel', face: '#ffd166', side: '#f4a261', holes: true },
  { name: 'Old Tyre', face: '#2b2d42', side: '#1b1b22', tyre: true },
  { name: 'Orange', face: '#ff9f1c', side: '#f77f00', citrus: true },
  { name: 'Viking Shield', face: '#8d5524', side: '#5e3a1a', shield: true },
  { name: 'Donut', face: '#ff6fd8', side: '#d4a373', donut: true },
];

let save = { coins: 0, best: 0, bestStage: 1, sound: true, tutorial: false, skin: 'classic', owned: { classic: true }, games: 0 };
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
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xfff2e0, 0x2a1b3d, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 6, 8);
scene.add(key);
const fill = new THREE.PointLight(0xff9ff3, 6, 14, 1.5);
fill.position.set(-4, -1, 4);
scene.add(fill);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// backdrop: soft radial glow behind the target
const backTex = canvasTex(512, 512, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h / 2, w * 0.7);
  gr.addColorStop(0, '#6b3fa0'); gr.addColorStop(0.5, '#3a1f5d'); gr.addColorStop(1, '#170d26');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.12})`;
    g.beginPath(); g.arc(Math.random() * w, Math.random() * h, Math.random() * 2.5, 0, Math.PI * 2); g.fill();
  }
});
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: backTex }));
backdrop.position.set(0, 0, -8);
scene.add(backdrop);
scene.background = new THREE.Color('#170d26');

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  const portrait = camera.aspect < 1;
  // fit the target and the waiting knife vertically; widen for narrow phones
  const needH = portrait ? 8.6 : 9.4;
  const dist = 10;
  let fov = 2 * Math.atan(needH / 2 / dist) * 180 / Math.PI;
  if (portrait) {
    const needW = 4.6;
    const hfov = 2 * Math.atan(needW / 2 / dist);
    fov = Math.max(fov, 2 * Math.atan(Math.tan(hfov / 2) / camera.aspect) * 180 / Math.PI);
  }
  camera.fov = fov;
  camera.position.set(0, 1.4, dist);
  camera.lookAt(0, -0.35, 0);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// Target faces
// ---------------------------------------------------------------------------
function woodFace(g, w, h) {
  const cx = w / 2, cy = h / 2;
  g.fillStyle = '#e0a96d'; g.fillRect(0, 0, w, h);
  for (let r = w / 2; r > 4; r -= 7 + Math.random() * 6) {
    g.strokeStyle = `rgba(120, 70, 30, ${0.25 + Math.random() * 0.25})`;
    g.lineWidth = 2 + Math.random() * 2;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.1) {
      const rr = r + Math.sin(a * 5 + r) * 1.5;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.fillStyle = '#8b5a2b'; g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill();
  // cracks
  g.strokeStyle = 'rgba(90, 50, 20, .5)'; g.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); g.lineTo(cx + Math.cos(a + 0.1) * (w * 0.3), cy + Math.sin(a + 0.1) * (w * 0.3)); g.stroke();
  }
  // bark ring
  g.strokeStyle = '#6b3e1f'; g.lineWidth = 16; g.beginPath(); g.arc(cx, cy, w / 2 - 8, 0, Math.PI * 2); g.stroke();
}
function bossFace(b) {
  return (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    g.fillStyle = b.face; g.fillRect(0, 0, w, h);
    if (b.holes) {
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * w * 0.4;
        g.fillStyle = 'rgba(200, 120, 20, .45)';
        g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 8 + Math.random() * 18, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = '#e09b00'; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, w / 2 - 7, 0, Math.PI * 2); g.stroke();
    } else if (b.tyre) {
      g.fillStyle = '#1b1b22'; g.beginPath(); g.arc(cx, cy, w / 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#adb5bd'; g.beginPath(); g.arc(cx, cy, w * 0.26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6c757d';
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * w * 0.15, cy + Math.sin(a) * w * 0.15, 10, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#3d3d4a'; g.lineWidth = 6;
      for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * w * 0.4, cy + Math.sin(a) * w * 0.4); g.lineTo(cx + Math.cos(a) * w * 0.49, cy + Math.sin(a) * w * 0.49); g.stroke(); }
    } else if (b.citrus) {
      g.fillStyle = '#ffd6a5'; g.beginPath(); g.arc(cx, cy, w * 0.44, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * Math.PI * 2 + 0.05, a1 = ((i + 1) / 10) * Math.PI * 2 - 0.05;
        g.fillStyle = '#ffa94d';
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, w * 0.41, a0, a1); g.closePath(); g.fill();
      }
      g.fillStyle = '#fff4e6'; g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.fill();
    } else if (b.shield) {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#9c6644' : '#7f5539';
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, w / 2, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2); g.closePath(); g.fill();
      }
      g.strokeStyle = '#adb5bd'; g.lineWidth = 18; g.beginPath(); g.arc(cx, cy, w / 2 - 9, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ced4da'; g.beginPath(); g.arc(cx, cy, w * 0.14, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#868e96'; g.beginPath(); g.arc(cx, cy, w * 0.07, 0, Math.PI * 2); g.fill();
    } else if (b.donut) {
      g.fillStyle = '#d4a373'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff6fd8'; g.beginPath(); g.arc(cx, cy, w * 0.45, 0, Math.PI * 2); g.fill();
      const cols = ['#ffffff', '#ffd60a', '#3a86ff', '#3ddc97'];
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2, r = w * (0.16 + Math.random() * 0.26);
        g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.rotate(Math.random() * 3);
        g.fillStyle = cols[i % 4]; g.fillRect(-6, -2, 12, 4); g.restore();
      }
      g.fillStyle = '#2a1b3d'; g.beginPath(); g.arc(cx, cy, w * 0.12, 0, Math.PI * 2); g.fill();
    }
  };
}
const faceCache = {};
function faceMaterials(kind) {
  if (faceCache[kind]) return faceCache[kind];
  const b = kind === 'log' ? null : BOSSES[+kind];
  const face = canvasTex(512, 512, b ? bossFace(b) : woodFace);
  const sideTex = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = b ? b.side : '#6b3e1f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, 0, 2 + Math.random() * 4, h); }
  });
  sideTex.wrapS = THREE.RepeatWrapping;
  const side = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.9 });
  const front = new THREE.MeshStandardMaterial({ map: face, roughness: b && b.tyre ? 0.7 : 0.85, emissive: 0xffffff, emissiveIntensity: 0 });
  faceCache[kind] = [side, front, front];
  return faceCache[kind];
}

// ---------------------------------------------------------------------------
// Knife model
// ---------------------------------------------------------------------------
const bladeShape = new THREE.Shape();
bladeShape.moveTo(0, 0);
bladeShape.lineTo(0.085, 0.16);
bladeShape.lineTo(0.085, 0.72);
bladeShape.lineTo(-0.075, 0.72);
bladeShape.lineTo(-0.075, 0.22);
bladeShape.quadraticCurveTo(-0.06, 0.06, 0, 0);
const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 1 });
bladeGeo.translate(0, 0, -0.015);
const guardGeo = new THREE.RoundedBoxGeometry(0.3, 0.06, 0.09, 2, 0.02);
const handleGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.5, 12);
const capGeo = new THREE.SphereGeometry(0.07, 12, 8);
const knifeMats = {};
function knifeMat(id) {
  if (knifeMats[id]) return knifeMats[id];
  const s = SKINS.find((k) => k.id === id) || SKINS[0];
  knifeMats[id] = {
    blade: new THREE.MeshStandardMaterial({ color: s.blade, metalness: s.metal ?? 0.35, roughness: 0.28, emissive: s.glow || 0 }),
    handle: new THREE.MeshStandardMaterial({ color: s.handle, roughness: 0.5 }),
    guard: new THREE.MeshStandardMaterial({ color: '#e0b431', metalness: 0.45, roughness: 0.35 }),
  };
  return knifeMats[id];
}
/** Knife with its tip at the origin, pointing up (+y)... flipped so the tip leads. */
function makeKnife(skin) {
  const m = knifeMat(skin);
  const g = new THREE.Group();
  // build pointing down from the tip: tip at y=0, handle at +y... we want the
  // tip to lead upward, so the model extends downward (-y) from the tip.
  const blade = new THREE.Mesh(bladeGeo, m.blade);
  blade.rotation.z = Math.PI; // tip at origin, body going down
  const guard = new THREE.Mesh(guardGeo, m.guard);
  guard.position.y = -0.75;
  const handle = new THREE.Mesh(handleGeo, m.handle);
  handle.position.y = -1.03;
  const cap = new THREE.Mesh(capGeo, m.guard);
  cap.position.y = -1.3;
  g.add(blade, guard, handle, cap);
  return g;
}

// ---------------------------------------------------------------------------
// Target group
// ---------------------------------------------------------------------------
const target = new THREE.Group();
target.position.set(0, TY, 0);
scene.add(target);
const spin = new THREE.Group();   // rotates; knives + apples attach here
target.add(spin);
let disc = null;
const targetGeo = new THREE.CylinderGeometry(R, R, DEPTH, 64);
targetGeo.rotateX(Math.PI / 2);

const appleGeo = new THREE.SphereGeometry(0.2, 18, 14);
const appleMat = new THREE.MeshStandardMaterial({ color: '#e63946', roughness: 0.35, emissive: 0x220000 });
const leafMat = new THREE.MeshStandardMaterial({ color: '#2ecc71', roughness: 0.6 });
const stemMat = new THREE.MeshStandardMaterial({ color: '#6b3e1f' });
function makeApple() {
  const g = new THREE.Group();
  const a = new THREE.Mesh(appleGeo, appleMat);
  a.scale.set(1, 0.92, 1);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.1, 6), stemMat);
  stem.position.y = 0.21;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), leafMat);
  leaf.scale.set(1.4, 0.3, 0.7);
  leaf.position.set(0.06, 0.24, 0);
  g.add(a, stem, leaf);
  return g;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = 'title';
let paused = false, menuOpen = false;
let time = 0, stageT = 0;
let stage = 1, score = 0, knivesLeft = 0, knivesTotal = 0;
let stuck = [];      // { angle (local), mesh }
let apples = [];     // { angle, mesh }
let flying = null;   // knife in the air
let ready = null;    // knife waiting at the bottom
let queued = false;
let debris = [];     // bounced knives, chunks, apple halves, chips
let pattern = 0, dir = 1, rot = 0, omega = 0;
let revived = false, bump = 0, flash = 0, shake = 0;
let hud = null, stopHand = null;
const isBoss = (s) => s % 5 === 0;

function stageConfig(s) {
  const boss = isBoss(s);
  const knives = boss ? 9 + Math.min(3, Math.floor(s / 10)) : Math.min(10, 5 + Math.floor((s - 1) / 2));
  const pre = boss ? Math.min(4, 1 + Math.floor(s / 10)) : s < 3 ? 0 : Math.min(4, Math.floor((s - 1) / 3));
  const appleN = boss ? 0 : s === 1 ? 1 : Math.random() < 0.6 ? 1 + (Math.random() < 0.3 ? 1 : 0) : 0;
  const pat = boss ? 4 + (Math.floor(s / 5) % 2) : s < 3 ? 0 : (s * 7) % 4;
  return { boss, knives, pre, appleN, pat };
}

/** Angular velocity patterns, by stage. */
function speedAt(t) {
  const k = 1 + Math.min(0.6, stage * 0.025);
  switch (pattern) {
    case 0: return 1.7 * k;
    case 1: return (2.1 + Math.sin(t * 1.3) * 1.5) * k;
    case 2: return 2.7 * Math.tanh(3 * Math.sin(t * 0.85)) * k;           // swings back and forth
    case 3: return (0.8 + 4 * Math.pow(Math.max(0, Math.sin(t * 1.6)), 6)) * k; // sudden bursts
    case 4: return (2.4 * Math.sin(t * 0.7) + 1.4 * Math.sin(t * 2.3)) * k;    // boss: erratic
    case 5: return (t % 3 < 2 ? 2.8 : -3.6) * k;                              // boss: hard reverses
    default: return 2;
  }
}

function clearTarget() {
  for (const s of stuck) spin.remove(s.mesh);
  for (const a of apples) spin.remove(a.mesh);
  stuck = []; apples = [];
  if (disc) { spin.remove(disc); disc = null; }
}

function buildStage() {
  clearTarget();
  const cfg = stageConfig(stage);
  const kind = cfg.boss ? String(Math.floor(stage / 5 - 1) % BOSSES.length) : 'log';
  disc = new THREE.Mesh(targetGeo, faceMaterials(kind));
  spin.add(disc);
  spin.rotation.z = rot = 0;
  pattern = cfg.pat;
  dir = Math.random() < 0.5 ? 1 : -1;
  stageT = 0;
  knivesTotal = knivesLeft = cfg.knives;
  // pre-stuck knives spread around, then apples in the gaps
  const used = [];
  const free = (a, gap) => used.every((u) => Math.abs(angDiff(u, a)) > gap);
  for (let i = 0; i < cfg.pre; i++) {
    let a, tries = 0;
    do { a = Math.random() * Math.PI * 2; tries++; } while (!free(a, 0.7) && tries < 50);
    used.push(a);
    stickKnife(a, 'classic', true);
  }
  for (let i = 0; i < cfg.appleN; i++) {
    let a, tries = 0;
    do { a = Math.random() * Math.PI * 2; tries++; } while (!free(a, 0.6) && tries < 50);
    used.push(a);
    const m = makeApple();
    m.position.set(Math.cos(a) * (R + 0.17), Math.sin(a) * (R + 0.17), 0);
    m.rotation.z = a - Math.PI / 2;
    spin.add(m);
    apples.push({ angle: a, mesh: m });
  }
  // drop in
  target.position.y = TY + 6;
  target.scale.setScalar(0.6);
  updateKnifeColumn();
  if (hud) {
    hud.setLevel(cfg.boss ? '⚔️ BOSS: ' + BOSSES[+kind].name : 'Stage ' + stage);
    hud.setProgress(0);
  }
  if (cfg.boss && state === 'play') { UI.praise('BOSS FIGHT!', '#ff6b6b'); tone(110, 0, 0.5, 'sawtooth', 0.08, 80); }
}

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function stickKnife(localAngle, skin, pre) {
  const k = makeKnife(skin);
  const rr = R - EMBED;
  k.position.set(Math.cos(localAngle) * rr, Math.sin(localAngle) * rr, pre ? 0 : 0.05);
  k.rotation.z = localAngle + Math.PI / 2;
  spin.add(k);
  stuck.push({ angle: localAngle, mesh: k });
}

function spawnReady() {
  if (knivesLeft <= 0 || ready) return;
  ready = makeKnife(save.skin);
  ready.position.set(0, KNIFE_Y - 1.2, 0.05);
  scene.add(ready);
}

// ---------------------------------------------------------------------------
// Throwing + hits
// ---------------------------------------------------------------------------
function throwKnife() {
  if (state !== 'play' || !ready || flying || target.position.y > TY + 0.05) { if (state === 'play') queued = true; return; }
  flying = ready;
  ready = null;
  knivesLeft--;
  updateKnifeColumn();
  sfx.whoosh();
  UI.buzz(6);
  if (stopHand) { stopHand(); stopHand = null; save.tutorial = true; persist(); }
  if (knivesLeft > 0) setTimeout(spawnReady, 90);
}

function onArrive() {
  const k = flying;
  flying = null;
  // the knife enters at the bottom of the target (world angle -90°); convert to the spinning frame
  const local = -Math.PI / 2 - spin.rotation.z;
  const clash = stuck.some((s) => Math.abs(angDiff(s.angle, local)) < HIT_ANGLE);
  if (clash) { bounceOff(k); return; }
  scene.remove(k);
  stickKnife(local, save.skin, false);
  score++;
  bump = 1; flash = 1;
  tone(160, 0, 0.08, 'square', 0.12, 90);
  noise(0, 0.07, 0.18, 1400);
  UI.buzz(10);
  chips(new THREE.Vector3(0, TY - R, 0.3), 8, '#c68642');
  // apples
  for (let i = apples.length - 1; i >= 0; i--) {
    const a = apples[i];
    if (Math.abs(angDiff(a.angle, local)) < 0.24) sliceApple(i);
  }
  hud.setProgress((knivesTotal - knivesLeft) / knivesTotal);
  if (knivesLeft === 0) setTimeout(stageClear, 160);
}

function sliceApple(i) {
  const a = apples[i];
  apples.splice(i, 1);
  const wp = new THREE.Vector3();
  a.mesh.getWorldPosition(wp);
  spin.remove(a.mesh);
  for (const side of [-1, 1]) {
    const half = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, side < 0 ? 0 : Math.PI, Math.PI), appleMat);
    half.position.copy(wp);
    scene.add(half);
    debris.push({ m: half, v: new THREE.Vector3(side * (2 + Math.random()), 3 + Math.random() * 2, 1), w: new THREE.Vector3(0, 0, side * 8), life: 1.6, g: 14 });
  }
  save.coins += 2;
  hud.setCoins(save.coins, true);
  const s = toScreen(wp);
  UI.floatText('+2', s.x, s.y, '#ffd60a');
  sfx.pop();
  tone(880, 0.03, 0.08, 'sine', 0.1);
}

function bounceOff(k) {
  tone(1250, 0, 0.12, 'triangle', 0.16);
  tone(1870, 0.01, 0.2, 'triangle', 0.1);
  noise(0, 0.1, 0.2, 3000);
  UI.buzz([30, 40, 60]);
  UI.hitFlash();
  shake = 0.5;
  debris.push({ m: k, v: new THREE.Vector3((Math.random() - 0.5) * 4, -6, 2), w: new THREE.Vector3(0, 0, 14 * (Math.random() < 0.5 ? -1 : 1)), life: 2, g: 18 });
  state = 'over';
  setTimeout(gameOver, 700);
}

function chips(at, n, color) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(chipGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    m.position.copy(at);
    scene.add(m);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const sp = 2 + Math.random() * 3;
    debris.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, Math.sin(a) * sp * 0.6, Math.random() * 2), w: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0), life: 0.7, g: 12, fade: true });
  }
}
const chipGeo = new THREE.BoxGeometry(0.08, 0.04, 0.05);

/** Burst the target into wedges; stuck knives fly off with them. */
function explodeTarget() {
  const mats = disc.material;
  const N = 8;
  const wp = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * Math.PI * 2;
    const geo = new THREE.CylinderGeometry(R, R, DEPTH, 10, 1, false, t0, (Math.PI * 2) / N);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mats);
    m.rotation.z = spin.rotation.z;
    m.position.copy(target.position);
    scene.add(m);
    // CylinderGeometry's theta runs from +z toward +x; after rotateX it spins in the xy plane
    const mid = t0 + Math.PI / N + spin.rotation.z;
    const dirv = new THREE.Vector3(Math.sin(mid), -Math.cos(mid), 0);
    debris.push({ m, v: dirv.multiplyScalar(5 + Math.random() * 3).add(new THREE.Vector3(0, 3, 2 + Math.random() * 2)), w: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), life: 1.8, g: 16 });
  }
  for (const s of stuck) {
    s.mesh.getWorldPosition(wp);
    const q = new THREE.Quaternion();
    s.mesh.getWorldQuaternion(q);
    spin.remove(s.mesh);
    s.mesh.position.copy(wp);
    s.mesh.quaternion.copy(q);
    scene.add(s.mesh);
    const out = wp.clone().sub(target.position).setZ(0).normalize();
    debris.push({ m: s.mesh, v: out.multiplyScalar(6).add(new THREE.Vector3(0, 4, 3)), w: new THREE.Vector3(0, 0, 12 * (Math.random() < 0.5 ? -1 : 1)), life: 1.8, g: 18 });
  }
  stuck = [];
  for (const a of apples) spin.remove(a.mesh);
  apples = [];
  spin.remove(disc);
  disc = null;
  chips(target.position.clone(), 18, '#c68642');
  noise(0, 0.5, 0.3, 700);
  tone(90, 0, 0.3, 'sine', 0.25, 50);
  shake = 0.4;
}

function stageClear() {
  if (state !== 'play') return;
  const boss = isBoss(stage);
  explodeTarget();
  sfx.win();
  UI.buzz([20, 30, 20]);
  const coins = boss ? 25 : 5;
  if (stage + 1 > save.bestStage) save.bestStage = stage + 1;
  if (boss) {
    state = 'boss';
    UI.praise('BOSS DEFEATED!', '#ffd60a');
    sfx.fanfare();
    setTimeout(() => bossPanel(coins), 900);
    return;
  }
  save.coins += coins;
  hud.setCoins(save.coins, true);
  UI.praise(['NICE!', 'GREAT!', 'SMASHED!', 'AWESOME!'][stage % 4], '#7dffb2');
  persist();
  stage++;
  state = 'between';
  setTimeout(() => { state = 'play'; buildStage(); spawnReady(); }, 750);
}

function bossPanel(reward) {
  const body = document.createElement('div');
  body.innerHTML = '<div class="big">⚔️</div><div class="sub">Stage ' + stage + ' cleared · ' + score + ' knives</div><div class="reward"><span class="fs-coin" style="position:static;margin:0"></span><b>0</b></div>';
  UI.countUp(body.querySelector('.reward b'), 0, reward, 600);
  const collect = (mult) => {
    p.close();
    const gained = reward * mult;
    UI.coinBurst(window.innerWidth / 2, window.innerHeight / 2, 10, hud.coinEl, (i) => { sfx.coin(i); hud.setCoins(Math.round(save.coins - gained + (gained * (i + 1)) / 10), true); });
    save.coins += gained;
    persist(true);
    stage++;
    setTimeout(() => {
      hud.setCoins(save.coins);
      state = 'play';
      buildStage();
      spawnReady();
    }, 1000);
  };
  const p = UI.panel({
    title: 'Boss defeated!', gold: true, body,
    buttons: [
      UI.button('Claim ×3', async () => { if (await YT.rewarded('triple_coins')) collect(3); }, { style: 'gold', ad: true }),
      UI.button('Next stage', () => collect(1), { style: 'green' }),
    ],
  });
}

function gameOver() {
  if (stopHand) { stopHand(); stopHand = null; }
  sfx.lose();
  const isBest = score > save.best;
  if (isBest) save.best = score;
  persist(true);
  YT.sendScore(save.best);
  const body = document.createElement('div');
  body.innerHTML = '<div class="big">' + score + '</div><div class="sub">' + (isBest ? '🏆 New best!' : 'Best ' + save.best) + ' · reached stage ' + stage + '</div>';
  const btns = [];
  if (!revived) {
    btns.push(UI.button('Continue', async () => {
      if (!(await YT.rewarded('continue'))) return;
      p.close();
      revived = true;
      state = 'play';
      knivesLeft++;           // refund the knife that bounced
      updateKnifeColumn();
      spawnReady();
      UI.praise('KEEP GOING!', '#7dffb2');
    }, { style: 'gold', ad: true }));
  }
  btns.push(UI.button('Play again', () => {
    p.close();
    save.games++;
    persist();
    const go = () => startRun();
    if (save.games % 3 === 0) YT.interstitial().then(go); else go();
  }, { style: 'green' }));
  btns.push(UI.button('Home', () => { p.close(); showTitle(); }, { style: 'ghost', small: true }));
  const p = UI.panel({ title: isBest ? 'New best!' : 'Ouch!', gold: isBest, body, buttons: btns });
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .kh-knives { position:absolute; left:max(16px, env(safe-area-inset-left)); bottom:max(22px, env(safe-area-inset-bottom)); display:flex; flex-direction:column-reverse; gap:6px; pointer-events:none !important; }
  .kh-knives i { width:12px; height:34px; display:block; border-radius:6px 6px 3px 3px; background:linear-gradient(180deg,#f1f3f5 0 58%, #8b5a2b 58% 100%); box-shadow:0 2px 0 rgba(0,0,0,.3); transition:opacity .2s, transform .2s; }
  .kh-knives i.used { opacity:.18; transform:scale(.85); }
  .kh-score { position:absolute; left:50%; top:calc(max(10px, env(safe-area-inset-top)) + 62px); transform:translateX(-50%); font:900 44px var(--font); color:#fff; pointer-events:none !important; }
  .kh-dots { position:absolute; left:50%; top:calc(max(10px, env(safe-area-inset-top)) + 118px); transform:translateX(-50%); display:flex; gap:8px; pointer-events:none !important; }
  .kh-dots b { width:12px; height:12px; border-radius:50%; background:rgba(255,255,255,.25); display:block; }
  .kh-dots b.on { background:#ffd60a; }
  .kh-dots b.boss { width:16px; height:16px; margin-top:-2px; background:rgba(255,80,80,.35); }
  .kh-dots b.boss.on { background:#ff4d4d; }
  @media (min-aspect-ratio: 1/1) { .kh-score { left:auto; right:max(28px, env(safe-area-inset-right)); top:42%; transform:none; } .kh-dots { left:auto; right:max(24px, env(safe-area-inset-right)); top:calc(42% + 58px); transform:none; } }
`;
document.head.appendChild(css);
let colEl = null, scoreEl = null, dotsEl = null;
function ensureHud() {
  if (hud) return;
  hud = UI.hud({ coins: save.coins, level: 'Stage 1', right: [UI.iconButton('❚❚', 'Pause', openPause)] });
  const ui = document.getElementById('ui');
  colEl = document.createElement('div'); colEl.className = 'kh-knives';
  scoreEl = document.createElement('div'); scoreEl.className = 'kh-score fs-stroke';
  dotsEl = document.createElement('div'); dotsEl.className = 'kh-dots';
  ui.append(colEl, scoreEl, dotsEl);
}
function showHudExtras(v) { [colEl, scoreEl, dotsEl].forEach((e) => e && (e.style.display = v ? '' : 'none')); }
function updateKnifeColumn() {
  if (!colEl) return;
  colEl.innerHTML = '';
  for (let i = 0; i < knivesTotal; i++) {
    const k = document.createElement('i');
    if (i >= knivesLeft) k.className = 'used';
    colEl.appendChild(k);
  }
  scoreEl.textContent = String(score);
  const inCycle = ((stage - 1) % 5);
  dotsEl.innerHTML = [0, 1, 2, 3, 4].map((i) => '<b class="' + (i === 4 ? 'boss ' : '') + (i <= inCycle ? 'on' : '') + '"></b>').join('');
}

function showTitle() {
  state = 'title';
  if (hud) { hud.show(false); showHudExtras(false); }
  clearDebris();
  if (flying) { scene.remove(flying); flying = null; }
  if (ready) { scene.remove(ready); ready = null; }
  stage = 1;
  buildStage();
  target.position.y = TY;
  target.scale.setScalar(1);
  UI.titleScreen({
    line1: 'KNIFE', line2: 'HIT 3D',
    tagline: 'Tap to throw. Don’t hit the other knives.',
    best: save.best ? 'Best ' + save.best + ' · Stage ' + save.bestStage : 'Slice apples for coins',
    onPlay: startRun,
    extra: [
      UI.button('🔪 Knives', openShop, { style: 'blue', small: true }),
      UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true }),
    ],
  });
}

function clearDebris() {
  for (const d of debris) scene.remove(d.m);
  debris = [];
}

function startRun() {
  initAudio(() => save.sound);
  ensureHud();
  hud.show(true);
  showHudExtras(true);
  hud.setCoins(save.coins);
  clearDebris();
  if (flying) { scene.remove(flying); flying = null; }
  if (ready) { scene.remove(ready); ready = null; }
  stage = 1; score = 0; revived = false; queued = false;
  state = 'play';
  buildStage();
  spawnReady();
  if (!save.tutorial) stopHand = UI.tutorialHand([[window.innerWidth * 0.5, window.innerHeight * 0.72], [window.innerWidth * 0.5, window.innerHeight * 0.68]], 'Tap to throw');
}

function openPause() {
  if (state !== 'play' && state !== 'between') return;
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
      title: 'Knives', items: SKINS, owned: save.owned, current: save.skin, coins: save.coins,
      onSelect: (it) => { save.skin = it.id; persist(); render(); },
      onBuy: (it) => { if (save.coins < it.price) return; save.coins -= it.price; save.owned[it.id] = true; save.skin = it.id; persist(true); sfx.good(); render(); },
      onAdUnlock: async (it) => { if (await YT.rewarded('knife_' + it.id)) { save.owned[it.id] = true; save.skin = it.id; persist(true); sfx.fanfare(); } render(); },
      onClose: () => p.close(),
    });
  };
  render();
}

const proj = new THREE.Vector3();
function toScreen(v) {
  proj.copy(v).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (paused || menuOpen) return;
  if (state === 'play') throwKnife();
  e.preventDefault();
});
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'ArrowUp') && !paused && !menuOpen && state === 'play') { throwKnife(); e.preventDefault(); }
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function update(dt) {
  time += dt;
  // target drop-in, spin, hit bump
  target.position.y += (TY - target.position.y) * Math.min(1, dt * 9);
  if (Math.abs(target.position.y - TY) < 0.01) target.position.y = TY;
  const sc = target.scale.x + (1 - target.scale.x) * Math.min(1, dt * 9);
  target.scale.setScalar(sc);
  if (state === 'play' || state === 'between' || state === 'title') {
    stageT += dt;
    omega = speedAt(stageT) * dir;
    rot += omega * dt;
    spin.rotation.z = rot;
  }
  bump = Math.max(0, bump - dt * 7);
  flash = Math.max(0, flash - dt * 6);
  target.position.y += bump * 0.08;
  if (disc) disc.material[1].emissiveIntensity = flash * 0.25;
  shake = Math.max(0, shake - dt);
  camera.position.x = (Math.random() - 0.5) * shake * 0.3;

  // waiting knife slides up into place
  if (ready) {
    ready.position.y += (KNIFE_Y - ready.position.y) * Math.min(1, dt * 16);
    if (queued && Math.abs(ready.position.y - KNIFE_Y) < 0.2 && !flying && target.position.y <= TY + 0.05) { queued = false; throwKnife(); }
  }
  if (flying) {
    flying.position.y += THROW_SPEED * dt;
    const tipTarget = TY - R + EMBED;
    if (flying.position.y >= tipTarget) { flying.position.y = tipTarget; onArrive(); }
  }
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.life -= dt;
    d.v.y -= d.g * dt;
    d.m.position.addScaledVector(d.v, dt);
    d.m.rotation.x += d.w.x * dt;
    d.m.rotation.y += d.w.y * dt;
    d.m.rotation.z += d.w.z * dt;
    if (d.fade) d.m.scale.setScalar(Math.max(0.01, d.life / 0.7));
    if (d.life <= 0) { scene.remove(d.m); debris.splice(i, 1); }
  }
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
window.__knife = {
  info: () => ({
    state, stage, score, knivesLeft, knivesTotal, boss: isBoss(stage), omega, revived,
    ready: !!ready && !flying && target.position.y <= TY + 0.05,
    // local angle that would be hit if a knife arrived right now, and the stuck ones
    bottom: -Math.PI / 2 - spin.rotation.z,
    stuck: stuck.map((s) => s.angle), apples: apples.map((a) => a.angle),
    flight: (TY - R + EMBED - KNIFE_Y) / THROW_SPEED,
  }),
};

(async function boot() {
  YT.init('knife-hit');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  if (!save.owned) save.owned = { classic: true };
  resize();
  showTitle();
  requestAnimationFrame(frame);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
