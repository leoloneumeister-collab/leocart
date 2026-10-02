/**
 * Team level decisions: what to buy, which plan to run, rotations and retakes.
 * Individual bots only ever follow the intents handed out here, and fight on their own.
 */
import { ROUND, TEAM_BREACHER, TEAM_SENTINEL, type Team } from './constants.ts';
import { dist2, v3, type Vec3 } from './math.ts';
import { cellPos, type Route } from './map.ts';
import type { Actor } from './actor.ts';
import { buyItem } from './economy.ts';
import type { Sim } from './sim.ts';
import type { Brain, Intent } from './bots.ts';
import { cellPosGround } from './bots.ts';

export type BuyMode = 'pistol' | 'full' | 'force' | 'eco';

interface Intel { pos: Vec3; time: number; place: string; id: number }

const PLAN_NAMES_B = ['Long A rush', 'Short A', 'Split A', 'Tunnels B rush', 'Mid to B', 'Split B', 'Mid control A', 'Mid control B'];

export class TeamAI {
  sim: Sim;
  team: Team;
  mode: BuyMode = 'full';
  planName = '';
  intel: Intel[] = [];
  reports = new Map<number, { pos: Vec3; time: number }>();
  lastRadio = new Map<number, number>();
  teamRadioAt = 0;
  nextUpdate = 0;
  delayed: Array<{ id: number; at: number; intent: Intent }> = [];
  plantHandled = false;
  retakeSite: 'A' | 'B' | null = null;
  retakeStart = 0;
  retakeExec = false;
  lastRotate: Record<'A' | 'B', number> = { A: -99, B: -99 };
  awps = 0;
  siteArrival = 0;
  saveCalled = false;

  constructor(sim: Sim, team: Team) { this.sim = sim; this.team = team; }

  private get bots(): Actor[] { return this.sim.actors.filter((a) => a.team === this.team && a.isBot); }
  private brain(a: Actor): Brain { return this.sim.brains.get(a.id)!; }

  // ================================================================ round start: buy decisions

  onRoundStart() {
    const sim = this.sim, m = sim.m;
    this.intel.length = 0; this.reports.clear(); this.delayed.length = 0;
    this.plantHandled = false; this.retakeSite = null; this.retakeExec = false; this.saveCalled = false;
    this.awps = 0;
    if (sim.cfg.mode === 'dm') return;
    const list = sim.actors.filter((a) => a.team === this.team);
    const avg = list.reduce((s, a) => s + a.money, 0) / Math.max(1, list.length);
    const pistol = m.round === 1 || m.history.length === ROUND.swapAfter;
    const loss = m.lossIdx[this.team];
    const haveRifles = list.filter((a) => a.primary).length;
    if (pistol) this.mode = 'pistol';
    else if (m.suddenDeath || avg >= 3900 || haveRifles >= 3) this.mode = 'full';
    else if (avg >= 2300 && (loss >= 2 || avg >= 3000)) this.mode = 'force';
    else this.mode = 'eco';
  }

  botBuy(a: Actor) {
    const sim = this.sim;
    if (sim.cfg.mode === 'dm') return;
    const t = a.team;
    const rifle = t === TEAM_SENTINEL ? 'carbine' : 'vk47';
    const cheap = t === TEAM_SENTINEL ? 'ranger' : 'reaper';
    const smg = t === TEAM_SENTINEL ? 'hornet' : 'wasp';
    const r = sim.rng.next();
    const buy = (id: string) => buyItem(sim, a, id);
    if (this.mode === 'pistol') {
      if (r < 0.5) buy('kevlar');
      else if (r < 0.8) { if (t === TEAM_SENTINEL) { buy('kit'); buy('flash'); } else { buy('smoke'); buy('flash'); } }
      else buy('cobra');
      return;
    }
    if (this.mode === 'eco') {
      if (a.money > 1500 && !a.armor) buy('kevlar');
      return;
    }
    const full = this.mode === 'full';
    if (!a.primary) {
      let want: string | null = null;
      if (full) {
        if (this.awps === 0 && a.money >= 5400 && sim.rng.next() < 0.3) { want = 'bolt50'; this.awps++; }
        else if (a.money >= 2700 + 650 + (t === TEAM_SENTINEL ? 100 : 0)) want = rifle;
        else if (a.money >= 1800 + 650) want = cheap;
        else if (a.money >= 1050 + 650) want = smg;
      } else {
        if (a.money >= 2050 + 650) want = cheap;
        else if (a.money >= 1050 + 650) want = smg;
        else if (a.money >= 700 + 650) want = 'cobra';
      }
      if (want) buy(want);
    }
    if (a.armor < 100) { if (a.money >= 1000) buy('armor'); else if (a.money >= 650) buy('kevlar'); }
    else if (!a.helmet && a.money >= 350) buy('armor');
    if (t === TEAM_SENTINEL && a.money >= 400) buy('kit');
    const order = r < 0.5 ? ['smoke', 'flash', 'he', 'flash'] : ['flash', 'smoke', 'flash', 'he'];
    for (const g of order) if (a.money >= (g === 'flash' ? 200 : 300) + 100) buy(g);
  }

  spawnLook(a: Actor): Vec3 {
    return a.team === TEAM_BREACHER ? v3(48, 1.5, 24) : v3(48, 1.5, 46);
  }

  // ================================================================ intel

  report(enemy: Actor, pos: Vec3, by: Actor) {
    const sim = this.sim, now = sim.time;
    this.reports.set(by.id, { pos: { ...pos }, time: now });
    const place = sim.placeName(enemy.pos);
    const prev = this.intel.find((i) => i.id === enemy.id);
    if (prev) { prev.pos = { ...enemy.pos }; prev.time = now; prev.place = place; }
    else this.intel.push({ pos: { ...enemy.pos }, time: now, place, id: enemy.id });
    const last = this.lastRadio.get(by.id) ?? -99;
    if (now - last > 7 && !prev || (prev && now - last > 12)) {
      this.lastRadio.set(by.id, now);
      this.say(by, `Enemy spotted, ${place}`);
    }
  }

  heard(pos: Vec3, kind: string, by: Actor) {
    const now = this.sim.time;
    const place = this.sim.placeName(pos);
    if (kind === 'shot' || kind === 'plant' || kind === 'defuse') this.intel.push({ pos: { ...pos }, time: now, place, id: -1 });
    if (this.intel.length > 40) this.intel.splice(0, 20);
    void by;
  }

  freshReport(a: Actor): Vec3 | null {
    const now = this.sim.time;
    let best: Vec3 | null = null, bt = 0;
    for (const [id, r] of this.reports) {
      if (id === a.id || now - r.time > 2.5 || r.time < bt) continue;
      if (dist2(r.pos, a.pos) > 70) continue;
      best = r.pos; bt = r.time;
    }
    return best;
  }

  say(a: Actor, text: string) {
    const now = this.sim.time;
    if (now - this.teamRadioAt < 0.9) return;
    this.teamRadioAt = now;
    this.sim.emit({ t: 'radio', id: a.id, text });
  }

  // ================================================================ going live: pick a plan

  onLive() {
    const sim = this.sim;
    if (sim.cfg.mode === 'dm') return;
    if (this.team === TEAM_BREACHER) this.planAttack(); else this.planDefense();
  }

  private routeByName(n: string): Route { return this.sim.map.routes.find((r) => r.name === n)!; }

  private planAttack() {
    const sim = this.sim, rng = sim.rng;
    const bots = this.bots.filter((a) => a.alive);
    const plan = rng.pick(PLAN_NAMES_B);
    this.planName = plan;
    const R = {
      long: this.routeByName('Long A'), short: this.routeByName('Short A'),
      midB: this.routeByName('Mid to B'), tun: this.routeByName('Tunnels B'),
    };
    let assign: Route[];
    const n = bots.length;
    const fill = (a: Route[]) => Array.from({ length: n }, (_, i) => a[i % a.length]);
    let delayLater: { count: number; route: Route; hold: [number, number]; look: [number, number]; secs: number } | null = null;
    switch (plan) {
      case 'Long A rush': assign = fill([R.long]); break;
      case 'Short A': assign = fill([R.short]); break;
      case 'Split A': assign = fill([R.long, R.long, R.short, R.short, R.long]); break;
      case 'Tunnels B rush': assign = fill([R.tun]); break;
      case 'Mid to B': assign = fill([R.midB]); break;
      case 'Split B': assign = fill([R.tun, R.tun, R.midB, R.midB, R.tun]); break;
      case 'Mid control A': assign = fill([R.long, R.long, R.long, R.short, R.short]); delayLater = { count: 2, route: R.short, hold: [24, 19], look: [23, 13], secs: 18 }; break;
      default: assign = fill([R.tun, R.tun, R.tun, R.midB, R.midB]); delayLater = { count: 2, route: R.midB, hold: [24, 19], look: [23, 13], secs: 18 }; break;
    }
    const order = rng.shuffle([...bots]);
    order.forEach((a, i) => {
      const b = this.brain(a);
      let route = assign[i];
      b.jobs = [];
      if (delayLater && i >= n - delayLater.count) {
        route = delayLater.route;
        const hold: Intent = { k: 'hold', pos: cellPosGround(sim, delayLater.hold), look: cellPos(delayLater.look[0], delayLater.look[1]), crouch: false, label: 'Mid' };
        b.setIntent(hold);
        this.delayed.push({ id: a.id, at: sim.time + delayLater.secs + rng.next() * 4, intent: { k: 'route', route, i: 1, wait: 0 } });
        return;
      }
      b.setIntent({ k: 'route', route, i: 0, wait: 0 });
    });
    // utility jobs: smoke then flash per route
    const byRoute = new Map<Route, Actor[]>();
    order.forEach((a, i) => {
      const r = (this.brain(a).intent as { route?: Route }).route ?? assign[i];
      if (!byRoute.has(r)) byRoute.set(r, []);
      byRoute.get(r)!.push(a);
    });
    for (const [route, members] of byRoute) {
      const smoker = members.find((a) => a.grenades.smoke > 0);
      const flashers = members.filter((a) => a.grenades.flash > 0 && a !== smoker);
      const len = route.points.length;
      const smokeSpec = route.util.find((u) => u.kind === 'smoke');
      const flashSpec = route.util.find((u) => u.kind === 'flash');
      if (smoker && smokeSpec) this.brain(smoker).jobs.push({ kind: 'smoke', target: cellPos(smokeSpec.target[0], smokeSpec.target[1]), atIdx: len - 3, done: false });
      if (flashers[0] && flashSpec) this.brain(flashers[0]).jobs.push({ kind: 'flash', target: cellPos(flashSpec.target[0], flashSpec.target[1]), atIdx: len - 2, done: false });
      if (flashers[1] && flashSpec) this.brain(flashers[1]).jobs.push({ kind: 'flash', target: cellPos(flashSpec.target[0], flashSpec.target[1]), atIdx: len - 2, done: false });
    }
    const human = sim.human;
    if (human && human.team === this.team) { const a = bots[0]; if (a) sim.emit({ t: 'radio', id: a.id, text: `Plan: ${plan}` }); }
  }

  private planDefense() {
    const sim = this.sim, rng = sim.rng;
    const bots = rng.shuffle(this.bots.filter((a) => a.alive));
    const setups = [
      { A: 2, B: 2, M: 1 }, { A: 3, B: 1, M: 1 }, { A: 1, B: 3, M: 1 }, { A: 1, B: 1, M: 3 }, { A: 2, B: 2, M: 1 },
    ];
    const setup = rng.pick(setups);
    this.planName = `${setup.A}-${setup.M}-${setup.B}`;
    const pool: Record<'A' | 'B' | 'M', typeof sim.map.holds> = { A: [], B: [], M: [] };
    for (const h of rng.shuffle([...sim.map.holds])) pool[h.site].push(h);
    const slots: Array<'A' | 'B' | 'M'> = [];
    for (const k of ['A', 'B', 'M'] as const) for (let i = 0; i < setup[k]; i++) slots.push(k);
    bots.forEach((a, i) => {
      const site = slots[i % slots.length];
      const h = pool[site].pop() ?? pool.M.pop() ?? sim.map.holds[0];
      const b = this.brain(a);
      b.jobs = [];
      b.setIntent({ k: 'hold', pos: cellPosGround(sim, h.at), look: cellPos(h.look[0], h.look[1]), crouch: !!h.crouch, label: h.name });
    });
  }

  // ================================================================ attackers arriving

  onArrive(a: Actor, site: 'A' | 'B') {
    const sim = this.sim, b = this.brain(a);
    if (a.team !== TEAM_BREACHER) { b.setIntent({ k: 'idle' }); return; }
    if (this.siteArrival === 0) this.siteArrival = sim.time;
    if (a.hasBomb) {
      const s = sim.map.sites.find((x) => x.id === site)!;
      const jx = (sim.rng.next() - 0.5) * 3, jz = (sim.rng.next() - 0.5) * 3;
      const pos = cellPosGround(sim, v3(s.plant.x + jx, 0, s.plant.z + jz));
      b.setIntent({ k: 'plant', site, pos });
      this.say(a, `Going to plant, ${site}`);
    } else {
      this.coverSite(a, site);
    }
  }

  private coverSite(a: Actor, site: 'A' | 'B') {
    const sim = this.sim, b = this.brain(a);
    const spots = sim.map.postPlant[site];
    const stage = sim.map.retake[site];
    const i = a.id % spots.length;
    const look = stage[i % stage.length];
    b.setIntent({ k: 'hold', pos: cellPosGround(sim, cellPos(spots[i][0], spots[i][1])), look: cellPos(look[0], look[1]), crouch: false, label: `${site} cover` });
  }

  // ================================================================ per half second tactics

  update() {
    const sim = this.sim, now = sim.time, m = sim.m;
    if (sim.cfg.mode === 'dm') {
      if (this.team === 0) for (const a of sim.actors) if (a.alive && a.isBot) { const b = this.brain(a); if (b.intent.k !== 'roam') b.setIntent({ k: 'roam' }); }
      return;
    }
    if (now < this.nextUpdate) return;
    this.nextUpdate = now + 0.5;
    if (m.phase !== 'live') return;
    // delayed intents
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      if (now < d.at) continue;
      this.delayed.splice(i, 1);
      const a = sim.actors[d.id];
      if (a.alive && a.team === this.team) this.brain(a).setIntent(d.intent);
    }
    if (this.team === TEAM_BREACHER) this.updateAttack(); else this.updateDefense();
  }

  private updateAttack() {
    const sim = this.sim, now = sim.time, bomb = sim.bomb;
    const bots = this.bots.filter((a) => a.alive);
    // bomb dropped: someone fetches it
    if (bomb.state === 'dropped') {
      const carrierCandidate = sim.actors.some((a) => a.alive && a.team === TEAM_BREACHER && a.hasBomb);
      if (!carrierCandidate && bots.length) {
        const already = bots.some((a) => this.brain(a).intent.k === 'pickBomb');
        if (!already) {
          let best: Actor | null = null, bd = 1e9;
          for (const a of bots) { const d = dist2(a.pos, bomb.pos); if (d < bd) { bd = d; best = a; } }
          if (best) { this.brain(best).setIntent({ k: 'pickBomb' }); this.say(best, 'I will get the bomb'); }
        }
      }
    }
    // a bot that picked up the bomb mid round heads for the nearest site
    for (const a of bots) {
      if (!a.hasBomb || bomb.state === 'planted') continue;
      const b = this.brain(a);
      if (b.intent.k === 'pickBomb' || b.intent.k === 'idle') {
        const sites = sim.map.sites;
        const s = sites.reduce((best, x) => (dist2(a.pos, x.plant) < dist2(a.pos, best.plant) ? x : best), sites[0]);
        b.setIntent({ k: 'plant', site: s.id, pos: cellPosGround(sim, s.plant) });
      }
      // site wait timeout: plant anyway
      if (b.intent.k === 'plant' && this.siteArrival && now - this.siteArrival > 25) b.target = -1;
    }
    // planted: everyone digs in
    if (bomb.state === 'planted' && !this.plantHandled) {
      this.plantHandled = true;
      const site = bomb.site!;
      for (const a of bots) {
        const b = this.brain(a);
        if (b.throwJob) continue;
        this.coverSite(a, site);
      }
      const p = sim.actors[bomb.plantedBy];
      if (p) this.say(p, `Bomb planted ${site}, hold it`);
    }
    // saving: the clock is gone and there is no plant
    if (bomb.state !== 'planted' && sim.roundTimeLeft() < 16 && !this.saveCalled && sim.roundTimeLeft() > 0) {
      this.saveCalled = true;
      const spots = sim.map.saveSpots[TEAM_BREACHER];
      bots.forEach((a, i) => {
        if (a.hasBomb && bomb.state !== 'planted') {
          // a carrier close to a site still tries
          const near = sim.map.sites.some((s) => dist2(a.pos, s.plant) < 16);
          if (near) return;
        }
        const s = spots[i % spots.length];
        this.brain(a).setIntent({ k: 'save', pos: cellPosGround(sim, cellPos(s[0], s[1])) });
      });
    }
  }

  private updateDefense() {
    const sim = this.sim, now = sim.time, bomb = sim.bomb;
    const bots = this.bots.filter((a) => a.alive);
    if (bomb.state === 'planted') {
      const site = bomb.site!;
      if (!this.retakeSite) {
        this.retakeSite = site; this.retakeStart = now; this.retakeExec = false;
        const stage = sim.map.retake[site];
        const kitHolders = bots.filter((a) => a.kit);
        const defuser = (kitHolders.length ? kitHolders : bots).reduce<Actor | null>((best, a) => (!best || dist2(a.pos, bomb.pos) < dist2(best.pos, bomb.pos) ? a : best), null);
        bots.forEach((a, i) => {
          const s = stage[i % stage.length];
          const look = cellPos(sim.map.postPlant[site][0][0], sim.map.postPlant[site][0][1]);
          this.brain(a).setIntent({ k: 'retake', site, stage: cellPosGround(sim, cellPos(s[0], s[1])), exec: false, defuser: a === defuser, look });
        });
        if (bots.length) this.say(bots[0], `Bomb planted ${site}, retake`);
      }
      // go when grouped or time is short
      if (!this.retakeExec) {
        const staged = bots.filter((a) => {
          const it = this.brain(a).intent;
          return it.k === 'retake' && dist2(a.pos, it.stage) < 4;
        }).length;
        const left = sim.bombTimeLeft();
        if (staged >= Math.min(bots.length, 3) || now - this.retakeStart > 7 || left < 24 || (bots.length === 1 && left < 30)) {
          this.retakeExec = true;
          this.execRetake(bots, site);
        }
      } else {
        // keep roles fresh when the defuser dies
        const hasDefuser = bots.some((a) => { const i = this.brain(a).intent; return i.k === 'defuse' || (i.k === 'retake' && i.defuser); });
        if (!hasDefuser && bots.length) {
          const a = bots.reduce((best, x) => (dist2(x.pos, bomb.pos) < dist2(best.pos, bomb.pos) ? x : best), bots[0]);
          this.brain(a).setIntent({ k: 'defuse' });
        }
        // nobody can make it: save the guns
        const left = sim.bombTimeLeft();
        for (const a of bots) {
          const b = this.brain(a);
          const need = (a.kit ? ROUND.defuseKit : ROUND.defuse) + dist2(a.pos, bomb.pos) / 5.2;
          if (b.intent.k === 'defuse' && left < need - 0.5 && a.defusing === 0) {
            const s = sim.map.saveSpots[TEAM_SENTINEL][a.id % 3];
            b.setIntent({ k: 'save', pos: cellPosGround(sim, cellPos(s[0], s[1])) });
          }
        }
      }
      return;
    }
    // rotations: respond to intel on the other site
    const recent = this.intel.filter((i) => now - i.time < 6 && i.id !== -2);
    const count = (name: RegExp) => recent.filter((i) => name.test(i.place)).length;
    const threatA = count(/Long|^A |Roost|A Ramp|A Short/), threatB = count(/Tunnel|^B |B Hall|B Alley|West/);
    const rotate = (to: 'A' | 'B') => {
      if (now - this.lastRotate[to] < 10) return;
      const from = to === 'A' ? 'B' : 'A';
      const cands = bots.filter((a) => { const it = this.brain(a).intent; return it.k === 'hold' && (it.label.startsWith(from) || it.label.startsWith('Mid') || it.label.startsWith('Hall')); });
      if (!cands.length) return;
      this.lastRotate[to] = now;
      const send = cands.slice(0, 2);
      for (const a of send) {
        const pool = sim.map.holds.filter((h) => h.site === to);
        const h = pool[a.id % pool.length];
        this.brain(a).setIntent({ k: 'hold', pos: cellPosGround(sim, h.at), look: cellPos(h.look[0], h.look[1]), crouch: false, label: h.name });
      }
      this.say(send[0], `Rotating ${to}`);
    };
    if (threatA >= 2 && threatB === 0) rotate('A');
    else if (threatB >= 2 && threatA === 0) rotate('B');
  }

  private execRetake(bots: Actor[], site: 'A' | 'B') {
    const sim = this.sim;
    const bomb = sim.bomb;
    for (const a of bots) {
      const b = this.brain(a);
      const it = b.intent;
      if (it.k === 'retake') { it.exec = true; if (it.defuser) b.setIntent({ k: 'retake', site, stage: it.stage, exec: true, defuser: true, look: it.look }); }
      // utility first: smoke the bomb for the defuser, flash and HE the site
      if (a.grenades.smoke > 0 && sim.rng.next() < sim.lvl.util) b.startThrow('smoke', cellPosGround(sim, v3(bomb.pos.x, 0, bomb.pos.z)));
      else if (a.grenades.he > 0 && sim.rng.next() < sim.lvl.util) b.startThrow('he', cellPosGround(sim, v3(bomb.pos.x, 0, bomb.pos.z)));
      else if (a.grenades.flash > 0 && sim.rng.next() < sim.lvl.util) {
        const p = sim.map.postPlant[site][a.id % sim.map.postPlant[site].length];
        b.startThrow('flash', cellPosGround(sim, cellPos(p[0], p[1])));
      }
    }
  }
}
