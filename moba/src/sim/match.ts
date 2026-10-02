/** Public entry point for creating and running a match. */
import { stepWorld } from './step.ts';
import { World } from './world.ts';
import type { MatchSetup } from './world.ts';

export type { MatchSetup };
export { World, stepWorld };

export function createMatch(partial: Partial<MatchSetup> = {}): World {
  const setup: MatchSetup = {
    seed: 1,
    playerChampion: 'ironvow',
    playerLane: 'mid',
    difficulty: 'normal',
    autoPlayer: false,
    ...partial,
  };
  return new World(setup);
}

/** Advance the world by `seconds` of game time. */
export function runFor(w: World, seconds: number) {
  const ticks = Math.round(seconds * 30);
  for (let i = 0; i < ticks && w.winner === -1; i++) stepWorld(w);
}
