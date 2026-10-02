// One race: scene, karts, rules (grid, countdown, checkpoints, laps, positions), items,
// AI, effects and camera. The Game owns the renderer and feeds input into update().

import * as THREE from 'three';
import { buildTrackData, posAt } from './trackMath.js';
import { Kart, collideKarts, DRIFT_LEVELS, KART_RADIUS } from './kart.js';
import { AIDriver, AutoPilot } from './ai.js';
import { ItemSystem } from './items.js';
import { THEMES } from './themes.js';
import { KartModel } from '../render/kartModel.js';
import { buildTrackMeshes } from '../render/trackMesh.js';
import { buildScenery } from '../render/scenery.js';
import { skyTexture, blobShadowTexture } from '../render/textures.js';
import { Particles } from '../render/particles.js';
import { ChaseCamera } from '../render/camera.js';
import { mulberry32, clamp } from '../util/math.js';
import { settings } from './settings.js';

const NULL_AUDIO = new Proxy({}, { get: () => () => {} });

const DIFFICULTY = { easy: -0.04, normal: 0, hard: 0.03 };

export const INTRO_TIME = 3.0;
export const COUNTDOWN_TIME = 3.0;

export class Race {
  /**
   * @param {object} o
   * @param {THREE.WebGLRenderer} o.renderer
   * @param {object} o.trackDef
   * @param {Array} o.entrants [{ char, isPlayer }] in grid order (front to back)
   */
  constructor({ renderer, trackDef, entrants, audio, quality = 'high', laps, seed = 1 }) {
    this.renderer = renderer;
    this.audio = audio || NULL_AUDIO;
    this.quality = quality;
    this.rng = mulberry32(seed);
    this.listeners = [];
    this.def = trackDef;
    this.theme = THEMES[trackDef.id];
    this.track = buildTrackData(trackDef);
    this.laps = laps ?? this.track.laps;
    this.state = 'intro';
    this.stateT = 0;
    this.time = 0; // race clock, starts at GO
    this.clock = 0; // wall clock for animation
    this.finishOrder = [];
    this.results = null;
    this.countdownN = 4;
    this.rocketArmed = false;
    this.paused = false;
    this.lastItemPress = false;

    this._buildScene();
    this._buildKarts(entrants);
    this.items = new ItemSystem(this);
    this.cam.snapTo(this.player);
    this.cam.setMode('intro');
    this.cam.introDuration = INTRO_TIME;
  }

  // ------------------------------------------------------------------ setup

  _buildScene() {
    const th = this.theme;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color(th.fog.color);
    scene.fog = new THREE.Fog(th.fog.color, th.fog.near, th.fog.far);

    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 4200);
    this.cam = new ChaseCamera(this.camera);

    const hemi = new THREE.HemisphereLight(th.hemi.sky, th.hemi.ground, th.hemi.intensity);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(th.sunLight.color, th.sunLight.intensity);
    sun.position.set(...th.sunDir.map((v) => v * 120));
    const useShadow = this.quality !== 'low';
    sun.castShadow = useShadow;
    const sh = sun.shadow;
    const size = 48;
    sh.camera.left = -size;
    sh.camera.right = size;
    sh.camera.top = size;
    sh.camera.bottom = -size;
    sh.camera.near = 20;
    sh.camera.far = 320;
    sh.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
    sh.bias = -0.0006;
    sh.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.shadowSize = size;

    // sky
    const skyTex = skyTexture(th);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(2600, 40, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);
    this.sky = sky;

    this.trackGroup = buildTrackMeshes(this.track, th, { maxAniso: Math.min(8, this.renderer.capabilities.getMaxAnisotropy()) });
    scene.add(this.trackGroup);
    this.scenery = buildScenery(this.track, th, this.quality);
    scene.add(this.scenery.group);
    this.followers = [];
    this.scenery.group.traverse((o) => {
      if (o.userData.followCamera) this.followers.push(o);
    });

    this.particles = new Particles(scene, this.quality);
    this.shadowTex = blobShadowTexture();
  }

  _buildKarts(entrants) {
    const t = this.track;
    this.karts = [];
    this.models = [];
    this.drivers = new Map();
    const difficulty = DIFFICULTY[settings.difficulty ?? 'normal'] ?? 0;
    const trackBonus = ((this.def.difficulty ?? 1) - 1) * 0.012;
    entrants.forEach((e, slot) => {
      const row = slot >> 1;
      const side = slot % 2 === 0 ? -1 : 1;
      const s = -(7 + row * 7.5) - (side > 0 ? 3 : 0);
      const lat = side * t.w[0] * 0.2;
      const p = posAt(t, s, lat);
      const kart = new Kart(t, e.char, { isPlayer: e.isPlayer, index: slot });
      kart.placeAt(p.x, p.z, p.h, s);
      kart.gridSlot = slot;
      kart.lapStart = 0;
      kart.rank = 0;
      this.karts.push(kart);
      const model = new KartModel(e.char, { shadowTexture: this.shadowTex });
      model.addTo(this.scene);
      this.models.push(model);
      if (e.isPlayer) this.player = kart;
      else {
        const skill = clamp(e.char.ai.skill + difficulty + trackBonus, 0.85, 1.0);
        this.drivers.set(kart, new AIDriver(kart, t, { skill, aggression: e.char.ai.aggression, seed: 100 + slot * 7 }));
      }
    });
    if (!this.player) this.player = this.karts[0];
    this.updatePositions();
  }

  /** Let the AI drive the player's kart. Used by the end-to-end test and attract mode. */
  setPlayerBot(on) {
    this.playerBot = on ? new AIDriver(this.player, this.track, { skill: 0.95, aggression: 0.6, seed: 77 }) : null;
  }

  on(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  // ------------------------------------------------------------------ events

  /** Kart and item code report everything through here; we add effects and forward to the UI. */
  emit(type, kart, data = {}) {
    const p = this.player;
    const isP = kart === p;
    const aud = this.audio;
    switch (type) {
      case 'driftStart':
        if (isP) aud.sfx('driftStart');
        break;
      case 'driftLevel':
        if (isP) aud.sfx('driftLevel', { rate: 0.9 + data.level * 0.15 });
        break;
      case 'miniTurbo':
        if (isP) {
          this.cam.shake(0.35);
          aud.sfx('miniTurbo');
        } else this._sfx3d('boost', kart, 0.5);
        this.particles.burst(kart.x, 0.8, kart.z, DRIFT_LEVELS[data.level - 1].color, 14, 9, 0.5);
        break;
      case 'boost':
        if (isP && data.duration > 0.8) {
          this.cam.shake(0.3);
        }
        break;
      case 'pad':
        if (isP) {
          aud.sfx('pad');
          this.cam.shake(0.3);
        }
        break;
      case 'wall':
        this.particles.burst(data.x, 0.8, data.z, 0xffd27a, 8, 7, 0.4, 0.22);
        if (isP) {
          this.cam.shake(clamp(data.impact * 0.03, 0.1, 0.5));
          aud.sfx('bump', { gain: clamp(data.impact / 25, 0.3, 1) });
        } else this._sfx3d('bump', kart, 0.5);
        break;
      case 'kartBump':
        this.particles.burst(data.x, 1, data.z, 0xffffff, 6, 5, 0.3, 0.2);
        if (isP || data.other === p) {
          this.cam.shake(clamp(data.impact * 0.03, 0.08, 0.35));
          aud.sfx('bump', { gain: 0.6, rate: 1.3 });
        } else this._sfx3d('bump', kart, 0.4);
        break;
      case 'hit':
        this.particles.burst(kart.x, 1.4, kart.z, 0xffe14a, 18, 9, 0.8, 0.4);
        if (isP) {
          this.cam.shake(1.0);
          aud.sfx('hit');
        } else this._sfx3d('hit', kart, 0.8);
        break;
      case 'shieldBreak':
        this.particles.burst(kart.x, 1.2, kart.z, 0x66e6ff, 20, 10, 0.6, 0.35);
        if (isP) aud.sfx('shieldBreak');
        else this._sfx3d('shieldBreak', kart, 0.7);
        break;
      case 'shield':
        if (isP) aud.sfx('shield');
        break;
      case 'itemGet':
        if (isP) aud.sfx('itemGet');
        break;
      case 'itemReady':
        if (isP) aud.sfx('itemReady');
        break;
      case 'boxBreak':
        this.particles.burst(data.x, 1.6, data.z, 0xffffff, 16, 7, 0.6, 0.35);
        this.particles.burst(data.x, 1.6, data.z, 0x66d0ff, 10, 6, 0.6, 0.3);
        if (isP) aud.sfx('boxBreak');
        else this._sfx3d('boxBreak', kart, 0.5);
        break;
      case 'itemUse':
        if (isP) aud.sfx(data.id === 'bolt' || data.id === 'seeker' ? 'throw' : data.id === 'oil' ? 'oil' : 'boostItem');
        else this._sfx3d(data.id === 'oil' ? 'oil' : data.id === 'turbo' || data.id === 'trio' ? 'boostItem' : 'throw', kart, 0.7);
        if (isP && (data.id === 'turbo' || data.id === 'trio')) this.cam.shake(0.4);
        break;
      case 'cometStart':
        if (isP) {
          aud.sfx('comet');
          this.cam.shake(0.6);
        } else this._sfx3d('comet', kart, 0.8);
        break;
      case 'pulse':
        this.pulseFx = { x: data.x, z: data.z, t: 0 };
        if (isP) aud.sfx('pulse');
        else this._sfx3d('pulse', kart, 0.8);
        break;
      case 'projectileHit':
        this.particles.burst(data.x, 1, data.z, data.type === 'seeker' ? 0xff6a3a : data.type === 'oil' ? 0x9a6bff : 0xffd23f, 16, 9, 0.6);
        break;
      case 'bounce':
        break;
      case 'respawn':
        this.particles.burst(kart.x, 1.2, kart.z, 0x9fe8ff, 14, 6, 0.6);
        break;
      default:
        break;
    }
    for (const fn of this.listeners) fn(type, kart, data);
  }

  _sfx3d(name, kart, gain = 1) {
    const p = this.player;
    const dx = kart.x - p.x;
    const dz = kart.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 70) return;
    const g = clamp(1 - dist / 70, 0, 1) * gain;
    const rx = -Math.cos(p.h);
    const rz = Math.sin(p.h);
    const pan = clamp((dx * rx + dz * rz) / 30, -1, 1);
    this.audio.sfx(name, { gain: g, pan });
  }

  // ------------------------------------------------------------------ rules

  updatePositions() {
    const ks = this.karts.slice();
    ks.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.probe.distance - a.probe.distance;
    });
    ks.forEach((k, i) => {
      k.place = i + 1;
    });
    this.order = ks;
  }

  _lapLogic(k) {
    const t = this.track;
    const L = t.length;
    const d = k.probe.distance;
    const inCorridor = Math.abs(k.probe.lat) < t.w[k.probe.idx] / 2 + t.shoulder + 4;
    while (k.cp < t.checkpoints.length && d >= k.lap * L + t.checkpoints[k.cp].s && inCorridor) {
      k.cp++;
      if (k === this.player) this.emit('checkpoint', k, { index: k.cp });
    }
    if (!k.finished && k.cp >= t.checkpoints.length && d >= (k.lap + 1) * L) {
      k.lap++;
      k.cp = 0;
      const lapTime = this.time - k.lapStart;
      k.lapTimes.push(lapTime);
      k.lapStart = this.time;
      if (k.lap >= this.laps) {
        k.finished = true;
        k.finishTime = this.time;
        this.finishOrder.push(k);
        this.emit('finish', k, { place: this.finishOrder.length, time: k.finishTime });
        if (k === this.player) this._playerFinished();
      } else {
        this.emit('lap', k, { lap: k.lap + 1, lapTime });
        if (k.lap === this.laps - 1) this.emit('finalLap', k);
      }
    }
  }

  _playerFinished() {
    this.state = 'finished';
    this.stateT = 0;
    this.cam.setMode('finish');
    this.particles.confetti(this.player.x, 2, this.player.z, 60);
    this.autoPlayer = new AutoPilot(this.player, this.track, { skill: 0.97 });
  }

  _startRace() {
    this.state = 'racing';
    this.stateT = 0;
    this.time = 0;
    this.cam.setMode('chase');
    for (const k of this.karts) {
      k.frozen = false;
      k.lapStart = 0;
    }
    // rocket start for whoever had the throttle down at the right moment
    if (this.rocketArmed) {
      this.player.boost(1.0, 1.4, this);
      this.emit('rocketStart', this.player);
    }
    for (const [k, drv] of this.drivers) {
      if (this.rng() < (drv.skill - 0.6) * 0.9) k.boost(0.8, 1.35);
    }
    this.emit('go', null);
  }

  // ------------------------------------------------------------------ main loop

  /** @param input snapshot from Input.poll() (or null for hands-off, e.g. menus) */
  update(rawDt, input) {
    const dt = clamp(rawDt, 0, 1 / 20);
    if (this.paused) return;
    this.clock += dt;
    this.stateT += dt;
    const p = this.player;

    // ---- race state machine ----
    if (this.state === 'intro') {
      if (this.stateT >= INTRO_TIME) {
        this.state = 'countdown';
        this.stateT = 0;
        this.countdownN = 4;
      }
    }
    if (this.state === 'countdown') {
      const rem = COUNTDOWN_TIME - this.stateT;
      const n = Math.ceil(rem);
      if (n !== this.countdownN && n >= 1) {
        this.countdownN = n;
        this.emit('countdown', null, { n });
      }
      if (input) {
        if (input.throttle > 0 && !this._thrWas) {
          this.rocketArmed = rem <= 0.6;
        }
        if (input.throttle <= 0) this.rocketArmed = false;
        this._thrWas = input.throttle > 0;
      }
      if (rem <= 0) this._startRace();
    }
    if (this.state === 'racing' || this.state === 'finished') this.time += dt;

    const racing = this.state === 'racing' || this.state === 'finished';

    // ---- controls ----
    if (racing) {
      if (this.playerBot && this.state === 'racing' && p.comet <= 0) {
        this.playerBot.update(dt, this);
        if (p.controls.item && p.item) this.items.tryUse(p, p.controls.back);
      } else if (this.state === 'racing' && p.comet <= 0 && input) {
        const c = p.controls;
        c.steer = input.steer;
        c.throttle = input.throttle;
        c.brake = input.brake;
        c.drift = input.drift;
        if (input.item && p.item) {
          this.items.tryUse(p, input.back);
        }
        if (input.reset && p.spin <= 0 && this.stateT > 1.5) {
          p.respawn(this);
          p.lastResetT = this.clock;
        }
      } else if (p.comet > 0 || this.state === 'finished') {
        if (!this.autoPlayer) this.autoPlayer = new AutoPilot(p, this.track, { skill: 0.97 });
        this.autoPlayer.update(dt, this);
      }
      for (const [k, drv] of this.drivers) {
        if (k.comet > 0) {
          if (!k.auto) k.auto = new AutoPilot(k, this.track, { skill: 0.98 });
          k.auto.update(dt, this);
        } else {
          drv.update(dt, this);
          if (k.controls.item && k.item) this.items.tryUse(k, k.controls.back);
        }
      }
      this._rubberBand();
    } else {
      for (const k of this.karts) {
        k.controls.steer = 0;
        k.controls.throttle = 0;
        k.controls.brake = 0;
        k.controls.drift = false;
      }
    }

    // ---- physics ----
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const k of this.karts) k.update(h, this);
      for (let a = 0; a < this.karts.length; a++) {
        for (let b = a + 1; b < this.karts.length; b++) collideKarts(this.karts[a], this.karts[b], this);
      }
      if (racing) this.items.update(h);
    }
    if (!racing) this.items.update(dt);

    // ---- rules ----
    if (racing) {
      for (const k of this.karts) {
        this._lapLogic(k);
        this._stuckAndWrongWay(k, dt);
      }
      this.updatePositions();
      this._checkDone(dt);
    }

    this._effects(dt);
    this._visuals(dt, input);
  }

  _rubberBand() {
    const p = this.player;
    for (const [k] of this.drivers) {
      if (k.finished) {
        k.rubber = 1;
        continue;
      }
      const d = k.probe.distance - p.probe.distance;
      let r = 1;
      if (d > 30) r = 1 - Math.min(0.05, (d - 30) * 0.0004);
      else if (d < -15) r = 1 + Math.min(0.065, (-d - 15) * 0.0004);
      k.rubber = r;
    }
  }

  _stuckAndWrongWay(k, dt) {
    const t = this.track;
    // reset a kart that has been stationary for too long (bots only: players have the reset key)
    if (!k.isPlayer && !k.finished && k.spin <= 0 && Math.abs(k.speed) < 2 && this.time > 4) {
      k.stuckT += dt;
      if (k.stuckT > 2.5) k.respawn(this);
    } else if (!k.isPlayer) k.stuckT = 0;
    if (k === this.player) {
      const i = k.probe.idx;
      const dot = Math.sin(k.h) * t.tx[i] + Math.cos(k.h) * t.tz[i];
      if (dot < -0.35 && k.speed > 4) k.wrongWayT += dt;
      else k.wrongWayT = Math.max(0, k.wrongWayT - dt * 2);
    }
  }

  _checkDone(dt) {
    if (this.results) return;
    const allDone = this.karts.every((k) => k.finished);
    const playerDone = this.player.finished;
    if (playerDone && (allDone || this.stateT > 12)) {
      this.state = 'done';
      this.stateT = 0;
      this._compileResults();
      this.emit('done', null, { results: this.results });
    }
  }

  _compileResults() {
    this.updatePositions();
    this.results = this.order.map((k, i) => ({
      kart: k,
      place: i + 1,
      char: k.char,
      isPlayer: k.isPlayer,
      finished: k.finished,
      time: k.finished ? k.finishTime : Infinity,
      bestLap: k.lapTimes.length ? Math.min(...k.lapTimes) : Infinity,
      distance: k.probe.distance,
    }));
  }

  /** Skip straight to results (used by the quit/skip button after finishing). */
  forceDone() {
    if (!this.results) {
      this.state = 'done';
      this._compileResults();
      this.emit('done', null, { results: this.results });
    }
  }

  // ------------------------------------------------------------------ effects and rendering

  _effects(dt) {
    const P = this.particles;
    const th = this.theme;
    for (const k of this.karts) {
      const fx = Math.sin(k.h);
      const fz = Math.cos(k.h);
      const rx = -fz;
      const rz = fx;
      const speed = Math.hypot(k.vx, k.vz);
      if (k.drifting) {
        const lvl = k.driftLevel;
        const col = lvl > 0 ? DRIFT_LEVELS[lvl - 1].color : 0xffffff;
        for (const s of [-1, 1]) {
          const bx = k.x - fx * 1.25 + rx * s * 0.95;
          const bz = k.z - fz * 1.25 + rz * s * 0.95;
          P.spark(bx, 0.25, bz, -fx * 4 + rx * s * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2, 3 + Math.random() * 3, -fz * 4 + rz * s * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2, col, 0.32, lvl > 0 ? 0.34 : 0.2);
        }
        if (Math.random() < 0.6) P.smoke(k.x - fx * 1.3 + rx * (Math.random() - 0.5) * 2, 0.3, k.z - fz * 1.3 + rz * (Math.random() - 0.5) * 2, -fx * 2, 1, -fz * 2, 0xe8e8e8, 0.6, 1.0, 0.32);
      }
      if (k.surface !== 'road' && speed > 7 && Math.random() < Math.min(1, speed / 25)) {
        const col = th.id === 'meadow' ? 0x7fb35a : th.id === 'dunes' ? 0xe8c08a : 0x7a7f99;
        P.smoke(k.x - fx * 1.2 + rx * (Math.random() - 0.5) * 1.6, 0.3, k.z - fz * 1.2 + rz * (Math.random() - 0.5) * 1.6, -fx * 1.5 + (Math.random() - 0.5) * 2, 1.2, -fz * 1.5 + (Math.random() - 0.5) * 2, col, 0.8, 1.1, 0.45);
      }
      if (k.boostTimer > 0 || k.comet > 0) {
        for (const s of [-1, 1]) {
          P.flame(k.x - fx * 2.1 + rx * s * 0.38, 0.65, k.z - fz * 2.1 + rz * s * 0.38, -fx * 6, 0.4, -fz * 6, k.comet > 0 ? 0xffe066 : 0xff9a3a, 0.26, k.comet > 0 ? 1.1 : 0.8);
        }
      }
      if (k.spin > 0 && Math.random() < 0.5) {
        const a = Math.random() * 6.28;
        P.spark(k.x + Math.cos(a) * 1.2, 2.4 + Math.random(), k.z + Math.sin(a) * 1.2, Math.cos(a) * 2, 2, Math.sin(a) * 2, 0xffe14a, 0.5, 0.38);
      }
    }
    if (this.pulseFx) {
      this.pulseFx.t += dt;
      const r = this.pulseFx.t * 90;
      const n = 28;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        P.glow(this.pulseFx.x + Math.cos(a) * r, 0.8, this.pulseFx.z + Math.sin(a) * r, 0x5dffb0, 0.18, 3);
      }
      if (this.pulseFx.t > 0.9) this.pulseFx = null;
    }
    P.update(dt);
  }

  _visuals(dt, input) {
    const t = this.clock;
    for (let i = 0; i < this.karts.length; i++) this.models[i].update(dt, this.karts[i], t);
    this.items.shells.visible = true;
    this.scenery.update(dt, t);
    if (this.trackGroup.userData.animated.boostTexture) {
      this.trackGroup.userData.animated.boostTexture.offset.y = -((t * 1.4) % 1);
    }
    this.cam.update(dt, this.player, { lookBack: !!(input && input.look) && this.state === 'racing' });
    this._lights();
  }

  _lights() {
    const p = this.player;
    const cam = this.camera;
    // shadow frustum follows the player, snapped to texel steps so shadows don't shimmer
    const sd = this.theme.sunDir;
    const texel = (this.shadowSize * 2) / this.sun.shadow.mapSize.x;
    const sx = Math.round(p.x / texel) * texel;
    const sz = Math.round(p.z / texel) * texel;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + sd[0] * 140, sd[1] * 140, sz + sd[2] * 140);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(cam.position);
    for (const f of this.followers) f.position.copy(cam.position);
  }

  render() {
    const r = this.renderer;
    this.particles.setScale(r, this.camera);
    r.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.items.dispose();
    for (const m of this.models) {
      m.removeFrom(this.scene);
      m.dispose();
    }
    this.scenery.dispose();
    this.trackGroup.userData.dispose();
    this.shadowTex.dispose();
    this.scene.traverse((o) => {
      if (o.geometry && !o.isInstancedMesh) o.geometry.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        m.map?.dispose?.();
        m.dispose?.();
      });
    });
    this.scene.clear();
  }
}
