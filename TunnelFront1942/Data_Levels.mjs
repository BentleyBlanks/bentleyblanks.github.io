// 《地下长城 · 冀中1942》 —— 关卡定义：L1《护粮》、L2《合围》。
// 手工地图（11×9 offset 网格，x 右 y 下），装载时转轴向键；seed 只走白名单（§2.10）。
// 波次脚本、勋记、档案式简报均在此定稿；地形与兵力预算恒定，seed 不改变它们。

import { HexKey } from "./Script_Hex.mjs";

/** offset(x,y) → 轴向键。平顶六角，q = x，r = y - floor(x/2)，行在世界坐标里对齐。 */
export function OffsetKey(x, y) {
  return HexKey(x, y - Math.floor(x / 2));
}
const A = OffsetKey;
const AL = (pairs) => pairs.map(([x, y]) => A(x, y));

const terrainByChar = { V: "village", F: "field", W: "woods", G: "grave", R: "river", ".": "open" };

/** 由行字符串 + 道路/桥列表构建 hexes 表（terrain/road/bridge/villageId 基座）。 */
function BuildHexes(rows, roadList, bridgeList, villages) {
  const hexes = {};
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < rows[y].length; x += 1) {
      hexes[A(x, y)] = { terrain: terrainByChar[rows[y][x]] || "open", road: false, roadBroken: false,
        bridge: false, villageId: null, traces: 0, searched: false, attackSite: false };
    }
  }
  for (const [x, y] of roadList) if (hexes[A(x, y)]) hexes[A(x, y)].road = true;
  for (const [x, y] of bridgeList) if (hexes[A(x, y)]) { hexes[A(x, y)].bridge = true; hexes[A(x, y)].road = true; }
  for (const village of villages) for (const key of village.hexKeys) if (hexes[key]) hexes[key].villageId = village.id;
  return hexes;
}

function FullRow(y) {
  const list = [];
  for (let x = 0; x <= 10; x += 1) list.push([x, y]);
  return list;
}

// ---------------------------------------------------------------------------
// L1 《护粮》 —— 单村教学：单路轴 + 河 + 坟地伏击位 + 树林。10 回合。
// ---------------------------------------------------------------------------

const l1Rows = [
  "..WW...R...",
  "..WWFF.RF..",
  "...VV..R...",   // y2 整行大车路；x7 石桥
  ".FGVFF.RF..",
  "..FFFG.R...",
  "...F...R...",
  ".......R...",
  "...........",
  "...........",
];

const l1Villages = [
  { id: "v1", name: "枣林庄", hexKeys: AL([[3, 2], [4, 2], [3, 3]]), pop: 4, grainOpen: 12, organize: 1, hasHq: true },
];

const l1 = {
  id: "L1",
  name: "护粮",
  maxTurns: 10,
  sweepStartTurn: 3,
  hardEndTurn: 10,
  pool: 10,
  decay: 1,
  smokeCharges: 0,
  ammoStart: 6,
  enemyOps: ["seal"],            // 无工兵：反地道仅搜索 + 封堵
  bridgeBreakable: false,        // 石桥不可破（破了敌无路，教学关不留一招毙敌）
  hexes: BuildHexes(l1Rows, FullRow(2), [[7, 2]], l1Villages),
  villages: l1Villages,
  supplyRoad: AL([[5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2]]),
  exitKeys: AL([[10, 2]]),
  allies: [
    { type: "militia", at: A(3, 2) }, { type: "militia", at: A(4, 2) },
    { type: "guerrilla", at: A(3, 3) }, { type: "runner", at: A(3, 2) },
  ],
  tunnels: { cells: AL([[3, 2]]), edges: [], entrances: AL([[3, 2]]) },
  wounded: {},
  waves: [
    { id: "w1scout", kind: "scout", turn: 3, jitter: false, role: "scout", entry: A(10, 2), exit: A(10, 2),
      units: ["puppet"],
      routeVariants: [                                   // seed 白名单：斥候绕向（北/南）
        AL([[8, 2], [5, 1], [3, 0], [2, 1], [2, 3], [3, 4], [5, 3], [6, 2]]),
        AL([[8, 2], [6, 2], [5, 3], [3, 4], [2, 3], [2, 1], [3, 0], [5, 1], [6, 2]]),
      ] },
    { id: "w1grain", kind: "march", turn: 5, jitter: false, role: "march", entry: A(10, 2), exit: A(10, 2),
      units: ["inf", "inf", "puppet"], target: "v1", waypoints: AL([[8, 2], [4, 2]]), seizeGoal: 8 },
  ],
  // 征粮队伤亡 ≥2 → 次回合报复队进场：搜已知口并烧房 1 处（只进账本）。
  revenge: { id: "w1revenge", watch: "w1grain", casualtiesNeed: 2, units: ["inf", "inf"],
             entry: A(10, 2), exit: A(10, 2), role: "mobile", target: "v1", burnCount: 1 },
  victory: { grainAtLeast: 8, combatUnitsAtLeast: 1 },
  medals: [
    { key: "grain10", name: "仓廪", text: "终局存粮不少于十担" },
    { key: "zeroCost", name: "无恙", text: "代价簿全空，且无一战斗单位阵亡" },
    { key: "expelOrLow", name: "周旋", text: "敌被逼退，或征获不超过两担" },
  ],
  briefing: [
    "冀中军区第▲分区 通报（摘）：",
    "枣林庄一带秋粮已入囤。据内线报，敌拟于近日出据点『征发』军粮。",
    "先遣伪军斥候一队，约第三日沿大车路窥探；征粮队两班日军携伪军一队，约第五日过石桥进村。",
    "指示：一、粮秣即刻转入地下；二、地道工事昼夜加修；三、相机袭扰，逼其早退。",
    "又：群众伤亡、房屋焚毁、粮秣被夺，均入代价簿。此簿只记损失，不折功劳。",
  ],
};

// ---------------------------------------------------------------------------
// L2 《合围》 —— 三村 + 河桥 + 双路轴。16 回合，三阶段脚本。
// ---------------------------------------------------------------------------

const l2Rows = [
  "..W.R..FVV.",
  ".WW.R.FFVF.",
  "....R......",   // y2 北路轴；x4 木桥（可破，破则敌绕行）
  ".FVVR.G..F.",
  ".FVV.WW.F..",
  ".GFF..WF...",
  "...VV......",   // y6 南路轴；穿石槽村
  ".W....GFW..",
  "...........",
];

const l2Villages = [
  { id: "v1", name: "枣林庄", hexKeys: AL([[2, 3], [3, 3], [2, 4], [3, 4]]), pop: 6, grainOpen: 8, organize: 1, hasHq: true },
  { id: "v2", name: "柳条峪", hexKeys: AL([[8, 0], [9, 0], [8, 1]]), pop: 5, grainOpen: 12, organize: 0, hasHq: false },
  { id: "v3", name: "石槽村", hexKeys: AL([[3, 6], [4, 6]]), pop: 3, grainOpen: 0, organize: 0, hasHq: false },
];

const l2EntryNorth = A(10, 2);
const l2EntrySouth = A(10, 6);

const l2 = {
  id: "L2",
  name: "合围",
  maxTurns: 16,
  sweepStartTurn: 2,
  hardEndTurn: 16,
  pool: 24,
  decay: 1,
  smokeCharges: 2,
  ammoStart: 10,
  enemyOps: ["smoke", "blast", "breach", "seal"],
  bridgeBreakable: true,
  hexes: BuildHexes(l2Rows, [...FullRow(2), ...FullRow(6)], [[4, 2]], l2Villages),
  villages: l2Villages,
  supplyRoad: AL([[6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6]]),
  exitKeys: [l2EntryNorth, l2EntrySouth],
  allies: [
    { type: "militia", at: A(2, 3) }, { type: "militia", at: A(3, 3) }, { type: "militia", at: A(2, 4) },
    { type: "guerrilla", at: A(3, 4) }, { type: "guerrilla", at: A(3, 6) }, { type: "runner", at: A(2, 3) },
  ],
  tunnels: {
    cells: AL([[2, 3], [3, 3], [2, 4], [3, 6]]),
    edges: [[A(2, 3), A(3, 3)], [A(2, 3), A(2, 4)]],
    entrances: AL([[2, 3], [2, 4], [3, 6]]),
  },
  wounded: { v1: 4 },              // 伤员 4 批在枣林庄，只能经地道转移
  waves: [
    { id: "w2scoutN", kind: "scout", turn: 2, jitter: false, role: "scout", entry: l2EntryNorth, exit: l2EntryNorth,
      units: ["puppet"], waypoints: AL([[8, 2], [7, 0], [9, 1], [8, 2]]) },
    { id: "w2spy", kind: "spy", turn: 3, jitter: true, role: "spy", entry: null, exit: l2EntrySouth,
      units: ["spy"],
      routeVariants: [                                   // seed 白名单：特务路线三选一
        { entry: l2EntryNorth, waypoints: AL([[8, 1], [8, 0], [6, 1], [3, 3], [2, 4]]) },
        { entry: l2EntrySouth, waypoints: AL([[4, 6], [3, 6], [3, 4], [2, 3]]) },
        { entry: A(10, 4), waypoints: AL([[8, 4], [6, 3], [3, 4], [2, 3]]) },
      ] },
    { id: "w2scoutS", kind: "scout", turn: 4, jitter: true, role: "scout", entry: l2EntrySouth, exit: l2EntrySouth,
      units: ["puppet"], waypoints: AL([[7, 6], [4, 7], [2, 6], [5, 6], [8, 6]]) },
    { id: "w2main", kind: "march", turn: 6, jitter: false, role: "march",
      units: ["inf", "inf", "inf", "inf"], entryVariant: true, seizeGoal: 0 },
    { id: "w2support", kind: "march", turn: 7, jitter: true, role: "march",
      units: ["inf", "inf", "puppet"], entryVariant: true, seizeGoal: 0 },
    { id: "w2sapper", kind: "sapper", turn: 9, jitter: true, role: "sapper", entry: l2EntryNorth, exit: l2EntryNorth,
      units: ["sapper", "inf"], target: "v1" },
    { id: "w2reserve", kind: "reserve", turn: 11, jitter: true, role: "mobile",
      units: ["inf", "inf"], axisKillsNeed: 2 },
    { id: "w2decision", kind: "decision", turn: 13, jitter: false },
  ],
  // seed 白名单：主攻口 E1/E2 + 目标村指派（主攻/助攻各取其一，区队部必在其列）。
  mainEntryOptions: [l2EntryNorth, l2EntrySouth],
  targetAssignOptions: [
    { main: "v1", support: "v2" },
    { main: "v2", support: "v1" },
  ],
  victory: { surviveTurn: 16, villagesAtLeast: 2, grainAtLeast: 10, woundedAtLeast: 3 },
  defeat: { hqOccupiedTurns: 2, popRatioBelow: 0.5 },
  medals: [
    { key: "grain15", name: "仓廪", text: "终局存粮不少于十五担" },
    { key: "wounded", name: "后送", text: "伤员四批全数保全" },
    { key: "trunk", name: "长城", text: "枣林庄—石槽村地道主干贯通且未毁" },
  ],
  briefing: [
    "冀中军区第▲分区 敌情通报（节录）：",
    "敌拟对枣林庄、柳条峪、石槽村一带合围扫荡。先期斥候两路沿南北大车路侦察，另有便衣特务潜入。",
    "主力约第六日自{MAIN}进逼，先扑{MAINVILLAGE}；次日三个班自另一路合击；第九日工兵队携烟具沿北支路跟进，桥毁则绕行。",
    "我方若杀伤甚重，敌将增派预备队投向受创轴线；若两轴皆轻，则不出。",
    "第十三日为节点：敌若已占村，转入驻剿搜毁；未得手，则沿大路收队。",
    "指示：一、柳条峪余粮速转地下；二、伤员四批全数经地道后送；三、区队部与石槽村地道贯通为要；",
    "四、相机破路、伏击，耗其锐气。代价簿照记，群众一批不可轻掷。",
  ],
};

export const levelDefinitions = Object.freeze({ L1: l1, L2: l2 });

export function GetLevel(levelId) {
  const level = levelDefinitions[levelId];
  if (!level) throw new Error(`未知关卡：${levelId}`);
  return level;
}

/** 简报文本（把 seed 抽定的主攻口/目标村写进档案；情报 100% 真实，v1 无假情报）。 */
export function BuildBriefing(level, plan) {
  const lines = level.briefing.map((line) => line
    .replace("{MAIN}", plan && plan.mainEntry === l2EntrySouth ? "南路（石槽村方向）" : "北路（过桥方向）")
    .replace("{MAINVILLAGE}", plan && plan.targetAssign ? ({ v1: "枣林庄", v2: "柳条峪", v3: "石槽村" })[plan.targetAssign.main] : "枣林庄"));
  return lines;
}
