import type { Sim } from './sim.ts';
export class TeamAI {
  sim: Sim; team: 0 | 1;
  constructor(sim: Sim, team: 0 | 1) { this.sim = sim; this.team = team; }
  onRoundStart() {}
  onLive() {}
  update() {}
}
