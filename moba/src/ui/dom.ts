/** Tiny DOM helpers shared by the UI modules. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

let tip: HTMLDivElement | null = null;

function tipEl(): HTMLDivElement {
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'tooltip';
    document.body.appendChild(tip);
  }
  return tip;
}

/** Attach a hover tooltip that is built lazily so it always shows live numbers. */
export function attachTip(target: HTMLElement, build: () => string) {
  const show = (e: MouseEvent) => {
    const t = tipEl();
    t.innerHTML = build();
    t.style.display = 'block';
    move(e);
  };
  const move = (e: MouseEvent) => {
    const t = tipEl();
    const pad = 14;
    const w = t.offsetWidth;
    const h = t.offsetHeight;
    let x = e.clientX + pad;
    let y = e.clientY - h - pad;
    if (x + w > window.innerWidth - 6) x = e.clientX - w - pad;
    if (y < 6) y = e.clientY + pad;
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  };
  const hide = () => {
    tipEl().style.display = 'none';
  };
  target.addEventListener('mouseenter', show);
  target.addEventListener('mousemove', move);
  target.addEventListener('mouseleave', hide);
}

export function hideTip() {
  if (tip) tip.style.display = 'none';
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
