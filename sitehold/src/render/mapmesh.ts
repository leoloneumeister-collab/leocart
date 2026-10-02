import * as THREE from 'three';
import type { MapData, Deco } from '../sim/map.ts';
import type { Box, Mat } from '../sim/world.ts';
import { getTextures } from './textures.ts';
import { buildDecor } from './decor.ts';

class Builder {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  quad(p: number[][], n: number[], uv: number[][], c: number[][]) {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.col.push(c[i][0], c[i][1], c[i][2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  tri(p: number[][], n: number[], uv: number[][], c: number[][]) {
    const base = this.pos.length / 3;
    for (let i = 0; i < 3; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.col.push(c[i][0], c[i][1], c[i][2]);
    }
    this.idx.push(base, base + 1, base + 2);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const TILE: Record<Mat, number> = { plaster: 4, stone: 3, wood: 2, crate: 1.2, metal: 2, tile: 2, sand: 4 };

function hash(n: number) { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); }

function addBox(b: Builder, box: Box, i: number) {
  const { minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1, mat } = box;
  const T = TILE[mat];
  const tint = 0.9 + hash(i * 3.1) * 0.14;
  const tall = y1 - y0 > 2.5;
  const bot = tall ? 0.8 : 0.9;
  const top = 1.0;
  const cs = (k: number, t = tint) => [t * k, t * k, t * k];
  const crate = mat === 'crate';
  const wall = (ax: number, ay: number, bx: number, by: number) => crate ? [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => [(ax + (bx - ax) * u) / T, (ay + (by - ay) * v) / T]) : [[ax / T, ay / T], [bx / T, ay / T], [bx / T, by / T], [ax / T, by / T]];
  const cb = cs(bot), ct = cs(top);
  // +Z
  b.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], crate ? [[0, 0], [(x1 - x0) / T, 0], [(x1 - x0) / T, (y1 - y0) / T], [0, (y1 - y0) / T]] : wall(x0, y0, x1, y1), [cb, cb, ct, ct]);
  // -Z
  b.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], crate ? [[0, 0], [(x1 - x0) / T, 0], [(x1 - x0) / T, (y1 - y0) / T], [0, (y1 - y0) / T]] : wall(x1, y0, x0, y1), [cb, cb, ct, ct]);
  // +X
  b.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], crate ? [[0, 0], [(z1 - z0) / T, 0], [(z1 - z0) / T, (y1 - y0) / T], [0, (y1 - y0) / T]] : wall(z1, y0, z0, y1), [cb, cb, ct, ct]);
  // -X
  b.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], crate ? [[0, 0], [(z1 - z0) / T, 0], [(z1 - z0) / T, (y1 - y0) / T], [0, (y1 - y0) / T]] : wall(z0, y0, z1, y1), [cb, cb, ct, ct]);
  // top
  const tc = cs(1.06);
  b.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], crate ? [[0, 0], [(x1 - x0) / T, 0], [(x1 - x0) / T, (z1 - z0) / T], [0, (z1 - z0) / T]] : [[x0 / T, z1 / T], [x1 / T, z1 / T], [x1 / T, z0 / T], [x0 / T, z0 / T]], [tc, tc, tc, tc]);
  // underside for roofs and platforms that hover
  if (y0 > 0.05) b.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [cs(0.7), cs(0.7), cs(0.7), cs(0.7)]);
}

function addRamp(b: Builder, d: Deco) {
  const { x0, z0, x1, z1, h0, h1, axis, rising } = d;
  const c = [0.95, 0.95, 0.95];
  const hi = (t: number) => h0 + (h1 - h0) * t;
  // t = 0 at the low end
  const pt = (t: number, side: number, h: number) => {
    const a = rising === 1 ? t : 1 - t;
    if (axis === 'x') return [x0 + (x1 - x0) * a, h, side ? z1 : z0];
    return [side ? x1 : x0, h, z0 + (z1 - z0) * a];
  };
  // top slope
  const tl = pt(0, 0, hi(0)), tr = pt(0, 1, hi(0)), bl = pt(1, 0, hi(1)), br = pt(1, 1, hi(1));
  const len = axis === 'x' ? x1 - x0 : z1 - z0, wid = axis === 'x' ? z1 - z0 : x1 - x0;
  const slope = Math.hypot(len, h1 - h0);
  const nx = axis === 'x' ? -(h1 - h0) * rising / slope : 0, nz = axis === 'z' ? -(h1 - h0) * rising / slope : 0, ny = len / slope;
  b.quad([tl, bl, br, tr], [nx, ny, nz], [[0, 0], [slope / 3, 0], [slope / 3, wid / 3], [0, wid / 3]], [c, c, c, c]);
  // rails are drawn by the map for visibility, add side skirts
  for (const side of [0, 1]) {
    const p0 = pt(0, side, 0), p1 = pt(1, side, 0), p2 = pt(1, side, hi(1)), p3 = pt(0, side, hi(0));
    const out = axis === 'x' ? [0, 0, side ? 1 : -1] : [side ? 1 : -1, 0, 0];
    const quad = side ? [p0, p1, p2, p3] : [p1, p0, p3, p2];
    b.quad(quad, out, [[0, 0], [1, 0], [1, 1], [0, 1]], [c, c, c, c]);
  }
}

function siteTexture(letter: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  // hazard border
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(240,190,40,0.8)';
  g.setLineDash([26, 18]);
  g.strokeRect(10, 10, 236, 236);
  g.setLineDash([]);
  g.fillStyle = 'rgba(40,30,20,0.35)';
  g.font = 'bold 170px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 128, 140);
  g.lineWidth = 6; g.strokeStyle = 'rgba(240,190,40,0.55)'; g.strokeText(letter, 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface MapMesh {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  sky: THREE.Mesh;
  fog: THREE.Fog;
  setShadowQuality(size: number): void;
  follow(cam: THREE.Vector3): void;
}

export const SKY_HORIZON = 0xdfe8f0;

export function buildMapMesh(map: MapData): MapMesh {
  const tex = getTextures();
  const group = new THREE.Group();
  const builders: Record<string, Builder> = { plaster: new Builder(), stone: new Builder(), wood: new Builder(), crate: new Builder(), metal: new Builder(), sand: new Builder(), tile: new Builder() };
  const decor = new Builder();

  map.boxes.forEach((box, i) => {
    if (box.hide) return;
    addBox(builders[box.mat], box, i);
  });
  for (const d of map.deco) addRamp(builders.sand, d);

  // cornices on tall plaster walls
  map.boxes.forEach((box, i) => {
    if (box.hide || box.mat !== 'plaster' || box.maxY < 4.5) return;
    const e = 0.12;
    addBox(builders.stone, { ...box, minX: box.minX - e, maxX: box.maxX + e, minZ: box.minZ - e, maxZ: box.maxZ + e, minY: box.maxY - 0.3, maxY: box.maxY + 0.15, mat: 'stone' }, i + 500);
  });
  void decor;

  const mats: Record<string, THREE.Material> = {
    plaster: new THREE.MeshStandardMaterial({ map: tex.plaster, vertexColors: true, roughness: 0.95, metalness: 0 }),
    stone: new THREE.MeshStandardMaterial({ map: tex.stone, vertexColors: true, roughness: 0.92, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ map: tex.wood, vertexColors: true, roughness: 0.85, metalness: 0 }),
    crate: new THREE.MeshStandardMaterial({ map: tex.crate, vertexColors: true, roughness: 0.85, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ map: tex.metal, vertexColors: true, roughness: 0.55, metalness: 0.35 }),
    sand: new THREE.MeshStandardMaterial({ map: tex.sand, vertexColors: true, roughness: 1, metalness: 0 }),
    tile: new THREE.MeshStandardMaterial({ map: tex.stone, vertexColors: true, roughness: 0.9, metalness: 0 }),
  };
  for (const k of Object.keys(builders)) {
    const b = builders[k];
    if (!b.idx.length) continue;
    const m = new THREE.Mesh(b.build(), mats[k]);
    m.castShadow = true; m.receiveShadow = true;
    m.name = `map-${k}`;
    group.add(m);
  }

  // ground
  const gt = tex.ground.clone();
  gt.needsUpdate = true;
  gt.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: gt, roughness: 1, color: 0xffffff }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(map.bounds.maxX / 2, 0, map.bounds.maxZ / 2);
  ground.receiveShadow = true;
  group.add(ground);

  // site markings
  for (const s of map.sites) {
    const w = s.rect.x1 - s.rect.x0, h = s.rect.z1 - s.rect.z0;
    const size = Math.min(w, h) * 0.5;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: siteTexture(s.id), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    pl.rotation.x = -Math.PI / 2;
    pl.position.set(s.plant.x, 0.03, s.plant.z);
    group.add(pl);
  }

  // distant dunes ring so the horizon is not empty
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xd8bf92, roughness: 1, flatShading: true });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + hash(i) * 0.2;
    const r = 150 + hash(i + 9) * 40;
    const g = new THREE.ConeGeometry(30 + hash(i + 3) * 30, 14 + hash(i + 5) * 22, 7);
    const m = new THREE.Mesh(g, duneMat);
    m.position.set(map.bounds.maxX / 2 + Math.cos(a) * r, 5, map.bounds.maxZ / 2 + Math.sin(a) * r);
    m.rotation.y = hash(i + 1) * 3;
    group.add(m);
  }

  group.add(buildDecor(map));

  // lights
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0xd9b88a, 1.15);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 130;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  group.add(sun);
  group.add(sun.target);

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(0.5, 0.65, 0.4).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 sunDir;
      void main(){
        vec3 d = normalize(vP);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 horizon = vec3(0.87,0.91,0.94), zenith = vec3(0.30,0.55,0.90);
        vec3 c = mix(horizon, zenith, pow(h, 0.55));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0,0.9,0.7) * (pow(s, 600.0) * 3.0 + pow(s, 14.0) * 0.18);
        if (d.y < 0.0) c = horizon * 0.95;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);

  const fog = new THREE.Fog(SKY_HORIZON, 110, 330);

  const sunDir = new THREE.Vector3(0.5, 0.65, 0.4).normalize();
  const api: MapMesh = {
    group, sun, sky, fog,
    setShadowQuality(size: number) {
      sun.castShadow = size > 0;
      if (size > 0 && sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    },
    follow(cam: THREE.Vector3) {
      sky.position.copy(cam);
      // snap the shadow frustum to texels to avoid shimmering
      const step = 68 / sun.shadow.mapSize.x;
      const cx = Math.round(cam.x / step) * step, cz = Math.round(cam.z / step) * step;
      sun.target.position.set(cx, 0, cz);
      sun.position.set(cx + sunDir.x * 70, sunDir.y * 70, cz + sunDir.z * 70);
      sun.target.updateMatrixWorld();
    },
  };
  return api;
}
