// Keyboard and gamepad navigation for the menus. Arrow keys / WASD / D-pad move focus to the
// nearest focusable element in that direction. Enter / Space / A activates, Esc / B goes back.

export class Nav {
  constructor(root, { onSound } = {}) {
    this.root = root;
    this.onSound = onSound || (() => {});
    this.active = true;
    this.padPrev = {};
    this.repeat = { dir: null, t: 0 };
    this.blocked = false; // true while a key is being rebound

    window.addEventListener('keydown', (e) => this._key(e));
    root.addEventListener('pointermove', (e) => {
      const el = e.target.closest?.('[data-focus]');
      if (el && el !== document.activeElement) el.focus({ preventScroll: true });
    });
  }

  setActive(v) {
    this.active = v;
  }

  items() {
    const screen = this.root.querySelector('.screen:not(.leaving)') || this.root;
    const modal = this.root.querySelector('.modal');
    const scope = modal || screen;
    return [...scope.querySelectorAll('[data-focus]')].filter((el) => !el.disabled && el.offsetParent !== null);
  }

  focusFirst(sel) {
    const list = this.items();
    const target = (sel && list.find((e) => e.matches(sel))) || list.find((e) => e.dataset.default !== undefined) || list[0];
    target?.focus({ preventScroll: true });
  }

  _key(e) {
    if (!this.active || this.blocked) return;
    const k = e.code;
    const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
    const cur = document.activeElement;
    if (dirs[k]) {
      if (cur && cur.matches?.('input[type=range]') && (dirs[k] === 'left' || dirs[k] === 'right')) {
        // let the slider handle it, but still play a tick
        return;
      }
      e.preventDefault();
      this.move(dirs[k]);
    } else if (k === 'Enter' || k === 'Space') {
      if (cur && cur.matches?.('[data-focus]')) {
        e.preventDefault();
        cur.click();
      }
    } else if (k === 'Escape' || k === 'Backspace') {
      const back = this.root.querySelector('.modal [data-back], .screen:not(.leaving) [data-back]');
      if (back) {
        e.preventDefault();
        back.click();
      }
    }
  }

  move(dir) {
    const list = this.items();
    if (!list.length) return;
    const cur = document.activeElement;
    if (!cur || !list.includes(cur)) {
      list[0].focus({ preventScroll: true });
      return;
    }
    if (cur.matches('input[type=range]') && (dir === 'left' || dir === 'right')) {
      const step = Number(cur.step || 0.05) * (dir === 'right' ? 1 : -1);
      cur.value = Math.min(Number(cur.max), Math.max(Number(cur.min), Number(cur.value) + step));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const ex = b.left + b.width / 2;
      const ey = b.top + b.height / 2;
      const dx = ex - cx;
      const dy = ey - cy;
      let primary;
      let secondary;
      if (dir === 'up') { primary = -dy; secondary = Math.abs(dx); }
      else if (dir === 'down') { primary = dy; secondary = Math.abs(dx); }
      else if (dir === 'left') { primary = -dx; secondary = Math.abs(dy); }
      else { primary = dx; secondary = Math.abs(dy); }
      if (primary <= 4) continue;
      const score = primary + secondary * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      best.focus({ preventScroll: true });
      this.onSound('move');
    }
  }

  /** Gamepad polling for menus (call every frame while a menu is up). */
  pollPad(dt) {
    if (!this.active || !navigator.getGamepads) return;
    const pad = [...navigator.getGamepads()].find((p) => p && p.connected);
    if (!pad) return;
    const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    let dir = null;
    if (b(12) || ay < -0.6) dir = 'up';
    else if (b(13) || ay > 0.6) dir = 'down';
    else if (b(14) || ax < -0.6) dir = 'left';
    else if (b(15) || ax > 0.6) dir = 'right';
    if (dir) {
      if (this.repeat.dir !== dir) {
        this.repeat = { dir, t: 0.4 };
        this.move(dir);
      } else {
        this.repeat.t -= dt;
        if (this.repeat.t <= 0) {
          this.repeat.t = 0.12;
          this.move(dir);
        }
      }
    } else this.repeat = { dir: null, t: 0 };
    const edge = (i, fn) => {
      const now = b(i);
      if (now && !this.padPrev[i]) fn();
      this.padPrev[i] = now;
    };
    edge(0, () => document.activeElement?.matches?.('[data-focus]') && document.activeElement.click());
    edge(1, () => this.root.querySelector('.modal [data-back], .screen:not(.leaving) [data-back]')?.click());
  }
}
