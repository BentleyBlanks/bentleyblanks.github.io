export const gameConfig = Object.freeze({
  version: 1,
  maxTurns: 8,
  commandBudget: 4,
  maximumMetric: 100,
  saveKey: "resistancecommand1937_campaign_v1",
  checkpointKey: "resistancecommand1937_checkpoint_v1",
});

export const regionDefinitions = Object.freeze([
  {
    id: "ShaanGanNing",
    name: "陕甘宁后方",
    shortName: "陕甘宁",
    theatre: "敌后战略后方",
    x: 18,
    y: 51,
    terrain: "黄土高原与河谷",
    trait: "后方中枢：为各敌后区输送干部、制度经验与有限物资。",
    rail: false,
    initial: { network: 4, support: 76, pressure: 22, exposure: 24, damage: 6, baseLevel: 3 },
    links: ["JinSui"],
  },
  {
    id: "JinSui",
    name: "晋绥敌后区",
    shortName: "晋绥",
    theatre: "黄河东岸",
    x: 34,
    y: 36,
    terrain: "山地、河谷与交通隘口",
    trait: "连接后方与华北的西部走廊，封锁压力高，但山地利于保存力量。",
    rail: true,
    initial: { network: 2, support: 54, pressure: 58, exposure: 34, damage: 14, baseLevel: 2 },
    links: ["ShaanGanNing", "JinChaJi", "JinJiLuYu"],
  },
  {
    id: "JinChaJi",
    name: "晋察冀敌后区",
    shortName: "晋察冀",
    theatre: "华北北部",
    x: 52,
    y: 23,
    terrain: "山区、平原与铁路网",
    trait: "深入敌占区的战略支点，群众网络广，却长期面对据点、封锁沟与扫荡。",
    rail: true,
    initial: { network: 3, support: 62, pressure: 64, exposure: 46, damage: 18, baseLevel: 2 },
    links: ["JinSui", "JinJiLuYu", "Shandong", "Northeast"],
  },
  {
    id: "JinJiLuYu",
    name: "晋冀鲁豫敌后区",
    shortName: "晋冀鲁豫",
    theatre: "太行与冀南",
    x: 49,
    y: 49,
    terrain: "太行山、冀南平原",
    trait: "平汉、正太交通线交错，是破袭、反扫荡与支援全国战局的枢纽。",
    rail: true,
    initial: { network: 3, support: 58, pressure: 67, exposure: 51, damage: 20, baseLevel: 2 },
    links: ["JinSui", "JinChaJi", "Shandong", "CentralChina"],
  },
  {
    id: "Shandong",
    name: "山东敌后区",
    shortName: "山东",
    theatre: "津浦线以东",
    x: 70,
    y: 39,
    terrain: "丘陵、平原与沿海交通线",
    trait: "铁路、公路与据点密集；任何扩展都必须经受高强度治安战。",
    rail: true,
    initial: { network: 2, support: 48, pressure: 72, exposure: 39, damage: 22, baseLevel: 1 },
    links: ["JinChaJi", "JinJiLuYu", "CentralChina"],
  },
  {
    id: "CentralChina",
    name: "华中敌后区",
    shortName: "华中",
    theatre: "长江与淮河之间",
    x: 64,
    y: 65,
    terrain: "湖荡、水网与平原",
    trait: "新四军活动区域，水网利于隐蔽，也使交通、医疗和补给格外脆弱。",
    rail: true,
    initial: { network: 2, support: 45, pressure: 71, exposure: 35, damage: 24, baseLevel: 1 },
    links: ["JinJiLuYu", "Shandong", "SouthChina"],
  },
  {
    id: "SouthChina",
    name: "华南敌后联络区",
    shortName: "华南",
    theatre: "华南交通沿线",
    x: 68,
    y: 86,
    terrain: "丘陵、河网与沿海城镇",
    trait: "网络稀疏、距离遥远；每一条交通线都靠基层组织一点点接续。",
    rail: true,
    initial: { network: 1, support: 34, pressure: 76, exposure: 23, damage: 17, baseLevel: 0 },
    links: ["CentralChina"],
  },
  {
    id: "Northeast",
    name: "东北抗日联络区",
    shortName: "东北",
    theatre: "东北山林",
    x: 76,
    y: 13,
    terrain: "严寒山林与漫长交通线",
    trait: "长期隔绝且损耗惨重；建立联系本身就是一场艰苦斗争。",
    rail: true,
    initial: { network: 1, support: 31, pressure: 84, exposure: 20, damage: 30, baseLevel: 0 },
    links: ["JinChaJi"],
  },
]);

export const productionDefinitions = Object.freeze([
  {
    id: "Supplies",
    name: "粮药优先",
    allocation: "3 民生 · 2 军械 · 1 情报",
    description: "优先保住粮食、药品与群众转移能力。",
    output: { grain: 9, arms: 3, intelligence: 2 },
  },
  {
    id: "Arms",
    name: "军械优先",
    allocation: "2 民生 · 3 军械 · 1 情报",
    description: "扩大修械与弹药生产，但民生储备更薄。",
    output: { grain: 6, arms: 6, intelligence: 2 },
  },
  {
    id: "Intelligence",
    name: "交通情报",
    allocation: "2 民生 · 1 军械 · 3 情报",
    description: "把有限人力投向交通站、侦察与地下联络。",
    output: { grain: 6, arms: 3, intelligence: 6 },
  },
]);

export const stanceDefinitions = Object.freeze([
  {
    id: "PeopleFirst",
    name: "群众保存",
    description: "疏散、救济和基层工作效果更强；军事贡献略慢。",
  },
  {
    id: "Disruption",
    name: "交通破袭",
    description: "破袭与迟滞更有力，但暴露增长更快。",
  },
  {
    id: "Recovery",
    name: "生产恢复",
    description: "本期生产与受创修复更强，主动牵制效果略弱。",
  },
]);

export const actionDefinitions = Object.freeze([
  {
    id: "Organize",
    name: "建立基层组织",
    shortName: "建组织",
    command: 1,
    cost: { grain: 2, organization: 3 },
    category: "civil",
    description: "由党支部、群众组织到民兵网络，提升情报、供给、疏散与恢复能力。",
    risk: "组织越公开，暴露也会升高。",
  },
  {
    id: "Evacuate",
    name: "转移群众与机关",
    shortName: "疏散",
    command: 1,
    cost: { grain: 4, organization: 2 },
    category: "civil",
    description: "提前转移群众、医院与干部，显著降低本期及下期扫荡伤害。",
    risk: "离村会损失生产，并形成流离之苦。",
  },
  {
    id: "SecureGrain",
    name: "坚壁粮食与种粮",
    shortName: "坚壁粮食",
    command: 1,
    cost: { grain: 2, organization: 2 },
    category: "civil",
    description: "分散粮库、隐藏种粮，减少强征与封锁造成的粮食损失。",
    risk: "需要干部和群众承担额外运输。",
  },
  {
    id: "Restore",
    name: "救济与恢复生产",
    shortName: "救济重建",
    command: 1,
    cost: { grain: 5, organization: 2 },
    category: "civil",
    description: "救济受创家庭，修复交通站、农具与秘密医疗点。",
    risk: "需要消耗本就紧张的粮药。",
  },
  {
    id: "Recon",
    name: "侦察敌军部署",
    shortName: "侦察",
    command: 1,
    cost: { intelligence: 1, organization: 1 },
    category: "intel",
    description: "核实该区敌军动向，提高预警并削弱突袭效果。",
    risk: "交通员被发现会增加少量暴露。",
  },
  {
    id: "Sabotage",
    name: "破袭铁路与公路",
    shortName: "破袭交通",
    command: 2,
    cost: { arms: 3, intelligence: 2, organization: 2 },
    category: "military",
    description: "破坏运输、削弱侵华日军补给，并牵制其本可投入正面战场的兵力。",
    risk: "侵略军可能以此为借口升级报复性暴行，责任完全在侵略者。",
  },
  {
    id: "Ambush",
    name: "游击伏击与迟滞",
    shortName: "伏击迟滞",
    command: 2,
    cost: { arms: 4, intelligence: 1, organization: 3 },
    category: "military",
    description: "不争一城一地，用伏击和外线机动迟滞扫荡、牵制敌军。",
    risk: "准备不足会造成难以补充的骨干损失。",
  },
  {
    id: "Conceal",
    name: "化整为零",
    shortName: "隐蔽休整",
    command: 1,
    cost: {},
    category: "survival",
    description: "停止公开活动、分散隐蔽，降低暴露并恢复少量组织。",
    risk: "本期几乎不增加战略贡献。",
  },
]);

export const focusDefinitions = Object.freeze([
  {
    id: "MassLine",
    name: "群众路线",
    duration: 2,
    prerequisites: [],
    branch: "组织人民",
    description: "基层组织行动更有效；联网地区每期额外恢复组织力。",
  },
  {
    id: "ReduceRent",
    name: "减租减息",
    duration: 2,
    prerequisites: ["MassLine"],
    branch: "组织人民",
    description: "提升群众支持与粮药生产，使长期动员有物质基础。",
  },
  {
    id: "TunnelWarfare",
    name: "地道战与预警网",
    duration: 2,
    prerequisites: ["MassLine"],
    branch: "保存力量",
    description: "扫荡造成的人民与组织损失降低，疏散准备持续更久。",
  },
  {
    id: "LeanAdministration",
    name: "精兵简政",
    duration: 2,
    prerequisites: [],
    branch: "保存力量",
    description: "减少维持负担，困难时期仍能保存干部与武装骨干。",
  },
  {
    id: "MineWarfare",
    name: "地雷战与麻雀战",
    duration: 2,
    prerequisites: ["LeanAdministration"],
    branch: "主动牵制",
    description: "游击迟滞更有效，以较小力量迫使敌军投入更多守备。",
  },
  {
    id: "IntelligenceNetwork",
    name: "交通站与情报网",
    duration: 2,
    prerequisites: [],
    branch: "主动牵制",
    description: "提高情报产出和敌情置信度，侦察行动更安全。",
  },
  {
    id: "ProductionDrive",
    name: "大生产运动",
    duration: 2,
    prerequisites: ["ReduceRent"],
    branch: "持久抗战",
    description: "粮药产出提高，受创地区的恢复速度加快。",
  },
  {
    id: "StrategicCounteroffensive",
    name: "战略反攻准备",
    duration: 1,
    prerequisites: ["MineWarfare", "IntelligenceNetwork"],
    branch: "持久抗战",
    description: "1944年后把长期积累的网络、情报和群众武装转化为反攻贡献。",
  },
]);

export const chapterDefinitions = Object.freeze([
  {
    id: "OpenRear",
    period: "1937—1938",
    date: "1938年春",
    title: "挺进敌后",
    subtitle: "大城市与交通线相继陷落，敌后不是空白，而是要从群众中重新组织起来的战场。",
    history: "全面抗战爆发后，八路军、新四军深入敌后，建立抗日根据地和基层组织。正面战场牵住侵华日军主力，敌后战场开始在其占领体系内部生根。",
    enemyKind: "据点扩张",
    intensity: 40,
    targetCount: 1,
    choices: [
      { id: "CadresFirst", name: "干部先行建联络点", effect: "本期基层组织效果增强，但干部更紧张。", tone: "network" },
      { id: "MountainAdvance", name: "主力开辟山区", effect: "立即增加牵制与战场韧性，但消耗军械。", tone: "military" },
      { id: "ProtectVillages", name: "联合群众先行转移", effect: "人民安全与疏散效果提高，但消耗粮药。", tone: "people" },
    ],
  },
  {
    id: "Blockade",
    period: "1939",
    date: "1939年秋",
    title: "封锁线合拢",
    subtitle: "铁路、公路、据点与封锁沟把根据地切割成块，交通员每过一道线都可能失联。",
    history: "侵华日军逐步加密据点和交通线，试图以点线控制广大乡村。敌后根据地必须在分散与联结之间找到生存方式。",
    enemyKind: "封锁清乡",
    intensity: 48,
    targetCount: 1,
    choices: [
      { id: "ScatterGranaries", name: "分散粮库", effect: "本期被强征的粮食显著减少，生产略受影响。", tone: "people" },
      { id: "CrossBlockade", name: "穿越封锁沟", effect: "降低各区暴露并获得情报，但消耗组织力。", tone: "network" },
      { id: "ConsolidateCore", name: "巩固中心区", effect: "抗战韧性上升，外围扩展暂缓。", tone: "recovery" },
    ],
  },
  {
    id: "RailCampaign",
    period: "1940",
    date: "1940年秋",
    title: "破袭交通",
    subtitle: "破坏铁路能打击侵略军运输、振奋全国抗战信心；侵略军却以此为借口升级报复性暴行，责任完全在侵略者。",
    history: "1940年前后，华北敌后军民开展大规模交通破袭。史实中的破袭是本期固定背景；玩家的地区命令抽象的是怎样保障补给、医疗和群众转移，以承担随之而来的压力。",
    enemyKind: "交通线反击",
    intensity: 57,
    targetCount: 2,
    choices: [
      { id: "SabotageCover", name: "铁路破袭保障", effect: "破袭与伏击贡献提高，军械消耗加重。", tone: "military" },
      { id: "MedicalSupport", name: "医疗与补给保障", effect: "本期人民受创降低，粮药储备减少。", tone: "people" },
      { id: "EarlyEvacuation", name: "暴露区先行疏散", effect: "把最危险地区提前疏散，牺牲部分生产。", tone: "network" },
    ],
  },
  {
    id: "RetaliatorySweeps",
    period: "1941",
    date: "1941年冬",
    title: "报复性扫荡",
    subtitle: "兵力、粮药与交通线都被压缩；公开迎战往往正中敌人合围之计。",
    history: "侵华日军扩大所谓“治安强化”，以扫荡、封锁、焚毁和屠杀打击敌后军民。侵略者对平民暴行负全部责任，抵抗从来不是暴行的原因。",
    enemyKind: "分进合击",
    intensity: 67,
    targetCount: 2,
    choices: [
      { id: "VillageWarning", name: "村庄预警优先", effect: "情报下沉到村，显著减少人民受创。", tone: "people" },
      { id: "MoveInstitutions", name: "医院与机关转移", effect: "保护组织中枢并降低长期受创。", tone: "network" },
      { id: "OuterLineDiversion", name: "主力外线牵制", effect: "削弱合围、增加贡献，但骨干承担更大损耗。", tone: "military" },
    ],
  },
  {
    id: "HardestYear",
    period: "1942",
    date: "1942年夏",
    title: "最困难时期",
    subtitle: "封锁、灾荒、断粮与大扫荡叠加。守住种粮、伤员和组织，比漂亮战果更重要。",
    history: "1942年前后，华北多地经历极其严酷的“扫荡”和“蚕食”。本作只抽象呈现受创与流离，不以平民伤亡换取分数或资源。",
    enemyKind: "铁壁合围",
    intensity: 78,
    targetCount: 3,
    choices: [
      { id: "KeepSeedGrain", name: "保住种粮", effect: "眼前粮食更紧，后续生产与民生恢复更快。", tone: "recovery" },
      { id: "ArmyRationing", name: "军队减粮", effect: "部队战备下降，用有限粮食优先保护群众。", tone: "people" },
      { id: "ConcentrateMedicine", name: "集中药品救治", effect: "降低本期伤害与长期受创，主动行动变少。", tone: "network" },
    ],
  },
  {
    id: "Rebuild",
    period: "1943",
    date: "1943年秋",
    title: "生产与重建",
    subtitle: "困难没有突然消失。恢复农具、交通站和卫生体系，才能让基层网络重新连起来。",
    history: "根据地通过精兵简政、生产自救和基层建设逐步恢复元气。恢复不是把创伤清零，而是让人民重新获得坚持下去的条件。",
    enemyKind: "蚕食封锁",
    intensity: 61,
    targetCount: 2,
    choices: [
      { id: "MassProduction", name: "军民生产", effect: "补充粮药与组织，公开活动略增暴露。", tone: "recovery" },
      { id: "RepairStations", name: "修复交通站", effect: "提高情报并重接一处薄弱网络。", tone: "network" },
      { id: "TrainMedics", name: "培训卫生员", effect: "建立持续医疗能力，之后受创降低。", tone: "people" },
    ],
  },
  {
    id: "Counteroffensive",
    period: "1944",
    date: "1944年冬",
    title: "局部反攻",
    subtitle: "侵华日军兵力吃紧，孤立据点增多。反攻不是一条直线，扩张过快同样会拉断补给。",
    history: "随着世界反法西斯战争发展和敌后力量恢复，多个敌后战场转入局部反攻。长期基层建设开始转化为更大的战略主动。",
    enemyKind: "收缩清剿",
    intensity: 54,
    targetCount: 2,
    choices: [
      { id: "RestoreVillages", name: "恢复受创村庄", effect: "优先修复民生，战略扩张更稳。", tone: "people" },
      { id: "RemoveStrongpoints", name: "拔除孤立据点", effect: "大幅削弱敌补给并增加贡献，消耗军械。", tone: "military" },
      { id: "ExpandBases", name: "扩展新根据地", effect: "提升薄弱区网络，但组织线被拉长。", tone: "network" },
    ],
  },
  {
    id: "FinalVictory",
    period: "1945",
    date: "1945年8月",
    title: "最后的坚持",
    subtitle: "全国抗战即将迎来胜利。最后一批粮药、干部与武装该投向哪里？",
    history: "1945年8月15日，日本宣布无条件投降。这个史实不会被玩家改写；本局结算的是敌后战场怎样坚持、牵制并保护人民走到胜利。",
    enemyKind: "垂死挣扎",
    intensity: 46,
    targetCount: 2,
    choices: [
      { id: "ReliefDemobilize", name: "救济与复员", effect: "优先救助受创家庭、安置流离群众。", tone: "people" },
      { id: "TakeTransport", name: "接管交通节点", effect: "扩大最终战略贡献并削弱残余运输。", tone: "military" },
      { id: "LinkOrganizations", name: "接应各区组织", effect: "修复薄弱网络并保存干部档案。", tone: "network" },
    ],
  },
]);

const crisisChoiceCosts = Object.freeze({
  CadresFirst: { organization: 2 },
  MountainAdvance: { arms: 2 },
  ProtectVillages: { grain: 3 },
  ScatterGranaries: { grain: 2 },
  CrossBlockade: { organization: 3 },
  ConsolidateCore: {},
  SabotageCover: { arms: 2 },
  MedicalSupport: { grain: 3 },
  EarlyEvacuation: { organization: 2 },
  VillageWarning: { intelligence: 2 },
  MoveInstitutions: { grain: 3, organization: 1 },
  OuterLineDiversion: { arms: 3, organization: 2 },
  KeepSeedGrain: { grain: 4 },
  ArmyRationing: {},
  ConcentrateMedicine: { grain: 3 },
  MassProduction: {},
  RepairStations: { organization: 2 },
  TrainMedics: { grain: 2 },
  RestoreVillages: { grain: 4 },
  RemoveStrongpoints: { arms: 4 },
  ExpandBases: { organization: 4 },
  ReliefDemobilize: { grain: 4 },
  TakeTransport: { arms: 3 },
  LinkOrganizations: { organization: 3 },
});

function Clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function Round(value, digits = 0) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function HashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

function RandomValue(state, salt) {
  return HashString(`${state.seed}:${state.turn}:${salt}`) / 4294967295;
}

function FindDefinition(definitions, definitionId) {
  return definitions.find((definition) => definition.id === definitionId) || null;
}

function EmptyCost() {
  return { grain: 0, arms: 0, organization: 0, intelligence: 0 };
}

function AddCost(target, source, multiplier = 1) {
  for (const resourceId of Object.keys(target)) {
    target[resourceId] += (source[resourceId] || 0) * multiplier;
  }
  return target;
}

function ApplyResourceDelta(state, resourceId, delta) {
  state.resources[resourceId] = Clamp(Round(state.resources[resourceId] + delta), 0, 999);
}

function ApplyNationalDelta(state, metricId, delta) {
  state.national[metricId] = Clamp(Round(state.national[metricId] + delta, 1), 0, gameConfig.maximumMetric);
}

function CreateRegionState(definition) {
  return {
    id: definition.id,
    network: definition.initial.network,
    support: definition.initial.support,
    pressure: definition.initial.pressure,
    exposure: definition.initial.exposure,
    damage: definition.initial.damage,
    baseLevel: definition.initial.baseLevel,
    prepared: {
      evacuation: 0,
      grain: 0,
      recon: 0,
      delay: 0,
    },
    lastActionIds: [],
    lastEnemyOutcome: null,
  };
}

export function GetChapter(state) {
  return chapterDefinitions[Math.min(state.turn, chapterDefinitions.length - 1)];
}

export function GetCrisisChoiceCost(choiceId) {
  return Clone(crisisChoiceCosts[choiceId] || {});
}

export function GetRegionDefinition(regionId) {
  return FindDefinition(regionDefinitions, regionId);
}

export function GetRegion(state, regionId) {
  return state.regions[regionId] || null;
}

export function GetConnectedRegionIds(state) {
  const origin = "ShaanGanNing";
  const visited = new Set();
  const queue = [];
  if (state.regions[origin]?.network > 0) {
    visited.add(origin);
    queue.push(origin);
  }
  while (queue.length) {
    const regionId = queue.shift();
    const definition = GetRegionDefinition(regionId);
    for (const linkedId of definition.links) {
      if (visited.has(linkedId) || state.regions[linkedId]?.network <= 0) continue;
      visited.add(linkedId);
      queue.push(linkedId);
    }
  }
  return [...visited];
}

export function GetNetworkSummary(state) {
  const regionStates = Object.values(state.regions);
  const connectedRegionIds = GetConnectedRegionIds(state);
  return {
    connectedRegionIds,
    connectedCount: connectedRegionIds.length,
    organizedCount: regionStates.filter((region) => region.network >= 1).length,
    consolidatedCount: regionStates.filter((region) => region.network >= 3).length,
    averageNetwork: Round(regionStates.reduce((sum, region) => sum + region.network, 0) / regionStates.length, 2),
    averageSupport: Round(regionStates.reduce((sum, region) => sum + region.support, 0) / regionStates.length, 1),
    averageDamage: Round(regionStates.reduce((sum, region) => sum + region.damage, 0) / regionStates.length, 1),
  };
}

function GetFocusModifiers(state) {
  const completed = new Set(state.completedFocusIds);
  return {
    organizeBonus: completed.has("MassLine") ? 3 : 0,
    organizationIncome: completed.has("MassLine") ? 2 : 0,
    supportIncome: completed.has("ReduceRent") ? 1 : 0,
    grainMultiplier: completed.has("ReduceRent") ? 1.12 : 1,
    enemyHarmMultiplier: completed.has("TunnelWarfare") ? 0.78 : 1,
    evacuationDurationBonus: completed.has("TunnelWarfare") ? 1 : 0,
    maintenanceReduction: completed.has("LeanAdministration") ? 3 : 0,
    ambushBonus: completed.has("MineWarfare") ? 5 : 0,
    intelligenceIncome: completed.has("IntelligenceNetwork") ? 3 : 0,
    previewBonus: completed.has("IntelligenceNetwork") ? 7 : 0,
    productionMultiplier: completed.has("ProductionDrive") ? 1.2 : 1,
    restorationBonus: completed.has("ProductionDrive") ? 6 : 0,
    counteroffensiveBonus: completed.has("StrategicCounteroffensive") ? 10 : 0,
  };
}

function GetStanceModifiers(state) {
  if (state.stanceId === "Disruption") {
    return { civilMultiplier: 0.92, militaryMultiplier: 1.25, exposureShift: 3, productionMultiplier: 1 };
  }
  if (state.stanceId === "Recovery") {
    return { civilMultiplier: 1.08, militaryMultiplier: 0.88, exposureShift: -1, productionMultiplier: 1.2 };
  }
  return { civilMultiplier: 1.25, militaryMultiplier: 0.92, exposureShift: -1, productionMultiplier: 1 };
}

export function CalculateProductionForecast(state) {
  const production = FindDefinition(productionDefinitions, state.productionId) || productionDefinitions[0];
  const focusModifiers = GetFocusModifiers(state);
  const stanceModifiers = GetStanceModifiers(state);
  const networkSummary = GetNetworkSummary(state);
  const connectedYield = networkSummary.connectedRegionIds.reduce((sum, regionId) => {
    const region = state.regions[regionId];
    return sum + Math.max(0, region.network * (1 - region.damage / 145));
  }, 0);
  const productionMultiplier = focusModifiers.productionMultiplier * stanceModifiers.productionMultiplier * (state.campaignEffects.productionBoostTurns > 0 ? 1.18 : 1);
  const gross = {
    grain: Math.round((production.output.grain + connectedYield * 0.62) * focusModifiers.grainMultiplier * productionMultiplier),
    arms: Math.round((production.output.arms + networkSummary.consolidatedCount * 0.45) * productionMultiplier),
    organization: Math.round(2 + networkSummary.connectedCount * 0.72 + focusModifiers.organizationIncome),
    intelligence: Math.round(production.output.intelligence + networkSummary.connectedCount * 0.32 + focusModifiers.intelligenceIncome),
  };
  const upkeep = Math.max(2, 7 + networkSummary.consolidatedCount - focusModifiers.maintenanceReduction);
  return {
    production,
    gross,
    upkeep,
    net: { ...gross, grain: gross.grain - upkeep },
  };
}

function GetEnemyCandidateWeight(state, regionDefinition, chapter, index) {
  const region = state.regions[regionDefinition.id];
  const railWeight = regionDefinition.rail ? 11 : 0;
  const valueWeight = region.network * 9 + region.baseLevel * 6;
  const historyBias = chapter.id === "HardestYear" && ["JinChaJi", "JinJiLuYu", "JinSui"].includes(region.id) ? 18 : 0;
  const expansionBias = chapter.id === "OpenRear" && ["JinChaJi", "JinJiLuYu"].includes(region.id) ? 12 : 0;
  const rearPenalty = region.id === "ShaanGanNing" ? -38 : 0;
  const noise = RandomValue(state, `enemy-weight-${chapter.id}-${region.id}-${index}`) * 18;
  return region.exposure * 0.42 + region.pressure * 0.28 + valueWeight + railWeight + historyBias + expansionBias + rearPenalty + noise;
}

export function BuildEnemyPlan(state) {
  const chapter = GetChapter(state);
  const ranked = regionDefinitions
    .map((definition, index) => ({
      regionId: definition.id,
      weight: GetEnemyCandidateWeight(state, definition, chapter, index),
    }))
    .sort((left, right) => right.weight - left.weight);
  const targetIds = ranked.slice(0, chapter.targetCount).map((candidate) => candidate.regionId);
  const possibleTargetIds = ranked.slice(0, Math.min(4, ranked.length)).map((candidate) => candidate.regionId);
  return {
    chapterId: chapter.id,
    kind: chapter.enemyKind,
    targetIds,
    possibleTargetIds,
    intensity: chapter.intensity,
    logisticsAtPlanning: state.national.japaneseLogistics,
  };
}

export function GetEnemyIntentPreview(state) {
  const plan = state.enemyPlan || BuildEnemyPlan(state);
  const focusModifiers = GetFocusModifiers(state);
  const planningSummary = GetPlanningSummary(state);
  const reconnaissanceIds = new Set(Object.values(state.regions).filter((region) => region.prepared.recon > 0).map((region) => region.id));
  const intelligenceScore = state.resources.intelligence - planningSummary.reservedCost.intelligence + focusModifiers.previewBonus;
  const reconfirmedTargetIds = plan.targetIds.filter((regionId) => reconnaissanceIds.has(regionId));
  let confirmedTargetIds = [...reconfirmedTargetIds];
  let confidence = "low";
  if (intelligenceScore >= 16) {
    confirmedTargetIds = [...plan.targetIds];
    confidence = "high";
  } else if (intelligenceScore >= 9) {
    confirmedTargetIds = [...new Set([plan.targetIds[0], ...reconfirmedTargetIds])];
    confidence = "medium";
  } else if (confirmedTargetIds.length) {
    confidence = "medium";
  }
  const possibleTargetIds = plan.possibleTargetIds
    .filter((regionId) => !confirmedTargetIds.includes(regionId))
    .sort((leftId, rightId) => RandomValue(state, `preview-order-${leftId}`) - RandomValue(state, `preview-order-${rightId}`));
  return {
    kind: plan.kind,
    intensity: plan.intensity,
    confidence,
    confirmedTargetIds,
    possibleTargetIds: possibleTargetIds.slice(0, confidence === "low" ? 3 : 2),
    summary: confidence === "high"
      ? "交通站已确认敌军集结方向。"
      : confidence === "medium"
        ? "已确认一路敌军，其他方向仍有疑点。"
        : "只能判断可能方向，需侦察或增加情报投入。",
  };
}

export function CreateInitialState(seed = 19370707) {
  const regions = {};
  for (const definition of regionDefinitions) regions[definition.id] = CreateRegionState(definition);
  const state = {
    version: gameConfig.version,
    seed: Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 19370707,
    turn: 0,
    maxTurns: gameConfig.maxTurns,
    status: "active",
    phase: "planning",
    selectedRegionId: "JinJiLuYu",
    commandBudget: gameConfig.commandBudget,
    resources: {
      grain: 32,
      arms: 14,
      organization: 36,
      intelligence: 9,
    },
    national: {
      peopleSafety: 72,
      contribution: 12,
      resilience: 58,
      frontIntegrity: 61,
      japaneseLogistics: 91,
      pinnedDivisions: 2,
    },
    stats: {
      familiesProtected: 0,
      familiesHarmed: 0,
      familiesDisplaced: 0,
      grainSeized: 0,
      cadresLost: 0,
      railDisruptions: 0,
      sweepsEndured: 0,
      ordersExecuted: 0,
    },
    regions,
    plans: [],
    planSequence: 1,
    stanceId: "PeopleFirst",
    productionId: "Supplies",
    crisisChoiceId: null,
    activeFocusId: "MassLine",
    focusProgress: 0,
    completedFocusIds: [],
    campaignEffects: {
      productionBoostTurns: 0,
      medicalNetwork: false,
    },
    enemyPlan: null,
    lastReport: null,
    history: [],
    lastCommand: { success: true, message: "战役开始" },
  };
  state.enemyPlan = BuildEnemyPlan(state);
  return state;
}

export function GetPlanningSummary(state) {
  const reservedCost = EmptyCost();
  let commandUsed = 0;
  const crisisCost = GetCrisisChoiceCost(state.crisisChoiceId);
  AddCost(reservedCost, crisisCost);
  for (const planEntry of state.plans) {
    const action = FindDefinition(actionDefinitions, planEntry.actionId);
    if (!action) continue;
    commandUsed += action.command;
    AddCost(reservedCost, action.cost);
  }
  return {
    commandUsed,
    commandRemaining: Math.max(0, state.commandBudget - commandUsed),
    crisisCost,
    reservedCost,
    availableResources: {
      grain: state.resources.grain - reservedCost.grain,
      arms: state.resources.arms - reservedCost.arms,
      organization: state.resources.organization - reservedCost.organization,
      intelligence: state.resources.intelligence - reservedCost.intelligence,
    },
  };
}

function HasAdjacentConnectedNetwork(state, regionId) {
  const definition = GetRegionDefinition(regionId);
  const connectedIds = new Set(GetConnectedRegionIds(state));
  return definition.links.some((linkedId) => connectedIds.has(linkedId));
}

export function GetActionAvailability(state, actionId, regionId) {
  const action = FindDefinition(actionDefinitions, actionId);
  const region = GetRegion(state, regionId);
  if (!action || !region) return { available: false, reason: "行动或地区不存在。" };
  if (state.status !== "active" || state.phase !== "planning") return { available: false, reason: "当前不能下达命令。" };
  const planningSummary = GetPlanningSummary(state);
  if (planningSummary.commandRemaining < action.command) return { available: false, reason: `还需 ${action.command} 道指挥令。` };
  for (const resourceId of Object.keys(action.cost)) {
    if (planningSummary.availableResources[resourceId] < action.cost[resourceId]) {
      const labels = { grain: "粮药", arms: "军械", organization: "组织力", intelligence: "情报" };
      return { available: false, reason: `${labels[resourceId]}不足。` };
    }
  }
  const localPlans = state.plans.filter((planEntry) => planEntry.regionId === regionId);
  if (localPlans.length >= 2) return { available: false, reason: "同一区本期最多安排两项行动。" };
  if (localPlans.some((planEntry) => planEntry.actionId === actionId)) return { available: false, reason: "该行动已在计划中。" };
  const connectedIds = new Set(GetConnectedRegionIds(state));
  const canReach = connectedIds.has(regionId) || HasAdjacentConnectedNetwork(state, regionId);
  if (!canReach && !["Organize", "Recon", "Conceal"].includes(actionId)) return { available: false, reason: "该区与交通网断联，只能先侦察、建联络或隐蔽。" };
  if (actionId === "Organize" && region.network >= 4) return { available: false, reason: "基层网络已达到最高等级。" };
  if (actionId === "Evacuate" && region.prepared.evacuation >= 2) return { available: false, reason: "疏散预案仍在生效。" };
  if (actionId === "SecureGrain" && region.prepared.grain >= 2) return { available: false, reason: "坚壁粮食仍在生效。" };
  if (actionId === "Restore" && region.damage < 8) return { available: false, reason: "该区目前没有大规模受创需要修复。" };
  if (actionId === "Sabotage" && !GetRegionDefinition(regionId).rail) return { available: false, reason: "本区没有可持续影响敌运输的干线。" };
  if (actionId === "Ambush" && region.pressure < 34) return { available: false, reason: "敌军活动不足，伏击难以形成战略牵制。" };
  return { available: true, reason: "可以加入本期计划。" };
}

export function QueueAction(state, actionId, regionId) {
  const nextState = Clone(state);
  const availability = GetActionAvailability(nextState, actionId, regionId);
  if (!availability.available) {
    nextState.lastCommand = { success: false, message: availability.reason };
    return nextState;
  }
  nextState.plans.push({ id: nextState.planSequence, actionId, regionId });
  nextState.planSequence += 1;
  const action = FindDefinition(actionDefinitions, actionId);
  const regionDefinition = GetRegionDefinition(regionId);
  nextState.lastCommand = { success: true, message: `已计划：${regionDefinition.shortName} · ${action.name}` };
  return nextState;
}

export function RemovePlannedAction(state, planId) {
  const nextState = Clone(state);
  const before = nextState.plans.length;
  nextState.plans = nextState.plans.filter((planEntry) => planEntry.id !== planId);
  nextState.lastCommand = before === nextState.plans.length
    ? { success: false, message: "没有找到这道命令。" }
    : { success: true, message: "已撤回命令。" };
  return nextState;
}

export function ClearPlan(state) {
  const nextState = Clone(state);
  nextState.plans = [];
  nextState.lastCommand = { success: true, message: "本期计划已清空。" };
  return nextState;
}

export function SetStance(state, stanceId) {
  const nextState = Clone(state);
  if (!FindDefinition(stanceDefinitions, stanceId) || nextState.status !== "active") {
    nextState.lastCommand = { success: false, message: "不能采用这个战略重心。" };
    return nextState;
  }
  nextState.stanceId = stanceId;
  nextState.lastCommand = { success: true, message: `本期重心：${FindDefinition(stanceDefinitions, stanceId).name}` };
  return nextState;
}

export function SetProductionPriority(state, productionId) {
  const nextState = Clone(state);
  if (!FindDefinition(productionDefinitions, productionId) || nextState.status !== "active") {
    nextState.lastCommand = { success: false, message: "不能采用这个生产配置。" };
    return nextState;
  }
  nextState.productionId = productionId;
  nextState.lastCommand = { success: true, message: `战时生产：${FindDefinition(productionDefinitions, productionId).name}` };
  return nextState;
}

export function ChooseCrisisResponse(state, choiceId) {
  const nextState = Clone(state);
  const choice = GetChapter(nextState).choices.find((entry) => entry.id === choiceId);
  if (!choice || nextState.status !== "active") {
    nextState.lastCommand = { success: false, message: "这个历史应对不在当前阶段。" };
    return nextState;
  }
  const stateWithoutChoice = Clone(nextState);
  stateWithoutChoice.crisisChoiceId = null;
  const planningSummary = GetPlanningSummary(stateWithoutChoice);
  const choiceCost = GetCrisisChoiceCost(choiceId);
  for (const [resourceId, amount] of Object.entries(choiceCost)) {
    if (planningSummary.availableResources[resourceId] < amount) {
      const labels = { grain: "粮药", arms: "军械", organization: "组织力", intelligence: "情报" };
      nextState.lastCommand = { success: false, message: `${labels[resourceId]}不足，无法采用“${choice.name}”。` };
      return nextState;
    }
  }
  nextState.crisisChoiceId = choiceId;
  nextState.lastCommand = { success: true, message: `战略抉择：${choice.name}` };
  return nextState;
}

export function GetFocusAvailability(state, focusId) {
  const focus = FindDefinition(focusDefinitions, focusId);
  if (!focus) return { available: false, reason: "方针不存在。" };
  if (state.status !== "active" || state.phase !== "planning") return { available: false, reason: "战局已经结束，不能再更换方针。" };
  if (state.completedFocusIds.includes(focusId)) return { available: false, reason: "已经完成。" };
  const missing = focus.prerequisites.filter((requiredId) => !state.completedFocusIds.includes(requiredId));
  if (missing.length) {
    const names = missing.map((requiredId) => FindDefinition(focusDefinitions, requiredId)?.name || requiredId);
    return { available: false, reason: `需要先完成：${names.join("、")}` };
  }
  if (focusId === "StrategicCounteroffensive" && state.turn < 6) return { available: false, reason: "需到1944年局部反攻阶段。" };
  return { available: true, reason: "可选为当前敌后长期方针。" };
}

export function SetFocus(state, focusId) {
  const nextState = Clone(state);
  const availability = GetFocusAvailability(nextState, focusId);
  if (!availability.available) {
    nextState.lastCommand = { success: false, message: availability.reason };
    return nextState;
  }
  if (nextState.activeFocusId !== focusId) nextState.focusProgress = 0;
  nextState.activeFocusId = focusId;
  nextState.lastCommand = { success: true, message: `当前方针：${FindDefinition(focusDefinitions, focusId).name}` };
  return nextState;
}

function GetCrisisModifiers(state, report) {
  const choiceId = state.crisisChoiceId;
  const modifiers = {
    organizeBonus: 0,
    militaryBonus: 0,
    enemyAttackShift: 0,
    harmMultiplier: 1,
    damageMultiplier: 1,
    grainLossMultiplier: 1,
    productionMultiplier: 1,
    restorationBonus: 0,
    globalEvacuation: false,
  };
  const AddChoiceReport = (text) => report.choiceReports.push(text);
  switch (choiceId) {
    case "CadresFirst":
      ApplyResourceDelta(state, "organization", -2);
      modifiers.organizeBonus += 4;
      AddChoiceReport("干部先行：基层组织行动额外增强，但组织力更加紧张。");
      break;
    case "MountainAdvance":
      ApplyResourceDelta(state, "arms", -2);
      ApplyNationalDelta(state, "contribution", 4);
      state.national.pinnedDivisions += 1;
      AddChoiceReport("主力开辟山区：形成新的牵制，付出有限军械储备。");
      break;
    case "ProtectVillages":
      ApplyResourceDelta(state, "grain", -3);
      ApplyNationalDelta(state, "peopleSafety", 4);
      modifiers.harmMultiplier *= 0.85;
      AddChoiceReport("联合群众转移：先把人护住，粮药储备因此下降。");
      break;
    case "ScatterGranaries":
      ApplyResourceDelta(state, "grain", -2);
      modifiers.grainLossMultiplier *= 0.38;
      modifiers.productionMultiplier *= 0.92;
      AddChoiceReport("分散粮库：敌军更难强征成批粮食，本期生产略慢。");
      break;
    case "CrossBlockade":
      ApplyResourceDelta(state, "organization", -3);
      ApplyResourceDelta(state, "intelligence", 3);
      for (const region of Object.values(state.regions)) region.exposure = Clamp(region.exposure - 4, 0, 100);
      AddChoiceReport("穿越封锁沟：交通线重新接续，付出干部体力与风险。");
      break;
    case "ConsolidateCore":
      ApplyNationalDelta(state, "resilience", 5);
      ApplyNationalDelta(state, "contribution", -1);
      AddChoiceReport("巩固中心区：暂缓扩张，把有限力量留在核心根据地。");
      break;
    case "SabotageCover":
      ApplyResourceDelta(state, "arms", -2);
      modifiers.militaryBonus += 5;
      ApplyNationalDelta(state, "japaneseLogistics", -4);
      AddChoiceReport("破袭保障：集中军械和交通员，运输破坏更有力。");
      break;
    case "MedicalSupport":
      ApplyResourceDelta(state, "grain", -3);
      modifiers.harmMultiplier *= 0.78;
      modifiers.damageMultiplier *= 0.9;
      AddChoiceReport("医疗保障：把粮药投向伤员与受创家庭，降低长期伤害。");
      break;
    case "EarlyEvacuation": {
      ApplyResourceDelta(state, "organization", -2);
      const targetId = state.enemyPlan.targetIds[0];
      state.regions[targetId].prepared.evacuation = Math.max(state.regions[targetId].prepared.evacuation, 2);
      AddChoiceReport(`先行疏散：${GetRegionDefinition(targetId).shortName}的群众得到提前预警。`);
      break;
    }
    case "VillageWarning":
      ApplyResourceDelta(state, "intelligence", -2);
      modifiers.harmMultiplier *= 0.62;
      AddChoiceReport("村庄预警：情报直接送到基层，争取到关键转移时间。");
      break;
    case "MoveInstitutions":
      ApplyResourceDelta(state, "grain", -3);
      ApplyResourceDelta(state, "organization", -1);
      ApplyNationalDelta(state, "resilience", 4);
      modifiers.damageMultiplier *= 0.72;
      AddChoiceReport("机关转移：秘密医院与档案避开合围，组织中枢得以保存。");
      break;
    case "OuterLineDiversion":
      ApplyResourceDelta(state, "arms", -3);
      ApplyResourceDelta(state, "organization", -2);
      ApplyNationalDelta(state, "contribution", 6);
      modifiers.enemyAttackShift -= 9;
      AddChoiceReport("外线牵制：主力把部分敌军引出合围圈，也承担骨干损耗。");
      break;
    case "KeepSeedGrain":
      ApplyResourceDelta(state, "grain", -4);
      state.campaignEffects.productionBoostTurns = Math.max(state.campaignEffects.productionBoostTurns, 2);
      ApplyNationalDelta(state, "peopleSafety", 2);
      AddChoiceReport("保住种粮：眼前更紧，却为下一季生产留下根。");
      break;
    case "ArmyRationing":
      ApplyNationalDelta(state, "resilience", -4);
      ApplyNationalDelta(state, "peopleSafety", 6);
      ApplyResourceDelta(state, "grain", 4);
      modifiers.militaryBonus -= 3;
      AddChoiceReport("军队减粮：战备下降，把有限口粮优先留给群众与伤员。");
      break;
    case "ConcentrateMedicine":
      ApplyResourceDelta(state, "grain", -3);
      modifiers.harmMultiplier *= 0.68;
      modifiers.damageMultiplier *= 0.75;
      modifiers.militaryBonus -= 2;
      AddChoiceReport("集中药品：主动战斗能力收缩，救治能力显著提高。");
      break;
    case "MassProduction":
      ApplyResourceDelta(state, "grain", 6);
      ApplyResourceDelta(state, "organization", 3);
      modifiers.productionMultiplier *= 1.15;
      for (const region of Object.values(state.regions)) region.exposure = Clamp(region.exposure + 2, 0, 100);
      AddChoiceReport("军民生产：粮药和组织得到补充，公开活动也更容易被发现。");
      break;
    case "RepairStations": {
      ApplyResourceDelta(state, "organization", -2);
      ApplyResourceDelta(state, "intelligence", 5);
      const networkSummary = GetNetworkSummary(state);
      const weakRegion = Object.values(state.regions)
        .filter((region) => !networkSummary.connectedRegionIds.includes(region.id))
        .sort((left, right) => left.network - right.network)[0];
      if (weakRegion) weakRegion.network = Clamp(weakRegion.network + 1, 0, 4);
      AddChoiceReport("修复交通站：情报恢复，并尝试重接一处薄弱网络。");
      break;
    }
    case "TrainMedics":
      ApplyResourceDelta(state, "grain", -2);
      state.campaignEffects.medicalNetwork = true;
      modifiers.harmMultiplier *= 0.9;
      AddChoiceReport("培训卫生员：建立持续救护体系，此后扫荡伤害都会降低。");
      break;
    case "RestoreVillages":
      ApplyResourceDelta(state, "grain", -4);
      for (const region of Object.values(state.regions)) region.damage = Clamp(region.damage - 7, 0, 100);
      ApplyNationalDelta(state, "peopleSafety", 5);
      AddChoiceReport("恢复村庄：把反攻前的第一批物资送回受创地区。");
      break;
    case "RemoveStrongpoints":
      ApplyResourceDelta(state, "arms", -4);
      ApplyNationalDelta(state, "japaneseLogistics", -10);
      ApplyNationalDelta(state, "contribution", 8);
      AddChoiceReport("拔除孤立据点：敌军交通进一步收缩，军械储备下降。");
      break;
    case "ExpandBases": {
      ApplyResourceDelta(state, "organization", -4);
      const weakestRegions = Object.values(state.regions).sort((left, right) => left.network - right.network).slice(0, 2);
      for (const region of weakestRegions) region.network = Clamp(region.network + 1, 0, 4);
      ApplyNationalDelta(state, "resilience", -2);
      AddChoiceReport("扩展根据地：两处薄弱区接上组织，交通线也被拉长。");
      break;
    }
    case "ReliefDemobilize":
      ApplyResourceDelta(state, "grain", -4);
      ApplyNationalDelta(state, "peopleSafety", 7);
      ApplyNationalDelta(state, "resilience", 3);
      modifiers.restorationBonus += 6;
      AddChoiceReport("救济与复员：把胜利前的资源用于安置群众与伤员。");
      break;
    case "TakeTransport":
      ApplyResourceDelta(state, "arms", -3);
      ApplyNationalDelta(state, "japaneseLogistics", -12);
      ApplyNationalDelta(state, "contribution", 10);
      AddChoiceReport("接管交通节点：残余运输被切断，敌后战略贡献上升。");
      break;
    case "LinkOrganizations": {
      ApplyResourceDelta(state, "organization", -3);
      ApplyResourceDelta(state, "intelligence", 4);
      const weakest = Object.values(state.regions).sort((left, right) => left.network - right.network)[0];
      if (weakest) weakest.network = Clamp(weakest.network + 1, 0, 4);
      AddChoiceReport("接应各区组织：保存干部与档案，重接最薄弱的一环。");
      break;
    }
    default:
      break;
  }
  return modifiers;
}

function DeductPlanCosts(state) {
  const actionCost = EmptyCost();
  for (const planEntry of state.plans) {
    const action = FindDefinition(actionDefinitions, planEntry.actionId);
    if (action) AddCost(actionCost, action.cost);
  }
  for (const resourceId of Object.keys(actionCost)) {
    ApplyResourceDelta(state, resourceId, -actionCost[resourceId]);
  }
}

function ResolveAction(state, planEntry, crisisModifiers, report, actionIndex) {
  const action = FindDefinition(actionDefinitions, planEntry.actionId);
  const region = state.regions[planEntry.regionId];
  const regionDefinition = GetRegionDefinition(planEntry.regionId);
  const focusModifiers = GetFocusModifiers(state);
  const stanceModifiers = GetStanceModifiers(state);
  const roll = RandomValue(state, `action-${actionIndex}-${action.id}-${region.id}`);
  let outcome = "";
  let tone = "neutral";
  let displacedFamilies = 0;
  let cadresLost = 0;
  switch (action.id) {
    case "Organize": {
      const pressurePenalty = Math.floor(region.pressure / 28);
      const effect = Math.max(6, Math.round((11 + focusModifiers.organizeBonus + crisisModifiers.organizeBonus - pressurePenalty + roll * 4) * stanceModifiers.civilMultiplier));
      region.support = Clamp(region.support + effect, 0, 100);
      const threshold = 38 + region.network * 14;
      const advanced = region.support >= threshold && region.network < 4;
      if (advanced) {
        region.network += 1;
        region.baseLevel = Math.max(region.baseLevel, Math.max(0, region.network - 1));
      }
      region.exposure = Clamp(region.exposure + 6 + stanceModifiers.exposureShift, 0, 100);
      ApplyNationalDelta(state, "resilience", advanced ? 3 : 1);
      ApplyNationalDelta(state, "contribution", advanced ? 2 : 0.5);
      outcome = advanced
        ? `群众支持 +${effect}，基层网络升至 ${region.network} 级。`
        : `群众支持 +${effect}，组织继续扎根。`;
      tone = "good";
      break;
    }
    case "Evacuate": {
      const duration = 2 + focusModifiers.evacuationDurationBonus;
      region.prepared.evacuation = Math.max(region.prepared.evacuation, duration);
      region.damage = Clamp(region.damage + 1, 0, 100);
      region.exposure = Clamp(region.exposure - 3, 0, 100);
      const protectedFamilies = Math.round((70 + region.network * 24 + roll * 25) * stanceModifiers.civilMultiplier);
      state.stats.familiesProtected += protectedFamilies;
      displacedFamilies = Math.round(protectedFamilies * 0.28);
      state.stats.familiesDisplaced += displacedFamilies;
      outcome = `预先转移约 ${protectedFamilies} 户；能避开扫荡，但离村本身也是苦难。`;
      tone = "people";
      break;
    }
    case "SecureGrain": {
      region.prepared.grain = Math.max(region.prepared.grain, 2);
      region.exposure = Clamp(region.exposure + 2, 0, 100);
      const saved = 3 + Math.round(region.network * 1.5 + roll * 3);
      ApplyResourceDelta(state, "grain", saved);
      outcome = `分散粮库与种粮，立即保住 ${saved} 点粮药，并降低后续强征损失。`;
      tone = "people";
      break;
    }
    case "Restore": {
      const recovery = Math.round((16 + focusModifiers.restorationBonus + crisisModifiers.restorationBonus + roll * 5) * stanceModifiers.civilMultiplier);
      region.damage = Clamp(region.damage - recovery, 0, 100);
      region.support = Clamp(region.support + Math.round(recovery * 0.28), 0, 100);
      ApplyNationalDelta(state, "peopleSafety", 2.5);
      outcome = `受创度 -${recovery}，救济与生产恢复让群众支持回升。`;
      tone = "good";
      break;
    }
    case "Recon": {
      region.prepared.recon = Math.max(region.prepared.recon, 2);
      const intelligenceGain = 3 + Math.round(region.network * 0.8 + roll * 3);
      ApplyResourceDelta(state, "intelligence", intelligenceGain);
      region.exposure = Clamp(region.exposure + (state.completedFocusIds.includes("IntelligenceNetwork") ? 1 : 3), 0, 100);
      outcome = `核实敌情，情报 +${intelligenceGain}；若敌军来袭，可削弱突袭优势。`;
      tone = "intel";
      break;
    }
    case "Sabotage": {
      const disruption = Math.round((8 + region.network * 1.2 + crisisModifiers.militaryBonus + roll * 4) * stanceModifiers.militaryMultiplier);
      const effectiveDisruption = Math.min(disruption, Math.ceil(state.national.japaneseLogistics));
      ApplyNationalDelta(state, "japaneseLogistics", -effectiveDisruption);
      ApplyNationalDelta(state, "contribution", effectiveDisruption > 0 ? Math.max(2, effectiveDisruption * 0.72) : 0.5);
      const pinnedGain = effectiveDisruption >= 12 ? 2 : effectiveDisruption >= 5 ? 1 : 0;
      state.national.pinnedDivisions += pinnedGain;
      state.stats.railDisruptions += 1;
      region.prepared.delay = Math.max(region.prepared.delay, Math.round(disruption * 0.55));
      region.exposure = Clamp(region.exposure + 14 + stanceModifiers.exposureShift, 0, 100);
      region.pressure = Clamp(region.pressure + 5, 0, 100);
      const cadreLoss = region.network <= 1 && roll < 0.48 ? 2 : roll < 0.2 ? 1 : 0;
      ApplyResourceDelta(state, "organization", -cadreLoss);
      state.stats.cadresLost += cadreLoss;
      cadresLost = cadreLoss;
      outcome = effectiveDisruption > 0
        ? `敌运输效率 -${effectiveDisruption}，新增牵制 ${pinnedGain} 个师团当量${cadreLoss ? `；损失 ${cadreLoss} 点骨干` : ""}。`
        : `敌干线已高度瘫痪，本次主要迟滞本区扫荡${cadreLoss ? `；仍损失 ${cadreLoss} 点骨干` : ""}。`;
      tone = "military";
      break;
    }
    case "Ambush": {
      const delay = Math.round((9 + region.network * 1.4 + focusModifiers.ambushBonus + crisisModifiers.militaryBonus + roll * 5) * stanceModifiers.militaryMultiplier);
      region.prepared.delay = Math.max(region.prepared.delay, delay);
      region.pressure = Clamp(region.pressure - Math.round(delay * 0.45), 0, 100);
      region.exposure = Clamp(region.exposure + 17 + stanceModifiers.exposureShift, 0, 100);
      ApplyNationalDelta(state, "contribution", Math.max(3, delay * 0.58));
      state.national.pinnedDivisions += delay >= 15 ? 2 : 1;
      const readiness = region.network * 12 + region.support * 0.25 + state.resources.intelligence;
      const cadreLoss = Math.max(0, Math.round((54 - readiness + roll * 14) / 15));
      ApplyResourceDelta(state, "organization", -cadreLoss);
      state.stats.cadresLost += cadreLoss;
      cadresLost = cadreLoss;
      outcome = `扫荡推进被迟滞 ${delay} 点，形成战略牵制${cadreLoss ? `；骨干损失 ${cadreLoss}` : "，部队安全撤出"}。`;
      tone = cadreLoss >= 3 ? "cost" : "military";
      break;
    }
    case "Conceal": {
      const hidden = 13 + Math.round(roll * 4);
      region.exposure = Clamp(region.exposure - hidden, 0, 100);
      ApplyResourceDelta(state, "organization", 1 + Math.floor(region.network / 2));
      outcome = `暴露度 -${hidden}，部队与干部化整为零、保存力量。`;
      tone = "neutral";
      break;
    }
    default:
      outcome = "行动没有产生可记录的结果。";
  }
  region.lastActionIds.push(action.id);
  state.stats.ordersExecuted += 1;
  report.actionReports.push({
    actionId: action.id,
    actionName: action.name,
    regionId: region.id,
    regionName: regionDefinition.shortName,
    outcome,
    tone,
    displacedFamilies,
    cadresLost,
  });
}

function ResolveEnemyTarget(state, regionId, crisisModifiers, report, targetIndex) {
  const region = state.regions[regionId];
  const regionDefinition = GetRegionDefinition(regionId);
  const chapter = GetChapter(state);
  const focusModifiers = GetFocusModifiers(state);
  const stanceModifiers = GetStanceModifiers(state);
  const roll = RandomValue(state, `enemy-${chapter.id}-${regionId}-${targetIndex}`);
  const attack = chapter.intensity
    + region.pressure * 0.24
    + state.enemyPlan.logisticsAtPlanning * 0.13
    + roll * 12
    + crisisModifiers.enemyAttackShift;
  const defense = region.network * 9
    + region.baseLevel * 5
    + region.support * 0.12
    + region.prepared.delay
    + region.prepared.recon * 4
    + region.prepared.evacuation * 6
    + region.prepared.grain * 2
    + (state.completedFocusIds.includes("TunnelWarfare") ? 6 : 0)
    + (state.stanceId === "PeopleFirst" ? 2 : 0);
  const margin = attack - defense;
  const evacuated = region.prepared.evacuation > 0;
  const grainSecured = region.prepared.grain > 0;
  const medicalMultiplier = state.campaignEffects.medicalNetwork ? 0.86 : 1;
  const evacuationMultiplier = evacuated ? 0.36 : 1;
  const harmUnits = Math.max(1, Math.round((2 + Math.max(0, margin) * 0.16) * crisisModifiers.harmMultiplier * focusModifiers.enemyHarmMultiplier * medicalMultiplier * evacuationMultiplier));
  const harmedFamilies = harmUnits * 14;
  const displacedFamilies = evacuated ? Math.round((34 + attack * 0.62) * (1 + region.damage / 180)) : Math.round(harmedFamilies * 0.28);
  const damageGain = Math.max(2, Math.round((5 + Math.max(0, margin) * 0.23) * crisisModifiers.damageMultiplier * (evacuated ? 0.78 : 1)));
  const rawGrainLoss = Math.max(2, Math.round(3 + attack / 18));
  const grainLoss = Math.max(0, Math.round(rawGrainLoss * crisisModifiers.grainLossMultiplier * (grainSecured ? 0.3 : 1)));
  const organizationLoss = Math.max(0, Math.round((Math.max(0, margin) - region.network * 3) / 22));
  region.damage = Clamp(region.damage + damageGain, 0, 100);
  region.support = Clamp(region.support - Math.max(1, Math.round(harmUnits * 0.75)), 0, 100);
  region.pressure = Clamp(region.pressure + (margin > 12 ? 6 : 2), 0, 100);
  region.exposure = Clamp(region.exposure - Math.max(3, Math.round(attack * 0.06)), 0, 100);
  ApplyResourceDelta(state, "grain", -grainLoss);
  ApplyResourceDelta(state, "organization", -organizationLoss);
  state.stats.familiesHarmed += harmedFamilies;
  state.stats.familiesDisplaced += displacedFamilies;
  state.stats.grainSeized += grainLoss;
  state.stats.cadresLost += organizationLoss;
  state.stats.sweepsEndured += 1;
  ApplyNationalDelta(state, "peopleSafety", -harmUnits * 0.62);
  ApplyNationalDelta(state, "resilience", margin > 24 ? -4 : margin > 4 ? -1.5 : 1.5);
  const networkBreakThreshold = evacuated ? 54 : 40;
  if (margin > networkBreakThreshold && region.network > 0) {
    region.network -= 1;
    region.baseLevel = Math.min(region.baseLevel, Math.max(0, region.network - 1));
  }
  let result = "保存力量";
  let tone = "held";
  if (margin > 31) {
    result = "组织受挫";
    tone = "severe";
  } else if (margin > 8) {
    result = "艰难承受";
    tone = "cost";
  } else if (margin < -8) {
    result = "合围未果";
    tone = "good";
    ApplyNationalDelta(state, "contribution", 2);
  }
  region.lastEnemyOutcome = result;
  report.enemyReports.push({
    regionId,
    regionName: regionDefinition.shortName,
    result,
    tone,
    harmedFamilies,
    displacedFamilies,
    grainLoss,
    organizationLoss,
    damageGain,
    prepared: {
      evacuated,
      grainSecured,
      delayed: region.prepared.delay > 0,
      recon: region.prepared.recon > 0,
    },
    detail: evacuated
      ? "群众与机关提前转移，侵略军仍造成破坏，但人员伤害显著降低。"
      : "缺少充分疏散，扫荡直接冲击村庄、粮食与基层组织。",
  });
}

function ApplyProduction(state, crisisModifiers, report) {
  const forecast = CalculateProductionForecast(state);
  const multiplier = crisisModifiers.productionMultiplier;
  const actual = {
    grain: Math.round(forecast.gross.grain * multiplier) - forecast.upkeep,
    arms: Math.round(forecast.gross.arms * multiplier),
    organization: Math.round(forecast.gross.organization * multiplier),
    intelligence: Math.round(forecast.gross.intelligence * multiplier),
  };
  for (const [resourceId, delta] of Object.entries(actual)) ApplyResourceDelta(state, resourceId, delta);
  report.production = { ...actual, upkeep: forecast.upkeep, name: forecast.production.name };
}

function ApplyPreProductionCrisis(state, report) {
  if (state.resources.grain > 0) return;
  ApplyNationalDelta(state, "peopleSafety", -5);
  ApplyNationalDelta(state, "resilience", -4);
  for (const region of Object.values(state.regions)) region.damage = Clamp(region.damage + 2, 0, 100);
  report.systemReports.push("粮药见底：本期生产补充抵达前，部队已经减粮、伤员已经缺药，所有地区受创加深。");
}

function ApplyFocusProgress(state, report) {
  const focus = FindDefinition(focusDefinitions, state.activeFocusId);
  if (!focus || state.completedFocusIds.includes(focus.id)) return;
  state.focusProgress += 1;
  if (state.focusProgress < focus.duration) return;
  state.completedFocusIds.push(focus.id);
  state.activeFocusId = null;
  state.focusProgress = 0;
  report.focusCompleted = { id: focus.id, name: focus.name, description: focus.description };
  if (focus.id === "MassLine") ApplyNationalDelta(state, "resilience", 4);
  if (focus.id === "ReduceRent") ApplyNationalDelta(state, "peopleSafety", 4);
  if (focus.id === "TunnelWarfare") ApplyNationalDelta(state, "resilience", 3);
  if (focus.id === "LeanAdministration") ApplyResourceDelta(state, "organization", 5);
  if (focus.id === "MineWarfare") state.national.pinnedDivisions += 1;
  if (focus.id === "IntelligenceNetwork") ApplyResourceDelta(state, "intelligence", 6);
  if (focus.id === "ProductionDrive") state.campaignEffects.productionBoostTurns = Math.max(state.campaignEffects.productionBoostTurns, 2);
  if (focus.id === "StrategicCounteroffensive") ApplyNationalDelta(state, "contribution", 10);
}

function ApplyEndOfTurnState(state, report) {
  const focusModifiers = GetFocusModifiers(state);
  for (const region of Object.values(state.regions)) {
    const connected = GetConnectedRegionIds(state).includes(region.id);
    if (connected && region.network > 0) {
      region.support = Clamp(region.support + focusModifiers.supportIncome + (region.damage < 35 ? 1 : 0), 0, 100);
      region.damage = Clamp(region.damage - (state.stanceId === "Recovery" ? 4 : 2), 0, 100);
    }
    region.exposure = Clamp(region.exposure - (region.lastActionIds.length ? 3 : 7), 0, 100);
    region.pressure = Clamp(region.pressure + (region.lastEnemyOutcome ? 1 : 2), 0, 100);
    region.prepared.evacuation = Math.max(0, region.prepared.evacuation - 1);
    region.prepared.grain = Math.max(0, region.prepared.grain - 1);
    region.prepared.recon = Math.max(0, region.prepared.recon - 1);
    region.prepared.delay = 0;
    region.lastActionIds = [];
  }
  const networkSummary = GetNetworkSummary(state);
  state.national.pinnedDivisions = Math.max(2, Math.round(state.national.pinnedDivisions * 0.84 + networkSummary.consolidatedCount * 0.22));
  if (networkSummary.connectedCount <= 3) {
    ApplyNationalDelta(state, "resilience", -7);
    report.systemReports.push("交通网只剩少数地区连通，命令、补给和伤员转移都受到严重影响。");
  } else {
    ApplyNationalDelta(state, "resilience", Math.max(0, (networkSummary.connectedCount - 4) * 0.7));
    ApplyNationalDelta(state, "contribution", Math.max(0, (networkSummary.connectedCount - 4) * 0.38));
  }
  if (state.plans.length === 0) {
    ApplyNationalDelta(state, "peopleSafety", -3);
    ApplyNationalDelta(state, "resilience", -5);
    ApplyNationalDelta(state, "japaneseLogistics", 3);
    report.systemReports.push("本期没有部署：占领体系继续扩张，群众与组织被动承压。");
  }
  const militaryOrders = report.actionReports.filter((entry) => ["Sabotage", "Ambush"].includes(entry.actionId)).length;
  const frontDelta = militaryOrders * 1.8 + state.national.pinnedDivisions * 0.12 - state.national.japaneseLogistics * 0.025 - GetChapter(state).intensity * 0.018;
  ApplyNationalDelta(state, "frontIntegrity", frontDelta);
  if (state.campaignEffects.productionBoostTurns > 0) state.campaignEffects.productionBoostTurns -= 1;
}

function CaptureSnapshot(state) {
  return {
    resources: Clone(state.resources),
    national: Clone(state.national),
    stats: Clone(state.stats),
    network: GetNetworkSummary(state),
  };
}

function BuildDelta(before, after) {
  const delta = {};
  for (const key of Object.keys(before)) {
    if (typeof before[key] === "number" && typeof after[key] === "number") delta[key] = Round(after[key] - before[key], 1);
  }
  return delta;
}

function EvaluateFailure(state) {
  const networkSummary = GetNetworkSummary(state);
  if (state.national.peopleSafety <= 0) return "人民安全崩溃：敌后战略任务失败，但历史仍在继续。";
  if (state.national.resilience <= 0) return "抗战韧性耗尽：组织和补给无法维持本战区任务。";
  if (networkSummary.connectedCount <= 1) return "敌后交通网几乎完全断裂：各区无法协同坚持。";
  return null;
}

export function ResolveTurn(state) {
  const nextState = Clone(state);
  if (nextState.status !== "active" || nextState.phase !== "planning") {
    nextState.lastCommand = { success: false, message: "这一期已经结算，不能重复推进。" };
    return nextState;
  }
  if (!nextState.crisisChoiceId) {
    nextState.lastCommand = { success: false, message: "先选择本期战略抉择。" };
    return nextState;
  }
  const chapter = GetChapter(nextState);
  const before = CaptureSnapshot(nextState);
  const report = {
    turn: nextState.turn,
    chapterId: chapter.id,
    period: chapter.period,
    title: chapter.title,
    choiceId: nextState.crisisChoiceId,
    choiceReports: [],
    actionReports: [],
    enemyReports: [],
    systemReports: [],
    production: null,
    focusCompleted: null,
    resourceDelta: {},
    nationalDelta: {},
    networkDelta: {},
    costLedger: {},
    failureReason: null,
  };
  nextState.phase = "resolving";
  for (const region of Object.values(nextState.regions)) {
    region.lastActionIds = [];
    region.lastEnemyOutcome = null;
  }
  DeductPlanCosts(nextState);
  const crisisModifiers = GetCrisisModifiers(nextState, report);
  nextState.plans.forEach((planEntry, index) => ResolveAction(nextState, planEntry, crisisModifiers, report, index));
  nextState.enemyPlan.targetIds.forEach((regionId, index) => ResolveEnemyTarget(nextState, regionId, crisisModifiers, report, index));
  ApplyPreProductionCrisis(nextState, report);
  ApplyProduction(nextState, crisisModifiers, report);
  ApplyFocusProgress(nextState, report);
  ApplyEndOfTurnState(nextState, report);
  const failureReason = EvaluateFailure(nextState);
  if (failureReason) {
    nextState.status = "failed";
    report.failureReason = failureReason;
  } else if (nextState.turn >= nextState.maxTurns - 1) {
    nextState.status = "completed";
  }
  const after = CaptureSnapshot(nextState);
  report.resourceDelta = BuildDelta(before.resources, after.resources);
  report.nationalDelta = BuildDelta(before.national, after.national);
  report.costLedger = BuildDelta(before.stats, after.stats);
  report.networkDelta = {
    connectedCount: after.network.connectedCount - before.network.connectedCount,
    averageNetwork: Round(after.network.averageNetwork - before.network.averageNetwork, 2),
    averageDamage: Round(after.network.averageDamage - before.network.averageDamage, 1),
  };
  nextState.history.push(Clone(report));
  nextState.lastReport = report;
  nextState.plans = [];
  nextState.crisisChoiceId = null;
  nextState.turn += 1;
  nextState.phase = nextState.status === "active" ? "planning" : "ended";
  if (nextState.status === "active") nextState.enemyPlan = BuildEnemyPlan(nextState);
  nextState.lastCommand = { success: true, message: `${chapter.period} 已结算。` };
  return nextState;
}

export function CalculateOutcome(state) {
  const networkSummary = GetNetworkSummary(state);
  const networkScore = Clamp(networkSummary.averageNetwork / 4 * 100, 0, 100);
  const safetyScore = state.national.peopleSafety;
  const contributionScore = state.national.contribution;
  const resilienceScore = state.national.resilience;
  const frontScore = state.national.frontIntegrity;
  const score = Math.round(
    safetyScore * 0.28
    + contributionScore * 0.28
    + resilienceScore * 0.18
    + networkScore * 0.18
    + frontScore * 0.08,
  );
  const mainstay = safetyScore >= 55
    && contributionScore >= 65
    && resilienceScore >= 40
    && networkSummary.consolidatedCount >= 5
    && networkSummary.connectedCount >= 6;
  let grade = "C";
  let title = "火种尚存";
  let summary = "在极端困难中坚持到胜利，但人民、组织或战略牵制仍付出沉重代价。";
  if (mainstay) {
    grade = "S";
    title = "敌后体系完备";
    summary = "基层网络、群众动员、人民武装和战略牵制形成完整体系，敌后战场成为侵略军无法绕开的战场。";
  } else if (score >= 68 && safetyScore >= 45 && networkSummary.connectedCount >= 5 && networkSummary.consolidatedCount >= 3) {
    grade = "A";
    title = "敌后脊梁";
    summary = "根据地在封锁与扫荡中保存下来，并持续牵制敌军、支援全国战局。";
  } else if (score >= 50 && safetyScore >= 30 && networkSummary.connectedCount >= 4) {
    grade = "B";
    title = "艰难坚持";
    summary = "敌后力量熬过最困难时期，但多处网络受创，恢复需要更长时间。";
  }
  return {
    grade,
    title,
    score,
    mainstay,
    summary,
    evidence: [
      { id: "people", name: "保护与动员人民", value: Math.round(safetyScore), detail: `人民安全 ${Math.round(safetyScore)} · 已保护 ${state.stats.familiesProtected} 户` },
      { id: "network", name: "维系基层网络", value: Math.round(networkScore), detail: `${networkSummary.connectedCount} 区连通 · ${networkSummary.consolidatedCount} 区巩固` },
      { id: "contribution", name: "牵制与破坏交通", value: Math.round(contributionScore), detail: `贡献 ${Math.round(contributionScore)} · 牵制 ${state.national.pinnedDivisions} 个师团当量` },
      { id: "resilience", name: "保存并壮大力量", value: Math.round(resilienceScore), detail: `抗战韧性 ${Math.round(resilienceScore)} · 完成 ${state.completedFocusIds.length} 项方针` },
    ],
  };
}

export function ValidateState(state) {
  if (!state || typeof state !== "object") return { valid: false, reason: "存档不是对象。" };
  if (state.version !== gameConfig.version) return { valid: false, reason: "存档版本不兼容。" };
  if (!Number.isInteger(state.seed)) return { valid: false, reason: "随机种子损坏。" };
  if (!Number.isInteger(state.turn) || state.turn < 0 || state.turn > gameConfig.maxTurns) return { valid: false, reason: "回合数据损坏。" };
  if (state.maxTurns !== gameConfig.maxTurns || state.commandBudget !== gameConfig.commandBudget) return { valid: false, reason: "战役规模数据损坏。" };
  if (!["active", "failed", "completed"].includes(state.status)) return { valid: false, reason: "战役状态损坏。" };
  if (!["planning", "ended"].includes(state.phase)) return { valid: false, reason: "战役阶段损坏。" };
  if (state.status === "active" && (state.phase !== "planning" || state.turn >= gameConfig.maxTurns)) return { valid: false, reason: "活动战役状态矛盾。" };
  if (state.status !== "active" && state.phase !== "ended") return { valid: false, reason: "终局状态矛盾。" };
  if (!state.resources || !state.national || !state.regions) return { valid: false, reason: "存档缺少关键字段。" };
  for (const resourceId of ["grain", "arms", "organization", "intelligence"]) {
    if (!Number.isFinite(state.resources[resourceId]) || state.resources[resourceId] < 0 || state.resources[resourceId] > 999) return { valid: false, reason: "资源数据损坏。" };
  }
  for (const metricId of ["peopleSafety", "contribution", "resilience", "frontIntegrity", "japaneseLogistics"]) {
    if (!Number.isFinite(state.national[metricId]) || state.national[metricId] < 0 || state.national[metricId] > 100) return { valid: false, reason: "战局数据损坏。" };
  }
  if (!Number.isFinite(state.national.pinnedDivisions) || state.national.pinnedDivisions < 0 || state.national.pinnedDivisions > 999) return { valid: false, reason: "牵制数据损坏。" };
  if (!state.stats || typeof state.stats !== "object") return { valid: false, reason: "统计数据缺失。" };
  for (const statId of ["familiesProtected", "familiesHarmed", "familiesDisplaced", "grainSeized", "cadresLost", "railDisruptions", "sweepsEndured", "ordersExecuted"]) {
    if (!Number.isFinite(state.stats[statId]) || state.stats[statId] < 0) return { valid: false, reason: "统计数据损坏。" };
  }
  if (Object.keys(state.regions).length !== regionDefinitions.length) return { valid: false, reason: "地区数量损坏。" };
  for (const definition of regionDefinitions) {
    const region = state.regions[definition.id];
    if (!region) return { valid: false, reason: `缺少地区：${definition.id}` };
    if (region.id !== definition.id) return { valid: false, reason: `${definition.id} 标识损坏。` };
    for (const key of ["network", "support", "pressure", "exposure", "damage", "baseLevel"]) {
      if (!Number.isFinite(region[key])) return { valid: false, reason: `${definition.id} 数据损坏。` };
    }
    if (region.network < 0 || region.network > 4 || region.baseLevel < 0 || region.baseLevel > 3) return { valid: false, reason: `${definition.id} 组织等级损坏。` };
    for (const key of ["support", "pressure", "exposure", "damage"]) {
      if (region[key] < 0 || region[key] > 100) return { valid: false, reason: `${definition.id} 指标越界。` };
    }
    if (!region.prepared || typeof region.prepared !== "object") return { valid: false, reason: `${definition.id} 准备数据缺失。` };
    for (const key of ["evacuation", "grain", "recon", "delay"]) {
      if (!Number.isFinite(region.prepared[key]) || region.prepared[key] < 0 || region.prepared[key] > 100) return { valid: false, reason: `${definition.id} 准备数据损坏。` };
    }
    if (!Array.isArray(region.lastActionIds) || region.lastActionIds.some((actionId) => !FindDefinition(actionDefinitions, actionId))) return { valid: false, reason: `${definition.id} 行动记录损坏。` };
  }
  if (!GetRegionDefinition(state.selectedRegionId)) return { valid: false, reason: "选中地区损坏。" };
  if (!FindDefinition(stanceDefinitions, state.stanceId) || !FindDefinition(productionDefinitions, state.productionId)) return { valid: false, reason: "战略配置损坏。" };
  if (state.crisisChoiceId !== null && !chapterDefinitions.flatMap((chapter) => chapter.choices).some((choice) => choice.id === state.crisisChoiceId)) return { valid: false, reason: "战略抉择损坏。" };
  if (state.activeFocusId !== null && !FindDefinition(focusDefinitions, state.activeFocusId)) return { valid: false, reason: "当前方针损坏。" };
  if (!Array.isArray(state.completedFocusIds) || new Set(state.completedFocusIds).size !== state.completedFocusIds.length || state.completedFocusIds.some((focusId) => !FindDefinition(focusDefinitions, focusId))) return { valid: false, reason: "已完成方针损坏。" };
  if (!Number.isInteger(state.focusProgress) || state.focusProgress < 0) return { valid: false, reason: "方针进度损坏。" };
  if (!Array.isArray(state.plans)) return { valid: false, reason: "计划数据损坏。" };
  const planIds = new Set();
  const localPlanCounts = new Map();
  let plannedCommands = 0;
  for (const planEntry of state.plans) {
    const action = FindDefinition(actionDefinitions, planEntry?.actionId);
    if (!Number.isInteger(planEntry?.id) || planIds.has(planEntry.id) || !action || !GetRegionDefinition(planEntry.regionId)) return { valid: false, reason: "地区命令损坏。" };
    planIds.add(planEntry.id);
    plannedCommands += action.command;
    localPlanCounts.set(planEntry.regionId, (localPlanCounts.get(planEntry.regionId) || 0) + 1);
  }
  if (plannedCommands > gameConfig.commandBudget || [...localPlanCounts.values()].some((count) => count > 2)) return { valid: false, reason: "地区命令越界。" };
  if (!Number.isInteger(state.planSequence) || state.planSequence <= Math.max(0, ...planIds)) return { valid: false, reason: "命令序列损坏。" };
  if (!state.campaignEffects || !Number.isFinite(state.campaignEffects.productionBoostTurns) || typeof state.campaignEffects.medicalNetwork !== "boolean") return { valid: false, reason: "长期效果损坏。" };
  if (!state.enemyPlan || !chapterDefinitions.some((chapter) => chapter.id === state.enemyPlan.chapterId) || !Number.isFinite(state.enemyPlan.intensity)) return { valid: false, reason: "敌军计划损坏。" };
  if (!Number.isFinite(state.enemyPlan.logisticsAtPlanning) || state.enemyPlan.logisticsAtPlanning < 0 || state.enemyPlan.logisticsAtPlanning > 100) return { valid: false, reason: "敌军计划运输数据损坏。" };
  for (const listId of ["targetIds", "possibleTargetIds"]) {
    const regionIds = state.enemyPlan[listId];
    if (!Array.isArray(regionIds) || new Set(regionIds).size !== regionIds.length || regionIds.some((regionId) => !GetRegionDefinition(regionId))) return { valid: false, reason: "敌军目标损坏。" };
  }
  if (!Array.isArray(state.history) || state.history.length > gameConfig.maxTurns) return { valid: false, reason: "历史记录损坏。" };
  return { valid: true, reason: "存档有效。" };
}

export function SerializeState(state) {
  const validation = ValidateState(state);
  if (!validation.valid) throw new Error(validation.reason);
  return JSON.stringify(state);
}

export function DeserializeState(serialized) {
  const state = JSON.parse(serialized);
  const validation = ValidateState(state);
  if (!validation.valid) throw new Error(validation.reason);
  return state;
}

function ChooseFirstAvailableAction(state, actionIds, regionIds) {
  for (const regionId of regionIds) {
    for (const actionId of actionIds) {
      if (GetActionAvailability(state, actionId, regionId).available) return { actionId, regionId };
    }
  }
  return null;
}

function QueueFirstAvailableAction(state, actionIds, regionIds) {
  const action = ChooseFirstAvailableAction(state, actionIds, regionIds);
  return action ? QueueAction(state, action.actionId, action.regionId) : state;
}

function GetSimulationOrganizeRegionIds(state) {
  return Object.values(state.regions)
    .sort((left, right) => {
      const leftPriority = left.network === 2 ? 0 : left.network === 1 ? 1 : left.network === 3 ? 2 : 3;
      const rightPriority = right.network === 2 ? 0 : right.network === 1 ? 1 : right.network === 3 ? 2 : 3;
      return leftPriority - rightPriority || right.support - left.support || left.damage - right.damage;
    })
    .map((region) => region.id);
}

function GetSimulationRailRegionIds(state, preferredRegionIds = []) {
  const preferred = new Set(preferredRegionIds);
  return regionDefinitions
    .filter((definition) => definition.rail)
    .sort((left, right) => (
      Number(preferred.has(right.id)) - Number(preferred.has(left.id))
      || state.regions[right.id].network - state.regions[left.id].network
      || state.regions[left.id].exposure - state.regions[right.id].exposure
    ))
    .map((definition) => definition.id);
}

function PrepareSimulationTurn(state, strategyId) {
  let nextState = Clone(state);
  const chapter = GetChapter(nextState);
  if (strategyId === "balanced") {
    const choiceSequence = [
      "ProtectVillages", "ScatterGranaries", "MedicalSupport", "VillageWarning",
      "ConcentrateMedicine", "TrainMedics", "RestoreVillages", "ReliefDemobilize",
    ];
    const stanceSequence = ["PeopleFirst", "Recovery", "Disruption", "Recovery", "PeopleFirst", "PeopleFirst", "PeopleFirst", "PeopleFirst"];
    const productionSequence = ["Intelligence", "Supplies", "Intelligence", "Supplies", "Arms", "Arms", "Intelligence", "Arms"];
    nextState = ChooseCrisisResponse(nextState, choiceSequence[nextState.turn] || chapter.choices[0].id);
    nextState = SetStance(nextState, stanceSequence[nextState.turn] || "PeopleFirst");
    nextState = SetProductionPriority(nextState, productionSequence[nextState.turn] || "Supplies");
    const focusSequence = ["MassLine", "MassLine", "TunnelWarfare", "TunnelWarfare", "LeanAdministration", "LeanAdministration", "MineWarfare", "MineWarfare"];
    const focusId = focusSequence[nextState.turn];
    if (focusId && !nextState.completedFocusIds.includes(focusId)) nextState = SetFocus(nextState, focusId);
    const visibleIntent = GetEnemyIntentPreview(nextState);
    const confirmedRegionIds = [...visibleIntent.confirmedTargetIds];
    const possibleRegionIds = [...visibleIntent.possibleTargetIds];
    const visibleRegionIds = [...new Set([...confirmedRegionIds, ...possibleRegionIds])];
    const organizeRegionIds = GetSimulationOrganizeRegionIds(nextState);
    const railRegionIds = GetSimulationRailRegionIds(nextState);
    const confirmedRailRegionIds = [
      ...confirmedRegionIds.filter((regionId) => GetRegionDefinition(regionId)?.rail),
      ...railRegionIds.filter((regionId) => !confirmedRegionIds.includes(regionId)),
    ];
    switch (nextState.turn) {
      case 0:
        nextState = QueueFirstAvailableAction(nextState, ["Evacuate"], confirmedRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["SecureGrain"], confirmedRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Recon"], possibleRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Organize"], organizeRegionIds);
        break;
      case 1:
      case 3:
        nextState = QueueFirstAvailableAction(nextState, ["Sabotage"], railRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Sabotage"], railRegionIds);
        break;
      case 2:
        nextState = QueueFirstAvailableAction(nextState, ["Sabotage"], confirmedRailRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Evacuate"], confirmedRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["SecureGrain"], confirmedRegionIds);
        break;
      case 4:
        nextState = QueueFirstAvailableAction(nextState, ["Ambush"], confirmedRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Evacuate"], confirmedRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["SecureGrain"], confirmedRegionIds);
        break;
      case 5:
        nextState = QueueFirstAvailableAction(nextState, ["Evacuate"], confirmedRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["SecureGrain"], confirmedRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Recon"], confirmedRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Organize"], organizeRegionIds);
        break;
      case 6:
        nextState = QueueFirstAvailableAction(nextState, ["Evacuate"], confirmedRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Evacuate"], visibleRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Organize"], organizeRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Organize"], organizeRegionIds);
        break;
      case 7:
        nextState = QueueFirstAvailableAction(nextState, ["Sabotage"], confirmedRailRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Evacuate"], confirmedRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Organize"], organizeRegionIds);
        nextState = QueueFirstAvailableAction(nextState, ["Recon"], confirmedRegionIds);
        break;
      default:
        break;
    }
    while (GetPlanningSummary(nextState).commandRemaining > 0) {
      const fallbackRegionIds = [...visibleRegionIds, ...Object.values(nextState.regions).sort((left, right) => right.exposure - left.exposure).map((region) => region.id)];
      const fallbackAction = ChooseFirstAvailableAction(nextState, ["SecureGrain", "Recon", "Conceal"], fallbackRegionIds);
      if (!fallbackAction) break;
      nextState = QueueAction(nextState, fallbackAction.actionId, fallbackAction.regionId);
    }
  } else if (strategyId === "reckless") {
    nextState = ChooseCrisisResponse(nextState, chapter.choices.find((choice) => choice.tone === "military")?.id || chapter.choices[0].id);
    nextState = SetStance(nextState, "Disruption");
    nextState = SetProductionPriority(nextState, "Arms");
    const regionIds = Object.values(nextState.regions).sort((left, right) => right.exposure - left.exposure).map((region) => region.id);
    while (GetPlanningSummary(nextState).commandRemaining > 0) {
      const action = ChooseFirstAvailableAction(nextState, ["Ambush", "Sabotage", "Organize"], regionIds);
      if (!action) break;
      nextState = QueueAction(nextState, action.actionId, action.regionId);
    }
  } else {
    nextState = ChooseCrisisResponse(nextState, chapter.choices[0].id);
    nextState = SetStance(nextState, "Recovery");
    nextState = SetProductionPriority(nextState, "Supplies");
  }
  return nextState;
}

export function RunDeterministicCampaign(strategyId = "balanced", seed = 19370707) {
  let state = CreateInitialState(seed);
  let guard = 0;
  while (state.status === "active" && guard < gameConfig.maxTurns + 2) {
    state = PrepareSimulationTurn(state, strategyId);
    state = ResolveTurn(state);
    guard += 1;
  }
  return state;
}
