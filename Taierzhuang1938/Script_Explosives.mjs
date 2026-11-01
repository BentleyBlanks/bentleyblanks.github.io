// Data_Explosives.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { EXPLOSIVES, VEHICLE_EXPLOSIVES } from "./Data_Explosives.mjs";

export function ExplosiveIdFor(kind) {
  if (EXPLOSIVES[kind]) return kind;
  if (VEHICLE_EXPLOSIVES[kind]) return VEHICLE_EXPLOSIVES[kind];
  return ({ grenade: "Grenade", tank: "GrenadeBundle", launcher: "Shell50", mortar: "Shell82", artillery: "Shell75", shell: "Shell75" })[kind] || "Shell75";
}
