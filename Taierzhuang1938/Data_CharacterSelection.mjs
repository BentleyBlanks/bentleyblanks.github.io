// Scene and animation slot IDs remain stable; each visible mesh is the current cast appearance.
export const CHARACTER_APPEARANCE_BY_RIG = Object.freeze({
  TengxianNra02: "HeYoutian", TengxianNra05: "SquadLeaderLuo", TengxianNra06: "Interpreter",
  TengxianIja01: "JapaneseSoldierYi", TengxianIja02: "JapaneseSoldierA",
  TengxianIja03: "JapaneseSoldierC", TengxianIja06: "JapaneseSoldierJia",
});

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

// Preserve the established appearance distribution across existing encounters.
const nraRandom = Object.freeze([1, 4, 4, 4]);
export const CHARACTER_RANDOM_VARIANTS_BY_KIND = Object.freeze({
  nra: nraRandom, nraDare: nraRandom, ija: Object.freeze([5, 5, 5, 0, 0, 1, 2]),
});

// The distant IJA crowd uses the same Yi appearance as near actors in slot zero.
export const CHARACTER_CROWD_VARIANT_BY_KIND = Object.freeze({ ija: 0 });

