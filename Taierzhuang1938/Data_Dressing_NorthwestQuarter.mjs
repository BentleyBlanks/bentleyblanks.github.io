// 城西北片（x -286..0, z -286..0）的每户生活布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有这个片区的包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。摆位全部走世界坐标（X 向东，Z 向南），
// 落地/碰撞由 Script_ExternalProps 统一处理。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs

export const REGION = Object.freeze({
  id: "NorthwestQuarter", kind: "quarter", label: "城西北片",
  bounds: { minX: -286, maxX: 0, minZ: -286, maxZ: 0 },
});

export const PLACEMENTS = Object.freeze([
]);
