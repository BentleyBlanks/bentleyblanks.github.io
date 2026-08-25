// 界河一带的村落与原野（x -620..620, z -1620..-900，独立场景 L0）—— 外部道具层。
//
// 本文件属于一个并行工作包：**只有界河包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。此地不是滕县城 —— 地形与村落读
// Script_JieheField / Script_JieheHeight（石墙村等），主路沿 x≈0 南北向。
// 埋墙与叠桩由 Script_DressingProbeTest 兜底，截图自查必做。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs
//      node Taierzhuang1938/Script_DressingProbeTest.mjs

export const REGION = Object.freeze({
  id: "JieheVillages", kind: "outfield", label: "界河村落",
  bounds: { minX: -620, maxX: 620, minZ: -1620, maxZ: -900 },
});

export const PLACEMENTS = Object.freeze([
]);
