/**
 * Procedural skinned characters. A RigBuilder collects geometry parts, each rigidly bound to a
 * bone (or blended along a bone chain for cloth), and merges them into one SkinnedMesh per
 * material bucket. Bones are animated in code, so a hero costs only a few draw calls.
 */
import * as THREE from 'three';
import { bucketMaterial, outlineMaterial } from './materials.ts';
import type { Bucket } from './materials.ts';
import type { V3 } from './shapes.ts';

export interface PartOpts {
  bucket?: Bucket;
  /** Translation / euler rotation / scale applied to the geometry before binding. */
  p?: V3;
  r?: V3;
  s?: V3;
  /** Vertical shading: colour multiplier at the bottom and top of the part. */
  grad?: [number, number];
  /** Brightness variation per vertex to fake hand painting. */
  jitter?: number;
  /** Do not draw an outline for this part. */
  noOutline?: boolean;
  /** Glow bucket only: multiplier above 1.0 so the part blooms. */
  boost?: number;
}

interface Acc {
  pos: number[];
  nrm: number[];
  col: number[];
  skinIdx: number[];
  skinW: number[];
  idx: number[];
  outlineIdx: number[];
}

export interface Character {
  group: THREE.Group;
  bones: Record<string, THREE.Bone>;
  rest: Record<string, THREE.Vector3>;
  skeleton: THREE.Skeleton;
  meshes: THREE.SkinnedMesh[];
  outlines: THREE.SkinnedMesh[];
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RigBuilder {
  private defs: { name: string; parent: string | null; pos: V3 }[] = [];
  private index = new Map<string, number>();
  private buckets = new Map<Bucket, Acc>();
  private rnd = mulberry(1337);
  rimColor: number | undefined;

  /** Add a bone at an absolute rest position (model space). */
  bone(name: string, parent: string | null, x: number, y: number, z: number): this {
    this.index.set(name, this.defs.length);
    this.defs.push({ name, parent, pos: [x, y, z] });
    return this;
  }

  restPos(name: string): V3 {
    return this.defs[this.index.get(name)!].pos;
  }

  private acc(bucket: Bucket): Acc {
    let a = this.buckets.get(bucket);
    if (!a) {
      a = { pos: [], nrm: [], col: [], skinIdx: [], skinW: [], idx: [], outlineIdx: [] };
      this.buckets.set(bucket, a);
    }
    return a;
  }

  /** Bind a geometry rigidly to one bone. */
  part(bone: string, geo: THREE.BufferGeometry, color: number, o: PartOpts = {}): this {
    const bi = this.index.get(bone);
    if (bi === undefined) throw new Error(`unknown bone ${bone}`);
    const a = this.acc(o.bucket ?? 'base');
    let g = geo.clone();
    if (o.s || o.r || o.p) {
      tmpE.set(o.r?.[0] ?? 0, o.r?.[1] ?? 0, o.r?.[2] ?? 0);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(new THREE.Vector3(...(o.p ?? [0, 0, 0])), tmpQ, new THREE.Vector3(...(o.s ?? [1, 1, 1])));
      g.applyMatrix4(tmpM);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const n = pos.count;
    // gradient bounds
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const base = a.pos.length / 3;
    tmpC.setHex(color);
    const grad = o.grad ?? [0.82, 1.08];
    const jit = o.jitter ?? 0.05;
    const boost = o.bucket === 'glow' ? (o.boost ?? 1.8) : 1;
    for (let i = 0; i < n; i++) {
      a.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      a.nrm.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      const t = maxY > minY ? (pos.getY(i) - minY) / (maxY - minY) : 0.5;
      const k = (grad[0] + (grad[1] - grad[0]) * t) * (1 + (this.rnd() - 0.5) * jit) * boost;
      a.col.push(tmpC.r * k, tmpC.g * k, tmpC.b * k);
      a.skinIdx.push(bi, 0, 0, 0);
      a.skinW.push(1, 0, 0, 0);
    }
    const ix = g.index;
    if (ix) {
      for (let i = 0; i < ix.count; i++) {
        a.idx.push(base + ix.getX(i));
      }
    } else {
      for (let i = 0; i < n; i++) a.idx.push(base + i);
    }
    if (!o.noOutline && (o.bucket === undefined || o.bucket === 'base' || o.bucket === 'metal')) {
      for (let i = a.idx.length - (ix ? ix.count : n); i < a.idx.length; i++) a.outlineIdx.push(a.idx[i]);
    }
    return this;
  }

  /**
   * A cloth sheet that bends along a chain of bones. `fn(u, v)` returns the rest position for
   * u in [0,1] across and v in [0,1] down. Weights blend between neighbouring chain bones by v.
   */
  cloth(chain: string[], rows: number, cols: number, fn: (u: number, v: number) => V3, colorFn: (u: number, v: number) => number, bucket: Bucket = 'cloth'): this {
    const a = this.acc(bucket);
    const base = a.pos.length / 3;
    const geo = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const p = fn(c / cols, r / rows);
        pos.push(...p);
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const idx: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i0 = r * (cols + 1) + c;
        const i1 = i0 + 1;
        const i2 = i0 + cols + 1;
        const i3 = i2 + 1;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nrm = geo.getAttribute('normal');
    const chainIdx = chain.map((b) => this.index.get(b)!);
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const f = v * (chain.length - 1);
      const i = Math.min(chain.length - 2, Math.floor(f));
      const t = f - i;
      for (let c = 0; c <= cols; c++) {
        const vi = r * (cols + 1) + c;
        a.pos.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
        a.nrm.push(nrm.getX(vi), nrm.getY(vi), nrm.getZ(vi));
        tmpC.setHex(colorFn(c / cols, v));
        const k = 1 + (this.rnd() - 0.5) * 0.06;
        a.col.push(tmpC.r * k, tmpC.g * k, tmpC.b * k);
        if (chain.length === 1) {
          a.skinIdx.push(chainIdx[0], 0, 0, 0);
          a.skinW.push(1, 0, 0, 0);
        } else {
          a.skinIdx.push(chainIdx[i], chainIdx[i + 1], 0, 0);
          a.skinW.push(1 - t, t, 0, 0);
        }
      }
    }
    for (const i of idx) a.idx.push(base + i);
    return this;
  }

  build(outlineColor = 0x140f1e, outlineThickness = 0.04, withOutline = true): Character {
    const group = new THREE.Group();
    const bones: Record<string, THREE.Bone> = {};
    const list: THREE.Bone[] = [];
    const rest: Record<string, THREE.Vector3> = {};
    for (const d of this.defs) {
      const b = new THREE.Bone();
      b.name = d.name;
      bones[d.name] = b;
      list.push(b);
    }
    for (const d of this.defs) {
      const b = bones[d.name];
      if (d.parent) {
        const pp = this.defs[this.index.get(d.parent)!].pos;
        b.position.set(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2]);
        bones[d.parent].add(b);
      } else {
        b.position.set(...d.pos);
        group.add(b);
      }
      rest[d.name] = b.position.clone();
    }
    group.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(list);
    const meshes: THREE.SkinnedMesh[] = [];
    const outlines: THREE.SkinnedMesh[] = [];
    const outMat = withOutline ? outlineMaterial(outlineColor, outlineThickness) : null;
    for (const [bucket, a] of this.buckets) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(a.nrm, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(a.skinIdx, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(a.skinW, 4));
      geo.setIndex(a.idx);
      const mesh = new THREE.SkinnedMesh(geo, bucketMaterial(bucket, { rimColor: this.rimColor }));
      mesh.frustumCulled = false;
      mesh.castShadow = bucket !== 'glow';
      mesh.receiveShadow = bucket === 'base' || bucket === 'cloth';
      group.add(mesh);
      mesh.bind(skeleton, new THREE.Matrix4());
      meshes.push(mesh);
      if (outMat && a.outlineIdx.length > 0) {
        const og = new THREE.BufferGeometry();
        og.setAttribute('position', geo.getAttribute('position'));
        og.setAttribute('normal', geo.getAttribute('normal'));
        og.setAttribute('skinIndex', geo.getAttribute('skinIndex'));
        og.setAttribute('skinWeight', geo.getAttribute('skinWeight'));
        og.setIndex(a.outlineIdx);
        const om = new THREE.SkinnedMesh(og, outMat);
        om.frustumCulled = false;
        group.add(om);
        om.bind(skeleton, new THREE.Matrix4());
        outlines.push(om);
      }
    }
    return { group, bones, rest, skeleton, meshes, outlines };
  }
}

/** Damped spring chain used for capes, hair, scarves and tails. Rotates each bone a little more than its parent. */
export class SpringChain {
  private ax = 0;
  private az = 0;
  private vx = 0;
  private vz = 0;
  private bones: THREE.Bone[];
  private stiffness: number;
  private damping: number;
  private spread: number;

  constructor(bones: THREE.Bone[], stiffness = 40, damping = 6, spread = 1) {
    this.bones = bones;
    this.stiffness = stiffness;
    this.damping = damping;
    this.spread = spread;
  }

  /** `targetX` bends the chain forward/back, `targetZ` sideways. Angles in radians for the whole chain. */
  update(dt: number, targetX: number, targetZ: number, flutter = 0, t = 0) {
    const h = Math.min(dt, 0.05);
    this.vx += ((targetX - this.ax) * this.stiffness - this.vx * this.damping) * h;
    this.vz += ((targetZ - this.az) * this.stiffness - this.vz * this.damping) * h;
    this.ax += this.vx * h;
    this.az += this.vz * h;
    const n = this.bones.length;
    for (let i = 0; i < n; i++) {
      const k = ((i + 1) / n) * this.spread;
      const f = Math.sin(t * 5 + i * 0.9) * flutter * (i + 1);
      this.bones[i].rotation.x = this.ax * k + f * 0.5;
      this.bones[i].rotation.z = this.az * k + f * 0.3;
    }
  }
}
