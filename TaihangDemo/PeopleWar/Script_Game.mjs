import {
  ACTION_DEFINITIONS,
  CFG,
  CONNECTION_DEFINITIONS,
  ROUTE_DEFINITIONS,
  TURN_DEFINITIONS,
  VILLAGE_DEFINITIONS,
  CalculateOutcome,
  CreateInitialState,
  GetActionAvailability,
  GetEnemyIntentPreview,
  GetPlanningSummary,
  GetTutorialStep,
  QueueAction,
  RemovePlan,
  ResolveTurn,
} from "./Script_Rules.mjs";

const SAVE_KEY = "taihangdemo_peoplewar_save_v1";
const TUTORIAL_KEY = "taihangdemo_peoplewar_tutorial_v1";
const SAVE_VERSION = 1;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const INTEL_VISIBILITY_THRESHOLDS = Object.freeze({ partial: 1, estimated: 4, exact: 8 });
const ORGANIZATION_NAMES = ["无组织", "可靠联络", "秘密支部", "巩固网络"];
const ENEMY_KIND_NAMES = {
  Patrol: "武装巡逻",
  Requisition: "强征粮食",
  Search: "清乡搜捕",
  Sweep: "军事扫荡",
};
const ENEMY_KIND_ICONS = {
  Patrol: "巡",
  Requisition: "征",
  Search: "搜",
  Sweep: "扫",
};
const SITE_DEFINITIONS = [
  { id: "CountyTown", name: "敌占县城", short: "城", x: 93, y: 15 },
  { id: "EastBlockhouse", name: "东关炮楼", short: "楼", x: 90, y: 43 },
  { id: "RailFort", name: "铁路堡", short: "铁", x: 76, y: 7 },
];
const PHASE_NAMES = [
  { through: 3, name: "救济扎根" },
  { through: 6, name: "敌情逼近" },
  { through: 9, name: "封锁收紧" },
  { through: 12, name: "铁壁合围" },
  { through: 14, name: "保存火种" },
];
const PHASE_OBJECTIVES = [
  "先把受难家庭救下来，再把新的村庄接进地下交通网。",
  "看清敌军的征粮与搜索方向，提前藏粮疏散，不跟优势兵力硬拼。",
  "敌人按证据收紧封锁；清理痕迹、让纵队扑空，并破坏它的交通补给。",
  "群众组织已经成为抵抗主体：预警、藏粮、担架队和地道将决定合围代价。",
  "守住群众与基层组织，不为占地和战果把仅存的骨干押上去。",
];

const elements = {};
let gameState = null;
let selectedVillageId = null;
let currentLayer = "combined";
let lastModalTrigger = null;
let planHistory = [];
let toastSerial = 0;
let pendingNewGameGuided = null;
let tutorialRuntime = {
  enabled: true,
  stage: "select",
  practicedUndo: false,
  completed: false,
};

function GetElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}

function CacheElements() {
  const ids = [
    "openingScreen", "gameShell", "startGuidedButton", "startFreeButton", "continueButton",
    "openingHistoryButton", "phaseName", "foodValue", "foodDelta", "armsValue", "intelValue",
    "peopleValue", "turnDate", "turnCounter", "historyButton", "rulesButton", "menuButton",
    "battlefieldLayout", "briefingPanel", "toggleBriefingButton", "tutorialCard", "tutorialStepLabel", "tutorialProgressText", "tutorialTitle", "tutorialBody",
    "tutorialTarget", "skipTutorialButton", "intelConfidence", "enemyIntentList", "intelHint",
    "branchCount", "protectedCount", "harmedCount", "disruptedCount", "mapViewport",
    "surfaceRouteLayer", "undergroundRouteLayer", "enemyPlanLineLayer", "siteLayer", "villageLayer",
    "threatLayer", "mapTooltip", "mapStatus", "emptyInspector", "villageInspector", "villageRegion",
    "villageName", "villageTags", "welfareValue", "welfareMeter", "trustValue", "trustMeter",
    "organizationValue", "organizationPips", "suspicionValue", "suspicionMeter", "villageStory",
    "scarList", "actionList", "closeInspectorButton", "cadreOrdersValue", "armedOrdersValue",
    "cadreOrderPips", "armedOrderPips", "planList", "undoPlanButton", "clearPlanButton",
    "commitTurnButton", "modalBackdrop", "standardModal", "modalEyebrow", "modalTitle", "modalBody",
    "modalFooter", "resolutionModal", "resolutionTitle", "resolutionDate", "resolutionSummary",
    "resolutionTimeline", "resolutionLesson", "nextTurnButton", "outcomeModal", "outcomeSeal",
    "outcomeTitle", "outcomeStory", "outcomeStats", "outcomeEvaluation", "restartButton",
    "toastRegion", "liveRegion",
  ];
  for (const id of ids) {
    elements[id] = GetElement(id);
  }
}

function EscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function DeepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function Clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function GetVillageDefinition(villageId) {
  return VILLAGE_DEFINITIONS.find((definition) => definition.id === villageId) ?? null;
}

function GetActionDefinition(actionId) {
  return ACTION_DEFINITIONS.find((definition) => definition.id === actionId) ?? null;
}

function GetPhaseIndex(turn) {
  return Math.max(0, PHASE_NAMES.findIndex((phase) => turn <= phase.through));
}

function GetTurnDate(turn) {
  const monthNames = ["5月", "6月", "7月", "8月", "9月"];
  const periodNames = ["上旬", "中旬", "下旬"];
  const zeroBasedTurn = Clamp(turn - 1, 0, CFG.maximumTurns - 1);
  const monthName = monthNames[Math.floor(zeroBasedTurn / 3)] ?? "9月";
  return `1942年${monthName}${periodNames[zeroBasedTurn % 3]}`;
}

function GetAverageVillageValue(fieldName) {
  const values = VILLAGE_DEFINITIONS.map((definition) => gameState.villages[definition.id][fieldName]);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function GetSuspicionLabel(value) {
  if (value < 20) return "低";
  if (value < 45) return "中";
  if (value < 70) return "高";
  return "极高";
}

function GetLivelihoodLabel(value) {
  if (value >= 70) return "安稳";
  if (value >= 50) return "吃紧";
  if (value >= 30) return "困苦";
  return "危急";
}

function GetVillageStory(definition, village) {
  const networkStory = village.organization === 0
    ? (village.contacted ? "可靠联系人刚刚建立，群众还不能自行组织大规模行动。" : "地表消息零散，地下网络尚未进入这里。需要由相邻乡亲秘密带路。")
    : village.organization === 1
      ? "交通员和少数骨干已经能够传信，但遭到搜捕时仍十分脆弱。"
      : village.organization === 2
        ? "秘密支部已经扎根，会自主预警、藏粮并组织担架队。"
        : "群众网络已经巩固，地道、交通与救护能够在干部不在时继续运转。";
  const livelihoodStory = village.livelihood < 35
    ? "连续封锁和征粮使许多家庭处在断炊边缘。"
    : village.livelihood < 55
      ? "粮食与药品都很吃紧，任何一次强征都会留下长期伤痕。"
      : "眼下仍能维持生活，但占领压力没有消失。";
  return `<b>${EscapeHtml(definition.terrain)}上的${EscapeHtml(definition.name)}</b><br>${livelihoodStory}${networkStory}`;
}

function GetIntentTargetDefinition(intent) {
  return GetVillageDefinition(intent?.targetVillageId) ?? VILLAGE_DEFINITIONS[0];
}

function GetIntentClue(intent) {
  if (intent?.clue) return intent.clue;
  const target = GetIntentTargetDefinition(intent);
  const kindName = ENEMY_KIND_NAMES[intent?.kind] ?? "敌军行动";
  if (intent?.decisionBasis?.evidence > 0) {
    return `敌军正依据此前掌握的${intent.decisionBasis.evidence}条证据，把${target.name}列为${kindName}方向。`;
  }
  return `线索很少：敌军仍可能把${target.name}附近的公开道路当作行动方向。`;
}

function GetApproximateStrengthLabel(strength) {
  if (strength <= 1) return "小股兵力";
  if (strength <= 3) return "加强兵力";
  return "重兵行动";
}

function GetPlayerEnemyIntentView(state) {
  const trueIntent = GetEnemyIntentPreview(state);
  if (!trueIntent) {
    return {
      visibility: "unknown",
      kind: null,
      targetVillageId: null,
      title: "暂无敌情",
      clue: "地下交通线尚未送来本旬消息。",
      confidence: "无可靠情报",
      hint: "侦察可以积累情报；没有线索时，地图不会替你标出敌军目标。",
      markerLabel: "敌情未明",
      threatLabel: null,
    };
  }

  const intelligence = Math.max(0, Math.floor(state.resources?.intelligence ?? 0));
  const tutorialExact = tutorialRuntime.enabled && state.turn <= CFG.tutorialTurns;
  const target = GetVillageDefinition(trueIntent.targetVillageId);
  const kindName = ENEMY_KIND_NAMES[trueIntent.kind] ?? "敌军行动";

  if (tutorialExact || intelligence >= INTEL_VISIBILITY_THRESHOLDS.exact) {
    return {
      visibility: "exact",
      kind: trueIntent.kind,
      targetVillageId: trueIntent.targetVillageId,
      title: `${kindName} · ${target.name} · ${trueIntent.strength ?? 1}级`,
      clue: GetIntentClue(trueIntent),
      confidence: tutorialExact ? "可靠教学线索" : "多源确认",
      hint: tutorialExact
        ? "前六旬教学提供明确线索；之后必须依靠侦察积累情报，地图不会维持上帝视角。"
        : "多路交通员已经确认目标与兵力；反侦察仍能干扰敌军据以行动的证据。",
      markerLabel: `${kindName} · ${trueIntent.strength ?? 1}级`,
      threatLabel: "本旬确认威胁",
    };
  }

  if (intelligence >= INTEL_VISIBILITY_THRESHOLDS.estimated) {
    const strengthLabel = GetApproximateStrengthLabel(trueIntent.strength ?? 1);
    return {
      visibility: "estimated",
      kind: trueIntent.kind,
      targetVillageId: trueIntent.targetVillageId,
      title: `${kindName} · 可能指向${target.name}`,
      clue: `交通员交叉印证后，判断${target.name}一带最可能遭到${kindName}；兵力约为${strengthLabel}，仍可能有误。`,
      confidence: "交叉研判",
      hint: "目前只能标出最可能的方向与兵力区间；继续侦察，才能确认具体目标和强度。",
      markerLabel: `${kindName} · ${strengthLabel}`,
      threatLabel: "本旬可能威胁",
    };
  }

  if (intelligence >= INTEL_VISIBILITY_THRESHOLDS.partial) {
    return {
      visibility: "partial",
      kind: trueIntent.kind,
      targetVillageId: null,
      title: `${kindName} · 方向未明`,
      clue: `单线消息只确认敌军正在准备${kindName}，目标村庄与兵力尚不清楚。`,
      confidence: "单线风声",
      hint: "这一档情报只揭示行动类型，不会在地图上标出真实目标。",
      markerLabel: `${kindName} · 去向不明`,
      threatLabel: null,
    };
  }

  return {
    visibility: "unknown",
    kind: null,
    targetVillageId: null,
    title: "敌军行动不明 · 方向不明",
    clue: "联络线没有取得可核实的消息，只知道占领军仍在调动。",
    confidence: "无可靠情报",
    hint: "没有情报时，行动类型、目标和兵力都不会显示；武装侦察能逐步缩小不确定性。",
    markerLabel: "敌军调动 · 去向不明",
    threatLabel: null,
  };
}

function CreateSvgPath(layer, className, pathData, extraAttributes = {}) {
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("class", className);
  path.setAttribute("d", pathData);
  for (const [attributeName, attributeValue] of Object.entries(extraAttributes)) {
    path.setAttribute(attributeName, attributeValue);
  }
  layer.append(path);
  return path;
}

function VillagePoint(villageId) {
  const definition = GetVillageDefinition(villageId);
  return { x: definition.x * 10, y: definition.y * 6.2 };
}

function CreateStaticMap() {
  elements.surfaceRouteLayer.replaceChildren();
  elements.undergroundRouteLayer.replaceChildren();
  elements.siteLayer.replaceChildren();

  for (const routeDefinition of ROUTE_DEFINITIONS) {
    const points = routeDefinition.villageIds.map((villageId) => VillagePoint(villageId));
    if (points.length < 2) continue;
    const pathData = points.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
    const path = CreateSvgPath(elements.surfaceRouteLayer, "road", pathData);
    path.dataset.routeId = routeDefinition.id;
  }
  CreateSvgPath(elements.surfaceRouteLayer, "railway", "M 998 22 C 900 92 885 188 820 278 S 760 460 666 620");
  CreateSvgPath(elements.surfaceRouteLayer, "road", "M 930 92 C 870 165 840 238 820 378");

  for (const connection of CONNECTION_DEFINITIONS) {
    const fromPoint = VillagePoint(connection.from);
    const toPoint = VillagePoint(connection.to);
    const path = CreateSvgPath(
      elements.undergroundRouteLayer,
      "networkRoute",
      `M${fromPoint.x} ${fromPoint.y} L${toPoint.x} ${toPoint.y}`,
    );
    path.dataset.connectionId = connection.id;
    path.dataset.from = connection.from;
    path.dataset.to = connection.to;
  }

  for (const site of SITE_DEFINITIONS) {
    const marker = document.createElement("div");
    marker.className = "siteMarker";
    marker.style.left = `${site.x}%`;
    marker.style.top = `${site.y}%`;
    marker.innerHTML = `<div class="siteSymbol"><span>${site.short}</span></div><b>${site.name}</b>`;
    elements.siteLayer.append(marker);
  }
}

function RenderRouteState() {
  for (const path of elements.undergroundRouteLayer.querySelectorAll("path")) {
    const fromVillage = gameState.villages[path.dataset.from];
    const toVillage = gameState.villages[path.dataset.to];
    const bothContacted = fromVillage.contacted && toVillage.contacted;
    const oneContacted = fromVillage.contacted || toVillage.contacted;
    const organizationStrength = Math.min(fromVillage.organization, toVillage.organization);
    const opacity = bothContacted ? 0.55 + organizationStrength * 0.15 : oneContacted ? 0.18 : 0.06;
    path.style.setProperty("--routeOpacity", String(opacity));
  }
  for (const path of elements.surfaceRouteLayer.querySelectorAll("path[data-route-id]")) {
    const routeState = gameState.routes[path.dataset.routeId];
    path.style.opacity = routeState?.currentDisruption > 0 ? ".24" : ".64";
    path.style.strokeDasharray = routeState?.currentDisruption > 0 ? "9 12" : "";
  }
}

function RenderVillages() {
  const intent = GetPlayerEnemyIntentView(gameState);
  const tutorialStep = tutorialRuntime.enabled && gameState.turn <= CFG.tutorialTurns ? GetTutorialStep(gameState) : null;
  elements.villageLayer.replaceChildren();
  for (const definition of VILLAGE_DEFINITIONS) {
    const village = gameState.villages[definition.id];
    const button = document.createElement("button");
    const threatened = intent.targetVillageId === definition.id;
    const tutorialTarget = tutorialStep?.targetVillageId === definition.id && tutorialRuntime.stage === "select";
    button.type = "button";
    button.className = `villageNode${selectedVillageId === definition.id ? " isSelected" : ""}${threatened ? " isThreatened" : ""}${tutorialTarget ? " isTutorialTarget" : ""}`;
    button.dataset.villageId = definition.id;
    button.style.left = `${definition.x}%`;
    button.style.top = `${definition.y}%`;
    button.style.setProperty("--pressure", String(village.enemySuspicion));
    button.style.setProperty("--organization", String(village.organization));
    button.setAttribute(
      "aria-label",
      `${definition.name}，${definition.terrain}，${definition.families}户，民生${Math.round(village.livelihood)}，${ORGANIZATION_NAMES[village.organization]}，敌疑${GetSuspicionLabel(village.enemySuspicion)}${threatened ? `，${intent.threatLabel}` : ""}`,
    );
    const badges = [];
    if (village.organization >= 2) badges.push(`<i class="nodeBadge networkBadge" title="群众组织可自主行动">众</i>`);
    if (village.scars > 0) badges.push(`<i class="nodeBadge scar" title="战争伤痕 ${village.scars}">痕</i>`);
    if (threatened) badges.push(`<i class="nodeBadge warning" title="${EscapeHtml(intent.threatLabel)}">!</i>`);
    button.innerHTML = `
      <span class="nodePressure"></span>
      <span class="nodeNetwork"></span>
      <span class="nodeCore">${EscapeHtml(definition.name.slice(0, 1))}</span>
      <span class="nodeBadgeRow">${badges.join("")}</span>
      <span class="nodeName">${EscapeHtml(definition.name)}</span>
    `;
    button.addEventListener("click", () => SelectVillage(definition.id));
    button.addEventListener("mouseenter", (event) => ShowMapTooltip(event, definition.id));
    button.addEventListener("mousemove", PositionMapTooltip);
    button.addEventListener("mouseleave", HideMapTooltip);
    button.addEventListener("focus", (event) => ShowMapTooltip(event, definition.id));
    button.addEventListener("blur", HideMapTooltip);
    button.addEventListener("keydown", (event) => HandleVillageArrowKey(event, definition.id));
    elements.villageLayer.append(button);
  }
  RenderRouteState();
}

function RenderThreat() {
  const intent = GetPlayerEnemyIntentView(gameState);
  const target = intent.targetVillageId ? GetVillageDefinition(intent.targetVillageId) : null;
  const source = SITE_DEFINITIONS[intent.kind === "Sweep" ? 0 : intent.kind === "Requisition" ? 1 : 2];
  elements.threatLayer.replaceChildren();
  elements.enemyPlanLineLayer.replaceChildren();
  const marker = document.createElement("div");
  marker.className = `threatMarker${target ? "" : " isUnlocated"}`;
  marker.style.left = `${target?.x ?? 50}%`;
  marker.style.top = `${target ? Math.max(5, target.y - 9) : 9}%`;
  marker.innerHTML = `<span>${EscapeHtml(intent.markerLabel)}</span>`;
  elements.threatLayer.append(marker);
  if (target) {
    CreateSvgPath(
      elements.enemyPlanLineLayer,
      `enemyPlanLine${intent.visibility === "estimated" ? " isEstimated" : ""}`,
      `M${source.x * 10} ${source.y * 6.2} Q${(source.x + target.x) * 5} ${Math.min(source.y, target.y) * 4.2} ${target.x * 10} ${target.y * 6.2}`,
    );
  }
}

function ShowMapTooltip(event, villageId) {
  const definition = GetVillageDefinition(villageId);
  const village = gameState.villages[villageId];
  elements.mapTooltip.innerHTML = `<b>${EscapeHtml(definition.name)}</b> · ${EscapeHtml(definition.terrain)}<br>民生 ${Math.round(village.livelihood)}（${GetLivelihoodLabel(village.livelihood)}） · 信任 ${Math.round(village.trust)}<br>${ORGANIZATION_NAMES[village.organization]} · 敌疑${GetSuspicionLabel(village.enemySuspicion)}<br><small>点击查看可用行动</small>`;
  elements.mapTooltip.hidden = false;
  PositionMapTooltip(event);
}

function PositionMapTooltip(event) {
  if (elements.mapTooltip.hidden) return;
  const fallbackRect = event.currentTarget?.getBoundingClientRect?.();
  const x = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : (fallbackRect?.right ?? 0);
  const y = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : (fallbackRect?.top ?? 0);
  const tooltipWidth = 230;
  const left = Math.min(window.innerWidth - tooltipWidth - 12, x + 14);
  const top = Math.min(window.innerHeight - 130, y + 14);
  elements.mapTooltip.style.left = `${Math.max(8, left)}px`;
  elements.mapTooltip.style.top = `${Math.max(8, top)}px`;
}

function HideMapTooltip() {
  elements.mapTooltip.hidden = true;
}

function HandleVillageArrowKey(event, villageId) {
  const directionByKey = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  };
  const direction = directionByKey[event.key];
  if (!direction) return;
  event.preventDefault();
  const origin = GetVillageDefinition(villageId);
  const candidates = VILLAGE_DEFINITIONS
    .filter((definition) => definition.id !== villageId)
    .map((definition) => {
      const deltaX = definition.x - origin.x;
      const deltaY = definition.y - origin.y;
      const forward = deltaX * direction.x + deltaY * direction.y;
      const side = Math.abs(deltaX * direction.y - deltaY * direction.x);
      return { definition, forward, score: Math.hypot(deltaX, deltaY) + side * 0.45 };
    })
    .filter((candidate) => candidate.forward > 2)
    .sort((left, right) => left.score - right.score);
  const targetId = candidates[0]?.definition.id;
  if (targetId) {
    elements.villageLayer.querySelector(`[data-village-id="${targetId}"]`)?.focus();
  }
}

function SelectVillage(villageId) {
  if (!gameState?.villages?.[villageId]) return;
  selectedVillageId = villageId;
  const tutorialStep = GetTutorialStep(gameState);
  if (tutorialRuntime.enabled && tutorialRuntime.stage === "select" && tutorialStep?.targetVillageId === villageId) {
    tutorialRuntime.stage = "act";
    Announce(`已选择${GetVillageDefinition(villageId).name}。现在安排${GetActionDefinition(tutorialStep.focusActionId).name}。`);
  }
  RenderAll();
}

function RenderHeader() {
  const planning = GetPlanningSummary(gameState);
  const phaseIndex = GetPhaseIndex(gameState.turn);
  const averageLivelihood = GetAverageVillageValue("livelihood");
  elements.phaseName.textContent = PHASE_NAMES[phaseIndex].name;
  elements.foodValue.textContent = String(planning.availableResources.supplies);
  elements.foodDelta.textContent = planning.reservedCosts.supplies > 0 ? `预留 ${planning.reservedCosts.supplies}` : "可用粮秣";
  elements.armsValue.textContent = String(planning.availableResources.arms);
  elements.intelValue.textContent = String(planning.availableResources.intelligence);
  elements.peopleValue.textContent = String(Math.round(averageLivelihood));
  elements.turnDate.textContent = GetTurnDate(gameState.turn);
  elements.turnCounter.textContent = `第 ${gameState.turn} / ${CFG.maximumTurns} 旬`;
}

function RenderEnemyIntents() {
  const intent = GetPlayerEnemyIntentView(gameState);
  elements.intelConfidence.textContent = intent.confidence;
  elements.enemyIntentList.innerHTML = `
    <article class="intentCard ${intent.visibility === "unknown" ? "isUnknown" : "isKnown"}">
      <div class="intentIcon">${ENEMY_KIND_ICONS[intent.kind] ?? "？"}</div>
      <div>
        <b>${EscapeHtml(intent.title)}</b>
        <span>${EscapeHtml(intent.clue)}</span>
      </div>
    </article>
  `;
  elements.intelHint.textContent = intent.hint;
}

function RenderLedger() {
  const metrics = gameState.campaignMetrics;
  const branches = VILLAGE_DEFINITIONS.filter((definition) => gameState.villages[definition.id].organization >= 2).length;
  elements.branchCount.textContent = String(branches);
  elements.protectedCount.textContent = `${metrics.protectedFamilies}户`;
  elements.harmedCount.textContent = `${metrics.victimizedFamilies}户`;
  elements.disruptedCount.textContent = String(metrics.enemyRequisitionsFrustrated + metrics.enemySweepsFrustrated);
}

function GetTutorialInstruction(step) {
  const action = GetActionDefinition(step.focusActionId);
  const village = GetVillageDefinition(step.targetVillageId);
  if (tutorialRuntime.stage === "select") {
    return {
      title: step.title,
      body: step.text,
      target: `下一步：点击地图上的 <b>${EscapeHtml(village.name)}</b>`,
    };
  }
  if (tutorialRuntime.stage === "act") {
    return {
      title: step.title,
      body: `${step.text} 右侧每个行动都会写明成本、成功率和为什么暂不可用。`,
      target: `下一步：安排 <b>${EscapeHtml(action.name)}</b>`,
    };
  }
  if (tutorialRuntime.stage === "undo") {
    return {
      title: "计划不等于执行",
      body: "行动进入底部计划栏后，地图数值并没有改变。提交前可以随时撤销，这就是规划阶段。",
      target: "下一步：点击底部 <b>撤销上一步</b>",
    };
  }
  if (tutorialRuntime.stage === "restore") {
    return {
      title: "把计划排回来",
      body: "刚才撤销没有消耗粮秣，也没有跳过敌军行动。现在重新安排本旬最重要的事。",
      target: `下一步：再次安排 <b>${EscapeHtml(action.name)}</b>`,
    };
  }
  return {
    title: "敌我命令同时锁定",
    body: "你仍可加入其他计划。执行后，玩家行动、群众自主行动与敌军计划会一起结算，并逐条说明因果。",
    target: "准备好后：点击 <b>执行本旬</b>",
  };
}

function RenderTutorial() {
  if (tutorialRuntime.enabled && gameState.turn <= CFG.tutorialTurns) {
    const step = GetTutorialStep(gameState);
    const instruction = GetTutorialInstruction(step);
    elements.tutorialStepLabel.textContent = `教学 · 第 ${gameState.turn} 旬`;
    elements.tutorialProgressText.textContent = `${gameState.turn} / ${CFG.tutorialTurns}`;
    elements.tutorialTitle.textContent = instruction.title;
    elements.tutorialBody.textContent = instruction.body;
    elements.tutorialTarget.innerHTML = instruction.target;
    elements.skipTutorialButton.hidden = false;
    elements.tutorialCard.classList.remove("isFreePlay");
    return;
  }
  const phaseIndex = GetPhaseIndex(gameState.turn);
  const turnDefinition = TURN_DEFINITIONS[gameState.turn - 1];
  elements.tutorialStepLabel.textContent = `战役阶段 · ${PHASE_NAMES[phaseIndex].name}`;
  elements.tutorialProgressText.textContent = `${gameState.turn} / ${CFG.maximumTurns}`;
  elements.tutorialTitle.textContent = turnDefinition?.title ?? "保存火种";
  elements.tutorialBody.textContent = PHASE_OBJECTIVES[phaseIndex];
  elements.tutorialTarget.innerHTML = `<b>本旬判断：</b>${EscapeHtml(turnDefinition?.text ?? "保护群众与组织。")}`;
  elements.skipTutorialButton.hidden = true;
  elements.tutorialCard.classList.add("isFreePlay");
}

function RenderInspector() {
  const definition = GetVillageDefinition(selectedVillageId);
  const village = definition ? gameState.villages[definition.id] : null;
  elements.emptyInspector.hidden = Boolean(village);
  elements.villageInspector.hidden = !village;
  if (!village) return;

  const intent = GetPlayerEnemyIntentView(gameState);
  const isThreatened = intent.targetVillageId === definition.id;
  elements.villageRegion.textContent = `${definition.terrain} · ${definition.families}户`;
  elements.villageName.textContent = definition.name;
  const tags = [
    `<span class="villageTag">${EscapeHtml(definition.terrain)}</span>`,
    village.contacted ? `<span class="villageTag good">地下已联络</span>` : `<span class="villageTag">尚无可靠联系</span>`,
    isThreatened ? `<span class="villageTag bad">${EscapeHtml(intent.threatLabel)}</span>` : "",
    village.livelihood < 35 ? `<span class="villageTag warning">民生危急</span>` : "",
  ];
  elements.villageTags.innerHTML = tags.join("");
  elements.welfareValue.textContent = `${Math.round(village.livelihood)} · ${GetLivelihoodLabel(village.livelihood)}`;
  elements.welfareMeter.style.width = `${Clamp(village.livelihood, 0, 100)}%`;
  elements.trustValue.textContent = String(Math.round(village.trust));
  elements.trustMeter.style.width = `${Clamp(village.trust, 0, 100)}%`;
  elements.organizationValue.textContent = ORGANIZATION_NAMES[village.organization];
  elements.organizationPips.innerHTML = [1, 2, 3]
    .map((level) => `<i class="${village.organization >= level ? "isFilled" : ""}" title="组织等级 ${level}"></i>`)
    .join("");
  elements.suspicionValue.textContent = `${GetSuspicionLabel(village.enemySuspicion)} · ${Math.round(village.enemySuspicion)}`;
  elements.suspicionMeter.style.width = `${Clamp(village.enemySuspicion, 0, 100)}%`;
  elements.villageStory.innerHTML = GetVillageStory(definition, village);
  const scarTags = [];
  if (village.scars > 0) scarTags.push(`<span class="scarTag">战争伤痕 × ${village.scars}</span>`);
  if (village.harmedFamilies > 0) scarTags.push(`<span class="scarTag">受难家庭 ${village.harmedFamilies}户</span>`);
  if (village.protectedFamilies > 0) scarTags.push(`<span class="villageTag good">已保护 ${village.protectedFamilies}户</span>`);
  elements.scarList.innerHTML = scarTags.join("");
  RenderActions(definition.id);
}

function IsRecommendedAction(actionId, villageId, options = {}) {
  if (!tutorialRuntime.enabled || gameState.turn > CFG.tutorialTurns) return false;
  const tutorialStep = GetTutorialStep(gameState);
  return tutorialStep.recommendedActions.some((recommendation) => (
    recommendation.actionId === actionId
    && recommendation.villageId === villageId
    && (!recommendation.mode || recommendation.mode === options.mode)
  ));
}

function FormatActionCost(action) {
  const costParts = [action.orderType === "cadre" ? "1干部令" : "1武装令"];
  if (action.costs.supplies > 0) costParts.push(`${action.costs.supplies}粮`);
  if (action.costs.arms > 0) costParts.push(`${action.costs.arms}械`);
  if (action.costs.intelligence > 0) costParts.push(`${action.costs.intelligence}情报`);
  return costParts.join(" · ");
}

function BuildActionCard(action, villageId, options = {}, modeDefinition = null) {
  const availability = GetActionAvailability(gameState, action.id, villageId, options);
  const recommended = IsRecommendedAction(action.id, villageId, options);
  const displayName = modeDefinition ? `${action.name} · ${modeDefinition.name}` : action.name;
  const description = modeDefinition?.description ?? action.description;
  const chanceText = availability.available ? `预估成功率 ${availability.chance}%` : availability.reason;
  return `
    <button class="actionCard${recommended ? " isRecommended" : ""}" type="button"
      data-action-id="${action.id}" data-order-type="${action.orderType}" data-mode="${options.mode ?? ""}"
      ${availability.available ? "" : "disabled"}
      title="${EscapeHtml(chanceText)}">
      <b>${EscapeHtml(displayName)}</b>
      <span>${EscapeHtml(description)}</span>
      <small class="${availability.available ? "" : "actionLockReason"}">${availability.available ? `${FormatActionCost(action)} · ${availability.chance}%` : EscapeHtml(availability.reason)}</small>
    </button>
  `;
}

function RenderActions(villageId) {
  const cards = [];
  for (const action of ACTION_DEFINITIONS) {
    if (action.modes) {
      for (const mode of action.modes) {
        cards.push(BuildActionCard(action, villageId, { mode: mode.id }, mode));
      }
    } else {
      cards.push(BuildActionCard(action, villageId));
    }
  }
  elements.actionList.innerHTML = cards.join("");
}

function RenderPlanDock() {
  const planning = GetPlanningSummary(gameState);
  elements.cadreOrdersValue.textContent = `${planning.remainingOrders.cadre} / ${gameState.orderBudget.cadre}`;
  elements.armedOrdersValue.textContent = `${planning.remainingOrders.armed} / ${gameState.orderBudget.armed}`;
  elements.cadreOrderPips.innerHTML = Array.from({ length: gameState.orderBudget.cadre }, (_, index) => (
    `<span class="orderPip${index < planning.remainingOrders.cadre ? " isAvailable" : ""}"></span>`
  )).join("");
  elements.armedOrderPips.innerHTML = Array.from({ length: gameState.orderBudget.armed }, (_, index) => (
    `<span class="orderPip${index < planning.remainingOrders.armed ? " isAvailable" : ""}"></span>`
  )).join("");
  if (gameState.plans.length === 0) {
    elements.planList.innerHTML = `<div class="emptyPlan"><b>本旬尚无计划</b><span>选择村庄，把行动排进这里；提交前都能撤销。</span></div>`;
  } else {
    elements.planList.innerHTML = gameState.plans.map((plan) => {
      const action = GetActionDefinition(plan.actionId);
      const village = GetVillageDefinition(plan.villageId);
      const mode = action.modes?.find((candidate) => candidate.id === plan.options?.mode);
      const displayName = mode ? `${action.shortName} · ${mode.name}` : action.shortName;
      return `
        <article class="planCard${action.orderType === "armed" ? " isArmed" : ""}">
          <button class="removePlanButton" type="button" data-remove-plan-id="${plan.id}" aria-label="撤销 ${EscapeHtml(displayName)}">×</button>
          <b>${EscapeHtml(displayName)}</b>
          <span>→ ${EscapeHtml(village.name)}</span>
          <small>${FormatActionCost(action)} · 成功率 ${plan.chanceAtQueue}%</small>
        </article>
      `;
    }).join("");
  }
  const hasPlans = gameState.plans.length > 0;
  const tutorialRequiresUndo = tutorialRuntime.enabled
    && gameState.turn === 1
    && tutorialRuntime.stage === "undo"
    && !tutorialRuntime.practicedUndo;
  elements.undoPlanButton.disabled = !hasPlans;
  elements.clearPlanButton.disabled = !hasPlans;
  elements.commitTurnButton.disabled = gameState.status !== "active" || tutorialRequiresUndo;
  elements.commitTurnButton.title = tutorialRequiresUndo ? "先按教学要求撤销上一步，确认计划尚未执行。" : "锁定并同时结算本旬命令";
}

function RenderLayer() {
  elements.mapViewport.classList.remove("layerCombined", "layerSurface", "layerUnderground");
  const className = currentLayer === "surface" ? "layerSurface" : currentLayer === "underground" ? "layerUnderground" : "layerCombined";
  elements.mapViewport.classList.add(className);
  document.querySelectorAll(".layerButton").forEach((button) => {
    button.classList.toggle("isActive", button.dataset.layer === currentLayer);
    button.setAttribute("aria-pressed", String(button.dataset.layer === currentLayer));
  });
  elements.mapStatus.textContent = currentLayer === "surface"
    ? "地表层：铁路、道路、炮楼与占领压力"
    : currentLayer === "underground"
      ? "地下层：联系人、秘密支部与群众交通线"
      : "同一座村庄可以地表受控、地下仍在抵抗";
}

function RenderAll() {
  if (!gameState) return;
  RenderHeader();
  RenderEnemyIntents();
  RenderLedger();
  RenderTutorial();
  RenderThreat();
  RenderVillages();
  RenderInspector();
  RenderPlanDock();
  RenderLayer();
  SaveGame();
}

function HandleActionQueue(actionId, options = {}) {
  if (!selectedVillageId) return;
  const previousState = gameState;
  const nextState = QueueAction(gameState, actionId, selectedVillageId, options);
  if (!nextState.lastCommand?.success) {
    ShowToast(nextState.lastCommand?.reason ?? "这项行动暂时不可用。", "bad");
    return;
  }
  gameState = nextState;
  planHistory.push({
    planId: nextState.lastCommand.planId,
    actionId,
    villageId: selectedVillageId,
    stateBefore: previousState,
  });
  const action = GetActionDefinition(actionId);
  const village = GetVillageDefinition(selectedVillageId);
  ShowToast(`${action.name}已排入${village.name}，尚未执行。`, "good");
  const tutorialStep = GetTutorialStep(gameState);
  if (tutorialRuntime.enabled && tutorialStep?.focusActionId === actionId && tutorialStep.targetVillageId === selectedVillageId) {
    if (gameState.turn === 1 && !tutorialRuntime.practicedUndo) {
      tutorialRuntime.stage = "undo";
    } else {
      tutorialRuntime.stage = "commit";
    }
  }
  Announce(`${action.name}已加入计划。提交前可以撤销。`);
  RenderAll();
}

function HandleRemovePlan(planId, fromUndoButton = false) {
  const plan = gameState.plans.find((candidate) => candidate.id === planId);
  if (!plan) return;
  const nextState = RemovePlan(gameState, planId);
  if (!nextState.lastCommand?.success) {
    ShowToast(nextState.lastCommand?.reason ?? "无法撤销。", "bad");
    return;
  }
  gameState = nextState;
  planHistory = planHistory.filter((entry) => entry.planId !== planId);
  const tutorialStep = GetTutorialStep(gameState);
  if (tutorialRuntime.enabled && gameState.turn === 1 && tutorialRuntime.stage === "undo"
      && tutorialStep?.focusActionId === plan.actionId && tutorialStep.targetVillageId === plan.villageId) {
    tutorialRuntime.practicedUndo = true;
    tutorialRuntime.stage = "restore";
    selectedVillageId = plan.villageId;
    ShowToast("计划已撤销：命令和粮秣都已释放。", "good");
  } else if (tutorialRuntime.enabled && tutorialStep?.focusActionId === plan.actionId && tutorialStep.targetVillageId === plan.villageId) {
    tutorialRuntime.stage = "act";
  } else if (!fromUndoButton) {
    ShowToast("计划已撤销，预留资源已经释放。", "good");
  }
  Announce("计划已撤销，游戏状态没有提前变化。 ");
  RenderAll();
}

function UndoLastPlan() {
  const lastPlan = gameState.plans[gameState.plans.length - 1];
  if (lastPlan) HandleRemovePlan(lastPlan.id, true);
}

function ClearPlans() {
  const planIds = gameState.plans.map((plan) => plan.id);
  for (const planId of planIds) {
    gameState = RemovePlan(gameState, planId);
  }
  planHistory = [];
  if (tutorialRuntime.enabled) tutorialRuntime.stage = "act";
  ShowToast("本旬计划已清空，资源未被消耗。", "good");
  RenderAll();
}

function HasTutorialFocusPlan() {
  const tutorialStep = GetTutorialStep(gameState);
  return gameState.plans.some((plan) => (
    plan.actionId === tutorialStep?.focusActionId && plan.villageId === tutorialStep.targetVillageId
  ));
}

function RequestCommit() {
  if (gameState.status !== "active") return;
  if (tutorialRuntime.enabled && gameState.turn === 1 && tutorialRuntime.stage === "undo" && !tutorialRuntime.practicedUndo) {
    ShowToast("先撤销上一步：确认计划尚未执行、资源也能完整释放。", "bad");
    elements.undoPlanButton.focus();
    return;
  }
  if (tutorialRuntime.enabled && gameState.turn <= CFG.tutorialTurns && !HasTutorialFocusPlan()) {
    const tutorialStep = GetTutorialStep(gameState);
    selectedVillageId = tutorialStep.targetVillageId;
    tutorialRuntime.stage = "act";
    ShowToast(`先完成本旬教学目标：${GetActionDefinition(tutorialStep.focusActionId).name}。`, "bad");
    RenderAll();
    return;
  }
  const planning = GetPlanningSummary(gameState);
  const warnings = [];
  if (gameState.plans.length === 0) warnings.push("本旬没有安排任何行动");
  if (planning.remainingOrders.cadre > 0) warnings.push(`仍有 ${planning.remainingOrders.cadre} 道干部令未用`);
  if (planning.remainingOrders.armed > 0) warnings.push("武装令尚未使用");
  if (warnings.length === 0) {
    CommitTurn();
    return;
  }
  OpenStandardModal({
    eyebrow: "提交前确认",
    title: "还有事情没做完",
    body: `<p class="callout warningCallout">${warnings.map(EscapeHtml).join("；")}。</p><p>敌我命令一旦锁定，本旬就不能撤回。留有余力有时也是选择，但已知威胁不会停下来等你。</p>`,
    footer: `<button class="secondaryButton" type="button" data-close-modal>返回规划</button><button class="primaryButton" type="button" data-modal-action="commit">仍然执行</button>`,
  });
}

function CommitTurn() {
  CloseAllModals(false);
  const completedTurn = gameState.turn;
  gameState = ResolveTurn(gameState);
  planHistory = [];
  if (!gameState.lastCommand?.success) {
    ShowToast(gameState.lastCommand?.reason ?? "本旬结算失败。", "bad");
    return;
  }
  tutorialRuntime.stage = "debrief";
  SaveGame();
  ShowResolution(gameState.lastResolution);
  Announce(`第${completedTurn}旬已经同时结算。请阅读战报。`);
}

function BuildTimelineEvent(kind, icon, title, text, effects, cssClass = "") {
  return `
    <article class="timelineEvent ${cssClass}">
      <div class="timelineIcon">${EscapeHtml(icon)}</div>
      <div><b>${EscapeHtml(title)}</b><span>${EscapeHtml(text)}</span></div>
      <div class="eventEffects">${EscapeHtml(effects)}</div>
    </article>
  `;
}

function BuildOccupationConsequencePanel(enemy, target) {
  const consequences = [
    enemy.grainSeized > 0 ? `强征 ${enemy.grainSeized} 份家庭口粮` : null,
    enemy.homesBurned > 0 ? `焚毁 ${enemy.homesBurned} 户房屋` : null,
    enemy.familiesDisplaced > 0 ? `迫使 ${enemy.familiesDisplaced} 户流离` : null,
    enemy.peopleWounded > 0 ? `造成 ${enemy.peopleWounded} 人受伤` : null,
    enemy.peopleKilled > 0 ? `造成 ${enemy.peopleKilled} 人死亡` : null,
    enemy.peopleDetained > 0 ? `拘押 ${enemy.peopleDetained} 人` : null,
    enemy.organizationLoss > 0 ? `地下组织损失 ${enemy.organizationLoss} 级` : null,
    enemy.contactLost ? "地下联络被切断" : null,
  ].filter(Boolean);
  if (consequences.length === 0) {
    consequences.push(enemy.harmedFamilies > 0
      ? `${enemy.harmedFamilies} 户家庭受到伤害`
      : "群众的预警与转移使本旬没有新增具体伤亡或财产损失");
  }
  const operationName = [enemy.operationPhase, enemy.policy, `${enemy.kindName} · ${target.name}`]
    .filter(Boolean)
    .join(" · ");
  const responsibility = enemy.responsibility
    ?? "这些伤害由侵华日军的占领、强征、搜捕与扫荡政策造成；群众抵抗不是暴行的责任来源。";
  return `
    <article class="occupationConsequencePanel" aria-label="侵华日军占领行动造成的具体后果">
      <span>占领暴力后果 · 责任归属明确 · 不作为奖励计分</span>
      <b>${EscapeHtml(operationName)}</b>
      <p><strong>${EscapeHtml(enemy.perpetrator ?? "侵华日军占领部队")}：</strong>${EscapeHtml(responsibility)}</p>
      <div class="consequenceList">${consequences.map((consequence) => `<strong>${EscapeHtml(consequence)}</strong>`).join("")}</div>
    </article>
  `;
}

function GetPopularActionPresentation(popularAction) {
  const presentation = {
    EarlyWarning: { icon: "哨", label: "群众自主预警" },
    HideGrain: { icon: "粮", label: "群众自主藏粮" },
    Stretcher: { icon: "担", label: "群众自主救护" },
    Tunnels: { icon: "道", label: "群众自主启用地道" },
  }[popularAction.id] ?? { icon: "众", label: "群众自主行动" };
  const scarEffect = popularAction.scarPenalty > 0
    ? `战争伤痕使行动效力降低 ${popularAction.scarPenalty}`
    : "依靠本村信任与组织自行发动";
  return {
    ...presentation,
    title: `${presentation.label} · ${popularAction.name}`,
    text: `${popularAction.text} 这是乡亲们基于已有组织作出的决定，不是玩家命令或永久被动加成。`,
    effects: `不占用玩家命令 · ${scarEffect}`,
  };
}

function ShowResolution(resolution) {
  const metricsDelta = resolution.metricsDelta;
  elements.resolutionTitle.textContent = `第${resolution.completedTurn}旬 · ${resolution.title}`;
  elements.resolutionDate.textContent = GetTurnDate(resolution.completedTurn);
  elements.resolutionSummary.innerHTML = `
    <div class="summaryChip good"><span>本旬保护</span><b>+${metricsDelta.protectedFamilies ?? 0}户</b></div>
    <div class="summaryChip bad"><span>本旬受难</span><b>+${metricsDelta.victimizedFamilies ?? 0}户</b></div>
    <div class="summaryChip"><span>粮秣变化</span><b>${FormatSigned(resolution.resourceDelta.supplies)}</b></div>
    <div class="summaryChip"><span>军械变化</span><b>${FormatSigned(resolution.resourceDelta.arms)}</b></div>
    <div class="summaryChip"><span>情报变化</span><b>${FormatSigned(resolution.resourceDelta.intelligence)}</b></div>
  `;
  const timeline = [];
  if (resolution.playerActions.length === 0) {
    timeline.push(BuildTimelineEvent("player", "令", "没有下达玩家命令", "有限的行动机会被保留，但敌军仍按自己的计划行动。", "无", ""));
  } else {
    for (const action of resolution.playerActions) {
      timeline.push(BuildTimelineEvent(
        "player",
        action.orderType === "cadre" ? "干" : "武",
        `${action.actionName} · ${action.villageName}`,
        action.text,
        action.success ? `成功 · 预估${action.chance}%` : `未成 · 预估${action.chance}%`,
        action.success ? "good" : "bad",
      ));
    }
  }
  for (const popularAction of resolution.popularActions) {
    const presentation = GetPopularActionPresentation(popularAction);
    timeline.push(BuildTimelineEvent(
      "people",
      presentation.icon,
      presentation.title,
      presentation.text,
      presentation.effects,
      "people peopleAgency",
    ));
  }
  const enemy = resolution.enemy;
  const target = GetVillageDefinition(enemy.targetVillageId);
  timeline.push(BuildOccupationConsequencePanel(enemy, target));
  timeline.push(BuildTimelineEvent(
    "enemy",
    ENEMY_KIND_ICONS[enemy.kind] ?? "敌",
    `${enemy.perpetrator ?? "侵华日军占领部队"} · ${enemy.kindName} · ${target.name}`,
    enemy.text,
    enemy.frustrated
      ? `行动受挫 · 仍有${enemy.harmedFamilies}户受害${enemy.organizationLoss > 0 ? ` · 组织-${enemy.organizationLoss}` : ""}`
      : `占领暴力造成伤害 · ${enemy.harmedFamilies}户受害${enemy.organizationLoss > 0 ? ` · 组织-${enemy.organizationLoss}` : ""}`,
    enemy.frustrated ? "good" : "bad",
  ));
  elements.resolutionTimeline.innerHTML = timeline.join("");
  elements.resolutionLesson.textContent = resolution.tutorial?.text
    ?? (enemy.frustrated
      ? "反扫荡的胜利不是占住一格，而是群众转移成功、组织没有被摧毁、敌人扑空或被迫减弱行动。"
      : "占领军的强征、搜捕与扫荡造成了这些伤害；下一旬应优先救济受难家庭并保护仍在运转的组织。 ");
  elements.nextTurnButton.textContent = gameState.status === "completed" ? "查看战役结算" : "进入下一旬";
  OpenModalElement(elements.resolutionModal, elements.nextTurnButton);
}

function ContinueAfterResolution() {
  CloseAllModals(false);
  if (gameState.status === "completed") {
    tutorialRuntime.stage = "outcome";
    SaveGame();
    ShowOutcome(gameState.outcome ?? CalculateOutcome(gameState));
    return;
  }
  tutorialRuntime.stage = "select";
  selectedVillageId = null;
  RenderAll();
  Announce(`进入第${gameState.turn}旬。先听风，再规划。`);
}

function FormatSigned(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function ShowOutcome(outcome) {
  elements.outcomeTitle.textContent = outcome.title;
  elements.outcomeStory.textContent = outcome.summary;
  elements.outcomeSeal.textContent = outcome.tier === "GreatWallOfPeople" ? "众" : outcome.tier === "EnduringBaseArea" ? "根" : "火";
  elements.outcomeStats.innerHTML = `
    <div class="outcomeStat"><b>${outcome.total}</b><span>综合评价</span></div>
    <div class="outcomeStat"><b>${outcome.facts.protectedFamilies}</b><span>已保护家庭</span></div>
    <div class="outcomeStat"><b>${outcome.facts.victimizedFamilies}</b><span>受难家庭</span></div>
    <div class="outcomeStat"><b>${outcome.facts.routeDisruption}</b><span>交通破坏</span></div>
  `;
  elements.outcomeEvaluation.innerHTML = `
    <b>这局留下了什么</b><br>
    平均民生 ${outcome.averages.livelihood} · 平均信任 ${outcome.averages.trust} · 平均组织 ${outcome.averages.organization} · 平均伤痕 ${outcome.averages.scars}。<br>
    评价不计算击杀数；群众生存、组织存续、互助能力与敌军行动受挫才决定结局。全国抗战的历史结局不由这张合成地图改写。
  `;
  OpenModalElement(elements.outcomeModal, elements.restartButton);
}

function OpenModalElement(modalElement, focusElement = null) {
  elements.openingScreen.inert = true;
  elements.gameShell.inert = true;
  elements.modalBackdrop.hidden = false;
  elements.standardModal.hidden = true;
  elements.resolutionModal.hidden = true;
  elements.outcomeModal.hidden = true;
  modalElement.hidden = false;
  document.body.dataset.modalOpen = "true";
  window.setTimeout(() => (focusElement ?? modalElement.querySelector("button, a"))?.focus(), 0);
}

function OpenStandardModal({ eyebrow, title, body, footer = "", trigger = document.activeElement }) {
  lastModalTrigger = trigger instanceof HTMLElement ? trigger : null;
  elements.modalEyebrow.textContent = eyebrow;
  elements.modalTitle.textContent = title;
  elements.modalBody.innerHTML = body;
  elements.modalFooter.innerHTML = footer;
  OpenModalElement(elements.standardModal, elements.standardModal.querySelector("button"));
}

function CloseAllModals(restoreFocus = true) {
  const wasOpen = !elements.modalBackdrop.hidden;
  elements.modalBackdrop.hidden = true;
  elements.standardModal.hidden = true;
  elements.resolutionModal.hidden = true;
  elements.outcomeModal.hidden = true;
  elements.openingScreen.inert = false;
  elements.gameShell.inert = false;
  delete document.body.dataset.modalOpen;
  if (restoreFocus && wasOpen) lastModalTrigger?.focus();
}

function GetOpenModal() {
  return [elements.standardModal, elements.resolutionModal, elements.outcomeModal]
    .find((modalElement) => !modalElement.hidden) ?? null;
}

function TrapModalFocus(event) {
  if (event.key !== "Tab") return false;
  const openModal = GetOpenModal();
  if (!openModal) return false;
  const focusableElements = [...openModal.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hidden && element.getClientRects().length > 0);
  if (focusableElements.length === 0) {
    event.preventDefault();
    openModal.focus();
    return true;
  }
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  if (!openModal.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? lastElement : firstElement).focus();
    return true;
  }
  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
    return true;
  }
  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
    return true;
  }
  return false;
}

function OpenHistoryModal(trigger = document.activeElement) {
  OpenStandardModal({
    eyebrow: "史实边界与表达原则",
    title: "这不是一张可以改写历史的沙盘",
    trigger,
    body: `
      <p class="callout warningCallout"><b>抗日战争中的侵略、强征、封锁、清乡和扫荡，是占领军施加的暴力制度。</b>页面不会把这些伤害写成群众“应得的惩罚”，也不会把真实受难者变成奖励素材。</p>
      <p>本页采用太行敌后战场的历史背景与机制逻辑，村名、道路和十四旬行动均为合成情境，不对应一场单一真实战役，也不替换任何真实人物与事件。</p>
      <p>玩家决定的是一片地方怎样保存群众、基层组织和长期抵抗能力；日本投降与全国抗战结局属于固定历史，不由这局游戏改写。</p>
      <p>残酷通过断粮、封锁、搜捕、受难家庭与永久伤痕呈现；英勇通过报信、藏粮、担架队、地道和支部重建呈现。击杀数不进入评价。</p>
    `,
    footer: `<button class="primaryButton" type="button" data-close-modal>明白</button>`,
  });
}

function OpenRulesModal(trigger = document.activeElement) {
  OpenStandardModal({
    eyebrow: "玩法规则",
    title: "四句话就能开始",
    trigger,
    body: `
      <ol>
        <li><b>听风：</b>左侧显示地下网络得到的敌情，不是上帝视角。</li>
        <li><b>取舍：</b>每旬只有3道干部令和1道武装令。救人、扎根、打击不能全做。</li>
        <li><b>规划：</b>行动先进入底部计划栏，资源只预留；提交前可以全部撤销。</li>
        <li><b>同时结算：</b>玩家、群众与敌军行动一起发生，战报逐条解释谁做了什么、保护了谁、留下什么伤痕。</li>
      </ol>
      <h3>双层地图</h3>
      <p>外圈红色是地表占领压力，内圈绿色是地下组织。村庄可以地表被控制、地下仍有支部；扩张的是信任和组织，不是领土颜色。</p>
      <h3>行动预览</h3>
      <p>行动卡直接写成本、成功率和锁定原因。情报充足会让风险更清楚；正面硬拼不会成为默认答案。</p>
      <h3>快捷键</h3>
      <p><b>Ctrl + Enter</b> 执行本旬 · <b>U</b> 撤销上一步 · <b>Esc</b> 关闭窗口 · 地图节点可用方向键移动焦点。</p>
    `,
    footer: `<button class="secondaryButton" type="button" data-modal-action="history">查看史实边界</button><button class="primaryButton" type="button" data-close-modal>回到地图</button>`,
  });
}

function OpenResourceModal(resourceId, trigger) {
  const planning = GetPlanningSummary(gameState);
  const content = {
    food: {
      title: "粮秣不是产量数字",
      text: `现有 ${gameState.resources.supplies}，本旬计划预留 ${planning.reservedCosts.supplies}，仍可用 ${planning.availableResources.supplies}。粮秣用于救济、基层建设、藏粮疏散和武装掩护。它来自能够维持民生的组织村庄。`,
    },
    arms: {
      title: "军械与武装行动都必须稀缺",
      text: `现有军械 ${gameState.resources.arms}，本旬预留 ${planning.reservedCosts.arms}，仍可用 ${planning.availableResources.arms}；同时只剩 ${planning.remainingOrders.armed} 道武装令。侦察、交通破袭和掩护／伏击彼此竞争；没有“单位海”，也不能用重复点击掩盖战略判断。`,
    },
    intel: {
      title: "情报改变的是确定性",
      text: `现有 ${gameState.resources.intelligence}，本旬预留 ${planning.reservedCosts.intelligence}，仍可用 ${planning.availableResources.intelligence}。第7旬起：0点只知道有调动，1—3点只辨行动类型，4—7点研判可能目标与兵力区间，8点以上才能确认目标和强度。敌军只按自身证据行动，并不会读取真实地下组织。`,
    },
  }[resourceId];
  if (!content) return;
  OpenStandardModal({
    eyebrow: "资源说明",
    title: content.title,
    trigger,
    body: `<p class="callout">${EscapeHtml(content.text)}</p>`,
    footer: `<button class="primaryButton" type="button" data-close-modal>返回</button>`,
  });
}

function OpenMenuModal(trigger = document.activeElement) {
  const saveStatus = HasValidSave() ? `已自动保存到第 ${gameState.turn} 旬` : "尚无有效存档";
  OpenStandardModal({
    eyebrow: "战役菜单",
    title: "太行火种",
    trigger,
    body: `<p class="callout">${saveStatus}。存档只使用 <code>${SAVE_KEY}</code>，不会与旧太行页面混用。</p><p>重新开始会清除当前战役，但不会影响其他页面。</p>`,
    footer: `
      <button class="secondaryButton" type="button" data-modal-action="rules">规则</button>
      <button class="secondaryButton" type="button" data-modal-action="restart-tutorial">重播教学</button>
      <button class="secondaryButton" type="button" data-modal-action="restart">重新开始</button>
      <button class="primaryButton" type="button" data-close-modal>继续战役</button>
    `,
  });
}

function ShowRestartConfirmation(returnToOutcome = false) {
  OpenStandardModal({
    eyebrow: "重新开始",
    title: "放弃当前推演？",
    body: `<p class="callout warningCallout">当前第 ${gameState.turn} 旬的战役存档会被替换。其他页面与其他存档不会受到影响。</p>`,
    footer: `<button class="secondaryButton" type="button" ${returnToOutcome ? 'data-modal-action="return-outcome"' : "data-close-modal"}>取消</button><button class="primaryButton" type="button" data-modal-action="confirm-restart">确认重开</button>`,
  });
}

function RequestNewGame(guided) {
  if (!HasValidSave()) {
    StartGame({ guided });
    return;
  }
  const savedEnvelope = ReadSave();
  pendingNewGameGuided = guided;
  OpenStandardModal({
    eyebrow: "存档保护",
    title: "覆盖上次战役？",
    body: `<p class="callout warningCallout">已有第 ${savedEnvelope.state.turn} 旬的有效存档。开始${guided ? "教学战役" : "自由推演"}会永久替换它。</p><p>可以先取消，再使用“继续上次战役”返回原进度。</p>`,
    footer: `<button class="secondaryButton" type="button" data-close-modal>保留存档</button><button class="primaryButton" type="button" data-modal-action="confirm-new-game">覆盖并开始</button>`,
  });
}

function ConfirmNewGame() {
  if (pendingNewGameGuided === null) return;
  const guided = pendingNewGameGuided;
  pendingNewGameGuided = null;
  localStorage.removeItem(SAVE_KEY);
  CloseAllModals(false);
  StartGame({ guided });
}

function ShowToast(message, type = "normal") {
  const toast = document.createElement("div");
  const serial = ++toastSerial;
  toast.className = `toast ${type}`;
  toast.dataset.toastSerial = String(serial);
  toast.textContent = message;
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3300);
}

function Announce(message) {
  elements.liveRegion.textContent = "";
  window.setTimeout(() => {
    elements.liveRegion.textContent = message;
  }, 20);
}

function StartGame({ guided = true, state = null, tutorial = null } = {}) {
  gameState = state ? DeepClone(state) : CreateInitialState(CFG.defaultSeed);
  tutorialRuntime = tutorial ? {
    enabled: true,
    stage: "select",
    practicedUndo: false,
    completed: false,
    ...tutorial,
  } : {
    enabled: guided,
    stage: "select",
    practicedUndo: false,
    completed: !guided,
  };
  if (!guided) {
    tutorialRuntime.enabled = false;
    tutorialRuntime.completed = true;
    localStorage.setItem(TUTORIAL_KEY, "skipped");
  }
  selectedVillageId = null;
  planHistory = [];
  elements.openingScreen.hidden = true;
  elements.gameShell.hidden = false;
  CreateStaticMap();
  RenderAll();
  Announce(`战役开始。第${gameState.turn}旬，先查看本旬任务与敌情。`);
}

function RestartGame(guided = true) {
  localStorage.removeItem(SAVE_KEY);
  CloseAllModals(false);
  StartGame({ guided });
  ShowToast(guided ? "教学战役已重新开始。" : "自由推演已重新开始。", "good");
}

function SaveGame() {
  if (!gameState) return;
  const envelope = {
    saveVersion: SAVE_VERSION,
    rulesVersion: CFG.rulesVersion,
    state: gameState,
    tutorialRuntime,
    selectedVillageId,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(envelope));
    elements.continueButton.hidden = false;
  } catch (error) {
    console.warn("PeopleWar save failed", error);
  }
}

function ReadSave() {
  try {
    const rawSave = localStorage.getItem(SAVE_KEY);
    if (!rawSave) return null;
    const envelope = JSON.parse(rawSave);
    if (envelope.saveVersion !== SAVE_VERSION || envelope.rulesVersion !== CFG.rulesVersion) return null;
    if (!envelope.state || !Number.isInteger(envelope.state.turn) || !envelope.state.villages) return null;
    if (envelope.state.turn < 1 || envelope.state.turn > CFG.maximumTurns) return null;
    return envelope;
  } catch {
    return null;
  }
}

function HasValidSave() {
  return Boolean(ReadSave());
}

function ContinueGame() {
  const envelope = ReadSave();
  if (!envelope) {
    elements.continueButton.hidden = true;
    ShowToast("没有找到可继续的战役。", "bad");
    return;
  }
  StartGame({
    guided: envelope.tutorialRuntime?.enabled !== false,
    state: envelope.state,
    tutorial: envelope.tutorialRuntime,
  });
  selectedVillageId = envelope.selectedVillageId && gameState.villages[envelope.selectedVillageId]
    ? envelope.selectedVillageId
    : null;
  RenderAll();
  if (tutorialRuntime.stage === "debrief" && gameState.lastResolution) {
    ShowResolution(gameState.lastResolution);
  } else if (gameState.status === "completed") {
    ShowOutcome(gameState.outcome ?? CalculateOutcome(gameState));
  }
}

function SkipTutorial() {
  tutorialRuntime.enabled = false;
  tutorialRuntime.completed = true;
  tutorialRuntime.stage = "free";
  localStorage.setItem(TUTORIAL_KEY, "skipped");
  ShowToast("引导已关闭；规则、预测和撤销功能仍全部可用。", "good");
  RenderAll();
}

function HandleDocumentClick(event) {
  const actionButton = event.target.closest("[data-action-id]");
  if (actionButton && !actionButton.disabled) {
    HandleActionQueue(actionButton.dataset.actionId, actionButton.dataset.mode ? { mode: actionButton.dataset.mode } : {});
    return;
  }
  const removeButton = event.target.closest("[data-remove-plan-id]");
  if (removeButton) {
    HandleRemovePlan(removeButton.dataset.removePlanId);
    return;
  }
  const closeButton = event.target.closest("[data-close-modal]");
  if (closeButton) {
    CloseAllModals();
    return;
  }
  const modalActionButton = event.target.closest("[data-modal-action]");
  if (!modalActionButton) return;
  const action = modalActionButton.dataset.modalAction;
  if (action === "commit") CommitTurn();
  else if (action === "history") OpenHistoryModal(modalActionButton);
  else if (action === "rules") OpenRulesModal(modalActionButton);
  else if (action === "restart") ShowRestartConfirmation(false);
  else if (action === "confirm-restart") RestartGame(tutorialRuntime.enabled);
  else if (action === "confirm-new-game") ConfirmNewGame();
  else if (action === "restart-tutorial") RequestNewGame(true);
  else if (action === "return-outcome") ShowOutcome(gameState.outcome ?? CalculateOutcome(gameState));
}

function HandleKeyboard(event) {
  const modalOpen = !elements.modalBackdrop.hidden;
  if (modalOpen && TrapModalFocus(event)) return;
  if (event.key === "Escape" && modalOpen) {
    event.preventDefault();
    if (!elements.resolutionModal.hidden || !elements.outcomeModal.hidden) return;
    CloseAllModals();
    return;
  }
  if (!gameState || modalOpen) return;
  const activeTag = document.activeElement?.tagName;
  const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    RequestCommit();
  } else if (event.key === "Enter" && !isTyping && !["BUTTON", "A"].includes(activeTag)) {
    event.preventDefault();
    RequestCommit();
  } else if (!isTyping && event.key.toLowerCase() === "u") {
    event.preventDefault();
    UndoLastPlan();
  }
}

function BindEvents() {
  elements.startGuidedButton.addEventListener("click", () => RequestNewGame(true));
  elements.startFreeButton.addEventListener("click", () => RequestNewGame(false));
  elements.continueButton.addEventListener("click", ContinueGame);
  elements.openingHistoryButton.addEventListener("click", (event) => OpenHistoryModal(event.currentTarget));
  elements.historyButton.addEventListener("click", (event) => OpenHistoryModal(event.currentTarget));
  elements.rulesButton.addEventListener("click", (event) => OpenRulesModal(event.currentTarget));
  elements.menuButton.addEventListener("click", (event) => OpenMenuModal(event.currentTarget));
  elements.skipTutorialButton.addEventListener("click", SkipTutorial);
  elements.toggleBriefingButton.addEventListener("click", () => {
    const compact = elements.briefingPanel.classList.toggle("isCompact");
    elements.toggleBriefingButton.textContent = compact ? "›" : "‹";
    elements.toggleBriefingButton.setAttribute("aria-expanded", String(!compact));
    elements.toggleBriefingButton.setAttribute("aria-label", compact ? "展开任务面板" : "收起任务面板");
  });
  elements.closeInspectorButton.addEventListener("click", () => {
    selectedVillageId = null;
    RenderAll();
  });
  elements.undoPlanButton.addEventListener("click", UndoLastPlan);
  elements.clearPlanButton.addEventListener("click", ClearPlans);
  elements.commitTurnButton.addEventListener("click", RequestCommit);
  elements.nextTurnButton.addEventListener("click", ContinueAfterResolution);
  elements.restartButton.addEventListener("click", () => ShowRestartConfirmation(true));
  elements.modalBackdrop.addEventListener("click", () => {
    if (!elements.standardModal.hidden) CloseAllModals();
  });
  document.querySelectorAll(".layerButton").forEach((button) => {
    button.addEventListener("click", () => {
      currentLayer = button.dataset.layer;
      RenderLayer();
    });
  });
  document.querySelectorAll(".resourceChip[data-resource]").forEach((button) => {
    button.addEventListener("click", () => OpenResourceModal(button.dataset.resource, button));
  });
  document.addEventListener("click", HandleDocumentClick);
  document.addEventListener("keydown", HandleKeyboard);
}

function InstallTestSurface() {
  if (!new URLSearchParams(window.location.search).has("test")) return;
  window.PeopleWarTest = Object.freeze({
    GetState: () => DeepClone(gameState),
    GetTutorial: () => DeepClone(tutorialRuntime),
    Start: (guided = true) => StartGame({ guided }),
    SelectVillage,
    Queue: (actionId, villageId, options = {}) => {
      selectedVillageId = villageId;
      HandleActionQueue(actionId, options);
      return DeepClone(gameState);
    },
    RemoveLastPlan: () => {
      UndoLastPlan();
      return DeepClone(gameState);
    },
    Commit: () => {
      CommitTurn();
      return DeepClone(gameState);
    },
    CloseResolution: ContinueAfterResolution,
    Snapshot: () => ({
      turn: gameState?.turn,
      selectedVillageId,
      plans: DeepClone(gameState?.plans ?? []),
      modal: elements.resolutionModal.hidden ? (elements.outcomeModal.hidden ? "none" : "outcome") : "resolution",
    }),
  });
}

function Initialize() {
  CacheElements();
  BindEvents();
  CreateStaticMap();
  elements.continueButton.hidden = !HasValidSave();
  InstallTestSurface();
}

Initialize();
