// Data_Tuning_Gtao.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { GTAO_TIERS } from "./Data_Tuning_Gtao.mjs";

/** 档位名 → 一档 GTAO。`Data_Tuning_Graphics` 里 `gtao` 那一位存的就是这个键。 */
export function MakeGtaoTier(name) {
  return { ...(GTAO_TIERS[name] || GTAO_TIERS.high) };
}
