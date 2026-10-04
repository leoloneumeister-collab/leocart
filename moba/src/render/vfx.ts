/** Spell effects: ribbon trails, shockwaves, light pillars, streaks, shield bubbles and projectile visuals. All additive HDR so they bloom. */
import * as THREE from 'three';

const hdr = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k);

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gradientTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function additive(map: THREE.Texture | null, color: THREE.Color, opts: Partial<THREE.MeshBasicMaterialParameters> = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, ...opts });
}

// ------------------------------------------------------------------ ribbon trail

const RIBBON_N = 18;

export class Ribbon {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private acc = 0;
  private base = new THREE.Color();
  width: number;
  boost: number;

  constructor(color: number, width = 0.6, boost = 2.2) {
    this.width = width;
    this.boost = boost;
    this.base.setHex(color);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(RIBBON_N * 2 * 3);
    this.col = new Float32Array(RIBBON_N * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < RIBBON_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  setColor(color: number) {
    this.base.setHex(color);
  }

  reset(p: THREE.Vector3) {
    this.pts.length = 0;
    for (let i = 0; i < RIBBON_N; i++) this.pts.push(p.clone());
  }

  /** Move the head to `p` and rebuild the strip facing the camera. */
  update(p: THREE.Vector3, dt: number, cam: THREE.Camera) {
    if (this.pts.length === 0) this.reset(p);
    this.acc += dt;
    if (this.acc >= 0.022) {
      this.acc = 0;
      this.pts.pop();
      this.pts.unshift(p.clone());
    } else this.pts[0].copy(p);
    const up = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    for (let i = 0; i < RIBBON_N; i++) {
      const a = this.pts[Math.max(0, i - 1)];
      const b = this.pts[Math.min(RIBBON_N - 1, i + 1)];
      dir.subVectors(a, b);
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      dir.normalize();
      toCam.subVectors(cam.position, this.pts[i]).normalize();
      up.crossVectors(dir, toCam);
      if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
      up.normalize();
      const t = i / (RIBBON_N - 1);
      const w = this.width * (1 - t) * (0.25 + 0.75 * Math.sin(Math.min(1, t * 6 + 0.35) * Math.PI * 0.5));
      const f = Math.pow(1 - t, 1.6) * this.boost;
      const o = i * 6;
      this.pos[o] = this.pts[i].x + up.x * w;
      this.pos[o + 1] = this.pts[i].y + up.y * w;
      this.pos[o + 2] = this.pts[i].z + up.z * w;
      this.pos[o + 3] = this.pts[i].x - up.x * w;
      this.pos[o + 4] = this.pts[i].y - up.y * w;
      this.pos[o + 5] = this.pts[i].z - up.z * w;
      this.col[o] = this.col[o + 3] = this.base.r * f;
      this.col[o + 1] = this.col[o + 4] = this.base.g * f;
      this.col[o + 2] = this.col[o + 5] = this.base.b * f;
    }
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ------------------------------------------------------------------ projectile visuals

export interface ProjVisual {
  group: THREE.Group;
  ribbons: Ribbon[];
  /** Per frame animation (spin, pulse). */
  tick?: (t: number) => void;
}

export class Vfx {
  readonly group = new THREE.Group();
  private dot = dotTexture();
  private grad = gradientTexture();
  private waves: { mesh: THREE.Mesh; life: number; max: number; r0: number; r1: number; color: THREE.Color }[] = [];
  private pillars: { mesh: THREE.Mesh; life: number; max: number; radius: number; height: number }[] = [];
  private streaks: { mesh: THREE.Mesh; life: number; max: number }[] = [];
  private ringGeo = new THREE.RingGeometry(0.86, 1, 56, 1);
  private pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).translate(0, 0.5, 0);
  private quadGeo = new THREE.PlaneGeometry(1, 1);
  private cam: THREE.Camera;

  constructor(cam: THREE.Camera) {
    this.cam = cam;
  }

  /** Expanding ground ring. */
  shockwave(x: number, z: number, r0: number, r1: number, color: number, life = 0.5, boost = 2.2, y = 0.25) {
    if (this.waves.length > 40) return;
    const mat = additive(null, hdr(color, boost));
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 4;
    this.group.add(mesh);
    this.waves.push({ mesh, life, max: life, r0, r1, color: hdr(color, boost) });
  }

  /** Vertical column of light that fades upward. */
  pillar(x: number, z: number, radius: number, height: number, color: number, life = 0.6, boost = 2.0) {
    if (this.pillars.length > 28) return;
    const mat = additive(this.grad, hdr(color, boost));
    const mesh = new THREE.Mesh(this.pillarGeo, mat);
    mesh.position.set(x, 0, z);
    mesh.scale.set(radius, height, radius);
    mesh.renderOrder = 4;
    this.group.add(mesh);
    this.pillars.push({ mesh, life, max: life, radius, height });
  }

  /** A flat glowing streak on the ground between two points (dashes). */
  streak(fx: number, fz: number, tx: number, tz: number, width: number, color: number, life = 0.35, boost = 2.2) {
    if (this.streaks.length > 24) return;
    const len = Math.hypot(tx - fx, tz - fz);
    const mat = additive(this.grad, hdr(color, boost));
    const mesh = new THREE.Mesh(this.quadGeo, mat);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(-Math.PI / 2, Math.atan2(tx - fx, tz - fz), 0);
    mesh.position.set((fx + tx) / 2, 0.6, (fz + tz) / 2);
    mesh.scale.set(width, len, 1);
    mesh.renderOrder = 4;
    this.group.add(mesh);
    this.streaks.push({ mesh, life, max: life });
  }

  makeBubble(color: number): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: hdr(color, 1.6) }, uTime: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.4); float s = 0.5 + 0.5 * sin(uTime * 3.0 + vN.y * 6.0); gl_FragColor = vec4(uColor * (f * 1.2 + 0.08 + s * 0.05), f * 0.85 + 0.06); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), mat);
    m.renderOrder = 3;
    return m;
  }

  /** Soft glowing billboard sprite (halos, muzzle flashes). */
  halo(color: number, size: number, boost = 2.0): THREE.Sprite {
    const mat = new THREE.SpriteMaterial({ map: this.dot, color: hdr(color, boost), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const s = new THREE.Sprite(mat);
    s.scale.set(size, size, 1);
    s.renderOrder = 7;
    return s;
  }

  /** Visual for a projectile, chosen by its visual id. `color` is the spell / champion colour. */
  projectile(visual: string, color: number, radius: number): ProjVisual {
    const group = new THREE.Group();
    const ribbons: Ribbon[] = [];
    const glowMat = (c: number, k = 2.2) => new THREE.MeshBasicMaterial({ color: hdr(c, k), toneMapped: false });
    const add = (m: THREE.Mesh) => {
      group.add(m);
      return m;
    };
    let tick: ((t: number) => void) | undefined;
    const [kind, id, slotStr] = visual.split(':');
    const slot = Number(slotStr ?? -1);
    if (kind === 'champ' && id === 'kestrel') {
      // arrow: shaft, head, fletching, cyan wake
      const shaft = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6).rotateX(Math.PI / 2), glowMat(0xdff8ff, 1.8)));
      shaft.position.z = -0.2;
      const head = add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 8).rotateX(Math.PI / 2), glowMat(0xffffff, 2.4)));
      head.position.z = 1.3;
      for (let i = 0; i < 3; i++) {
        const f = add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), glowMat(color, 1.5)));
        f.position.z = -1.25;
        f.rotation.z = (i * Math.PI) / 3;
        f.rotation.x = Math.PI / 2 - 0.0;
        f.rotation.y = Math.PI / 2;
      }
      group.add(this.halo(color, 2.2, 1.6));
      ribbons.push(new Ribbon(color, 0.35, 2.2));
    } else if (kind === 'spell' && id === 'kestrel') {
      const big = slot === 3;
      const s = big ? 2.4 : 1.4;
      const shaft = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.1 * s, 3.6 * s, 8).rotateX(Math.PI / 2), glowMat(0xffffff, 2.6)));
      shaft.position.z = -0.2;
      const head = add(new THREE.Mesh(new THREE.ConeGeometry(0.34 * s, 1.2 * s, 10).rotateX(Math.PI / 2), glowMat(color, 3)));
      head.position.z = 2.2 * s;
      group.add(this.halo(color, 4 * s, 1.8));
      ribbons.push(new Ribbon(color, 0.9 * s, 2.6), new Ribbon(0xffffff, 0.35 * s, 2.4));
    } else if (kind === 'spell' && id === 'ysolde') {
      // flame lance: stretched core with a long fiery wake
      const core = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), glowMat(0xfff0c0, 3)));
      core.scale.set(0.8, 0.8, 2.6);
      const shell = add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), additive(null, hdr(color, 1.6), { opacity: 0.7 })));
      shell.scale.set(0.9, 0.9, 2.8);
      group.add(this.halo(color, 5.5, 1.8));
      ribbons.push(new Ribbon(color, 1.6, 2.4), new Ribbon(0xffe0a0, 0.6, 2.8));
      tick = (t) => {
        shell.rotation.z = t * 6;
        const k = 1 + Math.sin(t * 24) * 0.08;
        shell.scale.set(0.9 * k, 0.9 * k, 2.8);
      };
    } else if (kind === 'spell' && id === 'sable') {
      // spinning poison dart
      const dart = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), glowMat(color, 2.6)));
      dart.scale.set(0.5, 0.5, 2.0);
      group.add(this.halo(color, 2.4, 1.6));
      ribbons.push(new Ribbon(color, 0.5, 2.2), new Ribbon(0x9aff7a, 0.25, 2.0));
      tick = (t) => (dart.rotation.z = t * 18);
    } else if (kind === 'spell') {
      // generic spell: glowing orb with a swirling shell
      const core = add(new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(0.5, radius * 0.5), 1), glowMat(color, 2.8)));
      const shell = add(new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(0.8, radius * 0.75), 1), additive(null, hdr(color, 1.4), { opacity: 0.55 })));
      group.add(this.halo(color, Math.max(3, radius * 2.4), 1.6));
      ribbons.push(new Ribbon(color, Math.max(0.8, radius * 0.9), 2.2));
      tick = (t) => {
        shell.rotation.set(t * 5, t * 7, 0);
        core.scale.setScalar(1 + Math.sin(t * 16) * 0.1);
      };
    } else if (kind === 'champ') {
      // champion basic attack bolt (mage orbs and others)
      const core = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), glowMat(color, 2.8)));
      group.add(this.halo(color, 2.4, 1.6));
      ribbons.push(new Ribbon(color, 0.6, 2.0));
      tick = (t) => core.scale.setScalar(1 + Math.sin(t * 20) * 0.12);
    } else if (kind === 'tower') {
      const core = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), glowMat(0xfff0d0, 3)));
      group.add(this.halo(color, 5, 1.8));
      ribbons.push(new Ribbon(color, 1.1, 2.4));
      tick = (t) => core.scale.setScalar(1 + Math.sin(t * 22) * 0.1);
    } else {
      const core = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), glowMat(color, 2.6)));
      group.add(this.halo(color, 1.6, 1.4));
      ribbons.push(new Ribbon(color, 0.35, 1.8));
      void core;
    }
    return { group, ribbons, tick };
  }

  update(dt: number, time: number) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.life -= dt;
      const t = 1 - Math.max(0, w.life / w.max);
      const e = 1 - (1 - t) * (1 - t);
      const r = w.r0 + (w.r1 - w.r0) * e;
      w.mesh.scale.set(r, r, 1);
      (w.mesh.material as THREE.MeshBasicMaterial).color.copy(w.color).multiplyScalar(1 - t * t);
      if (w.life <= 0) {
        this.group.remove(w.mesh);
        (w.mesh.material as THREE.Material).dispose();
        this.waves.splice(i, 1);
      }
    }
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const p = this.pillars[i];
      p.life -= dt;
      const t = 1 - Math.max(0, p.life / p.max);
      const rise = Math.min(1, t * 5);
      p.mesh.scale.set(p.radius * (1 - t * 0.5), p.height * (0.3 + 0.7 * rise), p.radius * (1 - t * 0.5));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.pillars.splice(i, 1);
      }
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.life -= dt;
      const t = 1 - Math.max(0, s.life / s.max);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      s.mesh.scale.x *= 1 - dt * 1.5;
      if (s.life <= 0) {
        this.group.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        this.streaks.splice(i, 1);
      }
    }
    void time;
    void this.cam;
  }
}
