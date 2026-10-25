# Dots HanYang 173R game integration

The current HanYang first-person, carried and dropped world model uses Dots' 173R delivery. The old `Model_HanYang.tzm.json` is retained as a load-failure fallback. Source geometry is metres, Y-up and muzzle −Z; the muzzle lip and butt-cap vertex clouds independently verify this in `Script_ModelFacingTest.mjs`.

## Asset identity and provenance

- Original delivery: `Hanyang173R_final.glb`, 295,470 triangles. SHA256 `3f380317c1930c7c141f6f0c0abb415a336354e25b78f24cc7bb9aa8c650a38c`.
- Game geometry: **59,901 triangles, 44 parts, 132 embedded images**, 91,145,120 bytes. `Data_GameGeometry.json` is the authoritative game hash, per-part triangle/error and image-payload ledger.
- Original PBR image payloads are preserved byte-for-byte. Mesh UVs and transferred source normals remain; degenerate tangent frames are repaired and checked.
- The front sight crown, complete bolt cylinder/knob, collar, trigger and selected contact parts retain their original geometry. Remaining simplified parts have sampled bidirectional vertex-to-surface errors below 0.5 mm. This is a sampled surface metric, not a proof of complete Hausdorff distance.
- A 4.5 mm notch is cut into the previously solid rear sight crosspiece so the front blade is visible. This is a gameplay adaptation. The actual front blade and rear crown define ADS pitch and position.
- GPU publication keeps image resolution and reduces the download to 26,936,844 bytes. Converted texture payloads allocate 98,042,896 GPU bytes versus 525,686,032 decoded RGBA bytes; these are converted-image figures, not the entire model's texture memory.

Source packages and source Blender projects remain outside Git:

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/`

`DotsDelivery/` contains the original three packages; all 605 supplied SHA256 entries were verified. `Game60k/Scene_HanYang173RGame60k.blend` is the editable reduced source. Preserve [Dots' material-source statement](Data_DotsMaterialSources.txt); it includes unresolved historical input provenance and does not assert that the whole package is CC0.

## Runtime and lighting

`Data_HanYang173R.mjs` owns authored part names, mechanical mounts, ADS pitch and material calibration. `Script_HanYang173R.mjs` uses `ManagedGLTFLoader`, configures the existing material library and creates private FPS/world geometry while sharing textures. Source materials are not disposed when a weapon instance is swapped.

Base color is sRGB; normal/ORM are linear. The original wood has very dark base texels (representative visible pixels around sRGB 41/29/20). A recorded linear reflectance gain of 6 makes wood grain readable under the game's filmic exposure. The later COD14 comparison also calibrates 40 metal parts: exposed steel uses per-part linear reflectance normalization, roughness gain 1.4, and a 0.95 effective reflectance bound; sights/interior lips retain a darker finish. These are artistic runtime adaptations and leave the source image files unchanged. Gains are applied from saved original multipliers, so repeated configuration cannot accumulate brightness. Rebuild with `_import/Script_HanYang173RMaterials.py`; metadata is in `Data_MaterialCalibration.json`, runtime values in `Data_HanYang173RMaterials.mjs`. The bounds use the existing material-patch registry in the forward pass and precede diagnostic channel capture. No additional production pass is introduced. Comparison, limitations and optional public techniques are in [the COD14 study](Data_Cod14LightingStudy.md).

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
