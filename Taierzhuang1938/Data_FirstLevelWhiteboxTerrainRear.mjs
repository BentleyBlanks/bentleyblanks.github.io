// 第一关 15–18 局部地形修饰（西沟南段与夹道、接收院、铁路桥南岸射位与撤出路、夜门外）。
// 形状格式、叠加顺序与校验见 Data_FirstLevelWhiteboxTerrain.mjs 文件头与
// docs/Data_FirstLevelWhitebox0518Gap.md §地形接口。只许往本区 boxes 里写。
// 北沙河河槽与西沟浅滩由 Topology 的 RiverCutAt 最后取 min；沟口缓坡 (52,209.5) 与
// 接收院入口 (-13,240) 两处 9 m 的回归自然地面缓坡也在修饰之后，照旧生效。纯数据，无 import。
export const WHITEBOX_TERRAIN_REAR = Object.freeze({
  id: "Rear1518",
  stages: Object.freeze([15, 16, 17, 18]),
  boxes: Object.freeze([
    Object.freeze({ id: "Reception15", minX: -50, maxX: 70, minZ: 150, maxZ: 260 }),
    Object.freeze({ id: "Bridge18", minX: -100, maxX: -50, minZ: 110, maxZ: 260 }),
    Object.freeze({ id: "Night18", minX: -185, maxX: -135, minZ: 280, maxZ: 360 }),
  ]),
  shapes: Object.freeze([]),
});
