import * as THREE from 'three';
import { Sim, type SimConfig } from '../sim/sim.ts';
import { buildMap, type MapData } from '../sim/map.ts';
import { World } from '../sim/world.ts';
import { NavGrid } from '../sim/nav.ts';
import { DT, MOVE, ROUND, TEAM_BREACHER } from '../sim/constants.ts';
import { DEG, angleDiff, clamp, forwardOf, v3, type Vec3 } from '../sim/math.ts';
import { currentWeapon, curDef, eyeHeight, eyePos, maxSpeedOf, newCmd, type Actor } from '../sim/actor.ts';
import { currentSpread } from '../sim/combat.ts';
import { predictThrow } from '../sim/grenades.ts';
import { WEAPONS } from '../sim/weapons.ts';
import { buyItem } from '../sim/economy.ts';
import { createBrain } from '../sim/bots.ts';
import type { SimEvent } from '../sim/events.ts';
import { loadSettings, saveSettings, type Settings } from './settings.ts';
import { Input } from './input.ts';
import { audio } from './audio.ts';
import { buildMapMesh, type MapMesh } from '../render/mapmesh.ts';
import { CharacterRig } from '../render/characters.ts';
import { ViewModel } from '../render/viewmodel.ts';
import { Effects } from '../render/fx.ts';
import { Hud, el, type HudContext } from '../ui/hud.ts';
import { BuyMenu, Menus, Scoreboard } from '../ui/panels.ts';

export interface DebugFlags { debug: boolean; auto: boolean; bots?: number; god: boolean; money?: number; mode?: 'comp' | 'dm'; side?: 0 | 1; seed?: number; difficulty?: 0 | 1 | 2 | 3; round?: number }

type State = 'menu' | 'playing' | 'paused' | 'over';

const ZOOM_SENS = (fov: number, base: number) => Math.tan((fov * DEG) / 2) / Math.tan((base * DEG) / 2);

export class Game {
  settings: Settings;
  flags: DebugFlags;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(73.7, 16 / 9, 0.05, 500);
  map: MapData;
  world: World;
  nav: NavGrid;
  mapMesh: MapMesh;
  vm = new ViewModel();
  fx: Effects;
  input: Input;
  hud: Hud;
  buy: BuyMenu;
  board: Scoreboard;
  menus: Menus;
  rigs = new Map<number, CharacterRig>();
  sim: Sim | null = null;
  menuSim: Sim | null = null;
  state: State = 'menu';
  // view
  viewYaw = 0;
  viewPitch = 0;
  fovNow = 73.7;
  spectateId = -1;
  buyOpen = false;
  private acc = 0;
  private last = 0;
  private fpsT = 0;
  private fpsN = 0;
  private fps = 60;
  private edge = { reload: false, select: null as null | 'primary' | 'secondary' | 'knife' | 'grenade' | 'bomb', drop: false, last: false, jump: false, nextG: false, use: false };
  private spotted = new Map<number, number>();
  private spotAt = 0;
  private roll = 0;
  private bob = 0;
  private lastLook = { yaw: 0, pitch: 0 };
  private yawRate = 0;
  private pitchRate = 0;
  private menuTimer = 0;
  private menuSubject = -1;
  private resultsAt = 0;
  private lastFlashLevel = 0;
  private lastEyeY = 0;
  private radioQueue: Array<{ id: number; text: string }> = [];
  private lastHumanAlive = true;
  private statsCounted = false;
  private uiRoot: HTMLElement;
  private muzzleVec = new THREE.Vector3();
  private tmpV = new THREE.Vector3();
  private landDip = 0;
  private loadoutBought: string[] = [];
  private renderScale = 1;
  private impactBudget = 0;
  /** milliseconds spent per part of the frame, summed since the last reset, for the debug overlay and tests */
  perf = { sim: 0, hud: 0, rigs: 0, fx: 0, render: 0, frames: 0 };
  private slowT = 0;
  private fastT = 0;

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement, uiRoot: HTMLElement, flags: DebugFlags) {
    this.flags = flags;
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.settings = loadSettings();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;

    this.map = buildMap();
    this.world = new World(this.map.boxes, this.map.bounds);
    this.nav = new NavGrid(this.world);
    this.mapMesh = buildMapMesh(this.map);
    this.scene.add(this.mapMesh.group);
    this.scene.background = new THREE.Color(0xdfe8f0);
    this.scene.fog = this.mapMesh.fog;
    this.fx = new Effects(this.scene);
    this.input = new Input(canvas, this.settings);
    this.hud = new Hud(hudRoot, this.settings);
    this.hud.setMap(this.map);
    this.buy = new BuyMenu(uiRoot);
    this.buy.onBuy = (item) => {
      const h = this.sim?.human;
      if (!h || !this.sim) return false;
      return buyItem(this.sim, h, item);
    };
    this.board = new Scoreboard(uiRoot);
    this.menus = new Menus(uiRoot, this.settings, {
      start: () => this.startMatch(),
      resume: () => this.resume(),
      leave: () => this.toMenu(),
      again: () => this.startMatch(),
      changed: () => this.applySettings(),
    });

    this.input.onLock = (locked) => this.onLockChange(locked);
    this.input.onKey = (code) => this.onKeyDown(code);
    window.addEventListener('resize', () => this.resize());
    // Ctrl+W (forward while crouching on some layouts) closes the tab and cannot be intercepted, so ask first during a match
    window.addEventListener('beforeunload', (e) => {
      if (!this.flags.auto && (this.state === 'playing' || this.state === 'paused') && this.sim && this.sim.m.phase !== 'over') { e.preventDefault(); e.returnValue = ''; }
    });
    window.addEventListener('mousedown', (e) => this.onMouseDown(e));
    const gesture = () => { audio.init(); if (this.state === 'menu') audio.startMusic(); };
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    this.applySettings();
    this.resize();
    this.toMenu();
    requestAnimationFrame((t) => { this.last = t; this.loop(t); });
    if (flags.debug) { (window as unknown as { __game: Game }).__game = this; (window as unknown as { __audio: typeof audio }).__audio = audio; }
    if (flags.auto) this.input.locked = true;
  }

  // ======================================================================= settings and sizing

  applySettings() {
    const s = this.settings;
    saveSettings(s);
    const q = s.quality;
    const dpr = window.devicePixelRatio || 1;
    this.renderScale = 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) * 0.75 : q === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.mapMesh.setShadowQuality(q === 'low' ? 0 : q === 'medium' ? 1024 : 2048);
    audio.setVolumes(s.volume, s.music);
    this.hud.setSettings(s);
    this.resize();
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.resize(w / h);
    this.fx.setScale(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  // ======================================================================= lifecycle

  private rigFor(a: Actor) {
    let r = this.rigs.get(a.id);
    if (!r || r.team !== a.team) {
      if (r) this.scene.remove(r.root);
      r = new CharacterRig(a.team, a.id);
      r.setName(a.name);
      this.scene.add(r.root);
      this.rigs.set(a.id, r);
    }
    return r;
  }

  private clearRigs() {
    for (const r of this.rigs.values()) { this.scene.remove(r.root); r.dispose(); }
    this.rigs.clear();
  }

  private makeSim(cfg: SimConfig) {
    const sim = new Sim(cfg, { map: this.map, world: this.world, nav: this.nav });
    return sim;
  }

  toMenu() {
    this.state = 'menu';
    this.input.exitLock();
    this.buyOpen = false;
    this.buy.hide();
    this.board.hide();
    this.clearRigs();
    this.fx.clearRound();
    this.sim = null;
    this.hud.root.style.display = 'none';
    this.menuSim = this.makeSim({ mode: 'comp', humanSide: null, difficulty: 2, seed: (Math.random() * 1e9) | 0 });
    this.menuTimer = 0; this.menuSubject = -1;
    this.menus.showMain();
    this.statsCounted = false;
    audio.startMusic();
  }

  startMatch() {
    audio.init();
    audio.stopMusic();
    const s = this.settings;
    const f = this.flags;
    const cfg: SimConfig = {
      mode: f.mode ?? s.mode, humanSide: f.side ?? s.side, difficulty: f.difficulty ?? s.difficulty,
      seed: f.seed ?? ((Math.random() * 1e9) | 0), humanName: 'You', passive: f.bots === 0,
    };
    this.menuSim = null;
    this.clearRigs();
    this.fx.clearRound();
    this.hud.reset();
    this.sim = this.makeSim(cfg);
    const sim = this.sim;
    if (f.round && sim.cfg.mode === 'comp') this.debugSkipRounds(f.round);
    if (f.money !== undefined) for (const a of sim.actors) a.money = f.money;
    const h = sim.human;
    if (h) { this.viewYaw = h.yaw; this.viewPitch = 0; }
    this.state = 'playing';
    this.menus.hideAll();
    this.hud.root.style.display = '';
    this.hud.setMap(this.map);
    this.statsCounted = false;
    this.spectateId = -1;
    this.acc = 0;
    if (!f.auto) this.input.requestLock();
    if (sim.cfg.mode === 'comp') this.hud.center('Round 1', sim.human ? (sim.human.team === 0 ? 'You are a Sentinel: stop the plant at A or B' : 'You are a Breacher: plant the bomb at A or B') : '', '#ffb347', 4.5);
    else this.hud.center('Deathmatch', 'Free for all. B picks your weapon.', '#ffb347', 4);
    if (this.settings.stats.matches === 0 && !f.auto) this.hud.firstRunHint(this.settings);
  }

  /** Debug helper: fast forward bot only rounds. */
  private debugSkipRounds(n: number) {
    const sim = this.sim!;
    const human = sim.human;
    sim.human = null;
    for (const a of sim.actors) if (a.isHuman) { a.isHuman = false; a.isBot = true; if (!sim.brains.has(a.id)) sim.brains.set(a.id, createBrain(sim, a)); }
    let guard = 0;
    while (sim.m.round < n && sim.m.phase !== 'over' && guard++ < 64 * 60 * 40) sim.step();
    sim.drainEvents();
    if (human) { human.isHuman = true; human.isBot = false; sim.human = human; }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.exitLock();
    this.menus.showPause();
  }

  resume() {
    if (this.state === 'paused' || this.state === 'playing') {
      this.state = 'playing';
      this.menus.hideAll();
      this.input.requestLock();
    }
  }

  private onLockChange(locked: boolean) {
    if (locked) { this.menus.resume.classList.add('hidden'); if (this.state === 'paused') { this.state = 'playing'; this.menus.hideAll(); } return; }
    if (this.state === 'playing' && !this.buyOpen && !this.flags.auto) this.pause();
  }

  private onMouseDown(e: MouseEvent) {
    if (this.state === 'playing' && !this.input.locked && !this.buyOpen && !this.flags.auto && (e.target === this.canvas)) { this.input.requestLock(); return; }
    // spectate cycle
    if (this.state === 'playing' && this.input.locked && e.button === 0) {
      const h = this.sim?.human;
      if (h && !h.alive && this.sim!.cfg.mode === 'comp') this.cycleSpectate(1);
    }
  }

  private onKeyDown(code: string) {
    audio.init();
    const k = this.settings.keys;
    const is = (a: keyof typeof k) => k[a].includes(code);
    if (this.state === 'menu') return;
    const sim = this.sim;
    if (!sim) return;
    if (is('mute')) audio.toggleMute();
    if (this.state !== 'playing') return;
    const h = sim.human;
    if (is('buy') && h && h.alive && (sim.cfg.mode === 'dm' || sim.m.phase === 'freeze')) { this.toggleBuy(); return; }
    if (this.buyOpen) {
      // while shopping, digits are quick buy keys and must not select weapons
      if (!this.buy.handleKey(code) && code === 'Escape') this.toggleBuy();
      return;
    }
    if (is('scoreboard')) this.board.show();
    if (is('reload')) this.edge.reload = true;
    if (is('use')) this.edge.use = true;
    if (is('primary')) this.edge.select = 'primary';
    if (is('secondary')) this.edge.select = 'secondary';
    if (is('knife')) this.edge.select = 'knife';
    if (is('grenade')) this.edge.select = 'grenade';
    if (is('bomb')) this.edge.select = 'bomb';
    if (is('drop')) this.edge.drop = true;
    if (is('last')) this.edge.last = true;
    if (is('radio') && h && h.alive && sim.m.phase === 'freeze') { sim.ai[h.team].giveDrop(h); }
  }

  private toggleBuy() {
    const sim = this.sim, h = sim?.human;
    if (!sim || !h) return;
    this.buyOpen = !this.buyOpen;
    if (this.buyOpen) { this.buy.show(sim, h); this.input.exitLock(); }
    else { this.buy.hide(); this.relock(); }
  }

  /** Ask for the mouse back. If the browser refuses (no user gesture), show a click to continue prompt. */
  private relock() {
    if (this.flags.auto) return;
    this.input.requestLock();
    setTimeout(() => { if (this.state === 'playing' && !this.input.locked && !this.buyOpen) this.menus.showResume(); }, 450);
  }

  private cycleSpectate(dir: number) {
    const sim = this.sim!;
    const h = sim.human!;
    const list = sim.actors.filter((a) => a.alive && (sim.cfg.mode === 'dm' ? a !== h : a.team === h.team));
    if (!list.length) { this.spectateId = -1; return; }
    const i = list.findIndex((a) => a.id === this.spectateId);
    this.spectateId = list[(i + dir + list.length) % list.length].id;
  }

  /** Lower the render resolution if the frame rate stays low, raise it again when there is headroom. */
  private adaptResolution(dt: number) {
    if (this.flags.debug && this.flags.auto) return;
    if (dt > 0.034) { this.slowT += dt; this.fastT = 0; } else if (dt < 0.019) { this.fastT += dt; this.slowT = Math.max(0, this.slowT - dt); }
    if (this.slowT > 2.5 && this.renderScale > 0.55) { this.renderScale = Math.max(0.55, this.renderScale - 0.12); this.slowT = 0; this.applyPixelRatio(); }
    else if (this.fastT > 12 && this.renderScale < 1) { this.renderScale = Math.min(1, this.renderScale + 0.08); this.fastT = 0; this.applyPixelRatio(); }
  }

  private applyPixelRatio() {
    const q = this.settings.quality;
    const dpr = window.devicePixelRatio || 1;
    const base = q === 'low' ? Math.min(dpr, 1) * 0.75 : q === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(Math.max(0.5, base * this.renderScale));
    this.resize();
  }

  // ======================================================================= main loop

  private loop(t: number) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.05, Math.max(0.0001, (t - this.last) / 1000));
    this.last = t;
    this.fpsT += dt; this.fpsN++;
    this.impactBudget = 6;
    this.adaptResolution(dt);
    if (this.fpsT >= 0.5) { this.fps = this.fpsN / this.fpsT; this.fpsT = 0; this.fpsN = 0; }
    try {
      if (this.state === 'menu') this.updateMenu(dt);
      else this.updateMatch(dt);
    } catch (err) {
      console.error(err);
    }
    this.input.endFrame();
  }

  // ----------------------------------------------------------------------- menu background

  private updateMenu(dt: number) {
    const sim = this.menuSim;
    if (!sim) return;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 4) { sim.step(); this.acc -= DT; steps++; }
    sim.drainEvents();
    if (sim.m.phase === 'over') { this.toMenu(); return; }
    this.menuTimer -= dt;
    const alive = sim.actors.filter((a) => a.alive);
    if ((this.menuTimer <= 0 || !sim.actors[this.menuSubject]?.alive) && alive.length) {
      this.menuSubject = alive[(Math.random() * alive.length) | 0].id; this.menuTimer = 7 + Math.random() * 5;
    }
    const subject = sim.actors[this.menuSubject] ?? sim.actors[0];
    this.renderScene(dt, sim, subject, null, true);
  }

  // ----------------------------------------------------------------------- match

  private prepareHumanCmd(sim: Sim, h: Actor) {
    const i = this.input, s = this.settings;
    const cmd = h.cmd;
    const frozen = this.buyOpen || this.state !== 'playing';
    cmd.yaw = this.viewYaw; cmd.pitch = this.viewPitch;
    if (!h.alive || frozen) {
      cmd.fwd = 0; cmd.side = 0; cmd.fire = false; cmd.alt = false; cmd.jump = false; cmd.use = false; cmd.crouch = false;
      return;
    }
    cmd.fwd = (i.down('forward') ? 1 : 0) - (i.down('back') ? 1 : 0);
    cmd.side = (i.down('right') ? 1 : 0) - (i.down('left') ? 1 : 0);
    cmd.fire = i.buttons.has(0);
    cmd.alt = i.buttons.has(2);
    cmd.jump = i.down('jump') || this.edge.jump;
    cmd.crouch = i.down('crouch');
    cmd.walk = i.down('walk');
    cmd.use = i.down('use') || this.edge.use;
    if (this.edge.reload) cmd.reload = true;
    if (this.edge.select) cmd.select = this.edge.select;
    if (this.edge.drop) cmd.drop = true;
    if (this.edge.last) cmd.lastWeapon = true;
    this.edge.reload = false; this.edge.select = null; this.edge.drop = false; this.edge.last = false; this.edge.jump = false; this.edge.use = false;
    void s;
  }

  private applyLook() {
    const i = this.input, s = this.settings;
    const sim = this.sim!, h = sim.human;
    if (!h || !h.alive || !i.locked || this.buyOpen) { return; }
    const scoped = h.scope > 0 ? ZOOM_SENS(this.fovNow, s.fov) : 1;
    const k = 0.022 * s.sens * DEG * scoped * (this.renderer.getPixelRatio() > 0 ? 1 : 1);
    this.viewYaw -= i.mouseDX * k;
    this.viewPitch -= i.mouseDY * k * (s.invertY ? -1 : 1);
    this.viewPitch = clamp(this.viewPitch, -89 * DEG, 89 * DEG);
    if (i.wheel !== 0) {
      if (s.wheel === 'jump') this.edge.jump = true;
      else this.wheelCycle(i.wheel);
    }
  }

  private wheelCycle(dir: number) {
    const h = this.sim!.human!;
    const order: Array<'primary' | 'secondary' | 'knife' | 'grenade' | 'bomb'> = [];
    if (h.primary) order.push('primary');
    if (h.secondary) order.push('secondary');
    order.push('knife');
    if (h.grenades.flash + h.grenades.smoke + h.grenades.he + h.grenades.fire > 0) order.push('grenade');
    if (h.hasBomb) order.push('bomb');
    const i = order.indexOf(h.cur);
    this.edge.select = order[(i + (dir > 0 ? 1 : -1) + order.length) % order.length];
  }

  private updateMatch(dt: number) {
    const sim = this.sim;
    if (!sim) return;
    const h = sim.human;
    if (this.state === 'playing') {
      this.applyLook();
      if (this.input.locked && !this.input.down('scoreboard') && this.board.visible) this.board.hide();
      if (!this.input.down('scoreboard') && this.board.visible) this.board.hide();
      this.acc += dt;
      let steps = 0;
      const ts = performance.now();
      while (this.acc >= DT && steps < 6) {
        if (h) this.prepareHumanCmd(sim, h);
        if (this.flags.god && h) { h.health = 100; }
        sim.step();
        this.acc -= DT; steps++;
        this.handleEvents(sim.drainEvents());
      }
      this.perf.sim += performance.now() - ts;
      if (steps === 6) this.acc = 0;
      if (h && !h.alive && this.lastHumanAlive) { this.lastHumanAlive = false; this.spectateId = -1; if (sim.cfg.mode === 'comp') this.cycleSpectate(1); }
      if (h && h.alive) this.lastHumanAlive = true;
      if (h && !h.alive && sim.cfg.mode === 'comp' && (!sim.actors[this.spectateId]?.alive)) this.cycleSpectate(1);
      if (this.resultsAt > 0 && sim.time > this.resultsAt) { this.resultsAt = 0; this.showResults(); }
    }
    // ---- who are we looking through
    let subject: Actor = h ?? sim.actors[0];
    if (h && !h.alive && sim.cfg.mode === 'comp' && sim.actors[this.spectateId]?.alive) subject = sim.actors[this.spectateId];
    this.updateSpotted(sim, h);
    this.renderScene(dt, sim, subject, h, false);
    const th = performance.now();
    if (h) this.updateHud(dt, sim, h, subject);
    this.perf.hud += performance.now() - th; this.perf.frames++;
    if (this.board.visible) this.board.render(sim, h);
    if (this.buyOpen) { this.buy.refresh(); if (!h || !h.alive || (sim.cfg.mode === 'comp' && sim.m.phase !== 'freeze')) { this.buyOpen = false; this.buy.hide(); if (this.state === 'playing') this.relock(); } }
  }

  private updateSpotted(sim: Sim, h: Actor | null) {
    if (sim.time < this.spotAt || !h) return;
    this.spotAt = sim.time + 0.15;
    const mates = sim.cfg.mode === 'comp' ? sim.actors.filter((a) => a.alive && a.team === h.team) : h.alive ? [h] : [];
    for (const e of sim.actors) {
      if (!e.alive || (sim.cfg.mode === 'comp' && e.team === h.team) || e === h) continue;
      for (const m of mates) {
        const dx = e.pos.x - m.pos.x, dz = e.pos.z - m.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 80) continue;
        const f = forwardOf(m.yaw, 0);
        if ((dx * f.x + dz * f.z) / Math.max(d, 1e-6) < 0.3 && d > 3) continue;
        const a = eyePos(m);
        if (sim.visible(a.x, a.y, a.z, e.pos.x, e.pos.y + 1.2, e.pos.z)) { this.spotted.set(e.id, sim.time + 1.4); break; }
      }
    }
  }

  // ======================================================================= events

  private distTo(p: Vec3) { return Math.hypot(p.x - this.camera.position.x, p.y - this.camera.position.y, p.z - this.camera.position.z); }

  private handleEvents(events: SimEvent[]) {
    const sim = this.sim!;
    const h = sim.human;
    const hid = h ? h.id : -999;
    const hudCtx = this.hud;
    for (const e of events) {
      this.fx.onEvent(e, sim, (id) => { const r = this.rigs.get(id); return r ? r.muzzleWorld : null; }, (id) => id === hid && h!.alive, () => { const v = this.vm.muzzleWorld(this.muzzleVec); if (v.lengthSq() === 0 || this.vm.hidden) return null; this.camera.updateMatrixWorld(); return v.applyMatrix4(this.camera.matrixWorld); });
      switch (e.t) {
        case 'shot': {
          const def = WEAPONS[e.weapon];
          const own = e.id === hid;
          const pitch = 0.92 + ((def.damage * 13) % 20) / 100;
          if (own) { audio.gun(def.cls, null, 0, pitch, 0.9); this.vm.kick(def.cls === 'sniper' || def.cls === 'shotgun' ? 1.6 : def.cls === 'pistol' ? 0.9 : 0.7); }
          else audio.gun(def.cls, e.pos, this.distTo(e.pos), pitch);
          break;
        }
        case 'hit': {
          if (e.attacker === hid) { hudCtx.hitMarker(e.head); if (e.head) audio.headshot(); else audio.hitMarker(); }
          break;
        }
        case 'impact': {
          if (this.impactBudget-- > 0) audio.impact(e.surface, e.pos, this.distTo(e.pos));
          break;
        }
        case 'hurt': {
          if (e.id === hid && h) {
            audio.hurt();
            const f = e.from ?? h.pos;
            const rel = angleDiff(this.viewYaw, Math.atan2(-(f.x - h.pos.x), -(f.z - h.pos.z)));
            hudCtx.damageFrom(-rel, e.dmg);
            this.fx.shake = Math.max(this.fx.shake, Math.min(0.35, e.dmg / 120));
          }
          break;
        }
        case 'kill': {
          hudCtx.killFeed(sim, e, hid);
          if (e.killer === hid && e.victim !== hid) audio.kill();
          if (h) {
            const st = this.settings.stats;
            if (e.killer === hid && e.victim !== hid) { st.kills++; if (e.head) st.headshots++; }
            if (e.victim === hid) st.deaths++;
          }
          if (e.victim === hid) this.input.buttons.clear();
          break;
        }
        case 'step': {
          if (e.id === hid) { audio.step(e.surface, null, 0, e.loud ? 0.22 : 0.1); }
          else audio.step(e.surface, e.pos, this.distTo(e.pos), e.loud ? 0.55 : 0.2);
          break;
        }
        case 'land': {
          if (e.id === hid) { audio.land(null, 0, e.speed); this.landDip = Math.min(0.12, e.speed * 0.012); } else audio.land(e.pos, this.distTo(e.pos), e.speed);
          break;
        }
        case 'reload': {
          const def = WEAPONS[e.weapon];
          const a = sim.actors[e.id];
          if (e.id === hid) audio.reload(def.cls, null, 0); else audio.reload(def.cls, a.pos, this.distTo(a.pos));
          break;
        }
        case 'draw': {
          const a = sim.actors[e.id];
          if (e.id === hid) audio.draw(null, 0); else audio.draw(a.pos, this.distTo(a.pos));
          break;
        }
        case 'dryfire': { const a = sim.actors[e.id]; audio.dryfire(e.id === hid ? null : a.pos, e.id === hid ? 0 : this.distTo(a.pos)); break; }
        case 'knife': {
          const a = sim.actors[e.id];
          if (e.id === hid) this.vm.swing(e.stab);
          audio.stab(e.id === hid ? null : a.pos, e.id === hid ? 0 : this.distTo(a.pos), e.hit);
          break;
        }
        case 'pin': { const a = sim.actors[e.id]; audio.click(1800, 0.05, 0.3, e.id === hid ? null : a.pos, e.id === hid ? 0 : this.distTo(a.pos)); break; }
        case 'throw': { if (e.id === hid) this.vm.throwAnim(); audio.whoosh(e.id === hid ? null : e.pos, e.id === hid ? 0 : this.distTo(e.pos), 0.4); break; }
        case 'bounce': audio.click(1100, 0.04, 0.3, e.pos, this.distTo(e.pos)); break;
        case 'detonate': {
          const d = this.distTo(e.pos);
          if (e.kind === 'he') audio.explosion(e.pos, d);
          else if (e.kind === 'flash') audio.flashBang(e.pos, d);
          else if (e.kind === 'smoke') audio.smokePop(e.pos, d);
          else audio.explosion(e.pos, d * 1.6);
          break;
        }
        case 'flashed': { if (e.id === hid) { audio.flashRing(e.dur); } break; }
        case 'plantStart': { const a = sim.actors[e.id]; audio.plantTone(a.pos, this.distTo(a.pos)); break; }
        case 'planted': {
          audio.plantTone(e.pos, this.distTo(e.pos));
          const a = sim.actors[e.id];
          hudCtx.center('Bomb planted', `Site ${e.site}`, '#ff6a4a', 3);
          this.radioQueue.push({ id: e.id, text: `Bomb planted at ${e.site}` });
          void a;
          break;
        }
        case 'beep': { audio.bombBeep(e.pos, this.distTo(e.pos), e.fast); this.fx.blinkBomb(); break; }
        case 'defuseStart': { const a = sim.actors[e.id]; audio.click(1400, 0.05, 0.3, a.pos, this.distTo(a.pos)); break; }
        case 'defused': { audio.defused(); hudCtx.center('Bomb defused', '', '#5cc8ff', 3); break; }
        case 'exploded': { audio.explosion(e.pos, this.distTo(e.pos), true); break; }
        case 'pickup': { if (e.id === hid) audio.pickup(); break; }
        case 'bombPickup': { if (e.id === hid) { audio.pickup(); hudCtx.center('You picked up the bomb', '', '#ffe14a', 2); } break; }
        case 'bombDrop': audio.click(500, 0.1, 0.4, e.pos, this.distTo(e.pos)); break;
        case 'buy': { if (e.id !== hid) { /* silent */ } break; }
        case 'money': { if (e.id === hid && e.amount !== 0) hudCtx.money$(e.amount); break; }
        case 'freezeStart': {
          this.fx.clearRound();
          hudCtx.reset();
          this.statsCounted = false;
          if (h) { this.viewYaw = h.yaw; this.viewPitch = 0; }
          if (this.buyOpen) { this.buy.show(sim, h!); }
          audio.tick();
          break;
        }
        case 'live': {
          audio.roundStart();
          if (this.buyOpen) this.toggleBuy();
          hudCtx.center('Go go go', `Round ${e.round}`, '#ffb347', 1.4);
          break;
        }
        case 'roundEnd': {
          const myTeam = h ? h.team : -1;
          const won = e.winner === myTeam;
          const why = e.reason === 'bomb' ? 'The bomb exploded' : e.reason === 'defuse' ? 'The bomb was defused' : e.reason === 'time' ? 'Time ran out' : 'All enemies eliminated';
          const nm = e.winner === TEAM_BREACHER ? 'Breachers' : 'Sentinels';
          if (h) {
            hudCtx.center(won ? 'Round won' : 'Round lost', `${nm} win · ${why}${e.mvp >= 0 ? ` · MVP ${sim.actors[e.mvp].name}` : ''}`, won ? '#5dffa0' : '#ff6a5a', 4.2);
            if (won) audio.win(); else audio.lose();
          }
          break;
        }
        case 'halftime': hudCtx.center('Switching sides', 'Money and weapons reset', '#ffb347', 5); break;
        case 'matchEnd': {
          this.resultsAt = sim.time + 2.5;
          break;
        }
        case 'radio': {
          const a = sim.actors[e.id];
          if (h && (sim.cfg.mode === 'comp' ? a.team === h.team : false)) { hudCtx.subtitle(a.name, a.team, e.text); audio.radio(e.text); }
          break;
        }
        default: break;
      }
    }
    // radio lines queued from other events
    for (const r of this.radioQueue) { const a = sim.actors[r.id]; if (h && a.team === h.team && a.id !== hid) hudCtx.subtitle(a.name, a.team, r.text); }
    this.radioQueue.length = 0;
  }

  private showResults() {
    const sim = this.sim!;
    const h = sim.human;
    this.state = 'over';
    this.input.exitLock();
    this.buy.hide(); this.board.hide();
    let won: boolean | null = null;
    if (h && sim.cfg.mode === 'comp') { won = sim.m.winnerGrp === h.grp; if (sim.m.winnerGrp === -1) won = null; }
    if (!this.statsCounted && h) {
      this.statsCounted = true;
      const st = this.settings.stats;
      st.matches++; if (won) st.wins++;
      st.rounds += sim.m.history.length;
      saveSettings(this.settings);
    }
    this.menus.showResults(sim, h, won);
  }

  // ======================================================================= rendering

  private renderScene(dt: number, sim: Sim, subject: Actor, human: Actor | null, menu: boolean) {
    const now = sim.time;
    const alpha = clamp(this.acc / DT, 0, 1);
    const first = subject.alive;
    const isHumanView = human !== null && subject === human;
    const p = subject.pos, pp = subject.prev;
    const ix = pp.x + (p.x - pp.x) * alpha, iy = pp.y + (p.y - pp.y) * alpha, iz = pp.z + (p.z - pp.z) * alpha;

    // ---- camera
    let yaw: number, pitch: number, roll = 0;
    if (isHumanView && first) { yaw = this.viewYaw; pitch = this.viewPitch; }
    else { yaw = subject.prevYaw + angleDiff(subject.prevYaw, subject.cmd.yaw) * Math.min(1, alpha + 0.3); pitch = subject.cmd.pitch; }
    let eyeY = iy + eyeHeight(subject);
    if (!first) {
      // death cam: hang a little above the body looking toward the killer
      eyeY = iy + 0.5;
      const killer = sim.actors[subject.killedBy];
      if (killer && killer !== subject) { yaw = Math.atan2(-(killer.pos.x - p.x), -(killer.pos.z - p.z)); pitch = -0.1; }
    }
    if (!menu || true) this.lastEyeY += (eyeY - this.lastEyeY) * Math.min(1, dt * 30);
    if (Math.abs(this.lastEyeY - eyeY) > 1.2) this.lastEyeY = eyeY;
    const smoothY = subject.onGround ? this.lastEyeY : eyeY;
    this.landDip = Math.max(0, this.landDip - dt * 0.5);
    const punchP = first ? subject.punchP * 0.45 * DEG : 0, punchY = first ? subject.punchY * 0.45 * DEG : 0;
    const sideVel = subject.vel.x * Math.cos(yaw) - subject.vel.z * Math.sin(yaw);
    this.roll += (clamp(-sideVel * 0.0035, -0.03, 0.03) - this.roll) * Math.min(1, dt * 8);
    roll = this.roll;
    const sh = this.fx.shake;
    const shakeX = (Math.random() - 0.5) * sh * 0.06, shakeY = (Math.random() - 0.5) * sh * 0.06;
    this.camera.position.set(ix, smoothY - this.landDip, iz);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(pitch + punchP + shakeY, yaw - punchY + shakeX, roll + (Math.random() - 0.5) * sh * 0.02);
    // fov with scoping
    const def = curDef(subject);
    const baseFov = this.settings.fov;
    let target = baseFov;
    if (subject.scope > 0 && def && def.scope.length) target = baseFov * def.scope[subject.scope - 1];
    this.fovNow += (target - this.fovNow) * Math.min(1, dt * 18);
    if (Math.abs(this.camera.fov - this.fovNow) > 0.01) { this.camera.fov = this.fovNow; this.camera.updateProjectionMatrix(); }
    this.camera.updateMatrixWorld(true);

    // ---- world
    this.mapMesh.follow(this.camera.position);
    this.fx.setScale(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
    const tf = performance.now();
    this.fx.update(dt, sim, this.camera.position);
    this.perf.fx += performance.now() - tf;
    const tr = performance.now();
    for (const a of sim.actors) {
      const rig = this.rigFor(a);
      const hide = a === subject && first;
      rig.root.visible = !hide;
      if (hide) continue;
      const q = a.prev;
      const ax = a.alive ? q.x + (a.pos.x - q.x) * alpha : a.pos.x, ay = a.alive ? q.y + (a.pos.y - q.y) * alpha : a.pos.y, az = a.alive ? q.z + (a.pos.z - q.z) * alpha : a.pos.z;
      const ay2 = a.alive ? a.prevYaw + angleDiff(a.prevYaw, a.cmd.yaw) * 1 : a.yaw;
      const showTag = sim.cfg.mode === 'comp' && !!human && a.team === human.team && a !== subject;
      rig.update(dt, a, { x: ax, y: ay, z: az }, a.alive ? (a.isHuman ? a.yaw : ay2) : a.yaw, now, showTag);
    }
    this.perf.rigs += performance.now() - tr;
    audio.setListener(this.camera.position, yaw);
    // practice mode only: preview where the grenade in hand would go
    if (sim.cfg.mode === 'dm' && isHumanView && first && subject.cur === 'grenade' && subject.grenadeSel) {
      const b = this.input.buttons;
      const power = subject.pinPulled > 0 ? subject.pinPower : b.has(0) && b.has(2) ? 0.7 : b.has(2) ? 0.32 : 1;
      this.fx.trajectory(predictThrow(sim, subject, power));
    }

    // ---- viewmodel
    const ws = currentWeapon(subject);
    let key = 'knife';
    if (subject.cur === 'grenade') key = `g-${subject.grenadeSel ?? 'flash'}`;
    else if (subject.cur === 'bomb') key = 'bomb';
    else if (ws && ws.def.cls !== 'knife') key = ws.def.id;
    this.vm.setWeapon(key, subject.team);
    this.vm.hidden = !first || subject.scope > 0 || menu;
    const defRef = ws?.def;
    const reload = subject.reloadEnd > 0 && defRef ? clamp(1 - (subject.reloadEnd - now) / defRef.reload, 0, 1) : -1;
    const drawDur = defRef ? defRef.draw : 0.6;
    const draw = now < subject.drawEnd ? clamp(1 - (subject.drawEnd - now) / drawDur, 0, 1) : 1;
    const dyaw = angleDiff(this.lastLook.yaw, yaw), dpitch = pitch - this.lastLook.pitch;
    this.yawRate += (dyaw / Math.max(dt, 0.001) - this.yawRate) * 0.3;
    this.pitchRate += (dpitch / Math.max(dt, 0.001) - this.pitchRate) * 0.3;
    this.lastLook.yaw = yaw; this.lastLook.pitch = pitch;
    this.vm.update(dt, {
      speed: Math.hypot(subject.vel.x, subject.vel.z), maxSpeed: maxSpeedOf(subject), onGround: subject.onGround, crouch: subject.crouchAmt, vy: subject.vel.y,
      reload, draw, scoped: subject.scope > 0, planting: subject.planting, defusing: subject.defusing, pin: subject.pinPulled > 0,
      yawRate: this.yawRate * 57, pitchRate: this.pitchRate * 57, time: now, team: subject.team,
    });
    this.tmpV.set(0, 0, 0);

    // ---- draw
    this.renderer.info.reset();
    const tg = performance.now();
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (first && subject.scope === 0) {
      this.renderer.clearDepth();
      this.renderer.render(this.vm.scene, this.vm.camera);
    }
    this.perf.render += performance.now() - tg;

    // ---- flash overlay
    if (human) {
      let level = 0;
      if (human.flashEnd > now) level = now < human.flashFull ? 1 : clamp((human.flashEnd - now) / Math.max(0.01, human.flashEnd - human.flashFull), 0, 1);
      this.hud.setFlash(level * 0.97);
      this.lastFlashLevel = level;
    }
  }

  private updateHud(dt: number, sim: Sim, human: Actor, subject: Actor) {
    let nearDrop: string | null = null;
    for (const d of sim.drops) {
      if (d.kind === 'weapon' && Math.hypot(d.pos.x - human.pos.x, d.pos.z - human.pos.z) < 1.5 && Math.abs(d.pos.y - human.pos.y) < 1.5) { nearDrop = WEAPONS[d.weaponId].name; break; }
    }
    const site = sim.siteAt(human.pos);
    const nearBomb = sim.bomb.state === 'planted' && Math.hypot(human.pos.x - sim.bomb.pos.x, human.pos.z - sim.bomb.pos.z) <= ROUND.useRange;
    const ctx: HudContext = {
      sim, subject, human, yaw: subject === human ? this.viewYaw : subject.cmd.yaw, fovV: this.camera.fov, screenH: window.innerHeight,
      spread: currentSpread(subject), spotted: this.spotted, spectating: !human.alive && sim.cfg.mode === 'comp', scopeLevel: subject.scope,
      nearDrop, inSite: !!site, nearBomb,
    };
    this.hud.update(ctx, dt, this.fps);
    void v3; void MOVE; void el;
  }
}
