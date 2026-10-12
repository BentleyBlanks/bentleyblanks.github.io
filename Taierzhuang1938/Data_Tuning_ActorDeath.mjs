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
  // Settling (poseEnd..1) skins every drawn vertex to find the floor. Between the support search (first settling call) and the
  // final pose (t = 1), both always skinned afresh, a corpse re-skins only every settleRescanCalls-th call and otherwise
  // reuses its last skinned points under this call's tilt: the last 15% of a fall moves a lowest vertex by millimetres a
  // frame. 2026-10-12 (R3-Perf): five men dying in the same second of the 02 charge each re-skinned ~6k vertices a frame
  // (ai/corpse 25-30 ms frames after the per-vertex dedupe, 40-80 ms before it).
  settleRescanCalls: 3,
});
