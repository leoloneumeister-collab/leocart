import { LandingScene } from './scene.js';
import { initMotion } from './motion.js';
import { CHARACTERS } from '../src/game/characters.js';

const STAT_LABELS = [
  ['speed', 'Speed'],
  ['accel', 'Acceleration'],
  ['handling', 'Handling'],
  ['weight', 'Weight'],
];

/** Racer copy and stats come straight from the game's own data so the page cannot drift from it. */
function buildRoster() {
  const list = document.getElementById('roster-list');
  const tabs = document.getElementById('roster-tabs');
  CHARACTERS.forEach((c, i) => {
    const li = document.createElement('article');
    li.className = 'racer';
    li.dataset.index = String(i);
    li.innerHTML = `
      <h3 class="racer-name">${c.name}</h3>
      <p class="racer-species">${c.species}</p>
      <p class="racer-blurb">${c.blurb}</p>
      <ul class="stats">
        ${STAT_LABELS.map(
          ([k, label]) =>
            `<li class="stat"><span class="stat-k">${label}</span><span class="stat-v">${c.stats[k]}</span><span class="bar" style="--v:${c.stats[k]}" aria-hidden="true"></span></li>`,
        ).join('')}
      </ul>`;
    list.appendChild(li);

    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.index = String(i);
    b.textContent = c.name;
    b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    tabs.appendChild(b);
  });
}

/** Same shape as LandingScene so the page still works (without 3D) when WebGL is unavailable. */
function nullScene() {
  return {
    p: { intro: 1, charge: 0, boost: 0, roster: 0 },
    setStage() {},
    celebrate() {},
    start() {},
    stop() {},
  };
}

buildRoster();
window.leocartSite = null;

const canvas = document.getElementById('stage');
let scene;
try {
  scene = new LandingScene(canvas);
} catch (err) {
  console.warn('WebGL is unavailable, showing the page without the 3D stage.', err);
  document.documentElement.classList.add('no-webgl');
  scene = nullScene();
}

window.leocartSite = scene; // handle for tests, like window.leocart in the game
try {
  initMotion({ scene, canvas, racerCount: CHARACTERS.length });
} catch (err) {
  // Never leave the hero hidden if the animation layer fails.
  console.error(err);
  document.documentElement.classList.remove('js-pre');
}
