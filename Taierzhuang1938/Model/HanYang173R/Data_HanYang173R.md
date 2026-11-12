# Dots HanYang 173R game integration

The HanYang first-person, carried and dropped world model uses only Dots' 173R delivery. The user requested complete retirement of the old gun: its TZM file, model/source registry entries, procedural builder and automatic importer entry are removed. Asset loading failure reports a retry error rather than substituting another rifle. Source geometry is metres, Y-up and muzzle −Z; the muzzle lip and butt-cap vertex clouds independently verify this in `Script_ModelFacingTest.mjs`.

## Asset identity and provenance

- Original delivery: `Hanyang173R_final.glb`, 295,470 triangles. SHA256 `3f380317c1930c7c141f6f0c0abb415a336354e25b78f24cc7bb9aa8c650a38c`.
- Game geometry: **64,776 triangles, 44 parts, 132 embedded images**. The 2026-11-12 repair restores clean reduced wooden meshes and the complete high-source cocking cover. `Data_GameGeometry.json` records the current hash, per-part geometry comparisons and image payloads.
- 23 parts retain the delivered PBR payloads with their UVs. The 21 rebaked parts include seven close-up surfaces rebuilt on 2026-11-12. Tangent frames and bake/export UV coverage are checked.
- The front sight crown, complete bolt cylinder/knob, trigger and selected contact parts retain their original geometry. The receiver inlet is relieved by at most 0.152 mm. The handguard band is reshaped to the wooden profile. Other simplified parts keep sampled bidirectional vertex-to-surface errors below 0.5 mm. These measurements sample vertices against surfaces.
- A 4.5 mm notch is cut into the previously solid rear sight crosspiece so the front blade is visible. This is a gameplay adaptation. The actual front blade and rear crown define ADS pitch and position.
- GPU publication uses BC7 and the explicit path rules. The three main-stock maps retain 4096 pixels, selected by embedded image indices 57–59. Other images follow their existing 2048-pixel maximum.

Source packages and source Blender projects remain outside Git:

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/`

`DotsDelivery/` contains the original three packages; all 605 supplied SHA256 entries were verified. `Game60k/Scene_HanYang173RGame60k.blend` is the editable reduced source. Preserve [Dots' material-source statement](Data_DotsMaterialSources.txt); it includes unresolved historical input provenance and does not assert that the whole package is CC0.

## Close-up repair, 2026-11-12

The original 295,470-triangle GLB and the editable author project were opened and compared with the runtime mesh. The source's 2,932-triangle cocking cover, with four zero-area source triangles removed replaces its 287-triangle reduction. Both wooden components return to the reduced source before the 6 cm slicing, preserving their source normals and recovering 6,526 triangles. The resulting complete rifle stays within its 69,000-triangle allocation.

Restored source meshes contain multiple UV layers. Each restored target receives one fresh UV layer, explicitly active for rendering and export. Four zero-area cover triangles disrupted UV packing, reducing occupied area to 2.4% and density to 3.73 pixels/mm. Removing those triangles raises occupied area to 74.7% and density to 20.82 pixels/mm. The assembler also rejects a bake covering less than 80% of its measured UV surface area. Valid island texels seed margin filling.

The upper handguard's transverse end receives planar grain coordinates. The receiver and cocking cover use cylindrical body coordinates and planar end coordinates for the author's existing steel film, with the previous mean base reflectance retained. Fine normal and roughness variation is baked in Blender. The handguard band follows the combined timber and tapered-barrel envelope. The asset test raycasts the actual barrel at the band crown to check clearance. Its reshape, microscopic finish and contact tolerances are artistic reconstruction.

The original auction photographs 3, 4 and 5 show the curved front receiver ring, bolt raceway, stock inlet and safety/cocking assembly. They guide the visible form. The game's finish and dimensions remain production choices. [Hanyang rifle photographs](https://www.icollector.com/Chinese-Hanyang-Mauser-Bolt-Action-Rifle_i13828566)

The editable revision, immutable pre-repair GLB, packed source project and raw bakes are in `SurfaceRepair_20261112/` beside `DotsDelivery/`. Rebuild from the owned worktree with the managed MCP entry, then assemble the resulting seven parts.

```powershell
node scripts/Script_BlenderMcp.mjs start --task HanYangSurfaceRepair
node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['HANYANG_PROJECT_ROOT']=r'<owned-worktree>/Taierzhuang1938'"
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_HanYang173RSurfaceRepair.py --timeout 2400
python Taierzhuang1938/_import/Script_HanYang173RRebakeAssemble.py <revision>/Model_HanYang173R_Before.glb Taierzhuang1938/Model/HanYang173R/Model_HanYang173R.glb <revision>/Bake --report Taierzhuang1938/Model/HanYang173R/Data_GameGeometry.json --surface-repair <revision>/Data_SurfaceRepair.json
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

Four complete action scans pass the existing 2 mm confirmed-depth gate. Empty and partial reloads reach 1.739 mm, held-open reload 1.594 mm, ordinary bolt cycle 1.846 mm after integrating the upstream smooth bolt cycle. Surface-crossing pairs remain in the saved reports and require their existing visual review. The independent left-hand finger self-contact test also reproduces 60 crossing triangles on the unmodified baseline hand asset.

## Runtime and lighting

`Data_HanYang173R.mjs` owns authored part names, mechanical mounts, ADS pitch and material calibration. `Script_HanYang173R.mjs` uses `ManagedGLTFLoader`, configures the existing material library and creates private FPS/world geometry while sharing textures. Source materials are not disposed when a weapon instance is swapped.

The default player rifle is `Data_Weapons.DEFAULT_PLAYER_WEAPON` (HanYang), including the remaining legacy loadouts and identity fallback; intentional unarmed story states remain unarmed. All blockout-editor phases already select HanYang. The authored gun is passed to Viewmodel separately from the optional rigged-arm bundle, so `arms=legacy` cannot select an old gun. `Script_HanYang173RDefaultTest` checks the actual editor startup without `TakeWeapon`, both arm paths, FPS/world triangle identity, zero retired-asset requests and explicit GLB failure. The weapon editor reports the GLB's real triangle count rather than retired TZM metadata.

Base color is sRGB; normal/ORM are linear. **2026-10-29: materials render as authored.** The user rejected the 10-25/10-26 runtime calibration (wood ×6–12, steel per-part ×2.5–18 normalised to one reflectance, roughness ×1.4–2.2, metalness 0.7): it produced light-orange wood and grey-paint steel, flattened the author's part-to-part differences and removed the wood sheen. The Dots base colours are 5–10× darker than real walnut and steel (wood ~41/29/20 sRGB); the validation renders in `DotsDelivery/HanYang_173R_Runtime_GLB_PBR/Validation/` expose for the rifle (overview wood display luma p50 51). The game uses one shared `exposureGain` (2.5) on every part's colour factor in place of that exposure; roughness, metalness and relative values stay authored. Visible display luma p50 wood/steel: whitebox 71/60, medium daylight 36/31, high daylight 47/40. `Data_HanYang173RMaterials.mjs`, `Data_MaterialCalibration.json` and `_import/Script_HanYang173RMaterials.py` are removed.

**2026-11-03 base-colour calibration (user-approved).** Only the material colour multiplier changes (`Data_HanYang173R.baseCandidate`, `Script_HanYang173R.HanYang173RBaseGain`); texture bytes, roughness and metalness stay authored. Evidence (local `_shots/BaseColorCompare`): wood albedo 3.3% sat below the darkest measured heartwood (~9%) and a rough estimate of COD WWII's Kar98k stock (~9%); the steel source `blue_metal_plate` is a metalness-0 coated surface in Poly Haven whose 4.5% diffuse colour had been used as conductor reflectance, while black oxide (magnetite) reflects about 20%. Wood uses one shared per-channel multiplier (MainWood ≈ linear 0.151/0.077/0.039, Y≈9%, hue 1:0.51:0.26 versus the source's 1:0.48:0.22) that pulls the source's orange slightly toward walnut brown; cooler 1:0.6:0.4 and 1:0.52:0.28 trials turned grey-purple under blue skylight (warm-wood browser gate); the 10-29 rejection was of brightened orange. Steel gains are `clamp((0.2 / current)^0.75, 1, 3)` per part: the large receiver/cover/barrel surfaces rise to 16–18%, the part order and the dark front-sight base are kept, and parts already above 20% are untouched (the 10-26 'grey paint' normalised every part to one value and also changed roughness/metalness). `?gunBase=authored` restores the single exposure gain for comparison. The backlit side of the receiver remains dark: that is missing light, not base colour.

**Texture margins.** Dots' baked PNGs are 0 outside the UV islands (BaseColor black, ORM roughness 0 / metallic 0). Mipmaps averaged those zeros into the island edges, so steel edges went to black glossy dielectric and the rifle looked smeared at distance and grazing angles. `_import/Script_HanYang173RDilateTextures.py <in.glb> <out.glb> [report.json]` pull-push fills only the texels outside the islands (coverage = ORM red, fixed at 1 inside the bake), keeps island texels byte-exact and the 16-bit normals; GLB 91.1 → 93.9 MB. `Data_GameGeometry.json` keeps each image's delivered `sourceSha256` beside the filled `sha256`. Runtime sets anisotropic filtering 16 on all 173R maps (it was 1).

**2026-11-03 uniform-density rebake (user-approved).** The user saw stretched texture. Per-triangle 3D→UV Jacobians showed the stretch is in Dots' delivery, not our decimation: `bake_pbr173R.py` unwrapped with `smart_project(..., scale_to_bounds=True)`, which forces every part's islands to fill the square, so long parts were stretched along the bore — barrel ×8.7, upper handguard ×11, front handguard ×9.5, rear-sight leaf ×9.3 (area-weighted median), and about 35% of the main stock above ×4. The 60k decimation only added stretch to small parts (the three marking plates, both sling loops, the side sight heads). Those maps had lost the along-bore detail (barrel ≈ 2.6 px/mm along vs 40 across), so it had to be rebaked from the author's node materials rather than transferred.

`_blender/Script_HanYang173RRebake.py` (managed batch, Blender 5.1 opens the 5.2.1 source without undefined nodes) opens the author source `Source_173R_WristTailExterior_Author_WIP.blend`, imports the pre-rebake 60k game GLB (exactly coincident), and for each listed part: slices long parts every 6 cm along the bore (decimated long parts have triangles spanning the whole length, which cannot be split into packable pieces) and re-transfers source corner normals; `smart_project` without `scale_to_bounds`; breaks islands every 8 cm; axis-aligned concave packing (`Script_HanYang173RRebakeUnwrap.py`); then a Cycles selected-to-active bake from the source part (cage extrusion 1.5 mm, ray 3 mm, 4 samples) of BaseColor and ORM through the same Emission rewiring as Dots' script and the tangent-space Normal, at each part's original texture size. Missed texels inside islands were 0 for all parts except a few inner faces; `_import/Script_HanYang173RRebakeAssemble.py` replaces only those parts' primitives and three images, fills misses and the area outside the islands from the nearest hit texel, keeps normals at 10 bits (the low bits were bake noise PNG could not compress; GPU publication keeps 8), and updates `Data_GameGeometry.json`. Uniform density now: barrel 8.2 px/mm, upper handguard 7.7, front handguard 4.6, rear-sight leaf 15, main stock 6.8. `RearOuterCover_RoundedSideReturn` was rebaked but kept as delivered: the source material shows comb-like brushed streaks there that the old stretch had smeared out. Island-mean base luminance moved within −13…+7% (the old figure was texel-weighted over stretched islands), so `baseCandidate.partBaseY` and the approved colours are unchanged. The GLB URL/version is `173R-20261103`.

**Winding.** All 44 materials are double-sided, so three picks the shaded side from triangle winding. 0.2–7.8% of the triangles in 12 parts (RearOuterCover 21/287, rear-sight leaf 6/77) wind against their authored normals; `RepairHanYangWinding` re-winds them at load. The dark patch at the rear of the cocking cover from the player's height is the inside of that open single-skin cover, also dark in the source render, not a shading fault.

Whitebox now retains the rifle's existing sky reflection by default, as explicitly requested. The `weaponReflections` setting binds PMREM to marked materials only while drawing textured weapons; global scene IBL remains off. Warmup uses the same binding and each frame restores it. The actual whitebox canvas is sampled by the browser regression (its LDR target is unused in the default two-pass path).

The material library now installs folded ORM decoding even when screen-space effects are disabled. Previously it removed the metalness map and then returned without its replacement shader, treating the wood as metal in plain/low-effect rendering. The asset regression checks this exact path.

Shared test daylight now specifies neutral grading instead of inheriting the cinematic purple shadow lift. That lift overwhelmed low-reflectance wood/steel although middle-gray cards passed. The sunlight, ambient fill and exposure remain at their calibrated baseline; campaign weather retains its own grade.

The complete bolt cylinder and handle rotate/translate; the rear cocking assembly translates without rolling; the receiver collar remains fixed. Loading and projectile/inventory timing use the existing game mechanisms. The source has no skeleton or animation clips.

## Hands and animation

`Data_HanYang173RGrips.mjs` is generated from the final actual-skin fit. The original hand/arm meshes, skin weights and bone lengths are preserved. Fitting uses actual LBS skin plus edge midpoints against the game geometry, followed by production-browser checks of both full arms, wrists and sleeves.

`GripFitFinal/Data_GripFit.json` merges the accepted right-hand V6, hip-left V5 and ADS-left V3 fits. `Data_HipBasis.json` and `Data_AdsBasis.json` in that folder retain the original fitting bases. Replacing those with newly fitted poses changes the optimization basis and is not a valid reproduction.

The existing 4-second, 241-frame/60 FPS Idle was rebaked in Blender, scoped to 38 arm/hand bones and four hand controls. Other fields and rest translations are protected and the loop closes. Source: `HanYang173RIdle_20261025/Animation_HanYang173RIdle.blend`, with action checkpoint, immutable baseline, captured poses and bake report. This animation source's older preview rifle is separate from the current geometry source; it does not certify geometry parity.

Release motion keeps holding digits until the palm has moved away, then relaxes them. The working hand exits the bolt down/out/back before uncurling, clearing the new trigger guard. A held-open bolt uses an offset right contact and the existing IK, preventing the rear assembly from entering the thumb. Ordinary closed-bolt holding still plays the native Idle.

## Rebuild

Run from the repository root in an owned worktree. Blender always uses the managed batch entry and must be stopped after use.

```powershell
$env:HANYANG_PROJECT_ROOT=(Resolve-Path 'Taierzhuang1938').Path
$env:HANYANG_SOURCE_GLB='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/DotsDelivery/HanYang_173R_Runtime_GLB_PBR/Hanyang173R_final.glb'
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_blender/Script_HanYang173RGame.py --task HanYang173RGameSource

node Taierzhuang1938/_blender/Script_ApplyHanYang173RGrips.mjs 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/GripFitFinal/Data_GripFit.json' 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/GripFitFinal/Data_HipBasis.json'

# Uniform-density rebake (2026-11-03). Input is the pre-rebake 60k GLB (after the margin fill), e.g.
# git show 4b0c360d6:Taierzhuang1938/Model/HanYang173R/Model_HanYang173R.glb > tmp/HanYang173R/Model_60k.glb
$env:HANYANG_GAME_GLB=(Resolve-Path 'tmp/HanYang173R/Model_60k.glb').Path
$env:HANYANG_REBAKE_OUT=(Join-Path (Resolve-Path 'tmp').Path 'HanYangRebake/out')
$env:HANYANG_REBAKE_PARTS='UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront:2048,FrontWood_ContinuousOval:1024,LongOuterSteel_TrueRound:2048,MainWood_ContinuousLowerShoulder:4096,Sight_LowContinuousLeaf_NoUnknownNumbers:1024,HY155_ContinuousInnerEdgeTrim_Pos:1024,HY155_ContinuousInnerEdgeTrim_Neg:1024,HY150_VisualFrontSleeve:512,ReceiverOuterCollar:1024,LowerPlateGuard_FlatSideNarrowReturn:2048,FrontBandSideStrip:512,PlateExterior_ShallowSurfaceMark_1:1024,PlateExterior_ShallowSurfaceMark_2:1024,PlateExterior_ShallowSurfaceMark_3:1024,RearBand_ExternalAttachmentLoop:1024,RearStock_ExternalAttachmentLoop:1024,Sight_SideRoundHead_1:512,Sight_SideRoundHead_-1:512'
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_blender/Script_HanYang173RRebake.py --task HanYang173RRebake
python Taierzhuang1938/_import/Script_HanYang173RRebakeAssemble.py tmp/HanYang173R/Model_60k.glb Taierzhuang1938/Model/HanYang173R/Model_HanYang173R.glb tmp/HanYangRebake/out --report Taierzhuang1938/Model/HanYang173R/Data_GameGeometry.json
```

For a new grip revision, capture into a **new** source folder with `_blender/Script_CaptureHanYang173RIdle.mjs --source-dir=<new-folder> --base-blend=<previous-source.blend>`. Set `HANYANG_IDLE_SOURCE_DIR` to that folder and run `_blender/Script_HanYang173RIdleBake.py` through the managed batch entry. Keep the captured baseline and source checkpoint; do not overwrite the completed delivery's baseline. Update the animation manifest/version after validating the bake.

The optional fit optimizer is `_blender/Script_HanYang173RGripFit.py`: `HANYANG_SCIPY` points to a Blender-compatible SciPy directory; `HANYANG_FIT_OUTPUT`, `HANYANG_FIT_SEED` and `HANYANG_FIT_KEYS` select an isolated fit revision. It reads the preserved fitting bases from `tmp/HanYang173R/Data_hip.json` and `Data_ads.json`.

## Validation and evidence

Offline identity/PBR/tangents: `Script_HanYang173RAssetTest`. Geometry facing/budget: `Script_ModelFacingTest`, `Script_AssetStandardsTest`. The 8,949-pose anatomical gate and native animation checks remain active.

Actual runtime: `Script_HanYang173RBrowserTest` captures high-quality day, physical shadow fixture, night and ADS, verifies 44 parts in FPS/world instances, all PBR channels and a production frame-debug capture. `Script_AdsSightTest --only=HanYang` tests the complete authored blade crown rather than the tops of every support piece.

Hand acceptance uses both `Script_FpsHandContactTest --only=HanYang` and `Script_HanYangReloadClearanceTest --max-depth-mm=2 --shots`. The latter checks four actual 60 FPS actions plus settling, without contact exemptions. Its 2 mm closed-shell gate does **not** mean zero surface crossings; open-shell evidence and the saved worst-frame images require separate review. Reports retain this distinction.

`Script_FpsReloadMechanicsTest` measures the actual named receiver/cocking parts and raycasts the real rear plug before/after travel. Other relevant gates include rifle framing, arms/sleeves, sprint, bayonet, model poses, motion vectors, material upgrade and sampler budget. An existing `TestSceneLightingTest` character-roster assertion expects ten distinct models but the current selected roster has seven; its gray-card and daylight checks passed before that unrelated assertion.

Final measured holding/ADS/fire: complete arms/wrists/sleeves have zero transverse intersections. The full empty, partial and ordinary bolt scans retain maximum confirmed depths of 1.192, 1.459 and 0.722 mm respectively. The separately rerun held-open reload reaches 1.192 mm, with zero intersections/depth in its initial held-open posture; all four pass the 2 mm gate and full coverage/wrist/reach protocol. Those small contact-depth figures and nonzero action surface pairs are retained, not represented as zero action penetration. Local evidence: `HanYangReloadClearance` (use its empty/partial/bolt rows) and `HanYangOpenReloadFinalV3` (supersedes its earlier open row). Worst-frame images were reviewed.

Actual ADS front-crown error is 0.103 px at 1600×900. Native/IK hand-contact acceptance covers three holding/fire states and 618 action frames. The high-quality browser test also gates warm, readable daylight wood pixels and the held-open contact after pose-state reset. Exposure/LUT tests pass after measuring the changed CH0 default view at log luminance −0.267 and updating only that view's exposure anchor to −0.27.

Sampler checks passed all eight legacy campaign quality/GI combinations and first-level low. First-level medium+GI timed out during `重编场景光照 7/8`; overlaying the modified runtime files with `origin/master` also reproduced this pre-existing startup stall with no page errors. That first-level GI check is not claimed as passed, and its timeout/assertions were not relaxed.

GPU source/published comparison can target this asset with `Script_PublishAssetsBrowserTest --report=<staging>/Data_AssetPublishReport.json --only=Model_HanYang173R.glb`. Original and compressed geometry bounds must match; foreground mean/p95 color error gates remain unchanged. Temporary review pages, screenshots and reports stay in ignored `_shots/` and `tmp/` directories.

The appearance, aging, dimensions chosen for play and sight adaptation are marked as creative reconstruction in the Notion ledger and the in-game history codex. They are not a claim about an identified soldier's rifle at Tengxian.

## 2026-10-26 ADS eye position and steel finish

- **ADS eye.** The 173R rear sight sits on the barrel ring, 0.321 m in front of the firing grip; the retired model's sat on the receiver at 0.16 m. Keeping the old 0.22 m sight distance moved the whole rifle 16 cm towards the eye: the rear cocking assembly came within 2–4 cm and the 0.06 m near plane cut it open, and the support hand came 16 cm closer to the left shoulder, folding the elbow up beside the cheek (camera-space elbow z +0.017, 84°; a bolt cycle swept it 37 cm). `RIFLE_ADS_EYE.HanYang` is now 0.381 m, the same eye position relative to the stock as before (6 cm behind the grip), and the 10-25 firing-shoulder move (ADS z 0.26) is reverted to 0.06. Measured: nearest visible part 9.0 cm at ADS; left elbow z −0.16…−0.37 m, 110–122°, continuous through ADS in/out and the bolt cycle. `AdsSightTest --only=HanYang`, `FpsHandContactTest --only=HanYang`, `FpsRifleViewTest`, `FpsSleeveTest`, `FpsHandPoseTest` pass.
- **Steel finish (superseded 10-29).** A 0.4× metal gain, roughness ×2.2 and metalness 0.7 were tried for the COD brightness comparison; the user found the steel read as paint, not metal. Replaced by authored materials with one exposure gain (see Runtime and lighting).
