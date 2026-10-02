# Decisions and known gaps

Built autonomously, so these are the calls that were made without asking.

## Decisions

- **3D with Three.js, no assets.** Models are boxes and cylinders, textures are canvas generated, audio is Web Audio synthesis. It looks stylized, not photoreal. Lighting, bloom, fog, rain, light cones and animation carry the look. Zero asset downloads means nothing can 404 or cost money.
- **Custom collision and AI instead of a physics engine.** AABB world, one grid based nav mesh with A* and string pulling. Enemies stay on the ground plane. The player can climb up crates and stairs, enemies cannot.
- **All missions unlocked.** It is a vertical slice, so Mission 2 is available from the start.
- **Loadout is two guns.** Slot 1 and 2, switch with `1`, `2`, `Q` or wheel.
- **Checkpoints rebuild the mission.** Dying restarts from the last checkpoint with fresh ammo. Enemies in cleared zones stay gone.
- **Health regenerates.** Call of Duty style, after 4.5 seconds without damage.
- **Hitscan weapons and enemy fire.** Enemy accuracy depends on distance, player movement and difficulty. Tracers are always shown.
- **Pointer lock.** Esc opens the pause menu. If the browser refuses pointer lock, a click-to-resume screen appears.
- **Performance.** Static level geometry is merged into 3 meshes, particles/tracers/decals are pooled, resolution scales down automatically if the frame rate drops. Quality presets: low (no shadows/bloom), medium, high.

## Known gaps

- Looks are boxy. Real art assets would be the biggest upgrade.
- Mobile aiming is basic. No aim assist yet.
- Enemies cannot climb or use elevated positions.
- No multiplayer (out of scope by design).
- Audio is synthesized, so voices are radio blips with subtitles, not speech.
- Tested headless (software rendering) and on an emulated phone. Not tested on real hardware or in Safari/Firefox.
