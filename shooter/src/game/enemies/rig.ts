import * as THREE from 'three';

export type EnemyType = 'grunt' | 'rusher' | 'heavy' | 'boss';

export interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  gun: THREE.Group;
  muzzle: THREE.Object3D;
  meshes: THREE.Mesh[];
  visor: THREE.Mesh;
  scale: number;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, metal = 0.1, rough = 0.8, emissive = 0, ei = 0) {
  const key = `${color}-${metal}-${rough}-${emissive}-${ei}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, flatShading: true, emissive: emissive || color, emissiveIntensity: emissive ? ei : 0.16 });
    mats.set(key, m);
  }
  return m;
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, meshes: THREE.Mesh[]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  meshes.push(mesh);
  return mesh;
}

interface Look { uniform: number; vest: number; pants: number; helmet: number; skin: number; accent: number; visor: number; scale: number; wide: number }

const LOOKS: Record<EnemyType, Look> = {
  grunt:  { uniform: 0x6a7552, vest: 0x363c40, pants: 0x4e5542, helmet: 0x2a2e30, skin: 0x8a6a52, accent: 0x6a1f1f, visor: 0xff3a2a, scale: 1, wide: 1 },
  rusher: { uniform: 0x4a5258, vest: 0x2a2d30, pants: 0x383c40, helmet: 0x444a50, skin: 0x7a5c48, accent: 0xb02020, visor: 0xff7a1a, scale: 0.97, wide: 0.9 },
  heavy:  { uniform: 0x585c64, vest: 0x24272b, pants: 0x3e4248, helmet: 0x1a1c1f, skin: 0x70523f, accent: 0xd28a1a, visor: 0xff2a1a, scale: 1.2, wide: 1.35 },
  boss:   { uniform: 0x34363c, vest: 0x1a1b1d, pants: 0x28292d, helmet: 0xa01c1c, skin: 0x9a7a62, accent: 0xd2a02a, visor: 0xff1a1a, scale: 1.18, wide: 1.15 },
};

export function buildRig(type: EnemyType): Rig {
  const L = LOOKS[type];
  const meshes: THREE.Mesh[] = [];
  const root = new THREE.Group();
  const s = L.scale, w = L.wide;
  const uni = mat(L.uniform), vest = mat(L.vest, 0.2, 0.7), pants = mat(L.pants), helm = mat(L.helmet, 0.3, 0.55), skin = mat(L.skin, 0, 0.9);
  const acc = mat(L.accent, 0.3, 0.5), gunMat = mat(0x16181a, 0.8, 0.35), glove = mat(0x121212);
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x110000, emissive: L.visor, emissiveIntensity: 2.4 });

  const hips = new THREE.Group(); hips.position.y = 0.88; root.add(hips);
  box(hips, 0.4 * w, 0.2, 0.24 * w, 0, 0.02, 0, pants, meshes);

  const legMk = (x: number) => {
    const leg = new THREE.Group(); leg.position.set(x * w, 0, 0); hips.add(leg);
    box(leg, 0.17 * w, 0.46, 0.2 * w, 0, -0.24, 0, pants, meshes);
    box(leg, 0.15 * w, 0.4, 0.17 * w, 0, -0.62, 0.0, pants, meshes);
    box(leg, 0.17 * w, 0.1, 0.28 * w, 0, -0.84, 0.04, mat(0x0e0e0e), meshes);
    box(leg, 0.19 * w, 0.14, 0.22 * w, 0, -0.42, 0.01, vest, meshes); // knee pad
    return leg;
  };
  const legL = legMk(-0.12), legR = legMk(0.12);

  const torso = new THREE.Group(); hips.add(torso);
  box(torso, 0.44 * w, 0.58, 0.26 * w, 0, 0.32, 0, uni, meshes);
  box(torso, 0.46 * w, 0.4, 0.3 * w, 0, 0.36, 0.01, vest, meshes);
  box(torso, 0.1, 0.12, 0.06, -0.12 * w, 0.28, 0.17 * w, acc, meshes);
  box(torso, 0.1, 0.12, 0.06, 0.12 * w, 0.28, 0.17 * w, acc, meshes);
  box(torso, 0.38 * w, 0.1, 0.3 * w, 0, 0.05, 0, mat(0x1b1b1b), meshes);
  if (type === 'heavy') {
    box(torso, 0.56 * w, 0.4, 0.1, 0, 0.4, 0.2 * w, mat(0x2c2f33, 0.6, 0.4), meshes);
    box(torso, 0.2, 0.1, 0.5, -0.3 * w, 0.58, 0, mat(0x2c2f33, 0.6, 0.4), meshes);
    box(torso, 0.2, 0.1, 0.5, 0.3 * w, 0.58, 0, mat(0x2c2f33, 0.6, 0.4), meshes);
  }
  if (type === 'boss') {
    box(torso, 0.5 * w, 0.62, 0.34 * w, 0, -0.18, 0.0, mat(0x121214, 0, 0.9), meshes); // coat skirt
    box(torso, 0.2, 0.06, 0.4, -0.3 * w, 0.62, 0, acc, meshes);
    box(torso, 0.2, 0.06, 0.4, 0.3 * w, 0.62, 0, acc, meshes);
    box(torso, 0.06, 0.5, 0.02, 0, 0.35, 0.17 * w, acc, meshes);
  }

  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  box(head, 0.2, 0.22, 0.22, 0, 0.12, 0, skin, meshes);
  const visor = box(head, 0.19, 0.05, 0.02, 0, 0.14, 0.115, visorMat, meshes);
  if (type === 'boss') {
    box(head, 0.28, 0.07, 0.3, 0, 0.27, -0.01, helm, meshes);
    box(head, 0.2, 0.05, 0.22, -0.04, 0.3, 0, helm, meshes);
    box(head, 0.1, 0.1, 0.02, 0.0, 0.33, 0.1, acc, meshes);
  } else if (type === 'rusher') {
    box(head, 0.23, 0.09, 0.25, 0, 0.26, -0.01, helm, meshes);
    box(head, 0.2, 0.09, 0.03, 0, 0.06, 0.115, acc, meshes); // mask
  } else {
    box(head, 0.26, 0.13, 0.28, 0, 0.26, -0.01, helm, meshes);
    box(head, 0.27, 0.05, 0.06, 0, 0.2, 0.12, helm, meshes);
    if (type === 'heavy') box(head, 0.2, 0.12, 0.04, 0, 0.04, 0.12, vest, meshes);
  }

  const armMk = (x: number) => {
    const arm = new THREE.Group(); arm.position.set(x * w, 0.56, 0); torso.add(arm);
    box(arm, 0.13 * w, 0.28, 0.14 * w, 0, -0.14, 0, uni, meshes);
    const fore = new THREE.Group(); fore.position.y = -0.28; arm.add(fore);
    box(fore, 0.11 * w, 0.28, 0.12 * w, 0, -0.14, 0, uni, meshes);
    box(fore, 0.1, 0.1, 0.12, 0, -0.32, 0, glove, meshes);
    return arm;
  };
  const armL = armMk(-0.29), armR = armMk(0.29);

  // weapon attached to the torso (so it follows aim), held in front
  const gun = new THREE.Group(); gun.position.set(0.12 * w, 0.4, 0.28); torso.add(gun);
  const gl = type === 'heavy' ? 0.85 : type === 'boss' ? 0.7 : type === 'rusher' ? 0.5 : 0.65;
  box(gun, 0.06, 0.1, gl, 0, 0, 0, gunMat, meshes);
  box(gun, 0.04, 0.05, gl * 0.5, 0, 0.02, gl * 0.55, gunMat, meshes);
  box(gun, 0.05, 0.14, 0.06, 0, -0.1, -0.05, gunMat, meshes);
  if (type === 'heavy') box(gun, 0.14, 0.14, 0.3, 0, -0.1, 0.1, gunMat, meshes);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, gl * 0.95); gun.add(muzzle);

  root.scale.setScalar(s);
  return { root, hips, torso, head, armL, armR, legL, legR, gun, muzzle, meshes, visor, scale: s };
}
