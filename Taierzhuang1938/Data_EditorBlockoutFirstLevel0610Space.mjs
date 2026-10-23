// ===========================================================================
// Data_EditorBlockoutFirstLevel0610Space.mjs —— 第一关 06–10 白盒（关卡键 FirstLevel0610）的空间锚点
//
// 唯一口径：Notion「第一关｜往南的路 · 剧本」06–10 节（10-19 用户拍板的第二版）+ 集成负责人 10-19 的第二版契约 §2 + 10-22 用户拍板的第六版空间（下）。
// 坐标与 FirstLevel0105 同一套：原点 = 01–05 的沟口；X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南。
// 06 的干沟、南岸枯树、凹路口都从 Data_EditorBlockoutFirstLevel0105Space import 现成常量，不抄数字：0105 那边改了，重跑生成器就跟着变。
// 0105 里没有的往南部分（凹路南段、村口路沟、河汊子、耿家庄）写在这里。
//
// 场景生成器（Script_EditorBlockoutFirstLevel0610Scene.mjs）按这里烘地形与体块，
// 关键帧生成器（Script_EditorBlockoutFirstLevel0610Keyframes.mjs）按这里摆人、POI 与机位。都只读本表；要挪地方先改这里，再重跑生成器。
// 纯数据：零 three、零 DOM，node 与浏览器共用。
//
// 第六版空间（2026-10-22，用户「过于规整，不像华北平原的村子」）：耿家庄按有出处的历史重摆。依据：
//   · 新编《滕县志》·居住（https://shandong-chorography.org/database/c46/section/3/article/350/）：村镇多沿河、沿古道，族人挨着住；
//     富户四合院、几院相连；一般人家也多四合院格局；北屋是正房、两头留风道；前面两侧配房略矮；南屋多三间；院门一般开在东南角或西南角；
//     院墙较高；院里一般不打井；正房前种石榴。50 年代乡下盖房还多是草房。
//   · 新编《滕县志》·乡村建设（…/article/221/）：旧时乡村道路弯曲、坎坷、狭窄；1966 年前盖房没统一规划；1949 年前多数人喝河、坑、沟水；房前屋后种泡桐、槐、果树。
//   · 《巨野县志》·院落（https://shandong-chorography.org/database/ch6/section/1/article/377/index.txt）：还有「半面槽院」（两三座房）、
//     「排房院」（一排房，堂屋居中、东或西头是伙房）；旧院墙土筑约 2.5 m。
//   · 《莒南县志》：1950 年前多是草房，一栋三间或五间，少数富户住四合院。
// 所以：院子大小不一、四合院 / 半面槽院 / 排房院混着（L0610_YARDS 每院标 kind），中间夹菜园、空地、树和一个取土坑积的水坑；
// 胡同 1.5–3 m 宽、直角拐来拐去、有死胡同；真实尺度：三间北屋约 10×5 m（一间 3.3 m）、两间配房约 6–7×4 m、三间南屋约 10×4 m、
// 院子 12–20 m 见方（富户大些、几院相连）。主街拉直、6 m 宽是为了剧情（创作）。庄子挨过炮（07 几处房顶冒烟）：炸塌的墙和房把岔路都堵死（L0610_RUBBLE），
// 顺子和妮儿从巷子口到老耿家只剩一条路（L0610_ROUTE）。改了什么：
//   · 老耿家改成半面槽院（赶驴车的庄稼人）：x 92…108、z 470…486，北墙就是丁字路口南边；北屋三间 x 95…105、z 470…475，堂屋门朝南 (100,475)；
//     北屋后墙上鬼子凿的三个枪眼（堂屋那个正对主街 x 100、离地 1.1，北窗机枪搬到这里；西间、东间各一个步枪枪眼；枪眼是创作、出处待查）；
//     西屋两间是灶屋 x 92…96、z 476…482.6，门朝东；院门在东南角、开在东墙 (108,483.5)，朝东墙外的窄胡同；院墙 2.4。
//     原来的前屋北窗、大门过道、偏屋、南墙后门、水缸都删了（信号 BackVatMoved / BackDoorOpen 跟着删）。
//   · 往南只剩一条窄胡同（L0610_SOUTH_LANE）：丁字路口东南角沿老耿家东墙外往南，拐三道弯到新村南口 (117,545)（原 (98,545) 往东挪 19 m）；
//     中段 z 503…507 西墙随信号 LaneWallCollapse 倒进胡同（倒下的墙板 + 瓦砾堆把胡同堵死），旁边院子（DY）靶胡同那面墙下一垛 1.2 m 的柴（踩着翻墙），
//     院门在它西南角接回胡同更南的一段。10 末炮轰中撤退走这里。
//   · 西半边唯一的路（L0610_ROUTE）：巷子口 (80,384) → 夹道 → 拐四道弯 → 街坊家西墙外的窄夹道 → L4（街坊家门外，门半掩能瞥见院里）→ 回头从西配房塌掉的西北角钻进去
//     → 窗洞看院里（窖口 9.7 m、石磨 9.6 m）→ 出院门 → L4 往西几步 → 南北夹道往南 → 本家院南墙西南角的院门 → 共用墙上的便门（SideGateOpen）→ 老耿家灶屋门。
//     这条路之外的岔路一律用瓦砾堆堵死；只有 L4 往东通丁字路口那头不堵（搜窖的鬼子从那里去路口）。
//   · 东街拐两道弯（E1 z 465 → 连接段 x 178…182 → E2 z 458 → 连接段 x 212…216 → E3 z 465 接东北进庄的道）：石碾后往东看得见 E1 整段与 E2 的北侧；
//     门洞 / 豁口 / 枪眼 / 庙 / 垛（L0610_EAST_STREET.probes）都在石碾往东 ±40° 扇面里、离石碾 20…90 m；石碾北、南 8 m 内是实墙。
//   · 第五版的结论都保留：河汊子贴西墙、路沟西头通河、东北进庄的道、西边封死、东北角北墙 z 388 让开看东北道的视线、06 / 07 / 08 的地面不动。
//
// 第五版（2026-10-21，「随便绕啊现在是」）与更早各版改了什么见 docs/Data_EditorBlockout.md §15（河汊子中线 34.5、路沟西头通河、东北进庄的道、场地到 x 320）。
//
// 2026-10-24（用户「班长和顺子应该分两路穿插巷口，而不是傻傻的等着」）：班长那一路（L0610_EAST_YARD_ROUTE）——从主街东边 z 432.5 那道敞着的院门钻进 EM2，
//   踩墙根的柴垛翻 EM2 / EM3 之间 z 435 那道院墙（人梯），穿 EM3 蹲在它南墙的院门（就是路口东北角 pocket 的北门，z 458）后头；09-7 隔墙甩两颗手榴弹、
//   撞开门（新信号 EastGateBurst）贴身砍。院子不开口子：翻墙点照 L0610_SOUTH_LANE.climb 的做法做成「柴垛 + from / to 的链接」，SceneTest 的泛洪照旧只有一条路。
//   路口东北角那道院门从 NorthYardGatesBroken 改挂 EastGateBurst（10-3 北边院子链只剩两道门要砸）。
// ===========================================================================

import {
  L0105_CELL_M, L0105_HEIGHTS, L0105_GULLY, L0105_GULLY_TREES, L0105_SUNKEN_LANE, L0105_PLACES, L0105_TRENCHES,
  PointAlong, PointBeside, LineLength,
} from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

export { PointAlong, PointBeside, LineLength };

export const L0610_LEVEL_KEY = "FirstLevel0610";
export const L0610_TITLE = "第一关 06–10 · 耿家庄（新剧本白盒）";
export const L0610_VERSION = "2026-10-24 第六版空间 + 班长那一路（按县志重摆耿家庄：三种院子混着 / 胡同拐弯 / 瓦砾堵岔路 / 老耿家半面槽院 + 枪眼 / 窄胡同出村 / 东街拐两道弯；主街东边两个院子里的翻墙点与路口东北角那道门）";

/** 场地范围与高度网格（0.5 m 一格，与 0105 一样）。只烘干沟以北到坡顶那一截当背景，前沿不烘。 */
export const L0610_BOUNDS = Object.freeze({ minX: -20, maxX: 320, minZ: 120, maxZ: 560 });
export const L0610_CELL_M = L0105_CELL_M;

const P = (x, z) => Object.freeze({ x, z });
const Line = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));
const Box = (minX, maxX, minZ, maxZ) => Object.freeze({ minX, maxX, minZ, maxZ });
const F = Object.freeze;

/** 从 0105 借来的东西（原样引用，不抄）：干沟、南岸枯树、凹路头一段、交通沟坡道、集结处几个地名。 */
export const L0610_FROM_0105 = F({
  gully: L0105_GULLY,
  gullyTrees: L0105_GULLY_TREES,
  lane: L0105_SUNKEN_LANE,
  trafficTrench: L0105_TRENCHES.traffic,
  heights: L0105_HEIGHTS,
  assembly: L0105_PLACES.assembly,
  assemblyEntry: L0105_PLACES.assemblyEntry,
  laneHead: L0105_PLACES.laneHead,
  crest: L0105_PLACES.crest,
});

/** 自然地面的几个控制高度，米。干沟南岸再往南的平地在 0105 里是 0。 */
export const L0610_HEIGHTS = F({
  plain: L0105_HEIGHTS.southPlain,   // 0：干沟以南的平地（z 168…200）
  plainRise: 1.0,                    // 凹路中段两侧的地略高：路才有 2.5 m 深
  village: 0.3,                      // 耿家庄的地面（整村压平，墙和房子才站得稳）
  laneDeepY: -1.4,                   // 凹路中段路底（0105 凹路末端就是 −1.4，接上）
  laneMidY: -1.2,                    // 过 (96,320) 以后路底开始抬
  laneMouthY: -0.9,                  // 凹路末端 = 路沟沟底（比村口地面 +0.3 低 1.2 m）
  ditchFloorY: -0.9,                 // 村口路沟沟底
  riverDepth: 3.0,                   // 河汊子沟底比两岸低多少
  cellarDepth: 2.0,                  // 地瓜窖深
  pondDepth: 1.2,                    // 村里的取土坑（积水）深
});

/** 平地起伏的大形：沿 z 的控制点（z, 高度），之间平滑过渡；z ≤ 200 为 0（不碰 0105 那一片）。 */
export const L0610_PLAIN_PROFILE = F([[200, 0], [262, L0610_HEIGHTS.plainRise], [300, L0610_HEIGHTS.plainRise], [372, L0610_HEIGHTS.village], [560, L0610_HEIGHTS.village]]);

/** 凹路（后送路）：0105 的折线原样接上，再往南到村口路沟的北沿 (100,378)，路底一路缓升到沟底 −0.9 直接接进沟里。 */
export const L0610_LANE = F({
  line: Line(...L0105_SUNKEN_LANE.line.map((p) => [p.x, p.z]), [84, 230], [90, 260], [96, 320], [100, 378]),
  floorW: L0105_SUNKEN_LANE.floorW,
  wallM: L0105_SUNKEN_LANE.wallM,
  floorKnots: F([
    F({ at: P(84, 230), y: L0610_HEIGHTS.laneDeepY }),
    F({ at: P(90, 260), y: L0610_HEIGHTS.laneDeepY }),
    F({ at: P(96, 320), y: L0610_HEIGHTS.laneMidY }),
  ]),
  mouthY: L0610_HEIGHTS.laneMouthY,
});

/** 村口路沟（第二版）：村口外一道东西向的沟，凹路接在它中间（x 100），主街口从它南沿上去；西头（第五版）通进河汊子。 */
export const L0610_DITCH = F({
  name: "村口路沟", z: 380, floorW: 3, fromX: 36, toX: 125, floorY: L0610_HEIGHTS.ditchFloorY,
  wallM: 1.3, endM: 4, rampWallM: 3.6, rampHalfW: 3.0, rampBlendM: 1.5,
  eastHalfFromX: 104, westHalfToX: 98,
  westOpensToRiver: true,
});

/** 河汊子（村西，第五版贴着庄子西墙 x 40）：沟底 31.5…37.5，东壁坎沿顶到西墙根；庄子那一段东岸不堆土埂；沟底齐腰深的水。 */
export const L0610_RIVER = F({
  name: "河汊子", centerX: 34.5, fromZ: 200, toZ: 560, floorW: 6, depth: L0610_HEIGHTS.riverDepth, wallM: 2.5,
  bankH: 0.4, bankW: 3.0, endM: 10, waterW: 6.0, waterH: 1.0,
  eastBankOff: F({ fromZ: 372, toZ: 548, fadeM: 4 }),
});

/** 东北进庄的道（第五版）：东街东头 (232,465) 出去往东北穿过麦地；07 末 / 08 看得见 x 274…290 那一段上的鬼子。 */
export const L0610_EAST_ROAD = F({
  name: "东北进庄的道", halfW: 2.0, lowerM: 0.15,
  line: Line([232, 465], [246, 458], [258, 430], [270, 395], [285, 355], [300, 320]),
  graves: F([F({ x: 248, z: 438, r: 1.3, h: 0.7 }), F({ x: 251.5, z: 441.5, r: 1.1, h: 0.6 }), F({ x: 291, z: 372, r: 1.2, h: 0.65 })]),
  trees: F([F({ x: 277, z: 399, h: 6.5 }), F({ x: 299, z: 340, h: 5.5 })]),
  viewFromX: 274, viewToX: 290,
});

/** 耿家庄的范围与通用尺寸。土坯院墙 2.2 m（老耿家 2.4），房子 3.0–3.5 m。 */
export const L0610_VILLAGE = F({
  box: Box(40, 235, 383, 548), y: L0610_HEIGHTS.village, fadeM: 10,
  wallT: 0.5, wallH: 2.2, houseH: 3.2, wingH: 3.0, doorW: 1.2, doorTopH: 2.0, gateW: 1.5, streetLowerM: 0.12,
  fenceH: 0.5,                    // 菜园的矮篱 / 矮土墙（能跨过去）
  loophole: F({ w: 0.3, sillH: 0.95, topH: 1.25 }),   // 枪眼：墙上 0.3 宽的洞，中心离地 1.1
});

// ---------------------------------------------------------------------------
// 街巷：每条都是轴对齐的净空条（clear = 人能走的范围；两边墙的中线在净空外 0.25）。
// axis "z" = 南北向（c 是 x）、"x" = 东西向（c 是 z）；from / to 沿走向；halfW 半宽。
const Run = (id, name, axis, c, halfW, from, to, extra = {}) => F({ id, name, axis, c, halfW, from, to, ...extra });

export const L0610_STREETS = F({
  main: Run("main", "主街", "z", 100, 3, 385, 458),                                   // 6 m 宽、笔直（创作）：路沟南沿到丁字路口
  square: F({ name: "丁字路口", box: Box(92, 110, 458, 470) }),                        // 主街南头的丁字路口（老耿家北墙就是它南边）
  pocket: F({ name: "路口东北角（石碾西北背后）", box: Box(103.25, 110, 458, 463) }),  // 10-4 抄后路的鬼子从这里的院门钻出来
  // 东街：拐两道弯（E1 → 连接段 → E2 → 连接段 → E3），东头接东北进庄的道
  east: Run("east", "东街", "x", 465, 1.75, 110, 181.75),
  eastJog1: Run("eastJog1", "东街第一道弯", "z", 180, 1.75, 456.25, 466.75),
  east2: Run("east2", "东街中段", "x", 458, 1.75, 178.25, 215.75),
  eastJog2: Run("eastJog2", "东街第二道弯", "z", 214, 1.75, 456.25, 466.75),
  east3: Run("east3", "东街东段", "x", 465, 1.75, 212.25, 232),
  // 巷子（顺子和妮儿那条唯一的路）：夹道 A1 → A2 往西 → A3 往南 → A4 往西 → A5（街坊家西墙外的窄夹道）→ L4
  alleyNorth: Run("alleyNorth", "巷子（北头的夹道）", "z", 80, 1, 383, 401),
  alleyA2: Run("alleyA2", "巷子第一道弯（往西）", "x", 400, 1, 70, 81),
  alleyA3: Run("alleyA3", "巷子（往南那截）", "z", 71, 1, 399, 424),
  alleyA4: Run("alleyA4", "巷子第二道弯（往西）", "x", 423, 1, 62, 72),
  alleyA5: Run("alleyA5", "街坊家西墙外的窄夹道", "z", 63, 0.75, 422, 467.75),
  l4: Run("l4", "L4 小胡同（街坊家门外，东头通丁字路口）", "x", 468.75, 1, 56, 92),
  passage: Run("passage", "通本家院的南北夹道", "z", 75, 0.75, 470, 492),
  passageEnd: Run("passageEnd", "本家院南墙外的死胡同", "x", 491, 0.75, 74.25, 92, { caps: F(["to"]) }),
  // 岔路（都用瓦砾堵死，L0610_RUBBLE）与死胡同
  alleyEastStub: Run("alleyEastStub", "夹道脚下往主街的死胡同", "x", 400, 1, 81, 96.75, { caps: F(["to"]) }),
  alleyWestStub: Run("alleyWestStub", "巷子往西的岔路（死胡同）", "x", 400, 1, 52, 70, { caps: F(["from"]) }),
  l4WestStub: Run("l4WestStub", "L4 往西的岔路（死胡同）", "x", 468.75, 1, 50, 62, { caps: F(["from"]) }),      // 与 l4 同一条线，这一截在瓦砾西边
  // 往南的窄胡同（老耿家东墙外）：SL1 → SL2 往东 → SL3 往南（塌墙处）→ SL4 往东 → SL5 到村南口
  southLane1: Run("southLane1", "老耿家东墙外的窄胡同", "z", 109, 0.75, 470, 496),
  southLane2: Run("southLane2", "窄胡同第一道弯（往东）", "x", 495, 0.75, 108.25, 114.25),
  southLane3: Run("southLane3", "窄胡同（塌墙那一截）", "z", 113.25, 1, 494.25, 522),
  southLane4: Run("southLane4", "窄胡同第三道弯（往东）", "x", 521, 0.75, 112.25, 117.75),
  backLane: Run("backLane", "出村那一截（到新村南口）", "z", 117, 0.75, 520.25, 545),
  // 村南西半边：从窄胡同第三道弯往西（瓦砾堵死）→ 拐南 → 往西 → 再拐南 → 往西到头
  southWestLane: Run("southWestLane", "村南的东西小巷（往西，瓦砾堵死）", "x", 521, 0.75, 92, 112.25),
  swJog: Run("swJog", "村南小巷拐南", "z", 93, 0.75, 520.25, 531),
  swLane3: Run("swLane3", "村南小巷西段", "x", 530, 0.75, 66, 93.75),
  swJog2: Run("swJog2", "村南小巷再拐南", "z", 65, 0.75, 529.25, 537),
  swLane4: Run("swLane4", "村南小巷西头（死胡同）", "x", 536, 0.75, 44, 65.75, { caps: F(["from"]) }),
  // 东街南边院子后头的小巷（从窄胡同第一道弯往东，瓦砾堵死）：错两道
  eastSouthLane: Run("eastSouthLane", "东街南边院子后头的小巷（往东，瓦砾堵死）", "x", 495, 0.75, 114.25, 150),
  esJog: Run("esJog", "后头小巷错口·一", "z", 151, 0.75, 494.25, 500.75),
  eastSouthLane2: Run("eastSouthLane2", "后头小巷中段", "x", 500, 0.75, 150.25, 186.25),
  esJog2: Run("esJog2", "后头小巷错口·二", "z", 187, 0.75, 494.25, 500.75),
  eastSouthLane3: Run("eastSouthLane3", "后头小巷东段（死胡同）", "x", 495, 0.75, 186.25, 214, { caps: F(["to"]) }),
  seLaneN: Run("seLaneN", "村东南的南北小巷（死胡同）", "z", 197, 0.75, 495.75, 542, { caps: F(["to"]) }),
  // 村南东半边：从出村那截往东（瓦砾堵死）→ 错口往北 → 往东到头
  southEastLane: Run("southEastLane", "村南的东西小巷（往东，瓦砾堵死）", "x", 525, 0.75, 117.75, 150),
  seJog: Run("seJog", "村南小巷错口", "z", 151, 0.75, 516.25, 525.75),
  southEastLane2: Run("southEastLane2", "村南小巷东段（死胡同）", "x", 517, 0.75, 150.25, 182, { caps: F(["to"]) }),
  // 东北角那片院子中间的小巷：从东街中段往北 → 往西 → 拐北 → 往西到头；北头另有一截往东的死胡同（错开 4 m）
  neLane2: Run("neLane2", "东北角往东街的南北小巷", "z", 197.25, 0.75, 415, 456.25, { caps: F(["from"]) }),
  neLane1: Run("neLane1", "东北角的东西小巷", "x", 420, 1.25, 160.25, 198),
  neLaneJog: Run("neLaneJog", "东北角小巷拐北", "z", 161.25, 1, 405, 421.25),
  neLane0: Run("neLane0", "东北角小巷西段（死胡同）", "x", 405, 1, 128, 162.25, { caps: F(["from"]) }),
  neStubE: Run("neStubE", "东北角往东的死胡同", "x", 416, 1, 198, 230, { caps: F(["to"]) }),
});

/** 全村胡同中线折线（供关键帧生成器排路网）。 */
function RunLine(r) { return r.axis === "z" ? Line([r.c, r.from], [r.c, r.to]) : Line([r.from, r.c], [r.to, r.c]); }
export const L0610_LANES = F(Object.values(L0610_STREETS).filter((r) => r.axis).map((r) => F({ id: r.id, name: r.name, halfW: r.halfW, line: RunLine(r) })));

// ---------------------------------------------------------------------------
// 老耿家（半面槽院：北屋三间 + 西屋两间灶屋）。墙的坐标是墙的中线；门窗给中心与宽。
const GENG_BOX = Box(92, 108, 470, 486);
export const L0610_GENG = F({
  box: GENG_BOX,
  compound: GENG_BOX,                                            // 旧名字（Keyframes / Previz 还 import）
  wallH: 2.4,                                                    // 院墙较高（县志）
  kind: "banmian",
  beiwu: F({
    box: Box(95, 105, 470, 475), roofH: 3.5, parapetH: 0.35,
    tangwuDoor: F({ x: 100, w: 1.2, topH: 2.0 }),                // 堂屋门朝南开在院子里
    // 北屋后墙（z 470）上鬼子凿的枪眼：堂屋那个正对主街（机枪）、西间 / 东间各一个步枪枪眼。离地 1.1。
    loopholes: F([
      F({ x: 100, z: 470, h: 1.1, who: "mg", name: "堂屋枪眼（机枪）" }),
      F({ x: 96.6, z: 470, h: 1.1, who: "rifleWest", name: "西间枪眼" }),
      F({ x: 103.4, z: 470, h: 1.1, who: "rifleEast", name: "东间枪眼" }),
    ]),
    collapseFromX: 102.6,                                        // BarrageHit：东间（x ≥ 102.6）的后墙与房顶塌下来
  }),
  frontRoom: F({ box: Box(95, 105, 470, 475), roofH: 3.5, parapetH: 0.35 }),   // 旧名字 = 北屋
  zaowu: F({ box: Box(92, 96, 476, 482.6), roofH: 3.0, door: F({ z: 479.3, w: 1.0 }) }),   // 灶屋两间，门在东墙朝院子
  kitchen: F({ box: Box(92, 96, 476, 482.6), roofH: 3.0, door: F({ z: 479.3, w: 1.0 }) }),  // 旧名字 = 灶屋
  gate: F({ wall: "E", x: 108, z: 483.5, w: 1.5, topH: 2.0, leaf: "open" }),  // 院门：东南角、开在东墙上，朝东墙外的窄胡同；门扇敞着
  yard: F({
    box: Box(92, 108, 475, 486),
    kitchenDoorOut: P(97.2, 479.3),       // 灶屋门口（院里）
    gateIn: P(106.6, 483.5),              // 院门里
    sideDoorIn: P(93.3, 484.6),           // 便门里（本家院过来）
    center: P(101.5, 480.5),
    tangwuDoorOut: P(100, 476.2),         // 堂屋门口
    pomegranate: P(102.6, 477.3),         // 正房前的石榴树
  }),
  sharedWall: F({ x: 92, fromZ: 470, toZ: 486 }),                // 与本家院共用的那道墙（x 92）
  dogHole: F({ z: 473, w: 0.45, h: 0.4 }),                       // 狗洞（大人钻不过）
  sideGate: F({ z: 484.6, w: 1.0, leafW: 0.85, leafT: 0.1 }),    // 便门：从老耿家这边闩着；SideGateOpen 开
  stove: F({ x: 93.0, z: 477.2, w: 1.6, d: 0.9, h: 0.8 }),
  board: F({ x: 93.2, z: 481.8, w: 1.4, d: 0.6, h: 0.85 }),
  haystack: F({ x: 105.5, z: 485.0, w: 2.2, d: 1.5, h: 1.5 }),   // 院子东南角、院门南边的柴垛
  vat: P(97.4, 481.6),                                           // 灶屋门口的水缸
  mgPost: P(100, 471.5),                                         // 堂屋枪眼后的机枪手
  mgLoaderPost: P(98.6, 472.3),                                  // 副射手
  rifleWestPost: P(96.6, 471.6), rifleEastPost: P(103.4, 471.6),
  gatePost: P(106.6, 483.5),                                     // 院门里头站着的鬼子（旧名字保留）
  roofPost: P(106.6, 483.5),                                     // 旧名字保留（第二版起不上房）
  // BarrageHit：东间塌下来的那堆土
  collapseRubble: F({ x: 103.9, z: 472.4, w: 2.4, d: 2.0, h: 1.4, ry: 0.35 }),
});

// 街坊家（四合院，x 64…84、z 444…467.5）：09 顺子和妮儿从西配房塌掉的西北角钻进去，从窗洞看院里的窖口与石磨。
export const L0610_JIEFANG = F({
  name: "街坊家", box: Box(64, 84, 444, 467.5), kind: "siheyuan",
  gate: F({ wall: "S", x: 66.5, z: 467.5, w: 1.5, topH: 2.0, leaf: "ajar" }),          // 西南角、开在南墙上，门外是 L4；门扇斜开
  beiwu: F({ box: Box(69, 79, 444, 449), roofH: 3.2, hollow: true, door: F({ x: 74, w: 1.2 }) }),   // 三间北屋（媳妇被拖进去）：空心，堂屋门朝南
  westWing: F({
    box: Box(64, 68, 449, 456), roofH: 3.0, hollow: true,
    breach: F({ z: 449.25, zTo: 450.75, xTo: 65.6, rubbleH: 0.45 }),   // 西北角挨过炮塌了：西墙 z 449.25…450.75、北墙 x 64.25…65.6 没了，地上一摊矮瓦砾
    window: F({ z: 452.5, w: 0.9, sillH: 0.9, topH: 1.8 }),             // 东墙上朝院子的窗洞（窗户纸，白盒留空洞）
    door: F({ z: 455, w: 1.0 }),                                        // 东墙上的门，朝院子
    vat: P(67.3, 450.3),                                                // 屋里的大缸（藏人），西北角墙根
    eyeBackM: 0.6,                                                      // 从窗洞往外看：眼睛在窗后 0.6 m、对着要看的东西（生成器算）
  }),
  eastWing: F({ box: Box(80, 84, 450, 456.5), roofH: 3.0 }),
  nanwu: F({ box: Box(72, 82, 463.5, 467.5), roofH: 3.0 }),            // 三间南屋（挪到 x 72 起：半掩的门缝里才看得见窖口）
  cellar: F({ x: 73.5, z: 460.5, floorW: 1.6, wallM: 0.15, depth: L0610_HEIGHTS.cellarDepth, mouth: 1.2, rimH: 0.15 }),   // 地瓜窖（院当中偏南）
  cellarLid: F({ x: 75.3, z: 462.0, w: 1.3, d: 1.3, t: 0.08, ry: 0.35 }),
  cellarLidBlown: F({ x: 76.9, z: 458.4, ry: 1.1 }),
  mill: F({ x: 77.0, z: 457.0, baseW: 1.5, baseH: 0.4, stoneW: 1.1, stoneH: 0.35 }),   // 石磨（绑着老汉）
  pisserOffset: P(1.4, -2.3),                                           // 看守站在窖口东北
  tree: P(71.0, 451.2),                                                 // 北屋前的石榴
  glimpse: P(65.8, 468.2),                                              // 09 在 L4 上从半掩的门缝斜着瞥见院里窖口的站点（关键帧 09-2 用这个点；正对门洞往北看不到偏东的窖口）
});

// 本家院（老耿的本家，四合院，x 76…92、z 470…490，跟老耿家共用 x 92 那道墙）。
export const L0610_BENJIA = F({
  name: "本家院", box: Box(76, 92, 470, 490), kind: "siheyuan",
  gate: F({ wall: "S", x: 78.5, z: 490, w: 1.2, topH: 2.0, leaf: "open" }),    // 西南角、开在南墙上，门外是夹道尽头的死胡同；人跑了门没关
  beiwu: F({ box: Box(78.5, 88.5, 470, 475), roofH: 3.2 }),
  westWing: F({ box: Box(76, 80, 477, 483.5), roofH: 3.0 }),
  eastWing: F({ box: Box(88, 92, 476.5, 482.5), roofH: 3.0 }),
  nanwu: F({ box: Box(80.5, 90.5, 486, 490), roofH: 3.0 }),
  dogHole: P(92, L0610_GENG.dogHole.z),                                  // 共用墙上的狗洞（0.45×0.4）
  sideDoor: P(92, L0610_GENG.sideGate.z),                                // 共用墙上的便门（老耿家那边闩着，SideGateOpen 开）
  tree: P(84.0, 477.4),
  sideDoorOut: P(90.7, 484.6),                                           // 便门外（本家院这边）的站点
});

/** 旧名字：邻院 = 本家院（Keyframes / Previz 还 import NB.box / NB.westDoor / NB.house）。westDoor 指到本家院的院门。 */
export const L0610_NEIGHBOR = F({
  box: L0610_BENJIA.box,
  westDoor: F({ x: L0610_BENJIA.gate.x, z: L0610_BENJIA.gate.z, w: L0610_BENJIA.gate.w, leaf: false }),
  house: F({ box: L0610_BENJIA.beiwu.box, h: L0610_BENJIA.beiwu.roofH }),
  vat: P(89.4, 485.2), coop: P(77.2, 488.6),
});

// ---------------------------------------------------------------------------
// 全村的院子（老耿家 / 街坊家 / 本家院另有专表；这里是其余的）。kind: siheyuan 四合院 / banmian 半面槽院 / paifang 排房院 / garden 菜园空地 / pond 坑塘。
// gate: { wall: "N"|"S"|"E"|"W", c（沿墙的坐标）, w, leaf: "closed"|"open"|null }；houses: [{ id, box, h? }]（北屋在前）；fences: 哪几面是矮篱（菜园）。
const Y = (id, name, kind, box, gate, houses, extra = {}) => F({ id, name, kind, box, gate, houses: F(houses.map((h) => F(h))), ...extra });
const Hs = (box, h) => ({ box, h });
export const L0610_YARDS = F([
  // --- 北边：路沟南沿到巷子第一道弯（后墙错开：WN1 到 401.25、WN1b / WN2 到 398.75） ---
  Y("WN1", "村北西头的半面槽院", "banmian", Box(40, 52, 385, 401.25), F({ wall: "E", c: 400, w: 1.5, leaf: "closed" }), [Hs(Box(42.5, 49.1, 385.5, 390.5), 3.2), Hs(Box(47.5, 51.5, 393, 399.5), 3.0)], { tree: P(44, 395) }),
  Y("WN1b", "村北的小排房院", "paifang", Box(52, 61, 385, 398.75), F({ wall: "S", c: 59, w: 1.5, leaf: "closed" }), [Hs(Box(53.5, 60, 386, 391), 3.2)]),
  Y("WN2", "夹道西边的排房院", "paifang", Box(61, 78.75, 385, 398.75), F({ wall: "S", c: 76.5, w: 1.5, leaf: "closed" }), [Hs(Box(63, 76.5, 386, 391), 3.2)]),
  // 08-1 一个村民从这院出来顺巷子跑到巷子口：门开在西墙上、朝夹道，没门扇
  Y("NAE", "夹道东边的半面槽院（08-1 村民）", "banmian", Box(81.25, 96.75, 385, 398.75), F({ wall: "W", c: 396, w: 1.2, leaf: "open" }), [Hs(Box(84, 94, 385.5, 390.5), 3.2), Hs(Box(92, 96.25, 392, 397.5), 3.0)]),
  // --- 巷子第一道弯以南、第二道弯以北 ---
  Y("WY2a", "西头的四合院", "siheyuan", Box(40, 56, 401.25, 421.75), F({ wall: "N", c: 54, w: 1.5, leaf: "closed" }), [Hs(Box(43, 53, 401.75, 406.75), 3.2), Hs(Box(40.5, 44.5, 409.5, 416), 3.0), Hs(Box(51.5, 55.5, 409.5, 416), 3.0), Hs(Box(43, 53, 417.5, 421.25), 3.0)], { tree: P(48, 408.5) }),
  Y("WY2b", "巷子西边的半面槽院", "banmian", Box(56, 69.75, 401.25, 421.75), F({ wall: "E", c: 419, w: 1.5, leaf: "closed" }), [Hs(Box(58, 68, 402, 407), 3.2), Hs(Box(56.5, 60.5, 409, 415.5), 3.0)]),
  // 富户：几院相连的大四合院（主街西边），门朝主街；08-1 之前这院没人
  Y("WM1", "主街西边的大四合院（富户）", "siheyuan", Box(72.25, 96.75, 401.25, 421.75), F({ wall: "E", c: 418.5, w: 1.5, leaf: "open" }), [Hs(Box(76, 92.6, 402, 407), 3.5), Hs(Box(72.75, 76.75, 409, 415.5), 3.0), Hs(Box(91.5, 95.5, 409, 415.5), 3.0), Hs(Box(78, 88, 417.5, 421.25), 3.0)], { tree: P(83, 410.5) }),
  // --- 巷子第二道弯以南到 L4 ---
  Y("WY3", "西边的排房院（塌了一角）", "paifang", Box(40, 62, 421.75, 445), F({ wall: "E", c: 443, w: 1.5, leaf: "closed" }), [Hs(Box(44, 60.5, 422.25, 427.25), 3.2)], { tree: P(48, 437) }),
  Y("WA1", "窄夹道东边的小排房院（两间）", "paifang", Box(64, 72.25, 424.25, 444), F({ wall: "W", c: 441.5, w: 1.2, leaf: "closed" }), [Hs(Box(65, 71.5, 425, 429.5), 3.0)]),
  Y("WY4", "西南的四合院", "siheyuan", Box(40, 62, 445, 467.5), F({ wall: "S", c: 61, w: 1.5, leaf: "closed" }), [Hs(Box(46, 56, 445.5, 450.5), 3.2), Hs(Box(40.5, 44.5, 452.5, 459), 3.0), Hs(Box(57.5, 61.5, 452.5, 459), 3.0), Hs(Box(46, 56, 463, 467), 3.0)], { tree: P(50.5, 456) }),
  Y("WM2", "主街西边的排房院（塌了一角）", "paifang", Box(72.25, 96.75, 421.75, 444), F({ wall: "E", c: 442.5, w: 1.5, leaf: "closed" }), [Hs(Box(76, 92.6, 422.25, 427.25), 3.2)], { tree: P(84, 433) }),
  Y("WM3", "路口西北角的半面槽院", "banmian", Box(84, 96.75, 444, 467.5), F({ wall: "S", c: 86, w: 1.5, leaf: "closed" }), [Hs(Box(85.5, 95.5, 444.5, 449.5), 3.2), Hs(Box(84.5, 88.5, 452, 458.5), 3.0)], { notch: Box(92, 96.75, 458, 467.5) }),   // 东南角被丁字路口切掉
  // --- 主街东边 ---
  Y("EM1", "主街东边最北那院（半面槽）", "banmian", Box(103.25, 118.25, 385, 410), F({ wall: "W", c: 408.5, w: 1.5, leaf: "closed" }), [Hs(Box(106, 116, 385.5, 390.5), 3.2), Hs(Box(113.75, 117.75, 395, 401.5), 3.0)], { backGate: F({ wall: "N", c: 110, w: 1.5, leaf: "open" }) }),   // 北墙朝路沟的后门：08-1 两个村民下沟
  Y("EM2", "主街东边中间那院（排房）", "paifang", Box(103.25, 118.25, 410, 435), F({ wall: "W", c: 432.5, w: 1.5, leaf: "open" }), [Hs(Box(106, 116, 411, 416), 3.2)], { tree: P(110, 425) }),   // 08-1 两个村民从这门冲上主街
  Y("EM3", "路口东北角那院（北边院子链的末站）", "banmian", Box(103.25, 118.25, 435, 463), F({ wall: "S", at: 458, c: 106.5, w: 1.5, leaf: "breakable" }), [Hs(Box(106, 116, 435.5, 440.5), 3.2), Hs(Box(114, 118, 443, 449.5), 3.0)], { notch: Box(103.25, 110, 458, 463) }),   // 西南角被路口切掉；院门在缺角的北墙 z 458 上
  // --- 东街北侧 ---
  Y("EN1", "东街北侧第一个院（院子链）", "siheyuan", Box(118.25, 150, 440, 463), F({ wall: "S", c: 146.5, w: 1.5, leaf: "open" }), [Hs(Box(126, 142, 440.5, 445.5), 3.2), Hs(Box(118.75, 122.75, 448, 454.5), 3.0), Hs(Box(144, 148, 448, 454.5), 3.0), Hs(Box(128, 138, 459, 463), 3.0)]),
  Y("FARM", "场院（打谷场）", "farmyard", Box(150, 178, 440, 463), null, [], { open: F({ fromX: 156, toX: 176 }) }),
  Y("EN3a", "东街中段北侧的排房院（塌了一角）", "paifang", Box(178, 196.25, 440, 456), F({ wall: "S", c: 194, w: 1.5, leaf: "open" }), [Hs(Box(181, 191, 440.5, 445.5), 3.2)]),
  Y("EN3b", "东街中段北侧的半面槽院", "banmian", Box(198.25, 216, 440, 456), F({ wall: "S", c: 200.5, w: 1.5, leaf: "open" }), [Hs(Box(203, 213, 440.5, 445.5), 3.2), Hs(Box(211.5, 215.5, 448, 454.5), 3.0)]),
  Y("EN4", "东街东头北侧的院子", "banmian", Box(216, 232, 440, 463), F({ wall: "S", c: 218.5, w: 1.5, leaf: "closed" }), [Hs(Box(219, 229, 440.5, 445.5), 3.2), Hs(Box(227.5, 231.5, 448, 454.5), 3.0)], { tree: P(224, 457) }),
  // --- 东街南侧：北屋后墙对着街（ES2 / ES3 的北屋空心，后墙上有豁口）；院门开在后头那条错两道的小巷上 ---
  Y("ES1", "东街南侧第一个院", "siheyuan", Box(110, 134, 467, 494), F({ wall: "S", c: 131.5, w: 1.5, leaf: "closed" }), [Hs(Box(114, 124, 469, 474), 3.2), Hs(Box(110.5, 114.5, 477, 483.5), 3.0), Hs(Box(129.5, 133.5, 477, 483.5), 3.0), Hs(Box(116, 126, 489.5, 493.5), 3.0)]),
  Y("ES2", "东街南侧第二个院（后墙豁口）", "banmian", Box(134, 160, 467, 494), F({ wall: "S", c: 136.5, w: 1.5, leaf: "closed" }), [{ id: "ES2", box: Box(140, 150, 467, 472), h: 3.2, hollow: true, street: true, loopholes: F([F({ x: 142, h: 1.1 })]), breach: F({ x: 148, w: 1.2, sillH: 0.5 }) }, Hs(Box(155.5, 159.5, 476, 482.5), 3.0)]),
  Y("ES3", "东街南侧第三个院（后墙豁口，土地庙贴在墙外）", "banmian", Box(160, 182, 467, 499), F({ wall: "S", c: 179.5, w: 1.5, leaf: "closed" }), [{ id: "ES3", box: Box(164, 174, 467, 472), h: 3.2, hollow: true, street: true, breach: F({ x: 168.5, w: 1.2, sillH: 0.5 }) }, Hs(Box(160.5, 164.5, 476, 482.5), 3.0)], { tree: P(172, 490) }),
  Y("ES4", "东街中段南侧的四合院（富户，后头带跨院）", "siheyuan", Box(182, 212, 460, 477), F({ wall: "N", c: 184.5, w: 1.5, leaf: "closed" }), [Hs(Box(190, 200, 461, 466), 3.2), Hs(Box(182.5, 186.5, 468.5, 475), 3.0), Hs(Box(207.5, 211.5, 468.5, 475), 3.0), Hs(Box(192, 202, 473, 477), 3.0)]),
  Y("ES4b", "富户后头的跨院（菜园）", "garden", Box(182, 212, 477, 494), null, [], { fences: F(["S"]), tree: P(196, 486) }),
  Y("ES5", "东街东头南侧的排房院", "paifang", Box(212, 232, 467, 494), F({ wall: "S", c: 213, w: 1.5, leaf: "closed" }), [Hs(Box(214, 230, 469, 474), 3.2)]),
  // --- 东北角：小巷拐着走，院子进深面宽各不一样，中间夹菜园、空宅基 ---
  Y("NE1", "东北角北排·一", "banmian", Box(118.25, 150, 388, 403.75), F({ wall: "S", c: 147.5, w: 1.5, leaf: "closed" }), [Hs(Box(126, 142, 388.5, 393.5), 3.2), Hs(Box(118.75, 122.75, 397, 403.5), 3.0)], { tree: P(135, 399) }),
  Y("NE1b", "东北角的空宅基", "garden", Box(118.25, 128, 403.75, 440), null, [], { tree: P(123, 420) }),
  Y("NE2a", "东北角北排·二（小院）", "banmian", Box(150, 162.5, 388, 403.75), F({ wall: "S", c: 152.5, w: 1.5, leaf: "closed" }), [Hs(Box(153, 159.6, 388.5, 393.5), 3.2), Hs(Box(150.5, 154.5, 397, 403.5), 3.0)]),
  Y("NE2b", "东北角北排·三（塌了一角）", "paifang", Box(162.5, 184, 388, 418.5), F({ wall: "S", c: 165, w: 1.5, leaf: "closed" }), [Hs(Box(166, 180, 388.5, 393.5), 3.2)], { tree: P(173, 408) }),
  Y("NE3", "东北角北排·菜园", "garden", Box(184, 214, 388, 414.75), null, [], { tree: P(198, 402) }),
  Y("NE4", "东北角北排·四", "banmian", Box(214, 232, 388, 414.75), F({ wall: "S", c: 215, w: 1.5, leaf: "closed" }), [Hs(Box(218, 228, 388.5, 393.5), 3.2), Hs(Box(214.5, 218.5, 397, 403.5), 3.0)]),
  Y("NE5", "东北角的大四合院（富户）", "siheyuan", Box(128, 160, 406.25, 428), F({ wall: "N", c: 130.5, w: 1.5, leaf: "closed" }), [Hs(Box(136, 152, 406.75, 411.75), 3.5), Hs(Box(128.5, 132.5, 413.5, 420), 3.0), Hs(Box(155.5, 159.5, 413.5, 420), 3.0), Hs(Box(139, 149, 423.5, 427.5), 3.0)], { tree: P(144, 421.5) }),
  Y("NE5b", "富户后头的空宅基", "garden", Box(128, 160, 428, 440), null, [], { tree: P(150, 434) }),
  Y("NE6a", "东北角南排·一（塌了一角）", "paifang", Box(162.5, 182, 421.5, 440), F({ wall: "N", c: 179.5, w: 1.5, leaf: "closed" }), [Hs(Box(165, 175, 422, 427), 3.2)], { tree: P(170, 433) }),
  Y("NE6b", "东北角南排·二", "banmian", Box(182, 196.25, 421.5, 440), F({ wall: "N", c: 194, w: 1.5, leaf: "closed" }), [Hs(Box(184, 194, 422, 427), 3.2), Hs(Box(182.5, 186.5, 429, 435.5), 3.0)]),
  Y("NE7", "东北角南排·三", "banmian", Box(198.25, 216, 417.25, 440), F({ wall: "N", c: 200.5, w: 1.5, leaf: "closed" }), [Hs(Box(201.5, 211.5, 417.75, 422.75), 3.2), Hs(Box(211.5, 215.5, 426, 432.5), 3.0)]),
  Y("NE8", "东北角南排·四", "paifang", Box(216, 232, 417.25, 440), F({ wall: "N", c: 229, w: 1.5, leaf: "closed" }), [Hs(Box(219, 229, 417.75, 422.75), 3.2)], { tree: P(224, 432) }),
  // --- L4 以南、村南小巷以北（西半边） ---
  Y("WY5", "西边的半面槽院", "banmian", Box(40, 56, 470, 494), F({ wall: "N", c: 53, w: 1.5, leaf: "closed" }), [Hs(Box(43, 53, 472, 477), 3.2), Hs(Box(40.5, 44.5, 480, 486.5), 3.0)], { tree: P(50, 488) }),
  Y("GW", "本家院西边的菜园", "garden", Box(56, 74, 470, 492), null, [], { fences: F(["N", "E"]), tree: P(60, 480) }),   // 北边 / 东边是矮篱（从 L4 / 夹道能进）
  Y("WD1", "老耿家南边的排房院", "paifang", Box(92, 108, 486, 496), F({ wall: "E", c: 494.5, w: 1.2, leaf: "closed" }), [Hs(Box(95, 105, 486.5, 491), 3.2)]),
  // 窄胡同西边那院：它的东墙 z 503…507 随 LaneWallCollapse 倒进胡同
  Y("WD2", "窄胡同西边的半面槽院（塌墙那院）", "banmian", Box(92, 112, 496, 520), F({ wall: "N", c: 111.0, w: 1.5, leaf: "closed" }), [Hs(Box(96, 106, 496.5, 501.5), 3.2), Hs(Box(92.5, 96.5, 504, 510.5), 3.0)], { tree: P(101, 509) }),
  Y("SB1", "本家院南边的四合院", "siheyuan", Box(76, 92, 492, 520), F({ wall: "N", c: 90, w: 1.5, leaf: "closed" }), [Hs(Box(79, 89, 492.5, 497.5), 3.2), Hs(Box(76.5, 80.5, 500, 506.5), 3.0), Hs(Box(87.5, 91.5, 500, 506.5), 3.0), Hs(Box(79, 89, 515.5, 519.5), 3.0)]),
  Y("WY6", "菜园南边的排房院", "paifang", Box(56, 76, 492, 512), F({ wall: "N", c: 58, w: 1.5, leaf: "closed" }), [Hs(Box(59, 72.5, 493, 498), 3.2)], { fences: F(["W"]) }),
  Y("POND", "取土坑（积水）", "pond", Box(40, 56, 494, 520), null, [], { fences: F(["E"]), pond: F({ x: 50.5, z: 505, w: 7, d: 10, depth: L0610_HEIGHTS.pondDepth, waterH: 0.7 }), tree: P(44, 515.5) }),
  // 翻墙绕过塌墙的那个院子（院门在西南角接回窄胡同更南的一段）
  Y("DY", "窄胡同东边的院子（翻墙绕路）", "banmian", Box(114.5, 130, 496, 520), F({ wall: "W", c: 518, w: 1.2, leaf: "open" }), [Hs(Box(117, 127, 496.25, 501), 3.2), Hs(Box(125.5, 129.5, 505, 511.5), 3.0)], { tree: P(120, 514) }),
  // --- 村南西半边：小巷拐三道 ---
  Y("SW2c", "村南小巷北边的排房院", "paifang", Box(56, 76, 512, 529), F({ wall: "S", c: 74, w: 1.5, leaf: "closed" }), [Hs(Box(59, 69, 512.5, 517.5), 3.2)], { tree: P(66, 524) }),
  Y("SW2b", "本家院后头的小排房院", "paifang", Box(76, 92, 520, 529), F({ wall: "S", c: 90, w: 1.5, leaf: "closed" }), [Hs(Box(79, 89, 520.5, 525.5), 3.2)]),
  Y("SW1", "村南西头的半面槽院", "banmian", Box(40, 64, 522, 535), F({ wall: "S", c: 62, w: 1.5, leaf: "closed" }), [Hs(Box(44, 54, 522.5, 527.5), 3.2), Hs(Box(55.5, 59.5, 528.5, 535), 3.0)]),
  Y("SW1b", "村南西头的菜园", "garden", Box(40, 64, 537, 545), null, [], { fences: F(["N"]), tree: P(52, 541) }),
  Y("SW2", "村南的半面槽院", "banmian", Box(66, 92, 531, 545), F({ wall: "N", c: 88, w: 1.5, leaf: "closed" }), [Hs(Box(72, 82, 531.5, 536.5), 3.2), Hs(Box(66.5, 70.5, 538, 544.5), 3.0)], { tree: P(80, 540) }),
  Y("SW3", "村南口西边的半面槽院", "banmian", Box(94, 116, 522, 545), F({ wall: "N", c: 96.5, w: 1.5, leaf: "closed" }), [Hs(Box(99, 109, 523, 528), 3.2), Hs(Box(94.5, 98.5, 531, 537.5), 3.0)]),
  // --- 村东南：后头的小巷错两道、南北一条死胡同、村南小巷错一道；夹菜园、空宅基 ---
  Y("SE2", "村南东排·一", "siheyuan", Box(130, 150, 496, 524), F({ wall: "N", c: 132.5, w: 1.5, leaf: "closed" }), [Hs(Box(135, 145, 496.5, 501.5), 3.2), Hs(Box(130.5, 134.5, 504, 510.5), 3.0), Hs(Box(145.5, 149.5, 504, 510.5), 3.0), Hs(Box(135, 145, 519.5, 523.5), 3.0)], { tree: P(140, 513) }),
  Y("SE3", "村南东排·二（塌了一角）", "paifang", Box(152, 170, 501, 516), F({ wall: "N", c: 154.5, w: 1.5, leaf: "closed" }), [Hs(Box(155, 165, 501.5, 506.5), 3.2)]),
  Y("SE3b", "村南东排·三", "banmian", Box(170, 186, 501, 516), F({ wall: "N", c: 183.5, w: 1.5, leaf: "closed" }), [Hs(Box(173, 183, 501.5, 506.5), 3.2), Hs(Box(170.5, 174.5, 509, 515.5), 3.0)], { tree: P(179, 511) }),
  Y("SE4", "南北小巷西边的小排房院", "paifang", Box(188, 196, 496, 526), F({ wall: "E", c: 523, w: 1.5, leaf: "closed" }), [Hs(Box(189, 195.5, 496.5, 501.5), 3.2)], { tree: P(192, 515) }),
  Y("SE5", "南北小巷东边的半面槽院", "banmian", Box(198, 216, 496, 520), F({ wall: "W", c: 517, w: 1.5, leaf: "closed" }), [Hs(Box(201, 211, 496.5, 501.5), 3.2), Hs(Box(211.5, 215.5, 504, 510.5), 3.0)]),
  Y("SE5b", "村东南的空宅基", "garden", Box(216, 232, 496, 524), null, [], { tree: P(224, 510) }),
  Y("SE6a", "村南口东边的半面槽院", "banmian", Box(118, 134, 526, 545), F({ wall: "N", c: 131.5, w: 1.5, leaf: "closed" }), [Hs(Box(121, 131, 526.5, 531.5), 3.2), Hs(Box(118.5, 122.5, 534, 540.5), 3.0)]),
  Y("SE6b", "村南东排的排房院", "paifang", Box(134, 152, 526, 545), F({ wall: "N", c: 149, w: 1.5, leaf: "closed" }), [Hs(Box(137, 147, 527, 532), 3.2)]),
  Y("SE7", "村南的菜园空地", "garden", Box(152, 182, 518, 545), null, [], { fences: F(["N"]), tree: P(166, 533), tree2: P(173, 539) }),
  Y("SE8", "南北小巷西边的半面槽院", "banmian", Box(182, 196, 526, 545), F({ wall: "E", c: 541, w: 1.5, leaf: "closed" }), [Hs(Box(184, 194, 526.5, 531.5), 3.2), Hs(Box(182.5, 186.5, 535, 541.5), 3.0)]),
  Y("SE9", "南北小巷东边的排房院", "paifang", Box(198, 216, 520, 545), F({ wall: "W", c: 541, w: 1.5, leaf: "closed" }), [Hs(Box(201, 211, 521, 526), 3.2)], { tree: P(206, 534) }),
  Y("SE9b", "村东南角的菜园", "garden", Box(216, 232, 524, 545), null, [], { tree: P(224, 536) }),
]);

/** 塌了一角的房子（院子里的某座房 + 塌下来的墙角）：按 L0610_YARDS 里房子的 id（第 i 座房的 id 是 `House_<院 id>_<i+1>`）。 */
export const L0610_COLLAPSED_HOUSES = F(["House_WM2_1", "House_EN3a_1", "House_NE6a_1", "House_WY3_1", "House_NE2b_1", "House_SE3_1"]);   // 07 末远看「几处房顶冒烟」也是这几处

/** 倒在胡同里的一截墙（炮轰塌的，静态）：墙上缺一截、墙板横躺在胡同里、墙根一堆土；不把胡同全堵死（人还能从另一边挤过去）。side +1 = 胡同在墙的 +z / +x 那边。 */
export const L0610_FALLEN_WALLS = F([
  F({ id: "FallenWallNE", name: "东北角小巷里倒下的一截墙", axis: "x", fixed: 418.5, from: 173, to: 176, side: 1 }),
  F({ id: "FallenWallSE", name: "村南小巷东段倒下的一截墙", axis: "x", fixed: 516, from: 160, to: 163, side: 1 }),
  F({ id: "FallenWallSW", name: "村南小巷西段倒下的一截墙", axis: "x", fixed: 529, from: 84, to: 87, side: 1 }),
]);

// ---------------------------------------------------------------------------
// 瓦砾堆（炸塌的墙和房把岔路堵死）：实心、高 ≥ 1.6、几块错落的土坯块（生成器按 pieces 拆成 2–3 块，稍转一点）。
const Rubble = (id, name, x, z, w, d, h, ry, blocks) => F({ id, name, x, z, w, d, h, ry, blocks });
export const L0610_RUBBLE = F([
  Rubble("RubbleAlleyEast", "夹道脚下往主街那截：塌墙堵死", 83.6, 400, 3.2, 2.4, 1.7, 0.2, "alleyEastStub"),
  Rubble("RubbleAlleyWest", "巷子第一道弯往西：塌墙堵死", 67.4, 400, 3.6, 2.4, 1.8, -0.15, "alleyWestStub"),
  Rubble("RubbleL4West", "L4 往西：塌房堵死", 57.5, 468.75, 4.4, 2.6, 1.9, 0.1, "l4WestStub"),
  Rubble("RubbleSouthWest", "村南小巷往西：塌墙堵死", 109.6, 521, 4.4, 2.0, 1.7, 0.1, "southWestLane"),
  Rubble("RubbleSouthEast", "村南小巷往东：塌墙堵死", 120.8, 525, 4.6, 2.0, 1.7, -0.1, "southEastLane"),
  Rubble("RubbleEastSouth", "东街南边院子后头的小巷往东：塌房堵死", 117.6, 495, 4.6, 2.0, 1.7, 0.12, "eastSouthLane"),
]);

// ---------------------------------------------------------------------------
// 往南的窄胡同（丁字路口东南角 → 老耿家东墙外 → 三道弯 → 新村南口）。
const SL = L0610_STREETS;
export const L0610_SOUTH_LANE = F({
  name: "往南的窄胡同",
  line: Line([109, 470], [109, 495], [113.25, 495], [113.25, 521], [117, 521], [117, 545]),
  runs: F([SL.southLane1, SL.southLane2, SL.southLane3, SL.southLane4, SL.backLane]),
  // 炮轰时塌墙堵住胡同的点：WD2 的东墙 x 112、z 503…507 随 LaneWallCollapse 倒进胡同（墙板横在胡同里 + 瓦砾堆 1.7 高）
  collapse: F({ wallX: 112, fromZ: 503, toZ: 507, x: 113.25, z: 505, slab: F({ w: 2.0, d: 3.6, t: 0.25, ry: 0.08 }), rubble: F({ w: 1.8, d: 2.6, h: 1.7, ry: 0.3 }) }),
  // 柴垛（踩着翻墙的台阶）：胡同里靠东墙（DY 的西墙 x 114.5）墙根、塌墙北边
  climb: F({ pile: F({ x: 113.8, z: 501.3, w: 0.9, d: 1.8, h: 1.2 }), from: P(112.7, 501.3), to: P(115.3, 501.3), wallX: 114.5 }),   // from：柴垛西边站着起跳的点（胡同里还剩 0.8 m 能挤过去）
  detourYard: F({ id: "DY", gateIn: P(115.3, 501.3), gateOut: P(114.5, 518), inside: P(118.5, 513) }),   // 翻进去的落点 → 院门（西南角）出来接回胡同
  exit: P(117, 545),                                                     // 新村南口
});

// ---------------------------------------------------------------------------
// 班长那一路（2026-10-24，两路穿插）：大车后头 → 主街东边 z 432.5 那道敞着的院门（EM2 西墙）→ EM2 院子 → 踩柴垛翻 z 435 那道院墙（人梯）→ EM3 北屋西边那条 2.5 m 宽的空地 →
// 蹲在 EM3 南墙的院门（路口东北角 pocket 的北门 z 458、x 106.5，门扇随 EastGateBurst 倒）后头；门外就是墙角那伙鬼子。
// 全程在堂屋 / 东西两间三个枪眼和墙角哨的视线外：院门在大车的影子里，翻墙点在主街东墙（x 103.25）和 pocket 北墙（z 458）后头（KeyframesTest 逐帧核）。
const EM2 = L0610_YARDS.find((y) => y.id === "EM2"), EM3 = L0610_YARDS.find((y) => y.id === "EM3");
export const L0610_EAST_YARD_ROUTE = F({
  name: "班长那一路（穿主街东边两个院子到路口墙角侧后）",
  yards: F(["EM2", "EM3"]),
  gate: F({ x: EM2.box.minX, z: EM2.gate.c, w: EM2.gate.w }),             // EM2 西墙上敞着的院门 (103.25, 432.5)
  gateOut: P(102.3, EM2.gate.c),                                         // 门外（主街东沿，大车的影子里）
  gateIn: P(104.4, EM2.gate.c),                                          // 门里
  wallZ: EM3.box.minZ,                                                   // EM2 / EM3 之间那道院墙（z 435，墙中线）
  // 柴垛贴着 z 435 那道墙的北面（EM2 这边），from 是柴垛北边起跳的点、to 是翻过去落在 EM3 北屋西边空地上的点（墙另一边 1.4 m）
  climb: F({ pile: F({ x: 104.75, z: 434.2, w: 1.6, d: 1.1, h: 1.2 }), from: P(104.75, 432.95), to: P(104.75, 436.4), wallZ: EM3.box.minZ }),
  strip: Box(103.5, EM3.houses[0].box.minX, EM3.box.minZ, EM3.houses[0].box.maxZ),   // EM3 北屋（x 106…116）西边那条空地 x 103.5…106、z 435…440.5
  stripOut: P(104.8, EM3.houses[0].box.maxZ + 0.9),                      // 空地南头出来进院子
  pocketGate: F({ x: EM3.gate.c, z: EM3.notch.minZ, w: EM3.gate.w }),    // = L0610_EAST_STREET.northChain.pocketGate (106.5, 458)
  behindGate: F({ Luo: P(105.8, 456.5), HeYoutian: P(107.3, 456.6), Escort1: P(106.5, 455.1) }),   // 09-6 / 09-7 蹲在门后
  inPocket: F({ Luo: P(106.2, 460.3), HeYoutian: P(107.6, 461.8), Escort1: P(105.2, 461.6) }),      // 10-1 撞开门冲进 pocket 以后
  grenadeHits: F([P(107.4, 460.6), P(105.4, 461.4)]),                    // 09-7 两颗手榴弹的落点（pocket 里）
});

// ---------------------------------------------------------------------------
// 东街（10 守路口）：石碾在丁字路口东边、朝东；门洞 / 豁口 / 枪眼 / 庙 / 垛都在石碾往东的扇面里、远近错开。
const ROLLER = F({ name: "石碾", x: 113.2, z: 465.7, w: 1.2, d: 0.9, h: 0.9, baseW: 2.0, baseH: 0.12 });
export const L0610_EAST_STREET = F({
  line: Line([110, 465], [180, 465], [180, 458], [214, 458], [214, 465], [232, 465]),
  runs: F([SL.east, SL.eastJog1, SL.east2, SL.eastJog2, SL.east3]),
  roller: ROLLER,
  fanDeg: 40, nearM: 20, farM: 90,                                      // 探头点要在石碾往东 ±40°、20…90 m
  solidFlankM: 8,                                                        // 石碾北、南 8 m 内是实墙（没门没窗）
  // 探头点：kind door（门洞，日军小组冲出来试探）/ loophole（枪眼）/ breach（豁口）/ shrine / stack；yawDeg 是从那里朝街上看的方向
  // 枪眼 0.5 m 厚的墙上 0.3 m 的洞只能朝正面 ±30° 打，东街南墙上的枪眼顺着街打不到石碾；所以对着石碾打的枪眼开在第一道弯的那道正面墙上（x 182，正对着街口）；
  // 南侧两座后墙对街的北屋留的是豁口（炸开的，人能探出来）与一个朝北打对面门洞的枪眼（dressing，不算探头点）。hidden：过了弯、石碾看不见，鬼子从那里冒出来。
  probes: F([
    F({ id: "EN1Gate", kind: "door", x: 146.5, z: 463, yawDeg: 180, note: "东街北侧第一个院的院门" }),
    F({ id: "ES2Breach", kind: "breach", x: 148, z: 467, yawDeg: 0, note: "南侧第二个院北屋后墙炸开的豁口" }),
    F({ id: "FarmOpen", kind: "door", x: 166, z: 463, yawDeg: 180, note: "场院敞着的南边（麦秸垛在后头）" }),
    F({ id: "ES3Breach", kind: "breach", x: 168.5, z: 467, yawDeg: 0, note: "南侧第三个院北屋后墙炸开的豁口（土地庙东边）" }),
    F({ id: "Shrine", kind: "shrine", x: 171, z: 466.4, yawDeg: 90, note: "土地庙（轻机枪缩在它东北边）" }),
    F({ id: "JogLoophole1", kind: "loophole", x: 182, z: 463.9, h: 1.1, yawDeg: 90, note: "第一道弯正面墙上凿的枪眼（正对着街口打）" }),
    F({ id: "JogLoophole2", kind: "loophole", x: 182, z: 465.0, h: 1.1, yawDeg: 90, note: "第一道弯正面墙上凿的枪眼" }),
    F({ id: "EN3aGate", kind: "door", x: 194, z: 456, yawDeg: 180, hidden: true, note: "东街中段北侧的院门（过了第一道弯，石碾看不见）" }),
    F({ id: "EN3bGate", kind: "door", x: 200.5, z: 456, yawDeg: 180, hidden: true, note: "东街中段北侧的院门（过了第一道弯）" }),
  ]),
  jogLoopholes: F([F({ x: 182, z: 463.9, h: 1.1 }), F({ x: 182, z: 465.0, h: 1.1 })]),   // 开在 ES4 西墙（第一道弯东侧那道正面墙）上
  shrine: F({ name: "土地庙", x: 171, z: 466.4, w: 1.6, d: 1.2, h: 1.8, wallT: 0.15 }),
  strawStack: F({ name: "麦秸垛", x: 164, z: 452, w: 4.2, d: 4.0, h: 3.0 }),
  mortarHide: P(164.2, 455.4),                                           // 掷弹筒组躲在麦秸垛北侧
  mgHide: P(172.8, 465.3),                                               // 轻机枪缩在土地庙东北边（庙挡不住它打石碾那条线）
  farmyard: F({ name: "场院（打谷场）", minX: 150, maxX: 178, openFromX: 156, openToX: 176 }),
  // 北边抄后路的院子链：场院西隔墙的门 → 北侧第一个院西墙的门 → 路口东北角那院南墙的院门（石碾西北背后）；三道门扇随 NorthYardGatesBroken 倒下
  northChain: F({
    farmyardDoor: F({ x: 150, z: 450, w: 1.5 }),
    yard1Door: F({ x: 118.25, z: 455, w: 1.5 }),
    pocketGate: F({ x: 106.5, z: 458, w: 1.5 }),
  }),
  southClimb: P(126, 494),                                               // 10-5 南边翻墙摸过来的地方（ES1 的南墙）
  fieldEast: P(245, 465),
  eastEnd: P(232, 465),
});

/** 旧名字：东街两侧的院子（Keyframes / Previz 还 import EY.north / south / farmyard / strawStack / shrine / northChain / mortarHide / southClimb / fieldEast）。 */
export const L0610_EAST_YARDS = F({
  north: F({ box: Box(118.25, 232, 440, 463), splitsX: F([150, 178, 196.25, 216]), gatesX: F([146.5, 194, 200.5, 218.5]) }),
  south: F({ box: Box(110, 232, 467, 499), splitsX: F([134, 160, 182, 212]), gatesX: F([]) }),
  farmyard: L0610_EAST_STREET.farmyard,
  strawStack: L0610_EAST_STREET.strawStack,
  mortarHide: L0610_EAST_STREET.mortarHide,
  shrine: L0610_EAST_STREET.shrine,
  northChain: L0610_EAST_STREET.northChain,
  southClimb: L0610_EAST_STREET.southClimb,
  fieldEast: L0610_EAST_STREET.fieldEast,
});

/** 旧名字：主街两侧的院子（Keyframes 还 import SY.westOfMain / eastOfMain；1218 的 Space import southWest / southEast）。 */
export const L0610_STREET_YARDS = F({
  westOfMain: F({ box: Box(72.25, 96.75, 401.25, 444), splitsZ: F([421.75]), gatesZ: F([418.5, 442.5]), alleyBackGateZ: null }),
  eastOfMain: F({ box: Box(103.25, 118.25, 385, 458), splitsZ: F([410, 435]), gatesZ: F([408.5, 432.5]), ditchBackGateX: 110 }),
  westOfAlley: F({ box: Box(40, 62, 385, 467.5) }),
  squareNorthWallZ: 458,
  southWest: F({ box: Box(40, 116, 512, 545) }),
  southEast: F({ box: Box(118, 232, 496, 545) }),
  villageSouthZ: 545,
});

/** 旧名字：第五版补的院子（现在都在 L0610_YARDS 里重摆了；留着给旧测试 / 文档引用范围）。 */
export const L0610_FILL_YARDS = F({
  southWest: F({ box: Box(40, 60, 492, 545) }),
  northEast: F({ box: Box(118.25, 232, 388, 440) }),
  southEast: F({ box: Box(135, 232, 490, 545) }),
});

// ---------------------------------------------------------------------------
// 顺子和妮儿那条唯一的路：巷子口 → 老耿家灶屋门口（按段标 seg）。
export const L0610_ROUTE = F({
  segments: F([
    F({ seg: "alley", name: "巷子口下到夹道、拐四道弯到街坊家西墙外", line: Line([80, 384], [80, 400], [71, 400], [71, 423], [63, 423], [63, 448]) }),
    F({ seg: "glimpse", name: "沿窄夹道到 L4、在街坊家半掩的门口瞥见院里", line: Line([63, 448], [63, 468.75], [66.5, 468.75]) }),
    F({ seg: "breach", name: "回头从西配房塌掉的西北角钻进去", line: Line([66.5, 468.75], [63, 468.75], [63, 450], [65.2, 450], [66.6, 451.6]) }),
    F({ seg: "passage", name: "出西南角院门、L4 往西几步、南北夹道往南", line: Line([66.6, 451.6], [66.6, 455], [68.8, 455], [68.8, 466.3], [66.5, 466.3], [66.5, 468.75], [75, 468.75], [75, 491], [78.5, 491]) }),
    F({ seg: "benjia", name: "本家院：院门进、穿院子到共用墙的便门", line: Line([78.5, 491], [78.5, 488.4], [84.5, 484.6], [90.7, 484.6]) }),
    F({ seg: "dogHole", name: "狗洞（只有妮儿钻得过；大人走便门）", line: Line([90.7, 484.6], [90.7, 473], [93.3, 473]) }),
    F({ seg: "gengYard", name: "便门进老耿家院子，到灶屋门口", line: Line([90.7, 484.6], [93.3, 484.6], [97.2, 479.3]) }),
  ]),
  // 泛洪测试允许到的地方：路沿线的胡同 + L4（东头到路口）+ 这几个院子 / 空地
  allowedLanes: F(["alleyNorth", "alleyA2", "alleyA3", "alleyA4", "alleyA5", "l4", "l4WestStub", "alleyEastStub", "alleyWestStub", "passage", "passageEnd"]),
  allowedYards: F(["NAE", "WM1", "JIEFANG", "BENJIA", "GW", "GENG"]),   // GENG 只在 SideGateOpen 之后才到得了
});

// ---------------------------------------------------------------------------
/** 村里的日常摆件（占位体块）：kind 决定尺寸与颜色；位置是中心；ry 弧度。 */
export const L0610_PROP_KINDS = F({
  OverturnedCart: F({ w: 2.6, d: 1.6, h: 1.15, semantic: "timber", name: "翻倒的大车" }),
  CartWheel: F({ w: 0.7, d: 0.12, h: 0.7, semantic: "timber", name: "车轮" }),
  WaterVat: F({ w: 0.8, d: 0.8, h: 0.9, semantic: "plaster", name: "水缸" }),
  Haystack: F({ w: 2.2, d: 1.8, h: 1.5, semantic: "canvas", name: "柴垛" }),
  StrawStack: F({ w: 4.2, d: 4.0, h: 3.0, semantic: "canvas", name: "麦秸垛" }),
  ChickenCoop: F({ w: 0.9, d: 0.6, h: 0.7, semantic: "timber", name: "鸡笼" }),
  Millstone: F({ w: 1.3, d: 1.3, h: 0.5, semantic: "structure", name: "磨盘" }),
  DoorBoard: F({ w: 1.0, d: 0.18, h: 1.9, semantic: "timber", name: "靠墙的门板" }),
  StrawMat: F({ w: 1.2, d: 0.06, h: 1.8, semantic: "canvas", name: "草帘" }),
  Rubble: F({ w: 2.4, d: 2.0, h: 0.8, semantic: "earthDark", name: "塌下来的墙角" }),
  DungHeap: F({ w: 1.8, d: 1.4, h: 0.7, semantic: "earthDark", name: "粪堆" }),
  BloodStain: F({ w: 0.9, d: 0.6, h: 0.02, semantic: "danger", name: "血迹" }),
  Bandage: F({ w: 0.35, d: 0.25, h: 0.04, semantic: "plaster", name: "扔下的绷带" }),
  Canteen: F({ w: 0.18, d: 0.1, h: 0.22, semantic: "metal", name: "空水壶" }),
  AmmoBox: F({ w: 0.5, d: 0.34, h: 0.3, semantic: "timber", name: "弹药箱" }),
});
const Prop = (id, x, z, ry = 0) => F({ id, kind: id.split("_")[0], x, z, ry });
export const L0610_PROPS = F([
  // 06 干沟（集结处）：血迹、绷带、空水壶
  Prop("BloodStain_G1", 32.4, 149.6, 0.4), Prop("Bandage_G1", 33.3, 148.5, 1.2), Prop("Canteen_G1", 31.3, 147.9, 0.3),
  Prop("BloodStain_G2", 45.2, 151.2, -0.6), Prop("Bandage_G2", 44.1, 150.4, 0.2), Prop("BloodStain_G3", 24.6, 146.3, 1.1),
  // 主街：翻倒的大车（顺着街贴东墙，车厢朝北；街口趴着的四个人看堂屋枪眼的视线扇是 x 99.3…100.7，车在它东边）、水缸、门板、草帘
  Prop("OverturnedCart_S1", 102.2, 446, 1.5708), Prop("CartWheel_S1", 102.2, 446.6, 1.5708),
  Prop("WaterVat_S1", 102.5, 413.4), Prop("WaterVat_S2", 102.5, 455.6), Prop("DoorBoard_S1", 102.9, 428, 1.5708), Prop("StrawMat_S1", 102.9, 404, 1.5708),
  // 丁字路口
  Prop("WaterVat_Q1", 93.0, 459.4), Prop("DoorBoard_Q1", 109.6, 461.2, 1.5708),
  // 东街两侧院里
  Prop("StrawStack_F1", L0610_EAST_STREET.strawStack.x, L0610_EAST_STREET.strawStack.z, 0),
  Prop("Millstone_E1", 198, 485), Prop("ChickenCoop_E1", 176, 494), Prop("WaterVat_E1", 127, 486), Prop("WaterVat_E2", 206.6, 450.8),
  // 主街两侧、巷子两边的院里
  Prop("Haystack_W1", 80, 440, 0), Prop("ChickenCoop_W1", 74.5, 419), Prop("Millstone_W1", 116.5, 452), Prop("WaterVat_W1", 106, 395),
  // 班长那一路（10-24）：EM2 院里房前的水缸、EM3 北屋西边空地上的水缸（蹲着能藏人；翻墙的柴垛是 L0610_EAST_YARD_ROUTE.climb.pile，场景生成器单出）
  Prop("WaterVat_EM2", 108.4, 418.0), Prop("WaterVat_EM3", 104.1, 447.0),
  Prop("Haystack_W2", 56, 436, 0.1), Prop("WaterVat_W3", 66, 412),
  // 村南
  Prop("Haystack_B1", 86, 540, 0), Prop("WaterVat_B1", 124.6, 540.6), Prop("Haystack_B2", 100.6, 515.6, 0.2),
  // 空宅基 / 菜园边的粪堆
  Prop("DungHeap_1", 123, 432, 0.3), Prop("DungHeap_2", 222, 518, -0.2), Prop("DungHeap_3", 46, 541, 0.5), Prop("DungHeap_4", 206, 404, 0.1), Prop("DungHeap_5", 160, 541, -0.4),
]);

/** 零散种的树（房前屋后，不成排）：从各院的 tree 收集，再加几棵胡同边、水坑边的。h 树高。 */
export const L0610_TREES = F([
  ...L0610_YARDS.flatMap((y) => [y.tree, y.tree2].filter(Boolean).map((t) => ({ x: t.x, z: t.z, h: 6.0, yard: y.id }))),
  { x: L0610_GENG.yard.pomegranate.x, z: L0610_GENG.yard.pomegranate.z, h: 3.0, yard: "GENG", kind: "pomegranate" },
  { x: L0610_JIEFANG.tree.x, z: L0610_JIEFANG.tree.z, h: 3.2, yard: "JIEFANG", kind: "pomegranate" },
  { x: L0610_BENJIA.tree.x, z: L0610_BENJIA.tree.z, h: 3.2, yard: "BENJIA", kind: "pomegranate" },
].map((t) => F({ h: 6.0, kind: "paulownia", ...t })));

/** 场景信号（关键帧 signals 与场景文件 gates 共用的名字）。 */
export const L0610_SIGNALS = F({
  cartDeparted: "CartDeparted",                   // 06-3 起：老耿赶车走了，车上那几箱弹药（体块）跟着车走
  cellarBlast: "CellarBlast",                     // 09 起：街坊家窖里闷响一声，窖口冒烟、盖板飞开
  sideGateOpen: "SideGateOpen",                   // 09 起：本家院与老耿家共用墙上的便门从老耿家那边拔开门闩
  eastGateBurst: "EastGateBurst",                 // 09-7 起（10-24 两路）：班长三人从 EM3 院里撞开路口东北角那道院门（pocket 北门），门扇倒在 pocket 里
  mgSilenced: "MgSilenced",                       // 10-1 起：堂屋枪眼后的机枪组被从背后打掉；10-2 那挺枪出现在石碾后头
  northYardGatesBroken: "NorthYardGatesBroken",   // 10-3 起：北边院子链上另两道门（场院西隔墙、北侧第一个院西墙）被砸倒；pocket 北门 09-7 已被班长撞开
  barrageHit: "BarrageHit",                       // 10 末起：炮轰——老耿家北屋东间塌一块、石碾旁一堆新瓦砾（草顶着火用烟事件）
  laneWallCollapse: "LaneWallCollapse",           // 10 末起：窄胡同中段西墙倒进胡同，堵死；要踩柴垛翻进旁边院子绕
});

/** 有名字的地方。x/z 是中心或站点；yawDeg 是站在那里该朝的方向。 */
export const L0610_PLACES = F({
  assembly: L0105_PLACES.assembly,
  assemblyEntry: L0105_PLACES.assemblyEntry,
  gullyRest: P(L0105_PLACES.donguaRest.x, L0105_PLACES.donguaRest.z),
  laneHead: L0105_PLACES.laneHead,
  cartStop: F({ name: "老耿的驴车（南岸树底下）", x: 54.5, z: 155, yawDeg: -90 }),
  nierRim: F({ name: "妮儿捡弹壳的沟沿", x: 58.5, z: 160.6 }),
  villageMouth: F({ name: "村北口（街口坡道顶）", x: 100, z: 385 }),
  laneEnd: F({ name: "凹路尽头（接进路沟）", x: 100, z: 376 }),
  ditch: F({ name: "村口路沟", x: 100, z: L0610_DITCH.z }),
  ditchEast: F({ name: "路沟东半截（后送队）", x: 114, z: L0610_DITCH.z }),
  ditchWest: F({ name: "路沟西半截", x: 88, z: L0610_DITCH.z }),
  alleyMouth: F({ name: "巷子口", x: L0610_STREETS.alleyNorth.c, z: 384 }),
  square: F({ name: "丁字路口", x: 101, z: 464 }),
  pocket: F({ name: "路口东北角（石碾西北背后）", x: 106.5, z: 460.5 }),
  roller: ROLLER,
  cart: F({ name: "翻倒的大车", x: 102.2, z: 446 }),
  eastEnd: F({ name: "东街东头", x: 232, z: 465 }),
  eastJog1: F({ name: "东街第一道弯", x: 180, z: 461.5 }),
  eastJog2: F({ name: "东街第二道弯", x: 214, z: 461.5 }),
  river: F({ name: "河汊子", x: L0610_RIVER.centerX, z: 400 }),
  alleyBackGate: F({ name: "夹道东边院子朝夹道的门（08-1 村民钻巷子）", x: 81.25, z: 396 }),
  ditchBackGate: F({ name: "主街东边院子朝路沟的后门", x: 110, z: 385 }),
  mainEastGate: F({ name: "主街东边朝街开的院门（村民冲出来；班长钻进去）", x: 103.25, z: 432.5 }),
  eastClimb: F({ name: "班长那一路翻墙的柴垛", x: 104.75, z: 434.2 }),
  pocketGate: F({ name: "路口东北角那院的南门（班长蹲门后）", x: 106.5, z: 458 }),
  eastRoadView: F({ name: "东北进庄的道（看得见的那一段）", x: 272, z: 388 }),
  l4Mouth: F({ name: "L4 东头（接丁字路口）", x: 92, z: 468.75 }),
  jiefangGate: F({ name: "街坊家院门（半掩）", x: L0610_JIEFANG.gate.x, z: L0610_JIEFANG.gate.z }),
  jiefangBreach: F({ name: "街坊家西配房塌掉的西北角（豁口）", x: 64.2, z: 450 }),
  jiefangWindow: F({ name: "西配房朝院子的窗洞", x: 68, z: L0610_JIEFANG.westWing.window.z }),
  jiefangVat: F({ name: "西配房里的大缸", x: L0610_JIEFANG.westWing.vat.x, z: L0610_JIEFANG.westWing.vat.z }),
  jiefangBeiwuDoor: F({ name: "街坊家堂屋门", x: L0610_JIEFANG.beiwu.door.x, z: L0610_JIEFANG.beiwu.box.maxZ }),
  cellar: F({ name: "地瓜窖（街坊家）", x: L0610_JIEFANG.cellar.x, z: L0610_JIEFANG.cellar.z }),
  mill: F({ name: "石磨（绑着老汉）", x: L0610_JIEFANG.mill.x, z: L0610_JIEFANG.mill.z }),
  neighborDoor: F({ name: "本家院的院门（敞着）", x: L0610_BENJIA.gate.x, z: L0610_BENJIA.gate.z }),
  benjiaGate: F({ name: "本家院的院门（敞着）", x: L0610_BENJIA.gate.x, z: L0610_BENJIA.gate.z }),
  dogHole: F({ name: "狗洞", x: 92, z: L0610_GENG.dogHole.z }),
  sideGate: F({ name: "便门", x: 92, z: L0610_GENG.sideGate.z }),
  kitchenDoor: F({ name: "灶屋门", x: 96, z: L0610_GENG.zaowu.door.z }),
  tangwuDoor: F({ name: "堂屋门", x: 100, z: 475 }),
  northWindow: F({ name: "堂屋枪眼（机枪，原北窗）", x: 100, z: 470 }),
  gengGate: F({ name: "老耿家院门（东墙）", x: 108, z: 483.5 }),
  gatePassage: F({ name: "老耿家院门里", x: 106.6, z: 483.5 }),
  villageSouth: F({ name: "村南口", x: 117, z: 545 }),
  laneCollapse: F({ name: "窄胡同塌墙处", x: 113.25, z: 505 }),
  climbPile: F({ name: "翻墙的柴垛", x: 113.8, z: 501.3 }),
  detourGate: F({ name: "绕路院子的院门", x: 114.5, z: 518 }),
  farmyard: F({ name: "场院", x: 166, z: 455 }),
  strawStack: F({ name: "麦秸垛", x: L0610_EAST_STREET.strawStack.x, z: L0610_EAST_STREET.strawStack.z }),
  shrine: F({ name: "土地庙", x: L0610_EAST_STREET.shrine.x, z: L0610_EAST_STREET.shrine.z }),
  southClimb: F({ name: "南边翻墙处", x: L0610_EAST_STREET.southClimb.x, z: L0610_EAST_STREET.southClimb.z }),
  mortarHide: L0610_EAST_STREET.mortarHide,
  mgHide: L0610_EAST_STREET.mgHide,
  fieldEast: L0610_EAST_STREET.fieldEast,
  pond: F({ name: "取土坑（积水）", x: 50.5, z: 505 }),
  bigLocust: F({ name: "村南口外的大槐树", x: 121.5, z: 548.5, h: 9 }),   // 10-6 班长喊「往那棵大槐树跑！过了槐树就是村口！」；在南墙外、村南口东南 4.5 m，不挡窄胡同出口和 1218 的出村小路
});

/** 08 趴在街口坡道上压枪眼的四个人（顺子在最西头、离巷子口最近）；场景生成器核视线、关键帧生成器摆人都用这几个点。 */
export const L0610_MOUTH_SHOOTERS = F([
  F({ who: "player", x: 97.4, z: 384.3 }),
  F({ who: "Yaowa", x: 99.5, z: 384.4 }),
  F({ who: "Squad3", x: 101.1, z: 384.5 }),
  F({ who: "LiuWencai", x: 102.6, z: 384.2 }),
]);

/** 出生点：06-1 交通沟坡道下到干沟。 */
export const L0610_SPAWN = F({ x: 35, z: 147, yawDeg: -90 });

/** 凹路上按 z 取中线上的点（折线在 z 上单调；给 lat 往行进方向左手边偏）。 */
export function LanePointAtZ(z, lat = 0) {
  const line = L0610_LANE.line;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (b.z !== a.z && (z - a.z) * (z - b.z) <= 0 && b.z > a.z) return PointBeside(line, walked + len * (z - a.z) / (b.z - a.z), lat);
    walked += len;
  }
  return PointBeside(line, LineLength(line), lat);
}

/** 一条折线上某点的弧长参数（最近点）。 */
export function Station(line, p) {
  let best = { d: 0, dist: Infinity }, walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len))) : 0;
    const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    const dist = Math.hypot(p.x - q.x, p.z - q.z);
    if (dist < best.dist) best = { d: walked + len * t, dist };
    walked += len;
  }
  return best.d;
}
