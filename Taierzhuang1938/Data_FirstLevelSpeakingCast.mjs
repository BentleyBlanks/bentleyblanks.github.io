// Pinned appearance for every role that speaks on screen in first-level 01-06.
// A speaker keeps one face for the whole level (03-05 Zhou used to roll NRA02 or
// NRA05 at random and turn into NRA02 at 06) and gets the facial skin of that
// model (Model_Lugou*Facial.glb, manifest facialCast). Only approved appearances
// (Data_CharacterSelection.mjs): NRA02 = source index 1, NRA05 = 4, IJA01 = 0,
// IJA02 = 1, IJA06 = 5; NRA06 = 5 is the interpreter's cast-only look.
// Contract 2026-09-23 section 5.1: 日兵乙 moves from IJA03 (closed-mouth geometry) to IJA01; 日兵丙/丁 are one IJA01 and one IJA02. User 2026-09-24: 日兵甲 (the
// interrogator who drags, curses and cuts the throat) wears the new standard IJA06, and
// the interpreter wears NRA06 (round face, spectacles, buck tooth, star cap, open dark
// jacket over a white vest; its cloth material is not the uniform's, so neither the NRA
// tint nor the opening's old dark-cloth dye applies to it).
// Keys are the dialogue `who` ids (Data_FirstLevelMissionDialogue.MISSION_VOICE_CAST);
// captiveHelper/captiveWounded remain until the 09.23 opening replaces them with comrade.
// Not here: 06 ZhouLift's bearer is a MissionPeople layout figure (no soldier body, no face).
const Nra02 = Object.freeze({ actorKind: "nra", modelVariant: 1 });
const Nra05 = Object.freeze({ actorKind: "nra", modelVariant: 4 });
const Nra06 = Object.freeze({ actorKind: "nra", modelVariant: 5 });
const Ija01 = Object.freeze({ actorKind: "ija", modelVariant: 0 });
const Ija02 = Object.freeze({ actorKind: "ija", modelVariant: 1 });
const Ija06 = Object.freeze({ actorKind: "ija", modelVariant: 5 });

export const FIRST_LEVEL_SPEAKING_CAST = Object.freeze({
  luo: Nra05,
  yaowa: Nra02, heyoutian: Nra02, liuwencai: Nra02,
  comrade: Nra02, runner: Nra02, guard: Nra02, shouter: Nra02,
  interpreter: Nra06,
  zhou: Nra02, relief: Nra02, keeper: Nra02,
  captiveHelper: Nra02, captiveWounded: Nra02,
  ijaA: Ija06, ijaB: Ija01, ijaC: Ija01, ijaD: Ija02,
  frontOfficer: Ija01,
});

/** Spawn options for a speaking role: its castId and pinned model (unknown roles: {}). */
export function SpeakingCastOptions(castId) {
  const spec = Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, castId) ? FIRST_LEVEL_SPEAKING_CAST[castId] : null;
  return spec ? { castId, modelVariant: spec.modelVariant } : {};
}

// Internal mission steps (Data_FirstLevelMissionStages phases 01-06) in which the speaker
// binder moves faces and heads for every speaking role and dialogue plays from the
// speaker's mouth. Later steps keep their own voice placement (08's street guard, the
// bridge runner...) untouched.
export const FIRST_LEVEL_FACE_STEPS = Object.freeze(["Trapped", "BunkerRescue", "RearTrench", "Support", "MachineGun", "Tank", "Orders"]);
// After 06 only the named squad keeps a talking mouth (mouth only: no head turn, no gaze,
// no voice position). Before this package Luo's face already followed his lines all level.
export const FIRST_LEVEL_WHOLE_LEVEL_SPEAKERS = Object.freeze(["luo", "yaowa", "heyoutian", "liuwencai"]);
// The withdrawing front guards (FRONT_GUARD_POSTS): one of them carries the guard face;
// the others stay anonymous pooled bodies with random appearance. Index 2 is the first
// man of the second batch, who holds the last covered line at 04 next to the player's
// position and so is the one who points to the ammo house (BundleOrder).
export const FACED_FRONT_GUARD_INDEX = 2;
