import * as THREE from 'three';
import { audio } from '../../engine/audio';
import { LevelBuilder } from '../level/builder';
import { makeSky } from '../level/sky';
import { LINES, MISSIONS } from '../../story/story';
import type { Game } from '../game';
import type { Enemy } from '../enemies/enemy';
import type { Mission, Spawn, Start, LevelSetup } from './mission';

const C = { wall: 0x7a6f66, brick: 0x6e4a3c, dark: 0x3c3f42, rust: 0x8a3b2a, green: 0x3f4c38, blue: 0x2f4a62, tan: 0x8a7d5c, conc: 0x6f706c, yellow: 0xb89a2a };

const SPAWNS: Spawn[] = [
  { type: 'grunt', zone: 0, x: -6, z: 38 }, { type: 'grunt', zone: 0, x: 6, z: 40 }, { type: 'grunt', zone: 0, x: 0, z: 30 },
  { type: 'grunt', zone: 0, x: -8, z: 24 }, { type: 'grunt', zone: 0, x: 8, z: 26 }, { type: 'grunt', zone: 0, x: -14, z: 40 }, { type: 'grunt', zone: 0, x: 14, z: 36 },
  { type: 'heavy', zone: 0, x: 0, z: 13 },
  { type: 'grunt', zone: 1, x: -20, z: 0 }, { type: 'grunt', zone: 1, x: 18, z: 2 }, { type: 'grunt', zone: 1, x: -30, z: -12 }, { type: 'grunt', zone: 1, x: 30, z: -14 },
  { type: 'grunt', zone: 1, x: 0, z: -4 }, { type: 'grunt', zone: 1, x: -12, z: -24 }, { type: 'grunt', zone: 1, x: 14, z: -24 },
  { type: 'rusher', zone: 1, x: -38, z: -4 }, { type: 'rusher', zone: 1, x: 36, z: -6 }, { type: 'rusher', zone: 1, x: 0, z: -26 },
  { type: 'heavy', zone: 1, x: 0, z: -18 },
  { type: 'grunt', zone: 2, x: -24, z: -44 }, { type: 'grunt', zone: 2, x: -10, z: -48 }, { type: 'grunt', zone: 2, x: 12, z: -46 },
  { type: 'grunt', zone: 2, x: 26, z: -52 }, { type: 'grunt', zone: 2, x: 0, z: -56 }, { type: 'grunt', zone: 2, x: -34, z: -56 }, { type: 'grunt', zone: 2, x: 36, z: -40 },
  { type: 'heavy', zone: 2, x: -28, z: -52 }, { type: 'heavy', zone: 2, x: 28, z: -46 },
  { type: 'rusher', zone: 2, x: 8, z: -58 },
  { type: 'boss', zone: 3, x: 0, z: -98, yaw: 0 },
  { type: 'grunt', zone: 3, x: -12, z: -92 }, { type: 'grunt', zone: 3, x: 12, z: -92 }, { type: 'grunt', zone: 3, x: -20, z: -80 }, { type: 'grunt', zone: 3, x: 20, z: -80 },
];

const STARTS: Start[] = [
  { x: 0, z: 52, yaw: 0 }, { x: 0, z: 8, yaw: 0 }, { x: 5, z: -29, yaw: 0 }, { x: 0, z: -64, yaw: 0 },
];

export class Mission2 implements Mission {
  text = MISSIONS[1];
  checkpoints = 4;
  musicIntensity = 0.15;
  private fired = new Set<string>();
  private boss: Enemy | null = null;
  private done = false;

  startFor(cp: number) { return STARTS[Math.min(cp, STARTS.length - 1)]; }

  buildLevel(): LevelSetup {
    const b = new LevelBuilder(23);
    const wallH = (x1: number, x2: number, z: number, h = 4, t = 1, color = C.wall) => b.box((x1 + x2) / 2, 0, z, Math.abs(x2 - x1), h, t, color);
    const wallV = (z1: number, z2: number, x: number, h = 4, t = 1, color = C.wall) => b.box(x, 0, (z1 + z2) / 2, t, h, Math.abs(z2 - z1), color);

    // ---- outer boundary walls
    wallV(-112, 62, -68, 6, 1.4, C.brick); wallV(-112, 62, 68, 6, 1.4, C.brick);
    wallH(-68, 68, 62, 6, 1.4, C.brick);

    // ---- zone 0: the street
    const brick = [C.brick, 0x7a5a46, 0x5c4338, C.wall];
    b.wallRect(-26, 40, 24, 16, 9, 0.6, [
      { side: 'e', at: -3, width: 2.4 }, { side: 'e', at: 5, width: 1.6, sill: 1.1, top: 2.3 }, { side: 's', at: 0, width: 2, sill: 1.1, top: 2.4 },
      { side: 'n', at: -6, width: 2.4 }, { side: 'e', at: 0, width: 1.6, sill: 3.4, top: 4.8 }, { side: 'e', at: -6, width: 1.6, sill: 3.4, top: 4.8 },
    ], brick[0], { roofColor: 0x2a2d30, mat: 'brick' });
    b.wallRect(-26, 14, 24, 18, 7, 0.6, [
      { side: 'e', at: 0, width: 2.4 }, { side: 'e', at: -6, width: 1.6, sill: 1.1, top: 2.3 }, { side: 'n', at: 4, width: 2.4 }, { side: 's', at: -5, width: 2.4 },
    ], brick[1], { roofColor: 0x2a2d30, mat: 'brick' });
    b.wallRect(26, 40, 24, 16, 10, 0.6, [
      { side: 'w', at: 2, width: 2.4 }, { side: 'w', at: -5, width: 1.6, sill: 1.1, top: 2.3 }, { side: 's', at: 4, width: 2, sill: 1.1, top: 2.4 }, { side: 'n', at: 0, width: 2.4 },
    ], brick[2], { roofColor: 0x2a2d30, mat: 'brick' });
    b.wallRect(26, 16, 24, 18, 8, 0.6, [
      { side: 'w', at: -2, width: 2.4 }, { side: 'w', at: 5, width: 1.6, sill: 1.1, top: 2.3 }, { side: 'n', at: -5, width: 2.4 }, { side: 's', at: 5, width: 2.4 },
    ], brick[3], { roofColor: 0x2a2d30, mat: 'brick' });
    b.crate(-30, 40, 1.2); b.crateStack(-22, 12); b.crateStack(30, 38); b.crate(24, 14, 1.2);
    b.lamp(-26, 7.5, 40, 0xffc890, 1, true); b.lamp(26, 8.5, 40, 0xffc890, 1, false); b.lamp(-26, 5.5, 14, 0xffc890, 1, true); b.lamp(26, 6.5, 16, 0xffc890, 1, false);
    b.car(-4, 46, false, 0x445566, true); b.car(5, 37, true, 0x445566, true); b.car(-6, 29, false, 0x445566, true); b.car(2, 22, true, 0x445566, true);
    b.barrier(0, 33, 4); b.barrier(-8, 26, 3, false); b.barrier(8, 28, 3, false);
    b.truck(-5, 18, true, 0x3a4535); b.sandbags(6, 18, 5); b.sandbags(-11, 20, 3, false);
    b.crateStack(-8, 44); b.sandbags(8, 46, 4);
    b.lampPost(-11.5, 46, 0xffc890, 0.6); b.lampPost(11.5, 30, 0xffc890, 0.6, true); b.lampPost(-11.5, 10, 0xffc890, 0.6);
    for (let z = 58; z > 12; z -= 6) b.deco(0, 0, z, 0.2, 0.03, 2.4, 0xc8c8a0);
    b.container(-9, 52, false, C.rust); b.container(10, 54, false, C.blue);

    // ---- zone 1: market plaza
    b.wallRect(-56, -14, 14, 26, 9, 0.6, [{ side: 'e', at: -4, width: 2.6 }, { side: 'e', at: 6, width: 2.6 }, { side: 'n', at: 0, width: 2 }], brick[1], { roofColor: 0x2a2d30, mat: 'brick' });
    b.wallRect(56, -10, 14, 28, 9, 0.6, [{ side: 'w', at: -4, width: 2.6 }, { side: 'w', at: 6, width: 2.6 }, { side: 's', at: 0, width: 2 }], brick[0], { roofColor: 0x2a2d30, mat: 'brick' });
    b.box(0, 0, -12, 14, 1.2, 14, 0x5c5f60); b.box(0, 1.2, -12, 4, 2.2, 4, 0x6a6d6e); b.box(0, 3.4, -12, 2, 1, 2, 0x555a5e);
    for (const [x, z, c] of [[-24, -2, 0x8a3b2a], [24, 0, 0x2f4a62], [-30, -20, 0x3f4c38], [30, -22, 0x8a7d5c], [-14, -26, 0x2f4a62], [16, -28, 0x8a3b2a], [-36, 6, 0x8a7d5c], [38, 8, 0x3f4c38]] as [number, number, number][]) {
      b.box(x, 0, z, 3.2, 1.0, 1.6, 0x4a4036, { kind: 'wood' });
      b.box(x, 2.2, z, 3.6, 0.1, 2.2, c, { collide: false });
      b.deco(x - 1.6, 1.0, z - 0.8, 0.1, 1.3, 0.1, 0x222222); b.deco(x + 1.6, 1.0, z + 0.8, 0.1, 1.3, 0.1, 0x222222);
    }
    b.container(-40, 10, true, C.rust); b.container(40, 14, true, C.green); b.container(-44, -34, true, C.blue); b.container(44, -32, true, C.rust);
    b.car(-18, 10, true, 0x445566, true); b.car(20, 8, false, 0x445566, true); b.truck(-4, -30, true, 0x3a4535);
    b.sandbags(-14, -8, 4); b.sandbags(14, -4, 4); b.barrier(-24, -12, 4, false); b.barrier(24, -14, 4, false);
    b.crateStack(-8, 2); b.crateStack(10, -22);
    b.lampPost(-20, -6, 0xffc890, 0.6); b.lampPost(20, -18, 0xffc890, 0.6, true); b.lampPost(0, 6, 0xffc890, 0.6);
    b.textSign(-48.35, 6.2, -14, 6, 1.5, 'MARKET', '#ffb347', Math.PI / 2, 'OPEN AIR');
    b.textSign(48.35, 6.2, -10, 6, 1.5, 'FISH & TRADE', '#7fe0ff', -Math.PI / 2);

    // ---- zone 2: warehouse yard
    wallH(-68, -7, -36, 4.5, 1.2, C.conc); wallH(7, 68, -36, 4.5, 1.2, C.conc);
    b.box(-5.5, 0, -36, 3, 2.4, 2, 0x3a3f42, { metal: true });
    b.truck(4.5, -36.2, false, 0x2e3a2d);
    b.textSign(0, 5.4, -35.3, 12, 1.8, 'LOADING BAY', '#ff6a3a', 0, 'HARBOR DISTRICT  /  KEEP CLEAR');
    b.container(-44, -44, true, C.rust); b.container(-44, -49.2, true, C.blue); b.container(-18, -42, false, C.green); b.container(18, -44, false, C.rust);
    b.container(38, -44, true, C.blue, true); b.container(40, -56, true, C.green); b.container(-38, -60, true, C.rust, true); b.container(14, -58, true, C.blue);
    b.box(-30, 0, -52, 14, 3, 8, 0x4a4e50, { metal: true }); b.stairs(-37.5, -52, 'w', 9, 3.4, 0.33, 0.55, 0x5a5f63);
    b.box(30, 0, -50, 12, 2.6, 8, 0x4a4e50, { metal: true }); b.stairs(36.5, -50, 'e', 8, 3.4, 0.33, 0.55, 0x5a5f63);
    b.crateStack(-6, -44); b.crateStack(6, -50); b.crate(0, -56, 1.3); b.crateStack(-20, -58); b.sandbags(0, -42, 5); b.sandbags(-12, -52, 4, false); b.sandbags(14, -52, 4, false);
    b.lamp(-30, 4.5, -52, 0xffc890, 1, true); b.lamp(30, 4, -50, 0xffc890, 1, false);
    b.lampPost(-6, -46, 0xffc890, 0.8); b.lampPost(10, -40, 0xffc890, 0.8, true); b.lampPost(0, -62, 0xffc890, 0.8);

    // ---- boss arena warehouse
    b.wallRect(0, -88, 60, 44, 13, 0.9, [
      { side: 's', at: 0, width: 8, top: 5.4 },
      { side: 's', at: -22, width: 3, sill: 7, top: 9 }, { side: 's', at: 22, width: 3, sill: 7, top: 9 },
      { side: 'e', at: -10, width: 3, sill: 7, top: 9 }, { side: 'e', at: 8, width: 3, sill: 7, top: 9 },
      { side: 'w', at: -10, width: 3, sill: 7, top: 9 }, { side: 'w', at: 8, width: 3, sill: 7, top: 9 },
      { side: 'n', at: -16, width: 3, sill: 7, top: 9 }, { side: 'n', at: 16, width: 3, sill: 7, top: 9 },
    ], 0x4e5254, { roofColor: 0x222426 });
    for (const [x, z] of [[-14, -80], [14, -80], [-14, -98], [14, -98]]) b.box(x, 0, z, 2.2, 13, 2.2, 0x44484a, { metal: true });
    for (const [x, z] of [[-24, -76], [24, -76], [-24, -100], [24, -100], [0, -90]]) b.crateStack(x - 1, z);
    b.container(-24, -90, false, C.rust); b.container(24, -90, false, C.green);
    b.box(0, 0, -98, 12, 0.8, 8, 0x2a2e30, { metal: true });
    b.glowBox(-6, 0.8, -98, 0.2, 0.05, 8, 0xff2a1a, 2.5); b.glowBox(6, 0.8, -98, 0.2, 0.05, 8, 0xff2a1a, 2.5);
    for (const x of [-20, 0, 20]) for (const z of [-76, -92]) b.lamp(x, 12, z, 0xffd9b0, 1.6, Math.abs(x) === 20);
    for (const x of [-27, 27]) for (let z = -76; z > -102; z -= 8) b.glowBox(x, 9, z, 0.15, 0.4, 2.5, 0xff2a1a, 2.4);
    b.sandbags(-6, -74, 4); b.sandbags(6, -74, 4);
    b.textSign(0, 8.5, -65.45, 14, 2.2, 'HARBOR WAREHOUSE', '#ff5a4a', 0, 'AUTHORIZED PERSONNEL');
    b.textSign(-13.85, 5.0, 40, 6, 1.4, 'PHARMACY', '#7aff9a', Math.PI / 2);
    b.textSign(13.85, 5.0, 40, 6, 1.4, 'HOTEL', '#ff9ad0', -Math.PI / 2);
    b.textSign(-13.85, 4.2, 14, 6, 1.4, 'CAFE', '#ffd24a', Math.PI / 2);
    b.textSign(13.85, 4.8, 16, 6, 1.4, 'BANK', '#9ad0ff', -Math.PI / 2);
    for (const x of [-16, 16]) b.shaft(x, 8, -109.5, x - 14, 0, -102.5, 3.0, 0xffc890, 0.2);
    for (const z of [-98, -80]) b.shaft(29.6, 8, z, 15.6, 0, z + 7, 3.0, 0xffc890, 0.2);
    for (const x of [-22, 22]) b.shaft(x, 8, -66.3, x - 14, 0, -59.3, 3.0, 0xffc890, 0.14);

    const bounds = { minX: -66, maxX: 66, minZ: -110, maxZ: 60 };
    const level = b.build(bounds, 0x8a8782, 19);
    const sky = makeSky({ top: 0x2c4a7a, horizon: 0xf0986a, ground: 0x7a6254, sunDir: new THREE.Vector3(0.8, 0.28, -0.4), sunColor: 0xffa862, sunSize: 130, stars: false });
    return {
      level, fogColor: 0xa6806a, fogDensity: 0.010, exposure: 1.4,
      sunDir: new THREE.Vector3(0.8, 0.45, -0.4), sunColor: 0xffb070, sunIntensity: 3.4,
      hemiSky: 0xffd0a8, hemiGround: 0x7a6a60, hemiIntensity: 1.9, envIntensity: 1.1,
      sky, weather: 'ash', tintShadow: [0.9, 0.98, 1.1], tintHigh: [1.14, 1.0, 0.84], lampIntensity: 38,
    };
  }

  start(game: Game, cp: number) {
    this.fired.clear(); this.done = false; this.boss = null; this.cp = cp; this.started.clear(); this.cleared.clear();
    for (let k = 0; k < cp; k++) { this.started.add(k); this.cleared.add(k); }
    for (const [x, z] of [[-20, 30], [-6, 14], [12, 40], [-30, 8], [32, 6], [-10, -22], [20, -26], [-22, -46], [-14, -60], [20, -50], [0, -48], [30, -60], [-18, -84], [18, -84], [-6, -100]] as [number, number][]) game.addBarrel(x, z);
    for (const [x, z] of [[-9, 46], [-20, 8], [24, -6], [-10, -40], [14, -62], [-22, -70]] as [number, number][]) game.addAmmo(x, z);
    for (const [x, z] of [[-5, 36], [6, 22], [-2, 44]] as [number, number][]) game.addFire(x, z);
    game.setObjectives(this.objectives());
    game.setMarker(null);
    game.setMusic(0.2);
  }
  private cp = 0;
  private started = new Set<number>();
  private cleared = new Set<number>();

  begin(game: Game, cp: number) {
    if (cp === 0) game.radio(LINES.m2.start, 1.2);
    else game.radio([{ who: 'GHOST-2', text: 'Checkpoint reached. Stay sharp, Wraith.' }], 0.8);
    this.startZone(game, cp, cp === 0 ? 8 : 4);
  }

  private zoneWaves(zone: number): Spawn[][] {
    const L = SPAWNS.filter((s) => s.zone === zone);
    const g = L.filter((s) => s.type === 'grunt'), r = L.filter((s) => s.type === 'rusher'), h = L.filter((s) => s.type === 'heavy');
    if (zone === 3) {
      const rush: Spawn[] = [{ type: 'rusher', zone: 3, x: -12, z: -82 }, { type: 'rusher', zone: 3, x: 12, z: -82 }];
      return [g.slice(0, 2), [...g.slice(2), ...rush], L.filter((s) => s.type === 'boss')];
    }
    const w1 = g.slice(0, Math.min(3, Math.ceil(g.length * 0.4)));
    const w2 = [...g.slice(w1.length, w1.length + 3), ...r.slice(0, 1)];
    const w3 = [...h, ...r.slice(1), ...g.slice(w1.length + 3)].slice(0, 5);
    return [w1, w2, w3].filter((w) => w.length);
  }

  private startZone(game: Game, zone: number, delay: number) {
    this.started.add(zone);
    if (zone >= 1) game.saveCheckpoint(zone);
    game.setMarker(null);
    game.setObjectives(this.objectives());
    if (zone === 1) game.radio(LINES.m2.plaza);
    if (zone === 2) game.radio(LINES.m2.yard);
    if (zone === 3) { game.radio(LINES.m2.arena, 0.5); game.setMusic(0.7); }
    game.startWaves(zone, this.zoneWaves(zone), () => {
      this.cleared.add(zone);
      game.setObjectives(this.objectives());
      this.updateMarker(game);
    }, delay);
  }

  private objectives() {
    return [
      { text: 'Clear the street', done: this.cleared.has(0) },
      { text: 'Clear the market plaza', done: this.cleared.has(1) },
      { text: 'Clear the warehouse yard', done: this.cleared.has(2) },
      { text: 'Defeat Colonel Voss', done: this.done },
    ];
  }

  private updateMarker(game: Game) {
    if (game.wavesActive || this.done) { game.setMarker(null); return; }
    const next = [10, -32, -66].findIndex((_, i) => this.cleared.has(i) && !this.started.has(i + 1));
    if (next >= 0) game.setMarker(new THREE.Vector3(0, 0, [10, -32, -66][next]));
    else game.setMarker(null);
  }

  onAlert(game: Game) {
    this.once('alert', true, () => game.radio(LINES.m2.alert, 0.5));
    game.setMusic(0.8);
  }

  private once(key: string, cond: boolean, fn: () => void) {
    if (cond && !this.fired.has(key)) { this.fired.add(key); fn(); }
  }

  update(dt: number, game: Game) {
    const p = game.player.pos;
    if (game.time % 1 < dt) this.updateMarker(game);
    if (!game.wavesActive) {
      if (this.cleared.has(0) && !this.started.has(1) && p.z < 10) this.startZone(game, 1, 4);
      else if (this.cleared.has(1) && !this.started.has(2) && p.z < -30) this.startZone(game, 2, 4);
      else if (this.cleared.has(2) && !this.started.has(3) && p.z < -66 && Math.abs(p.x) < 6) this.startZone(game, 3, 5);
    }
    const b = game.enemies.find((e) => e.type === 'boss' && !e.dead);
    if (b && !this.boss) { this.boss = b; game.bossIntro(b); }
    if (this.boss && !this.boss.dead) game.setBossBar(this.boss.hp / this.boss.maxHp, this.boss.def.name);
  }

  onBossEvent(name: string, game: Game) {
    if (name === 'phase2') game.radio(LINES.m2.phase2, 0);
    if (name === 'phase3') game.radio(LINES.m2.phase3, 0);
    game.shake(0.8);
    audio.explosion(0.4, 40);
    game.setMusic(name === 'phase2' ? 0.85 : 1);
  }

  onEnemyKilled(e: Enemy, game: Game) {
    if (e.type === 'boss' && !this.done) {
      this.done = true;
      game.setBossBar(-1, '');
      game.setObjectives(this.objectives());
      game.slowMo(0.25, 2.6);
      game.banner('VOSS ELIMINATED', '');
      game.radio(LINES.m2.end, 2.5);
      game.completeMission(9, true);
    }
  }
}
