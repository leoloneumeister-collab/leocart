// The app shell: renderer, main loop and the race lifecycle.

import * as THREE from 'three';
import { Input } from './input.js';
import { Race } from './race.js';
import { Hud } from '../ui/hud.js';
import { TRACKS, TRACK_BY_ID } from './tracks/index.js';
import { CHARACTERS, CHARACTER_BY_ID } from './characters.js';
import { settings } from './settings.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.input = new Input();
    this.hud = new Hud(document.getElementById('hud'));
    this.race = null;
    this.last = performance.now();
    this.frameTimes = [];
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const q = settings.quality;
    return q === 'low' ? 1 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.race?.resize(w, h);
  }

  start() {
    const params = new URLSearchParams(location.search);
    const quick = params.get('race');
    if (quick) {
      this.startRace({
        trackId: quick,
        playerId: params.get('char') || 'nova',
        seed: Number(params.get('seed') || 1),
      });
    }
    document.getElementById('boot')?.remove();
    requestAnimationFrame((t) => this.frame(t));
  }

  startRace({ trackId, playerId, seed = 1 }) {
    this.race?.dispose();
    const def = TRACK_BY_ID[trackId];
    const player = CHARACTER_BY_ID[playerId];
    const others = CHARACTERS.filter((c) => c.id !== playerId);
    const entrants = [...others.slice(0, 4).map((c) => ({ char: c, isPlayer: false })), { char: player, isPlayer: true }, ...others.slice(4).map((c) => ({ char: c, isPlayer: false }))];
    this.race = new Race({ renderer: this.renderer, trackDef: def, entrants, quality: settings.quality, seed });
    this.race.resize(window.innerWidth, window.innerHeight);
    this.hud.attach(this.race);
    this.hud.show(true);
  }

  /** Fast-forward the simulation without rendering. Used by the end-to-end tests. */
  advance(seconds, input = null) {
    const step = 1 / 60;
    for (let t = 0; t < seconds; t += step) this.race?.update(step, input || this.input.poll());
    this.hud.update(seconds);
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const input = this.input.poll();
    if (this.race) {
      this.race.update(dt, input);
      this.hud.update(dt);
      this.race.render();
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}
