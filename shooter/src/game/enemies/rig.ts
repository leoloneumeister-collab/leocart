import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { getTexSet } from '../../engine/texgen';
import { makeCanvas, mulberry32 } from '../../engine/util';

export type EnemyType = 'grunt' | 'rusher' | 'heavy' | 'boss';

export interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group; foreL: THREE.Group;
  armR: THREE.Group; foreR: THREE.Group;
  legL: THREE.Group; shinL: THREE.Group;
  legR: THREE.Group; shinR: THREE.Group;
  gun: THREE.Group;
  gripR: THREE.Object3D;
  gripL: THREE.Object3D;
  muzzle: THREE.Object3D;
  meshes: THREE.Mesh[];
  visor: THREE.Mesh;
  scale: number;
  hasGun: boolean;
  /** Two-bone IK: place both hands on the gun grips (torso local space). */
  solveArms(): void;
}

interface Look {
  camo: [number, number, number, number]; vest: number; gear: number; lens: number; scale: number; wide: number; cloth: number;
}

const LOOKS: Record<EnemyType, Look> = {
  grunt:  { camo: [0x7d8858, 0x9ea06c, 0x586446, 0xb0a67a], vest: 0x474d47, gear: 0x30353a, lens: 0xff5030, scale: 1.0, wide: 1.0, cloth: 0x9aa070 },
  rusher: { camo: [0x454b52, 0x5a626b, 0x30353a, 0x6c757e], vest: 0x2a2d31, gear: 0x25282c, lens: 0xff8a20, scale: 0.98, wide: 0.92, cloth: 0x555c64 },
  heavy:  { camo: [0x69707a, 0x7b838d, 0x4b5259, 0x8a929c], vest: 0x30343a, gear: 0x24272c, lens: 0xff3020, scale: 1.14, wide: 1.28, cloth: 0x707882 },
  boss:   { camo: [0x34363c, 0x44464d, 0x25262a, 0x56585f], vest: 0x1c1d20, gear: 0x1a1b1e, lens: 0xff2020, scale: 1.12, wide: 1.12, cloth: 0x3a3c42 },
};

const camoCache = new Map<EnemyType, THREE.CanvasTexture>();
function camoTexture(type: EnemyType) {
  let t = camoCache.get(type);
  if (t) return t;
  const N = 256, cv = makeCanvas(N, N), g = cv.getContext('2d')!;
  const tones = LOOKS[type].camo.map((c) => '#' + c.toString(16).padStart(6, '0'));
  g.fillStyle = tones[0]; g.fillRect(0, 0, N, N);
  const rng = mulberry32(type.length * 77 + 5);
  for (let k = 1; k < 4; k++) {
    g.fillStyle = tones[k];
    for (let i = 0; i < 26; i++) {
      const x = rng() * N, y = rng() * N, rx = 10 + rng() * 26, ry = 6 + rng() * 16, a = rng() * Math.PI;
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
        g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, a, 0, Math.PI * 2); g.fill();
      }
    }
  }
  // fabric grain
  for (let i = 0; i < 3500; i++) { const v = Math.floor(rng() * 255); g.fillStyle = `rgba(${v},${v},${v},0.06)`; g.fillRect(rng() * N, rng() * N, 2, 1); }
  t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  camoCache.set(type, t);
  return t;
}

const matCache = new Map<string, THREE.Material>();
function clothMat(type: EnemyType) {
  const key = 'cloth' + type;
  let m = matCache.get(key);
  if (!m) {
    const f = getTexSet('fabric');
    m = new THREE.MeshStandardMaterial({
      map: camoTexture(type), emissiveMap: camoTexture(type), emissive: 0xffffff, emissiveIntensity: 0.16, vertexColors: true, roughness: 0.92, metalness: 0,
      normalMap: f.normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
    });
    matCache.set(key, m);
  }
  return m;
}
function gearMat() {
  let m = matCache.get('gear');
  if (!m) { m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25, emissive: 0x1a1c1e, emissiveIntensity: 1 }); matCache.set('gear', m); }
  return m;
}
function metalMat() {
  let m = matCache.get('metal');
  if (!m) { m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.85 }); matCache.set('metal', m); }
  return m;
}

type Bucket = 'cloth' | 'gear' | 'metal' | 'glass';

class BoneBuilder {
  private geos: Record<Bucket, THREE.BufferGeometry[]> = { cloth: [], gear: [], metal: [], glass: [] };
  constructor(private type: EnemyType, private look: Look) {}
  add(geo: THREE.BufferGeometry, bucket: Bucket, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    let g = geo.clone().applyMatrix4(m);
    if (g.index) g = g.toNonIndexed();
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // world-ish UVs for cloth so camo scales with the body
    this.geos[bucket].push(g);
  }
  flush(parent: THREE.Object3D, meshes: THREE.Mesh[]): THREE.Mesh | null {
    let glass: THREE.Mesh | null = null;
    for (const b of ['cloth', 'gear', 'metal', 'glass'] as Bucket[]) {
      const list = this.geos[b];
      if (!list.length) continue;
      for (const g of list) { if (b !== 'cloth' && g.attributes.uv) g.deleteAttribute('uv'); }
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      let mat: THREE.Material;
      if (b === 'cloth') mat = clothMat(this.type);
      else if (b === 'gear') mat = gearMat();
      else if (b === 'metal') mat = metalMat();
      else mat = new THREE.MeshStandardMaterial({ color: 0x050607, emissive: this.look.lens, emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.9 });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      parent.add(mesh);
      meshes.push(mesh);
      if (b === 'glass') glass = mesh;
    }
    return glass;
  }
}

const RB = (w: number, h: number, d: number, r = 0.03, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);
const CAP = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
const CYL = (r: number, h: number, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg);

function normalizeUV(g: THREE.BufferGeometry) { void g; }

export function buildRig(type: EnemyType): Rig {
  const L = LOOKS[type];
  const meshes: THREE.Mesh[] = [];
  const root = new THREE.Group();
  const w = L.wide;

  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  {
    const b = new BoneBuilder(type, L);
    b.add(RB(0.34 * w, 0.2, 0.22 * w, 0.05), 'cloth', L.cloth, 0, 0, 0);
    b.add(RB(0.36 * w, 0.06, 0.24 * w, 0.02), 'gear', L.gear, 0, 0.06, 0);
    b.add(RB(0.08, 0.12, 0.05, 0.015), 'gear', L.vest, 0.17 * w, 0, 0.1 * w);
    b.add(RB(0.08, 0.12, 0.05, 0.015), 'gear', L.vest, -0.17 * w, 0, 0.1 * w);
    b.flush(hips, meshes);
  }

  const legMk = (x: number) => {
    const thigh = new THREE.Group(); thigh.position.set(x * w, -0.02, 0); hips.add(thigh);
    const t = new BoneBuilder(type, L);
    t.add(CAP(0.078 * w, 0.28), 'cloth', L.cloth, 0, -0.21, 0);
    t.add(RB(0.1 * w, 0.14, 0.1 * w, 0.03), 'gear', L.vest, 0.02 * (x > 0 ? 1 : -1), -0.16, 0.0); // cargo pouch
    t.flush(thigh, meshes);
    const shin = new THREE.Group(); shin.position.y = -0.45; thigh.add(shin);
    const s = new BoneBuilder(type, L);
    s.add(CAP(0.062 * w, 0.28), 'cloth', L.cloth, 0, -0.2, 0);
    s.add(RB(0.12 * w, 0.12, 0.13, 0.04), 'gear', L.gear, 0, -0.08, 0.02); // kneepad
    s.add(RB(0.105 * w, 0.12, 0.27, 0.045), 'gear', 0x17191b, 0, -0.45, 0.06); // boot
    s.add(RB(0.11 * w, 0.045, 0.28, 0.02), 'gear', 0x0a0a0b, 0, -0.5, 0.06); // sole
    s.flush(shin, meshes);
    return { thigh, shin };
  };
  const lL = legMk(-0.1), lR = legMk(0.1);

  const torso = new THREE.Group(); torso.position.y = 0.08; hips.add(torso);
  {
    const b = new BoneBuilder(type, L);
    b.add(RB(0.38 * w, 0.5, 0.22 * w, 0.06), 'cloth', L.cloth, 0, 0.3, 0);
    b.add(RB(0.43 * w, 0.4, 0.27 * w, 0.05), 'gear', L.vest, 0, 0.34, 0.005); // plate carrier
    for (const x of [-0.12, 0, 0.12]) b.add(RB(0.1, 0.13, 0.07, 0.02), 'gear', L.gear, x * w, 0.26, 0.15 * w); // mag pouches
    b.add(RB(0.16, 0.12, 0.04, 0.015), 'gear', 0x25282b, 0, 0.45, 0.145 * w); // chest rig panel
    b.add(RB(0.13, 0.05, 0.03, 0.01), 'metal', 0x333333, -0.1 * w, 0.52, 0.16 * w); // radio
    b.add(RB(0.34 * w, 0.4, 0.14, 0.05), 'gear', L.vest, 0, 0.36, -0.2 * w); // back panel / pack
    if (type === 'grunt' || type === 'boss') b.add(RB(0.3 * w, 0.32, 0.12, 0.05), 'cloth', L.cloth, 0, 0.34, -0.3 * w); // rucksack
    if (type === 'heavy') { b.add(RB(0.5 * w, 0.28, 0.08, 0.03), 'metal', 0x2a2e33, 0, 0.42, 0.17 * w); b.add(RB(0.14, 0.12, 0.3, 0.04), 'gear', L.gear, -0.3 * w, 0.58, 0); b.add(RB(0.14, 0.12, 0.3, 0.04), 'gear', L.gear, 0.3 * w, 0.58, 0); }
    if (type === 'boss') { b.add(RB(0.5 * w, 0.62, 0.34 * w, 0.06), 'cloth', 0x121214, 0, -0.1, 0); b.add(RB(0.2, 0.05, 0.3, 0.015), 'metal', 0xc79a2a, -0.26 * w, 0.58, 0); b.add(RB(0.2, 0.05, 0.3, 0.015), 'metal', 0xc79a2a, 0.26 * w, 0.58, 0); }
    b.add(CYL(0.05, 0.1), 'cloth', 0x1a1a1a, 0, 0.6, 0);
    b.flush(torso, meshes);
  }

  const head = new THREE.Group(); head.position.y = 0.63; torso.add(head);
  let visor!: THREE.Mesh;
  {
    const b = new BoneBuilder(type, L);
    b.add(new THREE.SphereGeometry(0.105, 18, 14), 'cloth', 0x15171a, 0, 0, 0, 0, 0, 0, 1, 1.12, 1.05); // balaclava head
    b.add(new THREE.SphereGeometry(0.125, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), 'gear', type === 'boss' ? 0x8f1a1a : 0x20252a, 0, 0.015, -0.005, 0, 0, 0, 1, 1, 1.08); // helmet shell
    if (type !== 'boss') { b.add(RB(0.04, 0.045, 0.06, 0.01), 'metal', 0x2a2a2a, 0, 0.1, 0.1); b.add(CYL(0.012, 0.09, 8), 'metal', 0x111111, 0, 0.12, 0.13, Math.PI / 2); } // NVG mount
    if (type === 'rusher') b.add(RB(0.2, 0.08, 0.06, 0.02), 'cloth', 0xb02020, 0, -0.07, 0.07); // scarf
    if (type === 'boss') { b.add(RB(0.26, 0.04, 0.28, 0.02), 'gear', 0x8f1a1a, 0, 0.11, 0); b.add(RB(0.05, 0.05, 0.02, 0.01), 'metal', 0xc79a2a, 0, 0.115, 0.14); }
    b.add(RB(0.17, 0.045, 0.04, 0.012), 'glass', 0xffffff, 0, 0.02, 0.105); // goggles
    b.add(RB(0.2, 0.1, 0.05, 0.02), 'gear', 0x1a1c1e, 0, -0.07, 0.085); // face guard
    if (type === 'heavy') { b.add(RB(0.3, 0.22, 0.3, 0.05), 'gear', 0x1c1f22, 0, 0.02, 0, 0, 0, 0, 1, 1, 1); }
    visor = b.flush(head, meshes) ?? meshes[meshes.length - 1];
  }

  const armMk = (x: number) => {
    const upper = new THREE.Group(); upper.position.set(x * w, 0.5, 0); torso.add(upper);
    const u = new BoneBuilder(type, L);
    u.add(new THREE.SphereGeometry(0.075 * w, 12, 10), 'cloth', L.cloth, 0, 0, 0);
    u.add(CAP(0.056 * w, 0.2), 'cloth', L.cloth, 0, -0.15, 0);
    u.flush(upper, meshes);
    const fore = new THREE.Group(); fore.position.y = -0.3; upper.add(fore);
    const f = new BoneBuilder(type, L);
    f.add(CAP(0.05 * w, 0.18), 'cloth', L.cloth, 0, -0.13, 0);
    f.add(RB(0.09 * w, 0.08, 0.1, 0.03), 'gear', L.gear, 0, -0.24, 0.0); // glove
    f.add(RB(0.085 * w, 0.07, 0.07, 0.025), 'gear', L.gear, 0, -0.1, 0.02, 0, 0, 0); // elbow pad
    f.flush(fore, meshes);
    return { upper, fore };
  };
  const aL = armMk(-0.25), aR = armMk(0.25);

  // weapon
  const gun = new THREE.Group(); torso.add(gun);
  const hasGun = type !== 'rusher';
  const gripR = new THREE.Object3D(), gripL = new THREE.Object3D(), muzzle = new THREE.Object3D();
  {
    const b = new BoneBuilder(type, L);
    const gl = type === 'heavy' ? 0.85 : type === 'boss' ? 0.72 : type === 'rusher' ? 0.46 : 0.68;
    b.add(RB(0.06, 0.1, gl * 0.45, 0.015), 'metal', 0x1c1f22, 0, 0, 0.0);
    b.add(RB(0.05, 0.075, gl * 0.4, 0.015), 'gear', 0x25282b, 0, -0.005, gl * 0.4);
    b.add(CYL(0.012, gl * 0.45, 10), 'metal', 0x15171a, 0, 0.01, gl * 0.62, Math.PI / 2);
    if (type !== 'heavy') b.add(CYL(0.02, 0.1, 10), 'metal', 0x111214, 0, 0.01, gl * 0.9, Math.PI / 2);
    b.add(RB(0.03, 0.025, gl * 0.45, 0.008), 'metal', 0x2a2d30, 0, 0.065, 0.02); // rail
    b.add(RB(0.045, 0.05, 0.1, 0.012), 'metal', 0x15171a, 0, 0.1, 0.0); // optic
    b.add(RB(0.045, 0.14, 0.05, 0.015), 'gear', 0x1c1f22, 0, -0.1, 0.0, 0.15); // mag
    b.add(RB(0.04, 0.11, 0.05, 0.015), 'gear', 0x1c1f22, 0, -0.08, -0.07, -0.3); // grip
    b.add(RB(0.045, 0.09, 0.2, 0.02), 'gear', 0x22262a, 0, -0.01, -0.2); // stock
    if (type === 'heavy') { b.add(RB(0.2, 0.17, 0.2, 0.04), 'gear', 0x1c1f22, 0, -0.14, 0.05); }
    if (!hasGun) { /* rusher carries a compact SMG */ }
    b.flush(gun, meshes);
    gripR.position.set(0, -0.09, -0.07);
    gripL.position.set(0, -0.045, gl * 0.42);
    muzzle.position.set(0, 0.01, gl * 0.98);
    gun.add(gripR, gripL, muzzle);
  }

  if (!hasGun) gun.visible = false;
  root.scale.setScalar(L.scale);

  const rig: Rig = {
    root, hips, torso, head, armL: aL.upper, foreL: aL.fore, armR: aR.upper, foreR: aR.fore,
    legL: lL.thigh, shinL: lL.shin, legR: lR.thigh, shinR: lR.shin, gun, gripR, gripL, muzzle, meshes, visor, scale: L.scale, hasGun,
    solveArms() { void 0; },
  };

  // ---- two bone IK (torso local space)
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), dir = new THREE.Vector3(), pole = new THREE.Vector3(), elbow = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const L1 = 0.3, L2 = 0.26;
  const solve = (upper: THREE.Group, fore: THREE.Group, grip: THREE.Object3D, side: number) => {
    const S = upper.position;
    grip.getWorldPosition(v1);
    torso.worldToLocal(v1);
    dir.subVectors(v1, S);
    let d = dir.length();
    const max = L1 + L2 - 0.005;
    if (d > max) { v1.copy(S).addScaledVector(dir.normalize(), max); d = max; } else dir.normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    pole.set(side * 0.6, -1, -0.25); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    elbow.copy(S).addScaledVector(dir, a).addScaledVector(pole, h);
    v2.subVectors(elbow, S).normalize();
    q1.setFromUnitVectors(down, v2);
    upper.quaternion.copy(q1);
    v2.subVectors(v1, elbow).normalize();
    q2.setFromUnitVectors(down, v2);
    fore.quaternion.copy(q1).invert().multiply(q2);
  };
  rig.solveArms = () => {
    root.updateMatrixWorld(true);
    solve(rig.armR, rig.foreR, gripR, 1);
    solve(rig.armL, rig.foreL, gripL, -1);
  };
  normalizeUV(new THREE.BufferGeometry());
  return rig;
}
