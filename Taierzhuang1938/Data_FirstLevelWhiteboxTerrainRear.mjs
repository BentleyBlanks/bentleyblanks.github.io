// 第一关 15–18 局部地形修饰（西沟南段与夹道、接收院、铁路桥南岸射位与撤出路、夜门外）。
// 形状格式、叠加顺序与校验见 Data_FirstLevelWhiteboxTerrain.mjs 文件头与
// docs/Data_FirstLevelWhitebox0518Gap.md §地形接口。只许往本区 boxes 里写。
// 北沙河河槽与西沟浅滩由 Topology 的 RiverCutAt 最后取 min；沟口缓坡 (52,209.5) 与
// 接收院入口 (-13,240) 两处 9 m 的回归自然地面缓坡也在修饰之后，照旧生效。纯数据，无 import。
//
// 2026-09-27 概念图 15_1…18_2 这一轮：
//   · ReceptionValleyNorth：接收院北面、夹道西北的河谷坡 —— 从 z≈207 起向北下到 1.4 m，
//     z 172 收到 1.0 m，羽化在 z 167.5 停住：河槽（RiverCutAt>0，z<167.2）一厘米不碰，
//     河口留一道自然高度的岸沿，照旧不可横穿。
//     端点 dy 0 的胶囊端帽盖住 z 208–216：院北外沿的接驳点 (-25/-1/6, 216) 地面不动。
//   · LaneHollowEast：15_1 左手石墙外的下沉菜园（-1.0 m），羽化停在 WallPathLowWall 南面
//     (z 213.35) 与石墙东面之外 —— 15B 夹道被量的那几件墙的高度一厘米都不变。
//   · ReceptionYardFloor：院地比院外高一级（+0.15）。入口 (-13,240) 的 9 m 回归缓坡在修饰
//     之后，所以院心仍回到自然地面，高一级读在院门与厢房一带。
//   · BridgeBankBerm*：南岸沿河口的岸垄，两段在 x≈-80…-69 断开（铁路桥头与尾队的路），
//     中心线离 BridgeSouthCoverWest/East 的中心 ≥ 1.5 m：胸墙高度与蹲姿断线不受影响。
export const WHITEBOX_TERRAIN_REAR = Object.freeze({
  id: "Rear1518",
  stages: Object.freeze([15, 16, 17, 18]),
  // 踩出来的小路（只染色不改高度）：{ id, points, width, wear?, note }，口径见 Data_FirstLevelWhiteboxTerrain 文件头。
  paths: Object.freeze([]),
  boxes: Object.freeze([
    Object.freeze({ id: "Reception15", minX: -50, maxX: 70, minZ: 150, maxZ: 260 }),
    Object.freeze({ id: "Bridge18", minX: -100, maxX: -50, minZ: 110, maxZ: 260 }),
    Object.freeze({ id: "Night18", minX: -185, maxX: -135, minZ: 280, maxZ: 360 }),
  ]),
  shapes: Object.freeze([
    Object.freeze({ id: "ReceptionYardFloor", kind: "box", op: "level", x: -19.5, z: 235, w: 40.8, d: 31.8,
      dy: 0.15, feather: 0.75, note: "16–17 院地 +0.15；羽化停在院墙内面，院墙（含量宽的院门两垛）高度不变" }),
    Object.freeze({ id: "ReceptionValleyNorth", kind: "line", op: "cut", halfW: 8, feather: 4.5, dy: 1.4,
      points: Object.freeze([
        Object.freeze({ x: -1, z: 208, dy: 0 }), Object.freeze({ x: 0, z: 199, dy: 1.4 }),
        Object.freeze({ x: 0, z: 186, dy: 1.4 }), Object.freeze({ x: 0.5, z: 180, dy: 1.0 }),
      ]), note: "15 夹道西北向河下降的河谷坡（离沟口缓坡 (52,209.5) 40 m 以上）" }),
    Object.freeze({ id: "LaneHollowEast", kind: "box", op: "cut", x: 28.5, z: 218.75, w: 18, d: 7.1,
      dy: 1.0, feather: 1.4, note: "15_1 左侧石墙外低下去的菜园" }),
    Object.freeze({ id: "BridgeBankBermWest", kind: "line", op: "raise", halfW: 0.5, feather: 0.95, dy: 0.85,
      points: Object.freeze([Object.freeze({ x: -97, z: 176 }), Object.freeze({ x: -82.2, z: 176.1 })]),
      note: "18_1 南岸岸垄西段（胸墙北面）" }),
    Object.freeze({ id: "BridgeBankBermEast", kind: "line", op: "raise", halfW: 0.5, feather: 0.95, dy: 0.75,
      points: Object.freeze([Object.freeze({ x: -70.8, z: 176.5 }), Object.freeze({ x: -57.5, z: 177 })]),
      note: "18_1 南岸岸垄东段；与西段之间留出铁路与尾队的缺口" }),
  ]),
});
