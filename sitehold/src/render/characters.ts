import * as THREE from 'three';
import type { Actor } from '../sim/actor.ts';
import { curDef } from '../sim/actor.ts';
import { WEAPONS, type GrenadeKind } from '../sim/weapons.ts';
import { buildBomb, buildGrenade, buildGun, type GunModel } from './weaponmodels.ts';
import type { Vec3 } from '../sim/math.ts';

interface Palette { vest: number; shirt: number; pants: number; helmet: number; accent: number; boots: number }

export const TEAM_COLORS: Palette[] = [
  { vest: 0x2c4f86, shirt: 0x3e68a8, pants: 0x3a424e, helmet: 0x1e2e4a, accent: 0x5cc8ff, boots: 0x1a1d22 },   // Sentinels
  { vest: 0x7a3a22, shirt: 0xa5582f, pants: 0x4a3c2e, helmet: 0x3a2a1e, accent: 0xff9440, boots: 0x1e1812 },   // Breachers
];
export const TEAM_CSS = ['#5cc8ff', '#ff9440'];

const SKINS = [0xe0b48e, 0xc99a76, 0xa87656, 0x7e5238, 0xf0c8a4];

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, rough = 0.75, metal = 0.05) {
  const key = `${color}-${rough}-${metal}`;
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); mats.set(key, m); }
  return m;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = false;
  return me;
}

const BOX = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

const L1 = 0.29, L2 = 0.27;

export class CharacterRig {
  readonly root = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly foreL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly foreR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly shinL = new THREE.Group();
  readonly legR = new THREE.Group();
  readonly shinR = new THREE.Group();
  readonly holder = new THREE.Group();
  readonly gripR = new THREE.Object3D();
  readonly gripL = new THREE.Object3D();
  readonly muzzleWorld = new THREE.Vector3();
  tag: THREE.Sprite | null = null;
  team: 0 | 1;
  phase = 0;
  deathT = 0;
  private held = new Map<string, { model: THREE.Object3D; gun: GunModel | null }>();
  private heldKey = '';
  private muzzle: THREE.Object3D | null = null;
  private lastAlive = true;
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  hurtFlash = 0;

  constructor(team: 0 | 1, id: number) {
    this.team = team;
    const P = TEAM_COLORS[team];
    const skin = mat(SKINS[id % SKINS.length], 0.8);
    const shirt = mat(P.shirt), vest = mat(P.vest, 0.6), pants = mat(P.pants), boots = mat(P.boots, 0.6), helmet = mat(P.helmet, 0.5, 0.2), accent = mat(P.accent, 0.5, 0.1);

    this.root.add(this.pivot);
    this.hips.position.y = 0.95;
    this.pivot.add(this.hips);
    this.hips.add(mesh(BOX(0.36, 0.2, 0.22), pants, 0, 0.0, 0));

    const leg = (x: number, thigh: THREE.Group, shin: THREE.Group) => {
      thigh.position.set(x, -0.04, 0);
      this.hips.add(thigh);
      thigh.add(mesh(BOX(0.16, 0.5, 0.17), pants, 0, -0.24, 0));
      shin.position.y = -0.48;
      thigh.add(shin);
      shin.add(mesh(BOX(0.13, 0.47, 0.14), pants, 0, -0.22, 0));
      shin.add(mesh(BOX(0.14, 0.1, 0.27), boots, 0, -0.45, -0.05));
    };
    leg(-0.1, this.legL, this.shinL);
    leg(0.1, this.legR, this.shinR);

    this.torso.position.y = 0.08;
    this.hips.add(this.torso);
    this.torso.add(mesh(BOX(0.4, 0.5, 0.24), shirt, 0, 0.28, 0));
    this.torso.add(mesh(BOX(0.43, 0.38, 0.27), vest, 0, 0.3, 0.0));
    this.torso.add(mesh(BOX(0.4, 0.06, 0.04), accent, 0, 0.42, -0.14));     // chest stripe
    this.torso.add(mesh(BOX(0.34, 0.34, 0.14), vest, 0, 0.3, 0.2));        // pack
    for (const x of [-0.1, 0.1]) this.torso.add(mesh(BOX(0.1, 0.12, 0.06), mat(0x20242a, 0.7), x, 0.18, -0.15));
    this.torso.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skin, 0, 0.58, 0));

    this.head.position.y = 0.66;
    this.torso.add(this.head);
    this.head.add(mesh(new THREE.SphereGeometry(0.115, 14, 12), skin, 0, 0, 0));
    if (team === 0) {
      const shell = mesh(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmet, 0, 0.02, 0);
      shell.scale.set(1, 1, 1.1);
      this.head.add(shell);
      this.head.add(mesh(BOX(0.2, 0.05, 0.05), mat(0x10151c, 0.2, 0.6), 0, 0.02, -0.105));   // goggles
      this.head.add(mesh(BOX(0.2, 0.02, 0.04), accent, 0, 0.075, -0.1));
    } else {
      const cap = mesh(new THREE.SphereGeometry(0.128, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(0xb8a47a, 0.9), 0, 0.02, 0.0);
      cap.scale.set(1, 1, 1.08);
      this.head.add(cap);
      this.head.add(mesh(BOX(0.2, 0.09, 0.07), mat(0x2a211a, 0.9), 0, -0.04, -0.075));        // mask
      this.head.add(mesh(BOX(0.2, 0.025, 0.04), mat(0x120e0c, 0.4, 0.2), 0, 0.03, -0.105));   // eye slit
      this.head.add(mesh(BOX(0.22, 0.03, 0.03), accent, 0, 0.09, -0.1));
    }

    const arm = (x: number, up: THREE.Group, fore: THREE.Group) => {
      up.position.set(x, 0.5, 0);
      this.torso.add(up);
      up.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), shirt, 0, 0, 0));
      up.add(mesh(BOX(0.11, 0.3, 0.11), shirt, 0, -0.15, 0));
      fore.position.y = -L1;
      up.add(fore);
      fore.add(mesh(BOX(0.095, 0.27, 0.095), shirt, 0, -0.13, 0));
      fore.add(mesh(BOX(0.09, 0.09, 0.1), skin, 0, -L2 + 0.0, 0));
    };
    arm(-0.26, this.armL, this.foreL);
    arm(0.26, this.armR, this.foreR);

    this.holder.position.set(0.1, 0.32, -0.28);
    this.torso.add(this.holder);
    this.holder.add(this.gripR, this.gripL);

    this.root.traverse((o) => { o.matrixAutoUpdate = true; });
  }

  setName(name: string) {
    if (this.tag) { this.root.remove(this.tag); (this.tag.material as THREE.SpriteMaterial).map?.dispose(); }
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d')!;
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(name, 128, 32);
    g.fillStyle = this.team === 0 ? '#8fd8ff' : '#ffb070';
    g.fillText(name, 128, 32);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
    this.tag.scale.set(1.0, 0.25, 1);
    this.tag.position.y = 2.25;
    this.tag.renderOrder = 10;
    this.root.add(this.tag);
  }

  private holdKey(a: Actor): string {
    if (a.cur === 'grenade') return `g-${a.grenadeSel ?? 'flash'}`;
    if (a.cur === 'bomb') return 'bomb';
    const d = curDef(a);
    return d ? d.id : 'knife';
  }

  private ensureHeld(key: string) {
    if (this.held.has(key)) return;
    let model: THREE.Object3D, gun: GunModel | null = null;
    if (key.startsWith('g-')) { model = buildGrenade(key.slice(2) as GrenadeKind); }
    else if (key === 'bomb') { model = buildBomb(); }
    else { gun = buildGun(WEAPONS[key]); model = gun.group; }
    model.visible = false;
    this.holder.add(model);
    this.held.set(key, { model, gun });
  }

  private applyHeld(key: string) {
    if (key === this.heldKey) return;
    this.ensureHeld(key);
    if (this.heldKey) this.held.get(this.heldKey)!.model.visible = false;
    const h = this.held.get(key)!;
    h.model.visible = true;
    this.heldKey = key;
    this.muzzle = h.gun ? h.gun.muzzle : null;
    if (h.gun) {
      this.gripR.position.copy(h.gun.grip);
      this.gripL.position.copy(h.gun.foregrip);
    } else {
      this.gripR.position.set(0, -0.02, 0.0);
      this.gripL.position.set(-0.2, -0.3, 0.3);
    }
  }

  private solve(upper: THREE.Group, fore: THREE.Group, target: THREE.Object3D, side: number, relax: boolean) {
    const S = upper.position;
    const T = this.v1;
    if (relax) {
      upper.rotation.set(0.08 * side, 0, 0.12 * side);
      fore.rotation.set(0.25, 0, 0);
      return;
    }
    target.getWorldPosition(T);
    this.torso.worldToLocal(T);
    const dir = this.v2.subVectors(T, S);
    let d = dir.length();
    const max = L1 + L2 - 0.004;
    if (d > max) { T.copy(S).addScaledVector(dir.normalize(), max); d = max; } else dir.normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pole = new THREE.Vector3(side * 0.6, -1, 0.15);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = new THREE.Vector3().copy(S).addScaledVector(dir, a).addScaledVector(pole, h);
    const down = new THREE.Vector3(0, -1, 0);
    const v = new THREE.Vector3().subVectors(elbow, S).normalize();
    this.q1.setFromUnitVectors(down, v);
    upper.quaternion.copy(this.q1);
    const v2 = new THREE.Vector3().subVectors(T, elbow).normalize();
    this.q2.setFromUnitVectors(down, v2);
    fore.quaternion.copy(this.q1).invert().multiply(this.q2);
  }

  /** Pose the rig for this frame. p is the interpolated feet position. */
  update(dt: number, a: Actor, p: Vec3, yaw: number, now: number, showTag: boolean) {
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.y = yaw;
    if (this.tag) this.tag.visible = showTag && a.alive;
    const speed = Math.hypot(a.vel.x, a.vel.z);

    if (!a.alive) {
      if (this.lastAlive) { this.deathT = 0; this.lastAlive = false; }
      this.deathT = Math.min(1, this.deathT + dt * 2.6);
      const k = 1 - Math.pow(1 - this.deathT, 3);
      this.pivot.rotation.x = k * (Math.PI / 2 - 0.1);
      this.pivot.position.y = 0.13 * k;
      this.pivot.position.z = 0.1 * k;
      this.legL.rotation.x = -0.3 * k; this.legR.rotation.x = 0.35 * k;
      this.shinL.rotation.x = -0.4 * k; this.shinR.rotation.x = -0.2 * k;
      this.armL.rotation.set(-0.4 * k, 0, 0.9 * k); this.armR.rotation.set(0.2 * k, 0, -1.0 * k);
      this.foreL.rotation.set(0, 0, 0); this.foreR.rotation.set(0, 0, 0);
      return;
    }
    if (!this.lastAlive) { this.lastAlive = true; this.pivot.rotation.set(0, 0, 0); this.pivot.position.set(0, 0, 0); this.deathT = 0; }

    // ---- locomotion
    const sp = Math.min(1, speed / 5.5);
    this.phase += dt * (3 + speed * 1.45);
    const sw = Math.sin(this.phase) * 0.75 * sp;
    const crouch = a.crouchAmt;
    const air = !a.onGround;
    this.hips.position.y = 0.95 - crouch * 0.36 + Math.abs(Math.sin(this.phase)) * 0.025 * sp;
    // express the foot motion relative to facing, so strafing legs still look plausible
    const fwd = -a.vel.x * Math.sin(yaw) - a.vel.z * Math.cos(yaw);
    const dirSign = fwd >= -0.3 ? 1 : -1;
    const swing = sw * dirSign;
    this.legL.rotation.x = swing + crouch * 0.95;
    this.legR.rotation.x = -swing + crouch * 0.95;
    this.shinL.rotation.x = -(0.18 * sp + Math.max(0, -Math.cos(this.phase)) * 0.75 * sp) - crouch * 1.55;
    this.shinR.rotation.x = -(0.18 * sp + Math.max(0, Math.cos(this.phase)) * 0.75 * sp) - crouch * 1.55;
    if (air) { this.legL.rotation.x = 0.5; this.legR.rotation.x = -0.25; this.shinL.rotation.x = -0.6; this.shinR.rotation.x = -0.3; }

    // ---- aiming
    const pitch = a.pitch;
    this.torso.rotation.x = pitch * 0.25 + crouch * 0.12;
    this.torso.rotation.y = Math.sin(this.phase) * 0.05 * sp;
    this.head.rotation.x = pitch * 0.75;
    this.holder.rotation.x = pitch * 0.75;
    this.holder.position.y = 0.32 + Math.sin(this.phase * 2) * 0.008 * sp;

    const key = this.holdKey(a);
    this.applyHeld(key);
    const knife = key === 'knife' || key.startsWith('g-') || key === 'bomb';
    if (knife) {
      this.holder.position.set(0.18, 0.2, -0.16);
      this.holder.rotation.x = pitch * 0.4 - 0.3;
      if (key === 'knife') this.holder.rotation.x = -0.9;
    } else {
      this.holder.position.x = 0.1; this.holder.position.z = -0.28;
    }
    // recoil kick on the third person model
    const sinceShot = now - a.lastShot;
    if (sinceShot < 0.1) this.holder.position.z += 0.03 * (1 - sinceShot / 0.1);

    this.root.updateMatrixWorld(true);
    this.solve(this.armR, this.foreR, this.gripR, 1, false);
    this.solve(this.armL, this.foreL, this.gripL, -1, knife);
    if (this.muzzle) this.muzzle.getWorldPosition(this.muzzleWorld);
    else this.muzzleWorld.set(p.x, p.y + 1.3, p.z);
  }

  dispose() { this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
}
