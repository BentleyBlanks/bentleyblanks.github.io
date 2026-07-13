const currentRulesVersion = 1;
const maximumTurns = 28;
const maximumPolicies = 2;
const actionPointsPerTurn = 2;

export const turnCalendar = Object.freeze(Array.from({ length: maximumTurns }, (_, turnIndex) => {
  const absoluteQuarter = turnIndex + 3;
  const year = 1938 + Math.floor(absoluteQuarter / 4);
  const quarter = (absoluteQuarter % 4) + 1;
  return Object.freeze({
    turn: turnIndex + 1,
    year,
    quarter,
    label: `${year}年 第${quarter}季度`,
  });
}));

export const mapNodes = Object.freeze([
  { id: "Beiyue", name: "北岳", theater: "晋察冀", terrain: "Mountain", x: 245, y: 143, startNetworkLevel: 2, startTrust: 58, startExposure: 16, summary: "晋察冀边区西部、北部山地的示意节点。" },
  { id: "Jizhong", name: "冀中", theater: "晋察冀", terrain: "Plain", x: 505, y: 182, startNetworkLevel: 1, startTrust: 48, startExposure: 12, summary: "冀中平原敌后工作的示意节点。" },
  { id: "Pingxi", name: "平西", theater: "晋察冀", terrain: "Mountain", x: 352, y: 106, startNetworkLevel: 1, startTrust: 50, startExposure: 10, summary: "北平以西山地交通的示意节点。" },
  { id: "Jidong", name: "冀东", theater: "晋察冀", terrain: "Hills", x: 675, y: 105, startNetworkLevel: 0, startTrust: 38, startExposure: 4, summary: "冀东敌后活动区域的示意节点。" },
  { id: "Taihang", name: "太行", theater: "晋冀鲁豫", terrain: "Mountain", x: 267, y: 285, startNetworkLevel: 2, startTrust: 56, startExposure: 15, summary: "太行山抗日根据地的示意节点。" },
  { id: "Taiyue", name: "太岳", theater: "晋冀鲁豫", terrain: "Mountain", x: 175, y: 405, startNetworkLevel: 0, startTrust: 42, startExposure: 5, summary: "太岳山区敌后工作的示意节点。" },
  { id: "SouthernHebei", name: "冀南", theater: "晋冀鲁豫", terrain: "Plain", x: 438, y: 310, startNetworkLevel: 1, startTrust: 45, startExposure: 10, summary: "冀南平原敌后工作的示意节点。" },
  { id: "Jiluyu", name: "冀鲁豫", theater: "晋冀鲁豫", terrain: "Plain", x: 480, y: 430, startNetworkLevel: 0, startTrust: 39, startExposure: 4, summary: "冀、鲁、豫交界敌后区域的示意节点。" },
  { id: "Qinghe", name: "清河", theater: "山东", terrain: "Plain", x: 618, y: 392, startNetworkLevel: 0, startTrust: 36, startExposure: 3, summary: "山东清河地区敌后工作的示意节点。" },
  { id: "CentralShandong", name: "鲁中", theater: "山东", terrain: "Hills", x: 665, y: 302, startNetworkLevel: 0, startTrust: 38, startExposure: 3, summary: "鲁中山区抗日根据地的示意节点。" },
  { id: "Jiaodong", name: "胶东", theater: "山东", terrain: "Hills", x: 842, y: 255, startNetworkLevel: 0, startTrust: 37, startExposure: 2, summary: "胶东抗日根据地的示意节点。" },
  { id: "Binhai", name: "滨海", theater: "山东", terrain: "Coast", x: 785, y: 400, startNetworkLevel: 0, startTrust: 35, startExposure: 2, summary: "山东滨海地区敌后工作的示意节点。" },
  { id: "Huaibei", name: "淮北", theater: "华中", terrain: "Plain", x: 570, y: 560, startNetworkLevel: 0, startTrust: 37, startExposure: 3, summary: "华中淮北敌后区域的示意节点。" },
  { id: "Subei", name: "苏北", theater: "华中", terrain: "Water", x: 720, y: 520, startNetworkLevel: 0, startTrust: 38, startExposure: 3, summary: "苏北水网与平原敌后工作的示意节点。" },
  { id: "Huainan", name: "淮南", theater: "华中", terrain: "Water", x: 544, y: 655, startNetworkLevel: 0, startTrust: 36, startExposure: 2, summary: "淮南敌后区域的示意节点。" },
  { id: "Eyuwan", name: "鄂豫皖", theater: "华中", terrain: "Hills", x: 354, y: 567, startNetworkLevel: 0, startTrust: 35, startExposure: 2, summary: "鄂、豫、皖交界敌后区域的示意节点。" },
]);

const ruralConnections = [
  ["PathBeiyuePingxi", "Beiyue", "Pingxi"],
  ["PathBeiyueJizhong", "Beiyue", "Jizhong"],
  ["PathBeiyueTaihang", "Beiyue", "Taihang"],
  ["PathPingxiJizhong", "Pingxi", "Jizhong"],
  ["PathPingxiJidong", "Pingxi", "Jidong"],
  ["PathJizhongJidong", "Jizhong", "Jidong"],
  ["PathJizhongSouthernHebei", "Jizhong", "SouthernHebei"],
  ["PathTaihangTaiyue", "Taihang", "Taiyue"],
  ["PathTaihangSouthernHebei", "Taihang", "SouthernHebei"],
  ["PathTaiyueJiluyu", "Taiyue", "Jiluyu"],
  ["PathSouthernHebeiJiluyu", "SouthernHebei", "Jiluyu"],
  ["PathJiluyuQinghe", "Jiluyu", "Qinghe"],
  ["PathJiluyuCentralShandong", "Jiluyu", "CentralShandong"],
  ["PathJiluyuHuaibei", "Jiluyu", "Huaibei"],
  ["PathQingheCentralShandong", "Qinghe", "CentralShandong"],
  ["PathCentralShandongJiaodong", "CentralShandong", "Jiaodong"],
  ["PathCentralShandongBinhai", "CentralShandong", "Binhai"],
  ["PathJiaodongBinhai", "Jiaodong", "Binhai"],
  ["PathBinhaiSubei", "Binhai", "Subei"],
  ["PathHuaibeiSubei", "Huaibei", "Subei"],
  ["PathHuaibeiHuainan", "Huaibei", "Huainan"],
  ["PathHuaibeiEyuwan", "Huaibei", "Eyuwan"],
  ["PathSubeiHuainan", "Subei", "Huainan"],
  ["PathHuainanEyuwan", "Huainan", "Eyuwan"],
];

const railConnections = [
  ["RouteZhengtai", "正太铁路", "Taihang", "Jizhong"],
  ["RoutePinghan", "平汉铁路", "Jizhong", "SouthernHebei"],
  ["RouteJinpu", "津浦铁路", "Qinghe", "Huaibei"],
  ["RouteTongpu", "同蒲铁路", "Beiyue", "Taiyue"],
  ["RouteJiaoji", "胶济铁路", "CentralShandong", "Jiaodong"],
];

export const mapConnections = Object.freeze([
  ...ruralConnections.map(([id, from, to]) => Object.freeze({ id, type: "RuralPath", from, to, name: "敌后交通线" })),
  ...railConnections.map(([id, name, from, to]) => Object.freeze({ id, type: "EnemyRoute", from, to, name })),
]);

export const policies = Object.freeze([
  {
    id: "RentAndInterestReduction",
    name: "减租减息",
    summary: "改善群众生活与根据地社会关系，使信任增长更稳定。",
    modifiers: { trustGain: 2 },
  },
  {
    id: "StreamlinedAdministration",
    name: "精兵简政",
    summary: "降低组织维持负担，但更强调有限骨干的合理调度。",
    modifiers: { upkeepReduction: 1, fatigueRecovery: 2 },
  },
  {
    id: "ProductionSelfReliance",
    name: "生产自救",
    summary: "生产与救护命令在下一季度带来更多粮秣。",
    modifiers: { productionSupply: 1 },
  },
  {
    id: "UnitedFrontLiaison",
    name: "统一战线联络",
    summary: "改善跨区联络，增加季度情报并提高新区域联络成功率。",
    modifiers: { intelligenceIncome: 1, contactChance: 8 },
  },
  {
    id: "CivilianProtection",
    name: "群众防护",
    summary: "强化转移、隐蔽所和反扫荡准备对群众的保护。",
    modifiers: { sweepDefense: 2, safetyRecovery: 1 },
  },
  {
    id: "RailwayDisruptionPreparation",
    name: "交通破袭准备",
    summary: "提高交通破袭把握，但集中准备会增加行动暴露。",
    modifiers: { sabotageChance: 10, sabotageExposure: 4 },
  },
]);

export const actions = Object.freeze([
  { id: "OpenContact", name: "开辟联络", summary: "从相邻工作网络进入尚未建立联系的区域。", baseChance: 68, actionPointCost: 1, costs: { supplies: 1, intelligence: 0 } },
  { id: "RootDevelopment", name: "扎根建设", summary: "依靠群众工作巩固当前区域的组织网络。", baseChance: 76, actionPointCost: 1, costs: { supplies: 2, intelligence: 0 } },
  { id: "ScoutRoute", name: "侦察交通", summary: "侦察运输与守备变化，获取情报并揭示敌方计划。", baseChance: 86, actionPointCost: 1, costs: { supplies: 0, intelligence: 0 } },
  { id: "SabotageRoute", name: "交通破袭", summary: "暂时阻断邻近敌军干线，形成牵制而非永久占领。", baseChance: 58, actionPointCost: 1, costs: { supplies: 1, intelligence: 1 } },
  { id: "ConcealTransfer", name: "隐蔽转移", summary: "降低暴露并为本季度反扫荡准备群众转移。", baseChance: 100, actionPointCost: 1, costs: { supplies: 0, intelligence: 0 } },
  { id: "ProductionRelief", name: "生产与救护", summary: "组织生产、救护和互助，下季度获得粮秣。", baseChance: 100, actionPointCost: 1, costs: { supplies: 0, intelligence: 0 } },
]);

export const historicalAnchors = Object.freeze([
  {
    id: "StrategicStalemate",
    turn: 1,
    date: "1938年第四季度",
    title: "抗战进入战略相持阶段",
    text: "武汉、广州相继失守后，战争进入战略相持阶段。敌后抗日根据地和交通网络在长期战争中继续发展。",
    sourceLabel: "史实锚点：抗日战争战略阶段相关通史",
    fixedOutcome: true,
  },
  {
    id: "CageBlockade",
    turn: 4,
    date: "1939年第三季度",
    title: "华北封锁体系加紧",
    text: "侵华日军逐步强化以铁路、公路、据点和碉堡为骨架的封锁体系，通常被概括为“囚笼政策”。",
    sourceLabel: "史实锚点：华北敌后战场相关通史",
    fixedOutcome: true,
  },
  {
    id: "HundredRegimentsOffensive",
    turn: 8,
    date: "1940年第三季度",
    title: "百团大战展开",
    text: "八路军在华北发动大规模交通破袭与据点攻袭。战役扩展了敌后牵制，也使部分根据地随后承受更大压力。",
    sourceLabel: "史实锚点：百团大战战史",
    fixedOutcome: true,
  },
  {
    id: "SouthernAnhuiIncident",
    turn: 10,
    date: "1941年第一季度",
    title: "皖南事变与统一战线危机",
    text: "皖南事变使国共关系和抗日民族统一战线遭受严重冲击。敌后联络工作面临更复杂的政治与军事环境。",
    sourceLabel: "史实锚点：皖南事变相关通史",
    fixedOutcome: true,
  },
  {
    id: "IntensifiedPacification",
    turn: 12,
    date: "1941年第三季度",
    title: "“治安强化”与反复扫荡",
    text: "侵华日军在华北连续推行所谓“治安强化”，封锁、蚕食和扫荡使敌后军民处境进一步恶化。",
    sourceLabel: "史实锚点：华北日军“治安战”相关研究",
    fixedOutcome: true,
  },
  {
    id: "MayFirstSweep",
    turn: 15,
    date: "1942年第二季度",
    title: "冀中“五一大扫荡”",
    text: "1942年5月，侵华日军对冀中抗日根据地发动大规模扫荡。根据地军民在严重损失中坚持转移、隐蔽和反击。",
    sourceLabel: "史实锚点：冀中“五一大扫荡”相关战史",
    fixedOutcome: true,
  },
  {
    id: "RecoveryFromHardship",
    turn: 18,
    date: "1943年第一季度",
    title: "在困难中恢复",
    text: "经过严重困难时期，生产自救、精兵简政和群众工作帮助许多敌后根据地逐步恢复。",
    sourceLabel: "史实锚点：抗日根据地建设相关通史",
    fixedOutcome: true,
  },
  {
    id: "OperationIchiGo",
    turn: 23,
    date: "1944年第二季度",
    title: "一号作战与敌后局部反攻",
    text: "侵华日军发动一号作战，主要冲击正面战场；与此同时，多处敌后根据地逐步恢复并展开局部反攻。",
    sourceLabel: "史实锚点：1944年中国战场相关通史",
    fixedOutcome: true,
  },
  {
    id: "JapaneseSurrender",
    turn: 28,
    date: "1945年第三季度",
    title: "日本宣布投降",
    text: "1945年8月15日，日本宣布接受投降；9月2日签署投降书。胜利属于中国长期全民族抗战，也是世界反法西斯战争胜利的一部分。",
    sourceLabel: "史实锚点：日本投降与抗战胜利相关通史",
    fixedOutcome: true,
  },
]);

export const enemyBehaviors = Object.freeze([
  { id: "Blockade", name: "封锁", summary: "增加区域压力并强化邻近交通线。" },
  { id: "Sweep", name: "扫荡", summary: "打击高暴露区域；隐蔽、地形和群众防护可减轻损失。" },
  { id: "Pacification", name: "清乡与蚕食", summary: "削弱群众信任，并可能使薄弱联络点失联。" },
  { id: "RepairRoute", name: "修复交通", summary: "修复被破袭的铁路并加强守备。" },
]);

const enemyIntensityByTurn = Object.freeze([1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4, 4, 4, 4, 5, 4, 4, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 1]);
const terrainDefense = Object.freeze({ Mountain: 2, Hills: 1, Plain: 0, Water: 1, Coast: 0 });

function Clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function DeepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function NormalizeSeed(seed) {
  if (Number.isFinite(seed)) {
    const numericSeed = Math.trunc(seed) >>> 0;
    return numericSeed === 0 ? 0x6d2b79f5 : numericSeed;
  }

  const seedText = String(seed ?? "193810");
  let hash = 2166136261;
  for (let characterIndex = 0; characterIndex < seedText.length; characterIndex += 1) {
    hash ^= seedText.charCodeAt(characterIndex);
    hash = Math.imul(hash, 16777619);
  }
  const normalizedHash = hash >>> 0;
  return normalizedHash === 0 ? 0x6d2b79f5 : normalizedHash;
}

function NextRandom(state) {
  state.randomState = (Math.imul(state.randomState, 1664525) + 1013904223) >>> 0;
  return state.randomState / 4294967296;
}

function GetNodeDefinition(nodeId) {
  return mapNodes.find((node) => node.id === nodeId) ?? null;
}

function GetConnectionDefinition(connectionId) {
  return mapConnections.find((connection) => connection.id === connectionId) ?? null;
}

function GetPolicyDefinition(policyId) {
  return policies.find((policy) => policy.id === policyId) ?? null;
}

function GetActionDefinition(actionId) {
  return actions.find((action) => action.id === actionId) ?? null;
}

function GetEnemyBehaviorDefinition(behaviorId) {
  return enemyBehaviors.find((behavior) => behavior.id === behaviorId) ?? null;
}

function DecorateEnemyPlan(plan) {
  if (!plan) {
    return null;
  }
  const behavior = GetEnemyBehaviorDefinition(plan.behaviorId);
  const nodeDefinition = GetNodeDefinition(plan.nodeId);
  plan.intensity = plan.strength;
  if (plan.revealed && behavior && nodeDefinition) {
    plan.name = behavior.name;
    plan.title = behavior.name;
    plan.targetNodeId = plan.nodeId;
    plan.description = `交通员报告：敌方${behavior.name}可能指向${nodeDefinition.name}。可根据暴露、地形和防护准备安排应对。`;
  } else {
    plan.name = "敌军动向不明";
    plan.title = "敌军动向不明";
    plan.targetNodeId = null;
    plan.description = "情报有限：敌军正在调动，但目标尚不明确。侦察交通可提高下一步研判精度。";
  }
  return plan;
}

function HasPolicy(state, policyId) {
  return state.selectedPolicies.includes(policyId);
}

function GetPolicyModifier(state, modifierName) {
  return state.selectedPolicies.reduce((modifierTotal, policyId) => {
    const policy = GetPolicyDefinition(policyId);
    return modifierTotal + Number(policy?.modifiers?.[modifierName] ?? 0);
  }, 0);
}

function GetRuralNeighbors(nodeId) {
  return mapConnections
    .filter((connection) => connection.type === "RuralPath" && (connection.from === nodeId || connection.to === nodeId))
    .map((connection) => connection.from === nodeId ? connection.to : connection.from);
}

function GetAdjacentEnemyRoutes(nodeId) {
  return mapConnections.filter((connection) => connection.type === "EnemyRoute" && (connection.from === nodeId || connection.to === nodeId));
}

function FindSabotageRoute(state, nodeId) {
  const adjacentRoutes = GetAdjacentEnemyRoutes(nodeId);
  if (adjacentRoutes.length === 0) {
    return null;
  }
  return adjacentRoutes
    .slice()
    .sort((leftRoute, rightRoute) => {
      const disruptionDifference = state.routes[leftRoute.id].disruptedTurns - state.routes[rightRoute.id].disruptedTurns;
      if (disruptionDifference !== 0) {
        return disruptionDifference;
      }
      const fortificationDifference = state.routes[rightRoute.id].fortification - state.routes[leftRoute.id].fortification;
      return fortificationDifference !== 0 ? fortificationDifference : leftRoute.id.localeCompare(rightRoute.id);
    })[0];
}

function GetTrustChanceModifier(trust) {
  if (trust >= 65) {
    return 10;
  }
  if (trust < 35) {
    return -10;
  }
  return 0;
}

function GetTerrainChanceModifier(actionId, terrain) {
  if (actionId === "SabotageRoute" && (terrain === "Mountain" || terrain === "Hills")) {
    return 5;
  }
  if (actionId === "OpenContact" && terrain === "Mountain") {
    return 4;
  }
  if (actionId === "ScoutRoute" && terrain === "Plain") {
    return 4;
  }
  return 0;
}

function GetActiveNodeIds(state) {
  return mapNodes.filter((node) => state.nodes[node.id].networkLevel > 0).map((node) => node.id);
}

function GetLargestConnectedNetwork(state) {
  const activeNodeIds = new Set(GetActiveNodeIds(state));
  let largestSize = 0;
  const visitedNodeIds = new Set();

  for (const startingNodeId of activeNodeIds) {
    if (visitedNodeIds.has(startingNodeId)) {
      continue;
    }
    let componentSize = 0;
    const pendingNodeIds = [startingNodeId];
    visitedNodeIds.add(startingNodeId);
    while (pendingNodeIds.length > 0) {
      const currentNodeId = pendingNodeIds.pop();
      componentSize += 1;
      for (const neighborNodeId of GetRuralNeighbors(currentNodeId)) {
        if (activeNodeIds.has(neighborNodeId) && !visitedNodeIds.has(neighborNodeId)) {
          visitedNodeIds.add(neighborNodeId);
          pendingNodeIds.push(neighborNodeId);
        }
      }
    }
    largestSize = Math.max(largestSize, componentSize);
  }
  return largestSize;
}

function GetPublicRisk(chance) {
  if (chance >= 75) {
    return "Low";
  }
  if (chance >= 50) {
    return "Medium";
  }
  return "High";
}

function CreateIllegalPreview(actionId, nodeId, teamId, reason) {
  return {
    legal: false,
    reason,
    actionId,
    nodeId,
    teamId,
    chance: 0,
    risk: "Unavailable",
    actionPointCost: 0,
    costs: { supplies: 0, intelligence: 0 },
    effects: [],
  };
}

function CalculateActionChance(state, action, nodeId, teamId) {
  if (action.baseChance >= 100) {
    return 100;
  }
  const team = state.teams[teamId];
  const targetNode = state.nodes[nodeId];
  const nodeDefinition = GetNodeDefinition(nodeId);
  let trust = targetNode.trust;
  if (action.id === "OpenContact" && targetNode.networkLevel === 0) {
    trust = state.nodes[team.nodeId].trust;
  }
  let chance = action.baseChance;
  chance += 8 * (team.level - 1);
  chance += GetTrustChanceModifier(trust);
  chance += GetTerrainChanceModifier(action.id, nodeDefinition.terrain);
  chance -= 8 * targetNode.pressure;
  chance -= Math.floor(team.fatigue / 5);
  if (action.id === "OpenContact") {
    chance += GetPolicyModifier(state, "contactChance");
  }
  if (action.id === "SabotageRoute") {
    const route = FindSabotageRoute(state, nodeId);
    chance += GetPolicyModifier(state, "sabotageChance");
    chance -= 5 * Number(state.routes[route?.id]?.fortification ?? 0);
    chance += 10;
  }
  return Clamp(Math.round(chance), 10, 90);
}

function GetActionEffects(state, actionId, nodeId) {
  if (actionId === "OpenContact") {
    return ["成功后建立1级联络点", "骨干队转移到目标区域", "小幅增加暴露"];
  }
  if (actionId === "RootDevelopment") {
    return ["成功后网络等级提高1级", `群众信任约增加${8 + GetPolicyModifier(state, "trustGain")}`, "暴露增加"];
  }
  if (actionId === "ScoutRoute") {
    return ["成功后情报增加2", "揭示本季度敌方计划"];
  }
  if (actionId === "SabotageRoute") {
    const route = FindSabotageRoute(state, nodeId);
    return [`成功后${route?.name ?? "邻近交通线"}受阻2回合`, "敌后贡献增加4", "暴露与疲劳显著增加"];
  }
  if (actionId === "ConcealTransfer") {
    return ["降低当前区域暴露", "准备本季度群众转移", "可沿相邻敌后交通线移动"];
  }
  return ["本区域信任与群众安全小幅提高", "下一季度获得粮秣"];
}

export function GetActionPreview(state, actionId, nodeId, teamId) {
  if (!state || typeof state !== "object") {
    return CreateIllegalPreview(actionId, nodeId, teamId, "游戏状态无效。请重新开始或读取有效存档。");
  }
  if (state.status !== "active") {
    return CreateIllegalPreview(actionId, nodeId, teamId, "本局已经结束。");
  }
  const action = GetActionDefinition(actionId);
  if (!action) {
    return CreateIllegalPreview(actionId, nodeId, teamId, "未知行动。");
  }
  const nodeDefinition = GetNodeDefinition(nodeId);
  if (!nodeDefinition || !state.nodes[nodeId]) {
    return CreateIllegalPreview(actionId, nodeId, teamId, "未知区域。");
  }
  const team = state.teams[teamId];
  if (!team) {
    return CreateIllegalPreview(actionId, nodeId, teamId, "未知骨干队。");
  }
  if (team.acted) {
    return CreateIllegalPreview(actionId, nodeId, teamId, "这支骨干队本季度已经行动。");
  }
  if (state.actionPoints < action.actionPointCost) {
    return CreateIllegalPreview(actionId, nodeId, teamId, "本季度部署令已用完。");
  }
  if (state.resources.supplies < action.costs.supplies || state.resources.intelligence < action.costs.intelligence) {
    return CreateIllegalPreview(actionId, nodeId, teamId, "粮秣或情报不足。");
  }

  const teamNode = state.nodes[team.nodeId];
  const targetNode = state.nodes[nodeId];
  const ruralNeighbors = GetRuralNeighbors(team.nodeId);
  if (actionId === "OpenContact") {
    if (teamNode.networkLevel < 1 || targetNode.networkLevel !== 0 || !ruralNeighbors.includes(nodeId)) {
      return CreateIllegalPreview(actionId, nodeId, teamId, "只能从当前工作网络开辟相邻的失联区域。");
    }
  } else if (actionId === "ConcealTransfer") {
    if (targetNode.networkLevel < 1 || (team.nodeId !== nodeId && !ruralNeighbors.includes(nodeId))) {
      return CreateIllegalPreview(actionId, nodeId, teamId, "只能在当前区域隐蔽，或转移到相邻的已联络区域。");
    }
  } else {
    if (team.nodeId !== nodeId) {
      return CreateIllegalPreview(actionId, nodeId, teamId, "这项行动必须在骨干队当前所在区域执行。");
    }
    if (targetNode.networkLevel < 1) {
      return CreateIllegalPreview(actionId, nodeId, teamId, "这里尚未建立工作网络。");
    }
  }

  if (actionId === "RootDevelopment" && targetNode.networkLevel >= 3) {
    return CreateIllegalPreview(actionId, nodeId, teamId, "本区域网络已经巩固，可转向生产、防护或破袭。");
  }
  if (actionId === "SabotageRoute" && !FindSabotageRoute(state, nodeId)) {
    return CreateIllegalPreview(actionId, nodeId, teamId, "当前区域不邻接可破袭的敌军交通干线。");
  }

  const chance = CalculateActionChance(state, action, nodeId, teamId);
  return {
    legal: true,
    reason: "",
    actionId,
    nodeId,
    teamId,
    chance,
    risk: GetPublicRisk(chance),
    actionPointCost: action.actionPointCost,
    costs: { supplies: action.costs.supplies, intelligence: action.costs.intelligence },
    effects: GetActionEffects(state, actionId, nodeId),
  };
}

function AddHistoryEntry(state, entry) {
  state.historyLog.push({
    turn: state.turn,
    calendar: state.calendar.label,
    ...entry,
  });
  if (state.historyLog.length > 160) {
    state.historyLog = state.historyLog.slice(-160);
  }
}

function ApplySuccessfulAction(state, actionId, nodeId, teamId) {
  const team = state.teams[teamId];
  const targetNode = state.nodes[nodeId];
  const sourceNodeId = team.nodeId;
  const sourceNode = state.nodes[sourceNodeId];
  if (actionId === "OpenContact") {
    targetNode.networkLevel = 1;
    targetNode.trust = Clamp(targetNode.trust + 6 + GetPolicyModifier(state, "trustGain"), 0, 100);
    targetNode.exposure = Clamp(targetNode.exposure + 5, 0, 100);
    team.nodeId = nodeId;
    team.fatigue = Clamp(team.fatigue + 10, 0, 100);
    return `在${GetNodeDefinition(nodeId).name}建立了联络点。`;
  }
  if (actionId === "RootDevelopment") {
    targetNode.networkLevel = Clamp(targetNode.networkLevel + 1, 0, 3);
    targetNode.trust = Clamp(targetNode.trust + 8 + GetPolicyModifier(state, "trustGain"), 0, 100);
    targetNode.exposure = Clamp(targetNode.exposure + 8, 0, 100);
    if (targetNode.networkLevel === 3) {
      targetNode.defense = Clamp(targetNode.defense + 1, 0, 3);
    }
    team.fatigue = Clamp(team.fatigue + 8, 0, 100);
    return `${GetNodeDefinition(nodeId).name}的工作网络得到巩固。`;
  }
  if (actionId === "ScoutRoute") {
    state.resources.intelligence = Clamp(state.resources.intelligence + 2, 0, 20);
    targetNode.exposure = Clamp(targetNode.exposure + 2, 0, 100);
    team.fatigue = Clamp(team.fatigue + 5, 0, 100);
    if (state.enemyPlan) {
      state.enemyPlan.revealed = true;
      DecorateEnemyPlan(state.enemyPlan);
    }
    return `侦明了${GetNodeDefinition(nodeId).name}附近的守备变化。`;
  }
  if (actionId === "SabotageRoute") {
    const route = FindSabotageRoute(state, nodeId);
    state.routes[route.id].disruptedTurns = Math.max(state.routes[route.id].disruptedTurns, 2);
    state.resources.contribution = Clamp(state.resources.contribution + 4, 0, 100);
    targetNode.exposure = Clamp(targetNode.exposure + 18 + GetPolicyModifier(state, "sabotageExposure"), 0, 100);
    team.fatigue = Clamp(team.fatigue + 15, 0, 100);
    return `${route.name}暂时受阻，敌后牵制有所增加。`;
  }
  if (actionId === "ConcealTransfer") {
    sourceNode.exposure = Clamp(sourceNode.exposure - 25, 0, 100);
    sourceNode.protection = Math.max(sourceNode.protection, 2);
    if (nodeId !== sourceNodeId) {
      targetNode.exposure = Clamp(targetNode.exposure - 8, 0, 100);
      targetNode.protection = Math.max(targetNode.protection, 1);
      team.nodeId = nodeId;
    }
    team.fatigue = Clamp(team.fatigue + 4, 0, 100);
    return nodeId === sourceNodeId
      ? `在${GetNodeDefinition(nodeId).name}完成隐蔽与群众转移准备。`
      : `骨干队由${GetNodeDefinition(sourceNodeId).name}隐蔽转移到${GetNodeDefinition(nodeId).name}。`;
  }

  const productionSupply = 2 + GetPolicyModifier(state, "productionSupply");
  state.pendingRewards.push({
    id: `Reward${state.turn}_${teamId}_${state.pendingRewards.length + 1}`,
    dueTurn: state.turn + 1,
    supplies: productionSupply,
    intelligence: 0,
    safety: 1 + GetPolicyModifier(state, "safetyRecovery"),
    nodeId,
  });
  targetNode.trust = Clamp(targetNode.trust + 4 + GetPolicyModifier(state, "trustGain"), 0, 100);
  targetNode.exposure = Clamp(targetNode.exposure + 3, 0, 100);
  team.fatigue = Clamp(team.fatigue + 3, 0, 100);
  return `${GetNodeDefinition(nodeId).name}组织生产、救护和互助。`;
}

function ApplyFailedAction(state, actionId, nodeId, teamId) {
  const team = state.teams[teamId];
  const targetNode = state.nodes[nodeId];
  if (actionId === "OpenContact") {
    state.nodes[team.nodeId].exposure = Clamp(state.nodes[team.nodeId].exposure + 4, 0, 100);
    team.fatigue = Clamp(team.fatigue + 8, 0, 100);
    return "联络没有建立，但骨干队安全撤回。";
  }
  if (actionId === "RootDevelopment") {
    targetNode.trust = Clamp(targetNode.trust - 1, 0, 100);
    targetNode.exposure = Clamp(targetNode.exposure + 5, 0, 100);
    team.fatigue = Clamp(team.fatigue + 7, 0, 100);
    return "建设工作暂未推进，需要重新积累信任与物资。";
  }
  if (actionId === "ScoutRoute") {
    targetNode.exposure = Clamp(targetNode.exposure + 4, 0, 100);
    team.fatigue = Clamp(team.fatigue + 6, 0, 100);
    return "侦察未能确认敌情，行动痕迹有所增加。";
  }
  if (actionId === "SabotageRoute") {
    targetNode.exposure = Clamp(targetNode.exposure + 12, 0, 100);
    team.fatigue = Clamp(team.fatigue + 10, 0, 100);
    return "破袭未能阻断交通，队伍及时撤离但暴露上升。";
  }
  return "行动没有形成预期效果。";
}

export function ExecuteAction(state, actionId, nodeId, teamId) {
  const nextState = DeepClone(state);
  const preview = GetActionPreview(state, actionId, nodeId, teamId);
  if (!preview.legal) {
    nextState.lastResolution = {
      type: "Action",
      legal: false,
      success: false,
      actionId,
      nodeId,
      teamId,
      reason: preview.reason,
    };
    return nextState;
  }

  nextState.actionPoints -= preview.actionPointCost;
  nextState.resources.supplies -= preview.costs.supplies;
  nextState.resources.intelligence -= preview.costs.intelligence;
  nextState.teams[teamId].acted = true;
  const roll = Math.floor(NextRandom(nextState) * 100) + 1;
  const success = roll <= preview.chance;
  const summary = success
    ? ApplySuccessfulAction(nextState, actionId, nodeId, teamId)
    : ApplyFailedAction(nextState, actionId, nodeId, teamId);
  nextState.lastResolution = {
    type: "Action",
    legal: true,
    success,
    actionId,
    nodeId,
    teamId,
    chance: preview.chance,
    roll,
    summary,
  };
  AddHistoryEntry(nextState, {
    type: "Action",
    title: GetActionDefinition(actionId).name,
    text: summary,
    success,
    nodeId,
  });
  return nextState;
}

function PickEnemyTarget(state) {
  const activeNodeIds = GetActiveNodeIds(state);
  if (activeNodeIds.length === 0) {
    return mapNodes[0].id;
  }
  let selectedNodeId = activeNodeIds[0];
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (const nodeId of activeNodeIds) {
    const node = state.nodes[nodeId];
    const adjacentRouteCount = GetAdjacentEnemyRoutes(nodeId).length;
    const score = node.exposure / 9 + node.pressure * 2 + adjacentRouteCount + NextRandom(state) * 7;
    if (score > selectedScore) {
      selectedScore = score;
      selectedNodeId = nodeId;
    }
  }
  return selectedNodeId;
}

function PickDisruptedRoute(state) {
  const disruptedRoutes = mapConnections
    .filter((connection) => connection.type === "EnemyRoute" && state.routes[connection.id].disruptedTurns > 0)
    .sort((leftRoute, rightRoute) => {
      const disruptionDifference = state.routes[rightRoute.id].disruptedTurns - state.routes[leftRoute.id].disruptedTurns;
      return disruptionDifference !== 0 ? disruptionDifference : leftRoute.id.localeCompare(rightRoute.id);
    });
  return disruptedRoutes[0] ?? null;
}

function GenerateEnemyPlan(state) {
  const intensity = enemyIntensityByTurn[state.turn - 1] ?? 1;
  const disruptedRoute = PickDisruptedRoute(state);
  const behaviorRoll = NextRandom(state);
  let behaviorId = "Blockade";
  if (disruptedRoute && behaviorRoll < 0.28) {
    behaviorId = "RepairRoute";
  } else if (behaviorRoll < 0.58) {
    behaviorId = "Sweep";
  } else if (behaviorRoll < 0.82) {
    behaviorId = "Pacification";
  }
  const nodeId = behaviorId === "RepairRoute"
    ? (disruptedRoute?.from ?? PickEnemyTarget(state))
    : PickEnemyTarget(state);
  const policyIntelligence = GetPolicyModifier(state, "intelligenceIncome");
  return DecorateEnemyPlan({
    behaviorId,
    nodeId,
    routeId: behaviorId === "RepairRoute" ? disruptedRoute?.id ?? null : null,
    strength: intensity,
    revealed: state.resources.intelligence + policyIntelligence >= 6,
  });
}

function GetForcedHistoricalPlan(state) {
  if (state.turn === 15) {
    const targetNodeId = state.nodes.Jizhong.networkLevel > 0 ? "Jizhong" : PickEnemyTarget(state);
    return DecorateEnemyPlan({ behaviorId: "Sweep", nodeId: targetNodeId, routeId: null, strength: 5, revealed: true, historicalAnchorId: "MayFirstSweep" });
  }
  return null;
}

function GetRouteDisruptionDefense(state, nodeId) {
  return GetAdjacentEnemyRoutes(nodeId).reduce((defense, route) => {
    return defense + (state.routes[route.id].disruptedTurns > 0 ? 1 : 0);
  }, 0);
}

function ResolveSweep(state, plan) {
  const node = state.nodes[plan.nodeId];
  const nodeDefinition = GetNodeDefinition(plan.nodeId);
  const defense = Number(terrainDefense[nodeDefinition.terrain] ?? 0)
    + node.defense
    + node.protection * 2
    + GetRouteDisruptionDefense(state, plan.nodeId)
    + GetPolicyModifier(state, "sweepDefense");
  const exposureBand = Math.floor(node.exposure / 25);
  const attack = plan.strength + node.pressure + exposureBand;
  const damage = Math.max(0, attack - defense - 2);
  const safetyLoss = Math.min(10, Math.ceil(damage * 1.25));
  state.resources.safety = Clamp(state.resources.safety - safetyLoss, 0, 100);
  node.trust = Clamp(node.trust - damage * 3, 0, 100);
  node.exposure = Clamp(node.exposure - 10, 0, 100);
  node.pressure = Clamp(node.pressure + (damage > 0 ? 1 : 0), 0, 4);
  if (damage >= 4 && node.networkLevel > 0) {
    node.networkLevel -= 1;
  }
  for (const team of Object.values(state.teams)) {
    if (team.nodeId === plan.nodeId) {
      team.fatigue = Clamp(team.fatigue + damage * 4, 0, 100);
    }
  }
  return damage === 0
    ? `${nodeDefinition.name}依靠预警、地形和转移准备避开了主要损失。`
    : `${nodeDefinition.name}遭到扫荡，群众安全下降${safetyLoss}，工作网络承受压力。`;
}

function ResolveBlockade(state, plan) {
  const node = state.nodes[plan.nodeId];
  node.pressure = Clamp(node.pressure + 1, 0, 4);
  node.trust = Clamp(node.trust - 1, 0, 100);
  const adjacentRoutes = GetAdjacentEnemyRoutes(plan.nodeId);
  if (adjacentRoutes.length > 0) {
    const route = adjacentRoutes.slice().sort((leftRoute, rightRoute) => leftRoute.id.localeCompare(rightRoute.id))[0];
    state.routes[route.id].fortification = Clamp(state.routes[route.id].fortification + 1, 0, 3);
  }
  return `${GetNodeDefinition(plan.nodeId).name}周边封锁加紧，区域压力上升。`;
}

function ResolvePacification(state, plan) {
  const node = state.nodes[plan.nodeId];
  const trustLoss = 2 + plan.strength;
  node.trust = Clamp(node.trust - trustLoss, 0, 100);
  node.pressure = Clamp(node.pressure + 1, 0, 4);
  if (node.networkLevel === 1 && node.trust < 22 && node.protection === 0) {
    node.networkLevel = 0;
  }
  return `${GetNodeDefinition(plan.nodeId).name}遭遇清乡与蚕食，群众信任下降${trustLoss}。`;
}

function ResolveRouteRepair(state, plan) {
  const route = GetConnectionDefinition(plan.routeId) ?? PickDisruptedRoute(state);
  if (!route) {
    return ResolveBlockade(state, { ...plan, nodeId: plan.nodeId });
  }
  state.routes[route.id].disruptedTurns = Math.max(0, state.routes[route.id].disruptedTurns - 2);
  state.routes[route.id].fortification = Clamp(state.routes[route.id].fortification + 1, 0, 3);
  return `${route.name}得到修复，沿线守备加强。`;
}

function ResolveEnemyPlan(state) {
  const plan = state.enemyPlan;
  if (!plan || !GetEnemyBehaviorDefinition(plan.behaviorId)) {
    return { behaviorId: null, text: "本季度未侦明成规模的敌方行动。" };
  }
  let text = "";
  if (plan.behaviorId === "Sweep") {
    text = ResolveSweep(state, plan);
  } else if (plan.behaviorId === "Pacification") {
    text = ResolvePacification(state, plan);
  } else if (plan.behaviorId === "RepairRoute") {
    text = ResolveRouteRepair(state, plan);
  } else {
    text = ResolveBlockade(state, plan);
  }
  AddHistoryEntry(state, {
    type: "EnemyAction",
    title: GetEnemyBehaviorDefinition(plan.behaviorId).name,
    text,
    nodeId: plan.nodeId,
    routeId: plan.routeId,
  });
  return { ...DeepClone(plan), text };
}

function ResolveQuarterlyEconomy(state) {
  const networkLevelSum = Object.values(state.nodes).reduce((levelTotal, node) => levelTotal + node.networkLevel, 0);
  const baseIncome = 1;
  const networkIncome = Math.floor(networkLevelSum / 5);
  const activeTeamCount = Object.keys(state.teams).length;
  const baseUpkeep = Math.ceil(activeTeamCount / 2);
  const upkeep = Math.max(0, baseUpkeep - GetPolicyModifier(state, "upkeepReduction"));
  const supplyChange = baseIncome + networkIncome - upkeep;
  state.resources.supplies = Clamp(state.resources.supplies + supplyChange, 0, 30);
  const intelligenceIncome = GetPolicyModifier(state, "intelligenceIncome");
  state.resources.intelligence = Clamp(state.resources.intelligence + intelligenceIncome, 0, 20);
  if (state.resources.supplies === 0) {
    state.resources.safety = Clamp(state.resources.safety - 2, 0, 100);
  }
  return { baseIncome, networkIncome, upkeep, supplyChange, intelligenceIncome };
}

function ResolvePendingRewards(state) {
  const resolvedRewards = state.pendingRewards.filter((reward) => reward.dueTurn <= state.turn);
  state.pendingRewards = state.pendingRewards.filter((reward) => reward.dueTurn > state.turn);
  const rewardSummary = { supplies: 0, intelligence: 0, safety: 0 };
  for (const reward of resolvedRewards) {
    rewardSummary.supplies += reward.supplies;
    rewardSummary.intelligence += reward.intelligence;
    rewardSummary.safety += reward.safety;
  }
  state.resources.supplies = Clamp(state.resources.supplies + rewardSummary.supplies, 0, 30);
  state.resources.intelligence = Clamp(state.resources.intelligence + rewardSummary.intelligence, 0, 20);
  state.resources.safety = Clamp(state.resources.safety + rewardSummary.safety, 0, 100);
  return rewardSummary;
}

function ResolveRecovery(state) {
  const fatigueRecovery = 12 + GetPolicyModifier(state, "fatigueRecovery");
  for (const team of Object.values(state.teams)) {
    team.fatigue = Clamp(team.fatigue - fatigueRecovery, 0, 100);
    team.acted = false;
  }
  for (const node of Object.values(state.nodes)) {
    node.exposure = Clamp(node.exposure - 6, 0, 100);
    node.protection = 0;
    if (state.turn % 3 === 0 && node.pressure > 0) {
      node.pressure -= 1;
    }
  }
  for (const routeState of Object.values(state.routes)) {
    routeState.disruptedTurns = Math.max(0, routeState.disruptedTurns - 1);
  }
}

function AddTeamIfMissing(state, teamId, preferredNodeIds) {
  if (state.teams[teamId]) {
    return;
  }
  const nodeId = preferredNodeIds.find((candidateNodeId) => state.nodes[candidateNodeId]?.networkLevel > 0)
    ?? GetActiveNodeIds(state)[0]
    ?? "Beiyue";
  state.teams[teamId] = { nodeId, level: 1, fatigue: 0, acted: false };
}

function ApplyHistoricalAnchorEffects(state, anchor) {
  if (anchor.id === "CageBlockade") {
    state.nodes.Jizhong.pressure = Clamp(state.nodes.Jizhong.pressure + 1, 0, 4);
  } else if (anchor.id === "HundredRegimentsOffensive") {
    state.resources.contribution = Clamp(state.resources.contribution + 3, 0, 100);
    for (const nodeId of GetActiveNodeIds(state)) {
      state.nodes[nodeId].exposure = Clamp(state.nodes[nodeId].exposure + 3, 0, 100);
    }
    AddTeamIfMissing(state, "TeamJizhong", ["Jizhong", "SouthernHebei", "Beiyue"]);
  } else if (anchor.id === "SouthernAnhuiIncident") {
    state.resources.intelligence = Clamp(state.resources.intelligence - 1, 0, 20);
  } else if (anchor.id === "RecoveryFromHardship") {
    state.resources.supplies = Clamp(state.resources.supplies + 1, 0, 30);
    AddTeamIfMissing(state, "TeamRecovery", ["Jiluyu", "Huaibei", "CentralShandong", "Taihang"]);
  } else if (anchor.id === "OperationIchiGo") {
    state.resources.contribution = Clamp(state.resources.contribution + 2, 0, 100);
  }
}

function TriggerHistoricalAnchors(state) {
  const triggeredNow = [];
  for (const anchor of historicalAnchors.filter((candidateAnchor) => candidateAnchor.turn === state.turn)) {
    if (state.triggeredAnchors.includes(anchor.id)) {
      continue;
    }
    state.triggeredAnchors.push(anchor.id);
    ApplyHistoricalAnchorEffects(state, anchor);
    AddHistoryEntry(state, {
      type: "HistoricalAnchor",
      title: anchor.title,
      text: anchor.text,
      anchorId: anchor.id,
    });
    triggeredNow.push(anchor.id);
  }
  return triggeredNow;
}

function UpdateFailureCounters(state) {
  const activeNodeCount = GetActiveNodeIds(state).length;
  state.counters.lowNetworkTurns = activeNodeCount < 2 ? state.counters.lowNetworkTurns + 1 : 0;
  state.counters.lowSafetyTurns = state.resources.safety < 20 ? state.counters.lowSafetyTurns + 1 : 0;
  if (state.counters.lowNetworkTurns >= 2 || state.counters.lowSafetyTurns >= 2) {
    state.status = "defeat";
    state.ending = state.counters.lowSafetyTurns >= 2 ? "NetworkInterruptedForSafety" : "NetworkInterrupted";
    state.finalScore = GetFinalScore(state);
  }
}

export function GetFinalScore(state) {
  const activeNodeCount = GetActiveNodeIds(state).length;
  const rootedNodeCount = Object.values(state.nodes).filter((node) => node.networkLevel >= 2).length;
  const largestNetwork = GetLargestConnectedNetwork(state);
  const networkScore = Clamp((activeNodeCount / 10) * 20, 0, 20) + Clamp((rootedNodeCount / 7) * 20, 0, 20);
  const safetyScore = Clamp(state.resources.safety * 0.3, 0, 30);
  const contributionScore = Clamp((state.resources.contribution / 50) * 20, 0, 20);
  const liaisonScore = Clamp(largestNetwork, 0, 10);
  const total = Math.round(networkScore + safetyScore + contributionScore + liaisonScore);
  let tier = "FireKeptAlive";
  let title = "火种未灭";
  if (total >= 70) {
    tier = "NetworkAcrossTheater";
    title = "烽火成网";
  } else if (total >= 45) {
    tier = "RootsConnected";
    title = "根系相连";
  }
  return {
    total,
    tier,
    title,
    components: {
      network: Math.round(networkScore),
      safety: Math.round(safetyScore),
      contribution: Math.round(contributionScore),
      connectivity: Math.round(liaisonScore),
    },
    activeNodeCount,
    rootedNodeCount,
    largestNetwork,
  };
}

function FinishHistoricalCampaign(state) {
  state.finalScore = GetFinalScore(state);
  state.status = "victory";
  state.ending = state.finalScore.tier;
  state.enemyPlan = null;
}

function GetResourceDelta(startingResources, endingResources) {
  return {
    supplies: endingResources.supplies - startingResources.supplies,
    intelligence: endingResources.intelligence - startingResources.intelligence,
    safety: endingResources.safety - startingResources.safety,
    contribution: endingResources.contribution - startingResources.contribution,
  };
}

export function EndTurn(state) {
  const nextState = DeepClone(state);
  if (!nextState || nextState.status !== "active") {
    if (nextState) {
      nextState.lastResolution = { type: "EndTurn", legal: false, success: false, reason: "本局已经结束。" };
    }
    return nextState;
  }

  const completedTurn = nextState.turn;
  const startingResources = DeepClone(nextState.resources);
  const enemyReport = ResolveEnemyPlan(nextState);
  const economyReport = ResolveQuarterlyEconomy(nextState);
  ResolveRecovery(nextState);
  UpdateFailureCounters(nextState);
  if (nextState.status === "defeat") {
    nextState.lastTurnReport = {
      completedTurn,
      enemy: enemyReport,
      economy: economyReport,
      rewards: { supplies: 0, intelligence: 0, safety: 0 },
      historicalAnchors: [],
      status: nextState.status,
      resourceDelta: GetResourceDelta(startingResources, nextState.resources),
      summary: enemyReport.text,
    };
    return nextState;
  }

  if (completedTurn >= maximumTurns) {
    FinishHistoricalCampaign(nextState);
    nextState.lastTurnReport = {
      completedTurn,
      enemy: enemyReport,
      economy: economyReport,
      rewards: { supplies: 0, intelligence: 0, safety: 0 },
      historicalAnchors: [],
      status: nextState.status,
      finalScore: nextState.finalScore,
      resourceDelta: GetResourceDelta(startingResources, nextState.resources),
      summary: enemyReport.text,
    };
    return nextState;
  }

  nextState.turn += 1;
  nextState.calendar = DeepClone(turnCalendar[nextState.turn - 1]);
  nextState.actionPoints = actionPointsPerTurn;
  if (nextState.calendar.quarter === 1) {
    nextState.policyChangesRemaining = 2;
  }
  const rewards = ResolvePendingRewards(nextState);
  const triggeredAnchors = TriggerHistoricalAnchors(nextState);
  nextState.enemyPlan = GetForcedHistoricalPlan(nextState) ?? GenerateEnemyPlan(nextState);
  nextState.lastTurnReport = {
    completedTurn,
    enemy: enemyReport,
    economy: economyReport,
    rewards,
    historicalAnchors: triggeredAnchors,
    status: nextState.status,
    resourceDelta: GetResourceDelta(startingResources, nextState.resources),
    summary: enemyReport.text,
  };
  nextState.lastResolution = null;
  return nextState;
}

export function SetPolicy(state, policyId, enabled = true) {
  const nextState = DeepClone(state);
  if (!nextState || nextState.status !== "active") {
    if (nextState) {
      nextState.lastResolution = { type: "Policy", legal: false, success: false, policyId, reason: "本局已经结束。" };
    }
    return nextState;
  }
  if (!GetPolicyDefinition(policyId)) {
    nextState.lastResolution = { type: "Policy", legal: false, success: false, policyId, reason: "未知方针。" };
    return nextState;
  }
  const alreadySelected = nextState.selectedPolicies.includes(policyId);
  if (alreadySelected === enabled) {
    nextState.lastResolution = { type: "Policy", legal: true, success: true, policyId, reason: "方针未发生变化。" };
    return nextState;
  }
  if (nextState.policyChangesRemaining <= 0) {
    nextState.lastResolution = { type: "Policy", legal: false, success: false, policyId, reason: "本年度方针调整次数已用完。" };
    return nextState;
  }
  if (enabled && nextState.selectedPolicies.length >= maximumPolicies) {
    nextState.lastResolution = { type: "Policy", legal: false, success: false, policyId, reason: "最多同时实行两项方针，请先停用一项。" };
    return nextState;
  }
  if (enabled) {
    nextState.selectedPolicies.push(policyId);
  } else {
    nextState.selectedPolicies = nextState.selectedPolicies.filter((selectedPolicyId) => selectedPolicyId !== policyId);
  }
  nextState.policyChangesRemaining -= 1;
  nextState.lastResolution = {
    type: "Policy",
    legal: true,
    success: true,
    policyId,
    enabled,
    reason: enabled ? "方针已经启用。" : "方针已经停用。",
  };
  AddHistoryEntry(nextState, {
    type: "Policy",
    title: enabled ? "启用年度方针" : "停用年度方针",
    text: `${GetPolicyDefinition(policyId).name}${enabled ? "开始实行" : "停止实行"}。`,
    policyId,
  });
  return nextState;
}

function CreateNodeState(nodeDefinition) {
  return {
    networkLevel: nodeDefinition.startNetworkLevel,
    trust: nodeDefinition.startTrust,
    exposure: nodeDefinition.startExposure,
    pressure: nodeDefinition.startNetworkLevel > 0 ? 1 : 0,
    defense: nodeDefinition.startNetworkLevel >= 2 && nodeDefinition.terrain === "Mountain" ? 1 : 0,
    protection: 0,
  };
}

export function CreateGameState(seed = 193810) {
  const normalizedSeed = NormalizeSeed(seed);
  const nodes = {};
  for (const nodeDefinition of mapNodes) {
    nodes[nodeDefinition.id] = CreateNodeState(nodeDefinition);
  }
  const routes = {};
  for (const connection of mapConnections.filter((candidateConnection) => candidateConnection.type === "EnemyRoute")) {
    routes[connection.id] = { disruptedTurns: 0, fortification: 0 };
  }
  const state = {
    version: currentRulesVersion,
    seed: normalizedSeed,
    randomState: normalizedSeed,
    turn: 1,
    maxTurns: maximumTurns,
    calendar: DeepClone(turnCalendar[0]),
    status: "active",
    actionPoints: actionPointsPerTurn,
    policyChangesRemaining: 2,
    selectedPolicies: [],
    resources: { supplies: 9, intelligence: 3, safety: 82, contribution: 0 },
    nodes,
    routes,
    teams: {
      TeamBeiyue: { nodeId: "Beiyue", level: 1, fatigue: 0, acted: false },
      TeamTaihang: { nodeId: "Taihang", level: 1, fatigue: 0, acted: false },
    },
    pendingRewards: [],
    enemyPlan: null,
    triggeredAnchors: [],
    historyLog: [],
    counters: { lowNetworkTurns: 0, lowSafetyTurns: 0 },
    lastResolution: null,
    lastTurnReport: null,
    finalScore: null,
    ending: null,
  };
  TriggerHistoricalAnchors(state);
  state.enemyPlan = GenerateEnemyPlan(state);
  return state;
}

function SanitizeNumber(value, fallback, minimum, maximum) {
  return Number.isFinite(value) ? Clamp(value, minimum, maximum) : fallback;
}

function SanitizeSavedState(savedState) {
  if (!savedState || typeof savedState !== "object") {
    throw new Error("存档不是有效对象。");
  }
  if (savedState.version !== currentRulesVersion) {
    throw new Error(`不支持的规则版本：${savedState.version ?? "未知"}。`);
  }
  const state = CreateGameState(savedState.seed);
  state.randomState = Number.isFinite(savedState.randomState)
    ? (Math.trunc(savedState.randomState) >>> 0)
    : state.randomState;
  state.turn = Math.trunc(SanitizeNumber(savedState.turn, 1, 1, maximumTurns));
  state.calendar = DeepClone(turnCalendar[state.turn - 1]);
  state.status = ["active", "victory", "defeat"].includes(savedState.status) ? savedState.status : "active";
  state.actionPoints = Math.trunc(SanitizeNumber(savedState.actionPoints, actionPointsPerTurn, 0, actionPointsPerTurn));
  state.policyChangesRemaining = Math.trunc(SanitizeNumber(savedState.policyChangesRemaining, 0, 0, 2));
  state.selectedPolicies = Array.isArray(savedState.selectedPolicies)
    ? [...new Set(savedState.selectedPolicies.filter((policyId) => GetPolicyDefinition(policyId)))].slice(0, maximumPolicies)
    : [];
  state.resources = {
    supplies: SanitizeNumber(savedState.resources?.supplies, 9, 0, 30),
    intelligence: SanitizeNumber(savedState.resources?.intelligence, 3, 0, 20),
    safety: SanitizeNumber(savedState.resources?.safety, 82, 0, 100),
    contribution: SanitizeNumber(savedState.resources?.contribution, 0, 0, 100),
  };
  for (const nodeDefinition of mapNodes) {
    const savedNode = savedState.nodes?.[nodeDefinition.id];
    if (!savedNode) {
      continue;
    }
    state.nodes[nodeDefinition.id] = {
      networkLevel: Math.trunc(SanitizeNumber(savedNode.networkLevel, state.nodes[nodeDefinition.id].networkLevel, 0, 3)),
      trust: SanitizeNumber(savedNode.trust, state.nodes[nodeDefinition.id].trust, 0, 100),
      exposure: SanitizeNumber(savedNode.exposure, state.nodes[nodeDefinition.id].exposure, 0, 100),
      pressure: Math.trunc(SanitizeNumber(savedNode.pressure, state.nodes[nodeDefinition.id].pressure, 0, 4)),
      defense: Math.trunc(SanitizeNumber(savedNode.defense, state.nodes[nodeDefinition.id].defense, 0, 3)),
      protection: Math.trunc(SanitizeNumber(savedNode.protection, 0, 0, 2)),
    };
  }
  for (const routeId of Object.keys(state.routes)) {
    const savedRoute = savedState.routes?.[routeId];
    if (!savedRoute) {
      continue;
    }
    state.routes[routeId] = {
      disruptedTurns: Math.trunc(SanitizeNumber(savedRoute.disruptedTurns, 0, 0, 3)),
      fortification: Math.trunc(SanitizeNumber(savedRoute.fortification, 0, 0, 3)),
    };
  }
  state.teams = {};
  if (savedState.teams && typeof savedState.teams === "object") {
    for (const [teamId, savedTeam] of Object.entries(savedState.teams).slice(0, 4)) {
      if (!GetNodeDefinition(savedTeam?.nodeId)) {
        continue;
      }
      state.teams[teamId] = {
        nodeId: savedTeam.nodeId,
        level: Math.trunc(SanitizeNumber(savedTeam.level, 1, 1, 3)),
        fatigue: SanitizeNumber(savedTeam.fatigue, 0, 0, 100),
        acted: Boolean(savedTeam.acted),
      };
    }
  }
  if (Object.keys(state.teams).length === 0) {
    state.teams.TeamBeiyue = { nodeId: "Beiyue", level: 1, fatigue: 0, acted: false };
  }
  state.pendingRewards = Array.isArray(savedState.pendingRewards)
    ? savedState.pendingRewards.slice(0, 16).map((reward, rewardIndex) => ({
      id: String(reward?.id ?? `RestoredReward${rewardIndex + 1}`),
      dueTurn: Math.trunc(SanitizeNumber(reward?.dueTurn, state.turn + 1, state.turn, maximumTurns + 1)),
      supplies: SanitizeNumber(reward?.supplies, 0, 0, 5),
      intelligence: SanitizeNumber(reward?.intelligence, 0, 0, 5),
      safety: SanitizeNumber(reward?.safety, 0, 0, 5),
      nodeId: GetNodeDefinition(reward?.nodeId) ? reward.nodeId : null,
    }))
    : [];
  const savedPlan = savedState.enemyPlan;
  const sanitizedPlan = savedPlan && GetEnemyBehaviorDefinition(savedPlan.behaviorId) && GetNodeDefinition(savedPlan.nodeId)
    ? {
      behaviorId: savedPlan.behaviorId,
      nodeId: savedPlan.nodeId,
      routeId: GetConnectionDefinition(savedPlan.routeId)?.type === "EnemyRoute" ? savedPlan.routeId : null,
      strength: Math.trunc(SanitizeNumber(savedPlan.strength, 1, 1, 5)),
      revealed: Boolean(savedPlan.revealed),
      ...(typeof savedPlan.historicalAnchorId === "string" ? { historicalAnchorId: savedPlan.historicalAnchorId } : {}),
    }
    : null;
  state.enemyPlan = DecorateEnemyPlan(sanitizedPlan);
  state.triggeredAnchors = Array.isArray(savedState.triggeredAnchors)
    ? [...new Set(savedState.triggeredAnchors.filter((anchorId) => historicalAnchors.some((anchor) => anchor.id === anchorId)))]
    : [];
  state.historyLog = Array.isArray(savedState.historyLog) ? DeepClone(savedState.historyLog.slice(-160)) : [];
  state.counters = {
    lowNetworkTurns: Math.trunc(SanitizeNumber(savedState.counters?.lowNetworkTurns, 0, 0, 2)),
    lowSafetyTurns: Math.trunc(SanitizeNumber(savedState.counters?.lowSafetyTurns, 0, 0, 2)),
  };
  state.lastResolution = savedState.lastResolution ? DeepClone(savedState.lastResolution) : null;
  state.lastTurnReport = savedState.lastTurnReport ? DeepClone(savedState.lastTurnReport) : null;
  state.finalScore = savedState.finalScore ? DeepClone(savedState.finalScore) : null;
  state.ending = typeof savedState.ending === "string" ? savedState.ending : null;
  return state;
}

export function SerializeGame(state) {
  return JSON.stringify(SanitizeSavedState(DeepClone(state)));
}

export function DeserializeGame(serializedGame) {
  let savedState;
  try {
    savedState = typeof serializedGame === "string" ? JSON.parse(serializedGame) : DeepClone(serializedGame);
  } catch (error) {
    throw new Error(`无法读取存档：${error.message}`);
  }
  return SanitizeSavedState(savedState);
}

export const rulesMetadata = Object.freeze({
  version: currentRulesVersion,
  maximumTurns,
  actionPointsPerTurn,
  maximumPolicies,
  historicalScopeNote: "本作将多个敌后根据地压缩为教学性的全局视角；地图、季度与行动均非精确作战复盘。",
});
