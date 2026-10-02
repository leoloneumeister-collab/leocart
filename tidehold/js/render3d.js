// 3D renderer (Three.js). Loads the GLB models made in Blender (tidehold/blender) and draws the
// island, buildings, animated fighters and effects. A second transparent canvas on top carries
// the 2D overlay: timers, collect bubbles, health bars and floating numbers.
//
// It reads the same "scene" object as the old Canvas2D renderer (render.js) and exposes the same
// methods, so main.js can use either. render.js stays as the fallback when WebGL or the models fail.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as D from './data.js';
import { clamp, mulberry32 } from './util.js';
import { fmtTime } from './data.js';

const L0 = D.LAND0;
const L1 = D.LAND1;
const MID = (L0 + L1) / 2;
const TEAM_COL = { p: '#3d7be0', e: '#d9453f' };
const BUILDING_FILES = Object.keys(D.BUILDINGS).filter((t) => t !== 'wall');
const UNIT_NAMES = D.TROOP_ORDER;
const UNIT_SCALE = { squire: 0.62, slinger: 0.6, sapper: 0.58, brute: 0.58, glider: 0.62 };
const RUN_REF = { squire: 2.2, slinger: 2.2, sapper: 2.9, brute: 1.2, glider: 2.6 }; // tiles per second one run cycle looks right at
const tierOf = (lvl) => (lvl <= 2 ? 1 : lvl <= 4 ? 2 : 3);

// ---------- assets ----------

export const MODEL_BASE = 'models/';

export async function loadAssets(onProgress = () => {}) {
  const loader = new GLTFLoader();
  const A = { b: {}, units: {}, props: {}, mats: null };
  const uTime = { value: 0 };
  A.uTime = uTime;
  A.mats = makeMaterials(uTime);
  const jobs = [];
  for (const t of BUILDING_FILES) jobs.push({ url: `${MODEL_BASE}b_${t}.glb`, kind: 'b', key: t });
  jobs.push({ url: `${MODEL_BASE}b_wall.glb`, kind: 'wall', key: 'wall' });
  jobs.push({ url: `${MODEL_BASE}props.glb`, kind: 'props', key: 'props' });
  for (const u of UNIT_NAMES) jobs.push({ url: `${MODEL_BASE}units/${u}.glb`, kind: 'unit', key: u });
  let done = 0;
  await Promise.all(jobs.map(async (job) => {
    const gltf = await loader.loadAsync(job.url);
    if (job.kind === 'unit') {
      prepare(gltf.scene, A.mats, true);
      const clips = {};
      for (const c of gltf.animations) clips[c.name] = c;
      A.units[job.key] = { root: gltf.scene, clips };
    } else {
      // every top-level node is a separate asset (keep_t1, keep_t2, wall_link_t1, scaffold_3 ...)
      for (const node of [...gltf.scene.children]) {
        gltf.scene.remove(node);
        prepare(node, A.mats, false);
        const clip = gltf.animations.find((c) => c.name === `${node.name}_loop`) || null;
        const box = new THREE.Box3().setFromObject(node);
        const entry = { root: node, clip, height: Math.max(0.4, box.max.y), box };
        if (job.kind === 'props') A.props[node.name] = entry;
        else (A.b[job.key] ||= {})[node.name] = entry;
      }
    }
    onProgress(++done / jobs.length);
  }));
  return A;
}

function windOn(mat, uTime, kind) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float amp = ${kind === 'leaf' ? 'clamp(position.y - 0.9, 0.0, 1.2) * 0.22' : 'max(position.x, -position.y) * 0.16'};
      float ph = uTime * ${kind === 'leaf' ? '1.7' : '4.0'} + position.x * 5.0 + position.y * 3.0;
      transformed.z += sin(ph) * amp;
      transformed.y += cos(ph * 1.3) * amp * 0.3;`);
  };
  mat.customProgramCacheKey = () => 'wind' + kind;
}

function makeMaterials(uTime) {
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  const cloth = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const leaf = cloth.clone();
  windOn(leaf, uTime, 'leaf');
  const banner = {};
  for (const [k, c] of Object.entries(TEAM_COL)) {
    const m = new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide });
    windOn(m, uTime, 'flag');
    banner[k] = m;
  }
  return { lambert, cloth, leaf, banner, glow: {} };
}

// Swap the glTF materials for cheap ones that share state. Marks banners so their team colour can change.
function prepare(root, mats, isUnit) {
  root.traverse((o) => {
    if (!(o.isMesh || o.isSkinnedMesh)) return;
    const m = o.material;
    const name = m.name || '';
    if (name.startsWith('glow_')) {
      mats.glow[name] ||= new THREE.MeshBasicMaterial({ color: m.emissive && m.emissive.getHex() ? m.emissive.clone() : m.color.clone(), toneMapped: false });
      o.material = mats.glow[name];
      o.castShadow = false;
      return;
    }
    if (name === 'banner') {
      o.userData.banner = true;
      o.material = mats.banner.p;
      o.castShadow = false;
      return;
    }
    const inPalm = !isUnit && o.parent && /deco_palm/.test(o.parent.name || '');
    o.material = name.startsWith('cloth') ? (inPalm ? mats.leaf : mats.cloth) : mats.lambert;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = !o.isSkinnedMesh;
  });
}

function cloneTeam(root, mats, team) {
  const c = root.isObject3D ? SkeletonUtils.clone(root) : root;
  c.traverse((o) => {
    if (o.userData && o.userData.banner) o.material = mats.banner[team] || mats.banner.p;
  });
  return c;
}

// ---------- camera ----------

const FOV = 28;
const PITCH = THREE.MathUtils.degToRad(50);
const YAW = THREE.MathUtils.degToRad(45);

export class Camera3D {
  constructor() {
    this.cx = MID;
    this.cy = MID;
    this.zoom = 0.45;
    this.w = 360;
    this.h = 640;
    this.sx = 0;
    this.sy = 0;
    this.cam = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
    this._ray = new THREE.Raycaster();
    this._v = new THREE.Vector3();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  apply() {
    const scale = 45.25 * this.zoom; // pixels per tile along the iso diagonal, same feel as the 2D view
    const dist = this.h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * scale);
    const tx = this.cx + this.sx;
    const tz = this.cy + this.sy;
    const c = this.cam;
    c.position.set(tx + Math.sin(YAW) * Math.cos(PITCH) * dist, Math.sin(PITCH) * dist, tz + Math.cos(YAW) * Math.cos(PITCH) * dist);
    c.lookAt(tx, 0, tz);
    c.aspect = this.w / this.h;
    c.near = Math.max(0.5, dist * 0.2);
    c.far = dist * 6 + 80;
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
  }

  toScreen(x, y, z = 0) {
    this.apply();
    const v = this._v.set(x, z, y).project(this.cam);
    return [(v.x + 1) * 0.5 * this.w, (1 - v.y) * 0.5 * this.h, v.z];
  }

  // Ground point (tile coordinates) under a screen position; z is a height in tiles.
  toWorld(px, py, z = 0) {
    this.apply();
    this._ray.setFromCamera({ x: (px / this.w) * 2 - 1, y: -((py / this.h) * 2 - 1) }, this.cam);
    this._plane.constant = -z;
    const hit = this._ray.ray.intersectPlane(this._plane, this._v);
    return hit ? [hit.x, hit.z] : [this.cx, this.cy];
  }

  panBy(dx, dy) {
    const [a, b] = this.toWorld(this.w / 2, this.h / 2);
    const [a2, b2] = this.toWorld(this.w / 2 - dx, this.h / 2 - dy);
    this.cx += a2 - a;
    this.cy += b2 - b;
    this.clamp();
  }

  zoomAt(factor, px, py) {
    const [wx, wy] = this.toWorld(px, py);
    this.zoom = clamp(this.zoom * factor, this.minZoom(), 1.5);
    const [wx2, wy2] = this.toWorld(px, py);
    this.cx += wx - wx2;
    this.cy += wy - wy2;
    this.clamp();
  }

  clamp() {
    this.cx = clamp(this.cx, L0, L1);
    this.cy = clamp(this.cy, L0, L1);
    this.zoom = clamp(this.zoom, this.minZoom(), 1.5);
  }

  minZoom() {
    return Math.max(0.24, Math.min(this.w / (D.MAP * 64 * 0.62), 0.5));
  }
}

// ---------- small canvas textures ----------

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const WATER_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const WATER_FS = `
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; varying vec3 vW;
void main(){
  vec2 p = vW.xz;
  float d = max(abs(p.x - ${MID.toFixed(1)}), abs(p.y - ${MID.toFixed(1)})) - ${((L1 - L0) / 2).toFixed(1)};
  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 7.0, d));
  float w1 = sin(p.x * 1.7 + p.y * 1.1 + uTime * 1.1);
  float w2 = sin(p.x * 2.3 - p.y * 1.9 - uTime * 0.8);
  col += smoothstep(0.86, 1.0, w1 * w2 * 0.5 + 0.5) * 0.05;
  float edge = d + 0.12 * sin(uTime * 1.6 + p.x * 2.2 + p.y * 2.2);
  float foam = smoothstep(0.7, 0.05, edge) * step(-0.2, d);
  col = mix(col, vec3(1.0), foam * 0.78);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const PALMS = (() => {
  const r = mulberry32(21);
  const out = [];
  for (let i = L0 + 1; i < L1 - 1; i += 2 + Math.floor(r() * 3)) {
    if (r() < 0.85) out.push({ x: i + 0.5, y: L0 + 0.55 + r() * 0.5, s: 0.8 + r() * 0.35, a: r() * 6 });
    if (r() < 0.85) out.push({ x: i + 0.5, y: L1 - 1.1 + r() * 0.5, s: 0.8 + r() * 0.35, a: r() * 6 });
    if (r() < 0.85) out.push({ x: L0 + 0.55 + r() * 0.5, y: i + 0.5, s: 0.8 + r() * 0.35, a: r() * 6 });
    if (r() < 0.85) out.push({ x: L1 - 1.1 + r() * 0.5, y: i + 0.5, s: 0.8 + r() * 0.35, a: r() * 6 });
  }
  return out;
})();

// ---------- the renderer ----------

export class Renderer3D {
  constructor(canvas, overlay, assets) {
    this.cv = canvas;
    this.ov = overlay;
    this.o = overlay.getContext('2d');
    this.A = assets;
    this.cam = new Camera3D();
    this.dpr = 1;
    this.t = 0;
    this.fx = [];
    this.jolt = new Map();
    this.shake = 0;
    this.stats = { frames: 0, ms: 16 };
    this.is3d = true;
    this.quality = 'high';
    this.slow = 0;

    const gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl = gl;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a86c4');
    this.bviews = new Map(); // building id -> view
    this.oviews = new Map(); // obstacle id -> view
    this.uviews = new Map(); // unit id -> view
    this.corpses = [];
    this.pickables = [];
    this.wallGroup = new THREE.Group();
    this.scene.add(this.wallGroup);
    this.wallSig = '';
    this.buildWorld();
    this.buildOverlayMeshes();
    this.buildFxPools();
    this.setQuality('high');
  }

  // ---------- world ----------

  buildWorld() {
    const sc = this.scene;
    const hemi = new THREE.HemisphereLight('#e8f4ff', '#b8d090', 2.1);
    sc.add(hemi);
    const sun = new THREE.DirectionalLight('#fff0d4', 2.1);
    sun.position.set(MID - 15, 24, MID + 9);
    sun.target.position.set(MID, 0, MID);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 23, bottom: -23, near: 1, far: 70 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    sc.add(sun, sun.target);
    this.sun = sun;

    // water
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.A.uTime, uDeep: { value: new THREE.Color('#2a86c4') }, uShallow: { value: new THREE.Color('#66d3ee') } },
      vertexShader: WATER_VS, fragmentShader: WATER_FS,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(MID, -0.42, MID);
    sc.add(water);

    // island top: grass with a sandy beach rim
    const size = L1 - L0;
    const tex = canvasTex(1024, 1024, (g, w, h) => {
      const px = w / size;
      g.fillStyle = '#f3deaa';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#8fd46d';
      g.fillRect(px, px, w - 2 * px, h - 2 * px);
      const rnd = mulberry32(5);
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          if ((x + y) & 1) { g.fillStyle = 'rgba(60,140,50,0.14)'; g.fillRect(x * px, y * px, px, px); }
        }
      }
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect((D.BUILD0 - L0) * px, (D.BUILD0 - L0) * px, (D.BUILD1 - D.BUILD0) * px, (D.BUILD1 - D.BUILD0) * px);
      for (let i = 0; i < 700; i++) {
        const x = (1 + rnd() * (size - 2)) * px;
        const y = (1 + rnd() * (size - 2)) * px;
        g.fillStyle = rnd() < 0.5 ? 'rgba(90,170,70,0.35)' : 'rgba(170,220,120,0.35)';
        g.fillRect(x, y, 2 + rnd() * 3, 1 + rnd() * 2);
      }
      for (let i = 0; i < 90; i++) {
        const x = (1.3 + rnd() * (size - 2.6)) * px;
        const y = (1.3 + rnd() * (size - 2.6)) * px;
        g.fillStyle = ['#fff6a8', '#ffffff', '#ffb3c7'][i % 3];
        g.beginPath();
        g.arc(x, y, 1.6, 0, 6.3);
        g.fill();
      }
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(MID, 0, MID);
    ground.receiveShadow = true;
    sc.add(ground);
    this.ground = ground;

    // cliffs
    const cliffTex = canvasTex(8, 64, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#b08350');
      grd.addColorStop(0.5, '#8a5f37');
      grd.addColorStop(1, '#5d3f25');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    });
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(size + 0.05, 1.5, size + 0.05), new THREE.MeshLambertMaterial({ map: cliffTex }));
    cliff.position.set(MID, -0.76, MID);
    cliff.receiveShadow = true;
    sc.add(cliff);

    // palms around the beach (instanced, they sway in the wind)
    const palm = this.A.props.deco_palm;
    if (palm) {
      const meshes = [];
      palm.root.updateMatrixWorld(true);
      palm.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      for (const src of meshes) {
        const inst = new THREE.InstancedMesh(src.geometry, src.material, PALMS.length);
        PALMS.forEach((p, i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.a);
          m4.compose(new THREE.Vector3(p.x, 0, p.y), q, new THREE.Vector3(p.s, p.s, p.s)).multiply(src.matrixWorld);
          inst.setMatrixAt(i, m4);
        });
        inst.castShadow = true;
        inst.frustumCulled = false;
        sc.add(inst);
      }
    }
  }

  buildOverlayMeshes() {
    const sc = this.scene;
    const flat = (color, opacity = 0.4) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // selection footprint
    this.selMesh = new THREE.Mesh(quad, flat('#ffffff', 0.3));
    this.selMesh.position.y = 0.04;
    this.selMesh.renderOrder = 2;
    this.selMesh.visible = false;
    this.selLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]].map((p) => new THREE.Vector3(...p))),
      new THREE.LineBasicMaterial({ color: '#ffffff' }));
    this.selLine.position.y = 0.05;
    this.selLine.visible = false;
    // range ring and fill
    const ringGeo = new THREE.RingGeometry(0.985, 1, 64).rotateX(-Math.PI / 2);
    const discGeo = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2);
    this.rangeRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
    this.rangeDisc = new THREE.Mesh(discGeo, flat('#ffffff', 0.1));
    this.minRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }));
    for (const m of [this.rangeRing, this.rangeDisc, this.minRing]) { m.position.y = 0.045; m.visible = false; m.renderOrder = 1; }
    // placement ghost footprint
    this.ghostPlane = new THREE.Mesh(quad, flat('#35c85a', 0.5));
    this.ghostPlane.position.y = 0.05;
    this.ghostPlane.visible = false;
    this.ghostPlane.renderOrder = 3;
    // beacon
    this.beaconRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#78dcff', transparent: true, opacity: 0.9, depthWrite: false }));
    this.beaconDisc = new THREE.Mesh(discGeo, flat('#5ac8ff', 0.16));
    for (const m of [this.beaconRing, this.beaconDisc]) { m.position.y = 0.045; m.visible = false; }
    // grid of the build area, shown while placing
    const pts = [];
    for (let i = D.BUILD0; i <= D.BUILD1; i++) {
      pts.push(new THREE.Vector3(i, 0.03, D.BUILD0), new THREE.Vector3(i, 0.03, D.BUILD1), new THREE.Vector3(D.BUILD0, 0.03, i), new THREE.Vector3(D.BUILD1, 0.03, i));
    }
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.32 }));
    this.grid.visible = false;
    // red zone while raiding: drawn into a texture so overlaps do not double up
    this.redCanvas = document.createElement('canvas');
    this.redCanvas.width = this.redCanvas.height = 1024;
    this.redTex = new THREE.CanvasTexture(this.redCanvas);
    this.redTex.colorSpace = THREE.SRGBColorSpace;
    this.redPlane = new THREE.Mesh(new THREE.PlaneGeometry(L1 - L0, L1 - L0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.redTex, transparent: true, depthWrite: false }));
    this.redPlane.position.set(MID, 0.035, MID);
    this.redPlane.visible = false;
    this.redSig = '';
    sc.add(this.selMesh, this.selLine, this.rangeRing, this.rangeDisc, this.minRing, this.ghostPlane, this.beaconRing, this.beaconDisc, this.grid, this.redPlane);
    this.ghostView = null;
    this.ghostKey = '';
    this.beaconView = null;
  }

  // ---------- fx pools ----------

  buildFxPools() {
    const sc = this.scene;
    this.softTex = canvasTex(64, 64, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    });
    this.sprites = [];
    for (let i = 0; i < 160; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, transparent: true, depthWrite: false }));
      s.visible = false;
      s.renderOrder = 10;
      sc.add(s);
      this.sprites.push(s);
    }
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
      m.visible = false;
      m.position.y = 0.06;
      sc.add(m);
      this.rings.push(m);
    }
    this.chunks = [];
    const cg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: '#8d867b' }));
      m.visible = false;
      m.castShadow = true;
      sc.add(m);
      this.chunks.push(m);
    }
    this.shots = [];
    const sg = new THREE.SphereGeometry(1, 8, 6);
    const bg = new THREE.BoxGeometry(0.05, 0.05, 1);
    for (let i = 0; i < 40; i++) {
      const ball = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: '#23262d' }));
      const bolt = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: '#efe9d6' }));
      ball.visible = bolt.visible = false;
      sc.add(ball, bolt);
      this.shots.push({ ball, bolt, used: false });
    }
  }

  // ---------- quality ----------

  setQuality(q) {
    this.quality = q;
    const high = q === 'high';
    this.gl.shadowMap.enabled = high;
    this.sun.castShadow = high;
    this.gl.shadowMap.needsUpdate = true;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.resize(this.cam.w, this.cam.h, high ? this.dpr0 || this.dpr : 1);
  }

  resize(w, h, dpr) {
    if (!this.dpr0) this.dpr0 = dpr;
    this.dpr = dpr;
    this.cam.w = w;
    this.cam.h = h;
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h, false);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    this.ov.width = Math.round(w * dpr);
    this.ov.height = Math.round(h * dpr);
    this.ov.style.width = w + 'px';
    this.ov.style.height = h + 'px';
    this.cam.clamp();
  }

  // ---------- effects ----------

  add(p) {
    if (typeof p.c === 'string' && /^\d+,\d+,\d+$/.test(p.c)) p.c = `rgb(${p.c})`;
    if (this.fx.length > 400) this.releaseFx(this.fx.shift());
    this.fx.push(p);
  }

  ingest(events) {
    for (const e of events) {
      switch (e.t) {
        case 'shot':
          this.add({ k: 'proj', kind: e.kind, fx: e.fx, fy: e.fy, tx: e.tx, ty: e.ty, life: 0, max: e.flight, arc: e.kind === 'mortar' ? 2.4 : e.kind === 'sling' ? 0.3 : 0.2 });
          if (e.kind !== 'sling') this.add({ k: 'puff', x: e.fx, y: e.fy, z: 0.7, life: 0, max: 0.3, r: 0.35, c: '#ffe6a0', add: true });
          break;
        case 'boom': {
          const big = e.kind === 'trap' || e.kind === 'sapper';
          this.add({ k: 'ring', x: e.x, y: e.y, life: 0, max: 0.45, r: e.r, c: e.kind === 'shell' ? '#ffaa3c' : '#ff7832' });
          this.add({ k: 'puff', x: e.x, y: e.y, z: 0.25, life: 0, max: 0.4, r: e.r * 1.1, c: '#ffc85a', add: true });
          for (let i = 0; i < (big ? 12 : 7); i++) this.spark(e.x, e.y, 0.25, 2.5 + Math.random() * 2.5);
          for (let i = 0; i < 4; i++) this.smoke(e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r, 0.3, 0.9);
          this.shake = Math.max(this.shake, big ? 0.16 : 0.08);
          break;
        }
        case 'destroyed': {
          const n = Math.min(14, 6 + e.size * 2);
          for (let i = 0; i < n; i++) this.debris(e.x, e.y, e.size);
          for (let i = 0; i < 5 + e.size; i++) this.smoke(e.x + (Math.random() - 0.5) * e.size * 0.7, e.y + (Math.random() - 0.5) * e.size * 0.7, 0.4, 1.7);
          this.add({ k: 'ring', x: e.x, y: e.y, life: 0, max: 0.5, r: e.size * 0.9, c: '#ffe1aa' });
          if (e.type !== 'wall' && e.type !== 'bomb') this.shake = Math.max(this.shake, 0.1 + e.size * 0.03);
          const v = this.bviews.get(e.id);
          if (v) v.collapse = 0.0001;
          break;
        }
        case 'hit':
          this.jolt.set(e.id, 0.12);
          if (Math.random() < 0.5) this.spark(e.x + (Math.random() - 0.5), e.y + (Math.random() - 0.5), 0.5, 1.2);
          break;
        case 'die':
          this.add({ k: 'puff', x: e.x, y: e.y, z: 0.3, life: 0, max: 0.4, r: 0.35, c: '#ffffff', add: true });
          this.addCorpse(e);
          break;
        case 'deploy':
          this.add({ k: 'ring', x: e.x, y: e.y, life: 0, max: 0.35, r: 0.8, c: '#ffffff' });
          break;
        case 'beacon':
          this.add({ k: 'ring', x: e.x, y: e.y, life: 0, max: 0.9, r: 4.5, c: '#5ac8ff' });
          break;
        default:
      }
    }
  }

  spark(x, y, z, speed) {
    const a = Math.random() * Math.PI * 2;
    this.add({ k: 'spark', x, y, z, vx: Math.cos(a) * speed * 0.4, vy: Math.sin(a) * speed * 0.4, vz: 1.2 + Math.random() * 2, life: 0, max: 0.35 + Math.random() * 0.3 });
  }

  smoke(x, y, z, scale) {
    this.add({ k: 'smoke', x, y, z, vz: 0.5 + Math.random() * 0.6, life: 0, max: 0.9 + Math.random() * 0.8, r: (0.22 + Math.random() * 0.25) * scale });
  }

  debris(x, y, size) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.8 + Math.random() * 2.2;
    this.add({ k: 'debris', x: x + (Math.random() - 0.5) * size * 0.6, y: y + (Math.random() - 0.5) * size * 0.6, z: 0.3 + Math.random() * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 2 + Math.random() * 3, life: 0, max: 0.9 + Math.random() * 0.5, c: Math.random() < 0.5 ? '#8d867b' : '#5d564d', sz: 0.06 + Math.random() * 0.1, rot: Math.random() * 6 });
  }

  floatText(x, y, text, color, z = 1.4) {
    if (z > 4) z /= 40; // callers written for the 2D view pass pixels
    this.add({ k: 'text', x, y, z, text, color, life: 0, max: 1.3 });
  }

  addCorpse(e) {
    const u = this.A.units[e.troop];
    if (!u || !u.clips.die) return;
    const view = this.makeUnitView(e.troop);
    view.root.position.set(e.x, 0, e.y);
    view.root.rotation.y = Math.atan2(Math.cos(e.dir || 0), Math.sin(e.dir || 0));
    view.play('die', 0, true);
    this.scene.add(view.root);
    this.corpses.push({ view, t: 0 });
  }

  update(dt) {
    this.t += dt;
    this.A.uTime.value = this.t;
    for (const [id, v] of this.jolt) {
      if (v - dt <= 0) this.jolt.delete(id);
      else this.jolt.set(id, v - dt);
    }
    this.shake = Math.max(0, this.shake - dt * 0.6);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const p = this.fx[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.releaseFx(p);
        this.fx.splice(i, 1);
        continue;
      }
      if (p.vx !== undefined) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.k === 'spark' || p.k === 'debris') {
        p.vz -= 9 * dt;
        p.z += p.vz * dt;
        if (p.z < 0.02) { p.z = 0.02; p.vz *= -0.3; if (p.k === 'debris') { p.vx *= 0.5; p.vy *= 0.5; } }
      } else if (p.k === 'smoke' || p.k === 'text') {
        p.z += (p.vz || 0.7) * dt;
      }
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.t += dt;
      c.view.mixer.update(dt);
      if (c.t > 2.4) {
        const k = clamp(1 - (c.t - 2.4) / 0.5, 0, 1);
        c.view.root.scale.setScalar(k * c.view.base);
        if (k <= 0) {
          this.scene.remove(c.view.root);
          this.corpses.splice(i, 1);
        }
      }
    }
  }

  // ---------- views ----------

  makeUnitView(troop) {
    const proto = this.A.units[troop];
    const root = SkeletonUtils.clone(proto.root);
    const base = UNIT_SCALE[troop] || 0.6;
    root.scale.setScalar(base);
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const [name, clip] of Object.entries(proto.clips)) {
      const a = mixer.clipAction(clip);
      if (name === 'die' || name === 'attack') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions[name] = a;
    }
    const view = {
      root, mixer, actions, base, cur: null, troop,
      play(name, fade = 0.15, clamp_ = false) {
        const next = actions[name];
        if (!next || this.cur === next) return;
        next.reset();
        next.enabled = true;
        next.setEffectiveWeight(1);
        if (clamp_) next.clampWhenFinished = true;
        next.play();
        if (this.cur) this.cur.crossFadeTo(next, fade, false);
        this.cur = next;
        this.name = name;
      },
    };
    return view;
  }

  makeBuildingModel(type, lvl, team) {
    const tier = tierOf(lvl);
    const entry = this.A.b[type] && this.A.b[type][`${type}_t${tier}`];
    if (!entry) return null;
    const root = cloneTeam(entry.root, this.A.mats, team);
    let mixer = null;
    if (entry.clip) {
      mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(entry.clip).play();
    }
    return { root, mixer, height: entry.height, tier };
  }

  syncBuildings(scene) {
    const seen = new Set();
    const team = scene.team;
    for (const b of scene.buildings) {
      if (b.type === 'wall') continue;
      if (b.type === 'bomb' && scene.mode === 'battle' && b.alive !== false) continue;
      const size = D.BUILDINGS[b.type].size;
      let v = this.bviews.get(b.id);
      const dead = b.alive === false;
      const stateKey = dead ? 'rubble' : b.lvl === 0 ? 'scaffold' : `${tierOf(b.lvl)}|${team}`;
      if (dead && b.type === 'bomb') continue;
      if (v && v.key !== stateKey) {
        if (v.group && stateKey === 'rubble') {
          // keep the model standing while it collapses, swap in rubble when done
          if (!v.collapse) v.collapse = 0.0001;
        } else {
          this.disposeView(v);
          v = null;
        }
      }
      if (!v) {
        v = this.createBuildingView(b, size, stateKey, team);
        if (!v) continue;
        this.bviews.set(b.id, v);
      }
      seen.add(b.id);
      v.b = b;
      this.updateBuildingView(v, b, scene);
    }
    for (const [id, v] of this.bviews) {
      if (!seen.has(id)) {
        this.disposeView(v);
        this.bviews.delete(id);
      }
    }
    this.pickables = [...this.bviews.values()].map((v) => v.group);
  }

  createBuildingView(b, size, key, team) {
    const group = new THREE.Group();
    group.position.set(b.x + size / 2, 0, b.y + size / 2);
    group.userData = { kind: 'building', id: b.id };
    let model = null;
    let height = 1.2;
    if (key === 'rubble') {
      const e = this.A.props[`rubble_${Math.min(4, size)}`];
      if (e) model = { root: SkeletonUtils.clone(e.root), mixer: null, height: 0.3 };
    } else if (key === 'scaffold') {
      const e = this.A.props[`scaffold_${clamp(size, 2, 4)}`];
      if (e) model = { root: SkeletonUtils.clone(e.root), mixer: null, height: e.height };
    } else {
      model = this.makeBuildingModel(b.type, b.lvl, team);
    }
    if (!model) return null;
    height = model.height;
    group.add(model.root);
    const v = { group, model, key, height, size, pop: 0.35, collapse: 0, turret: null, barrel: null, id: b.id, type: b.type };
    if (D.DEFENSES.includes(b.type) && key !== 'rubble' && key !== 'scaffold') {
      const nm = `${b.type}_t${tierOf(b.lvl)}`;
      v.turret = model.root.getObjectByName(`${nm}__turret`);
      v.barrel = model.root.getObjectByName(`${nm}__barrel`);
      if (v.barrel) v.barrelRest = v.barrel.position.clone();
    }
    this.scene.add(group);
    return v;
  }

  disposeView(v) {
    this.scene.remove(v.group);
  }

  updateBuildingView(v, b, scene) {
    const dt = 1 / 60;
    const g = v.group;
    if (v.model.mixer) v.model.mixer.update(this.dtFrame || dt);
    const jolt = this.jolt.get(b.id);
    let y = 0;
    let sc = 1;
    if (v.pop > 0) {
      v.pop = Math.max(0, v.pop - (this.dtFrame || dt));
      const k = 1 - v.pop / 0.35;
      sc = 0.86 + 0.14 * Math.sin(k * Math.PI * 0.5) + Math.sin(k * Math.PI) * 0.08;
    }
    if (v.collapse > 0) {
      v.collapse += (this.dtFrame || dt);
      const k = Math.min(1, v.collapse / 0.45);
      sc = 1 - k * 0.92;
      g.rotation.z = Math.sin(v.collapse * 40) * 0.03 * (1 - k);
      if (k >= 1 && b.alive === false) {
        this.disposeView(v);
        const nv = this.createBuildingView(b, v.size, 'rubble', scene.team);
        Object.assign(v, nv || {});
        v.collapse = 0;
      }
    }
    const sel = scene.selected && scene.selected.id === b.id;
    if (sel) y += Math.abs(Math.sin(this.t * 7)) * 0.05;
    if (jolt) y += (Math.random() - 0.5) * 0.04;
    const dim = scene.ghost && scene.ghost.moving === b.id;
    g.position.y = y;
    g.scale.set(1, sc, 1);
    g.visible = true;
    v.model.root.traverse((o) => { if (o.isMesh && o.userData.dim !== dim) { o.userData.dim = dim; } });
    if (v.turret) {
      let ang;
      if (scene.mode === 'battle') ang = b.ang || 0;
      else ang = 0.8 + Math.sin(this.t * 0.5 + b.id) * 0.9;
      const target = Math.PI / 2 - ang;
      let d = target - v.turret.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      v.turret.rotation.y += d * Math.min(1, (this.dtFrame || dt) * 10);
      if (v.barrel) {
        const rec = b.recoil || 0;
        if (b.type === 'mortar') v.barrel.rotation.x = -0.6 + rec * 0.12;
        else v.barrel.position.z = v.barrelRest.z - rec * 0.16;
      }
    }
  }

  // ---------- obstacles, walls, units ----------

  syncObstacles(scene) {
    const seen = new Set();
    for (const o of scene.obstacles || []) {
      seen.add(o.id);
      let v = this.oviews.get(o.id);
      if (!v) {
        const e = this.A.props[`ob_${o.kind}`];
        if (!e) continue;
        const group = new THREE.Group();
        group.position.set(o.x + o.size / 2, 0, o.y + o.size / 2);
        group.rotation.y = (o.id * 1.7) % 6.28;
        group.add(SkeletonUtils.clone(e.root));
        group.userData = { kind: 'obstacle', id: o.id };
        this.scene.add(group);
        v = { group, o };
        this.oviews.set(o.id, v);
      }
      v.o = o;
      v.group.scale.setScalar(o.clearing ? 1 - clamp((this.t % 1) * 0.0, 0, 1) : 1);
      if (o.clearing) v.group.rotation.z = Math.sin(this.t * 25) * 0.03;
      else v.group.rotation.z = 0;
    }
    for (const [id, v] of this.oviews) {
      if (!seen.has(id)) {
        this.scene.remove(v.group);
        this.oviews.delete(id);
      }
    }
    this.pickables.push(...[...this.oviews.values()].map((v) => v.group));
  }

  syncWalls(scene) {
    const walls = scene.buildings.filter((b) => b.type === 'wall' && b.alive !== false && b.lvl >= 1);
    const sig = walls.map((w) => `${w.id}:${tierOf(w.lvl)}:${w.x},${w.y}`).join('|');
    if (sig === this.wallSig) return;
    this.wallSig = sig;
    for (const c of [...this.wallGroup.children]) {
      this.wallGroup.remove(c);
      if (c.dispose) c.dispose();
    }
    if (!walls.length) return;
    const at = new Map(walls.map((w) => [`${w.x},${w.y}`, w]));
    const posts = { 1: [], 2: [], 3: [] };
    const links = { 1: [], 2: [], 3: [] };
    for (const w of walls) {
      const t = tierOf(w.lvl);
      posts[t].push([w.x + 0.5, w.y + 0.5, 0]);
      if (at.has(`${w.x + 1},${w.y}`)) links[t].push([w.x + 1, w.y + 0.5, 0]);
      if (at.has(`${w.x},${w.y + 1}`)) links[t].push([w.x + 0.5, w.y + 1, Math.PI / 2]);
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const build = (list, protoName, jitter) => {
      for (const t of [1, 2, 3]) {
        if (!list[t].length) continue;
        const e = this.A.b.wall && this.A.b.wall[`${protoName}_t${t}`];
        if (!e) continue;
        e.root.updateMatrixWorld(true);
        e.root.traverse((src) => {
          if (!src.isMesh) return;
          const inst = new THREE.InstancedMesh(src.geometry, src.material, list[t].length);
          list[t].forEach(([x, z, rot], i) => {
            q.setFromAxisAngle(up, rot + (jitter ? (((x * 7 + z * 3) % 1) - 0.5) * 0.0 : 0));
            m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1)).multiply(src.matrixWorld);
            inst.setMatrixAt(i, m4);
          });
          inst.castShadow = true;
          inst.receiveShadow = true;
          inst.frustumCulled = false;
          this.wallGroup.add(inst);
        });
      }
    };
    build(posts, 'wall', false);
    build(links, 'wall_link', false);
  }

  syncUnits(scene) {
    const seen = new Set();
    const dt = this.dtFrame || 1 / 60;
    for (const u of scene.units || []) {
      seen.add(u.id);
      let v = this.uviews.get(u.id);
      if (!v) {
        if (!this.A.units[u.troop]) continue;
        v = this.makeUnitView(u.troop);
        v.root.position.set(u.x, 0, u.y);
        v.lastCd = u.cd;
        v.yaw = Math.atan2(Math.cos(u.dir), Math.sin(u.dir));
        v.root.rotation.y = v.yaw;
        v.attackUntil = 0;
        v.play('idle', 0);
        this.scene.add(v.root);
        this.uviews.set(u.id, v);
      }
      v.root.position.set(u.x, 0, u.y);
      // face where it moves, or at its target while fighting
      let dx;
      let dz;
      if (u.moving && (u.vx || u.vy)) { dx = u.vx; dz = u.vy; } else { dx = Math.cos(u.dir); dz = Math.sin(u.dir); }
      const want = Math.atan2(dx, dz);
      let d = want - v.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      v.yaw += d * Math.min(1, dt * 12);
      v.root.rotation.y = v.yaw;
      if (u.cd > v.lastCd + 0.05) {
        v.attackUntil = this.t + 0.5;
        if (v.actions.attack) { v.actions.attack.reset(); v.cur = null; v.play('attack', 0.05); }
      }
      v.lastCd = u.cd;
      if (this.t < v.attackUntil) {
        // let the attack clip finish
      } else if (u.moving) {
        v.play('run', 0.12);
        if (v.actions.run) v.actions.run.timeScale = clamp(u.speed / (RUN_REF[u.troop] || 2), 0.5, 1.8);
      } else {
        v.play('idle', 0.2);
      }
      v.mixer.update(dt);
    }
    for (const [id, v] of this.uviews) {
      if (!seen.has(id)) {
        this.scene.remove(v.root);
        this.uviews.delete(id);
      }
    }
    // with a big army, only buildings cast shadows: it keeps the shadow pass cheap
    const cast = this.uviews.size <= 36;
    if (cast !== this.unitShadows) {
      this.unitShadows = cast;
      for (const v of this.uviews.values()) v.root.traverse((o) => { if (o.isMesh) o.castShadow = cast; });
    }
    if (this.unitShadows === false) for (const v of this.uviews.values()) v.root.traverse((o) => { if (o.isMesh && o.castShadow) o.castShadow = false; });
  }

  // ---------- overlays in 3D ----------

  syncOverlays(scene) {
    const sel = scene.selected;
    this.selMesh.visible = this.selLine.visible = !!sel && !scene.ghost;
    this.rangeRing.visible = this.rangeDisc.visible = this.minRing.visible = false;
    if (sel && !scene.ghost) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
      this.selMesh.position.set(sel.x + sel.size / 2, 0.04, sel.y + sel.size / 2);
      this.selMesh.scale.set(sel.size + 0.2, 1, sel.size + 0.2);
      this.selMesh.material.opacity = 0.2 + pulse * 0.15;
      this.selLine.position.set(sel.x + sel.size / 2, 0.05, sel.y + sel.size / 2);
      this.selLine.scale.set(sel.size + 0.2, 1, sel.size + 0.2);
      if (sel.range) {
        const cx = sel.x + sel.size / 2;
        const cy = sel.y + sel.size / 2;
        for (const m of [this.rangeRing, this.rangeDisc]) { m.visible = true; m.position.set(cx, 0.045, cy); m.scale.set(sel.range, 1, sel.range); }
        if (sel.minRange) { this.minRing.visible = true; this.minRing.position.set(cx, 0.045, cy); this.minRing.scale.set(sel.minRange, 1, sel.minRange); }
      }
    }
    // placement ghost
    const gh = scene.ghost;
    this.grid.visible = !!(scene.showGrid || gh);
    this.ghostPlane.visible = !!gh;
    if (gh) {
      this.ghostPlane.position.set(gh.x + gh.size / 2, 0.05, gh.y + gh.size / 2);
      this.ghostPlane.scale.set(gh.size, 1, gh.size);
      this.ghostPlane.material.color.set(gh.valid ? '#35c85a' : '#ff4a4a');
      const key = `${gh.type}|${gh.lvl || 1}`;
      if (key !== this.ghostKey) {
        if (this.ghostView) this.scene.remove(this.ghostView);
        this.ghostView = null;
        this.ghostKey = key;
        let model;
        if (gh.type === 'wall') {
          const e = this.A.b.wall && this.A.b.wall[`wall_t${tierOf(gh.lvl || 1)}`];
          model = e ? { root: SkeletonUtils.clone(e.root) } : null;
        } else model = this.makeBuildingModel(gh.type, gh.lvl || 1, 'p');
        if (model) {
          const grp = new THREE.Group();
          grp.add(model.root);
          model.root.traverse((o) => {
            if (o.isMesh) {
              o.material = o.material.clone();
              o.material.transparent = true;
              o.material.opacity = 0.82;
              o.castShadow = false;
            }
          });
          this.ghostView = grp;
          this.scene.add(grp);
        }
      }
      if (this.ghostView) {
        this.ghostView.position.set(gh.x + gh.size / 2, 0.05 + Math.abs(Math.sin(this.t * 5)) * 0.05, gh.y + gh.size / 2);
        const tint = new THREE.Color(gh.valid ? '#b8ffc4' : '#ffb0b0');
        this.ghostView.traverse((o) => { if (o.isMesh && o.material.color) o.material.color.copy(o.material.vertexColors ? tint : o.material.color); });
        if (D.DEFENSES.includes(gh.type)) {
          const a = D.BUILDINGS[gh.type].atk;
          this.rangeRing.visible = this.rangeDisc.visible = true;
          this.rangeRing.position.set(gh.x + gh.size / 2, 0.045, gh.y + gh.size / 2);
          this.rangeDisc.position.copy(this.rangeRing.position);
          this.rangeRing.scale.set(a.range, 1, a.range);
          this.rangeDisc.scale.set(a.range, 1, a.range);
        }
      }
    } else if (this.ghostView) {
      this.scene.remove(this.ghostView);
      this.ghostView = null;
      this.ghostKey = '';
    }
    // beacon
    const bc = scene.beacon;
    this.beaconRing.visible = this.beaconDisc.visible = !!bc;
    if (bc) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
      for (const m of [this.beaconRing, this.beaconDisc]) { m.position.set(bc.x, 0.045, bc.y); m.scale.set(bc.r, 1, bc.r); }
      this.beaconRing.material.opacity = 0.65 + pulse * 0.25;
      if (!this.beaconView && this.A.props.beacon) {
        this.beaconView = SkeletonUtils.clone(this.A.props.beacon.root);
        this.beaconView.scale.setScalar(1.2);
        this.scene.add(this.beaconView);
      }
      if (this.beaconView) { this.beaconView.visible = true; this.beaconView.position.set(bc.x, 0, bc.y); }
    } else if (this.beaconView) this.beaconView.visible = false;
    // red zone
    this.redPlane.visible = !!scene.showRed;
    if (scene.showRed) {
      const sig = scene.buildings.filter((b) => b.alive).length + ':' + scene.buildings.length;
      if (sig !== this.redSig) {
        this.redSig = sig;
        const g = this.redCanvas.getContext('2d');
        const px = 1024 / (L1 - L0);
        g.clearRect(0, 0, 1024, 1024);
        g.fillStyle = 'rgba(255,40,40,0.26)';
        g.strokeStyle = 'rgba(255,70,70,0.4)';
        g.lineWidth = 2;
        g.beginPath();
        const m = D.RED_ZONE;
        for (const b of scene.buildings) {
          if (!b.alive || b.type === 'bomb') continue;
          const s = D.BUILDINGS[b.type].size;
          g.roundRect((b.x - m - L0) * px, (b.y - m - L0) * px, (s + m * 2) * px, (s + m * 2) * px, m * px * 0.6);
        }
        g.fill();
        g.stroke();
        this.redTex.needsUpdate = true;
      }
    }
  }

  syncFx() {
    const cam = this.cam;
    for (const p of this.fx) {
      const f = p.life / p.max;
      switch (p.k) {
        case 'proj': {
          if (!p.slot) {
            const free = this.shots.find((x) => !x.used);
            if (!free) break;
            free.used = true;
            p.slot = free;
          }
          const s = p.slot;
          const x = p.fx + (p.tx - p.fx) * f;
          const y = p.fy + (p.ty - p.fy) * f;
          const h = 0.7 + Math.sin(f * Math.PI) * p.arc;
          if (p.kind === 'ballista' || p.kind === 'sling') {
            s.bolt.visible = true;
            s.ball.visible = false;
            s.bolt.position.set(x, h, y);
            s.bolt.scale.set(1, 1, p.kind === 'sling' ? 0.4 : 1.1);
            s.bolt.lookAt(p.tx, 0.8, p.ty);
          } else {
            s.ball.visible = true;
            s.bolt.visible = false;
            s.ball.position.set(x, h, y);
            s.ball.scale.setScalar(p.kind === 'mortar' ? 0.16 : 0.1);
          }
          break;
        }
        case 'puff':
        case 'smoke':
        case 'spark': {
          const sp = this.sprites.find((s) => !s.visible && !s.__taken);
          if (!p.sprite) {
            if (!sp) break;
            p.sprite = sp;
            sp.__taken = true;
            sp.visible = true;
            sp.material.blending = p.add || p.k === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending;
            sp.material.color.set(p.k === 'spark' ? '#ffc060' : p.k === 'smoke' ? '#4a463f' : p.c);
          }
          const s = p.sprite;
          s.position.set(p.x, p.z, p.y);
          if (p.k === 'puff') { s.scale.setScalar(p.r * (0.5 + f) * 2); s.material.opacity = 1 - f; }
          else if (p.k === 'smoke') { s.scale.setScalar(p.r * (0.6 + f) * 2.4); s.material.opacity = 0.6 * (1 - f); }
          else { s.scale.setScalar(0.12); s.material.opacity = 1 - f; }
          break;
        }
        case 'ring': {
          if (!p.mesh) {
            const m = this.rings.find((r) => !r.visible && !r.__taken);
            if (!m) break;
            p.mesh = m;
            m.__taken = true;
            m.visible = true;
            m.material.color.set(p.c);
          }
          const r = p.r * (0.25 + f * 0.85);
          p.mesh.position.set(p.x, 0.06, p.y);
          p.mesh.scale.set(r, 1, r);
          p.mesh.material.opacity = (1 - f) * 0.85;
          break;
        }
        case 'debris': {
          if (!p.chunk) {
            const m = this.chunks.find((c) => !c.visible && !c.__taken);
            if (!m) break;
            p.chunk = m;
            m.__taken = true;
            m.visible = true;
            m.material.color.set(p.c);
          }
          p.chunk.position.set(p.x, p.z, p.y);
          p.chunk.scale.setScalar(p.sz * (1 - f * f));
          p.chunk.rotation.set(p.rot + f * 6, p.rot * 2 + f * 4, 0);
          break;
        }
        default:
      }
    }
    void cam;
  }

  releaseFx(p) {
    if (p.sprite) { p.sprite.visible = false; p.sprite.__taken = false; p.sprite = null; }
    if (p.mesh) { p.mesh.visible = false; p.mesh.__taken = false; p.mesh = null; }
    if (p.chunk) { p.chunk.visible = false; p.chunk.__taken = false; p.chunk = null; }
    if (p.slot) { p.slot.used = false; p.slot.ball.visible = p.slot.bolt.visible = false; p.slot = null; }
  }

  // ---------- picking ----------

  pick(px, py, scene) {
    const cam = this.cam;
    cam.apply();
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: (px / cam.w) * 2 - 1, y: -((py / cam.h) * 2 - 1) }, cam.cam);
    const hits = ray.intersectObjects(this.pickables, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !(o.userData && o.userData.kind)) o = o.parent;
      if (!o) continue;
      if (o.userData.kind === 'building') {
        const b = scene.buildings.find((x) => x.id === o.userData.id);
        if (b && b.alive !== false) return { kind: 'building', id: b.id, o: b };
      } else {
        const ob = (scene.obstacles || []).find((x) => x.id === o.userData.id);
        if (ob) return { kind: 'obstacle', id: ob.id, o: ob };
      }
    }
    // walls are instanced: pick them by the tile under the finger
    const [wx, wy] = cam.toWorld(px, py, 0.4);
    for (const b of scene.buildings) {
      if (b.type === 'wall' && b.alive !== false && b.lvl >= 1 && wx >= b.x && wx < b.x + 1 && wy >= b.y && wy < b.y + 1) return { kind: 'building', id: b.id, o: b };
    }
    return null;
  }

  // ---------- frame ----------

  frame(scene) {
    const t0 = performance.now();
    const cam = this.cam;
    this.dtFrame = Math.min(0.1, this.lastFrameAt ? (t0 - this.lastFrameAt) / 1000 : 1 / 60);
    this.lastFrameAt = t0;
    cam.sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    cam.sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    cam.apply();
    this.syncBuildings(scene);
    this.syncObstacles(scene);
    this.syncWalls(scene);
    this.syncUnits(scene);
    this.syncOverlays(scene);
    this.syncFx();
    this.gl.render(this.scene, cam.cam);
    this.drawOverlay(scene);
    this.stats.frames++;
    const ms = performance.now() - t0;
    this.stats.ms = this.stats.ms * 0.95 + ms * 0.05;
    // adapt: if frames stay slow, drop to the cheaper quality once
    if (this.quality === 'high' && this.stats.frames > 120) {
      this.slow = this.dtFrame > 0.034 ? this.slow + 1 : Math.max(0, this.slow - 1);
      if (this.slow > 90) { this.slow = 0; this.setQuality('low'); }
    }
  }

  // ---------- 2D overlay (timers, bubbles, bars, numbers) ----------

  anchor(x, y, z) {
    const [sx, sy, d] = this.cam.toScreen(x, y, z);
    return [sx, sy, d < 1];
  }

  drawOverlay(scene) {
    const g = this.o;
    const cam = this.cam;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, cam.w, cam.h);
    const now = scene.now;
    const zoomK = clamp(cam.zoom * 1.6, 0.6, 1.1);
    for (const v of this.bviews.values()) {
      const b = v.b;
      if (!b || b.alive === false) continue;
      const s = v.size;
      const top = this.anchor(b.x + s / 2, b.y + s / 2, v.height + 0.35);
      if (!top[2]) continue;
      const [cx, topY] = top;
      if (scene.mode === 'home') {
        if (b.up) {
          const left = Math.max(0, b.up.end - now) / 1000;
          const total = Math.max(1, (b.up.end - b.up.start) / 1000);
          this.pill(g, cx, topY, fmtTime(left), 1 - left / total, '#ffcf4a', b.lvl === 0 ? '🔨' : '⬆');
        } else if (scene.collectable && scene.collectable.has(b.id) && !scene.ghost) {
          this.bubble(g, cx, topY + Math.sin(this.t * 4 + b.id) * 3, scene.collectable.get(b.id).res);
        } else if (b.slot && b.lvl >= 1) {
          const left = Math.max(0, b.slot.end - now) / 1000;
          const total = (b.slot.end - b.slot.start) / 1000;
          this.pill(g, cx, topY + 6, fmtTime(left), 1 - left / Math.max(1, total), '#6fb6ff', '');
        }
        if (scene.tutorialTarget === b.id) this.pointer(g, cx, topY - 10);
      } else if (scene.mode === 'battle' && b.hp < b.maxHp && b.type !== 'bomb' && b.type !== 'wall') {
        const [bx, by] = this.anchor(b.x + s / 2, b.y + s / 2, v.height * 0.6);
        this.hpBar(g, bx, by, Math.max(22, s * 22) * zoomK, b.hp / b.maxHp, '#ff5a4a');
      }
    }
    if (scene.mode === 'home') {
      for (const v of this.oviews.values()) {
        const o = v.o;
        if (o.clearing) {
          const [sx, sy, vis] = this.anchor(o.x + o.size / 2, o.y + o.size / 2, 1.6);
          if (!vis) continue;
          const left = Math.max(0, o.clearing.end - now) / 1000;
          const total = (o.clearing.end - o.clearing.start) / 1000;
          this.pill(g, sx, sy, fmtTime(left), 1 - left / Math.max(1, total), '#ffcf4a', '⛏');
        }
      }
    }
    for (const u of scene.units || []) {
      if (u.hp < u.maxHp) {
        const [sx, sy, vis] = this.anchor(u.x, u.y, (u.flying ? 1.3 : 0.9) * (UNIT_SCALE[u.troop] || 0.6) * 1.9 + 0.1);
        if (vis) this.hpBar(g, sx, sy, 22 * zoomK, u.hp / u.maxHp, '#ff5a4a');
      }
    }
    for (const p of this.fx) {
      if (p.k !== 'text') continue;
      const f = p.life / p.max;
      const [sx, sy, vis] = this.anchor(p.x, p.y, p.z);
      if (!vis) continue;
      g.globalAlpha = 1 - f * f;
      g.font = '800 17px system-ui, -apple-system, "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.strokeText(p.text, sx, sy);
      g.fillStyle = p.color;
      g.fillText(p.text, sx, sy);
      g.globalAlpha = 1;
    }
  }

  pointer(g, x, y) {
    const bob = Math.sin(this.t * 7) * 6;
    g.fillStyle = '#ffe14a';
    g.strokeStyle = '#7a5a00';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x, y + bob);
    g.lineTo(x - 13, y - 20 + bob);
    g.lineTo(x + 13, y - 20 + bob);
    g.closePath();
    g.fill();
    g.stroke();
  }

  hpBar(g, x, y, w, f, color) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.roundRect(x - w / 2 - 1, y - 1, w + 2, 6, 3);
    g.fill();
    g.fillStyle = f > 0.5 ? '#5fd35f' : f > 0.25 ? '#ffc43a' : color;
    g.beginPath();
    g.roundRect(x - w / 2, y, Math.max(2, w * f), 4, 2);
    g.fill();
  }

  pill(g, x, y, text, prog, color, icon) {
    g.font = '700 12px system-ui, -apple-system, "Segoe UI", sans-serif';
    const tw = g.measureText(text).width;
    const w = tw + 20 + (icon ? 16 : 0);
    g.fillStyle = 'rgba(20,25,40,0.82)';
    g.beginPath();
    g.roundRect(x - w / 2, y - 11, w, 22, 11);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x - w / 2 + 2, y + 5, Math.max(4, (w - 4) * clamp(prog, 0, 1)), 4, 2);
    g.fill();
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    if (icon) g.fillText(icon, x - w / 2 + 6, y - 1);
    g.fillText(text, x - w / 2 + (icon ? 22 : 10), y - 1.5);
  }

  bubble(g, x, y, res) {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, y, 15, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(x - 5, y + 13);
    g.lineTo(x, y + 21);
    g.lineTo(x + 5, y + 13);
    g.fill();
    this.resIcon(g, x, y, res, 9);
  }

  resIcon(g, x, y, res, r) {
    if (res === 'gold') {
      g.fillStyle = '#ffd24a';
      g.strokeStyle = '#b07d0c';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = '#fff3b0';
      g.beginPath();
      g.arc(x, y, r * 0.55, 0.3, 2.2);
      g.stroke();
    } else {
      g.fillStyle = '#7ad7ff';
      g.strokeStyle = '#2f6fc0';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x, y - r * 1.15);
      g.lineTo(x + r * 0.85, y - r * 0.1);
      g.lineTo(x, y + r * 1.1);
      g.lineTo(x - r * 0.85, y - r * 0.1);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
}
