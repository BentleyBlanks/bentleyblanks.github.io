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

/** Five patient mats and two rolls beside the existing packs; visual placements without colliders. */
export function PlanCollectionStrawSleepingMats(layout, placement, groundAt) {
  if (layout.id !== "FirstLevelMissionSeptember19") return [];
  const shift = STRAW_SLEEPING_MAT_CENTRE_SHIFT_M;
  const flat = placement.wounded.map((person, i) => {
    const x = person.x + Math.sin(person.yaw) * shift;
    const z = person.z + Math.cos(person.yaw) * shift;
    return { id: `CollectionStrawMat${i}`, asset: "strawSleepingMatFlat", x, z,
      y: groundAt(x, z), yaw: person.yaw - Math.PI / 2 };
  });
  // In the gaps beside the west-wall packs, clear of the spare litters and walking route.
  const rolled = [-102.35, -99.55].map((z, i) => ({
    id: `CollectionStrawRoll${i}`, asset: "strawSleepingMatRolled", x: -44.96, z,
    y: groundAt(-44.96, z), yaw: i * 0.08,
  }));
  return [...flat, ...rolled];
}
