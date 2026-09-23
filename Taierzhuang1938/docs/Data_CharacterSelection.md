# Approved character appearances

User selection, 2026-09-11: NRA02 and NRA05 only; IJA01, IJA02 and IJA03 only.
User approval, 2026-09-24: IJA06 (source index 5) joins the IJA list as the standard rifleman.
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

Skeleton, uniform and equipment are IJA02's, so IJA06 plays IJA02's clip libraries
(`CHARACTER_CLIP_SOURCE_BY_MODEL`, `CharacterRig.clipModelId`). Anonymous IJA sampling
is `[5, 5, 5, 0, 0, 1, 2]`: IJA06 is the most frequent face and the other approved
faces stay mixed in. 日兵甲 is pinned to IJA06 with its facial skin
(`Model_LugouIja06Facial.glb`, [speaker faces](Data_CharacterSpeech.md)); IJA officers
remain IJA01.

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
