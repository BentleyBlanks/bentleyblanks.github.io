# Dots HanYang 173R game integration

The HanYang first-person, carried and dropped world model uses only Dots' 173R delivery. The user requested complete retirement of the old gun: its TZM file, model/source registry entries, procedural builder and automatic importer entry are removed. Asset loading failure reports a retry error rather than substituting another rifle. Source geometry is metres, Y-up and muzzle −Z; the muzzle lip and butt-cap vertex clouds independently verify this in `Script_ModelFacingTest.mjs`.

## Asset identity and provenance

- Original delivery: `Hanyang173R_final.glb`, 295,470 triangles. SHA256 `3f380317c1930c7c141f6f0c0abb415a336354e25b78f24cc7bb9aa8c650a38c`.
- Game geometry: **79,513 triangles of an 80,000 triangle cap**, 44 named parts, 13 render meshes and 41 embedded maps, including two linear oil-film masks. In `Data_GameGeometry.json`, `gameSha256` identifies the finished GLB and `exteriorFinish.surfaceComparisons` records local-space distances to both Dots and R2. The two exterior ring display poses are recorded separately. Earlier `surfaceRepair` and `mechanismRepair` entries describe their respective revisions.
- R3 uses a unique atlas for each of the three wood pieces and keeps the grain lengthwise on the sides and samples the caps in the same object-space coordinates. Base colour, roughness/metalness and tangent-space normals are baked from a continuous object-space finish into the final UVs. The steel is darker in protected regions; age and wear vary across its surface rather than following the mesh triangles.
- The exterior revisions shape the wood shoulder and nose, the two band profiles and the rounded rear outline. The surface-distance record compares digital meshes. The historical photographs supply visual references.
- A 4.5 mm notch is cut into the previously solid rear sight crosspiece so the front blade is visible. This is a gameplay adaptation. The actual front blade and rear crown define ADS pitch and position.
- GPU publication uses the existing BC7 path rules. Main-stock PBR maps are 4096 square, the other two wood sets are 2048 square, and the two oil-film masks are 1024 square. Embedded source maps are lossless WebP. All output atlases clamp at their boundaries.

Source packages and source Blender projects remain outside Git:

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/`

`DotsDelivery/` contains the original three packages; all 605 supplied SHA256 entries were verified. `Game60k/Scene_HanYang173RGame60k.blend` is the editable reduced source. Preserve [Dots' material-source statement](Data_DotsMaterialSources.txt); it includes unresolved historical input provenance and does not assert that the whole package is CC0.

## Exterior photo comparison: R3, 2026-11-22

The primary visual reference is [Te Papa, DM000453](https://collections.tepapa.govt.nz/object/58119): several views of **one** catalogued wood-and-steel specimen, not a composite of different variants. [The National Museum of China](https://www.chnmuseum.cn/zp/zpml/gmww/202104/t20210402_249522.shtml) provides an independent silhouette check, not a source for close-up detail. No museum photographs are baked into the asset. Both pre-existing reference texture inputs are verified by digest during the bake.

| Feedback | Photographic evidence | Change and limit |
| --- | --- | --- |
| Figs. 1–2: seams and reflections | Te Papa [side](https://media.tepapa.govt.nz/collection/131447/preview), [receiver](https://media.tepapa.govt.nz/collection/131366/preview) and [band](https://media.tepapa.govt.nz/collection/131438/preview) | Rolled exposed edges catch narrow highlights while broad panels retain flat normals. Preserved the separation of wood and steel. Front wood now fills the visible opening. The photograph guides the profile, not the radius of a bevel. |
| Fig. 4: angular flank | Same side and receiver views | Reconstructed the exterior side shading from the wood surface rather than from individual triangle slopes. Preserved the intentional shoulder and the seam between wood pieces. |
| Figs. 3 and 5: grip metal | Receiver and [alternate view](https://media.tepapa.govt.nz/collection/131367/preview); [patina detail](https://media.tepapa.govt.nz/collection/131440/preview) | Reworked the guard rim and shading. Kept the broad steel face distinct from its rounded return; roughness is spatially varied. The original wear pattern is not known on faces outside the photographs. |
| Fig. 6: stretched wood grain | Receiver and band close-ups show longitudinal fibres with irregular dark/light streaks | Replaced the repeating cylindrical UVs with independent clamped atlases. Grain and tangent normals are sampled from the same surface coordinates across chart seams, not scaled to fit the UV island. No individual scratch or concealed surface is claimed as an exact match. |

### R4: follow-up to the marked photo review

The rear end of the upper **visible wood** now blends into the side profile rather than rising as a block. Only this local shoulder and the already documented nose depart appreciably from the R2 silhouette. The end of the wood and the metal band have actual rounded mesh edges. Steel at the edge is smoother, not painted white: the narrow glint changes with light direction while the broad face stays darker. The side disk remains metal but is less conspicuous. Timber uses irregular lengthwise ribbons and patches of polish instead of concentric arcs; its metal channel stays zero. The band close-up guides surface treatment, not the identity or dimensions of that band.

### R5: material authoring

R5 changes the surface only. The authored game mesh, UVs, tangents and all attachment coordinates are unchanged from R4. The finish is built from Poly Haven's [Black Walnut Veneer 02](https://polyhaven.com/a/black_walnut_veneer_02) and [Metal Plate 02](https://polyhaven.com/a/metal_plate_02), both [CC0](https://polyhaven.com/license); the wood species is an artistic material choice, not an identification of the museum specimen. Albedo, roughness and OpenGL normal are independent inputs. Only steel uses the source metal mask. Lengthwise wood figure and smaller pore detail use different scales; grip polish modifies roughness without cutting pigment into the normal. Oxide and exposed steel use different metallic responses; brighter edge reflections are not painted into the wood. No museum pixels are used in the bake.

The seven source hashes are pinned in `_import/Data_HanYangScanSources.json`. Raw files live in the external revision's `SurfaceScans/`, not in the game. The two generated R2 inputs are historical and listed separately in `materialMatch.previousSourceAssets`. The earlier provenance limitations for the underlying Dots delivery remain unchanged.

### R6: metal-only reference pass

Te Papa 131438 shows a dull brown crown, a straighter reflective side, discontinuous pale wear, pitting and a faint impression. R6 separates those areas rather than polishing the entire circumference. A worn relief on one visible side suggests the photographed impression without assigning the specimen's identifying digits to this game prop. The long steel, contact-polished parts, guard and smaller fittings have different wear distributions. Roughness and normal detail carry the highlights; the photographs are not projected into the asset. The underlying silhouette and wood finish are unchanged. The two specimens' band details and viewing angles are not asserted to be identical.

### R7: steel and timber under the same lights

The two bands use an interrupted patch of exposed metal near the shoulder, a darker crown and a less polished flank. Fine plate texture is sampled continuously along the part rather than restarting at a fixed interval. Longer steel surfaces, the guard and handled items carry a separate dark finish and contact polish. The timber combines walnut figure with the independently scanned colour, roughness and normal of Rob Tuytel’s CC0 [Fine Grained Wood](https://polyhaven.com/a/fine_grained_wood). The grain runs down the length of the timber; its fine pores and broken fibres do not repeat the broad shape of the veneer. An independent glTF specular factor reduces the milky reflection without making wood metallic. No mesh, atlas, camera or studio exposure change is needed to obtain the revised finish. Local review pairs `Before_*` (R6) with `After_*` (R7); the corresponding museum images are qualitative exterior references, not calibrated material samples.

### R8: compare like with like

The raised wood behind the band is visible in the user's Figure 4. The [Hubei Military and Civilian War of Resistance Museum](https://www.hbjmkz.com/07147.html) describes the wooden-handguard variant, while [Historical Photographs of China, JM04-178](https://exam2019.sec.sjtu.edu.cn/visual/JM04-178) identifies earlier sleeved examples in a 1937 photograph. Preserve the user's visible wood; do not use the early Te Papa specimen as a shape template in that region. Its large colour photographs remain useful evidence of the *surfaces*, not calibrated reflectance measurements. No physical dimensions are inferred from these photographs.

R8 maps narrow dark fibres into the timber's pigment, roughness and tangent normal together. The crown and the exposed rim have broken patina rather than a continuous polished strip. The long steel uses longitudinal abrasion with less contrast than the band shoulder. The mesh, UVs, lighting and exposure remain unchanged. The local R7/R8 studio pair uses identical lights and cameras. New views `ForeWood` and `UnderWood` inspect the actual regions in user Figures 4 and 6 rather than extrapolating from the band.

The independent colour, metal mask, roughness and OpenGL normal from Poly Haven's CC0 [Rusty Metal 04](https://polyhaven.com/a/rusty_metal_04) supply small irregularities at the transitions between film and exposed steel. The swatch is not used as the colour of the entire object. These four source hashes are pinned alongside the original ten in the scan manifest.

### R9: grain, crown marks and contact

The flank combines irregular crossing fibres and dark oil with a warmer rubbed grip surface. Two sparse irregular depressions break up the band's dark crown; they are visual interpretations, not measured corrosion. The baked red channel of the existing ORM maps now records local obstruction between eight fixed exterior parts. Blender traces 32 cosine-weighted directions per unique vertex/normal, excludes the surface itself and attenuates hits by distance. Free and moving parts never imprint permanent contact shadows. The game consumes this as glTF occlusion at strength 0.85 with its existing shared sampler; the studio does not multiply AO into base colour. Camera, exposure, topology, triangles and UVs are unchanged.

### R10: separate the crest, impression and knob highlights

Only the two band finishes and the knob have new texture content. The upper band has scattered dull oxide across its crest; the impressed wall breaks the reflection without a solid ink fill. The shoulder remains distinct from the quieter flank. On the round knob a broad worn area contains finer roughness variations; its tangent-space normal no longer inherits the pronounced streaks from the flat steel scan. R9 wood, guard, fixed-contact field, UVs, mesh and runtime multipliers are retained. No highlight is painted as a light source. The worn mark is an interpretation rather than a claim about a particular rifle's serial number.

The local review pairs R9/R10 in broad and raking light under unchanged studio settings. Registration DM000453 is the main surface reference; the [1911 Revolution Museum's Qing-period entry](https://www.1911museum.cn/view_2854.html) independently identifies metal and wood, not a calibrated finish for this particular game prop. Different specimens, lighting and unseen surfaces preclude an exact all-sides historical match.

### R11: repair the dark wedge at the butt-cap joint

At the top of the wood/steel joint, an opaque black wedge survived neutral albedo, zero metalness on the wood, unplugged normal maps and hiding the cap. A ray through it hit the wood, not an opening. On that face two corner normals pointed against the third. The baker now repairs the strongly opposing corners on 52 main-stock and nine upper-timber triangles, splitting only when another face needs the original frame. Flipping the tangent handedness along with the normal preserves the bitangent. All triangles retain their ordered spatial and UV coordinates. The mesh test compares an expanded per-corner digest to R10 rather than assuming vertex indices must remain identical across a shading split.

The fixed cap participates in the same inter-part contact bake as the stock. Its broad face uses a dedicated end-facing steel and patina projection rather than the old generic longitudinal pattern. No reference photo is baked into the asset; the actual reverse face of the museum specimen is not established by its side photograph.

For the top of the stock, see the bottom (rifle) example in Steven Lu's **Butt stock comparison** on [Arms of China](https://armsofchina.com/firearm/hanyang88/#:~:text=Butt%20stock%20comparison). This is a separate specimen, not another view of Te Papa DM000453. Its continuous dark satin top contrasts with the drier sides. The game model varies top-surface stain, roughness and fibre-normal strength together; there is no painted highlight. Use the dedicated `Review_StockTop` camera to compare the finish. The collector photograph is not bundled or sampled in the bake.

### R12: distinguish lighting from the finish on the stock

The top-of-stock photograph by Steven Lu in the R11 reference shows a narrow reflection above dark directional grain. Its light source and exposure are unknown. A controlled studio study compared material variants under both the broad studio and a narrow strip light. R12 retains the main stock's R11 substrate (including its pore normal and zero metalness) and supplies the oil reflection as standard `KHR_materials_clearcoat` on this part alone. One 1024-square linear red-channel mask fades the film off the top surface and varies it with the existing grain and wear. The relatively smooth coat has no independent normal map; its reflection responds to scene lighting, not a bright line painted into the colour texture. The upper handguard and all steel retain their R11 materials.

Use `Review_StockTop` to inspect the finish; the review script renders both `After_StockTop` and `After_StockTopStrip` for a second lighting condition with the same geometry and view. The front timber between the bands uses its own worn finish and sparse irregular depressions based on the bottom long rifle in the same contributor's **Length comparison**. Pigment, roughness and tangent-space normals describe each indentation; no individual mark is copied from the photograph. `Review_ForeEndFinish` and its raking-light render inspect this area separately from the upper wooden handguard. The museum / period references still cannot establish the exact finish of faces that they do not show.

### R13: distinguish the two exterior band finishes

The bottom long rifle in Steven Lu's **Length comparison** on [Arms of China](https://armsofchina.com/firearm/hanyang88/#:~:text=Length%20comparison) shows a broad continuous reflection on the front band. The knob and side disc identify the photographed face of the rear band: the narrow ridge with an adjacent dark return belongs on the knob side. R13 preserves its stamped surface treatment as an artistic detail drawn from Te Papa DM000453, not an identifying mark observed on the Lu specimen. A tangent-space profile and local roughness variation carry the reflection. The opposite flank has a more restrained roll, not a claimed second photographic match. These photographs constrain appearance, not a measured section.

Use `Review_FrontBandSide` and `Review_RearBandReverse` to inspect these faces, and the paired `RearBandReverseRaking` render for the narrow source. R13 changes six maps (two complete PBR sets). The R12 wood/oil-film mask, other fittings, positions, normals, UVs and game triangle count are retained.

### R14: continuous reflections on the exposed steel

Steven Lu's bottom long rifle in **Length comparison** and Te Papa's receiver close-up show broad areas of toned steel with continuous longitudinal reflections. R13 instead put large pale patches across the curved steel. R14 separates the round exposed surfaces from the adjacent housings and side disc. Fine lengthwise marks affect roughness and tangent normals without drawing a permanent highlight into the base colour. Small oxide and end-wear variations remain. No operating or geometry data changed. The six revised material sets are the only texture changes; hashes of the remaining 115 images are checked against R13.

The local `Review_MidSteel` camera frames the transition. The paired `After_MidSteel` and `After_MidSteelRaking` renders share geometry, view and exposure. Compare R13/R14 in the same fixture; do not infer absolute reflectance from photographs of different objects under unknown lighting.

### R15: midsection and timber colour separation

The R14 exposed cylinder and its adjacent housings still looked pale under the broad studio source. A BlenderMCP isolation study kept geometry, view and exposure fixed and compared material variants under both broad and raking light. Increasing roughness alone flattened the material without adequately darkening the broad area. R15 instead adjusts linear reflectance and metallic response between protected and rubbed areas. These changes apply only to the exposed midsection and its two adjacent housings. The dark-game check remains independent of the studio photographs.

The side-on **Length comparison** from Steven Lu also shows less warm colour on the upper handguard than on the lower timber. R15 gives the upper piece its own desaturated aged finish; the stock's side has sparse broken-fibre wear, independent of the crest. The existing oil-film mask and fore-end maps remain byte-identical. No reference photograph is used as a game texture. Use `Review_StockFlank`, `Review_ForeWood` and `Review_MidSteel` to check the changes. Position, UV, triangle and tangent-frame gates remain unchanged; 118 texture payloads are locked to R14.

### R16: compare the wood pieces on the same rifle

For the broad timber flank the relevant comparison is across the wooden seam on the bottom rifle in Steven Lu's **Length comparison**, not between two differently lit specimen photographs. In R15 the model's lower piece was nearly as dark as the upper piece. R16 brings out the worn lower wood without brightening the whole stock: a separate old-wood swatch supplies local pigment, roughness and directional normals. The upper handguard remains stained and muted. Irregular, tapered broken fibres on the flank affect its normal, colour and roughness together. They are not repeated stamps and do not copy a collector specimen's identifying marks.

Use `Review_ForeWood` and `Review_StockFlank` with the broad and raking renders to inspect the two areas. Five wood payloads change: base/ORM/normal for the stock and base/ORM for the upper piece, whose dielectric specular factor is now 0.17. The remaining 128 images, including its normal map and the stock oil-film mask, and the previous geometry tests are unchanged. Photographic lighting is not calibrated; compare tone hierarchy and highlights qualitatively rather than asserting exact reflectance.

### R17: distinguish exposed chips from fine stock grain

The aligned side patch from Steven Lu's **Length comparison** has a few larger broken fibres and longer, irregular cross-grain grazes among fainter marks. R16 mostly showed near-equal small specks over its grain. R17 varies the length, width, orientation, cluster density and exposed lip of unrepeated local marks. The worn lip, newly exposed fibre and dark intact oil are separate pigment, roughness and tangent-normal signals; no stain, serial or specimen-specific carving was traced from the reference. Only three textures for the main stock change. The upper/lower forearm hierarchy, all steel and the top film mask remain as in R16.

The local review compares the same R16 and R17 flank cameras in studio and raking light. Matched-resolution quadrilateral samples exclude the specimen marking and background. Counting small connected bright patches describes the rendered **appearance**, not the physical number of scratches or their dimensions. The model and the independently photographed specimen were not lit by the same rig.

### R18: allow wear to continue down the narrowing flank

R17 reproduced small exposed chips but biased elongated marks toward oblique strokes. Its wear mask also ended before the flank narrowed, leaving a bare patch adjacent to worn wood. The new material biases a subset of longer chips across the grain while leaving the short fibres multidirectional. Along the taper it increases the frequency smoothly, fades the wear and protects the existing top finish. Colour, roughness and tangent normal share each mark's shape. Only the stock's three base PBR images change; all other 130 image payloads and the original geometric tests are retained.

The local **FlankDirection** plate uses two separately registered patches of Steven Lu's long-rifle side photograph, excluding background and specimen markings. Sample grids, bright-region thresholds and orientation criteria are identical across the compared versions. These are checks on visible texture organization, not counts of physical damage. See **FlankDirectionLighting** for a check under different illumination.

### R19: exterior strap fittings

Steven Lu's **Length comparison** (bottom long rifle) shows the band and stock rings at an oblique rest, not both fully open in side view. R19 uses rigid display transforms on just these two exterior nodes. The angles are an interpretation of that photograph; they are not measured intrinsic dimensions. Both rings now have continuous shaded edges across UV splits. The band-side strip and the two ring/base pairs have their own worn-steel colour, roughness and tangent normals, with a quieter protected base and a rubbed outer arc.

The two bases each had 18 triangles but open bevel boundaries. Completing the shells from their existing exterior vertices gives 76 and 68 triangles, respectively: 108 more across the whole prop. Tests require each geometric edge of the welded shell to have two opposite uses, with no zero-area UV faces. Local geometry and UV corner digests for all other parts, the two rigid transforms, wood maps, and 118 unrelated texture payloads are checked independently. `ringPresentation` describes pose-only displacement; `surfaceComparisons` remains a local-space comparison against digital sources, not measurements of the historical specimen.

Use `Review_BandTrim`, `Review_StockTrim` and `Review_BandStrip` for the small fittings. The source scene is packed and saved before rendering the review views. `Review/Data_RenderReceipt.json` is written only after the full set finishes and ties each rendered PNG to the imported GLB.

### R20: interrupted film on the fore-end

The front timber of the bottom long rifle in Steven Lu's **Length comparison** has a broad reflection interrupted by exposed fibres and irregular depressions. A matched material-and-light study on R19 confirmed that the appearance depends strongly on source direction. R20 retains dielectric wood, not metallic silver pigment. A separate 1024-square red-channel mask drives its clearcoat, fading at the ends, underside, exposed pores and deeper impressions. Base colour, roughness and normal describe the worn substrate. The adjacent length of exterior steel is darker and rougher, with a restrained rubbed edge; it should not become as pale as the worn timber in side light. The original stock-crest mask remains image 132; the new mask is appended as image 133, preserving all earlier image indices. Six R19 image payloads change, while 127 remain identical. No glow, baked highlight or reference-photo projection is used.

The local `ForeEndFinish`, `ForeEndFinishRaking` and `ForeEndSideBox` shots keep the camera fixed. Neither a bright pixel nor a close mean value from an independently lit photograph establishes the actual historic finish chemistry. Compare the contrast between steel, the rubbed timber side, and the interruptions in the reflection.

### R21 exterior steel

The bottom long rifle in Steven Lu's *Length comparison* provides the common side view for both bands. The model now has a bowed front-band outline, an uninterrupted satin face and a small visible trim along its lower edge. The rear band has a narrower outline and a raised-looking central strip with a recessed return. These contours and the trim pose are estimates from the photograph. The surface marks on the Te Papa specimen are a separate reference for material wear. [Arms of China](https://armsofchina.com/firearm/hanyang88/) · [Te Papa DM000453](https://collections.tepapa.govt.nz/object/58119)

The colour, roughness and tangent normals of the exterior steel are baked into each part's existing atlas. The front band has a broad worn patch. The rear band carries the narrower reflection along the rib. The handle reflects a compact light source while the longer steel carries an axial highlight. The two updated band outlines use the existing mesh topology. Regenerate their contact fields with `Script_HanYangContactBake.py` before running `Script_HanYangExteriorBake.py`. Inspect both sides using `Review_FrontBandProfile`, `Review_RearBandProfile` and the reverse views in the packed Blender scene.

### R22 fore-end grain and impressions

The photographer's original 4032 × 1728 side image resolves a forked mark, a short dark chip and a group of deeper fibre impressions on the bottom rifle. Their locations were registered on the visible timber face using the two bands and the wood outline, then checked against the packed mesh in Blender. Each impression interrupts the oil mask and changes the substrate normal and roughness. The surrounding grain has a shallower, elongated relief. The opposite face retains its existing wear. The reference photograph stays in the local review materials. [Steven Lu, Arms of China, original side photograph](https://armsofchina.com/wp-content/uploads/2026/04/143.jpg)

The whole-rifle light test keeps the lamps fixed in world space across both versions. The local `ForeWoodWitness` plate shows corresponding crops of the original photograph and both renders. Local checks compare the visible impressions under frontal and elevated light. Two off-axis area lights are also tested against the visible highlights on the handle knob. Under that hypothesis the broad fore-end flank needs a lighter worn substrate, and the guard flank a darker, rougher finish. The wood below the guard provides a local lightness comparison. The GLB changes four fore-end images and the guard pigment and ORM, with 128 other R21 images retained byte for byte.

### R23 stock grain and detail charts

The stock comparison shows short transverse impressions along the polished crest, then a cluster of exposed wood fibres where the stock narrows. Their pigment, roughness, tangent relief and oil coverage share the registered outlines. A neutral material under a grazing light exposed a jagged crown reflection. The crown shading now follows a smoothed field fitted to the mesh surface. The wood stain fades gradually around the turn visible in feedback image six. The exact underside finish is an artistic interpretation. [Steven Lu, stock comparison](https://armsofchina.com/wp-content/uploads/2026/04/145.jpg)

The rear outline uses a local bend shared by the end of the wood and its metal cap. Both the top and side photographs were compared when choosing the outline. The visible side impression is traced from the two forms on the stock of the bottom rifle. Its meaning and date are unknown. [Steven Lu, side comparison](https://armsofchina.com/wp-content/uploads/2026/04/143.jpg)

Four small exterior detail meshes use new Blender UV islands. Per-corner UVs and tangents are stored in `Data_DetailUv.npz` in the external source folder. The asset test checks directional stretch in every affected triangle. It compares the ordered positions and frames outside the edited regions with R22, including all lateral and vertical coordinates on the stock and cap. The front timber, bands and guard retain the preceding finish.

### R24 portable PBR colour

All 44 base-colour maps contain the calibrated sRGB colour. A standard glTF loader and a fresh Blender import can display the same finish as the game. Prior GLBs stored darker maps and reconstructed their colours with a linear multiplier on each material. The game and motion comparison tool read the `asset.extras.calibratedBaseColor` flag to select the correct path. The historical `gunBase=authored` view uses the relative multiplier appropriate to the file it loads.

The game preserves the authored steel and wood response during material setup. Several steel names include “Handle”, “Surface” or “Head”, which also match character skin names. The explicit material choice keeps skin shading off the steel. Both timber oil masks receive the same oblique-view filtering as their base colour.

The end of the fore-end follows the bowed band outline. In the preceding GLB a short brown strip projected beyond the band in both side views. The correction keeps the UVs and attached finish and updates the local contact shadows. The forward band has a cooler satin face with localized polishing. The rear band's burnished rib and rolled return have a darker recess between them. Pigment, roughness and tangent relief carry the differences under changing illumination. Outside the two bands, all normal images and roughness and metalness channels retain their R23 bytes. Both oil masks are identical. The gallery study uses the bottom specimen in Steven Lu's photograph. [Arms of China, length comparison](https://armsofchina.com/wp-content/uploads/2026/04/143.jpg)

### R25 rear band finish

The side photograph shows the band rib narrowing above a darker lower margin. A small area of steel remains visible beside the hanging loop. The final finish tapers the normal relief and the two worn areas together. A mottled satin surface continues across the lower margin. The lower face is a solid visual detail with a rolled edge. Its outline and the static resting pose of the loop are interpreted from the photograph. [Steven Lu, length comparison](https://armsofchina.com/wp-content/uploads/2026/04/143.jpg)

The three rear-band details use eight revised images. The other 126 embedded images retain their R24 bytes. All index and vertex streams outside the solid lower face also retain their R24 bytes. The game and published model use the native base-colour workflow introduced in R24.

### R26 inspection bench finish

The three timber atlases share an object-space walnut stain and grain field. Local dents and abrasion vary the pigment, normal and roughness. The fore-end's satin lobe and the stock's localized oil mask carry the sheen. The inspector checks Albedo, Roughness and Reflection on both sides of the game GLB.

The front band has a taller outline and a flatter lower turn, based on the published front-band photograph. The wood end follows the visible shell. The assembled end is an estimate informed by the side photograph. At the butt, the wood sits beneath the backplate surface. See the `FrontSeam` and `ButtCap` views in the Blender review. [Xu Jilin, Chinese National Geography gallery](https://www.dili360.com/ch/mag/detail/62.htm) · [Steven Lu, side photograph](https://armsofchina.com/wp-content/uploads/2026/04/143.jpg)

### R27 inspection bench details

The front forearm has local support sections that seat its lower shoulder under the band throughout the joint. The three timber ends meet the rear band under its lips. The narrower lower trim and the resting loop follow the visible outline in the side photograph. The viewing angle and the visible contours guided the trim and bevels. [Steven Lu, length comparison](https://armsofchina.com/wp-content/uploads/2026/04/143.jpg)

The exposed action, handle stem and tail use lower-contrast satin steel with fine pitting. The stock's side glyph is removed from pigment, roughness and normals. Blender bevels and new UV/tangent frames give the sight and raised receiver edges a narrow glint. The material study combines the visible steel from the museum specimen and the sight in Lu's upper-surface photograph. The photographed wear and the game lighting give different highlights. [Te Papa DM000453](https://collections.tepapa.govt.nz/object/58119) · [Steven Lu, upper surfaces](https://armsofchina.com/wp-content/uploads/2026/04/142.jpg)

The asset test casts rays across both band joints, including oblique directions around the front band. Matched camera captures from the actual inspection bench and its Albedo, Roughness and Reflection views are in the archive's `Review` folder.

### R28 steel finish and exterior edges

The steel uses separate pigment, roughness, metallic and tangent-normal fields. Scan samples and small pits give the dark grey-brown oxide its texture. Local abrasion follows the flanks, rolled returns and the exposed handle shoulder. The sharpness of those highlights changes with the viewing angle. [Te Papa DM000453](https://collections.tepapa.govt.nz/object/58119)

The rear band takes its cross sections from the approved band mesh. Its raised rib is part of the surface and its four UV islands keep a similar texel density along and around the band. Blender bevels and their face masks place edge wear on the receiver, rear sight and visible handle root. The amount of rounding was judged from the shadows and edge highlights in the photographs. [Steven Lu, length comparison](https://armsofchina.com/wp-content/uploads/2026/04/143.jpg) · [Steven Lu, upper surfaces](https://armsofchina.com/wp-content/uploads/2026/04/142.jpg)

The actual weapon inspection bench comparison and its Albedo, Roughness and Reflection captures are in the archive's `Review` folder.

### R29 walnut grain and steel patina

The three timber surfaces share a walnut stain. Irregular growth rings follow the carved volume. Aperiodic samples of walnut grain and weathered wood supply the local fibres, pits and colour. The stock crest and worn forearm carry the retained oil in their roughness and finish masks. The handguard and stock reference photos show how the grain and sheen change around the curved surfaces. [Steven Lu, stock and handguard photographs](https://armsofchina.com/firearm/hanyang88/) · [Te Papa DM000453](https://collections.tepapa.govt.nz/object/58119)

The steel uses overlapping scan patches with locally selected offsets and orientations. Clean steel patches stay within the plates of the source scan. Oxide, pits and machining marks vary across the longer surfaces, and the R28 bevels carry the polished highlights. The bake retains the R28 geometry and UV streams at 79,909 triangles.

The reference comparison and the Albedo, Roughness and Reflection screenshots from the actual inspection bench are in the archive's `Review` folder.

### R30 band fit, rounded edges and worn finish

The front band uses a closed oval loft with rounded outer lips and eased inner returns. Removing redundant strips leaves room for the denser rear-band crest and the Blender bevels on the collar, sight, handle shoulder, band strip and guard. The forearm seats further inside the bowed rear lip of the front band. The rear loop's display pose shows the opening in profile. The asset test checks both band shells for open edges and sweeps oblique sections at the timber joints. [Steven Lu, side photograph](https://armsofchina.com/wp-content/uploads/2026/04/143.jpg) · [Chinese National Geography, front band](https://www.dili360.com/ch/mag/detail/62.htm)

The walnut bake adds fine grain along the carved volume and varies the worn oil across all three pieces. The steel bake separates neutral oxide, localized pits and satin machining marks from polished edges. The stock flanks are clear of lettering. The runtime retains 44 meshes at 79,584 triangles. The archive contains matched R29 and R30 views from the weapon inspection bench and captures of Albedo, Roughness, Reflection and Normal. [Te Papa DM000453](https://collections.tepapa.govt.nz/object/58119) · [Steven Lu, upper surfaces](https://armsofchina.com/wp-content/uploads/2026/04/142.jpg)

### R31 receiver joint, rear cheeks and guard lighting

The handguard heel sits beneath the stock flank on both sides. A local taper carries the upper end underneath the collar. The stock and handguard mounts share the same walnut stain. The asset test sweeps the two stock flanks at their joint.

The rear cheeks use closed profiles with rounded returns. The satin finish carries across the cheeks and cap, with brighter wear on their lips. The guard opening has a rounded inner lip and a continuous satin wall. Short rays into the opening add the visibility of the opposite wall to the AO bake. The R31 inspection archive captures the three areas from the feedback view in the actual game inspection bench. [Te Papa DM000453, side detail](https://media.tepapa.govt.nz/collection/131366/preview) · [Te Papa DM000453, alternate view](https://media.tepapa.govt.nz/collection/131367/preview)

### R32 fine exterior returns and dark walnut

The sight plate and seat follow their existing outlines with curved perimeter strips and normals that follow the cross section. The receiver shoulder, rail end, handle root and rear steel pieces have softer outside returns. The upper wood eases into the sight and collar. The new metal-edge masks follow the curved faces through their UV charts. [Te Papa DM000453](https://collections.tepapa.govt.nz/object/58119) · [Steven Lu, upper surfaces](https://armsofchina.com/wp-content/uploads/2026/04/142.jpg)

The three timber pieces share a darker walnut stain chosen from the lit flanks of DM000453. Grain, roughness and oil remain in their authored maps. The inspection bench captures both feedback views and the timber albedo. The runtime remains below 80,000 triangles.

### R33 rear stock contour and side disk rims

The rear steel uses a single tapered exterior shell. Its visible edge follows the low contour in the side and overhead photographs. The rear-axis view is inferred from those two views. The large stock disks and their raised centers have round profiles with actual curved rims. The inspection bench compares the rear-axis and oblique views and the disks' Normal and Reflection channels. [Te Papa DM000453, closed side](https://media.tepapa.govt.nz/collection/131366/full) · [Steven Lu, stock comparison](https://armsofchina.com/wp-content/uploads/2026/04/145.jpg)

The wooden flanks carry compressed dents and short broken edges guided by the stock photographs. Their relief comes from a shallow depression in the normal map. The stain is darker in the bed, with local roughness changes around each rim. [Te Papa DM000453, closed side](https://media.tepapa.govt.nz/collection/131366/full)

The game draws the 44 named pieces in 13 meshes. Pieces with compatible material parameters and animation ownership share lossless Base Color, ORM and Normal atlases. The packing preserves source texel density and leaves a 32-pixel gutter. The GLB retains the named geometry for the Blender archive, and the inspection bench can select its regions inside a merged draw mesh. The tapered rear cover belongs to the fixed body.

### R34 timber impressions and steel surface relief

The stock heel and wrist use clusters of shallow impacts with irregular beds and torn edges. The crest and both pieces of forewood carry smaller impressions. Each impression changes the tangent-space normal, roughness, stain and, where present, the oil film. The band and handle close-ups guide the distribution of pores and the difference between dark cavities and burnished shoulders. [Te Papa DM000453, band](https://media.tepapa.govt.nz/collection/131438/full) · [Te Papa DM000453, handle](https://media.tepapa.govt.nz/collection/131440/full) · [Steven Lu, stock comparison](https://armsofchina.com/wp-content/uploads/2026/04/145.jpg)

The bake uses the walnut and weathered steel scans' 16-bit displacement to isolate recesses and align them with the other PBR channels. It removes the donor steel's broad corrugation from the transferred normals. R34 uses the R33 geometry, with 79,513 triangles, 13 render meshes and 41 embedded maps. The reference crops and matched inspection bench views are in the external archive's `Review` directory.

### R35 contact ambient occlusion

Cycles bakes local occlusion on the final UV0 of the assembled asset, including the bands and sling fittings, the upper wood seam, the receiver covers, the guard cavity and the butt plate. A 5 mm field resolves the seams and a lighter 14 mm field picks up the nearby recesses. The bake uses the game's fixed group for the body and sights. The bolt and cocking groups each use their own geometry. The thin trigger uses live shading.

The compositor writes the visibility into the existing ORM atlases' red channel. It retains the R34 base colour, roughness, metalness, normal and oil-film data. The game and the inspection bench read the same packed AO. The review archive contains matched views from both channels.

Open the packed source scene through BlenderMCP. Set `HANYANG_AO_INPUT` to the matching GLB and `HANYANG_AO_OUTPUT` to the staging directory in Blender's Python environment, then run `_blender/Script_HanYangContactAtlases.py`. Run `python Taierzhuang1938/_import/Script_HanYangPackContactAtlases.py <input-directory> <bake-directory> <staged-output>` with NumPy, SciPy, Pillow and OpenCV, then verify the packed GLB in the inspection bench.

### R36 timber micro-occlusion and stronger contact

The timber shader rasterizes the recessed fibres from the walnut scan and the existing chips, cuts and compressed dents onto each wood piece's UV0. Their micro-visibility goes into the ORM red channel alongside the contact bake. The contact curve steepens the visibility loss inside the joints and eases back across the exposed panels. The packed AO uses the full authored strength in the game and the inspection bench.

Run `python Taierzhuang1938/_import/Script_HanYangMaterialOcclusion.py <R35-directory> <SurfaceScans-directory> <staged-output>` on the output of the R35 contact pass. The stage uses the same OpenGL context and walnut displacement as the exterior bake. The game inspection archive contains matched AO and grazing-light captures of the wood and matched AO captures of the assembly joints.

### R37 weathered timber and burnished bevels

The stock and both pieces of forewood carry shallow compressed patches, uneven torn fibres and tapered gouges. A shared profile drives their colour, roughness, normal, oil film and material AO. The wood AO is composed with the original R35 contact field so each shadow follows the current wear. [Steven Lu, stock comparison](https://armsofchina.com/wp-content/uploads/2026/04/145.jpg) · [Te Papa DM000453, band close-up](https://media.tepapa.govt.nz/collection/131438/full)

The studio highlights follow the authored metal bevel faces and narrow convex turns. Their local roughness decreases and the exposed steel approaches full metalness. Wood lips use roughness and the existing oil-film maps, with a stronger reflection on the rounded edges. The inspection archive includes matched wear, AO and reflection views.

Run `python Taierzhuang1938/_import/Script_HanYangWearAndEdges.py <R36-directory> <R35-GLB> <exterior-source-directory> <staged-output>` with the authored timber and bevel arrays in the exterior source directory. The command keeps the verified part and atlas layout and updates the packed PBR maps.

### R38 handling wear and interrupted edge polish

The grip and the supported faces of the stock and forewood have separate fields for rubbed oil, exposed wood finish and fine scuffs. The scuffs run along the wood grain, with broken ends and varied roughness. The stock return beneath the rear cap has longitudinal tracks following its curved steel surface. Weathered steel scan data breaks up the dark oxide and exposed steel. A shared field drives the colour and roughness of the worn metal bevels.

Apply the finish to the R37 export with `python Taierzhuang1938/_import/Script_HanYangUsageWear.py <R37-directory> <exterior-source-directory> <staged-output>`. The finish bake writes the existing Base Color and ORM maps and adjusts the two wood oil films. The review archive records the original inspection views and the same game first-person lighting poses.

### R39 fitted inspection joins

The rear exterior cover sits beneath the receiver at its leading overlap. Its aft side lips tuck into the wood so the central exposed plate has a continuous outline. At the sight, the upper handguard's rounded opening follows the existing steel seat with a thin reveal. The inspection archive includes matched side and overhead views.

Run `python Taierzhuang1938/_import/Script_HanYangFitCleanup.py <R38-directory> <fitted-stage>`. Open the fitted export with BlenderMCP and bake contact visibility with `_blender/Script_HanYangContactAtlases.py`. Then run `python Taierzhuang1938/_import/Script_HanYangFitContact.py <fitted-stage> <contact-bake-directory> <R35-GLB> <finished-stage>`. This composites the new contact bake at the repaired joins with the timber's material occlusion in the existing ORM red channel.

### Rebuild and inspect

The review opens on `Review_Band` with the packed materials, studio world and scene lights enabled. Use `Review_Receiver` for the wood-to-steel junction, `Review_ForeWood` and `Review_UnderWood` for the feedback regions, or `Review_Side` for the full silhouette. `gameAssetSha256` identifies the inspected GLB. The band relief and broken finish are an interpretation of visible wear, not a recovered serial number. The Te Papa close-up is the material reference; the [National Museum of China catalogue photograph](https://www.chnmuseum.cn/zp/zpml/gmww/202104/t20210402_249522.shtml) is an additional specimen, not a colour standard or a template for its wear marks.

Additional cameras `Review_Knob`, `Review_RearSeam`, `Review_ButtCap` and `Review_FrontSeam` let an artist inspect the macro finishes and the original feedback regions directly.

Under the external source directory, `ExteriorFinish_20261122/Input_R2.glb` and `Input_R2.json` retain the upstream model and bake metadata. `Input_ExteriorGeometry.glb` is the approved R4 mesh/UV/tangent source, pinned by SHA256; R5 reads the geometry attributes directly to avoid varying a smart UV pack on re-export. Its old textures are not used in the R5 bake. Keep the Dots source. `ReferenceMaterials_20261113/Data_RuntimeGains.json` is used when opening legacy comparison models. Set `HANYANG_SOURCE_DIR` before starting Blender to use another archive root. The R5 material-only rebuild can skip the mesh generation command if the geometry input and audit are present.

```text
node scripts/Script_BlenderMcp.mjs start --task HanYangExterior
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_HanYangExterior.py --timeout 600
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_HanYangExteriorAudit.py --timeout 240
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_HanYangInspectionBevel.py --timeout 240
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_HanYangContactBake.py --timeout 600
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_HanYangDetailUv.py --timeout 600
python Taierzhuang1938/_import/Script_HanYangScanLibrary.py
python Taierzhuang1938/_import/Script_HanYangExteriorBake.py
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_HanYangExteriorReview.py --timeout 600
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

The baker needs NumPy, Pillow, SciPy and ModernGL with an OpenGL 3.3 context. Set `HANYANG_BAKE_GEOMETRY_DIR` for staged bevel and contact fields. Set `HANYANG_BAKE_OUTPUT_DIR` for the staged GLB, report and packed Blender review. Use that packed scene and matching GLB as the inputs for the R35 contact bake. Apply the timber micro-AO pass and the R37 finish using the staged R35 contact GLB, then add the R38 handling wear and create the final Blender review. A temporary `ReviewInput.glb` in the revision directory enables matched before/after renders. The review includes neutral studio and narrow grazing light. Promote the completed `Model_HanYang173R.glb` and `Data_GameGeometry.json` to this asset folder and run `node Taierzhuang1938/Script_HanYang173RAssetTest.mjs`. All review images and third-party photographs stay outside publication.

## Historical photo-reference material revision R2, 2026-11-13

The user rejected the preceding smooth finish. R2 matches the two supplied receiver and barrel-band photographs with dark longitudinal timber fibres, fine steel corrosion, oxide mottling and spatially varying worn reflections. Wood uses a 6 cm repeating cylindrical unwrap with planar ends. The steel source repeats every 4 cm before baking into the existing atlases. Metal bump distance is 32 micrometres at strength 0.25. Wood bump distance is 150 micrometres at strength 0.30. Roughness varies with the source texture across each surface.

Both source base-colour images were generated with built-in imagegen, tier 1. Their hashes are recorded in `Data_GameGeometry.json.materialMatch`. The source images, exact prompts, immutable preceding GLB, raw 16-bit normals and packed editable Blender project live in `ReferenceMaterials_20261113/` under the external source directory. Generated texture details and material parameters are creative reconstruction. The reference photographs guide appearance.

The base maps account for the existing runtime colour gains. Browser normals are packed to 8-bit at their baked dimensions. The repository's lossless WebP packer verifies decoded pixel identity and preserves dimensions. Identical wooden texture payloads share buffer views while the 44-part and 132-image structure is retained. Both handguard bands receive fresh aspect-preserving UVs and 2048-pixel bakes. Geometry remains at 64,266 triangles.

```powershell
node scripts/Script_BlenderMcp.mjs start --task HanYangSurfaceRepair
node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['HANYANG_PROJECT_ROOT']=r'<owned-worktree>/Taierzhuang1938'; os.environ['HANYANG_MATERIAL_PARTS']=''"
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_HanYang173RReferenceMaterials.py --timeout 3600
python Taierzhuang1938/_import/Script_HanYang173RRebakeAssemble.py <revision>/Model_HanYang173R_Before.glb <revision>/Model_ReferenceBaked.glb <revision>/Bake --report <revision>/Data_RuntimeGeometry.json --material-match <revision>/Data_MaterialMatch.json
python Taierzhuang1938/_import/Script_HanYang173RPackRuntime.py <revision>/Model_ReferenceBaked.glb Taierzhuang1938/Model/HanYang173R/Model_HanYang173R.glb <revision>/Data_RuntimeGeometry.json
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

Before assembly, copy the preceding `Data_GameGeometry.json` to `<revision>/Data_RuntimeGeometry.json`. After packing, copy the updated report to `Model/HanYang173R/Data_GameGeometry.json`.

## Mechanism and preceding finish revision, 2026-11-13

The user rejected the preceding full-surface coarse finish. The visible rear mechanism now uses paired protective cheeks, a stepped round cocking body, a complete circular rear disc and central pin, a thin rounded safety flag and top strip, a round bolt stem, a 48-segment knob, and a beveled rear V-notch. The 2026-11-12 wooden meshes and fitted handguard band provide the surrounding rifle body.

Sixteen steel parts use restrained fine surface variation. Blackened protective parts and the worn bare mechanism have separate reflectance targets, with roughness around 0.30–0.35. The bake records the selected finish and render-active UV layer. Wood retains its 4096-pixel publication rules.

The museum receiver photograph and the auction's photographs 3 and 4 were opened for visual comparison. They show the protective cheeks, rear disc, safety outline and smooth worn steel. Dimensions, fit allowances and finish parameters are artistic reconstruction. [Te Papa Hanyang Type 88](https://collections.tepapa.govt.nz/object/58119) · [Receiver photographs](https://www.icollector.com/Chinese-Hanyang-Mauser-Bolt-Action-Rifle_i13828566)

The revision lives in `MechanismFinish_20261113/` beside `DotsDelivery/`. `Data_RuntimeGains.json` records the runtime colour multipliers used to derive the baked reflectance. Generate it from `HanYang173RBaseGain` before the first rebuild, then run the managed MCP builder and assembler.

The revised complete-arm scans pass the 2 mm confirmed-depth gate. Empty and partial reloads reach 1.965 mm, held-open reload 1.594 mm, and the ordinary bolt cycle 1.796 mm. The independent mechanical-motion check reports a 63.2 mm hand step at phase 0.256 with both the revision and its immutable pre-revision GLB. The earlier left-finger self-contact baseline remains recorded below.

```powershell
node scripts/Script_BlenderMcp.mjs start --task HanYangSurfaceRepair
node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['HANYANG_PROJECT_ROOT']=r'<owned-worktree>/Taierzhuang1938'"
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_HanYang173RMechanismRepair.py --timeout 2400
python Taierzhuang1938/_import/Script_HanYang173RRebakeAssemble.py <revision>/Model_HanYang173R_Before.glb Taierzhuang1938/Model/HanYang173R/Model_HanYang173R.glb <revision>/Bake --report Taierzhuang1938/Model/HanYang173R/Data_GameGeometry.json --mechanism-repair <revision>/Data_MechanismRepair.json
node scripts/Script_BlenderMcp.mjs stop
```

## Earlier close-up repair, 2026-11-12

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
