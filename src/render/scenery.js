// Trackside and horizon decoration. Everything is generated from the seeded RNG so a
// track looks identical on every load, and merged/instanced so it costs a handful of draws.

import * as THREE from 'three';
import { distToRoadEdge, distToPolyline } from '../game/trackMath.js';
import { mulberry32, clamp } from '../util/math.js';
import { box, sphLow, ico, dodeca, coneLow, cylLow, merge, instanced, part, SPH_LOW } from './geo.js';
import { windowTexture, glowTexture, makeCanvas } from './textures.js';

/** Random positions beside the road, outside the walls and away from other parts of the track. */
function scatter(track, rng, { count, min, max, side = 0, shortcutClear = 22, tries = 30 }) {
  const out = [];
  let attempts = 0;
  while (out.length < count && attempts < count * tries) {
    attempts++;
    const i = Math.floor(rng() * track.N);
    const sd = side || (rng() < 0.5 ? -1 : 1);
    const lat = sd * (track.w[i] / 2 + track.shoulder + min + rng() * (max - min));
    const x = track.x[i] + track.nx[i] * lat;
    const z = track.z[i] + track.nz[i] * lat;
    if (distToRoadEdge(track, x, z, track.shoulder + min + 6) < track.shoulder + min * 0.85) continue;
    let near = false;
    for (const sc of track.shortcuts) {
      if (distToPolyline(sc.pts, x, z) < shortcutClear + sc.width / 2) near = true;
    }
    if (near) continue;
    out.push({ x, z, i, side: sd });
  }
  return out;
}

function ringPositions(track, rng, count, rMin, rMax) {
  const b = track.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const base = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
  const out = [];
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + rng() * 0.35;
    const r = base + rMin + rng() * (rMax - rMin);
    out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, a, r });
  }
  return out;
}

/** Distant mountain / mesa ring drawn without fog so it fades into the horizon colour by vertex colour. */
function horizonRing(track, rng, theme, { count, rMin, rMax, hMin, hMax, wMin, wMax, top, base, shape = 'cone' }) {
  const geo = shape === 'cone' ? new THREE.ConeGeometry(1, 1, 7, 1) : new THREE.CylinderGeometry(0.7, 1, 1, 8, 1);
  const pos = geo.attributes.position;
  const cTop = new THREE.Color(top);
  const cBase = new THREE.Color(base);
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(pos.getY(i) + 0.5, 0, 1);
    tmp.copy(cBase).lerp(cTop, Math.pow(t, 0.7));
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const items = ringPositions(track, rng, count, rMin, rMax).map((p) => {
    const h = hMin + rng() * (hMax - hMin);
    const w = wMin + rng() * (wMax - wMin);
    return { x: p.x, z: p.z, y: h / 2 - 6, sx: w, sy: h, sz: w, rot: rng() * 6.28 };
  });
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const mesh = instanced(geo, mat, items);
  mesh.frustumCulled = false;
  return mesh;
}

function jitter(rng, base, amt = 0.14) {
  const c = new THREE.Color(base);
  const k = 1 + (rng() - 0.5) * amt * 2;
  c.multiplyScalar(k);
  return c;
}

// ---------------------------------------------------------------- Meadow

function buildMeadow(track, theme, rng, root, anim, q) {
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });

  // trees: round and pine
  const round = merge([
    cylLow(0x7a5334, 0.3, 2.6, [0, 1.3, 0], [0, 0, 0], 0.38),
    ico(0x3f9a45, 1.9, 1.7, 1.9, [0, 3.7, 0]),
    ico(0x4fae52, 1.3, 1.2, 1.3, [0.7, 4.6, 0.3]),
  ]);
  const pine = merge([
    cylLow(0x6b4a2e, 0.25, 2.2, [0, 1.1, 0], [0, 0, 0], 0.34),
    coneLow(0x2f8a4c, 1.7, 3.0, [0, 3.2, 0]),
    coneLow(0x3a9a58, 1.3, 2.4, [0, 4.8, 0]),
    coneLow(0x45aa63, 0.9, 1.8, [0, 6.1, 0]),
  ]);
  const treePts = scatter(track, rng, { count: q === 'low' ? 140 : 300, min: 3, max: 60 });
  // forest clumps
  for (const c of scatter(track, rng, { count: 14, min: 25, max: 120, shortcutClear: 10 })) {
    for (let k = 0; k < (q === 'low' ? 6 : 14); k++) {
      const a = rng() * 6.28;
      const r = rng() * 24;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (distToRoadEdge(track, x, z, 30) > track.shoulder + 6) treePts.push({ x, z });
    }
  }
  const roundItems = [];
  const pineItems = [];
  for (const p of treePts) {
    const s = 0.8 + rng() * 0.9;
    const it = { x: p.x, z: p.z, rot: rng() * 6.28, s, color: jitter(rng, 0xffffff, 0.12) };
    (rng() < 0.55 ? roundItems : pineItems).push(it);
  }
  const rMesh = instanced(round, lambert, roundItems, { castShadow: q !== 'low' });
  const pMesh = instanced(pine, lambert, pineItems, { castShadow: q !== 'low' });
  root.add(rMesh, pMesh);

  // bushes and flowers
  const bush = merge([ico(0x3d9440, 1.1, 0.8, 1.1, [0, 0.6, 0]), ico(0x4aa84c, 0.8, 0.6, 0.8, [0.7, 0.4, 0.2])]);
  const bushItems = scatter(track, rng, { count: q === 'low' ? 60 : 150, min: 2, max: 36 }).map((p) => ({
    x: p.x, z: p.z, rot: rng() * 6.28, s: 0.7 + rng() * 0.9, color: jitter(rng, 0xffffff, 0.1),
  }));
  root.add(instanced(bush, lambert, bushItems));
  const flowerGeo = merge([sphLow(0xffffff, 0.22, 0.22, 0.22, [0, 0.25, 0])]);
  const flowerCols = [0xff6b9a, 0xffd23f, 0xffffff, 0xb28dff, 0xff9a3c];
  const flowerItems = [];
  for (const p of scatter(track, rng, { count: q === 'low' ? 80 : 260, min: 1.5, max: 30 })) {
    const n = 2 + Math.floor(rng() * 4);
    const col = flowerCols[Math.floor(rng() * flowerCols.length)];
    for (let k = 0; k < n; k++) {
      flowerItems.push({ x: p.x + (rng() - 0.5) * 3, z: p.z + (rng() - 0.5) * 3, s: 0.7 + rng() * 0.6, color: col });
    }
  }
  root.add(instanced(flowerGeo, lambert, flowerItems));

  // rolling hills
  const hillGeo = merge([part(SPH_LOW, 0x6cc25a, { scale: [1, 1, 1] })]);
  const hills = ringPositions(track, rng, 26, 120, 420).map((p) => {
    const s = 60 + rng() * 120;
    return { x: p.x, z: p.z, y: -s * 0.2, sx: s, sy: s * (0.28 + rng() * 0.2), sz: s, color: jitter(rng, 0xffffff, 0.16) };
  });
  const hillMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  root.add(instanced(hillGeo, hillMat, hills));

  root.add(
    horizonRing(track, rng, theme, {
      count: 30, rMin: 700, rMax: 950, hMin: 140, hMax: 340, wMin: 130, wMax: 280, top: 0xe6f0ff, base: 0x9fc4e6,
    }),
  );

  // windmill landmark
  const wp = scatter(track, rng, { count: 1, min: 26, max: 46 })[0];
  if (wp) {
    const mill = new THREE.Group();
    const tower = new THREE.Mesh(
      merge([
        cylLow(0xf2ead8, 2.2, 12, [0, 6, 0], [0, 0, 0], 3.2),
        coneLow(0xc2452e, 3.6, 3.4, [0, 13.5, 0]),
        box(0x6b4a2e, 1.4, 2.2, 0.2, [0, 1.1, 3.1]),
      ]),
      lambert,
    );
    tower.castShadow = true;
    mill.add(tower);
    const blades = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Mesh(
        merge([box(0xf5f0e6, 0.5, 8.5, 0.18, [0, 4.6, 0]), box(0xd8c9a8, 1.5, 6, 0.08, [0.9, 5.3, 0])]),
        lambert,
      );
      arm.rotation.z = (k * Math.PI) / 2;
      blades.add(arm);
    }
    blades.position.set(0, 12.2, 3.3);
    mill.add(blades);
    mill.position.set(wp.x, 0, wp.z);
    mill.scale.setScalar(1.3);
    // face the road
    mill.rotation.y = Math.atan2(track.x[wp.i] - wp.x, track.z[wp.i] - wp.z);
    root.add(mill);
    anim.push((dt) => {
      blades.rotation.z += dt * 0.8;
    });
  }

  // pond
  const pondPts = scatter(track, rng, { count: 2, min: 30, max: 70 });
  for (const p of pondPts) {
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(14 + rng() * 10, 20),
      new THREE.MeshLambertMaterial({ color: 0x4aa7e0, emissive: 0x0b3a66, emissiveIntensity: 0.6 }),
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(p.x, 0.02, p.z);
    pond.scale.set(1.4, 1, 1);
    root.add(pond);
  }

  grandstand(track, root, { roof: 0xd8342a, seat: 0x3d5aa8 }, rng);
}

/** A little grandstand with a crowd next to the start line. */
function grandstand(track, root, colors, rng) {
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  const parts = [];
  const lat = track.w[0] / 2 + track.shoulder + 9;
  for (let t = 0; t < 4; t++) {
    parts.push(box(0x8a8f99, 6 - t * 0.3, 1.0, 34, [t * 1.5, 0.5 + t * 1.0, 0]));
    parts.push(box(colors.seat, 0.8, 0.35, 34, [t * 1.5 - 1.8, 1.3 + t * 1.0, 0]));
  }
  parts.push(box(colors.roof, 9, 0.5, 38, [3.4, 7.2, 0]));
  for (const z of [-17, 17]) parts.push(box(0x4a4f5a, 0.5, 7.2, 0.5, [-1.4, 3.6, z]));
  const mesh = new THREE.Mesh(merge(parts), lambert);
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  // crowd
  const crowdGeo = merge([box(0xffffff, 0.55, 1.0, 0.4, [0, 0.5, 0]), sphLow(0xffd7b0, 0.26, 0.26, 0.26, [0, 1.25, 0])]);
  const cols = [0xff4a4a, 0x4aa8ff, 0xffd23f, 0x6be07a, 0xffffff, 0xff8fd0, 0xb28dff];
  const items = [];
  for (let t = 0; t < 4; t++) {
    for (let k = 0; k < 17; k++) {
      if (rng() < 0.12) continue;
      items.push({ x: t * 1.5 + 0.1, y: 1.5 + t * 1.0, z: -16 + k * 2 + (rng() - 0.5) * 0.4, s: 0.85 + rng() * 0.3, color: cols[Math.floor(rng() * cols.length)] });
    }
  }
  const crowd = instanced(crowdGeo, new THREE.MeshLambertMaterial({ vertexColors: false }), items);
  g.add(crowd);
  const side = 1;
  const x = track.x[0] + track.nx[0] * lat * side;
  const z = track.z[0] + track.nz[0] * lat * side;
  g.position.set(x, 0, z);
  g.rotation.y = track.hd[0] - Math.PI / 2 * side;
  root.add(g);
}

// ---------------------------------------------------------------- Dunes

function buildDunes(track, theme, rng, root, anim, q) {
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });

  const rockGeo = merge([dodeca(0xb5733f, 1, 0.8, 1, [0, 0.5, 0])]);
  const rocks = scatter(track, rng, { count: q === 'low' ? 80 : 190, min: 3, max: 70 }).map((p) => {
    const s = 0.9 + rng() * rng() * 4.5;
    return { x: p.x, z: p.z, rot: rng() * 6.28, sx: s * (0.8 + rng() * 0.6), sy: s * (0.6 + rng() * 0.7), sz: s, color: jitter(rng, 0xffffff, 0.2) };
  });
  root.add(instanced(rockGeo, lambert, rocks, { castShadow: q !== 'low' }));

  const cactus = merge([
    cylLow(0x4f9a52, 0.38, 4.2, [0, 2.1, 0]),
    sphLow(0x4f9a52, 0.38, 0.38, 0.38, [0, 4.2, 0]),
    cylLow(0x4f9a52, 0.22, 1.2, [0.8, 2.5, 0], [0, 0, Math.PI / 2]),
    cylLow(0x4f9a52, 0.22, 1.5, [1.35, 3.2, 0]),
    sphLow(0x4f9a52, 0.22, 0.22, 0.22, [1.35, 3.95, 0]),
    cylLow(0x4f9a52, 0.2, 1.0, [-0.7, 1.8, 0], [0, 0, Math.PI / 2]),
    cylLow(0x4f9a52, 0.2, 1.2, [-1.2, 2.4, 0]),
    sphLow(0x4f9a52, 0.2, 0.2, 0.2, [-1.2, 3.0, 0]),
  ]);
  const cacti = scatter(track, rng, { count: q === 'low' ? 30 : 80, min: 5, max: 60 }).map((p) => ({
    x: p.x, z: p.z, rot: rng() * 6.28, s: 0.8 + rng() * 0.8, color: jitter(rng, 0xffffff, 0.12),
  }));
  root.add(instanced(cactus, lambert, cacti, { castShadow: q !== 'low' }));

  // palm clusters
  const palm = merge([
    cylLow(0x8a6238, 0.3, 3.2, [0, 1.6, 0], [0, 0, 0.08], 0.38),
    cylLow(0x8a6238, 0.26, 3.2, [0.25, 4.7, 0], [0, 0, 0.18], 0.3),
    ...[0, 1, 2, 3, 4, 5].map((k) =>
      coneLow(0x3f9a4a, 0.55, 3.4, [Math.cos((k / 6) * 6.283) * 1.4 + 0.7, 6.6, Math.sin((k / 6) * 6.283) * 1.4], [Math.sin((k / 6) * 6.283) * 1.1, 0, -Math.cos((k / 6) * 6.283) * 1.1]),
    ),
    sphLow(0x6b4a2a, 0.25, 0.25, 0.25, [0.7, 6.3, 0.3]),
  ]);
  const palms = [];
  for (const c of scatter(track, rng, { count: 5, min: 20, max: 90, shortcutClear: 30 })) {
    for (let k = 0; k < 4; k++) palms.push({ x: c.x + (rng() - 0.5) * 16, z: c.z + (rng() - 0.5) * 16, rot: rng() * 6.28, s: 0.9 + rng() * 0.5 });
  }
  root.add(instanced(palm, lambert, palms, { castShadow: q !== 'low' }));

  // mesas, built as stacked striped boxes
  const mesaParts = [];
  const bands = [0xb85a30, 0xd2763f, 0xe9a05c, 0xc4673a, 0xf0c288];
  for (const p of ringPositions(track, rng, 18, 90, 380)) {
    const w = 40 + rng() * 80;
    const d = 40 + rng() * 80;
    let y = -4;
    const layers = 3 + Math.floor(rng() * 3);
    let ww = w;
    let dd = d;
    for (let l = 0; l < layers; l++) {
      const h = 14 + rng() * 22;
      mesaParts.push(box(bands[(l + Math.floor(rng() * 2)) % bands.length], ww, h, dd, [p.x, y + h / 2, p.z], [0, p.a, 0]));
      y += h;
      ww *= 0.78;
      dd *= 0.78;
    }
  }
  root.add(new THREE.Mesh(merge(mesaParts), lambert));

  // big dunes
  const duneGeo = merge([part(SPH_LOW, 0xe0a964)]);
  const dunes = ringPositions(track, rng, 36, 60, 520).map((p) => {
    const s = 70 + rng() * 140;
    return { x: p.x, z: p.z, y: -s * 0.16, sx: s * 1.4, sy: s * (0.22 + rng() * 0.14), sz: s, rot: rng() * 3, color: jitter(rng, 0xffffff, 0.12) };
  });
  root.add(instanced(duneGeo, lambert, dunes));

  root.add(
    horizonRing(track, rng, theme, {
      count: 26, rMin: 760, rMax: 1050, hMin: 90, hMax: 240, wMin: 160, wMax: 340, top: 0xc47a5a, base: 0xf0a878, shape: 'cyl',
    }),
  );

  // shortcut dressing: gate rocks flank each entry/exit, boulders sit in the ribbon
  const bigRock = merge([dodeca(0xa5653a, 1, 1.05, 1, [0, 0.9, 0]), dodeca(0xc27c48, 0.6, 0.7, 0.6, [0.5, 1.9, 0.1])]);
  const gateItems = [];
  for (const sc of track.shortcuts) {
    for (const end of [sc.entry, sc.exit]) {
      const nx = Math.cos(end.h);
      const nz = -Math.sin(end.h);
      const half = sc.width / 2 + 3.5;
      for (const sd of [-1, 1]) {
        gateItems.push({ x: end.x + nx * half * sd, z: end.z + nz * half * sd, rot: rng() * 6, s: 2.4 + rng() * 0.8 });
      }
    }
  }
  root.add(instanced(bigRock, lambert, gateItems, { castShadow: true }));
  const boulderItems = (track.obstacles || []).map((o) => ({ x: o.x, z: o.z, rot: rng() * 6, s: o.r * 0.95 }));
  root.add(instanced(bigRock, lambert, boulderItems, { castShadow: true }));

  grandstand(track, root, { roof: 0xe0a24a, seat: 0xb8462a }, rng);
}

// ---------------------------------------------------------------- Neon city

function buildingGeometry(w, h, d, tint) {
  let g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const floors = 48; // metres per window-texture tile vertically
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    let u = uv.getX(i);
    let v = uv.getY(i);
    if (face < 2) {
      u *= d / 10;
      v *= h / floors;
    } else if (face >= 4) {
      u *= w / 10;
      v *= h / floors;
    } else {
      u = 0.02;
      v = 0.01;
    }
    uv.setXY(i, u, v);
  }
  g.translate(0, h / 2, 0);
  g = g.toNonIndexed();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tint.r;
    col[i * 3 + 1] = tint.g;
    col[i * 3 + 2] = tint.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function neonSignTexture(text, color) {
  const c = makeCanvas(256, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0b18';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.strokeRect(8, 8, 240, 80);
  ctx.fillStyle = color;
  ctx.font = '900 46px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildNeon(track, theme, rng, root, anim, q) {
  const winTex = windowTexture(7);
  winTex.anisotropy = 4;
  const bmat = new THREE.MeshLambertMaterial({ map: winTex, vertexColors: true, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.85 });
  const geos = [];
  const tints = [0x8a8fc8, 0x9a86c8, 0x7f9ad0, 0xb48ac0, 0x8aa6b8];
  const placed = [];
  const tryPlace = (i, side, row) => {
    const w = 14 + rng() * 18;
    const d = 14 + rng() * 18;
    const h = row === 0 ? 24 + rng() * 60 : 50 + rng() * 120;
    const lat = side * (track.w[i] / 2 + track.shoulder + (row === 0 ? 5 : 34 + rng() * 25) + d / 2);
    const x = track.x[i] + track.nx[i] * lat;
    const z = track.z[i] + track.nz[i] * lat;
    if (distToRoadEdge(track, x, z, 70) < track.shoulder + (row === 0 ? 5 : 20) + Math.max(w, d) * 0.5) return 0;
    for (const p of placed) if (Math.abs(p.x - x) < (p.r + Math.max(w, d) * 0.5) * 0.9 && Math.abs(p.z - z) < (p.r + Math.max(w, d) * 0.5) * 0.9) return 0;
    placed.push({ x, z, r: Math.max(w, d) * 0.5 });
    const g = buildingGeometry(w, h, d, new THREE.Color(tints[Math.floor(rng() * tints.length)]));
    g.rotateY(track.hd[i]);
    g.translate(x, 0, z);
    geos.push(g);
    // rooftop antenna
    if (rng() < 0.5) {
      const a = cylLow(0x9aa4c8, 0.2, 10, [x, h + 5, z]);
      geos.push(a);
    }
    return w;
  };
  for (const side of [-1, 1]) {
    for (const row of q === 'low' ? [0] : [0, 1]) {
      let i = Math.floor(rng() * 10);
      while (i < track.N) {
        const w = tryPlace(i, side, row);
        i += Math.max(6, Math.floor(((w || 12) + 4) / track.ds));
      }
    }
  }
  // a far skyline ring so the horizon is never empty
  for (const p of ringPositions(track, rng, 70, 160, 520)) {
    const w = 30 + rng() * 40;
    const h = 80 + rng() * 200;
    const g = buildingGeometry(w, h, w, new THREE.Color(tints[Math.floor(rng() * tints.length)]));
    g.rotateY(rng() * 3);
    g.translate(p.x, 0, p.z);
    geos.push(g);
  }
  // merge only buildings (same attribute set); antennas use vertex colors but have no uvs, so add them
  const uniform = geos.map((g) => {
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    return g;
  });
  const city = new THREE.Mesh(merge(uniform), bmat);
  root.add(city);

  // neon signs
  const signs = [['RAMEN', '#ff4fa8'], ['ARCADE', '#40e8ff'], ['HOTEL', '#ffd23f'], ['NOODLE', '#9d7bff'], ['KART', '#ff6a3a'], ['BAR', '#5dffb0'], ['DISCO', '#ff4fa8'], ['PIZZA', '#ffb23f']];
  const signPts = scatter(track, rng, { count: signs.length, min: 8, max: 14 });
  signPts.forEach((p, k) => {
    const tex = neonSignTexture(signs[k][0], signs[k][1]);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.2), new THREE.MeshBasicMaterial({ map: tex }));
    mesh.position.set(p.x, 14 + rng() * 10, p.z);
    mesh.rotation.y = Math.atan2(track.x[p.i] - p.x, track.z[p.i] - p.z);
    root.add(mesh);
    const post = new THREE.Mesh(merge([cylLow(0x2a2d44, 0.3, 24, [0, 12, 0])]), new THREE.MeshLambertMaterial({ vertexColors: true }));
    post.position.set(p.x, 0, p.z);
    root.add(post);
  });

  // street lamps with glow
  const lampPoleGeo = merge([cylLow(0x3a3f5c, 0.14, 7.4, [0, 3.7, 0]), box(0x3a3f5c, 0.2, 0.2, 1.4, [0, 7.3, 0.6])]);
  const poleItems = [];
  const glowPos = [];
  const step = Math.round(30 / track.ds);
  for (let i = 0; i < track.N; i += step) {
    for (const side of [-1, 1]) {
      const lat = side * (track.w[i] / 2 + track.shoulder + 2.2);
      const x = track.x[i] + track.nx[i] * lat;
      const z = track.z[i] + track.nz[i] * lat;
      if (distToRoadEdge(track, x, z, 14) < track.shoulder + 1.2) continue;
      poleItems.push({ x, z, rot: Math.atan2(-track.nx[i] * side, -track.nz[i] * side) + Math.PI });
      glowPos.push(x - track.nx[i] * side * 1.3, 7.3, z - track.nz[i] * side * 1.3);
    }
  }
  root.add(instanced(lampPoleGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), poleItems));
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
  const glow = new THREE.Points(
    glowGeo,
    new THREE.PointsMaterial({ map: glowTexture('rgba(255,225,160,1)'), size: 9, color: 0xffe2a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  root.add(glow);

  // pedestrian bridge over the road
  const bi = Math.floor(track.N * 0.1);
  {
    const i = bi;
    const lat = track.w[i] / 2 + track.shoulder + 3;
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x252a45 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(lat * 2 + 4, 1.0, 5), dark);
    deck.position.y = 9;
    g.add(deck);
    for (const s of [-1, 1]) {
      const sup = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 3.2), dark);
      sup.position.set(s * (lat + 1), 4.5, 0);
      g.add(sup);
    }
    for (const [c, off] of [[0xff3fb4, -2.6], [0x3fe8ff, 2.6]]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(lat * 2 + 4.2, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: c }));
      trim.position.set(0, 9.62, off);
      g.add(trim);
    }
    g.position.set(track.x[i], 0, track.z[i]);
    g.rotation.y = track.hd[i];
    root.add(g);
  }

  // searchlight beams
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x7fa0ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beams = [];
  for (const p of ringPositions(track, rng, 4, 80, 200)) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(2, 9, 420, 10, 1, true), beamMat);
    m.position.set(p.x, 200, p.z);
    m.rotation.z = (rng() - 0.5) * 0.5;
    m.rotation.x = (rng() - 0.5) * 0.5;
    root.add(m);
    beams.push({ m, s: 0.2 + rng() * 0.3, a: rng() * 6 });
  }
  anim.push((dt, t) => {
    for (const b of beams) {
      b.m.rotation.z = Math.sin(t * b.s + b.a) * 0.45;
      b.m.rotation.x = Math.cos(t * b.s * 0.8 + b.a) * 0.45;
    }
  });

  grandstand(track, root, { roof: 0xff3fb4, seat: 0x3fe8ff }, rng);
}

// ---------------------------------------------------------------- stars

function buildStars(root, rng) {
  const n = 900;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const e = Math.acos(1 - rng() * 0.92);
    const r = 1800;
    pos[i * 3] = Math.sin(e) * Math.cos(a) * r;
    pos[i * 3 + 1] = Math.cos(e) * r;
    pos[i * 3 + 2] = Math.sin(e) * Math.sin(a) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
  m.frustumCulled = false;
  m.userData.followCamera = true;
  root.add(m);
}

export function buildScenery(track, theme, quality = 'high') {
  const root = new THREE.Group();
  root.name = 'scenery';
  const rng = mulberry32(theme.seed * 977 + 13);
  const anim = [];
  if (theme.id === 'meadow') buildMeadow(track, theme, rng, root, anim, quality);
  else if (theme.id === 'dunes') buildDunes(track, theme, rng, root, anim, quality);
  else buildNeon(track, theme, rng, root, anim, quality);
  if (theme.stars) buildStars(root, rng);
  return {
    group: root,
    update(dt, t) {
      for (const f of anim) f(dt, t);
    },
    dispose() {
      root.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      });
    },
  };
}
