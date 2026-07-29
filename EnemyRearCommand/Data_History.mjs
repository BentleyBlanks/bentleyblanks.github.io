// 《烽线 · 敌后指挥》 —— 历史层数据模块。
//
// 本模块只放"史实氛围"相关的纯数据与纯查询函数：五个时期的定义、回合到季度日期的换算、
// 按回合与局势触发的历史事件、地块与单位的史料风味短句、时代文献风格的引语、多结局评价文本。
//
// 硬性约束（与规格书第 2、7 节一致）：
//   1. 纯逻辑模块。不得引用 window / document / three / Math.random，必须能被 node 直接 import。
//   2. 平民伤亡、流离、被焚村庄、被夺粮食、骨干损失只写入 ledger 代价账本，
//      任何事件选项都不得把这些代价转化成资源、群众基础或分数。
//   3. 引语一律使用泛化出处（"边区通讯""根据地干部回忆"等），不伪造任何真实历史人物的原话与署名。
//   4. 地名、村名、番号均为虚构，本作是华北敌后一个县域的综合化演绎，不复刻具体地点与具体受害者。
//
// 时间轴：一回合 = 一个季度，turn 0 = 1937 年秋，turn 31 = 1945 年夏，共 32 回合。
// 1945 年日本投降是不可改写的史实终点；玩家能改变的是代价、存续与建设。

// ---------------------------------------------------------------------------
// 史实框架声明（开场展示，也用于内容提示页）
// ---------------------------------------------------------------------------

export const historicalFrame = Object.freeze({
  place: "华北敌后 · 虚构的太行东麓某县",
  period: "1937年秋 — 1945年夏",
  statement:
    "本作的县城、村庄、河流、番号全部虚构，是华北敌后若干县域的综合化演绎，不复刻具体地点，也不复刻具体的受害者与加害者个人。",
  boundary:
    "游戏里的部队、地方党组织、民兵与群众都不是无所不能的。他们缺粮、缺药、缺子弹，识字的人很少，能派出去的干部更少。多数时候要在'保住人'和'守住地方'之间选一个。",
  ending:
    "1945年8月日本宣布投降，这个结局不会因为玩家的任何操作而改变。你能改变的是这八年里人民与组织付出多大代价，根据地是不是撑住了，撑住之后留下了什么。",
  ledgerNote:
    "被杀害的群众、被烧的村子、流离失所的人口、被抢走的粮食、牺牲的骨干，只记在'代价账本'里。它们不会变成资源，不会变成分数，也不会给你任何加成。",
  toneNote:
    "侵略军的暴行按史实陈述，采用档案式的事实语言，不做感官刺激式的渲染，不提供任何以杀戮为爽点的内容。",
});

// ---------------------------------------------------------------------------
// 季度日期
// ---------------------------------------------------------------------------

export const seasonNames = Object.freeze(["春", "夏", "秋", "冬"]);
export const totalTurns = 32;
const firstYear = 1937;
const firstSeasonIndex = 2; // 0=春 1=夏 2=秋 3=冬，起始为 1937 年秋

/** 农事口径的季节别名，事件与风味文本可用来对上"麦收""秋收""春荒"。 */
export const seasonAgronomy = Object.freeze({
  春: Object.freeze({ key: "Spring", work: "春耕下种", hazard: "春荒", daylight: 0.55 }),
  夏: Object.freeze({ key: "Summer", work: "麦收与夏锄", hazard: "山洪", daylight: 0.75 }),
  秋: Object.freeze({ key: "Autumn", work: "秋收护秋", hazard: "抢粮", daylight: 0.5 }),
  冬: Object.freeze({ key: "Winter", work: "冬学与整训", hazard: "封冻与缺棉", daylight: 0.3 }),
});

function BuildSeasonLabels() {
  const labels = [];
  for (let turn = 0; turn < totalTurns; turn += 1) {
    const absolute = firstSeasonIndex + turn;
    const year = firstYear + Math.floor(absolute / 4);
    const season = seasonNames[absolute % 4];
    labels.push(
      Object.freeze({
        turn,
        year,
        season,
        seasonIndex: absolute % 4,
        label: `${year}年 ${season}`,
        short: `${String(year).slice(2)}·${season}`,
        work: seasonAgronomy[season].work,
      })
    );
  }
  return labels;
}

/** turn 索引 → 中文日期数据，长度固定 32。 */
export const seasonLabels = Object.freeze(BuildSeasonLabels());

/** turn → "1937年 秋"。越界时夹到有效范围，绝不抛异常。 */
export function FormatTurnDate(turn) {
  const index = Math.max(0, Math.min(totalTurns - 1, Math.floor(Number(turn) || 0)));
  return seasonLabels[index].label;
}

/** turn → "37·秋"，给小地图与日志用的紧凑写法。 */
export function FormatTurnDateShort(turn) {
  const index = Math.max(0, Math.min(totalTurns - 1, Math.floor(Number(turn) || 0)));
  return seasonLabels[index].short;
}

/** turn → 季节汉字。 */
export function GetSeason(turn) {
  const index = Math.max(0, Math.min(totalTurns - 1, Math.floor(Number(turn) || 0)));
  return seasonLabels[index].season;
}

// ---------------------------------------------------------------------------
// 效果词汇表
//
// 事件选项的 effects 只允许使用下面这些 key。持续型修正写 duration（回合数，缺省或 0 表示永久），
// 瞬时型直接结算。任何代价项（civilianDeaths / displaced / villagesBurned / cadreLost / grainSeized）
// 都不允许出现在 effects 里 —— 它们只能进 ledger。
// ---------------------------------------------------------------------------

export const effectVocabulary = Object.freeze({
  yieldBonus: "按比例提高产出，形如 { grain: 0.12, labor: 0.05 }",
  flatYield: "每回合固定增加的产出，形如 { medicine: 1 }",
  massGrowth: "群众基础每回合自然增长的加成",
  exposureDecay: "暴露度每回合额外衰减量",
  intelRange: "情报网与视野半径加成（格）",
  concealment: "我方单位隐蔽度加成",
  ambushBonus: "伏击战斗力加成",
  defenceBonus: "防御战斗力加成",
  moveBonus: "机动力加成",
  healRate: "每回合恢复的兵员比例",
  buildSpeed: "建设速度加成",
  researchSpeed: "研究速度加成",
  policySlots: "政策槽位增加数",
  cadreGrowth: "干部每回合成长量",
  unrestDecay: "根据地不安情绪每回合下降量",
  sweepWarning: "扫荡提前预警的回合数",
  captureRate: "战斗缴获率加成（械的主要来源）",
  maintenanceDiscount: "部队与区域维护费折扣",
  populationGrowth: "根据地人口增长加成",
  railSabotage: "破袭效率加成（决定铁路 railBroken 回合数）",
  puppetDefection: "瓦解伪军、争取反正的概率加成",
  supplyRange: "补给半径加成（格）",
  literacy: "识字率提升，间接影响干部成长与情报判读",
  medicineEfficiency: "同等药品的治疗效果加成",
  alertDecay: "敌军警备度每回合额外衰减量",
  stockDelta: "瞬时资源增减，形如 { grain: -20, ordnance: 8 }",
  exposureDelta: "瞬时暴露度增减",
  alertDelta: "瞬时敌军警备度增减",
  massDelta: "瞬时群众基础增减（全局平均值口径）",
  unlockTech: "解锁 Data_Tech 中的技术 id",
  unlockDoctrine: "解锁群众/政权树条目 id",
  unlockPolicy: "解锁政策卡 id",
  unlockDistrict: "解锁根据地区域类型",
  unlockUnit: "解锁单位类型",
  unlockWork: "解锁地块工事类型",
  flags: "写入 state 的字符串标记数组，供后续事件条件判断",
  duration: "持续回合数，0 或缺省表示永久修正",
});

/** ledger 只允许这五个键，任何模块都不得扩展。 */
export const ledgerKeys = Object.freeze([
  "civilianDeaths",
  "displaced",
  "villagesBurned",
  "cadreLost",
  "grainSeized",
]);

export const ledgerLabels = Object.freeze({
  civilianDeaths: "群众遇害",
  displaced: "流离失所",
  villagesBurned: "村庄被焚",
  cadreLost: "骨干牺牲",
  grainSeized: "粮食被夺（斤）",
});

// ---------------------------------------------------------------------------
// 五个时期
// ---------------------------------------------------------------------------

export const eraKeys = Object.freeze(["Opening", "Growth", "Hardship", "Recovery", "Counter"]);

export const eraDefinitions = Object.freeze({
  Opening: Object.freeze({
    key: "Opening",
    name: "开辟期",
    dateRange: "1937年秋 — 1938年冬",
    turnRange: Object.freeze([0, 5]),
    summary:
      "正规战线向南退去，县城丢了，公路上开始有卡车。留下来的人要在几个月里做完三件事：把散落的枪收起来，把村子里能说上话的人找出来，把一个能收粮、能派差、能断案的政权立起来。",
    rules: Object.freeze([
      "敌军兵力集中在县城与铁路，山区几乎是空的，此时开辟成本最低。",
      "干部极缺：每开辟一处新区都要抽走骨干，抽空了就守不住。",
      "群众基础低于 20 的村子不会主动报信，情报网基本靠腿跑。",
      "暴露度上升缓慢，扫荡尚不成规模，但每一次公开活动都会被记下。",
    ]),
    palette: Object.freeze({
      sky: "#b6c4c9",
      sun: "#ffe6b8",
      ambient: "#8fa0a6",
      fog: "#c8cdc4",
      grass: "#8e9a5c",
      rock: "#8b8577",
      soil: "#a38f6b",
      accent: "#a8532f",
      paper: "#e6dcc4",
      ink: "#2b2620",
    }),
    weather: Object.freeze({ kind: "Clear", intensity: 0.25, note: "秋高气爽，山道好走，也好被看见。" }),
    modifiers: Object.freeze({
      enemyPressure: 0.35,
      sweepChance: 0.06,
      yieldScale: 1,
      cadreScarcity: 1.4,
      recruitCost: 0.85,
    }),
    opening: Object.freeze({
      eyebrow: "1937年 秋",
      title: "队伍从这里开始只有一个连",
      body: "县城丢了十九天。公路上的卡车往南开，山里的人往北躲。留下来的工作队一共十一个人，两支盒子炮，一台油印机，和一本还没写字的花名册。",
      note: "开辟期的关键不是打仗，是让一个村子肯把粮借给你，肯替你放哨。",
    }),
  }),

  Growth: Object.freeze({
    key: "Growth",
    name: "发展期",
    dateRange: "1939年春 — 1940年冬",
    turnRange: Object.freeze([6, 13]),
    summary:
      "根据地连成了片。修械所能翻造子弹了，卫生所能熬出土药了，区村政权收得上公粮了。敌人开始修公路、筑炮楼，把平原一格一格圈起来。破袭战成为最有效也最招报复的手段。",
    rules: Object.freeze([
      "敌军转入据点与公路建设，铁路沿线出现巡道与护路队。",
      "破袭铁路见效快，但每次破袭都显著抬高暴露度与警备度。",
      "群众基础超过 50 的村庄开始提供预警，扫荡可提前一回合看到轴线。",
      "军工与医药区域解锁，械与药不再完全依赖缴获。",
    ]),
    palette: Object.freeze({
      sky: "#a9bcc4",
      sun: "#ffdca0",
      ambient: "#7f939b",
      fog: "#bcc4bd",
      grass: "#7d8f52",
      rock: "#847d6f",
      soil: "#9c8863",
      accent: "#b45a2a",
      paper: "#e3d8bd",
      ink: "#282420",
    }),
    weather: Object.freeze({ kind: "Clear", intensity: 0.35, note: "多晴少雨，麦子长得好，抢收要抢在敌人前面。" }),
    modifiers: Object.freeze({
      enemyPressure: 0.55,
      sweepChance: 0.16,
      yieldScale: 1.1,
      cadreScarcity: 1.1,
      recruitCost: 1,
    }),
    opening: Object.freeze({
      eyebrow: "1939年 春",
      title: "有了修械所，也有了炮楼",
      body: "西沟的铁匠炉改成了修械所，一天能翻造四十发子弹。同一个月，敌人在东边的路口垒起第一座砖砌炮楼，二层，四个射孔，工是抓民夫做的。",
      note: "发展期是两条曲线同时上升：你的建设，和敌人的封锁。",
    }),
  }),

  Hardship: Object.freeze({
    key: "Hardship",
    name: "困难期",
    dateRange: "1941年春 — 1942年冬",
    turnRange: Object.freeze([14, 21]),
    summary:
      "最坏的两年。敌人以数千至上万兵力反复合击，实行烧光、杀光、抢光，挖封锁沟、筑封锁墙，把根据地切成碎块。同时遇上旱、蝗与疫病。这一时期的正确操作往往不是打，是转移、隐蔽、精简、活下去。",
    rules: Object.freeze([
      "扫荡频率与规模大幅提高，且可能连续两回合合击同一区域。",
      "敌人推行'三光'：被扫荡地块的 scorch 上升，产出长期下降，恢复需要数回合。",
      "封锁沟与封锁墙切断交通，跨越封锁线要额外机动力并抬高暴露度。",
      "精兵简政：主力单位维护费上升，缩编与下沉可以换回可持续性。",
      "灾荒与疫病概率显著上升，缺药会让减员无法恢复。",
    ]),
    palette: Object.freeze({
      sky: "#8f979a",
      sun: "#d9cdb0",
      ambient: "#69747a",
      fog: "#a7aca6",
      grass: "#6b7448",
      rock: "#6f6a60",
      soil: "#847457",
      accent: "#8c3a24",
      paper: "#d8cdb2",
      ink: "#211e1a",
    }),
    weather: Object.freeze({ kind: "Dust", intensity: 0.6, note: "春天刮土，夏天不下雨，秋后地里没多少能收的。" }),
    modifiers: Object.freeze({
      enemyPressure: 1,
      sweepChance: 0.42,
      yieldScale: 0.72,
      cadreScarcity: 1.5,
      recruitCost: 1.35,
    }),
    opening: Object.freeze({
      eyebrow: "1941年 春",
      title: "地图上被划了很多道线",
      body: "缴获的一张作战图上，我们这一片被划成了十几个小方格，每格标着一个据点、一条沟、一段墙。那年冬天以后，从北山到南川要走三夜，中间过两道封锁沟。",
      note: "困难期考的不是战果，是你能保住多少人、多少组织，撑到明年春天。",
    }),
  }),

  Recovery: Object.freeze({
    key: "Recovery",
    name: "恢复期",
    dateRange: "1943年春 — 1944年夏",
    turnRange: Object.freeze([22, 27]),
    summary:
      "熬过来了。大生产运动把部队和机关赶进地里，变工互助把缺牛缺人的户组织起来，减租减息落实到契约上，冬学让识字的人多起来。战场上从'反扫荡'转成'挤敌人'——一个据点一个据点地把敌人挤回公路上去。",
    rules: Object.freeze([
      "大生产与变工互助显著提高粮与工的产出，部队可以部分自给。",
      "减租减息与拥军优抗落实后，群众基础增长明显加快。",
      "对敌斗争转为'挤'：封锁敌人据点的水源、集市与情报，可以不打而让其收缩。",
      "两面政权与伪军工作进入收获期，反正与内线情报概率上升。",
      "敌人兵力被抽调，扫荡规模下降，但报复性的小股奔袭仍然频繁。",
    ]),
    palette: Object.freeze({
      sky: "#aebfc0",
      sun: "#ffe2ae",
      ambient: "#84959a",
      fog: "#c0c6bb",
      grass: "#87954f",
      rock: "#8a8172",
      soil: "#a48d63",
      accent: "#b96a2c",
      paper: "#e8dcbf",
      ink: "#272220",
    }),
    weather: Object.freeze({ kind: "Rain", intensity: 0.4, note: "1943年入伏后下了透雨，是三年来头一场。" }),
    modifiers: Object.freeze({
      enemyPressure: 0.7,
      sweepChance: 0.2,
      yieldScale: 1.15,
      cadreScarcity: 0.9,
      recruitCost: 0.95,
    }),
    opening: Object.freeze({
      eyebrow: "1943年 春",
      title: "先把地种上",
      body: "机关每人分了三分荒地，规定不许误了自己的工。有人算过一笔账：全区开荒两千一百亩，抵得上少向老百姓征一次公粮。",
      note: "恢复期最重要的数字不在战报上，在粮食账和人口册上。",
    }),
  }),

  Counter: Object.freeze({
    key: "Counter",
    name: "反攻期",
    dateRange: "1944年秋 — 1945年夏",
    turnRange: Object.freeze([28, 31]),
    summary:
      "主动权换了手。敌人抽兵南下，据点守备空虚，伪军成批动摇。部队开始成建制攻打炮楼与据点，收复被蚕食的村庄，最后打到县城下面。1945年8月，日本投降——这是史实终点，不因任何操作而改变。",
    rules: Object.freeze([
      "敌军守备普遍削弱，攻坚成功率提高，但攻坚仍然消耗大量械与药。",
      "伪军反正概率大幅提高，争取一个据点常常比打下它划算。",
      "收复村庄后需要立即恢复政权与生产，否则人口不会回流。",
      "最后一回合固定进入受降与接收流程，战果不再计分，接收与安置才计分。",
    ]),
    palette: Object.freeze({
      sky: "#b8c6c2",
      sun: "#ffdca2",
      ambient: "#8b9a96",
      fog: "#c4c9bc",
      grass: "#8d9950",
      rock: "#8d8474",
      soil: "#a8905f",
      accent: "#c2542a",
      paper: "#ebdfc0",
      ink: "#241f1c",
    }),
    weather: Object.freeze({ kind: "Clear", intensity: 0.3, note: "秋后天旱路硬，夜里行军能走得快些。" }),
    modifiers: Object.freeze({
      enemyPressure: 0.6,
      sweepChance: 0.12,
      yieldScale: 1.2,
      cadreScarcity: 0.8,
      recruitCost: 0.9,
    }),
    opening: Object.freeze({
      eyebrow: "1944年 秋",
      title: "路口的炮楼开始拆自己的砖",
      body: "东边三个据点的伪军托人捎话，说想留条后路。同一个星期，敌人把两个中队调走了，炮楼上夜里只剩两个哨。",
      note: "反攻期的分数不看歼灭多少，看收复的村子里有多少人真的回来了。",
    }),
  }),
});

/** turn → eraKey。越界向两端夹取。 */
export function GetEraKeyForTurn(turn) {
  const value = Math.floor(Number(turn) || 0);
  for (const key of eraKeys) {
    const range = eraDefinitions[key].turnRange;
    if (value >= range[0] && value <= range[1]) return key;
  }
  return value < 0 ? "Opening" : "Counter";
}

export function GetEraDefinition(eraKey) {
  return eraDefinitions[eraKey] || eraDefinitions.Opening;
}

/** 该回合在本时期内的进度 0..1，供渲染层做时期内的光照/色彩插值。 */
export function GetEraProgress(turn) {
  const eraKey = GetEraKeyForTurn(turn);
  const range = eraDefinitions[eraKey].turnRange;
  const span = range[1] - range[0];
  if (span <= 0) return 1;
  const value = Math.max(range[0], Math.min(range[1], Math.floor(Number(turn) || 0)));
  return (value - range[0]) / span;
}

// ---------------------------------------------------------------------------
// 历史事件
//
// 每条事件：{ id, era, turnRange, weight, condition, title, dateline, body, illustration, options, flavor }
// 每个选项：{ id, label, hint, effects, ledger }
//
// 代价红线（本文件自我约束，Script_Rules 结算时也应复核）：
// 只要一个选项的 ledger 里有任何正数，它的 effects 就只允许出现
// stockDelta（值必须 ≤ 0）、exposureDelta、alertDelta、massDelta（必须 ≤ 0）、flags、duration。
// 也就是说：人的代价永远换不来粮、械、药、群众基础或任何加成。
// ---------------------------------------------------------------------------

function DeepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) DeepFreeze(value[key]);
  return Object.freeze(value);
}

export const historicalEvents = DeepFreeze([
  // ===== 开辟期 1937秋 — 1938冬 =====
  { id: "ScatteredArms", era: "Opening", turnRange: [0, 2], weight: 100, condition: { once: true, maxExposure: 70 },
    title: "碾盘上的枪", dateline: "1937年 秋 · 青龙峪村口",
    body: "溃兵是从北边下来的，三天里过了四拨。多数人没有枪，有枪的也剩不下几发子弹，有个班长拿刺刀换了两个窝头。碾盘上摊着他们扔下的东西：一支断了背带的汉阳造、两条空子弹带、一个印着番号的铁皮饭盒。村里人不敢收，怕日后有人来查；也不敢不收，怕枪落到抢粮的手里。",
    illustration: { kind: "Village", tone: "cold", motifs: ["millstone", "riflePile", "villagers", "duskSmoke"] },
    options: [
      { id: "CollectArmsOnly", label: "只收枪械，管一顿饭发路条", hint: "省下口粮，但会打枪的人都走了。",
        effects: { stockDelta: { ordnance: 14, grain: -5 }, exposureDelta: 2 }, ledger: {} },
      { id: "EnlistWilling", label: "愿意留下的编成一个排", hint: "多了三十条汉子的饭，也多了三十双拿过枪的手。",
        effects: { stockDelta: { ordnance: 20, grain: -16 }, unlockUnit: "Guerrilla", massDelta: -2, exposureDelta: 4 }, ledger: {} },
      { id: "ElderMediates", label: "请村里的老人出面，先管饭再谈枪", hint: "慢，但枪是村里人看着交的，账记在明处。",
        effects: { stockDelta: { ordnance: 9, grain: -11 }, massDelta: 5, flags: ["ArmsRegistered"] }, ledger: {} },
    ],
    flavor: "枪要登记造册：谁交的、几支、多少发子弹，写在一张糊窗户的毛边纸上，两个人按手印。" },
  { id: "PeoplesCouncil", era: "Opening", turnRange: [1, 4], weight: 95, condition: { once: true, minVillages: 3 },
    title: "把政权立起来", dateline: "1937年 冬 · 双泉镇小学操场",
    body: "旧县政府南撤那天带走了印和账本，剩下的是二十来个村的粮差、四百多份没销的欠条，和谁也说不清的地界。要征公粮、要断纠纷、要派运输，先得有个大家认的机构。会开在小学操场上，来了三十七个村的代表，有地主，有佃户，还有两个和尚。开会前先说清一件事：这个会不发饷，来的人自带干粮。",
    illustration: { kind: "Assembly", tone: "cold", motifs: ["schoolyard", "banner", "benches", "winterSun"] },
    options: [
      { id: "BroadFront", label: "尽量把各方都请进来，先求人认账", hint: "议事慢，但布告贴出去有人听。",
        effects: { massDelta: 6, flatYield: { intel: 1 }, unlockDoctrine: "UnitedFront", cadreGrowth: 0.2 }, ledger: {} },
      { id: "CadreFirst", label: "干部占多数，先求令行禁止", hint: "派差征粮快，可村里会说这是又一个衙门。",
        effects: { flatYield: { labor: 2 }, massDelta: -4, buildSpeed: 0.1, unlockDoctrine: "CountyGovernment" }, ledger: {} },
      { id: "VillageBallot", label: "各村自己选代表，当众唱票", hint: "选出来的人不一定听话，可他们说话村里信。",
        effects: { massDelta: 9, policySlots: 1, unlockDoctrine: "VillageAssembly", stockDelta: { cadre: -1 } }, ledger: {} },
    ],
    flavor: "第一份布告用木版刻的，印了两百张，内容只有三条：不许抢粮、不许拉夫、有冤情到区上说。" },
  { id: "RentAndInterest", era: "Opening", turnRange: [2, 5], weight: 90, condition: { once: true, minMass: 18 },
    title: "算一笔旧账", dateline: "1938年 春 · 柳河湾",
    body: "柳河湾的租子是四六，佃户四，东家六，麦收后还要交一份看青钱。工作队来了半个月，先不提减租，先帮着掏渠。渠通那天晚上，二十多户挤在场院里，头一回有人把租约拿出来念。念到第三张，念的人手抖了——那张契上写着“子孙永佃，租额随年景议”，可十年没议过。",
    illustration: { kind: "Assembly", tone: "warm", motifs: ["lampLitYard", "contractPaper", "abacus", "seatedCrowd"] },
    options: [
      { id: "ByLaw", label: "照边区条例减到二五减租，欠账分期清", hint: "按条文办，慢，但地主也认这个理。",
        effects: { massDelta: 8, yieldBonus: { grain: 0.08 }, unlockDoctrine: "RentReduction", unrestDecay: 0.3 }, ledger: {} },
      { id: "SettleHard", label: "旧账一次算清，押金当场退", hint: "痛快。也会有人把地撂荒，把粮车往城里赶。",
        effects: { massDelta: 12, stockDelta: { grain: 22 }, yieldBonus: { grain: -0.06 }, alertDelta: 5 }, ledger: {} },
      { id: "InterestOnly", label: "先不动租额，只减息、只清高利贷", hint: "动静小，得罪的人少，见效也慢。",
        effects: { massDelta: 4, flatYield: { grain: 1 }, unrestDecay: 0.5 }, ledger: {} },
    ],
    flavor: "减租不是把地主赶走。条例上写得明白：该交的租要交够，减下来的不许再要回去。两头都得有人去说。" },
  { id: "RefugeeColumn", era: "Opening", turnRange: [0, 3], weight: 80, condition: { minStock: { grain: 20 } },
    title: "从北边下来的人", dateline: "1937年 冬 · 黑石岭隘口",
    body: "这一天过隘口的有一百四十多人，多半是铁路两侧村子的。有推独轮车的，有背着门板的，一个女人怀里抱着的孩子已经不哭了。他们不说要去哪儿，只是往山里走。山里的存粮按人头算，本来能吃到开春。",
    illustration: { kind: "Snow", tone: "grim", motifs: ["pass", "column", "handcart", "snowdrift"] },
    options: [
      { id: "TakeIn", label: "开仓收容，按户分派到各村住", hint: "粮要紧一大截，人手会多起来。",
        effects: { stockDelta: { grain: -34 }, massDelta: 6, populationGrowth: 0.06, flatYield: { labor: 2 } }, ledger: {} },
      { id: "ScreenThenTake", label: "先甄别再收，怕里头混着坐探", hint: "稳，但要当着人的面把一部分人劝走。",
        effects: { stockDelta: { grain: -19 }, massDelta: -2, exposureDelta: -4 }, ledger: { displaced: 46 } },
      { id: "SendOn", label: "只给三天口粮，指条路让他们往西", hint: "存粮保住了。这一百多人会记住是谁指的路。",
        effects: { stockDelta: { grain: -9 }, massDelta: -6 }, ledger: { displaced: 141 } },
    ],
    flavor: "收容的人要登记原籍。登记本后来成了一份很有用的东西：铁路那边哪个村什么情形，问他们最清楚。" },
  { id: "FirstWinterCotton", era: "Opening", turnRange: [1, 3], weight: 85, condition: { seasons: ["冬"], once: true },
    title: "棉花与借条", dateline: "1937年 冬 · 石门沟",
    body: "队伍里还有四十一个人穿着单衣。全县能弄到的棉花不到三百斤，弹出来做不了一百件棉衣。区上开会定了两条：一是向富户借，写借条，秋后加息还；二是把旧被子拆了，一床被改两件坎肩。会散了以后有人小声说，借条这东西，得让人相信明年还有秋天。",
    illustration: { kind: "Snow", tone: "cold", motifs: ["cottonBale", "needleThread", "oilLamp", "frostWindow"] },
    options: [
      { id: "BorrowWithNote", label: "写借条向富户借棉，秋后按约还", hint: "利钱不低，但立了一次信用。",
        effects: { stockDelta: { grain: -8 }, healRate: 0.05, massDelta: 3, flags: ["WinterCoatsIssued"] }, ledger: {} },
      { id: "FlatLevy", label: "按亩摊派，先把过冬解决了", hint: "快。摊到谁头上，谁记一辈子。",
        effects: { healRate: 0.08, massDelta: -8, unrestDecay: -0.4, flags: ["WinterCoatsIssued"] }, ledger: {} },
      { id: "MakeDo", label: "不摊派，拆旧被改坎肩，人分批进屋暖", hint: "群众看在眼里。这个冬天要靠硬扛。",
        effects: { massDelta: 5, healRate: -0.04, moveBonus: -0.1, duration: 2 }, ledger: {} },
    ],
    flavor: "那年冬天报上来的减员，多数不是打仗打掉的，是冻和病。" },
  { id: "TrainingClass", era: "Opening", turnRange: [2, 5], weight: 88, condition: { minStock: { cadre: 1 } },
    title: "训练班第一期", dateline: "1938年 春 · 北窑村破庙",
    body: "第一期训练班二十六个人，十一个不识字。课程表贴在墙上：上午政治与群众工作，下午军事与卫生，晚上识字一百个。教材是油印的，纸糙得刮手。三十天后这二十六个人要分到二十六个村去，其中多数人此前没离开过自己那道沟。",
    illustration: { kind: "Assembly", tone: "warm", motifs: ["templeHall", "chalkBoard", "oilLamp", "notebooks"] },
    options: [
      { id: "ShortCourse", label: "缩到二十天，先把人派下去", hint: "村里等不起，可派出去的人心里没底。",
        effects: { stockDelta: { cadre: 2 }, cadreGrowth: 0.15, massGrowth: 0.2, literacy: 0.05 }, ledger: {} },
      { id: "FullCourse", label: "按三十天上完，宁缺毋滥", hint: "出去的人能自己判断，代价是慢一个月。",
        effects: { stockDelta: { cadre: 1, grain: -8 }, cadreGrowth: 0.25, literacy: 0.12, researchSpeed: 0.05 }, ledger: {} },
      { id: "LiteracyFirst", label: "先扫盲，教会写自己的名字和数目字", hint: "看着最没用，往后三年最省事。",
        effects: { literacy: 0.2, cadreGrowth: 0.1, flatYield: { intel: 1 }, massDelta: 4 }, ledger: {} },
    ],
    flavor: "结业那天每人发一支铅笔、一个本子、两块边币。本子第一页要写自己的名字，写歪了不许撕。" },

  // ===== 发展期 1939春 — 1940冬 =====
  { id: "RepairShop", era: "Growth", turnRange: [6, 9], weight: 96, condition: { once: true, minStock: { labor: 10 } },
    title: "西沟的炉子", dateline: "1939年 春 · 西沟修械所",
    body: "修械所是三盘铁匠炉、一台从矿上抬回来的手摇钻、四个铁匠加七个学徒。翻造子弹靠回收弹壳：捡回来的壳先退火，再复装，底火的药是刮火柴头配的。一天能出四十发，炸膛的比例大约十几分之一。所长说，最缺的不是铁，是雷汞和无缝钢管。",
    illustration: { kind: "Tunnel", tone: "warm", motifs: ["forge", "anvil", "sparks", "caseRack"] },
    options: [
      { id: "ReloadFirst", label: "全力复装子弹，先解燃眉", hint: "打一仗少心疼一点，炸膛也归你担。",
        effects: { flatYield: { ordnance: 3 }, captureRate: 0.05, unlockDistrict: "Arsenal" }, ledger: {} },
      { id: "MinesAndGrenades", label: "转产地雷与手榴弹，铸铁壳好办", hint: "民兵一下子就有家伙了。",
        effects: { flatYield: { ordnance: 2 }, ambushBonus: 0.12, unlockWork: "Cache", unlockTech: "StoneMine" }, ledger: {} },
      { id: "DisperseForges", label: "把炉子拆散到三条沟里去", hint: "产量低，可炸不完、烧不尽。",
        effects: { flatYield: { ordnance: 2 }, concealment: 0.1, exposureDecay: 1, buildSpeed: -0.05 }, ledger: {} },
    ],
    flavor: "炸膛伤了手的学徒没走，改做登记和分拣。所里的规矩是：伤了不撵人。" },
  { id: "FolkPharmacy", era: "Growth", turnRange: [7, 11], weight: 92, condition: { once: true },
    title: "土法制药", dateline: "1939年 夏 · 后山卫生所",
    body: "西药断了。一支磺胺在集上要换两斗麦，还常常是假的。卫生所能自己做的有三样：熬酒精、蒸馏水、把黄芩黄柏煎成消炎的水药。最难的是外科用的纱布和缝合线，纱布靠土布反复煮，线用蚕丝。所长在本子上写了一句：清创比什么药都管用，可清创要有干净的水和亮光。",
    illustration: { kind: "Village", tone: "warm", motifs: ["stillPot", "herbBundles", "bandageRoll", "lantern"] },
    options: [
      { id: "Distill", label: "先解决酒精和蒸馏水", hint: "不起眼，救的人最多。",
        effects: { flatYield: { medicine: 2 }, medicineEfficiency: 0.15, healRate: 0.06, unlockDistrict: "Clinic" }, ledger: {} },
      { id: "GatherHerbs", label: "动员群众上山采药，按斤收购", hint: "药有了，也让山里人多一份进项。",
        effects: { flatYield: { medicine: 1 }, massDelta: 5, yieldBonus: { medicine: 0.2 }, stockDelta: { grain: -10 } }, ledger: {} },
      { id: "BuyFromTown", label: "花大价钱从城里换西药", hint: "见效最快，路子也最容易被摸出来。",
        effects: { stockDelta: { medicine: 16, grain: -40 }, exposureDelta: 6, alertDelta: 4 }, ledger: {} },
    ],
    flavor: "药品账分三栏：自制、缴获、购入。购入那一栏后面，常常只写着一个交通员的代号。" },
  { id: "SaltBlockade", era: "Growth", turnRange: [7, 12], weight: 84, condition: {},
    title: "一斤盐", dateline: "1939年 冬 · 山口集",
    body: "敌人把盐管起来了：出城要凭证，一次不许超过五斤。山里盐价从八分涨到四毛，有的村子三个月没见过盐。缺盐的人先是没力气，然后浮肿。土办法是熬硝土：把老墙根的土刮下来淋水，熬出来的盐又苦又涩，一百斤土出不到二两。",
    illustration: { kind: "Village", tone: "grim", motifs: ["saltPan", "wallScraping", "boilingPot", "marketStall"] },
    options: [
      { id: "BoilEarthSalt", label: "各村熬土盐，区上统一收购分配", hint: "难吃，但不求人。",
        effects: { massDelta: 6, healRate: 0.03, stockDelta: { labor: -10 }, unlockWork: "SaltPan" }, ledger: {} },
      { id: "RunTheBlockade", label: "组织武装运盐队走夜路", hint: "一次能顶两个月。也可能一次全折进去。",
        effects: { healRate: 0.06, massDelta: 4, exposureDelta: 7, alertDelta: 6, stockDelta: { ordnance: -4 } }, ledger: {} },
      { id: "BarterThroughTown", label: "拿山货药材跟城里换，走两面政权的路子", hint: "东西是买来的，人情是欠下的。",
        effects: { stockDelta: { medicine: 8 }, puppetDefection: 0.06, exposureDelta: 4, flatYield: { intel: 1 } }, ledger: {} },
    ],
    flavor: "供给部账上，盐单列一项。一个人一月按半斤算，全区一年要十二万斤，从来没凑够过。" },
  { id: "RoadCorvee", era: "Growth", turnRange: [6, 10], weight: 86, condition: { minAlert: 15 },
    title: "路是拿人堆出来的", dateline: "1939年 秋 · 东塬",
    body: "敌人要把县城到车站的土路压成公路，摊派民夫按村出人，一个壮劳力顶十天工，不去的罚粮。头一批去的四十七个人回来三十九个：两个死在塌方里，六个还扣在工地上。第二批的摊派单已经贴到墙上了。",
    illustration: { kind: "Village", tone: "grim", motifs: ["roadbed", "carryBaskets", "postedNotice", "guardPost"] },
    options: [
      { id: "ComplyAndInfiltrate", label: "照单出人，把两个可靠的人塞进去", hint: "村里骂，可工地上的图我们看得见。",
        effects: { flatYield: { intel: 1 }, intelRange: 1, massDelta: -3, alertDelta: -3 }, ledger: {} },
      { id: "SlowdownOnRoad", label: "出人但磨工，土垫虚、石铺松", hint: "路一冬修不成。查出来的人回不来。",
        effects: { alertDelta: 4, exposureDelta: 2, flags: ["RoadDelayed"] }, ledger: { civilianDeaths: 3 } },
      { id: "HideFromCorvee", label: "全村躲工，人上山，牲口牵走", hint: "一个人也不给他。代价由留在村里的东西来付。",
        effects: { stockDelta: { grain: -15 }, exposureDelta: 6, alertDelta: 8 }, ledger: { displaced: 260, grainSeized: 800 } },
    ],
    flavor: "工地上有本记工簿，谁去了谁没去写得清清楚楚。这本簿子后来落到我们手里，是一份最准的花名册。" },
  { id: "MinesAndMilitia", era: "Growth", turnRange: [9, 13], weight: 90, condition: { once: true, minMass: 30 },
    title: "石雷", dateline: "1940年 夏 · 南岗民兵训练场",
    body: "买不起铁雷，就拿石头凿。选一块硬砂石，凿出碗口大的膛，装黑火药和碎铁，木塞封口，引信用麻绳浸硝。埋在路口、井台、门槛底下。教员翻来覆去只讲一条：埋雷要登记、要画图、要标日子。不登记的雷，将来炸的是自己人。",
    illustration: { kind: "Village", tone: "cold", motifs: ["stoneMine", "chisel", "pathMarker", "militiaSpears"] },
    options: [
      { id: "RegisterFirst", label: "先立规矩：必登记、必画图、必设警号", hint: "慢半拍，往后少出事。",
        effects: { ambushBonus: 0.15, unlockUnit: "Militia", unlockTech: "StoneMine", buildSpeed: 0.04, stockDelta: { labor: -8 }, massDelta: 3 }, ledger: {} },
      { id: "MassProduce", label: "全区推开，一村一月十枚，先求数量", hint: "路上处处是雷，村里也处处得小心。",
        effects: { ambushBonus: 0.24, defenceBonus: 0.06, stockDelta: { labor: -20, ordnance: -6 }, massDelta: -3, exposureDelta: 3 }, ledger: {} },
      { id: "RoadsOnly", label: "只在敌人常走的三条路上埋，村里一律不埋", hint: "杀伤小，可谁都敢在自己村里走夜路。",
        effects: { ambushBonus: 0.12, massDelta: 6, exposureDecay: 0.5, stockDelta: { labor: -6 } }, ledger: {} },
    ],
    flavor: "登记本有两页：一页写“已起出”，一页写“找不到了”。后一页每多一行，村里就多一处不敢走的地方。" },
  { id: "HarvestGuard", era: "Growth", turnRange: [8, 13], weight: 94, condition: { seasons: ["秋"] },
    title: "抢在他们前面", dateline: "1939年 秋 · 南川",
    body: "谷子熟了，敌人的抢粮队也快下来了。护秋的法子是全村昼夜割，割一块打一块，打下来当天入窖。窖分三种：地窖、崖窖、坟窖。最麻烦的是牲口——磨面要牲口，可牲口一叫就露了。区上想了个笨办法：后半夜推磨，天亮把磨的把手卸下来藏起来。",
    illustration: { kind: "Harvest", tone: "warm", motifs: ["sickles", "sheaves", "cellarMouth", "moonlight"] },
    options: [
      { id: "NightHarvest", label: "夜收夜藏，磨面只在后半夜", hint: "累得脱形，但不惊动人。",
        effects: { stockDelta: { grain: 38, labor: -12 }, exposureDelta: -3, massDelta: 4 }, ledger: {} },
      { id: "CoverParty", label: "两个连在东梁上顶着，白天照常收", hint: "收得最多，也把位置摆到明处了。",
        effects: { stockDelta: { grain: 52 }, exposureDelta: 9, alertDelta: 6, healRate: -0.03 }, ledger: {} },
      { id: "CacheOldStock", label: "先把去年的存粮转到崖窖，再动镰", hint: "今年少收些，明年春天才有底。",
        effects: { stockDelta: { grain: 26, labor: -16 }, exposureDecay: 1, flags: ["GrainDispersed"] }, ledger: {} },
    ],
    flavor: "窖口用石板压好，上面撒一层土，再赶几只羊踩过去。踩过的地和没踩过的，远看是一样的。" },
  { id: "RailBreak", era: "Growth", turnRange: [10, 13], weight: 98, condition: { requireRailway: true },
    title: "拆一段路", dateline: "1940年 秋 · 铁路以西二十里",
    body: "破袭的办法是把道钉起出来，鱼尾板卸下，几十人一起把钢轨掀翻推下路基，枕木堆起来烧。一夜能拆三里。敌人抢修一里要一天，还要抽护路队。参加的多是民兵和村里的青壮，扛着撬棍和门板，走的是夜路。风险在天亮以后：抢修队来了，会拿沿线的村子出气。",
    illustration: { kind: "Rail", tone: "grim", motifs: ["railTrack", "crowbars", "torchLine", "embankment"] },
    options: [
      { id: "DeepBreak", label: "彻底破：钢轨掀下沟，枕木全烧", hint: "他们半个月修不好，也会记住是哪一片干的。",
        effects: { railSabotage: 0.35, alertDelta: 14, exposureDelta: 12, stockDelta: { labor: -12 } }, ledger: {} },
      { id: "LightBreak", label: "只起道钉、卸鱼尾板，随修随破", hint: "拖住他，不惹大的报复。",
        effects: { railSabotage: 0.18, alertDelta: 6, exposureDelta: 5, stockDelta: { labor: -5 } }, ledger: {} },
      { id: "EvacuateFirst", label: "先把沿线三个村的人和粮转移，再动手", hint: "多花两天，多花几十石粮。",
        effects: { railSabotage: 0.28, alertDelta: 12, exposureDelta: 8, stockDelta: { labor: -18, grain: -12 }, sweepWarning: 1, massDelta: 4 }, ledger: {} },
    ],
    flavor: "破袭队回村前要把撬棍埋回柴垛。工具是各家的，丢了要照价赔。" },
  { id: "PuppetContact", era: "Growth", turnRange: [8, 13], weight: 88, condition: { minStock: { intel: 8 } },
    title: "捎话", dateline: "1940年 春 · 三里铺据点外",
    body: "三里铺据点的伪军班长是本县人，母亲还在村里住。他托赶集的人捎了三次话，说不想跟着往山里搜，可也不敢跑，跑了全家要遭殃。工作的办法是先不谈反正，只谈三件小事：不打枪、不带路、不抢粮。做到了，家里就照常过日子。",
    illustration: { kind: "Night", tone: "cold", motifs: ["blockhouse", "marketBasket", "lampSignal", "wheatField"] },
    options: [
      { id: "ThreeNos", label: "只订“三不”口头约定，先立个信用", hint: "什么都没拿到，什么都开始了。",
        effects: { puppetDefection: 0.12, flatYield: { intel: 1 }, alertDecay: 0.5, massDelta: 2 }, ledger: {} },
      { id: "PressForArms", label: "要他交两挺机枪作投名状", hint: "东西是硬的，人是要被逼到墙角的。",
        effects: { stockDelta: { ordnance: 14 }, puppetDefection: 0.05, alertDelta: 8, exposureDelta: 5 }, ledger: {} },
      { id: "FamilyGuarantee", label: "给他家出一张保状，写明将来不追究", hint: "有的群众想不通：凭什么保汉奸的家。",
        effects: { puppetDefection: 0.2, unlockDoctrine: "PuppetWork", stockDelta: { cadre: -1 }, massDelta: -3 }, ledger: {} },
    ],
    flavor: "保状一式两份，一份给他家，一份存区上，上面写着日期、见证人，和一句话：以行为论。" },
  { id: "ThreeThirdsSystem", era: "Growth", turnRange: [12, 13], weight: 92, condition: { once: true, minMass: 35 },
    title: "三三制", dateline: "1940年 冬 · 县参议会",
    body: "边区定了新办法：政权机关里，共产党员占三分之一，党外的进步人士占三分之一，中间人士占三分之一。县参议会照这个比例改选。有人不服气，说流血的是我们，凭什么让出两份；也有人不敢来，怕将来算账。头一次会开了四天，通过三件事：田赋、锄奸条例，还有一条谁也没料到的——参议员一律不得兼任粮秣征收员。",
    illustration: { kind: "Assembly", tone: "warm", motifs: ["ballotSlips", "longTable", "inkStone", "windowLight"] },
    options: [
      { id: "StrictQuota", label: "严格照比例改选，党员主动让位", hint: "让出去的是位子，收回来的是人心。",
        effects: { massDelta: 10, policySlots: 1, unlockDoctrine: "ThreeThirds", flatYield: { grain: 2 }, alertDecay: 0.3 }, ledger: {} },
      { id: "SoftQuota", label: "比例照顾一下，关键岗位不放", hint: "办事顺，可布告底下开始有人冷笑。",
        effects: { massDelta: 4, buildSpeed: 0.06, unlockDoctrine: "CountyGovernment" }, ledger: {} },
      { id: "PostponeReform", label: "战事吃紧，先缓一年", hint: "省下的精力用来打仗。缓过去的东西不一定还能捡回来。",
        effects: { massDelta: -5, defenceBonus: 0.05, stockDelta: { cadre: 1 } }, ledger: {} },
    ],
    flavor: "改选后有个开明绅士当了副县长。上任第一件事，是把自家两顷地按新条例减了租。" },

  // ===== 困难期 1941春 — 1942冬 =====
  { id: "GreatSweep", era: "Hardship", turnRange: [14, 19], weight: 100, condition: { minExposure: 30 },
    title: "十一路", dateline: "1941年 秋 · 全县",
    body: "情报是三天前送进来的：敌人集中了两个联队又两个大队，另有伪军若干，分十一路，从三面同时压过来。合击点标在北山一个小盆地——那里有后方医院、印刷所和一部电台。留给我们的时间是两夜一天。要带走的东西按轻重排：伤员、机器、账册、粮。",
    illustration: { kind: "Ridge", tone: "grim", motifs: ["smokeColumns", "ridgeline", "stretchers", "packMules"] },
    options: [
      { id: "SplitAndSlip", label: "化整为零，跳到合击圈外面去", hint: "人保得最多。印刷机和存粮带不走。",
        effects: { exposureDelta: -14, alertDelta: -4, stockDelta: { grain: -60, ordnance: -10 } }, ledger: { civilianDeaths: 26, displaced: 1800, villagesBurned: 3, grainSeized: 24000 } },
      { id: "HoldTheRidge", label: "留一个营顶住隘口，掩护机关先走", hint: "机器保住了。顶在隘口的人不一定回得来。",
        effects: { exposureDelta: -6, stockDelta: { ordnance: -24, medicine: -12 } }, ledger: { civilianDeaths: 41, displaced: 2400, villagesBurned: 5, cadreLost: 9, grainSeized: 31000 } },
      { id: "MoveInward", label: "敌进我进，插到他后面去打空虚据点", hint: "把他调回去了。我们自己的伤亡最重。",
        effects: { exposureDelta: 6, alertDelta: 10, stockDelta: { ordnance: -18, medicine: -10 } }, ledger: { civilianDeaths: 34, displaced: 1500, villagesBurned: 4, cadreLost: 6, grainSeized: 12000 } },
    ],
    flavor: "转移的规矩叫“三不留”：不留粮、不留人、不留字纸。字纸包括花名册、账本，和小学生的作业本。" },
  { id: "ScorchedEarth", era: "Hardship", turnRange: [15, 21], weight: 96, condition: { minExposure: 25 },
    title: "坚壁", dateline: "1942年 春 · 河西六村",
    body: "敌人这次不走了，在河西设了两个据点，逐村搜。他们的办法是把粮全部起走或者就地烧掉，房子拆了做工事，井里投东西，撤走时放火。我们的办法叫坚壁清野：粮、油、盐、农具分散埋进山，人躲到沟里，井口封上，磨盘卸走。难的是，坚壁做得越彻底，村子看上去越像是“通八路”的样子。",
    illustration: { kind: "Village", tone: "grim", motifs: ["burnedRoof", "sealedWell", "buriedJars", "ashField"] },
    options: [
      { id: "FullClearance", label: "彻底坚壁：粮全埋、井全封、人全撤", hint: "留给他一座空村。空村最招火。",
        effects: { stockDelta: { grain: -30, labor: -24 }, exposureDelta: 2 }, ledger: { civilianDeaths: 12, displaced: 2600, villagesBurned: 4, grainSeized: 3000 } },
      { id: "PartialClearance", label: "只藏种粮和口粮，留一部分让他抢，人先走", hint: "破财免灾，是老辈人的说法。",
        effects: { stockDelta: { grain: -16, labor: -12 } }, ledger: { civilianDeaths: 9, displaced: 2200, villagesBurned: 2, grainSeized: 14000 } },
      { id: "StayAndBluff", label: "留几位老人在村里应付，装作从没来过队伍", hint: "村子也许能保住。留下的人不一定。",
        effects: { exposureDelta: -6, stockDelta: { grain: -8 } }, ledger: { civilianDeaths: 31, displaced: 900, villagesBurned: 1, grainSeized: 9000 } },
    ],
    flavor: "埋粮要选背阴的坡，缸口朝下，上面压石板。开春起出来，最上面一层总是霉的。" },
  { id: "BlockadeDitch", era: "Hardship", turnRange: [14, 20], weight: 93, condition: {},
    title: "沟与墙", dateline: "1941年 冬 · 公路以东",
    body: "敌人沿公路挖沟：宽两丈，深一丈五，土堆在内侧筑成墙，墙上每隔三里一个碉堡。挖沟的是抓来的民夫，一个冬天挖了六十里。沟一挖成，牲口过不去，粮食运不过来，两边的村子成了两个世界。有人夜里试着搭桥板，第二天桥板挂在碉堡外面示众。",
    illustration: { kind: "Rail", tone: "grim", motifs: ["deepDitch", "earthWall", "watchtower", "plankBridge"] },
    options: [
      { id: "FillAtNight", label: "夜里组织群众填沟，填一段过一段", hint: "填得快，也是最容易撞上巡逻的活。",
        effects: { stockDelta: { labor: -18 }, exposureDelta: 6, alertDelta: 5, flags: ["DitchBreached"] }, ledger: { civilianDeaths: 7 } },
      { id: "SecretCrossing", label: "选三处隐蔽点做暗渡，只走交通员和小分队", hint: "大部队过不去，可消息断不了。",
        effects: { intelRange: 1, supplyRange: 1, concealment: 0.08, stockDelta: { labor: -10, cadre: -1 } }, ledger: {} },
      { id: "TunnelUnder", label: "从沟底下掏过去", hint: "六千个工。挖成了，这道沟就等于没有。",
        effects: { unlockWork: "Tunnel", supplyRange: 1, stockDelta: { labor: -30 }, buildSpeed: -0.05 }, ledger: {} },
    ],
    flavor: "交通站的暗号是三块石头摆成的样式，一周一换。换法写在一张能吞下去的纸上。" },
  { id: "TunnelWar", era: "Hardship", turnRange: [15, 21], weight: 95, condition: { once: true, minMass: 40 },
    title: "从菜窖到地道", dateline: "1942年 夏 · 平川一带的做法传进山里",
    body: "平原上先做起来的：家家的菜窖打通，再往村外挖，出口设在坟地、井壁、灶膛后头。要点有四条：口要多，道要通，能藏还要能打，最要紧的是通风和防水灌。一个村挖到能藏三百人，用了四个月、六千个工。挖的时候土不能堆在外面，得一筐一筐运到河滩上摊平。",
    illustration: { kind: "Tunnel", tone: "cold", motifs: ["shaft", "oilLamp", "ventPipe", "earthBaskets"] },
    options: [
      { id: "DigDeep", label: "按标准挖：三通、双口、留射孔", hint: "能守。也意味着有人要在洞里跟他们对峙。",
        effects: { unlockWork: "Tunnel", defenceBonus: 0.18, concealment: 0.15, stockDelta: { labor: -36 } }, ledger: {} },
      { id: "ShelterOnly", label: "只挖藏身洞，不设射孔，不在洞里打", hint: "藏得下人，守不住地方。",
        effects: { unlockWork: "Tunnel", concealment: 0.2, massDelta: 7, stockDelta: { labor: -22 } }, ledger: {} },
      { id: "LinkVillages", label: "先把三个村的地道连起来", hint: "工最重，可从此三个村是一个村。",
        effects: { unlockWork: "Tunnel", supplyRange: 1, intelRange: 1, stockDelta: { labor: -44, cadre: -1 } }, ledger: {} },
    ],
    flavor: "挖地道最累的不是挖，是运土。一个壮劳力一夜运八十筐，运到河滩摊开，天亮前还要泼水压平。" },
  { id: "Streamline", era: "Hardship", turnRange: [16, 21], weight: 97, condition: { once: true },
    title: "把机关砍下来", dateline: "1942年 冬 · 县委扩大会",
    body: "全县脱产人员一千一百人，吃公粮的按人头算，一年四十万斤。这个数字在会上念了两遍，没人说话。精兵简政的办法是：机关合并，主力缩编成地方武装，能回村的干部回村，带着组织关系去当村支书、当会计、当小学教员。有人想不通：干了五年，回去当农民？",
    illustration: { kind: "Assembly", tone: "cold", motifs: ["ledgerBook", "abacus", "coldRoom", "bedrollPacked"] },
    options: [
      { id: "DeepCut", label: "机关砍掉四成，主力缩编两个营", hint: "刀下去很疼，明年春天能省四十万斤。",
        effects: { maintenanceDiscount: 0.28, massGrowth: 0.35, stockDelta: { grain: 40 }, defenceBonus: -0.08, moveBonus: -0.05 }, ledger: {} },
      { id: "ModerateCut", label: "砍两成，主力不动，先减机关", hint: "两头都不彻底，两头都还能过。",
        effects: { maintenanceDiscount: 0.14, massGrowth: 0.15, stockDelta: { grain: 16 } }, ledger: {} },
      { id: "CadreToVillage", label: "干部整批下沉到村，一村一个", hint: "机关空了，村里满了。",
        effects: { massGrowth: 0.5, intelRange: 1, flatYield: { intel: 2 }, cadreGrowth: 0.2, stockDelta: { cadre: -3 }, defenceBonus: -0.05 }, ledger: {} },
    ],
    flavor: "下沉的干部要过三关：能挑水，能记工分，能在自己村里被人当面骂而不翻脸。" },
  { id: "SpringFamine", era: "Hardship", turnRange: [17, 21], weight: 98, condition: { seasons: ["春"] },
    title: "青黄不接", dateline: "1942年 春 · 全县",
    body: "去年秋天旱，收成不到常年的四成；冬天又被抢了两回。开春以后，能吃的都在吃：榆树皮剥光了，槐花没开就摘了，谷糠掺土。各村报上来的浮肿病人一千三百多。粮站账上的存粮是二十七万斤，要顶到麦收，还要养部队。",
    illustration: { kind: "Harvest", tone: "grim", motifs: ["strippedTree", "emptyGranary", "thinCrowd", "dustSky"] },
    options: [
      { id: "ReleaseStock", label: "开仓放粮，部队降到七成口粮", hint: "队伍走不动路了。村里能撑到麦收。",
        effects: { stockDelta: { grain: -70 }, massDelta: 9, healRate: -0.05, moveBonus: -0.06, duration: 3 }, ledger: {} },
      { id: "ReliefWork", label: "以工代赈：修渠、开荒，按工发粮", hint: "两头都顾一点，两头都不痛快。",
        effects: { stockDelta: { grain: -52 }, flatYield: { grain: 2 }, massDelta: 6, buildSpeed: 0.08, unlockPolicy: "ReliefWork" }, ledger: {} },
      { id: "HoldStock", label: "存粮一粒不动，先保部队", hint: "队伍是保住了。粮站门口的人还在等。",
        effects: { stockDelta: { grain: -10 }, massDelta: -14, exposureDelta: -2 }, ledger: { civilianDeaths: 240, displaced: 1400 } },
    ],
    flavor: "粮站的账本上，那年春天有一栏叫“借出未还”。到1945年，这一栏还有六万斤没销。" },
  { id: "Epidemic", era: "Hardship", turnRange: [16, 21], weight: 88, condition: { maxStock: { medicine: 30 } },
    title: "回归热", dateline: "1942年 冬 · 北三区",
    body: "先是几个村同时发烧，隔几天退，再隔几天又烧起来，浑身酸疼。军医判断是虱子传的回归热。防治只有两条：灭虱和隔离。灭虱要开水烫、日光晒、剃头，可冬天没有那么多柴烧水；隔离要腾房子，可房子多半已经烧了。全区的特效药是九支。",
    illustration: { kind: "Village", tone: "grim", motifs: ["boilingCauldron", "quarantineMark", "shavedHeads", "paleSun"] },
    options: [
      { id: "Quarantine", label: "腾出三个村做隔离，部队机关一律不进", hint: "断得住。三个村要单独过冬。",
        effects: { stockDelta: { medicine: -9, grain: -24 }, healRate: 0.1, moveBonus: -0.12, duration: 3 }, ledger: {} },
      { id: "LiceCampaign", label: "全区灭虱：烫衣、剃头、换铺草，柴由公家出", hint: "笨办法，可它是唯一管用的办法。",
        effects: { stockDelta: { grain: -18, labor: -20 }, healRate: 0.08, medicineEfficiency: 0.1, massDelta: 4 }, ledger: {} },
      { id: "CarryOn", label: "顾不上，先应付敌人的合击", hint: "仗打完了，人也病倒了一片。",
        effects: { stockDelta: { medicine: -3 }, exposureDelta: -4 }, ledger: { civilianDeaths: 310, cadreLost: 11 } },
    ],
    flavor: "卫生员的记录写着：某村四十二户，发病六十一人，死九人，其中三人是同一家的。" },
  { id: "HostageDemand", era: "Hardship", turnRange: [14, 20], weight: 91, condition: { minAlert: 35 },
    title: "十天期限", dateline: "1942年 秋 · 大堡子据点",
    body: "据点把大堡子村的十七个人扣了，多数是老人和妇女，还贴出告示：十天之内交出伤员和电台，否则按通匪论处。村里的人跑到区上来问怎么办。区上开了一夜的会。有人说，人不能不管；也有人说，交了这一次，下一次他们就知道这个法子管用。",
    illustration: { kind: "Night", tone: "grim", motifs: ["postedNotice", "lanternRow", "villageGate", "waitingCrowd"] },
    options: [
      { id: "NegotiateRansom", label: "通过两面政权和保长疏通，出粮赎人", hint: "九十石粮换回十五个人。另外两个没等到。",
        effects: { stockDelta: { grain: -90, medicine: -4 }, massDelta: 0, alertDelta: -2 }, ledger: { civilianDeaths: 2 } },
      { id: "RaidTheOutpost", label: "夜袭据点，硬把人抢回来", hint: "抢回来大半。抢的时候，双方都在开枪。",
        effects: { stockDelta: { ordnance: -16, medicine: -10 }, exposureDelta: 12, alertDelta: 14 }, ledger: { civilianDeaths: 6, cadreLost: 5 } },
      { id: "HoldFirmAndMove", label: "不交不赎，连夜把伤员和电台再转移", hint: "组织保住了。十七个人的名字记在墙上。",
        effects: { exposureDelta: -8, stockDelta: { labor: -10 } }, ledger: { civilianDeaths: 17, displaced: 600, villagesBurned: 1 } },
    ],
    flavor: "这件事以后区上定了一条：凡有人被扣，一律由区上出面，不许村里自己去凑钱。凑钱的口子一开，就没有底。" },
  { id: "CrossTheLine", era: "Hardship", turnRange: [15, 21], weight: 86, condition: {},
    title: "过路", dateline: "1942年 冬 · 第三道封锁线",
    body: "要把四十七个伤员送到路东的后方医院，中间过两道封锁沟、一条公路、一段铁路。带路的是两个交通员，走的是他们踩过十几次的路。规矩：不打枪、不说话、不点火，担架四人一副，两副之间隔二十步。过公路要看碉堡探照灯的规律——两分钟一转，转到北边的时候有十一秒的暗。",
    illustration: { kind: "Night", tone: "cold", motifs: ["stretcherLine", "searchlight", "frozenDitch", "ropeGuide"] },
    options: [
      { id: "WaitForSnow", label: "等一个下雪的夜里再走", hint: "雪能盖脚印，也能拖垮伤员。",
        effects: { stockDelta: { grain: -12, medicine: -6 }, concealment: 0.12, healRate: -0.04, duration: 2 }, ledger: {} },
      { id: "GoTonight", label: "今夜就走，伤员拖不起", hint: "多数人过去了。",
        effects: { stockDelta: { medicine: -8 }, exposureDelta: 5 }, ledger: { cadreLost: 3 } },
      { id: "Diversion", label: "在南边打一枪调开巡逻，主队从北边过", hint: "主队全过去了。打枪的那一组晚了半个钟头。",
        effects: { stockDelta: { ordnance: -8 }, alertDelta: 7, exposureDelta: 3, flags: ["DiversionUsed"] }, ledger: { cadreLost: 1 } },
    ],
    flavor: "交通员的本子上记着每一段路的脾气：哪一段有狗，哪一段的冰响，哪一家的门半夜会开。" },

  // ===== 恢复期 1943春 — 1944夏 =====
  { id: "GreatProduction", era: "Recovery", turnRange: [22, 26], weight: 100, condition: { once: true },
    title: "机关每人三分地", dateline: "1943年 春 · 全县",
    body: "命令下到每个机关：每人开荒三分，自种自收，不许误了本职，也不许占老百姓的熟地。头一个月怨言不少，拿笔的手起了泡，锄把磨断两根。到秋天算总账：全区机关部队开荒两千一百亩，收粮十七万斤，相当于少向群众征了一次公粮。",
    illustration: { kind: "Harvest", tone: "warm", motifs: ["hoeLine", "newFurrows", "seedBags", "slopeSun"] },
    options: [
      { id: "ReclaimWaste", label: "只开荒地和河滩，不动一分熟地", hint: "开的地薄，收的心实。",
        effects: { flatYield: { grain: 4 }, yieldBonus: { grain: 0.1 }, massDelta: 8, stockDelta: { labor: -20 }, unlockPolicy: "GreatProduction" }, ledger: {} },
      { id: "Workshops", label: "办纺织、造纸、榨油的作坊，换回来的比种出来的多", hint: "作坊有烟，烟能被看见。",
        effects: { flatYield: { labor: 3 }, yieldBonus: { labor: 0.12 }, stockDelta: { grain: 16, labor: -14 }, unlockDistrict: "TextileMill" }, ledger: {} },
      { id: "TransportTeams", label: "组织运输队跑脚，用牲口挣脚钱", hint: "来钱快，路上要过两道封锁线。",
        effects: { flatYield: { grain: 2 }, supplyRange: 1, stockDelta: { grain: 10 }, exposureDelta: 3 }, ledger: {} },
    ],
    flavor: "开荒的地界要跟村里立字据，写明荒地归公家种三年，三年后交回村里。字据一式三份。" },
  { id: "MutualAid", era: "Recovery", turnRange: [22, 27], weight: 95, condition: { minMass: 45 },
    title: "换工", dateline: "1943年 夏 · 槐树屯",
    body: "全屯六十一户，有牲口的十九户，缺劳力的二十四户，还有九户是军属。从前各干各的，忙时雇工，工钱按天算，没钱的只好把地荒着。变工的办法是记工分：人工一个工，牛工两个工，谁欠谁的年底找齐。头一年最难的是评工——一个壮劳力和一个半大孩子怎么折算，吵了三个晚上。",
    illustration: { kind: "Harvest", tone: "warm", motifs: ["oxAndPlough", "tallySticks", "courtyardMeeting", "wheatRows"] },
    options: [
      { id: "WorkPoints", label: "定工分制，年底找齐，账目公开", hint: "账清了，人就肯出力。",
        effects: { yieldBonus: { grain: 0.14, labor: 0.1 }, massDelta: 9, populationGrowth: 0.05, unlockDoctrine: "MutualAid" }, ledger: {} },
      { id: "FamiliesFirst", label: "先保军属和缺劳力户，牲口优先给他们用", hint: "地种得不算最好，人心稳。",
        effects: { yieldBonus: { grain: 0.08 }, massDelta: 12, unrestDecay: 0.5, unlockPolicy: "SupportFamilies" }, ledger: {} },
      { id: "Voluntary", label: "不强推，谁愿意换谁换", hint: "没人骂，也没什么变化。",
        effects: { yieldBonus: { grain: 0.05 }, massDelta: 3 }, ledger: {} },
    ],
    flavor: "工分本是麻绳穿的毛边纸，一户一本。识字的少，就画符号：一横一个工，一个圈半个工。" },
  { id: "WinterSchool", era: "Recovery", turnRange: [23, 26], weight: 90, condition: { seasons: ["冬"] },
    title: "冬学", dateline: "1943年 冬 · 各村",
    body: "农闲了，村村办冬学，白天上课的是娃娃，晚上是大人。全县办了一百四十七处，来的多是妇女——她们白天要做饭喂猪，只能晚上来。教材自己编，第一课是“人、手、口”，第二课是“工、农、兵”，第三课直接教记工分和写收条。有个五十多岁的人学了两个月，能把自家的地契念下来了，念完坐了很久。",
    illustration: { kind: "Night", tone: "warm", motifs: ["lampRow", "chalkBoard", "strawMats", "snowOutside"] },
    options: [
      { id: "PracticalText", label: "教材就教记工、写条、看布告", hint: "学得快，用得上。",
        effects: { literacy: 0.18, cadreGrowth: 0.2, flatYield: { intel: 1 }, massDelta: 6 }, ledger: {} },
      { id: "BroadText", label: "加上时事、卫生和算术", hint: "费灯油，也费先生。",
        effects: { literacy: 0.14, healRate: 0.04, researchSpeed: 0.06, massDelta: 8, stockDelta: { grain: -12 } }, ledger: {} },
      { id: "WomenFirst", label: "专办妇女班，时间挪到晚饭后", hint: "头一个月只来了七个人。第三个月来了四十个。",
        effects: { literacy: 0.12, massDelta: 11, populationGrowth: 0.04, flatYield: { labor: 2 }, unlockDoctrine: "WomensAssociation" }, ledger: {} },
    ],
    flavor: "冬学的灯油是各家凑的，一家一勺。学完了油灯要还回去，灯芯归学校。" },
  { id: "SupportTheArmy", era: "Recovery", turnRange: [22, 27], weight: 92, condition: {},
    title: "代耕", dateline: "1943年 秋 · 全县",
    body: "军属家里没有壮劳力，地只能靠代耕。办法是按户摊工，一亩地一年多少个工，写进村规。头两年执行得不好——代耕的人应付了事，锄地锄得浅，收成比别家少三成。今年改了：代耕的地由村里验收，收成低于同等地块两成的要补工。同时部队也定了规矩：借群众的东西必须还，损坏必须赔，赔不起的写欠条盖公章。",
    illustration: { kind: "Village", tone: "warm", motifs: ["ploughInField", "noticeBoard", "redPaperStrip", "handClasp"] },
    options: [
      { id: "InspectedTilling", label: "代耕验收制，收成不达标要补工", hint: "得罪几户人，救活几十亩地。",
        effects: { massDelta: 10, yieldBonus: { grain: 0.06 }, unrestDecay: 0.6, stockDelta: { labor: -12 } }, ledger: {} },
      { id: "ArmyDiscipline", label: "在部队里整纪律：借、还、赔一律上账", hint: "行军慢了，进村容易了。",
        effects: { massDelta: 13, alertDecay: 0.2, healRate: 0.02, moveBonus: -0.04, unlockPolicy: "ArmyDiscipline" }, ledger: {} },
      { id: "CashSupport", label: "拿边币补贴军属，不摊工", hint: "钱好发，地还是荒着。",
        effects: { stockDelta: { grain: -30 }, massDelta: 5, populationGrowth: 0.03 }, ledger: {} },
    ],
    flavor: "春节前挨家送慰问，一户二斤肉、一张年画。年画是自己刻的木版，印的是纺线和耕地。" },
  { id: "LoomsAndCloth", era: "Recovery", turnRange: [22, 26], weight: 84, condition: {},
    title: "一架纺车", dateline: "1943年 冬 · 被服厂",
    body: "一个人一冬能纺多少线？熟手一天四两，一冬按九十天算，三十六斤。全区要做两万件棉衣，需要棉花十二万斤、线四万斤。厂里只有九架旧织机，就动员各村妇女在家纺，纺好的线按斤收，发边币或者换粮。难在染色——没有洋靛，用槐米和皂矾染出来的灰不匀，晒过三个日头就发黄。",
    illustration: { kind: "Village", tone: "warm", motifs: ["spinningWheel", "yarnHanks", "dyeVat", "clothStack"] },
    options: [
      { id: "HomeSpinning", label: "分散到户纺线，按斤收购", hint: "慢，可每户都能挣一点。",
        effects: { flatYield: { labor: 3 }, massDelta: 8, stockDelta: { grain: -20 }, unlockDistrict: "ClothingWorks" }, ledger: {} },
      { id: "CentralizeMill", label: "集中办厂，招工三百人", hint: "产量翻一番，厂房烟囱也立在那里。",
        effects: { flatYield: { labor: 4 }, buildSpeed: 0.08, stockDelta: { grain: -32, labor: -10 }, exposureDelta: 4 }, ledger: {} },
      { id: "DyeResearch", label: "先把染色和织法弄扎实，再铺开", hint: "今年冬天要冷一冬。",
        effects: { researchSpeed: 0.1, healRate: 0.04, flatYield: { labor: 2 }, duration: 6 }, ledger: {} },
    ],
    flavor: "被服厂的账上，一件棉衣折合六斤棉、一斤半线、四个工。一个战士一冬一件，要穿两年。" },
  { id: "SqueezeTheEnemy", era: "Recovery", turnRange: [24, 27], weight: 94, condition: { minMass: 50 },
    title: "把他挤回公路上去", dateline: "1944年 春 · 东塬三个据点",
    body: "不硬打。办法是围着据点做四件事：断集市、断水源、断劳工、断消息。据点的粮靠周围村子供，供不上就要出来抢；出来抢就得走我们埋雷的路。三个月后，最东边那个据点的伪军自己把外墙拆了一段，说是修工事，其实是想让我们看见他们没打算守。",
    illustration: { kind: "Ridge", tone: "cold", motifs: ["blockhouseDusk", "emptyMarket", "dryWell", "watchers"] },
    options: [
      { id: "FullSqueeze", label: "四断齐上，围而不攻", hint: "不放一枪，三个月见效。",
        effects: { alertDelta: -6, puppetDefection: 0.18, flatYield: { intel: 2 }, stockDelta: { labor: -16 }, exposureDelta: 4 }, ledger: {} },
      { id: "SelectiveSqueeze", label: "只断劳工和消息，集市照常，让老百姓有地方买盐", hint: "慢一半，可村里不骂。",
        effects: { puppetDefection: 0.1, massDelta: 7, flatYield: { intel: 1 } }, ledger: {} },
      { id: "AssaultEast", label: "趁他动摇，直接打掉最东边那个", hint: "打下来了。伤亡在攻墙的那十分钟里。",
        effects: { stockDelta: { ordnance: -22, medicine: -8 }, alertDelta: 10, flags: ["EastOutpostTaken"] }, ledger: { cadreLost: 7 } },
    ],
    flavor: "断集市不是不许赶集，是把集挪到我们这边的村子。挪一次集，据点里就少一份消息。" },

  // ===== 反攻期 1944秋 — 1945夏 =====
  { id: "SummerOffensive", era: "Counter", turnRange: [28, 30], weight: 100, condition: { once: true },
    title: "轮到我们出去了", dateline: "1944年 秋 · 全县",
    body: "敌人从这一带抽走了两个大队。据点还是那些据点，可夜里炮楼上的哨从四个减到两个，白天出来的巡逻不敢走远。上级的指示只有八个字：主动出击，扩大解放区。县里定了三步：先打孤立的小据点，再断公路，最后逼县城。要紧的是打下来以后——政权、生产、防疫、学校，一样都不能少，否则老百姓不会搬回来。",
    illustration: { kind: "Assembly", tone: "warm", motifs: ["mapOnTable", "marchingColumn", "harvestBehind", "morningLight"] },
    options: [
      { id: "SmallFirst", label: "先打最孤立的三个小据点", hint: "稳扎稳打，一个一个来。",
        effects: { stockDelta: { ordnance: -18 }, captureRate: 0.12, alertDelta: 6, flags: ["OffensiveStarted"] }, ledger: {} },
      { id: "CutRoads", label: "先把公路彻底断掉，让据点自己饿", hint: "不打，等他撑不住。",
        effects: { railSabotage: 0.2, puppetDefection: 0.15, alertDelta: 8, stockDelta: { labor: -20 } }, ledger: {} },
      { id: "RestoreFirst", label: "先把已收复地方的政权和生产恢复起来", hint: "推进慢了两个月。搬回来的人多了三千。",
        effects: { massGrowth: 0.4, populationGrowth: 0.12, flatYield: { grain: 3 }, buildSpeed: 0.1 }, ledger: {} },
    ],
    flavor: "作战命令的最后一条通常是：打扫战场，掩埋双方遗体，登记缴获，向群众公布。" },
  { id: "BlockhouseFalls", era: "Counter", turnRange: [28, 31], weight: 96, condition: { minStock: { ordnance: 20 } },
    title: "十七米", dateline: "1944年 冬 · 马蹄泉据点",
    body: "炮楼三层，砖石结构，墙厚七十公分，四面射孔，外面一道壕一道鹿砦。我们的办法是掘进：从十七米外的一个牲口棚里往下挖，挖到墙根装药。药是修械所配的黑火药，六百斤，装在四口大缸里。掘进用了九夜，最后两夜听得见头顶上哨兵的脚步。",
    illustration: { kind: "Tunnel", tone: "cold", motifs: ["sapTunnel", "powderJars", "blockhouseWall", "nightGuard"] },
    options: [
      { id: "SapAndBlow", label: "挖到墙根爆破", hint: "六百斤药，九个夜晚，两分钟。",
        effects: { stockDelta: { ordnance: -26 }, alertDelta: 5, flags: ["BlockhouseTaken"] }, ledger: { cadreLost: 3 } },
      { id: "PersuadeGarrison", label: "先劝降，给三天时间，让家属出面", hint: "不用炸药。要用三天和一点信用。",
        effects: { puppetDefection: 0.22, stockDelta: { ordnance: 12 }, massDelta: 4, flags: ["BlockhouseTaken"] }, ledger: {} },
      { id: "StarveOut", label: "围困，断水断粮，等他自己撤", hint: "最省人，最费粮，最考验耐心。",
        effects: { stockDelta: { grain: -24, labor: -14 }, alertDelta: -4, flags: ["BlockhouseAbandoned"] }, ledger: {} },
    ],
    flavor: "清点缴获：步枪三十一支、掷弹筒一具、粮八千斤。伪军里的本县人登记后放回原籍，交村里管束。" },
  { id: "PuppetDefection", era: "Counter", turnRange: [28, 31], weight: 93, condition: { minStock: { intel: 20 } },
    title: "一个中队的夜里", dateline: "1945年 春 · 南关",
    body: "南关的伪军中队长托人送来一张纸，写着四条：一、不打散建制；二、不追究以前；三、家属安全；四、给个正式名义。区上答应了前三条，第四条要请示。反正定在初七夜里，办法是内外接应，枪械先抬出来，人再走。最怕的是走漏——一百二十人，只要有一个人说出去，全完。",
    illustration: { kind: "Night", tone: "cold", motifs: ["gateAjar", "stackedRifles", "signalLamp", "quietStreet"] },
    options: [
      { id: "AcceptAll", label: "四条全答应，先把人和枪接过来", hint: "东西到手了。有的村子不认这笔账。",
        effects: { stockDelta: { ordnance: 46, grain: -30 }, puppetDefection: 0.2, massDelta: -5, alertDelta: -8 }, ledger: {} },
      { id: "ScreenThenAccept", label: "接过来，但要甄别，有血债的另案处理", hint: "慢，麻烦，村里服气。",
        effects: { stockDelta: { ordnance: 38, grain: -24 }, massDelta: 6, unlockDoctrine: "PuppetWork", puppetDefection: 0.12 }, ledger: {} },
      { id: "DeclineButUse", label: "不接，只要他们不打枪、放我们过路", hint: "什么都没得到，什么都没冒险。",
        effects: { alertDecay: 0.4, concealment: 0.06, flatYield: { intel: 2 } }, ledger: {} },
    ],
    flavor: "反正的队伍要过一次群众关：在村里公开讲一遍自己干过什么，讲完由群众提意见。有人讲不下去。" },
  { id: "CountySeatReturn", era: "Counter", turnRange: [30, 31], weight: 98, condition: { requireFlags: ["OffensiveStarted"] },
    title: "县城的门", dateline: "1945年 夏 · 县城",
    body: "城墙是明代的，六米高，四个门，护城河干了一半。围了十九天，断水断电，第十七天伪军一个大队从西门出来缴了械。那天早上，城门是从里面打开的。进城以后第一件事不是开会，是接管粮库、发电所、监狱和医院，并且贴出布告：市面照常，物价不许涨，商铺不许关门。",
    illustration: { kind: "Assembly", tone: "warm", motifs: ["cityGate", "proclamation", "grainDepot", "dawnCrowd"] },
    options: [
      { id: "OrderFirst", label: "先接管、先安民，部队一律不进商铺住宿", hint: "第三天集市就开了。",
        effects: { massDelta: 14, populationGrowth: 0.15, flatYield: { grain: 4, labor: 3 }, unlockDistrict: "CountyOffice" }, ledger: {} },
      { id: "SecureStores", label: "先把粮库、械弹库、电台全部控制住", hint: "东西全在手里。街上乱了两天。",
        effects: { stockDelta: { grain: 120, ordnance: 60, medicine: 20 }, massDelta: 2, exposureDelta: -6 }, ledger: {} },
      { id: "PursueEastward", label: "分兵向东追击，扩大战果", hint: "追出去六十里。城里的接管晚了五天。",
        effects: { stockDelta: { medicine: -10, ordnance: -6 }, alertDelta: -10, massDelta: -3 }, ledger: { cadreLost: 4 } },
    ],
    flavor: "布告最后一行写着：凡日伪军人员，放下武器者不杀；有血债者依法审判，不得私自处置。" },
  { id: "Surrender1945", era: "Counter", turnRange: [31, 31], weight: 100, condition: { once: true, minTurn: 31 },
    title: "八月", dateline: "1945年 夏 · 县城与各区",
    body: "消息是从收音机里来的，头一天不敢信，第二天才确认。街上有人放鞭炮，也有人只是坐在门槛上。区上连夜布置了三件事：接受投降与收缴武器；维持秩序，防止溃兵与土匪抢掠；统计八年的损失。第三件最花时间——各村报上来的表格要填五栏：死亡、伤残、被烧房屋、被抢粮食牲口、失踪未归。有的村填了三天，有的村填不下去。",
    illustration: { kind: "Assembly", tone: "warm", motifs: ["newspaperSheet", "villageTable", "emptyChairs", "summerLight"] },
    options: [
      { id: "AcceptSurrender", label: "按规定受降、收缴、编管，绝不私自处置", hint: "该走的程序一步不省。",
        effects: { massDelta: 10, unlockDoctrine: "PostwarOrder", flags: ["SurrenderAccepted"] }, ledger: {} },
      { id: "ReconstructNow", label: "同时铺开复员与重建，人先回村", hint: "秋种还赶得上。",
        effects: { populationGrowth: 0.3, flatYield: { grain: 5, labor: 4 }, massDelta: 8, flags: ["SurrenderAccepted", "ReconstructionStarted"] }, ledger: {} },
      { id: "CountTheCost", label: "先把损失统计做完，一村一村地核", hint: "核完了要念一遍。念的人换了三个。",
        effects: { massDelta: 6, literacy: 0.1, flatYield: { intel: 2 }, flags: ["SurrenderAccepted", "LedgerCompleted"] }, ledger: {} },
    ],
    flavor: "统计表最后一栏是“失踪未归”。这一栏后来一直空着，因为没有人愿意把它改成别的字。" },
]);

// ---------------------------------------------------------------------------
// 地块 / 单位 / 建筑的史料风味短句
// subjectKind: 'Terrain' | 'Feature' | 'Unit' | 'District' | 'Work'
// UI 在鼠标悬停或选中时随机取一条，不影响任何数值。
// ---------------------------------------------------------------------------

export const fieldNotes = DeepFreeze([
  // 地形
  { subjectKind: "Terrain", subjectKey: "Mountain", text: "主脊上没有路，只有羊道。背东西上山，一个人一趟六十斤，来回一天半。" },
  { subjectKind: "Terrain", subjectKey: "Ridge", text: "山梁是最好的了望台，也是最容易被看见的地方。哨位要设在梁下三尺，人趴着，头不过线。" },
  { subjectKind: "Terrain", subjectKey: "Hill", text: "丘陵里村和村之间隔着沟，喊得应，走过去要一个钟头。这种地形最养游击队。" },
  { subjectKind: "Terrain", subjectKey: "Forest", text: "山桃、栎树、柏。林子里白天能藏一个营，可一起火就再也藏不住。" },
  { subjectKind: "Terrain", subjectKey: "Plain", text: "平原一望到底，没有藏身的地方。冀中的办法是把藏身处挖到地下去。" },
  { subjectKind: "Terrain", subjectKey: "Loess", text: "黄土崖上掏窑，冬暖夏凉，一炮打不塌，可怕水。1942年雨季塌了三孔，砸伤五人。" },
  { subjectKind: "Terrain", subjectKey: "Marsh", text: "苇塘里有暗沟，不熟路的人白天也会陷进去。渡船夜里不点灯，靠竿子探底。" },
  { subjectKind: "Terrain", subjectKey: "River", text: "河一封冻，防线就没了；一开河，桥就成了唯一的路。两头都得有人守。" },
  { subjectKind: "Terrain", subjectKey: "Gorge", text: "峡口宽处不到二十步，两边是崖。这种地方一个班能挡半天，也可能一个班全折在里头。" },
  // 地物
  { subjectKind: "Feature", subjectKey: "Village", text: "四十来户，一盘碾，一口井，两棵老槐。全县二百七十个这样的村子，是全部的家底。" },
  { subjectKind: "Feature", subjectKey: "Town", text: "逢一、六赶集。集上什么消息都有，什么人都有，我们的交通员和他们的坐探常常隔着一个粮摊。" },
  { subjectKind: "Feature", subjectKey: "CountySeat", text: "城墙六米高，四门。城里有电灯、电话、粮库和监狱。八年里我们进去过三次，头两次是夜里。" },
  { subjectKind: "Feature", subjectKey: "Ford", text: "渡口的水深看石头：露出三块能趟，露出一块要脱衣裳，一块不露就得等。" },
  { subjectKind: "Feature", subjectKey: "Pass", text: "隘口的老关帝庙让炮火掀了顶，墙还在。哨兵在墙根下背风处点半根烟，不敢点整根。" },
  { subjectKind: "Feature", subjectKey: "Shrine", text: "山神庙不大，能睡十来个人。庙里的供桌被抬去做过担架，后来又抬回来了。" },
  { subjectKind: "Feature", subjectKey: "Terrace", text: "梯田是一辈一辈垒起来的，一亩地的石堰能用掉三百块石头。谁毁堰谁赔，这是村规，比法条老。" },
  { subjectKind: "Feature", subjectKey: "Grove", text: "枣林九月打枣，竿子一响半个村都来。日本人来过一次以后，枣树砍了做鹿砦。" },
  { subjectKind: "Feature", subjectKey: "Quarry", text: "石窝里出的砂石硬，凿石雷正合适。石匠说，一天能凿三个，多了手抖。" },
  { subjectKind: "Feature", subjectKey: "SaltPan", text: "熬土盐的锅昼夜不停，一百斤墙土出不到二两。盐分下去按人头，一人半斤，先给病人。" },
  // 工事与改良
  { subjectKind: "Work", subjectKey: "Terrace", text: "修堰要在秋后，土冻前。一个壮劳力一天垒两丈，垒完还要用脚踩三遍。" },
  { subjectKind: "Work", subjectKey: "Trench", text: "交通壕要挖成折的，不能直——直壕一梭子扫到底。转角处留一个能蹲下的坑。" },
  { subjectKind: "Work", subjectKey: "Tunnel", text: "地道口有七种：井壁、灶膛、炕洞、驴槽、坟头、磨盘下、柴垛底。最好的口是天天有人用的地方。" },
  { subjectKind: "Work", subjectKey: "Smithy", text: "修械所的炉子夜里生火，白天封着。烟从灶膛引出去，混在做饭的烟里。" },
  { subjectKind: "Work", subjectKey: "Cache", text: "埋粮的缸口朝下，底下垫石灰。起出来能吃的记一笔，霉了的也记一笔。" },
  { subjectKind: "Work", subjectKey: "Beacon", text: "报警用旗和烟：白天举红旗，夜里点三堆火。这套办法是从明长城的烽燧学来的。" },
  // 我方单位
  { subjectKind: "Unit", subjectKey: "WorkTeam", text: "工作队三五个人，背一个挎包、一支笔、几本空白登记册。他们的活是让一个村子肯说话。" },
  { subjectKind: "Unit", subjectKey: "Guerrilla", text: "游击队一人一支枪，子弹平均五发。规矩是打完就走，天亮前必须离开三十里。" },
  { subjectKind: "Unit", subjectKey: "Militia", text: "民兵不脱产，白天种地晚上站岗。枪不够，一半人拿的是红缨枪和土压枪。" },
  { subjectKind: "Unit", subjectKey: "MainForce", text: "主力连一百二十人，重机枪一挺，掷弹筒两具。这样的连全县能凑出四个。" },
  { subjectKind: "Unit", subjectKey: "Sapper", text: "工兵班的家伙是镐、锹、绳、炸药。他们最擅长的不是炸，是挖，而且是安静地挖。" },
  { subjectKind: "Unit", subjectKey: "Scout", text: "侦察员出去带三样东西：干粮、路条、一张能吞下去的纸。回来先画图，再说话。" },
  { subjectKind: "Unit", subjectKey: "Stretcher", text: "担架队四人一副，多是村里的中年人。规矩是伤员先过，队伍后过。" },
  { subjectKind: "Unit", subjectKey: "Courier", text: "交通员靠腿走，一夜六十里。他们记路不记名，出事只咬自己那一段。" },
  { subjectKind: "Unit", subjectKey: "Transport", text: "运输队用驴和独轮车。一头驴驮一百五十斤，一辆车推三百斤，山路要两个人扶。" },
  { subjectKind: "Unit", subjectKey: "Cavalry", text: "全县的马不到二十匹，多数用来传令。骑兵进村先下马，牵着走，这是规定。" },
  // 敌方
  { subjectKind: "Unit", subjectKey: "JapaneseInfantry", text: "一个中队约一百八十人，配轻机枪六挺、掷弹筒六具。他们的补给靠公路，离开公路二十里就慢下来。" },
  { subjectKind: "Unit", subjectKey: "PuppetInfantry", text: "伪军多是本地招的，饷不按时发。有的人一边站岗一边给家里捎话，两头都不敢得罪。" },
  { subjectKind: "Unit", subjectKey: "ArmoredCar", text: "装甲车下不了公路。山口一堵，它只能原路退回去，退的时候最容易被打。" },
  { subjectKind: "Unit", subjectKey: "MountainGun", text: "山炮拆开用骡子驮，架设要十分钟。这十分钟是全部的机会。" },
  { subjectKind: "Unit", subjectKey: "RailGuard", text: "护路队沿线巡道，两小时一趟。他们最恨夜里下雨——雨天看不见钢轨上的痕迹。" },
  { subjectKind: "Unit", subjectKey: "SweepColumn", text: "扫荡纵队走的是合击：几路同时出发，按钟点在图上一个点会合。慢一路，全盘落空。" },
  // 根据地区域
  { subjectKind: "District", subjectKey: "Arsenal", text: "兵工厂设在山洞里，机床是从矿上拆来的。翻造一发子弹的工时比造一把锄头还长。" },
  { subjectKind: "District", subjectKey: "ClothingWorks", text: "被服厂九架织机，三百个在家纺线的妇女。一件棉衣的成本记在账上：六斤棉、一斤半线、四个工。" },
  { subjectKind: "District", subjectKey: "Clinic", text: "卫生所常备的药只有八种，最要紧的是酒精和纱布。做手术要三盏油灯，两个人举着。" },
  { subjectKind: "District", subjectKey: "NightSchool", text: "夜校的黑板是刷了锅灰的门板。头一课教三个字：人、手、口。" },
  { subjectKind: "District", subjectKey: "Granary", text: "粮站的账分四本：入库、出库、借出未还、损耗。第三本最厚。" },
  { subjectKind: "District", subjectKey: "CourierStation", text: "交通站不挂牌子，多半是一户人家。接头的暗号一周一换，换法只有两个人知道。" },
  { subjectKind: "District", subjectKey: "SupplyDepot", text: "兵站管的是粮、鞋、盐和担架。一个兵站的存粮按规定不许超过三万斤，怕一炸全没。" },
  { subjectKind: "District", subjectKey: "TunnelMouth", text: "地道口的规矩是：进出必须复位，柴垛要照原样码好，连脚印都得扫。" },
  { subjectKind: "District", subjectKey: "RadioRoom", text: "电台一天两次联络，每次不超过十五分钟——超过十五分钟，敌人的测向车就能圈出范围。" },
  { subjectKind: "District", subjectKey: "Range", text: "靶场设在废窑后面，打三发算一次考核。子弹金贵，多数时候练的是瞄准和据枪，不放实弹。" },
  { subjectKind: "District", subjectKey: "PeasantAssociation", text: "农会管的事很杂：评工分、调地界、算租子、办丧事。开会常常从天黑说到鸡叫。" },
  { subjectKind: "District", subjectKey: "MilitiaGround", text: "训练场就是村外的打谷场。农忙时收起木枪堆麦子，农闲时再摆出来。" },
]);

// ---------------------------------------------------------------------------
// 时代文献风格短句
// 出处一律泛化，不署具体人名，不伪造任何真实历史人物的原话。
// ---------------------------------------------------------------------------

export const quotes = DeepFreeze([
  { text: "根据地不是打出来的，是一个村一个村谈出来、扶起来、守下来的。", source: "边区干部训练班讲授提纲" },
  { text: "队伍走到哪里，先看三样：井里有没有水，地里有没有人，村口有没有人肯抬头看你。", source: "某区工作队工作笔记" },
  { text: "群众把粮借给你，不是因为你能打，是因为他相信你会还。", source: "根据地干部回忆" },
  { text: "把兵减下来，把干部放下去。机关瘦一斤，村里就壮一斤。", source: "县委扩大会决议摘录" },
  { text: "宁可少打一仗，不可失掉一村。地丢了还能收回来，人心散了收不回来。", source: "分区作战总结" },
  { text: "反扫荡的第一件事不是打，是把人和粮藏好；第二件事还是藏；第三件事才是打。", source: "反扫荡工作要点" },
  { text: "一发子弹从捡壳子到装回弹夹，要过十一双手。请你打之前想一想这十一个人。", source: "军区供给部纪要" },
  { text: "统计要实。多报一个死难者是对死者不敬，少报一个是对生者不公。", source: "某县抗日民主政府布告" },
  { text: "对伪军，先不谈立场，先谈他家里的老娘和地。谈通了，立场自己会动。", source: "对敌工作经验交流材料" },
  { text: "开荒不许占熟地，砍柴不许砍活树，借东西要还，损坏要赔——这几条比枪管用。", source: "部队群众纪律守则（油印本）" },
  { text: "今年的账目要贴在村口，识字的念给不识字的听。念完了让大家骂，骂完了再改。", source: "村政权工作办法" },
  { text: "冬学教什么？教他们能自己看懂布告，能自己算清工分，能自己写下名字。", source: "冬学教材编写说明" },
  { text: "这一年最难的不是敌人，是天。旱了一春，蝗过一秋，人还是熬过来了。", source: "边区通讯" },
  { text: "敌人有钢，我们有沟。他修一里沟，我们就多知道一里沟怎么过。", source: "交通工作总结" },
  { text: "打完就走，走的时候把该带的带走，把不该留的处理掉，把老乡的门关好。", source: "游击队行动守则" },
  { text: "胜利那天要做的第一件事，不是庆祝，是把八年的账一笔一笔算清楚。", source: "一九四五年区级会议记录摘录" },
]);

// ---------------------------------------------------------------------------
// 多结局评价
//
// 评定维度（按重要性递减）：根据地存续、群众基础、建设水平、人民代价。
// 歼敌数不参与评定。metrics 由 Script_Rules 汇总后传入 EvaluateEnding。
// metrics = {
//   baseRatio,        // 根据地（含游击区）占全图比例 0..1
//   massAverage,      // 全图群众基础均值 0..100
//   districtCount,    // 建成的根据地区域数量
//   populationRatio,  // 终局人口 / 开局人口
//   literacy,         // 识字率 0..1
//   civilianDeaths, displaced, villagesBurned, cadreLost, grainSeized,
//   villageCount,     // 图上村庄总数，用于把绝对代价折成相对代价
// }
// ---------------------------------------------------------------------------

export const endingDefinitions = DeepFreeze({
  PrairieFire: {
    key: "PrairieFire",
    title: "燎原",
    priority: 10,
    condition: { minBaseRatio: 0.55, minMass: 70, minDistricts: 10, minPopulationRatio: 0.95, maxDeathsPerVillage: 4 },
    body:
      "到1945年夏天，全县二百七十个村里有二百三十一个能正常收公粮、办冬学、开村民会。兵工厂搬了四次家，还在出子弹；卫生所有了自己的手术室；识字的人比八年前多了三倍。这一切不是某一仗打出来的，是每年秋后的账目、每个冬天的棉衣、每次转移时先走的担架换来的。",
    epilogue:
      "接收县城那天，进城的队伍在城门口停了一停，让先出城的老百姓过去。八年前从这里往山里走的人，有一部分回来了。",
  },
  RootedDeep: {
    key: "RootedDeep",
    title: "扎下根",
    priority: 20,
    condition: { minBaseRatio: 0.45, minMass: 60, minDistricts: 7, minPopulationRatio: 0.85 },
    body:
      "根据地站住了。地方虽然没有连成一整片，但每个区都有自己的粮站、修械点和交通线，村村有农会，多数村有民兵。困难时期丢掉的四个区，到1944年收回来三个。",
    epilogue: "秋后统计人口，比1937年少了七千多，比1942年多了一万一。有人说，这个数字是一寸一寸挪回来的。",
  },
  HardWon: {
    key: "HardWon",
    title: "民力维艰",
    priority: 15,
    condition: { minBaseRatio: 0.4, minMass: 45, minDeathsPerVillage: 12 },
    body:
      "地方守住了，人没守住。八年下来，村村都有空院子。有些村子的名字还在图上，可搬回来的不到三成。根据地的架子完整，血却是从群众身上流的。",
    epilogue: "损失统计做到第九个月才停下。最后一栏“失踪未归”，全县四千一百人，没有再填过。",
  },
  QuietBuilding: {
    key: "QuietBuilding",
    title: "一寸一寸",
    priority: 30,
    condition: { minBaseRatio: 0.3, minMass: 50, minDistricts: 5 },
    body:
      "没有惊人的战绩，也没有塌下来的年份。八年里做成的事情大多很小：修了三条渠，办了一百四十七处冬学，把两次春荒扛了过去，把地道从三个村连到了十一个村。",
    epilogue: "1945年的账本上，最扎眼的一行是“借出未还六万斤”。区上决定不追，改成了赈灾。",
  },
  ScatteredButAlive: {
    key: "ScatteredButAlive",
    title: "化整为零",
    priority: 25,
    condition: { maxBaseRatio: 0.28, minMass: 45 },
    body:
      "地方大半丢了，组织还在。困难时期把机关砍到最小，干部整批下沉到村，武装缩成一个个不脱产的小组。敌人的地图上这一片是白的，可他们每一次进山，都还是有人在前头点火报警。",
    epilogue: "反攻开始的时候，从各村冒出来的人比谁预计的都多。名册是分散着记的，凑起来才发现一个也没少太多。",
  },
  DrivenToTheHills: {
    key: "DrivenToTheHills",
    title: "退回山里",
    priority: 40,
    condition: { maxBaseRatio: 0.2, maxMass: 45 },
    body:
      "被压回了西边的几条深沟。平原和丘陵上的村子多数插上了伪政权的牌子，我们的活动只剩下夜里。粮靠背，药靠熬，消息靠腿。撑到1944年敌人抽兵，才慢慢往外挪。",
    epilogue: "山里那几个村八年没断过公粮，最后一次交粮时，全村的存粮加起来不到两千斤。",
  },
  HollowMap: {
    key: "HollowMap",
    title: "一张空图",
    priority: 5,
    condition: { maxMass: 30, minBurnedRatio: 0.3 },
    body:
      "地图上的控制区还画着颜色，颜色下面已经没有多少人了。被烧过的村子超过三成，流离在外的人到胜利也没回来。政权还在，可开会的时候，桌子那边坐着的多是外村来的人。",
    epilogue: "有一份统计写了一半就压下了。区上的意见是：数字要报，但不能只报数字。",
  },
  RebuiltInAutumn: {
    key: "RebuiltInAutumn",
    title: "秋后重建",
    priority: 18,
    condition: { minBaseRatio: 0.5, minPopulationRatio: 1, minDistricts: 8, requireFlags: ["ReconstructionStarted"] },
    body:
      "受降的命令下来那天，复员和重建同时铺开。回村的人赶上了秋种，冬天以前修好了两千一百间房。全县的小学从十一处恢复到六十四处。",
    epilogue: "第二年春天，有村子请人重写了村口的碑。碑上不写战绩，写的是八年里每一家的名字。",
  },
});

// ---------------------------------------------------------------------------
// 纯查询函数（不改动任何输入对象）
// ---------------------------------------------------------------------------

/** 从 State 提取事件条件判定所需的上下文。字段缺失时给安全默认值，绝不抛异常。 */
export function BuildEventContext(state) {
  const source = state && typeof state === "object" ? state : {};
  const turn = Math.max(0, Math.min(totalTurns - 1, Math.floor(Number(source.turn) || 0)));
  const hexes = source.map && source.map.hexes ? source.map.hexes : {};
  const keys = Object.keys(hexes);
  let massTotal = 0;
  let villageCount = 0;
  let baseCount = 0;
  let burned = 0;
  let hasRailway = false;
  for (const key of keys) {
    const hex = hexes[key] || {};
    massTotal += Number(hex.massBase) || 0;
    if (hex.feature === "Village" || hex.feature === "Town" || hex.feature === "CountySeat") villageCount += 1;
    if (hex.control === "Base" || hex.control === "Guerrilla") baseCount += 1;
    if ((Number(hex.scorch) || 0) >= 60) burned += 1;
    if (hex.railway) hasRailway = true;
  }
  return {
    turn,
    eraKey: source.eraKey || GetEraKeyForTurn(turn),
    season: GetSeason(turn),
    massAverage: keys.length ? massTotal / keys.length : 0,
    exposure: Number(source.exposure) || 0,
    alert: Number(source.alert) || 0,
    stock: source.stock && typeof source.stock === "object" ? source.stock : {},
    flags: Array.isArray(source.flags) ? source.flags : [],
    firedEventIds: Array.isArray(source.firedEventIds) ? source.firedEventIds : [],
    baseCount,
    villageCount,
    burnedCount: burned,
    hexCount: keys.length,
    unitCount: Array.isArray(source.units) ? source.units.length : 0,
    hasRailway,
    sweepActive: Boolean(source.sweep),
  };
}

function MeetsStock(required, stock, wantAtLeast) {
  if (!required) return true;
  for (const key of Object.keys(required)) {
    const have = Number(stock[key]) || 0;
    const want = Number(required[key]) || 0;
    if (wantAtLeast ? have < want : have > want) return false;
  }
  return true;
}

/** 判定一条事件的 condition 是否满足。condition 为空对象时恒为真。 */
export function EvaluateEventCondition(condition, context) {
  const rule = condition && typeof condition === "object" ? condition : {};
  const ctx = context && typeof context === "object" ? context : {};
  if (rule.minTurn !== undefined && ctx.turn < rule.minTurn) return false;
  if (rule.maxTurn !== undefined && ctx.turn > rule.maxTurn) return false;
  if (Array.isArray(rule.eraKeys) && !rule.eraKeys.includes(ctx.eraKey)) return false;
  if (Array.isArray(rule.seasons) && !rule.seasons.includes(ctx.season)) return false;
  if (rule.minMass !== undefined && (ctx.massAverage || 0) < rule.minMass) return false;
  if (rule.maxMass !== undefined && (ctx.massAverage || 0) > rule.maxMass) return false;
  if (rule.minExposure !== undefined && (ctx.exposure || 0) < rule.minExposure) return false;
  if (rule.maxExposure !== undefined && (ctx.exposure || 0) > rule.maxExposure) return false;
  if (rule.minAlert !== undefined && (ctx.alert || 0) < rule.minAlert) return false;
  if (rule.maxAlert !== undefined && (ctx.alert || 0) > rule.maxAlert) return false;
  if (rule.minVillages !== undefined && (ctx.villageCount || 0) < rule.minVillages) return false;
  if (rule.minBases !== undefined && (ctx.baseCount || 0) < rule.minBases) return false;
  if (rule.minUnits !== undefined && (ctx.unitCount || 0) < rule.minUnits) return false;
  if (rule.requireRailway && !ctx.hasRailway) return false;
  if (rule.requireSweepActive && !ctx.sweepActive) return false;
  if (!MeetsStock(rule.minStock, ctx.stock || {}, true)) return false;
  if (!MeetsStock(rule.maxStock, ctx.stock || {}, false)) return false;
  if (Array.isArray(rule.requireFlags)) {
    const flags = ctx.flags || [];
    for (const flag of rule.requireFlags) if (!flags.includes(flag)) return false;
  }
  if (Array.isArray(rule.forbidFlags)) {
    const flags = ctx.flags || [];
    for (const flag of rule.forbidFlags) if (flags.includes(flag)) return false;
  }
  return true;
}

/**
 * 选出当前回合的候选事件，按权重降序返回。
 * roll 为 0..1 的确定性随机值（来自 Script_Hex 的 CreateRng），用于在同权重里打散顺序。
 */
export function SelectHistoricalEvents(context, roll = 0) {
  const ctx = context && typeof context === "object" ? context : {};
  const fired = ctx.firedEventIds || [];
  const candidates = [];
  for (const event of historicalEvents) {
    if (ctx.turn < event.turnRange[0] || ctx.turn > event.turnRange[1]) continue;
    if (event.condition && event.condition.once && fired.includes(event.id)) continue;
    if (!EvaluateEventCondition(event.condition, ctx)) continue;
    const jitter = ((HashText(event.id) / 4294967296 + roll) % 1) * 12;
    candidates.push({ event, score: event.weight + jitter });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.map((entry) => entry.event);
}

/** 32 位字符串哈希，用于给同权重事件做确定性打散。 */
export function HashText(text) {
  let hash = 2166136261;
  const value = String(text);
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function GetEventById(id) {
  return historicalEvents.find((event) => event.id === id) || null;
}

export function GetEventOption(eventId, optionId) {
  const event = GetEventById(eventId);
  if (!event) return null;
  return event.options.find((option) => option.id === optionId) || null;
}

/** 取某个主体的全部风味短句。 */
export function FindFieldNotes(subjectKind, subjectKey) {
  return fieldNotes.filter((note) => note.subjectKind === subjectKind && note.subjectKey === subjectKey);
}

/** 取一条风味短句；没有匹配时返回 null。roll 为 0..1 确定性随机值。 */
export function PickFieldNote(subjectKind, subjectKey, roll = 0) {
  const matches = FindFieldNotes(subjectKind, subjectKey);
  if (!matches.length) return null;
  const index = Math.min(matches.length - 1, Math.floor(Math.max(0, Math.min(0.999999, roll)) * matches.length));
  return matches[index];
}

/** 取一条时代文献短句。 */
export function PickQuote(roll = 0) {
  const index = Math.min(quotes.length - 1, Math.floor(Math.max(0, Math.min(0.999999, roll)) * quotes.length));
  return quotes[index];
}

/** 把 ledger 转成可直接渲染的条目数组，零值也保留，便于账本面板对齐。 */
export function SummarizeLedger(ledger) {
  const source = ledger && typeof ledger === "object" ? ledger : {};
  return ledgerKeys.map((key) => ({
    key,
    label: ledgerLabels[key],
    value: Math.max(0, Math.round(Number(source[key]) || 0)),
  }));
}

/** 把一个选项的 ledger 累加进总账本，返回新对象（不修改入参）。 */
export function AccumulateLedger(ledger, delta) {
  const base = ledger && typeof ledger === "object" ? ledger : {};
  const add = delta && typeof delta === "object" ? delta : {};
  const next = {};
  for (const key of ledgerKeys) {
    next[key] = Math.max(0, Math.round((Number(base[key]) || 0) + (Number(add[key]) || 0)));
  }
  return next;
}

function MatchesEndingCondition(condition, metrics) {
  const rule = condition || {};
  const villages = Math.max(1, Number(metrics.villageCount) || 1);
  const deathsPerVillage = (Number(metrics.civilianDeaths) || 0) / villages;
  const burnedRatio = (Number(metrics.villagesBurned) || 0) / villages;
  if (rule.minBaseRatio !== undefined && (Number(metrics.baseRatio) || 0) < rule.minBaseRatio) return false;
  if (rule.maxBaseRatio !== undefined && (Number(metrics.baseRatio) || 0) > rule.maxBaseRatio) return false;
  if (rule.minMass !== undefined && (Number(metrics.massAverage) || 0) < rule.minMass) return false;
  if (rule.maxMass !== undefined && (Number(metrics.massAverage) || 0) > rule.maxMass) return false;
  if (rule.minDistricts !== undefined && (Number(metrics.districtCount) || 0) < rule.minDistricts) return false;
  if (rule.minPopulationRatio !== undefined && (Number(metrics.populationRatio) || 0) < rule.minPopulationRatio) return false;
  if (rule.maxDeathsPerVillage !== undefined && deathsPerVillage > rule.maxDeathsPerVillage) return false;
  if (rule.minDeathsPerVillage !== undefined && deathsPerVillage < rule.minDeathsPerVillage) return false;
  if (rule.minBurnedRatio !== undefined && burnedRatio < rule.minBurnedRatio) return false;
  if (Array.isArray(rule.requireFlags)) {
    const flags = Array.isArray(metrics.flags) ? metrics.flags : [];
    for (const flag of rule.requireFlags) if (!flags.includes(flag)) return false;
  }
  return true;
}

/**
 * 按四个维度评定结局。priority 数字越小越优先命中（先判特殊局面，再判一般局面）。
 * 一个都不匹配时返回"一寸一寸"，因为那是最普通、也最常见的结果。
 */
export function EvaluateEnding(metrics) {
  const source = metrics && typeof metrics === "object" ? metrics : {};
  const ordered = Object.values(endingDefinitions).slice().sort((a, b) => a.priority - b.priority);
  for (const ending of ordered) {
    if (MatchesEndingCondition(ending.condition, source)) return ending;
  }
  return endingDefinitions.QuietBuilding;
}

/** 时期切换时给 UI 用的一段开场文案（含日期与天气提示）。 */
export function BuildEraIntro(turn) {
  const eraKey = GetEraKeyForTurn(turn);
  const era = eraDefinitions[eraKey];
  return {
    eraKey,
    date: FormatTurnDate(turn),
    name: era.name,
    dateRange: era.dateRange,
    summary: era.summary,
    rules: era.rules,
    weather: era.weather,
    palette: era.palette,
    opening: era.opening,
  };
}

// ---------------------------------------------------------------------------
// 战役指挥档案：任务卡、敌情条与回合简报按稳定 key 安全读取。
// ---------------------------------------------------------------------------

export const historicalArchiveMetadata = DeepFreeze({
  theatre: "综合化华北敌后战区",
  scope: "地貌、交通与战役态势综合取材，不对应单一真实县份或某一支具体部队。",
  method: "文案采用作战电报、地方工作札记与阶段综述体例，均为概括性创作，不是历史人物原话。",
  historicalEndpoint: "1945 年日本投降是不可改写的史实终点；玩家只改变人民代价、根据地存续与敌后战略贡献。",
  civilianLedgerRule: "平民伤亡、流离、村庄被毁、粮食被夺与干部损失只入代价账本，不转化为资源、分数或奖励。",
});

export const missionBriefings = DeepFreeze({
  CutRailway: { title: "交通破袭令", telegram: "查明敌列车时刻与沿线警戒后，择桥涵、弯道或坡段破袭。行动目的在迟滞兵员与给养，不为扩大接触。", fieldNote: "先安排观察哨和撤离线，再动枕木与鱼尾板；破坏以后还要盯住抢修队。", caution: "不得把沿线村庄置于报复性清查之下。" },
  HoldPass: { title: "隘口守备令", telegram: "利用山口、渡口与沟谷节制敌军纵队。守备以争取转移时间为度，退路受威胁时不得恋战。", fieldNote: "山口前沿只放观察与迟滞小组，主力隐蔽在侧后高地，群众交通线必须留一条。", caution: "守地形不是守空名；群众与伤员撤完之前，才有守的意义。" },
  EstablishSupplyCorridor: { title: "交通接力令", telegram: "把前沿村庄、交通站与后方根据地接成分段接力线，优先保障粮药、情报与伤员后送。", fieldNote: "每一段要有人认路、有落脚户、有备用绕行口。", caution: "不得以征用群众口粮冒充补给畅通。" },
  RescueEncircled: { title: "接应解围令", telegram: "受困部队停止无目的突击，外线部队从敌薄弱方向打开通路，接应其进入群众交通网。", fieldNote: "接应信号、会合时刻、伤员顺序必须事先说清；救一支部队，不能再送进去一支。", caution: "解围以保存骨干和伤员为先，不以歼敌数衡量。" },
  RaidThenWithdraw: { title: "破袭转移令", telegram: "破坏敌交通后立即转移，不在原地等待战果。敌警戒升高时，宁可少破一段，也要留下下一次行动的力量。", fieldNote: "撤离点要比破袭点更早确定；最后离开的人负责通知沿线村庄。", caution: "破袭的迟滞收益有上限，人民暴露的代价没有。" },
  EvacuateAndDeny: { title: "疏散坚壁令", telegram: "扫荡轴线已经显露。分批转移群众、粮药与干部名册，地道和坚壁窖只用于保存人民与组织。", fieldNote: "老人、儿童、伤员先走；牲畜和粮食分散安置，村口不留集中搬运痕迹。", caution: "受难、流离和损失只记入代价账本，绝不作为任务收益。" },
  ExploitWeakness: { title: "敌进我进令", telegram: "敌主力离开据点参加扫荡，沿线守备出现缺口。外线力量袭扰交通和薄弱据点，迫其分兵回援。", fieldNote: "只打确已空虚之处；敌开始归建，就从后方窗口退出。", caution: "后方出击服务于牵制与保存根据地，不以占城涂色替代群众工作。" },
  StrategicCounteroffensive: { title: "战略反攻令", telegram: "在补给、群众网络和伤员后送均有保障时，逐步切断县城外围据点，配合全国抗战胜利进程。", fieldNote: "先拔交通节点，再压缩据点联系，条件不足立即停止强攻。", caution: "只改变敌后力量保存与战略贡献，不改写 1945 年日本投降的史实终点。" },
});

export const intentNarratives = DeepFreeze({
  Patrol: { label: "巡逻搜索", low: "村口报告敌巡逻队活动增多。", high: "敌巡逻队正沿道路与村镇之间往返搜索。" },
  Pursue: { label: "循迹追击", low: "敌一部离开原驻地，去向不明。", high: "敌军正循暴露痕迹向我部最后接触地域追来。" },
  Stage: { label: "调兵集结", low: "沿线据点夜间车辆和脚步声频繁。", high: "敌正从数处据点抽兵，向预定轴线集结。" },
  Sweep: { label: "分路扫荡", low: "各交通站均报敌军大队出动。", high: "敌军按多路合围部署推进，沿线据点守备相应减弱。" },
  GuardHub: { label: "守护枢纽", low: "敌在交通节点附近增设岗哨。", high: "敌机动队正在回防铁路、公路交会处。" },
  Relieve: { label: "接应解围", low: "敌援队沿交通线急行。", high: "敌军正向受围据点靠拢，企图恢复补给与退路。" },
  Repair: { label: "抢修交通", low: "断路方向传来工具与车辆声。", high: "敌工兵在警戒队掩护下抢修被破袭路段。" },
  BlockGap: { label: "封堵缺口", low: "敌巡逻队向交通缺口收拢。", high: "敌军企图重新控制被我楔入的交通线。" },
  Garrison: { label: "据点固守", low: "敌据点未见大队出动。", high: "敌守备队加固工事并控制周边道路。" },
});

export function GetMissionBriefing(key) {
  return missionBriefings[key] || null;
}

export function GetIntentNarrative(key, intelLevel = 1) {
  const narrative = intentNarratives[key];
  if (!narrative) return null;
  return { key, label: narrative.label, text: Number(intelLevel) >= 2 ? narrative.high : narrative.low, certainty: Number(intelLevel) >= 2 ? 0.9 : 0.45 };
}

const archiveEraProfiles = DeepFreeze({
  Opening: {
    telegrams: ["工作队越过敌占交通线，先查村情、粮情与道路，不急于扩大队伍。", "日伪军控制城镇与干线，广大乡村政权归属仍在变动；行动须给地方工作留出时间。", "建立交通站和隐蔽联络点，比占住一处空村更重要。"],
    notes: ["札记：进村先问水井、粮价和夜路，再问谁愿意带路。", "札记：联络户不集中登记，交通口令分段掌握。"],
  },
  Growth: {
    telegrams: ["根据地逐步连片，敌据点开始加强清查与交通控制。", "铁路和封锁公路成为敌军调兵骨架，破袭须与群众掩护同步。", "部队扩大后，粮械、药品与干部补充开始限制行动半径。"],
    notes: ["札记：枪械增加一支，供给和隐蔽就要多算一份。", "札记：铁路破袭后的村庄警戒，要比破袭本身更早安排。"],
  },
  Hardship: {
    telegrams: ["封锁、蚕食与反复扫荡叠加，保存群众和基层组织成为首要任务。", "敌沿交通线增筑据点，分割根据地联系；各区改用小批、分段、夜间接力。", "扫荡轴线出现时，先疏散群众、坚壁物资，再决定伏击与牵制。"],
    notes: ["札记：最困难的时候，统计人口和失散干部仍要如实。", "札记：地道、坚壁窖和转移路线只用于保存人民与组织。"],
  },
  Recovery: {
    telegrams: ["部分地区群众网络恢复，先接通交通，再恢复生产与地方武装活动。", "敌守备力量出现不均，外线袭扰应迫其回援，而不是追求孤立战果。", "反攻准备开始，各区先核实补给、伤员后送与县城外围据点联系。"],
    notes: ["札记：恢复一条交通线，要逐村确认落脚户和备用路。", "札记：敌后出击结束后，干部留下继续做地方工作。"],
  },
  Counter: {
    telegrams: ["全国战局转入反攻阶段，敌后力量逐步压缩日伪军据点联系。", "进攻县城外围前，先切断铁路、公路与相邻据点的增援通路。", "1945 年夏，核实人民代价、组织保存与战略贡献，等待日本投降的史实终点。"],
    notes: ["札记：反攻命令必须同时写明停止条件和伤员后送线。", "札记：胜利临近，更要把八年间的人民代价逐项记清。"],
  },
});

const seasonalArchiveNotes = DeepFreeze({
  春: "春季道路解冻，交通站重新核对河沟、桥涵和夜间接力点。",
  夏: "夏季青纱帐利于隐蔽，也易使部队失联；各区按时交换口令。",
  秋: "秋收关系军民口粮，行动不得扰乱收割、分粮与转运。",
  冬: "冬季风雪妨碍行军与后送，伤员、药品和宿营点须先行安排。",
});

export const campaignArchiveByTurn = DeepFreeze(Array.from({ length: totalTurns }, (_, turn) => {
  const eraKey = GetEraKeyForTurn(turn);
  const profile = archiveEraProfiles[eraKey];
  const season = GetSeason(turn);
  return {
    key: `ArchiveTurn${String(turn + 1).padStart(2, "0")}`,
    turn,
    date: FormatTurnDate(turn),
    eraKey,
    eraName: eraDefinitions[eraKey].name,
    kind: "CampaignArchive",
    telegram: profile.telegrams[turn % profile.telegrams.length],
    fieldNote: profile.notes[turn % profile.notes.length],
    seasonalNote: seasonalArchiveNotes[season],
    attribution: "综合化华北敌后战区战役档案体例；非历史人物原话。",
    historicalEndpoint: historicalArchiveMetadata.historicalEndpoint,
  };
}));

export function GetCampaignArchive(turn) {
  const index = Math.max(0, Math.min(totalTurns - 1, Math.floor(Number(turn) || 0)));
  return campaignArchiveByTurn[index] || null;
}
