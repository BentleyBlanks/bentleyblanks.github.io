// Data_AircraftAssets.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

/**
 * 把源模型的机首方向 (x, z) 转到局部 -Z 所需的绕 Y 角。
 * three 的 rotation.y = φ 把 XZ 面上的航向角 atan2(x, z) 加 φ；目标航向 atan2(0, -1) = π。
 * 放在数据层是为了让纯 Node 的朝向测试与运行时用同一个换算。
 */
export function NoseYaw(noseDir) {
  if (!noseDir) return 0;
  return Math.PI - Math.atan2(noseDir.x, noseDir.z);
}
