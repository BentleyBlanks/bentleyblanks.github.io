// Data_Tengxian.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { PRESUMED } from "./Data_Tengxian.mjs";

/** 按 id 查推定条目，给 UI 的「这是推定值」角标用。 */
export function FindPresumed(id) {
  return PRESUMED.find((p) => p.id === id) || null;
}
