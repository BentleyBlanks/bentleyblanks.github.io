// ===========================================================================
// Data_EditorBlockoutFirstLevel1218Space.mjs —— 第一关 11–18 白盒（关卡键 FirstLevel1218）的空间锚点（2026-11-02 第四版）
//
// 唯一口径：集成负责人 2026-11-02 的《FirstLevel1218 白盒第四版契约》（tmp/Contract1218_v4.md 第二节）+ 用户看过的第八版空间图。
// 第三版（10-26：轴对齐锯齿院子、村西口田间小路、北门、老汉家、钻洞的一家、九四式）整体换掉：
//   耿家庄村南口 → 土路 → 交叉口 → 官道（往南）→ 村口反坦克沟上的板桥 → 北沙河村（官道 = 主街从西北往东南斜穿；北街 / 中街 / 南街东西向，
//   西胡同、东胡同、东南胡同、两条死胡同；教堂在官道西边；救护所与女娃家在村西南头）→ 南街口望得见官道桥（二营 13 炸了它）→
//   出村小路 → 北岸土路顺沙河北岸往西南 → 李子行（空村）→ 铁路桥北头土坡 → 四孔钢梁铁路桥过沙河 → 南头河堤 → 南岸路往南（夜里县城的灯）。
// 为什么这样摆（史料，详见契约第一节）：北沙河村在沙河北岸；老官道从西北进村、穿村、从村东南角出去过河往南去滕县（1954 年美军 1:250,000 图）；
//   津浦铁路在村西一公里多，过沙河的铁路桥在村西南约 1.2 km；北岸有土路往西南通铁路桥。3 月 14 日七二七团二营在村子布第二线阵地、收容前线残兵，
//   当天 6 架日机轰炸扫射北沙河；傍晚三营回城；北沙河以北的铁路 2 月被拆、枕木让老乡拿去当柴；村口官道用反坦克沟截断、堆杂木；村民挖洞躲身、
//   墙上刷抗日标语、有人躲进德国教堂。创作：二营炸官道桥、救护所借的院子、女娃家、教堂位置、桥北土坎、三营守桥头、李子行没人。
//   白盒里距离压缩（铁路桥离村约 250 m，真实 1.2 km）。
// 坐标与 FirstLevel0105 / FirstLevel0610 同一套：原点 = 01–05 的沟口；X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南。
// z < 556 的地面与体块是 0610 的（seamZ 556 不变，不抄数字，从 0610 导出量取）。
//
// 场景重建脚本（Script_SceneRebuild1218.mjs）按这里烘地形与体块、拼进两份场景文件；
// 关键帧生成器（Script_EditorBlockoutFirstLevel1218Keyframes.mjs）按这里摆人、POI 与机位。都只读本表；要挪地方先改这里，再重跑。
// 纯数据：零 three、零 DOM，node 与浏览器共用。
//
// 与契约建议值不一样的地方（摆不下 / 视线不成立 / 运行时限制才改的，报告里也列了）：
//   · 板桥朝正南（ry 0）而不是偏 10–15°：路线在沟上那一截 (99,637)→(99,645) 是正南的，桥板一转 ±1.25 m 的横向站点就掉到板外（土墩顶 −0.75），
//     驴车那条路的横向高差查不过；桥板底下仍垫土墩（顶 −0.75，演员只能站在比高度场高 ≤ 1 m 的块顶上）。
//   · 杂木不是连成一条：枣树枝一堆一堆（每堆 3 m、堆间空 1.2 m），板桥口子留 3.8 m，沟口东段战壕前头 x 106…124 这 18 m 还没堆到（二营的兵正往这儿添）：
//     战壕里站着的人（眼 0.72 m）要看得见沟北的坟头，连成一条 1.25 m 高的杂木全挡住。
//   · 沙河中线在铁路桥那一段拉直成正东西（x −60…−100 之间 z 940）：桥台 6 m 宽，斜着的坎沿让桥台两边一边悬着一边埋着；别处照契约折线。
//   · 铁路路基从场地北边 z 480 起（契约写「从 z 556 到 1080」）：x < −20 这一条 0610 的场地没盖到，路基到 556 突然断头不像样；0610 场地（x ≥ −20）一个格点不动。
//   · 北岸土路尽头 (−68,912) 离北坎顶约 3.4 m（契约「≥ 5 m」）：那一点已经是上路基的土坡脚，再往北挪就压不到坡；路的其余各点离坎顶 7–15 m。
//   · 教堂中心约 (110,710)（契约「约 (104,710)」）：院门要开在朝官道的前墙上、前墙离官道中线 4 m，院子 22×20 m，中心就在这里；再往西就要把院子做成 32 m 宽。
//
// 18 的引导（2026-11-02 第二轮，用户看截图：「两截长路两边空空荡荡，不知道往哪走」；批了 1 / 3 / 4 三条，2 堤顶路与 5 离路喊话这轮不做）：
//   · 有人可跟：担架队排成一溜走在顺子前头、刘文财跟在后头，顺子落后十来米队头就停下、押队的兵回头等（关键帧 how / notes + 预演）。
//   · 远处有目标：夕阳 sunWest 挪到「土路长直段 (100,868) → 铁路桥北头 (−80,918) 再往外延」的方向上（场地西沿内 (−158,940)），一出村南头顺着路看，太阳正落在铁路桥那头；
//     铁路路基西边一排电线杆 L1218_TELEGRAPH_POLES（7 m 高、35 m 一根、两岸都有）远远标出铁路和桥的位置——这是创作（津浦线沿线有电报线是常识，位置、间距、哪一边没有出处）。
//   · 路上隔一阵有点东西 L1218_ROADSIDE（沿北岸土路按走路顺序每 45–60 m 一处，都从路上看得见）：①一出村南头路北边一个孤零零的院子挨了炸（墙塌半边、房梁冒烟，RaidAftermath 起）；
//     ②再往前路北边一道土墙、墙根一排盖着席子露着脚的人（RaidAftermath 起）；③李子行朝路那一面（LzS2 的南墙）开一个院门，门板歪着斜靠在门框上、地上掉着一只鞋。
//     村里原来那两处（SR1 塌墙、出村小路的席子）保留。
// ===========================================================================

import { L0610_VILLAGE, L0610_GENG, L0610_RIVER, L0610_PLACES, L0610_SOUTH_LANE, L0610_STREETS, L0610_BOUNDS } from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

export const L1218_LEVEL_KEY = "FirstLevel1218";
export const L1218_TITLE = "第一关 11–18 · 北沙河村与铁路桥（新剧本白盒）";
export const L1218_VERSION = "2026-11-02 第四版空间（契约：土路 → 交叉口 → 官道 → 村口反坦克沟与板桥 → 北沙河村（主街斜穿 / 北中南三条街 / 胡同 / 教堂 / 救护所 / 女娃家）→ 南街口望官道桥 → 出村小路 → 北岸土路 → 李子行 → 铁路桥过沙河 → 南头河堤 → 南岸路）";

/** 场地范围与高度网格（0.5 m 一格，与 0105 / 0610 一样）。北边只要耿家庄村南那一截当背景。 */
export const L1218_BOUNDS = Object.freeze({ minX: -160, maxX: 320, minZ: 480, maxZ: 1080 });
export const L1218_CELL_M = 0.5;

const P = (x, z) => Object.freeze({ x, z });
const Line = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));
const Box = (minX, maxX, minZ, maxZ) => Object.freeze({ minX, maxX, minZ, maxZ });
const F = Object.freeze;
const R2 = (v) => Math.round(v * 100) / 100;

/** 从 0610 借来的东西（原样引用，不抄）。 */
export const L1218_FROM_0610 = F({
  village: L0610_VILLAGE,             // 耿家庄整村压平 +0.3、fadeM；box 到 z 548
  geng: L0610_GENG,                   // 老耿家（院子 x 92…108、z 470…486；12-2 回头看见冒烟的地方）
  southLane: L0610_SOUTH_LANE,        // 出村的窄胡同（到村南口 (117,545)）
  backLane: L0610_STREETS.backLane,   // 窄胡同最后一截
  river: L0610_RIVER,                 // 河汊子的横断面（中线 34.5、沟底宽 6、深 3、壁 2.5、岸上土埂 0.4×3、沟底积水 1.0）
  villageSouth: L0610_PLACES.villageSouth,
  bounds: L0610_BOUNDS,
});

/**
 * 地面怎么接：z < seamZ 的点一律不动（0610 的）；x < railFromX（0610 场地以西，0610 没盖到）从 z 480 起叠本关的铁路路基。
 * z ≥ seamZ 用本关的地面：平地 = 0105 的 NaturalHeight + plainY（与 0610 的 BaseHeight 在 z ≥ 372 是同一个式子），叠 0610 村子压平的余波与本关的开挖 / 堆土；
 * 路的压低从接缝起 roadFadeInM 内渐进（接缝上一点不动）。接缝两侧抽点比对（SceneTest 查）：差 0。
 */
export const L1218_GROUND = F({ seamZ: 556, plainY: 0.3, roadFadeInM: 4, railFromX: -20 });

/** 自然地面以外的几个绝对高度，米。 */
export const L1218_HEIGHTS = F({
  plain: 0.3,                // 平地 / 麦地（另有 0105 NaturalHeight 的低频起伏）
  village: 0.3,              // 北沙河村压平
  dirtRoadLower: 0.08,       // 土路 / 小街 / 胡同 / 北岸土路压低
  postRoadLower: 0.12,       // 官道 / 主街压低
  laneLower: 0.08,
  ditchFloorY: -2.5,         // 村口反坦克沟沟底（比平地低 2.8：比人深）
  plankDeckY: 0.2,           // 板桥（门板）顶面：与两头官道路面齐平（路面 0.18）
  plankPlugY: -0.75,         // 板桥底下的土墩顶（桥面下 0.95：演员站得上桥面）
  trenchFloorY: -0.9,        // 村北沿战壕壕底（深 1.2）
  holeFloorY: -1.7,          // 院里躲身的洞：洞底（地面下 2.0；洞顶 0.3 厚，洞里净高 1.7）
  railTopY: 2.6,             // 铁路路基顶（比平地高 2.3）
  sleeperTopY: 2.55,         // 铁路桥上枕木顶（与路基顶差 5 cm）
  riverBedY: -2.7,           // 沙河河床（沙，比平地低 3.0）
  streamFloorY: -3.1,        // 河床中间那一股水的底（深 0.4，齐小腿）
  streamTopY: -2.74,         // 那一股水的水面（比沙面低 4 cm）
  guandaoDeckY: 0.18,        // 官道桥桥面（与两头路面齐平，比沙床高约 2.9）
  leveeCrestY: 1.8,          // 南头河堤顶（比平地高 1.5）
  bankTopY: 1.3,             // 桥北土坎顶（比平地高 1.0）
  bankHollowY: 0.0,          // 土坎背后（南边）那一溜洼（低 0.3）
  pondFloorY: -0.9,          // 村里的水塘底（深 1.2）
  pondWaterY: -0.2,          // 水塘水面
});

// ---------------------------------------------------------------------------
// 路（中心线；halfW 半宽；lower 压低多少）

const Road = (id, name, halfW, lower, line) => F({ id, name, halfW, lower, line });
export const L1218_ROADS = F({
  dirt: Road("DirtRoad", "土路（耿家庄村南口 → 官道）", 1.5, L1218_HEIGHTS.dirtRoadLower, Line([117, 545], [117, 556], [112, 575], [100, 594], [90, 608])),
  postNorth: Road("PostRoadNorth", "官道（北截：西北进场地 → 交叉口 → 沟口）", 2.0, L1218_HEIGHTS.postRoadLower,
    Line([-160, 560], [-100, 572], [-40, 584], [10, 590], [50, 594], [78, 600], [90, 608], [95, 622], [99, 637])),
  plankLink: Road("PlankLink", "官道过板桥那一截", 2.0, L1218_HEIGHTS.postRoadLower, Line([99, 637], [99, 645])),
  mainStreet: Road("MainStreet", "官道（村里 = 主街，从板桥往东南）", 2.2, L1218_HEIGHTS.postRoadLower,
    Line([99, 645], [114, 690], [140, 730], [170, 770], [205, 810], [240, 846], [246, 844])),
  postSouth: Road("PostRoadSouth", "官道（过河往南）", 2.0, L1218_HEIGHTS.postRoadLower, Line([268, 892], [272, 905], [268, 960], [262, 1080])),
  northSt: Road("NorthStreet", "北街", 1.6, L1218_HEIGHTS.laneLower, Line([60, 686], [90, 686], [114, 690], [145, 691], [175, 688], [212, 693])),
  midSt: Road("MidStreet", "中街", 1.8, L1218_HEIGHTS.laneLower, Line([56, 733], [84, 731], [122, 728], [140, 730], [157, 734], [185, 739], [216, 742])),
  southSt: Road("SouthStreet", "南街", 1.6, L1218_HEIGHTS.laneLower, Line([66, 780], [96, 777], [121, 783], [146, 777], [170, 770], [200, 768])),
  westLane: Road("WestLane", "西胡同", 1.2, L1218_HEIGHTS.laneLower, Line([90, 686], [86, 708], [84, 731], [80, 756], [84, 778])),
  eastLane: Road("EastLane", "东胡同", 1.2, L1218_HEIGHTS.laneLower, Line([145, 691], [152, 710], [157, 734])),
  seLane: Road("SouthEastLane", "东南胡同", 1.2, L1218_HEIGHTS.laneLower, Line([185, 739], [190, 756], [188, 771])),
  deadEndN: Road("DeadEndNorth", "死胡同（北街往北）", 1.1, L1218_HEIGHTS.laneLower, Line([175, 688], [178, 668])),
  deadEndW: Road("DeadEndWest", "死胡同（中街往西北，到水塘）", 1.1, L1218_HEIGHTS.laneLower, Line([84, 731], [68, 714])),
  exitPath: Road("ExitPath", "出村小路（南街 → 救护所门前 → 村南头）", 1.5, L1218_HEIGHTS.dirtRoadLower, Line([121, 783], [121, 822], [121, 845])),
  northBank: Road("NorthBankRoad", "北岸土路（村南头 → 顺北岸往西南 → 铁路桥北头的土坡）", 1.5, L1218_HEIGHTS.dirtRoadLower,
    Line([121, 845], [114, 860], [100, 868], [60, 880], [20, 890], [-20, 897], [-55, 905], [-68, 912])),
  southRoad: Road("SouthRoad", "南岸路（铁路桥南头下来往南，18 夜里走的路）", 1.75, L1218_HEIGHTS.dirtRoadLower, Line([-68, 980], [-64, 990], [-55, 1030], [-45, 1080])),
});
/** 救护所院门外的门前空地（出村小路在这里加宽；驴车停这里）。 */
export const L1218_GATE_YARD = F({ name: "救护所门前空地", box: Box(116, 126, 798, 822), lower: L1218_HEIGHTS.dirtRoadLower });
/** 官道与土路的交叉口。 */
export const L1218_JUNCTION = P(90, 608);
/** 南街口（官道上南街拐进去的地方；12-6 从这里顺官道往东南望得见官道桥）。 */
export const L1218_SOUTH_STREET_CORNER = P(170, 770);

// ---------------------------------------------------------------------------
// 村口：反坦克沟、板桥、杂木、村北沿战壕、铁丝网、坟头、田埂

/** 村口反坦克沟：中线折线，顶宽 4、底宽 2.4、深 2.8（沟底 −2.5）、四壁陡；烘进高度图（不归样条网络）。 */
export const L1218_AT_DITCH = F({
  name: "村口反坦克沟", line: Line([40, 650], [70, 645], [99, 641], [140, 638], [178, 642]),
  topW: 4.0, floorW: 2.4, wallM: 0.8, floorY: L1218_HEIGHTS.ditchFloorY,
});
/** 板桥：三块门板，南北向跨沟（见文件头），宽 2.6、长 5；底下垫土墩。 */
export const L1218_PLANK = F({ name: "板桥（门板搭的）", x: 99, z: 641, fromZ: 638.5, toZ: 643.5, w: 2.6, deckT: 0.08, boards: 3, plugHalfW: 1.8 });
/** 沟南沿（村这边）堆的杂木（枣树枝）：一堆一堆，板桥口子留空，沟口东段战壕前头还没堆到（见文件头）。offM：堆的中心离沟中线多远（往南）。 */
export const L1218_ABATIS = F({ name: "杂木（枣树枝）", offM: 2.9, d: 1.6, h: 1.25, gapHalfW: 1.9, pieceLen: 3.0, pieceGap: 1.2, unstacked: F({ fromX: 106, toX: 124 }) });
/** 村北沿战壕（七二七团二营，样条 trenches.segments，preset fire）：沟南边 8–10 m，壕底宽 1、深 1.2、北沿堆土；官道从两段之间（x 92…106）过。 */
export const L1218_TRENCH = F({
  name: "村北沿战壕（七二七团二营）", floorW: 1.0, wallM: 0.35, depth: 1.2, floorY: L1218_HEIGHTS.trenchFloorY, bermH: 0.35, bermW: 1.6, bermOffM: 1.4,
  west: Line([36, 661], [70, 654], [92, 650]),
  east: Line([106, 649], [140, 647], [180, 651], [216, 662]),
});
/** 铁丝网：沟北 z ≈ 628，桩 + 两道横线。 */
export const L1218_WIRE = F({ name: "铁丝网", z: 628, west: F([38, 92]), east: F([106, 182]), postEveryM: 3, postH: 1.3, wireYs: F([0.45, 1.0]) });

/** 坟头（麦地里；烘进高度场：半径 r 的土包、高 h）。沟北边的 G_N1…G_N5 给 13 的鬼子步兵当掩体；G_MG 在 18 的机枪东边。 */
export const L1218_GRAVES = F([
  F({ id: "G_N1", x: 84, z: 614, r: 1.2, h: 0.6 }), F({ id: "G_N2", x: 110.5, z: 616.5, r: 1.1, h: 0.55 }), F({ id: "G_N3", x: 72, z: 608, r: 1.2, h: 0.6 }),
  F({ id: "G_N4", x: 119, z: 605, r: 1.2, h: 0.65 }), F({ id: "G_N5", x: 90, z: 594, r: 1.0, h: 0.5 }),
  F({ id: "G_W1", x: 20, z: 640, r: 1.1, h: 0.55 }), F({ id: "G_W2", x: -40, z: 700, r: 1.2, h: 0.6 }), F({ id: "G_W3", x: -70, z: 760, r: 1.1, h: 0.55 }),
  F({ id: "G_W4", x: -120, z: 700, r: 1.2, h: 0.6 }), F({ id: "G_W5", x: -30, z: 820, r: 1.1, h: 0.55 }), F({ id: "G_W6", x: 40, z: 830, r: 1.2, h: 0.6 }),
  F({ id: "G_MG", x: -70.6, z: 858.6, r: 1.2, h: 0.6 }), F({ id: "G_W7", x: -100, z: 880, r: 1.1, h: 0.55 }),
  F({ id: "G_E1", x: 250, z: 620, r: 1.2, h: 0.6 }), F({ id: "G_E2", x: 270, z: 700, r: 1.1, h: 0.55 }), F({ id: "G_E3", x: 300, z: 780, r: 1.2, h: 0.6 }),
  F({ id: "G_E4", x: 240, z: 660, r: 1.0, h: 0.5 }), F({ id: "G_S1", x: 200, z: 940, r: 1.2, h: 0.6 }), F({ id: "G_S2", x: 100, z: 980, r: 1.1, h: 0.55 }),
  F({ id: "G_S3", x: -20, z: 1000, r: 1.2, h: 0.6 }), F({ id: "G_S4", x: 160, z: 1040, r: 1.1, h: 0.55 }), F({ id: "G_S5", x: -120, z: 1030, r: 1.2, h: 0.6 }),
]);
/** 田埂（东西向，0.25 高；离路 1 m 以内不堆）：沟北边两道给 13 的鬼子趴，其余把四周的地填成一块块田。 */
export const L1218_RIDGES = F([
  F({ z: 611, fromX: 48, toX: 86 }), F({ z: 611, fromX: 97, toX: 190 }), F({ z: 597, fromX: 30, toX: 58 }), F({ z: 597, fromX: 70, toX: 92 }), F({ z: 597, fromX: 105, toX: 200 }),
  F({ z: 640, fromX: -150, toX: 20 }), F({ z: 700, fromX: -150, toX: -30 }), F({ z: 760, fromX: -150, toX: -10 }), F({ z: 820, fromX: -150, toX: 30 }),
  F({ z: 640, fromX: 230, toX: 310 }), F({ z: 700, fromX: 240, toX: 310 }), F({ z: 760, fromX: 240, toX: 310 }), F({ z: 1000, fromX: -140, toX: -60 }),
  F({ z: 1000, fromX: 0, toX: 240 }), F({ z: 1040, fromX: 60, toX: 240 }), F({ z: 920, fromX: 120, toX: 240 }),
]);
export const L1218_RIDGE = F({ h: 0.25, halfW: 0.35 });

// ---------------------------------------------------------------------------
// 北沙河村

/** 村子压平的范围（主街两边的院子都在里头）；院墙 0.5 厚 2.2 高，正房 2.7 高 + 草顶 0.55。 */
export const L1218_VILLAGE = F({ name: "北沙河村", box: Box(55, 222, 655, 840), y: L1218_HEIGHTS.village, fadeM: 4, wallT: 0.5, wallH: 2.2, houseH: 2.7, roofH: 0.55 });
/** 村子的轮廓（涂色用，边缘不规则）。 */
export const L1218_VILLAGE_OUTLINE = Line([58, 668], [96, 656], [150, 654], [200, 658], [222, 672], [222, 790], [206, 832], [166, 824], [124, 842], [82, 842], [58, 806], [54, 760], [56, 700]);

/**
 * 院子条带（确定性生成，同一输入两次逐字相同）：沿着一条街的一截（a → b），在 side 那一边、离街中线 setback 起，一个挨一个排 widths 里的院子，
 * 每个院子深 depth；院墙随这条街的走向转（街斜它就斜，不是第三版那种整齐锯齿）；院门开在朝街的前墙上。
 * side：+1 = 顺 a→b 走向的左手（三 rotation 的局部 +z 方向 (−uz, ux)），−1 = 右手。东西向的街（a 在西）：+1 南侧、−1 北侧；南北向（a 在北）：+1 西侧、−1 东侧。
 * sideHouse：这些院子（按条带内序号）另加一间厢房；lights：夜里亮灯的院子；slogan：朝街的墙上刷大字；sleepers：门口码枕木垛。
 */
const Strip = (id, name, a, b, side, setback, depth, widths, extra = {}) => F({ id, name, a: P(...a), b: P(...b), side, setback, depth, widths: F(widths), ...extra });
/**
 * 条带 / 街坐标架：{ a, b, side } → World(s, d)（s 沿 a→b、d 往 side 那一边离中线多远）、ry（块的 w 边顺着街的 three rotation.y）、u、n（往 side 那边的单位法向）。
 * 三 rotation：局部 +x → 世界 (cos ry, −sin ry)、局部 +z → 世界 (sin ry, cos ry)；ry = atan2(−uz, ux) 时局部 +z = (−uz, ux)，side +1 就是这个方向。
 */
export function StripFrame(spec) {
  const dx = spec.b.x - spec.a.x, dz = spec.b.z - spec.a.z, len = Math.hypot(dx, dz);
  const u = { x: dx / len, z: dz / len }, sign = spec.side >= 0 ? 1 : -1;
  const n = { x: -u.z * sign, z: u.x * sign };
  const ry = Math.round(Math.atan2(-u.z, u.x) * 10000) / 10000;
  return { u, n, ry, len, World: (s, d) => ({ x: R2(spec.a.x + u.x * s + n.x * d), z: R2(spec.a.z + u.z * s + n.z * d) }) };
}
export const L1218_YARD_STRIPS = F([
  // 北街北侧（村北沿）
  Strip("NA", "北街北侧西段", [60, 686], [114, 690], -1, 2.3, 16, [13, 14, 13], { sideHouse: [1] }),
  Strip("NB", "北街北侧中段（官道东边到死胡同）", [119, 690.2], [173, 688.2], -1, 2.3, 16, [13, 14, 13, 14], { sideHouse: [0, 2], slogan: [1] }),
  Strip("NC", "北街北侧东段（死胡同东边）", [180, 687.9], [212, 693], -1, 2.3, 16, [16, 16], { sideHouse: [1], lights: [1], slogan: [0] }),
  // 北街与中街之间
  Strip("WA", "西胡同西侧（北段）", [90, 686], [84, 731], 1, 1.9, 14, [18], { s0: 6 }),
  Strip("DA", "官道东侧（北街到东胡同之间）", [114, 690], [140, 730], -1, 3.6, 13, [12, 13], { s0: 15, sleepers: [0], slogan: [0] }),
  Strip("DB", "东胡同东边、北街南侧", [155.5, 691.15], [212, 693], 1, 2.3, 16, [14, 14, 14, 14], { sideHouse: [1, 3] }),
  Strip("DC", "东胡同东边、中街北侧", [159, 734.3], [214, 741.8], -1, 2.5, 16, [13, 14, 13, 14], { sideHouse: [0, 2], lights: [3] }),
  // 中街与南街之间
  Strip("WB", "西胡同西侧（南段）", [83, 733], [81, 776], 1, 1.9, 14, [18, 18], { s0: 3 }),
  Strip("MA", "中街南侧（西胡同到官道）", [88, 730.7], [138, 730.2], 1, 2.5, 16, [12, 13, 12, 13], { sideHouse: [1, 3] }),
  Strip("SA", "南街北侧（西段）", [90, 777.6], [146, 777], -1, 2.3, 16, [14, 14, 14], { sideHouse: [0, 2], lights: [0] }),
  Strip("MB", "中街南侧（官道东边到东南胡同）", [162, 734.9], [214, 741.8], 1, 2.5, 12, [11, 11], { }),
  Strip("MC", "中街南侧（东南胡同东边）", [195, 739.3], [214, 741.8], 1, 2.5, 14, [19], { }),
  Strip("SB", "南街北侧（官道东边到东南胡同）", [174, 769.7], [200, 768], -1, 2.3, 12, [12], { }),
  // 南街以南
  Strip("SW", "南街南侧西头（救护所西边）", [63, 780.3], [80, 778.6], 1, 2.3, 15.5, [14.5], { }),
  Strip("SR", "南街南侧（出村小路东边）", [128, 781.3], [170, 770], 1, 2.3, 16, [14, 14], { sideHouse: [1], lights: [0], raidWall: [0] }),
  Strip("GW", "官道西侧（南街口往东南）", [170, 770], [205, 810], 1, 3.6, 14, [13, 14, 13], { s0: 10, sideHouse: [1], sleepers: [1], slogan: [0], lights: [1] }),
  Strip("GE", "官道东侧（南街口往东南）", [170, 770], [205, 810], -1, 3.6, 14, [13, 14], { s0: 17, sideHouse: [0], lights: [0], sleepers: [0] }),
]);
/** 挨炸的洞那一家（14 第二拨飞机炸中的）：官道西侧、南街北边，顺官道斜摆；院里有洞（做法同救护所的洞）。 */
export const L1218_BOMBED_YARD = F({
  id: "YBombed", name: "挨炸的洞那一家（南街北边、靠官道）", a: P(140, 730), b: P(170, 770), side: 1, setback: 3.6, s0: 20, width: 20, depth: 14,
  hole: F({ id: "BombedHole", name: "院里挨炸的洞", mouthS: 31.5, mouthD: 9.5, dir: F({ s: 1, d: 0 }), rampM: 2.8, chamber: F({ w: 2.4, d: 2.2 }), slitM: 0 }),   // 坡道斜着穿 0.5 m 格，比别的洞长一点才拖得下去
  crater: F({ s: 36.2, d: 10.4, r: 1.9 }),
});

/** 村里的水井（井台 + 井架）、水塘（挖低 + 水块）、菜园（涂色）。 */
export const L1218_WELLS = F([F({ id: "Well_1", x: 126, z: 699 }), F({ id: "Well_2", x: 146.5, z: 725.5 }), F({ id: "Well_3", x: 183, z: 776 })]);
export const L1218_PONDS = F([
  F({ id: "Pond_N", name: "水塘（村北，死胡同尽头）", x: 181, z: 660, rx: 7, rz: 4.5, fadeM: 2.5 }),
  F({ id: "Pond_W", name: "水塘（村西，死胡同尽头）", x: 61, z: 718, rx: 6, rz: 4.5, fadeM: 2.5 }),
]);
export const L1218_GARDENS = F([
  F({ id: "Garden_1", poly: Line([116, 693], [128, 693], [137, 704], [128, 706]) }),
  F({ id: "Garden_2", poly: Line([112, 718], [124, 715], [134, 724], [130, 727], [112, 727]) }),
  F({ id: "Garden_3", poly: Line([162, 711], [214, 712], [215, 715], [162, 716]) }),
  F({ id: "Garden_4", poly: Line([69, 709], [84, 711], [84, 716], [74, 716]) }),
]);

/**
 * 教堂（德国教堂，位置是创作）：官道西边、北街与中街之间，顺着官道斜摆（不像庄户人家坐北朝南），院门朝官道敞着；礼拜堂比民房高，前头一座钟楼。
 * 用官道 S2 段 (114,690)→(140,730) 的街坐标写：s 沿街（从 a 起）、d 离街中线（西侧为正）。
 */
export const L1218_CHURCH = F({
  name: "德国教堂（位置是创作）", a: P(114, 690), b: P(140, 730),
  s0: 4, s1: 26, d0: 4, d1: 24, wallH: 2.6,
  gate: F({ s: 15, w: 3.2 }),
  hall: F({ s0: 8, s1: 22, d0: 13, d1: 22, h: 6.2 }),
  tower: F({ s: 6, d: 15.5, w: 3.0, h: 10.5 }),
  crowdBox: F({ s0: 7, s1: 24, d0: 6, d1: 12 }),
});

/**
 * 救护所：七二七团借的大院（第三版的锚点整体平移 (+24, +122)）。院门开在东墙 z 812.5，朝门前空地和出村小路；
 * 正房在北（实心）、灶屋东北角、厢房在西（空心，东墙门带 0.15 门槛：16 过门槛）；院里铺麦秸躺满伤员、马灯两盏；两处洞（东边那处洞顶留 0.3 缝）。
 */
export const L1218_AID = F({
  name: "救护所（七二七团借的院子）", box: Box(82, 116, 788, 822), wallT: 0.5, wallH: 2.2,
  gate: F({ wall: "east", z: 812.5, w: 2.0 }),
  mainHouse: F({ box: Box(82.5, 115.5, 788.5, 795.5), h: 3.2 }),
  kitchen: F({ box: Box(108, 115.5, 796, 803), h: 3.0 }),
  xiang: F({
    box: Box(82.5, 90.5, 798, 816), h: 3.0, roofH: 3.0,
    door: F({ wall: "east", z: 807, w: 1.2, topH: 2.0 }),
    threshold: F({ h: 0.15, d: 0.22 }),
  }),
  // 洞：mouth = 坡道顶（地面）、dir = 往哪边下（单位向量）、rampM 坡道长、chamber 洞内一小间（宽 w 横着坡道、深 d 顺着坡道）；roofT 洞顶厚；slitM 洞顶漏光的缝
  holes: F([
    F({ id: "AidHoleA", name: "院里的洞（东）", mouth: P(104.6, 816.0), dir: P(-1, 0), rampM: 3.0, chamber: F({ w: 3.4, d: 3.4 }), slitM: 0.3 }),
    F({ id: "AidHoleB", name: "院里的洞（西南）", mouth: P(94.0, 819.6), dir: P(0, -1), rampM: 3.0, chamber: F({ w: 3.0, d: 2.6 }), slitM: 0 }),
  ]),
  roofT: 0.3,
  wallRootDonggua: P(113.4, 818.6),    // 冬瓜搁的墙根（东墙里、院门南边；到洞口十几步中间无挡）
  doctorPost: P(98.5, 803.5),          // 军医（院里）
  gateGuardPost: P(93.2, 809.6),       // 守厢房门的兵（门外）
  dongguaInside: P(86.6, 810.6),       // 厢房里冬瓜放下的地方
  thresholdSeat: P(91.2, 807),         // 17 顺子坐的门槛（朝东看院子；门槛块在 x 90.5、厚 0.22，坐在它东沿外一点）
  strawBox: Box(92, 107, 797.5, 812),  // 院里铺麦秸、躺满伤员的地方
  lamps: F([P(98.5, 801.0), P(92.0, 805.0)]),
  strawW: 0.03,
});

/** 女娃家：救护所南边隔壁的院子，共用的那道墙（z 822）东半截塌成 0.6 高墙根 + 土堆，救护所院里越过塌墙看得见她家洞口；院门开在东墙。 */
export const L1218_GIRL_YARD = F({
  name: "女娃家（隔壁院）", box: Box(82, 110, 822, 840), houses: F([F({ box: Box(82.5, 94, 834, 839.5) })]),
  gate: F({ wall: "e", at: 834, w: 1.6 }),
  collapsed: F({ fromX: 90, toX: 109, h: 0.6 }),
  hole: F({ id: "GirlHole", name: "女娃家院里的洞", mouth: P(97.0, 829.6), dir: P(0, 1), rampM: 2.2, chamber: F({ w: 2.4, d: 2.2 }), slitM: 0, mat: F({ w: 1.6, d: 1.4 }) }),
});

/** 驴车停在救护所门前空地（12-7 起；14-3 黑子挨了一梭，连车带驴翻在这里）：车头朝南（顺着来路），黑子在车辕里。 */
export const L1218_CART_PARK = F({ cart: P(122.0, 807.0), yawDeg: 180, heizi: P(122.0, 810.4), overturned: P(122.3, 807.3), overturnedRy: 0.35 });

/** 枕木垛（门口码的；由条带 sleepers 生成）、大字标语（条带 slogan 生成 + 教堂前墙一条）的字。 */
export const L1218_SLOGAN_TEXTS = F(["打倒日本帝国主义", "抗战到底", "中国人不打中国人 一致抗日", "誓死不当亡国奴"]);

/** 李子行：北岸土路北边一个空了的小村（五个院子，轴对齐、坐北朝南，两排夹一条土巷）。 */
export const L1218_LIZIHANG = F({
  name: "李子行（空了的小村）", box: Box(-42, 20, 850, 886),
  lane: F({ z: 868, halfW: 1.2, fromX: -42, toX: 20 }),
  yards: F([
    F({ id: "LzN1", box: Box(-40, -24, 850, 866), gate: "s" }), F({ id: "LzN2", box: Box(-22, -6, 850, 866), gate: "s" }), F({ id: "LzN3", box: Box(-4, 14, 850, 866), gate: "s" }),
    F({ id: "LzS1", box: Box(-32, -16, 870, 886), gate: "n" }), F({ id: "LzS2", box: Box(-12, 6, 870, 886), gate: "n", backGate: F({ w: 1.6 }) }),   // LzS2 南墙再开一个朝北岸土路的院门（18 引导 ③）
  ]),
});

/** 北岸土路中心线上 x 处的点、那一截的方向 u（顺着走的方向，往西南）与朝北的法向 n。路的 x 从东往西单调减。 */
export function NorthBankAtX(x) {
  const L = L1218_ROADS.northBank.line;
  for (let i = 1; i < L.length; i++) {
    const a = L[i - 1], b = L[i];
    if (x <= a.x && x >= b.x) {
      const len = Math.hypot(b.x - a.x, b.z - a.z), u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
      const t = a.x === b.x ? 0 : (a.x - x) / (a.x - b.x);
      let walked = 0;
      for (let k = 1; k < i; k++) walked += Math.hypot(L[k].x - L[k - 1].x, L[k].z - L[k - 1].z);
      return { x, z: R2(a.z + (b.z - a.z) * t), u, n: { x: -u.z, z: u.x }, s: R2(walked + len * t) };
    }
  }
  return null;
}
/**
 * 18 引导：北岸土路边三处小场景（2026-11-02 第二轮，见文件头）。按走路顺序排，相邻约 46 m，都离路中线 ≤ 10 m、从路上看得见（SceneTest 查）。
 *   lonelyYard：一出村南头、路北边一个孤零零的院子（x 80…95、z 851…866，院门朝路）；RaidAftermath 起东南角塌了（前墙东半截 + 东墙南半截成 0.6 墙根、角外一堆碎砖）、
 *               正房东半间塌成一堆、一根房梁斜搭在堆上冒烟（烟是预演 smoke 事件）。
 *   wallMats：再往前路北边一道土墙（顺着路，离路中线 5.5 m，长 17、高 1.8），墙根朝路那一面一排 6 张席子（RaidAftermath 起）。
 *   liziGate：李子行 LzS2 朝路的南墙开一个院门，门板歪着斜靠在门框上、门外地上掉着一只鞋（没有鞋的资产：小体块，prop Shoe）。
 */
export const L1218_ROADSIDE = F({
  lonelyYard: F({
    id: "LoneYard", name: "路北边孤零零挨了炸的院子", box: Box(80, 95, 851, 866), wallH: 2.0,
    gate: F({ x: 87.5, w: 1.6 }),                       // 前墙（南墙 z 866）上的院门
    collapsedFromX: 88.3,                               // 前墙从这儿到东头随 RaidAftermath 塌成 0.6 墙根
    collapsedFromZ: 857,                                // 东墙从这儿到南头也塌了（东南角整个塌：从村南头走过来先看见的就是这个角）
    house: F({ box: Box(82, 93, 851.5, 857), h: 2.7, splitX: 87.5, heapH: 1.1 }),   // 正房：西半间完好、东半间塌成一堆
    beam: F({ x: 90.6, z: 856.2, len: 4.2, ry: 0.55 }),  // 斜搭在堆上的房梁（冒烟的地方）
    rubble: P(90.2, 863.8),
  }),
  wallMats: F({ id: "RoadWall", name: "路北边的土墙（墙根一排盖席子的人）", atX: 42, offM: 5.5, len: 17, h: 1.8, t: 0.4, mats: F({ n: 6, stepM: 1.7, offM: 4.1 }) }),
  liziGate: F({ id: "LiziGate", name: "李子行朝路的院门（门板歪着、地上一只鞋）", yard: "LzS2", doorBoard: F({ dx: 0.35, dz: 0.3, ry: 0.5 }), shoe: F({ dx: -0.9, dz: 1.6, ry: 1.1 }) }),
});
/**
 * 津浦铁路沿线的电线杆（18 引导：远远一排竖线标出铁路和桥的位置；创作）：路基西边 7 m（坡脚外 1 m）、7 m 高、35 m 一根，从 z 570 起到场地南边，
 * 沙河两岸的坎沿与河堤那一截不放（两岸各自接着排）；杆顶一根横担、杆与杆之间一根线。
 */
export const L1218_TELEGRAPH = F({ x: -87, fromZ: 570, everyM: 35, h: 7.0, w: 0.22, crossArm: F({ len: 1.4, t: 0.1, belowTopM: 0.4 }), wireT: 0.03, riverGapM: 4 });

/** 村里村外的树（脚印 ≤ 1 m、高 ≥ 2 m 的 foliage 块 = 编辑器种枯树）。离路 ≥ 1 m、不进院子（生成器查）。 */
export const L1218_TREES = F([
  // 村里：院子之间的夹道、菜园边、水塘边
  [108, 660], [66, 662], [62, 648], [118, 724], [165, 713], [200, 714], [76, 713], [60, 727], [168, 758], [112, 753], [80, 793], [78, 804], [112, 828], [130, 804], [165, 800],
  [192, 662], [169, 656], [197, 657], [56, 728], [116, 668], [218, 720], [206, 760], [87, 757], [214, 798], [192, 826],
  // 村口与沟北
  [30, 630], [60, 620], [130, 622], [160, 618], [200, 625], [24, 662], [226, 650], [40, 600], [160, 585], [210, 590],
  // 村外西边与北岸
  [-30, 640], [-80, 650], [-130, 680], [-60, 720], [0, 700], [-110, 760], [-20, 770], [30, 760], [-140, 830], [-50, 840], [10, 840], [-100, 850], [50, 850], [100, 850], [60, 886], [-38, 884], [25, 848],
  // 村外东边
  [250, 600], [280, 640], [240, 700], [280, 720], [250, 760], [300, 760], [240, 800], [290, 820], [300, 880], [230, 912], [280, 900],
  // 南岸
  [-150, 985], [-100, 1000], [-20, 990], [40, 1000], [120, 980], [200, 980], [260, 1000], [-120, 1050], [0, 1050], [80, 1050], [180, 1050], [-80, 1070], [120, 1065],
  // 李子行与铁路边
  [-46, 858], [24, 862], [-10, 846], [-60, 790], [-56, 830],
].map(([x, z], i) => F({ x, z, h: 5 + ((i * 7) % 5) * 0.6 })));

/** 麦地 / 菜地的拼块（涂色，第八版图里的绿块）。 */
export const L1218_FIELD_PATCHES = F([
  Box(-150, -40, 600, 640), Box(-30, 30, 600, 650), Box(120, 230, 570, 625), Box(240, 310, 580, 660), Box(-150, -100, 700, 760), Box(-60, 0, 690, 750),
  Box(240, 310, 690, 760), Box(-150, -60, 780, 840), Box(-20, 40, 800, 845), Box(240, 310, 790, 830), Box(60, 110, 850, 880), Box(140, 240, 900, 950),
  Box(-150, -90, 990, 1040), Box(-30, 60, 990, 1040), Box(100, 240, 990, 1040), Box(-140, -30, 1050, 1080), Box(60, 220, 1050, 1080),
]);

// ---------------------------------------------------------------------------
// 沙河、官道桥、铁路、铁路桥、土坎、河堤、县城的灯

/**
 * 沙河：中线折线（东北 → 西南，从村东南外经过，往西南到铁路；铁路桥那一段拉直，见文件头）。
 * 北坎顶 = 中线往北 halfTop、南坎顶 = 往南 halfTop（顺垂直方向量）。断面照第三版：陡坎 3 m（水平 cliffM 内落完）、沙床 −2.7、中间一股水宽 7 深 0.4、
 * 北岸 / 南岸各一处滑坡道（铁路桥东边 10–20 m，18 老乡蹚水用）。
 */
export const L1218_RIVER = F({
  name: "沙河",
  line: Line([320, 836], [290, 850], [262, 866], [230, 880], [180, 892], [120, 902], [60, 912], [0, 922], [-40, 930], [-60, 940], [-100, 940], [-120, 950], [-160, 960]),
  halfTop: 22, cliffM: 2.0, bedY: L1218_HEIGHTS.riverBedY,
  stream: F({ halfW: 3.5, edgeM: 1.0, offsetD: 1.5 }),
  slides: F([F({ id: "SlideNorth", name: "北岸的滑坡道", x: -66, bank: "north", halfW: 1.6, lenM: 9 }), F({ id: "SlideSouth", name: "南岸的滑坡道", x: -63, bank: "south", halfW: 1.6, lenM: 9 })]),
});
const RIVER_ARCS = (() => {
  const out = [0];
  for (let i = 1; i < L1218_RIVER.line.length; i++) { const a = L1218_RIVER.line[i - 1], b = L1218_RIVER.line[i]; out.push(out[i - 1] + Math.hypot(b.x - a.x, b.z - a.z)); }
  return out;
})();
/**
 * 沙河的河道坐标：s = 沿中线的弧长（从东头起）、d = 离中线的有符号距离（+ 往南）、q = 中线上最近的点、u = 中线方向、n = 往南的法向。
 * 中线在拐点处取最近的那一截（弯都很缓，d 不跳）。
 */
export function RiverFrame(x, z) {
  const L = L1218_RIVER.line;
  let best = Infinity, out = null;
  for (let i = 1; i < L.length; i++) {
    const a = L[i - 1], b = L[i], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ux + (z - a.z) * uz) / len));
    const qx = a.x + ux * len * t, qz = a.z + uz * len * t;
    const dist = Math.hypot(x - qx, z - qz);
    if (dist < best) {
      best = dist;
      const nx = uz, nz = -ux;   // 往南（中线朝西南走，右手是南）
      out = { s: RIVER_ARCS[i - 1] + len * t, d: (x - qx) * nx + (z - qz) * nz, q: { x: qx, z: qz }, u: { x: ux, z: uz }, n: { x: nx, z: nz }, seg: i - 1 };
    }
  }
  return out;
}
/** 弧长 s 处中线上的点与方向、法向。 */
export function RiverAtS(s) {
  const L = L1218_RIVER.line;
  let i = 1;
  while (i < L.length - 1 && RIVER_ARCS[i] < s) i++;
  const a = L[i - 1], b = L[i], len = RIVER_ARCS[i] - RIVER_ARCS[i - 1], t = Math.max(0, Math.min(1, (s - RIVER_ARCS[i - 1]) / len));
  const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, u: { x: ux, z: uz }, n: { x: uz, z: -ux } };
}
export const RIVER_LENGTH = RIVER_ARCS[RIVER_ARCS.length - 1];
/** 中线经过 x 处的弧长（中线的 x 从东往西单调减）。 */
export function RiverArcAtX(x) {
  const L = L1218_RIVER.line;
  for (let i = 1; i < L.length; i++) {
    const a = L[i - 1], b = L[i];
    if (x <= a.x && x >= b.x) { const t = a.x === b.x ? 0 : (a.x - x) / (a.x - b.x); return RIVER_ARCS[i - 1] + (RIVER_ARCS[i] - RIVER_ARCS[i - 1]) * t; }
  }
  return x > L[0].x ? 0 : RIVER_LENGTH;
}
/** 河道坐标 → 世界。 */
export function RiverPoint(s, d) {
  const c = RiverAtS(s);
  return { x: R2(c.x + c.n.x * d), z: R2(c.z + c.n.z * d) };
}
/** x 处的沙河：北坎顶 / 北坎脚 / 南坎脚 / 南坎顶的世界点、那一股水的中线点（顺着当地的法向量）。 */
export function RiverAtX(x) {
  const R = L1218_RIVER, s = RiverArcAtX(x);
  return {
    s, northTop: RiverPoint(s, -R.halfTop), northToe: RiverPoint(s, -(R.halfTop - R.cliffM)), southToe: RiverPoint(s, R.halfTop - R.cliffM), southTop: RiverPoint(s, R.halfTop),
    stream: RiverPoint(s, R.stream.offsetD), center: RiverPoint(s, 0),
  };
}

/** 官道桥（木桥，二营 13 炸了它）：官道过河处，北头 (246,844)、南头 (268,892)，桥面宽 4、与两头路面齐平，木桩每 8 m 一排；中间三跨随 GuandaoBridgeBlown 没了。 */
export const L1218_GUANDAO_BRIDGE = F({
  name: "官道桥（木桥）", north: P(246, 844), south: P(268, 892), deckW: 4.0, deckT: 0.22, deckY: L1218_HEIGHTS.guandaoDeckY,
  pileEveryM: 8, pile: F({ w: 0.3, d: 0.3 }), rail: F({ h: 0.9, w: 0.1 }),
  spans: 6, blownSpans: F([2, 3, 4]),
});

/** 津浦铁路：南北向路基，中线 x −80，顶 2.6（高 2.3）、顶宽 5、两坡 1.5:1；桥北只有光路基（铁轨枕木 2 月被拆），桥南有轨有枕木。 */
export const L1218_RAIL = F({ name: "津浦铁路路基", x: -80, topW: 5, slope: 1.5, topY: L1218_HEIGHTS.railTopY, gauge: 1.435, railW: 0.07, railH: 0.15, fromZ: 480 });
/** 上下路基的土坡（东坡上斜着垫出来的坡道，宽 3）：桥北头一处（北岸土路上来）、桥南头一处（下到南岸路，在河堤南边）。 */
export const L1218_RAIL_RAMPS = F([
  F({ id: "RampNorth", name: "桥北头上路基的土坡", from: P(-68, 912), to: P(-77.2, 912), halfW: 1.5 }),
  F({ id: "RampSouth", name: "桥南头下路基的土坡", from: P(-68, 980), to: P(-77.2, 980), halfW: 1.5 }),
]);
export const L1218_RAIL_RAMP = L1218_RAIL_RAMPS[0];

const AT_RAIL = RiverAtX(L1218_RAIL.x);
/** 铁路桥：路基在 x −80 跨沙河（北坎顶约 z 918、南坎顶约 962），四孔钢梁（每孔约 11 m）、石桥台 + 三座石墩、枕木每 0.6 m 一根、两根轨，无栏杆。 */
export const L1218_RAIL_BRIDGE = F({
  name: "铁路桥（钢梁四孔）", x: L1218_RAIL.x, northZ: R2(AT_RAIL.northTop.z), southZ: R2(AT_RAIL.southTop.z), spans: 4,
  girder: F({ offX: 1.2, w: 0.4, h: 1.2 }), pier: F({ w: 3.0, d: 1.8 }), abutment: F({ w: 6.0, d: 2.0 }),
  sleeper: F({ len: 2.8, w: 0.24, h: 0.15, everyM: 0.6 }),
  walkW: 2.4,                         // 看不见的走道宽（standOn：演员站在枕木顶上）
  blownSpans: F([0, 1]),              // 炸掉北头这两孔（从北往南数，0 = 最北）
  charges: F([0, 1]),                 // 炸药绑在这两座桥墩上（从北往南数的桥墩，0 = 第一座）
});
/** 桥北土坎（18 班长他们缩在后头）：z 897、x −66…−40，顶比地面高 1 m；坎背后（南边）挖低 0.3 一溜（z 898.2…902）；北岸土路在它南边 8 m。 */
export const L1218_BANK = F({ name: "桥北土坎", z: 897, fromX: -66, toX: -40, halfD: 0.8, slopeM: 1.0, topY: L1218_HEIGHTS.bankTopY, hollow: F({ fromZ: 898.2, toZ: 902, fadeM: 0.8, y: L1218_HEIGHTS.bankHollowY }) });
/** 18 鬼子机枪位：路基东脚 (−73.2,860)，东边一座坟 G_MG。 */
export const L1218_IJA_MG = P(-73.2, 860);
/**
 * 南头河堤：南坎顶往南 6 m（顺着河道坐标 d = halfTop + 6）、x −160…−20，顶 1.8；堤后（南边）浅散兵坑；南岸路从土坡脚起、不过堤。
 */
export const L1218_LEVEE = F({
  name: "南头河堤", offD: 6, fromX: -160, toX: -20, crestW: 1.5, baseHalfW: 3.5, crestY: L1218_HEIGHTS.leveeCrestY,
  foxhole: F({ name: "南头散兵坑", offD: 11.5, fromX: -76, toX: -56, floorW: 1.0, depth: 0.6, wallM: 0.4 }),
});
/** 远处县城的灯：南岸路尽头往南几盏小灯（马灯 / 灯桩），18 夜里从河堤往南看得见几点亮。 */
export const L1218_CITY_LIGHTS = F([P(-52, 1074), P(-40, 1077), P(-28, 1071), P(-60, 1078), P(-20, 1079)]);

// ---------------------------------------------------------------------------
// 摆件、信号、地名

/** 日常摆件：kind 决定尺寸与颜色；位置是中心；ry 弧度。 */
export const L1218_PROP_KINDS = F({
  OverturnedCart: F({ w: 2.4, d: 1.5, h: 0.6, semantic: "timber", name: "翻倒的驴车" }),
  CartWheel: F({ w: 0.9, d: 0.12, h: 0.9, semantic: "timber", name: "车轮" }),
  AmmoBox: F({ w: 0.5, d: 0.34, h: 0.3, semantic: "timber", name: "弹药箱" }),
  Sandbag: F({ w: 0.6, d: 0.35, h: 0.25, semantic: "canvas", name: "土袋" }),
  Bundle: F({ w: 0.7, d: 0.5, h: 0.45, semantic: "canvas", name: "包袱铺盖" }),
  HandCart: F({ w: 1.4, d: 0.8, h: 0.7, semantic: "timber", name: "独轮车 / 小车" }),
  Straw: F({ w: 2.0, d: 1.4, h: 0.06, semantic: "canvas", name: "麦秸" }),
  Mat: F({ w: 1.6, d: 1.3, h: 0.04, semantic: "canvas", name: "席子" }),
  WaterVat: F({ w: 0.8, d: 0.8, h: 0.9, semantic: "plaster", name: "水缸" }),
  Lantern: F({ w: 0.2, d: 0.2, h: 0.3, semantic: "danger", name: "马灯" }),
  Charge: F({ w: 0.5, d: 0.4, h: 0.3, semantic: "danger", name: "炸药包" }),
  DoorBoard: F({ w: 1.0, d: 0.18, h: 1.9, semantic: "timber", name: "靠墙的门板" }),
  Branches: F({ w: 1.6, d: 1.0, h: 0.6, semantic: "foliage", name: "一抱树枝" }),
  Rubble: F({ w: 2.0, d: 1.2, h: 0.35, semantic: "earthDark", name: "碎砖堆" }),
  SleeperPile: F({ w: 1.0, d: 2.6, h: 1.0, semantic: "timber", name: "枕木垛" }),
  Shoe: F({ w: 0.27, d: 0.1, h: 0.09, semantic: "timber", name: "一只鞋（没有资产，小体块）" }),
});
const Prop = (id, x, z, ry = 0) => F({ id, kind: id.split("_")[0], x, z, ry });
export const L1218_PROPS = F([
  // 沟口：二营往杂木堆上添的树枝、机枪位边的弹药箱
  // 树枝放在杂木还没堆到那一截的两头，让开战壕里往北看的几条线与机枪压村南口的线
  Prop("Branches_D1", 124.5, 645.6, 0.3), Prop("Branches_D2", 107.5, 645.2, -0.4), Prop("AmmoBox_D1", 110.2, 651.0, 0.2), Prop("AmmoBox_D2", 110.9, 651.6, 1.2),
  // 救护所里
  Prop("WaterVat_A1", 106.6, 804.6), Prop("DoorBoard_A1", 115.2, 806.0, 1.5708), Prop("DoorBoard_A2", 91.4, 813.5, 1.5708),
  // 教堂门口的包袱（院门外路边）
  Prop("Bundle_C1", 119.6, 703.2, 0.4), Prop("Bundle_C2", 120.8, 705.4, 1.0),
  // 南头河堤后的弹药箱
  Prop("AmmoBox_L1", -73.6, 975.2, 0.2), Prop("AmmoBox_L2", -72.8, 975.9, 1.3),
]);

/** 场景信号（关键帧 signals 与场景文件 showOn / hideOn 共用的名字；中文名在 Data_SceneEvents）。 */
export const L1218_SIGNALS = F({
  guandaoBridgeBlown: "GuandaoBridgeBlown", // 13-2 起：官道桥中间几跨没了、断木砸进河床
  dugoutBombed: "DugoutBombed",             // 14-2 起：南街那家院里的洞挨了炸弹（弹坑 + 碎砖 + 塌了的洞顶）
  cartOverturned: "CartOverturned",         // 14-3 起：救护所门前，拴在车辕里的黑子挨了一梭，连车带驴翻在地上
  raidAftermath: "RaidAftermath",           // 15-1 起：街上、门前、路头上一排排盖着席子的人、几处碎砖堆；出村小路边那家墙塌了半截
  girlHoleCovered: "GirlHoleCovered",       // 18-2 起：女娃她娘把席子拉上、盖住洞口
  chargesSet: "ChargesSet",                 // 18-3 起：北头两座桥墩上绑了炸药、引线拉到南头河堤后
  bridgeBlown: "BridgeBlown",               // 18-6 起：北头两孔钢梁断开砸进河床
});

/** 关键地点。x/z 是中心或站点。B 阶段关键帧 / 预演从这里取坐标。 */
const GB = L1218_GUANDAO_BRIDGE;
const LEVEE_AT_70 = RiverPoint(RiverArcAtX(-70), L1218_RIVER.halfTop + L1218_LEVEE.offD);
export const L1218_PLACES = F({
  // 耿家庄那头（0610 的）
  villageSouth: L0610_PLACES.villageSouth,                          // 耿家庄村南口 (117,545)
  laneShell: P(117, 538),                                           // 11-1 身后落在胡同里的那发炮
  gengSmoke: P((L0610_GENG.box.minX + L0610_GENG.box.maxX) / 2, (L0610_GENG.box.minZ + L0610_GENG.box.maxZ) / 2),   // 12-2「看」：老耿家腾起黑烟
  fieldShell: P(124, 580),                                          // 12-1 打偏落在路边麦地的那发炮
  helmetsAt: P(117, 549),                                           // 12-4 村南口冒出两三顶钢盔
  // 土路、交叉口、沟口
  dirtRoadMid: P(106, 585),
  junction: L1218_JUNCTION,                                         // 土路接官道的交叉口 (90,608)
  ditchNorth: P(99, 636.4),                                         // 沟北沿（板桥北头外）
  plankNorth: P(99, 638.5), plankSouth: P(99, 643.5), plankMid: P(99, 641),
  ditchFloor: P(80, 643.6),                                         // 沟底（离板桥 19 m）
  sentry: P(101.8, 645.6),                                          // 12-3 端枪的哨兵（板桥南头路边）
  trenchSquad: P(118, 648.0),                                       // 13 班长趴的战壕（沟口东段）
  mg727: P(109.5, 649.0),                                           // 七二七团二营的机枪（东段战壕西头，压着板桥与官道）
  flareAt: P(100, 598),                                             // 13-3 信号弹从沟北边打上天
  planesFrom: P(320, 640),                                          // 13-3 / 14-1 飞机从东边来
  // 村里
  churchGate: F(StripFrame({ ...L1218_CHURCH, side: 1 }).World(L1218_CHURCH.gate.s, L1218_CHURCH.d0)),           // 教堂院门（朝官道敞着）
  churchGateOut: F(StripFrame({ ...L1218_CHURCH, side: 1 }).World(L1218_CHURCH.gate.s, L1218_CHURCH.d0 - 1.4)),  // 院门外路边（12-5 有人背着老人往里进）
  southStreetCorner: L1218_SOUTH_STREET_CORNER,                     // 12-6 南街口 (170,770)：顺官道往东南望得见官道桥
  southStreetMid: P(121, 783),                                      // 南街与出村小路的口
  southStreetWest: P(146, 777),                                     // 14-2 顺子跑过南街时看得见挨炸的洞那一家
  bombedYardGate: F(StripFrame(L1218_BOMBED_YARD).World(L1218_BOMBED_YARD.s0 + L1218_BOMBED_YARD.width / 2, L1218_BOMBED_YARD.setback)),   // 挨炸那家的院门（朝官道）
  bombedHole: F(StripFrame(L1218_BOMBED_YARD).World(L1218_BOMBED_YARD.hole.mouthS, L1218_BOMBED_YARD.hole.mouthD)),                          // 挨炸的洞的洞口
  // 救护所
  gateYard: P(121, 810),                                            // 救护所门前空地（出村小路上）
  aidGateOut: P(117.6, 812.5), aidGateIn: P(114.4, 812.5),
  xiangDoor: P(90.5, 807), xiangDoorOut: P(91.8, 807), xiangInside: L1218_AID.dongguaInside,
  doctorPost: L1218_AID.doctorPost, gateGuardPost: L1218_AID.gateGuardPost, thresholdSeat: L1218_AID.thresholdSeat,
  wallRootDonggua: L1218_AID.wallRootDonggua,
  aidHoleA: L1218_AID.holes[0].mouth, aidHoleB: L1218_AID.holes[1].mouth,
  girlHole: L1218_GIRL_YARD.hole.mouth,
  cartPark: L1218_CART_PARK.cart, cartOverturned: L1218_CART_PARK.overturned, heizi: L1218_CART_PARK.heizi,
  // 官道桥
  guandaoBridgeNorth: GB.north, guandaoBridgeSouth: GB.south, guandaoBridgeMid: P((GB.north.x + GB.south.x) / 2, (GB.north.z + GB.south.z) / 2),
  // 出村、北岸土路、李子行、铁路桥
  villageSouthEnd: P(121, 845),                                     // 村南头（出村小路接北岸土路）
  northBankRoadA: P(100, 868), northBankRoadB: P(60, 880), northBankRoadC: P(20, 890), northBankRoadD: P(-20, 897), northBankRoadE: P(-55, 905),
  liziHang: P(-11, 868),                                            // 李子行的土巷（路过时看空了的院子）
  liziHangGate: P(-14, 867.4),
  roadsideYard: P(90.6, 856.2),                                     // 18 引导 ①：路北边孤零零挨了炸的院子（冒烟的房梁）
  roadsideMats: P(40.7, 880.5),                                     // 18 引导 ②：路北边土墙根一排盖席子的人
  liziSouthGate: P(-3, 886),                                        // 18 引导 ③：李子行 LzS2 朝路的院门（门板歪着、地上一只鞋）
  railRampFoot: P(-68, 912), railRampTop: P(-77.2, 912), railRampFootSouth: P(-68, 980), railRampTopSouth: P(-77.2, 980),
  bridgeNorth: P(L1218_RAIL.x, R2(AT_RAIL.northTop.z)), bridgeSouth: P(L1218_RAIL.x, R2(AT_RAIL.southTop.z)),
  bridgeMid: P(L1218_RAIL.x, R2((AT_RAIL.northTop.z + AT_RAIL.southTop.z) / 2)),
  lastGroupCover: P(-55, 900.2),                                    // 18 班长他们缩在土坎背后（坎后的洼里）
  lastGroupExposed: P(-70, 906),                                    // 离开土坎往桥头跑：机枪看得见
  ijaMg18: L1218_IJA_MG,                                            // 18 田里那挺机枪（路基东脚、坟头西边）
  leveePlayer: P(-70, R2(LEVEE_AT_70.z)),                           // 18 顺子趴的河堤顶（路基东边 10 m）
  leveeCover: P(-70, R2(LEVEE_AT_70.z + 2.6)),                      // 河堤后头（炸桥时扑过去的地方）
  wadeAt: RiverPoint(RiverArcAtX(-64), -4),                         // 18 老乡蹚水过去的地方（北滑坡道下来、沙床上）
  southRoadMid: P(-55, 1030),
  cityLights: P(-40, 1076),                                         // 远处县城的灯
  sunWest: P(-158, 940),                                            // 太阳落到铁路桥那头：在土路长直段 (100,868) → 桥北头 (−80,918) 的延长线上（场地西沿内；18 引导）
});

/** 出生点：11-1 耿家庄村南口，朝南（往南看土路、官道、北沙河村）。 */
export const L1218_SPAWN = F({ x: 117, z: 547.4, yawDeg: 180 });
