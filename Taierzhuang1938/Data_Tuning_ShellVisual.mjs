// Shared flight presentation. 2026-09-12: the requested realistic shell replaces
// the long incandescent tracer with an unlit-by-itself body and brief motion smear.
// These are presentation limits, not changes to ammunition, speed or collision.
export const SHELL_VISUAL = Object.freeze({
  trailSpanS: 0.028,
  trailSpanM: 1.6,
  fadeS: 0.045,
  bodyRadiusM: 0.042,
  bodyHalfLengthM: 0.18,
  bodyColor: 0x55584b,
  bodyMetalness: 0.65,
  bodyRoughness: 0.48,
  trailHeadHalfWidthM: 0.035,
  trailTailHalfWidthM: 0.012,
  trailOpacity: 0.2,
  trailColor: 0x72756d,
});
