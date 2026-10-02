// Procedural karts and drivers. Everything is merged into a few vertex-coloured meshes
// so six karts cost well under 60 draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blobShadowTexture, glowTexture } from './textures.js';
import { part, box, sph, cone, cyl, TORUS } from './geo.js';

const TORUS_G = TORUS;

const HALF_PI = Math.PI / 2;

function buildChassis(col) {
  const kart = col.kart;
  const trim = col.trim;
  const dark = 0x23262e;
  const parts = [
    box(kart, 1.5, 0.28, 2.7, [0, 0.4, 0]),
    box(kart, 1.0, 0.22, 0.9, [0, 0.38, 1.55]),
    box(trim, 1.2, 0.12, 0.2, [0, 0.38, 2.0]),
    box(kart, 0.4, 0.34, 1.3, [0.98, 0.45, -0.05]),
    box(kart, 0.4, 0.34, 1.3, [-0.98, 0.45, -0.05]),
    box(trim, 0.42, 0.12, 1.32, [0.98, 0.64, -0.05]),
    box(trim, 0.42, 0.12, 1.32, [-0.98, 0.64, -0.05]),
    box(trim, 1.1, 0.5, 0.65, [0, 0.8, -1.1]),
    box(dark, 1.0, 0.12, 0.2, [0, 0.8, -1.46]),
    cyl(0x8d949e, 0.1, 0.55, [0.38, 0.55, -1.65], [HALF_PI, 0, 0]),
    cyl(0x8d949e, 0.1, 0.55, [-0.38, 0.55, -1.65], [HALF_PI, 0, 0]),
    // spoiler
    box(trim, 0.09, 0.55, 0.12, [0.62, 1.05, -1.4]),
    box(trim, 0.09, 0.55, 0.12, [-0.62, 1.05, -1.4]),
    box(col.accent ?? 0xffffff, 1.7, 0.09, 0.55, [0, 1.34, -1.42], [0.12, 0, 0]),
    box(kart, 0.09, 0.3, 0.6, [0.85, 1.28, -1.42]),
    box(kart, 0.09, 0.3, 0.6, [-0.85, 1.28, -1.42]),
    // seat
    box(dark, 0.95, 0.7, 0.25, [0, 1.0, -0.62], [-0.18, 0, 0]),
    box(dark, 0.95, 0.14, 0.75, [0, 0.62, -0.25]),
    // headlights
    box(0xfff3b0, 0.26, 0.14, 0.1, [0.36, 0.42, 2.02]),
    box(0xfff3b0, 0.26, 0.14, 0.1, [-0.36, 0.42, 2.02]),
    // steering column + wheel
    cyl(dark, 0.05, 0.6, [0, 0.82, 0.58], [-0.9, 0, 0]),
    part(TORUS_G, 0x2d313a, { pos: [0, 1.08, 0.42], rot: [-0.55, 0, 0], scale: [0.2, 0.2, 0.2] }),
  ];
  return mergeGeometries(parts, false);
}

function wheelGeometry(radius, width, tire, hub) {
  const parts = [
    cyl(tire, radius, width, [0, 0, 0], [0, 0, HALF_PI]),
    cyl(hub, radius * 0.55, width + 0.06, [0, 0, 0], [0, 0, HALF_PI]),
    box(tire, 0.06, radius * 1.7, width * 0.5, [0, 0, 0], [0, 0, 0]),
  ];
  return mergeGeometries(parts, false);
}

/** Driver body (torso, limbs, species extras) and head, in separate geometries so the head can turn. */
function buildDriver(ch) {
  const c = ch.colors;
  const body = [];
  const head = [];
  const eye = (x, y, z, r = 0.12, iris = 0x1b1b1b) => {
    head.push(sph(0xffffff, r, r * 1.1, r * 0.7, [x, y, z]));
    head.push(sph(iris, r * 0.55, r * 0.6, r * 0.4, [x, y, z + r * 0.45]));
  };
  // shared torso and arms (arms reach toward the wheel)
  body.push(cyl(c.body, 0.38, 0.8, [0, 1.35, -0.25], [-0.15, 0, 0], 0.45));
  body.push(box(c.accent, 0.5, 0.45, 0.1, [0, 1.35, 0.02], [-0.15, 0, 0]));
  body.push(cyl(c.body, 0.11, 0.7, [0.45, 1.3, 0.12], [-1.1, 0, 0.15]));
  body.push(cyl(c.body, 0.11, 0.7, [-0.45, 1.3, 0.12], [-1.1, 0, -0.15]));
  body.push(sph(c.trim, 0.13, 0.13, 0.13, [0.28, 1.12, 0.45]));
  body.push(sph(c.trim, 0.13, 0.13, 0.13, [-0.28, 1.12, 0.45]));

  switch (ch.id) {
    case 'ember': {
      head.push(sph(c.body, 0.5, 0.45, 0.48));
      head.push(sph(c.accent, 0.3, 0.2, 0.32, [0, -0.14, 0.34]));
      head.push(sph(0x1b1b1b, 0.08, 0.07, 0.07, [0, -0.07, 0.62]));
      eye(0.2, 0.1, 0.4);
      eye(-0.2, 0.1, 0.4);
      for (const s of [-1, 1]) {
        head.push(cone(c.body, 0.2, 0.55, [s * 0.3, 0.55, -0.02], [0, 0, -s * 0.25]));
        head.push(cone(c.accent, 0.11, 0.35, [s * 0.3, 0.52, 0.04], [0, 0, -s * 0.25]));
        head.push(cone(c.accent, 0.12, 0.22, [s * 0.4, -0.12, 0.3], [0, 0, -s * HALF_PI * 0.9]));
      }
      body.push(cone(c.body, 0.3, 1.0, [0, 0.95, -1.0], [-1.0, 0, 0]));
      body.push(cone(c.accent, 0.18, 0.4, [0, 0.62, -1.4], [-1.0, 0, 0]));
      break;
    }
    case 'bruno': {
      head.push(sph(c.body, 0.55, 0.48, 0.52));
      head.push(sph(c.accent, 0.26, 0.2, 0.22, [0, -0.15, 0.38]));
      head.push(sph(0x1b1b1b, 0.09, 0.07, 0.07, [0, -0.06, 0.58]));
      eye(0.2, 0.12, 0.42, 0.1);
      eye(-0.2, 0.12, 0.42, 0.1);
      for (const s of [-1, 1]) {
        head.push(sph(c.body, 0.18, 0.18, 0.12, [s * 0.4, 0.42, -0.05]));
        head.push(sph(c.accent, 0.1, 0.1, 0.08, [s * 0.4, 0.42, 0.04]));
      }
      body.push(sph(c.body, 0.48, 0.5, 0.4, [0, 1.3, -0.35]));
      break;
    }
    case 'zip': {
      head.push(box(c.body, 0.85, 0.7, 0.75));
      head.push(box(0x14182a, 0.7, 0.3, 0.1, [0, 0.05, 0.4]));
      head.push(box(c.accent, 0.5, 0.1, 0.06, [0, 0.05, 0.46]));
      head.push(cyl(c.accent, 0.17, 0.12, [0.5, 0, 0], [0, 0, HALF_PI]));
      head.push(cyl(c.accent, 0.17, 0.12, [-0.5, 0, 0], [0, 0, HALF_PI]));
      head.push(cyl(0x8d949e, 0.04, 0.4, [0, 0.55, 0]));
      head.push(sph(0xff4a4a, 0.1, 0.1, 0.1, [0, 0.8, 0]));
      head.push(box(c.trim, 0.3, 0.06, 0.05, [0, -0.2, 0.4]));
      body.push(box(c.body, 0.8, 0.8, 0.5, [0, 1.3, -0.3]));
      break;
    }
    case 'mochi': {
      head.push(sph(c.body, 0.5, 0.45, 0.48));
      head.push(sph(0xff7fb0, 0.06, 0.05, 0.05, [0, -0.05, 0.6]));
      eye(0.19, 0.1, 0.4, 0.1);
      eye(-0.19, 0.1, 0.4, 0.1);
      head.push(sph(0xff8fbc, 0.12, 0.08, 0.05, [0.3, -0.1, 0.4]));
      head.push(sph(0xff8fbc, 0.12, 0.08, 0.05, [-0.3, -0.1, 0.4]));
      for (const s of [-1, 1]) {
        head.push(sph(c.body, 0.14, 0.62, 0.1, [s * 0.2, 1.0, -0.12], [-0.25, 0, -s * 0.12]));
        head.push(sph(0xff9ec4, 0.075, 0.5, 0.05, [s * 0.2, 1.0, -0.05], [-0.25, 0, -s * 0.12]));
      }
      body.push(sph(c.accent, 0.22, 0.22, 0.22, [0, 1.0, -0.95]));
      break;
    }
    case 'vex': {
      head.push(sph(c.body, 0.5, 0.45, 0.48));
      head.push(box(c.body, 0.42, 0.26, 0.4, [0, -0.1, 0.45]));
      head.push(sph(0x103018, 0.05, 0.05, 0.05, [0.1, -0.02, 0.66]));
      head.push(sph(0x103018, 0.05, 0.05, 0.05, [-0.1, -0.02, 0.66]));
      eye(0.22, 0.16, 0.34, 0.1, 0xd4a017);
      eye(-0.22, 0.16, 0.34, 0.1, 0xd4a017);
      for (const s of [-1, 1]) {
        head.push(cone(c.accent, 0.12, 0.6, [s * 0.24, 0.55, -0.12], [-0.7, 0, -s * 0.3]));
      }
      for (let i = 0; i < 4; i++) body.push(cone(c.accent, 0.12 - i * 0.012, 0.3, [0, 1.62 - i * 0.2, -0.75 - i * 0.04], [-0.5, 0, 0]));
      for (const s of [-1, 1]) body.push(box(c.body, 0.05, 0.55, 0.7, [s * 0.42, 1.4, -0.5], [0, 0, -s * 0.4]));
      body.push(cone(c.body, 0.22, 0.9, [0, 0.9, -1.05], [-1.2, 0, 0]));
      break;
    }
    case 'nova': {
      head.push(sph(c.body, 0.52, 0.5, 0.48));
      head.push(sph(c.accent, 0.4, 0.28, 0.1, [0, -0.02, 0.4]));
      for (const s of [-1, 1]) {
        head.push(sph(0xffffff, 0.2, 0.2, 0.1, [s * 0.2, 0.08, 0.44]));
        head.push(sph(0x1b1b1b, 0.1, 0.1, 0.06, [s * 0.2, 0.08, 0.52]));
        head.push(cone(c.body, 0.12, 0.34, [s * 0.32, 0.52, -0.02], [0, 0, -s * 0.35]));
      }
      head.push(cone(0xffb830, 0.1, 0.28, [0, -0.08, 0.58], [HALF_PI, 0, 0]));
      for (const s of [-1, 1]) body.push(sph(c.accent, 0.12, 0.45, 0.28, [s * 0.5, 1.3, -0.4], [0, 0, -s * 0.2]));
      body.push(sph(c.body, 0.45, 0.5, 0.4, [0, 1.3, -0.35]));
      break;
    }
    case 'pip': {
      head.push(sph(c.body, 0.5, 0.47, 0.48));
      head.push(sph(c.accent, 0.36, 0.34, 0.2, [0, -0.04, 0.34]));
      eye(0.15, 0.1, 0.5, 0.1);
      eye(-0.15, 0.1, 0.5, 0.1);
      head.push(cone(0xffa31a, 0.12, 0.3, [0, -0.1, 0.68], [HALF_PI, 0, 0]));
      for (const s of [-1, 1]) body.push(box(c.body, 0.12, 0.6, 0.4, [s * 0.5, 1.25, -0.2], [0, 0, -s * 0.5]));
      body.push(sph(c.accent, 0.3, 0.42, 0.12, [0, 1.3, 0.05]));
      break;
    }
    case 'hopper': {
      head.push(sph(c.body, 0.56, 0.4, 0.5));
      for (const s of [-1, 1]) {
        head.push(sph(c.body, 0.2, 0.2, 0.2, [s * 0.28, 0.4, 0.15]));
        head.push(sph(0xffffff, 0.15, 0.15, 0.12, [s * 0.28, 0.42, 0.28]));
        head.push(sph(0x1b1b1b, 0.08, 0.08, 0.06, [s * 0.28, 0.42, 0.37]));
        head.push(sph(0xff8fa3, 0.09, 0.07, 0.04, [s * 0.4, -0.1, 0.42]));
      }
      head.push(box(0x2b6a2b, 0.5, 0.05, 0.1, [0, -0.15, 0.47]));
      body.push(sph(c.accent, 0.4, 0.45, 0.2, [0, 1.25, 0.0]));
      break;
    }
    case 'kiko': {
      head.push(sph(c.body, 0.54, 0.48, 0.5));
      for (const s of [-1, 1]) {
        head.push(sph(c.accent, 0.17, 0.17, 0.12, [s * 0.4, 0.42, -0.05]));
        head.push(sph(c.accent, 0.15, 0.2, 0.08, [s * 0.2, 0.08, 0.44], [0, 0, -s * 0.5]));
        head.push(sph(0xffffff, 0.05, 0.05, 0.04, [s * 0.2, 0.1, 0.5]));
      }
      head.push(sph(c.body, 0.2, 0.14, 0.16, [0, -0.13, 0.42]));
      head.push(sph(c.accent, 0.07, 0.05, 0.05, [0, -0.07, 0.56]));
      body.push(sph(c.body, 0.5, 0.52, 0.42, [0, 1.3, -0.35]));
      break;
    }
    case 'rusty': {
      head.push(sph(c.body, 0.52, 0.45, 0.5));
      head.push(box(c.accent, 0.86, 0.2, 0.2, [0, 0.08, 0.38]));
      head.push(sph(0xe8e8ee, 0.2, 0.16, 0.22, [0, -0.12, 0.4]));
      head.push(sph(0x1b1b1b, 0.07, 0.06, 0.06, [0, -0.07, 0.6]));
      for (const s of [-1, 1]) {
        eye(s * 0.2, 0.09, 0.5, 0.08);
        head.push(cone(c.body, 0.16, 0.3, [s * 0.34, 0.48, -0.02], [0, 0, -s * 0.2]));
      }
      for (let i = 0; i < 4; i++) body.push(sph(i % 2 ? c.accent : c.body, 0.26 - i * 0.02, 0.26 - i * 0.02, 0.3, [0, 0.9 + i * 0.07, -0.9 - i * 0.28]));
      break;
    }
    case 'zed': {
      head.push(sph(c.body, 0.46, 0.58, 0.46));
      for (const s of [-1, 1]) {
        head.push(sph(0x14101f, 0.19, 0.28, 0.1, [s * 0.2, 0.06, 0.4], [0, 0, -s * 0.5]));
        head.push(sph(0xffffff, 0.05, 0.07, 0.03, [s * 0.15, 0.14, 0.48]));
        head.push(cyl(0x7a8a3a, 0.025, 0.4, [s * 0.18, 0.78, 0], [0, 0, -s * 0.3]));
        head.push(sph(c.accent, 0.09, 0.09, 0.09, [s * 0.26, 0.98, 0]));
      }
      head.push(box(0x14101f, 0.14, 0.03, 0.04, [0, -0.25, 0.43]));
      body.push(cyl(c.accent, 0.36, 0.6, [0, 1.3, -0.25], [-0.15, 0, 0], 0.42));
      break;
    }
    case 'sol': {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        head.push(sph(c.accent, 0.2, 0.2, 0.2, [Math.cos(a) * 0.52, Math.sin(a) * 0.5, -0.12]));
      }
      head.push(sph(c.accent, 0.56, 0.54, 0.3, [0, 0, -0.12]));
      head.push(sph(c.body, 0.46, 0.43, 0.44, [0, 0, 0.1]));
      head.push(sph(0xfff0c8, 0.22, 0.16, 0.2, [0, -0.13, 0.46]));
      head.push(sph(0x3a1b10, 0.08, 0.06, 0.06, [0, -0.04, 0.64]));
      for (const s of [-1, 1]) {
        eye(s * 0.19, 0.1, 0.44, 0.09, 0x6b3a10);
        head.push(sph(c.body, 0.12, 0.12, 0.08, [s * 0.34, 0.36, 0.05]));
      }
      body.push(cone(c.body, 0.2, 0.9, [0, 0.9, -1.0], [-1.1, 0, 0]));
      body.push(sph(c.accent, 0.2, 0.2, 0.2, [0, 0.62, -1.4]));
      break;
    }
    default:
      head.push(sph(c.body, 0.5));
  }
  return { body: mergeGeometries(body, false), head: mergeGeometries(head, false) };
}

const glowTex = { v: null };

export class KartModel {
  constructor(character, { shadowTexture, envMap } = {}) {
    this.char = character;
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.root.add(this.tilt);

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.12, envMap: envMap || null, envMapIntensity: 0.9 });
    this.mat = mat;
    const chassis = new THREE.Mesh(buildChassis(character.colors), mat);
    chassis.castShadow = true;
    this.tilt.add(chassis);

    const d = buildDriver(character);
    const driverBody = new THREE.Mesh(d.body, mat);
    driverBody.castShadow = true;
    this.tilt.add(driverBody);
    this.head = new THREE.Mesh(d.head, mat);
    this.head.position.set(0, 1.95, -0.25);
    this.head.castShadow = true;
    this.tilt.add(this.head);

    // wheels
    const tire = 0x1b1c22;
    const hub = 0xd9dde4;
    const frontGeo = wheelGeometry(0.36, 0.32, tire, hub);
    const rearGeo = wheelGeometry(0.44, 0.4, tire, hub);
    this.wheels = [];
    this.frontPivots = [];
    const mk = (geo, x, y, z, steer) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const w = new THREE.Mesh(geo, mat);
      w.castShadow = true;
      pivot.add(w);
      this.tilt.add(pivot);
      this.wheels.push(w);
      if (steer) this.frontPivots.push(pivot);
    };
    mk(frontGeo, 0.95, 0.36, 1.05, true);
    mk(frontGeo, -0.95, 0.36, 1.05, true);
    mk(rearGeo, 1.0, 0.44, -1.0, false);
    mk(rearGeo, -1.0, 0.44, -1.0, false);

    // effects
    if (!glowTex.v) glowTex.v = glowTexture('rgba(255,255,255,1)');
    this.shieldMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform float uAlpha; varying vec3 vN; varying vec3 vV;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
          float bands = 0.5 + 0.5 * sin(vN.y * 16.0 + uTime * 3.0);
          float a = (0.07 + f * 0.9 + bands * 0.07) * uAlpha;
          gl_FragColor = vec4(vec3(0.3, 0.85, 1.0) + f * 0.45, a);
        }`,
    });
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(2.3, 24, 16), this.shieldMat);
    this.shieldMesh.position.y = 1.1;
    this.shieldMesh.visible = false;
    this.tilt.add(this.shieldMesh);

    this.flames = [];
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 1, 8),
        new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      f.rotation.x = -HALF_PI;
      f.position.set(s * 0.38, 0.55, -2.2);
      f.visible = false;
      this.tilt.add(f);
      this.flames.push(f);
    }

    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex.v, color: 0xffd36a, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.aura.scale.set(6, 6, 1);
    this.aura.position.y = 1.2;
    this.tilt.add(this.aura);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 4.6),
      new THREE.MeshBasicMaterial({ map: shadowTexture ?? blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -HALF_PI;
    this.shadow.position.y = 0.06;
    this.shadow.renderOrder = 2;

    this.wheelRoll = 0;
    this.bob = Math.random() * 6;
    this.yawVis = 0;
    this.rollVis = 0;
    this.pitchVis = 0;
  }

  /** Add to a scene. The blob shadow lives at world level so it stays flat on the road. */
  addTo(scene) {
    scene.add(this.root);
    scene.add(this.shadow);
  }

  removeFrom(scene) {
    scene.remove(this.root);
    scene.remove(this.shadow);
  }

  update(dt, kart, time) {
    const r = this.root;
    const spin = kart.spinAngle || 0;
    const driftYaw = kart.drifting ? kart.driftDir * 0.32 : 0;
    this.yawVis += (driftYaw - this.yawVis) * (1 - Math.exp(-12 * dt));
    r.position.set(kart.x, kart.airY + (kart.hopT > 0 ? Math.sin((1 - kart.hopT / 0.26) * Math.PI) * 0.0 : 0), kart.z);
    r.rotation.y = kart.h + this.yawVis + spin;

    // lean into corners, pitch with acceleration
    const turn = -kart.steer;
    const targetRoll = -turn * 0.1 * Math.min(1, kart.speedNorm * 1.4) - (kart.drifting ? kart.driftDir * 0.06 : 0);
    this.rollVis += (targetRoll - this.rollVis) * (1 - Math.exp(-9 * dt));
    const accel = kart.controls.throttle > 0 && kart.speed < kart.stats.vmax * 0.8 ? 0.035 : 0;
    this.pitchVis += (accel - this.pitchVis) * (1 - Math.exp(-6 * dt));
    this.tilt.rotation.z = this.rollVis;
    this.tilt.rotation.x = -this.pitchVis;
    const rough = kart.surface !== 'road' && kart.speed > 6 ? 1 : 0;
    this.tilt.position.y = rough * Math.sin(time * 38 + this.bob) * 0.035;

    this.wheelRoll += (kart.speed * dt) / 0.4;
    for (const w of this.wheels) w.rotation.x = this.wheelRoll;
    for (const p of this.frontPivots) p.rotation.y = -kart.steer * 0.5;
    this.head.rotation.y = -kart.steer * 0.35;
    this.head.rotation.z = this.rollVis * -1.5;
    this.head.position.y = 1.95 + Math.sin(time * 6 + this.bob) * 0.015;

    this.shieldMesh.visible = kart.shield > 0;
    if (kart.shield > 0) {
      this.shieldMat.uniforms.uTime.value = time;
      this.shieldMat.uniforms.uAlpha.value = kart.shield < 2 ? (Math.sin(time * 30) > 0 ? 1 : 0.3) : 1;
      this.shieldMesh.scale.setScalar(1 + Math.sin(time * 5) * 0.03);
    }
    const boosting = kart.boostTimer > 0 || kart.comet > 0;
    for (const f of this.flames) {
      f.visible = boosting;
      if (boosting) {
        const k = 1 + Math.sin(time * 60 + f.position.x * 10) * 0.25;
        f.scale.set(1, (1.6 + (kart.comet > 0 ? 1.2 : 0)) * k, 1);
        f.position.z = -2.0 - f.scale.y * 0.5;
      }
    }
    this.aura.material.opacity = kart.comet > 0 ? 0.65 + Math.sin(time * 14) * 0.15 : 0;
    if (kart.comet > 0) this.aura.material.color.setHex(0xffe08a);

    // invulnerability blink after a hit
    this.root.visible = !(kart.invuln > 0 && kart.spin <= 0 && Math.floor(time * 16) % 2 === 0 && !kart.comet);

    this.shadow.position.set(kart.x, 0.07, kart.z);
    this.shadow.rotation.z = kart.h + this.yawVis;
    const lift = Math.max(0, 1 - kart.airY * 0.6);
    this.shadow.material.opacity = 0.9 * lift;
    this.shadow.visible = this.root.visible;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.mat.dispose();
  }
}
