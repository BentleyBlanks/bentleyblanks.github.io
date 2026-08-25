// 北关与城北（北关大街/麦地/村缘，x -360..340, z -640..-310）的生活布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有北关包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。城外没有「户口册」—— 建筑位置读
// Script_Landmark_NorthSuburb / Script_TengxianOutfield，
// 埋墙与叠桩由 Script_DressingProbeTest 兜底，截图自查必做。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs
//      node Taierzhuang1938/Script_DressingProbeTest.mjs

export const REGION = Object.freeze({
  id: "NorthSuburb", kind: "outfield", label: "北关与城北",
  bounds: { minX: -360, maxX: 340, minZ: -640, maxZ: -310 },
});

export const PLACEMENTS = Object.freeze([
]);
