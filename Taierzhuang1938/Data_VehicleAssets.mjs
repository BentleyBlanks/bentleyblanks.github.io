// Optional reference vehicles load only when selected in the asset library.
// Source axes are verified against the exported vertex cloud by ModelFacingTest.
export const OPTIONAL_VEHICLE_ASSETS = Object.freeze([
  Object.freeze({
    id: "Type89MediumTank",
    catalogId: "type89MediumTank",
    label: "八九式中战车乙型 · 可动参考复原",
    url: "./Model/Type89MediumTank/Model_Type89MediumTank.glb?v=20261028GeometryV54SurfaceV12",
    trackPathUrl: "./Model/Type89MediumTank/Data_TrackPath.json?v=20261028GeometryV54SurfaceV12",
    sourceNose: Object.freeze({ x: 0, z: -1 }),
    scale: 1,
    campaignEnabled: false,
  }),
]);
