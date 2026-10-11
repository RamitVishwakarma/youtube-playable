/*
 * Bowling Strike 3D — ten-pin bowling. Drag sideways to line up, then
 * swipe up to bowl: the swipe's angle aims, its speed sets the pace and a
 * curved swipe puts hook on the ball. Pins are simulated as tipping
 * bodies that knock each other down, so every roll plays out differently.
 * Full ten-frame scoring with strikes, spares and the tenth-frame bonus.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';
import { studio } from 'look';

// lane geometry (metres, roughly regulation)
const LANE_W = 1.05, HALF = LANE_W / 2;
const GUTTER_X = 0.64;
const HEAD_Z = -18;            // head pin position
const PIT_Z = HEAD_Z - 1.15;
const BALL_R = 0.109;
const PIN_R = 0.06, PIN_H = 0.38;
const PIN_SPACING = 0.305;
const BALL_MASS = 7, PIN_MASS = 1.5;

const SKINS = [
  { id: 'cobalt', name: 'Cobalt', color: '#1e6bff', a: '#1e6bff', b: '#0a2a7a', price: 0 },
  { id: 'cherry', name: 'Cherry', color: '#e63946', a: '#e63946', b: '#6a040f', price: 150 },
  { id: 'jade', name: 'Jade', color: '#2ec4b6', a: '#2ec4b6', b: '#0b3d3a', price: 300 },
  { id: 'onyx', name: 'Onyx', color: '#222', a: '#3a3a44', b: '#0b0b0f', price: 450 },
  { id: 'sunset', name: 'Sunset', color: 'linear-gradient(135deg,#ff9f1c,#ff4d6d)', a: '#ff9f1c', b: '#c9184a', price: 650 },
  { id: 'galaxy', name: 'Galaxy', color: 'linear-gradient(135deg,#3a0ca3,#f72585)', a: '#7209b7', b: '#10002b', stars: true, price: 900 },
  { id: 'gold', name: 'Gold', color: 'linear-gradient(135deg,#ffe066,#e09b00)', a: '#ffd60a', b: '#a86b00', metal: true, price: 0, ad: true },
  { id: 'pearl', name: 'Pearl', color: 'linear-gradient(135deg,#ffffff,#ffc8dd)', a: '#ffffff', b: '#ffafcc', price: 1300 },
];

let save = { coins: 0, best: 0, games: 0, strikes: 0, sound: true, tutorial: false, skin: 'cobalt', owned: { cobalt: true } };
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
scene.background = new THREE.Color('#120a24');
scene.fog = new THREE.Fog('#120a24', 16, 34);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
studio(renderer, scene, { intensity: 0.5 });
scene.add(new THREE.HemisphereLight(0xe8e0ff, 0x2a1a10, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(1.5, 6, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 2, bottom: -2, near: 0.5, far: 14 });
scene.add(sun, sun.target);
const pinLight = new THREE.SpotLight(0xfff4e0, 30, 9, 0.6, 0.5, 1.2);
pinLight.position.set(0, 2.6, HEAD_Z + 1.6);
pinLight.target.position.set(0, 0, HEAD_Z - 0.5);
pinLight.castShadow = true;
pinLight.shadow.mapSize.set(1024, 1024);
scene.add(pinLight, pinLight.target);

let portrait = true;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  portrait = camera.aspect < 1;
  camera.fov = portrait ? 46 : 42;
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
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------------------
// The alley
// ---------------------------------------------------------------------------
const LANE_LEN = 23; // from z=+3 (approach) to z=-20
const laneTex = canvasTex(256, 4096, (g, w, h) => {
  const boards = 20;
  for (let i = 0; i < boards; i++) {
    g.fillStyle = `hsl(${30 + (i % 3)}, ${48 + (i * 7) % 10}%, ${60 + ((i * 13) % 9)}%)`;
    g.fillRect((i * w) / boards, 0, w / boards + 1, h);
    g.fillStyle = 'rgba(80,40,10,.18)';
    g.fillRect((i * w) / boards, 0, 1, h);
  }
  const zToY = (z) => ((3 - z) / LANE_LEN) * h;
  // approach (lighter) and foul line
  g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, w, zToY(0));
  g.fillStyle = '#1b1b22'; g.fillRect(0, zToY(0) - 4, w, 8);
  // dots and target arrows
  g.fillStyle = '#3a2a7a';
  for (let k = 0; k < 7; k++) {
    const x = w / 2 + (k - 3) * (w / 9);
    g.beginPath(); g.arc(x, zToY(-2.1), 4, 0, Math.PI * 2); g.fill();
    const y = zToY(-4.6 - Math.abs(k - 3) * 0.3);
    g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x - 7, y + 10); g.lineTo(x + 7, y + 10); g.closePath(); g.fill();
  }
  // pin deck (lighter) with pin spots
  g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, zToY(HEAD_Z + 0.4), w, h);
  g.fillStyle = 'rgba(40,20,0,.35)';
  pinSpots().forEach(([x, z]) => { g.beginPath(); g.arc(w / 2 + (x / LANE_W) * w, zToY(z), 5, 0, Math.PI * 2); g.fill(); });
});
const lane = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, LANE_LEN), new THREE.MeshStandardMaterial({ map: laneTex, roughness: 0.25, metalness: 0.05 }));
lane.rotation.x = -Math.PI / 2;
lane.position.set(0, 0, 3 - LANE_LEN / 2);
lane.receiveShadow = true;
scene.add(lane);
// gutters, caps, neighbouring lanes
const gutterMat = mat('#4a4f5c', { roughness: 0.4, metalness: 0.4 });
for (const side of [-1, 1]) {
  const gutter = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, LANE_LEN - 3, 16, 1, true, Math.PI / 2, Math.PI), gutterMat);
  gutter.rotation.x = Math.PI / 2;
  gutter.position.set(side * GUTTER_X, 0.02, -LANE_LEN / 2 + 1.5);
  gutter.material.side = THREE.DoubleSide;
  gutter.receiveShadow = true;
  scene.add(gutter);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, LANE_LEN), mat('#2b2d42', { roughness: 0.5 }));
  cap.position.set(side * 0.82, 0.03, 3 - LANE_LEN / 2);
  scene.add(cap);
  for (let k = 1; k <= 2; k++) {
    const other = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, LANE_LEN), lane.material);
    other.rotation.x = -Math.PI / 2;
    other.position.set(side * k * 1.75, 0, 3 - LANE_LEN / 2);
    scene.add(other);
  }
}
// masking unit above the pins with neon
const maskTex = canvasTex(1024, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#3a0ca3'); gr.addColorStop(0.5, '#7209b7'); gr.addColorStop(1, '#3a0ca3');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.font = '900 120px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff6fd8'; g.shadowBlur = 30; g.fillStyle = '#ffd6f5';
  g.fillText('★ STRIKE ★', w / 2, h / 2 + 6);
  g.fillStyle = '#21d4d4'; g.fillRect(0, h - 14, w, 14);
});
const mask = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: maskTex }));
mask.position.set(0, 1.62, HEAD_Z - 0.9);
scene.add(mask);
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), mat('#0d0820'));
backWall.position.set(0, 1.2, PIT_Z - 0.4);
scene.add(backWall);
const pitCurtain = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W + 0.4, 0.9), mat('#050308', { roughness: 1 }));
pitCurtain.position.set(0, 0.45, PIT_Z - 0.2);
scene.add(pitCurtain);
for (const side of [-1, 1]) {
  const kick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 1.6), mat('#1b1b22'));
  kick.position.set(side * (HALF + 0.2), 0.3, HEAD_Z - 0.6);
  scene.add(kick);
  const neon = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, LANE_LEN), new THREE.MeshBasicMaterial({ color: side < 0 ? '#ff6fd8' : '#21d4d4' }));
  neon.position.set(side * 0.9, 0.07, 3 - LANE_LEN / 2);
  scene.add(neon);
}

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------
function pinSpots() {
  const out = [];
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) out.push([(i - row / 2) * PIN_SPACING, HEAD_Z - row * PIN_SPACING * 0.866]);
  return out;
}
const profile = [[0, 0], [0.026, 0], [0.04, 0.02], [0.054, 0.07], [0.06, 0.11], [0.058, 0.15], [0.048, 0.2], [0.033, 0.245], [0.026, 0.27], [0.028, 0.3], [0.034, 0.335], [0.031, 0.36], [0.018, 0.377], [0, 0.381]].map(([r, y]) => new THREE.Vector2(r, y));
const pinGeo = new THREE.LatheGeometry(profile, 24);
const pinTex = canvasTex(64, 256, (g, w, h) => {
  g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
  const band = (v0, v1) => { g.fillStyle = '#e01e37'; g.fillRect(0, (1 - v1) * h, w, (v1 - v0) * h); };
  band(0.6, 0.64); band(0.665, 0.69);
});
const pinMat = new THREE.MeshStandardMaterial({ map: pinTex, roughness: 0.25 });
let pins = [];
function makePins() {
  pins.forEach((p) => scene.remove(p.m));
  pins = pinSpots().map(([x, z], i) => {
    const m = new THREE.Mesh(pinGeo, pinMat);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return { i, m, p: new THREE.Vector2(x, z), v: new THREE.Vector2(), tilt: 0, tiltV: 0, d: new THREE.Vector2(0, -1), down: false, gone: false, spin: Math.random() * 6, y: 0, vy: 0 };
  });
  pins.forEach(placePin);
}
const axis = new THREE.Vector3(), q = new THREE.Quaternion(), qs = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
function placePin(pin) {
  pin.m.visible = !pin.gone;
  pin.m.position.set(pin.p.x, pin.y, pin.p.y);
  axis.set(pin.d.y, 0, -pin.d.x).normalize();
  q.setFromAxisAngle(axis, pin.tilt);
  qs.setFromAxisAngle(up, pin.spin);
  pin.m.quaternion.copy(q).multiply(qs);
}
const standing = () => pins.filter((p) => !p.gone && !p.down && p.tilt < 0.35);

// ---------------------------------------------------------------------------
// Ball
// ---------------------------------------------------------------------------
const ballMats = {};
function ballMaterial(id) {
  if (ballMats[id]) return ballMats[id];
  const s = SKINS.find((k) => k.id === id) || SKINS[0];
  const tex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = s.a; g.fillRect(0, 0, w, h);
    // marbled swirls
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = i % 2 ? s.b : 'rgba(255,255,255,.25)';
      g.lineWidth = 6 + Math.random() * 16;
      g.globalAlpha = 0.35 + Math.random() * 0.4;
      g.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 220; y += (Math.random() - 0.5) * 120; g.quadraticCurveTo(x + 40, y - 40, x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
    if (s.stars) for (let i = 0; i < 120; i++) { g.fillStyle = '#ffffff'; g.globalAlpha = Math.random(); g.beginPath(); g.arc(Math.random() * w, Math.random() * h, Math.random() * 2, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    // finger holes
    g.fillStyle = '#0b0b0f';
    [[w * 0.25, h * 0.38, 10], [w * 0.25 + 26, h * 0.38 - 8, 10], [w * 0.25 + 12, h * 0.38 + 34, 12]].forEach(([x, y, r]) => { g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); g.fill(); });
  });
  ballMats[id] = new THREE.MeshStandardMaterial({ map: tex, roughness: s.metal ? 0.18 : 0.12, metalness: s.metal ? 0.6 : 0.1 });
  return ballMats[id];
}
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 24), ballMaterial(save.skin));
ball.castShadow = true;
scene.add(ball);
const B = { p: new THREE.Vector2(0, 0.6), v: new THREE.Vector2(), hook: 0, inGutter: false, rolling: false, y: BALL_R, vy: 0 };

// aiming guide on the lane
const guideTex = canvasTex(64, 512, (g, w, h) => {
  for (let y = 0; y < h; y += 48) { g.fillStyle = `rgba(255,255,255,${0.6 - (y / h) * 0.55})`; g.fillRect(w / 2 - 6, y, 12, 26); }
});
const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 4), new THREE.MeshBasicMaterial({ map: guideTex, transparent: true, depthWrite: false }));
guide.rotation.x = -Math.PI / 2;
scene.add(guide);

// ---------------------------------------------------------------------------
// Game state + scoring
// ---------------------------------------------------------------------------
let state = 'title';     // title | aim | rolling | settle | result | over
let paused = false, menuOpen = false;
let time = 0, settleT = 0, rollT = 0;
let rolls = [];          // pins knocked per roll
let frame = 0, rollInFrame = 0;
let hud = null, stopHand = null, retryUsed = false, snapshot = null;
let hitPins = false;

/** Frame-by-frame scoring. Returns [{marks:[...], total|null}] for 10 frames. */
function scoreCard(r) {
  const frames = [];
  let i = 0, total = 0;
  for (let f = 0; f < 10; f++) {
    const marks = [];
    let score = null;
    if (f < 9) {
      if (r[i] === 10) {
        marks.push('X');
        if (r[i + 1] !== undefined && r[i + 2] !== undefined) score = 10 + r[i + 1] + r[i + 2];
        i += 1;
      } else if (r[i] !== undefined) {
        marks.push(r[i] === 0 ? '-' : String(r[i]));
        if (r[i + 1] !== undefined) {
          if (r[i] + r[i + 1] === 10) { marks.push('/'); if (r[i + 2] !== undefined) score = 10 + r[i + 2]; }
          else { marks.push(r[i + 1] === 0 ? '-' : String(r[i + 1])); score = r[i] + r[i + 1]; }
        }
        i += 2;
      }
    } else {
      const a = r[i], b = r[i + 1], c = r[i + 2];
      if (a !== undefined) marks.push(a === 10 ? 'X' : a === 0 ? '-' : String(a));
      if (b !== undefined) marks.push(a === 10 ? (b === 10 ? 'X' : b === 0 ? '-' : String(b)) : a + b === 10 ? '/' : b === 0 ? '-' : String(b));
      if (c !== undefined) marks.push(c === 10 && (a + b === 10 || b === 10) ? 'X' : (a === 10 && b !== 10 && b + c === 10) ? '/' : c === 0 ? '-' : String(c));
      const needThird = a !== undefined && b !== undefined && (a === 10 || a + b === 10);
      if (a !== undefined && b !== undefined && (!needThird || c !== undefined)) score = a + b + (needThird ? c : 0);
    }
    if (score !== null) { total += score; frames.push({ marks, total }); } else frames.push({ marks, total: null });
  }
  return frames;
}
const runningTotal = () => { const c = scoreCard(rolls); let t = 0; c.forEach((f) => { if (f.total !== null) t = f.total; }); return t; };

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------
const PIN_TIP_IMPULSE = 0.9;
/** closest points between segments a0-a1 and b0-b1 (2D); returns {d, pa, pb, sa, sb} */
function segSeg(a0, a1, b0, b1) {
  const d1 = a1.clone().sub(a0), d2 = b1.clone().sub(b0), r = a0.clone().sub(b0);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a < 1e-9 && e < 1e-9) { s = t = 0; }
  else if (a < 1e-9) { s = 0; t = THREE.MathUtils.clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e < 1e-9) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
    }
  }
  const pa = a0.clone().addScaledVector(d1, s), pb = b0.clone().addScaledVector(d2, t);
  return { d: pa.distanceTo(pb), pa, pb, sa: s, sb: t };
}
const pinSeg = (pin) => {
  const reach = PIN_H * 0.85 * Math.sin(Math.min(Math.PI / 2, pin.tilt));
  return [pin.p, pin.p.clone().addScaledVector(pin.d, reach)];
};
// velocity of a point along a falling pin (its head swings outward)
const pinPointVel = (pin, s) => pin.v.clone().addScaledVector(pin.d, pin.tiltV * Math.cos(pin.tilt) * PIN_H * 0.85 * s);

function knock(pin, impulseVec) {
  const mag = impulseVec.length();
  if (mag < 1e-4) return;
  if (pin.tilt < 0.02 && mag > PIN_TIP_IMPULSE * 0.5) {
    pin.d.copy(impulseVec).normalize();
    pin.tiltV = Math.max(pin.tiltV, Math.min(9, mag * 2.2));
    pin.tilt = 0.03;
    if (!hitPins) { hitPins = true; }
    noise(0, 0.05, Math.min(0.28, mag * 0.05), 2600, 1.2);
    tone(700 + Math.random() * 400, 0, 0.05, 'triangle', Math.min(0.12, mag * 0.02));
  }
}

function stepPhysics(dt) {
  // ball
  if (B.rolling) {
    if (!B.inGutter) {
      // oil pattern: the ball skids for the first part of the lane, then hooks
      if (B.p.y < -8 && B.p.y > HEAD_Z - 0.5) B.v.x += B.hook * dt;
      if (Math.abs(B.p.x) > HALF - 0.02) {
        B.inGutter = true;
        B.v.x = 0;
        B.v.y = Math.min(B.v.y, -5);
        thud(0.4);
      }
    } else {
      B.p.x += (Math.sign(B.p.x) * GUTTER_X - B.p.x) * Math.min(1, dt * 10);
      B.y += (BALL_R - 0.07 - B.y) * Math.min(1, dt * 10);
    }
    B.p.addScaledVector(B.v, dt);
    if (B.p.y < PIT_Z) { B.rolling = false; B.p.y = PIT_Z - 0.3; if (state === 'rolling') { state = 'settle'; settleT = 0; } thud(0.6); }
  }
  // ball vs pins
  if (B.rolling && !B.inGutter) {
    for (const pin of pins) {
      if (pin.gone) continue;
      const [s0, s1] = pinSeg(pin);
      const hit = segSeg(B.p, B.p, s0, s1);
      const minD = BALL_R + PIN_R;
      if (hit.d < minD) {
        const n = hit.pa.clone().sub(hit.pb);
        if (n.lengthSq() < 1e-10) n.set(0, 1);
        n.normalize();
        const overlap = minD - hit.d;
        B.p.addScaledVector(n, overlap * (PIN_MASS / (BALL_MASS + PIN_MASS)));
        pin.p.addScaledVector(n, -overlap * (BALL_MASS / (BALL_MASS + PIN_MASS)));
        const rel = B.v.clone().sub(pinPointVel(pin, hit.sb));
        const vn = rel.dot(n);
        if (vn < 0) {
          const j = (-(1 + 0.45) * vn) / (1 / BALL_MASS + 1 / PIN_MASS);
          B.v.addScaledVector(n, j / BALL_MASS);
          const imp = n.clone().multiplyScalar(-j / PIN_MASS);
          pin.v.add(imp);
          knock(pin, imp.clone().add(B.v.clone().multiplyScalar(0.15)));
          if (j > 2) { tone(240, 0, 0.06, 'square', 0.08); }
        }
      }
    }
  }
  // pin vs pin
  for (let a = 0; a < pins.length; a++) {
    const A = pins[a];
    if (A.gone) continue;
    for (let b = a + 1; b < pins.length; b++) {
      const P = pins[b];
      if (P.gone) continue;
      if (A.p.distanceToSquared(P.p) > 0.6) continue;
      const [a0, a1] = pinSeg(A), [b0, b1] = pinSeg(P);
      const hit = segSeg(a0, a1, b0, b1);
      const minD = PIN_R * 2;
      if (hit.d < minD) {
        const n = hit.pa.clone().sub(hit.pb);
        if (n.lengthSq() < 1e-10) n.set(Math.random() - 0.5, Math.random() - 0.5);
        n.normalize();
        const overlap = minD - hit.d;
        // push the standing one more (fallen pins are heavy on the deck)
        const wa = A.down ? 0.2 : 0.5, wb = P.down ? 0.2 : 0.5;
        A.p.addScaledVector(n, overlap * wa);
        P.p.addScaledVector(n, -overlap * wb);
        const rel = pinPointVel(A, hit.sa).sub(pinPointVel(P, hit.sb));
        const vn = rel.dot(n);
        if (vn < 0) {
          const j = (-(1 + 0.3) * vn) / (2 / PIN_MASS);
          const imp = n.clone().multiplyScalar(j / PIN_MASS);
          A.v.add(imp.clone().multiplyScalar(A.down ? 0.4 : 1));
          P.v.sub(imp.clone().multiplyScalar(P.down ? 0.4 : 1));
          knock(A, imp.clone().multiplyScalar(PIN_MASS));
          knock(P, imp.clone().multiplyScalar(-PIN_MASS));
        }
      }
    }
  }
  // pin motion
  for (const pin of pins) {
    if (pin.gone) continue;
    if (pin.tilt > 0) {
      if (!pin.down) {
        pin.tiltV += 22 * Math.sin(pin.tilt + 0.05) * dt;
        pin.tilt += pin.tiltV * dt;
        if (pin.tilt >= Math.PI / 2) {
          pin.tilt = Math.PI / 2;
          pin.down = true;
          pin.v.addScaledVector(pin.d, pin.tiltV * 0.12);
          pin.tiltV = 0;
          pin.y = 0.04;
          noise(0, 0.07, 0.12, 900);
        }
      }
    }
    pin.p.addScaledVector(pin.v, dt);
    const fr = pin.down ? 2.2 : 3.2;
    pin.v.multiplyScalar(Math.max(0, 1 - fr * dt));
    if (pin.down) pin.spin += pin.v.length() * dt * 6;
    // off the deck: into the pit or the gutters
    if (pin.p.y < PIT_Z + 0.1 || Math.abs(pin.p.x) > HALF + 0.08) {
      pin.down = true;
      pin.tilt = Math.max(pin.tilt, 1.2);
      pin.y -= dt * 1.5;
      if (pin.y < -0.4) pin.gone = true;
    }
  }
}
function thud(v) { tone(70, 0, 0.18, 'sine', v * 0.4, 45); noise(0, 0.12, v * 0.15, 260); }

// ---------------------------------------------------------------------------
// Throw input
// ---------------------------------------------------------------------------
let drag = null;
const pxPerMetre = () => {
  const a = new THREE.Vector3(0, BALL_R, B.p.y).project(camera), b = new THREE.Vector3(1, BALL_R, B.p.y).project(camera);
  return Math.max(40, ((b.x - a.x) / 2) * window.innerWidth);
};
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (paused || menuOpen || state !== 'aim') return;
  drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, bx: B.p.x, pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }], lifted: false };
  e.preventDefault();
});
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || state !== 'aim') return;
  drag.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  if (drag.pts.length > 80) drag.pts.shift();
  const up = drag.y0 - e.clientY;
  if (up > 28) drag.lifted = true;
  if (!drag.lifted) {
    // line up: slide the ball across the approach
    B.p.x = THREE.MathUtils.clamp(drag.bx + (e.clientX - drag.x0) / pxPerMetre(), -HALF + BALL_R, HALF - BALL_R);
  }
});
window.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (state !== 'aim' || paused || menuOpen) return;
  d.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  // the throw is the stroke from the lowest point of the gesture to release
  let lo = 0;
  d.pts.forEach((p, i) => { if (p.y >= d.pts[lo].y) lo = i; });
  const stroke = d.pts.slice(lo);
  const s0 = stroke[0], s1 = stroke[stroke.length - 1];
  const dy = s0.y - s1.y, dx = s1.x - s0.x;
  if (dy < 60) return;
  const ms = Math.max(30, s1.t - s0.t);
  const speedPx = dy / ms; // px per ms
  // curvature: largest sideways bulge of the stroke relative to its chord
  let bulge = 0;
  const len = Math.hypot(dx, dy) || 1;
  for (const p of stroke) {
    const cross = ((p.x - s0.x) * -dy - (p.y - s0.y) * dx) / len; // signed distance from the chord
    if (Math.abs(cross) > Math.abs(bulge)) bulge = cross;
  }
  bowl(dx / dy, speedPx, bulge / len);
});

/**
 * Release the ball. slope: sideways px per upward px of the swipe;
 * speedPx: swipe speed; curve: signed bulge/length of the stroke.
 */
function bowl(slope, speedPx, curve) {
  const speed = THREE.MathUtils.clamp(5.5 + speedPx * 2.2, 6, 10.5);
  // the lane is narrow: map the swipe angle onto a gentle line
  const angle = THREE.MathUtils.clamp(Math.atan(slope) * 0.12, -0.05, 0.05);
  B.v.set(Math.sin(angle) * speed, -Math.cos(angle) * speed);
  // a stroke bowed out to the right hooks back left, and vice versa
  B.hook = THREE.MathUtils.clamp(curve * 9, -1.4, 1.4);
  B.rolling = true;
  B.inGutter = false;
  state = 'rolling';
  rollT = 0;
  hitPins = false;
  guide.visible = false;
  snapshot = { pins: pins.map((p) => ({ p: p.p.clone(), gone: p.gone, down: p.down, tilt: p.tilt, d: p.d.clone(), spin: p.spin, y: p.y })), rolls: rolls.slice(), frame, rollInFrame, ballX: B.p.x };
  sfx.whoosh();
  UI.buzz(8);
  if (stopHand) { stopHand(); stopHand = null; save.tutorial = true; persist(); }
}

// ---------------------------------------------------------------------------
// Roll results
// ---------------------------------------------------------------------------
function settleRoll() {
  const before = pins.filter((p) => !p.wasDown).length;
  pins.forEach((p) => { if (p.tilt >= 0.35 || p.down || p.gone) p.down = true; });
  const now = pins.filter((p) => !p.down).length;
  const knocked = before - now;
  rolls.push(knocked);
  const isTenth = frame === 9;
  const first = rollInFrame === 0;
  let label = knocked === 0 ? (B.inGutter ? 'GUTTER BALL' : 'MISS') : knocked + (knocked === 1 ? ' PIN' : ' PINS');
  let resetPins = false, nextFrame = false;
  if (!isTenth) {
    if (first && knocked === 10) { label = 'STRIKE!'; nextFrame = true; }
    else if (!first && now === 0) { label = 'SPARE!'; nextFrame = true; }
    else if (!first) nextFrame = true;
  } else {
    const r = rolls.slice(rollStartOfTenth());
    // was this roll at a full rack? then clearing it is a strike, otherwise a spare
    const fresh = rollInFrame === 0 || (rollInFrame === 1 && r[0] === 10) || (rollInFrame === 2 && ((r[0] === 10 && r[1] === 10) || (r[0] < 10 && r[0] + r[1] === 10)));
    if (now === 0) { label = fresh ? 'STRIKE!' : 'SPARE!'; resetPins = true; }
    if (r.length === 3 || (r.length === 2 && r[0] + r[1] < 10)) nextFrame = true;
  }
  if (label === 'STRIKE!') {
    save.strikes++;
    UI.praise('STRIKE!', '#ffd60a');
    sfx.fanfare();
    UI.buzz([30, 40, 30, 40, 60]);
    burstStrike();
  } else if (label === 'SPARE!') {
    UI.praise('SPARE!', '#7dffb2');
    sfx.win();
  } else {
    const s = { x: window.innerWidth / 2, y: window.innerHeight * 0.36 };
    UI.floatText(label, s.x, s.y, knocked ? '#ffffff' : '#ff8fa3');
    if (!knocked) sfx.bad(); else sfx.good();
  }
  updateCard();
  state = 'result';
  const canRetry = !retryUsed && label !== 'STRIKE!' && !(label === 'SPARE!');
  if (canRetry) showRetry();
  clearTimeout(resultTimer);
  advance = () => {
    hideRetry();
    advance = null;
    // sweep the fallen pins
    pins.forEach((p) => { if (p.down) { p.gone = true; p.wasDown = true; } });
    if (nextFrame) {
      if (frame === 9) { gameOver(); return; }
      frame++;
      rollInFrame = 0;
      resetRack();
    } else {
      rollInFrame++;
      if (resetPins) resetRack();
      else straightenStanding();
    }
    readyBall();
  };
  resultTimer = setTimeout(() => { if (state === 'result' && advance) advance(); }, canRetry ? 2600 : 1700);
}
let resultTimer = 0, advance = null;
function rollStartOfTenth() {
  // index in rolls[] where frame 10 begins
  let i = 0;
  for (let f = 0; f < 9; f++) i += rolls[i] === 10 ? 1 : 2;
  return i;
}
function resetRack() { makePins(); }
function straightenStanding() {
  pins.forEach((p) => { if (!p.gone) { p.tilt = 0; p.tiltV = 0; p.v.set(0, 0); placePin(p); } });
}

// strike fireworks above the deck
const sparks = [];
const sparkGeo = new THREE.SphereGeometry(0.03, 6, 4);
function burstStrike() {
  const cols = ['#ffd60a', '#ff6fd8', '#21d4d4', '#ffffff'];
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: cols[i % 4], transparent: true }));
    m.position.set((Math.random() - 0.5) * 0.6, 0.8, HEAD_Z - 0.3);
    scene.add(m);
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
    sparks.push({ m, v: new THREE.Vector3(Math.cos(a) * s, 1.5 + Math.random() * 2.5, Math.sin(a) * s * 0.5), life: 1.4 });
  }
}

// rewarded retry: one per game, restores the rack and rolls
let retryEl = null;
function showRetry() {
  hideRetry();
  retryEl = UI.button('Retry roll', async () => {
    hideRetry();
    if (state !== 'result' || retryUsed) return;
    clearTimeout(resultTimer);
    state = 'ad';
    const ok = await YT.rewarded('retry_roll');
    if (!ok) { state = 'result'; if (advance) advance(); return; }
    retryUsed = true;
    advance = null;
    restoreSnapshot();
    UI.praise('TRY AGAIN!', '#7dffb2');
  }, { style: 'gold', ad: true, small: true });
  retryEl.classList.add('bw-retry');
  document.getElementById('ui').appendChild(retryEl);
}
function hideRetry() { if (retryEl) { retryEl.remove(); retryEl = null; } }
function restoreSnapshot() {
  const s = snapshot;
  rolls = s.rolls.slice();
  frame = s.frame;
  rollInFrame = s.rollInFrame;
  pins.forEach((p, i) => {
    const o = s.pins[i];
    p.p.copy(o.p); p.gone = o.gone; p.down = o.down; p.wasDown = o.gone; p.tilt = o.tilt; p.tiltV = 0; p.d.copy(o.d); p.spin = o.spin; p.y = o.y; p.v.set(0, 0);
    placePin(p);
  });
  updateCard();
  readyBall(s.ballX);
}

function readyBall(x) {
  B.p.set(x ?? 0, 0.6);
  B.v.set(0, 0);
  B.y = BALL_R;
  B.rolling = false;
  B.inGutter = false;
  B.hook = 0;
  ball.material = ballMaterial(save.skin);
  ball.visible = true;
  guide.visible = true;
  state = 'aim';
  pins.forEach((p) => { if (p.gone) p.wasDown = true; });
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .bw-card { position:absolute; left:50%; top:calc(max(10px, env(safe-area-inset-top)) + 58px); transform:translateX(-50%); display:grid; grid-template-columns: repeat(9, 1fr) 1.4fr; width:min(560px, calc(100% - 16px));
    background:rgba(12,8,30,.78); border-radius:12px; overflow:hidden; box-shadow: inset 0 0 0 2px rgba(255,255,255,.14); pointer-events:none !important; color:#fff; font:800 11px var(--font); }
  .bw-f { border-right:1px solid rgba(255,255,255,.14); text-align:center; }
  .bw-f:last-child { border-right:0; }
  .bw-f .n { font-size:9px; opacity:.55; padding-top:2px; }
  .bw-f .m { display:flex; justify-content:flex-end; gap:0; min-height:15px; }
  .bw-f .m span { min-width:12px; padding:0 1px; font-size:12px; }
  .bw-f .m span.x { color:#ffd60a; }
  .bw-f .m span.s { color:#7dffb2; }
  .bw-f .t { font-size:13px; min-height:17px; padding-bottom:2px; }
  .bw-f.cur { background:rgba(255,214,10,.16); }
  .bw-retry { position:absolute; left:50%; bottom:max(28px, env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:5; animation: fs-pop .3s cubic-bezier(.2,1.5,.4,1); }
`;
document.head.appendChild(css);
let cardEl = null;
function ensureHud() {
  if (hud) return;
  hud = UI.hud({ coins: save.coins, level: 'Frame 1', right: [UI.iconButton('❚❚', 'Pause', openPause)] });
  cardEl = document.createElement('div');
  cardEl.className = 'bw-card';
  document.getElementById('ui').appendChild(cardEl);
}
function updateCard() {
  const card = scoreCard(rolls);
  cardEl.innerHTML = card.map((f, i) => '<div class="bw-f' + (i === frame && state !== 'over' ? ' cur' : '') + '"><div class="n">' + (i + 1) + '</div><div class="m">' +
    f.marks.map((m) => '<span class="' + (m === 'X' ? 'x' : m === '/' ? 's' : '') + '">' + m + '</span>').join('') + '</div><div class="t">' + (f.total ?? '') + '</div></div>').join('');
  hud.setLevel(frame === 9 ? 'Final frame' : 'Frame ' + (frame + 1));
  hud.setProgress(frame / 10);
}

function showTitle() {
  state = 'title';
  if (hud) { hud.show(false); cardEl.style.display = 'none'; }
  hideRetry();
  makePins();
  readyBall();
  state = 'title';
  guide.visible = false;
  UI.titleScreen({
    line1: 'BOWLING', line2: 'STRIKE 3D',
    tagline: 'Swipe up to bowl. Curve your swipe to hook it into the pocket.',
    best: save.best ? 'Best ' + save.best + ' · ' + save.strikes + ' strikes' : 'Ten frames. Go for 300!',
    onPlay: startGame,
    extra: [
      UI.button('🎳 Balls', openShop, { style: 'blue', small: true }),
      UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true }),
    ],
  });
}

function startGame() {
  initAudio(() => save.sound);
  ensureHud();
  hud.show(true);
  cardEl.style.display = '';
  hud.setCoins(save.coins);
  rolls = []; frame = 0; rollInFrame = 0; retryUsed = false;
  makePins();
  readyBall();
  updateCard();
  if (!save.tutorial) {
    stopHand = UI.tutorialHand(() => {
      const s = toScreen(new THREE.Vector3(B.p.x, BALL_R, B.p.y));
      return [[s.x, s.y + 10], [s.x, s.y - window.innerHeight * 0.3]];
    }, 'Swipe up fast to bowl');
  }
}

function openPause() {
  if (state === 'title' || state === 'over') return;
  menuOpen = true;
  const p = UI.panel({
    title: 'Paused',
    buttons: [
      UI.button('Resume', () => { p.close(); menuOpen = false; }, { style: 'green' }),
      UI.button('New game', () => { p.close(); menuOpen = false; hideRetry(); startGame(); }),
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
      onSelect: (it) => { save.skin = it.id; persist(); ball.material = ballMaterial(save.skin); render(); },
      onBuy: (it) => { if (save.coins < it.price) return; save.coins -= it.price; save.owned[it.id] = true; save.skin = it.id; persist(true); ball.material = ballMaterial(save.skin); sfx.good(); render(); },
      onAdUnlock: async (it) => { if (await YT.rewarded('ball_' + it.id)) { save.owned[it.id] = true; save.skin = it.id; persist(true); ball.material = ballMaterial(save.skin); sfx.fanfare(); } render(); },
      onClose: () => p.close(),
    });
  };
  render();
}

function gameOver() {
  state = 'over';
  updateCard();
  const total = runningTotal();
  const strikes = scoreCard(rolls).reduce((n, f) => n + f.marks.filter((m) => m === 'X').length, 0);
  const isBest = total > save.best;
  if (isBest) save.best = total;
  save.games++;
  const reward = Math.round(total / 3) + strikes * 4 + (isBest ? 25 : 0);
  persist(true);
  YT.sendScore(save.best);
  sfx.fanfare();
  const stars = total >= 200 ? 3 : total >= 120 ? 2 : 1;
  const body = document.createElement('div');
  body.innerHTML = UI.starsHtml(stars) + '<div class="big">' + total + '</div><div class="sub">' + (isBest ? '🏆 New best!' : 'Best ' + save.best) + ' · ' + strikes + ' strike' + (strikes === 1 ? '' : 's') + '</div><div class="reward"><span class="fs-coin" style="position:static;margin:0"></span><b>0</b></div>';
  UI.countUp(body.querySelector('.reward b'), 0, reward, 700);
  const collect = (mult) => {
    p.close();
    const gained = reward * mult;
    UI.coinBurst(window.innerWidth / 2, window.innerHeight / 2, 10, hud.coinEl, (i) => { sfx.coin(i); hud.setCoins(Math.round(save.coins - gained + (gained * (i + 1)) / 10), true); });
    save.coins += gained;
    persist(true);
    setTimeout(() => {
      hud.setCoins(save.coins);
      const next = () => startGame();
      if (save.games % 2 === 0) YT.interstitial().then(next); else next();
    }, 1000);
  };
  const p = UI.panel({
    title: isBest ? 'New best!' : 'Game over', gold: isBest, body,
    buttons: [
      UI.button('Claim ×2', async () => { if (await YT.rewarded('double_coins')) collect(2); }, { style: 'gold', ad: true }),
      UI.button('Play again', () => collect(1), { style: 'green' }),
      UI.button('Home', () => { p.close(); save.coins += reward; persist(true); showTitle(); }, { style: 'ghost', small: true }),
    ],
  });
}

const proj = new THREE.Vector3();
function toScreen(v) {
  proj.copy(v).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
}

// ---------------------------------------------------------------------------
// Update + camera
// ---------------------------------------------------------------------------
const camPos = new THREE.Vector3(0, 1.1, 2.2), camLook = new THREE.Vector3(0, 0, -10);
const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
let lastTick = 0;
function update(dt) {
  time += dt;
  if (state === 'rolling' || state === 'settle' || state === 'result' || state === 'ad') {
    const sub = 8;
    for (let i = 0; i < sub; i++) stepPhysics(dt / sub);
  }
  if (state === 'rolling') {
    rollT += dt;
    // rumble ticks while the ball rolls
    if (time - lastTick > 0.07 && B.rolling) { lastTick = time; noise(0, 0.08, B.inGutter ? 0.05 : 0.035, 160, 0.7); }
    if (rollT > 9) { state = 'settle'; settleT = 0; }
  }
  if (state === 'settle') {
    settleT += dt;
    const moving = pins.some((p) => !p.gone && (p.v.length() > 0.05 || (p.tilt > 0 && !p.down)));
    if ((settleT > 1.2 && !moving) || settleT > 3.5) settleRoll();
  }
  // ball visuals
  ball.position.set(B.p.x, B.y, B.p.y);
  if (B.rolling) {
    const sp = B.v.length();
    ball.rotation.x -= (sp / BALL_R) * dt * 0.2;
    ball.rotation.z += B.hook * dt * 2;
  }
  ball.visible = B.p.y > PIT_Z - 0.2;
  guide.position.set(B.p.x, 0.003, B.p.y - 2.2);
  if (state === 'aim' || state === 'title') ball.rotation.y = Math.sin(time * 1.5) * 0.3;
  pins.forEach(placePin);
  // camera: behind the ball, then parks in front of the pins
  if (state === 'aim' || state === 'title') {
    wantPos.set(B.p.x * 0.6, portrait ? 1.05 : 1.0, B.p.y + (portrait ? 1.9 : 2.4));
    wantLook.set(B.p.x * 0.3, 0.05, HEAD_Z + 6);
  } else {
    const z = Math.max(B.p.y + 1.6, HEAD_Z + (portrait ? 5.4 : 4.6));
    wantPos.set(B.p.x * 0.4, portrait ? 0.95 : 0.85, B.rolling ? z : HEAD_Z + (portrait ? 5.4 : 4.6));
    wantLook.set(0, 0.1, B.rolling ? Math.max(B.p.y - 6, HEAD_Z) : HEAD_Z - 0.3);
  }
  const k = Math.min(1, dt * (state === 'rolling' ? 6 : 3));
  camPos.lerp(wantPos, k);
  camLook.lerp(wantLook, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  sun.position.set(camPos.x + 1.5, 6, camPos.z - 1);
  sun.target.position.set(camPos.x, 0, camPos.z - 3);
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    s.v.y -= 4 * dt;
    s.m.position.addScaledVector(s.v, dt);
    s.m.material.opacity = Math.min(1, s.life);
    if (s.life <= 0) { scene.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); }
  }
}

let last = performance.now(), firstFrame = true;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused && !menuOpen) update(dt);
  renderer.render(scene, camera);
  if (firstFrame) { firstFrame = false; YT.firstFrameReady(); }
  requestAnimationFrame(loop);
}

YT.onPause(() => { paused = true; suspendAudio(); });
YT.onResume(() => { paused = false; last = performance.now(); resumeAudio(); });

// read-only hook for automated play-tests
window.__bowl = {
  info: () => ({
    state, frame, rollInFrame, rolls: rolls.slice(), total: runningTotal(), retryUsed,
    ball: toScreen(new THREE.Vector3(B.p.x, BALL_R, B.p.y)), ballX: B.p.x, standing: standing().map((p) => [p.p.x, p.p.y]),
  }),
};

(async function boot() {
  YT.init('bowling-strike');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  if (!save.owned) save.owned = { cobalt: true };
  ball.material = ballMaterial(save.skin);
  resize();
  showTitle();
  requestAnimationFrame(loop);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
