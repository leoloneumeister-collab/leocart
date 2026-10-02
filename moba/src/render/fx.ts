/** Particles and ground decals (telegraphs, rings, click markers). */
import * as THREE from 'three';

function softTexture(kind: 'dot' | 'ring' | 'disc'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = 64;
  if (kind === 'dot') {
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  } else if (kind === 'ring') {
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(r, r, r - 6, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 12;
    g.beginPath();
    g.arc(r, r, r - 12, 0, Math.PI * 2);
    g.stroke();
  } else {
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.15)');
    gr.addColorStop(0.8, 'rgba(255,255,255,0.4)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(r, r, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  r: number;
  g: number;
  b: number;
  drag: number;
  gravity: number;
}

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private list: Particle[] = [];
  private cap: number;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private col = new THREE.Color();
  private cam: THREE.Camera;

  constructor(cam: THREE.Camera, cap = 2400) {
    this.cam = cam;
    this.cap = cap;
    const mat = new THREE.MeshBasicMaterial({ map: softTexture('dot'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.renderOrder = 5;
    // Allocate instance colors
    this.mesh.setColorAt(0, this.col.setRGB(1, 1, 1));
  }

  emit(x: number, y: number, z: number, color: number, o: { vx?: number; vy?: number; vz?: number; life?: number; size?: number; grow?: number; drag?: number; gravity?: number } = {}) {
    if (this.list.length >= this.cap) return;
    this.col.setHex(color);
    this.list.push({
      x,
      y,
      z,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      vz: o.vz ?? 0,
      life: o.life ?? 0.6,
      max: o.life ?? 0.6,
      size: o.size ?? 0.6,
      grow: o.grow ?? 0,
      r: this.col.r,
      g: this.col.g,
      b: this.col.b,
      drag: o.drag ?? 0,
      gravity: o.gravity ?? 0,
    });
  }

  burst(x: number, y: number, z: number, color: number, count: number, speed: number, life = 0.6, size = 0.6, gravity = 0) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.2 - 0.2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.emit(x, y, z, color, { vx: Math.cos(a) * s * (1 - Math.abs(e) * 0.4), vy: e * s, vz: Math.sin(a) * s * (1 - Math.abs(e) * 0.4), life: life * (0.6 + Math.random() * 0.7), size: size * (0.6 + Math.random() * 0.8), drag: 2.2, gravity });
    }
  }

  update(dt: number) {
    const list = this.list;
    this.q.copy(this.cam.quaternion);
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.vz *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.life / p.max;
      const s = (p.size + p.grow * (1 - t)) * (0.35 + 0.65 * t);
      this.m.compose(new THREE.Vector3(p.x, p.y, p.z), this.q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(n, this.m);
      this.col.setRGB(p.r * t, p.g * t, p.b * t);
      this.mesh.setColorAt(n, this.col);
      list[n] = p;
      n++;
    }
    list.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export interface Decal {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  radius: number;
  kind: 'telegraph' | 'flash' | 'persist';
  fill?: THREE.Mesh;
}

export class Decals {
  readonly group = new THREE.Group();
  private active: Decal[] = [];
  private ringTex = softTexture('ring');
  private discTex = softTexture('disc');
  private pool: THREE.Mesh[] = [];
  private geo = new THREE.PlaneGeometry(1, 1);

  private take(tex: THREE.Texture, color: number): THREE.Mesh {
    let m = this.pool.pop();
    if (!m) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      m = new THREE.Mesh(this.geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
    }
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.map = tex;
    mat.color.setHex(color);
    mat.opacity = 1;
    mat.needsUpdate = true;
    m.visible = true;
    this.group.add(m);
    return m;
  }

  private release(m: THREE.Mesh) {
    m.visible = false;
    this.group.remove(m);
    this.pool.push(m);
  }

  telegraph(x: number, z: number, radius: number, color: number, delay: number) {
    const ring = this.take(this.ringTex, color);
    ring.position.set(x, 0.12, z);
    ring.scale.set(radius * 2, radius * 2, 1);
    const fill = this.take(this.discTex, color);
    fill.position.set(x, 0.1, z);
    fill.scale.set(0.1, 0.1, 1);
    this.active.push({ mesh: ring, life: delay, max: delay, radius, kind: 'telegraph', fill });
  }

  flash(x: number, z: number, radius: number, color: number, life = 0.35) {
    const ring = this.take(this.ringTex, color);
    ring.position.set(x, 0.14, z);
    ring.scale.set(radius * 1.2, radius * 1.2, 1);
    this.active.push({ mesh: ring, life, max: life, radius, kind: 'flash' });
  }

  marker(x: number, z: number, color: number) {
    this.flash(x, z, 2.6, color, 0.5);
  }

  /** A persistent decal the caller moves and releases (used for aim previews). */
  persistent(color: number, tex: 'ring' | 'disc' = 'ring'): THREE.Mesh {
    const m = this.take(tex === 'ring' ? this.ringTex : this.discTex, color);
    m.renderOrder = 3;
    return m;
  }

  drop(m: THREE.Mesh) {
    this.release(m);
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i];
      d.life -= dt;
      const t = Math.max(0, d.life / d.max);
      const mat = d.mesh.material as THREE.MeshBasicMaterial;
      if (d.kind === 'telegraph') {
        mat.opacity = 0.55 + 0.35 * Math.sin((1 - t) * 18);
        const f = (1 - t) * d.radius * 2;
        d.fill!.scale.set(f, f, 1);
        (d.fill!.material as THREE.MeshBasicMaterial).opacity = 0.5;
      } else {
        const s = d.radius * (1.2 + (1 - t) * 0.8);
        d.mesh.scale.set(s, s, 1);
        mat.opacity = t;
      }
      if (d.life <= 0) {
        this.release(d.mesh);
        if (d.fill) this.release(d.fill);
        this.active.splice(i, 1);
      }
    }
  }
}
