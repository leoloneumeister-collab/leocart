/** Core combat primitives: damage, healing, kills, rewards, xp and levels. */
import { CHAMPIONS } from '../data/champions.ts';
import { CONFIG, xpToNextLevel } from '../data/config.ts';
import { SPAWN_POS } from '../data/map.ts';
import { STRUCTURES } from '../data/units.ts';
import { clamp, dist } from './math.ts';
import type { DmgType, Team, Unit } from './types.ts';
import type { World } from './world.ts';

export interface DamageOpts {
  isAttack?: boolean;
  /** Skip passive modifiers (used for true damage ticks). */
  raw?: boolean;
  /** Do not trigger on-hit passives. */
  noPassive?: boolean;
}

/** Edge-to-edge reach for attacks: a.range + victim radius (+ attacker radius for mobile units). */
export function reach(a: Unit, b: Unit): number {
  const own = a.kind === 'tower' ? 0 : a.radius;
  return a.s.range + b.radius + own;
}

export function inReach(a: Unit, b: Unit): boolean {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const r = reach(a, b);
  return dx * dx + dz * dz <= r * r;
}

export function mitigation(resist: number): number {
  return resist >= 0 ? 100 / (100 + resist) : 2 - 100 / (100 - resist);
}

export function lifeFactor(u: Unit): number {
  return u.hp / u.s.maxHp;
}

/** Deal damage and return the amount actually dealt (after mitigation and shields). */
export function dealDamage(w: World, source: Unit | null, target: Unit, amount: number, type: DmgType, opts: DamageOpts = {}): number {
  if (!target.alive || target.removed || amount <= 0) return 0;
  if (target.invulnUntil > w.time) return 0;
  if (target.struct && !w.structureVulnerable(target)) return 0;
  let dmg = amount;

  // Source passives
  if (source?.champ && !opts.raw) {
    const p = CHAMPIONS[source.champ.defId].passive;
    if (p.type === 'lowHpBonus' && target.hp / target.s.maxHp < p.below) dmg *= p.mult;
  }
  // Target passives
  if (target.champ && !opts.raw) {
    const p = CHAMPIONS[target.champ.defId].passive;
    if (p.type === 'damageReduction') dmg *= 1 - p.amount;
  }
  if (type === 'physical') dmg *= mitigation(target.s.armor);
  else if (type === 'magic') dmg *= mitigation(target.s.mr);
  if (dmg < 1) dmg = 1;

  // Shields absorb first
  let absorbed = 0;
  for (const st of target.statuses) {
    if (st.type !== 'shield' || st.until <= w.time || st.amount <= 0) continue;
    const take = Math.min(st.amount, dmg - absorbed);
    st.amount -= take;
    absorbed += take;
    if (absorbed >= dmg) break;
  }
  const dealt = dmg - absorbed;
  target.hp -= dealt;

  // Bookkeeping
  target.lastDamagedBy = source?.id ?? 0;
  target.lastDamagedByTime = w.time;
  if (target.order.t === 'recall' && dealt > 0) cancelRecall(w, target);
  if (target.champ) {
    target.champ.lastDamagedAt = w.time;
    target.champ.damageTaken += dealt;
    if (source?.champ) target.champ.damagedBy.set(source.id, w.time);
  }
  if (target.monster) target.monster.lastDamagedAt = w.time;
  if (source?.champ) {
    source.champ.damageDealt += dealt;
    if (target.kind === 'champion') {
      source.champ.lastAttackedChampAt = w.time;
      source.champ.lastAttackedChampId = target.id;
      if (!opts.noPassive) onChampionHit(w, source, target);
    }
    // Lifesteal on basic attacks
    if (opts.isAttack && source.s.lifesteal > 0 && dealt > 0) heal(w, source, dealt * source.s.lifesteal);
  }
  if (dmg >= 1) {
    w.emit({ t: 'damage', id: target.id, amount: Math.round(dealt + absorbed), dmgType: type, x: target.x, z: target.z, crit: false, source: source?.id ?? 0, team: target.team, kind: target.kind });
  }
  if (target.hp <= 0) killUnit(w, target, source);
  return dealt;
}

function onChampionHit(w: World, source: Unit, _target: Unit) {
  const c = source.champ!;
  const p = CHAMPIONS[c.defId].passive;
  if (p.type === 'stackOnHit' && p.stat !== 'as') {
    c.stacks = Math.min(p.max, (c.stackUntil > w.time ? c.stacks : 0) + 1);
    c.stackUntil = w.time + p.duration;
    w.recomputeStats(source);
  }
}

export function heal(w: World, u: Unit, amount: number) {
  if (!u.alive || amount <= 0) return;
  const before = u.hp;
  u.hp = Math.min(u.s.maxHp, u.hp + amount);
  const got = u.hp - before;
  if (got >= 1) w.emit({ t: 'heal', id: u.id, amount: Math.round(got), x: u.x, z: u.z });
}

export function cancelRecall(w: World, u: Unit) {
  if (u.order.t === 'recall') {
    u.order = { t: 'idle' };
    w.emit({ t: 'recallCancel', id: u.id });
  }
}

// ------------------------------------------------------------------ xp / levels

export function grantXp(w: World, u: Unit, amount: number) {
  const c = u.champ;
  if (!c || amount <= 0) return;
  if (c.level >= CONFIG.maxLevel) return;
  c.xp += amount;
  while (c.level < CONFIG.maxLevel && c.xp >= xpToNextLevel(c.level)) {
    c.xp -= xpToNextLevel(c.level);
    levelUp(w, u);
  }
  if (c.level >= CONFIG.maxLevel) c.xp = 0;
}

export function levelUp(w: World, u: Unit) {
  const c = u.champ!;
  const def = CHAMPIONS[c.defId];
  c.level++;
  c.skillPoints++;
  const old = u.baseStats;
  const nb = w.championBaseStats(def, c.level);
  nb.ms = old.ms;
  u.baseStats = nb;
  w.recomputeStats(u);
  // Level ups restore the growth in hp and mana (recomputeStats adds the diff).
  w.emit({ t: 'levelUp', id: u.id, level: c.level });
}

export function giveGold(w: World, u: Unit, amount: number, show = true) {
  const c = u.champ;
  if (!c) return;
  const g = amount * w.goldBonus[u.team as Team];
  c.gold += g;
  c.totalGold += g;
  if (show && g >= 1) w.emit({ t: 'gold', id: u.id, amount: Math.round(g), x: u.x, z: u.z });
}

// ------------------------------------------------------------------ kills

export function respawnTime(w: World, level: number): number {
  const t = CONFIG.respawnBase + CONFIG.respawnPerLevel * level + Math.max(0, w.time / 60 - 15) * CONFIG.respawnPerMinuteLate;
  return Math.min(CONFIG.respawnMax, t);
}

export function killUnit(w: World, victim: Unit, killer: Unit | null) {
  if (!victim.alive) return;
  victim.hp = 0;
  victim.alive = false;
  victim.diedAt = w.time;
  victim.order = { t: 'idle' };
  victim.path = [];
  victim.dash = null;
  w.emit({ t: 'death', id: victim.id, killer: killer?.id ?? 0, kind: victim.kind, team: victim.team, x: victim.x, z: victim.z, defId: victim.defId, minionType: victim.minion?.type });

  switch (victim.kind) {
    case 'champion':
      championKilled(w, victim, killer);
      break;
    case 'minion':
      minionKilled(w, victim, killer);
      break;
    case 'monster':
      monsterKilled(w, victim, killer);
      break;
    default:
      structureKilled(w, victim, killer);
  }
  if (victim.kind === 'minion' || victim.kind === 'monster') victim.removed = true;
}

function nearbyChampions(w: World, team: Team, x: number, z: number, radius: number): Unit[] {
  const out: Unit[] = [];
  for (const c of w.champions) if (c.team === team && c.alive && dist(c.x, c.z, x, z) <= radius) out.push(c);
  return out;
}

function shareXp(w: World, team: Team, x: number, z: number, xp: number) {
  const list = nearbyChampions(w, team, x, z, CONFIG.xpShareRadius);
  if (list.length === 0) return;
  const each = list.length === 1 ? xp : (xp * 1.2) / list.length;
  for (const c of list) grantXp(w, c, each);
}

function minionKilled(w: World, m: Unit, killer: Unit | null) {
  const ms = m.minion!;
  const enemy: Team = m.team === 0 ? 1 : 0;
  if (killer?.champ) {
    killer.champ.cs++;
    giveGold(w, killer, ms.gold);
  }
  shareXp(w, enemy, m.x, m.z, ms.xp);
}

function monsterKilled(w: World, m: Unit, killer: Unit | null) {
  const ms = m.monster!;
  if (killer?.champ) {
    killer.champ.cs++;
    giveGold(w, killer, ms.gold);
    grantXp(w, killer, ms.xp);
  }
}

function championKilled(w: World, v: Unit, killer: Unit | null) {
  const vc = v.champ!;
  vc.deaths++;
  const bounty = CONFIG.champKillGold + (vc.streak >= 3 ? Math.min(400, 100 * (vc.streak - 2)) : 0);
  vc.streak = 0;
  vc.respawnAt = w.time + respawnTime(w, vc.level);
  v.statuses = v.statuses.filter((s) => s.type === 'buff' && s.tag === 'keep');
  const enemyTeam: Team = v.team === 0 ? 1 : 0;

  const assisters: Unit[] = [];
  for (const [id, t] of vc.damagedBy) {
    if (w.time - t > CONFIG.assistWindow) continue;
    const a = w.get(id);
    if (a && a.champ && a.team !== v.team && a !== killer) assisters.push(a);
  }
  vc.damagedBy.clear();

  let killerChamp: Unit | null = killer?.champ ? killer : null;
  if (!killerChamp && assisters.length > 0) {
    // Killed by a minion or tower: the most recent damager gets the kill credit as an assist only.
  }
  if (killerChamp) {
    killerChamp.champ!.kills++;
    killerChamp.champ!.streak++;
    giveGold(w, killerChamp, bounty);
    w.teamKills[enemyTeam]++;
  } else {
    w.teamKills[enemyTeam]++;
  }
  const pool = killerChamp ? CONFIG.champAssistGoldTotal : bounty * 0.5;
  if (assisters.length > 0) {
    for (const a of assisters) {
      a.champ!.assists++;
      giveGold(w, a, pool / assisters.length);
    }
  }
  // Experience for nearby enemies
  shareXp(w, enemyTeam, v.x, v.z, 90 + 22 * vc.level);
  w.emit({ t: 'kill', killer: killer?.id ?? 0, victim: v.id, assists: assisters.map((a) => a.id), killerTeam: killer ? killer.team : enemyTeam, x: v.x, z: v.z });
  // Shift position to spawn when respawning (handled in the champion step)
}

function structureKilled(w: World, s: Unit, killer: Unit | null) {
  const st = s.struct!;
  st.destroyed = true;
  const circle = w.structCircle.get(s.id);
  if (circle) w.nav.setActive(circle, false);
  const enemy: Team = s.team === 0 ? 1 : 0;
  const def = STRUCTURES[st.maxHpBase === 0 ? 'tower1' : s.defId];
  w.emit({ t: 'structureDown', id: s.id, team: s.team, kind: s.kind, lane: String(st.lane), x: s.x, z: s.z, killer: killer?.id ?? 0 });
  if (s.kind === 'tower') w.teamTowers[enemy]++;
  const gold = def ? def.gold : 0;
  for (const c of w.champions) {
    if (c.team !== enemy) continue;
    const near = dist(c.x, c.z, s.x, s.z) <= 30 || c === killer;
    giveGold(w, c, CONFIG.structureAssistGold + (near ? Math.max(0, gold - CONFIG.structureAssistGold) : 0), near);
  }
  if (s.kind === 'inhibitor') {
    st.respawnAt = w.time + CONFIG.inhibitorRespawn;
    w.emit({ t: 'announce', text: `${enemy === 0 ? 'Blue' : 'Red'} team destroyed an inhibitor`, team: enemy });
  } else if (s.kind === 'nexus') {
    w.winner = enemy;
    w.emit({ t: 'gameOver', winner: enemy });
  } else {
    w.emit({ t: 'announce', text: `${enemy === 0 ? 'Blue' : 'Red'} team destroyed a tower`, team: enemy });
  }
}

// ------------------------------------------------------------------ respawn

export function respawnChampion(w: World, u: Unit) {
  const c = u.champ!;
  const sp = SPAWN_POS[u.team as Team];
  const ox = (c.slot - 2) * 2.6 * (u.team === 0 ? 1 : -1);
  u.x = sp.x + ox;
  u.z = sp.z + ox;
  u.px = u.x;
  u.pz = u.z;
  u.alive = true;
  u.removed = false;
  u.hp = u.s.maxHp;
  u.mana = u.s.maxMana;
  u.order = { t: 'idle' };
  u.path = [];
  u.dash = null;
  u.target = 0;
  u.attackCd = 0;
  u.statuses = [];
  c.stacks = 0;
  w.recomputeStats(u);
  u.hp = u.s.maxHp;
  u.mana = u.s.maxMana;
  u.invulnUntil = w.time + 1.5;
  w.emit({ t: 'respawn', id: u.id });
}

export function clampTo(u: Unit) {
  u.hp = clamp(u.hp, 0, u.s.maxHp);
}
