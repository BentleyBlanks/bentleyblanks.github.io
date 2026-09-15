// Shared NRA/IJA contact fit in the corpse's terrain plane. Metres and radians.
// Ankle-roll values remain for the single-pose fallback; Kimodo clips author the feet.
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
