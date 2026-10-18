// ===========================================================================
// Data_EditorBlockoutFirstLevel0105Space.mjs —— 第一关 01–05 白盒（关卡键 FirstLevel0105）的空间锚点
//
// 唯一口径：Notion「第一关｜往南的路 · 剧本」子页「空间拓扑关系」（10-18 定稿的纸面设计，10-18 晚改稿：
// 02 反冲改南沿迂回、拖单被改两人并排、集结处改成干沟、路口加板桥、沟里铺日常摆件；页里的图还是旧的，以文字为准）。
// 本表把那几张图（约 2.2 px/米、北在上）换算成本关的世界坐标：
//   原点 = 沟口（交通沟接进前沿沟的地方）；X 向东、Z 向南、米；朝向 yawDeg：0 朝北（−Z）、+90 朝西、−90 朝东、180 朝南。
// 这是一片独立的白盒场地，坐标与游戏里的第一关（Data_FirstLevelMission*）无关，也不改它们。
//
// 场景生成器（Script_EditorBlockoutFirstLevel0105Scene.mjs）按这里烘地形与体块，
// 关键帧生成器（Script_EditorBlockoutFirstLevel0105Keyframes.mjs）按这里摆人、POI 与机位，
// 预演生成器（Script_EditorBlockoutFirstLevel0105Previz.mjs）按这里与关键帧摆调度。
// 都只读本表；要挪地方先改这里，再重跑生成器。纯数据：零 three、零 DOM，node 与浏览器共用。
//
// 草算尺寸（Notion 表）与本表的对照：
//   前沿沟 约 195 m，沟口以西约 70 m 在我方        → 西端 x −62 再往北折 22 m；东端 x 120；合计约 200 m
//   机枪坑 约 8×6 m，散兵坑在坑西北约 12 m         → 坑 x −4…4、z −10…−4；散兵坑 (−9,−15)，离坑心 12 m
//   交通沟 全长约 170 m，拐角 1 离坑约 18 m          → 沟口→干沟口约 154 m；拐角 1 (0.5,11) 离坑心 18 m
//   支沟 约 43 m，洞离路约 15 m、离前沿沟约 65 m    → 支沟口 (21.9,67.1)→洞口 (63,64.5) 41 m + 洞 7 m；洞东壁离路约 15 m；离前沿沟 64 m
//   支沟南沿外侧一道土垄（挡住北沿机枪的视线）      → 支沟的弃土只堆南沿：高 1.0 m、宽 2.6 m；迂回组贴着土垄外侧（沟心往南约 6.2 m）爬
//   路 横穿点在坡顶北边约 15 m                      → 路口 (35,116)，坡顶 z 131；路口搭板桥：桥面 3.8 m 宽、顺路 9.5 m 长，与地面齐平，门板之间 9 cm 缝
//   坡顶比沟底高约 4 m；干沟沟底约 15×50 m、两岸陡坎约 2.5 m
//                                                   → 坡顶 +3.0；干沟 x 12…62、z 141…156，沟底 −1.0，两岸坎顶 +1.5（坎高 2.5 m）
//   南岸坎顶堆一道矮土埂（10-18 加）                → 顶高 0.6–0.8 m、底宽约 2.2 m，从西头缓坎绕过西南角顺南岸到 x 84，东头被凹路切开
//   干沟东南头接往南的凹路（后送路）                → 凹路从干沟东南角 (58,154.5) 往东出沟、在 (83,159) 拐往南，路底宽 4 m，比两侧低 1.2–2.5 m
//   03 轻机枪在坑北约 100–150 m；掷弹筒约 200 m    → 轻机枪 (−30,−118) 与 (40,−140)；掷弹筒 (28,−214) 躲在土坎 z −206 后
//   02 拖单被（洞口 0 → 弹药箱垛 22 → 支沟口 41 → 拐角 2 62 → 路口 92 → 坡顶 107 → 干沟 125 m）与上面的折线一致
// ===========================================================================

export const L0105_LEVEL_KEY = "FirstLevel0105";
export const L0105_TITLE = "第一关 01–05 · 撤退（新剧本白盒）";

/** 场地范围与高度网格。0.5 m 一格：3.4 m 沟底 + 2 m 深的沟壁在 1 m 格上会被磨成斜坡。 */
export const L0105_BOUNDS = Object.freeze({ minX: -110, maxX: 190, minZ: -235, maxZ: 200 });
export const L0105_CELL_M = 0.5;

/** 自然地面（开挖前）的几个控制高度，米。前沿一带是 0。 */
export const L0105_HEIGHTS = Object.freeze({
  front: 0,            // 前沿沟、机枪坑一带
  fieldNorthDip: -0.8, // 坑北 40–180 m 的开阔地略低（守方居高一点，看得见跃进的人）
  mortarBankTop: 2.2,  // 土坎顶（相对两侧地面）
  crest: 3.0,          // 坡顶
  gullyRim: 1.5,       // 坡顶南边那片台地 = 干沟两岸的坎顶
  assemblyFloor: -1.0, // 集结处干沟沟底：比坡顶低 4 m、比两岸坎顶低 2.5 m，看不见前沿
  southPlain: 0.0,     // 干沟南岸再往南十来米落到的平地
});

/** 壕沟断面（沟底宽、深）。沟底 ≥ 3.4 m 是 Script_SquadMarchAi.CanPause 的下限（史料约 0.6 m，见 docs/Data_TrenchSpline.md）。 */
export const L0105_TRENCH_SECTION = Object.freeze({
  front: Object.freeze({ floorW: 3.4, depth: 1.9 }),
  traffic: Object.freeze({ floorW: 3.4, depth: 2.0 }),
  trafficAtCrossing: Object.freeze({ floorW: 3.4, depth: 2.3 }), // 板桥底下加深 0.3 m：桥下横木底离沟底约 1.9 m
  trafficAtCrest: Object.freeze({ floorW: 3.4, depth: 1.5 }),
  branch: Object.freeze({ floorW: 3.4, depth: 2.4 }),   // 支沟比交通沟低，支沟口有台阶
  crawlSap: Object.freeze({ floorW: 1.4, depth: 1.0 }), // 坑到散兵坑的爬沟（只有玩家走）
});

/** 支沟南沿那道土垄（弃土只堆南沿）。迂回组贴着它外侧爬，北沿的机枪看不见。 */
export const L0105_BRANCH_SOUTH_BERM = Object.freeze({ h: 1.0, w: 2.6 });

const P = (x, z) => Object.freeze({ x, z });
const Line = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));

/**
 * 中心线（折线，米）。场景生成器把它们交给 Script_TrenchPlan.CompileTrenchNetwork 烘进高度场。
 * front：东西走向一折一折（±3.5 m、12 m 一折），西头直角往北折护左翼；沟口那 10 m 是平的（机枪坑在它正北）。
 * traffic：沟口 → 拐角 1 → 斜折 → 南直段 → 支沟口（在斜段上）→ 拐角 2 → 路口（板桥）→ 坡顶 → 下到干沟。
 * branch：支沟口往东笔直到防炮洞口（机枪架在洞口这头的北沿上能顺沟压住支沟口）。
 */
export const L0105_TRENCHES = Object.freeze({
  front: Line([-62, -22], [-62, 0], [-50, 3.5], [-38, -3.5], [-26, 3.5], [-14, -3.5], [-5, 0], [5, 0],
    [14, -3.5], [26, 3.5], [38, -3.5], [50, 3.5], [62, -3.5], [74, 3.5], [86, -3.5], [98, 3.5], [110, -3.5], [120, 0]),
  traffic: Line([0, 0], [0.5, 11], [13, 21], [12, 44], [30, 86], [35, 116], [35, 131], [35, 144]),
  branch: Line([21.9, 67.1], [63, 64.5]),
  crawlSap: Line([-3.5, -9], [-8, -14]),
});

/** 前沿沟哪一段已经丢了（按拍）：x ≥ lostFromX 的那段在鬼子手里。 */
export const L0105_FRONT_LOST_FROM_X = Object.freeze({ "01": 25, "02": 25, "03": 13, "04": -5, "05": -5 });

/** 路：从东北斜下来，经过防炮洞东边约 15 m，在坡顶前横穿交通沟（路口，板桥），再往西南翻过坡去。 */
export const L0105_ROAD = Line([175, -40], [105, 50], [35, 116], [-20, 152], [-100, 185]);
export const L0105_ROAD_WIDTH_M = 4.5;

/** 集结处干沟：东西向，沟底平；两岸陡坎（坎宽 wallM），东西两头缓一些（endWallM）。 */
export const L0105_GULLY = Object.freeze({
  name: "集结处（干沟）", minX: 12, maxX: 62, minZ: 141, maxZ: 156,
  wallM: 2.0, endWallM: 6, northRimZ: 139, southRimZ: 158, southSlopeM: 10,
});
/**
 * 干沟南岸坎顶的一道矮土埂（10-18 用户：南边平地看沟底只多挡 0.16 m 太险）：烘进高度场，连续一道，
 * 顶高 h（按弧长有 ±0.09 m 的起伏，落在 0.6–0.8 m）、底宽约 w、顶宽 topW；中心线 line 沿南岸坎顶走，
 * 西头绕过干沟西南角、顺西头的缓坎往北收尖（南边平地斜着往东北看，视线从西头那段缓坎上过），东头一直堆到凹路拐弯处，
 * 由凹路切开（凹路本身就是开口）。
 */
export const L0105_GULLY_SOUTH_BERM = Object.freeze({
  h: 0.7, w: 2.2, topW: 0.8, taperM: 4,
  line: Line([4.4, 145], [4.9, 150.5], [5.9, 154.8], [8.4, 157.8], [12, 158.7], [20, 158.4], [28, 158.8], [36, 158.5], [44, 158.8],
    [52, 158.4], [60, 158.7], [68, 158.5], [76, 158.8], [84, 158.6]),
});
/** 干沟南岸一排枯树（3 月，没叶子）：树干中心。 */
export const L0105_GULLY_TREES = Object.freeze([
  [13.5, 159.3, 6.4], [18.1, 159.0, 7.2], [22.6, 159.6, 6.8], [27.4, 159.1, 7.6], [31.8, 159.5, 6.6], [36.5, 159.2, 7.4],
  [41.0, 159.7, 7.0], [45.6, 159.1, 6.5], [50.2, 159.4, 7.3], [54.9, 159.0, 6.9], [59.3, 159.5, 7.1],
].map(([x, z, h]) => Object.freeze({ x, z, h })));
/** 凹路（后送路，06 老耿的驴车从这走）：从干沟东南角先往东出沟、再拐往南（拐一道弯，南边平地上顺着路望不进沟底）。路底宽 floorW、两壁 wallM；路底从 fromY 缓降到 toY。 */
export const L0105_SUNKEN_LANE = Object.freeze({
  line: Line([58, 154.5], [80, 155], [83, 159], [83, 175], [80, 199]), floorW: 4, wallM: 1.4, fromY: -1.0, toY: -1.4,
});

/** 路口板桥：几根顺路方向的横木上铺门板，桥面与两侧地面齐平；桥下照常是沟（人能在沟底趴着）。 */
export const L0105_BRIDGE = Object.freeze({
  name: "路口板桥", x: 35, z: 116, yawDeg: 128.3, // 顺路方向（路在路口拐了 10°，取两段的平均）
  // 门板顺路一块 boardM 宽，块与块之间留 gapM 的缝（桥下仰看透得出天光和车底，土从缝里往下漏）。
  // 10-18 第三轮：缝 5 → 9 cm（门板拼的桥 6–10 cm 都合理；5 cm 在白盒灰里看不出是一块块板），每块门板是各家拆来的旧门板：
  // boardJitter 逐块给 [底面垫高 lift, 厚度 T, 横向长短 dW, 歪一点 dRy（弧度）]。底面 = 桥面顶 − boardT + lift（不低于横木顶，
  // 所以横木的位置和桥下净空 1.76 m 不变），顶面 = 底面 + T：板厚 6–9 cm、顶面高低差 3 cm 上下（驴车、担架照样过）。
  // 板比缝薄，桥下仰看斜着 45° 也透得出天光。
  deckW: 3.8, spanM: 9.5, boardM: 0.95, gapM: 0.09, boardT: 0.1, stringerW: 0.28, stringerH: 0.28, stringerOffsets: Object.freeze([-1.45, 0, 1.45]),
  boardJitter: Object.freeze([
    [0, 0.08, 0, 0], [0.01, 0.06, -0.06, 0.01], [0, 0.09, 0.05, -0.01], [0.02, 0.06, -0.1, 0.015], [0, 0.07, 0.08, -0.01],
    [0.01, 0.08, -0.04, 0.01], [0, 0.09, 0.1, -0.015], [0.02, 0.07, -0.08, 0.005], [0.01, 0.07, 0.03, -0.01], [0, 0.06, -0.05, 0.015],
  ].map(row => Object.freeze(row))),
});

/** 有名字的地方。x/z 是中心或站点；yawDeg 是站在那里该朝的方向。 */
export const L0105_PLACES = Object.freeze({
  mouth: Object.freeze({ name: "沟口", x: 0, z: 0 }),
  // 我方机枪坑：在沟口正北、往前挖出去一点，前沿堆胸墙；坑底比地面低 1.3 m（比沟底高，有一步台阶下到沟口）
  pit: Object.freeze({ name: "机枪坑", x: 0, z: -7, w: 8, d: 6, floorDepth: 1.3 }),
  parapet: Object.freeze({ name: "胸墙", x: 0, z: -10.6, w: 9, d: 1.4, h: 0.8 }),
  fireA: Object.freeze({ name: "甲 · 坑沿", x: 0.8, z: -9.2, yawDeg: 0 }),       // 朝北压正面
  fireB: Object.freeze({ name: "乙 · 沟口", x: 4.5, z: 0.3, yawDeg: -90 }),      // 朝东挡沿前沿沟清过来的
  fireC: Object.freeze({ name: "丙 · 散兵坑", x: -9, z: -15, yawDeg: 45, radiusM: 1.6, depth: 1.2 }), // 朝西北护侧翼
  zb26: Object.freeze({ name: "捷克式", x: -1.2, z: -9.4, yawDeg: 0 }),
  corner1: Object.freeze({ name: "拐角 1", x: 0.5, z: 11 }),
  bend: Object.freeze({ name: "斜折", x: 13, z: 21 }),
  southLegEnd: Object.freeze({ name: "南直段尽头", x: 12, z: 44 }),
  branchMouth: Object.freeze({ name: "支沟口（台阶）", x: 21.9, z: 67.1 }),
  steps: Object.freeze({ name: "台阶", x: 24.4, z: 66.9, yawDeg: 90, count: 3, riseM: 0.4 }), // 从支沟往西上到交通沟（落差 = 支沟深 2.4 − 交通沟深 2.0）
  // 02 反冲迂回：班长一组在支沟口往南 10 m 处从交通沟东沿爬出去，贴支沟南沿土垄外侧往东爬到审问处对面
  outflankExit: Object.freeze({ name: "迂回组爬出交通沟", x: 31.0, z: 74.2 }),
  corner2: Object.freeze({ name: "拐角 2", x: 30, z: 86 }),
  crossing: Object.freeze({ name: "路口（板桥）", x: 35, z: 116 }),
  crest: Object.freeze({ name: "坡顶", x: 35, z: 131 }),
  assemblyEntry: Object.freeze({ name: "干沟口（交通沟下到干沟）", x: 35, z: 141.5 }),
  assembly: Object.freeze({ name: "集结处（干沟）", x: 37, z: 148.5, w: 50, d: 15 }),
  laneHead: Object.freeze({ name: "凹路口（往后送）", x: 59, z: 154.5 }),
  // 防炮洞：支沟尽头，洞口朝西（对着支沟），洞里 7×5 m、地面比自然地面低 2.6 m，顶上横木 + 覆土
  dugoutMouth: Object.freeze({ name: "防炮洞口", x: 63, z: 64.5, yawDeg: 90 }),
  dugout: Object.freeze({ name: "防炮洞", x: 66.5, z: 64.5, w: 7, d: 5, floorDepth: 2.6 }),
  // 01–02 日军机枪：架在支沟北沿上、靠洞口这头，顺着笔直的支沟往西压住支沟口
  enemyBranchGun: Object.freeze({ name: "日军机枪（支沟沿）", x: 56, z: 61.6, yawDeg: 90 }),
  interrogation: Object.freeze({ name: "审问处", x: 57.5, z: 65.3 }),
  roadsideNearDugout: Object.freeze({ name: "洞旁路边", x: 84, z: 70 }),
  // 坡顶别的班守着的坡沿（交通沟东边，趴着朝北）
  crestPosts: Object.freeze([P(42, 129.5), P(50, 129), P(58, 129.5), P(66, 130)]),
  // 03：远处的日军
  enemyLmgWest: Object.freeze({ name: "轻机枪（西）", x: -30, z: -118, yawDeg: 180 }),
  enemyLmgEast: Object.freeze({ name: "轻机枪（东）", x: 40, z: -140, yawDeg: 180 }),
  mortarBank: Object.freeze({ name: "土坎", x: 28, z: -206, w: 90, d: 8 }),
  mortar: Object.freeze({ name: "掷弹筒", x: 28, z: -213, yawDeg: 180 }),
  tankFirstSeen: Object.freeze({ name: "战车露头", x: 159, z: -20, yawDeg: 142 }),
  // 05：车刚过桥、车尾挨了那捆手榴弹，瘫在桥头（西南头），车身斜着把路堵死
  tankStop: Object.freeze({ name: "战车瘫在桥头", x: 28.7, z: 120.1, yawDeg: 148 }),
});

/**
 * 沟里的日常摆件（不是专门摆的掩体）：on = 哪条沟，d = 沿中心线的弧长（米，从折线起点量），lat = 往行进方向左手边偏多少米。
 * 能挡子弹的只用齐腰高、蹲下藏得住的（CrateStack 弹药箱垛 / SandbagStack 土袋垛 / Collapse 炮震塌的沟壁土堆 / WaterVat 水缸），
 * 门板、木头堆只是摆设。都贴沟底一侧，留出 ≥ 2.2 m 通道（AI 与担架要过）。尺寸见 L0105_PROP_KINDS。
 * 02 拖单被三处躲的地方：CrateStack_B1（支沟里一垛弹药箱）、支沟口台阶拐角（旁边 SandbagStack_J1）、拐角 2（SandbagStack_C2）。
 * 弧长：交通沟 支沟口 ≈ 75.1、拐角 2 ≈ 95.7、路口 ≈ 126.1；支沟全长 41.2（从支沟口量）；前沿沟 西折 0–22、沟口 85.8–95.8。
 */
export const L0105_PROP_KINDS = Object.freeze({
  CrateStack: Object.freeze({ len: 1.6, across: 1.0, h: 1.0, semantic: "timber", cover: true, name: "弹药箱垛" }),
  SandbagStack: Object.freeze({ len: 1.8, across: 0.9, h: 0.9, semantic: "cover", cover: true, name: "土袋垛" }),
  Collapse: Object.freeze({ len: 2.6, across: 1.1, h: 0.9, semantic: "earthDark", cover: true, name: "塌方土堆" }),
  WaterVat: Object.freeze({ len: 0.8, across: 0.8, h: 0.9, semantic: "plaster", cover: true, name: "水缸" }),
  DoorBoard: Object.freeze({ len: 1.0, across: 0.18, h: 1.9, semantic: "timber", cover: false, name: "靠沟壁的门板" }),
  WoodPile: Object.freeze({ len: 2.0, across: 0.8, h: 0.55, semantic: "timber", cover: false, name: "木头堆" }),
});
const Prop = (id, on, d, lat) => Object.freeze({ id, kind: id.split("_")[0], on, d, lat });
export const L0105_PROPS = Object.freeze([
  // 前沿沟（西折那截 22 m；之后一折 12–14 m，隔一折摆一样）
  Prop("CrateStack_F1", "front", 7, 1.4), Prop("DoorBoard_F1", "front", 15, -1.85),
  Prop("SandbagStack_F2", "front", 28.2, -1.4), Prop("WaterVat_F1", "front", 41.4, -1.4), Prop("Collapse_F1", "front", 55.3, 1.35),
  Prop("CrateStack_F2", "front", 69.2, -1.4), Prop("WoodPile_F1", "front", 81, -1.4),
  Prop("SandbagStack_F3", "front", 100.6, -1.4), Prop("CrateStack_F3", "front", 112.4, 1.4), Prop("Collapse_F2", "front", 126.3, -1.35),
  Prop("DoorBoard_F2", "front", 140.2, 1.85), Prop("WaterVat_F2", "front", 143.5, -1.4), Prop("SandbagStack_F4", "front", 154.1, 1.4),
  Prop("CrateStack_F4", "front", 168, -1.4), Prop("WoodPile_F2", "front", 181.9, 1.4), Prop("Collapse_F3", "front", 195.7, -1.35),
  Prop("SandbagStack_F5", "front", 209.6, 1.4), Prop("DoorBoard_F3", "front", 221.9, -1.85),
  // 交通沟（往南走，左手 = 东）
  Prop("WaterVat_T1", "traffic", 6.5, 1.4), Prop("CrateStack_T1", "traffic", 19, -1.4),
  Prop("SandbagStack_T2", "traffic", 34, 1.4), Prop("DoorBoard_T1", "traffic", 44, -1.85),
  Prop("WoodPile_T1", "traffic", 58, -1.4), Prop("CrateStack_T2", "traffic", 67, 1.4),
  Prop("SandbagStack_J1", "traffic", 80.5, 1.4), Prop("Collapse_T1", "traffic", 88, -1.35),
  Prop("SandbagStack_C2", "traffic", 97.8, 1.4), Prop("WaterVat_T2", "traffic", 106, -1.4), Prop("DoorBoard_T2", "traffic", 114, 1.85),
  Prop("CrateStack_T3", "traffic", 134, -1.4),
  // 支沟（从支沟口往东走，左手 = 北）
  Prop("WaterVat_B1", "branch", 5.5, 1.4), Prop("DoorBoard_B1", "branch", 12, 1.85),
  Prop("CrateStack_B1", "branch", 19, -1.3), Prop("WoodPile_B1", "branch", 26, 1.4), Prop("SandbagStack_B2", "branch", 30.5, 1.4),
]);

/** 场景信号（关键帧 signals 与场景文件 gates 共用的名字）。 */
export const L0105_SIGNALS = Object.freeze({
  dugoutCollapsed: "DugoutCollapsed", // 01 塌洞：洞口横木塌下来、土埋了半个洞口
  pitShelled: "PitShelled",           // 03 末：战车一炮打在坑沿，胸墙塌了一截
  tankDisabled: "TankDisabled",       // 05：战车瘫在桥头（车体残骸横在路上），桥面两块门板压断下沉
});

/** 出生点：洞里（01 开场）。 */
export const L0105_SPAWN = Object.freeze({ x: 66.5, z: 64.2, yawDeg: 90 });

/** 坐标工具：折线上按弧长取点（生成器摆人用）。 */
export function PointAlong(line, distanceM) {
  let left = Math.max(0, distanceM);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= len || i === line.length - 1) {
      const t = len > 0 ? Math.min(1, left / len) : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, headingYawDeg: Math.atan2(-(b.x - a.x), -(b.z - a.z)) * 180 / Math.PI };
    }
    left -= len;
  }
  const last = line[line.length - 1];
  return { x: last.x, z: last.z, headingYawDeg: 0 };
}

export function LineLength(line) {
  let sum = 0;
  for (let i = 1; i < line.length; i++) sum += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
  return sum;
}

/** 折线上按弧长取点，再往行进方向左手边偏 lat 米（左 = 面朝行进方向的左边；俯视 X 东 Z 南）。 */
export function PointBeside(line, distanceM, lat = 0) {
  const p = PointAlong(line, distanceM);
  const r = p.headingYawDeg * Math.PI / 180;
  // 前方 (−sin, −cos)；左手 = (−cos, +sin)
  return { x: p.x - Math.cos(r) * lat, z: p.z + Math.sin(r) * lat, headingYawDeg: p.headingYawDeg };
}
