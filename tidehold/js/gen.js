// Procedural enemy islands. Both the campaign outposts and the rivals come from the same
// generator: a "tier" (1 to 30) decides how many defences there are and how strong they are.

import * as D from './data.js';
import { mulberry32, clamp, pick } from './util.js';

export const OUTPOST_COUNT = 30;

const P1 = ['Driftwood', 'Gull Rock', 'Saltmarsh', 'Ember', 'Kelp', 'Barnacle', 'Thistle', 'Cinder', 'Pebble', 'Marrow', 'Gale', 'Tern'];
const P2 = ['Camp', 'Outpost', 'Redoubt', 'Hold', 'Landing', 'Fort', 'Cove', 'Bastion', 'Watch', 'Haven'];
const N1 = ['Brine', 'Mossy', 'Captain', 'Old', 'Lady', 'Salty', 'Rusty', 'Grim', 'Big', 'Lucky', 'Stormy', 'Wily'];
const N2 = ['Finn', 'Marlow', 'Tilda', 'Bram', 'Odo', 'Perrin', 'Wren', 'Jory', 'Nessa', 'Hob', 'Ysolde', 'Kit', 'Garrick', 'Mab'];

function nice(n) {
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

export function tierParams(t) {
  t = clamp(t, 1, 30);
  const lv = clamp(1 + Math.floor((t - 1) / 4.2), 1, D.MAX_LVL);
  return {
    t,
    keepLvl: clamp(1 + Math.floor((t - 1) / 5), 1, D.KEEP_MAX),
    lv,
    cannon: Math.min(8, 1 + Math.floor(t / 3)),
    ballista: t < 4 ? 0 : Math.min(5, 1 + Math.floor((t - 4) / 4)),
    mortar: t < 8 ? 0 : Math.min(4, 1 + Math.floor((t - 8) / 6)),
    bomb: t < 3 ? 0 : Math.min(8, Math.floor(t / 3)),
    wall: t < 4 ? 0 : Math.min(130, 10 + (t - 4) * 5),
    gmine: Math.min(5, 1 + Math.floor(t / 6)),
    cwell: Math.min(5, 1 + Math.floor(t / 6)),
    vault: Math.min(4, 1 + Math.floor(t / 9)),
    tank: Math.min(4, 1 + Math.floor(t / 9)),
    camp: Math.min(4, 1 + Math.floor(t / 8)),
    barracks: Math.min(3, 1 + Math.floor(t / 10)),
    forge: t >= 8 ? 1 : 0,
  };
}

export function lootForTier(t) {
  return { gold: nice(500 * 1.24 ** (t - 1)), crystal: nice(450 * 1.24 ** (t - 1)) };
}

function stageName(stage) {
  const r = mulberry32(stage * 7919 + 3);
  return `${pick(r, P1)} ${pick(r, P2)}`;
}

export function outpost(stage) {
  const base = makeBase(stage, stage * 1013 + 17, stageName(stage));
  base.kind = 'outpost';
  base.stage = stage;
  return base;
}

// A rival island scaled to the player's Keep and trophies.
export function rival(keepLvl, trophies, seed) {
  const r = mulberry32(seed * 6271 + 29);
  const t = clamp(Math.round(1 + (keepLvl - 1) * 4.2 + (r() * 3.2 - 1.2) + trophies / 500), 1, 30);
  const base = makeBase(t, seed * 337 + 11, `${pick(r, N1)} ${pick(r, N2)}`);
  base.kind = 'rival';
  base.trophies = Math.max(0, Math.round(trophies + (r() - 0.5) * 120));
  base.trophyWin = 18 + Math.round(r() * 6);
  base.trophyLose = 10 + Math.round(r() * 5);
  // rivals sit on a bit more than outposts of the same tier
  base.loot = { gold: nice(base.loot.gold * (1 + r() * 0.35)), crystal: nice(base.loot.crystal * (1 + r() * 0.35)) };
  return base;
}

function makeBase(tier, seed, name) {
  const rng = mulberry32(seed);
  const p = tierParams(tier);
  const grid = new Uint8Array(D.MAP * D.MAP);
  const out = [];
  let nextId = 1;
  const lo = D.BUILD0;
  const hi = D.BUILD1;

  const area = (x, y, w, h, gap) => {
    for (let yy = y - gap; yy < y + h + gap; yy++) {
      for (let xx = x - gap; xx < x + w + gap; xx++) {
        if (xx < 0 || yy < 0 || xx >= D.MAP || yy >= D.MAP) continue;
        if (grid[yy * D.MAP + xx]) return false;
      }
    }
    return x >= lo && y >= lo && x + w <= hi && y + h <= hi;
  };
  const mark = (x, y, w, h) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy * D.MAP + xx] = 1;
  };
  const put = (type, x, y, lvl) => {
    const s = D.BUILDINGS[type].size;
    mark(x, y, s, s);
    const b = { id: nextId++, type, x, y, lvl: clamp(lvl, 1, D.BUILDINGS[type].max) };
    out.push(b);
    return b;
  };
  const cx = 17 + Math.round((rng() - 0.5) * 4);
  const cy = 17 + Math.round((rng() - 0.5) * 4);
  const placeNear = (type, r0, r1, lvl, gap = 1) => {
    const s = D.BUILDINGS[type].size;
    for (let tries = 0; tries < 220; tries++) {
      const a = rng() * Math.PI * 2;
      const r = r0 + rng() * (r1 - r0 + tries / 14);
      const x = Math.round(cx + Math.cos(a) * r - s / 2);
      const y = Math.round(cy + Math.sin(a) * r - s / 2);
      if (area(x, y, s, s, gap)) return put(type, x, y, lvl);
    }
    return null;
  };
  const lvlJ = () => p.lv + (rng() < 0.3 ? -1 : 0);

  const keep = put('keep', cx - 2, cy - 2, p.keepLvl);
  const core = [keep];
  for (let i = 0; i < p.vault; i++) core.push(placeNear('vault', 4, 7, lvlJ()));
  for (let i = 0; i < p.tank; i++) core.push(placeNear('tank', 4, 7, lvlJ()));
  for (let i = 0; i < p.mortar; i++) core.push(placeNear('mortar', 4, 7, p.lv));
  for (let i = 0; i < p.ballista; i++) placeNear('ballista', 4, 9, p.lv);
  for (let i = 0; i < p.cannon; i++) placeNear('cannon', 4.5, 10, p.lv);
  for (let i = 0; i < p.gmine; i++) placeNear('gmine', 7, 12, lvlJ());
  for (let i = 0; i < p.cwell; i++) placeNear('cwell', 7, 12, lvlJ());
  for (let i = 0; i < p.camp; i++) placeNear('camp', 8, 13, lvlJ());
  for (let i = 0; i < p.barracks; i++) placeNear('barracks', 8, 13, lvlJ());
  if (p.forge) placeNear('forge', 8, 13, lvlJ());

  // walls: an inner ring around the core, an outer partial ring at higher tiers
  let wallsLeft = p.wall;
  const wallLvl = Math.max(1, p.lv - 1);
  const putWall = (x, y) => {
    if (wallsLeft <= 0 || x < lo || y < lo || x >= hi || y >= hi || grid[y * D.MAP + x]) return false;
    put('wall', x, y, wallLvl);
    wallsLeft--;
    return true;
  };
  const ring = (x0, y0, x1, y1, openProb, gapEvery) => {
    const tiles = [];
    for (let x = x0; x <= x1; x++) { tiles.push([x, y0], [x, y1]); }
    for (let y = y0 + 1; y < y1; y++) { tiles.push([x0, y], [x1, y]); }
    const gaps = new Set();
    const gapCount = 1 + Math.floor(rng() * 2);
    for (let g = 0; g < gapCount; g++) gaps.add(Math.floor(rng() * tiles.length));
    tiles.forEach(([x, y], i) => {
      if (gaps.has(i) || gaps.has(i - 1)) return;
      if (rng() < openProb) return;
      if (gapEvery && i % gapEvery === 0) return;
      putWall(x, y);
    });
  };
  if (p.wall > 0) {
    let x0 = 99; let y0 = 99; let x1 = 0; let y1 = 0;
    for (const b of core) {
      if (!b) continue;
      const s = D.BUILDINGS[b.type].size;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + s - 1); y1 = Math.max(y1, b.y + s - 1);
    }
    ring(x0 - 1, y0 - 1, x1 + 1, y1 + 1, tier > 14 ? 0 : 0.03, 0);
    if (p.t >= 10 && wallsLeft > 8) {
      let ox0 = 99; let oy0 = 99; let ox1 = 0; let oy1 = 0;
      for (const b of out) {
        if (b.type === 'wall' || b.type === 'bomb') continue;
        const s = D.BUILDINGS[b.type].size;
        ox0 = Math.min(ox0, b.x); oy0 = Math.min(oy0, b.y); ox1 = Math.max(ox1, b.x + s - 1); oy1 = Math.max(oy1, b.y + s - 1);
      }
      ring(ox0 - 1, oy0 - 1, ox1 + 1, oy1 + 1, 0.12, 7);
    }
  }
  // traps go into whatever gaps are left
  for (let i = 0; i < p.bomb; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const a = rng() * Math.PI * 2;
      const r = 4 + rng() * 9;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (area(x, y, 1, 1, 0)) { put('bomb', x, y, Math.min(4, 1 + Math.floor(p.lv / 2))); break; }
    }
  }

  return {
    name,
    tier,
    kind: 'rival',
    keepLvl: p.keepLvl,
    buildings: out,
    loot: lootForTier(tier),
    trophies: 0,
    trophyWin: 20,
    trophyLose: 12,
  };
}

// Turn the player's own island into a base the battle sim can attack.
export function fromPlayer(S, name = 'Your island') {
  return {
    name,
    tier: 0,
    kind: 'self',
    keepLvl: S.buildings.find((b) => b.type === 'keep').lvl,
    buildings: S.buildings.filter((b) => b.lvl >= 1).map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, lvl: b.lvl })),
    loot: { gold: Math.floor(S.res.gold * 0.2), crystal: Math.floor(S.res.crystal * 0.2) },
    trophies: S.trophies,
    trophyWin: 0,
    trophyLose: 0,
  };
}

// A believable attacking army for a player with this Keep level. Used for the defence test.
export function typicalArmy(k) {
  const camps = D.BUILDINGS.camp.counts[k - 1];
  const cap = camps * D.housingOf(Math.min(D.MAX_LVL, k + 1));
  const lvl = Math.max(1, k - 1);
  const mix = {
    1: { squire: 0.6, slinger: 0.4 },
    2: { squire: 0.5, slinger: 0.3, sapper: 0.2 },
    3: { squire: 0.45, slinger: 0.25, sapper: 0.15, brute: 0.15 },
    4: { squire: 0.35, slinger: 0.2, sapper: 0.1, brute: 0.2, glider: 0.15 },
    5: { squire: 0.3, slinger: 0.2, sapper: 0.1, brute: 0.25, glider: 0.15 },
    6: { squire: 0.3, slinger: 0.2, sapper: 0.1, brute: 0.25, glider: 0.15 },
  }[clamp(k, 1, 6)];
  const army = {};
  for (const [t, f] of Object.entries(mix)) army[t] = { count: Math.floor((cap * f) / D.TROOPS[t].housing), lvl };
  return army;
}
