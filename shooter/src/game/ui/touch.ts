import type { Input } from '../../engine/input';

export class TouchControls {
  root: HTMLElement;
  constructor(parent: HTMLElement, private input: Input, onPause: () => void) {
    const r = document.createElement('div');
    r.className = 'tc';
    r.innerHTML = `
      <div class="stick" id="t-stick"><div class="nub" id="t-nub"></div></div>
      <div class="look" id="t-look"></div>
      <div class="tb fire" id="t-fire">FIRE</div>
      <div class="tb" id="t-ads" style="right:22vw;bottom:22vh">AIM</div>
      <div class="tb" id="t-reload" style="right:4vw;bottom:34vh">RELOAD</div>
      <div class="tb" id="t-jump" style="right:15vw;bottom:5vh">JUMP</div>
      <div class="tb" id="t-sw" style="right:4vw;top:32vh">SWAP</div>
      <div class="tb" id="t-knife" style="right:15vw;top:32vh">KNIFE</div>
      <div class="tb" id="t-pause" style="right:3vw;top:10px;width:46px;height:46px">II</div>
      <div class="tb" id="t-crouch" style="left:4vw;bottom:42vh">DUCK</div>`;
    parent.appendChild(r);
    this.root = r;
    const q = (id: string) => r.querySelector('#' + id) as HTMLElement;

    // movement stick
    const stick = q('t-stick'), nub = q('t-nub');
    let sid = -1;
    const setStick = (e: PointerEvent) => {
      const b = stick.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      let dx = (e.clientX - cx) / (b.width / 2), dy = (e.clientY - cy) / (b.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      nub.style.transform = `translate(${dx * 42}px, ${dy * 42}px)`;
      input.moveX = dx; input.moveY = -dy;
      input.touchSprint = l > 0.95 && dy < -0.6;
    };
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(sid); setStick(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e); });
    const endStick = (e: PointerEvent) => { if (e.pointerId === sid) { sid = -1; nub.style.transform = ''; input.moveX = 0; input.moveY = 0; input.touchSprint = false; } };
    stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);

    // look area
    const look = q('t-look');
    let lid = -1, lx = 0, ly = 0;
    look.addEventListener('pointerdown', (e) => { lid = e.pointerId; look.setPointerCapture(lid); lx = e.clientX; ly = e.clientY; });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lid) return;
      input.lookDX += (e.clientX - lx) * 1.7; input.lookDY += (e.clientY - ly) * 1.7;
      lx = e.clientX; ly = e.clientY;
    });
    const endLook = (e: PointerEvent) => { if (e.pointerId === lid) lid = -1; };
    look.addEventListener('pointerup', endLook); look.addEventListener('pointercancel', endLook);

    const hold = (id: string, on: () => void, off: () => void) => {
      const b = q(id);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('active'); on(); });
      const up = () => { b.classList.remove('active'); off(); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    };
    hold('t-fire', () => (input.touchFire = true), () => (input.touchFire = false));
    hold('t-ads', () => (input.touchAds = !input.touchAds), () => {});
    hold('t-reload', () => (input.touchReload = true), () => {});
    hold('t-jump', () => (input.touchJump = true), () => {});
    hold('t-sw', () => (input.touchSwitch = true), () => {});
    hold('t-knife', () => (input.touchKnife = true), () => {});
    hold('t-pause', () => onPause(), () => {});
    hold('t-crouch', () => (input.touchCrouch = !input.touchCrouch), () => {});
  }
  show(on: boolean) { this.root.classList.toggle('on', on && this.input.isTouch); }
}
