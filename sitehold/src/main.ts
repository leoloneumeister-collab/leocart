import './style.css';
import { Game, type DebugFlags } from './game/game.ts';

const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
const flags: DebugFlags = {
  debug: q.has('debug'),
  auto: q.has('auto'),
  god: q.has('god'),
  bots: num('bots'),
  money: num('money'),
  round: num('round'),
  seed: num('seed'),
  side: num('side') as 0 | 1 | undefined,
  difficulty: num('diff') as 0 | 1 | 2 | 3 | undefined,
  mode: q.get('mode') === 'dm' ? 'dm' : q.get('mode') === 'comp' ? 'comp' : undefined,
};

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const ui = document.getElementById('ui') as HTMLElement;

function boot() {
  try {
    const game = new Game(canvas, hud, ui, flags);
    if (flags.auto) game.startMatch();
    requestAnimationFrame(() => document.getElementById('boot')?.remove());
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:30px;text-align:center;background:#0b0e12;color:#fff;z-index:99">SITEHOLD could not start. It needs WebGL2, please try a recent Chrome, Edge, Firefox or Safari.<br><small style="opacity:.6">${String(e)}</small></div>`);
  }
}
boot();
