/** Procedural models for champions, minions, structures and monsters. Everything faces +z. */
import * as THREE from 'three';
import type { ChampionDef } from '../data/champions.ts';
import type { MinionType } from '../sim/types.ts';
import { G, mergeParts, mesh, std, teamColor, teamDark } from './geo.ts';
import type { Part } from './geo.ts';

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** Materials that glow, so views can flash them. */
  glow: THREE.MeshStandardMaterial[];
  height: number;
}

interface HumanoidSpec {
  h: number;
  torso: [number, number, number];
  legH: number;
  legW: number;
  armW: number;
  armL: number;
  headR: number;
  torsoColor: number;
  legColor: number;
  armColor: number;
  headColor: number;
  armGap?: number;
}

function limb(w: number, len: number, color: number, d = w): THREE.Group {
  const g = new THREE.Group();
  const m = mesh(G.box(w, len, d), std(color, 0.7, 0.15), 0, -len / 2, 0);
  g.add(m);
  return g;
}

function humanoid(o: HumanoidSpec): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const [tw, th, td] = o.torso;
  const legL = limb(o.legW, o.legH, o.legColor);
  const legR = limb(o.legW, o.legH, o.legColor);
  legL.position.set(-tw * 0.26, o.legH, 0);
  legR.position.set(tw * 0.26, o.legH, 0);
  body.add(legL, legR);
  const torso = mesh(G.box(tw, th, td), std(o.torsoColor, 0.65, 0.2), 0, o.legH + th / 2, 0);
  body.add(torso);
  const head = mesh(G.sph(o.headR, 12), std(o.headColor, 0.6, 0.1), 0, o.legH + th + o.headR * 0.85, 0);
  body.add(head);
  const sx = tw / 2 + o.armW / 2 + (o.armGap ?? 0.05);
  const sy = o.legH + th - o.armW * 0.6;
  const armL = limb(o.armW, o.armL, o.armColor);
  const armR = limb(o.armW, o.armL, o.armColor);
  armL.position.set(-sx, sy, 0);
  armR.position.set(sx, sy, 0);
  body.add(armL, armR);
  return { root, body, legL, legR, armL, armR, glow: [], height: o.h };
}

function glowMat(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, flatShading: true });
}

export function buildChampion(def: ChampionDef): Rig {
  const L = def.look;
  switch (L.build) {
    case 'brute': {
      const rig = humanoid({ h: def.height, torso: [2.3, 1.9, 1.4], legH: 1.5, legW: 0.85, armW: 0.75, armL: 1.7, headR: 0.62, torsoColor: L.primary, legColor: 0x4a4e58, armColor: L.primary, headColor: 0x9a9fa9 });
      const accent = glowMat(L.accent, 1.2);
      rig.glow.push(accent);
      rig.body.add(mesh(G.box(0.9, 0.18, 0.5), accent, 0, 3.35, 0.48)); // visor
      rig.body.add(mesh(G.box(2.4, 0.25, 1.5), std(L.secondary, 0.8), 0, 2.15, 0)); // belt
      for (const sx of [-1, 1]) rig.body.add(mesh(G.sph(0.78, 10), std(0x6c717b, 0.5, 0.4), sx * 1.5, 3.3, 0));
      const hornL = mesh(G.cone(0.14, 0.7, 6), std(0xd8d0b8), -0.5, 4.1, 0);
      hornL.rotation.z = 0.5;
      const hornR = mesh(G.cone(0.14, 0.7, 6), std(0xd8d0b8), 0.5, 4.1, 0);
      hornR.rotation.z = -0.5;
      rig.body.add(hornL, hornR);
      // Hammer in right hand
      const hammer = new THREE.Group();
      hammer.add(mesh(G.cyl(0.11, 0.11, 2.8, 8), std(0x5a3a28), 0, 0.6, 0));
      hammer.add(mesh(G.box(1.5, 0.95, 0.95), std(0x80858f, 0.4, 0.5), 0, 2.1, 0));
      hammer.add(mesh(G.box(1.6, 0.18, 1.05), accent, 0, 2.1, 0));
      hammer.position.set(0, -1.5, 0.3);
      hammer.rotation.x = Math.PI / 2.4;
      rig.armR.add(hammer);
      // Shield on left arm
      const shield = mesh(G.box(0.2, 2.0, 1.5), std(L.secondary, 0.6, 0.3), -0.5, -0.9, 0.2);
      shield.add(mesh(G.box(0.24, 0.5, 0.5), accent, 0, 0, 0));
      rig.armL.add(shield);
      return rig;
    }
    case 'robe': {
      const rig = humanoid({ h: def.height, torso: [1.5, 1.5, 1.0], legH: 0.5, legW: 0.5, armW: 0.45, armL: 1.5, headR: 0.5, torsoColor: L.primary, legColor: L.secondary, armColor: L.primary, headColor: 0xf0cfa8, armGap: 0.15 });
      rig.legL.visible = false;
      rig.legR.visible = false;
      const robe = mesh(G.cone(1.35, 2.9, 12), std(L.primary, 0.85), 0, 1.5, 0);
      robe.scale.set(1, 1, 0.85);
      rig.body.add(robe);
      rig.body.add(mesh(G.cyl(0.95, 1.5, 0.35, 12), std(L.secondary, 0.8), 0, 0.2, 0));
      const hat = mesh(G.cone(0.78, 1.5, 10), std(L.secondary, 0.8), 0, 4.25, -0.1);
      hat.rotation.x = -0.18;
      rig.body.add(hat);
      rig.body.add(mesh(G.cyl(1.0, 1.0, 0.1, 12), std(L.secondary, 0.8), 0, 3.5, 0));
      const accent = glowMat(L.accent, 1.8);
      rig.glow.push(accent);
      rig.body.add(mesh(G.torus(0.62, 0.07, 14), accent, 0, 2.5, 0.0).rotateX(Math.PI / 2));
      const staff = new THREE.Group();
      staff.add(mesh(G.cyl(0.08, 0.1, 3.8, 6), std(0x6a4a2a), 0, 0.2, 0));
      const orb = mesh(G.sph(0.42, 10), accent, 0, 2.3, 0);
      staff.add(orb);
      staff.position.set(0, -1.2, 0.35);
      rig.armR.add(staff);
      return rig;
    }
    case 'archer': {
      const rig = humanoid({ h: def.height, torso: [1.35, 1.7, 0.9], legH: 1.6, legW: 0.5, armW: 0.42, armL: 1.6, headR: 0.5, torsoColor: L.primary, legColor: L.secondary, armColor: L.secondary, headColor: 0xe8c9a0 });
      const accent = glowMat(L.accent, 1.0);
      rig.glow.push(accent);
      const hood = mesh(G.cone(0.78, 1.3, 8), std(L.primary, 0.85), 0, 4.05, -0.05);
      hood.rotation.x = -0.2;
      rig.body.add(hood);
      const cloak = mesh(G.cone(1.1, 2.4, 8), std(L.secondary, 0.9), 0, 2.2, -0.4);
      cloak.scale.set(1, 1, 0.5);
      rig.body.add(cloak);
      rig.body.add(mesh(G.box(0.4, 0.4, 0.2), accent, 0, 3.0, 0.5));
      // Quiver
      rig.body.add(mesh(G.cyl(0.25, 0.25, 1.4, 8), std(0x6a4a2a), 0.4, 3.3, -0.65));
      // Bow in left arm
      const bow = new THREE.Group();
      const arc = mesh(new THREE.TorusGeometry(1.15, 0.07, 6, 18, Math.PI), std(0x7a5a30), 0, 0, 0);
      arc.rotation.z = Math.PI / 2;
      bow.add(arc);
      bow.add(mesh(G.cyl(0.015, 0.015, 2.3, 4), std(0xf0e8d0), 0.0, 0, 0));
      bow.position.set(-0.1, -1.4, 0.6);
      bow.rotation.set(0, 0.2, 0);
      rig.armL.add(bow);
      return rig;
    }
    case 'golem': {
      const rig = humanoid({ h: def.height, torso: [3.0, 2.5, 2.0], legH: 1.7, legW: 1.2, armW: 1.1, armL: 2.2, headR: 0.7, torsoColor: L.secondary, legColor: 0x5a4a38, armColor: L.primary, headColor: 0x7a6a56, armGap: 0.1 });
      const accent = glowMat(L.accent, 1.1);
      rig.glow.push(accent);
      for (const sx of [-1, 1]) {
        rig.body.add(mesh(G.dodeca(0.95), std(0x6e7a5a, 0.95), sx * 1.9, 4.0, 0));
        const fist = mesh(G.dodeca(0.9), std(0x7a7a72, 0.9), 0, 0, 0);
        fist.position.set(0, -2.3, 0);
        (sx < 0 ? rig.armL : rig.armR).add(fist);
      }
      // Bark and moss patches
      rig.body.add(mesh(G.box(2.2, 0.35, 0.3), std(L.primary, 0.9), 0, 3.2, 1.05));
      rig.body.add(mesh(G.box(0.4, 1.4, 0.3), std(0x3e2e20, 1), -0.8, 2.9, 1.05));
      rig.body.add(mesh(G.box(0.4, 1.4, 0.3), std(0x3e2e20, 1), 0.8, 2.9, 1.05));
      rig.body.add(mesh(G.sph(0.35, 8), accent, 0, 3.0, 1.1));
      // Leaf crown
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const leaf = mesh(G.cone(0.2, 0.9, 5), std(0x58a040, 0.9), Math.cos(a) * 0.55, 5.0, Math.sin(a) * 0.55);
        leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        rig.body.add(leaf);
      }
      return rig;
    }
    case 'rogue': {
      const rig = humanoid({ h: def.height, torso: [1.2, 1.6, 0.8], legH: 1.55, legW: 0.45, armW: 0.38, armL: 1.55, headR: 0.46, torsoColor: L.primary, legColor: 0x1c1a24, armColor: L.primary, headColor: 0xd8b898 });
      const accent = glowMat(L.accent, 2.0);
      rig.glow.push(accent);
      const hood = mesh(G.cone(0.7, 1.2, 8), std(0x18141f, 0.9), 0, 3.95, -0.08);
      hood.rotation.x = -0.35;
      rig.body.add(hood);
      rig.body.add(mesh(G.box(0.5, 0.1, 0.25), accent, 0, 3.55, 0.4)); // eyes
      const scarf = mesh(G.box(0.5, 0.2, 1.8), std(L.secondary, 0.9), 0, 3.0, -1.0);
      scarf.rotation.x = 0.3;
      rig.body.add(scarf);
      rig.body.add(mesh(G.box(1.3, 0.2, 0.9), accent, 0, 2.2, 0));
      for (const [arm, sx] of [[rig.armR, 1], [rig.armL, -1]] as const) {
        const dagger = new THREE.Group();
        dagger.add(mesh(G.box(0.14, 0.14, 1.5), accent, 0, 0, 0.7));
        dagger.add(mesh(G.box(0.6, 0.1, 0.2), std(0x222222), 0, 0, 0));
        dagger.position.set(sx * 0.05, -1.5, 0.2);
        arm.add(dagger);
      }
      return rig;
    }
  }
}

// ----------------------------------------------------------------- minions

export function buildMinionGeometry(type: MinionType, team: number): THREE.BufferGeometry {
  const tc = teamColor(team);
  const td = teamDark(team);
  const parts: Part[] = [];
  const skin = 0xd8b890;
  switch (type) {
    case 'melee':
      parts.push(
        { geo: G.box(0.4, 0.9, 0.45), color: 0x3a3a44, p: [-0.28, 0.45, 0] },
        { geo: G.box(0.4, 0.9, 0.45), color: 0x3a3a44, p: [0.28, 0.45, 0] },
        { geo: G.box(1.15, 1.0, 0.7), color: td, p: [0, 1.35, 0] },
        { geo: G.sph(0.4, 8), color: skin, p: [0, 2.1, 0] },
        { geo: G.cyl(0.43, 0.45, 0.3, 8), color: 0x8a8f99, p: [0, 2.28, 0] },
        { geo: G.box(0.28, 0.28, 1.3), color: 0xc8ccd4, p: [0.75, 1.5, 0.5] },
        { geo: G.box(0.14, 1.1, 0.8), color: tc, p: [-0.75, 1.3, 0.25] },
        { geo: G.box(0.4, 0.4, 0.3), color: tc, p: [0, 1.5, 0.4], glow: true },
      );
      break;
    case 'caster':
      parts.push(
        { geo: G.cone(0.7, 1.7, 8), color: td, p: [0, 0.85, 0] },
        { geo: G.sph(0.34, 8), color: skin, p: [0, 1.9, 0] },
        { geo: G.cone(0.42, 0.8, 8), color: tc, p: [0, 2.5, 0] },
        { geo: G.cyl(0.05, 0.06, 2.1, 5), color: 0x6a4a2a, p: [0.6, 1.1, 0.35] },
        { geo: G.sph(0.22, 8), color: tc, p: [0.6, 2.25, 0.35], glow: true },
      );
      break;
    case 'cannon':
      parts.push(
        { geo: G.box(1.9, 0.8, 1.7), color: 0x4a4a52, p: [0, 0.8, 0] },
        { geo: G.cyl(0.55, 0.55, 0.3, 10), color: 0x2a2a30, p: [-1.05, 0.55, 0.5], r: [0, 0, Math.PI / 2] },
        { geo: G.cyl(0.55, 0.55, 0.3, 10), color: 0x2a2a30, p: [1.05, 0.55, 0.5], r: [0, 0, Math.PI / 2] },
        { geo: G.cyl(0.55, 0.65, 2.1, 10), color: td, p: [0, 1.65, 0.4], r: [Math.PI / 2.8, 0, 0] },
        { geo: G.cyl(0.7, 0.7, 0.3, 10), color: tc, p: [0, 2.15, 1.25], r: [Math.PI / 2.8, 0, 0], glow: true },
        { geo: G.sph(0.4, 8), color: skin, p: [-0.4, 1.7, -0.5] },
        { geo: G.box(0.7, 0.9, 0.5), color: tc, p: [-0.4, 1.2, -0.5] },
      );
      break;
    case 'super':
      parts.push(
        { geo: G.box(0.9, 1.4, 0.9), color: 0x3a3a44, p: [-0.65, 0.7, 0] },
        { geo: G.box(0.9, 1.4, 0.9), color: 0x3a3a44, p: [0.65, 0.7, 0] },
        { geo: G.box(2.6, 1.8, 1.5), color: td, p: [0, 2.3, 0] },
        { geo: G.dodeca(0.9), color: 0x8a8f99, p: [-1.7, 3.0, 0] },
        { geo: G.dodeca(0.9), color: 0x8a8f99, p: [1.7, 3.0, 0] },
        { geo: G.box(0.8, 1.9, 0.8), color: td, p: [-1.8, 1.7, 0.2] },
        { geo: G.box(0.8, 1.9, 0.8), color: td, p: [1.8, 1.7, 0.2] },
        { geo: G.dodeca(0.8), color: 0x5a5f69, p: [-1.8, 0.7, 0.3] },
        { geo: G.dodeca(0.8), color: 0x5a5f69, p: [1.8, 0.7, 0.3] },
        { geo: G.sph(0.65, 8), color: skin, p: [0, 3.65, 0] },
        { geo: G.oct(0.55), color: tc, p: [0, 2.4, 0.85], glow: true },
        { geo: G.cone(0.2, 0.9, 5), color: tc, p: [-0.4, 4.2, 0], glow: true },
        { geo: G.cone(0.2, 0.9, 5), color: tc, p: [0.4, 4.2, 0], glow: true },
      );
      break;
  }
  return mergeParts(parts);
}

// ----------------------------------------------------------------- structures

export interface StructureRig {
  root: THREE.Group;
  orb: THREE.Mesh | null;
  spin: THREE.Object3D[];
  glow: THREE.MeshStandardMaterial[];
  alive: THREE.Group;
  rubble: THREE.Group;
}

function rubble(r: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = std(color, 1);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + i * 0.7;
    const d = (0.2 + ((i * 37) % 10) / 10) * r;
    const s = 0.5 + ((i * 53) % 10) / 10;
    const m = mesh(G.box(s * 1.6, s * 0.9, s * 1.3), mat, Math.cos(a) * d, s * 0.35, Math.sin(a) * d);
    m.rotation.set(i * 0.3, i * 1.1, i * 0.2);
    g.add(m);
  }
  g.visible = false;
  return g;
}

export function buildTower(team: number, radius: number, height: number): StructureRig {
  const root = new THREE.Group();
  const alive = new THREE.Group();
  root.add(alive);
  const tc = teamColor(team);
  const stone = std(0x8a8d96, 0.9, 0.05);
  const dark = std(0x4a4d58, 0.9, 0.1);
  const glow = glowMat(tc, 1.6);
  alive.add(mesh(G.cyl(radius * 1.45, radius * 1.65, 1.2, 8), dark, 0, 0.6, 0));
  alive.add(mesh(G.cyl(radius * 0.95, radius * 1.3, height * 0.55, 8), stone, 0, 1.2 + height * 0.275, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const strip = mesh(G.box(0.35, height * 0.45, 0.2), glow, Math.cos(a) * radius * 1.12, 1.2 + height * 0.3, Math.sin(a) * radius * 1.12);
    strip.rotation.y = -a + Math.PI / 2;
    alive.add(strip);
  }
  alive.add(mesh(G.cyl(radius * 1.25, radius * 0.95, 1.3, 8), dark, 0, 1.2 + height * 0.55 + 0.65, 0));
  const ring = mesh(G.torus(radius * 1.1, 0.18, 20), glow, 0, 1.2 + height * 0.55 + 1.5, 0);
  ring.rotation.x = Math.PI / 2;
  alive.add(ring);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fin = mesh(G.box(0.3, 1.6, 0.9), dark, Math.cos(a) * radius * 0.95, 1.2 + height * 0.55 + 2.2, Math.sin(a) * radius * 0.95);
    fin.rotation.y = -a;
    alive.add(fin);
  }
  const orb = mesh(G.ico(radius * 0.6, 1), glow, 0, 1.2 + height * 0.55 + 2.4, 0);
  orb.castShadow = false;
  alive.add(orb);
  const rb = rubble(radius * 1.4, 0x5a5d66);
  root.add(rb);
  return { root, orb, spin: [orb], glow: [glow], alive, rubble: rb };
}

export function buildInhibitor(team: number, radius: number): StructureRig {
  const root = new THREE.Group();
  const alive = new THREE.Group();
  root.add(alive);
  const tc = teamColor(team);
  const glow = glowMat(tc, 1.8);
  alive.add(mesh(G.cyl(radius * 1.2, radius * 1.4, 0.9, 8), std(0x4a4d58, 0.9), 0, 0.45, 0));
  alive.add(mesh(G.cyl(radius * 0.7, radius * 0.9, 0.5, 8), std(0x8a8d96, 0.9), 0, 1.1, 0));
  const crystal = mesh(G.oct(radius * 0.9), glow, 0, 3.6, 0);
  crystal.scale.set(1, 1.7, 1);
  alive.add(crystal);
  const ring = mesh(G.torus(radius * 1.05, 0.14, 20), glow, 0, 3.4, 0);
  ring.rotation.x = Math.PI / 2.4;
  alive.add(ring);
  const rb = rubble(radius * 1.3, 0x5a5d66);
  root.add(rb);
  return { root, orb: crystal, spin: [crystal, ring], glow: [glow], alive, rubble: rb };
}

export function buildNexus(team: number, radius: number): StructureRig {
  const root = new THREE.Group();
  const alive = new THREE.Group();
  root.add(alive);
  const tc = teamColor(team);
  const glow = glowMat(tc, 1.7);
  alive.add(mesh(G.cyl(radius * 1.5, radius * 1.7, 1.1, 14), std(0x3e414c, 0.9), 0, 0.55, 0));
  alive.add(mesh(G.cyl(radius * 1.1, radius * 1.3, 0.9, 14), std(0x6a6d78, 0.9), 0, 1.5, 0));
  const core = mesh(G.ico(radius * 0.8, 0), glow, 0, 6, 0);
  core.scale.set(1, 1.5, 1);
  alive.add(core);
  const r1 = mesh(G.torus(radius * 1.2, 0.22, 28), glow, 0, 6, 0);
  r1.rotation.x = Math.PI / 2.3;
  const r2 = mesh(G.torus(radius * 0.95, 0.18, 24), glow, 0, 6, 0);
  r2.rotation.x = Math.PI / 1.7;
  alive.add(r1, r2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pil = mesh(G.box(0.9, 3.6, 0.9), std(0x7a7d88, 0.9), Math.cos(a) * radius * 1.45, 2.8, Math.sin(a) * radius * 1.45);
    alive.add(pil);
    alive.add(mesh(G.oct(0.5), glow, Math.cos(a) * radius * 1.45, 5.0, Math.sin(a) * radius * 1.45));
  }
  const rb = rubble(radius * 1.6, 0x5a5d66);
  root.add(rb);
  return { root, orb: core, spin: [core, r1, r2], glow: [glow], alive, rubble: rb };
}

// ----------------------------------------------------------------- monsters

export function buildMonster(name: string, big: boolean, radius: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const isGolem = name.includes('Golem');
  const isBrute = name.includes('Brute') || name.includes('Pup');
  const isThorn = name.includes('Thorn');
  if (isGolem) {
    const rock = std(0x7a7a88, 0.95);
    g.add(mesh(G.dodeca(radius * 0.95), rock, 0, radius * 1.2, 0));
    g.add(mesh(G.dodeca(radius * 0.6), rock, 0, radius * 2.2, 0));
    for (const sx of [-1, 1]) g.add(mesh(G.dodeca(radius * 0.5), rock, sx * radius * 1.1, radius * 1.4, 0));
    const crystal = glowMat(0x60d0ff, 1.8);
    for (let i = 0; i < 4; i++) {
      const c = mesh(G.cone(radius * 0.18, radius * 0.9, 5), crystal, Math.cos(i * 1.6) * radius * 0.5, radius * 2.7, Math.sin(i * 1.6) * radius * 0.5);
      c.rotation.set(Math.sin(i) * 0.4, 0, Math.cos(i) * 0.4);
      g.add(c);
    }
    g.add(mesh(G.sph(radius * 0.15, 6), crystal, -radius * 0.2, radius * 2.25, radius * 0.5));
    g.add(mesh(G.sph(radius * 0.15, 6), crystal, radius * 0.2, radius * 2.25, radius * 0.5));
  } else if (isBrute) {
    const fur = std(big ? 0x4e6a3a : 0x5e7a48, 0.95);
    g.add(mesh(G.sph(radius * 1.0, 8), fur, 0, radius * 1.1, 0));
    g.add(mesh(G.sph(radius * 0.6, 8), fur, 0, radius * 2.0, radius * 0.3));
    for (const sx of [-1, 1]) g.add(mesh(G.cyl(radius * 0.25, radius * 0.3, radius * 1.1, 6), fur, sx * radius * 0.55, radius * 0.5, 0.1));
    for (const sx of [-1, 1]) g.add(mesh(G.cone(radius * 0.12, radius * 0.5, 5), std(0xd8d0b0), sx * radius * 0.35, radius * 2.6, radius * 0.3));
    g.add(mesh(G.box(radius * 0.8, radius * 0.12, radius * 0.1), glowMat(0xffcc40, 1.5), 0, radius * 2.1, radius * 0.8));
  } else if (isThorn) {
    const bark = std(big ? 0x5a3a28 : 0x6a4a30, 0.95);
    g.add(mesh(G.ico(radius * 0.9, 0), bark, 0, radius * 1.0, 0));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const sp = mesh(G.cone(radius * 0.15, radius * 0.9, 5), std(0xa8d060), Math.cos(a) * radius * 0.7, radius * (0.8 + (i % 3) * 0.35), Math.sin(a) * radius * 0.7);
      sp.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
      g.add(sp);
    }
    g.add(mesh(G.sph(radius * 0.14, 6), glowMat(0xff6040, 1.6), -radius * 0.3, radius * 1.15, radius * 0.75));
    g.add(mesh(G.sph(radius * 0.14, 6), glowMat(0xff6040, 1.6), radius * 0.3, radius * 1.15, radius * 0.75));
  } else {
    g.add(mesh(G.sph(radius, 8), std(0x808080), 0, height / 2, 0));
  }
  return g;
}

export function buildRock(r: number, seed: number): THREE.BufferGeometry {
  const geo = G.dodeca(r);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const f = 0.82 + (k - Math.floor(k)) * 0.34;
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.85, pos.getZ(i) * f);
  }
  geo.computeVertexNormals();
  return geo;
}
