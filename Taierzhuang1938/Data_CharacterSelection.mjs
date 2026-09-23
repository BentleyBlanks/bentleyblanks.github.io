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
// Appearances a named speaking role may request by modelVariant (with its castId);
// anonymous spawns and explicit numbers without a castId stay in the lists above.
export const CHARACTER_CAST_VARIANTS_BY_KIND = Object.freeze({ nra: Object.freeze([5]) });
export const CHARACTER_PROTAGONIST_VARIANT = 1;
export const CHARACTER_INFANTRY_SOURCE_BY_MODEL = Object.freeze({
  LugouNra05: "LugouNra02", LugouNra06: "LugouNra02", LugouIja06: "LugouIja02",
});
// Models that share another model's skeleton node for node (same bones, rest pose and
// bind): every per-model clip library (opening storyboards, captives, locomotion
// profiles) is looked up under the source id (CharacterRig.clipModelId).
export const CHARACTER_CLIP_SOURCE_BY_MODEL = Object.freeze({ LugouNra06: "LugouNra02", LugouIja06: "LugouIja02" });

// Favor the lighter approved skins in anonymous crowds; retain every soldier.
// NRA05: 8,683 triangles; IJA01: 11,106 (IJA02/IJA03/IJA06: 14,703/15,573/14,643).
// IJA06 is the most frequent anonymous IJA (3 of 7), mixed with the others so a
// crowd never shares one face.
const nraRandom = Object.freeze([1, 4, 4, 4]);
export const CHARACTER_RANDOM_VARIANTS_BY_KIND = Object.freeze({
  nra: nraRandom, nraDare: nraRandom, ija: Object.freeze([5, 5, 5, 0, 0, 1, 2]),
});

/** Id under which a model's per-model clip libraries are stored. */
export function CharacterClipModelId(modelId) {
  return CHARACTER_CLIP_SOURCE_BY_MODEL[modelId] || modelId;
}

/** Whether an explicit modelVariant may spawn for this kind (a castId unlocks cast-only looks). */
export function IsApprovedCharacterVariant(kind, modelVariant, castId = null) {
  if (CHARACTER_MODEL_VARIANTS_BY_KIND[kind]?.includes(modelVariant)) return true;
  return !!castId && !!CHARACTER_CAST_VARIANTS_BY_KIND[kind]?.includes(modelVariant);
}
