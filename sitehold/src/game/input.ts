import type { KeyAction, Settings } from './settings.ts';

/** Keyboard and raw mouse. Mouse deltas are turned into CS style degrees by the game. */
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  buttons = new Set<number>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  onLock: ((locked: boolean) => void) | null = null;
  onKey: ((code: string) => void) | null = null;
  private canvas: HTMLElement;
  private settings: Settings;
  private rawOk = true;

  constructor(canvas: HTMLElement, settings: Settings) {
    this.canvas = canvas;
    this.settings = settings;
    window.addEventListener('keydown', (e) => {
      if (this.typing(e)) return;
      if (!e.repeat) { this.keys.add(e.code); this.pressed.add(e.code); this.onKey?.(e.code); }
      if (this.locked && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'KeyB' || e.ctrlKey || e.code.startsWith('F') && e.code.length <= 3 && e.code !== 'F11')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    window.addEventListener('mousedown', (e) => { if (this.locked) this.buttons.add(e.button); });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    window.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    window.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.buttons.clear();
      this.onLock?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.rawOk = false; });
  }

  private typing(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  }

  requestLock() {
    try {
      const opts = this.rawOk ? ({ unadjustedMovement: true } as unknown as PointerLockOptions) : undefined;
      const p = (this.canvas.requestPointerLock(opts) as unknown) as Promise<void> | undefined;
      p?.catch?.(() => { this.rawOk = false; });
    } catch { this.rawOk = false; try { this.canvas.requestPointerLock(); } catch { /* ignore */ } }
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(a: KeyAction) { return this.settings.keys[a].some((k) => this.keys.has(k)); }
  hit(a: KeyAction) { return this.settings.keys[a].some((k) => this.pressed.has(k)); }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }
}
