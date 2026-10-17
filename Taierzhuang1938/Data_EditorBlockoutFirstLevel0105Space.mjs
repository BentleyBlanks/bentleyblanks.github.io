// ===========================================================================
// Data_EditorBlockoutFirstLevel0105Space.mjs —— 第一关 01–05 白盒（关卡键 FirstLevel0105）的空间锚点
//
// 唯一口径：Notion「第一关｜往南的路 · 剧本」子页「空间拓扑关系」（10-18 定稿的纸面设计）——
// 总图、沟口放大、按拍快照与草算尺寸表。本表把那几张图（约 2.2 px/米、北在上）换算成本关的世界坐标：
//   原点 = 沟口（交通沟接进前沿沟的地方）；X 向东、Z 向南、米；朝向 yawDeg：0 朝北（−Z）、+90 朝西、−90 朝东、180 朝南。
// 这是一片独立的白盒场地，坐标与游戏里的第一关（Data_FirstLevelMission*）无关，也不改它们。
//
// 场景生成器（Script_EditorBlockoutFirstLevel0105Scene.mjs）按这里烘地形与体块，
// 关键帧生成器（Script_EditorBlockoutFirstLevel0105Keyframes.mjs）按这里摆人、POI 与机位。
// 两边都只读本表；要挪地方先改这里，再重跑两个生成器。纯数据：零 three、零 DOM，node 与浏览器共用。
//
// 草算尺寸（Notion 表）与本表的对照：
//   前沿沟 约 195 m，沟口以西约 70 m 在我方        → 西端 x −62 再往北折 22 m；东端 x 120；合计约 200 m
//   机枪坑 约 8×6 m，散兵坑在坑西北约 12 m         → 坑 x −4…4、z −10…−4；散兵坑 (−9,−15)，离坑心 12 m
//   交通沟 全长约 170 m，拐角 1 离坑约 18 m          → 沟口→集结处约 155 m；拐角 1 (0.5,11) 离坑心 18 m
//   支沟 约 43 m，洞离路约 15 m、离前沿沟约 65 m    → 支沟口 (21.9,67.1)→洞口 (63,64.5) 41 m + 洞 7 m；洞东壁离路约 15 m；离前沿沟 64 m
//   路 横穿点在坡顶北边约 15 m                      → 路口 (35,116)，坡顶 z 131
//   坡顶比集结处高约 4 m；集结处约 40×30 m         → 坡顶 +3.0 m、集结处洼地底 −1.0 m；洼地 x 13…57、z 143…173
//   03 轻机枪在坑北约 100–150 m；掷弹筒约 200 m    → 轻机枪 (−30,−118) 与 (40,−140)；掷弹筒 (28,−214) 躲在土坎 z −206 后
//   02 拖单被（洞口 0 → 支沟口 43 → 拐角 2 63 → 路口 93 → 坡顶 108 → 集结处 130 m）与上面的折线一致
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
  assemblyFloor: -1.0, // 集结处洼地底：比坡顶低 4 m，看不见前沿
});

/** 壕沟断面（沟底宽、深）。沟底 ≥ 3.4 m 是 Script_SquadMarchAi.CanPause 的下限（史料约 0.6 m，见 docs/Data_TrenchSpline.md）。 */
export const L0105_TRENCH_SECTION = Object.freeze({
  front: Object.freeze({ floorW: 3.4, depth: 1.9 }),
  traffic: Object.freeze({ floorW: 3.4, depth: 2.0 }),
  trafficAtCrest: Object.freeze({ floorW: 3.4, depth: 1.5 }),
  branch: Object.freeze({ floorW: 3.4, depth: 2.4 }),   // 支沟比交通沟低，支沟口有台阶
  crawlSap: Object.freeze({ floorW: 1.4, depth: 1.0 }), // 坑到散兵坑的爬沟（只有玩家走）
});

const P = (x, z) => Object.freeze({ x, z });
const Line = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));

/**
 * 中心线（折线，米）。场景生成器把它们交给 Script_TrenchPlan.CompileTrenchNetwork 烘进高度场。
 * front：东西走向一折一折（±3.5 m、12 m 一折），西头直角往北折护左翼；沟口那 10 m 是平的（机枪坑在它正北）。
 * traffic：沟口 → 拐角 1 → 斜折 → 南直段 → 支沟口（在斜段上）→ 拐角 2 → 路口 → 坡顶 → 集结处入口。
 * branch：支沟口往东笔直到防炮洞口（机枪架在洞口这头的沟沿上能顺沟压住支沟口）。
 */
export const L0105_TRENCHES = Object.freeze({
  front: Line([-62, -22], [-62, 0], [-50, 3.5], [-38, -3.5], [-26, 3.5], [-14, -3.5], [-5, 0], [5, 0],
    [14, -3.5], [26, 3.5], [38, -3.5], [50, 3.5], [62, -3.5], [74, 3.5], [86, -3.5], [98, 3.5], [110, -3.5], [120, 0]),
  traffic: Line([0, 0], [0.5, 11], [13, 21], [12, 44], [30, 86], [35, 116], [35, 131], [35, 145]),
  branch: Line([21.9, 67.1], [63, 64.5]),
  crawlSap: Line([-3.5, -9], [-8, -14]),
});

/** 前沿沟哪一段已经丢了（按拍）：x ≥ lostFromX 的那段在鬼子手里。 */
export const L0105_FRONT_LOST_FROM_X = Object.freeze({ "01": 25, "02": 25, "03": 13, "04": -5, "05": -5 });

/** 路：从东北斜下来，经过防炮洞东边约 15 m，在坡顶前横穿交通沟（路口），再往西南翻过坡去。 */
export const L0105_ROAD = Line([175, -40], [105, 50], [35, 116], [-20, 152], [-100, 185]);
export const L0105_ROAD_WIDTH_M = 4.5;

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
  steps: Object.freeze({ name: "台阶", x: 24.4, z: 66.9, yawDeg: 90, count: 3, riseM: 0.6 }), // 从支沟往西上到交通沟
  corner2: Object.freeze({ name: "拐角 2", x: 30, z: 86 }),
  crossing: Object.freeze({ name: "路口", x: 35, z: 116 }),
  crest: Object.freeze({ name: "坡顶", x: 35, z: 131 }),
  assemblyEntry: Object.freeze({ name: "集结处入口", x: 35, z: 145 }),
  assembly: Object.freeze({ name: "集结处", x: 35, z: 158, w: 44, d: 30 }),
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
  tankStop: Object.freeze({ name: "战车瘫在路口", x: 35, z: 116.5, yawDeg: 136 }),
});

/** 场景信号（关键帧 signals 与场景文件 gates 共用的名字）。 */
export const L0105_SIGNALS = Object.freeze({
  dugoutCollapsed: "DugoutCollapsed", // 01 塌洞：洞口横木塌下来、土埋了半个洞口
  pitShelled: "PitShelled",           // 03 末：战车一炮打在坑沿，胸墙塌了一截
  tankDisabled: "TankDisabled",       // 05：战车瘫在路口（车体残骸横在路上）
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
