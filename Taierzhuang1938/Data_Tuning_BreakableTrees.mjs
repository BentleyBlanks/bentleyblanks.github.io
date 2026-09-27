export const BREAKABLE_TREES = Object.freeze({
  seed: 19380317, heightM: 7.2, breakHeightM: 0.9, trunkRadiusM: 0.32,
  minSpacingM: 10, routeClearanceM: 8.5, blockClearanceM: 5,
  scaleMin: 0.78, scaleMax: 1.12, health: 38, sectorM: 48,
  massKg: 180, impulseSpeed: 2.2, spinSpeed: 1.1, settleAfterS: 12,
  // Falling crown collision (2026-09-27): convex pieces of the real bark, and a debris-only
  // heightfield of the ground under it (cell and margin in metres). One capsule on the axis
  // plus analytic support points left 102 of 130 fallen trunks more than 0.3 m above the ground.
  hullPieces: 14, groundCellM: 0.6, groundMarginM: 2,
  // Distance detail (2026-09-27). Every tree at full 12,251 triangles put 64 trees into both the
  // prepass and the main pass on the 03 right-nest captures: +1.57 M of a frame capped at 8.10 M
  // (SCENE_RENDER_LIMITS). Past `distanceM` a level uses vertex-clustered copies of the same bark
  // (Script_DistantGeometry, cell size in model metres); `hysteresisM` stops boundary flicker.
  // Cells measured on the previous 12K GLB: 0.12 m -> 1,808 crown + 621 stump; 0.18 m -> 876 + 311;
  // 0.3 m -> ~350 + ~110. 0.25 m visibly dropped the fine upper branches at 75 m in a side-by-side
  // capture, so the coarsest cell waits until a 7 m tree is about 40 px tall (130 m at 1440x900).
  lod: [
    { distanceM: 0, cellM: 0 },
    { distanceM: 30, cellM: 0.12 },
    { distanceM: 75, cellM: 0.18 },
    { distanceM: 130, cellM: 0.3 },
  ],
  hysteresisM: 3,
  regions: [
    { id: "Front", bounds: [-68, 108, -211, -92], count: 20 },
    { id: "Village", bounds: [-100, 108, -90, 64], count: 24 },
    { id: "Transfer", bounds: [-112, 115, 66, 137], count: 20 },
    { id: "Rear", bounds: [-128, 108, 176, 260], count: 20 },
  ],
});
