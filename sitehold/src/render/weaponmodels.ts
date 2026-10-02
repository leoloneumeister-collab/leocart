import * as THREE from 'three';
import type { GrenadeKind, WeaponDef } from '../sim/weapons.ts';

/** Procedural weapon models. They point down -Z with the pistol grip near the origin, so a hand can sit at (0, -0.05, 0.02). */

export interface GunModel {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  /** the magazine, animated during reloads */
  mag: THREE.Object3D | null;
  /** where the off hand goes, relative to the group */
  foregrip: THREE.Vector3;
  /** where the trigger hand goes */
  grip: THREE.Vector3;
  length: number;
  scopeLens?: THREE.Object3D;
}

const matCache = new Map<number, THREE.MeshStandardMaterial>();
function m(color: number, rough = 0.5, metal = 0.2) {
  const key = color * 1000 + Math.round(rough * 10) * 10 + Math.round(metal * 10);
  let mat = matCache.get(key);
  if (!mat) { mat = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); matCache.set(key, mat); }
  return mat;
}

const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z); mesh.rotation.x = rx;
  mesh.castShadow = true;
  return mesh;
};
const cyl = (r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
};

const STEEL = () => m(0x59616b, 0.45, 0.12);
const DARK = () => m(0x2b2f35, 0.6, 0.08);
const WOOD = () => m(0x7a4a26, 0.7, 0);
const POLY = () => m(0x363a41, 0.7, 0.05);
const TAN = () => m(0x8a7a58, 0.7, 0.05);

interface Palette { body: THREE.Material; furniture: THREE.Material; accent: THREE.Material }

function palette(id: string): Palette {
  switch (id) {
    case 'vk47': return { body: STEEL(), furniture: WOOD(), accent: DARK() };
    case 'reaper': return { body: DARK(), furniture: m(0x5a4630, 0.7, 0), accent: STEEL() };
    case 'carbine': return { body: DARK(), furniture: POLY(), accent: STEEL() };
    case 'ranger': return { body: STEEL(), furniture: m(0x384250, 0.7, 0.05), accent: DARK() };
    case 'hornet': return { body: DARK(), furniture: m(0x2f5a80, 0.7, 0), accent: STEEL() };
    case 'wasp': return { body: DARK(), furniture: m(0xa04a22, 0.7, 0), accent: STEEL() };
    case 'mantis': return { body: DARK(), furniture: TAN(), accent: STEEL() };
    case 'scout': return { body: DARK(), furniture: m(0x6a7c52, 0.7, 0), accent: STEEL() };
    case 'bolt50': return { body: m(0x4a6048, 0.6, 0.1), furniture: m(0x4a6048, 0.7, 0), accent: STEEL() };
    case 'pump12': return { body: STEEL(), furniture: WOOD(), accent: DARK() };
    case 'cobra': return { body: m(0xc4c9ce, 0.35, 0.2), furniture: DARK(), accent: STEEL() };
    case 'marshal': return { body: m(0x555b63, 0.4, 0.15), furniture: m(0x7a5632, 0.7, 0), accent: STEEL() };
    case 'viper': return { body: m(0x3a3f46, 0.5, 0.12), furniture: DARK(), accent: STEEL() };
    default: return { body: STEEL(), furniture: DARK(), accent: DARK() };
  }
}

export function buildGun(def: WeaponDef): GunModel {
  const g = new THREE.Group();
  const p = palette(def.id);
  let mag: THREE.Object3D | null = null;
  const muzzle = new THREE.Object3D();
  let length = 0.5;
  let foregrip = new THREE.Vector3(0, -0.05, -0.34);
  const grip = new THREE.Vector3(0, -0.06, 0.02);
  let scopeLens: THREE.Object3D | undefined;

  switch (def.cls) {
    case 'pistol': {
      g.add(box(0.032, 0.045, 0.2, p.body, 0, 0.02, -0.08));       // slide
      g.add(box(0.03, 0.03, 0.15, p.accent, 0, -0.012, -0.06));    // frame
      g.add(box(0.032, 0.1, 0.04, p.furniture, 0, -0.07, 0.03, 0.18)); // grip
      g.add(box(0.008, 0.012, 0.01, DARK(), 0, 0.048, -0.17));
      mag = box(0.026, 0.02, 0.035, DARK(), 0, -0.125, 0.04);
      g.add(mag);
      muzzle.position.set(0, 0.02, -0.19);
      length = 0.2;
      foregrip = new THREE.Vector3(0.02, -0.08, 0.02);
      break;
    }
    case 'smg': {
      g.add(box(0.045, 0.075, 0.26, p.body, 0, 0, -0.09));
      g.add(cyl(0.011, 0.16, p.accent, 0, 0.008, -0.3));
      g.add(box(0.05, 0.05, 0.12, p.furniture, 0, -0.006, -0.22));
      g.add(box(0.035, 0.1, 0.045, p.furniture, 0, -0.085, 0.03, 0.2));
      g.add(box(0.04, 0.07, 0.15, p.furniture, 0, -0.005, 0.2));
      mag = box(0.03, 0.17, 0.05, DARK(), 0, -0.13, -0.07);
      g.add(mag);
      g.add(box(0.012, 0.02, 0.01, DARK(), 0, 0.05, -0.2));
      muzzle.position.set(0, 0.008, -0.38);
      length = 0.4;
      foregrip = new THREE.Vector3(0, -0.06, -0.24);
      break;
    }
    case 'rifle': {
      g.add(box(0.05, 0.09, 0.32, p.body, 0, 0, -0.1));
      g.add(box(0.056, 0.062, 0.3, p.furniture, 0, -0.008, -0.38));  // handguard
      g.add(cyl(0.011, 0.5, STEEL(), 0, 0.012, -0.55));
      g.add(cyl(0.02, 0.07, DARK(), 0, 0.012, -0.8));                 // muzzle brake
      g.add(box(0.045, 0.085, 0.24, p.furniture, 0, -0.01, 0.2));    // stock
      g.add(box(0.035, 0.11, 0.05, p.furniture, 0, -0.095, 0.03, 0.25));
      mag = box(0.04, 0.18, 0.07, DARK(), 0, -0.13, -0.14, -0.15);
      g.add(mag);
      g.add(box(0.012, 0.03, 0.012, DARK(), 0, 0.065, -0.7));        // front sight
      g.add(box(0.03, 0.025, 0.04, DARK(), 0, 0.058, -0.02));        // rear sight
      if (def.id === 'carbine' || def.id === 'ranger') {
        g.add(box(0.04, 0.04, 0.13, DARK(), 0, 0.075, -0.2));          // optic
        const lens = box(0.034, 0.034, 0.004, m(0x7ab4ff, 0.1, 0.9), 0, 0.075, -0.267);
        g.add(lens);
      }
      muzzle.position.set(0, 0.012, -0.85);
      length = 0.85;
      foregrip = new THREE.Vector3(0, -0.06, -0.4);
      break;
    }
    case 'sniper': {
      const long = def.id === 'bolt50';
      g.add(box(0.05, 0.085, 0.36, p.body, 0, 0, -0.12));
      g.add(cyl(0.013, long ? 0.62 : 0.52, STEEL(), 0, 0.01, long ? -0.62 : -0.56));
      if (long) g.add(cyl(0.022, 0.1, DARK(), 0, 0.01, -0.95));
      g.add(box(0.05, 0.1, 0.28, p.furniture, 0, -0.01, 0.2));
      g.add(box(0.034, 0.1, 0.05, p.furniture, 0, -0.09, 0.03, 0.2));
      g.add(box(0.035, 0.03, 0.03, STEEL(), 0.045, 0.02, -0.02));       // bolt knob
      const scope = cyl(0.03, 0.26, DARK(), 0, 0.085, -0.14);
      g.add(scope);
      g.add(cyl(0.036, 0.04, DARK(), 0, 0.085, -0.28));
      scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 12), m(0x6aa8ff, 0.1, 0.9));
      scopeLens.position.set(0, 0.085, 0.0);
      scopeLens.rotation.y = Math.PI;
      g.add(scopeLens);
      mag = box(0.032, 0.07, 0.06, DARK(), 0, -0.08, -0.1);
      g.add(mag);
      muzzle.position.set(0, 0.01, long ? -1.0 : -0.85);
      length = long ? 1.0 : 0.86;
      foregrip = new THREE.Vector3(0, -0.055, -0.4);
      break;
    }
    case 'shotgun': {
      g.add(box(0.05, 0.08, 0.28, p.body, 0, 0, -0.08));
      g.add(cyl(0.015, 0.62, STEEL(), 0, 0.012, -0.5));
      g.add(cyl(0.013, 0.5, DARK(), 0, -0.022, -0.45));
      const pump = box(0.06, 0.05, 0.16, p.furniture, 0, -0.025, -0.42);
      g.add(pump);
      g.add(box(0.045, 0.085, 0.26, p.furniture, 0, -0.01, 0.2));
      g.add(box(0.035, 0.1, 0.05, p.furniture, 0, -0.09, 0.03, 0.25));
      mag = pump;
      muzzle.position.set(0, 0.012, -0.82);
      length = 0.85;
      foregrip = new THREE.Vector3(0, -0.04, -0.42);
      break;
    }
    case 'knife': {
      g.add(box(0.012, 0.045, 0.2, m(0xd6dde3, 0.3, 0.25), 0, 0, -0.14));
      g.add(box(0.008, 0.025, 0.06, m(0xd6dde3, 0.3, 0.25), 0, 0.01, -0.26));
      g.add(box(0.03, 0.03, 0.12, m(0x30261c, 0.8, 0), 0, 0, 0.0));
      g.add(box(0.05, 0.02, 0.012, STEEL(), 0, 0, -0.045));
      muzzle.position.set(0, 0, -0.3);
      length = 0.3;
      foregrip = new THREE.Vector3(0, 0, 0.2);
      break;
    }
  }
  g.add(muzzle);
  return { group: g, muzzle, mag, foregrip, grip, length, scopeLens };
}

export function buildGrenade(kind: GrenadeKind, small = false): THREE.Group {
  const g = new THREE.Group();
  const s = small ? 1 : 1;
  let body: THREE.Mesh;
  switch (kind) {
    case 'flash': {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.026 * s, 0.026 * s, 0.1 * s, 12), m(0x8e969e, 0.4, 0.6));
      g.add(body);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0275 * s, 0.0275 * s, 0.02 * s, 12), m(0xf4f4f4, 0.5, 0.1));
      band.position.y = 0.02;
      g.add(band);
      break;
    }
    case 'smoke': {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.13 * s, 12), m(0x4a6a52, 0.5, 0.3));
      g.add(body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.031 * s, 0.031 * s, 0.02 * s, 12), m(0xd6d6d0, 0.5, 0.2));
      cap.position.y = 0.06;
      g.add(cap);
      break;
    }
    case 'he': {
      body = new THREE.Mesh(new THREE.SphereGeometry(0.04 * s, 12, 10), m(0x4c5a38, 0.6, 0.2));
      body.scale.y = 1.15;
      g.add(body);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.015 * s, 0.025 * s, 8), STEEL());
      top.position.y = 0.05;
      g.add(top);
      break;
    }
    case 'fire': {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.032 * s, 0.12 * s, 12), m(0x9ad0e0, 0.15, 0.1));
      g.add(body);
      const rag = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.01 * s, 0.05 * s, 8), m(0xc03a1a, 0.9, 0));
      rag.position.y = 0.085;
      g.add(rag);
      break;
    }
  }
  g.children.forEach((c) => { c.castShadow = true; });
  return g;
}

export function buildBomb(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.26, 0.09, 0.16, m(0x2c3036, 0.5, 0.4), 0, 0, 0));
  g.add(box(0.2, 0.012, 0.1, m(0x151719, 0.3, 0.5), 0, 0.05, 0));
  const lcd = box(0.07, 0.006, 0.03, new THREE.MeshBasicMaterial({ color: 0xff2a1a }), -0.05, 0.058, 0);
  lcd.name = 'lcd';
  g.add(lcd);
  g.add(box(0.03, 0.03, 0.03, m(0xd8b020, 0.5, 0.2), 0.07, 0.06, 0.03));
  g.add(cyl(0.01, 0.12, m(0xb03020, 0.6, 0), 0.0, 0.05, -0.06));
  g.children.forEach((c) => { c.castShadow = true; });
  return g;
}
