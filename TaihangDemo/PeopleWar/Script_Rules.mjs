/**
 * 《太行：人民战争》规则层。
 *
 * 这里故意不模拟一支无所不知、无所不能的军队。玩家能够做的事很少：
 * 每回合三道干部令和一道武装令。真正改变局势的是群众在信任和组织
 * 生根以后，开始自行预警、藏粮、组织担架队，并用地道保护乡亲。
 */

export const CFG = Object.freeze({
  rulesVersion: 2,
  defaultSeed: 19420501,
  maximumTurns: 14,
  tutorialTurns: 6,
  cadreOrdersPerTurn: 3,
  armedOrdersPerTurn: 1,
  maximumLivelihood: 100,
  maximumTrust: 100,
  maximumOrganization: 3,
  maximumEnemySuspicion: 100,
  maximumScars: 5,
  initialSupplies: 18,
  initialArms: 7,
  initialIntelligence: 4,
  maximumSupplies: 40,
  maximumArms: 20,
  maximumIntelligence: 20,
  historyLimit: 120,
});

export const VILLAGE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "SouthPass",
    name: "南峪口",
    terrain: "山口",
    x: 19,
    y: 54,
    families: 42,
    neighbors: Object.freeze(["StoneBridge", "ElmFlat"]),
    routeId: "ZhengTaiRoad",
    start: Object.freeze({ livelihood: 58, trust: 62, organization: 2, enemySuspicion: 30, scars: 0, contacted: true }),
  }),
  Object.freeze({
    id: "StoneBridge",
    name: "石桥村",
    terrain: "河谷",
    x: 34,
    y: 67,
    families: 38,
    neighbors: Object.freeze(["SouthPass", "ElmFlat", "WillowSlope"]),
    routeId: "ZhengTaiRoad",
    start: Object.freeze({ livelihood: 46, trust: 48, organization: 1, enemySuspicion: 38, scars: 1, contacted: true }),
  }),
  Object.freeze({
    id: "ElmFlat",
    name: "榆树坪",
    terrain: "坡地",
    x: 31,
    y: 39,
    families: 33,
    neighbors: Object.freeze(["SouthPass", "StoneBridge", "WangRavine", "QinglongStockade"]),
    routeId: "NorthCartRoad",
    start: Object.freeze({ livelihood: 55, trust: 38, organization: 0, enemySuspicion: 12, scars: 0, contacted: false }),
  }),
  Object.freeze({
    id: "WangRavine",
    name: "王家沟",
    terrain: "沟壑",
    x: 48,
    y: 24,
    families: 31,
    neighbors: Object.freeze(["ElmFlat", "TempleHollow", "RearRidge"]),
    routeId: "NorthCartRoad",
    start: Object.freeze({ livelihood: 51, trust: 34, organization: 0, enemySuspicion: 8, scars: 0, contacted: false }),
  }),
  Object.freeze({
    id: "WillowSlope",
    name: "柳林坡",
    terrain: "丘陵",
    x: 51,
    y: 64,
    families: 36,
    neighbors: Object.freeze(["StoneBridge", "HorseOrchid", "QinglongStockade"]),
    routeId: "RiverRoad",
    start: Object.freeze({ livelihood: 49, trust: 52, organization: 1, enemySuspicion: 27, scars: 0, contacted: true }),
  }),
  Object.freeze({
    id: "HorseOrchid",
    name: "马兰庄",
    terrain: "台地",
    x: 66,
    y: 74,
    families: 40,
    neighbors: Object.freeze(["WillowSlope", "RiverWest", "QinglongStockade"]),
    routeId: "RiverRoad",
    start: Object.freeze({ livelihood: 57, trust: 36, organization: 0, enemySuspicion: 15, scars: 0, contacted: false }),
  }),
  Object.freeze({
    id: "RiverWest",
    name: "河西堡",
    terrain: "平川",
    x: 82,
    y: 61,
    families: 45,
    neighbors: Object.freeze(["HorseOrchid", "RearRidge"]),
    routeId: "RiverRoad",
    start: Object.freeze({ livelihood: 43, trust: 31, organization: 0, enemySuspicion: 21, scars: 1, contacted: false }),
  }),
  Object.freeze({
    id: "RearRidge",
    name: "后梁村",
    terrain: "深山",
    x: 75,
    y: 29,
    families: 29,
    neighbors: Object.freeze(["WangRavine", "RiverWest", "TempleHollow"]),
    routeId: "RidgeTrack",
    start: Object.freeze({ livelihood: 60, trust: 35, organization: 0, enemySuspicion: 5, scars: 0, contacted: false }),
  }),
  Object.freeze({
    id: "QinglongStockade",
    name: "青龙寨",
    terrain: "山寨",
    x: 55,
    y: 45,
    families: 34,
    neighbors: Object.freeze(["ElmFlat", "WillowSlope", "HorseOrchid", "TempleHollow"]),
    routeId: "RidgeTrack",
    start: Object.freeze({ livelihood: 53, trust: 41, organization: 0, enemySuspicion: 10, scars: 0, contacted: false }),
  }),
  Object.freeze({
    id: "TempleHollow",
    name: "庙沟",
    terrain: "密林",
    x: 61,
    y: 17,
    families: 27,
    neighbors: Object.freeze(["WangRavine", "RearRidge", "QinglongStockade"]),
    routeId: "RidgeTrack",
    start: Object.freeze({ livelihood: 48, trust: 33, organization: 0, enemySuspicion: 7, scars: 0, contacted: false }),
  }),
]);

export const CONNECTION_DEFINITIONS = Object.freeze([
  ["SouthPass", "StoneBridge"],
  ["SouthPass", "ElmFlat"],
  ["StoneBridge", "ElmFlat"],
  ["StoneBridge", "WillowSlope"],
  ["ElmFlat", "WangRavine"],
  ["ElmFlat", "QinglongStockade"],
  ["WangRavine", "TempleHollow"],
  ["WangRavine", "RearRidge"],
  ["WillowSlope", "HorseOrchid"],
  ["WillowSlope", "QinglongStockade"],
  ["HorseOrchid", "RiverWest"],
  ["HorseOrchid", "QinglongStockade"],
  ["RiverWest", "RearRidge"],
  ["RearRidge", "TempleHollow"],
  ["QinglongStockade", "TempleHollow"],
].map(([from, to], connectionIndex) => Object.freeze({ id: `Connection${connectionIndex + 1}`, from, to })));

export const ROUTE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "ZhengTaiRoad", name: "正太公路支线", villageIds: Object.freeze(["SouthPass", "StoneBridge"]) }),
  Object.freeze({ id: "NorthCartRoad", name: "北坡大车道", villageIds: Object.freeze(["ElmFlat", "WangRavine"]) }),
  Object.freeze({ id: "RiverRoad", name: "河谷运输道", villageIds: Object.freeze(["WillowSlope", "HorseOrchid", "RiverWest"]) }),
  Object.freeze({ id: "RidgeTrack", name: "东岭驮道", villageIds: Object.freeze(["RearRidge", "QinglongStockade", "TempleHollow"]) }),
]);

export const ACTION_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "Relief",
    name: "开仓救济",
    shortName: "救济",
    orderType: "cadre",
    costs: Object.freeze({ supplies: 2, arms: 0, intelligence: 0 }),
    baseChance: 100,
    description: "把有限的粮食先交到最困难的乡亲手里。民生活下来，信任才有根。",
    preview: "民生与信任上升；立即保护数户濒临断粮的家庭。",
  }),
  Object.freeze({
    id: "Contact",
    name: "秘密接触",
    shortName: "接触",
    orderType: "cadre",
    costs: Object.freeze({ supplies: 0, arms: 0, intelligence: 0 }),
    baseChance: 82,
    description: "由熟人带路进村，不把群众当地图上的资源点。失败会留下线索。",
    preview: "与相邻村庄建立联系；失败会提高敌疑。",
  }),
  Object.freeze({
    id: "BuildBranch",
    name: "建立支部",
    shortName: "建支部",
    orderType: "cadre",
    costs: Object.freeze({ supplies: 1, arms: 0, intelligence: 0 }),
    baseChance: 86,
    description: "培养本村骨干，把一次性的命令变成群众自己的组织。",
    preview: "组织度提高一级；组织越强，自主行动越多。",
  }),
  Object.freeze({
    id: "HideAndEvacuate",
    name: "藏粮疏散",
    shortName: "藏粮疏散",
    orderType: "cadre",
    costs: Object.freeze({ supplies: 1, arms: 0, intelligence: 0 }),
    baseChance: 100,
    description: "分散粮食、安置老幼、约定进山路线，为当回合敌情做准备。",
    preview: "本回合减少征粮和扫荡造成的家庭损失。",
  }),
  Object.freeze({
    id: "CounterRecon",
    name: "反侦察",
    shortName: "反侦察",
    orderType: "cadre",
    costs: Object.freeze({ supplies: 0, arms: 0, intelligence: 1 }),
    baseChance: 90,
    description: "清理脚印、转移联络点、布置假消息，让敌人只能依据错误证据行动。",
    preview: "降低敌疑和证据，并削弱当回合搜索。",
  }),
  Object.freeze({
    id: "Scout",
    name: "武装侦察",
    shortName: "侦察",
    orderType: "armed",
    costs: Object.freeze({ supplies: 0, arms: 0, intelligence: 0 }),
    baseChance: 88,
    description: "侦察道路、据点与征粮队动向，为群众争取预警时间。",
    preview: "获得情报；若敌人来犯该村，增加预警保护。",
  }),
  Object.freeze({
    id: "Sabotage",
    name: "交通破袭",
    shortName: "破袭",
    orderType: "armed",
    costs: Object.freeze({ supplies: 0, arms: 1, intelligence: 1 }),
    baseChance: 76,
    description: "破坏桥涵和运输线，不以占地为目标，而是削弱扫荡补给。",
    preview: "累计交通破坏，降低本回合和后续扫荡强度；暴露风险较高。",
  }),
  Object.freeze({
    id: "CoverAmbush",
    name: "掩护／伏击",
    shortName: "掩护伏击",
    orderType: "armed",
    costs: Object.freeze({ supplies: 0, arms: 1, intelligence: 0 }),
    baseChance: 80,
    modes: Object.freeze([
      Object.freeze({ id: "cover", name: "掩护转移", description: "以保护群众为先，风险较低。" }),
      Object.freeze({ id: "ambush", name: "短促伏击", description: "争取挫败扫荡，但会留下更多证据。" }),
    ]),
    description: "选择掩护乡亲转移，或打一场短促伏击后立即撤离。",
    preview: "掩护偏重保护；伏击偏重挫败敌军但增加敌疑。",
  }),
]);

export const TURN_DEFINITIONS = Object.freeze([
  [1, "一锅小米粥", "先让乡亲活下来，群众工作不是抽象数字。"],
  [2, "生人变成乡亲", "通过熟人秘密接触，把新的村庄接进交通网。"],
  [3, "一个支部一座堡垒", "命令会离开，扎在村里的组织不会。"],
  [4, "一粒粮也不留给敌人", "征粮队将至，先藏粮、再疏散老幼。"],
  [5, "让敌人扑空", "侦察敌情，也清除敌人赖以判断的痕迹。"],
  [6, "第一场反扫荡", "破坏运输、掩护转移；能保存群众才是胜利。"],
  [7, "封锁线收紧", "敌人开始连续扫荡，只会扑向他们掌握证据的地方。"],
  [8, "青纱帐里的眼睛", "群众预警网比少数侦察员看得更远。"],
  [9, "村村都是后方", "担架队、藏粮组和交通员开始自行协同。"],
  [10, "铁壁合围", "敌军兵力加码，任何暴露都可能变成惨重代价。"],
  [11, "地道连着人心", "三级组织能够用地道保护乡亲，但伤痕仍会留下。"],
  [12, "焦土之后", "救济受害家庭，决定信任能否熬过最残酷的时刻。"],
  [13, "黎明前的长夜", "最后的扫荡试图摧毁组织和群众之间的联系。"],
  [14, "火种与山河", "结算的不是占了多少地，而是谁活下来、谁还愿意并肩抵抗。"],
].map(([turn, title, text]) => Object.freeze({
  turn,
  title,
  text,
  phase: turn <= CFG.tutorialTurns ? "tutorial" : "antiSweep",
})));

export const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    turn: 1,
    title: "第一课：救济",
    text: "石桥村已有受灾家庭。先救人，信任才不是一句口号。",
    focusActionId: "Relief",
    targetVillageId: "StoneBridge",
    recommendedActions: Object.freeze([Object.freeze({ actionId: "Relief", villageId: "StoneBridge" }), Object.freeze({ actionId: "Scout", villageId: "StoneBridge" })]),
    enemyIntent: Object.freeze({ kind: "Patrol", targetVillageId: "StoneBridge", strength: 1, clue: "石桥附近出现敌军巡逻。" }),
  }),
  Object.freeze({
    turn: 2,
    title: "第二课：接触",
    text: "榆树坪与南峪口相邻，但没有可靠联络。让熟人带路。",
    focusActionId: "Contact",
    targetVillageId: "ElmFlat",
    recommendedActions: Object.freeze([Object.freeze({ actionId: "Contact", villageId: "ElmFlat" })]),
    enemyIntent: Object.freeze({ kind: "Requisition", targetVillageId: "WillowSlope", strength: 1, clue: "柳林坡方向传来征粮队的消息。" }),
  }),
  Object.freeze({
    turn: 3,
    title: "第三课：建支部",
    text: "石桥村已有信任基础。培养本村骨干，群众才能在干部不在时自行行动。",
    focusActionId: "BuildBranch",
    targetVillageId: "StoneBridge",
    recommendedActions: Object.freeze([Object.freeze({ actionId: "BuildBranch", villageId: "StoneBridge" })]),
    enemyIntent: Object.freeze({ kind: "Search", targetVillageId: "SouthPass", strength: 1, clue: "敌探在南峪口盘查来往行人。" }),
  }),
  Object.freeze({
    turn: 4,
    title: "第四课：藏粮疏散",
    text: "敌人按已掌握的线索回到石桥村。把粮分散，把老幼先送进山。",
    focusActionId: "HideAndEvacuate",
    targetVillageId: "StoneBridge",
    recommendedActions: Object.freeze([Object.freeze({ actionId: "HideAndEvacuate", villageId: "StoneBridge" }), Object.freeze({ actionId: "CoverAmbush", villageId: "StoneBridge", mode: "cover" })]),
    enemyIntent: Object.freeze({ kind: "Requisition", targetVillageId: "StoneBridge", strength: 2, clue: "石桥村被列入征粮清单。" }),
  }),
  Object.freeze({
    turn: 5,
    title: "第五课：侦察与反侦察",
    text: "看清敌人，也要让敌人看不清我们。敌军不会读取真实组织度，只会依据证据。",
    focusActionId: "CounterRecon",
    targetVillageId: "WillowSlope",
    recommendedActions: Object.freeze([Object.freeze({ actionId: "CounterRecon", villageId: "WillowSlope" }), Object.freeze({ actionId: "Scout", villageId: "WillowSlope" })]),
    enemyIntent: Object.freeze({ kind: "Search", targetVillageId: "WillowSlope", strength: 2, clue: "柳林坡周围的盘查突然增多。" }),
  }),
  Object.freeze({
    turn: 6,
    title: "第六课：破袭与掩护",
    text: "反扫荡不是换伤亡。打断运输、保护转移、短促伏击后撤离。",
    focusActionId: "Sabotage",
    targetVillageId: "SouthPass",
    recommendedActions: Object.freeze([Object.freeze({ actionId: "Sabotage", villageId: "SouthPass" }), Object.freeze({ actionId: "CoverAmbush", villageId: "SouthPass", mode: "cover" })]),
    enemyIntent: Object.freeze({ kind: "Sweep", targetVillageId: "SouthPass", strength: 2, clue: "扫荡队正沿正太公路支线逼近南峪口。" }),
  }),
]);

const enemyKindNames = Object.freeze({
  Patrol: "武装巡逻",
  Requisition: "强征粮食",
  Search: "清乡搜捕",
  Sweep: "军事扫荡",
});

const lateEnemyOperationSchedule = Object.freeze({
  7: Object.freeze({
    kind: "Search",
    strength: 2,
    operationPhase: "封锁侦缉",
    policy: "侵华日军以纵火和搜捕收紧封锁线，沿交通节点盘查联络人。",
    eventId: "Turn7BurnSearch",
    burnSearch: true,
    threatBonus: 0,
    organizationPressure: 1,
    livelihoodPressure: 0,
    scarPressure: 0,
  }),
  8: Object.freeze({
    kind: "Requisition",
    strength: 2,
    operationPhase: "封锁征发",
    policy: "以据点为依托强征粮食，迫使村庄断绝对外接济。",
    threatBonus: 1,
    organizationPressure: 0,
    livelihoodPressure: 1,
    scarPressure: 0,
  }),
  9: Object.freeze({
    kind: "Requisition",
    strength: 3,
    operationPhase: "运输集结",
    policy: "扩大征粮并为大规模扫荡集结补给。",
    threatBonus: 2,
    organizationPressure: 0,
    livelihoodPressure: 2,
    scarPressure: 0,
  }),
  10: Object.freeze({
    kind: "Sweep",
    strength: 3,
    operationPhase: "铁壁合围",
    policy: "多路推进压缩转移空间，搜索暴露的交通网络。",
    threatBonus: 2,
    organizationPressure: 1,
    livelihoodPressure: 1,
    scarPressure: 0,
  }),
  11: Object.freeze({
    kind: "Sweep",
    strength: 4,
    operationPhase: "分区合围",
    policy: "封山与分区搜剿并行，试图切断村庄之间的掩护。",
    threatBonus: 3,
    organizationPressure: 2,
    livelihoodPressure: 1,
    scarPressure: 1,
  }),
  12: Object.freeze({
    kind: "Search",
    strength: 5,
    operationPhase: "占领清剿",
    policy: "驻村搜捕骨干，以长期占领摧毁地下联络。",
    threatBonus: 4,
    organizationPressure: 2,
    livelihoodPressure: 1,
    scarPressure: 1,
  }),
  13: Object.freeze({
    kind: "Sweep",
    strength: 5,
    operationPhase: "终局扫荡",
    policy: "集中兵力反复扫荡，逼迫群众与组织分离。",
    threatBonus: 5,
    organizationPressure: 2,
    livelihoodPressure: 2,
    scarPressure: 1,
  }),
  14: Object.freeze({
    kind: "Sweep",
    strength: 6,
    operationPhase: "焦土压迫",
    policy: "以毁坏生计和摧毁联络为目标发动最后扫荡。",
    threatBonus: 6,
    organizationPressure: 3,
    livelihoodPressure: 2,
    scarPressure: 2,
  }),
});

const popularActionNames = Object.freeze({
  EarlyWarning: "群众预警网",
  HideGrain: "自主藏粮组",
  Stretcher: "群众担架队",
  Tunnels: "地道掩护网",
});

const occupationConsequenceFields = Object.freeze([
  "grainSeized",
  "homesBurned",
  "familiesDisplaced",
  "peopleWounded",
  "peopleKilled",
  "peopleDetained",
]);

const peopleConsequenceFields = Object.freeze([
  "peopleKilled",
  "peopleWounded",
  "peopleDetained",
]);

function Clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function DeepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function NormalizeSeed(seed) {
  if (Number.isFinite(seed)) {
    const numericSeed = Math.trunc(seed) >>> 0;
    return numericSeed === 0 ? CFG.defaultSeed : numericSeed;
  }
  const seedText = String(seed ?? CFG.defaultSeed);
  let hash = 2166136261;
  for (let characterIndex = 0; characterIndex < seedText.length; characterIndex += 1) {
    hash ^= seedText.charCodeAt(characterIndex);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || CFG.defaultSeed;
}

function HashText(text) {
  const sourceText = String(text);
  let hash = 2166136261;
  for (let characterIndex = 0; characterIndex < sourceText.length; characterIndex += 1) {
    hash ^= sourceText.charCodeAt(characterIndex);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function DeterministicFraction(...parts) {
  return HashText(parts.join("|")) / 4294967296;
}

function GetVillageDefinition(villageId) {
  return VILLAGE_DEFINITIONS.find((village) => village.id === villageId) ?? null;
}

function GetActionDefinition(actionId) {
  return ACTION_DEFINITIONS.find((action) => action.id === actionId) ?? null;
}

function GetRouteDefinition(routeId) {
  return ROUTE_DEFINITIONS.find((route) => route.id === routeId) ?? null;
}

function GetTurnDefinition(turn) {
  return TURN_DEFINITIONS[Clamp(Math.trunc(turn || 1), 1, CFG.maximumTurns) - 1];
}

function GetTutorialDefinition(turn) {
  return TUTORIAL_STEPS.find((step) => step.turn === turn) ?? null;
}

function GetPhaseForTurn(turn) {
  return turn <= CFG.tutorialTurns ? "tutorial" : "antiSweep";
}

function CreateEmptyOccupationConsequences() {
  return Object.fromEntries(occupationConsequenceFields.map((fieldName) => [fieldName, 0]));
}

function CreateVillageState(villageDefinition) {
  return {
    livelihood: villageDefinition.start.livelihood,
    trust: villageDefinition.start.trust,
    organization: villageDefinition.start.organization,
    enemySuspicion: villageDefinition.start.enemySuspicion,
    scars: villageDefinition.start.scars,
    contacted: villageDefinition.start.contacted,
    protectedFamilies: 0,
    harmedFamilies: 0,
    occupationConsequences: CreateEmptyOccupationConsequences(),
    lastPopularActions: [],
  };
}

function CreateEnemyKnowledge(villageDefinition) {
  const initiallyObserved = villageDefinition.start.contacted;
  return {
    evidence: initiallyObserved ? Math.max(1, Math.round(villageDefinition.start.enemySuspicion / 16)) : 0,
    knownOrganization: initiallyObserved ? Math.min(1, villageDefinition.start.organization) : 0,
    confidence: initiallyObserved ? 38 : 8,
    lastConfirmedTurn: initiallyObserved ? 0 : null,
    evidenceLabels: initiallyObserved ? ["战前盘查记录"] : [],
  };
}

function AddHistoryEntry(state, entry) {
  state.history.push({
    turn: state.turn,
    ...entry,
  });
  if (state.history.length > CFG.historyLimit) {
    state.history.splice(0, state.history.length - CFG.historyLimit);
  }
}

function CreateInitialTutorialState() {
  return {
    completedTurns: [],
    completedFocusActions: [],
    missedFocusActions: [],
  };
}

export function CreateInitialState(seedOrOptions = CFG.defaultSeed) {
  const options = seedOrOptions && typeof seedOrOptions === "object" ? seedOrOptions : { seed: seedOrOptions };
  const seed = NormalizeSeed(options.seed ?? CFG.defaultSeed);
  const villages = {};
  const enemyKnowledge = {};
  for (const villageDefinition of VILLAGE_DEFINITIONS) {
    villages[villageDefinition.id] = CreateVillageState(villageDefinition);
    enemyKnowledge[villageDefinition.id] = CreateEnemyKnowledge(villageDefinition);
  }
  const routes = {};
  for (const routeDefinition of ROUTE_DEFINITIONS) {
    routes[routeDefinition.id] = {
      currentDisruption: 0,
      totalDisruption: 0,
    };
  }
  const state = {
    version: CFG.rulesVersion,
    seed,
    randomState: seed,
    turn: 1,
    maxTurns: CFG.maximumTurns,
    phase: "tutorial",
    status: "active",
    turnDefinition: DeepClone(TURN_DEFINITIONS[0]),
    orderBudget: { cadre: CFG.cadreOrdersPerTurn, armed: CFG.armedOrdersPerTurn },
    resources: {
      supplies: CFG.initialSupplies,
      arms: CFG.initialArms,
      intelligence: CFG.initialIntelligence,
    },
    villages,
    enemyKnowledge,
    routes,
    plans: [],
    nextPlanSerial: 1,
    campaignMetrics: {
      protectedFamilies: 0,
      victimizedFamilies: 0,
      enemyRequisitionsFrustrated: 0,
      enemySweepsFrustrated: 0,
      routeDisruption: 0,
      successfulActions: 0,
      failedActions: 0,
      popularActions: 0,
      ...CreateEmptyOccupationConsequences(),
    },
    tutorial: CreateInitialTutorialState(),
    history: [],
    lastCommand: null,
    lastResolution: null,
    outcome: null,
    enemyOrders: [],
    stats: null,
  };
  SyncUiSnapshots(state);
  return state;
}

export function GetTutorialStep(stateOrTurn) {
  const turn = typeof stateOrTurn === "number" ? stateOrTurn : stateOrTurn?.turn;
  return DeepClone(GetTutorialDefinition(turn));
}

function NormalizePlanOptions(action, options) {
  const normalizedOptions = typeof options === "string" ? { mode: options } : { ...(options ?? {}) };
  if (action?.id === "CoverAmbush") {
    normalizedOptions.mode = ["cover", "ambush"].includes(normalizedOptions.mode) ? normalizedOptions.mode : "cover";
  } else {
    delete normalizedOptions.mode;
  }
  return normalizedOptions;
}

export function GetPlanningSummary(state) {
  const plans = Array.isArray(state?.plans) ? state.plans : [];
  const usedOrders = { cadre: 0, armed: 0 };
  const reservedCosts = { supplies: 0, arms: 0, intelligence: 0 };
  for (const plan of plans) {
    const action = GetActionDefinition(plan.actionId);
    if (!action) {
      continue;
    }
    usedOrders[action.orderType] += 1;
    reservedCosts.supplies += action.costs.supplies;
    reservedCosts.arms += action.costs.arms;
    reservedCosts.intelligence += action.costs.intelligence;
  }
  const budget = state?.orderBudget ?? { cadre: CFG.cadreOrdersPerTurn, armed: CFG.armedOrdersPerTurn };
  const resources = state?.resources ?? { supplies: 0, arms: 0, intelligence: 0 };
  return {
    usedOrders,
    remainingOrders: {
      cadre: Math.max(0, budget.cadre - usedOrders.cadre),
      armed: Math.max(0, budget.armed - usedOrders.armed),
    },
    reservedCosts,
    availableResources: {
      supplies: resources.supplies - reservedCosts.supplies,
      arms: resources.arms - reservedCosts.arms,
      intelligence: resources.intelligence - reservedCosts.intelligence,
    },
  };
}

function CalculateActionChance(state, action, villageId, options = {}) {
  const village = state.villages[villageId];
  let chance = action.baseChance;
  if (action.id === "Contact") {
    const contactedNeighborTrust = GetVillageDefinition(villageId).neighbors
      .filter((neighborId) => state.villages[neighborId]?.contacted)
      .map((neighborId) => state.villages[neighborId].trust);
    const bestNeighborTrust = contactedNeighborTrust.length > 0 ? Math.max(...contactedNeighborTrust) : 0;
    chance += Math.floor((bestNeighborTrust - 50) / 5);
    chance -= Math.floor(village.enemySuspicion / 12);
  } else if (action.id === "BuildBranch") {
    chance += Math.floor((village.trust - 50) / 5);
    chance -= village.scars * 2;
  } else if (action.id === "CounterRecon") {
    chance += village.organization * 2;
  } else if (action.id === "Scout") {
    chance += village.organization * 2;
    chance -= Math.floor(village.enemySuspicion / 25);
  } else if (action.id === "Sabotage") {
    chance += village.organization * 3;
    chance -= Math.floor(village.enemySuspicion / 18);
  } else if (action.id === "CoverAmbush" && options.mode === "ambush") {
    chance -= 7;
    chance += village.organization * 4;
  }
  return Clamp(Math.round(chance), 35, 100);
}

function CreateUnavailableResult(actionId, villageId, reason, additional = {}) {
  return {
    available: false,
    legal: false,
    actionId,
    villageId,
    reason,
    reasons: [reason],
    ...additional,
  };
}

export function GetActionAvailability(state, actionId, villageId, options = {}) {
  if (!state || typeof state !== "object") {
    return CreateUnavailableResult(actionId, villageId, "游戏状态无效。请重新开始。" );
  }
  if (state.status !== "active") {
    return CreateUnavailableResult(actionId, villageId, "十四回合剧本已经结算。" );
  }
  const action = GetActionDefinition(actionId);
  if (!action) {
    return CreateUnavailableResult(actionId, villageId, "未知行动。" );
  }
  const villageDefinition = GetVillageDefinition(villageId);
  const village = state.villages?.[villageId];
  if (!villageDefinition || !village) {
    return CreateUnavailableResult(actionId, villageId, "未知村庄。", { action: DeepClone(action) });
  }
  const normalizedOptions = NormalizePlanOptions(action, options);
  if (action.id === "CoverAmbush" && options?.mode && !["cover", "ambush"].includes(options.mode)) {
    return CreateUnavailableResult(actionId, villageId, "掩护／伏击必须选择“掩护转移”或“短促伏击”。", { action: DeepClone(action) });
  }
  const planningSummary = GetPlanningSummary(state);
  if (planningSummary.remainingOrders[action.orderType] <= 0) {
    const orderName = action.orderType === "cadre" ? "干部令" : "武装令";
    return CreateUnavailableResult(actionId, villageId, `本回合的${orderName}已经用完。`, { action: DeepClone(action) });
  }
  if (planningSummary.availableResources.supplies < action.costs.supplies) {
    return CreateUnavailableResult(actionId, villageId, "可用粮秣不足；撤销计划可以释放预留成本。", { action: DeepClone(action) });
  }
  if (planningSummary.availableResources.arms < action.costs.arms) {
    return CreateUnavailableResult(actionId, villageId, "可用军械不足；侦察不消耗军械，可以先保存力量。", { action: DeepClone(action) });
  }
  if (planningSummary.availableResources.intelligence < action.costs.intelligence) {
    return CreateUnavailableResult(actionId, villageId, "可用情报不足；撤销计划可以释放预留成本。", { action: DeepClone(action) });
  }
  const duplicatePlan = state.plans.some((plan) => plan.actionId === actionId && plan.villageId === villageId);
  if (duplicatePlan) {
    return CreateUnavailableResult(actionId, villageId, "同一村庄不能重复安排同一种行动。", { action: DeepClone(action) });
  }

  if (action.id === "Contact") {
    if (village.contacted) {
      return CreateUnavailableResult(actionId, villageId, "这里已经建立可靠联系。", { action: DeepClone(action) });
    }
    const hasContactedNeighbor = villageDefinition.neighbors.some((neighborId) => state.villages[neighborId]?.contacted);
    if (!hasContactedNeighbor) {
      return CreateUnavailableResult(actionId, villageId, "必须从相邻的已联络村庄派熟人带路。", { action: DeepClone(action) });
    }
  } else if (!village.contacted) {
    return CreateUnavailableResult(actionId, villageId, "尚未建立可靠联系，不能直接下令。", { action: DeepClone(action) });
  }

  if (action.id === "BuildBranch") {
    if (village.organization >= CFG.maximumOrganization) {
      return CreateUnavailableResult(actionId, villageId, "本村组织已经达到三级，应把干部令留给别处。", { action: DeepClone(action) });
    }
    if (village.trust < 40) {
      return CreateUnavailableResult(actionId, villageId, "信任尚未达到40。先救济和共同承担风险。", { action: DeepClone(action) });
    }
  }
  if (action.id === "HideAndEvacuate" && village.organization < 1) {
    return CreateUnavailableResult(actionId, villageId, "至少需要一级组织才能可靠分散粮食和安排疏散。", { action: DeepClone(action) });
  }
  if (action.id === "Sabotage" && !GetRouteDefinition(villageDefinition.routeId)) {
    return CreateUnavailableResult(actionId, villageId, "附近没有可供破袭的敌军交通线。", { action: DeepClone(action) });
  }

  return {
    available: true,
    legal: true,
    actionId,
    villageId,
    action: DeepClone(action),
    village: DeepClone(village),
    options: normalizedOptions,
    costs: DeepClone(action.costs),
    chance: CalculateActionChance(state, action, villageId, normalizedOptions),
    remainingOrders: planningSummary.remainingOrders,
    availableResources: planningSummary.availableResources,
    reason: "可以安排。提交回合前仍可撤销。",
    reasons: [],
  };
}

export function QueueAction(state, actionId, villageId, options = {}) {
  const nextState = DeepClone(state);
  if (!nextState) {
    return nextState;
  }
  const availability = GetActionAvailability(state, actionId, villageId, options);
  if (!availability.available) {
    nextState.lastCommand = {
      type: "QueueAction",
      success: false,
      actionId,
      villageId,
      reason: availability.reason,
    };
    return nextState;
  }
  const plan = {
    id: `Plan${state.turn}_${state.nextPlanSerial}`,
    actionId,
    villageId,
    orderType: availability.action.orderType,
    costs: DeepClone(availability.costs),
    chanceAtQueue: availability.chance,
    options: availability.options,
  };
  nextState.nextPlanSerial += 1;
  nextState.plans.push(plan);
  nextState.lastCommand = {
    type: "QueueAction",
    success: true,
    planId: plan.id,
    actionId,
    villageId,
    reason: "计划已加入；成本仅被预留，尚未消耗。",
  };
  return nextState;
}

export function RemovePlan(state, planId) {
  const nextState = DeepClone(state);
  if (!nextState) {
    return nextState;
  }
  if (nextState.status !== "active") {
    nextState.lastCommand = { type: "RemovePlan", success: false, planId, reason: "剧本已经结算，不能撤销。" };
    return nextState;
  }
  const planIndex = nextState.plans.findIndex((plan) => plan.id === planId);
  if (planIndex < 0) {
    nextState.lastCommand = { type: "RemovePlan", success: false, planId, reason: "没有找到这项计划。" };
    return nextState;
  }
  const [removedPlan] = nextState.plans.splice(planIndex, 1);
  nextState.lastCommand = {
    type: "RemovePlan",
    success: true,
    planId,
    actionId: removedPlan.actionId,
    villageId: removedPlan.villageId,
    reason: "计划已撤销，预留的命令和资源已经释放。",
  };
  return nextState;
}

function GetDynamicEnemyIntent(state) {
  const operation = lateEnemyOperationSchedule[state.turn] ?? lateEnemyOperationSchedule[CFG.maximumTurns];
  let bestCandidate = null;
  for (const villageDefinition of VILLAGE_DEFINITIONS) {
    const village = state.villages[villageDefinition.id];
    const knowledge = state.enemyKnowledge[villageDefinition.id];
    // 关键契约：这里绝不读取 livelihood、trust、organization 或 contacted。
    // 敌军只能使用敌疑、已经积累的证据和此前确认的组织情报。
    const recency = knowledge.lastConfirmedTurn === null
      ? 0
      : Math.max(0, 5 - Math.abs(state.turn - knowledge.lastConfirmedTurn));
    const noise = DeterministicFraction(state.seed, state.turn, villageDefinition.id, "EnemyDecision") * 5;
    const score = knowledge.evidence * 18
      + village.enemySuspicion * 0.62
      + knowledge.knownOrganization * 4
      + knowledge.confidence * 0.08
      + recency
      + noise;
    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = { villageId: villageDefinition.id, score, knowledge: DeepClone(knowledge), enemySuspicion: village.enemySuspicion };
    }
  }
  const targetVillageId = bestCandidate?.villageId ?? "SouthPass";
  const targetName = GetVillageDefinition(targetVillageId).name;
  return {
    ...DeepClone(operation),
    targetVillageId,
    scripted: false,
    clue: `${operation.operationPhase}：敌军根据现有线索，把${targetName}列为${enemyKindNames[operation.kind]}重点。`,
    decisionBasis: {
      evidence: bestCandidate.knowledge.evidence,
      knownOrganization: bestCandidate.knowledge.knownOrganization,
      confidence: bestCandidate.knowledge.confidence,
      enemySuspicion: bestCandidate.enemySuspicion,
      score: Math.round(bestCandidate.score * 10) / 10,
      excludedFacts: ["真实组织度", "真实信任", "真实民生", "玩家未暴露的计划"],
    },
  };
}

export function GetEnemyIntentPreview(state) {
  if (!state || typeof state !== "object") {
    return null;
  }
  const tutorialStep = GetTutorialDefinition(state.turn);
  if (tutorialStep) {
    return {
      ...DeepClone(tutorialStep.enemyIntent),
      scripted: true,
      decisionBasis: {
        lesson: tutorialStep.title,
        evidence: state.enemyKnowledge[tutorialStep.enemyIntent.targetVillageId]?.evidence ?? 0,
        excludedFacts: ["教程固定剧本不读取玩家的全图真实数据"],
      },
    };
  }
  return GetDynamicEnemyIntent(state);
}

function SyncFamilyMetrics(state) {
  let protectedFamilies = 0;
  let harmedFamilies = 0;
  const occupationTotals = CreateEmptyOccupationConsequences();
  for (const villageDefinition of VILLAGE_DEFINITIONS) {
    const village = state.villages[villageDefinition.id];
    village.protectedFamilies = Clamp(Math.trunc(village.protectedFamilies ?? 0), 0, villageDefinition.families);
    village.harmedFamilies = Clamp(Math.trunc(village.harmedFamilies ?? 0), 0, villageDefinition.families);
    protectedFamilies += village.protectedFamilies;
    harmedFamilies += village.harmedFamilies;
    village.occupationConsequences = {
      ...CreateEmptyOccupationConsequences(),
      ...(village.occupationConsequences ?? {}),
    };
    village.occupationConsequences.grainSeized = Clamp(
      Math.trunc(village.occupationConsequences.grainSeized ?? 0),
      0,
      villageDefinition.families * 3,
    );
    village.occupationConsequences.homesBurned = Clamp(
      Math.trunc(village.occupationConsequences.homesBurned ?? 0),
      0,
      villageDefinition.families,
    );
    village.occupationConsequences.familiesDisplaced = Clamp(
      Math.trunc(village.occupationConsequences.familiesDisplaced ?? 0),
      0,
      villageDefinition.families,
    );
    let remainingPeople = villageDefinition.families * 4;
    for (const fieldName of peopleConsequenceFields) {
      village.occupationConsequences[fieldName] = Clamp(
        Math.trunc(village.occupationConsequences[fieldName] ?? 0),
        0,
        remainingPeople,
      );
      remainingPeople -= village.occupationConsequences[fieldName];
    }
    for (const fieldName of occupationConsequenceFields) {
      occupationTotals[fieldName] += village.occupationConsequences[fieldName];
    }
  }
  state.campaignMetrics.protectedFamilies = protectedFamilies;
  state.campaignMetrics.victimizedFamilies = harmedFamilies;
  Object.assign(state.campaignMetrics, occupationTotals);
}

function SyncUiSnapshots(state) {
  SyncFamilyMetrics(state);
  const villages = Object.values(state.villages);
  const intent = state.status === "active" ? GetEnemyIntentPreview(state) : null;
  state.enemyOrders = intent ? [{
    id: `EnemyOrder${state.turn}`,
    kind: intent.kind,
    kindName: enemyKindNames[intent.kind],
    targetVillageId: intent.targetVillageId,
    targetVillageName: GetVillageDefinition(intent.targetVillageId).name,
    strength: intent.strength,
    clue: intent.clue,
    scripted: intent.scripted,
    revealed: true,
    certainty: intent.scripted || state.resources.intelligence >= 4 ? "明确" : "研判",
    decisionBasis: DeepClone(intent.decisionBasis),
  }] : [];
  state.stats = {
    branchCount: villages.filter((village) => village.organization >= 2).length,
    organizedVillageCount: villages.filter((village) => village.organization >= 2).length,
    contactedVillageCount: villages.filter((village) => village.contacted).length,
    protectedFamilies: state.campaignMetrics.protectedFamilies,
    harmedFamilies: state.campaignMetrics.victimizedFamilies,
    disruptedEnemyActions: state.campaignMetrics.enemyRequisitionsFrustrated + state.campaignMetrics.enemySweepsFrustrated,
    enemyRequisitionsFrustrated: state.campaignMetrics.enemyRequisitionsFrustrated,
    enemySweepsFrustrated: state.campaignMetrics.enemySweepsFrustrated,
    routeDisruption: state.campaignMetrics.routeDisruption,
    averageLivelihood: Math.round(villages.reduce((sum, village) => sum + village.livelihood, 0) / villages.length),
    averageTrust: Math.round(villages.reduce((sum, village) => sum + village.trust, 0) / villages.length),
  };
}

function CreateVillageEffects() {
  const effects = {};
  for (const villageDefinition of VILLAGE_DEFINITIONS) {
    effects[villageDefinition.id] = {
      livelihood: 0,
      trust: 0,
      organization: 0,
      enemySuspicion: 0,
      contacted: false,
      hiddenGrain: 0,
      evacuation: 0,
      counterRecon: 0,
      warning: 0,
      cover: 0,
      ambush: 0,
      stretcher: 0,
      tunnels: 0,
      immediateProtectedFamilies: 0,
      intelligence: 0,
      evidence: 0,
      confidence: 0,
      routeDisruption: 0,
    };
  }
  return effects;
}

function GetPlanRoll(state, plan) {
  return Math.floor(DeterministicFraction(
    state.seed,
    state.turn,
    plan.actionId,
    plan.villageId,
    plan.options?.mode ?? "",
    "PlayerAction",
  ) * 100) + 1;
}

function ApplySuccessfulPlan(state, plan, effects) {
  const action = GetActionDefinition(plan.actionId);
  const villageDefinition = GetVillageDefinition(plan.villageId);
  const targetEffects = effects[plan.villageId];
  if (action.id === "Relief") {
    targetEffects.livelihood += 10;
    targetEffects.trust += 7;
    targetEffects.immediateProtectedFamilies += 3;
    return `粮食先送到${villageDefinition.name}最困难的家庭，三户人家熬过了断粮。`;
  }
  if (action.id === "Contact") {
    targetEffects.contacted = true;
    targetEffects.trust += 6;
    targetEffects.enemySuspicion += 2;
    targetEffects.evidence += 1;
    return `熟人把联络员带进${villageDefinition.name}，新的交通关系建立起来。`;
  }
  if (action.id === "BuildBranch") {
    targetEffects.organization += 1;
    targetEffects.trust += 5;
    targetEffects.enemySuspicion += 4;
    targetEffects.evidence += 1;
    targetEffects.confidence += 5;
    return `${villageDefinition.name}培养出本村骨干，今后能够自行组织群众行动。`;
  }
  if (action.id === "HideAndEvacuate") {
    targetEffects.hiddenGrain += 2;
    targetEffects.evacuation += 3;
    targetEffects.trust += 2;
    return `${villageDefinition.name}把粮食分散埋藏，老幼也按约定路线进山。`;
  }
  if (action.id === "CounterRecon") {
    targetEffects.enemySuspicion -= 13;
    targetEffects.evidence -= 2;
    targetEffects.confidence -= 10;
    targetEffects.counterRecon += 3;
    return `${villageDefinition.name}转移联络点并布下假线索，敌人的证据链被打断。`;
  }
  if (action.id === "Scout") {
    targetEffects.warning += 2;
    targetEffects.intelligence += 1;
    targetEffects.enemySuspicion += 2;
    return `侦察员摸清${villageDefinition.name}附近敌情，为群众争取了转移时间。`;
  }
  if (action.id === "Sabotage") {
    targetEffects.routeDisruption += 2;
    targetEffects.enemySuspicion += 11;
    targetEffects.evidence += 2;
    targetEffects.confidence += 6;
    return `${villageDefinition.name}附近的${GetRouteDefinition(villageDefinition.routeId).name}被破坏，敌军补给受阻。`;
  }
  if (plan.options?.mode === "ambush") {
    targetEffects.ambush += 4;
    targetEffects.enemySuspicion += 12;
    targetEffects.evidence += 2;
    targetEffects.confidence += 8;
    return `武装在${villageDefinition.name}打了一场短促伏击，随即脱离，敌军线索也随之增加。`;
  }
  targetEffects.cover += 4;
  targetEffects.evacuation += 2;
  targetEffects.enemySuspicion += 4;
  return `武装在${villageDefinition.name}掩护乡亲分路转移，没有恋战。`;
}

function ApplyFailedPlan(state, plan, effects) {
  const villageDefinition = GetVillageDefinition(plan.villageId);
  const targetEffects = effects[plan.villageId];
  if (plan.actionId === "Contact") {
    targetEffects.enemySuspicion += 7;
    targetEffects.evidence += 1;
    return `联络员没能在${villageDefinition.name}找到可靠关系，只能撤回，并留下了可疑痕迹。`;
  }
  if (plan.actionId === "BuildBranch") {
    targetEffects.trust -= 2;
    targetEffects.enemySuspicion += 5;
    return `${villageDefinition.name}的骨干培养没有成熟，群众需要更多共同经历。`;
  }
  if (plan.actionId === "CounterRecon") {
    targetEffects.enemySuspicion += 3;
    return `${villageDefinition.name}的假线索没能骗过敌探。`;
  }
  if (plan.actionId === "Scout") {
    targetEffects.enemySuspicion += 5;
    return `侦察员未能确认${villageDefinition.name}附近敌情，行动痕迹反而增加。`;
  }
  if (plan.actionId === "Sabotage") {
    targetEffects.enemySuspicion += 14;
    targetEffects.evidence += 2;
    return `${villageDefinition.name}附近破袭未成，队伍撤出，但敌军加强了搜索。`;
  }
  if (plan.actionId === "CoverAmbush") {
    targetEffects.cover += 1;
    targetEffects.enemySuspicion += plan.options?.mode === "ambush" ? 10 : 5;
    targetEffects.evidence += plan.options?.mode === "ambush" ? 2 : 0;
    return `${villageDefinition.name}的武装行动未达预期，只争取到很短的转移时间。`;
  }
  return `${villageDefinition.name}的行动未能形成预期效果。`;
}

function ApplyEffectsToState(state, effects) {
  for (const villageDefinition of VILLAGE_DEFINITIONS) {
    const villageId = villageDefinition.id;
    const village = state.villages[villageId];
    const targetEffects = effects[villageId];
    village.livelihood = Clamp(village.livelihood + targetEffects.livelihood, 0, CFG.maximumLivelihood);
    village.trust = Clamp(village.trust + targetEffects.trust, 0, CFG.maximumTrust);
    village.organization = Clamp(village.organization + targetEffects.organization, 0, CFG.maximumOrganization);
    village.enemySuspicion = Clamp(village.enemySuspicion + targetEffects.enemySuspicion, 0, CFG.maximumEnemySuspicion);
    if (targetEffects.contacted) {
      village.contacted = true;
    }
    const knowledge = state.enemyKnowledge[villageId];
    knowledge.evidence = Clamp(knowledge.evidence + targetEffects.evidence, 0, 20);
    knowledge.confidence = Clamp(knowledge.confidence + targetEffects.confidence, 0, 100);
    if (targetEffects.evidence > 0) {
      knowledge.lastConfirmedTurn = state.turn;
      knowledge.evidenceLabels.push(`第${state.turn}回合行动痕迹`);
      knowledge.evidenceLabels = knowledge.evidenceLabels.slice(-5);
    } else if (targetEffects.evidence < 0 && knowledge.evidenceLabels.length > 0) {
      knowledge.evidenceLabels.splice(0, Math.min(knowledge.evidenceLabels.length, Math.abs(targetEffects.evidence)));
    }
    if (targetEffects.organization > 0 && targetEffects.evidence > 0) {
      knowledge.knownOrganization = Clamp(knowledge.knownOrganization + 1, 0, CFG.maximumOrganization);
    }
    if (targetEffects.counterRecon > 0 && knowledge.evidence === 0) {
      knowledge.knownOrganization = Math.max(0, knowledge.knownOrganization - 1);
    }
    if (targetEffects.intelligence > 0) {
      state.resources.intelligence = Clamp(state.resources.intelligence + targetEffects.intelligence, 0, CFG.maximumIntelligence);
    }
    if (targetEffects.immediateProtectedFamilies > 0) {
      const remainingFamilies = Math.max(0, villageDefinition.families - village.protectedFamilies);
      const newlyProtectedFamilies = Math.min(remainingFamilies, targetEffects.immediateProtectedFamilies);
      village.protectedFamilies += newlyProtectedFamilies;
      state.campaignMetrics.protectedFamilies += newlyProtectedFamilies;
    }
    if (targetEffects.routeDisruption > 0) {
      const routeState = state.routes[villageDefinition.routeId];
      routeState.currentDisruption = Clamp(routeState.currentDisruption + targetEffects.routeDisruption, 0, 6);
      routeState.totalDisruption += targetEffects.routeDisruption;
      state.campaignMetrics.routeDisruption += targetEffects.routeDisruption;
    }
  }
}

function GetScarReducedEffect(baseEffectiveness, scars) {
  const scarPenalty = Math.min(baseEffectiveness - 1, Math.floor(scars / 2));
  return {
    effectiveness: baseEffectiveness - scarPenalty,
    scarPenalty,
  };
}

function ResolvePopularInitiative(stateAfterActions, enemyIntent, effects) {
  const targetVillageId = enemyIntent.targetVillageId;
  const villageAfterActions = stateAfterActions.villages[targetVillageId];
  const targetEffects = effects[targetVillageId];
  const popularActions = [];
  const { organization, trust, livelihood, scars } = villageAfterActions;
  const villageName = GetVillageDefinition(targetVillageId).name;
  villageAfterActions.lastPopularActions = [];

  if (organization >= 1 && trust >= 40 && livelihood >= 20) {
    const effect = GetScarReducedEffect(2, scars);
    targetEffects.warning += effect.effectiveness;
    popularActions.push({
      id: "EarlyWarning",
      name: popularActionNames.EarlyWarning,
      villageId: targetVillageId,
      baseEffectiveness: 2,
      effectiveness: effect.effectiveness,
      scarPenalty: effect.scarPenalty,
      text: `${villageName}的儿童团和交通员自行接力报警。`,
    });
  }
  if (organization >= 2 && trust >= 50 && livelihood >= 30 && ["Requisition", "Sweep"].includes(enemyIntent.kind)) {
    const effect = GetScarReducedEffect(2, scars);
    targetEffects.hiddenGrain += effect.effectiveness;
    popularActions.push({
      id: "HideGrain",
      name: popularActionNames.HideGrain,
      villageId: targetVillageId,
      baseEffectiveness: 2,
      effectiveness: effect.effectiveness,
      scarPenalty: effect.scarPenalty,
      text: `${villageName}的藏粮组不等命令，把粮食分散到多处隐蔽点。`,
    });
  }
  if (organization >= 2 && trust >= 55 && livelihood >= 25 && ["Search", "Sweep"].includes(enemyIntent.kind)) {
    const effect = GetScarReducedEffect(2, scars);
    targetEffects.stretcher += effect.effectiveness;
    popularActions.push({
      id: "Stretcher",
      name: popularActionNames.Stretcher,
      villageId: targetVillageId,
      baseEffectiveness: 2,
      effectiveness: effect.effectiveness,
      scarPenalty: effect.scarPenalty,
      text: `${villageName}的担架队和救护组自行集结，准备抢救伤员。`,
    });
  }
  if (organization >= 3 && trust >= 60 && livelihood >= 20 && ["Search", "Sweep"].includes(enemyIntent.kind)) {
    const effect = GetScarReducedEffect(3, scars);
    targetEffects.tunnels += effect.effectiveness;
    popularActions.push({
      id: "Tunnels",
      name: popularActionNames.Tunnels,
      villageId: targetVillageId,
      baseEffectiveness: 3,
      effectiveness: effect.effectiveness,
      scarPenalty: effect.scarPenalty,
      text: `${villageName}启用连户地道，掩护群众在封锁中转移。`,
    });
  }
  villageAfterActions.lastPopularActions = popularActions.map((action) => action.id);
  stateAfterActions.campaignMetrics.popularActions += popularActions.length;
  return popularActions;
}

function GetEnemyThreatenedFamilies(enemyIntent) {
  const effectiveStrength = enemyIntent.effectiveStrength ?? enemyIntent.strength;
  const threatBonus = enemyIntent.threatBonus ?? 0;
  if (enemyIntent.kind === "Patrol") {
    return 2 + effectiveStrength + threatBonus;
  }
  if (enemyIntent.kind === "Requisition") {
    return 7 + effectiveStrength * 3 + threatBonus;
  }
  if (enemyIntent.kind === "Search") {
    return 5 + effectiveStrength * 2 + threatBonus;
  }
  return 10 + effectiveStrength * 3 + threatBonus;
}

function CalculateOccupationConsequences(
  enemyIntent,
  effectiveStrength,
  harmedFamilies,
  targetEffects,
  defenseScore,
  frustrated,
) {
  const isSearch = enemyIntent.kind === "Search";
  const isSweep = enemyIntent.kind === "Sweep";
  const isRequisition = enemyIntent.kind === "Requisition";
  const broadMitigation = Math.floor(defenseScore / 10) + (frustrated ? 1 : 0);
  const violentSeverity = effectiveStrength
    + (enemyIntent.scarPressure ?? 0)
    + (enemyIntent.burnSearch ? 1 : 0);
  let grainSeized = 0;
  if (isRequisition) {
    grainSeized = Math.ceil(harmedFamilies * 1.2)
      + (enemyIntent.livelihoodPressure ?? 0) * 2
      - targetEffects.hiddenGrain * 3
      - broadMitigation;
  } else if (isSweep) {
    grainSeized = Math.ceil(harmedFamilies * 0.5)
      + (enemyIntent.livelihoodPressure ?? 0)
      - targetEffects.hiddenGrain * 2
      - broadMitigation;
  } else if (enemyIntent.burnSearch) {
    grainSeized = Math.floor(harmedFamilies / 3) - targetEffects.hiddenGrain;
  }

  let homesBurned = 0;
  if (enemyIntent.burnSearch) {
    homesBurned = 1
      + Math.floor(effectiveStrength / 2)
      + Math.floor(harmedFamilies / 6)
      - targetEffects.evacuation
      - targetEffects.tunnels
      - broadMitigation;
  } else if (isSweep && (enemyIntent.scarPressure ?? 0) > 0) {
    homesBurned = Math.floor((harmedFamilies + (enemyIntent.scarPressure ?? 0) * 2) / 8)
      - Math.floor(targetEffects.tunnels / 2)
      - broadMitigation;
  }
  homesBurned = Math.max(0, homesBurned);

  const familiesDisplaced = Math.max(
    0,
    homesBurned
      + Math.floor(harmedFamilies / (isSweep ? 3 : 5))
      - targetEffects.evacuation
      - Math.floor(targetEffects.cover / 2)
      - broadMitigation,
  );
  const peopleWounded = Math.max(
    0,
    Math.floor(harmedFamilies / 3)
      + Math.floor(violentSeverity / 2)
      - targetEffects.stretcher
      - broadMitigation,
  );
  const peopleKilled = (isSearch || isSweep || enemyIntent.burnSearch)
    ? Math.max(
      0,
      Math.floor((harmedFamilies + violentSeverity + (enemyIntent.burnSearch ? 2 : 0)) / 8)
        - targetEffects.stretcher
        - Math.floor(targetEffects.tunnels / 2)
        - broadMitigation,
    )
    : 0;
  const peopleDetained = (isSearch || isSweep)
    ? Math.max(
      0,
      Math.floor(harmedFamilies / 4)
        + (enemyIntent.organizationPressure ?? 0)
        - targetEffects.counterRecon
        - targetEffects.tunnels
        - broadMitigation,
    )
    : 0;
  return {
    grainSeized: Math.max(0, grainSeized),
    homesBurned,
    familiesDisplaced,
    peopleWounded,
    peopleKilled,
    peopleDetained,
  };
}

function RecordOccupationConsequences(state, villageDefinition, requestedConsequences) {
  const village = state.villages[villageDefinition.id];
  village.occupationConsequences = {
    ...CreateEmptyOccupationConsequences(),
    ...(village.occupationConsequences ?? {}),
  };
  const recordedConsequences = CreateEmptyOccupationConsequences();
  const simpleLimits = {
    grainSeized: villageDefinition.families * 3,
    homesBurned: villageDefinition.families,
    familiesDisplaced: villageDefinition.families,
  };
  for (const fieldName of Object.keys(simpleLimits)) {
    const currentValue = Clamp(
      Math.trunc(village.occupationConsequences[fieldName] ?? 0),
      0,
      simpleLimits[fieldName],
    );
    const remainingValue = simpleLimits[fieldName] - currentValue;
    recordedConsequences[fieldName] = Math.min(
      remainingValue,
      Math.max(0, Math.trunc(requestedConsequences[fieldName] ?? 0)),
    );
    village.occupationConsequences[fieldName] = currentValue + recordedConsequences[fieldName];
  }

  let remainingPeople = villageDefinition.families * 4
    - peopleConsequenceFields.reduce(
      (sum, fieldName) => sum + Math.max(0, Math.trunc(village.occupationConsequences[fieldName] ?? 0)),
      0,
    );
  remainingPeople = Math.max(0, remainingPeople);
  for (const fieldName of peopleConsequenceFields) {
    recordedConsequences[fieldName] = Math.min(
      remainingPeople,
      Math.max(0, Math.trunc(requestedConsequences[fieldName] ?? 0)),
    );
    village.occupationConsequences[fieldName] = Math.max(
      0,
      Math.trunc(village.occupationConsequences[fieldName] ?? 0),
    ) + recordedConsequences[fieldName];
    remainingPeople -= recordedConsequences[fieldName];
  }
  for (const fieldName of occupationConsequenceFields) {
    state.campaignMetrics[fieldName] = Math.max(0, Math.trunc(state.campaignMetrics[fieldName] ?? 0))
      + recordedConsequences[fieldName];
  }
  return recordedConsequences;
}

function ResolveEnemyAction(state, enemyIntent, effects) {
  const villageId = enemyIntent.targetVillageId;
  const village = state.villages[villageId];
  const villageDefinition = GetVillageDefinition(villageId);
  const targetEffects = effects[villageId];
  const routeState = state.routes[villageDefinition.routeId];
  const routePenalty = Math.min(2, Math.floor(routeState.currentDisruption / 2));
  const effectiveStrength = Math.max(1, enemyIntent.strength - routePenalty);
  const adjustedIntent = { ...enemyIntent, effectiveStrength };
  const remainingThreatenableFamilies = Math.max(0, villageDefinition.families - village.harmedFamilies);
  const threatenedFamilies = Math.min(remainingThreatenableFamilies, GetEnemyThreatenedFamilies(adjustedIntent));
  const defenseScore = targetEffects.warning * 1.8
    + targetEffects.hiddenGrain * 2.2
    + targetEffects.evacuation * 2.1
    + targetEffects.counterRecon * 1.5
    + targetEffects.cover * 2.3
    + targetEffects.ambush * 1.7
    + targetEffects.stretcher * 1.2
    + targetEffects.tunnels * 2.4
    + routePenalty * 2;
  const protectedFamilyCandidates = Math.min(threatenedFamilies, Math.max(0, Math.floor(defenseScore * 0.82)));
  const harmedFamilyCandidates = Math.max(0, threatenedFamilies - protectedFamilyCandidates);
  const frustrationThreshold = Math.ceil(threatenedFamilies * 0.34);
  const frustrated = harmedFamilyCandidates <= frustrationThreshold
    || targetEffects.ambush + routePenalty >= 4
    || (enemyIntent.kind === "Search" && targetEffects.counterRecon >= 3);

  const remainingProtectableFamilies = Math.max(0, villageDefinition.families - village.protectedFamilies);
  const protectedFamilies = Math.min(remainingProtectableFamilies, protectedFamilyCandidates);
  const harmedFamilies = Math.min(remainingThreatenableFamilies, harmedFamilyCandidates);
  village.protectedFamilies += protectedFamilies;
  village.harmedFamilies += harmedFamilies;
  state.campaignMetrics.protectedFamilies += protectedFamilies;
  state.campaignMetrics.victimizedFamilies += harmedFamilies;

  let livelihoodLoss = 0;
  let trustLoss = 0;
  let scarsAdded = 0;
  if (enemyIntent.kind === "Patrol") {
    livelihoodLoss = harmedFamilies;
    trustLoss = harmedFamilies > 0 ? 1 : 0;
  } else if (enemyIntent.kind === "Requisition") {
    livelihoodLoss = harmedFamilies * 2
      + Math.max(0, 5 - targetEffects.hiddenGrain * 2)
      + (enemyIntent.livelihoodPressure ?? 0);
    trustLoss = Math.ceil(harmedFamilies / 4);
  } else if (enemyIntent.kind === "Search") {
    livelihoodLoss = harmedFamilies + (enemyIntent.livelihoodPressure ?? 0);
    trustLoss = Math.ceil(harmedFamilies / 3);
    scarsAdded = harmedFamilies >= 5 ? 1 : 0;
  } else {
    livelihoodLoss = harmedFamilies * 2 + (enemyIntent.livelihoodPressure ?? 0);
    trustLoss = Math.ceil(harmedFamilies / 3);
    scarsAdded = harmedFamilies > 0 ? (harmedFamilies >= 10 ? 2 : 1) : 0;
  }
  if (harmedFamilies > 0) {
    scarsAdded += enemyIntent.scarPressure ?? 0;
  }
  if (protectedFamilies > harmedFamilies && village.organization > 0) {
    village.trust = Clamp(village.trust + 2, 0, CFG.maximumTrust);
  }
  village.livelihood = Clamp(village.livelihood - livelihoodLoss, 0, CFG.maximumLivelihood);
  village.trust = Clamp(village.trust - trustLoss, 0, CFG.maximumTrust);
  village.scars = Clamp(village.scars + scarsAdded, 0, CFG.maximumScars);

  const organizationBefore = village.organization;
  const networkAttack = ["Search", "Sweep"].includes(enemyIntent.kind);
  const baseOrganizationPressure = enemyIntent.kind === "Sweep" ? 2 : enemyIntent.kind === "Search" ? 1 : 0;
  const organizationPressure = baseOrganizationPressure
    + (enemyIntent.organizationPressure ?? 0)
    + (effectiveStrength >= 5 ? 1 : 0)
    + (harmedFamilies >= 10 ? 1 : 0);
  const organizationDefense = targetEffects.counterRecon
    + targetEffects.tunnels
    + Math.floor(targetEffects.cover / 2);
  const severeNetworkHit = networkAttack
    && !frustrated
    && harmedFamilies >= 5
    && effectiveStrength >= 2
    && organizationPressure > organizationDefense;
  let organizationLoss = 0;
  if (severeNetworkHit && organizationBefore > 0) {
    organizationLoss = Math.min(organizationBefore, organizationPressure >= 5 ? 2 : 1);
    village.organization -= organizationLoss;
  }
  const contactBreak = severeNetworkHit
    && village.contacted
    && village.organization === 0
    && (effectiveStrength >= 4 || harmedFamilies >= 8 || (enemyIntent.organizationPressure ?? 0) >= 2);
  if (contactBreak) {
    village.contacted = false;
  }

  const occupationConsequences = RecordOccupationConsequences(
    state,
    villageDefinition,
    CalculateOccupationConsequences(
      enemyIntent,
      effectiveStrength,
      harmedFamilies,
      targetEffects,
      defenseScore,
      frustrated,
    ),
  );

  const knowledge = state.enemyKnowledge[villageId];
  if (frustrated) {
    knowledge.evidence = Math.max(0, knowledge.evidence - 1);
    knowledge.confidence = Math.max(0, knowledge.confidence - 8);
    village.enemySuspicion = Clamp(village.enemySuspicion - 4, 0, CFG.maximumEnemySuspicion);
  } else {
    knowledge.evidence = Clamp(knowledge.evidence + (harmedFamilies > 0 ? 1 : 0), 0, 20);
    knowledge.confidence = Clamp(knowledge.confidence + 6, 0, 100);
    knowledge.lastConfirmedTurn = state.turn;
    village.enemySuspicion = Clamp(village.enemySuspicion + 5, 0, CFG.maximumEnemySuspicion);
  }
  if (organizationLoss > 0 || contactBreak) {
    knowledge.knownOrganization = Math.min(knowledge.knownOrganization, village.organization);
    knowledge.evidenceLabels.push(`第${state.turn}回合地下联络受损`);
    knowledge.evidenceLabels = knowledge.evidenceLabels.slice(-5);
  }
  if (frustrated && enemyIntent.kind === "Requisition") {
    state.campaignMetrics.enemyRequisitionsFrustrated += 1;
  }
  if (frustrated && enemyIntent.kind === "Sweep") {
    state.campaignMetrics.enemySweepsFrustrated += 1;
  }
  const actionName = enemyKindNames[enemyIntent.kind];
  const familyResultText = frustrated
    ? `${villageDefinition.name}的${actionName}受挫：${protectedFamilies}户得到保护，${harmedFamilies}户受害。`
    : `${villageDefinition.name}遭到${actionName}：${protectedFamilies}户得到保护，${harmedFamilies}户受害。`;
  const networkResultText = organizationLoss > 0
    ? ` 地下组织损失${organizationLoss}级${contactBreak ? "，联络被切断。" : "。"}`
    : contactBreak
      ? " 地下联络被切断。"
      : "";
  const consequenceParts = [
    occupationConsequences.grainSeized > 0 ? `强征${occupationConsequences.grainSeized}份家庭口粮` : null,
    occupationConsequences.homesBurned > 0 ? `焚毁${occupationConsequences.homesBurned}户房屋` : null,
    occupationConsequences.familiesDisplaced > 0 ? `迫使${occupationConsequences.familiesDisplaced}户流离` : null,
    occupationConsequences.peopleWounded > 0 ? `造成${occupationConsequences.peopleWounded}人受伤` : null,
    occupationConsequences.peopleKilled > 0 ? `造成${occupationConsequences.peopleKilled}人死亡` : null,
    occupationConsequences.peopleDetained > 0 ? `拘押${occupationConsequences.peopleDetained}人` : null,
  ].filter(Boolean);
  const consequenceResultText = consequenceParts.length > 0
    ? ` 侵华日军占领行动另${consequenceParts.join("、")}。`
    : "";
  return {
    ...DeepClone(enemyIntent),
    kindName: actionName,
    baseStrength: enemyIntent.strength,
    effectiveStrength,
    routePenalty,
    threatenedFamilies,
    protectedFamilies,
    harmedFamilies,
    protectedFamilyCandidates,
    harmedFamilyCandidates,
    livelihoodLoss,
    trustLoss,
    scarsAdded,
    organizationBefore,
    organizationLoss,
    organizationAfter: village.organization,
    organizationPressure,
    organizationDefense,
    contactLost: contactBreak,
    ...occupationConsequences,
    perpetrator: "侵华日军占领部队",
    responsibility: "纵火、征粮、拘捕与伤亡均由侵华日军的占领政策和军事行动造成；群众抵抗不是这些暴行的责任来源。",
    defenseScore: Math.round(defenseScore * 10) / 10,
    frustrated,
    text: `${familyResultText}${networkResultText}${consequenceResultText}`,
  };
}

function ResolveTurnIncome(state) {
  const organizedVillages = Object.values(state.villages).filter((village) => village.organization >= 2 && village.livelihood >= 35);
  const supplyIncome = 1 + Math.floor(organizedVillages.length / 3);
  const intelligenceIncome = organizedVillages.length >= 2 ? 1 : 0;
  state.resources.supplies = Clamp(state.resources.supplies + supplyIncome, 0, CFG.maximumSupplies);
  state.resources.intelligence = Clamp(state.resources.intelligence + intelligenceIncome, 0, CFG.maximumIntelligence);
  for (const village of Object.values(state.villages)) {
    if (village.organization >= 2 && village.livelihood > 0) {
      village.livelihood = Clamp(village.livelihood + 1, 0, CFG.maximumLivelihood);
    }
  }
  return { supplies: supplyIncome, arms: 0, intelligence: intelligenceIncome };
}

function ResolveEndOfTurnDecay(state) {
  for (const villageDefinition of VILLAGE_DEFINITIONS) {
    const village = state.villages[villageDefinition.id];
    const knowledge = state.enemyKnowledge[villageDefinition.id];
    if (knowledge.evidence === 0) {
      village.enemySuspicion = Clamp(village.enemySuspicion - 1, 0, CFG.maximumEnemySuspicion);
      knowledge.confidence = Clamp(knowledge.confidence - 2, 0, 100);
    }
  }
  for (const routeState of Object.values(state.routes)) {
    routeState.currentDisruption = Math.max(0, routeState.currentDisruption - 1);
  }
}

function GetResourceDelta(beforeResources, afterResources) {
  return {
    supplies: afterResources.supplies - beforeResources.supplies,
    arms: afterResources.arms - beforeResources.arms,
    intelligence: afterResources.intelligence - beforeResources.intelligence,
  };
}

function GetMetricsDelta(beforeMetrics, afterMetrics) {
  const delta = {};
  for (const metricName of Object.keys(afterMetrics)) {
    delta[metricName] = afterMetrics[metricName] - (beforeMetrics[metricName] ?? 0);
  }
  return delta;
}

function ResolveTutorialProgress(state, playerActions) {
  const tutorialStep = GetTutorialDefinition(state.turn);
  if (!tutorialStep) {
    return null;
  }
  const focusAction = playerActions.find((action) => action.actionId === tutorialStep.focusActionId && action.success);
  state.tutorial.completedTurns.push(state.turn);
  if (focusAction) {
    if (!state.tutorial.completedFocusActions.includes(tutorialStep.focusActionId)) {
      state.tutorial.completedFocusActions.push(tutorialStep.focusActionId);
    }
  } else {
    state.tutorial.missedFocusActions.push({ turn: state.turn, actionId: tutorialStep.focusActionId });
  }
  return {
    turn: state.turn,
    focusActionId: tutorialStep.focusActionId,
    completed: Boolean(focusAction),
    text: focusAction
      ? `教学目标完成：${GetActionDefinition(tutorialStep.focusActionId).shortName}。`
      : `本回合没有完成“${GetActionDefinition(tutorialStep.focusActionId).shortName}”，但战局不会替玩家重来。`,
  };
}

export function ResolveTurn(state) {
  const nextState = DeepClone(state);
  if (!nextState || typeof nextState !== "object") {
    return nextState;
  }
  if (nextState.status !== "active") {
    nextState.lastCommand = { type: "ResolveTurn", success: false, reason: "十四回合剧本已经结算。" };
    return nextState;
  }
  const completedTurn = nextState.turn;
  const stateBeforeActions = DeepClone(nextState);
  const resourcesBefore = DeepClone(nextState.resources);
  const metricsBefore = DeepClone(nextState.campaignMetrics);
  const enemyIntent = GetEnemyIntentPreview(stateBeforeActions);
  const planningSummary = GetPlanningSummary(nextState);
  nextState.resources.supplies = Clamp(nextState.resources.supplies - planningSummary.reservedCosts.supplies, 0, CFG.maximumSupplies);
  nextState.resources.arms = Clamp(nextState.resources.arms - planningSummary.reservedCosts.arms, 0, CFG.maximumArms);
  nextState.resources.intelligence = Clamp(nextState.resources.intelligence - planningSummary.reservedCosts.intelligence, 0, CFG.maximumIntelligence);

  const effects = CreateVillageEffects();
  const canonicalPlans = [...nextState.plans].sort((leftPlan, rightPlan) => {
    const leftKey = `${leftPlan.actionId}|${leftPlan.villageId}|${leftPlan.options?.mode ?? ""}`;
    const rightKey = `${rightPlan.actionId}|${rightPlan.villageId}|${rightPlan.options?.mode ?? ""}`;
    return leftKey.localeCompare(rightKey, "en");
  });
  const playerActions = [];
  for (const plan of canonicalPlans) {
    const action = GetActionDefinition(plan.actionId);
    const chance = CalculateActionChance(stateBeforeActions, action, plan.villageId, plan.options);
    const roll = GetPlanRoll(stateBeforeActions, plan);
    const success = roll <= chance;
    const text = success
      ? ApplySuccessfulPlan(stateBeforeActions, plan, effects)
      : ApplyFailedPlan(stateBeforeActions, plan, effects);
    nextState.campaignMetrics[success ? "successfulActions" : "failedActions"] += 1;
    playerActions.push({
      planId: plan.id,
      actionId: plan.actionId,
      actionName: action.name,
      villageId: plan.villageId,
      villageName: GetVillageDefinition(plan.villageId).name,
      orderType: action.orderType,
      options: DeepClone(plan.options),
      chance,
      roll,
      success,
      text,
    });
  }
  ApplyEffectsToState(nextState, effects);
  const popularActions = ResolvePopularInitiative(nextState, enemyIntent, effects);
  const enemyReport = ResolveEnemyAction(nextState, enemyIntent, effects);
  const income = ResolveTurnIncome(nextState);
  const tutorialReport = ResolveTutorialProgress(nextState, playerActions);
  ResolveEndOfTurnDecay(nextState);

  for (const actionReport of playerActions) {
    AddHistoryEntry(nextState, {
      type: "PlayerAction",
      title: `${actionReport.actionName} · ${actionReport.villageName}`,
      text: actionReport.text,
      success: actionReport.success,
      actionId: actionReport.actionId,
      villageId: actionReport.villageId,
    });
  }
  for (const popularAction of popularActions) {
    AddHistoryEntry(nextState, {
      type: "PopularAction",
      title: popularAction.name,
      text: popularAction.text,
      villageId: popularAction.villageId,
    });
  }
  AddHistoryEntry(nextState, {
    type: "EnemyAction",
    title: `${enemyReport.kindName} · ${GetVillageDefinition(enemyReport.targetVillageId).name}`,
    text: enemyReport.text,
    villageId: enemyReport.targetVillageId,
    frustrated: enemyReport.frustrated,
  });

  nextState.plans = [];
  nextState.lastCommand = { type: "ResolveTurn", success: true, completedTurn };
  nextState.randomState = HashText(`${nextState.randomState}|${completedTurn}|Resolved`);
  nextState.lastResolution = {
    completedTurn,
    phase: GetPhaseForTurn(completedTurn),
    title: GetTurnDefinition(completedTurn).title,
    playerActions,
    popularActions,
    enemy: enemyReport,
    income,
    tutorial: tutorialReport,
    costsPaid: planningSummary.reservedCosts,
    resourceDelta: GetResourceDelta(resourcesBefore, nextState.resources),
    metricsDelta: GetMetricsDelta(metricsBefore, nextState.campaignMetrics),
    summary: enemyReport.text,
  };

  if (completedTurn >= CFG.maximumTurns) {
    nextState.status = "completed";
    nextState.phase = "completed";
    nextState.outcome = CalculateOutcome(nextState);
    nextState.lastResolution.outcome = DeepClone(nextState.outcome);
  } else {
    nextState.turn += 1;
    nextState.phase = GetPhaseForTurn(nextState.turn);
    nextState.turnDefinition = DeepClone(GetTurnDefinition(nextState.turn));
  }
  SyncUiSnapshots(nextState);
  return nextState;
}

export function CalculateOutcome(state) {
  const villages = VILLAGE_DEFINITIONS.map((villageDefinition) => state.villages[villageDefinition.id]);
  const averageLivelihood = villages.reduce((sum, village) => sum + village.livelihood, 0) / villages.length;
  const averageTrust = villages.reduce((sum, village) => sum + village.trust, 0) / villages.length;
  const averageOrganization = villages.reduce((sum, village) => sum + village.organization, 0) / villages.length;
  const averageScars = villages.reduce((sum, village) => sum + village.scars, 0) / villages.length;
  const metrics = state.campaignMetrics;
  const peopleScore = averageLivelihood / CFG.maximumLivelihood * 25;
  const trustScore = averageTrust / CFG.maximumTrust * 20;
  const organizationScore = averageOrganization / CFG.maximumOrganization * 25;
  const familyScore = Clamp(10 + metrics.protectedFamilies * 0.08 - metrics.victimizedFamilies * 0.15, 0, 15);
  const resistanceScore = Clamp(
    metrics.enemyRequisitionsFrustrated * 3
      + metrics.enemySweepsFrustrated * 3
      + metrics.routeDisruption * 1.5,
    0,
    15,
  );
  const scarPenalty = averageScars / CFG.maximumScars * 10;
  const total = Clamp(Math.round(peopleScore + trustScore + organizationScore + familyScore + resistanceScore - scarPenalty), 0, 100);

  let tier = "WoundedEmbers";
  let title = "山河带伤，火种未灭";
  let summary = "村庄付出惨重代价，组织网络未能充分生根；幸存者仍保存着继续抵抗的火种。";
  if (total >= 75) {
    tier = "GreatWallOfPeople";
    title = "人民筑成新的长城";
    summary = "不是一支孤军守住了十个村庄，而是群众自己成为预警、交通、救护和隐蔽的网络。";
  } else if (total >= 45) {
    tier = "EnduringBaseArea";
    title = "在残酷围困中扎下根";
    summary = "扫荡留下伤痕，但多数乡亲活了下来，支部和交通关系仍能支撑长期抵抗。";
  }
  return {
    tier,
    title,
    summary,
    total,
    components: {
      livelihood: Math.round(peopleScore),
      trust: Math.round(trustScore),
      organization: Math.round(organizationScore),
      familyProtection: Math.round(familyScore),
      resistance: Math.round(resistanceScore),
      scarPenalty: Math.round(scarPenalty),
    },
    averages: {
      livelihood: Math.round(averageLivelihood * 10) / 10,
      trust: Math.round(averageTrust * 10) / 10,
      organization: Math.round(averageOrganization * 10) / 10,
      scars: Math.round(averageScars * 10) / 10,
    },
    facts: {
      protectedFamilies: metrics.protectedFamilies,
      victimizedFamilies: metrics.victimizedFamilies,
      enemyRequisitionsFrustrated: metrics.enemyRequisitionsFrustrated,
      enemySweepsFrustrated: metrics.enemySweepsFrustrated,
      routeDisruption: metrics.routeDisruption,
      grainSeized: metrics.grainSeized,
      homesBurned: metrics.homesBurned,
      familiesDisplaced: metrics.familiesDisplaced,
      peopleWounded: metrics.peopleWounded,
      peopleKilled: metrics.peopleKilled,
      peopleDetained: metrics.peopleDetained,
    },
  };
}

function QueueFirstAvailable(state, candidates) {
  let nextState = state;
  for (const candidate of candidates) {
    const availability = GetActionAvailability(nextState, candidate.actionId, candidate.villageId, candidate.options ?? candidate.mode);
    if (!availability.available) {
      continue;
    }
    nextState = QueueAction(nextState, candidate.actionId, candidate.villageId, candidate.options ?? candidate.mode);
    return nextState;
  }
  return nextState;
}

function BuildDefaultPlans(state) {
  let plannedState = DeepClone(state);
  const enemyIntent = GetEnemyIntentPreview(state);
  const targetVillage = state.villages[enemyIntent.targetVillageId];
  const contactedDefinitions = VILLAGE_DEFINITIONS.filter((definition) => state.villages[definition.id].contacted);
  const lowLivelihood = [...contactedDefinitions].sort((left, right) => state.villages[left.id].livelihood - state.villages[right.id].livelihood);
  const buildable = [...contactedDefinitions].sort((left, right) => state.villages[right.id].trust - state.villages[left.id].trust);
  const contactable = VILLAGE_DEFINITIONS.filter((definition) => {
    if (state.villages[definition.id].contacted) {
      return false;
    }
    return definition.neighbors.some((neighborId) => state.villages[neighborId].contacted);
  });

  const tutorialStep = GetTutorialDefinition(state.turn);
  if (tutorialStep) {
    plannedState = QueueFirstAvailable(plannedState, tutorialStep.recommendedActions.map((recommendation) => ({
      actionId: recommendation.actionId,
      villageId: recommendation.villageId,
      options: recommendation.mode ? { mode: recommendation.mode } : {},
    })));
  }
  const cadreCandidates = [
    ...(targetVillage?.contacted ? [
      { actionId: "HideAndEvacuate", villageId: enemyIntent.targetVillageId },
      { actionId: "CounterRecon", villageId: enemyIntent.targetVillageId },
    ] : []),
    ...lowLivelihood.map((definition) => ({ actionId: "Relief", villageId: definition.id })),
    ...buildable.map((definition) => ({ actionId: "BuildBranch", villageId: definition.id })),
    ...contactable.map((definition) => ({ actionId: "Contact", villageId: definition.id })),
  ];
  while (GetPlanningSummary(plannedState).remainingOrders.cadre > 0) {
    const previousPlanCount = plannedState.plans.length;
    plannedState = QueueFirstAvailable(plannedState, cadreCandidates);
    if (plannedState.plans.length === previousPlanCount) {
      break;
    }
  }
  if (GetPlanningSummary(plannedState).remainingOrders.armed > 0) {
    const armedCandidates = [
      ...(targetVillage?.contacted ? [
        { actionId: "CoverAmbush", villageId: enemyIntent.targetVillageId, options: { mode: "cover" } },
        { actionId: "Scout", villageId: enemyIntent.targetVillageId },
      ] : []),
      ...contactedDefinitions.map((definition) => ({ actionId: state.turn >= 6 ? "Sabotage" : "Scout", villageId: definition.id })),
      ...contactedDefinitions.map((definition) => ({ actionId: "Scout", villageId: definition.id })),
    ];
    plannedState = QueueFirstAvailable(plannedState, armedCandidates);
  }
  return plannedState;
}

function NormalizeStrategyPlans(strategyResult) {
  if (Array.isArray(strategyResult)) {
    return strategyResult;
  }
  if (Array.isArray(strategyResult?.plans)) {
    return strategyResult.plans;
  }
  return [];
}

export function RunDeterministicSimulation(options = {}) {
  const initialState = options.initialState ? DeepClone(options.initialState) : CreateInitialState(options.seed ?? CFG.defaultSeed);
  let state = initialState;
  const turnReports = [];
  let safetyCounter = 0;
  while (state.status === "active" && safetyCounter < CFG.maximumTurns + 2) {
    let plannedState;
    if (typeof options.strategy === "function") {
      const strategyResult = options.strategy(DeepClone(state), {
        actions: DeepClone(ACTION_DEFINITIONS),
        villages: DeepClone(VILLAGE_DEFINITIONS),
        enemyIntent: GetEnemyIntentPreview(state),
        tutorialStep: GetTutorialStep(state),
      });
      plannedState = DeepClone(state);
      for (const plan of NormalizeStrategyPlans(strategyResult)) {
        plannedState = QueueAction(plannedState, plan.actionId, plan.villageId, plan.options ?? plan.mode);
      }
    } else {
      plannedState = BuildDefaultPlans(state);
    }
    state = ResolveTurn(plannedState);
    turnReports.push(DeepClone(state.lastResolution));
    safetyCounter += 1;
  }
  const outcome = state.outcome ?? CalculateOutcome(state);
  return {
    state,
    finalState: state,
    outcome,
    turnReports,
    resolvedTurns: turnReports.length,
    signature: `${state.seed}:${turnReports.length}:${outcome.tier}:${outcome.total}:${state.campaignMetrics.protectedFamilies}:${state.campaignMetrics.victimizedFamilies}`,
  };
}

export const RULES_METADATA = Object.freeze({
  title: "太行：人民战争",
  subtitle: "十四回合敌后抗战白盒",
  historyScope: "村名与局部战局为教学性合成，不对应某次具体作战复盘。规则强调敌后群众工作、反扫荡与长期战争的历史逻辑。",
  victoryStatement: "保存群众、建立组织、挫败征粮和扫荡，比占领地图更重要。",
});
