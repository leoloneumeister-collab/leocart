/** 2D overlay canvas: health bars, floating damage numbers and small labels. */
import { CHAMPIONS } from '../data/champions.ts';
import type { GameRenderer } from '../render/scene.ts';
import type { Team, Unit } from '../sim/types.ts';
import type { World } from '../sim/world.ts';

interface Floater {
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
  t: number;
  life: number;
  size: number;
  vx: number;
}

export class Overlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private floaters: Floater[] = [];
  private dpr = 1;
  private trail = new Map<number, number>();

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'overlay';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.parentElement!.clientWidth;
    const h = this.canvas.parentElement!.clientHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  float(text: string, x: number, y: number, z: number, color: string, size = 16, life = 0.9) {
    if (this.floaters.length > 90) this.floaters.shift();
    this.floaters.push({ text, color, x: x + (Math.random() - 0.5) * 1.2, y, z, t: 0, life, size, vx: (Math.random() - 0.5) * 1.2 });
  }

  draw(w: World, r: GameRenderer, viewerTeam: Team, playerId: number, dt: number, hover: Unit | null) {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const player = w.get(playerId);
    if (this.trail.size > 400) for (const id of [...this.trail.keys()]) if (!w.get(id)) this.trail.delete(id);
    for (const u of w.units) {
      if (!u.alive) continue;
      if (!r.isVisible(w, u)) continue;
      if (u.kind === 'inhibitor' || u.kind === 'nexus' || u.kind === 'tower') {
        if (u.hp >= u.s.maxHp && hover !== u) {
          // Only draw structure bars when damaged or hovered, or near the player.
          if (!player || Math.hypot(player.x - u.x, player.z - u.z) > 38) continue;
        }
      }
      this.drawBar(u, r, viewerTeam, w, dt, u === hover, u.id === playerId);
    }
    this.drawFloaters(r, dt);
  }

  private drawBar(u: Unit, r: GameRenderer, viewerTeam: Team, w: World, dt: number, hovered: boolean, isPlayer: boolean) {
    const yWorld = u.height + (u.kind === 'champion' ? 1.4 : 0.9);
    const p = r.project(u.x, yWorld, u.z);
    if (!p.visible || p.x < -80 || p.x > r.width + 80 || p.y < -40 || p.y > r.height + 40) return;
    const ctx = this.ctx;
    let bw: number;
    let bh: number;
    switch (u.kind) {
      case 'champion':
        bw = 84;
        bh = 9;
        break;
      case 'minion':
        bw = u.minion!.type === 'super' || u.minion!.type === 'cannon' ? 52 : 38;
        bh = 5;
        break;
      case 'monster':
        bw = u.monster && u.monster.gold > 60 ? 70 : 42;
        bh = 6;
        break;
      case 'nexus':
        bw = 150;
        bh = 11;
        break;
      default:
        bw = 96;
        bh = 8;
    }
    const x = Math.round(p.x - bw / 2);
    const y = Math.round(p.y - bh / 2);
    const frac = Math.max(0, u.hp / u.s.maxHp);
    // Delayed damage trail
    let tr = this.trail.get(u.id) ?? frac;
    tr = tr > frac ? Math.max(frac, tr - dt * 0.7) : frac;
    this.trail.set(u.id, tr);
    const ally = u.team === viewerTeam;
    const fill = u.team === 2 ? '#e0c04a' : ally ? (isPlayer ? '#47e07a' : '#3fa9ff') : '#ff4b4b';
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x, y, bw * tr, bh);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, bw * frac, bh);
    // Shield
    let shield = 0;
    for (const s of u.statuses) if (s.type === 'shield' && s.until > w.time) shield += s.amount;
    if (shield > 0) {
      const sf = Math.min(1 - frac, shield / u.s.maxHp);
      ctx.fillStyle = 'rgba(235,245,255,0.95)';
      ctx.fillRect(x + bw * frac, y, bw * Math.max(sf, 0.04), bh);
    }
    if (u.kind === 'champion' || u.kind === 'tower' || u.kind === 'nexus') {
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      const seg = u.kind === 'champion' ? 250 : 500;
      for (let hp = seg; hp < u.s.maxHp; hp += seg) {
        const sx = x + (hp / u.s.maxHp) * bw;
        ctx.beginPath();
        ctx.moveTo(sx, y);
        ctx.lineTo(sx, y + bh);
        ctx.stroke();
      }
    }
    if (u.kind === 'champion') {
      const c = u.champ!;
      // Mana
      if (ally) {
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fillRect(x - 1, y + bh + 1, bw + 2, 5);
        ctx.fillStyle = '#4c7dff';
        ctx.fillRect(x, y + bh + 2, bw * Math.max(0, u.mana / Math.max(1, u.s.maxMana)), 3);
      }
      // Level badge
      ctx.fillStyle = 'rgba(8,10,16,0.92)';
      ctx.beginPath();
      ctx.arc(x - 11, y + bh / 2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = fill;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillText(String(c.level), x - 11, y + bh / 2 + 0.5);
      // Name
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillText(CHAMPIONS[u.defId].name, p.x + 1, y - 9);
      ctx.fillStyle = ally ? '#d6ecff' : '#ffd0d0';
      ctx.fillText(CHAMPIONS[u.defId].name, p.x, y - 10);
    } else if (hovered && u.kind !== 'minion') {
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(u.name, p.x, y - 10);
    }
  }

  private drawFloaters(r: GameRenderer, dt: number) {
    const ctx = this.ctx;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t >= f.life) {
        this.floaters.splice(i, 1);
        continue;
      }
      const k = f.t / f.life;
      const p = r.project(f.x + f.vx * f.t, f.y + k * 3.4, f.z);
      if (!p.visible) continue;
      const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const pop = k < 0.12 ? 1 + (0.12 - k) * 4 : 1;
      ctx.globalAlpha = a;
      ctx.font = `800 ${Math.round(f.size * pop)}px system-ui, sans-serif`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(f.text, p.x, p.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }
}
