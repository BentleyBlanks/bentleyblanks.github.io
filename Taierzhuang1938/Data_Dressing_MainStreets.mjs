// 主次街商业带（全城街肩与铺面门脸）的生活布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有街道包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。街道包只摆**街肩带**（路缘到院墙之间），
// 院子里的东西归四个片区包，城防工事归 Data_Dressing_Defenses。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs

export const REGION = Object.freeze({
  id: "MainStreets", kind: "street", label: "主次街商业带",
  bounds: { minX: -286, maxX: 286, minZ: -286, maxZ: 286 },
});

export const PLACEMENTS = Object.freeze([
]);
