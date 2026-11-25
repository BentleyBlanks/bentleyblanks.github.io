export const TYPE94_TANKETTE_ASSET = Object.freeze({
  id: "Type94Tankette",
  catalogId: "type94Tankette",
  label: "九四式轻装甲车",
  url: "./Model/Type94Tankette/Model_Type94Tankette.glb?v=20261030CurrentWearV106-43969e24",
});

// Optional reference vehicles load only when selected in the asset library.
// Source axes are verified against the exported vertex cloud by ModelFacingTest.
export const OPTIONAL_VEHICLE_ASSETS = Object.freeze([
  Object.freeze({
    id: "Type89MediumTank",
    catalogId: "type89MediumTank",
    name: "八九式中战车乙型",
    label: "八九式中战车乙型 · 可动参考复原",
    url: "./Model/Type89MediumTank/Model_Type89MediumTank.glb?v=20261030GeometryV54SurfaceV14",
    trackPathUrl: "./Model/Type89MediumTank/Data_TrackPath.json?v=20261030GeometryV54SurfaceV14",
    sourceNose: Object.freeze({ x: 0, z: -1 }),
    scale: 1,
    campaignEnabled: false,
  }),
]);
