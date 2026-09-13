// Animation-only limits, in metres/seconds. AI/collision retain movement authority.
export const ACTOR_LOCOMOTION = Object.freeze({
  normalizedMps: 3.6,
  movingMps: .035,
  teleportM: 2,
  maximumMps: 10,
  maximumGapS: .4,
  contactBlendS: .035,
  maximumCorrectionM: .28,
  minimumReachM: .001,
});
