import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 pcolor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main(){
    vAlpha = alpha; vColor = pcolor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * uScale / max(0.1, -mv.z), 0.0, 220.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

export const pointScale = { value: 800 };

export class ParticleSystem {
  points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private a0: Float32Array;
  private next = 0;
  private geo = new THREE.BufferGeometry();

  constructor(private N: number, additive: boolean) {
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 3);
    this.size = new Float32Array(N); this.alpha = new Float32Array(N);
    this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.maxLife = new Float32Array(N).fill(1);
    this.grav = new Float32Array(N); this.drag = new Float32Array(N);
    this.s0 = new Float32Array(N); this.s1 = new Float32Array(N); this.a0 = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.pos[i * 3 + 1] = -999; this.life[i] = 0; }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: pointScale },
    });
    if (!additive) {
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    }
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(p: THREE.Vector3, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, alpha = 1, grav = 0, drag = 0, sizeEnd = size) {
    const i = this.next; this.next = (this.next + 1) % this.N;
    const j = i * 3;
    this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.col[j] = color.r; this.col[j + 1] = color.g; this.col[j + 2] = color.b;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = size; this.s1[i] = sizeEnd; this.a0[i] = alpha;
    this.size[i] = size; this.alpha[i] = alpha;
    this.grav[i] = grav; this.drag[i] = drag;
  }

  update(dt: number) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const j = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j] *= dr; this.vel[j + 1] = this.vel[j + 1] * dr - this.grav[i] * dt; this.vel[j + 2] *= dr;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.02 && this.grav[i] > 0) { this.pos[j + 1] = 0.02; this.vel[j + 1] *= -0.3; this.vel[j] *= 0.6; this.vel[j + 2] *= 0.6; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fadeIn = Math.min(1, t * 8);
      this.alpha[i] = this.a0[i] * fadeIn * (1 - t) * (1 - t * 0.2);
    }
    const g = this.geo;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.pcolor as THREE.BufferAttribute).needsUpdate = true;
  }
}
