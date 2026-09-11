// Shared NRA/IJA contact fit in the corpse's terrain plane. Metres and radians.
// Relax the ankle before fitting: a standing toe angle otherwise props up a prone body.
export const DEATH_CONTACT = Object.freeze({
  clearanceM: .008,
  footOutward: .85,
  footAlongBody: .45,
  ankleStart: .4,
  poseEnd: .85,
  sampleCellM: .06,
  maxTiltRad: .55,
  angleStepsRad: Object.freeze([.24, .12, .06, .03, .015, .0075]),
});
