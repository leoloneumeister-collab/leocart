// Touch and mouse gestures on the game canvas: tap, hold, one-finger pan, two-finger pinch zoom
// and drag-a-ghost (for placing buildings). Everything is reported through callbacks.

const SLOP = 9;
const HOLD_MS = 320;

export class Input {
  constructor(el, cam, h) {
    this.el = el;
    this.cam = cam;
    this.h = h; // { tap, holdStart, holdMove, holdEnd, ghostDown, ghostMove, ghostUp, dragKind }
    this.pointers = new Map();
    this.mode = 'idle';
    this.holdTimer = 0;
    this.pinch = null;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  pos(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  down(e) {
    e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = this.pos(e);
    this.pointers.set(e.pointerId, { ...p, sx: p.x, sy: p.y, t0: performance.now() });
    if (this.pointers.size === 1) {
      this.mode = 'maybe';
      clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => {
        if (this.mode === 'maybe' && this.h.holdEnabled && this.h.holdEnabled()) {
          this.mode = 'hold';
          const q = [...this.pointers.values()][0];
          this.h.holdStart(q.x, q.y);
        }
      }, HOLD_MS);
    } else if (this.pointers.size === 2) {
      this.cancelOne();
      this.mode = 'pinch';
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
  }

  cancelOne() {
    clearTimeout(this.holdTimer);
    if (this.mode === 'hold') this.h.holdEnd();
    if (this.mode === 'ghost') this.h.ghostUp();
  }

  move(e) {
    const q = this.pointers.get(e.pointerId);
    if (!q) return;
    e.preventDefault();
    const p = this.pos(e);
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    q.x = p.x;
    q.y = p.y;
    if (this.mode === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      if (this.pinch.d > 0) this.cam.zoomAt(d / this.pinch.d, cx, cy);
      this.cam.panBy(cx - this.pinch.cx, cy - this.pinch.cy);
      this.pinch = { d, cx, cy };
      return;
    }
    if (this.mode === 'maybe') {
      if (Math.hypot(p.x - q.sx, p.y - q.sy) > SLOP) {
        clearTimeout(this.holdTimer);
        const kind = this.h.dragKind ? this.h.dragKind(q.sx, q.sy) : 'pan';
        if (kind === 'ghost') {
          this.mode = 'ghost';
          this.h.ghostDown(p.x, p.y);
        } else {
          this.mode = 'pan';
          this.cam.panBy(p.x - q.sx, p.y - q.sy);
        }
      }
    } else if (this.mode === 'pan') {
      this.cam.panBy(dx, dy);
    } else if (this.mode === 'ghost') {
      this.h.ghostMove(p.x, p.y);
    } else if (this.mode === 'hold') {
      this.h.holdMove(p.x, p.y);
    }
  }

  up(e, cancelled) {
    const q = this.pointers.get(e.pointerId);
    if (!q) return;
    this.pointers.delete(e.pointerId);
    clearTimeout(this.holdTimer);
    if (this.mode === 'maybe' && !cancelled) this.h.tap(q.x, q.y);
    else if (this.mode === 'hold') this.h.holdEnd();
    else if (this.mode === 'ghost') this.h.ghostUp();
    if (this.pointers.size === 0) this.mode = 'idle';
    else if (this.pointers.size === 1) {
      // lifted one finger of a pinch: keep panning with the other without triggering a tap
      this.mode = 'pan';
    }
  }

  wheel(e) {
    e.preventDefault();
    const p = this.pos(e);
    this.cam.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }
}
