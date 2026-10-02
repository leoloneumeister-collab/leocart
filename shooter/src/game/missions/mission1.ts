import * as THREE from 'three';
import { audio } from '../../engine/audio';
import { LevelBuilder } from '../level/builder';
import { makeSky, makeSea } from '../level/sky';
import { LINES, MISSIONS } from '../../story/story';
import type { Game } from '../game';
import type { Relay } from '../objects';
import type { Mission, Spawn, Start, LevelSetup } from './mission';

const C = { wall: 0x777b7c, dark: 0x4a4e50, rust: 0x8a3b2a, green: 0x3f4c38, blue: 0x2f4a62, tan: 0x8a7d5c, yellow: 0xb89a2a, conc: 0x6b6f6a, tank: 0x7a7d7f };

const SPAWNS: Spawn[] = [
  // zone 0: outer yard
  { type: 'grunt', zone: 0, x: -7, z: 20, yaw: 0 }, { type: 'grunt', zone: 0, x: 8, z: 21, yaw: 0 },
  { type: 'grunt', zone: 0, x: -22, z: 10 }, { type: 'grunt', zone: 0, x: 22, z: 12 },
  { type: 'grunt', zone: 0, x: 0, z: 3 }, { type: 'grunt', zone: 0, x: -34, z: 20, patrol: [[-34, 20], [-18, 24], [10, 24]] },
  { type: 'grunt', zone: 0, x: -44, z: 0 }, { type: 'grunt', zone: 0, x: -52, z: 11 }, { type: 'grunt', zone: 0, x: -40, z: 8 },
  { type: 'grunt', zone: 0, x: 36, z: 16 },
  // zone 1: courtyard + warehouse
  { type: 'grunt', zone: 1, x: -14, z: -14 }, { type: 'grunt', zone: 1, x: 6, z: -18 }, { type: 'grunt', zone: 1, x: 18, z: -22 },
  { type: 'grunt', zone: 1, x: 32, z: -28 }, { type: 'grunt', zone: 1, x: -26, z: -22 }, { type: 'grunt', zone: 1, x: -40, z: -30 },
  { type: 'rusher', zone: 1, x: -36, z: -20 }, { type: 'rusher', zone: 1, x: -28, z: -34 },
  { type: 'heavy', zone: 1, x: 14, z: -32 },
  // zone 2: command yard
  { type: 'grunt', zone: 2, x: -12, z: -60 }, { type: 'grunt', zone: 2, x: 0, z: -62 }, { type: 'grunt', zone: 2, x: 12, z: -64 },
  { type: 'grunt', zone: 2, x: 26, z: -60 }, { type: 'grunt', zone: 2, x: 36, z: -78 }, { type: 'grunt', zone: 2, x: 24, z: -82 },
  { type: 'grunt', zone: 2, x: -22, z: -64, patrol: [[-22, -64], [-22, -80], [-8, -82]] },
  { type: 'heavy', zone: 2, x: 30, z: -64 },
  { type: 'rusher', zone: 2, x: 4, z: -82 }, { type: 'rusher', zone: 2, x: -8, z: -80 },
];

const WAVE: Spawn[] = [
  { type: 'grunt', zone: 3, x: -20, z: -52 }, { type: 'grunt', zone: 3, x: 0, z: -50 }, { type: 'grunt', zone: 3, x: 20, z: -52 },
  { type: 'grunt', zone: 3, x: 44, z: -56 }, { type: 'rusher', zone: 3, x: 10, z: -56 }, { type: 'rusher', zone: 3, x: -30, z: -54 },
  { type: 'rusher', zone: 3, x: 0, z: -58 },
];

const RELAYS: [number, number][] = [[-48, 6], [-32, -26], [34, -70]];
const LZ = new THREE.Vector3(-44, 0, -74);

/** Split a zone's enemies into 3 manageable waves: grunts first, then mixed, heavy last. */
function makeWaves(zone: number): Spawn[][] {
  const L = SPAWNS.filter((s) => s.zone === zone);
  const g = L.filter((s) => s.type === 'grunt'), r = L.filter((s) => s.type === 'rusher'), h = L.filter((s) => s.type === 'heavy');
  const w1 = g.slice(0, Math.min(3, Math.ceil(g.length * 0.4)));
  const w2 = [...g.slice(w1.length, w1.length + 3), ...r.slice(0, 1)];
  const w3 = [...h, ...r.slice(1), ...g.slice(w1.length + 3)].slice(0, 5);
  return [w1, w2, w3].filter((w) => w.length);
}
const ZONE_NAMES = ['OUTER YARD', 'COURTYARD', 'COMMAND YARD'];
const STARTS: Start[] = [
  { x: 0, z: 44, yaw: 0 }, { x: -34, z: 14, yaw: 0 }, { x: -10, z: -40, yaw: 0 }, { x: 20, z: -72, yaw: Math.PI * 0.5 },
];

export class Mission1 implements Mission {
  text = MISSIONS[0];
  checkpoints = 4;
  musicIntensity = 0.1;
  private fired = new Set<string>();
  private relaysDown = 0;
  private relays: Relay[] = [];
  private heliT = -1;
  private extractActive = false;
  private done = false;
  private beacon?: THREE.Mesh;

  startFor(cp: number) { return STARTS[Math.min(cp, STARTS.length - 1)]; }

  buildLevel(): LevelSetup {
    const b = new LevelBuilder(11);
    const wallH = (x1: number, x2: number, z: number, h = 4, t = 1, color = C.wall) => b.box((x1 + x2) / 2, 0, z, Math.abs(x2 - x1), h, t, color);
    const wallV = (z1: number, z2: number, x: number, h = 4, t = 1, color = C.wall) => b.box(x, 0, (z1 + z2) / 2, t, h, Math.abs(z2 - z1), color);

    // ---- perimeter
    wallH(-60, -5.5, 28); wallH(5.5, 60, 28); wallH(-60, 60, -90);
    wallV(-90, 3, -60); wallV(10, 28, -60); wallV(-90, 28, 60);
    for (let x = -56; x <= 56; x += 14) { if (Math.abs(x) > 8) b.lamp(x, 3.6, 27.2, 0xffb070, 0.8, false); }
    for (let z = -84; z <= 22; z += 18) { b.lamp(59.2, 3.6, z, 0xffb070, 0.8, false); }
    // gate
    for (const sx of [-1, 1]) {
      b.box(sx * 6.5, 0, 28, 2, 5.5, 2, C.dark);
      b.glowBox(sx * 6.5, 5.5, 28, 0.6, 0.3, 0.6, 0xff3030, 3);
    }
    b.box(-3, 0, 28, 5, 3.2, 0.3, C.dark, { metal: true });
    b.textSign(0, 4.6, 28.65, 7, 1.3, 'RESTRICTED AREA', '#ff6a3a', 0, 'AUTHORIZED PERSONNEL ONLY');
    b.textSign(0, 4.6, 27.35, 7, 1.3, 'RESTRICTED AREA', '#ff6a3a', Math.PI);
    b.wallRect(-14, 23, 6, 4, 3.2, 0.4, [{ side: 's', at: 0, width: 1.4 }, { side: 'e', at: 0, width: 1.6, sill: 1, top: 2.2 }], C.tan);
    b.wallRect(14, 23, 6, 4, 3.2, 0.4, [{ side: 's', at: 0, width: 1.4 }, { side: 'w', at: 0, width: 1.6, sill: 1, top: 2.2 }], C.tan);
    b.tower(-56, 22, 7); b.tower(56, 22, 7); b.tower(-56, -86, 7); b.tower(56, -86, 7);

    // ---- beach and approach
    const rng = b.rng;
    for (let i = 0; i < 26; i++) {
      const x = (rng() - 0.5) * 140, z = 34 + rng() * 40;
      if (Math.abs(x) < 9) continue;
      b.box(x, 0, z, 1 + rng() * 2.4, 0.6 + rng() * 1.4, 1 + rng() * 2.2, 0x4d4d48, { kind: 'concrete' });
    }
    b.deco(0, 0, 54, 8, 0.03, 52, 0x181a1d);
    for (let z = 76; z > 30; z -= 5) b.deco(0, 0.03, z, 0.18, 0.02, 2, 0x8a8a70);
    b.box(0, 0, 77, 10, 0.5, 10, 0x5a4a38, { kind: 'wood' });
    for (let i = -4; i <= 4; i += 2) b.deco(i, 0.5, 77, 0.1, 0.02, 10, 0x2a2118);
    b.box(-22, 0, 70, 3.2, 1.3, 9, C.blue, { metal: true }); b.box(-22, 1.3, 71.5, 2, 0.8, 3, 0xaaaaaa, { metal: true });
    b.box(20, 0, 66, 3, 1.1, 8, C.rust, { metal: true });
    b.crateStack(-11, 63); b.crateStack(12, 58);
    b.sandbags(-6, 46, 4); b.sandbags(6, 50, 4); b.sandbags(-5, 38, 3, false);
    b.lampPost(-7, 62, 0xffd9a0, 0.8); b.lampPost(7, 42, 0xffd9a0, 0.8, true);
    b.truck(-16, 36, true, 0x3d4a3a); b.car(14, 38, false, 0x445566);
    b.barrier(-6, 32, 3); b.barrier(7, 33, 3);
    b.lampPost(-8, 30, 0xffb070, 1); b.lampPost(8, 30, 0xffb070, 1);

    // ---- zone 0 outer yard
    b.container(-44, 20, true, C.rust); b.container(-44, 14.8, true, C.blue);
    b.container(-27, 8, false, C.green); b.container(30, 20, true, C.green); b.container(30, 14.8, true, C.rust);
    b.container(46, 20, true, C.blue, true); b.container(20, 4, false, C.rust);
    b.wallRect(42, 2, 22, 12, 4, 0.5, [
      { side: 'w', at: 0, width: 2.2 }, { side: 'n', at: -6, width: 2.2 }, { side: 's', at: 4, width: 2.2 },
      { side: 's', at: -5, width: 1.6, sill: 1.1, top: 2.3 }, { side: 'n', at: 5, width: 1.6, sill: 1.1, top: 2.3 },
    ], C.conc);
    b.lamp(42, 3.5, 2, 0xffd9a0, 0.9, true);
    b.crate(40, 3, 1.1); b.crate(45, 0, 1.2);
    b.barrier(-44, 11, 8); b.sandbags(-54, 7, 4, false); b.sandbags(-42, 0, 6);
    b.crateStack(-10, 12); b.crateStack(14, 14);
    b.barrier(-6, 14, 3); b.barrier(6, 10, 3); b.sandbags(0, 8, 4);
    b.lampPost(-16, 22, 0xffb070, 1); b.lampPost(16, 22, 0xffb070, 1); b.lampPost(0, 2, 0xffb070, 1, true);

    // ---- zone 1 courtyard + warehouse
    b.wallRect(-32, -26, 32, 20, 7, 0.6, [
      { side: 'e', at: -4, width: 4, top: 3.4 }, { side: 'w', at: 4, width: 4, top: 3.4 },
      { side: 's', at: -8, width: 3.5 }, { side: 's', at: 10, width: 1.6, sill: 1.1, top: 2.3 },
      { side: 'n', at: 0, width: 3 }, { side: 'n', at: -10, width: 1.6, sill: 1.1, top: 2.3 },
      { side: 's', at: 3, width: 1.6, sill: 3.2, top: 4.4 }, { side: 'n', at: 10, width: 1.6, sill: 3.2, top: 4.4 },
    ], 0x65696b, { roofColor: 0x2e3236 });
    b.textSign(-32, 5.4, -15.65, 8, 1.6, 'WAREHOUSE 3', '#ffd24a', 0, 'COMMUNICATIONS STORAGE');
    b.lamp(-32, 6.4, -26, 0xffe0b0, 1.6, true); b.lamp(-42, 6.4, -20, 0xffc890, 1.1, false); b.lamp(-24, 6.4, -34, 0xffc890, 1.1, true);
    b.crateStack(-42, -20); b.crateStack(-24, -33); b.crate(-38, -32, 1.3); b.crate(-26, -18, 1.1);
    b.container(-36, -36.5, true, C.blue);
    b.box(-32, 0, -26, 6, 0.3, 6, 0x2a2e30, { metal: true });
    for (const [x, z] of [[26, -12], [34, -12], [30, -19]]) b.box(x, 0, z, 6, 5, 6, C.tank, { metal: true });
    b.box(30, 5, -14, 1, 3, 1, 0x555a5e, { metal: true, collide: false });
    b.deco(30, 0.01, -12, 14, 0.04, 14, 0x1a1c1e);
    b.box(6, 0, -24, 10, 0.5, 6, 0x6a6d6e); b.sandbags(0, -16, 5); b.sandbags(14, -26, 4);
    b.container(30, -35, true, C.green); b.container(44, -30, false, C.rust); b.container(44, -40, false, C.blue);
    b.wallRect(46, -48, 16, 8, 4.5, 0.5, [{ side: 's', at: -3, width: 2.2 }, { side: 'w', at: 0, width: 2.2 }], C.conc);
    b.barrier(-10, -8, 4); b.barrier(8, -10, 4, false); b.crateStack(-16, -42);
    b.lampPost(-8, -12, 0xffb070, 1); b.lampPost(10, -34, 0xffb070, 1, true); b.lampPost(-4, -44, 0xffb070, 1);
    b.car(-4, -26, true, 0x2e3b2a); b.truck(20, -46, true, 0x32402f);

    // ---- zone 2 command yard
    b.wallRect(-5, -72, 38, 14, 6.5, 0.6, [
      { side: 's', at: -12, width: 3, top: 3.2 }, { side: 's', at: 10, width: 3, top: 3.2 },
      { side: 's', at: 0, width: 2, sill: 1.1, top: 2.4 }, { side: 'n', at: -6, width: 2, sill: 1.1, top: 2.4 },
      { side: 'e', at: 0, width: 2.2 }, { side: 'w', at: 0, width: 2.2 }, { side: 's', at: -4, width: 2, sill: 1.1, top: 2.4 }, { side: 's', at: 4, width: 2, sill: 1.1, top: 2.4 },
    ], 0x5f6466, { roofColor: 0x2e3236 });
    b.lamp(-5, 6, -72, 0xffe0b0, 1.5, false); b.lamp(8, 6, -72, 0xffe0b0, 1.1, true); b.lamp(-18, 6, -72, 0xffc890, 1.1, false);
    b.crate(-10, -74, 1.2); b.crate(4, -70, 1.1); b.crateStack(-16, -76);
    b.textSign(-5, 5.2, -64.65, 12, 1.8, 'COMMAND CENTER', '#ff5a4a', 0, 'LEVEL 1 ACCESS');
    b.sandbags(26, -56, 5); b.sandbags(38, -62, 3, false); b.crateStack(40, -74); b.sandbags(26, -76, 5);
    b.container(44, -84, true, C.rust); b.barrier(30, -58, 4); b.barrier(34, -84, 4);
    b.truck(10, -54, true, 0x3b4739); b.truck(-18, -56, true, 0x2e3a2d);
    b.lampPost(20, -56, 0xffb070, 1); b.lampPost(-30, -60, 0xffb070, 1); b.lampPost(28, -84, 0xffb070, 1, true);
    b.helipad(LZ.x, LZ.z);
    b.textSign(LZ.x, 3.2, LZ.z + 12, 6, 1.3, 'LANDING ZONE', '#66ffcc', 0);
    b.textSign(48, 3.0, -24.5, 4, 1, 'BARRACKS', '#9ad0ff', 0);
    b.crateStack(-56, -66); b.container(-52, -86, true, C.green);
    b.sandbags(-36, -64, 5);

    const bounds = { minX: -76, maxX: 76, minZ: -100, maxZ: 80 };
    const level = b.build(bounds, 0x74767c, 7, { wet: true });
    const sea = makeSea(500, 240, 0, 80 + 120, 0x07202e);
    level.group.add(sea);
    const sky = makeSky({ top: 0x01040a, horizon: 0x112a40, ground: 0x1c2a38, sunDir: new THREE.Vector3(-0.4, 0.5, -0.7), sunColor: 0xa8bcff, sunSize: 46, stars: true });
    return {
      level, fogColor: 0x1a2c3a, fogDensity: 0.011, exposure: 2.1,
      sunDir: new THREE.Vector3(-0.4, 0.8, -0.35), sunColor: 0x9fb8ff, sunIntensity: 3.4,
      hemiSky: 0x5a7a9a, hemiGround: 0x3a4550, hemiIntensity: 2.1, envIntensity: 1.1,
      sky, weather: 'rain', tintShadow: [0.92, 1.0, 1.07], tintHigh: [1.12, 1.0, 0.88], lampIntensity: 60,
    };
  }

  start(game: Game, cp: number) {
    this.fired.clear(); this.relaysDown = Math.min(cp, 3); this.relays = []; this.heliT = -1; this.extractActive = false; this.done = false;
    game.stats.relays = this.relaysDown;
    RELAYS.forEach(([x, z], i) => {
      if (i < this.relaysDown) { game.addWreck(x, z); return; }
      const r = game.addRelay(x, z, i);
      r.setShielded(!game.god);
      this.relays.push(r);
    });
    for (const [x, z] of [[-38, 4], [-38, 5.4], [-37.2, 4.7], [27, -4], [28.2, -4.2], [38, -18], [37, -17], [-10, -22], [14, -12], [-18, -10], [-30, 12], [8, 18], [-14, -56], [6, -50], [30, -56], [24, -70]] as [number, number][]) {
      game.addBarrel(x, z);
    }
    for (const [x, z] of [[-8, 40], [-38, 22], [26, 4], [-18, -12], [34, -42], [6, -50]] as [number, number][]) game.addAmmo(x, z);
    game.heli.group.visible = true; game.heli.group.position.set(0, -600, 0);
    game.setObjectives(this.objectives());
    game.setMarker(null);
    game.setMusic(0.15);
  }

  /** Called when the player confirms the briefing. */
  begin(game: Game, cp: number) {
    if (cp >= 3) { this.beginExtraction(game, false); return; }
    if (cp === 0) game.radio(LINES.m1.start, 1.2);
    else game.radio([{ who: 'GHOST-2', text: 'Checkpoint reached. Next wave is coming. Hold your ground, Wraith.' }], 0.8);
    this.startZone(game, cp, cp === 0 ? 9 : 5);
  }

  private startZone(game: Game, zone: number, delay: number) {
    game.setMarker(null);
    game.setObjectives(this.objectives());
    game.startWaves(zone, makeWaves(zone), () => {
      const relay = this.relays.find((r) => r.id === zone);
      relay?.setShielded(false);
      game.banner('RELAY SHIELD DOWN', 'DESTROY THE RELAY TOWER');
      game.setMusic(0.2);
      this.updateMarker(game);
      game.setObjectives(this.objectives());
    }, delay);
  }

  private objectives() {
    const done = this.relaysDown;
    return [
      { text: 'Clear the outer yard, destroy relay 1', done: done >= 1 },
      { text: 'Clear the courtyard, destroy relay 2', done: done >= 2 },
      { text: 'Clear the command yard, destroy relay 3', done: done >= 3 },
      { text: 'Reach the helicopter', done: this.done },
    ];
  }

  private updateMarker(game: Game) {
    if (this.extractActive) { game.setMarker(LZ); return; }
    const alive = this.relays.filter((r) => !r.destroyed && !r.shielded);
    if (!alive.length) { game.setMarker(null); return; }
    let best = alive[0], bd = Infinity;
    for (const r of alive) { const d = r.pos.distanceTo(game.player.pos); if (d < bd) { bd = d; best = r; } }
    game.setMarker(best.pos);
  }

  private once(key: string, cond: boolean, fn: () => void) {
    if (cond && !this.fired.has(key)) { this.fired.add(key); fn(); }
  }

  onAlert(game: Game) {
    this.once('alert', true, () => game.radio(LINES.m1.alert, 0.5));
    game.setMusic(0.75);
  }

  update(dt: number, game: Game) {
    const p = game.player.pos;
    this.once('courtyard', this.relaysDown >= 1 && game.wavesActive, () => game.radio(LINES.m1.courtyard));
    if (game.time % 1 < dt) this.updateMarker(game);

    if (this.extractActive) {
      if (this.heliT >= 0 && this.heliT < 1) {
        this.heliT = Math.min(1, this.heliT + dt / 16);
        const e = 1 - Math.pow(1 - this.heliT, 3);
        const h = game.heli.group;
        h.position.set(LZ.x + 140 * (1 - e), 3 + 40 * (1 - e) * (1 - e) + Math.sin(game.time * 0.9) * 0.15, LZ.z - 90 * (1 - e));
        h.rotation.y = Math.atan2(140 * (1 - e) * 0.3, -90 * (1 - e)) * 0.3 + Math.PI;
        if (this.heliT >= 1) { h.rotation.y = Math.PI; this.once('heli', true, () => game.radio(LINES.m1.heli)); }
      } else if (this.heliT >= 1) {
        game.heli.group.position.y = 3 + Math.sin(game.time * 0.9) * 0.15;
        game.heli.group.rotation.y = Math.PI + Math.sin(game.time * 0.4) * 0.05;
        const d = Math.hypot(p.x - LZ.x, p.z - LZ.z);
        if (d < 8 && !this.done) {
          this.done = true;
          game.setObjectives(this.objectives());
          game.radio(LINES.m1.end);
          game.completeMission(2.5);
        }
        if (this.beacon) (this.beacon.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(game.time * 3) * 0.05;
        if (Math.random() < 0.5) { game.fx.norm.emit(new THREE.Vector3(LZ.x + (Math.random() - 0.5) * 14, 0.2, LZ.z + (Math.random() - 0.5) * 14), (Math.random() - 0.5) * 6, 0.3, (Math.random() - 0.5) * 6, new THREE.Color(0x888888), 0.8, 1.2, 0.3, -0.2, 1, 2); }
      }
    }
  }

  onRelayDestroyed(r: Relay, game: Game) {
    this.relaysDown++;
    game.stats.relays = this.relaysDown;
    game.saveCheckpoint(this.relaysDown);
    game.setObjectives(this.objectives());
    game.banner('RELAY DESTROYED', `${this.relaysDown} OF 3`);
    audioObjective();
    this.updateMarker(game);
    if (this.relaysDown === 1) { game.radio(LINES.m1.relayA, 1.5); this.startZone(game, 1, 9); }
    else if (this.relaysDown === 2) { game.radio(LINES.m1.relayB, 1.5); this.startZone(game, 2, 9); }
    else {
      game.radio(LINES.m1.relayC, 1.5);
      const tk = game.token;
      setTimeout(() => { if (tk === game.token) this.beginExtraction(game, true); }, 9000);
    }
    void r;
  }

  private beginExtraction(game: Game, withWave: boolean) {
    if (this.extractActive) return;
    this.extractActive = true;
    this.heliT = 0.001;
    game.setObjectives(this.objectives());
    game.setMarker(LZ);
    game.banner('EXTRACTION INBOUND', 'REACH THE LANDING ZONE');
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide }));
    beam.position.set(LZ.x, 30, LZ.z);
    game.scene.add(beam); this.beacon = beam;
    if (withWave) {
      game.radio(LINES.m1.wave, 4);
      const tk = game.token;
      setTimeout(() => { if (tk !== game.token) return; for (const s of WAVE) game.spawnEnemyAt(s, true); game.setMusic(0.95); }, 2500);
    }
  }
}

function audioObjective() { audio.objective(); }
