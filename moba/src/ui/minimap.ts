/** Minimap: static map image plus live unit dots. Left click moves the camera, right click moves the champion. */
import { CHAMPIONS } from '../data/champions.ts';
import { MAP_HALF } from '../data/map.ts';
import { paintMap } from '../render/terrain.ts';
import type { Painter } from '../render/terrain.ts';
import type { Team, Unit } from '../sim/types.ts';
import type { World } from '../sim/world.ts';

export const MINIMAP_SIZE = 210;

export class Minimap {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private p: Painter;
  private dpr = 1;
  /** Remove window listeners. */
  dispose: () => void = () => undefined;

  constructor(parent: HTMLElement, onCamera: (x: number, z: number) => void, onMove: (x: number, z: number) => void) {
    this.root = document.createElement('div');
    this.root.className = 'minimap';
    parent.appendChild(this.root);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas = document.createElement('canvas');
    this.canvas.width = MINIMAP_SIZE * this.dpr;
    this.canvas.height = MINIMAP_SIZE * this.dpr;
    this.canvas.style.width = MINIMAP_SIZE + 'px';
    this.canvas.style.height = MINIMAP_SIZE + 'px';
    this.root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.base.width = MINIMAP_SIZE * this.dpr;
    this.base.height = MINIMAP_SIZE * this.dpr;
    this.p = paintMap(this.base.getContext('2d')!, MINIMAP_SIZE * this.dpr, false);
    const toWorld = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * MINIMAP_SIZE * this.dpr;
      const pz = ((e.clientY - rect.top) / rect.height) * MINIMAP_SIZE * this.dpr;
      return { x: px / this.p.scale - MAP_HALF - 14, z: pz / this.p.scale - MAP_HALF - 14 };
    };
    let dragging = false;
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const w = toWorld(e);
      if (e.button === 2) onMove(w.x, w.z);
      else {
        dragging = true;
        onCamera(w.x, w.z);
      }
    });
    const winMove = (e: MouseEvent) => {
      if (dragging) {
        const w = toWorld(e);
        onCamera(w.x, w.z);
      }
    };
    const onUp = () => (dragging = false);
    window.addEventListener('mousemove', winMove);
    window.addEventListener('mouseup', onUp);
    this.dispose = () => {
      window.removeEventListener('mousemove', winMove);
      window.removeEventListener('mouseup', onUp);
    };
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  draw(w: World, viewerTeam: Team, playerId: number, camX: number, camZ: number, viewW: number, viewH: number, isVisible: (u: Unit) => boolean) {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const k = this.p.scale / d;
    const X = (x: number) => this.p.tx(x) / d;
    const Z = (z: number) => this.p.tz(z) / d;
    void k;
    // Structures
    for (const s of w.structures) {
      if (!s.alive) continue;
      const col = s.team === 0 ? '#58b0ff' : '#ff5a5a';
      const sz = s.kind === 'nexus' ? 9 : s.kind === 'inhibitor' ? 6 : 5;
      ctx.fillStyle = col;
      ctx.strokeStyle = '#08101a';
      ctx.lineWidth = 1;
      if (s.kind === 'tower') {
        ctx.fillRect(X(s.x) - sz / 2, Z(s.z) - sz / 2, sz, sz);
        ctx.strokeRect(X(s.x) - sz / 2, Z(s.z) - sz / 2, sz, sz);
      } else {
        ctx.beginPath();
        ctx.moveTo(X(s.x), Z(s.z) - sz);
        ctx.lineTo(X(s.x) + sz, Z(s.z));
        ctx.lineTo(X(s.x), Z(s.z) + sz);
        ctx.lineTo(X(s.x) - sz, Z(s.z));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    for (const u of w.units) {
      if (!u.alive || u.kind === 'champion' || u.struct) continue;
      if (!isVisible(u)) continue;
      ctx.fillStyle = u.team === 2 ? '#d8c050' : u.team === viewerTeam ? '#7cc8ff' : '#ff8080';
      const s = u.kind === 'monster' ? 3 : u.minion && (u.minion.type === 'super' || u.minion.type === 'cannon') ? 3.2 : 2.2;
      ctx.beginPath();
      ctx.arc(X(u.x), Z(u.z), s, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of w.champions) {
      if (!c.alive || !isVisible(c)) continue;
      const ally = c.team === viewerTeam;
      const def = CHAMPIONS[c.defId];
      ctx.beginPath();
      ctx.arc(X(c.x), Z(c.z), 6.2, 0, Math.PI * 2);
      ctx.fillStyle = '#' + def.look.primary.toString(16).padStart(6, '0');
      ctx.fill();
      ctx.lineWidth = c.id === playerId ? 2.4 : 1.8;
      ctx.strokeStyle = c.id === playerId ? '#ffffff' : ally ? '#46a8ff' : '#ff4646';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '700 8px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.name[0], X(c.x), Z(c.z) + 0.5);
    }
    // Camera view box (approximate)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.4;
    const hw = (viewW / 2) * this.p.scale / d;
    const hh = (viewH / 2) * this.p.scale / d;
    ctx.strokeRect(X(camX) - hw, Z(camZ) - hh, hw * 2, hh * 2);
  }
}
