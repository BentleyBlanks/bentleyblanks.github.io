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
//
// 2026-09-28 场景引导轮（docs/Data_FirstLevelGuidance20260928.md §3.1 小路）：
//   · paths 沿冻结路线画踩出来的路（只染色）：沟尾爬坡 → 夹道 → 院门（15），后门 → 田地 → 爆破安全区
//     → 南岸射位（18 toBridge），安全区 → 行军路（18 marchOut）。院子里不画：院子整片是场坪
//     （MISSION_TERRAIN.pads，track 层已经是 1），画了也看不出来；院里的「往哪个门」靠门本身（见体块包）。
//   · Reception15 / Bridge18 两个框的分界从 x=-50 挪到 x=-41（院西墙外皮）：一条小路（连 1.8 m 染色边）
//     只能落在一个框里，原来的分界正好横在出后门那 10 m 田地上，toBridge 那条路在那儿会断一截。
//     两个框都属本区，挪分界不改任何形状的裁剪（院地 ReceptionYardFloor 羽化止于 x -40.65，
//     岸垄东段止于 x -56.05），也不碰别区的框。
export const WHITEBOX_TERRAIN_REAR = Object.freeze({
  id: "Rear1518",
  stages: Object.freeze([15, 16, 17, 18]),
  // 踩出来的小路（只染色不改高度）：{ id, points, width, wear?, note }，口径见 Data_FirstLevelWhiteboxTerrain 文件头。
  paths: Object.freeze([
    Object.freeze({ id: "WallPathTread", width: 1.6, wear: 0.9,
      points: Object.freeze([
        Object.freeze({ x: 56, z: 201.5 }), Object.freeze({ x: 56, z: 207 }), Object.freeze({ x: 36, z: 211 }),
        Object.freeze({ x: 16, z: 211 }), Object.freeze({ x: 16, z: 220 }), Object.freeze({ x: 12, z: 230 }),
        Object.freeze({ x: 6, z: 237 }), Object.freeze({ x: 2, z: 240 }),
      ]), note: "15A→15C 沟尾爬坡出沟、沿院墙夹道、左拐、到院门（wallPath 全程，前面接沟尾 5.5 m）" }),
    Object.freeze({ id: "ToBridgeTread", width: 1.6, wear: 0.88,
      points: Object.freeze([
        Object.freeze({ x: -43.8, z: 244 }), Object.freeze({ x: -49, z: 236 }), Object.freeze({ x: -58, z: 222 }),
        Object.freeze({ x: -66, z: 210 }), Object.freeze({ x: -66, z: 201 }), Object.freeze({ x: -74, z: 199 }),
        Object.freeze({ x: -78, z: 190 }), Object.freeze({ x: -81, z: 180.6 }),
      ]), note: "18 出后门穿田地到爆破安全区、再到南岸射位（toBridge 全程；撤回 bridgeWithdraw 走的也是这一条）" }),
    Object.freeze({ id: "MarchOutTread", width: 2.2, wear: 0.72,
      points: Object.freeze([
        Object.freeze({ x: -66, z: 204 }), Object.freeze({ x: -64, z: 216 }), Object.freeze({ x: -62, z: 232 }),
        Object.freeze({ x: -61.4, z: 240 }),
      ]), note: "18 炸桥后随队南下（marchOut），行军队踩得宽一点；过了淡出点再延 8 m，路不在脚下断掉" }),
    // 2026-09-30 D 包（概念 18_4）：夜行军的土路 —— 出生点 (-160,292) 到瓮城门前，一条被踩烂的宽路，让开阔泥地有方向。
    Object.freeze({ id: "NightRoadTread", width: 4.6, wear: 0.9,
      points: Object.freeze([
        Object.freeze({ x: -161, z: 285 }), Object.freeze({ x: -160, z: 300 }), Object.freeze({ x: -160, z: 318 }),
      ]), note: "18_4 夜行军的路：出生点以南的开阔泥地里一条宽土路，通向北门" }),
  ]),
  boxes: Object.freeze([
    Object.freeze({ id: "Reception15", minX: -41, maxX: 70, minZ: 150, maxZ: 260 }),
    Object.freeze({ id: "Bridge18", minX: -100, maxX: -41, minZ: 110, maxZ: 260 }),
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
    // 2026-09-30 D 包二轮：1.0 m → 1.8 m、羽化 1.4 → 2.0（最陡 1.35，人不走这里），核心 x 19.5…39.5、z 215.4…221.5。
    // 羽化停点：西 x 17.5（夹道石墙外皮 17.6 之外）、北 z 213.4（WallPathLowWall 南面 213.35 之外）、
    // 南 z 223.5（BackyardWall 北面 223.65 之外），夹道、墙与走线的地面一厘米不动。
    Object.freeze({ id: "LaneHollowEast", kind: "box", op: "cut", x: 29.5, z: 218.45, w: 20, d: 6.1,
      dy: 1.8, feather: 2.0, note: "15_1 左侧石墙外低下去的菜园（墙外 1.8 m 低地）" }),
    Object.freeze({ id: "BridgeBankBermWest", kind: "line", op: "raise", halfW: 0.5, feather: 0.95, dy: 0.85,
      points: Object.freeze([Object.freeze({ x: -97, z: 176 }), Object.freeze({ x: -82.2, z: 176.1 })]),
      note: "18_1 南岸岸垄西段（胸墙北面）" }),
    Object.freeze({ id: "BridgeBankBermEast", kind: "line", op: "raise", halfW: 0.5, feather: 0.95, dy: 0.75,
      points: Object.freeze([Object.freeze({ x: -70.8, z: 176.5 }), Object.freeze({ x: -57.5, z: 177 })]),
      note: "18_1 南岸岸垄东段；与西段之间留出铁路与尾队的缺口" }),
  ]),
});
