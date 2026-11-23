// 战场规模三档（纯数据）：同屏人数上限、特效粒子预算、阴影图尺寸。开局跑一次性能探针自动推荐。
//
// 单独成文件：特效预览这类只要「粒子预算」的地方不必为此载入 Data_Battle（它会带出整座旧县城的数据）。
// Data_Battle 照旧再导出 SCALE_PRESETS。

export const SCALE_PRESETS = {
  small: { label: "小（40 人）", maxAlive: 40, vfxBudget: 2200, shadow: 2048 },
  medium: { label: "中（70 人）", maxAlive: 70, vfxBudget: 3400, shadow: 2048 },
  large: { label: "大（110 人）", maxAlive: 110, vfxBudget: 4200, shadow: 4096, warn: "需要较好的设备" },
};
