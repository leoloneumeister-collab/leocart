/** Keyboard and mouse state. The game polls this and also receives discrete events. */
export interface InputEvents {
  onKeyDown: (key: string, e: KeyboardEvent) => void;
  onKeyUp: (key: string, e: KeyboardEvent) => void;
  onMouseDown: (button: number, x: number, y: number, e: MouseEvent) => void;
  onMouseUp: (button: number, x: number, y: number, e: MouseEvent) => void;
  onWheel: (dy: number) => void;
}

export class Input {
  mx = -1;
  my = -1;
  /** True once the pointer has actually moved inside the window (prevents phantom edge scroll). */
  pointerSeen = false;
  inside = false;
  keys = new Set<string>();
  buttons = new Set<number>();
  enabled = true;
  private handlers: InputEvents;
  private target: HTMLElement;
  private unsub: (() => void)[] = [];

  constructor(target: HTMLElement, handlers: InputEvents) {
    this.target = target;
    this.handlers = handlers;
    const add = <K extends keyof WindowEventMap>(el: Window | HTMLElement, type: string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.unsub.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    void add;
    const kd = (e: KeyboardEvent) => {
      if (!this.enabled) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.key === 'Tab' || e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.keys.add(key);
      if (!e.repeat) this.handlers.onKeyDown(key, e);
    };
    const ku = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(key);
      this.handlers.onKeyUp(key, e);
    };
    const md = (e: MouseEvent) => {
      if (!this.enabled) return;
      this.mx = e.clientX;
      this.my = e.clientY;
      this.buttons.add(e.button);
      this.handlers.onMouseDown(e.button, e.clientX, e.clientY, e);
    };
    const mu = (e: MouseEvent) => {
      this.buttons.delete(e.button);
      this.handlers.onMouseUp(e.button, e.clientX, e.clientY, e);
    };
    const mm = (e: MouseEvent) => {
      this.mx = e.clientX;
      this.my = e.clientY;
      this.pointerSeen = true;
      this.inside = true;
    };
    const ml = () => {
      this.inside = false;
    };
    const wh = (e: WheelEvent) => {
      if (!this.enabled) return;
      this.handlers.onWheel(e.deltaY);
    };
    const cm = (e: Event) => e.preventDefault();
    const blur = () => {
      this.keys.clear();
      this.buttons.clear();
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    target.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);
    window.addEventListener('mousemove', mm);
    document.addEventListener('mouseleave', ml);
    target.addEventListener('wheel', wh, { passive: true });
    target.addEventListener('contextmenu', cm);
    window.addEventListener('blur', blur);
    this.unsub.push(
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
      () => target.removeEventListener('mousedown', md),
      () => window.removeEventListener('mouseup', mu),
      () => window.removeEventListener('mousemove', mm),
      () => document.removeEventListener('mouseleave', ml),
      () => target.removeEventListener('wheel', wh),
      () => target.removeEventListener('contextmenu', cm),
      () => window.removeEventListener('blur', blur),
    );
  }

  down(key: string): boolean {
    return this.keys.has(key);
  }

  dispose() {
    for (const u of this.unsub) u();
    this.unsub = [];
    void this.target;
  }
}
