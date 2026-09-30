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
//   · （已被 2026-09-30 的 BridgeLevee* 取代）BridgeBankBerm*：0.85 m 的窄岸垄。
//
// 2026-09-28 场景引导轮（docs/Data_FirstLevelGuidance20260928.md §3.1 小路）：
//   · paths 沿冻结路线画踩出来的路（只染色）：沟尾爬坡 → 夹道 → 院门（15），后门 → 田地 → 爆破安全区
//     → 南岸射位（18 toBridge），安全区 → 行军路（18 marchOut）。院子里不画：院子整片是场坪
//     （MISSION_TERRAIN.pads，track 层已经是 1），画了也看不出来；院里的「往哪个门」靠门本身（见体块包）。
//   · Reception15 / Bridge18 两个框的分界从 x=-50 挪到 x=-41（院西墙外皮）：一条小路（连 1.8 m 染色边）
//     只能落在一个框里，原来的分界正好横在出后门那 10 m 田地上，toBridge 那条路在那儿会断一截。
//     两个框都属本区，挪分界不改任何形状的裁剪（院地 ReceptionYardFloor 羽化止于 x -40.65，
//     岸垄东段止于 x -56.05），也不碰别区的框。
//
// 2026-09-30 第二轮：河岸线起伏（Topology 的 wander），南堤跟着南水线走 —— 堤顶 z = shoreZ + 7（原 166 + 7 = 173），
// 起伏出来后 z 由 Script 现算写进点表：堤脚（堤顶 − 7）恒在 shoreZ 之南 0…0.6 m，不吃进河槽。x −100…−88 与 −64 的点保持原值
//（铁路桥一带地形逐位不变）。Script_FirstLevelWhiteboxTerrainTest 断言点表与 RiverReachAt 一致。
// 2026-09-30 白盒 18 河拓宽（docs/Data_FirstLevelTopology20260919.md §2「拓宽河段」）：
//   · 北沙河在 x −140…−30 拓宽到 ~66 m，南岸自然地面位置不动，水线以南是一片沙滩（RiverCutAt 的断面，
//     在修饰之后取 min，本表不碰）。沙滩南端（shoreZ z 166）之外由本表接一道南堤：
//   · BridgeLeveeWest / East：堤顶 z≈173（核心 z 171.5…174.5）比自然地面高 1.4 m，北坡（河一侧）5.5 m 从 z 166 起爬
//     （峰值斜率 1.5·1.4/5.5 = 0.38，人走得上去）、南坡 5.5 m 落回自然地面。堤在铁路桥头断开（西段核心止于
//     x −88、东段核心始于 x −64，两头羽化后 x −82.5…−70.5 一带没有堤，那是路基 +0.62 的铁路与尾队的路，
//     也是南岸射位 (-81,179.4) 看河、看桥、看沙滩的缺口）。
//   · 框 Bridge18 的西缘从 −100 扩到 −148：堤沿河向西伸到河段之外（河段 x −140…−30，堤终于 x −136 + 7 m 羽化）。
//     Night18 框在 z≥280，Reception15 框在 x≥−41：三框互不相交。
//   · BankPathTread：沿堤顶内侧踩出来的小路（概念 18_1 里回援尾队沿岸朝镜头跑的那条），从铁路桥头缺口向西。
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
    Object.freeze({ id: "BankPathTread", width: 1.8, wear: 0.9,
      points: Object.freeze([
        Object.freeze({ x: -77, z: 169.5 }), Object.freeze({ x: -83, z: 172.2 }), Object.freeze({ x: -100, z: 173.2 }),
        Object.freeze({ x: -112, z: 172.61 }), Object.freeze({ x: -124, z: 170.72 }),
        Object.freeze({ x: -134, z: 167.94 }),
      ]), note: "18 南岸沿堤顶内侧的踩出来的小路：铁路桥头缺口 → 向西沿岸（概念 18_1 尾队沿岸小路朝镜头跑）" }),
    Object.freeze({ id: "MarchOutTread", width: 2.2, wear: 0.72,
      points: Object.freeze([
        Object.freeze({ x: -66, z: 204 }), Object.freeze({ x: -64, z: 216 }), Object.freeze({ x: -62, z: 232 }),
        Object.freeze({ x: -62, z: 250 }), Object.freeze({ x: -64, z: 256 }),
      ]), note: "18 炸桥后随队南下（marchOut 前半）：行军队踩得宽一点；Bridge18 框北界 z 260，再往南接 RetreatTread" }),
    // 2026-09-30 撤离路线南延（docs/Data_FirstLevelBridgeFarBank.md §5）：marchOut 从 (−62,232) 延到 (−98,295)，
    // 后半段落在新框 Retreat18 里，翻过 RetreatRise 缓坡土岗，走到头再延 8 m 让路不在脚下断掉。
    Object.freeze({ id: "RetreatTread", width: 2.2, wear: 0.66,
      points: Object.freeze([
        Object.freeze({ x: -66.4, z: 263.6 }), Object.freeze({ x: -68, z: 268 }), Object.freeze({ x: -80, z: 284 }),
        Object.freeze({ x: -98, z: 295 }), Object.freeze({ x: -105, z: 300 }),
      ]), note: "18 撤离（marchOut 后半）：(−68,268) → 土岗 → (−80,284) → 终点 (−98,295)" }),
  ]),
  boxes: Object.freeze([
    Object.freeze({ id: "Reception15", minX: -41, maxX: 70, minZ: 150, maxZ: 260 }),
    Object.freeze({ id: "Bridge18", minX: -148, maxX: -41, minZ: 110, maxZ: 260 }),
    Object.freeze({ id: "Night18", minX: -185, maxX: -135, minZ: 280, maxZ: 360 }),
    // 撤离土岗与其后：Bridge18 南界 z 260 之南、Night18 东界 x −135 之东（三个框只在边线上相接、不重叠）。
    Object.freeze({ id: "Retreat18", minX: -132, maxX: -30, minZ: 260, maxZ: 330 }),
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
    // ---- 撤离土岗（2026-09-30，docs/Data_FirstLevelBridgeFarBank.md §5）----------------------------
    // 脱离战场要「翻过一道岗」而不是一条突兀的土墙：岗脊 z≈276（离北岸 186 m）、最高 2.7 m、每侧 13 m 缓坡
    // （最陡 1.5·2.7/13 = 0.31，17°，人和担架都走得上），两头收成低缓的坡；脊线略弯，不是一条直线。
    // 站在岗后 z ≥ 290 一带，眼高 1.65 m 的视线到对岸（z≈85）被岗脊挡住（Script_FirstLevelFarBankTest 量）。
    // 岗上的枯树、残屋与坟包在 Data_FirstLevelWhiteboxRear 的 Retreat18 一节。
    Object.freeze({ id: "RetreatRise", kind: "line", op: "raise", halfW: 3, feather: 13, dy: 2.7,
      points: Object.freeze([
        Object.freeze({ x: -116, z: 279, dy: 1.6 }), Object.freeze({ x: -100, z: 278, dy: 2.4 }),
        Object.freeze({ x: -84, z: 276, dy: 2.7 }), Object.freeze({ x: -68, z: 276, dy: 2.7 }),
        Object.freeze({ x: -52, z: 277, dy: 2.2 }), Object.freeze({ x: -46, z: 279, dy: 1.4 }),
      ]), note: "撤离路线翻过的缓坡土岗（岗脊 2.7 m，两头收低）" }),
    Object.freeze({ id: "RetreatKnollWest", kind: "disc", op: "raise", x: -112, z: 291, radius: 5, feather: 9, dy: 1.3,
      note: "土岗西南的一个小土包，把岗后的空地读成有起伏的田" }),
    Object.freeze({ id: "RetreatKnollEast", kind: "disc", op: "raise", x: -50, z: 292, radius: 4, feather: 8, dy: 1.1,
      note: "土岗东南的小土包" }),
    Object.freeze({ id: "BridgeLeveeWest", kind: "line", op: "raise", halfW: 1.5, feather: 5.5, dy: 1.4,
      points: Object.freeze([
        Object.freeze({ x: -136, z: 167.24 }), Object.freeze({ x: -128, z: 169.28 }), Object.freeze({ x: -120, z: 171.49 }), Object.freeze({ x: -112, z: 172.31 }), Object.freeze({ x: -104, z: 172.64 }),
        Object.freeze({ x: -100, z: 173.2 }), Object.freeze({ x: -94, z: 173 }), Object.freeze({ x: -88, z: 173 }),
      ]), note: "18 南堤西段（河南岸的高堤，堤顶背后是南岸射位与小路）；核心止于 x −88，羽化到 x −82.5 为止：射位 (-81,179.4) 正对缺口" }),
    Object.freeze({ id: "BridgeLeveeEast", kind: "line", op: "raise", halfW: 1.5, feather: 5.5, dy: 1.4,
      points: Object.freeze([
        Object.freeze({ x: -64, z: 173 }), Object.freeze({ x: -56, z: 173.2 }), Object.freeze({ x: -49, z: 171.86 }),
      ]), note: "18 南堤东段；核心始于 x −64，与西段之间留出铁路与尾队的缺口；东端羽化止于 x −41.5（框边）之内" }),
  ]),
});
