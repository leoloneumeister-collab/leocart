import { BOT_LEVELS, DT, ECON, MOVE, ROUND, TEAM_BREACHER, TEAM_SENTINEL, type Team } from './constants.ts';
import { clamp, dist2, forwardOf, Rng, v3, type Vec3 } from './math.ts';
import { buildMap, inRect, placeAt, type MapData, type Site } from './map.ts';
import { World } from './world.ts';
import { NavGrid } from './nav.ts';
import { WEAPONS } from './weapons.ts';
import {
  currentWeapon, eyePos, grenadeCount, mkWeapon, newActor, newCmd, type Actor, type Cmd,
} from './actor.ts';
import { stepMovement } from './movement.ts';
import { killActor, selectSlot, stepWeapon, giveBestSlot, applyDamage } from './combat.ts';
import { smokeBlocks, throwGrenade, updateGrenades, type Fire, type Grenade, type Smoke } from './grenades.ts';
import { buyItem, clampMoney } from './economy.ts';
import type { Noise, RoundReason, SimEvent } from './events.ts';
import { createBrain, thinkBot, type Brain } from './bots.ts';
import { TeamAI } from './teamai.ts';
import type { GrenadeKind } from './weapons.ts';

export type Phase = 'freeze' | 'live' | 'roundEnd' | 'halftime' | 'over' | 'dm';

export interface SimConfig {
  mode: 'comp' | 'dm';
  /** Side the human plays, -1 random, null means every player is a bot (used by the test harness). */
  humanSide: Team | -1 | null;
  difficulty: 0 | 1 | 2 | 3;
  seed: number;
  humanName?: string;
  /** shortened rules for tests */
  winsNeeded?: number;
  dmMinutes?: number;
  /** bots stand still, handy for target practice and tests */
  passive?: boolean;
}

export interface Drop {
  id: number;
  kind: 'weapon' | 'bomb';
  weaponId: string;
  ammo: number;
  reserve: number;
  pos: Vec3;
  born: number;
}

export interface Bomb {
  state: 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded';
  pos: Vec3;
  site: 'A' | 'B' | null;
  plantedAt: number;
  explodeAt: number;
  defuser: number;
  defuseKit: boolean;
  plantedBy: number;
  defusedBy: number;
  nextBeep: number;
}

export interface MatchState {
  phase: Phase;
  phaseEnd: number;
  liveStart: number;
  round: number;
  score: [number, number];
  swapped: boolean;
  lossIdx: [number, number];
  roundWinner: Team | -1;
  reason: RoundReason | null;
  winnerGrp: 0 | 1 | -1;
  suddenDeath: boolean;
  history: Array<{ round: number; winnerGrp: 0 | 1; reason: RoundReason; winnerSide: Team }>;
  mvp: number;
  winsNeeded: number;
  maxRounds: number;
  dmEnd: number;
}

const BOT_NAMES = ['Rook', 'Vega', 'Onyx', 'Mako', 'Juno', 'Dax', 'Lynx', 'Sable', 'Quill', 'Brix', 'Nova', 'Tarn', 'Echo', 'Ziv', 'Kade', 'Rune'];

export class Sim {
  cfg: SimConfig;
  rng: Rng;
  map: MapData;
  world: World;
  nav: NavGrid;
  tick = 0;
  time = 0;
  nextId = 1000;
  actors: Actor[] = [];
  human: Actor | null = null;
  events: SimEvent[] = [];
  noises: Noise[] = [];
  grenades: Grenade[] = [];
  smokes: Smoke[] = [];
  fires: Fire[] = [];
  drops: Drop[] = [];
  flashAssist = new Map<number, { by: number; until: number }>();
  bomb: Bomb;
  m: MatchState;
  ai: [TeamAI, TeamAI];
  brains = new Map<number, Brain>();
  /** set while the human is in the buy menu or spectating, purely informational for the UI */
  frozenInput = false;
  /** path searches left this tick, keeps one tick from doing all the bots' planning at once */
  pathBudget = 1;

  constructor(cfg: SimConfig, shared?: { map: MapData; world: World; nav: NavGrid }) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    if (shared) { this.map = shared.map; this.world = shared.world; this.nav = shared.nav; }
    else {
      this.map = buildMap();
      this.world = new World(this.map.boxes, this.map.bounds);
      this.nav = new NavGrid(this.world);
    }
    this.bomb = this.freshBomb();
    this.m = {
      phase: 'freeze', phaseEnd: 0, liveStart: 0, round: 0, score: [0, 0], swapped: false, lossIdx: [0, 0],
      roundWinner: -1, reason: null, winnerGrp: -1, suddenDeath: false, history: [], mvp: -1,
      winsNeeded: cfg.winsNeeded ?? ROUND.winsNeeded, maxRounds: ROUND.maxRounds, dmEnd: 0,
    };
    this.ai = [new TeamAI(this, 0), new TeamAI(this, 1)];
    this.createActors();
    if (cfg.mode === 'dm') this.startDeathmatch(); else this.startRound();
  }

  // ------------------------------------------------------------------ setup

  private freshBomb(): Bomb {
    return { state: 'carried', pos: v3(), site: null, plantedAt: 0, explodeAt: 0, defuser: -1, defuseKit: false, plantedBy: -1, defusedBy: -1, nextBeep: 0 };
  }

  private createActors() {
    const names = this.rng.shuffle([...BOT_NAMES]);
    let ni = 0;
    if (this.cfg.mode === 'dm') {
      const total = 8;
      for (let i = 0; i < total; i++) {
        const isHuman = i === 0 && this.cfg.humanSide !== null;
        const a = newActor(i, isHuman ? (this.cfg.humanName ?? 'You') : names[ni++ % names.length], 0, !isHuman, isHuman);
        a.grp = 0;
        this.actors.push(a);
        if (isHuman) this.human = a;
      }
    } else {
      let hs: Team = 0;
      if (this.cfg.humanSide === -1) hs = this.rng.chance(0.5) ? 0 : 1;
      else if (this.cfg.humanSide !== null) hs = this.cfg.humanSide;
      for (let t = 0; t < 2; t++) {
        for (let i = 0; i < 5; i++) {
          const id = t * 5 + i;
          const isHuman = this.cfg.humanSide !== null && t === hs && i === 0;
          const a = newActor(id, isHuman ? (this.cfg.humanName ?? 'You') : names[ni++ % names.length], t as Team, !isHuman, isHuman);
          a.grp = t as 0 | 1;
          this.actors.push(a);
          if (isHuman) this.human = a;
        }
      }
    }
    for (const a of this.actors) {
      a.money = this.cfg.mode === 'dm' ? 0 : ROUND.startMoney;
      if (a.isBot) this.brains.set(a.id, createBrain(this, a));
    }
  }

  get lvl() { return BOT_LEVELS[this.cfg.difficulty]; }

  isEnemy(a: Actor, b: Actor) { return this.cfg.mode === 'dm' ? a !== b : a.team !== b.team; }

  emit(e: SimEvent) { this.events.push(e); }

  drainEvents(): SimEvent[] { const e = this.events; this.events = []; return e; }

  noise(a: Actor, kind: Noise['kind'], radius: number, at?: Vec3) {
    this.noises.push({ pos: at ?? { ...a.pos }, time: this.time, radius, id: a.id, team: a.team, kind });
  }

  reward(a: Actor, amount: number, why: string) {
    if (this.cfg.mode === 'dm') return;
    a.money = clampMoney(a.money + amount);
    if (amount !== 0) this.emit({ t: 'money', id: a.id, amount, why });
  }

  // ------------------------------------------------------------------ queries used by bots and UI

  alive(team: Team) { return this.actors.filter((a) => a.alive && a.team === team); }

  /** Line of sight that respects walls and smoke. */
  visible(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    if (!this.world.los(ax, ay, az, bx, by, bz)) return false;
    return !smokeBlocks(this, ax, ay, az, bx, by, bz);
  }

  siteAt(p: Vec3): Site | null {
    for (const s of this.map.sites) if (inRect(s.rect, p.x, p.z)) return s;
    return null;
  }

  placeName(p: Vec3) { return placeAt(this.map, p.x, p.z); }

  roundTimeLeft() {
    if (this.m.phase === 'freeze') return this.m.phaseEnd - this.time;
    if (this.m.phase === 'live') return this.bomb.state === 'planted' ? 0 : Math.max(0, this.m.phaseEnd - this.time);
    return 0;
  }

  bombTimeLeft() { return this.bomb.state === 'planted' ? Math.max(0, this.bomb.explodeAt - this.time) : 0; }

  /** fire areas blocked for the nav planner */
  markFire(p: Vec3, r: number, secs: number) {
    void secs;
    const nav = this.nav;
    for (let i = 0; i < nav.size; i++) {
      if (Math.hypot(nav.nx[i] - p.x, nav.nz[i] - p.z) < r + 0.8 && Math.abs(nav.nh[i] - p.y) < 1.2) nav.penalty[i] = 60;
    }
  }
  clearFires() { this.nav.penalty.fill(0); }

  // ------------------------------------------------------------------ gear

  resetGear(a: Actor) {
    a.armor = 0; a.helmet = false; a.kit = false;
    a.grenades = { flash: 0, smoke: 0, he: 0, fire: 0 };
    a.primary = null;
    a.secondary = mkWeapon(a.team === TEAM_SENTINEL ? 'marshal' : 'viper');
    a.hasBomb = false;
    a.grenadeSel = null;
  }

  dropWeapon(a: Actor, slot: 'primary' | 'secondary') {
    const ws = slot === 'primary' ? a.primary : a.secondary;
    if (!ws) return;
    const f = forwardOf(a.yaw, 0);
    const p = v3(a.pos.x + f.x * 0.9, a.pos.y, a.pos.z + f.z * 0.9);
    if (!this.world.hullFree(p.x, a.pos.y + 0.02, p.z, 0.2, 0.3)) { p.x = a.pos.x; p.z = a.pos.z; }
    p.y = this.world.groundHeight(p.x, p.z, 0.1, a.pos.y + 0.3);
    this.drops.push({ id: this.nextId++, kind: 'weapon', weaponId: ws.def.id, ammo: ws.ammo, reserve: ws.reserve, pos: p, born: this.time });
    if (slot === 'primary') a.primary = null; else a.secondary = null;
    this.emit({ t: 'drop', id: a.id, item: ws.def.id });
    if (a.cur === slot) selectSlot(this, a, giveBestSlot(a));
  }

  dropCurrent(a: Actor) {
    if (this.m.phase === 'freeze' && a.isBot) return;
    if (a.cur === 'primary') this.dropWeapon(a, 'primary');
    else if (a.cur === 'secondary' && a.secondary && a.secondary.def.price > 0) this.dropWeapon(a, 'secondary');
    else if (a.cur === 'bomb' && a.hasBomb) {
      a.hasBomb = false;
      const f = forwardOf(a.yaw, 0);
      const p = v3(a.pos.x + f.x * 0.8, this.world.groundHeight(a.pos.x + f.x * 0.8, a.pos.z + f.z * 0.8, 0.1, a.pos.y + 0.4), a.pos.z + f.z * 0.8);
      this.bomb.state = 'dropped'; this.bomb.pos = p;
      this.drops.push({ id: this.nextId++, kind: 'bomb', weaponId: 'bomb', ammo: 0, reserve: 0, pos: p, born: this.time });
      this.emit({ t: 'bombDrop', pos: p });
      selectSlot(this, a, giveBestSlot(a));
    }
  }

  throwGrenade(a: Actor, kind: GrenadeKind, power: number) { throwGrenade(this, a, kind, power); }

  /** Called by combat when someone dies. */
  onDeath(v: Actor) {
    v.planting = 0; v.defusing = 0; v.pinPulled = 0; v.scope = 0;
    if (this.bomb.defuser === v.id) this.bomb.defuser = -1;
    // drop weapons and bomb where they fell, there is nothing to pick up in deathmatch
    if (this.cfg.mode === 'comp' && v.primary) this.dropWeapon(v, 'primary');
    if (v.hasBomb) {
      v.hasBomb = false;
      const p = v3(v.pos.x, this.world.groundHeight(v.pos.x, v.pos.z, 0.1, v.pos.y + 0.3), v.pos.z);
      this.bomb.state = 'dropped'; this.bomb.pos = p;
      this.drops.push({ id: this.nextId++, kind: 'bomb', weaponId: 'bomb', ammo: 0, reserve: 0, pos: p, born: this.time });
      this.emit({ t: 'bombDrop', pos: p });
    }
    if (this.cfg.mode === 'dm') v.spawn = this.time + 2.5;
  }

  // ------------------------------------------------------------------ round lifecycle

  private placeActor(a: Actor, sp: { pos: Vec3; yaw: number }) {
    a.pos = { ...sp.pos }; a.prev = { ...sp.pos }; a.vel = v3();
    a.yaw = sp.yaw; a.prevYaw = sp.yaw; a.pitch = 0;
    a.onGround = true; a.crouching = false; a.crouchAmt = 0; a.jumpHeld = false; a.jumpBuffer = 0; a.fallSpeed = 0;
    a.cmd = newCmd(); a.cmd.yaw = sp.yaw; a.cmd.pitch = 0;
  }

  private reviveActor(a: Actor) {
    a.alive = true; a.health = 100;
    a.reloadEnd = 0; a.nextAttack = 0; a.drawEnd = 0; a.shotIndex = 0; a.inaccuracy = 0; a.punchP = 0; a.punchY = 0;
    a.scope = 0; a.pinPulled = 0; a.planting = 0; a.defusing = 0; a.flashEnd = 0; a.flashFull = 0; a.fireAcc = 0;
    a.damagedBy.clear(); a.roundDamage = 0; a.roundKills = 0; a.attackHeld = false; a.altHeld = false; a.useHeld = false; a.killedBy = -1;
    a.cur = giveBestSlot(a); a.last = 'knife';
    a.spawnProtect = 0;
  }

  startRound() {
    const m = this.m;
    m.round++;
    m.phase = 'freeze';
    m.phaseEnd = this.time + (m.round === 1 ? ROUND.freeze + 3 : ROUND.freeze);
    m.roundWinner = -1; m.reason = null; m.mvp = -1;
    this.grenades.length = 0; this.smokes.length = 0; this.fires.length = 0; this.drops.length = 0; this.noises.length = 0;
    this.clearFires();
    this.flashAssist.clear();
    this.bomb = this.freshBomb();
    const fullReset = m.round === 1 || m.history.length === ROUND.swapAfter;
    for (const a of this.actors) {
      if (!a.alive || fullReset) this.resetGear(a);
      if (m.suddenDeath) { a.money = ROUND.suddenDeathMoney; }
    }
    const used: Record<number, number> = { 0: 0, 1: 0 };
    for (const a of this.actors) {
      const sp = this.map.spawns[a.team][used[a.team]++ % this.map.spawns[a.team].length];
      this.placeActor(a, sp);
      this.reviveActor(a);
    }
    // bomb goes to a random living Breacher, human only if they are the only candidate or by chance
    const bs = this.actors.filter((a) => a.team === TEAM_BREACHER);
    if (bs.length) { const c = this.rng.pick(bs.filter((a) => !a.isHuman).length ? bs.filter((a) => !a.isHuman) : bs); c.hasBomb = true; }
    for (const a of this.actors) { if (a.isBot) this.brains.get(a.id)!.reset(); }
    this.ai[0].onRoundStart(); this.ai[1].onRoundStart();
    this.emit({ t: 'freezeStart', round: m.round });
  }

  private goLive() {
    const m = this.m;
    m.phase = 'live';
    m.liveStart = this.time;
    m.phaseEnd = this.time + ROUND.time;
    this.ai[0].onLive(); this.ai[1].onLive();
    this.emit({ t: 'live', round: m.round });
  }

  endRound(winner: Team, reason: RoundReason) {
    const m = this.m;
    if (m.phase !== 'live') return;
    m.phase = 'roundEnd';
    m.phaseEnd = this.time + ROUND.end;
    m.roundWinner = winner; m.reason = reason;
    const winGrp = (this.actors.find((a) => a.team === winner)?.grp ?? winner) as 0 | 1;
    m.score[winGrp]++;
    m.history.push({ round: m.round, winnerGrp: winGrp, reason, winnerSide: winner });
    const loser: Team = winner === 0 ? 1 : 0;
    // money
    if (this.cfg.mode === 'comp') {
      const winAmt = reason === 'bomb' || reason === 'defuse' ? ECON.winBomb : ECON.winElim;
      const bonus = m.suddenDeath ? 0 : ECON.lossBonus[Math.min(4, m.lossIdx[loser])];
      for (const a of this.actors) {
        if (a.team === winner) this.reward(a, winAmt, 'win');
        else {
          // Breachers who sit on the clock without planting get nothing
          const saved = a.team === TEAM_BREACHER && a.alive && reason === 'time';
          if (!saved) this.reward(a, bonus, 'loss');
        }
        if (a.team === TEAM_BREACHER && a.team !== winner && this.bomb.plantedBy >= 0) this.reward(a, ECON.plantTeam, 'plant');
      }
      m.lossIdx[loser] = Math.min(4, m.lossIdx[loser] + 1);
      m.lossIdx[winner] = Math.max(0, m.lossIdx[winner] - 1);
    }
    // MVP: best performer on the winning side
    let best: Actor | null = null, bestScore = -1;
    for (const a of this.actors) {
      if (a.team !== winner) continue;
      const s = a.roundKills * 10 + (a.id === this.bomb.plantedBy || a.id === this.bomb.defusedBy ? 8 : 0) + a.roundDamage / 100 + (a.alive ? 1 : 0);
      if (s > bestScore) { bestScore = s; best = a; }
    }
    if (best) { best.stats.mvps++; m.mvp = best.id; }
    this.emit({ t: 'roundEnd', round: m.round, winner, reason, mvp: m.mvp });
    // match over?
    if (m.score[0] >= m.winsNeeded || m.score[1] >= m.winsNeeded) m.winnerGrp = m.score[0] > m.score[1] ? 0 : 1;
    else if (m.round >= m.maxRounds && !m.suddenDeath) {
      if (m.score[0] !== m.score[1]) m.winnerGrp = m.score[0] > m.score[1] ? 0 : 1;
      else m.suddenDeath = true;
    } else if (m.suddenDeath) m.winnerGrp = winGrp;
  }

  private afterRoundEnd() {
    const m = this.m;
    if (m.winnerGrp !== -1) {
      m.phase = 'over';
      this.emit({ t: 'matchEnd', winnerGrp: m.winnerGrp });
      return;
    }
    if (m.history.length === ROUND.swapAfter && !m.suddenDeath) {
      // swap sides, reset economy
      m.phase = 'halftime';
      m.phaseEnd = this.time + ROUND.halftime;
      m.swapped = !m.swapped;
      for (const a of this.actors) { a.team = a.team === 0 ? 1 : 0; a.money = ROUND.startMoney; a.alive = false; }
      m.lossIdx = [0, 0];
      this.emit({ t: 'halftime' });
      return;
    }
    this.startRound();
  }

  // ------------------------------------------------------------------ deathmatch

  private startDeathmatch() {
    const m = this.m;
    m.phase = 'dm';
    m.dmEnd = this.time + (this.cfg.dmMinutes ?? 10) * 60;
    for (const a of this.actors) {
      a.team = 0; a.helmet = true; a.armor = 100;
      a.primary = mkWeapon(this.rng.pick(['vk47', 'carbine', 'hornet', 'reaper', 'ranger', 'mantis', 'pump12', 'scout']));
      a.secondary = mkWeapon(this.rng.pick(['marshal', 'viper', 'cobra']));
      a.grenades = { flash: 0, smoke: 0, he: 0, fire: 0 };
      this.dmSpawn(a);
    }
  }

  dmSpawn(a: Actor) {
    let best: Vec3 | null = null, bestD = -1;
    for (let i = 0; i < 14; i++) {
      const n = this.rng.int(0, this.nav.size - 1);
      if (this.nav.nh[n] > 0.1) continue;
      const p = v3(this.nav.nx[n], 0, this.nav.nz[n]);
      let nearest = 1e9;
      for (const o of this.actors) if (o.alive && o !== a) nearest = Math.min(nearest, dist2(o.pos, p) * (this.world.los(p.x, 1.5, p.z, o.pos.x, 1.5, o.pos.z) ? 0.5 : 1));
      if (nearest > bestD) { bestD = nearest; best = p; }
    }
    this.placeActor(a, { pos: best ?? this.map.spawns[0][0].pos, yaw: this.rng.range(-3, 3) });
    // fresh gear every life: bots roll a new loadout, the human keeps their pick with full ammo
    if (a.isBot) {
      a.primary = mkWeapon(this.rng.pick(['vk47', 'carbine', 'hornet', 'reaper', 'ranger', 'mantis', 'pump12', 'scout', 'wasp']));
      a.secondary = mkWeapon(this.rng.pick(['marshal', 'viper', 'cobra']));
    } else {
      if (a.primary) a.primary = mkWeapon(a.primary.def.id);
      if (a.secondary) a.secondary = mkWeapon(a.secondary.def.id);
    }
    a.armor = 100; a.helmet = true;
    this.reviveActor(a);
    a.spawnProtect = this.time + 1.5;
    this.emit({ t: 'spawn', id: a.id });
  }

  // ------------------------------------------------------------------ the tick

  /** Advance by one fixed tick. Human input must already be in human.cmd. */
  step() {
    this.tick++;
    this.time = this.tick * DT;
    this.pathBudget = 1;
    const m = this.m;
    const now = this.time;

    // phase transitions
    if (m.phase === 'freeze' && now >= m.phaseEnd) this.goLive();
    else if (m.phase === 'roundEnd' && now >= m.phaseEnd) this.afterRoundEnd();
    else if (m.phase === 'halftime' && now >= m.phaseEnd) this.startRound();
    if (m.phase === 'dm' && now >= m.dmEnd) { m.phase = 'over'; m.winnerGrp = -1; this.emit({ t: 'matchEnd', winnerGrp: -1 }); }

    if (m.phase !== 'over') { this.ai[0].update(); this.ai[1].update(); }

    // bots think, everyone moves
    for (const a of this.actors) {
      if (!a.alive) {
        if (m.phase === 'dm' && a.spawn > 0 && now >= a.spawn) { a.spawn = 0; this.dmSpawn(a); }
        continue;
      }
      a.prev.x = a.pos.x; a.prev.y = a.pos.y; a.prev.z = a.pos.z; a.prevYaw = a.yaw;
      if (a.isBot && m.phase !== 'over' && !this.cfg.passive) thinkBot(this, a, this.brains.get(a.id)!);
      this.stepActor(a, a.cmd);
    }
    this.separate();
    this.stepDrops();
    updateGrenades(this, DT);
    this.stepBomb();
    if (m.phase === 'live') this.checkRoundEnd();

    // prune noises
    while (this.noises.length && now - this.noises[0].time > 3) this.noises.shift();
  }

  private stepActor(a: Actor, cmd: Cmd) {
    const m = this.m;
    const frozen = m.phase === 'freeze' || m.phase === 'over' || m.phase === 'halftime';
    a.yaw = cmd.yaw;
    a.pitch = clamp(cmd.pitch, -1.55, 1.55);
    if (frozen) {
      // players stand still in freeze time but can look and open the buy menu
      const keep = { fwd: cmd.fwd, side: cmd.side, jump: cmd.jump, fire: cmd.fire, alt: cmd.alt };
      cmd.fwd = 0; cmd.side = 0; cmd.jump = false; cmd.fire = false; cmd.alt = false;
      stepMovement(this.world, a, cmd, DT);
      stepWeapon(this, a, cmd, DT);
      cmd.fwd = keep.fwd; cmd.side = keep.side; cmd.jump = keep.jump; cmd.fire = keep.fire; cmd.alt = keep.alt;
      return;
    }
    const wasAir = !a.onGround;
    const ev = stepMovement(this.world, a, cmd, DT);
    if (ev.landed > 0) {
      this.emit({ t: 'land', id: a.id, pos: { ...a.pos }, speed: ev.landed });
      if (ev.landed > MOVE.fallSafe && wasAir) {
        const dmg = Math.round((ev.landed - MOVE.fallSafe) * MOVE.fallDamage + 10);
        applyDamage(this, a, null, { health: dmg, armor: 0 }, 'fall', false, false, null);
        if (!a.alive) return;
      }
      this.noise(a, 'step', 18);
    }
    // footsteps
    const sp = Math.hypot(a.vel.x, a.vel.z);
    if (a.onGround && sp > MOVE.stepNoiseSpeed && !a.crouching) {
      a.stepTimer -= DT * (sp / MOVE.maxSpeed) * 1.1;
      if (a.stepTimer <= 0) {
        a.stepTimer = MOVE.stepInterval;
        this.emit({ t: 'step', id: a.id, pos: { ...a.pos }, surface: a.pos.y > 0.3 ? 'stone' : 'sand', loud: true });
        this.noise(a, 'step', 24);
      }
    } else if (a.onGround && sp > 0.8 && !a.crouching) {
      a.stepTimer -= DT * (sp / MOVE.maxSpeed);
      if (a.stepTimer <= 0) { a.stepTimer = MOVE.stepInterval * 1.3; this.emit({ t: 'step', id: a.id, pos: { ...a.pos }, surface: a.pos.y > 0.3 ? 'stone' : 'sand', loud: false }); }
    }
    stepWeapon(this, a, cmd, DT);
    this.stepUse(a, cmd);
    if (a.flashEnd < this.time) a.flashFull = 0;
  }

  /** Soft push so players cannot stand inside each other. */
  private separate() {
    const list = this.actors;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dy = a.pos.y - b.pos.y;
        if (dy > 1.8 || dy < -1.8) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = MOVE.radius * 2 - 0.05;
        if (d >= min) continue;
        const push = Math.min(0.06, (min - d) * 0.5);
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        this.nudge(a, -nx * push, -nz * push);
        this.nudge(b, nx * push, nz * push);
      }
    }
  }

  private nudge(a: Actor, dx: number, dz: number) {
    const h = a.crouching ? MOVE.heightCrouch : MOVE.heightStand;
    if (this.world.hullFree(a.pos.x + dx, a.pos.y + 0.02, a.pos.z + dz, MOVE.radius, h)) { a.pos.x += dx; a.pos.z += dz; }
  }

  // ------------------------------------------------------------------ use key: plant, defuse, pickups

  private stepUse(a: Actor, cmd: Cmd) {
    const m = this.m;
    const useEdge = cmd.use && !a.useHeld;
    a.useHeld = cmd.use;
    const live = m.phase === 'live';
    const speed = Math.hypot(a.vel.x, a.vel.z);

    // ---- plant
    if (a.team === TEAM_BREACHER && a.hasBomb && this.bomb.state === 'carried' && live) {
      const site = this.siteAt(a.pos);
      if (cmd.use && site && a.onGround && speed < 1.6) {
        if (a.cur !== 'bomb') selectSlot(this, a, 'bomb');
        if (a.planting === 0) this.emit({ t: 'plantStart', id: a.id });
        a.planting += DT;
        this.noise(a, 'plant', 30);
        if (a.planting >= ROUND.plant) this.plantBomb(a, site);
        return;
      }
    }
    if (a.planting > 0) { a.planting = 0; this.emit({ t: 'plantStop', id: a.id }); if (a.cur === 'bomb') selectSlot(this, a, giveBestSlot(a)); }

    // ---- defuse
    if (a.team === TEAM_SENTINEL && this.bomb.state === 'planted' && live) {
      const near = Math.hypot(a.pos.x - this.bomb.pos.x, a.pos.z - this.bomb.pos.z) <= ROUND.useRange && Math.abs(a.pos.y - this.bomb.pos.y) < 1.5;
      if (cmd.use && near && a.onGround && speed < 2.2 && (this.bomb.defuser === -1 || this.bomb.defuser === a.id)) {
        if (a.defusing === 0) { this.bomb.defuser = a.id; this.bomb.defuseKit = a.kit; this.emit({ t: 'defuseStart', id: a.id, kit: a.kit }); }
        a.defusing += DT;
        this.noise(a, 'defuse', 30);
        if (a.defusing >= (a.kit ? ROUND.defuseKit : ROUND.defuse)) this.defuseBomb(a);
        return;
      }
    }
    if (a.defusing > 0) {
      a.defusing = 0;
      if (this.bomb.defuser === a.id) this.bomb.defuser = -1;
      this.emit({ t: 'defuseStop', id: a.id });
    }

    // ---- swap weapon from the floor
    if (useEdge) {
      for (const d of this.drops) {
        if (d.kind !== 'weapon') continue;
        if (Math.hypot(d.pos.x - a.pos.x, d.pos.z - a.pos.z) > 1.5 || Math.abs(d.pos.y - a.pos.y) > 1.5) continue;
        const def = WEAPONS[d.weaponId];
        if (def.team !== 2 && def.team !== a.team) continue;
        this.takeDrop(a, d, true);
        break;
      }
    }
  }

  private plantBomb(a: Actor, site: Site) {
    const b = this.bomb;
    b.state = 'planted'; b.site = site.id; b.plantedAt = this.time; b.explodeAt = this.time + ROUND.bomb;
    b.pos = { x: a.pos.x, y: a.pos.y, z: a.pos.z }; b.plantedBy = a.id; b.nextBeep = this.time + 1;
    a.hasBomb = false; a.planting = 0;
    a.stats.score += 2;
    this.reward(a, ECON.plantPlayer, 'plant');
    selectSlot(this, a, giveBestSlot(a));
    this.emit({ t: 'planted', id: a.id, site: site.id, pos: { ...b.pos } });
    this.noise(a, 'bomb', 60);
  }

  private defuseBomb(a: Actor) {
    const b = this.bomb;
    b.state = 'defused'; b.defusedBy = a.id; b.defuser = -1;
    a.defusing = 0;
    a.stats.score += 2;
    this.reward(a, ECON.defusePlayer, 'defuse');
    this.emit({ t: 'defused', id: a.id });
    this.endRound(TEAM_SENTINEL, 'defuse');
  }

  private stepBomb() {
    const b = this.bomb;
    if (b.state !== 'planted' || this.m.phase !== 'live') return;
    const left = b.explodeAt - this.time;
    if (this.time >= b.nextBeep) {
      const fast = left < 10;
      this.emit({ t: 'beep', pos: { ...b.pos }, fast });
      b.nextBeep = this.time + clamp(left / 40, 0.12, 1) * (left < 10 ? 0.6 : 1) + 0.08;
    }
    if (left <= 0) {
      b.state = 'exploded';
      this.emit({ t: 'exploded', pos: { ...b.pos } });
      for (const a of this.actors) {
        if (!a.alive) continue;
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y + 1 - b.pos.y, a.pos.z - b.pos.z);
        const dmg = 500 * Math.exp(-Math.pow(d / 8.5, 2));
        if (dmg >= 1) applyDamage(this, a, null, { health: Math.round(dmg), armor: 0 }, 'bomb', false, false, b.pos);
      }
      this.endRound(TEAM_BREACHER, 'bomb');
    }
  }

  private checkRoundEnd() {
    const m = this.m;
    let s = 0, br = 0;
    for (const a of this.actors) if (a.alive) { if (a.team === TEAM_SENTINEL) s++; else br++; }
    const planted = this.bomb.state === 'planted';
    if (s === 0) { this.endRound(TEAM_BREACHER, planted ? 'bomb' : 'elimination'); return; }
    if (planted) return;
    if (br === 0) { this.endRound(TEAM_SENTINEL, 'elimination'); return; }
    if (this.time >= m.phaseEnd) this.endRound(TEAM_SENTINEL, 'time');
  }

  // ------------------------------------------------------------------ drops

  private takeDrop(a: Actor, d: Drop, swap: boolean) {
    if (d.kind === 'bomb') {
      if (a.team !== TEAM_BREACHER || a.hasBomb) return;
      a.hasBomb = true;
      this.bomb.state = 'carried';
      this.emit({ t: 'bombPickup', id: a.id });
    } else {
      const def = WEAPONS[d.weaponId];
      const slot = def.slot === 'primary' ? 'primary' : 'secondary';
      if (a[slot]) { if (!swap) return; this.dropWeapon(a, slot); }
      a[slot] = { def, ammo: d.ammo, reserve: d.reserve };
      selectSlot(this, a, slot === 'primary' || !a.primary ? slot : a.cur);
      this.emit({ t: 'pickup', id: a.id, item: def.id });
    }
    this.drops.splice(this.drops.indexOf(d), 1);
  }

  private stepDrops() {
    if (!this.drops.length) return;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.kind === 'weapon' && this.time - d.born > 120) { this.drops.splice(i, 1); continue; }
      for (const a of this.actors) {
        if (!a.alive) continue;
        if (Math.hypot(a.pos.x - d.pos.x, a.pos.z - d.pos.z) > 1.0 || Math.abs(a.pos.y - d.pos.y) > 1.2) continue;
        if (d.kind === 'bomb') { this.takeDrop(a, d, false); break; }
        const def = WEAPONS[d.weaponId];
        if (def.team !== 2 && def.team !== a.team) continue;
        const slot = def.slot === 'primary' ? 'primary' : 'secondary';
        if (a[slot]) continue;
        if (this.time - d.born < 0.6) continue;
        // humans only auto pick primaries, bots pick anything they are missing
        this.takeDrop(a, d, false);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ helpers for the UI and tests

  humanTeam(): Team | -1 { return this.human ? this.human.team : -1; }

  /** Score as [human squad, other squad] for display. */
  scoreFor(grp: 0 | 1) { return [this.m.score[grp], this.m.score[grp === 0 ? 1 : 0]] as const; }

  buy(a: Actor, item: string) { return buyItem(this, a, item); }

  killForTest(a: Actor, by: Actor | null) { killActor(this, a, by, 'vk47', false, false); }

  eye(a: Actor) { return eyePos(a); }
  weaponOf(a: Actor) { return currentWeapon(a); }
  grenadeTotal(a: Actor) { return grenadeCount(a); }
}
