/** Menu, controls, pause and end-of-match screens. */
import { CHAMPION_IDS, CHAMPIONS } from '../data/champions.ts';
import type { Difficulty, Lane } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { el, fmtNum, fmtTime } from './dom.ts';
import { abilityIconSvg, champIconSvg } from './icons.ts';

export interface MenuChoice {
  champion: string;
  lane: Lane;
  difficulty: Difficulty;
  quality: 'low' | 'medium' | 'high';
  fog: boolean;
}

const CONTROLS: [string, string][] = [
  ['Right click', 'Move, or attack the enemy under the cursor'],
  ['Q W E R', 'Cast abilities at the cursor (hold to preview range)'],
  ['Shift + Q/W/E/R', 'Spend a skill point (or click the + above an ability). Ctrl does not work in browsers: Ctrl+W closes the tab'],
  ['A, then left click', 'Attack-move: walk and attack whatever you meet'],
  ['S', 'Stop'],
  ['B', 'Recall to base (8 seconds, interrupted by damage or moving)'],
  ['P', 'Open the shop (only while in your base)'],
  ['Tab (hold)', 'Scoreboard'],
  ['Space (hold)', 'Center the camera on your champion'],
  ['Y', 'Toggle camera lock (locked by default, unlock to pan with the screen edges)'],
  ['Mouse to screen edge / arrows', 'Pan the camera'],
  ['Mouse wheel / + -', 'Zoom'],
  ['Minimap', 'Left click moves the camera, right click moves your champion'],
  ['Esc', 'Pause'],
  [']', 'Debug: cycle game speed x1, x2, x4, x8'],
];

export function controlsHtml(): string {
  return `<div class="controls">${CONTROLS.map(([k, v]) => `<div class="ctl-row"><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div>`;
}

export class Menu {
  readonly root: HTMLElement;
  private choice: MenuChoice;
  private detail!: HTMLElement;
  private cards = new Map<string, HTMLElement>();
  private onStart: (c: MenuChoice) => void;

  constructor(parent: HTMLElement, onStart: (c: MenuChoice) => void, initial: MenuChoice) {
    this.onStart = onStart;
    this.choice = { ...initial };
    this.root = el('div', 'menu', '', parent);
    const wrap = el('div', 'menu-wrap', '', this.root);
    el('div', 'logo', 'LANEFALL', wrap);
    el('div', 'tagline', 'Five against five. Three lanes. One nexus. Play it right here on localhost.', wrap);

    const body = el('div', 'menu-body', '', wrap);
    const left = el('div', 'menu-left', '', body);
    el('h3', '', '1. Choose your champion', left);
    const grid = el('div', 'champ-grid', '', left);
    for (const id of CHAMPION_IDS) {
      const d = CHAMPIONS[id];
      const card = el('div', 'champ-card', '', grid);
      el('div', 'cc-ico', champIconSvg(d.name[0], d.look.primary, d.look.accent), card);
      el('div', 'cc-name', d.name, card);
      el('div', 'cc-role', d.role, card);
      card.addEventListener('click', () => {
        this.choice.champion = id;
        this.render();
      });
      this.cards.set(id, card);
    }
    this.detail = el('div', 'champ-detail', '', left);

    const right = el('div', 'menu-right', '', body);
    el('h3', '', '2. Pick your lane', right);
    this.options(right, 'lane', [
      ['top', 'Top'],
      ['mid', 'Mid'],
      ['bot', 'Bot'],
    ]);
    el('h3', '', '3. Bot difficulty', right);
    this.options(right, 'difficulty', [
      ['easy', 'Easy'],
      ['normal', 'Normal'],
      ['hard', 'Hard'],
    ]);
    el('h3', '', 'Graphics', right);
    this.options(right, 'quality', [
      ['low', 'Low'],
      ['medium', 'Medium'],
      ['high', 'High'],
    ]);
    el('h3', '', 'Fog of war', right);
    this.options(right, 'fog', [
      ['on', 'On'],
      ['off', 'Off'],
    ]);
    const start = el('button', 'start-btn', 'Start match', right);
    start.id = 'start-btn';
    start.addEventListener('click', () => this.onStart({ ...this.choice }));
    const ctl = el('button', 'link-btn', 'Controls', right);
    ctl.addEventListener('click', () => {
      const m = el('div', 'modal', `<div class="modal-card"><h3>Controls</h3>${controlsHtml()}<button class="start-btn small" id="ctl-close">Close</button></div>`, this.root);
      m.querySelector('#ctl-close')!.addEventListener('click', () => m.remove());
    });
    el('div', 'legal', 'LANEFALL is an original game. It is an unofficial fan project in the MOBA genre and is not affiliated with, endorsed or sponsored by Riot Games.', wrap);
    this.render();
  }

  private options(parent: HTMLElement, key: 'lane' | 'difficulty' | 'quality' | 'fog', opts: [string, string][]) {
    const row = el('div', 'opt-row', '', parent);
    row.dataset.key = key;
    for (const [val, label] of opts) {
      const b = el('button', 'opt', label, row);
      b.dataset.val = val;
      b.addEventListener('click', () => {
        if (key === 'fog') this.choice.fog = val === 'on';
        else (this.choice as unknown as Record<string, string>)[key] = val;
        this.render();
      });
    }
  }

  private render() {
    for (const [id, card] of this.cards) card.classList.toggle('sel', id === this.choice.champion);
    for (const row of this.root.querySelectorAll<HTMLElement>('.opt-row')) {
      const key = row.dataset.key as keyof MenuChoice;
      const cur = key === 'fog' ? (this.choice.fog ? 'on' : 'off') : String(this.choice[key]);
      for (const b of row.querySelectorAll<HTMLElement>('.opt')) b.classList.toggle('sel', b.dataset.val === cur);
    }
    const d = CHAMPIONS[this.choice.champion];
    this.detail.innerHTML = `<div class="cd-head"><b>${d.name}</b> <i>${d.title}</i></div><div class="cd-blurb">${d.blurb}</div><div class="cd-passive"><span>${d.passive.name}</span> ${d.passive.desc}</div><div class="cd-abilities">${d.abilities
      .map((a, i) => `<div class="cd-ab"><div class="cd-ab-ico">${abilityIconSvg(a.icon, a.color)}</div><div><b>${['Q', 'W', 'E', 'R'][i]} ${a.name}</b><br><small>${a.desc}</small></div></div>`)
      .join('')}</div>`;
  }
}

export class EndScreen {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement, w: World, playerTeam: 0 | 1, onAgain: () => void) {
    this.root = el('div', 'endscreen', '', parent);
    const win = w.winner === playerTeam;
    const card = el('div', 'end-card ' + (win ? 'win' : 'lose'), '', this.root);
    el('div', 'end-title', win ? 'VICTORY' : 'DEFEAT', card);
    el('div', 'end-sub', `${fmtTime(w.time)} &middot; ${w.teamKills[0]} - ${w.teamKills[1]} kills &middot; towers ${w.teamTowers[0]} - ${w.teamTowers[1]}`, card);
    const rows = (team: 0 | 1) =>
      w.champions
        .filter((c) => c.team === team)
        .map((c) => {
          const cc = c.champ!;
          const d = CHAMPIONS[c.defId];
          return `<tr class="${c.champ!.isPlayer ? 'you' : ''}"><td><span class="sb-ico">${champIconSvg(d.name[0], d.look.primary, d.look.accent)}</span>${d.name}</td><td>${cc.level}</td><td>${cc.kills}/${cc.deaths}/${cc.assists}</td><td>${cc.cs}</td><td>${fmtNum(cc.damageDealt)}</td><td>${fmtNum(cc.totalGold)}</td></tr>`;
        })
        .join('');
    const head = '<tr><th>Champion</th><th>Lv</th><th>K/D/A</th><th>CS</th><th>Damage</th><th>Gold</th></tr>';
    el('div', 'end-tables', `<table class="sb blue"><caption>Blue team</caption>${head}${rows(0)}</table><table class="sb red"><caption>Red team</caption>${head}${rows(1)}</table>`, card);
    const btn = el('button', 'start-btn', 'Play again', card);
    btn.id = 'again-btn';
    btn.addEventListener('click', () => onAgain());
  }
}

export class PauseScreen {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement, onResume: () => void, onQuit: () => void, volume: number, onVolume: (v: number) => void) {
    this.root = el('div', 'pause hidden', '', parent);
    const card = el('div', 'pause-card', '<h2>Paused</h2>', this.root);
    const resume = el('button', 'start-btn', 'Resume', card);
    resume.addEventListener('click', onResume);
    const vol = el('label', 'vol', 'Volume <input type="range" min="0" max="100" value="' + Math.round(volume * 100) + '">', card);
    vol.querySelector('input')!.addEventListener('input', (e) => onVolume(Number((e.target as HTMLInputElement).value) / 100));
    el('div', '', controlsHtml(), card);
    const quit = el('button', 'link-btn', 'Quit to menu', card);
    quit.addEventListener('click', onQuit);
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }
}
