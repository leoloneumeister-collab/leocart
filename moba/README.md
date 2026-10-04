# LANEFALL

A single-player 5v5 MOBA that runs in your browser on localhost. You control one champion, nine bots control the rest. Three lanes, minion waves, towers, inhibitors, a jungle, items, levels and a nexus to destroy. Everything is generated in code: models, terrain, music and sound effects. There are no asset downloads.

> **Unofficial.** LANEFALL is an original game in the MOBA genre. It is not affiliated with, endorsed or sponsored by Riot Games. It uses no Riot names, characters, art or sounds. Only genre mechanics (lanes, minion waves, towers, last hitting, gold, items, levels) are shared with other games of the genre.

## Run it

```bash
cd moba
npm install
npm run dev        # http://localhost:5174
```

Pick a champion, a lane, a bot difficulty and start. It plays on any modern desktop browser with WebGL. Chrome or Edge recommended.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 5174 |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the production build on port 5175 |
| `npm test` | Everything below |
| `npm run test:sim` | Headless tests only (no browser needed) |
| `npm run test:smoke` | Browser smoke test (needs Chromium, builds first) |
| `npm run bench` | Bot skill ladder (Normal allies vs Easy, Normal, Hard enemies) |

## The game

Destroy the red nexus before they destroy yours. Matches last about 15 to 30 minutes.

- **Map:** top, mid and bottom lanes plus a jungle with six camps per side and a river. Per team: 3 towers per lane, 1 inhibitor per lane, 2 nexus towers and a nexus. Inner structures cannot be hit until the one in front falls.
- **Minions:** a wave leaves each base at 1:05, then every 30 seconds: 3 melee, 3 casters and a cannon every third wave. When an enemy inhibitor falls your team spawns super minions in that lane until it respawns after 5 minutes.
- **Economy:** gold from last hits, kills, assists, structures and passive income. XP from nearby kills. Levels 1 to 18. Ultimates unlock at 6, 11 and 16.
- **Shop:** 20 items in three tiers (attack, attack speed, magic, defense, health, boots). Buying an upgrade refunds the components you already own. Recall with `B` and shop only in your base.
- **Jungle:** killing the Crystal Golem grants a damage and speed buff for 100 seconds.
- **Fog of war:** you and the bots only see what your team sees. It can be switched off in the menu.

### Champions

| Champion | Role | Passive | Q | W | E | R |
|---|---|---|---|---|---|---|
| Ironvow | Fighter | Grit: armor stacks as you hit champions | Breaker's Lunge (dash + slam) | Bulwark Oath (shield + speed) | Quakeline (slowing stomp) | Iron Verdict (leap, knock up) |
| Ysolde | Mage | Spellweave: speed after casting | Ember Lance (skillshot) | Frost Bloom (delayed slow field) | Mirror Step (blink + shield) | Cataclysm (delayed meteor, stun) |
| Kestrel | Marksman | Keen Eye: stacking attack speed | Rapid Volley (attack speed) | Piercing Bolt (piercing slow) | Backflip (dash) | Skyfall Arrow (map-long pierce) |
| Oakhelm | Tank | Thick Skin: 8% less damage | Rootbind (stun skillshot) | Bark Armor (shield + armor) | Stomp (health scaling slow) | Landslide (area knock up) |
| Sable | Assassin | Opportunist: bonus vs low health | Venom Dart (slowing dart) | Shadowstep (teleport strike) | Smoke Veil (dash + speed) | Death Mark (dive, executes) |

### Bots

Bots use exactly the same commands as the player and only react to what their team can see. They last hit, trade, retreat when hurt, recall to heal and shop, clear jungle camps (the assassin), defend structures and group to push after the early game. Difficulty changes how well they play: reaction time, last hitting, aiming, dodging and macro decisions. On Easy they also earn 15% less gold, on Hard 12% more. Your own bot teammates always play at Normal.

## Controls

| Input | Action |
|---|---|
| Right click | Move, or attack the enemy under the cursor |
| `Q` `W` `E` `R` | Cast at the cursor. Hold to preview range and area |
| `Shift` + `Q/W/E/R` | Spend a skill point (or click the `+` above an ability). Not `Ctrl`: browsers reserve `Ctrl+W` and `Ctrl+Q` |
| `A`, then left click | Attack-move |
| `S` | Stop |
| `B` | Recall (8 seconds, interrupted by damage or moving) |
| `P` | Shop (only in your base) |
| `Tab` (hold) | Scoreboard |
| `Space` (hold) | Center camera on your champion |
| `Y` | Lock or unlock the camera (locked by default; unlock to pan with the screen edges) |
| Screen edge or arrow keys | Pan the camera |
| Mouse wheel or `+` `-` | Zoom |
| Minimap | Left click moves the camera, right click moves your champion |
| `Esc` | Pause |
| `]` | Debug fast-forward: cycles x1, x2, x4, x8 |

## Tuning the game (no code changes needed)

All balance lives in plain data files under `src/data/`:

| File | What is in it |
|---|---|
| `config.ts` | Wave timing, minion growth, gold and XP, respawn timers, recall, vision, inhibitor timers |
| `champions.ts` | Base stats, growth, passives and the four abilities of every champion, plus the bot build order |
| `items.ts` | Items, recipes, prices and stats |
| `units.ts` | Minion, tower, inhibitor, nexus and jungle monster stats |
| `map.ts` | Lane paths, structure positions along each lane, rocks, walls and camp spots |

Ability numbers are arrays indexed by rank. Distances are world units (a champion is about 1.3 wide, melee reach 1.7, ranged reach 10 to 12). After editing run `npm run test:sim`; the bot matches are a quick check that games still finish.

## How it is built

```
src/
  data/      plain-object game data (see above)
  sim/       the game itself. No DOM or Three.js. 30 Hz fixed step, deterministic from a seed
  render/    Three.js scene: skinned procedural heroes, instanced animated crowd, terrain, water, foliage, VFX, post processing
  ui/        HUD, shop, minimap, menu, screens (plain DOM + 2D canvas for health bars)
  audio/     WebAudio synthesis for effects and music
  game.ts    ties input, sim, renderer, HUD and audio together
tests/       headless sim tests, ability tests, bot ladder, browser smoke test
```

- **Simulation is separate from rendering.** `src/sim` never touches the DOM. Everything the player, the bots and the tests do goes through commands (`move`, `attackMove`, `attack`, `stop`, `cast`, `levelUp`, `recall`, `buy`, `sell`). This keeps the tests simple and makes online multiplayer a realistic future step.
- **Runs under plain Node.** `node tests/sim.ts` works with no build step (Node 22.18+), because the sim only uses erasable TypeScript syntax and explicit `.ts` imports.
- **Deterministic.** The same seed and the same commands always produce the same match (checked by the tests).
- **Pathfinding** is a 2 unit grid with A* and string pulling. Units slide around round obstacles. Structures block movement until destroyed.

## Visuals

Everything is generated in code, no asset files and no downloads.

- **Post processing:** MSAA HDR render target, bloom (glowing runes, crystals and spells are brighter than 1.0), ACES tone mapping, a small colour grade and vignette. `Graphics: Low` skips the composer, shadows and outlines.
- **Look:** stylised PBR with painterly colour noise, rim light, fake ambient occlusion and inverted-hull ink outlines (`src/render/materials.ts`).
- **Heroes:** each champion is one skinned mesh per material bucket on a shared 20 bone humanoid rig, plus spring-driven capes, hair, scarves, plumes and beards. Locomotion, attack, cast, stun, knock up, dash, recall and death are animated procedurally (`src/render/biped.ts`, `src/render/heroes/*`). A hero costs about 8 draw calls.
- **Minions and jungle monsters:** instanced models whose limbs, wheels, flags and weapons are animated in the vertex shader from per-instance phase, move, attack and death values (`src/render/crowd.ts`, `src/render/minions.ts`). Hundreds of units cost a handful of draw calls.
- **Map:** painted 2048 or 4096 px ground texture (bases are tiled stone platforms with runes), animated river, instanced trees, bushes, grass, flowers, mossy rocks and cliffs, all swaying in the wind.
- **Structures:** towers, inhibitors and the nexus have glowing runes, floating crystals and spinning rings, and collapse into rubble.
- **Spell effects:** per-spell projectile visuals with ribbon trails, shockwaves, light pillars, dash streaks (`src/render/vfx.ts`).
- **Portraits:** HUD, menu and scoreboard use 3D-rendered busts of the models.

Look-dev tools (need `npm run dev`): `/?gallery=1` shows all heroes (`&only=ysolde&state=attack&angle=1.2`, `&crowd=1` for minions and monsters), `node tests/lab.mjs out.png '{"state":"idle"}'` screenshots it, `node tests/scene.mjs out.png '{"min":3,"focus":"minions"}'` frames a spot in a real match, `node tests/vfx.mjs ysolde "0,3"` casts abilities and screenshots them.

## Tests

`npm test` runs, in order:

1. `tests/sim.ts`: four full bot-vs-bot matches (all difficulties) at accelerated time. Each must end with a nexus kill within 45 game minutes, stay finite (no NaN), and the same seed must reproduce the same world.
2. `tests/abilities.ts`: every ability of every champion, cooldown and mana rules, super minions, inhibitor respawn, backdoor protection, XP.
3. `tests/slice.ts`: a scripted champion pushes the mid lane alone and wins.
4. `tests/smoke.mjs`: builds the app, opens it in headless Chromium, plays real mouse and keyboard input, checks the 3D canvas renders, then forces a win and checks the end screen.

## Deploy

It is a static site. `npm run build` produces `dist/`. The repo's GitHub Pages workflow publishes it at `/moba/`.
