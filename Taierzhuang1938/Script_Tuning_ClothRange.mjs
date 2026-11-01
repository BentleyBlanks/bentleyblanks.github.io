// Data_Tuning_ClothRange.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { CLOTH_LAB_CONTROLS } from "./Data_Tuning_ClothRange.mjs";

export function ClampClothParameter(key, value) {
  const control = CLOTH_LAB_CONTROLS.find(item => item.key === key);
  if (!control || !Number.isFinite(value)) return null;
  return Math.max(control.min, Math.min(control.max, value));
}
