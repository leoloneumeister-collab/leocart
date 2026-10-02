/** Minion and jungle monster models for the animated crowd. Original designs, chunky and readable from the game camera. */
import * as THREE from 'three';
import type { MinionType } from '../sim/types.ts';
import { ModelBuilder, P } from './crowd.ts';
import * as S from './shapes.ts';
import type { V3 } from './shapes.ts';

interface Pal {
  main: number;
  dark: number;
  light: number;
  glow: number;
}

const TEAM: Pal[] = [
  { main: 0x3a7ae8, dark: 0x1e3f94, light: 0x9cc8ff, glow: 0x6ab8ff },
  { main: 0xe04646, dark: 0x8a1e2c, light: 0xffa49a, glow: 0xff7a5a },
];

const STEEL = 0x8e9ab4;
const STEEL_DARK = 0x56607c;
const STEEL_LIGHT = 0xc4cee4;
const LEATHER = 0x7a5238;
const LEATHER_DARK = 0x45303a;
const SKIN = 0xf0c8a0;
const GOLD = 0xe8b848;
const WOOD = 0x8a6038;
const WOOD_DARK = 0x5a3e28;

type Model = { solid: THREE.BufferGeometry; glow: THREE.BufferGeometry | null };

/** Swing limbs rooted at a shoulder / hip pivot. */
function limbPair(b: ModelBuilder, part: [number, number], sh: V3, hand: V3, r0: number, r1: number, color: number, spread: number) {
  for (const sx of [1, -1]) {
    b.add(S.limb([sx * spread, sh[1], sh[2]], [sx * hand[0], hand[1], hand[2]], r0, r1), color, sx > 0 ? part[0] : part[1], { pivot: [sx * spread, sh[1], sh[2]] });
  }
}

function vanguard(pal: Pal): Model {
  const b = new ModelBuilder();
  // legs and boots
  for (const sx of [1, -1]) {
    const part = sx > 0 ? P.legL : P.legR;
    const pv: V3 = [sx * 0.3, 0.9, 0];
    b.add(S.limb([sx * 0.3, 0.9, 0], [sx * 0.3, 0.3, 0.02], 0.21, 0.18), LEATHER_DARK, part, { pivot: pv });
    b.add(S.plate(0.44, 0.34, 0.7, 0.12), LEATHER, part, { p: [sx * 0.3, 0.17, 0.12], pivot: pv });
    b.add(S.sphere(0.2, 1, 0.9, 1), STEEL, part, { p: [sx * 0.3, 0.62, 0.14], pivot: pv });
  }
  // torso, tunic, belt
  b.add(S.sphere(0.66, 1.05, 1.05, 0.88), pal.main, P.body, { p: [0, 1.4, 0], grad: [0.75, 1.15] });
  b.add(S.plate(0.9, 0.5, 0.2, 0.08), STEEL, P.body, { p: [0, 1.45, 0.52] });
  b.add(S.torus(0.62, 0.08, 20), LEATHER, P.body, { p: [0, 0.98, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.85, 1] });
  b.add(S.plate(0.24, 0.24, 0.1, 0.04), GOLD, P.body, { p: [0, 0.98, 0.58] });
  for (let i = 0; i < 3; i++) b.add(S.plate(0.28, 0.5, 0.06, 0.03), pal.dark, P.body, { p: [(i - 1) * 0.34, 0.74, 0.5 - Math.abs(i - 1) * 0.12], r: [0.25, 0, 0] });
  // team cloak down the back so the side is readable from above
  b.add(S.plate(0.9, 1.0, 0.07, 0.03), pal.main, P.flag, { p: [0, 1.3, -0.62], pivot: [0, 1.9, -0.6], grad: [0.7, 1.1] });
  b.add(S.plate(0.9, 0.12, 0.08, 0.03), pal.light, P.flag, { p: [0, 0.82, -0.62], pivot: [0, 1.9, -0.6] });
  // arms: left holds a shield, right a short sword
  limbPair(b, [P.armL, P.armR], [0, 1.78, 0], [0.7, 1.05, 0.12], 0.19, 0.16, pal.main, 0.62);
  for (const sx of [1, -1]) {
    const part = sx > 0 ? P.armL : P.armR;
    const pv: V3 = [sx * 0.62, 1.78, 0];
    b.add(S.sphere(0.3, 1, 0.85, 1), STEEL, part, { p: [sx * 0.68, 1.8, 0], pivot: pv });
    b.add(S.sphere(0.17), SKIN, part, { p: [sx * 0.72, 0.98, 0.14], pivot: pv });
  }
  const pvL: V3 = [0.62, 1.78, 0];
  b.add(S.cyl(0.58, 0.58, 0.1, 20), pal.main, P.armL, { p: [0.98, 1.2, 0.4], r: [Math.PI / 2, 0, 0.0], pivot: pvL });
  b.add(S.torus(0.58, 0.07, 20), STEEL_LIGHT, P.armL, { p: [0.98, 1.2, 0.46], pivot: pvL });
  b.add(S.sphere(0.16), GOLD, P.armL, { p: [0.98, 1.2, 0.52], pivot: pvL });
  const pvR: V3 = [-0.62, 1.78, 0];
  b.add(S.band([-0.72, 0.98, 0.14], [-0.72, 1.08, 0.45], 0.06, 0.06, 8), LEATHER_DARK, P.armR, { pivot: pvR });
  b.add(S.plate(0.4, 0.08, 0.08, 0.03), GOLD, P.armR, { p: [-0.72, 1.08, 0.45], pivot: pvR });
  b.add(S.blade(1.2, 0.2, 0.06, 0.0, 0.5), STEEL_LIGHT, P.armR, { p: [-0.72, 1.08, 0.5], r: [Math.PI / 2 - 0.15, 0, 0], pivot: pvR });
  // head with helmet and crest
  b.add(S.sphere(0.42, 1, 1.02, 1), SKIN, P.head, { p: [0, 2.05, 0.02], grad: [0.9, 1.08] });
  b.add(S.sphere(0.48, 1.02, 0.8, 1.02), STEEL, P.head, { p: [0, 2.2, -0.02] });
  b.add(S.plate(0.12, 0.38, 0.1, 0.04), STEEL_DARK, P.head, { p: [0, 2.05, 0.44] });
  b.add(S.torus(0.46, 0.05, 18), STEEL_DARK, P.head, { p: [0, 2.08, 0], r: [Math.PI / 2, 0, 0] });
  b.add(S.spike(0.12, 0.5), pal.light, P.flag, { p: [0, 2.58, -0.05], r: [-0.4, 0, 0], pivot: [0, 2.55, 0] });
  b.add(S.sphere(0.07), 0x2a2030, P.head, { p: [0.17, 2.02, 0.4] });
  b.add(S.sphere(0.07), 0x2a2030, P.head, { p: [-0.17, 2.02, 0.4] });
  return b.build();
}

function spellbinder(pal: Pal): Model {
  const b = new ModelBuilder();
  // hovering robe
  b.add(S.cyl(0.36, 0.74, 1.5, 18), pal.main, P.body, { p: [0, 1.05, 0], grad: [0.7, 1.15] });
  b.add(S.torus(0.74, 0.07, 22), GOLD, P.body, { p: [0, 0.32, 0], r: [Math.PI / 2, 0, 0] });
  b.add(S.torus(0.66, 0.06, 22), pal.dark, P.body, { p: [0, 0.5, 0], r: [Math.PI / 2, 0, 0] });
  b.add(S.torus(0.44, 0.09, 18), pal.light, P.body, { p: [0, 1.5, 0], r: [Math.PI / 2, 0, 0] });
  b.add(S.plate(0.34, 1.0, 0.07, 0.03), pal.light, P.body, { p: [0, 1.0, 0.6], r: [-0.18, 0, 0] });
  b.add(S.sphere(0.5, 1.15, 0.9, 0.95), pal.dark, P.body, { p: [0, 1.7, -0.02] });
  // team mantle on the back
  b.add(S.plate(0.8, 0.9, 0.07, 0.03), pal.dark, P.flag, { p: [0, 1.2, -0.6], pivot: [0, 1.8, -0.55] });
  // arms: right holds the staff, left is raised and glowing
  limbPair(b, [P.armUp, P.armR], [0, 1.72, 0], [0.5, 1.2, 0.2], 0.17, 0.14, pal.main, 0.46);
  b.add(S.sphere(0.15), SKIN, P.armUp, { p: [0.5, 1.2, 0.2], pivot: [0.46, 1.72, 0] });
  b.add(S.sphere(0.15), SKIN, P.armR, { p: [-0.5, 1.2, 0.2], pivot: [-0.46, 1.72, 0] });
  const pvR: V3 = [-0.46, 1.72, 0];
  b.add(S.band([-0.5, 0.3, 0.25], [-0.5, 2.5, 0.25], 0.07, 0.07, 8), WOOD_DARK, P.armR, { pivot: pvR });
  b.add(S.torus(0.2, 0.05, 14), GOLD, P.armR, { p: [-0.5, 2.55, 0.25], r: [0, 1.0, 0], pivot: pvR });
  // head and hat
  b.add(S.sphere(0.38, 1, 1.05, 1), SKIN, P.head, { p: [0, 2.05, 0.02], grad: [0.9, 1.08] });
  b.add(S.sphere(0.7, 1, 0.08, 1, 20), pal.dark, P.head, { p: [0, 2.28, 0.02], r: [-0.08, 0, 0] });
  b.add(S.cone(0.46, 0.85, 14), pal.main, P.flag, { p: [0, 2.7, -0.04], r: [-0.12, 0, 0], pivot: [0, 2.3, 0] });
  b.add(S.torus(0.44, 0.06, 16), GOLD, P.head, { p: [0, 2.34, 0], r: [Math.PI / 2, 0, 0] });
  const g = b;
  g.glow(S.icosa(0.22, 1), pal.glow, P.armR, { p: [-0.5, 2.62, 0.25], pivot: pvR, boost: 2.4 });
  g.glow(S.icosa(0.14, 1), pal.glow, P.armUp, { p: [0.55, 1.45, 0.38], pivot: [0.46, 1.72, 0], boost: 2.2 });
  g.glow(S.sphere(0.06), pal.glow, P.head, { p: [0.15, 2.06, 0.36], boost: 2.6 });
  g.glow(S.sphere(0.06), pal.glow, P.head, { p: [-0.15, 2.06, 0.36], boost: 2.6 });
  g.glow(S.sphere(0.1), pal.light, P.float, { p: [0, 2.0, -0.7], pivot: [0, 2, -0.7], boost: 2.0 });
  return b.build();
}

function siegeGolem(pal: Pal): Model {
  const b = new ModelBuilder();
  // cart chassis
  b.add(S.plate(1.6, 0.5, 2.5, 0.12), WOOD, P.body, { p: [0, 1.0, 0.1], grad: [0.8, 1.1] });
  b.add(S.plate(1.7, 0.1, 2.6, 0.05), STEEL_DARK, P.body, { p: [0, 1.28, 0.1] });
  for (const sz of [-0.7, 0.9]) b.add(S.plate(1.75, 0.18, 0.2, 0.05), STEEL, P.body, { p: [0, 1.0, sz] });
  // wheels
  for (const sx of [1, -1]) {
    for (const sz of [-0.85, 0.95]) {
      const pv: V3 = [sx * 0.95, 0.58, sz];
      b.add(S.cyl(0.58, 0.58, 0.22, 16), WOOD_DARK, P.wheel, { p: pv, r: [0, 0, Math.PI / 2], pivot: pv });
      b.add(S.torus(0.58, 0.06, 18), STEEL, P.wheel, { p: [sx * 0.95 + sx * 0.1, 0.58, sz], r: [0, Math.PI / 2, 0], pivot: pv });
      for (let i = 0; i < 4; i++) b.add(S.plate(0.1, 1.0, 0.1, 0.03), WOOD, P.wheel, { p: [sx * 0.95 + sx * 0.12, 0.58, sz], r: [(i * Math.PI) / 4, 0, 0], pivot: pv });
      b.add(S.sphere(0.14), GOLD, P.wheel, { p: [sx * 1.08, 0.58, sz], pivot: pv });
    }
  }
  // cannon
  b.add(S.plate(0.9, 0.3, 1.0, 0.1), STEEL_DARK, P.body, { p: [0, 1.46, 0.35] });
  const bp: V3 = [0, 1.75, 0.2];
  b.add(S.band([0, 0, 0], [0, 2.0, 0], 0.36, 0.3, 16, true), STEEL_DARK, P.recoil, { p: [0, 1.75, 0.0], r: [Math.PI / 2 - 0.22, 0, 0], pivot: bp });
  b.add(S.torus(0.34, 0.09, 16), GOLD, P.recoil, { p: [0, 1.75 + 0.42, 1.0], r: [0.22, 0, 0], pivot: bp });
  b.add(S.torus(0.38, 0.09, 16), GOLD, P.recoil, { p: [0, 1.75 + 0.08, 0.12], r: [0.22, 0, 0], pivot: bp });
  b.add(S.sphere(0.34), STEEL_DARK, P.recoil, { p: [0, 1.7, -0.08], pivot: bp });
  b.glow(S.sphere(0.2), pal.glow, P.recoil, { p: [0, 2.1, 1.6], pivot: bp, boost: 1.6 });
  // golem upper body behind the gun
  b.add(S.plate(1.3, 1.1, 1.0, 0.25), 0x8a8e96, P.body, { p: [0, 2.0, -0.75], grad: [0.7, 1.15] });
  b.add(S.plate(1.1, 0.5, 0.2, 0.08), pal.main, P.body, { p: [0, 1.85, -0.2], r: [-0.1, 0, 0] });
  b.add(S.plate(0.6, 0.55, 0.55, 0.15), 0x9a9ea6, P.head, { p: [0, 2.85, -0.7] });
  b.glow(S.plate(0.4, 0.1, 0.05, 0.02), pal.glow, P.head, { p: [0, 2.9, -0.4], boost: 2.4 });
  for (const sx of [1, -1]) {
    const part = sx > 0 ? P.armL : P.armR;
    const pv: V3 = [sx * 0.85, 2.4, -0.75];
    b.add(S.limb([sx * 0.85, 2.4, -0.75], [sx * 1.0, 1.65, -0.05], 0.3, 0.26), 0x8a8e96, part, { pivot: pv });
    b.add(S.sphere(0.34), 0x9a9ea6, part, { p: [sx * 1.0, 1.55, 0.0], pivot: pv });
  }
  // banner pole and flag in team colour
  b.add(S.band([0.62, 1.2, -1.1], [0.62, 3.9, -1.1], 0.06, 0.06, 8), WOOD_DARK, P.body);
  b.add(S.plate(0.9, 0.7, 0.05, 0.02), pal.main, P.flag, { p: [1.08, 3.45, -1.1], pivot: [0.65, 3.45, -1.1] });
  b.add(S.plate(0.9, 0.12, 0.06, 0.02), pal.light, P.flag, { p: [1.08, 3.15, -1.1], pivot: [0.65, 3.45, -1.1] });
  for (let i = 0; i < 3; i++) b.add(S.sphere(0.22), STEEL_DARK, P.body, { p: [-0.5 + i * 0.3, 1.45, 0.9 + (i % 2) * 0.2] });
  return b.build();
}

function colossus(pal: Pal): Model {
  const b = new ModelBuilder();
  for (const sx of [1, -1]) {
    const part = sx > 0 ? P.legL : P.legR;
    const pv: V3 = [sx * 0.55, 1.6, 0];
    b.add(S.limb([sx * 0.55, 1.6, 0], [sx * 0.55, 0.45, 0.04], 0.4, 0.34), LEATHER_DARK, part, { pivot: pv });
    b.add(S.plate(0.78, 1.0, 0.7, 0.18), STEEL, part, { p: [sx * 0.55, 0.9, 0.14], pivot: pv });
    b.add(S.sphere(0.34, 1, 0.9, 1), STEEL_DARK, part, { p: [sx * 0.55, 1.15, 0.28], pivot: pv });
    b.add(S.plate(0.86, 0.46, 1.2, 0.16), STEEL_DARK, part, { p: [sx * 0.55, 0.23, 0.22], pivot: pv });
  }
  b.add(S.band([0, 1.5, 0], [0, 1.95, 0], 0.95, 0.9, 20), LEATHER_DARK, P.body, { s: [1, 1, 0.8] });
  b.add(S.sphere(1.05, 1.15, 1.0, 0.9), STEEL, P.body, { p: [0, 2.55, 0], grad: [0.72, 1.15] });
  b.add(S.plate(1.3, 0.8, 0.3, 0.12), STEEL_LIGHT, P.body, { p: [0, 2.7, 0.88], r: [-0.1, 0, 0] });
  b.add(S.band([0, 1.5, 0.0], [0, 2.0, 0.0], 0.9, 0.9, 20), pal.main, P.body, { p: [0, 0, 0.0], s: [1.04, 0.6, 0.84] });
  b.glow(S.gem(0.24, 1.3), pal.glow, P.body, { p: [0, 2.7, 1.05], boost: 2.4 });
  b.add(S.plate(1.5, 1.4, 0.1, 0.05), pal.main, P.flag, { p: [0, 2.3, -1.0], pivot: [0, 3.0, -0.95], grad: [0.7, 1.1] });
  b.add(S.plate(1.5, 0.16, 0.12, 0.05), pal.light, P.flag, { p: [0, 1.6, -1.0], pivot: [0, 3.0, -0.95] });
  // arms: giant fist and warhammer
  for (const sx of [1, -1]) {
    const part = sx > 0 ? P.armL : P.armR;
    const sh: V3 = [sx * 1.2, 3.1, 0];
    b.add(S.sphere(0.62, 1, 0.8, 1), pal.main, part, { p: [sx * 1.25, 3.25, 0], pivot: sh });
    for (let i = 0; i < 2; i++) b.add(S.spike(0.14, 0.6), STEEL_LIGHT, part, { p: [sx * (1.4 + i * 0.12), 3.55 - i * 0.1, -0.1 + i * 0.25], r: [0, 0, -sx * (0.6 + i * 0.3)], pivot: sh });
    b.add(S.limb(sh, [sx * 1.3, 1.5, 0.2], 0.4, 0.34), LEATHER, part, { pivot: sh });
    b.add(S.band([sx * 1.3, 1.6, 0.2], [sx * 1.3, 2.3, 0.2], 0.46, 0.4, 14, true), STEEL, part, { pivot: sh });
    b.add(S.sphere(0.4), STEEL_DARK, part, { p: [sx * 1.3, 1.35, 0.25], pivot: sh });
  }
  const pvR: V3 = [-1.2, 3.1, 0];
  b.add(S.band([-1.3, 1.1, 0.3], [-1.3, 3.4, 0.3], 0.11, 0.11, 10), WOOD_DARK, P.armR, { pivot: pvR });
  b.add(S.plate(1.3, 0.8, 0.8, 0.14), STEEL, P.armR, { p: [-1.3, 3.5, 0.3], pivot: pvR });
  b.glow(S.plate(1.0, 0.07, 0.05, 0.02), pal.glow, P.armR, { p: [-1.3, 3.6, 0.72], pivot: pvR, boost: 2.0 });
  // head: horned helm
  b.add(S.sphere(0.5, 1, 1.05, 1.05), STEEL_DARK, P.head, { p: [0, 3.55, 0.06] });
  b.add(S.plate(0.62, 0.4, 0.22, 0.08), 0x2a2434, P.head, { p: [0, 3.5, 0.48] });
  b.glow(S.plate(0.4, 0.07, 0.05, 0.02), pal.glow, P.head, { p: [0, 3.55, 0.6], boost: 2.6 });
  for (const sx of [1, -1]) b.add(S.taperTube([[sx * 0.4, 3.75, 0.0], [sx * 0.7, 3.95, 0.05], [sx * 0.85, 4.35, 0.12]], 0.13, 0.03, 8, 12), 0xe6dcc2, P.head);
  return b.build();
}

export function buildMinionModel(type: MinionType, team: number): Model {
  const pal = TEAM[team === 1 ? 1 : 0];
  switch (type) {
    case 'melee':
      return vanguard(pal);
    case 'caster':
      return spellbinder(pal);
    case 'cannon':
      return siegeGolem(pal);
    default:
      return colossus(pal);
  }
}

// ------------------------------------------------------------------ jungle monsters (neutral palette)

const FUR = 0x8a5c3e;
const FUR_DARK = 0x4e3224;
const FUR_LIGHT = 0xc09a70;
const MOSS = 0x74b84e;
const AMBER = 0xffc04a;
const TUSK = 0xf0e6c8;

function ape(scale: number, glowCol: number): Model {
  const b = new ModelBuilder();
  for (const sx of [1, -1]) {
    const part = sx > 0 ? P.legL : P.legR;
    const pv: V3 = [sx * 0.55, 1.2, 0];
    b.add(S.limb([sx * 0.55, 1.2, 0], [sx * 0.6, 0.3, 0.1], 0.42, 0.36), FUR_DARK, part, { pivot: pv });
    b.add(S.sphere(0.4, 1.1, 0.7, 1.4), FUR_DARK, part, { p: [sx * 0.6, 0.22, 0.25], pivot: pv });
    for (let i = 0; i < 3; i++) b.add(S.spike(0.08, 0.3), TUSK, part, { p: [sx * 0.6 + (i - 1) * 0.2, 0.2, 0.62], r: [Math.PI / 2, 0, 0], pivot: pv });
  }
  b.add(S.sphere(0.95, 1.15, 1.0, 0.95), FUR, P.body, { p: [0, 1.85, -0.1], grad: [0.7, 1.15] });
  b.add(S.sphere(0.6, 1.0, 0.9, 0.8), FUR_LIGHT, P.body, { p: [0, 1.7, 0.45] });
  b.add(S.sphere(0.8, 1.2, 0.35, 0.9), MOSS, P.body, { p: [0, 2.6, -0.45], r: [0.4, 0, 0] });
  b.add(S.sphere(0.5, 1.3, 0.3, 0.6), MOSS, P.body, { p: [-0.5, 2.2, -0.9], r: [0.2, 0, 0] });
  for (let i = 0; i < 4; i++) b.add(S.spike(0.1, 0.4), FUR_DARK, P.body, { p: [(i - 1.5) * 0.35, 2.5, -0.85], r: [-0.8, 0, 0] });
  for (const sx of [1, -1]) {
    const part = sx > 0 ? P.armL : P.armR;
    const sh: V3 = [sx * 1.05, 2.45, 0];
    b.add(S.limb(sh, [sx * 1.25, 0.8, 0.45], 0.5, 0.46), FUR, part, { pivot: sh });
    b.add(S.sphere(0.52, 1, 0.95, 1), FUR_DARK, part, { p: [sx * 1.25, 0.6, 0.5], pivot: sh });
    for (let i = 0; i < 3; i++) b.add(S.spike(0.1, 0.4), TUSK, part, { p: [sx * 1.25 + (i - 1) * 0.22, 0.45, 0.95], r: [Math.PI / 2, 0, 0], pivot: sh });
  }
  b.add(S.sphere(0.5, 1, 0.95, 1), FUR_DARK, P.head, { p: [0, 2.75, 0.45] });
  b.add(S.sphere(0.3, 1.2, 0.8, 0.8), FUR_LIGHT, P.head, { p: [0, 2.6, 0.82] });
  for (const sx of [1, -1]) {
    b.add(S.spike(0.08, 0.4), TUSK, P.head, { p: [sx * 0.24, 2.45, 0.95], r: [-0.3, 0, sx * -0.3] });
    b.glow(S.sphere(0.09, 1, 1, 0.6), glowCol, P.head, { p: [sx * 0.2, 2.92, 0.8], boost: 2.8 });
  }
  const m = b.build();
  m.solid.scale(scale, scale, scale);
  m.glow?.scale(scale, scale, scale);
  return m;
}

function thornback(): Model {
  const b = new ModelBuilder();
  // quadruped: front pair on armL/armR, rear on legL/legR
  for (const sx of [1, -1]) {
    for (const [z, pl, pr] of [[0.9, P.armL, P.armR], [-0.9, P.legR, P.legL]] as [number, number, number][]) {
      const part = sx > 0 ? pl : pr;
      const pv: V3 = [sx * 0.6, 1.1, z];
      b.add(S.limb([sx * 0.6, 1.1, z], [sx * 0.62, 0.2, z + 0.1], 0.28, 0.2), FUR_DARK, part, { pivot: pv });
      b.add(S.sphere(0.24, 1, 0.6, 1.3), 0x2a2a20, part, { p: [sx * 0.62, 0.12, z + 0.2], pivot: pv });
    }
  }
  b.add(S.sphere(1.0, 0.95, 0.85, 1.4), FUR, P.body, { p: [0, 1.55, 0], grad: [0.7, 1.15] });
  b.add(S.sphere(0.7, 1, 0.8, 1), FUR_LIGHT, P.body, { p: [0, 1.3, 0.55] });
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) b.add(S.spike(0.14, 0.9 - r * 0.15), 0xb06a3a, P.body, { p: [(i - 1.5) * 0.36, 2.3 - r * 0.05, -0.8 + r * 0.7], r: [-0.25 + r * 0.1, 0, (i - 1.5) * 0.25] });
  b.add(S.sphere(0.55, 1, 0.9, 1.1), FUR_DARK, P.head, { p: [0, 1.55, 1.3] });
  b.add(S.sphere(0.32, 1.1, 0.8, 1), FUR_LIGHT, P.head, { p: [0, 1.4, 1.75] });
  for (const sx of [1, -1]) {
    b.add(S.spike(0.09, 0.55), TUSK, P.head, { p: [sx * 0.26, 1.28, 1.8], r: [-1.1, 0, sx * 0.3] });
    b.glow(S.sphere(0.09, 1, 1, 0.6), AMBER, P.head, { p: [sx * 0.24, 1.78, 1.65], boost: 2.8 });
    b.add(S.spike(0.1, 0.35), FUR_DARK, P.head, { p: [sx * 0.38, 2.0, 1.15], r: [0, 0, -sx * 0.5] });
  }
  return b.build();
}

function sprite(): Model {
  const b = new ModelBuilder();
  b.add(S.sphere(0.55, 1, 1.1, 1), 0x7a4a6a, P.body, { p: [0, 1.4, 0], grad: [0.7, 1.2] });
  b.add(S.sphere(0.4, 1, 1, 1), FUR_LIGHT, P.body, { p: [0, 1.05, 0.25] });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.add(S.spike(0.09, 0.5), 0xb06a3a, P.body, { p: [Math.cos(a) * 0.45, 1.5 + Math.sin(a) * 0.25, -0.15 - Math.abs(Math.sin(a)) * 0.2], r: [-0.6, 0, -Math.cos(a) * 0.7] });
  }
  for (const sx of [1, -1]) {
    const part = P.flag;
    b.add(S.extrudeShape([[0, 0], [0.5, 0.2], [0.9, 0.7], [0.55, 0.95], [0.1, 0.5]], 0.03, 0.01), 0x9ad45a, part, { p: [sx * 0.3, 1.5, -0.1], r: [0.2, sx * 0.7, sx * -0.5 + (sx > 0 ? 0 : Math.PI)], pivot: [sx * 0.3, 1.5, 0] });
    b.glow(S.sphere(0.08, 1, 1, 0.6), AMBER, P.head, { p: [sx * 0.18, 1.5, 0.45], boost: 2.8 });
  }
  b.glow(S.sphere(0.14), 0xffe070, P.float, { p: [0, 2.15, 0], pivot: [0, 2.15, 0], boost: 2.0 });
  return b.build();
}

function crystalGolem(): Model {
  const b = new ModelBuilder();
  const ROCK = 0x7a7480;
  const CRYSTAL = 0x7ad8ff;
  for (const sx of [1, -1]) {
    const part = sx > 0 ? P.legL : P.legR;
    const pv: V3 = [sx * 0.7, 1.5, 0];
    b.add(S.limb([sx * 0.7, 1.5, 0], [sx * 0.75, 0.4, 0.05], 0.55, 0.48), ROCK, part, { pivot: pv });
    b.add(S.plate(1.0, 0.5, 1.3, 0.2), 0x5a5664, part, { p: [sx * 0.75, 0.25, 0.2], pivot: pv });
  }
  b.add(S.icosa(1.4, 1), ROCK, P.body, { p: [0, 2.7, 0], s: [1.0, 1.0, 0.8], grad: [0.65, 1.15] });
  b.add(S.icosa(0.7, 1), 0x8a8494, P.body, { p: [0.4, 3.2, 0.6] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.glow(S.cone(0.24, 1.2 + (i % 3) * 0.4, 6), CRYSTAL, P.body, { p: [Math.cos(a) * 0.9, 3.6 + (i % 2) * 0.3, Math.sin(a) * 0.7 - 0.5], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], boost: 1.9 });
  }
  b.glow(S.icosa(0.34, 1), CRYSTAL, P.body, { p: [0, 2.7, 0.85], boost: 2.5 });
  for (const sx of [1, -1]) {
    const part = sx > 0 ? P.armL : P.armR;
    const sh: V3 = [sx * 1.3, 3.2, 0];
    b.add(S.icosa(0.7, 1), ROCK, part, { p: [sx * 1.4, 3.3, 0], pivot: sh });
    b.add(S.limb(sh, [sx * 1.6, 1.4, 0.4], 0.5, 0.44), ROCK, part, { pivot: sh });
    b.add(S.icosa(0.62, 1), 0x8a8494, part, { p: [sx * 1.6, 1.15, 0.5], pivot: sh });
    b.glow(S.cone(0.14, 0.7, 6), CRYSTAL, part, { p: [sx * 1.9, 1.3, 0.55], r: [0, 0, -sx * 1.3], pivot: sh, boost: 1.9 });
  }
  b.add(S.icosa(0.55, 1), 0x8a8494, P.head, { p: [0, 4.1, 0.35] });
  for (const sx of [1, -1]) b.glow(S.sphere(0.1, 1, 1, 0.6), CRYSTAL, P.head, { p: [sx * 0.22, 4.15, 0.8], boost: 2.8 });
  return b.build();
}

export const MONSTER_KEYS = ['Moss Brute', 'Moss Pup', 'Thornback', 'Thorn Sprite', 'Crystal Golem'] as const;

export function buildMonsterModel(name: string): Model {
  switch (name) {
    case 'Moss Brute':
      return ape(1, AMBER);
    case 'Moss Pup':
      return ape(0.58, 0xffe070);
    case 'Thornback':
      return thornback();
    case 'Thorn Sprite':
      return sprite();
    default:
      return crystalGolem();
  }
}
