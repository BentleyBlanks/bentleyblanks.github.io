// Pinned appearance for every role that speaks on screen in first-level 01-06.
// A speaker keeps one face for the whole level (03-05 Zhou used to roll NRA02 or
// NRA05 at random and turn into NRA02 at 06) and gets the facial skin of that
// model (Model_Lugou*Facial.glb, manifest facialCast). Only approved appearances
// (Data_CharacterSelection.mjs): NRA02 = source index 1, NRA05 = 4, IJA01 = 0,
// IJA02 = 1. Contract 2026-09-23 section 5.1: 日兵乙 moves from IJA03 (closed-mouth
// geometry) to IJA01; 日兵丙/丁 are one IJA01 and one IJA02.
// Keys are the dialogue `who` ids (Data_FirstLevelMissionDialogue.MISSION_VOICE_CAST);
// captiveHelper/captiveWounded remain until the 09.23 opening replaces them with comrade.
const Nra02 = Object.freeze({ actorKind: "nra", modelVariant: 1 });
const Nra05 = Object.freeze({ actorKind: "nra", modelVariant: 4 });
const Ija01 = Object.freeze({ actorKind: "ija", modelVariant: 0 });
const Ija02 = Object.freeze({ actorKind: "ija", modelVariant: 1 });

export const FIRST_LEVEL_SPEAKING_CAST = Object.freeze({
  luo: Nra05,
  yaowa: Nra02, heyoutian: Nra02, liuwencai: Nra02,
  comrade: Nra02, runner: Nra02, guard: Nra02, shouter: Nra02,
  // The interpreter wears the NRA02 body re-dyed as dark civilian cloth
  // (Script_OpeningStoryboards); no approved civilian skin exists yet.
  interpreter: Nra02,
  zhou: Nra02, relief: Nra02, keeper: Nra02, bearer: Nra02,
  captiveHelper: Nra02, captiveWounded: Nra02,
  ijaA: Ija02, ijaB: Ija01, ijaC: Ija01, ijaD: Ija02,
  frontOfficer: Ija01,
});

/** Spawn options for a speaking role: its castId and pinned model (unknown roles: {}). */
export function SpeakingCastOptions(castId) {
  const spec = Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, castId) ? FIRST_LEVEL_SPEAKING_CAST[castId] : null;
  return spec ? { castId, modelVariant: spec.modelVariant } : {};
}
