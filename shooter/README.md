# SHADOW PROTOCOL

A browser-based 3D military shooter in the spirit of Call of Duty: story missions, four guns, enemy types with real AI, a boss fight, procedural sound and music, and a cinematic look. Everything is generated in code, there are no asset downloads.

**Play it:** `npm install && npm run dev`, then open the URL Vite prints. Click **Campaign**, pick a mission, pick two guns, **Deploy**.

## The game

- **Mission 1, NIGHT BREACH:** infiltrate a coastal compound in the rain, destroy three comms relays, fight through a courtyard, warehouse and command yard, then hold out for extraction. Mid-mission twist.
- **Mission 2, DEAD DROP:** harbor district at dawn. Fight through a street, market plaza and warehouse yard, then face Colonel Voss in a three phase boss fight.
- Radio chatter with subtitles, mission briefings, checkpoints, and a graded results screen with local high scores.

### Weapons (pick two per mission)

| Gun | Role |
|---|---|
| VK-7 | Assault rifle, all-rounder |
| HORNET | SMG, fast and close range |
| BREAKER | Pump shotgun, brutal up close |
| LONGBOW | Scoped marksman rifle |
| Knife | Always available (`F`) |

Each gun has its own model, recoil, reload animation, spread and synthesized sound. Shoot explosive barrels. Pick up ammo crates. Health regenerates if you stay out of the fight.

### Enemies

Grunts (cover fire and strafing), Rushers (flank and melee), Heavies (armored, weak to headshots), and Voss (3 phases, grenades, reinforcements, enrage). Enemies use A* pathfinding, line of sight checks, hearing, and group alerts. Three difficulty levels change their accuracy, damage, health and reaction time.

## Controls

| Input | Action |
|---|---|
| `W A S D` | Move |
| Mouse | Look |
| Left click | Fire |
| Right click | Aim down sights |
| `R` | Reload |
| `Shift` | Sprint |
| `C` | Crouch (hold) |
| `Space` | Jump |
| `1` `2` `Q` / wheel | Switch weapon |
| `F` | Knife |
| `Esc` | Pause |

**Mobile:** twin virtual sticks (left move, right look) plus Fire, Aim, Reload, Jump, Duck, Swap and Knife buttons. Touch aiming is the weakest part of any browser shooter, so expect it to be playable rather than perfect.

## Scripts

```bash
npm run dev       # dev server
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build
npm test          # headless browser smoke test (needs Chromium)
```

## Deploy

It is a static site. `npm run build` produces `dist/`.

- **GitHub Pages:** the root `.github/workflows/pages.yml` builds the kart game and this shooter together and publishes the shooter at `/shooter/` (enable Pages with "GitHub Actions" as the source in repo settings).
- **Netlify / Vercel:** `netlify.toml` and `vercel.json` are included, just import the repo.

## Debug URL flags

`?debug` shows an FPS line and exposes `window.__game`. Extra flags (need `debug`): `mission=1|2`, `cp=0..3` (checkpoint), `god` (invulnerable), `q=low|medium|high`, `loadout=vk7,hornet`.

## How it is built

TypeScript, Vite, Three.js. No physics engine and no asset files.

```
src/engine/    renderer + post (bloom, grade), input, procedural audio, save
src/game/      player, collision, nav grid + A*, weapons, enemies, fx, objects, UI
src/game/level level builder (merged geometry, baked fake AO, light cones), sky
src/game/missions   mission 1 and 2 (layout, spawns, objectives, story beats)
src/story/     briefings and radio lines
tests/         headless Playwright scripts
```

See `DECISIONS.md` for the judgment calls and known gaps, and `docs/SUPER_PROMPT.md` for the build spec this game was made from.
