import * as THREE from 'three';
import { audio } from '../engine/audio';
import { Input } from '../engine/input';
import { GameRenderer } from '../engine/renderer';
import { SaveData, loadSave, writeSave } from '../engine/save';
import { angleDiff, clamp, damp, lerp, rand, fmtTime } from '../engine/util';
import { raycastWorld, RayHit, lineOfSight, moveFlat } from './collision';
import { Enemy } from './enemies/enemy';
import type { EnemyType } from './enemies/rig';
import { FX } from './fx/fx';
import { pointScale } from './fx/particles';
import { Weather } from './fx/weather';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Level } from './level/builder';
import { makeEnv } from './level/sky';
import type { LevelSetup, Mission, Spawn } from './missions/mission';
import { Mission1 } from './missions/mission1';
import { Mission2 } from './missions/mission2';
import { AmmoCrate, Barrel, Grenade, Heli, Relay } from './objects';
import { Player } from './player';
import type { GameCtx } from './types';
import { HUD } from './ui/hud';
import { Menus, Results } from './ui/menus';
import { TouchControls } from './ui/touch';
import { WEAPONS, WeaponDef, WeaponId } from './weapons/defs';
import { Viewmodel } from './weapons/viewmodel';
import { WeaponSystem } from './weapons/weaponSystem';
import type { RadioLine } from '../story/story';

type State = 'boot' | 'menu' | 'loading' | 'playing' | 'paused' | 'dead' | 'complete';

const PAR_TIME = [0, 780, 840];

export class Game implements GameCtx {
  canvas: HTMLCanvasElement;
  input: Input;
  save: SaveData;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(80, 1, 0.05, 700);
  viewmodel = new Viewmodel();
  renderer: GameRenderer;
  hud: HUD;
  touch: TouchControls;
  menus: Menus;
  player = new Player();
  fx!: FX;
  level!: Level;
  weapons!: WeaponSystem;
  mission!: Mission;
  enemies: Enemy[] = [];
  relays: Relay[] = [];
  barrels: Barrel[] = [];
  ammoCrates: AmmoCrate[] = [];
  grenades: Grenade[] = [];
  burning: { pos: THREE.Vector3; t: number }[] = [];
  heli = new Heli();
  weather: Weather | null = null;
  state: State = 'boot';
  time = 0;
  pathBudget = 3;
  stats = { shots: 0, hits: 0, headshots: 0, kills: 0, damageTaken: 0, score: 0, relays: 0 };
  missionTime = 0;
  frozen = false;
  god = false;
  debug = false;
  difficulty: 0 | 1 | 2 = 1;
  private sun!: THREE.DirectionalLight;
  private sunDir = new THREE.Vector3(0.3, 1, 0.2).normalize();
  private hemi!: THREE.HemisphereLight;
  private lampLights: THREE.PointLight[] = [];
  private lampAssign: number[] = [];
  private lampTimer = 0;
  private setup!: LevelSetup;
  private loadout: WeaponId[] = ['vk7', 'hornet'];
  private missionId = 1;
  private cp = 0;
  private marker: THREE.Vector3 | null = null;
  private hadLock = false;
  private timeScale = 1;
  private slowT = 0;
  private slowTarget = 1;
  private shakeAmt = 0;
  private hurtFlash = 0;
  private suppressAmt = 0;
  private deathT = 0;
  private lastFrame = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private musicBoost = 0;
  private lastHitShot = -1;
  private fov = 80;
  private fovCur = 80;
  private menuAngle = 0;
  private lastRegenHp = 0;
  private completing = false;
  private lastCombat = 0;
  private alertedOnce = false;
  token = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.save = loadSave();
    this.difficulty = this.save.settings.difficulty;
    const app = document.getElementById('app')!;
    this.input = new Input(canvas);
    this.renderer = new GameRenderer(canvas, this.scene, this.camera, this.viewmodel.scene, this.viewmodel.camera);
    {
      const pm = new THREE.PMREMGenerator(this.renderer.renderer);
      this.viewmodel.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.viewmodel.scene.environmentIntensity = 0.32;
      pm.dispose();
    }
    this.hud = new HUD(document.getElementById('hud')!);
    this.touch = new TouchControls(document.getElementById('touch')!, this.input, () => { if (this.state === 'playing') this.pause(true); });
    if (this.input.isTouch) document.getElementById('app')!.classList.add('touchmode');
    this.menus = new Menus(document.getElementById('ui')!, this.save, {
      startMission: (id, lo, cp) => this.startMission(id, lo, cp),
      resume: () => this.resume(),
      restartCheckpoint: () => this.startMission(this.missionId, this.loadout, this.cp),
      quit: () => this.toMenu(),
      next: () => this.menus.briefing(this.missionId + 1),
      replay: () => this.menus.briefing(this.missionId),
      settingsChanged: () => this.applySettings(),
    }, this.input.isTouch);
    this.applySettings();

    this.input.onLockChange = (locked) => {
      if (locked) { this.hadLock = true; if (this.state === 'paused' && this.screenIsClick2Play) { this.menus.hide(); this.hud.setPaused(false); this.state = 'playing'; } return; }
      if (this.state === 'playing' && this.hadLock) this.pause(true);
    };
    document.addEventListener('pointerlockerror', () => { if (this.state === 'playing' && !this.input.isTouch && !this.debug) this.pause(false); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing' && !this.input.locked) this.pause(true);
      if (e.code === 'F3') this.debug = !this.debug;
    });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(true); });
    canvas.addEventListener('click', () => {
      if (this.state === 'paused' && this.screenIsClick2Play) this.input.requestLock();
    });
    const unlock = () => { audio.init(); audio.setVolumes(this.save.settings.music, this.save.settings.sfx); audio.startMusic(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    this.resize();
  }

  private screenIsClick2Play = false;

  // ------------------------------------------------------------------ settings
  applySettings() {
    const s = this.save.settings;
    this.fov = s.fov;
    audio.setVolumes(s.music, s.sfx);
    this.renderer.setQuality(s.quality);
    this.setupLampPool();
    this.difficulty = s.difficulty;
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  private setupLampPool() {
    for (const l of this.lampLights) this.scene.remove(l);
    this.lampLights = [];
    const n = this.renderer.quality === 'low' ? 2 : this.renderer.quality === 'medium' ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffc890, 0, 18, 2);
      this.scene.add(l);
      this.lampLights.push(l);
    }
    this.lampAssign = new Array(n).fill(-1);
    this.lampTimer = 0;
  }

  // ------------------------------------------------------------------ lifecycle
  boot() {
    this.state = 'menu';
    this.loadMenuScene();
    this.menus.title();
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    const q = new URLSearchParams(location.search);
    if (q.has('debug')) { this.debug = true; (window as unknown as { __game: Game }).__game = this; }
    if (q.has('mission')) {
      this.god = q.has('god');
      const lo = (q.get('loadout') ?? 'vk7,hornet').split(',') as WeaponId[];
      if (q.has('q')) { this.save.settings.quality = q.get('q') as 'low' | 'medium' | 'high'; this.applySettings(); }
      setTimeout(() => this.startMission(Number(q.get('mission')), lo, Number(q.get('cp') ?? 0)), 300);
    }
  }

  private disposeScene(sc: THREE.Scene) {
    sc.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
    });
  }

  private resetWorld() {
    this.token++;
    this.disposeScene(this.scene);
    this.scene = new THREE.Scene();
    this.enemies = []; this.relays = []; this.barrels = []; this.ammoCrates = []; this.grenades = []; this.burning = [];
    this.weather = null;
    this.heli = new Heli();
    this.renderer.setScenes(this.scene, this.camera);
  }

  private buildScene(mission: Mission) {
    this.resetWorld();
    const setup = mission.buildLevel();
    this.setup = setup;
    this.level = setup.level;
    const sc = this.scene;
    sc.fog = new THREE.FogExp2(setup.fogColor, setup.fogDensity);
    sc.add(setup.sky);
    sc.add(setup.level.group);
    this.hemi = new THREE.HemisphereLight(setup.hemiSky, setup.hemiGround, setup.hemiIntensity);
    sc.add(this.hemi);
    this.sun = new THREE.DirectionalLight(setup.sunColor, setup.sunIntensity);
    this.sunDir.copy(setup.sunDir).normalize();
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(this.renderer.quality === 'high' ? 2048 : 1024, this.renderer.quality === 'high' ? 2048 : 1024);
    sh.camera.left = -42; sh.camera.right = 42; sh.camera.top = 42; sh.camera.bottom = -42; sh.camera.near = 1; sh.camera.far = 220;
    sh.bias = -0.0006; sh.normalBias = 0.04;
    sc.add(this.sun, this.sun.target);
    sc.environment = makeEnv(this.renderer.renderer, setup.sky);
    sc.environmentIntensity = setup.envIntensity;
    this.renderer.renderer.toneMappingExposure = setup.exposure;
    const u = this.renderer.uniforms;
    (u.uShadow.value as THREE.Color).setRGB(...setup.tintShadow);
    (u.uHigh.value as THREE.Color).setRGB(...setup.tintHigh);
    this.fx = new FX(sc);
    this.setupLampPool();
    this.weather = new Weather(sc, setup.weather, setup.weather === 'rain' ? 2200 : 900);
    sc.add(this.heli.group);
    sc.add(this.viewmodelDummy);
  }
  private viewmodelDummy = new THREE.Object3D();

  private loadMenuScene() {
    this.mission = new Mission1();
    this.buildScene(this.mission);
    this.hud.show(false);
    this.touch.show(false);
    this.state = 'menu';
    audio.intensity = 0.05;
  }

  toMenu() {
    this.input.exitLock();
    this.hud.show(false); this.touch.show(false); this.hud.clearRadio(); this.hud.bossBar(-1, ''); this.hud.setPaused(false);
    this.hud.fade(0, 200);
    this.menus.hide();
    this.loadMenuScene();
    this.menus.title();
    this.timeScale = 1;
  }

  startMission(id: number, loadout: WeaponId[], cp: number) {
    this.menus.loading('LOADING MISSION');
    this.state = 'loading';
    this.input.exitLock();
    this.hud.fade(1, 100);
    audio.init();
    setTimeout(() => {
      this.missionId = id; this.loadout = loadout; this.cp = cp;
      this.mission = id === 1 ? new Mission1() : new Mission2();
      this.buildScene(this.mission);
      const st = this.mission.startFor(cp);
      this.player.reset(st.x, st.z, st.yaw);
      this.stats = { shots: 0, hits: 0, headshots: 0, kills: 0, damageTaken: 0, score: 0, relays: 0 };
      this.missionTime = 0; this.time = 0; this.completing = false; this.alertedOnce = false; this.timeScale = 1; this.slowT = 0;
      this.frozen = false; this.deathT = 0; this.suppressAmt = 0; this.hurtFlash = 0; this.shakeAmt = 0;
      this.weapons = new WeaponSystem(this, loadout);
      this.viewmodel.setWeapon(loadout[0]);
      this.mission.start(this, cp);
      this.hud.setWeapon(this.weapons.cw);
      this.hud.setHealth(100, 100);
      this.hud.show(true); this.touch.show(true); this.hud.setPaused(false);
      this.menus.hide();
      this.state = 'playing';
      this.hadLock = false;
      this.input.requestLock();
      this.hud.clearRadio();
      setTimeout(() => { if (this.state === 'playing' && !this.input.locked && !this.input.isTouch && !this.debug) this.pause(false); }, 700);
      this.hud.fade(0, 900);
      this.hud.banner(this.mission.text.intro[0], this.mission.text.intro[1], 4200);
      audio.startMusic();
      this.hud.cinematic(true);
      setTimeout(() => this.hud.cinematic(false), 4200);
      if (!this.input.isTouch && cp === 0) setTimeout(() => { if (this.state === 'playing') this.hud.flashMessage('WASD MOVE   MOUSE AIM   CLICK FIRE   R RELOAD   SHIFT SPRINT', 6000); }, 4500);
    }, 120);
  }

  pause(showMenu: boolean) {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hud.setPaused(true);
    this.input.exitLock();
    if (showMenu) { this.screenIsClick2Play = false; this.menus.pause(); }
    else { this.screenIsClick2Play = true; this.menus.click2play(); }
  }

  resume() {
    if (this.state !== 'paused') return;
    this.menus.hide();
    this.hud.setPaused(false);
    this.screenIsClick2Play = false;
    this.state = 'playing';
    this.input.requestLock();
  }

  // ------------------------------------------------------------------ mission API
  spawnEnemy(type: EnemyType, x: number, z: number, zone: number, alerted = false): Enemy {
    let pos = new THREE.Vector3(x, 0, z);
    if (this.level.nav.isBlockedAt(x, z)) pos = this.level.nav.randomOpenNear(pos, 5, 30);
    const yaw = Math.atan2(this.player.pos.x - pos.x, this.player.pos.z - pos.z);
    const e = new Enemy(type, pos.x, pos.z, zone, this.difficulty, yaw);
    this.enemies.push(e);
    this.scene.add(e.rig.root);
    if (alerted) e.becomeAware(this, 0);
    return e;
  }
  spawnEnemyAt(s: Spawn, alerted = false): Enemy {
    const e = this.spawnEnemy(s.type, s.x, s.z, s.zone, alerted);
    if (s.yaw !== undefined) e.yaw = s.yaw;
    if (s.patrol) e.patrol = s.patrol.map(([x, z]) => new THREE.Vector3(x, 0, z));
    return e;
  }
  addRelay(x: number, z: number, id: number) { const r = new Relay(x, z, id, this); this.relays.push(r); return r; }
  addBarrel(x: number, z: number) {
    if (this.level.nav.isBlockedAt(x, z)) return;
    this.barrels.push(new Barrel(x, z, this));
  }
  addAmmo(x: number, z: number) {
    if (this.level.nav.isBlockedAt(x, z)) return;
    this.ammoCrates.push(new AmmoCrate(new THREE.Vector3(x, 0, z), this));
  }
  addWreck(x: number, z: number) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 3), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 }));
    m.position.set(x, 0.45, z); this.scene.add(m);
    this.burning.push({ pos: new THREE.Vector3(x, 1, z), t: 1e9 });
  }
  addFire(x: number, z: number) { this.burning.push({ pos: new THREE.Vector3(x, 0.4, z), t: 1e9 }); }
  setObjectives(l: { text: string; done: boolean }[]) { this.hud.setObjectives(l); }
  setMarker(p: THREE.Vector3 | null) { this.marker = p; }
  radio(lines: RadioLine[], delay = 0) {
    const tk = this.token;
    setTimeout(() => { if (tk === this.token && (this.state === 'playing' || this.state === 'paused')) for (const l of lines) this.hud.radio(l.who, l.text, 0, () => {}); }, delay * 1000);
  }
  banner(t: string, s: string) { this.hud.banner(t, s); }
  saveCheckpoint(i: number) {
    if (i > this.cp) { this.cp = i; this.hud.flashMessage('CHECKPOINT', 1800); }
  }
  setMusic(v: number) { this.musicBoost = Math.max(this.musicBoost, v); }
  shake(a: number) { this.shakeAmt = Math.min(1.5, this.shakeAmt + a); }
  slowMo(scale: number, dur: number) { this.slowTarget = scale; this.slowT = dur; }
  setBossBar(f: number, name: string) { this.hud.bossBar(f, name); }
  bossIntro(boss: Enemy) {
    boss.becomeAware(this, 0.4);
    this.hud.banner('COLONEL VOSS', 'HIGH VALUE TARGET', 3800);
    this.shake(0.6);
  }
  onRelayDestroyed(r: Relay) { this.mission.onRelayDestroyed?.(r, this); }

  completeMission(delay: number, ending = false) {
    if (this.completing) return;
    this.completing = true;
    const tk = this.token;
    setTimeout(() => {
      if (this.state !== 'playing' || tk !== this.token) return;
      this.frozen = true;
      this.hud.fade(1, 1400);
      setTimeout(() => { if (tk === this.token) this.showResults(ending); }, 1500);
    }, delay * 1000);
  }

  private showResults(ending: boolean) {
    this.state = 'complete';
    this.input.exitLock();
    this.hud.show(false); this.touch.show(false); this.hud.clearRadio(); this.hud.bossBar(-1, '');
    const s = this.stats, t = this.missionTime;
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    const par = PAR_TIME[this.missionId] ?? 800;
    const tf = clamp(par / Math.max(60, t), 0, 1);
    const af = clamp(acc / 45, 0, 1);
    const df = clamp(s.damageTaken / 450, 0, 1);
    const hf = clamp(s.headshots / Math.max(1, s.kills) / 0.3, 0, 1);
    const rating = (0.3 * tf + 0.3 * af + 0.25 * (1 - df) + 0.15 * hf) * (1 + 0.06 * (this.difficulty - 1));
    const grade = rating >= 0.82 ? 'S' : rating >= 0.66 ? 'A' : rating >= 0.5 ? 'B' : rating >= 0.35 ? 'C' : 'D';
    const score = Math.round(s.score + Math.max(0, par - t) * 4 + acc * 10) * (1 + this.difficulty * 0.25) | 0;
    const key = `m${this.missionId}-${this.difficulty}`;
    const prev = this.save.records[key];
    const newBest = !prev || score > prev.bestScore;
    this.save.records[key] = {
      bestTime: prev ? Math.min(prev.bestTime, t) : t,
      bestScore: prev ? Math.max(prev.bestScore, score) : score,
      bestGrade: !prev || 'SABCD'.indexOf(grade) < 'SABCD'.indexOf(prev.bestGrade) ? grade : prev.bestGrade,
      completed: true,
    };
    this.save.unlocked = Math.max(this.save.unlocked, this.missionId + 1);
    writeSave(this.save);
    const res: Results = { missionId: this.missionId, time: t, kills: s.kills, accuracy: acc, headshots: s.headshots, damage: s.damageTaken, score, grade, newBest, hasNext: this.missionId < 2 };
    this.menus.hide();
    audio.intensity = 0.1;
    if (ending) this.menus.endCard(() => this.menus.results(res)); else this.menus.results(res);
    this.hud.fade(0, 300);
  }

  // ------------------------------------------------------------------ GameCtx
  panFor(pos: THREE.Vector3) {
    const dx = pos.x - this.player.pos.x, dz = pos.z - this.player.pos.z;
    const rx = Math.cos(this.player.yaw), rz = -Math.sin(this.player.yaw);
    return clamp((dx * rx + dz * rz) / (Math.hypot(dx, dz) + 4), -1, 1);
  }
  suppress(a: number) { this.suppressAmt = Math.min(1, this.suppressAmt + a); this.player.shake = Math.min(1, this.player.shake + a * 0.5); }
  bossEvent(name: string) { this.mission.onBossEvent?.(name, this); this.hud.banner(name === 'phase2' ? 'REINFORCEMENTS' : 'ENRAGED', 'VOSS', 2200); }
  hasLOS(a: THREE.Vector3, b: THREE.Vector3) { return lineOfSight(a, b, this.level.colliders); }

  alertNear(pos: THREE.Vector3, radius: number, delay: number) {
    for (const e of this.enemies) {
      if (e.dead || e.aware) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < radius) e.hear(this, pos, delay + Math.random() * 0.6);
    }
    if (!this.alertedOnce) { this.alertedOnce = true; this.mission.onAlert?.(this); }
    this.lastCombat = this.time;
  }
  alertNoiseAt(pos: THREE.Vector3, radius: number) {
    const r = radius * (this.player.crouch > 0.5 ? 0.8 : 1);
    for (const e of this.enemies) {
      if (e.dead || e.aware) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < r) e.hear(this, pos, 0.3 + d / 90 + Math.random() * 0.5);
    }
  }

  damagePlayer(amount: number, from: THREE.Vector3) {
    const p = this.player;
    if (!p.alive || this.god || this.frozen) return;
    p.health -= amount;
    this.stats.damageTaken += amount;
    p.lastHurt = this.time;
    this.hurtFlash = Math.min(1, this.hurtFlash + amount / 40);
    this.shake(0.12 + amount / 80);
    audio.hurt(this.panFor(from));
    const bearing = Math.atan2(from.x - p.pos.x, -(from.z - p.pos.z));
    this.hud.damageIndicator(angleDiff(-p.yaw, bearing));
    this.lastCombat = this.time;
    if (p.health <= 0) this.killPlayer();
  }

  private killPlayer() {
    const p = this.player;
    p.health = 0; p.alive = false;
    this.state = 'dead';
    this.deathT = 0;
    this.input.exitLock();
    audio.fail();
    this.hud.clearRadio(); this.hud.bossBar(-1, '');
    audio.intensity = 0;
    setTimeout(() => { this.hud.fade(1, 900); }, 1300);
    setTimeout(() => { if (this.state === 'dead') { this.hud.show(false); this.touch.show(false); this.menus.gameOver(this.cp > 0); } }, 2300);
  }

  throwGrenade(from: THREE.Vector3, target: THREE.Vector3) { this.grenades.push(new Grenade(from, target, this)); }

  enemyKilled(e: Enemy, head: boolean) {
    this.stats.kills++;
    if (head) this.stats.headshots++;
    this.stats.score += e.def.score + (head ? 50 : 0);
    this.hud.killFeed(`${head ? 'HEADSHOT  ' : ''}${e.def.name.toUpperCase()}  +${e.def.score}`);
    this.mission.onEnemyKilled?.(e, this);
    // limit corpses
    const dead = this.enemies.filter((x) => x.dead);
    if (dead.length > 14) {
      const old = dead[0];
      this.scene.remove(old.rig.root);
      this.enemies.splice(this.enemies.indexOf(old), 1);
    }
    if (Math.random() < 0.18 && e.type !== 'boss') {
      const p = e.pos;
      if (!this.level.nav.isBlockedAt(p.x, p.z)) this.addAmmo(p.x, p.z);
    }
  }

  areaDamage(pos: THREE.Vector3, radius: number, enemyDmg: number, playerDmg: number, hitsRelays: boolean) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const c = e.chestPos(new THREE.Vector3());
      const d = c.distanceTo(pos);
      if (d < radius) {
        const f = 1 - d / radius;
        const dir = c.clone().sub(pos).normalize();
        const killed = e.takeDamage(enemyDmg * f, false, c, dir, this);
        if (killed) { e.deathVel.copy(dir).setY(0).multiplyScalar(6); this.hud.hitMarker(false, true); } else if (e.aware === false) e.becomeAware(this, 0.2);
      }
    }
    if (playerDmg > 0) {
      const d = this.player.eye(new THREE.Vector3()).distanceTo(pos);
      if (d < radius && lineOfSight(pos, this.player.eye(new THREE.Vector3()), this.level.colliders)) this.damagePlayer(playerDmg * (1 - d / radius), pos);
    }
    if (hitsRelays) for (const r of this.relays) if (!r.destroyed && r.pos.distanceTo(pos) < radius + 2) r.damage(180 * (1 - Math.min(1, r.pos.distanceTo(pos) / (radius + 2))), this);
  }

  chainBarrels(pos: THREE.Vector3, r: number) {
    for (const b of this.barrels) if (!b.destroyed && b.pos.distanceTo(pos) < r) b.damage(999, this);
  }

  // ------------------------------------------------------------------ shooting
  fireRay(def: WeaponDef, origin: THREE.Vector3, dir: THREE.Vector3, muzzle: THREE.Vector3, idx: number) {
    const hit: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), kind: 'concrete' };
    const hitWorld = raycastWorld(origin, dir, def.range, this.level.colliders, hit);
    let tmax = hitWorld ? hit.dist : def.range;
    let best: { e: Enemy; dist: number; head: boolean } | null = null;
    for (const e of this.enemies) {
      const h = e.rayHit(origin, dir, tmax);
      if (h && (!best || h.dist < best.dist)) best = { e, dist: h.dist, head: h.head };
    }
    const falloff = (d: number) => (def.falloffEnd > def.falloffStart + 1 ? lerp(1, 0.5, clamp((d - def.falloffStart) / (def.falloffEnd - def.falloffStart), 0, 1)) : 1);
    let endPoint: THREE.Vector3;
    if (best) {
      tmax = best.dist;
      endPoint = origin.clone().addScaledVector(dir, best.dist);
      if (this.lastHitShot !== this.stats.shots) { this.stats.hits++; this.lastHitShot = this.stats.shots; }
      const killed = best.e.takeDamage(def.damage * falloff(best.dist), best.head, endPoint, dir, this, def.headMult);
      this.hud.hitMarker(best.head, killed);
      this.lastCombat = this.time;
    } else if (hitWorld) {
      endPoint = hit.point.clone();
      const owner = hit.box?.owner as { damage?: (a: number, g: Game) => void } | undefined;
      if (owner?.damage) {
        owner.damage(def.damage * falloff(hit.dist) * (def.pellets > 1 ? 1 : 1), this);
        this.fx.impact(hit.point, hit.normal, 'metal');
        if (this.lastHitShot !== this.stats.shots) { this.stats.hits++; this.lastHitShot = this.stats.shots; }
        this.hud.hitMarker(false, false);
      } else {
        this.fx.impact(hit.point, hit.normal, hit.kind);
        this.fx.bulletHole(hit.point, hit.normal);
      }
    } else endPoint = origin.clone().addScaledVector(dir, 200);
    if (idx < 3) this.fx.tracer(muzzle, endPoint, def.tracer, def.id === 'longbow' ? 0.02 : 0.011, def.id === 'longbow' ? 0.14 : 0.07);
  }

  meleeAttack() {
    const p = this.player;
    if (!p.alive) return;
    const o = p.eye(new THREE.Vector3()), d = p.lookDir(new THREE.Vector3());
    let best: { e: Enemy; dist: number; head: boolean } | null = null;
    for (const e of this.enemies) {
      const h = e.rayHit(o, d, 2.6);
      if (h && (!best || h.dist < best.dist)) best = { e, dist: h.dist, head: h.head };
    }
    if (best) {
      const pt = o.clone().addScaledVector(d, best.dist);
      const killed = best.e.takeDamage(125, best.head, pt, d, this, 3);
      this.hud.hitMarker(best.head, killed);
      audio.click(300, 0.12, 0.8);
      this.stats.shots++; this.stats.hits++;
      this.alertNoiseAt(p.pos, 8);
    }
  }

  // ------------------------------------------------------------------ main loop
  private loop(now: number) {
    requestAnimationFrame((t) => this.loop(t));
    const real = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.fpsAcc += real; this.fpsN++;
    if (this.fpsAcc > 0.5) {
      if (this.debug) this.hud.setFps(`${Math.round(this.fpsN / this.fpsAcc)} fps  state:${this.state}  enemies:${this.enemies.filter((e) => !e.dead).length}  pr:${this.renderer.pixelRatio.toFixed(2)}`);
      this.fpsAcc = 0; this.fpsN = 0;
    }
    // slow motion
    if (this.slowT > 0) { this.slowT -= real; this.timeScale = damp(this.timeScale, this.slowTarget, 8, real); if (this.slowT <= 0) this.slowTarget = 1; }
    else this.timeScale = damp(this.timeScale, 1, 4, real);
    const dt = real * this.timeScale;

    if (this.state === 'playing' || this.state === 'dead') this.updateGame(dt, real);
    else if (this.state === 'menu' || this.state === 'loading') this.updateMenu(real);
    else if (this.state === 'paused') { /* frozen */ }
    pointScale.value = (this.renderer.renderer.domElement.height / 2) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.renderer.render(real, performance.now() / 1000);
    this.input.endFrame();
  }

  private updateMenu(dt: number) {
    this.menuAngle += dt * 0.07;
    const cx = 0, cz = 8, R = 48;
    const a = -Math.PI / 2 + Math.sin(this.menuAngle * 0.8) * 0.9;
    this.camera.position.set(cx + Math.cos(a) * R, 7 + Math.sin(this.menuAngle * 1.3) * 1.5, cz - Math.sin(a) * R * 0.9);
    this.camera.lookAt(cx, 4, cz - 14);
    this.camera.fov = 55; this.camera.updateProjectionMatrix();
    this.sun.position.copy(this.camera.position).addScaledVector(this.sunDir, 80); this.sun.target.position.set(cx, 0, cz - 10);
    this.weather?.update(performance.now() / 1000, this.camera.position);
    this.fx.update(dt);
    // show hands off
    this.viewmodel.root.visible = false;
  }

  private updateGame(dt: number, real: number) {
    const p = this.player;
    const inp = this.input;
    this.viewmodel.root.visible = true;
    this.time += dt;
    if (this.state === 'playing' && !this.frozen) this.missionTime += real;
    this.pathBudget = 3;
    const w = this.weapons;

    if (p.alive) w.update(dt);
    const def = w.def;
    const adsZoom = lerp(1, def.adsFov, w.ads);
    p.update(dt, inp, this.level.colliders, {
      speedMult: def.moveMult, ads: w.ads, firing: inp.fire && w.cw.mag > 0 && !w.reloading, sens: this.save.settings.sens, invertY: this.save.settings.invertY,
      adsZoom, frozen: this.frozen || !p.alive,
    }, this.time);

    // enemies
    for (const e of this.enemies) e.update(dt, this);
    if (p.alive) for (const e of this.enemies) {
      if (e.dead || Math.abs(e.pos.y - p.pos.y) > 1.5) continue;
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, min = p.radius + e.def.radius, d2 = dx * dx + dz * dz;
      if (d2 < min * min) { const d = Math.sqrt(d2) || 0.001; const push = min - d; moveFlat(p.pos, p.radius, (dx / d) * push, (dz / d) * push, this.level.colliders); }
    }
    for (const r of this.relays) r.update(dt, this.time, this);
    for (const b of this.barrels) b.update(dt, this);
    this.barrels = this.barrels.filter((b) => !b.destroyed);
    for (const g of this.grenades) g.update(dt, this);
    this.grenades = this.grenades.filter((g) => !g.done);
    for (const a of this.ammoCrates) {
      if (a.used) continue;
      a.update(this.time);
      if (p.alive && Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < 1.8 && Math.abs(p.pos.y - a.pos.y) < 2) {
        a.used = true; this.scene.remove(a.mesh);
        w.addAmmo(0.55); this.hud.setWeapon(w.cw); this.hud.flashMessage('AMMO RESTOCKED', 1300); audio.pickup();
      }
    }
    // fires
    for (const f of this.burning) {
      f.t -= dt;
      if (f.t > 0) {
        if (Math.random() < 0.7) this.fx.fire(f.pos.clone().add(new THREE.Vector3(rand(-0.3, 0.3), 0, rand(-0.3, 0.3))), 0.8);
        if (Math.random() < 0.25) this.fx.smoke(f.pos.clone().setY(f.pos.y + 0.8), 1.2, 2.4, 0x222222, 1.8);
      }
    }
    this.burning = this.burning.filter((f) => f.t > 0);
    this.heli.update(dt);
    this.fx.update(dt);
    this.mission.update(dt, this);

    // health regen
    if (p.alive && this.time - p.lastHurt > 4.5 && p.health < p.maxHealth) p.health = Math.min(p.maxHealth, p.health + 26 * dt);
    this.hud.setHealth(p.health, p.maxHealth);
    if (p.alive && p.health < 35) audio.heartbeat(dt * (1.4 + (35 - p.health) / 20));

    // camera
    const sprintFov = p.sprint * 6;
    const targetFov = (this.fov + sprintFov) * adsZoom;
    this.fovCur = damp(this.fovCur, targetFov, 18, real);
    this.camera.fov = this.fovCur; this.camera.updateProjectionMatrix();
    this.shakeAmt = damp(this.shakeAmt, 0, 4, real);
    p.shake = Math.max(p.shake, this.shakeAmt);
    p.applyCamera(this.camera, this.time);
    if (this.state === 'dead') {
      this.deathT += real;
      const k = Math.min(1, this.deathT / 0.9);
      this.camera.position.y = lerp(p.pos.y + p.eyeHeight, p.pos.y + 0.25, k);
      this.camera.rotation.z = k * 0.9; this.camera.rotation.x = lerp(this.camera.rotation.x, -0.3, k);
    }
    if (p.alive) {
      this.viewmodel.update(dt, {
        ads: w.ads, sprint: p.sprint, moveAmt: p.moveAmt, bobPhase: p.bobPhase, lookDX: inp.mouseDX + inp.lookDX, lookDY: inp.mouseDY + inp.lookDY,
        reloadT: w.reloadT, equipT: w.equipT, grounded: p.grounded, landKick: p.landKick,
      }, this.camera.aspect, false);
    }
    this.viewmodel.root.visible = p.alive;
    this.viewmodel.camera.fov = 58 / (1 + (adsZoom < 1 ? (1 - adsZoom) * 0.15 : 0));

    // hud
    const crossGap = (Math.tan(w.spread) * (window.innerHeight / 2)) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.hud.setCrosshair(crossGap, w.ads, def.scope);
    let mb: number | null = null, md = 0;
    if (this.marker) { mb = Math.atan2(this.marker.x - p.pos.x, -(this.marker.z - p.pos.z)); md = Math.hypot(this.marker.x - p.pos.x, this.marker.z - p.pos.z); }
    this.hud.updateCompass(p.yaw, mb, md);

    // post uniforms
    this.hurtFlash = damp(this.hurtFlash, 0, 2.2, real);
    this.suppressAmt = damp(this.suppressAmt, 0, 1.6, real);
    const lowHp = clamp(1 - p.health / 40, 0, 1);
    const u = this.renderer.uniforms;
    u.uHurt.value = clamp(this.hurtFlash * 0.7 + lowHp * (0.25 + 0.15 * Math.sin(this.time * 6)), 0, 1);
    u.uDesat.value = lowHp * 0.6 + this.suppressAmt * 0.3 + (this.state === 'dead' ? this.deathT * 0.5 : 0);
    u.uVig.value = 0.5 + this.suppressAmt * 0.3 + p.sprint * 0.1;
    u.uFlash.value = 0;

    // lighting follow
    this.sun.position.copy(p.pos).addScaledVector(this.sunDir, 90);
    this.sun.target.position.copy(p.pos);
    this.sun.target.updateMatrixWorld();
    this.updateLamps(real);
    this.weather?.update(this.time + performance.now() / 5000, this.camera.position);

    // music
    let combat = 0.12;
    let alerted = 0;
    for (const e of this.enemies) if (!e.dead && e.aware && e.pos.distanceTo(p.pos) < 45) alerted++;
    if (alerted > 0) combat = Math.min(1, 0.55 + alerted * 0.07);
    this.musicBoost = Math.max(0, this.musicBoost - real * 0.04);
    audio.intensity = Math.max(combat, this.musicBoost * 0.8);
  }

  private updateLamps(dt: number) {
    const lamps = this.level.lamps;
    this.lampTimer -= dt;
    const pos = this.camera.position;
    if (this.lampTimer <= 0) {
      this.lampTimer = 0.4;
      const scored = lamps.map((l, i) => ({ i, d: l.pos.distanceToSquared(pos) })).sort((a, b) => a.d - b.d);
      for (let k = 0; k < this.lampLights.length; k++) this.lampAssign[k] = scored[k] ? scored[k].i : -1;
    }
    for (let k = 0; k < this.lampLights.length; k++) {
      const li = this.lampAssign[k], light = this.lampLights[k];
      if (li < 0 || !lamps[li]) { light.intensity = 0; continue; }
      const l = lamps[li];
      light.position.copy(l.pos); light.color.setHex(l.color);
      const fl = l.flicker ? (Math.sin(this.time * 31 + li) > 0.6 || Math.sin(this.time * 7 + li * 3) > 0.92 ? 0.3 : 1) : 1;
      light.intensity = damp(light.intensity, this.setup.lampIntensity * l.intensity * fl, 12, dt);
    }
  }

  get fmt() { return fmtTime; }
}
