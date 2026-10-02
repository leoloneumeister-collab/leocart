// Keyboard + gamepad input. The race reads one merged snapshot per frame via poll().

import { settings } from './settings.js';
import { clamp } from '../util/math.js';

const deadzone = 0.16;

export class Input {
  constructor() {
    this.down = new Set();
    this.pressedQueue = new Set(); // codes pressed since last poll
    this.padPrev = {};
    this.rebinding = null;
    this.enabled = true;
    this.steerSmooth = 0;

    window.addEventListener('keydown', (e) => {
      if (this.rebinding) return; // the settings screen handles this key
      if (e.repeat) {
        if (this._isGameKey(e.code)) e.preventDefault();
        return;
      }
      this.down.add(e.code);
      this.pressedQueue.add(e.code);
      if (this._isGameKey(e.code) && this.enabled) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
    });
  }

  _isGameKey(code) {
    if (!this.enabled) return false;
    for (const a in settings.bindings) if (settings.bindings[a].includes(code)) return true;
    return false;
  }

  _held(action) {
    const keys = settings.bindings[action];
    for (let i = 0; i < keys.length; i++) if (this.down.has(keys[i])) return true;
    return false;
  }

  _pressed(action) {
    const keys = settings.bindings[action];
    for (let i = 0; i < keys.length; i++) if (this.pressedQueue.has(keys[i])) return true;
    return false;
  }

  gamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Returns one snapshot of driving input. Edge-triggered fields (item, reset, pause) fire once. */
  poll(dt = 1 / 60) {
    const s = { steer: 0, throttle: 0, brake: 0, drift: false, item: false, back: false, look: false, reset: false, pause: false };
    let steer = 0;
    if (this._held('left')) steer -= 1;
    if (this._held('right')) steer += 1;
    s.throttle = this._held('accelerate') ? 1 : 0;
    s.brake = this._held('brake') ? 1 : 0;
    s.drift = this._held('drift');
    s.look = this._held('lookBack');
    s.item = this._pressed('item');
    s.reset = this._pressed('reset');
    s.pause = this._pressed('pause');

    const pad = this.gamepad();
    if (pad) {
      const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const v = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
      let ax = pad.axes[0] || 0;
      if (Math.abs(ax) < deadzone) ax = 0;
      else ax = Math.sign(ax) * ((Math.abs(ax) - deadzone) / (1 - deadzone));
      if (b(14)) ax = -1;
      if (b(15)) ax = 1;
      if (ax !== 0) steer = ax;
      s.throttle = Math.max(s.throttle, b(0) ? 1 : 0, v(7));
      s.brake = Math.max(s.brake, b(1) ? 1 : 0, v(6));
      s.drift = s.drift || b(5) || b(4);
      const edge = (i) => {
        const now = b(i);
        const was = !!this.padPrev[i];
        this.padPrev[i] = now;
        return now && !was;
      };
      const itemE = edge(2);
      const resetE = edge(8);
      const pauseE = edge(9);
      const lookE = b(3);
      s.item = s.item || itemE;
      s.reset = s.reset || resetE;
      s.pause = s.pause || pauseE;
      s.look = s.look || lookE;
    }
    // Keyboard steering is digital, so ease towards the target: quick enough to feel direct,
    // slow enough that a tap gives a small correction. Analog sticks are passed through as-is.
    if (pad && Math.abs(pad.axes[0] || 0) >= deadzone) {
      this.steerSmooth = steer;
    } else {
      const target = clamp(steer, -1, 1);
      const rate = Math.abs(target) > Math.abs(this.steerSmooth) || Math.sign(target) !== Math.sign(this.steerSmooth) ? 6.5 : 10;
      const dv = target - this.steerSmooth;
      this.steerSmooth += Math.sign(dv) * Math.min(Math.abs(dv), rate * dt);
    }
    s.steer = clamp(this.steerSmooth, -1, 1);
    s.back = s.brake > 0.5;
    this.pressedQueue.clear();
    return s;
  }

  /** Any key pressed since last poll (used by "press any key" prompts). */
  anyPressed() {
    return this.pressedQueue.size > 0;
  }
}
