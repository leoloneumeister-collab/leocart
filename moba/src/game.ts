/** Game controller: owns the simulation, renderer, HUD and input, and runs the frame loop. */
import type * as THREE from 'three';
import { CHAMPIONS } from './data/champions.ts';
import { CONFIG } from './data/config.ts';
import { AudioEngine } from './audio/audio.ts';
import { Input } from './input.ts';
import { GameRenderer } from './render/scene.ts';
import { createMatch, stepWorld } from './sim/match.ts';
import type { Team, Unit, SimEvent } from './sim/types.ts';
import type { World } from './sim/world.ts';
import { abilityDef } from './sim/abilities.ts';
import { canBuy } from './sim/economy.ts';
import { Hud } from './ui/hud.ts';
import { Minimap } from './ui/minimap.ts';
import { Overlay } from './ui/overlay.ts';
import { EndScreen, PauseScreen } from './ui/screens.ts';
import type { MenuChoice } from './ui/screens.ts';
import { Shop } from './ui/shop.ts';
import { hideTip } from './ui/dom.ts';

const STEP = 1 / CONFIG.tickRate;
const SPEEDS = [1, 2, 4, 8];

export interface GameOptions {
  slice?: boolean;
}

export class Game {
  readonly world: World;
  readonly renderer: GameRenderer;
  readonly audio: AudioEngine;
  private overlay: Overlay;
  private hud: Hud;
  private minimap: Minimap;
  private shop: Shop;
  private pause: PauseScreen;
  private input: Input;
  private parent: HTMLElement;
  private gameEl: HTMLElement;
  private playerId: number;
  private team: Team = 0;
  private acc = 0;
  private lastT = 0;
  private raf = 0;
  private speedIdx = 0;
  private paused = false;
  private ended = false;
  private scoreboardOn = false;
  private attackMoveMode = false;
  private previewSlot = -1;
  private previewRing: THREE.Mesh | null = null;
  private previewLine: THREE.Mesh | null = null;
  private destroyed = false;
  private frameCount = 0;
  private fps = 60;
  private fpsSmooth = 60;
  private hover: Unit | null = null;
  private onExit: () => void;
  private choice: MenuChoice;
  private endShown = false;
  /** Main-thread time per frame part, in ms, averaged since the last read (see window.__game.perf()). */
  private perfAcc = { sim: 0, sync: 0, ui: 0, render: 0, frames: 0 };
  private endTimer = 0;

  constructor(parent: HTMLElement, choice: MenuChoice, audio: AudioEngine, onExit: () => void, opts: GameOptions = {}) {
    this.parent = parent;
    this.audio = audio;
    this.onExit = onExit;
    this.choice = choice;
    this.world = createMatch({
      seed: (Math.random() * 1e9) | 0,
      playerChampion: choice.champion,
      playerLane: choice.lane,
      difficulty: choice.difficulty,
      fog: choice.fog,
      midOnly: opts.slice,
      blueChampions: opts.slice ? [choice.champion] : undefined,
      redChampions: opts.slice ? [] : undefined,
    });
    this.playerId = this.world.playerId;

    this.gameEl = document.createElement('div');
    this.gameEl.id = 'game';
    parent.appendChild(this.gameEl);
    this.renderer = new GameRenderer(this.gameEl, choice.quality);
    this.renderer.setViewer(this.team, this.playerId);
    this.renderer.fog.setEnabled(choice.fog);
    this.overlay = new Overlay(parent);
    this.hud = new Hud(parent, {
      levelUp: (slot) => this.cmd({ type: 'levelUp', slot }),
      recall: () => this.cmd({ type: 'recall' }),
      openShop: () => this.toggleShop(),
      sell: (i) => this.cmd({ type: 'sell', index: i }),
    });
    this.shop = new Shop(
      parent,
      (id) => this.buy(id),
      (i) => this.cmd({ type: 'sell', index: i }),
    );
    this.minimap = new Minimap(
      parent,
      (x, z) => this.renderer.rig.setTarget(x, z),
      (x, z) => this.moveTo(x, z),
    );
    this.pause = new PauseScreen(
      parent,
      () => this.setPaused(false),
      () => this.exit(),
      audio.getVolume(),
      (v) => audio.setVolume(v),
    );
    this.input = new Input(this.gameEl, {
      onKeyDown: (k, e) => this.onKeyDown(k, e),
      onKeyUp: (k) => this.onKeyUp(k),
      onMouseDown: (b, x, y) => this.onMouseDown(b, x, y),
      onMouseUp: () => undefined,
      onWheel: (dy) => this.renderer.rig.zoom(dy),
    });
    const p = this.player;
    this.hud.build(p);
    this.hud.show(true);
    this.renderer.rig.setTarget(p.x + 6, p.z - 6);
    this.cmd({ type: 'levelUp', slot: 0 });
    this.audio.init();
    this.audio.startMusic();
    this.hud.showMessage('Right click to move. Q W E R cast abilities. You have 500 gold: press P to shop in your base. Y unlocks the camera.', 9);
    window.addEventListener('resize', this.onResize);
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Average main-thread ms per frame since the last call (sim, scene sync, UI, render submit). */
  perf() {
    const a = this.perfAcc;
    const n = Math.max(1, a.frames);
    const out = { sim: a.sim / n, sync: a.sync / n, ui: a.ui / n, render: a.render / n, frames: a.frames };
    this.perfAcc = { sim: 0, sync: 0, ui: 0, render: 0, frames: 0 };
    return out;
  }

  get player(): Unit {
    return this.world.get(this.playerId)!;
  }

  // ----------------------------------------------------------------- commands

  private cmd(c: Omit<Parameters<World['push']>[0], 'unit'>) {
    this.world.push({ ...c, unit: this.playerId });
  }

  private moveTo(x: number, z: number) {
    if (!this.player.alive) return;
    this.cmd({ type: 'move', x, z });
    this.renderer.clickMarker(x, z);
  }

  private buy(id: string) {
    const chk = canBuy(this.player, id);
    if (!chk.ok) {
      this.audio.error();
      this.hud.showMessage(chk.reason === 'gold' ? 'Not enough gold' : chk.reason === 'full' ? 'Inventory full' : chk.reason === 'boots' ? 'You already own boots' : 'You can only shop in your base');
      return;
    }
    this.cmd({ type: 'buy', item: id });
  }

  private toggleShop() {
    this.audio.click();
    if (!this.player.champ!.inShop) {
      this.hud.showMessage('You can only shop in your base');
      return;
    }
    this.shop.toggle(this.player);
  }

  private setPaused(on: boolean) {
    this.paused = on;
    this.pause.show(on);
    this.input.enabled = !on || true;
    if (on) hideTip();
  }

  exit() {
    this.destroy();
    this.onExit();
  }

  // ----------------------------------------------------------------- input

  private targetFilter = (u: Unit): boolean => u.team !== this.team && this.world.canBeTargeted(this.player, u);

  private onMouseDown(button: number, x: number, y: number) {
    if (this.paused || this.ended) return;
    this.audio.init();
    const p = this.player;
    if (button === 2) {
      this.attackMoveMode = false;
      if (!p.alive) return;
      const target = this.renderer.pickUnit(x, y, this.world, this.targetFilter);
      if (target) {
        this.cmd({ type: 'attack', target: target.id });
        this.renderer.clickMarker(target.x, target.z, 0xff5050);
        return;
      }
      const g = this.renderer.groundAt(x, y);
      if (g) this.moveTo(g.x, g.z);
    } else if (button === 0) {
      if (this.attackMoveMode) {
        this.attackMoveMode = false;
        const g = this.renderer.groundAt(x, y);
        if (g && p.alive) {
          this.cmd({ type: 'attackMove', x: g.x, z: g.z });
          this.renderer.clickMarker(g.x, g.z, 0xff9a40);
        }
      }
    }
  }

  private castKey(slot: number) {
    const p = this.player;
    if (!p.alive) return;
    const def = abilityDef(p, slot);
    const g = this.renderer.groundAt(this.input.mx, this.input.my);
    if (!g) return;
    let target = 0;
    const unit = this.renderer.pickUnit(this.input.mx, this.input.my, this.world, this.targetFilter);
    if (unit) target = unit.id;
    void def;
    const before = p.mana;
    this.cmd({ type: 'cast', slot, x: g.x, z: g.z, target });
    void before;
  }

  private onKeyDown(key: string, e: KeyboardEvent) {
    this.audio.init();
    if (key === 'Escape') {
      if (this.shop.isOpen) this.shop.close();
      else if (this.attackMoveMode) this.attackMoveMode = false;
      else if (!this.ended) this.setPaused(!this.paused);
      return;
    }
    if (this.paused || this.ended) return;
    const slotIdx = ['q', 'w', 'e', 'r'].indexOf(key);
    if (slotIdx >= 0) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.cmd({ type: 'levelUp', slot: slotIdx });
        this.audio.click();
      } else {
        this.previewSlot = slotIdx;
        this.castKey(slotIdx);
      }
      return;
    }
    switch (key) {
      case 'a':
        this.attackMoveMode = true;
        break;
      case 's':
        this.cmd({ type: 'stop' });
        break;
      case 'b':
        this.cmd({ type: 'recall' });
        break;
      case 'p':
        this.toggleShop();
        break;
      case 'Tab':
        this.scoreboardOn = true;
        break;
      case 'y':
        this.renderer.rig.locked = !this.renderer.rig.locked;
        this.hud.showMessage(this.renderer.rig.locked ? 'Camera locked' : 'Camera unlocked');
        break;
      case ']':
        this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
        break;
      case '=':
      case '+':
        this.renderer.rig.zoom(-200);
        break;
      case '-':
        this.renderer.rig.zoom(200);
        break;
      default:
        break;
    }
  }

  private onKeyUp(key: string) {
    if (key === 'Tab') this.scoreboardOn = false;
    const slotIdx = ['q', 'w', 'e', 'r'].indexOf(key);
    if (slotIdx >= 0 && this.previewSlot === slotIdx) this.previewSlot = -1;
  }

  private onResize = () => {
    this.renderer.resize();
    this.overlay.resize();
  };

  // ----------------------------------------------------------------- frame

  private frame = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dtReal = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.frameCount++;
    this.fpsSmooth += (1 / Math.max(0.001, dtReal) - this.fpsSmooth) * 0.05;
    this.fps = this.fpsSmooth;

    const w = this.world;
    const events: SimEvent[] = [];
    const t0 = performance.now();
    if (!this.paused) {
      this.acc += dtReal * SPEEDS[this.speedIdx];
      let steps = 0;
      while (this.acc >= STEP && steps < 24) {
        stepWorld(w);
        for (const e of w.drainEvents()) events.push(e);
        this.acc -= STEP;
        steps++;
      }
      if (steps >= 24) this.acc = 0;
    }
    const t1 = performance.now();
    const alpha = Math.min(1, this.acc / STEP);
    const p = this.player;

    this.updateCamera(dtReal, p);
    this.renderer.sync(w, alpha, dtReal);
    if (this.frameCount % 6 === 0) this.renderer.updateProtection(w);
    this.handleEvents(events);
    this.updatePreview(p);
    const t2 = performance.now();

    this.hover = this.paused ? null : this.renderer.pickUnit(this.input.mx, this.input.my, w, (u) => u.team !== this.team || u.kind === 'champion');
    this.gameEl.style.cursor = this.attackMoveMode ? 'crosshair' : this.hover && this.targetFilter(this.hover) ? 'crosshair' : 'default';
    this.gameEl.classList.toggle('dead', !p.alive);
    this.hud.update(w, p, dtReal, this.fps, SPEEDS[this.speedIdx], this.scoreboardOn);
    this.shop.update(p);
    this.overlay.draw(w, this.renderer, this.team, this.playerId, dtReal, this.hover);
    const rig = this.renderer.rig;
    this.minimap.draw(w, this.team, this.playerId, rig.x, rig.z, rig.dist * 0.83 * this.renderer.camera.aspect, rig.dist * 0.83, (u) => this.renderer.isVisible(w, u));
    this.audio.setListener(rig.x, rig.z);
    this.audio.update(dtReal);
    const t3 = performance.now();
    this.renderer.render(dtReal, rig.x, rig.z);
    const t4 = performance.now();
    const pa = this.perfAcc;
    pa.sim += t1 - t0;
    pa.sync += t2 - t1;
    pa.ui += t3 - t2;
    pa.render += t4 - t3;
    pa.frames++;

    if (w.winner !== -1 && !this.endShown) {
      this.ended = true;
      this.endTimer += dtReal;
      if (this.endTimer > 2.2) {
        this.endShown = true;
        new EndScreen(this.parent, w, this.team, () => this.exit());
      }
    }
  };

  private updateCamera(dt: number, p: Unit) {
    const rig = this.renderer.rig;
    if (this.input.down(' ') || rig.locked) {
      if (p.alive || rig.locked) rig.setTarget(p.x, p.z);
    } else if (this.input.pointerSeen && this.input.inside && !this.paused) {
      const edge = 14;
      const speed = 62 * (rig.dist / 50);
      let dx = 0;
      let dz = 0;
      if (this.input.mx <= edge) dx -= 1;
      if (this.input.mx >= this.renderer.width - edge) dx += 1;
      if (this.input.my <= edge) dz -= 1;
      if (this.input.my >= this.renderer.height - edge) dz += 1;
      if (dx || dz) rig.pan(dx * speed * dt, dz * speed * dt);
    }
    if (!this.paused) {
      const speed = 62 * (rig.dist / 50);
      let dx = 0;
      let dz = 0;
      if (this.input.down('ArrowLeft')) dx -= 1;
      if (this.input.down('ArrowRight')) dx += 1;
      if (this.input.down('ArrowUp')) dz -= 1;
      if (this.input.down('ArrowDown')) dz += 1;
      if (dx || dz) rig.pan(dx * speed * dt, dz * speed * dt);
    }
  }

  private updatePreview(p: Unit) {
    const decals = this.renderer.decals;
    if (this.previewSlot < 0 || !p.alive) {
      if (this.previewRing) {
        decals.drop(this.previewRing);
        this.previewRing = null;
      }
      if (this.previewLine) {
        decals.drop(this.previewLine);
        this.previewLine = null;
      }
      return;
    }
    const def = abilityDef(p, this.previewSlot);
    const color = def.color;
    if (!this.previewRing) this.previewRing = decals.persistent(color, 'ring');
    if (def.range > 0) {
      this.previewRing.visible = true;
      this.previewRing.position.set(p.x, 0.16, p.z);
      this.previewRing.scale.set(def.range * 2, def.range * 2, 1);
      (this.previewRing.material as THREE.MeshBasicMaterial).opacity = 0.5;
    } else {
      this.previewRing.visible = false;
    }
    const g = this.renderer.groundAt(this.input.mx, this.input.my);
    if (!this.previewLine) this.previewLine = decals.persistent(color, 'disc');
    if (g) {
      const rad = def.kind === 'ground' ? def.radius ?? 5 : def.kind === 'nova' ? def.radius ?? 5 : def.kind === 'skillshot' ? (def.width ?? 1.2) : 2;
      this.previewLine.visible = def.kind !== 'self' || def.kind === 'self';
      let tx = g.x;
      let tz = g.z;
      if (def.kind === 'ground' || def.kind === 'blink' || def.kind === 'dash') {
        const d = Math.hypot(g.x - p.x, g.z - p.z) || 1;
        const k = Math.min(1, def.range / d);
        tx = p.x + (g.x - p.x) * k;
        tz = p.z + (g.z - p.z) * k;
      }
      if (def.kind === 'nova' || def.kind === 'self') {
        tx = p.x;
        tz = p.z;
      }
      this.previewLine.position.set(tx, 0.15, tz);
      this.previewLine.scale.set(rad * 2, rad * 2, 1);
      (this.previewLine.material as THREE.MeshBasicMaterial).opacity = 0.7;
    }
  }

  // ----------------------------------------------------------------- events

  private handleEvents(events: SimEvent[]) {
    if (events.length === 0) return;
    const w = this.world;
    this.renderer.handleEvents(events, w);
    for (const ev of events) {
      this.hud.onEvent(ev, w, this.team);
      this.audioFor(ev, w);
      this.floatFor(ev, w);
      if (ev.t === 'respawn' && ev.id === this.playerId) {
        const p = this.player;
        this.renderer.rig.setTarget(p.x + 6, p.z - 6);
      }
    }
  }

  private audioFor(ev: SimEvent, w: World) {
    const a = this.audio;
    switch (ev.t) {
      case 'attack': {
        const u = w.get(ev.id);
        if (!u) return;
        if (u.kind === 'tower') a.attack('tower', u.x, u.z);
        else if (u.kind === 'champion') a.attack(CHAMPIONS[u.defId].melee ? 'melee' : u.defId === 'kestrel' ? 'bow' : 'magic', u.x, u.z);
        else a.attack('minion', u.x, u.z);
        break;
      }
      case 'damage':
        if (ev.source === this.playerId || ev.id === this.playerId || ev.amount > 120) a.hit(ev.dmgType, ev.amount > 120, ev.x, ev.z);
        break;
      case 'cast':
        a.cast(CHAMPIONS[ev.champ].abilities[ev.slot].color, ev.x, ev.z);
        break;
      case 'death':
        if (ev.kind === 'champion') {
          a.death();
        }
        break;
      case 'structureDown':
        a.structureDown(ev.kind === 'nexus', ev.x, ev.z);
        break;
      case 'kill': {
        const own = ev.killerTeam === this.team;
        a.kill(own);
        break;
      }
      case 'levelUp':
        if (ev.id === this.playerId) a.levelUp();
        break;
      case 'gold':
        if (ev.id === this.playerId && ev.amount >= 10) a.gold();
        break;
      case 'buy':
        if (ev.id === this.playerId) a.buy();
        break;
      case 'sell':
        if (ev.id === this.playerId) a.sell();
        break;
      case 'respawn':
        if (ev.id === this.playerId) a.respawn();
        break;
      case 'recallStart':
        if (ev.id === this.playerId) a.recallStart();
        break;
      case 'recallCancel':
        if (ev.id === this.playerId) a.recallCancel();
        break;
      case 'announce':
        a.announce(ev.text.includes('inhibitor') ? 'inhib' : ev.team === this.team ? 'ally' : 'enemy');
        break;
      case 'gameOver':
        a.announce(ev.winner === this.team ? 'win' : 'lose');
        break;
      case 'status':
        if (ev.status === 'stun') {
          const u = w.get(ev.id);
          if (u) a.stun(u.x, u.z);
        }
        break;
      case 'msg':
        if (ev.unit === this.playerId) a.error();
        break;
      default:
        break;
    }
  }

  private floatFor(ev: SimEvent, w: World) {
    const o = this.overlay;
    switch (ev.t) {
      case 'damage': {
        const mine = ev.source === this.playerId;
        const taken = ev.id === this.playerId;
        if (!mine && !taken) return;
        const u = w.get(ev.id);
        const h = (u?.height ?? 2) + 0.5;
        const color = taken ? '#ff6a5a' : ev.dmgType === 'magic' ? '#c8a8ff' : ev.dmgType === 'true' ? '#ffffff' : '#ffd070';
        const big = ev.amount >= 100;
        o.float(String(ev.amount), ev.x, h, ev.z, color, big ? 22 : 15, big ? 1.1 : 0.8);
        break;
      }
      case 'gold':
        if (ev.id === this.playerId) o.float(`+${ev.amount}`, ev.x, 6, ev.z, '#ffd24a', 15, 1.2);
        break;
      case 'heal':
        if (ev.id === this.playerId && ev.amount >= 5) o.float(`+${ev.amount}`, ev.x, 5, ev.z, '#6aff9a', 14, 0.9);
        break;
      case 'levelUp':
        if (ev.id === this.playerId) {
          const p = this.player;
          o.float('LEVEL UP', p.x, 7, p.z, '#ffe27a', 24, 1.6);
        }
        break;
      default:
        break;
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.minimap.dispose();
    this.audio.stopMusic();
    this.renderer.dispose();
    this.parent.querySelectorAll('.hud, .shop, .minimap, .pause, .endscreen, #overlay, #game').forEach((n) => n.remove());
    hideTip();
    void this.choice;
  }
}

