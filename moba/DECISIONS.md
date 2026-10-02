# LANEFALL: plan, decisions and known gaps

Built autonomously, so these are the calls that were made without asking.

## Plan (phases, each ended with a test gate)

1. Vertical slice: mid lane, one champion, minions, towers, nexus, click-to-move, auto attacks, last-hit gold. Gate: `tests/slice.ts` (a scripted champion pushes the lane alone and wins).
2. Full map: three lanes, inhibitors, super minions, XP and levels, five champions with all abilities. Gate: `tests/abilities.ts`.
3. Bots (three difficulties), items and shop, recall, economy. Gate: bot-vs-bot matches always end, Hard beats Normal beats Easy (`tests/vs.ts`).
4. Polish: sound, particles, minimap, fog of war, jungle camps, scoreboard, menus, announcements. Gate: browser smoke test.
5. Performance and balance pass, tests, README.

## Decisions

- **Original IP only.** The game is called LANEFALL. Champions, abilities, items and lore are invented. Only genre mechanics are borrowed (lanes, minion waves, towers, last hitting, gold, items, levels). The README and menu carry an "unofficial, not affiliated with Riot Games" note.
- **TypeScript + Vite + Three.js**, same stack as `shooter/`. Own `package.json`, dev server on port 5174, preview on 5175.
- **Simulation is separate from rendering.** `src/sim/` has no DOM or Three.js imports. It runs at a fixed 30 Hz and is driven by commands (move, attackMove, attack, stop, cast, levelUp, recall, buy, sell). The player, the bots and the tests all push the same commands. This is what makes the headless bot-vs-bot test possible and keeps LAN multiplayer a realistic v2.
- **The sim runs under plain Node.** Files use explicit `.ts` import extensions and only erasable TypeScript syntax (`erasableSyntaxOnly`), so `node tests/sim.ts` needs no extra tooling (Node 22.18 or newer).
- **Deterministic sim.** All randomness inside `src/sim` comes from a seeded PRNG. The same seed plus the same commands gives the same match (tested). Rendering uses `Math.random` freely for particles.
- **Data-driven balance.** Champions, items, minions, structures and global tunables live in `src/data/*.ts` as plain objects. Balance edits never touch logic.
- **Procedural everything.** Meshes are built from primitives, the ground texture comes from a canvas, audio is WebAudio synthesis. No asset files, nothing to 404.
- **Units and scale.** The map is 220 x 220 world units and point-symmetric (blue base bottom-left, red base top-right, rotating a blue structure 180 degrees gives its red twin). A champion is about 1.3 wide, melee reach 1.7, ranged reach 10 to 12, tower range 16. Attack range is measured edge to edge, structures from their center.
- **Instant-cast abilities.** No cast windups. Telegraph delays on ground abilities and projectile travel time carry the skill element.
- **Quick cast.** Pressing Q/W/E/R casts at the cursor immediately. A range ring and aim preview show while the key is held.
- **Unit-target abilities approach.** If the target is out of range the champion walks into range, then casts.
- **Mirror match.** Both teams field all five champions. The player picks one and the other four teammates are bots.
- **Lane assignment.** Bots fill the remaining lane slots by role (fighter top, mage mid, marksman and tank bot, assassin roams and clears jungle early).
- **Bots play fair.** They use the same commands and the same fog of war as the player. Difficulty changes reaction time, last hitting, aim prediction, dodging and macro (push timing, defending). Easy enemies also earn 15% less gold and Hard 12% more. The player's own bot teammates always play at Normal.
- **Structures.** Inner structures are protected until the one in front falls (backdoor protection). Nexus towers open when any inhibitor is down, the nexus opens when both nexus towers are down. Inhibitors respawn after 5 minutes, and while one is down the other team gets super minions in that lane.
- **Match length.** Structure health, minion scaling, passive gold and champion speed were tuned so that bot-vs-bot games average about 25 minutes (range 21 to 32 across the benchmark seeds). A human changes that either way.
- **Fog of war is a soft shader effect.** Terrain materials are patched to darken where the viewer's team has no vision. Enemy units outside vision are hidden and cannot be targeted. It can be turned off in the menu.
- **Jungle monsters are intentionally weaker than genre norms** (they are meant to be farmable at level 1 to 3 for the roaming bot). Clearing a Crystal Golem gives a damage and speed buff.
- **Single player only.** No networking in v1.
- **Desktop only.** Mouse and keyboard, no touch controls.

## Known gaps

- **No real-GPU frame rate measurement.** All checks ran in headless Chromium with a software rasterizer. Measured instead: JS main-thread cost per frame in a busy 14 minute game is about 3 ms (sim 0.7, scene sync 0.7, UI 1.3), with about 285 draw calls and 150k triangles including the shadow pass. That leaves ample room for 60 fps on a normal laptop, but it was not measured on one.
- **Time to first match** was measured only under software rendering (about 0.6 s of setup, then shader compile and the first frames). On a real GPU it should be well under the 5 second target, but this was not measured.
- **Bots are decent, not smart.** They do not kite, do not coordinate ability combos, and their jungler only clears camps for the first 5 minutes. They never use the river or flank.
- **No wards, brush or line-of-sight vision.** Vision is circular around friendly units and ignores walls.
- **Skillshots ignore terrain.** Walls and rocks do not block projectiles.
- **Models are low-poly and procedural.** There are no skeletal animations beyond a simple walk, attack and cast pose.
- **Balance is only checked at the macro level.** Bot matches end and difficulty ordering holds, but individual champions and items have not been tuned against each other beyond that.
- **No save data** other than the last menu choices in localStorage.
- **Browser support.** Developed and tested on Chromium. Firefox and Safari should work (standard WebGL and WebAudio) but were not tested.
