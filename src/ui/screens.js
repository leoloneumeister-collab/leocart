// Every menu screen, built as plain DOM. Screens are stateless: the Game passes data in and
// callbacks out. Anything focusable carries data-focus so keyboard and gamepad navigation work.

import { CHARACTERS } from '../game/characters.js';
import { TRACKS } from '../game/tracks/index.js';
import { buildTrackData } from '../game/trackMath.js';
import { ITEMS } from '../game/items.js';
import { ITEM_ICONS, ICONS } from './icons.js';
import { settings, saveSettings, resetBindings, ACTION_LABELS, prettyKey } from '../game/settings.js';
import { formatTime, ordinal } from '../util/math.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const STAT_LABELS = [['speed', 'Top speed'], ['accel', 'Acceleration'], ['handling', 'Handling'], ['weight', 'Weight']];

function create(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function statBars(stats) {
  return STAT_LABELS.map(
    ([k, label]) => `<div class="stat"><span class="stat-name">${label}</span><span class="pips">${[1, 2, 3, 4, 5]
      .map((i) => `<i class="${i <= stats[k] ? 'on' : ''}"></i>`)
      .join('')}</span><span class="stat-num">${stats[k]}</span></div>`,
  ).join('');
}

/** Draws a track outline into a canvas for the track-select cards. */
function drawTrackPreview(canvas, track, color) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const pad = 26;
  const b = track.bounds;
  const sc = (S - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const ox = S / 2 - ((b.minX + b.maxX) / 2) * sc;
  const oz = S / 2 - ((b.minZ + b.maxZ) / 2) * sc;
  ctx.clearRect(0, 0, S, S);
  ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath();
    for (let i = 0; i <= track.N; i++) {
      const k = i % track.N;
      const x = track.x[k] * sc + ox;
      const y = track.z[k] * sc + oz;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  };
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(8, track.def.width * sc + 6);
  path();
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(5, track.def.width * sc);
  path();
  ctx.stroke();
  ctx.strokeStyle = '#c9a36a';
  ctx.lineWidth = 3;
  for (const s of track.shortcuts) {
    ctx.beginPath();
    s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * sc + ox, p[1] * sc + oz) : ctx.moveTo(p[0] * sc + ox, p[1] * sc + oz)));
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(track.x[0] * sc + ox, track.z[0] * sc + oz, 6, 0, 7);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.stroke();
}

const TRACK_DATA = {};
function trackData(def) {
  return (TRACK_DATA[def.id] ||= buildTrackData(def));
}

export class UI {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { audio, input, nav }
    this.current = null;
    this.modalEl = null;
  }

  sound(name) {
    this.ctx.audio.sfx(name);
  }

  _mount(el, { modal = false } = {}) {
    if (modal) {
      this.closeModal();
      this.modalEl = el;
      this.root.appendChild(el);
    } else {
      this.clear();
      this.current = el;
      this.root.appendChild(el);
    }
    requestAnimationFrame(() => this.ctx.nav.focusFirst());
    return el;
  }

  clear() {
    this.closeModal();
    if (this.current) {
      const old = this.current;
      old.classList.add('leaving');
      setTimeout(() => old.remove(), 160);
      this.current = null;
    }
  }

  closeModal() {
    this.modalEl?.remove();
    this.modalEl = null;
  }

  _wire(el, handlers) {
    el.querySelectorAll('[data-focus]').forEach((b) => {
      b.addEventListener('mouseenter', () => this.sound('hover'));
    });
    for (const [sel, fn] of Object.entries(handlers)) {
      el.querySelectorAll(sel).forEach((n) =>
        n.addEventListener('click', (e) => {
          this.sound(n.hasAttribute('data-back') ? 'back' : 'click');
          fn(e, n);
        }),
      );
    }
  }

  // ------------------------------------------------------------------ title

  title({ onCup, onSingle, onHow, onSettings }) {
    const el = create(`
      <div class="screen title">
        <div class="logo"><span>LEO</span><b>CART</b><small>3D kart racing, right in your browser</small></div>
        <div class="menu-list">
          <button class="btn big" data-focus data-default data-a="cup"><span>Grand Prix</span><small>3-race cup · 6 racers</small></button>
          <button class="btn big" data-focus data-a="single"><span>Single Race</span><small>Pick any track</small></button>
          <div class="row2">
            <button class="btn" data-focus data-a="how">How to Play</button>
            <button class="btn" data-focus data-a="settings">Settings</button>
          </div>
        </div>
        <div class="footer">Arrow keys / WASD + Enter to navigate · Gamepad supported · Everything you see and hear is generated in code</div>
      </div>`);
    this._wire(el, {
      '[data-a=cup]': onCup, '[data-a=single]': onSingle, '[data-a=how]': onHow, '[data-a=settings]': onSettings,
    });
    return this._mount(el);
  }

  // ------------------------------------------------------------------ character select

  select({ mode, selected, onPreview, onPick, onBack }) {
    const cards = CHARACTERS.map(
      (c, i) => `
      <button class="card char" data-focus data-i="${i}" ${i === selected ? 'data-default' : ''} style="--c:${hex(c.colors.body)};--k:${hex(c.colors.kart)}">
        <span class="badge"><i></i></span>
        <span class="cname">${c.name}</span>
        <span class="cspecies">${c.species}</span>
        <span class="mini">${['speed', 'accel', 'handling', 'weight'].map((k) => `<em style="--v:${c.stats[k] / 5}"></em>`).join('')}</span>
      </button>`,
    ).join('');
    const el = create(`
      <div class="screen select">
        <div class="panel left">
          <h2>${mode === 'cup' ? 'Grand Prix' : 'Single Race'}<small>Choose your racer</small></h2>
          <div class="grid">${cards}</div>
          <button class="btn ghost" data-focus data-back>Back</button>
        </div>
        <div class="panel info" id="info"></div>
        <div class="hint">Heavier racers push others around. Light racers recover from hits faster.</div>
      </div>`);
    const info = el.querySelector('#info');
    const show = (i) => {
      const c = CHARACTERS[i];
      info.style.setProperty('--c', hex(c.colors.body));
      info.innerHTML = `
        <div class="who"><b>${c.name}</b><span>${c.species}</span></div>
        <p>${c.blurb}</p>
        <div class="stats">${statBars(c.stats)}</div>
        <button class="btn big go" data-focus data-go>Race as ${c.name}</button>`;
      info.querySelector('[data-go]').addEventListener('click', () => {
        this.sound('click');
        onPick(c.id);
      });
      info.querySelector('[data-go]').addEventListener('mouseenter', () => this.sound('hover'));
      el.querySelectorAll('.card').forEach((n, k) => n.classList.toggle('sel', k === i));
      onPreview(i);
    };
    el.querySelectorAll('.card').forEach((n) => {
      const i = Number(n.dataset.i);
      n.addEventListener('focus', () => show(i));
      n.addEventListener('click', () => {
        this.sound('click');
        onPick(CHARACTERS[i].id);
      });
    });
    this._wire(el, { '[data-back]': onBack });
    this._mount(el);
    show(selected);
    return el;
  }

  // ------------------------------------------------------------------ track select

  tracks({ onPick, onBack }) {
    const cards = TRACKS.map((def, i) => {
      const rec = settings.records[def.id];
      const t = trackData(def);
      return `
      <button class="card track" data-focus ${i === 0 ? 'data-default' : ''} data-id="${def.id}">
        <div class="tprev t-${def.id}"><canvas width="240" height="240"></canvas></div>
        <div class="tname">${def.name}</div>
        <div class="tsub">${def.subtitle}</div>
        <div class="tmeta">
          <span>${'★'.repeat(def.difficulty)}${'☆'.repeat(3 - def.difficulty)}</span>
          <span>${(t.length / 1000).toFixed(2)} km</span>
          <span>${def.laps} laps</span>
        </div>
        <div class="trec">${rec?.race ? `Best race ${formatTime(rec.race)} · lap ${formatTime(rec.lap)}` : 'No record yet'}</div>
      </button>`;
    }).join('');
    const el = create(`
      <div class="screen tracks">
        <h2>Select a track<small>Three laps. Checkpoints keep everyone honest.</small></h2>
        <div class="track-row">${cards}</div>
        <button class="btn ghost" data-focus data-back>Back</button>
      </div>`);
    el.querySelectorAll('.card.track').forEach((n) => {
      const def = TRACKS.find((t) => t.id === n.dataset.id);
      drawTrackPreview(n.querySelector('canvas'), trackData(def), def.id === 'neon' ? '#3a3f5c' : def.id === 'dunes' ? '#a98557' : '#6a7080');
      n.addEventListener('click', () => {
        this.sound('click');
        onPick(def.id);
      });
    });
    this._wire(el, { '[data-back]': onBack });
    return this._mount(el);
  }

  // ------------------------------------------------------------------ how to play

  howto({ onBack }) {
    const b = settings.bindings;
    const k = (a) => b[a].filter(Boolean).map((c) => `<kbd>${prettyKey(c)}</kbd>`).join(' ');
    const items = Object.values(ITEMS)
      .map((it) => `<div class="item-row"><span class="ico">${ITEM_ICONS[it.id]}</span><div><b>${it.name}</b><p>${it.desc}</p></div></div>`)
      .join('');
    const el = create(`
      <div class="screen howto">
        <div class="panel wide">
          <h2>How to play</h2>
          <div class="cols">
            <div>
              <h3>Controls</h3>
              <table class="keys">
                <tr><td>Accelerate</td><td>${k('accelerate')}</td></tr>
                <tr><td>Brake / reverse</td><td>${k('brake')}</td></tr>
                <tr><td>Steer</td><td>${k('left')} ${k('right')}</td></tr>
                <tr><td>Drift</td><td>${k('drift')}</td></tr>
                <tr><td>Use item</td><td>${k('item')} <small>hold brake to throw backward</small></td></tr>
                <tr><td>Look back</td><td>${k('lookBack')}</td></tr>
                <tr><td>Reset to track</td><td>${k('reset')}</td></tr>
                <tr><td>Pause</td><td>${k('pause')}</td></tr>
              </table>
              <p class="small">Gamepad: left stick steers · A accelerate · B brake · RB drift · X item · Y look back · Start pause.</p>
              <h3>Tips</h3>
              <ul class="tips">
                <li><b>Drift</b> by tapping drift while steering. Hold it through a corner and the sparks turn <span class="c1">blue</span>, <span class="c2">orange</span>, then <span class="c3">purple</span>. Release for a mini-turbo.</li>
                <li><b>Rocket start:</b> press accelerate just as the lights go to 1 to launch with a boost.</li>
                <li>Grass slows you down. Boost pads and boosts help you keep your speed.</li>
                <li>On Dune Canyon, the dirt cut-throughs across the hairpins are shortcuts. Watch for the boulders.</li>
              </ul>
            </div>
            <div>
              <h3>Items</h3>
              <div class="items">${items}</div>
            </div>
          </div>
          <button class="btn ghost" data-focus data-default data-back>Back</button>
        </div>
      </div>`);
    this._wire(el, { '[data-back]': onBack });
    return this._mount(el);
  }

  // ------------------------------------------------------------------ pause

  pause({ onResume, onRestart, onSettings, onQuit }) {
    const el = create(`
      <div class="modal pause">
        <div class="panel narrow">
          <h2>Paused</h2>
          <button class="btn big" data-focus data-default data-a="resume">Resume</button>
          <button class="btn" data-focus data-a="restart">Restart race</button>
          <button class="btn" data-focus data-a="settings">Settings</button>
          <button class="btn danger" data-focus data-a="quit">Quit to menu</button>
        </div>
      </div>`);
    this._wire(el, { '[data-a=resume]': onResume, '[data-a=restart]': onRestart, '[data-a=settings]': onSettings, '[data-a=quit]': onQuit });
    // Esc/P resume handled by the game; mark the resume button as the "back" action for gamepad B
    el.querySelector('[data-a=resume]').setAttribute('data-back', '');
    return this._mount(el, { modal: true });
  }

  // ------------------------------------------------------------------ settings

  settings({ onBack, modal = false, onChange }) {
    const input = this.ctx.input;
    const slider = (key, label) =>
      `<label class="setting"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${settings[key]}" data-focus data-key="${key}"><em>${Math.round(settings[key] * 100)}%</em></label>`;
    const cycle = (key, label, opts) =>
      `<div class="setting"><span>${label}</span><button class="btn small" data-focus data-cycle="${key}">${opts.find((o) => o[0] === settings[key])?.[1] ?? settings[key]}</button></div>`;
    const bindRows = Object.keys(ACTION_LABELS)
      .map(
        (a) => `<div class="bind"><span>${ACTION_LABELS[a]}</span>
          ${[0, 1].map((s) => `<button class="key" data-focus data-bind="${a}" data-slot="${s}">${prettyKey(settings.bindings[a][s])}</button>`).join('')}</div>`,
      )
      .join('');
    const el = create(`
      <div class="${modal ? 'modal' : 'screen'} settings">
        <div class="panel wide">
          <h2>Settings</h2>
          <div class="cols">
            <div>
              <h3>Audio</h3>
              ${slider('master', 'Master volume')}
              ${slider('music', 'Music')}
              ${slider('sfx', 'Sound effects')}
              <h3>Gameplay</h3>
              ${cycle('difficulty', 'AI difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])}
              ${cycle('shake', 'Camera shake', [[true, 'On'], [false, 'Off']])}
              ${cycle('speedUnit', 'Speed unit', [['kmh', 'km/h'], ['mph', 'mph']])}
              <h3>Graphics</h3>
              ${cycle('quality', 'Quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
              <p class="small">Low turns shadows off and renders at 1x. Medium and High raise shadow detail and resolution.</p>
            </div>
            <div>
              <h3>Keyboard controls</h3>
              <div class="binds">${bindRows}</div>
              <button class="btn small ghost" data-focus data-reset>Reset controls</button>
              <p class="small">Click a key, then press the new one. Esc cancels.</p>
            </div>
          </div>
          <button class="btn ghost" data-focus data-default data-back>Back</button>
        </div>
      </div>`);

    el.querySelectorAll('input[type=range]').forEach((r) => {
      r.addEventListener('input', () => {
        settings[r.dataset.key] = Number(r.value);
        r.parentElement.querySelector('em').textContent = Math.round(r.value * 100) + '%';
        saveSettings();
        onChange?.(r.dataset.key);
      });
      r.addEventListener('change', () => this.sound('click'));
    });

    const cycles = {
      difficulty: ['easy', 'normal', 'hard'], shake: [true, false], speedUnit: ['kmh', 'mph'], quality: ['low', 'medium', 'high'],
    };
    const labels = { easy: 'Easy', normal: 'Normal', hard: 'Hard', true: 'On', false: 'Off', kmh: 'km/h', mph: 'mph', low: 'Low', medium: 'Medium', high: 'High' };
    el.querySelectorAll('[data-cycle]').forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.cycle;
        const list = cycles[key];
        const idx = list.indexOf(settings[key]);
        settings[key] = list[(idx + 1) % list.length];
        b.textContent = labels[String(settings[key])];
        saveSettings();
        this.sound('click');
        onChange?.(key);
      });
    });

    el.querySelectorAll('[data-bind]').forEach((b) => {
      b.addEventListener('click', () => {
        const action = b.dataset.bind;
        const slot = Number(b.dataset.slot);
        const prev = b.textContent;
        b.textContent = 'press a key…';
        b.classList.add('listening');
        this.ctx.nav.blocked = true;
        input.rebinding = true;
        const finish = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.removeEventListener('keydown', finish, true);
          input.rebinding = false;
          setTimeout(() => (this.ctx.nav.blocked = false), 0);
          b.classList.remove('listening');
          if (e.code === 'Escape') {
            b.textContent = prev;
            return;
          }
          // a key can only do one job: take it away from whatever else had it
          for (const a of Object.keys(settings.bindings)) {
            settings.bindings[a] = settings.bindings[a].map((c, i) => (c === e.code && !(a === action && i === slot) ? '' : c));
          }
          settings.bindings[action][slot] = e.code;
          saveSettings();
          el.querySelectorAll('[data-bind]').forEach((x) => (x.textContent = prettyKey(settings.bindings[x.dataset.bind][Number(x.dataset.slot)])));
          this.sound('click');
        };
        window.addEventListener('keydown', finish, true);
      });
    });
    el.querySelector('[data-reset]').addEventListener('click', () => {
      resetBindings();
      el.querySelectorAll('[data-bind]').forEach((x) => (x.textContent = prettyKey(settings.bindings[x.dataset.bind][Number(x.dataset.slot)])));
      this.sound('click');
    });
    this._wire(el, { '[data-back]': onBack });
    return this._mount(el, { modal });
  }

  // ------------------------------------------------------------------ results

  results({ results, trackName, cup, records, onNext, onRetry, onMenu, onTrackSelect }) {
    const rows = results
      .map((r) => {
        const pts = cup ? `<td class="pts">+${r.points}</td><td class="tot">${r.total}</td>` : '';
        return `<tr class="${r.isPlayer ? 'me' : ''}">
          <td class="pos">${r.place}</td>
          <td class="who"><i style="background:${hex(r.char.colors.body)}"></i>${r.char.name}${r.isPlayer ? ' <em>YOU</em>' : ''}</td>
          <td>${r.finished ? formatTime(r.time) : 'DNF'}</td>
          <td>${isFinite(r.bestLap) ? formatTime(r.bestLap) : '--'}</td>${pts}</tr>`;
      })
      .join('');
    const player = results.find((r) => r.isPlayer);
    const badge = [records?.newRace ? '<span class="badge-new">New best race!</span>' : '', records?.newLap ? '<span class="badge-new">New best lap!</span>' : ''].join('');
    const nextLabel = cup ? (cup.last ? 'Final standings' : `Next race: ${cup.nextName}`) : 'Race again';
    const el = create(`
      <div class="screen results">
        <div class="panel wide">
          <h2>${player.place === 1 ? 'Victory!' : `You finished ${player.place}${ordinal(player.place)}`}<small>${trackName}${cup ? ` · Race ${cup.index + 1} of ${cup.total}` : ''}</small></h2>
          ${badge ? `<div class="badges">${badge}</div>` : ''}
          <table class="rtable">
            <thead><tr><th>#</th><th>Racer</th><th>Time</th><th>Best lap</th>${cup ? '<th>Points</th><th>Total</th>' : ''}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="actions">
            <button class="btn big" data-focus data-default data-a="next">${nextLabel}</button>
            ${cup ? '' : '<button class="btn" data-focus data-a="tracks">Change track</button>'}
            ${cup ? '' : '<button class="btn" data-focus data-a="retry">Restart</button>'}
            <button class="btn ghost" data-focus data-a="menu" data-back>Main menu</button>
          </div>
        </div>
      </div>`);
    this._wire(el, { '[data-a=next]': onNext, '[data-a=tracks]': onTrackSelect || (() => {}), '[data-a=retry]': onRetry || (() => {}), '[data-a=menu]': onMenu });
    return this._mount(el);
  }

  // ------------------------------------------------------------------ cup final

  cupFinal({ standings, playerId, onAgain, onMenu }) {
    const mine = standings.findIndex((s) => s.char.id === playerId);
    const place = mine + 1;
    const headline = place === 1 ? 'Champion!' : place === 2 ? 'Runner-up' : place === 3 ? 'Bronze cup' : 'Good effort';
    const sub = place === 1 ? 'You won the Grand Prix.' : place <= 3 ? 'On the podium. One more run for gold?' : 'Try a different racer or crank the difficulty down.';
    const rows = standings
      .map(
        (s, i) => `<tr class="${s.char.id === playerId ? 'me' : ''}"><td class="pos">${i + 1}</td>
        <td class="who"><i style="background:${hex(s.char.colors.body)}"></i>${s.char.name}${s.char.id === playerId ? ' <em>YOU</em>' : ''}</td>
        <td>${s.points} pts</td></tr>`,
      )
      .join('');
    const el = create(`
      <div class="screen final">
        <div class="panel side">
          <div class="trophy ${place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : 'none'}">${ICONS.trophy}</div>
          <h2>${headline}<small>${sub}</small></h2>
          <table class="rtable compact"><tbody>${rows}</tbody></table>
          <div class="actions">
            <button class="btn big" data-focus data-default data-a="again">Play again</button>
            <button class="btn ghost" data-focus data-a="menu" data-back>Main menu</button>
          </div>
        </div>
      </div>`);
    this._wire(el, { '[data-a=again]': onAgain, '[data-a=menu]': onMenu });
    return this._mount(el);
  }

  loading(text = 'Loading…') {
    const el = create(`<div class="screen loading"><div class="spinner"></div><div>${text}</div></div>`);
    return this._mount(el);
  }

  toast(text, ms = 1800) {
    const t = create(`<div class="toast">${text}</div>`);
    this.root.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }
}
