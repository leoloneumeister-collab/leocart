---
name: animated-web-builder
description: Build animated, scroll-driven websites with GSAP, procedural Three.js scenes and a strict anti-slop design process. Draws on ThreeUI (three.js components), tasteskill.dev (design rules), GSAP (gsap.com) and 21st.dev (component registry). Use for landing pages, portfolios, game or product sites, hero sections, scroll storytelling, or any request to "make it animated".
---

# Animated Web Builder

A working recipe that combines four sources. Read the reference file for the source you need, not all of them.

| Source | Role | Reference |
|---|---|---|
| tasteskill.dev (github.com/Leonxlnx/taste-skill) | Design rules, dials, AI-tell bans, pre-flight check | `references/taste.md` |
| gsap.com | Scroll choreography, text splitting, timelines | `references/gsap.md` |
| threeui.com (github.com/MengTo/threeui, npm `@designcodeio/threeui`) | Procedural three.js / WebGL hero and background patterns | `references/threeui.md` |
| 21st.dev | React + Tailwind + shadcn component registry | `references/21st-dev.md` |

## Access note (read first)

Those four domains can be blocked by the sandbox egress proxy. Check with one `WebFetch` before relying on live pages. If blocked, these still work and are the real source material:

- `npm view` / `npm pack` for `gsap` and `@designcodeio/threeui` (the npm registry is not proxied).
- `git clone --depth 1 https://github.com/Leonxlnx/taste-skill` (anonymous public clones work).
- `WebSearch` for summaries of 21st.dev (no package to inspect there).

Do not claim to have read a live page you could not fetch. Say which source you used.

## Workflow

1. **Design Read.** One line before any code: "Reading this as: <page kind> for <audience>, <vibe> language, leaning toward <stack>." Infer from the brief and the repo (existing brand colors, assets, tone). Ask at most one question, and only if the read genuinely forks.
2. **Dials.** Set `DESIGN_VARIANCE / MOTION_INTENSITY / VISUAL_DENSITY` (1-10). Baseline 8/6/4. Playful or game: 8-9 / 8 / 3. Calm or editorial: 5-6 / 3-4 / 2-3. See `references/taste.md`.
3. **Pick the stack from what exists.**
   - Existing vanilla/Vite repo: vanilla JS + CSS + `gsap` + `three`. Do not add React and Tailwind to a repo that has neither.
   - React/Next + Tailwind project: 21st.dev components and `@designcodeio/threeui` are drop-in.
   - Motion library only for React UI state; GSAP for scroll storytelling. Never mix GSAP/Three with Motion in one component tree.
4. **Architecture for animated pages.**
   - One fixed WebGL canvas behind the page. A plain `state` object holds scene parameters.
   - GSAP ScrollTrigger scrubs numbers on `state`; the render loop reads `state`. No framework state for per-frame values.
   - Stages: `scene.setStage('hero' | 'drift' | ...)` sets targets, the scene `damp`s toward them. Transitions come for free.
   - Pause rendering when the canvas is covered or the tab is hidden.
5. **Motion plan.** Every animation gets a one-sentence reason (hierarchy, storytelling, feedback, state change). Cut any that cannot. Max one marquee per page.
6. **Build.** Content visible by default. JS applies hidden start states via `gsap.from` inside `gsap.matchMedia()`, so no-JS and reduced-motion users see everything.
7. **Verify in a real browser.** Playwright + Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Screenshot at several scroll offsets, desktop and a 390px phone, check console errors, run lint and build.
8. **Pre-flight.** Run the checklist in `references/taste.md`. Fix, do not just report.

## Hard rules (short list, full list in taste.md)

- Zero em-dashes or en-dashes in any visible text. Use a hyphen, comma, colon or period.
- No `window.addEventListener('scroll')`. Use ScrollTrigger, IntersectionObserver or CSS scroll-driven animation.
- Animate `transform` and `opacity` only. `min-h-[100dvh]`, never `h-screen`.
- `prefers-reduced-motion` honored for everything above motion level 3. Infinite loops, parallax, pinning collapse to static.
- One accent color, one radius scale, one theme per page. Not Inter, not purple gradients, not three equal feature cards.
- Hero fits the viewport: headline max 2 lines, subtext max 20 words, 1 primary CTA + 1 secondary. No scroll cue, no version label, no custom cursor.
- Every `ScrollTrigger` and `SplitText` created inside `gsap.matchMedia()` or `gsap.context()` so cleanup is automatic.
- Cap `devicePixelRatio` at 1.5-2. Dispose geometries and materials you create. Pause offscreen with IntersectionObserver.

## Dark mode caveat

taste.md asks for light and dark tokens. If the brand is dark-only (existing dark boot screen, theme-color meta, night scenes), state that override in the final summary instead of silently shipping one mode.

## Where this was applied

`site/` in this repo is the LeoCart landing page built with this skill. It is a working example of the stage-based canvas, the pinned scrubbed sections, the sticky stack and the reduced-motion split.
