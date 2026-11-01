// Data_StrawSleepingMat.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { STRAW_SLEEPING_MAT_CENTRE_SHIFT_M } from "./Data_StrawSleepingMat.mjs";

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
