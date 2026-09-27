export const BREAKABLE_TREES = Object.freeze({
  seed: 19380317, heightM: 7.2, breakHeightM: 0.9, trunkRadiusM: 0.32,
  minSpacingM: 10, routeClearanceM: 8.5, blockClearanceM: 5,
  scaleMin: 0.78, scaleMax: 1.12, health: 38, sectorM: 48,
  massKg: 180, impulseSpeed: 2.2, spinSpeed: 1.1, settleAfterS: 12,
  regions: [
    { id: "Front", bounds: [-68, 108, -211, -92], count: 20 },
    { id: "Village", bounds: [-100, 108, -90, 64], count: 24 },
    { id: "Transfer", bounds: [-112, 115, 66, 137], count: 20 },
    { id: "Rear", bounds: [-128, 108, 176, 260], count: 20 },
  ],
});
