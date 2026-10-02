import * as THREE from 'three';
import { audio } from '../../engine/audio';
import { clamp, damp, lerp, rand } from '../../engine/util';
import type { Game } from '../game';
import { WEAPONS, WeaponDef, WeaponId } from './defs';

export interface WState { def: WeaponDef; mag: number; reserve: number }

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();

export class WeaponSystem {
  slots: WState[];
  cur = 0;
  equipT = 1;
  reloadT = -1;
  reloadElapsed = 0;
  reloadTotal = 1;
  private reloadStage = 0;
  private shellsToLoad = 0;
  ads = 0;
  fireCd = 0;
  bloom = 0;
  sustain = 0;
  private prevFire = false;
  private meleeCd = 0;
  spread = 0;
  private lastShotAt = 0;
  private pendingPump = false;
  private pumpAt = -1;

  constructor(private game: Game, loadout: WeaponId[]) {
    this.slots = loadout.map((id) => ({ def: WEAPONS[id], mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve }));
    this.game.viewmodel.setWeapon(this.slots[0].def.id);
  }

  get cw() { return this.slots[this.cur]; }
  get def() { return this.slots[this.cur].def; }
  get reloading() { return this.reloadT >= 0; }

  addAmmo(frac = 0.6) {
    for (const s of this.slots) s.reserve = Math.min(s.def.reserve + s.def.mag, s.reserve + Math.ceil(s.def.reserve * frac));
  }

  switchTo(i: number) {
    if (i === this.cur || i < 0 || i >= this.slots.length) return;
    this.cur = i;
    this.equipT = 0; this.reloadT = -1; this.pendingPump = false;
    this.game.viewmodel.setWeapon(this.slots[i].def.id);
    audio.click(600, 0.06, 0.4);
    this.game.hud.setWeapon(this.slots[i]);
  }

  startReload() {
    const s = this.cw;
    if (this.reloading || s.mag >= s.def.mag || s.reserve <= 0 || this.equipT < 0.7) return;
    this.reloadT = 0; this.reloadElapsed = 0; this.reloadStage = 0;
    if (s.def.shellReload) {
      this.shellsToLoad = Math.min(s.def.mag - s.mag, s.reserve);
      this.reloadTotal = this.shellsToLoad * s.def.reloadTime + 0.55;
    } else this.reloadTotal = s.def.reloadTime;
  }

  private finishReload() {
    const s = this.cw;
    if (!s.def.shellReload) {
      const need = s.def.mag - s.mag;
      const take = Math.min(need, s.reserve);
      s.mag += take; s.reserve -= take;
    }
    this.reloadT = -1;
    this.game.hud.setWeapon(s);
  }

  update(dt: number) {
    const g = this.game, inp = g.input, p = g.player, s = this.cw, def = s.def;
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.equipT = Math.min(1, this.equipT + dt / 0.42);

    // switching input
    if (inp.pressed('Digit1')) this.switchTo(0);
    if (inp.pressed('Digit2')) this.switchTo(1);
    if (inp.pressed('KeyQ') || inp.wheel !== 0 || inp.touchSwitch) { this.switchTo((this.cur + 1) % this.slots.length); inp.touchSwitch = false; }
    if (inp.pressed('KeyR') || inp.touchReload) { this.startReload(); inp.touchReload = false; }
    if ((inp.pressed('KeyF') || inp.touchKnife) && this.meleeCd <= 0) { this.melee(); inp.touchKnife = false; }

    // reload progress
    if (this.reloading) {
      this.reloadElapsed += dt;
      this.reloadT = clamp(this.reloadElapsed / this.reloadTotal, 0, 1);
      if (def.shellReload) {
        const loaded = Math.floor(this.reloadElapsed / def.reloadTime);
        const target = Math.min(this.shellsToLoad, loaded);
        while (this.reloadStage < target) {
          this.reloadStage++; s.mag++; s.reserve--; audio.reload('shell');
          g.hud.setWeapon(s);
        }
        if (this.reloadElapsed >= this.reloadTotal) { audio.reload('pump'); this.finishReload(); }
      } else {
        const t = this.reloadT;
        if (this.reloadStage === 0 && t > 0.22) { this.reloadStage = 1; audio.reload('out'); }
        if (this.reloadStage === 1 && t > 0.6) { this.reloadStage = 2; audio.reload('in'); }
        if (this.reloadStage === 2 && t > 0.8) { this.reloadStage = 3; audio.reload('bolt'); }
        if (t >= 1) this.finishReload();
      }
    }

    // ads
    const wantAds = inp.ads && !p.sprinting && !this.reloading && this.equipT > 0.6 && p.alive;
    const adsTime = def.adsTime;
    this.ads = clamp(this.ads + (wantAds ? 1 : -1) * dt / adsTime, 0, 1);

    // firing
    const fireDown = inp.fire && p.alive && !g.frozen;
    const edge = fireDown && !this.prevFire;
    this.prevFire = fireDown;
    if (fireDown && this.equipT > 0.65 && !p.sprinting) {
      const canInterrupt = def.shellReload && this.reloading && this.reloadStage > 0;
      if ((!this.reloading || canInterrupt) && this.fireCd <= 0 && (def.auto || edge)) {
        if (s.mag > 0) {
          if (canInterrupt) { this.finishReload(); }
          this.shoot();
        } else if (edge || def.auto) {
          if (s.reserve > 0) this.startReload();
          else if (edge) { audio.dry(); g.hud.flashMessage('NO AMMO'); }
          else if (this.fireCd <= 0) { audio.dry(); this.fireCd = 0.3; }
        }
      }
    }
    if (this.pendingPump && g.time >= this.pumpAt) {
      this.pendingPump = false;
      audio.reload('pump');
    }
    // sustain & bloom decay
    if (g.time - this.lastShotAt > 0.18) this.sustain = Math.max(0, this.sustain - dt * 9);
    this.bloom = damp(this.bloom, 0, 5, dt);

    // spread for crosshair
    const move = clamp(p.speed / 6, 0, 1) * (p.sprinting ? 1.4 : 1);
    const base = lerp(def.hipSpread, def.adsSpread, this.ads);
    this.spread = base * (1 + move * 1.2 * (1 - this.ads * 0.7) + (p.grounded ? 0 : 1.5) - p.crouch * 0.25) + this.bloom;
  }

  private shoot() {
    const g = this.game, s = this.cw, def = s.def, p = g.player;
    s.mag--;
    this.fireCd = 60 / def.rpm;
    this.lastShotAt = g.time;
    this.sustain = Math.min(14, this.sustain + 1);
    this.bloom = Math.min(0.03, this.bloom + def.hipSpread * 0.25);
    g.stats.shots++;

    p.eye(_o);
    const look = p.lookDir(_d.set(0, 0, 0));
    _r.set(Math.cos(p.yaw + p.recoilYaw), 0, -Math.sin(p.yaw + p.recoilYaw)); // right
    _u.crossVectors(_r, look).normalize();
    const muzzle = g.camera.localToWorld(g.viewmodel.muzzleWorld);
    for (let i = 0; i < def.pellets; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * this.spread * (def.pellets > 1 ? 1 : 1);
      const dir = new THREE.Vector3().copy(look).addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize();
      g.fireRay(def, _o, dir, muzzle, i);
    }

    // recoil
    const adsMul = 1 - this.ads * 0.38;
    const climb = def.recoilPitch * adsMul * (1 + Math.min(this.sustain, 10) * 0.035);
    p.recoilPitch += climb * 0.8;
    p.pitch += climb * 0.35;
    p.recoilYaw += (Math.random() - 0.5) * 2 * def.recoilYaw * adsMul;
    p.shake = Math.min(1, p.shake + 0.25 * def.kick);
    g.viewmodel.fire(def.kick * (1 - this.ads * 0.4), def.id);
    audio.gun(def.sound, 0, 1);
    g.fx.flash(muzzle, 0xffb36b, 60, 0.05, 14);
    g.alertNoiseAt(p.pos, def.id === 'longbow' ? 60 : 48);
    // shells
    if (def.id !== 'breaker') g.fx.shell(g.camera.localToWorld(g.viewmodel.ejectWorld), _r.clone(), new THREE.Vector3(0, 1, 0));
    else { this.pendingPump = true; this.pumpAt = g.time + 0.28; const rr = _r.clone(); setTimeout(() => g.fx.shell(g.camera.localToWorld(g.viewmodel.ejectWorld), rr, new THREE.Vector3(0, 1, 0)), 300); }
    g.hud.setWeapon(s);
    if (s.mag === 0 && s.reserve > 0) setTimeout(() => { if (this.cw === s && s.mag === 0 && !this.reloading) this.startReload(); }, 350);
  }

  private melee() {
    const g = this.game;
    this.meleeCd = 0.65;
    g.viewmodel.stab();
    audio.whoosh();
    setTimeout(() => g.meleeAttack(), 120);
  }
}
