// Tiny helpers for building low-poly, vertex-coloured geometry that can be merged into one draw call.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const SPH = new THREE.SphereGeometry(1, 12, 9);
export const SPH_LOW = new THREE.SphereGeometry(1, 8, 6);
export const ICO = new THREE.IcosahedronGeometry(1, 1);
export const DODECA = new THREE.DodecahedronGeometry(1, 0);
export const CONE = new THREE.ConeGeometry(1, 1, 10);
export const CONE_LOW = new THREE.ConeGeometry(1, 1, 6);
export const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
export const CYL_LOW = new THREE.CylinderGeometry(1, 1, 1, 7);
export const TORUS = new THREE.TorusGeometry(1, 0.2, 6, 14);

export function part(geom, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const g = geom.index ? geom.toNonIndexed() : geom.clone();
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _p.set(pos[0], pos[1], pos[2]);
  _s.set(scale[0], scale[1], scale[2]);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  _c.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export const box = (c, w, h, d, pos, rot) => part(BOX, c, { pos, rot, scale: [w, h, d] });
export const sph = (c, rx, ry, rz, pos, rot) => part(SPH, c, { pos, rot, scale: [rx, ry ?? rx, rz ?? rx] });
export const sphLow = (c, rx, ry, rz, pos, rot) => part(SPH_LOW, c, { pos, rot, scale: [rx, ry ?? rx, rz ?? rx] });
export const ico = (c, rx, ry, rz, pos, rot) => part(ICO, c, { pos, rot, scale: [rx, ry ?? rx, rz ?? rx] });
export const dodeca = (c, rx, ry, rz, pos, rot) => part(DODECA, c, { pos, rot, scale: [rx, ry ?? rx, rz ?? rx] });
export const cone = (c, r, h, pos, rot) => part(CONE, c, { pos, rot, scale: [r, h, r] });
export const coneLow = (c, r, h, pos, rot) => part(CONE_LOW, c, { pos, rot, scale: [r, h, r] });
export const cyl = (c, r, h, pos, rot, rb) => part(CYL, c, { pos, rot, scale: [r, h, rb ?? r] });
export const cylLow = (c, r, h, pos, rot, rb) => part(CYL_LOW, c, { pos, rot, scale: [r, h, rb ?? r] });
export const torus = (c, r, pos, rot) => part(TORUS, c, { pos, rot, scale: [r, r, r] });

export const merge = (parts) => {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
};

/** Build an InstancedMesh from [{x, y, z, rot, sx, sy, sz, color}] with per-instance tint. */
export function instanced(geometry, material, items, { castShadow = false, receiveShadow = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    d.position.set(it.x, it.y ?? 0, it.z);
    d.rotation.set(it.rx ?? 0, it.rot ?? 0, it.rz ?? 0);
    d.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    if (it.color !== undefined) {
      col.set(it.color);
      mesh.setColorAt(i, col);
    }
  }
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.computeBoundingSphere();
  return mesh;
}
