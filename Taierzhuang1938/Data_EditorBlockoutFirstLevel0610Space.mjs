// ===========================================================================
// Data_EditorBlockoutFirstLevel0610Space.mjs —— 第一关 06–10 白盒（关卡键 FirstLevel0610）的空间锚点
//
// 唯一口径：Notion「第一关｜往南的路 · 剧本」06–10 节（10-18 晚定稿）+ 集成负责人 10-18 的搭建契约 §3（纸面草稿）。
// 坐标与 FirstLevel0105 同一套：原点 = 01–05 的沟口；X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南。
// 06 的干沟、南岸枯树、凹路口都从 Data_EditorBlockoutFirstLevel0105Space import 现成常量，不抄数字：0105 那边改了，重跑生成器就跟着变。
// 0105 里没有的往南部分（凹路南段、河汊子、耿家庄）写在这里。
//
// 场景生成器（Script_EditorBlockoutFirstLevel0610Scene.mjs）按这里烘地形与体块，
// 关键帧生成器（Script_EditorBlockoutFirstLevel0610Keyframes.mjs）按这里摆人、POI 与机位。都只读本表；要挪地方先改这里，再重跑生成器。
// 纯数据：零 three、零 DOM，node 与浏览器共用。
//
// 与契约 §3 草稿不一致的地方（都是摆不下 / 接不上才挪的，报告里也列了）：
//   · 凹路：契约折线 (83,159)→(86,200)→(90,260)…；0105 的凹路已经烘到 (80,199)，为了和 0105 逐点接上，
//     本表沿用 0105 的全部折线到 (80,199)，再接 (84,230)→(90,260)→(96,320)→(100,378)，最后 6 m 坡道升到村口地面 (100,384)。
//     所以 z 185…230 这一段路中线在 x 80…84，比契约西 2…6 m。
//   · 老耿家前屋：契约 x 82…118 占满整个院宽，后院就没有车能进的门（11 里驴车要从后门出村）。
//     这里前屋收到 x 82…106.4，x 106.9…109.5 留一道 2.6 m 的大门（门洞到后院的过道夹在前屋东墙与偏屋西墙之间）；
//     前门因此从 x≈108 挪到 x 104，偏屋从 x 109…118 挪到 x 110…118.25（给过道让 1 m）。北窗 x 97 不动。
//   · 巷子南北那一截：契约 x≈56；邻院西墙在 x 60，巷子 2 m 宽贴着它走，中线在 x 58.75。
//   · 地瓜窖：契约窖口 1.2×1.2；0.5 m 的高度网格挖 1.2 m 的坑只剩一个尖，窖坑挖 1.6×1.6（坑壁 0.4），窖口 1.2 的样子由窖沿矮块与盖板表现。
//   · 石碾：从 (113,466) 挪到 (113.2,465.7)，趴在它西边的人才能顺着东街看到东头（不被东街南侧院墙的墙头挡住）。
//   · 妮儿捡弹壳的坎顶：契约 (50,140.5) 按 0105 的干沟还在坎的斜面上（坎顶边 z 139），挪到 (50,138.8)。
//   · 地瓜窖：契约 (110,499) 离侧门 28 m，但剧本「留下的那个鬼子站在八九米外」、契约也写「9 m 左右」，按剧本挪到 (90.5,499.5)（离侧门 9 m）；
//     墙缝随之从 z 493 挪到 z 496.5、缝 0.2 m（从缝里看窖口斜 18°，0.5 m 厚的墙上一道缝看得到）。
//   · 灶屋：契约 z 480…492，狗洞 z 488 会开进灶屋，收到 z 480…487（门在东墙 z 483.5）；前屋南门放在灶屋东边 x 94（门外就是院子）。
// ===========================================================================

import {
  L0105_CELL_M, L0105_HEIGHTS, L0105_GULLY, L0105_GULLY_TREES, L0105_SUNKEN_LANE, L0105_PLACES, L0105_TRENCHES,
  PointAlong, PointBeside, LineLength,
} from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

export { PointAlong, PointBeside, LineLength };

export const L0610_LEVEL_KEY = "FirstLevel0610";
export const L0610_TITLE = "第一关 06–10 · 耿家庄（新剧本白盒）";

/** 场地范围与高度网格（0.5 m 一格，与 0105 一样）。只烘干沟以北到坡顶那一截当背景，前沿不烘。 */
export const L0610_BOUNDS = Object.freeze({ minX: -20, maxX: 250, minZ: 120, maxZ: 560 });
export const L0610_CELL_M = L0105_CELL_M;

const P = (x, z) => Object.freeze({ x, z });
const Line = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));
const Box = (minX, maxX, minZ, maxZ) => Object.freeze({ minX, maxX, minZ, maxZ });

/** 从 0105 借来的东西（原样引用，不抄）：干沟、南岸枯树、凹路头一段、交通沟坡道、集结处几个地名。 */
export const L0610_FROM_0105 = Object.freeze({
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
export const L0610_HEIGHTS = Object.freeze({
  plain: L0105_HEIGHTS.southPlain,   // 0：干沟以南的平地（z 168…200）
  plainRise: 1.0,                    // 凹路中段两侧的地略高：路才有 2.5 m 深
  village: 0.3,                      // 耿家庄的地面（整村压平，墙和房子才站得稳）
  laneDeepY: -1.4,                   // 凹路中段路底（0105 凹路末端就是 −1.4，接上）
  laneMidY: -1.2,                    // 过 (96,320) 以后路底开始抬
  laneMouthY: -0.9,                  // 村口前路底（比两侧低 1.2 m）
  riverDepth: 3.0,                   // 河汊子沟底比两岸低多少
  cellarDepth: 2.0,                  // 地瓜窖深
});

/** 平地起伏的大形：沿 z 的控制点（z, 高度），之间平滑过渡；z ≤ 200 为 0（不碰 0105 那一片）。 */
export const L0610_PLAIN_PROFILE = Object.freeze([[200, 0], [262, L0610_HEIGHTS.plainRise], [300, L0610_HEIGHTS.plainRise], [372, L0610_HEIGHTS.village], [560, L0610_HEIGHTS.village]]);

/**
 * 凹路（后送路）：0105 的折线原样接上，再往南到村北口；最后 rampM 米升到村口地面。路底宽、两壁宽沿用 0105。
 * floorKnots：弧长 ≥ 0105 折线长以后路底高度的控制点（按点的位置记，生成器换算成弧长）。
 */
export const L0610_LANE = Object.freeze({
  line: Line(...L0105_SUNKEN_LANE.line.map((p) => [p.x, p.z]), [84, 230], [90, 260], [96, 320], [100, 378], [100, 384]),
  floorW: L0105_SUNKEN_LANE.floorW,
  wallM: L0105_SUNKEN_LANE.wallM,
  rampM: 12,                                   // 村口前这么长的坡道升到村口地面
  floorKnots: Object.freeze([
    Object.freeze({ at: P(84, 230), y: L0610_HEIGHTS.laneDeepY }),
    Object.freeze({ at: P(90, 260), y: L0610_HEIGHTS.laneDeepY }),
    Object.freeze({ at: P(96, 320), y: L0610_HEIGHTS.laneMidY }),
  ]),
  mouthY: L0610_HEIGHTS.laneMouthY,
});

/** 河汊子（村西）：南北向的干沟，沟底一线浅水；凹路和村子都在它东边。 */
export const L0610_RIVER = Object.freeze({
  name: "河汊子", centerX: 19, fromZ: 200, toZ: 560, floorW: 6, depth: L0610_HEIGHTS.riverDepth, wallM: 2.5,
  bankH: 0.4, bankW: 3.0, endM: 10, waterW: 2.0, waterH: 0.12,
});

/** 耿家庄的范围与通用尺寸。土坯 / 青砖平顶院落；院墙 2.2 m，房子 3.2–3.5 m。 */
export const L0610_VILLAGE = Object.freeze({
  box: Box(40, 235, 383, 548), y: L0610_HEIGHTS.village, fadeM: 10,
  wallT: 0.5, wallH: 2.2, houseH: 3.2, doorW: 1.2, doorTopH: 2.0, gateW: 1.5, streetLowerM: 0.12,
});

/** 街：主街南北向、东街窄巷、巷子两截、后门外往南出村的小路。都是中线 + 半宽。 */
export const L0610_STREETS = Object.freeze({
  main: Object.freeze({ name: "主街", x: 100, halfW: 3, fromZ: 385, toZ: 470 }),
  square: Object.freeze({ name: "老耿家门前的小空地", box: Box(82, 118, 460, 470) }),
  east: Object.freeze({ name: "东街（窄巷）", z: 465, halfW: 1.75, fromX: 118, toX: 232 }),
  alleyWest: Object.freeze({ name: "巷子（东西那截）", z: 398, halfW: 1, fromX: 58.75, toX: 96.75 }),
  alleySouth: Object.freeze({ name: "巷子（南北那截）", x: 58.75, halfW: 1, fromZ: 397, toZ: 492 }),
  backLane: Object.freeze({ name: "后门外的小路", x: 98, halfW: 1.25, fromZ: 506, toZ: 545 }),
});

/** 老耿家（主街南头正对着街）。墙的坐标是墙的中线；门窗给中心与宽。 */
export const L0610_GENG = Object.freeze({
  compound: Box(82, 118.25, 470, 506),                       // 东墙 x 118.25 与东街南侧的院子共用
  frontRoom: Object.freeze({ box: Box(82, 106.4, 470, 478), roofH: 3.5, parapetH: 0.35 }),
  window: Object.freeze({ x: 97, w: 1.4, sillH: 0.9, topH: 2.0 }),          // 北窗，正对主街
  frontDoor: Object.freeze({ x: 104, w: 1.2, topH: 2.0 }),                 // 前门，朝北开，门口就是小空地
  roomYardDoor: Object.freeze({ x: 94, w: 1.2, topH: 2.0 }),               // 前屋南墙开向后院的门（灶屋东边，门外就是院子）
  carriageGate: Object.freeze({ minX: 106.9, maxX: 109.5, topH: 2.6 }),    // 大门：驴车走这里进后院（过道到 z 480）
  passageEastX: 109.75,                                                     // 过道东墙 = 偏屋西墙往北延到北院墙
  yard: Box(82, 118.25, 478, 506),
  // 灶屋：契约 z 480…492，但狗洞 z 488 会开进灶屋，收到 z 480…487；门在东墙中段，朝院子
  kitchen: Object.freeze({ box: Box(82, 91, 480, 487), roofH: 3.0, door: Object.freeze({ z: 483.5, w: 1.2 }) }),
  sideRoom: Object.freeze({ box: Box(110, 118.25, 480, 492), roofH: 3.0, door: Object.freeze({ z: 486, w: 1.2 }) }), // 门在西墙
  stove: Object.freeze({ x: 83.2, z: 481.4, w: 1.6, d: 0.9, h: 0.8 }),     // 灶台（灶屋西北角）
  board: Object.freeze({ x: 84.4, z: 486.1, w: 1.4, d: 0.6, h: 0.85 }),    // 案板（南墙根）
  mill: Object.freeze({ x: 100, z: 487, baseW: 1.5, baseH: 0.4, stoneW: 1.1, stoneH: 0.35 }),   // 石磨（后院中间偏北）
  // 地瓜窖：契约 (110,499) 离侧门 28 m，剧本「留下的那个鬼子站在八九米外」、契约也写「9 m 左右」——按剧本的距离来，窖口离侧门 9 m
  cellar: Object.freeze({ x: 90.5, z: 499.5, floorW: 1.6, wallM: 0.4, depth: L0610_HEIGHTS.cellarDepth, mouth: 1.2, rimH: 0.15 }),
  cellarLid: Object.freeze({ x: 92.3, z: 501.0, w: 1.3, d: 1.3, t: 0.08, ry: 0.35 }),            // 掀开的木盖板，扔在窖口东南
  cellarLidBlown: Object.freeze({ x: 94.0, z: 497.4, ry: 1.1 }),                                    // 炸飞后的位置
  pisserOffset: P(1.4, -2.3),                                                                        // 09-4 撒尿的鬼子：窖口东北、汉子尸体边（离侧门口约 9 m）
  haystack: Object.freeze({ x: 85.5, z: 503.4, w: 2.4, d: 1.8, h: 1.6 }),   // 柴草垛（后院西南角）
  backDoor: Object.freeze({ x: 98, w: 1.2, topH: 2.0 }),                   // 朝南的后门（南墙 z 506）
  backVat: Object.freeze({ x: 98, z: 504 }),                                // 堵在门里头的大水缸
  backVatMoved: Object.freeze({ x: 99.7, z: 503.4 }),                      // 10 末挪开后
  sharedWall: Object.freeze({ x: 81.5, fromZ: 474, toZ: 506 }),            // 与邻院共用的那道墙
  dogHole: Object.freeze({ z: 488, w: 0.45, h: 0.4 }),                     // 狗洞（大人钻不过）
  // 墙缝：契约 z≈493；窖口挪到 (90.5,499.5) 以后从 z 493 看它要斜 36°，0.5 m 厚的墙上一道缝看不到那么斜，挪到 z 496.5（斜 18°）、缝 0.2 m
  crack: Object.freeze({ z: 496.5, w: 0.2 }),                              // 墙缝（竖缝，能看进后院）
  sideGate: Object.freeze({ z: 500, w: 1.0, leafW: 0.85, leafT: 0.1 }),    // 侧门：门扇 0.85，北侧留 0.15 的门缝；铰链在南
  roofPost: P(103, 473),                                                     // 房顶扔手榴弹的鬼子站的地方（北女墙后）
  mgPost: P(97, 472.4),                                                      // 北窗机枪
});

/** 邻院（老耿家西边，共用 x 81.5 那道墙）。 */
export const L0610_NEIGHBOR = Object.freeze({
  box: Box(60, 81.5, 474, 506),
  westDoor: Object.freeze({ z: 490, w: 1.0 }),                             // 从巷子进邻院的小门
  house: Object.freeze({ box: Box(62, 78, 475, 481), h: 3.0 }),
  vat: P(79.6, 476.6), coop: P(63.5, 503.2),
});

/** 东街两侧的院子：北侧 z 440…463、南侧 z 467…490；隔墙把每侧分成几个院；每院一座房。 */
export const L0610_EAST_YARDS = Object.freeze({
  north: Object.freeze({ box: Box(118.25, 232, 440, 463), splitsX: Object.freeze([150, 182, 214]), gatesX: Object.freeze([140, 168, 196, 222]) }),
  south: Object.freeze({ box: Box(118.25, 232, 467, 490), splitsX: Object.freeze([146, 178, 210]), gatesX: Object.freeze([132, 158, 186, 212]) }),
  mortarHide: P(226, 458.5),                                               // 掷弹筒躲的院墙后（北侧最东那个院里）
  fieldEast: P(245, 465),                                                   // 东头外面的麦地
});

/** 主街两侧与巷子西边的院子。 */
export const L0610_STREET_YARDS = Object.freeze({
  westOfMain: Object.freeze({ box: Box(60, 96.75, 400, 460), splitsZ: Object.freeze([430]), gatesZ: Object.freeze([418.5, 443.5]) }),
  eastOfMain: Object.freeze({ box: Box(103.25, 135, 385, 460), splitsZ: Object.freeze([410, 435]), gatesZ: Object.freeze([408.5, 432.5, 452]) }),
  northOfAlley: Object.freeze({ box: Box(60, 96.75, 385, 397) }),
  westOfAlley: Object.freeze({ box: Box(40, 57.5, 397, 492), splitsZ: Object.freeze([430, 462]) }),
  squareNorthWallZ: 460,                                                    // 小空地北边（主街东墙到老耿家东墙那一截）
  southWest: Object.freeze({ box: Box(60, 96.75, 506, 545) }),
  southEast: Object.freeze({ box: Box(99.25, 135, 506, 545) }),
  villageSouthZ: 545,
});

/** 村里的日常摆件（占位体块）：kind 决定尺寸与颜色；位置是中心；ry 弧度。 */
export const L0610_PROP_KINDS = Object.freeze({
  OverturnedCart: Object.freeze({ w: 2.6, d: 1.6, h: 0.5, semantic: "timber", name: "翻倒的大车" }),
  CartWheel: Object.freeze({ w: 0.7, d: 0.12, h: 0.7, semantic: "timber", name: "车轮" }),
  WaterVat: Object.freeze({ w: 0.8, d: 0.8, h: 0.9, semantic: "plaster", name: "水缸" }),
  Haystack: Object.freeze({ w: 2.2, d: 1.8, h: 1.5, semantic: "canvas", name: "柴垛" }),
  ChickenCoop: Object.freeze({ w: 0.9, d: 0.6, h: 0.7, semantic: "timber", name: "鸡笼" }),
  Millstone: Object.freeze({ w: 1.3, d: 1.3, h: 0.5, semantic: "structure", name: "磨盘" }),
  DoorBoard: Object.freeze({ w: 1.0, d: 0.18, h: 1.9, semantic: "timber", name: "靠墙的门板" }),
  StrawMat: Object.freeze({ w: 1.2, d: 0.06, h: 1.8, semantic: "canvas", name: "草帘" }),
  Rubble: Object.freeze({ w: 2.4, d: 2.0, h: 0.8, semantic: "earthDark", name: "塌下来的墙角" }),
  // 06 干沟里的东西
  BloodStain: Object.freeze({ w: 0.9, d: 0.6, h: 0.02, semantic: "danger", name: "血迹" }),
  Bandage: Object.freeze({ w: 0.35, d: 0.25, h: 0.04, semantic: "plaster", name: "扔下的绷带" }),
  Canteen: Object.freeze({ w: 0.18, d: 0.1, h: 0.22, semantic: "metal", name: "空水壶" }),
  AmmoBox: Object.freeze({ w: 0.5, d: 0.34, h: 0.3, semantic: "timber", name: "弹药箱" }),
});
const Prop = (id, x, z, ry = 0) => Object.freeze({ id, kind: id.split("_")[0], x, z, ry });
export const L0610_PROPS = Object.freeze([
  // 06 干沟（集结处）：血迹、绷带、空水壶
  Prop("BloodStain_G1", 32.4, 149.6, 0.4), Prop("Bandage_G1", 33.3, 148.5, 1.2), Prop("Canteen_G1", 31.3, 147.9, 0.3),
  Prop("BloodStain_G2", 45.2, 151.2, -0.6), Prop("Bandage_G2", 44.1, 150.4, 0.2), Prop("BloodStain_G3", 24.6, 146.3, 1.1),
  // 主街：翻倒的大车（主街中间偏东）、水缸、门板、草帘
  Prop("OverturnedCart_S1", 101.4, 426, 0.5), Prop("CartWheel_S1", 101.9, 425.0, 0.5),
  Prop("WaterVat_S1", 95.6, 413.4), Prop("WaterVat_S2", 104.6, 450.8), Prop("DoorBoard_S1", 97.1, 436, 0), Prop("StrawMat_S1", 103.3, 408.5, 0),
  // 小空地与东街口
  Prop("WaterVat_Q1", 116.8, 461.6), Prop("Haystack_Q1", 85, 462.4, 0.2), Prop("DoorBoard_Q1", 118.0, 471.6, 1.5708),
  // 东街两侧院里
  Prop("Haystack_E1", 150, 445, 0.3), Prop("Millstone_E1", 188, 484), Prop("ChickenCoop_E1", 160, 486.6), Prop("WaterVat_E1", 123, 486),
  Prop("StrawMat_E1", 168.6, 463.1, 0), Prop("WaterVat_E2", 196.6, 460.8),
  // 主街两侧院里
  Prop("Haystack_W1", 70, 452, 0), Prop("ChickenCoop_W1", 92, 405), Prop("Millstone_W1", 110, 452), Prop("WaterVat_W1", 106, 390),
  // 夹道（小空地西头到邻院北墙之间）
  Prop("Haystack_L1", 66, 468, 0.1),
  // 后门外的小路边
  Prop("Haystack_B1", 94.4, 520, 0), Prop("WaterVat_B1", 101.2, 534),
]);
/** 塌了一角的房子（院子里的某座房 + 塌下来的墙角）：按 L0610_HOUSES 的 id。 */
export const L0610_COLLAPSED_HOUSES = Object.freeze(["House_EN2", "House_WM1"]);

/** 场景信号（关键帧 signals 与场景文件 gates 共用的名字）。 */
export const L0610_SIGNALS = Object.freeze({
  cartDeparted: "CartDeparted",   // 06-3 起：老耿赶车走了，车上那几箱弹药（体块）跟着车走（本关没有「块跟着单位」的能力，用信号把它们收掉）
  sideGateOpen: "SideGateOpen",   // 09-4 起：侧门从里头拔开门闩、推开
  cellarBlast: "CellarBlast",     // 09-3 末起：窖里闷响一声，窖口冒烟、盖板飞开
  mgSilenced: "MgSilenced",       // 10-1 起：北窗机枪组被从背后打掉；10-2 那挺枪出现在石碾后头
  backDoorOpen: "BackDoorOpen",   // 10-4 起：水缸挪开、后门打开
});

/** 有名字的地方。x/z 是中心或站点；yawDeg 是站在那里该朝的方向。 */
export const L0610_PLACES = Object.freeze({
  assembly: L0105_PLACES.assembly,                                           // 集结处（干沟）
  assemblyEntry: L0105_PLACES.assemblyEntry,                                 // 交通沟坡道下到干沟
  gullyRest: P(L0105_PLACES.assembly.x - 5, L0105_PLACES.assembly.z + 1),    // 02 末冬瓜躺的地方（空了）
  laneHead: L0105_PLACES.laneHead,                                           // 凹路口
  cartStop: Object.freeze({ name: "老耿的驴车（凹路口）", x: 66, z: 156, yawDeg: -90 }),
  // 契约 (50,140.5)：按 0105 的干沟那一点还在坎的斜面上（坎顶边在 z 139），往北挪到坎顶边上
  nierRim: Object.freeze({ name: "妮儿捡弹壳的坎顶", x: 50, z: 138.8 }),
  villageMouth: Object.freeze({ name: "村北口", x: 100, z: 385 }),
  laneEnd: Object.freeze({ name: "凹路尽头", x: 100, z: 380 }),
  square: Object.freeze({ name: "老耿家门前的小空地", x: 100, z: 465 }),
  roller: Object.freeze({ name: "石碾", x: 113.2, z: 465.7, w: 1.2, d: 0.9, h: 0.9, baseW: 2.0, baseH: 0.12 }),
  eastEnd: Object.freeze({ name: "东街东头", x: 232, z: 465 }),
  river: Object.freeze({ name: "河汊子", x: 19, z: 400 }),
  neighborDoor: Object.freeze({ name: "邻院西墙的小门", x: 60, z: 490 }),
  dogHole: Object.freeze({ name: "狗洞", x: 81.5, z: 488 }),
  crack: Object.freeze({ name: "墙缝", x: 81.5, z: 496.5 }),
  sideGate: Object.freeze({ name: "侧门", x: 81.5, z: 500 }),
  kitchenDoor: Object.freeze({ name: "灶屋门", x: 91, z: 483.5 }),
  sideRoomDoor: Object.freeze({ name: "偏屋门", x: 110, z: 486 }),
  roomYardDoor: Object.freeze({ name: "前屋南门", x: 94, z: 478 }),
  frontDoor: Object.freeze({ name: "前门", x: 104, z: 470 }),
  carriageGate: Object.freeze({ name: "大门（车道）", x: 108.2, z: 470 }),
  northWindow: Object.freeze({ name: "北窗", x: 97, z: 470 }),
  mill: Object.freeze({ name: "石磨", x: 100, z: 487 }),
  cellar: Object.freeze({ name: "地瓜窖", x: 90.5, z: 499.5 }),
  backDoor: Object.freeze({ name: "后门", x: 98, z: 506 }),
  villageSouth: Object.freeze({ name: "村南口", x: 98, z: 545 }),
  mortarHide: L0610_EAST_YARDS.mortarHide,
  fieldEast: L0610_EAST_YARDS.fieldEast,
});

/** 出生点：06-1 交通沟坡道下到干沟。 */
export const L0610_SPAWN = Object.freeze({ x: 35, z: 147, yawDeg: -90 });

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
