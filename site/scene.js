// The WebGL stage behind the whole page: one renderer, one scene, one fixed canvas.
//
// GSAP scrubs plain numbers on `scene.p` (intro, charge, boost, roster). This file only reads
// them. A "stage" (hero, drift, roster, finale, idle) sets where the karts and camera want to
// be and everything eases toward it, so a fast scroll never leaves the scene half-built.
//
// The karts, particles and drift colors are the game's own (src/render, src/game), so the page
// shows exactly what you get when you press Play. The dotted floor and the streak lines borrow
// two ideas from ThreeUI (threeui.com): a halftone dot mask and "warp field" line segments.

import * as THREE from 'three';
import { KartModel } from '../src/render/kartModel.js';
import { Particles } from '../src/render/particles.js';
import { blobShadowTexture } from '../src/render/textures.js';
import { CHARACTERS } from '../src/game/characters.js';
import { DRIFT_LEVELS } from '../src/game/kart.js';
import { damp, dampAngle, smoothstep, TAU } from '../src/util/math.js';

const BG = 0x0b0e1f;
const ACCENT = 0xffcf2e;
const R = 11; // radius of the drift circle, also drawn as the road on the floor
const FOLLOW = 7; // how fast karts ease toward their stage pose (1/s)
const CAM_FOLLOW = 4.5;
const SPACING = 9; // distance between karts in the roster line
const HERO_KARTS = [0, 2, 4]; // Ember, Zip, Vex
const SPARK_COLORS = [0xfff1c2, DRIFT_LEVELS[0].color, DRIFT_LEVELS[1].color, DRIFT_LEVELS[2].color];

const FLOOR_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Halftone dots on a world-space grid, brighter on the road ring and along a travelling wave.
const FLOOR_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uBg;
uniform vec3 uAccent;
uniform vec2 uCam;
varying vec3 vW;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 xz = vW.xz;
  vec2 g = xz / 1.25;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float n = hash(id);
  float r = length(xz);
  float roadD = abs(r - ${R.toFixed(1)});
  float road = 1.0 - smoothstep(2.6, 3.4, roadD);
  float wave = 0.5 + 0.5 * sin(r * 0.6 - uTime * 2.2 + n * 2.0);
  float rad = mix(0.05, 0.2, clamp(wave * 0.55 + n * 0.35 + road * 0.25, 0.0, 1.0));
  float dotMask = smoothstep(rad, rad - 0.08, length(f));
  float fade = exp(-length(xz) * 0.034) * exp(-distance(xz, uCam) * 0.006);

  vec3 col = uBg + vec3(0.016, 0.02, 0.05) * road;
  col += uAccent * dotMask * fade * (0.2 + 0.7 * road) * 0.7;

  float a = atan(xz.y, xz.x);
  float dash = step(0.5, fract(a / 6.2831853 * 40.0));
  float line = (1.0 - smoothstep(0.07, 0.16, roadD)) * dash;
  col += uAccent * line * fade * 0.45;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const tmpV = new THREE.Vector3();

export class LandingScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(BG);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 420);
    this.scene.add(this.camera);

    this.scene.add(new THREE.HemisphereLight(0xa9bcff, 0x1a2046, 1.9));
    const key = new THREE.DirectionalLight(0xfff0d0, 2.6);
    key.position.set(-14, 24, 16);
    const rim = new THREE.DirectionalLight(0x6f8cff, 1.3);
    rim.position.set(18, 10, -20);
    this.scene.add(key, rim);

    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uBg: { value: new THREE.Color(BG) },
        uAccent: { value: new THREE.Color(ACCENT) },
        uCam: { value: new THREE.Vector2() },
      },
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 1, 1), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.02;
    this.scene.add(this.floor);

    this._buildStreaks();

    this.shadowTex = blobShadowTexture();
    this.models = CHARACTERS.map((c) => {
      const m = new KartModel(c, { shadowTexture: this.shadowTex });
      m.addTo(this.scene);
      m.root.visible = false;
      m.shadow.visible = false;
      return m;
    });
    this.fake = CHARACTERS.map(() => ({
      x: 0, z: 0, h: 0, vx: 0, vz: 0, speed: 0, steer: 0, drifting: false, driftDir: 0, spinAngle: 0, airY: 0, hopT: 0,
      shield: 0, boostTimer: 0, comet: 0, invuln: 0, spin: 0, surface: 'road', speedNorm: 0.5,
      controls: { throttle: 1 }, stats: { vmax: 36 },
    }));
    this.slots = CHARACTERS.map(() => ({ x: R, z: 0, h: 0, s: 0 }));
    this.tg = CHARACTERS.map(() => ({ x: 0, z: 0, h: 0, s: 0, drifting: false, level: 0, boosting: false, focus: 0 }));
    this.sparkAcc = CHARACTERS.map(() => 0);
    this.particles = new Particles(this.scene, 'medium');

    // Numbers the page scrubs with GSAP.
    this.p = { intro: 0, charge: 0, boost: 0, roster: 0 };

    this.stage = 'hero';
    this.active = true;
    this.running = false;
    this.time = 0;
    this.theta = 0;
    this.omega = 0.85;
    this.aspect = 16 / 9;
    this.pointer = { x: 0, y: 0 };
    this.px = 0;
    this.py = 0;
    this.camPos = new THREE.Vector3(0, 8, 40);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    this.fov = 40;
    this.pointerOn = false;
    this.off = { x: 0, y: 0 };
    this.offApplied = { x: 9, y: 9 };
    this.w = 1;
    this.h = 1;

    this._onPointer = (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    this._resizeObs = new ResizeObserver(() => this.resize());
    this._resizeObs.observe(canvas);
    this.resize();
  }

  // ---- lifecycle ----------------------------------------------------------------------------

  /** Live mode: render loop on, pointer parallax on (fine pointers only). */
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !this.pointerOn) {
      window.addEventListener('pointermove', this._onPointer, { passive: true });
      this.pointerOn = true;
    }
    const tick = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (document.hidden || !this.active) return;
      this.update(dt);
      this.render();
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Static mode: stop the loop and draw one settled frame (reduced motion). */
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.pointerOn) {
      window.removeEventListener('pointermove', this._onPointer);
      this.pointerOn = false;
    }
    this.renderStill();
  }

  renderStill() {
    this.stage = 'hero';
    this.p.intro = 1;
    this.time = 4.2;
    this.update(10);
    this.render();
  }

  setStage(name) {
    this.stage = name;
    this.active = name !== 'idle';
  }

  /** Confetti burst for the finale. */
  celebrate() {
    for (let i = 0; i < 6; i++) {
      this.particles.confetti((Math.random() - 0.5) * 16 + 4, 4, -2 + (Math.random() - 0.5) * 6, 36);
    }
  }

  dispose() {
    this.stop();
    this._resizeObs.disconnect();
    this.models.forEach((m) => m.dispose());
    this.renderer.dispose();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, w < 700 ? 1.5 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.w = w;
    this.h = h;
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this._applyOffset(true);
    if (!this.running) this.render();
  }

  /**
   * Text sits on the left on desktop and on top on phones, so the scene is pushed right or down.
   * The amount depends on the stage (the roster text is taller than the hero text on a phone).
   */
  _applyOffset(snap, dt = 0) {
    const portrait = this.aspect < 1.1;
    let tx = -0.18;
    let ty = 0;
    if (portrait) {
      tx = 0;
      ty = this.stage === 'hero' || this.stage === 'finale' ? -0.22 : -0.3;
    }
    const k = snap ? 1 : 1 - Math.exp(-4 * dt);
    this.off.x += (tx - this.off.x) * k;
    this.off.y += (ty - this.off.y) * k;
    if (snap || Math.abs(this.off.x - this.offApplied.x) > 0.0004 || Math.abs(this.off.y - this.offApplied.y) > 0.0004) {
      this.camera.setViewOffset(this.w, this.h, this.off.x * this.w, this.off.y * this.h, this.w, this.h);
      this.offApplied.x = this.off.x;
      this.offApplied.y = this.off.y;
    }
  }

  // ---- streak lines (the "warp field" idea) -------------------------------------------------

  _buildStreaks() {
    const N = 220;
    this.streakN = N;
    this.streakBase = new Float32Array(N * 4); // x, y, z, length
    const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const a = (Math.random() - 0.5) * (Math.PI + 1.0); // right-hand half-plane, so lines do not cross the copy
      const r = 5 + Math.random() * 24;
      this.streakBase[i * 4] = Math.cos(a) * r;
      this.streakBase[i * 4 + 1] = Math.sin(a) * r * 0.6;
      this.streakBase[i * 4 + 2] = -3 - Math.random() * 100;
      this.streakBase[i * 4 + 3] = 4 + Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    this.streakPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.streakPos);
    this.streakMat = new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.streaks = new THREE.LineSegments(geo, this.streakMat);
    this.streaks.frustumCulled = false;
    this.camera.add(this.streaks);
  }

  _updateStreaks(dt, boost) {
    const speed = 30 + boost * 150;
    const stretch = 0.4 + boost * 1.6;
    const b = this.streakBase;
    const a = this.streakPos.array;
    for (let i = 0; i < this.streakN; i++) {
      let z = b[i * 4 + 2] + speed * dt;
      if (z > -2) z = -100 - Math.random() * 10;
      b[i * 4 + 2] = z;
      const x = b[i * 4];
      const y = b[i * 4 + 1];
      a[i * 6] = x;
      a[i * 6 + 1] = y;
      a[i * 6 + 2] = z;
      a[i * 6 + 3] = x;
      a[i * 6 + 4] = y;
      a[i * 6 + 5] = z - b[i * 4 + 3] * stretch;
    }
    this.streakPos.needsUpdate = true;
    this.streakMat.opacity = boost * 0.6;
    this.streaks.visible = boost > 0.01;
  }

  // ---- poses --------------------------------------------------------------------------------

  /** Where kart `i` wants to be on the current stage. Fills and returns `out`. */
  _target(i, out) {
    const st = this.stage;
    const lead = this.omega / FOLLOW; // aim slightly ahead so a circling kart does not lag behind its target
    out.s = 0;
    out.drifting = false;
    out.level = 0;
    out.boosting = false;
    out.focus = 0;
    const circle = (th) => {
      out.x = R * Math.cos(th);
      out.z = R * Math.sin(th);
      out.h = -th;
    };
    const hero = HERO_KARTS.indexOf(i);

    if (st === 'hero' && hero >= 0) {
      circle(this.theta + (hero * TAU) / 3 + lead);
      out.s = this.p.intro * (this.aspect < 1.1 ? 1.35 : 1);
      // A 9 second loop per kart, offset so the three show different charge colors at once.
      const ph = (this.time + hero * 3) % 9;
      if (ph < 7.5) {
        const charge = ph / 2.5;
        out.drifting = true;
        out.level = charge < 0.12 ? 0 : charge < 1 ? 1 : charge < 2 ? 2 : 3;
      } else {
        out.boosting = true;
      }
    } else if (st === 'drift' && i === 0) {
      circle(this.theta + lead);
      out.s = 1;
      if (this.p.boost > 0.02) out.boosting = true;
      else {
        out.drifting = true;
        const c = this.p.charge;
        out.level = c < 0.04 ? 0 : c < 1 ? 1 : c < 2 ? 2 : 3;
      }
    } else if (st === 'roster') {
      const d = Math.abs(this.p.roster - i);
      const focus = 1 - smoothstep(0.2, 0.9, d);
      out.x = (i - (CHARACTERS.length - 1) / 2) * SPACING;
      out.z = 0;
      out.h = 0.5 + focus * this.time * 0.7;
      out.s = 0.85 + focus * 0.45;
      out.focus = focus;
    } else if (st === 'finale') {
      const row = i % 2;
      const col = Math.floor(i / 2);
      out.x = (col - 1) * 5.8 + (row ? 1.9 : -1.9);
      out.z = -col * 1.2 - row * 4.8;
      out.h = 0.55 + (i - 2.5) * -0.06 + Math.sin(this.time * 0.6 + i) * 0.05;
      out.s = 1.05;
    } else {
      // Parked: sit on the circle at zero size so the next stage can grow them back in place.
      circle(this.theta + i + lead);
    }
    return out;
  }

  _camera(dt) {
    const p = this.p;
    const portrait = this.aspect < 1.1;
    const pull = portrait ? 1.05 + (1.1 - this.aspect) * 0.35 : 1; // tight: one subject fills the narrow screen
    const pullWide = portrait ? 1 + (1.1 - this.aspect) * 1.1 : 1; // wide: the whole line-up has to fit
    const fovBase = portrait ? 58 : 40;
    let fov = fovBase;
    const pos = tmpV;
    const look = this.camLookTarget || (this.camLookTarget = new THREE.Vector3());
    const camLead = this.omega / CAM_FOLLOW;

    if (this.stage === 'drift') {
      const th = this.theta + camLead;
      const fx = -Math.sin(th);
      const fz = Math.cos(th);
      const ox = Math.cos(th);
      const oz = Math.sin(th);
      const k = R * Math.cos(th);
      const kz = R * Math.sin(th);
      const chase = Math.min(pull, 1.2);
      const back = (10.5 - p.charge * 0.9 + p.boost * 3.5) * chase;
      const out = 5.2 * chase;
      pos.set(k - fx * back + ox * out, 3.4 + p.charge * 0.15, kz - fz * back + oz * out);
      look.set(k + fx * 3, 1.2, kz + fz * 3);
      fov = fovBase + p.boost * 15;
    } else if (this.stage === 'roster') {
      const cx = (p.roster - (CHARACTERS.length - 1) / 2) * SPACING;
      pos.set(cx - 3.2 + this.px * 0.8, 3.1 + this.py * -0.3, 17.5 * pull);
      look.set(cx, 1.5, 0);
    } else if (this.stage === 'finale') {
      pos.set(1 + Math.sin(this.time * 0.25) * 2.2, 4.6, 21 * pullWide);
      look.set(0, 1.6, -2.2);
    } else {
      const k = 1 + (1 - p.intro) * 0.45;
      pos.set(this.px * 1.6, 6.4 - this.py * 0.9, 29.5 * k * (portrait ? pull * 0.82 : 1));
      look.set(0, 1.2, portrait ? 5 : 0);
    }

    this.camPos.x = damp(this.camPos.x, pos.x, CAM_FOLLOW, dt);
    this.camPos.y = damp(this.camPos.y, pos.y, CAM_FOLLOW, dt);
    this.camPos.z = damp(this.camPos.z, pos.z, CAM_FOLLOW, dt);
    this.camLook.x = damp(this.camLook.x, look.x, CAM_FOLLOW, dt);
    this.camLook.y = damp(this.camLook.y, look.y, CAM_FOLLOW, dt);
    this.camLook.z = damp(this.camLook.z, look.z, CAM_FOLLOW, dt);
    this.fov = damp(this.fov, fov, 6, dt);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  // ---- frame --------------------------------------------------------------------------------

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.px = damp(this.px, this.pointer.x, 3, dt);
    this.py = damp(this.py, this.pointer.y, 3, dt);

    const boost = this.stage === 'drift' ? this.p.boost : 0;
    this.omega = 0.85 * (1 + 1.4 * boost);
    this.theta += this.omega * dt;

    for (let i = 0; i < CHARACTERS.length; i++) {
      const tg = this._target(i, this.tg[i]);
      const s = this.slots[i];
      s.x = damp(s.x, tg.x, FOLLOW, dt);
      s.z = damp(s.z, tg.z, FOLLOW, dt);
      s.h = dampAngle(s.h, tg.h, FOLLOW, dt);
      s.s = damp(s.s, tg.s, FOLLOW, dt);

      const f = this.fake[i];
      const m = this.models[i];
      f.x = s.x;
      f.z = s.z;
      f.h = s.h;
      f.drifting = tg.drifting;
      f.driftDir = -1; // the circle is a right-hander, so the nose points inward
      f.steer = tg.drifting || tg.boosting ? 0.55 : Math.sin(t * 1.2 + i) * 0.25;
      f.speed = this.stage === 'roster' || this.stage === 'finale' ? 0 : 9.4 * (1 + 1.4 * (tg.boosting ? boost : 0));
      f.speedNorm = tg.drifting || tg.boosting ? 0.7 : 0.15;
      f.boostTimer = tg.boosting ? 1 : 0;
      m.update(dt, f, t);

      const visible = s.s > 0.03;
      m.root.visible = visible;
      m.shadow.visible = visible;
      const sc = Math.max(0.001, s.s);
      m.root.scale.setScalar(sc);
      m.shadow.scale.setScalar(sc);

      // sparks from the outer rear wheel while a drift is charging
      if (visible && tg.drifting) this._sparks(i, dt, tg.level, sc);
    }

    this._camera(dt);
    this._applyOffset(false, dt);
    this.floorMat.uniforms.uTime.value = t;
    this.floorMat.uniforms.uCam.value.set(this.camera.position.x, this.camera.position.z);
    this._updateStreaks(dt, boost);
    this.particles.update(dt);
  }

  _sparks(i, dt, level, scale) {
    const rate = level === 0 ? 16 : 42 + level * 26;
    this.sparkAcc[i] += rate * dt;
    const n = Math.min(10, Math.floor(this.sparkAcc[i]));
    this.sparkAcc[i] -= n;
    if (!n) return;
    const root = this.models[i].root;
    const psi = root.rotation.y;
    const sin = Math.sin(psi);
    const cos = Math.cos(psi);
    const color = SPARK_COLORS[level];
    for (let k = 0; k < n; k++) {
      const lx = 1.0 * scale;
      const lz = -1.15 * scale;
      const wx = root.position.x + lx * cos + lz * sin;
      const wz = root.position.z - lx * sin + lz * cos;
      const back = 4 + Math.random() * 6;
      const side = 2 + Math.random() * 5;
      this.particles.spark(
        wx, 0.35 * scale, wz,
        -sin * back + cos * side + (Math.random() - 0.5) * 2,
        2.5 + Math.random() * 4.5,
        -cos * back - sin * side + (Math.random() - 0.5) * 2,
        color, 0.3 + Math.random() * 0.3, this.stage === 'drift' ? 0.13 + level * 0.025 : 0.34 + level * 0.06,
      );
    }
  }

  render() {
    this.particles.setScale(this.renderer, this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}

