import './style.css';
import { AudioEngine } from './audio/audio.ts';
import { Game } from './game.ts';
import { grantXp, killUnit } from './sim/core.ts';
import { stepWorld } from './sim/match.ts';
import { Menu } from './ui/screens.ts';
import type { MenuChoice } from './ui/screens.ts';

const app = document.getElementById('app')!;
const audio = new AudioEngine();
const params = new URLSearchParams(location.search);

const KEY = 'lanefall.choice';
const defaults: MenuChoice = { champion: 'ironvow', lane: 'top', difficulty: 'normal', quality: 'medium', fog: true };

function loadChoice(): MenuChoice {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...defaults };
}

function saveChoice(c: MenuChoice) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

declare global {
  interface Window {
    __game?: Game;
    /** Small debug and test API (headless smoke tests drive the sim with it). */
    __api?: { stepWorld: typeof stepWorld; grantXp: typeof grantXp; killUnit: typeof killUnit };
  }
}
window.__api = { stepWorld, grantXp, killUnit };

function startGame(choice: MenuChoice, slice = false) {
  saveChoice(choice);
  app.innerHTML = '';
  const game = new Game(app, choice, audio, showMenu, { slice });
  window.__game = game;
}

function showMenu() {
  window.__game = undefined;
  app.innerHTML = '';
  new Menu(app, (c) => startGame(c), loadChoice());
}

if (params.get('gallery') === '1') {
  void import('./gallery.ts').then((m) => m.startGallery(app));
} else if (params.get('auto') === '1') {
  const c = loadChoice();
  startGame(
    {
      champion: params.get('champion') ?? c.champion,
      lane: (params.get('lane') as MenuChoice['lane']) ?? c.lane,
      difficulty: (params.get('difficulty') as MenuChoice['difficulty']) ?? c.difficulty,
      quality: (params.get('quality') as MenuChoice['quality']) ?? 'low',
      fog: params.get('fog') !== '0',
    },
    params.get('slice') === '1',
  );
} else {
  showMenu();
}
