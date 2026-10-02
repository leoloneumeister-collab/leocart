import { angleDiff } from '../../engine/util';
import type { WState } from '../weapons/weaponSystem';
import { audio } from '../../engine/audio';

const MARKS = 24;

export class HUD {
  root: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private compassSpans: HTMLElement[] = [];
  private mk: HTMLElement;
  private mkd: HTMLElement;
  private dmgEls: HTMLElement[] = [];
  private dmgIdx = 0;
  private hitTimer = 0;
  private msgTimer = 0;
  private subTimer = 0;
  private bannerTimer = 0;
  private subQueue: { who: string; text: string }[] = [];
  private subBusy = false;
  private lastHp = -1;

  constructor(parent: HTMLElement) {
    const r = document.createElement('div');
    r.className = 'hud-root';
    r.innerHTML = `
      <div class="objs"><h4>OBJECTIVES</h4><div id="o-list"></div></div>
      <div class="compass" id="compass"><div class="mk" id="mk"></div><div class="mkd" id="mkd"></div></div><div class="compass-c"></div>
      <div class="boss" id="boss"><b id="boss-name">VOSS</b><div class="bar"><div id="boss-fill"></div></div></div>
      <div class="xhair" id="xhair"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div>
      <div class="hitm" id="hitm"></div>
      <div class="dmg" id="dmg"></div>
      <div class="scope" id="scope"></div>
      <div class="vitals"><div class="row"><span class="hp-num" id="hp">100</span><span class="lbl">HEALTH</span></div><div class="bar" id="hpbar"><div id="hpfill"></div></div></div>
      <div class="ammo"><div class="wname" id="wname">VK-7</div><div class="count" id="ammo">30<small> / 150</small></div></div>
      <div class="sub" id="sub"><b id="sub-who"></b><span id="sub-text"></span></div>
      <div class="banner" id="banner"><h2 id="b-title"></h2><p id="b-sub"></p></div>
      <div class="msg" id="msg"></div>
      <div class="kf" id="kf"></div>
      <div class="fps" id="fps"></div>
      <div class="cinebar top"></div><div class="cinebar bot"></div>
      <div class="fade" id="fade"></div>`;
    parent.appendChild(r);
    this.root = r;
    for (const id of ['o-list', 'compass', 'boss', 'boss-name', 'boss-fill', 'xhair', 'hitm', 'dmg', 'scope', 'hp', 'hpbar', 'hpfill', 'wname', 'ammo', 'sub', 'sub-who', 'sub-text', 'banner', 'b-title', 'b-sub', 'msg', 'kf', 'fps', 'fade']) {
      this.el[id] = r.querySelector('#' + id) as HTMLElement;
    }
    this.mk = r.querySelector('#mk') as HTMLElement;
    this.mkd = r.querySelector('#mkd') as HTMLElement;
    for (let i = 0; i < MARKS; i++) {
      const s = document.createElement('span');
      this.el.compass.appendChild(s);
      this.compassSpans.push(s);
    }
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('i');
      this.el.dmg.appendChild(d);
      this.dmgEls.push(d);
    }
  }

  show(on: boolean) { this.root.classList.toggle('on', on); }
  setPaused(on: boolean) { this.root.classList.toggle('paused', on); }
  cinematic(on: boolean) { this.root.classList.toggle('cine', on); }
  fade(op: number, ms = 600) { this.el.fade.style.transition = `opacity ${ms}ms`; this.el.fade.style.opacity = String(op); }
  setFps(txt: string) { this.el.fps.textContent = txt; }

  setWeapon(s: WState) {
    this.el.wname.textContent = s.def.name;
    this.el.ammo.innerHTML = `${s.mag}<small> / ${s.reserve}</small>`;
    this.el.ammo.classList.toggle('low', s.mag <= Math.ceil(s.def.mag * 0.25));
  }

  setHealth(h: number, max: number) {
    const hp = Math.max(0, Math.ceil(h));
    if (hp === this.lastHp) return;
    this.lastHp = hp;
    this.el.hp.textContent = String(hp);
    (this.el.hpfill as HTMLElement).style.width = `${(h / max) * 100}%`;
    this.el.hpbar.classList.toggle('low', h / max < 0.35);
  }

  setCrosshair(gapPx: number, ads: number, scope: boolean) {
    const g = Math.max(4, gapPx);
    const x = this.el.xhair;
    (x.querySelector('.t') as HTMLElement).style.top = `${-g - 9}px`;
    (x.querySelector('.b') as HTMLElement).style.top = `${g}px`;
    (x.querySelector('.l') as HTMLElement).style.left = `${-g - 9}px`;
    (x.querySelector('.r') as HTMLElement).style.left = `${g}px`;
    x.classList.toggle('ads', ads > 0.5);
    x.style.display = scope && ads > 0.92 ? 'none' : 'block';
    this.el.scope.classList.toggle('on', scope && ads > 0.92);
  }

  hitMarker(head: boolean, kill: boolean) {
    const h = this.el.hitm;
    h.className = 'hitm on' + (kill ? ' kill' : head ? ' head' : '');
    clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => { h.className = 'hitm'; }, 90);
    if (kill) audio.kill(); else if (head) audio.headshot(); else audio.hitMarker();
  }

  flashMessage(text: string, ms = 1100) {
    this.el.msg.textContent = text;
    this.el.msg.classList.add('on');
    clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => this.el.msg.classList.remove('on'), ms);
  }

  setObjectives(list: { text: string; done: boolean }[]) {
    this.el['o-list'].innerHTML = list.map((o) => `<div class="it ${o.done ? 'done' : ''}">${o.text}</div>`).join('');
  }

  radio(who: string, text: string, dur: number, done: () => void) {
    this.subQueue.push({ who, text });
    void dur; void done;
    this.pump();
  }

  private pump() {
    if (this.subBusy) return;
    const n = this.subQueue.shift();
    if (!n) { this.el.sub.classList.remove('on'); return; }
    this.subBusy = true;
    this.el['sub-who'].textContent = n.who;
    this.el['sub-text'].textContent = n.text;
    this.el.sub.classList.add('on');
    const dur = audio.radio(n.text) || 2.5;
    clearTimeout(this.subTimer);
    this.subTimer = window.setTimeout(() => { this.subBusy = false; this.pump(); }, Math.max(2200, dur * 1000 + 600));
  }
  clearRadio() { this.subQueue = []; this.subBusy = false; this.el.sub.classList.remove('on'); clearTimeout(this.subTimer); }

  banner(title: string, sub: string, ms = 3200) {
    this.el['b-title'].textContent = title;
    this.el['b-sub'].textContent = sub;
    this.el.banner.classList.add('on');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.el.banner.classList.remove('on'), ms);
  }

  killFeed(text: string) {
    const d = document.createElement('div');
    d.textContent = text;
    this.el.kf.appendChild(d);
    if (this.el.kf.children.length > 5) this.el.kf.firstChild?.remove();
    setTimeout(() => d.remove(), 3300);
  }

  damageIndicator(rel: number) {
    const el = this.dmgEls[this.dmgIdx]; this.dmgIdx = (this.dmgIdx + 1) % this.dmgEls.length;
    el.style.transition = 'none';
    el.style.transform = `rotate(${rel}rad)`;
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'opacity 1.1s';
    el.style.opacity = '0';
  }

  bossBar(frac: number, name: string) {
    if (frac < 0) { this.el.boss.classList.remove('on'); return; }
    this.el.boss.classList.add('on');
    this.el['boss-name'].textContent = name;
    (this.el['boss-fill'] as HTMLElement).style.width = `${Math.max(0, frac) * 100}%`;
  }

  updateCompass(yaw: number, markerBearing: number | null, dist: number) {
    const bearing = -yaw;
    const spans = this.compassSpans;
    const cardinals: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' };
    for (let i = 0; i < MARKS; i++) {
      const deg = i * 15;
      const rel = angleDiff(bearing, (deg * Math.PI) / 180);
      const s = spans[i];
      const x = 240 + (rel / (Math.PI / 2)) * 240;
      if (Math.abs(rel) > Math.PI / 2) { s.style.display = 'none'; continue; }
      s.style.display = 'block';
      s.style.left = `${x}px`;
      const c = cardinals[deg];
      s.textContent = c ?? String(deg);
      s.className = c && c.length === 1 ? 'card' : '';
    }
    if (markerBearing === null) { this.mk.style.display = 'none'; this.mkd.style.display = 'none'; return; }
    const rel = angleDiff(bearing, markerBearing);
    const x = 240 + Math.max(-1, Math.min(1, rel / (Math.PI / 2))) * 228;
    this.mk.style.display = 'block'; this.mkd.style.display = 'block';
    this.mk.style.left = `${x}px`; this.mkd.style.left = `${x}px`;
    this.mkd.textContent = `${Math.round(dist)}m`;
  }
}
