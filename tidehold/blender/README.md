# Tidehold 3D assets (Blender)

Every fighter, building, wall, tree and rock in the 3D game is modelled, rigged and animated by these
scripts using Blender 5 as a Python module (`bpy`). The generated files are committed
(`tidehold/public/models`, `tidehold/public/icons/ui`), so you only need Blender to change the art.

```bash
python3 -m venv ~/bpyenv && ~/bpyenv/bin/pip install bpy==5.0.1 pillow   # ~400 MB, Python 3.11
~/bpyenv/bin/python tidehold/blender/characters.py            # units/*.glb   (add --preview for pose renders)
~/bpyenv/bin/python tidehold/blender/buildings.py             # b_*.glb + props.glb (--preview renders each tier)
~/bpyenv/bin/python tidehold/blender/icons.py                 # icons/ui/*.webp rendered with Cycles
```

Look at models the way the game does: `npm run tidehold:dev`, then open
`/viewer.html?m=units/squire,units/brute&clip=run` (also `b_keep`, `props`; `t=0.3` freezes a frame).

## How the models are made

- `lib.py`: a `Mesher` that builds one mesh from primitives (boxes, cylinders, lathes, roofs) with
  vertex colours, so each model is one material and one draw call. `Rig` makes a skeleton whose bones
  all point along +y, so pose angles are plain armature-axis rotations.
- `characters.py`: Squire, Slinger, Sapper, Brute and Glider. Each has `idle`, `run`, `attack` and
  `die` clips (30 fps) written as code: cycles are sine-based, attacks are keyed poses.
- `buildings.py`: 12 building types with three upgrade tiers (levels 1-2, 3-4, 5-7), wall pieces, the
  construction scaffold, rubble, obstacles, palm and beacon. Moving parts are separate objects
  (`<root>__turret`, `__barrel`, `__flame`, `__shards`, `__hammer`) and loop as `<root>_loop` clips.
  Team banners are objects named `__banner*` that the game recolours (blue for you, red for rivals).
- Units face -y in Blender, which is +z in glTF. Scale is 1 unit = 1 map tile.

The meshes are hand-written procedurally, not sculpted. Open the scripts to change a shape, or import a
GLB into Blender to edit it by hand.
