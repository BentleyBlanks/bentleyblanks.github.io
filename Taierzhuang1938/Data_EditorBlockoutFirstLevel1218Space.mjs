// ===========================================================================
// Data_EditorBlockoutFirstLevel1218Space.mjs —— 第一关 11–18 白盒（关卡键 FirstLevel1218）的空间锚点（2026-10-23 第二版）
//
// 唯一口径：集成负责人 2026-10-23 的《FirstLevel1218 白盒第二版契约》（用户 10-23 认的 11–14 五步大纲 + 细化稿，还没进 Notion）。
// 第一版（10-19：大路往西、排水沟、远处桥头院子、x −150 的浮桥）整体作废，按契约重摆：
//   村南口 → 贴庄子南墙根往西的小路 → 河汊子上的石板桥 → 河滩 → 北沙河北岸的渡口（接收院 / 浮桥 / 兵站的土台子）→ 过浮桥 → 南岸往北门。
// 坐标与 FirstLevel0105 / FirstLevel0610 同一套：原点 = 01–05 的沟口；X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南。
// z < 556 的地面与体块原样用 0610 第六版的（seamZ 556 不变，不抄数字，从 0610 导出量取）。
//
// 场景生成器（Script_EditorBlockoutFirstLevel1218Scene.mjs）按这里烘地形与体块，
// 关键帧生成器（Script_EditorBlockoutFirstLevel1218Keyframes.mjs）按这里摆人、POI 与机位。都只读本表；要挪地方先改这里，再重跑生成器。
// 纯数据：零 three、零 DOM，node 与浏览器共用。
//
// 与契约建议值不一样的地方（都是摆不下 / 接不上 / 运行时限制才改的，报告里也列了）：
//   · 石板桥桥面顶 0.35（两头各压平一块桥台到同一高度，桥面与两岸齐平）。演员只能站在比脚下高度场高 ≤ 1 m 的块顶上（BlockStandSampler），
//     桥面比沟底 −2.7 高 3 m 站不上去，所以桥下垫一道石滩（沟底抬到 −0.62，桥面高它 0.97），石滩上盖 0.2 m 深的一汪水（BridgeWater，水面 −0.42）：
//     桥下还是水，人也站得上桥。两个石墩就立在石滩上。
//   · 石板桥两头 z 559…573 这一段两岸不堆土埂（桥台要平；0610 的土埂在接缝 z 556 处原样接上，558 起才淡出）。
//   · 14「河堤底下」：北堤北脚河滩上挖一道低洼（trough，x 7…27、z 624.5…632，底 −0.5，比河滩低 0.9）：机枪位在东北方向、高 1.7，
//     趴在平河滩上挡不住它（契约「北堤北坡脚趴着的人机枪看不见」只有人比河滩低才成立），低洼的北沿正好挡住；翻车处到它 16 m。
//   · 鬼子机枪位：SW1 院子西南角连院墙带村西边墙 / 村南边墙一起塌（0610 的 VillageWestEdge_1 / VillageSouthEdge_1 / Wall_x535_1 /
//     Wall_z44_1 / Fence_SW1b_N 在 1218 场景里不带，换成缺了角的几截 + 瓦砾堆）：只塌 SW1 南墙一截的话，村西边墙（x 40、2.2 高）还把石板桥和河滩全挡住。
//     机枪架在 0.9 高的瓦砾堆上（块顶 ≤ 1 m 站得上），趴着眼高 1.7，越过河汊子看得见石板桥西头（34 m）和渡口人堆（100 m），看不见低洼里趴着的人。
//   · 18 最后一拨人躲的土坎：南北向、x −1.2…1.2、z 578…588、顶 1.7，石板桥西头趴着的机枪看不见坎西边蹲着的人，往渡口一走（z 596）就看得见。
//   · 远处铁路桥按契约挪到东边（x 140，北沙河上）；北门随浮桥挪到 x −8。bounds 缩到 x −130…150、z 480…895。
// ===========================================================================

import { L0610_VILLAGE, L0610_GENG, L0610_STREETS, L0610_RIVER, L0610_PLACES, L0610_YARDS, L0610_SOUTH_LANE } from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

export const L1218_LEVEL_KEY = "FirstLevel1218";
export const L1218_TITLE = "第一关 11–18 · 石板桥与渡口（新剧本白盒）";
export const L1218_VERSION = "2026-10-23 第二版空间（契约：墙根小路 → 石板桥 → 河滩 → 渡口；河汊子直通北沙河；庄子西南角豁子上的机枪；河堤底下的低洼）";

/** 场地范围与高度网格（0.5 m 一格，与 0105 / 0610 一样）。北边只要村南那一截当背景。 */
export const L1218_BOUNDS = Object.freeze({ minX: -130, maxX: 150, minZ: 480, maxZ: 895 });
export const L1218_CELL_M = 0.5;

const P = (x, z) => Object.freeze({ x, z });
const Line = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));
const Box = (minX, maxX, minZ, maxZ) => Object.freeze({ minX, maxX, minZ, maxZ });
const F = Object.freeze;

/** 从 0610 借来的东西（原样引用，不抄）。 */
export const L1218_FROM_0610 = F({
  village: L0610_VILLAGE,             // 整村压平 +0.3、fadeM；box 到 z 548
  geng: L0610_GENG,                   // 老耿家（院子 x 92…108、z 470…486；12-3 回头看见冒烟的地方）
  southLane: L0610_SOUTH_LANE,        // 出村的窄胡同（到村南口 (117,545)）
  backLane: L0610_STREETS.backLane,   // 窄胡同最后一截 x 117、z 520.25…545
  river: L0610_RIVER,                 // 河汊子的横断面（中线 34.5、沟底宽 6、深 3、壁 2.5、岸上土埂 0.4×3、沟底积水 1.0）
  villageSouth: L0610_PLACES.villageSouth,
  sw1: L0610_YARDS.find((y) => y.id === "SW1"),     // 庄子西南角的半面槽院 x 40…64、z 522…535
  sw1b: L0610_YARDS.find((y) => y.id === "SW1b"),   // 它南边的菜园 x 40…64、z 537…545
});

/**
 * 地面怎么接：z < seamZ 的点一律用 0610 的 L0610Ground（村南、窄胡同、河汊子直段逐点一致）；
 * z ≥ seamZ 用本关的地面：平地 = 0105 的 NaturalHeight + plainY（与 0610 的 BaseHeight 在 z ≥ 372 是同一个式子），
 * 再叠村子压平的余波（0610 的 VillageWeight，box 到 z 548、fadeM 10）与本关的开挖 / 堆土。接缝两侧抽点比对（SceneTest 查）：差 0。
 */
export const L1218_GROUND = F({ seamZ: 556, plainY: 0.3 });

/** 自然地面以外的几个绝对高度，米。 */
export const L1218_HEIGHTS = F({
  plain: 0.3,                // 平地（另有 0105 NaturalHeight 的低频起伏）；河滩麦苗脚面高，不另做
  trackLower: 0.12,          // 河滩上那条车道压低
  bridgeDeckY: 0.35,         // 石板桥桥面顶 = 两头桥台压平的高度（与两岸齐平）
  bridgeSillY: -0.62,        // 桥下石滩（演员只能站 ≤ 1 m 的块顶：0.35 − 0.97）
  bridgePoolTopY: -0.42,     // 桥下那一汪水的水面（盖住石滩 0.2 m）
  troughFloorY: -0.6,        // 北堤北脚的低洼（14「河堤底下」），比河滩低 0.9
  leveeCrestY: 1.5,          // 河堤顶（比平地高 1.2）
  waterY: -1.6,              // 北沙河水面
  riverBedY: -2.6,           // 河底
  bridgeBarY: -1.85,         // 浮桥底下那一溜浅滩（桥面顶 −0.95，离它 0.9）
  deckTopY: -0.95,           // 浮桥桥面顶
  trenchDepth: 0.9,          // 18 的散兵坑
  bankTopY: 1.7,             // 18 最后一拨人躲的土坎顶（比河滩高 1.4）
  gateYardY: 0.3,            // 北门内外压平
  platformH: 0.6,            // 渡口兵站的土台子
});

/** 墙根小路：村南口 (117,545) 出来，贴庄子南墙外往西（中线 z 551.5，净宽 3 m 够驴车），到西头斜向西南接石板桥东头 (41,566)。 */
export const L1218_LANE = F({ name: "墙根小路", line: Line([L0610_PLACES.villageSouth.x, L0610_PLACES.villageSouth.z], [117, 551.5], [62, 551.5], [44, 565], [41, 566]), halfW: 1.5 });

/**
 * 河汊子：0610 的直段（中线 L0610_RIVER.centerX = 34.5，贴庄子西墙 x 40 的墙根）在 1218 里接着同一横断面笔直往南，
 * 穿过北堤的口子通进北沙河（z 650 水边）。横断面照 0610（沟底 31.5…37.5 深 −2.7、壁 2.5、岸上土埂 0.4×3、沟底积水 1.0）。
 * bankOff：土埂不堆的几段（石板桥两头的桥台、入河口的堤脚）。
 */
export const L1218_HECHA = F({
  name: "河汊子", centerX: L0610_RIVER.centerX, fromZ: 540, mouthZ: 650,
  floorW: L0610_RIVER.floorW, wallM: L0610_RIVER.wallM, depth: L0610_RIVER.depth,
  bankH: L0610_RIVER.bankH, bankW: L0610_RIVER.bankW, waterW: L0610_RIVER.waterW, waterH: L0610_RIVER.waterH,
  bankOff: F([F({ fromZ: 559, toZ: 570, fadeM: 3 }), F({ fromZ: 626, toZ: 700, fadeM: 4 })]),   // 土埂从 fromZ+fadeM 起没了、toZ+fadeM 起回来
  waterFromZ: 558,           // 0610 的 RiverWater_2 到 z 558 为止，这里接着往南
});

/** 石板桥：横跨河汊子，桥面中心 z 566、东西向，长 13 m（盖住沟顶宽 x 28…41）、宽 2.6、顶 0.35 与两岸齐平；下面两个石墩；没有栏杆。 */
export const L1218_STONE_BRIDGE = F({
  name: "石板桥", z: 566, fromX: 28, toX: 41, deckW: 2.6, deckT: 0.34,
  piersAtX: F([32.2, 36.8]), pierW: 1.2, pierD: 3.2,
  sill: F({ fromZ: 563.5, toZ: 568.5, wallM: 1.5 }),      // 桥下石滩（沟底抬到 bridgeSillY，前后 1.5 m 斜回沟底）
  pool: F({ fromZ: 562.5, toZ: 569.5 }),                  // 石滩上那一汪水（块）
  pads: F({ east: Box(40, 48, 561.5, 570.5), west: Box(20, 29, 561.5, 570.5) }),   // 两头压平的桥台
  padFadeM: 2,
  eastHead: P(41, 566), westHead: P(28, 566), mid: P(34.5, 566),
});

/** 河滩：河汊子西岸到渡口之间，平的麦地（脚面高）。一条车道从桥西头斜到浮桥头。 */
export const L1218_BEACH = F({
  box: Box(-10, 28, 566, 636),
  track: F({ name: "河滩车道", line: Line([24, 572], [14, 586], [2, 604], [-4, 620], [-8, 634]), halfW: 1.5 }),   // 从桥西头的桥台外起（不压桥台）
});

/** 北堤北脚的低洼（14「河堤底下」）：河滩东段挨着北堤的一道取土低洼，人趴进去庄子西南角的机枪就打不着。 */
export const L1218_TROUGH = F({ name: "河堤底下（北堤北脚的低洼）", box: Box(7, 27, 624.5, 632), floorY: L1218_HEIGHTS.troughFloorY, wallM: 1.5 });

/** 18 最后一拨人躲的土坎：河滩北边一道南北向的矮土坎（烘进高度场），挡住石板桥头 / 庄子西南角方向的子弹；缩在坎西边才挡得住。 */
export const L1218_BANK = F({ name: "河滩北边的土坎", box: Box(-1.2, 1.2, 578, 588), topY: L1218_HEIGHTS.bankTopY, slopeM: 1.2 });

/** 两道河堤（东西向）：北堤在浮桥和河汊子入河口各留一个口子，南堤在浮桥处留口子。 */
export const L1218_LEVEES = F({
  north: F({ z: 636, gaps: F([Box(-14, -2, 0, 0), Box(26, 43, 0, 0)]) }),
  south: F({ z: 714, gaps: F([Box(-11.5, -4.5, 0, 0)]) }),
  crestW: 2, baseHalfW: 4,
});

/** 北沙河：东西向，水面 z 650…700；北岸从堤脚斜下到水边，南岸同。浮桥那一溜河底抬成浅滩。 */
export const L1218_RIVER = F({
  name: "北沙河", waterMinZ: 650, waterMaxZ: 700, northToeZ: 640, southToeZ: 710,
  barHalfW: 3,               // 浮桥底下浅滩的半宽（x 方向，以桥中线为准）
  flowDir: -1,               // 往西流
});

/** 浮桥：船一条挨一条，船上铺板；两头是穿过河堤口子的引道（烘进高度场）。桥头在河汊子入河口西边。 */
export const L1218_BRIDGE = F({
  name: "浮桥", x: -8, northFootZ: 646, southFootZ: 704,
  deckW: 2.4, segments: 14, segmentM: 4, deckT: 0.12,  // 14 段，每段一块桥面板（块）；桥脚 646…704 共 58 m，每段实际 4.14 m
  boat: F({ alongZ: 1.6, acrossX: 5, h: 0.7 }),        // 每段中心底下一条船，船顶贴着桥面板底
  postEveryM: 8, postH: 1.0,                          // 两边的栏杆桩
  lanternsAtZ: F([650, 674, 698]),                     // 挂马灯的桩
  northRampFromZ: 638, southRampToZ: 712,             // 引道：平地高 → 桥面高
  blownSegments: F([0, 1, 2, 3]),                      // 18 炸掉北头这几段（从北往南数，0 = 最北）
  debris: F([P(-16, 652), P(-21.5, 657), P(-28, 653.5), P(-34, 659)]),   // 炸断的桥面与船往下游漂（西）
});

/** 渡口：浮桥头北边一块空场 + 兵站的土台子；院东边两三间渡口人家；桥头军官、工兵的站位。 */
export const L1218_FERRY = F({
  square: Box(-22, 6, 604, 632),
  platform: F({ x: -3, z: 627, w: 1.6, d: 1.6, h: L1218_HEIGHTS.platformH }),   // 渡口的兵站上头喊话的土台子
  soldierPost: P(-3, 627),
  queueFromZ: 618,                                     // 挤浮桥的人堆从这里排到桥头
  head: P(-8, 636),
  // 渡口人家（实心）：接收院东北角外头、空场北边；都在 x < −7，石板桥头的机枪往土坎西南扫河滩不被它们挡（18 最后一拨人一离开土坎就在枪口下）
  houses: F([Box(-22, -15, 597, 603), Box(-13, -7, 597.5, 603), Box(-22, -16, 589, 594)]),
  officerPost: P(-11.4, 630.5),                        // 桥头军官
  sapperPosts: F([P(-8.6, 650.4), P(-7.2, 654)]),      // 工兵（第一条船上绑炸药）
  sapperSouth: P(-9.2, 703),                           // 工兵在南头捏着引线
  fuse: Line([-8.4, 652], [-8.4, 704]),                // 引线顺着桥板拉到南岸（ChargesSet 起看得见）
});

/**
 * 18 的散兵坑：渡口空场东侧、河滩上，朝东北（对着石板桥和河滩）两段，坑底 + 东北沿一溜土袋。
 * 中心 (14,614)，面向 faceYawDeg（−45 = 东北）；坑沿坑向（西北 → 东南）摆，segments 是沿坑向离中心的 [起, 止]。
 */
export const L1218_TRENCH = F({
  x: 14, z: 614, faceYawDeg: -45,
  segments: F([F([-10, -2.5]), F([2.5, 10])]), floorW: 1.0, wallM: 0.5, sandbagH: 0.5, sandbagOffM: 1.3,
  slots: F([-9, -7.5, -6, -4.5, -3, 3.5, 5, 6.5, 8, 9.5]),   // 沿坑向的站位（10 个）
});
/** 散兵坑的坐标架：f = 面向（东北），a = 坑向（西北 → 东南，面向转 90°）。 */
export function TrenchFrame(t = L1218_TRENCH) {
  const r = t.faceYawDeg * Math.PI / 180;
  const f = { x: -Math.sin(r), z: -Math.cos(r) };
  return { c: { x: t.x, z: t.z }, f, a: { x: -f.z, z: f.x } };
}
/** 坑里的点：u 沿坑向（米，离中心）、v 沿面向（正 = 朝东北）。 */
export function TrenchPoint(u, v = 0, t = L1218_TRENCH) {
  const { c, f, a } = TrenchFrame(t);
  return { x: Math.round((c.x + a.x * u + f.x * v) * 100) / 100, z: Math.round((c.z + a.z * u + f.z * v) * 100) / 100 };
}

/** 接收院：渡口西边一个农家院，门开在东墙、朝着河滩与空场。墙 2.2；正房、灶屋实心，厢房空心（冬瓜抬进去的那间）。 */
export const L1218_YARD = F({
  name: "接收院", box: Box(-60, -24, 596, 632), wallT: 0.5, wallH: 2.2,
  gate: F({ wall: "east", z: 614, w: 1.8 }),
  mainHouse: F({ box: Box(-58, -30, 597, 604), h: 3.2 }),
  kitchen: F({ box: Box(-59, -53, 608, 622), h: 3.0 }),
  xiang: F({                                           // 厢房（南边那排）
    box: Box(-50, -32, 625, 632), h: 3.0, roofH: 3.0,
    door: F({ wall: "north", x: -41, w: 1.2, topH: 2.0 }),
    threshold: F({ h: 0.15, d: 0.22 }),               // 门槛（块，16 过门槛那一下）
  }),
  doctorPost: P(-36, 613.4),                           // 军医
  gateGuardPost: P(-20.8, 612.2),                      // 守门的兵（门外）
  queueAlongX: -21.4, queueFromZ: 616, queueToZ: 631,  // 门外墙根排着等的伤兵 / 担架（东墙外）
  dongguaInside: P(-42.4, 628.6),                      // 厢房里冬瓜放下的地方
  thresholdSeat: P(-41, 624.55),                       // 17 顺子坐的门槛（朝北看院子；门槛块在 z 625、厚 0.22，坐在它北沿外一点）
  strawBox: Box(-51, -26, 605, 623),                   // 院里铺麦秸、躺满伤员的地方
  lamps: F([P(-36, 610), P(-41, 623.5)]),              // 院里的马灯（军医那盏、厢房门口那盏）
  gateLamp: F({ x: -25.6, z: 616.6, postH: 2.8, lampH: 2.6 }),   // 院门里侧的灯桩：18-4 从南岸越过东墙看得见的那盏
  strawW: 0.03,
});

/**
 * 鬼子机枪位：庄子西南角 SW1 院子挨炮塌出的豁子——院子西南角连村西边墙、村南边墙一起塌了。
 * 1218 场景里不带 0610 的那几块（removes0610），换成缺了角的几截（生成器出）+ 瓦砾堆；机枪架在瓦砾堆上。
 * 豁子西边、河汊子西坎上有一段班长他们能贴着坎摸过去的位置（grenadeFrom，14 末甩手榴弹）。
 */
export const L1218_BREACH = F({
  name: "庄子西南角塌出的豁子（鬼子机枪位）",
  southWall: F({ z: 535, fromX: 40, toX: 46 }),        // SW1 南墙塌掉的一截（0610 的 Wall_x535_1 → 1218 里换成 x 46…61.25）
  westWall: F({ x: 40, fromZ: 533, toZ: 545 }),        // 村西边墙塌掉的一截（0610 的 VillageWestEdge_1 → 换成 z 385…533）
  southEdge: F({ z: 545, fromX: 40, toX: 46 }),        // 村南边墙塌掉的一截（0610 的 VillageSouthEdge_1 → 换成 x 46…116.25）
  fenceFromX: 46,                                      // 菜园北篱（Fence_SW1b_N）只剩 x 46…64
  rubble: F({ x: 42.3, z: 535.4, w: 3.8, d: 2.4, h: 0.9, ry: 0.2 }),          // 机枪架在上头（块顶 ≤ 1 m，演员站得上）
  rubbleWest: F({ x: 40.2, z: 540.2, w: 1.8, d: 8.4, h: 0.6, ry: -0.06 }),    // 倒下的西边墙
  rubbleBlast: F({ x: 41.4, z: 536.9, w: 2.8, d: 2.2, h: 0.7, ry: -0.4 }),    // 14 末一捆手榴弹炸塌的那一堆（BreachBlasted 起出现）
  mgPost: P(42.3, 535.2), loaderPost: P(43.9, 533.8),
  riflePosts: F([P(48.4, 538.6), P(41.6, 543.4), P(45.4, 533.0), P(52.6, 538.8)]),   // 院墙后、菜园篱笆后趴开
  grenadeFrom: F([P(27.2, 537.6), P(26.6, 540.4), P(27.4, 543.2)]),               // 河汊子西坎上班长他们摸到的位置
  removes0610: F(["VillageWestEdge_1", "VillageSouthEdge_1", "Wall_x535_1", "Wall_z44_1", "Fence_SW1b_N"]),
  eyeTargets: F({ bridgeWest: P(26, 566), ferryCrowd: P(-6, 624), trough: P(13, 628.4) }),
});

/** 远处的铁路桥（东边远处的北沙河上：两座桥墩 + 一道钢梁 + 两头一截路基）。 */
export const L1218_RAIL_BRIDGE = F({ name: "铁路桥（远处）", x: 140, fromZ: 630, toZ: 720, girderY: 4.0, piersAtZ: F([662, 688]) });

/** 南岸往北门的路，与北门（随浮桥横挪到 x −8；真实离北沙河十来里，白盒里放在南岸往南 150 m，预演黑场带过）。 */
export const L1218_SOUTH = F({
  road: F({ line: Line([-8, 712], [-8, 857]), halfW: 2.5 }),
  wall: F({ z: 860, t: 6, h: 8, fromX: -120, toX: 100 }),
  gate: F({ x: -8, w: 4, h: 4.5 }),                    // 门洞
  street: F({ x: -8, halfW: 3, fromZ: 863, toZ: 895 }),
  torches: F([P(-12, 856), P(-4, 856)]),
  sandCarts: F([P(-13.6, 852.6), P(-15.6, 849)]),
  waterBucket: P(-4.2, 856.6),
  flatBox: Box(-58, 42, 840, 895),
});

/** 日常摆件：kind 决定尺寸与颜色；位置是中心；ry 弧度。 */
export const L1218_PROP_KINDS = F({
  OverturnedCart: F({ w: 2.4, d: 1.5, h: 0.6, semantic: "timber", name: "翻倒的驴车" }),
  CartWheel: F({ w: 0.9, d: 0.12, h: 0.9, semantic: "timber", name: "车轮" }),
  AmmoBox: F({ w: 0.5, d: 0.34, h: 0.3, semantic: "timber", name: "弹药箱" }),
  Sandbag: F({ w: 0.6, d: 0.35, h: 0.25, semantic: "canvas", name: "土袋" }),
  Bundle: F({ w: 0.7, d: 0.5, h: 0.45, semantic: "canvas", name: "包袱铺盖" }),
  HandCart: F({ w: 1.4, d: 0.8, h: 0.7, semantic: "timber", name: "独轮车 / 小车" }),
  Straw: F({ w: 2.0, d: 1.4, h: 0.06, semantic: "canvas", name: "麦秸" }),
  WaterVat: F({ w: 0.8, d: 0.8, h: 0.9, semantic: "plaster", name: "水缸" }),
  Lantern: F({ w: 0.2, d: 0.2, h: 0.3, semantic: "danger", name: "马灯" }),
  Torch: F({ w: 0.15, d: 0.15, h: 2.0, semantic: "danger", name: "火把" }),
  Charge: F({ w: 0.4, d: 0.3, h: 0.25, semantic: "danger", name: "炸药包" }),
  DoorBoard: F({ w: 1.0, d: 0.18, h: 1.9, semantic: "timber", name: "靠墙的门板" }),
  Rubble: F({ w: 2.4, d: 2.0, h: 0.8, semantic: "earthDark", name: "塌下来的墙" }),
});
const Prop = (id, x, z, ry = 0) => F({ id, kind: id.split("_")[0], x, z, ry });
export const L1218_PROPS = F([
  // 河滩上：往渡口涌的人丢下的东西
  Prop("Bundle_B1", 5, 596, 0.3), Prop("Bundle_B2", -7, 612.6, 1.1), Prop("HandCart_B1", -13.2, 621.4, 0.4), Prop("Bundle_B3", 10.4, 604.8, -0.2),
  // 石板桥西头：班长他们撬开的弹药箱
  Prop("AmmoBox_W1", 24.2, 563.8, 0.3), Prop("AmmoBox_W2", 24.8, 569.0, 1.2),
  // 散兵坑后头
  Prop("AmmoBox_T1", 6.2, 610.8, 0.2), Prop("AmmoBox_T2", 7.0, 611.6, 1.4),
  // 接收院里
  Prop("WaterVat_Y1", -54.6, 624.4), Prop("DoorBoard_Y1", -25.2, 604.4, 0), Prop("DoorBoard_Y2", -28.0, 622.0, 1.5708),
  // 北门外
  Prop("HandCart_G1", -13.6, 852.6, 0.2), Prop("HandCart_G2", -15.6, 849, -0.1), Prop("Sandbag_G1", -1.5, 854.6), Prop("Sandbag_G2", -0.9, 855.1),
]);

/** 场景信号（关键帧 signals 与场景文件 gates 共用的名字）。 */
export const L1218_SIGNALS = F({
  cartOverturned: "CartOverturned",   // 13-3 起：驴车翻在河滩上（翻倒的车与车轮这两个块出现；立着的车是单位 GengCart，从 13-3 起不再摆）
  breachBlasted: "BreachBlasted",     // 14-3 起：班长他们一捆手榴弹甩进豁子，豁子里再塌一堆（机枪哑了：机枪手倒在瓦砾上）
  chargesSet: "ChargesSet",           // 18-1 起：北头几条船上绑了炸药包、引线拉到南岸
  bridgeBlown: "BridgeBlown",         // 18-4 起：北头四段桥面与船没了、碎片往下游漂
});

/** 关键地点。x/z 是中心或站点。 */
export const L1218_PLACES = F({
  villageSouth: L0610_PLACES.villageSouth,                          // 村南口 (117,545)（窄胡同出村的地方）
  laneShell: P(117, 540),                                           // 11-1 顺子身后落在胡同里的那发炮
  gengSmoke: P(L0610_GENG.yard.center.x, L0610_GENG.yard.center.z), // 12-3「看」：老耿家院子腾起黑烟的地方
  laneBend: P(62, 551.5),                                           // 墙根小路西头拐向石板桥的地方
  fieldShell: P(78, 559),                                           // 12-1 打偏落在小路南边麦地里的那发炮
  bridgeEast: L1218_STONE_BRIDGE.eastHead,
  bridgeWest: L1218_STONE_BRIDGE.westHead,
  bridgeMid: L1218_STONE_BRIDGE.mid,
  helmetsAt: P(117, 549),                                           // 12-3 村南口冒出两三顶钢盔的地方
  cartRaidAt: P(-2, 609.4),                                         // 13-3 驴车翻的地方（车中心；渡口空场东沿、人堆边上）
  troughAt: P(13, 628.4),                                           // 14 把冬瓜拖到的地方（河堤底下的低洼）
  flareAt: P(-8, 600),                                              // 13-2 信号弹落在渡口上空
  planesFrom: P(130, 672),                                          // 13-2 飞机从东边顺着河来
  ferryHead: L1218_FERRY.head,
  ferrySquare: P(-8, 620),
  platform: L1218_FERRY.soldierPost,
  yardGate: P(-24, 614),
  xiangDoor: P(-41, 625),
  bridgeNorthFoot: P(-8, 646),
  bridgeSouthFoot: P(-8, 704),
  southLeveeCover: P(-4, 717),                                      // 18-4 南岸堤后（站着眼睛刚好越过堤顶往北看）
  railBlast: P(140, 676),                                           // 18-1 远处铁路桥炸的地方（爆点离地 4–6 m）
  lastGroupCover: P(-3.6, 583.5),                                   // 18-2 最后一拨人缩在土坎西边
  lastGroupExposed: P(-5, 596),                                     // 离开土坎往渡口跑，机枪就看得见的地方
  ijaMg18: P(24.6, 568.4),                                          // 18-2 石板桥西头趴着的鬼子机枪
  ijaMgBreach: L1218_BREACH.mgPost,                                 // 13 豁子上的机枪
  trench: P(L1218_TRENCH.x, L1218_TRENCH.z),
  northGate: P(-8, 860),
  sunWest: P(-120, 600),                                            // 太阳在西边（只给机位朝向参考）
});

/** 出生点：11-1 村南口，朝西（往西看墙根小路、石板桥）。 */
export const L1218_SPAWN = F({ x: 117, z: 547.5, yawDeg: 90 });
