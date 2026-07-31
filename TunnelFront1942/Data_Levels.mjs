// 《地下长城 · 冀中1942》 —— 五幕战役（A1~A5）关卡定义。
//
// 战役按电影《地道战》的进化线展开：地道从「各家的藏身地窖」一步步变成「一件武器」。
// 每一幕都由**上一幕的失败**推动：先吃亏、再学会。关卡不是难度递增，是**认知递增**——
// 每幕用 `unlocks` 声明本幕开放哪些动作与设施，动作合法性据此过滤。
//
//   A1《单口洞》  三个各自为政的地窖，挖不通、跑不掉——注定要付代价。
//   A2《户户相通》连通挖掘、多口、伪装口、带领群众在地道里转移。
//   A3《能打的地道》射击孔、翻板；打一枪换一个地方。
//   A4《毒烟与水》敌烟/水/挖三手全开；反制来自结构：翻板、拐弯、通气孔、高低双层、隔断门。
//   A5《反扫荡》  三村相连、跨村地道网、群众全员转移、多射击孔协同。
//
// 题材处理：村名一律虚构；只取广为人知的意象（钟声报警、打一枪换一个地方、灶台/水井/炕洞伪装口），
// 不伪造具体台词原文；人物只做功能性角色；打击对象是侵略军队。
// 群众伤亡、被抓、房屋被焚、粮秣被夺只进代价簿，永不转化为资源或分数。
//
// 手工地图（11×9 offset 网格，x 右 y 下），装载时转轴向键；seed 只走白名单（§2.10）。

import { HexKey } from "./Script_Hex.mjs";

/** offset(x,y) → 轴向键。平顶六角，q = x，r = y - floor(x/2)，行在世界坐标里对齐。 */
export function OffsetKey(x, y) {
  return HexKey(x, y - Math.floor(x / 2));
}
const A = OffsetKey;
const AL = (pairs) => pairs.map(([x, y]) => A(x, y));

const terrainByChar = { V: "village", F: "field", W: "woods", G: "grave", R: "river", ".": "open" };

/**
 * 由行字符串 + 道路/桥/浅滩/高程构建 hexes 表。
 * road：大车路与土路（敌全路径在路上时移动减半，可 BreakRoad 破毁）。
 * bridge：跨河可通行点；桥同时是路（可破），浅滩只是可涉水的河（不可破、不减速）。
 * elevRows：可选的高程行（字符 0/1/2；缺省一律 1）。**水只往同高或更低处漫**，这是第四幕的空间信息。
 */
function BuildHexes(rows, roadList, bridgeList, fordList, villages, elevRows) {
  const hexes = {};
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < rows[y].length; x += 1) {
      const elev = elevRows && elevRows[y] && elevRows[y][x] !== undefined ? Number(elevRows[y][x]) : 1;
      hexes[A(x, y)] = { terrain: terrainByChar[rows[y][x]] || "open", road: false, roadBroken: false,
        bridge: false, villageId: null, traces: 0, searched: false, attackSite: false, alertedUntil: 0,
        elev: Number.isFinite(elev) ? elev : 1 };
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

// ===========================================================================
// 高家庄一带（A1~A3 共用同一张图：同一个村子，一幕比一幕会打）
//
// 用同一张图不是省事——是让玩家亲身比较：**同样被搜出，第一幕跑不掉，第二幕跑得掉，第三幕还能还手。**
// ===========================================================================

const gaoRows = [
  "..WW...R...",
  ".FFVVF.R...",
  "..FVVF.R...",   // y2 整行大车路；x7 石桥（可破）
  ".GFFFF.R...",
  "..FFFG.R...",   // y4 x7 浅滩：河沟唯一可涉处
  "...F...R...",
  ".W.........",   // 河沟到此为止；南土路自东南沿 y6 摸过来
  "...........",
  "...........",
];

const gaoSouthLane = [[10, 6], [9, 6], [8, 6], [7, 6], [6, 6], [5, 5], [4, 4], [3, 3]];
const gaoEntryNorth = A(10, 2);
const gaoEntrySouth = A(10, 6);

const gaoVillageHexes = AL([[3, 1], [4, 1], [3, 2], [4, 2]]);

// 进村的几条固定走法（地形恒定，seed 只在这些走法之间选）
const gaoNorthRoad = AL([[8, 2], [6, 2], [5, 2], [4, 2]]);          // 大车路直插村东
const gaoNorthWoods = AL([[8, 2], [6, 2], [4, 0], [3, 0], [3, 1]]); // 过桥后北折钻树林压村北
const gaoSouthLaneWay = AL([[9, 6], [6, 6], [4, 4], [3, 3]]);       // 南土路绕河尾摸村南
const gaoFordWay = AL([[8, 2], [8, 4], [7, 4], [5, 4], [4, 3]]);    // 浅滩涉水横穿开阔地

const gaoLandmarks = [
  { key: A(3, 1), name: "高家庄 · 村北", note: "起始地窖之一（粮窖）就在这一格脚下" },
  { key: A(4, 2), name: "高家庄 · 村南", note: "起始地窖之一（人窖甲）；村里的钟就挂在这儿" },
  { key: A(2, 2), name: "青纱帐地窖", note: "村外农田里的人窖乙，紧贴村西——它离村口只有一格" },
  { key: A(7, 2), name: "石桥", note: "大车路唯一的桥。可破（4 进度），破后敌须走浅滩或南土路，约迟两回合" },
  { key: A(7, 4), name: "浅滩", note: "河沟唯一可涉处，不通车、不可破——破了桥也堵不死这条路" },
  { key: A(1, 3), name: "西南坟地", note: "有掩护、可隐蔽的经典伏击位，紧贴村西南" },
  { key: A(2, 0), name: "北树林", note: "阻挡视线的掩蔽地，北路必经之侧" },
  { key: A(5, 4), name: "南面青纱帐", note: "可隐蔽但不减伤：适合藏、不适合硬顶" },
  { key: A(10, 2), name: "北路入境口", note: "大车路东端，敌自此入境也自此收队；路上 5 格算敌补给线" },
  { key: A(10, 6), name: "南路入境口", note: "南土路东端，绕河尾进村；破这条路同样扣敌行动力池" },
  { key: A(5, 2), name: "村东路口", note: "离村最近的补给线路格，破路最省脚力的一处" },
];

const gaoAmbushSpots = [
  { key: A(1, 3), note: "西南坟地：可隐蔽 + 有掩护，南土路诸式都要从旁边过" },
  { key: A(2, 0), note: "北树林：可隐蔽 + 有掩护 + 挡视线，北路绕树林那一式必经" },
  { key: A(5, 4), note: "南面青纱帐：可隐蔽但无掩护——打完要立刻走" },
  { key: A(1, 6), note: "西南树林：南土路进村前的最后一处掩蔽" },
];

const gaoApproaches = [
  { id: "northRoad", name: "北路 · 大车路直进", brief: "沿大车路过石桥，自村东压来",
    sapperEntry: gaoEntrySouth, sapperWay: gaoSouthLaneWay, sapperBrief: "工兵组另走南土路摸上来",
    columns: [{ suffix: "N", entry: gaoEntryNorth, take: [0, 1, 2, 3], waypoints: gaoNorthRoad }] },
  { id: "northWoods", name: "北路 · 绕树林", brief: "过石桥后北折钻树林，绕开坟地一侧再压向村北",
    sapperEntry: gaoEntryNorth, sapperWay: gaoNorthRoad, sapperBrief: "工兵组随后自大车路跟进",
    columns: [{ suffix: "N", entry: gaoEntryNorth, take: [0, 1, 2, 3], waypoints: gaoNorthWoods }] },
  { id: "southLane", name: "南路 · 土路绕河尾", brief: "绕过河尾走南土路，自村南摸来",
    sapperEntry: gaoEntryNorth, sapperWay: gaoNorthRoad, sapperBrief: "工兵组随后自大车路跟进",
    columns: [{ suffix: "S", entry: gaoEntrySouth, take: [0, 1, 2, 3], waypoints: gaoSouthLaneWay }] },
  { id: "ford", name: "浅滩 · 涉水而来", brief: "不走石桥，自河下游浅滩涉水，横穿开阔地进村",
    sapperEntry: gaoEntryNorth, sapperWay: gaoFordWay, sapperBrief: "工兵组也走浅滩跟进",
    columns: [{ suffix: "F", entry: gaoEntryNorth, take: [0, 1, 2, 3], waypoints: gaoFordWay }] },
  { id: "dual", name: "双路 · 分进合击", brief: "分成两股，一股走大车路，一股绕南土路，两面夹村",
    sapperEntry: gaoEntryNorth, sapperWay: gaoNorthRoad, sapperBrief: "工兵组跟在北路一股之后",
    columns: [
      { suffix: "N", entry: gaoEntryNorth, take: [0, 2], waypoints: gaoNorthRoad },
      { suffix: "S", entry: gaoEntrySouth, take: [1, 3], waypoints: gaoSouthLaneWay },
    ] },
  { id: "dualFord", name: "双路 · 一股涉浅滩", brief: "一股照走大车路，一股自浅滩涉水横插村东——破桥拦不住这一路",
    sapperEntry: gaoEntryNorth, sapperWay: gaoFordWay, sapperBrief: "工兵组随涉水一股跟进",
    columns: [
      { suffix: "N", entry: gaoEntryNorth, take: [0, 2], waypoints: gaoNorthRoad },
      { suffix: "F", entry: gaoEntryNorth, take: [1, 3], waypoints: gaoFordWay },
    ] },
];

const gaoScoutLoops = [
  { id: "northLoop", name: "北环（先探树林一侧）", entry: gaoEntryNorth,
    waypoints: AL([[8, 2], [6, 2], [4, 0], [2, 0], [2, 2], [3, 3], [5, 2]]) },
  { id: "southLoop", name: "南环（先探坟地一侧）", entry: gaoEntrySouth,
    waypoints: AL([[8, 6], [5, 5], [3, 3], [1, 3], [2, 2], [2, 0], [5, 2]]) },
  { id: "villageLoop", name: "直趋村口（不绕，先看粮囤）", entry: gaoEntryNorth,
    waypoints: AL([[8, 2], [5, 2], [4, 2], [3, 2], [2, 2], [4, 1], [8, 2]]) },
  { id: "farmLoop", name: "沿青纱帐（贴农田摸到村西）", entry: gaoEntrySouth,
    waypoints: AL([[8, 6], [6, 6], [4, 4], [2, 3], [1, 3], [2, 2], [3, 1]]) },
];

const gaoSupplyRoad = AL([[5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6]]);

// ---------------------------------------------------------------------------
// 通用文本块（三幕共用的地形/编成速查，避免每幕重复解释同一张图）
// ---------------------------------------------------------------------------

const gaoRoster3 = [
  "民兵组 ×2（HP3 攻2 MP2 挖2）：挖掘主力；带路一次 2 批；不能野战对射",
  "游击班 ×1（HP4 攻2 MP3 挖1）：唯一能野战攻击的单位；带路一次 1 批",
  "联络员 ×1（HP2 攻0 MP4 视野3）：挖掘力 0，但**带路一次 3 批**——群众转移的主力就是他",
];

const civNotes = [
  "群众以「批」计，分三类：老弱（1 格/回合，铺位 1）、青壮（2 格/回合，铺位 1）、伤员（1 格/回合，铺位 2）。",
  "村口转移（MoveCivs）把人送进邻接地道口连通的地道；地道里再走，必须有单位在同一格带路（GuideCivs）。",
  "带路一次能带几批看单位：联络员 3、民兵 2、游击 1；带路是主动作——带路的人这回合就挖不成、也打不了。",
  "地道里没有我方单位陪着的群众每回合恐慌 +1（无风 +1、烟中 +2、水中 +2）；有人守在同格则恐慌 -1。",
  "恐慌满 3 → 群众自己冲出地面：地面有敌就当场被抓（入代价簿）。这与「憋闷被迫出洞」是同一套压力。",
];

const gaoLedgerNotes = [
  "粮食被夺：敌到村 2 格内每回合搜走明存粮；敌进村征粮再算 2 担/回合；灌水泡毁的存粮也记在这一栏",
  "群众被抓：村里粮已净空而人还在地面时，敌每回合抓丁 1 批；恐慌/憋闷冲出洞口而地面有敌，也当场被抓",
  "房屋被焚：只有报复队与驻剿队会烧——它们出场与否取决于你怎么打",
  "群众罹难：只有爆破塌方压住藏身处，或彻底无路可出时才会发生（烟与水本身不杀人，只把人逼上地面）",
];

const gaoGradeNotes = [
  "胜 + 3 枚勋记 = 甲；2 枚 = 乙；≤1 枚 = 丙；败 = 丁（败则三枚一律不计）",
  "歼敌不是计分项：它只让敌行动力池掉得快，从而把敌人提前赶走",
  "终局按**群众保全率**评定：保全 = 没被抓、没罹难的批数 ÷ 全村批数",
];

// ---------------------------------------------------------------------------
// 第一幕《单口洞》—— 让你亲身失败
// ---------------------------------------------------------------------------

const a1Villages = [
  { id: "v1", name: "高家庄", hexKeys: gaoVillageHexes, grainOpen: 8, organize: 1, hasHq: true },
];

const a1 = {
  id: "A1", act: 1, name: "单口洞", subtitle: "第一幕 · 让你亲身失败",
  maxTurns: 8, sweepStartTurn: 2, hardEndTurn: 8,
  pool: 12, decay: 0, smokeCharges: 0, floodCharges: 0, ammoStart: 4, sweepGrainLoss: 2,
  storageCap: 4, shelterCap: 2,          // 祖辈传下来的小地窖：一个窖只装得下四担粮、两个铺位
  levyAlways: true,                      // 搜庄队搜粮抓人一起来：地面上留着的人，一回合抓走一批
  enemyOps: ["breach", "seal"],
  opPriority: ["breach", "seal"],
  bridgeBreakable: true,

  unlocks: {
    actions: ["Move", "UseEntrance", "MoveCivs", "HideGrain", "CoverTraces", "BreakRoad",
      "Hide", "Feint", "Organize", "Collapse", "Rest"],
    facilities: [],
    disguises: [],
    civGuidance: false,                  // 洞不通，群众进去了就只能待着——没处走，也就谈不上带路
    newThisAct: [
      { key: "cellar", name: "单口地窖", note: "三个各自为政的地窖：只能藏人藏粮，彼此不通，进去了就出不来" },
      { key: "hideGrain", name: "藏粮", note: "站在村格上把明存粮转进脚底下的粮窖；一个窖只装 4 担" },
      { key: "moveCivs", name: "转移群众", note: "站在村格上把群众送进邻接地道口；铺位有限，装不下的人只能留在地面" },
      { key: "coverTraces", name: "掩土", note: "抹掉本格痕迹与暴露豆各 2，每人每役只有 3 次" },
    ],
  },
  lessons: [
    "一、粮和人要抢在敌人进村之前藏下去——地窖就那么大，装不下的只能留在地面。",
    "二、地窖是死的：口被搜出、敌人攻入，窖里的人一个也跑不掉。",
    "三、这一幕注定要付代价。看清代价簿上的数字，那是下一幕要解决的问题。",
  ],

  hexes: BuildHexes(gaoRows, [...FullRow(2), ...gaoSouthLane], [[7, 2]], [[7, 4]], a1Villages),
  villages: a1Villages,
  supplyRoad: gaoSupplyRoad,
  exitKeys: [gaoEntryNorth, gaoEntrySouth],
  allies: [
    { type: "militia", at: A(3, 1) }, { type: "militia", at: A(4, 2) },
    { type: "guerrilla", at: A(3, 2) }, { type: "runner", at: A(3, 2) },
  ],
  // 三个互不相连的单口地窖：粮窖（村北）、人窖甲（村南）、人窖乙（村西青纱帐）
  tunnels: {
    cells: AL([[3, 1], [4, 2], [2, 2]]),
    edges: [],
    entrances: AL([[3, 1], [4, 2], [2, 2]]),
    facilities: [[A(3, 1), "storage"], [A(4, 2), "shelter"], [A(2, 2), "shelter"]],
  },
  // 六批群众：老弱二、青壮三、伤员一（合计 7 个铺位，两个人窖只有 4 个）
  civBatches: [
    { kind: "old", village: "v1", count: 2 },
    { kind: "young", village: "v1", count: 3 },
    { kind: "wounded", village: "v1", count: 1 },
  ],

  landmarks: gaoLandmarks,
  ambushSpots: gaoAmbushSpots,

  seedDraws: [
    { key: "axis", count: 3, note: "入境轴线 3 选 1：大车路 / 绕树林 / 南土路" },
    { key: "mix", count: 2, note: "伪军:日军配比 2 档" },
    { key: "arrive", count: 3, note: "搜庄队到达回合 T3±1" },
    { key: "scoutDir", count: 2, note: "斥候绕向 2 选 1" },
  ],
  approaches: gaoApproaches.slice(0, 3),
  mixes: [
    { id: "heavy", name: "日军重（两班日军 + 一队伪军）", units: ["inf", "inf", "puppet"] },
    { id: "light", name: "伪军重（一班日军 + 两队伪军）", units: ["inf", "puppet", "puppet"] },
  ],
  scoutLoops: gaoScoutLoops.slice(0, 2),
  scoutTurn: 2,
  scoutUnits: ["puppet"],
  mainName: "搜庄队",
  mainTarget: "v1",
  mainTurnBase: 3, mainTurnRange: [3, 5], arriveCenter: 1,
  seizeGoal: 0,

  victory: { civSafeAtLeast: 3, combatUnitsAtLeast: 1 },
  medals: [
    { key: "cellarFull", name: "窖满", text: "粮窖装满（洞存粮不少于四担）",
      need: { tunnelGrain: 4 },
      hint: "粮窖只有 4 担的容量——一次藏 3 担，两回合就能装满，前提是你抢在敌人进村之前动手" },
    { key: "fiveOfSix", name: "五口", text: "六批群众里至少保住五批",
      need: { civSafeAtLeast: 5 },
      hint: "两个人窖只有 4 个铺位（伤员一批占 2 个），剩下的人只能靠拖住敌人来保——破大车路能让他们迟到" },
    { key: "delay", name: "周旋", text: "把敌逼退（行动力池耗尽，提前收队）",
      anyOf: { expelled: true },
      hint: "行动力池 12：破一处大车路 -2（至多三处），敌翻遍村子一无所获每回合再 -1~-2；"
        + "这一幕没有枪，破路与藏净就是你全部的进攻手段" },
  ],
  defeatHints: {
    civSafeAtLeast: "六批群众至少要保住三批：铺位不够就先送老弱与伤员，青壮留到最后；破路能给你多争两回合",
    combatUnitsAtLeast: "这一幕没有开放伏击与射击——战斗单位是拿来挖、拿来带人的，不是拿来对射的",
  },
  debrief: {
    cost: "代价簿上的数字不会是零：八担粮，粮窖只装得下四担；六批人，两个人窖只有四个铺位。"
      + "剩下的粮被搜走，剩下的人在地面上被抓——这不是你打得差，这是三个不通的地窖的极限。",
    learned: "洞是死的，人是活的。洞不通，人就没处去：一个口被搜出，窖里的人一个也跑不掉。",
    unlocked: "下一幕开放：连通挖掘（把各家的窖挖通）、多开地道口、伪装口（灶台/水井/炕洞/牲口槽），"
      + "以及带领群众在地道里转移。",
  },

  phases: [
    { from: 1, to: 1, name: "平静期 · 只有一回合", note: "钟声还没响。这一回合把粮往窖里转、把人往窖里送——多一批是一批" },
    { from: 2, to: 3, name: "扫荡期 · 斥候", note: "伪军斥候在翻痕迹与明存粮；还来得及掩土、破路" },
    { from: 4, to: 6, name: "扫荡期 · 搜庄队", note: "搜庄队进村征粮、抓丁；地窖口一旦被搜出，敌人就要攻进来" },
    { from: 7, to: 8, name: "扫荡期 · 收尾", note: "护住还没被搜出的窖，撑到他收队" },
  ],
  openingChecklist: [
    "① 第一回合就藏粮：站在 3,1（粮窖正上方）用 HideGrain，一次 3 担，粮窖满打满算只装 4 担",
    "② 同一回合让另外两个单位 MoveCivs：一次 2 批，两个人窖合计只有 4 个铺位（伤员占 2 个）",
    "③ 民兵去大车路上 BreakRoad：每破一处敌行动力池 -2，还能让搜庄队迟到——这是你给群众争取的时间",
    "④ 记住：装不下的人留在地面，敌人搜光明存粮就开始抓丁。这一幕的代价是设计好的，不是你算错了",
  ],
  pitfalls: [
    "指望把六批人全塞进两个人窖：铺位只有 4 个，伤员一批占 2 个——算清楚再决定先送谁",
    "把粮全留在明处：敌到村边每回合搜走 2 担，进村再征 2 担，十担撑不过四回合",
    "让单位站在敌人旁边：这一幕没有伏击也没有枪眼，战斗单位一样会被打死",
    "地窖口被搜出还不理会：敌一攻入，窖里的粮和人一并进代价簿——这一幕连备用口都没有",
  ],
  tactics: [
    "抢窖流：第一回合三个单位同时藏粮 + 转移群众，把能装的全装满，剩下的听天由命",
    "拖延流：民兵破大车路（每处 -2 池），搜庄队迟到一到两回合，抓丁就少一到两批",
    "掩土流：斥候靠痕迹与暴露豆找口。掩土每人 3 次，压住最要紧的那个窖口，能让它撑到收队",
  ],
  roster: gaoRoster3,
  counterNotes: [
    "伪军队 HP3 攻1 搜1：1 格内没有日军班时搜索力为 0——它单独绕村其实什么也搜不出来",
    "日军班 HP4 攻2 搜2：它在哪儿，哪儿的地窖口就掉得快",
    "这一幕敌人只会「封堵」与「攻入」：封堵把口填死（人还在里面），攻入则把窖里的东西全部带走",
  ],
  facilityNotes: [
    "粮窖（储粮洞）：这一幕只有村北一个，容量 4 担——注定装不下全村的十担",
    "人窖（藏人室）：村南、村西各一个，各 2 个铺位；伤员一批占 2 个铺位",
    "这一幕**不能修任何设施、不能挖任何段、不能开新口**——祖辈就留下这三个窖，你只能用它们",
  ],
  ledgerNotes: gaoLedgerNotes,
  gradeNotes: gaoGradeNotes,
  objectives: [
    "守住：终局至少保住 3 批群众（全村共 6 批）",
    "守住：至少还剩 1 支战斗单位（民兵组/游击班）",
    "争取：粮窖装满 4 担 · 保住 5 批群众 · 无阵亡且无房屋被焚——三枚勋记",
  ],
  digest: [
    "每个单位每回合只能用 1 个「主动作」；移动（Move）与上下地道口（UseEntrance）只花 MP。",
    "**这一幕不能挖**：没有 Dig / DigEntrance / DigFacility——三个地窖互不相连，也开不了新口。",
    "藏粮要求本村格**正下方**有地窖；转移群众要求本格或相邻格有可用地道口。",
    "地窖容量：粮窖 4 担；人窖各 2 个铺位（老弱/青壮各占 1，伤员占 2）。",
    "敌到村 2 格内，明存粮每回合被搜走 2 担；粮净空后改为抓丁 1 批/回合。",
    "口被搜出（暴露豆满阈值）后，敌会封堵或攻入：攻入时窖里无人驻守 = 粮与人全部进代价簿。",
    "掩土每人每役 3 次，每次本格痕迹 -2、暴露豆 -2——这是这一幕唯一的减法。",
    "破路每处让敌行动力池 -2，并逼敌绕行：这是这一幕唯一能「争取时间」的手段。",
  ],
  orderOfBattle: [
    "斥候：伪军一队，第二日入境绕村侦察，专找挖掘痕迹与明存粮",
    "搜庄队：按配比 3 队，第三至第五日进村征粮 2 担/回合；粮净空后抓丁",
    "这一幕没有工兵：敌人还不知道该拿地道怎么办——他们只会填口和硬闯",
  ],
  intelTimeline: [
    { turn: 1, text: "内线：据点昨夜点验车辆。村里的钟绳已经解开——粮和人，今日就得往窖里转" },
    { turn: 2, text: "内线：伪军斥候一队今晨出据点，专找新土与明处的粮囤" },
    { turn: 3, text: "内线：自本日起，村里凡还摆在明处的粮，每日要被搜走两担" },
    { turn: 4, text: "内线：搜庄队已到村边。窖口的暴露豆攒满就会被搜出——搜出之后，封堵与攻入都可能落下来" },
    { turn: 5, text: "内线：村里若已无粮可征，敌就要开始抓丁了——可地窖的铺位，已经满了" },
    { turn: 6, text: "内线：敌押运队在据点等车，这一趟不会拖过第八日" },
  ],
  briefing: [
    "冀中军区第▲分区 通报（摘）：",
    "高家庄一带秋粮已入囤。据内线报，敌今明两日即出据点搜庄。",
    "先遣伪军斥候一队，约第二日{SCOUT}。",
    "搜庄队{MIX}，约第{ARRIVE}日{AXIS}。",
    "村中现有地窖三处：村北粮窖一（容四担）、村南人窖一（两铺）、村西青纱帐人窖一（两铺）。",
    "此三窖为各家祖辈自掘，**彼此不通，各只一口**；窖中之人无第二条路可走。",
    "指示：一、粮与人即刻转入窖中，装得下多少是多少；",
    "      二、相机掩土、破路，为村中争取时间；",
    "      三、此役无伏击、无枪眼之令——战斗单位用于转运与掩护，不得与敌对射。",
    "又：群众被抓、房屋焚毁、粮秣被夺，均入代价簿。此簿只记损失，不折功劳。",
  ],
};

// ---------------------------------------------------------------------------
// 第二幕《户户相通》—— 把洞连成网
// ---------------------------------------------------------------------------

const a2Villages = [
  { id: "v1", name: "高家庄", hexKeys: gaoVillageHexes, grainOpen: 14, organize: 1, hasHq: true },
];

const a2 = {
  id: "A2", act: 2, name: "户户相通", subtitle: "第二幕 · 把洞连成网",
  maxTurns: 10, sweepStartTurn: 3, hardEndTurn: 10,
  pool: 14, decay: 0, smokeCharges: 0, floodCharges: 0, ammoStart: 5, sweepGrainLoss: 1,
  storageCap: 6, shelterCap: 4,
  enemyOps: ["breach", "excavate", "seal"],
  opPriority: ["breach", "excavate", "seal"],
  bridgeBreakable: true,

  unlocks: {
    actions: ["Move", "UseEntrance", "Dig", "DigEntrance", "DigFacility", "Disguise", "GuideCivs",
      "MoveCivs", "HideGrain", "CoverTraces", "BreakRoad", "Hide", "Feint", "Organize", "Collapse", "Rest"],
    facilities: ["storage", "shelter"],
    disguises: ["stove", "well", "kang", "trough"],
    civGuidance: true,
    newThisAct: [
      { key: "dig", name: "连通挖掘", note: "在地道里向相邻格挖段：段 2 进度，挖向村庄格只要 1——把三个窖连成一条巷子" },
      { key: "digEntrance", name: "多口", note: "在地道格上向上开新口（2 进度）：一个口被搜出，还有第二个口能出人" },
      { key: "disguise", name: "伪装口", note: "把已有的口做进灶台/水井/炕洞/牲口槽（1 进度）：灶台+1、炕洞+1、水井+2（但群众上不去）、牲口槽带路多带 1 批" },
      { key: "guideCivs", name: "带领群众", note: "单位与群众同格时领着他们在地道里走：联络员 3 批、民兵 2 批、游击 1 批；老弱伤员一回合只走 1 格" },
      { key: "panic", name: "恐慌", note: "地道里没有人陪着的群众每回合恐慌 +1，满 3 就自己冲出地面——地面有敌就当场被抓" },
    ],
  },
  lessons: [
    "一、把各家的窖挖通：段挖到村庄格只要 1 进度，一个民兵一回合就能通一段。",
    "二、多开一个口、把口伪装进灶台或水井——一个口被搜出，人还能从另一个口走。",
    "三、群众在地道里必须有人带路。谁去带路、谁去挖，是这一幕每回合都要做的取舍。",
  ],

  hexes: BuildHexes(gaoRows, [...FullRow(2), ...gaoSouthLane], [[7, 2]], [[7, 4]], a2Villages),
  villages: a2Villages,
  supplyRoad: gaoSupplyRoad,
  exitKeys: [gaoEntryNorth, gaoEntrySouth],
  allies: [
    { type: "militia", at: A(3, 1) }, { type: "militia", at: A(4, 2) },
    { type: "guerrilla", at: A(3, 2) }, { type: "runner", at: A(3, 2) },
  ],
  tunnels: {
    cells: AL([[3, 1], [4, 2], [2, 2]]),
    edges: [],
    entrances: AL([[3, 1], [4, 2], [2, 2]]),
    facilities: [[A(3, 1), "storage"], [A(4, 2), "shelter"], [A(2, 2), "shelter"]],
  },
  civBatches: [
    { kind: "old", village: "v1", count: 2 },
    { kind: "young", village: "v1", count: 3 },
    { kind: "wounded", village: "v1", count: 1 },
  ],

  landmarks: gaoLandmarks,
  ambushSpots: gaoAmbushSpots,

  seedDraws: [
    { key: "axis", count: 5, note: "入境轴线 5 选 1" },
    { key: "mix", count: 3, note: "伪军:日军配比 3 档" },
    { key: "arrive", count: 3, note: "征粮队到达回合 T5±1" },
    { key: "scoutDir", count: 4, note: "斥候绕向 4 选 1" },
  ],
  approaches: gaoApproaches.slice(0, 5),
  mixes: [
    { id: "heavy", name: "日军重（两班日军 + 一队伪军）", units: ["inf", "inf", "puppet"] },
    { id: "even", name: "参半（一班日军 + 两队伪军）", units: ["inf", "puppet", "puppet"] },
    { id: "light", name: "伪军重（一班日军 + 三队伪军）", units: ["inf", "puppet", "puppet", "puppet"] },
  ],
  scoutLoops: gaoScoutLoops,
  scoutTurn: 3,
  scoutUnits: ["puppet"],
  mainName: "征粮队",
  mainTarget: "v1",
  mainTurnBase: 5, mainTurnRange: [4, 6], arriveCenter: 1,
  seizeGoal: 0,

  victory: { civSafeAtLeast: 5, tunnelGrainAtLeast: 8, combatUnitsAtLeast: 1 },
  medals: [
    { key: "linked", name: "户户相通", text: "三处地窖连成一片（最大连通块不少于 5 格）",
      need: { largestNetworkAtLeast: 5 },
      hint: "村北 3,1 与村南 4,2 之间隔着村庄格，段成本只要 1；青纱帐的窖在村西一格外，是最后一段" },
    { key: "allSix", name: "六口", text: "六批群众一批未失",
      need: { civSafeAtLeast: 6 },
      hint: "两间人窖各 4 个铺位，够住；难的是带路——老弱与伤员一回合只走 1 格，得早开始" },
    { key: "twoMouths", name: "多口", text: "终局仍有不少于 2 个未被搜出的地道口，且其中至少 1 个是伪装口",
      need: { liveEntrancesAtLeast: 2, disguisedAtLeast: 1 },
      hint: "开新口自带 2 豆；水井 +2 隐蔽最难搜出，但群众上不去——伪装选哪种，取决于这个口是给谁用的" },
  ],
  defeatHints: {
    civSafeAtLeast: "群众要走得动，地道就得连起来；带路是主动作，越早开始越从容",
    tunnelGrainAtLeast: "明存粮在敌到村边后每回合被搜走 2 担——先把粮窖连到村格脚下，再谈别的",
    combatUnitsAtLeast: "这一幕仍然不能伏击、不能对射：战斗单位是挖网与带路的人手",
  },
  debrief: {
    cost: "网挖起来了，但每一锹都记在暴露豆上；带路占掉的主动作，就是没能挖的那几段。",
    learned: "同样被搜出：上一幕的窖里的人跑不掉，这一幕能从另一个口走。**网络的价值不是长度，是出路的条数。**",
    unlocked: "下一幕开放：射击孔（地下打地面）与翻板（拦敌一回合）——地道第一次成为进攻工具。",
  },

  phases: [
    { from: 1, to: 2, name: "平静期 · 备战", note: "唯一能安心动土的两回合：先把三个窖连通，再开第二个口" },
    { from: 3, to: 4, name: "扫荡期 · 斥候", note: "斥候在翻痕迹；掩土、伪装口、破路都趁现在" },
    { from: 5, to: 7, name: "扫荡期 · 征粮队", note: "主力进村征粮、抓丁；群众该往深处带了" },
    { from: 8, to: 10, name: "扫荡期 · 收尾", note: "口被搜出就换口走人；撑到他收队" },
  ],
  openingChecklist: [
    "① 民兵下到 3,1（粮窖），向村庄格挖段——挖向村庄只要 1 进度，一个回合就通",
    "② 另一个民兵从 4,2（人窖甲）对挖，两头一接，村北村南就通了",
    "③ 联络员先把群众从村口 MoveCivs 送进人窖（一次 2 批），再在地道里 GuideCivs 往深处带（一次 3 批）",
    "④ 平静期结束前把粮转下去；有余力就把村南那个口做成灶台（+1 隐蔽，1 进度）",
  ],
  pitfalls: [
    "只挖不掩土：暴露豆全程累计，到 4 豆敌就来撬这个口；掩土每人只有 3 次",
    "把群众丢在地道里不管：没人陪着每回合恐慌 +1，满 3 就自己冲出地面，撞上敌人就是被抓",
    "把口全做成水井：水井隐蔽最高，但井口窄——恐慌的群众上不去，反而把人困在里面",
    "带路带得太晚：老弱与伤员一回合只走 1 格，等敌人到村口再动身就来不及了",
  ],
  tactics: [
    "贯通流：先把村北—村南连成一条巷子，再向青纱帐延伸——三窖一网，任何一个口被搜出都还有活路",
    "多口流：在坟地或树林开第二个口（那儿隐蔽上限 3），把它做成牲口槽——带路一次多带 1 批",
    "伪装流：村里的口做灶台或炕洞（+1），村外的口做牲口槽；把水井留给只走单位的那个口",
    "轮班流：一个民兵挖、一个联络员带路、一个游击守村口——每回合只有四个主动作，别浪费在无谓的移动上",
  ],
  roster: gaoRoster3,
  counterNotes: [
    "伪军队：1 格内没有日军班时搜索力为 0；先看清楚哪一队里有日军班",
    "日军班：搜索力 2，谨慎升级后还 +1——它蹲在哪个口边上，哪个口就撑不了两回合",
    "这一幕敌人新学会「刨口」：不用工兵，扛锹镐围住已知的口，一回合就能刨掉它",
  ],
  facilityNotes: [
    "储粮洞：容量 6 担；全村 14 担，注定要修第二个——第二个储粮洞要挖新格才装得下",
    "藏人室：容量 4 个铺位；六批群众（含一批伤员，占 2 铺）刚好要两间",
    "这一幕还修不了通风口与射击孔——那是第三、第四幕的事",
    "伪装口（1 进度）：灶台/炕洞 +1 隐蔽、水井 +2（群众上不去）、牲口槽 ±0 但带路多带 1 批",
  ],
  ledgerNotes: gaoLedgerNotes,
  gradeNotes: gaoGradeNotes,
  objectives: [
    "守住：终局至少保住 5 批群众（全村共 6 批）、洞存粮 ≥8 担、战斗单位 ≥1",
    "别丢：口被搜出就会被刨、被填、被攻入——攻入时洞里无人驻守，粮与人全部进代价簿",
    "争取：三窖连成 5 格以上一片 · 六批群众一批未失 · 留住 2 个口且至少 1 个是伪装口——三枚勋记",
  ],
  digest: [
    "每个单位每回合只能用 1 个「主动作」；移动与上下地道口只花 MP。",
    "挖段：向相邻可挖格挖，段 2 进度、挖向村庄格 1 进度；民兵挖 2/回合、游击 1/回合、联络员挖不动。",
    "开新口：DigEntrance 2 进度，新口自带 2 豆；伪装口 Disguise 1 进度，改隐蔽等级。",
    "带路：GuideCivs 是主动作，单位必须与群众同格；一次带的批数与单位有关（联络员 3 / 民兵 2 / 游击 1）。",
    "群众速度：老弱 1 格、青壮 2 格、伤员 1 格；混着带按最慢的算。",
    "恐慌：地道里没人陪着 +1/回合，无风 +1，满 3 冲出地面——地面有敌当场被抓。",
    "动土必留声：每挖通一段 / 修成一处设施 → 本气区各口暴露 +1；开新口 → 该口 +2。",
    "胜负只认洞存粮与群众保全：明存粮在敌到村边后每回合被搜走 2 担。",
  ],
  orderOfBattle: [
    "斥候：伪军一队，第三日入境绕村侦察",
    "征粮队：按配比 3~4 队，第四至第六日进村征粮 2 担/回合；粮净空后抓丁",
    "这一幕敌人会封堵、刨口、攻入；还没有工兵，因此还没有烟与炸药",
  ],
  intelTimeline: [
    { turn: 1, text: "内线：上一趟他们搜走了粮、抓走了人。区队部的意思是：把各家的窖挖通，做成一条巷子" },
    { turn: 2, text: "内线：挖向村庄格只要一进度——村北到村南，一个民兵一回合就能通一段" },
    { turn: 3, text: "内线：敌已出据点。自本日起，明处的粮每日被搜走两担" },
    { turn: 4, text: "内线：口要多开一个。一个口被搜出，人得能从另一个口走——这是上一趟用命换来的" },
    { turn: 5, text: "内线：敌记事簿上按「暴露」排队撬口——豆子满四个的口，随时会被填、被刨、被攻入" },
    { turn: 6, text: "内线：洞里的人得有人陪着。没人带路的，撑不过三回合就要往外冲" },
    { turn: 8, text: "内线：敌押运队在据点等车，扫荡不会拖过第十日" },
  ],
  briefing: [
    "冀中军区第▲分区 通报（摘）：",
    "上一趟搜庄，村中三窖各自为政，窖满人溢，损失已入代价簿。",
    "区队部决议：**把各家的窖挖通**，多做出口，并将口做入灶台、水井、炕洞、牲口槽等寻常什物。",
    "先遣伪军斥候一队，约第三日{SCOUT}。",
    "征粮队{MIX}，约第{ARRIVE}日{AXIS}。",
    "指示：一、地道段挖向村庄格只要一进度，先把村北粮窖与村南人窖连成一条巷子；",
    "      二、口不可只有一个。第二个口开在坟地或树林（隐蔽上限三）为宜；",
    "      三、洞中群众须有人带路方能移动：老弱伤员一回合只走一格，须早动身；",
    "         无人照应者，三回合即自行冲出地面，届时地面有敌，当场被抓；",
    "      四、动土必留声：每挖通一段、每修一处设施，本气区各口暴露豆 +1，开新口 +2。",
    "又：此役仍无伏击、射击之令——地道尚不能打，只能藏、只能走。",
  ],
};

// ---------------------------------------------------------------------------
// 第三幕《能打的地道》—— 从藏到打
// ---------------------------------------------------------------------------

const a3Villages = [
  { id: "v1", name: "高家庄", hexKeys: gaoVillageHexes, grainOpen: 12, organize: 1, hasHq: true },
];

const a3 = {
  id: "A3", act: 3, name: "能打的地道", subtitle: "第三幕 · 从藏到打",
  maxTurns: 10, sweepStartTurn: 3, hardEndTurn: 10,
  pool: 14, decay: 0, smokeCharges: 0, floodCharges: 0, ammoStart: 8, sweepGrainLoss: 2,
  storageCap: 8, shelterCap: 6,
  enemyOps: ["blast", "breach", "excavate", "seal"],
  opPriority: ["blast", "breach", "excavate", "seal"],
  bridgeBreakable: true,

  unlocks: {
    actions: ["Move", "UseEntrance", "Dig", "DigEntrance", "DigFacility", "Disguise", "GuideCivs",
      "MoveCivs", "HideGrain", "CoverTraces", "BreakRoad", "Hide", "Feint", "Organize", "Collapse",
      "Ambush", "Attack", "Rest"],
    facilities: ["storage", "shelter", "fightpost", "trapdoor"],
    disguises: ["stove", "well", "kang", "trough"],
    civGuidance: true,
    newThisAct: [
      { key: "fightpost", name: "射击孔", note: "修在地道格上（2 进度）：地下单位可打本格与相邻地表的敌人，按伏击结算" },
      { key: "relocate", name: "打一枪换一个地方", note: "同一个射击孔隔一回合内再开火 → 被迅速锁定：这一枪只伤 1，且该处被敌记住绕不开" },
      { key: "trapdoor", name: "翻板", note: "修在有口的地道格上（2 进度）：敌对这个口动手时踩空掉下去，整队一回合；用过要重新支好" },
      { key: "ambush", name: "伏击 / 野战", note: "第三幕起解禁：民兵可设伏（含开阔地挖散兵坑），游击班可野战对射" },
    ],
  },
  lessons: [
    "一、光藏不行。射击孔让你在地下打地面——但开火的那个口，敌人立刻就记下了。",
    "二、打一枪换一个地方：同一个孔连着打两回合，第二枪只伤 1，还会把敌人引到这里。",
    "三、翻板是「时间」：它拦不住敌人，只能让他白费一回合——那一回合是留给你换位的。",
  ],

  hexes: BuildHexes(gaoRows, [...FullRow(2), ...gaoSouthLane], [[7, 2]], [[7, 4]], a3Villages),
  villages: a3Villages,
  supplyRoad: gaoSupplyRoad,
  exitKeys: [gaoEntryNorth, gaoEntrySouth],
  allies: [
    { type: "militia", at: A(3, 1) }, { type: "militia", at: A(4, 2) }, { type: "militia", at: A(3, 2) },
    { type: "guerrilla", at: A(3, 2) }, { type: "runner", at: A(4, 1) },
  ],
  // 第二幕挖出来的网：村北—村北田埂—村南—青纱帐，两个口
  tunnels: {
    cells: AL([[3, 1], [4, 1], [4, 2], [3, 2], [2, 2]]),
    edges: [[A(3, 1), A(4, 1)], [A(4, 1), A(4, 2)], [A(4, 2), A(3, 2)], [A(3, 2), A(2, 2)]],
    entrances: AL([[3, 1], [2, 2]]),
    facilities: [[A(3, 1), "storage"], [A(4, 2), "shelter"], [A(2, 2), "shelter"]],
    disguises: [[A(3, 1), "stove"]],
  },
  civBatches: [
    { kind: "old", village: "v1", count: 2 },
    { kind: "young", village: "v1", count: 3 },
    { kind: "wounded", village: "v1", count: 1 },
  ],

  landmarks: gaoLandmarks,
  ambushSpots: gaoAmbushSpots,

  seedDraws: [
    { key: "axis", count: 6, note: "入境轴线 6 选 1" },
    { key: "mix", count: 3, note: "伪军:日军配比 3 档" },
    { key: "arrive", count: 3, note: "扫荡队到达回合 T5±1" },
    { key: "scoutDir", count: 4, note: "斥候绕向 4 选 1" },
    { key: "revenge", count: 2, note: "报复队/追剿队（仅在扫荡队伤亡 ≥2 时出场）" },
  ],
  approaches: gaoApproaches,
  mixes: [
    { id: "heavy", name: "日军重（三班日军 + 一队伪军）", units: ["inf", "inf", "inf", "puppet"] },
    { id: "even", name: "参半（两班日军 + 两队伪军）", units: ["inf", "inf", "puppet", "puppet"] },
    { id: "light", name: "伪军重（一班日军 + 三队伪军）", units: ["inf", "puppet", "puppet", "puppet"] },
  ],
  scoutLoops: gaoScoutLoops,
  scoutTurn: 3,
  scoutUnits: ["puppet"],
  mainName: "扫荡队",
  mainTarget: "v1",
  mainTurnBase: 5, mainTurnRange: [4, 6], arriveCenter: 1,
  seizeGoal: 0,
  sapperWave: { units: ["sapper"], delay: 1, range: [5, 7], target: "v1",
    telegraph: "敌工兵组携炸药随队而来，专撬暴露最高的地道口" },
  revengeWatch: "A3main",
  revengeVariants: [
    { id: "A3revenge", name: "报复队", casualtiesNeed: 2, units: ["inf", "inf"], role: "mobile",
      entry: gaoEntryNorth, exit: gaoEntryNorth, target: "v1", burnCount: 1,
      telegraph: "内线电报：据点点了两个班要来报复，明日进庄烧房" },
    { id: "A3revenge", name: "追剿队", casualtiesNeed: 2, units: ["inf", "sapper"], role: "sapper",
      entry: gaoEntrySouth, exit: gaoEntrySouth, target: "v1", burnCount: 0,
      telegraph: "内线电报：敌调一个班带工兵来追剿，明日自南土路进境，直奔已露头的地道口" },
  ],

  victory: { civSafeAtLeast: 5, tunnelGrainAtLeast: 8, combatUnitsAtLeast: 1 },
  medals: [
    { key: "relocate", name: "换地方", text: "从不少于 2 个不同的射击孔开过火（打一枪换一个地方）",
      need: { fightpostsUsedAtLeast: 2 },
      hint: "一个孔打完就得换——网里得有第二个孔，而且要有人走得过去" },
    { key: "allSix", name: "六口", text: "六批群众一批未失",
      need: { civSafeAtLeast: 6 },
      hint: "这一幕人窖大了（6 铺），但敌人也开始炸口了：别把人全放在一间" },
    { key: "expel", name: "逼退", text: "把敌军逼退（行动力池耗尽，提前收队）",
      anyOf: { expelled: true },
      hint: "行动力池 14：歼日军班 -3、破路每处 -2、打退攻入 -7、敌每次作业自耗 2~4、扑空每支纵队 -1" },
  ],
  defeatHints: {
    civSafeAtLeast: "群众要早带、要分散：爆破一次只毁一格，别让一间人窖装下所有人",
    tunnelGrainAtLeast: "储粮洞被攻入就整仓搬空——守洞（在口正下方留人）是这一幕收益最高的一手",
    combatUnitsAtLeast: "伏击打完会转「暴露」并挨还击；射击孔连打会被锁定——换地方，别硬顶",
  },
  debrief: {
    cost: "每一枪都在交出一个口：射击孔开火即已知，伏击打完即暴露。弹药只出不进，缴获补不回消耗。",
    learned: "地道第一次成了武器，但它的武器性在**换位**里，不在火力里。打一枪换一个地方——同一个孔连着打，"
      + "第二枪只伤 1，还把敌人引到这里。",
    unlocked: "下一幕开放：通气孔、隔断门，以及有高低差的地道——因为敌人要开始放烟、灌水、刨口了。",
  },

  phases: [
    { from: 1, to: 2, name: "平静期 · 备战", note: "两回合：至少修出两个射击孔（要在不同的巷子上），再补一块翻板" },
    { from: 3, to: 4, name: "扫荡期 · 斥候", note: "斥候在翻痕迹；掩土、破路、占伏点都趁现在" },
    { from: 5, to: 7, name: "扫荡期 · 扫荡队与工兵", note: "工兵专奔暴露最高的口；射击孔开一枪就得换地方" },
    { from: 8, to: 10, name: "扫荡期 · 收尾", note: "报复队可能进庄；护住最后的口，把他的池耗干" },
  ],
  openingChecklist: [
    "① 先修射击孔：修在**两条不同的巷子**上，孔与孔之间走得通——不然「换地方」无从谈起",
    "② 在有口的那一格修翻板（2 进度）：敌对这个口动手时会踩空，白费一回合",
    "③ 联络员把群众往深处带（一次 3 批），别都堆在一间人窖里——这一幕敌人会炸口",
    "④ 民兵去补第三个口或去破路；游击班守村口，敌一贴上来就有人还手",
  ],
  pitfalls: [
    "守着一个射击孔连打：第二枪只伤 1，还会给这一格挂上「敌已警戒」，后面全是麻烦",
    "以为翻板能挡住敌人：它只拦一回合，而且用过就要重新支好（再花 2 进度）",
    "为了缴弹药硬打：一个日军班要两枪才倒，只缴回一发——每打一次都在净亏",
    "打死人不算账：扫荡队折两个人，报复队/追剿队就会来——烧房与撬口都进代价簿",
    "把人全塞进一间人窖：爆破塌方压住藏身处，整间进代价簿",
  ],
  tactics: [
    "双孔流：村北一个孔、村南一个孔，中间靠巷子连着——打一枪走两格，换另一个孔再打",
    "守洞流：把一个民兵放在地道口正下方，敌一旦宣布攻入就会撞上守洞火力——他折一个班，池掉七点",
    "翻板流：把翻板压在暴露最高的那个口上，敌人的爆破/攻入/刨口统统白费一回合",
    "伏击流：坟地/树林各摆一个伏点（同格只容一处），打完就换地方",
    "耗池流：破补给线路格（每处 -2）+ 逼工兵反复作业（每次自耗 2~4）+ 让他扑空（每支纵队 -1）",
  ],
  roster: [
    "民兵组 ×3（HP3 攻2 MP2 挖2）：挖网、设伏、守射击孔；带路一次 2 批",
    "游击班 ×1（HP4 攻2 MP3 挖1）：唯一能野战攻击的单位；带路一次 1 批",
    "联络员 ×1（HP2 攻0 MP4 视野3）：带路一次 3 批，是群众转移的主力",
  ],
  counterNotes: [
    "日军班 HP4 攻2 搜2：一次伏击 3 伤打不死，残兵会回撤报信——两处伏点接力才能全歼",
    "伪军队 HP3 攻1 搜1：1 格内没有日军班时搜索力为 0，先打日军班能让整队瞎掉",
    "工兵班 HP3 攻1：专找暴露豆最高的口下炸药——它是最值得打的目标",
    "报复队/追剿队：只有你打死扫荡队两个人才会来（打不打，是你自己的选择）",
  ],
  facilityNotes: [
    "射击孔：地下单位可打本格与相邻地表的敌人（按伏击结算），但开火后该处开口立即变已知",
    "翻板：修在有地道口的格上；敌对这个口作业时踩空，整队一回合；用过要重新修（2 进度）",
    "储粮洞 8 担、藏人室 6 铺：容量比上一幕大，但爆破也来了——别把鸡蛋放一个篮子",
    "伪装口：口的隐蔽等级越高越难被搜出；牲口槽口子大，带路一次多带 1 批",
  ],
  ledgerNotes: gaoLedgerNotes,
  gradeNotes: gaoGradeNotes,
  objectives: [
    "守住：终局至少保住 5 批群众、洞存粮 ≥8 担、战斗单位 ≥1",
    "别丢：射击孔开火 = 该口立即已知；同一个孔连打第二枪只伤 1 并被敌记住",
    "争取：从 2 个以上不同射击孔开过火 · 六批群众一批未失 · 把敌逼退——三枚勋记",
  ],
  digest: [
    "射击孔（DigFacility fightpost，2 进度）：地下单位可打本格与相邻地表敌人，按伏击结算。",
    "打一枪换一个地方：距上次从同一个孔开火 ≤1 回合再开 → 只伤 1，该格获「敌已警戒」2 回合。",
    "翻板（DigFacility trapdoor，2 进度）：修在有口的地道格上，敌对该口作业时踩空，整队一回合，翻板落下需重修。",
    "伏击与野战自本幕解禁：民兵只能伏击（含开阔地挖散兵坑），游击班可野战对射。",
    "弹药收支严格为负：打死日军班缴 1 发（要两枪），伪军/工兵/特务 0 发，反击致死不缴获。",
    "守洞：敌宣布攻入时，若口正下方或相邻射击孔格有我方单位 → 敌折一个班且攻入中止。",
    "动土必留声；掩土每人每役 3 次；开新口自带 2 豆。",
    "胜负只认洞存粮与群众保全；歼敌不计分，只让敌行动力池掉得更快。",
  ],
  orderOfBattle: [
    "斥候：伪军一队，第三日入境绕村侦察",
    "扫荡队：按配比 4 队，第四至第六日进村；粮净空后抓丁",
    "工兵组：工兵一班，紧随主力，携炸药，专撬暴露豆最高的地道口",
    "报复队/追剿队：仅在扫荡队伤亡 ≥2 时出场",
  ],
  intelTimeline: [
    { turn: 1, text: "内线：敌天天来。区队部的意思是——把地道改成能打的" },
    { turn: 2, text: "内线：射击孔要修在两条不同的巷子上。一个孔打完就得换，换不了就别打" },
    { turn: 3, text: "内线：敌已出据点。自本日起，明处的粮每日被搜走两担" },
    { turn: 4, text: "内线：翻板压在最招眼的那个口上——敌人踩空一次，就白费一整天" },
    { turn: 5, text: "内线：敌工兵组携炸药随队而来，专找暴露豆最高的口" },
    { turn: 6, text: "内线：同一个孔连着打，敌人立刻就把火光咬住了——第二枪只伤一分，那块地方他也记住了" },
    { turn: 7, text: "内线：若扫荡队折了两个人，据点就要派报复队进庄烧房" },
    { turn: 9, text: "内线：敌押运队在据点等车，扫荡不会拖过第十日" },
  ],
  briefing: [
    "冀中军区第▲分区 通报（摘）：",
    "高家庄地道已成网，然敌日日来搜，藏而不打，终有藏不住的一天。",
    "区队部决议：**把地道改成能打的**——地道格上开射击孔，招眼的口上压翻板。",
    "先遣伪军斥候一队，约第三日{SCOUT}。",
    "扫荡队{MIX}，约第{ARRIVE}日{AXIS}。",
    "另据报：{SAPPER}——此队携炸药，专对付地道口。",
    "指示：一、射击孔须开在两条以上不同巷子，且巷子之间走得通；",
    "      二、**打一枪换一个地方**：同一孔连着开火，敌即咬住火光，第二枪只伤一分，该处亦被其记住；",
    "      三、翻板只拦一回合，用过须重修——它买的是时间，不是安全；",
    "      四、开火即交出该口：从射击孔或地道口开火，此口立时被敌记下。",
    "又：歼敌不计入功劳，只使其行动力池速耗；打死扫荡队两人以上，敌必派报复队进庄烧房。",
  ],
};

// ===========================================================================
// 第四幕《毒烟与水》—— 敌人的反制（西岗高地 / 东洼低地：地图有明确高低差）
// ===========================================================================

const a4Rows = [
  ".WWF...R...",
  ".WFVVF.R...",
  "..FVVF.R...",   // y2 大车路；x7 石桥
  ".GFVFF.R...",
  "..FFFG.R...",   // y4 x7 浅滩
  ".G.FF..R...",
  ".WW........",
  "...........",
  "...........",
];

// 高程：西岗（x0~2）高，村子（x3~4）中，东洼（x5+）低。水只往同高或更低处漫。
const a4Elev = [
  "22211100000",
  "22211100000",
  "22211000000",
  "22211000000",
  "22110000000",
  "22110000000",
  "21100000000",
  "11000000000",
  "11000000000",
];

const a4VillageHexes = AL([[3, 1], [4, 1], [3, 2], [4, 2], [3, 3]]);
const a4Villages = [
  { id: "v1", name: "高家庄", hexKeys: a4VillageHexes, grainOpen: 14, organize: 1, hasHq: true },
];

const a4NorthRoad = AL([[8, 2], [6, 2], [5, 2], [4, 2]]);
const a4Woods = AL([[8, 2], [6, 2], [4, 0], [3, 0], [3, 1]]);
const a4SouthLaneWay = AL([[9, 6], [6, 6], [4, 4], [3, 3]]);
const a4FordWay = AL([[8, 2], [8, 4], [7, 4], [5, 4], [4, 3]]);
const a4SouthLane = [[10, 6], [9, 6], [8, 6], [7, 6], [6, 6], [5, 5], [4, 4], [3, 3]];
const a4EntryNorth = A(10, 2);
const a4EntrySouth = A(10, 6);

const a4 = {
  id: "A4", act: 4, name: "毒烟与水", subtitle: "第四幕 · 敌人的反制",
  maxTurns: 12, sweepStartTurn: 3, hardEndTurn: 12,
  pool: 20, decay: 0, smokeCharges: 2, floodCharges: 2, ammoStart: 8, sweepGrainLoss: 2,
  storageCap: 8, shelterCap: 6,
  enemyOps: ["smoke", "flood", "blast", "breach", "excavate", "seal"],
  opPriority: ["smoke", "flood", "blast", "breach", "excavate", "seal"],
  bridgeBreakable: true,

  unlocks: {
    actions: ["Move", "UseEntrance", "Dig", "DigEntrance", "DigFacility", "DigDoor", "ToggleDoor",
      "Disguise", "GuideCivs", "MoveCivs", "HideGrain", "CoverTraces", "BreakRoad", "Hide", "Feint",
      "Organize", "Collapse", "Ambush", "Attack", "Rest"],
    facilities: ["storage", "shelter", "vent", "fightpost", "trapdoor"],
    disguises: ["stove", "well", "kang", "trough"],
    civGuidance: true,
    newThisAct: [
      { key: "vent", name: "通气孔", note: "修在地道格上（2 进度）：气区有它就不憋闷；通风口修够（≥地道格数/3），敌工兵的烟就用不上" },
      { key: "door", name: "隔断门", note: "挖在段上（1 进度）：关上挡烟、挡水、切气区；开关是免费动作（每门每回合一次）" },
      { key: "elev", name: "高低双层", note: "地图有高程：西岗高、村子中、东洼低。**水只往同高或更低处漫**——人往高处躲" },
      { key: "corner", name: "拐弯", note: "烟在直巷子里一回合走一格，拐一个弯要多花一回合——巷子别修成一条直线" },
      { key: "enemyFlood", name: "敌灌水", note: "敌自河沟架水车向低处的口灌水：淹到的格子恐慌/憋闷 +2，储粮洞每回合泡毁 2 担" },
    ],
  },
  lessons: [
    "一、反制不是数值，是结构：翻板挡烟挡水、拐弯让烟慢一回合、通气孔让你不必被憋出去。",
    "二、水只往同高或更低处漫。东洼的巷子会淹，西岗的巷子淹不着——人往高处带。",
    "三、隔断门把一张网切成几间屋子：关上一道门，远处的烟与水就到不了近处的人。",
  ],

  hexes: BuildHexes(a4Rows, [...FullRow(2), ...a4SouthLane], [[7, 2]], [[7, 4]], a4Villages, a4Elev),
  villages: a4Villages,
  supplyRoad: AL([[5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6]]),
  exitKeys: [a4EntryNorth, a4EntrySouth],
  allies: [
    { type: "militia", at: A(3, 1) }, { type: "militia", at: A(4, 2) }, { type: "militia", at: A(3, 3) },
    { type: "guerrilla", at: A(3, 2) }, { type: "guerrilla", at: A(4, 1) }, { type: "runner", at: A(3, 2) },
  ],
  // 起始网跨过高低差：西岗（2,3 高程 2）— 村子（高程 1）— 东洼（4,4 / 5,4 高程 0）
  tunnels: {
    cells: AL([[3, 1], [4, 1], [4, 2], [3, 2], [3, 3], [2, 3], [4, 4], [5, 4]]),
    edges: [[A(3, 1), A(4, 1)], [A(4, 1), A(4, 2)], [A(4, 2), A(3, 2)], [A(3, 2), A(3, 3)],
      [A(3, 3), A(2, 3)], [A(3, 3), A(4, 4)], [A(4, 4), A(5, 4)]],
    entrances: AL([[3, 1], [2, 3], [5, 4]]),
    facilities: [[A(3, 1), "storage"], [A(4, 2), "shelter"], [A(2, 3), "shelter"], [A(4, 1), "fightpost"]],
    disguises: [[A(3, 1), "stove"], [A(2, 3), "trough"]],
  },
  civBatches: [
    { kind: "old", village: "v1", count: 3 },
    { kind: "young", village: "v1", count: 4 },
    { kind: "wounded", village: "v1", count: 1 },
  ],

  landmarks: [
    { key: A(2, 3), name: "西岗地道口（高程 2）", note: "全网最高的一格：水漫不到这里——人和粮都该往这边挪" },
    { key: A(3, 3), name: "高家庄 · 村南（高程 1）", note: "高岗与东洼之间的咽喉，隔断门就该装在这一段上" },
    { key: A(5, 4), name: "东洼地道口（高程 0）", note: "全网最低的一格：敌水车对着它灌，第一个淹的就是这儿" },
    { key: A(4, 4), name: "东洼巷（高程 0）", note: "低处的巷子；淹了这里，储粮洞就别修在这一段" },
    { key: A(4, 1), name: "村北射击孔", note: "起始射击孔；同一个孔连着打会被锁定，另一个孔要自己修" },
    { key: A(7, 2), name: "石桥", note: "大车路唯一的桥。可破（4 进度），破后敌走浅滩或南土路" },
    { key: A(7, 4), name: "浅滩", note: "河沟唯一可涉处，离东洼最近——敌水车就是从这儿架的" },
    { key: A(1, 3), name: "西南坟地（高程 2）", note: "掩护地形 + 高地，伏击与备用口的首选" },
    { key: A(1, 0), name: "西北树林（高程 2）", note: "阻挡视线的高地掩蔽" },
    { key: A(10, 2), name: "北路入境口", note: "大车路东端" },
    { key: A(10, 6), name: "南路入境口", note: "南土路东端" },
  ],
  ambushSpots: [
    { key: A(1, 3), note: "西南坟地：可隐蔽 + 有掩护，且在高处" },
    { key: A(1, 0), note: "西北树林：挡视线，北路必经之侧" },
    { key: A(5, 4), note: "东洼坟地：地道口就在脚下，打完可以直接钻（但那儿会淹）" },
    { key: A(1, 6), note: "西南树林：南土路进村前最后一处掩蔽" },
  ],

  seedDraws: [
    { key: "axis", count: 5, note: "入境轴线 5 选 1" },
    { key: "mix", count: 3, note: "伪军:日军配比 3 档" },
    { key: "arrive", count: 3, note: "扫荡队到达回合 T5±1" },
    { key: "scoutDir", count: 3, note: "斥候绕向 3 选 1" },
    { key: "sapperJit", count: 3, note: "工兵队时刻 ±1" },
  ],
  approaches: [
    { id: "northRoad", name: "北路 · 大车路直进", brief: "沿大车路过石桥，自村东压来",
      sapperEntry: a4EntrySouth, sapperWay: a4SouthLaneWay, sapperBrief: "工兵队另走南土路直奔东洼的口",
      columns: [{ suffix: "N", entry: a4EntryNorth, take: [0, 1, 2, 3], waypoints: a4NorthRoad }] },
    { id: "northWoods", name: "北路 · 绕树林", brief: "过桥后北折钻树林，压向村北",
      sapperEntry: a4EntryNorth, sapperWay: a4NorthRoad, sapperBrief: "工兵队随后自大车路跟进",
      columns: [{ suffix: "N", entry: a4EntryNorth, take: [0, 1, 2, 3], waypoints: a4Woods }] },
    { id: "southLane", name: "南路 · 土路绕河尾", brief: "绕过河尾走南土路，自村南摸来",
      sapperEntry: a4EntryNorth, sapperWay: a4NorthRoad, sapperBrief: "工兵队随后自大车路跟进",
      columns: [{ suffix: "S", entry: a4EntrySouth, take: [0, 1, 2, 3], waypoints: a4SouthLaneWay }] },
    { id: "ford", name: "浅滩 · 涉水而来", brief: "自河下游浅滩涉水，横穿东洼进村",
      sapperEntry: a4EntryNorth, sapperWay: a4FordWay, sapperBrief: "工兵队也走浅滩跟进——那儿离水最近",
      columns: [{ suffix: "F", entry: a4EntryNorth, take: [0, 1, 2, 3], waypoints: a4FordWay }] },
    { id: "dual", name: "双路 · 分进合击", brief: "一股走大车路，一股绕南土路，两面夹村",
      sapperEntry: a4EntryNorth, sapperWay: a4FordWay, sapperBrief: "工兵队走浅滩，直奔东洼的口",
      columns: [
        { suffix: "N", entry: a4EntryNorth, take: [0, 2], waypoints: a4NorthRoad },
        { suffix: "S", entry: a4EntrySouth, take: [1, 3], waypoints: a4SouthLaneWay },
      ] },
  ],
  mixes: [
    { id: "bayonet", name: "刺刀（四班日军）", units: ["inf", "inf", "inf", "inf"] },
    { id: "mixed", name: "混编（三班日军 + 一队伪军）", units: ["inf", "inf", "inf", "puppet"] },
    { id: "escort", name: "督战（两班日军 + 两队伪军）", units: ["inf", "inf", "puppet", "puppet"] },
  ],
  scoutLoops: [
    { id: "northLoop", name: "北环（先探树林一侧）", entry: a4EntryNorth,
      waypoints: AL([[8, 2], [6, 2], [4, 0], [2, 0], [2, 3], [3, 3], [5, 2]]) },
    { id: "southLoop", name: "南环（先探东洼一侧）", entry: a4EntrySouth,
      waypoints: AL([[8, 6], [5, 5], [5, 4], [3, 3], [1, 3], [2, 0]]) },
    { id: "farmLoop", name: "沿青纱帐（贴农田摸到村西）", entry: a4EntrySouth,
      waypoints: AL([[8, 6], [6, 6], [4, 4], [2, 3], [1, 5], [3, 1]]) },
  ],
  scoutTurn: 3,
  scoutUnits: ["puppet"],
  mainName: "扫荡队",
  mainTarget: "v1",
  mainTurnBase: 5, mainTurnRange: [4, 6], arriveCenter: 1,
  seizeGoal: 0,
  sapperWave: { units: ["sapper", "inf"], delay: 2, range: [6, 8], target: "v1", jitterKey: "sapperJit",
    telegraph: "敌工兵队携风箱柴堆两副、水车两辆随队而来——烟与水都对着地道口去" },

  victory: { civSafeAtLeast: 6, tunnelGrainAtLeast: 8, combatUnitsAtLeast: 1 },
  medals: [
    { key: "noForced", name: "换气", text: "通气孔不少于 2 处，且无一批群众被烟、水或憋闷逼出地面",
      need: { ventsAtLeast: 2, forcedOutAtMost: 0 },
      hint: "通风口修够（≥地道格数的三分之一）敌工兵就不用烟；隔断门与翻板挡得住烟与水" },
    { key: "allEight", name: "一个不落", text: "八批群众一批未失",
      need: { civSafeAtLeast: 8 },
      hint: "水往低处走：东洼那条巷子会淹，人得往西岗带；老弱与伤员一回合只走一格" },
    { key: "highGround", name: "高处", text: "洞存粮不少于 12 担",
      need: { tunnelGrain: 12 },
      hint: "储粮洞修在西岗（高程 2）就淹不着；修在东洼，一次灌水每回合泡毁 2 担" },
  ],
  defeatHints: {
    civSafeAtLeast: "水漫进来就往高处带；关一道隔断门，能把整条低处的巷子切出去",
    tunnelGrainAtLeast: "被淹的储粮洞每回合泡毁 2 担——粮要么修在高处，要么用门把它隔开",
    combatUnitsAtLeast: "烟不杀人，它把人往地面赶；提前修通气孔，别让整个气区靠一个口喘气",
  },
  debrief: {
    cost: "敌人学会了烟、水和刨口。你付出的代价，都是在结构上没算清楚的地方：一条直巷子、一个低处的粮窖、一个没有门的气区。",
    learned: "反制敌人的不是更厚的墙，是更聪明的形状——翻板买一回合，拐弯让烟慢一回合，通气孔让你不必被逼出去，"
      + "而水，永远只往低处走。",
    unlocked: "下一幕：三村相连。你要把这一套用在三个村子上，并且把所有群众在开打之前转移完。",
  },

  phases: [
    { from: 1, to: 2, name: "平静期 · 备战", note: "两回合：先补通气孔（气区靠一个口喘气最危险），再在低处巷口装一道隔断门" },
    { from: 3, to: 4, name: "扫荡期 · 斥候", note: "斥候在翻痕迹；把储粮洞往西岗挪、把人往高处带" },
    { from: 5, to: 8, name: "扫荡期 · 扫荡队与工兵", note: "工兵队携烟具两副、水车两辆；东洼的口最先挨水" },
    { from: 9, to: 12, name: "扫荡期 · 收尾", note: "关门、换气、换孔；把他的行动力池耗到底" },
  ],
  openingChecklist: [
    "① 先看高程：西岗（q 小的那几列）高、东洼（5,4 一带）低。水只往同高或更低处漫",
    "② 修通气孔：气区里没有通风口时，只要口被烟灌了，全区就开始憋闷",
    "③ 在通往东洼的那一段上 DigDoor（1 进度）：关上它，水与烟就过不来",
    "④ 把储粮洞与人窖往高处安排；东洼那个口可以留着做射击孔与诱饵",
  ],
  pitfalls: [
    "把巷子挖成一条直线：烟在直巷子里一回合走一格，拐弯才会慢——直线等于给烟修的路",
    "储粮洞修在东洼：一次灌水，每回合泡毁 2 担，还救不回来",
    "有门不关：隔断门开关是免费动作，但每门每回合只能开合一次——要提前关",
    "通风口太少：气区通风口少于地道格数的三分之一，敌工兵一定优先用烟",
    "把人堆在低处的人窖：水一来，恐慌 +2，两回合就往外冲",
  ],
  tactics: [
    "高地流：储粮洞与主人窖全部安排在西岗（高程 2），东洼只留射击孔与备用口",
    "分区流：主干上每隔两格一道隔断门，把网切成三四间屋子——烟与水一次只能淹一间",
    "换气流：每三格地道配一个通风口，敌工兵的烟就派不上用场，只能改用炸药",
    "翻板流：把翻板压在暴露最高的口上，烟与水都灌不进来，敌人还白费一回合",
    "拐弯流：主干别修成直线；每拐一个弯，烟就多花一回合——这一回合够你把人带走",
  ],
  roster: [
    "民兵组 ×3（HP3 攻2 MP2 挖2）：挖门、挖通气孔、守射击孔；带路一次 2 批",
    "游击班 ×2（HP4 攻2 MP3 挖1）：野战与守洞；带路一次 1 批",
    "联络员 ×1（HP2 攻0 MP4 视野3）：带路一次 3 批——八批群众全靠他调度",
  ],
  counterNotes: [
    "工兵班：烟具两副、水车两辆都在它手上；打死它，烟与水一起断",
    "日军班：搜索力 2，谨慎升级再 +1；它蹲哪儿，哪个口就撑不住",
    "伪军队：1 格内没有日军班时搜索力为 0",
    "敌「刨口」不需要工兵：任何一队围住已知的口，一回合就能把它刨掉——所以口要么伪装、要么翻板",
  ],
  facilityNotes: [
    "通气孔：等效隐蔽 2（阈值 6 豆），气区有它就不憋闷；数量够多还能逼敌工兵放弃烟攻",
    "隔断门（挖在边上，1 进度）：关上挡烟、挡水、切气区；开关免费但每门每回合一次",
    "翻板：挡烟、挡水，还能让敌人的作业白费一回合——用过要重修",
    "射击孔：地下打地面；同一个孔连着打会被锁定，要换地方",
    "储粮洞 8 担 / 藏人室 6 铺：高程决定它们淹不淹得着",
  ],
  ledgerNotes: [
    "粮食被夺：敌到村 2 格内每回合搜走 2 担；进村征粮另算 2 担/回合；**被淹的储粮洞每回合泡毁 2 担**",
    "群众被抓：粮净空后抓丁 1 批/回合；被烟/水/憋闷逼出地面而地面有敌，当场被抓",
    "房屋被焚：报复队与驻剿队才会烧",
    "群众罹难：爆破塌方压住藏身处，或彻底无路可出时才会发生（烟与水本身不杀人）",
  ],
  gradeNotes: gaoGradeNotes,
  objectives: [
    "守住：终局至少保住 6 批群众（全村共 8 批）、洞存粮 ≥8 担、战斗单位 ≥1",
    "别丢：被淹的储粮洞每回合泡毁 2 担；被烟逼出地面而地面有敌 = 群众当场被抓",
    "争取：通气孔 ≥2 且无人被逼出地面 · 八批群众一批未失 · 洞存粮 ≥12——三枚勋记",
  ],
  digest: [
    "高程：每格有 0/1/2 三档。**水只往同高或更低的相邻格漫**，关闭的隔断门与翻板挡得住。",
    "灌水：淹到的格恐慌/憋闷 +2；被淹的储粮洞每回合泡毁 2 担（入代价簿）。水漫 3 回合、滞留 3 回合。",
    "烟：沿开放边一回合一格，**拐一个弯要多花一回合**；关闭的隔断门与完好的翻板阻断。",
    "通气孔（DigFacility vent，2 进度）：气区里有未被熏的通风口就不憋闷；通风口 ≥ 地道格数/3 时敌不用烟。",
    "隔断门（DigDoor，1 进度，挖在边上）：关上挡烟挡水切气区；ToggleDoor 是免费动作，每门每回合一次。",
    "翻板：敌对该口作业时踩空，整队一回合；同时挡烟挡水。用过要重修（2 进度）。",
    "恐慌与憋闷是同一套压力：满 3 就上地面，地面有敌就被抓。",
    "胜负只认群众保全与洞存粮。",
  ],
  orderOfBattle: [
    "斥候：伪军一队，第三日入境",
    "扫荡队：按编成 4 队，第四至第六日进村",
    "工兵队：工兵一班 + 步兵一班，第六至第八日跟进，携烟具两副、水车两辆",
    "敌反地道六手：烟、水、爆破、攻入、刨口、封堵——按暴露最高的口挨个来",
  ],
  intelTimeline: [
    { turn: 1, text: "内线：敌人学乖了。这一趟他们带了风箱柴堆，还带了水车" },
    { turn: 2, text: "内线：水只往低处走。东洼那条巷子是最先要淹的——粮和人，往西岗挪" },
    { turn: 3, text: "内线：敌已出据点。自本日起，明处的粮每日被搜走两担" },
    { turn: 4, text: "内线：气区通风口少于地道格三分之一时，工兵一定先用烟；修够通风口，他只能改用炸药" },
    { turn: 5, text: "内线：烟在直巷子里一回合走一格；拐一个弯，它要多走一回合" },
    { turn: 6, text: "内线：工兵队携烟具与水车已过桥，先奔暴露最高的那个口" },
    { turn: 8, text: "内线：翻板压着的口，烟灌不进、水漫不进，敌人还得白费一天" },
    { turn: 11, text: "内线：敌押运队在据点等车，扫荡不会拖过第十二日" },
  ],
  briefing: [
    "冀中军区第▲分区 敌情通报（节录）：",
    "敌屡搜不获，已换手段：携风箱柴堆放烟、架水车灌水，并以锹镐直接刨口。",
    "先遣伪军斥候一队，约第三日{SCOUT}。",
    "扫荡队{MIX}，约第{ARRIVE}日{AXIS}。",
    "另据报：{SAPPER}。",
    "地势：村西为岗（高），村东为洼（低）。**水只往同高或更低处漫**——此为本役第一要义。",
    "指示：一、气区须有通气孔，否则口一被灌，全区憋闷；通风口修足地道格三分之一，敌即不用烟；",
    "      二、主干每隔两格设隔断门一道，关上则烟与水俱不得过；开关不费主动作，但每门每回合只能动一次；",
    "      三、巷子勿修作直线——烟在直巷一回合一格，拐弯则须多费一回合，那一回合是留给你带人的；",
    "      四、翻板压在最招眼的口上：挡烟、挡水，且使敌作业白费一日。",
    "又：被淹的储粮洞每日泡毁二担，入代价簿。粮与人，皆宜安置在高处。",
  ],
};

// ===========================================================================
// 第五幕《反扫荡》—— 村村相连（高潮）
// ===========================================================================

const a5Rows = [
  "..WW.F.FFR.",
  ".FVVF.FVVR.",
  ".FVV.F.VFR.",   // y2 北大车路；x9 木桥
  ".GFFFWWF.R.",
  "..FFF.FG.R.",   // y4 x9 浅滩
  ".WFVVF.F.R.",
  "..FFF......",   // y6 南土路
  "...........",
  "...........",
];

const a5Elev = [
  "22111100000",
  "22111100000",
  "22111000000",
  "22111000000",
  "21110000000",
  "21110000000",
  "21100000000",
  "11000000000",
  "11000000000",
];

const a5Gao = AL([[2, 1], [3, 1], [2, 2], [3, 2]]);      // 高家庄（区队部）
const a5Li = AL([[7, 1], [8, 1], [7, 2]]);                // 李庄（余粮最多）
const a5Ma = AL([[3, 5], [4, 5]]);                        // 马家河（安全村）

const a5Villages = [
  { id: "v1", name: "高家庄", hexKeys: a5Gao, grainOpen: 8, organize: 1, hasHq: true,
    note: "区队部；起始网 4 格 2 口" },
  { id: "v2", name: "李庄", hexKeys: a5Li, grainOpen: 12, organize: 0, hasHq: false,
    note: "余粮最多、离主干最远——救不救它是本幕第一个抉择" },
  { id: "v3", name: "马家河", hexKeys: a5Ma, grainOpen: 4, organize: 0, hasHq: false,
    note: "地势最高、离大路最远：群众最终要全部转移到这里" },
];

const a5EntryNorth = A(10, 2);
const a5EntrySouth = A(10, 6);

const a5 = {
  id: "A5", act: 5, name: "反扫荡", subtitle: "第五幕 · 村村相连",
  maxTurns: 14, sweepStartTurn: 3, hardEndTurn: 14,
  pool: 26, decay: 0, smokeCharges: 2, floodCharges: 2, ammoStart: 10, sweepGrainLoss: 1,
  storageCap: 8, shelterCap: 6,
  enemyOps: ["smoke", "flood", "blast", "breach", "excavate", "seal"],
  opPriority: ["smoke", "flood", "blast", "breach", "excavate", "seal"],
  bridgeBreakable: true,

  unlocks: {
    actions: ["Move", "UseEntrance", "Dig", "DigEntrance", "DigFacility", "DigDoor", "ToggleDoor",
      "Disguise", "GuideCivs", "MoveCivs", "HideGrain", "CoverTraces", "BreakRoad", "Hide", "Feint",
      "Organize", "Collapse", "Ambush", "Attack", "Rest"],
    facilities: ["storage", "shelter", "vent", "fightpost", "trapdoor"],
    disguises: ["stove", "well", "kang", "trough"],
    civGuidance: true,
    newThisAct: [
      { key: "crossVillage", name: "跨村地道网", note: "三个村之间挖通：高家庄—马家河 3 格、高家庄—李庄 4 格；段成本 2（挖进村庄格 1）" },
      { key: "evacuate", name: "全员转移", note: "十批群众要在开打前全部带进地道——这是带路机制的最终考验" },
      { key: "multiPost", name: "多射击孔协同", note: "把敌人放进村，从几个不同的孔轮流开火：每个孔只打一枪，然后换" },
    ],
  },
  lessons: [
    "一、把三个村的地道连起来：一个村站不住，人可以从地下走到另一个村。",
    "二、开打之前先把人全部转移完——十批群众，联络员一次只带 3 批。",
    "三、把他们放进村，从几个不同的射击孔轮流开火。这一幕不是躲，是把整片村庄变成一件武器。",
  ],

  hexes: BuildHexes(a5Rows, [...FullRow(2), ...FullRow(6)], [[9, 2]], [[9, 4]], a5Villages, a5Elev),
  villages: a5Villages,
  supplyRoad: AL([[5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6]]),
  exitKeys: [a5EntryNorth, a5EntrySouth],
  allies: [
    { type: "militia", at: A(2, 1) }, { type: "militia", at: A(3, 2) }, { type: "militia", at: A(3, 5) },
    { type: "guerrilla", at: A(2, 2) }, { type: "guerrilla", at: A(7, 1) }, { type: "runner", at: A(2, 1) },
  ],
  tunnels: {
    cells: AL([[2, 1], [3, 1], [2, 2], [3, 2], [3, 5], [7, 1]]),
    edges: [[A(2, 1), A(3, 1)], [A(2, 1), A(2, 2)], [A(2, 2), A(3, 2)]],
    entrances: AL([[2, 1], [3, 2], [3, 5], [7, 1]]),
    facilities: [[A(2, 1), "storage"], [A(2, 2), "shelter"], [A(3, 5), "shelter"], [A(3, 1), "fightpost"]],
    disguises: [[A(2, 1), "stove"], [A(3, 5), "trough"]],
  },
  civBatches: [
    { kind: "old", village: "v1", count: 2 },
    { kind: "young", village: "v1", count: 2 },
    { kind: "wounded", village: "v1", count: 1 },
    { kind: "old", village: "v2", count: 1 },
    { kind: "young", village: "v2", count: 2 },
    { kind: "old", village: "v3", count: 1 },
    { kind: "young", village: "v3", count: 1 },
  ],

  landmarks: [
    { key: A(2, 1), name: "高家庄 · 区队部", note: "即败条件绑定此处：被驻剿纵队占住 2 回合即告失利；起始粮窖与灶台口在此" },
    { key: A(3, 1), name: "高家庄 · 射击孔", note: "起始射击孔；协同开火至少还要再修两个" },
    { key: A(7, 1), name: "李庄", note: "余粮 12 担、群众 3 批；离主干 4 段——救不救它是本幕第一个抉择" },
    { key: A(3, 5), name: "马家河", note: "地势最高、离大路最远的安全村；起始人窖与牲口槽口在此（口子大，带路一次多带 1 批）" },
    { key: A(9, 2), name: "木桥", note: "北大车路唯一跨河点，可破；破后北路须南绕" },
    { key: A(9, 4), name: "浅滩", note: "河沟唯一可涉处，破桥也拦不住这一路" },
    { key: A(5, 3), name: "中部树林", note: "南北两轴之间的掩蔽带，机动队最容易被拦在这里" },
    { key: A(7, 4), name: "东部坟地", note: "李庄与南土路之间的伏击位" },
    { key: A(1, 3), name: "西南坟地（高程 2）", note: "高家庄西侧的高地掩蔽" },
    { key: A(10, 2), name: "北路入境口", note: "北大车路东端" },
    { key: A(10, 6), name: "南路入境口", note: "南土路东端" },
  ],
  ambushSpots: [
    { key: A(5, 3), note: "中部树林：两轴之间，主力与助攻都可能从旁边过" },
    { key: A(7, 4), note: "东部坟地：李庄外围唯一有掩护的伏点" },
    { key: A(1, 3), note: "西南坟地：区队部的最后一道掩护" },
    { key: A(1, 5), note: "西南树林：马家河与高家庄之间的掩蔽" },
  ],

  seedDraws: [
    { key: "axis", count: 4, note: "主攻轴线 4 选 1" },
    { key: "mix", count: 3, note: "主力编成 3 档" },
    { key: "arrive", count: 3, note: "主力到达回合 T6±1" },
    { key: "scoutDir", count: 3, note: "斥候绕向 3 选 1" },
    { key: "supportJit", count: 3, note: "助攻时刻 ±1" },
    { key: "sapperJit", count: 3, note: "工兵队时刻 ±1" },
    { key: "reserveJit", count: 3, note: "预备队时刻 ±1" },
  ],
  approaches: [
    { id: "northMain", name: "北路主攻 · 直扑高家庄", brief: "自北大车路过木桥，直扑区队部",
      sapperEntry: a5EntrySouth, sapperWay: AL([[8, 6], [6, 6], [4, 6], [3, 5]]),
      sapperBrief: "工兵队走南土路，先奔马家河一线的口",
      columns: [{ suffix: "N", entry: a5EntryNorth, take: [0, 1, 2, 3],
        waypoints: AL([[8, 2], [6, 2], [4, 2], [3, 2]]), target: "v1" }] },
    { id: "northLi", name: "北路主攻 · 先扑李庄", brief: "自北大车路过木桥，先扑李庄的余粮",
      sapperEntry: a5EntryNorth, sapperWay: AL([[8, 2], [6, 2], [4, 2]]),
      sapperBrief: "工兵队随后自北大车路跟进",
      columns: [{ suffix: "N", entry: a5EntryNorth, take: [0, 1, 2, 3],
        waypoints: AL([[8, 2], [8, 1], [7, 1]]), target: "v2" }] },
    { id: "southMain", name: "南路主攻 · 经马家河北上", brief: "自南土路进境，穿马家河北上压区队部",
      sapperEntry: a5EntryNorth, sapperWay: AL([[8, 2], [6, 2], [4, 2]]),
      sapperBrief: "工兵队自北大车路跟进",
      columns: [{ suffix: "S", entry: a5EntrySouth, take: [0, 1, 2, 3],
        waypoints: AL([[8, 6], [6, 6], [4, 6], [4, 5], [3, 4], [3, 2]]), target: "v1" }] },
    { id: "dual", name: "双路 · 分进合击", brief: "一股走北大车路扑李庄，一股走南土路穿马家河",
      sapperEntry: a5EntryNorth, sapperWay: AL([[8, 2], [6, 2], [4, 2]]),
      sapperBrief: "工兵队自北大车路跟进",
      columns: [
        { suffix: "N", entry: a5EntryNorth, take: [0, 2], waypoints: AL([[8, 2], [8, 1], [7, 1]]), target: "v2" },
        { suffix: "S", entry: a5EntrySouth, take: [1, 3], waypoints: AL([[8, 6], [6, 6], [4, 6], [4, 5]]), target: "v3" },
      ] },
  ],
  mixes: [
    { id: "bayonet", name: "刺刀（四班日军）", units: ["inf", "inf", "inf", "inf"] },
    { id: "mixed", name: "混编（三班日军 + 一队伪军）", units: ["inf", "inf", "inf", "puppet"] },
    { id: "escort", name: "督战（两班日军 + 两队伪军）", units: ["inf", "inf", "puppet", "puppet"] },
  ],
  scoutLoops: [
    { id: "northLoop", name: "北环（先探李庄）", entry: a5EntryNorth,
      waypoints: AL([[8, 2], [8, 1], [7, 2], [5, 2], [4, 2], [4, 1]]) },
    { id: "southLoop", name: "南环（先探马家河）", entry: a5EntrySouth,
      waypoints: AL([[8, 6], [6, 6], [4, 6], [4, 5], [3, 4], [2, 3]]) },
    { id: "midLoop", name: "中环（沿坟地树林横穿）", entry: a5EntryNorth,
      waypoints: AL([[8, 2], [7, 3], [5, 3], [4, 4], [2, 3], [1, 3]]) },
  ],
  scoutTurn: 3,
  scoutUnits: ["puppet"],
  mainName: "主力",
  mainTarget: "v1",
  mainTurnBase: 6, mainTurnRange: [5, 7], arriveCenter: 1,
  seizeGoal: 0,
  sapperWave: { units: ["sapper", "inf"], delay: 3, range: [8, 10], target: "v1", jitterKey: "sapperJit",
    telegraph: "敌工兵队携烟具两副、水车两辆随队而来" },
  extraWaves: [
    { id: "A5support", kind: "march", role: "march", turn: 8, jitterKey: "supportJit",
      units: ["inf", "inf", "puppet"], entry: A(10, 6), exit: A(10, 6), target: "v3",
      waypoints: AL([[8, 6], [6, 6], [4, 6], [4, 5]]),
      telegraph: "内线电报：助攻三个班明日自南土路合击，指向马家河" },
    { id: "A5reserve", kind: "reserve", role: "mobile", turn: 11, jitterKey: "reserveJit",
      units: ["inf", "inf"], axisKillsNeed: 2, waypoints: [],
      telegraph: "内线电报：敌预备队待命——哪条轴上折的班多，明日就投向哪条轴" },
  ],
  decisionTurn: 12,
  garrisonPriority: ["v1", "v2", "v3"],

  victory: { civSafeAtLeast: 8, villagesAtLeast: 2, tunnelGrainAtLeast: 8, combatUnitsAtLeast: 1 },
  defeat: { hqOccupiedTurns: 2, civLostRatioAbove: 0.5 },
  medals: [
    { key: "linkedVillages", name: "村村相连", text: "三个村的地道连成一片（跨村贯通）",
      need: { villagesLinkedAtLeast: 3 },
      hint: "高家庄—马家河 3 段、高家庄—李庄 4 段；挖进村庄格只要 1 进度，先挖近的那条" },
    { key: "allTen", name: "一个不落", text: "十批群众一批未失",
      need: { civSafeAtLeast: 10 },
      hint: "李庄的三批要靠跨村地道接过来；联络员一次 3 批，老弱一回合走一格——第一回合就得开始" },
    { key: "expel", name: "逼退", text: "把敌军逼退（行动力池耗尽，提前收队）",
      anyOf: { expelled: true },
      hint: "行动力池 26：多射击孔轮流开火、翻板拦一回合、让他们在空村里扑空，都在耗它" },
  ],
  defeatHints: {
    civSafeAtLeast: "十批群众要提前转移；跨村地道是唯一能把李庄的人接出来的路",
    villagesAtLeast: "村子是被一处处烧掉的：T12 之后敌若占村就转驻剿，每回合烧房抓丁",
    tunnelGrainAtLeast: "李庄的 12 担粮要靠跨村主干才救得下——或者干脆放弃它，保人要紧",
    combatUnitsAtLeast: "预备队会投向你杀伤最高的那条轴：打得太狠反而引火烧身",
  },
  debrief: {
    cost: "三个村、十批人、两条主干。你付出的每一分代价，都是某一段没挖通、某一批人没带走。",
    learned: "把整片村庄变成一件武器：地下连成一片，地上就没有孤村。前四幕学到的东西——连通、多口、伪装、"
      + "带路、换孔、翻板、通气、隔断门、高低差——在这一幕同时用上。",
    unlocked: "战役到此为止。代价簿上的数字不会消失，它是这套地道换来的：越往后，它越小。",
  },

  phases: [
    { from: 1, to: 1, name: "平静期 · 只有一回合", note: "第一手就决定这一局的形状：先挖哪条主干、先接哪个村的人" },
    { from: 2, to: 5, name: "扫荡期 · 渗透", note: "斥候两路；这几回合要把跨村主干挖出来、把群众开始往里带" },
    { from: 6, to: 9, name: "扫荡期 · 合围", note: "主力与助攻先后压上；群众必须在这之前全部进地道" },
    { from: 10, to: 12, name: "扫荡期 · 反击", note: "把他们放进村，从多个射击孔轮流开火；每个孔只打一枪" },
    { from: 13, to: 14, name: "扫荡期 · 判定与收尾", note: "T12 占村者转驻剿（烧房抓丁）；区队部被占满两回合即败" },
  ],
  openingChecklist: [
    "① 定主干方向：高家庄—马家河只有 3 段（马家河地势最高，是天然的安全村）；高家庄—李庄 4 段但那儿有 12 担粮",
    "② 联络员立刻开始带人：十批群众，一次 3 批，老弱一回合只走一格",
    "③ 民兵分头开挖，别挤在同一个工地（同一工地同回合只容一人施工）",
    "④ 游击班一支守区队部、一支守李庄；射击孔至少要有两个，且互相走得通",
  ],
  pitfalls: [
    "主干只有一条线：一次爆破断段，跨村转移与勋记一起没了——修隔断门、留备用段",
    "群众转移得太晚：主力 T5~T7 就到，之后村里的人一批批被抓",
    "打得太狠：预备队会投向你杀伤最高的那条轴——歼敌不计分，逼退才算",
    "只守区队部：T12 判定时敌若占住任何一个有粮有口的村，就转驻剿烧房",
    "射击孔连着打：第二枪只伤 1，还把敌人引到这一格",
  ],
  tactics: [
    "接人流：先挖高家庄—马家河（3 段），把三个村的人全部集中到地势最高的马家河",
    "抢粮流：赌高家庄—李庄那条 4 段的长主干，把 12 担粮抢回地下，代价是暴露豆与工期",
    "空村流：T12 之前把三村的粮与人全部转入地下，敌占了村也无可剿——判定时他只能沿大路收队",
    "多孔流：三个村各留一个射击孔，敌进村就轮流开火，每个孔只打一枪然后换",
    "阻援流：破木桥 + 破南北补给线，让主力与助攻不能同时到位",
  ],
  roster: [
    "民兵组 ×3（HP3 攻2 MP2 挖2）：三条主干全靠它们挖；带路一次 2 批",
    "游击班 ×2（HP4 攻2 MP3 挖1）：一支守区队部、一支守李庄；带路一次 1 批",
    "联络员 ×1（HP2 攻0 MP4 视野3）：带路一次 3 批——十批群众的转移全指望他",
  ],
  counterNotes: [
    "日军班：主力四队全是它或以它为主，正面打不过——靠射击孔、伏击、守洞打退攻入",
    "伪军队：督战规则同前；助攻队里那一队伪军是软肋",
    "工兵班：烟具两副、水车两辆都在它手上；打死它 -2 池，且烟与水一起断",
    "预备队：只在某条轴线折损 ≥2 个班时才投放到那条轴",
  ],
  facilityNotes: [
    "储粮洞 8 担 / 藏人室 6 铺：三个村至少要两间人窖、两个粮窖",
    "通气孔：跨村主干长，气区大，通风口不足最容易被烟一锅端",
    "隔断门：主干上每隔两格一道——断段与灌烟都不至于让整张网瘫痪",
    "射击孔：三个村各一个，互相走得通才叫「协同」",
    "翻板：压在最招眼的那个口上",
  ],
  ledgerNotes: [
    "粮食被夺：敌到村 2 格内每回合搜走 1 担；进村征粮另算 2 担/回合；被淹的储粮洞每回合泡毁 2 担",
    "群众被抓：粮净空后抓丁 1 批/回合；T12 之后驻剿队每回合再抓 1 批；攻入得手则藏身处整间被端",
    "房屋被焚：T12 之后驻剿队每回合烧 1 处；一个村的格全烧光就算「村没了」",
    "群众罹难：爆破塌方压住藏身处，或彻底无路可出时才会发生",
  ],
  gradeNotes: gaoGradeNotes,
  objectives: [
    "守住：终局至少保住 9 批群众（三村共 10 批）、存活村 ≥2、洞存粮 ≥8 担、战斗单位 ≥1",
    "别丢：区队部（高家庄）被驻剿纵队占满 2 回合即败；群众损失过半即败",
    "争取：三村地道连成一片 · 十批群众一批未失 · 把敌逼退——三枚勋记",
  ],
  digest: [
    "三个村：高家庄（区队部，2,1 一带）、李庄（余粮 12 担，7,1 一带）、马家河（地势最高，3,5 一带）。",
    "跨村挖掘：高家庄—马家河 3 段、高家庄—李庄 4 段；段 2 进度，挖进村庄格 1 进度。",
    "群众十批分在三村；只有把地道挖过去，才带得出来。",
    "多射击孔协同：每个孔只打一枪，然后换——同一个孔连打第二枪只伤 1，还会被咬住。",
    "敌反地道六手全开：烟、水、爆破、攻入、刨口、封堵。",
    "T12 判定：敌若占住有粮有口的村 → 转驻剿（烧房抓丁）；一无所获 → 沿大路收队。",
    "区队部被驻剿纵队占满 2 回合即败；群众损失过半即败。",
  ],
  orderOfBattle: [
    "斥候：伪军一队，第二日入境",
    "主力：按编成 4 队，第五至第七日自主攻轴进逼",
    "助攻：三个班，第七至第九日自南土路合击马家河",
    "工兵队：工兵 + 一个班，第八至第十日跟进，携烟具两副、水车两辆",
    "预备队：两个班，第十至第十二日投放到我方杀伤最高的那条轴；两轴皆轻则按兵不出",
    "T12 判定：占村者转驻剿搜毁；未得手则沿大路收队",
  ],
  intelTimeline: [
    { turn: 1, text: "内线：敌大举扫荡，三村同时受压。区队部的意思是——这次不躲了" },
    { turn: 2, text: "内线：先把三个村的地道连起来。高家庄到马家河只有三段，那儿地势最高" },
    { turn: 3, text: "内线：李庄的十二担粮和三批人，只有跨村地道接得出来" },
    { turn: 5, text: "内线：主力将自主攻轴进逼——群众必须在这之前全部进地道" },
    { turn: 6, text: "内线：敌按「暴露」排队撬口——烟、水、炸药、锹镐，都对着豆子最多的那个口" },
    { turn: 8, text: "内线：助攻三个班自南土路合击马家河" },
    { turn: 10, text: "内线：敌若在哪条轴上折了两个班以上，预备队就投向哪条轴" },
    { turn: 11, text: "内线：第十二日是节点——占住村子就转驻剿搜毁，没得手就沿大路收队" },
    { turn: 13, text: "内线：驻剿队每日烧房、抓丁；区队部被驻占满两回合即告失利" },
  ],
  briefing: [
    "冀中军区第▲分区 敌情通报（节录）：",
    "敌集结重兵，对高家庄、李庄、马家河一带大举扫荡。",
    "先遣伪军斥候一队，约第二日{SCOUT}。",
    "主力{MIX}，约第{ARRIVE}日{AXIS}；其后三个班自南土路合击马家河。",
    "另据报：{SAPPER}——烟、水、炸药俱备。",
    "第十二日为节点：敌若已占村，转入驻剿搜毁；未得手，则沿大路收队。",
    "指示：一、三村地道即刻贯通——高家庄至马家河三段，至李庄四段，挖进村庄格只要一进度；",
    "      二、群众十批须在主力到达之前**全部**转入地下：联络员一次带三批，老弱伤员一回合只走一格；",
    "      三、待其进村，自数处射击孔轮番开火——**每孔只打一枪，随即换处**；",
    "      四、翻板、隔断门、通气孔、高低差，前四役所学，此役并用。",
    "又：区队部即高家庄，被敌驻剿纵队占满两回合即告失利；群众损失过半亦为失利。",
    "又：歼敌仍不计功——逼退方为胜。代价簿照记，群众一批不可轻掷。",
  ],
};

// ---------------------------------------------------------------------------
// 关卡注册表（L1/L2 保留为别名，供旧链接 ?level=L1 落到第一幕）
// ---------------------------------------------------------------------------

export const levelDefinitions = Object.freeze({ A1: a1, A2: a2, A3: a3, A4: a4, A5: a5 });

export const campaignOrder = Object.freeze(["A1", "A2", "A3", "A4", "A5"]);

const levelAliases = Object.freeze({ L1: "A1", L2: "A5" });

export function GetLevel(levelId) {
  const level = levelDefinitions[levelId] || levelDefinitions[levelAliases[levelId]];
  if (!level) throw new Error(`未知关卡：${levelId}`);
  return level;
}

/** 下一幕（终局复盘的「解锁了什么」要指得出去处）。 */
export function NextLevelId(levelId) {
  const index = campaignOrder.indexOf(GetLevel(levelId).id);
  return index >= 0 && index + 1 < campaignOrder.length ? campaignOrder[index + 1] : null;
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

const Clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

/**
 * 五幕共用一个排程器：斥候 → 主力（按轴线 × 配比 × 到达回合）→ 工兵 → 额外波次 → 判定波。
 * 「这一局长什么样」全部写在各幕的数据里，规则脚本只负责抽签与执行。
 */
export function BuildSchedule(level, plan) {
  const schedule = [];
  const approach = level.approaches[(plan.axis || 0) % level.approaches.length];
  const mix = level.mixes[(plan.mix || 0) % level.mixes.length];
  plan.axisId = approach.id;
  plan.mixId = mix.id;

  if (level.scoutLoops && level.scoutLoops.length) {
    const loop = level.scoutLoops[(plan.scoutDir || 0) % level.scoutLoops.length];
    plan.scoutId = loop.id;
    schedule.push(WaveEntry({ id: `${level.id}scout`, kind: "scout", turn: level.scoutTurn, role: "scout",
      entry: loop.entry, exit: loop.entry, units: (level.scoutUnits || ["puppet"]).slice(),
      waypoints: loop.waypoints,
      telegraph: `内线电报：伪军斥候一队明日自 ${loop.entry} 入境，${loop.name}` }));
  }

  const arriveTurn = Clamp(level.mainTurnBase + ((plan.arrive || 0) - (level.arriveCenter ?? 1)),
    level.mainTurnRange[0], level.mainTurnRange[1]);
  plan.arriveTurn = arriveTurn;
  for (const part of approach.columns) {
    const units = part.take.map((index) => mix.units[index]).filter(Boolean);
    if (!units.length) continue;
    schedule.push(WaveEntry({ id: `${level.id}main${part.suffix}`, kind: "march", turn: arriveTurn, role: "march",
      entry: part.entry, exit: part.entry, units, waypoints: part.waypoints,
      target: part.target || level.mainTarget || "v1", seizeGoal: level.seizeGoal || 0,
      telegraph: `内线电报：${level.mainName || "敌一部"}（${units.length} 队）明日自 ${part.entry} 入境——${approach.brief}` }));
  }

  if (level.sapperWave) {
    const jitter = level.sapperWave.jitterKey ? ((plan[level.sapperWave.jitterKey] || 0) - 1) : 0;
    const turn = Clamp(arriveTurn + (level.sapperWave.delay || 1) + jitter,
      level.sapperWave.range[0], level.sapperWave.range[1]);
    plan.sapperTurn = turn;
    schedule.push(WaveEntry({ id: `${level.id}sapper`, kind: "sapper", turn, role: "sapper",
      entry: approach.sapperEntry, exit: approach.sapperEntry, units: level.sapperWave.units.slice(),
      waypoints: approach.sapperWay, target: level.sapperWave.target || "v1",
      telegraph: `内线电报：${level.sapperWave.telegraph}（明日自 ${approach.sapperEntry} 入境）` }));
  }

  for (const extra of level.extraWaves || []) {
    const jitter = extra.jitterKey ? ((plan[extra.jitterKey] || 0) - 1) : 0;
    const turn = Clamp((extra.turn || 6) + jitter, 2, level.hardEndTurn);
    schedule.push(WaveEntry({ ...extra, turn }));
  }

  if (level.decisionTurn) {
    schedule.push(WaveEntry({ id: `${level.id}decision`, kind: "decision", turn: level.decisionTurn }));
  }
  schedule.sort((a, b) => (a.turn - b.turn) || (a.id < b.id ? -1 : 1));
  return schedule;
}

// ---------------------------------------------------------------------------
// 简报（把 seed 抽定的路线/配比/时刻写进档案；情报 100% 真实，无假情报）
// ---------------------------------------------------------------------------

const cnNumbers = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六"];

export function BuildBriefing(level, plan) {
  const safe = plan || {};
  const approach = level.approaches[(safe.axis || 0) % level.approaches.length];
  const mix = level.mixes[(safe.mix || 0) % level.mixes.length];
  const loops = level.scoutLoops || [];
  const loop = loops.length ? loops[(safe.scoutDir || 0) % loops.length] : null;
  const arrive = safe.arriveTurn || level.mainTurnBase;
  const sapper = safe.sapperTurn || (arrive + ((level.sapperWave && level.sapperWave.delay) || 1));
  const northEntry = level.exitKeys[0];
  return level.briefing.map((line) => line
    .replace("{SCOUT}", loop ? `自${loop.entry === northEntry ? "北大车路" : "南土路"}入境，${loop.name}` : "入境侦察")
    .replace("{MIX}", mix.name)
    .replace("{ARRIVE}", cnNumbers[arrive] || String(arrive))
    .replace("{AXIS}", approach.brief)
    .replace("{SAPPER}", level.sapperWave
      ? `约第${cnNumbers[sapper] || sapper}日，${approach.sapperBrief}`
      : "此役敌无工兵"));
}

/** 幕次卡：开场简报页与 HUD 都用它（剧情 + 三行「这一幕你要学会什么」+ 本幕新解锁）。 */
export function BuildActCard(level) {
  return {
    id: level.id,
    act: level.act,
    name: level.name,
    subtitle: level.subtitle,
    lessons: (level.lessons || []).slice(),
    unlocked: ((level.unlocks && level.unlocks.newThisAct) || []).map((entry) => ({ ...entry })),
    debrief: { ...(level.debrief || {}) },
    nextId: NextLevelId(level.id),
    nextName: NextLevelId(level.id) ? levelDefinitions[NextLevelId(level.id)].name : null,
  };
}
