// Data_Tuning_FirstLevelFront.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

/** 07 南行的路线全长（m）。传 `MISSION_ROUTES.southWalk`（它与 `south` 是同一个数组）。 */
export function SouthWalkLengthM(route) {
  let total = 0;
  for (let i = 1; i < route.length; i++)
    total += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  return total;
}

/**
 * 07 在给定行军速度下的纯行走秒数（不含抵达村口后 VillagePointer 播完那一段）。
 * 时长闸的算式只有这一处，测试与文档共用。
 */
export function SouthWalkSeconds(speedMps, route) {
  return SouthWalkLengthM(route) / speedMps;
}
