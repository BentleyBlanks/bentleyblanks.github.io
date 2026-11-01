// Data_FirstLevelWhiteboxTerrain.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { CoreDistance, WHITEBOX_PATH_EDGE_M } from "./Data_FirstLevelWhiteboxTerrain.mjs";

/** 小路（连染色边）的外接框：这一框之外它对地表纹理的贡献严格为 0。 */
export function WhiteboxPathBounds(path) {
  const pad = path.width / 2 + WHITEBOX_PATH_EDGE_M;
  const xs = (path.points || []).map((p) => p.x), zs = (path.points || []).map((p) => p.z);
  return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad };
}

/** 到核心区边界的距离 d（核心内 ≤ 0，米）与该处的 dy。地表图层（SampleMissionGroundSurface）按它铺土壁/沟底。 */
export function WhiteboxShapeDistance(shape, x, z) { return CoreDistance(shape, x, z); }
