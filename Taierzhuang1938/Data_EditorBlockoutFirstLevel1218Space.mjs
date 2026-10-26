// ===========================================================================
// Data_EditorBlockoutFirstLevel1218Space.mjs —— 第一关 11–18 白盒（关卡键 FirstLevel1218）的空间锚点（2026-10-26 第三版）
//
// 唯一口径：集成负责人 2026-10-26 的《FirstLevel1218 白盒第三版契约》（用户 10-26 认的北沙河村这一版，11–18）。
// 第二版（10-23：墙根小路、石板桥、河汊子往南、河滩、渡口、浮桥、渡口接收院、庄子西南角豁子）整体作废，按契约重摆：
//   耿家庄村南口 → 土路 → 官道 → 村口反坦克沟上的板桥 → 北沙河村（斜穿的主街、教堂、救护所、女娃家）→ 村西麦地 → 津浦铁路的钢梁桥（过沙河）→ 南头河堤 → 北门。
// 为什么这样摆（史料，详见契约第零节）：北沙河村在沙河北岸，津浦铁路在村西约一公里南北走，老官道从西北往东南斜穿村子（日军战斗详报 + 任世淦调查）；
//   七二七团在村外挖战壕、架铁丝网，村口官道用反坦克沟截断、堆杂木（同上 + 滕州市档案局）；村民家家挖洞躲身、墙上刷抗日大字标语、有人躲进村里的德国教堂；
//   北沙河以北的铁路 2 月被工兵拆了、枕木让老乡拿去当柴（范长江通讯）；3 月 14 日 17 时令七二七团回城、炸铁路桥（刘晓焕《王铭章》）。
//   沙河那天的水情没查到：做成岸陡、河床大半是沙、中间一股齐小腿深的水（创作）。教堂位置、救护所借的院子、女娃家、老汉门口、桥北土坎都是创作。
// 坐标与 FirstLevel0105 / FirstLevel0610 同一套：原点 = 01–05 的沟口；X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南。
// z < 556 的地面与体块原样用 0610 的（seamZ 556 不变，不抄数字，从 0610 导出量取）；只有 0610 场地以西（x < −60）的铁路路基是本关自己堆的。
//
// 场景生成器（Script_EditorBlockoutFirstLevel1218Scene.mjs）按这里烘地形与体块，
// 关键帧生成器（Script_EditorBlockoutFirstLevel1218Keyframes.mjs）按这里摆人、POI 与机位。都只读本表；要挪地方先改这里，再重跑生成器。
// 纯数据：零 three、零 DOM，node 与浏览器共用。
//
// 与契约建议值不一样的地方（摆不下 / 接不上 / 运行时限制才改的，报告里也列了）：
//   · 官道：契约写「从 bounds 东北边缘进来、西北→东南斜穿村子」。0610 的驿道在庄子东边往北去，所以官道从场地东边偏北 (236,568) 进来往西南，
//     村南口的土路往南 58 m 在 (106,602) 接上它；到村口沟前拐成往南，过板桥进村以后才是西北→东南的主街（与空间图一致：土路从东北并进来、沟口在村子西北角）。
//   · 北沙河村压到 x 56…210、z 645…742；铁路在村西口外 160 m（x −104，契约「约 200 m」）；沙河北坎顶 z ≈ 763、南坎顶 ≈ 807（河床约 40 m）；
//     北门在南岸往南约 143 m（z 950）。场地 x −160…236、z 480…980。
//   · 板桥：演员只能站在比脚下高度场高 ≤ 1 m 的块顶上（BlockStandSampler），板桥面比沟底高 2.7 m 站不上去，所以桥板底下垫一道土墩
//     （只在桥板正下方、宽 3.6 m，顶在桥面下 0.95 m）；沟的其余 26 m 照旧深 2.8、车过不去。
//   · 铁路桥面（枕木顶 2.55）比河床高 5.25 m：第二轮（2026-10-26）给 BlockStandSampler 加了 standOn 块——每孔枕木顶上一条看不见的走道
//     （RailWalk_S1…S4，宽 2.4，standOn、visual:false），演员站在它顶上走过桥（不从枕木缝里掉下去）。炸掉的北头两孔那两条也是普通块
//     （gate 不认 visual:false），炸了以后还在：18 炸桥以后不往那里摆人（玩家走过去会悬空，白盒接受）。
//   · 桥北土坎背后（南边）挖低 0.3 m 一溜：蹲着的人（眼高 1.05）才藏得住——土坎只有 1 m 高，北边 40 m 外机枪趴着看不见坎后蹲着的人要靠这一点（取土留下的洼，创作）。
//   · 机枪位在土坎西北、路基东脚的坟头旁（坟在机枪东边，不挡南岸看它）：顺着路基往南扫；南头河堤上（路基东边 10 m）趴着的人从土坎西头和路基之间的空当看得见它。
//   · 河汊子（0610 的直段，中线 34.5）在接缝以南 18 m 收住（沟尾，z 574 起渐浅、582 平），不往南伸：免得和官道、村子打架。
// ===========================================================================

import { L0610_VILLAGE, L0610_GENG, L0610_RIVER, L0610_PLACES, L0610_SOUTH_LANE, L0610_STREETS, L0610_BOUNDS } from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

export const L1218_LEVEL_KEY = "FirstLevel1218";
export const L1218_TITLE = "第一关 11–18 · 北沙河村与铁路桥（新剧本白盒）";
export const L1218_VERSION = "2026-10-26 第三版空间（契约：土路 → 官道 → 村口反坦克沟与板桥 → 北沙河村（主街 / 教堂 / 救护所 / 女娃家）→ 村西麦地 → 津浦铁路钢梁桥过沙河 → 南头河堤 → 北门）";

/** 场地范围与高度网格（0.5 m 一格，与 0105 / 0610 一样）。北边只要耿家庄村南那一截当背景。 */
export const L1218_BOUNDS = Object.freeze({ minX: -160, maxX: 236, minZ: 480, maxZ: 980 });
export const L1218_CELL_M = 0.5;

const P = (x, z) => Object.freeze({ x, z });
const Line = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));
const Box = (minX, maxX, minZ, maxZ) => Object.freeze({ minX, maxX, minZ, maxZ });
const F = Object.freeze;
const R2 = (v) => Math.round(v * 100) / 100;

/** 从 0610 借来的东西（原样引用，不抄）。 */
export const L1218_FROM_0610 = F({
  village: L0610_VILLAGE,             // 耿家庄整村压平 +0.3、fadeM；box 到 z 548
  geng: L0610_GENG,                   // 老耿家（院子 x 92…108、z 470…486；12 回头看见冒烟的地方）
  southLane: L0610_SOUTH_LANE,        // 出村的窄胡同（到村南口 (117,545)）
  backLane: L0610_STREETS.backLane,   // 窄胡同最后一截
  river: L0610_RIVER,                 // 河汊子的横断面（中线 34.5、沟底宽 6、深 3、壁 2.5、岸上土埂 0.4×3、沟底积水 1.0）
  villageSouth: L0610_PLACES.villageSouth,
  bounds: L0610_BOUNDS,
});

/**
 * 地面怎么接：z < seamZ 的点一律用 0610 的 L0610Ground（村南、窄胡同、河汊子直段逐点一致）；只有 x < railFromX（0610 场地以西）再叠本关的铁路路基。
 * z ≥ seamZ 用本关的地面：平地 = 0105 的 NaturalHeight + plainY（与 0610 的 BaseHeight 在 z ≥ 372 是同一个式子），叠 0610 村子压平的余波与本关的开挖 / 堆土；
 * 路的压低从接缝起 fadeInM 内渐进（接缝上一点不动）。接缝两侧抽点比对（SceneTest 查）：差 0。
 */
export const L1218_GROUND = F({ seamZ: 556, plainY: 0.3, roadFadeInM: 4, railFromX: -60 });

/** 自然地面以外的几个绝对高度，米。 */
export const L1218_HEIGHTS = F({
  plain: 0.3,                // 平地 / 麦地（另有 0105 NaturalHeight 的低频起伏）
  village: 0.3,              // 北沙河村压平
  dirtRoadLower: 0.08,       // 土路压低
  postRoadLower: 0.12,       // 官道 / 主街压低
  laneLower: 0.08,           // 村里的小街 / 巷子、田间小路压低
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
  leveeCrestY: 1.8,          // 南头河堤顶（比平地高 1.5）
  bankTopY: 1.3,             // 桥北土坎顶（比平地高 1.0）
  bankHollowY: 0.0,          // 土坎背后（南边）那一溜洼（低 0.3）
  gateYardY: 0.3,            // 北门内外压平
});

// ---------------------------------------------------------------------------
// 路

/** 土路：村南口 (117,545) 出来往南，58 m 后在 (106,602) 接上官道；宽 3 m（驴车过得去）。 */
export const L1218_DIRT_ROAD = F({ name: "土路（村南口 → 官道）", halfW: 1.5, line: Line([117, 545], [117, 556], [114.5, 572], [110, 590], [106, 602]) });
/** 官道与土路的交叉口。 */
export const L1218_JUNCTION = P(106, 602);

/**
 * 官道：从场地东边偏北进来往西南，在交叉口接上土路，往南到村口反坦克沟（板桥），过沟进村就是主街（西北 → 东南斜穿），从村东南角出去顺沙河北岸往东南。
 * 宽 4 m（halfW 2）。north = 沟北那一截（东边界 → 沟北沿）；street = 村里那一截（主街）；southeast = 出村往东南。
 */
export const L1218_POST_ROAD = F({
  name: "官道", halfW: 2.0,
  north: Line([236, 568], [200, 574], [164, 582], [132, 592], [106, 602], [100, 614], [97, 626], [97, 630.6]),
  street: Line([97, 635.4], [98, 639], [100, 641], [198, 740]),
  southeast: Line([198, 740], [214, 747], [236, 753]),
});
/** 主街的直段：M1 (100,641) → M2 (198,740)。s = 离 M1 沿街多远、d = 离中线多远（正 = 东北侧）。 */
export const L1218_STREET = F({ name: "主街（官道在村里那一段）", from: P(100, 641), to: P(198, 740), halfW: 2.0 });
const ST_LEN = Math.hypot(L1218_STREET.to.x - L1218_STREET.from.x, L1218_STREET.to.z - L1218_STREET.from.z);
export const STREET_U = F({ x: (L1218_STREET.to.x - L1218_STREET.from.x) / ST_LEN, z: (L1218_STREET.to.z - L1218_STREET.from.z) / ST_LEN });   // 沿街（往东南）
export const STREET_N = F({ x: STREET_U.z, z: -STREET_U.x });                                                                                  // 往东北
export const STREET_LEN = ST_LEN;
/** 主街坐标 (s, d) → 世界。 */
export function StreetPoint(s, d = 0) {
  const o = L1218_STREET.from;
  return { x: R2(o.x + STREET_U.x * s + STREET_N.x * d), z: R2(o.z + STREET_U.z * s + STREET_N.z * d) };
}
/** 世界 → 主街坐标 { s, d }。 */
export function StreetFrame(x, z) {
  const o = L1218_STREET.from, dx = x - o.x, dz = z - o.z;
  return { s: dx * STREET_U.x + dz * STREET_U.z, d: dx * STREET_N.x + dz * STREET_N.z };
}
/** 主街在某个 z 处中线的 x。 */
export function StreetXAtZ(z) { const o = L1218_STREET.from; return o.x + (z - o.z) * STREET_U.x / STREET_U.z; }
/** 主街朝东南走的 ry（块的 w 边顺着街）：three rotation.y，局部 +x → 世界 (cos ry, −sin ry)。 */
export const STREET_RY = Math.round(Math.atan2(-STREET_U.z, STREET_U.x) * 1000) / 1000;

/** 村里的小街 / 巷子（压低 laneLower；都是轴对齐的净空条：axis "x" = 东西向、c 是 z；"z" = 南北向、c 是 x）。 */
const Run = (id, name, axis, c, halfW, from, to) => F({ id, name, axis, c, halfW, from, to });
export const L1218_LANES = F({
  west: Run("WestStreet", "西头的街（主街 → 救护所院门）", "x", 688, 2.0, 92.5, 146.6),
  north: Run("NorthLane", "北头小巷（主街 → 救护所门前）", "x", 662.3, 1.6, 56, 122.4),
  gateSquare: Run("GateSquare", "救护所门前那块空地（南北）", "z", 97, 4.5, 662, 690),
  southLane: Run("SouthLane", "救护所东墙外往南的巷子", "z", 94, 1.6, 690, 742),
  westExit: Run("WestExit", "村西口（救护所、女娃家南边往西）", "x", 721.5, 1.6, 56, 91),
  midLane: Run("MidLane", "西头街南边的东西巷", "x", 710, 1.5, 94, 166),
});
/** 村西口（往铁路走的那头）。 */
export const L1218_VILLAGE_WEST = P(56, 721.5);

/** 田间小路：村西口往西南穿过麦地到铁路桥北头的土坡脚（宽 2 m，担架走得了）。 */
export const L1218_FIELD_PATH = F({ name: "村西口到铁路桥的田间小路", halfW: 1.0, line: Line([56, 721.5], [24, 726], [-12, 731], [-48, 736], [-76, 741], [-91, 744], [-92, 755]) });

/** 南岸往北门的路（路基东边）。 */
export const L1218_SOUTH_ROAD = F({ name: "南岸往北门的路", halfW: 1.75, line: Line([-92, 822], [-88, 827], [-88, 946]) });

// ---------------------------------------------------------------------------
// 村口：反坦克沟、板桥、杂木、村北沿战壕、铁丝网

/** 村口反坦克沟：横截官道，东西向，顶宽 4、底宽 2.4、深 2.8（沟底 −2.5），长 30；四壁陡。 */
export const L1218_AT_DITCH = F({ name: "村口反坦克沟", x: 97, z: 633, fromX: 82, toX: 112, topW: 4.0, floorW: 2.4, wallM: 0.8, floorY: L1218_HEIGHTS.ditchFloorY });
/** 板桥：几块门板搭的，南北向跨沟，宽 2.6、长 5；底下垫土墩（见文件头）。 */
export const L1218_PLANK = F({ name: "板桥（门板搭的）", x: 97, fromZ: 630.5, toZ: 635.5, w: 2.6, deckT: 0.08, boards: 3, plugHalfW: 1.8 });
/** 沟南沿（村这边）堆的杂木（枣树枝），板桥口子留空。 */
export const L1218_ABATIS = F({ name: "杂木（枣树枝）", z: 636.9, d: 1.6, h: 1.25, gapHalfW: 1.9, pieceW: 3.4 });
/** 村北沿战壕：西段接沟的西头、东段接沟的东头（沟口两边接上）；壕底宽 1、深 1.2、北沿堆土 0.35。 */
export const L1218_TRENCH = F({
  name: "村北沿战壕（七二七团）", floorW: 1.0, wallM: 0.35, floorY: L1218_HEIGHTS.trenchFloorY, bermH: 0.35, bermW: 1.6, bermOffM: 1.4,
  west: Line([52, 642.5], [76, 642.5], [83.2, 633.4]),
  east: Line([110.8, 633.4], [117, 642.5], [204, 642.5]),
});
/** 铁丝网：战壕外 15 m，桩 + 两道横线。 */
export const L1218_WIRE = F({ name: "铁丝网", z: 627, west: F([50, 80]), east: F([114, 205]), postEveryM: 3, postH: 1.3, wireYs: F([0.45, 1.0]) });

// ---------------------------------------------------------------------------
// 北沙河村

/** 村子压平的范围（主街两边的院子都在里头）。 */
export const L1218_VILLAGE = F({ name: "北沙河村", box: Box(56, 210, 645, 742), y: L1218_HEIGHTS.village, fadeM: 4, wallT: 0.5, wallH: 2.2, houseH: 2.7, roofH: 0.55 });

/**
 * 院子（轴对齐，坐北朝南，跟着斜街排成锯齿；院门开在朝街那面墙上）。
 * gate：{ wall: n|s|e|w, at（墙上沿走向的坐标）, w }；houses：实心的房子（墙 + 草顶）；extra：老汉 / 洞 / 枕木 / 标语 / 灯（生成器另画）。
 */
const Yard = (id, name, box, gate, houses, extra = {}) => F({ id, name, box, gate: F(gate), houses: F(houses.map((h) => F(h))), ...extra });
const H3 = (minX, maxX, minZ, maxZ, h) => ({ box: Box(minX, maxX, minZ, maxZ), ...(h ? { h } : {}) });
export const L1218_YARDS = F([
  // 主街西南侧（街西）
  Yard("S1", "老汉家", Box(84, 99, 646, 660), { wall: "e", at: 649.2, w: 1.8 }, [H3(85, 98, 646.5, 651.5)], { oldMan: true }),
  Yard("S2", "村西北角的院子", Box(64, 81, 645, 660), { wall: "s", at: 75, w: 1.6 }, [H3(65, 80, 645.5, 650.5), H3(65, 69, 651, 656)]),
  Yard("S4", "救护所东边的院子（门口码枕木）", Box(102, 118, 664.8, 684.5), { wall: "s", at: 112, w: 1.6 }, [H3(103, 117, 665.3, 670.3), H3(103, 107, 671, 678)]),
  Yard("S6", "西头街南边的院子", Box(96.5, 116, 692, 707.5), { wall: "n", at: 104, w: 1.6 }, [H3(97.5, 115, 692.5, 697.5)]),
  Yard("S7", "西头街南边靠主街的院子（门口码枕木）", Box(120, 138, 692, 706), { wall: "n", at: 131, w: 1.6 }, [H3(121, 137, 692.5, 697.5)]),
  Yard("S8", "南头的院子", Box(96.5, 112, 712, 728), { wall: "n", at: 106, w: 1.6 }, [H3(97.5, 111, 712.5, 717.5)]),
  Yard("S9", "南头的院子", Box(116, 134, 712, 728), { wall: "n", at: 125, w: 1.6 }, [H3(117, 133, 712.5, 717.5)]),
  Yard("S10", "南头靠主街的院子", Box(138, 156, 714, 728), { wall: "e", at: 724, w: 1.6 }, [H3(139, 155, 714.5, 719.5)]),
  Yard("S11", "村东南角的院子", Box(160, 176, 724, 740), { wall: "e", at: 736, w: 1.6 }, [H3(161, 175, 724.5, 729.5)]),
  Yard("S12", "村西南角的院子", Box(60, 84, 724, 740), { wall: "n", at: 72, w: 1.6 }, [H3(61, 83, 724.5, 729.5)]),
  Yard("S13", "南沿的院子", Box(96.5, 114, 731, 742), { wall: "n", at: 105, w: 1.6 }, [H3(97.5, 113, 731.5, 735.5)]),
  Yard("S14", "南沿的院子", Box(118, 140, 731, 742), { wall: "n", at: 129, w: 1.6 }, [H3(119, 139, 731.5, 735.5)]),
  Yard("S15", "南沿的院子", Box(144, 162, 731, 742), { wall: "e", at: 735, w: 1.6 }, [H3(145, 161, 731.5, 735.5)]),
  // 主街东北侧（街东）
  Yard("N1", "钻洞的那一家", Box(120, 136, 645, 656), { wall: "w", at: 652.4, w: 2.4 }, [H3(126, 135.5, 645.5, 650)], { familyHole: true }),
  Yard("N1b", "村北沿的院子", Box(140, 156, 645, 653), { wall: "s", at: 146, w: 1.6 }, [H3(141, 155, 645.5, 649.5)]),
  Yard("N2", "村北沿东头的院子", Box(162, 178, 645, 655), { wall: "s", at: 168, w: 1.6 }, [H3(163, 177, 645.5, 650)]),
  Yard("N9", "村东北角的院子", Box(182, 200, 646, 664), { wall: "w", at: 660, w: 1.6 }, [H3(183, 199, 646.5, 651.5)]),
  Yard("N8", "教堂东边的院子", Box(182, 200, 670, 688), { wall: "w", at: 684, w: 1.6 }, [H3(183, 199, 670.5, 675.5)]),
  Yard("N6", "教堂南边的院子（门口码枕木）", Box(172, 190, 692, 708), { wall: "w", at: 703, w: 1.6 }, [H3(173, 189, 692.5, 697.5)]),
  Yard("N7", "村东头的院子", Box(194, 210, 712, 728), { wall: "w", at: 724, w: 1.6 }, [H3(195, 209, 712.5, 717.5)]),
]);

/** 老汉坐的地方：老汉家院门外（朝街）。 */
export const L1218_OLD_MAN = F({ name: "老汉（坐在自家门口不走）", at: P(100.4, 649.2), yawDeg: -90 });
/** 钻洞的那一家：院里的洞（洞口 + 坡道 + 洞内一小间）、盖洞口的席子（FamilyHidden 起盖上）。 */
export const L1218_FAMILY_HOLE = F({ name: "一家人钻的洞", yard: "N1", mouth: P(122.2, 652.4), dir: P(1, 0), rampM: 2.4, chamber: F({ w: 2.4, d: 2.2 }), mat: F({ w: 1.6, d: 1.3 }) });
/** 枕木垛（铁路上拆来的枕木当柴）：门口码的三垛。 */
export const L1218_SLEEPER_PILES = F([
  F({ id: "SleeperPile_S4", x: 120.2, z: 670.5, w: 1.2, d: 2.6, h: 1.0 }),
  F({ id: "SleeperPile_S7", x: 126.0, z: 691.0, w: 2.6, d: 1.0, h: 0.9 }),
  F({ id: "SleeperPile_N6", x: 170.6, z: 700.0, w: 1.0, d: 2.6, h: 1.1 }),
]);
/** 大字抗日标语（朝街的墙上贴一条浅色长条 + 地标说明字）。face：墙面朝哪边。 */
export const L1218_SLOGANS = F([
  F({ id: "Slogan_S1", x: 99.3, z: 655.5, face: "e", len: 6.5, text: "打倒日本帝国主义" }),
  F({ id: "Slogan_N1", x: 119.7, z: 647.8, face: "w", len: 4.2, text: "抗战到底" }),
  F({ id: "Slogan_S4", x: 118.3, z: 677.5, face: "e", len: 7.0, text: "中国人不打中国人 一致抗日" }),
  F({ id: "Slogan_N6", x: 171.7, z: 696.0, face: "w", len: 5.0, text: "誓死不当亡国奴" }),
]);

/**
 * 教堂（德国教堂，位置是创作）：主街东北侧一座带围墙的院子，顺着街斜摆（不像庄户人家坐北朝南），院门朝街开、敞着；
 * 正房（礼拜堂）比民房高，前头一座钟楼。用主街坐标 (s, d) 写：s 沿街、d 离街中线（东北为正）。
 */
export const L1218_CHURCH = F({
  name: "德国教堂（位置是创作）",
  s0: 52, s1: 78, d0: 4.2, d1: 30, wallH: 2.6,
  gate: F({ s: 65, w: 3.2 }),
  hall: F({ s0: 56, s1: 74, d0: 18, d1: 28, h: 6.2 }),
  tower: F({ s: 58.5, d: 16.0, w: 3.0, h: 10.5 }),
  crowdBox: F({ s0: 55, s1: 75, d0: 7, d1: 16.5 }),
});
/** 驴车停在救护所门前（12-6 起；14-3 黑子挨了一梭，连车带驴翻在这里）：车朝西、黑子在车辕里。 */
export const L1218_CART_PARK = F({ cart: P(97.4, 686.6), yawDeg: 90, heizi: P(94.0, 686.6), overturned: P(97.0, 686.9), overturnedRy: 0.35 });
/** 西头街起头的地方（主街上，正对教堂院门）。 */
export const L1218_WEST_TURN = P(146.6, 688);

/**
 * 救护所：村西头七二七团借的一个大院（照第二版接收院做法）。院门开在东墙，朝门前那块空地和西头的街；
 * 正房在北（实心）、厢房在西（空心，东墙门带门槛：16 过门槛）、灶屋在东北角；院里铺麦秸、马灯两盏；院里挖两处洞（洞口 + 坡道 + 洞内一小间）。
 */
export const L1218_AID = F({
  name: "救护所（七二七团借的院子）", box: Box(58, 92, 666, 700), wallT: 0.5, wallH: 2.2,
  gate: F({ wall: "east", z: 690.5, w: 2.0 }),
  mainHouse: F({ box: Box(58.5, 91.5, 666.5, 673.5), h: 3.2 }),
  kitchen: F({ box: Box(84, 91.5, 674, 681), h: 3.0 }),
  xiang: F({
    box: Box(58.5, 66.5, 676, 694), h: 3.0, roofH: 3.0,
    door: F({ wall: "east", z: 685, w: 1.2, topH: 2.0 }),
    threshold: F({ h: 0.15, d: 0.22 }),
  }),
  // 洞：mouth = 坡道顶（地面）、dir = 往哪边下（单位向量）、rampM 坡道长、chamber 洞内一小间（宽 w 横着坡道、深 d 顺着坡道）；roofT 洞顶厚；slit 洞顶漏光的缝
  holes: F([
    F({ id: "AidHoleA", name: "院里的洞（东）", mouth: P(80.6, 694.0), dir: P(-1, 0), rampM: 3.0, chamber: F({ w: 3.4, d: 3.4 }), slitM: 0.3 }),
    F({ id: "AidHoleB", name: "院里的洞（西南）", mouth: P(70.0, 697.6), dir: P(0, -1), rampM: 3.0, chamber: F({ w: 3.0, d: 2.6 }), slitM: 0 }),
  ]),
  roofT: 0.3,
  wallRootDonggua: P(89.4, 696.6),     // 冬瓜搁的墙根（东墙里、院门南边）
  doctorPost: P(74.5, 681.5),          // 医官（院里）
  gateGuardPost: P(69.2, 687.6),       // 守厢房门的兵（门外）
  dongguaInside: P(62.6, 688.6),       // 厢房里冬瓜放下的地方
  thresholdSeat: P(67.2, 685),         // 17 顺子坐的门槛（朝东看院子；门槛块在 x 66.5、厚 0.22，坐在它东沿外一点）
  strawBox: Box(68, 83, 675.5, 690),   // 院里铺麦秸、躺满伤员的地方
  lamps: F([P(74.5, 679.0), P(68.0, 683.0)]),
  strawW: 0.03,
});

/** 女娃家：救护所南边隔壁的院子，两院之间的院墙（救护所南墙）东半截塌了，站在救护所院里看得见那家院里的洞口（盖席子）。 */
export const L1218_GIRL_YARD = F({
  name: "女娃家（隔壁院）", box: Box(58, 86, 700, 718), houses: F([F({ box: Box(58.5, 70, 712, 717.5) })]),
  gate: F({ wall: "e", at: 712, w: 1.6 }),
  collapsed: F({ fromX: 66, toX: 85, h: 0.6 }),   // 共用的那道墙（z 700）这一段塌了，只剩 0.6 高的墙根 + 土堆
  hole: F({ id: "GirlHole", name: "女娃家院里的洞", mouth: P(73.0, 707.6), dir: P(0, 1), rampM: 2.2, chamber: F({ w: 2.4, d: 2.2 }), slitM: 0, mat: F({ w: 1.6, d: 1.4 }) }),
});

/** 村里的树（院里、村边；脚印 ≤ 1 m、高 ≥ 2 m 的 foliage 块 = 编辑器种枯树）。 */
export const L1218_TREES = F([
  [60, 658.4], [56.4, 690], [58, 705], [57, 742], [86, 743], [118, 744], [150, 744], [182, 742], [206, 735], [210, 700], [208, 668], [204, 646],
  [158, 642], [132, 641], [92, 655], [110, 706], [150, 722], [186, 716], [168, 708], [178, 676], [95, 744], [64, 735], [76, 709], [60.6, 698.4],
  [40, 610], [62, 596], [140, 604], [176, 600], [214, 592], [30, 700], [-30, 690], [-70, 712], [10, 760], [-40, 756], [190, 756], [-120, 640],
].map(([x, z], i) => F({ x, z, h: 5 + ((i * 7) % 5) * 0.6 })));

/** 坟头（麦地里；烘进高度场：半径 r 的土包、高 h）。沟北边的几座给 13 的鬼子步兵当掩体；mg18 那座在 18 的机枪东边。 */
export const L1218_GRAVES = F([
  F({ id: "G_N1", x: 84, z: 614, r: 1.2, h: 0.6 }), F({ id: "G_N2", x: 110.5, z: 616.5, r: 1.1, h: 0.55 }), F({ id: "G_N3", x: 78, z: 602, r: 1.2, h: 0.6 }),
  F({ id: "G_N4", x: 119, z: 605, r: 1.2, h: 0.65 }), F({ id: "G_N5", x: 90, z: 594, r: 1.0, h: 0.5 }),
  F({ id: "G_W1", x: 20, z: 690, r: 1.1, h: 0.55 }), F({ id: "G_W2", x: -40, z: 705, r: 1.2, h: 0.6 }),
  F({ id: "G_MG", x: -94.6, z: 693.6, r: 1.2, h: 0.6 }), F({ id: "G_W3", x: -70, z: 686, r: 1.1, h: 0.55 }),
]);
/** 田埂（东西向，0.25 高）：沟北边两道给 13 的鬼子趴。 */
export const L1218_RIDGES = F([
  F({ z: 611, fromX: 48, toX: 93.5 }), F({ z: 611, fromX: 103.5, toX: 190 }), F({ z: 597, fromX: 30, toX: 101 }), F({ z: 597, fromX: 111, toX: 200 }),
  F({ z: 680, fromX: -40, toX: 50 }), F({ z: 706, fromX: -90, toX: -10 }),
]);
export const L1218_RIDGE = F({ h: 0.25, halfW: 0.35 });

// ---------------------------------------------------------------------------
// 铁路、沙河、铁路桥、桥北土坎、南头河堤、北门

/** 津浦铁路：南北向路基，顶宽 5、高 2.3（顶 2.6）、两坡 1.5:1。北段（桥北）只有光路基；桥南有轨有枕木。 */
export const L1218_RAIL = F({ name: "津浦铁路路基", x: -104, topW: 5, slope: 1.5, topY: L1218_HEIGHTS.railTopY, gauge: 1.435, railW: 0.07, railH: 0.15 });
/** 上路基的土坡：田间小路到桥北头那一截（东坡上斜着垫出来的坡道，宽 3）。 */
/** 上下路基的土坡（东坡上斜着垫出来的坡道，宽 3）：桥北头一处（田间小路上来）、桥南头一处（下到南岸路，在河堤南边）。 */
export const L1218_RAIL_RAMPS = F([
  F({ id: "RampNorth", name: "桥北头上路基的土坡", from: P(-92, 755), to: P(-101.2, 755), halfW: 1.5 }),
  F({ id: "RampSouth", name: "桥南头下路基的土坡", from: P(-92, 822), to: P(-101.2, 822), halfW: 1.5 }),
]);
export const L1218_RAIL_RAMP = L1218_RAIL_RAMPS[0];

/**
 * 沙河：东西走向、在村南。两岸陡坎（3 m，水平 2 m 内落完），河床大半是沙（−2.7），中间一股水（宽 7、深 0.4）。
 * 北坎顶 / 南坎顶的 z 随 x 有一点弯（铁路桥那一段拉直）；两处缓一点的滑坡道（北岸下、南岸上）。
 */
export const L1218_RIVER = F({
  name: "沙河", northTopZ: 763, bedW: 40, cliffM: 2.0, straightX: F([-134, -74]),
  stream: F({ halfW: 3.5, edgeM: 1.0, offsetZ: 2.0 }),
  slides: F([F({ id: "SlideNorth", name: "北岸的滑坡道", x: -82, bank: "north", halfW: 1.6, lenM: 9 }), F({ id: "SlideSouth", name: "南岸的滑坡道", x: -78, bank: "south", halfW: 1.6, lenM: 9 })]),
});
function Wave(x, a1, p1, ph1, a2, p2, ph2) { return a1 * Math.sin((x + ph1) / p1) + a2 * Math.sin((x + ph2) / p2); }
function StraightWeight(x) {
  const [a, b] = L1218_RIVER.straightX, fade = 24;
  const out = Math.max(a - x, 0, x - b);
  const t = Math.min(1, out / fade);
  return t * t * (3 - 2 * t);
}
/** 沙河在 x 处：北坎顶 / 北坎脚 / 南坎脚 / 南坎顶的 z、那一股水的中线 z。 */
export function RiverAtX(x) {
  const R = L1218_RIVER, w = StraightWeight(x);
  const northTop = R.northTopZ + w * Wave(x, 2.2, 48, 30, 1.2, 21, -50);
  const bed = R.bedW + w * Wave(x, 2.5, 39, -15, 1.0, 17, 70);
  const northToe = northTop + R.cliffM, southToe = northToe + bed, southTop = southToe + R.cliffM;
  const streamZ = (northToe + southToe) / 2 + R.stream.offsetZ + w * Wave(x, 5.0, 37, 10, 1.5, 13, 0);
  return { northTop, northToe, southToe, southTop, streamZ };
}
const AT_RAIL = RiverAtX(L1218_RAIL.x);

/** 铁路桥：路基跨沙河，四孔钢梁（每孔约 11 m）架在石墩上，桥面只有枕木 + 两根轨，无栏杆。18 炸后北头两孔断开砸进河床（BridgeBlown）。 */
export const L1218_RAIL_BRIDGE = F({
  name: "铁路桥（钢梁四孔）", x: L1218_RAIL.x, northZ: AT_RAIL.northTop, southZ: AT_RAIL.southTop, spans: 4,
  girder: F({ offX: 1.2, w: 0.4, h: 1.2 }), pier: F({ w: 3.0, d: 1.8 }), abutment: F({ w: 6.0, d: 2.0 }),
  sleeper: F({ len: 2.8, w: 0.24, h: 0.15, everyM: 0.6 }),
  walkW: 2.4,                         // 看不见的走道宽（standOn：演员站在枕木顶上）
  blownSpans: F([0, 1]),              // 炸掉北头这两孔（从北往南数，0 = 最北）
  charges: F([0, 1]),                 // 炸药绑在这两座桥墩上（从北往南数的桥墩，0 = 第一座）
});
/** 桥北头土坎：桥北约 33 m、路基东侧田里一道东西向矮土坎（高 1 m）；坎背后（南边）一溜洼。 */
export const L1218_BANK = F({ name: "桥北土坎", z: 730, fromX: -92, toX: -68, halfD: 0.8, slopeM: 1.0, topY: L1218_HEIGHTS.bankTopY, hollow: F({ fromZ: 731.2, toZ: 735, fadeM: 0.8, y: L1218_HEIGHTS.bankHollowY }) });
/** 南头河堤：南坎顶往南 6 m，东西向，顶 1.8（高出平地 1.5）。散兵坑在堤后（南边），浅。南岸路从桥南头的土坡脚起（在堤南边），不过堤。 */
export const L1218_LEVEE = F({
  name: "南头河堤", z: AT_RAIL.southTop + 6, fromX: -160, toX: -30, crestW: 1.5, baseHalfW: 3.5, crestY: L1218_HEIGHTS.leveeCrestY,
  foxhole: F({ name: "南头散兵坑", z: AT_RAIL.southTop + 11.5, fromX: -82, toX: -62, floorW: 1.0, depth: 0.6, wallM: 0.4 }),
});
/** 北门（照旧压近：真实离北沙河十来里，白盒里放在南岸往南约 143 m，夜里黑场带过）。 */
export const L1218_NORTH_GATE = F({
  name: "滕县北门", wall: F({ z: 950, t: 6, h: 8, fromX: -98, toX: 20 }),
  gate: F({ x: -88, w: 4, h: 4.5 }),
  street: F({ x: -88, halfW: 3, fromZ: 953, toZ: 980 }),
  torches: F([P(-92, 945.5), P(-84, 945.5)]),
  sandCarts: F([P(-93.6, 941.8), P(-82.2, 939.4)]),
  waterBucket: P(-84.4, 945.8),
  flatBox: Box(-100, 0, 930, 980),
});

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
  Torch: F({ w: 0.15, d: 0.15, h: 2.0, semantic: "danger", name: "火把" }),
  Charge: F({ w: 0.5, d: 0.4, h: 0.3, semantic: "danger", name: "炸药包" }),
  DoorBoard: F({ w: 1.0, d: 0.18, h: 1.9, semantic: "timber", name: "靠墙的门板" }),
  Branches: F({ w: 1.6, d: 1.0, h: 0.6, semantic: "foliage", name: "一抱树枝" }),
});
const Prop = (id, x, z, ry = 0) => F({ id, kind: id.split("_")[0], x, z, ry });
export const L1218_PROPS = F([
  // 沟口：七二七团往杂木堆上添的树枝、机枪位边的弹药箱
  Prop("Branches_D1", 88.6, 639.2, 0.3), Prop("Branches_D2", 106.4, 639.4, -0.4), Prop("AmmoBox_D1", 115.2, 640.0, 0.2), Prop("AmmoBox_D2", 115.9, 640.6, 1.2),
  // 救护所里
  Prop("WaterVat_A1", 82.6, 682.6), Prop("DoorBoard_A1", 91.2, 684.0, 1.5708), Prop("DoorBoard_A2", 67.4, 691.5, 1.5708),
  // 教堂门口的包袱
  Prop("Bundle_C1", 147.3, 684.2, 0.4), Prop("Bundle_C2", 149.2, 685.9, 1.0),
  // 北门外
  Prop("HandCart_G1", -93.6, 941.8, 0.2), Prop("HandCart_G2", -82.2, 939.4, -0.1), Prop("Sandbag_G1", -79.5, 944.6), Prop("Sandbag_G2", -78.9, 945.1),
  // 南头河堤后的弹药箱
  Prop("AmmoBox_L1", -97.6, 818.2, 0.2), Prop("AmmoBox_L2", -96.8, 818.9, 1.3),
]);
/** 夜里村里亮着灯的几户（18 对岸看得见；院里马灯桩）。 */
export const L1218_VILLAGE_LIGHTS = F([P(90, 655), P(132, 652), P(186, 680), P(150, 724), P(76, 714)]);

/** 场景信号（关键帧 signals 与场景文件 gates 共用的名字）。 */
export const L1218_SIGNALS = F({
  cartOverturned: "CartOverturned", // 14-3 起：救护所院门口，拴在车辕里的黑子挨了一梭，连车带驴翻在地上（翻倒的车出现；立着的车 GengCart 从 14-3 起不再摆）
  familyHidden: "FamilyHidden",       // 12-5 起：钻洞的那一家拿席子盖住洞口
  girlHoleCovered: "GirlHoleCovered", // 18-2 起：女娃她娘把席子拉上、盖住洞口
  chargesSet: "ChargesSet",           // 18-4 起：北头两座桥墩上绑了炸药、引线拉到南头河堤后
  bridgeBlown: "BridgeBlown",         // 18-6 起：北头两孔钢梁断开砸进河床
});

/** 关键地点。x/z 是中心或站点。 */
export const L1218_PLACES = F({
  villageSouth: L0610_PLACES.villageSouth,                          // 耿家庄村南口 (117,545)
  laneShell: P(117, 538),                                           // 11-1 身后落在胡同里的那发炮
  gengSmoke: P(L0610_GENG.yard.center.x, L0610_GENG.yard.center.z), // 12-2「看」：老耿家腾起黑烟
  fieldShell: P(124, 580),                                          // 12-1 打偏落在路边麦地的那发炮
  junction: L1218_JUNCTION,
  ditchNorth: P(97, 628.4),                                         // 沟北沿（板桥北头外）
  plankNorth: P(97, 630.5), plankSouth: P(97, 635.5), plankMid: P(97, 633),
  ditchFloor: P(88, 633),                                           // 沟底（离板桥 9 m）
  sentry: P(99.6, 638.4),                                           // 12-3 端枪的哨兵（板桥南头）
  trenchSquad: P(122, 642.5),                                     // 13 班长趴的战壕（沟口东段）
  mg727: P(114.4, 638.6),                                           // 七二七团的机枪（沟东头南沿）
  tankette1: P(97.6, 624.2), tankette2: P(100.6, 613.0),           // 13 两辆九四式（沟北沿外的官道上）
  helmetsAt: P(117, 549),                                           // 12-4 村南口冒出两三顶钢盔
  westTurn: L1218_WEST_TURN,
  aidGateOut: P(93.6, 690.5), aidGateIn: P(90.4, 690.5),
  xiangDoor: P(66.5, 685),
  flareAt: P(100, 590),                                             // 13-3 信号弹从沟北边打上天
  planesFrom: P(230, 640),                                          // 13-3 飞机从东边来
  villageWest: L1218_VILLAGE_WEST,
  railRampTop: P(-101.2, 755), bridgeNorth: P(L1218_RAIL.x, AT_RAIL.northTop), bridgeSouth: P(L1218_RAIL.x, AT_RAIL.southTop),
  lastGroupCover: P(-82, 733.2),                                    // 18 班长他们缩在土坎背后
  lastGroupExposed: P(-97, 748),                                    // 离开土坎往桥头跑：机枪看得见
  ijaMg18: P(-97.2, 695.0),                                         // 18 田里那挺机枪（坟头旁、路基东脚）
  leveePlayer: P(-94, AT_RAIL.southTop + 6),                        // 18 顺子趴的河堤顶（路基东边 10 m）
  leveeCover: P(-94, AT_RAIL.southTop + 8.6),                       // 河堤后头（炸桥时扑过去的地方）
  wadeAt: P(-80, AT_RAIL.northToe + 18),                            // 18 老乡蹚水过去的地方
  northGate: P(L1218_NORTH_GATE.gate.x, L1218_NORTH_GATE.wall.z),
  sunWest: P(-400, 760),                                            // 太阳落到铁路那头（西边）
});

/** 出生点：11-1 耿家庄村南口，朝南（往南看土路、官道、北沙河村）。 */
export const L1218_SPAWN = F({ x: 117, z: 547.4, yawDeg: 180 });
