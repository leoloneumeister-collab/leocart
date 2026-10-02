/** Minion waves: spawning, lane following and combat AI. */
import { CONFIG } from '../data/config.ts';
import { LANE_POINTS, LANES } from '../data/map.ts';
import type { Pt } from '../data/map.ts';
import { MINIONS } from '../data/units.ts';
import { inReach } from './core.ts';
import { performAttack } from './attack.ts';
import { dist, facingTo } from './math.ts';
import { followPath } from './movement.ts';
import type { Lane, MinionType, Team, Unit } from './types.ts';
import type { World } from './world.ts';

const forwardCache = new Map<string, Pt[]>();

export function lanePath(team: Team, lane: Lane): Pt[] {
  const key = `${team}:${lane}`;
  let p = forwardCache.get(key);
  if (!p) {
    p = LANE_POINTS[lane].map((q) => ({ ...q }));
    if (team === 1) p.reverse();
    forwardCache.set(key, p);
  }
  return p;
}

function lanesInPlay(w: World): readonly Lane[] {
  return w.setup.midOnly ? (['mid'] as const) : LANES;
}

export function stepMinions(w: World, dt: number) {
  scheduleWaves(w);
  processQueue(w);
  for (const u of w.units) {
    if (u.kind === 'minion' && u.alive) minionAI(w, u, dt);
  }
}

function enemyInhibitorsDown(w: World, team: Team, lane: Lane): { lane: boolean; all: boolean } {
  const enemy = team === 0 ? 1 : 0;
  let laneDown = false;
  let count = 0;
  let total = 0;
  for (const s of w.structures) {
    if (s.team !== enemy || s.kind !== 'inhibitor') continue;
    total++;
    if (s.struct!.destroyed) {
      count++;
      if (s.struct!.lane === lane) laneDown = true;
    }
  }
  return { lane: laneDown, all: total > 0 && count === total };
}

function scheduleWaves(w: World) {
  if (w.time < w.nextWave) return;
  w.waveNumber++;
  const wave = w.waveNumber;
  const cannon = wave % CONFIG.cannonEvery === 0 || w.time > CONFIG.cannonEveryLateAfter;
  for (const team of [0, 1] as Team[]) {
    for (const lane of lanesInPlay(w)) {
      const types: MinionType[] = [];
      for (let i = 0; i < CONFIG.meleePerWave; i++) types.push('melee');
      const inh = enemyInhibitorsDown(w, team, lane);
      if (inh.lane) {
        types.push('super');
        if (inh.all) types.push('super');
      }
      if (cannon) types.push('cannon');
      for (let i = 0; i < CONFIG.casterPerWave; i++) types.push('caster');
      types.forEach((type, index) => w.spawnQueue.push({ at: w.time + index * CONFIG.minionSpawnGap, team, lane, type, index }));
    }
  }
  w.nextWave += CONFIG.waveInterval;
}

function processQueue(w: World) {
  if (w.spawnQueue.length === 0) return;
  const rest = [];
  for (const item of w.spawnQueue) {
    if (item.at <= w.time) spawnMinion(w, item.team, item.lane, item.type, item.index);
    else rest.push(item);
  }
  w.spawnQueue = rest;
}

export function spawnMinion(w: World, team: Team, lane: Lane, type: MinionType, index: number): Unit {
  const def = MINIONS[type];
  const path = lanePath(team, lane);
  const mins = w.time / 60;
  const hpScale = 1 + CONFIG.minionHpGrowthPerMin * mins;
  const dmgScale = 1 + CONFIG.minionDmgGrowthPerMin * mins;
  const goldScale = 1 + CONFIG.minionGoldGrowthPerMin * mins;
  const lateral = (w.rng.next() - 0.5) * 7;
  const dx = path[1].x - path[0].x;
  const dz = path[1].z - path[0].z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  const stats = {
    maxHp: def.hp * hpScale,
    maxMana: 0,
    ad: def.ad * dmgScale,
    ap: 0,
    armor: def.armor,
    mr: def.mr,
    as: def.as,
    ms: def.ms,
    range: def.range,
    hpRegen: 0,
    manaRegen: 0,
    haste: 0,
    lifesteal: 0,
  };
  const u = w.createUnit('minion', team, type, def.name, path[0].x + nx * lateral, path[0].z + nz * lateral, def.radius, def.height, stats);
  u.projectileSpeed = def.projectileSpeed;
  u.attackDmgType = def.dmgType;
  u.minion = { type, lane, wp: 1, lateral, gold: def.gold * goldScale, xp: def.xp, dmgScale: 1 };
  u.facing = facingTo(path[0].x, path[0].z, path[1].x, path[1].z);
  void index;
  w.emit({ t: 'spawn', id: u.id });
  return u;
}

function pickMinionTarget(w: World, u: Unit): Unit | null {
  const m = u.minion!;
  const def = MINIONS[m.type];
  let bestMinion: Unit | null = null;
  let bmd = Infinity;
  let bestChamp: Unit | null = null;
  let bcd = Infinity;
  let aggroChamp: Unit | null = null;
  let acd = Infinity;
  let bestStruct: Unit | null = null;
  let bsd = Infinity;
  w.query(u.x, u.z, def.aggro + 3, (v) => {
    if (v.team === u.team || !w.canBeTargeted(u, v)) return;
    const d = dist(u.x, u.z, v.x, v.z) - v.radius;
    if (d > def.aggro) return;
    if (v.kind === 'minion' || v.kind === 'monster') {
      if (d < bmd) {
        bmd = d;
        bestMinion = v;
      }
    } else if (v.kind === 'champion') {
      if (d < bcd) {
        bcd = d;
        bestChamp = v;
      }
      const c = v.champ!;
      if (w.time - c.lastAttackedChampAt < CONFIG.aggroMemory) {
        const victim = w.get(c.lastAttackedChampId);
        if (victim && victim.team === u.team && d < acd) {
          acd = d;
          aggroChamp = v;
        }
      }
    } else if (d < bsd) {
      bsd = d;
      bestStruct = v;
    }
  });
  return aggroChamp ?? bestMinion ?? bestChamp ?? bestStruct;
}

function minionAI(w: World, u: Unit, dt: number) {
  const m = u.minion!;
  u.attackCd = Math.max(0, u.attackCd - dt);
  u.moved = 0;
  if (w.hasStatus(u, 'stun')) return;
  u.targetCheck -= dt;
  let t = u.target ? w.get(u.target) : undefined;
  if (t && (!t.alive || !w.canBeTargeted(u, t) || dist(u.x, u.z, t.x, t.z) > MINIONS[m.type].aggro + 5)) {
    t = undefined;
    u.target = 0;
  }
  if (!t || u.targetCheck <= 0) {
    const nt = pickMinionTarget(w, u);
    // Keep an in-reach target to avoid dithering; otherwise take the new one.
    if (!(t && inReach(u, t) && nt && nt !== t && nt.kind !== 'champion')) t = nt ?? undefined;
    u.target = t ? t.id : 0;
    u.targetCheck = 0.4;
  }
  if (t) {
    if (inReach(u, t)) {
      u.facing = facingTo(u.x, u.z, t.x, t.z);
      if (u.attackCd <= 0) performAttack(w, u, t);
    } else {
      u.path = [];
      followPath(w, u, dt, t.x, t.z, 0.1);
    }
    return;
  }
  // Follow the lane
  const path = lanePath(u.team as Team, m.lane);
  if (m.wp >= path.length) m.wp = path.length - 1;
  const p = path[m.wp];
  const prev = path[Math.max(0, m.wp - 1)];
  let dx = p.x - prev.x;
  let dz = p.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const gx = p.x - dz * m.lateral;
  const gz = p.z + dx * m.lateral;
  if (dist(u.x, u.z, gx, gz) < 4.5 && m.wp < path.length - 1) m.wp++;
  u.path = [];
  followPath(w, u, dt, gx, gz, 0.3);
}
