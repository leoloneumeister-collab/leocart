# GSAP cheatsheet (gsap.com, verified against npm gsap 3.15.0)

## Licensing (changed in 2025)

Webflow acquired GreenSock and made GSAP free, including the former Club plugins: ScrollSmoother, SplitText, MorphSVG, DrawSVG, InertiaPlugin, ScrambleText, CustomEase and more. They ship in the public `gsap` npm package (`gsap/SplitText`, `gsap/ScrollSmoother`, ...). The license is the "Standard no charge license" (gsap.com/standard-license). The one real restriction: you cannot use GSAP to build a visual animation tool that competes with Webflow. Normal sites, games and client work are fine.

Do not use the "gsap-plugins-unlocked" style repos you may find in search results. They are cracked copies of plugins that are now free from npm anyway.

## Install

```bash
npm install gsap
```

```js
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
gsap.registerPlugin(ScrollTrigger, SplitText);
```

CDN fallback: `https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js` plus `dist/ScrollTrigger.min.js`, `dist/SplitText.min.js`.

## Core API

```js
gsap.to(el, { x: 100, duration: 1, ease: 'power3.out' });
gsap.from(el, { opacity: 0, y: 40 });          // sets the start state immediately
gsap.fromTo(el, { y: 40 }, { y: 0 });
gsap.set(el, { opacity: 0 });
const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.8 } });
tl.from('.a', { y: 40, opacity: 0 }).from('.b', { y: 40, opacity: 0 }, '<0.1'); // '<' = start of previous
gsap.quickTo(obj, 'x', { duration: 0.4, ease: 'power3' }); // fast pointer-follow setter
gsap.utils.toArray('.card'); gsap.utils.clamp(0, 1, v); gsap.utils.mapRange(a, b, c, d, v);
```

Tweening a plain object is the key trick for WebGL pages: `gsap.to(state, { charge: 3, scrollTrigger: {...} })` and read `state.charge` in the render loop.

## ScrollTrigger

```js
// scrubbed timeline with a pinned section
const tl = gsap.timeline({
  defaults: { ease: 'none' },
  scrollTrigger: {
    trigger: '#drift',
    start: 'top top',          // pin only when the section top hits the viewport top
    end: '+=250%',             // scroll distance spent inside the pin
    pin: true,
    scrub: 0.6,                // seconds of smoothing
    anticipatePin: 1,
    invalidateOnRefresh: true,
  },
});
// stage switching without a scroll listener
ScrollTrigger.create({ trigger: '#racers', start: 'top 60%', end: 'bottom 40%',
  onToggle: (self) => self.isActive && scene.setStage('roster') });
// one-shot reveal
gsap.from('.item', { y: 32, opacity: 0, stagger: 0.07, scrollTrigger: { trigger: '.items', start: 'top 75%', once: true } });
```

Gotchas that bite:
- `start: 'top top'` for pins. `'top center'` makes the pin start mid-screen and look broken.
- Create triggers top to bottom of the page, or set `refreshPriority`, so pin spacers are measured in order.
- After fonts load, call `ScrollTrigger.refresh()` (`document.fonts.ready.then(...)`). Unbounded or wide display fonts change line counts.
- Pinned element inside another transformed element breaks. Pin top-level sections.
- Sticky stack: CSS `position: sticky; top: 0; min-height: 100dvh` per card, then scrub `scale` and `opacity` of card i using the trigger of card i+1 (`start: 'top bottom'`, `end: 'top top'`). Same look as pinning every card, no spacer maths.
- Horizontal pan: pin wrapper, `x: () => -(track.scrollWidth - innerWidth)`, `end: () => '+=' + distance`, `invalidateOnRefresh: true`.
- Animating a 3D camera instead of a DOM track is often cleaner: scrub `state.roster` 0..N and let the scene interpolate.

## matchMedia and context (accessibility and cleanup)

```js
const mm = gsap.matchMedia();
mm.add({ motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 900px)' }, (ctx) => {
  const { motion, wide } = ctx.conditions;
  if (!motion) return;                // nothing animates for reduced-motion users
  // create tweens, triggers, SplitText here: all reverted automatically when the query stops matching
});
```

`gsap.context(fn, scopeEl)` does the same revert-on-cleanup for non-media-query code (React `useEffect` return `ctx.revert()`).

## SplitText (rewritten in 3.13)

```js
const split = SplitText.create('h1', {
  type: 'lines,words,chars',
  mask: 'lines',            // wraps each line in an overflow:hidden mask for clean slide-up reveals
  autoSplit: true,          // re-splits on resize and after fonts load
  aria: 'auto',             // keeps an accessible label on the original element
  onSplit(self) {           // return the tween so autoSplit can revert and replay it
    return gsap.from(self.lines, { yPercent: 110, stagger: 0.08, duration: 0.9, ease: 'power4.out' });
  },
});
```

Notes: `split.lines`, `split.words`, `split.chars`, `split.masks`, `split.revert()`. Do not nest the same element in two SplitTexts. Splitting before the web font is ready measures the wrong lines, so wait for `document.fonts.ready` or use `autoSplit: true`.

## Other free plugins worth knowing

- `ScrollSmoother`: smooth scrolling, needs `#smooth-wrapper > #smooth-content` markup. Skip unless the brief wants inertia scroll, it complicates fixed canvases.
- `Flip`: layout transitions between states.
- `DrawSVGPlugin`, `MorphSVGPlugin`, `MotionPathPlugin`: SVG drawing, morphing, path following.
- `Observer`: normalized wheel/touch/pointer events for custom hijacks.
- `ScrambleTextPlugin`: decode-style text effects (use sparingly).

## Reduced motion and performance checklist

- Everything animated sits inside a `(prefers-reduced-motion: no-preference)` branch.
- Animate `x/y/scale/rotation/opacity`. Avoid animating `width`, `height`, `top`, `left`, `filter` blur on big areas.
- `will-change: transform` only on pinned or constantly moving elements.
- `scrub: true` is jittery on trackpads, `scrub: 0.5` to `1` feels smoother.
- Kill what you create: `ScrollTrigger.getAll().forEach(t => t.kill())` only in teardown, otherwise rely on matchMedia/context.
