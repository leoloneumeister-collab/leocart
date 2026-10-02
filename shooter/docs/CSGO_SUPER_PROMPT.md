# Super Prompt: SITEHOLD (CS:GO style 5v5 bomb defusal, offline vs bots)

Paste everything below the line into a fresh Claude Code session on this repo.

---

## Goal
Build a polished, playable Counter-Strike style tactical shooter in the browser, in a new folder `sitehold/` next to `shooter/` and the kart game. One player plus 4 bot teammates vs 5 bots, bomb defusal, buy menu, economy, grenades, one original map. Offline only.

"CS:GO" is the reference for FEEL, not for content. Do not copy Valve names, logos, map layouts, models or sounds. Original game name, original map, original team names (Sentinels defend, Breachers attack), original weapon names with the same roles.

What makes it feel like CS, in priority order. Spend effort in this order:
1. Movement (accel, friction, counter-strafing, air strafing, crouch, jump)
2. Gunplay (deterministic spray patterns, first-shot accuracy, movement inaccuracy, one-tap headshots)
3. Economy loop (buy, win, lose bonus, save rounds)
4. Bots that play the objective, not just run at you
5. Looks. Last. Readability beats beauty.

## Autonomy rules
- Never ask for input. Pick the most sensible default and log it in `sitehold/DECISIONS.md`.
- Work in milestones. After each: build passes, tests pass, commit, push to the branch assigned to this session. No PR unless asked. No other branches.
- No paid APIs, no downloaded assets, no AI model or image services. Everything is generated in code.
- Cap polish loops at 3 fix passes per milestone. Prefer small targeted edits. Do not re-read big files needlessly.
- If something is too risky, ship the simpler version, log it, never block.
- Finish with a short report: what works, how to run, known gaps, what to tune by hand.

## Reuse before writing
`shooter/` (SHADOW PROTOCOL) already has working pieces. Copy and adapt, do not rewrite:
`src/engine/` (renderer, post, input with pointer lock, procedural audio, texgen, save), `src/game/collision.ts` (AABB), `src/game/nav.ts` (grid A*), `src/game/enemies/rig.ts` (articulated procedural characters), `src/game/weapons/viewmodel.ts`, `src/game/fx/`, `src/game/ui/hud.ts`. Read `shooter/DECISIONS.md` first for what already worked and what did not.

## Tech
- Vite + TypeScript, `three`. No physics engine. localStorage for settings and stats.
- Separate the SIMULATION from RENDERING. Sim runs on a fixed 64 Hz tick with no Three.js imports, render interpolates. This is required: it lets bots play full matches in Node with no GPU (see Verification).
- Static build, deployable like `shooter/` (add `/sitehold/` to the existing deploy workflow).

## Game mode (Competitive, shortened)
- Player picks a side at start, sides swap after round 7. First to 8 wins, 14 rounds max. 7-7 goes to one sudden-death round with $10,000 each.
- Round: freeze/buy time 12 s, round 115 s, bomb timer 40 s, plant 3.2 s, defuse 10 s (5 s with kit). Buying is only allowed during freeze time (and in Deathmatch).
- Win conditions: Breachers win by eliminating Sentinels or by the bomb exploding. Sentinels win by eliminating Breachers before a plant, by defusing, or by the clock running out with no plant. If all Breachers die AFTER a plant, the bomb stays live and Sentinels must still defuse it.
- Also a Deathmatch mode for quick play: free-for-all vs 7 bots, 10 minute timer, instant respawn, pick any weapon, no economy. Reuses the same movement, guns and bots.
- Death in competitive: spectate teammates (cycle with click), see the round finish.

## Movement (use these numbers, tune by feel)
Units below are metres (Source units x 0.0254).
- Max run speed by weapon: knife 6.35 m/s, pistols ~6.0, SMGs ~5.9, rifles ~5.5, sniper 5.1. Shift-walk 52%, crouch 34%.
- Ground: Quake-style accelerate (accel 5.5 x max speed), friction 5.2, stop speed 2.0 m/s. This is what creates counter-strafing: tapping the opposite key must stop you almost instantly.
- Air: air accel 12 with wish-speed cap of 0.76 m/s, so strafing mid-air bends velocity. Gravity 20.3 m/s2, jump velocity 7.6 m/s. No auto bunny-hop speed gain beyond normal air-strafe rules. Jump has a landing penalty (brief speed loss).
- Hull: standing height 1.83 m, eye 1.63 m. Crouch height 1.37 m, eye 1.17 m, smooth transition. Step height 0.46 m. Player radius 0.4 m. Crouch-jump works.
- Footsteps are audible when running (not when walking or crouched), with surface variation. Bots react to them.
- Fall damage above ~3.5 m drop.
- FOV 106 degrees horizontal at 16:9 (73.7 vertical). Settings slider.
- Mouse: raw input (`requestPointerLock({unadjustedMovement:true})`), yaw = 0.022 deg x sensitivity per count like CS, so players can reuse their sens. Pitch clamp, invert option.

## Gunplay
Hitscan. Every weapon has: damage, armor penetration, rate of fire, magazine, reserve, reload time, price, kill reward, move speed, range falloff, a fixed 30-entry SPRAY PATTERN (per-bullet view-punch offsets), and an accuracy model.
- Accuracy model: first shot while standing still (or below ~34% of max speed) is pin-accurate. Inaccuracy grows with speed, jumping (huge), and consecutive shots; crouching reduces it; recovery after you stop is fast. Pattern recoil is deterministic (learnable), small random spread is added on top.
- View punch decays back to center after you stop shooting. Aim punch affects the camera, not just bullets.
- Hitboxes: head x4, chest x1, stomach x1.25, arms x1, legs x0.75. Hit capsule per body part, not one box.
- Armor: health damage = dmg x armor-pen ratio, armor absorbs (dmg - health damage) x 0.5. Helmet protects the head, no helmet means headshots ignore armor.
- Wall penetration for thin materials (wood crates, thin doors) with damage loss, none for thick walls. Show different impact decals and sounds by material.
- Hit feedback: hit marker, kill sound, damage direction indicator, killfeed with headshot and wallbang icons. No kill-cam slow-mo.

| Role | Weapon (invent names) | Dmg | RPM | Mag | Price | Kill $ | Notes |
|---|---|---|---|---|---|---|---|
| Pistol, both | starter pistol | 35 | 350 | 12 | free | 300 | accurate, slow |
| Pistol, Breachers | burst/auto pistol | 30 | 400 | 20 | 200 | 300 | weak vs armor |
| Hand cannon | Deagle-like | 63 | 270 | 7 | 700 | 300 | one-tap headshot, bad on the move |
| SMG | fast, cheap | 26 | 850 | 30 | 1250 | 600 | strong vs eco rounds |
| Rifle, Breachers | big-damage rifle | 36 | 600 | 30 | 2700 | 300 | one-tap headshot at range, hard spray |
| Rifle, Sentinels | smoother rifle | 33 | 666 | 30 | 3100 | 300 | easier spray, lower damage |
| Scout | bolt rifle | 88 | 45 | 10 | 1700 | 300 | cheap pick, one-shot to head |
| Sniper | heavy bolt sniper | 115 | 40 | 10 | 4750 | 100 | one-shot body to 100 hp, 2 zoom levels, big move-speed penalty |
| Shotgun | pump | 26 x9 | 70 | 8 | 1050 | 900 | short range |
Knife always available. Rifle headshot with helmet must still kill at close to mid range, that is the CS "one-tap" feel.

## Utility
Flashbang ($200, max 2), smoke ($300), HE grenade ($300), fire grenade ($400). Max 4 total.
- Throw: left click = far, right click = short, both = lob. Physically bounce off walls, with a visible trajectory preview only in the Deathmatch practice mode.
- Flash: white-out and ringing based on distance and whether you are facing it, 1.8 to 4.9 s, affects bots (they turn away and shoot blind).
- Smoke: volumetric sprite cloud, radius 3.7 m, 18 s, blocks bot and player line of sight, dissipates when an HE goes off inside.
- HE: up to 98 damage with falloff, armor reduces. Fire: area denial burning 7 s, bots path around it.
- Defuse kit $400, kevlar $650, kevlar+helmet $1000.

## Economy
Start $800, max $16,000. Round win: $3250 (bomb win/defuse win $3500). Loss bonus streak: $1400, 1900, 2400, 2900, 3400 (resets on a win). Planting: $300 to planter, $800 to the whole Breacher team even if they lose. Kill reward by weapon class (table above). Players keep weapons they survive with. The scoreboard (Tab) shows teammates' money only, never the enemy's. The buy menu has a "rebuy last loadout" button.
Buy menu: opens with B, category columns with hover stats, quick-buy numeric keys, a default "buy for me" button. Bots buy sensibly: rifle when they can afford it plus armor and a kit, eco/force-buy/full-buy decisions as a team.

## The map (one, original)
Name it yourself. Layout inspired by the classic two-site, three-lane structure but NOT a copy: Breachers spawn on one end, Sentinels on the other, about 90 x 70 m. Requirements:
- Two bombsites (A and B), each with a few boxes to hide behind and a default plant spot.
- Three routes: a long open lane, a mid lane with a door, and a short route. One tunnel. One elevated sniper nest with a ladder or ramp.
- Chokepoints sized for smokes and flashes (3 to 5 m wide), several one-way peeks, boxes to jump onto, a few thin wooden walls for wallbangs.
- Callout labels on the radar and as location text on screen (bots use them in radio text).
- Built from a data array of boxes/ramps/stairs, merged into a few meshes. Procedural textures: sandstone, plaster, wood crates, metal doors, tile. Bright sun, shadow map, clean readable lighting. Enemy characters must clearly contrast with backgrounds (team colors, light vest vs dark background trims).
- Build a nav graph (waypoints + links) along the map, auto-validated.

## Bots (this decides whether the game is fun)
- Skill levels: Easy, Normal, Hard, Expert. Controls reaction time (400 ms down to 180 ms), aim error, ability to spray-control, crosshair placement at head height, and how well they counter-strafe before shooting.
- Perception: vision cone with line-of-sight raycasts (smokes block), hearing for footsteps, gunshots, bomb plant, defuse. Sound has range and wall muffling.
- Team brain per round: Breachers choose a plan (rush A, rush B, split, mid control, slow default), Sentinels choose a setup (2-1-2 default, stack a site, aggressive mid). Bots announce with radio text lines and subtitles. A defender seeing a plant calls a rotate and retakes the site together.
- Individual behavior: holds an angle, peeks and shoots (stops moving before firing), clears corners, throws smokes and flashes before entering a site, hunts the bomb carrier, plants when site is clear, defuses with cover from teammates, saves weapon when the round is lost, drops a gun for a teammate on request.
- Navigation: waypoint graph for routes plus grid A* for local movement. Anti-stuck detection with jump/strafe recovery.
- No cheating: bots get no wallhack, no perfect aim. Allow a small mercy handicap on Easy only.
- Difficulty must feel fair: a good player should win some rounds on Hard, and be pushed on Expert.

## HUD and UI
- HUD: health, armor, money, ammo/reserve, round timer, bomb timer, team score and alive icons, killfeed, crosshair, radar (top-left, rotating, shows teammates and spotted enemies, callouts).
- Crosshair settings like CS: style, size, gap, thickness, color, dot, outline, dynamic spread toggle. Save locally.
- Scoreboard (Tab): K/D/A, damage, money, ping-less. Round-end summary with MVP.
- Main menu with a 3D map flythrough background, settings (sens, FOV, crosshair, volume, graphics quality, keybinds), difficulty, mode, side.
- Pause menu. Esc must release pointer lock cleanly and resume with one click.

## Controls
WASD move, mouse look, LMB fire, RMB scope/alt fire, R reload, Shift walk, Ctrl crouch, Space jump, 1-5 weapon slots, Q last weapon, G drop, E use (plant/defuse/pickup), B buy, Tab scoreboard, M mute. Gamepad and mobile are out of scope, say so in the README.

## Audio (all procedural, Web Audio)
Distinct per-weapon shots with distance low-pass and reverb, spatialized with HRTF panning, footsteps by surface, bomb beep that accelerates, defuse sound, reload clicks, flash ringing, radio blip, round start and end stingers. No music during rounds, a short menu loop only.

## Performance
Merge static geometry, instance repeated props, pool tracers, decals and particles, adaptive resolution, quality presets (low: no shadows). Target 60 fps with 10 characters on a mid laptop. Sim must stay under 2 ms per tick with all bots.

## Milestones (in this order)
1. Scaffold: Vite + TS + three, fixed-tick sim/render split, pointer lock, movement feel with real accel/friction/air-strafe in a gray-box room. Test: strafe-stop and jump distance numbers.
2. One gun properly: pistol and rifle with viewmodels, spray patterns, accuracy model, hit capsules, armor, sounds. Target dummies with timers.
3. Map v1 (gray-box, correct dimensions), nav graph, validation script.
4. Bot core: perception, shooting, nav, one bot vs player, then 5 vs 5 with no objective.
5. Round loop: bomb plant/defuse, win conditions, freeze time, scoring, side swap, scoreboard, killfeed, spectate.
6. Economy and buy menu, all weapons, armor, kit.
7. Utility: flash, smoke, HE, fire, plus bot use of utility and team tactics.
8. Map art pass (textures, lighting, props, sky), character models, viewmodels, post-processing, menu scene.
9. Audio pass, crosshair editor, settings, deathmatch mode, stats.
10. Balance pass using the sim harness, README, `DECISIONS.md`, deploy config, final report.

## Verification (agent runs, no user input)
- `npm run build` has zero TS errors at every milestone.
- `npm run sim`: pure-Node headless simulation, bots only, 100 full matches in a few minutes. Assert: no crash, no round stuck over 150 s, no bot stuck for over 8 s, bomb plant and defuse both occur, both sides win a fair share (target 40 to 60 percent Breacher round win rate, adjust map and bot behavior if not), average round length is sane, money never negative or above cap.
- Movement unit tests: strafe-stop time under 0.15 s, jump height and distance within 5 percent of target, no wall-clipping at 1000 random wall-hugging inputs.
- Gun tests: each weapon's TTK and spray pattern snapshot, headshot one-tap rules (rifle at range, helmet case), armor math.
- Playwright headless Chromium (preinstalled at `/opt/pw-browsers`, do not run `playwright install`): load the built game, click through menu, buy, play a few seconds, take screenshots, assert no console errors and an FPS floor. LOOK at the screenshots and fix obvious visual problems.
- Add `?debug` flags (FPS line, `god`, `bots=0`, `round=n`, `money=16000`) for tests and tuning.

## Honest risks
- Stylized, not photoreal. No pro art assets. Lighting and animation carry the look.
- Bot quality is the single biggest risk. A headless sim proves they do not break. It cannot prove they are fun. Plan on 1 or 2 manual tuning rounds after the first playtest.
- Mouse feel cannot be judged headless. Numbers above are the best known values, expect small tweaks.
- Real wall-banging, perfect hit registration and tick-accurate Source movement are approximations.
- No online multiplayer. It would roughly double the project (netcode, lag compensation, server). Out of scope on purpose.
