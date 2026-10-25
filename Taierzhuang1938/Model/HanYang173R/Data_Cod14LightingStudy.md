# HanYang metal brightness and COD14 references

The user requested a comparison with Call of Duty: WWII and asked to review public rendering techniques before adding new systems. The 59,901-triangle geometry and all source image payloads remain unchanged. This revision adjusts existing material inputs; the optional techniques below are **not implemented** by this revision.

## Appearance evidence

Two actual COD14 Kar98k frames were examined: [an indoor reload](https://www.imfdb.org/index.php?title=File:CODWWII_Kar98K_(1).jpg) and [an outdoor aiming view](https://www.imfdb.org/index.php?title=File:CoDWWII-k98k_2.jpg). The local source files retain their original 1920×1080 resolution. Their hand-picked receiver regions have display-luma medians of 43.0 and 32.85; the indoor region's 90th percentile is 81.64. They retain broad reflected highlights and visible dark-metal midtones.

These are SDR image observations, not measured radiance/nits or identical lighting. The reference poses, scenes, exposure and crop regions differ; their values guide appearance rather than constitute a physical calibration standard.

The game's before/after check uses one frozen production pose and camera, fixed exposure, high quality, unchanged wood/skin and four lighting presets. A temporary red/green geometry mask selects visible metal/wood pixels from the actual final color target, with a two-pixel border erosion. The mask is readback-only and all materials/render targets are restored; it is not a production pass.

| Lighting | Metal median before / after | 90th percentile before / after | Fraction below luma 8 before / after |
| --- | --- | --- | --- |
| Test daylight | 3.0 / 30.86 | 14.74 / 91.06 | 76.8% / 19.4% |
| Physical roof shadow | 2.0 / 18.45 | 10.72 / 64.00 | 83.6% / 31.2% |
| Campaign overcast preset | 3.0 / 34.28 | 15.79 / 109.35 | 74.7% / 20.4% |
| Night preset | 4.44 / 23.31 | 19.94 / 97.78 | 63.5% / 22.1% |

Luma is 0–255, with Rec.709 weights applied to the decoded screenshot bytes. Pixel masks cover the visible gun's metal, including naturally dark crevices; the reference samples cover selected receiver surfaces, so the two distributions are not interchangeable. Local study data and original captures are in ignored `tmp/HanYang173R/Cod14/`.

The source receiver's median base texel is about sRGB 46/49/52, while its metallic channel is 255. This very low conductor reflection input made it almost black after the game's exposure/tone curve. Disabling AO/horizon/self shadow only raised the test's median from 3.0 to about 3.8, so simply removing shadows is not a remedy here. Normal-scale reduction likewise did not address the missing midtones. The current correction preserves texture variation, gives exposed conductors a usable reflection input, broadens their rough reflection, keeps dark sights distinct, and bounds effective reflectance. World and FPS materials consume the same calibration.

`Script_HanYang173RAssetTest` checks source integrity, calibration provenance, idempotency and coexistence with ORM decoding. `Script_HanYang173RBrowserTest` gates actual visible-metal midtones/highlight headroom in daylight and shadow, as well as wood color, night/ADS, world/FPS identity and open-bolt contact. The exposure/LUT test also passes after this material revision.

## Public techniques for user review

Primary sources: Danny Chan's [Material Advances in Call of Duty: WWII, SIGGRAPH 2018](https://research.activision.com/publications/archives/material-advances-in-call-of-dutywwii), [official slides](https://www.activision.com/cdn/research/MaterialAdvancesInWWII.pdf); Michal Drobot's [Rendering of Call of Duty: Infinite Warfare, Digital Dragons 2017](https://research.activision.com/publications/archives/rendering-of-call-of-dutyinfinite-warfare), [official slides](https://www.activision.com/cdn/research/2017_DD_Rendering_of_COD_IW.pdf). The latter describes COD13, not evidence of an identical COD14 implementation.

| Candidate | Evidence | Relevance and current Demo state | Added work/cost |
| --- | --- | --- | --- |
| Gloss/view-angle-aware specular occlusion | WWII printed slide 71, PDF page 72 explicitly discusses player's guns losing reflection at grazing angles | Demo has GTAO/GTSO cone occlusion, but not this specific curve. A switchable A/B is worth considering; the current dark-source-input issue is independently corrected | Shader math; no extra full-screen pass. Must check reflection leakage |
| Joint normal/gloss mip filtering | WWII PDF pages 7–24 | Current texture publication generates texture mips independently; geometric derivative roughness in Three is a different safeguard. Useful for stable fine metal highlights while moving | Asset-import/bake changes; no extra screen pass. Requires normal/ORM coordination |
| Local box-projected reflection probes | IW PDF pages 54–56, 67 | Current environment is a sky PMREM; diffuse probe brightness scaling does not provide room/window-shaped reflections. This is the strongest additional option for convincing indoor metal | Static probes add memory/blending and authoring. Dynamic captures add rendering/filtering work; measure in this Demo |
| Viewmodel-optimized screen-space sun shadows | IW PDF pages 24–25 | Demo already has independent first-person self shadows and general contact-shadow machinery. Its constant foreground-depth tag cannot directly serve true gun-space ray tracing. Do not stack another shadow pass without an A/B and depth plan | An additional tracing pass plus valid near-depth data; not a priority for this brightness fix |

The Demo also already has GGX indirect-specular multiscattering in Three, micro-shadowing, horizon occlusion, SSAO multibounce, an independent first-person FOV treatment and first-person self shadow. WWII's separate diffuse-BRDF improvement is not the direct remedy for a fully metallic surface.

The user subsequently approved retaining weapon reflections in whitebox. `weaponReflections` now defaults to true: the current sky PMREM is bound only to the rifle's marked materials during the existing draw, while global scene IBL stays off. The existing `main → whiteboxOutput` pass list is unchanged. The optional algorithms above remain unimplemented and await user selection.

## Wood follow-up

The user also identified the wood as too dark. An unchanged production pose and fixed exposure were used to compare gains 6, 12 and 18. Gain 12 was selected to retain a dark brown finish: wood median display luma rose from 18.69 to 40.47 in test daylight, 16.99 to 36.96 under the physical roof, 9.71 to 20.54 in overcast, and 9.58 to 21.21 in the night preset. This adjusts the three wood parts' albedo multiplier only; it does not add fill lights, emission or another pass, nor alter normal/roughness maps. `SideWoodButton` has a fully metallic source ORM and is now calibrated with metal despite its name. The GLB and all source image bytes remain unchanged.

These numbers describe this Demo's appearance, not measured COD14 wood radiance. The original metal-reference comparison above remains a historical before/after of the metal revision. Current browser acceptance covers both material classes in high day/shadow/overcast/night/ADS, plus the actual default-whitebox canvas with reflection off/on and verifies scene/skin isolation and unchanged pass count.

Validation also passes whitebox presentation, sampler budget (maximum 12/16), frame-graph, asset integrity, module graph, test registry and text checks. `WhiteboxShaderWarmTest` still reports three late programs on the opening helmet/bread props. The unmodified `7aeb3f1f` baseline reproduces the identical three users/cache keys (96→99 programs; this revision 101→104); this is an existing failure, not a clean warmup pass. No baseline assertion was weakened. Weapon-only reflection toggles and steady drawing compile no recurring programs.
