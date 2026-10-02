// In-race HUD. DOM-based and responsive. Only touches the DOM when a value changes.

import { ITEM_ICONS, EMPTY_ITEM } from './icons.js';
import { ITEMS } from '../game/items.js';
import { DRIFT_LEVELS } from '../game/kart.js';
import { settings, prettyKey } from '../game/settings.js';
import { formatTime, ordinal } from '../util/math.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-top-left">
        <div class="item-slot" id="hud-item"><div class="item-icon"></div><div class="item-count"></div></div>
      </div>
      <div class="hud-top-center">
        <div class="hud-lap">LAP <b id="hud-lap-n">1</b><span>/</span><span id="hud-lap-max">3</span></div>
        <div class="hud-time" id="hud-time">0:00.000</div>
      </div>
      <div class="hud-top-right"><canvas id="hud-map" width="256" height="256"></canvas></div>
      <div class="hud-pos" id="hud-pos"><b>1</b><sup>st</sup><span>/ 6</span></div>
      <div class="hud-board" id="hud-board"></div>
      <div class="hud-speed" id="hud-speed"><b>0</b><span>km/h</span><div class="speed-bar"><i></i></div></div>
      <div class="hud-drift" id="hud-drift"><i></i></div>
      <div class="hud-msg" id="hud-msg"></div>
      <div class="hud-sub" id="hud-sub"></div>
      <div class="hud-flash" id="hud-flash"></div>
      <div class="speed-lines" id="speed-lines"></div>
      <div class="hud-wrong" id="hud-wrong">WRONG WAY</div>
      <div class="hud-hint" id="hud-hint"></div>
    `;
    const q = (s) => root.querySelector(s);
    this.el = {
      item: q('#hud-item'), itemIcon: q('#hud-item .item-icon'), itemCount: q('#hud-item .item-count'),
      lapN: q('#hud-lap-n'), lapMax: q('#hud-lap-max'), time: q('#hud-time'),
      map: q('#hud-map'), pos: q('#hud-pos'), board: q('#hud-board'),
      speed: q('#hud-speed b'), speedBar: q('#hud-speed .speed-bar i'), speedBox: q('#hud-speed'), unit: q('#hud-speed span'),
      drift: q('#hud-drift'), driftBar: q('#hud-drift i'),
      msg: q('#hud-msg'), sub: q('#hud-sub'), flash: q('#hud-flash'), lines: q('#speed-lines'), wrong: q('#hud-wrong'), hint: q('#hud-hint'),
    };
    this.ctx = this.el.map.getContext('2d');
    this.race = null;
    this.last = {};
    this.msgTimer = 0;
    this.subTimer = 0;
    this.roll = { t: 0, idx: 0 };
    this.off = null;
  }

  attach(race) {
    this.race = race;
    this.last = {};
    this.el.lapMax.textContent = race.laps;
    this.msgTimer = 0;
    this.el.msg.className = 'hud-msg';
    this.el.msg.textContent = '';
    this.el.sub.textContent = '';
    this._buildMap();
    this._buildBoard();
    this.off?.();
    this.off = race.on((type, kart, data) => this._onEvent(type, kart, data));
  }

  detach() {
    this.off?.();
    this.race = null;
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  _buildBoard() {
    const r = this.race;
    this.el.board.innerHTML = r.karts
      .map((k) => `<div class="row" data-i="${k.index}"><span class="p"></span><i style="background:${hex(k.char.colors.body)}"></i><span class="n">${k.name}</span></div>`)
      .join('');
    this.rows = [...this.el.board.children];
    this.boardOrder = '';
  }

  _buildMap() {
    const t = this.race.track;
    const S = 256;
    const pad = 22;
    const b = t.bounds;
    const w = b.maxX - b.minX;
    const h = b.maxZ - b.minZ;
    this.mapScale = (S - pad * 2) / Math.max(w, h);
    this.mapCx = (b.minX + b.maxX) / 2;
    this.mapCz = (b.minZ + b.maxZ) / 2;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const path = () => {
      ctx.beginPath();
      for (let i = 0; i <= t.N; i++) {
        const k = i % t.N;
        const [x, y] = this._mp(t.x[k], t.z[k]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = Math.max(9, t.def.width * this.mapScale + 7);
    path();
    ctx.stroke();
    ctx.strokeStyle = '#d8dce8';
    ctx.lineWidth = Math.max(5, t.def.width * this.mapScale + 1);
    path();
    ctx.stroke();
    // shortcut ribbons
    ctx.strokeStyle = '#c9a36a';
    ctx.lineWidth = 3;
    for (const sc of t.shortcuts) {
      ctx.beginPath();
      sc.pts.forEach((p, i) => {
        const [x, y] = this._mp(p[0], p[1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    // start line
    const [sx, sy] = this._mp(t.x[0], t.z[0]);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, 7);
    ctx.fill();
    ctx.stroke();
    this.mapBase = c;
  }

  _mp(x, z) {
    return [(x - this.mapCx) * this.mapScale + 128, (z - this.mapCz) * this.mapScale + 128];
  }

  _set(key, value, fn) {
    if (this.last[key] !== value) {
      this.last[key] = value;
      fn(value);
    }
  }

  message(text, { sub = '', cls = '', time = 1.6 } = {}) {
    const m = this.el.msg;
    m.className = 'hud-msg show ' + cls;
    m.textContent = text;
    // restart the CSS animation
    void m.offsetWidth;
    m.style.animation = 'none';
    void m.offsetWidth;
    m.style.animation = '';
    this.msgTimer = time;
    if (sub) {
      this.el.sub.textContent = sub;
      this.el.sub.classList.add('show');
      this.subTimer = time;
    }
  }

  _onEvent(type, kart, data) {
    const r = this.race;
    if (!r) return;
    const isP = kart === r.player;
    switch (type) {
      case 'countdown':
        this.message(String(data.n), { cls: 'count', time: 0.95 });
        break;
      case 'go':
        this.message('GO!', { cls: 'go', time: 1.0 });
        break;
      case 'rocketStart':
        this.message('ROCKET START!', { cls: 'sub-msg', time: 1.4 });
        break;
      case 'lap':
        if (isP) this.message(`LAP ${data.lap}`, { cls: 'lap', sub: formatTime(data.lapTime), time: 1.8 });
        break;
      case 'finalLap':
        if (isP) this.message('FINAL LAP!', { cls: 'final', time: 2.2 });
        break;
      case 'finish':
        if (isP) this.message(`${data.place}${ordinal(data.place)}!`, { cls: 'finish', sub: formatTime(data.time), time: 4 });
        break;
      case 'hit':
        if (isP) this._flash('#ff3b30');
        break;
      case 'shieldBreak':
        if (isP) this._flash('#4ad8ff');
        break;
      case 'itemGet':
        if (isP) this.roll = { t: 0, idx: 0 };
        break;
      default:
        break;
    }
  }

  _flash(color) {
    const f = this.el.flash;
    f.style.background = `radial-gradient(ellipse at center, transparent 35%, ${color}88 100%)`;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  update(dt) {
    const r = this.race;
    if (!r) return;
    const p = r.player;
    const e = this.el;

    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) e.msg.classList.remove('show');
    }
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) e.sub.classList.remove('show');
    }

    // timers, laps, position
    const lap = Math.min(r.laps, Math.max(1, p.lap + 1));
    this._set('lap', lap, (v) => (e.lapN.textContent = v));
    this._set('time', Math.floor(r.time * 1000), () => (e.time.textContent = formatTime(r.time)));
    this._set('place', p.place, (v) => {
      e.pos.innerHTML = `<b>${v}</b><sup>${ordinal(v)}</sup><span>/ ${r.karts.length}</span>`;
      e.pos.dataset.place = v;
    });

    // speed
    const unitMul = settings.speedUnit === 'mph' ? 2.237 : 3.6;
    const kmh = Math.round(Math.abs(p.speed) * unitMul * 1.05);
    this._set('kmh', kmh, (v) => (e.speed.textContent = v));
    this._set('unit', settings.speedUnit, (v) => (e.unit.textContent = v === 'mph' ? 'mph' : 'km/h'));
    e.speedBar.style.transform = `scaleX(${Math.min(1.2, p.speedNorm).toFixed(3)})`;
    e.speedBox.classList.toggle('boost', p.boostTimer > 0 || p.comet > 0);

    // drift charge
    if (p.drifting) {
      e.drift.classList.add('on');
      const lvl = p.driftLevel;
      const colors = ['#9fb4cc', '#4aa8ff', '#ffa21f', '#d24dff'];
      e.driftBar.style.background = colors[lvl];
      const T = DRIFT_LEVELS.map((d) => d.t);
      const next = [T[0], T[1], T[2], T[2]][lvl];
      const prev = [0, T[0], T[1], T[2]][lvl];
      const f = lvl >= 3 ? 1 : (p.driftTime - prev) / (next - prev);
      e.driftBar.style.transform = `scaleX(${Math.max(0.05, f).toFixed(3)})`;
    } else {
      e.drift.classList.remove('on');
    }

    // boost screen effect
    const boosting = p.boostTimer > 0 || p.comet > 0;
    e.lines.classList.toggle('on', boosting);

    // wrong way
    e.wrong.classList.toggle('on', p.wrongWayT > 1.1 && r.state === 'racing');

    // after finishing: tell the player they can skip the wait
    const waiting = r.state === 'finished';
    if (waiting !== this.last.waiting) {
      this.last.waiting = waiting;
      e.hint.classList.toggle('on', waiting);
      if (waiting) {
        const key = (settings.bindings.item || []).find(Boolean) || 'Enter';
        e.hint.innerHTML = `Waiting for the others… press <kbd>${prettyKey(key)}</kbd> for results`;
      }
    }

    // item slot
    this._item(dt, p);

    // standings
    const order = r.order.map((k) => k.index).join(',');
    if (order !== this.boardOrder) {
      this.boardOrder = order;
      r.order.forEach((k, i) => {
        const row = this.rows[i];
        row.dataset.i = k.index;
        row.querySelector('.p').textContent = i + 1;
        row.querySelector('i').style.background = hex(k.char.colors.body);
        row.querySelector('.n').textContent = k.name;
        row.classList.toggle('me', k === p);
      });
    }

    this._drawMap();
  }

  _item(dt, p) {
    const e = this.el;
    const it = p.item;
    if (!it) {
      this._set('itemKey', 'none', () => {
        e.itemIcon.innerHTML = EMPTY_ITEM;
        e.itemCount.textContent = '';
        e.item.classList.remove('has', 'rolling');
      });
      return;
    }
    if (!it.ready) {
      this.roll.t += dt;
      if (this.roll.t > 0.07) {
        this.roll.t = 0;
        const ids = Object.keys(ITEM_ICONS);
        this.roll.idx = (this.roll.idx + 1) % ids.length;
        this.onTick?.();
        e.itemIcon.innerHTML = ITEM_ICONS[ids[this.roll.idx]];
        this.last.itemKey = 'roll';
      }
      e.item.classList.add('has', 'rolling');
      e.itemCount.textContent = '';
      return;
    }
    const key = it.id + it.count;
    this._set('itemKey', key, () => {
      e.itemIcon.innerHTML = ITEM_ICONS[it.id];
      e.itemCount.textContent = it.count > 1 ? '×' + it.count : '';
      e.item.classList.remove('rolling');
      e.item.classList.add('has');
      e.item.style.setProperty('--glow', ITEMS[it.id].color);
      e.item.classList.remove('pop');
      void e.item.offsetWidth;
      e.item.classList.add('pop');
    });
  }

  _drawMap() {
    const r = this.race;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 256, 256);
    ctx.drawImage(this.mapBase, 0, 0);
    // other karts first, player last
    const drawKart = (k, size, outline) => {
      const [x, y] = this._mp(k.x, k.z);
      ctx.fillStyle = hex(k.char.colors.body);
      ctx.strokeStyle = outline;
      ctx.lineWidth = k === r.player ? 3 : 2;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 7);
      ctx.fill();
      ctx.stroke();
    };
    for (const k of r.karts) if (k !== r.player) drawKart(k, 6, '#0b0e1a');
    const p = r.player;
    const [px, py] = this._mp(p.x, p.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-p.h + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#0b0e1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
