// 城防带（顺城街一圈、四门里侧、两处缺口、上城道口）的战地布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有城防包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。城防包只摆墙根/门里/缺口一带的军用件，
// 街肩生活件归 Data_Dressing_MainStreets，院内家什归四个片区包。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs

export const REGION = Object.freeze({
  id: "Defenses", kind: "defense", label: "城防带",
  bounds: { minX: -298, maxX: 298, minZ: -298, maxZ: 298 },
});

export const PLACEMENTS = Object.freeze([
]);
