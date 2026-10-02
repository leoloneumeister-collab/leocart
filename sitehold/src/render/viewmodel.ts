import * as THREE from 'three';
import { WEAPONS, type GrenadeKind } from '../sim/weapons.ts';
import { buildBomb, buildGrenade, buildGun, type GunModel } from './weaponmodels.ts';
import { TEAM_COLORS } from './characters.ts';
import { softCircle } from './textures.ts';

export interface VMContext {
  speed: number;
  maxSpeed: number;
  onGround: boolean;
  crouch: number;
  vy: number;
  /** 0..1 progress through a reload, -1 when not reloading */
  reload: number;
  /** 0..1 progress through draw, 1 when ready */
  draw: number;
  scoped: boolean;
  planting: number;
  defusing: number;
  pin: boolean;
  yawRate: number;
  pitchRate: number;
  time: number;
  team: 0 | 1;
}

interface Held { root: THREE.Group; gun: GunModel | null }

const SKIN = 0xc99a76;

export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.02, 10);
  private rig = new THREE.Group();
  private gunRoot = new THREE.Group();
  private armR = new THREE.Group();
  private armL = new THREE.Group();
  private parts = new Map<THREE.Group, { sleeve: THREE.Mesh; cuff: THREE.Mesh; hand: THREE.Mesh }>();
  private held = new Map<string, Held>();
  private current: Held | null = null;
  private currentKey = '';
  private flashSprite: THREE.Sprite;
  private flashLight: THREE.PointLight;
  private kickV = 0;
  private flashT = 0;
  private swingT = 0;
  private swingStab = false;
  private throwT = 0;
  private sway = new THREE.Vector2();
  private landKick = 0;
  private lastOnGround = true;
  private walkPhase = 0;
  private magRests = new Map<string, number>();
  private sleeve: THREE.MeshStandardMaterial;
  private team: 0 | 1 = 0;
  hidden = false;

  constructor() {
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0xc9a67a, 1.5));
    const key = new THREE.DirectionalLight(0xfff1d8, 2.2);
    key.position.set(0.6, 1, 0.8);
    this.scene.add(key);
    this.camera.add(this.rig);
    this.gunRoot.scale.setScalar(0.74);
    this.rig.add(this.gunRoot);
    this.sleeve = new THREE.MeshStandardMaterial({ color: TEAM_COLORS[0].shirt, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 });
    const mkArm = (g: THREE.Group) => {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 1), this.sleeve);
      sl.position.z = -0.5;
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.05), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.7 }));
      cuff.position.z = -0.97;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.065, 0.1), skin);
      hand.position.z = -1.04;
      g.add(sl, cuff, hand);
      this.parts.set(g, { sleeve: sl, cuff, hand });
      this.rig.add(g);
    };
    mkArm(this.armR);
    mkArm(this.armL);
    const tex = softCircle(64, 0.1);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffd080, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false }));
    this.flashSprite.scale.set(0.22, 0.22, 1);
    this.flashSprite.visible = false;
    this.flashSprite.renderOrder = 20;
    this.scene.add(this.flashSprite);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 1.4, 2);
    this.scene.add(this.flashLight);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private build(key: string): Held {
    let root: THREE.Group, gun: GunModel | null = null;
    if (key.startsWith('g-')) {
      root = new THREE.Group();
      const gm = buildGrenade(key.slice(2) as GrenadeKind);
      gm.scale.setScalar(1.7);
      gm.position.set(0, 0.0, -0.05);
      root.add(gm);
    } else if (key === 'bomb') {
      root = new THREE.Group();
      const b = buildBomb();
      b.scale.setScalar(1.3);
      b.position.set(0, -0.02, -0.12);
      root.add(b);
    } else {
      gun = buildGun(WEAPONS[key]);
      root = gun.group;
    }
    root.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
    root.visible = false;
    this.gunRoot.add(root);
    return { root, gun };
  }

  setWeapon(key: string, team: 0 | 1) {
    if (team !== this.team) {
      this.team = team;
      this.sleeve.color.setHex(TEAM_COLORS[team].shirt);
    }
    if (key === this.currentKey) return;
    let h = this.held.get(key);
    if (!h) { h = this.build(key); this.held.set(key, h); }
    if (this.current) this.current.root.visible = false;
    h.root.visible = true;
    this.current = h;
    this.currentKey = key;
    this.kickV = 0; this.swingT = 0; this.throwT = 0;
  }

  kick(strength = 1) { this.kickV = Math.min(1.6, this.kickV + strength); this.flashT = 0.05; }
  swing(stab: boolean) { this.swingT = 0.001; this.swingStab = stab; }
  throwAnim() { this.throwT = 0.001; }

  /** World position of the muzzle in camera space, for tracer origins. */
  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    if (this.current?.gun) { this.current.gun.muzzle.getWorldPosition(out); return out; }
    return out.set(0, 0, 0);
  }

  update(dt: number, c: VMContext) {
    const group = this.gunRoot;
    this.rig.visible = !this.hidden && !c.scoped;
    this.kickV = Math.max(0, this.kickV - dt * 9);
    if (this.flashT > 0) this.flashT -= dt;
    const t = c.time;

    // ---- locomotion bob
    const sp = Math.min(1, c.speed / Math.max(0.1, c.maxSpeed));
    this.walkPhase += dt * (2 + c.speed * 1.1);
    const bobX = Math.sin(this.walkPhase) * 0.0045 * sp * (c.onGround ? 1 : 0);
    const bobY = Math.abs(Math.cos(this.walkPhase)) * 0.006 * sp * (c.onGround ? 1 : 0);
    const breathe = Math.sin(t * 1.4) * 0.0014;
    // ---- mouse sway
    this.sway.x += (-c.yawRate * 0.0006 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (c.pitchRate * 0.0006 - this.sway.y) * Math.min(1, dt * 10);
    const sx = Math.max(-0.05, Math.min(0.05, this.sway.x)), sy = Math.max(-0.04, Math.min(0.04, this.sway.y));
    // ---- landing
    if (c.onGround && !this.lastOnGround) this.landKick = Math.min(1, Math.abs(c.vy) / 8 + 0.2);
    this.lastOnGround = c.onGround;
    this.landKick = Math.max(0, this.landKick - dt * 5);

    let px = 0.19 + bobX + sx, py = -0.2 + bobY + breathe + sy - this.landKick * 0.03 - c.crouch * 0.01 + (c.onGround ? 0 : Math.max(-0.02, Math.min(0.02, c.vy * 0.002)));
    let pz = -0.3 + this.kickV * 0.05;
    let rx = this.kickV * 0.07 + sy * 1.2, ry = sx * 1.5 + 0.015, rz = -bobX * 2;

    // ---- draw animation
    if (c.draw < 1) { const k = 1 - c.draw; py -= k * 0.28; rx -= k * 0.5; px += k * 0.05; }
    // ---- reload
    if (c.reload >= 0) {
      const p = c.reload;
      const dip = Math.sin(Math.min(1, p / 0.18) * Math.PI / 2) * (p > 0.85 ? (1 - p) / 0.15 : 1);
      py -= dip * 0.12; rx -= dip * 0.35; ry += dip * 0.25; px -= dip * 0.04;
      const mag = this.current?.gun?.mag;
      if (mag) {
        if (!this.magRests.has(this.currentKey)) this.magRests.set(this.currentKey, mag.position.y);
        const rest = this.magRests.get(this.currentKey)!;
        const out = p > 0.22 && p < 0.55 ? Math.sin(((p - 0.22) / 0.33) * Math.PI) : 0;
        mag.position.y = rest - out * 0.16;
        mag.visible = !(p > 0.32 && p < 0.42);
      }
    } else if (this.current?.gun?.mag) {
      const mag = this.current.gun.mag;
      const rest = this.magRests.get(this.currentKey);
      if (rest !== undefined) mag.position.y = rest;
      mag.visible = true;
    }
    // ---- knife
    if (this.swingT > 0) {
      this.swingT += dt;
      const d = this.swingStab ? 0.38 : 0.3;
      const p = Math.min(1, this.swingT / d);
      const s = Math.sin(p * Math.PI);
      if (this.swingStab) { pz -= s * 0.25; rx += s * 0.25; }
      else { px -= s * 0.22 - 0.05; ry += s * 1.1; rz += s * 0.5; py -= s * 0.03; }
      if (p >= 1) this.swingT = 0;
    }
    // ---- grenades
    if (this.throwT > 0) {
      this.throwT += dt;
      const p = Math.min(1, this.throwT / 0.4);
      pz -= Math.sin(p * Math.PI) * 0.18; py += Math.sin(p * Math.PI) * 0.1; rx += Math.sin(p * Math.PI) * 0.8;
      if (p >= 1) this.throwT = 0;
    }
    if (c.pin) { py += 0.03; rx += 0.2; }
    if (c.planting > 0) { py -= 0.04 + Math.sin(t * 12) * 0.003; rx += 0.5; }
    if (c.defusing > 0) { py -= 0.05 + Math.sin(t * 9) * 0.004; rx += 0.7; px -= 0.05; }

    group.position.set(px, py, pz);
    group.rotation.set(rx, ry, rz);
    group.updateMatrixWorld(true);

    // ---- arms: shoulder anchors behind and below the camera, hands at the grips
    const key = this.currentKey;
    const gun = this.current?.gun;
    const handR = new THREE.Vector3(), handL = new THREE.Vector3();
    if (gun) {
      handR.copy(gun.grip).add(new THREE.Vector3(0, -0.015, 0.02)); group.localToWorld(handR);
      handL.copy(gun.foregrip).add(new THREE.Vector3(0, -0.03, 0)); group.localToWorld(handL);
      if (gun.length <= 0.3) { handL.set(-0.12, -0.34, -0.3); this.rig.worldToLocal(handL); handL.copy(handL); this.rig.localToWorld(handL); }
    } else {
      handR.set(0, -0.0, 0); group.localToWorld(handR);
      handL.set(-0.2, -0.38, -0.2); this.rig.localToWorld(handL);
      if (key === 'bomb') { handL.set(-0.04, -0.03, -0.12); group.localToWorld(handL); }
    }
    this.rig.worldToLocal(handR); this.rig.worldToLocal(handL);
    const sR = new THREE.Vector3(0.34, -0.46, 0.22), sL = new THREE.Vector3(-0.28, -0.46, 0.22);
    this.armR.position.copy(sR); this.armL.position.copy(sL);
    this.aim(this.armR, sR, handR); this.aim(this.armL, sL, handL);
    this.armR.visible = this.armL.visible = this.rig.visible;
    if (key === 'knife' || key.startsWith('g-')) this.armL.visible = false;

    // ---- muzzle flash
    const showFlash = this.flashT > 0 && !!gun && !this.hidden;
    this.flashSprite.visible = showFlash && !c.scoped;
    this.flashLight.intensity = showFlash ? 2.2 : 0;
    if (showFlash && gun) {
      const mw = new THREE.Vector3();
      gun.muzzle.getWorldPosition(mw);
      this.camera.worldToLocal(mw);
      // the flash scene objects live in the vm scene root, so convert back to world
      this.camera.localToWorld(mw);
      this.flashSprite.position.copy(mw);
      this.flashSprite.material.rotation = Math.random() * 6.28;
      const s = 0.16 + Math.random() * 0.1;
      this.flashSprite.scale.set(s, s, 1);
      this.flashLight.position.copy(mw);
    }
  }

  private aim(arm: THREE.Group, from: THREE.Vector3, to: THREE.Vector3) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    arm.position.copy(from);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.normalize());
    const p = this.parts.get(arm)!;
    const L = Math.max(0.1, len);
    p.sleeve.scale.z = L - 0.06;
    p.sleeve.position.z = -(L - 0.06) / 2;
    p.cuff.position.z = -(L - 0.03);
    p.hand.position.z = -L;
  }
}
