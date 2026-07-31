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
//   ① 入境轴线 9 选 1：大车路 / 绕树林 / 南土路 / 穿农田 / 浅滩涉水 / 双路三式 / 重兵压坟地
//   ② 主力到达回合 T5±2（4~7）
//   ③ 伪军:日军配比 3 档（日重 / 参半 / 伪重——日军少则搜索弱，伪军多则人头多）
//   ④ 斥候绕向 6 选 1（北环 / 南环 / 直趋村口 / 沿河 / 先扑坟地 / 沿青纱帐）
//   ⑤ 报复队变体 2 选 1（报复队烧房 / 追剿队撬口）——只有你打死了人才会出现
// R1 的教训：这些全是「地形与兵力预算恒定」下的排班变化，不是随机难度；
// 开局简报把抽中的每一项都写明，玩家读完简报就该知道该把伏点摆哪儿、要不要破桥。
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

// 进村的几条固定走法（供路点使用；地形恒定，seed 只在这些走法之间选）
const l1NorthRoad = AL([[8, 2], [5, 1], [4, 2]]);            // 大车路直插村北
const l1NorthWoods = AL([[8, 2], [5, 1], [3, 0], [3, 1]]);   // 先钻树林再压下来（回避坟地伏击位）
const l1SouthLaneWay = AL([[9, 7], [6, 7], [4, 5], [3, 4]]); // 南土路绕河尾摸村南
const l1SouthFields = AL([[9, 7], [6, 7], [5, 4], [4, 3]]);  // 南土路半途拐进农田，从坟地边上过
const l1FordWay = AL([[8, 2], [8, 4], [7, 4], [5, 4], [4, 3]]); // 走浅滩涉水（不走桥，破桥也拦不住）

/**
 * 主力入境轴线（seed 白名单 ①，9 选 1）。take = 从配比表里取哪几个单位组成本纵队。
 * 每条轴线要面对的伏击地形不同：大车路两侧是农田与树林；南土路要贴着坟地过；
 * 浅滩一路全程开阔——玩家据简报就能预判该把伏点摆在哪、该不该破桥。
 */
const l1Approaches = [
  { id: "northRoad", name: "北路 · 大车路直进", brief: "沿大车路过石桥，自村北压来",
    sapperEntry: l1EntrySouth, sapperWay: l1SouthLaneWay, sapperBrief: "工兵组另走南土路摸上来",
    columns: [{ suffix: "N", entry: l1EntryNorth, take: [0, 1, 2, 3], waypoints: l1NorthRoad }] },
  { id: "northWoods", name: "北路 · 绕树林", brief: "过石桥后北折钻树林，绕开坟地一侧再压向村北",
    sapperEntry: l1EntryNorth, sapperWay: l1NorthRoad, sapperBrief: "工兵组随后自大车路跟进",
    columns: [{ suffix: "N", entry: l1EntryNorth, take: [0, 1, 2, 3], waypoints: l1NorthWoods }] },
  { id: "southLane", name: "南路 · 土路绕河尾", brief: "绕过河尾走南土路，自村南摸来",
    sapperEntry: l1EntryNorth, sapperWay: l1NorthRoad, sapperBrief: "工兵组随后自大车路跟进",
    columns: [{ suffix: "S", entry: l1EntrySouth, take: [0, 1, 2, 3], waypoints: l1SouthLaneWay }] },
  { id: "southFields", name: "南路 · 穿农田", brief: "南土路半途下路，穿青纱帐贴坟地进村",
    sapperEntry: l1EntrySouth, sapperWay: l1SouthLaneWay, sapperBrief: "工兵组跟在南路一股之后",
    columns: [{ suffix: "S", entry: l1EntrySouth, take: [0, 1, 2, 3], waypoints: l1SouthFields }] },
  { id: "ford", name: "浅滩 · 涉水而来", brief: "不走石桥，自河下游浅滩涉水，横穿开阔地进村",
    sapperEntry: l1EntryNorth, sapperWay: l1FordWay, sapperBrief: "工兵组也走浅滩跟进",
    columns: [{ suffix: "F", entry: l1EntryNorth, take: [0, 1, 2, 3], waypoints: l1FordWay }] },
  { id: "dual", name: "双路 · 分进合击", brief: "分成两股，一股走大车路，一股绕南土路，两面夹村",
    sapperEntry: l1EntryNorth, sapperWay: l1NorthRoad, sapperBrief: "工兵组跟在北路一股之后",
    columns: [
      { suffix: "N", entry: l1EntryNorth, take: [0, 2], waypoints: l1NorthRoad },
      { suffix: "S", entry: l1EntrySouth, take: [1, 3], waypoints: l1SouthLaneWay },
    ] },
  { id: "dualWoods", name: "双路 · 北绕树林", brief: "两股分进：北股钻树林压村北，南股走土路兜村南",
    sapperEntry: l1EntrySouth, sapperWay: l1SouthLaneWay, sapperBrief: "工兵组跟在南路一股之后",
    columns: [
      { suffix: "N", entry: l1EntryNorth, take: [0, 2], waypoints: l1NorthWoods },
      { suffix: "S", entry: l1EntrySouth, take: [1, 3], waypoints: l1SouthLaneWay },
    ] },
  { id: "dualFord", name: "双路 · 一股涉浅滩", brief: "一股照走大车路，一股自浅滩涉水横插村东——破桥拦不住这一路",
    sapperEntry: l1EntryNorth, sapperWay: l1FordWay, sapperBrief: "工兵组随涉水一股跟进",
    columns: [
      { suffix: "N", entry: l1EntryNorth, take: [0, 2], waypoints: l1NorthRoad },
      { suffix: "F", entry: l1EntryNorth, take: [1, 3], waypoints: l1FordWay },
    ] },
  { id: "southHeavy", name: "南路 · 重兵压坟地", brief: "全队走南土路，展开在坟地一侧慢慢往村里挤",
    sapperEntry: l1EntryNorth, sapperWay: l1NorthRoad, sapperBrief: "工兵组随后自大车路跟进",
    columns: [{ suffix: "S", entry: l1EntrySouth, take: [0, 1, 2, 3],
      waypoints: AL([[9, 7], [6, 7], [5, 6], [3, 4], [2, 3]]) }] },
];

/**
 * 伪军:日军配比（seed 白名单 ③，3 档）。总兵力预算不变，变的是构成：
 * 日军班搜索力 2、攻 2、HP 4；伪军队搜索力 1 且「1 格内无日军班则为 0」、攻 1、HP 3。
 * 日军重 = 搜得狠、打得疼、人少好歼；伪军重 = 人多难清、但搜索力被督战规则卡死。
 */
// 三档写死在这里，简报会把抽中的那一档原文念出来，玩家开局就知道自己面对的是谁。
const l1Mixes = [
  { id: "heavy", name: "日军重（两班日军 + 一队伪军）", units: ["inf", "inf", "puppet"] },
  { id: "even", name: "参半（一班日军 + 两队伪军）", units: ["inf", "puppet", "puppet"] },
  { id: "light", name: "伪军重（一班日军 + 三队伪军）", units: ["inf", "puppet", "puppet", "puppet"] },
];

/** 斥候绕向（seed 白名单 ④，6 选 1）：它先探哪一侧，哪一侧的痕迹就先值钱。 */
const l1ScoutLoops = [
  { id: "northLoop", name: "北环（先探树林一侧）", entry: l1EntryNorth,
    waypoints: AL([[8, 2], [5, 1], [3, 0], [2, 1], [2, 3], [3, 4], [5, 3], [6, 2]]) },
  { id: "southLoop", name: "南环（先探坟地一侧）", entry: l1EntrySouth,
    waypoints: AL([[8, 7], [5, 6], [3, 4], [2, 3], [2, 1], [3, 0], [5, 1], [6, 2]]) },
  { id: "villageLoop", name: "直趋村口（不绕，先看粮囤）", entry: l1EntryNorth,
    waypoints: AL([[8, 2], [5, 2], [4, 2], [3, 3], [2, 3], [5, 3], [8, 2]]) },
  { id: "riverLoop", name: "沿河南下（先看浅滩与南土路）", entry: l1EntryNorth,
    waypoints: AL([[8, 2], [8, 4], [7, 4], [6, 5], [5, 6], [3, 4], [4, 2]]) },
  { id: "graveLoop", name: "先扑坟地（专挑经典伏击位翻）", entry: l1EntrySouth,
    waypoints: AL([[8, 7], [5, 6], [3, 4], [2, 3], [2, 4], [3, 3], [5, 3], [8, 2]]) },
  { id: "farmLoop", name: "沿青纱帐（贴农田摸到村西）", entry: l1EntrySouth,
    waypoints: AL([[8, 7], [6, 7], [5, 4], [4, 4], [2, 3], [1, 3], [2, 1], [5, 1]]) },
];

/**
 * L1 报复队变体（seed 白名单 ⑤）：征粮队伤亡 ≥2 才会来。
 * 「报复队」冲村烧房，「追剿队」直奔已暴露的地道口——两者都只进代价簿，绝不给玩家任何东西。
 */
const l1RevengeVariants = [
  { id: "w1revenge", name: "报复队", casualtiesNeed: 2, units: ["inf", "inf"], role: "mobile",
    entry: l1EntryNorth, exit: l1EntryNorth, target: "v1", burnCount: 1,
    telegraph: "内线电报：据点点了两个班要来报复，明日进庄烧房" },
  { id: "w1revenge", name: "追剿队", casualtiesNeed: 2, units: ["inf", "sapper"], role: "sapper",
    entry: l1EntrySouth, exit: l1EntrySouth, target: "v1", burnCount: 0,
    telegraph: "内线电报：敌调一个班带工兵来追剿，明日自南土路进境，直奔已露头的地道口" },
];

/** 地标：地图上值得写进档案的固定地物（坐标 + 一句为什么重要）。DeriveView 原样透出给界面/CLI。 */
// 每条都写坐标 + 一句「为什么重要」；DeriveView 原样透出，界面与 CLI 都不必再自己解释地图。
const l1Landmarks = [
  { key: A(7, 2), name: "石桥", note: "大车路唯一的桥。可破（4 进度），破后敌须走浅滩或南土路，约迟两回合" },
  { key: A(7, 4), name: "浅滩", note: "河沟唯一可涉处，不通车、不可破——破了桥也堵不死这条路" },
  { key: A(2, 3), name: "坟地", note: "有掩护、可隐蔽的经典伏击位，紧贴村南" },
  { key: A(2, 0), name: "北树林", note: "阻挡视线的掩蔽地，北路必经之侧" },
  { key: A(3, 2), name: "枣林庄村口", note: "起始地道格与唯一地道口所在；粮囤在此" },
  { key: A(10, 2), name: "北路入境口", note: "大车路东端，敌自此入境也自此收队；路上有 6 格算敌补给线" },
  { key: A(10, 7), name: "南路入境口", note: "南土路东端，绕河尾进村；破这条路同样扣敌行动力池" },
  { key: A(5, 2), name: "村东路口", note: "离村最近的补给线路格，破路最省脚力的一处" },
  { key: A(5, 4), name: "南面青纱帐", note: "可隐蔽但不减伤：适合藏、不适合硬顶" },
  { key: A(3, 3), name: "村南田埂", note: "南路进村的最后一格，南土路诸式必经" },
  { key: A(3, 1), name: "村北田埂", note: "北路进村的最后一格；起始地道口就在它旁边" },
];

/** 经典伏击位速查（地形已定，写清楚省得玩家一格格试）。 */
const l1AmbushSpots = [
  { key: A(2, 3), note: "坟地：可隐蔽 + 有掩护，南路与南土路都要从旁边过" },
  { key: A(2, 0), note: "北树林：可隐蔽 + 有掩护 + 挡视线，北路绕树林那几式必经" },
  { key: A(3, 0), note: "村北树林：守大车路进村的最后一段" },
  { key: A(4, 3), note: "村南农田：可隐蔽但无掩护——打完要立刻走" },
];

/** 敌情时间线：按回合投放的档案式内线电报（情报 100% 真实，只报已定的事）。 */
// 时间线只报「已定之事」（§2.10 情报 100% 真实，v1 无假情报），不含推测与恐吓。
const l1IntelTimeline = [
  { turn: 1, text: "内线：据点昨夜点验车辆，征粮队定于近日出动" },
  { turn: 2, text: "内线：伪军斥候一队今晨领了干粮，明日出据点" },
  { turn: 3, text: "内线：敌已出据点——自本日起，村里凡还摆在明处的粮，每日要被搜走两担" },
  { turn: 4, text: "内线：征粮队车马已备，随后即到" },
  { turn: 5, text: "内线：敌记事簿上按「暴露」排队撬口——豆子满四个的口，随时会被封、被烟、被炸" },
  { turn: 6, text: "内线：敌工兵组携风箱柴堆与炸药随队而来，专对付地道口" },
  { turn: 7, text: "内线：村里若已无粮可征，敌就要开始抓丁了——群众得进藏人室" },
  { turn: 8, text: "内线：敌押运队在据点等车，扫荡不会拖过第十日" },
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
  // seed 白名单（地形与兵力预算恒定，变的只是「怎么来、什么时候来、谁来」）：
  // 9 轴线 × 3 配比 × 5 到达时刻 × 6 斥候绕向 × 2 报复队变体 = 1620 种排班，
  // 每一种都能从开局简报里读全——情报 100% 真实，没有假情报。
  seedDraws: [
    { key: "axis", count: 9, note: "入境轴线 9 选 1：大车路/绕树林/南土路/穿农田/浅滩/双路三式/重兵压坟地" },
    { key: "mix", count: 3, note: "伪军:日军配比 3 档" },
    { key: "arrive", count: 5, note: "主力到达回合 T5±2" },
    { key: "scoutDir", count: 6, note: "斥候绕向 6 选 1" },
    { key: "revenge", count: 2, note: "报复队/追剿队（仅在征粮队伤亡 ≥2 时出场）" },
  ],
  approaches: l1Approaches,
  mixes: l1Mixes,
  scoutLoops: l1ScoutLoops,
  revengeVariants: l1RevengeVariants,
  landmarks: l1Landmarks,           // 地标（DeriveView → view.landmarks，带坐标与「为什么重要」）
  ambushSpots: l1AmbushSpots,       // 经典伏击位速查（DeriveView → view.ambushSpots）
  intelTimeline: l1IntelTimeline,   // 按回合投放的内线电报（DeriveView → view.telegraphs）
  // 反地道四选一的偏好顺序（按序取首个满足项；数据驱动，改这里就改敌人的性格）
  opPriority: ["smoke", "blast", "breach", "seal"],
  // 纵队任务卡：每种角色到底来干什么、干得多狠（数值在这里改，规则脚本只负责执行）。
  // 缺省项一律回落到 Data_Rules 的 CFG，所以这里只写「本关跟通用规则不一样」的部分。
  roleProfiles: {
    scout: { note: "侦察：不征粮不作业，只用搜索力翻痕迹与明存粮；挂彩即回撤报信" },
    march: { note: "征粮：进村征粮 2 担/回合，装满 seizeGoal 即押运回据点；无粮可征则抓丁" },
    sapper: { note: "反地道：主动奔向暴露最高的口，烟攻/爆破二选一；烟具耗尽后只能上炸药" },
    mobile: { note: "机动：只被置信 2 目击拉动，响应半径 6，邻接即攻击" },
  },
  // 波次时钟（本关口径）：池 14、无自动衰减；
  // 敌摸到村边却一无所获 → 每支纵队 -1（每回合至多 -2）；我方伏击/破路/逼作业/打退攻入另计（每回合上限 5）。
  // 也就是说：把粮藏净、把人藏好、把口掩住，敌人自己就待不住——这是地道战本身的胜利，不是白送。
  // 阶段表：玩家永远知道自己处在哪一段、这一段该干什么（DeriveView 按当前回合选一条透出）
  phases: [
    { from: 1, to: 2, name: "平静期 · 备战", note: "唯一能安心动土的两回合：修储粮洞、把地道挖到粮囤脚下、把粮和人转下去" },
    { from: 3, to: 4, name: "扫荡期 · 斥候", note: "斥候在翻痕迹与明存粮；这两回合还来得及掩土、破路、占伏点" },
    { from: 5, to: 7, name: "扫荡期 · 征粮队", note: "主力进村征粮、抓丁；守洞、伏击、逼他扑空——池就是从这里开始掉的" },
    { from: 8, to: 10, name: "扫荡期 · 收尾", note: "工兵组在撬口，报复队可能进庄；护住最后的口，撑到他收队" },
  ],
  // 开局清单：第一回合到底先做什么（盲审说 README 漏了最重要的约束，这里逐条摆明）
  // 注意这四步一共要 6 个单位回合，而平静期只有 4 个单位 × 2 回合 = 8 个——预算是紧的，这是设计。
  openingChecklist: [
    "① 先在起始地道格上 DigFacility storage——没有储粮洞，粮一担也藏不下去",
    "② 民兵下地把地道挖到另一个村格底下（村庄段只要 1 进度），第二个储粮洞也要在平静期修出来",
    "③ 联络员去看敌人从哪条轴来（简报已写明），顺手记下补给线上可破的路格",
    "④ 平静期结束前把 14 担粮和 4 批群众全转入地下——这是「扑空衰减」的全部本钱",
  ],
  // 常见死法（都是盲审与实测里真出现过的）
  pitfalls: [
    "只挖不掩土：暴露豆全程累计，到 4 豆敌就来撬口，封堵/烟攻/爆破接踵而至",
    "三个人堆一格轮流伏击：同格只容一处伏点，连设两回合只伤 1，还会被敌记住绕行",
    "把人闷在洞里：憋满 3 回合一定上地面，地面有敌 = 群众当场被抓进代价簿",
    "粮留在明处：敌到村边每回合搜走 2 担，十回合足够把 14 担搜光——终局只认洞存粮",
    "把所有口都封死自保：分区一旦无风，三回合后全员被顶到地面，正好撞在敌人枪口上",
    "民兵在开阔地设伏后不撤：伏击打完转「暴露」，开阔地没有掩护，还击一枪就是两点伤",
    "为了缴弹药硬打：一个日军班要两枪才倒，只缴回一发——每打一次都在净亏，弹药是一次性的",
  ],
  // 三条明路（都能赢，代价不同；写进本关要点，供界面与 CLI 原样透出）
  // 三条明路（都能赢，代价不同；供界面与 CLI 原样透出，不写成唯一解）
  tactics: [
    "备战流：两回合内把 14 担粮全转入地下（需两个储粮洞），再把群众转进藏人室——敌扑空，池自己会掉",
    "周旋流：主力到达前破掉大车路上的 2~3 处补给线路格（每处 -2 池），甚至破石桥逼他绕浅滩，迟到两回合",
    "袭扰流：坟地/树林各摆一个伏点（同格只容一处），打完就换地方——同一格连设两回合只伤 1，还会被敌记住绕行",
    "守口流：把一个民兵放在地道口正下方，敌一旦宣布攻入就会撞上守洞火力——他折一个班，池掉七点，口还保住了",
    "换口流：口一旦被盯上（≥4 豆）就自毁封口另开新口——代价是 2 进度加新口自带的 2 豆，但能把敌的作业彻底扑空",
  ],
  // 我方编成：谁能干什么，一行讲清（盲审说「民兵在开阔地几乎瘫痪」，先从说明白开始）
  // 我方编成速查（DeriveView → view.roster）
  roster: [
    "民兵组 ×2（HP3 攻2 MP2 挖2）：挖掘与伏击主力；不能野战对射，但可在任何可挖地形挖散兵坑设伏",
    "游击班 ×1（HP4 攻2 MP3 挖1）：唯一能野战攻击的单位，同格敌人也打得着；挖不动散兵坑",
    "联络员 ×1（HP2 攻0 MP4 视野3）：侦察与佯动，挖掘力 0；被它看见的敌纵队会显示意图箭头",
  ],
  // 评级口径（三勋记制；歼敌不计分，只影响敌行动力池）
  // 评级口径（DeriveView → view.gradeNotes；账本禁绿/金/加号，这里也只讲规则不讲奖励）
  gradeNotes: [
    "胜 + 3 枚勋记 = 甲；2 枚 = 乙；≤1 枚 = 丙；败 = 丁（败则三枚一律不计）",
    "歼敌不是计分项：它只让敌行动力池掉得快，从而把敌人提前赶走",
  ],
  // 目标行（人话版胜负条件；界面顶栏与 CLI 目标行直接取这几行）
  // 目标行三句话：一句及格线、一句底线、一句勋记；顶栏常显，避免「打完不知道自己在干嘛」
  objectives: [
    "守住：终局洞存粮 ≥10 担（明存粮不算——敌到村边后每回合搜走 2 担）",
    "守住：至少还剩 1 支战斗单位（民兵组/游击班）",
    "争取：洞存粮 ≥14 担 · 群众房屋无损且无阵亡 · 把敌逼退（或被夺 ≤4 担）——三枚勋记",
  ],
  // 代价簿会怎么动（四栏各写清楚触发条件，省得玩家以为它是死的）
  // 代价簿说明（四栏各写清楚触发条件与反制；这四行直接回答「为什么它一直是 0」）
  ledgerNotes: [
    "粮食被夺：敌到村 2 格内每回合搜走 2 担；敌纵队进村征粮再算 2 担/回合",
    "群众被抓：村里粮已净空而人还在地面时，敌每回合抓丁 1 批；被烟憋出洞口而地面有敌，也当场被抓",
    "房屋被焚：只有报复队会烧——它在你打死征粮队 2 个人之后才来（打不打是你的选择）",
    "群众罹难：只有爆破塌方压住藏人室，或彻底无路可出时才会发生（烟本身不杀人，只把人逼上地面）",
  ],
  // 设施速查（挖在地道格上，一格只能修一种；这张表回答「先修哪个」）
  facilityNotes: [
    "储粮洞：藏粮上限 8 担——L1 全村 14 担，注定要修两个",
    "藏人室：群众/伤员合计 6 批；被爆破压住就是整间进代价簿，分开修更稳",
    "通风口：等效隐蔽 2（阈值 6 豆），能保住气区不憋闷；数量够多还能逼敌工兵放弃烟攻",
    "枪眼：地下单位可打本格与相邻地表的敌人（按伏击结算），但开火后该开口立即变已知",
    "隔断门（挖在边上，1 进度）：关上挡烟、切气区；也让远处动土不再连累近处的口",
  ],
  // 敌单位速查（本关会出场的四种，怎么对付写在这里，不必去翻规则）
  counterNotes: [
    "日军班 HP4 攻2 搜2：一次伏击 3 伤打不死，残兵会回撤报信——要么两处伏点接力，要么放它走",
    "伪军队 HP3 攻1 搜1：1 格内没有日军班时搜索力为 0，先打日军班能让整队瞎掉",
    "工兵班 HP3 攻1：唯一能烟攻/爆破的单位，专找暴露豆最高的口——它是最值得打的目标",
    "特务 HP2 搜3：未现形前不可攻击；与我方相邻或它执行搜索即现形（L1 不出场）",
  ],
  // 敌军编成（简报「敌情」段由此生成，写的就是排班表里真会发生的事）
  orderOfBattle: [
    "斥候：伪军一队，第三日入境绕村侦察，专找挖掘痕迹与明存粮",
    "征粮队：按配比 3~4 队，进村征粮 2 担/回合，装满 8 担即押运回据点",
    "工兵组：工兵一班，紧随主力，携烟具一副与炸药，专撬暴露豆最高的地道口",
    "报复队/追剿队：仅在征粮队伤亡 ≥2 时出场（打不打，是玩家自己的选择）",
  ],
  // 本关要点：只写规则，不写攻略；界面/CLI 原样透出，避免「README 漏掉最重要的约束」重演。
  // 本关要点（DeriveView → view.digest → 界面/CLI 原样透出；只写规则，不写攻略）
  digest: [
    "每个单位每回合只能用 1 个「主动作」（移动另算 MP，开关隔断门免费）。",
    "地道口要在地下用 DigEntrance 自己开；一格地道只能修一种设施；联络员挖不动土。",
    "地道段成本 2 进度（挖向村庄格只要 1）；民兵挖 2/回合、游击 1/回合；同一工地同回合只容一人施工。",
    "游击班可以攻击**同格**的敌人；民兵不能野战对射，但能在任何可挖地形挖散兵坑设伏。",
    "石桥可破（4 进度）：破了敌得走浅滩或南土路，约迟两回合；补给线上每破一处，敌行动力池 -2。",
    "藏粮要求：本村格**正下方**有地道格，且与还装得下的储粮洞连通。",
    "动土必留声：每挖通一段/修成一处设施 → 本气区各口暴露 +1；开新口 → 该口 +2。",
    "掩土一次 -2 豆，但每人每役只有 3 次；暴露豆 ≥4 敌就会来撬这个口。",
    "同一格同时只容 1 个人设伏；伏击是持续状态，打完转「暴露」会挨还击；",
    "连着两回合在同一格设伏 → 只伤 1，且该格被敌记住（绕行 2 回合）。",
    "憋闷满 3 回合一定上地面：有口从口出，没口就地刨出——地道不是保险箱。",
    "胜负只认洞存粮：明存粮在敌到村边后每回合被搜走 2 担。",
  ],
  mainTurnBase: 5,
  mainTurnRange: [4, 7],
  scoutTurn: 3,
  sapperDelay: 1,                 // 工兵组紧跟主力一回合入境（不早于 T5，不晚于 T7；再晚就赶不上动手）
  sapperTurnRange: [5, 7],
  // 征粮队伤亡 ≥2 → 次回合报复队/追剿队进场（具体哪一支由 seed 抽定，见 revengeVariants）。
  revengeWatch: "w1grain",
  // R2 P0-6a：胜利线从「总存粮 ≥8」改成「洞存粮 ≥10」——明存粮扫荡期每回合被搜走 2 担，
  // 零地道流（不挖不藏）连及格线都够不着。
  victory: { tunnelGrainAtLeast: 10, combatUnitsAtLeast: 1 },
  medals: [
    { key: "grain14", name: "仓廪", text: "洞中存粮不少于十四担",
      need: { tunnelGrain: 14 },
      hint: "全村 12 担加平静期两担新粮，一担不丢地全转入地下——一个储粮洞只装 8 担，得修两个" },
    { key: "zeroCost", name: "无恙", text: "群众一批未失、房屋一处未焚，且无一战斗单位阵亡",
      need: { civLedgerAtMost: 0, housesBurnedAtMost: 0, alliesLostAtMost: 0 },
      hint: "粮藏净之后敌人会改抓丁：得先把群众转进藏人室；打死人会招来报复队烧房，动手要算清楚" },
    { key: "expelOrLow", name: "周旋", text: "敌被逼退，或粮秣被夺不超过四担",
      anyOf: { expelled: true, grainSeizedAtMost: 4 },
      hint: "行动力池 14 点：破路每处 -2、歼日军班 -3、打退攻入 -7；或者干脆抢在敌到村边前把明粮清空" },
  ],
  // 失败教训：按没达成的那条给一句归因（终局与复盘共用，不写攻略只讲规则）
  defeatHints: {
    tunnelGrainAtLeast: "明存粮在敌到村边后每回合被搜走 2 担——粮不入洞就等于没有；先修储粮洞，再把地道挖到粮囤脚底下",
    combatUnitsAtLeast: "战斗单位打光就没人挖、没人守、没人伏了；民兵在开阔地会挨枪，伏击后要记得撤",
  },
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
  { id: "v1", name: "枣林庄", hexKeys: AL([[2, 3], [3, 3], [2, 4], [3, 4]]), pop: 6, grainOpen: 8, organize: 1, hasHq: true,
    note: "区队部与伤员所在；起始 3 格地道 2 口，组织度 1（平静期自动藏粮）" },
  { id: "v2", name: "柳条峪", hexKeys: AL([[8, 0], [9, 0], [8, 1]]), pop: 5, grainOpen: 12, organize: 0, hasHq: false,
    note: "余粮最多、离主干最远、开局无地道——救不救它是本关第一个战略抉择" },
  { id: "v3", name: "石槽村", hexKeys: AL([[3, 6], [4, 6]]), pop: 3, grainOpen: 0, organize: 0, hasHq: false,
    note: "武库，无明存粮；与枣林庄贯通即得「长城」勋记，也是南轴的挡箭牌" },
];

/**
 * L2 主力编成 3 档（与 L1 同一套设计语言：总量恒定，构成不同）。
 * 「刺刀」= 四个日军班，搜得狠打得疼；「混编」= 三日一伪，人多一点搜索弱一点；
 * 「督战」= 二日二伪，伪军必须贴着日军才搜得动，玩家可以专打那两个日军班让整队瞎掉。
 */
// 三档同样写死；主攻编成决定了「先打谁能让整队瞎掉」这个战术问题的答案。
const l2MainMixes = [
  { id: "bayonet", name: "刺刀（四个日军班）", units: ["inf", "inf", "inf", "inf"] },
  { id: "mixed", name: "混编（三日军 + 一伪军）", units: ["inf", "inf", "inf", "puppet"] },
  { id: "escort", name: "督战（二日军 + 二伪军）", units: ["inf", "inf", "puppet", "puppet"] },
];

/** 南北两路斥候的巡逻变体（seed 抽定）：它先趟哪一片，哪一片的痕迹与明存粮就先被记下。 */
const l2ScoutRoutes = {
  north: [
    AL([[8, 2], [7, 0], [9, 1], [8, 2]]),
    AL([[8, 2], [6, 1], [7, 0], [9, 0], [8, 2]]),
  ],
  south: [
    AL([[7, 6], [4, 7], [2, 6], [5, 6], [8, 6]]),
    AL([[8, 6], [6, 5], [4, 6], [3, 7], [6, 6]]),
  ],
};

const l2EntryNorth = A(10, 2);
const l2EntrySouth = A(10, 6);

/** 特务路线四选一（seed 白名单）：便衣从哪儿进、贴着谁走，决定它什么时候现形。 */
const l2SpyRoutes = [
  { id: "north", name: "北路便衣（沿柳条峪一线南下）", entry: l2EntryNorth,
    waypoints: AL([[8, 1], [8, 0], [6, 1], [3, 3], [2, 4]]) },
  { id: "south", name: "南路便衣（经石槽村北折）", entry: l2EntrySouth,
    waypoints: AL([[4, 6], [3, 6], [3, 4], [2, 3]]) },
  { id: "mid", name: "中路便衣（自河东腰间插入）", entry: A(10, 4),
    waypoints: AL([[8, 4], [6, 3], [3, 4], [2, 3]]) },
  { id: "wood", name: "林间便衣（贴树林摸区队部）", entry: l2EntrySouth,
    waypoints: AL([[7, 5], [6, 4], [5, 5], [3, 5], [2, 4]]) },
];

/**
 * 主力/助攻的行军路线表（seed 抽定入境口与目标村后，按 `入境口→目标村` 取路线）。
 * 每条都写成真实走法（沿路轴推进 → 下路展开 → 扑村），这样意图箭头与电报才有内容可报，
 * 玩家也才可能预判「他们会从哪一格贴上来」，把伏点与隔断门摆在正确的位置。
 */
const l2Routes = {
  [`${l2EntryNorth}|v1`]: AL([[8, 2], [5, 2], [3, 3]]),
  [`${l2EntryNorth}|v2`]: AL([[9, 2], [9, 1], [8, 1]]),
  [`${l2EntryNorth}|v3`]: AL([[8, 2], [6, 3], [5, 5], [4, 6]]),
  [`${l2EntrySouth}|v1`]: AL([[8, 6], [6, 6], [4, 6], [3, 5], [3, 4]]),
  [`${l2EntrySouth}|v2`]: AL([[8, 6], [8, 4], [8, 2], [8, 1]]),
  [`${l2EntrySouth}|v3`]: AL([[8, 6], [6, 6], [4, 6]]),
};

/** 工兵队路线：从北口沿大车路进来，桥毁则由寻路自行改道（§2.10 明写「桥毁则绕行」）。 */
const l2SapperWay = AL([[8, 2], [6, 2], [5, 2]]);

/** 预备队投放后的推进路线（按投放轴线取）：它是来收拾「打得最狠那条轴」的。 */
const l2ReserveWays = {
  north: AL([[8, 2], [6, 2], [5, 2], [3, 3]]),
  south: AL([[8, 6], [6, 6], [4, 6], [3, 5]]),
};

/** T13 驻剿的目标优先级：先占区队部，其次余粮村，最后武库（区队部被占满 2 回合即我方失利）。 */
const l2GarrisonPriority = ["v1", "v2", "v3"];

/** 地标：三村坐标、区队部、桥、路轴——盲审「区队部不在图上」直接对着这张表补。 */
// L2 的地标多一层作用：区队部的坐标直接绑着即败条件，必须让玩家一眼看到。
const l2Landmarks = [
  { key: A(2, 3), name: "枣林庄 · 区队部", note: "即败条件绑定此处：被驻剿纵队占住 2 回合即告失利" },
  { key: A(8, 0), name: "柳条峪", note: "余粮 12 担，开局无地道——要不要把主干挖过去是本关第一个战略抉择" },
  { key: A(3, 6), name: "石槽村", note: "武库，起始 1 格地道 1 口；与枣林庄贯通即得「长城」勋记" },
  { key: A(4, 2), name: "木桥", note: "北路轴唯一跨河点，可破；破后北路纵队须南绕，工兵队会迟到" },
  { key: A(6, 3), name: "中部坟地", note: "南北两轴之间的掩蔽高地，双向伏击位" },
  { key: A(6, 4), name: "中部树林", note: "阻挡视线，机动队响应时最容易被拦在这里" },
  { key: A(10, 2), name: "北路入境口", note: "主攻/助攻二选一的入口；工兵队固定走这条轴" },
  { key: A(10, 6), name: "南路入境口", note: "另一条主攻口，穿石槽村直逼区队部" },
  { key: A(1, 5), name: "西南坟地", note: "枣林庄西南的掩蔽位，掩护主干向石槽村延伸" },
  { key: A(2, 0), name: "西北树林", note: "北面唯一的成片掩蔽，柳条峪方向的落脚点" },
  { key: A(8, 2), name: "北路轴中段", note: "补给线路格，破这里能同时拖慢主攻与工兵队" },
  { key: A(8, 6), name: "南路轴中段", note: "补给线路格；南轴的伏击与破路都集中在这一带" },
];

/** L2 经典伏击位速查：两条路轴之间的掩蔽带，也是主干延伸时最该护住的几格。 */
const l2AmbushSpots = [
  { key: A(6, 3), note: "中部坟地：南北两轴之间，主力与助攻都可能从旁边过" },
  { key: A(6, 4), note: "中部树林：挡视线，适合在敌合围收拢前先啃一口" },
  { key: A(1, 5), note: "西南坟地：区队部与石槽村之间，护主干的第一伏点" },
  { key: A(7, 1), note: "柳条峪外农田：可隐蔽不减伤，救粮时唯一能设伏的地方" },
];

// L2 的时间线额外承担「解释新机制」的责任：烟、通风口、驻剿、即败条件都在这里点名。
const l2IntelTimeline = [
  { turn: 1, text: "内线：敌各据点昨夜调集车马，合围令已下" },
  { turn: 2, text: "内线：敌已入境——三村凡摆在明处的粮，每日要被搜走一担" },
  { turn: 3, text: "内线：有便衣数人分头入境，见人只问路不答话" },
  { turn: 5, text: "内线：主力明日出动，先扑{MAINVILLAGE}" },
  { turn: 6, text: "内线：敌按「暴露」排队撬口——豆子满四个的口，封堵、烟攻、爆破、强攻都可能落到它头上" },
  { turn: 8, text: "内线：敌工兵队携烟具两副北上，桥毁则绕行" },
  { turn: 9, text: "内线：气区通风口少于地道格三分之一时，工兵一定先用烟；修够通风口，他只能改用炸药" },
  { turn: 10, text: "内线：敌若在哪条轴上折了两个班以上，预备队就投向哪条轴" },
  { turn: 12, text: "内线：第十三日是节点——占住村子就转驻剿搜毁，没得手就沿大路收队" },
  { turn: 14, text: "内线：驻剿队每日烧房、抓丁、搜格；区队部被驻占满两回合即告失利" },
];

const l2 = {
  id: "L2",
  name: "合围",
  maxTurns: 16,
  sweepStartTurn: 2,
  hardEndTurn: 16,
  pool: 24,
  decay: 0,                      // 同 L1：取消白送衰减，池只由「扑空」与我方袭扰推动
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
  // seed 白名单：2 主攻口 × 4 目标指派 × 3 主力编成 × 4 特务路线 × 2×2 斥候巡逻 ×
  // 4 处时刻抖动（各 3 档）= 三万余种排班；地形、兵力预算、阶段节点恒定。
  seedDraws: [
    { key: "mainEntry", count: 2, note: "主攻口 E1/E2" },
    { key: "spyRoute", count: 4, note: "特务路线 4 选 1" },
    { key: "targetAssign", count: 4, note: "主攻/助攻的目标村指派（区队部必在其列）" },
    { key: "mainMix", count: 3, note: "主力编成 3 档：刺刀/混编/督战" },
    { key: "scoutNRoute", count: 2, note: "北路斥候巡逻变体" },
    { key: "scoutSRoute", count: 2, note: "南路斥候巡逻变体" },
    { key: "spyTurn", count: 3, note: "特务潜入时刻 ±1" },
    { key: "scoutSTurn", count: 3, note: "南路斥候时刻 ±1" },
    { key: "supportTurn", count: 3, note: "助攻时刻 ±1" },
    { key: "sapperTurn", count: 3, note: "工兵队时刻 ±1" },
    { key: "reserveTurn", count: 3, note: "预备队时刻 ±1" },
  ],
  spyRoutes: l2SpyRoutes,
  mainMixes: l2MainMixes,
  scoutRoutes: l2ScoutRoutes,
  routes: l2Routes,
  sapperWay: l2SapperWay,
  reserveWays: l2ReserveWays,
  garrisonPriority: l2GarrisonPriority,
  landmarks: l2Landmarks,           // 地标：三村坐标 + 区队部 + 桥 + 两条路轴
  ambushSpots: l2AmbushSpots,       // 经典伏击位：两轴之间的掩蔽带与主干沿线
  intelTimeline: l2IntelTimeline,   // 按回合投放的内线电报（DeriveView → view.telegraphs）
  opPriority: ["smoke", "blast", "breach", "seal"],
  roleProfiles: {
    scout: { note: "侦察：两路各一队，专趟痕迹与明存粮；挂彩即回撤报信" },
    spy: { note: "便衣：搜索力 3，未现形前不可被攻击；与我方相邻或执行搜索即现形" },
    march: { note: "主攻/助攻：不设征粮上限，占住村子就不走；T13 判定时占村者转驻剿" },
    sapper: { note: "工兵队：烟具两副，优先烟攻（气区通风口不足时），其后爆破" },
    mobile: { note: "预备队：只在某条轴线折损 ≥2 个班时才投放到那条轴" },
  },
  // 波次时钟（本关口径）：池 24、无自动衰减；扑空衰减与 L1 同口径（每回合至多 -2）。
  // 三村铺开，敌纵队多，扑空衰减触发得快——但只要还有一处明存粮或没藏好的群众，他们就有事干、就不走。
  phases: [
    { from: 1, to: 1, name: "平静期 · 备战", note: "只有一回合：先定「救不救柳条峪」，这决定你这一局的主干往哪儿挖" },
    { from: 2, to: 5, name: "渗透期", note: "斥候两路 + 便衣特务；痕迹与明存粮正在被记账，掩土与转移都趁现在" },
    { from: 6, to: 8, name: "合围期", note: "主攻与助攻先后压上；守洞打退攻入是全 Demo 单笔收益最高的一手（-7 池）" },
    { from: 9, to: 12, name: "工兵与预备队", note: "工兵队奔暴露最高的口而来；打得最狠的那条轴会招来预备队" },
    { from: 13, to: 16, name: "判定与收尾", note: "T13 占村者转驻剿（烧房抓丁）；区队部被占满两回合即败" },
  ],
  // 开局清单：L2 的平静期只有一回合，第一手决定这一局的形状
  openingChecklist: [
    "① 枣林庄脚下三格地道已通，先修满一个储粮洞把 8 担粮转下去",
    "② 决定主干方向：向南接石槽村（勋记「长城」+ 伤员双向躲爆破），还是向东北奔柳条峪的 12 担粮",
    "③ 伤员 4 批只能经地道转移，藏人室要在 T6 主力到达前修好",
    "④ 修一个通风口——通风口够多，敌工兵的烟就用不上，只能改上炸药",
  ],
  pitfalls: [
    "主干只有一条线：一次爆破断段，「长城」勋记与伤员转移路线一起没了——修隔断门、留备用段",
    "藏人室塞满一间：爆破一炸就是整间进代价簿；容量 6 批，分两间放",
    "为了柳条峪把人都派出去：主力 T6 就到，区队部无人驻守时攻入必得手",
    "打得太狠：预备队会投向你杀伤最高的那条轴——歼敌不是计分项，逼退才是",
  ],
  tactics: [
    "主干流：先把枣林庄—石槽村主干打通（勋记「长城」），伤员靠这条线在两头藏人室之间躲爆破",
    "远征流：赌一条通往柳条峪的长主干，把 12 担粮抢回地下（勋记「仓廪」），代价是暴露豆与工期",
    "阻援流：破木桥 + 破南北补给线，让主攻与助攻不能同时到位，逐个吃掉——但预备队会投向你打得最狠的那条轴",
    "通风流：每三格地道配一个通风口，敌工兵的烟就派不上用场，只能改用炸药（一次只毁一个口，且自耗 4 点池）",
    "空城流：T13 之前把三村的粮与人全部转入地下，敌占了村也无可剿——判定时他只能沿大路收队",
  ],
  // 我方编成速查：L2 六个单位要同时顾三个村，分兵本身就是一道题
  roster: [
    "民兵组 ×3（HP3 攻2 MP2 挖2）：三条主干全靠它们挖；开阔地可挖散兵坑设伏",
    "游击班 ×2（HP4 攻2 MP3 挖1）：唯一能野战攻击的单位，一支守区队部、一支守石槽村最稳",
    "联络员 ×1（HP2 攻0 MP4 视野3）：三村之间跑情报；逼便衣现形也靠它贴上去",
  ],
  // 评级口径：R2 的重点是让「丢粮丢人丢单位」与「全须全尾」不再同评
  gradeNotes: [
    "胜 + 3 枚勋记 = 甲；2 枚 = 乙；≤1 枚 = 丙；败 = 丁（败则三枚一律不计）",
    "两局都保住了村子，但一局丢了 8 担粮死了一个班——勋记必须分得出这两局，所以三枚各带一条「全须全尾」判据",
  ],
  // 目标行：L2 的底线一句要把「区队部即败」摆在最前，盲审两局打完都没找到区队部在哪
  objectives: [
    "守住：撑到 T16，洞存粮 ≥8 担、存活村 ≥2 处、伤员 ≥3 批、战斗单位 ≥1 支",
    "别丢：区队部（枣林庄）被驻剿纵队占满 2 回合即败；人口损失过半即败",
    "争取：洞存粮 ≥12 担 · 伤员 4/4 且无阵亡 · 主干贯通且群众零损失——三枚勋记",
  ],
  // 代价簿说明：L2 多了驻剿与攻入两条来源，且四栏都会在正常游玩中动起来
  ledgerNotes: [
    "粮食被夺：敌到村 2 格内每回合搜走 1 担；进村征粮另算 2 担/回合；攻入得手则整个储粮洞被搬空",
    "群众被抓：粮净空后抓丁 1 批/回合；T13 之后驻剿队每回合再抓 1 批；攻入得手则藏人室整间被端",
    "房屋被焚：T13 之后驻剿队每回合烧 1 处；一个村的格全烧光就算「村没了」（存活村 <2 即败）",
    "群众罹难：爆破塌方压住藏人室，或彻底无路可出时才会发生",
  ],
  facilityNotes: [
    "储粮洞：8 担/间；枣林庄 8 担一间刚好，柳条峪的 12 担还要再来两间",
    "藏人室：6 批/间；伤员 4 批 + 群众，至少两间，且别修在同一条直线上",
    "通风口：本关唯一能让敌工兵「烟具用不上」的东西——每三格地道配一个",
    "枪眼：守区队部的性价比之王，配合守洞打退攻入",
    "隔断门：烟攻的唯一硬反制；主干上每隔两格来一道，断段也不至于全网瘫痪",
  ],
  counterNotes: [
    "日军班：主攻四队全是它或以它为主，正面打不过——靠伏击、枪眼、守洞打退攻入",
    "伪军队：督战规则同 L1；助攻队里那一队伪军是软肋",
    "工兵班：携烟具两副，通风口修够就逼它改用炸药；打死它 -2 池，且反地道链条直接断",
    "特务：搜索力 3，现形前不可攻击——让联络员贴上去逼它现形，或干脆躲开它的路线",
  ],
  orderOfBattle: [
    "斥候两路：伪军各一队，T2/T4 分自南北大车路入境，绕村侦察",
    "便衣特务：一名，T3 前后潜入；与我方单位相邻或执行搜索即现形，现形前不可攻击",
    "主力：按编成 4 队，T6 自主攻口进逼，先扑指派的主攻村",
    "助攻：三个班，T7 前后自另一路合击，指向另一个村",
    "工兵队：工兵 + 一个班，T9 前后沿北支路跟进，携烟具两副；桥毁则绕行",
    "预备队：两个班，T11 前后投放到我方杀伤最高的那条轴线；两轴皆轻则按兵不出",
    "T13 判定：占住村子 → 转驻剿搜毁（每回合烧房、抓丁、搜格）；未得手 → 沿大路收队",
  ],
  // 本关要点（DeriveView → view.digest；L2 在 L1 基础上多了烟、爆破、驻剿与区队部即败）
  digest: [
    "每个单位每回合只能用 1 个「主动作」（移动另算 MP，开关隔断门免费）。",
    "藏粮要求：本村格**正下方**有地道格且连着储粮洞——柳条峪的 12 担要靠主干挖过去才救得下。",
    "伤员只能在藏人室之间经地道转移；藏人室容量 6 批（群众与伤员合计）。",
    "守洞打退攻入是单笔收益最高的一手：敌折一个班（-3 池）且作业自耗（-4 池），入口还保住了。",
    "木桥可破：北路主攻与工兵队都要绕；但南轴不受影响，别把宝全押在桥上。",
    "动土必留声：每挖通一段/修成一处设施 → 本气区各口暴露 +1；掩土每人每役 3 次。",
    "通风口太少（少于地道格数的三分之一）时，敌工兵优先用烟；修够通风口，它就只能改用炸药。",
    "隔断门能挡烟、也能把气区切小：既保命，也让远处挖土不再连累近处的口。",
    "憋闷满 3 回合一定上地面；被烟逼出地面时，地面有敌 = 群众当场被抓入代价簿。",
    "胜负只认洞存粮（≥8）、存活村（≥2）、伤员（≥3 批）；区队部被驻占 2 回合即败。",
  ],
  // seed 白名单：主攻口 E1/E2 + 目标村指派（主攻/助攻各取其一，区队部必在其列）。
  mainEntryOptions: [l2EntryNorth, l2EntrySouth],
  // 目标村指派：主攻扑一个、助攻扑另一个；区队部（v1）必在其列，石槽村（武库）也可能被盯上。
  targetAssignOptions: [
    { main: "v1", support: "v2" },
    { main: "v2", support: "v1" },
    { main: "v1", support: "v3" },
    { main: "v3", support: "v1" },
  ],
  // 撑到 T16 是隐含前提（终局判定只在波次收束或到时才跑），这里只列可判据的四条。
  // 明存粮扫荡期留不住，所以粮线只认洞存粮：一满仓（8）是及格，两仓（12）才是勋记。
  victory: { villagesAtLeast: 2, tunnelGrainAtLeast: 8, woundedAtLeast: 3, combatUnitsAtLeast: 1 },
  defeat: { hqOccupiedTurns: 2, popRatioBelow: 0.5 },
  // R2：三枚勋记各加一条「全须全尾」判据——丢粮丢人丢单位的一局不该和干干净净的一局同评。
  medals: [
    { key: "grain12", name: "仓廪", text: "洞存粮不少于十二担（一仓装不下，须把地道挖到第二个村的粮囤底下）",
      need: { tunnelGrain: 12 },
      hint: "枣林庄自己只有 8 担；余下的要从柳条峪来——那意味着一条真的挖过去的主干，和随之而来的暴露豆" },
    { key: "wounded", name: "后送", text: "伤员四批全数保全，且无一战斗单位阵亡",
      need: { wounded: 4, alliesLostAtMost: 0 },
      hint: "伤员只能经地道在藏人室之间转移；藏人室容量 6 批（群众与伤员合计），别让爆破逮住同一间" },
    { key: "trunk", name: "长城", text: "枣林庄—石槽村地道主干贯通未毁，且群众一批未失",
      need: { trunkIntact: true, civLedgerAtMost: 0 },
      hint: "主干一旦被爆破断段就补不回来；群众被抓多半发生在「粮已抢光、村里还有人」的那几回合" },
  ],
  defeatHints: {
    tunnelGrainAtLeast: "三个村的明存粮都留不住——先在枣林庄脚下修满一仓，再决定要不要为柳条峪挖那条长主干",
    villagesAtLeast: "村子是被一处处烧掉的：T13 之后敌若占村就转驻剿，每回合烧房抓丁；别让他们站住脚",
    woundedAtLeast: "伤员留在地面等于送人；藏人室与主干要在主力到达（T6）之前修好",
    combatUnitsAtLeast: "战斗单位全灭即败；预备队会投向你杀伤最高的那条轴，打得太狠反而引火烧身",
  },
  briefing: [
    "冀中军区第▲分区 敌情通报（节录）：",
    "敌拟对枣林庄、柳条峪、石槽村一带合围扫荡。先期斥候两路沿南北大车路侦察，另有便衣特务潜入。",
    "主力约第六日自{MAIN}进逼，先扑{MAINVILLAGE}；次日三个班自另一路合击；第九日工兵队携烟具沿北支路跟进，桥毁则绕行。",
    "我方若杀伤甚重，敌将增派预备队投向受创轴线；若两轴皆轻，则不出。",
    "第十三日为节点：敌若已占村，转入驻剿搜毁；未得手，则沿大路收队。",
    "指示：一、柳条峪余粮速转地下——地道须通到粮囤脚底下方可入囤；敌到村二格内，明存粮每日被搜走一担；",
    "      二、伤员四批全数经地道后送；三、区队部与石槽村地道贯通为要；",
    "      四、动土必留声：每挖通一段、每修一处设施，本气区各口暴露 +1；通风口太少，敌工兵必用烟；",
    "      五、相机破路、破桥、伏击，耗其锐气。代价簿照记，群众一批不可轻掷。",
    "指示（续）：六、一格只容一处伏点；打完即暴露、会挨还击；同处连设两回合伤害只剩一分，",
    "         且那块地方敌军自此绕行——伏击要换着地方打。",
    "      七、憋闷满三回合，洞里的人一律上地面；被烟逼出而地面有敌，群众当场被抓。",
    "         隔断门既挡烟又切气区，是本关最便宜的一件工事。",
    "      八、敌翻遍村子一无所获，其行动力池自会消耗——藏得干净，等于在赶他走。",
    "又：区队部即枣林庄，被敌驻剿纵队占满两回合即告失利；此处坐标已随图标出。",
  ],
};

// ---------------------------------------------------------------------------
// 关卡注册表
//
// 两关共用同一套数据契约：地图（rows + road/bridge/ford）、村庄、我方编成、起始地道、
// seedDraws（seed 白名单）、victory/medals（判据写成数据，Script_Turn 只负责求值）、
// briefing/digest/objectives/tactics/pitfalls/landmarks/ambushSpots/roster/counterNotes/
// facilityNotes/ledgerNotes/gradeNotes/phases/openingChecklist/intelTimeline（玩家侧文本，
// 全部经 DeriveView 原样透出，表现层与 CLI 都不再自己编解释）。
// 加新关卡只需要照抄这张表，不必改任何 Script_*。
// ---------------------------------------------------------------------------

export const levelDefinitions = Object.freeze({ L1: l1, L2: l2 });

export function GetLevel(levelId) {
  const level = levelDefinitions[levelId];
  if (!level) throw new Error(`未知关卡：${levelId}`);
  return level;
}

// ---------------------------------------------------------------------------
// 波次排程：把 seed 抽出的下标翻译成完整排班（纯函数，不碰 state，不用随机）
// ---------------------------------------------------------------------------

/** 统一的排班条目形状（Script_EnemyAi 按此消费）。telegraph = 入境前一回合的档案式预告。 */
function WaveEntry(spec) {
  return { id: spec.id, kind: spec.kind, turn: spec.turn, role: spec.role || null,
    entry: spec.entry || null, exit: spec.exit || spec.entry || null, units: (spec.units || []).slice(),
    waypoints: (spec.waypoints || []).slice(), target: spec.target || null,
    telegraph: spec.telegraph || null,
    seizeGoal: spec.seizeGoal || 0, axisKillsNeed: spec.axisKillsNeed || 0, spawned: false };
}

const villageNames = { v1: "枣林庄", v2: "柳条峪", v3: "石槽村" };

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
    entry: loop.entry, exit: loop.entry, units: ["puppet"], waypoints: loop.waypoints,
    telegraph: `内线电报：伪军斥候一队明日自 ${loop.entry} 入境，${loop.name}` })];
  for (const part of approach.columns) {
    const units = part.take.map((index) => mix.units[index]).filter(Boolean);
    if (!units.length) continue;
    schedule.push(WaveEntry({ id: `w1grain${part.suffix}`, kind: "march", turn: arriveTurn, role: "march",
      entry: part.entry, exit: part.entry, units, waypoints: part.waypoints, target: "v1",
      seizeGoal: Math.max(4, Math.round(8 / approach.columns.length)),
      telegraph: `内线电报：征粮队一股（${units.length} 队）明日自 ${part.entry} 入境——${approach.brief}` }));
  }
  // 工兵组：L1 也有烟攻/爆破了——它从另一条轴摸上来，专找暴露豆最高的那个口。
  schedule.push(WaveEntry({ id: "w1sapper", kind: "sapper", turn: sapperTurn, role: "sapper",
    entry: approach.sapperEntry, exit: approach.sapperEntry, units: ["sapper"],
    waypoints: approach.sapperWay, target: "v1",
    telegraph: `内线电报：敌工兵组明日自 ${approach.sapperEntry} 入境，携风箱柴堆与炸药，专找暴露最高的地道口` }));
  return schedule;
}

/** L2 排班：主攻口 / 特务路线 / 目标村指派 + 四处时刻抖动。 */
function BuildL2Schedule(level, plan) {
  const mainEntry = level.mainEntryOptions[(plan.mainEntry || 0) % 2];
  const otherEntry = level.mainEntryOptions.find((key) => key !== mainEntry);
  const assign = level.targetAssignOptions[(plan.targetAssign || 0) % 2];
  const spy = level.spyRoutes[(plan.spyRoute || 0) % level.spyRoutes.length];
  const Jitter = (base, draw) => Math.max(2, base + ((draw || 0) - 1));
  const RouteTo = (entry, village) => (level.routes[`${entry}|${village}`] || []).slice();
  const mainMix = level.mainMixes[(plan.mainMix || 0) % level.mainMixes.length];
  const scoutN = level.scoutRoutes.north[(plan.scoutNRoute || 0) % level.scoutRoutes.north.length];
  const scoutS = level.scoutRoutes.south[(plan.scoutSRoute || 0) % level.scoutRoutes.south.length];
  plan.mainEntry = mainEntry;
  plan.targetAssign = assign;
  plan.spyId = spy.id;
  plan.mainMixId = mainMix.id;
  return [
    WaveEntry({ id: "w2scoutN", kind: "scout", turn: 2, role: "scout", entry: l2EntryNorth,
      units: ["puppet"], waypoints: scoutN,
      telegraph: "内线电报：北路斥候一队明日沿大车路入境，绕柳条峪一圈" }),
    WaveEntry({ id: "w2spy", kind: "spy", turn: Jitter(3, plan.spyTurn), role: "spy",
      entry: spy.entry, exit: l2EntrySouth, units: ["spy"], waypoints: spy.waypoints,
      telegraph: `内线电报：便衣特务明日自 ${spy.entry} 潜入（${spy.name}）——未识破前不可攻击` }),
    WaveEntry({ id: "w2scoutS", kind: "scout", turn: Jitter(4, plan.scoutSTurn), role: "scout",
      entry: l2EntrySouth, units: ["puppet"], waypoints: scoutS,
      telegraph: "内线电报：南路斥候一队明日自南大车路入境，经石槽村一线兜回" }),
    WaveEntry({ id: "w2main", kind: "march", turn: 6, role: "march", entry: mainEntry,
      units: mainMix.units, target: assign.main, waypoints: RouteTo(mainEntry, assign.main),
      telegraph: `内线电报：主力四队（${mainMix.name}）明日自 ${mainEntry} 进逼，先扑${villageNames[assign.main]}` }),
    WaveEntry({ id: "w2support", kind: "march", turn: Jitter(7, plan.supportTurn), role: "march",
      entry: otherEntry, units: ["inf", "inf", "puppet"], target: assign.support,
      waypoints: RouteTo(otherEntry, assign.support),
      telegraph: `内线电报：助攻三个班明日自 ${otherEntry} 合击，指向${villageNames[assign.support]}` }),
    WaveEntry({ id: "w2sapper", kind: "sapper", turn: Jitter(9, plan.sapperTurn), role: "sapper",
      entry: l2EntryNorth, units: ["sapper", "inf"], target: "v1", waypoints: level.sapperWay,
      telegraph: "内线电报：敌工兵队携烟具两副明日沿北支路跟进，桥毁则绕行" }),
    WaveEntry({ id: "w2reserve", kind: "reserve", turn: Jitter(11, plan.reserveTurn), role: "mobile",
      units: ["inf", "inf"], axisKillsNeed: 2,
      telegraph: "内线电报：敌预备队待命——哪条轴上折的班多，明日就投向哪条轴" }),
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
