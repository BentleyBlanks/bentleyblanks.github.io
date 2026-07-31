// 《地下长城 · 冀中1942》 —— 全部可调数值 CFG + 地形/单位/设施/群众/伪装定义表 + 玩家可见文案。
// 纯数据模块：不依赖任何运行时环境。规则含义见 AGENTS.md §二（规则 v3 · 五幕战役）。

export const CFG = Object.freeze({
  // —— 挖掘（进度点；同一工地同回合只允许 1 个单位施工） ——
  dig: Object.freeze({
    segment: 2,          // 地道段（两地下格之间的边）
    segmentVillage: 1,   // 目标格为村庄时的段成本
    entrance: 2,         // 入口（地下向上开口；重开被封口同价）
    facility: 2,         // 储粮洞/藏人室/通风口/枪眼/翻板
    door: 1,             // 隔断门（挖在边上）
    disguise: 1,         // 伪装口（把已有的口做进灶台/水井/炕洞/牲口槽）
    roadBreak: 2,        // 破路工地
    bridgeBreak: 4,      // 破桥工地（比土路难毁一倍：两个民兵回合）
  }),
  digPower: Object.freeze({ militia: 2, guerrilla: 1, runner: 0 }),
  tracesPerDig: 1,       // 每次挖掘动作给地表格 +1 痕迹
  tracesMax: 6,
  coverTracesAmount: 2,  // 「掩土」：本格痕迹 -2，本格开口暴露豆 -2
  coverUsesPerUnit: 3,   // 「掩土」每单位每局至多 3 次（掩土不是免费无限）

  // —— 入口暴露（全程结算：动土就留声，掩土是唯一的减法） ——
  exposePerConceal: 3,   // 暴露阈值 = (conceal + 伪装加成) × 3
  ventConceal: 2,        // 通风口等效隐蔽 2（阈值 6）
  exposePerWork: 1,      // 每挖通 1 段 / 修成 1 设施 → 同气区所有已开口 +1（R2 P0-1）
  exposeNewEntrance: 2,  // 每开 1 个新地道口 → 该口 +2
  // R5 P0-1：**敌纵队踩在哪一格，哪一格的口就每回合 +2**——翻检是断续的，脚是一直踩着的。
  // 这条把「敌人就站在口上，暴露豆纹丝不动」补死，也是烟/水/攻入终于会发生的根因。
  occupiedExposePerTurn: 2,
  opTargetExpose: 4,     // 敌反地道选项的盯上阈值：暴露豆 ≥4 即可作业
  useEntranceExposeSeen: 2,   // 敌视野内使用入口
  useEntranceExposeNear: 1,   // 敌 2 格内（无视野）使用入口
  useEntranceNearRange: 2,
  shootAndDiveExpose: 2,      // 「打了就钻」固定 +2 豆

  // —— 容量与空气 ——
  cellUnitCap: 2,        // 每地道格至多 2 个单位
  storageGrainCap: 8,    // 储粮洞藏粮上限（关卡可用 level.storageCap 覆写）
  shelterCivCap: 6,      // 藏人室容量（按「铺位」计，关卡可用 level.shelterCap 覆写）
  corridorCivCap: 2,     // 非藏人室的普通地道格：只能临时挤 2 个铺位（走廊不是家）
  breathThreshold: 3,    // 憋闷 ≥3 → 本次结算被迫出洞
  breathGainNoAir: 1,
  breathGainSmoke: 2,
  breathGainWater: 2,
  suffocateHpLoss: 1,    // 连正上方都刨不开时每回合 -1 HP
  smokeSpreadTurns: 3,   // 点烟后蔓延 3 回合
  smokeLingerTurns: 2,   // 再滞留 2 回合后消散
  smokeCornerDelay: 1,   // 拐弯：烟拐一个弯要多花 1 回合（直巷子最危险）
  ventPerCellsForSmoke: 3,   // 敌选烟攻的额外条件：该气区通风口数 < 地道格数 / 3

  // —— 灌水（第四幕；水往低处走，高处是活路） ——
  water: Object.freeze({
    spreadTurns: 3,      // 灌水后每回合向「同高或更低」的相邻格漫 1 格
    lingerTurns: 3,      // 之后滞留 3 回合退去
    grainSpoilPerTurn: 2,   // 被淹的储粮洞每回合泡毁 2 担（入代价簿）
  }),

  // —— 群众（以「批」计；老弱/青壮/伤员速度与铺位不同） ——
  civ: Object.freeze({
    panicThreshold: 3,       // 恐慌 ≥3 → 自行冲出地面
    panicNoGuide: 1,         // 地道里没有我方单位陪同（无人带路）
    panicNoAir: 1,           // 气区无风
    panicSmoke: 2,           // 烟中
    panicWater: 2,           // 水中
    calmPerTurn: 1,          // 同格有我方单位且无烟无水有风 → 恐慌 -1
    guideCap: Object.freeze({ runner: 3, militia: 2, guerrilla: 1 }),   // 一次带得动几批
    speed: Object.freeze({ old: 1, young: 2, wounded: 1 }),             // 地道里一回合走几格
    slots: Object.freeze({ old: 1, young: 1, wounded: 2 }),             // 占几个铺位
  }),

  // —— 经济与群众 ——
  quietGrainPerVillage: 1,   // 平静期每村每回合 +1 明存粮（**必须播报**，见 R5 必修 bug 1）
  sweepOpenGrainLoss: 2,     // 扫荡期每村每回合明存粮被搜走（关卡可覆写）
  sweepGrainRange: 2,        // 敌进到村 2 格内才搜得着明存粮
  // R5 P0-2：抓丁不再看「村里还有没有粮」，改看**人还站在哪儿**——
  // 敌纵队占住的那一格上的群众批：老弱/伤员必抓，青壮跑得快，每两批走脱一批。
  levyYoungEveryN: 2,        // 青壮：每 N 批抓 1 批（确定性的「一半」，不消耗 rng）
  breachStorageHaul: 4,      // 攻入得手后，敌顺着口下去从连通储粮洞再搬走 4 担（入代价簿）
  hideGrainPerAction: 3,     // 「藏粮」每次转移 3
  autoHidePerTurn: 1,        // 组织度 ≥1 的村平静期每回合自动藏 1
  moveCivsPerAction: 2,      // 「转移群众」每次至多 2 批（村口 → 地道）
  seizePerTurn: 2,           // 敌征粮 2/回合
  organizeNeed: 2,           // 「组织」2 进度升 1 级
  organizeMax: 2,
  organizeFreeDigRadius: 1,  // 组织 2 级：村 1 格内工地免费 +1 进度
  organizeStopEnemyRange: 2, // 敌在村 2 格内时免费进度停止

  // —— 弹药（全局池，缴获是唯一来源；收支严格为负） ——
  ammoMax: 12,
  ammoPerAttack: 1,
  // 缴获（R5 必修 bug 3）：日军班与工兵班身上有枪有雷管，打死了能捡；伪军与特务身上没有。
  // 收支仍严格为负：日军班 4 HP 要两枪（-2+1），工兵班 3 HP 在掩护地形也要两枪；
  // 且**反击打死的不缴获**（没主动权就没工夫捡枪）——这三条一起把「挨打回血」堵死。
  loot: Object.freeze({ inf: 1, puppet: 0, sapper: 1, spy: 0 }),
  // 守洞不是免费的（R5 P0-4）：打退一次攻入要花这么多弹药，守洞的人还要被压制一回合。
  guardAmmoCost: 1,
  guardStunTurns: 1,

  // —— 战斗（确定性，零随机） ——
  ambushBonus: 1,        // 伏击 +1 伤
  coverReduce: 1,        // 掩护地形 -1 伤
  ambushMinDamage: 1,    // 伏击伤害下限 1（普攻下限 0）
  counterPenalty: 1,     // 反伤 = max(攻 - 1 - 攻方掩护, 0)
  blastDamage: 2,        // 爆破波及格内单位 -2 HP
  // 爆破埋掉的存粮（R5 P0-6）：只埋一部分，不是一炸就全没——
  // 它要教的是「粮分几个洞放」，不是「一次翻盘」。
  blastGrainLoss: 4,

  // —— 伏击 ——
  ambushPerHex: 1,       // 同一格同时至多 1 个单位处于伏击态
  staleAmbushDamage: 1,  // 连续两回合在同一格设伏 → 第二次伏击固定 1 伤
  alertedTurns: 2,       // 该格获「敌已警戒」标记的回合数
  alertedExtraCost: 4,   // 敌寻路对警戒格的附加成本
  foxholeTrace: 1,       // 挖散兵坑设伏：该格 +1 痕迹
  foxholeMinDig: 2,      // 只有挖掘力 ≥2 的民兵挖得动散兵坑

  // —— 射击孔：打一枪换一个地方（第三幕的核心手感） ——
  fightpost: Object.freeze({
    lockWindow: 1,       // 距上次从本孔开火 ≤1 回合再开 → 被迅速锁定
    lockedDamage: 1,     // 被锁定的射击孔只伤 1（敌已经对着这个孔了）
    lockedTurns: 2,      // 该格被敌记住（警戒）的回合数
    coolTurns: 2,        // 隔 2 回合不打，热度自然散掉
  }),

  // —— 翻板（第三幕解锁；拦敌一回合、挡烟挡水） ——
  trap: Object.freeze({
    holdTurns: 1,        // 敌踩空 → 整队一回合
    selfCost: 1,         // 敌白跑一趟：行动力池 -1
  }),

  // —— 行动力池（波次时钟） ——
  pool: Object.freeze({
    killInf: 3, killOther: 2, wound: 1,
    roadCut: 2, roadCutMaxPerWave: 3,
    playerDrainCapPerTurn: 5,       // 我方所致扣减每回合合计上限
    smokeSelfCost: 3, blastSelfCost: 4, breachSelfCost: 4,
    floodSelfCost: 3, excavateSelfCost: 2,
    // 扑空衰减：摸到村边却一无所获的纵队每支 -1（每回合至多 -2）。
    emptyHanded: 1,
    emptyHandedCapPerTurn: 2,
    emptyHandedRange: 2,
  }),

  // —— 谨慎等级（0~2，按纵队） ——
  cautionMax: 2,
  cautionCalmTurns: 3,
  cautionMpPenalty: 1,
  cautionSearchBonus: 1,

  // —— 侦察与嫌疑 ——
  sightingLife: 2,
  mobileResponseRadius: 6,
  suspicion: Object.freeze({ sighting2: 2, sighting1: 1, attackSite: 2, openGrain: 1, tracesUnit: 1 }),

  // —— 敌纵队移动（A* 成本） ——
  moveCost: Object.freeze({ road: 0.5, offroad: 1 }),

  // —— 反地道作业 ——
  // R5 P0-5：攻入的门槛从「≥2 个日军班」放宽到「≥2 个班且其中至少 1 个日军班」——
  // 原门槛只有「日军重」配比才够得着，攻入因此在 9 局 bot 里一次没发生过。
  breachMinInf: 1,
  breachMinSquads: 2,
  // 敌不会把同一手用到底：可选作业里优先挑**本役用得最少**的那一手（平手才按 level.opPriority）。
  // 这是「水必须真的出现」的落点——烟具与水车不再被同一个优先级永远压住。
  opRotate: true,
  sealPerColumn: 1,
  sapperSeekRange: 12,
  // 工兵闻着新土走：口的暴露豆到这个数，工兵就专程往那儿摸（还不够动手门槛也先踩上去）。
  sapperSniffExpose: 2,
  sealRepairProgress: 2,
  logCap: 300,
});

// —— 地形表（§2.2）。concealCap = 该格入口隐蔽上限；0 表示不可设口。 ——
export const terrainDefinitions = Object.freeze({
  village: Object.freeze({ name: "村庄", char: "V", hide: true, cover: true, diggable: true, passable: true, blocksSight: true, concealCap: 3 }),
  field:   Object.freeze({ name: "农田", char: "F", hide: true, cover: false, diggable: true, passable: true, blocksSight: false, concealCap: 2 }),
  woods:   Object.freeze({ name: "树林", char: "W", hide: true, cover: true, diggable: true, passable: true, blocksSight: true, concealCap: 3 }),
  grave:   Object.freeze({ name: "坟地", char: "G", hide: true, cover: true, diggable: true, passable: true, blocksSight: false, concealCap: 3 }),
  river:   Object.freeze({ name: "河沟", char: "R", hide: false, cover: false, diggable: false, passable: false, blocksSight: false, concealCap: 0 }),
  open:    Object.freeze({ name: "开阔地", char: ".", hide: false, cover: false, diggable: true, passable: true, blocksSight: false, concealCap: 1 }),
});

// —— 单位表（§2.4）。fieldAttack=可野战攻击；search=搜索力；disguised=平民伪装。 ——
export const unitDefinitions = Object.freeze({
  militia:   Object.freeze({ name: "民兵组", side: "ally", hp: 3, atk: 2, mp: 2, dig: 2, vision: 2, search: 0, fieldAttack: false }),
  guerrilla: Object.freeze({ name: "游击班", side: "ally", hp: 4, atk: 2, mp: 3, dig: 1, vision: 2, search: 0, fieldAttack: true }),
  runner:    Object.freeze({ name: "联络员", side: "ally", hp: 2, atk: 0, mp: 4, dig: 0, vision: 3, search: 0, fieldAttack: false }),
  inf:       Object.freeze({ name: "日军班", side: "enemy", hp: 4, atk: 2, mp: 2, dig: 0, vision: 2, search: 2, fieldAttack: true }),
  puppet:    Object.freeze({ name: "伪军队", side: "enemy", hp: 3, atk: 1, mp: 2, dig: 0, vision: 1, search: 1, fieldAttack: true, needsInfToSearch: true }),
  spy:       Object.freeze({ name: "特务", side: "enemy", hp: 2, atk: 0, mp: 3, dig: 0, vision: 2, search: 3, fieldAttack: false, disguised: true }),
  sapper:    Object.freeze({ name: "工兵班", side: "enemy", hp: 3, atk: 1, mp: 2, dig: 2, vision: 2, search: 2, fieldAttack: true, engineer: true }),
});

// —— 设施表（§2.3）。挖在已有地道格上；door 挖在边上。 ——
export const facilityDefinitions = Object.freeze({
  storage:   Object.freeze({ name: "储粮洞", char: "S" }),
  shelter:   Object.freeze({ name: "藏人室", char: "H" }),
  vent:      Object.freeze({ name: "通风口", char: "O" }),
  fightpost: Object.freeze({ name: "射击孔", char: "X" }),
  trapdoor:  Object.freeze({ name: "翻板", char: "T" }),
  door:      Object.freeze({ name: "隔断门", char: "D" }),
});

// —— 群众分类（以「批」计，每批约十余人）。速度决定带路一回合能走几格，铺位决定占多少藏人室容量。 ——
export const civKindDefinitions = Object.freeze({
  old:     Object.freeze({ name: "老弱", char: "o", note: "走得慢（1 格/回合），铺位 1；掉队最快、最先慌" }),
  young:   Object.freeze({ name: "青壮", char: "y", note: "走得快（2 格/回合），铺位 1；能跟上带路的人" }),
  wounded: Object.freeze({ name: "伤员", char: "w", note: "走得慢（1 格/回合），铺位 2；只能靠人带，不能自己跑" }),
});

/**
 * 伪装口（第二幕解锁）：把地道口做进灶台/水井/炕洞/牲口槽。
 * conceal = 隐蔽等级加成（暴露阈值 = (基础隐蔽 + 加成) × 3）；
 * civPassable = 群众过不过得去（水井口窄，恐慌冲出时群众用不上它）；
 * guideBonus = 该口带路时一次能多带几批（牲口槽口子大，赶人快）。
 */
export const disguiseDefinitions = Object.freeze({
  stove:  Object.freeze({ name: "灶台", conceal: 1, terrains: ["village"], civPassable: true, guideBonus: 0,
    note: "锅台底下的活门：最常见，隐蔽 +1，群众进出无碍" }),
  well:   Object.freeze({ name: "水井", conceal: 2, terrains: ["village", "field"], civPassable: false, guideBonus: 0,
    note: "井壁掏洞：隐蔽 +2 最难搜出，但井口窄——群众上不来，只走得了单位" }),
  kang:   Object.freeze({ name: "炕洞", conceal: 1, terrains: ["village"], civPassable: true, guideBonus: 0,
    note: "炕洞改口：隐蔽 +1，屋里屋外都不显眼" }),
  trough: Object.freeze({ name: "牲口槽", conceal: 0, terrains: ["village", "field", "woods", "grave"], civPassable: true, guideBonus: 1,
    note: "牲口槽底下的大口：隐蔽不加分，但口子大——从这里带路一次多带 1 批" }),
});

// —— 玩家可见文案（档案式、克制；账本永不出现奖励性表述） ——
export const TEXT = Object.freeze({
  waveStatus: Object.freeze({ quiet: "平静期", sweep: "扫荡期", withdrawing: "敌军收队中", done: "扫荡结束" }),
  stance: Object.freeze({ normal: "常态", hidden: "隐蔽", ambush: "伏击", exposed: "暴露", stunned: "被压制" }),
  layer: Object.freeze({ surface: "地上", under: "地下" }),
  banner: Object.freeze({
    withdraw: "敌军开始收队",
    sweepStart: "敌军扫荡开始",
    seizedEnough: "敌征粮车装满，押运回据点",
  }),
  op: Object.freeze({
    smoke: "烟攻", blast: "爆破", breach: "攻入", seal: "封堵", excavate: "刨口", flood: "灌水",
  }),
  telegraph: Object.freeze({
    smoke: "敌工兵在入口旁架设风箱柴堆，次回合点烟",
    blast: "敌工兵在入口旁埋设炸药，次回合起爆",
    breach: "敌步兵在入口集结，次回合强行攻入",
    seal: "敌兵搬土石填口，次回合封死该入口",
    excavate: "敌兵扛锹镐围住此口，次回合就要往下刨",
    flood: "敌自河沟架起水车对着此口，次回合灌水",
  }),
  ledgerNames: Object.freeze({ civCaptured: "群众被抓（批）", civDead: "群众罹难（批）", housesBurned: "房屋被焚（处）", grainSeized: "粮食被夺（担）" }),
  grades: Object.freeze({ jia: "甲", yi: "乙", bing: "丙", ding: "丁" }),
  guardrails: Object.freeze({
    unmoved: "尚有单位未行动",
    breath: "地道内有人憋闷加重",
    panic: "地道里有群众无人照应",
    idleSite: "有工地整回合无人施工",
    exposeSoon: "有入口即将被搜出",
    coverLeft: "掩土次数所剩无几",
  }),
  expose: Object.freeze({
    work: "动土的响动传上去了：本气区各口暴露 +1",
    newEntrance: "新口刚开，土色新鲜：该口暴露 +2",
    occupied: "敌就踩在这个口上，来回踩、来回敲——这一格的口暴露 +2",
    cover: "掩土匿迹：本格痕迹与暴露各减 2",
    coverSpent: "掩土次数已用尽（每人每役 3 次）",
    marked: "敌已盯上此口：随时可能动手",
    disguised: "口做进了寻常什物里，不细看认不出",
  }),
  ambushText: Object.freeze({
    occupied: "本格已有人设伏，一格只容一处伏点",
    stale: "老地方连设两回合：敌有防备，伏击只伤 1",
    alerted: "此口此地敌已警戒，绕道而行",
    exposedAfter: "打完这一下就藏不住了：转入暴露，可被还击",
    foxhole: "就地挖散兵坑设伏：无遮无拦，打完就得挨枪（本格留下痕迹）",
  }),
  fightpostText: Object.freeze({
    locked: "同一个孔连着打：枪口火光被咬住了，这一枪只伤 1，且此处已被记下",
    relocate: "打一枪换一个地方——网里还有别的孔，换过去再打",
    known: "从射击孔开火：这个口敌人记下了",
  }),
  trapText: Object.freeze({
    sprung: "敌踩上翻板，人仰马翻掉了下去——这一回合他什么也干不成",
    blockSmoke: "翻板压着口，烟灌不进来",
    blockWater: "翻板压着口，水漫不进来",
    rearm: "翻板重新支好",
  }),
  forced: Object.freeze({
    entrance: "憋闷难支，自最近口涌出地面",
    dugOut: "无口可出，就地刨土钻出地面",
    trapped: "困在无风地道里，出不去也刨不开",
  }),
  civText: Object.freeze({
    needGuide: "地道里的群众得有人带路才走得动——派一个单位到他们那一格，用 GuideCivs 领着走",
    panicOut: "无人照应，恐慌到了头：群众自己摸出地面",
    caught: "冲出地面正撞上敌人：当场被抓（入代价簿）",
    calmed: "有人在跟前守着，人心定下来了",
    wellBlocked: "水井口太窄，群众上不去",
    guided: "领着群众在地道里转移",
    // R5 P0-2：抓丁挂在「人还站在敌人脚底下」，不再挂在「村里还有没有粮」。
    levyOnHex: "敌就站在这一格上挨家挨户拉人",
    levyYoungAway: "青壮腿脚快，趁乱翻墙走脱了",
    stayUnderground: "扫荡还没完，人就留在洞里——地上地下不是一回事",
  }),
  guardText: Object.freeze({
    repelled: "守洞火力当头：敌一个班伤亡，攻入中止",
    ammo: "守洞这一下打出去的是子弹（弹药 -1）",
    noAmmo: "弹药池空了：洞口只剩人，堵不住枪——敌人踩着口进来了",
    stunned: "枪口火光把位置交了出去：守洞的人被压得抬不起头，下一回合动不了",
    marked: "这个口从此明摆在敌人眼里（已知，永久）",
  }),
  scriptText: Object.freeze({
    breachWarn: "内线急电：敌已认准村里的窖，明日就要往下挖人",
    breachDone: "敌撬开窖口，探灯照下去——窖里的人一个也跑不掉（全部入代价簿）",
  }),
  carryText: Object.freeze({
    fromDefault: "【默认继承档】你没打前面几幕：接手的是一份别人替你挖了一半的网，账也照旧记在你名下",
    fromPrev: "【上一幕的战果】这盘地道网、这些口与这几担洞存粮，都是你上一幕自己挣下来的",
    sealedNote: "上一幕被填死的口还堵着（地下重挖 2 进度可恢复）",
  }),
  sweepGrain: "敌搜庄刮走明存粮",
  quietGrain: "秋粮陆续入囤：明存粮 +1",
  quietHide: "组织有力，夜里又搬了一担进窖：洞存粮 +1",
  water: Object.freeze({
    spread: "水顺着地道往低处漫",
    dry: "地道里的水退了",
    spoil: "储粮洞进水，粮食泡毁（入代价簿）",
    highGround: "水到不了这里——地势高",
  }),
});

// 评级：胜利后按勋记数定级（§2.11）。
export function GradeForMedals(won, medalCount) {
  if (!won) return TEXT.grades.ding;
  if (medalCount >= 3) return TEXT.grades.jia;
  if (medalCount === 2) return TEXT.grades.yi;
  return TEXT.grades.bing;
}
