// Data_Tuning_FirearmEffects.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { FIREARM_EFFECTS } from "./Data_Tuning_FirearmEffects.mjs";

export function FirearmEffects(weaponOrKind) {
  const kind=typeof weaponOrKind==="string"?weaponOrKind:weaponOrKind?.kind;
  return FIREARM_EFFECTS[kind] || FIREARM_EFFECTS.boltRifle;
}
