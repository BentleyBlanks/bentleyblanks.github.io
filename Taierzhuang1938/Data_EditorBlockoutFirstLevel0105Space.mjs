// ===========================================================================
// Data_EditorBlockoutFirstLevel0105Space.mjs —— 第一关 01–05 白盒（关卡键 FirstLevel0105）的空间锚点
//
// 唯一口径：Notion「第一关｜往南的路 · 剧本」子页「空间拓扑关系」（10-18 定稿的纸面设计，10-18 晚改稿：
// 02 反冲改南沿迂回、拖单被改两人并排、集结处改成干沟、路口加板桥、沟里铺日常摆件；10-20 干沟由方坑改弯沟、人分小堆、伤员进支沟）。
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
//   坡顶比沟底高约 4 m；两岸陡坎约 2.5 m             → 坡顶 +3.0；沟底 −1.0，两岸坎顶 +1.5（坎高 2.5 m）
//   10-20 干沟由 15×50 m 方坑改成弯沟               → 中心线 (31,145.1)…(78,147) 约 52 m，沟底宽 4–10 m；坑窝 A (43,144.8)、中弯 (56,152)、坑窝 B (71,145.5)
//                                                      沟底离大路 20 m 以上，人离路口 30–50 m；中弯往南接 6 m 长的支沟（伤员），支沟南头 (58.2,156.8) 就是凹路口
//   南岸坎顶堆矮土埂（10-18 加）                     → 顶高 0.6–0.8 m、底宽约 2.2 m，顺弯曲的南岸、绕过支沟、压在凹路南边，凹路拐弯处切开
//   凹路（后送路）                                    → 凹路口在台地里往东到 (83,161) 拐往南，路底宽 4 m，比两侧低 1.2–2.5 m
//   03 轻机枪在坑北约 100–150 m；掷弹筒约 200 m    → 轻机枪 (−30,−118) 与 (40,−140)；掷弹筒 (28,−214) 躲在土坎 z −206 后
//   （2026-10-20 坑北前景改稿：轻机枪 1 在坟地 G2 东肩后 (−26.85,−116.84)、轻机枪 2 在麦秸垛 (40,−138) 西南角；土坎换成横贯全场的地坎，
//    北低南高 2 m，掷弹筒 (28,−213) 在坎下；田埂、坟、干水沟、远处村子见 L0105_PIT_NORTH，边界北扩到 −480）
//   02 拖单被（洞口 0 → 弹药箱垛 22 → 支沟口 41 → 拐角 2 62 → 路口 92 → 坡顶 107 → 干沟 125 m）与上面的折线一致
// ===========================================================================

export const L0105_LEVEL_KEY = "FirstLevel0105";
export const L0105_TITLE = "第一关 01–05 · 撤退（新剧本白盒）";

/**
 * 场地范围与高度网格。0.5 m 一格：3.4 m 沟底 + 2 m 深的沟壁在 1 m 格上会被磨成斜坡。
 * 2026-10-20：北边界 −235 → −480（坑北前景要放下 z −400…−470 的村子与杨树带，L0105_PIT_NORTH）。
 */
export const L0105_BOUNDS = Object.freeze({ minX: -110, maxX: 190, minZ: -480, maxZ: 200 });
export const L0105_CELL_M = 0.5;

/** 自然地面（开挖前）的几个控制高度，米。前沿一带是 0。 */
export const L0105_HEIGHTS = Object.freeze({
  front: 0,            // 前沿沟、机枪坑一带
  fieldNorthDip: -0.8, // 坑北 40–180 m 的开阔地略低（守方居高一点，看得见跃进的人）
  // （2026-10-20 起 z −206 的土坎改成东西向长地坎，落差见 L0105_PIT_NORTH.scarp；原来的 mortarBankTop 2.2 不再用）
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

/**
 * 集结处干沟（10-20 用户：方坑太规矩、人挤一处像活靶子 → 改成雨水冲出来的弯沟）：
 * line 是沟底中心线 [x, z, 沟底半宽]，弯弯曲曲、宽窄不一；往北鼓出去的两处（坑窝 A、B）北岸是冲刷出来的陡坎，人分小堆贴着它；
 * 中间往南的那一弯接一条短支沟（branch，伤员放这里，不出台地），支沟南头就是凹路口：凹路在台地里往东走，到 x 83 才拐出去往南（拐弯，南边平地上看不进沟）。
 * 西头在交通沟坡道西边 4 m 收掉（沟底离大路 20 m 以上，原来方坑西北角只有 8 m），整条沟比原来的方坑往东挪，人离路口（板桥）30–50 m。
 * 两岸坎宽 wallM，东西两头缓一些（endWallM）；沟底半宽按弧长有 ±wobble 的起伏（确定性正弦），坎线不是直的。
 * minX…maxZ 是沟底的外包框（只给 0610 的走位区域粗用，不是形状）。northRimZ / southRimZ 是坡顶南边那片台地的南北界（地形大形用）。
 * 形状与位置是创作：滕县城外集结处 / 绷带所的实际位置与形制没查到出处（见 Notion 史实与创作对照表）。
 */
const GULLY_LINE = Object.freeze([[31, 145.1, 2.0], [35, 144.5, 3.0], [43, 144.8, 4.5], [50, 149.0, 3.0], [56, 152.0, 5.0], [63, 149.5, 3.5], [71, 145.5, 4.5], [78, 147.0, 2.0]]);
const GULLY_BRANCH = Object.freeze([[56, 152.0, 3.0], [58.2, 156.8, 3.0]]);
export const L0105_GULLY = Object.freeze({
  name: "集结处（干沟）",
  line: Line(...GULLY_LINE.map(([x, z]) => [x, z])), halfW: Object.freeze(GULLY_LINE.map((p) => p[2])),
  branch: Line(...GULLY_BRANCH.map(([x, z]) => [x, z])), branchHalfW: Object.freeze(GULLY_BRANCH.map((p) => p[2])),
  wallM: 2.0, endWallM: 6, branchWallM: 1.6, wobble: 0.12,
  minX: 25, maxX: 80, minZ: 140, maxZ: 160.5,
  northRimZ: 139, southRimZ: 158, southSlopeM: 10,
});
/** 干沟中心线上的几个点：坑窝 A（坡道东边）、中弯（接支沟）、坑窝 B（东头）。 */
export const L0105_GULLY_POCKETS = Object.freeze({ a: P(43, 144.8), mid: P(56, 152), b: P(71, 145.5) });

/** 点到「中心线 + 逐点半宽」的带子：→ { out 离沟底边多远（负 = 在沟底里）, d 离中心线, hw 那里的半宽, along 弧长, end 是否在端头外 }。 */
function BandStation(line, halfW, x, z) {
  let best = { out: Infinity, along: 0, end: false }, walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const raw = ((x - a.x) * dx + (z - a.z) * dz) / (len * len);
    const t = Math.min(1, Math.max(0, raw));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    const hw = halfW[i - 1] + (halfW[i] - halfW[i - 1]) * t;
    if (d - hw < best.out) best = { out: d - hw, d, hw, along: walked + len * t, end: (i === 1 && raw < 0) || (i === line.length - 1 && raw > 1) };
    walked += len;
  }
  return best;
}
/** 干沟沟底半宽的起伏（按弧长）：± wobble 倍，确定性。 */
function GullyWobble(along) {
  return 1 + L0105_GULLY.wobble * (0.6 * Math.sin(along * 0.43 + 0.9) + 0.4 * Math.sin(along * 1.07 + 2.6));
}
/**
 * 干沟「挖进去多少」的距离量：u ≤ 0 在沟底里，0…1 在坎上，≥ 1 在沟外。主沟与支沟取小的那个。
 * 场景生成器按它烘地形，关键帧生成器按它判断「在不在沟底」。
 */
export function GullyU(x, z) {
  const G = L0105_GULLY;
  if (x < G.minX - G.endWallM - 3 || x > G.maxX + G.endWallM + 3 || z < G.minZ - G.wallM - 4 || z > G.maxZ + G.wallM + 2) return Infinity;
  const m = BandStation(G.line, G.halfW, x, z);
  const uMain = (m.d - m.hw * GullyWobble(m.along)) / (m.end ? G.endWallM : G.wallM);
  const br = BandStation(G.branch, G.branchHalfW, x, z);
  const uBranch = br.out / G.branchWallM;   // 支沟南头也是陡坎（凹路从它东侧接出去）
  return Math.min(uMain, uBranch);
}
/** 点在不在干沟（含支沟）沟底里，margin 米以内也算。 */
export function InGullyFloor(p, margin = 0) {
  return GullyU(p.x, p.z) <= margin / L0105_GULLY.wallM;
}
/**
 * 干沟南岸坎顶的矮土埂（10-18 用户：南边平地看沟底只多挡 0.16 m 太险）：烘进高度场，
 * 顶高 h（按弧长有 ±0.09 m 的起伏，落在 0.6–0.8 m）、底宽约 w、顶宽 topW；中心线顺着弯曲的南岸坎顶走。
 * 10-20 改弯沟后：西头从沟西头绕过来，顺南岸、绕过支沟南头，压在凹路（台地里往东那段）的南边一直到 x 79，凹路往南拐出去的地方断开。
 * 另有一小段在凹路北边（挖路的弃土）。lines 每段两头收尖（taperM）。
 */
export const L0105_GULLY_SOUTH_BERM = Object.freeze({
  h: 0.7, w: 2.2, topW: 0.8, taperM: 4,
  lines: Object.freeze([
    Line([20, 150.4], [27, 152.2], [35, 152.4], [43, 154.0], [49, 157.4], [53, 160.6], [58, 162.6], [64, 163.2], [72, 163.0], [79.5, 162.6]),
    // 凹路北边：挖路的土顺手堆在路和坑窝 B 之间的窄土梁上
    Line([66.5, 154.6], [69, 154.6], [72, 154.5], [78.5, 154.6]),
  ]),
});
/** 干沟两岸的枯树（3 月，没叶子）：树干中心与高度。南岸顺着坎顶疏疏落落，有空当（支沟口西边坎顶那棵 (52.5,158.5) 给 06 老耿的车遮着）；北岸只在两个坑窝顶上各几棵（坡顶背后，前沿看不见）。 */
export const L0105_GULLY_TREES = Object.freeze([
  [21.5, 151.2, 6.4], [29.8, 154.2, 7.2], [33.1, 152.0, 6.6], [41.6, 154.4, 7.6], [47.0, 158.3, 6.9],
  [51.2, 161.8, 7.4], [52.5, 158.5, 7.3], [61.0, 164.6, 7.0], [68.2, 153.6, 6.5], [74.8, 164.4, 7.3], [81.0, 155.6, 6.8],
  [40.2, 137.6, 6.2], [45.4, 137.9, 7.1], [69.2, 138.6, 6.7], [74.5, 139.4, 7.5],
].map(([x, z, h]) => Object.freeze({ x, z, h })));
/**
 * 凹路（后送路，06 老耿的驴车从这走）：10-20 起从支沟南头（凹路口）出来，在台地里往东走（北边隔一道窄土梁就是坑窝 B，
 * 南边压着南岸土埂），到 (83,161) 才拐往南出台地（拐一道弯，南边平地上顺着路望不进沟底）。z 161 以南与原来一样。
 * 路底宽 floorW、两壁 wallM；路底从 fromY 缓降到 toY。
 */
export const L0105_SUNKEN_LANE = Object.freeze({
  line: Line([58.2, 156.8], [70, 158.6], [80, 158.6], [83, 161], [83, 175], [80, 199]), floorW: 4, wallM: 1.4, fromY: -1.0, toY: -1.4,
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
  // 集结处的「中心」取中弯（接支沟那一弯，沟底最宽）；人不站在这一个点上，分在坑窝 A、中弯 + 支沟、坑窝 B 三处
  assembly: Object.freeze({ name: "集结处（干沟中弯）", x: 56, z: 152 }),
  woundedBay: Object.freeze({ name: "支沟（伤员放这里）", x: 57.3, z: 154.8 }),
  donguaRest: Object.freeze({ name: "冬瓜躺的地方（支沟里）", x: 56.4, z: 155.4, yawDeg: 24 }),
  laneHead: Object.freeze({ name: "凹路口（往后送）", x: 60.5, z: 157.3 }),
  // 防炮洞：支沟尽头，洞口朝西（对着支沟），洞里 7×5 m、地面比自然地面低 2.6 m，顶上横木 + 覆土
  dugoutMouth: Object.freeze({ name: "防炮洞口", x: 63, z: 64.5, yawDeg: 90 }),
  dugout: Object.freeze({ name: "防炮洞", x: 66.5, z: 64.5, w: 7, d: 5, floorDepth: 2.6 }),
  // 01–02 日军机枪：架在支沟北沿上、靠洞口这头，顺着笔直的支沟往西压住支沟口
  enemyBranchGun: Object.freeze({ name: "日军机枪（支沟沿）", x: 56, z: 61.6, yawDeg: 90 }),
  interrogation: Object.freeze({ name: "审问处", x: 57.5, z: 65.3 }),
  roadsideNearDugout: Object.freeze({ name: "洞旁路边", x: 84, z: 70 }),
  // 坡顶别的班守着的坡沿（交通沟东边，趴着朝北）
  crestPosts: Object.freeze([P(42, 129.5), P(50, 129), P(58, 129.5), P(66, 130)]),
  // 03：远处的日军（2026-10-20 坑北前景：轻机枪 1 架在坟地一座坟的东肩后、轻机枪 2 趴在麦秸垛西南角、掷弹筒组在地坎下；见 L0105_PIT_NORTH）
  enemyLmgWest: Object.freeze({ name: "轻机枪（坟地）", x: -26.85, z: -116.84, yawDeg: 180, cover: "坟包 G2 (−28,−115.5) 的东肩" }),
  enemyLmgEast: Object.freeze({ name: "轻机枪（麦秸垛）", x: 37.2, z: -137.4, yawDeg: 180, cover: "麦秸垛 (40,−138) 西南角" }),
  mortarBank: Object.freeze({ name: "地坎", x: 28, z: -206, w: 300, d: 2 }),   // 东西横贯全场的梯田地坎（北低南高 2 m），见 L0105_PIT_NORTH.scarp
  mortar: Object.freeze({ name: "掷弹筒", x: 28, z: -213, yawDeg: 180 }),
  tankFirstSeen: Object.freeze({ name: "战车露头", x: 159, z: -20, yawDeg: 142 }),
  // 05：车刚过桥、车尾挨了那捆手榴弹，瘫在桥头（西南头），车身斜着把路堵死
  tankStop: Object.freeze({ name: "战车瘫在桥头", x: 28.7, z: 120.1, yawDeg: 148 }),
});

/**
 * 坑北前景（2026-10-20，用户在 03 坑沿朝北看：「日军这么一马平川合理吗」→ 拍板的「坑北前景」改稿）。
 * 没有史料出处，是创作：鲁南农田三月的常见样子（麦苗才返青、田埂、孤坟、坟地柏树、麦秸垛、干水沟、梯田地坎、远处村子和杨树带）。
 * 场景生成器把田埂、坟包、干水沟、地坎、大起伏烘进高度场，树桩 / 柏树 / 麦秸垛 / 杨树 / 土坯房出体块；
 * 关键帧与预演按这里摆 03 的日军（跃进的人每次扑倒都落在 rushCover 的掩体后）。
 * 田埂中心线 z = z0 + amp·sin(k·x + phase)，x 在 [minX, maxX]；坟 [x, z, 高]；树 [x, z, 高]；房 [x, z, 东西宽, 南北深]。
 */
export const L0105_PIT_NORTH = Object.freeze({
  clearedToZ: -80,   // 0–80 m 扫清射界（近处基本平，只有树桩、两道田埂、两座孤坟）
  // 1. 扫清带里的树桩：矮块 0.3–0.5 m
  stumps: Object.freeze([
    [-48, -30, 0.4], [-31, -19, 0.35], [-12, -27, 0.45], [8, -22, 0.3], [24, -33, 0.5], [41, -24, 0.35], [58, -35, 0.4],
    [76, -28, 0.45], [-38, -53, 0.3], [-4, -61, 0.4], [18, -51, 0.35], [33, -76, 0.5], [62, -57, 0.3], [85, -73, 0.4], [-56, -60, 0.45],
  ].map(([x, z, h]) => Object.freeze({ x, z, h }))),
  // 田埂：高 0.3、顶宽 0.6（两侧各 0.45 m 落到地面），两头 3 m 收尖
  bundH: 0.3, bundTopW: 0.6, bundSlopeM: 0.45,
  bunds: Object.freeze([
    Object.freeze({ id: "N1", z0: -42, amp: 2.5, k: 0.035, phase: 0.6, minX: -95, maxX: 150 }),   // 扫清带里两道
    Object.freeze({ id: "N2", z0: -68, amp: 3.0, k: 0.028, phase: 2.0, minX: -100, maxX: 160 }),  // 干水沟就到这道埂为止
    Object.freeze({ id: "F1", z0: -110, amp: 3.5, k: 0.022, phase: 0.3, minX: -110, maxX: 190 }), // 80–200 m 三道横贯
    Object.freeze({ id: "F2", z0: -150, amp: 3.0, k: 0.019, phase: 1.7, minX: -110, maxX: 190 }),
    Object.freeze({ id: "F3", z0: -190, amp: 3.5, k: 0.017, phase: 2.9, minX: -110, maxX: 190 }),
  ]),
  // 2. 两座孤坟（平不掉的）+ 4. 坟地五座坟：圆坟包，直径约 2.5 m（底 3 m 收到地面）
  graveBaseR: 1.5,
  loneGraves: Object.freeze([[-20, -55, 1.1], [45, -65, 1.15]].map(([x, z, h]) => Object.freeze({ x, z, h }))),
  graveyard: Object.freeze([
    ["G1", -35, -117, 1.2], ["G2", -28, -115.5, 1.1], ["G3", -31, -122, 1.3], ["G4", -24, -120.5, 1.0], ["G5", -37, -123.5, 1.15],
  ].map(([id, x, z, h]) => Object.freeze({ id, x, z, h }))),
  cypresses: Object.freeze([[-33.5, -127.5, 8.0], [-25.5, -126, 6.5], [-40, -120, 7.0]].map(([x, z, h]) => Object.freeze({ x, z, h }))),
  // 5. 麦秸垛：4×3 m、高 2.5（下层 1.9 + 上层收一圈 0.6，圆顶感）
  haystack: Object.freeze({ x: 40, z: -138, w: 4, d: 3, h: 2.5, baseH: 1.9, topW: 3.2, topD: 2.2 }),
  // 6. 干水沟：东北斜到坑西北，从坟地（北）和麦秸垛（南）之间穿过；沟底宽 1.5、口宽 3、深 1.2（自然地面往下），两沿各翻一条 0.3 m 高、1.2 m 宽的土（挖沟清淤堆的）；
  //    西南头最后 8 m 渐浅到地面（尽头在 N2 田埂北边，离坑心约 95 m），东北头一直通到场地边上；穿过地坎处地坎放缓成豁口
  ditch: Object.freeze({
    line: Line([190, -245], [130, -200], [70, -165], [10, -125], [-40, -92], [-70, -72]),
    floorW: 1.5, topW: 3.0, depth: 1.2, lipH: 0.3, lipW: 1.2, endTaperM: 8,
  }),
  // 7. 地坎：东西横贯，中心线 z = z0 + amp·sin(k·(x − x0))（x0 处正好 z0），北低南高 drop、坎面 faceM 宽（陡）；干水沟穿过处坎面放宽到 faceM + notchM（豁口）
  scarp: Object.freeze({ z0: -206, amp: 4.5, k: 0.016, x0: 28, drop: 2.0, faceM: 2.0, notchM: 14, notchR: 6 }),
  // 9. 大起伏：z < clearedToZ 起 rampM 内渐强，两条几百米波长的正弦，±1 m
  roll: Object.freeze({ rampM: 60, a1: 0.6, k1x: 0.0105, k1z: 0.0062, p1: 0.4, a2: 0.4, k2x: -0.0068, k2z: 0.0121, p2: 2.1 }),
  // 整片地往北缓缓抬：扫清带外到地坎抬 riseM（1 % 上下的坡，看不出来，坎顶就比坑北略高），坎下再往北到村子抬 farRiseM（村子在一片缓坡顶上）。
  // 不抬的话坎下那一大片比沟底还低，编辑器的高度色带会把它染成一片冷色，远看像水；坎下只留 20 m 上下一条低地（掷弹筒组在里面）。
  // 2026-10-20 第二轮：坎下 z −225 → −300 抬 2 → 5.5 m（正对着坑的缓坡，最陡约 11 %；村子在坡顶的平地上）：坑里眼高只比地面高 1 m，平地上 100 m 外的田在画面里挤成几个像素，
  // 抬起来的这面坡和坡顶的村子才露得出来。
  // 村子坐在往北再缓缓抬的坡上（villageRiseM，z −296 → −366，约 6 %）：后排比前排高一截，从坑里看屋顶一排压一排露出来。
  tilt: Object.freeze({ riseM: 1.5, fromZ: -80, toZ: -206, farRiseM: 5.5, farFromZ: -225, farToZ: -300, villageRiseM: 4.5, villageFromZ: -296, villageToZ: -366 }),
});

/**
 * 坑北第二轮（2026-10-20，用户从坑里朝北看：「还是大平原，房子也没有，路也没有，田也看不到」）：田、路、村子要一眼认得出。
 * 创作，不是史料复原（鲁南农田三月：返青的冬小麦、翻过的地、撂荒地；村子是一户一院的土坯房，深色屋顶）。
 *
 * 田：扫清带（z −12…−80）是一整块被踩过的麦地；往北按「横带」分（每条带的南北界是田埂 F1 / F2 / F3、地坎、再往北几道只涂色的地界），
 *     每条带里再按东西 20–60 m 切成一条一条的长条地（场景生成器按带号定宽度和种的东西，相邻两块不同）。颜色见 L0105_FIELD_PAINT。
 * 路：大路（L0105_ROAD）北头 (175,−40) 往北接一条土路 L0105_NORTH_ROAD 到村子东口，顺村里的前街一直穿到西头；战车就是从村里顺这条路出来的。
 *     L0105_ROAD 本身一个点不动（03-4 战车露头、04 / 05 战车走的都是它）。另一条田间小路 L0105_FIELD_PATH 从村子前街往西南穿田到坟地北边，
 *     单独一条线，不接进 L0105_ROAD。大路北段两边成排的杨树（细高 foliage 块 → 编辑器种成树）。
 *     路穿过地坎处地坎放缓成坡道，大路穿过干水沟处沟填平（涵洞土）。
 * 村子：坑北 290–365 m 的缓坡顶上，三排院子、两条东西街、中间一条南北胡同；院墙 2 m（plaster）、正房 / 厢房墙 3 m（plaster）+ 屋顶块（roof，比墙宽 0.8、厚 1.0–1.5）。
 */
export const L0105_NORTH_ROAD = Line([175, -40], [173, -90], [166, -150], [156, -205], [140, -262], [124, -296], [112, -318], [-52, -318]);
export const L0105_NORTH_ROAD_HALF_W = 2.6;
export const L0105_FIELD_PATH = Line([-5, -318], [-5, -298], [-22, -262], [-40, -222], [-44, -200], [-40, -165], [-33, -134]);
export const L0105_FIELD_PATH_HALF_W = 1.3;
/** 田间小路坎下到村口那一截，西边一侧稀稀拉拉一排树（从坑里看是一条往村子去的线）：从小路起点量 fromM…toM，每 spacing 米一棵。 */
export const L0105_PATH_TREES = Object.freeze({ lat: 3.2, spacing: 14, fromM: 24, toM: 112, hMin: 10, hMax: 13 });

/** 涂色（sRGB）。白盒灰调里拉得开，但别花：麦苗偏灰的暗绿、翻过的地深褐、撂荒地浅土黄。 */
export const L0105_FIELD_PAINT = Object.freeze({
  cleared: "#7d8360",   // 扫清带：被踩过的麦地（浅一点的绿褐）
  wheat: Object.freeze(["#566540", "#61704a"]),
  plowed: "#5a4532",
  fallow: "#b09a66",
  bund: "#6a5842",      // 田埂、地界
  graveSoil: "#594634", // 坟包
  ditchSoil: "#7a6143", // 干水沟两边翻出来的新土
  scarpFace: "#5b4a38", // 地坎坎面
  road: "#d8cfb6",      // 车辙压实的路（比撂荒地更白更灰，远看是一条亮线）
  path: "#d0c5a6",
  yard: "#a08f72",      // 院子里的夯土
  threshing: "#c3b38c", // 场院
});

/**
 * 田块分带：带与带之间的界线（自南往北），{ bund } = 那道田埂、{ scarp: true } = 地坎、{ z0, amp, k, phase } = 只涂色的地界（同 BundZ 的写法）。
 * strips：这一带东西切成长条地时每条的宽度范围（米）。
 */
const FB = (z0, amp, k, phase) => Object.freeze({ z0, amp, k, phase });
export const L0105_FIELD_BANDS = Object.freeze([
  Object.freeze({ south: FB(-80, 0, 0, 0), north: Object.freeze({ bund: "F1" }), strips: Object.freeze([20, 45]) }),
  Object.freeze({ south: Object.freeze({ bund: "F1" }), north: Object.freeze({ bund: "F2" }), strips: Object.freeze([22, 50]) }),
  Object.freeze({ south: Object.freeze({ bund: "F2" }), north: Object.freeze({ bund: "F3" }), strips: Object.freeze([25, 55]) }),
  Object.freeze({ south: Object.freeze({ bund: "F3" }), north: Object.freeze({ scarp: true }), strips: Object.freeze([25, 60]) }),
  Object.freeze({ south: Object.freeze({ scarp: true }), north: FB(-248, 3, 0.021, 0.8), strips: Object.freeze([25, 60]) }),
  Object.freeze({ south: FB(-248, 3, 0.021, 0.8), north: FB(-286, 2.5, 0.018, 2.2), strips: Object.freeze([20, 50]) }),
  Object.freeze({ south: FB(-286, 2.5, 0.018, 2.2), north: FB(-330, 3, 0.02, 1.1), strips: Object.freeze([25, 55]) }),
  Object.freeze({ south: FB(-330, 3, 0.02, 1.1), north: FB(-378, 3, 0.017, 0.2), strips: Object.freeze([25, 60]) }),
  Object.freeze({ south: FB(-378, 3, 0.017, 0.2), north: FB(-428, 3.5, 0.015, 2.6), strips: Object.freeze([30, 60]) }),
  Object.freeze({ south: FB(-428, 3.5, 0.015, 2.6), north: FB(-482, 0, 0, 0), strips: Object.freeze([30, 60]) }),
]);

/** 村子：三排院子（每排南沿 zS → 北沿 zN），两条街夹在中间，x 在 [minX, maxX]，胡同 [laneX0, laneX1] 南北穿过。 */
export const L0105_VILLAGE = Object.freeze({
  minX: -48, maxX: 116, laneX0: -8, laneX1: -2,
  rows: Object.freeze([Object.freeze({ zS: -298, zN: -314 }), Object.freeze({ zS: -322, zN: -338 }), Object.freeze({ zS: -346, zN: -362 })]),
  streets: Object.freeze([-318, -342]), streetHalfW: 3.5,
  yardWidths: Object.freeze([18, 16, 21, 17, 19, 15, 20, 22, 16, 18, 20, 17]),
  yardGapM: 1.5,
  yardWallH: 2.0, yardWallT: 0.5, gateW: 3.0,
  houseWallH: 3.0, roofOverhangM: 0.8,
  // 屋顶块上再压一条窄一点的屋脊块（顺东西，深 0.45 倍、高 ridgeH），远看一排排房子的轮廓才有起伏
  ridgeH: 0.6, ridgeDepthK: 0.45, roofColor: "#3e3a35",
  big: Object.freeze({ row: 1, index: 3, yardWallH: 2.6, houseWallH: 4.0 }),   // 大户：院墙高一点、正房 4 m
  // 大户院子东南角一座炮楼（鲁南村子常见的看家楼，创作）：4×4 m、墙高 8.5 m + 顶 1.2 m，全村最高的那一块
  tower: Object.freeze({ x: 30.5, z: -325.5, w: 4, d: 4, wallH: 8.5, roofT: 1.2 }),
  // 场院：村南西头一片、东头一片（麦秸垛堆在这里）
  threshing: Object.freeze([Object.freeze({ minX: -46, maxX: -18, minZ: -294, maxZ: -280 }), Object.freeze({ minX: 84, maxX: 108, minZ: -294, maxZ: -282 })]),
  haystacks: Object.freeze([[-38, -287], [-27, -289.5], [95, -288]].map(([x, z]) => Object.freeze({ x, z }))),
  // 村边与院外的大树（槐、榆，13–17 m），[x, z, 高]
  trees: Object.freeze([[-54, -300, 15], [-56, -330, 16.5], [-52, -358, 14], [122, -305, 15.5], [124, -340, 14], [121, -366, 16],
    [20, -370, 15], [70, -371, 16.5], [-25, -369, 14.5], [-12, -293, 13], [52, -294.5, 14.5]].map(([x, z, h]) => Object.freeze({ x, z, h }))),
});

/** 田边、沟边零星几棵树 [x, z, 高]（避开扫清带和 03 日军跃进的地方）。 */
export const L0105_FIELD_TREES = Object.freeze([[-88, -152, 11], [-96, -238, 12.5], [96, -176, 10.5], [122, -128, 12], [64, -258, 11.5], [-76, -276, 12],
  [176, -332, 13], [-100, -402, 12], [150, -410, 13.5]].map(([x, z, h]) => Object.freeze({ x, z, h })));

/** 大路北段两边的杨树：离路中心 lat 米、spacing 米一棵（± jitterM），树高 hMin…hMax；从北段起点往北 fromM 米起（扫清带以外，守军清过射界）种到 toM 米（村口）。 */
export const L0105_ROAD_TREES = Object.freeze({ lat: 4.4, spacing: 10, jitterM: 1.6, hMin: 11, hMax: 15, fromM: 48, toM: 268 });

/** 村子的户：每户 { id, row, x0, x1, zS, zN, gateX, big, yardWallH, houses: [{ x, z, w, d, wallH, roofT }] }。确定性（不读随机数）。 */
export const L0105_VILLAGE_HOMES = (() => {
  const V = L0105_VILLAGE, out = [];
  let n = 0;
  V.rows.forEach((row, r) => {
    let x = V.minX + (r % 2 ? 3 : 0);
    let k = r * 5;
    for (;;) {
      const w = V.yardWidths[k % V.yardWidths.length]; k += 1;
      if (x < V.laneX1 && x + w > V.laneX0) { x = V.laneX1; continue; }   // 让出胡同
      if (x + w > V.maxX) break;
      const big = r === V.big.row && out.filter((h) => h.row === r).length === V.big.index;
      const x0 = x, x1 = x + w, zS = row.zS, zN = row.zN;
      const houses = [];
      // 正房：坐北朝南，贴着北墙
      houses.push({ x: (x0 + x1) / 2, z: zN + 0.5 + 3, w: w - 2, d: 6, wallH: big ? V.big.houseWallH : V.houseWallH + ((n * 5) % 4) * 0.2, roofT: big ? 1.5 : 1.2 + ((n * 7) % 3) * 0.1 });
      // 厢房：东或西（按户号交替），有的两边都有
      const side = n % 2 ? 1 : -1;
      houses.push({ x: side < 0 ? x0 + 0.5 + 2.4 : x1 - 0.5 - 2.4, z: zN + 7.5 + 3, w: 4.8, d: 6, wallH: V.houseWallH, roofT: 1.1 });
      if (n % 3 === 0 && w >= 18) houses.push({ x: side < 0 ? x1 - 0.5 - 2.2 : x0 + 0.5 + 2.2, z: zN + 7.5 + 2.75, w: 4.4, d: 5.5, wallH: V.houseWallH, roofT: 1.0 });
      const gateX = side < 0 ? x1 - 3.5 : x0 + 3.5;   // 门开在南墙，厢房对面那头
      out.push(Object.freeze({ id: "Home" + String(n + 1).padStart(2, "0"), row: r, x0, x1, zS, zN, gateX, big,
        yardWallH: big ? V.big.yardWallH : V.yardWallH, houses: Object.freeze(houses.map((h) => Object.freeze(h))) }));
      n += 1;
      x = x1 + V.yardGapM;
    }
  });
  return Object.freeze(out);
})();

/**
 * 03 正面跃进的步兵（IjaRush1–8，两人一组）每一拍落在哪：[03-2, 03-3 开场, 03-3 第一次跃进后, 03-3 第二次跃进后 = 03-4, 03-5]。
 * 每一项是掩体描述（扑倒 / 趴着都落在掩体后，掩体在他和坑之间）或 { open: [x, z] }（03-5 还在往前跑、站着）：
 *   { bund: "N2", x }        田埂北边 backBundM 处（田埂在他和坑之间）
 *   { grave: [x, z], lat }   坟包往远离坑的方向 backGraveM、横向 lat（面朝坑的右手为正）
 *   { ditch: x }             干水沟北沿外 ditchSideM 处（沟沿那条翻土 + 沟在他和坑之间）
 * IjaRush4 在 03-3 第一次跃进时中弹倒下，第二格写的是顶上来的 IjaRushR1 扑倒的地方（03-4 起 IjaRush4 就是他）。
 */
export const L0105_RUSH_COVER = Object.freeze({ backBundM: 1.3, backGraveM: 1.9, ditchSideM: 3.0, target: P(0, -8) });
export const L0105_RUSH_STATIONS = Object.freeze({
  IjaRush1: [{ bund: "F1", x: -48 }, { ditch: -48 }, { bund: "N2", x: -36 }, { grave: [-20, -55], lat: 0.75 }, { bund: "N1", x: -20 }],
  IjaRush2: [{ bund: "F1", x: -43 }, { ditch: -43 }, { bund: "N2", x: -31 }, { grave: [-20, -55], lat: -0.75 }, { bund: "N1", x: -15 }],
  IjaRush3: [{ bund: "F2", x: -14 }, { ditch: -20 }, { bund: "N2", x: -14 }, { bund: "N1", x: -6 }, { open: [-6, -30] }],
  IjaRush4: [{ bund: "F2", x: -6 }, { ditch: -10 }, { bund: "N2", x: -9 }, { bund: "N2", x: -9 }, { open: [-1, -33] }],
  IjaRush5: [{ bund: "F2", x: 26 }, { ditch: 22 }, { bund: "F1", x: 18 }, { bund: "N2", x: 16 }, { bund: "N1", x: 10 }],
  IjaRush6: [{ bund: "F2", x: 30 }, { ditch: 26 }, { bund: "F1", x: 22 }, { bund: "N2", x: 20 }, { bund: "N1", x: 14 }],
  IjaRush7: [{ ditch: 50 }, { bund: "F1", x: 34 }, { grave: [45, -65], lat: 0.75 }, { bund: "N1", x: 30 }, { open: [26, -28] }],
  IjaRush8: [{ ditch: 54 }, { bund: "F1", x: 38 }, { grave: [45, -65], lat: -0.75 }, { bund: "N1", x: 34 }, { open: [30, -30] }],
});
/** 顶替 IjaRush4 的那个人：从 F1 田埂后起身，扑到 N2 田埂后（= IjaRush4 的第四格）。 */
export const L0105_RUSH_REPLACEMENT = Object.freeze({ from: Object.freeze({ bund: "F1", x: -2 }), to: Object.freeze({ bund: "N2", x: -9 }) });
/** 03-3 从干水沟里摸过来的三个人（左边沟里头有人！）：沟里弯着腰走到尽头，露头后扑到 N1 田埂后。 */
export const L0105_DITCH_FLANK = Object.freeze({ ids: Object.freeze(["IjaFlank1", "IjaFlank2", "IjaFlank3"]), proneAt: Object.freeze([-40, -44, -36]) });

/** 干水沟中心线在 x 处的 z（这条沟自东北往西南，x 单调）。 */
export function DitchZAt(x) {
  const line = L0105_PIT_NORTH.ditch.line;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    if ((x <= a.x && x >= b.x) || (x >= a.x && x <= b.x)) return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x);
  }
  return x > line[0].x ? line[0].z : line[line.length - 1].z;
}

/** 跃进站位描述 → { x, z, cover }（cover：掩体名；open 为 null）。 */
export function RushStation(desc) {
  const C = L0105_RUSH_COVER;
  if (desc.open) return { x: desc.open[0], z: desc.open[1], cover: null };
  if (desc.bund) {
    const b = L0105_PIT_NORTH.bunds.find((q) => q.id === desc.bund);
    return { x: desc.x, z: Math.round((BundZ(b, desc.x) - C.backBundM) * 100) / 100, cover: `田埂 ${desc.bund}` };
  }
  if (desc.grave) {
    const [gx, gz] = desc.grave;
    const dx = C.target.x - gx, dz = C.target.z - gz, len = Math.hypot(dx, dz), fx = dx / len, fz = dz / len;
    // 面朝坑：前方 (fx, fz)，右手 (−fz, fx)
    const x = gx - fx * C.backGraveM - fz * (desc.lat || 0), z = gz - fz * C.backGraveM + fx * (desc.lat || 0);
    return { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, cover: `坟 (${gx},${gz})` };
  }
  if (desc.ditch !== undefined) {
    // 沟的走向在这一段的法向：取北边（−z）那一侧
    const x0 = desc.ditch, z0 = DitchZAt(x0), z1 = DitchZAt(x0 + 0.5);
    let nx = -(z1 - z0), nz = 0.5; const len = Math.hypot(nx, nz); nx /= len; nz /= len;
    if (nz > 0) { nx = -nx; nz = -nz; }
    return { x: Math.round((x0 + nx * C.ditchSideM) * 100) / 100, z: Math.round((z0 + nz * C.ditchSideM) * 100) / 100, cover: "干水沟北沿" };
  }
  throw new Error(`跃进站位写错了：${JSON.stringify(desc)}`);
}

/** 田埂中心线在 x 处的 z。 */
export function BundZ(bund, x) { return bund.z0 + bund.amp * Math.sin(bund.k * x + bund.phase); }
/** 地坎中心线在 x 处的 z。 */
export function ScarpZ(x) { const s = L0105_PIT_NORTH.scarp; return s.z0 + s.amp * Math.sin(s.k * (x - s.x0)); }

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
