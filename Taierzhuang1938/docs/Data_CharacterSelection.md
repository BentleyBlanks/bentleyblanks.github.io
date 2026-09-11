# Approved character appearances

User selection, 2026-09-11: NRA02 and NRA05 only; IJA01, IJA02 and IJA03 only.
Luo uses NRA05. Young companions, train recruits and the cutscene protagonist use NRA02.
NRA officers use NRA05; IJA officers use IJA01. Gameplay and the actor editor share
`Data_CharacterSelection.mjs`; explicit rejected variants also resolve within this allowlist.

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
