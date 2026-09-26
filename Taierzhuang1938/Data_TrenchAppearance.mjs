// Common bare-earth trench finish, matched to Notion 游戏概念参考图 / 07 (2026-09-26).
// These are surface details, not a second excavation or collision surface.
export const TRENCH_APPEARANCE = Object.freeze({
  sectorM: 48,
  stationStride: 1,
  clodChance: 0.82,
  clodRadiusM: [0.08, 0.26],
  clodReliefM: [0.035, 0.095],
  lipRadiusM: [0.18, 0.36],
  lipReliefM: [0.07, 0.16],
  lipClods: 2,
  bankStart: 0.28,
  bankEnd: 1.05,
  rootChance: 0.55,
  rootStrands: 9,
  rootLengthM: [0.4, 0.95],
  rootRadiusM: 0.008,
  rootColor: 0x786751,
  rootRoughness: 0.97,
  minRiseM: 0.4,
  endClearM: 3,
});
