// Data_Tuning_ClothBlood.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { CLOTH_BLOOD_CONTROLS } from "./Data_Tuning_ClothBlood.mjs";

export function ClampClothBloodParameter(key,value) {
  const entry=CLOTH_BLOOD_CONTROLS.find(control=>control.key===key);
  return entry && Number.isFinite(value) ? Math.max(entry.min,Math.min(entry.max,value)) : null;
}
