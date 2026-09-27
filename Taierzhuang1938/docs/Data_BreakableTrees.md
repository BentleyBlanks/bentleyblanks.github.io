# Breakable dead trees

First-level scenery uses 84 deterministic placements across the front, village,
transfer area and rear. `Data_BreakableTreePlacements` reserves authored roads,
railway, trenches, mission routes, objective areas and all scenario blocks before
sampling. Trees vary in yaw and uniform scale; the same seed reproduces the field.
The old yard's authored landmark remains part of the whitebox layout.

`Script_BreakableTrees` belongs to `FirstLevelWhiteboxField`. Standing trees use
spatial instance batches. `Combat.Blast` applies distance-squared falloff and world
occlusion after structural destruction. A broken tree retains its stump and loses
its upper static collider; the crown becomes an ordinary mesh with a Rapier body.
`Combat.Update` follows the physics step and synchronizes the crown. Analytic soil
support samples the crown's directional extrema; settled visual debris stops
consuming a dynamic body. Falling wood does not push living characters. Field
disposal releases instance buffers, geometry, textures, materials and bodies.

## Distance detail (rendering budget)

At full detail every tree costs 12,251 triangles in each pass that draws it. With all 84
trees at that level the 03 captures rose from 7.78 M to 9.81 M triangles per frame, above
`SCENE_RENDER_LIMITS`. Measured from the right nest facing north, 64 visible trees in the
prepass and main pass cost 1.57 M, and the shadow bake cost another 0.28 M.

`Script_Main.RenderScene` calls `BreakableTrees.UpdateView(camera)` once per frame, before the
first render. Each tree takes the level given by `Data_Tuning_BreakableTrees.lod`. Near trees
use the shipped mesh. Distant trees use `ClusterDistantGeometry` copies of the same bark, built
once at load. A level change moves a static tree to another static batch of its sector. No
instance moves in the world, so the MotionVector rule for static instances (camera velocity)
still holds. Fallen crowns switch their bark geometry by the same level.

The fracture caps sit inside a standing tree. Only broken stumps draw their cap; the crown's
cap appears only on the fallen mesh. Empty batches are hidden, so a sector normally submits two
draws per pass. After the change, the same north-facing view costs 0.20 M triangles for the
trees across all passes, down from 1.85 M.

## Source and rebuild

User supplied `Tree_50K.fbx` and `Tree_50k_1.fbx` from the local FPS/tree directory.
Despite their names, both contain 499,875 triangles. Their geometry, UVs and embedded
textures match. This is one unique tree; placement variation does not imply a second
species. Source ownership/licensing remains with the supplied files; no CC0 claim.

Geometry digest (source vertex/index audit):
`2e8689ce374c451ceffad0e63d764954c39df1998080acc5f914fb3740042d48`.

The bake removes the flat soil disc, retains the root flare, scales to 7.2 m and
decimates before cutting a matching jagged fracture at 0.9 m. Source PBR becomes
2K; the closed cut faces get procedural wood grain. Final geometry: 2,083 stump +
10,168 crown = 12,251 triangles, a 97.55% reduction. Four primitives, two materials,
13.6 MB GLB. Actual geometry and Y-up dimensions are measured by the tests.

Rebuild script: `_blender/Script_BakeBreakableDeadTree.py`. Run it through the task's
BlenderMCP `exec` entry with `sys.argv` containing `-- --source <FBX> --out <Model>`
and `--blend-dir <source engineering directory>`. The script starts a fresh file;
save current work first. Source engineering directory:
`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\BreakableDeadTree`.
The FBX stays read-only. The repository contains only the GLB, recipe and audit.

## Verification

`node Taierzhuang1938/Script_BreakableTreesTest.mjs` checks deterministic placement,
clearance, damage falloff and the actual GLB budget.
`node Taierzhuang1938/Script_BreakableTreesBrowserTest.mjs` checks the real first-level
high-quality renderer, Combat explosion path, standing/removed colliders, falling,
ground contact, occlusion, repeat hits and resource disposal. It also checks the distance
levels: the tree beside the camera is at full detail, distant trees use the clustered
copies, each tree is drawn once, and caps are drawn only on broken stumps. Screenshots and reports
stay under ignored `_shots/BreakableTrees`; they are not published assets.
