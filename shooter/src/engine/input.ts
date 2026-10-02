export class Input {
  keys = new Set<string>();
  pressedThisFrame = new Set<string>();
  buttons = new Set<number>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  isTouch = false;
  // touch state
  moveX = 0;
  moveY = 0;
  touchFire = false;
  touchAds = false;
  touchSprint = false;
  touchJump = false;
  touchReload = false;
  touchSwitch = false;
  touchKnife = false;
  touchCrouch = false;
  lookDX = 0;
  lookDY = 0;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private canvas: HTMLElement) {
    this.isTouch = matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedThisFrame.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code) && this.locked) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    window.addEventListener('mousedown', (e) => this.buttons.add(e.button));
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
      if (!this.locked) { this.buttons.clear(); }
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    if (this.isTouch) return;
    try {
      const p = (this.canvas as HTMLCanvasElement).requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => { /* user cancelled */ });
    } catch { /* ignore */ }
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code: string) { return this.keys.has(code); }
  pressed(code: string) { return this.pressedThisFrame.has(code); }

  get fire() { return this.buttons.has(0) || this.touchFire; }
  get ads() { return this.buttons.has(2) || this.touchAds; }

  moveVec(): { x: number; y: number } {
    let x = this.moveX, y = this.moveY;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyD')) x += 1;
    if (this.down('KeyA')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  endFrame() {
    this.pressedThisFrame.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
  }
}
