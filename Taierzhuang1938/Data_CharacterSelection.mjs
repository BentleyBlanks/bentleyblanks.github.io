// User-approved appearances, 2026-09-11. Indices are zero-based source numbers.
// Retain source assets for animation provenance; only these appearances may spawn.
// 2026-09-24: the user approved IJA06 (index 5), the standard IJA rifleman built from
// IJA02 in Blender (_import/Script_BuildLugouIja06.py): gaunt face, moustache, stubble,
// Type 98 field cap. It is the main anonymous IJA look and 日兵甲's pinned face.
// 2026-09-24: the user approved NRA06 (index 5), the interpreter built from NRA02 in
// Blender (_import/Script_BuildLugouNra06.py): round face, wire spectacles, buck tooth,
// star cap, open dark jacket over a white vest. It is not a soldier look: it only
// spawns for a pinned speaking role (CHARACTER_CAST_VARIANTS_BY_KIND), never in the
// kind lists, the anonymous pools or the actor editor's lineup.
const nra = Object.freeze([1, 4]);
const ija = Object.freeze([0, 1, 2, 5]);
export const CHARACTER_MODEL_VARIANTS_BY_KIND = Object.freeze({
  nra, nraDare: nra, nraOfficer: Object.freeze([4]),
  ija, ijaOfficer: Object.freeze([0]),
});
// Cast-only appearances: kind -> modelVariant -> the castIds that may wear it. Anonymous
// spawns, explicit numbers without a castId and every other named role stay in the lists
// above (a stray castId must not borrow the interpreter's face).
export const CHARACTER_CAST_VARIANTS_BY_KIND = Object.freeze({
  nra: Object.freeze({ 5: Object.freeze(["interpreter"]) }),
});
export const CHARACTER_PROTAGONIST_VARIANT = 1;
export const CHARACTER_INFANTRY_SOURCE_BY_MODEL = Object.freeze({
  TengxianNra05: "TengxianNra02", TengxianNra06: "TengxianNra02", TengxianIja06: "TengxianIja02",
});
// Models that share another model's skeleton node for node (same bones, rest pose and
// bind): every per-model clip library (opening storyboards, captives, locomotion
// profiles) is looked up under the source id (CharacterRig.clipModelId).
export const CHARACTER_CLIP_SOURCE_BY_MODEL = Object.freeze({ TengxianNra06: "TengxianNra02", TengxianIja06: "TengxianIja02" });

// Anonymous spawns. NRA favours its lighter skin (NRA05: 8,683 triangles). IJA: the user
// made IJA06 the standard rifleman (2026-09-24), so it is the most frequent anonymous IJA
// (3 of 7), mixed with IJA01/02/03 so a crowd never shares one face. Triangles: IJA01
// 11,106, IJA02 14,703, IJA03 15,573, IJA06 14,643; the mean anonymous IJA goes from
// 12,719 to 13,774 (+8.3 %).

const nraRandom = Object.freeze([1, 4, 4, 4]);
export const CHARACTER_RANDOM_VARIANTS_BY_KIND = Object.freeze({
  nra: nraRandom, nraDare: nraRandom, ija: Object.freeze([5, 5, 5, 0, 0, 1, 2]),
});

// The distant crowd layer (Script_ActorCrowd) bakes one skin per kind. IJA keeps IJA01,
// the skin it baked before the IJA06 pool change: the lightest IJA (11,106 triangles
// against IJA06's 14,643, per instance) and a helmet silhouette at range. Kinds not
// listed bake the seed-picked skin as before.
export const CHARACTER_CROWD_VARIANT_BY_KIND = Object.freeze({ ija: 0 });

/** Id under which a model's per-model clip libraries are stored. */
export function CharacterClipModelId(modelId) {
  return CHARACTER_CLIP_SOURCE_BY_MODEL[modelId] || modelId;
}

/** Whether an explicit modelVariant may spawn for this kind (a castId unlocks cast-only looks). */
export function IsApprovedCharacterVariant(kind, modelVariant, castId = null) {
  if (CHARACTER_MODEL_VARIANTS_BY_KIND[kind]?.includes(modelVariant)) return true;
  const casts = CHARACTER_CAST_VARIANTS_BY_KIND[kind];
  return !!castId && !!casts && Object.hasOwn(casts, modelVariant) && casts[modelVariant].includes(castId);
}
