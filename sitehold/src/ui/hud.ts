import type { Sim } from '../sim/sim.ts';
import type { Actor } from '../sim/actor.ts';
import { currentWeapon, grenadeCount } from '../sim/actor.ts';
import { fmtClock } from '../sim/math.ts';
import { ROUND, TEAM_BREACHER } from '../sim/constants.ts';
import type { MapData } from '../sim/map.ts';
import { WEAPONS } from '../sim/weapons.ts';
import type { Settings } from '../game/settings.ts';
import { keyName } from '../game/settings.ts';
import { TEAM_CSS } from '../render/characters.ts';

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface HudContext {
  sim: Sim;
  /** the actor whose view we are showing */
  subject: Actor;
  human: Actor | null;
  yaw: number;
  fovV: number;
  screenH: number;
  spread: number;
  spotted: Map<number, number>;
  spectating: boolean;
  scopeLevel: number;
  nearDrop: string | null;
  inSite: boolean;
  nearBomb: boolean;
}

const KILL_ICON: Record<string, string> = { knife: 'KNIFE', he: 'HE', fire: 'FIRE', bomb: 'C4', fall: 'FALL' };

export class Hud {
  root: HTMLElement;
  private s: Settings;
  private top = el('div', 'hud-top');
  private left = el('div', 'team left');
  private right = el('div', 'team right');
  private clock = el('div', 'clock');
  private leftScore = el('div', 'score');
  private rightScore = el('div', 'score');
  private leftAlive = el('div', 'alive');
  private rightAlive = el('div', 'alive');
  private health = el('div');
  private hpNum = el('div', 'num');
  private arNum = el('div', 'num');
  private money = el('div');
  private moneyNum = el('span');
  private moneyGain = el('div', 'gain');
  private ammo = el('div');
  private kf = el('div');
  private radarWrap = el('div');
  private radarCanvas = el('canvas');
  private place = el('div');
  private cross = el('canvas');
  private hit = el('div');
  private dmg = el('div');
  private hurtEl = el('div');
  private flashEl = el('div');
  private scope = el('div');
  private msg = el('div');
  private subs = el('div');
  private prog = el('div');
  private progBar = el('i');
  private progText = el('div');
  private prompt = el('div', 'hidden');
  private spec = el('div', 'hidden');
  private fps = el('div');
  private bombInfo = el('div');
  private mapCanvas: HTMLCanvasElement | null = null;
  private map: MapData | null = null;
  private hitT = 0;
  private hurtV = 0;
  private flashV = 0;
  private msgT = 0;
  private arcs: Array<{ el: HTMLElement; t: number }> = [];
  private lastMoney = 0;
  private gainT = 0;
  private lastKey = '';

  constructor(root: HTMLElement, s: Settings) {
    this.root = root;
    this.s = s;
    this.top.id = 'hud-top';
    this.left.append(this.leftAlive, this.leftScore);
    this.right.append(this.rightScore, this.rightAlive);
    this.top.append(this.left, this.clock, this.right);
    this.health.id = 'hud-health';
    const hp = el('div', 'stat'); hp.append(el('span', 'ico', '✚'), this.hpNum);
    const ar = el('div', 'stat armor'); ar.append(el('span', 'ico', '⛨'), this.arNum);
    this.health.append(hp, ar);
    this.money.id = 'hud-money'; this.money.append(this.moneyGain, this.moneyNum);
    this.ammo.id = 'hud-ammo';
    this.kf.id = 'killfeed';
    this.radarWrap.id = 'radar'; this.radarCanvas.width = 400; this.radarCanvas.height = 400; this.radarWrap.append(this.radarCanvas);
    this.place.id = 'placename';
    this.cross.id = 'crosshair'; this.cross.width = 160; this.cross.height = 160;
    this.hit.id = 'hitmarker';
    this.dmg.id = 'damage';
    this.hurtEl.id = 'hurt';
    this.flashEl.id = 'flash';
    this.scope.id = 'scope';
    this.msg.id = 'center-msg';
    this.subs.id = 'subtitles';
    this.prog.id = 'progress'; const bar = el('div', 'bar'); bar.append(this.progBar); this.prog.append(this.progText, bar); this.prog.classList.add('hidden');
    this.prompt.id = 'prompt';
    this.spec.id = 'spectate';
    this.fps.id = 'fps';
    this.bombInfo.id = 'bombinfo';
    root.append(this.scope, this.top, this.health, this.money, this.ammo, this.kf, this.radarWrap, this.place, this.cross, this.hit, this.dmg, this.hurtEl, this.msg, this.subs, this.prog, this.prompt, this.spec, this.fps, this.bombInfo, this.flashEl);
    for (let i = 0; i < 6; i++) { const a = el('div', 'arc'); a.append(el('i')); this.dmg.append(a); this.arcs.push({ el: a, t: 0 }); }
  }

  setSettings(s: Settings) { this.s = s; }

  setMap(map: MapData) {
    this.map = map;
    const S = 10;
    const c = document.createElement('canvas');
    c.width = map.bounds.maxX * S; c.height = map.bounds.maxZ * S;
    const g = c.getContext('2d')!;
    g.fillStyle = '#c9ae7e'; g.fillRect(0, 0, c.width, c.height);
    for (const b of map.boxes) {
      if (b.hide || b.minY > 3) continue;
      const h = b.maxY - b.minY;
      g.fillStyle = h > 3 ? '#3a3f46' : b.mat === 'wood' ? '#7a5a3a' : h > 1.5 ? '#6d5a3e' : '#8a7550';
      if (b.maxY > 0.2 && b.minY < 0.3 || b.minY === 0) g.fillRect(b.minX * S, b.minZ * S, (b.maxX - b.minX) * S, (b.maxZ - b.minZ) * S);
    }
    for (const d of map.deco) { g.fillStyle = '#b9a070'; g.fillRect(d.x0 * S, d.z0 * S, (d.x1 - d.x0) * S, (d.z1 - d.z0) * S); }
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = 'bold 120px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of map.sites) { g.fillStyle = 'rgba(30,24,16,0.55)'; g.fillText(s.id, s.plant.x * S, s.plant.z * S); }
    this.mapCanvas = c;
  }

  // ------------------------------------------------------------------ events

  killFeed(sim: Sim, e: { killer: number; victim: number; weapon: string; head: boolean; wallbang: boolean }, humanId: number | null) {
    const k = sim.actors[e.killer], v = sim.actors[e.victim];
    const row = el('div', 'k' + (e.killer === humanId || e.victim === humanId ? ' me' : ''));
    const col = (a: Actor) => (sim.cfg.mode === 'dm' ? '#ffd9a0' : TEAM_CSS[a.team]);
    const name = (a: Actor) => `<span style="color:${col(a)}">${a.name}</span>`;
    const wn = KILL_ICON[e.weapon] ?? WEAPONS[e.weapon]?.name ?? e.weapon;
    row.innerHTML = `${e.killer === e.victim ? '' : name(k)} <span class="w">${wn}</span>${e.wallbang ? '<span class="w">▤</span>' : ''}${e.head ? '<span class="hs">⌖</span>' : ''} ${name(v)}`;
    this.kf.prepend(row);
    while (this.kf.children.length > 6) this.kf.lastElementChild!.remove();
    setTimeout(() => row.remove(), 7000);
  }

  hitMarker(head: boolean) { this.hit.className = head ? 'on head' : 'on'; this.hitT = 0.12; }

  damageFrom(relAngle: number, amount: number) {
    const a = this.arcs.reduce((best, x) => (x.t < best.t ? x : best), this.arcs[0]);
    a.t = 1.4;
    a.el.style.transform = `rotate(${relAngle}rad)`;
    this.hurtV = Math.min(1, this.hurtV + amount / 60);
  }

  flash(level: number) { this.flashV = Math.max(this.flashV, level); }
  setFlash(level: number) { this.flashEl.style.opacity = String(level); }

  center(big: string, small = '', color = '#fff', secs = 3.2) {
    this.msg.innerHTML = `<div class="big" style="color:${color}">${big}</div>${small ? `<div class="small">${small}</div>` : ''}`;
    this.msgT = secs;
  }

  subtitle(name: string, team: 0 | 1, text: string) {
    const l = el('div', 'l');
    l.style.borderLeftColor = TEAM_CSS[team];
    l.innerHTML = `<b style="color:${TEAM_CSS[team]}">${name}</b>${text}`;
    this.subs.append(l);
    while (this.subs.children.length > 4) this.subs.firstElementChild!.remove();
    setTimeout(() => l.remove(), 6000);
  }

  money$(n: number) {
    this.moneyGain.textContent = (n > 0 ? '+$' : '-$') + Math.abs(n);
    this.moneyGain.style.color = n > 0 ? '#7aff9a' : '#ff7a6a';
    this.gainT = 2;
  }

  /** Controls reminder for a player's very first match. */
  firstRunHint(s: Settings) {
    const k = s.keys;
    const kb = (a: keyof typeof k) => `<span class="kbd">${keyName(k[a][0])}</span>`;
    const box = el('div', 'l');
    box.style.cssText = 'position:absolute;left:50%;bottom:90px;transform:translateX(-50%);background:rgba(0,0,0,0.6);padding:8px 16px;border-radius:6px;font-size:15px;border:1px solid rgba(255,255,255,0.15);animation:fade 14s forwards;white-space:nowrap';
    box.innerHTML = `${kb('forward')}${kb('left')}${kb('back')}${kb('right')} move · Mouse aim · Click shoot · ${kb('reload')} reload · ${kb('buy')} buy (now) · ${kb('use')} plant or defuse · ${kb('scoreboard')} scoreboard · Esc pause`;
    this.root.append(box);
    setTimeout(() => box.remove(), 14000);
  }

  reset() {
    this.kf.innerHTML = ''; this.subs.innerHTML = ''; this.msg.innerHTML = ''; this.msgT = 0; this.flashV = 0; this.hurtV = 0;
  }

  // ------------------------------------------------------------------ per frame

  update(c: HudContext, dt: number, fps: number) {
    const { sim, subject, human } = c;
    const m = sim.m;
    const mine: 0 | 1 = human ? human.team : 0;
    // ---- top bar
    if (sim.cfg.mode === 'dm') {
      this.left.className = 'team left sent'; this.right.className = 'team right breach';
      const lead = [...sim.actors].sort((a, b) => b.stats.kills - a.stats.kills)[0];
      this.leftScore.textContent = String(human ? human.stats.kills : 0);
      this.rightScore.textContent = String(lead.stats.kills);
      this.leftAlive.innerHTML = '<span style="font-size:12px;color:#9ab">YOU</span>';
      this.rightAlive.innerHTML = `<span style="font-size:12px;color:#9ab">${lead.name.toUpperCase()}</span>`;
      this.clock.className = 'clock';
      this.clock.innerHTML = `<div class="time">${fmtClock((m.dmEnd - sim.time))}</div><div class="sub">Deathmatch</div>`;
    } else {
      const grp = human ? human.grp : 0;
      const [a, b] = sim.scoreFor(grp);
      this.left.className = 'team left ' + (mine === TEAM_BREACHER ? 'breach' : '');
      this.right.className = 'team right ' + (mine === TEAM_BREACHER ? 'sent' : '');
      this.leftScore.textContent = String(a); this.rightScore.textContent = String(b);
      this.leftScore.className = 'score ' + (mine === 0 ? 'sent-c' : 'breach-c');
      this.rightScore.className = 'score ' + (mine === 0 ? 'breach-c' : 'sent-c');
      const count = (t: number) => sim.actors.filter((x) => x.team === t);
      const icons = (t: number) => count(t).map((x) => `<i class="${x.alive ? '' : 'dead'}"></i>`).join('');
      const key = `${mine}${icons(mine)}${icons(mine ? 0 : 1)}`;
      if (key !== this.lastKey) {
        this.lastKey = key;
        this.leftAlive.innerHTML = icons(mine); this.leftAlive.style.color = TEAM_CSS[mine];
        this.rightAlive.innerHTML = icons(mine ? 0 : 1); this.rightAlive.style.color = TEAM_CSS[mine ? 0 : 1];
      }
      let time = '0:00', sub = 'Round ' + m.round, cls = 'clock';
      if (m.phase === 'freeze') { time = fmtClock(m.phaseEnd - sim.time); sub = 'Freeze time'; }
      else if (m.phase === 'live') {
        if (sim.bomb.state === 'planted') { time = fmtClock(sim.bombTimeLeft()); sub = 'Bomb'; cls += ' bomb'; }
        else { const left = m.phaseEnd - sim.time; time = fmtClock(left); if (left < 10) cls += ' low'; sub = 'Round ' + m.round; }
      } else if (m.phase === 'halftime') { time = '—'; sub = 'Switching sides'; }
      else if (m.phase === 'roundEnd') { time = sim.bomb.state === 'defused' ? 'DEFUSED' : '0:00'; sub = 'Round ' + m.round; }
      this.clock.className = cls;
      this.clock.innerHTML = `<div class="time">${time}</div><div class="sub">${sub}${m.suddenDeath ? ' · sudden death' : ''}</div>`;
    }

    // ---- vitals
    const s = subject;
    this.hpNum.textContent = String(Math.max(0, Math.ceil(s.health)));
    this.hpNum.className = 'num' + (s.health <= 25 ? ' low' : '');
    this.arNum.textContent = String(Math.ceil(s.armor));
    this.arNum.parentElement!.style.opacity = s.armor > 0 ? '1' : '0.35';
    (this.arNum.previousElementSibling as HTMLElement).textContent = s.helmet ? '⛑' : '⛨';
    if (sim.cfg.mode !== 'dm') {
      this.money.style.display = '';
      if (s.money !== this.lastMoney) this.lastMoney = s.money;
      this.moneyNum.textContent = '$' + s.money;
    } else this.money.style.display = 'none';
    this.gainT = Math.max(0, this.gainT - dt);
    this.moneyGain.style.opacity = String(Math.min(1, this.gainT));
    this.moneyGain.style.transform = `translateY(${-(2 - this.gainT) * 10}px)`;

    // ---- ammo and slots
    const ws = currentWeapon(s);
    let name = '', cnt = '';
    if (s.cur === 'grenade') name = (s.grenadeSel ?? '') + ' grenade';
    else if (s.cur === 'bomb') name = 'Explosive';
    else if (ws) { name = ws.def.name; cnt = ws.def.cls === 'knife' ? '' : `${ws.ammo}<small> / ${ws.reserve}</small>`; }
    const low = ws && ws.def.mag > 0 && ws.ammo <= Math.ceil(ws.def.mag * 0.25);
    const slot = (label: string, on: boolean, cur: boolean) => on ? `<span class="${cur ? 'sel' : ''}">${label}</span>` : '';
    const g = s.grenades;
    const gren = (['flash', 'smoke', 'he', 'fire'] as const).filter((k) => g[k] > 0).map((k) => `<span class="${s.cur === 'grenade' && s.grenadeSel === k ? 'sel' : ''}">${k === 'he' ? 'HE' : k === 'fire' ? 'FIRE' : k.toUpperCase()}${g[k] > 1 ? ' ×' + g[k] : ''}</span>`).join('');
    const kb = this.s.keys;
    this.ammo.innerHTML = `<div class="wname">${name}</div><div class="count ${low ? 'low' : ''}">${cnt}</div>
      <div class="slots">${slot(`${keyName(kb.primary[0])} ${s.primary?.def.name ?? ''}`, !!s.primary, s.cur === 'primary')}${slot(`${keyName(kb.secondary[0])} ${s.secondary?.def.name ?? ''}`, !!s.secondary, s.cur === 'secondary')}${slot(`${keyName(kb.knife[0])} Knife`, true, s.cur === 'knife')}${slot(`${keyName(kb.bomb[0])} C4`, s.hasBomb, s.cur === 'bomb')}</div>
      <div class="gear">${gren}${s.kit ? '<span>KIT</span>' : ''}${s.hasBomb && s.cur !== 'bomb' ? '<span class="sel">C4</span>' : ''}</div>`;

    // ---- place, progress, prompt, spectate
    this.place.textContent = sim.placeName(s.pos);
    let progress = 0, ptext = '';
    if (s.planting > 0) { progress = s.planting / ROUND.plant; ptext = 'Planting the bomb'; }
    else if (s.defusing > 0) { progress = s.defusing / (s.kit ? ROUND.defuseKit : ROUND.defuse); ptext = s.kit ? 'Defusing (kit)' : 'Defusing'; }
    this.prog.classList.toggle('hidden', progress <= 0);
    this.progBar.style.width = `${Math.min(100, progress * 100)}%`;
    this.progText.textContent = ptext;

    let prompt = '';
    if (!c.spectating && human && human.alive) {
      if (m.phase === 'freeze' && sim.cfg.mode === 'comp') prompt = `Press ${keyName(kb.buy[0])} to open the buy menu`;
      else if (human.hasBomb && c.inSite && m.phase === 'live' && sim.bomb.state === 'carried') prompt = `Hold ${keyName(kb.use[0])} to plant the bomb`;
      else if (human.team === 0 && c.nearBomb && sim.bomb.state === 'planted') prompt = `Hold ${keyName(kb.use[0])} to defuse${human.kit ? ' (kit)' : ''}`;
      else if (c.nearDrop) prompt = `Press ${keyName(kb.use[0])} to pick up ${c.nearDrop}`;
    }
    this.prompt.textContent = prompt;
    this.prompt.classList.toggle('hidden', !prompt);

    if (c.spectating) {
      this.spec.classList.remove('hidden');
      this.spec.innerHTML = `<small>SPECTATING</small>${s.name}<small>click to cycle players</small>`;
    } else this.spec.classList.add('hidden');

    // ---- timers for transient things
    this.hitT = Math.max(0, this.hitT - dt);
    if (this.hitT === 0) this.hit.className = '';
    this.hurtV = Math.max(0, this.hurtV - dt * 0.9);
    this.hurtEl.style.opacity = String(Math.min(1, this.hurtV + (s.health < 30 ? 0.25 + Math.sin(sim.time * 5) * 0.05 : 0)));
    for (const a of this.arcs) { a.t = Math.max(0, a.t - dt); a.el.style.opacity = String(Math.min(1, a.t)); }
    this.flashV = Math.max(0, this.flashV - dt * 2);
    this.msgT = Math.max(0, this.msgT - dt);
    this.msg.style.opacity = this.msgT > 0 ? '1' : '0';
    this.scope.classList.toggle('on', c.scopeLevel > 0);

    this.fps.textContent = this.s.showFps ? `${fps.toFixed(0)} fps` : '';
    this.drawCrosshair(c);
    this.drawRadar(c);
  }

  private drawCrosshair(c: HudContext) {
    const g = this.cross.getContext('2d')!;
    const ch = this.s.crosshair;
    g.clearRect(0, 0, 160, 160);
    if (c.scopeLevel > 0 || !c.subject.alive) return;
    const cx = 80, cy = 80;
    const pxPerDeg = c.screenH / c.fovV;
    const dyn = ch.dynamic ? Math.min(60, c.spread * pxPerDeg * 0.5) : 0;
    const gap = ch.gap + dyn, len = ch.size, th = ch.thickness;
    g.globalAlpha = ch.opacity;
    const draw = (stroke: boolean) => {
      g.fillStyle = stroke ? 'rgba(0,0,0,0.9)' : ch.color;
      const o = stroke ? 1 : 0;
      const rect = (x: number, y: number, w: number, h: number) => g.fillRect(x - o, y - o, w + o * 2, h + o * 2);
      if (ch.style === 'cross' || ch.style === 'tcross') {
        rect(cx - th / 2, cy - gap - len, th, len);        // up
        rect(cx - th / 2, cy + gap, th, len);              // down
        rect(cx - gap - len, cy - th / 2, len, th);        // left
        rect(cx + gap, cy - th / 2, len, th);              // right
        if (ch.style === 'tcross') { /* top bar removed */ }
      }
      if (ch.style === 'circle') { g.beginPath(); g.arc(cx, cy, gap + len * 0.5, 0, 6.283); g.lineWidth = th + (stroke ? 2 : 0); g.strokeStyle = stroke ? 'rgba(0,0,0,0.9)' : ch.color; g.stroke(); }
      if (ch.dot || ch.style === 'dot') rect(cx - th / 2 - 0.5, cy - th / 2 - 0.5, th + 1, th + 1);
    };
    if (ch.outline) draw(true);
    draw(false);
    if (ch.style === 'tcross') { g.fillStyle = 'rgba(0,0,0,0.9)'; }
    g.globalAlpha = 1;
  }

  private drawRadar(c: HudContext) {
    const g = this.radarCanvas.getContext('2d')!;
    const W = this.radarCanvas.width, R = W / 2;
    const sim = c.sim, s = c.subject;
    const scale = 5.2; // pixels per metre on the 400px canvas, about 38 m radius
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(R, R, R, 0, 6.283); g.clip();
    g.translate(R, R);
    g.rotate(c.yaw);
    g.scale(scale, scale);
    g.translate(-s.pos.x, -s.pos.z);
    if (this.mapCanvas) { g.globalAlpha = 0.85; g.drawImage(this.mapCanvas, 0, 0, this.mapCanvas.width / 10, this.mapCanvas.height / 10); g.globalAlpha = 1; }
    // markers in world space, drawn unrotated by counter rotating where needed
    const me = s.team;
    const dot = (x: number, z: number, color: string, r = 1.6, ring = true) => {
      g.beginPath(); g.arc(x, z, r, 0, 6.283); g.fillStyle = color; g.fill();
      if (ring) { g.lineWidth = 0.35; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.stroke(); }
    };
    // bomb
    const b = sim.bomb;
    if (b.state === 'dropped') dot(b.pos.x, b.pos.z, '#ffe14a', 1.8);
    else if (b.state === 'planted') dot(b.pos.x, b.pos.z, Math.floor(sim.time * 3) % 2 ? '#ff3a2a' : '#7a1810', 2.2);
    for (const a of sim.actors) {
      if (!a.alive || a === s) continue;
      const friendly = sim.cfg.mode === 'comp' && a.team === me;
      if (friendly) {
        dot(a.pos.x, a.pos.z, TEAM_CSS[a.team], 1.7);
        // facing tick
        g.beginPath(); g.moveTo(a.pos.x, a.pos.z); g.lineTo(a.pos.x - Math.sin(a.yaw) * 4, a.pos.z - Math.cos(a.yaw) * 4); g.lineWidth = 0.5; g.strokeStyle = TEAM_CSS[a.team]; g.stroke();
      } else {
        const until = c.spotted.get(a.id) ?? 0;
        if (until > sim.time) dot(a.pos.x, a.pos.z, '#ff4636', 1.8);
      }
    }
    g.restore();
    // self arrow
    g.save();
    g.translate(R, R);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
