// GPU-point particle pools. One additive pool (sparks, flames, stars) and one alpha pool
// (smoke, dust). Fixed-size ring buffers, no allocation while racing.

import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float size;
attribute vec4 color;
varying vec4 vColor;
uniform float scale;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(0.0, size * scale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, d);
  if (a * vColor.a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

class Pool {
  constructor(max, additive) {
    this.max = max;
    this.n = 0;
    this.cursor = 0;
    this.px = new Float32Array(max);
    this.py = new Float32Array(max);
    this.pz = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.vz = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);

    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('size', this.sizeAttr);
    this.geo.setAttribute('color', this.colAttr);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { scale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.a0[i] = a;
    this.drag[i] = drag; this.grav[i] = grav;
  }

  update(dt) {
    const pos = this.posAttr.array;
    const size = this.sizeAttr.array;
    const col = this.colAttr.array;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const k = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= k; this.vy[i] = this.vy[i] * k - this.grav[i] * dt; this.vz[i] *= k;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.05 && this.grav[i] > 0) {
        this.py[i] = 0.05;
        this.vy[i] *= -0.35;
      }
      pos[i * 3] = this.px[i]; pos[i * 3 + 1] = this.py[i]; pos[i * 3 + 2] = this.pz[i];
      size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      col[i * 4] = this.col[i * 3]; col[i * 4 + 1] = this.col[i * 3 + 1]; col[i * 4 + 2] = this.col[i * 3 + 2];
      col[i * 4 + 3] = this.a0[i] * (1 - t) * (1 - t * 0.2);
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }
}

const c = new THREE.Color();

export class Particles {
  constructor(scene, quality = 'high') {
    const mul = quality === 'low' ? 0.5 : 1;
    this.add = new Pool(Math.floor(900 * mul), true);
    this.alpha = new Pool(Math.floor(700 * mul), false);
    scene.add(this.add.points, this.alpha.points);
    this.mul = mul;
  }

  setScale(renderer, camera) {
    const h = renderer.domElement.height;
    const s = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.add.material.uniforms.scale.value = s;
    this.alpha.material.uniforms.scale.value = s;
  }

  update(dt) {
    this.add.update(dt);
    this.alpha.update(dt);
  }

  // ---- emitters ----
  spark(x, y, z, vx, vy, vz, color, life = 0.35, size = 0.28) {
    c.set(color);
    this.add.spawn(x, y, z, vx, vy, vz, life, size, size * 0.3, c.r, c.g, c.b, 1, 1.5, 22);
  }

  flame(x, y, z, vx, vy, vz, color = 0xffa23a, life = 0.28, size = 0.7) {
    c.set(color);
    this.add.spawn(x, y, z, vx, vy, vz, life, size, size * 0.2, c.r, c.g, c.b, 0.9, 2.5, 0);
  }

  smoke(x, y, z, vx, vy, vz, color = 0xd8d2c4, life = 0.7, size = 0.9, a = 0.5) {
    c.set(color);
    this.alpha.spawn(x, y, z, vx, vy, vz, life, size * 0.5, size * 1.8, c.r, c.g, c.b, a, 1.8, -1.2);
  }

  glow(x, y, z, color, life = 0.3, size = 2) {
    c.set(color);
    this.add.spawn(x, y, z, 0, 0, 0, life, size, size * 1.6, c.r, c.g, c.b, 0.8, 0, 0);
  }

  burst(x, y, z, color, count = 14, speed = 8, life = 0.6, size = 0.35) {
    for (let i = 0; i < count * this.mul; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.spark(x, y, z, Math.cos(a) * sp, Math.sin(e) * sp + 2, Math.sin(a) * sp, color, life * (0.6 + Math.random() * 0.6), size);
    }
  }

  confetti(x, y, z, count = 40) {
    const cols = [0xff4a4a, 0x4aa8ff, 0xffd23f, 0x6be07a, 0xff8fd0, 0xb28dff];
    for (let i = 0; i < count * this.mul; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 9;
      c.set(cols[i % cols.length]);
      this.add.spawn(x, y + 1, z, Math.cos(a) * sp, 8 + Math.random() * 10, Math.sin(a) * sp, 2.2 + Math.random(), 0.35, 0.25, c.r, c.g, c.b, 1, 0.6, 12);
    }
  }
}
