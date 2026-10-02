/** Geometry helpers for building smooth, stylised character parts. All meshes are indexed with normals. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];

const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();

function keepPosNormal(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position'));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  out.setAttribute('normal', g.getAttribute('normal'));
  if (g.index) out.setIndex(g.index);
  return out;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const g = p.index ? p : p.clone();
    return keepPosNormal(g);
  });
  const indexed = clean.map((g) => (g.index ? g : (() => { const c = g.clone(); c.setIndex([...Array(g.getAttribute('position').count).keys()]); return c; })()));
  return mergeGeometries(indexed, false)!;
}

/** Orient a +Y aligned geometry so its axis runs from a to b, starting at a. */
export function between(g: THREE.BufferGeometry, a: V3, b: V3): THREE.BufferGeometry {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  tmpQ.setFromUnitVectors(UP, dir.clone().normalize());
  tmpM.compose(new THREE.Vector3(a[0], a[1], a[2]), tmpQ, new THREE.Vector3(1, 1, 1));
  const out = g.clone();
  out.applyMatrix4(tmpM);
  return out;
}

/** Tapered limb with rounded ends from a to b. */
export function limb(a: V3, b: V3, r0: number, r1: number, seg = 12): THREE.BufferGeometry {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const cyl = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  cyl.translate(0, len / 2, 0);
  const s0 = new THREE.SphereGeometry(r0, seg, Math.max(6, seg >> 1));
  const s1 = new THREE.SphereGeometry(r1, seg, Math.max(6, seg >> 1));
  s1.translate(0, len, 0);
  return between(merge([cyl, s0, s1]), a, b);
}

/** Cylinder-like tapered segment without caps (for armour bands, sleeves). */
export function band(a: V3, b: V3, r0: number, r1: number, seg = 14, capped = true): THREE.BufferGeometry {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const cyl = new THREE.CylinderGeometry(r1, r0, len, seg, 1, !capped);
  cyl.translate(0, len / 2, 0);
  return between(cyl, a, b);
}

export function sphere(r: number, sx = 1, sy = 1, sz = 1, seg = 16): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1));
  g.scale(sx, sy, sz);
  return g;
}

/** Rounded box with bevel radius. */
export function plate(w: number, h: number, d: number, r = 0.06, seg = 3): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
}

/** Smooth spike (cone with soft base). */
export function spike(r: number, h: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(0, h / 2, 0);
  return g;
}

/** Lathe from [radius, y] pairs, closed at both poles. */
export function lathe(points: [number, number][], seg = 18): THREE.BufferGeometry {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** Tube along a curve with tapering radius. */
export function taperTube(points: V3[], r0: number, r1: number, radial = 8, segs = 18, cap = true): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r;
      pos.push(p.x + N.x * c + B.x * s, p.y + N.y * c + B.y * s, p.z + N.z * c + B.z * s);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (cap && r1 > 0.001) {
    const tip = curve.getPointAt(1);
    const s = new THREE.SphereGeometry(r1, radial, 6);
    s.translate(tip.x, tip.y, tip.z);
    g = merge([g, s]);
  }
  return g;
}

/** Flat extruded outline (blades, feathers, leaves) in the XY plane, thickness along Z, bevelled. */
export function extrudeShape(points: [number, number][], thick = 0.06, bevel = 0.02): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -thick / 2);
  g.computeVertexNormals();
  return g;
}

/** Curved blade profile along +Y: base at y=0, tip at y=len. `curve` bends the tip toward +X. */
export function blade(len: number, width: number, thick = 0.07, curve = 0.0, edge = 0.5): THREE.BufferGeometry {
  const pts: [number, number][] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = width * (1 - Math.pow(t, 1.8) * (1 - 0.0)) * (t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1);
    pts.push([curve * t * t * len + w * edge, t * len]);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const w = width * (1 - Math.pow(t, 1.8)) * (t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1);
    pts.push([curve * t * t * len - w * (1 - edge), t * len]);
  }
  return extrudeShape(pts, thick, thick * 0.3);
}

export function torus(r: number, tube: number, seg = 20, arc = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r, tube, 8, seg, arc);
}

export function gem(r: number, sy = 1.5): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(r, 1);
  g.scale(1, sy, 1);
  g.computeVertexNormals();
  return g;
}

export function cone(r: number, h: number, seg = 12): THREE.BufferGeometry {
  return new THREE.ConeGeometry(r, h, seg, 1);
}

export function cyl(rt: number, rb: number, h: number, seg = 14): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rt, rb, h, seg);
}

export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

export function icosa(r: number, d = 1): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(r, d);
}
