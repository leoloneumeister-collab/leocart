import * as THREE from 'three';
import { audio } from '../engine/audio';
import { makeCanvas, rand } from '../engine/util';
import { AABB, makeBox } from './collision';
import type { Game } from './game';

const M = {
  dark: new THREE.MeshStandardMaterial({ color: 0x23282c, metalness: 0.7, roughness: 0.45 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x59636b, metalness: 0.8, roughness: 0.4 }),
  white: new THREE.MeshStandardMaterial({ color: 0xc9d0d4, metalness: 0.5, roughness: 0.5 }),
  core: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x30e0ff).multiplyScalar(2.2) }),
  red: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1a).multiplyScalar(3) }),
};

function bx(p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  p.add(mesh);
  return mesh;
}

export interface Damageable { hp: number; destroyed: boolean; damage(amount: number, game: Game): void }

// ------------------------------------------------------------------ relay
export class Relay implements Damageable {
  group = new THREE.Group();
  hp = 420;
  destroyed = false;
  boxes: AABB[] = [];
  pos: THREE.Vector3;
  private beacon: THREE.Mesh;
  private core: THREE.Mesh;
  private dish: THREE.Group;
  private dying = 0;
  private fireTimer = 0;
  private light: THREE.PointLight;
  id: number;

  constructor(x: number, z: number, id: number, game: Game) {
    this.id = id;
    this.pos = new THREE.Vector3(x, 0, z);
    const g = this.group;
    g.position.set(x, 0, z);
    bx(g, 3.2, 0.8, 3.2, 0, 0.4, 0, M.dark);
    bx(g, 2.2, 1.6, 2.2, 0, 1.6, 0, M.steel);
    this.core = bx(g, 1.0, 1.3, 1.0, 0, 1.7, 0, M.core);
    for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) bx(g, 0.12, 13, 0.12, dx, 8.2, dz, M.steel);
    for (let y = 3; y < 14; y += 2.2) {
      bx(g, 1.05, 0.08, 0.08, 0, y, -0.45, M.steel); bx(g, 1.05, 0.08, 0.08, 0, y, 0.45, M.steel);
      bx(g, 0.08, 0.08, 1.05, -0.45, y, 0, M.steel); bx(g, 0.08, 0.08, 1.05, 0.45, y, 0, M.steel);
    }
    this.dish = new THREE.Group(); this.dish.position.set(0, 10, 0.6); g.add(this.dish);
    const dishMesh = new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: 0xcfd6da, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }));
    dishMesh.rotation.x = Math.PI / 2 - 0.3; dishMesh.castShadow = true;
    this.dish.add(dishMesh);
    bx(this.dish, 0.08, 0.08, 1.2, 0, 0.1, 0.7, M.steel);
    bx(g, 0.1, 2.2, 0.1, 0, 15.3, 0, M.steel);
    this.beacon = bx(g, 0.35, 0.35, 0.35, 0, 16.5, 0, M.red);
    const light = new THREE.PointLight(0x30e0ff, 4, 14, 2); light.position.set(0, 2.4, 0); g.add(light); this.light = light;
    game.scene.add(g);
    const base = makeBox(x, 0, z, 3.2, 3.3, 3.2, 'metal'); (base as AABB).owner = this;
    const mast = makeBox(x, 3.3, z, 1.2, 12, 1.2, 'metal'); (mast as AABB).owner = this;
    this.boxes.push(base, mast);
    game.level.colliders.push(base, mast);
  }

  update(dt: number, time: number, game: Game) {
    if (this.destroyed) {
      this.dying -= dt;
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = 0.08;
        const p = this.pos.clone().add(new THREE.Vector3(rand(-1, 1), rand(0.4, 3), rand(-1, 1)));
        game.fx.fire(p, 1); game.fx.smoke(p.setY(p.y + 1), 2, 3, 0x1a1a1a, 2);
      }
      return;
    }
    (this.beacon.material as THREE.MeshBasicMaterial).color.setScalar((Math.sin(time * 4) > 0.2 ? 3 : 0.1)).multiply(new THREE.Color(1, 0.15, 0.1));
    this.core.scale.y = 1 + Math.sin(time * 5) * 0.06;
    this.dish.rotation.y = Math.sin(time * 0.3) * 0.8;
  }

  damage(amount: number, game: Game) {
    if (this.destroyed) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.destroyed = true; this.dying = 3; this.light.intensity = 0;
      for (const b of this.boxes) { const i = game.level.colliders.indexOf(b); if (i >= 0) game.level.colliders.splice(i, 1); }
      // chain of explosions up the mast
      const tk = game.token;
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (tk !== game.token) return;
          const p = this.pos.clone().add(new THREE.Vector3(rand(-1.2, 1.2), 1 + i * 2, rand(-1.2, 1.2)));
          game.fx.explosion(p, 4 + i * 0.5);
          audio.explosion(0.9, game.player.pos.distanceTo(p));
          game.shake(0.5);
          if (i === 2) this.group.children.forEach((c) => { if (c.position.y > 3) c.visible = false; });
        }, i * 170);
      }
      this.group.children.forEach((c) => { const m = c as THREE.Mesh; if (m.material === M.core) m.visible = false; });
      game.onRelayDestroyed(this);
    }
  }
}

// ------------------------------------------------------------------ barrel
export class Barrel implements Damageable {
  mesh: THREE.Mesh;
  hp = 30;
  destroyed = false;
  box: AABB;
  pos: THREE.Vector3;
  private fuse = -1;
  private static geo = new THREE.CylinderGeometry(0.3, 0.3, 0.95, 14);
  private static mat = (() => {
    const cv = makeCanvas(64, 64);
    const g = cv.getContext('2d')!;
    g.fillStyle = '#b8321c'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#e8c21a'; g.fillRect(0, 22, 64, 8);
    g.fillStyle = '#111'; g.font = 'bold 14px sans-serif'; g.fillText('⚠', 24, 56);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 4, 64, 3); g.fillRect(0, 54, 64, 3);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.5 });
  })();

  constructor(x: number, z: number, game: Game) {
    this.pos = new THREE.Vector3(x, 0.475, z);
    this.mesh = new THREE.Mesh(Barrel.geo, Barrel.mat);
    this.mesh.position.copy(this.pos);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    game.scene.add(this.mesh);
    this.box = makeBox(x, 0, z, 0.6, 0.95, 0.6, 'metal');
    this.box.owner = this;
    game.level.colliders.push(this.box);
  }

  damage(amount: number, game: Game) {
    if (this.destroyed) return;
    this.hp -= amount;
    if (this.hp <= 0 && this.fuse < 0) this.fuse = 0.08;
    void game;
  }

  update(dt: number, game: Game) {
    if (this.fuse >= 0 && !this.destroyed) {
      this.fuse -= dt;
      if (this.fuse <= 0) this.explode(game);
    }
  }

  explode(game: Game) {
    this.destroyed = true;
    const i = game.level.colliders.indexOf(this.box); if (i >= 0) game.level.colliders.splice(i, 1);
    game.scene.remove(this.mesh);
    const p = this.pos.clone(); p.y = 0.6;
    game.fx.explosion(p, 5.5);
    audio.explosion(1, game.player.pos.distanceTo(p));
    game.shake(Math.max(0.1, 1 - game.player.pos.distanceTo(p) / 25));
    game.areaDamage(p, 6, 160, 55, true);
    game.alertNoiseAt(p, 40);
    // scorched wreck
    const wreck = new THREE.Mesh(Barrel.geo, new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9 }));
    wreck.position.set(p.x, 0.2, p.z); wreck.rotation.set(rand(1.2, 1.9), rand(0, 6), rand(-0.3, 0.3)); wreck.scale.set(1, 0.7, 1);
    game.scene.add(wreck);
    game.burning.push({ pos: p.clone(), t: 9 });
    game.chainBarrels(p, 5.5);
  }
}

// ------------------------------------------------------------------ ammo crate
export class AmmoCrate {
  mesh = new THREE.Group();
  used = false;
  constructor(public pos: THREE.Vector3, game: Game) {
    this.mesh.position.copy(pos);
    bx(this.mesh, 0.9, 0.5, 0.6, 0, 0.25, 0, new THREE.MeshStandardMaterial({ color: 0x3e4b2f, metalness: 0.4, roughness: 0.6 }));
    bx(this.mesh, 0.92, 0.06, 0.62, 0, 0.5, 0, M.dark);
    bx(this.mesh, 0.5, 0.05, 0.02, 0, 0.3, 0.31, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40ff80).multiplyScalar(2.5) }));
    game.scene.add(this.mesh);
  }
  update(time: number) { this.mesh.rotation.y = Math.sin(time * 0.5) * 0.05; }
}

// ------------------------------------------------------------------ grenade
export class Grenade {
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  vel = new THREE.Vector3();
  life = 1.8;
  done = false;
  private beepT = 0;
  constructor(from: THREE.Vector3, target: THREE.Vector3, game: Game) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2a3326, roughness: 0.6, metalness: 0.4, emissive: 0xff2a1a, emissiveIntensity: 0.6 }));
    this.mesh.position.copy(from);
    game.scene.add(this.mesh);
    const T = this.life;
    const tgt = target.clone(); tgt.y = 0.1;
    tgt.x += rand(-2.5, 2.5); tgt.z += rand(-2.5, 2.5);
    this.vel.set((tgt.x - from.x) / T, (tgt.y - from.y + 0.5 * 12 * T * T) / T, (tgt.z - from.z) / T);
    const rg = new THREE.RingGeometry(4.2, 4.5, 40); rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.position.set(tgt.x, 0.06, tgt.z);
    game.scene.add(this.ring);
  }
  update(dt: number, game: Game) {
    this.life -= dt;
    this.vel.y -= 12 * dt;
    this.mesh.position.addScaledVector(this.vel, dt);
    if (this.mesh.position.y < 0.12) { this.mesh.position.y = 0.12; this.vel.y *= -0.3; this.vel.x *= 0.6; this.vel.z *= 0.6; }
    this.beepT -= dt;
    if (this.beepT <= 0) { this.beepT = Math.max(0.12, this.life * 0.25); audio.beep(); }
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.abs(Math.sin(game.time * 12)) * 0.5;
    if (this.life <= 0) {
      this.done = true;
      const p = this.mesh.position.clone();
      game.fx.explosion(p, 5);
      audio.explosion(0.9, game.player.pos.distanceTo(p));
      game.shake(Math.max(0.1, 1 - game.player.pos.distanceTo(p) / 22));
      game.areaDamage(p, 4.4, 15, 70, false);
      game.scene.remove(this.mesh, this.ring);
    }
  }
}

// ------------------------------------------------------------------ helicopter
export class Heli {
  group = new THREE.Group();
  private rotor = new THREE.Group();
  private tail = new THREE.Group();
  light: THREE.SpotLight;
  constructor() {
    const g = this.group;
    const body = new THREE.MeshStandardMaterial({ color: 0x4a5560, metalness: 0.3, roughness: 0.5 });
    bx(g, 2.2, 1.9, 5.4, 0, 1.6, 0, body);
    bx(g, 1.8, 1.0, 1.6, 0, 1.9, -2.7, new THREE.MeshStandardMaterial({ color: 0x0b1a24, metalness: 0.9, roughness: 0.1, emissive: 0x1a4a6a, emissiveIntensity: 0.4 }));
    bx(g, 0.5, 0.6, 5.5, 0, 2.0, 5.4, body);
    bx(g, 0.1, 1.4, 0.8, 0, 2.6, 8.0, body);
    for (const s of [-1, 1]) { bx(g, 0.12, 0.12, 4.6, s * 1.2, 0.35, 0, M.steel); bx(g, 0.1, 1.0, 0.1, s * 1.15, 0.8, -1.2, M.steel); bx(g, 0.1, 1.0, 0.1, s * 1.15, 0.8, 1.2, M.steel); }
    bx(g, 0.5, 0.5, 0.5, 0, 2.7, 0, M.steel);
    for (let i = 0; i < 4; i++) { const b = bx(this.rotor, 0.35, 0.05, 8.5, 0, 0, 0, M.dark); b.rotation.y = (i * Math.PI) / 2; }
    this.rotor.position.y = 3.05; g.add(this.rotor);
    for (let i = 0; i < 2; i++) { const b = bx(this.tail, 0.05, 1.6, 0.18, 0, 0, 0, M.dark); b.rotation.x = i * Math.PI / 2; }
    this.tail.position.set(0.3, 2.6, 8.0); g.add(this.tail);
    bx(g, 0.35, 0.18, 0.35, 0, 0.9, -3.0, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c0).multiplyScalar(4) }));
    this.light = new THREE.SpotLight(0xdff0ff, 40, 40, 0.5, 0.6, 1.5);
    this.light.position.set(0, 0.9, -3); this.light.target.position.set(0, -10, -6);
    g.add(this.light, this.light.target);
    g.scale.setScalar(1.1);
    g.visible = false;
  }
  update(dt: number) {
    this.rotor.rotation.y += dt * 38;
    this.tail.rotation.x += dt * 45;
  }
}
