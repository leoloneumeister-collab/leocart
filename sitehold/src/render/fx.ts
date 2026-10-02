import * as THREE from 'three';
import type { Sim } from '../sim/sim.ts';
import type { SimEvent } from '../sim/events.ts';
import { WEAPONS } from '../sim/weapons.ts';
import { GRENADE } from '../sim/constants.ts';
import { bulletHoleTexture, noiseCloud, softCircle } from './textures.ts';
import { buildBomb, buildGrenade, buildGun } from './weaponmodels.ts';

/** GPU points with per particle size and colour. */
class ParticlePool {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private grow: Float32Array;
  private baseA: Float32Array;
  private baseS: Float32Array;
  private n: number;
  private head = 0;
  private geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;

  constructor(n: number, additive: boolean) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.maxLife = new Float32Array(n).fill(1);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.grow = new Float32Array(n);
    this.baseA = new Float32Array(n); this.baseS = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, a: number, size: number, life: number, gravity = 0, drag = 1, grow = 0) {
    const i = this.head; this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.baseA[i] = a; this.baseS[i] = size; this.size[i] = size;
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = gravity; this.drag[i] = drag; this.grow[i] = grow;
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] *= d; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
      this.col[i * 4 + 3] = this.baseA[i] * t;
      this.size[i] = this.baseS[i] * (1 + this.grow[i] * (1 - t));
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }
}

interface SmokeVis { puffs: Array<{ s: THREE.Sprite; off: THREE.Vector3; spin: number; scale: number }>; group: THREE.Group }
interface FireVis { group: THREE.Group; light: THREE.PointLight; scorch: THREE.Mesh }

const TMP = new THREE.Vector3();

export class Effects {
  scene: THREE.Scene;
  dust: ParticlePool;
  glow: ParticlePool;
  private tracers: Array<{ m: THREE.Mesh; life: number }> = [];
  private decals: THREE.Mesh[] = [];
  private decalHead = 0;
  private smokes = new Map<number, SmokeVis>();
  private fires = new Map<number, FireVis>();
  private grenades = new Map<number, THREE.Group>();
  private drops = new Map<number, THREE.Group>();
  private bombMesh: THREE.Group | null = null;
  private bombLed: THREE.Mesh | null = null;
  private bombLight: THREE.PointLight;
  private bombBlink = 0;
  private blasts: Array<{ s: THREE.Sprite; life: number; max: number; grow: number; light?: THREE.PointLight }> = [];
  private flashes: Array<{ s: THREE.Sprite; life: number }> = [];
  private cloudTex: THREE.Texture;
  private softTex: THREE.Texture;
  private tracerMat: THREE.MeshBasicMaterial;
  private tracerGeo: THREE.CylinderGeometry;
  private scorchMat: THREE.MeshBasicMaterial;
  shake = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.dust = new ParticlePool(1400, false);
    this.glow = new ParticlePool(900, true);
    scene.add(this.dust.points, this.glow.points);
    this.cloudTex = noiseCloud(128);
    this.softTex = softCircle(64, 0.05);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5);
    this.tracerGeo.rotateX(Math.PI / 2);
    const holeTex = bulletHoleTexture();
    const holeMat = new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const holeGeo = new THREE.PlaneGeometry(0.16, 0.16);
    for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(holeGeo, holeMat); m.visible = false; scene.add(m); this.decals.push(m); }
    this.scorchMat = new THREE.MeshBasicMaterial({ map: this.softTex, color: 0x120c08, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.bombLight = new THREE.PointLight(0xff3020, 0, 6, 2);
    scene.add(this.bombLight);
  }

  setScale(h: number, fov: number) {
    const k = (h * 0.5) / Math.tan((fov * Math.PI) / 360);
    this.dust.mat.uniforms.uScale.value = k;
    this.glow.mat.uniforms.uScale.value = k;
  }

  clearRound() {
    for (const d of this.decals) d.visible = false;
    for (const t of this.tracers) { t.m.visible = false; }
    for (const [, v] of this.smokes) this.scene.remove(v.group);
    this.smokes.clear();
    for (const [, v] of this.fires) { this.scene.remove(v.group); this.scene.remove(v.scorch); }
    this.fires.clear();
    for (const [, g] of this.grenades) this.scene.remove(g);
    this.grenades.clear();
    for (const [, g] of this.drops) this.scene.remove(g);
    this.drops.clear();
    if (this.bombMesh) { this.scene.remove(this.bombMesh); this.bombMesh = null; }
    this.bombLight.intensity = 0;
    for (const b of this.blasts) { this.scene.remove(b.s); if (b.light) this.scene.remove(b.light); }
    this.blasts.length = 0;
  }

  // ------------------------------------------------------------------ events

  onEvent(e: SimEvent, sim: Sim, muzzleOf: (id: number) => THREE.Vector3 | null, isLocal: (id: number) => boolean, vmMuzzle: () => THREE.Vector3 | null) {
    switch (e.t) {
      case 'tracer': {
        // every shot gets a short tracer, tinted by weapon
        let from = new THREE.Vector3(e.from.x, e.from.y, e.from.z);
        if (isLocal(e.id)) { const v = vmMuzzle(); if (v) from = v; }
        else { const m = muzzleOf(e.id); if (m) from = m; }
        const to = new THREE.Vector3(e.to.x, e.to.y, e.to.z);
        this.tracer(from, to);
        break;
      }
      case 'shot': {
        if (!isLocal(e.id)) { const m = muzzleOf(e.id); if (m) this.muzzleFlash(m); }
        break;
      }
      case 'impact': this.impact(e.pos, e.normal, e.surface); break;
      case 'detonate': this.detonate(e.kind, e.pos); break;
      case 'exploded': this.bombBlast(e.pos); break;
      case 'kill': {
        const v = sim.actors[e.victim];
        for (let i = 0; i < 6; i++) this.dust.spawn(v.pos.x, v.pos.y + 1.2, v.pos.z, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.55, 0.05, 0.05, 0.9, 0.08, 0.5, 9, 0.98);
        break;
      }
      default: break;
    }
  }

  private tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const len = a.distanceTo(b);
    if (len < 1) return;
    let t = this.tracers.find((x) => x.life <= 0);
    if (!t) { const m = new THREE.Mesh(this.tracerGeo, this.tracerMat); this.scene.add(m); t = { m, life: 0 }; this.tracers.push(t); }
    t.m.visible = true;
    t.m.position.copy(a).add(b).multiplyScalar(0.5);
    t.m.scale.set(1, 1, len * 0.5);
    t.m.lookAt(b);
    t.life = 0.07;
  }

  muzzleFlash(p: THREE.Vector3) {
    let f = this.flashes.find((x) => x.life <= 0);
    if (!f) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color: 0xffd488, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      this.scene.add(s); f = { s, life: 0 }; this.flashes.push(f);
    }
    f.s.visible = true; f.s.position.copy(p); f.s.scale.setScalar(0.45 + Math.random() * 0.25); f.life = 0.05;
  }

  private impact(p: { x: number; y: number; z: number }, n: { x: number; y: number; z: number }, surface: string) {
    const count = surface === 'flesh' || surface === 'head' ? 8 : 6;
    const col = surface === 'wood' ? [0.62, 0.42, 0.22] : surface === 'metal' ? [1, 0.85, 0.5] : surface === 'sand' ? [0.78, 0.66, 0.46] : surface === 'flesh' || surface === 'head' ? [0.65, 0.03, 0.03] : [0.7, 0.66, 0.58];
    for (let i = 0; i < count; i++) {
      const sp = 1 + Math.random() * 2.4;
      const vx = n.x * sp + (Math.random() - 0.5) * 1.6, vy = n.y * sp + Math.random() * 1.2, vz = n.z * sp + (Math.random() - 0.5) * 1.6;
      if (surface === 'flesh' || surface === 'head') this.dust.spawn(p.x, p.y, p.z, vx, vy, vz, col[0], col[1], col[2], 0.9, 0.05 + Math.random() * 0.04, 0.45, 10, 0.97);
      else if (surface === 'metal') this.glow.spawn(p.x, p.y, p.z, vx * 2, vy * 2, vz * 2, col[0], col[1], col[2], 1, 0.035, 0.25, 9, 0.96);
      else this.dust.spawn(p.x, p.y, p.z, vx * 0.8, vy * 0.8, vz * 0.8, col[0], col[1], col[2], 0.55, 0.12 + Math.random() * 0.1, 0.7, 0.4, 0.94, 2);
    }
    if (surface !== 'flesh' && surface !== 'head') {
      const d = this.decals[this.decalHead++ % this.decals.length];
      d.visible = true;
      d.position.set(p.x + n.x * 0.012, p.y + n.y * 0.012, p.z + n.z * 0.012);
      d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), TMP.set(n.x, n.y, n.z));
      d.rotateZ(Math.random() * 6);
    }
  }

  private detonate(kind: string, p: { x: number; y: number; z: number }) {
    if (kind === 'he') {
      this.blast(p, 0xffa040, 7, 0.45, true);
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28, up = Math.random() * 0.8;
        this.dust.spawn(p.x, p.y + 0.3, p.z, Math.cos(a) * 5 * Math.random(), 2 + up * 5, Math.sin(a) * 5 * Math.random(), 0.3, 0.27, 0.24, 0.8, 0.9, 1.4, 1.5, 0.95, 1.5);
        this.glow.spawn(p.x, p.y + 0.3, p.z, Math.cos(a) * 9, 2 + up * 8, Math.sin(a) * 9, 1, 0.6, 0.2, 1, 0.12, 0.5, 8, 0.96);
      }
      this.shake = Math.max(this.shake, 0.35);
    } else if (kind === 'flash') {
      this.blast(p, 0xffffff, 5, 0.18, true);
      for (let i = 0; i < 10; i++) this.glow.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 6, (Math.random() - 0.2) * 5, (Math.random() - 0.5) * 6, 1, 1, 1, 1, 0.1, 0.35, 0, 0.95);
    } else if (kind === 'fire') {
      this.blast(p, 0xff7020, 3.2, 0.5, true);
    } else if (kind === 'smoke') {
      for (let i = 0; i < 10; i++) this.dust.spawn(p.x, p.y + 0.2, p.z, (Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2, 0.8, 0.82, 0.84, 0.6, 0.6, 1.2, 0, 0.96, 3);
    }
  }

  private bombBlast(p: { x: number; y: number; z: number }) {
    this.blast(p, 0xffb050, 22, 1.4, true);
    this.blast({ x: p.x, y: p.y + 1.5, z: p.z }, 0xff6020, 14, 1.0, false);
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * 6.28, up = Math.random();
      const sp = 4 + Math.random() * 14;
      this.glow.spawn(p.x, p.y + 0.5, p.z, Math.cos(a) * sp, 3 + up * 14, Math.sin(a) * sp, 1, 0.55, 0.15, 1, 0.25, 1.1, 10, 0.97);
      this.dust.spawn(p.x, p.y + 0.5, p.z, Math.cos(a) * sp * 0.5, 2 + up * 9, Math.sin(a) * sp * 0.5, 0.25, 0.22, 0.2, 0.9, 1.6, 3.2, 1, 0.97, 2);
    }
    this.shake = 1.2;
  }

  private blast(p: { x: number; y: number; z: number }, color: number, size: number, life: number, light: boolean) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    s.position.set(p.x, p.y + 0.5, p.z);
    s.scale.setScalar(0.5);
    this.scene.add(s);
    let l: THREE.PointLight | undefined;
    if (light) { l = new THREE.PointLight(color, 40, size * 3, 2); l.position.copy(s.position); this.scene.add(l); }
    this.blasts.push({ s, life, max: life, grow: size, light: l });
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number, sim: Sim, camPos: THREE.Vector3) {
    this.dust.update(dt);
    this.glow.update(dt);
    this.shake = Math.max(0, this.shake - dt * 1.4);
    for (const t of this.tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.m.visible = false; else this.tracerMat.opacity = 0.85; }
    for (const f of this.flashes) if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.s.visible = false; }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.life -= dt;
      const t = 1 - Math.max(0, b.life / b.max);
      b.s.scale.setScalar(0.5 + b.grow * Math.sqrt(t));
      (b.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - t);
      if (b.light) b.light.intensity = 40 * Math.max(0, 1 - t * 1.6);
      if (b.life <= 0) { this.scene.remove(b.s); (b.s.material as THREE.Material).dispose(); if (b.light) { this.scene.remove(b.light); b.light.dispose(); } this.blasts.splice(i, 1); }
    }
    this.syncGrenades(sim);
    this.syncSmokes(sim, dt);
    this.syncFires(sim, dt);
    this.syncDrops(sim);
    this.syncBomb(sim, dt);
    void camPos;
  }

  private syncGrenades(sim: Sim) {
    const alive = new Set<number>();
    for (const g of sim.grenades) {
      alive.add(g.id);
      let m = this.grenades.get(g.id);
      if (!m) { m = buildGrenade(g.kind); m.scale.setScalar(1.8); this.scene.add(m); this.grenades.set(g.id, m); }
      m.position.set(g.pos.x, g.pos.y, g.pos.z);
      m.rotation.x += 0.2; m.rotation.z += 0.13;
    }
    for (const [id, m] of this.grenades) if (!alive.has(id)) { this.scene.remove(m); this.grenades.delete(id); }
  }

  private syncSmokes(sim: Sim, dt: number) {
    const alive = new Set<number>();
    for (const s of sim.smokes) {
      alive.add(s.id);
      let v = this.smokes.get(s.id);
      if (!v) {
        const group = new THREE.Group();
        const puffs: SmokeVis['puffs'] = [];
        let seed = s.id * 97;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let i = 0; i < 30; i++) {
          const mat = new THREE.SpriteMaterial({ map: this.cloudTex, color: new THREE.Color().setHSL(0.58, 0.04, 0.78 + rnd() * 0.14), transparent: true, depthWrite: false, opacity: 0, fog: true });
          const sp = new THREE.Sprite(mat);
          const dir = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.7, rnd() - 0.5).normalize().multiplyScalar(Math.pow(rnd(), 0.5) * 0.85);
          puffs.push({ s: sp, off: dir, spin: (rnd() - 0.5) * 0.4, scale: 3.2 + rnd() * 2.2 });
          group.add(sp);
        }
        group.position.set(s.pos.x, s.pos.y + 1.4, s.pos.z);
        this.scene.add(group);
        v = { puffs, group };
        this.smokes.set(s.id, v);
      }
      const age = sim.time - s.start;
      const grow = Math.min(1, 0.3 + 0.7 * (age / 1.2));
      const remain = s.end - sim.time;
      const fade = remain < 3 ? Math.max(0, remain / 3) : 1;
      for (const p of v.puffs) {
        p.s.position.copy(p.off).multiplyScalar(s.r * grow);
        p.s.scale.setScalar(p.scale * (0.35 + 0.65 * grow));
        const mat = p.s.material as THREE.SpriteMaterial;
        mat.opacity = Math.min(1, age * 2.5) * fade * 0.55;
        mat.rotation += p.spin * dt;
      }
    }
    for (const [id, v] of this.smokes) if (!alive.has(id)) { this.scene.remove(v.group); v.group.traverse((o) => { const sp = o as THREE.Sprite; if (sp.material) (sp.material as THREE.Material).dispose(); }); this.smokes.delete(id); }
  }

  private syncFires(sim: Sim, dt: number) {
    const alive = new Set<number>();
    for (const f of sim.fires) {
      alive.add(f.id);
      let v = this.fires.get(f.id);
      if (!v) {
        const group = new THREE.Group();
        const light = new THREE.PointLight(0xff7a22, 0, 9, 2);
        light.position.set(f.pos.x, f.pos.y + 1, f.pos.z);
        const scorch = new THREE.Mesh(new THREE.PlaneGeometry(f.r * 2.4, f.r * 2.4), this.scorchMat);
        scorch.rotation.x = -Math.PI / 2;
        scorch.position.set(f.pos.x, f.pos.y + 0.02, f.pos.z);
        this.scene.add(group, light, scorch);
        group.add(light);
        v = { group, light, scorch };
        this.fires.set(f.id, v);
      }
      const remain = f.end - sim.time;
      v.light.intensity = (8 + Math.random() * 6) * Math.min(1, remain);
      // emit flames
      const n = Math.ceil(dt * 90);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * f.r;
        this.glow.spawn(f.pos.x + Math.cos(a) * r, f.pos.y + 0.1, f.pos.z + Math.sin(a) * r, 0, 1.2 + Math.random() * 1.8, 0, 1, 0.45 + Math.random() * 0.3, 0.1, 0.9, 0.5 + Math.random() * 0.4, 0.55, -1, 0.98, -0.6);
        if (Math.random() < 0.25) this.dust.spawn(f.pos.x + Math.cos(a) * r, f.pos.y + 0.6, f.pos.z + Math.sin(a) * r, 0, 1.5, 0, 0.15, 0.13, 0.12, 0.4, 0.8, 1.2, -0.4, 0.99, 1);
      }
    }
    for (const [id, v] of this.fires) if (!alive.has(id)) { this.scene.remove(v.group); v.group.remove(v.light); this.scene.remove(v.light); this.scene.remove(v.scorch); this.fires.delete(id); }
  }

  private syncDrops(sim: Sim) {
    const alive = new Set<number>();
    for (const d of sim.drops) {
      alive.add(d.id);
      let g = this.drops.get(d.id);
      if (!g) {
        if (d.kind === 'bomb') { g = buildBomb(); g.scale.setScalar(1.2); }
        else { const m = buildGun(WEAPONS[d.weaponId]); g = new THREE.Group(); m.group.rotation.z = Math.PI / 2; m.group.position.y = 0.05; g.add(m.group); g.rotation.y = (d.id * 1.7) % 6.28; }
        this.scene.add(g);
        this.drops.set(d.id, g);
      }
      g.position.set(d.pos.x, d.pos.y + 0.06, d.pos.z);
    }
    for (const [id, g] of this.drops) if (!alive.has(id)) { this.scene.remove(g); this.drops.delete(id); }
  }

  private syncBomb(sim: Sim, dt: number) {
    const b = sim.bomb;
    if (b.state === 'planted' || b.state === 'defused') {
      if (!this.bombMesh) {
        this.bombMesh = buildBomb();
        this.bombMesh.scale.setScalar(1.6);
        this.scene.add(this.bombMesh);
        this.bombLed = this.bombMesh.getObjectByName('lcd') as THREE.Mesh;
      }
      this.bombMesh.position.set(b.pos.x, b.pos.y + 0.07, b.pos.z);
      this.bombBlink = Math.max(0, this.bombBlink - dt * 5);
      const on = b.state === 'planted' ? this.bombBlink : 0;
      this.bombLight.position.set(b.pos.x, b.pos.y + 0.3, b.pos.z);
      this.bombLight.intensity = on * 3;
      if (this.bombLed) (this.bombLed.material as THREE.MeshBasicMaterial).color.setHex(on > 0.2 ? 0xff5030 : 0x401410);
      if (b.state === 'defused' && this.bombLed) (this.bombLed.material as THREE.MeshBasicMaterial).color.setHex(0x30ff60);
    } else if (this.bombMesh) {
      this.scene.remove(this.bombMesh); this.bombMesh = null; this.bombLight.intensity = 0;
    }
    void GRENADE;
  }

  blinkBomb() { this.bombBlink = 1; }
}
