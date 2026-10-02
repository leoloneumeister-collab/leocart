import type { Sim } from '../sim/sim.ts';
import type { Actor } from '../sim/actor.ts';
import { WEAPONS, cycleTime } from '../sim/weapons.ts';
import { shopFor, priceFor, type ShopEntry } from '../sim/economy.ts';
import { TEAM_NAMES, BOT_LEVELS } from '../sim/constants.ts';
import { ACTION_LABELS, DEFAULT_KEYS, keyName, defaultSettings, type KeyAction, type Settings } from '../game/settings.ts';
import { TEAM_CSS } from '../render/characters.ts';
import { audio } from '../game/audio.ts';
import { el } from './hud.ts';

type Cb = () => void;

// ======================================================================= buy menu

export class BuyMenu {
  root = el('div', 'overlay hidden');
  private panel = el('div', 'panel');
  private info = el('div', 'info');
  private money = el('div', 'money');
  private cols = el('div', 'cols');
  private sim: Sim | null = null;
  private human: Actor | null = null;
  private lastLoadout: string[] = [];
  private bought: string[] = [];
  onBuy: ((item: string) => boolean) | null = null;
  visible = false;

  constructor(parent: HTMLElement) {
    this.root.id = 'buy';
    const head = el('div', 'head');
    head.append(el('h2', '', 'Buy menu'), this.money);
    head.querySelector('h2')!.setAttribute('style', 'margin:0');
    const foot = el('div', 'foot');
    const rebuy = el('button', '', 'Rebuy last loadout'); rebuy.onclick = () => this.rebuy();
    const auto = el('button', '', 'Buy for me'); auto.onclick = () => this.auto();
    const close = el('button', '', 'Close (B)'); close.onclick = () => this.hide();
    const hint = el('span', '', 'Quick buy: press a category number, then an item number');
    hint.setAttribute('style', 'color:#9aa6b2;font-size:12px;align-self:center;margin-left:8px');
    foot.append(rebuy, auto, close, hint);
    this.panel.append(head, this.cols, foot);
    this.root.append(this.panel);
    parent.append(this.root);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.hide(); });
  }

  show(sim: Sim, human: Actor) {
    this.sim = sim; this.human = human; this.bought = []; this.sig = ''; this.cat = -1;
    this.visible = true;
    this.root.classList.remove('hidden');
    this.render();
  }
  hide() { this.visible = false; this.root.classList.add('hidden'); }

  private sig = '';
  private cat = -1;
  private static readonly ORDER = ['Pistols', 'SMGs', 'Rifles', 'Snipers', 'Heavy', 'Gear', 'Grenades'];
  private itemsOf(name: string): ShopEntry[] { return shopFor(this.human!.team).filter((e) => e.group === name); }

  /** CS style quick buy: a number picks a category, a second number buys the item. Returns true if the key was used. */
  handleKey(code: string): boolean {
    if (!this.visible || !this.human) return false;
    if (code === 'Backspace' || code === 'Escape') { if (this.cat >= 0) { this.cat = -1; this.sig = ''; this.render(); return true; } return false; }
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (!m) return false;
    const n = Number(m[1]) - 1;
    if (this.cat < 0) {
      if (n < BuyMenu.ORDER.length && this.itemsOf(BuyMenu.ORDER[n]).length) { this.cat = n; this.sig = ''; this.render(); }
    } else {
      const items = this.itemsOf(BuyMenu.ORDER[this.cat]);
      this.cat = -1;
      if (n < items.length) this.buy(items[n].id);
      else { this.sig = ''; this.render(); }
    }
    return true;
  }
  /** Called every frame, only rebuilds the DOM when something it shows has changed. */
  refresh() {
    if (!this.visible || !this.human) return;
    const h = this.human;
    const sig = `${h.money}|${h.primary?.def.id}|${h.secondary?.def.id}|${h.armor}|${h.helmet}|${h.kit}|${h.grenades.flash}${h.grenades.smoke}${h.grenades.he}${h.grenades.fire}`;
    if (sig !== this.sig) { this.sig = sig; this.render(); }
  }

  private buy(item: string) {
    if (!this.onBuy) return;
    if (this.onBuy(item)) { audio.buy(); this.bought.push(item); this.lastLoadout = [...this.bought]; }
    else audio.deny();
    this.render();
  }

  private rebuy() {
    for (const item of this.lastLoadout.slice()) if (this.onBuy) this.onBuy(item);
    audio.buy(); this.render();
  }

  private auto() {
    const h = this.human!;
    const t = h.team;
    const rifle = t === 0 ? 'carbine' : 'vk47';
    const plan = ['armor', ...(h.primary ? [] : [rifle, t === 0 ? 'ranger' : 'reaper', t === 0 ? 'hornet' : 'wasp']), ...(t === 0 ? ['kit'] : []), 'smoke', 'flash', 'he'];
    // buy the best rifle that fits alongside armor
    let got = false;
    for (const id of plan) {
      const w = WEAPONS[id];
      if (w && w.slot === 'primary') { if (got || h.primary) continue; if (this.onBuy && h.money >= w.price + 650 && this.onBuy(id)) { got = true; this.bought.push(id); } continue; }
      if (this.onBuy && this.onBuy(id)) this.bought.push(id);
    }
    this.lastLoadout = [...this.bought];
    audio.buy(); this.render();
  }

  private stats(e: ShopEntry): string {
    const d = e.def;
    if (!d) return `<div class="nm">${e.name}</div><div>${e.kind === 'gear' ? 'Equipment' : 'Utility'}</div>`;
    const bar = (v: number, max: number) => `<div class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></div>`;
    const rate = d.rpm;
    return `<div class="nm">${d.name}</div><div style="color:#9aa6b2">${d.blurb}</div>
      <div style="margin-top:8px">Damage ${d.damage}${d.pellets > 1 ? ' × ' + d.pellets : ''}</div>${bar(d.damage * (d.pellets > 1 ? 3 : 1), 120)}
      <div>Fire rate ${Math.round(rate)} rpm</div>${bar(rate, 900)}
      <div>Armor penetration ${Math.round(d.armorPen * 100)}%</div>${bar(d.armorPen, 1)}
      <div>Magazine ${d.mag} / ${d.reserve}</div>${bar(d.mag, 50)}
      <div>Move speed ${(d.speed / 6.35 * 250).toFixed(0)} u/s</div>${bar(d.speed, 6.35)}
      <div>Kill reward $${d.killReward}</div>`;
  }

  private render() {
    const sim = this.sim!, h = this.human!;
    this.money.textContent = `$${h.money}`;
    const groups = new Map<string, ShopEntry[]>();
    for (const e of shopFor(h.team)) { if (!groups.has(e.group)) groups.set(e.group, []); groups.get(e.group)!.push(e); }
    this.cols.innerHTML = '';
    const stacks: string[][] = [['Pistols', 'SMGs'], ['Rifles', 'Snipers', 'Heavy'], ['Gear', 'Grenades']];
    let shown: ShopEntry | null = null;
    for (const names of stacks) {
      const stack = el('div', 'stack');
      for (const name of names) {
        const list = groups.get(name);
        if (!list) continue;
        const col = el('div', 'grp');
        const ci = BuyMenu.ORDER.indexOf(name);
        const h4 = el('h4', this.cat === ci ? 'on' : '', `<span class="kbd">${ci + 1}</span> ${name}`);
        col.append(h4);
        let ii = 0;
        for (const e of list) {
          const price = priceFor(h, e.id);
          const owned = (h.primary?.def.id === e.id) || (h.secondary?.def.id === e.id) || (e.id === 'kit' && h.kit) || (e.id === 'armor' && h.armor >= 100 && h.helmet) || (e.id === 'kevlar' && h.armor >= 100) || (e.kind === 'grenade' && h.grenades[e.id as 'flash'] > 0);
          const badge = this.cat === ci ? `<span class="kbd">${ii + 1}</span> ` : '';
          ii++;
          const b = el('button', `item${price < 0 || h.money < price ? ' no' : ''}${owned ? ' owned' : ''}`, `<span>${badge}${e.name}</span><span class="p">$${e.price}</span>`);
          b.onclick = () => this.buy(e.id);
          b.onmouseenter = () => { this.info.innerHTML = this.stats(e); audio.uiHover(); };
          col.append(b);
          if (!shown) shown = e;
        }
        stack.append(col);
      }
      this.cols.append(stack);
    }
    if (!this.info.innerHTML && shown) this.info.innerHTML = this.stats(shown);
    this.cols.append(this.info);
    void sim;
  }
}

// ======================================================================= scoreboard

export class Scoreboard {
  root = el('div', 'overlay clear hidden');
  private panel = el('div', 'panel');
  visible = false;
  constructor(parent: HTMLElement) {
    this.root.id = 'scoreboard';
    this.root.append(this.panel);
    parent.append(this.root);
  }
  show() { this.visible = true; this.root.classList.remove('hidden'); }
  hide() { this.visible = false; this.root.classList.add('hidden'); }

  render(sim: Sim, human: Actor | null) {
    if (!this.visible) return;
    const m = sim.m;
    const row = (a: Actor, showMoney: boolean) => `<tr class="${a.alive ? '' : 'dead'} ${a === human ? 'me' : ''}"><td>${a.name}${a.isHuman ? ' (you)' : ''}</td>${showMoney ? `<td class="money">$${a.money}</td>` : ''}<td>${a.stats.kills}</td><td>${a.stats.assists}</td><td>${a.stats.deaths}</td><td>${a.stats.damage}</td><td>${a.stats.mvps}</td><td>${a.stats.score}</td></tr>`;
    const head = (money: boolean) => `<tr><th>Player</th>${money ? '<th>Money</th>' : ''}<th>K</th><th>A</th><th>D</th><th>DMG</th><th>MVP</th><th>Score</th></tr>`;
    let html = '';
    if (sim.cfg.mode === 'dm') {
      const list = [...sim.actors].sort((a, b) => b.stats.kills - a.stats.kills);
      html = `<div class="teamhead"><span>Deathmatch</span><span>${Math.max(0, Math.ceil(m.dmEnd - sim.time))}s left</span></div><table>${head(false)}${list.map((a) => row(a, false)).join('')}</table>`;
    } else {
      const myTeam = human ? human.team : 0;
      for (const t of [myTeam, myTeam === 0 ? 1 : 0] as const) {
        const list = sim.actors.filter((a) => a.team === t).sort((a, b) => b.stats.score - a.stats.score);
        const grp = list[0]?.grp ?? 0;
        const showMoney = t === myTeam;
        html += `<div class="teamhead" style="color:${TEAM_CSS[t]}"><span>${TEAM_NAMES[t]}</span><span>${m.score[grp]}</span></div><table>${head(showMoney)}${list.map((a) => row(a, showMoney)).join('')}</table>`;
      }
      html += `<div style="color:#9aa6b2;font-size:12px;margin-top:8px">Round ${m.round} · first to ${m.winsNeeded} · ${sim.map.name}</div>`;
    }
    this.panel.innerHTML = html;
  }
}

// ======================================================================= menus

export interface MenuHandlers {
  start: () => void;
  resume: () => void;
  leave: () => void;
  again: () => void;
  changed: () => void;
}

export class Menus {
  main = el('div', 'overlay hidden');
  pause = el('div', 'overlay hidden');
  settings = el('div', 'overlay hidden');
  howto = el('div', 'overlay hidden');
  results = el('div', 'overlay hidden');
  resume = el('div', 'overlay hidden');
  loading = el('div', 'loading');
  private s: Settings;
  private h: MenuHandlers;
  private tab = 'Mouse';
  private rebinding: { action: KeyAction; idx: number } | null = null;
  private settingsBack: Cb | null = null;

  constructor(parent: HTMLElement, s: Settings, h: MenuHandlers) {
    this.s = s; this.h = h;
    this.main.id = 'menu';
    this.results.id = 'results';
    this.loading.innerHTML = '<div>Loading</div><div class="bar"><i></i></div>';
    parent.append(this.main, this.pause, this.settings, this.howto, this.results, this.resume, this.loading);
    window.addEventListener('keydown', (e) => {
      if (!this.rebinding) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code !== 'Escape') {
        const { action, idx } = this.rebinding;
        const keys = this.s.keys[action].slice();
        keys[idx] = e.code;
        this.s.keys[action] = keys;
      }
      this.rebinding = null;
      this.renderSettings();
      this.h.changed();
    }, true);
  }

  hideAll() { for (const e of [this.main, this.pause, this.settings, this.howto, this.results, this.resume]) e.classList.add('hidden'); }
  hideLoading() { this.loading.classList.add('hidden'); }

  // ---------------------------------------------------------------- main menu

  showMain() {
    this.hideAll();
    const s = this.s;
    const st = s.stats;
    const seg = (id: string, items: Array<[string, string]>, cur: string) => `<div class="seg" data-id="${id}">${items.map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'sel' : ''}">${l}</button>`).join('')}</div>`;
    this.main.innerHTML = `<div>
      <div class="brand">SITE<span>HOLD</span></div>
      <div class="tag">5v5 bomb defusal · play offline against bots</div>
      <div class="opts">
        <div>Mode</div>${seg('mode', [['comp', 'Competitive'], ['dm', 'Deathmatch']], s.mode)}
        <div>Your side</div>${seg('side', [['-1', 'Random'], ['0', 'Sentinels'], ['1', 'Breachers']], String(s.side))}
        <div>Bot skill</div>${seg('difficulty', BOT_LEVELS.map((l, i) => [String(i), l.name]), String(s.difficulty))}
      </div>
      <div class="actions"><button class="primary" id="m-play">Play</button><button id="m-set">Settings</button><button id="m-how">How to play</button></div>
      <div class="foot">${st.matches ? `Career: ${st.matches} matches, ${st.wins} wins, ${st.kills} kills, ${st.deaths} deaths, ${st.kills ? Math.round((st.headshots / st.kills) * 100) : 0}% headshots.<br>` : ''}
        Original map "Sandstone Yard". Click Play, then click the game to capture the mouse.</div></div>`;
    this.main.classList.remove('hidden');
    this.main.querySelectorAll('.seg').forEach((sg) => {
      sg.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => {
          const id = (sg as HTMLElement).dataset.id!;
          const v = (b as HTMLElement).dataset.v!;
          if (id === 'mode') s.mode = v as Settings['mode'];
          else if (id === 'side') s.side = Number(v) as Settings['side'];
          else s.difficulty = Number(v) as Settings['difficulty'];
          audio.uiClick(); this.h.changed(); this.showMain();
        });
      });
    });
    this.main.querySelector('#m-play')!.addEventListener('click', () => { audio.uiClick(); this.h.start(); });
    this.main.querySelector('#m-set')!.addEventListener('click', () => { audio.uiClick(); this.showSettings(() => this.showMain()); });
    this.main.querySelector('#m-how')!.addEventListener('click', () => { audio.uiClick(); this.showHowTo(() => this.showMain()); });
  }

  // ---------------------------------------------------------------- pause

  showPause() {
    this.hideAll();
    this.pause.innerHTML = `<div class="panel col" style="min-width:300px"><h2>Paused</h2>
      <button class="primary" id="p-res">Resume</button><button id="p-set">Settings</button><button id="p-how">Controls</button><button id="p-leave">Leave match</button></div>`;
    this.pause.classList.remove('hidden');
    this.pause.querySelector('#p-res')!.addEventListener('click', () => this.h.resume());
    this.pause.querySelector('#p-set')!.addEventListener('click', () => this.showSettings(() => this.showPause()));
    this.pause.querySelector('#p-how')!.addEventListener('click', () => this.showHowTo(() => this.showPause()));
    this.pause.querySelector('#p-leave')!.addEventListener('click', () => this.h.leave());
  }

  showResume() {
    this.hideAll();
    this.resume.style.cursor = 'pointer';
    this.resume.innerHTML = '<div class="panel" style="text-align:center"><h2>Click to continue</h2><div style="color:#9aa6b2">The mouse is released. Click anywhere to capture it again, or press Esc for the menu.</div></div>';
    this.resume.classList.remove('hidden');
    this.resume.onclick = () => { this.resume.classList.add('hidden'); this.h.resume(); };
  }

  // ---------------------------------------------------------------- how to play

  showHowTo(back: Cb) {
    this.hideAll();
    const k = this.s.keys;
    const kb = (a: KeyAction) => `<span class="kbd">${keyName(k[a][0])}</span>`;
    this.howto.innerHTML = `<div class="panel" style="max-width:900px"><h2>How to play</h2><div class="howto">
      <h3>Goal</h3><p><b>Breachers</b> plant the bomb at site A or B and protect it until it explodes. <b>Sentinels</b> stop the plant, or defuse the bomb. Win by eliminating the other team. First to 8 round wins takes the match, sides swap after round 7.</p>
      <h3>Round flow</h3><p>12 seconds of freeze time to buy (${kb('buy')}). Then 1:55 to play. Plant takes 3.2 s, the bomb burns for 40 s, a defuse takes 10 s or 5 s with a kit.</p>
      <h3>Money</h3><p>You earn money for kills (more for SMGs, shotguns, knives), for winning, and a growing loss bonus after each defeat. Surviving with a weapon saves it for the next round. Eco rounds exist for a reason.</p>
      <h3>Movement</h3><p>${kb('forward')}${kb('left')}${kb('back')}${kb('right')} move, ${kb('jump')} jump, ${kb('crouch')} crouch, ${kb('walk')} walk silently. Stop before you shoot: tap the opposite direction key (counter strafe) and your first shot is dead accurate. Moving, jumping and long sprays spread your bullets.</p>
      <h3>Shooting</h3><p>Left click fires, right click scopes or throws short. ${kb('reload')} reload. Spray patterns are always the same, so pull your mouse down to cancel the recoil. Headshots deal 4x damage. Thin wooden walls and crates can be shot through.</p>
      <h3>Grenades</h3><p>Press ${kb('grenade')} to pick one (again to cycle). Hold left click to arm, release to throw far; right click for a short toss. Flash blinds, smoke blocks vision for 18 s, HE and fire hurt.</p>
      <h3>Bomb</h3><p>Hold ${kb('use')} in a bombsite with the bomb to plant. Sentinels hold ${kb('use')} next to the planted bomb to defuse. ${kb('use')} also picks up weapons.</p>
      <h3>Other keys</h3><p>${kb('scoreboard')} scoreboard, ${kb('drop')} drop weapon, ${kb('last')} last weapon, ${kb('radio')} ask a teammate to drop a gun in freeze time, ${kb('mute')} mute. Esc pauses.</p></div>
      <div style="margin-top:14px"><button id="h-back" class="primary">Back</button></div></div>`;
    this.howto.classList.remove('hidden');
    this.howto.querySelector('#h-back')!.addEventListener('click', () => { this.howto.classList.add('hidden'); back(); });
  }

  // ---------------------------------------------------------------- settings

  showSettings(back: Cb) {
    this.hideAll();
    this.settingsBack = back;
    this.renderSettings();
    this.settings.classList.remove('hidden');
  }

  private renderSettings() {
    const s = this.s;
    const tabs = ['Mouse', 'Video', 'Audio', 'Crosshair', 'Keys'];
    const range = (id: string, label: string, min: number, max: number, step: number, v: number, fmt = (n: number) => String(n)) =>
      `<label class="f">${label}<span class="row"><input type="range" data-k="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><span class="v">${fmt(v)}</span></span></label>`;
    const sel = (id: string, label: string, opts: Array<[string, string]>, v: string) =>
      `<label class="f">${label}<select data-k="${id}">${opts.map(([o, l]) => `<option value="${o}" ${o === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    const chk = (id: string, label: string, v: boolean) => `<label class="f">${label}<input type="checkbox" data-k="${id}" ${v ? 'checked' : ''}></label>`;
    let body = '';
    const ch = s.crosshair;
    if (this.tab === 'Mouse') {
      body = range('sens', 'Sensitivity (CS scale, 0.022 deg per count)', 0.2, 6, 0.05, s.sens, (n) => n.toFixed(2))
        + range('fov', 'Field of view (vertical)', 55, 90, 0.5, s.fov, (n) => `${n.toFixed(1)}° (${(2 * Math.atan(Math.tan((n * Math.PI) / 360) * 16 / 9) * 180 / Math.PI).toFixed(0)}° at 16:9)`)
        + chk('invertY', 'Invert vertical', s.invertY)
        + sel('wheel', 'Mouse wheel', [['weapon', 'Switch weapon'], ['jump', 'Jump (bunny hop)']], s.wheel);
    } else if (this.tab === 'Video') {
      body = sel('quality', 'Graphics quality', [['low', 'Low (no shadows, fast)'], ['medium', 'Medium'], ['high', 'High (sharp shadows)']], s.quality) + chk('showFps', 'Show FPS', s.showFps);
    } else if (this.tab === 'Audio') {
      body = range('volume', 'Master volume', 0, 1, 0.01, s.volume, (n) => `${Math.round(n * 100)}%`) + range('music', 'Menu music', 0, 1, 0.01, s.music, (n) => `${Math.round(n * 100)}%`);
    } else if (this.tab === 'Crosshair') {
      body = sel('ch.style', 'Style', [['cross', 'Classic cross'], ['dot', 'Dot'], ['circle', 'Circle']], ch.style)
        + range('ch.size', 'Length', 0, 20, 1, ch.size) + range('ch.gap', 'Gap', -4, 14, 1, ch.gap) + range('ch.thickness', 'Thickness', 1, 6, 1, ch.thickness)
        + `<label class="f">Color<input type="color" data-k="ch.color" value="${ch.color}"></label>`
        + range('ch.opacity', 'Opacity', 0.2, 1, 0.05, ch.opacity, (n) => n.toFixed(2))
        + chk('ch.dot', 'Center dot', ch.dot) + chk('ch.outline', 'Outline', ch.outline) + chk('ch.dynamic', 'Dynamic spread', ch.dynamic)
        + `<div style="margin-top:12px;display:flex;justify-content:center;background:#7a8a6a;border-radius:8px;padding:10px"><canvas id="ch-prev" width="120" height="120"></canvas></div>`;
    } else {
      const rows = (Object.keys(ACTION_LABELS) as KeyAction[]).map((a) => {
        const cell = (i: number) => {
          const active = this.rebinding && this.rebinding.action === a && this.rebinding.idx === i;
          const code = s.keys[a][i];
          return `<button data-bind="${a}:${i}" style="min-width:90px" class="${active ? 'sel' : ''}">${active ? 'press a key' : code ? keyName(code) : '—'}</button>`;
        };
        return `<tr><td>${ACTION_LABELS[a]}</td><td>${cell(0)}</td><td>${cell(1)}</td></tr>`;
      }).join('');
      body = `<table class="keys">${rows}</table><div style="margin-top:10px"><button id="k-reset">Reset keys</button></div>`;
    }
    this.settings.innerHTML = `<div class="panel" style="min-width:min(560px,92vw)"><h2>Settings</h2>
      <div class="tabs">${tabs.map((t) => `<button data-tab="${t}" class="${t === this.tab ? 'sel' : ''}">${t}</button>`).join('')}</div>${body}
      <div style="margin-top:16px" class="row"><button class="primary" id="s-back">Done</button><button id="s-reset">Reset all</button></div></div>`;
    this.settings.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = (b as HTMLElement).dataset.tab!; audio.uiClick(); this.renderSettings(); }));
    this.settings.querySelectorAll('[data-k]').forEach((inp) => {
      const input = inp as HTMLInputElement;
      const handler = () => {
        const key = input.dataset.k!;
        const val = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
        if (key.startsWith('ch.')) (s.crosshair as unknown as Record<string, unknown>)[key.slice(3)] = val;
        else (s as unknown as Record<string, unknown>)[key] = val;
        const v = input.parentElement?.querySelector('.v');
        if (v && input.type === 'range') {
          if (key === 'sens') v.textContent = Number(val).toFixed(2);
          else if (key === 'fov') v.textContent = `${Number(val).toFixed(1)}° (${(2 * Math.atan(Math.tan((Number(val) * Math.PI) / 360) * 16 / 9) * 180 / Math.PI).toFixed(0)}° at 16:9)`;
          else if (key === 'volume' || key === 'music') v.textContent = `${Math.round(Number(val) * 100)}%`;
          else v.textContent = String(Number(val) % 1 ? Number(val).toFixed(2) : val);
        }
        this.h.changed();
        this.previewCrosshair();
      };
      input.addEventListener(input.type === 'range' || input.type === 'color' ? 'input' : 'change', handler);
    });
    this.settings.querySelectorAll('[data-bind]').forEach((b) => b.addEventListener('click', () => {
      const [a, i] = (b as HTMLElement).dataset.bind!.split(':');
      this.rebinding = { action: a as KeyAction, idx: Number(i) };
      this.renderSettings();
    }));
    this.settings.querySelector('#k-reset')?.addEventListener('click', () => { s.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS)); this.h.changed(); this.renderSettings(); });
    this.settings.querySelector('#s-reset')?.addEventListener('click', () => { Object.assign(s, { ...defaultSettings(), stats: s.stats }); this.h.changed(); this.renderSettings(); });
    this.settings.querySelector('#s-back')!.addEventListener('click', () => { this.settings.classList.add('hidden'); this.settingsBack?.(); });
    this.previewCrosshair();
  }

  private previewCrosshair() {
    const c = this.settings.querySelector('#ch-prev') as HTMLCanvasElement | null;
    if (!c) return;
    const g = c.getContext('2d')!;
    const ch = this.s.crosshair;
    g.clearRect(0, 0, 120, 120);
    g.globalAlpha = ch.opacity;
    const cx = 60, cy = 60, gap = ch.gap, len = ch.size, th = ch.thickness;
    const draw = (stroke: boolean) => {
      const o = stroke ? 1 : 0;
      g.fillStyle = stroke ? 'rgba(0,0,0,0.9)' : ch.color;
      const rect = (x: number, y: number, w: number, h: number) => g.fillRect(x - o, y - o, w + o * 2, h + o * 2);
      if (ch.style === 'cross') { rect(cx - th / 2, cy - gap - len, th, len); rect(cx - th / 2, cy + gap, th, len); rect(cx - gap - len, cy - th / 2, len, th); rect(cx + gap, cy - th / 2, len, th); }
      if (ch.style === 'circle') { g.beginPath(); g.arc(cx, cy, gap + len * 0.5, 0, 6.283); g.lineWidth = th + (stroke ? 2 : 0); g.strokeStyle = stroke ? 'rgba(0,0,0,0.9)' : ch.color; g.stroke(); }
      if (ch.dot || ch.style === 'dot') rect(cx - th / 2 - 0.5, cy - th / 2 - 0.5, th + 1, th + 1);
    };
    if (ch.outline) draw(true);
    draw(false);
  }

  // ---------------------------------------------------------------- results

  showResults(sim: Sim, human: Actor | null, won: boolean | null) {
    this.hideAll();
    const m = sim.m;
    const grp = human ? human.grp : 0;
    const [a, b] = sim.scoreFor(grp);
    const list = [...sim.actors].sort((x, y) => y.stats.score - x.stats.score);
    const title = sim.cfg.mode === 'dm' ? 'Deathmatch over' : won === null ? 'Draw' : won ? 'Victory' : 'Defeat';
    const color = won === null ? '#ffb347' : won ? '#5dffa0' : '#ff5a4a';
    this.results.innerHTML = `<div class="panel" style="min-width:min(640px,92vw);text-align:center"><h2 style="color:${color};font-size:34px;margin-bottom:4px">${title}</h2>
      ${sim.cfg.mode === 'comp' ? `<div style="font-size:30px;font-weight:800;margin-bottom:6px">${a} : ${b}</div>` : ''}
      <table><tr><th>Player</th><th>K</th><th>A</th><th>D</th><th>HS</th><th>MVP</th><th>Score</th></tr>
      ${list.map((p) => `<tr style="${p.isHuman ? 'background:rgba(255,255,255,0.07);font-weight:700' : ''};color:${sim.cfg.mode === 'dm' ? '#fff' : TEAM_CSS[p.team]}"><td>${p.name}</td><td>${p.stats.kills}</td><td>${p.stats.assists}</td><td>${p.stats.deaths}</td><td>${p.stats.headshots}</td><td>${p.stats.mvps}</td><td>${p.stats.score}</td></tr>`).join('')}</table>
      <div class="row" style="justify-content:center;margin-top:14px"><button class="primary" id="r-again">Play again</button><button id="r-menu">Main menu</button></div></div>`;
    this.results.classList.remove('hidden');
    this.results.querySelector('#r-again')!.addEventListener('click', () => this.h.again());
    this.results.querySelector('#r-menu')!.addEventListener('click', () => this.h.leave());
    void m;
  }
}
