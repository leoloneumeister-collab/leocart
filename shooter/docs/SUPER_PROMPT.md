# Super Prompt: SHADOW PROTOCOL (build spec used to create this game)

## Context
Repo `leocart` is empty. Goal: a polished, playable Call of Duty style 3D first-person shooter that runs in the browser, with missions, a short story, cool guns, good design and animation.
Decisions already made by the user:
- 3D FPS (Three.js), modern military ops story
- Vertical slice scope (2 missions, 4 guns, 3 enemy types, 1 boss)
- Extras: synthesized sound and music, mobile touch controls, local save and high scores
- Fully autonomous: do NOT ask the user questions. Decide, build, test, fix, commit, push.

## Autonomy rules (paste into the build session)
- Never ask for input. When something is ambiguous, pick the most sensible default and note it in `DECISIONS.md`.
- Work in milestones. After each: build passes, headless browser test passes, commit, push to `claude/compassionate-allen-pqlbhl`.
- Do not open a PR unless asked. Do not push to other branches.
- No paid APIs, no external asset downloads, no AI image/model services. Everything is code-generated, so nothing can break or cost extra.
- Budget discipline: the user has about $70 of cloud session credit. Aim to finish the full slice for well under that. Cap polish loops (max 3 fix passes per milestone). Prefer small targeted edits over rewriting files. Do not re-read large files needlessly.
- If a feature is too risky or burns time (e.g. touch aiming quality), ship a simpler version and log it in `DECISIONS.md`, never block.
- Finish with a short report: what works, how to run, known gaps.

## Tech stack
- Vite + TypeScript, `three` (+ `three/examples` postprocessing: bloom, vignette, film grain light).
- No physics engine. Custom AABB collision, simple grid A* pathfinding for enemies.
- Web Audio API for all sound and music (procedural synth).
- `localStorage` for saves, settings, high scores.
- Static build output, deployable to GitHub Pages / Netlify / Vercel as is.

## Project layout
```
index.html
src/main.ts              boot, state machine (menu, briefing, play, pause, results)
src/engine/              renderer, loop, input (kb/mouse + touch), audio, save
src/game/player.ts       movement, sprint, crouch, jump, head bob, stamina
src/game/weapons/        weapon defs, procedural viewmodels, recoil, reload anims
src/game/enemies/        grunt, rusher, heavy, boss AI + procedural rigs
src/game/level/          modular level builder from data, colliders, nav grid
src/game/fx/             muzzle flash, tracers, impacts, shells, blood/sparks, explosions
src/game/ui/             HUD, menus, briefing, subtitles, damage indicators
src/story/               mission data, dialogue, objectives
DECISIONS.md, README.md
```

## Story (keep it short, cinematic text + radio chatter)
Callsign WRAITH, Ghost Team operator. Handler "OVERWATCH" feeds intel.
- Mission 1, "NIGHT BREACH": infiltrate a coastal compound at night, destroy 3 comms relays, extract. Teaches movement, shooting, stealth-ish start into open firefight.
- Twist beat: the intel was fed by Overwatch. The relays were the team's own link.
- Mission 2, "DEAD DROP": rooftop and warehouse district at dawn. Hunt Colonel VOSS (boss). Betrayal confirmed, Overwatch goes silent, end card with a sequel hook.
Each mission: briefing screen, objectives list, radio lines (subtitles + synth radio voice blips), results screen with grade (time, accuracy, headshots, damage taken).

## Weapons (4 + knife)
| Gun | Role | Notes |
|---|---|---|
| VK-7 Assault Rifle | all-rounder | auto, medium recoil pattern, ADS |
| Hornet SMG | close range | high fire rate, low recoil, fast reload |
| Breaker Shotgun | burst | pellets, pump animation, strong knockback |
| Longbow DMR | long range | semi-auto, scope overlay, high damage |
Plus melee knife. Starter loadout pick in briefing, ammo pickups in level.
Each gun: procedurally modeled viewmodel (boxes, cylinders, bevel look via chamfer trims), idle sway, walk bob, sprint pose, ADS lerp, recoil kick, reload (mag drop, insert, charge), shell ejection, muzzle flash light, tracer, impact decals/sparks, distinct synth sound.

## Design and animation quality bar (this is what makes it feel good)
- Art direction: dark teal/orange cinematic grade, strong rim lighting, fog, bloom on emissives. Consistent palette, not random colors.
- Levels built from modular pieces (walls, crates, barrels, vehicles, towers, catwalks) with baked-looking fake AO via vertex colors, emissive signage, flickering lights, volumetric-style light cones, rain/dust particles.
- Enemies: articulated procedural rigs (hierarchical joints: torso, head, arms, legs) with idle, walk, run, aim, hit-react, death ragdoll-lite animations. Distinct silhouettes and colors per type.
- Game feel: screen shake, hit markers, kill confirm sound, damage direction indicator, red vignette, slow-mo on boss death, camera FOV kick on sprint, impact particles per surface.
- UI: clean military HUD (health, ammo, compass, objective marker, crosshair that reacts to spread), animated menu with 3D background scene, mission title cards.
- Performance: instancing for repeated meshes, object pooling for bullets/particles, target 60 fps on mid laptops, adaptive pixel ratio with a quality setting.

## Enemies
- Grunt: shoots, takes cover, strafes.
- Rusher: fast flanker, melee or shotgun, low health.
- Heavy: armored, slow, weak spot (back/head), suppressing fire.
- Boss VOSS: 3 phases (ranged, grenades + adds, enrage), health bar, arena with cover.
AI: simple state machine (patrol, alert, chase, attack, retreat), line-of-sight raycasts, reaction delay and aim error scaled by difficulty. Three difficulties.

## Controls
- Desktop: WASD, mouse look (pointer lock), LMB fire, RMB ADS, R reload, Shift sprint, C crouch, Space jump, 1-4 weapons, F knife, Esc pause.
- Mobile: twin virtual sticks (move + look), fire/ADS/reload/jump buttons, gyro off by default. Honest caveat: touch FPS aiming is mediocre, so add generous aim assist on mobile only.

## Milestones (build in this order)
1. Scaffold: Vite+TS+three, render loop, pointer lock, player movement and collisions in a gray-box room. Playwright smoke test.
2. Weapons core: VK-7 with viewmodel, recoil, reload, ADS, hit detection, sound synth. Training target dummies.
3. Enemy AI + rigs + animations: grunt first, then rusher and heavy. Pathfinding.
4. Mission 1 level, objectives (destroy relays), pickups, checkpoints, HUD, briefing/results screens, story dialogue.
5. Remaining guns (Hornet, Breaker, Longbow) and knife.
6. Mission 2 level + boss Voss, story ending.
7. Polish pass: post-processing, particles, lighting, music, menu 3D scene, settings, save/high scores, difficulty.
8. Touch controls + quality settings + performance tuning.
9. Final QA, README, `DECISIONS.md`, deploy config, final report.

## Verification (run by the agent, no user input)
- `npm run build` must pass with zero TS errors at every milestone.
- Playwright headless Chromium (preinstalled at `/opt/pw-browsers`, do not run `playwright install`): load the built game, click through menu, start mission, simulate input, capture screenshots, assert no console errors, assert FPS counter above a floor in the test scene.
- Look at the screenshots and fix obvious visual problems (this is how design quality is actually checked).
- Manual-style scripted playthrough: mission 1 completable and mission 2 boss killable via a debug/god-mode flag used only in tests.
- Final: README documents `npm install`, `npm run dev`, `npm run build`, controls, and deploy steps.

## Honest risks
- No pro 3D assets, so it will look stylized, not photoreal. Lighting, post-processing and animation carry the quality.
- Mobile FPS is the weakest part. Keep it playable, not perfect.
- Online multiplayer is out of scope on purpose.
