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
//   前沿沟（2026-10-24 第六版改成三段，见 L0105_TRENCHES.front 的注释）；原来一整条约 200 m 的规整锯齿不再用
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
//   03 轻机枪在坑北约 100–150 m；掷弹筒约 200 m    → 轻机枪 (−30,−118) 与 (40,−140)；掷弹筒组 2026-10-24 起蹲在旧交通沟里 (28,−216)
//   （2026-10-20 坑北前景改稿：轻机枪 1 在坟地 G2 东肩后 (−26.85,−116.84)、轻机枪 2 在麦秸垛 (40,−138) 西南角；土坎换成横贯全场的地坎，
//    北低南高 2 m；田埂、坟、干水沟见 L0105_PIT_NORTH，边界北扩到 −480；
//    10-20 第三版：压平、南北向窄条田 L0105_FARM、散坟 L0105_FIELD_GRAVES，村子与东边低山挪到场景文件的远景层 L0105_BACKDROP_*）
//   02 拖单被（洞口 0 → 弹药箱垛 22 → 支沟口 41 → 拐角 2 62 → 路口 92 → 坡顶 107 → 干沟 125 m）与上面的折线一致
//
// 2026-10-24 第六版空间（用户看了 01–05 俯视图嫌「简陋不合理」→ 查史料、画规划图、用户点头「都行……再改白盒」）：
//   · 前沿改三段（各班一段、错开、断开，中间用浅沟勾着；每段不规则，一折 6–9 m、前后错 1.5–3 m，各有几个往外凸的射击位）；
//   · 第二条交通沟从西段往后斜着通坡后（西邻班的退路）；主交通沟一个点不改，只沿沟加让担架的龛；
//   · 北边原来固守的阵地（沿地坎南沿，东边鬼子一迂回就放弃了）：三段不规则短射击沟、三个空机枪掩体、一个顶塌了半边的掩蔽部、
//     沟边没收的尸体 / 丢下的弹药箱 / 破枪、往南的旧交通沟、往北通警戒阵地的旧交通沟（穿地坎），再往前两段警戒沟 + 几个散兵坑；
//     03 的掷弹筒组蹲在那条旧交通沟里（坎下那一截）；
//   · 点位：每段沟后壁小弹药龛 + 隔开的手榴弹龛、机枪坑边弹药箱、排长掩蔽部兼通信所、坡后预备队、连弹药所、干沟里连指挥所 / 绷带所的地标；
//   · 干水沟改成北沙河的小支沟：顶宽 8–10 m、沟底 5–6 m 沙底、深 1.3–1.5 m、两岸不齐；
//   · 田改拼块（一片 50–110 m、各片方向差 ±14°、约五分之一整块不分条、每条 10–32 m 宽），林（家族坟地）、散坟、零星树、老驿道（有头有尾）、几条田间小路；
//   · 日军车辆改成九四式轻装甲车（3.36 × 1.62 × 1.63 m、2 人、1 挺机枪、没有炮、越壕约 1.4 m），三辆一组从东边麦田斜插过来，场地东界扩到 x 320。
//   依据（已查）：《新步兵操典草案》1934 第 358 / 213 / 299 条（连阵地分若干支点、纵横疏散；班掩体先各挖各的、有时间才连起来；排要构设数处射击位置）；
//   《步兵工作教范摘要》1936 p.46（弹药务用小者分散配置，手榴弹置场与弹药置场隔离；通信所在指挥官掩蔽部里或旁边）；
//   美军 1944 FM 5-15（壕沟 irregular in plan、built in short sections）；滕县阵地分前哨、主阵地两层，日军从东边绕过高地阵地、前沿放弃了北边几道工事；
//   九四式轻装甲车两个中队 34 辆，从不单车行动、故障多，装甲车在最前头、步兵徒步跟。具体坐标、段数、谁在哪是创作。
// ===========================================================================

export const L0105_LEVEL_KEY = "FirstLevel0105";
export const L0105_TITLE = "第一关 01–05 · 撤退（新剧本白盒）";

/**
 * 场地范围与高度网格。0.5 m 一格：3.4 m 沟底 + 2 m 深的沟壁在 1 m 格上会被磨成斜坡。
 * 2026-10-20：北边界 −235 → −480（坑北前景要放下 z −400…−470 的村子与杨树带，L0105_PIT_NORTH）。
 * 2026-10-24：东边界 190 → 320（03-4 三辆轻装甲车从东边麦田 x 260–300 冒出来、05 从那边斜插过来；赵家林 (230,−380) 也进了场地）。
 */
export const L0105_BOUNDS = Object.freeze({ minX: -110, maxX: 320, minZ: -480, maxZ: 200 });
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

/**
 * 壕沟断面（沟底宽、深）。沟底 ≥ 3.4 m 是 Script_SquadMarchAi.CanPause 的下限（史料约 0.6 m，见 docs/Data_TrenchSpline.md）。
 * 2026-10-24：frontLink 是三段前沿之间的浅连沟（深 0.9–1.1 m、窄；东边那条 03 清沟的要走，别窄过 AI 能走的宽度）；
 * old* 是北边放弃的旧阵地（射击沟 1.5 m 深、交通沟浅 0.9 m、有几截塌了；警戒沟 1.2 m）。
 */
export const L0105_TRENCH_SECTION = Object.freeze({
  front: Object.freeze({ floorW: 3.4, depth: 1.9 }),
  frontLink: Object.freeze({ floorW: 2.4, depth: 1.0 }),
  frontBay: Object.freeze({ floorW: 1.6, depth: 1.9 }),    // 往外凸的射击位（短短一截）
  traffic: Object.freeze({ floorW: 3.4, depth: 2.0 }),
  traffic2: Object.freeze({ floorW: 3.4, depth: 2.0 }),    // 第二条交通沟（西邻班的退路）
  trafficAtCrossing: Object.freeze({ floorW: 3.4, depth: 2.3 }), // 板桥底下加深 0.3 m：桥下横木底离沟底约 1.9 m
  trafficAtCrest: Object.freeze({ floorW: 3.4, depth: 1.5 }),
  branch: Object.freeze({ floorW: 3.4, depth: 2.4 }),   // 支沟比交通沟低，支沟口有台阶
  crawlSap: Object.freeze({ floorW: 1.4, depth: 1.0 }), // 坑到散兵坑的爬沟（只有玩家走）
  oldFire: Object.freeze({ floorW: 2.0, depth: 1.5 }),
  oldComm: Object.freeze({ floorW: 1.6, depth: 0.9 }),
  oldOutpost: Object.freeze({ floorW: 1.8, depth: 1.2 }),
});

/** 支沟南沿那道土垄（弃土只堆南沿）。迂回组贴着它外侧爬，北沿的机枪看不见。 */
export const L0105_BRANCH_SOUTH_BERM = Object.freeze({ h: 1.0, w: 2.6 });

const P = (x, z) => Object.freeze({ x, z });
const Line = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));
const R2 = (v) => Math.round(v * 100) / 100;

/**
 * 不规则的短射击沟（教范：班掩体先各挖各的、有时间才连起来；FM 5-15：平面不规则、分短段）：
 * 从 x0 到 x1，一折 6–9 m、前后错 1.5–3 m，中心 z = baseZ(x) + 错动。seed 决定折距与错动的序列（确定性，不读随机数）。
 * 相邻折距不全相等（SceneTest 查）。
 */
export function IrregularTrench(x0, x1, baseZ, seed) {
  const pts = [];
  let x = x0, i = 0;
  while (x < x1 - 2) {
    pts.push([R2(x), R2(baseZ(x) + (i % 2 ? 1 : -1) * (1.5 + ((seed * 7 + i * 13) % 10) / 7))]);
    x += 6 + ((seed * 3 + i * 5) % 4);
    i++;
  }
  pts.push([R2(x1), R2(baseZ(x1) + (i % 2 ? 1 : -1) * 1.8)]);
  return Line(...pts);
}

/**
 * 前沿（2026-10-24 第六版）：三段、各班一段、错开、断开，段与段之间用浅沟勾着：
 *   西段（西邻班）x −70…−28，整体往南错约 8 m，西头直角往北折护左翼；
 *   中段（本班）x −18…30，沟口 (0,0)、机枪坑 (0,−7)、三个射位、散兵坑 (−9,−15)、爬沟都不动，沟口那 10 m 是平的；
 *   东段（东邻班，01 之前已丢）x 44…98，整体往北错约 9 m。
 * front 是三段 + 两条浅连沟串成的一条连续折线（西 → 东），排路线、FrontAtX、摆件弧长、ways.trenches 都用它；
 * frontParts 给场景生成器按段烘（深浅不同）：下标是 front 里的点位区间 [i0, i1]。
 * frontBays：往外凸的射击位（从沟上某一点往北伸 2.2 m 的短沟）。
 * traffic：主交通沟，一个点不改（0610 也 import 它）。traffic2：第二条交通沟，从西段往后斜着通坡后（西邻班的退路，01–05 的戏不走它）。
 * branch：支沟口往东笔直到防炮洞口。
 */
const FRONT_WEST = IrregularTrench(-70, -28, () => 8, 5);
const FRONT_EAST = IrregularTrench(44, 98, () => -9, 7);
const FRONT_MID = Line([-18, 2.4], [-12, -0.8], [-5, 0], [5, 0], [12, -2.2], [19, 1.0], [26, -1.6], [30, 0.6]);
const FRONT_FLANK = Line([-70, -6], [-70, FRONT_WEST[0].z]);
const FRONT_LINK_W = Line([FRONT_WEST[FRONT_WEST.length - 1].x, FRONT_WEST[FRONT_WEST.length - 1].z], [-23, 5.2], [FRONT_MID[0].x, FRONT_MID[0].z]);
const FRONT_LINK_E = Line([FRONT_MID[FRONT_MID.length - 1].x, FRONT_MID[FRONT_MID.length - 1].z], [37, -4.2], [FRONT_EAST[0].x, FRONT_EAST[0].z]);
const FRONT_CHAIN = (() => {
  const pts = [];
  const Push = (p) => { const last = pts[pts.length - 1]; if (!last || last[0] !== p.x || last[1] !== p.z) pts.push([p.x, p.z]); };
  for (const line of [FRONT_FLANK, FRONT_WEST, FRONT_LINK_W, FRONT_MID, FRONT_LINK_E, FRONT_EAST]) for (const p of line) Push(p);
  return Line(...pts);
})();
const FrontIndex = (p) => FRONT_CHAIN.findIndex((q) => q.x === p.x && q.z === p.z);
export const L0105_TRENCHES = Object.freeze({
  front: FRONT_CHAIN,
  traffic: Line([0, 0], [0.5, 11], [13, 21], [12, 44], [30, 86], [35, 116], [35, 131], [35, 144]),
  traffic2: Line([-45, 9.6], [-50, 36], [-44, 62], [-56, 90], [-48, 118], [-40, 148]),
  branch: Line([21.9, 67.1], [63, 64.5]),
  crawlSap: Line([-3.5, -9], [-8, -14]),
});
/** 前沿折线的各段（front 的点位区间），场景生成器按段烘。 */
export const L0105_FRONT_PARTS = Object.freeze({
  flank: Object.freeze([0, 1]),
  west: Object.freeze([FrontIndex(FRONT_WEST[0]), FrontIndex(FRONT_WEST[FRONT_WEST.length - 1])]),
  linkW: Object.freeze([FrontIndex(FRONT_WEST[FRONT_WEST.length - 1]), FrontIndex(FRONT_MID[0])]),
  mid: Object.freeze([FrontIndex(FRONT_MID[0]), FrontIndex(FRONT_MID[FRONT_MID.length - 1])]),
  linkE: Object.freeze([FrontIndex(FRONT_MID[FRONT_MID.length - 1]), FrontIndex(FRONT_EAST[0])]),
  east: Object.freeze([FrontIndex(FRONT_EAST[0]), FRONT_CHAIN.length - 1]),
});
/** 往外凸的射击位：从前沿上 x 处往北伸 lenM。每段两三个。 */
export const L0105_FRONT_BAYS = Object.freeze([
  { id: "BayW1", x: -62, lenM: 2.2 }, { id: "BayW2", x: -48, lenM: 2.2 }, { id: "BayW3", x: -36, lenM: 2.0 },
  { id: "BayM1", x: -14, lenM: 2.2 }, { id: "BayM2", x: 16, lenM: 2.2 }, { id: "BayM3", x: 27, lenM: 2.0 },
  { id: "BayE1", x: 52, lenM: 2.2 }, { id: "BayE2", x: 68, lenM: 2.0 }, { id: "BayE3", x: 86, lenM: 2.2 },
].map((b) => Object.freeze(b)));

/** 前沿沟哪一段已经丢了（按拍）：x ≥ lostFromX 的那段在鬼子手里。01–02 丢的是东段（x ≥ 44）；03 清到本班这段东头。 */
export const L0105_FRONT_LOST_FROM_X = Object.freeze({ "01": 44, "02": 44, "03": 13, "04": -5, "05": -5 });

/** 前沿折线上 x 处的弧长（折线自西向东 x 单调，西头北折那截除外）。 */
export function FrontStationAtX(x) {
  const line = FRONT_CHAIN;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (b.x !== a.x && (x - a.x) * (x - b.x) <= 0) return walked + len * (x - a.x) / (b.x - a.x);
    walked += len;
  }
  return walked;
}

/** 路：车道，从东北斜下来，经过防炮洞东边约 15 m，在坡顶前横穿交通沟（路口，板桥），再往西南翻过坡去。05 的 A 车走它。一个点不动。 */
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
  pitAmmo: Object.freeze({ name: "机枪坑的弹药箱", x: 2.6, z: -5.2 }),           // 坑里东南角，两个弹药箱（2026-10-24）
  corner1: Object.freeze({ name: "拐角 1", x: 0.5, z: 11 }),
  bend: Object.freeze({ name: "斜折", x: 13, z: 21 }),
  southLegEnd: Object.freeze({ name: "南直段尽头", x: 12, z: 44 }),
  // 排长掩蔽部兼通信所（2026-10-24）：主交通沟斜折下面那段东壁上挖进去的一间 4×3.6 m，顶上横木 + 覆土，从沟里直接进；
  // 《步兵工作教范摘要》：通信所在指挥官掩蔽部里或旁边。不挡 01–04 的路线（人都在沟心走）
  platoonShelter: Object.freeze({ name: "排长掩蔽部 / 通信所", x: 17.0, z: 28, w: 4.0, d: 3.6, floorDepth: 2.0 }),
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
  companyPost: Object.freeze({ name: "连指挥所 / 绷带所（干沟）", x: 64, z: 148.5 }),   // 只是地标，干沟里人多不加体块（2026-10-24）
  // 坡后预备队（2026-10-24）：第二条交通沟南头东边，几个浅坑 + 土袋
  reserve: Object.freeze({ name: "预备队（坡后）", x: -32, z: 144, pits: Object.freeze([P(-33, 138.5), P(-28, 143.5), P(-34, 151)]), pitR: 1.3, pitDepth: 0.7 }),   // 第二条交通沟南头 (−40,148) 东边几米
  // 连弹药所（2026-10-24）：坡后、挨路口，坡顶 z 131 以南；《步兵工作教范摘要》弹药务用小者分散配置
  companyAmmo: Object.freeze({ name: "连弹药所（坡后、路口边）", x: 50, z: 136 }),
  // 防炮洞：支沟尽头，洞口朝西（对着支沟），洞里 7×5 m、地面比自然地面低 2.6 m，顶上横木 + 覆土
  dugoutMouth: Object.freeze({ name: "防炮洞口", x: 63, z: 64.5, yawDeg: 90 }),
  dugout: Object.freeze({ name: "防炮洞", x: 66.5, z: 64.5, w: 7, d: 5, floorDepth: 2.6 }),
  // 01–02 日军机枪：架在支沟北沿上、靠洞口这头，顺着笔直的支沟往西压住支沟口
  enemyBranchGun: Object.freeze({ name: "日军机枪（支沟沿）", x: 56, z: 61.6, yawDeg: 90 }),
  interrogation: Object.freeze({ name: "审问处", x: 57.5, z: 65.3 }),
  roadsideNearDugout: Object.freeze({ name: "洞旁路边", x: 84, z: 70 }),
  // 坡顶别的班守着的坡沿（交通沟东边，趴着朝北）
  crestPosts: Object.freeze([P(42, 129.5), P(50, 129), P(58, 129.5), P(66, 130)]),
  // 03：远处的日军（2026-10-20 坑北前景：轻机枪 1 架在坟地一座坟的东肩后、轻机枪 2 趴在麦秸垛西南角；见 L0105_PIT_NORTH）
  enemyLmgWest: Object.freeze({ name: "轻机枪（坟地）", x: -26.85, z: -116.84, yawDeg: 180, cover: "坟包 G2 (−28,−115.5) 的东肩" }),
  enemyLmgEast: Object.freeze({ name: "轻机枪（麦秸垛）", x: 37.2, z: -137.4, yawDeg: 180, cover: "麦秸垛 (40,−138) 西南角" }),
  mortarBank: Object.freeze({ name: "地坎", x: 28, z: -206, w: 300, d: 2 }),   // 东西横贯全场的梯田地坎（北低南高 2 m），见 L0105_PIT_NORTH.scarp
  // 掷弹筒组（2026-10-24）：蹲在旧阵地通警戒阵地的旧交通沟里，坎下那一截（L0105_OLD_POSITION.sap 的一个折点），坑里看不见人；
  // 发射的烟从沟东边冒上来（mortarSmoke 在沟外的地面上，不在沟底，坑里才看得见）
  mortar: Object.freeze({ name: "掷弹筒", x: 28, z: -216, yawDeg: 180 }),
  mortarSmoke: Object.freeze({ name: "掷弹筒的烟", x: 25, z: -212 }),
  // 03-4：三辆九四式轻装甲车从东边麦田冒出来（x 260–300、z −200…−100，朝西南），机枪扫坑沿
  tankFirstSeen: Object.freeze({ name: "轻装甲车露头（东边麦田）", x: 275, z: -150, yawDeg: 135 }),
  // 05：A 车刚过桥、车尾挨了那捆手榴弹，瘫在桥头（西南头），车身斜着把路堵死
  tankStop: Object.freeze({ name: "A 车瘫在桥头", x: 28.7, z: 120.1, yawDeg: 148 }),
});

/**
 * 三辆九四式轻装甲车（2026-10-24）：史料：3.36 × 1.62 × 1.63 m、3.45 t、2 人、1 挺机枪、没有炮、底板 4 mm、越壕约 1.4 m；两个中队 34 辆，
 * 从不单车行动，故障多；装甲车在最前头，步兵徒步跟。卡车只拉辎重，不上战场。
 * 03-4 / 03-5 在东边麦田里（seen / advance），04-3 起斜插过来：A 拐上车道压上板桥（在 05-3 瘫在 tankStop）；
 * B 冲到交通沟东边沟沿过不去（越壕只有一米多），停在沟沿上打机枪（打坡顶方向，别打到桥下的人）；C 半路抛锚，两个乘员钻出来拿车上的机枪就地打；
 * 徒步的鬼子步兵在后头两三百米，还没跟上。谁在哪、几辆是创作（一组 3 辆）。
 */
export const L0105_TANKETTES = Object.freeze({
  shape: "tankette",
  ids: Object.freeze(["TankA", "TankB", "TankC"]),
  seen: Object.freeze({ TankA: P(262, -178), TankB: P(292, -150), TankC: P(276, -118) }),         // 03-4 冒出来
  advance: Object.freeze({ TankA: P(252, -167), TankB: P(281, -139), TankC: P(265, -107) }),      // 03-5 又往前一段
  field043: Object.freeze({ TankB: P(135, 12), TankC: P(192, 0) }),                                // 04-3：A 已拐上车道，B / C 还在田里
  field051: Object.freeze({ TankB: P(85, 72) }),                                                   // 05-1：B 快到沟沿；C 这时抛锚
  bStop: Object.freeze({ x: 39.5, z: 98.5, yawDeg: 135 }),
  bRoute: Object.freeze([P(110, 52), P(85, 72), P(60, 88)]),                                       // 04-3 → 05-2 的来路（车道北边的田里）
  cStall: Object.freeze({ x: 150, z: 42, yawDeg: 135 }),
  cCrew: Object.freeze({ gunner: Object.freeze({ x: 147.2, z: 44.2 }), loader: Object.freeze({ x: 148.4, z: 46.0 }) }), // 车西南边趴着
  infantry: Object.freeze([P(300, -128), P(306, -121), P(296, -114)]),                             // 徒步步兵，两三百米后头（05 期间慢慢走）
  infantryEnd: Object.freeze([P(262, -92), P(268, -86), P(258, -79)]),
  bArcTarget: P(54, 129.5),                                                                        // B 的机枪打坡顶那一带
});

/**
 * 坑北前景（2026-10-20，用户在 03 坑沿朝北看：「日军这么一马平川合理吗」→ 拍板的「坑北前景」改稿）。
 * 没有史料出处，是创作：鲁南农田三月的常见样子（麦苗才返青、田埂、孤坟、坟地柏树、麦秸垛、干水沟、梯田地坎、远处村子）；2026-10-21 起树不沿路种，田里零星几棵。
 * 场景生成器把田埂、坟包、干水沟、地坎、大起伏烘进高度场，树桩 / 柏树 / 麦秸垛 / 零星的树出体块；
 * 关键帧与预演按这里摆 03 的日军（跃进的人扑在田埂 / 坟 / 沟沿后，或趴在两道田埂之间的麦地里；见 L0105_RUSH_STATIONS）。
 * 田埂中心线 z = z0 + amp·sin(k·x + phase)，x 在 [minX, maxX]；坟 [x, z, 高]；树 [x, z, 高]；房 [x, z, 东西宽, 南北深]。
 */
const DITCH_LINE_RAW = Object.freeze([[236, -281], [190, -245], [130, -200], [70, -165], [10, -125], [-40, -92], [-70, -72]]);
/** 干水沟东北头（2026-10-24 场地东扩后）比原来多出来的那一截长度：沟里那个班的弧长都是从原来的头 (190,−245) 量的，加上它。 */
const DITCH_HEAD_EXT_M = Math.hypot(DITCH_LINE_RAW[1][0] - DITCH_LINE_RAW[0][0], DITCH_LINE_RAW[1][1] - DITCH_LINE_RAW[0][1]);
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
    Object.freeze({ id: "F1", z0: -110, amp: 3.5, k: 0.022, phase: 0.3, minX: -110, maxX: 320 }), // 80–200 m 三道横贯
    Object.freeze({ id: "F2", z0: -150, amp: 3.0, k: 0.019, phase: 1.7, minX: -110, maxX: 320 }),
    Object.freeze({ id: "F3", z0: -190, amp: 3.5, k: 0.017, phase: 2.9, minX: -110, maxX: 320 }),
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
  // 6. 干沙沟（2026-10-24 改成北沙河的小支沟样子）：东北斜到坑西北，从坟地（北）和麦秸垛（南）之间穿过；
  //    沟底宽 5.2（沙底，涂沙色）、顶宽 8.6、深 1.4（自然地面往下），两岸不齐（两边的顶宽按弧长各自 ±bankWobble 起伏），
  //    两沿各翻一条 0.15 m 高、1.2 m 宽的土；西南头最后 8 m 渐浅到地面（尽头在 N2 田埂北边，离坑心约 95 m），东北头通到场地边上
  ditch: Object.freeze({
    line: Line(...DITCH_LINE_RAW),
    floorW: 5.2, topW: 8.6, depth: 1.4, lipH: 0.15, lipW: 1.2, endTaperM: 8, bankWobble: 0.22,
  }),
  // 7. 地坎：东西横贯，中心线 z = z0 + amp·sin(k·(x − x0))（x0 处正好 z0），北低南高 drop、坎面 faceM 宽（陡）；干水沟穿过处坎面放宽到 faceM + notchM（豁口）
  scarp: Object.freeze({ z0: -206, amp: 4.5, k: 0.016, x0: 28, drop: 2.0, faceM: 2.0, notchM: 18, notchR: 7 }),
  // 9. 大起伏：z < clearedToZ 起 rampM 内渐强，两条几百米波长的正弦，±1 m
  roll: Object.freeze({ rampM: 60, a1: 0.6, k1x: 0.0105, k1z: 0.0062, p1: 0.4, a2: 0.4, k2x: -0.0068, k2z: 0.0121, p2: 2.1 }),
  // （2026-10-20 第二轮曾让整片地往北抬 10 m 上下（tilt：坎下缓坡 + 村子坐在坡顶）；第三版照史料压平（华北平原、村外是开阔地）：
  //  抬高整个去掉，坑北只留上面 ±1 m 的大起伏和地坎 2 m 的落差。坎下比坑北低 2 m 那一大片由涂色盖着，高度色带不会把它染成「水」。）
});

/** 田埂中心线在 x 处的 z。 */
export function BundZ(bund, x) { return bund.z0 + bund.amp * Math.sin(bund.k * x + bund.phase); }
/** 地坎中心线在 x 处的 z。 */
export function ScarpZ(x) { const s = L0105_PIT_NORTH.scarp; return s.z0 + s.amp * Math.sin(s.k * (x - s.x0)); }

/**
 * 北边原来固守的阵地（2026-10-24，放弃了）：沿地坎南沿（高的一侧，沟心在坎线南 5–6 m，坎沿就是胸墙）三段不规则短射击沟（各 30–50 m，段间断开），
 * 三个空机枪掩体、一个顶塌了半边的掩蔽部，沟边几具没收的尸体、丢下的弹药箱、几支破枪；
 * comm：往南撤下来走的旧交通沟（浅 0.9 m，有几截塌了）；sap：往北通警戒阵地的旧交通沟（穿地坎，坎下那一截 03 的掷弹筒组蹲在里面）；
 * outposts：再往前 z −440…−460 两段更短的警戒沟 + 几个空散兵坑（一两个班的警戒阵地，早撤了）。
 * 依据：《新步兵操典草案》第 358 / 213 / 299 条（支点、纵横疏散、各挖各的有时间再连）；滕县阵地分前哨、主阵地两层，前沿放弃了北边几道工事。段数、位置是创作。
 */
const OLD_FIRE1 = IrregularTrench(-100, -58, (x) => ScarpZ(x) + 5.0, 1);
const OLD_FIRE2 = IrregularTrench(-32, 18, (x) => ScarpZ(x) + 4.8, 2);
const OLD_FIRE3 = IrregularTrench(46, 80, (x) => ScarpZ(x) + 4.5, 3);   // 东头到 x 80 为止：再往东地坎离田埂 F3 只有 9 m
export const L0105_OLD_POSITION = Object.freeze({
  fire: Object.freeze([
    Object.freeze({ id: "OldFire1", line: OLD_FIRE1 }),
    Object.freeze({ id: "OldFire2", line: OLD_FIRE2 }),
    Object.freeze({ id: "OldFire3", line: OLD_FIRE3 }),
  ]),
  comm: Line([2, R2(ScarpZ(2) + 4.8)], [5, -160], [8, -142], [7, -138]),   // 南头到干沙沟北岸外十来米为止（往南就顺沙沟走）；在 03 跃进的组 2（x −14/−7）与组 3（x 18/24）之间穿过
  commCollapsed: Object.freeze([28, 52]),   // 旧交通沟塌了的几截（沟上弧长中心，各 4 m 长变浅）
  sap: Line([46, R2(ScarpZ(46) + 4.5)], [40, -203], [36, -207], [32, -212], [28, -216], [24, -232], [14, -262], [4, -300], [-8, -345], [-18, -392], [-26, -424], [-22, -438]),
  sapCollapsed: Object.freeze([70, 150, 215]),
  sapScarpNotch: Object.freeze({ x: 36, z: -207, m: 5, r: 2.5 }),   // 旧交通沟穿地坎处的豁口（窄）
  mortarBay: Object.freeze({ r: 2.6, depth: 0.9 }),                 // 掷弹筒组蹲的那一处：沟上一个圆坑（原来的听音哨），射手 + 装填手都在平底上
  outposts: Object.freeze([
    Object.freeze({ id: "OldOutpost1", line: IrregularTrench(-48, -18, () => -440, 4) }),
    Object.freeze({ id: "OldOutpost2", line: IrregularTrench(100, 126, () => -452, 5) }),   // 东边那段避开散坟 (80,−452)
  ]),
  foxholes: Object.freeze([P(-60, -446), P(-6, -436), P(48, -458), P(136, -447), P(20, -470)]),
  foxholeR: 0.8, foxholeDepth: 0.9,
  // 空机枪掩体：射击沟上掏出来的方坑 3.0 × 2.6（跟沟一样深 1.5），北沿一排土袋
  mgNests: Object.freeze([-82, -6, 70].map((x, i) => {
    const line = [OLD_FIRE1, OLD_FIRE2, OLD_FIRE3][i];
    let z = line[0].z;
    for (let k = 1; k < line.length; k++) { const a = line[k - 1], b = line[k]; if ((x - a.x) * (x - b.x) <= 0) { z = a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x); break; } }
    return Object.freeze({ id: `OldMgNest${i + 1}`, x, z: R2(z) });
  })),
  mgNest: Object.freeze({ w: 3.0, d: 2.6, depth: 1.5 }),
  // 掩蔽部：6 × 4、地面低 1.8 m，顶上横木 + 覆土；东半边顶塌下来了（顶板落在坑底、土堆在上面）
  shelter: Object.freeze({ id: "OldShelter", x: -22, z: R2(ScarpZ(-22) + 11), w: 6, d: 4, floorDepth: 1.8 }),
  // 没收的尸体（关键帧里 03 的几帧出倒地的我方单位）、丢下的弹药箱、破枪（体块）
  bodies: Object.freeze([
    Object.freeze({ id: "OldDead1", x: -20, z: R2(ScarpZ(-20) + 3.6), yawDeg: 80 }),
    Object.freeze({ id: "OldDead2", x: 8, z: R2(ScarpZ(8) + 7.6), yawDeg: -120 }),
    Object.freeze({ id: "OldDead3", x: 60, z: R2(ScarpZ(60) + 3.8), yawDeg: 30 }),
    Object.freeze({ id: "OldDead4", x: -72, z: R2(ScarpZ(-72) + 8.0), yawDeg: 160 }),
    Object.freeze({ id: "OldDead5", x: 52, z: R2(ScarpZ(52) + 8.0), yawDeg: -60 }),
  ]),
  crates: Object.freeze([P(-90, R2(ScarpZ(-90) + 8.2)), P(-62, R2(ScarpZ(-62) + 8.0)), P(-14, R2(ScarpZ(-14) + 7.8)), P(14, R2(ScarpZ(14) + 2.4)), P(60, R2(ScarpZ(60) + 8.0)), P(74, R2(ScarpZ(74) + 2.2))]),
  rifles: Object.freeze([P(-76, R2(ScarpZ(-76) + 8.4)), P(2, R2(ScarpZ(2) + 8.0)), P(44, R2(ScarpZ(44) + 8.6)), P(-26, R2(ScarpZ(-26) + 2.8))]),
  // 旧沟的涂色（沟沿塌土 + 蒿草，跟现在的沟分得开）
  paint: "#6c6a52", paintHalfW: 2.6,
});

/**
 * 沟壁上的龛（2026-10-24）：on = 哪条沟（front 链 / traffic / traffic2），d = 沿中心线的弧长，side = 挖进哪一侧的沟壁（+1 左手、−1 右手，口径同 lat），
 * kind：ammo 弹药龛（两三个弹药箱）、grenade 手榴弹龛（跟弹药龛隔开 ≥ 3 m，《步兵工作教范摘要》）、litter 让担架的龛（主交通沟每隔约 10 m 一个，沟壁凹进去 0.6–0.8 m）。
 * 前沿链往东走，左手 = 北（敌）、右手 = 南（后壁）；交通沟往南走，左手 = 东。龛沿沟 lenM 长、挖进 acrossM。
 */
const Niche = (id, kind, on, d, side, lenM, acrossM) => Object.freeze({ id, kind, on, d, side, lenM, acrossM });
const FX = (x) => R2(FrontStationAtX(x));
export const L0105_NICHES = Object.freeze([
  // 西段：两个弹药龛 + 一个手榴弹龛（后壁）
  Niche("AmmoNiche_W1", "ammo", "front", FX(-60), -1, 1.2, 0.7), Niche("AmmoNiche_W2", "ammo", "front", FX(-40), -1, 1.2, 0.7), Niche("GrenadeNiche_W", "grenade", "front", FX(-50), -1, 0.9, 0.6),
  // 中段（本班）
  Niche("AmmoNiche_M1", "ammo", "front", FX(-10), -1, 1.2, 0.7), Niche("AmmoNiche_M2", "ammo", "front", FX(16), -1, 1.2, 0.7), Niche("GrenadeNiche_M", "grenade", "front", FX(24), -1, 0.9, 0.6),
  // 东段
  Niche("AmmoNiche_E1", "ammo", "front", FX(60), -1, 1.2, 0.7), Niche("AmmoNiche_E2", "ammo", "front", FX(86), -1, 1.2, 0.7), Niche("GrenadeNiche_E", "grenade", "front", FX(74), -1, 0.9, 0.6),
  // 主交通沟：让担架的龛，每隔约 10 m 一个，两边轮着（板桥以北；板桥往南那段 0610 接缝锁着不动）
  ...[8, 18, 29, 39, 50, 60, 70, 83, 92, 102].map((d, i) => Niche(`LitterNiche_${String(i + 1).padStart(2, "0")}`, "litter", "traffic", d, i % 2 ? 1 : -1, 1.6, 0.75)),
]);

/**
 * 坑北第三版（2026-10-20，用户查过史料后拍板第三版草图）：照史料压平、窄条田、四个村子、东边低山。
 * 史料要点（用户查证）：1938 年战报写北沙河到界河一路「途中五里一村庄」（约 2.5 km 一个）；房子都聚在村里，村外是开阔地，远看村子是一团团树；
 * 田里散着坟丘和河沟；界河一线东边有低山包（龙山、普阳山一类）；田是分家分碎的南北向窄长条，宽窄不一。
 * 村子、山包的具体位置与大小、田怎么分、坟摆在哪是创作（照上面的样子摆）。第二轮 300 m 处那个带炮楼的村子拿掉（炮楼没查到出处）。
 *
 * 场地（L0105_BOUNDS，北到 −480）里的地面、田、坟、路、树是场景文件的高度场 / 涂色 / 体块；场地外（村 A 起往北）是场景文件的远景层 backdrop
 * （§2.2：只看不走，不进碰撞、不进寻路）。场地里的田块与远景里的田块由同一套分组网格（L0105_FARM）切出来，接缝两边一条条对得上。
 *
 * 路（2026-10-24）：车道 L0105_ROAD 一个点不动（05 的 A 车走它）；北边那条大路改成有头有尾的老驿道（土路 5–6 m、没有行道树）：
 *     L0105_NORTH_ROAD 从北边界 (138,−480) 下来到 (175,−40)，再接 L0105_POST_ROAD_SOUTH 往东南 (196,40) → (230,140) → 南边界，
 *     远景层里 L0105_BACKDROP_ROAD 从北边界往北穿过村 A 通到村 D，L0105_BACKDROP_POST_ROAD 从南边界接着往东南（往耿家庄东头）。
 *     田间小路 L0105_FIELD_PATH 从坟地北边往北出场地；另几条 L0105_FIELD_LANES 只是涂色（没有高度）。
 *     路穿过地坎处地坎放缓成坡道，驿道穿过干水沟处沟填平（涵洞土）。
 */
export const L0105_NORTH_ROAD = Line([175, -40], [166, -150], [148, -262], [140, -400], [138, -480]);
export const L0105_NORTH_ROAD_HALF_W = 2.8;
export const L0105_POST_ROAD_SOUTH = Line([175, -40], [196, 40], [230, 140], [250, 200]);
export const L0105_FIELD_PATH = Line([-62, -480], [-56, -400], [-50, -320], [-46, -262], [-40, -222], [-44, -200], [-40, -165], [-33, -134]);
export const L0105_FIELD_PATH_HALF_W = 1.3;
/** 田间小路（2026-10-24，只涂色）：坎北一条东西向的、坎南一条、坡后西边一条、车道东边一条。 */
export const L0105_FIELD_LANES = Object.freeze([
  Line([-110, -335], [-40, -330], [40, -340], [110, -336], [143, -330]),
  Line([-110, -106], [-60, -108], [0, -102], [60, -106], [120, -98], [171, -104]),
  Line([-110, 60], [-80, 70], [-60, 62]),
  Line([105, 50], [140, 46], [196, 40]),
]);

/** 涂色（sRGB）。白盒灰调里拉得开，但别花：麦苗偏灰的暗绿、翻过的地深褐、撂荒地浅土黄；每种两档深浅，一条条才分得开。 */
export const L0105_FIELD_PAINT = Object.freeze({
  cleared: "#7d8360",   // 扫清带：被踩过的麦地（浅一点的绿褐）
  wheat: Object.freeze(["#566540", "#61704a"]),
  plowed: Object.freeze(["#5a4532", "#654c37"]),
  fallow: Object.freeze(["#b09a66", "#a38d5c"]),
  fieldPath: "#c4b792", // 组与组之间的田间小路（窄、浅土色）
  bund: "#6a5842",      // 田埂
  graveSoil: "#594634", // 坟地、两座孤坟（老坟）
  newSoil: "#7b6246",   // 田里散的单个坟（新土）
  ditchSoil: "#7a6143", // 干水沟两边翻出来的新土
  ditchSand: "#c9b88e", // 干沙沟的沙底（2026-10-24）
  scarpFace: "#5b4a38", // 地坎坎面
  road: "#d8cfb6",      // 车辙压实的路（比撂荒地更白更灰，远看是一条亮线）
  path: "#d0c5a6",
  yard: "#a08f72",      // 村里的夯土地
  threshing: "#c3b38c", // 场院
});

/**
 * 田的分组网格（场地与远景共用；场景生成器 FarmLayout 按它切）。2026-10-24 改成拼块：
 *   组排（南北一排排）：南北界 rowsZ（自南往北，"scarp" = 地坎中心线，"F2" = 田埂 F2 的中心线），再往北按 rowLen 一排排往北排到 region.minZ；
 *   每排东西切成片（groupW 宽，50–110 m），片与片之间、排与排之间留一条 2·pathHalfW 宽的田间小路（涂 fieldPath 色）；
 *   每片各有自己的方向（shearDeg：条地跟南北向差 ±14°，按序号抽），约 wholeFrac 的片整块不分条，其余切成 10–32 m 宽的条（stripW，宽窄不一），
 *   种什么按 crops 的比例抽（左右相邻两条不种同一样）。卜凯：小麦区一块地约 2,350 m²。
 *   片心离坑超过 polyRadiusM 的远景里一片一块、不切条、不斜（轴对齐矩形）。
 * x 方向分片从 originX 起算，场地和远景是同一条序列。确定性（按序号散列，不读随机数）。
 */
export const L0105_FARM = Object.freeze({
  originX: -3800,
  region: Object.freeze({ minX: -3300, maxX: 3800, minZ: -4200, maxZ: -80 }),
  rowsZ: Object.freeze([-80, "F2", "scarp", -318, -432]),
  rowLen: Object.freeze([90, 140]),
  groupW: Object.freeze([50, 110]),
  stripW: Object.freeze([10, 32]),
  shearDeg: 14,
  wholeFrac: 0.2,
  pathHalfW: 1.1,
  polyRadiusM: 600,
  crops: Object.freeze([["wheat", 0.36], ["plowed", 0.34], ["fallow", 0.30]]),
  cleared: Object.freeze({ minZ: -80, maxZ: -12 }),
});

/**
 * 田里散的单个坟（圆土包，烘进高度场，涂新土色）[x, z, 高]：避开 03 跃进的那一片（x −75…75、z > −215）、干水沟、路、掷弹筒组，
 * 也不在坑看轻机枪 / 掷弹筒烟的视线上。底半径同坟地（graveBaseR）。
 */
export const L0105_FIELD_GRAVES = Object.freeze([
  [-92, -96, 0.9], [-80, -142, 1.0], [-100, -180, 0.85], [92, -92, 1.1], [118, -158, 0.95], [140, -110, 1.05], [104, -172, 0.9],
  [-62, -238, 1.0], [62, -262, 1.2], [-18, -300, 0.8], [100, -318, 1.1], [-88, -352, 0.95], [12, -372, 1.0], [168, -392, 0.9],
  [-40, -428, 1.15], [80, -452, 0.85],
  // 2026-10-24 东扩的那一片
  [230, -150, 1.0], [262, -300, 0.95], [300, -60, 1.1], [212, -412, 0.9],
].map(([x, z, h]) => Object.freeze({ x, z, h })));
/** 南半场（z ≥ −8）田里零散的单坟（2026-10-24，烘进 Ground）[x, z, 高]：离路、沟 ≥ 8 m。 */
export const L0105_SOUTH_GRAVES = Object.freeze([[-30, 40, 1.0], [70, 30, 0.9], [165, 50, 1.05], [-100, 120, 0.95], [208, 124, 1.0], [250, 70, 0.9]].map(([x, z, h]) => Object.freeze({ x, z, h })));

/**
 * 家族坟地「林」（2026-10-24）：几座坟 + 三五棵柏树，有名字的几家。刘家林在坑北、张家林 / 李家林在坡前的田里、赵家林在东北角。
 * w × d 是那一片的大小；graves [dx, dz, h] 相对林心；cypresses [dx, dz, h]。坟烘进高度场，柏树出体块。
 */
const Wood = (id, name, x, z, w, d, graves, cypresses) => Object.freeze({ id, name, x, z, w, d,
  graves: Object.freeze(graves.map(([dx, dz, h]) => Object.freeze({ x: R2(x + dx), z: R2(z + dz), h }))),
  cypresses: Object.freeze(cypresses.map(([dx, dz, h]) => Object.freeze({ x: R2(x + dx), z: R2(z + dz), h }))) });
export const L0105_WOODS = Object.freeze([
  Wood("WoodLiu", "刘家林", -60, -290, 20, 14, [[-6, -3, 1.2], [-1, 2, 1.1], [4, -4, 1.3], [7, 3, 1.0], [-7, 4, 1.05], [2, 5, 0.95]], [[-8, -5, 7.5], [8, -5, 6.5], [0, -6, 8.0], [-3, 6, 6.8]]),
  Wood("WoodLi", "李家林", 128, 92, 22, 15, [[-7, -3, 1.25], [-2, 2, 1.1], [3, -4, 1.3], [8, 3, 1.0], [-7, 5, 1.05], [5, 5, 1.15], [0, -1, 0.95]], [[-9, -6, 7.0], [9, -6, 7.5], [0, -7, 8.0], [9, 6, 6.5], [-9, 6, 7.0]]),
  Wood("WoodZhang", "张家林", -96, 50, 18, 13, [[-5, -3, 1.2], [0, 1, 1.1], [5, -3, 1.3], [-4, 4, 1.0], [4, 4, 1.05]], [[-7, -5, 7.0], [7, -5, 6.5], [0, 6, 7.5]]),
  Wood("WoodZhao", "赵家林", 230, -380, 18, 12, [[-5, -2, 1.1], [0, 2, 1.2], [5, -3, 1.0], [-4, 4, 1.05], [5, 3, 0.95]], [[-7, -4, 7.0], [7, -4, 6.5], [0, 5, 7.5], [-6, 4, 6.8]]),
]);

/**
 * 田里零星的树 [x, z, 高]：一棵一棵散在田边、地头，彼此隔 25 m 以上，不沿路、不沿小路排（2026-10-21 用户：「整个场景都应该稀疏的有几颗，
 * 而不会是沿着路种树」——第二轮为了认路加的大路两侧杨树 59 棵、小路西侧 15 棵去掉了；路边行道树没查到出处）。
 * 避开扫清带、03 日军跃进的那一片（x −75…75、z −80…−215）、离大路 / 小路中心 ≥ 10 m、不在干水沟里（≥ 3 m，沟边一两棵正常）、离地坎坎面 ≥ 6 m、不长在坟包上（≥ 3 m，坟边一棵也正常）（SceneTest 查）。
 */
export const L0105_FIELD_TREES = Object.freeze([[-88, -152, 11], [-96, -238, 12.5], [96, -176, 10.5], [122, -128, 12], [64, -258, 11.5], [-76, -276, 12],
  [176, -332, 13], [-100, -402, 12], [150, -410, 13.5], [30, -300, 11], [-30, -360, 12.5], [100, -440, 11.5], [10, -455, 12], [-100, -118, 10.5],
  [112, -292, 12.5], [-95, -458, 11], [185, -172, 12], [52, -372, 10.5],
  // 2026-10-24 东扩的那一片
  [236, -240, 12], [288, -200, 11.5], [262, -452, 12.5], [300, -340, 11], [218, -96, 12]].map(([x, z, h]) => Object.freeze({ x, z, h })));
/** 南半场（z ≥ −8）零星几棵树（2026-10-24）：离车道 / 驿道 / 沟 ≥ 10 m、彼此 ≥ 25 m、不成排。 */
export const L0105_SOUTH_TREES = Object.freeze([[-100, 90, 12], [-70, 120, 11.5], [110, 10, 12.5], [160, 150, 11], [270, 20, 12], [205, 180, 11.5]].map(([x, z, h]) => Object.freeze({ x, z, h })));

/**
 * 远景层里田野上零星的树 [x, z, 高]（kind "tree"，同场地里的树）：场地外到村子之间、村子与村子之间散十几棵，不沿路、不沿小路，
 * 离村子树圈、远景的路和小路都隔开（SceneTest 查）。村子外圈那一团团树照旧（远看村子是一团团树，第三版的史料依据）。
 */
export const L0105_BACKDROP_LONE_TREES = Object.freeze([[-240, -560, 12], [60, -735, 11], [360, -640, 13], [-460, -700, 12.5], [520, -900, 11.5],
  [-180, -1050, 12], [240, -1150, 13], [700, -700, 12], [-620, -1200, 11], [900, -1300, 12.5], [-300, -1500, 13], [420, -1600, 11.5],
  [-330, -560, 11], [460, -520, 12], [380, -120, 12], [400, 120, 11.5]].map(([x, z, h]) => Object.freeze({ x, z, h })));

/** 远景层里的路：大路接着场地里那段往北穿过村 A（南北一条街），出北口往东北到村 D、再往远处去。 */
export const L0105_BACKDROP_ROAD = Line([138, -480], [136, -566], [135, -617], [133, -672], [300, -860], [620, -1200], [980, -1560], [1300, -1840],
  [1500, -2010], [1700, -2190], [2050, -2560]);
/** 远景层里老驿道往南的那一截（接场地南边界，往耿家庄东头去）。 */
export const L0105_BACKDROP_POST_ROAD = Line([250, 200], [262, 230], [290, 300], [300, 320]);
/** 远景层里的田间小路（虚的土路）：场地里的小路接着往北到村 C，半路岔去村 B；村 A 西口接过来；村 B → 村 C；村 C → 村 D。 */
export const L0105_BACKDROP_PATHS = Object.freeze([
  Line([-62, -480], [-74, -640], [-80, -900], [-70, -1300], [-62, -1890]),
  Line([-76, -760], [-400, -820], [-720, -858]),
  Line([66, -640], [-10, -700], [-76, -760]),
  Line([-850, -950], [-700, -1400], [-190, -1960]),
  Line([86, -2020], [600, -2045], [1000, -2030], [1360, -2012]),
]);

/**
 * 四个村子（远景层）：x, z 是村心，rx / rz 是房子那一片的半宽（东西 / 南北）；外面一圈树（ringM 宽）围着。
 * 村 A 离坑约 620 m，日军集结的村子，大路从南口进、北口出（村里一条南北街），树用编辑器的枯树模型（kind "tree"，同场地里的树）；
 * 村 B / C / D 在 1.2 / 2 / 2.5 km 外，树是一团团树冠块（kind "blob"），从坑里看是天边几团树里露出几排房顶。
 * 「五里一村庄」：A–D 之间 1.2–2.5 km。位置是创作。
 */
const BV = (id, name, x, z, rx, rz, extra = {}) => Object.freeze({ id, name, x, z, rx, rz, ringM: 14, treeKind: "blob", ...extra });
export const L0105_BACKDROP_VILLAGES = Object.freeze([
  BV("A", "村 A（日军集结的村子）", 136, -617, 62, 44, { treeKind: "tree", streetX: 135, yardW: 18, ringM: 12 }),
  BV("B", "村 B（西北）", -850, -860, 110, 80),
  BV("C", "村 C（正北）", -60, -2010, 130, 95),
  BV("D", "村 D（东北，大路往远处）", 1500, -2010, 120, 90, { streetX: 1500 }),
]);

/**
 * 东边一串低山包（远景层，kind "hill"）：东北到东约 3.1 km，20–60 m 高（像龙山、普阳山那样的低山，具体哪座不对号），
 * 长轴顺着这一串（ry ≈ −1.13 rad，西北—东南走向）。[id, x, z, 长半轴, 短半轴, 高, ry]。
 */
export const L0105_BACKDROP_HILLS = Object.freeze([
  ["Hill1", 1960, -2400, 340, 240, 32, -1.05], ["Hill2", 2250, -2080, 300, 220, 46, -1.1], ["Hill3", 2420, -1880, 400, 280, 58, -1.12],
  ["Hill4", 2700, -1470, 360, 250, 44, -1.18], ["Hill5", 2930, -980, 300, 220, 26, -1.2], ["Hill6", 3060, -480, 380, 260, 40, -1.25],
  ["Hill7", 3150, 80, 320, 230, 24, -1.3],
].map(([id, x, z, rx, rz, h, ry]) => Object.freeze({ id, x, z, rx, rz, h, ry })));

/** 远景层的颜色（sRGB）与参数。haze 照白盒画质的底色（Data_Tuning_Whitebox backgroundColor）。 */
export const L0105_BACKDROP = Object.freeze({
  far: 7000, radiusM: 6000, blendM: 160,
  ground: "#7a7150",   // 远处没切田块的地：几种田混起来的平均色
  haze: Object.freeze({ color: "#adb8c2", fromM: 650, toM: 6500, max: 0.88 }),
  wall: "#a89c86", roof: "#3e3a35",
  crowns: Object.freeze(["#5a5446", "#4f4b40", "#625a4a", "#565041"]),
  hill: "#5f5a47", hillTop: "#6d6656",
});

/**
 * 03 正面跃进的步兵（IjaRush1–8，两人一组：组 1 = 1/2、组 2 = 3/4、组 3 = 5/6、组 4 = 7/8）。
 * 2026-10-20 第四轮（用户问「日军真是在大平面上直直冲过来的？没遮挡不就是活靶子？」→ 照史料拍板四拍）：
 *   正面是拖住守军的，不是主攻 —— 先用轻机枪把坑里的人压下去、趁缩头那几秒一组跳一段（一跃 12–18 m、三四秒就扑倒），
 *   两道田埂之间约 40 m 跳三次，中间两次扑在麦地里；整个 03-3 正面只从 F3（约 185 m）推到 F2（约 140 m）。
 *   组 2、组 4 开场还在地坎后面的低地里（坎北低 2 m，坑里看不见人），03-3 一开场翻坎上来（交代「人从哪来」）。
 * 每人一串站位，下标见 L0105_RUSH_KEY：[0] 03-2 / 03-3 开场、[1] 03-3 第一跃后、[2] 第二跃后、[3] 第三跃后 = 03-4、[4] 03-4 那一跃后 = 03-5。
 *   { bund: "F2", x }        田埂北边 backBundM 处（田埂在他和坑之间）
 *   { field: [x, z] }        趴在麦地里（没有掩体，只靠趴得低；150 m 外看就是一道土色）
 *   { scarp: x }             地坎北边 behindScarpM 处的低地里（蹲着，坑里看不见）
 *   { grave: [x, z], lat }   坟包往远离坑的方向 backGraveM、横向 lat（面朝坑的右手为正）
 *   { ditch: x }             干水沟北沿外 ditchSideM 处（沟沿那条翻土 + 沟在他和坑之间）
 *   { open: [x, z] }         站着
 * IjaRush4 在 03-3 第二跃里中弹（L0105_RUSH_FALLEN），之后的拍子躺在那里。
 * 依据：日军进攻先用火力压住守军、散开一段段往前、出发线放在挡得住枪弹的地方、偏爱包抄（美军 TM-E 30-480，1944，第七章进攻）；
 * 具体距离、人数、路线、时刻是创作。
 */
export const L0105_RUSH_COVER = Object.freeze({ backBundM: 1.3, backGraveM: 1.9, ditchSideM: 3.0, behindScarpM: 6.0, target: P(0, -8) });
export const L0105_RUSH_KEY = Object.freeze({ "03-2": 0, "03-3": 0, "03-4": 3, "03-5": 4 });
export const L0105_RUSH_STATIONS = Object.freeze({
  IjaRush1: [{ bund: "F3", x: -46 }, { field: [-46, -176] }, { field: [-46, -162] }, { bund: "F2", x: -46 }, { field: [-46, -135] }],
  IjaRush2: [{ bund: "F3", x: -40 }, { field: [-40, -176] }, { field: [-40, -162] }, { bund: "F2", x: -40 }, { field: [-40, -135] }],
  IjaRush3: [{ scarp: -14 }, { bund: "F3", x: -14 }, { field: [-14, -176] }, { field: [-14, -162] }, { bund: "F2", x: -14 }],
  IjaRush4: [{ scarp: -7 }, { bund: "F3", x: -7 }],
  IjaRush5: [{ bund: "F3", x: 18 }, { field: [18, -177] }, { field: [18, -163] }, { bund: "F2", x: 18 }, { ditch: 18 }],
  IjaRush6: [{ bund: "F3", x: 24 }, { field: [24, -177] }, { field: [24, -163] }, { bund: "F2", x: 24 }, { ditch: 24 }],
  IjaRush7: [{ scarp: 44 }, { bund: "F3", x: 44 }, { field: [44, -178] }, { field: [44, -164] }, { ditch: 44 }],
  IjaRush8: [{ scarp: 50 }, { bund: "F3", x: 50 }, { field: [50, -178] }, { field: [50, -164] }, { ditch: 50 }],
});
/** 中弹倒下的：第几跃（站位下标）里、倒在哪。 */
export const L0105_RUSH_FALLEN = Object.freeze({ IjaRush4: Object.freeze({ bound: 2, at: P(-7.4, -181) }) });

/**
 * 03 西边干水沟里摸过来的一个班（2026-10-20 第四轮：侧面才是主攻）：8 人，班长 IjaFlank1 打头，轻机枪组（射手 + 装填手）走第三、四。
 * 03-2 / 03-3 开场在沟里弯着腰（沟深 1.4 m，坑里看不见），打头的在沟上弧长 startD（从东北头量）、一个跟一个隔 spacingM。
 * 03-3：走到 peekD 停下，班长站起来探一眼（「左边沟里头有人！」）；然后猫腰快走到渐浅段起点（出沟点），
 *   轻机枪组趴进渐浅段（lmgD / loaderD，沟还有半米深，枪口出沟沿）打坑的丙位；步枪兵一个个出沟扑到 N2 田埂后（n2X），
 *   fallen 那两个出沟跑到 fallenFrac 处被丙位打倒。
 * 03-4：toN1 那两个先扑进麦地（mid）、再跳到 N1 田埂后（离坑约 45 m）。具体人数、路线是创作（日军一个分队的编制约十来人带一挺轻机枪）。
 * 弧长都从原来的沟头 (190,−245) 量（2026-10-24 沟往东北接长了 DITCH_HEAD_EXT_M，这里已经加上）。
 */
export const L0105_DITCH_SQUAD = Object.freeze({
  ids: Object.freeze(["IjaFlank1", "IjaFlank2", "IjaFlankLmg", "IjaFlankLmgLoader", "IjaFlank3", "IjaFlank4", "IjaFlank5", "IjaFlank6"]),
  lmg: "IjaFlankLmg", loader: "IjaFlankLmgLoader", leader: "IjaFlank1",
  startD: R2(270 + DITCH_HEAD_EXT_M), spacingM: 3.2, peekD: R2(285 + DITCH_HEAD_EXT_M), lmgD: R2(309.5 + DITCH_HEAD_EXT_M), loaderD: R2(307.8 + DITCH_HEAD_EXT_M),
  n2X: Object.freeze({ IjaFlank1: -52, IjaFlank2: -57, IjaFlank3: -62, IjaFlank4: -67, IjaFlank5: -72, IjaFlank6: -77 }),
  fallen: Object.freeze(["IjaFlank2", "IjaFlank4"]), fallenFrac: 0.6,
  toN1: Object.freeze({ IjaFlank1: Object.freeze({ mid: P(-51, -56), x: -50 }), IjaFlank3: Object.freeze({ mid: P(-61, -57), x: -60 }) }),
});
/** 干水沟出沟点（渐浅段起点：从这里起人就露头了）。 */
export function DitchEmerge() {
  const line = L0105_PIT_NORTH.ditch.line;
  return PointAlong(line, LineLength(line) - L0105_PIT_NORTH.ditch.endTaperM);
}
/** 沟里那个班第 i 个人在 03-3 开场的位置（沟中心线上，弧长 startD − i·spacingM）。 */
export function DitchSquadStart(i) {
  const S = L0105_DITCH_SQUAD;
  return PointAlong(L0105_PIT_NORTH.ditch.line, S.startD - i * S.spacingM);
}
/** 出沟被打倒的人倒在哪：出沟点 → N2 站位的 fallenFrac 处。 */
export function DitchSquadFallenAt(id) {
  const S = L0105_DITCH_SQUAD, e = DitchEmerge(), st = RushStation({ bund: "N2", x: S.n2X[id] });
  return P(Math.round((e.x + (st.x - e.x) * S.fallenFrac) * 100) / 100, Math.round((e.z + (st.z - e.z) * S.fallenFrac) * 100) / 100);
}

/** 干水沟中心线在 x 处的 z（这条沟自东北往西南，x 单调）。 */
export function DitchZAt(x) {
  const line = L0105_PIT_NORTH.ditch.line;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    if ((x <= a.x && x >= b.x) || (x >= a.x && x <= b.x)) return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x);
  }
  return x > line[0].x ? line[0].z : line[line.length - 1].z;
}

/** 跃进站位描述 → { x, z, cover, prone?, hidden? }（cover：掩体名；open / field 为 null；field 趴着，scarp 蹲在坎下看不见）。 */
export function RushStation(desc) {
  const C = L0105_RUSH_COVER;
  if (desc.open) return { x: desc.open[0], z: desc.open[1], cover: null };
  if (desc.field) return { x: desc.field[0], z: desc.field[1], cover: null, prone: true };
  if (desc.scarp !== undefined) return { x: desc.scarp, z: Math.round((ScarpZ(desc.scarp) - C.behindScarpM) * 100) / 100, cover: null, hidden: true };
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
    // 沟的走向在这一段的法向：取北边（−z）那一侧。2026-10-24 沟改宽改成沙沟后：趴在沟底靠北岸那一边（沙底平、南岸沟沿挡着坑里的视线）
    const x0 = desc.ditch, z0 = DitchZAt(x0), z1 = DitchZAt(x0 + 0.5);
    let nx = -(z1 - z0), nz = 0.5; const len = Math.hypot(nx, nz); nx /= len; nz /= len;
    if (nz > 0) { nx = -nx; nz = -nz; }
    const off = L0105_PIT_NORTH.ditch.floorW / 2 - 0.4;
    return { x: Math.round((x0 + nx * off) * 100) / 100, z: Math.round((z0 + nz * off) * 100) / 100, cover: "干沙沟南沿（人趴在沟底靠北岸）", prone: true };
  }
  throw new Error(`跃进站位写错了：${JSON.stringify(desc)}`);
}

/**
 * 沟里的日常摆件（不是专门摆的掩体）：on = 哪条沟，d = 沿中心线的弧长（米，从折线起点量），lat = 往行进方向左手边偏多少米。
 * 能挡子弹的只用齐腰高、蹲下藏得住的（CrateStack 弹药箱垛 / SandbagStack 土袋垛 / Collapse 炮震塌的沟壁土堆 / WaterVat 水缸），
 * 门板、木头堆只是摆设。都贴沟底一侧，留出 ≥ 2.2 m 通道（AI 与担架要过）。尺寸见 L0105_PROP_KINDS。
 * 02 拖单被三处躲的地方：CrateStack_B1（支沟里一垛弹药箱）、支沟口台阶拐角（旁边 SandbagStack_J1）、拐角 2（SandbagStack_C2）。
 * 弧长：交通沟 支沟口 ≈ 75.1、拐角 2 ≈ 95.7、路口 ≈ 126.1；支沟全长 41.2（从支沟口量）；前沿链上的摆件按 x 给（FrontStationAtX 换成弧长）。
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
const PropX = (id, x, lat) => Prop(id, "front", FX(x), lat);
export const L0105_PROPS = Object.freeze([
  // 前沿链（西头北折那截 14 m；三段里各摆几件，浅连沟里不摆）
  Prop("CrateStack_F1", "front", 6, 1.4), Prop("DoorBoard_F1", "front", 11, -1.85),
  PropX("SandbagStack_F2", -66, -1.4), PropX("WaterVat_F1", -55, -1.4), PropX("Collapse_F1", -38, 1.35), PropX("WoodPile_F1", -32, -1.4),
  PropX("CrateStack_F2", -16, -1.4), PropX("SandbagStack_F3", -8, -1.4), PropX("DoorBoard_F2", 9, 1.85), PropX("WaterVat_F2", 13, -1.4),
  PropX("Collapse_F2", 22, -1.35), PropX("SandbagStack_F4", 28, 1.4),
  PropX("CrateStack_F3", 48, 1.4), PropX("WoodPile_F2", 57, 1.4), PropX("Collapse_F3", 65, -1.35), PropX("SandbagStack_F5", 78, 1.4),
  PropX("DoorBoard_F3", 90, -1.85), PropX("CrateStack_F4", 95, -1.4),
  // 交通沟（往南走，左手 = 东）
  Prop("WaterVat_T1", "traffic", 6.5, 1.4), Prop("CrateStack_T1", "traffic", 19, -1.4),
  Prop("SandbagStack_T2", "traffic", 34, 1.4), Prop("DoorBoard_T1", "traffic", 44, -1.85),
  Prop("WoodPile_T1", "traffic", 58, -1.4), Prop("CrateStack_T2", "traffic", 67, 1.4),
  Prop("SandbagStack_J1", "traffic", 80.5, 1.4), Prop("Collapse_T1", "traffic", 88, -1.35),
  Prop("SandbagStack_C2", "traffic", 97.8, 1.4), Prop("WaterVat_T2", "traffic", 106, -1.4), Prop("DoorBoard_T2", "traffic", 114, 1.85),
  Prop("CrateStack_T3", "traffic", 134, -1.4),
  // 第二条交通沟（往南走，左手 = 东）：西邻班的，稀一点
  Prop("SandbagStack_U1", "traffic2", 14, 1.4), Prop("DoorBoard_U1", "traffic2", 31, -1.85), Prop("CrateStack_U1", "traffic2", 52, -1.4),
  Prop("Collapse_U1", "traffic2", 76, 1.35), Prop("WoodPile_U1", "traffic2", 98, -1.4), Prop("SandbagStack_U2", "traffic2", 122, 1.4),
  // 支沟（从支沟口往东走，左手 = 北）
  Prop("WaterVat_B1", "branch", 5.5, 1.4), Prop("DoorBoard_B1", "branch", 12, 1.85),
  Prop("CrateStack_B1", "branch", 19, -1.3), Prop("WoodPile_B1", "branch", 26, 1.4), Prop("SandbagStack_B2", "branch", 30.5, 1.4),
]);

/** 场景信号（关键帧 signals 与场景文件 gates 共用的名字）。 */
export const L0105_SIGNALS = Object.freeze({
  dugoutCollapsed: "DugoutCollapsed", // 01 塌洞：洞口横木塌下来、土埋了半个洞口
  pitShelled: "PitShelled",           // 03 末：一发掷弹筒弹打在坑沿，胸墙塌了一截（2026-10-24 起不再是战车炮；轻装甲车没有炮）
  tankDisabled: "TankDisabled",       // 05：A 车瘫在桥头（车体残骸横在路上），桥面两块门板压断下沉
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
