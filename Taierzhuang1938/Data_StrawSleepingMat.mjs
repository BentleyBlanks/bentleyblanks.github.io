// User-approved KnotDetail4 meshes; metres, +Y up, long axis +X, bottom-centre pivot.
// Dimensions, wear, ties and carrying loop are reconstruction, not an issue specification.
export const STRAW_SLEEPING_MAT_ASSETS = Object.freeze({
  strawSleepingMatFlat: Object.freeze({
    label: "随身草席 · 铺开", url: "../Model/StrawSleepingMat/Model_StrawSleepingMatFlat.glb?v=KnotDetail4",
    tag: "prop", solid: false, category: "院落小件", projectUvs: false,
    sourceLabel: "用户确认复原 · Imagegen PBR", triangles: 1992,
    bounds: Object.freeze([1.8235016, 0.0319242, 0.9237672]),
  }),
  strawSleepingMatRolled: Object.freeze({
    label: "随身草席 · 卷起", url: "../Model/StrawSleepingMat/Model_StrawSleepingMatRolled.glb?v=KnotDetail4",
    tag: "prop", solid: false, category: "院落小件", projectUvs: false,
    sourceLabel: "用户确认复原 · Imagegen PBR", triangles: 1192,
    bounds: Object.freeze([0.918, 0.2310235, 0.1492157]),
  }),
});

export const STRAW_SLEEPING_MAT_SHEET_M = 0.005;
export const STRAW_SLEEPING_MAT_CENTRE_SHIFT_M = 0.15;

