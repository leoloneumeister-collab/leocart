// Pure track geometry. No THREE imports so it can be validated in Node.
//
// A track is a closed rounded polygon, resampled at uniform arc length.
// Every per-sample array (x, z, tangent, right-normal, width, curvature, wall limits)
// is indexed by sample index i in [0, N). Physics, AI, rendering and the minimap all
// read from this one structure.

import { clamp, wrapPi, TAU } from '../util/math.js';

export const SAMPLE_SPACING = 2; // metres between samples

/**
 * Rounded polygon: [x, z, radius] vertices joined by straights, with a circular fillet of the
 * given radius at every vertex. Radius 0 means "pass straight through" (used for the start
 * line). Corner radii are therefore exact, which keeps tuning and AI speed limits predictable.
 */
function roundedPolygon(corners) {
  const n = corners.length;
  const out = [];
  const arcs = new Array(n).fill(null);
  const tangent = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const [vx, vz, r] = corners[i];
    if (!r) {
      out.push([vx, vz]);
      continue;
    }
    const [px, pz] = corners[(i - 1 + n) % n];
    const [qx, qz] = corners[(i + 1) % n];
    let ux = px - vx, uz = pz - vz;
    let wx = qx - vx, wz = qz - vz;
    const ul = Math.hypot(ux, uz);
    const wl = Math.hypot(wx, wz);
    ux /= ul; uz /= ul; wx /= wl; wz /= wl;
    const cosPhi = clamp(ux * wx + uz * wz, -1, 1);
    const phi = Math.acos(cosPhi); // interior angle between the two legs
    const t = r / Math.tan(phi / 2); // distance from vertex to tangent points
    if (t > ul * 0.98 || t > wl * 0.98) {
      throw new Error(`track corner ${i} radius ${r} does not fit between its neighbours`);
    }
    tangent[i] = t;
    const ax = vx + ux * t, az = vz + uz * t;
    const bx = vx + wx * t, bz = vz + wz * t;
    let bxm = ux + wx, bzm = uz + wz;
    const bl = Math.hypot(bxm, bzm) || 1;
    bxm /= bl; bzm /= bl;
    const cd = r / Math.sin(phi / 2);
    const cx = vx + bxm * cd, cz = vz + bzm * cd;
    const a0 = Math.atan2(az - cz, ax - cx);
    let a1 = Math.atan2(bz - cz, bx - cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    const steps = Math.max(4, Math.ceil((Math.abs(da) * r) / 1.5));
    const first = out.length;
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (da * k) / steps;
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    arcs[i] = { a0: first, a1: out.length - 1, r };
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const leg = Math.hypot(corners[j][0] - corners[i][0], corners[j][1] - corners[i][1]);
    if (tangent[i] + tangent[j] > leg) {
      throw new Error(`track corners ${i} and ${j} overlap: radii need ${(tangent[i] + tangent[j]).toFixed(0)} m but the leg is ${leg.toFixed(0)} m`);
    }
  }
  return { pts: out, arcs };
}

function smoothWrap(arr, radius) {
  const n = arr.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += arr[(i + k + n) % n];
    out[i] = sum / (2 * radius + 1);
  }
  return out;
}

function gaussianWrap(arr, sigma) {
  const n = arr.length;
  const r = Math.ceil(sigma * 3);
  const kernel = [];
  let ksum = 0;
  for (let k = -r; k <= r; k++) {
    const v = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(v);
    ksum += v;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += arr[(i + k + n * 4) % n] * kernel[k + r];
    out[i] = sum / ksum;
  }
  return out;
}

export function buildTrackData(def) {
  // `scale` stretches the layout (coordinates and corner radii) without touching road width.
  const sc = def.scale ?? 1;
  def.corners = def.corners.map((c) => (c.scaled ? c : Object.assign([c[0] * sc, c[1] * sc, c[2] * sc], { scaled: true })));
  const poly = roundedPolygon(def.corners);
  const fine = poly.pts.map((p) => [p[0], p[1], def.width]);
  const m = fine.length;
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const a = fine[i];
    const b = fine[(i + 1) % m];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const length = cum[m];
  const N = Math.round(length / SAMPLE_SPACING);
  const ds = length / N;

  const x = new Float32Array(N);
  const z = new Float32Array(N);
  const w = new Float32Array(N);
  const s = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = i * ds;
    while (j < m - 1 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1e-6;
    const u = (target - cum[j]) / seg;
    const a = fine[j];
    const b = fine[(j + 1) % m];
    x[i] = a[0] + (b[0] - a[0]) * u;
    z[i] = a[1] + (b[1] - a[1]) * u;
    w[i] = a[2] + (b[2] - a[2]) * u;
    s[i] = target;
  }
  const wS = smoothWrap(w, 4);

  const tx = new Float32Array(N);
  const tz = new Float32Array(N);
  const nx = new Float32Array(N); // right-hand normal (looking along travel direction)
  const nz = new Float32Array(N);
  const hd = new Float32Array(N); // heading, same convention as karts: forward = (sin h, cos h)
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N;
    const b = (i + 1) % N;
    let dx = x[b] - x[a];
    let dz = z[b] - z[a];
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    tx[i] = dx;
    tz[i] = dz;
    nx[i] = -dz;
    nz[i] = dx;
    hd[i] = Math.atan2(dx, dz);
  }
  const kRaw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    kRaw[i] = wrapPi(hd[(i + 1) % N] - hd[(i - 1 + N) % N]) / (2 * ds); // + = turning left
  }
  const kappa = smoothWrap(kRaw, 3);

  // Wall limits: lateral distance from the centreline at which the barrier sits.
  const shoulder = def.shoulder ?? 4;
  const limL = new Float32Array(N);
  const limR = new Float32Array(N);
  const openL = new Uint8Array(N);
  const openR = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    limL[i] = wS[i] / 2 + shoulder;
    limR[i] = wS[i] / 2 + shoulder;
  }
  for (const span of def.openSpans || []) {
    const a = Math.floor(span.from * N);
    const b = Math.floor(span.to * N);
    const extra = span.extra ?? 45;
    for (let i = a; i !== b; i = (i + 1) % N) {
      if (span.side === 'L' || span.side === 'both') {
        limL[i] = wS[i] / 2 + extra;
        openL[i] = 1;
      }
      if (span.side === 'R' || span.side === 'both') {
        limR[i] = wS[i] / 2 + extra;
        openR[i] = 1;
      }
    }
  }

  const track = {
    def,
    N,
    ds,
    length,
    laps: def.laps ?? 3,
    x,
    z,
    w: wS,
    s,
    tx,
    tz,
    nx,
    nz,
    hd,
    kappa,
    limL,
    limR,
    openL,
    openR,
    shoulder,
    checkpoints: [],
    boostPads: [],
    itemRows: [],
    shortcuts: [],
    bounds: null,
  };

  // Checkpoints are fractions of the lap; the finish line is implicit at s = 0.
  for (const f of def.checkpoints || [0.25, 0.5, 0.75]) {
    const i = Math.floor(f * N) % N;
    track.checkpoints.push({ s: i * ds, i });
  }
  for (const p of def.boostPads || []) {
    const i = Math.floor(p.t * N) % N;
    track.boostPads.push({ i, s: i * ds, lat: p.lat ?? 0, width: p.width ?? 6, len: p.len ?? 8 });
  }
  for (const r of def.itemRows || []) {
    const i = Math.floor(r.t * N) % N;
    track.itemRows.push({ i, s: i * ds, count: r.count ?? 4 });
  }

  // Corner metadata: where each fillet starts/ends along the lap and which way it turns.
  track.corners = def.corners.map((c, i) => {
    const arc = poly.arcs[i];
    if (!arc) return null;
    const P = def.corners[(i - 1 + def.corners.length) % def.corners.length];
    const Q = def.corners[(i + 1) % def.corners.length];
    const hIn = Math.atan2(c[0] - P[0], c[1] - P[1]);
    const hOut = Math.atan2(Q[0] - c[0], Q[1] - c[1]);
    const turn = wrapPi(hOut - hIn);
    return { index: i, s0: cum[arc.a0], s1: cum[arc.a1], r: arc.r, dir: turn > 0 ? 1 : -1, angle: Math.abs(turn) };
  });

  // Shortcuts cut across the inside of a corner: open the inside wall, lay a dirt ribbon
  // along a Bezier chord, and put a boost pad before the entrance.
  track.obstacles = [];
  for (const sc of def.shortcuts || []) {
    const c = track.corners[sc.corner];
    if (!c) throw new Error(`shortcut references corner ${sc.corner} which has no fillet`);
    const lead = sc.lead ?? 24;
    const sIn = c.s0 - lead;
    const sOut = c.s1 + lead;
    const E = posAt(track, sIn);
    const X = posAt(track, sOut);
    const k = Math.hypot(X.x - E.x, X.z - E.z) * 0.38;
    const eT = [Math.sin(E.h), Math.cos(E.h)];
    const xT = [Math.sin(X.h), Math.cos(X.h)];
    const p0 = [E.x, E.z];
    const p1 = [E.x + eT[0] * k, E.z + eT[1] * k];
    const p2 = [X.x - xT[0] * k, X.z - xT[1] * k];
    const p3 = [X.x, X.z];
    const pts = [];
    for (let q = 0; q <= 18; q++) {
      const u = q / 18;
      const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, cc = 3 * (1 - u) * u * u, d = u ** 3;
      pts.push([a * p0[0] + b * p1[0] + cc * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + cc * p2[1] + d * p3[1]]);
    }
    // two boulders sit in the ribbon on alternating sides, so the cut-through needs a clean line
    for (const [qi, sg] of [[6, 1], [12, -1]]) {
      const a = pts[qi - 1];
      const b = pts[qi + 1];
      let dx = b[0] - a[0];
      let dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      track.obstacles.push({ x: pts[qi][0] - dz * 3.7 * sg, z: pts[qi][1] + dx * 3.7 * sg, r: 1.7 });
    }
    const side = c.dir > 0 ? 'L' : 'R'; // inside of the bend
    const iA = Math.floor(((sIn - 8 + length) % length) / ds);
    const iB = Math.floor(((sOut + 8) % length) / ds);
    const extra = sc.extra ?? 60;
    for (let i = iA; i !== iB; i = (i + 1) % N) {
      if (side === 'L') { limL[i] = wS[i] / 2 + extra; openL[i] = 1; }
      else { limR[i] = wS[i] / 2 + extra; openR[i] = 1; }
    }
    track.shortcuts.push({ pts, width: sc.width ?? 12, entry: E, exit: X, sIn, sOut, side, corner: sc.corner });
    if (sc.pad !== false) {
      const sp = ((sIn - 34 + length) % length);
      track.boostPads.push({ i: Math.floor(sp / ds), s: sp, lat: 0, width: 8, len: 8 });
    }
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, x[i]);
    maxX = Math.max(maxX, x[i]);
    minZ = Math.min(minZ, z[i]);
    maxZ = Math.max(maxZ, z[i]);
  }
  track.bounds = { minX, maxX, minZ, maxZ };

  // Spatial hash of sample indices for scenery placement and surface queries.
  const CELL = 32;
  const grid = new Map();
  const key = (cx, cz) => cx * 73856 + cz * 19349;
  for (let i = 0; i < N; i++) {
    const k = key(Math.floor(x[i] / CELL), Math.floor(z[i] / CELL));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(i);
  }
  track.CELL = CELL;
  track.grid = grid;
  track.cellKey = key;

  computeRacingLine(track);
  return track;
}

/** Racing line: lateral offset (metres, + = right) per sample. Cuts the inside of corners. */
function computeRacingLine(track) {
  const { N, kappa, w } = track;
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const maxOff = Math.max(0, w[i] / 2 - 3.2);
    raw[i] = -clamp(kappa[i] * 70, -1, 1) * maxOff;
  }
  const smooth = gaussianWrap(raw, 12);
  // Start the cut-in slightly before the apex by sampling a bit ahead.
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = smooth[(i + 5) % N];
  track.lineOff = out;
}

/** Minimum distance from (x,z) to the track's road edge. Negative when on the road. */
export function distToRoadEdge(track, px, pz, cap = 80) {
  const { CELL, grid, cellKey, x, z, w } = track;
  const cx = Math.floor(px / CELL);
  const cz = Math.floor(pz / CELL);
  const r = Math.ceil(cap / CELL);
  let best = Infinity;
  for (let a = -r; a <= r; a++) {
    for (let b = -r; b <= r; b++) {
      const list = grid.get(cellKey(cx + a, cz + b));
      if (!list) continue;
      for (let q = 0; q < list.length; q++) {
        const i = list[q];
        const d = Math.hypot(px - x[i], pz - z[i]) - w[i] / 2;
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/** World position and heading at arc length s with lateral offset lat. */
export function posAt(track, sArc, lat = 0, out = {}) {
  const { N, ds, length } = track;
  let sw = ((sArc % length) + length) % length;
  const f = sw / ds;
  const i = Math.floor(f) % N;
  const j = (i + 1) % N;
  const u = f - Math.floor(f);
  const px = track.x[i] + (track.x[j] - track.x[i]) * u;
  const pz = track.z[i] + (track.z[j] - track.z[i]) * u;
  const nxv = track.nx[i] + (track.nx[j] - track.nx[i]) * u;
  const nzv = track.nz[i] + (track.nz[j] - track.nz[i]) * u;
  out.x = px + nxv * lat;
  out.z = pz + nzv * lat;
  out.h = track.hd[i];
  out.i = i;
  return out;
}

/**
 * Tracks a moving point along the track using a windowed nearest-sample search.
 * `distance` is the signed path integral of forward progress, so driving backwards
 * over the line unwinds it. That makes lap cheating impossible without checkpoints,
 * and checkpoints add a second, independent gate on top.
 */
export class TrackProbe {
  constructor(track) {
    this.track = track;
    this.idx = 0;
    this.s = 0; // arc length within the lap [0, length)
    this.lat = 0; // lateral offset, + = right of centreline
    this.distance = 0; // unwrapped signed progress
    this.dist2 = 0;
  }

  /** Full search, used on placement/respawn. */
  reset(px, pz, initialDistance) {
    const t = this.track;
    let best = Infinity;
    let bi = 0;
    for (let i = 0; i < t.N; i++) {
      const dx = px - t.x[i];
      const dz = pz - t.z[i];
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    this.idx = bi;
    this._refine(px, pz);
    this.distance = initialDistance ?? (this.s > t.length / 2 ? this.s - t.length : this.s);
    this.prevS = this.s;
  }

  update(px, pz) {
    const t = this.track;
    const W = 45;
    let best = Infinity;
    let bi = this.idx;
    for (let k = -W; k <= W; k++) {
      const i = (this.idx + k + t.N) % t.N;
      const dx = px - t.x[i];
      const dz = pz - t.z[i];
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    this.idx = bi;
    this._refine(px, pz);
    let d = this.s - this.prevS;
    const L = t.length;
    if (d > L / 2) d -= L;
    else if (d < -L / 2) d += L;
    this.distance += d;
    this.prevS = this.s;
  }

  _refine(px, pz) {
    const t = this.track;
    const i = this.idx;
    const dx = px - t.x[i];
    const dz = pz - t.z[i];
    const along = dx * t.tx[i] + dz * t.tz[i];
    this.lat = dx * t.nx[i] + dz * t.nz[i];
    let s = t.s[i] + along;
    const L = t.length;
    if (s < 0) s += L;
    else if (s >= L) s -= L;
    this.s = s;
    this.dist2 = dx * dx + dz * dz;
    if (this.prevS === undefined) this.prevS = s;
  }
}

/** Distance from point to a polyline (for shortcut ribbons). */
export function distToPolyline(pts, px, pz) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const abx = bx - ax;
    const abz = bz - az;
    const l2 = abx * abx + abz * abz || 1;
    const t = clamp(((px - ax) * abx + (pz - az) * abz) / l2, 0, 1);
    const d = Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
    if (d < best) best = d;
  }
  return best;
}
