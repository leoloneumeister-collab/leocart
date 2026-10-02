import type { Actor } from './actor.ts';
import type { Sim } from './sim.ts';
export interface Brain { reset(): void }
export function createBrain(_sim: Sim, _a: Actor): Brain { return { reset() {} }; }
export function thinkBot(_sim: Sim, _a: Actor, _b: Brain) {}
