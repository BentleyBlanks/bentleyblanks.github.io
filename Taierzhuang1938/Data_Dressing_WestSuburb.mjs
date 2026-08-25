// 西关带（车站/电灯厂/西关大街，x -620..-310, z -250..210）的生活布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有西关包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。城外没有「户口册」—— 建筑位置读
// Script_Landmark_WestSuburb / Script_Landmark_Station / Script_Landmark_PowerPlant，
// 埋墙与叠桩由 Script_DressingProbeTest 兜底，截图自查必做。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs
//      node Taierzhuang1938/Script_DressingProbeTest.mjs

export const REGION = Object.freeze({
  id: "WestSuburb", kind: "outfield", label: "西关带",
  bounds: { minX: -620, maxX: -310, minZ: -250, maxZ: 210 },
});

export const PLACEMENTS = Object.freeze([
]);
