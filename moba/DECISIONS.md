# LANEFALL: plan, decisions and known gaps

Built autonomously, so these are the calls that were made without asking. Updated at the end of the build.

## Plan (phases, each ends with a test gate)

1. Vertical slice: mid lane only, one champion, minions, towers, nexus, click-to-move, auto attacks, last-hit gold.
2. Full map: three lanes, inhibitors, super minions, XP and levels, five champions with all abilities.
3. Bots (three difficulties), items and shop, recall, economy.
4. Polish: sound, particles, minimap, fog of war, jungle camps, scoreboard, menus.
5. Performance and balance pass, tests, README.

## Decisions

- **Original IP only.** The game is called LANEFALL. Champions, abilities, items and lore are invented. Only genre mechanics are borrowed (lanes, minion waves, towers, last hitting, gold, items, levels).
- **TypeScript + Vite + Three.js**, same stack as `shooter/`. Own `package.json`, dev server on port 5174.
- **Simulation is separate from rendering.** `src/sim/` has no DOM or Three.js imports. It runs at a fixed 30 Hz and is driven by commands (move, attack, cast, buy...). The player, the bots and the test harness all push the same commands. This is what makes the headless bot-vs-bot test possible and keeps LAN multiplayer a realistic v2.
- **The sim runs under plain Node.** Files use explicit `.ts` import extensions and only erasable TypeScript syntax (`erasableSyntaxOnly`), so `node tests/sim.ts` works with no extra tooling.
- **Data-driven balance.** Champions, items, minions, structures and global tunables live in `src/data/*.ts` as plain objects. Balance edits never touch logic.
- **Procedural everything.** Meshes are built from primitives, ground texture comes from a canvas, audio is WebAudio synthesis. No asset files.
- **Units scale.** 1 world unit is roughly 50 "genre units" (a champion is about 1.3 wide, melee range 3.5, ranged range 11). Map is 220 x 220 and point-symmetric: blue base bottom-left, red base top-right.
- **Instant-cast abilities.** No cast windups. Telegraph delays on ground abilities and projectile travel time carry the skill element.
- **Quick cast.** Pressing Q/W/E/R casts at the cursor immediately, like quick-cast in other MOBAs. A range ring previews while the key is held.
- **Mirror match.** Both teams field all five champions. The player picks one and the other four teammates are bots.
- **Bots use the same fog rules as the player** (no map hacks). Difficulty changes reaction time, aim, last-hit quality and macro decisions, not stats, except a small gold bonus on Hard.
- **Single player only.** No networking in v1.

## Known gaps

(filled in at the end)
