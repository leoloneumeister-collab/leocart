# Tidehold

**A base-building and raiding game that runs in your phone browser.** Build an island, collect gold and crystal, train troops, then raid rival islands. Everything on screen and in your ears is drawn or synthesized in code: no image or audio files.

Play it: `https://leoloneumeister-collab.github.io/leocart/tidehold/` (after the branch is merged to `main` and Pages deploys). Add it to your home screen for full screen and offline play.

## How it plays

- **Build.** Gold mines and crystal wells produce while you are away (up to 6 hours banked). Tap them to collect. Builders limit how many things you can build or upgrade at once. Spend pearls to finish early or hire more builders.
- **Train.** Barracks train troops one at a time (crystal), camps hold them, the Forge upgrades them. Five troops: Squire, Slinger, Sapper (breaks walls), Brute (smashes defences first), Glider (flies over walls, raids mines and vaults).
- **Raid.** Pick a rival, a campaign outpost, or test your own island. Tap the shore to drop troops (hold to keep dropping). 50% destruction, the Keep and 100% give a star each. Loot comes from the buildings you destroy, storages and mines pay most.
- **The Beacon (the twist).** Tap the flag, then tap a spot. Troops will prefer targets near it. Aim it at defences first, then loot, instead of watching them wander.
- **Defend.** Cannons and mortars hit the ground, Ballistas also hit flyers. Walls slow troops, bomb traps are hidden. The Defence tab runs a typical army against your own island so you can watch where it breaks.
- **Goals** pay pearls. Pearls also come from clearing rocks and trees and from winning outposts. There is no store and no real money anywhere.

## Run it

```bash
npm ci
npm run tidehold:dev      # http://localhost:5174, also reachable from your phone on the same Wi-Fi
npm run tidehold:build    # tidehold/dist, static files
npm run tidehold:test     # logic tests: economy, saves, generator, battle balance (pure node)
npm run tidehold:e2e      # plays the game on an emulated phone (needs the dev server and Playwright browsers)
npm run tidehold:icons    # redraw the app icons from the game's own art
npm run tidehold:single -- out.html   # one self-contained page (add --fragment for claude.ai artifacts)
```

URL options: `?seed=N` picks the starting island layout (handy for tests).

## Layout

| File | What it does |
|---|---|
| `js/data.js` | Map size, building and troop definitions, cost/time/output curves, quests |
| `js/state.js` | Game state and every economy rule. Pure functions that take a timestamp, so offline progress is just "tick to now" |
| `js/sim.js` | Battle simulation: seeded and deterministic, Dijkstra pathing with breakable walls, defences, traps, the Beacon |
| `js/gen.js` | Procedural enemy islands (campaign outposts and rivals), typical armies |
| `js/art.js` | All sprites: isometric buildings, troops, obstacles, rubble, icons |
| `js/render.js` | Camera, island, depth sorting, particles, overlays |
| `js/input.js` | Tap, hold, pan, pinch and drag-the-ghost gestures |
| `js/ui.js`, `css/style.css` | DOM interface for phones (safe areas, 44px+ touch targets) |
| `js/main.js` | Game controller and loop |
| `js/cloud.js` | Optional cloud copy of the save, active only when the page runs as a claude.ai artifact |
| `public/` | Manifest, service worker, icons |
| `tests/` | `run.mjs` (logic) and `e2e.mjs` (phone playthrough) |

## Decisions and limits

- **Saves live in the browser (`localStorage`) on one device.** When the page runs as a claude.ai artifact it also keeps a copy in the viewer's private database, so progress survives a cleared browser or a new phone. There is no server, so there are no real player-versus-player raids: rivals are generated islands scaled to your Keep and trophies.
- **Timers trust the device clock.** Changing the clock can skip waits. That is fine for a solo game, and it is the first thing a server would own if this ever goes online: timers, loot and battle validation. The battle sim is deterministic on purpose so a server can replay and verify a raid.
- **Balance is measured, not guessed.** `tests/run.mjs` plays a typical army against all 30 outposts with a simple auto-attacker and fails if a stage is unwinnable, if costs do not fit the storage the player has at that Keep level, or if progression curves go backwards.
- **Original everything.** Names, art and sounds are invented for this game.
- **Troops are consumed by a raid.** Survivors do not return. This keeps training and crystal meaningful.
- **Home screen draws at about 30 fps** and full speed in battle, to be kind to phone batteries.

## Ideas for later

Clans and donations, a hero, spells, real asynchronous raids with a small server, push reminders when builds finish, music.
