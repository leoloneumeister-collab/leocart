/** Three.js renderer: scene setup, unit views, projectiles and event driven effects. */
import * as THREE from 'three';
import { CHAMPIONS } from '../data/champions.ts';
import { MINIONS } from '../data/units.ts';
import type { MinionType, SimEvent, Team, Unit } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { angleLerp, TAU } from '../sim/math.ts';
import { CameraRig } from './camera.ts';
import { Decals, Particles } from './fx.ts';
import { Vfx } from './vfx.ts';
import type { ProjVisual } from './vfx.ts';
import { G, lambert, teamColor } from './geo.ts';
import { buildStructure } from './structures.ts';
import { Crowd } from './crowd.ts';
import { buildMinionModel, buildMonsterModel } from './minions.ts';
import { ChampionView } from './championView.ts';
import type { StructureRig } from './structures.ts';
import { buildTerrain } from './terrain.ts';
import { RenderPipeline, setupLighting } from './pipeline.ts';
import type { Quality } from './pipeline.ts';
import { tickMaterials } from './materials.ts';
import { FogOfWar } from './fog.ts';

export type { Quality } from './pipeline.ts';

const FIXED_DT = 1 / 30;

interface CrowdAnim {
  atk: number;
  phase: number;
  key: string;
  x: number;
  z: number;
  yaw: number;
  move: number;
}

const ATK_DUR = 0.5;
const DEATH_DUR = 0.9;

class StructureView {
  rig: StructureRig;
  deadT = 0;
  constructor(u: Unit, hook: (m: THREE.Material) => void) {
    const kind = u.kind === 'tower' ? 'tower' : u.kind === 'inhibitor' ? 'inhibitor' : 'nexus';
    this.rig = buildStructure(kind, u.team, u.radius, u.height, hook);
    this.rig.root.position.set(u.x, 0, u.z);
    this.deadT = u.alive ? 0 : 5;
  }
}

interface ProjView {
  vis: ProjVisual;
  born: number;
  trail: number;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

const PROJ_COLORS: Record<string, number> = {};

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig = new CameraRig();
  readonly particles: Particles;
  readonly decals = new Decals();
  readonly fog = new FogOfWar();
  readonly canvas: HTMLCanvasElement;
  private sun: THREE.DirectionalLight;
  private pipeline!: RenderPipeline;
  private champViews = new Map<number, ChampionView>();
  private structViews = new Map<number, StructureView>();
  private crowd!: Crowd;
  private minionAnim = new Map<number, CrowdAnim>();
  private dying: { key: string; x: number; z: number; yaw: number; phase: number; t: number }[] = [];
  private projViews = new Map<number, ProjView>();
  private towerRings = new Map<number, THREE.Mesh>();
  readonly vfx: Vfx;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpV = new THREE.Vector3();
  private time = 0;
  private viewerTeam: Team = 0;
  private playerId = 0;
  quality: Quality = 'medium';
  width = 1;
  height = 1;

  constructor(container: HTMLElement, quality: Quality) {
    this.quality = quality;
    const renderer = new THREE.WebGLRenderer({ antialias: quality === 'low', powerPreference: 'high-performance' });
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5));
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    container.appendChild(this.canvas);
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 600);
    this.scene.background = new THREE.Color(0x0d100e);
    this.scene.fog = new THREE.Fog(0x0d100e, 140, 330);

    const lights = setupLighting(this.scene, renderer, quality);
    this.sun = lights.sun;

    this.scene.add(buildTerrain((m) => this.fog.patch(m), quality));
    this.crowd = new Crowd(this.scene, (m) => this.fog.patch(m), quality);
    this.scene.add(this.decals.group);
    this.particles = new Particles(this.camera);
    this.scene.add(this.particles.mesh);
    this.vfx = new Vfx(this.camera);
    this.scene.add(this.vfx.group);
    this.resize();
    this.pipeline = new RenderPipeline(renderer, this.scene, this.camera, quality, this.width, this.height);
  }

  resize() {
    const w = this.canvas.parentElement?.clientWidth || window.innerWidth;
    const h = this.canvas.parentElement?.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline?.setSize(w, h);
  }

  setViewer(team: Team, playerId: number) {
    this.viewerTeam = team;
    this.playerId = playerId;
  }

  // ------------------------------------------------------------------ picking

  private setRay(sx: number, sy: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((sx - rect.left) / rect.width) * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  groundAt(sx: number, sy: number): { x: number; z: number } | null {
    this.setRay(sx, sy);
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.tmpV);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  /** Nearest visible unit under the cursor, using view-space sphere tests. */
  pickUnit(sx: number, sy: number, w: World, filter: (u: Unit) => boolean): Unit | null {
    this.setRay(sx, sy);
    const ray = this.raycaster.ray;
    let best: Unit | null = null;
    let bestD = Infinity;
    const c = new THREE.Vector3();
    for (const u of w.units) {
      if (!u.alive || !filter(u) || !this.isVisible(w, u)) continue;
      const rad = Math.max(u.radius * 1.15, 1.3) + (u.kind === 'champion' ? 0.4 : 0);
      c.set(u.x, u.height * 0.45, u.z);
      const dist = ray.distanceToPoint(c);
      if (dist <= rad) {
        const along = c.clone().sub(ray.origin).dot(ray.direction);
        // prefer champions and closer ones
        const score = along - (u.kind === 'champion' ? 6 : 0);
        if (score < bestD) {
          bestD = score;
          best = u;
        }
      }
    }
    return best;
  }

  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    this.tmpV.set(x, y, z).project(this.camera);
    return { x: (this.tmpV.x * 0.5 + 0.5) * this.width, y: (-this.tmpV.y * 0.5 + 0.5) * this.height, visible: this.tmpV.z < 1 && this.tmpV.z > -1 };
  }

  isVisible(w: World, u: Unit): boolean {
    if (u.team === this.viewerTeam || u.struct) return true;
    return w.visible[this.viewerTeam].has(u.id);
  }

  // ------------------------------------------------------------------ views

  private crowdKey(u: Unit): string {
    return u.kind === 'minion' ? `minion:${u.minion!.type}:${u.team}` : `monster:${u.name}`;
  }

  private ensureModel(key: string, u: Unit) {
    if (this.crowd.has(key)) return;
    if (u.kind === 'minion') this.crowd.register(key, buildMinionModel(u.minion!.type, u.team), 260);
    else this.crowd.register(key, buildMonsterModel(u.name), 40);
  }

  sync(w: World, alpha: number, dt: number) {
    this.time += dt;
    const t = this.time;
    const viewer = w.get(this.playerId) ?? w.champions.find((c) => c.team === this.viewerTeam);
    // Champions
    for (const u of w.champions) {
      let v = this.champViews.get(u.id);
      if (!v) {
        v = new ChampionView(u, u.id === this.playerId);
        this.champViews.set(u.id, v);
        this.scene.add(v.group);
      }
      this.updateChampion(v, u, w, alpha, dt, t);
    }
    // Structures
    for (const s of w.structures) {
      let v = this.structViews.get(s.id);
      if (!v) {
        v = new StructureView(s, (m) => this.fog.patch(m));
        this.structViews.set(s.id, v);
        this.scene.add(v.rig.root);
      }
      this.updateStructure(v, s, dt, t);
    }
    // Minions and monsters: one animated instance each
    this.crowd.begin();
    for (const u of w.units) {
      if (!u.alive || (u.kind !== 'minion' && u.kind !== 'monster')) continue;
      if (!this.isVisible(w, u)) continue;
      const key = this.crowdKey(u);
      this.ensureModel(key, u);
      let anim = this.minionAnim.get(u.id);
      if (!anim) {
        anim = { atk: 0, phase: u.id * 0.7, key, x: u.x, z: u.z, yaw: u.facing, move: 0 };
        this.minionAnim.set(u.id, anim);
      }
      anim.atk = Math.max(0, anim.atk - dt);
      const moving = u.moved > 0.001;
      anim.move += ((moving ? 1 : 0) - anim.move) * Math.min(1, dt * 10);
      if (moving) anim.phase += dt * (u.kind === 'monster' ? 8 : 11);
      const x = u.px + (u.x - u.px) * alpha;
      const z = u.pz + (u.z - u.pz) * alpha;
      anim.x = x;
      anim.z = z;
      anim.yaw = u.facing;
      const at = anim.atk > 0 ? 1 - anim.atk / ATK_DUR : 0;
      this.crowd.push(key, x, 0, z, u.facing, anim.phase, anim.move, at, 0);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      if (d.t > DEATH_DUR) {
        this.dying.splice(i, 1);
        continue;
      }
      this.crowd.push(d.key, d.x, 0, d.z, d.yaw, d.phase, 0, 0, d.t);
    }
    this.crowd.end();
    // Projectiles
    const live = new Set<number>();
    for (const p of w.projectiles) {
      live.add(p.id);
      let pv = this.projViews.get(p.id);
      const x = p.px + (p.x - p.px) * alpha;
      const z = p.pz + (p.z - p.pz) * alpha;
      const spell = p.visual.startsWith('spell:');
      const y = spell ? 2.4 : p.visual === 'tower' ? 8 : 2.6;
      if (!pv) {
        const vis = this.vfx.projectile(p.visual, this.projColor(p.visual), p.radius);
        pv = { vis, born: this.time, trail: 0 };
        vis.group.position.set(x, y, z);
        this.scene.add(vis.group);
        for (const r of vis.ribbons) {
          r.reset(vis.group.position);
          this.scene.add(r.mesh);
        }
        this.projViews.set(p.id, pv);
      }
      const g = pv.vis.group;
      g.position.set(x, y, z);
      if (p.vx !== 0 || p.vz !== 0) g.rotation.y = Math.atan2(p.vx, p.vz);
      pv.vis.tick?.(this.time - pv.born);
      for (const r of pv.vis.ribbons) r.update(g.position, dt, this.camera);
      pv.trail -= dt;
      if (pv.trail <= 0) {
        pv.trail = spell ? 0.03 : 0.06;
        this.particles.emit(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6, this.projColor(p.visual), { life: 0.45, size: spell ? 0.9 : 0.4, vy: 0.6 });
      }
    }
    for (const [id, pv] of this.projViews) {
      if (!live.has(id)) {
        this.scene.remove(pv.vis.group);
        disposeTree(pv.vis.group);
        for (const r of pv.vis.ribbons) {
          this.scene.remove(r.mesh);
          disposeTree(r.mesh);
        }
        this.projViews.delete(id);
      }
    }
    if (this.minionAnim.size > 400) {
      const alive = new Set(w.units.filter((u) => u.kind === 'minion').map((u) => u.id));
      for (const id of this.minionAnim.keys()) if (!alive.has(id)) this.minionAnim.delete(id);
    }
    // Enemy tower range rings appear when the player gets close, so dives are a choice
    for (const s of w.structures) {
      if (s.kind !== 'tower' || s.team === this.viewerTeam) continue;
      const show = !!viewer && viewer.alive && s.alive && Math.hypot(viewer.x - s.x, viewer.z - s.z) < s.s.range + 24;
      let ring = this.towerRings.get(s.id);
      if (show && !ring) {
        ring = this.decals.persistent(0xff4a3a, 'ring');
        ring.position.set(s.x, 0.13, s.z);
        ring.scale.set((s.s.range + 0.5) * 2, (s.s.range + 0.5) * 2, 1);
        this.towerRings.set(s.id, ring);
      } else if (!show && ring) {
        this.decals.drop(ring);
        this.towerRings.delete(s.id);
      }
      if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(t * 3) * 0.08;
    }
    // Statuses
    for (const u of w.champions) {
      if (!u.alive || !this.isVisible(w, u)) continue;
      if (u.order.t === 'recall' && Math.random() < dt * 22) {
        const a = Math.random() * TAU;
        this.particles.emit(u.x + Math.cos(a) * 1.8, 0.3, u.z + Math.sin(a) * 1.8, 0x7ac8ff, { vy: 4, life: 0.8, size: 0.7 });
      }
      for (const s of u.statuses) {
        if (s.type === 'stun' && s.until > w.time && Math.random() < dt * 14) {
          const a = Math.random() * TAU;
          this.particles.emit(u.x + Math.cos(a) * 0.9, u.height + 0.6, u.z + Math.sin(a) * 0.9, 0xffe060, { life: 0.4, size: 0.5 });
        } else if (s.type === 'slow' && s.until > w.time && Math.random() < dt * 6) {
          this.particles.emit(u.x + (Math.random() - 0.5) * 1.5, 0.4, u.z + (Math.random() - 0.5) * 1.5, 0x80c8ff, { life: 0.5, size: 0.6, vy: 0.8 });
        } else if (s.type === 'shield' && s.until > w.time && Math.random() < dt * 5) {
          this.particles.emit(u.x + (Math.random() - 0.5) * 2, 0.5 + Math.random() * u.height * 0.8, u.z + (Math.random() - 0.5) * 2, 0xe8f4ff, { life: 0.4, size: 0.4 });
        }
      }
    }
    this.fog.update(w, this.viewerTeam, dt);
    this.particles.update(dt);
    this.decals.update(dt);
    this.vfx.update(dt, t);
    void FIXED_DT;
  }

  private projColor(visual: string): number {
    let c = PROJ_COLORS[visual];
    if (c !== undefined) return c;
    c = 0xffffff;
    if (visual === 'tower') c = 0xffb060;
    else if (visual === 'attack') c = 0xffe9a0;
    else if (visual.startsWith('champ:')) {
      const def = CHAMPIONS[visual.split(':')[1]];
      c = def ? def.look.accent : 0xffffff;
    } else if (visual.startsWith('spell:')) {
      const [, id, slot] = visual.split(':');
      const def = CHAMPIONS[id];
      c = def ? def.abilities[Number(slot)].color : 0xffffff;
    }
    PROJ_COLORS[visual] = c;
    return c;
  }

  private updateChampion(v: ChampionView, u: Unit, w: World, alpha: number, dt: number, t: number) {
    v.update(u, w, alpha, dt, t, this.isVisible(w, u));
  }

  private updateStructure(v: StructureView, s: Unit, dt: number, t: number) {
    const wasAlive = v.deadT <= 0;
    if (s.alive && !wasAlive) {
      v.deadT = 0;
      this.particles.burst(s.x, 3, s.z, teamColor(s.team), 60, 14, 1.2, 1.4);
    } else if (!s.alive) {
      if (wasAlive) {
        const big = s.kind === 'nexus' ? 3 : 1.4;
        this.particles.burst(s.x, 3, s.z, 0xffa860, Math.floor(60 * big), 16 * big, 1.2, 1.8);
        this.particles.burst(s.x, 2, s.z, 0x9a9a9a, Math.floor(40 * big), 8 * big, 1.8, 2.6, -1);
        this.rig.shake(s.kind === 'nexus' ? 2.6 : 1.1, 0.5);
      }
      v.deadT += dt;
    }
    const vulnerable = s.struct ? this.vulnerableCache.get(s.id) !== false : true;
    v.rig.update(dt, t, { vulnerable, hpFrac: s.hp / s.s.maxHp, deadT: s.alive ? 0 : Math.max(v.deadT, 0.001) });
    if (!s.alive) return;
    if (s.hp / s.s.maxHp < 0.3 && Math.random() < dt * 7) {
      this.particles.emit(s.x + (Math.random() - 0.5) * 3, s.height * 0.8, s.z + (Math.random() - 0.5) * 3, 0x707070, { vy: 3, life: 1.2, size: 1.8, grow: 2 });
    }
  }

  vulnerableCache = new Map<number, boolean>();

  /** Called with the current world each frame so structure glow can reflect protection. */
  updateProtection(w: World) {
    for (const s of w.structures) this.vulnerableCache.set(s.id, w.structureVulnerable(s));
  }

  // ------------------------------------------------------------------ events

  handleEvents(events: SimEvent[], w: World) {
    for (const ev of events) {
      switch (ev.t) {
        case 'attack': {
          const a = w.get(ev.id);
          if (!a) break;
          const cv = this.champViews.get(ev.id);
          cv?.onAttack();
          const ma = this.minionAnim.get(ev.id);
          if (ma) ma.atk = ATK_DUR;
          if (a.kind === 'tower') {
            const tv = this.structViews.get(a.id);
            if (tv) this.particles.burst(a.x, a.height * 0.75, a.z, teamColor(a.team), 6, 6, 0.3, 1);
          }
          break;
        }
        case 'cast': {
          const cv = this.champViews.get(ev.id);
          cv?.onCast(ev.slot);
          const def = CHAMPIONS[ev.champ];
          if (def) {
            const col = def.abilities[ev.slot].color;
            this.decals.flash(ev.x, ev.z, 3.2, col, 0.4);
            this.particles.burst(ev.x, 2.5, ev.z, col, 10, 7, 0.5, 0.8);
            this.vfx.shockwave(ev.x, ev.z, 0.8, ev.slot === 3 ? 6 : 3.4, col, ev.slot === 3 ? 0.6 : 0.4);
            if (ev.slot === 3) this.vfx.pillar(ev.x, ev.z, 1.6, 9, col, 0.9);
          }
          break;
        }
        case 'damage': {
          const color = ev.dmgType === 'magic' ? 0xb090ff : ev.dmgType === 'true' ? 0xffffff : 0xffe0a0;
          const u = w.get(ev.id);
          this.champViews.get(ev.id)?.onHurt();
          const h = u ? u.height * 0.6 : 2;
          this.particles.burst(ev.x, h, ev.z, color, ev.amount > 150 ? 12 : 5, ev.amount > 150 ? 9 : 5, 0.35, 0.55);
          break;
        }
        case 'death': {
          const col = ev.team === 0 ? 0x5aa8ff : ev.team === 1 ? 0xff6a6a : 0xc8b050;
          if (ev.kind === 'minion' || ev.kind === 'monster') {
            this.particles.burst(ev.x, 1.2, ev.z, col, 14, 6, 0.6, 0.9, 6);
            this.particles.burst(ev.x, 1.2, ev.z, 0x888888, 8, 3, 0.8, 1.2);
          } else if (ev.kind === 'champion') {
            this.particles.burst(ev.x, 2.5, ev.z, col, 50, 12, 1.1, 1.2, 4);
            this.particles.burst(ev.x, 2.5, ev.z, 0xffffff, 20, 8, 0.8, 0.9);
            this.decals.flash(ev.x, ev.z, 7, col, 0.6);
            this.vfx.shockwave(ev.x, ev.z, 1, 7, col, 0.6);
            this.vfx.pillar(ev.x, ev.z, 1.4, 8, col, 0.8);
            this.rig.shake(0.7, 0.25);
          }
          {
            const ma = this.minionAnim.get(ev.id);
            if (ma && (ev.kind === 'minion' || ev.kind === 'monster') && this.dying.length < 80) this.dying.push({ key: ma.key, x: ma.x, z: ma.z, yaw: ma.yaw, phase: ma.phase, t: 0 });
          }
          this.minionAnim.delete(ev.id);
          break;
        }
        case 'respawn': {
          const u = w.get(ev.id);
          if (u) {
            this.particles.burst(u.x, 1, u.z, 0x9ad8ff, 40, 8, 1, 1.2);
            for (let i = 0; i < 24; i++) this.particles.emit(u.x + (Math.random() - 0.5) * 2, Math.random() * 3, u.z + (Math.random() - 0.5) * 2, 0x9ad8ff, { vy: 7, life: 0.9, size: 0.9 });
            this.decals.flash(u.x, u.z, 6, 0x9ad8ff, 0.7);
            this.vfx.pillar(u.x, u.z, 2.2, 14, 0x9ad8ff, 1.2);
            this.vfx.shockwave(u.x, u.z, 1, 7, 0xbfe8ff, 0.8);
          }
          break;
        }
        case 'levelUp': {
          const u = w.get(ev.id);
          if (u) {
            this.decals.flash(u.x, u.z, 6, 0xffd860, 0.8);
            this.vfx.pillar(u.x, u.z, 1.7, 10, 0xffd860, 1.1);
            this.vfx.shockwave(u.x, u.z, 1, 6, 0xffe9a0, 0.7);
            for (let i = 0; i < 26; i++) {
              const a = Math.random() * TAU;
              this.particles.emit(u.x + Math.cos(a) * 1.8, 0.2, u.z + Math.sin(a) * 1.8, 0xffd860, { vy: 6 + Math.random() * 3, life: 1, size: 0.8 });
            }
          }
          break;
        }
        case 'heal': {
          for (let i = 0; i < 3; i++) this.particles.emit(ev.x + (Math.random() - 0.5) * 1.5, 1 + Math.random() * 2, ev.z + (Math.random() - 0.5) * 1.5, 0x6aff9a, { vy: 3, life: 0.7, size: 0.6 });
          break;
        }
        case 'zone': {
          const def = this.visualColor(ev.visual);
          this.decals.telegraph(ev.x, ev.z, ev.radius, def, ev.delay);
          break;
        }
        case 'zoneHit': {
          const c = this.visualColor(ev.visual);
          this.decals.flash(ev.x, ev.z, ev.radius, c, 0.45);
          this.particles.burst(ev.x, 1, ev.z, c, 30, ev.radius * 2.2, 0.7, 1.3);
          this.vfx.shockwave(ev.x, ev.z, ev.radius * 0.25, ev.radius * 1.05, c, 0.55);
          this.vfx.shockwave(ev.x, ev.z, ev.radius * 0.1, ev.radius * 0.7, 0xffffff, 0.35, 1.6);
          this.vfx.pillar(ev.x, ev.z, Math.max(1.2, ev.radius * 0.45), 4 + ev.radius * 0.8, c, 0.7);
          if (ev.radius > 7) this.rig.shake(0.9, 0.3);
          break;
        }
        case 'dash': {
          const n = 14;
          for (let i = 0; i < n; i++) {
            const k = i / n;
            this.particles.emit(ev.fx + (ev.tx - ev.fx) * k, 1.5, ev.fz + (ev.tz - ev.fz) * k, 0xffffff, { life: 0.4, size: 1.2 });
          }
          const du = w.get(ev.id);
          const dcol = du && du.kind === 'champion' ? CHAMPIONS[du.defId].look.accent : 0xffffff;
          this.vfx.streak(ev.fx, ev.fz, ev.tx, ev.tz, 2.6, dcol, 0.45);
          this.vfx.shockwave(ev.tx, ev.tz, 0.6, 4.2, dcol, 0.4);
          break;
        }
        case 'blink': {
          this.particles.burst(ev.fx, 2, ev.fz, 0xc690ff, 24, 8, 0.6, 1);
          this.particles.burst(ev.tx, 2, ev.tz, 0xc690ff, 24, 8, 0.6, 1);
          this.decals.flash(ev.tx, ev.tz, 4, 0xc690ff, 0.4);
          this.vfx.pillar(ev.fx, ev.fz, 1.6, 7, 0xc690ff, 0.6);
          this.vfx.pillar(ev.tx, ev.tz, 1.6, 7, 0xc690ff, 0.7);
          this.vfx.shockwave(ev.tx, ev.tz, 0.6, 4.5, 0xe0c0ff, 0.5);
          break;
        }
        case 'recallDone': {
          const u = w.get(ev.id);
          if (u) this.particles.burst(u.x, 2, u.z, 0x7ac8ff, 40, 9, 1, 1.2);
          break;
        }
        case 'structureDown':
          break;
        case 'inhibRespawn':
          break;
        default:
          break;
      }
    }
  }

  private visualColor(visual: string): number {
    return this.projColor(visual);
  }

  clickMarker(x: number, z: number, color = 0x7affb0) {
    this.decals.marker(x, z, color);
  }

  // ------------------------------------------------------------------ frame

  render(dt: number, followX: number, followZ: number) {
    this.rig.apply(this.camera, dt);
    this.sun.target.position.set(followX, 0, followZ);
    this.sun.position.set(followX - 40, 80, followZ + 35);
    tickMaterials(this.time);
    this.pipeline.render(dt);
  }

  dispose() {
    this.renderer.dispose();
    this.canvas.remove();
  }

  /** Minion stats are looked up for health bar sizing. */
  static minionRadius(type: MinionType): number {
    return MINIONS[type].radius;
  }
}

export { G };
