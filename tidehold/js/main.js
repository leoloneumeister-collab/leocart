// Game controller: owns the state, the loop and every interaction, and wires renderer, input and UI together.

import * as D from './data.js';
import * as St from './state.js';
import * as G from './gen.js';
import * as Sim from './sim.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { UI } from './ui.js';
import { connectCloud } from './cloud.js';
import { clamp, dist } from './util.js';
import { fmtTime, fmtFull } from './data.js';

// localStorage can throw (private windows, blocked storage, embedded views): fall back to memory.
function makeStorage() {
  try {
    const k = '__t';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  }
}

const TUTORIAL = [
  { text: 'Welcome to Tidehold! Tap the Gold Mine to collect its gold.', building: 'gmine', done: (S) => S.stats.collected > 0 },
  { text: 'Open the Shop and build a second Gold Mine.', ui: 'shop', done: (S) => St.countOf(S, 'gmine') >= 2 },
  { text: 'Open the Army and train a few more troops.', ui: 'army', done: (S) => St.armyUsed(S) >= 16 },
  { text: 'Now tap Raid and attack Outpost 1. Tap the shore to drop troops!', ui: 'raid', done: (S) => S.stats.raids >= 1 },
  { text: 'Nice raid! Open Goals to claim free pearls.', ui: 'quests', done: (S, g) => g.questsSeen },
];

class Game {
  constructor() {
    this.skew = 0;
    this.storage = makeStorage();
    const now = this.now();
    const loaded = St.load(this.storage, now);
    const seedParam = Number(new URLSearchParams(location.search).get('seed'));
    this.S = loaded || St.newPlayer(now, seedParam > 0 ? seedParam : 1 + Math.floor(Math.random() * 40));
    this.fresh = !loaded;
    this.mode = 'home';
    this.selRef = null;
    this.ghost = null;
    this.B = null;
    this.speed = 1;
    this.acc = 0;
    this.holding = false;
    this.holdPos = null;
    this.holdT = 0;
    this.deployTroop = '';
    this.beaconMode = false;
    this.showHint = true;
    this.rivalSeed = 1 + Math.floor(Math.random() * 9000);
    this.questsSeen = false;
    this.lastTick = 0;
    this.lastDraw = 0;
    this.lastUi = 0;
    this.lastSave = 0;
    this._dirty = false;
    this.spectate = false;
    this.lastTs = performance.now();
    this.scn = { buildings: [], obstacles: [], units: [] };

    this.cv = document.getElementById('scene');
    this.r = new Renderer(this.cv);
    this.sfx = new Sfx();
    this.sfx.on = this.S.settings.sound !== false;
    this.ui = new UI(this, document.getElementById('ui'));
    this.input = new Input(this.cv, this.r.cam, {
      tap: (x, y) => this.onTap(x, y),
      dragKind: (x, y) => this.dragKind(x, y),
      ghostDown: (x, y) => this.ghostDrag(x, y),
      ghostMove: (x, y) => this.ghostDrag(x, y),
      ghostUp: () => {},
      holdEnabled: () => this.mode === 'battle' && !this.beaconMode && !this.spectate && !!this.B && !this.B.ended,
      holdStart: (x, y) => { this.holding = true; this.holdPos = { x, y }; this.holdT = 0.1; },
      holdMove: (x, y) => { this.holdPos = { x, y }; },
      holdEnd: () => { this.holding = false; },
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
      else this.lastTs = performance.now();
    });
    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    this.resize();
    this.homeCamera();
    this.ui.setMode('home');
  }

  now() {
    return Date.now() + this.skew;
  }

  // ---------- lifecycle ----------

  start() {
    const now = this.now();
    const awayMs = now - this.S.last;
    const events = St.tick(this.S, now);
    this.lastTick = performance.now();
    if (!this.fresh && awayMs > 120000) this.awaySummary(events, awayMs);
    if (this.fresh) this.save();
    requestAnimationFrame((ts) => this.frame(ts));
    const boot = document.getElementById('boot');
    if (boot) {
      boot.classList.add('gone');
      setTimeout(() => boot.remove(), 600);
    }
  }

  awaySummary(events, awayMs) {
    const n = (t) => events.filter((e) => e.type === t).length;
    const lines = [];
    if (n('built')) lines.push(`${n('built')} new building${n('built') > 1 ? 's' : ''} finished.`);
    if (n('upgraded')) lines.push(`${n('upgraded')} upgrade${n('upgraded') > 1 ? 's' : ''} finished.`);
    if (n('trained')) lines.push(`${n('trained')} troop${n('trained') > 1 ? 's' : ''} finished training.`);
    if (n('forged')) lines.push('Your forge finished a troop upgrade.');
    if (n('cleared')) lines.push('Your builder cleared an obstacle.');
    const full = this.S.buildings.filter((b) => D.COLLECTORS.includes(b.type) && St.collectorAmount(b, this.now()) >= D.prodCapacity(b.type, Math.max(1, b.lvl)) * 0.99).length;
    if (full) lines.push(`${full} of your mines are full. Time to collect!`);
    if (lines.length) {
      lines.unshift(`You were away for ${fmtTime(awayMs / 1000)}.`);
      this.ui.showAway(lines);
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.r.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  }

  homeCamera() {
    const cam = this.r.cam;
    cam.cx = 17;
    cam.cy = 17;
    cam.zoom = clamp(Math.min(cam.w / (15 * 64), cam.h / (17 * 32)), cam.minZoom(), 0.9);
    cam.clamp();
  }

  dirty() {
    this._dirty = true;
  }

  save() {
    St.save(this.S, this.storage);
    this._dirty = false;
    this.lastSave = performance.now();
    if (this.cloud) this.cloud.push(St.serialize(this.S), this.now());
  }

  // Swap in a different save (for example the newer one from the cloud copy).
  adoptState(S) {
    this.S = S;
    this.selRef = null;
    this.ghost = null;
    if (this.mode !== 'home') {
      this.mode = 'home';
      this.ui.setMode('home');
    }
    this.ui.closeSheet(true);
    this.sfx.on = S.settings.sound !== false;
    this.handleStateEvents(St.tick(S, this.now()));
    this.dirty();
    this.ui.toast('Loaded your saved island');
  }

  resetGame() {
    try { this.storage.removeItem(St.SAVE_KEY); } catch { /* ignore */ }
    this.S = St.newPlayer(this.now(), 1 + Math.floor(Math.random() * 40));
    this.selRef = null;
    this.ghost = null;
    this.B = null;
    this.mode = 'home';
    this.ui.setMode('home');
    this.ui.closeSheet(true);
    this.homeCamera();
    this.save();
    this.ui.toast('A fresh island. Good luck!');
  }

  onSheetClosed(id) {
    if (id === 'quests') this.questsSeen = true;
  }

  // ---------- main loop ----------

  frame(ts) {
    const dt = Math.min(0.1, Math.max(0.001, (ts - this.lastTs) / 1000));
    this.lastTs = ts;
    const now = this.now();
    if (this.mode === 'battle') {
      this.stepBattle(dt);
    } else if (ts - this.lastTick > 250) {
      this.lastTick = ts;
      this.handleStateEvents(St.tick(this.S, now));
      this.checkTutorial();
    }
    // the home screen is mostly still: draw it at about 30 fps to save battery, full rate when it matters
    const calm = this.mode === 'home' && !this.input.pointers.size && !this.r.fx.length;
    if (!calm || ts - this.lastDraw > 30) {
      this.r.update(this.lastDraw ? Math.min(0.1, (ts - this.lastDraw) / 1000) : dt);
      this.r.frame(this.scene(now));
      this.lastDraw = ts;
    }
    if (ts - this.lastUi > 200) {
      this.lastUi = ts;
      this.ui.update(now);
      if (this.mode === 'battle' && this.B) this.ui.updateBattle(this.B);
    }
    if (this._dirty && ts - this.lastSave > 3000) this.save();
    requestAnimationFrame((t) => this.frame(t));
  }

  handleStateEvents(events) {
    for (const e of events) {
      if (e.type === 'built' || e.type === 'upgraded') {
        this.sfx.play('done');
        const b = e.b;
        this.r.floatText(b.x + D.BUILDINGS[b.type].size / 2, b.y + D.BUILDINGS[b.type].size / 2, e.type === 'built' ? 'Built!' : `Level ${b.lvl}!`, '#fff3a0', 70);
        this.ui.toast(`${D.BUILDINGS[b.type].name} ${e.type === 'built' ? 'is ready' : 'is now level ' + b.lvl}`, 'good');
        this.selSig();
      } else if (e.type === 'trained') {
        if (this.ui.sheet && this.ui.sheet.id === 'army') this.ui.forceRefresh();
      } else if (e.type === 'forged') {
        this.sfx.play('done');
        this.ui.toast(`${D.TROOPS[e.troop].name} is now level ${e.lvl}`, 'good');
      } else if (e.type === 'cleared') {
        this.sfx.play('done');
        this.ui.toast(`Cleared! +${e.pearls} pearls`, 'good');
        if (this.selRef && this.selRef.id === e.o.id) this.deselect();
      }
      this.dirty();
    }
    if (events.length) this.ui.forceRefresh();
  }

  selSig() {
    this.ui.selSig = '';
  }

  // ---------- scene ----------

  selected() {
    if (!this.selRef) return null;
    if (this.selRef.kind === 'building') {
      const o = St.byId(this.S, this.selRef.id);
      return o ? { kind: 'building', o } : null;
    }
    const o = this.S.obstacles.find((x) => x.id === this.selRef.id);
    return o ? { kind: 'obstacle', o } : null;
  }

  scene(now) {
    const s = this.scn;
    s.now = now;
    s.mode = this.mode === 'battle' ? 'battle' : 'home';
    s.team = this.mode === 'battle' && !this.spectate ? 'e' : 'p';
    s.ghost = this.ghost;
    s.showGrid = false;
    s.selected = null;
    s.beacon = null;
    s.showRed = false;
    s.collectable = null;
    s.tutorialTarget = null;
    if (this.mode === 'battle' && this.B) {
      const B = this.B;
      s.buildings = B.b;
      s.obstacles = [];
      s.units = B.units;
      s.beacon = B.beacon;
      s.showRed = !B.ended && !this.spectate && this.deployLeft();
      s.team = this.spectate ? 'p' : 'e';
    } else {
      const S = this.S;
      s.buildings = S.buildings;
      s.obstacles = S.obstacles;
      s.units = [];
      const col = new Map();
      for (const b of S.buildings) {
        if (b.lvl >= 1 && D.COLLECTORS.includes(b.type)) {
          const amt = St.collectorAmount(b, now);
          if (amt >= Math.max(10, D.prodCapacity(b.type, b.lvl) * 0.04)) col.set(b.id, { res: D.BUILDINGS[b.type].prod.res });
        }
      }
      s.collectable = col;
      const sel = this.selected();
      if (sel && !this.ghost) {
        const size = sel.kind === 'building' ? D.BUILDINGS[sel.o.type].size : sel.o.size;
        s.selected = { id: sel.o.id, x: sel.o.x, y: sel.o.y, size };
        if (sel.kind === 'building' && D.DEFENSES.includes(sel.o.type) && sel.o.lvl >= 1) {
          const a = D.BUILDINGS[sel.o.type].atk;
          s.selected.range = a.range;
          s.selected.minRange = a.minRange;
        }
      }
      s.showGrid = !!this.ghost;
      const tut = this.tutorialStep();
      if (tut && tut.building) {
        const b = S.buildings.find((x) => x.type === tut.building && x.lvl >= 1);
        s.tutorialTarget = b ? b.id : null;
      }
    }
    return s;
  }

  // ---------- selection ----------

  select(kind, id) {
    this.selRef = { kind, id };
    this.ui.selSig = '';
  }

  deselect() {
    this.selRef = null;
    this.ui.selEl.classList.add('hidden');
    this.ui.selSig = '';
  }

  // ---------- taps ----------

  dragKind(x, y) {
    if (this.mode === 'place' && this.ghost) {
      const [wx, wy] = this.r.cam.toWorld(x, y);
      const gh = this.ghost;
      if (wx >= gh.x - 1 && wx <= gh.x + gh.size + 1 && wy >= gh.y - 1 && wy <= gh.y + gh.size + 1) return 'ghost';
    }
    return 'pan';
  }

  onTap(px, py) {
    this.sfx.unlock();
    if (this.mode === 'battle') return this.battleTap(px, py);
    if (this.ghost) return this.ghostTo(px, py);
    const hit = this.r.pick(px, py, this.scene(this.now()));
    if (!hit) {
      this.deselect();
      return;
    }
    if (hit.kind === 'building') {
      const b = hit.o;
      this.sfx.play('tap');
      if (D.COLLECTORS.includes(b.type) && b.lvl >= 1) this.collect(b, true);
      this.select('building', b.id);
    } else {
      this.sfx.play('tap');
      this.select('obstacle', hit.o.id);
    }
  }

  // ---------- economy actions ----------

  collect(b, quiet) {
    const r = St.collect(this.S, b, this.now());
    if (r.ok) {
      this.sfx.play('coin');
      const s = D.BUILDINGS[b.type].size;
      this.r.floatText(b.x + s / 2, b.y + s / 2, `+${fmtFull(r.amt)}`, r.res === 'gold' ? '#ffe066' : '#8fe3ff', 60);
      this.dirty();
      this.selSig();
    } else if (!quiet || /full/.test(r.err)) {
      this.sfx.play('error');
      this.ui.toast(r.err);
    }
  }

  offerTopUp(need, then) {
    const S = this.S;
    const pearls = St.shortfall(S, need.res, need.amt);
    const missing = need.amt - S.res[need.res];
    if (pearls > S.res.pearls) {
      this.sfx.play('error');
      this.ui.toast(`Not enough ${need.res}. Raid or collect more.`);
      return;
    }
    this.ui.confirm({
      title: `Not enough ${need.res}`,
      text: `You are missing ${fmtFull(missing)} ${need.res}. Pay ${pearls} pearl${pearls > 1 ? 's' : ''} to cover it?`,
      yes: 'Pay',
      cost: { res: 'pearls', amt: pearls },
      cls: 'gold',
      onYes: () => {
        if (St.topUpWithPearls(S, need.res, need.amt)) {
          this.dirty();
          then();
        }
      },
    });
  }

  offerBuilderSkip() {
    const S = this.S;
    const busy = S.buildings.filter((b) => b.up).sort((a, b) => a.up.end - b.up.end)[0];
    const now = this.now();
    if (!busy) {
      this.ui.toast('All builders are busy');
      return;
    }
    const cost = St.speedUpCost(busy.up, now);
    this.sfx.play('error');
    this.ui.confirm({
      title: 'All builders are busy',
      text: `Your ${D.BUILDINGS[busy.type].name} finishes in ${fmtTime((busy.up.end - now) / 1000)}. Finish it now for ${cost} pearls to free a builder?`,
      yes: 'Finish now',
      cost: { res: 'pearls', amt: cost },
      cls: 'gold',
      onYes: () => this.speedUp(busy, true),
    });
  }

  upgrade(b) {
    const S = this.S;
    const chk = St.checkUpgrade(S, b);
    if (!chk.ok) {
      if (chk.need) return this.offerTopUp(chk.need, () => this.upgrade(b));
      if (chk.builders) return this.offerBuilderSkip();
      this.sfx.play('error');
      this.ui.toast(chk.err);
      return null;
    }
    St.startUpgrade(S, b, this.now());
    this.sfx.play('place');
    this.dirty();
    this.selSig();
    const s = D.BUILDINGS[b.type].size;
    if (D.BUILDINGS[b.type].instant) this.r.floatText(b.x + s / 2, b.y + s / 2, `Level ${b.lvl}!`, '#fff3a0', 40);
    return null;
  }

  upgradeAllWalls(lvl) {
    const r = St.upgradeWalls(this.S, lvl);
    if (r.ok) {
      this.sfx.play('place');
      this.ui.toast(`${r.n} walls upgraded`, 'good');
      this.dirty();
      this.selSig();
    } else if (r.need) {
      this.offerTopUp(r.need, () => this.upgradeAllWalls(lvl));
    } else {
      this.sfx.play('error');
      this.ui.toast(r.err);
    }
  }

  speedUp(b, skipConfirm) {
    const S = this.S;
    const cost = St.speedUpCost(b.up, this.now());
    const go = () => {
      if (St.speedUp(S, b, this.now())) {
        this.handleStateEvents(St.tick(S, this.now()));
        this.dirty();
      } else {
        this.sfx.play('error');
        this.ui.toast('Not enough pearls');
      }
    };
    if (skipConfirm) return go();
    if (S.res.pearls < cost) {
      this.sfx.play('error');
      this.ui.toast('Not enough pearls. Complete goals to earn more.');
      return null;
    }
    this.ui.confirm({ title: 'Finish now?', text: 'Spend pearls to finish instantly.', yes: 'Finish', cost: { res: 'pearls', amt: cost }, cls: 'gold', onYes: go });
    return null;
  }

  speedUpForge() {
    const S = this.S;
    if (St.speedUpForge(S, this.now())) {
      this.handleStateEvents(St.tick(S, this.now()));
      this.dirty();
    } else {
      this.sfx.play('error');
      this.ui.toast('Not enough pearls');
    }
  }

  speedUpObstacle(o) {
    if (St.speedUpObstacle(this.S, o, this.now())) {
      this.handleStateEvents(St.tick(this.S, this.now()));
      this.dirty();
    } else {
      this.sfx.play('error');
      this.ui.toast('Not enough pearls');
    }
  }

  clearObstacle(o) {
    const chk = St.checkClear(this.S, o);
    if (!chk.ok) {
      if (chk.need) return this.offerTopUp(chk.need, () => this.clearObstacle(o));
      if (chk.builders) return this.offerBuilderSkip();
      this.sfx.play('error');
      this.ui.toast(chk.err);
      return null;
    }
    St.clearObstacle(this.S, o, this.now());
    this.sfx.play('place');
    this.dirty();
    this.selSig();
    return null;
  }

  train(troop) {
    const r = St.train(this.S, troop, this.now());
    if (r.ok) {
      this.sfx.play('tap');
      this.dirty();
      this.ui.forceRefresh();
    } else {
      this.sfx.play('error');
      if (!this._trainWarn || performance.now() - this._trainWarn > 900) {
        this._trainWarn = performance.now();
        this.ui.toast(r.err);
      }
    }
  }

  startForge(troop) {
    const chk = St.checkForge(this.S, troop);
    if (!chk.ok) {
      if (chk.need) return this.offerTopUp(chk.need, () => this.startForge(troop));
      this.sfx.play('error');
      this.ui.toast(chk.err);
      return null;
    }
    St.startForge(this.S, troop, this.now());
    this.sfx.play('place');
    this.dirty();
    this.ui.forceRefresh();
    return null;
  }

  searchRivals() {
    if (this.S.res.gold < 50) {
      this.sfx.play('error');
      this.ui.toast('You need 50 gold to search again');
      return;
    }
    this.S.res.gold -= 50;
    this.rivalSeed += 3;
    this.sfx.play('tap');
    this.dirty();
    this.ui.forceRefresh();
  }

  skipTutorial() {
    this.S.tutorial = TUTORIAL.length;
    this.dirty();
    this.ui.setHint(null);
  }

  tutorialStep() {
    const t = this.S.tutorial;
    return t < TUTORIAL.length ? TUTORIAL[t] : null;
  }

  checkTutorial() {
    const S = this.S;
    let step = this.tutorialStep();
    while (step && step.done(S, this)) {
      S.tutorial++;
      this.dirty();
      this.sfx.play('done');
      step = this.tutorialStep();
      if (!step) {
        S.res.pearls += 20;
        this.ui.toast('Tutorial complete! +20 pearls', 'good');
      }
    }
    const busy = this.mode !== 'home' || this.ui.sheet;
    if (step && !busy) this.ui.setHint(step.text, step.ui);
    else this.ui.setHint(null);
  }

  // ---------- placing buildings ----------

  beginPlace(type) {
    const d = D.BUILDINGS[type];
    const S = this.S;
    if (D.countAllowed(type, St.keepLevel(S)) <= St.countOf(S, type)) {
      this.ui.toast('Limit reached');
      return;
    }
    this.ui.closeSheet(true);
    this.deselect();
    const cam = this.r.cam;
    const [wx, wy] = cam.toWorld(cam.w / 2, cam.h * 0.4);
    this.ghost = { type, size: d.size, x: 0, y: 0, valid: false, moving: 0, dir: [1, 0] };
    this.placeNear(wx, wy);
    this.mode = 'place';
    this.ui.setMode('place');
    this.ui.showPlace();
    this.sfx.play('ui');
  }

  beginMove(b) {
    this.deselect();
    this.ghost = { type: b.type, size: D.BUILDINGS[b.type].size, x: b.x, y: b.y, valid: true, moving: b.id, lvl: b.lvl, dir: [1, 0] };
    this.mode = 'place';
    this.ui.setMode('place');
    this.ui.showPlace();
  }

  placeNear(wx, wy) {
    const gh = this.ghost;
    const cx = Math.round(wx - gh.size / 2);
    const cy = Math.round(wy - gh.size / 2);
    for (let r = 0; r < 14; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (St.canPlace(this.S, gh.type, cx + dx, cy + dy, gh.moving)) {
            this.setGhost(cx + dx, cy + dy);
            return;
          }
        }
      }
    }
    this.setGhost(cx, cy);
  }

  setGhost(x, y) {
    const gh = this.ghost;
    x = clamp(x, D.BUILD0, D.BUILD1 - gh.size);
    y = clamp(y, D.BUILD0, D.BUILD1 - gh.size);
    gh.x = x;
    gh.y = y;
    gh.valid = St.canPlace(this.S, gh.type, x, y, gh.moving);
    this.ui.placeSig = '';
  }

  ghostTo(px, py) {
    const [wx, wy] = this.r.cam.toWorld(px, py);
    this.setGhost(Math.floor(wx - this.ghost.size / 2 + 0.5), Math.floor(wy - this.ghost.size / 2 + 0.5));
    this.sfx.play('tap');
  }

  ghostDrag(px, py) {
    const [wx, wy] = this.r.cam.toWorld(px, py - 34);
    this.setGhost(Math.floor(wx - this.ghost.size / 2 + 0.5), Math.floor(wy - this.ghost.size / 2 + 0.5));
  }

  cancelPlace() {
    this.ghost = null;
    this.mode = 'home';
    this.ui.setMode('home');
    this.sfx.play('tap');
  }

  confirmPlace() {
    const gh = this.ghost;
    const S = this.S;
    if (!gh) return;
    if (!gh.valid) {
      this.sfx.play('error');
      this.ui.toast('You cannot build there');
      return;
    }
    if (gh.moving) {
      const b = St.byId(S, gh.moving);
      St.moveBuilding(S, b, gh.x, gh.y);
      this.sfx.play('place');
      this.dirty();
      this.ghost = null;
      this.mode = 'home';
      this.ui.setMode('home');
      this.select('building', b.id);
      return;
    }
    const chk = St.checkBuild(S, gh.type);
    if (!chk.ok) {
      if (chk.need) return this.offerTopUp(chk.need, () => this.confirmPlace());
      if (chk.builders) return this.offerBuilderSkip();
      this.sfx.play('error');
      this.ui.toast(chk.err);
      return;
    }
    const r = St.startBuild(S, gh.type, gh.x, gh.y, this.now());
    if (!r.ok) {
      this.sfx.play('error');
      this.ui.toast(r.err);
      return;
    }
    this.sfx.play('place');
    this.dirty();
    const sz = gh.size;
    this.r.add({ k: 'ring', x: gh.x + sz / 2, y: gh.y + sz / 2, life: 0, max: 0.5, r: sz, c: '255,255,255' });
    if (gh.type === 'wall') {
      // keep going: walls come in lines. Try straight ahead, then turn.
      const [dx, dy] = gh.dir;
      const tries = [[dx, dy], [dy, dx], [-dy, -dx], [-dx, -dy]];
      const px = gh.x;
      const py = gh.y;
      for (const [tx, ty] of tries) {
        if (St.canPlace(S, 'wall', px + tx, py + ty)) {
          gh.dir = [tx, ty];
          this.setGhost(px + tx, py + ty);
          break;
        }
      }
      if (!gh.valid) this.setGhost(px, py);
      if (St.countOf(S, 'wall') >= D.countAllowed('wall', St.keepLevel(S))) this.cancelPlace();
    } else {
      this.ghost = null;
      this.mode = 'home';
      this.ui.setMode('home');
      this.select('building', r.b.id);
    }
  }

  // ---------- battle ----------

  deployLeft() {
    const B = this.B;
    return Object.values(B.reserve).some((r) => r.count > 0);
  }

  startBattle(base, opts = {}) {
    const S = this.S;
    let army = {};
    if (opts.army) {
      army = opts.army;
    } else {
      for (const t of D.TROOP_ORDER) if (S.army[t] > 0) army[t] = { count: S.army[t], lvl: S.troopLvl[t] };
      if (!Object.keys(army).length) {
        this.sfx.play('error');
        this.ui.toast('Train some troops first!');
        this.ui.openArmy();
        return;
      }
    }
    this.ui.closeSheet(true);
    this.deselect();
    this.spectate = !!opts.spectate;
    const seed = (Date.now() ^ (base.tier * 7919)) & 0xffff;
    const B = Sim.createBattle(base, army, { seed, mode: base.kind === 'outpost' ? 'stage' : 'rival', stage: base.stage ?? null });
    this.B = B;
    this.mode = 'battle';
    this.speed = 1;
    this.acc = 0;
    this.holding = false;
    this.beaconMode = false;
    this.battleOver = false;
    this.showHint = true;
    this.r.fx.length = 0;
    this.deployTroop = D.TROOP_ORDER.find((t) => B.reserve[t]) || '';
    this.ui.setMode('battle');
    this.ui.showBattle(B);
    const cam = this.r.cam;
    cam.cx = 17;
    cam.cy = 17;
    cam.zoom = Math.max(cam.minZoom(), 0.3);
    cam.clamp();
    if (this.spectate) {
      Sim.autoPlay(B, { seed });
      this.ui.battleEl.classList.add('spectate');
      this.ui.endBtn.firstChild.textContent = 'Close';
    } else {
      this.ui.battleEl.classList.remove('spectate');
    }
    this.sfx.play('ui');
  }

  selectTroop(t) {
    if (!this.B || !this.B.reserve[t]) return;
    this.deployTroop = t;
    this.beaconMode = false;
    this.sfx.play('tap');
    this.ui.troopSig = '';
  }

  toggleBeacon() {
    this.beaconMode = !this.beaconMode;
    this.sfx.play('tap');
    this.ui.troopSig = '';
    if (this.beaconMode) this.ui.toast('Tap the map to place the beacon');
  }

  toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : 1;
    this.ui.speedBtn.firstChild.textContent = this.speed + '×';
    this.sfx.play('tap');
  }

  battleTap(px, py) {
    const B = this.B;
    if (!B || B.ended || this.spectate) return;
    const [wx, wy] = this.r.cam.toWorld(px, py);
    if (this.beaconMode) {
      Sim.setBeacon(B, wx, wy);
      this.beaconMode = false;
      this.sfx.play('beacon');
      this.ui.troopSig = '';
      return;
    }
    this.deployAt(wx, wy, true);
  }

  deployAt(wx, wy, loud) {
    const B = this.B;
    let t = this.deployTroop;
    if (!t || Sim.remaining(B, t) < 1) {
      t = D.TROOP_ORDER.find((x) => Sim.remaining(B, x) > 0) || '';
      this.deployTroop = t;
      this.ui.troopSig = '';
    }
    if (!t) return;
    if (Sim.deploy(B, t, wx, wy)) {
      this.sfx.play('deploy');
      this.showHint = false;
      if (Sim.remaining(B, t) < 1) {
        this.deployTroop = D.TROOP_ORDER.find((x) => Sim.remaining(B, x) > 0) || '';
      }
      this.ui.troopSig = '';
    } else if (loud) {
      this.sfx.play('error');
      this.ui.toast('Too close to buildings. Drop troops on the shore.');
    }
  }

  stepBattle(dt) {
    const B = this.B;
    if (!B) return;
    if (this.holding && this.holdPos && !B.ended) {
      this.holdT -= dt;
      while (this.holdT <= 0) {
        this.holdT += 0.085;
        const [wx, wy] = this.r.cam.toWorld(this.holdPos.x, this.holdPos.y);
        this.deployAt(wx, wy, false);
      }
    }
    if (!B.ended) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= Sim.STEP_DT && n < 10) {
        Sim.step(B, Sim.STEP_DT);
        this.acc -= Sim.STEP_DT;
        n++;
        this.handleBattleEvents(B.events);
        B.events = [];
        if (B.ended) break;
      }
      if (this.acc > 0.5) this.acc = 0;
      if (B.beacon && B.t - B.beacon.at > 1) {
        const left = B.b.some((b) => b.alive && b.counted && Math.hypot(b.cx - B.beacon.x, b.cy - B.beacon.y) <= B.beacon.r + b.size / 2);
        if (!left) Sim.clearBeacon(B);
      }
    }
    if (B.ended && !this.battleOver) {
      this.battleOver = true;
      this.holding = false;
      setTimeout(() => this.finishBattle(), this.spectate ? 1200 : 900);
    }
  }

  handleBattleEvents(events) {
    const B = this.B;
    this.r.ingest(events);
    for (const e of events) {
      switch (e.t) {
        case 'shot':
          this.sfx.play(e.kind === 'cannon' ? 'cannon' : e.kind === 'ballista' ? 'bolt' : e.kind === 'mortar' ? 'shell' : 'sling');
          break;
        case 'boom': this.sfx.play('boom'); break;
        case 'destroyed': {
          if (e.type === 'wall') { this.sfx.play('tap'); break; }
          this.sfx.play('crumble');
          const b = B.b.find((x) => x.id === e.id);
          if (b && b.counted && !this.spectate) {
            const g = Math.floor(b.share.gold);
            const c = Math.floor(b.share.crystal);
            if (g > 0) this.r.floatText(e.x, e.y, `+${g}`, '#ffe066', 55);
            if (c > 0) this.r.floatText(e.x + 0.4, e.y + 0.4, `+${c}`, '#8fe3ff', 38);
          }
          break;
        }
        case 'swing': this.sfx.play('swing'); break;
        case 'die': this.sfx.play('die'); break;
        case 'star': this.sfx.play('star'); this.ui.toast('★'.repeat(e.n) + ' star' + (e.n > 1 ? 's' : ''), 'good'); break;
        default:
      }
    }
  }

  finishBattle() {
    const B = this.B;
    if (!B || this.mode !== 'battle') return;
    const r = Sim.result(B);
    if (this.spectate) {
      this.sfx.play(r.stars >= 2 ? 'lose' : 'win');
      this.ui.showDefenseReport(r, B);
      return;
    }
    const applied = St.applyRaid(this.S, r, this.now());
    this.dirty();
    this.save();
    this.sfx.play(r.stars >= 1 ? 'win' : 'lose');
    this.ui.showResults(r, applied, B.base);
  }

  surrender() {
    const B = this.B;
    if (!B) return;
    if (!B.started || this.spectate) {
      this.returnHome();
      return;
    }
    if (B.ended) return;
    Sim.end(B, 'surrender');
    this.battleOver = true;
    this.holding = false;
    this.finishBattle();
  }

  returnHome() {
    if (!this.B) return;
    this.B = null;
    this.spectate = false;
    this.mode = 'home';
    this.holding = false;
    this.r.fx.length = 0;
    this.ui.closeSheet(true);
    this.ui.setMode('home');
    this.homeCamera();
    this.ui.battleEl.classList.remove('spectate');
    this.checkTutorial();
  }

  watchDefence() {
    const S = this.S;
    const k = St.keepLevel(S);
    const base = G.fromPlayer(S, 'Your island');
    this.startBattle(base, { spectate: true, army: G.typicalArmy(k) });
  }
}

const game = new Game();
game.start();
connectCloud(game, St).then((link) => { game.cloud = link; });

// Offline support, only on a real https host (the dev server must never be cached).
if ('serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Handy for tests and tinkering in the console.
window.tidehold = {
  game,
  D, St, G, Sim,
  advance(ms) {
    game.skew += ms;
    game.handleStateEvents(St.tick(game.S, game.now()));
    return game.S;
  },
  dist,
};
