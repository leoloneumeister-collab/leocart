/**
 * Item definitions. `cost` is the full gold price. Items with `from` are upgrades: buying one
 * refunds the value of any components you already own, so you pay only the difference.
 */
import type { Stats } from '../sim/types.ts';

export type ItemCategory = 'damage' | 'magic' | 'defense' | 'health' | 'boots' | 'speed';

export interface ItemDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  category: ItemCategory;
  cost: number;
  from: string[];
  stats: Partial<Stats>;
  desc: string;
  color: number;
}

const I = (d: ItemDef): ItemDef => d;

export const ITEMS: Record<string, ItemDef> = {
  // Tier 1 components
  longblade: I({ id: 'longblade', name: 'Long Blade', tier: 1, category: 'damage', cost: 350, from: [], stats: { ad: 12 }, desc: '+12 Attack Damage', color: 0xd0d6e0 }),
  amptome: I({ id: 'amptome', name: 'Amplifier Tome', tier: 1, category: 'magic', cost: 400, from: [], stats: { ap: 22 }, desc: '+22 Ability Power', color: 0xb070ff }),
  clothplate: I({ id: 'clothplate', name: 'Cloth Plate', tier: 1, category: 'defense', cost: 300, from: [], stats: { armor: 18 }, desc: '+18 Armor', color: 0xc8a060 }),
  nullmantle: I({ id: 'nullmantle', name: 'Null Mantle', tier: 1, category: 'defense', cost: 350, from: [], stats: { mr: 22 }, desc: '+22 Magic Resist', color: 0x70b0e0 }),
  vitalgem: I({ id: 'vitalgem', name: 'Vital Gem', tier: 1, category: 'health', cost: 400, from: [], stats: { maxHp: 170 }, desc: '+170 Health', color: 0xe05050 }),
  rapidgear: I({ id: 'rapidgear', name: 'Rapid Gear', tier: 1, category: 'speed', cost: 400, from: [], stats: { as: 0.15 }, desc: '+0.15 Attack Speed', color: 0xf0d050 }),
  manacrystal: I({ id: 'manacrystal', name: 'Mana Crystal', tier: 1, category: 'magic', cost: 350, from: [], stats: { maxMana: 250, manaRegen: 0.6 }, desc: '+250 Mana, +0.6 Mana Regen', color: 0x4080ff }),
  boots: I({ id: 'boots', name: 'Trail Boots', tier: 1, category: 'boots', cost: 300, from: [], stats: { ms: 0.45 }, desc: '+0.45 Move Speed', color: 0xb08850 }),

  // Tier 2
  warblade: I({ id: 'warblade', name: 'Warblade', tier: 2, category: 'damage', cost: 1000, from: ['longblade', 'longblade'], stats: { ad: 32, haste: 5 }, desc: '+32 Attack Damage, +5 Ability Haste', color: 0xe8e8f8 }),
  arcanerod: I({ id: 'arcanerod', name: 'Arcane Rod', tier: 2, category: 'magic', cost: 1100, from: ['amptome', 'manacrystal'], stats: { ap: 50, maxMana: 250, haste: 10 }, desc: '+50 AP, +250 Mana, +10 Ability Haste', color: 0xd090ff }),
  steelvest: I({ id: 'steelvest', name: 'Steel Vest', tier: 2, category: 'defense', cost: 950, from: ['clothplate', 'vitalgem'], stats: { armor: 32, maxHp: 220 }, desc: '+32 Armor, +220 Health', color: 0xe0c080 }),
  mysticveil: I({ id: 'mysticveil', name: 'Mystic Veil', tier: 2, category: 'defense', cost: 1000, from: ['nullmantle', 'vitalgem'], stats: { mr: 34, maxHp: 220 }, desc: '+34 Magic Resist, +220 Health', color: 0x90d0ff }),
  swiftgreaves: I({ id: 'swiftgreaves', name: 'Swift Greaves', tier: 2, category: 'boots', cost: 900, from: ['boots'], stats: { ms: 0.9 }, desc: '+0.9 Move Speed', color: 0xf0c060 }),
  quickfireblade: I({ id: 'quickfireblade', name: 'Quickfire Blade', tier: 2, category: 'speed', cost: 1050, from: ['rapidgear', 'longblade'], stats: { as: 0.3, ad: 18 }, desc: '+0.30 Attack Speed, +18 Attack Damage', color: 0xfff080 }),

  // Tier 3
  doomreaver: I({ id: 'doomreaver', name: 'Doomreaver', tier: 3, category: 'damage', cost: 2900, from: ['warblade', 'longblade'], stats: { ad: 70, haste: 10, lifesteal: 0.1 }, desc: '+70 Attack Damage, +10 Haste, 10% Lifesteal', color: 0xff6a60 }),
  archmagecrown: I({ id: 'archmagecrown', name: 'Archmage Crown', tier: 3, category: 'magic', cost: 2900, from: ['arcanerod', 'amptome'], stats: { ap: 115, maxMana: 300, haste: 15 }, desc: '+115 AP, +300 Mana, +15 Ability Haste', color: 0xe0a0ff }),
  bastionheart: I({ id: 'bastionheart', name: 'Bastion Heart', tier: 3, category: 'defense', cost: 2600, from: ['steelvest', 'vitalgem'], stats: { armor: 65, maxHp: 450, hpRegen: 1.2 }, desc: '+65 Armor, +450 Health, +1.2 Health Regen', color: 0xffd070 }),
  spiritaegis: I({ id: 'spiritaegis', name: 'Spirit Aegis', tier: 3, category: 'defense', cost: 2500, from: ['mysticveil', 'nullmantle'], stats: { mr: 70, maxHp: 400, hpRegen: 1 }, desc: '+70 Magic Resist, +400 Health, +1 Health Regen', color: 0xa0e0ff }),
  titancore: I({ id: 'titancore', name: 'Titan Core', tier: 3, category: 'health', cost: 2700, from: ['vitalgem', 'vitalgem'], stats: { maxHp: 850, hpRegen: 2 }, desc: '+850 Health, +2 Health Regen', color: 0xff8080 }),
  stormbow: I({ id: 'stormbow', name: 'Stormbow', tier: 3, category: 'speed', cost: 3000, from: ['quickfireblade', 'longblade'], stats: { as: 0.55, ad: 42 }, desc: '+0.55 Attack Speed, +42 Attack Damage', color: 0xfff0a0 }),
};

export const ITEM_IDS = Object.keys(ITEMS);
export const INVENTORY_SIZE = 6;

/** Gold needed to buy `id` if the buyer already owns `owned`. Also returns the components that will be consumed. */
export function priceWith(id: string, owned: (string | null)[]): { cost: number; consumed: number[] } {
  const def = ITEMS[id];
  const pool = owned.slice();
  const consumed: number[] = [];
  let cost = def.cost;
  const consume = (comp: string, depth: number) => {
    const idx = pool.findIndex((o) => o === comp);
    if (idx >= 0) {
      pool[idx] = null;
      consumed.push(idx);
      cost -= ITEMS[comp].cost;
      return;
    }
    if (depth < 3) for (const sub of ITEMS[comp].from) consume(sub, depth + 1);
  };
  for (const c of def.from) consume(c, 0);
  return { cost: Math.max(0, cost), consumed };
}

export function itemStatsTotal(items: (string | null)[]): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const id of items) {
    if (!id) continue;
    const st = ITEMS[id].stats;
    for (const k of Object.keys(st) as (keyof Stats)[]) out[k] = (out[k] ?? 0) + (st[k] ?? 0);
  }
  return out;
}
