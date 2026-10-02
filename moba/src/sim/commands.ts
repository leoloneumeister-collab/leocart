/** Turns queued commands (from the player, bots or tests) into unit orders. */
import { cancelRecall } from './core.ts';
import { CONFIG } from '../data/config.ts';
import { abilityDef, resolveUnitTarget, tryCast } from './abilities.ts';
import { buyItem, levelSlot, sellItem } from './economy.ts';
import { setPath } from './movement.ts';
import type { Command } from './types.ts';
import type { World } from './world.ts';

export function processCommands(w: World) {
  const list = w.commands;
  if (list.length === 0) return;
  for (const cmd of list) apply(w, cmd);
  list.length = 0;
}

function apply(w: World, cmd: Command) {
  const u = w.get(cmd.unit);
  if (!u || !u.champ) return;
  switch (cmd.type) {
    case 'buy':
      if (cmd.item) buyItem(w, u, cmd.item);
      return;
    case 'sell':
      if (cmd.index !== undefined) sellItem(w, u, cmd.index);
      return;
    case 'levelUp':
      if (cmd.slot !== undefined) levelSlot(w, u, cmd.slot);
      return;
  }
  if (!u.alive) return;
  switch (cmd.type) {
    case 'move':
      cancelRecall(w, u);
      u.order = { t: 'move', x: cmd.x ?? u.x, z: cmd.z ?? u.z };
      u.target = 0;
      setPath(w, u, cmd.x ?? u.x, cmd.z ?? u.z);
      break;
    case 'attackMove':
      cancelRecall(w, u);
      u.order = { t: 'attackMove', x: cmd.x ?? u.x, z: cmd.z ?? u.z };
      u.target = 0;
      setPath(w, u, cmd.x ?? u.x, cmd.z ?? u.z);
      break;
    case 'attack': {
      const t = cmd.target ? w.get(cmd.target) : undefined;
      if (t && w.canBeTargeted(u, t)) {
        cancelRecall(w, u);
        u.order = { t: 'attack', target: t.id };
        u.target = t.id;
        u.path = [];
        u.pathAge = 99;
      }
      break;
    }
    case 'stop':
      cancelRecall(w, u);
      u.order = { t: 'idle' };
      u.path = [];
      u.target = 0;
      break;
    case 'recall':
      if (u.order.t === 'recall') {
        cancelRecall(w, u);
      } else {
        u.order = { t: 'recall', left: CONFIG.recallTime };
        u.path = [];
        w.emit({ t: 'recallStart', id: u.id });
      }
      break;
    case 'cast': {
      const slot = cmd.slot ?? 0;
      const x = cmd.x ?? u.x;
      const z = cmd.z ?? u.z;
      const def = abilityDef(u, slot);
      const res = tryCast(w, u, slot, x, z, cmd.target ?? 0);
      if (res === 'approach') {
        const t = resolveUnitTarget(w, u, x, z, cmd.target ?? 0, def);
        if (t) {
          u.order = { t: 'cast', slot, x, z, target: t.id };
          u.path = [];
          u.pathAge = 99;
        }
      } else if (res === 'mana') {
        w.emit({ t: 'msg', unit: u.id, text: 'Not enough mana' });
      } else if (res === 'cooldown') {
        w.emit({ t: 'msg', unit: u.id, text: 'Ability on cooldown' });
      } else if (res === 'notarget') {
        w.emit({ t: 'msg', unit: u.id, text: 'No target' });
      }
      break;
    }
    default:
      break;
  }
}
