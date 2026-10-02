/** One fixed simulation tick. */
import { stepBots } from './bots.ts';
import { stepChampions } from './champions.ts';
import { processCommands } from './commands.ts';
import { stepEconomy } from './economy.ts';
import { stepMinions } from './minions.ts';
import { separateUnits } from './movement.ts';
import { stepProjectiles } from './projectiles.ts';
import { stepStatuses } from './status.ts';
import { stepStructures } from './structures.ts';
import { stepVision } from './vision.ts';
import { CONFIG } from '../data/config.ts';
import type { World } from './world.ts';

export function stepWorld(w: World) {
  if (w.winner !== -1) return;
  const dt = 1 / CONFIG.tickRate;
  w.tick++;
  w.time += dt;
  for (const u of w.units) {
    u.px = u.x;
    u.pz = u.z;
  }
  w.buildSpatial();
  processCommands(w);
  stepStatuses(w, dt);
  stepEconomy(w, dt);
  stepVision(w);
  stepBots(w, dt);
  stepChampions(w, dt);
  stepMinions(w, dt);
  stepStructures(w, dt);
  separateUnits(w);
  stepProjectiles(w, dt);
  w.removeDead();
}
