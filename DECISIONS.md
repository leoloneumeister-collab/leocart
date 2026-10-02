# Decisions

Notes on the calls I made while building, mostly where the brief left something open or where the obvious approach did not work. Newest thinking first within each section.

## Scope and tooling

- **Plain JavaScript, not TypeScript.** The brief allowed either. The code is small enough and changes shape often enough that types would have cost more than they saved. ESLint catches undefined and unused names.
- **Three.js r186 and Vite 8.** Current versions at the time. `THREE.Clock` is deprecated, so timing uses `performance.now()`.
- **Pushed straight to `main`.** The task named a feature branch, but the owner asked for `main` directly, so history is on `main`.
- **Deployment.** The `gh` CLI token was invalid in this environment and the egress proxy blocks the GitHub Pages API, so I could not switch Pages on myself. The repo already existed, so I pushed with git and added a GitHub Actions workflow that lints, validates the tracks, builds and deploys. Once Pages is set to "GitHub Actions" in the repo settings, a re-run publishes the site. The workflow first used `configure-pages` with `enablement: true`; GitHub refuses that for the Actions token, so I removed it.

## Game design

- **Original names and look.** Racers are a fox, bear, robot, bunny, dragon and owl; items are Bolt, Seeker, Turbo Cell, Turbo Trio, Oil Slick, Aegis, Comet and Pulse. The title is a plain word. No names, logos, tracks or sounds from any existing franchise.
- **Every racer's stats sum to 12.** The brief asked for trade-offs, so I made them literal. Stats map to top speed, acceleration, turn rate and grip, bump mass and off-road penalty. I balanced them with `scripts/sim.mjs` (solo bot laps) so no character is more than about 10 percent off the pace on any track, and the order changes between open and tight tracks.
- **Eight items, not six.** Two items cover the "comeback" role: Comet (autopilot burst) is given from 3rd place back, Pulse (shocks everyone ahead) only from 5th. Weights per position are in `src/game/items.js`.
- **Points are 15, 12, 10, 8, 6, 4.** Six racers, so the scale is shorter than the usual 12-kart one. Ties break on the last race's finishing position.
- **The player starts 5th** in single races and the first cup race. It gives room to overtake, and shows off items and drifting early. Later cup races line up by points.
- **Rocket start.** Pressing accelerate in the last 0.6 s of the countdown gives a boost. Cheap to build and it rewards paying attention.
- **No touch controls.** The brief targets desktop with a keyboard and gamepad as a bonus. Touch devices see a toast saying so. The layout still works at phone size.

## Tracks

- **Rounded polygons instead of splines.** My first attempt used Catmull-Rom splines through hand-placed points. Corner radii were unpredictable and one layout crossed itself. With explicit corners (vertex plus radius) the minimum radius is known up front, the AI can plan speeds from it, and a validator can check clearances.
- **Flat tracks.** No elevation. Karts, walls, items and the camera stay simple and robust. Hills, mesas and buildings in the distance give the sense of scale.
- **Walls are a per-sample lateral limit,** not colliders. Cheap, exact, and it makes shortcuts easy: open the limit on the inside of a bend.
- **Shortcuts only across one bend.** I first sketched a shortcut across the whole map. It breaks progress tracking, because the nearest centreline sample jumps. A shortcut that stays inside one bend keeps progress continuous, so lap and position logic never see a discontinuity. A validator warns if a checkpoint sits inside a shortcut.
- **Progress is a signed path integral** and checkpoints are a second gate. Reversing unwinds progress, teleporting cannot jump it, and a lap needs every checkpoint.

## Physics and AI

- **Velocity is kept in world space.** Steering rotates only part of the velocity, and grip removes the rest. This gives drifting without a separate drift mode for the physics.
- **Drift turn rate sits around the normal turn rate.** My first version made drifting turn far tighter than normal steering, which sent the bots into walls. Steering into the drift tightens it and steering out widens it, centred on a medium corner.
- **Karts collide as two circles** (nose and tail). A single circle let karts overlap along their length.
- **Keyboard steering is eased** (about 0.15 s to full lock) so a tap gives a small correction. Analog sticks pass straight through.
- **Rubber banding is light:** at most +6.5 percent for bots well behind the player and −5 percent for bots well ahead. Difficulty shifts bot skill by about −5.5, −1 or +2 percent. I tuned "Normal" so a driver of roughly bot skill 0.95 finishes mid-pack (mean place 3.56 over 18 races).
- **Bots take shortcuts** with a probability that depends on skill and aggression, so the shortcut is not a free win for the player.

## Rendering and performance

- **Everything is procedural.** Textures are canvas drawings, models are merged primitives with vertex colours, the sky is a baked canvas. This keeps the repo free of binary assets and the build under 200 KB gzipped.
- **Sky is a baked canvas, stars and mountains are geometry.** A shader sky would cost fill rate every frame. Baked once, it is a single texture read.
- **Shadows:** a shadow map that follows the player (snapped to texel steps so it does not shimmer) plus blob shadows. Low quality turns the map off.
- **The ground plane is subdivided.** A 5 km quad made of two triangles made the road vanish intermittently in software rendering, because depth interpolation across such a large triangle loses precision. Subdividing it to 64×64 fixed it: 0 glitches in 36 captures, against 2 in 30 before. Road decals also use a polygon offset.
- **Adaptive resolution.** If the average frame takes more than about 21 ms the render scale drops in steps (floor 55 percent); it climbs back when there is headroom. MSAA is off on screens at 1.75x pixel ratio and above.
- **I could not measure real FPS.** The test browser has no GPU. The performance test budgets what it can measure: about 0.1 ms of simulation per step, about 110 draw calls and 70 to 300 thousand triangles per frame.

## Audio

- **Pattern data, not samples.** Music is written as scale degrees on a 16-step grid and played by a look-ahead scheduler, so every melody is in key by construction. Each track has its own scale and groove: C major bounce, phrygian dominant with darbuka-style percussion, A minor synthwave.
- **I could not listen to it.** The audio test renders every loop and effect offline and checks level, clipping and NaNs. That tells me the sound is present and clean, not that it is good, so the mix is worth a listen.
- **Audio starts on the first click or key press,** because browsers block it until then.

## Things I would do with more time

- Elevation and jumps on the tracks, plus a replay mode.
- Touch controls.
- Online ghost times.
- A proper listening pass on the music mix and engine sounds.
