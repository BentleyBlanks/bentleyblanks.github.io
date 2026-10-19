// ===========================================================================
// Data_EditorBlockoutFirstLevel0610Space.mjs —— 第一关 06–10 白盒（关卡键 FirstLevel0610）的空间锚点
//
// 唯一口径：Notion「第一关｜往南的路 · 剧本」06–10 节（10-19 用户拍板的第二版）+ 集成负责人 10-19 的第二版契约 §2（第一版契约 §3 的做法、坐标系不变）。
// 坐标与 FirstLevel0105 同一套：原点 = 01–05 的沟口；X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南。
// 06 的干沟、南岸枯树、凹路口都从 Data_EditorBlockoutFirstLevel0105Space import 现成常量，不抄数字：0105 那边改了，重跑生成器就跟着变。
// 0105 里没有的往南部分（凹路南段、村口路沟、河汊子、耿家庄）写在这里。
//
// 场景生成器（Script_EditorBlockoutFirstLevel0610Scene.mjs）按这里烘地形与体块，
// 关键帧生成器（Script_EditorBlockoutFirstLevel0610Keyframes.mjs）按这里摆人、POI 与机位。都只读本表；要挪地方先改这里，再重跑生成器。
// 纯数据：零 three、零 DOM，node 与浏览器共用。
//
// 第二版（2026-10-19）改了什么、为什么（第一版的不一致项在后面一段照旧）：
//   · 村口路沟（新）：村口外一道东西向的沟，中线 z 380、沟底宽 3 m、沟底 −0.9（与凹路末端路底一致，比村口地面 +0.3 低 1.2 m），x 56…125；
//     凹路直接接进沟底（原来村口前 12 m 坡道升到村口地面的做法删掉），主街口从沟南沿上去：街口那一段南壁放缓成 3.6 m 的坡道（驴车能上），别处 1.3 m 陡壁。
//   · 小队射击位置：契约写「西半截 x 78…98」。但主街只有 6 m 宽、北窗离沟 90 m，趴在 x < 97 的沟沿上视线被主街西墙（x 96.75）的北头挡死，
//     物理上看不见窗口；所以四个趴着打的人都趴在**街口坡道的上半截**（x 97.4…102.6、z 384.2…384.5，眼刚高过街面），顺子在最西头，离巷子口 17.5 m（≤ 20 ✓）；
//     老耿、班长、排长、卫生兵在沟底街口西边（x 93…103、z 380）。
//   · 巷子口挪出机枪射线：巷子东西那截（z 398）在主街那头用院墙封死（主街西墙上不再开口）；北边那片院子（x 60…96.75、z 385…397）中间开一条 2 m 宽的南北夹道（x 79…81），
//     北头开在路沟南沿上（巷子口 (80,384)），南头接东西那截巷子。那片院子因此拆成两院（x 60…78.5 / 81.5…96.75），原来跨在夹道上的房子拆成两座。
//   · 翻倒的大车：契约写「主街偏西 (99.5,425)」。从街口趴着看北窗（x 97）的视线扇在 z 446 处落在 x 97.2…98.8，车放在西半边会把除顺子以外的人全挡死；
//     所以车放在 (100.8,446)、横在街上（x 99.5…102.1），班长四人顺着主街**东边**的门洞往前摸、躲在车北侧（契约写西边）。车加高到 1.15 m，车轮立在车身上。
//   · 主街东侧最南那院的西南角收掉一块（x 103.25…112、z 452…460 并进小空地，叫「北角」）：08-4 喊人的鬼子从大门出来先往街里跑几步、再从北角拐去东街，
//     趴在街口能看见他 ≥ 1.5 s（契约给的两个办法都用了）；10-4 抄后路的日军也从北角的院门钻出来，正好在石碾西北、背后。
//   · 前屋南门视线（09-6）：灶屋收成 x 82…90、z 480…486（契约 x 82…91、z 480…487），顺子蹲在 (86,497)（离侧门 5.4 m）透过前屋南门（x 94）看得见副射手的后背；
//     不收灶屋，这条线要么被灶屋东南角挡、要么顺子得离侧门 7 m 以上。
//   · 东街重做：北侧第二个院（x 150…182）改成对东街敞开的场院（南墙中段 x 156…176 不要，不盖房），中间一垛 4.2×4×3 m 的麦秸垛 (164,452)，掷弹筒组躲它北边；
//     南侧院墙外贴着东街一座土地庙 (192,466.4)、开口朝北；北边抄后路的院子链：场院 → 北侧第一个院（x 118.25…150）→ 主街东侧最南那院 → 北角的院门，
//     沿途三道门扇随信号 NorthYardGatesBroken 倒下；主街东侧的院子收到 x 103.25…118.25（第一版 x 到 135，和东街北侧院子叠在一起）。
//   · 不上房：前屋平顶保留（白盒不建坡顶），但没有人站在房顶上；扔手榴弹的改成大门过道里的鬼子 gatePost。roofPost 这个名字保留（旧预演还 import），指向过道。
//   · 邻院西墙的小门本来就没放门扇（人跑的时候没关），照旧。
//
// 与第一版契约 §3 草稿不一致的地方（第一版就挪了的，都是摆不下 / 接不上）：
//   · 凹路：契约折线 (83,159)→(86,200)→(90,260)…；0105 的凹路已经烘到 (80,199)，为了和 0105 逐点接上，
//     本表沿用 0105 的全部折线到 (80,199)，再接 (84,230)→(90,260)→(96,320)→(100,378)（路沟北沿）。所以 z 185…230 这一段路中线在 x 80…84，比契约西 2…6 m。
//   · 老耿家前屋：契约 x 82…118 占满整个院宽，后院就没有车能进的门（11 里驴车要从后门出村）。
//     这里前屋收到 x 82…106.4，x 106.9…109.5 留一道 2.6 m 的大门（门洞到后院的过道夹在前屋东墙与偏屋西墙之间）；
//     前门因此从 x≈108 挪到 x 104，偏屋从 x 109…118 挪到 x 110…118.25（给过道让 1 m）。北窗 x 97 不动。
//   · 巷子南北那一截：契约 x≈56；邻院西墙在 x 60，巷子 2 m 宽贴着它走，中线在 x 58.75。
//   · 地瓜窖：契约窖口 1.2×1.2；0.5 m 的高度网格挖 1.2 m 的坑只剩一个尖，窖坑挖 1.6×1.6（坑壁过渡 0.15，第四版前是 0.4），窖口 1.2 的样子由窖沿矮块与盖板表现。
//   · 石碾：从 (113,466) 挪到 (113.2,465.7)，趴在它西边的人才能顺着东街看到东头（不被东街南侧院墙的墙头挡住）。
//   · 妮儿捡弹壳的地方：第二版剧本改成「蹲在沟沿上」挡着何有田的路，放在凹路口边上干沟南岸的坎脚 (56.5,157.3)；老耿的车停在南岸树底下（沟底贴着南壁，(54.5,155)）。
//   · 地瓜窖：契约 (110,499) 离侧门 28 m，但剧本「留下的那个鬼子站在八九米外」、契约也写「9 m 左右」，按剧本挪到 (90.5,499.5)（离侧门 9 m）；
//     墙缝随之从 z 493 挪到 z 496.5、缝 0.2 m（从缝里看窖口斜 18°，0.5 m 厚的墙上一道缝看得到）。
// ===========================================================================

import {
  L0105_CELL_M, L0105_HEIGHTS, L0105_GULLY, L0105_GULLY_TREES, L0105_SUNKEN_LANE, L0105_PLACES, L0105_TRENCHES,
  PointAlong, PointBeside, LineLength,
} from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

export { PointAlong, PointBeside, LineLength };

export const L0610_LEVEL_KEY = "FirstLevel0610";
export const L0610_TITLE = "第一关 06–10 · 耿家庄（新剧本白盒）";
export const L0610_VERSION = "2026-10-20 第四版（第二版空间 + 缸挪开位置 / 两个后门信号 / 窖壁收直）";

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
  laneMouthY: -0.9,                  // 凹路末端 = 路沟沟底（比村口地面 +0.3 低 1.2 m）
  ditchFloorY: -0.9,                 // 村口路沟沟底
  riverDepth: 3.0,                   // 河汊子沟底比两岸低多少
  cellarDepth: 2.0,                  // 地瓜窖深
});

/** 平地起伏的大形：沿 z 的控制点（z, 高度），之间平滑过渡；z ≤ 200 为 0（不碰 0105 那一片）。 */
export const L0610_PLAIN_PROFILE = Object.freeze([[200, 0], [262, L0610_HEIGHTS.plainRise], [300, L0610_HEIGHTS.plainRise], [372, L0610_HEIGHTS.village], [560, L0610_HEIGHTS.village]]);

/**
 * 凹路（后送路）：0105 的折线原样接上，再往南到村口路沟的北沿 (100,378)，路底一路缓升到沟底 −0.9 直接接进沟里（第二版：不再有升到村口地面的坡道）。
 * floorKnots：弧长 ≥ 0105 折线长以后路底高度的控制点（按点的位置记，生成器换算成弧长）。
 */
export const L0610_LANE = Object.freeze({
  line: Line(...L0105_SUNKEN_LANE.line.map((p) => [p.x, p.z]), [84, 230], [90, 260], [96, 320], [100, 378]),
  floorW: L0105_SUNKEN_LANE.floorW,
  wallM: L0105_SUNKEN_LANE.wallM,
  floorKnots: Object.freeze([
    Object.freeze({ at: P(84, 230), y: L0610_HEIGHTS.laneDeepY }),
    Object.freeze({ at: P(90, 260), y: L0610_HEIGHTS.laneDeepY }),
    Object.freeze({ at: P(96, 320), y: L0610_HEIGHTS.laneMidY }),
  ]),
  mouthY: L0610_HEIGHTS.laneMouthY,
});

/**
 * 村口路沟（第二版新加）：村口外一道东西向的沟，凹路接在它中间（x 100），主街口从它南沿上去。
 * 沟底 3 m 宽、−0.9；两壁 1.3 m 陡起；街口那一段（|x − 100| ≤ rampHalfW）南壁放缓成 rampWallM 的坡道（驴车能上）；两头 endM 内收掉。
 * 沟北沿是麦地（村子以北的平地 +0.3）。沟东半截放后送队和老耿的车，街口坡道上半截趴着小队，巷子口在 x 80 的南沿上。
 */
export const L0610_DITCH = Object.freeze({
  name: "村口路沟", z: 380, floorW: 3, fromX: 56, toX: 125, floorY: L0610_HEIGHTS.ditchFloorY,
  wallM: 1.3, endM: 4, rampWallM: 3.6, rampHalfW: 3.0, rampBlendM: 1.5,
  eastHalfFromX: 104, westHalfToX: 98,
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

/** 街：主街南北向、东街窄巷、巷子三截（夹道 / 东西 / 南北）、后门外往南出村的小路。都是中线 + 半宽。 */
export const L0610_STREETS = Object.freeze({
  main: Object.freeze({ name: "主街", x: 100, halfW: 3, fromZ: 385, toZ: 470 }),
  square: Object.freeze({ name: "老耿家门前的小空地", box: Box(82, 118, 460, 470) }),
  pocket: Object.freeze({ name: "小空地北角（主街东侧最南那院收掉的西南角）", box: Box(103.25, 112, 452, 460) }),
  east: Object.freeze({ name: "东街（窄巷）", z: 465, halfW: 1.75, fromX: 118, toX: 232 }),
  alleyNorth: Object.freeze({ name: "巷子（北头的夹道）", x: 80, halfW: 1, fromZ: 383, toZ: 398 }),   // 北头开在路沟南沿上
  alleyWest: Object.freeze({ name: "巷子（东西那截）", z: 398, halfW: 1, fromX: 58.75, toX: 81 }),      // 主街那头封死
  alleySouth: Object.freeze({ name: "巷子（南北那截）", x: 58.75, halfW: 1, fromZ: 397, toZ: 492 }),
  backLane: Object.freeze({ name: "后门外的小路", x: 98, halfW: 1.25, fromZ: 506, toZ: 545 }),
});

/** 老耿家（主街南头正对着街）。墙的坐标是墙的中线；门窗给中心与宽。 */
export const L0610_GENG = Object.freeze({
  compound: Box(82, 118.25, 470, 506),                       // 东墙 x 118.25 与东街南侧的院子共用
  frontRoom: Object.freeze({ box: Box(82, 106.4, 470, 478), roofH: 3.5, parapetH: 0.35 }),
  window: Object.freeze({ x: 97, w: 1.4, sillH: 0.9, topH: 2.0 }),          // 北窗，正对主街
  frontDoor: Object.freeze({ x: 104, w: 1.2, topH: 2.0 }),                 // 前门，朝北开，门口就是小空地
  roomYardDoor: Object.freeze({ x: 94, w: 1.2, topH: 2.0 }),               // 前屋南墙开向后院的门：09-6 的视线门、10-1 顺子冲进去的门
  carriageGate: Object.freeze({ minX: 106.9, maxX: 109.5, topH: 2.6 }),    // 大门：驴车走这里进后院（过道到 z 480）
  passageEastX: 109.75,                                                     // 过道东墙 = 偏屋西墙往北延到北院墙
  yard: Box(82, 118.25, 478, 506),
  // 灶屋：第二版收成 x 82…90、z 480…486（09-6 的视线要从灶屋东南角外头过去）；门在东墙中段，朝院子
  kitchen: Object.freeze({ box: Box(82, 90, 480, 486), roofH: 3.0, door: Object.freeze({ z: 483.5, w: 1.2 }) }),
  sideRoom: Object.freeze({ box: Box(110, 118.25, 480, 492), roofH: 3.0, door: Object.freeze({ z: 486, w: 1.2 }) }), // 门在西墙
  stove: Object.freeze({ x: 83.2, z: 481.4, w: 1.6, d: 0.9, h: 0.8 }),     // 灶台（灶屋西北角）
  board: Object.freeze({ x: 84.4, z: 485.1, w: 1.4, d: 0.6, h: 0.85 }),    // 案板（南墙根）
  mill: Object.freeze({ x: 100, z: 487, baseW: 1.5, baseH: 0.4, stoneW: 1.1, stoneH: 0.35 }),   // 石磨（后院中间偏北）
  // 地瓜窖：契约 (110,499) 离侧门 28 m，剧本「留下的那个鬼子站在八九米外」、契约也写「9 m 左右」——按剧本的距离来，窖口离侧门 9 m
  // 坑壁：第四版（10-20）从 0.4 收到 0.15 —— 契约与 PrevizVillage V2 的 VilHandsUpClimbOut 都按「四壁直的 2 m 坑」写；0.5 m 的高度网格
  // 做不出真正的直壁，但壁的过渡 ≤ 0.2 时离坑心 1.0 m 那一圈格点就是整高（原来 0.4 时是半深 −0.7，坑口在网格里宽到 3 m），
  // 坑在网格里就是：坑心 ±0.5 m 平底、0.5…1.0 m 一段 45° 斜壁、1.0 m 外是院子地面。爬出窖的根按这个口径放在坑心外 1.1 m（预演生成器）。
  cellar: Object.freeze({ x: 90.5, z: 499.5, floorW: 1.6, wallM: 0.15, depth: L0610_HEIGHTS.cellarDepth, mouth: 1.2, rimH: 0.15 }),
  cellarLid: Object.freeze({ x: 92.3, z: 501.0, w: 1.3, d: 1.3, t: 0.08, ry: 0.35 }),            // 掀开的木盖板，扔在窖口东南
  cellarLidBlown: Object.freeze({ x: 94.0, z: 497.4, ry: 1.1 }),                                    // 炸飞后的位置
  pisserOffset: P(1.4, -2.3),                                                                        // 09-5 撒尿的看守：窖口东北、汉子尸体边（离侧门口约 9 m）
  haystack: Object.freeze({ x: 85.5, z: 503.4, w: 2.4, d: 1.8, h: 1.6 }),   // 柴草垛（后院西南角）：09-4 妮儿缩在它后头
  backDoor: Object.freeze({ x: 98, w: 1.2, topH: 2.0 }),                   // 朝南的后门（南墙 z 506）
  backVat: Object.freeze({ x: 98, z: 504 }),                                // 堵在门里头的大水缸
  // 10 末挪开后：老耿站在缸西边 (96.95,504) 面朝东，把缸顺着 z 504 往东推 1.7 m（PrevizVillage V2 的 VilPushVat，清单 stage vatDoor：
  // vatStart 1.05 m → vatEnd 2.75 m 在根前方）→ (99.7,504.0)，让开 x 97.4…98.6 的门口；第三版写的 (99.7,503.4) 与片段方向距离对不上
  backVatMoved: Object.freeze({ x: 99.7, z: 504.0 }),
  sharedWall: Object.freeze({ x: 81.5, fromZ: 474, toZ: 506 }),            // 与邻院共用的那道墙
  dogHole: Object.freeze({ z: 488, w: 0.45, h: 0.4 }),                     // 狗洞（大人钻不过）
  // 墙缝：契约 z≈493；窖口挪到 (90.5,499.5) 以后从 z 493 看它要斜 36°，0.5 m 厚的墙上一道缝看不到那么斜，挪到 z 496.5（斜 18°）、缝 0.2 m
  crack: Object.freeze({ z: 496.5, w: 0.2 }),                              // 墙缝（竖缝，能看进后院）
  sideGate: Object.freeze({ z: 500, w: 1.0, leafW: 0.85, leafT: 0.1 }),    // 侧门：门扇 0.85，北侧留 0.15 的门缝；铰链在南
  gatePost: P(108.2, 472.6),                                                 // 大门过道里扔手榴弹的鬼子（门楼后头甩出来）
  roofPost: P(108.2, 472.6),                                                 // 第二版不上房：旧名字保留给旧预演 import，指向大门过道
  mgPost: P(97, 472.4),                                                      // 北窗机枪
  mgLoaderPost: P(95.7, 473.0),                                              // 副射手（09-6 透过前屋南门看见的是他的后背）
  sightPost09_6: P(86, 497),                                                 // 09-6 顺子蹲的地方（离侧门 5.4 m）
});

/** 邻院（老耿家西边，共用 x 81.5 那道墙）。西墙小门不放门扇（人跑的时候没关）。 */
export const L0610_NEIGHBOR = Object.freeze({
  box: Box(60, 81.5, 474, 506),
  westDoor: Object.freeze({ z: 490, w: 1.0, leaf: false }),                // 从巷子进邻院的小门：敞着
  house: Object.freeze({ box: Box(62, 78, 475, 481), h: 3.0 }),
  vat: P(79.6, 476.6), coop: P(63.5, 503.2),
});

/**
 * 东街两侧的院子：北侧 z 440…463、南侧 z 467…490；隔墙把每侧分成几个院；每院一座房。
 * 第二版：北侧第二个院（x 150…182）是场院（对东街敞开、不盖房，中间一垛麦秸垛）；南侧院墙外贴着东街一座土地庙；
 * 北边抄后路的院子链：场院西隔墙的门 → 北侧第一个院 → 它的西墙的门 → 主街东侧最南那院 → 北角的院门。三道门扇随 NorthYardGatesBroken 倒下。
 */
export const L0610_EAST_YARDS = Object.freeze({
  north: Object.freeze({ box: Box(118.25, 232, 440, 463), splitsX: Object.freeze([150, 182, 214]), gatesX: Object.freeze([140, 196, 222]) }),
  south: Object.freeze({ box: Box(118.25, 232, 467, 490), splitsX: Object.freeze([146, 178, 210]), gatesX: Object.freeze([132, 158, 186, 212]) }),
  farmyard: Object.freeze({ name: "场院（打谷场）", minX: 150, maxX: 182, openFromX: 156, openToX: 176 }),   // 南墙 x 156…176 不要
  strawStack: Object.freeze({ name: "麦秸垛", x: 164, z: 452, w: 4.2, d: 4.0, h: 3.0 }),
  mortarHide: P(164.2, 455.4),                                             // 掷弹筒组躲在麦秸垛北侧
  shrine: Object.freeze({ name: "土地庙", x: 192, z: 466.4, w: 1.6, d: 1.2, h: 1.8, wallT: 0.15 }),   // 贴着东街南侧院墙，开口朝北
  northChain: Object.freeze({
    farmyardDoor: Object.freeze({ x: 150, z: 450, w: 1.5 }),               // 场院西隔墙上的门（场院 → 北侧第一个院）
    yard1Door: Object.freeze({ x: 118.25, z: 455, w: 1.5 }),               // 北侧第一个院西墙上的门（→ 主街东侧最南那院）
    pocketGate: Object.freeze({ x: 108, z: 452, w: 1.5 }),                 // 北角北墙上的院门（→ 小空地北角，石碾西北、背后）
  }),
  southClimb: P(126, 490),                                                 // 10-5 南边翻墙摸后门的地方（南侧第一个院的南墙）
  fieldEast: P(245, 465),                                                   // 东头外面的麦地
});

/** 主街两侧与巷子西边的院子。 */
export const L0610_STREET_YARDS = Object.freeze({
  westOfMain: Object.freeze({ box: Box(60, 96.75, 400, 460), splitsZ: Object.freeze([430]), gatesZ: Object.freeze([418.5, 443.5]) }),
  // 第二版：收到 x 118.25（第一版到 135，和东街北侧的院子叠在一起）；最南那院的西南角是小空地的北角（L0610_STREETS.pocket）
  eastOfMain: Object.freeze({ box: Box(103.25, 118.25, 385, 460), splitsZ: Object.freeze([410, 435]), gatesZ: Object.freeze([408.5, 432.5]) }),
  northOfAlleyWest: Object.freeze({ box: Box(60, 78.5, 385, 397) }),       // 夹道西边
  northOfAlleyEast: Object.freeze({ box: Box(81.5, 96.75, 385, 399.25) }), // 夹道东边（南到巷子南墙）
  westOfAlley: Object.freeze({ box: Box(40, 57.5, 397, 492), splitsZ: Object.freeze([430, 462]) }),
  squareNorthWallZ: 460,                                                    // 小空地北边（北角东墙到老耿家东墙那一截）
  southWest: Object.freeze({ box: Box(60, 96.75, 506, 545) }),
  southEast: Object.freeze({ box: Box(99.25, 135, 506, 545) }),
  villageSouthZ: 545,
});

/** 村里的日常摆件（占位体块）：kind 决定尺寸与颜色；位置是中心；ry 弧度。 */
export const L0610_PROP_KINDS = Object.freeze({
  OverturnedCart: Object.freeze({ w: 2.6, d: 1.6, h: 1.15, semantic: "timber", name: "翻倒的大车" }),   // 第二版加高到 1.15：3–4 个人蹲在它北侧躲窗口的枪
  CartWheel: Object.freeze({ w: 0.7, d: 0.12, h: 0.7, semantic: "timber", name: "车轮" }),
  WaterVat: Object.freeze({ w: 0.8, d: 0.8, h: 0.9, semantic: "plaster", name: "水缸" }),
  Haystack: Object.freeze({ w: 2.2, d: 1.8, h: 1.5, semantic: "canvas", name: "柴垛" }),
  StrawStack: Object.freeze({ w: 4.2, d: 4.0, h: 3.0, semantic: "canvas", name: "麦秸垛" }),
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
  // 主街：翻倒的大车（横在街上、偏东，见文件头）、水缸、门板、草帘
  Prop("OverturnedCart_S1", 100.8, 446, 0), Prop("CartWheel_S1", 101.4, 445.4, 0),
  // 街边的水缸 / 门板都靠主街东墙：西半边是街口趴着的人看北窗的视线扇
  Prop("WaterVat_S1", 102.5, 413.4), Prop("WaterVat_S2", 102.6, 455.6), Prop("DoorBoard_S1", 102.9, 428, 1.5708), Prop("StrawMat_S1", 102.9, 408.5, 1.5708),
  // 小空地与东街口
  Prop("WaterVat_Q1", 117.5, 469.2), Prop("Haystack_Q1", 85, 462.4, 0.2), Prop("DoorBoard_Q1", 118.0, 471.6, 1.5708),
  // 东街两侧院里：场院里的麦秸垛、南侧院里的磨盘 / 鸡笼 / 水缸
  Prop("StrawStack_F1", L0610_EAST_YARDS.strawStack.x, L0610_EAST_YARDS.strawStack.z, 0),
  Prop("Millstone_E1", 188, 484), Prop("ChickenCoop_E1", 160, 486.6), Prop("WaterVat_E1", 123, 486), Prop("WaterVat_E2", 196.6, 460.8),
  // 主街两侧院里
  Prop("Haystack_W1", 70, 452, 0), Prop("ChickenCoop_W1", 92, 405), Prop("Millstone_W1", 116.5, 456), Prop("WaterVat_W1", 106, 390),
  // 夹道（小空地西头到邻院北墙之间）
  Prop("Haystack_L1", 66, 468, 0.1),
  // 后门外的小路边
  Prop("Haystack_B1", 94.4, 520, 0), Prop("WaterVat_B1", 101.2, 534),
]);
/** 塌了一角的房子（院子里的某座房 + 塌下来的墙角）：按 L0610_HOUSES 的 id。 */
export const L0610_COLLAPSED_HOUSES = Object.freeze(["House_EN3", "House_WM1"]);

/** 场景信号（关键帧 signals 与场景文件 gates 共用的名字）。 */
export const L0610_SIGNALS = Object.freeze({
  cartDeparted: "CartDeparted",   // 06-3 起：老耿赶车走了，车上那几箱弹药（体块）跟着车走（本关没有「块跟着单位」的能力，用信号把它们收掉）
  cellarBlast: "CellarBlast",     // 09-4 起：窖里闷响一声，窖口冒烟、盖板飞开
  sideGateOpen: "SideGateOpen",   // 09-5 起：侧门从里头拔开门闩、推开
  mgSilenced: "MgSilenced",       // 10-1 起：北窗机枪组被从背后打掉；10-2 那挺枪出现在石碾后头
  northYardGatesBroken: "NorthYardGatesBroken",   // 10-4 起：北边院子链上的三道门被砸倒
  // 10-6 起（第四版 10-20 把原来一个 BackDoorOpen 拆成两个：缸推到位是片段 2.8 s、门板摆开是 6.1 s，一个信号缸就得等到拔门闩才跳过去）
  backVatMoved: "BackVatMoved",   // 10-6 起：老耿把堵门的水缸推到门东边（BackVat → BackVatMoved）
  backDoorOpen: "BackDoorOpen",   // 10-6 起：后门闩拔开、门板拉开到西墙边（BackDoorLeaf → BackDoorLeafOpen）
});

/** 有名字的地方。x/z 是中心或站点；yawDeg 是站在那里该朝的方向。 */
export const L0610_PLACES = Object.freeze({
  assembly: L0105_PLACES.assembly,                                           // 集结处（干沟）
  assemblyEntry: L0105_PLACES.assemblyEntry,                                 // 交通沟坡道下到干沟
  gullyRest: P(L0105_PLACES.assembly.x - 5, L0105_PLACES.assembly.z + 1),    // 02 末冬瓜躺的地方（空了）
  laneHead: L0105_PLACES.laneHead,                                           // 凹路口
  cartStop: Object.freeze({ name: "老耿的驴车（南岸树底下）", x: 54.5, z: 155, yawDeg: -90 }),   // 干沟沟底贴着南壁，头顶就是南岸那排枯树
  nierRim: Object.freeze({ name: "妮儿捡弹壳的沟沿", x: 56.5, z: 157.3 }),  // 凹路口边上，干沟南岸的坎脚（挡着往凹路走的路）
  villageMouth: Object.freeze({ name: "村北口（街口坡道顶）", x: 100, z: 385 }),
  laneEnd: Object.freeze({ name: "凹路尽头（接进路沟）", x: 100, z: 376 }),
  ditch: Object.freeze({ name: "村口路沟", x: 100, z: L0610_DITCH.z }),
  ditchEast: Object.freeze({ name: "路沟东半截（后送队）", x: 114, z: L0610_DITCH.z }),
  ditchWest: Object.freeze({ name: "路沟西半截", x: 88, z: L0610_DITCH.z }),
  alleyMouth: Object.freeze({ name: "巷子口", x: L0610_STREETS.alleyNorth.x, z: 384 }),
  square: Object.freeze({ name: "老耿家门前的小空地", x: 100, z: 465 }),
  pocket: Object.freeze({ name: "小空地北角", x: 107.6, z: 456 }),
  roller: Object.freeze({ name: "石碾", x: 113.2, z: 465.7, w: 1.2, d: 0.9, h: 0.9, baseW: 2.0, baseH: 0.12 }),
  cart: Object.freeze({ name: "翻倒的大车", x: 100.8, z: 446 }),
  eastEnd: Object.freeze({ name: "东街东头", x: 232, z: 465 }),
  river: Object.freeze({ name: "河汊子", x: 19, z: 400 }),
  neighborDoor: Object.freeze({ name: "邻院西墙的小门（敞着）", x: 60, z: 490 }),
  dogHole: Object.freeze({ name: "狗洞", x: 81.5, z: 488 }),
  crack: Object.freeze({ name: "墙缝", x: 81.5, z: 496.5 }),
  sideGate: Object.freeze({ name: "侧门", x: 81.5, z: 500 }),
  kitchenDoor: Object.freeze({ name: "灶屋门", x: 90, z: 483.5 }),
  sideRoomDoor: Object.freeze({ name: "偏屋门", x: 110, z: 486 }),
  roomYardDoor: Object.freeze({ name: "前屋南门", x: 94, z: 478 }),
  frontDoor: Object.freeze({ name: "前门", x: 104, z: 470 }),
  carriageGate: Object.freeze({ name: "大门（车道）", x: 108.2, z: 470 }),
  gatePassage: Object.freeze({ name: "大门过道", x: 108.2, z: 474 }),
  northWindow: Object.freeze({ name: "北窗", x: 97, z: 470 }),
  mill: Object.freeze({ name: "石磨", x: 100, z: 487 }),
  cellar: Object.freeze({ name: "地瓜窖", x: 90.5, z: 499.5 }),
  backDoor: Object.freeze({ name: "后门", x: 98, z: 506 }),
  villageSouth: Object.freeze({ name: "村南口", x: 98, z: 545 }),
  farmyard: Object.freeze({ name: "场院", x: 166, z: 458 }),
  strawStack: Object.freeze({ name: "麦秸垛", x: L0610_EAST_YARDS.strawStack.x, z: L0610_EAST_YARDS.strawStack.z }),
  shrine: Object.freeze({ name: "土地庙", x: L0610_EAST_YARDS.shrine.x, z: L0610_EAST_YARDS.shrine.z }),
  southClimb: Object.freeze({ name: "南边翻墙处", x: L0610_EAST_YARDS.southClimb.x, z: L0610_EAST_YARDS.southClimb.z }),
  mortarHide: L0610_EAST_YARDS.mortarHide,
  fieldEast: L0610_EAST_YARDS.fieldEast,
});

/** 08 趴在街口坡道上压窗口的四个人（顺子在最西头、离巷子口最近）；场景生成器核视线、关键帧生成器摆人都用这几个点。 */
export const L0610_MOUTH_SHOOTERS = Object.freeze([
  Object.freeze({ who: "player", x: 97.4, z: 384.3 }),
  Object.freeze({ who: "Yaowa", x: 99.5, z: 384.4 }),
  Object.freeze({ who: "Squad3", x: 101.1, z: 384.5 }),
  Object.freeze({ who: "LiuWencai", x: 102.6, z: 384.2 }),
]);

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
