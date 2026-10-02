/** Passive gold, skill points, shop. */
import { CHAMPIONS } from '../data/champions.ts';
import { CONFIG } from '../data/config.ts';
import { INVENTORY_SIZE, ITEMS, priceWith } from '../data/items.ts';
import type { Unit } from './types.ts';
import type { World } from './world.ts';

export function stepEconomy(w: World, dt: number) {
  if (w.time < CONFIG.passiveGoldStart) return;
  for (const c of w.champions) {
    if (!c.alive) continue;
    const g = CONFIG.passiveGoldPerSec * dt * w.goldBonus[c.team as 0 | 1];
    c.champ!.gold += g;
    c.champ!.totalGold += g;
  }
}

export function maxRank(slot: number): number {
  return slot === 3 ? 3 : 5;
}

export function canLevelSlot(u: Unit, slot: number): boolean {
  const c = u.champ;
  if (!c || c.skillPoints <= 0) return false;
  const r = c.ranks[slot];
  if (r >= maxRank(slot)) return false;
  if (slot === 3) {
    const need = CONFIG.ultLevels[r];
    return need !== undefined && c.level >= need;
  }
  // Basic abilities cap at ceil(level/2) like most genre conventions.
  return r < Math.ceil(c.level / 2);
}

export function levelSlot(w: World, u: Unit, slot: number): boolean {
  if (!canLevelSlot(u, slot)) return false;
  const c = u.champ!;
  c.ranks[slot]++;
  c.skillPoints--;
  w.recomputeStats(u);
  return true;
}

export function canBuy(u: Unit, id: string): { ok: boolean; cost: number; reason?: string } {
  const c = u.champ;
  const def = ITEMS[id];
  if (!c || !def) return { ok: false, cost: 0, reason: 'unknown' };
  if (!c.inShop) return { ok: false, cost: def.cost, reason: 'shop' };
  const { cost, consumed } = priceWith(id, c.items);
  if (def.category === 'boots') {
    const hasBoots = c.items.some((i) => i && ITEMS[i].category === 'boots');
    const upgrades = consumed.some((idx) => ITEMS[c.items[idx]!].category === 'boots');
    if (hasBoots && !upgrades) return { ok: false, cost, reason: 'boots' };
  }
  const free = c.items.filter((i) => i === null).length + consumed.length;
  if (free <= 0) return { ok: false, cost, reason: 'full' };
  if (c.gold < cost) return { ok: false, cost, reason: 'gold' };
  return { ok: true, cost };
}

export function buyItem(w: World, u: Unit, id: string): boolean {
  const chk = canBuy(u, id);
  if (!chk.ok) return false;
  const c = u.champ!;
  const { cost, consumed } = priceWith(id, c.items);
  for (const idx of consumed) c.items[idx] = null;
  const slot = c.items.findIndex((i) => i === null);
  if (slot < 0 || slot >= INVENTORY_SIZE) return false;
  c.items[slot] = id;
  c.gold -= cost;
  w.recomputeStats(u);
  w.emit({ t: 'buy', id: u.id, item: id });
  return true;
}

export function sellItem(w: World, u: Unit, index: number): boolean {
  const c = u.champ;
  if (!c || !c.inShop) return false;
  const id = c.items[index];
  if (!id) return false;
  c.items[index] = null;
  c.gold += Math.floor(ITEMS[id].cost * 0.7);
  w.recomputeStats(u);
  w.emit({ t: 'sell', id: u.id, item: id });
  return true;
}

/** Skill order for auto-levelling (bots). */
export function autoLevel(w: World, u: Unit) {
  const c = u.champ!;
  const def = CHAMPIONS[c.defId];
  let guard = 0;
  while (c.skillPoints > 0 && guard++ < 6) {
    if (canLevelSlot(u, 3)) {
      levelSlot(w, u, 3);
      continue;
    }
    let done = false;
    for (const slot of def.levelOrder) {
      if (canLevelSlot(u, slot)) {
        levelSlot(w, u, slot);
        done = true;
        break;
      }
    }
    if (!done) {
      for (let s = 0; s < 3; s++)
        if (canLevelSlot(u, s)) {
          levelSlot(w, u, s);
          done = true;
          break;
        }
    }
    if (!done) break;
  }
}
