/** Small helpers for building procedural geometry and merging colored parts. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  /** Position, rotation (euler xyz) and scale applied to the geometry. */
  p?: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number];
  /** Emissive intensity 0..1, baked into the vertex color brightness (instanced meshes ignore per-part emissive). */
  glow?: boolean;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

/** Merge colored parts into a single vertex-colored geometry (non-indexed). */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  for (const part of parts) {
    let g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    tmpE.set(part.r?.[0] ?? 0, part.r?.[1] ?? 0, part.r?.[2] ?? 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(
      new THREE.Vector3(part.p?.[0] ?? 0, part.p?.[1] ?? 0, part.p?.[2] ?? 0),
      tmpQ,
      new THREE.Vector3(part.s?.[0] ?? 1, part.s?.[1] ?? 1, part.s?.[2] ?? 1),
    );
    g.applyMatrix4(tmpM);
    g.deleteAttribute('uv');
    col.setHex(part.color);
    if (part.glow) col.multiplyScalar(1.5);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  merged.computeVertexNormals();
  return merged;
}

export const G = {
  box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg),
  sph: (r: number, seg = 10) => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)),
  cone: (r: number, h: number, seg = 10) => new THREE.ConeGeometry(r, h, seg),
  oct: (r: number) => new THREE.OctahedronGeometry(r, 0),
  ico: (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d),
  torus: (r: number, t: number, seg = 16) => new THREE.TorusGeometry(r, t, 8, seg),
  dodeca: (r: number) => new THREE.DodecahedronGeometry(r, 0),
};

export function lambert(color: number, opts: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

export function std(color: number, rough = 0.75, metal = 0.1, emissive = 0x000000, ei = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei, flatShading: true });
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function teamColor(team: number): number {
  return team === 0 ? 0x3aa0ff : team === 1 ? 0xff4a4a : 0xc8b050;
}

export function teamDark(team: number): number {
  return team === 0 ? 0x1c4f9a : team === 1 ? 0x9a2020 : 0x7a6a30;
}
