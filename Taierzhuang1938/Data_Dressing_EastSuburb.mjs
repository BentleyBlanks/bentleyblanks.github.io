// 东关（濠外住宅带与东门大街延长段，x 310..620, z -240..240）的生活布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有东关包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。城外没有「户口册」格子表 —— 院落位置要读
// Script_TengxianCity.BuildEastSuburb / Script_Landmark_EastSuburb 的生成逻辑，
// 埋墙与叠桩由 Script_DressingProbeTest（引擎碰撞对撞）兜底，截图自查必做。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs
//      node Taierzhuang1938/Script_DressingProbeTest.mjs

export const REGION = Object.freeze({
  id: "EastSuburb", kind: "outfield", label: "东关",
  bounds: { minX: 310, maxX: 620, minZ: -240, maxZ: 240 },
});

export const PLACEMENTS = Object.freeze([
]);
