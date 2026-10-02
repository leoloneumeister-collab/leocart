// The app shell: renderer, main loop, menus and the race / cup lifecycle.

import * as THREE from 'three';
import { Input } from './input.js';
import { Race } from './race.js';
import { Hud } from '../ui/hud.js';
import { UI } from '../ui/screens.js';
import { Nav } from '../ui/nav.js';
import { MenuScene } from '../render/menuScene.js';
import { AudioEngine } from '../audio/engine.js';
import { TRACKS, TRACK_BY_ID } from './tracks/index.js';
import { CHARACTERS, CHARACTER_BY_ID, POINTS } from './characters.js';
import { THEMES } from './themes.js';
import { settings, saveSettings, recordResult } from './settings.js';
import { mulberry32 } from '../util/math.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    // MSAA is wasted work on high-DPI screens, where the extra pixels already hide the jaggies
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 1.75, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.audio = new AudioEngine();
    this.input = new Input();
    this.hud = new Hud(document.getElementById('hud'));
    this.hud.onTick = () => this.audio.sfx('move', { gain: 0.5 });
    const uiRoot = document.getElementById('ui');
    this.nav = new Nav(uiRoot, { onSound: (n) => this.audio.sfx(n) });
    this.ui = new UI(uiRoot, { audio: this.audio, input: this.input, nav: this.nav });
    this.menu = new MenuScene(this.renderer);

    this.fade = document.createElement('div');
    this.fade.id = 'fade';
    document.body.appendChild(this.fade);

    this.race = null;
    this.mode = 'menu'; // 'menu' | 'race'
    this.paused = false;
    this.cup = null;
    this.busy = false;
    this.last = performance.now();
    this.resScale = 1;
    this.perf = { acc: 0, frames: 0, avg: 16 };

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'race' && !this.paused && this.race?.state !== 'done') this.pause(true);
    });
    this.resize();
  }

  // ------------------------------------------------------------------ setup

  get pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const q = settings.quality;
    const base = q === 'low' ? 1 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    return base * this.resScale;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.race?.resize(w, h);
    this.menu.resize(w, h);
    // resizing clears the canvas; draw straight away so there is no blank flash
    if (this.mode === 'race' && this.race) this.race.render();
    else if (this.mode === 'menu') this.menu.render();
  }

  start() {
    const params = new URLSearchParams(location.search);
    const quick = params.get('race');
    document.getElementById('boot')?.remove();
    if (quick && TRACK_BY_ID[quick]) {
      this.beginRace({
        trackId: quick,
        playerId: params.get('char') || 'nova',
        seed: Number(params.get('seed') || 1),
      });
    } else {
      this.showTitle();
    }
    if (window.matchMedia?.('(pointer: coarse)').matches && !navigator.getGamepads?.().some((p) => p)) {
      setTimeout(() => this.ui.toast('Best played on desktop with a keyboard or gamepad', 4200), 800);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  async transition(fn) {
    this.fade.classList.add('on');
    await sleep(230);
    await fn();
    await sleep(60);
    this.fade.classList.remove('on');
  }

  // ------------------------------------------------------------------ menu screens

  _leaveRace() {
    this.audio.stopEngines();
    this.race?.dispose();
    this.race = null;
    this.hud.detach();
    this.hud.show(false);
    this.mode = 'menu';
    this.paused = false;
    this.nav.setActive(true);
  }

  showTitle() {
    this._leaveRace();
    this.cup = null;
    this.menu.setMode('title');
    this.audio.startMusic('menu');
    this.ui.title({
      onCup: () => this.showSelect('cup'),
      onSingle: () => this.showSelect('single'),
      onHow: () => this.ui.howto({ onBack: () => this.showTitle() }),
      onSettings: () => this.ui.settings({ onBack: () => this.showTitle(), onChange: (k) => this.onSettingChanged(k) }),
    });
  }

  showSelect(mode) {
    this.menu.setMode('select');
    const idx = Math.max(0, CHARACTERS.findIndex((c) => c.id === settings.lastCharacter));
    this.ui.select({
      mode,
      selected: idx,
      onPreview: (i) => this.menu.select(i),
      onPick: (id) => {
        settings.lastCharacter = id;
        saveSettings();
        if (mode === 'cup') this.startCup(id);
        else this.showTracks(id);
      },
      onBack: () => this.showTitle(),
    });
    this.menu.select(idx);
  }

  showTracks(charId) {
    this.menu.setMode('title');
    this.ui.tracks({
      onPick: (trackId) => this.beginRace({ trackId, playerId: charId }),
      onBack: () => this.showSelect('single'),
    });
  }

  onSettingChanged(key) {
    if (['master', 'music', 'sfx'].includes(key)) this.audio.applyVolumes();
    if (key === 'quality') this.resize();
  }

  // ------------------------------------------------------------------ cup

  startCup(charId) {
    this.cup = {
      charId,
      index: 0,
      tracks: TRACKS.map((t) => t.id),
      totals: Object.fromEntries(CHARACTERS.map((c) => [c.id, 0])),
      lastPlace: Object.fromEntries(CHARACTERS.map((c) => [c.id, 6])),
    };
    this.beginRace({ trackId: this.cup.tracks[0], playerId: charId });
  }

  _gridOrder(playerId, seed) {
    const rng = mulberry32(seed * 7919 + 3);
    if (this.cup && this.cup.index > 0) {
      // later cup races: the points leader starts at the front
      return [...CHARACTERS].sort((a, b) => this.cup.totals[b.id] - this.cup.totals[a.id] || this.cup.lastPlace[a.id] - this.cup.lastPlace[b.id]).map((c) => c.id);
    }
    const others = CHARACTERS.filter((c) => c.id !== playerId).map((c) => c.id);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    others.splice(4, 0, playerId); // the player starts fifth: room to make up places
    return others;
  }

  // ------------------------------------------------------------------ race lifecycle

  async beginRace({ trackId, playerId, seed }) {
    if (this.busy) return;
    this.busy = true;
    this.lastRaceArgs = { trackId, playerId, seed };
    const s = seed ?? 1 + Math.floor(Math.random() * 100000);
    await this.transition(async () => {
      this.ui.clear();
      this.ui.loading(`Loading ${TRACK_BY_ID[trackId].name}…`);
      await sleep(40); // let the loading card paint before the heavy build
      this._leaveRace();
      const def = TRACK_BY_ID[trackId];
      const order = this._gridOrder(playerId, s);
      const entrants = order.map((id) => ({ char: CHARACTER_BY_ID[id], isPlayer: id === playerId }));
      this.race = new Race({ renderer: this.renderer, trackDef: def, entrants, audio: this.audio, quality: settings.quality, seed: s });
      this.race.resize(window.innerWidth, window.innerHeight);
      this.race.on((type, kart, data) => this._onRaceEvent(type, kart, data));
      this.hud.attach(this.race);
      this.hud.show(true);
      this.mode = 'race';
      this.paused = false;
      this.nav.setActive(false);
      this.ui.clear();
      this.audio.startMusic(THEMES[trackId].music);
      this.audio.startEngines(this.race.karts, this.race.karts.indexOf(this.race.player));
    });
    this.busy = false;
  }

  _onRaceEvent(type, kart, data) {
    const a = this.audio;
    switch (type) {
      case 'countdown':
        a.sfx('count');
        break;
      case 'go':
        a.sfx('go');
        break;
      case 'lap':
        if (kart === this.race.player) a.sfx('lap');
        break;
      case 'finalLap':
        if (kart === this.race.player) {
          a.sfx('finalLap');
          a.setMusicTempo(1.08);
        }
        break;
      case 'finish':
        if (kart === this.race.player) a.sfx('finish');
        break;
      case 'respawn':
        a.sfx('respawn');
        break;
      case 'done':
        setTimeout(() => this._onRaceDone(data.results), 900);
        break;
      default:
        break;
    }
  }

  _onRaceDone(results) {
    if (this.mode !== 'race' || !this.race || this.race.results !== results) return;
    const race = this.race;
    this.audio.stopEngines();
    this.audio.stopMusic(0.8);
    this.nav.setActive(true);
    const player = results.find((r) => r.isPlayer);
    const rec = recordResult(race.def.id, player.time, player.bestLap);
    this.audio.sfx(player.place <= 3 ? 'winJingle' : 'loseJingle');

    const rows = results.map((r) => ({ ...r, points: POINTS[r.place - 1] ?? 0 }));
    let cupInfo = null;
    if (this.cup) {
      for (const r of rows) {
        this.cup.totals[r.char.id] += r.points;
        this.cup.lastPlace[r.char.id] = r.place;
        r.total = this.cup.totals[r.char.id];
      }
      const nextId = this.cup.tracks[this.cup.index + 1];
      cupInfo = {
        index: this.cup.index,
        total: this.cup.tracks.length,
        last: !nextId,
        nextName: nextId ? TRACK_BY_ID[nextId].name : '',
      };
    }
    const trackName = race.def.name;
    const args = this.lastRaceArgs;
    this.hud.show(false);
    this.menu.setMode('title');
    this.mode = 'menu';
    this.audio.startMusic('menu');
    this.ui.results({
      results: rows,
      trackName,
      cup: cupInfo,
      records: rec,
      onNext: () => {
        if (this.cup) {
          if (cupInfo.last) this.showCupFinal();
          else {
            this.cup.index++;
            this.beginRace({ trackId: this.cup.tracks[this.cup.index], playerId: this.cup.charId });
          }
        } else {
          this.beginRace({ trackId: args.trackId, playerId: args.playerId });
        }
      },
      onRetry: () => this.beginRace({ trackId: args.trackId, playerId: args.playerId }),
      onTrackSelect: () => this.showTracks(args.playerId),
      onMenu: () => this.showTitle(),
    });
    // keep the race scene alive behind the results? No: swap to the showroom to save GPU and memory.
    this._leaveRaceKeepAudio();
  }

  _leaveRaceKeepAudio() {
    this.race?.dispose();
    this.race = null;
    this.hud.detach();
  }

  showCupFinal() {
    const standings = CHARACTERS.map((c) => ({ char: c, points: this.cup.totals[c.id] })).sort(
      (a, b) => b.points - a.points || this.cup.lastPlace[a.char.id] - this.cup.lastPlace[b.char.id],
    );
    const order = standings.map((s) => CHARACTERS.indexOf(s.char));
    this.menu.setMode('podium', false, order);
    this.menu.celebrate();
    const playerId = this.cup.charId;
    this.audio.sfx('winJingle');
    this.ui.cupFinal({
      standings,
      playerId,
      onAgain: () => this.startCup(playerId),
      onMenu: () => this.showTitle(),
    });
    this._confetti = 0;
  }

  // ------------------------------------------------------------------ pause

  pause(on) {
    if (this.mode !== 'race' || !this.race) return;
    if (this.race.state === 'done') return;
    if (on === this.paused) return;
    this.paused = on;
    this.race.paused = on;
    this.nav.setActive(on);
    if (on) {
      this.audio.sfx('click');
      this.audio.pause(true);
      this._pauseMenu();
    } else {
      this.ui.closeModal();
      this.audio.pause(false);
    }
  }

  _pauseMenu() {
    this.ui.pause({
      onResume: () => this.pause(false),
      onRestart: () => {
        this.paused = false;
        this.audio.pause(false);
        const a = this.lastRaceArgs;
        this.ui.closeModal();
        this.beginRace({ trackId: a.trackId, playerId: a.playerId, seed: a.seed });
      },
      onSettings: () =>
        this.ui.settings({
          modal: true,
          onBack: () => this._pauseMenu(),
          onChange: (k) => this.onSettingChanged(k),
        }),
      onQuit: () => {
        this.audio.pause(false);
        this.ui.closeModal();
        this.transition(() => this.showTitle());
      },
    });
  }

  // ------------------------------------------------------------------ main loop

  /** Fast-forward the simulation without rendering. Used by the end-to-end tests. */
  advance(seconds, input = null) {
    const step = 1 / 60;
    for (let t = 0; t < seconds; t += step) this.race?.update(step, input || this.input.poll(step));
    if (this.race) this.hud.update(seconds);
  }

  _adaptResolution(dtMs) {
    // keep frame time under ~18 ms by trading resolution; recover when there is headroom
    const p = this.perf;
    p.acc += dtMs;
    p.frames++;
    if (p.acc >= 1500) {
      const avg = p.acc / p.frames;
      p.avg = avg;
      p.acc = 0;
      p.frames = 0;
      if (this.mode === 'race' && !this.paused && this.race?.state !== 'intro') {
        if (avg > 21 && this.resScale > 0.55) {
          this.resScale = Math.max(0.55, this.resScale - 0.15);
          this.resize();
        } else if (avg < 13.5 && this.resScale < 1) {
          this.resScale = Math.min(1, this.resScale + 0.1);
          this.resize();
        }
      }
    }
  }

  frame(now) {
    const dtMs = now - this.last;
    const dt = Math.min(0.1, dtMs / 1000);
    this.last = now;
    const input = this.input.poll(dt);

    if (this.mode === 'race' && this.race) {
      if (input.pause && this.race.state !== 'done' && !this.busy) this.pause(!this.paused);
      if (!this.paused) {
        if (this.race.state === 'finished' && input.item) this.race.forceDone();
        this.race.update(dt, input);
        this.hud.update(dt);
        this.audio.updateEngines(this.race.player, this.race);
        if (this.race.player.wrongWayT > 1.1 && !this._wrongBeep) {
          this._wrongBeep = true;
          this.audio.sfx('wrongWay');
        } else if (this.race.player.wrongWayT < 0.3) this._wrongBeep = false;
      } else {
        this.nav.pollPad(dt);
      }
      this.race.render();
      this._adaptResolution(dtMs);
    } else {
      this.menu.update(dt);
      this.menu.render();
      this.nav.pollPad(dt);
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}
