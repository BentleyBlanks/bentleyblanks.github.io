// First-level riflemen: carry while travelling/talking, ready as soon as danger returns.
export const ALLY_GAIT = Object.freeze({
  movingMps: .08,
  walkMaximumMps: 1.9,
  suppressionReady: .28,
  readyHoldS: .8,
  // Gait selection by speed for crouched IJA riflemen (the shared skeleton plays the ally clip):
  // the mocap RifleCrouchAdvance is a 0.22 m/s creep, AllyCrouchReady a 0.75 m/s crouch walk.
  // Switch near their geometric mean with hysteresis; the stride warp covers either side.
  crouchFastAboveMps: .45,
  crouchSlowBelowMps: .36,
  version: '20260927AllyGaitV2Upright',
  // Calm, upright, fast: the rifle held across the chest at a run (Animation/RifleHoldRun, authored at 3.2 m/s). Over
  // holdRunAboveMps the RifleRun of an unthreatened NRA rifleman becomes RifleHoldRun; it goes back under holdRunBelowMps
  // (hysteresis), and a pace has to hold holdRunSwitchFrames updates before either switch (a corner or a re-root measures
  // a one- or two-frame speed spike). Threat, fire, crouching and every special pose keep the production RifleRun.
  holdRunAboveMps: 2.6,
  holdRunBelowMps: 2.3,
  holdRunSwitchFrames: 6,
  holdRunVersion: '20261021RifleHoldRunV2',
  // Marching at ease: the rifle on the right shoulder (Animation/RifleShoulderMarch, authored at 1.215 m/s). It replaces the
  // production RifleRun of an unthreatened NRA rifleman only while (1) the shared march layer (SquadMarchAi) is moving him
  // along a route at its ordinary pace -- its command is fresh (marchCommandFreshS) and its status is 'running', not waiting,
  // resting, queueing or catching up --, (2) he is not in a speaker gesture, (3) nobody stands in the lane behind him within
  // marchRearClearM (the muzzle rides behind his shoulder: missionRearGapM, kept by the mission), and (4) his pace is inside
  // marchAboveMps..walkMaximumMps with the hysteresis marchBelowMps and marchSwitchFrames updates to hold. Escorting, talking,
  // waiting, every special pose and the ready carry (AllyCarryWalk / AllyCarryStand, muzzle up) keep what they had.
  marchAboveMps: 1.05,
  marchBelowMps: .85,
  marchSwitchFrames: 24,
  marchHardMaxMps: 2.4,
  marchCommandFreshS: .35,
  marchRearClearM: 4,
  marchRearLaneM: 1.6,
  marchVersion: '20261021RifleShoulderMarchV1',
});
