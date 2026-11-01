// Data_Tuning_Blood.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { BLOOD_MOTION } from "./Data_Tuning_Blood.mjs";

// Same damped ballistic solution as the particle vertex shader, with no Three dependency.
export function BloodPosition(origin, velocity, age, out) {
  const k = BLOOD_MOTION.drag, g = BLOOD_MOTION.gravity;
  const travel = -Math.expm1(-k * age) / k;
  out.x = origin.x + velocity.x * travel;
  out.y = origin.y + (velocity.y + g / k) * travel - g * age / k;
  out.z = origin.z + velocity.z * travel;
  return out;
}
