# Chapter One generated-asset requirements

This is the production checklist for the isolated `ChapterOneImagegen` page. Each scene subject is replaced by an individual bitmap asset. A generated asset may hide its matching procedural subject only after the PNG has loaded successfully; load failure restores that exact fallback.

## Output contract

- Built-in OpenAI ImageGen, one call per distinct asset.
- Source generation uses a flat `#ff00ff` chroma-key background.
- Runtime output is a 1536 x 1536, 8-bit RGBA PNG with transparent corners.
- Layered handmade-paper construction, fibrous aged-paper texture, charcoal detail, and the approved cold gray-brown palette.
- No text, labels, watermark, cast shadow, floor plane, modern object, glossy 3D rendering, anime treatment, or photorealism.
- Animated interaction elements may remain code-driven, but their visual footprint must be subordinate to the generated scene asset.

## Accepted and connected

| Area | Asset | Runtime key | Status |
| --- | --- | --- | --- |
| Scene One | Damaged home facade | `houseFacadeDamaged` | Connected |
| Scene One | Timber door frame | `doorFrameTimber` | Connected |
| Scene One | Kang bed | `kangBed` | Connected |
| Scene One | Low stool | `stoolLow` | Connected |
| Scene One | Cracked water jar | `waterJarCracked` | Connected |
| Scene One | Ragged bedding | `beddingRagged` | Connected |
| Surface | Sparse elm | `elmSparse` | Connected; color rework required |
| Surface | Well winch frame | `wellWinchFrame` | Connected |
| Surface | Well stone base | `wellStoneBase` | Connected |
| Surface | Well bucket | `wellBucket` | Connected |
| Surface | Burned shed shell | `shedBurned` | Connected |
| Surface | Ash debris pile | `ashDebrisPile` | Connected |
| Cellar | Earth wall tile | `cellarEarthWallTile` | Connected |
| Cellar | Timber post | `cellarTimberPost` | Connected |
| Cellar | Timber beam | `cellarTimberBeam` | Connected |
| Cellar | Weak oil lamp | `oilLampWeak` | Connected |
| Cellar | Old cloth bundle | `clothBundleOld` | Connected |
| Cellar | Fresh earth mound | `freshEarthMound` | Connected |

## Completed production batch

| Priority | Asset | Runtime replacement target | Status |
| --- | --- | --- | --- |
| P0 | Faceless brother/sister turnaround | Character identity source for rig rebuild | Approved, generated, QA-passed, and connected |
| P0 | Well rope drum | Procedural `winchCoil` body while retaining dynamic rope-width state | Connected; dynamic rotation and fallback preserved |
| P0 | Well crank handle | Procedural cartoon crank sprite; rotation remains dynamic | Connected; dynamic rotation and fallback preserved |
| P0 | Burned-shed loose timber and tools | Procedural large door boards, beam, rake, and coal overlap | Connected |
| P0 | Burned-shed thatch mat | Procedural loose thatch pile | Connected; forage state preserved |
| P0 | Woven reed mat | Procedural bright cross-hatched mat in shed forage state | Connected; forage state preserved |
| P0 | Charred door plank | Procedural movable shed door leaf | Connected; movable state preserved |
| P0 | Cold stove rework | Rejected duplicate stove candidate and procedural `stoveHome` | Connected |
| P0 | Cellar opening ladder | Procedural ladder, with climb and hatch state preserved | Connected; climb and hatch state preserved |
| P0 | Cellar storage cluster | Procedural shelf, sacks, jar, and loose tools | Connected |
| P1 | Near-bare gray-brown elm | Pink-budded `elmSparse` | Connected |
| P1 | Feed trough and seed sack | Procedural shed forage clutter | Connected; forage state preserved |
| P1 | Ash-ground and cracked-earth strip | Smooth procedural surface bands | Connected behind gameplay actors |
| P1 | Distant village and watchtower silhouette | Flat procedural horizon | Connected behind gameplay actors |

## Completed ImageGen queue

| Order | Runtime family | Planned asset | Status |
| --- | --- | --- | --- |
| 01 | `qishuHouse` | `Texture_VillageHouseFacadeQishu.png` | Connected |
| 02 | `houseB` | `Texture_VillageHouseFacadeB.png` | Connected |
| 03 | `houseC` | `Texture_VillageHouseFacadeC.png` | Connected; destroyed-state fallback preserved |
| 04 | `houseD` | `Texture_VillageHouseFacadeD.png` | Connected |
| 05 | `hayA` / `hayB` | `Texture_HaystackFull.png` | Connected |
| 06 | `hayC` / `hayD` / `hayE` | `Texture_HaystackRaided.png` | Connected; raided state preserved |
| 07 | `yardWall` | `Texture_YardWallIntact.png` | Connected |
| 08 | `yardGate` | `Texture_YardWallGate.png` | Connected; gate state preserved |
| 09 | `brokenWall` | `Texture_YardWallBroken.png` | Connected |
| 10 | `oldDoors` | `Texture_OldWoodDoors.png` | Connected |
| 11 | `wallNotice` | `Texture_NoticeWall.png` | Connected; poster/scar overlays preserved |
| 12 | `pigpen` | `Texture_PigpenEmpty.png` | Connected |
| 13 | `stalkFence` | `Texture_StalkFence.png` | Connected |
| 14 | `crops` | `Texture_CropRowsSparse.png` | Connected |
| 15 | `stubbleField` | `Texture_StubbleField.png` | Connected |
| 16 | `sownField` | `Texture_SownField.png` | Connected |
| 17 | `woodpile` | `Texture_Woodpile.png` | Connected |
| 18 | `firewood` | `Texture_FirewoodBundle.png` | Connected |
| 19 | approved character turnaround | 14 faceless ImageGen rig components | Connected; each bone falls back independently on load failure |

## Faceless character rig production

All 14 isolated faceless ImageGen components below are generated, QA-passed, and connected. Each bone is upgraded independently after load; a failed piece leaves only that procedural bone visible. Rejected intermediate generations are intentionally not project assets.

| Character | Production file | Status |
| --- | --- | --- |
| Brother head | `Texture_BrotherHeadSide.png` | Connected |
| Brother torso | `Texture_BrotherTorsoSide.png` | Connected |
| Brother upper arm | `Texture_BrotherUpperArmSide.png` | Connected |
| Brother forearm/hand | `Texture_BrotherForearmHandSide.png` | Connected |
| Brother thigh | `Texture_BrotherThighSide.png` | Connected |
| Brother shin | `Texture_BrotherShinSide.png` | Connected |
| Brother foot | `Texture_BrotherFootSide.png` | Connected |
| Sister head | `Texture_SisterHeadSide.png` | Connected |
| Sister torso | `Texture_SisterTorsoSide.png` | Connected |
| Sister upper arm | `Texture_SisterUpperArmSide.png` | Connected |
| Sister forearm/hand | `Texture_SisterForearmHandSide.png` | Connected |
| Sister thigh | `Texture_SisterThighSide.png` | Connected |
| Sister shin | `Texture_SisterShinSide.png` | Connected |
| Sister foot | `Texture_SisterFootSide.png` | Connected |

Insert-card and over-shoulder art require separate framing tests; scene assets alone do not validate those cameras.

## Rejected or retired

- Do not register `Texture_CellarOpeningLadder.png` already present in `Texture/Generated/SceneOne`; it is a retired candidate.
- Do not register any `*_RejectedV1.png` file.
- Do not use the duplicate `Texture/Generated/Shared/Texture_ElmSparse.png`; the current runtime path is `SharedSurface`.
- The user approved the faceless turnaround on 2026-08-14; only the 14 listed ImageGen rig pieces are accepted for runtime use.
