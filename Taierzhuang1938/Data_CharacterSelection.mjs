// User-approved appearances, 2026-09-11. Indices are zero-based source numbers.
// Retain source assets for animation provenance; only these appearances may spawn.
// 2026-09-24: the user approved IJA06 (index 5), the standard IJA rifleman built from
// IJA02 in Blender (_import/Script_BuildLugouIja06.py): gaunt face, moustache, stubble,
// Type 98 field cap. It is the main anonymous IJA look and 日兵甲's pinned face.
const nra = Object.freeze([1, 4]);
const ija = Object.freeze([0, 1, 2, 5]);
export const CHARACTER_MODEL_VARIANTS_BY_KIND = Object.freeze({
  nra, nraDare: nra, nraOfficer: Object.freeze([4]),
  ija, ijaOfficer: Object.freeze([0]),
});
export const CHARACTER_PROTAGONIST_VARIANT = 1;
export const CHARACTER_INFANTRY_SOURCE_BY_MODEL = Object.freeze({ LugouNra05: "LugouNra02", LugouIja06: "LugouIja02" });
// Models that share another model's skeleton node for node (same bones, rest pose and
// bind): every per-model clip library (opening storyboards, captives, locomotion
// profiles) is looked up under the source id (CharacterRig.clipModelId).
export const CHARACTER_CLIP_SOURCE_BY_MODEL = Object.freeze({ LugouIja06: "LugouIja02" });

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
