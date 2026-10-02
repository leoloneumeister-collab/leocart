// Battle simulation. Deterministic (seeded) and free of any DOM, so the UI, the offline-raid
// defender check and the balance tests all run the exact same rules.
//
// Units are in tile coordinates. Ground troops follow a Dijkstra path over the tile grid:
// walls are passable at a cost, and when the next tile is a wall the troop attacks it first.
// The Beacon (the twist of the game) tells troops to prefer targets near a point you choose.

import * as D from './data.js';
import { mulberry32, distToRect } from './util.js';

const N = D.MAP * D.MAP;
export const BEACON_RADIUS = 4.5;
const STEP = 1 / 30;
const isCounted = (b) => b.type !== 'wall' && b.type !== 'bomb';
const RESOURCES = ['gmine', 'cwell', 'vault', 'tank'];

export function createBattle(base, army, opts = {}) {
  const rng = mulberry32(opts.seed ?? 1);
  const B = {
    t: 0,
    time: D.BATTLE_TIME,
    started: false,
    ended: false,
    reason: '',
    rng,
    base,
    mode: opts.mode || 'rival',
    stage: opts.stage ?? null,
    b: [],
    grid: new Int32Array(N),
    units: [],
    nextUnit: 1,
    pending: [],
    events: [],
    reserve: {},
    used: {},
    beacon: null,
    total: 0,
    destroyed: 0,
    keepDown: false,
    stars: 0,
    loot: { gold: 0, crystal: 0 },
    pool: { gold: base.loot.gold, crystal: base.loot.crystal },
    // scratch space for the path search
    pd: new Float32Array(N),
    pp: new Int32Array(N),
  };
  for (const [troop, a] of Object.entries(army)) {
    if (a.count > 0) B.reserve[troop] = { count: a.count, lvl: a.lvl };
  }
  for (const src of base.buildings) {
    const d = D.BUILDINGS[src.type];
    const hp = D.buildingHp(src.type, src.lvl);
    const b = {
      id: src.id, type: src.type, x: src.x, y: src.y, lvl: src.lvl, size: d.size,
      cx: src.x + d.size / 2, cy: src.y + d.size / 2,
      hp, maxHp: hp, alive: true, counted: isCounted(src), cd: rng() * 0.4, ang: 0, share: { gold: 0, crystal: 0 },
      atk: D.DEFENSES.includes(src.type) ? D.defenseStats(src.type, src.lvl) : null,
      trap: src.type === 'bomb' ? D.trapStats(src.lvl) : null,
    };
    B.b.push(b);
    if (b.counted) B.total++;
  }
  B.b.forEach((b, i) => {
    if (b.type === 'bomb') return;
    for (let yy = b.y; yy < b.y + b.size; yy++) for (let xx = b.x; xx < b.x + b.size; xx++) B.grid[yy * D.MAP + xx] = i + 1;
  });
  assignLoot(B);
  return B;
}

function assignLoot(B) {
  const wGold = (b) => (b.type === 'vault' ? 3 : b.type === 'gmine' ? 2 : b.type === 'keep' ? 2 : D.DEFENSES.includes(b.type) ? 0.4 : 0.6);
  const wCrys = (b) => (b.type === 'tank' ? 3 : b.type === 'cwell' ? 2 : b.type === 'keep' ? 2 : D.DEFENSES.includes(b.type) ? 0.4 : 0.6);
  let sg = 0;
  let sc = 0;
  for (const b of B.b) if (b.counted) { sg += wGold(b); sc += wCrys(b); }
  for (const b of B.b) {
    if (!b.counted) continue;
    b.share.gold = (B.pool.gold * wGold(b)) / sg;
    b.share.crystal = (B.pool.crystal * wCrys(b)) / sc;
  }
}

const blockerAt = (B, x, y) => {
  const i = B.grid[y * D.MAP + x];
  return i ? B.b[i - 1] : null;
};

// ---------- deploying ----------

export function canDeploy(B, x, y) {
  if (x < D.LAND0 + 0.3 || y < D.LAND0 + 0.3 || x > D.LAND1 - 0.3 || y > D.LAND1 - 0.3) return false;
  for (const b of B.b) {
    if (!b.alive || b.type === 'bomb') continue;
    if (distToRect(x, y, b.x, b.y, b.size, b.size) < D.RED_ZONE) return false;
  }
  return true;
}

export function remaining(B, troop) {
  return B.reserve[troop] ? B.reserve[troop].count : 0;
}

export function deploy(B, troop, x, y) {
  if (B.ended) return false;
  const r = B.reserve[troop];
  if (!r || r.count < 1) return false;
  if (!canDeploy(B, x, y)) return false;
  r.count--;
  B.used[troop] = (B.used[troop] || 0) + 1;
  B.started = true;
  const st = D.troopStats(troop, r.lvl);
  const spread = st.flying ? 0.5 : 0.35;
  const u = {
    id: B.nextUnit++, troop, lvl: r.lvl, x: x + (B.rng() - 0.5) * spread, y: y + (B.rng() - 0.5) * spread,
    vx: 0, vy: 0, hp: st.hp, maxHp: st.hp, dmg: st.dmg, interval: st.interval, range: st.range, speed: st.speed * (0.95 + B.rng() * 0.1),
    flying: st.flying, pref: st.pref, cd: B.rng() * 0.3, target: null, wallT: null, path: null, pi: 0, alive: true,
    offx: (B.rng() - 0.5) * 0.5, offy: (B.rng() - 0.5) * 0.5, bad: null, dir: 0, moving: false, born: B.t,
    blast: st.blast || 0, wallMul: st.wallMul || 1, retry: 0,
  };
  B.units.push(u);
  B.events.push({ t: 'deploy', x: u.x, y: u.y, troop });
  return true;
}

export function setBeacon(B, x, y) {
  B.beacon = { x, y, r: BEACON_RADIUS, at: B.t };
  for (const u of B.units) {
    if (!u.alive) continue;
    u.target = null;
    u.path = null;
    u.wallT = null;
  }
  B.events.push({ t: 'beacon', x, y });
}

export function clearBeacon(B) {
  B.beacon = null;
}

// ---------- target choice and paths ----------

function inZone(B, b) {
  const bc = B.beacon;
  return Math.hypot(b.cx - bc.x, b.cy - bc.y) <= bc.r + b.size / 2;
}

function nearest(list, u, bad) {
  let best = null;
  let bd = Infinity;
  for (const b of list) {
    if (bad && bad.has(b.id)) continue;
    const d = distToRect(u.x, u.y, b.x, b.y, b.size, b.size);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function chooseTarget(B, u) {
  const live = B.b.filter((b) => b.alive && b.counted);
  if (!live.length) return null;
  const zone = B.beacon ? live.filter((b) => inZone(B, b)) : [];
  const isDef = (b) => D.DEFENSES.includes(b.type);
  const isRes = (b) => RESOURCES.includes(b.type);
  const tiers = [];
  if (u.pref === 'defense') {
    if (zone.length) tiers.push(zone.filter(isDef), zone);
    tiers.push(live.filter(isDef), live);
  } else if (u.pref === 'resource') {
    if (zone.length) tiers.push(zone.filter(isRes), zone);
    tiers.push(live.filter(isRes), live);
  } else {
    if (zone.length) tiers.push(zone);
    tiers.push(live);
  }
  for (const list of tiers) {
    const t = nearest(list, u, u.bad);
    if (t) return t;
  }
  return null;
}

function wallCost(b) {
  return 4 + b.maxHp / 120;
}

// Dijkstra over tiles. Walls (and, in the second pass, any building) can be walked through at a cost.
function findPath(B, sx, sy, goalFn, breakAll) {
  const { pd, pp } = B;
  pd.fill(Infinity);
  pp.fill(-1);
  const heapC = [];
  const heapI = [];
  const push = (c, i) => {
    let k = heapC.length;
    heapC.push(c);
    heapI.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapC[p] <= c) break;
      heapC[k] = heapC[p]; heapI[k] = heapI[p];
      k = p;
    }
    heapC[k] = c; heapI[k] = i;
  };
  const pop = () => {
    const rc = heapC[0];
    const ri = heapI[0];
    const lc = heapC.pop();
    const li = heapI.pop();
    const n = heapC.length;
    if (n > 0) {
      let k = 0;
      for (;;) {
        let ch = 2 * k + 1;
        if (ch >= n) break;
        if (ch + 1 < n && heapC[ch + 1] < heapC[ch]) ch++;
        if (heapC[ch] >= lc) break;
        heapC[k] = heapC[ch]; heapI[k] = heapI[ch];
        k = ch;
      }
      heapC[k] = lc; heapI[k] = li;
    }
    return [rc, ri];
  };
  const si = sy * D.MAP + sx;
  pd[si] = 0;
  push(0, si);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (heapC.length) {
    const [c, i] = pop();
    if (c > pd[i]) continue;
    const x = i % D.MAP;
    const y = (i / D.MAP) | 0;
    if (goalFn(x, y)) {
      const path = [];
      for (let k = i; k !== -1; k = pp[k]) path.push(k);
      path.reverse();
      return path.map((k) => [k % D.MAP, (k / D.MAP) | 0]);
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < D.LAND0 || ny < D.LAND0 || nx >= D.LAND1 || ny >= D.LAND1) continue;
      let extra = 0;
      const bl = blockerAt(B, nx, ny);
      if (bl) {
        if (bl.type === 'wall' || breakAll) extra = wallCost(bl);
        else continue;
      }
      if (dx && dy) {
        if (blockerAt(B, x + dx, y) || blockerAt(B, x, y + dy)) continue;
      }
      const nc = c + (dx && dy ? 1.414 : 1) + extra;
      const ni = ny * D.MAP + nx;
      if (nc < pd[ni]) {
        pd[ni] = nc;
        pp[ni] = i;
        push(nc, ni);
      }
    }
  }
  return null;
}

function reachOf(u) {
  return u.range < 1.5 ? u.range + 0.35 : u.range;
}

function planPath(B, u) {
  const t = u.target;
  const reach = reachOf(u);
  u.wallT = null;
  if (u.flying) {
    u.path = null;
    return true;
  }
  const sx = Math.min(D.LAND1 - 1, Math.max(D.LAND0, Math.floor(u.x)));
  const sy = Math.min(D.LAND1 - 1, Math.max(D.LAND0, Math.floor(u.y)));
  const goalR = u.range < 1.5 ? 0.78 : Math.max(0.78, u.range - 0.5);
  const goal = (x, y) => !blockerAt(B, x, y) && distToRect(x + 0.5, y + 0.5, t.x, t.y, t.size, t.size) <= goalR;
  let path = findPath(B, sx, sy, goal, false);
  if (!path) path = findPath(B, sx, sy, goal, true);
  if (!path) return false;
  // stop in front of the first thing in the way and break it
  for (let i = 1; i < path.length; i++) {
    const bl = blockerAt(B, path[i][0], path[i][1]);
    if (bl && bl !== t) {
      u.wallT = bl;
      path = path.slice(0, i);
      break;
    }
  }
  u.path = path;
  u.pi = path.length > 1 ? 1 : 0;
  void reach;
  return true;
}

function acquire(B, u) {
  for (let guard = 0; guard < 6; guard++) {
    const t = chooseTarget(B, u);
    if (!t) { u.target = null; return false; }
    u.target = t;
    if (planPath(B, u)) return true;
    if (!u.bad) u.bad = new Set();
    u.bad.add(t.id);
    u.target = null;
  }
  return false;
}

// ---------- damage ----------

function damageBuilding(B, b, dmg, byUnit) {
  if (!b.alive) return;
  b.hp -= dmg;
  B.events.push({ t: 'hit', x: b.cx, y: b.cy, id: b.id });
  if (b.hp <= 0) destroyBuilding(B, b, byUnit);
}

function destroyBuilding(B, b) {
  b.alive = false;
  b.hp = 0;
  if (b.type !== 'bomb') {
    for (let yy = b.y; yy < b.y + b.size; yy++) for (let xx = b.x; xx < b.x + b.size; xx++) B.grid[yy * D.MAP + xx] = 0;
  }
  if (b.counted) {
    B.destroyed++;
    B.loot.gold += b.share.gold;
    B.loot.crystal += b.share.crystal;
    if (b.type === 'keep') B.keepDown = true;
    updateStars(B);
  }
  B.events.push({ t: 'destroyed', id: b.id, type: b.type, x: b.cx, y: b.cy, size: b.size });
  for (const u of B.units) {
    if (u.target === b) { u.target = null; u.path = null; u.wallT = null; }
    else if (u.wallT === b) { u.wallT = null; u.path = null; }
  }
}

function updateStars(B) {
  const pct = B.total ? B.destroyed / B.total : 0;
  let s = 0;
  if (pct >= 0.5) s++;
  if (B.keepDown) s++;
  if (B.destroyed >= B.total) s++;
  if (s > B.stars) {
    B.stars = s;
    B.events.push({ t: 'star', n: s });
  }
}

function damageUnit(B, u, dmg) {
  if (!u.alive) return;
  u.hp -= dmg;
  if (u.hp <= 0) {
    u.alive = false;
    B.events.push({ t: 'die', x: u.x, y: u.y, troop: u.troop, flying: u.flying });
  }
}

function explode(B, x, y, r, dmg, groundOnly, kind) {
  for (const u of B.units) {
    if (!u.alive || (groundOnly && u.flying)) continue;
    if (Math.hypot(u.x - x, u.y - y) <= r) damageUnit(B, u, dmg);
  }
  B.events.push({ t: 'boom', x, y, r, kind });
}

// ---------- the tick ----------

export function step(B, dt = STEP) {
  if (B.ended) return;
  if (B.started) B.t += dt;

  // delayed hits and shells
  for (let i = B.pending.length - 1; i >= 0; i--) {
    const p = B.pending[i];
    if (p.at > B.t) continue;
    B.pending.splice(i, 1);
    if (p.kind === 'hit') {
      const u = B.units.find((q) => q.id === p.uid);
      if (u) damageUnit(B, u, p.dmg);
    } else {
      explode(B, p.x, p.y, p.r, p.dmg, true, 'shell');
    }
  }

  // defences
  for (const b of B.b) {
    if (!b.alive) continue;
    if (b.atk) fireDefense(B, b, dt);
    else if (b.trap) checkTrap(B, b);
  }

  // troops
  for (const u of B.units) if (u.alive) updateUnit(B, u, dt);
  separate(B);
  B.units = B.units.filter((u) => u.alive);

  // end conditions
  if (B.started) {
    if (B.destroyed >= B.total) end(B, 'cleared');
    else if (B.t >= B.time) end(B, 'time');
    else if (!B.units.length && !Object.values(B.reserve).some((r) => r.count > 0)) end(B, 'out');
  }
}

function fireDefense(B, b, dt) {
  b.cd -= dt;
  if (b.recoil > 0) b.recoil = Math.max(0, b.recoil - dt * 6);
  if (b.cd > 0) return;
  const a = b.atk;
  let best = null;
  let bd = Infinity;
  for (const u of B.units) {
    if (!u.alive || (u.flying && !a.air)) continue;
    const d = Math.hypot(u.x - b.cx, u.y - b.cy);
    if (d > a.range || d < (a.minRange || 0)) continue;
    if (d < bd) { bd = d; best = u; }
  }
  if (!best) { b.cd = 0; return; }
  b.cd = a.interval;
  b.recoil = 1;
  b.ang = Math.atan2(best.y - b.cy, best.x - b.cx);
  if (a.splash) {
    const lead = a.flight * 0.9;
    const tx = best.x + best.vx * lead;
    const ty = best.y + best.vy * lead;
    B.pending.push({ kind: 'boom', at: B.t + a.flight, x: tx, y: ty, r: a.splash, dmg: a.dmg });
    B.events.push({ t: 'shot', kind: b.type, fx: b.cx, fy: b.cy, tx, ty, flight: a.flight });
  } else {
    B.pending.push({ kind: 'hit', at: B.t + a.flight, uid: best.id, dmg: a.dmg });
    B.events.push({ t: 'shot', kind: b.type, fx: b.cx, fy: b.cy, tx: best.x, ty: best.y, flight: a.flight, uid: best.id });
  }
}

function checkTrap(B, b) {
  const tr = b.trap;
  for (const u of B.units) {
    if (!u.alive || u.flying) continue;
    if (Math.hypot(u.x - b.cx, u.y - b.cy) <= tr.trigger) {
      b.alive = false;
      explode(B, b.cx, b.cy, tr.splash, tr.dmg, true, 'trap');
      B.events.push({ t: 'destroyed', id: b.id, type: 'bomb', x: b.cx, y: b.cy, size: 1 });
      return;
    }
  }
}

function updateUnit(B, u, dt) {
  u.cd -= dt;
  u.moving = false;
  if (u.target && !u.target.alive) { u.target = null; u.path = null; u.wallT = null; }
  if (!u.target) {
    u.retry -= dt;
    if (u.retry > 0) return;
    if (!acquire(B, u)) { u.retry = 0.5; return; }
  }
  if (u.wallT && !u.wallT.alive) { u.wallT = null; u.path = null; }
  if (!u.path && !u.flying) {
    if (!planPath(B, u)) { u.target = null; return; }
  }
  const reach = reachOf(u);
  let tgt = u.wallT || u.target;
  // ranged troops shoot the real target when it is already in range instead of the wall in front of them
  if (u.wallT && u.range >= 1.5 && distToRect(u.x, u.y, u.target.x, u.target.y, u.target.size, u.target.size) <= reach) tgt = u.target;
  const d = distToRect(u.x, u.y, tgt.x, tgt.y, tgt.size, tgt.size);

  if (d <= reach) {
    u.dir = Math.atan2(tgt.cy - u.y, tgt.cx - u.x);
    u.vx = 0;
    u.vy = 0;
    if (u.cd <= 0) attack(B, u, tgt);
    return;
  }
  moveUnit(B, u, tgt, dt);
}

function attack(B, u, tgt) {
  u.cd = u.interval;
  if (u.blast) {
    // sapper: one big bang, mostly useful against walls
    for (const b of B.b) {
      if (!b.alive || b.type === 'bomb') continue;
      if (distToRect(u.x, u.y, b.x, b.y, b.size, b.size) > u.blast) continue;
      damageBuilding(B, b, b.type === 'wall' ? u.dmg * u.wallMul : u.dmg, u);
    }
    B.events.push({ t: 'boom', x: u.x, y: u.y, r: u.blast, kind: 'sapper' });
    u.alive = false;
    return;
  }
  if (u.range >= 1.5) B.events.push({ t: 'shot', kind: 'sling', fx: u.x, fy: u.y, tx: tgt.cx, ty: tgt.cy, flight: 0.15 });
  else B.events.push({ t: 'swing', x: u.x, y: u.y, dir: u.dir, troop: u.troop });
  damageBuilding(B, tgt, u.dmg, u);
}

function moveUnit(B, u, tgt, dt) {
  let tx;
  let ty;
  if (u.flying || !u.path || u.pi >= u.path.length) {
    tx = Math.max(tgt.x, Math.min(tgt.x + tgt.size, u.x));
    ty = Math.max(tgt.y, Math.min(tgt.y + tgt.size, u.y));
    if (tx === u.x && ty === u.y) { tx = tgt.cx; ty = tgt.cy; }
  } else {
    const wp = u.path[u.pi];
    tx = wp[0] + 0.5 + u.offx * 0.7;
    ty = wp[1] + 0.5 + u.offy * 0.7;
  }
  const dx = tx - u.x;
  const dy = ty - u.y;
  const dist = Math.hypot(dx, dy);
  const stepLen = u.speed * dt;
  if (dist <= stepLen) {
    u.x = tx;
    u.y = ty;
    if (u.path && u.pi < u.path.length) u.pi++;
    u.vx = 0;
    u.vy = 0;
  } else {
    u.x += (dx / dist) * stepLen;
    u.y += (dy / dist) * stepLen;
    u.vx = (dx / dist) * u.speed;
    u.vy = (dy / dist) * u.speed;
    u.dir = Math.atan2(dy, dx);
  }
  u.moving = true;
}

function separate(B) {
  const us = B.units;
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < us.length; j++) {
      const b = us[j];
      if (!b.alive || a.flying !== b.flying) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.09 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (0.3 - d) * 0.25;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
    }
  }
}

// ---------- ending ----------

export function end(B, reason) {
  if (B.ended) return;
  B.ended = true;
  B.reason = reason;
  B.events.push({ t: 'end', reason });
}

export function result(B) {
  const pct = B.total ? Math.floor((B.destroyed / B.total) * 100) : 0;
  const won = B.stars >= 1;
  const r = {
    stars: B.stars,
    pct,
    destroyed: B.destroyed,
    total: B.total,
    time: B.t,
    reason: B.reason,
    loot: { gold: Math.floor(B.loot.gold), crystal: Math.floor(B.loot.crystal) },
    used: { ...B.used },
    stage: B.stage,
    trophies: 0,
    trophyLoss: 0,
  };
  if (B.mode === 'rival') {
    r.trophies = won ? B.base.trophyWin + B.stars * 6 : 0;
    r.trophyLoss = won ? 0 : B.base.trophyLose;
  }
  return r;
}

// ---------- automatic play (offline raids, balance tests) ----------

// A simple attacker: drops the army in a few clumps on one side, tanks first.
export function autoPlay(B, opts = {}) {
  const rng = mulberry32((opts.seed ?? 1) * 31 + 5);
  const keep = B.b.find((b) => b.type === 'keep') || B.b[0];
  const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const [sx, sy] = sides[Math.floor(rng() * 4)];
  const spots = [];
  for (let k = 0; k < 3; k++) {
    for (let tries = 0; tries < 400; tries++) {
      const along = (rng() - 0.5) * 18;
      const x = sx ? (sx > 0 ? D.LAND1 - 1.5 : D.LAND0 + 1.5) : keep.cx + along;
      const y = sy ? (sy > 0 ? D.LAND1 - 1.5 : D.LAND0 + 1.5) : keep.cy + along;
      if (canDeploy(B, x, y)) { spots.push([x, y]); break; }
    }
  }
  if (!spots.length) {
    for (let x = D.LAND0 + 1; x < D.LAND1 - 1; x += 1) for (const y of [D.LAND0 + 1.5, D.LAND1 - 1.5]) if (canDeploy(B, x, y)) spots.push([x, y]);
  }
  if (!spots.length) return;
  const order = ['brute', 'sapper', 'squire', 'slinger', 'glider'];
  let i = 0;
  for (const t of order) {
    let fails = 0;
    while (remaining(B, t) > 0 && fails < 12) {
      const [x, y] = spots[i++ % spots.length];
      if (!deploy(B, t, x + (rng() - 0.5) * 1.2, y + (rng() - 0.5) * 1.2)) fails++;
    }
  }
}

export function runToEnd(B, maxSteps = 8000) {
  for (let i = 0; i < maxSteps && !B.ended; i++) {
    step(B, STEP);
    B.events.length = 0;
  }
  if (!B.ended) end(B, 'time');
  return result(B);
}

export const STEP_DT = STEP;
