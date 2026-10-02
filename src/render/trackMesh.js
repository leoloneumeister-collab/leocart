// Turns the pure track data into meshes: road, kerbs, walls, start gate, boost pads,
// shortcut ribbons and the ground plane.

import * as THREE from 'three';
import {
  groundTexture, roadTexture, kerbTexture, barrierTexture, checkerTexture, boostTexture,
  bannerTexture, makeCanvas,
} from './textures.js';

const Y_ROAD = 0.04;
const OFFSET = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

function ribbonGeometry(track, latA, latB, opts = {}) {
  const { N } = track;
  const { y = Y_ROAD, uvScale = 16, filter = null, uAcross = true } = opts;
  const pos = [];
  const uv = [];
  const idx = [];
  let vi = 0;
  const get = (i, lat) => [track.x[i % N] + track.nx[i % N] * lat(i % N), track.z[i % N] + track.nz[i % N] * lat(i % N)];
  for (let i = 0; i < N; i++) {
    if (filter && !filter(i)) continue;
    const j = i + 1;
    const a0 = get(i, latA);
    const b0 = get(i, latB);
    const a1 = get(j, latA);
    const b1 = get(j, latB);
    const v0 = (i * track.ds) / uvScale;
    const v1 = (j * track.ds) / uvScale;
    pos.push(a0[0], y, a0[1], b0[0], y, b0[1], a1[0], y, a1[1], b1[0], y, b1[1]);
    if (uAcross) uv.push(0, v0, 1, v0, 0, v1, 1, v1);
    else uv.push(v0, 0, v0, 1, v1, 0, v1, 1);
    // counter-clockwise seen from above so the face points up (+y)
    idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
    vi += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function polylineRibbon(pts, width, y, uvScale = 6) {
  const pos = [];
  const uv = [];
  const idx = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const nx = -dz;
    const nz = dx;
    // taper the ends so the ribbon fades into the road
    const taper = Math.min(1, i / 2, (pts.length - 1 - i) / 2);
    const hw = (width / 2) * (0.35 + 0.65 * Math.max(0, taper));
    pos.push(p[0] - nx * hw, y, p[1] - nz * hw, p[0] + nx * hw, y, p[1] + nz * hw);
    if (i > 0) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    uv.push(0, acc / uvScale, 1, acc / uvScale);
    if (i < pts.length - 1) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wallGeometry(track, side, height, tileLen = 4) {
  const { N } = track;
  const lim = side > 0 ? track.limR : track.limL;
  const open = side > 0 ? track.openR : track.openL;
  const pos = [];
  const uv = [];
  const idx = [];
  let vi = 0;
  const thick = 0.7;
  const P = (i, lat, y) => {
    const k = i % N;
    return [track.x[k] + track.nx[k] * lat * side, y, track.z[k] + track.nz[k] * lat * side];
  };
  const quad = (a, b, c, d, u0, u1, v0, v1) => {
    pos.push(...a, ...b, ...c, ...d);
    uv.push(u0, v0, u0, v1, u1, v0, u1, v1);
    idx.push(vi, vi + 1, vi + 2, vi + 2, vi + 1, vi + 3);
    vi += 4;
  };
  for (let i = 0; i < N; i++) {
    if (open[i] || open[(i + 1) % N]) continue;
    const j = i + 1;
    const lI0 = lim[i % N];
    const lI1 = lim[j % N];
    const u0 = (i * track.ds) / tileLen;
    const u1 = (j * track.ds) / tileLen;
    // inner face (towards the road), outer face, top
    quad(P(i, lI0, 0), P(i, lI0, height), P(j, lI1, 0), P(j, lI1, height), u0, u1, 0, 1);
    quad(P(j, lI1 + thick, 0), P(j, lI1 + thick, height), P(i, lI0 + thick, 0), P(i, lI0 + thick, height), u0, u1, 0, 1);
    quad(P(i, lI0, height), P(i, lI0 + thick, height), P(j, lI1, height), P(j, lI1 + thick, height), u0, u1, 0.45, 0.55);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildTrackMeshes(track, theme, { maxAniso = 8 } = {}) {
  const group = new THREE.Group();
  group.name = 'track';
  const disposables = [];
  const animated = { pads: [] };

  // ground
  const gTex = groundTexture(theme.ground, theme.seed);
  gTex.repeat.set(220, 220);
  gTex.anisotropy = maxAniso;
  const groundMat = new THREE.MeshLambertMaterial({ map: gTex, color: theme.groundTint });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5280, 5280, 64, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);
  disposables.push(gTex, groundMat, ground.geometry);

  // road
  const rTex = roadTexture(theme.road);
  rTex.anisotropy = maxAniso;
  const roadMat = new THREE.MeshLambertMaterial({ map: rTex, ...OFFSET });
  const roadGeo = ribbonGeometry(track, (i) => -track.w[i] / 2, (i) => track.w[i] / 2, { uvScale: 16 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  road.name = 'road';
  group.add(road);
  disposables.push(rTex, roadMat, roadGeo);

  // kerbs on the corners
  const kTex = kerbTexture(theme.kerb[0], theme.kerb[1]);
  kTex.anisotropy = maxAniso;
  const kerbMat = new THREE.MeshLambertMaterial({ map: kTex, ...OFFSET, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const curvy = new Uint8Array(track.N);
  for (let i = 0; i < track.N; i++) {
    let k = 0;
    for (let q = -6; q <= 6; q++) k = Math.max(k, Math.abs(track.kappa[(i + q + track.N) % track.N]));
    curvy[i] = k > 1 / 130 ? 1 : 0;
  }
  const kerbW = 1.5;
  for (const side of [-1, 1]) {
    const g = ribbonGeometry(
      track,
      (i) => (side > 0 ? track.w[i] / 2 : -track.w[i] / 2 - kerbW),
      (i) => (side > 0 ? track.w[i] / 2 + kerbW : -track.w[i] / 2),
      { y: Y_ROAD + 0.012, uvScale: 4, filter: (i) => curvy[i] && !(side > 0 ? track.openR[i] : track.openL[i]) },
    );
    const m = new THREE.Mesh(g, kerbMat);
    m.receiveShadow = true;
    group.add(m);
    disposables.push(g);
  }
  disposables.push(kTex, kerbMat);

  // walls
  const bTex = barrierTexture(theme.barrier[0], theme.barrier[1], theme.id === 'neon');
  bTex.anisotropy = maxAniso;
  const wallMat = new THREE.MeshLambertMaterial({ map: bTex });
  for (const side of [-1, 1]) {
    const g = wallGeometry(track, side, theme.wallHeight);
    const m = new THREE.Mesh(g, wallMat);
    m.receiveShadow = true;
    m.castShadow = true;
    m.name = side > 0 ? 'wallR' : 'wallL';
    group.add(m);
    disposables.push(g);
  }
  disposables.push(bTex, wallMat);

  // start / finish line and gantry
  {
    const cTex = checkerTexture();
    const w = track.w[0];
    const g = new THREE.PlaneGeometry(w, 4);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: cTex, ...OFFSET, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.position.set(track.x[0], Y_ROAD + 0.02, track.z[0]);
    m.rotation.y = track.hd[0];
    m.receiveShadow = true;
    group.add(m);
    disposables.push(cTex, g);

    const gate = new THREE.Group();
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    const redMat = new THREE.MeshLambertMaterial({ color: 0xd8342a });
    const half = w / 2 + 1.2;
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10, 1.2), pillarMat);
      p.position.set(sx * half, 5, 0);
      p.castShadow = true;
      gate.add(p);
      const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 2), redMat);
      b.position.set(sx * half, 0.3, 0);
      gate.add(b);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 3.6, 2.2, 1.2), pillarMat);
    beam.position.set(0, 9.4, 0);
    beam.castShadow = true;
    gate.add(beam);
    const bTexn = bannerTexture('LEOCART', '#e8341c');
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(w + 3, 2), new THREE.MeshBasicMaterial({ map: bTexn }));
    banner.position.set(0, 9.4, 0.62);
    gate.add(banner);
    const banner2 = banner.clone();
    banner2.position.z = -0.62;
    banner2.rotation.y = Math.PI;
    gate.add(banner2);
    gate.position.set(track.x[0], 0, track.z[0]);
    gate.rotation.y = track.hd[0];
    group.add(gate);
    disposables.push(bTexn, pillarMat, redMat);
  }

  // boost pads
  {
    const bt = boostTexture();
    bt.anisotropy = maxAniso;
    const mat = new THREE.MeshBasicMaterial({ map: bt, ...OFFSET, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (const pad of track.boostPads) {
      const g = new THREE.PlaneGeometry(pad.width, pad.len);
      g.rotateX(-Math.PI / 2);
      // PlaneGeometry v runs towards +z after rotation... flip so chevrons point along travel (+z local)
      const m = new THREE.Mesh(g, mat);
      const i = pad.i;
      m.position.set(track.x[i] + track.nx[i] * pad.lat, Y_ROAD + 0.03, track.z[i] + track.nz[i] * pad.lat);
      m.rotation.y = track.hd[i];
      m.receiveShadow = true;
      group.add(m);
      disposables.push(g);
    }
    animated.boostTexture = bt;
    disposables.push(bt, mat);
  }

  // shortcut ribbons: packed dirt
  if (track.shortcuts.length) {
    const c = makeCanvas(128, 128);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#8a6238';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? '#9a7144' : '#6e4c2a';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshLambertMaterial({ map: tex, ...OFFSET });
    for (const sc of track.shortcuts) {
      const g = polylineRibbon(sc.pts, sc.width, Y_ROAD - 0.005, 8);
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      group.add(m);
      disposables.push(g);
    }
    disposables.push(tex, mat);
  }

  group.userData.animated = animated;
  group.userData.dispose = () => {
    for (const d of disposables) d.dispose?.();
  };
  return group;
}
