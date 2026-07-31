// 《地下长城 · 冀中1942》 —— 全部可调数值 CFG + 地形/单位/设施定义表 + 玩家可见文案。
// 纯数据模块：不依赖任何运行时环境。规则含义见 AGENTS.md §二（规则 v2 定稿）。

export const CFG = Object.freeze({
  // —— 挖掘（进度点；同一工地同回合只允许 1 个单位施工） ——
  dig: Object.freeze({
    segment: 2,          // 地道段（两地下格之间的边）
    segmentVillage: 1,   // 目标格为村庄时的段成本
    entrance: 2,         // 入口（地下向上开口；重开被封口同价）
    facility: 2,         // 储粮洞/藏人室/通风口/枪眼
    door: 1,             // 隔断门（挖在边上）
    roadBreak: 2,        // 破路工地
  }),
  digPower: Object.freeze({ militia: 2, guerrilla: 1, runner: 0 }),
  tracesPerDig: 1,       // 每次挖掘动作给地表格 +1 痕迹
  tracesMax: 6,
  coverTracesAmount: 2,  // 「掩土」：本格痕迹 -2

  // —— 入口暴露（豆只增不减，全程明牌） ——
  exposePerConceal: 3,   // 暴露阈值 = conceal × 3
  ventConceal: 2,        // 通风口等效隐蔽 2（阈值 6）
  useEntranceExposeSeen: 2,   // 敌视野内使用入口
  useEntranceExposeNear: 1,   // 敌 2 格内（无视野）使用入口
  useEntranceNearRange: 2,
  shootAndDiveExpose: 2,      // 「打了就钻」固定 +2 豆

  // —— 容量与空气 ——
  cellUnitCap: 2,        // 每地道格至多 2 个单位
  storageGrainCap: 8,    // 储粮洞藏粮上限
  shelterCivCap: 6,      // 藏人室容量（群众批 + 伤员批合计）
  breathThreshold: 3,    // 憋闷 ≥3 → 本次结算被迫出洞
  breathGainNoAir: 1,
  breathGainSmoke: 2,
  suffocateHpLoss: 1,    // 无可用出口时每回合 -1 HP（群众批死亡进账本）
  smokeSpreadTurns: 3,   // 点烟后蔓延 3 回合
  smokeLingerTurns: 2,   // 再滞留 2 回合后消散

  // —— 经济与群众 ——
  quietGrainPerVillage: 1,   // 平静期每村每回合 +1 明存粮
  hideGrainPerAction: 3,     // 「藏粮」每次转移 3
  autoHidePerTurn: 1,        // 组织度 ≥1 的村平静期每回合自动藏 1
  moveCivsPerAction: 2,      // 「转移群众」每次 2 批
  moveWoundedPerAction: 2,   // 「转移伤员」每次至多 2 批
  seizePerTurn: 2,           // 敌征粮 2/回合
  organizeNeed: 2,           // 「组织」2 进度升 1 级
  organizeMax: 2,
  organizeFreeDigRadius: 1,  // 组织 2 级：村 1 格内工地免费 +1 进度
  organizeStopEnemyRange: 2, // 敌在村 2 格内时免费进度停止

  // —— 弹药（全局池，缴获是唯一来源） ——
  ammoMax: 12,
  ammoPerAttack: 1,
  loot: Object.freeze({ inf: 2, puppet: 1, sapper: 1, spy: 0 }),

  // —— 战斗（确定性，零随机） ——
  ambushBonus: 1,        // 伏击 +1 伤
  coverReduce: 1,        // 掩护地形 -1 伤
  ambushMinDamage: 1,    // 伏击伤害下限 1（普攻下限 0）
  counterPenalty: 1,     // 反伤 = max(攻 - 1 - 攻方掩护, 0)
  blastDamage: 2,        // 爆破波及格内单位 -2 HP

  // —— 行动力池（波次时钟） ——
  pool: Object.freeze({
    killInf: 3, killOther: 2, wound: 1,
    roadCut: 2, roadCutMaxPerWave: 3,
    playerDrainCapPerTurn: 5,       // 我方所致扣减每回合合计上限
    smokeSelfCost: 3, blastSelfCost: 4, breachSelfCost: 4,   // 敌反地道自耗
  }),

  // —— 谨慎等级（0~2，按纵队） ——
  cautionMax: 2,
  cautionCalmTurns: 3,   // 连续 3 回合无事 -1
  cautionMpPenalty: 1,   // 1 级起移动 -1 MP
  cautionSearchBonus: 1, // 1 级起搜索力 +1

  // —— 侦察与嫌疑 ——
  sightingLife: 2,          // 置信 2 目击时效（回合）
  mobileResponseRadius: 6,  // 机动队响应半径
  suspicion: Object.freeze({ sighting2: 2, sighting1: 1, attackSite: 2, openGrain: 1, tracesUnit: 1 }),

  // —— 敌纵队移动（A* 成本） ——
  moveCost: Object.freeze({ road: 0.5, offroad: 1 }),

  // —— 反地道作业 ——
  breachMinInf: 2,          // 攻入需 ≥2 步兵班邻接且谨慎 <2
  sealRepairProgress: 2,    // 被封/自毁入口重挖进度
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
  fightpost: Object.freeze({ name: "枪眼", char: "X" }),
  door:      Object.freeze({ name: "隔断门", char: "D" }),
});

// —— 玩家可见文案（档案式、克制；账本永不出现奖励性表述） ——
export const TEXT = Object.freeze({
  waveStatus: Object.freeze({ quiet: "平静期", sweep: "扫荡期", withdrawing: "敌军收队中", done: "扫荡结束" }),
  stance: Object.freeze({ normal: "常态", hidden: "隐蔽", ambush: "伏击", stunned: "被压制" }),
  layer: Object.freeze({ surface: "地上", under: "地下" }),
  banner: Object.freeze({
    withdraw: "敌军开始收队",
    sweepStart: "敌军扫荡开始",
    seizedEnough: "敌征粮车装满，押运回据点",
  }),
  op: Object.freeze({
    smoke: "烟攻", blast: "爆破", breach: "攻入", seal: "封堵",
  }),
  telegraph: Object.freeze({
    smoke: "敌工兵在入口旁架设风箱柴堆，次回合点烟",
    blast: "敌工兵在入口旁埋设炸药，次回合起爆",
    breach: "敌步兵在入口集结，次回合强行攻入",
    seal: "敌兵搬土石填口，次回合封死该入口",
  }),
  ledgerNames: Object.freeze({ civCaptured: "群众被抓（批）", civDead: "群众罹难（批）", housesBurned: "房屋被焚（处）", grainSeized: "粮食被夺（担）" }),
  grades: Object.freeze({ jia: "甲", yi: "乙", bing: "丙", ding: "丁" }),
  guardrails: Object.freeze({
    unmoved: "尚有单位未行动",
    breath: "地道内有人憋闷加重",
    idleSite: "有工地整回合无人施工",
    exposeSoon: "有入口即将被搜出",
  }),
});

// 评级：胜利后按勋记数定级（§2.11）。
export function GradeForMedals(won, medalCount) {
  if (!won) return TEXT.grades.ding;
  if (medalCount >= 3) return TEXT.grades.jia;
  if (medalCount === 2) return TEXT.grades.yi;
  return TEXT.grades.bing;
}
