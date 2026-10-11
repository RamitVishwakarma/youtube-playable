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
import { studio, glossy, metal, matte, canvasTexture, skyGradient, blob, fitShadow } from 'look';

const COLORS = [
  { id: 'red', hex: '#ff4d5e' }, { id: 'blue', hex: '#3d8bff' }, { id: 'yellow', hex: '#ffd23f' },
  { id: 'green', hex: '#2ecc71' }, { id: 'purple', hex: '#b15cff' }, { id: 'orange', hex: '#ff8f2b' },
  { id: 'cyan', hex: '#21d4d4' }, { id: 'pink', hex: '#ff6fd8' },
];
const SEATS = 3;
const BENCHES = 5;      // bench seats at the start of a level
const MAX_BENCHES = 7;  // a rewarded ad can add two more
const CELL = 1.1;
const TILE_Y = 0.1;     // top of the plaza tiles

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
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = skyGradient([[0, '#7cc8ff'], [1, '#d8f1ff']]);
scene.fog = new THREE.Fog('#cfe9f7', 34, 70);
studio(renderer, scene, { intensity: 0.55 });
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x5d7f4a, 0.55));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
sun.position.set(6, 15, 7);
sun.target.position.set(0, 0, -3.2);
fitShadow(sun, 10, 2048);
Object.assign(sun.shadow.camera, { near: 1, far: 45 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun, sun.target);

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
const camBase = new THREE.Vector3();
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
  camBase.copy(camera.position);
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// Geometry helpers: bake coloured parts into one merged mesh
// ---------------------------------------------------------------------------
const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, o || {}));
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const tmpCol = new THREE.Color();
/** A copy of geo, moved into place and painted with a vertex colour, ready for mergeGeometries. */
function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(sx, sy, sz));
  g.applyMatrix4(tmpM);
  tmpCol.set(color).convertSRGBToLinear();
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = tmpCol.r; c[i * 3 + 1] = tmpCol.g; c[i * 3 + 2] = tmpCol.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function baked(parts, o = {}) {
  const geo = THREE.mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.75 }, o)));
  m.castShadow = m.receiveShadow = true;
  return m;
}
const rbox = (w, h, d, r = 0.05, s = 2) => new THREE.RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const SPHERE = new THREE.SphereGeometry(1, 14, 10);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const CONE = new THREE.ConeGeometry(1, 1, 12);
const rand = mulberry32(90210);

// ---------------------------------------------------------------------------
// Static scenery: grass, road with markings, pavement, kerb
// ---------------------------------------------------------------------------
function speckle(g, w, h, n, colors, size = 2) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(Math.random() * w, Math.random() * h, size, size); }
}
const grassTex = canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#7cc95a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(30,90,20,0.06)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 0, 7); g.fill(); }
  speckle(g, w, h, 900, ['#6bb84c', '#8fd96a', '#5fa844', '#9be27a'], 2);
}, { repeat: [24, 24] });
const grass = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
grass.rotation.x = -Math.PI / 2;
grass.position.z = -10;
grass.receiveShadow = true;
scene.add(grass);

const ROAD_Z0 = -0.05, ROAD_Z1 = 4.6;
const roadTex = canvasTexture(512, 256, (g, w, h) => {
  g.fillStyle = '#454b59'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 2600, ['#3d4250', '#50576a', '#4a5061', '#383c48'], 2);
  const zy = (z) => ((z - ROAD_Z0) / (ROAD_Z1 - ROAD_Z0)) * h;
  // edge lines and the centre dashes
  g.fillStyle = '#f3f3ee';
  g.fillRect(0, zy(4.38), w, 5);
  for (let x = 0; x < w; x += 128) g.fillRect(x + 20, zy(3.2) - 3, 72, 6);
  // yellow bus-stop zigzag along the kerb
  g.strokeStyle = '#ffd23f'; g.lineWidth = 4; g.beginPath();
  for (let x = 0; x <= w; x += 32) g.lineTo(x, zy(x % 64 ? 0.12 : 0.36));
  g.stroke();
}, { repeat: [6, 1] });
const road = new THREE.Mesh(new THREE.PlaneGeometry(72, ROAD_Z1 - ROAD_Z0), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92 }));
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0.006, (ROAD_Z0 + ROAD_Z1) / 2);
road.receiveShadow = true;
scene.add(road);
// painted bus bay in front of the stop
const bayTex = canvasTexture(512, 256, (g, w, h) => {
  g.strokeStyle = '#ffd23f'; g.lineWidth = 10; g.setLineDash([34, 20]);
  g.strokeRect(10, 10, w - 20, h - 20);
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,210,63,0.9)'; g.font = '900 92px system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('BUS STOP', w / 2, h / 2 + 6);
});
const bay = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.0), new THREE.MeshStandardMaterial({ map: bayTex, transparent: true, roughness: 0.9, depthWrite: false }));
bay.rotation.x = -Math.PI / 2;
bay.position.set(0, 0.012, 1.5);
bay.receiveShadow = true;
scene.add(bay);

const paveTex = canvasTexture(256, 128, (g, w, h) => {
  g.fillStyle = '#d6d9df'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const l = 236 - ((r * 3 + c * 5) % 4) * 6;
    g.fillStyle = `rgb(${l},${l + 2},${l + 6})`;
    g.fillRect(c * 64 + (r % 2) * 32 + 2, r * 64 + 2, 60, 60);
    g.fillRect(c * 64 + (r % 2) * 32 - 254, r * 64 + 2, 60, 60);
  }
  speckle(g, w, h, 300, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.3)'], 2);
}, { repeat: [40, 1] });
const paveMat = new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.85 });
for (const [z0, z1] of [[-1.45, -0.25], [4.75, 6.2]]) {
  const pv = new THREE.Mesh(new THREE.PlaneGeometry(72, z1 - z0), paveMat);
  pv.rotation.x = -Math.PI / 2;
  pv.position.set(0, 0.01, (z0 + z1) / 2);
  pv.receiveShadow = true;
  scene.add(pv);
}
const kerbGeo = rbox(72, 0.14, 0.26, 0.05);
for (const z of [-0.15, 4.66]) {
  const k = new THREE.Mesh(kerbGeo, matte('#eef0f3'));
  k.position.set(0, 0.04, z);
  k.receiveShadow = true;
  scene.add(k);
}

const benchGroup = new THREE.Group();
scene.add(benchGroup);
const world = new THREE.Group();
scene.add(world);
const backdrop = new THREE.Group(); // shops and trees behind the plaza, moved per level
scene.add(backdrop);

// trees, bushes, lamps and the bus shelter: everything static in one mesh
function tree(parts, x, z, s = 1, tint = 0) {
  const greens = ['#3fae49', '#57c44f', '#2f9e44', '#74d15a'];
  parts.push(part(CYL, '#8b5a2b', x, 0.5 * s, z, 0, 0, 0, 0.13 * s, 1 * s, 0.13 * s));
  const cg = new THREE.IcosahedronGeometry(1, 2);
  const blobs = [[0, 1.45, 0, 0.72], [0.38, 1.2, 0.18, 0.5], [-0.34, 1.25, -0.12, 0.52], [0.05, 1.85, -0.05, 0.45]];
  blobs.forEach(([bx, by, bz, br], i) => parts.push(part(cg, greens[(tint + i) % 4], x + bx * s, by * s, z + bz * s, 0, 0, 0, br * s)));
  cg.dispose();
}
function bush(parts, x, z, s = 1) {
  parts.push(part(SPHERE, '#3fae49', x, 0.2 * s, z, 0, 0, 0, 0.45 * s, 0.36 * s, 0.4 * s));
  parts.push(part(SPHERE, '#5cc552', x + 0.3 * s, 0.18 * s, z + 0.1 * s, 0, 0, 0, 0.3 * s, 0.26 * s, 0.3 * s));
  for (let k = 0; k < 3; k++) parts.push(part(SPHERE, ['#ff6fa8', '#fff27a', '#ffffff'][k], x - 0.2 * s + k * 0.2 * s, 0.42 * s, z + 0.18 * s, 0, 0, 0, 0.06 * s));
}
function lamp(parts, x, z, face = 1) {
  parts.push(part(CYL, '#3b4256', x, 1.3, z, 0, 0, 0, 0.05, 2.6, 0.05));
  parts.push(part(CYL, '#3b4256', x, 0.08, z, 0, 0, 0, 0.12, 0.16, 0.12));
  parts.push(part(rbox(0.06, 0.06, 0.6, 0.02), '#3b4256', x, 2.55, z + face * 0.27));
  parts.push(part(rbox(0.26, 0.12, 0.34, 0.05), '#3b4256', x, 2.5, z + face * 0.55));
  parts.push(part(rbox(0.2, 0.04, 0.28, 0.02), '#fff3c4', x, 2.43, z + face * 0.55));
}
(function scenery() {
  const P = [];
  // the far side of the road
  for (let i = 0; i < 9; i++) tree(P, -16 + i * 4 + rand() * 1.5, 7.6 + rand() * 1.5, 1 + rand() * 0.4, i);
  for (let i = 0; i < 6; i++) lamp(P, -15 + i * 6, 5.9, -1);
  // either side of the plaza
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) tree(P, side * (6.2 + rand() * 4 + (i % 2) * 2.5), -2 - i * 2.4 - rand(), 0.9 + rand() * 0.5, i + (side > 0 ? 2 : 0));
    for (let i = 0; i < 3; i++) bush(P, side * (4.8 + rand() * 0.8), -2.6 - i * 2.2, 0.9 + rand() * 0.3);
    lamp(P, side * 4.4, -0.45, 1);
  }
  // bus shelter on the pavement to the left
  const sx = -5.6, sz = -0.95;
  for (const dx of [-1.1, 1.1]) P.push(part(CYL, '#9aa4b5', sx + dx, 1.05, sz - 0.35, 0, 0, 0, 0.05, 2.1, 0.05));
  P.push(part(rbox(2.6, 0.1, 1.1, 0.04), '#ff4d5e', sx, 2.12, sz));
  P.push(part(rbox(2.4, 0.12, 0.4, 0.04), '#8a5a3c', sx, 0.42, sz - 0.1));
  P.push(part(rbox(2.4, 0.4, 0.05, 0.02), '#2b2f3a', sx, 1.85, sz + 0.5));
  // bus stop pole on the right
  P.push(part(CYL, '#9aa4b5', 3.8, 1.1, -0.45, 0, 0, 0, 0.04, 2.2, 0.04));
  P.push(part(CYL, '#ff4d5e', 3.8, 2.2, -0.45, Math.PI / 2, 0, 0, 0.3, 0.05, 0.3));
  P.push(part(CYL, '#ffffff', 3.8, 2.2, -0.42, Math.PI / 2, 0, 0, 0.22, 0.02, 0.22));
  scene.add(baked(P));
  // shelter glass
  const glass = new THREE.Mesh(rbox(2.3, 1.5, 0.04, 0.02), new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 }));
  glass.position.set(sx, 1.15, sz - 0.4);
  scene.add(glass);
  // bus stop sign face
  const stop = canvasTexture(128, 128, (g, w) => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, 7); g.fill();
    g.fillStyle = '#e63946'; g.font = '900 44px system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BUS', w / 2, w / 2 + 3);
  });
  const sign = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ map: stop }));
  sign.position.set(3.8, 2.2, -0.405);
  scene.add(sign);
  // a timetable panel on the shelter
  const tt = canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#1b1f2a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb703'; g.font = '800 30px ui-monospace, monospace'; g.textBaseline = 'middle'; g.fillText('NEXT BUS ▸ 1 min', 12, h / 2 + 2);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.36), new THREE.MeshBasicMaterial({ map: tt }));
  board.position.set(sx, 1.85, sz + 0.53);
  scene.add(board);
})();

// shops along the back street
const SHOPS = [
  { name: 'CAFE', wall: '#ffd6a5', trim: '#e76f51', awn: '#e76f51' },
  { name: 'BAKERY', wall: '#fdf0d5', trim: '#c1121f', awn: '#c1121f' },
  { name: 'BOOKS', wall: '#bde0fe', trim: '#3a86ff', awn: '#3a86ff' },
  { name: 'PIZZA', wall: '#ffe5ec', trim: '#2a9d8f', awn: '#2a9d8f' },
  { name: 'FLOWERS', wall: '#d8f3dc', trim: '#ff6fa8', awn: '#ff6fa8' },
  { name: 'MARKET', wall: '#fff3b0', trim: '#7b2cbf', awn: '#7b2cbf' },
];
const facadeTex = canvasTexture(256 * SHOPS.length, 256, (g) => {
  SHOPS.forEach((s, i) => {
    const x0 = i * 256;
    g.fillStyle = s.wall; g.fillRect(x0, 0, 256, 256);
    // upper windows with frames, sills and curtains
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const wx = x0 + 22 + c * 76, wy = 16 + r * 62;
      g.fillStyle = '#ffffff'; g.fillRect(wx - 4, wy - 4, 64, 52);
      g.fillStyle = (r + c + i) % 3 ? '#5d8fc4' : '#ffe8a3'; g.fillRect(wx, wy, 56, 44);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(wx + 4, wy + 4, 14, 36);
      g.fillStyle = s.trim; g.fillRect(wx - 6, wy + 46, 68, 6);
      g.fillStyle = '#ffffff'; g.fillRect(wx + 27, wy, 3, 44);
    }
    // sign band and shop front
    g.fillStyle = s.trim; g.fillRect(x0, 142, 256, 34);
    g.fillStyle = '#ffffff'; g.font = '900 26px system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s.name, x0 + 128, 160);
    g.fillStyle = '#2b2f3a'; g.fillRect(x0 + 14, 186, 150, 66);
    g.fillStyle = '#8ecae6'; g.fillRect(x0 + 18, 190, 142, 62);
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x0 + 24, 194, 30, 56);
    g.fillStyle = '#6b3e1f'; g.fillRect(x0 + 180, 184, 58, 72);
    g.fillStyle = '#ffd23f'; g.fillRect(x0 + 226, 218, 6, 6);
  });
});
const awnTex = canvasTexture(16, 128, (g, w, h) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d0d0d0'; g.fillRect(0, i * 16, w, 16); }
}, { repeat: [1, 3] });
(function shops() {
  const bodies = [], fronts = [], awns = [];
  const plane = new THREE.PlaneGeometry(1, 1);
  const awnGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true, 0, Math.PI / 2);
  let x = -15;
  let i = 0;
  while (x < 15) {
    const s = SHOPS[i % SHOPS.length];
    const w = 3.2 + rand() * 1.2, h = 2.8 + rand() * 1.4, d = 3;
    const cx = x + w / 2, cz = -2.4 - d / 2;
    bodies.push(part(rbox(w, h, d, 0.1), s.wall, cx, h / 2, cz));
    bodies.push(part(rbox(w + 0.16, 0.18, d + 0.16, 0.06), s.trim, cx, h + 0.05, cz));
    bodies.push(part(rbox(0.7, 0.35, 0.6, 0.06), '#d5dbe3', cx - w * 0.2, h + 0.3, cz - 0.3));
    if (i % 2) bodies.push(part(CYL, '#9aa4b5', cx + w * 0.25, h + 0.45, cz - 0.6, 0, 0, 0, 0.12, 0.6, 0.12));
    const f = part(plane, '#ffffff', cx, h / 2, cz + d / 2 + 0.012, 0, 0, 0, w - 0.1, h - 0.1, 1);
    const uv = f.attributes.uv;
    const col = i % SHOPS.length;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (col + uv.getX(k)) / SHOPS.length);
    fronts.push(f);
    // striped awning over the shop window
    awns.push(part(awnGeo, s.awn, cx - w * 0.152, h * 0.2, cz + d / 2, 0, 0, Math.PI / 2, 0.45, w * 0.62, 0.45));
    x += w + 0.25 + rand() * 0.6;
    i++;
  }
  const b = baked(bodies);
  const fr = baked(fronts, { map: facadeTex, roughness: 0.8 });
  fr.castShadow = false;
  const aw = baked(awns, { map: awnTex, side: THREE.DoubleSide, roughness: 0.7 });
  backdrop.add(b, fr, aw);
  // the back street pavement and trees in front of the shops
  const P = [];
  for (let k = 0; k < 7; k++) tree(P, -13 + k * 4.4 + rand(), -1.75, 0.7 + rand() * 0.1, k);
  const tr = baked(P);
  backdrop.add(tr);
  const pv = new THREE.Mesh(new THREE.PlaneGeometry(40, 2.2), paveMat);
  pv.rotation.x = -Math.PI / 2;
  pv.position.set(0, 0.008, -1.25);
  pv.receiveShadow = true;
  backdrop.add(pv);
})();
// people strolling along the back street
const strollers = [];
for (let i = 0; i < 3; i++) {
  const h = makeHuman({ scale: 0.95 });
  const dir = i % 2 ? 1 : -1;
  h.root.traverse((o) => { o.castShadow = false; });
  h.root.position.set(-9 + i * 8, 0, -0.6 - (i % 2) * 0.5);
  h.root.rotation.y = dir * Math.PI / 2;
  backdrop.add(h.root);
  strollers.push({ h, dir, speed: 0.9 + rand() * 0.5 });
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
const tint = (hex, k) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();
// passengers wear their bus colour: shirt and cap
function makePerson(ci) {
  const h = makeHuman({ shirt: COLORS[ci].hex, cap: COLORS[ci].hex, scale: 1.05 });
  h.root.userData.h = h;
  return h.root;
}
function sitPose(h, on, lean = 1.45) {
  for (const l of h.legs) l.rotation.x = on ? -lean : 0;
}

// bus parts are built once and shared by every bus, merged by material
const place = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(sx, sy, sz));
  return g.applyMatrix4(tmpM);
};
const merged = (list) => { const g = THREE.mergeGeometries(list); list.forEach((p) => p.dispose()); return g; };
const SEAT_X = [-0.8, 0, 0.8];
const DECK_Y = 1.46;
const BUS = (() => {
  const G = {};
  // side profile with wheel arches, extruded and bevelled into a rounded body
  const s = new THREE.Shape();
  const x0 = -1.7, x1 = 1.7, y0 = 0.26, y1 = 1.4, rb = 0.12, rt = 0.3, ar = 0.38, ay = 0.3;
  const dx = Math.sqrt(ar * ar - (ay - y0) ** 2), a = Math.asin((ay - y0) / ar);
  s.moveTo(x0 + rb, y0);
  for (const wx of [-1.1, 1.1]) {
    s.lineTo(wx - dx, y0);
    s.absarc(wx, ay, ar, Math.PI + a, -a, true);
  }
  s.lineTo(x1 - rb, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + rb);
  s.lineTo(x1, y1 - rt);
  s.quadraticCurveTo(x1, y1, x1 - rt, y1);
  s.lineTo(x0 + rt * 0.6, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - rt * 0.6);
  s.lineTo(x0, y0 + rb);
  s.quadraticCurveTo(x0, y0, x0 + rb, y0);
  const body = new THREE.ExtrudeGeometry(s, { depth: 1.32, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 12 });
  body.translate(0, 0, -0.66);
  // open top deck: a rounded rim wall around the edge
  const ring = (hx, hz, r, inset) => {
    const o = new THREE.Shape();
    const rr = (sh, w, d, rad) => {
      sh.moveTo(-w + rad, -d); sh.lineTo(w - rad, -d); sh.quadraticCurveTo(w, -d, w, -d + rad);
      sh.lineTo(w, d - rad); sh.quadraticCurveTo(w, d, w - rad, d); sh.lineTo(-w + rad, d);
      sh.quadraticCurveTo(-w, d, -w, d - rad); sh.lineTo(-w, -d + rad); sh.quadraticCurveTo(-w, -d, -w + rad, -d);
    };
    rr(o, hx, hz, r);
    const hole = new THREE.Path();
    rr(hole, hx - inset, hz - inset, r * 0.6);
    o.holes.push(hole);
    return o;
  };
  const rim = new THREE.ExtrudeGeometry(ring(1.7, 0.72, 0.28, 0.09), { depth: 0.32, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 8 }).rotateX(-Math.PI / 2);
  const rail = new THREE.ExtrudeGeometry(ring(1.72, 0.74, 0.29, 0.07), { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 8 }).rotateX(-Math.PI / 2);
  const pillar = rbox(0.08, 0.47, 1.49, 0.03);
  G.paint = merged([body, place(rim, 0, 1.4, 0), place(rbox(0.62, 0.06, 1.5, 0.03), -1.42, 2.12, 0),
    ...[-1.0, -0.3, 0.4].map((px) => place(pillar, px, 1.04, 0))]);
  G.trim = merged([place(rail, 0, 1.74, 0), place(rbox(2.98, 0.05, 1.49, 0.02), -0.12, 1.28, 0), place(rbox(2.98, 0.05, 1.49, 0.02), -0.12, 0.8, 0),
    place(rbox(0.03, 0.86, 0.05, 0.01), 1.12, 0.74, -0.745), place(rbox(3.44, 0.07, 1.47, 0.03), 0, 0.62, 0),
    ...[-0.66, 0.66].map((z) => place(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), -1.62, 1.88, z))]);
  const screen = rbox(0.06, 0.52, 1.22, 0.03);
  G.glass = merged([place(rbox(2.92, 0.44, 1.47, 0.06), -0.12, 1.04, 0), place(screen, 1.745, 1.0, 0), place(screen, -1.745, 1.04, 0, 0, 0, 0, 1, 0.7, 0.85),
    place(rbox(0.5, 0.86, 0.04, 0.02), 1.12, 0.74, -0.74)]);
  const bumper = rbox(0.16, 0.17, 1.46, 0.06), mirror = rbox(0.08, 0.18, 0.05, 0.02);
  G.dark = merged([place(bumper, 1.74, 0.36, 0), place(bumper, -1.74, 0.36, 0), place(rbox(0.04, 0.14, 0.62, 0.02), 1.77, 0.56, 0),
    place(mirror, 1.62, 1.2, 0.82, 0, 0.3), place(mirror, 1.62, 1.2, -0.82, 0, -0.3),
    place(rbox(0.3, 0.03, 0.03, 0.01), 1.55, 1.3, 0.78, 0, 0.3), place(rbox(0.3, 0.03, 0.03, 0.01), 1.55, 1.3, -0.78, 0, -0.3)]);
  const lamp = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 18).rotateZ(Math.PI / 2);
  G.head = merged([0.52, -0.52].map((z) => place(lamp, 1.765, 0.56, z)));
  G.tail = merged([0.52, -0.52].map((z) => place(lamp, -1.765, 0.56, z, 0, 0, 0, 1, 0.8, 0.8)));
  G.floor = rbox(3.26, 0.04, 1.3, 0.02);
  G.shield = place(rbox(0.04, 0.34, 1.2, 0.02), 1.58, 1.95, 0, 0, 0, -0.3);
  G.seat = merged([place(rbox(0.46, 0.1, 0.52, 0.04), 0, DECK_Y + 0.08, 0), place(rbox(0.09, 0.42, 0.52, 0.04), -0.22, DECK_Y + 0.28, 0)]);
  G.sign = new THREE.PlaneGeometry(1.3, 0.22);
  G.signFront = new THREE.PlaneGeometry(0.8, 0.2);
  // an axle: two bulging tyres, metal rims with wheel nuts and coloured hubcaps
  const tyre = new THREE.TorusGeometry(0.2, 0.1, 12, 26), rimG = new THREE.CylinderGeometry(0.17, 0.17, 0.19, 22).rotateX(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.075, 0.095, 0.05, 16).rotateX(Math.PI / 2), nut = new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6).rotateX(Math.PI / 2);
  const sides = [[0.6, 0], [-0.6, Math.PI]];
  G.tyres = merged(sides.map(([z, ry]) => place(tyre, 0, 0, z, 0, ry)));
  G.rims = merged(sides.flatMap(([z, ry]) => [place(rimG, 0, 0, z, 0, ry), ...[0, 1, 2, 3, 4].map((k) => place(nut, Math.cos(k * 1.2566) * 0.12, Math.sin(k * 1.2566) * 0.12, z + (z > 0 ? 0.1 : -0.1)))]));
  G.hubs = merged(sides.map(([z, ry]) => place(hub, 0, 0, z + (z > 0 ? 0.1 : -0.1), 0, ry)));
  return G;
})();
const busMats = {
  glass: new THREE.MeshStandardMaterial({ color: '#1c2a3d', roughness: 0.06, metalness: 0.3 }),
  trim: metal('#e4e8ef', { roughness: 0.3 }),
  dark: matte('#2a2f3a', { roughness: 0.6 }),
  tyre: matte('#24272e', { roughness: 0.85 }),
  rim: metal('#cfd5de', { roughness: 0.25 }),
  head: new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff1b8', emissiveIntensity: 1.1, roughness: 0.2 }),
  tail: new THREE.MeshStandardMaterial({ color: '#ff3b3b', emissive: '#ff2020', emissiveIntensity: 0.6, roughness: 0.3 }),
  shield: new THREE.MeshStandardMaterial({ color: '#d8f0ff', transparent: true, opacity: 0.4, roughness: 0.05 }),
};
const ROUTES = ['12', '7', '3', '21', '9', '15', '5', '30'];
const signMats = new Map();
function signMat(ci, w) {
  const key = ci + '|' + w;
  if (!signMats.has(key)) {
    const map = canvasTexture(w, 48, (g, W, H) => {
      g.fillStyle = '#14161d'; g.fillRect(0, 0, W, H);
      g.fillStyle = COLORS[ci].hex; g.beginPath(); g.arc(26, H / 2, 14, 0, 7); g.fill();
      g.fillStyle = '#ffc94a'; g.font = '800 30px ui-monospace, Menlo, monospace'; g.textBaseline = 'middle';
      g.fillText(ROUTES[ci] + (W > 200 ? ' ' + COLORS[ci].id.toUpperCase() : ''), 50, H / 2 + 2);
    });
    signMats.set(key, new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  }
  return signMats.get(key);
}
function makeBus(ci) {
  const g = new THREE.Group();
  const body = new THREE.Group(); // sways and squashes on its suspension
  g.add(body);
  const hex = COLORS[ci].hex;
  const paint = glossy(hex, { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
  const add = (geo, m, x, y, z, parent = body, shadow = false) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = shadow;
    parent.add(o);
    return o;
  };
  add(BUS.paint, paint, 0, 0, 0, body, true);
  add(BUS.trim, busMats.trim, 0, 0, 0);
  add(BUS.glass, busMats.glass, 0, 0, 0);
  add(BUS.dark, busMats.dark, 0, 0, 0);
  add(BUS.head, busMats.head, 0, 0, 0);
  add(BUS.tail, busMats.tail, 0, 0, 0);
  add(BUS.shield, busMats.shield, 0, 0, 0);
  add(BUS.floor, matte(tint(hex, 0.55), { roughness: 0.85 }), 0, DECK_Y, 0);
  add(BUS.sign, signMat(ci, 256), -0.2, 1.59, 0.735).renderOrder = 1;
  add(BUS.signFront, signMat(ci, 160), 1.705, 1.59, 0).rotation.y = Math.PI / 2;
  // seats on the top deck
  const seats = [];
  for (let k = 0; k < SEATS; k++) {
    const sm = mat('#3b4157', { roughness: 0.5 });
    add(BUS.seat, sm, SEAT_X[k], 0, 0);
    seats.push(sm);
  }
  // both wheels on an axle turn together
  const wheels = [];
  for (const wx of [-1.1, 1.1]) {
    const w = new THREE.Group();
    w.position.set(wx, 0.3, 0);
    add(BUS.tyres, busMats.tyre, 0, 0, 0, w, true);
    add(BUS.rims, busMats.rim, 0, 0, 0, w);
    add(BUS.hubs, paint, 0, 0, 0, w);
    g.add(w);
    wheels.push(w);
  }
  const shadow = blob(1, 0.42);
  shadow.scale.set(4, 1, 2);
  g.add(shadow);
  return { g, body, seats, wheels, shadow, riders: [], vx: 0, lastX: 0, tilt: 0, color: ci };
}
function dropBus(b) {
  if (!b) return;
  scene.remove(b.g);
  b.seats.forEach((m) => m.dispose());
  b.shadow.material.dispose();
}

// planters stand in for blocked cells
const PLANTER = (() => {
  const P = [];
  P.push(part(rbox(CELL * 0.86, 0.42, CELL * 0.86, 0.08), '#b07a4f', 0, 0.21 + TILE_Y, 0));
  for (let k = 0; k < 4; k++) P.push(part(rbox(CELL * 0.88, 0.04, 0.02, 0.01), '#8f5f3a', 0, 0.1 + k * 0.1 + TILE_Y, CELL * 0.43));
  P.push(part(rbox(CELL * 0.74, 0.04, CELL * 0.74, 0.02), '#5b3a24', 0, 0.42 + TILE_Y, 0));
  P.push(part(SPHERE, '#3fae49', 0, 0.62 + TILE_Y, 0, 0, 0, 0, 0.38, 0.3, 0.38));
  P.push(part(SPHERE, '#5cc552', 0.16, 0.74 + TILE_Y, 0.1, 0, 0, 0, 0.22));
  P.push(part(SPHERE, '#4bb84a', -0.15, 0.72 + TILE_Y, -0.08, 0, 0, 0, 0.24));
  for (let k = 0; k < 5; k++) P.push(part(SPHERE, ['#ff6fa8', '#ffd23f', '#ffffff', '#ff8f2b', '#b15cff'][k], Math.cos(k * 1.3) * 0.25, 0.8 + TILE_Y + (k % 2) * 0.06, Math.sin(k * 1.3) * 0.25, 0, 0, 0, 0.07));
  const geo = THREE.mergeGeometries(P);
  P.forEach((p) => p.dispose());
  return geo;
})();
const planterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
const tileGeo = rbox(CELL * 0.94, 0.08, CELL * 0.94, 0.05);
const tileMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 });
const padMat = matte('#cfc6b4', { roughness: 0.9 });
const KEEP = new Set([PLANTER, tileGeo]);

// park benches by the kerb, built once
const BENCH_GEO = (() => {
  const wood = [], iron = [];
  for (let k = 0; k < 3; k++) wood.push(part(rbox(0.86, 0.05, 0.13, 0.02), '#ffffff', 0, 0.36, -0.16 + k * 0.15));
  for (let k = 0; k < 2; k++) wood.push(part(rbox(0.86, 0.11, 0.04, 0.02), '#ffffff', 0, 0.55 + k * 0.15, -0.27, -0.12));
  for (const x of [-0.36, 0.36]) {
    iron.push(part(rbox(0.05, 0.36, 0.05, 0.015), '#ffffff', x, 0.18, 0.14));
    iron.push(part(rbox(0.05, 0.78, 0.05, 0.015), '#ffffff', x, 0.39, -0.24, -0.12));
    iron.push(part(rbox(0.05, 0.04, 0.44, 0.015), '#ffffff', x, 0.34, -0.04));
  }
  const g = { wood: THREE.mergeGeometries(wood), iron: THREE.mergeGeometries(iron) };
  wood.concat(iron).forEach((p) => p.dispose());
  return g;
})();
const benchWood = [mat('#c98b58', { roughness: 0.55, vertexColors: true }), mat('#ffc93c', { roughness: 0.35, vertexColors: true })];
const benchIron = mat('#3b4256', { roughness: 0.4, metalness: 0.5, vertexColors: true });
const benchMeshes = [];
for (let i = 0; i < MAX_BENCHES; i++) {
  const b = new THREE.Group();
  const w = new THREE.Mesh(BENCH_GEO.wood, benchWood[i < BENCHES ? 0 : 1]);
  const ir = new THREE.Mesh(BENCH_GEO.iron, benchIron);
  w.castShadow = ir.castShadow = true;
  b.add(w, ir, blob(0.55, 0.25));
  b.position.set([-2, -1, 0, 1, 2, -3, 3][i], 0, -0.75);
  b.visible = i < BENCHES;
  benchGroup.add(b);
  benchMeshes.push(b);
}

// ---------------------------------------------------------------------------
// Effects: confetti, exhaust puffs and tap rings
// ---------------------------------------------------------------------------
const FX_MAX = 180;
const fxMesh = new THREE.InstancedMesh(rbox(0.12, 0.03, 0.08, 0.01, 1), new THREE.MeshStandardMaterial({ roughness: 0.5 }), FX_MAX);
const puffMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.18, 1), new THREE.MeshStandardMaterial({ color: '#f1f3f6', roughness: 1, transparent: true, opacity: 0.75, depthWrite: false }), 40);
for (const m of [fxMesh, puffMesh]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; scene.add(m); }
const fx = [], puffs = [];
function confetti(pos, colors, n = 24, power = 1) {
  for (let i = 0; i < n; i++) {
    if (fx.length >= FX_MAX) fx.shift();
    const a = Math.random() * Math.PI * 2, sp = (1.2 + Math.random() * 2.4) * power;
    fx.push({ p: pos.clone(), v: new THREE.Vector3(Math.cos(a) * sp, (3 + Math.random() * 3) * power, Math.sin(a) * sp), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), life: 1.1 + Math.random() * 0.6, c: colors[i % colors.length] });
  }
}
function puff(pos, vx = 0) {
  if (puffs.length >= 40) puffs.shift();
  puffs.push({ p: pos.clone(), v: new THREE.Vector3(vx - 0.6 - Math.random() * 0.5, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4), life: 0.9, max: 0.9 });
}
const rings = [];
const ringGeo = new THREE.RingGeometry(0.36, 0.48, 32).rotateX(-Math.PI / 2);
for (let i = 0; i < 4; i++) {
  const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
  r.visible = false;
  scene.add(r);
  rings.push({ m: r, t: 1 });
}
let ringNext = 0;
function ringAt(pos, color) {
  const r = rings[ringNext++ % rings.length];
  r.m.position.set(pos.x, TILE_Y + 0.03, pos.z);
  r.m.material.color.set(color);
  r.t = 0;
  r.m.visible = true;
}
const fxO = new THREE.Object3D();
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.life <= 0) { fx.splice(i, 1); continue; }
    f.v.y -= 9 * dt;
    f.v.multiplyScalar(1 - dt * 1.2);
    f.p.addScaledVector(f.v, dt);
    if (f.p.y < 0.03) { f.p.y = 0.03; f.v.set(0, 0, 0); }
    f.r.x += dt * 7; f.r.y += dt * 5;
  }
  fx.forEach((f, i) => {
    fxO.position.copy(f.p); fxO.rotation.copy(f.r); fxO.scale.setScalar(Math.min(1, f.life * 2));
    fxO.updateMatrix(); fxMesh.setMatrixAt(i, fxO.matrix); fxMesh.setColorAt(i, tmpCol.set(f.c));
  });
  fxMesh.count = fx.length;
  fxMesh.instanceMatrix.needsUpdate = true;
  if (fxMesh.instanceColor) fxMesh.instanceColor.needsUpdate = true;
  for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.life -= dt; if (p.life <= 0) puffs.splice(i, 1); else p.p.addScaledVector(p.v, dt); }
  puffs.forEach((p, i) => {
    const k = 1 - p.life / p.max;
    fxO.position.copy(p.p); fxO.rotation.set(0, 0, 0); fxO.scale.setScalar((0.6 + k * 1.6) * Math.min(1, p.life * 3));
    fxO.updateMatrix(); puffMesh.setMatrixAt(i, fxO.matrix);
  });
  puffMesh.count = puffs.length;
  puffMesh.instanceMatrix.needsUpdate = true;
  for (const r of rings) {
    if (!r.m.visible) continue;
    r.t += dt * 2.6;
    if (r.t >= 1) { r.m.visible = false; continue; }
    r.m.scale.setScalar(1 + r.t * 0.9);
    r.m.material.opacity = 0.9 * (1 - r.t);
  }
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
let time = 0, shake = 0;
let L = null;           // level
let grid = [];          // -1 empty, -2 wall, >=0 colour
let people = new Map(); // cell index -> person record
let walkers = [];       // people currently walking
let bench = [];         // waiting people (records) in slots
let busIndex = 0, seatsFilled = 0, bus = null, busState = 'arriving';
let nextBus = null;     // the following bus, queued up the road
let leavers = [];       // full buses driving away
let pendingBoard = 0, benchCount = BENCHES, peakBench = 0;
let hud = null, stopHand = null, revived = false, warnedBench = false;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
let tiles = null;       // instanced plaza tiles
const tileIndex = [];   // cell -> instance id

const cellPos = (k) => {
  const r = Math.floor(k / L.w), c = k % L.w;
  return new THREE.Vector3((c - (L.w - 1) / 2) * CELL, 0, -2.2 - r * CELL);
};
const EXIT_Z = -1.45;
const BUS_POS = new THREE.Vector3(0, 0, 1.5);
const QUEUE_X = -4.7;
const DOOR = new THREE.Vector3(1.12, 0, 0.5);
// the first five benches sit in the middle, the two bonus ones at the ends
const BENCH_X = [-2, -1, 0, 1, 2, -3, 3];
const benchPos = (i) => new THREE.Vector3(BENCH_X[i] * 1.0, 0, -0.75);
const BENCH_SEAT = new THREE.Vector3(0, 0.36 - 0.46 * 1.05, -0.02);
const RIDE_Y = DECK_Y + 0.13 - 0.46 * 1.05;
const seatPos = (n) => BUS_POS.clone().add(new THREE.Vector3(SEAT_X[n], RIDE_Y, 0));

function clearWorld() {
  world.traverse((o) => {
    if (o.geometry && !SHARED_GEOMETRIES.has(o.geometry) && !KEEP.has(o.geometry)) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose();
  });
  world.clear();
  people.clear();
  walkers = [];
  bench = [];
  tiles = null;
  tileIndex.length = 0;
  dropBus(bus); bus = null;
  dropBus(nextBus); nextBus = null;
  leavers.forEach(dropBus); leavers = [];
}

function buildLevel(n) {
  clearWorld();
  L = genLevel(n);
  gridW = L.w; gridH = L.h;
  frameCamera();
  grid = L.grid.slice();
  // plaza slab with a painted kerb, tiles on top
  const depth = L.h * CELL + 0.5;
  const pad = new THREE.Mesh(rbox(L.w * CELL + 0.5, 0.12, depth, 0.06), padMat);
  pad.position.set(0, 0, -2.2 - ((L.h - 1) / 2) * CELL);
  pad.receiveShadow = true;
  world.add(pad);
  const edge = new THREE.Mesh(rbox(L.w * CELL + 0.7, 0.1, depth + 0.2, 0.05), matte('#f1ece2'));
  edge.position.copy(pad.position).setY(-0.02);
  edge.receiveShadow = true;
  world.add(edge);
  backdrop.position.z = -2.2 - (L.h - 1) * CELL - 0.6;
  tiles = new THREE.InstancedMesh(tileGeo, tileMat, L.w * L.h);
  tiles.receiveShadow = true;
  let ti = 0;
  for (let k = 0; k < grid.length; k++) {
    const p = cellPos(k);
    if (grid[k] === -2) {
      const block = new THREE.Mesh(PLANTER, planterMat);
      block.position.set(p.x, 0, p.z);
      block.rotation.y = (k % 4) * Math.PI / 2;
      block.castShadow = block.receiveShadow = true;
      world.add(block);
      continue;
    }
    fxO.position.set(p.x, TILE_Y - 0.04, p.z); fxO.rotation.set(0, 0, 0); fxO.scale.setScalar(1); fxO.updateMatrix();
    tiles.setMatrixAt(ti, fxO.matrix);
    tiles.setColorAt(ti, tmpCol.set('#f3ede2'));
    tileIndex[k] = ti++;
    if (grid[k] >= 0) {
      const person = makePerson(grid[k]);
      person.position.set(p.x, TILE_Y, p.z);
      person.rotation.y = 0;
      world.add(person);
      people.set(k, { k, color: grid[k], g: person, bob: Math.random() * 6, look: 0, lookT: Math.random() * 3 });
    }
  }
  tiles.count = ti;
  world.add(tiles);
  // benches
  benchMeshes.forEach((b, i) => { b.visible = i < BENCHES; });
  busIndex = 0; seatsFilled = 0; pendingBoard = 0; revived = false; benchCount = BENCHES; peakBench = 0; warnedBench = false;
  spawnBus();
  refreshReach();
  if (hud) hud.setProgress(0);
}

function spawnBus() {
  if (busIndex >= L.buses.length) { bus = null; dropBus(nextBus); nextBus = null; return; }
  const ci = L.buses[busIndex];
  if (nextBus && nextBus.color === ci) { bus = nextBus; nextBus = null; }
  else {
    dropBus(nextBus); nextBus = null;
    bus = makeBus(ci);
    bus.g.position.set(-16, 0, BUS_POS.z);
    bus.lastX = -16;
    scene.add(bus.g);
  }
  busState = 'arriving';
  seatsFilled = 0;
  pendingBoard = 0;
  // the one after pulls up behind, so you can plan ahead
  if (busIndex + 1 < L.buses.length) {
    nextBus = makeBus(L.buses[busIndex + 1]);
    nextBus.g.position.set(-20.5, 0, BUS_POS.z);
    nextBus.lastX = -20.5;
    scene.add(nextBus.g);
  }
  tone(220, 0, 0.18, 'square', 0.05);
  tone(196, 0.2, 0.25, 'square', 0.05);
}

let reachSet = new Set();
function refreshReach() {
  reachSet = reachable(grid, L.w, L.h);
  // reachable passengers stand up straight on a tile tinted their colour; others dim
  for (let k = 0; k < grid.length; k++) {
    if (tileIndex[k] === undefined) continue;
    const p = people.get(k);
    const c = !p ? '#f3ede2' : reachSet.has(k) ? tint(COLORS[p.color].hex, 0.45) : '#bdb7ad';
    tiles.setColorAt(tileIndex[k], tmpCol.set(c));
  }
  if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
  for (const [k, p] of people) p.g.scale.setScalar(reachSet.has(k) ? 1.05 : 0.95);
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
  return cells.map((c) => cellPos(c).setY(TILE_Y)).concat([new THREE.Vector3(cellPos(end).x, 0, EXIT_Z)]);
}

function tapPerson(k) {
  const p = people.get(k);
  if (!p || !reachSet.has(k)) {
    if (p) { p.shake = 0.35; sfx.bad(); UI.buzz(10); ringAt(cellPos(k), '#ff4d5e'); }
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
  if (toBus) { pendingBoard++; path.push(DOOR.clone().add(new THREE.Vector3(BUS_POS.x, 0, 0)), seatPos(seatsFilled + pendingBoard - 1)); }
  else {
    bench[slot] = 'reserved';
    path.push(benchPos(slot).add(new THREE.Vector3(0, 0, 0.35)), benchPos(slot).add(BENCH_SEAT));
    const used = bench.filter(Boolean).length;
    peakBench = Math.max(peakBench, used);
    if (used === benchCount - 1 && !warnedBench) {
      warnedBench = true;
      setTimeout(() => UI.floatText('Last bench!', window.innerWidth / 2, window.innerHeight * 0.32, '#ffd166'), 250);
    }
  }
  ringAt(cellPos(k), COLORS[p.color].hex);
  p.g.scale.setScalar(1.05);
  walkers.push({ p, path, i: 0, dest, slot, hop: null, pop: 0.25 });
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
    p.g.position.copy(benchPos(wk.slot).add(BENCH_SEAT));
    const h = p.g.userData.h;
    animateHuman(h, 0, 0);
    sitPose(h, true, 1.3);
    if (bench.filter((b) => b && b !== 'reserved').length < benchCount) warnedBench = false;
    boardFromBench();
  }
}

function boardBus(p) {
  if (!bus) return;
  // take a seat on the top deck and ride along
  const h = p.g.userData.h;
  const n = seatsFilled;
  bus.body.add(p.g);
  p.g.position.set(SEAT_X[n], RIDE_Y, 0);
  p.g.rotation.set(0, Math.PI / 2, 0);
  p.g.scale.setScalar(1.05);
  animateHuman(h, 0, 0);
  sitPose(h, true);
  h.head.rotation.y = -0.7;
  bus.riders.push(h);
  seatsFilled++;
  bus.seats[seatsFilled - 1].color.set(COLORS[bus.color].hex);
  bus.squash = 1;
  sfx.pop();
  tone(520 + seatsFilled * 140, 0, 0.09, 'triangle', 0.08);
  const at = bus.g.position.clone().add(new THREE.Vector3(SEAT_X[n], 2.2, 0));
  confetti(at, [COLORS[bus.color].hex, '#ffffff', '#ffd23f'], 10, 0.6);
  const s = toScreen(bus.g.position.clone().add(new THREE.Vector3(0, 2.4, 0)));
  UI.floatText(seatsFilled + '/' + SEATS, s.x, s.y, '#ffffff');
  if (seatsFilled >= SEATS) departBus();
}

function departBus() {
  busState = 'leaving';
  sfx.good();
  tone(330, 0.1, 0.2, 'square', 0.05);
  tone(392, 0.32, 0.14, 'square', 0.05);
  noise(0.1, 0.6, 0.12, 400);
  shake = Math.max(shake, 0.12);
  confetti(bus.g.position.clone().add(new THREE.Vector3(0, 2.3, 0)), [COLORS[bus.color].hex, '#ffffff', '#ffd23f', '#7dffb2'], 26, 1);
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
      sitPose(p.g.userData.h, false);
      walkers.push({ p, path: [new THREE.Vector3(at.x, 0, -0.25), DOOR.clone().add(new THREE.Vector3(BUS_POS.x, 0, 0)), seatPos(seatsFilled + pendingBoard - 1)], i: 0, dest: 'bus', slot: -1, hop: null, pop: 0 });
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
  shake = 0.3;
  const btns = [];
  if (!revived) {
    btns.push(UI.button('+2 benches', async () => {
      if (!(await YT.rewarded('extra_benches'))) return;
      p.close();
      revived = true;
      benchCount = MAX_BENCHES;
      benchMeshes.forEach((b) => { b.visible = true; });
      for (const i of [5, 6]) confetti(benchPos(i).setY(0.6), ['#ffd23f', '#ffffff'], 14, 0.7);
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
  const cols = COLORS.slice(0, L.colors).map((c) => c.hex).concat(['#ffffff']);
  for (let k = 0; k < 3; k++) setTimeout(() => confetti(new THREE.Vector3((k - 1) * 2.2, 2.5, -2.5), cols, 36, 1.3), k * 180);
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
const ONE = new THREE.Vector3(1, 1, 1);
function driveBus(b, dt) {
  // wheels roll with the distance travelled; the body leans on its springs
  const x = b.g.position.x;
  const v = (x - b.lastX) / Math.max(dt, 1e-4);
  b.lastX = x;
  for (const w of b.wheels) w.rotation.z -= (v * dt) / 0.3;
  const acc = (v - b.vx) / Math.max(dt, 1e-4);
  b.vx = v;
  b.tilt += (THREE.MathUtils.clamp(-acc * 0.004, -0.07, 0.07) - b.tilt) * Math.min(1, dt * 6);
  b.body.rotation.z = b.tilt;
  b.squash = Math.max(0, (b.squash || 0) - dt * 3.5);
  const sq = Math.sin(b.squash * Math.PI) * 0.06;
  b.body.scale.set(1 + sq, 1 - sq, 1 + sq);
  b.body.position.y = Math.abs(v) > 0.5 ? Math.sin(time * 22 + x) * 0.012 : 0;
  // passengers on top wave as their bus drives off
  for (const h of b.riders) {
    const go = Math.abs(v) > 0.3 || b === bus && busState === 'leaving';
    h.arms[1].rotation.z = go ? 2.5 + Math.sin(time * 14 + h.phase) * 0.35 : -0.12;
    h.arms[0].rotation.z = 0.12;
    h.body.position.y = Math.sin(time * 3 + h.phase) * 0.01;
  }
}

function update(dt) {
  time += dt;
  const excite = bus && busState === 'waiting' && state === 'play' ? bus.color : -1;
  for (const [, p] of people) {
    const s = p.shake > 0 ? Math.sin(p.shake * 50) * 0.08 : 0;
    p.shake = Math.max(0, (p.shake || 0) - dt);
    const reach = reachSet.has(p.k);
    const keen = reach && p.color === excite;
    const h = p.g.userData.h;
    p.g.position.x = cellPos(p.k).x + s;
    p.g.position.y = TILE_Y + (keen ? Math.abs(Math.sin(time * 7 + p.bob)) * 0.16 : reach ? Math.abs(Math.sin(time * 4 + p.bob)) * 0.04 : 0);
    animateHuman(h, dt, 0);
    // the ones who can board this bus wave; everyone else looks around
    h.arms[1].rotation.z = keen ? 2.5 + Math.sin(time * 12 + p.bob) * 0.4 : -0.12;
    p.lookT -= dt;
    if (p.lookT <= 0) { p.lookT = 1.5 + Math.random() * 3; p.look = (Math.random() - 0.5) * 1.4; }
    h.head.rotation.y += ((keen ? 0 : p.look) - h.head.rotation.y) * Math.min(1, dt * 5);
  }
  for (let i = walkers.length - 1; i >= 0; i--) {
    const w = walkers[i];
    const target = w.path[w.i];
    const pos = w.p.g.position;
    const h = w.p.g.userData.h;
    if (w.pop > 0) { w.pop = Math.max(0, w.pop - dt); w.p.g.scale.setScalar(1.05 * (1 + Math.sin((w.pop / 0.25) * Math.PI) * 0.18)); }
    if (w.dest === 'bus' && w.i === w.path.length - 1) {
      // hop up onto the top deck
      if (!w.hop) { w.hop = { from: pos.clone(), t: 0 }; h.head.rotation.y = 0; tone(440, 0, 0.12, 'sine', 0.06); tone(880, 0.08, 0.1, 'sine', 0.05); }
      w.hop.t += dt / 0.38;
      const t = Math.min(1, w.hop.t);
      const e = t * t * (3 - 2 * t);
      pos.lerpVectors(w.hop.from, target, e);
      pos.y += Math.sin(t * Math.PI) * 1.1;
      w.p.g.rotation.y = Math.atan2(target.x - w.hop.from.x, target.z - w.hop.from.z);
      h.arms[0].rotation.z = -2.4; h.arms[1].rotation.z = 2.4;
      if (t >= 1) { h.arms[0].rotation.z = 0.12; walkers.splice(i, 1); arrive(w); }
      continue;
    }
    const d = target.clone().sub(pos);
    const dist = d.length();
    const speed = 6;
    if (dist < 0.05) {
      w.i++;
      if (w.i >= w.path.length) { walkers.splice(i, 1); arrive(w); continue; }
    } else {
      pos.addScaledVector(d.normalize(), Math.min(dist, speed * dt));
      if (Math.abs(d.x) + Math.abs(d.z) > 0.01) w.p.g.rotation.y = Math.atan2(d.x, d.z);
      h.arms[1].rotation.z = -0.12;
      h.head.rotation.y = 0;
      animateHuman(h, dt, speed);
    }
  }
  // bus movement
  if (bus) {
    if (busState === 'arriving') {
      bus.g.position.x += (BUS_POS.x - bus.g.position.x) * Math.min(1, dt * 3.2);
      if (Math.abs(bus.g.position.x - BUS_POS.x) < 0.04) { bus.g.position.x = BUS_POS.x; busState = 'waiting'; bus.squash = 0.6; puff(bus.g.position.clone().add(new THREE.Vector3(-1.9, 0.3, -0.5))); boardFromBench(); }
    } else if (busState === 'leaving' && !walkers.some((w) => w.dest === 'bus')) {
      bus.g.position.x += dt * (6 + (bus.g.position.x - BUS_POS.x) * 3);
      if (Math.random() < dt * 14) puff(bus.g.position.clone().add(new THREE.Vector3(-1.9, 0.3, -0.5)), -1);
      // once it's clear of the stop the next bus can pull in
      if (bus.g.position.x > 4.2) { leavers.push(bus); spawnBus(); }
    }
    if (bus) driveBus(bus, dt);
  }
  if (nextBus) {
    nextBus.g.position.x += (QUEUE_X - nextBus.g.position.x) * Math.min(1, dt * 2.2);
    driveBus(nextBus, dt);
  }
  for (let i = leavers.length - 1; i >= 0; i--) {
    const b = leavers[i];
    b.g.position.x += dt * (6 + (b.g.position.x - BUS_POS.x) * 3);
    driveBus(b, dt);
    if (b.g.position.x > 22) { dropBus(b); leavers.splice(i, 1); }
  }
  for (const s of strollers) {
    s.h.root.position.x += s.dir * s.speed * dt;
    if (s.h.root.position.x > 15) s.h.root.position.x = -15;
    if (s.h.root.position.x < -15) s.h.root.position.x = 15;
    animateHuman(s.h, dt, s.speed);
  }
  updateFx(dt);
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
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (!paused && !menuOpen) update(dt);
  shake = Math.max(0, shake - dt * 0.8);
  camera.position.copy(camBase);
  if (shake > 0) camera.position.add(tmpP.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
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
window.__dbg = () => ({ x: bus && bus.g.position.x, time, st: busState, calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
