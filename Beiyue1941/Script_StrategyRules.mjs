import {
  gameConfig as archiveGameConfig,
  regionDefinitions as archiveRegionDefinitions,
  historicalTurns as archiveHistoricalTurns,
} from "./Script_Rules.mjs";

const resourceKeys = Object.freeze(["supply", "organization", "intelligence", "trust"]);
const regionValueKeys = Object.freeze([
  "network",
  "safety",
  "enemyControl",
  "exposure",
  "devastation",
  "protection",
  "localCache",
]);

const historyGroups = Object.freeze([
  [0],
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
  [9],
  [10, 11],
  [12],
  [13],
  [14, 15],
  [16],
  [17],
]);

const operationalBriefs = Object.freeze([
  {
    title: "预警网与两条山地退路",
    objective: "在阜平、五台、平山或井陉完成侦察或联络，并保持阜平通往五台或平山的交通连通。",
    future: "八月北部山地将承受连续压力；现在离开某地的编组，下回合未必赶得回来。",
    focusRegionIds: ["fuping", "wutai", "pingshan", "jingxing"],
    requiredMissionGroups: [["recon", "liaison"]],
    corridorRegionIds: ["wutai", "pingshan"],
  },
  {
    title: "北线反合围部署",
    objective: "在灵丘、涞源或五台的同一地区形成“侦察＋掩护／疏散”组合，并保持五台方向连通。",
    future: "北线压力会向阜平纵深延伸；孤立破袭不能替代转移窗口。",
    focusRegionIds: ["lingqiu", "laiyuan", "wutai"],
    requiredMissionGroups: [["recon"], ["screen", "evacuation"]],
    linkedMissionPairs: [[['recon'], ['screen', 'evacuation']]],
    corridorRegionIds: ["wutai"],
  },
  {
    title: "多向合击与学校分散",
    objective: "在五台、阜平、唐县或易县的同一地区形成“掩护＋运输／疏散／机构转移”组合，并保持唐县方向连通。",
    future: "机关、学校和卫生力量的分散状态将影响九月的连续转移。",
    focusRegionIds: ["wutai", "fuping", "tangxian", "yixian"],
    requiredMissionGroups: [["screen"], ["supply", "evacuation", "institutionMove"]],
    linkedMissionPairs: [[['screen'], ['supply', 'evacuation', 'institutionMove']]],
    corridorRegionIds: ["tangxian"],
  },
  {
    title: "机关转移与外线策应",
    objective: "在阜平、五台、井陉、行唐或新乐完成一项疏散／机构转移和一项侦察／迟滞，并保持五台方向连通。",
    future: "本回合东线行动的痕迹会影响后续秋收地区的搜索压力。",
    focusRegionIds: ["fuping", "wutai", "jingxing", "xingtang", "xinle"],
    requiredMissionGroups: [["evacuation", "institutionMove"], ["recon", "interdict"]],
    corridorRegionIds: ["wutai"],
  },
  {
    title: "村庄危机与秋收保障",
    objective: "在易县、唐县、曲阳或行唐的同一地区形成“救济／疏散＋掩护／侦察”组合，并保持曲阳方向连通。",
    future: "消耗当地储备可以救急，但冬季封锁前仍需交通队补入新的缓存。",
    focusRegionIds: ["yixian", "tangxian", "quyang", "xingtang"],
    requiredMissionGroups: [["relief", "evacuation"], ["screen", "recon"]],
    linkedMissionPairs: [[['relief', 'evacuation'], ['screen', 'recon']]],
    corridorRegionIds: ["quyang"],
  },
  {
    title: "狼牙山方向的掩护责任",
    objective: "史实纪念不可改写。你的责任是在易县或唐县完成掩护、疏散或救济，保持唐县方向连通，并避免紧急迟滞。",
    future: "侵略军撤退后仍会沿铁路和据点持续搜索，保存力量比追击数字更重要。",
    focusRegionIds: ["yixian", "tangxian"],
    requiredMissionGroups: [["screen", "evacuation", "relief"]],
    corridorRegionIds: ["tangxian"],
    forbidsUrgentInterdict: true,
  },
  {
    title: "谨慎恢复而非冒进追击",
    objective: "在涞源、灵丘、井陉或新乐完成联络／补给／救济和侦察，并保持灵丘或井陉方向连通。",
    future: "大规模行动暂告一段落不等于封锁消失；冬季会检验网络的连续性。",
    focusRegionIds: ["laiyuan", "lingqiu", "jingxing", "xinle"],
    requiredMissionGroups: [["liaison", "supply", "relief"], ["recon"]],
    corridorRegionIds: ["lingqiu", "jingxing"],
  },
  {
    title: "据点蚕食下的交通轮换",
    objective: "在灵丘、井陉、行唐或新乐完成联络／侦察和实际转移／运输，并保持行唐方向连通。",
    future: "最终接应需要交通队逐步向曲阳、行唐方向预置；现在才是开始移动的时机。",
    focusRegionIds: ["jingxing", "xingtang", "xinle", "lingqiu"],
    requiredMissionGroups: [["liaison", "recon"], ["move", "supply"]],
    corridorRegionIds: ["xingtang"],
  },
  {
    title: "精兵简政与编组轮换",
    objective: "至少让两支编组留作隐蔽预备，在阜平或平山完成联络／救济，并保持平山方向连通。",
    future: "休整不是跳过回合；预备队能在后续卫生和粮荒阶段避免全线失去响应能力。",
    focusRegionIds: ["fuping", "pingshan"],
    requiredMissionGroups: [["liaison", "relief"]],
    corridorRegionIds: ["pingshan"],
    requiresReserve: true,
    minimumReserveCount: 2,
  },
  {
    title: "卫生、通信与机构运转",
    objective: "在唐县、曲阳、灵寿或阜平的同一地区形成“补给／救济＋联络／掩护”组合，并保持唐县方向连通。",
    future: "机构转移会停摆一回合；是原地维持还是提前分散，取决于你对下一阶段的判断。",
    focusRegionIds: ["tangxian", "quyang", "lingshou", "fuping"],
    requiredMissionGroups: [["supply", "relief"], ["liaison", "screen"]],
    linkedMissionPairs: [[['supply', 'relief'], ['liaison', 'screen']]],
    corridorRegionIds: ["tangxian"],
  },
  {
    title: "春荒纪律与生产自救",
    objective: "在曲阳、平山或五台开展救济或补给，保持曲阳方向连通，且不要用紧急姿态执行武装迟滞。",
    future: "下一回合接应责任固定发生；交通队若仍在西北部，将很难及时抵达东部入口。",
    focusRegionIds: ["quyang", "pingshan", "wutai"],
    requiredMissionGroups: [["relief", "supply"]],
    corridorRegionIds: ["quyang"],
    forbidsUrgentInterdict: true,
  },
  {
    title: "冀中人员接应",
    objective: "在新乐、行唐、曲阳或唐县的同一地区形成“运输／疏散／转移＋掩护／联络／侦察”组合，让交通队抵达东部入口并保持连通。",
    future: "本局只评估局部保存、接应与机构存续，不改写冀中“五一”大“扫荡”的真实灾难。",
    focusRegionIds: ["xinle", "xingtang", "quyang", "tangxian"],
    requiredMissionGroups: [["supply", "evacuation", "move"], ["screen", "liaison", "recon"]],
    linkedMissionPairs: [[['supply', 'evacuation', 'move'], ['screen', 'liaison', 'recon']]],
    corridorRegionIds: ["xinle", "xingtang", "quyang"],
    requiresTransportEast: true,
  },
]);

function CloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function Clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function Round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function Unique(values) {
  return [...new Set(values)];
}

function GetHistoryText(node, key) {
  if (key === "fact") return node.fact?.text || "";
  if (key === "abstraction") return node.abstraction?.text || "";
  return node[key] || "";
}

export const historicalTurns = Object.freeze(historyGroups.map((indices, index) => {
  const nodes = indices.map((nodeIndex) => archiveHistoricalTurns[nodeIndex]);
  const brief = operationalBriefs[index];
  const firstNode = nodes[0];
  const lastNode = nodes[nodes.length - 1];
  const displayDate = nodes.length === 1
    ? firstNode.displayDate
    : `${firstNode.displayDate}—${lastNode.displayDate}`;
  return Object.freeze({
    id: `operation${String(index + 1).padStart(2, "0")}`,
    date: firstNode.date,
    displayDate,
    title: brief.title,
    context: nodes.map((node) => node.context).join(" "),
    fact: Object.freeze({ label: "史实节点", text: nodes.map((node) => GetHistoryText(node, "fact")).join(" ") }),
    abstraction: Object.freeze({
      label: "作战期抽象",
      text: `本回合把${nodes.length}个相邻史实节点合并为一个规划期。编组、路线状态与局部结果均为策略抽象，不对应真实统一指挥机构或精确番号。`,
    }),
    intensity: Math.max(...nodes.map((node) => node.intensity || 1)),
    pressureRegions: Object.freeze(Unique(nodes.flatMap((node) => node.pressureRegions || []))),
    prompt: brief.objective,
    future: brief.future,
    objective: Object.freeze(CloneValue(brief)),
    archiveNodes: Object.freeze(nodes.map((node) => Object.freeze({
      date: node.displayDate,
      title: node.title,
      fact: GetHistoryText(node, "fact"),
    }))),
    choices: Object.freeze([Object.freeze({
      id: "briefed",
      label: "接收作战简报",
      name: "接收作战简报",
      description: "历史进程固定发生；真正的选择在地图、编组、路线和预案中完成。",
      preview: "进入部署界面，不获得即时数值奖励。",
      effects: Object.freeze({}),
    })]),
  });
}));

export const gameConfig = Object.freeze({
  ...archiveGameConfig,
  saveVersion: 2,
  turnCount: historicalTurns.length,
  ordersPerTurn: 4,
  commandPointsPerTurn: 4,
  estimatedMinutes: Object.freeze([70, 100]),
  playerRole: "玩家操作的是虚构的北岳区军政民协调界面；五支编组综合抽象了多类真实力量的工作能力，不对应任何真实番号或人物。",
  historyBoundary: "十二个规划期压缩呈现十八个史实节点。全国战局、真实人物命运和侵略暴力造成的历史灾难不会被玩家改写。",
});

export const regionDefinitions = archiveRegionDefinitions;

export const formationDefinitions = Object.freeze({
  mobileGuard: Object.freeze({
    id: "mobileGuard",
    name: "机动掩护队",
    shortName: "机动",
    type: "armed",
    description: "抽象表示能够在山地机动、掩护转移和实施有限迟滞的武装力量。",
    startRegionId: "wutai",
    missionIds: Object.freeze(["move", "recon", "screen", "interdict"]),
  }),
  localGuard: Object.freeze({
    id: "localGuard",
    name: "地方掩护队",
    shortName: "地方",
    type: "armed",
    description: "抽象表示熟悉村庄和道路的地方武装与民兵工作能力。",
    startRegionId: "fuping",
    missionIds: Object.freeze(["move", "recon", "screen", "liaison", "interdict"]),
  }),
  northWorkTeam: Object.freeze({
    id: "northWorkTeam",
    name: "北线工作队",
    shortName: "北工",
    type: "work",
    description: "抽象表示群众工作、交通联络和基层救济能力。",
    startRegionId: "laiyuan",
    missionIds: Object.freeze(["move", "recon", "liaison", "relief", "evacuation"]),
  }),
  southWorkTeam: Object.freeze({
    id: "southWorkTeam",
    name: "南线工作队",
    shortName: "南工",
    type: "work",
    description: "抽象表示南部山地的群众工作、恢复和接应能力。",
    startRegionId: "pingshan",
    missionIds: Object.freeze(["move", "recon", "liaison", "relief", "evacuation"]),
  }),
  transportTeam: Object.freeze({
    id: "transportTeam",
    name: "交通运输队",
    shortName: "交通",
    type: "transport",
    description: "抽象表示交通员、运输力量和机构分散转移能力。",
    startRegionId: "tangxian",
    missionIds: Object.freeze(["move", "supply", "evacuation", "institutionMove"]),
  }),
});

export const stanceDefinitions = Object.freeze({
  concealed: Object.freeze({
    id: "concealed",
    name: "隐蔽",
    description: "效果较慢，降低活动痕迹，遇到主攻时更容易按预案撤离。",
    effectScale: 0.82,
    costScale: 0.85,
    traceChange: -2,
    riskScale: 0.7,
  }),
  balanced: Object.freeze({
    id: "balanced",
    name: "稳妥",
    description: "兼顾任务效果、速度和暴露风险。",
    effectScale: 1,
    costScale: 1,
    traceChange: 0,
    riskScale: 1,
  }),
  urgent: Object.freeze({
    id: "urgent",
    name: "紧急",
    description: "提高当期效果，但增加疲劳和可观察痕迹；连续使用容易招致下一阶段反制。",
    effectScale: 1.24,
    costScale: 1.2,
    traceChange: 4,
    riskScale: 1.35,
  }),
});

export const actionDefinitions = Object.freeze({
  move: Object.freeze({
    id: "move",
    name: "转移驻地",
    icon: "移",
    description: "沿一条可用交通边转移编组，为后续回合预置位置；交通队在安全路线方可连续通过两段。",
    commandCost: 1,
    costs: Object.freeze({ supply: 1, organization: 1, intelligence: 0, trust: 0 }),
    phase: 1,
    trace: 1,
  }),
  recon: Object.freeze({
    id: "recon",
    name: "侦察核实",
    icon: "察",
    description: "核对道路征候，为同地掩护或迟滞提供联动，并积累下期情报。",
    commandCost: 1,
    costs: Object.freeze({ supply: 1, organization: 2, intelligence: 0, trust: 0 }),
    phase: 2,
    trace: 2,
  }),
  liaison: Object.freeze({
    id: "liaison",
    name: "恢复交通站",
    icon: "联",
    description: "恢复本地网络和相邻交通边；同地运输或疏散会获得隐蔽与容量加成。",
    commandCost: 1,
    costs: Object.freeze({ supply: 2, organization: 3, intelligence: 1, trust: 0 }),
    phase: 3,
    trace: 3,
  }),
  supply: Object.freeze({
    id: "supply",
    name: "输送地方储备",
    icon: "运",
    description: "把总部综合物资转为目标地区缓存；路线受阻时运量下降并增加疲劳。",
    commandCost: 1,
    costs: Object.freeze({ supply: 6, organization: 2, intelligence: 0, trust: 0 }),
    phase: 3,
    trace: 4,
  }),
  relief: Object.freeze({
    id: "relief",
    name: "救济与恢复",
    icon: "济",
    description: "消耗一份当地缓存改善群众安全和生产恢复；没有缓存时只能完成有限协调。",
    commandCost: 1,
    costs: Object.freeze({ supply: 2, organization: 3, intelligence: 0, trust: 0 }),
    phase: 4,
    trace: 2,
    localCacheCost: 1,
  }),
  evacuation: Object.freeze({
    id: "evacuation",
    name: "分段疏散",
    icon: "疏",
    description: "指定相邻退路，分散群众与工作力量；原地网络暂时减弱，目的地承担额外供给压力。",
    commandCost: 2,
    costs: Object.freeze({ supply: 4, organization: 4, intelligence: 2, trust: 0 }),
    phase: 4,
    trace: 3,
    localCacheCost: 1,
    requiresFallback: true,
  }),
  institutionMove: Object.freeze({
    id: "institutionMove",
    name: "机构分散转移",
    icon: "机",
    description: "选择相邻退路转移当地一处运转机构；机构会停摆一回合，换取后续保存空间。",
    commandCost: 2,
    costs: Object.freeze({ supply: 5, organization: 5, intelligence: 2, trust: 0 }),
    phase: 4,
    trace: 4,
    localCacheCost: 1,
    requiresFallback: true,
  }),
  screen: Object.freeze({
    id: "screen",
    name: "道路掩护",
    icon: "护",
    description: "为同地非战斗任务和群众转移争取窗口；价值在保护和迟滞，不统计歼敌。",
    commandCost: 1,
    costs: Object.freeze({ supply: 3, organization: 3, intelligence: 1, trust: 0 }),
    phase: 3,
    trace: 5,
  }),
  interdict: Object.freeze({
    id: "interdict",
    name: "交通迟滞",
    icon: "滞",
    description: "在可靠侦察配合下迟滞既定敌军轴线；孤立实施效果有限，并会损伤当地道路隐蔽性。",
    commandCost: 2,
    costs: Object.freeze({ supply: 4, organization: 4, intelligence: 3, trust: 0 }),
    phase: 3,
    trace: 8,
  }),
});

export const policyDefinitions = Object.freeze({
  protect: Object.freeze({ id: "protect", name: "分散保存", icon: "护", description: "提高掩护、疏散和机构转移的保存效果。", effectText: "退路更可靠，但总部补给增长较慢。", switchCost: 8, cooldownTurns: 2 }),
  guerrilla: Object.freeze({ id: "guerrilla", name: "机动迟滞", icon: "牵", description: "提高转移和交通迟滞效果。", effectText: "武装行动更有效，但痕迹与疲劳更难消退。", switchCost: 9, cooldownTurns: 2 }),
  network: Object.freeze({ id: "network", name: "交通轮换", icon: "网", description: "提高联络、侦察和路线修复效果。", effectText: "每回合多获得一条被动征候，组织消耗略高。", switchCost: 8, cooldownTurns: 2 }),
  production: Object.freeze({ id: "production", name: "生产自救", icon: "产", description: "优先恢复总部储备和地方缓存。", effectText: "补给恢复更快，但不直接降低搜索压力。", switchCost: 8, cooldownTurns: 2 }),
});

const institutionDefinitions = Object.freeze({
  government: Object.freeze({ id: "government", name: "边区政务机构", regionId: "fuping", health: 84, active: true, disruptedTurns: 0 }),
  hospital: Object.freeze({ id: "hospital", name: "卫生与医院系统", regionId: "tangxian", health: 78, active: true, disruptedTurns: 0 }),
  school: Object.freeze({ id: "school", name: "抗大二分校", regionId: "wutai", health: 80, active: true, disruptedTurns: 0 }),
  press: Object.freeze({ id: "press", name: "印刷与报刊机构", regionId: "fuping", health: 72, active: true, disruptedTurns: 0 }),
  radio: Object.freeze({ id: "radio", name: "电台与通信机构", regionId: "fuping", health: 76, active: true, disruptedTurns: 0 }),
});

const regionDefinitionsById = Object.freeze(Object.fromEntries(regionDefinitions.map((region) => [region.id, region])));

function GetRouteId(leftId, rightId) {
  return `route_${[leftId, rightId].sort().join("_")}`;
}

function BuildRouteDefinitions() {
  const routes = {};
  for (const region of regionDefinitions) {
    for (const adjacentId of region.adjacentIds) {
      const routeId = GetRouteId(region.id, adjacentId);
      if (routes[routeId]) continue;
      const adjacent = regionDefinitionsById[adjacentId];
      const railRelevance = Math.max(region.railRelevance || 0, adjacent.railRelevance || 0);
      routes[routeId] = Object.freeze({
        id: routeId,
        fromId: region.id,
        toId: adjacentId,
        kind: railRelevance >= 70 ? "rail" : "path",
        name: `${region.name}—${adjacent.name}${railRelevance >= 70 ? "铁路沿线" : "交通线"}`,
      });
    }
  }
  return Object.freeze(routes);
}

export const routeDefinitions = BuildRouteDefinitions();

function NormalizeSeed(seed) {
  const normalized = Number(seed) >>> 0;
  return normalized || 19410707;
}

function HashNumber(seed, ...parts) {
  let value = NormalizeSeed(seed) ^ 0x9e3779b9;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619) >>> 0;
    }
  }
  value ^= value >>> 16;
  value = Math.imul(value, 2246822507) >>> 0;
  value ^= value >>> 13;
  return value >>> 0;
}

function HashRandom(seed, ...parts) {
  return HashNumber(seed, ...parts) / 4294967296;
}

function GetPlanFingerprint(seed, turnIndex, doctrine, targets, cutRoutes) {
  return HashNumber(seed, "enemyPlan", turnIndex, doctrine, JSON.stringify(targets), JSON.stringify(cutRoutes));
}

function GetEmptyCosts() {
  return { supply: 0, organization: 0, intelligence: 0, trust: 0 };
}

function AddCosts(target, costs) {
  for (const key of resourceKeys) target[key] += Number(costs?.[key] || 0);
}

function GetMissionCosts(game, missionId, stanceId) {
  const mission = actionDefinitions[missionId];
  const stance = stanceDefinitions[stanceId] || stanceDefinitions.balanced;
  const costs = GetEmptyCosts();
  for (const key of resourceKeys) {
    costs[key] = Math.ceil(Number(mission?.costs?.[key] || 0) * stance.costScale);
  }
  if (game?.policyId === "network" && ["liaison", "recon"].includes(missionId)) costs.organization += 1;
  if (game?.policyId === "guerrilla" && ["move", "interdict"].includes(missionId)) costs.supply = Math.max(0, costs.supply - 1);
  return costs;
}

function GetQueuedCosts(game, excludedFormationId = null) {
  const costs = GetEmptyCosts();
  for (const order of game.queuedOrders) {
    if (order.formationId === excludedFormationId) continue;
    AddCosts(costs, GetMissionCosts(game, order.missionId, order.stanceId));
  }
  return costs;
}

function GetQueuedCommandCost(game, excludedFormationId = null) {
  return game.queuedOrders.reduce((sum, order) => (
    order.formationId === excludedFormationId ? sum : sum + actionDefinitions[order.missionId].commandCost
  ), 0);
}

function GetRouteState(game, leftId, rightId) {
  return game.routes[GetRouteId(leftId, rightId)] || null;
}

function GetNeighbors(game, regionId) {
  return game.regions[regionId]?.adjacentIds || [];
}

function FindPath(game, startId, targetId, maximumSteps = 1, minimumIntegrity = 1) {
  if (startId === targetId) return [];
  const queue = [{ regionId: startId, routeIds: [] }];
  const visited = new Set([startId]);
  while (queue.length) {
    const current = queue.shift();
    if (current.routeIds.length >= maximumSteps) continue;
    for (const adjacentId of GetNeighbors(game, current.regionId)) {
      const route = GetRouteState(game, current.regionId, adjacentId);
      if (!route || route.integrity < minimumIntegrity || visited.has(adjacentId)) continue;
      const routeIds = [...current.routeIds, route.id];
      if (adjacentId === targetId) return routeIds;
      visited.add(adjacentId);
      queue.push({ regionId: adjacentId, routeIds });
    }
  }
  return null;
}

export function GetConnectedRegionIds(game, originId = "fuping") {
  if (!game?.regions?.[originId]) return [];
  const connected = new Set([originId]);
  const queue = [originId];
  while (queue.length) {
    const regionId = queue.shift();
    for (const adjacentId of GetNeighbors(game, regionId)) {
      const route = GetRouteState(game, regionId, adjacentId);
      const localNetwork = Math.min(game.regions[regionId].network, game.regions[adjacentId].network);
      if (!route || route.integrity < 32 || localNetwork < 28 || connected.has(adjacentId)) continue;
      connected.add(adjacentId);
      queue.push(adjacentId);
    }
  }
  return [...connected];
}

function GenerateEnemyPlan(game, turnIndex) {
  const historicalTurn = historicalTurns[turnIndex];
  if (!historicalTurn) return null;
  const targetCount = historicalTurn.intensity >= 5 ? 3 : historicalTurn.intensity >= 3 ? 2 : 1;
  const ranked = Object.values(game.regions).map((region) => {
    const historicalPressure = historicalTurn.pressureRegions.includes(region.id) ? 28 : 0;
    const observedTrace = region.exposure * 0.35 + (game.enemy.observedPatterns[region.id] || 0) * 6;
    const corridorValue = region.corridorRelevance * 0.16 + region.railRelevance * 0.1;
    const routeTrace = Object.values(game.routes)
      .filter((route) => route.fromId === region.id || route.toId === region.id)
      .reduce((sum, route) => sum + route.trace, 0) * 0.045;
    const variation = HashRandom(game.seed, "target", turnIndex, region.id) * 22;
    return { regionId: region.id, score: historicalPressure + observedTrace + corridorValue + routeTrace + variation };
  }).sort((left, right) => right.score - left.score || left.regionId.localeCompare(right.regionId));
  const candidatePool = ranked.slice(0, Math.min(7, ranked.length));
  const targets = [];
  const remaining = [...candidatePool];
  for (let index = 0; index < targetCount && remaining.length; index += 1) {
    const selectionIndex = Math.min(
      remaining.length - 1,
      Math.floor(HashRandom(game.seed, "pick", turnIndex, index) * Math.min(3, remaining.length)),
    );
    const selected = remaining.splice(selectionIndex, 1)[0];
    targets.push({
      regionId: selected.regionId,
      intensity: Clamp(historicalTurn.intensity + Math.floor(HashRandom(game.seed, "intensity", turnIndex, selected.regionId) * 3) - 1, 1, 6),
    });
  }
  const targetSet = new Set(targets.map((target) => target.regionId));
  const possibleRoutes = Object.values(routeDefinitions).filter((route) => targetSet.has(route.fromId) || targetSet.has(route.toId));
  const cutRoutes = possibleRoutes
    .sort((left, right) => HashNumber(game.seed, "route", turnIndex, left.id) - HashNumber(game.seed, "route", turnIndex, right.id))
    .slice(0, Math.min(targetCount, possibleRoutes.length))
    .map((route) => ({ routeId: route.id, pressure: historicalTurn.intensity }));
  const doctrine = ["纵深搜索", "道路封锁", "据点推进"][HashNumber(game.seed, "doctrine", turnIndex) % 3];
  return {
    createdForTurn: turnIndex,
    planFingerprint: GetPlanFingerprint(game.seed, turnIndex, doctrine, targets, cutRoutes),
    doctrine,
    targets,
    cutRoutes,
  };
}

function BuildInitialRegions() {
  const cacheByRegion = {
    fuping: 4,
    wutai: 2,
    lingqiu: 1,
    laiyuan: 1,
    yixian: 1,
    tangxian: 2,
    quyang: 1,
    pingshan: 3,
    lingshou: 1,
    jingxing: 0,
    xingtang: 0,
    xinle: 0,
  };
  return Object.fromEntries(regionDefinitions.map((definition) => [definition.id, {
    ...CloneValue(definition),
    localCache: cacheByRegion[definition.id] || 0,
  }]));
}

function BuildInitialRoutes(regions) {
  return Object.fromEntries(Object.values(routeDefinitions).map((definition) => {
    const from = regions[definition.fromId];
    const to = regions[definition.toId];
    const baseIntegrity = Clamp((from.network + to.network) / 2 - (from.enemyControl + to.enemyControl) * 0.12, 22, 78);
    return [definition.id, {
      ...CloneValue(definition),
      integrity: Math.round(baseIntegrity),
      trace: definition.kind === "rail" ? 32 : 16,
      lastUsedTurn: -1,
      consecutiveUses: 0,
    }];
  }));
}

function BuildInitialFormations() {
  const readinessById = {
    mobileGuard: [84, 12],
    localGuard: [80, 10],
    northWorkTeam: [76, 14],
    southWorkTeam: [78, 12],
    transportTeam: [74, 10],
  };
  return Object.fromEntries(Object.values(formationDefinitions).map((definition) => [definition.id, {
    id: definition.id,
    name: definition.name,
    type: definition.type,
    regionId: definition.startRegionId,
    cohesion: readinessById[definition.id][0],
    fatigue: readinessById[definition.id][1],
    lastMissionId: null,
    repeatedMissionCount: 0,
  }]));
}

export function CreateGame(seed = gameConfig.defaultSeed) {
  const normalizedSeed = NormalizeSeed(seed);
  const regions = BuildInitialRegions();
  const game = {
    saveVersion: gameConfig.saveVersion,
    seed: normalizedSeed,
    turnIndex: 0,
    phase: "planning",
    selectedEventOptionId: null,
    policyId: "protect",
    policyCooldown: 0,
    commandPoints: gameConfig.commandPointsPerTurn,
    resources: { supply: 66, organization: 72, intelligence: 34, trust: 58 },
    regions,
    routes: BuildInitialRoutes(regions),
    formations: BuildInitialFormations(),
    institutions: CloneValue(institutionDefinitions),
    queuedOrders: [],
    probedRegionIds: [],
    enemy: { currentPlan: null, observedPatterns: {}, lastRevealedTargets: [] },
    objectiveResults: [],
    history: [],
    logs: [{ text: "五支编组已经分散在北岳区各线；敌军本期计划已经形成，但我方只掌握部分征候。", tone: "neutral" }],
    flags: {},
    lastResolution: null,
    outcome: null,
  };
  for (const regionId of Object.keys(game.regions)) game.enemy.observedPatterns[regionId] = 0;
  game.enemy.currentPlan = GenerateEnemyPlan(game, 0);
  return game;
}

function AssertPlanning(game) {
  if (!game || game.phase !== "planning" || game.turnIndex >= historicalTurns.length) {
    throw new Error("当前战役不在可规划阶段。");
  }
}

export function ChooseEventOption(game, optionId) {
  AssertPlanning(game);
  if (optionId !== "briefed") throw new Error("本作战期只有固定史实简报，没有即时数值选项。");
  const nextGame = CloneValue(game);
  nextGame.selectedEventOptionId = "briefed";
  return nextGame;
}

export function GetOperationalBrief(game) {
  const turn = historicalTurns[game?.turnIndex ?? 0];
  return turn ? CloneValue(turn.objective) : null;
}

function GetProbeCost(game) {
  return 4 + game.probedRegionIds.length * 2;
}

export function GetProbePreview(game, regionId) {
  const validRegion = Boolean(game?.regions?.[regionId]);
  const cost = game ? GetProbeCost(game) : 4;
  const alreadyProbed = Boolean(game?.probedRegionIds?.includes(regionId));
  return {
    valid: Boolean(game && game.phase === "planning" && validRegion && !alreadyProbed && game.resources.intelligence >= cost && game.probedRegionIds.length < 3),
    cost,
    alreadyProbed,
    summary: alreadyProbed
      ? "这一区域的本期征候已经核实。"
      : `消耗${cost}点情报，核实该地区是否属于本期既定主攻或封锁目标；最多核实三处。`,
  };
}

export function ProbeRegion(game, regionId) {
  AssertPlanning(game);
  const preview = GetProbePreview(game, regionId);
  if (!preview.valid) throw new Error(preview.alreadyProbed ? "该地区已经核实。" : "情报不足或本期核实次数已满。");
  const nextGame = CloneValue(game);
  nextGame.resources.intelligence -= preview.cost;
  nextGame.probedRegionIds.push(regionId);
  return nextGame;
}

function GetSignalCandidates(game) {
  const historicalTurn = historicalTurns[game.turnIndex];
  const candidateIds = Unique([
    ...historicalTurn.pressureRegions,
    ...Object.values(game.regions)
      .sort((left, right) => (right.railRelevance + right.corridorRelevance) - (left.railRelevance + left.corridorRelevance))
      .slice(0, 3)
      .map((region) => region.id),
  ]);
  return candidateIds.map((regionId) => {
    const region = game.regions[regionId];
    const historical = historicalTurn.pressureRegions.includes(regionId);
    const signalScore = (historical ? 36 : 12) + region.railRelevance * 0.2 + region.exposure * 0.18
      + HashRandom(game.seed, "signal", game.turnIndex, regionId) * 22;
    return { regionId, signalScore };
  }).sort((left, right) => right.signalScore - left.signalScore || left.regionId.localeCompare(right.regionId));
}

export function GetEnemyForecast(game) {
  if (!game || game.phase === "ended") {
    return { certainty: "阶段结束", summary: "没有新的敌情研判。", targets: [] };
  }
  const planTargets = new Map(game.enemy.currentPlan.targets.map((target) => [target.regionId, target]));
  const passiveCount = game.policyId === "network" ? 4 : game.resources.intelligence >= 42 ? 3 : 2;
  const passiveSignals = GetSignalCandidates(game).slice(0, passiveCount).map((signal, index) => ({
    regionId: signal.regionId,
    regionName: game.regions[signal.regionId].name,
    likelihood: index === 0 ? "较强征候" : "一般征候",
    confirmed: false,
    report: historicalTurns[game.turnIndex].pressureRegions.includes(signal.regionId)
      ? "史实态势与道路活动均指向这一带，但具体目标尚未核实。"
      : "交通或据点活动增加，可能是常规巡查，也可能是侧翼准备。",
  }));
  const probedSignals = game.probedRegionIds.map((regionId) => {
    const target = planTargets.get(regionId);
    return {
      regionId,
      regionName: game.regions[regionId].name,
      likelihood: target ? "确认主攻" : "排除主攻",
      confirmed: true,
      isTarget: Boolean(target),
      intensityBand: target ? (target.intensity >= 5 ? "很强" : target.intensity >= 3 ? "较强" : "有限") : "无",
      report: target
        ? `多源报告交叉核对：本期${game.enemy.currentPlan.doctrine}将经过这一地区，强度${target.intensity >= 5 ? "很强" : target.intensity >= 3 ? "较强" : "有限"}。`
        : "现有报告可排除其为本期主要目标，但常规据点巡查仍会存在。",
    };
  });
  const merged = new Map(passiveSignals.map((signal) => [signal.regionId, signal]));
  for (const signal of probedSignals) merged.set(signal.regionId, signal);
  const certainty = game.probedRegionIds.length >= 2 ? "局部核实" : game.resources.intelligence >= 42 ? "多源征候" : "零散报告";
  return {
    certainty,
    summary: `${certainty}：敌方本期计划已在我方下令前锁定。地图斜纹只表示可观察征候，不等于真实目标答案。`,
    targets: [...merged.values()],
    planFingerprint: game.enemy.currentPlan.planFingerprint,
  };
}

function NormalizeOrderInput(missionIdOrOrder, regionId, formationId, stanceId, fallbackRegionId) {
  if (missionIdOrOrder && typeof missionIdOrOrder === "object") {
    return {
      missionId: missionIdOrOrder.missionId || missionIdOrOrder.actionId,
      targetRegionId: missionIdOrOrder.targetRegionId || missionIdOrOrder.regionId,
      formationId: missionIdOrOrder.formationId,
      stanceId: missionIdOrOrder.stanceId || "balanced",
      fallbackRegionId: missionIdOrOrder.fallbackRegionId || null,
    };
  }
  return { missionId: missionIdOrOrder, targetRegionId: regionId, formationId, stanceId: stanceId || "balanced", fallbackRegionId: fallbackRegionId || null };
}

function GetMissionRange(game, formation, missionId) {
  if (formation.type === "transport" && ["move", "supply"].includes(missionId)) {
    return 2;
  }
  if (game.policyId === "guerrilla" && formation.type === "armed" && missionId === "move") return 2;
  return 1;
}

function FindMissionPath(game, formation, targetRegionId, missionId) {
  const oneStepPath = FindPath(game, formation.regionId, targetRegionId, 1, 1);
  if (oneStepPath !== null) return oneStepPath;
  const maximumSteps = GetMissionRange(game, formation, missionId);
  if (maximumSteps <= 1) return null;
  return FindPath(game, formation.regionId, targetRegionId, maximumSteps, 44);
}

function GetOrderSynergies(orders, order) {
  const sameTargetOrders = orders.filter((candidate) => candidate.formationId !== order.formationId && candidate.targetRegionId === order.targetRegionId);
  const synergies = [];
  if (["screen", "interdict"].includes(order.missionId) && sameTargetOrders.some((candidate) => candidate.missionId === "recon")) {
    synergies.push("同地侦察为武装行动提供可靠方向");
  }
  if (["relief", "supply", "evacuation", "institutionMove"].includes(order.missionId) && sameTargetOrders.some((candidate) => candidate.missionId === "screen")) {
    synergies.push("同地掩护为非战斗任务争取转移窗口");
  }
  if (["supply", "evacuation", "institutionMove"].includes(order.missionId) && sameTargetOrders.some((candidate) => candidate.missionId === "liaison")) {
    synergies.push("交通站联络提高路线容量并降低暴露");
  }
  if (order.missionId === "screen" && sameTargetOrders.some((candidate) => ["relief", "evacuation", "institutionMove", "supply"].includes(candidate.missionId))) {
    synergies.push("本任务正在掩护同地工作编组");
  }
  return synergies;
}

export function GetActionPreview(game, missionIdOrOrder, regionId = null, formationId = null, stanceId = "balanced", fallbackRegionId = null) {
  const input = NormalizeOrderInput(missionIdOrOrder, regionId, formationId, stanceId, fallbackRegionId);
  const mission = actionDefinitions[input.missionId];
  const formation = game?.formations?.[input.formationId];
  const target = game?.regions?.[input.targetRegionId];
  const stance = stanceDefinitions[input.stanceId];
  const warnings = [];
  if (!game || game.phase !== "planning") warnings.push("当前不在规划阶段。");
  if (!mission) warnings.push("任务不存在。");
  if (!formation) warnings.push("必须先选择执行编组。");
  if (!target) warnings.push("目标地区不存在。");
  if (!stance) warnings.push("行动姿态不存在。");
  if (mission && formation && !formationDefinitions[formation.id].missionIds.includes(mission.id)) warnings.push("该编组不具备这项任务能力。");
  const invalidStationaryMove = mission?.id === "move" && formation?.regionId === target?.id;
  if (invalidStationaryMove) warnings.push("转移驻地必须离开编组当前所在地区。");
  let pathRouteIds = null;
  if (game && formation && target && mission) {
    pathRouteIds = FindMissionPath(game, formation, target.id, mission.id);
    if (pathRouteIds === null) warnings.push("目标不在本编组本回合可达范围，或交通边已经中断。");
  }
  let invalidFallback = false;
  if (mission?.requiresFallback) {
    if (!input.fallbackRegionId) {
      invalidFallback = true;
      warnings.push("这项任务必须指定相邻退路。");
    } else if (!target?.adjacentIds.includes(input.fallbackRegionId)) {
      invalidFallback = true;
      warnings.push("退路必须与任务地区相邻。");
    } else if (game && GetRouteState(game, target.id, input.fallbackRegionId)?.integrity < 20) {
      invalidFallback = true;
      warnings.push("所选退路已受严重封锁，不能作为可靠预案。");
    }
  }
  const costs = mission && stance ? GetMissionCosts(game, mission.id, stance.id) : GetEmptyCosts();
  const queuedCosts = game && formation ? GetQueuedCosts(game, formation.id) : GetEmptyCosts();
  const commandCost = mission?.commandCost || 0;
  const queuedCommandCost = game && formation ? GetQueuedCommandCost(game, formation.id) : 0;
  if (game) {
    for (const key of resourceKeys) {
      if (queuedCosts[key] + costs[key] > game.resources[key]) warnings.push(`${{ supply: "物资", organization: "组织", intelligence: "情报", trust: "信任" }[key]}不足。`);
    }
    if (queuedCommandCost + commandCost > game.commandPoints) warnings.push("本回合指挥能力不足。");
  }
  if (mission?.localCacheCost && target?.localCache < mission.localCacheCost) {
    warnings.push("当地缓存不足：任务仍可勉强展开，但效果会明显下降。先运输再执行可形成联动。 ");
  }
  if (mission?.id === "institutionMove" && target
    && !Object.values(game?.institutions || {}).some((institution) => institution.active && institution.regionId === target.id)) {
    warnings.push("目标地区没有可转移的运转机构。");
  }
  if (["relief", "supply", "evacuation", "institutionMove"].includes(mission?.id) && target) {
    const hasScreen = game?.queuedOrders.some((order) => order.targetRegionId === target.id && order.missionId === "screen");
    const confirmedTarget = game?.probedRegionIds.includes(target.id)
      && game.enemy.currentPlan.targets.some((enemyTarget) => enemyTarget.regionId === target.id);
    if (confirmedTarget && !hasScreen && !input.fallbackRegionId) warnings.push("已确认这里是主攻方向，非战斗任务缺少掩护或退路。");
  }
  if (mission?.id === "interdict" && !game?.probedRegionIds.includes(target?.id)
    && !game?.queuedOrders.some((order) => order.targetRegionId === target?.id && order.missionId === "recon")) {
    warnings.push("缺少本期可靠侦察：孤立迟滞只能产生有限效果，却仍会留下痕迹。");
  }
  const hypotheticalOrder = { ...input, pathRouteIds: pathRouteIds || [] };
  const hypotheticalOrders = game
    ? [...game.queuedOrders.filter((order) => order.formationId !== input.formationId), hypotheticalOrder]
    : [hypotheticalOrder];
  const synergies = GetOrderSynergies(hypotheticalOrders, hypotheticalOrder);
  const averageRouteIntegrity = pathRouteIds?.length
    ? pathRouteIds.reduce((sum, routeId) => sum + game.routes[routeId].integrity, 0) / pathRouteIds.length
    : 70;
  const readiness = formation && target && stance
    ? Clamp(formation.cohesion - formation.fatigue * 0.45 + target.network * 0.25 + averageRouteIntegrity * 0.18 + synergies.length * 12 - target.enemyControl * 0.18)
    : 0;
  const band = readiness >= 72 ? "准备充分" : readiness >= 52 ? "条件尚可" : "条件脆弱";
  const blockingWarning = invalidStationaryMove || invalidFallback || warnings.some((warning) => ["不存在", "必须先", "不具备", "不可达", "必须指定", "已经中断", "严重封锁", "没有可转移", "不足。"].some((token) => warning.includes(token)));
  return {
    valid: !blockingWarning,
    missionId: input.missionId,
    actionId: input.missionId,
    formationId: input.formationId,
    targetRegionId: input.targetRegionId,
    regionId: input.targetRegionId,
    stanceId: input.stanceId,
    fallbackRegionId: input.fallbackRegionId,
    pathRouteIds: pathRouteIds || [],
    costs,
    commandCost,
    readiness,
    successBand: band,
    riskLabel: stance?.id === "urgent" ? "高暴露" : stance?.id === "concealed" ? "低暴露" : "中等暴露",
    synergies,
    warnings,
    summary: `${band} · 指挥${commandCost}点${synergies.length ? ` · ${synergies.join("；")}` : " · 暂无组合支援"}`,
  };
}

export function QueueOrder(game, missionIdOrOrder, regionId = null, formationId = null, stanceId = "balanced", fallbackRegionId = null) {
  AssertPlanning(game);
  const input = NormalizeOrderInput(missionIdOrOrder, regionId, formationId, stanceId, fallbackRegionId);
  const preview = GetActionPreview(game, input);
  if (!preview.valid) throw new Error(preview.warnings.find((warning) => warning !== "当地缓存不足：任务仍可勉强展开，但效果会明显下降。先运输再执行可形成联动。 ") || "当前计划无法执行。");
  const nextGame = CloneValue(game);
  const order = {
    id: `order_${nextGame.turnIndex}_${input.formationId}`,
    missionId: input.missionId,
    actionId: input.missionId,
    formationId: input.formationId,
    targetRegionId: input.targetRegionId,
    regionId: input.targetRegionId,
    stanceId: input.stanceId,
    fallbackRegionId: input.fallbackRegionId,
    pathRouteIds: preview.pathRouteIds,
  };
  const existingIndex = nextGame.queuedOrders.findIndex((candidate) => candidate.formationId === input.formationId);
  if (existingIndex >= 0) nextGame.queuedOrders[existingIndex] = order;
  else nextGame.queuedOrders.push(order);
  nextGame.queuedOrders.sort((left, right) => left.formationId.localeCompare(right.formationId));
  return nextGame;
}

export function RemoveOrder(game, orderIdOrFormationId) {
  AssertPlanning(game);
  const nextGame = CloneValue(game);
  nextGame.queuedOrders = nextGame.queuedOrders.filter((order) => order.id !== orderIdOrFormationId && order.formationId !== orderIdOrFormationId);
  return nextGame;
}

export function ClearOrders(game) {
  AssertPlanning(game);
  const nextGame = CloneValue(game);
  nextGame.queuedOrders = [];
  return nextGame;
}

export function ChangePolicy(game, policyId) {
  AssertPlanning(game);
  const policy = policyDefinitions[policyId];
  if (!policy) throw new Error("未知的全局方针。");
  if (game.policyId === policyId) return CloneValue(game);
  if (game.policyCooldown > 0) throw new Error(`方针调整仍需等待${game.policyCooldown}个作战期。`);
  if (game.resources.organization < policy.switchCost) throw new Error("组织力不足，无法调整方针。");
  const nextGame = CloneValue(game);
  nextGame.resources.organization -= policy.switchCost;
  nextGame.policyId = policyId;
  nextGame.policyCooldown = policy.cooldownTurns;
  const costs = GetQueuedCosts(nextGame);
  if (resourceKeys.some((key) => costs[key] > nextGame.resources[key])) throw new Error("调整方针后现有计划资源不足，请先撤回部分任务。");
  return nextGame;
}

export function GetPlanAssessment(game) {
  if (!game) return { commandUsed: 0, commandAvailable: gameConfig.commandPointsPerTurn, synergies: [], gaps: [] };
  const synergies = Unique(game.queuedOrders.flatMap((order) => GetOrderSynergies(game.queuedOrders, order)));
  const brief = GetOperationalBrief(game);
  const gaps = [];
  for (const group of brief?.requiredMissionGroups || []) {
    const matchingOrder = game.queuedOrders.find((order) => group.includes(order.missionId) && brief.focusRegionIds.includes(order.targetRegionId));
    if (!matchingOrder) gaps.push(`重点地区尚未安排：${group.map((missionId) => actionDefinitions[missionId].name).join("或")}`);
  }
  for (const [leftGroup, rightGroup] of brief?.linkedMissionPairs || []) {
    const linked = game.queuedOrders.some((leftOrder) => leftGroup.includes(leftOrder.missionId)
      && brief.focusRegionIds.includes(leftOrder.targetRegionId)
      && game.queuedOrders.some((rightOrder) => rightOrder.formationId !== leftOrder.formationId
        && rightGroup.includes(rightOrder.missionId)
        && rightOrder.targetRegionId === leftOrder.targetRegionId));
    if (!linked) gaps.push(`尚未在同一重点地区形成${leftGroup.map((id) => actionDefinitions[id].name).join("/ ")}＋${rightGroup.map((id) => actionDefinitions[id].name).join("/ ")}联动`);
  }
  const minimumReserveCount = brief?.minimumReserveCount || (brief?.requiresReserve ? 1 : 0);
  if (minimumReserveCount && Object.keys(game.formations).length - game.queuedOrders.length < minimumReserveCount) {
    gaps.push(`本期目标要求至少保留${minimumReserveCount}支隐蔽预备编组。`);
  }
  if (brief?.forbidsUrgentInterdict && game.queuedOrders.some((order) => order.missionId === "interdict" && order.stanceId === "urgent")) gaps.push("紧急姿态迟滞会违背本期保存与纪律要求。");
  const connected = new Set(GetConnectedRegionIds(game));
  if (!brief?.corridorRegionIds.some((regionId) => connected.has(regionId))) gaps.push("本期指定交通方向目前未与阜平连通。");
  if (brief?.requiresTransportEast) {
    const transportOrder = game.queuedOrders.find((order) => order.formationId === "transportTeam");
    const projectedRegionId = transportOrder?.targetRegionId || game.formations.transportTeam.regionId;
    if (!["xinle", "xingtang", "quyang"].includes(projectedRegionId)) gaps.push("交通队尚未部署到东部接应入口。");
  }
  const focusedOrderCount = game.queuedOrders.filter((order) => brief?.focusRegionIds.includes(order.targetRegionId)).length;
  if (!focusedOrderCount) gaps.push("尚无编组进入本期重点地区。");
  return {
    commandUsed: GetQueuedCommandCost(game),
    commandAvailable: game.commandPoints,
    resourcesCommitted: GetQueuedCosts(game),
    synergies,
    gaps,
  };
}

function ApplyResourceChanges(game, changes) {
  for (const key of resourceKeys) {
    game.resources[key] = Clamp(game.resources[key] + Number(changes?.[key] || 0));
  }
}

function ApplyRegionChanges(game, regionId, changes) {
  const region = game.regions[regionId];
  if (!region) return;
  for (const key of regionValueKeys) {
    if (changes?.[key] == null) continue;
    const maximum = key === "localCache" ? 6 : 100;
    region[key] = Clamp(region[key] + Number(changes[key]), 0, maximum);
  }
}

function ApplyFormationChanges(game, formationId, changes) {
  const formation = game.formations[formationId];
  if (!formation) return;
  if (changes.regionId && game.regions[changes.regionId]) formation.regionId = changes.regionId;
  if (changes.cohesion != null) formation.cohesion = Clamp(formation.cohesion + Number(changes.cohesion));
  if (changes.fatigue != null) formation.fatigue = Clamp(formation.fatigue + Number(changes.fatigue));
}

function GetFormationReadiness(game, order, synergyCount) {
  const formation = game.formations[order.formationId];
  const target = game.regions[order.targetRegionId];
  const stance = stanceDefinitions[order.stanceId];
  const routeIntegrity = order.pathRouteIds.length
    ? order.pathRouteIds.reduce((sum, routeId) => sum + game.routes[routeId].integrity, 0) / order.pathRouteIds.length
    : 72;
  const recentMissionPenalty = formation.lastMissionId === order.missionId ? formation.repeatedMissionCount * 4 : 0;
  const confirmedKnowledge = game.probedRegionIds.includes(order.targetRegionId) ? 7 : 0;
  return Clamp(
    formation.cohesion
      - formation.fatigue * 0.48
      + target.network * 0.2
      + routeIntegrity * 0.16
      + synergyCount * 11
      + confirmedKnowledge
      - target.enemyControl * 0.16
      - recentMissionPenalty
      + (stance.id === "urgent" ? 5 : stance.id === "concealed" ? -2 : 0),
  );
}

function MarkRouteUse(game, routeId) {
  const route = game.routes[routeId];
  if (!route) return;
  route.consecutiveUses = [game.turnIndex, game.turnIndex - 1].includes(route.lastUsedTurn)
    ? route.consecutiveUses + 1
    : 1;
  route.lastUsedTurn = game.turnIndex;
  route.trace = Clamp(route.trace + 4 + route.consecutiveUses * 2);
}

function HasMissionAt(orders, targetRegionId, missionId) {
  return orders.some((order) => order.targetRegionId === targetRegionId && order.missionId === missionId);
}

function GetFallbackName(game, regionId) {
  return regionId ? game.regions[regionId]?.name || regionId : "原地隐蔽";
}

function ResolveMission(game, order, allOrders, priorReports, enemyPlan, delayByRegion, institutionChanges) {
  const mission = actionDefinitions[order.missionId];
  const formation = game.formations[order.formationId];
  const target = game.regions[order.targetRegionId];
  const stance = stanceDefinitions[order.stanceId];
  const originRegionId = formation.regionId;
  const costs = GetMissionCosts(game, order.missionId, order.stanceId);
  const successfulSupportReports = priorReports.filter((report) => report.success && report.regionId === order.targetRegionId);
  const synergies = [];
  if (["screen", "interdict"].includes(order.missionId) && successfulSupportReports.some((report) => report.missionId === "recon")) synergies.push("同地侦察为武装行动提供可靠方向");
  if (["relief", "supply", "evacuation", "institutionMove"].includes(order.missionId)
    && successfulSupportReports.some((report) => report.missionId === "screen")) synergies.push("同地掩护为非战斗任务争取转移窗口");
  if (["supply", "evacuation", "institutionMove"].includes(order.missionId)
    && successfulSupportReports.some((report) => report.missionId === "liaison")) synergies.push("交通站联络提高路线容量并降低暴露");
  if (order.missionId === "screen" && allOrders.some((candidate) => candidate.targetRegionId === order.targetRegionId
    && ["relief", "evacuation", "institutionMove", "supply"].includes(candidate.missionId))) synergies.push("本任务计划掩护同地工作编组");
  const readiness = GetFormationReadiness(game, order, synergies.length);
  const roll = Math.floor(HashRandom(game.seed, "mission", game.turnIndex, order.formationId, order.missionId) * 21) - 10;
  const enemyTarget = enemyPlan.targets.find((candidate) => candidate.regionId === order.targetRegionId);
  const routePressure = order.pathRouteIds.reduce((sum, routeId) => {
    const cut = enemyPlan.cutRoutes.find((candidate) => candidate.routeId === routeId);
    return sum + Number(cut?.pressure || 0);
  }, 0);
  const fallbackRouteId = order.fallbackRegionId ? GetRouteId(order.targetRegionId, order.fallbackRegionId) : null;
  const fallbackRoutePressure = fallbackRouteId
    ? Number(enemyPlan.cutRoutes.find((candidate) => candidate.routeId === fallbackRouteId)?.pressure || 0)
    : 0;
  const hasRouteSupport = successfulSupportReports.some((report) => ["liaison", "screen"].includes(report.missionId));
  const movementBlocked = (routePressure * stance.riskScale >= 5 || fallbackRoutePressure * stance.riskScale >= 5)
    && !hasRouteSupport
    && readiness + roll < 64;
  for (const key of resourceKeys) game.resources[key] = Clamp(game.resources[key] - costs[key]);
  for (const routeId of order.pathRouteIds) MarkRouteUse(game, routeId);

  const report = {
    orderId: order.id,
    formationId: formation.id,
    missionId: mission.id,
    regionId: target.id,
    title: `${formation.name} · ${target.name} · ${mission.name}`,
    tone: "neutral",
    success: true,
    effectiveness: 0,
    synergies,
    summary: "",
    changes: {},
  };

  if (movementBlocked) {
    ApplyFormationChanges(game, formation.id, { fatigue: 8, cohesion: -4 });
    ApplyFormationChanges(game, formation.id, { regionId: originRegionId });
    report.success = false;
    report.tone = "warn";
    report.summary = `既定进入路线或退路遭到封锁压力，${formation.name}留在${game.regions[originRegionId].name}隐蔽，没有穿越受阻地区强行展开任务。`;
    return report;
  }

  if (order.pathRouteIds.length) ApplyFormationChanges(game, formation.id, { regionId: target.id });
  let localCacheScale = 1;
  if (mission.localCacheCost) {
    if (target.localCache >= mission.localCacheCost) ApplyRegionChanges(game, target.id, { localCache: -mission.localCacheCost });
    else localCacheScale = 0.45;
  }
  const successfulScreenSupport = successfulSupportReports.some((report) => report.missionId === "screen");
  const pressurePenalty = enemyTarget && !successfulScreenSupport ? enemyTarget.intensity * 3 * stance.riskScale : 0;
  const rawEffectiveness = Clamp(readiness + roll - pressurePenalty, 20, 100);
  const effectiveness = Clamp(rawEffectiveness * stance.effectScale * localCacheScale, 15, 115);
  const effectScale = effectiveness / 70;
  report.effectiveness = Math.round(effectiveness);
  report.tone = effectiveness >= 70 ? "good" : effectiveness >= 48 ? "neutral" : "warn";
  report.success = effectiveness >= 42;
  const missionFatigue = { move: 5, recon: 6, liaison: 7, supply: 7, relief: 6, evacuation: 9, institutionMove: 10, screen: 10, interdict: 13 }[mission.id] || 6;

  if (!report.success) {
    if (mission.id === "move") ApplyFormationChanges(game, formation.id, { regionId: originRegionId });
    ApplyFormationChanges(game, formation.id, {
      fatigue: Math.max(3, Math.round(missionFatigue * 0.7)) + (stance.id === "urgent" ? 4 : 0),
      cohesion: -3,
    });
    ApplyRegionChanges(game, target.id, { exposure: Math.max(1, Math.round((mission.trace + stance.traceChange) * 0.55)) });
    if (formation.lastMissionId === mission.id) formation.repeatedMissionCount += 1;
    else formation.repeatedMissionCount = 1;
    formation.lastMissionId = mission.id;
    report.summary = `${formation.name}虽然抵近${target.name}，但准备、路线或地方条件不足，任务没有产生预定效果；编组转入隐蔽整顿。`;
    return report;
  }

  const policyBonus = {
    protect: ["screen", "evacuation", "institutionMove"].includes(mission.id) ? 1.16 : 1,
    guerrilla: ["move", "interdict"].includes(mission.id) ? 1.15 : 1,
    network: ["liaison", "recon"].includes(mission.id) ? 1.18 : 1,
    production: ["supply", "relief"].includes(mission.id) ? 1.16 : 1,
  }[game.policyId] || 1;
  const scaled = (base) => Math.max(1, Math.round(base * effectScale * policyBonus));

  if (mission.id === "move") {
    report.summary = `${formation.name}沿${order.pathRouteIds.length || 0}段交通线转移到${target.name}，为下一作战期预置位置。`;
  }
  if (mission.id === "recon") {
    const intelligenceGain = scaled(6);
    ApplyResourceChanges(game, { intelligence: intelligenceGain });
    ApplyRegionChanges(game, target.id, { protection: scaled(3), exposure: stance.id === "concealed" ? -2 : 1 });
    report.summary = `${formation.name}核对了${target.name}道路与据点征候；本期同地任务准备改善，并积累${intelligenceGain}点后续情报。`;
  }
  if (mission.id === "liaison") {
    const networkGain = scaled(8);
    ApplyRegionChanges(game, target.id, { network: networkGain, protection: scaled(3), exposure: 2 });
    for (const adjacentId of target.adjacentIds) {
      const route = GetRouteState(game, target.id, adjacentId);
      if (route) route.integrity = Clamp(route.integrity + scaled(9));
    }
    report.summary = `${formation.name}在${target.name}恢复分散交通站；当地网络提高${networkGain}，相邻路线获得修复。`;
  }
  if (mission.id === "supply") {
    const cacheGain = Math.max(1, Math.round(2 * effectScale * policyBonus));
    ApplyRegionChanges(game, target.id, { localCache: cacheGain, exposure: stance.id === "urgent" ? 4 : 2 });
    report.summary = `${formation.name}向${target.name}输送${cacheGain}份地方缓存；这些储备今后可用于救济、疏散或机构转移。`;
  }
  if (mission.id === "relief") {
    const safetyGain = scaled(8);
    ApplyRegionChanges(game, target.id, { safety: safetyGain, devastation: -scaled(5), protection: scaled(2) });
    ApplyResourceChanges(game, { trust: effectiveness >= 58 ? 2 : 1 });
    report.summary = localCacheScale < 1
      ? `${target.name}缺少地方缓存，工作队只能完成登记、互助和有限卫生协调；没有凭空产生物资。`
      : `${formation.name}利用当地缓存开展救济与生产恢复，${target.name}群众安全改善${safetyGain}。`;
  }
  if (mission.id === "evacuation") {
    const safetyGain = scaled(10);
    ApplyRegionChanges(game, target.id, { safety: safetyGain, exposure: -scaled(6), network: -3, protection: scaled(5) });
    ApplyRegionChanges(game, order.fallbackRegionId, { localCache: -1, exposure: 2 });
    ApplyFormationChanges(game, formation.id, { regionId: order.fallbackRegionId });
    report.summary = `${formation.name}从${target.name}分段转向${GetFallbackName(game, order.fallbackRegionId)}；原地联络暂弱，但避免把人员集中留在搜索方向。`;
  }
  if (mission.id === "institutionMove") {
    const candidates = Object.values(game.institutions)
      .filter((institution) => institution.active && institution.regionId === target.id)
      .sort((left, right) => left.health - right.health || left.id.localeCompare(right.id));
    const institution = candidates[0];
    if (!institution) {
      report.success = false;
      report.tone = "warn";
      report.effectiveness = 20;
      report.summary = `${target.name}当前没有可转移机构；交通队保存了路线，但本期机构转移目标未完成。`;
    } else {
      const fromRegionId = institution.regionId;
      institution.regionId = order.fallbackRegionId;
      // End-of-turn upkeep immediately advances one step. Starting at 2 leaves
      // the institution visibly and mechanically disrupted throughout next turn.
      institution.disruptedTurns = 2;
      institution.health = Clamp(institution.health - (stance.id === "urgent" ? 5 : 2));
      ApplyFormationChanges(game, formation.id, { regionId: order.fallbackRegionId });
      institutionChanges.push({ institutionId: institution.id, name: institution.name, fromRegionId, toRegionId: order.fallbackRegionId, disruptedTurns: 1 });
      report.summary = `${institution.name}由${target.name}分散转往${GetFallbackName(game, order.fallbackRegionId)}，下期暂时停摆；真实人员与番号不由玩家操纵。`;
    }
  }
  if (mission.id === "screen") {
    const protectionGain = scaled(11);
    const delayGain = Math.max(1, Math.round(effectScale * (synergies.length ? 3 : 2) * policyBonus));
    ApplyRegionChanges(game, target.id, { protection: protectionGain, exposure: scaled(5) });
    delayByRegion[target.id] = (delayByRegion[target.id] || 0) + delayGain;
    report.summary = `${formation.name}在${target.name}组织道路掩护，为同地转移与群众预警争取约${delayGain}级窗口；不统计歼敌数字。`;
  }
  if (mission.id === "interdict") {
    const reliableIntel = game.probedRegionIds.includes(target.id)
      || successfulSupportReports.some((supportReport) => supportReport.missionId === "recon");
    const onActualAxis = Boolean(enemyTarget) || enemyPlan.cutRoutes.some((cut) => {
      const route = game.routes[cut.routeId];
      return route.fromId === target.id || route.toId === target.id;
    });
    const delayGain = onActualAxis ? scaled(reliableIntel ? 3 : 1.4) : scaled(0.6);
    delayByRegion[target.id] = (delayByRegion[target.id] || 0) + delayGain;
    ApplyRegionChanges(game, target.id, { enemyControl: -scaled(onActualAxis ? 5 : 2), exposure: scaled(8), devastation: 1 });
    for (const adjacentId of target.adjacentIds) {
      const route = GetRouteState(game, target.id, adjacentId);
      if (route) route.integrity = Clamp(route.integrity - (reliableIntel ? 3 : 6));
    }
    report.summary = onActualAxis
      ? `${formation.name}迟滞了经过${target.name}的既定行动轴线，争取约${delayGain}级转移窗口；道路也需要后续修复。`
      : `${formation.name}未接触本期主要轴线，只造成有限巡查迟滞，却仍留下活动痕迹。`;
  }

  ApplyFormationChanges(game, formation.id, {
    fatigue: missionFatigue + (stance.id === "urgent" ? 5 : stance.id === "concealed" ? -2 : 0)
      + (game.policyId === "guerrilla" && formation.type === "armed" ? 2 : 0),
    cohesion: effectiveness < 45 ? -4 : effectiveness >= 78 ? 1 : 0,
  });
  ApplyRegionChanges(game, target.id, { exposure: mission.trace + stance.traceChange + (game.policyId === "guerrilla" && formation.type === "armed" ? 2 : 0) });
  if (formation.lastMissionId === mission.id) formation.repeatedMissionCount += 1;
  else formation.repeatedMissionCount = 1;
  formation.lastMissionId = mission.id;
  return report;
}

function ResolveEnemyOperations(game, enemyPlan, allOrders, orderReports, delayByRegion, institutionChanges) {
  const reports = [];
  const successfulReports = orderReports.filter((report) => report.success);
  for (const enemyTarget of enemyPlan.targets) {
    const region = game.regions[enemyTarget.regionId];
    const localDelay = delayByRegion[region.id] || 0;
    const adjustedPressure = Math.max(1, enemyTarget.intensity - Math.floor(localDelay));
    const hasScreen = successfulReports.some((report) => report.regionId === region.id && report.missionId === "screen");
    const mitigation = region.protection * 0.07 + (hasScreen ? 4 : 0);
    const safetyLoss = Math.max(1, Math.round(5 + adjustedPressure * 1.4 - mitigation));
    const networkLoss = Math.max(1, Math.round(2 + adjustedPressure * 0.8 - region.protection * 0.025));
    const devastationGain = Math.max(1, Math.round(1 + adjustedPressure * 0.75));
    const enemyControlGain = Math.max(1, Math.round(adjustedPressure * 0.7));
    ApplyRegionChanges(game, region.id, {
      safety: -safetyLoss,
      network: -networkLoss,
      devastation: devastationGain,
      enemyControl: enemyControlGain,
      protection: -Math.max(1, Math.round(adjustedPressure * 0.5)),
      exposure: Math.max(1, Math.round(adjustedPressure * 0.6)),
    });
    const formationConsequences = [];
    for (const formation of Object.values(game.formations).filter((candidate) => candidate.regionId === region.id)) {
      const order = allOrders.find((candidate) => candidate.formationId === formation.id);
      const fallbackRoute = order?.fallbackRegionId ? GetRouteState(game, region.id, order.fallbackRegionId) : null;
      const fallbackCutPressure = fallbackRoute
        ? Number(enemyPlan.cutRoutes.find((candidate) => candidate.routeId === fallbackRoute.id)?.pressure || 0)
        : 0;
      const canUseFallback = fallbackRoute?.integrity >= 20
        && (fallbackCutPressure < 4 || hasScreen || order?.stanceId === "concealed");
      if (order?.fallbackRegionId && canUseFallback && adjustedPressure >= 3) {
        const destinationName = game.regions[order.fallbackRegionId].name;
        ApplyFormationChanges(game, formation.id, { regionId: order.fallbackRegionId, fatigue: 4, cohesion: -2 });
        formationConsequences.push(`${formation.name}按预案转向${destinationName}`);
      } else {
        const cohesionLoss = Math.max(1, adjustedPressure * 2 - (hasScreen ? 3 : 0));
        ApplyFormationChanges(game, formation.id, { fatigue: adjustedPressure * 2, cohesion: -cohesionLoss });
        formationConsequences.push(`${formation.name}承受失联与疲劳压力`);
      }
    }
    for (const institution of Object.values(game.institutions).filter((candidate) => candidate.active && candidate.regionId === region.id)) {
      const healthLoss = Math.max(1, adjustedPressure * 2 - (hasScreen ? 3 : 0));
      institution.health = Clamp(institution.health - healthLoss);
      if (institution.health <= 15) institution.active = false;
      institutionChanges.push({ institutionId: institution.id, name: institution.name, healthChange: -healthLoss, regionId: region.id });
    }
    reports.push({
      regionId: region.id,
      title: `${region.name} · ${enemyPlan.doctrine}`,
      operation: enemyPlan.doctrine,
      summary: `${region.name}遭到既定${enemyPlan.doctrine}压力。此前迟滞${localDelay ? `将压力降低${Math.floor(localDelay)}级` : "未形成有效窗口"}；群众安全与地方网络仍承受侵略行动造成的损害。${formationConsequences.length ? ` ${formationConsequences.join("；")}。` : ""}`,
      changes: { safety: -safetyLoss, network: -networkLoss, devastation: devastationGain, enemyControl: enemyControlGain },
      previouslyKnowable: game.probedRegionIds.includes(region.id)
        ? "该方向在提交计划前已经核实。"
        : historicalTurns[game.turnIndex].pressureRegions.includes(region.id)
          ? "史实态势曾提供方向性征候，但本地目标没有被核实。"
          : "该方向只出现一般道路征候，未被可靠核实。",
    });
  }
  for (const cut of enemyPlan.cutRoutes) {
    const route = game.routes[cut.routeId];
    if (!route) continue;
    const endpointScreened = successfulReports.some((report) => report.missionId === "screen" && [route.fromId, route.toId].includes(report.regionId));
    const endpointLinked = successfulReports.some((report) => report.missionId === "liaison" && [route.fromId, route.toId].includes(report.regionId));
    const loss = Math.max(3, cut.pressure * 5 - (endpointScreened ? 6 : 0) - (endpointLinked ? 5 : 0));
    route.integrity = Clamp(route.integrity - loss);
    route.trace = Clamp(route.trace + cut.pressure * 2);
  }
  return reports;
}

function EvaluateObjective(game, orderReports, reservedFormationIds) {
  const brief = GetOperationalBrief(game);
  const successfulReports = orderReports.filter((report) => report.success);
  const successfulRegions = new Set(successfulReports.map((report) => report.regionId));
  const connected = new Set(GetConnectedRegionIds(game));
  const met = [];
  const missed = [];
  const criticalMissed = [];
  for (const group of brief.requiredMissionGroups || []) {
    const label = group.map((missionId) => actionDefinitions[missionId].name).join("或");
    const completed = successfulReports.some((report) => group.includes(report.missionId) && brief.focusRegionIds.includes(report.regionId));
    if (completed) met.push(`在重点地区完成${label}`);
    else {
      const message = `重点地区缺少${label}`;
      missed.push(message);
      criticalMissed.push(message);
    }
  }
  for (const [leftGroup, rightGroup] of brief.linkedMissionPairs || []) {
    const linked = successfulReports.some((leftReport) => leftGroup.includes(leftReport.missionId)
      && brief.focusRegionIds.includes(leftReport.regionId)
      && successfulReports.some((rightReport) => rightReport.formationId !== leftReport.formationId
        && rightGroup.includes(rightReport.missionId)
        && rightReport.regionId === leftReport.regionId));
    const label = `${leftGroup.map((id) => actionDefinitions[id].name).join("/")}＋${rightGroup.map((id) => actionDefinitions[id].name).join("/")}`;
    if (linked) met.push(`形成同地${label}联动`);
    else {
      const message = `未形成同地${label}联动`;
      missed.push(message);
      criticalMissed.push(message);
    }
  }
  if (brief.focusRegionIds.some((regionId) => successfulRegions.has(regionId))) met.push("编组进入本期重点地区并完成任务");
  else missed.push("重点地区没有完成有效任务");
  if (brief.corridorRegionIds.some((regionId) => connected.has(regionId))) met.push("至少一条指定交通方向保持连通");
  else {
    missed.push("指定交通方向与阜平失去有效连通");
    criticalMissed.push("指定交通方向与阜平失去有效连通");
  }
  if (brief.requiresReserve) {
    const minimumReserveCount = brief.minimumReserveCount || 1;
    if (reservedFormationIds.length >= minimumReserveCount) met.push(`保留了${minimumReserveCount}支隐蔽预备编组`);
    else {
      const message = `隐蔽预备不足${minimumReserveCount}支`;
      missed.push(message);
      criticalMissed.push(message);
    }
  }
  if (brief.forbidsUrgentInterdict) {
    const violated = game.queuedOrders.some((order) => order.missionId === "interdict" && order.stanceId === "urgent");
    if (violated) {
      missed.push("使用了不符合本期保存要求的紧急迟滞");
      criticalMissed.push("使用了不符合本期保存要求的紧急迟滞");
    }
    else met.push("没有以高暴露行动追逐战果");
  }
  if (brief.requiresTransportEast) {
    const transportRegionId = game.formations.transportTeam.regionId;
    if (["xinle", "xingtang", "quyang"].includes(transportRegionId) && connected.has(transportRegionId)) met.push("交通队抵达东部入口并保持连通");
    else {
      missed.push("交通队未能在有效走廊上抵达东部接应入口");
      criticalMissed.push("交通队未能在有效走廊上抵达东部接应入口");
    }
  }
  const success = criticalMissed.length === 0;
  return {
    turnIndex: game.turnIndex,
    title: brief.title,
    success,
    met,
    missed,
    summary: success ? "阶段责任基本完成，但地图上的后果仍会延续。" : "阶段责任未完全完成；走廊、机构或编组将承担后续压力。",
  };
}

function ApplyEndOfTurnRecovery(game, reservedFormationIds, objectiveResult) {
  const reservedSet = new Set(reservedFormationIds);
  for (const formation of Object.values(game.formations)) {
    const isReserve = reservedSet.has(formation.id);
    const recovery = isReserve
      ? game.policyId === "guerrilla" && formation.type === "armed" ? 11 : 14
      : 4;
    ApplyFormationChanges(game, formation.id, {
      fatigue: -recovery,
      cohesion: isReserve ? 5 : 1,
    });
    if (isReserve) {
      ApplyRegionChanges(game, formation.regionId, { exposure: -4, protection: 2 });
      formation.repeatedMissionCount = Math.max(0, formation.repeatedMissionCount - 1);
    }
  }
  const connectedCount = GetConnectedRegionIds(game).length;
  const operationalRadio = game.institutions.radio.active && game.institutions.radio.disruptedTurns <= 0;
  const supplyRecovery = Math.max(0, 1 + Math.floor(connectedCount / 4) + (game.policyId === "production" ? 5 : 0) - (game.policyId === "protect" ? 1 : 0));
  const organizationRecovery = 2 + Math.min(3, reservedFormationIds.length);
  const intelligenceRecovery = operationalRadio ? 3 : 1;
  ApplyResourceChanges(game, {
    supply: supplyRecovery,
    organization: organizationRecovery,
    intelligence: intelligenceRecovery,
    trust: objectiveResult.success ? 2 : -4,
  });
  if (game.policyId === "production") {
    ApplyRegionChanges(game, "fuping", { localCache: 1, devastation: -2 });
  }
  for (const institution of Object.values(game.institutions)) {
    if (institution.disruptedTurns > 0) institution.disruptedTurns -= 1;
  }
  if (game.policyCooldown > 0) game.policyCooldown -= 1;
  for (const route of Object.values(game.routes)) {
    if (route.lastUsedTurn !== game.turnIndex) {
      route.trace = Clamp(route.trace - 3);
      route.consecutiveUses = 0;
    }
  }
}

function UpdateEnemyObservation(game) {
  for (const region of Object.values(game.regions)) {
    const repeatedRouteTrace = Object.values(game.routes)
      .filter((route) => route.fromId === region.id || route.toId === region.id)
      .reduce((sum, route) => sum + Math.max(0, route.consecutiveUses - 1) * 2, 0);
    game.enemy.observedPatterns[region.id] = Clamp(
      game.enemy.observedPatterns[region.id] * 0.55 + region.exposure * 0.3 + repeatedRouteTrace,
    );
  }
}

function GetResourceDifference(before, after) {
  return Object.fromEntries(resourceKeys.map((key) => [key, after[key] - before[key]]));
}

export function CommitTurn(game) {
  AssertPlanning(game);
  if (game.selectedEventOptionId !== "briefed") throw new Error("请先接收本期史实简报。");
  const invariant = CheckInvariants(game);
  if (!invariant.valid) throw new Error(`状态不合法：${invariant.errors.join("；")}`);
  const nextGame = CloneValue(game);
  const resourcesBefore = CloneValue(nextGame.resources);
  const enemyPlan = CloneValue(nextGame.enemy.currentPlan);
  const enemyFingerprint = enemyPlan.planFingerprint;
  const delayByRegion = {};
  const institutionChanges = [];
  const allOrders = [...nextGame.queuedOrders].sort((left, right) => (
    actionDefinitions[left.missionId].phase - actionDefinitions[right.missionId].phase
      || left.formationId.localeCompare(right.formationId)
  ));
  const reservedFormationIds = Object.keys(nextGame.formations).filter((formationId) => !allOrders.some((order) => order.formationId === formationId));
  const orderReports = [];
  for (const order of allOrders) {
    orderReports.push(ResolveMission(nextGame, order, allOrders, orderReports, enemyPlan, delayByRegion, institutionChanges));
  }
  if (nextGame.enemy.currentPlan.planFingerprint !== enemyFingerprint) throw new Error("敌方计划在结算中被意外改写。");
  const enemyReports = ResolveEnemyOperations(nextGame, enemyPlan, allOrders, orderReports, delayByRegion, institutionChanges);
  const objectiveResult = EvaluateObjective(nextGame, orderReports, reservedFormationIds);
  nextGame.objectiveResults.push(CloneValue(objectiveResult));
  ApplyEndOfTurnRecovery(nextGame, reservedFormationIds, objectiveResult);
  UpdateEnemyObservation(nextGame);

  const disconnectedCount = regionDefinitions.length - GetConnectedRegionIds(nextGame).length;
  const inactiveInstitutions = Object.values(nextGame.institutions).filter((institution) => !institution.active).length;
  const criticalRegions = Object.values(nextGame.regions).filter((region) => region.safety < 28 || region.network < 24).length;
  const warnings = [];
  if (disconnectedCount >= 6) warnings.push(`${disconnectedCount}个地区暂时无法沿有效隐蔽网络连接阜平。`);
  if (criticalRegions >= 4) warnings.push(`${criticalRegions}个地区的群众安全或地方网络已进入严重压力。`);
  if (inactiveInstitutions) warnings.push(`${inactiveInstitutions}处机构已经停摆，需要保存骨干并恢复运转。`);
  if (!objectiveResult.success) warnings.push("本期阶段责任未完全完成，下一阶段不会自动补偿。 ");

  const turn = historicalTurns[nextGame.turnIndex];
  const resolution = {
    turnIndex: nextGame.turnIndex,
    date: turn.date,
    title: turn.title,
    event: { optionId: "briefed", label: "固定史实简报" },
    orders: orderReports,
    enemy: enemyReports,
    objective: objectiveResult,
    reservedFormationIds,
    enemyPlanFingerprint: enemyFingerprint,
    institutionChanges,
    resourceChanges: GetResourceDifference(resourcesBefore, nextGame.resources),
    warnings,
    summary: `敌方计划在玩家下令前已经锁定。${objectiveResult.summary} ${reservedFormationIds.length ? `${reservedFormationIds.length}支未出动编组完成隐蔽休整。` : "全部编组均已出动，没有留下预备力量。"}`,
  };
  nextGame.history.push(CloneValue(resolution));
  nextGame.logs.push({ text: `${turn.displayDate}：${objectiveResult.success ? "阶段责任基本完成" : "阶段责任未完全完成"}。`, tone: objectiveResult.success ? "good" : "warn" });
  for (const warning of warnings) nextGame.logs.push({ text: warning, tone: "warn" });
  nextGame.logs = nextGame.logs.slice(-36);
  nextGame.lastResolution = resolution;
  nextGame.turnIndex += 1;
  nextGame.queuedOrders = [];
  nextGame.probedRegionIds = [];
  nextGame.selectedEventOptionId = null;
  if (nextGame.turnIndex >= historicalTurns.length) {
    nextGame.phase = "ended";
    nextGame.outcome = {
      nationalOutcomeFixed: true,
      nationalOutcome: gameConfig.nationalOutcome,
      localAssessment: "本局只评估群众保护、交通网络、机构运转、编组保存和固定接应责任。",
    };
  } else {
    nextGame.enemy.currentPlan = GenerateEnemyPlan(nextGame, nextGame.turnIndex);
  }
  return nextGame;
}

function GetAverage(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function GetBottomQuartile(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const count = Math.max(1, Math.ceil(sorted.length / 4));
  return GetAverage(sorted.slice(0, count));
}

export function GetCampaignScore(game) {
  const safetyValues = regionDefinitions.map((definition) => game.regions[definition.id].safety);
  const safety = Clamp(GetAverage(safetyValues) * 0.45 + GetBottomQuartile(safetyValues) * 0.55);
  const connectedCount = GetConnectedRegionIds(game).length;
  const network = Clamp(connectedCount / regionDefinitions.length * 100);
  const institutionValues = Object.keys(institutionDefinitions).map((institutionId) => game.institutions[institutionId]).map((institution) => (
    institution.active ? institution.health * (institution.disruptedTurns > 0 ? 0.55 : 1) : 0
  ));
  const institutions = Clamp(GetAverage(institutionValues));
  const readinessValues = Object.keys(formationDefinitions).map((formationId) => game.formations[formationId]).map((formation) => Clamp(formation.cohesion - formation.fatigue * 0.35));
  const readiness = Clamp(GetAverage(readinessValues));
  const successfulObjectives = game.objectiveResults.filter((result, index) => result.success
    && result.turnIndex === index
    && result.title === historicalTurns[index]?.objective?.title).length;
  const transportRegionId = game.formations.transportTeam.regionId;
  const finalCorridor = ["xinle", "xingtang", "quyang"].includes(transportRegionId)
    && GetConnectedRegionIds(game).includes(transportRegionId);
  const duties = Clamp(successfulObjectives / historicalTurns.length * 80 + (finalCorridor ? 20 : 0));
  // 阶段责任是这套游戏的“胜利点”：休整能够保存编组，却不能替代接应、
  // 掩护和交通线工作。降低单纯满状态编组的权重，避免零命令成为最优解。
  const total = Round(safety * 0.3 + network * 0.2 + institutions * 0.2 + readiness * 0.05 + duties * 0.25, 1);
  const assessmentTotal = Math.round(total);
  const label = assessmentTotal >= 62 && finalCorridor
    ? "在困境中维系了接应网络"
    : assessmentTotal >= 52
      ? "保存骨干，仍可接续"
      : assessmentTotal >= 44
        ? "局部体系严重吃紧"
        : "多条联系中断，艰难维持";
  return {
    total,
    label,
    summary: `十二个作战期中完成${successfulObjectives}项阶段责任；结局时与阜平保持有效网络连通的地区共${connectedCount}个；东部接应走廊${finalCorridor ? "保持有效" : "未能按计划形成"}。全国抗战史实结局不由此评分改写。`,
    components: { safety, network, institutions, readiness, duties },
    successfulObjectives,
    finalCorridor,
  };
}

export function SerializeGame(game) {
  const invariant = CheckInvariants(game);
  if (!invariant.valid) throw new Error(`无法保存非法状态：${invariant.errors.join("；")}`);
  return JSON.stringify(game);
}

export function DeserializeGame(serialized) {
  const parsed = typeof serialized === "string" ? JSON.parse(serialized) : CloneValue(serialized);
  if (parsed?.saveVersion !== gameConfig.saveVersion) throw new Error("这是旧版数值点选规则的存档，不能直接迁入新的空间编组规则。请开始新战役。");
  const invariant = CheckInvariants(parsed);
  if (!invariant.valid) throw new Error(`存档状态不合法：${invariant.errors.join("；")}`);
  return parsed;
}

export function CheckInvariants(game) {
  const errors = [];
  if (!game || typeof game !== "object") return { valid: false, errors: ["状态不是对象"] };
  if (game.saveVersion !== gameConfig.saveVersion) errors.push("存档版本不匹配");
  if (!Number.isInteger(game.turnIndex) || game.turnIndex < 0 || game.turnIndex > historicalTurns.length) errors.push("回合索引越界");
  if (!["planning", "ended"].includes(game.phase)) errors.push("阶段状态非法");
  if (!policyDefinitions[game.policyId]) errors.push("全局方针非法");
  if (!Number.isInteger(game.policyCooldown) || game.policyCooldown < 0 || game.policyCooldown > 3) errors.push("方针冷却非法");
  if (game.commandPoints !== gameConfig.commandPointsPerTurn) errors.push("指挥能力被篡改");
  if (![null, "briefed"].includes(game.selectedEventOptionId)) errors.push("简报状态非法");
  if (!resourceKeys.every((key) => Number.isFinite(game.resources?.[key]) && game.resources[key] >= 0 && game.resources[key] <= 100)) errors.push("资源数值越界");
  const regionIds = regionDefinitions.map((definition) => definition.id).sort();
  if (JSON.stringify(Object.keys(game.regions || {}).sort()) !== JSON.stringify(regionIds)) errors.push("地区集合被篡改");
  for (const definition of regionDefinitions) {
    const region = game.regions?.[definition.id];
    if (!region) {
      errors.push(`缺少地区${definition.id}`);
      continue;
    }
    for (const key of regionValueKeys) {
      const maximum = key === "localCache" ? 6 : 100;
      if (!Number.isFinite(region[key]) || region[key] < 0 || region[key] > maximum) errors.push(`${definition.id}.${key}越界`);
    }
    if (JSON.stringify([...region.adjacentIds].sort()) !== JSON.stringify([...definition.adjacentIds].sort())) errors.push(`${definition.id}邻接关系被篡改`);
  }
  const routeIds = Object.keys(routeDefinitions).sort();
  if (JSON.stringify(Object.keys(game.routes || {}).sort()) !== JSON.stringify(routeIds)) errors.push("交通边集合被篡改");
  for (const definition of Object.values(routeDefinitions)) {
    const route = game.routes?.[definition.id];
    if (!route || !Number.isFinite(route.integrity) || route.integrity < 0 || route.integrity > 100
      || !Number.isFinite(route.trace) || route.trace < 0 || route.trace > 100
      || !Number.isInteger(route.consecutiveUses) || route.consecutiveUses < 0
      || route.fromId !== definition.fromId || route.toId !== definition.toId) errors.push(`交通边${definition.id}非法`);
  }
  const formationIds = Object.keys(formationDefinitions).sort();
  if (JSON.stringify(Object.keys(game.formations || {}).sort()) !== JSON.stringify(formationIds)) errors.push("编组集合被篡改");
  for (const definition of Object.values(formationDefinitions)) {
    const formation = game.formations?.[definition.id];
    if (!formation || !game.regions?.[formation.regionId]) errors.push(`编组${definition.id}位置非法`);
    else if (![formation.cohesion, formation.fatigue].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) errors.push(`编组${definition.id}状态越界`);
    else if (formation.type !== definition.type || formation.id !== definition.id) errors.push(`编组${definition.id}类型非法`);
  }
  const institutionIds = Object.keys(institutionDefinitions).sort();
  if (JSON.stringify(Object.keys(game.institutions || {}).sort()) !== JSON.stringify(institutionIds)) errors.push("机构集合被篡改");
  for (const definition of Object.values(institutionDefinitions)) {
    const institution = game.institutions?.[definition.id];
    if (!institution || !game.regions?.[institution.regionId]
      || !Number.isFinite(institution.health) || institution.health < 0 || institution.health > 100
      || typeof institution.active !== "boolean"
      || !Number.isInteger(institution.disruptedTurns) || institution.disruptedTurns < 0 || institution.disruptedTurns > 2) errors.push(`机构${definition.id}非法`);
  }
  if (!Array.isArray(game.objectiveResults) || !Array.isArray(game.history)
    || game.objectiveResults.length !== game.turnIndex || game.history.length !== game.turnIndex) errors.push("历史与阶段责任长度非法");
  for (let index = 0; index < (game.objectiveResults || []).length; index += 1) {
    const result = game.objectiveResults[index];
    if (result.turnIndex !== index || typeof result.success !== "boolean" || !Array.isArray(result.met) || !Array.isArray(result.missed)) errors.push(`第${index + 1}期责任记录非法`);
  }
  if (!Array.isArray(game.probedRegionIds) || game.probedRegionIds.length > 3
    || new Set(game.probedRegionIds).size !== game.probedRegionIds.length
    || game.probedRegionIds.some((regionId) => !game.regions?.[regionId])) errors.push("核实情报记录非法");
  const queuedFormationIds = new Set();
  let commandCost = 0;
  const queuedCosts = GetEmptyCosts();
  for (const order of game.queuedOrders || []) {
    if (!formationDefinitions[order.formationId] || !actionDefinitions[order.missionId] || !game.regions?.[order.targetRegionId]
      || !stanceDefinitions[order.stanceId]) {
      errors.push("计划包含未知对象");
      continue;
    }
    if (queuedFormationIds.has(order.formationId)) errors.push(`编组${order.formationId}被重复下令`);
    queuedFormationIds.add(order.formationId);
    if (!formationDefinitions[order.formationId].missionIds.includes(order.missionId)) errors.push(`编组${order.formationId}能力非法`);
    commandCost += actionDefinitions[order.missionId]?.commandCost || 0;
    AddCosts(queuedCosts, GetMissionCosts(game, order.missionId, order.stanceId));
    const preview = GetActionPreview(game, order);
    if (!preview.valid) errors.push(`计划${order.id}不满足路线、退路或任务约束`);
    if (JSON.stringify(order.pathRouteIds || []) !== JSON.stringify(preview.pathRouteIds || [])) errors.push(`计划${order.id}路线被篡改`);
  }
  if (commandCost > gameConfig.commandPointsPerTurn) errors.push("计划超过指挥能力");
  if (resourceKeys.some((key) => queuedCosts[key] > game.resources[key])) errors.push("计划超过可用资源");
  if (game.phase === "planning") {
    if (!game.enemy?.currentPlan || game.enemy.currentPlan.createdForTurn !== game.turnIndex) errors.push("当前敌方计划未提前锁定");
    const plan = game.enemy?.currentPlan;
    const expectedTargetCount = historicalTurns[game.turnIndex]?.intensity >= 5 ? 3 : historicalTurns[game.turnIndex]?.intensity >= 3 ? 2 : 1;
    if (!Array.isArray(plan?.targets) || plan.targets.length !== expectedTargetCount
      || new Set(plan.targets.map((target) => target.regionId)).size !== plan.targets.length
      || plan.targets.some((target) => !game.regions[target.regionId] || !Number.isInteger(target.intensity) || target.intensity < 1 || target.intensity > 6)) errors.push("敌方目标结构非法");
    if (!Array.isArray(plan?.cutRoutes) || plan.cutRoutes.length > expectedTargetCount
      || plan.cutRoutes.some((cut) => !game.routes[cut.routeId] || !Number.isFinite(cut.pressure) || cut.pressure < 1 || cut.pressure > 6)) errors.push("敌方封锁路线非法");
    if (!["纵深搜索", "道路封锁", "据点推进"].includes(plan?.doctrine)) errors.push("敌方行动类型非法");
    const expectedFingerprint = plan ? GetPlanFingerprint(game.seed, game.turnIndex, plan.doctrine, plan.targets, plan.cutRoutes) : NaN;
    if (!Number.isFinite(plan?.planFingerprint) || plan.planFingerprint !== expectedFingerprint) errors.push("敌方计划指纹不匹配");
  }
  if (game.phase === "ended" && game.turnIndex !== historicalTurns.length) errors.push("结束状态回合不正确");
  return { valid: errors.length === 0, errors };
}

function GetCandidateTargets(game, formation, missionId, preferredRegionIds) {
  const reachable = Object.keys(game.regions).filter((regionId) => FindMissionPath(game, formation, regionId, missionId) !== null);
  return [...reachable].sort((leftId, rightId) => {
    const leftPreferred = preferredRegionIds.includes(leftId) ? 1 : 0;
    const rightPreferred = preferredRegionIds.includes(rightId) ? 1 : 0;
    const leftNeed = 100 - game.regions[leftId].safety + 100 - game.regions[leftId].network;
    const rightNeed = 100 - game.regions[rightId].safety + 100 - game.regions[rightId].network;
    return rightPreferred - leftPreferred || rightNeed - leftNeed || leftId.localeCompare(rightId);
  });
}

const eastwardRegionValues = Object.freeze({
  lingqiu: -1,
  laiyuan: -1,
  wutai: -1,
  fuping: 0,
  pingshan: 0,
  yixian: 1,
  tangxian: 2,
  lingshou: 2,
  jingxing: 3,
  quyang: 4,
  xingtang: 5,
  xinle: 6,
});

function GetFallbackForOrder(game, targetRegionId, formationId = null) {
  return [...game.regions[targetRegionId].adjacentIds]
    .filter((regionId) => GetRouteState(game, targetRegionId, regionId)?.integrity >= 20)
    .sort((leftId, rightId) => {
      const left = game.regions[leftId];
      const right = game.regions[rightId];
      const routeLeft = GetRouteState(game, targetRegionId, leftId);
      const routeRight = GetRouteState(game, targetRegionId, rightId);
      const transportBias = formationId === "transportTeam" && game.turnIndex >= 2 ? 8 : 0;
      const leftScore = left.safety + left.network - left.enemyControl + routeLeft.integrity * 0.4
        + (eastwardRegionValues[leftId] || 0) * transportBias;
      const rightScore = right.safety + right.network - right.enemyControl + routeRight.integrity * 0.4
        + (eastwardRegionValues[rightId] || 0) * transportBias;
      return rightScore - leftScore || leftId.localeCompare(rightId);
    })[0] || null;
}

function GetAutoTargetNeed(game, missionId, targetRegionId) {
  const target = game.regions[targetRegionId];
  if (["screen", "recon", "evacuation", "interdict"].includes(missionId)) {
    return (100 - target.safety) * 0.16 + target.enemyControl * 0.08;
  }
  if (missionId === "liaison") return (100 - target.network) * 0.2;
  if (missionId === "relief") return (100 - target.safety) * 0.2 + (target.localCache ? 5 : -12);
  if (missionId === "supply") return (6 - target.localCache) * 2 + (100 - target.safety) * 0.06;
  return 0;
}

function GetAutoCandidates(game, missionIds, preferredRegionIds, strategy, fixedTargetRegionId = null, requiredFormationId = null) {
  const candidates = [];
  const usedFormationIds = new Set(game.queuedOrders.map((order) => order.formationId));
  const formationIds = requiredFormationId ? [requiredFormationId] : Object.keys(game.formations);
  for (const formationId of formationIds) {
    if (usedFormationIds.has(formationId)) continue;
    const formation = game.formations[formationId];
    for (let missionIndex = 0; missionIndex < missionIds.length; missionIndex += 1) {
      const missionId = missionIds[missionIndex];
      if (!formationDefinitions[formationId].missionIds.includes(missionId)) continue;
      const targetIds = fixedTargetRegionId
        ? [fixedTargetRegionId]
        : GetCandidateTargets(game, formation, missionId, preferredRegionIds);
      for (const targetRegionId of targetIds) {
        if (!preferredRegionIds.includes(targetRegionId)) continue;
        const fallbackRegionId = actionDefinitions[missionId].requiresFallback
          ? GetFallbackForOrder(game, targetRegionId, formationId)
          : null;
        const input = { formationId, missionId, targetRegionId, stanceId: "balanced", fallbackRegionId };
        const preview = GetActionPreview(game, input);
        if (!preview.valid) continue;
        const target = game.regions[targetRegionId];
        const confirmedTarget = game.probedRegionIds.includes(targetRegionId)
          && game.enemy.currentPlan.targets.some((enemyTarget) => enemyTarget.regionId === targetRegionId);
        const missionFit = strategy === "network" && ["liaison", "recon", "supply"].includes(missionId)
          ? 7
          : strategy === "protection" && ["screen", "relief", "evacuation"].includes(missionId)
            ? 7
            : 0;
        const supportFit = confirmedTarget && ["screen", "recon", "interdict"].includes(missionId) ? 8 : 0;
        const transportProgress = formationId === "transportTeam" && game.turnIndex >= 2
          ? (eastwardRegionValues[fallbackRegionId || targetRegionId] || 0) * 3
          : 0;
        const institutionFit = formationId === "transportTeam" && missionId === "institutionMove" && game.turnIndex >= 2 ? 36 : 0;
        const score = preview.readiness
          + GetAutoTargetNeed(game, missionId, targetRegionId)
          + preview.synergies.length * 11
          + missionFit
          + supportFit
          + transportProgress
          + institutionFit
          - preview.pathRouteIds.length * 4
          - formation.fatigue * 0.12
          - (formation.lastMissionId === missionId ? formation.repeatedMissionCount * 7 : 0)
          - missionIndex * 1.5
          - target.exposure * 0.04;
        candidates.push({ input, preview, score });
      }
    }
  }
  return candidates.sort((left, right) => right.score - left.score
    || left.input.formationId.localeCompare(right.input.formationId)
    || left.input.missionId.localeCompare(right.input.missionId)
    || left.input.targetRegionId.localeCompare(right.input.targetRegionId));
}

function TryAutoQueueGroup(game, missionIds, preferredRegionIds, strategy, fixedTargetRegionId = null, requiredFormationId = null) {
  for (const candidate of GetAutoCandidates(game, missionIds, preferredRegionIds, strategy, fixedTargetRegionId, requiredFormationId)) {
    try {
      return QueueOrder(game, candidate.input);
    } catch {
      continue;
    }
  }
  return game;
}

function TryAutoQueueLinkedPair(game, leftMissionIds, rightMissionIds, preferredRegionIds, strategy, requiredLeftFormationId = null) {
  let best = null;
  for (const targetRegionId of preferredRegionIds) {
    const leftCandidates = GetAutoCandidates(game, leftMissionIds, preferredRegionIds, strategy, targetRegionId, requiredLeftFormationId);
    for (const leftCandidate of leftCandidates) {
      let withLeft;
      try {
        withLeft = QueueOrder(game, leftCandidate.input);
      } catch {
        continue;
      }
      const rightCandidates = GetAutoCandidates(withLeft, rightMissionIds, preferredRegionIds, strategy, targetRegionId);
      for (const rightCandidate of rightCandidates) {
        let withPair;
        try {
          withPair = QueueOrder(withLeft, rightCandidate.input);
        } catch {
          continue;
        }
        const pairScore = leftCandidate.score + rightCandidate.score + rightCandidate.preview.synergies.length * 14;
        if (!best || pairScore > best.score) best = { game: withPair, score: pairScore };
      }
    }
  }
  return best?.game || game;
}

function IsAutoGroupQueued(game, missionIds, preferredRegionIds) {
  return game.queuedOrders.some((order) => missionIds.includes(order.missionId) && preferredRegionIds.includes(order.targetRegionId));
}

export function AutoPlayTurn(game, strategy = "balanced") {
  if (game.phase === "ended") return CloneValue(game);
  let nextGame = CloneValue(game);
  if (nextGame.selectedEventOptionId !== "briefed") nextGame = ChooseEventOption(nextGame, "briefed");
  const brief = GetOperationalBrief(nextGame);
  if (strategy === "network" && nextGame.turnIndex === 0 && nextGame.policyId !== "network") {
    nextGame = ChangePolicy(nextGame, "network");
  }
  if (strategy === "balanced" && nextGame.turnIndex >= 6 && nextGame.resources.supply < 28
    && nextGame.policyId !== "production" && nextGame.policyCooldown === 0) {
    nextGame = ChangePolicy(nextGame, "production");
  }
  if (nextGame.resources.intelligence >= 12 && nextGame.probedRegionIds.length === 0) {
    const forecast = GetEnemyForecast(nextGame);
    const signaledFocus = forecast.targets.find((signal) => brief.focusRegionIds.includes(signal.regionId));
    const probeTarget = signaledFocus?.regionId
      || brief.focusRegionIds[HashNumber(nextGame.seed, "autoprobe", nextGame.turnIndex, strategy) % brief.focusRegionIds.length];
    const preview = GetProbePreview(nextGame, probeTarget);
    if (preview.valid) nextGame = ProbeRegion(nextGame, probeTarget);
  }
  for (const [leftMissionIds, rightMissionIds] of brief.linkedMissionPairs || []) {
    const requiredLeftFormationId = brief.requiresTransportEast ? "transportTeam" : null;
    nextGame = TryAutoQueueLinkedPair(nextGame, leftMissionIds, rightMissionIds, brief.focusRegionIds, strategy, requiredLeftFormationId);
  }
  for (const missionIds of brief.requiredMissionGroups || []) {
    if (IsAutoGroupQueued(nextGame, missionIds, brief.focusRegionIds)) continue;
    nextGame = TryAutoQueueGroup(nextGame, missionIds, brief.focusRegionIds, strategy);
  }
  const targetOrderCount = nextGame.resources.supply >= 24 && nextGame.resources.organization >= 24
    ? strategy === "balanced" ? 2 : 3
    : nextGame.queuedOrders.length;
  const fillerMissions = strategy === "network"
    ? ["liaison", "recon", "supply"]
    : strategy === "protection"
      ? ["screen", "relief", "recon"]
      : ["recon", "liaison", "screen", "supply", "relief"];
  while (nextGame.queuedOrders.length < targetOrderCount && GetQueuedCommandCost(nextGame) < nextGame.commandPoints) {
    const previousCount = nextGame.queuedOrders.length;
    nextGame = TryAutoQueueGroup(nextGame, fillerMissions, brief.focusRegionIds, strategy);
    if (nextGame.queuedOrders.length === previousCount) break;
  }
  return CommitTurn(nextGame);
}

export function GetCurrentTurn(game) {
  return historicalTurns[game?.turnIndex] || null;
}

export function GetInstitutionDefinitions() {
  return CloneValue(institutionDefinitions);
}
