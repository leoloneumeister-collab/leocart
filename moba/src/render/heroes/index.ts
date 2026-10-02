import { buildIronvow } from './ironvow.ts';
import { buildYsolde } from './ysolde.ts';
import { buildKestrel } from './kestrel.ts';
import { buildOakhelm } from './oakhelm.ts';
import { buildSable } from './sable.ts';
import type { HeroModel } from './common.ts';

export type { HeroModel } from './common.ts';

const BUILDERS: Record<string, (team: number) => HeroModel> = {
  ironvow: buildIronvow,
  ysolde: buildYsolde,
  kestrel: buildKestrel,
  oakhelm: buildOakhelm,
  sable: buildSable,
};

export function hasHero(id: string): boolean {
  return id in BUILDERS;
}

export function buildHero(id: string, team: number): HeroModel {
  const b = BUILDERS[id];
  if (!b) throw new Error(`no hero model for ${id}`);
  return b(team);
}
