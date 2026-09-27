// 第一关 08–10 局部地形修饰（村北口、主街、灶屋—连屋、内院、绕回巷、村南车路）。
// 形状格式、叠加顺序与校验见 Data_FirstLevelWhiteboxTerrain.mjs 文件头与
// docs/Data_FirstLevelWhitebox0518Gap.md §地形接口。只许往本区 boxes 里写。纯数据，无 import。
export const WHITEBOX_TERRAIN_VILLAGE = Object.freeze({
  id: "Village0810",
  stages: Object.freeze([8, 9, 10]),
  boxes: Object.freeze([
    // 村北口 z=-30 起（07 南行末段 30..48,-20 在本区），南到 x76 车路 z=75 交给接运区。
    Object.freeze({ id: "Village", minX: 20, maxX: 120, minZ: -30, maxZ: 75 }),
  ]),
  shapes: Object.freeze([]),
});
