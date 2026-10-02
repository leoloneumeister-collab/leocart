import { ECON, ROUND, type Team } from './constants.ts';
import { GRENADES, WEAPONS, type GrenadeKind, type WeaponDef } from './weapons.ts';
import { grenadeCount, mkWeapon, type Actor } from './actor.ts';
import { selectSlot } from './combat.ts';
import type { Sim } from './sim.ts';

export type BuyItem = string; // weapon id, grenade kind, 'kevlar', 'armor', 'kit'

export interface ShopEntry { id: string; name: string; price: number; kind: 'weapon' | 'gear' | 'grenade'; group: string; def?: WeaponDef }

export function shopFor(team: Team): ShopEntry[] {
  const out: ShopEntry[] = [];
  const grp = (c: string) => (c === 'pistol' ? 'Pistols' : c === 'smg' ? 'SMGs' : c === 'rifle' ? 'Rifles' : c === 'sniper' ? 'Snipers' : 'Heavy');
  for (const w of Object.values(WEAPONS)) {
    if (w.cls === 'knife') continue;
    if (w.team !== 2 && w.team !== team) continue;
    if (w.price === 0) continue;
    out.push({ id: w.id, name: w.name, price: w.price, kind: 'weapon', group: grp(w.cls), def: w });
  }
  out.push({ id: 'kevlar', name: 'Kevlar Vest', price: ECON.kevlar, kind: 'gear', group: 'Gear' });
  out.push({ id: 'armor', name: 'Kevlar + Helmet', price: ECON.helmet, kind: 'gear', group: 'Gear' });
  if (team === 0) out.push({ id: 'kit', name: 'Defuse Kit', price: ECON.kit, kind: 'gear', group: 'Gear' });
  for (const g of Object.values(GRENADES)) out.push({ id: g.id, name: g.name, price: g.price, kind: 'grenade', group: 'Grenades' });
  return out;
}

export function canBuy(sim: Sim, a: Actor): boolean {
  if (!a.alive) return false;
  if (sim.cfg.mode === 'dm') return true;
  return sim.m.phase === 'freeze';
}

/** Price the actor would actually pay right now, or -1 if the item cannot be bought. */
export function priceFor(a: Actor, item: BuyItem): number {
  const w = WEAPONS[item];
  if (w) {
    if (w.team !== 2 && w.team !== a.team) return -1;
    if (w.cls === 'knife') return -1;
    return w.price;
  }
  if (item === 'kevlar') return a.armor >= 100 ? -1 : ECON.kevlar;
  if (item === 'armor') {
    if (a.armor >= 100 && a.helmet) return -1;
    return a.armor >= 100 ? ECON.helmet - ECON.kevlar : ECON.helmet;
  }
  if (item === 'kit') return a.team === 0 && !a.kit ? ECON.kit : -1;
  const g = GRENADES[item as GrenadeKind];
  if (g) {
    if (a.grenades[g.id] >= g.max || grenadeCount(a) >= 4) return -1;
    return g.price;
  }
  return -1;
}

export function buyItem(sim: Sim, a: Actor, item: BuyItem, freeArg = false): boolean {
  if (!canBuy(sim, a)) return false;
  const free = freeArg || sim.cfg.mode === 'dm';
  const price = priceFor(a, item);
  if (price < 0) return false;
  if (!free && a.money < price) return false;
  const w = WEAPONS[item];
  if (w) {
    if (w.slot === 'primary') {
      if (a.primary) sim.dropWeapon(a, 'primary');
      a.primary = mkWeapon(item);
      selectSlot(sim, a, 'primary');
    } else {
      if (a.secondary) sim.dropWeapon(a, 'secondary');
      a.secondary = mkWeapon(item);
      if (!a.primary) selectSlot(sim, a, 'secondary');
    }
  } else if (item === 'kevlar') { a.armor = 100; }
  else if (item === 'armor') { a.armor = 100; a.helmet = true; }
  else if (item === 'kit') { a.kit = true; }
  else { a.grenades[item as GrenadeKind]++; }
  if (!free && sim.cfg.mode !== 'dm') a.money -= price;
  sim.emit({ t: 'buy', id: a.id, item });
  return true;
}

/** Everything a player owns that is worth money, used for the team buy decision. */
export function teamMoney(sim: Sim, team: Team): { avg: number; min: number } {
  const list = sim.actors.filter((a) => a.team === team);
  if (!list.length) return { avg: 0, min: 0 };
  let sum = 0, min = Infinity;
  for (const a of list) { sum += a.money; min = Math.min(min, a.money); }
  return { avg: sum / list.length, min };
}

export function clampMoney(v: number) { return Math.max(0, Math.min(ROUND.maxMoney, v)); }
