// 第一关 08–10 局部地形修饰（村北口、主街、灶屋—连屋、内院、绕回巷、村南车路）。
// 形状格式、叠加顺序与校验见 Data_FirstLevelWhiteboxTerrain.mjs 文件头与
// docs/Data_FirstLevelWhitebox0518Gap.md §地形接口。只许往本区 boxes 里写。纯数据，无 import。
export const WHITEBOX_TERRAIN_VILLAGE = Object.freeze({
  id: "Village0810",
  stages: Object.freeze([8, 9, 10]),
  // 踩出来的小路（只染色不改高度）：{ id, points, width, wear?, note }，口径见 Data_FirstLevelWhiteboxTerrain 文件头。
  // 2026-09-28 引导轮（docs/Data_FirstLevelGuidance20260928.md §5 B）：
  //   车辙 = 队伍本来要走的大路（村口 → 巷子 → 主街 → 撞上障碍）；
  //   脚径 = 被迫改走的那条（主街口折回 → 灶屋北门 → 穿灶屋、连屋 → 内院 → 院门），踩得更实（wear 0.95）；
  //   院门出来的车辙 = 担架队接回的路（绕回巷 → 主街南段 → 村南门楼）。
  paths: Object.freeze([
    Object.freeze({ id: "VillageLaneRuts", width: 3.2, wear: .75,
      points: Object.freeze([
        Object.freeze({ x: 47.5, z: -20.2 }), Object.freeze({ x: 56, z: -20.4 }), Object.freeze({ x: 63, z: -22.2 }),
        Object.freeze({ x: 70, z: -23.9 }), Object.freeze({ x: 74.6, z: -23.5 }), Object.freeze({ x: 77, z: -20.5 }),
        Object.freeze({ x: 77.2, z: -8 }), Object.freeze({ x: 77, z: 6 }), Object.freeze({ x: 76.7, z: 16.5 }),
      ]),
      note: "08 车辙：村北口顺巷子进主街、一路压到倒墙横车跟前 —— 大路在这儿断了" }),
    Object.freeze({ id: "KitchenDoorTread", width: 1.6, wear: .95,
      points: Object.freeze([
        Object.freeze({ x: 74, z: -23.1 }), Object.freeze({ x: 66, z: -21.5 }), Object.freeze({ x: 60.4, z: -19.9 }),
        Object.freeze({ x: 58.3, z: -18.4 }), Object.freeze({ x: 58, z: -16.6 }), Object.freeze({ x: 58, z: 15.6 }),
      ]),
      note: "08→09 脚径：从主街口折回、拐进灶屋北门，穿灶屋—过道—连屋到南门（屋里地面也踩亮一条）" }),
    Object.freeze({ id: "CourtyardTread", width: 2.0, wear: .9,
      points: Object.freeze([
        Object.freeze({ x: 58, z: 15.6 }), Object.freeze({ x: 57.3, z: 18.6 }), Object.freeze({ x: 53.7, z: 23.4 }),
        Object.freeze({ x: 53, z: 31 }), Object.freeze({ x: 53, z: 34.6 }), Object.freeze({ x: 53.3, z: 38.6 }),
      ]),
      note: "10 内院：连屋南门 → 院门楼 → 绕回巷口（courtyardBypass 的院里那一折）" }),
    Object.freeze({ id: "BypassLaneRuts", width: 3.2, wear: .8,
      points: Object.freeze([
        Object.freeze({ x: 53.3, z: 38.9 }), Object.freeze({ x: 60, z: 39.2 }), Object.freeze({ x: 66, z: 39.1 }),
        Object.freeze({ x: 72.5, z: 39.3 }), Object.freeze({ x: 76.4, z: 41.6 }), Object.freeze({ x: 77.8, z: 48 }),
        Object.freeze({ x: 78, z: 60 }), Object.freeze({ x: 76.6, z: 70.3 }),
      ]),
      note: "10→11 车辙：绕回巷往东、在主街口直接拐南（不回头去 streetRejoin 那一折）、穿村南门楼" }),
  ]),
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
