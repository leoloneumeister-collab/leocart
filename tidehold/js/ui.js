// DOM user interface: HUD, dock, selection panel, shop, army, raid picker, battle HUD, results.
// The game controller (main.js) owns the state; this module only draws it and calls back into `game`.

import * as D from './data.js';
import * as St from './state.js';
import * as G from './gen.js';
import * as A from './art.js';
import { fmt, fmtFull, fmtTime } from './data.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ico = (res) => h('i', { class: `ico ${res}` });
export const chip = (res, amt, bad) => h('span', { class: 'chip' + (bad ? ' bad' : '') }, ico(res), fmt(amt));

export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.sheet = null;
    this.selSig = '';
    this.toastEl = h('div', { class: 'toasts' });
    this.hud = h('div', { class: 'hud' });
    this.side = h('div', { class: 'side' });
    this.dock = h('div', { class: 'dock' });
    this.selEl = h('div', { class: 'sel hidden' });
    this.placeEl = h('div', { class: 'place hidden' });
    this.battleEl = h('div', { class: 'battle hidden' });
    this.hintEl = h('div', { class: 'hint hidden' });
    this.sheetRoot = h('div', { class: 'sheet-root' });
    root.append(this.hud, this.side, this.hintEl, this.selEl, this.placeEl, this.dock, this.battleEl, this.sheetRoot, this.toastEl);
    this.buildHud();
    this.buildDock();
    this.iconCache = new Map();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeSheet();
    });
  }

  // ---------- small helpers ----------

  icon(type, lvl = 1, size = 64) {
    if (this.game.mode3d) {
      const tier = lvl <= 2 ? 1 : lvl <= 4 ? 2 : 3;
      return h('img', { class: 'icon', src: `icons/ui/b_${type}_${tier}.webp`, width: size, height: size, alt: '', draggable: 'false' });
    }
    const key = `${type}|${lvl}|${size}`;
    let c = this.iconCache.get(key);
    if (!c) {
      c = A.buildingIcon(type, lvl, size);
      this.iconCache.set(key, c);
    }
    const n = document.createElement('canvas');
    n.width = c.width;
    n.height = c.height;
    n.getContext('2d').drawImage(c, 0, 0);
    n.className = 'icon';
    n.style.width = size + 'px';
    n.style.height = size + 'px';
    return n;
  }

  troopIcon(troop, size = 56) {
    if (this.game.mode3d) {
      return h('img', { class: 'icon', src: `icons/ui/u_${troop}.webp`, width: size, height: size, alt: '', draggable: 'false' });
    }
    const c = A.troopIcon(troop, size);
    c.className = 'icon';
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    return c;
  }

  btn(label, cls, onClick, extra) {
    const b = h('button', { class: `btn ${cls || ''}`, type: 'button', ...extra }, label);
    if (onClick) b.addEventListener('click', (e) => { e.stopPropagation(); this.game.sfx.play('tap'); onClick(e); });
    return b;
  }

  toast(msg, kind = '') {
    const t = h('div', { class: `toast ${kind}` }, msg);
    this.toastEl.append(t);
    while (this.toastEl.children.length > 2) this.toastEl.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2300);
    setTimeout(() => t.remove(), 2800);
  }

  // ---------- HUD ----------

  resPill(res) {
    const val = h('span', { class: 'v' }, '0');
    const fill = h('i');
    const el = h('div', { class: `pill res ${res}`, 'data-res': res }, ico(res), val, res !== 'pearls' ? h('div', { class: 'cap' }, fill) : null);
    return { el, val, fill };
  }

  buildHud() {
    this.pg = this.resPill('gold');
    this.pc = this.resPill('crystal');
    this.pp = this.resPill('pearls');
    this.keepVal = h('span', { class: 'v' }, '');
    this.trophyVal = h('span', { class: 'v' }, '0');
    this.keepBadge = h('button', { class: 'pill badge', type: 'button', onclick: () => this.openQuests() }, h('i', { class: 'shield' }), this.keepVal, h('span', { class: 'sep' }), '🏆 ', this.trophyVal);
    this.buildersVal = h('span', { class: 'v' }, '2/2');
    this.buildersPill = h('button', { class: 'pill builders', type: 'button', onclick: () => this.openBuilders() }, '🔨 ', this.buildersVal);
    this.hud.append(h('div', { class: 'row' }, this.pg.el, this.pc.el, this.pp.el), h('div', { class: 'row r2' }, this.keepBadge, this.buildersPill));
    this.questBtn = h('button', { class: 'round', type: 'button', 'data-id': 'quests', onclick: () => { this.game.sfx.play('tap'); this.openQuests(); } }, '🎯', h('b', { class: 'dot hidden' }, '!'));
    this.setBtn = h('button', { class: 'round', type: 'button', onclick: () => { this.game.sfx.play('tap'); this.openSettings(); } }, '⚙');
    this.side.append(this.questBtn, this.setBtn);
  }

  buildDock() {
    const mk = (id, emoji, label, cls, fn) => h('button', { class: `dock-btn ${cls}`, type: 'button', 'data-id': id, onclick: () => { this.game.sfx.play('ui'); fn(); } }, h('span', { class: 'e' }, emoji), h('span', { class: 'l' }, label));
    this.dock.append(mk('shop', '🔨', 'Shop', 'blue', () => this.openShop()), mk('raid', '⚔', 'Raid!', 'raid', () => this.openRaid()), mk('army', '🛡', 'Army', 'blue', () => this.openArmy()));
  }

  setMode(mode) {
    this.mode = mode;
    const home = mode === 'home';
    this.hud.classList.toggle('hidden', mode === 'battle');
    this.side.classList.toggle('hidden', mode !== 'home');
    this.dock.classList.toggle('hidden', !home);
    this.placeEl.classList.toggle('hidden', mode !== 'place');
    this.battleEl.classList.toggle('hidden', mode !== 'battle');
    if (!home) this.selEl.classList.add('hidden');
    this.selSig = '';
  }

  // ---------- periodic update ----------

  update(now) {
    const S = this.game.S;
    const cap = St.capacity(S);
    this.pg.val.textContent = fmtFull(S.res.gold);
    this.pc.val.textContent = fmtFull(S.res.crystal);
    this.pp.val.textContent = fmtFull(S.res.pearls);
    this.pg.fill.style.width = Math.min(100, (S.res.gold / cap.gold) * 100) + '%';
    this.pc.fill.style.width = Math.min(100, (S.res.crystal / cap.crystal) * 100) + '%';
    this.pg.el.classList.toggle('full', S.res.gold >= cap.gold);
    this.pc.el.classList.toggle('full', S.res.crystal >= cap.crystal);
    const lg = St.league(S);
    this.keepBadge.style.setProperty('--league', lg.color);
    this.keepVal.textContent = `Keep ${St.keepLevel(S)}`;
    this.trophyVal.textContent = S.trophies;
    this.buildersVal.textContent = `${St.freeBuilders(S)}/${S.builders}`;
    this.buildersPill.classList.toggle('busy', St.freeBuilders(S) === 0);
    this.questBtn.lastChild.classList.toggle('hidden', St.claimableQuests(S).length === 0);
    if (this.mode === 'home') this.updateSelection(now);
    if (this.mode === 'place') this.updatePlace();
    if (this.sheet && this.sheet.refresh) this.sheet.refresh(now);
  }

  // ---------- selection panel ----------

  updateSelection(now) {
    const sel = this.game.selected();
    if (!sel) {
      this.selEl.classList.add('hidden');
      this.selSig = '';
      return;
    }
    const S = this.game.S;
    const sig = sel.kind === 'building'
      ? `b${sel.o.id}:${sel.o.lvl}:${sel.o.up ? Math.ceil((sel.o.up.end - now) / 1000) : 0}:${S.res.gold > 1e9 ? 0 : Math.floor(S.res.gold / 50)}:${Math.floor(S.res.crystal / 50)}:${St.freeBuilders(S)}:${Math.floor(S.res.pearls / 5)}:${S.forge ? 1 : 0}:${St.keepLevel(S)}`
      : `o${sel.o.id}:${sel.o.clearing ? Math.ceil((sel.o.clearing.end - now) / 1000) : 0}:${St.freeBuilders(S)}`;
    if (sig === this.selSig) return;
    this.selSig = sig;
    this.selEl.classList.remove('hidden');
    this.selEl.replaceChildren(sel.kind === 'building' ? this.buildingPanel(sel.o, now) : this.obstaclePanel(sel.o, now));
  }

  obstaclePanel(o, now) {
    const d = D.OBSTACLES[o.kind];
    const g = this.game;
    const acts = [];
    if (o.clearing) {
      acts.push(this.btn(h('span', null, `Finish now `, h('span', { class: 'chip' }, ico('pearls'), St.speedUpCost(o.clearing, now))), 'gold', () => g.speedUpObstacle(o)));
    } else {
      acts.push(this.btn(h('span', null, 'Clear ', chip('gold', d.cost, g.S.res.gold < d.cost)), 'green', () => g.clearObstacle(o)));
    }
    return h('div', { class: 'selcard' },
      h('div', { class: 'selhead' }, this.closeX(), h('div', { class: 'seltitle' }, d.name), h('div', { class: 'selsub' }, o.clearing ? `Clearing... ${fmtTime((o.clearing.end - now) / 1000)}` : `Clear it for ${d.pearls} pearl${d.pearls > 1 ? 's' : ''}. Takes ${fmtTime(d.time)}.`)),
      h('div', { class: 'selbtns' }, acts));
  }

  closeX() {
    return h('button', { class: 'selclose', type: 'button', 'aria-label': 'Close', onclick: () => { this.game.sfx.play('tap'); this.game.deselect(); } }, '✕');
  }

  statLine(b) {
    const d = D.BUILDINGS[b.type];
    const lvl = Math.max(1, b.lvl);
    switch (d.cat) {
      case 'def': {
        const s = D.defenseStats(b.type, lvl);
        return `${Math.round(s.dps)} damage/s · range ${s.range} · ${D.buildingHp(b.type, lvl)} HP`;
      }
      case 'trap': return `Hidden · ${Math.round(D.trapStats(lvl).dmg)} blast damage`;
      case 'wall': return `${D.buildingHp('wall', lvl)} HP`;
      default: break;
    }
    if (d.prod) return `${fmt(D.prodPerHour(b.type, lvl))} ${d.prod.res}/hour · holds ${fmt(D.prodCapacity(b.type, lvl))}`;
    if (d.store) return `Stores ${fmt(D.storeCapacity(b.type, lvl))} ${d.store.res}`;
    if (b.type === 'camp') return `Holds ${D.housingOf(lvl)} troop space`;
    if (b.type === 'barracks') return `Trains one troop at a time`;
    if (b.type === 'keep') return `Level ${lvl} of ${D.KEEP_MAX}`;
    return d.desc;
  }

  buildingPanel(b, now) {
    const g = this.game;
    const S = g.S;
    const d = D.BUILDINGS[b.type];
    const acts = [];
    const busy = !!b.up;
    if (busy) {
      acts.push(this.btn(h('span', null, 'Finish now ', h('span', { class: 'chip' }, ico('pearls'), St.speedUpCost(b.up, now))), 'gold', () => g.speedUp(b)));
    } else {
      const chk = St.checkUpgrade(S, b);
      const nextCost = b.lvl < d.max ? D.buildCost(b.type, b.lvl + 1) : null;
      if (nextCost) {
        const t = D.buildTime(b.type, b.lvl + 1);
        const label = chk.keepNeeded ? h('span', null, `Needs Keep ${chk.keepNeeded + 0}`) : h('span', null, 'Upgrade ', chip(nextCost.res, nextCost.amt, !St.canAfford(S, nextCost.res, nextCost.amt)), t ? h('small', { class: 'tm' }, fmtTime(t)) : null);
        acts.push(this.btn(label, chk.keepNeeded ? 'gray' : 'green', () => g.upgrade(b)));
      }
      if (D.COLLECTORS.includes(b.type)) {
        const amt = Math.floor(St.collectorAmount(b, now));
        if (amt >= 1) acts.push(this.btn(h('span', null, 'Collect ', chip(d.prod.res, amt)), 'blue', () => g.collect(b)));
      }
      if (b.type === 'barracks' || b.type === 'camp') acts.push(this.btn('Army', 'blue', () => this.openArmy()));
      if (b.type === 'forge') acts.push(this.btn('Forge', 'blue', () => this.openForge()));
      if (b.type === 'wall') {
        const q = St.wallUpgradeQuote(S, b.lvl);
        const cap = D.maxLevelAllowed('wall', St.keepLevel(S));
        if (q.n > 1 && b.lvl < cap) acts.push(this.btn(h('span', null, `All ${q.n} `, chip(q.res, q.total, S.res[q.res] < q.each)), 'green', () => g.upgradeAllWalls(b.lvl)));
      }
    }
    acts.push(this.btn('ℹ', 'gray sm', () => this.openInfo(b)));
    if (b.type !== 'keep') acts.push(this.btn('✥ Move', 'gray', () => g.beginMove(b)));
    const sub = busy ? `${b.lvl === 0 ? 'Building' : 'Upgrading to level ' + b.up.to}... ${fmtTime((b.up.end - now) / 1000)}` : this.statLine(b);
    return h('div', { class: 'selcard' },
      h('div', { class: 'selhead' }, this.closeX(), h('div', { class: 'seltitle' }, d.name, h('span', { class: 'lvl' }, b.lvl ? `Lv ${b.lvl}` : 'New')), h('div', { class: 'selsub' }, sub)),
      h('div', { class: 'selbtns' }, acts));
  }

  // ---------- placement ----------

  showPlace() {
    this.placeEl.classList.remove('hidden');
    this.placeSig = '';
    this.updatePlace();
  }

  updatePlace() {
    const g = this.game;
    const gh = g.ghost;
    if (!gh) return;
    const S = g.S;
    const sig = `${gh.valid}:${gh.type}:${gh.moving}:${Math.floor(S.res.gold / 20)}`;
    if (sig === this.placeSig) return;
    this.placeSig = sig;
    const d = D.BUILDINGS[gh.type];
    const cost = gh.moving ? null : D.buildCost(gh.type, 1);
    this.placeEl.replaceChildren(h('div', { class: 'selcard' },
      h('div', { class: 'selhead' }, h('div', { class: 'seltitle' }, gh.moving ? `Move ${d.name}` : `Place ${d.name}`), h('div', { class: 'selsub' }, gh.valid ? 'Tap the map or drag the building. Pinch to zoom.' : 'You cannot build there.')),
      h('div', { class: 'selbtns' },
        this.btn('✕', 'red', () => g.cancelPlace()),
        this.btn(h('span', null, '✔ ', cost ? chip(cost.res, cost.amt, S.res[cost.res] < cost.amt) : 'Done'), gh.valid ? 'green' : 'gray', () => g.confirmPlace()))));
  }

  // ---------- sheets ----------

  openSheet(title, body, opts = {}) {
    this.closeSheet(true);
    const panel = h('div', { class: 'panel' }, h('div', { class: 'phead' }, h('h2', null, title), h('button', { class: 'x', type: 'button', onclick: () => { this.game.sfx.play('tap'); this.closeSheet(); } }, '✕')), h('div', { class: 'pbody' }, body));
    const back = h('div', { class: 'sheet-back', onclick: (e) => { if (e.target === back) this.closeSheet(); } }, panel);
    this.sheetRoot.append(back);
    this.sheet = { el: back, id: opts.id, refresh: opts.refresh, onClose: opts.onClose, body: panel.querySelector('.pbody'), render: opts.render };
    requestAnimationFrame(() => back.classList.add('in'));
    return this.sheet;
  }

  closeSheet(silent) {
    if (!this.sheet) return;
    const s = this.sheet;
    this.sheet = null;
    s.el.remove();
    if (s.onClose && !silent) s.onClose();
    this.game.onSheetClosed(s.id);
  }

  // A sheet whose body is rebuilt from `render()` whenever it refreshes.
  liveSheet(id, title, render, every = 1000) {
    let last = 0;
    const sh = this.openSheet(title, render(), {
      id,
      refresh: (now) => {
        const t = performance.now();
        if (t - last < every) return;
        last = t;
        const top = sh.body.scrollTop;
        const keep = sh.body.querySelector('.noRefresh');
        if (keep && keep.matches(':active')) return;
        sh.body.replaceChildren(render());
        sh.body.scrollTop = top;
      },
    });
    return sh;
  }

  forceRefresh() {
    if (this.sheet && this.sheet.refresh) {
      const s = this.sheet;
      const top = s.body.scrollTop;
      if (s.render) s.body.replaceChildren(s.render());
      s.body.scrollTop = top;
    }
  }

  confirm({ title, text, yes, no = 'Cancel', cost, onYes, cls = 'green' }) {
    const body = h('div', { class: 'confirm' }, h('p', null, text), h('div', { class: 'row btns' }, this.btn(no, 'gray', () => this.closeSheet()), this.btn(h('span', null, yes, ' ', cost ? chip(cost.res, cost.amt) : null), cls, () => { this.closeSheet(); onYes(); })));
    this.openSheet(title, body, { id: 'confirm', small: true });
    this.sheet.el.classList.add('small');
  }

  // ---------- shop ----------

  openShop(tabId) {
    const g = this.game;
    let tab = tabId || this.shopTab || 'res';
    const render = () => {
      const S = g.S;
      const tabs = h('div', { class: 'tabs' }, D.SHOP_TABS.map((t) => h('button', { class: 'tab' + (t.id === tab ? ' on' : ''), type: 'button', onclick: () => { tab = t.id; this.shopTab = t.id; g.sfx.play('tap'); this.sheet.body.replaceChildren(render()); } }, t.name)));
      const cur = D.SHOP_TABS.find((t) => t.id === tab);
      const cards = cur.types.map((type) => {
        const d = D.BUILDINGS[type];
        const allowed = D.countAllowed(type, St.keepLevel(S));
        const have = St.countOf(S, type);
        const cost = D.buildCost(type, 1);
        const locked = allowed === 0;
        const full = !locked && have >= allowed;
        const time = D.buildTime(type, 1);
        let need = St.keepLevel(S) + 1;
        while (locked && need <= D.KEEP_MAX && D.countAllowed(type, need) === 0) need++;
        return h('button', { class: 'card' + (locked ? ' locked' : '') + (full ? ' full' : ''), type: 'button', onclick: () => { if (locked) { g.sfx.play('error'); this.toast(`Needs Keep level ${need}`); } else if (full) { g.sfx.play('error'); this.toast('Limit reached. Upgrade the Keep for more.'); } else g.beginPlace(type); } },
          h('div', { class: 'cicon' }, this.icon(type, 1, 76)),
          h('div', { class: 'cname' }, d.name),
          h('div', { class: 'cdesc' }, d.desc),
          h('div', { class: 'cfoot' }, locked ? h('span', { class: 'lock' }, `🔒 Keep ${need}`) : h('span', { class: 'count' }, `${have}/${allowed}`), locked ? null : chip(cost.res, cost.amt, S.res[cost.res] < cost.amt), time ? h('small', { class: 'tm' }, fmtTime(time)) : h('small', { class: 'tm' }, 'instant')));
      });
      return h('div', null, tabs, h('div', { class: 'grid' }, cards));
    };
    this.openSheet('Shop', render(), { id: 'shop', refresh: () => {}, render });
  }

  openBuilders() {
    const g = this.game;
    const render = () => {
      const S = g.S;
      const price = St.builderPrice(S);
      const rows = [];
      for (let i = 0; i < S.builders; i++) {
        const busy = S.buildings.filter((b) => b.up)[i] || null;
        rows.push(h('div', { class: 'row' }, h('span', { class: 'e' }, '👷'), h('div', { class: 'grow' }, `Builder ${i + 1}`, h('div', { class: 'sub' }, busy ? `${D.BUILDINGS[busy.type].name}: ${fmtTime((busy.up.end - g.now()) / 1000)}` : 'Free'))));
      }
      return h('div', null, h('p', { class: 'muted' }, 'Builders construct and upgrade. Walls and clearing rocks and trees also need one.'), rows,
        price ? this.btn(h('span', null, 'Hire another builder ', chip('pearls', price, S.res.pearls < price)), 'gold', () => { if (St.buyBuilder(S)) { g.sfx.play('done'); g.dirty(); this.forceRefresh(); this.toast('A new builder joined!'); } else { g.sfx.play('error'); this.toast('Not enough pearls'); } }) : h('p', { class: 'muted' }, 'You have the maximum number of builders.'));
    };
    this.openSheet('Builders', render(), { id: 'builders', render, refresh: () => {} });
  }

  // ---------- info ----------

  openInfo(b) {
    const d = D.BUILDINGS[b.type];
    const rows = [];
    const lvl = Math.max(1, b.lvl);
    const next = Math.min(d.max, lvl + 1);
    const add = (label, a, bb) => rows.push(h('tr', null, h('td', null, label), h('td', null, a), h('td', { class: 'nx' }, lvl < d.max ? bb : '')));
    add('Hit points', fmt(D.buildingHp(b.type, lvl)), fmt(D.buildingHp(b.type, next)));
    if (d.atk && d.cat === 'def') {
      const a = D.defenseStats(b.type, lvl);
      const n = D.defenseStats(b.type, next);
      add('Damage per hit', Math.round(a.dmg), Math.round(n.dmg));
      add('Damage per second', Math.round(a.dps), Math.round(n.dps));
      add('Range', a.range + ' tiles', n.range + ' tiles');
      add('Hits flyers', a.air ? 'Yes' : 'No', '');
      if (a.splash) add('Blast radius', a.splash + ' tiles', '');
    }
    if (d.cat === 'trap') add('Blast damage', Math.round(D.trapStats(lvl).dmg), Math.round(D.trapStats(next).dmg));
    if (d.prod) {
      add('Output per hour', fmt(D.prodPerHour(b.type, lvl)), fmt(D.prodPerHour(b.type, next)));
      add('Holds', fmt(D.prodCapacity(b.type, lvl)), fmt(D.prodCapacity(b.type, next)));
    }
    if (d.store) add('Stores', fmt(D.storeCapacity(b.type, lvl)), fmt(D.storeCapacity(b.type, next)));
    if (b.type === 'camp') add('Troop space', D.housingOf(lvl), D.housingOf(next));
    if (b.type === 'keep') {
      add('Gold storage', fmt(d.storeGold[lvl - 1]), fmt(d.storeGold[next - 1]));
      add('Crystal storage', fmt(d.storeCrystal[lvl - 1]), fmt(d.storeCrystal[next - 1]));
    }
    if (b.type === 'barracks') add('Unlocks', D.TROOP_ORDER.filter((t) => D.TROOPS[t].unlock <= lvl).map((t) => D.TROOPS[t].name).join(', '), '');
    const body = h('div', null, h('div', { class: 'infohead' }, this.icon(b.type, lvl, 84), h('div', null, h('h3', null, `${d.name}  Lv ${lvl}`), h('p', { class: 'muted' }, d.desc))),
      h('table', { class: 'stats' }, h('thead', null, h('tr', null, h('th'), h('th', null, 'Now'), h('th', null, 'Next'))), h('tbody', null, rows)));
    this.openSheet('Details', body, { id: 'info' });
  }

  // ---------- army ----------

  openArmy() {
    const g = this.game;
    const render = () => {
      const S = g.S;
      const used = St.armyUsed(S);
      const cap = St.armyCapacity(S);
      const head = h('div', { class: 'armyhead' }, h('div', { class: 'grow' }, h('b', null, `Army ${used}/${cap}`), h('div', { class: 'bar' }, h('i', { style: { width: (cap ? Math.min(100, (used / cap) * 100) : 0) + '%' } }))));
      const rows = D.TROOP_ORDER.map((t) => {
        const d = D.TROOPS[t];
        const lvl = S.troopLvl[t];
        const st = D.troopStats(t, lvl);
        const unlocked = St.troopUnlocked(S, t);
        const queued = S.queue.filter((q) => q.troop === t).length + S.buildings.filter((b) => b.slot && b.slot.troop === t).length;
        const have = S.army[t];
        const trainBtn = h('button', { class: 'btn green trainbtn noRefresh', type: 'button', disabled: !unlocked }, h('span', null, '+1 ', chip('crystal', d.cost, S.res.crystal < d.cost)));
        if (unlocked) this.holdRepeat(trainBtn, () => g.train(t));
        return h('div', { class: 'trow wrap' + (unlocked ? '' : ' locked') },
          this.troopIcon(t, 56),
          h('div', { class: 'grow' }, h('div', { class: 'tname' }, d.name, h('span', { class: 'lvl' }, `Lv ${lvl}`)), h('div', { class: 'tstat' }, `${Math.round(st.hp)} HP · ${Math.round(st.dps)} dmg/s · ${d.housing} space${d.flying ? ' · flies' : ''}`)),
          h('div', { class: 'tcount' }, h('b', null, `×${have}`), queued ? h('small', null, `+${queued} training`) : null),
          unlocked ? trainBtn : null,
          h('div', { class: 'tdesc full' }, unlocked ? d.desc : `🔒 Needs Barracks level ${d.unlock}`));
      });
      const slots = S.buildings.filter((b) => b.type === 'barracks' && b.lvl >= 1);
      const now = g.now();
      const q = h('div', { class: 'queue' }, h('h4', null, 'Training'),
        slots.length ? slots.map((b, i) => h('div', { class: 'qrow' }, `Barracks ${i + 1}`, b.slot ? h('span', { class: 'qitem' }, this.troopIcon(b.slot.troop, 30), fmtTime((b.slot.end - now) / 1000)) : h('span', { class: 'muted' }, 'Idle'))) : h('p', { class: 'muted' }, 'Build a Barracks to train troops.'),
        S.queue.length ? h('div', { class: 'qlist' }, S.queue.map((it, i) => h('button', { class: 'qchip', type: 'button', title: 'Cancel', onclick: () => { St.cancelQueued(S, i); g.dirty(); g.sfx.play('tap'); this.forceRefresh(); } }, this.troopIcon(it.troop, 30), h('b', null, '✕')))) : null,
        S.queue.length ? h('p', { class: 'muted small' }, 'Tap a queued troop to cancel and get the crystal back.') : null);
      const forge = St.forgeOf(S) ? this.btn('Open Forge', 'blue', () => this.openForge()) : null;
      return h('div', null, head, rows, q, forge);
    };
    this.liveSheet('army', 'Army', render, 500);
    this.sheet.render = render;
  }

  holdRepeat(el, fn) {
    let timer = 0;
    let rep = 0;
    const stop = () => { clearTimeout(timer); clearInterval(rep); };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
      timer = setTimeout(() => { rep = setInterval(fn, 110); }, 380);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, stop);
    el.addEventListener('click', (e) => e.preventDefault());
  }

  // ---------- forge ----------

  openForge() {
    const g = this.game;
    const render = () => {
      const S = g.S;
      const f = St.forgeOf(S);
      const now = g.now();
      const cur = S.forge
        ? h('div', { class: 'forgecur' }, this.troopIcon(S.forge.troop, 44), h('div', { class: 'grow' }, `${D.TROOPS[S.forge.troop].name} → Lv ${S.forge.to}`, h('div', { class: 'bar' }, h('i', { style: { width: Math.min(100, ((now - S.forge.start) / (S.forge.end - S.forge.start)) * 100) + '%' } })), h('small', null, fmtTime((S.forge.end - now) / 1000))), this.btn(h('span', null, ico('pearls'), ' ', St.speedUpCost(S.forge, now)), 'gold', () => g.speedUpForge()))
        : null;
      const rows = D.TROOP_ORDER.map((t) => {
        const lvl = S.troopLvl[t];
        const chk = St.checkForge(S, t);
        const maxed = lvl >= D.TROOP_MAX;
        const next = lvl + 1;
        const n = D.troopStats(t, next);
        const c = D.troopStats(t, lvl);
        return h('div', { class: 'trow' },
          this.troopIcon(t, 52),
          h('div', { class: 'grow' }, h('div', { class: 'tname' }, D.TROOPS[t].name, h('span', { class: 'lvl' }, `Lv ${lvl}`)), maxed ? h('div', { class: 'tstat' }, 'Max level') : h('div', { class: 'tstat' }, `HP ${Math.round(c.hp)}→${Math.round(n.hp)} · DPS ${Math.round(c.dps)}→${Math.round(n.dps)}`)),
          maxed ? null : this.btn(chk.ok ? h('span', null, chip('crystal', chk.cost), h('small', { class: 'tm' }, fmtTime(D.forgeTime(t, next)))) : h('span', { class: 'small' }, chk.err), chk.ok ? 'green' : 'gray', () => g.startForge(t)));
      });
      return h('div', null, f ? h('p', { class: 'muted' }, `Forge level ${f.lvl}: troops can reach level ${D.troopMaxLevel(f.lvl)}.`) : h('p', { class: 'muted' }, 'Build a Forge from the Shop (Army tab) to upgrade troops.'), cur, rows);
    };
    this.liveSheet('forge', 'Forge', render, 500);
    this.sheet.render = render;
  }

  // ---------- raid picker ----------

  openRaid(tab) {
    const g = this.game;
    this.raidTab = tab || (this.raidTab === 'defend' ? 'rival' : this.raidTab) || 'rival';
    const render = () => {
      const S = g.S;
      const armyN = D.TROOP_ORDER.reduce((n, t) => n + S.army[t], 0);
      const army = h('div', { class: 'armystrip' }, armyN
        ? D.TROOP_ORDER.filter((t) => S.army[t] > 0).map((t) => h('span', { class: 'ac' }, this.troopIcon(t, 34), h('b', null, `×${S.army[t]}`)))
        : h('span', { class: 'muted' }, 'No troops yet. Train some first!'), this.btn('Army', 'blue sm', () => this.openArmy()));
      const tabs = h('div', { class: 'tabs' },
        h('button', { class: 'tab' + (this.raidTab === 'rival' ? ' on' : ''), type: 'button', onclick: () => { this.raidTab = 'rival'; this.sheet.body.replaceChildren(render()); } }, 'Rivals'),
        h('button', { class: 'tab' + (this.raidTab === 'outpost' ? ' on' : ''), type: 'button', onclick: () => { this.raidTab = 'outpost'; this.sheet.body.replaceChildren(render()); } }, 'Outposts'),
        h('button', { class: 'tab' + (this.raidTab === 'defend' ? ' on' : ''), type: 'button', onclick: () => { this.raidTab = 'defend'; this.sheet.body.replaceChildren(render()); } }, 'Defence'));
      let cards;
      if (this.raidTab === 'rival') {
        const kl = St.keepLevel(S);
        cards = [0, 1, 2].map((i) => this.scoutCard(G.rival(kl, S.trophies, g.rivalSeed + i), null, g));
        cards.push(this.btn(h('span', null, 'Search again ', chip('gold', 50, S.res.gold < 50)), 'blue', () => g.searchRivals()));
      } else if (this.raidTab === 'defend') {
        const k = St.keepLevel(S);
        const ta = G.typicalArmy(k);
        cards = [h('div', { class: 'help' },
          h('p', null, 'See how your island holds up. A typical army for your Keep level attacks it, and you watch.'),
          h('div', { class: 'armystrip' }, Object.entries(ta).filter(([, a]) => a.count > 0).map(([t, a]) => h('span', { class: 'ac' }, this.troopIcon(t, 34), h('b', null, `×${a.count}`)))),
          h('p', { class: 'muted small' }, 'Nothing is lost. Use it to find weak spots, then move walls and defences around.'),
          this.btn('Watch a raid on my island', 'green', () => g.watchDefence()))];
      } else {
        cards = [];
        for (let st = 1; st <= G.OUTPOST_COUNT; st++) {
          const locked = st > 1 && !(S.campaign[st - 1] >= 1);
          cards.push(this.scoutCard(G.outpost(st), { stage: st, stars: S.campaign[st] || 0, locked }, g));
        }
      }
      return h('div', null, army, tabs, h('div', { class: 'scouts' }, cards));
    };
    this.openSheet('Raid', render(), { id: 'raid', render, refresh: () => {} });
  }

  scoutCard(base, o, g) {
    const locked = o && o.locked;
    const ds = base.buildings.filter((b) => D.DEFENSES.includes(b.type));
    const diff = base.tier <= 4 ? 'Easy' : base.tier <= 12 ? 'Medium' : base.tier <= 22 ? 'Hard' : 'Brutal';
    return h('div', { class: 'scout' + (locked ? ' locked' : '') },
      o ? h('div', { class: 'stagenum' }, o.stage) : h('div', { class: 'stagenum rv' }, '⚑'),
      h('div', { class: 'grow' },
        h('div', { class: 'sname' }, base.name),
        h('div', { class: 'ssub' }, `${diff} · Keep ${base.keepLvl} · ${ds.length} ${ds.length === 1 ? 'defence' : 'defences'}`),
        h('div', { class: 'sloot' }, chip('gold', base.loot.gold), chip('crystal', base.loot.crystal), o ? h('span', { class: 'stars' }, [1, 2, 3].map((n) => h('i', { class: 'star' + (o.stars >= n ? ' on' : '') }))) : h('span', { class: 'tro' }, `+${base.trophyWin} 🏆`))),
      locked ? h('span', { class: 'lockico' }, '🔒') : this.btn('Attack', 'green', () => g.startBattle(base)));
  }

  // ---------- quests ----------

  openQuests() {
    const g = this.game;
    const render = () => {
      const S = g.S;
      const list = D.QUESTS.slice().sort((a, b) => {
        const sa = St.questState(S, a);
        const sb = St.questState(S, b);
        const ra = sa.claimed ? 2 : sa.done ? 0 : 1;
        const rb = sb.claimed ? 2 : sb.done ? 0 : 1;
        return ra - rb;
      });
      const rows = list.map((q) => {
        const st = St.questState(S, q);
        return h('div', { class: 'qrow2' + (st.claimed ? ' claimed' : '') },
          h('div', { class: 'grow' }, h('div', { class: 'qtext' }, q.text), h('div', { class: 'bar' }, h('i', { style: { width: (st.cur / st.goal) * 100 + '%' } })), h('small', null, `${fmt(st.cur)} / ${fmt(st.goal)}`)),
          st.claimed ? h('span', { class: 'done' }, '✔') : this.btn(h('span', null, ico('pearls'), ' ', q.reward), st.done ? 'gold' : 'gray', () => { if (St.claimQuest(S, q)) { g.sfx.play('done'); g.dirty(); this.forceRefresh(); } }, { disabled: !st.done }));
      });
      const lg = St.league(S);
      return h('div', null, h('div', { class: 'profile' }, h('i', { class: 'shield big', style: { '--league': lg.color } }), h('div', null, h('b', null, `${lg.name} league`), h('div', { class: 'muted' }, `🏆 ${S.trophies} · ${S.stats.wins} wins · ${S.stats.stars} stars`))), h('div', { class: 'qlist2' }, rows));
    };
    this.openSheet('Goals', render(), { id: 'quests', render, refresh: () => {} });
  }

  // ---------- settings ----------

  openSettings() {
    const g = this.game;
    const render = () => h('div', null,
      h('div', { class: 'setrow' }, h('span', null, 'Sound effects'), this.btn(g.S.settings.sound ? 'On' : 'Off', g.S.settings.sound ? 'green sm' : 'gray sm', () => { g.S.settings.sound = !g.S.settings.sound; g.sfx.on = g.S.settings.sound; g.dirty(); this.forceRefresh(); })),
      h('div', { class: 'setrow' }, h('span', null, 'How to play'), this.btn('Show', 'blue sm', () => this.openHelp())),
      h('div', { class: 'setrow' }, h('span', null, 'Install to home screen'), this.btn('How', 'blue sm', () => this.openInstall())),
      h('div', { class: 'setrow' }, h('span', null, 'Saved on this device only'), this.btn('Reset island', 'red sm', () => this.confirm({ title: 'Reset island?', text: 'This deletes your island and starts over. It cannot be undone.', yes: 'Delete everything', cls: 'red', onYes: () => g.resetGame() }))),
      h('p', { class: 'muted small' }, 'Tidehold is an original game. Everything you see and hear is drawn and synthesized in code.'));
    this.openSheet('Settings', render(), { id: 'settings', render, refresh: () => {} });
  }

  openInstall() {
    this.openSheet('Play it like an app', h('div', { class: 'help' },
      h('p', null, h('b', null, 'iPhone: '), 'open this page in Safari, tap Share, then "Add to Home Screen".'),
      h('p', null, h('b', null, 'Android: '), 'open in Chrome, tap the menu (⋮), then "Add to Home screen" or "Install app".'),
      h('p', { class: 'muted' }, 'It then opens full screen and works offline. Your island is saved in the browser on this device.')), { id: 'install' });
  }

  openHelp() {
    this.openSheet('How to play', h('div', { class: 'help' },
      h('p', null, h('b', null, '1. Build. '), 'Mines make gold and crystal while you are away. Tap them to collect, then spend it on upgrades. Builders limit how much you can build at once.'),
      h('p', null, h('b', null, '2. Train. '), 'Barracks train troops (crystal). Camps hold them. The Forge makes them stronger.'),
      h('p', null, h('b', null, '3. Raid. '), 'Pick an island, tap the shore to drop troops (hold to keep dropping). Destroy buildings to get loot. 50% damage, the Keep, and 100% give a star each.'),
      h('p', null, h('b', null, '4. Use the Beacon. '), 'Tap the flag button, then tap a spot. Your troops will prefer targets near it. Aim it at defences first, then loot.'),
      h('p', null, h('b', null, '5. Defend. '), 'Cannons and Mortars hit the ground, Ballistas also hit flyers. Walls slow troops down. Bomb Traps are hidden.'),
      h('p', { class: 'muted' }, 'Troops are used up when you raid. Pearls are earned from goals, clearing rocks and trees, and winning outposts.')), { id: 'help' });
  }

  // ---------- hint (tutorial) ----------

  setHint(text, targetId) {
    if (!text) {
      this.hintEl.classList.add('hidden');
    } else {
      this.hintEl.classList.remove('hidden');
      if (this.hintEl.dataset.text !== text) {
        this.hintEl.dataset.text = text;
        this.hintEl.replaceChildren(h('span', { class: 'hico' }, '🧭'), h('span', null, text), h('button', { class: 'skip', type: 'button', onclick: () => this.game.skipTutorial() }, 'Skip'));
      }
    }
    for (const el of document.querySelectorAll('.pulse')) el.classList.remove('pulse');
    if (text && targetId) {
      const el = document.querySelector(`[data-id="${targetId}"]`);
      if (el) el.classList.add('pulse');
    }
  }

  // ---------- battle HUD ----------

  showBattle(B) {
    const g = this.game;
    this.bt = {};
    const timer = h('div', { class: 'bt-time' }, '3:00');
    const pct = h('div', { class: 'bt-pct' }, '0%');
    const stars = h('div', { class: 'bt-stars' }, [1, 2, 3].map(() => h('i', { class: 'star' })));
    const lootG = h('span', null, '0');
    const lootC = h('span', null, '0');
    const left = h('div', { class: 'bt-loot' }, h('div', null, ico('gold'), lootG), h('div', null, ico('crystal'), lootC));
    this.endBtn = this.btn('Back', 'red sm', () => g.surrender());
    this.speedBtn = this.btn('1×', 'gray sm', () => g.toggleSpeed());
    const top = h('div', { class: 'bt-top' }, left, h('div', { class: 'bt-mid' }, timer, pct, stars), h('div', { class: 'bt-right' }, this.endBtn, this.speedBtn));
    this.troopBar = h('div', { class: 'troopbar' });
    this.beaconBtn = h('button', { class: 'beacon', type: 'button', onclick: () => g.toggleBeacon() }, h('span', { class: 'e' }, '🚩'), h('span', { class: 'l' }, 'Beacon'));
    this.bhint = h('div', { class: 'bt-hint' }, 'Tap the shore to drop troops. Hold to keep dropping.');
    this.battleEl.replaceChildren(top, this.bhint, h('div', { class: 'bt-bottom' }, this.beaconBtn, this.troopBar));
    Object.assign(this.bt, { timer, pct, stars, lootG, lootC });
    this.troopSig = '';
    this.updateBattle(B);
  }

  updateBattle(B) {
    const g = this.game;
    const t = Math.max(0, B.time - B.t);
    this.bt.timer.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    this.bt.timer.classList.toggle('low', t < 20 && B.started);
    this.bt.pct.textContent = `${Math.floor((B.destroyed / B.total) * 100)}%`;
    [...this.bt.stars.children].forEach((s, i) => s.classList.toggle('on', B.stars > i));
    this.bt.lootG.textContent = fmtFull(B.loot.gold);
    this.bt.lootC.textContent = fmtFull(B.loot.crystal);
    this.endBtn.firstChild.textContent = B.started ? 'End' : 'Back';
    this.bhint.classList.toggle('hidden', B.started && !g.showHint);
    const sig = D.TROOP_ORDER.map((t2) => `${t2}${B.reserve[t2] ? B.reserve[t2].count : 0}`).join() + g.deployTroop + (g.beaconMode ? 'b' : '');
    if (sig !== this.troopSig) {
      this.troopSig = sig;
      const btns = D.TROOP_ORDER.filter((t2) => B.reserve[t2]).map((t2) => {
        const n = B.reserve[t2].count;
        return h('button', { class: 'tb' + (g.deployTroop === t2 && !g.beaconMode ? ' on' : '') + (n ? '' : ' empty'), type: 'button', onclick: () => g.selectTroop(t2) }, this.troopIcon(t2, 46), h('b', null, n));
      });
      this.troopBar.replaceChildren(...btns);
      this.beaconBtn.classList.toggle('on', g.beaconMode);
    }
  }

  // ---------- results ----------

  showResults(r, applied, base) {
    const g = this.game;
    const won = r.stars >= 1;
    const body = h('div', { class: 'results' },
      h('div', { class: 'rstars' }, [1, 2, 3].map((n) => h('i', { class: 'star big' + (r.stars >= n ? ' on' : ''), style: { animationDelay: n * 0.25 + 's' } }))),
      h('div', { class: 'rpct' }, `${r.pct}% destroyed`),
      h('div', { class: 'rloot' }, h('div', { class: 'lootrow' }, ico('gold'), h('b', null, `+${fmtFull(applied.gold)}`)), h('div', { class: 'lootrow' }, ico('crystal'), h('b', null, `+${fmtFull(applied.crystal)}`)),
        applied.pearls ? h('div', { class: 'lootrow' }, ico('pearls'), h('b', null, `+${applied.pearls}`)) : null,
        r.trophies ? h('div', { class: 'lootrow' }, '🏆', h('b', null, `+${r.trophies}`)) : (r.trophyLoss && !won ? h('div', { class: 'lootrow neg' }, '🏆', h('b', null, `-${r.trophyLoss}`)) : null)),
      applied.lostToCap > 0 ? h('p', { class: 'muted small' }, 'Some loot was lost because your storage is full. Build or upgrade vaults and tanks.') : null,
      h('div', { class: 'rused' }, 'Troops used: ', Object.entries(r.used).map(([t, n]) => h('span', { class: 'ac' }, this.troopIcon(t, 28), h('b', null, `×${n}`)))),
      h('div', { class: 'row btns' }, this.btn('Home', 'green', () => g.returnHome())));
    this.openSheet(won ? 'Victory!' : 'Defeat', body, { id: 'results', onClose: () => g.returnHome() });
    this.sheet.el.classList.add(won ? 'win' : 'lose');
  }

  showDefenseReport(r, B) {
    const g = this.game;
    const lost = {};
    for (const b of B.b) if (!b.alive && b.counted) lost[b.type] = (lost[b.type] || 0) + 1;
    const held = r.stars === 0;
    const verdict = held ? 'Your island held!' : r.stars === 1 ? 'They broke in, but not far.' : r.stars === 2 ? 'Ouch. They took the Keep.' : 'Total ruin. Time to rebuild stronger.';
    const tips = [];
    if (r.pct > 40) tips.push('Put walls around the Keep and storages so troops have to chew through them.');
    if (!B.b.some((b) => b.type === 'ballista')) tips.push('A Ballista is the only defence that stops flyers.');
    if (!B.b.some((b) => b.type === 'mortar') && St.keepLevel(g.S) >= 3) tips.push('Mortars punish big crowds.');
    if (!B.b.some((b) => b.type === 'bomb') && St.keepLevel(g.S) >= 2) tips.push('Hide Bomb Traps where troops walk in.');
    tips.push('Spread defences so one beacon cannot take them all.');
    const body = h('div', { class: 'results' },
      h('div', { class: 'rstars' }, [1, 2, 3].map((n) => h('i', { class: 'star big' + (r.stars >= n ? ' on' : ''), style: { animationDelay: n * 0.25 + 's' } }))),
      h('div', { class: 'rpct' }, `${r.pct}% of your island destroyed`),
      h('p', null, h('b', null, verdict)),
      Object.keys(lost).length ? h('p', { class: 'muted' }, 'Lost: ', Object.entries(lost).map(([t, n]) => `${n} ${D.BUILDINGS[t].name}`).join(', ')) : null,
      h('ul', { class: 'tips' }, tips.slice(0, 3).map((t) => h('li', null, t))),
      h('div', { class: 'row btns' }, this.btn('Back home', 'green', () => g.returnHome())));
    this.openSheet('Defence report', body, { id: 'defence', onClose: () => g.returnHome() });
  }

  showAway(lines) {
    if (!lines.length) return;
    this.openSheet('Welcome back!', h('div', { class: 'help' }, lines.map((l) => h('p', null, l))), { id: 'away' });
  }
}
