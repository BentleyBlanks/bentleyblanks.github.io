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

// Relaxed gait (Script_RelaxedGait.mjs): men walking with the rifle slung on the back, or with no
// weapon at all (the 01 interpreter). RelaxedWalk is authored at 1.35 m/s, BackRifleRun at 2.6 m/s;
// between runAboveMps and walkBelowMps the current gait holds, so a pace near the switch does not
// flicker between the two cycles. Measured against the director's paces (Data_OpeningStoryboards.speed):
// stroll 1.1 / walk 1.5 / amble 1.65 walk, hurry 2.0 / brisk 2.3 / trot 2.4 / run 3.2 run.
export const RELAXED_GAIT = Object.freeze({
  runAboveMps: 1.9,
  walkBelowMps: 1.75,
  // Consecutive frames a pace must stay across the switch before the gait changes (a corner or a
  // re-root measures a one- or two-frame spike: 09-26 probe, 1.65 m/s walkers flashed the run).
  switchFrames: 6,
});
