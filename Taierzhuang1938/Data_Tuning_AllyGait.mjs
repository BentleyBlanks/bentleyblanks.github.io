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
});
