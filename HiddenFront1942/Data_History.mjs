/*
 * Hidden Front 1942
 * Historical framing and campaign copy. The playable county is deliberately
 * fictional; dates, conditions, institutions, and tactics are grounded in the
 * cited sources so the game does not invent an alternate version of a real battle.
 */

export const gameConfig = Object.freeze({
  id: "hiddenFront1942",
  title: "冀中 · 1942",
  subtitle: "无名战线",
  fullTitle: "冀中 · 1942：无名战线",
  saveVersion: 1,
  estimatedMinutes: Object.freeze([60, 100]),
  campaignStart: "1942年5月1日",
  campaignEnd: "1942年6月20日",
  playerRole: "你指挥的是一支虚构的冀中县域工作队。它综合抽象了交通员、民兵、游击队和地方群众工作，不对应任何真实人物或真实番号。",
  historyBoundary: "历史进程与抗战胜利的结局固定。玩家影响的是一个虚构县域中群众、联络网与抗日力量能否保存下来，不会改写任何真实战役。",
  respectNote: "游戏不以击杀计分。评价优先考虑群众安全、联络保存、伤亡控制与任务完成。",
  saveKey: "HiddenFront1942_Save_V1",
});

export const difficultyDefinitions = Object.freeze({
  story: Object.freeze({
    id: "story",
    name: "从容部署",
    note: "约 45–70 分钟",
    description: "敌情预警更早，适合第一次体验核心玩法。",
    economyRate: 1.18,
    enemyDamage: 0.78,
    enemyHealth: 0.82,
    enemySpawnRate: 0.78,
    startingSupport: 82,
  }),
  standard: Object.freeze({
    id: "standard",
    name: "标准战役",
    note: "约 60–100 分钟",
    description: "推荐。需要经营、侦察、取舍与有限作战。",
    economyRate: 1,
    enemyDamage: 1,
    enemyHealth: 1,
    enemySpawnRate: 1,
    startingSupport: 74,
  }),
  pressure: Object.freeze({
    id: "pressure",
    name: "封锁重压",
    note: "约 75–120 分钟",
    description: "资源紧张、巡逻频繁，更强调隐蔽与转移。",
    economyRate: 0.9,
    enemyDamage: 1.16,
    enemyHealth: 1.12,
    enemySpawnRate: 1.2,
    startingSupport: 68,
  }),
});

export const historicalSources = Object.freeze([
  Object.freeze({
    id: "nationalResistance",
    organization: "中国人民抗日战争纪念馆",
    title: "《伟大胜利 历史贡献》基本陈列",
    url: "https://www.1937china.com/views/kzzl/jng_jbcl.html",
    usedFor: "以国共合作为基础的抗日民族统一战线，以及正面战场、敌后战场协同抗击日本侵略的总体历史框架。",
  }),
  Object.freeze({
    id: "tunnelEvolution",
    organization: "中共邯郸市委党史研究室",
    title: "抗战时期中共冀中地道战的战术演进与策略运用",
    url: "https://www.handandangshi.gov.cn/yaolun/2463.html",
    usedFor: "1942年“五一大扫荡”的日期、封锁沟墙与据点网络，以及早期地道主要用于隐蔽、保存和防御且尚不完善。",
  }),
  Object.freeze({
    id: "armedWorkTeams",
    organization: "中国人民抗日战争纪念馆",
    title: "“双枪李向阳”的武工队，战斗场景首次曝光",
    url: "https://www.1937china.com/kzgdata/html/20250428/174580535436634079955.html",
    usedFor: "武工队兼具战斗、宣传与群众工作职能；建立情报站、组织民兵、破坏交通和开展政治攻势。",
  }),
  Object.freeze({
    id: "staffWork",
    organization: "中国人民抗日战争纪念馆",
    title: "抗日战争时期的中共中央军委参谋部门",
    url: "https://www.1937china.com/kzgdata/html/20201118/160566973512114169086.html",
    usedFor: "敌后根据地恢复元气、发展经济与民运、训练干部、粉碎“扫荡”、积蓄力量等总体工作。",
  }),
  Object.freeze({
    id: "simplifiedAdministration",
    organization: "中华人民共和国应急管理部",
    title: "1942：思想建党聚伟力",
    url: "https://www.mem.gov.cn/xw/ztzl/2021/dsxxjy/xxfd/202103/t20210329_382238.shtml",
    usedFor: "1942年根据地处境与精兵简政、减轻群众负担、加强基层和提高效能的历史背景。",
  }),
]);

export const phaseDefinitions = Object.freeze([
  Object.freeze({
    id: "foothold",
    order: 0,
    dateLabel: "1942年5月上旬",
    name: "第一章 · 立足",
    shortName: "立足",
    briefing: "封锁线正在收紧。先把分散的粮秣、木料和工具集中起来，修复工作站；不要急着同据点硬碰。",
    historyTitle: "封锁网下的生存",
    historyText: "到1942年，冀中平原上的道路、沟墙、碉堡和据点已显著压缩游击力量的活动空间。游戏把这种持续压力抽象为“封锁强度”和不断扩大的巡逻范围。",
    objectives: Object.freeze([
      Object.freeze({ id: "grainStore", label: "累计调集 260 粮秣", metric: "grain", target: 260 }),
      Object.freeze({ id: "timberStore", label: "累计调集 190 木料", metric: "timber", target: 190 }),
      Object.freeze({ id: "buildGranary", label: "修建 1 座粮站", metric: "building:granary", target: 1 }),
      Object.freeze({ id: "buildWorkshop", label: "修建 1 座修械所", metric: "building:workshop", target: 1 }),
    ]),
  }),
  Object.freeze({
    id: "network",
    order: 1,
    dateLabel: "1942年5月中旬",
    name: "第二章 · 联村",
    shortName: "联村",
    briefing: "一支部队若离开群众便无法在敌后长期存在。派交通员踏查村路，建立分散联络点，再为群众准备隐蔽空间。",
    historyTitle: "战斗队，也是工作队",
    historyText: "敌后小队不仅作战，也承担发动群众、建立情报站、组织民兵和瓦解伪组织等任务。游戏因此把“联络村庄”放在扩军之前。",
    objectives: Object.freeze([
      Object.freeze({ id: "contactVillages", label: "联络 3 个村庄", metric: "villagesContacted", target: 3 }),
      Object.freeze({ id: "buildShelters", label: "让 3 个联络村获得就近隐蔽点", metric: "shelteredVillages", target: 3 }),
      Object.freeze({ id: "trainScout", label: "拥有 1 支交通组", metric: "unit:scout", target: 1 }),
      Object.freeze({ id: "keepSupport", label: "群众支持不低于 55", metric: "support", target: 55, minimum: true }),
    ]),
  }),
  Object.freeze({
    id: "breakBlockade",
    order: 2,
    dateLabel: "1942年5月下旬",
    name: "第三章 · 破网",
    shortName: "破网",
    briefing: "侦察清楚再行动。袭扰封锁设施的目的，是打开转移窗口，不是围攻坚固据点。打完便走，保护沿线村庄。",
    historyTitle: "交通破袭与有限目标",
    historyText: "敌后力量常以机动袭扰、破坏交通和分散敌军为目标。这里的破袭结果只计算“迟滞”和通道开启，不统计歼敌数字。",
    objectives: Object.freeze([
      Object.freeze({ id: "intelStore", label: "积累 70 情报", metric: "intel", target: 70 }),
      Object.freeze({ id: "sabotageSites", label: "破坏 2 处封锁设施", metric: "sitesSabotaged", target: 2 }),
      Object.freeze({ id: "fieldForces", label: "拥有 3 支民兵或游击组", metric: "fieldUnits", target: 3 }),
      Object.freeze({ id: "keepVillages", label: "至少 2 个联络村保持安全", metric: "safeVillages", target: 2 }),
    ]),
  }),
  Object.freeze({
    id: "counterSweep",
    order: 3,
    dateLabel: "1942年6月上旬",
    name: "第四章 · 反“扫荡”",
    shortName: "转移",
    briefing: "大股搜索将沿道路推进。不要守住每一寸土地；预警、隐蔽、诱离和保存有生力量，才是本阶段的胜负手。",
    historyTitle: "保存力量，不作静态决战",
    historyText: "1942年5月1日至6月20日的大规模“扫荡”使冀中根据地遭受严重损失。早期地道能够帮助隐蔽和转移，却并非无所不能的“地下堡垒”。",
    objectives: Object.freeze([
      Object.freeze({ id: "surviveSweep", label: "坚持 15 分钟", metric: "sweepSeconds", target: 900 }),
      Object.freeze({ id: "protectedCivilians", label: "保护 85 名群众", metric: "protectedCivilians", target: 85 }),
      Object.freeze({ id: "headquartersLives", label: "工作站保持运转", metric: "headquartersAlive", target: 1 }),
      Object.freeze({ id: "supportSurvives", label: "群众支持不低于 40", metric: "support", target: 40, minimum: true }),
    ]),
  }),
  Object.freeze({
    id: "withdrawal",
    order: 4,
    dateLabel: "1942年6月20日前",
    name: "终章 · 留下火种",
    shortName: "突围",
    briefing: "封锁被短暂撕开。让携带名册与情报的交通组抵达东南苇荡；主力只需牵制，不必追击。",
    historyTitle: "局部保存，而非改写历史",
    historyText: "本章使用虚构地点与人物。无论评分如何，全国抗战的真实进程和1945年的最终胜利都不会被改写。",
    objectives: Object.freeze([
      Object.freeze({ id: "courierReady", label: "交通组携带完整情报", metric: "courierReady", target: 1 }),
      Object.freeze({ id: "reachExit", label: "交通组抵达东南苇荡", metric: "courierEscaped", target: 1 }),
      Object.freeze({ id: "networkSurvives", label: "至少 2 个联络村保存", metric: "safeVillages", target: 2 }),
    ]),
  }),
]);

export const tutorialSteps = Object.freeze([
  Object.freeze({
    id: "select",
    title: "先看工作队",
    text: "左键点选单位；按住拖动可框选。右键地面下达移动命令。触屏可先点单位，再点“移动”。",
    anchor: "world",
  }),
  Object.freeze({
    id: "gather",
    title: "把人派到生产点",
    text: "选中工作队后，右键农田、林地或废旧物资点；触屏可先选工作队再点生产点，也可点生产点后使用“派工作队生产”。采集会持续进行。",
    anchor: "commands",
  }),
  Object.freeze({
    id: "build",
    title: "扩建，而不是铺满地图",
    text: "工作队能修建粮站、修械所、隐蔽点、救护所和观察哨。建造会产生动静，提高暴露。",
    anchor: "commands",
  }),
  Object.freeze({
    id: "fog",
    title: "情报决定行动边界",
    text: "深色区域尚未侦察；灰暗区域只保留旧情报。敌方巡逻只有在当前视野内才会显示。",
    anchor: "world",
  }),
  Object.freeze({
    id: "ethic",
    title: "胜负首先看群众安全",
    text: "在村庄附近交火、让敌军进入村庄、无准备地强攻据点都会损害群众支持。游戏不奖励击杀。",
    anchor: "support",
  }),
]);

export const historicalTerms = Object.freeze([
  Object.freeze({
    term: "“扫荡”",
    definition: "沿用侵略军当时用语，故加引号。游戏将其表现为搜索、合围、破坏和封锁压力，而不是普通战役波次。",
  }),
  Object.freeze({
    term: "“囚笼政策”",
    definition: "以铁路、公路、沟墙、据点等分割和封锁根据地，并依靠机动兵力相互策应的占领体系。",
  }),
  Object.freeze({
    term: "交通员",
    definition: "承担秘密联络、传递情报和引导人员物资等工作。游戏中的“交通组”是多人职能的抽象。",
  }),
  Object.freeze({
    term: "武工队",
    definition: "深入敌占区开展群众、情报、组织、政治和军事工作的精干力量；并非单纯突击队。",
  }),
  Object.freeze({
    term: "地道与隐蔽点",
    definition: "1942年前后冀中地道仍在发展，主要用于隐蔽、保护、转移和防御。游戏不把它塑造成无风险万能工事。",
  }),
]);

export function GetPhaseDefinition(phaseIndex) {
  return phaseDefinitions[Math.max(0, Math.min(phaseDefinitions.length - 1, phaseIndex))];
}

export function GetDifficultyDefinition(difficultyId) {
  return difficultyDefinitions[difficultyId] || difficultyDefinitions.standard;
}
