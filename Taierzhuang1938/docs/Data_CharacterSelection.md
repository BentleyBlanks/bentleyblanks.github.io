# Approved character appearances

User selection, 2026-09-11: NRA02 and NRA05 only; IJA01, IJA02 and IJA03 only.
User approval, 2026-09-24: IJA06 (source index 5) joins the IJA list as the standard rifleman,
and NRA06 (source index 5) is approved as the interpreter's cast-only look.
Luo uses NRA05. Young companions, train recruits and the cutscene protagonist use NRA02.
NRA officers use NRA05; IJA officers use IJA01. Gameplay and the actor editor share
`Data_CharacterSelection.mjs`; explicit rejected variants also resolve within this allowlist.

## IJA06 standard rifleman (2026-09-24)

The user asked for a typical, stereotyped Japanese soldier built on the existing IJA model,
after the front man of his reference photo, for the opening's dragging and cursing
soldier (日兵甲 `ijaA`), and to use it as the standard IJA soldier from then on.
`_import/Script_BuildLugouIja06.py` builds `Model_LugouIja06.glb` from IJA02 in Blender
(BlenderMCP; source project `Blender/Taierzhuang1938/Characters_20260924/Scene_LugouIja06.blend`):

- head reshaped without changing topology: longer chin, narrower jaw, hollow cheeks under
  high cheekbones, lower brow ridge, narrower eyes, nasolabial crease;
- face texture painted from each texel's head position: sallow skin, thin line moustache,
  stubble on lip, chin and jaw, darker eye sockets and folds;
- the Type 90 helmet and havelock replaced by a Type 98 cloth field cap with a short visor
  and a front star (574 triangles, in the helmet's atlas texels; the whole model is
  14,643 triangles, 60 fewer than IJA02).

Review pass (2026-09-24): in the engine the first build read as a dark, full-bearded Western
face under a tall straight cap. The rebuild lightens the skin (less sallow, lighter sockets
and folds), thins the stubble to sparse dots so the moustache is the one dark line, presses
the nose bridge back 3.8 mm (tip 1.4 mm), and reshapes the cap: the crown narrows towards
the top, peaks at the front seam and drops 1.1 cm at the sides and 2.6 cm at the back.
The back cannot come lower (skull top), so the front seam rises to 23.4 cm head height; the
narrowing is capped by the 1.5 mm skull clearance. Still open for the user: the IJA02 base
skull and nose stay long, so the face reads gaunt rather than flat.

Skeleton, uniform and equipment are IJA02's, so IJA06 plays IJA02's clip libraries
(`CHARACTER_CLIP_SOURCE_BY_MODEL`, `CharacterRig.clipModelId`). Anonymous IJA sampling
is `[5, 5, 5, 0, 0, 1, 2]`: IJA06 is the most frequent face and the other approved
faces stay mixed in (mean anonymous IJA 12,719 -> 13,774 triangles). The distant crowd
layer does not follow the pool: `CHARACTER_CROWD_VARIANT_BY_KIND` pins its ija bake to
IJA01 (the skin it baked before, lightest per instance). IJA06 is normalised by IJA02's
height (manifest `scaleHeight`): its cap is lower than the helmet, and normalising by its
own bounds made the body 1.56 % larger than IJA02 on the same clips. 日兵甲 is pinned to IJA06 with its facial skin
(`Model_LugouIja06Facial.glb`, [speaker faces](Data_CharacterSpeech.md)); IJA officers
remain IJA01.

## NRA06 interpreter (2026-09-24)

The user asked for the interpreter's look after his second reference (the classic film
collaborator interpreter): round fat face, small round wire spectacles, one protruding
upper front tooth, raised anxious brows, a soft cap with a star, an open dark Chinese
jacket over a white vest. `_import/Script_BuildLugouNra06.py` builds `Model_LugouNra06.glb`
from NRA02 in Blender (BlenderMCP; source project
`Blender/Taierzhuang1938/Characters_20260924/Scene_LugouNra06.blend`):

- head reshaped without changing topology: puffed cheeks, wider jowls, a soft double
  chin, brows lifted more at the inner ends; heavier brows painted on the face texture;
- clothes re-dyed on the uniform atlas: dark jacket and trousers, near-black cap, collar
  tabs, pips, brass buttons, name tag and cuffs gone, and a white vest painted down the
  open jacket front (its normal map flattened there); the material is renamed
  `Material_InterpreterGarb`, so neither the NRA uniform tint nor the opening's old
  dark-cloth dye (both keyed on the uniform material name) touch it;
- the cross strap, belt and hip tool primitives removed; the cap badge repainted as a pale
  five-point star; round wire spectacles (874 triangles) added to the badge primitive,
  rigid on the head bone;
- the buck tooth is facial geometry (see [speaker faces](Data_CharacterSpeech.md)).

The whole model is 10,321 triangles (NRA02: 9,917). The jacket material is matte cotton
(no gloss map, roughness 0.92, specular 0.25; review 2026-09-24: the uniform's gloss read as
leather). It is not a soldier look: `CHARACTER_CAST_VARIANTS_BY_KIND` (nra: {5:
['interpreter']}) lets only the interpreter's castId wear it (`IsApprovedCharacterVariant`);
anonymous pools, the kind lists, other named roles and the actor editor never get it.
It is not a boot download either: its manifest record is `loadOnDemand`, and
`Script_Main` fetches the first level's cast looks (`LoadLugouCastModels` over
`FIRST_LEVEL_SPEAKING_CAST`) before the actor shader warm-up, which also places each
loaded cast-only look (facial and base skin) so the interpreter's first appearance
compiles nothing (`Script_RespawnShaderWarmTest` cast sweep). Skeleton and clips are NRA02's
(`CHARACTER_CLIP_SOURCE_BY_MODEL`, `CHARACTER_INFANTRY_SOURCE_BY_MODEL`).

Source GLBs and canonical animation references remain available for provenance.
The NRA01 beard is present in the supplied NRA MAX source (`VITOH_d.mipmap.jpg`),
which the source IJA01 also uses; it was not introduced by a game face swap.
Private source-comparison renders are outside the repository in the Blender
`Taierzhuang1938/CharacterSourceAudit_20260911` directory.

NRA05 now borrows the existing NRA02 infantry animation library with target local
rest offsets and rotations applied, retaining NRA05's visible mesh and skeleton.
No new motion or image generation is involved. First-person arm-only assets have no
head and keep their existing separate grip/weapon contract.

Anonymous population sampling favors the lighter approved NRA05 and IJA01 skins
to preserve the existing render budget. The eligible model list and population
size do not change; fixed cast choices take precedence over these weights.

Validation: 69 quick checks; actor pose/approved selection and NRA05 track bindings;
infantry animation, motion-vector and real carriage-prop GPU checks; all seven boot
slices; production-bundle whitebox, menu and partial-download fixtures. Local
opening capture confirms Luo=NRA05, 40 recruits=NRA02 and all 39 configured seated
passengers have their train animation bound. Final boot peak: 7.344M triangles,
within the unchanged 8.1M limit. Screenshots and logs remain local.
