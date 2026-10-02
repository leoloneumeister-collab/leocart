# Decisions and known gaps

Built autonomously, so these are the calls that were made without asking.

## Decisions

- **Feel before looks.** Movement, recoil and the economy loop got the effort first, art last, as in the build spec. The map and characters are boxy and stylized on purpose.
- **Original content.** The prompt asked for CS:GO feel, not CS:GO assets. Name, map, team names, weapon names and sounds are all original. Weapon roles and numbers follow the genre.
- **Simulation first.** All rules live in `src/sim` with no DOM or Three.js, on a fixed 64 Hz tick. That makes headless bot matches (`npm run sim`), deterministic tests and a clean render interpolation possible. Seeded random numbers only, the same seed gives the same match.
- **Units.** Metres and seconds. Source numbers are converted at 1 unit = 0.0254 m (250 u/s run = 6.35 m/s). Hull 0.8 x 1.83 m, crouch 1.37 m, step 0.46 m.
- **Crouch and walk acceleration.** Pure Source acceleration makes crouch walking take almost a second to reach speed (friction at low speed eats the acceleration). Acceleration is scaled by at least 75 percent of the weapon's run speed so crouch and shift walk feel responsive, while stopping and counter strafing keep the CS timing (under 0.1 s).
- **Spray patterns.** Generated deterministically per weapon from a seed (pitch curve plus a sway), 40 entries instead of 30. Bullet 1 is always exact. They are patterns in the CS spirit, not copies of CS patterns.
- **Camera recoil.** The camera shows 45 percent of the punch, bullets use 100 percent, as in CS:GO.
- **Hitscan.** Bullets are instant, with distance falloff per weapon. Wallbangs only go through wood and crates (thin or not too thick), at most one wall for most weapons and two for the heaviest.
- **Friendly fire is off.** Easier on a human with bot teammates. Flashes still blind teammates. Grenades and fire never hurt your own team.
- **Teams.** Sentinels defend (CT role), Breachers attack (T role). Squads keep their identity across the side swap, so scores follow the squad.
- **Ramps are stairs.** Collision uses 12 cm steps so the movement code stays simple and robust. The renderer draws a smooth wedge over them. Step height is 0.46 m, so ramps never snag.
- **No door.** The "mid door" is a doorway chokepoint with a lintel, not an animated door. It plays the same way for bots and players.
- **Nav grid from collision.** Bots navigate on a 1 m layered grid built automatically from the same collision world, so nobody places waypoints by hand and the map validator (`npm run validate`) can prove every route, hold and site is reachable.
- **Bots are honest.** No wallhack, no perfect aim. They use the same line of sight (walls and smoke), the same hearing events (footsteps, shots, plant, defuse) and the same recoil. Skill levels change reaction time, aim error, turn speed, spray control, head aim, counter strafe discipline and utility use.
- **Bot plans.** Each round Breachers pick a plan (long rush, tunnels rush, or slow plays through short and mid that wait 10 to 30 s behind smoke and flash). Sentinels pick a setup (2-1-2, stack A, stack B, heavy mid). Defenders rotate when two or more enemy contacts show up at one site. After a plant the Breachers dig in and the Sentinels stage a retake with smoke, HE and flashes.
- **Bot economy.** Teams decide pistol, eco, force or full buy from average money and the loss streak. Two players per team always carry a smoke.
- **Headshot aim.** Bots aim at the head only some of the time (10 to 60 percent by skill). At full headshot aim, matches were decided by the first shot and rounds were over in seconds.
- **Balance target.** Bot only matches land near 50 percent round win rate for Breachers (41 to 59 percent across several 10 match runs, about 52 percent on average). The rate is a result of tuning, `npm run sim` fails if it drifts outside 30 to 70 percent.
- **Plants are rarer than in real CS.** Most bot rounds end by elimination before a plant. The objective still happens (roughly 9 to 13 percent of rounds plant) and matters most when a human is playing. Tuning lever: `execAt` delays and rotation thresholds in `teamai.ts`.
- **Deathmatch weapons.** Free for all spawns with a random rifle or SMG and pistol, and the buy menu gives anything for free. There is no grenade trajectory preview, grenades are not part of Deathmatch.
- **Pointer lock.** Raw (unadjusted) mouse input is requested, with a fallback. Esc, alt tab or a refused lock pauses the game. The buy menu releases the mouse so it can be clicked, closing it takes the mouse back.
- **No music in rounds**, one short menu loop only, as specified.
- **Performance.** Static map geometry is merged into 6 meshes, particles are pooled GPU points, a single directional light with a shadow frustum that follows the player, pixel ratio and shadow size follow the quality setting. A typical frame is about 200 draw calls and 9,000 triangles. The simulation averages about 25 microseconds per tick with 10 bots, the 99th percentile is 0.15 ms (budget 2 ms). Path searches are capped at one per tick to avoid spikes.

## Known gaps

- Looks are stylized. Real art assets would be the biggest upgrade. Hands in first person are simple boxes.
- Bots do not use jump or crouch tactically, do not throw molotovs at doors, do not lurk, and never boost each other. Their callouts are text with a radio blip, not speech.
- No walking on crates or boosting by design of the nav grid, bots never climb anything above step height.
- Rounds end by elimination more often than a human match would. See above.
- Sounds are synthesized, so they are functional more than beautiful. Not listened to on real speakers in testing.
- Not tested on real GPUs, on Safari or on Firefox. Headless Chromium with software rendering only, so frame times were never measured on real hardware.
- No online multiplayer, gamepad or touch (out of scope on purpose).
