/**
 * 《太行敌后：一九四一》纯规则层。
 *
 * 这是一个 1941 年 9 月至 1942 年 12 月的综合化县域模型，不对应某一个
 * 真实县。规则的重心是根据地建设：群众联系、生产、专业机构、交通网络和
 * 提前疏散决定根据地能否存续；战斗只承担掩护和有限破袭。平民遭受的代价
 * 只写入不可逆的代价账本，不兑换资源，也不进入胜利分数。
 */

export const saveVersion = 1;
export const saveKey = "enemyrear1941_campaign_v1";
export const turnLimit = 16;

const mapWidth = 9;
const mapHeight = 7;
const maximumResource = 99;
const maximumMeter = 100;
const hexDirections = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([1, -1]),
  Object.freeze([0, -1]),
  Object.freeze([-1, 0]),
  Object.freeze([-1, 1]),
  Object.freeze([0, 1]),
]);

function FreezeDefinitions(definitions) {
  return Object.freeze(definitions.map((definition) => Object.freeze({
    ...definition,
    ...(definition.cost && typeof definition.cost === "object"
      ? { cost: Object.freeze({ ...definition.cost }) }
      : {}),
    ...(definition.yield ? { yield: Object.freeze({ ...definition.yield }) } : {}),
    ...(definition.unlocks ? { unlocks: Object.freeze([...definition.unlocks]) } : {}),
    ...(definition.effects ? { effects: Object.freeze({ ...definition.effects }) } : {}),
  })));
}

export const terrainDefinitions = FreezeDefinitions([
  {
    id: "Mountain",
    label: "深山",
    moveCost: 2,
    enemyMoveCost: 3,
    defense: 3,
    concealment: 3,
    yield: { grain: 0, arms: 1, medicine: 0, intel: 1 },
    description: "产出有限，但利于隐蔽、交通和反扫荡。",
  },
  {
    id: "Hill",
    label: "丘陵",
    moveCost: 1,
    enemyMoveCost: 2,
    defense: 2,
    concealment: 2,
    yield: { grain: 1, arms: 1, medicine: 0, intel: 0 },
    description: "可修梯田，也能设置隐蔽工场。",
  },
  {
    id: "Forest",
    label: "林地",
    moveCost: 2,
    enemyMoveCost: 2,
    defense: 2,
    concealment: 3,
    yield: { grain: 1, arms: 0, medicine: 1, intel: 1 },
    description: "适合隐蔽观察和采集药材。",
  },
  {
    id: "Plain",
    label: "平地",
    moveCost: 1,
    enemyMoveCost: 1,
    defense: 0,
    concealment: 0,
    yield: { grain: 2, arms: 0, medicine: 0, intel: 0 },
    description: "粮食产出较高，但暴露在公路和据点视野内。",
  },
  {
    id: "RiverValley",
    label: "河谷",
    moveCost: 2,
    enemyMoveCost: 2,
    defense: 1,
    concealment: 1,
    yield: { grain: 3, arms: 0, medicine: 1, intel: 0 },
    description: "肥沃但交通受桥梁与封锁控制。",
  },
]);

export const institutionDefinitions = FreezeDefinitions([
  {
    id: "PartyBranch",
    label: "基层党支部",
    actionId: "buildPartyBranch",
    required: 8,
    contactRequired: 35,
    cost: { grain: 1, arms: 1, cadres: 1 },
    doctrine: "MassLine",
    description: "每回合巩固联系，定期培养基层干部，并强化群众纪律。",
  },
  {
    id: "Cooperative",
    label: "互助合作社",
    actionId: "buildCooperative",
    required: 8,
    contactRequired: 35,
    cost: { grain: 2, arms: 1 },
    doctrine: "RentAndInterestReduction",
    description: "提高粮食产出并缓解困苦，表现生产自救而非向村庄抽取固定税赋。",
  },
  {
    id: "Clinic",
    label: "救护所",
    actionId: "buildClinic",
    required: 9,
    contactRequired: 30,
    cost: { grain: 2, arms: 1, medicine: 1 },
    doctrine: "MassLine",
    description: "生产有限药品，缓解困苦，并在扫荡中减少生计破坏。",
  },
  {
    id: "Arsenal",
    label: "兵工小组",
    actionId: "buildArsenal",
    required: 10,
    contactRequired: 50,
    cost: { grain: 2, arms: 2, cadres: 1 },
    doctrine: "CooperativeProduction",
    description: "修造和复装有限军需；产量不高且会略微增加暴露。",
  },
  {
    id: "Station",
    label: "地下交通站",
    actionId: "buildStation",
    required: 7,
    contactRequired: 40,
    cost: { grain: 1, arms: 1, cadres: 1 },
    doctrine: "MassLine",
    description: "扩展战争迷雾视野，提供情报并更早显示敌军意图。",
  },
  {
    id: "Tunnels",
    label: "地道网",
    actionId: "buildTunnels",
    required: 12,
    contactRequired: 45,
    cost: { grain: 3, arms: 2, cadres: 1 },
    doctrine: "AntiSweepDefense",
    description: "显著减轻扫荡造成的生计破坏，并提高隐蔽疏散效果。",
  },
]);

export const improvementDefinitions = FreezeDefinitions([
  {
    id: "TerracedFields",
    label: "梯田与互助田",
    terrains: Object.freeze(["Plain", "RiverValley", "Hill"]),
    yield: { grain: 2, arms: 0, medicine: 0, intel: 0 },
    description: "由相邻村庄共同耕作的粮食改良。",
  },
  {
    id: "HiddenWorkshop",
    label: "隐蔽修械点",
    terrains: Object.freeze(["Mountain", "Hill"]),
    yield: { grain: 0, arms: 1, medicine: 0, intel: 1 },
    description: "利用山地隐蔽进行有限修造。",
  },
  {
    id: "ObservationPost",
    label: "山林观察哨",
    terrains: Object.freeze(["Forest", "Mountain"]),
    yield: { grain: 0, arms: 0, medicine: 0, intel: 2 },
    description: "扩大预警和交通观察能力。",
  },
]);

export const unitDefinitions = FreezeDefinitions([
  {
    id: "WorkTeam",
    label: "群众工作队",
    side: "player",
    strength: 1,
    readiness: 3,
    moves: 2,
    upkeep: 1,
    description: "组织、救济、建设和疏散的核心单位，不能主动进攻。",
  },
  {
    id: "Guerrilla",
    label: "游击队",
    side: "player",
    strength: 3,
    readiness: 3,
    moves: 2,
    upkeep: 1,
    description: "依靠地形、情报实施伏击和有限交通破袭。",
  },
  {
    id: "MainForce",
    label: "主力支队",
    side: "player",
    strength: 5,
    readiness: 4,
    moves: 2,
    upkeep: 2,
    description: "主要承担反扫荡防御；正面强攻并非本局的最优解。",
  },
  {
    id: "Militia",
    label: "村庄民兵",
    side: "player",
    strength: 2,
    readiness: 2,
    moves: 0,
    upkeep: 0,
    description: "只保卫本村，不作为可消耗的进攻单位。",
  },
  {
    id: "Search",
    label: "伪军搜索队",
    side: "enemy",
    strength: 3,
    readiness: 3,
    moves: 2,
    upkeep: 0,
    description: "沿公路搜索地下交通和村庄联系。",
  },
  {
    id: "Patrol",
    label: "日军巡逻队",
    side: "enemy",
    strength: 4,
    readiness: 3,
    moves: 2,
    upkeep: 0,
    description: "依托铁路和据点进行机动巡逻。",
  },
  {
    id: "SweepColumn",
    label: "扫荡纵队",
    side: "enemy",
    strength: 7,
    readiness: 4,
    moves: 2,
    upkeep: 0,
    description: "在警告后进入目标区域，必须依靠疏散、地道和伏击共同应对。",
  },
  {
    id: "Garrison",
    label: "据点守备队",
    side: "enemy",
    strength: 8,
    readiness: 4,
    moves: 0,
    upkeep: 0,
    description: "铁路供应中断时战力下降，但不适合早期正面攻打。",
  },
]);

export const doctrineDefinitions = FreezeDefinitions([
  {
    id: "MassLine",
    tree: "civilian",
    tier: 0,
    cost: 0,
    prerequisite: null,
    label: "群众路线",
    description: "工作从群众实际困难出发；组织和救济相互支撑。",
    unlocks: ["buildPartyBranch", "buildClinic", "buildStation"],
  },
  {
    id: "RentAndInterestReduction",
    tree: "civilian",
    tier: 1,
    cost: 16,
    prerequisite: "MassLine",
    label: "减租减息与民主议事",
    description: "提高联系工作的持续性，并解锁互助合作社。",
    unlocks: ["buildCooperative", "UnitedFrontCouncil"],
  },
  {
    id: "CooperativeProduction",
    tree: "civilian",
    tier: 2,
    cost: 36,
    prerequisite: "RentAndInterestReduction",
    label: "生产自救",
    description: "地块改良与合作生产效率提高，解锁兵工小组。",
    unlocks: ["buildArsenal", "MutualAidProduction"],
  },
  {
    id: "DemocraticBaseGovernance",
    tree: "civilian",
    tier: 3,
    cost: 60,
    prerequisite: "CooperativeProduction",
    label: "抗日民主政权",
    description: "统一战线与基层议事稳定运作，获得第五道行动令。",
    unlocks: ["ThreeThirdsSystem"],
  },
  {
    id: "DeepShelterNetwork",
    tree: "civilian",
    tier: 4,
    cost: 84,
    prerequisite: "DemocraticBaseGovernance",
    label: "分散坚持与深层安置",
    description: "恢复、疏散和隐蔽交通进一步协同。",
    unlocks: ["PublicGrainFirst"],
  },
  {
    id: "MobileGuerrilla",
    tree: "military",
    tier: 0,
    cost: 0,
    prerequisite: null,
    label: "机动游击",
    description: "避免无准备的正面消耗，利用山林和民兵掩护。",
    unlocks: ["FlexibleDispersion"],
  },
  {
    id: "IntelligenceBeforeAction",
    tree: "military",
    tier: 1,
    cost: 16,
    prerequisite: "MobileGuerrilla",
    label: "情报先行",
    description: "侦察所得增加，伏击风险降低。",
    unlocks: ["IntelligenceNetwork"],
  },
  {
    id: "MineAndSabotage",
    tree: "military",
    tier: 2,
    cost: 34,
    prerequisite: "IntelligenceBeforeAction",
    label: "地雷与交通破袭",
    description: "铁路停运时间增加，但仍需控制行动频率和暴露。",
    unlocks: ["RailDisruptionCells"],
  },
  {
    id: "AntiSweepDefense",
    tree: "military",
    tier: 3,
    cost: 56,
    prerequisite: "MineAndSabotage",
    label: "反扫荡体系",
    description: "民兵、地道、情报和主力防御共同发挥作用。",
    unlocks: ["buildTunnels", "MilitiaScreen"],
  },
  {
    id: "CoordinatedDefense",
    tree: "military",
    tier: 4,
    cost: 80,
    prerequisite: "AntiSweepDefense",
    label: "军民协同防御",
    description: "相邻村庄和主力支队可以共同承受最后阶段的扫荡。",
    unlocks: ["CoordinatedAmbush"],
  },
]);

export const policyDefinitions = FreezeDefinitions([
  {
    id: "MassDiscipline",
    label: "群众纪律",
    doctrine: "MassLine",
    kind: "civilian",
    description: "组织与救济多获得联系，破袭造成的暴露略低。",
    effects: { organizeContact: 3, reliefContact: 2, exposureMultiplier: 0.9 },
  },
  {
    id: "FlexibleDispersion",
    label: "分散隐蔽",
    doctrine: "MobileGuerrilla",
    kind: "military",
    description: "疏散与山地防御效果提高，主动战斗贡献略低但更稳健。",
    effects: { sweepMultiplier: 0.82, evacuationMultiplier: 0.85 },
  },
  {
    id: "UnitedFrontCouncil",
    label: "统一战线议事会",
    doctrine: "RentAndInterestReduction",
    kind: "civilian",
    description: "组织提高更多团结度，低联系村庄更容易参与互助。",
    effects: { unityGain: 3, lowContactBonus: 4 },
  },
  {
    id: "MutualAidProduction",
    label: "军民生产互助",
    doctrine: "CooperativeProduction",
    kind: "civilian",
    description: "合作社与改良地块的粮食产出提高。",
    effects: { grainBonus: 1, hardshipRecovery: 1 },
  },
  {
    id: "ThreeThirdsSystem",
    label: "三三制协商",
    doctrine: "DemocraticBaseGovernance",
    kind: "civilian",
    description: "统一战线更加稳定，建设队列每回合多获得一点工程进度。",
    effects: { constructionBonus: 1, unityFloor: 55 },
  },
  {
    id: "IntelligenceNetwork",
    label: "交通情报网",
    doctrine: "IntelligenceBeforeAction",
    kind: "military",
    description: "侦察多获得一点情报，扫荡警告更加清楚。",
    effects: { reconIntel: 1, warningBonus: 1 },
  },
  {
    id: "RailDisruptionCells",
    label: "破袭小组",
    doctrine: "MineAndSabotage",
    kind: "military",
    description: "铁路多停运一回合，破袭暴露略有下降。",
    effects: { sabotageDuration: 1, exposureMultiplier: 0.84 },
  },
  {
    id: "MilitiaScreen",
    label: "民兵警戒圈",
    doctrine: "AntiSweepDefense",
    kind: "military",
    description: "村庄民兵防御提高，并减少搜索队造成的破坏。",
    effects: { militiaDefense: 2, sweepMultiplier: 0.88 },
  },
  {
    id: "PublicGrainFirst",
    label: "公共粮先救急",
    doctrine: "DeepShelterNetwork",
    kind: "civilian",
    description: "救济少消耗一点粮秣，但本政策不直接产生粮食。",
    effects: { reliefGrainDiscount: 1 },
  },
  {
    id: "CoordinatedAmbush",
    label: "军民协同伏击",
    doctrine: "CoordinatedDefense",
    kind: "military",
    description: "预警村庄中的主力、游击队与民兵共同防御。",
    effects: { defenseBonus: 2, ambushBonus: 1 },
  },
]);

export const actionDefinitions = FreezeDefinitions([
  {
    id: "move",
    label: "移动",
    kind: "movement",
    cost: { command: 1 },
    description: "按地形移动一个单位；道路通行更快，敌占据点不可直接进入。",
  },
  {
    id: "recon",
    label: "侦察敌情",
    kind: "intelligence",
    cost: { command: 1 },
    description: "扩大视野、获得情报，并识别邻近扫荡意图。",
  },
  {
    id: "organize",
    label: "深入走访",
    kind: "civilian",
    cost: { command: 1, grain: 1 },
    description: "工作队解决实际问题、召开议事并提高村庄联系度。",
  },
  {
    id: "relief",
    label: "救济与恢复",
    kind: "civilian",
    cost: { command: 1, grain: 3, medicine: 1 },
    description: "降低困苦并修复少量生计；严重困苦时应优先于扩张组织。",
  },
  {
    id: "evacuate",
    label: "疏散安置",
    kind: "civilian",
    cost: { command: 1, grain: 2, intel: 1 },
    description: "把部分住户转移至隐蔽安置点，代价写入账本，但能显著减轻扫荡伤害。",
  },
  {
    id: "buildPartyBranch",
    label: "筹建基层党支部",
    kind: "construction",
    cost: { command: 1, grain: 1, arms: 1, cadres: 1 },
    institutionId: "PartyBranch",
    description: "启动本村唯一的专业机构建设队列。",
  },
  {
    id: "buildCooperative",
    label: "筹建互助合作社",
    kind: "construction",
    cost: { command: 1, grain: 2, arms: 1 },
    institutionId: "Cooperative",
    description: "启动合作生产建设队列。",
  },
  {
    id: "buildClinic",
    label: "筹建救护所",
    kind: "construction",
    cost: { command: 1, grain: 2, arms: 1, medicine: 1 },
    institutionId: "Clinic",
    description: "启动救护所建设队列。",
  },
  {
    id: "buildArsenal",
    label: "筹建兵工小组",
    kind: "construction",
    cost: { command: 1, grain: 2, arms: 2, cadres: 1 },
    institutionId: "Arsenal",
    description: "启动有限修械生产建设队列。",
  },
  {
    id: "buildStation",
    label: "筹建地下交通站",
    kind: "construction",
    cost: { command: 1, grain: 1, arms: 1, cadres: 1 },
    institutionId: "Station",
    description: "启动地下交通和情报设施建设队列。",
  },
  {
    id: "buildTunnels",
    label: "筹建地道网",
    kind: "construction",
    cost: { command: 1, grain: 3, arms: 2, cadres: 1 },
    institutionId: "Tunnels",
    description: "启动需要长期投入的地道建设队列。",
  },
  {
    id: "constructionDrive",
    label: "集中施工",
    kind: "construction",
    cost: { command: 1, grain: 1 },
    description: "工作队协助现有建设队列，本回合追加工程进度。",
  },
  {
    id: "improveTile",
    label: "改良地块",
    kind: "construction",
    cost: { command: 1, grain: 1, arms: 1 },
    description: "按地形建设梯田、隐蔽修械点或观察哨，供邻近村庄工作。",
  },
  {
    id: "selfProduction",
    label: "生产自救",
    kind: "production",
    cost: { command: 1 },
    description: "让一个相连村庄集中投入当月生产，获得额外地块产出。",
  },
  {
    id: "ambush",
    label: "有限伏击",
    kind: "military",
    cost: { command: 1, arms: 1, intel: 1 },
    description: "依靠情报和地形迫使搜索或扫荡力量退却，不追求歼灭数字。",
  },
  {
    id: "sabotage",
    label: "铁路破袭",
    kind: "military",
    cost: { command: 1, arms: 1 },
    description: "暂时切断铁路并形成战略牵制；现有情报会自动投入，否则暴露和纪律代价更高。",
  },
  {
    id: "rest",
    label: "整训救护",
    kind: "recovery",
    cost: { command: 1, medicine: 1 },
    description: "在司令部或救护所恢复单位战备。",
  },
]);

export const historicalTurns = FreezeDefinitions([
  {
    turn: 1,
    date: "1941年9月",
    title: "秋收与封锁线",
    summary: "占领军依托铁路和据点蚕食山区。根据地必须先保住秋收，再扩展地下联系。",
    yieldModifier: 1.15,
    enemyPressure: 1,
    sweepTargets: 0,
    hardshipPulse: 0,
  },
  {
    turn: 2,
    date: "1941年10月",
    title: "据点向山口推进",
    summary: "搜索队沿公路逼近村庄，公开建设会提高目标权重。",
    yieldModifier: 1,
    enemyPressure: 2,
    sweepTargets: 0,
    hardshipPulse: 0,
  },
  {
    turn: 3,
    date: "1941年11月",
    title: "冬季封锁收紧",
    summary: "交通和药品更加紧张，地下交通站能更早发现敌军意图。",
    yieldModifier: 0.9,
    enemyPressure: 2,
    sweepTargets: 0,
    hardshipPulse: 2,
  },
  {
    turn: 4,
    date: "1941年12月",
    title: "道路严查",
    summary: "铁路、公路节点受到严密检查；高暴露行动将引来局部搜索。",
    yieldModifier: 0.85,
    enemyPressure: 3,
    sweepTargets: 0,
    hardshipPulse: 2,
  },
  {
    turn: 5,
    date: "1942年1月",
    title: "严冬中的分散坚持",
    summary: "严寒增加部队给养压力，村庄恢复与整训比冒险进攻更重要。",
    yieldModifier: 0.75,
    enemyPressure: 3,
    sweepTargets: 0,
    hardshipPulse: 4,
    extraUpkeep: 1,
  },
  {
    turn: 6,
    date: "1942年2月",
    title: "地下联络重整",
    summary: "利用短暂间隙修复交通和基层组织，为春季困难做准备。",
    yieldModifier: 0.9,
    enemyPressure: 2,
    sweepTargets: 0,
    hardshipPulse: 0,
  },
  {
    turn: 7,
    date: "1942年3月",
    title: "春荒",
    summary: "存粮见底，困苦使脱离实际的组织工作失效。救济和互助生产是本月重点。",
    yieldModifier: 0.7,
    enemyPressure: 2,
    sweepTargets: 0,
    hardshipPulse: 5,
  },
  {
    turn: 8,
    date: "1942年4月",
    title: "扫荡迹象",
    summary: "交通员报告多路兵力集结。请依据警告建设地道、疏散住户并布置有限伏击。",
    yieldModifier: 0.9,
    enemyPressure: 4,
    sweepTargets: 0,
    hardshipPulse: 1,
    warnsNextSweep: true,
  },
  {
    turn: 9,
    date: "1942年5月",
    title: "五月反扫荡",
    summary: "占领军多路进入山区。没有群众联系和预警的正面硬拼将同时损害部队与村庄。",
    yieldModifier: 0.65,
    enemyPressure: 7,
    sweepTargets: 2,
    sweepIntensity: 3,
    hardshipPulse: 4,
  },
  {
    turn: 10,
    date: "1942年6月",
    title: "分散坚持",
    summary: "扫荡之后必须恢复组织和生产，不能把破袭贡献当作民生恢复的替代品。",
    yieldModifier: 0.8,
    enemyPressure: 4,
    sweepTargets: 0,
    hardshipPulse: 2,
  },
  {
    turn: 11,
    date: "1942年7月",
    title: "雨季交通困难",
    summary: "山路泥泞，公路巡逻减慢，交通站和本地生产的价值上升。",
    yieldModifier: 0.9,
    enemyPressure: 3,
    sweepTargets: 0,
    hardshipPulse: 1,
    difficultMovement: true,
  },
  {
    turn: 12,
    date: "1942年8月",
    title: "恢复生产",
    summary: "群众互助、救护和小型修械共同恢复根据地承受能力。",
    yieldModifier: 1,
    enemyPressure: 3,
    sweepTargets: 0,
    hardshipPulse: 0,
  },
  {
    turn: 13,
    date: "1942年9月",
    title: "秋收保卫",
    summary: "争取秋收需要组织民兵、隐蔽交通和有限牵制，而非追逐据点。",
    yieldModifier: 1.2,
    enemyPressure: 4,
    sweepTargets: 0,
    hardshipPulse: 0,
  },
  {
    turn: 14,
    date: "1942年10月",
    title: "治安强化再临",
    summary: "敌军再次搜索交通网；此前的建设和纪律将决定暴露范围。",
    yieldModifier: 1,
    enemyPressure: 5,
    sweepTargets: 0,
    hardshipPulse: 1,
  },
  {
    turn: 15,
    date: "1942年11月",
    title: "冬季反扫荡",
    summary: "一轮较小规模扫荡检验村庄专业机构、疏散与军民协同防御。",
    yieldModifier: 0.85,
    enemyPressure: 6,
    sweepTargets: 1,
    sweepIntensity: 2,
    hardshipPulse: 3,
  },
  {
    turn: 16,
    date: "1942年12月",
    title: "渡过最困难时期",
    summary: "本局只检验根据地是否在极端困难中保存组织、群众和有限抗战能力；历史尚未结束。",
    yieldModifier: 0.85,
    enemyPressure: 4,
    sweepTargets: 0,
    hardshipPulse: 1,
  },
]);

const actionById = new Map(actionDefinitions.map((definition) => [definition.id, definition]));
const doctrineById = new Map(doctrineDefinitions.map((definition) => [definition.id, definition]));
const policyById = new Map(policyDefinitions.map((definition) => [definition.id, definition]));
const terrainById = new Map(terrainDefinitions.map((definition) => [definition.id, definition]));
const unitById = new Map(unitDefinitions.map((definition) => [definition.id, definition]));
const institutionById = new Map(institutionDefinitions.map((definition) => [definition.id, definition]));
const improvementById = new Map(improvementDefinitions.map((definition) => [definition.id, definition]));

const terrainLayout = Object.freeze([
  Object.freeze(["Mountain", "Mountain", "Forest", "Hill", "Plain", "Plain", "Hill", "Plain", "Hill"]),
  Object.freeze(["Mountain", "Hill", "Hill", "Forest", "RiverValley", "Plain", "Plain", "Plain", "Hill"]),
  Object.freeze(["Forest", "Hill", "Plain", "Plain", "RiverValley", "Plain", "Hill", "Plain", "Hill"]),
  Object.freeze(["Mountain", "Hill", "Hill", "Plain", "RiverValley", "Plain", "Plain", "Plain", "Hill"]),
  Object.freeze(["Mountain", "Forest", "Hill", "Plain", "Plain", "Plain", "Hill", "Plain", "Forest"]),
  Object.freeze(["Mountain", "Hill", "Plain", "RiverValley", "Plain", "Hill", "Plain", "Plain", "Hill"]),
  Object.freeze(["Forest", "Mountain", "Hill", "Plain", "RiverValley", "Plain", "Plain", "Hill", "Mountain"]),
]);

const villageLayout = Object.freeze([
  Object.freeze({ q: 2, r: 1, name: "北岭村", households: 36, contact: 46, hardship: 24, livelihood: 76 }),
  Object.freeze({ q: 2, r: 3, name: "石门村", households: 42, contact: 56, hardship: 30, livelihood: 72 }),
  Object.freeze({ q: 1, r: 5, name: "柳沟村", households: 34, contact: 38, hardship: 26, livelihood: 78 }),
  Object.freeze({ q: 4, r: 1, name: "河湾村", households: 45, contact: 28, hardship: 35, livelihood: 68 }),
  Object.freeze({ q: 4, r: 4, name: "南坡村", households: 40, contact: 22, hardship: 38, livelihood: 66 }),
  Object.freeze({ q: 5, r: 6, name: "东坪村", households: 39, contact: 16, hardship: 32, livelihood: 70 }),
]);

const featureLayout = Object.freeze([
  Object.freeze({ q: 1, r: 3, feature: "Headquarters", name: "太行军分区驻地", control: "player" }),
  Object.freeze({ q: 6, r: 1, feature: "Stronghold", name: "北山口据点", control: "enemy" }),
  Object.freeze({ q: 6, r: 3, feature: "RailStation", name: "东河车站", control: "enemy" }),
  Object.freeze({ q: 6, r: 5, feature: "Stronghold", name: "南桥据点", control: "enemy" }),
  Object.freeze({ q: 8, r: 3, feature: "CountySeat", name: "县城守备司令部", control: "enemy" }),
]);

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function DeepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function HexId(q, r) {
  return `Hex_Q${q}_R${r}`;
}

function FindHexInternal(state, hexId) {
  return state.hexes.find((hex) => hex.id === hexId) || null;
}

function FindUnitInternal(state, unitId) {
  return state.units.find((unit) => unit.id === unitId) || null;
}

function FindEnemyInternal(state, enemyId) {
  return state.enemies.find((enemy) => enemy.id === enemyId) || null;
}

function GetHistoricalTurn(turn) {
  return historicalTurns[Clamp(turn, 1, turnLimit) - 1];
}

function NextRandom(state) {
  let randomState = Number(state.seed) >>> 0;
  if (randomState === 0) {
    randomState = 0x6d2b79f5;
  }
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  state.seed = randomState >>> 0;
  return state.seed / 4294967296;
}

function HexDistance(firstHex, secondHex) {
  const deltaQ = firstHex.q - secondHex.q;
  const deltaR = firstHex.r - secondHex.r;
  const deltaS = (-firstHex.q - firstHex.r) - (-secondHex.q - secondHex.r);
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(deltaS));
}

function IsVillage(hex) {
  return Boolean(hex && hex.feature === "Village");
}

function HasDoctrine(state, doctrineId) {
  return state.doctrines.civilian.unlocked.includes(doctrineId)
    || state.doctrines.military.unlocked.includes(doctrineId);
}

function HasPolicy(state, policyId) {
  return state.policies.includes(policyId);
}

function GetPolicyEffect(state, effectId, fallback = 0) {
  return state.policies.reduce((total, policyId) => {
    const policy = policyById.get(policyId);
    const value = policy?.effects?.[effectId];
    if (typeof value !== "number") {
      return total;
    }
    if (effectId.toLowerCase().includes("multiplier")) {
      return total * value;
    }
    return total + value;
  }, effectId.toLowerCase().includes("multiplier") ? 1 : fallback);
}

function GetInstitutionDefinitionByAction(actionId) {
  const action = actionById.get(actionId);
  return action?.institutionId ? institutionById.get(action.institutionId) : null;
}

function GetEffectiveActionCost(state, action) {
  const cost = { ...(action?.cost || {}) };
  if (action?.id === "relief") {
    cost.grain = Math.max(0, (cost.grain || 0) - GetPolicyEffect(state, "reliefGrainDiscount", 0));
  }
  return cost;
}

function CreateMap() {
  const hexes = [];
  for (let r = 0; r < mapHeight; r += 1) {
    for (let q = 0; q < mapWidth; q += 1) {
      const terrain = terrainLayout[r][q];
      const rail = q === 6 || (r === 3 && q === 7);
      const road = r === 3 || q === 4 || (q >= 5 && r === 6);
      hexes.push({
        id: HexId(q, r),
        q,
        r,
        name: terrainById.get(terrain).label,
        terrain,
        feature: null,
        control: rail ? "enemy" : "neutral",
        contact: 0,
        hardship: 0,
        livelihood: 0,
        households: 0,
        originalHouseholds: 0,
        visible: false,
        explored: false,
        rail,
        road,
        railDisabledTurns: 0,
        improvement: null,
        institution: null,
        construction: null,
        evacuated: false,
        evacuationProtection: 0,
        warning: null,
        scoutedUntil: 0,
      });
    }
  }

  for (const villageDefinition of villageLayout) {
    const hex = hexes.find((candidate) => candidate.q === villageDefinition.q && candidate.r === villageDefinition.r);
    Object.assign(hex, {
      name: villageDefinition.name,
      feature: "Village",
      control: villageDefinition.contact >= 35 ? "player" : "neutral",
      contact: villageDefinition.contact,
      hardship: villageDefinition.hardship,
      livelihood: villageDefinition.livelihood,
      households: villageDefinition.households,
      originalHouseholds: villageDefinition.households,
    });
  }

  for (const featureDefinition of featureLayout) {
    const hex = hexes.find((candidate) => candidate.q === featureDefinition.q && candidate.r === featureDefinition.r);
    Object.assign(hex, featureDefinition);
  }

  return hexes;
}

function CreatePlayerUnit(id, name, type, hexId) {
  const definition = unitById.get(type);
  return {
    id,
    name,
    type,
    hexId,
    strength: definition.strength,
    readiness: definition.readiness,
    maximumReadiness: definition.readiness,
    moves: definition.moves,
    maximumMoves: definition.moves,
    acted: false,
    moved: false,
    visible: true,
    intent: null,
  };
}

function CreateEnemyUnit(id, name, type, hexId, active = true) {
  const definition = unitById.get(type);
  return {
    id,
    name,
    type,
    hexId,
    strength: definition.strength,
    readiness: definition.readiness,
    maximumReadiness: definition.readiness,
    moves: definition.moves,
    maximumMoves: definition.moves,
    acted: false,
    visible: false,
    intent: "动向不明",
    active,
  };
}

function CalculateNetwork(state) {
  const villages = state.hexes.filter(IsVillage);
  if (villages.length === 0) {
    return 0;
  }
  const contactValue = villages.reduce((total, village) => {
    const survivalFactor = village.livelihood <= 0 ? 0 : Clamp(village.livelihood / 70, 0.25, 1);
    const institutionBonus = village.institution === "Station" || village.institution === "PartyBranch" ? 6 : 0;
    return total + (village.contact * survivalFactor) + institutionBonus;
  }, 0);
  return Clamp(Math.round(contactValue / villages.length), 0, maximumMeter);
}

function RefreshCommandMaximum(state) {
  const doctrineBonus = HasDoctrine(state, "DemocraticBaseGovernance") ? 1 : 0;
  state.commandMax = 4 + doctrineBonus;
  state.commandPoints = Clamp(state.commandPoints, 0, state.commandMax);
}

function RevealRadius(state, originHexId, radius) {
  const origin = FindHexInternal(state, originHexId);
  if (!origin) {
    return;
  }
  for (const hex of state.hexes) {
    if (HexDistance(origin, hex) <= radius) {
      hex.visible = true;
      hex.explored = true;
      hex.scoutedUntil = Math.max(hex.scoutedUntil, state.turn);
    }
  }
}

function UpdateVisibility(state) {
  for (const hex of state.hexes) {
    hex.visible = hex.scoutedUntil >= state.turn;
  }
  for (const unit of state.units) {
    RevealRadius(state, unit.hexId, unit.type === "WorkTeam" ? 1 : 2);
  }
  for (const village of state.hexes.filter(IsVillage)) {
    if (village.control === "player" && village.contact >= 60) {
      RevealRadius(state, village.id, 1);
    }
    if (village.institution === "Station") {
      RevealRadius(state, village.id, 3);
    }
  }
  for (const enemy of state.enemies) {
    const enemyHex = FindHexInternal(state, enemy.hexId);
    enemy.visible = Boolean(enemy.active && enemyHex?.visible);
    if (!enemy.visible && state.resources.intel < 5) {
      enemy.intent = "动向不明";
    }
  }
}

function ApplyOpeningConditions(state, turn) {
  const event = GetHistoricalTurn(turn);
  if (!event || !event.hardshipPulse) {
    return;
  }
  for (const village of state.hexes.filter(IsVillage)) {
    village.hardship = Clamp(village.hardship + event.hardshipPulse, 0, maximumMeter);
  }
  state.log.push(`${event.date}：${event.title}使各村困苦度上升 ${event.hardshipPulse}。`);
}

function SelectWarningTargets(state, targetCount, targetTurn) {
  const candidates = state.hexes
    .filter((hex) => IsVillage(hex) && hex.livelihood > 0)
    .map((hex) => {
      const institutionWeight = hex.institution ? 16 : 0;
      const roadWeight = hex.road ? 8 : 0;
      const exposureWeight = Math.round(state.meters.exposure * 0.25);
      const concealment = terrainById.get(hex.terrain)?.concealment || 0;
      const randomTie = Math.floor(NextRandom(state) * 7);
      return {
        hex,
        score: hex.contact + institutionWeight + roadWeight + exposureWeight - (concealment * 4) + randomTie,
      };
    })
    .sort((first, second) => second.score - first.score);

  for (const candidate of candidates.slice(0, targetCount)) {
    candidate.hex.warning = {
      turn: targetTurn,
      kind: "Sweep",
      intensity: GetHistoricalTurn(targetTurn)?.sweepIntensity || (state.meters.exposure >= 75 ? 2 : 1),
      text: `${targetTurn === 9 ? "多路扫荡" : "搜索扫荡"}可能指向${candidate.hex.name}`,
    };
  }
}

function PrepareWarningsForCurrentTurn(state) {
  const event = GetHistoricalTurn(state.turn);
  if (event.sweepTargets > 0) {
    const existingCount = state.hexes.filter((hex) => hex.warning?.turn === state.turn).length;
    if (existingCount < event.sweepTargets) {
      SelectWarningTargets(state, event.sweepTargets - existingCount, state.turn);
    }
  } else if (state.meters.exposure >= 62 && state.turn < turnLimit) {
    const hasCurrentWarning = state.hexes.some((hex) => hex.warning?.turn === state.turn);
    if (!hasCurrentWarning) {
      SelectWarningTargets(state, 1, state.turn);
    }
  }
}

function PrepareWarningsForNextTurn(state) {
  if (state.turn >= turnLimit) {
    return;
  }
  const nextTurn = state.turn + 1;
  const nextEvent = GetHistoricalTurn(nextTurn);
  const targetCount = nextEvent.sweepTargets > 0
    ? nextEvent.sweepTargets
    : (state.meters.exposure >= 62 ? 1 : 0);
  if (targetCount > 0) {
    SelectWarningTargets(state, targetCount, nextTurn);
  }
}

export function CreateInitialState(seed = 19410918) {
  const numericSeed = Number.isFinite(Number(seed)) ? (Number(seed) >>> 0) : 19410918;
  const state = {
    saveVersion: saveVersion,
    turn: 1,
    phase: "planning",
    seed: numericSeed || 19410918,
    initialSeed: numericSeed || 19410918,
    resources: {
      grain: 18,
      arms: 7,
      medicine: 4,
      intel: 3,
      cadres: 4,
    },
    meters: {
      people: 58,
      exposure: 20,
      contribution: 0,
      network: 0,
      unity: 60,
      discipline: 76,
    },
    commandMax: 4,
    commandPoints: 4,
    reserved: {
      grain: 0,
      arms: 0,
      medicine: 0,
      intel: 0,
      cadres: 0,
    },
    hexes: CreateMap(),
    units: [
      CreatePlayerUnit("Unit_WorkTeam_One", "太行群众工作队", "WorkTeam", HexId(2, 3)),
      CreatePlayerUnit("Unit_Guerrilla_One", "山地游击队", "Guerrilla", HexId(5, 3)),
      CreatePlayerUnit("Unit_MainForce_One", "军分区主力支队", "MainForce", HexId(3, 3)),
      CreatePlayerUnit("Unit_Militia_North", "北岭村民兵", "Militia", HexId(2, 1)),
      CreatePlayerUnit("Unit_Militia_Stone", "石门村民兵", "Militia", HexId(2, 3)),
    ],
    enemies: [
      CreateEnemyUnit("Enemy_Search_One", "东河搜索队", "Search", HexId(6, 3)),
      CreateEnemyUnit("Enemy_Patrol_North", "北线巡逻队", "Patrol", HexId(6, 2)),
      CreateEnemyUnit("Enemy_Patrol_South", "南线巡逻队", "Patrol", HexId(6, 5)),
      CreateEnemyUnit("Enemy_Garrison_North", "北山口守备队", "Garrison", HexId(6, 1)),
      CreateEnemyUnit("Enemy_Garrison_South", "南桥守备队", "Garrison", HexId(6, 5)),
      CreateEnemyUnit("Enemy_Sweep_One", "第一扫荡纵队", "SweepColumn", HexId(8, 3), false),
      CreateEnemyUnit("Enemy_Sweep_Two", "第二扫荡纵队", "SweepColumn", HexId(8, 3), false),
    ],
    orders: [],
    doctrines: {
      civilian: {
        experience: 0,
        unlocked: ["MassLine"],
      },
      military: {
        experience: 0,
        unlocked: ["MobileGuerrilla"],
      },
    },
    policies: ["MassDiscipline", "FlexibleDispersion"],
    ledger: {
      civilianCosts: [],
      displacedHouseholds: 0,
      affectedHouseholds: 0,
      livelihoodDestroyed: 0,
      villageAbandonments: [],
      combatLosses: [],
    },
    history: [],
    log: [
      "本地图为华北敌后综合化县域。平民受难只进入不可逆代价账本，不兑换资源或分数。",
      "核心循环：组织—生产—建设—疏散—有限破袭—反扫荡—恢复。",
    ],
    gameOver: false,
    lastError: null,
  };

  state.meters.network = CalculateNetwork(state);
  ApplyOpeningConditions(state, 1);
  UpdateVisibility(state);
  return state;
}

export function CloneState(state) {
  return DeepClone(state);
}

export function GetHex(state, hexId) {
  const hex = FindHexInternal(state, hexId);
  return hex ? DeepClone(hex) : null;
}

export function GetNeighbors(state, hexId) {
  const hex = FindHexInternal(state, hexId);
  if (!hex) {
    return [];
  }
  return hexDirections
    .map(([deltaQ, deltaR]) => FindHexInternal(state, HexId(hex.q + deltaQ, hex.r + deltaR)))
    .filter(Boolean)
    .map((neighbor) => DeepClone(neighbor));
}

function GetProjectedUnitHexId(state, unitId) {
  const unit = FindUnitInternal(state, unitId);
  if (!unit) {
    return null;
  }
  let projectedHexId = unit.hexId;
  for (const order of state.orders) {
    if (order.unitId === unitId && order.actionId === "move") {
      projectedHexId = order.targetHexId || order.hexId;
    }
  }
  return projectedHexId;
}

function HasProjectedAction(state, unitId) {
  return state.orders.some((order) => order.unitId === unitId && order.actionId !== "move");
}

function HasProjectedMove(state, unitId) {
  return state.orders.some((order) => order.unitId === unitId && order.actionId === "move");
}

function GetMoveCost(state, hex, unit) {
  const terrain = terrainById.get(hex.terrain);
  let moveCost = terrain?.moveCost || 1;
  if (hex.road || hex.rail) {
    moveCost = 1;
  }
  const event = GetHistoricalTurn(state.turn);
  if (event.difficultMovement && !hex.road && !hex.rail && hex.terrain !== "Mountain") {
    moveCost += 1;
  }
  if (unit.type === "Guerrilla" && (hex.terrain === "Mountain" || hex.terrain === "Forest")) {
    moveCost = 1;
  }
  return moveCost;
}

export function FindReachableHexes(state, unitId) {
  const unit = FindUnitInternal(state, unitId);
  if (!unit || unit.type === "Militia" || unit.readiness <= 0 || HasProjectedMove(state, unitId)) {
    return [];
  }
  const startHexId = GetProjectedUnitHexId(state, unitId);
  const startHex = FindHexInternal(state, startHexId);
  if (!startHex) {
    return [];
  }
  const maximumMoves = unit.moves || unit.maximumMoves;
  const frontier = [{ hexId: startHex.id, cost: 0, path: [startHex.id] }];
  const bestCosts = new Map([[startHex.id, 0]]);
  const results = [];

  while (frontier.length > 0) {
    frontier.sort((first, second) => first.cost - second.cost);
    const current = frontier.shift();
    const currentHex = FindHexInternal(state, current.hexId);
    for (const neighbor of GetNeighbors(state, current.hexId)) {
      const occupiedByEnemy = state.enemies.some((enemy) => enemy.active && enemy.hexId === neighbor.id);
      const blockedFeature = neighbor.control === "enemy"
        && ["Stronghold", "CountySeat", "RailStation"].includes(neighbor.feature);
      if (occupiedByEnemy || blockedFeature) {
        continue;
      }
      const nextCost = current.cost + GetMoveCost(state, neighbor, unit);
      if (nextCost > maximumMoves || nextCost >= (bestCosts.get(neighbor.id) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }
      bestCosts.set(neighbor.id, nextCost);
      const entry = {
        hexId: neighbor.id,
        cost: nextCost,
        path: [...current.path, neighbor.id],
        visible: neighbor.visible,
        risk: neighbor.control === "enemy" || neighbor.rail ? "可能暴露" : "",
      };
      results.push(entry);
      frontier.push(entry);
    }
  }
  return results;
}

function GetReservedResources(state) {
  const reserved = { grain: 0, arms: 0, medicine: 0, intel: 0, cadres: 0 };
  for (const order of state.orders) {
    const cost = order.cost || actionById.get(order.actionId)?.cost || {};
    for (const resourceId of Object.keys(reserved)) {
      reserved[resourceId] += cost[resourceId] || 0;
    }
  }
  return reserved;
}

function GetAvailableResource(state, resourceId) {
  const reserved = GetReservedResources(state);
  return (state.resources[resourceId] || 0) - (reserved[resourceId] || 0);
}

function GetTargetHexId(orderLike, projectedUnitHexId) {
  return orderLike.targetHexId || orderLike.hexId || projectedUnitHexId || null;
}

function FormatCost(cost) {
  const labels = {
    command: "令",
    grain: "粮",
    arms: "军械",
    medicine: "药",
    intel: "情报",
    cadres: "干部",
  };
  return Object.entries(cost || {})
    .filter(([, amount]) => amount > 0)
    .map(([resourceId, amount]) => `${amount}${labels[resourceId] || resourceId}`)
    .join(" · ");
}

function GetImprovementForTerrain(terrain) {
  if (terrain === "Plain" || terrain === "RiverValley") {
    return improvementById.get("TerracedFields");
  }
  if (terrain === "Hill") {
    return improvementById.get("TerracedFields");
  }
  if (terrain === "Mountain") {
    return improvementById.get("HiddenWorkshop");
  }
  return improvementById.get("ObservationPost");
}

function ValidateAction(state, actionId, selectedHexId, selectedUnitId, targetHexId = null) {
  const action = actionById.get(actionId);
  if (!action) {
    return { enabled: false, reason: "未知行动" };
  }
  if (state.gameOver || state.phase !== "planning") {
    return { enabled: false, reason: "当前不在规划阶段" };
  }
  const actionCost = GetEffectiveActionCost(state, action);
  if (state.commandPoints < (actionCost.command || 1)) {
    return { enabled: false, reason: "本回合行动令不足" };
  }
  for (const resourceId of ["grain", "arms", "medicine", "intel", "cadres"]) {
    if (GetAvailableResource(state, resourceId) < (actionCost[resourceId] || 0)) {
      return { enabled: false, reason: `${resourceId}储备不足或已被其他命令预留` };
    }
  }

  const unit = selectedUnitId ? FindUnitInternal(state, selectedUnitId) : null;
  const projectedHexId = unit ? GetProjectedUnitHexId(state, unit.id) : null;
  const resolvedTargetHexId = targetHexId || selectedHexId || projectedHexId;
  const targetHex = resolvedTargetHexId ? FindHexInternal(state, resolvedTargetHexId) : null;
  const unitHex = projectedHexId ? FindHexInternal(state, projectedHexId) : null;
  const requiresUnit = !["selfProduction"].includes(actionId);

  if (requiresUnit && !unit) {
    return { enabled: false, reason: "需要先选择单位" };
  }
  if (unit && unit.readiness <= 0 && actionId !== "rest") {
    return { enabled: false, reason: "单位已经失去行动能力" };
  }
  if (unit && HasProjectedAction(state, unit.id) && actionId !== "move") {
    return { enabled: false, reason: "该单位本回合已经安排主要行动" };
  }

  if (actionId === "move") {
    if (unit.type === "Militia" || unit.moves <= 0) {
      return { enabled: false, reason: "民兵只守本村，不能移动" };
    }
    if (HasProjectedAction(state, unit.id) || HasProjectedMove(state, unit.id)) {
      return { enabled: false, reason: "单位本回合不能再次移动" };
    }
    const reachable = FindReachableHexes(state, unit.id).some((entry) => entry.hexId === resolvedTargetHexId);
    return reachable
      ? { enabled: true, reason: "" }
      : { enabled: false, reason: "目标超出移动范围或被敌军占据" };
  }

  if (actionId === "recon") {
    if (unit.type === "Militia") {
      return { enabled: false, reason: "村庄民兵不能执行远程侦察" };
    }
    return { enabled: true, reason: "" };
  }

  if (["organize", "relief", "evacuate", "constructionDrive"].includes(actionId)
      || action.institutionId) {
    if (unit.type !== "WorkTeam") {
      return { enabled: false, reason: "该行动需要群众工作队" };
    }
    if (!targetHex || unitHex?.id !== targetHex.id || !IsVillage(targetHex)) {
      return { enabled: false, reason: "工作队必须位于目标村庄" };
    }
  }

  if (actionId === "organize") {
    if (targetHex.hardship >= 72) {
      return { enabled: false, reason: "困苦过重，应先救济和恢复生计" };
    }
    if (targetHex.contact >= 100) {
      return { enabled: false, reason: "该村联系已经稳固" };
    }
    return { enabled: true, reason: "" };
  }

  if (actionId === "relief") {
    if (targetHex.hardship <= 0 && targetHex.livelihood >= 100) {
      return { enabled: false, reason: "该村目前无需救济" };
    }
    return { enabled: true, reason: "" };
  }

  if (actionId === "evacuate") {
    if (targetHex.evacuated || targetHex.households <= 4) {
      return { enabled: false, reason: "该村已经完成本阶段疏散" };
    }
    if (!targetHex.warning && state.meters.exposure < 55) {
      return { enabled: false, reason: "当前没有明确威胁；盲目转移会徒增流离" };
    }
    return { enabled: true, reason: "" };
  }

  if (action.institutionId) {
    const institution = institutionById.get(action.institutionId);
    if (targetHex.institution || targetHex.construction
      || state.orders.some((order) => order.hexId === targetHex.id && actionById.get(order.actionId)?.institutionId)) {
      return { enabled: false, reason: "每村只能有一个专业机构，且同一时间只有一条建设队列" };
    }
    if (targetHex.contact < institution.contactRequired) {
      return { enabled: false, reason: `联系度需达到 ${institution.contactRequired}` };
    }
    if (!HasDoctrine(state, institution.doctrine)) {
      return { enabled: false, reason: `需要路线：${doctrineById.get(institution.doctrine)?.label}` };
    }
    return { enabled: true, reason: "" };
  }

  if (actionId === "constructionDrive") {
    return targetHex.construction
      ? { enabled: true, reason: "" }
      : { enabled: false, reason: "该村目前没有建设队列" };
  }

  if (actionId === "improveTile") {
    if (unit.type !== "WorkTeam") {
      return { enabled: false, reason: "地块改良需要群众工作队" };
    }
    if (!targetHex || !unitHex || HexDistance(unitHex, targetHex) > 1) {
      return { enabled: false, reason: "工作队必须位于目标地块或相邻地块" };
    }
    if (targetHex.feature || targetHex.improvement || targetHex.control === "enemy") {
      return { enabled: false, reason: "该地块不能改良" };
    }
    return { enabled: true, reason: "" };
  }

  if (actionId === "selfProduction") {
    if (!targetHex || !(IsVillage(targetHex) || targetHex.feature === "Headquarters")) {
      return { enabled: false, reason: "请选择相连村庄或根据地驻地" };
    }
    if (IsVillage(targetHex) && (targetHex.contact < 30 || targetHex.livelihood <= 0)) {
      return { enabled: false, reason: "该村尚未接入共同生产网络" };
    }
    if (state.orders.some((order) => order.actionId === "selfProduction" && order.hexId === targetHex.id)) {
      return { enabled: false, reason: "该地本回合已经安排生产" };
    }
    return { enabled: true, reason: "" };
  }

  if (actionId === "ambush") {
    if (!["Guerrilla", "MainForce"].includes(unit.type)) {
      return { enabled: false, reason: "只有游击队或主力支队可以伏击" };
    }
    if (!targetHex || !unitHex || HexDistance(unitHex, targetHex) > 1) {
      return { enabled: false, reason: "伏击目标必须位于本格或相邻格" };
    }
    const enemyPresent = state.enemies.some((enemy) => enemy.active && enemy.hexId === targetHex.id);
    if (!enemyPresent && !targetHex.warning) {
      return { enabled: false, reason: "目标格没有敌军或已预警的扫荡路线" };
    }
    return { enabled: true, reason: "" };
  }

  if (actionId === "sabotage") {
    if (!["Guerrilla", "MainForce"].includes(unit.type)) {
      return { enabled: false, reason: "只有游击队或主力支队可以执行破袭" };
    }
    if (!targetHex?.rail || !unitHex || HexDistance(unitHex, targetHex) > 1) {
      return { enabled: false, reason: "必须接近铁路目标" };
    }
    if (targetHex.railDisabledTurns > 0) {
      return { enabled: false, reason: "该段铁路仍处于停运状态" };
    }
    const garrisonPresent = state.enemies.some((enemy) => enemy.active
      && enemy.hexId === targetHex.id && enemy.type === "Garrison");
    if (garrisonPresent) {
      return { enabled: false, reason: "据点守备严密，不能直接破袭" };
    }
    return { enabled: true, reason: "" };
  }

  if (actionId === "rest") {
    const currentHex = unitHex;
    const canRest = currentHex?.feature === "Headquarters" || currentHex?.institution === "Clinic";
    if (!canRest) {
      return { enabled: false, reason: "整训救护必须在驻地或救护所进行" };
    }
    if (unit.readiness >= unit.maximumReadiness) {
      return { enabled: false, reason: "单位战备已经完整" };
    }
    return { enabled: true, reason: "" };
  }

  return { enabled: true, reason: "" };
}

function BuildPreviewText(state, action, targetHex, unit) {
  const effects = [];
  const risks = [];
  switch (action.id) {
    case "move":
      effects.push(`移动${unit?.name || "单位"}至${targetHex?.name || "目标地块"}`);
      if (targetHex && !targetHex.visible) risks.push("将进入尚未查明的战争迷雾");
      break;
    case "recon":
      effects.push(`以${unit?.hexId ? FindHexInternal(state, GetProjectedUnitHexId(state, unit.id))?.name : "当前位置"}为中心扩大视野`);
      effects.push(`获得 ${2 + (HasDoctrine(state, "IntelligenceBeforeAction") ? 1 : 0) + GetPolicyEffect(state, "reconIntel", 0)} 情报`);
      break;
    case "organize":
      effects.push(`提高${targetHex?.name}联系度，并略微降低困苦`);
      effects.push("获得群众路线经验，提升团结和群众基础");
      if ((targetHex?.hardship || 0) > 55) risks.push("困苦较重，组织效果将打折");
      break;
    case "relief":
      effects.push(`降低${targetHex?.name}困苦并修复生计`);
      effects.push("救济不会产生军事贡献，但会维持长期生产和联系");
      break;
    case "evacuate":
      effects.push(`转移约 ${Math.ceil((targetHex?.households || 0) * 0.35)} 户至隐蔽安置点`);
      effects.push("下次扫荡造成的生计和受影响住户显著下降");
      risks.push("流离代价将不可逆写入账本，不作为分数或资源");
      break;
    case "selfProduction":
      effects.push(`获得${targetHex?.name}本地地块的额外产出`);
      risks.push("集中劳动会使困苦略微上升");
      break;
    case "ambush":
      effects.push("尝试迫使邻近搜索或扫荡力量退却");
      effects.push("增加军事路线经验和战略牵制");
      risks.push("行动暴露根据地，战备也可能下降");
      break;
    case "sabotage":
      effects.push(`使${targetHex?.name}铁路停运至少 2 回合`);
      effects.push("立即增加战略牵制");
      risks.push("显著提高暴露，之后必须转入疏散和恢复");
      break;
    case "rest":
      effects.push(`恢复${unit?.name} 1 点战备`);
      break;
    case "improveTile": {
      const improvement = targetHex ? GetImprovementForTerrain(targetHex.terrain) : null;
      effects.push(`建设${improvement?.label || "地块改良"}，供邻村持续工作`);
      break;
    }
    case "constructionDrive":
      effects.push(`为${targetHex?.name}建设队列追加 4 点工程进度`);
      break;
    default: {
      if (action.institutionId) {
        const institution = institutionById.get(action.institutionId);
        effects.push(`启动${institution.label}建设队列：2/${institution.required} 工程`);
        risks.push("每村只能选择一种专业机构");
      }
      break;
    }
  }
  return { effects, risks };
}

export function GetActionPreview(state, actionId, selectedHexId, selectedUnitId) {
  const action = actionById.get(actionId);
  if (!action) {
    return {
      actionId,
      title: "未知行动",
      summary: "没有对应的规则定义。",
      effects: [],
      risks: [],
      enabled: false,
      reason: "未知行动",
    };
  }
  const unit = selectedUnitId ? FindUnitInternal(state, selectedUnitId) : null;
  const projectedHexId = unit ? GetProjectedUnitHexId(state, unit.id) : null;
  const targetHexId = selectedHexId || projectedHexId;
  const targetHex = targetHexId ? FindHexInternal(state, targetHexId) : null;
  const validation = ValidateAction(state, actionId, selectedHexId, selectedUnitId, targetHexId);
  const text = BuildPreviewText(state, action, targetHex, unit);
  return {
    actionId,
    title: action.label,
    summary: action.description,
    cost: GetEffectiveActionCost(state, action),
    costText: FormatCost(GetEffectiveActionCost(state, action)),
    effects: text.effects,
    risks: text.risks,
    enabled: validation.enabled,
    reason: validation.reason,
    targetHexId,
    requiresConfirmation: ["evacuate", "ambush", "sabotage"].includes(actionId),
    riskLevel: ["evacuate", "ambush", "sabotage"].includes(actionId) ? "high" : "normal",
  };
}

export function ListContextActions(state, selectedHexId, selectedUnitId) {
  const selectedHex = selectedHexId ? FindHexInternal(state, selectedHexId) : null;
  const unit = selectedUnitId ? FindUnitInternal(state, selectedUnitId) : null;
  const projectedHexId = unit ? GetProjectedUnitHexId(state, unit.id) : null;
  const projectedHex = projectedHexId ? FindHexInternal(state, projectedHexId) : null;
  const actionIds = [];

  if (unit && selectedHex && selectedHex.id !== projectedHexId) {
    actionIds.push("move");
  }
  if (unit && selectedHex?.id === projectedHexId) {
    actionIds.push("recon");
  }
  if (selectedHex && IsVillage(selectedHex)) {
    actionIds.push(
      "organize",
      "relief",
      "evacuate",
      "buildPartyBranch",
      "buildCooperative",
      "buildClinic",
      "buildArsenal",
      "buildStation",
      "buildTunnels",
      "constructionDrive",
      "selfProduction",
    );
  }
  if (selectedHex?.feature === "Headquarters") {
    actionIds.push("selfProduction");
  }
  if (unit && selectedHex && HexDistance(projectedHex, selectedHex) <= 1 && !selectedHex.feature) {
    actionIds.push("improveTile");
  }
  if (unit && selectedHex && (selectedHex.warning
    || state.enemies.some((enemy) => enemy.active && enemy.hexId === selectedHex.id))) {
    actionIds.push("ambush");
  }
  if (unit && selectedHex?.rail) {
    actionIds.push("sabotage");
  }
  if (unit && selectedHex?.id === projectedHexId) {
    actionIds.push("rest");
  }

  return [...new Set(actionIds)].map((actionId) => {
    const action = actionById.get(actionId);
    const preview = GetActionPreview(state, actionId, selectedHexId, selectedUnitId);
    return {
      actionId,
      label: action.label,
      description: action.description,
      costText: FormatCost(GetEffectiveActionCost(state, action)),
      enabled: preview.enabled,
      reason: preview.reason,
      kind: action.kind,
    };
  });
}

function UpdateReservedField(state) {
  state.reserved = GetReservedResources(state);
  state.commandPoints = Clamp(state.commandMax - state.orders.reduce((total, order) => {
    return total + (order.cost?.command || 1);
  }, 0), 0, state.commandMax);
}

export function QueueOrder(state, orderLike) {
  const next = CloneState(state);
  next.lastError = null;
  const action = actionById.get(orderLike?.actionId);
  if (!action) {
    next.lastError = "未知行动";
    return next;
  }
  const unit = orderLike.unitId ? FindUnitInternal(next, orderLike.unitId) : null;
  const projectedHexId = unit ? GetProjectedUnitHexId(next, unit.id) : null;
  const targetHexId = GetTargetHexId(orderLike, projectedHexId);
  const validation = ValidateAction(
    next,
    action.id,
    targetHexId,
    orderLike.unitId || null,
    targetHexId,
  );
  if (!validation.enabled) {
    next.lastError = validation.reason;
    return next;
  }
  next.orders.push({
    id: `Order_T${next.turn}_${next.orders.length + 1}`,
    actionId: action.id,
    hexId: targetHexId,
    unitId: orderLike.unitId || null,
    targetHexId,
    cost: GetEffectiveActionCost(next, action),
  });
  UpdateReservedField(next);
  return next;
}

export function RemoveOrder(state, index) {
  const next = CloneState(state);
  if (!Number.isInteger(index) || index < 0 || index >= next.orders.length) {
    next.lastError = "命令序号无效";
    return next;
  }
  const removedOrder = next.orders[index];
  next.orders = next.orders.filter((order, orderIndex) => {
    if (orderIndex === index) {
      return false;
    }
    const dependsOnRemovedMove = removedOrder.actionId === "move"
      && removedOrder.unitId
      && orderIndex > index
      && order.unitId === removedOrder.unitId;
    return !dependsOnRemovedMove;
  });
  next.lastError = null;
  UpdateReservedField(next);
  return next;
}

export function ClearOrders(state) {
  const next = CloneState(state);
  next.orders = [];
  next.lastError = null;
  UpdateReservedField(next);
  return next;
}

function SpendOrderCost(state, order) {
  const cost = order.cost || actionById.get(order.actionId)?.cost || {};
  for (const resourceId of ["grain", "arms", "medicine", "intel", "cadres"]) {
    state.resources[resourceId] = Clamp(
      state.resources[resourceId] - (cost[resourceId] || 0),
      0,
      maximumResource,
    );
  }
}

function AddDoctrineExperience(state, tree, amount) {
  state.doctrines[tree].experience = Clamp(state.doctrines[tree].experience + amount, 0, 999);
}

function AddCivilianLedgerEntry(state, entry) {
  const ledgerEntry = {
    turn: state.turn,
    date: GetHistoricalTurn(state.turn).date,
    ...entry,
  };
  state.ledger.civilianCosts.push(ledgerEntry);
}

function CalculateTileYield(hex) {
  const baseYield = terrainById.get(hex.terrain)?.yield || {};
  const improvementYield = hex.improvement
    ? (improvementById.get(hex.improvement)?.yield || {})
    : {};
  return {
    grain: (baseYield.grain || 0) + (improvementYield.grain || 0),
    arms: (baseYield.arms || 0) + (improvementYield.arms || 0),
    medicine: (baseYield.medicine || 0) + (improvementYield.medicine || 0),
    intel: (baseYield.intel || 0) + (improvementYield.intel || 0),
  };
}

function GetVillageWorkedImprovement(state, village) {
  const candidates = GetNeighbors(state, village.id)
    .filter((hex) => hex.improvement && hex.control !== "enemy")
    .map((hex) => ({
      hex,
      value: Object.values(CalculateTileYield(hex)).reduce((total, amount) => total + amount, 0),
    }))
    .sort((first, second) => second.value - first.value);
  return candidates[0]?.hex || null;
}

function CalculateVillageYield(state, village, concentrated = false) {
  if (!IsVillage(village) || village.contact < 30 || village.livelihood <= 0) {
    return { grain: 0, arms: 0, medicine: 0, intel: 0, cadres: 0 };
  }
  const localYield = CalculateTileYield(village);
  const workedHex = GetVillageWorkedImprovement(state, village);
  const workedYield = workedHex ? CalculateTileYield(workedHex) : {};
  const livelihoodFactor = Clamp(village.livelihood / 75, 0.35, 1);
  const hardshipFactor = Clamp(1 - (village.hardship / 150), 0.45, 1);
  const concentrationFactor = concentrated ? 1.1 : 0.65;
  const outputFactor = livelihoodFactor * hardshipFactor * concentrationFactor;
  const output = {
    grain: 1 + Math.max(0, Math.floor(((localYield.grain || 0) + (workedYield.grain || 0)) * outputFactor)),
    arms: Math.max(0, Math.floor(((localYield.arms || 0) + (workedYield.arms || 0)) * outputFactor)),
    medicine: Math.max(0, Math.floor(((localYield.medicine || 0) + (workedYield.medicine || 0)) * outputFactor)),
    intel: Math.max(0, Math.floor(((localYield.intel || 0) + (workedYield.intel || 0)) * outputFactor)),
    cadres: 0,
  };
  if (village.institution === "Cooperative") {
    output.grain += 2 + GetPolicyEffect(state, "grainBonus", 0);
  } else if (village.institution === "Clinic" && state.turn % 2 === 0) {
    output.medicine += 1;
  } else if (village.institution === "Arsenal") {
    output.arms += 1;
  } else if (village.institution === "Station") {
    output.intel += 1;
  } else if (village.institution === "PartyBranch" && state.turn % 3 === 0) {
    output.cadres += 1;
  }
  return output;
}

function AddResources(state, output) {
  for (const resourceId of ["grain", "arms", "medicine", "intel", "cadres"]) {
    state.resources[resourceId] = Clamp(
      state.resources[resourceId] + (output[resourceId] || 0),
      0,
      maximumResource,
    );
  }
}

function ApplyPlayerOrder(state, order) {
  const action = actionById.get(order.actionId);
  const unit = order.unitId ? FindUnitInternal(state, order.unitId) : null;
  const targetHex = FindHexInternal(state, order.targetHexId || order.hexId || unit?.hexId);
  if (!action || (!targetHex && action.id !== "recon")) {
    return;
  }
  SpendOrderCost(state, order);

  if (action.id === "move") {
    unit.hexId = targetHex.id;
    unit.moves = 0;
    unit.moved = true;
    state.log.push(`${unit.name}移动至${targetHex.name}。`);
    return;
  }

  if (unit) {
    unit.acted = true;
  }

  if (action.id === "recon") {
    const originHexId = unit?.hexId || targetHex?.id;
    const intelligenceGain = 2
      + (HasDoctrine(state, "IntelligenceBeforeAction") ? 1 : 0)
      + GetPolicyEffect(state, "reconIntel", 0);
    state.resources.intel = Clamp(state.resources.intel + intelligenceGain, 0, maximumResource);
    state.meters.exposure = Clamp(state.meters.exposure - 2, 0, maximumMeter);
    AddDoctrineExperience(state, "military", 3);
    RevealRadius(state, originHexId, 3);
    state.log.push(`${unit.name}完成侦察，获得 ${intelligenceGain} 情报。`);
    return;
  }

  if (action.id === "organize") {
    const hardshipPenalty = targetHex.hardship >= 55 ? 5 : 0;
    const lowContactBonus = targetHex.contact < 35 ? GetPolicyEffect(state, "lowContactBonus", 0) : 0;
    const contactGain = 14
      + GetPolicyEffect(state, "organizeContact", 0)
      + lowContactBonus
      - hardshipPenalty;
    targetHex.contact = Clamp(targetHex.contact + contactGain, 0, maximumMeter);
    targetHex.hardship = Clamp(targetHex.hardship - 2, 0, maximumMeter);
    if (targetHex.contact >= 30) {
      targetHex.control = "player";
    }
    state.meters.people = Clamp(state.meters.people + 3, 0, maximumMeter);
    state.meters.unity = Clamp(
      state.meters.unity + 2 + GetPolicyEffect(state, "unityGain", 0),
      0,
      maximumMeter,
    );
    state.meters.discipline = Clamp(state.meters.discipline + 1, 0, maximumMeter);
    AddDoctrineExperience(state, "civilian", 5);
    state.log.push(`${unit.name}在${targetHex.name}走访议事，联系度提高 ${contactGain}。`);
    return;
  }

  if (action.id === "relief") {
    const contactGain = 5 + GetPolicyEffect(state, "reliefContact", 0);
    targetHex.hardship = Clamp(targetHex.hardship - 18, 0, maximumMeter);
    targetHex.livelihood = Clamp(targetHex.livelihood + 5, 0, maximumMeter);
    targetHex.contact = Clamp(targetHex.contact + contactGain, 0, maximumMeter);
    state.meters.people = Clamp(state.meters.people + 3, 0, maximumMeter);
    state.meters.discipline = Clamp(state.meters.discipline + 2, 0, maximumMeter);
    AddDoctrineExperience(state, "civilian", 5);
    state.log.push(`${unit.name}在${targetHex.name}开展救济和恢复。`);
    return;
  }

  if (action.id === "evacuate") {
    const tunnelMultiplier = targetHex.institution === "Tunnels" ? 0.7 : 1;
    const policyMultiplier = GetPolicyEffect(state, "evacuationMultiplier", 1);
    const warningMultiplier = targetHex.warning ? 1 : 0.7;
    const movedHouseholds = Math.max(
      1,
      Math.ceil(targetHex.households * 0.4 * tunnelMultiplier * policyMultiplier * warningMultiplier),
    );
    targetHex.households = Math.max(0, targetHex.households - movedHouseholds);
    targetHex.evacuated = true;
    targetHex.evacuationProtection = 2;
    targetHex.hardship = Clamp(targetHex.hardship + 5, 0, maximumMeter);
    state.ledger.displacedHouseholds += movedHouseholds;
    AddCivilianLedgerEntry(state, {
      type: "Displacement",
      villageId: targetHex.id,
      villageName: targetHex.name,
      households: movedHouseholds,
      text: `${targetHex.name}有 ${movedHouseholds} 户转入山地隐蔽安置。流离本身是不可抹去的代价。`,
    });
    AddDoctrineExperience(state, "civilian", 4);
    state.log.push(`${targetHex.name}完成预警疏散，${movedHouseholds} 户转入隐蔽安置。`);
    return;
  }

  if (action.institutionId) {
    const institution = institutionById.get(action.institutionId);
    targetHex.construction = {
      institutionId: institution.id,
      progress: 2,
      required: institution.required,
      cost: institution.required,
      startedTurn: state.turn,
    };
    AddDoctrineExperience(state, "civilian", 3);
    state.meters.exposure = Clamp(
      state.meters.exposure + (institution.id === "Arsenal" ? 4 : 2),
      0,
      maximumMeter,
    );
    state.log.push(`${targetHex.name}开始建设${institution.label}（2/${institution.required}）。`);
    return;
  }

  if (action.id === "constructionDrive") {
    targetHex.construction.progress += 4;
    AddDoctrineExperience(state, "civilian", 2);
    state.log.push(`${unit.name}协助${targetHex.name}集中施工。`);
    return;
  }

  if (action.id === "improveTile") {
    const improvement = GetImprovementForTerrain(targetHex.terrain);
    targetHex.improvement = improvement.id;
    targetHex.control = "player";
    AddDoctrineExperience(state, "civilian", 3);
    state.log.push(`${unit.name}在${targetHex.name}建成${improvement.label}。`);
    return;
  }

  if (action.id === "selfProduction") {
    if (targetHex.feature === "Headquarters") {
      AddResources(state, { grain: 2 });
      state.log.push("驻地集中开展生产自救，获得 2 粮秣。");
    } else {
      const output = CalculateVillageYield(state, targetHex, true);
      AddResources(state, output);
      targetHex.hardship = Clamp(targetHex.hardship + 2, 0, maximumMeter);
      state.log.push(`${targetHex.name}集中生产：${FormatOutput(output)}。`);
    }
    AddDoctrineExperience(state, "civilian", 2);
    return;
  }

  if (action.id === "ambush") {
    ResolveAmbush(state, unit, targetHex);
    return;
  }

  if (action.id === "sabotage") {
    const informedAction = state.resources.intel > 0;
    if (informedAction) {
      state.resources.intel -= 1;
    }
    const doctrineDuration = HasDoctrine(state, "MineAndSabotage") ? 1 : 0;
    const policyDuration = GetPolicyEffect(state, "sabotageDuration", 0);
    targetHex.railDisabledTurns = 2 + doctrineDuration + policyDuration;
    const exposureMultiplier = GetPolicyEffect(state, "exposureMultiplier", 1);
    const exposureGain = Math.max(7, Math.round((informedAction ? 14 : 19) * exposureMultiplier));
    state.meters.exposure = Clamp(state.meters.exposure + exposureGain, 0, maximumMeter);
    state.meters.contribution = Clamp(state.meters.contribution + 2, 0, 999);
    state.meters.discipline = Clamp(state.meters.discipline - (informedAction ? 0 : 2), 0, 100);
    AddDoctrineExperience(state, "military", 6);
    state.log.push(`${unit.name}破袭${targetHex.name}铁路，停运 ${targetHex.railDisabledTurns} 回合；暴露 +${exposureGain}。`);
    return;
  }

  if (action.id === "rest") {
    unit.readiness = Clamp(unit.readiness + 1, 0, unit.maximumReadiness);
    state.log.push(`${unit.name}完成整训救护，恢复 1 战备。`);
  }
}

function FormatOutput(output) {
  const labels = { grain: "粮", arms: "军械", medicine: "药", intel: "情报", cadres: "干部" };
  const text = Object.entries(output)
    .filter(([, amount]) => amount > 0)
    .map(([resourceId, amount]) => `${labels[resourceId]}+${amount}`)
    .join("、");
  return text || "维持本地生计";
}

function ResolveAmbush(state, unit, targetHex) {
  const enemy = state.enemies.find((candidate) => candidate.active && candidate.hexId === targetHex.id);
  const terrainBonus = terrainById.get(targetHex.terrain)?.defense || 0;
  const militiaDefense = state.units
    .filter((candidate) => candidate.type === "Militia" && candidate.hexId === targetHex.id && candidate.readiness > 0)
    .reduce((total, candidate) => total + candidate.strength, 0);
  const doctrineBonus = HasDoctrine(state, "IntelligenceBeforeAction") ? 1 : 0;
  const policyBonus = GetPolicyEffect(state, "ambushBonus", 0);
  const playerPower = unit.strength + terrainBonus + militiaDefense + doctrineBonus + policyBonus;
  const enemyPower = enemy ? enemy.strength + enemy.readiness : 5 + (targetHex.warning?.intensity || 1);
  const exposureGain = Math.max(5, Math.round(10 * GetPolicyEffect(state, "exposureMultiplier", 1)));

  if (playerPower >= enemyPower - 1) {
    state.meters.contribution = Clamp(state.meters.contribution + 2, 0, 999);
    if (enemy) {
      enemy.readiness -= 1;
      if (enemy.readiness <= 0) {
        enemy.active = false;
        enemy.intent = "退出本县行动";
      } else {
        enemy.intent = "受阻后退";
      }
    }
    if (targetHex.warning) {
      targetHex.warning.intensity = Math.max(0, targetHex.warning.intensity - 1);
    }
    unit.readiness = Math.max(1, unit.readiness - 1);
    state.log.push(`${unit.name}利用地形迫使敌方行动受阻，没有追击扩大接触。`);
  } else {
    unit.readiness = Math.max(0, unit.readiness - 1);
    state.meters.people = Clamp(state.meters.people - 2, 0, 100);
    state.log.push(`${unit.name}伏击未能形成优势，及时脱离但战备下降。`);
  }
  state.meters.exposure = Clamp(state.meters.exposure + exposureGain, 0, 100);
  AddDoctrineExperience(state, "military", 5);
}

function ResolveConstruction(state) {
  const constructionBonus = GetPolicyEffect(state, "constructionBonus", 0);
  for (const village of state.hexes.filter(IsVillage)) {
    if (!village.construction || village.livelihood <= 0) {
      continue;
    }
    const progressGain = 1 + Math.floor(village.contact / 40) + constructionBonus;
    village.construction.progress += progressGain;
    if (village.construction.progress >= village.construction.required) {
      const institution = institutionById.get(village.construction.institutionId);
      village.institution = institution.id;
      village.construction = null;
      state.log.push(`${village.name}建成${institution.label}。`);
      state.meters.people = Clamp(state.meters.people + 2, 0, 100);
      state.meters.unity = Clamp(state.meters.unity + 2, 0, 100);
    }
  }
}

function ResolveVillageEconomy(state) {
  const event = GetHistoricalTurn(state.turn);
  const aggregateOutput = { grain: 1, arms: 0, medicine: 0, intel: 0, cadres: 0 };
  for (const village of state.hexes.filter(IsVillage)) {
    if (village.institution === "PartyBranch") {
      village.contact = Clamp(village.contact + 2, 0, 100);
      state.meters.discipline = Clamp(state.meters.discipline + 1, 0, 100);
    }
    if (village.institution === "Cooperative") {
      village.hardship = Clamp(
        village.hardship - 2 - GetPolicyEffect(state, "hardshipRecovery", 0),
        0,
        100,
      );
    }
    if (village.institution === "Clinic") {
      village.hardship = Clamp(village.hardship - 2, 0, 100);
    }
    const output = CalculateVillageYield(state, village, false);
    for (const resourceId of Object.keys(aggregateOutput)) {
      aggregateOutput[resourceId] += output[resourceId] || 0;
    }
  }
  aggregateOutput.grain = Math.max(0, Math.floor(aggregateOutput.grain * event.yieldModifier));
  AddResources(state, aggregateOutput);
  state.log.push(`根据地月度共同生产：${FormatOutput(aggregateOutput)}。`);
}

function ResolveUpkeep(state) {
  const event = GetHistoricalTurn(state.turn);
  let upkeep = state.units.reduce((total, unit) => {
    if (unit.readiness <= 0 || unit.type === "Militia") {
      return total;
    }
    return total + (unitById.get(unit.type)?.upkeep || 0);
  }, 0);
  upkeep += event.extraUpkeep || 0;
  if (HasDoctrine(state, "DemocraticBaseGovernance")) {
    upkeep = Math.max(0, upkeep - 1);
  }
  if (state.resources.grain >= upkeep) {
    state.resources.grain -= upkeep;
    state.log.push(`部队和工作队本月消耗 ${upkeep} 粮秣。`);
    return;
  }
  const shortage = upkeep - state.resources.grain;
  state.resources.grain = 0;
  for (const unit of state.units.filter((candidate) => candidate.type !== "Militia" && candidate.readiness > 0)) {
    unit.readiness = Math.max(0, unit.readiness - 1);
  }
  state.meters.people = Clamp(state.meters.people - (2 * shortage), 0, 100);
  state.log.push(`粮秣短缺 ${shortage}，各野战单位战备下降。`);
}

function GetSweepMitigation(state, village) {
  let multiplier = 1;
  if (village.evacuated && village.evacuationProtection > 0) {
    multiplier *= 0.58;
  }
  if (village.institution === "Tunnels") {
    multiplier *= 0.52;
  }
  if (village.institution === "Clinic") {
    multiplier *= 0.82;
  }
  if (HasDoctrine(state, "AntiSweepDefense")) {
    multiplier *= 0.86;
  }
  const disciplineMultiplier = Clamp(
    1.18 - ((state.meters.discipline || 0) * 0.004),
    0.78,
    1.18,
  );
  multiplier *= disciplineMultiplier;
  multiplier *= GetPolicyEffect(state, "sweepMultiplier", 1);

  const defenders = state.units.filter((unit) => unit.hexId === village.id && unit.readiness > 0);
  let defense = defenders.reduce((total, unit) => total + unit.strength, 0);
  defense += GetPolicyEffect(state, "defenseBonus", 0);
  defense += defenders
    .filter((unit) => unit.type === "Militia")
    .length * GetPolicyEffect(state, "militiaDefense", 0);
  multiplier *= Clamp(1 - (defense * 0.035), 0.48, 1);
  return Clamp(multiplier, 0.18, 1);
}

function ApplySweepToVillage(state, village, intensity, source) {
  if (!village || village.livelihood <= 0 || intensity <= 0) {
    return;
  }
  const mitigation = GetSweepMitigation(state, village);
  const livelihoodDamage = Math.max(2, Math.round((10 + (intensity * 5)) * mitigation));
  const hardshipDamage = Math.max(3, Math.round((9 + (intensity * 4)) * mitigation));
  const affectedHouseholds = Math.max(
    1,
    Math.ceil(village.households * (0.07 + (intensity * 0.045)) * mitigation),
  );
  const previousLivelihood = village.livelihood;

  village.livelihood = Clamp(village.livelihood - livelihoodDamage, 0, 100);
  village.hardship = Clamp(village.hardship + hardshipDamage, 0, 100);
  village.contact = Clamp(village.contact - Math.round(5 * mitigation), 0, 100);
  village.warning = null;
  village.evacuationProtection = Math.max(0, village.evacuationProtection - 1);
  state.ledger.affectedHouseholds += affectedHouseholds;
  state.ledger.livelihoodDestroyed += previousLivelihood - village.livelihood;
  AddCivilianLedgerEntry(state, {
    type: "Sweep",
    villageId: village.id,
    villageName: village.name,
    households: affectedHouseholds,
    livelihoodDamage,
    source,
    text: `${village.name}在${source}中有 ${affectedHouseholds} 户生活受到严重冲击，生计损失 ${livelihoodDamage}。`,
  });
  state.meters.people = Clamp(state.meters.people - Math.max(2, Math.ceil(livelihoodDamage / 5)), 0, 100);
  state.meters.unity = Clamp(state.meters.unity - Math.ceil(hardshipDamage / 7), 0, 100);

  for (const defender of state.units.filter((unit) => unit.hexId === village.id && unit.readiness > 0)) {
    if (defender.type !== "WorkTeam") {
      defender.readiness = Math.max(0, defender.readiness - 1);
    }
  }
  if (village.livelihood <= 0 && !state.ledger.villageAbandonments.includes(village.id)) {
    state.ledger.villageAbandonments.push(village.id);
    village.control = "contested";
    village.institution = null;
    village.construction = null;
    state.log.push(`${village.name}生计崩溃，被迫放弃；这一结果不能由分数抵消。`);
  } else {
    state.log.push(`${village.name}承受${source}：生计 -${livelihoodDamage}，困苦 +${hardshipDamage}。`);
  }
}

function FindEnemyStep(state, enemy, targetHex) {
  const currentHex = FindHexInternal(state, enemy.hexId);
  if (!currentHex || !targetHex) {
    return null;
  }
  return GetNeighbors(state, currentHex.id)
    .filter((hex) => !state.units.some((unit) =>
      unit.hexId === hex.id && unit.type === "MainForce" && unit.readiness > 0
    ))
    .map((hex) => {
      const routeBonus = hex.rail ? 2 : (hex.road ? 1 : 0);
      const terrainPenalty = terrainById.get(hex.terrain)?.enemyMoveCost || 1;
      return {
        hex,
        score: HexDistance(hex, targetHex) * 5 + terrainPenalty - routeBonus,
      };
    })
    .sort((first, second) => first.score - second.score)[0]?.hex || null;
}

function ResolveRailRepair(state) {
  const repairCandidates = state.hexes.filter((hex) => hex.rail && hex.railDisabledTurns > 0);
  if (repairCandidates.length === 0) {
    return null;
  }
  const supportedCandidate = repairCandidates.find((hex) => state.enemies.some((enemy) => {
    if (!enemy.active || !["Garrison", "Patrol", "Search"].includes(enemy.type)) {
      return false;
    }
    const enemyHex = FindHexInternal(state, enemy.hexId);
    return enemyHex && HexDistance(enemyHex, hex) <= 1;
  }));
  if (supportedCandidate) {
    supportedCandidate.railDisabledTurns = Math.max(0, supportedCandidate.railDisabledTurns - 1);
    state.log.push(`敌军抢修${supportedCandidate.name}铁路，停运时间缩短。`);
    return supportedCandidate.id;
  }
  return null;
}

function ResolveEnemyMovement(state, sweptVillageIds = new Set()) {
  const viableVillages = state.hexes.filter((hex) => IsVillage(hex) && hex.livelihood > 0);
  if (viableVillages.length === 0) {
    return;
  }
  for (const [enemyIndex, enemy] of state.enemies.entries()) {
    if (!enemy.active || enemy.moves <= 0 || enemy.type === "Garrison") {
      continue;
    }
    const warnedTarget = viableVillages.find((village) => village.warning?.turn === state.turn);
    const target = warnedTarget || [...viableVillages].sort((first, second) => {
      const firstScore = first.contact + (first.institution ? 15 : 0) + (first.road ? 7 : 0);
      const secondScore = second.contact + (second.institution ? 15 : 0) + (second.road ? 7 : 0);
      return secondScore - firstScore;
    })[0];
    enemy.intent = state.resources.intel >= 5 || enemy.visible
      ? `向${target.name}搜索推进`
      : "动向不明";
    const moveCount = enemy.type === "SweepColumn" ? 2 : 1;
    for (let moveIndex = 0; moveIndex < moveCount; moveIndex += 1) {
      const step = FindEnemyStep(state, enemy, target);
      if (!step) break;
      enemy.hexId = step.id;
      if (step.id === target.id) break;
    }
    const reachedVillage = FindHexInternal(state, enemy.hexId);
    if (IsVillage(reachedVillage)
      && state.meters.exposure >= 68
      && (state.turn + enemyIndex) % 3 === 0
      && !sweptVillageIds.has(reachedVillage.id)
      && !reachedVillage.warning) {
      ApplySweepToVillage(state, reachedVillage, 1, "局部搜索袭扰");
    }
  }
}

function ResolveScheduledSweeps(state) {
  const warnedVillages = state.hexes.filter((hex) => IsVillage(hex) && hex.warning?.turn === state.turn);
  const sweepUnits = state.enemies.filter((enemy) => enemy.type === "SweepColumn");
  const sweptVillageIds = new Set();
  for (const [warningIndex, village] of warnedVillages.entries()) {
    const sweepUnit = sweepUnits[warningIndex % sweepUnits.length];
    if (sweepUnit) {
      sweepUnit.active = true;
      sweepUnit.hexId = village.id;
      sweepUnit.intent = `扫荡${village.name}`;
      sweepUnit.visible = village.visible;
    }
    const intensity = village.warning?.intensity || 1;
    ApplySweepToVillage(state, village, intensity, intensity >= 3 ? "大规模扫荡" : "扫荡");
    sweptVillageIds.add(village.id);
  }
  return sweptVillageIds;
}

function ResolveEnemyTurn(state) {
  const event = GetHistoricalTurn(state.turn);
  const repairedRailId = ResolveRailRepair(state);
  const sweptVillageIds = ResolveScheduledSweeps(state);
  ResolveEnemyMovement(state, sweptVillageIds);
  const passiveExposure = event.enemyPressure >= 5 ? 1 : -2;
  state.meters.exposure = Clamp(state.meters.exposure + passiveExposure, 0, 100);
  for (const enemy of state.enemies) {
    enemy.acted = true;
  }
  return repairedRailId;
}

function RecoverBrokenUnits(state) {
  const headquarters = state.hexes.find((hex) => hex.feature === "Headquarters");
  for (const unit of state.units.filter((candidate) => candidate.readiness <= 0)) {
    const originHex = FindHexInternal(state, unit.hexId);
    const entry = {
      turn: state.turn,
      date: GetHistoricalTurn(state.turn).date,
      unitId: unit.id,
      unitName: unit.name,
      originHexId: originHex?.id ?? null,
      originName: originHex?.name ?? "未知地区",
      text: unit.type === "Militia"
        ? `${unit.name}在${originHex?.name ?? "本村"}战备崩散，幸存人员转入隐蔽整顿。`
        : `${unit.name}失去成建制行动能力，撤回驻地整顿；这一损失进入战争账簿。`,
    };
    state.ledger.combatLosses.push(entry);
    if (unit.type !== "Militia" && headquarters) {
      unit.hexId = headquarters.id;
    }
    unit.readiness = 1;
    unit.moves = 0;
    unit.acted = true;
    state.log.push(entry.text);
  }
}

function ResolveRailContributionAndDecay(state, repairedRailId = null) {
  const disabledRail = state.hexes.filter((hex) => hex.rail && hex.railDisabledTurns > 0);
  const ongoingContribution = Math.min(2, disabledRail.length);
  if (ongoingContribution > 0) {
    state.meters.contribution += ongoingContribution;
    state.log.push(`停运铁路继续牵制敌军修复与守备力量：贡献 +${ongoingContribution}。`);
  }
  for (const hex of disabledRail) {
    if (hex.id !== repairedRailId) {
      hex.railDisabledTurns = Math.max(0, hex.railDisabledTurns - 1);
    }
  }
}

function ResetUnitsForNextTurn(state) {
  for (const unit of state.units) {
    const definition = unitById.get(unit.type);
    unit.moves = definition.moves;
    unit.maximumMoves = definition.moves;
    unit.acted = false;
    unit.moved = false;
  }
  for (const enemy of state.enemies) {
    const definition = unitById.get(enemy.type);
    enemy.moves = definition.moves;
    enemy.maximumMoves = definition.moves;
    enemy.acted = false;
  }
}

function ApplyUnityPolicyFloor(state) {
  const unityFloor = GetPolicyEffect(state, "unityFloor", 0);
  if (unityFloor > 0) {
    state.meters.unity = Math.max(state.meters.unity, unityFloor);
  }
}

function ValidateStateForResolution(state) {
  if (!state || state.gameOver || state.phase !== "planning") {
    return false;
  }
  return state.orders.every((order) => actionById.has(order.actionId));
}

export function ResolveTurn(state) {
  const next = CloneState(state);
  next.lastError = null;
  if (!ValidateStateForResolution(next)) {
    next.lastError = next.gameOver ? "战役已经结束" : "当前状态不能结算";
    return next;
  }
  next.phase = "resolution";
  const resolvedTurn = next.turn;
  const event = GetHistoricalTurn(resolvedTurn);

  for (const order of next.orders) {
    ApplyPlayerOrder(next, order);
  }
  next.orders = [];
  next.reserved = { grain: 0, arms: 0, medicine: 0, intel: 0, cadres: 0 };

  ResolveConstruction(next);
  ResolveVillageEconomy(next);
  ResolveUpkeep(next);
  const repairedRailId = ResolveEnemyTurn(next);
  RecoverBrokenUnits(next);
  ResolveRailContributionAndDecay(next, repairedRailId);
  ApplyUnityPolicyFloor(next);
  next.meters.network = CalculateNetwork(next);
  next.history.push({
    turn: resolvedTurn,
    date: event.date,
    title: event.title,
    resources: DeepClone(next.resources),
    meters: DeepClone(next.meters),
    institutions: next.hexes.filter((hex) => hex.institution).length,
    warningsResolved: next.ledger.civilianCosts.filter((entry) => entry.turn === resolvedTurn).length,
  });

  if (resolvedTurn >= turnLimit) {
    next.turn = turnLimit;
    next.phase = "complete";
    next.gameOver = true;
    next.commandPoints = 0;
    next.log.push("1942年12月结算完成：这里只表示渡过最困难时期，抗战仍将继续并走向1945年的最终胜利。");
    UpdateVisibility(next);
    return next;
  }

  PrepareWarningsForNextTurn(next);
  next.turn = resolvedTurn + 1;
  ApplyOpeningConditions(next, next.turn);
  ResetUnitsForNextTurn(next);
  RefreshCommandMaximum(next);
  next.commandPoints = next.commandMax;
  next.phase = "planning";
  for (const hex of next.hexes) {
    if (hex.evacuationProtection > 0) {
      hex.evacuationProtection -= 1;
    }
  }
  UpdateVisibility(next);
  return next;
}

export function GetTurnBriefing(state) {
  const event = GetHistoricalTurn(state.turn);
  const warnings = state.hexes
    .filter((hex) => hex.warning?.turn === state.turn)
    .map((hex) => ({
      hexId: hex.id,
      villageName: hex.name,
      kind: hex.warning.kind,
      intensity: hex.warning.intensity,
      text: hex.warning.text,
      mitigations: [
        hex.evacuated ? "已疏散" : "尚未疏散",
        hex.institution === "Tunnels" ? "已有地道网" : "无地道网",
        hex.institution === "Clinic" ? "已有救护所" : "无救护所",
      ],
    }));
  const currentTreeTips = [];
  const nextCivilian = doctrineDefinitions.find((definition) => definition.tree === "civilian"
    && !state.doctrines.civilian.unlocked.includes(definition.id)
    && (!definition.prerequisite || state.doctrines.civilian.unlocked.includes(definition.prerequisite)));
  const nextMilitary = doctrineDefinitions.find((definition) => definition.tree === "military"
    && !state.doctrines.military.unlocked.includes(definition.id)
    && (!definition.prerequisite || state.doctrines.military.unlocked.includes(definition.prerequisite)));
  if (nextCivilian) {
    currentTreeTips.push(`民生路线：${state.doctrines.civilian.experience}/${nextCivilian.cost} → ${nextCivilian.label}`);
  }
  if (nextMilitary) {
    currentTreeTips.push(`军事路线：${state.doctrines.military.experience}/${nextMilitary.cost} → ${nextMilitary.label}`);
  }

  return {
    turn: state.turn,
    turnLimit: turnLimit,
    date: event.date,
    title: event.title,
    summary: event.summary,
    objective: `${event.title}：先保民生与组织，再安排建设、疏散和有限牵制。`,
    phase: state.phase === "planning" ? "规划阶段" : state.phase === "complete" ? "战役结算" : "敌我结算",
    commandPoints: state.commandPoints,
    commandMax: state.commandMax,
    yieldModifier: event.yieldModifier,
    enemyPressure: event.enemyPressure,
    warnings,
    doctrineTips: currentTreeTips,
    recommendedLoop: [
      "先读敌军警告和村庄困苦",
      "组织群众并维持生产",
      "推进每村唯一的专业机构",
      "对警告村庄疏散、布置地道和防御",
      "只在情报充分时实施有限伏击或破袭",
      "敌军回合后立即恢复生计与交通",
    ],
    historicalBoundary: "结局固定为坚持过1941—1942最困难阶段，不允许提前改写日本投降的历史。",
  };
}

export function UnlockDoctrine(state, doctrineId) {
  const next = CloneState(state);
  next.lastError = null;
  const definition = doctrineById.get(doctrineId);
  if (!definition) {
    next.lastError = "未知路线";
    return next;
  }
  const treeState = next.doctrines[definition.tree];
  if (treeState.unlocked.includes(doctrineId)) {
    next.lastError = "该路线已经解锁";
    return next;
  }
  if (definition.prerequisite && !treeState.unlocked.includes(definition.prerequisite)) {
    next.lastError = `需要先解锁${doctrineById.get(definition.prerequisite)?.label}`;
    return next;
  }
  if (treeState.experience < definition.cost) {
    next.lastError = `${definition.tree === "civilian" ? "民生" : "军事"}路线经验不足`;
    return next;
  }
  treeState.unlocked.push(doctrineId);
  RefreshCommandMaximum(next);
  next.commandPoints = Math.min(next.commandMax, next.commandPoints + (doctrineId === "DemocraticBaseGovernance" ? 1 : 0));
  next.log.push(`解锁路线：${definition.label}。`);
  return next;
}

export function SetPolicies(state, policyIds) {
  const next = CloneState(state);
  next.lastError = null;
  if (!Array.isArray(policyIds) || policyIds.length > 2 || new Set(policyIds).size !== policyIds.length) {
    next.lastError = "政策必须是不重复的至多两个政策";
    return next;
  }
  for (const policyId of policyIds) {
    const definition = policyById.get(policyId);
    if (!definition) {
      next.lastError = `未知政策：${policyId}`;
      return next;
    }
    if (!HasDoctrine(next, definition.doctrine)) {
      next.lastError = `政策${definition.label}需要路线${doctrineById.get(definition.doctrine)?.label}`;
      return next;
    }
  }
  next.policies = [...policyIds];
  next.log.push(`本回合政策调整为：${policyIds.map((policyId) => policyById.get(policyId).label).join("、") || "无"}。`);
  return next;
}

function CalculateAssessmentScore(state) {
  const villages = state.hexes.filter(IsVillage);
  const survivingVillages = villages.filter((village) => village.livelihood > 0);
  const averageLivelihood = villages.reduce((total, village) => total + village.livelihood, 0) / villages.length;
  const institutionCount = villages.filter((village) => village.institution).length;
  const contributionValue = Clamp((state.meters.contribution / 16) * 100, 0, 100);
  const institutionValue = Clamp((institutionCount / 5) * 100, 0, 100);
  const survivalValue = Clamp((survivingVillages.length / villages.length) * 100, 0, 100);
  return Math.round(
    (state.meters.people * 0.2)
    + (state.meters.network * 0.22)
    + (averageLivelihood * 0.18)
    + (contributionValue * 0.2)
    + (institutionValue * 0.12)
    + (state.meters.unity * 0.05)
    + (survivalValue * 0.03),
  );
}

export function GetVictoryAssessment(state) {
  const villages = state.hexes.filter(IsVillage);
  const survivingVillages = villages.filter((village) => village.livelihood > 0);
  const averageLivelihood = Math.round(
    villages.reduce((total, village) => total + village.livelihood, 0) / Math.max(1, villages.length),
  );
  const institutionCount = villages.filter((village) => village.institution).length;
  const score = CalculateAssessmentScore(state);
  const requirements = {
    historicalEndpointReached: state.gameOver && state.turn === turnLimit,
    villagesSurviving: survivingVillages.length >= 4,
    networkMaintained: state.meters.network >= 38,
    peopleMaintained: state.meters.people >= 42,
    contributionMade: state.meters.contribution >= 10,
    institutionsBuilt: institutionCount >= 2,
  };
  const requirementValues = Object.values(requirements);
  let status = "进行中";
  let title = "最困难阶段仍在继续";
  if (state.gameOver) {
    if (requirementValues.every(Boolean)) {
      status = "HistoricalContinuity";
      title = "敌后根据地保存了继续抗战的力量";
    } else if (requirements.historicalEndpointReached && survivingVillages.length >= 3) {
      status = "FragileSurvival";
      title = "艰难保存，但组织或战略任务仍有缺口";
    } else {
      status = "NetworkBroken";
      title = "根据地网络未能完整渡过困难阶段";
    }
  }
  return {
    status,
    title,
    score,
    scoreLabel: "根据地存续与抗战贡献综合评估",
    requirements,
    components: {
      people: state.meters.people,
      network: state.meters.network,
      averageLivelihood,
      contribution: state.meters.contribution,
      institutions: institutionCount,
      unity: state.meters.unity,
      discipline: state.meters.discipline,
      survivingVillages: survivingVillages.length,
    },
    civilianCostLedger: {
      displacedHouseholds: state.ledger.displacedHouseholds,
      affectedHouseholds: state.ledger.affectedHouseholds,
      events: state.ledger.civilianCosts.length,
      excludedFromScore: true,
      note: "平民受难不计分、不兑换资源，也不能被军事贡献抵消。",
    },
    historicalCoda: !state.gameOver
      ? "本局终点固定为1942年12月，不能提前改写历史。"
      : status === "HistoricalContinuity"
        ? "中国共产党领导的敌后军民依靠群众路线、基层组织、生产自救和游击战争渡过本县严重困难；斗争仍将继续，并与全国各抗日力量一道走向1945年的胜利。"
        : status === "FragileSurvival"
          ? "本县保住了部分抗战火种，但群众生活、基层网络或战略任务留下严重缺口；这些代价不能被军事数字抵消。全民族抗战仍将继续，并最终走向1945年的胜利。"
          : "本县根据地网络在最困难阶段遭到严重破坏，人民与组织付出的代价必须被如实记录，不能用既定的全国胜利倒推为本局成功。全民族抗战仍将继续，并最终走向1945年的胜利。",
  };
}

export function SerializeState(state) {
  const payload = CloneState(state);
  payload.saveVersion = saveVersion;
  return JSON.stringify(payload);
}

function IsValidLoadedState(candidate) {
  const HasFiniteFields = (record, fields) => Boolean(
    record
    && fields.every((field) => Number.isFinite(Number(record[field]))),
  );
  const validDoctrines = Boolean(
    candidate?.doctrines?.civilian
    && candidate?.doctrines?.military
    && Number.isFinite(Number(candidate.doctrines.civilian.experience))
    && Number.isFinite(Number(candidate.doctrines.military.experience))
    && Array.isArray(candidate.doctrines.civilian.unlocked)
    && Array.isArray(candidate.doctrines.military.unlocked),
  );
  const validLedger = Boolean(
    candidate?.ledger
    && Array.isArray(candidate.ledger.civilianCosts)
    && Array.isArray(candidate.ledger.villageAbandonments)
    && Array.isArray(candidate.ledger.combatLosses)
    && Number.isFinite(Number(candidate.ledger.displacedHouseholds))
    && Number.isFinite(Number(candidate.ledger.affectedHouseholds))
    && Number.isFinite(Number(candidate.ledger.livelihoodDestroyed)),
  );
  return Boolean(
    candidate
    && candidate.saveVersion === saveVersion
    && Number.isInteger(candidate.turn)
    && candidate.turn >= 1
    && candidate.turn <= turnLimit
    && Array.isArray(candidate.hexes)
    && candidate.hexes.length === mapWidth * mapHeight
    && candidate.hexes.every((hex) =>
      typeof hex?.id === "string"
      && Number.isInteger(hex.q)
      && Number.isInteger(hex.r)
      && typeof hex.terrain === "string"
    )
    && Array.isArray(candidate.units)
    && candidate.units.every((unit) =>
      typeof unit?.id === "string"
      && typeof unit.type === "string"
      && typeof unit.hexId === "string"
      && Number.isFinite(Number(unit.readiness))
    )
    && Array.isArray(candidate.enemies)
    && candidate.enemies.every((enemy) =>
      typeof enemy?.id === "string"
      && typeof enemy.type === "string"
      && typeof enemy.hexId === "string"
    )
    && Array.isArray(candidate.orders)
    && HasFiniteFields(candidate.resources, ["grain", "arms", "medicine", "intel", "cadres"])
    && HasFiniteFields(candidate.meters, ["people", "exposure", "contribution", "network", "unity", "discipline"])
    && validDoctrines
    && Array.isArray(candidate.policies)
    && candidate.policies.every((policyId) => typeof policyId === "string" && policyById.has(policyId))
    && validLedger
    && Array.isArray(candidate.history)
    && Array.isArray(candidate.log),
  );
}

export function DeserializeState(text) {
  try {
    const candidate = JSON.parse(text);
    if (!IsValidLoadedState(candidate)) {
      throw new Error("存档结构或版本无效");
    }
    const loaded = CloneState(candidate);
    loaded.lastError = null;
    if (loaded.gameOver || loaded.phase === "complete") {
      loaded.commandPoints = 0;
      loaded.reserved = { grain: 0, arms: 0, medicine: 0, intel: 0, cadres: 0 };
    } else {
      UpdateReservedField(loaded);
    }
    UpdateVisibility(loaded);
    return loaded;
  } catch (error) {
    const fallback = CreateInitialState();
    fallback.lastError = "存档损坏，已安全回退到新战役";
    fallback.log.push(`存档读取失败：${error instanceof Error ? error.message : "未知错误"}。`);
    return fallback;
  }
}
