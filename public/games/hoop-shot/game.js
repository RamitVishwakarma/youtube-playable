/*
 * Hoop Shot 3D — arcade basketball. Swipe up toward the hoop to shoot:
 * the direction aims, the length sets the power. The ball flies with real
 * physics, so it rattles off the rim and backboard. Beat the target score
 * before the clock runs out; the hoop starts moving in later levels. Three
 * baskets in a row and you're ON FIRE for double points.
 */
import * as THREE from 'three';
import * as UI from 'flagship';
import { sfx, tone, noise, initAudio, suspendAudio, resumeAudio } from 'sfx';
import { studio, glossy, metal, matte, canvasTexture, skyGradient, blob, fitShadow } from 'look';
import { makeHuman, animateHuman } from 'models';

const G = 11;              // gravity (a touch above real for snappy arcs)
const BALL_R = 0.12;
const RIM_R = 0.24;
const RIM_TUBE = 0.02;
const RIM_Y = 3.05;
const ROUND_TIME = 40;
const START = new THREE.Vector3(0, 1.15, 0);

const SKINS = [
  { id: 'classic', name: 'Classic', color: '#f37021', base: '#f37021', seam: '#2b1600', price: 0 },
  { id: 'street', name: 'Street', color: '#c0392b', base: '#c0392b', seam: '#ffffff', price: 150 },
  { id: 'ice', name: 'Ice', color: '#7fdbff', base: '#7fdbff', seam: '#0b3d91', price: 250 },
  { id: 'lime', name: 'Lime', color: '#9ef01a', base: '#9ef01a', seam: '#1b4332', price: 350 },
  { id: 'galaxy', name: 'Galaxy', color: 'linear-gradient(135deg,#3a0ca3,#f72585)', base: '#5a189a', seam: '#f72585', stars: true, price: 600 },
  { id: 'gold', name: 'Gold', color: 'linear-gradient(135deg,#ffe066,#e09b00)', base: '#f5c518', seam: '#7a4f00', metal: true, price: 900 },
  { id: 'beach', name: 'Beach', color: 'linear-gradient(90deg,#ff4d6d,#ffd60a,#3a86ff)', stripes: ['#ff4d6d', '#ffffff', '#ffd60a', '#ffffff', '#3a86ff', '#ffffff'], price: 0, ad: true },
  { id: 'neon', name: 'Neon', color: '#ff6fd8', base: '#ff6fd8', seam: '#ffffff', glow: true, price: 1400 },
];

let save = { level: 1, coins: 0, best: 0, sound: true, tutorial: false, skin: 'classic', owned: { classic: true } };
let saveTimer = 0;
function persist(now) {
  clearTimeout(saveTimer);
  if (now) YT.save(save);
  else saveTimer = setTimeout(() => YT.save(save), 300);
}

// ---------------------------------------------------------------------------
// Renderer + scene
// ---------------------------------------------------------------------------
const TEAM = '#2563eb', TEAM2 = '#ff7b00';
const canvas = document.createElement('canvas');
canvas.id = 'scene';
document.getElementById('game').appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// shadows are drawn once per frame, before the mirror pass, and reused by the main pass
renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
scene.background = skyGradient([[0, '#03041a'], [0.4, '#0b1240'], [0.75, '#181456'], [1, '#2a1650']]);
scene.fog = new THREE.Fog('#0a0f33', 16, 38);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
studio(renderer, scene, { intensity: 0.5 });
scene.add(new THREE.HemisphereLight(0xb4c4ff, 0x3a2414, 0.4));
const key = new THREE.DirectionalLight(0xfff0dc, 2.7);
key.position.set(2.4, 10, 3.2);
key.target.position.set(0, 0, -3.6);
fitShadow(key, 6.5, 2048);
Object.assign(key.shadow.camera, { near: 2, far: 22 });
key.shadow.camera.updateProjectionMatrix();
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0x7d9cff, 0.7);
fill.position.set(-5, 3, 6);
scene.add(fill);
const rimLight = new THREE.PointLight(0xffb36b, 8, 8, 1.6);
rimLight.position.set(0, 4.6, -4);
scene.add(rimLight);

// camera rig: a fixed framing plus shake and a zoom punch on big moments
const camBase = new THREE.Vector3(), camAim = new THREE.Vector3(), shakeV = new THREE.Vector3();
let baseFov = 58, shake = 0, punch = 0;
function placeCamera() {
  camera.fov = baseFov - punch * 2.2;
  camera.position.copy(camBase);
  if (shake > 0.001) camera.position.add(shakeV.set((Math.random() - 0.5) * shake * 0.05, (Math.random() - 0.5) * shake * 0.04, 0));
  camera.lookAt(camAim);
  camera.updateProjectionMatrix();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  const portrait = camera.aspect < 1;
  baseFov = portrait ? 58 : 44;
  camBase.set(0, portrait ? 2.2 : 2.3, portrait ? 2.9 : 3.0);
  camAim.set(0, portrait ? 2.25 : 1.9, -4.5);
  placeCamera();
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  mirror.setSize(db.x, db.y);
  pMat.uniforms.uScale.value = db.y / (2 * Math.tan(THREE.MathUtils.degToRad(baseFov) / 2));
}
window.addEventListener('resize', resize);

const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, o || {}));
const canvasTex = (w, h, draw) => canvasTexture(w, h, draw);
const M4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(sx, sy, sz));
/** Bakes [geometry, colour, matrix] parts into one vertex-coloured mesh (one draw call). */
function bake(parts, o) {
  const geos = parts.map(([geo, color, m]) => {
    const g = geo.clone();
    if (m) g.applyMatrix4(m);
    const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const mesh = new THREE.Mesh(THREE.mergeGeometries(geos), new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.7 }, o || {})));
  geos.forEach((g) => g.dispose());
  return mesh;
}

// ---------------------------------------------------------------------------
// Polished floor: the scene is rendered from a camera mirrored under y = 0
// into a small target, and the floor blends it in with a fresnel falloff.
// ---------------------------------------------------------------------------
function makeMirror(scale, strength) {
  const half = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType });
  const cam = new THREE.PerspectiveCamera();
  const U = { tRefl: { value: rt.texture }, reflMat: { value: new THREE.Matrix4() }, reflK: { value: strength }, reflTexel: { value: new THREE.Vector2(0.002, 0.002) } };
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), qv = new THREE.Vector4(), fwd = new THREE.Vector3();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const hidden = [];
  return {
    U, hidden,
    patch(m) {
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = 'uniform mat4 reflMat;\nvarying vec4 vRefl;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vRefl = reflMat * modelMatrix * vec4(transformed, 1.0);');
        sh.fragmentShader = 'uniform sampler2D tRefl;\nuniform float reflK;\nuniform vec2 reflTexel;\nvarying vec4 vRefl;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
  vec2 ruv = vRefl.xy / vRefl.w;
  vec3 rc = texture2D(tRefl, ruv).rgb * 0.36;
  rc += (texture2D(tRefl, ruv + vec2(reflTexel.x, 0.0)).rgb + texture2D(tRefl, ruv - vec2(reflTexel.x, 0.0)).rgb) * 0.16;
  rc += (texture2D(tRefl, ruv + vec2(0.0, reflTexel.y)).rgb + texture2D(tRefl, ruv - vec2(0.0, reflTexel.y)).rgb) * 0.16;
  float rf = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
  outgoingLight += rc * reflK * (0.25 + 0.75 * rf * rf);
  #include <opaque_fragment>`);
      };
      m.customProgramCacheKey = () => 'mirror';
    },
    setSize(w, h) {
      rt.setSize(Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale)));
      U.reflTexel.value.set(1.6 / rt.width, 1.6 / rt.height);
    },
    render() {
      camera.updateMatrixWorld();
      const e = camera.matrixWorld.elements;
      cam.near = camera.near; cam.far = camera.far;
      cam.position.set(e[12], -e[13], e[14]);
      cam.up.set(e[4], -e[5], e[6]);
      fwd.set(-e[8], e[9], -e[10]).add(cam.position);
      cam.lookAt(fwd);
      cam.updateMatrixWorld();
      cam.projectionMatrix.copy(camera.projectionMatrix);
      U.reflMat.value.copy(bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
      // oblique near plane so nothing under the floor leaks into the reflection
      plane.normal.set(0, 1, 0); plane.constant = 0;
      plane.applyMatrix4(cam.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const p = cam.projectionMatrix.elements;
      qv.set((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
      clip.multiplyScalar(2 / clip.dot(qv));
      p[2] = clip.x; p[6] = clip.y; p[10] = clip.z + 1 - 0.003; p[14] = clip.w;
      for (const o of hidden) o.visible = false;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.setRenderTarget(null);
      for (const o of hidden) o.visible = true;
    },
  };
}
const mirror = makeMirror(0.45, 0.55);

// court floor: varnished maple boards with the key, arcs and lines painted on
const FW = 18, FD = 26, FZ = -20; // spans x -9..9, z -20..+6
const floorTex = canvasTex(1024, 2048, (g, w, h) => {
  const bw = 8, rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i * bw < w; i++) {
    let y = -rnd(i * 3) * 300;
    let k = 0;
    while (y < h) {
      const len = 160 + rnd(i * 7 + k * 13) * 320;
      const r = rnd(i * 11 + k * 5);
      g.fillStyle = `hsl(${30 + r * 7}, ${50 + r * 14}%, ${57 + rnd(i + k * 17) * 11}%)`;
      g.fillRect(i * bw, y, bw, len);
      // grain streaks
      for (let s = 0; s < 3; s++) { g.fillStyle = `rgba(120,60,20,${0.05 + rnd(i * 5 + s + k) * 0.08})`; g.fillRect(i * bw + rnd(i + s * 9 + k) * bw, y, 1, len); }
      g.fillStyle = 'rgba(70,35,10,.35)'; g.fillRect(i * bw, y, bw, 1.5);
      y += len; k++;
    }
    g.fillStyle = 'rgba(70,35,10,.22)'; g.fillRect(i * bw, 0, 1, h);
  }
  // draw in metres from here on (x right, z down the canvas)
  g.setTransform(w / FW, 0, 0, h / FD, w / 2, (-FZ / FD) * h);
  const line = (fn, lw = 0.06, col = '#ffffff') => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); fn(); g.stroke(); };
  const BL = -6.0, HZ = -4.4; // baseline and the basket centre
  // out of bounds apron, behind the baseline and past the sidelines
  g.fillStyle = 'rgba(16,36,120,.86)';
  g.fillRect(-9, -20, 18, 20 + BL);
  g.fillRect(-9, BL, 1.4, 12); g.fillRect(7.6, BL, 1.4, 12);
  // the painted key with a soft inner gradient
  const kg = g.createLinearGradient(0, BL, 0, -0.2);
  kg.addColorStop(0, 'rgba(37,99,235,.92)'); kg.addColorStop(1, 'rgba(29,78,216,.82)');
  g.fillStyle = kg; g.fillRect(-2.45, BL, 4.9, 5.8);
  line(() => g.rect(-2.45, BL, 4.9, 5.8));
  line(() => g.arc(0, -0.2, 1.8, 0, Math.PI));
  g.setLineDash([0.3, 0.25]); line(() => g.arc(0, -0.2, 1.8, Math.PI, Math.PI * 2)); g.setLineDash([]);
  // restricted arc, three-point line, baseline and sidelines
  line(() => g.arc(0, HZ, 1.25, 0, Math.PI));
  const a = Math.acos(6.6 / 6.75);
  line(() => { g.moveTo(-6.6, BL); g.lineTo(-6.6, HZ + Math.sin(a) * 6.75); g.arc(0, HZ, 6.75, Math.PI - a, a, true); g.lineTo(6.6, BL); });
  line(() => { g.moveTo(-7.6, BL); g.lineTo(7.6, BL); g.moveTo(-7.6, BL); g.lineTo(-7.6, 6); g.moveTo(7.6, BL); g.lineTo(7.6, 6); }, 0.08);
  // block marks on the key
  g.fillStyle = '#ffffff';
  for (const z of [-4.9, -3.95, -3.1, -2.25]) { g.fillRect(-2.65, z, 0.2, 0.06); g.fillRect(2.45, z, 0.2, 0.06); }
  // name painted on the apron behind the baseline
  g.save(); g.scale(1, 1.4); g.font = '900 1.25px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,.88)'; g.fillText('HOOP SHOT', 0, (BL - 1.05) / 1.4); g.restore();
});
floorTex.anisotropy = 8;
const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.32, metalness: 0 });
mirror.patch(floorMat);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, FZ + FD / 2);
floor.receiveShadow = true;
scene.add(floor);
mirror.hidden.push(floor);

// ---------------------------------------------------------------------------
// The arena: courtside LED boards, tiered stands with a crowd, an upper tier,
// a ribbon board, a jumbotron and sweeping spotlights.
// ---------------------------------------------------------------------------
const ledTex = canvasTex(1024, 64, (g, w, h) => {
  const words = ['HOOP SHOT', '🏀', 'SWISH!', '3 PT', 'ON FIRE', '🏀', 'BUCKETS', 'GAME ON'];
  const cols = [['#ff7b00', '#ffd60a'], ['#2563eb', '#7dd3fc'], ['#e11d48', '#ffffff'], ['#16a34a', '#d9f99d']];
  const seg = w / words.length;
  words.forEach((t, i) => {
    const [bg, fg] = cols[i % cols.length];
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, bg); gr.addColorStop(1, '#0b1030');
    g.fillStyle = gr; g.fillRect(i * seg, 0, seg, h);
    g.font = '900 38px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fg; g.fillText(t, i * seg + seg / 2, h / 2 + 2);
  });
  g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
});
ledTex.wrapS = THREE.RepeatWrapping;
const ledMat = new THREE.MeshBasicMaterial({ map: ledTex });
const ribbonTex = ledTex.clone();
ribbonTex.repeat.set(3, 1);
ribbonTex.needsUpdate = true;
const ribbonMat = new THREE.MeshBasicMaterial({ map: ribbonTex });

const box = (w, h, d, r = 0.04) => new THREE.RoundedBoxGeometry(w, h, d, 2, r);
const stat = [];
// courtside boards behind the baseline and along the sides
stat.push([box(16.4, 0.9, 0.3), '#10142b', M4(0, 0.45, -8.3)]);
const ledBack = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.66), ledMat);
ledBack.position.set(0, 0.47, -8.14);
scene.add(ledBack);
for (const sd of [-1, 1]) {
  stat.push([box(0.3, 0.9, 11.4), '#10142b', M4(sd * 8.25, 0.45, -2.4)]);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.66), ledMat);
  led.rotation.y = -sd * Math.PI / 2;
  led.position.set(sd * 8.09, 0.47, -2.4);
  scene.add(led);
}
// stands: risers, seat rows and the people in them
const ROWS = 8, SROWS = 6;
const seatGeo = new THREE.BoxGeometry(0.44, 0.34, 0.08), cushGeo = new THREE.BoxGeometry(0.44, 0.07, 0.36);
const seatSpots = [];
for (let k = 0; k < ROWS; k++) {
  const y = 0.55 + k * 0.42, z = -9.0 - k * 0.8;
  stat.push([box(18.4, y, 0.82, 0.02), k % 2 ? '#141a3a' : '#1a2148', M4(0, y / 2, z)]);
  for (let x = -8.6; x <= 8.6; x += 0.56) {
    const col = Math.abs(x) < 2.6 ? TEAM2 : (Math.floor((x + 9) / 3) % 2 ? '#1e3a8a' : '#2b4fc4');
    stat.push([seatGeo, col, M4(x, y + 0.2, z - 0.3)]);
    stat.push([cushGeo, col, M4(x, y + 0.04, z - 0.1)]);
    seatSpots.push([x, y, z - 0.12, 0]);
  }
}
for (const sd of [-1, 1]) {
  for (let k = 0; k < SROWS; k++) {
    const y = 0.55 + k * 0.42, x = sd * (8.95 + k * 0.8);
    stat.push([box(0.82, y, 12.6, 0.02), k % 2 ? '#141a3a' : '#1a2148', M4(x, y / 2, -2.2)]);
    for (let z = 3.6; z >= -8.2; z -= 0.56) {
      const col = Math.floor((z + 9) / 3) % 2 ? '#1e3a8a' : '#2b4fc4';
      stat.push([seatGeo, col, M4(x + sd * 0.3, y + 0.2, z, -sd * Math.PI / 2)]);
      stat.push([cushGeo, col, M4(x + sd * 0.1, y + 0.04, z, -sd * Math.PI / 2)]);
      seatSpots.push([x + sd * 0.12, y, z, -sd * Math.PI / 2]);
    }
  }
}
const stands = bake(stat, { roughness: 0.75 });
scene.add(stands);

// the crowd: instanced bodies, heads and arms that shoot up when they cheer
const crowdU = { uTime: { value: 0 }, uHype: { value: 0 } };
function crowdMat(arms) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = crowdU.uTime;
    sh.uniforms.uHype = crowdU.uHype;
    sh.vertexShader = 'uniform float uTime;\nuniform float uHype;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
  float pick = fract(ph * 0.37);
  ${arms ? 'transformed = mix(vec3(0.0, 0.42, 0.0), transformed, clamp(uHype * 1.8 - pick * 0.7, 0.0, 1.0));' : ''}
  transformed.y += sin(uTime * 2.0 + ph) * 0.012 + abs(sin(uTime * (7.0 + pick * 3.0) + ph)) * 0.2 * uHype * step(0.25, pick);`);
  };
  m.customProgramCacheKey = () => 'crowd' + (arms ? 1 : 0);
  return m;
}
const crowd = (() => {
  const bodyG = new THREE.CapsuleGeometry(0.17, 0.26, 3, 8); bodyG.translate(0, 0.36, 0);
  const headG = new THREE.SphereGeometry(0.12, 10, 8); headG.translate(0, 0.76, 0);
  const armG = THREE.mergeGeometries([-1, 1].map((sd) => { const a = new THREE.CapsuleGeometry(0.045, 0.28, 2, 6); a.rotateZ(sd * 0.35); a.translate(sd * 0.25, 0.68, 0.02); return a; }));
  const spots = seatSpots.filter((_, i) => Math.sin(i * 91.7) * 0.5 + 0.5 < 0.84);
  const n = spots.length;
  const bodies = new THREE.InstancedMesh(bodyG, crowdMat(false), n);
  const heads = new THREE.InstancedMesh(headG, crowdMat(false), n);
  const arms = new THREE.InstancedMesh(armG, crowdMat(true), n);
  const shirts = ['#ff7b00', '#ff7b00', '#2563eb', '#2563eb', '#ffffff', '#ffd60a', '#e11d48', '#16a34a', '#7c3aed', '#111827'];
  const skins = ['#ffd6b0', '#f1c27d', '#e0a878', '#c68642', '#8d5524'];
  const c = new THREE.Color(), m = new THREE.Matrix4();
  spots.forEach(([x, y, z, ry], i) => {
    const s = 0.9 + ((i * 37) % 10) * 0.025;
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
    bodies.setMatrixAt(i, m); heads.setMatrixAt(i, m); arms.setMatrixAt(i, m);
    bodies.setColorAt(i, c.set(shirts[(i * 7 + (i >> 3)) % shirts.length]));
    heads.setColorAt(i, c.set(skins[(i * 3) % skins.length]));
    arms.setColorAt(i, c);
  });
  scene.add(bodies, heads, arms);
  return { bodies, heads, arms };
})();

// back wall: an upper tier painted as a sea of fans, with a ribbon board below it
const upperTex = canvasTex(1024, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#05061a'); gr.addColorStop(0.35, '#0d1238'); gr.addColorStop(1, '#151b4a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const cols = ['#ff7b00', '#2563eb', '#ffffff', '#ffd60a', '#e11d48', '#3b82f6'];
  for (let r = 0; r < 12; r++) {
    const y = h * 0.42 + r * 22;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 8, w, 6);
    for (let x = (r % 2) * 6; x < w; x += 12) {
      if (Math.sin(x * 12.9 + r * 78.2) > 0.75) continue;
      g.fillStyle = cols[(x * 7 + r * 3) % cols.length]; g.globalAlpha = 0.55;
      g.fillRect(x, y, 9, 10);
      g.fillStyle = '#e0a878'; g.globalAlpha = 0.6;
      g.beginPath(); g.arc(x + 4.5, y - 2, 3.6, 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;
  // lights ringing the roof
  for (let x = 20; x < w; x += 64) { const rg = g.createRadialGradient(x, 40, 0, x, 40, 26); rg.addColorStop(0, 'rgba(255,255,240,.95)'); rg.addColorStop(1, 'rgba(255,255,240,0)'); g.fillStyle = rg; g.fillRect(x - 26, 14, 52, 52); }
});
const upperMat = new THREE.MeshBasicMaterial({ map: upperTex });
const upper = new THREE.Mesh(new THREE.PlaneGeometry(36, 14), upperMat);
upper.position.set(0, 7, -16.4);
scene.add(upper);
for (const sd of [-1, 1]) {
  const u = new THREE.Mesh(new THREE.PlaneGeometry(26, 14), upperMat);
  u.rotation.y = -sd * Math.PI / 2;
  u.position.set(sd * 14.2, 7, -3);
  scene.add(u);
}
const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.5), ribbonMat);
ribbon.position.set(0, 4.4, -16.3);
scene.add(ribbon);

// jumbotron hanging over the court
const jumboCanvas = document.createElement('canvas');
jumboCanvas.width = 512; jumboCanvas.height = 256;
const jumboTex = new THREE.CanvasTexture(jumboCanvas);
jumboTex.colorSpace = THREE.SRGBColorSpace;
const jumbo = new THREE.Group();
jumbo.position.set(0, 6.05, -9.2);
scene.add(jumbo);
{
  const body = new THREE.Mesh(box(3.3, 1.65, 1.7, 0.12), metal('#20263a', { roughness: 0.4 }));
  jumbo.add(body);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.38), new THREE.MeshBasicMaterial({ map: jumboTex }));
  screen.position.z = 0.86;
  jumbo.add(screen);
  const ringA = new THREE.Mesh(box(3.4, 0.12, 1.8, 0.05), new THREE.MeshBasicMaterial({ color: '#21d4d4' }));
  ringA.position.y = -0.88;
  const ringB = new THREE.Mesh(box(3.4, 0.08, 1.8, 0.03), new THREE.MeshBasicMaterial({ color: '#ff6fd8' }));
  ringB.position.y = 0.86;
  jumbo.add(ringA, ringB);
  for (const x of [-1.2, 1.2]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 6, 6), metal('#3a4055')); c.position.set(x, 3.8, 0); jumbo.add(c); }
}
let jumboFlash = 0, jumboMsg = '';
function drawJumbo() {
  const g = jumboCanvas.getContext('2d'), w = 512, h = 256;
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#0b1240'); gr.addColorStop(1, '#1c0f3a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (jumboFlash > 0) {
    g.fillStyle = onFire ? '#ff7b00' : '#ffd60a';
    g.fillRect(0, 0, w, h);
    g.font = '900 110px system-ui, sans-serif';
    g.fillStyle = '#1b1035'; g.fillText(jumboMsg, w / 2, h / 2 + 8);
  } else {
    g.font = '800 30px system-ui, sans-serif'; g.fillStyle = '#7dd3fc';
    g.fillText('SCORE', w * 0.27, 40); g.fillText('TIME', w * 0.73, 40);
    g.font = '900 120px system-ui, sans-serif'; g.fillStyle = '#ffd60a';
    g.fillText(String(score), w * 0.27, 140);
    g.fillStyle = clock <= 5 && state === 'play' ? '#ff4d6d' : '#ffffff';
    g.fillText(String(Math.max(0, Math.ceil(clock))), w * 0.73, 140);
    g.font = '800 28px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.75)';
    g.fillText('TARGET ' + target + '  ·  LEVEL ' + save.level, w / 2, 222);
    g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(w / 2 - 1, 30, 2, 160);
  }
  // LED pixel grid
  g.fillStyle = 'rgba(0,0,0,.22)';
  for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  jumboTex.needsUpdate = true;
}
function flashJumbo(msg) { jumboMsg = msg; jumboFlash = 1.3; drawJumbo(); }

// spotlight beams sweeping the court, with pools of light where they land
const beamTex = canvasTex(8, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const poolTex = canvasTex(128, 128, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const beamGeo = new THREE.CylinderGeometry(0.08, 1.1, 1, 20, 1, true);
beamGeo.translate(0, -0.5, 0);
beamGeo.rotateX(-Math.PI / 2); // points down +z so lookAt aims it
const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const beams = [];
const beamCols = ['#9cc3ff', '#ffffff', '#ffb4e6', '#ffffff', '#9cc3ff'];
for (let i = 0; i < 5; i++) {
  const bm = new THREE.MeshBasicMaterial({ color: beamCols[i], map: beamTex, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(beamGeo, bm);
  beam.position.set((i - 2) * 3.4, 12, -8 + Math.abs(i - 2) * 1.5);
  const pool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ color: beamCols[i], map: poolTex, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.scale.set(2.6, 1, 2.6);
  scene.add(beam, pool);
  beams.push({ beam, pool, ph: i * 1.3, tgt: new THREE.Vector3() });
}
function updateBeams(dt) {
  for (const b of beams) {
    const t = time * 0.35 + b.ph;
    b.tgt.set(Math.sin(t) * 4.2, 0, -3.5 + Math.cos(t * 0.8) * 3.2);
    const d = b.beam.position.distanceTo(b.tgt);
    b.beam.scale.set(1.25, 1.25, d);
    b.beam.lookAt(b.tgt);
    b.pool.position.set(b.tgt.x, 0.012, b.tgt.z);
    b.beam.material.color.set(onFire ? '#ffa24a' : beamCols[beams.indexOf(b)]);
    b.pool.material.color.copy(b.beam.material.color);
  }
}

// cheerleaders by the baseline: idle, then jump and wave on every basket
const cheer = [-1, 1].map((sd) => {
  const h = makeHuman({ shirt: TEAM2, pants: '#1e3a8a', style: sd < 0 ? 'long' : 'bun', hair: sd < 0 ? '#6b3e1f' : '#2b2118', shoe: '#ffffff', scale: 1.05 });
  h.root.position.set(sd * 3.5, 0, -7.4);
  h.root.rotation.y = -sd * 0.35;
  const pom = new THREE.IcosahedronGeometry(0.11, 1);
  h.arms.forEach((a, i) => {
    const p = new THREE.Mesh(pom, matte(i ? '#ffd60a' : TEAM, { roughness: 0.95 }));
    p.position.set(0, -0.38, 0.02);
    p.scale.set(1, 1.1, 1);
    a.add(p);
  });
  h.root.add(blob(0.32, 0.4));
  scene.add(h.root);
  return h;
});
let hype = 0;

// ---------------------------------------------------------------------------
// Hoop: backboard, rim, net, pole. Everything lives in `hoop` so it can move.
// ---------------------------------------------------------------------------
const hoop = new THREE.Group();
scene.add(hoop);
const boardTex = canvasTex(512, 300, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#ffffff'; g.lineWidth = 16; g.strokeRect(12, 12, w - 24, h - 24);
  g.lineWidth = 11; g.strokeRect(w * 0.335, h * 0.42, w * 0.33, h * 0.43);
});
const BOARD = { w: 1.8, h: 1.05, d: 0.06, y: RIM_Y + 0.38, z: -RIM_R - 0.19 };
const glass = new THREE.Mesh(box(BOARD.w, BOARD.h, 0.035, 0.015), new THREE.MeshStandardMaterial({ color: '#d4f0ff', transparent: true, opacity: 0.24, roughness: 0.03, metalness: 0.2, envMapIntensity: 2.2, depthWrite: false }));
glass.position.set(0, BOARD.y, BOARD.z);
glass.renderOrder = 2;
hoop.add(glass);
const marks = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w - 0.03, BOARD.h - 0.03), new THREE.MeshBasicMaterial({ map: boardTex, transparent: true, depthWrite: false }));
marks.position.set(0, BOARD.y, BOARD.z + 0.02);
marks.renderOrder = 3;
hoop.add(marks);
const frameMat = metal('#2b3142', { roughness: 0.35 });
const padMat = glossy(TEAM, { roughness: 0.45, clearcoat: 0.5 });
const hoopParts = [];
const add = (geo, m, x, y, z, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; hoop.add(o); hoopParts.push(o); return o; };
add(box(BOARD.w + 0.06, 0.05, 0.07, 0.02), frameMat, 0, BOARD.y + BOARD.h / 2, BOARD.z);
add(box(0.05, BOARD.h, 0.07, 0.02), frameMat, -BOARD.w / 2 - 0.01, BOARD.y, BOARD.z);
add(box(0.05, BOARD.h, 0.07, 0.02), frameMat, BOARD.w / 2 + 0.01, BOARD.y, BOARD.z);
add(box(BOARD.w + 0.1, 0.1, 0.12, 0.045), padMat, 0, BOARD.y - BOARD.h / 2 - 0.02, BOARD.z);
// shot clock on top of the board
const clockCanvas = document.createElement('canvas');
clockCanvas.width = 128; clockCanvas.height = 64;
const clockTex = new THREE.CanvasTexture(clockCanvas);
clockTex.colorSpace = THREE.SRGBColorSpace;
add(box(0.42, 0.2, 0.12, 0.03), metal('#15171f', { roughness: 0.5 }), 0, BOARD.y + BOARD.h / 2 + 0.13, BOARD.z);
const clockFace = add(new THREE.PlaneGeometry(0.36, 0.15), new THREE.MeshBasicMaterial({ map: clockTex, toneMapped: false }), 0, BOARD.y + BOARD.h / 2 + 0.13, BOARD.z + 0.062, false);
function drawShotClock() {
  const g = clockCanvas.getContext('2d');
  g.fillStyle = '#0a0a0e'; g.fillRect(0, 0, 128, 64);
  g.font = '900 52px ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,40,40,.12)'; g.fillText('88', 64, 35);
  g.fillStyle = '#ff3b30'; g.shadowColor = '#ff3b30'; g.shadowBlur = 12;
  g.fillText(String(Math.max(0, Math.ceil(clock))).padStart(2, '0'), 64, 35);
  g.shadowBlur = 0;
  clockTex.needsUpdate = true;
}
// stanchion: padded base, padded pole, curved arm to the board
const POLE_Z = BOARD.z - 0.9;
add(box(0.86, 0.62, 1.0, 0.12), padMat, 0, 0.31, POLE_Z - 0.12);
add(new THREE.CylinderGeometry(0.1, 0.1, BOARD.y + 0.2, 16), frameMat, 0, (BOARD.y + 0.2) / 2, POLE_Z);
add(new THREE.CylinderGeometry(0.135, 0.135, 1.5, 18), padMat, 0, 1.35, POLE_Z);
const armCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, BOARD.y + 0.2, POLE_Z), new THREE.Vector3(0, BOARD.y + 0.18, POLE_Z + 0.45), new THREE.Vector3(0, BOARD.y + 0.05, BOARD.z - 0.06)]);
add(new THREE.TubeGeometry(armCurve, 16, 0.055, 10), frameMat, 0, 0, 0);
const strut = new THREE.CatmullRomCurve3([new THREE.Vector3(0, BOARD.y - 0.45, POLE_Z), new THREE.Vector3(0, BOARD.y - 0.25, POLE_Z + 0.5), new THREE.Vector3(0, BOARD.y - 0.32, BOARD.z - 0.06)]);
add(new THREE.TubeGeometry(strut, 16, 0.035, 8), frameMat, 0, 0, 0);
const hoopShadow = blob(0.75, 0.45);
hoopShadow.position.set(0, 0.006, POLE_Z - 0.1);
hoop.add(hoopShadow);

// rim + net hang off a pivot at the back so the rim can flex when it's hit
const rimMat = mat('#ff5a1f', { roughness: 0.3, metalness: 0.55, emissive: 0x401000 });
const rimPivot = new THREE.Group();
rimPivot.position.set(0, RIM_Y, -RIM_R - 0.05);
hoop.add(rimPivot);
const rimGroup = new THREE.Group();
rimGroup.position.z = RIM_R + 0.05;
rimPivot.add(rimGroup);
const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, RIM_TUBE, 12, 56), rimMat);
rim.rotation.x = Math.PI / 2;
rim.castShadow = true;
rimGroup.add(rim);
{
  const parts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const loop = new THREE.TorusGeometry(0.014, 0.0045, 4, 10);
    loop.rotateY(-a);
    loop.translate(Math.cos(a) * RIM_R, -0.022, Math.sin(a) * RIM_R);
    parts.push(loop);
  }
  const plate = new THREE.RoundedBoxGeometry(0.2, 0.13, 0.025, 2, 0.008); plate.translate(0, -0.04, -RIM_R - 0.045);
  const brace = new THREE.RoundedBoxGeometry(0.1, 0.03, 0.08, 2, 0.01); brace.translate(0, -0.012, -RIM_R - 0.02);
  const bracket = new THREE.Mesh(THREE.mergeGeometries([...parts.map((p) => p.toNonIndexed()), plate.toNonIndexed(), brace.toNonIndexed()]), rimMat);
  bracket.castShadow = true;
  rimGroup.add(bracket);
}

// net: a tapered sleeve with a woven diamond texture. Its vertices are springs:
// balls push them outward on the way through and a basket sends a ripple down.
const NET_SEG = 18, NET_ROWS = 7, NET_H = 0.44;
const netTex = canvasTex(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.lineCap = 'round';
  for (const [lw, col] of [[11, 'rgba(160,170,190,1)'], [7, '#ffffff']]) {
    g.strokeStyle = col; g.lineWidth = lw;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h);
    g.stroke();
  }
});
netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
const netBase = [];
const netUv = [];
for (let r = 0; r <= NET_ROWS; r++) {
  const t = r / NET_ROWS;
  const rad = RIM_R * (1 - t * 0.4 + Math.sin(t * Math.PI) * 0.06);
  for (let s = 0; s <= NET_SEG; s++) {
    const a = (s / NET_SEG) * Math.PI * 2;
    netBase.push(new THREE.Vector3(Math.cos(a) * rad, -t * NET_H, Math.sin(a) * rad));
    netUv.push((s / NET_SEG) * 9, 1 - t * 3.2);
  }
}
const netIdx = [];
for (let r = 0; r < NET_ROWS; r++) for (let s = 0; s < NET_SEG; s++) {
  const a = r * (NET_SEG + 1) + s, b = a + NET_SEG + 1;
  netIdx.push(a, b, a + 1, a + 1, b, b + 1);
}
const netGeo = new THREE.BufferGeometry();
const netPos = new Float32Array(netBase.length * 3);
netGeo.setAttribute('position', new THREE.BufferAttribute(netPos, 3));
netGeo.setAttribute('uv', new THREE.Float32BufferAttribute(netUv, 2));
netGeo.setIndex(netIdx);
const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: netTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }));
rimGroup.add(net);
const netOff = netBase.map(() => new THREE.Vector3()), netVel = netBase.map(() => new THREE.Vector3());
let netSwish = 0, netPush = new THREE.Vector2();
const nTmp = new THREE.Vector3(), nBall = new THREE.Vector3();
function updateNet(dt) {
  netSwish = Math.max(0, netSwish - dt * 1.2);
  const wave = (1 - netSwish) * 1.6; // ripple front travels down the net
  const near = balls.filter((b) => Math.abs(b.pos.y - (hoopCenter.y - NET_H / 2)) < NET_H && Math.hypot(b.pos.x - hoopCenter.x, b.pos.z - hoopCenter.z) < RIM_R + BALL_R);
  for (let i = 0; i < netBase.length; i++) {
    const base = netBase[i], o = netOff[i], v = netVel[i];
    const depth = -base.y / NET_H;
    if (depth === 0) { netPos[i * 3] = base.x; netPos[i * 3 + 1] = base.y; netPos[i * 3 + 2] = base.z; continue; }
    // spring back to rest
    v.addScaledVector(o, -90 * dt).multiplyScalar(Math.max(0, 1 - 7 * dt));
    if (netSwish > 0) {
      const k = Math.exp(-Math.pow((depth - wave) * 3, 2)) * netSwish;
      v.x += (base.x * 6 + netPush.x * 30) * k * dt * 10;
      v.z += (base.z * 6 + netPush.y * 30) * k * dt * 10;
      v.y += -0.6 * k * dt * 10;
    }
    o.addScaledVector(v, dt);
    // balls inside the net shove it outward
    for (const b of near) {
      nBall.set(b.pos.x - hoop.position.x, b.pos.y - hoopCenter.y, b.pos.z - hoop.position.z);
      nTmp.copy(base).add(o).sub(nBall);
      const d = nTmp.length(), R = BALL_R * 1.12;
      if (d < R && d > 1e-4) {
        nTmp.multiplyScalar((R - d) / d);
        o.add(nTmp);
        v.addScaledVector(nTmp, 12);
      }
    }
    netPos[i * 3] = base.x + o.x;
    netPos[i * 3 + 1] = base.y * (1 + Math.min(0.3, o.length() * 0.6)) + o.y;
    netPos[i * 3 + 2] = base.z + o.z;
  }
  netGeo.attributes.position.needsUpdate = true;
  netGeo.computeVertexNormals();
}

// glowing shooting spot under the ball
const spotTex = canvasTex(128, 128, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, w * 0.18, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,214,10,0)'); gr.addColorStop(0.55, 'rgba(255,214,10,.9)'); gr.addColorStop(0.7, 'rgba(255,240,170,1)'); gr.addColorStop(1, 'rgba(255,214,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const spot = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: spotTex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
spot.rotation.x = -Math.PI / 2;
spot.position.set(0, 0.015, 0);
scene.add(spot);

// ---------------------------------------------------------------------------
// Balls: pebbled leather with real seams (two great circles and the two
// curved panel seams), drawn per pixel so the lines stay crisp on the sphere
// ---------------------------------------------------------------------------
const TW = 512, TH = 256;
const ballGeo = new THREE.SphereGeometry(BALL_R, 48, 32);
let seamMask = null, pebbleMask = null;
function ballMasks() {
  if (seamMask) return;
  seamMask = new Float32Array(TW * TH);
  pebbleMask = new Float32Array(TW * TH);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let py = 0; py < TH; py++) {
    const th = ((py + 0.5) / TH) * Math.PI, st = Math.sin(th), Y = Math.cos(th);
    for (let px = 0; px < TW; px++) {
      const ph = ((px + 0.5) / TW) * Math.PI * 2;
      const X = -Math.cos(ph) * st, Z = Math.sin(ph) * st;
      let d = Math.min(Math.abs(Y), Math.abs(X));
      d = Math.min(d, Math.abs(Math.abs(Z) - (0.6 + 0.3 * (Y * Y - X * X))) * 0.75);
      const i = py * TW + px;
      seamMask[i] = 1 - ss(0.011, 0.022, d);
      // pebbles: a cheap cellular bump from a few sine lattices
      const q = Math.sin(X * 95 + Math.sin(Z * 40)) * Math.sin(Y * 95 + Math.sin(X * 37)) * Math.sin(Z * 95 + Math.sin(Y * 41));
      pebbleMask[i] = Math.abs(q);
    }
  }
}
let bumpTex = null;
function pixelTex(fn, srgb = true) {
  const c = document.createElement('canvas');
  c.width = TW; c.height = TH;
  const g = c.getContext('2d'), img = g.createImageData(TW, TH);
  for (let i = 0; i < TW * TH; i++) { const [r, gg, b] = fn(i, i % TW, (i / TW) | 0); img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const rgb = (hex) => { const c = new THREE.Color(hex); c.convertLinearToSRGB(); return [c.r * 255, c.g * 255, c.b * 255]; };
function skinTex(s) {
  ballMasks();
  const seam = rgb(s.seam || '#2b1600');
  const base = s.stripes ? s.stripes.map(rgb) : [rgb(s.base)];
  const stars = s.stars ? new Set(Array.from({ length: 260 }, () => (Math.random() * TW * TH) | 0)) : null;
  return pixelTex((i, x) => {
    const b = base.length > 1 ? base[Math.floor((x / TW) * base.length)] : base[0];
    const p = 0.9 + pebbleMask[i] * 0.16, m = seamMask[i];
    let r = b[0] * p, g = b[1] * p, bl = b[2] * p;
    if (stars && stars.has(i)) { r = g = bl = 255; }
    return [r + (seam[0] - r) * m, g + (seam[1] - g) * m, bl + (seam[2] - bl) * m];
  });
}
function ballMaterial(id) {
  if (ballMats[id]) return ballMats[id];
  const s = SKINS.find((k) => k.id === id) || SKINS[0];
  if (!bumpTex) { ballMasks(); bumpTex = pixelTex((i) => { const v = 150 + pebbleMask[i] * 90 - seamMask[i] * 150; return [v, v, v]; }, false); }
  const map = skinTex(s.stripes ? Object.assign({ seam: '#1b1b22' }, s) : s);
  ballMats[id] = new THREE.MeshPhysicalMaterial({
    map, bumpMap: bumpTex, bumpScale: 1.2, roughness: s.metal ? 0.22 : 0.58, metalness: s.metal ? 0.85 : 0,
    clearcoat: s.metal ? 0.8 : 0.18, clearcoatRoughness: 0.35, sheen: s.metal ? 0 : 0.25, sheenColor: new THREE.Color(s.base || '#ffffff'),
    emissive: s.glow ? 0xff2fbf : 0x000000, emissiveIntensity: s.glow ? 0.45 : 0,
  });
  return ballMats[id];
}
const ballMats = {};
let fireMat = null;
function fireMaterial() {
  if (!fireMat) {
    ballMaterial('classic');
    const map = skinTex({ base: '#ff7b00', seam: '#ffe066' });
    fireMat = new THREE.MeshPhysicalMaterial({ map, bumpMap: bumpTex, bumpScale: 1.2, roughness: 0.5, emissive: '#ff4400', emissiveMap: map, emissiveIntensity: 0.8, clearcoat: 0.3 });
  }
  return fireMat;
}

const balls = [];
let ready = null;          // the ball sitting on the ramp, ready to shoot
let readyT = 0;
function makeBall() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(ballGeo, ballMaterial(save.skin));
  m.castShadow = true;
  g.add(m);
  const shadow = blob(BALL_R * 1.6, 0.5);
  scene.add(g, shadow);
  return { g, m, shadow, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, flying: false, scored: false, rimHits: 0, board: false, prevY: 0, fire: false, done: false, sq: 0, sqV: 0 };
}
function spawnReady() {
  const b = makeBall();
  b.pos.set(shooterX, START.y, START.z + 0.6);
  b.g.position.copy(b.pos);
  ready = b;
  readyT = 0;
}
function removeBall(b) {
  scene.remove(b.g, b.shadow);
  b.shadow.material.dispose();
}

// ---------------------------------------------------------------------------
// Particles: one additive point cloud for sparks, flames and swish glitter,
// plus instanced confetti
// ---------------------------------------------------------------------------
const PN = 600;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN), pAlpha = new Float32Array(PN);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('pcolor', new THREE.BufferAttribute(pCol, 3));
pGeo.setAttribute('psize', new THREE.BufferAttribute(pSize, 1));
pGeo.setAttribute('palpha', new THREE.BufferAttribute(pAlpha, 1));
const dotTex = canvasTexture(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
}, { srgb: false });
const pMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: dotTex }, uScale: { value: 500 } },
  vertexShader: 'attribute vec3 pcolor;\nattribute float psize;\nattribute float palpha;\nuniform float uScale;\nvarying vec3 vC;\nvarying float vA;\nvoid main() {\n  vC = pcolor; vA = palpha;\n  vec4 mv = modelViewMatrix * vec4(position, 1.0);\n  gl_PointSize = psize * uScale / max(0.1, -mv.z);\n  gl_Position = projectionMatrix * mv;\n}',
  fragmentShader: 'uniform sampler2D map;\nvarying vec3 vC;\nvarying float vA;\nvoid main() {\n  float a = texture2D(map, gl_PointCoord).a * vA;\n  if (a < 0.01) discard;\n  gl_FragColor = vec4(vC, a);\n}',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);
const P = { n: 0, v: new Float32Array(PN * 3), life: new Float32Array(PN), max: new Float32Array(PN), s0: new Float32Array(PN), grav: new Float32Array(PN), drag: new Float32Array(PN) };
const colCache = {};
function emit(x, y, z, vx, vy, vz, life, size, hex, grav = 0, drag = 0) {
  if (P.n >= PN) return;
  const i = P.n++;
  const c = colCache[hex] || (colCache[hex] = rgb(hex).map((v) => v / 255));
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  P.v[i * 3] = vx; P.v[i * 3 + 1] = vy; P.v[i * 3 + 2] = vz;
  pCol[i * 3] = c[0]; pCol[i * 3 + 1] = c[1]; pCol[i * 3 + 2] = c[2];
  P.life[i] = P.max[i] = life; P.s0[i] = size; P.grav[i] = grav; P.drag[i] = drag;
}
function moveParticle(from, to) {
  for (let k = 0; k < 3; k++) { pPos[to * 3 + k] = pPos[from * 3 + k]; P.v[to * 3 + k] = P.v[from * 3 + k]; pCol[to * 3 + k] = pCol[from * 3 + k]; }
  P.life[to] = P.life[from]; P.max[to] = P.max[from]; P.s0[to] = P.s0[from]; P.grav[to] = P.grav[from]; P.drag[to] = P.drag[from];
}
function stepParticles(dt) {
  for (let i = 0; i < P.n; i++) {
    P.life[i] -= dt;
    if (P.life[i] <= 0) { moveParticle(--P.n, i); i--; continue; }
    const k = Math.max(0, 1 - P.drag[i] * dt);
    P.v[i * 3] *= k; P.v[i * 3 + 1] = P.v[i * 3 + 1] * k - P.grav[i] * dt; P.v[i * 3 + 2] *= k;
    pPos[i * 3] += P.v[i * 3] * dt; pPos[i * 3 + 1] += P.v[i * 3 + 1] * dt; pPos[i * 3 + 2] += P.v[i * 3 + 2] * dt;
    const f = P.life[i] / P.max[i];
    pAlpha[i] = Math.min(1, f * 1.6);
    pSize[i] = P.s0[i] * (0.35 + 0.65 * f);
  }
  pGeo.setDrawRange(0, P.n);
  for (const a of ['position', 'pcolor', 'psize', 'palpha']) pGeo.attributes[a].needsUpdate = true;
}
function emitSpark(p, color) {
  emit(p.x + (Math.random() - 0.5) * 0.1, p.y + (Math.random() - 0.5) * 0.1, p.z + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.2, 0.16 + Math.random() * 0.08, color, -1, 2);
}
function burstGlitter(at, n, cols) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 2.2;
    emit(at.x, at.y, at.z, Math.cos(a) * s, 0.5 + Math.random() * 2.2, Math.sin(a) * s * 0.6, 0.6 + Math.random() * 0.5, 0.05 + Math.random() * 0.06, cols[i % cols.length], 5, 2.5);
  }
}
// expanding ring at the rim on a swish
const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dffb2', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
scene.add(ring);
let ringT = 1;
// confetti burst when a basket drops
const CONF = 180;
const confMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.085), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF);
confMesh.count = 0;
confMesh.frustumCulled = false;
scene.add(confMesh);
const confetti = [];
const confCols = ['#ffd60a', '#ff4d6d', '#3a86ff', '#3ddc97', '#ff6fd8', '#ffffff'];
const cTmp = new THREE.Object3D(), cCol = new THREE.Color();
function burstConfetti(at, n) {
  for (let i = 0; i < n && confetti.length < CONF; i++) {
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2.5;
    confetti.push({ p: at.clone(), v: new THREE.Vector3(Math.cos(a) * s * 0.6, 2 + Math.random() * 3, Math.sin(a) * s * 0.4), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), rv: new THREE.Vector3(Math.random() * 9, Math.random() * 9, 0), life: 1.6, c: confCols[i % confCols.length] });
  }
}
function stepConfetti(dt) {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.life -= dt;
    if (c.life <= 0) { confetti.splice(i, 1); continue; }
    c.v.y -= 6 * dt;
    c.v.multiplyScalar(1 - dt * 1.5);
    c.p.addScaledVector(c.v, dt);
    c.r.x += c.rv.x * dt; c.r.y += c.rv.y * dt;
  }
  confetti.forEach((c, i) => {
    cTmp.position.copy(c.p); cTmp.rotation.copy(c.r); cTmp.scale.setScalar(Math.min(1, c.life * 2));
    cTmp.updateMatrix();
    confMesh.setMatrixAt(i, cTmp.matrix);
    confMesh.setColorAt(i, cCol.set(c.c));
  });
  confMesh.count = confetti.length;
  confMesh.instanceMatrix.needsUpdate = true;
  if (confMesh.instanceColor) confMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = 'title';
let paused = false, menuOpen = false;
let time = 0, clock = ROUND_TIME, score = 0, target = 10, streak = 0, onFire = false;
let shots = 0, makes = 0, swishes = 0, extended = false;
let hoopAmp = 0, hoopSpeed = 0, hoopZ = -4.6, hoopBob = 0, shooterX = 0;
let hud = null, stopHand = null;
const hoopCenter = new THREE.Vector3();

function levelSetup(n) {
  target = Math.min(45, 9 + n * 3);
  hoopZ = -4.4 - Math.min(1.4, (n - 1) * 0.12);
  hoopAmp = n < 3 ? 0 : Math.min(1.2, 0.3 + (n - 3) * 0.12);
  hoopSpeed = n < 3 ? 0 : Math.min(1.2, 0.5 + (n - 3) * 0.05);
  hoopBob = n < 8 ? 0 : Math.min(0.35, (n - 7) * 0.06);
}
function placeHoop() {
  hoop.position.set(Math.sin(time * hoopSpeed) * hoopAmp, Math.sin(time * hoopSpeed * 1.7) * hoopBob, hoopZ);
  hoopCenter.set(hoop.position.x, RIM_Y + hoop.position.y, hoop.position.z);
}

// ---------------------------------------------------------------------------
// Shooting
// ---------------------------------------------------------------------------
const proj = new THREE.Vector3();
function toScreen(v) {
  proj.copy(v).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
}

/**
 * Turn a swipe into a shot. The swipe line is extended up to the hoop on
 * screen to find where the player aimed; its length sets the power (how
 * deep the ball lands). A little assist pulls near-perfect shots in.
 */
function shoot(dx, dy) {
  if (!ready || state !== 'play') return;
  const b = ready;
  ready = null;
  const bs = toScreen(b.pos), hs = toScreen(hoopCenter);
  const right = toScreen(hoopCenter.clone().add(new THREE.Vector3(1, 0, 0)));
  const pxPerM = Math.max(1, right.x - hs.x);
  const sx = bs.x + (dx / dy) * (bs.y - hs.y);
  let aimX = hoopCenter.x + (sx - hs.x) / pxPerM;
  const power = dy / (window.innerHeight * 0.32);
  let depth = (power - 1) * 2.2; // metres past (+) or short (-) of the rim centre
  // assist: pull close shots toward the centre
  const ax = aimX - hoopCenter.x;
  if (Math.abs(ax) < 0.16) aimX = hoopCenter.x + ax * 0.6;
  if (Math.abs(depth) < 0.22) depth *= 0.6;
  const tgt = new THREE.Vector3(aimX, hoopCenter.y, hoopCenter.z - depth);
  // arc: apex ~0.9m above the rim, then solve the flight time down to rim height
  const apex = Math.max(tgt.y, b.pos.y) + 0.9 + Math.max(0, power - 1) * 0.3;
  const vy = Math.sqrt(2 * G * (apex - b.pos.y));
  const tUp = vy / G;
  const tDown = Math.sqrt(Math.max(0.01, (2 * (apex - tgt.y)) / G));
  const T = tUp + tDown;
  // half-lead a moving hoop for the player; they supply the rest
  tgt.x += hoopAmp * hoopSpeed * Math.cos(time * hoopSpeed) * T * 0.5;
  b.vel.set((tgt.x - b.pos.x) / T, vy, (tgt.z - b.pos.z) / T);
  b.spin.set(-6 - Math.random() * 2, 0, (Math.random() - 0.5) * 2);
  b.flying = true;
  b.fire = onFire;
  b.prevY = b.pos.y;
  if (onFire) b.m.material = fireMaterial();
  balls.push(b);
  shots++;
  sfx.whoosh();
  UI.buzz(8);
  setTimeout(() => { if (state === 'play' && !ready) spawnReady(); }, 520);
  if (stopHand) { stopHand(); stopHand = null; save.tutorial = true; persist(); }
}

function scoreBasket(b) {
  b.scored = true;
  const swish = b.rimHits === 0 && !b.board;
  streak++;
  makes++;
  if (swish) swishes++;
  let pts = swish ? 3 : 2;
  if (b.fire) pts *= 2;
  score += pts;
  hud.setProgress(score / target);
  updateScore(true);
  netSwish = 1;
  netPush.set((b.vel.x) * 0.02, (b.vel.z) * 0.02);
  hype = Math.max(hype, swish ? 1 : 0.75);
  punch = swish ? 1 : 0.55;
  flashJumbo(b.fire ? 'FIRE!' : swish ? 'SWISH!' : '+' + pts);
  ring.position.set(hoopCenter.x, hoopCenter.y - 0.02, hoopCenter.z);
  ring.material.color.set(b.fire ? '#ff9f1c' : swish ? '#7dffb2' : '#ffd60a');
  ringT = 0;
  burstGlitter(hoopCenter.clone().add(new THREE.Vector3(0, -0.15, 0)), swish ? 70 : 36, b.fire ? ['#ff9f1c', '#ffd60a', '#ff4d00'] : swish ? ['#ffffff', '#7dffb2', '#7dd3fc'] : ['#ffffff', '#ffd60a']);
  const s = toScreen(hoopCenter.clone().add(new THREE.Vector3(0, 0.3, 0)));
  UI.floatText('+' + pts, s.x, s.y - 20, b.fire ? '#ffb703' : '#ffffff');
  noise(0, 0.25, 0.25, 5200, 0.8);
  if (swish) { tone(988, 0.02, 0.12, 'sine', 0.12); tone(1319, 0.1, 0.18, 'sine', 0.12); }
  else sfx.good();
  burstConfetti(hoopCenter.clone().add(new THREE.Vector3(0, -0.2, 0.1)), swish ? 26 : 14);
  if (streak === 3 && !onFire) {
    onFire = true;
    UI.praise('ON FIRE! 🔥', '#ff9f1c');
    sfx.win();
    UI.buzz([20, 30, 20]);
  } else if (swish) UI.praise(streak >= 3 ? 'SWISH x' + streak + '!' : 'SWISH!', '#7dffb2');
  if (score >= target && score - pts < target) { UI.praise('TARGET HIT!', '#ffd60a'); sfx.fanfare(); }
  if (score > save.best) save.best = score;
}

function missed() {
  if (onFire) { onFire = false; UI.floatText('Fire out', window.innerWidth / 2, window.innerHeight * 0.42, '#ffb3a7'); }
  streak = 0;
}

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------
const tmp = new THREE.Vector3(), n = new THREE.Vector3();
function bounce(b, normal, e, friction) {
  const vn = b.vel.dot(normal);
  if (vn >= 0) return false;
  b.vel.addScaledVector(normal, -(1 + e) * vn);
  // damp the tangential part a little
  tmp.copy(normal).multiplyScalar(b.vel.dot(normal));
  const tang = b.vel.clone().sub(tmp).multiplyScalar(friction);
  b.vel.copy(tmp).add(tang);
  return -vn;
}

function stepBall(b, dt) {
  b.vel.y -= G * dt;
  b.pos.addScaledVector(b.vel, dt);
  // rim: closest point on the hoop circle
  tmp.set(b.pos.x - hoopCenter.x, 0, b.pos.z - hoopCenter.z);
  const len = tmp.length() || 1e-4;
  const closest = new THREE.Vector3(hoopCenter.x + (tmp.x / len) * RIM_R, hoopCenter.y, hoopCenter.z + (tmp.z / len) * RIM_R);
  n.copy(b.pos).sub(closest);
  const d = n.length();
  if (d < BALL_R + RIM_TUBE && d > 1e-5) {
    n.multiplyScalar(1 / d);
    b.pos.copy(closest).addScaledVector(n, BALL_R + RIM_TUBE);
    const hit = bounce(b, n, 0.5, 0.88);
    if (hit > 0.4) {
      b.rimHits++;
      tone(420 + Math.random() * 60, 0, 0.09, 'triangle', Math.min(0.2, hit * 0.05));
      rim.scale.setScalar(1.06);
      rimFlexV += Math.min(2.5, hit * 0.6);
      shake = Math.min(1, shake + hit * 0.12);
      for (let k = 0; k < 6; k++) emit(closest.x, closest.y, closest.z, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.25 + Math.random() * 0.2, 0.05, k % 2 ? '#ffd28a' : '#ffffff', 6, 1);
    }
  }
  // backboard (axis-aligned box in hoop space)
  const bx = hoopCenter.x, by = BOARD.y + hoop.position.y, bz = hoopZ + BOARD.z;
  const cx = THREE.MathUtils.clamp(b.pos.x, bx - BOARD.w / 2, bx + BOARD.w / 2);
  const cy = THREE.MathUtils.clamp(b.pos.y, by - BOARD.h / 2, by + BOARD.h / 2);
  const cz = THREE.MathUtils.clamp(b.pos.z, bz - BOARD.d / 2, bz + BOARD.d / 2);
  n.set(b.pos.x - cx, b.pos.y - cy, b.pos.z - cz);
  const bd = n.length();
  if (bd < BALL_R && bd > 1e-5) {
    n.multiplyScalar(1 / bd);
    b.pos.set(cx, cy, cz).addScaledVector(n, BALL_R);
    const hit = bounce(b, n, 0.55, 0.9);
    if (hit > 0.4) { b.board = true; noise(0, 0.08, Math.min(0.25, hit * 0.04), 900); boardWob = Math.min(1, boardWob + hit * 0.15); shake = Math.min(1, shake + hit * 0.06); }
  }
  // pole (vertical cylinder)
  const px = hoopCenter.x, pz = hoopZ + BOARD.z - 0.9;
  tmp.set(b.pos.x - px, 0, b.pos.z - pz);
  const pd = tmp.length();
  if (pd < BALL_R + 0.1 && b.pos.y < BOARD.y + 0.2) { tmp.normalize(); b.pos.x = px + tmp.x * (BALL_R + 0.1); b.pos.z = pz + tmp.z * (BALL_R + 0.1); bounce(b, tmp, 0.5, 0.9); }
  // floor
  if (b.pos.y < BALL_R) {
    b.pos.y = BALL_R;
    const hit = bounce(b, n.set(0, 1, 0), 0.62, 0.92);
    if (hit > 1) { tone(110, 0, 0.08, 'sine', Math.min(0.25, hit * 0.04)); noise(0, 0.05, Math.min(0.12, hit * 0.02), 300); b.sqV -= Math.min(9, hit * 2.2); }
  }
  // side walls
  if (Math.abs(b.pos.x) > 4.8) { b.pos.x = Math.sign(b.pos.x) * 4.8; b.vel.x *= -0.6; }
  if (b.pos.z < -8.8) { b.pos.z = -8.8; b.vel.z *= -0.6; }
  // basket: the centre drops through the rim plane inside the ring
  if (!b.scored && b.prevY >= hoopCenter.y && b.pos.y < hoopCenter.y && b.vel.y < 0) {
    const r = Math.hypot(b.pos.x - hoopCenter.x, b.pos.z - hoopCenter.z);
    if (r < RIM_R - 0.03) scoreBasket(b);
  }
  b.prevY = b.pos.y;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .hs-board { position:absolute; left:50%; top:calc(max(10px, env(safe-area-inset-top)) + 64px); transform:translateX(-50%); display:flex; gap:10px; pointer-events:none !important; }
  .hs-chip { background:rgba(10,14,40,.72); color:#fff; border-radius:16px; padding:6px 14px; font:900 22px var(--font); text-align:center; min-width:74px;
    box-shadow: inset 0 0 0 2px rgba(255,255,255,.14); }
  .hs-chip small { display:block; font:800 11px var(--font); opacity:.7; letter-spacing:.08em; }
  .hs-chip.low b { color:#ff6b6b; }
  .hs-chip.fire { box-shadow: inset 0 0 0 2px #ff9f1c, 0 0 18px rgba(255,140,0,.7); }
  .hs-chip b.bump { display:inline-block; animation: fs-bump .25s ease-out; }
  @media (min-aspect-ratio: 1/1) { .hs-board { left:max(14px, env(safe-area-inset-left)); top:50%; transform:translateY(-50%); flex-direction:column; } }
`;
document.head.appendChild(css);
let boardEl = null, timeEl = null, scoreEl = null, scoreChip = null, timeChip = null;
function ensureHud() {
  if (hud) return;
  hud = UI.hud({ coins: save.coins, level: 'Level 1', right: [UI.iconButton('❚❚', 'Pause', openPause)] });
  boardEl = document.createElement('div');
  boardEl.className = 'hs-board';
  boardEl.innerHTML = '<div class="hs-chip t"><small>TIME</small><b>40</b></div><div class="hs-chip s"><small>SCORE</small><b>0</b></div><div class="hs-chip g"><small>TARGET</small><b>10</b></div>';
  document.getElementById('ui').appendChild(boardEl);
  timeChip = boardEl.querySelector('.t');
  timeEl = timeChip.querySelector('b');
  scoreChip = boardEl.querySelector('.s');
  scoreEl = scoreChip.querySelector('b');
}
function updateScore(bump) {
  scoreEl.textContent = String(score);
  if (jumboFlash <= 0) drawJumbo();
  boardEl.querySelector('.g b').textContent = String(target);
  scoreChip.classList.toggle('fire', onFire);
  if (bump) { scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump'); }
}
let lastSec = -1;
function updateClock() {
  const sec = Math.ceil(clock);
  if (sec === lastSec) return;
  lastSec = sec;
  timeEl.textContent = String(Math.max(0, sec));
  timeChip.classList.toggle('low', sec <= 5);
  drawShotClock();
  if (jumboFlash <= 0) drawJumbo();
  if (sec <= 5 && sec > 0 && state === 'play') tone(880, 0, 0.06, 'square', 0.05);
}

function showTitle() {
  state = 'title';
  if (hud) { hud.show(false); boardEl.style.display = 'none'; }
  clearBalls();
  levelSetup(save.level);
  spawnReady();
  clock = ROUND_TIME; score = 0; onFire = false;
  drawJumbo(); drawShotClock();
  UI.titleScreen({
    line1: 'HOOP', line2: 'SHOT 3D',
    tagline: 'Swipe up to shoot. Swish it, catch fire, beat the clock.',
    best: 'Level ' + save.level + (save.best ? ' · Best ' + save.best : ''),
    onPlay: startLevel,
    extra: [
      UI.button('🏀 Balls', openShop, { style: 'blue', small: true }),
      UI.button(save.sound ? '🔊' : '🔇', (b) => { save.sound = !save.sound; b.textContent = save.sound ? '🔊' : '🔇'; persist(); }, { style: 'ghost', small: true }),
    ],
  });
}

function clearBalls() {
  balls.forEach(removeBall);
  balls.length = 0;
  if (ready) { removeBall(ready); ready = null; }
}

function startLevel() {
  initAudio(() => save.sound);
  ensureHud();
  hud.show(true);
  boardEl.style.display = '';
  clearBalls();
  levelSetup(save.level);
  hud.setLevel('Level ' + save.level);
  hud.setCoins(save.coins);
  hud.setProgress(0);
  score = 0; streak = 0; onFire = false; shots = 0; makes = 0; swishes = 0; extended = false;
  clock = ROUND_TIME; lastSec = -1;
  shooterX = 0;
  updateScore(false);
  updateClock();
  spawnReady();
  state = 'play';
  if (save.level >= 3 && save.level === 3) UI.praise('MOVING HOOP!', '#7dd3fc');
  if (!save.tutorial) {
    stopHand = UI.tutorialHand(() => {
      const bs = ready ? toScreen(ready.pos) : { x: window.innerWidth / 2, y: window.innerHeight * 0.8 };
      return [[bs.x, bs.y], [bs.x, bs.y - window.innerHeight * 0.32]];
    }, 'Swipe up to shoot');
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

function openShop() {
  let p = null;
  const apply = () => { if (ready) ready.m.material = ballMaterial(save.skin); };
  const render = () => {
    if (p) p.close();
    p = UI.shopPanel({
      title: 'Balls', items: SKINS, owned: save.owned, current: save.skin, coins: save.coins,
      onSelect: (it) => { save.skin = it.id; persist(); apply(); render(); },
      onBuy: (it) => { if (save.coins < it.price) return; save.coins -= it.price; save.owned[it.id] = true; save.skin = it.id; persist(true); apply(); sfx.good(); render(); },
      onAdUnlock: async (it) => { if (await YT.rewarded('ball_' + it.id)) { save.owned[it.id] = true; save.skin = it.id; persist(true); apply(); sfx.fanfare(); } render(); },
      onClose: () => p.close(),
    });
  };
  render();
}

function endRound() {
  if (state !== 'play') return;
  state = 'settling';
  if (stopHand) { stopHand(); stopHand = null; }
  if (ready) { removeBall(ready); ready = null; }
  tone(523, 0, 0.5, 'square', 0.06);
  tone(392, 0.15, 0.6, 'square', 0.06);
  UI.praise("TIME'S UP!", '#ffffff');
  // let balls in the air finish
  const wait = () => {
    if (balls.some((b) => b.flying && b.t < 2.2 && !b.scored)) { setTimeout(wait, 150); return; }
    if (score >= target) win(); else lose();
  };
  setTimeout(wait, 700);
}

function lose() {
  state = 'lost';
  sfx.lose();
  UI.buzz([40, 60, 40]);
  const body = document.createElement('div');
  body.innerHTML = '<div class="big">' + score + ' / ' + target + '</div><div class="sub">' + makes + ' of ' + shots + ' shots · ' + swishes + ' swishes</div>';
  const btns = [];
  if (!extended) {
    btns.push(UI.button('+15 seconds', async () => {
      if (!(await YT.rewarded('extra_time'))) return;
      p.close();
      extended = true;
      clock = 15; lastSec = -1;
      state = 'play';
      spawnReady();
      UI.praise('+15 SECONDS!', '#7dffb2');
      sfx.win();
    }, { style: 'gold', ad: true }));
  }
  btns.push(UI.button('Try again', () => { p.close(); startLevel(); }, { style: extended ? 'green' : '' }));
  btns.push(UI.button('Home', () => { p.close(); showTitle(); }, { style: 'ghost', small: true }));
  const p = UI.panel({ title: 'So close!', sub: 'Score ' + target + ' points to clear the level.', body, buttons: btns });
}

function win() {
  state = 'won';
  sfx.fanfare();
  UI.buzz([20, 40, 20, 40, 60]);
  const ratio = score / target;
  const stars = ratio >= 1.6 ? 3 : ratio >= 1.25 ? 2 : 1;
  const reward = 20 + save.level * 4 + stars * 10 + swishes * 2;
  persist(true);
  YT.sendScore(save.best);
  const body = document.createElement('div');
  body.innerHTML = UI.starsHtml(stars) + '<div class="sub">' + score + ' points · ' + makes + '/' + shots + ' shots · ' + swishes + ' swishes</div><div class="reward"><span class="fs-coin" style="position:static;margin:0"></span><b>0</b></div>';
  UI.countUp(body.querySelector('.reward b'), 0, reward, 700);
  const collect = (mult) => {
    p.close();
    const gained = reward * mult;
    UI.coinBurst(window.innerWidth / 2, window.innerHeight / 2, 10, hud.coinEl, (i) => { sfx.coin(i); hud.setCoins(Math.round(save.coins - gained + (gained * (i + 1)) / 10), true); });
    save.coins += gained;
    save.level += 1;
    persist(true);
    setTimeout(() => {
      hud.setCoins(save.coins);
      const next = () => startLevel();
      if (save.level % 3 === 0) YT.interstitial().then(next); else next();
    }, 1000);
  };
  const p = UI.panel({
    title: 'Level ' + save.level + ' clear!', gold: true, body,
    buttons: [
      UI.button('Claim ×3', async () => { if (await YT.rewarded('triple_coins')) collect(3); }, { style: 'gold', ad: true }),
      UI.button('Next level', () => collect(1), { style: 'green' }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Input: swipe up
// ---------------------------------------------------------------------------
let swipe = null;
canvas.addEventListener('pointerdown', (e) => {
  initAudio(() => save.sound);
  if (paused || menuOpen || state !== 'play') return;
  swipe = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  e.preventDefault();
});
window.addEventListener('pointerup', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = swipe.y - e.clientY;
  swipe = null;
  if (paused || menuOpen || state !== 'play') return;
  if (dy < 30) return;
  shoot(dx, dy);
});
window.addEventListener('pointercancel', () => { swipe = null; });

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
let rimFlex = 0, rimFlexV = 0, boardWob = 0;
function update(dt) {
  time += dt;
  placeHoop();
  if (state === 'play') {
    clock -= dt;
    updateClock();
    if (clock <= 0) endRound();
  }
  // ready ball rolls in and bobs
  if (ready) {
    readyT += dt;
    const k = Math.min(1, readyT * 4);
    ready.pos.set(shooterX, START.y + Math.abs(Math.sin(time * 3)) * 0.02, START.z + 0.6 * (1 - k));
    ready.g.position.copy(ready.pos);
    ready.m.rotation.x -= dt * 2 * (1 - k);
    ready.shadow.position.set(ready.pos.x, 0.005, ready.pos.z);
    ready.shadow.material.opacity = 0.3;
  }
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.t += dt;
    const sub = 6;
    for (let s = 0; s < sub; s++) stepBall(b, dt / sub);
    // squash and stretch: a spring kicked by floor bounces
    b.sqV += (-260 * b.sq - 16 * b.sqV) * dt;
    b.sq += b.sqV * dt;
    const sq = THREE.MathUtils.clamp(b.sq, -0.3, 0.3);
    b.g.scale.set(1 - sq * 0.8, 1 + sq, 1 - sq * 0.8);
    b.g.position.copy(b.pos);
    b.g.position.y += sq * BALL_R;
    b.m.rotation.x += b.spin.x * dt;
    b.m.rotation.z += b.spin.z * dt;
    b.spin.multiplyScalar(1 - dt * 0.4);
    b.shadow.position.set(b.pos.x, 0.005, b.pos.z);
    b.shadow.material.opacity = Math.max(0.05, 0.5 - b.pos.y * 0.1);
    b.shadow.scale.setScalar(BALL_R * 3.2 * (1 + b.pos.y * 0.25));
    if (b.fire && b.t < 2) for (let k = 0; k < 3; k++) emitSpark(b.pos, k === 0 ? '#ffd60a' : k === 1 ? '#ff9f1c' : '#ff4d00');
    // a shot is over once it has had time to drop or it's rolling on the floor
    if (!b.done && (b.t > 2.4 || (b.t > 0.8 && b.pos.y < 0.3 && !b.scored))) {
      b.done = true;
      if (!b.scored && state === 'play') missed();
    }
    if (b.t > 4) { removeBall(b); balls.splice(i, 1); }
  }
  stepParticles(dt);
  stepConfetti(dt);
  // swish ring
  if (ringT < 1) {
    ringT = Math.min(1, ringT + dt * 2.2);
    const e = 1 - Math.pow(1 - ringT, 3);
    ring.scale.setScalar(RIM_R * (1 + e * 2.4));
    ring.material.opacity = (1 - ringT) * 0.9;
  }
  // rim flex and backboard shiver
  rimFlexV += (-220 * rimFlex - 9 * rimFlexV) * dt;
  rimFlex += rimFlexV * dt;
  rimPivot.rotation.x = THREE.MathUtils.clamp(rimFlex, -0.25, 0.25) * 0.4;
  boardWob = Math.max(0, boardWob - dt * 2.5);
  glass.rotation.z = marks.rotation.z = Math.sin(time * 60) * boardWob * 0.01;
  rim.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 10));
  rimMat.emissive.setHex(onFire ? 0xff4000 : 0x401000);
  rimMat.emissiveIntensity = onFire ? 0.6 + Math.sin(time * 10) * 0.3 : 1;
  rimLight.intensity = onFire ? 14 : 8;
  spot.position.x = shooterX;
  spot.material.opacity = ready ? 0.6 + Math.sin(time * 5) * 0.25 : 0.2;
  spot.scale.setScalar(ready ? 1 + Math.sin(time * 5) * 0.05 : 0.9);
  rimLight.position.set(hoopCenter.x, 4.6, hoopZ + 0.6);
  updateNet(dt);
  // arena: crowd, cheerleaders, boards, lights
  hype = Math.max(0, hype - dt * 0.45);
  crowdU.uTime.value = time;
  crowdU.uHype.value = Math.max(hype, onFire ? 0.35 : 0);
  cheer.forEach((h, i) => {
    animateHuman(h, dt, 0);
    const hk = Math.min(1, hype * 1.4);
    const wave = Math.sin(time * 9 + i * 1.7);
    h.arms[0].rotation.z = 0.12 + hk * (2.5 + wave * 0.35);
    h.arms[1].rotation.z = -0.12 - hk * (2.5 - wave * 0.35);
    h.arms[0].rotation.x = h.arms[1].rotation.x = -hk * 0.3;
    h.root.position.y = Math.abs(Math.sin(time * 7 + i)) * 0.22 * hk;
  });
  ledTex.offset.x = (time * 0.04) % 1;
  ribbonTex.offset.x = (-time * 0.025) % 1;
  if (jumboFlash > 0) { jumboFlash -= dt; if (jumboFlash <= 0) drawJumbo(); }
  updateBeams(dt);
  // camera shake and zoom punch ease out
  shake = Math.max(0, shake - dt * 3);
  punch = Math.max(0, punch - dt * 2.2);
  placeCamera();
}

let last = performance.now(), first = true;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused && !menuOpen) update(dt);
  renderer.shadowMap.needsUpdate = true;
  mirror.render();
  renderer.render(scene, camera);
  if (first) { first = false; YT.firstFrameReady(); }
  requestAnimationFrame(frame);
}

YT.onPause(() => { paused = true; suspendAudio(); });
YT.onResume(() => { paused = false; last = performance.now(); resumeAudio(); });

// read-only hook for automated play-tests
window.__hoop = {
  info: () => ({
    state, level: save.level, score, target, clock, streak, onFire, shots, makes, swishes,
    ready: !!ready, ball: ready ? toScreen(ready.pos) : null, hoop: toScreen(hoopCenter), hoopX: hoopCenter.x,
    hoopV: hoopAmp * hoopSpeed * Math.cos(time * hoopSpeed), pxm: toScreen(hoopCenter.clone().add(new THREE.Vector3(1, 0, 0))).x - toScreen(hoopCenter).x, flying: balls.filter((b) => !b.done).length,
  }),
};

(async function boot() {
  YT.init('hoop-shot');
  const data = await YT.load();
  save = Object.assign(save, data || {});
  if (!save.owned) save.owned = { classic: true };
  resize();
  placeHoop();
  showTitle();
  requestAnimationFrame(frame);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  YT.gameReady();
})();
