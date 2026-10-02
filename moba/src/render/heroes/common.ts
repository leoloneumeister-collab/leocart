/** Shared types and helpers for hero model builders. */
import * as THREE from 'three';
import type { Character, RigBuilder } from '../rig.ts';
import type { Bucket } from '../materials.ts';
import * as S from '../shapes.ts';
import type { V3 } from '../shapes.ts';
import type { AnimState } from '../biped.ts';

export interface HeroModel {
  group: THREE.Group;
  /** Approximate height of the model, used to match gameplay scale. */
  height: number;
  character: Character;
  update(st: AnimState): void;
  /** Named points on the model for effects (weapon tip, hands, head, orbs...). */
  anchors: Record<string, THREE.Object3D>;
  /** Extra animated meshes (orbs, hawks) that live outside the skeleton. */
  extras: THREE.Object3D[];
}

export interface TeamPalette {
  main: number;
  dark: number;
  light: number;
}

export function teamPalette(team: number): TeamPalette {
  if (team === 0) return { main: 0x2f6fe0, dark: 0x1a3d8f, light: 0x8cc0ff };
  return { main: 0xd23c3c, dark: 0x7c1d24, light: 0xff9a86 };
}

/** A point on the model attached to a bone, given in absolute rest coordinates. */
export function makeAnchor(rb: RigBuilder, ch: Character, bone: string, abs: [number, number, number]): THREE.Object3D {
  const base = rb.restPos(bone);
  const o = new THREE.Object3D();
  o.position.set(abs[0] - base[0], abs[1] - base[1], abs[2] - base[2]);
  ch.bones[bone].add(o);
  return o;
}

/** Tapered ribbon along a curve, skinned along a bone chain (hair locks, scarves, tails, feathers). */
export function strand(rb: RigBuilder, chain: string[], pts: V3[], w0: number, w1: number, color: number | ((v: number) => number), axis: 'x' | 'z' = 'x', rows = 8, bucket: Bucket = 'cloth') {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const tmp = new THREE.Vector3();
  rb.cloth(
    chain,
    rows,
    2,
    (u, v) => {
      curve.getPoint(v, tmp);
      const w = (w0 + (w1 - w0) * v) * (u - 0.5);
      return axis === 'x' ? [tmp.x + w, tmp.y, tmp.z] : [tmp.x, tmp.y, tmp.z + w];
    },
    (_u, v) => (typeof color === 'number' ? color : color(v)),
    bucket,
  );
}

/** A curved skirt sector hanging from the hips: th measured from +z (front) towards +x. */
export function skirtPanel(rb: RigBuilder, chain: string[], th0: number, th1: number, yTop: number, drop: number, rTop: number, rBot: number, depth: number, color: (u: number, v: number) => number, wave = 0.04) {
  rb.cloth(
    chain,
    8,
    6,
    (u, v) => {
      const th = th0 + (th1 - th0) * u;
      const r = rTop + (rBot - rTop) * v + Math.sin(u * Math.PI * 4) * wave * v;
      return [Math.sin(th) * r, yTop - v * drop, Math.cos(th) * r * depth];
    },
    color,
  );
}

/** Keep a hand-held weapon bone pointing the way the arm chain points (cancels arm rotation). */
export function keepUpright(B: Record<string, THREE.Bone>, side: 'R' | 'L', extraX = 0, extraZ = 0) {
  const arm = B['arm' + side];
  const fore = B['fore' + side];
  const w = B.weapon;
  w.rotation.x = -(arm.rotation.x + fore.rotation.x) + extraX;
  w.rotation.z = -arm.rotation.z + extraZ;
}

/** Pair of glowing eyes on a head bone. */
export function eyes(rb: RigBuilder, bone: string, y: number, z: number, spacing: number, size: number, color: number, boost = 2.2) {
  for (const sx of [1, -1]) rb.part(bone, S.sphere(size, 1, 1.15, 0.6), color, { bucket: 'glow', p: [sx * spacing, y, z], boost, noOutline: true });
}
