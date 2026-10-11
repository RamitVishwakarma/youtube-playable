/*
 * Shared character for the 3D games: rounded torso with a belt, separate
 * legs with shoes, sleeves and bare forearms, a face (blinking eyes with
 * pupils and highlights, brows, nose, ears, cheeks, smile) and a choice of
 * hair styles. Faces +z, feet on y = 0, about 1.25 m tall
 * at scale 1. Geometry is shared between characters; materials are cached
 * by colour so crowds stay cheap.
 *
 *   const h = makeHuman({ shirt: '#ff5a5f', hair: 'bun' });
 *   scene.add(h.root);
 *   animateHuman(h, dt, speed);   // speed in m/s, 0 = idle
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three';

const headGeo = (() => {
  // head with nose and ears merged in, so the extra detail costs no draw calls
  const head = new THREE.SphereGeometry(0.21, 24, 18);
  const nose = new THREE.SphereGeometry(0.03, 10, 8);
  nose.scale(1, 0.85, 0.9); nose.translate(0, -0.02, 0.205);
  const ears = [-1, 1].map((sd) => { const e = new THREE.SphereGeometry(0.05, 10, 8); e.scale(0.45, 1, 0.75); e.translate(sd * 0.205, -0.005, -0.01); return e; });
  return mergeGeometries([head, nose, ...ears]);
})();
const browGeo = (() => {
  const b = [-1, 1].map((sd) => { const g = new THREE.CapsuleGeometry(0.012, 0.042, 3, 6); g.rotateZ(Math.PI / 2 - sd * 0.16); g.translate(sd * 0.075, 0.085, 0.188); return g; });
  return mergeGeometries(b);
})();
const forearmGeo = (() => {
  const a = new THREE.CapsuleGeometry(0.056, 0.17, 4, 10); a.translate(0, -0.19, 0);
  const h = new THREE.SphereGeometry(0.066, 12, 10); h.scale(0.9, 1.05, 0.8); h.translate(0, -0.33, 0.005);
  return mergeGeometries([a, h]);
})();
const G = {
  torso: new THREE.CapsuleGeometry(0.2, 0.22, 6, 16),
  hip: new THREE.SphereGeometry(0.2, 16, 10),
  belt: new THREE.CylinderGeometry(0.203, 0.203, 0.045, 20, 1, true),
  leg: new THREE.CapsuleGeometry(0.085, 0.24, 4, 10),
  shoe: new THREE.SphereGeometry(0.1, 14, 10),
  sleeve: new THREE.CapsuleGeometry(0.074, 0.08, 4, 10),
  forearm: forearmGeo,
  head: headGeo,
  sclera: new THREE.SphereGeometry(0.042, 14, 10),
  pupil: new THREE.SphereGeometry(0.026, 10, 8),
  glint: new THREE.SphereGeometry(0.01, 6, 4),
  brow: browGeo,
  cheek: new THREE.CircleGeometry(0.035, 12),
  smile: new THREE.TorusGeometry(0.055, 0.014, 6, 14, Math.PI),
  hairCap: new THREE.SphereGeometry(0.225, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hairBack: new THREE.SphereGeometry(0.22, 18, 12, Math.PI * 0.75, Math.PI * 1.5, Math.PI * 0.3, Math.PI * 0.5),
  bun: new THREE.SphereGeometry(0.1, 12, 10),
  spike: new THREE.ConeGeometry(0.07, 0.18, 6),
  capTop: new THREE.SphereGeometry(0.228, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45),
  brim: new THREE.CylinderGeometry(0.16, 0.16, 0.025, 18, 1, false, -Math.PI / 2, Math.PI),
  apron: new THREE.BoxGeometry(0.3, 0.34, 0.03),
};
/** Geometry shared by every character: never dispose these. */
export const SHARED_GEOMETRIES = new Set(Object.values(G));
const mats = new Map();
function mat(color, rough = 0.6) {
  const key = color + '|' + rough;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough }));
  return mats.get(key);
}
const BLACK = new THREE.MeshStandardMaterial({ color: '#15151c', roughness: 0.15 });
const WHITE = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const SCLERA = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
const BELT = new THREE.MeshStandardMaterial({ color: '#2a2320', roughness: 0.5, side: THREE.DoubleSide });
const CHEEK = new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0.55 });
const MOUTH = new THREE.MeshBasicMaterial({ color: '#7a1f2b' });

export const SKINS = ['#ffd6b0', '#f1c27d', '#e0a878', '#c68642', '#8d5524', '#ffdbac'];
export const HAIRS = ['#2b2118', '#6b3e1f', '#e9c46a', '#1b1b22', '#a0522d', '#d62828'];
export const SHIRTS = ['#ff9f1c', '#2ec4b6', '#e71d36', '#7209b7', '#3a86ff', '#ffbe0b', '#8338ec', '#06d6a0', '#ef476f', '#ff6f61'];
export const PANTS = ['#22223b', '#3d5a80', '#6c584c', '#495057', '#2b2d42', '#1d3557'];
const STYLES = ['short', 'bob', 'bun', 'spiky', 'long', 'bald'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/**
 * opts: shirt, pants, skin, hair (colour), style (short|bob|bun|spiky|long|bald),
 * shoe, cap (colour), apron (colour), scale.
 */
export function makeHuman(opts = {}) {
  const shirt = mat(opts.shirt || pick(SHIRTS));
  const pants = mat(opts.pants || pick(PANTS), 0.7);
  const skin = mat(opts.skin || pick(SKINS), 0.55);
  const hairM = mat(opts.hair || pick(HAIRS), 0.75);
  const shoeM = mat(opts.shoe || '#f1f3f5', 0.5);
  const style = opts.style || pick(STYLES);
  const root = new THREE.Group();
  const body = new THREE.Group(); // bobs while walking
  root.add(body);
  const mesh = (geo, m, parent, x = 0, y = 0, z = 0, shadow = true) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = shadow;
    parent.add(o);
    return o;
  };
  // legs pivot at the hip so they swing
  const legs = [-0.095, 0.095].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.46, 0);
    body.add(pivot);
    mesh(G.leg, pants, pivot, 0, -0.2, 0);
    const shoe = mesh(G.shoe, shoeM, pivot, 0, -0.4, 0.035);
    shoe.scale.set(0.95, 0.6, 1.35);
    return pivot;
  });
  const hip = mesh(G.hip, pants, body, 0, 0.5, 0);
  hip.scale.set(1.02, 0.55, 0.85);
  const belt = mesh(G.belt, BELT, body, 0, 0.555, 0, false);
  belt.scale.set(1, 1, 0.83);
  const torso = mesh(G.torso, shirt, body, 0, 0.73, 0);
  torso.scale.set(1, 1, 0.82);
  if (opts.apron) mesh(G.apron, mat(opts.apron), body, 0, 0.66, 0.17);
  const arms = [-0.25, 0.25].map((x, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.88, 0);
    pivot.rotation.z = i ? -0.12 : 0.12;
    body.add(pivot);
    mesh(G.sleeve, shirt, pivot, 0, -0.06, 0);
    mesh(G.forearm, skin, pivot);
    return pivot;
  });
  const head = new THREE.Group();
  head.position.set(0, 1.12, 0);
  body.add(head);
  mesh(G.head, skin, head);
  // face
  const eyes = [];
  for (const x of [-0.072, 0.072]) {
    // each eye is a group so it can blink (scale y) as one piece
    const eye = new THREE.Group();
    eye.position.set(x, 0.018, 0.178);
    head.add(eye);
    const sc = mesh(G.sclera, SCLERA, eye, 0, 0, 0, false);
    sc.scale.set(0.95, 1.15, 0.55);
    mesh(G.pupil, BLACK, eye, 0, -0.004, 0.017, false).scale.set(1, 1.15, 0.6);
    mesh(G.glint, WHITE, eye, 0.009, 0.012, 0.031, false);
    eyes.push(eye);
    const c = mesh(G.cheek, CHEEK, head, x * 1.55, -0.05, 0.176, false);
    c.rotation.y = x < 0 ? -0.5 : 0.5;
  }
  mesh(G.brow, mat(opts.brow || opts.hair || '#2b2118', 0.8), head, 0, 0, 0, false);
  const smile = mesh(G.smile, MOUTH, head, 0, -0.055, 0.19, false);
  smile.rotation.z = Math.PI;
  smile.scale.set(1, 0.8, 0.6);
  // hair
  if (opts.cap) {
    mesh(G.capTop, mat(opts.cap, 0.5), head, 0, 0.03, 0);
    const brim = mesh(G.brim, mat(opts.cap, 0.5), head, 0, 0.09, 0.1);
    brim.rotation.x = 0.15;
  } else if (style !== 'bald') {
    mesh(G.hairCap, hairM, head, 0, 0.025, -0.012);
    if (style === 'bob' || style === 'long') {
      const back = mesh(G.hairBack, hairM, head, 0, style === 'long' ? -0.1 : -0.03, -0.02);
      back.scale.set(1.08, style === 'long' ? 1.5 : 1.05, 1.05);
    }
    if (style === 'bun') mesh(G.bun, hairM, head, 0, 0.2, -0.1);
    if (style === 'spiky') for (let k = 0; k < 5; k++) { const sp = mesh(G.spike, hairM, head, (k - 2) * 0.07, 0.2, -0.02 - Math.abs(k - 2) * 0.02); sp.rotation.z = (k - 2) * -0.25; }
  }
  const h = { root, body, legs, arms, head, torso, smile, eyes, blink: 1 + Math.random() * 3, phase: Math.random() * 6, shirt, skin };
  if (opts.scale) root.scale.setScalar(opts.scale);
  return h;
}

/** Walk cycle when speed > 0, gentle idle breathing otherwise. */
export function animateHuman(h, dt, speed = 0) {
  const moving = speed > 0.05;
  h.phase += dt * (moving ? 4 + speed * 2.2 : 2);
  const s = Math.sin(h.phase);
  const swing = moving ? Math.min(0.9, 0.35 + speed * 0.15) : 0;
  h.legs[0].rotation.x = s * swing;
  h.legs[1].rotation.x = -s * swing;
  h.arms[0].rotation.x = -s * swing * 0.9;
  h.arms[1].rotation.x = s * swing * 0.9;
  h.body.position.y = moving ? Math.abs(Math.cos(h.phase)) * 0.045 : Math.sin(h.phase) * 0.006;
  h.head.rotation.z = moving ? s * 0.05 : Math.sin(h.phase * 0.5) * 0.03;
  // blink every few seconds
  if (h.eyes) {
    h.blink -= dt;
    if (h.blink < 0) h.blink = 2 + Math.random() * 3.5;
    const k = h.blink < 0.12 ? 0.12 : 1;
    for (const e of h.eyes) e.scale.y = k;
  }
}

/** Arms forward, e.g. carrying a stack of boxes. */
export function carryPose(h, on) {
  for (const a of h.arms) {
    a.rotation.x = on ? -1.25 : a.rotation.x;
  }
}
