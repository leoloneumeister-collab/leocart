/**
 * The simulation world. No DOM or rendering imports in this folder.
 * Everything that changes the game goes through `World.step()`.
 */
import { CONFIG } from '../data/config.ts';
import { CHAMPIONS } from '../data/champions.ts';
import type { ChampionDef } from '../data/champions.ts';
import { itemStatsTotal } from '../data/items.ts';
import {
  LANES,
  LANE_POINTS,
  LANE_STRUCTURE_DIST,
  NEXUS_POS,
  NEXUS_TOWER_POS,
  OBSTACLES,
  SPAWN_POS,
  structurePoint,
} from '../data/map.ts';
import { MINIONS, STRUCTURES } from '../data/units.ts';
import { clamp, Rng } from './math.ts';
import { NavGrid } from './nav.ts';
import type { Circle } from './nav.ts';
import type {
  ChampState,
  Command,
  Difficulty,
  Lane,
  MinionType,
  Projectile,
  SimEvent,
  Stats,
  Status,
  Team,
  TeamOrNeutral,
  Unit,
  UnitKind,
  Zone,
} from './types.ts';

export interface Spatial {
  cell: number;
  n: number;
  cells: Unit[][];
}

export interface SpawnQueueItem {
  at: number;
  team: Team;
  lane: Lane;
  type: MinionType;
  index: number;
}

export interface MatchSetup {
  seed: number;
  /** Champion id for the player slot. */
  playerChampion: string;
  playerLane: Lane;
  difficulty: Difficulty;
  /** When true the player slot is controlled by a bot too (headless tests). */
  autoPlayer: boolean;
  /** Restrict the map to the mid lane only (phase 1 slice and quick tests). */
  midOnly?: boolean;
  /** Skip bots entirely (unit tests). */
  noBots?: boolean;
  /** Skip jungle monsters. */
  noJungle?: boolean;
  /** Fog of war (default true). */
  fog?: boolean;
  /** Start gold override. */
  startGold?: number;
  /** Enemy team uses these champions (default: all five). */
  redChampions?: string[];
  blueChampions?: string[];
}

export const SPATIAL_CELL = 8;

export class World {
  time = 0;
  tick = 0;
  rng: Rng;
  setup: MatchSetup;
  nav: NavGrid;
  units: Unit[] = [];
  byId = new Map<number, Unit>();
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  champions: Unit[] = [];
  structures: Unit[] = [];
  events: SimEvent[] = [];
  commands: Command[] = [];
  nextId = 1;
  winner: Team | -1 = -1;
  playerId = 0;
  spatial: Spatial;
  structCircle = new Map<number, Circle>();
  spawnQueue: SpawnQueueItem[] = [];
  nextWave = CONFIG.firstWaveTime;
  waveNumber = 0;
  /** Teams' tower kills, champion kills etc. for the scoreboard. */
  teamKills: [number, number] = [0, 0];
  teamTowers: [number, number] = [0, 0];
  /** Per team: ids of currently visible enemy units (fog of war). */
  visible: [Set<number>, Set<number>] = [new Set(), new Set()];
  visionTimer = 0;
  goldBonus: [number, number] = [1, 1];
  paused = false;
  fogOn: boolean;
  constructor(setup: MatchSetup) {
    this.setup = setup;
    this.rng = new Rng(setup.seed);
    this.fogOn = setup.fog !== false;
    this.nav = new NavGrid(OBSTACLES);
    const n = Math.ceil((CONFIG.mapHalf * 2) / SPATIAL_CELL) + 1;
    this.spatial = { cell: SPATIAL_CELL, n, cells: Array.from({ length: n * n }, () => []) };
    this.buildStructures();
    this.spawnChampions();
  }

  // ---------------------------------------------------------------- creation

  emit(e: SimEvent) {
    this.events.push(e);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  get(id: number): Unit | undefined {
    return this.byId.get(id);
  }

  createUnit(kind: UnitKind, team: TeamOrNeutral, defId: string, name: string, x: number, z: number, radius: number, height: number, base: Stats): Unit {
    const u: Unit = {
      id: this.nextId++,
      kind,
      team,
      defId,
      name,
      x,
      z,
      px: x,
      pz: z,
      facing: team === 0 ? Math.PI * 0.75 : -Math.PI * 0.25,
      radius,
      height,
      hp: base.maxHp,
      mana: base.maxMana,
      baseStats: base,
      s: { ...base },
      alive: true,
      removed: false,
      order: { t: 'idle' },
      path: [],
      pathAge: 0,
      attackCd: 0,
      target: 0,
      targetCheck: 0,
      statuses: [],
      dash: null,
      projectileSpeed: 0,
      attackDmgType: 'physical',
      moved: 0,
      diedAt: 0,
      revealedUntil: [0, 0],
      lastDamagedBy: 0,
      lastDamagedByTime: -99,
      invulnUntil: 0,
      tag: 0,
    };
    this.units.push(u);
    this.byId.set(u.id, u);
    return u;
  }

  private blankStats(): Stats {
    return { maxHp: 1, maxMana: 0, ad: 0, ap: 0, armor: 0, mr: 0, as: 1, ms: 0, range: 0, hpRegen: 0, manaRegen: 0, haste: 0, lifesteal: 0 };
  }

  private buildStructures() {
    const lanes = this.setup.midOnly ? (['mid'] as Lane[]) : LANES;
    for (const team of [0, 1] as Team[]) {
      const nexusDef = STRUCTURES.nexus;
      const np = NEXUS_POS[team];
      const nexus = this.addStructure('nexus', team, 'nexus', np.x, np.z, 'base', 0, nexusDef.id);
      const nexusTowers: Unit[] = [];
      for (const p of NEXUS_TOWER_POS[team]) nexusTowers.push(this.addStructure('tower', team, 'nexustower', p.x, p.z, 'base', 4, 'nexustower'));
      const inhibs: Unit[] = [];
      for (const lane of lanes) {
        const d = LANE_STRUCTURE_DIST[lane];
        const pi = structurePoint(team, lane, d.inhib);
        const inhib = this.addStructure('inhibitor', team, 'inhibitor', pi.x, pi.z, lane, 0, 'inhibitor');
        inhib.struct!.superFor = lane;
        inhibs.push(inhib);
        let prev: Unit | null = null;
        const tiers: [number, number, string][] = [
          [1, d.t1, 'tower1'],
          [2, d.t2, 'tower2'],
          [3, d.t3, 'tower3'],
        ];
        const towers: Unit[] = [];
        for (const [tier, dist, defId] of tiers) {
          const p = structurePoint(team, lane, dist);
          const t = this.addStructure('tower', team, defId, p.x, p.z, lane, tier, defId);
          if (prev) t.struct!.requires = [prev.id];
          prev = t;
          towers.push(t);
        }
        // Inhibitor requires the innermost lane tower.
        inhib.struct!.requires = [towers[2].id];
      }
      // Nexus towers require any inhibitor down.
      for (const nt of nexusTowers) {
        nt.struct!.requires = inhibs.map((i) => i.id);
        nt.struct!.requiresAny = true;
      }
      // Nexus requires both nexus towers.
      nexus.struct!.requires = nexusTowers.map((t) => t.id);
    }
  }

  private addStructure(kind: 'tower' | 'inhibitor' | 'nexus', team: Team, defId: string, x: number, z: number, lane: Lane | 'base', tier: number, structId: string): Unit {
    const def = STRUCTURES[structId];
    const stats = this.blankStats();
    stats.maxHp = def.hp;
    stats.armor = def.armor;
    stats.mr = def.mr;
    stats.ad = def.ad;
    stats.as = def.attackInterval > 0 ? 1 / def.attackInterval : 0;
    stats.range = def.range;
    stats.hpRegen = def.hpRegen;
    const u = this.createUnit(kind, team, defId, def.name, x, z, def.radius, def.height, stats);
    u.projectileSpeed = def.projectileSpeed;
    u.attackDmgType = 'physical';
    u.facing = team === 0 ? Math.PI * 0.75 : -Math.PI * 0.25;
    u.struct = { lane, tier, requires: [], requiresAny: false, respawnAt: 0, destroyed: false, maxHpBase: def.hp };
    this.structures.push(u);
    this.structCircle.set(u.id, this.nav.addCircle(x, z, def.radius));
    return u;
  }

  private spawnChampions() {
    const s = this.setup;
    const all = Object.keys(CHAMPIONS);
    const blueIds = s.blueChampions ?? this.defaultBlue(all);
    const redIds = s.redChampions ?? all;
    const lanePlan = this.assignLanes(blueIds, s.playerChampion, s.playerLane);
    const redPlan = this.assignLanes(redIds, null, 'mid');
    for (let slot = 0; slot < blueIds.length; slot++) {
      const isPlayer = blueIds[slot] === s.playerChampion;
      this.addChampion(blueIds[slot], 0, slot, lanePlan[slot], isPlayer);
    }
    for (let slot = 0; slot < redIds.length; slot++) this.addChampion(redIds[slot], 1, slot, redPlan[slot], false);
    this.goldBonus = [1, s.difficulty === 'hard' ? 1.08 : s.difficulty === 'easy' ? 0.9 : 1];
    // The human team is never penalised.
    this.goldBonus[0] = 1;
  }

  private defaultBlue(all: string[]): string[] {
    return all.slice();
  }

  /** Decide a lane per champion. Returns lane (or 'roam' mapped to a lane) per slot. */
  assignLanes(ids: string[], playerChamp: string | null, playerLane: Lane): Lane[] {
    const out: Lane[] = new Array(ids.length).fill('mid');
    const taken = new Array(ids.length).fill(false);
    const slots = ['top', 'mid', 'bot', 'bot', 'roam'];
    const pool = slots.slice();
    if (playerChamp) {
      const pi = ids.indexOf(playerChamp);
      if (pi >= 0) {
        out[pi] = playerLane;
        taken[pi] = true;
        const at = pool.indexOf(playerLane);
        if (at >= 0) pool.splice(at, 1);
        else pool.pop();
      }
    }
    // Greedy: champions in order take their hinted slot if free
    for (let i = 0; i < ids.length; i++) {
      if (taken[i]) continue;
      const hint = CHAMPIONS[ids[i]].laneHint;
      const at = pool.indexOf(hint);
      if (at >= 0) {
        pool.splice(at, 1);
        out[i] = hint === 'roam' ? 'mid' : (hint as Lane);
        taken[i] = true;
      }
    }
    for (let i = 0; i < ids.length; i++) {
      if (taken[i]) continue;
      const p = pool.shift() ?? 'mid';
      out[i] = p === 'roam' ? 'mid' : (p as Lane);
    }
    if (this.setup.midOnly) out.fill('mid');
    return out;
  }

  addChampion(defId: string, team: Team, slot: number, lane: Lane, isPlayer: boolean): Unit {
    const def = CHAMPIONS[defId];
    const base = this.championBaseStats(def, CONFIG.startLevel);
    const sp = SPAWN_POS[team];
    const ox = (slot - 2) * 2.6 * (team === 0 ? 1 : -1);
    const u = this.createUnit('champion', team, defId, def.name, sp.x + ox, sp.z + ox, def.radius, def.height, base);
    u.projectileSpeed = def.projectileSpeed;
    u.attackDmgType = 'physical';
    const champ: ChampState = {
      defId,
      level: CONFIG.startLevel,
      xp: 0,
      skillPoints: CONFIG.startLevel,
      ranks: [0, 0, 0, 0],
      cooldowns: [0, 0, 0, 0],
      gold: this.setup.startGold ?? CONFIG.startGold,
      totalGold: this.setup.startGold ?? CONFIG.startGold,
      items: [null, null, null, null, null, null],
      kills: 0,
      deaths: 0,
      assists: 0,
      cs: 0,
      damageDealt: 0,
      damageTaken: 0,
      respawnAt: 0,
      isPlayer,
      isBot: !isPlayer || this.setup.autoPlayer,
      lane,
      slot,
      lastDamagedAt: -99,
      lastAttackedChampAt: -99,
      lastAttackedChampId: 0,
      damagedBy: new Map(),
      stacks: 0,
      stackUntil: 0,
      streak: 0,
      inShop: true,
    };
    u.champ = champ;
    this.champions.push(u);
    if (isPlayer) this.playerId = u.id;
    this.recomputeStats(u);
    u.hp = u.s.maxHp;
    u.mana = u.s.maxMana;
    return u;
  }

  championBaseStats(def: ChampionDef, level: number): Stats {
    const l = level - 1;
    const b = def.base;
    const g = def.growth;
    return {
      maxHp: b.maxHp + (g.maxHp ?? 0) * l,
      maxMana: b.maxMana + (g.maxMana ?? 0) * l,
      ad: b.ad + (g.ad ?? 0) * l,
      ap: b.ap + (g.ap ?? 0) * l,
      armor: b.armor + (g.armor ?? 0) * l,
      mr: b.mr + (g.mr ?? 0) * l,
      as: b.as * (1 + def.asGrowthPct * l),
      ms: b.ms,
      range: b.range,
      hpRegen: b.hpRegen + (g.hpRegen ?? 0) * l,
      manaRegen: b.manaRegen + (g.manaRegen ?? 0) * l,
      haste: 0,
      lifesteal: 0,
    };
  }

  // ---------------------------------------------------------------- stats

  /** Recompute final stats from level, items and statuses. Keeps hp/mana ratios when max changes. */
  recomputeStats(u: Unit) {
    const prevMaxHp = u.s.maxHp;
    const prevMaxMana = u.s.maxMana;
    const b = u.baseStats;
    const s = u.s;
    s.maxHp = b.maxHp;
    s.maxMana = b.maxMana;
    s.ad = b.ad;
    s.ap = b.ap;
    s.armor = b.armor;
    s.mr = b.mr;
    s.as = b.as;
    s.ms = b.ms;
    s.range = b.range;
    s.hpRegen = b.hpRegen;
    s.manaRegen = b.manaRegen;
    s.haste = b.haste;
    s.lifesteal = b.lifesteal;
    let asBonus = 0;
    if (u.champ) {
      const it = itemStatsTotal(u.champ.items);
      s.maxHp += it.maxHp ?? 0;
      s.maxMana += it.maxMana ?? 0;
      s.ad += it.ad ?? 0;
      s.ap += it.ap ?? 0;
      s.armor += it.armor ?? 0;
      s.mr += it.mr ?? 0;
      asBonus += (it.as ?? 0) / Math.max(0.1, b.as);
      s.ms += it.ms ?? 0;
      s.hpRegen += it.hpRegen ?? 0;
      s.manaRegen += it.manaRegen ?? 0;
      s.haste += it.haste ?? 0;
      s.lifesteal += it.lifesteal ?? 0;
    }
    let slow = 0;
    let msPct = 0;
    let msFlat = 0;
    for (const st of u.statuses) {
      if (st.type === 'slow') slow = Math.max(slow, st.amount);
      else if (st.type === 'buff' && st.stat) {
        const amt = st.amount;
        switch (st.stat) {
          case 'ms':
            if (st.pct) msPct += amt;
            else msFlat += amt;
            break;
          case 'as':
            asBonus += st.pct ? amt : amt / Math.max(0.1, b.as);
            break;
          case 'ad':
            s.ad += st.pct ? b.ad * amt : amt;
            break;
          case 'ap':
            s.ap += st.pct ? Math.max(10, s.ap) * amt : amt;
            break;
          case 'armor':
            s.armor += st.pct ? b.armor * amt : amt;
            break;
          case 'mr':
            s.mr += st.pct ? b.mr * amt : amt;
            break;
          case 'hpRegen':
            s.hpRegen += amt;
            break;
        }
      }
    }
    s.as = Math.min(CONFIG.attackSpeedCap, b.as * (1 + asBonus));
    s.ms = Math.max(CONFIG.moveSpeedMin, (s.ms + msFlat) * (1 + msPct) * (1 - Math.min(CONFIG.statusMaxSlow, slow)));
    if (u.champ) {
      const def = CHAMPIONS[u.champ.defId];
      const p = def.passive;
      if (p.type === 'stackOnHit' && u.champ.stacks > 0 && u.champ.stackUntil > this.time) {
        const amt = p.perStack * u.champ.stacks;
        if (p.stat === 'armor') s.armor += amt;
        else if (p.stat === 'mr') s.mr += amt;
        else if (p.stat === 'ad') s.ad += p.pct ? b.ad * amt : amt;
        else if (p.stat === 'as') s.as = Math.min(CONFIG.attackSpeedCap, s.as * (1 + amt));
      }
    }
    if (s.maxHp !== prevMaxHp && prevMaxHp > 0 && u.alive) u.hp = clamp(u.hp + (s.maxHp - prevMaxHp), 1, s.maxHp);
    if (s.maxMana !== prevMaxMana && prevMaxMana > 0 && u.alive) u.mana = clamp(u.mana + (s.maxMana - prevMaxMana), 0, s.maxMana);
    if (u.hp > s.maxHp) u.hp = s.maxHp;
    if (u.mana > s.maxMana) u.mana = s.maxMana;
  }

  // ---------------------------------------------------------------- queries

  buildSpatial() {
    const sp = this.spatial;
    for (let i = 0; i < sp.cells.length; i++) sp.cells[i].length = 0;
    for (const u of this.units) {
      if (!u.alive || u.removed) continue;
      const cx = clamp(Math.floor((u.x + CONFIG.mapHalf) / sp.cell), 0, sp.n - 1);
      const cz = clamp(Math.floor((u.z + CONFIG.mapHalf) / sp.cell), 0, sp.n - 1);
      sp.cells[cz * sp.n + cx].push(u);
    }
  }

  /** Visit alive units whose center is within radius of (x,z). */
  query(x: number, z: number, radius: number, fn: (u: Unit) => void) {
    const sp = this.spatial;
    const x0 = clamp(Math.floor((x - radius + CONFIG.mapHalf) / sp.cell), 0, sp.n - 1);
    const x1 = clamp(Math.floor((x + radius + CONFIG.mapHalf) / sp.cell), 0, sp.n - 1);
    const z0 = clamp(Math.floor((z - radius + CONFIG.mapHalf) / sp.cell), 0, sp.n - 1);
    const z1 = clamp(Math.floor((z + radius + CONFIG.mapHalf) / sp.cell), 0, sp.n - 1);
    const r2 = radius * radius;
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        const cell = sp.cells[cz * sp.n + cx];
        for (let i = 0; i < cell.length; i++) {
          const u = cell[i];
          if (!u.alive) continue;
          const dx = u.x - x;
          const dz = u.z - z;
          if (dx * dx + dz * dz <= r2) fn(u);
        }
      }
  }

  isEnemy(a: Unit, b: Unit): boolean {
    if (a.team === b.team) return false;
    return true;
  }

  /** Can team see this unit right now? */
  canSee(team: Team, u: Unit): boolean {
    if (u.team === team) return true;
    return this.visible[team].has(u.id);
  }

  /** Whether a structure is currently attackable (backdoor protection). */
  structureVulnerable(u: Unit): boolean {
    const st = u.struct;
    if (!st) return true;
    if (st.destroyed) return false;
    if (!CONFIG.backdoorProtection || st.requires.length === 0) return true;
    let down = 0;
    for (const id of st.requires) {
      const r = this.byId.get(id);
      if (!r || r.struct!.destroyed) down++;
    }
    return st.requiresAny ? down > 0 : down === st.requires.length;
  }

  canBeTargeted(attacker: Unit, v: Unit): boolean {
    if (!v.alive || v.removed) return false;
    if (v.team === attacker.team) return false;
    if (v.invulnUntil > this.time) return false;
    if (v.kind === 'tower' || v.kind === 'inhibitor' || v.kind === 'nexus') {
      if (!this.structureVulnerable(v)) return false;
    }
    if (attacker.kind === 'champion' && !v.struct && !this.canSee(attacker.team as Team, v)) return false;
    return true;
  }

  // ---------------------------------------------------------------- statuses

  hasStatus(u: Unit, type: Status['type']): boolean {
    for (const s of u.statuses) if (s.type === type && s.until > this.time) return true;
    return false;
  }

  addStatus(u: Unit, st: Status) {
    // Stun/silence/root stack by taking the longer duration. Slow takes the strongest. Buffs refresh by tag.
    if (st.tag) {
      const ex = u.statuses.find((s) => s.tag === st.tag && s.type === st.type && s.source === st.source);
      if (ex) {
        ex.until = Math.max(ex.until, st.until);
        ex.amount = st.amount;
        return;
      }
    }
    if (st.type === 'stun' || st.type === 'root' || st.type === 'silence') {
      const ex = u.statuses.find((s) => s.type === st.type);
      if (ex) {
        ex.until = Math.max(ex.until, st.until);
        return;
      }
    }
    u.statuses.push(st);
    this.recomputeStats(u);
  }

  // ---------------------------------------------------------------- commands

  push(cmd: Command) {
    this.commands.push(cmd);
  }

  /** Remove units flagged as removed from the world lists. */
  removeDead() {
    let needs = false;
    for (const u of this.units) {
      if (u.removed) {
        needs = true;
        break;
      }
    }
    if (!needs) return;
    this.units = this.units.filter((u) => !u.removed);
    for (const id of [...this.byId.keys()]) if (this.byId.get(id)!.removed) this.byId.delete(id);
  }

  getPlayer(): Unit | undefined {
    return this.byId.get(this.playerId);
  }

  championsOf(team: Team): Unit[] {
    return this.champions.filter((c) => c.team === team);
  }
}
