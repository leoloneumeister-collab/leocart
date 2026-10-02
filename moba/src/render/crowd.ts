/**
 * Instanced animated crowd. Each model is one merged vertex-coloured mesh where every vertex carries a part id
 * and a pivot, and the vertex shader swings arms, legs, wheels and flags from per-instance phase / move / attack /
 * death values. Hundreds of minions animate for the cost of a couple of draw calls per model.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHARED, chainPatch, outlineMaterial, stylize } from './materials.ts';
import type { Quality } from './pipeline.ts';
import type { V3 } from './shapes.ts';

/** Part ids understood by the vertex shader. */
export const P = {
  body: 0,
  armL: 1,
  /** Weapon arm: also does the attack swing. */
  armR: 2,
  legL: 3,
  legR: 4,
  wheel: 5,
  /** Slides back and forth when attacking (cannon barrel). */
  recoil: 6,
  /** Waves in the wind (flags, capes, plumes). */
  flag: 7,
  /** Bobs up and down (floating orbs, hats). */
  float: 8,
  /** Both arms raised and bobbing (casters). */
  armUp: 9,
  head: 10,
} as const;

export interface PartOpts {
  p?: V3;
  r?: V3;
  s?: V3;
  /** Vertical shade gradient over the part (bottom, top). */
  grad?: [number, number];
  /** Rotation pivot in model space. */
  pivot?: V3;
  /** Bake a brightness boost above 1 (for glowing parts, used with `glow`). */
  boost?: number;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

/** Collects coloured parts into one geometry with part / pivot attributes. */
export class ModelBuilder {
  private geos: THREE.BufferGeometry[] = [];
  private glowGeos: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: number, part: number = P.body, o: PartOpts = {}, glow = false): this {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (o.s || o.r || o.p) {
      tmpE.set(o.r?.[0] ?? 0, o.r?.[1] ?? 0, o.r?.[2] ?? 0);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(new THREE.Vector3(...(o.p ?? [0, 0, 0])), tmpQ, new THREE.Vector3(...(o.s ?? [1, 1, 1])));
      g.applyMatrix4(tmpM);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const n = pos.count;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
    }
    tmpC.setHex(color);
    const grad = o.grad ?? [0.8, 1.12];
    const boost = glow ? (o.boost ?? 1.8) : 1;
    const col = new Float32Array(n * 3);
    const pt = new Float32Array(n);
    const pv = new Float32Array(n * 3);
    const pivot = o.pivot ?? [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const t = maxY > minY ? (pos.getY(i) - minY) / (maxY - minY) : 0.5;
      const k = (grad[0] + (grad[1] - grad[0]) * t) * boost;
      col[i * 3] = tmpC.r * k;
      col[i * 3 + 1] = tmpC.g * k;
      col[i * 3 + 2] = tmpC.b * k;
      pt[i] = part;
      pv[i * 3] = pivot[0];
      pv[i * 3 + 1] = pivot[1];
      pv[i * 3 + 2] = pivot[2];
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    out.setAttribute('normal', g.getAttribute('normal'));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('aPart', new THREE.BufferAttribute(pt, 1));
    out.setAttribute('aPivot', new THREE.BufferAttribute(pv, 3));
    (glow ? this.glowGeos : this.geos).push(out);
    return this;
  }

  glow(geo: THREE.BufferGeometry, color: number, part: number = P.body, o: PartOpts = {}): this {
    return this.add(geo, color, part, o, true);
  }

  build(): { solid: THREE.BufferGeometry; glow: THREE.BufferGeometry | null } {
    return { solid: this.geos.length ? mergeGeometries(this.geos, false)! : new THREE.BufferGeometry(), glow: this.glowGeos.length ? mergeGeometries(this.glowGeos, false)! : null };
  }
}

const ANIM_VERT_NORMAL = /* glsl */ `
attribute float aPart;
attribute vec3 aPivot;
attribute vec4 iAnim;
float lfAngX; float lfAngY; float lfSlide; float lfBobY; float lfLunge; float lfDeadK;
void lfAnimSetup() {
  float ph = iAnim.x; float mv = iAnim.y; float at = iAnim.z; float dd = iAnim.w;
  float sw = sin(ph);
  float wind = at < 0.4 ? -smoothstep(0.0, 0.4, at) : (at < 0.58 ? mix(-1.0, 1.0, smoothstep(0.4, 0.58, at)) : 1.0 - smoothstep(0.58, 1.0, at));
  float atk = at > 0.0 ? 1.0 : 0.0;
  float hit = max(0.0, wind);
  lfAngX = 0.0; lfAngY = 0.0; lfSlide = 0.0;
  if (aPart > 0.5 && aPart < 1.5) { lfAngX = sw * 0.75 * mv + sin(uTime * 1.7 + ph) * 0.05 * (1.0 - mv); }
  else if (aPart < 2.5) { lfAngX = -sw * 0.75 * mv + sin(uTime * 1.5 + ph * 0.3) * 0.05 * (1.0 - mv) + atk * (-2.3 * max(0.0, -wind) + 0.9 * hit); }
  else if (aPart < 3.5) { lfAngX = -sw * 0.9 * mv; }
  else if (aPart < 4.5) { lfAngX = sw * 0.9 * mv; }
  else if (aPart < 5.5) { lfAngX = ph * 0.9 * mv + uTime * 0.0; }
  else if (aPart < 6.5) { lfSlide = -0.55 * atk * (wind > 0.0 ? 1.0 - smoothstep(0.0, 0.4, wind) : 0.0) + 0.0; }
  else if (aPart < 7.5) { lfAngY = sin(uTime * 4.0 + ph) * 0.22 + mv * 0.18; lfAngX = -0.12 * mv; }
  else if (aPart < 8.5) { lfSlide = 0.0; }
  else if (aPart < 9.5) { lfAngX = -1.25 + sin(uTime * 3.0 + ph) * 0.08 + atk * (-0.4 * max(0.0, -wind) + 0.5 * hit); }
  lfBobY = abs(sw) * 0.14 * mv + (aPart > 7.5 && aPart < 8.5 ? sin(uTime * 2.6 + ph) * 0.12 : 0.0);
  lfLunge = 0.38 * atk * hit;
  lfDeadK = dd;
}
`;

/** Add the crowd animation to a material (works on lit and outline materials). */
export function animPatch(mat: THREE.Material) {
  chainPatch(mat, 'crowd', (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${shader.vertexShader.includes('uniform float uTime') ? '' : 'uniform float uTime;\n'}${ANIM_VERT_NORMAL}\nvoid main() {`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
lfAnimSetup();
{ float c = cos(lfAngX), s = sin(lfAngX); objectNormal = vec3(objectNormal.x, objectNormal.y * c - objectNormal.z * s, objectNormal.y * s + objectNormal.z * c); }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  vec3 lp = transformed - aPivot;
  float c = cos(lfAngX), s = sin(lfAngX);
  lp = vec3(lp.x, lp.y * c - lp.z * s, lp.y * s + lp.z * c);
  float cy = cos(lfAngY), sy = sin(lfAngY);
  lp = vec3(lp.x * cy + lp.z * sy, lp.y, -lp.x * sy + lp.z * cy);
  transformed = lp + aPivot;
  transformed.z += lfSlide + lfLunge;
  transformed.y += lfBobY;
  if (lfDeadK > 0.0) {
    float f = clamp(lfDeadK / 0.5, 0.0, 1.0); f = f * f * (3.0 - 2.0 * f);
    float ca = cos(-1.35 * f), sa = sin(-1.35 * f);
    vec3 q = transformed - vec3(0.0, 0.8, 0.0);
    q = vec3(q.x, q.y * ca - q.z * sa, q.y * sa + q.z * ca);
    transformed = q + vec3(0.0, 0.8 - 0.5 * f, 0.0);
    transformed *= 1.0 - smoothstep(0.55, 0.9, lfDeadK);
  }
}`,
      );
  });
}

interface Batch {
  solid: THREE.InstancedMesh;
  outline: THREE.InstancedMesh | null;
  glow: THREE.InstancedMesh | null;
  anim: THREE.InstancedBufferAttribute;
  n: number;
}

const m4 = new THREE.Matrix4();
const q4 = new THREE.Quaternion();
const e4 = new THREE.Euler();
const v3 = new THREE.Vector3();
const s3 = new THREE.Vector3(1, 1, 1);

export class Crowd {
  private batches = new Map<string, Batch>();
  private root = new THREE.Group();
  private solidMat: THREE.MeshStandardMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private outlineMat: THREE.MeshBasicMaterial | null;
  private quality: Quality;

  constructor(parent: THREE.Object3D, hook: (m: THREE.Material) => void, quality: Quality) {
    this.quality = quality;
    this.solidMat = stylize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.06 }), { rim: 0.38, paint: 0.1, ao: 0.3 });
    animPatch(this.solidMat);
    hook(this.solidMat);
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    animPatch(this.glowMat);
    this.outlineMat = quality === 'low' ? null : outlineMaterial(0x14101c, 0.05);
    if (this.outlineMat) animPatch(this.outlineMat);
    parent.add(this.root);
  }

  /** Register (or replace) a model under `key`. */
  register(key: string, model: { solid: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }, cap = 260, outline = true) {
    const old = this.batches.get(key);
    if (old) {
      this.root.remove(old.solid);
      if (old.outline) this.root.remove(old.outline);
      if (old.glow) this.root.remove(old.glow);
    }
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    anim.setUsage(THREE.DynamicDrawUsage);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow: boolean) => {
      const g = geo.clone();
      g.setAttribute('iAnim', anim);
      const mesh = new THREE.InstancedMesh(g, mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      mesh.count = 0;
      this.root.add(mesh);
      return mesh;
    };
    const solid = mk(model.solid, this.solidMat, this.quality !== 'low');
    const out = outline && this.outlineMat ? mk(model.solid, this.outlineMat, false) : null;
    const glow = model.glow ? mk(model.glow, this.glowMat, false) : null;
    this.batches.set(key, { solid, outline: out, glow, anim, n: 0 });
  }

  has(key: string): boolean {
    return this.batches.has(key);
  }

  begin() {
    for (const b of this.batches.values()) b.n = 0;
  }

  /** Add one instance. `dead` is seconds since death (0 = alive). */
  push(key: string, x: number, y: number, z: number, yaw: number, phase: number, move: number, atk: number, dead: number, scale = 1): boolean {
    const b = this.batches.get(key);
    if (!b || b.n >= b.solid.instanceMatrix.count) return false;
    e4.set(0, yaw, 0);
    q4.setFromEuler(e4);
    s3.set(scale, scale, scale);
    m4.compose(v3.set(x, y, z), q4, s3);
    const i = b.n++;
    b.solid.setMatrixAt(i, m4);
    b.outline?.setMatrixAt(i, m4);
    b.glow?.setMatrixAt(i, m4);
    const a = b.anim.array as Float32Array;
    a[i * 4] = phase;
    a[i * 4 + 1] = move;
    a[i * 4 + 2] = atk;
    a[i * 4 + 3] = dead;
    return true;
  }

  end() {
    for (const b of this.batches.values()) {
      for (const m of [b.solid, b.outline, b.glow]) {
        if (!m) continue;
        m.count = b.n;
        m.instanceMatrix.needsUpdate = true;
      }
      b.anim.needsUpdate = true;
    }
  }
}
