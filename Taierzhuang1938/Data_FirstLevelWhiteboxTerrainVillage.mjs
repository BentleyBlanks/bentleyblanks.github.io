// 第一关 08–10 局部地形修饰（村北口、主街、灶屋—连屋、内院、绕回巷、村南车路）。
// 形状格式、叠加顺序与校验见 Data_FirstLevelWhiteboxTerrain.mjs 文件头与
// docs/Data_FirstLevelWhitebox0518Gap.md §地形接口。只许往本区 boxes 里写。纯数据，无 import。
export const WHITEBOX_TERRAIN_VILLAGE = Object.freeze({
  id: "Village0810",
  stages: Object.freeze([8, 9, 10]),
  // 踩出来的小路（只染色不改高度）：{ id, points, width, wear?, note }，口径见 Data_FirstLevelWhiteboxTerrain 文件头。
  paths: Object.freeze([]),
  boxes: Object.freeze([
    // 村北口 z=-30 起（07 南行末段 30..48,-20 在本区），南到 x76 车路 z=75 交给接运区。
    Object.freeze({ id: "Village", minX: 20, maxX: 120, minZ: -30, maxZ: 75 }),
  ]),
  shapes: Object.freeze([
    // 07_2 村北口下沉土路：沿 southWalk 末段 + village 首段，比两侧低 0.4 m。
    // 西端 x 24.5 起从 0 m 进坡（A↔B 衔接：本区下沉从 z≥−28 开始、x≥21 才有羽化），
    // 东端 x 54 回到 0 m，灶屋北门与 08 担架停靠处保持原高。feather 1.5 > 1.17·0.4。
    Object.freeze({ id: "VillageMouthSunkRoad", kind: "line", op: "cut", halfW: 2.0, feather: 1.5, dy: .4,
      points: Object.freeze([
        Object.freeze({ x: 24.5, z: -23.31, dy: 0 }), Object.freeze({ x: 30, z: -23 }),
        Object.freeze({ x: 48, z: -20 }), Object.freeze({ x: 54, z: -20, dy: 0 }),
      ]),
      note: "07_2 村北口：土路下沉 0.4 m，两侧成路肩" }),
    // 路北侧碎石矮墙坐在一道 0.35 m 的土埂上（路肩）。
    Object.freeze({ id: "VillageMouthNorthBerm", kind: "line", op: "raise", halfW: .8, feather: 1.2, dy: .35,
      points: Object.freeze([Object.freeze({ x: 35, z: -26.1 }), Object.freeze({ x: 47, z: -25.4 })]),
      note: "07_2 路北土埂：碎石矮墙与草堆的脚" }),
    // 08 主街街面下沉 0.2 m（障碍北段；障碍本体 z 17…23 不动，免得倒墙/木车悬空）。
    Object.freeze({ id: "StreetSunkNorth", kind: "box", op: "cut", x: 77.1, z: -2.25, w: 4.6, d: 35.5,
      feather: .75, dy: .2, note: "08_1 主街北段车辙低于两侧门前 0.2 m" }),
    Object.freeze({ id: "StreetSunkSouth", kind: "box", op: "cut", x: 77.6, z: 27.5, w: 3.6, d: 8,
      feather: .75, dy: .18, note: "08 主街障碍以南到接回点前" }),
  ]),
});
