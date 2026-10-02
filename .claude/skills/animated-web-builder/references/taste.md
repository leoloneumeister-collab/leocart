# Taste rules (tasteskill.dev)

Condensed from `skills/taste-skill/SKILL.md` in github.com/Leonxlnx/taste-skill (MIT, v2 experimental, commit ce26fc2, 2026-09-26). The upstream file is about 1,200 lines. This keeps the parts that decide whether an animated landing page looks designed. Install the full upstream skill with `npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend` when the network allows.

Scope: landing pages, portfolios, redesigns. Not dashboards, data tables or multi-step product UI.

## 0. Brief inference

Before code, write: "Reading this as: <page kind> for <audience>, with a <vibe> language, leaning toward <system or aesthetic>."

Signals: page kind, vibe words, references the user gave, audience, existing brand assets, quiet constraints (accessibility, public sector, kids). Constraints beat taste. Ask one question only if the read truly forks. Do not default to AI-purple gradients, centered hero over dark mesh, three equal feature cards, glassmorphism everywhere, infinite micro-animations, Inter + slate-900.

## 1. Dials

`DESIGN_VARIANCE` (1 symmetric, 10 chaotic), `MOTION_INTENSITY` (1 static, 10 cinematic), `VISUAL_DENSITY` (1 gallery, 10 cockpit). Baseline 8/6/4.

| Use case | Variance | Motion | Density |
|---|---|---|---|
| SaaS landing | 7 | 6 | 4 |
| Agency / creative / playful | 9 | 8 | 3 |
| Premium consumer | 7 | 6 | 3 |
| Designer portfolio | 8 | 7 | 3 |
| Developer portfolio | 6 | 5 | 4 |
| Editorial | 6 | 4 | 3 |
| Public sector / trust-first | 3 | 2 | 5 |

Motion 1-3: hover and active only. 4-7: CSS transitions, load cascades, transform and opacity. 8-10: scroll choreography, parallax, ScrollTrigger. Variance 8-10: fractional grids, big empty zones, and everything collapses to one column under 768px.

**Motion claimed, motion shown.** Above motion 4 the page must really animate (hero entrance, scroll reveals, CTA hover). If you cannot ship working motion, drop the dial to 3 and ship clean static.

## 4. Design directives

Typography
- Display: tight tracking, `leading` near 1. Body max 65ch.
- Not Inter by default. Use Geist, Outfit, Cabinet Grotesk, Satoshi or a brand font. Pairings: Geist + Geist Mono, Satoshi + JetBrains Mono.
- Serif is very discouraged as a default. Never Fraunces or Instrument Serif as default. Emphasis inside a headline uses italic or bold of the same family, not a random second family.
- Italic words with descenders (y g j p q) need `line-height` 1.1+ and bottom padding.

Color
- One accent, saturation under 80% unless the brand demands it. Off-black, never `#000`. Tinted shadows, not black.
- Accent lock: the same accent on the whole page. Theme lock: one theme for the page, no inverted section mid-page.
- Premium-consumer briefs: do not reach for cream + brass + oxblood + espresso. Rotate palettes.
- Dark mode: design both modes unless the brand insists on one, then say so.

Layout
- Anti-center bias when variance > 4: split screen, left text + right asset, asymmetric whitespace, pinned structures. Centered hero only for manifesto or launch.
- Cards only where elevation means hierarchy. Otherwise spacing, `border-t` once, or `divide-y` sparingly.
- Shape lock: one radius scale (all sharp, all soft, or all pill for interactive).
- Hero: fits the viewport, headline max 2 lines, subtext max 20 words and 4 lines, CTAs visible without scroll, top padding max `pt-24`, max 4 text elements (eyebrow optional, headline, subtext, CTAs). Logo walls live under the hero.
- Nav: one line at desktop, 80px max (64-72 default).
- Bento grids: exact cell count for the content, rhythm across rows. Section layouts must vary (at least 4 families over 8 sections, no 3 consecutive image+text splits).
- `min-h-[100dvh]`, never `h-screen`. CSS Grid over flex percentage maths.

Interaction states
- Real loading, empty and error states. Active state with `translateY(1px)` or `scale(.98)`.
- Button text contrast AA (4.5:1). CTA labels never wrap at desktop (3 words max). One label per intent: "Play now" everywhere, not "Play" + "Start" + "Let's go".
- Labels above inputs, never placeholder-as-label.

## 5. Motion rules

- **Motion must be motivated.** Valid reasons: hierarchy, storytelling, feedback, state transition. "Looked cool" is invalid. GSAP because GSAP is installed is amateur.
- Marquee: at most one per page.
- Perpetual loops only where the content is live (status, feed). Informational sections stay still.
- Spring or `cubic-bezier(0.16, 1, 0.3, 1)` easing, not linear (except scrubbed values).
- Sticky stack: `start: 'top top'`, previous card scales down as the next arrives.
- Horizontal pan: `start: 'top top'`, pin the wrapper, scrub the inner track, `end: +=distance`.
- Simple scroll reveals: IntersectionObserver, CSS `animation-timeline: view()` or Motion `whileInView`. Save ScrollTrigger for pin and scrub.

**Banned:** `window.addEventListener('scroll')`, `scrollY` in app state, rAF loops that set framework state, `layout` props "for safety".

## 6. Performance and accessibility

- Animate `transform` and `opacity` only.
- Reduced motion mandatory above motion 3: loops, parallax, pinning, magnetic effects collapse to static.
- Grain or noise only on fixed `pointer-events: none` layers.
- Targets: LCP < 2.5 s, INP < 200 ms, CLS < 0.1. Lazy-load heavy libraries that are not above the fold.
- Z-index only for real layers (nav, modal, overlay). Document the scale.
- Every `useEffect`/setup animation has cleanup.

## 9. AI tells (all banned unless the brief asks)

Visual: neon outer glows, pure black, oversaturated accents, gradient headline text, custom mouse cursors, hand-rolled SVG icons (use Phosphor, Hugeicons, Radix or Tabler; Lucide only on request), div-built fake screenshots or dashboards, emoji as UI.

Copy and data: "Acme", "Nexus", "John Doe", `99.99%`, "Elevate", "Seamless", "Unleash", "Revolutionize", "Quietly trusted by", poetic labels like "Field notes", mock-humble asides, micro-meta sentences under eyebrows, step labels like "Stage 1".

Decoration: section-number eyebrows (`00 / INDEX`, `01 / 4`), version labels or version footers, hero-bottom text strips (`BRAND. MOTION. SPATIAL.`), locale or time strips, scroll cues ("Scroll", arrows with labels), rotated vertical text, crosshair grid lines as decoration, decorative status dots, pills over images, photo-credit captions as decoration, border-top and border-bottom on every list row, filled progress tracks as comparison bars, floating top-right explainer text beside section headings.

Middle dot `·` at most once per line.

**Dashes.** Em-dash and en-dash as separators are banned in all visible text, alt text and aria labels. Use a period, comma, colon, parentheses or a plain hyphen. Number and date ranges use a hyphen.

## 14. Pre-flight (run it, fix failures)

1. Design Read stated, dials explicit and reasoned.
2. Zero em/en dashes in visible text.
3. One theme, one accent, one radius system. Button and form contrast AA.
4. Hero fits viewport, max 4 text elements, 1 primary + 1 secondary CTA, no CTA wrap, no duplicate CTA intent, nav one line.
5. No three-equal-cards row, no three consecutive same-layout sections, bento cell count exact.
6. Real images or real renders, no div fake screenshots, no overlays on images.
7. Every animation motivated. At most one marquee. Motion claimed equals motion shown.
8. No scroll listener, only transform/opacity, reduced motion honored, cleanups present.
9. `100dvh` not `100vh`, mobile collapse verified at 390px.
10. No AI tells from section 9. Copy re-read for broken phrases.
11. Lighthouse-style sanity: LCP element is not behind a heavy script, fonts preloaded or `font-display: swap`.
12. Empty, loading and error states exist where there is data or a form.
