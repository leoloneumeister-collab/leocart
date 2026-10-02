/** Shared humanoid skeleton and locomotion animation for all champions. +x is the character's left, +z forward. */
import * as THREE from 'three';
import type { Character } from './rig.ts';
import { RigBuilder } from './rig.ts';
import type { V3 } from './shapes.ts';

export interface BipedSpec {
  /** Hip joint height (leg length). */
  legLen: number;
  /** Fraction of the leg that is thigh. */
  thighFrac?: number;
  hipW: number;
  /** Hips to neck base. */
  torsoLen: number;
  shoulderW: number;
  /** Shoulder to wrist. */
  armLen: number;
  upperFrac?: number;
  neckLen?: number;
  /** Foot spread and forward offset for the feet. */
  footZ?: number;
}

export interface Joints {
  hip: V3;
  spine: V3;
  chest: V3;
  neck: V3;
  head: V3;
  shoulderL: V3;
  shoulderR: V3;
  elbowL: V3;
  elbowR: V3;
  wristL: V3;
  wristR: V3;
  hipL: V3;
  hipR: V3;
  kneeL: V3;
  kneeR: V3;
  ankleL: V3;
  ankleR: V3;
  spec: Required<BipedSpec>;
}

/** Create the standard 20 bone humanoid. Returns the rest joint positions for placing geometry. */
export function makeBiped(rb: RigBuilder, spec: BipedSpec): Joints {
  const s: Required<BipedSpec> = { thighFrac: 0.5, upperFrac: 0.5, neckLen: 0.28, footZ: 0.1, ...spec };
  const hipY = s.legLen;
  const neckY = hipY + s.torsoLen;
  const shY = neckY - 0.28;
  const knee = hipY - s.legLen * s.thighFrac;
  const ankleY = 0.26;
  const elbowY = shY - s.armLen * s.upperFrac;
  const wristY = shY - s.armLen;
  const J: Joints = {
    hip: [0, hipY, 0],
    spine: [0, hipY + s.torsoLen * 0.33, 0],
    chest: [0, hipY + s.torsoLen * 0.66, 0],
    neck: [0, neckY, 0],
    head: [0, neckY + s.neckLen, 0],
    shoulderL: [s.shoulderW, shY, 0],
    shoulderR: [-s.shoulderW, shY, 0],
    elbowL: [s.shoulderW, elbowY, 0],
    elbowR: [-s.shoulderW, elbowY, 0],
    wristL: [s.shoulderW, wristY, 0],
    wristR: [-s.shoulderW, wristY, 0],
    hipL: [s.hipW, hipY, 0],
    hipR: [-s.hipW, hipY, 0],
    kneeL: [s.hipW, knee, 0.02],
    kneeR: [-s.hipW, knee, 0.02],
    ankleL: [s.hipW, ankleY, 0],
    ankleR: [-s.hipW, ankleY, 0],
    spec: s,
  };
  rb.bone('root', null, 0, 0, 0)
    .bone('hips', 'root', ...J.hip)
    .bone('spine', 'hips', ...J.spine)
    .bone('chest', 'spine', ...J.chest)
    .bone('neck', 'chest', ...J.neck)
    .bone('head', 'neck', ...J.head)
    .bone('armL', 'chest', ...J.shoulderL)
    .bone('foreL', 'armL', ...J.elbowL)
    .bone('handL', 'foreL', ...J.wristL)
    .bone('armR', 'chest', ...J.shoulderR)
    .bone('foreR', 'armR', ...J.elbowR)
    .bone('handR', 'foreR', ...J.wristR)
    .bone('thighL', 'hips', ...J.hipL)
    .bone('shinL', 'thighL', ...J.kneeL)
    .bone('footL', 'shinL', ...J.ankleL)
    .bone('thighR', 'hips', ...J.hipR)
    .bone('shinR', 'thighR', ...J.kneeR)
    .bone('footR', 'shinR', ...J.ankleR);
  return J;
}

export interface AnimState {
  t: number;
  dt: number;
  /** 0..1 blend between idle and run. */
  moveK: number;
  /** Walk cycle phase in radians. */
  phase: number;
  speed: number;
  /** 0 when not attacking, else 0..1 progress through the swing. */
  atk: number;
  atkIdx: number;
  /** 0 when not casting, else 0..1. */
  cast: number;
  castSlot: number;
  /** Seconds since death, 0 while alive. */
  dead: number;
  dash: boolean;
  air: boolean;
  stun: boolean;
  recall: boolean;
  /** Forward and sideways acceleration lean in radians. */
  leanX: number;
  leanZ: number;
  hurt: number;
  /** Seconds since (re)spawn. */
  spawn: number;
}

export function newAnimState(): AnimState {
  return { t: 0, dt: 0.016, moveK: 0, phase: 0, speed: 0, atk: 0, atkIdx: 0, cast: 0, castSlot: 0, dead: 0, dash: false, air: false, stun: false, recall: false, leanX: 0, leanZ: 0, hurt: 0, spawn: 9 };
}

export interface PoseStyle {
  stride?: number;
  kneeBend?: number;
  bounce?: number;
  armSwing?: number;
  lean?: number;
  /** Rest angle of the arms away from the body. */
  armOut?: number;
  elbowRest?: number;
  hipSway?: number;
  breath?: number;
  /** How far the hips drop in the idle stance. */
  crouch?: number;
  /** Turn of the chest against the stride. */
  twist?: number;
  /** Feet spread at rest (rotation.z of the thighs). */
  stance?: number;
}

const D = {
  stride: 0.85,
  kneeBend: 1.0,
  bounce: 0.16,
  armSwing: 0.7,
  lean: 0.14,
  armOut: 0.12,
  elbowRest: 0.28,
  hipSway: 0.06,
  breath: 0.02,
  crouch: 0,
  twist: 0.12,
  stance: 0.05,
};

export function resetPose(c: Character) {
  for (const k in c.bones) {
    const b = c.bones[k];
    b.rotation.set(0, 0, 0);
    b.position.copy(c.rest[k]);
    b.scale.set(1, 1, 1);
  }
}

/**
 * Locomotion + idle + knock-up + death for the standard humanoid. Returns nothing: it writes bone
 * rotations. Champion code runs after this and overrides arms/weapons for attacks and casts.
 */
export function poseBiped(c: Character, st: AnimState, style: PoseStyle = {}) {
  const S = { ...D, ...style };
  const B = c.bones;
  const k = st.moveK;
  const a = st.phase;
  const sinA = Math.sin(a);
  const cosA = Math.cos(a);
  const breathe = Math.sin(st.t * 1.7);

  // Hips and spine
  const bob = Math.abs(sinA) * S.bounce * k;
  B.hips.position.y = c.rest.hips.y - S.crouch * (1 - k) + bob - 0.0;
  B.hips.rotation.z = sinA * S.hipSway * k;
  B.hips.rotation.y = -sinA * S.twist * 0.5 * k;
  B.spine.rotation.x = S.lean * k + st.leanX * 0.6 + breathe * S.breath * (1 - k);
  B.spine.rotation.y = sinA * S.twist * k;
  B.spine.rotation.z = st.leanZ * 0.6;
  B.chest.rotation.x = breathe * S.breath * 0.6 * (1 - k);
  B.neck.rotation.x = -S.lean * 0.5 * k - breathe * 0.01;
  B.head.rotation.y = Math.sin(st.t * 0.7) * 0.05 * (1 - k);

  // Legs
  const swingL = -sinA * S.stride * k;
  const swingR = sinA * S.stride * k;
  B.thighL.rotation.x = swingL + (1 - k) * 0.02;
  B.thighR.rotation.x = swingR + (1 - k) * 0.02;
  B.thighL.rotation.z = S.stance * (1 - k * 0.4);
  B.thighR.rotation.z = -S.stance * (1 - k * 0.4);
  B.shinL.rotation.x = (Math.max(0, cosA) * S.kneeBend * 1.15 + 0.1 * (1 - k)) * Math.max(k, 0.0) + S.crouch * 0.9 * (1 - k) + 0.05;
  B.shinR.rotation.x = (Math.max(0, -cosA) * S.kneeBend * 1.15 + 0.1 * (1 - k)) * Math.max(k, 0.0) + S.crouch * 0.9 * (1 - k) + 0.05;
  B.footL.rotation.x = -B.shinL.rotation.x * 0.45 - swingL * 0.35;
  B.footR.rotation.x = -B.shinR.rotation.x * 0.45 - swingR * 0.35;
  if (S.crouch > 0) {
    B.thighL.rotation.x -= S.crouch * 0.8 * (1 - k);
    B.thighR.rotation.x -= S.crouch * 0.8 * (1 - k);
  }

  // Arms (default swing, opposite to the legs)
  B.armL.rotation.x = sinA * S.armSwing * k + breathe * 0.02;
  B.armR.rotation.x = -sinA * S.armSwing * k - breathe * 0.02;
  B.armL.rotation.z = S.armOut + k * 0.04;
  B.armR.rotation.z = -S.armOut - k * 0.04;
  B.foreL.rotation.x = -S.elbowRest - k * 0.5 - Math.max(0, -sinA) * 0.25 * k;
  B.foreR.rotation.x = -S.elbowRest - k * 0.5 - Math.max(0, sinA) * 0.25 * k;

  // Airborne (knocked up) and dash
  if (st.air) {
    B.hips.position.y += 0.25;
    B.thighL.rotation.x = -0.5;
    B.thighR.rotation.x = 0.4;
    B.shinL.rotation.x = 0.8;
    B.shinR.rotation.x = 0.6;
    B.armL.rotation.x = -0.6;
    B.armR.rotation.x = -0.4;
    B.armL.rotation.z = 0.9;
    B.armR.rotation.z = -0.9;
  } else if (st.dash) {
    B.spine.rotation.x = 0.55;
    B.thighL.rotation.x = -0.9;
    B.thighR.rotation.x = 0.7;
    B.shinL.rotation.x = 0.2;
    B.shinR.rotation.x = 1.1;
    B.armL.rotation.x = 0.7;
    B.armR.rotation.x = -0.4;
  }
  if (st.stun && !st.air) {
    B.head.rotation.z = Math.sin(st.t * 14) * 0.12;
    B.spine.rotation.x += 0.15;
    B.armL.rotation.z = 0.5;
    B.armR.rotation.z = -0.5;
  }
  if (st.recall) {
    B.armL.rotation.x = -1.2;
    B.armR.rotation.x = -1.2;
    B.armL.rotation.z = 0.5;
    B.armR.rotation.z = -0.5;
    B.head.rotation.x = -0.25;
  }
  if (st.hurt > 0) {
    B.spine.rotation.x -= st.hurt * 0.25;
    B.head.rotation.x += st.hurt * 0.2;
  }
  // Death: fall backwards, then lie flat
  if (st.dead > 0) {
    const f = Math.min(1, st.dead / 0.55);
    const e = f * f * (3 - 2 * f);
    c.bones.root.rotation.x = -e * 1.45;
    c.bones.root.position.y = c.rest.root.y - e * 0.0;
    B.thighL.rotation.x = 0.4 * e;
    B.thighR.rotation.x = -0.3 * e;
    B.armL.rotation.z = 0.7 * e;
    B.armR.rotation.z = -0.7 * e;
  }
}

export function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) * (1 - x);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Attack curve: wind up (0..0.3), strike (0.3..0.5), recover (0.5..1). Returns -1..1 (negative = wind up). */
export function strike(t: number): number {
  if (t < 0.3) return -ease(t / 0.3);
  if (t < 0.5) return -1 + 2 * easeOut((t - 0.3) / 0.2);
  return 1 - ease((t - 0.5) / 0.5);
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
