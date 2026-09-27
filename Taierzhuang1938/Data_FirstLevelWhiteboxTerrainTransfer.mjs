// 第一关 11–14 局部地形修饰（桥头接运场、侧巷、车路路肩、西沟北段）。
// 形状格式、叠加顺序与校验见 Data_FirstLevelWhiteboxTerrain.mjs 文件头与
// docs/Data_FirstLevelWhitebox0518Gap.md §地形接口。只许往本区 boxes 里写。
// 北沙河河槽（z 138.8–167.2）由 Topology 的 RiverCutAt 最后取 min，这里改不动也不该改。纯数据，无 import。
export const WHITEBOX_TERRAIN_TRANSFER = Object.freeze({
  id: "Transfer1114",
  stages: Object.freeze([11, 12, 13, 14]),
  boxes: Object.freeze([
    Object.freeze({ id: "Transfer", minX: 25, maxX: 125, minZ: 75, maxZ: 150 }),
  ]),
  shapes: Object.freeze([]),
});
