// ===========================================================================
// Data_EditorBlockoutFirstLevel1218Space.mjs —— 第一关 12–18 白盒（关卡键 FirstLevel1218）的空间锚点
//
// 唯一口径：集成负责人 2026-10-19 在聊天里给用户的 12–18 扩写稿（还没进 Notion）+ 同日的分拍空间图。
// 坐标与 FirstLevel0105 / FirstLevel0610 同一套：原点 = 01–05 的沟口；X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南。
// 村南那一截（z < 556：老耿家后院、后门、后门外的小路、村南两片院子、河汊子直段）原样用 0610 的地面与体块，不抄数字。
// 0610 里没有的往南部分写在这里：出村小路、沿北沙河往西的大路、拐过来往西的河汊子、路边浅沟、排水沟、两道河堤、北沙河、
// 浮桥、桥头接收院与散兵坑、最后一拨人躲的土坎、远处的铁路桥、南岸往北门的路、北门（挪近了，真实隔着十来里，预演里黑场带过）。
//
// 场景生成器（Script_EditorBlockoutFirstLevel1218Scene.mjs）按这里烘地形与体块，
// 关键帧生成器（Script_EditorBlockoutFirstLevel1218Keyframes.mjs）按这里摆人、POI 与机位。都只读本表；要挪地方先改这里，再重跑生成器。
// 纯数据：零 three、零 DOM，node 与浏览器共用。
//
// 地理上的几条定论（剧本与 0610 推出来的，改之前先想清楚牵连）：
//   · 08 说「西边是河汊子，坎陡，水齐腰深」（10-21 前是「车下不去」），所以河汊子不能横在出村以后往西的大路上：它在村西南拐弯往西，一直在大路北边，
//     大路夹在河汊子与北沙河的河堤之间往西走（两边是麦地）。
//   · 北沙河往西流（滕州的河都往西流进微山湖），断桥往下游（西）漂。
//   · 浮桥窄，一回只过一副担架，桥头才堵成长队；接收院在北岸桥头，伤兵先在这里让大夫看、再排队过桥。
//   · 排水沟从大路南边的沟口一直通到桥头河边，沟比人深：15 抬着冬瓜走沟，绕开路上的长队，也躲飞机。
//
// 与集成负责人 10-19 草稿不一致的地方（都是摆不下 / 接不上 / 视线不成立才挪的，报告里也列了）：
//   · 河汊子：草稿折线 (−40,592)→(−260,597) 会从桥头北边那个院子（YardNorth，x −160…−139、z 584…604）正中穿过去。
//     改成 (−40,592)→(−100,590)→(−125,575)→(−260,571)：过了 x −100 往北偏，岸上土埂的南沿在 x −139 处到 z 582，离院墙 2 m；
//     仍一直在大路北边、离路中线 ≥ 15 m（最近处 x −100 约 22 m）。
//   · 排水沟：草稿从 (−40,619.5) 起，沟口 6 m 斜坡没地方从「路南浅沟」下来（浅沟在 z 615.4）。折线头一点改成浅沟中线 (−40,615.4)，
//     斜坡从浅沟底顺着往南下到沟底（6 m 落 1.6 m，1:3.75）；`ditchMouth` 仍记 (−40,619.5)（到那里沟已经 1.4 m 深）。
//   · 散兵坑南段：草稿 z 615…636 会被排水沟（在 x −132 处 z≈626）横着切断，收到 z 615…623.5（北段 11 m + 南段 8.5 m，站得下 12 个人）。
//   · 土坎顶：草稿 1.3（高出平地 1.0）挡不住视线③——机枪趴着（眼 0.8）到土坎西边蹲着的人（眼 1.35）这条线在坎顶上方 0.02 m。
//     改成 1.7（高出平地 1.4）。
//   · 沟底的点都挪到沟中线上：排水沟沟底只有 1.6 m 宽，草稿的 ditchHalt (−48,621.2)、15-2 机位 (−100,623.6) 都落在南壁上（比沟底高 0.3…0.8）。
//     ditchHalt 改成 (−48,620.05)；关键帧生成器里沟里的人一律按弧长在中线上取点（DitchPoint）。
//   · 接收院的马灯：院里两盏都在 2.2 m 的院墙后头，18-4 从南岸看不见。院门里侧加一根 2.8 m 的灯桩（`gateLamp`，灯挂在 2.6 m），
//     从南堤后看它越过东墙上方 0.3 m；视线⑤改看这盏。原来两盏照旧摆（军医那盏、厢房门口那盏）。
// ===========================================================================

import { L0610_VILLAGE, L0610_GENG, L0610_STREETS, L0610_STREET_YARDS, L0610_RIVER, L0610_PLACES } from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

export const L1218_LEVEL_KEY = "FirstLevel1218";
export const L1218_TITLE = "第一关 12–18 · 北沙河（新剧本白盒）";

/** 场地范围与高度网格（0.5 m 一格，与 0105 / 0610 一样）。北边只要村南那一截当背景。 */
export const L1218_BOUNDS = Object.freeze({ minX: -250, maxX: 150, minZ: 480, maxZ: 895 });
export const L1218_CELL_M = 0.5;

const P = (x, z) => Object.freeze({ x, z });
const Line = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));
const Box = (minX, maxX, minZ, maxZ) => Object.freeze({ minX, maxX, minZ, maxZ });

/** 从 0610 借来的东西（原样引用，不抄）。 */
export const L1218_FROM_0610 = Object.freeze({
  village: L0610_VILLAGE,             // 整村压平 +0.3、fadeM
  geng: L0610_GENG,                   // 老耿家（后门、后院）
  backLane: L0610_STREETS.backLane,   // 后门外往南的小路 x 98、z 506…545
  southYards: Object.freeze({ west: L0610_STREET_YARDS.southWest, east: L0610_STREET_YARDS.southEast }),
  river: L0610_RIVER,                 // 河汊子的横断面（沟底宽、深、两壁、岸上土埂）
  backDoor: L0610_PLACES.backDoor,
  villageSouth: L0610_PLACES.villageSouth,
});

/**
 * 地面怎么接：z < seamZ 的点一律用 0610 的 L0610Ground（村南、后门小路、河汊子直段逐点一致）；
 * z ≥ seamZ 用本关的地面：平地 = 0105 的 NaturalHeight + plainY（与 0610 的 BaseHeight 在 z ≥ 372 是同一个式子），
 * 再叠村子压平的余波（0610 的 VillageWeight，box 到 z 548、fadeM 10）与本关的开挖 / 堆土。
 * 接缝两侧抽点比对（SceneTest 查）：差 ≤ 0.03 m。
 */
export const L1218_GROUND = Object.freeze({ seamZ: 556, plainY: 0.3 });

/** 自然地面以外的几个绝对高度，米。 */
export const L1218_HEIGHTS = Object.freeze({
  plain: 0.3,                // 平地（另有 0105 NaturalHeight 的低频起伏）
  roadLower: 0.15,           // 大路车辙压低
  laneLower: 0.1,            // 出村小路压低
  gutterDepth: 0.45,         // 路边浅沟（13 人往里扑的那种）
  ditchFloorY: -1.9,         // 排水沟沟底（沟比人深：两岸 0.3，深 2.2）
  leveeCrestY: 1.5,          // 河堤顶（比平地高 1.2）
  waterY: -1.6,              // 北沙河水面
  riverBedY: -2.6,           // 河底
  bridgeBarY: -1.85,         // 浮桥底下那一溜浅滩（演员只能站在 ≤ 1 m 的块顶上：桥面顶 −0.95，离它 0.9）
  deckTopY: -0.95,           // 浮桥桥面顶
  trenchDepth: 0.9,          // 桥头散兵坑
  bankTopY: 1.7,             // 最后一拨人躲的土坎顶（比平地高 1.4；草稿 1.3 挡不住机枪到蹲着的人那条视线，见文件头注）
  gateYardY: 0.3,            // 北门内外压平
});

/** 出村小路：0610 的后门小路（到 z 545）再往南接到大路。 */
export const L1218_LANE = Object.freeze({ name: "出村小路", line: Line([98, 545], [98, 612]), halfW: 1.5 });

/** 大路：沿北沙河北岸东西向，东头出界（鬼子从那边来），西头到桥头空场。路两边各一道浅沟。 */
export const L1218_ROAD = Object.freeze({
  name: "大路", line: Line([150, 612], [98, 612], [-20, 612], [-150, 612]), halfW: 2.5,
  gutterOffset: 3.4,         // 浅沟中线离路中线（南北各一道）
  gutterW: 1.2,
  gutterFromX: -132,         // 浅沟西头（再往西是桥头空场）
});

/**
 * 河汊子：0610 的直段（中线 L0610_RIVER.centerX，10-21 第五版贴到庄子西墙 x 40 的墙根，不再抄 19）在村西南拐弯往西，沿大路北边一直出西界。
 * 横断面照 0610 的 L0610_RIVER。头两点在直段上（z 540…566 与 0610 的直沟逐点一致，接缝 z 556 两边才对得上），
 * 然后三拐（约 20° / 45° / 20°）转到朝西，拐弯都在 z ≤ 592、离大路中线（z 612）≥ 20 m、离出村小路（x 98）≥ 60 m。
 */
const HECHA_X0 = L0610_RIVER.centerX;   // 34.5
export const L1218_HECHA = Object.freeze({
  // 过了 x −100 往北偏一点：绕开桥头北边的院子（YardNorth），见文件头注
  name: "河汊子", line: Line([HECHA_X0, 540], [HECHA_X0, 566], [HECHA_X0 - 6, 582], [HECHA_X0 - 24, 590], [-40, 592], [-100, 590], [-125, 575], [-260, 571]),
  floorW: L0610_RIVER.floorW, wallM: L0610_RIVER.wallM, depth: L0610_RIVER.depth,
  bankH: L0610_RIVER.bankH, bankW: L0610_RIVER.bankW, waterW: L0610_RIVER.waterW, waterH: L0610_RIVER.waterH,
});

/** 排水沟：大路南边的沟口 → 顺着路往西 → 穿过河堤的口子 → 桥脚东边的河滩（「这沟通河边」）。 */
export const L1218_DITCH = Object.freeze({
  // 头一点在路南浅沟的中线上（z 612 + 3.4），沟口斜坡从浅沟底往南下到沟底；见文件头注
  name: "排水沟", line: Line([-40, 615.4], [-40, 619.5], [-70, 621.5], [-120, 623.5], [-137, 627.5], [-146, 636], [-145, 646]),
  floorW: 1.6, wallM: 0.9, floorY: L1218_HEIGHTS.ditchFloorY,
  mouthRampM: 6,             // 沟口：从路边浅沟斜着下到沟底的坡（担架抬得进去；6 m 落 1.6 m，1:3.75）
  outletFromM: 8,            // 最后这么长沟底抬起来，出口落在河滩上（约 −1.4）
  outletY: -1.4,
});

/** 两道河堤（东西向），各在浮桥处留一个口子（桥的引道、北边还有排水沟穿过去）。 */
export const L1218_LEVEES = Object.freeze({
  north: Object.freeze({ z: 636, gap: Object.freeze({ minX: -154, maxX: -142 }) }),
  south: Object.freeze({ z: 714, gap: Object.freeze({ minX: -153.5, maxX: -146.5 }) }),
  crestW: 2, baseHalfW: 4,
});

/** 北沙河：东西向，水面 z 650…700；北岸从堤脚斜下到水边，南岸同。浮桥那一溜河底抬成浅滩。 */
export const L1218_RIVER = Object.freeze({
  name: "北沙河", waterMinZ: 650, waterMaxZ: 700, northToeZ: 640, southToeZ: 710,
  barHalfW: 3,               // 浮桥底下浅滩的半宽（x 方向，以桥中线为准）
  flowDir: -1,               // 往西流
});

/** 浮桥：船一条挨一条，船上铺板；两头是穿过河堤口子的引道（烘进高度场）。 */
export const L1218_BRIDGE = Object.freeze({
  name: "浮桥", x: -150, northFootZ: 646, southFootZ: 704,
  deckW: 2.4, segments: 14, segmentM: 4, deckT: 0.12,  // 14 段，每段一块桥面板（块）；桥脚 646…704 共 58 m，每段实际 4.14 m
  boat: Object.freeze({ alongZ: 1.6, acrossX: 5, h: 0.7 }),   // 每段中心底下一条船，船顶贴着桥面板底
  postEveryM: 8, postH: 1.0,                          // 两边的栏杆桩
  lanternsAtZ: Object.freeze([650, 674, 698]),         // 挂马灯的桩
  northRampFromZ: 638, southRampToZ: 712,             // 引道：平地高 → 桥面高
  blownSegments: Object.freeze([0, 1, 2, 3]),          // 18 炸掉北头这几段（从北往南数，0 = 最北）
  debris: Object.freeze([P(-158, 652), P(-163.5, 657), P(-170, 653.5), P(-176, 659)]),   // 炸断的桥面与船往下游漂（西）
});

/** 桥头：空场、散兵坑、接收院（三个院子里的主院）、旁边的院子。 */
export const L1218_BRIDGEHEAD = Object.freeze({
  square: Box(-165, -133, 604, 636),
  // 散兵坑：路口东边一道南北向的浅坑，面朝东（鬼子顺着大路从东边来），中间给大路留口子；东沿一溜土袋
  // 南段到 z 623.5 为止：再往南排水沟从 x −132 处（z≈626）横过去，见文件头注
  trench: Object.freeze({ x: -132, segments: Object.freeze([Object.freeze([598, 609]), Object.freeze([615, 623.5])]), floorW: 1.0, wallM: 0.5, sandbagH: 0.5 }),
  officerPost: P(-146, 630.5),                         // 桥头军官
  sapperPosts: Object.freeze([P(-150.6, 650.4), P(-149.2, 654)]),   // 工兵（第一条船上绑炸药）
  sapperSouth: P(-151.2, 703),                         // 工兵在南头捏着引线
  fuse: Line([-150.4, 652], [-150.4, 704]),            // 引线顺着桥板拉到南岸（ChargesSet 起看得见）
});

/** 接收院：桥头西边一个农家院，门开在东墙、朝着空场。墙 2.2；正房、灶屋实心，厢房空心（冬瓜抬进去的那间）。 */
export const L1218_YARD = Object.freeze({
  name: "接收院", box: Box(-200, -162, 598, 634), wallT: 0.5, wallH: 2.2,
  gate: Object.freeze({ wall: "east", z: 616, w: 1.8 }),
  mainHouse: Object.freeze({ box: Box(-198, -170, 599, 606), h: 3.2 }),
  kitchen: Object.freeze({ box: Box(-199, -193, 610, 624), h: 3.0 }),
  xiang: Object.freeze({                               // 厢房（南边那排）
    box: Box(-190, -172, 627, 634), h: 3.0, roofH: 3.0,
    door: Object.freeze({ wall: "north", x: -181, w: 1.2, topH: 2.0 }),
    threshold: Object.freeze({ h: 0.15, d: 0.22 }),    // 门槛（块，16 过门槛那一下）
  }),
  doctorPost: P(-176, 615.4),                          // 军医
  gateGuardPost: P(-160.8, 614.2),                      // 守门的兵（门外）
  queueAlongX: -159.4, queueFromZ: 618, queueToZ: 633,  // 门外墙根排着等的担架（东墙外）
  dongguaInside: P(-182.4, 630.6),                      // 厢房里冬瓜放下的地方
  thresholdSeat: P(-181, 626.55),                       // 17 顺子坐的门槛（朝北看院子；门槛块在 z 627、厚 0.22，坐在它北沿外一点）
  strawBox: Box(-191, -164, 607, 625),                  // 院里铺麦秸、躺满伤员的地方
  lamps: Object.freeze([P(-176, 612), P(-181, 625.5)]), // 院里的马灯（军医那盏、厢房门口那盏；都在院墙后头，南岸看不见）
  gateLamp: Object.freeze({ x: -163.6, z: 618.6, postH: 2.8, lampH: 2.6 }),   // 院门里侧的灯桩：18-4 从南岸越过东墙看得见的那盏（见文件头注）
  strawW: 0.03,
});

/** 桥头旁边另外两个院子（「桥头那几间房」）。 */
export const L1218_OTHER_YARDS = Object.freeze([
  Object.freeze({ id: "YardNorth", box: Box(-160, -139, 584, 604), house: Box(-158, -142, 585.5, 591.5), gateZ: null, gateX: -150 }),
  Object.freeze({ id: "YardWest", box: Box(-238, -206, 600, 632), house: Box(-236, -208, 601.5, 608), gateZ: 616, gateX: null }),
]);

/**
 * 最后一拨人躲的土坎：大路北边地头一道南北向的矮土坎（烘进高度场）。鬼子机枪在东边顺着路北扫过来，
 * 人缩在土坎西边才挡得住；一离开土坎往西跑就全在机枪底下，所以「过不来」，机枪一哑才能跑。
 */
export const L1218_BANK = Object.freeze({ name: "土坎", box: Box(-76, -73.6, 599, 607.6), topY: L1218_HEIGHTS.bankTopY, slopeM: 1.2 });

/** 远处的铁路桥（只做个影子：两座桥墩 + 一道钢梁 + 两头一截路基，西边出界的地方）。 */
export const L1218_RAIL_BRIDGE = Object.freeze({ name: "铁路桥（远处）", x: -244, fromZ: 630, toZ: 720, girderY: 4.0, piersAtZ: Object.freeze([662, 688]) });

/** 南岸往北门的路，与北门（挪近：真实离北沙河十来里，白盒里放在南岸往南 150 m，预演黑场带过）。 */
export const L1218_SOUTH = Object.freeze({
  road: Object.freeze({ line: Line([-150, 712], [-150, 857]), halfW: 2.5 }),
  wall: Object.freeze({ z: 860, t: 6, h: 8, fromX: -250, toX: -40 }),
  gate: Object.freeze({ x: -150, w: 4, h: 4.5 }),      // 门洞
  street: Object.freeze({ x: -150, halfW: 3, fromZ: 863, toZ: 895 }),
  torches: Object.freeze([P(-154, 856), P(-146, 856)]),
  sandCarts: Object.freeze([P(-155.6, 852.6), P(-157.6, 849)]),
  waterBucket: P(-146.2, 856.6),
  flatBox: Box(-200, -100, 840, 895),
});

/** 日常摆件：kind 决定尺寸与颜色；位置是中心；ry 弧度。 */
export const L1218_PROP_KINDS = Object.freeze({
  OverturnedCart: Object.freeze({ w: 2.4, d: 1.5, h: 0.6, semantic: "timber", name: "翻倒的驴车" }),
  CartWheel: Object.freeze({ w: 0.9, d: 0.12, h: 0.9, semantic: "timber", name: "车轮" }),
  AmmoBox: Object.freeze({ w: 0.5, d: 0.34, h: 0.3, semantic: "timber", name: "弹药箱" }),
  Sandbag: Object.freeze({ w: 0.6, d: 0.35, h: 0.25, semantic: "canvas", name: "土袋" }),
  Bundle: Object.freeze({ w: 0.7, d: 0.5, h: 0.45, semantic: "canvas", name: "包袱铺盖" }),
  HandCart: Object.freeze({ w: 1.4, d: 0.8, h: 0.7, semantic: "timber", name: "独轮车 / 小车" }),
  Straw: Object.freeze({ w: 2.0, d: 1.4, h: 0.06, semantic: "canvas", name: "麦秸" }),
  WaterVat: Object.freeze({ w: 0.8, d: 0.8, h: 0.9, semantic: "plaster", name: "水缸" }),
  Lantern: Object.freeze({ w: 0.2, d: 0.2, h: 0.3, semantic: "danger", name: "马灯" }),
  Torch: Object.freeze({ w: 0.15, d: 0.15, h: 2.0, semantic: "danger", name: "火把" }),
  Charge: Object.freeze({ w: 0.4, d: 0.3, h: 0.25, semantic: "danger", name: "炸药包" }),
  DoorBoard: Object.freeze({ w: 1.0, d: 0.18, h: 1.9, semantic: "timber", name: "靠墙的门板" }),
});
const Prop = (id, x, z, ry = 0) => Object.freeze({ id, kind: id.split("_")[0], x, z, ry });
export const L1218_PROPS = Object.freeze([
  // 大路上：堵在桥头的队伍丢下的东西
  Prop("Bundle_R1", -64, 610.2, 0.3), Prop("Bundle_R2", -97, 613.8, 1.1), Prop("HandCart_R1", -112, 609.6, 0.1),
  Prop("AmmoBox_R1", -120, 614.4, 0.6), Prop("Bundle_R3", -127, 610.4, 0.2),
  // 桥头空场
  Prop("AmmoBox_Q1", -140.6, 629.2, 0.2), Prop("AmmoBox_Q2", -141.4, 630.0, 1.4), Prop("WaterVat_Q1", -163.6, 606.2),
  // 接收院里
  Prop("WaterVat_Y1", -194.6, 626.4), Prop("DoorBoard_Y1", -165.2, 606.4, 0), Prop("DoorBoard_Y2", -168.0, 624.0, 1.5708),
  // 北门外
  Prop("HandCart_G1", -155.6, 852.6, 0.2), Prop("HandCart_G2", -157.6, 849, -0.1), Prop("Sandbag_G1", -143.5, 854.6), Prop("Sandbag_G2", -142.9, 855.1),
]);

/** 场景信号（关键帧 signals 与场景文件 gates 共用的名字）。 */
export const L1218_SIGNALS = Object.freeze({
  cartOverturned: "CartOverturned",   // 13-1 末起：驴车翻在路边（翻倒的车与车轮这两个块出现；立着的车是单位 GengCart，从 13-2 起不再摆）
  chargesSet: "ChargesSet",           // 18-1 起：北头几条船上绑了炸药包、引线拉到南岸
  bridgeBlown: "BridgeBlown",         // 18-3 末起：北头四段桥面与船没了、碎片往下游漂
});

/** 关键地点。x/z 是中心或站点。 */
export const L1218_PLACES = Object.freeze({
  backDoor: L0610_PLACES.backDoor,                                  // 老耿家后门 (98,506)
  villageSouth: L0610_PLACES.villageSouth,                          // 村南口 (98,545)
  gengSmoke: P(98, 500),                                            // 12-1 回头看见冒烟的地方（老耿家后院 / 后门那一片）
  laneJunction: P(98, 612),                                         // 出村小路接上大路
  cartRaidAt: P(-13.5, 612),                                        // 13-1 驴车被扫的地方（车中心）
  ditchMouth: P(-40, 619.5),                                        // 沟口
  dropAt: P(-31.6, 617),                                            // 14 顺子扑倒的地方（路南浅沟边）
  ditchHalt: P(-48, 620.05),                                        // 15A 沟底歇下的地方（在沟中线上；草稿 (−48,621.2) 在南壁上，见文件头注）
  ditchOutlet: P(-145, 646),                                        // 沟到头：桥脚东边的河滩
  bridgeNorthFoot: P(-150, 646),
  bridgeSouthFoot: P(-150, 704),
  yardGate: P(-162, 616),
  xiangDoor: P(-181, 627),
  southLeveeCover: P(-146, 717),                                    // 18-4 南岸堤后（站着眼睛刚好越过堤顶往北看）
  railBlast: P(-244, 676),                                          // 18-1 远处铁路桥炸的地方（爆点离地 4–6 m）
  lastGroupCover: P(-77.6, 604),                                     // 18-2 最后一拨人缩在土坎西边（挡着东边的机枪）
  ijaMg: P(-40, 606.4),                                              // 18-2 鬼子机枪（大路北边）
  ijaMortar: P(6, 600),                                              // 18-2 掷弹筒（再往东）
  northGate: P(-150, 860),
  sunWest: P(-260, 600),                                             // 太阳在西边（只给机位朝向参考）
});

/** 出生点：12-1 出村小路上，朝南。 */
export const L1218_SPAWN = Object.freeze({ x: 98, z: 590, yawDeg: 180 });
