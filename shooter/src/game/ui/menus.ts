import { MISSIONS } from '../../story/story';
import { SaveData, writeSave } from '../../engine/save';
import { WEAPONS, WEAPON_ORDER, WeaponId } from '../weapons/defs';
import { audio } from '../../engine/audio';
import { fmtTime } from '../../engine/util';

export interface MenuHandlers {
  startMission(id: number, loadout: WeaponId[], cp: number): void;
  resume(): void;
  restartCheckpoint(): void;
  quit(): void;
  next(): void;
  replay(): void;
  settingsChanged(): void;
}

export interface Results {
  missionId: number; time: number; kills: number; accuracy: number; headshots: number; damage: number; score: number; grade: string; newBest: boolean; hasNext: boolean;
}

export class Menus {
  private root: HTMLElement;
  private screens: Record<string, HTMLElement> = {};
  loadout: WeaponId[] = ['vk7', 'hornet'];
  private backTo: () => void = () => {};
  private touchMode = false;

  constructor(parent: HTMLElement, private save: SaveData, private h: MenuHandlers, touch: boolean) {
    this.root = parent;
    this.touchMode = touch;
  }

  private screen(name: string, cls = ''): HTMLElement {
    let s = this.screens[name];
    if (!s) { s = document.createElement('div'); this.root.appendChild(s); this.screens[name] = s; }
    s.className = 'screen on ' + cls;
    return s;
  }

  hide() { for (const s of Object.values(this.screens)) s.classList.remove('on'); }
  private only(name: string, cls = '') {
    for (const [k, s] of Object.entries(this.screens)) if (k !== name) s.classList.remove('on');
    return this.screen(name, cls);
  }

  private bind(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('.btn, .chip, .wcard, .mcard').forEach((b) => b.addEventListener('mouseenter', () => audio.uiHover()));
  }

  loading(text = 'LOADING') {
    const s = this.only('loading');
    s.innerHTML = `<div class="load">${text}</div>`;
  }

  title() {
    const s = this.only('title', 'clear');
    s.innerHTML = `
      <h1 class="logo">SHADOW<br/><span>PROTOCOL</span></h1>
      <div class="tag">GHOST TEAM  /  CLASSIFIED</div>
      <div class="menu">
        <button class="btn primary" id="m-play">Campaign</button>
        <button class="btn" id="m-set">Settings</button>
        <button class="btn" id="m-ctl">Controls</button>
      </div>
      <div class="hint">${this.touchMode ? 'TOUCH CONTROLS ENABLED' : 'BEST PLAYED IN FULLSCREEN WITH SOUND ON'}</div>`;
    (s.querySelector('#m-play') as HTMLElement).onclick = () => { audio.uiClick(); this.missions(); };
    (s.querySelector('#m-set') as HTMLElement).onclick = () => { audio.uiClick(); this.settings(() => this.title()); };
    (s.querySelector('#m-ctl') as HTMLElement).onclick = () => { audio.uiClick(); this.controls(() => this.title()); };
    this.bind(s);
  }

  missions() {
    const s = this.only('missions');
    const cards = MISSIONS.map((m) => {
      const locked = m.id > this.save.unlocked;
      const rec = this.save.records[`m${m.id}-${this.save.settings.difficulty}`];
      return `<div class="mcard ${locked ? 'locked' : ''}" data-id="${m.id}">
        <div class="n">MISSION 0${m.id}</div><h3>${m.codename}</h3><p>${m.location}</p>
        <div class="rec">${locked ? 'LOCKED' : rec ? `BEST ${rec.bestGrade}  /  ${fmtTime(rec.bestTime)}  /  ${rec.bestScore}` : 'NOT COMPLETED'}</div></div>`;
    }).join('');
    s.innerHTML = `<h2 class="title">SELECT MISSION</h2><div class="cards">${cards}</div><div class="row" style="margin-top:26px"><button class="btn small" id="back">Back</button></div>`;
    s.querySelectorAll<HTMLElement>('.mcard').forEach((c) => (c.onclick = () => { audio.uiClick(); this.briefing(Number(c.dataset.id)); }));
    (s.querySelector('#back') as HTMLElement).onclick = () => { audio.uiClick(); this.title(); };
    this.bind(s);
  }

  briefing(id: number) {
    const m = MISSIONS.find((x) => x.id === id)!;
    const s = this.only('briefing');
    const diffNames = ['RECRUIT', 'VETERAN', 'ELITE'];
    const render = () => {
      s.innerHTML = `<div class="brief">
        <h1>${m.codename}</h1><div class="meta">${m.location}  /  ${m.time}</div>
        ${m.briefing.map((t) => `<p class="txt">${t}</p>`).join('')}
        <div class="obj">${m.objectives.map((o) => `<div>${o}</div>`).join('')}</div>
        <div class="meta" style="margin:16px 0 4px">LOADOUT  /  PICK TWO</div>
        <div class="loadout">${WEAPON_ORDER.map((w) => {
          const d = WEAPONS[w], idx = this.loadout.indexOf(w);
          const st = d.stats;
          return `<div class="wcard ${idx >= 0 ? 'sel' : ''}" data-w="${w}">${idx >= 0 ? `<div class="sl">SLOT ${idx + 1}</div>` : ''}
            <h4>${d.name}</h4><small>${d.role}</small>
            <div class="st"><span>POWER</span><i><b style="width:${st.power * 100}%"></b></i><span>RATE</span><i><b style="width:${st.speed * 100}%"></b></i><span>RANGE</span><i><b style="width:${st.range * 100}%"></b></i><span>CONTROL</span><i><b style="width:${st.control * 100}%"></b></i></div>
            <p>${d.desc}</p></div>`;
        }).join('')}</div>
        <div class="diff">DIFFICULTY ${diffNames.map((n, i) => `<span class="chip ${this.save.settings.difficulty === i ? 'sel' : ''}" data-d="${i}">${n}</span>`).join('')}</div>
        <div class="row" style="justify-content:flex-start">
          <button class="btn primary" id="deploy">Deploy</button><button class="btn" id="back">Back</button>
        </div></div>`;
      s.querySelectorAll<HTMLElement>('.wcard').forEach((c) => (c.onclick = () => {
        const w = c.dataset.w as WeaponId;
        const i = this.loadout.indexOf(w);
        if (i >= 0) { if (this.loadout.length > 1) this.loadout.splice(i, 1); }
        else { if (this.loadout.length >= 2) this.loadout.shift(); this.loadout.push(w); }
        audio.uiClick(); render();
      }));
      s.querySelectorAll<HTMLElement>('.chip').forEach((c) => (c.onclick = () => {
        this.save.settings.difficulty = Number(c.dataset.d) as 0 | 1 | 2; writeSave(this.save); audio.uiClick(); render();
      }));
      (s.querySelector('#deploy') as HTMLElement).onclick = () => { audio.uiClick(); this.h.startMission(id, [...this.loadout], 0); };
      (s.querySelector('#back') as HTMLElement).onclick = () => { audio.uiClick(); this.missions(); };
      this.bind(s);
    };
    render();
  }

  settings(back: () => void) {
    this.backTo = back;
    const s = this.only('settings');
    const st = this.save.settings;
    s.innerHTML = `<h2 class="title">SETTINGS</h2><div class="set">
      <div class="r">LOOK SENSITIVITY<input type="range" min="0.2" max="3" step="0.05" value="${st.sens}" data-k="sens"></div>
      <div class="r">FIELD OF VIEW<input type="range" min="60" max="110" step="1" value="${st.fov}" data-k="fov"></div>
      <div class="r">MUSIC<input type="range" min="0" max="1" step="0.05" value="${st.music}" data-k="music"></div>
      <div class="r">EFFECTS<input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-k="sfx"></div>
      <div class="r">GRAPHICS<span>${(['low', 'medium', 'high'] as const).map((q) => `<span class="chip ${st.quality === q ? 'sel' : ''}" data-q="${q}">${q.toUpperCase()}</span>`).join(' ')}</span></div>
      <div class="r">INVERT Y<input type="checkbox" ${st.invertY ? 'checked' : ''} data-k="invertY"></div>
      <div class="r">FULLSCREEN<span class="chip" id="fs">TOGGLE</span></div>
    </div><div class="row" style="margin-top:22px"><button class="btn small" id="back">Back</button></div>`;
    s.querySelectorAll<HTMLInputElement>('input').forEach((i) => (i.oninput = () => {
      const k = i.dataset.k as keyof typeof st;
      if (i.type === 'checkbox') (st as unknown as Record<string, unknown>)[k] = i.checked;
      else (st as unknown as Record<string, unknown>)[k] = Number(i.value);
      writeSave(this.save); this.h.settingsChanged();
    }));
    s.querySelectorAll<HTMLElement>('.chip').forEach((c) => (c.onclick = () => {
      st.quality = c.dataset.q as typeof st.quality; writeSave(this.save); this.h.settingsChanged(); audio.uiClick(); this.settings(this.backTo);
    }));
    (s.querySelector('#fs') as HTMLElement).onclick = () => { audio.uiClick(); if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); };
    (s.querySelector('#back') as HTMLElement).onclick = () => { audio.uiClick(); this.backTo(); };
    this.bind(s);
  }

  controls(back: () => void) {
    const s = this.only('controls');
    s.innerHTML = `<h2 class="title">CONTROLS</h2><div class="set"><div class="controls">
      <kbd>W A S D</kbd><span>Move</span><kbd>MOUSE</kbd><span>Look</span><kbd>LEFT CLICK</kbd><span>Fire</span><kbd>RIGHT CLICK</kbd><span>Aim down sights</span>
      <kbd>R</kbd><span>Reload</span><kbd>SHIFT</kbd><span>Sprint</span><kbd>C</kbd><span>Crouch (hold)</span><kbd>SPACE</kbd><span>Jump</span>
      <kbd>1 / 2 / Q / WHEEL</kbd><span>Switch weapon</span><kbd>F</kbd><span>Knife</span><kbd>ESC</kbd><span>Pause</span>
    </div></div><p class="hint" style="position:static;margin-top:18px">Shoot explosive barrels. Destroy the relay towers. Health regenerates when you stay out of the fight.</p>
    <div class="row" style="margin-top:12px"><button class="btn small" id="back">Back</button></div>`;
    (s.querySelector('#back') as HTMLElement).onclick = () => { audio.uiClick(); back(); };
    this.bind(s);
  }

  pause() {
    const s = this.only('pause');
    s.innerHTML = `<h2 class="title">PAUSED</h2><div class="menu">
      <button class="btn primary" id="p-res">Resume</button><button class="btn" id="p-rs">Restart checkpoint</button>
      <button class="btn" id="p-set">Settings</button><button class="btn" id="p-ctl">Controls</button><button class="btn" id="p-q">Quit to menu</button></div>`;
    const b = (id: string, fn: () => void) => ((s.querySelector('#' + id) as HTMLElement).onclick = () => { audio.uiClick(); fn(); });
    b('p-res', () => this.h.resume()); b('p-rs', () => this.h.restartCheckpoint()); b('p-q', () => this.h.quit());
    b('p-set', () => this.settings(() => this.pause())); b('p-ctl', () => this.controls(() => this.pause()));
    this.bind(s);
  }

  click2play() {
    const s = this.only('click2play', 'click2play');
    s.style.background = 'rgba(2,4,6,0.35)';
    s.innerHTML = `<h2 class="title" style="margin:0">CLICK TO RESUME</h2><div class="hint" style="position:static;margin-top:14px">ESC TO OPEN MENU</div>`;
  }

  gameOver(hasCp: boolean) {
    const s = this.only('over', 'kia');
    s.innerHTML = `<h1>KILLED IN ACTION</h1><div class="tag" style="margin-top:6px">THE MISSION IS NOT OVER</div><div class="menu">
      <button class="btn primary" id="g-rs">${hasCp ? 'Restart from checkpoint' : 'Retry mission'}</button><button class="btn" id="g-q">Quit to menu</button></div>`;
    (s.querySelector('#g-rs') as HTMLElement).onclick = () => { audio.uiClick(); this.h.restartCheckpoint(); };
    (s.querySelector('#g-q') as HTMLElement).onclick = () => { audio.uiClick(); this.h.quit(); };
    this.bind(s);
  }

  results(r: Results) {
    const s = this.only('results');
    s.innerHTML = `<div class="tag" style="margin:0">MISSION COMPLETE</div><h2 class="title" style="margin:6px 0 0">${MISSIONS.find((m) => m.id === r.missionId)!.codename}</h2>
      <div class="grade">${r.grade}</div>
      <div class="stats">
        <div><span>TIME</span><b>${fmtTime(r.time)}</b></div><div><span>SCORE</span><b>${r.score}${r.newBest ? ' NEW BEST' : ''}</b></div>
        <div><span>KILLS</span><b>${r.kills}</b></div><div><span>ACCURACY</span><b>${r.accuracy}%</b></div>
        <div><span>HEADSHOTS</span><b>${r.headshots}</b></div><div><span>DAMAGE TAKEN</span><b>${Math.round(r.damage)}</b></div>
      </div>
      <div class="row">${r.hasNext ? '<button class="btn primary" id="r-next">Next mission</button>' : ''}<button class="btn" id="r-re">Replay</button><button class="btn" id="r-q">Main menu</button></div>`;
    const b = (id: string, fn: () => void) => { const e = s.querySelector('#' + id) as HTMLElement | null; if (e) e.onclick = () => { audio.uiClick(); fn(); }; };
    b('r-next', () => this.h.next()); b('r-re', () => this.h.replay()); b('r-q', () => this.h.quit());
    this.bind(s);
  }

  endCard(onDone: () => void) {
    const s = this.only('end', 'endcard');
    s.style.background = '#000';
    s.innerHTML = `<div class="tag">OVERWATCH TRANSMISSION  /  ENCRYPTED</div><h1 class="logo" style="font-size:clamp(28px,6vw,70px)">THE PROTOCOL<br/><span>IS RUNNING</span></h1><div class="tag" style="margin-top:34px">SHADOW PROTOCOL  /  TO BE CONTINUED</div>`;
    setTimeout(() => { s.style.background = ''; onDone(); }, 6500);
  }
}
