// Scroll choreography. Every animation here answers one question:
//   hero intro      -> hierarchy: headline first, then proof, then the action
//   drift pin       -> storytelling: the mini-turbo mechanic, told in the order you feel it
//   roster pin      -> browsing: one racer at a time, camera travels along the line-up
//   track stack     -> comparison: each track takes the screen, the previous one steps back
//   item reveal     -> hierarchy: a quick stagger so eight items read as a list, not a wall
//   finale confetti -> state change: the page ends the way a race does
//
// Everything lives inside gsap.matchMedia(), so reduced-motion users get a static page and
// every tween and ScrollTrigger is reverted automatically if the preference flips.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function initMotion({ scene, canvas, racerCount }) {
  const html = document.documentElement;
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', (ctx) => {
    const cleanups = [];
    html.classList.remove('is-static');
    scene.start();

    // ---- which 3D stage is on, decided by where the page is (no scroll listener) ----------
    const zones = [];
    let current = '';
    const applyStage = () => {
      const hit = zones.filter((z) => z.st.progress > 0).pop(); // last zone whose start has been passed
      const stage = hit ? hit.stage : 'hero';
      if (stage === current) return;
      current = stage;
      scene.setStage(stage);
      canvas.classList.toggle('is-hidden', stage === 'idle');
    };
    // onUpdate (not just onToggle) so a jump straight to #items or the bottom still lands on the right stage
    const zone = (selector, stage, start) => {
      const st = ScrollTrigger.create({ trigger: selector, start, end: 'max', onUpdate: applyStage, onToggle: applyStage, onRefresh: applyStage });
      zones.push({ st, stage });
    };

    // ---- nav turns solid once you leave the top ------------------------------------------
    const nav = $('#nav');
    ScrollTrigger.create({ start: 60, end: 'max', onUpdate: (self) => nav.classList.toggle('is-solid', self.progress > 0) });

    // ---- drift: pinned, scrubbed -----------------------------------------------------------
    const drift = $('#drift');
    drift.classList.add('drift--live');
    cleanups.push(() => drift.classList.remove('drift--live'));
    const steps = $$('.step', drift);
    const segs = $$('.meter-seg', drift);
    let lastStep = -1;
    const syncDrift = () => {
      const { charge, boost } = scene.p;
      const active = boost > 0.02 ? 4 : charge < 1 ? 1 : charge < 2 ? 2 : 3;
      if (active !== lastStep) {
        lastStep = active;
        steps.forEach((s, i) => s.classList.toggle('is-active', i + 1 === active));
      }
      segs.forEach((seg, i) => seg.style.setProperty('--fill', String(clamp01(charge - i))));
    };
    const driftTl = gsap.timeline({
      defaults: { ease: 'none' },
      onUpdate: syncDrift,
      scrollTrigger: { trigger: drift, start: 'top top', end: '+=260%', pin: true, scrub: 0.6, anticipatePin: 1 },
    });
    driftTl
      .fromTo(scene.p, { charge: 0, boost: 0 }, { charge: 3, duration: 3 })
      .to(scene.p, { boost: 1, duration: 0.8, ease: 'power2.in' }, '>0.15')
      .to({}, { duration: 0.6 });
    syncDrift();
    zone('#drift', 'drift', 'top 60%');

    // ---- roster: pinned, the camera travels along the line-up ----------------------------
    const racers = $('#racers');
    racers.classList.add('racers--live');
    cleanups.push(() => racers.classList.remove('racers--live'));
    const cards = $$('.racer', racers);
    const tabs = $$('#roster-tabs button');
    let lastRacer = -1;
    const syncRoster = () => {
      const idx = Math.round(scene.p.roster);
      if (idx === lastRacer) return;
      lastRacer = idx;
      cards.forEach((c, i) => c.classList.toggle('is-active', i === idx));
      tabs.forEach((b, i) => b.setAttribute('aria-pressed', String(i === idx)));
    };
    const rosterTl = gsap.timeline({
      defaults: { ease: 'none' },
      onUpdate: syncRoster,
      scrollTrigger: { trigger: racers, start: 'top top', end: `+=${racerCount * 90}%`, pin: true, scrub: 0.6, anticipatePin: 1 },
    });
    rosterTl.fromTo(scene.p, { roster: 0 }, { roster: 0, duration: 0.6 });
    for (let i = 1; i < racerCount; i++) {
      rosterTl.to(scene.p, { roster: i, duration: 0.5, ease: 'power2.inOut' }).addLabel(`r${i}`).to(scene.p, { roster: i, duration: 0.6 });
    }
    rosterTl.addLabel('r0', 0);
    syncRoster();
    tabs.forEach((b, i) => {
      const onClick = () => {
        const st = rosterTl.scrollTrigger;
        const label = i === 0 ? 0.3 : rosterTl.labels[`r${i}`] + 0.3;
        const y = st.start + (st.end - st.start) * (label / rosterTl.duration());
        window.scrollTo({ top: y, behavior: 'smooth' });
      };
      b.addEventListener('click', onClick);
      cleanups.push(() => b.removeEventListener('click', onClick));
    });
    zone('#racers', 'roster', 'top 60%');

    // ---- tracks: sticky stack, previous card steps back as the next arrives ----------------
    const items = $$('.stack-item');
    items.forEach((item, i) => {
      const card = $('.track-card', item);
      const img = $('img', item);
      gsap.fromTo(img, { yPercent: -5, scale: 1.12 }, {
        yPercent: 5,
        scale: 1.12,
        ease: 'none',
        scrollTrigger: { trigger: item, start: 'top bottom', end: 'bottom top', scrub: true },
      });
      if (i < items.length - 1) {
        gsap.to(card, {
          scale: 0.92,
          opacity: 0.5,
          ease: 'none',
          scrollTrigger: { trigger: items[i + 1], start: 'top bottom', end: 'top top', scrub: true },
        });
      }
      gsap.from($$('.track-text > *', item), {
        y: 28,
        opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: item, start: 'top 55%', once: true },
      });
    });
    zone('#tracks', 'idle', 'top 70%');

    // ---- items --------------------------------------------------------------------------
    gsap.from('.item', {
      y: 36,
      opacity: 0,
      duration: 0.8,
      stagger: 0.07,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.item-grid', start: 'top 82%', once: true },
    });

    // ---- finale -------------------------------------------------------------------------
    zone('#play', 'finale', 'top 75%');
    ScrollTrigger.create({ trigger: '#play', start: 'top 55%', once: true, onEnter: () => scene.celebrate() });

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      $$('[data-magnet]').forEach((btn) => {
        const qx = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3' });
        const qy = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3' });
        const move = (e) => {
          const r = btn.getBoundingClientRect();
          qx((e.clientX - (r.left + r.width / 2)) * 0.22);
          qy((e.clientY - (r.top + r.height / 2)) * 0.22);
        };
        const leave = () => {
          qx(0);
          qy(0);
        };
        btn.addEventListener('pointermove', move);
        btn.addEventListener('pointerleave', leave);
        cleanups.push(() => {
          btn.removeEventListener('pointermove', move);
          btn.removeEventListener('pointerleave', leave);
        });
      });
    }

    // ---- text that needs the web fonts: split headings, hero intro ---------------------------
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    let alive = true;
    cleanups.push(() => {
      alive = false;
    });
    fontsReady.then(() => {
      if (!alive) return;
      ctx.add(() => {
        const title = $('[data-hero-title]');
        const split = SplitText.create(title, { type: 'lines', mask: 'lines', aria: 'auto' });
        gsap.from(split.lines, { yPercent: 115, duration: 1.1, stagger: 0.1, ease: 'power4.out', delay: 0.15 });
        gsap.from('[data-hero-lede]', { y: 24, opacity: 0, duration: 0.9, delay: 0.55, ease: 'power3.out' });
        gsap.from('[data-hero-cta] > *', { y: 20, opacity: 0, duration: 0.8, stagger: 0.08, delay: 0.7, ease: 'power3.out' });
        gsap.from(nav, { yPercent: -100, duration: 0.9, delay: 0.1, ease: 'power3.out' });
        gsap.to(scene.p, { intro: 1, duration: 2.4, delay: 0.1, ease: 'power3.out' });
        html.classList.remove('js-pre');

        $$('[data-split]').forEach((el) => {
          const s = SplitText.create(el, { type: 'lines', mask: 'lines', aria: 'auto' });
          gsap.from(s.lines, {
            yPercent: 110,
            duration: 0.95,
            stagger: 0.08,
            ease: 'power4.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          });
        });
        ScrollTrigger.refresh();
      });
    });

    applyStage();
    return () => cleanups.forEach((fn) => fn());
  });

  mm.add('(prefers-reduced-motion: reduce)', () => {
    html.classList.add('is-static');
    html.classList.remove('js-pre');
    canvas.classList.remove('is-hidden');
    scene.stop();
    return () => html.classList.remove('is-static');
  });
}
