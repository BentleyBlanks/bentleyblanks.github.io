# External prop sources and attribution

The files in `Taierzhuang1938/Model/Model_ChineseRuralHouse.glb`,
`Model_Handcart.glb`, `Model_WoodFence.glb`, `Model_WoodCrate.glb`, and
`Model_BrickRubble.glb` are downloaded Sketchfab models, converted to glTF for
the game's static, visual-only prop layer.  They are not collision, navigation,
or destructibility sources.

| Game asset | Sketchfab model (UID) | Author | Download license reported by Sketchfab | Game-side change |
|---|---|---|---|---|
| `Model_ChineseRuralHouse.glb` | Traditional Chinese House (Low Poly / Stylized) (`0f5fbcbf1489432a81e372e6d38699dd`) | Himanshu3dArtis | CC Attribution | Largest extent scaled to 6.4 m; mesh reduced to 12% of its original triangle density; source textures retained. |
| `Model_Handcart.glb` | Medieval Market Asset Pack (`006ffc4ac5f34a1782f567b07e6605f2`) | vmatthew | CC Attribution | The pack's handcart replaces the previous model; reduced to 4,200 triangles, scaled to 2.45 m, and split between the game's shared wood and steel recipes. |
| `Model_WoodFence.glb` | Wood Wooden fence Protector of the farm low poly (`ace00004692b48c6afee9f9d505e6e35`) | ahmagh2e | CC Attribution | Largest extent scaled to 2.1 m; source textures stripped and replaced at runtime by `WoodBeam`. |
| `Model_WoodCrate.glb` | Wooden Crate Low-poly PBR (`f8fb4c96211d475b9370d1c403273fc6`) | MaX3Dd | CC Attribution | Largest extent scaled to 0.72 m; source materials replaced with `WoodDoor`. |
| `Model_BrickRubble.glb` | Bricks Pile 02 (`f6e69df7b0a1473498e551a81a942d81`) | RandomScan | CC Attribution | Largest extent scaled to 2.4 m; source materials replaced with `GroundRubble`. |

Attribution is retained here because each source is CC Attribution.  Sketchfab
model IDs are deliberately recorded alongside the visible title and author so
the original download page remains recoverable even if its human-readable URL
slug changes.

The house model is an occasional generic Chinese townscape landmark only; the
white-box's principal 1938 southern-Shandong domestic architecture, wall
footprints, collision and destruction remain the evidence-noted procedural
system in `Script_TengxianCity.mjs` and `Script_TengxianOutfield.mjs`.

## Sketchfab scene-pack additions

| Runtime asset | Sketchfab source | Author / license | Runtime treatment |
|---|---|---|---|
| `Model_AncientChineseCourtyardHouse.glb` | [Ancient Chinese Courtyard House](https://sketchfab.com/3d-models/ancient-chinese-courtyard-house-ed4ea9eb5f024d989eec182d48fa72d8) | [BlackBirb](https://sketchfab.com/BlackBirb), CC-BY-4.0 | One 11.85 m landmark, reduced to 5,500 triangles; source textures replaced by shared adobe and roof-tile recipes. |
| `Model_BattlefieldPack.glb` | [Battlefield Pack](https://sketchfab.com/3d-models/battlefield-pack-dcd0ade8c80e46d982a54fe4619f1c87) | [Blenderust](https://sketchfab.com/narighillya), CC-BY-4.0 | Split into 24 independently selectable component-library entries. The trench is reduced to 3,500 triangles and every other entry to 1,519 triangles or fewer. |
| `Model_Handcart.glb`, `Model_MarketStorageSet.glb` | [Medieval Market Asset Pack](https://sketchfab.com/3d-models/medieval-market-asset-pack-006ffc4ac5f34a1782f567b07e6605f2) | [vmatthew](https://sketchfab.com/vmatthew), CC-BY-4.0 | Replacement handcart plus two rice sacks, three boxes, and four slatted crates. Every storage component is independently selectable and stays below 900 triangles. |

The three source packages and their generated Sketchfab credit text are retained
under `_import/Source/Model_Sketchfab*/`. `_import/Script_SketchfabPackBake.py`
removes the original high-resolution textures, decimates meshes, grounds every
component, and binds the runtime's shared material recipes. The courtyard is
placed once in `L0_Jiehe`; the battlefield pieces are used by the walled-town
defense dressing (see below).

## Walled-town per-household dressing (2026-08-25)

Beyond the per-level `PLACEMENTS`, the walled town carries a second placement
layer: `Script_TownDressing.mjs` merges six region files
(`Data_Dressing_{Northeast,Southeast,Northwest,Southwest}Quarter/MainStreets/Defenses.mjs`,
229 placements) that dress courtyards, shopfront shoulders, and the wall-ring
defenses with these external props. Those placements are registered once in
world coordinates and filtered by each level's `TUNING.bounds`, so the same
rice sack appears at the same spot in every level that generates that part of
the city. Tooling: `Script_TownDressingDump.mjs` exports the city's household
census (`_import/TownDressingCells.json`), `Script_TownDressingTest.mjs`
enforces the placement rules, and `Script_DressingShot.mjs` shoots arbitrary
ground/top views for self-checks.

## Poly Haven CC0 additions

| Runtime asset | Source | Runtime treatment |
|---|---|---|
| `Model_MilitaryCrateSet.glb` | [Old Military Crate](https://polyhaven.com/a/old_military_crate) | Closed and open variants; 2,400 triangles each. |
| `Model_StackableStoneSet.glb` | [Namaqualand Stones 01](https://polyhaven.com/a/namaqualand_stones_01), [Stone 01](https://polyhaven.com/a/stone_01), [Rock 07](https://polyhaven.com/a/rock_07) | Seven independently selectable, ground-ready variants; 899–999 triangles each. |
| `Model_DeadTreeTrunkSet.glb` | [Dead Tree Trunk](https://polyhaven.com/a/dead_tree_trunk), [Dead Tree Trunk 02](https://polyhaven.com/a/dead_tree_trunk_02) | Two independently selectable leafless trunks; 2,400 triangles each. |

These assets are [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
`_import/Script_PolyHavenFetch.py` records and verifies the upstream 1K glTF
sources. `_import/Script_ExternalAssetBake.py` strips downloaded textures,
decimates the meshes, and places every component on a centered ground origin.
The runtime reuses existing game materials and caches each shared GLB once.
