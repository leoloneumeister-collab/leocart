/** Towers, inhibitors and nexuses: carved stone with team coloured runes, floating crystals and spinning rings. */
import * as THREE from 'three';
import { ModelBuilder, P } from './crowd.ts';
import { rockGeometry } from './foliage.ts';
import { stylize } from './materials.ts';
import * as S from './shapes.ts';
import type { V3 } from './shapes.ts';

export interface StructureState {
  vulnerable: boolean;
  hpFrac: number;
  /** Seconds since destruction, 0 while standing. */
  deadT: number;
}

export interface StructureRig {
  root: THREE.Group;
  /** Where attack flashes and the energy bolt come from. */
  top: THREE.Object3D | null;
  update(dt: number, t: number, st: StructureState): void;
}

const TEAM = [
  { stone: 0x46547a, stoneDark: 0x262e4a, stoneLight: 0x6878a4, glow: 0x3a9cff, accent: 0x9cd4ff },
  { stone: 0x74484e, stoneDark: 0x3a2028, stoneLight: 0x9c6c6e, glow: 0xff4a3a, accent: 0xffb09c },
];

function rot(g: THREE.BufferGeometry, ry: number): THREE.BufferGeometry {
  g.rotateY(ry);
  return g;
}

function stoneMaterial(hook: (m: THREE.Material) => void): THREE.MeshStandardMaterial {
  const m = stylize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.06 }), { rim: 0.3, paint: 0.2, paintScale: 0.6, ao: 0.4 });
  hook(m);
  return m;
}

function glowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
}

function rubblePile(r: number, hook: (m: THREE.Material) => void): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  stylize(mat, { rim: 0.15, ao: 0.4 });
  hook(mat);
  const geos = [rockGeometry(4), rockGeometry(9), rockGeometry(13)];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + i * 0.7;
    const d = (0.15 + ((i * 37) % 10) / 12) * r;
    const s = (0.6 + ((i * 53) % 10) / 10) * (r / 3);
    const m = new THREE.Mesh(geos[i % 3], mat);
    m.position.set(Math.cos(a) * d, s * 0.25, Math.sin(a) * d);
    m.scale.set(s, s * 0.8, s);
    m.rotation.set(i * 0.3, i * 1.1, i * 0.2);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.visible = false;
  return g;
}

/** Shared parts for a hexagonal stone base with a glowing rune ring. */
function plinth(b: ModelBuilder, g: ModelBuilder, R: number, sides: number, pal: (typeof TEAM)[number]) {
  b.add(S.cyl(R * 1.75, R * 1.95, 0.7, sides), pal.stoneDark, P.body, { p: [0, 0.35, 0], grad: [0.7, 1.0] });
  b.add(S.cyl(R * 1.45, R * 1.7, 0.6, sides), pal.stone, P.body, { p: [0, 1.0, 0] });
  g.glow(S.torus(R * 1.6, 0.08, 40), pal.glow, P.body, { p: [0, 1.32, 0], r: [Math.PI / 2, 0, 0], boost: 1.9 });
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    g.glow(S.plate(0.5, 0.05, 0.14, 0.02), pal.glow, P.body, { p: [Math.cos(a) * R * 1.85, 0.62, Math.sin(a) * R * 1.85], r: [0, -a + Math.PI / 2, 0], boost: 1.6 });
  }
}

function buildTower(team: number, R: number, H: number, hook: (m: THREE.Material) => void): StructureRig {
  const pal = TEAM[team === 1 ? 1 : 0];
  const b = new ModelBuilder();
  const g = new ModelBuilder();
  plinth(b, g, R, 8, pal);
  const y0 = 1.3;
  const shaftH = H * 0.55;
  b.add(S.cyl(R * 0.78, R * 1.12, shaftH, 8), pal.stone, P.body, { p: [0, y0 + shaftH / 2, 0], grad: [0.7, 1.15] });
  for (let i = 0; i < 3; i++) b.add(S.torus(R * (1.05 - i * 0.12), 0.14, 20), pal.stoneLight, P.body, { p: [0, y0 + 0.6 + i * (shaftH / 3.2), 0], r: [Math.PI / 2, 0, 0] });
  // buttresses
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.add(S.plate(0.55, 2.6, 1.3, 0.18), pal.stoneDark, P.body, { p: [Math.cos(a) * R * 1.12, y0 + 1.2, Math.sin(a) * R * 1.12], r: [0, -a + Math.PI / 2, 0.0] });
  }
  // runes
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const rr = R * 0.9;
    g.glow(S.plate(0.2, shaftH * 0.7, 0.1, 0.03), pal.glow, P.body, { p: [Math.cos(a) * rr, y0 + shaftH * 0.5, Math.sin(a) * rr], r: [0, -a + Math.PI / 2, 0], boost: 1.8 });
    for (let k = 0; k < 3; k++) g.glow(S.plate(0.45, 0.07, 0.1, 0.02), pal.glow, P.body, { p: [Math.cos(a) * rr * 1.04, y0 + shaftH * (0.25 + k * 0.22), Math.sin(a) * rr * 1.04], r: [0, -a + Math.PI / 2, 0], boost: 1.5 });
  }
  // crown
  const yc = y0 + shaftH;
  b.add(S.cyl(R * 1.3, R * 0.82, 1.1, 8), pal.stoneDark, P.body, { p: [0, yc + 0.55, 0] });
  b.add(S.torus(R * 1.28, 0.16, 20), pal.stoneLight, P.body, { p: [0, yc + 1.1, 0], r: [Math.PI / 2, 0, 0] });
  const prongCount = 6;
  for (let i = 0; i < prongCount; i++) {
    const a = (i / prongCount) * Math.PI * 2;
    const tube = S.taperTube([[R * 1.1, 0, 0], [R * 1.25, 1.3, 0], [R * 0.95, 2.6, 0], [R * 0.4, 3.4, 0]], 0.2, 0.06, 8, 14);
    b.add(rot(tube, -a), pal.stoneDark, P.body, { p: [0, yc + 1.1, 0] });
    b.add(S.sphere(0.12), pal.stoneLight, P.body, { p: [Math.cos(a) * R * 0.4, yc + 4.5, Math.sin(a) * R * 0.4] });
  }
  // dynamic parts
  const dyn = new ModelBuilder();
  dyn.glow(S.icosa(R * 0.5, 2), pal.glow, P.body, { boost: 1.9 });
  dyn.glow(S.icosa(R * 0.28, 1), pal.accent, P.body, { p: [0, 0, 0], boost: 2.1 });
  const rings = new ModelBuilder();
  rings.glow(S.torus(R * 0.95, 0.07, 36), pal.glow, P.body, { boost: 2.0 });
  const rings2 = new ModelBuilder();
  rings2.glow(S.torus(R * 0.78, 0.06, 32), pal.accent, P.body, { boost: 2.0 });
  return assemble(b, g, [{ model: dyn, pos: [0, yc + 2.5, 0], spin: [0, 1.1, 0], key: 'orb' }, { model: rings, pos: [0, yc + 2.5, 0], spin: [0.9, 0.5, 0], tilt: [0.5, 0, 0.3] }, { model: rings2, pos: [0, yc + 2.5, 0], spin: [-0.7, 0.8, 0], tilt: [-0.4, 0, 0.9] }], team, R, hook, 'tower', yc + 2.5);
}

function buildInhibitor(team: number, R: number, hook: (m: THREE.Material) => void): StructureRig {
  const pal = TEAM[team === 1 ? 1 : 0];
  const b = new ModelBuilder();
  const g = new ModelBuilder();
  plinth(b, g, R * 0.85, 8, pal);
  b.add(S.cyl(R * 0.7, R * 0.95, 0.7, 8), pal.stone, P.body, { p: [0, 1.65, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.cos(a) * R * 1.15;
    const pz = Math.sin(a) * R * 1.15;
    b.add(S.plate(0.7, 3.4, 0.7, 0.15), pal.stoneDark, P.body, { p: [px, 2.6, pz], r: [0, -a, 0] });
    b.add(S.plate(0.95, 0.35, 0.95, 0.1), pal.stoneLight, P.body, { p: [px, 4.4, pz], r: [0, -a, 0] });
    g.glow(S.plate(0.14, 1.6, 0.08, 0.03), pal.glow, P.body, { p: [px * 0.93, 2.7, pz * 0.93], r: [0, -a, 0], boost: 1.8 });
    g.glow(S.sphere(0.2), pal.accent, P.body, { p: [px, 4.85, pz], boost: 1.9 });
  }
  const dyn = new ModelBuilder();
  dyn.glow(S.gem(R * 0.62, 2.0), pal.glow, P.body, { boost: 1.8 });
  dyn.glow(S.gem(R * 0.3, 2.0), pal.accent, P.body, { boost: 2.1 });
  const ring = new ModelBuilder();
  ring.glow(S.torus(R * 0.95, 0.09, 32), pal.glow, P.body, { boost: 2.0 });
  const shards = new ModelBuilder();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    shards.glow(S.gem(0.2, 1.8), pal.accent, P.body, { p: [Math.cos(a) * R * 1.05, Math.sin(a * 2) * 0.4, Math.sin(a) * R * 1.05], boost: 1.8 });
  }
  return assemble(b, g, [{ model: dyn, pos: [0, 3.7, 0], spin: [0, 1.0, 0], key: 'orb' }, { model: ring, pos: [0, 3.7, 0], spin: [0.7, 0.3, 0], tilt: [0.9, 0, 0.2] }, { model: shards, pos: [0, 3.7, 0], spin: [0, -1.6, 0] }], team, R, hook, 'inhibitor', 3.7);
}

function buildNexus(team: number, R: number, hook: (m: THREE.Material) => void): StructureRig {
  const pal = TEAM[team === 1 ? 1 : 0];
  const b = new ModelBuilder();
  const g = new ModelBuilder();
  plinth(b, g, R, 16, pal);
  b.add(S.cyl(R * 1.3, R * 1.5, 0.8, 16), pal.stoneDark, P.body, { p: [0, 1.75, 0], grad: [0.6, 0.9] });
  b.add(S.cyl(R * 0.95, R * 1.2, 0.7, 16), pal.stone, P.body, { p: [0, 2.5, 0], grad: [0.6, 0.9] });
  g.glow(S.torus(R * 1.25, 0.12, 40), pal.glow, P.body, { p: [0, 2.2, 0], r: [Math.PI / 2, 0, 0], boost: 2.0 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = Math.cos(a) * R * 1.4;
    const pz = Math.sin(a) * R * 1.4;
    b.add(S.plate(1.0, 4.4, 1.0, 0.2), pal.stoneDark, P.body, { p: [px, 3.6, pz], r: [0, -a, 0], grad: [0.7, 1.1] });
    b.add(S.plate(1.3, 0.45, 1.3, 0.12), pal.stoneLight, P.body, { p: [px, 5.95, pz], r: [0, -a, 0] });
    g.glow(S.plate(0.16, 2.6, 0.1, 0.03), pal.glow, P.body, { p: [px * 0.92, 3.6, pz * 0.92], r: [0, -a, 0], boost: 1.8 });
    g.glow(S.gem(0.34, 1.6), pal.accent, P.body, { p: [px, 6.7, pz], boost: 1.9 });
    // arches toward the core
    b.add(rot(S.taperTube([[R * 1.4, 5.9, 0], [R * 1.0, 8.2, 0], [R * 0.4, 9.2, 0]], 0.24, 0.08, 8, 14), -a), pal.stone, P.body);
  }
  const yc = 7.2;
  const dyn = new ModelBuilder();
  dyn.glow(S.gem(R * 0.62, 2.0), pal.glow, P.body, { boost: 1.8 });
  dyn.glow(S.gem(R * 0.3, 2.0), pal.accent, P.body, { boost: 2.1 });
  const r1 = new ModelBuilder();
  r1.glow(S.torus(R * 1.1, 0.14, 40), pal.glow, P.body, { boost: 2.0 });
  const r2 = new ModelBuilder();
  r2.glow(S.torus(R * 0.86, 0.11, 36), pal.accent, P.body, { boost: 2.0 });
  const shards = new ModelBuilder();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    shards.glow(S.gem(0.26, 1.7), pal.accent, P.body, { p: [Math.cos(a) * R * 1.0, Math.sin(a * 3) * 0.6, Math.sin(a) * R * 1.0], boost: 1.8 });
  }
  return assemble(b, g, [{ model: dyn, pos: [0, yc, 0], spin: [0, 0.8, 0], key: 'orb' }, { model: r1, pos: [0, yc, 0], spin: [0.5, 0.3, 0], tilt: [0.5, 0, 0.2] }, { model: r2, pos: [0, yc, 0], spin: [-0.4, 0.6, 0], tilt: [-0.4, 0, 0.8] }, { model: shards, pos: [0, yc, 0], spin: [0, -1.1, 0] }], team, R, hook, 'nexus', yc);
}

interface DynPart {
  model: ModelBuilder;
  pos: V3;
  spin: V3;
  tilt?: V3;
  key?: string;
}

function assemble(stone: ModelBuilder, glow: ModelBuilder, dyn: DynPart[], team: number, R: number, hook: (m: THREE.Material) => void, kind: string, topY: number): StructureRig {
  const root = new THREE.Group();
  const alive = new THREE.Group();
  root.add(alive);
  const s = stone.build();
  const stoneMesh = new THREE.Mesh(s.solid, stoneMaterial(hook));
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;
  alive.add(stoneMesh);
  const glowMats: THREE.MeshBasicMaterial[] = [];
  const gl = glow.build();
  if (gl.glow) {
    const mat = glowMaterial();
    glowMats.push(mat);
    alive.add(new THREE.Mesh(gl.glow, mat));
  }
  const spinners: { obj: THREE.Object3D; spin: V3 }[] = [];
  let top: THREE.Object3D | null = null;
  let topBase = 0;
  for (const d of dyn) {
    const built = d.model.build();
    const grp = new THREE.Group();
    grp.position.set(...d.pos);
    if (d.tilt) grp.rotation.set(...d.tilt);
    const mat = glowMaterial();
    glowMats.push(mat);
    if (built.glow) grp.add(new THREE.Mesh(built.glow, mat));
    alive.add(grp);
    spinners.push({ obj: grp, spin: d.spin });
    if (d.key === 'orb') {
      top = grp;
      topBase = d.pos[1];
    }
  }
  const rubble = rubblePile(R * 1.4, hook);
  root.add(rubble);
  const phase = team * 1.7 + R;
  void kind;
  void topY;
  return {
    root,
    top,
    update(dt, t, st) {
      const standing = st.deadT <= 0;
      const f = Math.min(1, st.deadT / 0.8);
      alive.visible = standing || f < 1;
      rubble.visible = !standing && st.deadT > 0.3;
      if (!standing) {
        alive.scale.set(1 + f * 0.08, Math.max(0.02, 1 - f * f), 1 + f * 0.08);
        alive.rotation.z = Math.sin(t * 40) * 0.02 * (1 - f);
        glowMats.forEach((m) => m.color.setScalar(1 + (1 - f) * 2));
        return;
      }
      alive.scale.set(1, 1, 1);
      alive.rotation.z = 0;
      const pulse = 1.0 + Math.sin(t * 2.2 + phase) * 0.22;
      const flicker = st.hpFrac < 0.35 ? 0.65 + Math.random() * 0.5 : 1;
      const k = (st.vulnerable ? pulse : pulse * 0.5) * flicker;
      glowMats.forEach((m) => m.color.setScalar(k));
      for (const sp of spinners) {
        sp.obj.rotation.x += sp.spin[0] * dt;
        sp.obj.rotation.y += sp.spin[1] * dt;
        sp.obj.rotation.z += sp.spin[2] * dt;
      }
      if (top) top.position.y = topBase + Math.sin(t * 1.6 + phase) * 0.12;
    },
  };
}

export function buildStructure(kind: 'tower' | 'inhibitor' | 'nexus', team: number, radius: number, height: number, hook: (m: THREE.Material) => void): StructureRig {
  if (kind === 'tower') return buildTower(team, radius, height, hook);
  if (kind === 'inhibitor') return buildInhibitor(team, radius, hook);
  return buildNexus(team, radius, hook);
}
