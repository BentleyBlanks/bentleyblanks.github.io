// 《地下长城 · 冀中1942》 —— 关卡定义：L1《护粮》、L2《合围》。
// 手工地图（11×9 offset 网格，x 右 y 下），装载时转轴向键；seed 只走白名单（§2.10）。
// 波次脚本、勋记判据、胜负判据、档案式简报均在此定稿；地形恒定，seed 不改地形。
//
// R2 起本文件还承担「波次排程」职责：`BuildSchedule(level, plan)` 把 seed 抽出的若干下标
// （轴线 / 兵力配比 / 到达回合 / 斥候绕向 …）翻译成完整的纵队排班表。规则脚本只负责抽签与执行，
// 「这一局长什么样」全部写在本文件里——往内容与选择空间里砸，不往报表里砸。

import { HexKey } from "./Script_Hex.mjs";

/** offset(x,y) → 轴向键。平顶六角，q = x，r = y - floor(x/2)，行在世界坐标里对齐。 */
export function OffsetKey(x, y) {
  return HexKey(x, y - Math.floor(x / 2));
}
const A = OffsetKey;
const AL = (pairs) => pairs.map(([x, y]) => A(x, y));

const terrainByChar = { V: "village", F: "field", W: "woods", G: "grave", R: "river", ".": "open" };

/**
 * 由行字符串 + 道路/桥/浅滩列表构建 hexes 表。
 * road：大车路与土路（敌全路径在路上时移动减半，可 BreakRoad 破毁）。
 * bridge：跨河可通行点；桥同时是路（可破），浅滩只是可涉水的河（不可破、不减速）。
 */
function BuildHexes(rows, roadList, bridgeList, fordList, villages) {
  const hexes = {};
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < rows[y].length; x += 1) {
      hexes[A(x, y)] = { terrain: terrainByChar[rows[y][x]] || "open", road: false, roadBroken: false,
        bridge: false, villageId: null, traces: 0, searched: false, attackSite: false, alertedUntil: 0 };
    }
  }
  for (const [x, y] of roadList) if (hexes[A(x, y)]) hexes[A(x, y)].road = true;
  for (const [x, y] of bridgeList) if (hexes[A(x, y)]) { hexes[A(x, y)].bridge = true; hexes[A(x, y)].road = true; }
  for (const [x, y] of fordList) if (hexes[A(x, y)]) hexes[A(x, y)].bridge = true;
  for (const village of villages) for (const key of village.hexKeys) if (hexes[key]) hexes[key].villageId = village.id;
  return hexes;
}

function FullRow(y) {
  const list = [];
  for (let x = 0; x <= 10; x += 1) list.push([x, y]);
  return list;
}

// ---------------------------------------------------------------------------
// L1 《护粮》 —— 单村教学：双路轴（北大车路 + 南土路）+ 河 + 石桥 + 浅滩 + 坟地伏击位。10 回合。
//
// 地形固定，但每局的「敌怎么来」由 seed 决定（§2.10 白名单）：
//   ① 入境轴线 3 选 1：北路 / 南路 / 双路分进合击
//   ② 主力到达回合 T5±2
//   ③ 伪军:日军配比 3 档（日重 / 参半 / 伪重——日军少则搜索弱，伪军多则人头多）
//   ④ 斥候绕向 2 选 1（北环 / 南环）
// ---------------------------------------------------------------------------

const l1Rows = [
  "..WW...R...",
  "..WWFF.RF..",
  "...VV..R...",   // y2 整行大车路；x7 石桥（可破，破则敌走浅滩或南土路绕行）
  ".FGVFF.RF..",
  "..FFFG.R...",   // y4 x7 浅滩：河沟唯一可涉处，不通车、不可破
  "...F...R...",
  ".......R...",
  "...........",   // y7 起河沟到头；南土路自东南角斜插枣林庄南缘
  "...........",
];

const l1Villages = [
  { id: "v1", name: "枣林庄", hexKeys: AL([[3, 2], [4, 2], [3, 3]]), pop: 4, grainOpen: 12, organize: 1, hasHq: true },
];

// 南土路：东南角 →（绕过河尾）→ 枣林庄南缘。整条都是可破的土路。
const l1SouthLane = [[10, 7], [9, 7], [8, 7], [7, 7], [6, 7], [5, 6], [5, 5], [4, 5], [3, 4]];

const l1EntryNorth = A(10, 2);
const l1EntrySouth = A(10, 7);

// 北大车路进村的两条最后一段（供路点使用）
const l1NorthApproach = AL([[8, 2], [5, 1], [4, 2]]);
const l1SouthApproach = AL([[9, 7], [6, 7], [4, 5], [3, 4]]);

/** 主力入境轴线（seed 白名单 ①）。take = 从配比表里取哪几个单位组成本纵队。 */
const l1Approaches = [
  { id: "north", name: "北路（大车路过石桥）",
    brief: "沿大车路过石桥，自村北压来",
    sapperEntry: l1EntrySouth, sapperWay: l1SouthApproach,
    sapperBrief: "工兵组另走南土路摸上来",
    columns: [{ suffix: "N", entry: l1EntryNorth, take: [0, 1, 2, 3], waypoints: l1NorthApproach }] },
  { id: "south", name: "南路（土路绕河尾）",
    brief: "绕过河尾走南土路，自村南摸来",
    sapperEntry: l1EntryNorth, sapperWay: l1NorthApproach,
    sapperBrief: "工兵组随后自大车路跟进",
    columns: [{ suffix: "S", entry: l1EntrySouth, take: [0, 1, 2, 3], waypoints: l1SouthApproach }] },
  { id: "dual", name: "双路（分进合击）",
    brief: "分成两股，一股走大车路，一股绕南土路，两面夹村",
    sapperEntry: l1EntryNorth, sapperWay: l1NorthApproach,
    sapperBrief: "工兵组跟在北路一股之后",
    columns: [
      { suffix: "N", entry: l1EntryNorth, take: [0, 2], waypoints: l1NorthApproach },
      { suffix: "S", entry: l1EntrySouth, take: [1, 3], waypoints: l1SouthApproach },
    ] },
];

/** 伪军:日军配比（seed 白名单 ③）。日军班搜索力 2；伪军队 1 格内无日军班则搜索力 0。 */
const l1Mixes = [
  { id: "heavy", name: "日军重（两班日军 + 一队伪军）", units: ["inf", "inf", "puppet"] },
  { id: "even", name: "参半（一班日军 + 两队伪军）", units: ["inf", "puppet", "puppet"] },
  { id: "light", name: "伪军重（一班日军 + 三队伪军）", units: ["inf", "puppet", "puppet", "puppet"] },
];

/** 斥候绕向（seed 白名单 ④）。 */
const l1ScoutLoops = [
  { id: "northLoop", name: "北环（先探树林一侧）", entry: l1EntryNorth,
    waypoints: AL([[8, 2], [5, 1], [3, 0], [2, 1], [2, 3], [3, 4], [5, 3], [6, 2]]) },
  { id: "southLoop", name: "南环（先探坟地一侧）", entry: l1EntrySouth,
    waypoints: AL([[8, 7], [5, 6], [3, 4], [2, 3], [2, 1], [3, 0], [5, 1], [6, 2]]) },
];

const l1 = {
  id: "L1",
  name: "护粮",
  maxTurns: 10,
  sweepStartTurn: 3,
  hardEndTurn: 10,
  pool: 14,                      // R2：池 10→14，且取消「每回合白送 -1」（改为扑空衰减，见 Data_Rules）
  decay: 0,                      // 只有伏击/破路/逼工兵作业/打退攻入才扣池
  smokeCharges: 1,               // 工兵组随身一份烟具
  ammoStart: 6,
  sweepGrainLoss: 2,             // 扫荡期敌到村 2 格内，每回合搜走 2 担明存粮
  enemyOps: ["smoke", "blast", "breach", "seal"],
  bridgeBreakable: true,         // R2：石桥可破（破则敌走浅滩或南土路，迟到约两回合）
  hexes: BuildHexes(l1Rows, [...FullRow(2), ...l1SouthLane], [[7, 2]], [[7, 4]], l1Villages),
  villages: l1Villages,
  supplyRoad: AL([[5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7]]),
  exitKeys: [l1EntryNorth, l1EntrySouth],
  allies: [
    { type: "militia", at: A(3, 2) }, { type: "militia", at: A(4, 2) },
    { type: "guerrilla", at: A(3, 3) }, { type: "runner", at: A(3, 2) },
  ],
  tunnels: { cells: AL([[3, 2]]), edges: [], entrances: AL([[3, 2]]) },
  wounded: {},
  // seed 白名单：只抽这四个下标，地形与兵力预算恒定（配比换的是构成，不是总量）。
  seedDraws: [
    { key: "axis", count: 3, note: "入境轴线：北路/南路/双路" },
    { key: "mix", count: 3, note: "伪军:日军配比 3 档" },
    { key: "arrive", count: 5, note: "主力到达回合 T5±2" },
    { key: "scoutDir", count: 2, note: "斥候绕向：北环/南环" },
  ],
  approaches: l1Approaches,
  mixes: l1Mixes,
  scoutLoops: l1ScoutLoops,
  mainTurnBase: 5,
  mainTurnRange: [4, 7],
  scoutTurn: 3,
  sapperDelay: 1,                 // 工兵组紧跟主力一回合入境（不早于 T5，不晚于 T7；再晚就赶不上动手）
  sapperTurnRange: [5, 7],
  // 征粮队伤亡 ≥2 → 次回合报复队进场：搜已知口并烧房 1 处（只进账本）。
  revenge: { id: "w1revenge", watch: "w1grain", casualtiesNeed: 2, units: ["inf", "inf"],
             entry: l1EntryNorth, exit: l1EntryNorth, role: "mobile", target: "v1", burnCount: 1 },
  // R2 P0-6a：胜利线从「总存粮 ≥8」改成「洞存粮 ≥10」——明存粮扫荡期每回合被搜走 2 担，
  // 零地道流（不挖不藏）连及格线都够不着。
  victory: { tunnelGrainAtLeast: 10, combatUnitsAtLeast: 1 },
  medals: [
    { key: "grain14", name: "仓廪", text: "洞中存粮不少于十四担",
      need: { tunnelGrain: 14 } },
    { key: "zeroCost", name: "无恙", text: "群众一批未失、房屋一处未焚，且无一战斗单位阵亡",
      need: { civLedgerAtMost: 0, housesBurnedAtMost: 0, alliesLostAtMost: 0 } },
    { key: "expelOrLow", name: "周旋", text: "敌被逼退，或粮秣被夺不超过四担",
      anyOf: { expelled: true, grainSeizedAtMost: 4 } },
  ],
  briefing: [
    "冀中军区第▲分区 通报（摘）：",
    "枣林庄一带秋粮已入囤。据内线报，敌拟于近日出据点『征发』军粮。",
    "先遣伪军斥候一队，约第三日{SCOUT}。",
    "征粮队{MIX}，约第{ARRIVE}日{AXIS}。",
    "另据报：{SAPPER}——此队携烟具风箱、炸药，专对付地道口。",
    "指示：一、粮秣即刻转入地下——地道要通到粮囤脚底下，隔着一条街的洞装不进粮；",
    "      二、动土必留痕：每挖通一段、每修一处设施，本气区各口暴露豆 +1，开新口 +2；",
    "         掩土可减 2，但每人每役只掩得动三回，量力而行；",
    "      三、口一旦被敌盯上（暴露豆 ≥4），封堵、烟攻、爆破、强攻就都会找上门；",
    "      四、相机袭扰、破路、破桥，逼其早退。石桥可破，破了敌须走浅滩或南土路绕行。",
    "又：群众伤亡、被抓、房屋焚毁、粮秣被夺，均入代价簿。此簿只记损失，不折功劳。",
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

/** 特务路线三选一（seed 白名单）。 */
const l2SpyRoutes = [
  { entry: l2EntryNorth, waypoints: AL([[8, 1], [8, 0], [6, 1], [3, 3], [2, 4]]) },
  { entry: l2EntrySouth, waypoints: AL([[4, 6], [3, 6], [3, 4], [2, 3]]) },
  { entry: A(10, 4), waypoints: AL([[8, 4], [6, 3], [3, 4], [2, 3]]) },
];

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
  sweepGrainLoss: 1,             // L2 村多路远，搜刮速度减半（柳条峪的粮靠地道抢，不靠拖）
  enemyOps: ["smoke", "blast", "breach", "seal"],
  bridgeBreakable: true,
  hexes: BuildHexes(l2Rows, [...FullRow(2), ...FullRow(6)], [[4, 2]], [], l2Villages),
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
  seedDraws: [
    { key: "mainEntry", count: 2, note: "主攻口 E1/E2" },
    { key: "spyRoute", count: 3, note: "特务路线 3 选 1" },
    { key: "targetAssign", count: 2, note: "主攻/助攻的目标村指派" },
    { key: "spyTurn", count: 3, note: "特务潜入时刻 ±1" },
    { key: "scoutSTurn", count: 3, note: "南路斥候时刻 ±1" },
    { key: "supportTurn", count: 3, note: "助攻时刻 ±1" },
    { key: "sapperTurn", count: 3, note: "工兵队时刻 ±1" },
    { key: "reserveTurn", count: 3, note: "预备队时刻 ±1" },
  ],
  spyRoutes: l2SpyRoutes,
  // seed 白名单：主攻口 E1/E2 + 目标村指派（主攻/助攻各取其一，区队部必在其列）。
  mainEntryOptions: [l2EntryNorth, l2EntrySouth],
  targetAssignOptions: [
    { main: "v1", support: "v2" },
    { main: "v2", support: "v1" },
  ],
  // 撑到 T16 是隐含前提（终局判定只在波次收束或到时才跑），这里只列可判据的四条。
  // 明存粮扫荡期留不住，所以粮线只认洞存粮：一满仓（8）是及格，两仓（12）才是勋记。
  victory: { villagesAtLeast: 2, tunnelGrainAtLeast: 8, woundedAtLeast: 3, combatUnitsAtLeast: 1 },
  defeat: { hqOccupiedTurns: 2, popRatioBelow: 0.5 },
  // R2：三枚勋记各加一条「全须全尾」判据——丢粮丢人丢单位的一局不该和干干净净的一局同评。
  medals: [
    { key: "grain12", name: "仓廪", text: "洞存粮不少于十二担（一仓装不下，须把地道挖到第二个村的粮囤底下）",
      need: { tunnelGrain: 12 } },
    { key: "wounded", name: "后送", text: "伤员四批全数保全，且无一战斗单位阵亡",
      need: { wounded: 4, alliesLostAtMost: 0 } },
    { key: "trunk", name: "长城", text: "枣林庄—石槽村地道主干贯通未毁，且群众一批未失",
      need: { trunkIntact: true, civLedgerAtMost: 0 } },
  ],
  briefing: [
    "冀中军区第▲分区 敌情通报（节录）：",
    "敌拟对枣林庄、柳条峪、石槽村一带合围扫荡。先期斥候两路沿南北大车路侦察，另有便衣特务潜入。",
    "主力约第六日自{MAIN}进逼，先扑{MAINVILLAGE}；次日三个班自另一路合击；第九日工兵队携烟具沿北支路跟进，桥毁则绕行。",
    "我方若杀伤甚重，敌将增派预备队投向受创轴线；若两轴皆轻，则不出。",
    "第十三日为节点：敌若已占村，转入驻剿搜毁；未得手，则沿大路收队。",
    "指示：一、柳条峪余粮速转地下——地道须通到粮囤脚底下方可入囤；扫荡期明存粮每日被搜走两担；",
    "      二、伤员四批全数经地道后送；三、区队部与石槽村地道贯通为要；",
    "      四、动土必留声：每挖通一段、每修一处设施，本气区各口暴露 +1；通风口太少，敌工兵必用烟；",
    "      五、相机破路、破桥、伏击，耗其锐气。代价簿照记，群众一批不可轻掷。",
  ],
};

export const levelDefinitions = Object.freeze({ L1: l1, L2: l2 });

export function GetLevel(levelId) {
  const level = levelDefinitions[levelId];
  if (!level) throw new Error(`未知关卡：${levelId}`);
  return level;
}

// ---------------------------------------------------------------------------
// 波次排程：把 seed 抽出的下标翻译成完整排班（纯函数，不碰 state，不用随机）
// ---------------------------------------------------------------------------

/** 统一的排班条目形状（Script_EnemyAi 按此消费）。 */
function WaveEntry(spec) {
  return { id: spec.id, kind: spec.kind, turn: spec.turn, role: spec.role || null,
    entry: spec.entry || null, exit: spec.exit || spec.entry || null, units: (spec.units || []).slice(),
    waypoints: (spec.waypoints || []).slice(), target: spec.target || null,
    seizeGoal: spec.seizeGoal || 0, axisKillsNeed: spec.axisKillsNeed || 0, spawned: false };
}

const Clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

/** L1 排班：轴线 × 配比 × 到达回合 × 斥候绕向。 */
function BuildL1Schedule(level, plan) {
  const approach = level.approaches[(plan.axis || 0) % level.approaches.length];
  const mix = level.mixes[(plan.mix || 0) % level.mixes.length];
  const loop = level.scoutLoops[(plan.scoutDir || 0) % level.scoutLoops.length];
  const arriveTurn = Clamp(level.mainTurnBase + ((plan.arrive || 0) - 2), level.mainTurnRange[0], level.mainTurnRange[1]);
  const sapperTurn = Clamp(arriveTurn + level.sapperDelay, level.sapperTurnRange[0], level.sapperTurnRange[1]);
  plan.axisId = approach.id;
  plan.mixId = mix.id;
  plan.arriveTurn = arriveTurn;
  plan.sapperTurn = sapperTurn;
  plan.scoutId = loop.id;
  const schedule = [WaveEntry({ id: "w1scout", kind: "scout", turn: level.scoutTurn, role: "scout",
    entry: loop.entry, exit: loop.entry, units: ["puppet"], waypoints: loop.waypoints })];
  for (const part of approach.columns) {
    const units = part.take.map((index) => mix.units[index]).filter(Boolean);
    if (!units.length) continue;
    schedule.push(WaveEntry({ id: `w1grain${part.suffix}`, kind: "march", turn: arriveTurn, role: "march",
      entry: part.entry, exit: part.entry, units, waypoints: part.waypoints, target: "v1",
      seizeGoal: Math.max(4, Math.round(8 / approach.columns.length)) }));
  }
  // 工兵组：L1 也有烟攻/爆破了——它从另一条轴摸上来，专找暴露豆最高的那个口。
  schedule.push(WaveEntry({ id: "w1sapper", kind: "sapper", turn: sapperTurn, role: "sapper",
    entry: approach.sapperEntry, exit: approach.sapperEntry, units: ["sapper"],
    waypoints: approach.sapperWay, target: "v1" }));
  return schedule;
}

/** L2 排班：主攻口 / 特务路线 / 目标村指派 + 四处时刻抖动。 */
function BuildL2Schedule(level, plan) {
  const mainEntry = level.mainEntryOptions[(plan.mainEntry || 0) % 2];
  const otherEntry = level.mainEntryOptions.find((key) => key !== mainEntry);
  const assign = level.targetAssignOptions[(plan.targetAssign || 0) % 2];
  const spy = level.spyRoutes[(plan.spyRoute || 0) % level.spyRoutes.length];
  const Jitter = (base, draw) => Math.max(2, base + ((draw || 0) - 1));
  plan.mainEntry = mainEntry;
  plan.targetAssign = assign;
  return [
    WaveEntry({ id: "w2scoutN", kind: "scout", turn: 2, role: "scout", entry: l2EntryNorth,
      units: ["puppet"], waypoints: AL([[8, 2], [7, 0], [9, 1], [8, 2]]) }),
    WaveEntry({ id: "w2spy", kind: "spy", turn: Jitter(3, plan.spyTurn), role: "spy",
      entry: spy.entry, exit: l2EntrySouth, units: ["spy"], waypoints: spy.waypoints }),
    WaveEntry({ id: "w2scoutS", kind: "scout", turn: Jitter(4, plan.scoutSTurn), role: "scout",
      entry: l2EntrySouth, units: ["puppet"], waypoints: AL([[7, 6], [4, 7], [2, 6], [5, 6], [8, 6]]) }),
    WaveEntry({ id: "w2main", kind: "march", turn: 6, role: "march", entry: mainEntry,
      units: ["inf", "inf", "inf", "inf"], target: assign.main }),
    WaveEntry({ id: "w2support", kind: "march", turn: Jitter(7, plan.supportTurn), role: "march",
      entry: otherEntry, units: ["inf", "inf", "puppet"], target: assign.support }),
    WaveEntry({ id: "w2sapper", kind: "sapper", turn: Jitter(9, plan.sapperTurn), role: "sapper",
      entry: l2EntryNorth, units: ["sapper", "inf"], target: "v1" }),
    WaveEntry({ id: "w2reserve", kind: "reserve", turn: Jitter(11, plan.reserveTurn), role: "mobile",
      units: ["inf", "inf"], axisKillsNeed: 2 }),
    WaveEntry({ id: "w2decision", kind: "decision", turn: 13 }),
  ];
}

/** 排程总入口：Script_State 抽完 seedDraws 后调用一次，结果写进 wave.schedule。 */
export function BuildSchedule(level, plan) {
  const schedule = level.id === "L1" ? BuildL1Schedule(level, plan) : BuildL2Schedule(level, plan);
  schedule.sort((a, b) => (a.turn - b.turn) || (a.id < b.id ? -1 : 1));
  return schedule;
}

// ---------------------------------------------------------------------------
// 简报（把 seed 抽定的路线/配比/时刻写进档案；情报 100% 真实，v1 无假情报）
// ---------------------------------------------------------------------------

const cnNumbers = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六"];

export function BuildBriefing(level, plan) {
  const safe = plan || {};
  if (level.id === "L1") {
    const approach = level.approaches[(safe.axis || 0) % level.approaches.length];
    const mix = level.mixes[(safe.mix || 0) % level.mixes.length];
    const loop = level.scoutLoops[(safe.scoutDir || 0) % level.scoutLoops.length];
    const arrive = safe.arriveTurn || level.mainTurnBase;
    const sapper = safe.sapperTurn || (arrive + level.sapperDelay);
    return level.briefing.map((line) => line
      .replace("{SCOUT}", `自${loop.entry === l1EntryNorth ? "大车路" : "南土路"}入境，${loop.name}`)
      .replace("{MIX}", mix.name)
      .replace("{ARRIVE}", cnNumbers[arrive] || String(arrive))
      .replace("{AXIS}", approach.brief)
      .replace("{SAPPER}", `约第${cnNumbers[sapper] || sapper}日，${approach.sapperBrief}`));
  }
  return level.briefing.map((line) => line
    .replace("{MAIN}", safe.mainEntry === l2EntrySouth ? "南路（石槽村方向）" : "北路（过桥方向）")
    .replace("{MAINVILLAGE}", safe.targetAssign ? ({ v1: "枣林庄", v2: "柳条峪", v3: "石槽村" })[safe.targetAssign.main] : "枣林庄"));
}
