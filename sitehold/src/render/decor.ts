import * as THREE from 'three';
import type { MapData } from '../sim/map.ts';
import { CELL, COLS, ROWS } from '../sim/map.ts';

function hash(n: number) { const s = Math.sin(n * 12.9898 + 4.1) * 43758.5453; return s - Math.floor(s); }

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const windowTex = () => canvasTex(128, 192, (g) => {
  g.clearRect(0, 0, 128, 192);
  // frame
  g.fillStyle = '#b79a68';
  g.beginPath(); g.moveTo(8, 190); g.lineTo(8, 70); g.quadraticCurveTo(64, -30, 120, 70); g.lineTo(120, 190); g.closePath(); g.fill();
  // opening
  const grad = g.createLinearGradient(0, 20, 0, 190);
  grad.addColorStop(0, '#1b2230'); grad.addColorStop(1, '#0c0f16');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(22, 184); g.lineTo(22, 74); g.quadraticCurveTo(64, -12, 106, 74); g.lineTo(106, 184); g.closePath(); g.fill();
  // shutters / bars
  g.strokeStyle = '#6b5636'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(64, 20); g.lineTo(64, 184); g.moveTo(22, 110); g.lineTo(106, 110); g.stroke();
  // sill
  g.fillStyle = '#9d8458'; g.fillRect(2, 184, 124, 8);
});

const bannerTex = (color: string, accent: string, emblem: 'shield' | 'chevron') => canvasTex(128, 256, (g) => {
  g.fillStyle = color; g.fillRect(0, 0, 128, 256);
  g.fillStyle = accent; g.fillRect(0, 0, 128, 14); g.fillRect(0, 232, 128, 24);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  if (emblem === 'shield') {
    g.beginPath(); g.moveTo(64, 50); g.lineTo(104, 66); g.lineTo(100, 130); g.quadraticCurveTo(64, 175, 64, 175); g.quadraticCurveTo(64, 175, 28, 130); g.lineTo(24, 66); g.closePath(); g.fill();
    g.fillStyle = color; g.fillRect(58, 76, 12, 54); g.fillRect(40, 94, 48, 12);
  } else {
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(24, 70 + i * 36); g.lineTo(64, 40 + i * 36); g.lineTo(104, 70 + i * 36); g.lineTo(104, 92 + i * 36); g.lineTo(64, 62 + i * 36); g.lineTo(24, 92 + i * 36); g.closePath(); g.fill(); }
  }
});

const letterTex = (letter: string) => canvasTex(256, 256, (g) => {
  g.clearRect(0, 0, 256, 256);
  g.font = 'bold 230px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 16; g.strokeStyle = 'rgba(30,22,12,0.85)'; g.strokeText(letter, 128, 140);
  g.fillStyle = '#f2c14e'; g.fillText(letter, 128, 140);
});

/** Purely visual extras: barrels, windows, banners and site letters. Nothing here collides. */
export function buildDecor(map: MapData): THREE.Group {
  const group = new THREE.Group();

  // ---- barrels as instanced meshes (solid collision boxes for them are in the map)
  const n = map.props.length;
  if (n) {
    const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 1, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.25 }), n);
    const ring = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.355, 0.355, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.5 }), n * 2);
    const lid = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.5, metalness: 0.4 }), n);
    const m4 = new THREE.Matrix4();
    const cols = [0xa8452c, 0x3f6a8c, 0x4d7a48, 0xb08a2e, 0x8a8f94];
    map.props.forEach((p, i) => {
      m4.compose(new THREE.Vector3(p.x, p.h / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.h, 1));
      body.setMatrixAt(i, m4);
      body.setColorAt(i, new THREE.Color(cols[Math.floor(hash(i * 3.3) * cols.length)]));
      m4.compose(new THREE.Vector3(p.x, p.h * 0.18, p.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); ring.setMatrixAt(i * 2, m4);
      m4.compose(new THREE.Vector3(p.x, p.h * 0.82, p.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); ring.setMatrixAt(i * 2 + 1, m4);
      m4.compose(new THREE.Vector3(p.x, p.h + 0.005, p.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); lid.setMatrixAt(i, m4);
    });
    for (const m of [body, ring, lid]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  }

  // ---- windows on wall faces that look onto open floor
  const winTex = windowTex();
  const winMat = new THREE.MeshStandardMaterial({ map: winTex, transparent: true, alphaTest: 0.4, roughness: 0.9 });
  const winGeo = new THREE.PlaneGeometry(1.0, 1.5);
  const wins: THREE.Matrix4[] = [];
  const g = map.grid;
  const open = (c: number, r: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS && g[r][c] === '.';
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (g[r][c] !== '#') continue;
      const faces: Array<[number, number, number, number, number]> = [
        [0, 1, 0, 1, 0],       // faces south: neighbour (c, r+1)
        [0, -1, 0, -1, Math.PI], // faces north
        [1, 0, 1, 0, Math.PI / 2], // faces east
        [-1, 0, -1, 0, -Math.PI / 2],
      ];
      faces.forEach(([dc, dr, nx, nz, rot], k) => {
        if (!open(c + dc, r + dr)) return;
        if (hash(c * 17 + r * 31 + k * 7) > 0.1) return;
        const cx = (c + 0.5) * CELL + nx * (CELL / 2 + 0.015), cz = (r + 0.5) * CELL + nz * (CELL / 2 + 0.015);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, 2.3, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(1, 1, 1));
        wins.push(m);
      });
    }
  }
  if (wins.length) {
    const im = new THREE.InstancedMesh(winGeo, winMat, wins.length);
    wins.forEach((m, i) => im.setMatrixAt(i, m));
    im.receiveShadow = true;
    group.add(im);
  }

  // ---- team banners in the spawns
  const bannerGeo = new THREE.PlaneGeometry(1.2, 2.6);
  const sentMat = new THREE.MeshStandardMaterial({ map: bannerTex('#27508a', '#5cc8ff', 'shield'), roughness: 0.9, side: THREE.DoubleSide });
  const breMat = new THREE.MeshStandardMaterial({ map: bannerTex('#8a3f1f', '#ff9440', 'chevron'), roughness: 0.9, side: THREE.DoubleSide });
  for (const x of [38, 48, 58]) {
    const a = new THREE.Mesh(bannerGeo, sentMat); a.position.set(x, 3.0, 2.03); group.add(a);
    const b = new THREE.Mesh(bannerGeo, breMat); b.position.set(x, 3.0, 73.97); b.rotation.y = Math.PI; group.add(b);
  }

  // ---- site letters on the walls
  const sign = (letter: string, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.MeshBasicMaterial({ map: letterTex(letter), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true }));
    m.position.set(x, 3.0, z); m.rotation.y = ry; group.add(m);
  };
  sign('A', 93.97, 14, -Math.PI / 2); sign('A', 83, 2.03, 0);
  sign('B', 2.03, 14, Math.PI / 2); sign('B', 13, 2.03, 0);

  return group;
}
