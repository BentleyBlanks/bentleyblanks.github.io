/**
 * 《太行敌后：一九四一》纯规则层。
 *
 * 这是一个 1941 年 9 月至 1942 年 12 月的综合化县域模型，不对应某一个
 * 真实县。规则的重心是根据地建设：群众联系、生产、专业机构、交通网络和
 * 提前疏散决定根据地能否存续；战斗只承担掩护和有限破袭。平民遭受的代价
 * 只写入不可逆的代价账本，不兑换资源，也不进入胜利分数。
 */

export const saveVersion = 2;
// 保留既有 key，以便把线上 v1 的“疏散即永久流离”存档迁移为新语义。
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
    cost: { grain: 1, cadres: 1 },
    doctrine: "MassLine",
    description: "每回合巩固联系，定期培养基层干部，并强化群众保护组织度。",
  },
  {
    id: "Cooperative",
    label: "互助合作社",
    actionId: "buildCooperative",
    required: 8,
    contactRequired: 35,
    cost: { grain: 2, cadres: 1 },
    doctrine: "RentAndInterestReduction",
    description: "提高粮食产出并缓解困苦，表现生产自救而非向村庄抽取固定税赋。",
  },
  {
    id: "Clinic",
    label: "救护所",
    actionId: "buildClinic",
    required: 9,
    contactRequired: 30,
    cost: { grain: 2, medicine: 1 },
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
    cost: { grain: 1, cadres: 2 },
    doctrine: "MassLine",
    description: "扩展战争迷雾视野，提供情报并更早显示敌军意图。",
  },
  {
    id: "Tunnels",
    label: "地道网",
    actionId: "buildTunnels",
    required: 12,
    contactRequired: 45,
    cost: { grain: 3, cadres: 1 },
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
    description: "解锁预警下的军民协同伏击政策，使相邻主力和组织化邻村民兵能够受限协防。",
    unlocks: ["CoordinatedAmbush"],
  },
]);

export const policyDefinitions = FreezeDefinitions([
  {
    id: "MassDiscipline",
    label: "群众保护组织",
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
    description: "预警村庄可获相邻主力和组织化邻村民兵的受限支援；支援方消耗战备并提高暴露。",
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
    description: "把部分住户临时转入隐蔽安置点，显著减轻扫荡伤害；威胁解除后核验返村与自愿安置去向。",
  },
  {
    id: "buildPartyBranch",
    label: "筹建基层党支部",
    kind: "construction",
    cost: { command: 1, grain: 1, cadres: 1 },
    institutionId: "PartyBranch",
    description: "启动本村唯一的专业机构建设队列。",
  },
  {
    id: "buildCooperative",
    label: "筹建互助合作社",
    kind: "construction",
    cost: { command: 1, grain: 2, cadres: 1 },
    institutionId: "Cooperative",
    description: "启动合作生产建设队列。",
  },
  {
    id: "buildClinic",
    label: "筹建救护所",
    kind: "construction",
    cost: { command: 1, grain: 2, medicine: 1 },
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
    cost: { command: 1, grain: 1, cadres: 2 },
    institutionId: "Station",
    description: "启动地下交通和情报设施建设队列。",
  },
  {
    id: "buildTunnels",
    label: "筹建地道网",
    kind: "construction",
    cost: { command: 1, grain: 3, cadres: 1 },
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
    cost: { command: 1, grain: 1 },
    description: "按地形建设梯田、隐蔽修械点或观察哨，供邻近村庄工作。",
  },
  {
    id: "selfProduction",
    label: "生产自救",
    kind: "production",
    cost: { command: 1 },
    description: "让工作队或村庄劳力集中投入当月生产；同一阶段重复组织会递减并最终封顶。",
  },
  {
    id: "emergencySupply",
    label: "紧急交通接济",
    kind: "recovery",
    cost: { command: 2, cadres: 1 },
    description: "从预置联络线向邻区分散调运，以干部、暴露、团结、纪律和冷却为代价恢复最低周转。",
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

function HashEnemyPlanText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function CreateEnemyPlanningState() {
  return {
    currentPlan: null,
    planHistory: [],
    pendingReconClarity: 0,
    routeMemory: {
      sabotageByHexId: {},
      routeUseByHexId: {},
      executedSabotage: [],
      routeUseTraces: [],
    },
  };
}

function EnsureEnemyPlanningState(state) {
  if (!state.enemyPlanning || typeof state.enemyPlanning !== "object") {
    state.enemyPlanning = CreateEnemyPlanningState();
  }
  if (!state.enemyPlanning.routeMemory || typeof state.enemyPlanning.routeMemory !== "object") {
    state.enemyPlanning.routeMemory = CreateEnemyPlanningState().routeMemory;
  }
  const routeMemory = state.enemyPlanning.routeMemory;
  routeMemory.sabotageByHexId = routeMemory.sabotageByHexId || {};
  routeMemory.routeUseByHexId = routeMemory.routeUseByHexId || {};
  routeMemory.executedSabotage = Array.isArray(routeMemory.executedSabotage)
    ? routeMemory.executedSabotage
    : [];
  routeMemory.routeUseTraces = Array.isArray(routeMemory.routeUseTraces)
    ? routeMemory.routeUseTraces
    : [];
  state.enemyPlanning.planHistory = Array.isArray(state.enemyPlanning.planHistory)
    ? state.enemyPlanning.planHistory
    : [];
  state.enemyPlanning.pendingReconClarity = Number.isFinite(Number(state.enemyPlanning.pendingReconClarity))
    ? Clamp(Number(state.enemyPlanning.pendingReconClarity), 0, 3)
    : 0;
  return state.enemyPlanning;
}

function RecordEnemyObservableTrace(state, traceType, hexId) {
  const planning = EnsureEnemyPlanningState(state);
  const routeMemory = planning.routeMemory;
  const isSabotage = traceType === "Sabotage";
  const countField = isSabotage ? "sabotageByHexId" : "routeUseByHexId";
  const historyField = isSabotage ? "executedSabotage" : "routeUseTraces";
  routeMemory[countField][hexId] = (routeMemory[countField][hexId] || 0) + 1;
  routeMemory[historyField].push({ turn: state.turn, hexId });
  routeMemory[historyField] = routeMemory[historyField].slice(-32);
}

export function GetEnemyObservableSnapshot(state, executionTurn = state?.turn || 1) {
  const routeMemory = state?.enemyPlanning?.routeMemory || CreateEnemyPlanningState().routeMemory;
  const cutoffTurn = Math.max(1, executionTurn - 5);
  const knownHexes = (state?.hexes || [])
    .filter((hex) => IsVillage(hex) || hex.rail || hex.road)
    .map((hex) => ({
      hexId: hex.id,
      q: hex.q,
      r: hex.r,
      name: hex.name,
      terrain: hex.terrain,
      village: IsVillage(hex),
      road: Boolean(hex.road),
      rail: Boolean(hex.rail),
    }))
    .sort((first, second) => first.hexId.localeCompare(second.hexId));
  const publicInstitutions = (state?.hexes || [])
    .filter((hex) => IsVillage(hex) && typeof hex.institution === "string" && hex.institution.length > 0)
    .map((hex) => ({ hexId: hex.id, institutionId: hex.institution }))
    .sort((first, second) => first.hexId.localeCompare(second.hexId));
  const executedSabotage = (routeMemory.executedSabotage || [])
    .filter((entry) => entry.turn < executionTurn && entry.turn >= cutoffTurn)
    .map((entry) => ({ turn: entry.turn, hexId: entry.hexId }));
  const routeUseTraces = (routeMemory.routeUseTraces || [])
    .filter((entry) => entry.turn < executionTurn && entry.turn >= cutoffTurn)
    .map((entry) => ({ turn: entry.turn, hexId: entry.hexId }));
  return {
    executionTurn,
    operationalSeed: Number(state?.initialSeed || state?.seed || 19410918) >>> 0,
    exposure: Clamp(Math.round(Number(state?.meters?.exposure || 0)), 0, 100),
    enemyPressure: GetHistoricalTurn(executionTurn)?.enemyPressure || 1,
    knownHexes,
    publicInstitutions,
    executedSabotage,
    routeUseTraces,
  };
}

function GetSnapshotHexDistance(firstHex, secondHex) {
  const deltaQ = firstHex.q - secondHex.q;
  const deltaR = firstHex.r - secondHex.r;
  const deltaS = (-firstHex.q - firstHex.r) - (-secondHex.q - secondHex.r);
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(deltaS));
}

function CountSnapshotTracesNear(snapshot, traces, targetHex, radius = 2) {
  const hexById = new Map(snapshot.knownHexes.map((hex) => [hex.hexId, hex]));
  return traces.reduce((total, trace) => {
    const traceHex = hexById.get(trace.hexId);
    if (!traceHex) {
      return total;
    }
    const distance = GetSnapshotHexDistance(traceHex, targetHex);
    return total + Math.max(0, radius + 1 - distance);
  }, 0);
}

function GetEnemyPlanSignalSector(hex) {
  if (!hex) {
    return "县境交通带";
  }
  if (hex.r <= 2) {
    return "北部山口与村庄带";
  }
  if (hex.r >= 5) {
    return "南部河谷与交通线";
  }
  return "中部道路与沿线村庄";
}

export function GenerateEnemyOperationalPlan(state, executionTurn = state?.turn || 1) {
  const snapshot = GetEnemyObservableSnapshot(state, executionTurn);
  const institutionIds = new Set(snapshot.publicInstitutions.map((entry) => entry.hexId));
  const villages = snapshot.knownHexes.filter((hex) => hex.village);
  const rankedVillages = villages
    .map((hex) => {
      const sabotagePressure = CountSnapshotTracesNear(snapshot, snapshot.executedSabotage, hex, 2);
      const routePressure = CountSnapshotTracesNear(snapshot, snapshot.routeUseTraces, hex, 2);
      const fixedNoise = HashEnemyPlanText(
        `${snapshot.operationalSeed}|${executionTurn}|Village|${hex.hexId}`,
      ) % 11;
      return {
        hex,
        score: (institutionIds.has(hex.hexId) ? 18 : 0)
          + (hex.road ? 7 : 0)
          + (terrainById.get(hex.terrain)?.concealment || 0)
          + Math.floor(snapshot.exposure / 18)
          + (sabotagePressure * 3)
          + (routePressure * 2)
          + fixedNoise,
      };
    })
    .sort((first, second) => second.score - first.score || first.hex.hexId.localeCompare(second.hex.hexId));

  const primaryTarget = rankedVillages[0]?.hex || null;
  const feintIndex = rankedVillages.length > 2
    ? 1 + (HashEnemyPlanText(`${snapshot.operationalSeed}|${executionTurn}|Feint`) % (rankedVillages.length - 1))
    : 1;
  const feintTarget = rankedVillages[feintIndex]?.hex || rankedVillages[1]?.hex || null;
  const secondaryTargets = rankedVillages
    .filter((entry) => entry.hex.hexId !== primaryTarget?.hexId && entry.hex.hexId !== feintTarget?.hexId)
    .slice(0, snapshot.enemyPressure >= 6 ? 2 : 1)
    .map((entry) => entry.hex.hexId);

  const sabotageCountByHexId = snapshot.executedSabotage.reduce((counts, entry) => {
    counts[entry.hexId] = (counts[entry.hexId] || 0) + 1;
    return counts;
  }, {});
  const routeCountByHexId = snapshot.routeUseTraces.reduce((counts, entry) => {
    counts[entry.hexId] = (counts[entry.hexId] || 0) + 1;
    return counts;
  }, {});
  const railCandidates = snapshot.knownHexes
    .filter((hex) => hex.rail)
    .map((hex) => ({
      hex,
      sabotageCount: sabotageCountByHexId[hex.hexId] || 0,
      traceCount: routeCountByHexId[hex.hexId] || 0,
      noise: HashEnemyPlanText(`${snapshot.operationalSeed}|${executionTurn}|Rail|${hex.hexId}`) % 5,
    }))
    .sort((first, second) => {
      const firstScore = (first.sabotageCount * 12) + (first.traceCount * 4) + first.noise;
      const secondScore = (second.sabotageCount * 12) + (second.traceCount * 4) + second.noise;
      return secondScore - firstScore || first.hex.hexId.localeCompare(second.hex.hexId);
    });
  const totalSabotage = snapshot.executedSabotage.length;
  const maximumRepeatedSabotage = Math.max(0, ...Object.values(sabotageCountByHexId));
  const repeatedRouteUse = Math.max(0, ...Object.values(routeCountByHexId));
  const routeProtectionBudget = Clamp(
    1 + totalSabotage + Math.max(0, maximumRepeatedSabotage - 1) + Math.floor(repeatedRouteUse / 2),
    1,
    8,
  );
  const routeProtectionIds = railCandidates
    .slice(0, routeProtectionBudget >= 5 ? 3 : routeProtectionBudget >= 3 ? 2 : 1)
    .map((entry) => entry.hex.hexId);
  const intentBudgets = {
    mainAssault: Clamp(2 + snapshot.enemyPressure + Math.floor(snapshot.exposure / 25), 2, 10),
    feint: 2 + (HashEnemyPlanText(`${snapshot.operationalSeed}|${executionTurn}|FeintBudget`) % 3),
    routeProtection: routeProtectionBudget,
    pacification: Clamp(1 + snapshot.publicInstitutions.length + Math.floor(snapshot.exposure / 30), 1, 8),
  };
  const reserveBudget = Clamp(1 + Math.floor(snapshot.enemyPressure / 3), 1, 4);
  const decisionFingerprintSource = {
    executionTurn,
    snapshot,
    primaryTargetId: primaryTarget?.hexId || null,
    secondaryTargetIds: secondaryTargets,
    feintTargetIds: feintTarget ? [feintTarget.hexId] : [],
    routeProtectionIds,
    intentBudgets,
    reserveBudget,
  };
  const fingerprint = HashEnemyPlanText(JSON.stringify(decisionFingerprintSource)).toString(16).padStart(8, "0");
  return {
    id: `EnemyPlan_T${executionTurn}_${fingerprint}`,
    createdTurn: Math.max(0, executionTurn - 1),
    executionTurn,
    locked: true,
    fingerprint,
    primaryTargetId: primaryTarget?.hexId || null,
    secondaryTargetIds: secondaryTargets,
    feintTargetIds: feintTarget ? [feintTarget.hexId] : [],
    routeProtectionIds,
    intentBudgets,
    reserveBudget,
    reconClarity: 0,
    signals: {
      mainSector: GetEnemyPlanSignalSector(primaryTarget),
      feintSector: GetEnemyPlanSignalSector(feintTarget),
      railwayActivity: routeProtectionBudget >= 5 ? "铁路沿线岗哨与抢修料明显增加" : "铁路沿线巡逻班次有所变化",
      pacificationActivity: intentBudgets.pacification >= 5 ? "据点正在征集向导与短期运输力量" : "若干据点出现临时人员调动",
    },
    observableSnapshot: snapshot,
  };
}

function LockEnemyOperationalPlan(state, executionTurn) {
  const planning = EnsureEnemyPlanningState(state);
  if (planning.currentPlan?.locked && planning.currentPlan.executionTurn === executionTurn) {
    return planning.currentPlan;
  }
  const plan = GenerateEnemyOperationalPlan(state, executionTurn);
  plan.reconClarity = Clamp(planning.pendingReconClarity || 0, 0, 3);
  planning.pendingReconClarity = 0;
  planning.currentPlan = plan;
  return plan;
}

function ArchiveEnemyOperationalPlan(state) {
  const planning = EnsureEnemyPlanningState(state);
  if (!planning.currentPlan) {
    return;
  }
  planning.planHistory.push(DeepClone(planning.currentPlan));
  planning.planHistory = planning.planHistory.slice(-turnLimit);
}

function HasDoctrine(state, doctrineId) {
  return state.doctrines.civilian.unlocked.includes(doctrineId)
    || state.doctrines.military.unlocked.includes(doctrineId);
}

function HasPolicy(state, policyId) {
  const policyIds = state.policyLock?.locked && state.policyLock.turn === state.turn
    ? state.policyLock.policyIds
    : state.policies;
  return policyIds.includes(policyId);
}

function GetPolicyEffect(state, effectId, fallback = 0) {
  const policyIds = state.policyLock?.locked && state.policyLock.turn === state.turn
    ? state.policyLock.policyIds
    : state.policies;
  return policyIds.reduce((total, policyId) => {
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

function EnsurePolicyLock(state) {
  if (!state.policyLock || state.policyLock.turn !== state.turn) {
    state.policyLock = {
      turn: state.turn,
      locked: false,
      policyIds: [...state.policies],
    };
  }
  if (!Array.isArray(state.policyLock.policyIds)) {
    state.policyLock.policyIds = [...state.policies];
  }
  return state.policyLock;
}

function LockPoliciesForCurrentTurn(state) {
  const policyLock = EnsurePolicyLock(state);
  if (!policyLock.locked) {
    policyLock.locked = true;
    policyLock.policyIds = [...state.policies];
  }
  return policyLock;
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
  if (action?.id === "emergencySupply" && (state.resources.cadres || 0) <= 0) {
    cost.cadres = 0;
  }
  return cost;
}

function CreateMap() {
  const hexes = [];
  for (let r = 0; r < mapHeight; r += 1) {
    for (let q = 0; q < mapWidth; q += 1) {
      const terrain = terrainLayout[r][q];
      const rail = q === 6 || (r === 3 && q >= 7);
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
        shelteredHouseholds: 0,
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
    recoveryRequired: false,
    brokenTurnsRemaining: 0,
    brokenSinceTurn: null,
    outOfSupplyTurns: 0,
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
    const householdFactor = village.originalHouseholds > 0
      ? Clamp(village.households / village.originalHouseholds, 0, 1)
      : 0;
    const survivalFactor = village.livelihood <= 0 || village.households <= 0
      ? 0
      : Clamp(village.livelihood / 70, 0.25, 1) * householdFactor;
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
  const plan = state.enemyPlanning?.currentPlan?.executionTurn === targetTurn
    ? state.enemyPlanning.currentPlan
    : null;
  const plannedTargetIds = plan
    ? [plan.primaryTargetId, ...(plan.secondaryTargetIds || [])].filter(Boolean)
    : [];
  const plannedTargets = plannedTargetIds
    .map((hexId) => FindHexInternal(state, hexId))
    .filter((hex) => IsVillage(hex) && hex.livelihood > 0);
  const alreadySelectedIds = new Set(plannedTargets.map((hex) => hex.id));
  const fallbackTargets = state.hexes
    .filter((hex) => IsVillage(hex) && hex.livelihood > 0 && !alreadySelectedIds.has(hex.id))
    .map((hex) => ({
      hex,
      score: (hex.institution ? 16 : 0)
        + (hex.road ? 8 : 0)
        - ((terrainById.get(hex.terrain)?.concealment || 0) * 3)
        + (HashEnemyPlanText(`${state.initialSeed}|${targetTurn}|Warning|${hex.id}`) % 7),
    }))
    .sort((first, second) => second.score - first.score || first.hex.id.localeCompare(second.hex.id))
    .map((entry) => entry.hex);
  const targets = [...plannedTargets, ...fallbackTargets].slice(0, targetCount);

  for (const target of targets) {
    target.warning = {
      turn: targetTurn,
      kind: "Sweep",
      intensity: GetHistoricalTurn(targetTurn)?.sweepIntensity || (state.meters.exposure >= 75 ? 2 : 1),
      text: `${targetTurn === 9 ? "多路扫荡" : "搜索扫荡"}可能指向${target.name}`,
      sourcePlanId: plan?.id || null,
      confidence: (plan?.reconClarity || 0) >= 2 ? "Corroborated" : "Probable",
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
      CreateEnemyUnit("Enemy_Sweep_One", "北路临时扫荡纵队（情境合成称谓）", "SweepColumn", HexId(8, 3), false),
      CreateEnemyUnit("Enemy_Sweep_Two", "南路临时扫荡纵队（情境合成称谓）", "SweepColumn", HexId(8, 3), false),
    ],
    enemyPlanning: CreateEnemyPlanningState(),
    orders: [],
    doctrines: {
      civilian: {
        experience: 0,
        spentExperience: 0,
        lastUnlockTurn: null,
        unlocked: ["MassLine"],
      },
      military: {
        experience: 0,
        spentExperience: 0,
        lastUnlockTurn: null,
        unlocked: ["MobileGuerrilla"],
      },
    },
    policies: ["MassDiscipline", "FlexibleDispersion"],
    policyLock: {
      turn: 1,
      locked: false,
      policyIds: ["MassDiscipline", "FlexibleDispersion"],
    },
    productionLedger: {
      usesByStage: {},
      civilianExperienceByStage: {},
    },
    intelligenceLedger: {
      reconUsesByStage: {},
      militaryExperienceByStage: {},
    },
    turnEconomy: {
      turn: 1,
      workedImprovementByHexId: {},
    },
    emergencySupplyCooldownUntil: 0,
    lastTurnEconomy: null,
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
  LockEnemyOperationalPlan(state, 1);
  PrepareWarningsForCurrentTurn(state);
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
  return improvementDefinitions.find((improvement) => improvement.terrains.includes(terrain)) || null;
}

function GetEligibleImprovementsForTerrain(terrain) {
  return improvementDefinitions.filter((improvement) => improvement.terrains.includes(terrain));
}

function GetVillageLaborFactor(village) {
  if (!IsVillage(village) || village.households <= 0 || village.originalHouseholds <= 0) {
    return 0;
  }
  const householdFactor = Clamp(village.households / village.originalHouseholds, 0, 1);
  const hardshipFactor = Clamp(1 - (village.hardship / 120), 0.15, 1);
  return householdFactor * hardshipFactor;
}

function IsHexSupplyConnected(state, hexId) {
  const targetHex = FindHexInternal(state, hexId);
  if (!targetHex) {
    return false;
  }
  const headquarters = state.hexes.find((hex) => hex.feature === "Headquarters");
  if (headquarters && HexDistance(headquarters, targetHex) <= 2) {
    return true;
  }
  const operationalStations = state.hexes.filter((hex) => IsVillage(hex)
    && hex.institution === "Station"
    && hex.households > 0
    && hex.livelihood > 0);
  const stationConnected = operationalStations.some((station) => HexDistance(station, targetHex) <= 3);
  if (!stationConnected) {
    return false;
  }
  const localBlockade = state.enemies.some((enemy) => {
    if (!enemy.active || !["Garrison", "Patrol", "Search"].includes(enemy.type)) {
      return false;
    }
    const enemyHex = FindHexInternal(state, enemy.hexId);
    return enemyHex && HexDistance(enemyHex, targetHex) <= 1;
  });
  return !localBlockade || targetHex.institution === "Station";
}

function IsVillageSupplyConnected(state, village) {
  return IsVillage(village) && IsHexSupplyConnected(state, village.id);
}

function GetCampaignStage(turn) {
  return Math.ceil(Clamp(turn, 1, turnLimit) / 4);
}

function EnsureProductionLedger(state) {
  if (!state.productionLedger || typeof state.productionLedger !== "object") {
    state.productionLedger = { usesByStage: {}, civilianExperienceByStage: {} };
  }
  state.productionLedger.usesByStage = state.productionLedger.usesByStage || {};
  state.productionLedger.civilianExperienceByStage = state.productionLedger.civilianExperienceByStage || {};
  return state.productionLedger;
}

function GetSelfProductionUseCount(state, hexId) {
  const stageKey = `Stage_${GetCampaignStage(state.turn)}`;
  return state.productionLedger?.usesByStage?.[stageKey]?.[hexId] || 0;
}

function RecordSelfProductionUse(state, hexId) {
  const ledger = EnsureProductionLedger(state);
  const stageKey = `Stage_${GetCampaignStage(state.turn)}`;
  ledger.usesByStage[stageKey] = ledger.usesByStage[stageKey] || {};
  const useCount = ledger.usesByStage[stageKey][hexId] || 0;
  ledger.usesByStage[stageKey][hexId] = useCount + 1;
  const awarded = ledger.civilianExperienceByStage[stageKey] || 0;
  const experienceGain = Math.min(2, Math.max(0, 4 - awarded));
  ledger.civilianExperienceByStage[stageKey] = awarded + experienceGain;
  return { useCount, experienceGain };
}

function EnsureIntelligenceLedger(state) {
  if (!state.intelligenceLedger || typeof state.intelligenceLedger !== "object") {
    state.intelligenceLedger = { reconUsesByStage: {}, militaryExperienceByStage: {} };
  }
  state.intelligenceLedger.reconUsesByStage = state.intelligenceLedger.reconUsesByStage || {};
  state.intelligenceLedger.militaryExperienceByStage = state.intelligenceLedger.militaryExperienceByStage || {};
  return state.intelligenceLedger;
}

function GetReconUseCount(state, unitId) {
  const stageKey = `Stage_${GetCampaignStage(state.turn)}`;
  return state.intelligenceLedger?.reconUsesByStage?.[stageKey]?.[unitId] || 0;
}

function RecordReconUse(state, unitId) {
  const ledger = EnsureIntelligenceLedger(state);
  const stageKey = `Stage_${GetCampaignStage(state.turn)}`;
  ledger.reconUsesByStage[stageKey] = ledger.reconUsesByStage[stageKey] || {};
  const useCount = ledger.reconUsesByStage[stageKey][unitId] || 0;
  ledger.reconUsesByStage[stageKey][unitId] = useCount + 1;
  const awarded = ledger.militaryExperienceByStage[stageKey] || 0;
  const requestedExperience = useCount === 0 ? 3 : 1;
  const experienceGain = Math.min(requestedExperience, Math.max(0, 6 - awarded));
  ledger.militaryExperienceByStage[stageKey] = awarded + experienceGain;
  return { useCount, experienceGain };
}

function EnsureTurnEconomy(state) {
  if (!state.turnEconomy || state.turnEconomy.turn !== state.turn) {
    state.turnEconomy = {
      turn: state.turn,
      workedImprovementByHexId: {},
    };
  }
  state.turnEconomy.workedImprovementByHexId = state.turnEconomy.workedImprovementByHexId || {};
  return state.turnEconomy;
}

function ClaimVillageWorkedImprovement(state, village) {
  const turnEconomy = EnsureTurnEconomy(state);
  const candidates = GetNeighbors(state, village.id)
    .filter((hex) => hex.improvement && hex.control !== "enemy")
    .filter((hex) => {
      const ownerVillageId = turnEconomy.workedImprovementByHexId[hex.id];
      return !ownerVillageId || ownerVillageId === village.id;
    })
    .map((hex) => ({
      hex,
      value: Object.values(CalculateTileYield(hex)).reduce((total, amount) => total + amount, 0),
    }))
    .sort((first, second) => second.value - first.value || first.hex.id.localeCompare(second.hex.id));
  const workedHex = candidates[0]?.hex || null;
  if (workedHex) {
    turnEconomy.workedImprovementByHexId[workedHex.id] = village.id;
  }
  return workedHex;
}

function ValidateAction(
  state,
  actionId,
  selectedHexId,
  selectedUnitId,
  targetHexId = null,
  improvementId = null,
) {
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
  const requiresUnit = !["selfProduction", "emergencySupply"].includes(actionId);

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
    if (GetReconUseCount(state, unit.id) >= 2) {
      return { enabled: false, reason: "该单位本阶段侦察线索已经耗尽，应轮换人员或等待下一阶段" };
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
    if (targetHex.households <= 0) {
      return { enabled: false, reason: "该村已经没有可组织住户，不能继续生产或建设" };
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
    if (!targetHex.construction) {
      return { enabled: false, reason: "该村目前没有建设队列" };
    }
    return GetVillageLaborFactor(targetHex) > 0
      ? { enabled: true, reason: "" }
      : { enabled: false, reason: "该村没有可维持施工的有效劳力" };
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
    if (state.orders.some((order) => order.actionId === "improveTile" && order.targetHexId === targetHex.id)) {
      return { enabled: false, reason: "该地块本回合已经安排改良" };
    }
    const selectedImprovement = improvementId
      ? improvementById.get(improvementId)
      : GetImprovementForTerrain(targetHex.terrain);
    if (!selectedImprovement || !selectedImprovement.terrains.includes(targetHex.terrain)) {
      return { enabled: false, reason: "所选改良不适合该地形" };
    }
    return { enabled: true, reason: "" };
  }

  if (actionId === "selfProduction") {
    if (!targetHex || !(IsVillage(targetHex) || targetHex.feature === "Headquarters")) {
      return { enabled: false, reason: "请选择相连村庄或根据地驻地" };
    }
    if (IsVillage(targetHex) && (targetHex.contact < 30 || targetHex.livelihood <= 0 || targetHex.households <= 0)) {
      return { enabled: false, reason: "该村尚未接入共同生产网络" };
    }
    const workTeamAtTarget = unit?.type === "WorkTeam" && unitHex?.id === targetHex.id;
    const localLaborAvailable = IsVillage(targetHex)
      ? GetVillageLaborFactor(targetHex) >= 0.2 && IsVillageSupplyConnected(state, targetHex)
      : targetHex.feature === "Headquarters";
    if (!workTeamAtTarget && !localLaborAvailable) {
      return { enabled: false, reason: "需要驻地工作队或足够的本地劳力" };
    }
    if (GetSelfProductionUseCount(state, targetHex.id) >= 2) {
      return { enabled: false, reason: "该地本阶段生产自救已经达到上限" };
    }
    if (state.orders.some((order) => order.actionId === "selfProduction" && order.hexId === targetHex.id)) {
      return { enabled: false, reason: "该地本回合已经安排生产" };
    }
    return { enabled: true, reason: "" };
  }

  if (actionId === "emergencySupply") {
    const workTeamAtHeadquarters = unit?.type === "WorkTeam"
      && unitHex?.feature === "Headquarters"
      && targetHex?.id === unitHex.id;
    const headquartersReserveLabor = !unit && targetHex?.feature === "Headquarters";
    if (!workTeamAtHeadquarters && !headquartersReserveLabor) {
      return { enabled: false, reason: "紧急接济必须由驻地工作队或留守交通人员组织" };
    }
    if (state.turn < (state.emergencySupplyCooldownUntil || 0)) {
      return {
        enabled: false,
        reason: `预置交通联络线正在重新隐蔽，需到第 ${state.emergencySupplyCooldownUntil} 回合才能再次调运`,
      };
    }
    if (!Object.values(state.resources).some((amount) => amount <= 0)) {
      return { enabled: false, reason: "各项物资仍能周转，无需承担紧急接济代价" };
    }
    if (state.orders.some((order) => order.actionId === "emergencySupply")) {
      return { enabled: false, reason: "本回合已经安排紧急接济" };
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
    const canRest = currentHex?.feature === "Headquarters"
      || currentHex?.institution === "Clinic"
      || (unit.recoveryRequired && unit.type === "Militia" && IsVillage(currentHex));
    if (!canRest) {
      return { enabled: false, reason: "整训救护必须在驻地或救护所进行" };
    }
    if (unit.recoveryRequired && unit.brokenTurnsRemaining > 0) {
      return { enabled: false, reason: `该单位仍需隐蔽整顿 ${unit.brokenTurnsRemaining} 回合` };
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
      {
        const baseIntelGain = 2
          + (HasDoctrine(state, "IntelligenceBeforeAction") ? 1 : 0)
          + GetPolicyEffect(state, "reconIntel", 0);
        const reconUseCount = unit ? GetReconUseCount(state, unit.id) : 0;
        const intelGain = reconUseCount === 0 ? baseIntelGain : Math.max(1, Math.floor(baseIntelGain / 2));
        effects.push(`获得 ${intelGain} 情报；本阶段已侦察 ${reconUseCount}/2 次`);
      }
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
      risks.push("临时安置会增加生活负担；威胁解除后将核验返村、继续安置或实际流离，不把保护行动自动算作永久损失");
      break;
    case "selfProduction":
      effects.push(`获得${targetHex?.name}本地地块的额外产出`);
      effects.push(`本阶段已组织 ${targetHex ? GetSelfProductionUseCount(state, targetHex.id) : 0}/2 次，第二次产出递减`);
      risks.push("集中劳动会使困苦略微上升");
      break;
    case "emergencySupply":
      effects.push("恢复粮、军械、药品、情报与干部的最低周转量");
      effects.push("获得 1 点军事路线后勤实践");
      risks.push("消耗两道行动令及可用交通干部，提高暴露并降低团结、纪律；线路随后冷却一回合");
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
  const improvementOptions = actionId === "improveTile" && targetHex
    ? GetEligibleImprovementsForTerrain(targetHex.terrain).map((improvement) => ({
      improvementId: improvement.id,
      label: improvement.label,
      yield: DeepClone(improvement.yield),
    }))
    : [];
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
    improvementOptions,
    defaultImprovementId: improvementOptions[0]?.improvementId || null,
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
    actionIds.push("selfProduction", "emergencySupply");
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
  const targetHex = targetHexId ? FindHexInternal(next, targetHexId) : null;
  const improvementId = action.id === "improveTile"
    ? (orderLike.improvementId || GetImprovementForTerrain(targetHex?.terrain)?.id || null)
    : null;
  const validation = ValidateAction(
    next,
    action.id,
    targetHexId,
    orderLike.unitId || null,
    targetHexId,
    improvementId,
  );
  if (!validation.enabled) {
    next.lastError = validation.reason;
    return next;
  }
  const policyLock = LockPoliciesForCurrentTurn(next);
  const laborSource = action.id === "selfProduction"
    ? (unit?.type === "WorkTeam" && projectedHexId === targetHexId
      ? unit.id
      : (targetHex?.feature === "Headquarters" ? "HeadquartersLabor" : "LocalHouseholds"))
    : null;
  next.orders.push({
    id: `Order_T${next.turn}_${next.orders.length + 1}`,
    actionId: action.id,
    hexId: targetHexId,
    unitId: orderLike.unitId || null,
    targetHexId,
    cost: GetEffectiveActionCost(next, action),
    policySnapshot: [...policyLock.policyIds],
    ...(improvementId ? { improvementId } : {}),
    ...(laborSource ? { laborSource } : {}),
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

function CalculateVillageYield(state, village, concentrated = false, workedHex = null, yieldMultiplier = 1) {
  if (!IsVillage(village)
    || village.contact < 30
    || village.livelihood <= 0
    || village.households <= 0) {
    return { grain: 0, arms: 0, medicine: 0, intel: 0, cadres: 0 };
  }
  const localYield = CalculateTileYield(village);
  const workedYield = workedHex ? CalculateTileYield(workedHex) : {};
  const laborFactor = GetVillageLaborFactor(village);
  const livelihoodFactor = Clamp(village.livelihood / 75, 0.2, 1);
  const concentrationFactor = concentrated ? 1.1 : 0.65;
  const outputFactor = laborFactor * livelihoodFactor * concentrationFactor * yieldMultiplier;
  const output = {
    grain: Math.max(0, Math.floor((2 + (localYield.grain || 0) + (workedYield.grain || 0)) * outputFactor)),
    arms: Math.max(0, Math.floor(((localYield.arms || 0) + (workedYield.arms || 0)) * outputFactor)),
    medicine: Math.max(0, Math.floor(((localYield.medicine || 0) + (workedYield.medicine || 0)) * outputFactor)),
    intel: Math.max(0, Math.floor(((localYield.intel || 0) + (workedYield.intel || 0)) * outputFactor)),
    cadres: 0,
  };
  if (village.institution === "Cooperative") {
    output.grain += Math.floor((2 + GetPolicyEffect(state, "grainBonus", 0)) * laborFactor * yieldMultiplier);
  } else if (village.institution === "Clinic" && state.turn % 2 === 0) {
    output.medicine += laborFactor * yieldMultiplier >= 0.5 ? 1 : 0;
  } else if (village.institution === "Arsenal") {
    output.arms += laborFactor * yieldMultiplier >= 0.5 ? 1 : 0;
  } else if (village.institution === "Station") {
    output.intel += laborFactor * yieldMultiplier >= 0.5 ? 1 : 0;
  } else if (village.institution === "PartyBranch" && state.turn % 3 === 0) {
    output.cadres += laborFactor * yieldMultiplier >= 0.5 ? 1 : 0;
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
  if (Array.isArray(order.policySnapshot)) {
    state.policyLock = {
      turn: state.turn,
      locked: true,
      policyIds: [...order.policySnapshot],
    };
  }
  SpendOrderCost(state, order);

  if (action.id === "move") {
    unit.hexId = targetHex.id;
    unit.moves = 0;
    unit.moved = true;
    if (targetHex.road || targetHex.rail) {
      RecordEnemyObservableTrace(state, "RouteUse", targetHex.id);
    }
    state.log.push(`${unit.name}移动至${targetHex.name}。`);
    return;
  }

  if (unit) {
    unit.acted = true;
  }

  if (action.id === "recon") {
    const originHexId = unit?.hexId || targetHex?.id;
    const reconUse = RecordReconUse(state, unit.id);
    const baseIntelligenceGain = 2
      + (HasDoctrine(state, "IntelligenceBeforeAction") ? 1 : 0)
      + GetPolicyEffect(state, "reconIntel", 0);
    const intelligenceGain = reconUse.useCount === 0
      ? baseIntelligenceGain
      : Math.max(1, Math.floor(baseIntelligenceGain / 2));
    state.resources.intel = Clamp(state.resources.intel + intelligenceGain, 0, maximumResource);
    state.meters.exposure = Clamp(state.meters.exposure - 2, 0, maximumMeter);
    AddDoctrineExperience(state, "military", reconUse.experienceGain);
    RevealRadius(state, originHexId, 3);
    const planning = EnsureEnemyPlanningState(state);
    if (planning.currentPlan?.executionTurn === state.turn) {
      planning.currentPlan.reconClarity = Clamp(
        (planning.currentPlan.reconClarity || 0) + 1,
        0,
        3,
      );
    }
    planning.pendingReconClarity = Clamp((planning.pendingReconClarity || 0) + 1, 0, 3);
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
    targetHex.evacuated = true;
    targetHex.evacuationProtection = 2;
    targetHex.shelteredHouseholds = movedHouseholds;
    targetHex.hardship = Clamp(targetHex.hardship + 3, 0, maximumMeter);
    AddCivilianLedgerEntry(state, {
      type: "ProtectiveShelter",
      villageId: targetHex.id,
      villageName: targetHex.name,
      households: movedHouseholds,
      temporary: true,
      text: `${targetHex.name}有 ${movedHouseholds} 户临时转入山地隐蔽安置。这是保护性措施及生活负担，不等同于永久流离；威胁解除后须核验返村或自愿继续安置的去向。`,
    });
    AddDoctrineExperience(state, "civilian", 4);
    state.log.push(`${targetHex.name}完成预警下的保护性疏散，${movedHouseholds} 户临时转入隐蔽安置。`);
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
    const laborFactor = GetVillageLaborFactor(targetHex);
    const progressGain = Math.max(1, Math.floor(4 * laborFactor));
    targetHex.construction.progress += progressGain;
    AddDoctrineExperience(state, "civilian", 2);
    state.log.push(`${unit.name}协助${targetHex.name}集中施工，工程 +${progressGain}。`);
    return;
  }

  if (action.id === "improveTile") {
    const improvement = improvementById.get(order.improvementId)
      || GetImprovementForTerrain(targetHex.terrain);
    targetHex.improvement = improvement.id;
    targetHex.control = "player";
    AddDoctrineExperience(state, "civilian", 3);
    state.log.push(`${unit.name}在${targetHex.name}建成${improvement.label}。`);
    return;
  }

  if (action.id === "selfProduction") {
    const productionUse = RecordSelfProductionUse(state, targetHex.id);
    const yieldMultiplier = productionUse.useCount === 0 ? 1 : 0.5;
    if (targetHex.feature === "Headquarters") {
      const grainGain = productionUse.useCount === 0 ? 2 : 1;
      AddResources(state, { grain: grainGain });
      state.log.push(`驻地集中开展生产自救，获得 ${grainGain} 粮秣。`);
    } else {
      const workedHex = ClaimVillageWorkedImprovement(state, targetHex);
      const output = CalculateVillageYield(state, targetHex, true, workedHex, yieldMultiplier);
      AddResources(state, output);
      targetHex.hardship = Clamp(targetHex.hardship + 2, 0, maximumMeter);
      state.log.push(`${targetHex.name}集中生产：${FormatOutput(output)}。`);
    }
    AddDoctrineExperience(state, "civilian", productionUse.experienceGain);
    return;
  }

  if (action.id === "emergencySupply") {
    AddResources(state, { grain: 4, arms: 1, medicine: 1, intel: 1, cadres: 1 });
    AddDoctrineExperience(state, "military", 1);
    state.meters.exposure = Clamp(state.meters.exposure + 12, 0, maximumMeter);
    state.meters.unity = Clamp(state.meters.unity - 3, 0, maximumMeter);
    state.meters.discipline = Clamp(state.meters.discipline - 4, 0, maximumMeter);
    state.emergencySupplyCooldownUntil = state.turn + 2;
    state.log.push(
      "驻地启用预置交通联络线，从邻区分散调运最低周转物资：暴露 +12、团结 -3、纪律 -4，并需间隔一回合重新隐蔽线路。",
    );
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
    state.meters.contribution = Clamp(state.meters.contribution + 3, 0, 999);
    state.meters.discipline = Clamp(state.meters.discipline - (informedAction ? 0 : 2), 0, 100);
    RecordEnemyObservableTrace(state, "Sabotage", targetHex.id);
    AddDoctrineExperience(state, "military", 7);
    state.log.push(`${unit.name}破袭${targetHex.name}铁路，停运 ${targetHex.railDisabledTurns} 回合；暴露 +${exposureGain}。`);
    return;
  }

  if (action.id === "rest") {
    if (unit.recoveryRequired) {
      unit.recoveryRequired = false;
      unit.brokenTurnsRemaining = 0;
      unit.brokenSinceTurn = null;
      unit.readiness = 1;
      state.log.push(`${unit.name}完成补充与重新编组，恢复 1 战备。`);
    } else {
      unit.readiness = Clamp(unit.readiness + 1, 0, unit.maximumReadiness);
      state.log.push(`${unit.name}完成整训救护，恢复 1 战备。`);
    }
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

function GetUnitReadinessFactor(unit) {
  if (!unit || unit.readiness <= 0 || unit.recoveryRequired) {
    return 0;
  }
  const maximumReadiness = unit.maximumReadiness
    || unitById.get(unit.type)?.readiness
    || 1;
  return Clamp(unit.readiness / maximumReadiness, 0, 1);
}

function GetEffectiveUnitStrength(unit) {
  return (unit?.strength || 0) * GetUnitReadinessFactor(unit);
}

function ResolveAmbush(state, unit, targetHex) {
  const enemy = state.enemies.find((candidate) => candidate.active && candidate.hexId === targetHex.id);
  const terrainBonus = terrainById.get(targetHex.terrain)?.defense || 0;
  const militiaDefense = state.units
    .filter((candidate) => candidate.type === "Militia" && candidate.hexId === targetHex.id)
    .reduce((total, candidate) => total + GetEffectiveUnitStrength(candidate), 0);
  const doctrineBonus = HasDoctrine(state, "IntelligenceBeforeAction") ? 1 : 0;
  const policyBonus = GetPolicyEffect(state, "ambushBonus", 0);
  const readinessFactor = GetUnitReadinessFactor(unit);
  const playerPower = GetEffectiveUnitStrength(unit)
    + (terrainBonus * readinessFactor)
    + militiaDefense
    + doctrineBonus
    + policyBonus;
  const enemyPower = enemy
    ? GetEffectiveUnitStrength(enemy) + enemy.readiness
    : 5 + (targetHex.warning?.intensity || 1);
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
    if (!village.construction || village.livelihood <= 0 || village.households <= 0) {
      continue;
    }
    const laborFactor = GetVillageLaborFactor(village);
    const progressGain = Math.floor(
      (1 + Math.floor(village.contact / 40) + constructionBonus) * laborFactor,
    );
    if (progressGain <= 0) {
      state.log.push(`${village.name}因有效劳力不足，建设本月停滞。`);
      continue;
    }
    village.construction.progress += progressGain;
    if (village.construction.progress >= village.construction.required) {
      const institution = institutionById.get(village.construction.institutionId);
      village.institution = institution.id;
      village.construction = null;
      AddDoctrineExperience(state, "civilian", 3);
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
    if (village.households <= 0 || village.livelihood <= 0) {
      continue;
    }
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
    const workedHex = village.contact >= 30
      ? ClaimVillageWorkedImprovement(state, village)
      : null;
    const supplyMultiplier = IsVillageSupplyConnected(state, village) ? 1 : 0.35;
    const output = CalculateVillageYield(state, village, false, workedHex, supplyMultiplier);
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
  let supplySurcharge = 0;
  for (const unit of state.units.filter((candidate) => candidate.type !== "Militia" && candidate.readiness > 0)) {
    if (IsHexSupplyConnected(state, unit.hexId)) {
      unit.outOfSupplyTurns = 0;
      continue;
    }
    unit.outOfSupplyTurns = (unit.outOfSupplyTurns || 0) + 1;
    if (unit.outOfSupplyTurns >= 2) {
      supplySurcharge += 1;
      unit.readiness = Math.max(0, unit.readiness - 1);
      state.log.push(`${unit.name}连续 ${unit.outOfSupplyTurns} 回合脱离驻地或交通站补给，额外耗粮并损失 1 战备。`);
    }
  }
  let upkeep = state.units.reduce((total, unit) => {
    if (unit.readiness <= 0 || unit.type === "Militia") {
      return total;
    }
    return total + (unitById.get(unit.type)?.upkeep || 0);
  }, 0);
  upkeep += (event.extraUpkeep || 0) + supplySurcharge;
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

function GetCoordinatedDefenseSupport(state, village, committedSupporterIds = new Set()) {
  const emptySupport = {
    defense: 0,
    unitIds: [],
  };
  if (!HasDoctrine(state, "CoordinatedDefense")
    || !HasPolicy(state, "CoordinatedAmbush")
    || !IsVillage(village)
    || village.contact < 30
    || village.warning?.turn !== state.turn) {
    return emptySupport;
  }

  const exposureFactor = Clamp(
    1 - (Math.max(0, state.meters.exposure - 60) * 0.005),
    0.8,
    1,
  );
  const mainForceSources = [];
  const militiaSources = [];
  for (const unit of state.units) {
    if (committedSupporterIds.has(unit.id)
      || unit.acted
      || GetUnitReadinessFactor(unit) <= 0) {
      continue;
    }
    const unitHex = FindHexInternal(state, unit.hexId);
    if (!unitHex
      || unitHex.warning?.turn === state.turn
      || !IsHexSupplyConnected(state, unit.hexId)) {
      continue;
    }
    const distance = HexDistance(unitHex, village);
    if (unit.type === "MainForce" && distance === 1) {
      mainForceSources.push({
        id: unit.id,
        defense: GetEffectiveUnitStrength(unit) * 0.5 * exposureFactor,
      });
      continue;
    }
    if (unit.type !== "Militia" || distance < 1 || distance > 2 || !IsVillage(unitHex)) {
      continue;
    }
    if (unitHex.control !== "player"
      || unitHex.contact < 60
      || unitHex.livelihood < 45
      || unitHex.households <= 0) {
      continue;
    }
    const organizationFactor = Clamp((unitHex.contact - 40) / 60, 0, 1);
    const distanceFactor = distance === 1 ? 1 : 0.7;
    militiaSources.push({
      id: unit.id,
      defense: GetEffectiveUnitStrength(unit) * 0.5 * organizationFactor
        * GetVillageLaborFactor(unitHex) * distanceFactor * exposureFactor,
    });
  }

  const strongestMainForce = mainForceSources
    .sort((first, second) => second.defense - first.defense || first.id.localeCompare(second.id))[0];
  const strongestMilitia = militiaSources
    .sort((first, second) => second.defense - first.defense || first.id.localeCompare(second.id))[0];
  const committedSources = [strongestMainForce, strongestMilitia].filter(Boolean);
  return {
    defense: Math.min(3, committedSources.reduce((total, source) => total + source.defense, 0)),
    unitIds: committedSources.map((source) => source.id),
  };
}

function GetSweepMitigation(state, village, coordinatedSupport = null) {
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

  const defenders = state.units.filter((unit) => unit.hexId === village.id
    && unit.type !== "WorkTeam"
    && GetUnitReadinessFactor(unit) > 0);
  let defense = defenders.reduce((total, unit) => total + GetEffectiveUnitStrength(unit), 0);
  defense += defenders
    .filter((unit) => unit.type === "Militia")
    .reduce((total, unit) => {
      return total + (GetPolicyEffect(state, "militiaDefense", 0) * GetUnitReadinessFactor(unit));
    }, 0);
  defense += coordinatedSupport?.defense || 0;
  if (defenders.length > 0 || (coordinatedSupport?.defense || 0) > 0) {
    defense += GetPolicyEffect(state, "defenseBonus", 0);
  }
  multiplier *= Clamp(1 - (defense * 0.035), 0.48, 1);
  return Clamp(multiplier, 0.18, 1);
}

function ApplySweepToVillage(state, village, intensity, source, committedSupporterIds = new Set()) {
  if (!village || village.livelihood <= 0 || village.households <= 0 || intensity <= 0) {
    return;
  }
  const coordinatedSupport = GetCoordinatedDefenseSupport(state, village, committedSupporterIds);
  const mitigation = GetSweepMitigation(state, village, coordinatedSupport);
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
  for (const unitId of coordinatedSupport.unitIds) {
    const supporter = FindUnitInternal(state, unitId);
    if (supporter && supporter.readiness > 0) {
      supporter.readiness = Math.max(0, supporter.readiness - 1);
      committedSupporterIds.add(unitId);
    }
  }
  if (coordinatedSupport.defense > 0) {
    state.meters.exposure = Clamp(state.meters.exposure + 1, 0, 100);
    state.log.push(
      `${village.name}获得受限协防：相邻支援折算 ${coordinatedSupport.defense.toFixed(1)} 防御，支援方战备下降且暴露 +1。`,
    );
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
  const plan = state.enemyPlanning?.currentPlan;
  const plannedRouteIds = plan?.executionTurn === state.turn
    ? (plan.routeProtectionIds || [])
    : [];
  const routePriority = new Map(plannedRouteIds.map((hexId, index) => [hexId, index]));
  const repairCandidates = state.hexes
    .filter((hex) => hex.rail && hex.railDisabledTurns > 0 && routePriority.has(hex.id))
    .sort((first, second) => routePriority.get(first.id) - routePriority.get(second.id));
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
  const plan = state.enemyPlanning?.currentPlan?.executionTurn === state.turn
    ? state.enemyPlanning.currentPlan
    : null;
  const primaryTarget = FindHexInternal(state, plan?.primaryTargetId);
  const feintTargets = (plan?.feintTargetIds || [])
    .map((hexId) => FindHexInternal(state, hexId))
    .filter(Boolean);
  const routeProtectionTargets = (plan?.routeProtectionIds || [])
    .map((hexId) => FindHexInternal(state, hexId))
    .filter(Boolean);
  const fallbackTarget = state.hexes.find((hex) => IsVillage(hex));
  if (!primaryTarget && !fallbackTarget) {
    return;
  }
  const movableEnemies = state.enemies.filter((enemy) => enemy.active
    && enemy.moves > 0
    && enemy.type !== "Garrison"
    && !sweptVillageIds.has(enemy.hexId));
  const reserveEnemyId = (plan?.reserveBudget || 0) >= 3
    ? [...movableEnemies].reverse().find((enemy) => enemy.type === "Patrol")?.id
    : null;
  let patrolIndex = 0;
  for (const [enemyIndex, enemy] of state.enemies.entries()) {
    if (!enemy.active || enemy.moves <= 0 || enemy.type === "Garrison" || sweptVillageIds.has(enemy.hexId)) {
      continue;
    }
    if (enemy.id === reserveEnemyId) {
      enemy.intent = (plan?.reconClarity || 0) >= 2 || enemy.visible
        ? "编入机动预备队"
        : "动向不明";
      continue;
    }
    let target = primaryTarget || fallbackTarget;
    if (enemy.type === "Patrol") {
      if (patrolIndex % 2 === 0 && routeProtectionTargets.length > 0) {
        target = routeProtectionTargets[patrolIndex % routeProtectionTargets.length];
      } else if (feintTargets.length > 0) {
        target = feintTargets[patrolIndex % feintTargets.length];
      }
      patrolIndex += 1;
    }
    enemy.intent = (plan?.reconClarity || 0) >= 2 || enemy.visible
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
  const warnedVillages = state.hexes
    .filter((hex) => IsVillage(hex) && hex.warning?.turn === state.turn)
    .sort((first, second) => {
      return (second.warning?.intensity || 1) - (first.warning?.intensity || 1)
        || second.households - first.households
        || first.id.localeCompare(second.id);
    });
  const sweepUnits = state.enemies.filter((enemy) => enemy.type === "SweepColumn");
  const sweptVillageIds = new Set();
  const committedSupporterIds = new Set();
  for (const [warningIndex, village] of warnedVillages.entries()) {
    const sweepUnit = sweepUnits[warningIndex % sweepUnits.length];
    if (sweepUnit) {
      sweepUnit.active = true;
      sweepUnit.hexId = village.id;
      sweepUnit.intent = `扫荡${village.name}`;
      sweepUnit.visible = village.visible;
    }
    const intensity = village.warning?.intensity || 1;
    ApplySweepToVillage(
      state,
      village,
      intensity,
      intensity >= 3 ? "大规模扫荡" : "扫荡",
      committedSupporterIds,
    );
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
  for (const unit of state.units) {
    if (unit.recoveryRequired) {
      unit.readiness = 0;
      unit.moves = 0;
      unit.acted = true;
      if (unit.brokenSinceTurn < state.turn && unit.brokenTurnsRemaining > 0) {
        unit.brokenTurnsRemaining -= 1;
      }
      continue;
    }
    if (unit.readiness > 0) {
      continue;
    }
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
    unit.recoveryRequired = true;
    unit.brokenTurnsRemaining = 2;
    unit.brokenSinceTurn = state.turn;
    unit.readiness = 0;
    unit.moves = 0;
    unit.acted = true;
    state.log.push(`${entry.text}至少需要两回合隐蔽整顿，并消耗药品重新编组。`);
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

function ResolveProtectiveShelterDestinations(state, options = {}) {
  const finalize = options.finalize === true;
  for (const village of state.hexes.filter(IsVillage)) {
    if (village.evacuationProtection > 0) {
      village.evacuationProtection -= 1;
    }
    const shelteredHouseholds = Math.max(0, Number(village.shelteredHouseholds) || 0);
    if (shelteredHouseholds <= 0) continue;

    const villageAbandoned = village.livelihood <= 0
      || state.ledger.villageAbandonments.includes(village.id);
    if (villageAbandoned) {
      const newlyDisplaced = Math.min(shelteredHouseholds, Math.max(0, village.households));
      village.households = Math.max(0, village.households - newlyDisplaced);
      village.shelteredHouseholds = 0;
      village.evacuated = false;
      village.evacuationProtection = 0;
      state.ledger.displacedHouseholds += newlyDisplaced;
      AddCivilianLedgerEntry(state, {
        type: "Displacement",
        villageId: village.id,
        villageName: village.name,
        households: newlyDisplaced,
        text: `${village.name}生计在侵略军扫荡破坏中崩溃，临时安置的 ${newlyDisplaced} 户无法返村，转为已确认流离。责任属于实施侵略与破坏者，不归因于住户或保护性疏散。`,
      });
      state.log.push(`${village.name}核验出 ${newlyDisplaced} 户因侵略军破坏无法返村，转入持续安置与救济。`);
      continue;
    }

    const activeWarning = !finalize && village.warning?.turn === state.turn;
    if (village.evacuationProtection <= 0 && activeWarning) {
      village.evacuationProtection = 1;
      state.log.push(`${village.name}威胁尚未解除，${shelteredHouseholds} 户按本人意愿继续临时隐蔽安置。`);
      continue;
    }

    if (village.evacuationProtection <= 0 || finalize) {
      village.shelteredHouseholds = 0;
      village.evacuated = false;
      state.log.push(
        `${village.name}完成安置去向核验：${shelteredHouseholds} 户返村或按本人意愿继续就地生活，未形成新增可确认永久流离。`,
      );
    }
  }
}

function ResetUnitsForNextTurn(state) {
  for (const unit of state.units) {
    const definition = unitById.get(unit.type);
    unit.moves = unit.recoveryRequired ? 0 : definition.moves;
    unit.maximumMoves = definition.moves;
    unit.acted = Boolean(unit.recoveryRequired);
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
  const policyLock = EnsurePolicyLock(state);
  const lockedPolicyText = JSON.stringify(policyLock.policyIds);
  return state.orders.every((order) => actionById.has(order.actionId)
    && Array.isArray(order.policySnapshot)
    && JSON.stringify(order.policySnapshot) === lockedPolicyText);
}

export function ResolveTurn(state) {
  const next = CloneState(state);
  next.lastError = null;
  LockPoliciesForCurrentTurn(next);
  if (!ValidateStateForResolution(next)) {
    next.lastError = next.gameOver ? "战役已经结束" : "当前状态不能结算";
    return next;
  }
  next.phase = "resolution";
  const resolvedTurn = next.turn;
  const event = GetHistoricalTurn(resolvedTurn);
  LockEnemyOperationalPlan(next, resolvedTurn);

  for (const order of next.orders) {
    ApplyPlayerOrder(next, order);
  }
  next.orders = [];
  next.reserved = { grain: 0, arms: 0, medicine: 0, intel: 0, cadres: 0 };

  ResolveConstruction(next);
  ResolveVillageEconomy(next);
  ResolveUpkeep(next);
  const repairedRailId = ResolveEnemyTurn(next);
  ArchiveEnemyOperationalPlan(next);
  RecoverBrokenUnits(next);
  ResolveRailContributionAndDecay(next, repairedRailId);
  ApplyUnityPolicyFloor(next);
  next.meters.network = CalculateNetwork(next);
  const finalTurn = resolvedTurn >= turnLimit;
  if (finalTurn) {
    ResolveProtectiveShelterDestinations(next, { finalize: true });
  }
  next.history.push({
    turn: resolvedTurn,
    date: event.date,
    title: event.title,
    resources: DeepClone(next.resources),
    meters: DeepClone(next.meters),
    institutions: next.hexes.filter((hex) => hex.institution).length,
    warningsResolved: next.ledger.civilianCosts.filter((entry) => entry.turn === resolvedTurn).length,
  });

  if (finalTurn) {
    next.turn = turnLimit;
    next.phase = "complete";
    next.gameOver = true;
    next.commandPoints = 0;
    next.log.push("1942年12月结算完成：这里只表示渡过最困难时期，抗战仍将继续并走向1945年的最终胜利。");
    UpdateVisibility(next);
    return next;
  }

  LockEnemyOperationalPlan(next, resolvedTurn + 1);
  PrepareWarningsForNextTurn(next);
  next.turn = resolvedTurn + 1;
  next.lastTurnEconomy = DeepClone(next.turnEconomy);
  next.turnEconomy = {
    turn: next.turn,
    workedImprovementByHexId: {},
  };
  next.policyLock = {
    turn: next.turn,
    locked: false,
    policyIds: [...next.policies],
  };
  ApplyOpeningConditions(next, next.turn);
  ResetUnitsForNextTurn(next);
  RefreshCommandMaximum(next);
  next.commandPoints = next.commandMax;
  next.phase = "planning";
  ResolveProtectiveShelterDestinations(next);
  UpdateVisibility(next);
  return next;
}

function BuildEnemyPlanBriefing(state) {
  const plan = state.enemyPlanning?.currentPlan;
  if (!plan || plan.executionTurn !== state.turn) {
    return {
      planId: null,
      locked: false,
      clarity: 0,
      confidence: "仅有零散传闻",
      reports: ["尚未形成可以交叉印证的敌情判断。"],
      possibleDirections: [],
      likelyMainTargetId: null,
      note: "敌情不足时应保留机动余地，不应把传闻当成确定目标。",
    };
  }
  const clarity = Clamp(plan.reconClarity || 0, 0, 3);
  const primaryTarget = FindHexInternal(state, plan.primaryTargetId);
  const feintTargets = (plan.feintTargetIds || [])
    .map((hexId) => FindHexInternal(state, hexId))
    .filter(Boolean);
  const possibleDirections = [plan.signals.mainSector, plan.signals.feintSector].filter(Boolean);
  const reports = [
    `有运输与人员调动指向${plan.signals.mainSector}，但规模尚不能判明。`,
    `另一组巡逻在${plan.signals.feintSector}反常活动，可能是佯动，也可能是先遣搜索。`,
    plan.signals.railwayActivity,
    plan.signals.pacificationActivity,
  ];
  if (clarity >= 1) {
    const possibleNames = [primaryTarget, ...feintTargets]
      .filter(Boolean)
      .map((hex) => hex.name);
    reports.push(`侦察把重点缩小到${possibleNames.join("、")}一带，真假方向仍需判断。`);
  }
  if (clarity >= 2 && primaryTarget) {
    reports.push(`多路来源认为${primaryTarget.name}方向更可能承受主攻，但敌军仍保留佯动兵力。`);
  }
  if (clarity >= 3) {
    reports.push(`敌军护路投入约为 ${plan.intentBudgets.routeProtection}，并保留 ${plan.reserveBudget} 级机动预备。`);
  }
  return {
    planId: plan.id,
    fingerprint: plan.fingerprint,
    locked: true,
    clarity,
    confidence: clarity >= 3 ? "多源交叉印证" : clarity >= 2 ? "较可信" : clarity >= 1 ? "局部查明" : "仅有模糊征候",
    reports,
    possibleDirections,
    likelyMainTargetId: clarity >= 2 ? plan.primaryTargetId : null,
    routeConcern: clarity >= 1 ? [...plan.routeProtectionIds] : [],
    note: "敌军计划在玩家下令前已经锁定；侦察只提高征候清晰度，不会重掷行动方向。",
  };
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
        hex.evacuated ? "保护性临时安置已就绪" : "尚未安排保护性安置",
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
    currentTreeTips.push(`民生路线：${state.doctrines.civilian.experience}/${GetDoctrineExperienceCost(nextCivilian)} → ${nextCivilian.label}`);
  }
  if (nextMilitary) {
    currentTreeTips.push(`军事路线：${state.doctrines.military.experience}/${GetDoctrineExperienceCost(nextMilitary)} → ${nextMilitary.label}`);
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
    enemySignals: BuildEnemyPlanBriefing(state),
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

export function GetDoctrineExperienceCost(definition) {
  if (!definition || definition.tier <= 0) {
    return 0;
  }
  const prerequisiteCost = definition.prerequisite
    ? (doctrineById.get(definition.prerequisite)?.cost || 0)
    : 0;
  return Math.max(1, definition.cost - prerequisiteCost);
}

export function UnlockDoctrine(state, doctrineId) {
  const next = CloneState(state);
  next.lastError = null;
  if (next.gameOver || next.phase !== "planning") {
    next.lastError = "当前阶段不能调整路线";
    return next;
  }
  if (next.orders.length > 0) {
    next.lastError = "已有命令后不能解锁路线，以免改写已排订单效果";
    return next;
  }
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
  if (treeState.lastUnlockTurn === next.turn) {
    next.lastError = "同一路线每回合只能推进一层，需经实践后再继续";
    return next;
  }
  const experienceCost = GetDoctrineExperienceCost(definition);
  if (treeState.experience < experienceCost) {
    next.lastError = `${definition.tree === "civilian" ? "民生" : "军事"}路线经验不足`;
    return next;
  }
  treeState.experience -= experienceCost;
  treeState.spentExperience = (treeState.spentExperience || 0) + experienceCost;
  treeState.lastUnlockTurn = next.turn;
  treeState.unlocked.push(doctrineId);
  RefreshCommandMaximum(next);
  next.commandPoints = Math.min(next.commandMax, next.commandPoints + (doctrineId === "DemocraticBaseGovernance" ? 1 : 0));
  next.log.push(`解锁路线：${definition.label}。`);
  return next;
}

export function SetPolicies(state, policyIds) {
  const next = CloneState(state);
  next.lastError = null;
  if (next.gameOver || next.phase !== "planning") {
    next.lastError = "当前阶段不能调整政策";
    return next;
  }
  if (!Array.isArray(policyIds) || policyIds.length > 2 || new Set(policyIds).size !== policyIds.length) {
    next.lastError = "政策必须是不重复的至多两个政策";
    return next;
  }
  const policyLock = EnsurePolicyLock(next);
  if (next.orders.length > 0 || policyLock.locked) {
    next.lastError = "本回合政策已经锁定；排单后不得更换政策";
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
  next.policyLock = {
    turn: next.turn,
    locked: true,
    policyIds: [...policyIds],
  };
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
  const originalHouseholdTotal = villages.reduce(
    (total, village) => total + (village.originalHouseholds || 0),
    0,
  );
  const survivingVillages = villages.filter((village) => village.livelihood > 0);
  const currentHouseholdTotal = villages.reduce((total, village) => total + village.households, 0);
  const averageHardship = Math.round(
    villages.reduce((total, village) => total + village.hardship, 0) / Math.max(1, villages.length),
  );
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
    civilianLedgerWithinLimit: state.ledger.villageAbandonments.length === 0
      && state.ledger.affectedHouseholds <= Math.ceil(originalHouseholdTotal * 0.28)
      && state.ledger.displacedHouseholds <= Math.ceil(originalHouseholdTotal * 0.48),
    householdsMaintained: currentHouseholdTotal >= Math.ceil(originalHouseholdTotal * 0.52),
    hardshipContained: averageHardship <= 60
      && villages.every((village) => village.households <= 0 || village.hardship < 90),
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
      households: currentHouseholdTotal,
      averageHardship,
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

function MigrateLoadedState(candidate) {
  if (candidate?.saveVersion !== 1) return candidate;
  const migrated = CloneState(candidate);
  const ledger = migrated.ledger;
  const costs = Array.isArray(ledger?.civilianCosts) ? ledger.civilianCosts : [];
  let restoredHouseholds = 0;

  for (const village of Array.isArray(migrated.hexes) ? migrated.hexes.filter(IsVillage) : []) {
    const legacyShelterEntries = costs.filter((entry) =>
      entry?.type === "Displacement"
      && entry.villageId === village.id
      && /转入山地隐蔽安置/.test(String(entry.text ?? ""))
    );
    const legacyShelteredHouseholds = legacyShelterEntries.reduce(
      (total, entry) => total + Math.max(0, Number(entry.households) || 0),
      0,
    );
    village.shelteredHouseholds = 0;
    if (legacyShelteredHouseholds <= 0) continue;

    const villageAbandoned = village.livelihood <= 0
      || ledger.villageAbandonments.includes(village.id);
    if (villageAbandoned) {
      village.evacuated = false;
      village.evacuationProtection = 0;
      for (const entry of legacyShelterEntries) {
        entry.text = `${village.name}生计在侵略军扫荡破坏中崩溃，临时安置的 ${entry.households} 户无法返村，转为已确认流离。责任属于实施侵略与破坏者，不归因于住户或保护性疏散。`;
      }
      continue;
    }

    const originalHouseholds = Math.max(0, Number(village.originalHouseholds) || 0);
    const currentHouseholds = Math.max(0, Number(village.households) || 0);
    const restoredVillageHouseholds = originalHouseholds > 0
      ? Math.min(originalHouseholds, currentHouseholds + legacyShelteredHouseholds)
      : currentHouseholds + legacyShelteredHouseholds;
    const restoredCount = Math.max(0, restoredVillageHouseholds - currentHouseholds);
    village.households = restoredVillageHouseholds;
    restoredHouseholds += restoredCount;
    for (const entry of legacyShelterEntries) {
      entry.type = "ProtectiveShelter";
      entry.temporary = true;
      entry.text = `${village.name}有 ${entry.households} 户临时转入山地隐蔽安置。这是保护性措施及生活负担，不等同于永久流离；威胁解除后须核验返村或自愿继续安置的去向。`;
    }
    if (village.evacuated && village.evacuationProtection > 0) {
      village.shelteredHouseholds = legacyShelteredHouseholds;
    } else {
      village.evacuated = false;
      village.evacuationProtection = 0;
    }
  }

  if (ledger && Number.isFinite(Number(ledger.displacedHouseholds))) {
    ledger.displacedHouseholds = Math.max(
      0,
      Number(ledger.displacedHouseholds) - restoredHouseholds,
    );
  }
  migrated.saveVersion = saveVersion;
  if (Array.isArray(migrated.log)) {
    migrated.log.push("存档已迁移：保护性临时安置不再自动计作永久流离，并重新核验住户去向。");
  }
  return migrated;
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
  const validEnemyPlanning = Boolean(
    !candidate?.enemyPlanning
    || (
      Array.isArray(candidate.enemyPlanning.planHistory)
      && candidate.enemyPlanning.routeMemory
      && Array.isArray(candidate.enemyPlanning.routeMemory.executedSabotage)
      && Array.isArray(candidate.enemyPlanning.routeMemory.routeUseTraces)
      && (!candidate.enemyPlanning.currentPlan
        || (
          candidate.enemyPlanning.currentPlan.locked === true
          && Number.isInteger(candidate.enemyPlanning.currentPlan.executionTurn)
          && typeof candidate.enemyPlanning.currentPlan.fingerprint === "string"
        ))
    ),
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
    && validEnemyPlanning
    && Array.isArray(candidate.history)
    && Array.isArray(candidate.log),
  );
}

export function DeserializeState(text) {
  try {
    const candidate = MigrateLoadedState(JSON.parse(text));
    if (!IsValidLoadedState(candidate)) {
      throw new Error("存档结构或版本无效");
    }
    const loaded = CloneState(candidate);
    loaded.lastError = null;
    EnsureProductionLedger(loaded);
    EnsureIntelligenceLedger(loaded);
    EnsureTurnEconomy(loaded);
    const loadedPolicyLock = EnsurePolicyLock(loaded);
    if (loaded.orders.length > 0) {
      loadedPolicyLock.locked = true;
      loadedPolicyLock.policyIds = [...loaded.policies];
      for (const order of loaded.orders) {
        if (!Array.isArray(order.policySnapshot)) {
          order.policySnapshot = [...loadedPolicyLock.policyIds];
        }
        if (order.actionId === "improveTile" && !order.improvementId) {
          const targetHex = FindHexInternal(loaded, order.targetHexId || order.hexId);
          order.improvementId = GetImprovementForTerrain(targetHex?.terrain)?.id || null;
        }
      }
    }
    for (const unit of loaded.units) {
      unit.recoveryRequired = Boolean(unit.recoveryRequired);
      unit.brokenTurnsRemaining = Number.isFinite(Number(unit.brokenTurnsRemaining))
        ? Math.max(0, Number(unit.brokenTurnsRemaining))
        : 0;
      unit.brokenSinceTurn = Number.isInteger(unit.brokenSinceTurn) ? unit.brokenSinceTurn : null;
      unit.outOfSupplyTurns = Number.isFinite(Number(unit.outOfSupplyTurns))
        ? Math.max(0, Number(unit.outOfSupplyTurns))
        : 0;
    }
    loaded.doctrines.civilian.spentExperience = Number(loaded.doctrines.civilian.spentExperience || 0);
    loaded.doctrines.military.spentExperience = Number(loaded.doctrines.military.spentExperience || 0);
    loaded.doctrines.civilian.lastUnlockTurn = Number.isInteger(loaded.doctrines.civilian.lastUnlockTurn)
      ? loaded.doctrines.civilian.lastUnlockTurn
      : null;
    loaded.doctrines.military.lastUnlockTurn = Number.isInteger(loaded.doctrines.military.lastUnlockTurn)
      ? loaded.doctrines.military.lastUnlockTurn
      : null;
    loaded.emergencySupplyCooldownUntil = Number.isInteger(loaded.emergencySupplyCooldownUntil)
      ? Math.max(0, loaded.emergencySupplyCooldownUntil)
      : 0;
    if (loaded.gameOver || loaded.phase === "complete") {
      loaded.commandPoints = 0;
      loaded.reserved = { grain: 0, arms: 0, medicine: 0, intel: 0, cadres: 0 };
    } else {
      UpdateReservedField(loaded);
    }
    EnsureEnemyPlanningState(loaded);
    if (!loaded.gameOver && loaded.phase !== "complete") {
      LockEnemyOperationalPlan(loaded, loaded.turn);
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
