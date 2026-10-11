/*
 * Shared rendering polish for the 3D games: image-based lighting, glossy
 * toy-plastic materials, soft contact shadows and canvas textures.
 *
 *   import { studio, glossy, blob } from 'look';
 *   studio(renderer, scene);            // reflections + soft ambient on every MeshStandard/Physical material
 *   const m = glossy('#ff5a5f');        // clearcoated plastic
 *   obj.add(blob(0.6));                 // soft shadow disc on the floor under obj
 */
import * as THREE from 'three';

let envTex = null;
/**
 * Lights the scene with a blurred studio room (PMREM) so standard materials
 * pick up soft reflections and highlights instead of looking flat. Lower the
 * game's hemisphere / ambient lights a little after calling this.
 */
export function studio(renderer, scene, { intensity = 0.6, exposure } = {}) {
  if (!envTex) {
    const pm = new THREE.PMREMGenerator(renderer);
    const room = new THREE.RoomEnvironment();
    envTex = pm.fromScene(room, 0.04).texture;
    room.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    pm.dispose();
  }
  scene.environment = envTex;
  scene.environmentIntensity = intensity;
  if (exposure != null) renderer.toneMappingExposure = exposure;
  return envTex;
}

const cache = new Map();
/** Clearcoated plastic, like a toy or a candy shell. Cached by its options. */
export function glossy(color, o = {}) {
  const key = 'g|' + color + '|' + JSON.stringify(o);
  if (!cache.has(key)) cache.set(key, new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.38, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.22 }, o)));
  return cache.get(key);
}
/** Brushed or polished metal. */
export function metal(color, o = {}) {
  const key = 'm|' + color + '|' + JSON.stringify(o);
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.28, metalness: 0.9 }, o)));
  return cache.get(key);
}
/** Matte painted surface. */
export function matte(color, o = {}) {
  const key = 's|' + color + '|' + JSON.stringify(o);
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, o)));
  return cache.get(key);
}

/** Draws on a canvas and returns it as an sRGB texture. */
export function canvasTexture(w, h, draw, { repeat, srgb = true, aniso = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** Vertical gradient for scene.background: stops = [[0, '#top'], [1, '#bottom']]. */
export function skyGradient(stops) {
  return canvasTexture(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    for (const [p, c] of stops) gr.addColorStop(p, c);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

let blobTex = null;
const blobGeo = new THREE.PlaneGeometry(1, 1);
blobGeo.rotateX(-Math.PI / 2);
/**
 * A soft dark disc lying on y = 0 of its parent: a cheap contact shadow that
 * grounds objects even where the shadow map is blurry or off.
 */
export function blob(radius = 0.5, opacity = 0.35) {
  if (!blobTex) blobTex = canvasTexture(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, { srgb: false });
  const m = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.scale.set(radius * 2, 1, radius * 2);
  m.position.y = 0.005;
  m.renderOrder = -1;
  return m;
}

/** Tightens a directional light's shadow camera around a square of half-size `half`. */
export function fitShadow(light, half, size = 2048) {
  light.castShadow = true;
  const c = light.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half;
  c.updateProjectionMatrix();
  light.shadow.mapSize.set(size, size);
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.02;
  light.shadow.radius = 4;
}
