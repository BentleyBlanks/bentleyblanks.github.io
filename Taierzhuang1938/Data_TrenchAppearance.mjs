// Compact hand-cut earth: Notion historical photographs 01 and 14 (2026-10-07).
// Physical cross-section, read by the shared excavation sampler. Routes stay unchanged.
export const TRENCH_EARTH_PROFILE = Object.freeze({
  bankToe: .08,
  bankShoulder: .90,
  bankCutFromDepthM: 1.4,
  bermHeightScale: 2.8,
  bermWidthScale: 1.5,
  bermPeak: .32,
  bermLobeM: 2.8,
  bermWidthJitter: .28,
  junctionFeatherM: .4,
});

// Fine surface details, not a second excavation or collision surface.
export const TRENCH_APPEARANCE = Object.freeze({
  sectorM: 48,
  stationStride: 1,
  crustReliefM: .045,
  cutShoulderM: .12,
  spadeReliefM: .018,
  spadeWidthM: .24,
  clodChance: 0.35,
  clodRadiusM: [0.04, 0.11],
  clodReliefM: [0.025, 0.065],
  bankClods: 3,
  crumbs: 3,
  lipRadiusM: [0.18, 0.38],
  lipReliefM: [0.045, 0.09],
  lipClods: 2,
  bankStart: 0.28,
  bankEnd: 1.05,
  rootChance: 0.22,
  rootStrands: 3,
  rootLengthM: [0.16, 0.42],
  rootRadiusM: 0.004,
  rootColor: 0x786751,
  rootRoughness: 0.97,
  minRiseM: 0.4,
  endClearM: 3,
});
