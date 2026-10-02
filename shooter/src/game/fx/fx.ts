import * as THREE from 'three';
import { ParticleSystem } from './particles';
import { makeCanvas, rand } from '../../engine/util';
import type { SurfaceKind } from '../collision';

const C = (hex: number) => new THREE.Color(hex);

interface Tracer { mesh: THREE.Mesh; life: number; max: number }
interface Shell { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number }
interface Ring { mesh: THREE.Mesh; life: number; max: number; radius: number }
interface FlashLight { light: THREE.PointLight; life: number; max: number; peak: number }

export class FX {
  add: ParticleSystem;
  norm: ParticleSystem;
  private tracers: Tracer[] = [];
  private tracerIdx = 0;
  private shells: Shell[] = [];
  private shellIdx = 0;
  private decals: THREE.Mesh[] = [];
  private decalIdx = 0;
  private rings: Ring[] = [];
  private lights: FlashLight[] = [];
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {
    this.add = new ParticleSystem(900, true);
    this.norm = new ParticleSystem(700, false);
    scene.add(this.add.points, this.norm.points);

    const tg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.visible = false; scene.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 0.08 });
    }
    const sg = new THREE.BoxGeometry(0.02, 0.02, 0.06);
    const sm = new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 0.9, roughness: 0.35 });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(sg, sm); m.visible = false; scene.add(m);
      this.shells.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
    // bullet-hole decals
    const cv = makeCanvas(64, 64);
    const g = cv.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(0,0,0,0.95)'); grd.addColorStop(0.35, 'rgba(10,10,10,0.8)'); grd.addColorStop(0.7, 'rgba(30,30,30,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const dt = new THREE.CanvasTexture(cv);
    const dg = new THREE.PlaneGeometry(0.14, 0.14);
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ map: dt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0.9 }));
      m.visible = false; scene.add(m); this.decals.push(m);
    }
    // shockwave rings
    const rg = new THREE.RingGeometry(0.85, 1, 48);
    rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m); this.rings.push({ mesh: m, life: 0, max: 0.5, radius: 5 });
    }
    // pooled flash lights
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffb36b, 0, 14, 2);
      scene.add(l); this.lights.push({ light: l, life: 0, max: 0.1, peak: 0 });
    }
  }

  flash(pos: THREE.Vector3, color: number, peak: number, dur: number, range = 14) {
    let best = this.lights[0];
    for (const l of this.lights) if (l.life <= 0) { best = l; break; }
    best.light.position.copy(pos);
    best.light.color.setHex(color);
    best.light.distance = range;
    best.peak = peak; best.life = best.max = dur;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffd9a0, width = 0.012, life = 0.07) {
    const t = this.tracers[this.tracerIdx]; this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    t.mesh.position.copy(from).lerp(to, 0.5);
    t.mesh.scale.set(width, width, len);
    t.mesh.lookAt(to);
    (t.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    t.mesh.visible = true; t.life = t.max = life;
  }

  shell(pos: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3) {
    const s = this.shells[this.shellIdx]; this.shellIdx = (this.shellIdx + 1) % this.shells.length;
    s.mesh.position.copy(pos); s.mesh.visible = true;
    s.vel.copy(right).multiplyScalar(rand(1.5, 2.6)).addScaledVector(up, rand(1.2, 2.2));
    s.spin.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
    s.life = 2.2;
  }

  bulletHole(point: THREE.Vector3, normal: THREE.Vector3) {
    const d = this.decals[this.decalIdx]; this.decalIdx = (this.decalIdx + 1) % this.decals.length;
    d.position.copy(point).addScaledVector(normal, 0.012);
    d.lookAt(this.tmp.copy(point).add(normal));
    d.rotateZ(Math.random() * 6);
    const s = rand(0.7, 1.25); d.scale.set(s, s, s);
    d.visible = true;
  }

  impact(point: THREE.Vector3, normal: THREE.Vector3, kind: SurfaceKind) {
    const n = this.tmp;
    const sparks = kind === 'metal' ? 9 : kind === 'concrete' ? 5 : 2;
    for (let i = 0; i < sparks; i++) {
      n.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).addScaledVector(normal, 1.6).normalize().multiplyScalar(rand(2.5, 7));
      this.add.emit(point, n.x, n.y, n.z, C(kind === 'metal' ? 0xffd27a : 0xffe2a8), rand(0.03, 0.06), rand(0.15, 0.4), 1, 14, 1.5, 0.01);
    }
    const dust = kind === 'dirt' ? 0x7a6a55 : kind === 'wood' ? 0x7a5a3a : 0x9aa0a4;
    for (let i = 0; i < 3; i++) {
      n.set(rand(-0.3, 0.3), rand(0.1, 0.5), rand(-0.3, 0.3)).addScaledVector(normal, 1.2);
      this.norm.emit(point, n.x, n.y, n.z, C(dust), rand(0.12, 0.2), rand(0.4, 0.8), 0.35, -0.3, 2, 0.5);
    }
  }

  blood(point: THREE.Vector3, dir: THREE.Vector3, amount = 8) {
    const v = this.tmp;
    for (let i = 0; i < amount; i++) {
      v.set(rand(-1, 1), rand(-0.2, 1.2), rand(-1, 1)).addScaledVector(dir, -1.5).multiplyScalar(rand(1, 3.5));
      this.norm.emit(point, v.x, v.y, v.z, C(0x8a1414), rand(0.04, 0.09), rand(0.3, 0.7), 0.9, 12, 1, 0.02);
    }
  }

  smoke(p: THREE.Vector3, size = 1, life = 2, color = 0x2a2a2a, up = 1.2) {
    this.norm.emit(p, rand(-0.3, 0.3), up * rand(0.7, 1.3), rand(-0.3, 0.3), C(color), size * 0.5, life, 0.45, -0.1, 0.4, size * 1.8);
  }

  fire(p: THREE.Vector3, size = 0.6) {
    this.add.emit(p, rand(-0.3, 0.3), rand(1, 2.4), rand(-0.3, 0.3), C(0xff7a22), size * 0.7, rand(0.35, 0.7), 0.8, -0.5, 1, size * 0.15);
  }

  explosion(pos: THREE.Vector3, radius = 5) {
    const v = this.tmp;
    for (let i = 0; i < 40; i++) {
      v.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, radius * 1.8));
      this.add.emit(pos, v.x, v.y, v.z, C(Math.random() < 0.5 ? 0xff8a2a : 0xffc060), rand(0.5, 1.4), rand(0.4, 0.9), 1, 0, 3, 0.1);
    }
    for (let i = 0; i < 22; i++) {
      v.set(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).multiplyScalar(rand(1, radius * 0.8));
      this.norm.emit(pos, v.x, v.y, v.z, C(0x1c1c1c), rand(1.2, 2.4), rand(1.4, 2.8), 0.7, -0.4, 1.2, rand(3, 5));
    }
    for (let i = 0; i < 30; i++) {
      v.set(rand(-1, 1), rand(0.2, 1.5), rand(-1, 1)).normalize().multiplyScalar(rand(5, 16));
      this.add.emit(pos, v.x, v.y, v.z, C(0xffd27a), 0.06, rand(0.5, 1.1), 1, 16, 0.6, 0.01);
    }
    const r = this.rings.find((q) => q.life <= 0) ?? this.rings[0];
    r.mesh.position.set(pos.x, Math.max(0.1, pos.y * 0.2 + 0.1), pos.z);
    r.radius = radius; r.life = r.max = 0.45; r.mesh.visible = true;
    this.flash(pos.clone().setY(pos.y + 1), 0xff9a50, 700, 0.55, radius * 6);
  }

  update(dt: number) {
    this.add.update(dt);
    this.norm.update(dt);
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t.life / t.max);
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt; s.mesh.rotation.y += s.spin.y * dt; s.mesh.rotation.z += s.spin.z * dt;
      if (s.mesh.position.y < 0.02) {
        s.mesh.position.y = 0.02; s.vel.y *= -0.35; s.vel.x *= 0.5; s.vel.z *= 0.5; s.spin.multiplyScalar(0.5);
      }
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(0, r.life) / r.max;
      r.mesh.scale.setScalar(Math.max(0.01, r.radius * t));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.8;
      if (r.life <= 0) r.mesh.visible = false;
    }
    for (const l of this.lights) {
      if (l.life > 0) { l.life -= dt; l.light.intensity = Math.max(0, l.life / l.max) * l.peak; } else l.light.intensity = 0;
    }
  }
}
