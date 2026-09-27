# Breakable dead trees

First-level scenery uses 130 copies of the supplied dead-tree model: 84 deterministic
scatter placements plus 46 authored replacements (35 former green block trees along
the east/west field edges, south road and rail approach, the collection area and exits, plus 11 primitive dead trees).
`Data_BreakableTreePlacements` reserves authored roads,
railway, trenches, mission routes, objective areas and all scenario blocks before
sampling. Trees vary in yaw and uniform scale; the same seed reproduces the field.
Authored tree anchors retain their positions and heights. Their layout trunk records
carry `treeModel` metadata and reserve space for dressing; `FirstLevelWhiteboxField`
skips their box geometry and static colliders. `BreakableTrees` alone draws and owns
their destructible colliders. The green crowns/tips and old-yard box branches have
been removed. River reeds are separate scenery and remain unchanged.

The replacement removes 310 primitive crowns, branches, leaders and twigs. A layout
comparison against `ed4d9e60` verifies every non-tree block and trench placement is
unchanged. The south-layout fingerprint is regenerated from runtime commit
`76da735a`; its terrain, aftermath bodies and trench-prop hashes remain unchanged.
`Script_BreakableTreesTest` checks the actual enlarged trunk footprints against all
mission routes with 0.625 m litter clearance. The browser regression checks every
authored replacement for duplicate legacy colliders and captures nine tree locations.

`Script_BreakableTrees` belongs to `FirstLevelWhiteboxField`. Standing trees use
spatial instance batches. `Combat.Blast` applies distance-squared falloff and world
occlusion after structural destruction. On fracture, the sector's static batches
are rebuilt without the broken crown, shrinking their draw counts. Hidden crowns
consume no vertex work and empty crown batches stop drawing. A broken tree retains its stump and loses
its upper static collider; the crown becomes an ordinary mesh with a Rapier body.
`Combat.Update` follows the physics step and synchronizes the crown. Analytic soil
support samples the crown's directional extrema; settled visual debris stops
consuming a dynamic body. Only the active falling set receives per-frame updates;
settled crowns freeze their local/world matrices and leave that set. Explosions
scan only the standing set. Stumps keep their small static collider; settled
crowns have no collider, terrain sampling or physics integration. Falling wood
does not push living characters. Field
disposal releases instance buffers, geometry, textures, materials and bodies.

## Distance detail (rendering budget)

Before this model replacement, every tree cost 12,251 triangles in each pass. With all 84
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
trees across all passes, down from 1.85 M. These figures describe the previous mesh;
the replacement's full-detail budget is 4,956 triangles including caps. The same
distance thresholds and clustering remain active for the new mesh.

## Source and rebuild

The 2026-09-27 replacement uses user-supplied `Tree_50k_2.fbx` and
`Tree_50k_3.fbx` from `C:\Users\Bentl\OneDrive\Sync\饮河\FPS\建模\树`.
Each contains 50,000 triangles. Their geometry, UVs, transforms and all four
embedded textures match; only file metadata differs. Both sources share one
runtime asset. Source ownership/licensing remains with the supplied files; no
CC0 claim. `Model/Data_TreeProcessing.json` records both file hashes, geometry/UV
and texture hashes, measured bounds and each source's output triangle count.

Geometry digest (source vertex/index audit):
`3dd0f021dde8ac3951d026fa0cc73c2a3feda067bb30e9832718a240c6285247`.

The new source has a flat trunk base without the former soil disc. The bake
measures the source Z-up vertex cloud, scales to 7.2 m, centers the trunk at the
fracture plane and decimates before cutting a matching jagged fracture at 0.9 m.
Source PBR becomes 2K; closed cut faces get procedural wood grain. Final geometry:
744 stump + 4,212 crown = **4,956 triangles**, a 90.088% source reduction. The 5,000
triangle limit includes both cut caps. Four primitives, two materials, 9,992,452
bytes GLB. Y-up export dimensions and the shipped index count are verified by tests.
Compared with the previous 12,251-triangle runtime tree, each placement uses 59.55%
fewer triangles. The split parts are instanced while intact; ordinary meshes and
a single simple Rapier body are created only on fracture, sharing the same geometry
and textures. No network request or high-resolution asset swap occurs during a blast.

Rebuild script: `_blender/Script_BakeBreakableDeadTree.py`. Run it through the task's
BlenderMCP `exec` entry with `sys.argv` containing
`-- --source <Tree_50k_2.fbx> --source-check <Tree_50k_3.fbx> --out <Model>`
and `--blend-dir <source engineering directory>`. The script starts a fresh file;
save current work first. Source engineering directory:
`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\DeadTreeModels20260927`.
The identical processed mesh is saved as `Scene_Tree_50k_2.blend` and
`Scene_Tree_50k_3.blend`; the recipe rejects mismatching source content rather
than silently treating different trees as duplicates.
The FBX stays read-only. The repository contains only the GLB, recipe and audit.

## Verification

`node Taierzhuang1938/Script_BreakableTreesTest.mjs` checks deterministic placement,
clearance, damage falloff and the actual GLB budget.
`node Taierzhuang1938/Script_BreakableTreesBrowserTest.mjs` checks the real first-level
high-quality renderer, Combat explosion path, standing/removed colliders, falling,
ground contact, occlusion, repeat hits and resource disposal. It also topples all
130 trees, verifies that their dynamic bodies return to zero and static tree
colliders fall from 260 to 130 stumps, and checks that 10,000 subsequent tree updates
perform zero terrain samples. Distance checks verify full detail near the camera,
clustered distant copies, one instance per tree and caps only on broken stumps.
`TREE_PREVIEW_ORIGIN` optionally selects an existing
LocalPreview server; otherwise the test starts its own temporary server. Screenshots and reports
stay under ignored `_shots/BreakableTrees`; they are not published assets.

2026-09-27 replacement verification: the tree browser regression passes with
46 replacements, zero legacy colliders/crowns and zero page errors. All 130 trees
settle after fracture, leaving 130 stump colliders and zero tree bodies; 10,000 idle
updates sample no terrain. Nine regional captures were visually inspected.
Tree clearance, first-level space/front topology, village geometry, mission,
surface and terrain tests pass. This is scoped validation, not a claim that the
entire repository suite is green: the seven-slice `BootTest` timed out at 240 s
after reporting `CH1_NanLu` missing distant IJA identification materials (`count=0`).
The identical CH1 check also fails on unchanged checkout `3a46204d`.
The smoke-origin fixture also has a pre-existing 63-versus-64 count failure,
reproduced from exported `ed4d9e60`; a separate vehicle/tree clearance comparison
finds no overlaps within 3.2 m before or after the replacement.
