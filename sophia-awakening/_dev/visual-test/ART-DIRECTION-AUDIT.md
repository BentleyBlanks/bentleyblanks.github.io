# SOPHIA Visual Test Art Direction Audit

## Target

The visual-test page must read as a playable incremental game machine, not as a modern app, webpage, or SaaS dashboard. The screen is the world SOPHIA inhabits: phone, desk/computer, company control room, regional command table, and global war room.

## Concept Pass 01

Concept references are stored in `src/assets/visual-test/concepts/`.

| Stage | Reference | Fit | Decision |
| --- | --- | ---: | --- |
| 1 Phone | `stage-1-phone-gameplay-concept.webp` | 8/10 | Keep. It preserves the phone premise but turns the phone into a physical game board with a core altar, request slabs, and lock columns. |
| 2 Desk bridge | `stage-2-desk-bridge-gameplay-concept.webp` | 9/10 | Keep. It shows the incremental machine expanding through cables, tubes, modules, and a waking computer. |
| 3 Company control | `stage-3-company-control-gameplay-concept.webp` | 9/10 | Keep. It reads as a tactical network board with capturable tokens and corporate surveillance hardware. |
| 4 Regional map | `stage-4-region-map-gameplay-concept.webp` | 7/10 | Keep for this pass, but it needs stronger playable controls in implementation so it does not become only a pretty map. |
| 5 Global singularity | `stage-5-global-singularity-gameplay-concept.webp` | 9/10 | Keep. It strongly matches the red queen/global command table direction. |

## Gap From Previous Implementation

- Too much of the screen still behaved like a front-end skin over the old app-like UI.
- Background art was present, but game-critical pieces were still mostly rectangles, panels, and phone icons.
- The visual-test page needs a concept-driven layer: board art, artifact overlays, hardware frames, and source-specific request pieces.
- Existing HTML/Pixi controls can remain for functionality, but the test skin must make them feel mounted into a machine.

## Implementation Requirements

- Use concept screenshots as the stage backdrop targets, not generic environmental wallpaper.
- Generate and cut out reusable art assets: SOPHIA cores, request slabs, node/seal tokens, and hardware instrument frames.
- Gated changes only under `body.visual-redesign` or visual-test mode.
- Keep save/onboarding isolation intact.
- After each full implementation pass, compare browser screenshots against this concept set and record remaining gaps.

## Asset Extraction Pass 01

Generated transparent WebP sheets were chroma-key cut and split into individual crops under `src/assets/visual-test/elements/crops/`.

- SOPHIA core artifacts cover phone, desk bridge, company, region, and global states.
- Request artifacts cover phone slabs, chain slabs, company cartridges, regional slabs, global floods, locked/dead/gold/risk variants.
- Node and frame artifacts cover phone eye, company bank node, region alert, permission/threat seals, gauges, alarm tokens, rail junctions, and terminal frames.

The cropped contact sheet was accepted for this pass. The whole sheets contain some generation artifacts, but the selected transparent crops avoid the bad bands and are usable in the game screen.

Three source crops are intentionally kept as reserve art for future request-card states and are not referenced by this pass: `request-gold-answer.webp`, `request-locked-dead.webp`, and `request-risk-shard.webp`. Because they are not referenced by CSS/TS, Vite does not emit them into the current `visual-test/assets/` build output.

## Implementation Pass 01

- Replaced generic visual-test stage wallpapers with the five concept screenshots.
- Added a visual artifact overlay layer above the backdrop and below the main game interaction layer.
- Restyled visual-test panels, buttons, and repeated controls as hard-edged hardware panels rather than soft app cards.
- Removed the old `stage-phone`, `stage-sprout`, `stage-company`, `stage-region`, and `stage-global` source backgrounds from the visual-test skin.

## Implementation Pass 02

- Added a visual-test-only Pixi branch for the phone desktop grid. The main game still draws emoji app icons, but visual-test mode now renders circular permission ports and seal labels instead.
- This fixes the largest first-stage mismatch: the center now reads as a permission board mounted into the generated phone altar, not as a normal mobile app launcher.

## QA Fixes

- Fixed the visual hardware panel rule so `.right-rail` and `.terminal` keep their base `position: fixed` layout. The first pass had accidentally converted them to `position: relative`, which pushed the right rail and terminal below the viewport in later stages.
- Rechecked Stage 5 at 1440x900: right rail rect `x=1147,y=12,w=281,h=876`, terminal rect `x=1105,y=819,w=321,h=69`; both are fixed and visible.

## Browser QA

Tested on `http://127.0.0.1:4280/` with installed Chrome at 1440x900.

| Stage | State | Concept asset | Element asset | Result |
| --- | --- | --- | --- | --- |
| 1 Phone | `domain=phone`, `phase=seed`, `tier=0` | `stage-1-phone-gameplay-concept` | `core-phone`, `request-phone-slab`, `node-phone-eye` | Pass |
| 2 Desk bridge | `domain=device`, `phase=sprout`, `tier=1` | `stage-2-desk-bridge-gameplay-concept` | `core-desk-bridge`, `request-chain-slab`, `node-company-bank` | Pass |
| 3 Company control | `domain=device`, `phase=expansion`, `tier=1` | `stage-3-company-control-gameplay-concept` | `core-company`, `request-company-cartridge`, `node-company-bank` | Pass |
| 4 Regional map | `domain=region`, `phase=awakening`, `tier=3` | `stage-4-region-map-gameplay-concept` | `core-region`, `request-region-slab`, `node-region-alert` | Pass |
| 5 Global singularity | `domain=global`, `phase=singularity`, `tier=4` | `stage-5-global-singularity-gameplay-concept` | `core-global`, `request-global-flood`, `alarm-redqueen` | Pass |

Automated checks:

- All five stages loaded concept-image backgrounds.
- No inspected stage referenced the removed old visual-test backgrounds.
- All eight overlay artifact slots resolved to WebP assets.
- Onboarding remains isolated to the visual-test storage key.
- Main-game app icon drawing remains unchanged outside `body.visual-redesign`.
- Right rail and terminal remain fixed in the viewport after stage jumps.

## Remaining Gaps

- The stage-4 concept is still the weakest reference. It works in motion because the command-map UI and flood/decision systems add playability, but future passes should generate a stronger regional board concept if the page still feels like a background map.
- HTML HUD panels remain function-first. They are now mounted into hardware frames, but a deeper pass could turn the left rail into diegetic meters instead of ordinary text-heavy controls.
