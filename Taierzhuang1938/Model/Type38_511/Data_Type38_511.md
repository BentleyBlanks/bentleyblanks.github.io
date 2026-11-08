# Dots Type38 511 runtime integration

The `Type38` gameplay id now resolves to the 511 GLB for FPS, NPC/carried weapons,
ground pickups and the weapon editor. `Type38_511` is its external model id. The
old TZM remains an offline source/regression fixture and is not requested by the
game's weapon preload path. Failure of the new GLB is explicit, with retry.

The user requested performance in the same class as the in-game HanYang (68,657
triangles), with as much visible detail retained as possible. The accepted
reduction is 69,454 triangles from 473,796. The runtime adds a real 4.5 mm rear
sight notch (+132 triangles), for **69,586 triangles, 45 parts, 116 images**.
`Data_Type38_511.json` records the source/runtime hashes and each original image
payload hash. Images, UVs, source normals/tangents and material definitions are
retained; only the sight crosspiece changes at import.

The pre-integration high/low comparison uses identical lighting and six views
at 1280x720. Silhouette-mask mismatch is 0.115–0.570%; mean foreground RGB
difference is 0.75–1.61 on a 0–255 scale. Sampled surface deviation peaks at
0.2085 mm across 867,125 samples. These are measurements of the accepted
reduction before the intentional runtime sight-notch cut. Original reports and
paired images are in `Reduction68K_20261108/Reports` and its local review folder.
The runtime has 45 parts/37,566,608 bytes; HanYang has 44 parts/61,640,884 bytes.
This compares geometry and asset footprint, not full-scene FPS equivalence.

High-poly author source, the 473,796-triangle PBR high model, the accepted reduced
GLB, and the editable high/low Blender project remain in OneDrive:

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type38_511Audit_20261108/`

The original delivery's SHA256 is
`450e5435ad7f2e8146eda68f1b82fbd08fcba4cdf02708912a890d7089c37df6`.
The accepted reduced source is
`Reduction68K_20261108/Exports/Model_Type38_511_Reduced68K.glb`, SHA256
`1abb1e89443bd420b1ff86eba80584ee20c87ce68a2969c7c4739cc038fd6f82`.

## Coordinate and mechanical interface

Ordinary NPCs use 64,978 triangles: only `Exterior_FoldedFrame12` changes from
5,760 to 1,152 triangles. The other 44 parts retain their exact full geometry;
all materials/images are shared. FPS, editor/world model instances and explicit
NPC closeup detail keep 69,586 triangles. `Model_Type38_511NpcLod.glb` adds only
251,172 bytes of geometry, with no second copy of any image. Its source UV
normal/tangent field is transferred, with maximum sampled surface deviation
0.156 mm. Four 1280x720 closeup pairs have mean whole-image RGB differences
0.08–0.22/255. This fixes the measured legacy phase6 render budget from 9.032M
to 8.875M triangles under the unchanged 9M limit. It does not alter the FPS gun.

Source vertices independently confirm metres, Y-up, muzzle -Z. The rigid offset
`[0,-0.005,-0.027]` aligns the source to the game's trigger/stock frame without
resizing or deforming it. `Data_Type38_511.mjs` owns the measured muzzle, eye line,
feed/ejection, bolt pivot and handle, and the semantic moving-part lists.

The four authored handle/tail parts form `boltBody`; the two cover halves form
`dustCover` and translate independently without inheriting bolt rotation. The
existing Type38 action/shot/reload clocks and cartridge inventory remain in use.
The source's two "visual only" Actions are not imported as verified gameplay
animation. The actual front blade lives in the retained imported remainder;
`FrontUpperRoot80` is its base, not its aiming crown.

First-person contact and shoulder data are fitted to the new actual mesh. Hand
mesh, skin weights, skeleton and bone lengths are unchanged. ADS uses a 0.38 m
eye distance for the source's farther-forward sight. The original metal sling
loops are independently measured in the new GLB, after the same frame offset.

## Materials and ownership

`Script_Type38_511` loads through `ManagedGLTFLoader`. FPS/world instances own
private geometry and share the configured source PBR materials/textures. Normal
and tangent regeneration/welding is prohibited: their transferred UV fields
preserve the accepted wood and metal microdetail. Clearcoat/specular are retained.
A `preserveAuthored` material policy bypasses character-name classification:
the source's "Skin" and "Head" names describe several metal shells. Their PBR
must not become skin scattering or lose physical material layers.
A uniform colour gain of 2.5 compensates for author studio exposure, matching the
existing authored-rifle policy; relative part colours, roughness, metalness and
image pixels are retained. Texture anisotropy is capped at the device's 16 limit.
Published KTX2 normal/ORM/coat/specular-intensity maps are explicitly tagged
`NoColorSpace`, matching the source numeric-data slots; base colour retains sRGB.
This normalizes decoder metadata without modifying pixels, mips or GPU format.
The actual published mixed-format GLB passes the complete gameplay acceptance,
including the unchanged strict normal/ORM tag assertions.
The original clearcoat strength/roughness slots share one texture. The
`sharedClearcoat1` registry patch makes their R/G lookups use one sampler;
both slots, UV transforms and filtered channel values remain intact. This
keeps the full material within the fragment-stage budget with GI, SSR and
three world-shadow cascades. BatchedMesh's two vertex table samplers count
against the separate vertex/combined limits.

Pages uses the existing automatic GPU-image publication path, including its
explicit 2048 maximum and KTX2 rules. Original source images stay in Git/the local
source package; GPU compression is not a claim of pixel-identical online images.
Four packed data images (indices14,83,91,96) contain valid RGB at zero alpha.
Their explicit `#image/N` rules use lossless PNG, retaining all four channels;
the other112 images use BC7. Publication tests compare the actual four decoded
RGBA buffers exactly and read zero-alpha RGB back from a real GPU upload.
The local publication candidate is29,703,856 bytes versus37,566,608 source bytes.
Source/published rendering measures foreground RGB mean difference0.519/255
and95th-percentile difference2/255, with unchanged bounds and zero GL errors.

## Rebuild and verification

From an owned worktree, set `TYPE38_REPO_ROOT` to that worktree. The optional
`TYPE38_AUDIT_ROOT` overrides the OneDrive root above. Then run:

```powershell
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_blender/Script_Type38_511Runtime.py --task Type38Runtime
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_blender/Script_Type38NpcLod.py --task Type38NpcLod
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
node Taierzhuang1938/Script_Type38_511AssetTest.mjs
node Taierzhuang1938/Script_Type38_511BrowserTest.mjs
```

The local reduction and high/low reconstitution scripts remain next to the
OneDrive editable project. They preserve 24 source parts exactly; the runtime
notch is the recorded exception. Runtime builder imports the accepted hash,
changes only that crosspiece, and copies the full source image payloads.

Additional gates: `ModelFacingTest`, `AssetStandardsTest`,
`RifleSlingClothTest`, `AdsSightTest --only=Type38`,
`FpsArmTest --only=Type38`, `FpsHandContactTest --only=Type38`,
`FpsReloadMechanicsTest`, `WeaponRangeTest --only=Type38`,
`MotionVectorContractTest`, `SamplerBudgetTest` and the normal prepush profile.
Screenshots, model review pages and high/low comparisons stay local.

Exterior colour, grain, rust, wear and hidden construction are artistic
reconstruction, not a trace-by-trace scan or evidence for a particular rifle at
Tengxian. Sight, grip and action adaptations are game design. This boundary is
also recorded in the game's HistoryAndCreation entry and Notion ledger.

## Integration validation (2026-11-08)

The final mapped prepush selection covers304 tests:280 pass,24 have verified
pre-existing failures on unmodified `d896167b4e5be025bdffb776757b6f595c6d23a2`.
No new failures remain. The initial sampler/link error and9.032M scene-budget
regression were fixed; phase6 now submits8.875M under the unchanged9M limit.
Respawn timing and sling timing were rerun without parallel browser loads and
pass, including35/35 sling checks. The geometry-only NPC change additionally
passes all8 targeted factory/ownership, actual FPS/NPC, facing, standards, motion
vector and crowd/batch checks. The opt-in PBR policy leaves other assets unchanged.

Raw logs, baseline comparisons and screenshots are archived locally under
`Integration_20261108/Reports` beside the retained OneDrive source project.
No baseline assertions were removed or weakened. Verified baseline failures:

| Test | Existing failure |
|---|---|
| `EditorFirstPersonMotionBrowserTest` | slow-motion movement; first-person camera toggle; fixed-view torso twist; camera/slow-motion restoration |
| `EditorBlockoutMapEditBrowserTest` | legacy Kitchen box selection; group movement; Ctrl+Z/Ctrl+Y marker undo; exported legacy Kitchen entries |
| `EditorBlockoutBlanketClothBrowserTest` | 02-3 initial flat blanket state: drag=1, top=0.721 instead of flat |
| `TrenchEditorTest` | Exit adds ten geometries in both trees (current 718 to 728, baseline 632 to 642) |
| `HeadshotTest` | Distant kneeling head hit returns shape:null |
| `EditorTest` | Menu entry count; Asset table labels; Legacy ZB26 stats; FPS debug nonMetal assertion; Debug metalness pixel coverage |
| `FirstPersonEmbodimentTest` | Stand look-down shows the actual body mesh |
| `FpsHandLeftSelfContactTest` | leftHolding: digits 1/2 have 60 transverse crossing skin triangles |
| `MeleeAnimationTest` | BayonetLight: first-person hand absent for most frames (10/31) |
| `EmplacementViewBrowserTest` | mounted Zb26: actual left skin penetrates gun solids (1 vertices, 0.04284116233272198mm) |
| `TestSceneLightingTest` | Legacy cast-count fixture expects ten unique models; both trees return seven |
| `TaauTest` | Velocity-buffer isolation ratio: moving/static pixel difference 4.545/3.14 current versus 4.548/3.14 baseline; DOF draw-saving count below existing threshold; current saves two, baseline saves zero |
| `PropInstancingTest` | phase2: instancing increases draws by 23; phase4: instancing increases draws by 3; phase5: instancing increases draws by 27 |
| `FrameDebuggerTest` | switching editors must release captured GPU resources before editing |
| `SavedGraphicsWarmTest` | Grenade fixture: thrown=false, explosion frame=-1, killed=0/3 |
| `WhiteboxShaderWarmTest` | First main-scene pass links one additional program |
| `ClothBloodBrowserTest` | At line154, actual undefined versus expected false |
| `FirstLevelP012DebugTest` | normal R reload works after skipping issue (line58) |
| `CommandRoomPublicationTest` | Fixture does not create Model/Character output directory for Model_AzumaShiro_Mobilea3e20baf202bbbd68e2398cd.glb |
| `DeathMenuTest` | actual rifle hand is in the frame at death, not just an enabled root (line86) |
| `BootInteractionTest` | Loading UI wait times out after120000ms at line105; worker parity and drag lifecycle33/32 checks pass |
| `OldGengCharacterBrowserTest` | Final httpFailures assertion includes navigation-cancelled model requests (net::ERR_ABORTED) |
| `MenuTest` | FAIL 从设置/编辑器回来再「继续」，大刀还在手里; FAIL 先换到大刀（这一段按玩家那次的持械走）; FAIL 只剩正式章节与八项测试入口两组，没有「暂时废弃场景」组; FAIL 实际渲染 Blender 指挥室、独立相机及烘焙光照; FAIL 收起设置·controls 仍在设置页，大刀还在手里; FAIL 收起设置·graphics 仍在设置页，大刀还在手里; FAIL 收起设置·sound 仍在设置页，大刀还在手里; FAIL 点进设置·controls 时大刀还在手里; FAIL 点进设置·graphics 时大刀还在手里; FAIL 点进设置·sound 时大刀还在手里; FAIL 训练入口显示八项测试，方向键停在当前分组; FAIL 选章列出操作、枪械、玩法、爆炸、白刃、断肢、炮击扬尘、人物战场反应八项测试入口（第一关已归入正式章节） |
| `BootTest` | Legacy phase0 explosion-light envelope and four particle-instance fixtures; Legacy phases1–6 Japanese distance-recognition material count=0 |
