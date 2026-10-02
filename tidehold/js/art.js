// Procedural art. Every building, obstacle and troop is drawn with canvas paths: no image files.
// Buildings are drawn once into an offscreen sprite (cached) in a local isometric space where
// (u, v) are tile offsets inside the footprint and z is height in pixels.

import './util.js'; // canvas polyfills

export const TW = 64;
export const TH = 32;
const HW = TW / 2;
const HH = TH / 2;
const PAD = 14;

// ---------- colour helpers ----------

function parse(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex, f) {
  const [r, g, b] = parse(hex);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
export function mix(a, b, t) {
  const A = parse(a);
  const B = parse(b);
  const c = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}
function lighten(hex, t) {
  return mix(hex, '#ffffff', t);
}

export const PAL = {
  grassA: '#8bd06a', grassB: '#82c862', grassEdge: '#6bb050',
  sand: '#f3deaa', sandDark: '#e6c98c', earth: '#9a6b43', earthDark: '#7a5233',
  stone: '#cdc5b6', stoneDark: '#a79f90', slate: '#8e949f',
  wood: '#b27c4a', woodDark: '#80532c', woodLight: '#d09a62',
  gold: '#ffd24a', goldDark: '#d8a216', crystal: '#7ad7ff', crystalDark: '#4f8fe0', violet: '#b58cff',
  teamP: '#3d7be0', teamE: '#d9453f', fire: '#ff9a2e',
  skin: '#f1c08f',
};

const THEMES = [
  { roof: '#c9573b', roofDark: '#9d3f2b', trim: '#ead9b6', accent: '#f0b04a' },
  { roof: '#4a82c9', roofDark: '#33619b', trim: '#d9e4f2', accent: '#f0d36a' },
  { roof: '#8a5bd0', roofDark: '#6540a0', trim: '#e9dcff', accent: '#ffd76a' },
  { roof: '#e6b422', roofDark: '#b88a10', trim: '#fff3c4', accent: '#ff7a59' },
];
const themeOf = (lvl) => THEMES[Math.min(3, Math.floor((lvl - 1) / 2))];

// ---------- drawing primitives (local iso space) ----------

const P = (u, v, z = 0) => [(u - v) * HW, (u + v) * HH - z];

function poly(g, pts, fill, stroke, lw = 1) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
}

function box(g, u0, v0, u1, v1, z0, z1, c, o = {}) {
  const left = o.left || shade(c, 0.84);
  const right = o.right || shade(c, 0.64);
  const edge = o.edge === undefined ? 'rgba(0,0,0,0.18)' : o.edge;
  poly(g, [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)], left, edge, 1);
  poly(g, [P(u1, v1, z0), P(u1, v0, z0), P(u1, v0, z1), P(u1, v1, z1)], right, edge, 1);
  poly(g, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], o.top || c, edge, 1);
}

function ell(g, x, y, rx, ry, fill, stroke, lw = 1) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}

function cyl(g, u, v, r, z0, z1, c, o = {}) {
  const [x, yt] = P(u, v, z1);
  const yb = P(u, v, z0)[1];
  const rx = r * HW * 1.414;
  const ry = r * HH * 1.414;
  const grad = g.createLinearGradient(x - rx, 0, x + rx, 0);
  grad.addColorStop(0, shade(c, 1.08));
  grad.addColorStop(0.45, c);
  grad.addColorStop(1, shade(c, 0.62));
  g.beginPath();
  g.moveTo(x - rx, yt);
  g.lineTo(x - rx, yb);
  g.ellipse(x, yb, rx, ry, 0, Math.PI, 0, true);
  g.lineTo(x + rx, yt);
  g.closePath();
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1;
  g.stroke();
  ell(g, x, yt, rx, ry, o.top || lighten(c, 0.12), 'rgba(0,0,0,0.2)');
}

function pyramid(g, u0, v0, u1, v1, z, h, c) {
  const apex = P((u0 + u1) / 2, (v0 + v1) / 2, z + h);
  poly(g, [P(u0, v1, z), P(u1, v1, z), apex], shade(c, 0.9), 'rgba(0,0,0,0.2)');
  poly(g, [P(u1, v1, z), P(u1, v0, z), apex], shade(c, 0.66), 'rgba(0,0,0,0.2)');
}

function cone(g, u, v, r, z, h, c) {
  const [x, y] = P(u, v, z);
  const rx = r * HW * 1.414;
  const ry = r * HH * 1.414;
  const apexY = y - h;
  const grad = g.createLinearGradient(x - rx, 0, x + rx, 0);
  grad.addColorStop(0, shade(c, 1.1));
  grad.addColorStop(0.5, c);
  grad.addColorStop(1, shade(c, 0.6));
  g.beginPath();
  g.moveTo(x - rx, y);
  g.lineTo(x, apexY);
  g.lineTo(x + rx, y);
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI);
  g.closePath();
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.2)';
  g.lineWidth = 1;
  g.stroke();
}

// gable roof running along u (axis 'u') or v
function gable(g, u0, v0, u1, v1, z, h, c, axis = 'u') {
  if (axis === 'u') {
    const vm = (v0 + v1) / 2;
    const r0 = P(u0, vm, z + h);
    const r1 = P(u1, vm, z + h);
    poly(g, [P(u0, v1, z), P(u1, v1, z), r1, r0], shade(c, 0.9), 'rgba(0,0,0,0.22)');
    poly(g, [P(u1, v1, z), P(u1, v0, z), r1], shade(c, 0.62), 'rgba(0,0,0,0.22)');
    poly(g, [P(u0, v0, z), P(u1, v0, z), r1, r0], shade(c, 1.05), 'rgba(0,0,0,0.22)');
  } else {
    const um = (u0 + u1) / 2;
    const r0 = P(um, v0, z + h);
    const r1 = P(um, v1, z + h);
    poly(g, [P(u0, v1, z), P(u1, v1, z), P(um, v1, z + h)], shade(c, 0.9), 'rgba(0,0,0,0.22)');
    poly(g, [P(u1, v1, z), P(u1, v0, z), r0, r1], shade(c, 0.62), 'rgba(0,0,0,0.22)');
    poly(g, [P(u0, v0, z), P(u0, v1, z), r1, r0], shade(c, 1.05), 'rgba(0,0,0,0.22)');
  }
}

function dome(g, u, v, r, z, h, c) {
  const [x, y] = P(u, v, z);
  const rx = r * HW * 1.414;
  const ry = r * HH * 1.414;
  const grad = g.createRadialGradient(x - rx * 0.35, y - h * 0.7, 2, x, y - h * 0.4, rx * 1.1);
  grad.addColorStop(0, lighten(c, 0.55));
  grad.addColorStop(0.5, c);
  grad.addColorStop(1, shade(c, 0.6));
  g.beginPath();
  g.moveTo(x - rx, y);
  g.bezierCurveTo(x - rx, y - h * 1.35, x + rx, y - h * 1.35, x + rx, y);
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI);
  g.closePath();
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.2)';
  g.lineWidth = 1;
  g.stroke();
}

function faceted(g, u, v, z, w, h, c) {
  const [x, y] = P(u, v, z);
  const top = [x, y - h];
  const l = [x - w, y - h * 0.62];
  const r = [x + w, y - h * 0.62];
  const bl = [x - w * 0.8, y];
  const br = [x + w * 0.8, y + 1];
  poly(g, [top, l, bl, [x, y + 3]], lighten(c, 0.25), 'rgba(0,0,0,0.25)');
  poly(g, [top, r, br, [x, y + 3]], shade(c, 0.78), 'rgba(0,0,0,0.25)');
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x - w * 0.35, y - h * 0.7);
  g.lineTo(x - w * 0.45, y - h * 0.25);
  g.stroke();
}

function pole(g, u, v, z0, z1, c = '#5b3b1f') {
  const a = P(u, v, z0);
  const b = P(u, v, z1);
  g.strokeStyle = c;
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(b[0], b[1]);
  g.stroke();
}

function pennant(g, u, v, z, c, t = 0, len = 15, hgt = 9) {
  const [x, y] = P(u, v, z);
  const w1 = Math.sin(t * 5) * 2;
  const w2 = Math.sin(t * 5 + 1.4) * 2.5;
  poly(g, [[x, y], [x + len * 0.55, y + 1 + w1], [x + len, y + hgt * 0.4 + w2], [x + len * 0.55, y + hgt * 0.7 + w1], [x, y + hgt]], c, 'rgba(0,0,0,0.25)');
}

function shadowBlob(g, s, alpha = 0.22, inset = 0.05) {
  const a = s * inset;
  poly(g, [P(a, a), P(s - a + 0.15, a), P(s - a + 0.15, s - a + 0.15), P(a, s - a + 0.15)], `rgba(20,40,10,${alpha})`);
}

function line(g, p, q, w, c) {
  g.strokeStyle = c;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(p[0], p[1]);
  g.lineTo(q[0], q[1]);
  g.stroke();
}

function arch(g, u0, u1, v, z0, z1, c) {
  // door on the left-facing (v) side
  const a = P(u0, v, z0);
  const b = P(u1, v, z0);
  const c1 = P(u0, v, z1);
  const d = P(u1, v, z1);
  poly(g, [a, b, d, c1], c, 'rgba(0,0,0,0.35)');
}

// ---------- the buildings ----------

const ART = {};
const MAXH = { keep: 135, gmine: 70, cwell: 90, vault: 85, tank: 90, camp: 85, barracks: 85, forge: 100, cannon: 60, ballista: 60, mortar: 70, bomb: 14, wall: 40, scaffold: 70 };

ART.keep = (g, s, lvl, team) => {
  const th = themeOf(Math.min(7, lvl + 1));
  const flag = team === 'e' ? PAL.teamE : PAL.teamP;
  shadowBlob(g, 4, 0.25);
  box(g, 0, 0, 4, 4, 0, 9, '#c9c0ae');
  box(g, 0.25, 0.25, 3.75, 3.75, 9, 12, '#b9b09d', { top: '#a6bf7a' });
  const tower = (u, v) => {
    cyl(g, u, v, 0.48, 9, 64 + lvl * 2, '#d7cfbf');
    cone(g, u, v, 0.58, 64 + lvl * 2, 26, th.roof);
    pole(g, u, v, 90 + lvl * 2, 104 + lvl * 2);
  };
  tower(0.55, 0.55);
  box(g, 0.7, 0.7, 3.3, 3.3, 12, 52, '#d9d1c1');
  // brick lines on the front faces
  g.strokeStyle = 'rgba(0,0,0,0.08)';
  g.lineWidth = 1;
  for (let z = 20; z < 52; z += 8) {
    g.beginPath();
    g.moveTo(...P(0.7, 3.3, z));
    g.lineTo(...P(3.3, 3.3, z));
    g.stroke();
    g.beginPath();
    g.moveTo(...P(3.3, 3.3, z));
    g.lineTo(...P(3.3, 0.7, z));
    g.stroke();
  }
  // gate
  arch(g, 1.55, 2.45, 3.3, 12, 34, '#3a2a1c');
  arch(g, 1.7, 2.3, 3.3, 12, 30, '#5a3d24');
  // windows
  for (const u of [0.95, 2.85]) arch(g, u, u + 0.28, 3.3, 28, 42, '#46352a');
  for (const v of [1.0, 2.0]) {
    const a = P(3.3, v, 28);
    const b = P(3.3, v + 0.3, 28);
    poly(g, [a, b, [b[0], b[1] - 14], [a[0], a[1] - 14]], '#46352a');
  }
  // battlements
  for (let i = 0; i < 6; i++) {
    const u = 0.8 + i * 0.5;
    box(g, u, 3.1, u + 0.28, 3.3, 52, 58, '#d9d1c1', { edge: 'rgba(0,0,0,0.15)' });
  }
  box(g, 1.25, 1.25, 2.75, 2.75, 52, 84 + lvl * 2, '#e2dacb');
  pyramid(g, 1.1, 1.1, 2.9, 2.9, 84 + lvl * 2, 34, th.roof);
  pole(g, 2, 2, 118 + lvl * 2, 138 + lvl * 2);
  pennant(g, 2, 2, 138 + lvl * 2, flag, 0, 18, 11);
  tower(3.45, 0.55);
  tower(0.55, 3.45);
  cyl(g, 3.45, 3.45, 0.5, 9, 66 + lvl * 2, '#ddd5c5');
  cone(g, 3.45, 3.45, 0.6, 66 + lvl * 2, 26, th.roof);
  if (lvl >= 3) {
    g.strokeStyle = th.accent;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(...P(0.7, 3.3, 52));
    g.lineTo(...P(3.3, 3.3, 52));
    g.lineTo(...P(3.3, 0.7, 52));
    g.stroke();
  }
};

ART.gmine = (g, s, lvl) => {
  shadowBlob(g, 3, 0.22);
  box(g, 0.1, 0.1, 2.9, 2.9, 0, 3, '#a4825a', { top: '#b29167' });
  // rocky mound with gold veins
  box(g, 0.3, 0.3, 2.7, 2.3, 3, 32, '#8f8b86');
  box(g, 0.65, 0.55, 2.35, 1.95, 32, 50, '#a29e98');
  box(g, 0.95, 0.8, 2.0, 1.6, 50, 60, '#b3afa8');
  for (const [u, z0, z1] of [[0.7, 10, 24], [1.5, 14, 28], [2.1, 8, 20]]) {
    poly(g, [P(2.7, u - 0.1, z0), P(2.7, u + 0.25, z0 + 3), P(2.7, u + 0.2, z1), P(2.7, u - 0.2, z1 - 4)], PAL.gold, PAL.goldDark);
  }
  for (const [u, z0, z1] of [[0.6, 14, 26], [1.4, 8, 20]]) {
    poly(g, [P(u, 2.3, z0), P(u + 0.3, 2.3, z0 + 3), P(u + 0.25, 2.3, z1), P(u - 0.05, 2.3, z1 - 4)], PAL.gold, PAL.goldDark);
  }
  // entrance
  arch(g, 0.95, 2.05, 2.3, 3, 22, '#2b2018');
  box(g, 0.8, 2.3, 1.0, 2.42, 3, 25, PAL.wood, { edge: 'rgba(0,0,0,.25)' });
  box(g, 2.0, 2.3, 2.2, 2.42, 3, 25, PAL.wood, { edge: 'rgba(0,0,0,.25)' });
  box(g, 0.74, 2.3, 2.26, 2.44, 22, 27, PAL.woodLight, { edge: 'rgba(0,0,0,.25)' });
  // cart and gold
  box(g, 2.0, 2.5, 2.8, 2.9, 3, 12, PAL.wood);
  const heap = Math.min(5, 2 + Math.floor(lvl / 2));
  for (let i = 0; i < heap + 2; i++) {
    const [x, y] = P(2.05 + i * 0.13, 2.68, 12 + (i % 2) * 2);
    ell(g, x, y, 5, 3.4, i % 2 ? PAL.gold : '#ffe27a', PAL.goldDark);
  }
  for (const [u, v] of [[0.3, 2.6], [0.6, 2.85], [2.78, 1.1], [2.8, 0.5]]) {
    const [x, y] = P(u, v, 3);
    ell(g, x, y, 4.6, 3, PAL.gold, PAL.goldDark);
  }
  // nuggets on top
  for (const [u, v, z] of [[1.2, 1.0, 60], [1.65, 1.15, 60], [1.4, 1.3, 61], [1.45, 0.95, 62]]) {
    const [x, y] = P(u, v, z);
    ell(g, x, y - 2, 6, 4, PAL.gold, PAL.goldDark);
    ell(g, x - 2, y - 3.5, 2, 1.2, '#fff3b0');
  }
};

ART.cwell = (g, s, lvl) => {
  shadowBlob(g, 3, 0.22);
  box(g, 0.1, 0.1, 2.9, 2.9, 0, 3, '#9aa0a8', { top: '#a9aeb6' });
  cyl(g, 1.5, 1.5, 1.15, 3, 17, '#c3bfb6');
  const [x, y] = P(1.5, 1.5, 17);
  ell(g, x, y, 1.0 * HW * 1.414, 1.0 * HH * 1.414, '#3a62c9');
  ell(g, x, y, 0.8 * HW * 1.414, 0.8 * HH * 1.414, '#5b9bff');
  const n = Math.min(7, 3 + Math.floor(lvl / 1.5));
  const spots = [[1.5, 1.4, 62, 9], [1.0, 1.3, 44, 7], [2.0, 1.55, 48, 7.5], [1.3, 1.9, 34, 6], [1.8, 1.0, 40, 6], [0.95, 1.7, 28, 5], [2.15, 1.1, 30, 5]];
  for (let i = 0; i < n; i++) {
    const [u, v, h, w] = spots[i];
    faceted(g, u, v, 14, w, h - 14, i % 3 === 0 ? PAL.violet : PAL.crystal);
  }
};

ART.vault = (g, s, lvl) => {
  const th = themeOf(Math.min(7, lvl + 1));
  shadowBlob(g, 3, 0.22);
  box(g, 0.15, 0.15, 2.85, 2.85, 0, 8, '#bdb5a5');
  box(g, 0.35, 0.35, 2.65, 2.65, 8, 30, '#dad2c2');
  arch(g, 1.0, 2.0, 2.65, 8, 24, '#4a3a2c');
  for (let i = 0; i < 4; i++) {
    const a = P(1.1 + i * 0.25, 2.65, 8);
    const b = P(1.1 + i * 0.25, 2.65, 24);
    line(g, a, b, 2, PAL.gold);
  }
  g.strokeStyle = th.accent;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(...P(0.35, 2.65, 30));
  g.lineTo(...P(2.65, 2.65, 30));
  g.lineTo(...P(2.65, 0.35, 30));
  g.stroke();
  dome(g, 1.5, 1.5, 1.05, 30, 26 + lvl, PAL.gold);
  const [x, y] = P(1.5, 1.5, 62 + lvl);
  ell(g, x, y, 3.2, 2.2, PAL.goldDark);
  for (const [u, v] of [[0.25, 2.8], [2.85, 2.7], [2.95, 0.7]]) {
    for (let k = 0; k < 3; k++) {
      const [cx, cy] = P(u, v, 3 + k * 3.2);
      ell(g, cx, cy, 5, 3, PAL.gold, PAL.goldDark);
    }
  }
};

ART.tank = (g, s, lvl) => {
  const th = themeOf(Math.min(7, lvl + 1));
  shadowBlob(g, 3, 0.22);
  box(g, 0.2, 0.2, 2.8, 2.8, 0, 7, '#a7acb5');
  cyl(g, 1.5, 1.5, 1.12, 7, 56, '#a8b3d9');
  cyl(g, 1.5, 1.5, 0.92, 12, 52, '#7e63d6', { top: '#9d86f0' });
  for (const z of [16, 30, 44]) {
    const [x, y] = P(1.5, 1.5, z);
    g.strokeStyle = th.accent;
    g.lineWidth = 2.4;
    g.beginPath();
    g.ellipse(x, y, 1.12 * HW * 1.414, 1.12 * HH * 1.414, 0, 0, Math.PI);
    g.stroke();
  }
  // glow highlight
  const [hx, hy] = P(1.5, 1.5, 34);
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.beginPath();
  g.roundRect(hx - 26, hy - 22, 7, 38, 3);
  g.fill();
  dome(g, 1.5, 1.5, 1.0, 56, 12, '#c9d2ea');
  box(g, 2.4, 0.5, 2.7, 0.8, 7, 30, '#8b90a0');
};

ART.camp = (g, s, lvl, team) => {
  const c = team === 'e' ? PAL.teamE : PAL.teamP;
  shadowBlob(g, 4, 0.2);
  box(g, 0.15, 0.15, 3.85, 3.85, 0, 3, '#b59467', { top: '#c2a477' });
  // tents
  const tent = (u, v, w, h) => {
    box(g, u, v, u + w, v + w, 0, 3, '#7b6a52', { edge: null });
    pyramid(g, u - 0.05, v - 0.05, u + w + 0.05, v + w + 0.05, 3, h, '#ece3cf');
    poly(g, [P(u + w * 0.25, v + w + 0.05, 3), P(u + w * 0.75, v + w + 0.05, 3), P(u + w * 0.5, v + w + 0.05, 3 + h * 0.5)], '#4b3a2a');
    const apex = P(u + w / 2, v + w / 2, 3 + h);
    line(g, apex, [apex[0], apex[1] - 14], 2, '#5b3b1f');
    poly(g, [[apex[0], apex[1] - 14], [apex[0] + 11, apex[1] - 10], [apex[0], apex[1] - 6]], c, 'rgba(0,0,0,.25)');
  };
  tent(0.5, 0.5, 1.3, 28);
  tent(2.2, 0.55, 1.2, 24);
  tent(0.45, 2.3, 1.15, 24);
  // fire
  const [fx, fy] = P(2.5, 2.5, 3);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ell(g, fx + Math.cos(a) * 9, fy + Math.sin(a) * 4.5, 4.5, 2.8, '#6a4a2a', '#3d2a17');
  }
  poly(g, [[fx - 6, fy], [fx, fy - 17], [fx + 6, fy]], PAL.fire);
  poly(g, [[fx - 3, fy], [fx, fy - 11], [fx + 3, fy]], '#ffe27a');
  tent(2.6, 2.7, 1.1, 22);
};

ART.barracks = (g, s, lvl, team) => {
  const th = themeOf(Math.min(7, lvl + 1));
  const c = team === 'e' ? PAL.teamE : PAL.teamP;
  shadowBlob(g, 3, 0.22);
  box(g, 0.25, 0.4, 2.75, 2.4, 0, 24, '#b98350');
  g.strokeStyle = 'rgba(70,40,15,0.45)';
  g.lineWidth = 1.6;
  for (let u = 0.5; u < 2.75; u += 0.5) {
    g.beginPath();
    g.moveTo(...P(u, 2.4, 0));
    g.lineTo(...P(u, 2.4, 24));
    g.stroke();
  }
  gable(g, 0.1, 0.25, 2.9, 2.55, 24, 24, th.roof, 'u');
  arch(g, 1.1, 1.9, 2.4, 0, 17, '#43301f');
  // sign
  const [sx, sy] = P(2.45, 2.4, 20);
  poly(g, [[sx - 6, sy - 7], [sx + 6, sy - 7], [sx + 6, sy + 3], [sx, sy + 8], [sx - 6, sy + 3]], c, 'rgba(0,0,0,.35)');
  line(g, [sx - 3, sy - 4], [sx + 3, sy + 2], 1.6, '#f5f5f5');
  line(g, [sx + 3, sy - 4], [sx - 3, sy + 2], 1.6, '#f5f5f5');
  // dummy
  const d = P(2.5, 2.75, 0);
  line(g, d, [d[0], d[1] - 17], 3, '#7b5a35');
  line(g, [d[0] - 7, d[1] - 12], [d[0] + 7, d[1] - 12], 2.4, '#7b5a35');
  ell(g, d[0], d[1] - 20, 4, 4, '#d9b87a', '#7b5a35');
  pole(g, 0.3, 0.45, 24, 52);
  pennant(g, 0.3, 0.45, 52, c, 0, 13, 8);
};

ART.forge = (g, s, lvl) => {
  const th = themeOf(Math.min(7, lvl + 1));
  shadowBlob(g, 3, 0.22);
  box(g, 0.2, 0.3, 2.8, 2.6, 0, 28, '#8f939d');
  gable(g, 0.1, 0.2, 2.9, 2.7, 28, 16, th.roofDark, 'v');
  // chimney
  box(g, 2.0, 0.45, 2.45, 0.9, 28, 66, '#6d717b');
  box(g, 1.95, 0.4, 2.5, 0.95, 66, 71, '#565a64');
  // fire mouth
  const a = P(0.9, 2.6, 0);
  const b = P(1.9, 2.6, 0);
  const grad = g.createLinearGradient(0, a[1] - 20, 0, a[1]);
  grad.addColorStop(0, '#ffdd5a');
  grad.addColorStop(1, '#ff6a1e');
  poly(g, [a, b, [b[0], b[1] - 20], [a[0], a[1] - 20]], grad, '#3a2a1c', 2);
  // anvil
  box(g, 2.2, 2.7, 2.7, 3.1, 0, 7, '#555a66');
  box(g, 2.1, 2.65, 2.85, 3.15, 7, 12, '#6a707d');
  box(g, 0.2, 2.7, 0.7, 3.2, 0, 8, PAL.wood);
};

function baseDefense(g, s, lvl, r, c) {
  const th = themeOf(Math.min(7, lvl + 1));
  shadowBlob(g, s, 0.26);
  box(g, 0.1, 0.1, s - 0.1, s - 0.1, 0, 4, '#a39b8b', { top: '#b3ab9b' });
  cyl(g, s / 2, s / 2, r, 4, 15, c);
  const [x, y] = P(s / 2, s / 2, 15);
  g.strokeStyle = th.accent;
  g.lineWidth = 2.2;
  g.beginPath();
  g.ellipse(x, y, r * HW * 1.414, r * HH * 1.414, 0, 0, Math.PI * 2);
  g.stroke();
}

ART.cannon = (g, s, lvl) => {
  baseDefense(g, 2, lvl, 0.78, '#b9b2a2');
  const [x, y] = P(1, 1, 15);
  ell(g, x, y, 0.5 * HW * 1.414, 0.5 * HH * 1.414, '#7c7568', 'rgba(0,0,0,.25)');
};

ART.ballista = (g, s, lvl) => {
  const th = themeOf(Math.min(7, lvl + 1));
  shadowBlob(g, 2, 0.26);
  box(g, 0.1, 0.1, 1.9, 1.9, 0, 4, '#a39b8b', { top: '#b3ab9b' });
  box(g, 0.3, 0.3, 1.7, 1.7, 4, 12, PAL.wood);
  g.strokeStyle = th.accent;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(...P(0.3, 1.7, 12));
  g.lineTo(...P(1.7, 1.7, 12));
  g.lineTo(...P(1.7, 0.3, 12));
  g.stroke();
  box(g, 0.85, 0.85, 1.15, 1.15, 12, 20, PAL.woodDark);
};

ART.mortar = (g, s, lvl) => {
  baseDefense(g, 3, lvl, 1.05, '#aeb0b8');
  cyl(g, 1.5, 1.5, 0.62, 15, 25, '#4b4f5b', { top: '#2f323b' });
};

ART.bomb = (g) => {
  const [x, y] = P(0.5, 0.5, 1);
  ell(g, x, y + 1, 12, 6.5, 'rgba(0,0,0,0.25)');
  ell(g, x, y, 11, 6, '#4a4f5a', '#23262d', 1.5);
  ell(g, x, y - 1, 6, 3.4, '#c4473f', '#6d211d');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ell(g, x + Math.cos(a) * 11, y + Math.sin(a) * 6, 1.8, 1.2, '#8c919d');
  }
};

ART.scaffold = (g, s) => {
  shadowBlob(g, s, 0.2);
  box(g, 0.1, 0.1, s - 0.1, s - 0.1, 0, 2, '#b59467', { top: '#c6a97c' });
  const w = s - 0.3;
  const posts = [[0.15, 0.15], [w, 0.15], [w, w], [0.15, w]];
  for (const [u, v] of posts) pole(g, u, v, 2, 38, '#80532c');
  for (const z of [16, 32]) {
    g.strokeStyle = '#a77848';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(...P(0.15, w, z));
    g.lineTo(...P(w, w, z));
    g.lineTo(...P(w, 0.15, z));
    g.stroke();
  }
  box(g, s * 0.3, s * 0.35, s * 0.55, s * 0.6, 2, 14, '#9d6e41');
  box(g, s * 0.58, s * 0.5, s * 0.78, s * 0.7, 2, 9, '#b98a55');
};

function wallDraw(g, lvl, mask) {
  const stone = ['#b8b3a8', '#a9a499', '#8e9bb0', '#8e9bb0', '#9a86c4', '#9a86c4', '#d1a931'][Math.min(6, lvl - 1)];
  if (mask & 1) box(g, 0.7, 0.4, 1.3, 0.6, 0, 13, stone, { edge: 'rgba(0,0,0,.2)' });
  if (mask & 2) box(g, 0.4, 0.7, 0.6, 1.3, 0, 13, stone, { edge: 'rgba(0,0,0,.2)' });
  box(g, 0.25, 0.25, 0.75, 0.75, 0, 20, stone, { top: lighten(stone, 0.2) });
  if (lvl >= 3) {
    const [x, y] = P(0.5, 0.5, 20);
    ell(g, x, y, 3, 1.8, lvl >= 7 ? PAL.gold : '#e9eef7');
  }
}

// rubble left behind by a destroyed building
const RUB = (g, s) => {
  let seed = s * 17;
  const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  poly(g, [P(0.18, 0.18), P(s - 0.18, 0.18), P(s - 0.18, s - 0.18), P(0.18, s - 0.18)], 'rgba(60,45,35,0.3)');
  const n = Math.round(s * s * 1.6) + 2;
  for (let i = 0; i < n; i++) {
    const u = 0.25 + r() * (s - 0.5);
    const v = 0.25 + r() * (s - 0.5);
    const w = 0.16 + r() * 0.22;
    const h = 3 + r() * 7;
    box(g, u, v, u + w, v + w, 0, h, i % 3 ? '#8d867b' : '#6e665c', { edge: 'rgba(0,0,0,.25)' });
  }
  for (let i = 0; i < Math.round(s); i++) {
    const [x, y] = P(0.5 + r() * (s - 1), 0.5 + r() * (s - 1), 2);
    ell(g, x, y, 4, 2, 'rgba(20,16,14,0.55)');
  }
};

export function rubbleSprite(size, R = 2) {
  return sprite(`rub|${size}`, size, 24, (g) => RUB(g, size), R);
}

// obstacles
const OB = {};
OB.rock = (g, s) => {
  shadowBlob(g, s, 0.22, 0.2);
  const pts = [[0.25, 0.7], [0.45, 0.2], [1.0, 0.1], [1.6, 0.45], [1.7, 1.1], [1.2, 1.7], [0.5, 1.5]];
  for (let k = 0; k < 2; k++) {
    const sc = k ? 0.6 : 1;
    const z = k ? 18 : 0;
    const top = pts.map(([u, v]) => P(0.95 + (u - 0.95) * sc, 0.95 + (v - 0.95) * sc, 26 - z * 0 + (k ? 10 : 0)));
    const base = pts.map(([u, v]) => P(0.95 + (u - 0.95) * sc, 0.95 + (v - 0.95) * sc, k ? 10 : 0));
    poly(g, base.concat(top.slice().reverse()), k ? '#93908a' : '#85827c', 'rgba(0,0,0,.25)');
    poly(g, top, k ? '#b1aea7' : '#a09d96', 'rgba(0,0,0,.25)');
  }
};
OB.tree = (g, s) => {
  shadowBlob(g, s, 0.22, 0.25);
  box(g, 0.85, 0.85, 1.15, 1.15, 0, 22, '#7a4f2a', { edge: 'rgba(0,0,0,.25)' });
  for (const [u, v, z, r, c] of [[1, 1, 26, 0.85, '#3f9a45'], [0.75, 1.15, 40, 0.65, '#4aab50'], [1.25, 0.85, 44, 0.62, '#57bd5b'], [1, 1, 56, 0.5, '#63cc64']]) {
    const [x, y] = P(u, v, z);
    ell(g, x, y, r * HW * 1.1, r * HW * 0.9, c, 'rgba(0,0,0,.22)');
  }
};
OB.stump = (g) => {
  shadowBlob(g, 1, 0.2, 0.2);
  cyl(g, 0.5, 0.5, 0.28, 0, 8, '#8a5a30', { top: '#d2a468' });
  const [x, y] = P(0.5, 0.5, 8);
  ell(g, x, y, 4, 2.3, null, '#a5764a');
};

// ---------- sprite cache ----------

const cache = new Map();
let cachePx = 0;
const MAX_PX = 12e6;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Returns { canvas, ox, oy, R } where (ox, oy) is where the footprint's top corner sits in the sprite (in unscaled px).
function sprite(key, size, maxH, drawFn, R) {
  let e = cache.get(key);
  if (e) {
    cache.delete(key);
    cache.set(key, e);
    return e;
  }
  const w = Math.ceil(size * TW + PAD * 2);
  const h = Math.ceil(size * TH + maxH + PAD * 2);
  const canvas = makeCanvas(w * R, h * R);
  const g = canvas.getContext('2d');
  g.scale(R, R);
  const ox = size * HW + PAD;
  const oy = maxH + PAD;
  g.translate(ox, oy);
  drawFn(g);
  e = { canvas, ox, oy, R };
  cache.set(key, e);
  cachePx += canvas.width * canvas.height;
  while (cachePx > MAX_PX && cache.size > 4) {
    const [k, v] = cache.entries().next().value;
    cache.delete(k);
    cachePx -= v.canvas.width * v.canvas.height;
  }
  return e;
}

export function buildingSprite(type, lvl, team, size, mask = 0, R = 2) {
  if (type === 'wall') {
    const l = Math.min(7, lvl);
    return sprite(`wall|${l}|${mask}`, 2, MAXH.wall, (g) => { g.translate(-HW * 0, 0); wallDraw(g, l, mask); }, R);
  }
  const key = `${type}|${type === 'bomb' || type === 'scaffold' ? 0 : lvl}|${team}|${size}`;
  const fn = ART[type];
  return sprite(key, size, MAXH[type] || 90, (g) => fn(g, size, lvl, team), R);
}

export function scaffoldSprite(size, R = 2) {
  return sprite(`scaffold|${size}`, size, MAXH.scaffold, (g) => ART.scaffold(g, size), R);
}

export function obstacleSprite(kind, size, R = 2) {
  return sprite(`ob|${kind}`, size, kind === 'tree' ? 80 : 40, (g) => OB[kind](g, size), R);
}

// ---------- dynamic parts (drawn each frame in local space, g already translated to the footprint's top corner) ----------

export const localP = P;

export function drawTurret(g, b, t, recoil = 0) {
  const s = b.size;
  const c = s / 2;
  const a = b.ang || 0;
  const du = Math.cos(a);
  const dv = Math.sin(a);
  const th = themeOf(Math.min(7, b.lvl + 1));
  if (b.type === 'cannon') {
    const len = 0.95 - recoil * 0.2;
    const p0 = P(c - du * 0.2, c - dv * 0.2, 19);
    const p1 = P(c + du * len, c + dv * len, 19);
    line(g, p0, p1, 11, '#2c3038');
    line(g, p0, p1, 7, '#4b505c');
    const ring = P(c + du * (len - 0.12), c + dv * (len - 0.12), 19);
    ell(g, ring[0], ring[1], 4.2, 4.2, th.accent);
    const cap = P(c, c, 19);
    ell(g, cap[0], cap[1], 6, 4, '#6a707d', '#2c3038');
  } else if (b.type === 'ballista') {
    const pv = P(c, c, 21);
    const ext = 0.85 - recoil * 0.15;
    const front = P(c + du * ext, c + dv * ext, 21);
    const back = P(c - du * 0.45, c - dv * 0.45, 21);
    line(g, back, front, 4, PAL.woodDark);
    const bw = 0.95;
    const l = P(c + du * ext * 0.7 - dv * bw, c + dv * ext * 0.7 + du * bw, 21);
    const r = P(c + du * ext * 0.7 + dv * bw, c + dv * ext * 0.7 - du * bw, 21);
    g.strokeStyle = '#3b2814';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(l[0], l[1]);
    g.quadraticCurveTo(front[0] + (front[0] - pv[0]) * 0.25, front[1] + (front[1] - pv[1]) * 0.25 - 2, r[0], r[1]);
    g.stroke();
    line(g, l, r, 1, '#e8e2d2');
    const tip = P(c + du * (ext + 0.3), c + dv * (ext + 0.3), 21);
    line(g, pv, tip, 2.4, '#d8d0bd');
    ell(g, tip[0], tip[1], 2.6, 2, th.accent);
  } else if (b.type === 'mortar') {
    const p0 = P(c, c, 22);
    const p1 = P(c + du * 0.32, c + dv * 0.32, 44 - recoil * 6);
    line(g, p0, p1, 16, '#252830');
    line(g, p0, p1, 11, '#42464f');
    ell(g, p1[0], p1[1], 7, 4.4, '#15171c');
  }
}

// ---------- troops (screen space) ----------

const TEAM = { squire: '#3d7be0', slinger: '#3aa86a', sapper: '#e08a2b', brute: '#8b5a3a', glider: '#6fc7e8' };

// x, y: screen position of the feet. s: scale. face: -1 left, 1 right.
export function drawTroop(g, troop, x, y, s, t, o = {}) {
  const face = o.face || 1;
  const moving = o.moving;
  const bob = moving ? Math.abs(Math.sin(t * 9 + (o.seed || 0))) * 2.2 * s : 0;
  const swing = o.swing || 0;
  const col = o.color || TEAM[troop];
  g.save();
  g.translate(x, y);
  if (troop === 'glider') {
    const alt = (14 + Math.sin(t * 3 + (o.seed || 0)) * 2) * s;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(0, 1 * s, 8 * s, 3.4 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.translate(0, -alt);
    g.scale(face * s, s);
    const flap = Math.sin(t * 12 + (o.seed || 0)) * 3;
    g.fillStyle = '#e9f7ff';
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-1, -2);
    g.quadraticCurveTo(-13, -10 - flap, -17, -3 + flap * 0.5);
    g.quadraticCurveTo(-9, -1, -1, 2);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(1, -2);
    g.quadraticCurveTo(13, -10 + flap, 17, -3 - flap * 0.5);
    g.quadraticCurveTo(9, -1, 1, 2);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(0, 1, 4.4, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = PAL.skin;
    g.beginPath();
    g.arc(0, -6, 3.6, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#2d4a7a';
    g.beginPath();
    g.arc(0, -7, 3.7, Math.PI, 0);
    g.fill();
    g.restore();
    return;
  }
  const big = troop === 'brute';
  const sc = (big ? 1.55 : 1) * s;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(0, 0, 6.5 * sc, 2.8 * sc, 0, 0, Math.PI * 2);
  g.fill();
  g.translate(0, -bob);
  g.scale(face * sc, sc);
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(0,0,0,0.38)';
  // legs
  const step = moving ? Math.sin(t * 9 + (o.seed || 0)) * 2.4 : 0;
  g.fillStyle = '#4a3a2c';
  g.fillRect(-3.4 + step * 0.4, -3, 2.6, 3.4);
  g.fillRect(0.8 - step * 0.4, -3, 2.6, 3.4);
  // body
  g.fillStyle = col;
  g.beginPath();
  g.roundRect(-4.6, -12.5, 9.2, 10.5, 3);
  g.fill();
  g.stroke();
  // head
  g.fillStyle = PAL.skin;
  g.beginPath();
  g.arc(0, -15.4, 3.9, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (troop === 'squire') {
    g.fillStyle = '#b5bcc7';
    g.beginPath();
    g.arc(0, -16, 4.1, Math.PI, 0);
    g.fill();
    g.stroke();
    g.fillStyle = '#d8453f';
    g.fillRect(-0.7, -21.6, 1.4, 3);
    const a = -0.9 + swing * 1.8;
    g.strokeStyle = '#e9edf3';
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(4, -8);
    g.lineTo(4 + Math.cos(a) * 9, -8 + Math.sin(a) * 9);
    g.stroke();
    g.fillStyle = '#c4c9d2';
    g.beginPath();
    g.arc(-4.4, -8, 3.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.38)';
    g.lineWidth = 1;
    g.stroke();
  } else if (troop === 'slinger') {
    g.fillStyle = '#2f8a57';
    g.beginPath();
    g.arc(0, -15.6, 4.3, Math.PI * 0.95, Math.PI * 2.05);
    g.lineTo(3, -12);
    g.lineTo(-3, -12);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = '#6b4a2a';
    g.lineWidth = 1.4;
    const a = swing * 6;
    g.beginPath();
    g.moveTo(3.4, -8);
    g.quadraticCurveTo(8 + a, -14, 5 + a, -2);
    g.stroke();
    g.fillStyle = '#a79f90';
    g.beginPath();
    g.arc(6 + a, -9, 1.6, 0, Math.PI * 2);
    g.fill();
  } else if (troop === 'sapper') {
    g.fillStyle = '#3a2f26';
    g.beginPath();
    g.arc(0, -16.2, 4.2, Math.PI, 0);
    g.fill();
    g.stroke();
    // keg on the back
    g.fillStyle = '#7b5a35';
    g.beginPath();
    g.roundRect(-9, -13, 6.5, 8.5, 2);
    g.fill();
    g.stroke();
    g.strokeStyle = '#d6c08a';
    g.beginPath();
    g.moveTo(-9, -10);
    g.lineTo(-2.5, -10);
    g.stroke();
    const sp = 1.2 + Math.sin(t * 25 + (o.seed || 0)) * 0.8;
    g.fillStyle = '#ffd24a';
    g.beginPath();
    g.arc(-5.5, -15.5, sp, 0, Math.PI * 2);
    g.fill();
  } else if (troop === 'brute') {
    g.fillStyle = '#c98a5a';
    g.beginPath();
    g.roundRect(-5.4, -13, 10.8, 11.5, 3);
    g.fill();
    g.stroke();
    g.fillStyle = '#4a2d1a';
    g.beginPath();
    g.arc(0, -16.4, 4.4, Math.PI, 0);
    g.fill();
    g.stroke();
    g.fillStyle = '#d6c08a';
    g.beginPath();
    g.moveTo(-3, -19);
    g.lineTo(-5.5, -22);
    g.lineTo(-1.5, -20.5);
    g.moveTo(3, -19);
    g.lineTo(5.5, -22);
    g.lineTo(1.5, -20.5);
    g.fill();
    const a = -1.1 + swing * 2.2;
    g.strokeStyle = '#5d3b1f';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(5, -8);
    g.lineTo(5 + Math.cos(a) * 10, -8 + Math.sin(a) * 10);
    g.stroke();
    g.fillStyle = '#7a5a3a';
    g.beginPath();
    g.arc(5 + Math.cos(a) * 11, -8 + Math.sin(a) * 11, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// ---------- small icons for the UI ----------

export function buildingIcon(type, lvl, size = 72) {
  const d = size;
  const c = makeCanvas(d * 2, d * 2);
  const g = c.getContext('2d');
  const sz = { keep: 4, gmine: 3, cwell: 3, vault: 3, tank: 3, camp: 4, barracks: 3, forge: 3, cannon: 2, ballista: 2, mortar: 3, bomb: 1, wall: 1 }[type] || 2;
  const sp = type === 'wall' ? buildingSprite('wall', lvl, 'p', 1, 3, 2) : buildingSprite(type, lvl, 'p', sz, 0, 2);
  const w = sp.canvas.width;
  const h = sp.canvas.height;
  // crop to content bounds so the icon fills the tile (measured on a quarter-size copy, cheap to read back)
  const q = 4;
  const probe = document.createElement('canvas');
  probe.width = Math.ceil(w / q);
  probe.height = Math.ceil(h / q);
  const pg = probe.getContext('2d', { willReadFrequently: true });
  pg.drawImage(sp.canvas, 0, 0, probe.width, probe.height);
  const tmp = pg.getImageData(0, 0, probe.width, probe.height).data;
  let x0 = probe.width, y0 = probe.height, x1 = 0, y1 = 0;
  for (let y = 0; y < probe.height; y++) {
    for (let x = 0; x < probe.width; x++) {
      if (tmp[(y * probe.width + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  x0 = Math.max(0, x0 * q - 2);
  y0 = Math.max(0, y0 * q - 2);
  x1 = Math.min(w, (x1 + 1) * q + 2);
  y1 = Math.min(h, (y1 + 1) * q + 2);
  if (x1 <= x0 || y1 <= y0) return c;
  const cw = x1 - x0;
  const ch = y1 - y0;
  const k = Math.min((d * 2 * 0.9) / cw, (d * 2 * 0.9) / ch);
  g.drawImage(sp.canvas, x0, y0, cw, ch, (d * 2 - cw * k) / 2, (d * 2 - ch * k) / 2 + 2, cw * k, ch * k);
  return c;
}

export function troopIcon(troop, size = 64) {
  const c = makeCanvas(size * 2, size * 2);
  const g = c.getContext('2d');
  const s = troop === 'brute' ? 2.5 : 3.3;
  drawTroop(g, troop, size, troop === 'glider' ? size * 1.5 : size * 1.62, s * (size / 64), 0.4, { face: 1 });
  return c;
}

export function obstacleIcon(kind, size = 64) {
  const c = makeCanvas(size * 2, size * 2);
  const g = c.getContext('2d');
  const sz = kind === 'stump' ? 1 : 2;
  const sp = obstacleSprite(kind, sz, 2);
  const k = Math.min((size * 2) / sp.canvas.width, (size * 2) / sp.canvas.height);
  g.drawImage(sp.canvas, (size * 2 - sp.canvas.width * k) / 2, (size * 2 - sp.canvas.height * k) / 2, sp.canvas.width * k, sp.canvas.height * k);
  return c;
}
