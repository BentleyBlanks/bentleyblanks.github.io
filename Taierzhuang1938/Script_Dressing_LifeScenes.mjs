// Data_Dressing_LifeScenes.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { EMPTY, LIFE_SCENE_DRESSING } from "./Data_Dressing_LifeScenes.mjs";

export function LifeScenesFor(regionId) {
  return LIFE_SCENE_DRESSING[regionId] || EMPTY;
}
