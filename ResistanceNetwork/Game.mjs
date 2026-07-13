import {
  mapNodes,
  mapConnections,
  policies,
  actions,
  historicalAnchors,
  turnCalendar,
  CreateGameState,
  GetActionPreview,
  ExecuteAction,
  EndTurn,
  SetPolicy,
  SerializeGame,
  DeserializeGame,
  GetFinalScore,
} from "./Rules.mjs";
import {
  designPrinciples,
  timelineEntries,
  guideSections,
  sourceLinks,
  situationalNotes,
} from "./Data_History.mjs";

const saveKey = "ResistanceNetwork_Save_V1";
const settingsKey = "ResistanceNetwork_Settings_V1";
const svgNamespace = "http://www.w3.org/2000/svg";
const blockingLayerSelector = ".opening-screen, .modal-layer, .drawer-layer, .tutorial-overlay, .outcome-screen";
const networkLevelNames = ["尚未开辟", "联络点", "工作区", "巩固根据地"];
const terrainNames = {
  Mountain: "山地",
  Hills: "丘陵",
  Plain: "平原",
  Water: "水网平原",
  Coast: "沿海",
  River: "河网",
};
const fallbackCoordinates = {
  NorthYue: [245, 143],
  CentralHebei: [505, 182],
  WestBeijing: [352, 106],
  EastHebei: [675, 105],
  Taihang: [267, 285],
  Taiyue: [175, 405],
  SouthHebei: [438, 310],
  HebeiShandongHenan: [480, 430],
  CentralShandong: [665, 302],
  Jiaodong: [842, 255],
  Binhai: [785, 400],
  Qinghe: [618, 392],
  NorthJiangsu: [720, 520],
  NorthAnhui: [570, 560],
  SouthAnhui: [544, 655],
  HubeiHenanAnhui: [354, 567],
};
const actionGlyphs = {
  OpenContact: "联",
  RootDevelopment: "根",
  ScoutRoute: "察",
  BuildNetwork: "根",
  InvestigateRoute: "察",
  DisruptRoute: "破",
  ConcealAndTransfer: "转",
  ProduceAndCare: "护",
  EstablishContact: "联",
  RootBuilding: "根",
  ReconRoute: "察",
  SabotageRoute: "破",
  HiddenTransfer: "转",
  ProductionRelief: "护",
};
const tutorialSteps = [
  {
    focusId: "networkMap",
    title: "先看网络，不看疆界",
    text: "点击区域节点查看详情。节点等级表示联络和群众工作能否维持，并不表示领土归属。",
  },
  {
    focusId: "detailPanel",
    title: "让骨干队带着任务走",
    text: "选择一支骨干队，再下达部署命令。队伍疲劳、当地信任与敌方压力共同决定行动风险。",
  },
  {
    focusId: "forecastTitle",
    title: "情报用来避免硬碰硬",
    text: "侦察会积累情报并提前揭示封锁或扫荡目标。预警出现时，隐蔽转移往往比正面硬扛更重要。",
  },
  {
    focusId: "endTurnButton",
    title: "行动之后，敌方也会回应",
    text: "每季有2次部署。结束本季后，敌方会封锁、扫荡、清乡或修复交通，随后进入下一季度。",
  },
];

let gameState = null;
let selectedNodeId = "Taihang";
let selectedTeamId = null;
let pendingActionId = null;
let pendingPolicyIds = [];
let displayedAnchorIds = new Set();
let tutorialIndex = 0;
let tutorialPending = false;
let endTurnArmed = false;
let restartArmed = false;
let soundEnabled = false;
let audioContext = null;
let activeHistoryTab = "premise";
const layerFocusReturns = new WeakMap();

function GetElement(id) {
  return document.getElementById(id);
}

function AsEntries(collection) {
  if (Array.isArray(collection)) {
    return collection.map((item, index) => ({ ...item, id: item.id || item.key || String(index) }));
  }
  return Object.entries(collection || {}).map(([id, item]) => ({ ...item, id: item.id || id }));
}

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function EscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function GetNodeDefinition(nodeId) {
  return AsEntries(mapNodes).find((node) => node.id === nodeId) || AsEntries(mapNodes)[0];
}

function GetNodeState(nodeId) {
  return gameState?.nodes?.[nodeId] || {
    networkLevel: 0,
    trust: 0,
    exposure: 0,
    pressure: 0,
    defense: 0,
  };
}

function GetDefinitionName(definition, fallback = "未命名") {
  return definition?.name || definition?.label || definition?.title || fallback;
}

function GetNodeCoordinate(node, index = 0) {
  const fallback = fallbackCoordinates[node.id] || [170 + (index % 5) * 160, 140 + Math.floor(index / 5) * 165];
  const rawX = node.x ?? node.position?.x ?? node.coordinates?.[0] ?? fallback[0];
  const rawY = node.y ?? node.position?.y ?? node.coordinates?.[1] ?? fallback[1];
  return [Number(rawX), Number(rawY)];
}

function GetConnectionEnds(connection) {
  const nodeIds = connection.nodes || connection.nodeIds || connection.ends;
  return [
    connection.from || connection.source || nodeIds?.[0],
    connection.to || connection.target || nodeIds?.[1],
  ];
}

function GetConnectionKind(connection) {
  const rawKind = String(connection.kind || connection.type || connection.category || "Local").toLowerCase();
  return rawKind.includes("rail") || rawKind.includes("trunk") || rawKind.includes("enemy") ? "railway" : "local";
}

function GetCalendarLabel() {
  if (gameState?.calendar?.label) return gameState.calendar.label;
  const entry = turnCalendar?.[gameState?.turn - 1];
  return entry?.label || `${gameState?.calendar?.year || 1938}年 · ${gameState?.calendar?.quarter || "冬"}`;
}

function FormatSigned(value) {
  const numberValue = Number(value) || 0;
  return `${numberValue > 0 ? "+" : ""}${numberValue}`;
}

function FormatCosts(costs) {
  const labels = { supplies: "粮", intelligence: "情报", safety: "安全", contribution: "贡献" };
  const parts = Object.entries(costs || {})
    .filter(([, value]) => Number(value) !== 0)
    .map(([key, value]) => `${labels[key] || key} ${value}`);
  return parts.length ? parts.join(" · ") : "无需额外物资";
}

function GetActionGlyph(actionId, index) {
  if (actionGlyphs[actionId]) return actionGlyphs[actionId];
  const lowered = actionId.toLowerCase();
  if (lowered.includes("contact") || lowered.includes("open")) return "联";
  if (lowered.includes("build") || lowered.includes("root")) return "根";
  if (lowered.includes("recon") || lowered.includes("invest")) return "察";
  if (lowered.includes("disrupt") || lowered.includes("sabot")) return "破";
  if (lowered.includes("transfer") || lowered.includes("conceal")) return "转";
  if (lowered.includes("produce") || lowered.includes("care")) return "护";
  return String(index + 1).padStart(2, "0");
}

function GetRiskLabel(preview) {
  const rawRisk = String(preview?.risk || "").toLowerCase();
  if (rawRisk.includes("low") || rawRisk.includes("低")) return { text: "风险较低", className: "risk-low" };
  if (rawRisk.includes("high") || rawRisk.includes("高")) return { text: "风险较高", className: "risk-high" };
  return { text: "风险中等", className: "risk-medium" };
}

function GetActiveNodes() {
  return Object.entries(gameState?.nodes || {}).filter(([, node]) => Number(node.networkLevel) > 0);
}

function GetActiveConnectionCount() {
  return AsEntries(mapConnections).filter((connection) => {
    if (GetConnectionKind(connection) !== "local") return false;
    const [fromId, toId] = GetConnectionEnds(connection);
    return GetNodeState(fromId).networkLevel > 0 && GetNodeState(toId).networkLevel > 0;
  }).length;
}

function GetDisruptedRouteCount() {
  return Object.values(gameState?.routes || {}).filter((route) => Number(route.disruptedTurns) > 0).length;
}

function GetCurrentScorePreview() {
  if (!gameState) return 0;
  const score = GetFinalScore(gameState);
  return typeof score === "number" ? score : Number(score?.total || 0);
}

function GetTurnDelta(resourceName) {
  const report = gameState?.lastTurnReport || {};
  let delta = report.resourceDelta?.[resourceName] ?? report.resources?.[resourceName] ?? report[`${resourceName}Delta`];
  if (delta === undefined && resourceName === "supplies") {
    delta = Number(report.economy?.supplyChange || 0) + Number(report.rewards?.supplies || 0);
  } else if (delta === undefined && resourceName === "intelligence") {
    delta = Number(report.economy?.intelligenceIncome || 0) + Number(report.rewards?.intelligence || 0);
  } else if (delta === undefined && resourceName === "safety" && report.rewards) {
    delta = Number(report.rewards.safety || 0);
  }
  return Number.isFinite(Number(delta)) ? Number(delta) : null;
}

function GetTopBlockingLayer() {
  return [...document.querySelectorAll(blockingLayerSelector)]
    .filter((element) => !element.hidden && getComputedStyle(element).display !== "none")
    .sort((leftElement, rightElement) => {
      const leftIndex = Number.parseInt(getComputedStyle(leftElement).zIndex, 10) || 0;
      const rightIndex = Number.parseInt(getComputedStyle(rightElement).zIndex, 10) || 0;
      return leftIndex - rightIndex;
    })
    .at(-1) || null;
}

function GetFocusableElements(layer) {
  if (!layer) return [];
  return [...layer.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && getComputedStyle(element).visibility !== "hidden" && element.getClientRects().length > 0);
}

function GetPreferredLayerFocus(layer) {
  const preferredSelectors = [
    "#newGameButton",
    ".event-choice.primary",
    "#nextTutorialButton",
    ".policy-option",
    "#resumeButton",
    ".history-tabs button.active",
    "#outcomeRestartButton",
    ".panel-close",
    "button:not([disabled])",
  ];
  for (const selector of preferredSelectors) {
    const candidate = layer?.querySelector(selector);
    if (candidate && !candidate.hidden && getComputedStyle(candidate).visibility !== "hidden" && candidate.getClientRects().length > 0) return candidate;
  }
  return null;
}

function SyncBlockingLayers(shouldMoveFocus = true) {
  const topLayer = GetTopBlockingLayer();
  const managedElements = [GetElement("gameShell"), ...document.querySelectorAll(blockingLayerSelector)].filter(Boolean);
  managedElements.forEach((element) => {
    element.inert = Boolean(topLayer && element !== topLayer);
  });
  if (!shouldMoveFocus || !topLayer || topLayer.contains(document.activeElement)) return;
  window.requestAnimationFrame(() => GetPreferredLayerFocus(GetTopBlockingLayer())?.focus());
}

function SetLayerHidden(elementOrId, hidden) {
  const element = typeof elementOrId === "string" ? GetElement(elementOrId) : elementOrId;
  if (!element) return;
  if (!hidden && element.hidden) layerFocusReturns.set(element, document.activeElement);
  const returnTarget = hidden ? layerFocusReturns.get(element) : null;
  element.hidden = hidden;
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
  SyncBlockingLayers(!hidden);
  if (hidden) {
    window.requestAnimationFrame(() => {
      const topLayer = GetTopBlockingLayer();
      if (topLayer) GetPreferredLayerFocus(topLayer)?.focus();
      else if (returnTarget?.isConnected && !returnTarget.inert) returnTarget.focus();
    });
  }
}

function HandleLayerFocusTrap(event) {
  if (event.key !== "Tab") return false;
  const topLayer = GetTopBlockingLayer();
  if (!topLayer) return false;
  const focusableElements = GetFocusableElements(topLayer);
  if (!focusableElements.length) {
    event.preventDefault();
    return true;
  }
  const currentIndex = focusableElements.indexOf(document.activeElement);
  if (event.shiftKey && currentIndex <= 0) {
    event.preventDefault();
    focusableElements.at(-1).focus();
    return true;
  }
  if (!event.shiftKey && (currentIndex === -1 || currentIndex === focusableElements.length - 1)) {
    event.preventDefault();
    focusableElements[0].focus();
    return true;
  }
  return false;
}

function GetSavedSettings() {
  try {
    return JSON.parse(localStorage.getItem(settingsKey) || "{}") || {};
  } catch {
    return {};
  }
}

function SaveSettings() {
  localStorage.setItem(settingsKey, JSON.stringify({ soundEnabled }));
}

function SaveGame(showNotice = false) {
  if (!gameState) return;
  try {
    localStorage.setItem(saveKey, SerializeGame(gameState));
    GetElement("autosaveLabel").textContent = showNotice ? "进度已保存" : "刚刚自动保存";
    window.setTimeout(() => {
      if (GetElement("autosaveLabel")) GetElement("autosaveLabel").textContent = "自动保存已开启";
    }, 1800);
    RefreshContinueButton();
  } catch (error) {
    ShowToast(`无法保存进度：${error.message}`, "warning");
  }
}

function LoadSavedGame() {
  const serialized = localStorage.getItem(saveKey);
  if (!serialized) return null;
  try {
    return DeserializeGame(serialized);
  } catch {
    localStorage.removeItem(saveKey);
    return null;
  }
}

function RefreshContinueButton() {
  const continueButton = GetElement("continueButton");
  const continueSummary = GetElement("continueSummary");
  const savedState = LoadSavedGame();
  if (!continueButton || !continueSummary) return;
  continueButton.hidden = !savedState;
  if (savedState) {
    continueSummary.textContent = `${savedState.calendar?.label || `第${savedState.turn}季`} · ${savedState.actionPoints ?? 0} 次部署可用`;
  }
}

function CreateSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(svgNamespace, tagName);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
}

function BuildMap() {
  const linkLayer = GetElement("linkLayer");
  const railLayer = GetElement("railLayer");
  const nodeLayer = GetElement("nodeLayer");
  if (!linkLayer || !railLayer || !nodeLayer) return;
  linkLayer.replaceChildren();
  railLayer.replaceChildren();
  nodeLayer.replaceChildren();

  const nodeEntries = AsEntries(mapNodes);
  const nodeLookup = Object.fromEntries(nodeEntries.map((node, index) => [node.id, { node, index }]));
  AsEntries(mapConnections).forEach((connection, index) => {
    const [fromId, toId] = GetConnectionEnds(connection);
    const fromEntry = nodeLookup[fromId];
    const toEntry = nodeLookup[toId];
    if (!fromEntry || !toEntry) return;
    const [x1, y1] = GetNodeCoordinate(fromEntry.node, fromEntry.index);
    const [x2, y2] = GetNodeCoordinate(toEntry.node, toEntry.index);
    const curve = Number(connection.curve ?? ((index % 3) - 1) * 12);
    const middleX = (x1 + x2) / 2 + (y2 - y1) / Math.max(8, Math.hypot(x2 - x1, y2 - y1)) * curve;
    const middleY = (y1 + y2) / 2 - (x2 - x1) / Math.max(8, Math.hypot(x2 - x1, y2 - y1)) * curve;
    const kind = GetConnectionKind(connection);
    const path = CreateSvgElement("path", {
      id: `connection_${connection.id}`,
      d: `M ${x1} ${y1} Q ${middleX} ${middleY} ${x2} ${y2}`,
      class: `map-connection ${kind}`,
      "data-connection-id": connection.id,
      "data-from": fromId,
      "data-to": toId,
    });
    (kind === "railway" ? railLayer : linkLayer).append(path);
  });

  nodeEntries.forEach((node, index) => {
    const [x, y] = GetNodeCoordinate(node, index);
    const group = CreateSvgElement("g", {
      id: `node_${node.id}`,
      class: "node-group",
      transform: `translate(${x} ${y})`,
      tabindex: "0",
      role: "button",
      "aria-label": `${GetDefinitionName(node)}区域`,
      "data-node-id": node.id,
    });
    const halo = CreateSvgElement("circle", { class: "node-halo", r: "31" });
    const warning = CreateSvgElement("circle", { class: "node-warning-ring", r: "26" });
    const outer = CreateSvgElement("circle", { class: "node-outer", r: "19" });
    const circle = CreateSvgElement("circle", { class: "node-circle", r: "13" });
    const core = CreateSvgElement("circle", { class: "node-core", r: "4" });
    const label = CreateSvgElement("text", { class: "node-label", x: "0", y: "40", "text-anchor": "middle" });
    label.textContent = GetDefinitionName(node);
    const status = CreateSvgElement("text", { class: "node-status", x: "0", y: "54", "text-anchor": "middle" });
    status.textContent = "尚未开辟";
    group.append(halo, warning, outer, circle, core, label, status);
    group.addEventListener("click", () => SelectNode(node.id));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        SelectNode(node.id);
      }
    });
    nodeLayer.append(group);
  });
}

function UpdateMap() {
  if (!gameState) return;
  const enemyTargets = new Set([
    gameState.enemyPlan?.targetNodeId,
    gameState.enemyPlan?.target,
    ...(gameState.enemyPlan?.targetNodeIds || []),
  ].filter(Boolean));

  AsEntries(mapConnections).forEach((connection) => {
    const path = GetElement(`connection_${connection.id}`);
    if (!path) return;
    const [fromId, toId] = GetConnectionEnds(connection);
    const kind = GetConnectionKind(connection);
    const routeState = gameState.routes?.[connection.id] || {};
    const active = GetNodeState(fromId).networkLevel > 0 && GetNodeState(toId).networkLevel > 0;
    path.classList.toggle("active", kind === "local" && active);
    path.classList.toggle("dormant", kind === "local" && !active);
    path.classList.toggle("disrupted", kind === "railway" && Number(routeState.disruptedTurns) > 0);
    path.classList.toggle("fortified", kind === "railway" && Number(routeState.fortification) > 0);
  });

  AsEntries(mapNodes).forEach((node) => {
    const group = GetElement(`node_${node.id}`);
    if (!group) return;
    const nodeState = GetNodeState(node.id);
    const level = Clamp(nodeState.networkLevel, 0, 3);
    group.classList.remove("level-0", "level-1", "level-2", "level-3");
    group.classList.add(`level-${level}`);
    group.classList.toggle("selected", node.id === selectedNodeId);
    group.classList.toggle("threatened", enemyTargets.has(node.id));
    group.classList.toggle("exposed", Number(nodeState.exposure) >= 65);
    group.querySelector(".node-status").textContent = networkLevelNames[level];
    group.setAttribute("aria-label", `${GetDefinitionName(node)}，${networkLevelNames[level]}，群众信任${Math.round(nodeState.trust || 0)}，敌方压力${nodeState.pressure || 0}`);
  });

  RenderTeamsOnMap();
}

function ActivateTeamMarker(teamId, team) {
  selectedTeamId = teamId;
  selectedNodeId = team.nodeId;
  pendingActionId = null;
  RenderGame();
  PlaySound("select");
}

function RenderTeamsOnMap() {
  const teamLayer = GetElement("teamLayer");
  if (!teamLayer) return;
  teamLayer.replaceChildren();
  const nodeEntries = AsEntries(mapNodes);
  const nodeLookup = Object.fromEntries(nodeEntries.map((node, index) => [node.id, GetNodeCoordinate(node, index)]));
  const perNodeCount = {};
  Object.entries(gameState?.teams || {}).forEach(([teamId, team]) => {
    const coordinate = nodeLookup[team.nodeId];
    if (!coordinate) return;
    const offsetIndex = perNodeCount[team.nodeId] || 0;
    perNodeCount[team.nodeId] = offsetIndex + 1;
    const x = coordinate[0] + 24 + offsetIndex * 18;
    const y = coordinate[1] - 23 + (offsetIndex % 2) * 16;
    const group = CreateSvgElement("g", {
      class: `team-marker${teamId === selectedTeamId ? " selected" : ""}${Number(team.fatigue) >= 70 ? " exhausted" : ""}`,
      transform: `translate(${x} ${y})`,
      role: "button",
      tabindex: "0",
      "aria-label": `${team.name || teamId}，疲劳${team.fatigue || 0}`,
    });
    const back = CreateSvgElement("circle", { r: "11" });
    const label = CreateSvgElement("text", { "text-anchor": "middle", y: "4" });
    label.textContent = String(team.level || 1);
    group.append(back, label);
    group.addEventListener("click", (event) => {
      event.stopPropagation();
      ActivateTeamMarker(teamId, team);
    });
    group.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      ActivateTeamMarker(teamId, team);
    });
    teamLayer.append(group);
  });
}

function SelectNode(nodeId) {
  selectedNodeId = nodeId;
  pendingActionId = null;
  const teamsHere = Object.entries(gameState?.teams || {}).filter(([, team]) => team.nodeId === nodeId);
  if (teamsHere.length) selectedTeamId = teamsHere[0][0];
  UpdateMap();
  RenderDetailPanel();
  GetElement("detailPanel")?.classList.add("mobile-open");
  PlaySound("select");
}

function RenderHeader() {
  if (!gameState) return;
  GetElement("dateLabel").textContent = GetCalendarLabel();
  GetElement("turnLabel").textContent = `第 ${gameState.turn} / ${gameState.maxTurns || 28} 季`;
  const turnProgress = ((gameState.turn - 1) / Math.max(1, (gameState.maxTurns || 28) - 1)) * 100;
  GetElement("timeFill").style.width = `${Clamp(turnProgress, 0, 100)}%`;

  const resources = gameState.resources || {};
  GetElement("grainValue").textContent = Math.round(resources.supplies || 0);
  GetElement("intelValue").textContent = Math.round(resources.intelligence || 0);
  GetElement("safetyValue").textContent = Math.round(resources.safety || 0);
  GetElement("contributionValue").textContent = Math.round(resources.contribution || 0);
  const suppliesDelta = GetTurnDelta("supplies");
  const intelligenceDelta = GetTurnDelta("intelligence");
  const safetyDelta = GetTurnDelta("safety");
  GetElement("grainDelta").textContent = suppliesDelta === null ? "储备" : FormatSigned(suppliesDelta);
  GetElement("intelDelta").textContent = intelligenceDelta === null ? "研判" : FormatSigned(intelligenceDelta);
  GetElement("safetyDelta").textContent = safetyDelta === null ? "底线" : FormatSigned(safetyDelta);
  GetElement("contributionDelta").textContent = "累计";

  GetElement("ordersLabel").textContent = `${gameState.actionPoints ?? 0} / 2`;
  const orderPips = GetElement("orderPips").querySelectorAll("i");
  orderPips.forEach((pip, index) => pip.classList.toggle("spent", index >= Number(gameState.actionPoints || 0)));
  GetElement("endTurnHint").textContent = gameState.actionPoints > 0 ? `尚有 ${gameState.actionPoints} 次部署` : "等待敌方行动结算";
  GetElement("endTurnButton").classList.toggle("ready", gameState.actionPoints === 0);

  const activeNodes = GetActiveNodes().length;
  GetElement("activeRegionsValue").textContent = activeNodes;
  GetElement("connectionsValue").textContent = GetActiveConnectionCount();
  GetElement("railValue").textContent = GetDisruptedRouteCount();
  GetElement("teamValue").textContent = Object.keys(gameState.teams || {}).length;
  GetElement("scoreValue").textContent = `${GetCurrentScorePreview()} 分`;
}

function RenderSituation() {
  const turn = Number(gameState?.turn || 1);
  let tag = "建立联络";
  let text = "武汉、广州失守后，抗日战争进入战略相持阶段。先在封锁线之间保存并联结敌后工作网络。";
  if (turn >= 6 && turn <= 9) {
    tag = "破袭与反制";
    text = "交通线破袭正在扩大。每一次高强度行动都会带来报复性压力，必须给恢复与群众防护留出余地。";
  } else if (turn >= 10 && turn <= 17) {
    tag = "最困难时期";
    text = "封锁、蚕食与反复扫荡进入高峰。保存群众、交通和骨干，比守住每一个节点更重要。";
  } else if (turn >= 18 && turn <= 22) {
    tag = "生产恢复";
    text = "通过精兵简政、生产自救与群众工作恢复元气，重新联结被切断的区域。";
  } else if (turn >= 23) {
    tag = "局部反攻";
    text = "敌后战场转入攻势恢复阶段。扩大贡献的同时，仍要把完整网络和群众安全保存到最后。";
  }
  GetElement("situationTag").textContent = tag;
  GetElement("situationText").textContent = text;

  const plan = gameState.enemyPlan || {};
  const planTitle = plan.name || plan.title || plan.behaviorName || "敌军动向不明";
  const targetIds = [plan.targetNodeId, plan.target, ...(plan.targetNodeIds || [])].filter(Boolean);
  const targetNames = targetIds.map((id) => GetDefinitionName(GetNodeDefinition(id), id));
  const planDescription = plan.description || plan.hint || (targetNames.length
    ? `交通员报告：可能指向${targetNames.join("、")}。可先侦察，再决定是否转移。`
    : "情报有限：敌军正在调动，但目标尚不明确。侦察交通可提高下一步研判精度。");
  GetElement("forecastTitle").textContent = planTitle;
  GetElement("forecastText").textContent = planDescription;
  const threatLevel = Clamp(plan.intensity || plan.level || 1, 1, 5);
  GetElement("forecastLevel").querySelectorAll("i").forEach((pip, index) => pip.classList.toggle("active", index < threatLevel));
}

function RenderPolicies() {
  const selectedPolicies = gameState?.selectedPolicies || [];
  const definitions = AsEntries(policies);
  GetElement("policyList").querySelectorAll(".policy-token").forEach((token, index) => {
    const policyId = selectedPolicies[index];
    const definition = definitions.find((item) => item.id === policyId);
    token.classList.toggle("active", Boolean(definition));
    token.querySelector("span").textContent = definition ? GetDefinitionName(definition) : "尚未制定";
    token.querySelector("small").textContent = definition ? (definition.short || definition.summary || definition.description || "年度工作方针") : (index ? "可并行两项方针" : "选择年度工作重点");
  });
  const changesRemaining = Number(gameState?.policyChangesRemaining ?? 0);
  GetElement("policyButton").textContent = changesRemaining > 0 ? "调整" : "本年已定";
  GetElement("policyButton").disabled = changesRemaining <= 0;
}

function RenderDetailPanel() {
  if (!gameState) return;
  const nodeDefinition = GetNodeDefinition(selectedNodeId);
  if (!nodeDefinition) return;
  const nodeState = GetNodeState(selectedNodeId);
  const level = Clamp(nodeState.networkLevel, 0, 3);
  const terrainId = nodeDefinition.terrain || nodeDefinition.terrainType || "Plain";
  const terrainName = terrainNames[terrainId] || nodeDefinition.terrainName || terrainId;
  GetElement("regionType").textContent = `${terrainName} · ${nodeDefinition.group || nodeDefinition.theater || "敌后工作区"}`;
  GetElement("regionName").textContent = GetDefinitionName(nodeDefinition);
  GetElement("regionSubtitle").textContent = `${nodeDefinition.area || nodeDefinition.region || "敌后交通网络"} · 联络网络等级 ${level}`;
  GetElement("supportValue").textContent = Math.round(nodeState.trust || 0);
  GetElement("supportMeter").style.width = `${Clamp(nodeState.trust, 0, 100)}%`;
  GetElement("exposureValue").textContent = Math.round(nodeState.exposure || 0);
  GetElement("exposureMeter").style.width = `${Clamp(nodeState.exposure, 0, 100)}%`;
  GetElement("pressureValue").textContent = Math.round(nodeState.pressure || 0);
  GetElement("pressurePips").querySelectorAll("i").forEach((pip, index) => pip.classList.toggle("active", index < Number(nodeState.pressure || 0)));
  GetElement("terrainTag").textContent = terrainName;
  GetElement("networkTag").textContent = networkLevelNames[level];
  GetElement("structureTag").textContent = nodeState.structureName || nodeState.projectName || (Number(nodeState.defense) > 0 ? `防护 +${nodeState.defense}` : "无专项建设");
  GetElement("structureTag").classList.toggle("muted", !nodeState.structureName && !nodeState.projectName && !nodeState.defense);
  RenderTeamCards();
  RenderActionCards();
  RenderActionPreview();
}

function RenderTeamCards() {
  const teamCards = GetElement("teamCards");
  teamCards.replaceChildren();
  const teamEntries = Object.entries(gameState?.teams || {});
  if (!teamEntries.length) {
    teamCards.innerHTML = '<p class="empty-state">当前没有可调度的骨干队。</p>';
    return;
  }
  teamEntries.forEach(([teamId, team], index) => {
    const nodeDefinition = GetNodeDefinition(team.nodeId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `team-card${teamId === selectedTeamId ? " selected" : ""}${Number(team.fatigue) >= 70 ? " tired" : ""}`;
    button.innerHTML = `
      <span class="team-badge">${EscapeHtml(team.callSign || team.name?.slice(0, 1) || String(index + 1))}</span>
      <span class="team-copy"><strong>${EscapeHtml(team.name || `第${index + 1}骨干队`)}</strong><small>${EscapeHtml(GetDefinitionName(nodeDefinition, team.nodeId))} · 等级 ${team.level || 1}</small></span>
      <span class="fatigue"><small>疲劳</small><b>${Math.round(team.fatigue || 0)}</b></span>`;
    button.addEventListener("click", () => {
      selectedTeamId = teamId;
      pendingActionId = null;
      RenderDetailPanel();
      UpdateMap();
      PlaySound("select");
    });
    teamCards.append(button);
  });
  const selectedTeam = gameState.teams?.[selectedTeamId];
  GetElement("teamHint").textContent = selectedTeam
    ? `${selectedTeam.nodeId === selectedNodeId ? "本区" : "异地"} · 疲劳 ${Math.round(selectedTeam.fatigue || 0)}`
    : "选择一支可用队伍";
}

function RenderActionCards() {
  const actionGrid = GetElement("actionGrid");
  actionGrid.replaceChildren();
  const actionEntries = AsEntries(actions);
  actionEntries.forEach((action, index) => {
    const preview = GetActionPreview(gameState, action.id, selectedNodeId, selectedTeamId);
    const risk = GetRiskLabel(preview);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `action-card ${risk.className}${action.id === pendingActionId ? " selected" : ""}`;
    button.disabled = gameState.status !== "active";
    button.setAttribute("aria-pressed", action.id === pendingActionId ? "true" : "false");
    button.innerHTML = `
      <span class="action-glyph" aria-hidden="true">${GetActionGlyph(action.id, index)}</span>
      <span class="action-copy"><strong>${EscapeHtml(GetDefinitionName(action))}</strong><small>${EscapeHtml(action.short || action.summary || action.description || "部署一项敌后工作")}</small></span>
      <span class="action-state ${preview.legal ? "legal" : "blocked"}">${preview.legal ? risk.text : "条件不足"}</span>`;
    button.addEventListener("click", () => SelectAction(action.id));
    actionGrid.append(button);
  });
}

function SelectAction(actionId) {
  pendingActionId = pendingActionId === actionId ? null : actionId;
  RenderActionCards();
  RenderActionPreview();
  PlaySound("select");
}

function RenderActionPreview() {
  const container = GetElement("actionPreview");
  if (!pendingActionId) {
    container.className = "action-preview";
    container.innerHTML = "<div><span>选择命令查看风险</span><small>结果取决于情报、信任、地形、压力与队伍疲劳。</small></div>";
    return;
  }
  const action = AsEntries(actions).find((item) => item.id === pendingActionId);
  const preview = GetActionPreview(gameState, pendingActionId, selectedNodeId, selectedTeamId);
  const risk = GetRiskLabel(preview);
  const chance = Number.isFinite(Number(preview.chance)) ? Math.round(Number(preview.chance)) : null;
  const effects = Array.isArray(preview.effects) ? preview.effects.join("；") : (preview.effects || action?.effects || "行动结果将在结算后记录");
  container.className = `action-preview ${preview.legal ? "legal" : "blocked"}`;
  container.innerHTML = `
    <div class="preview-copy">
      <span>${EscapeHtml(GetDefinitionName(action))} · <b class="${risk.className}">${preview.legal ? risk.text : "暂不可执行"}</b>${chance === null ? "" : ` · 成功把握 ${chance}%`}</span>
      <small>${EscapeHtml(preview.legal ? effects : (preview.reason || "当前条件不足"))}</small>
      <em>${EscapeHtml(FormatCosts(preview.costs || action?.costs || action?.cost))}</em>
    </div>
    <button id="confirmActionButton" class="confirm-action-button" type="button" ${preview.legal ? "" : "disabled"}>执行部署</button>`;
  GetElement("confirmActionButton")?.addEventListener("click", ConfirmAction);
}

function ConfirmAction() {
  if (!pendingActionId || !gameState || gameState.status !== "active") return;
  const preview = GetActionPreview(gameState, pendingActionId, selectedNodeId, selectedTeamId);
  if (!preview.legal) {
    ShowToast(preview.reason || "当前条件不足，无法执行。", "warning");
    PlaySound("error");
    return;
  }
  const previousActionPoints = gameState.actionPoints;
  const nextState = ExecuteAction(gameState, pendingActionId, selectedNodeId, selectedTeamId);
  gameState = nextState;
  const resolution = nextState.lastResolution || {};
  const succeeded = resolution.success !== false && nextState.actionPoints < previousActionPoints;
  pendingActionId = null;
  endTurnArmed = false;
  SaveGame();
  RenderGame();
  AnimateNode(selectedNodeId, succeeded ? "success" : "setback");
  ShowToast(resolution.message || resolution.summary || (succeeded ? "部署完成，结果已记入交通电报。" : "行动未能达到预期，队伍已经转入隐蔽。"), succeeded ? "success" : "warning");
  PlaySound(succeeded ? "confirm" : "error");
}

function AnimateNode(nodeId, animationClass) {
  const node = GetElement(`node_${nodeId}`);
  if (!node) return;
  node.classList.remove("pulse-success", "pulse-setback");
  void node.getBoundingClientRect();
  node.classList.add(animationClass === "success" ? "pulse-success" : "pulse-setback");
  window.setTimeout(() => node.classList.remove("pulse-success", "pulse-setback"), 900);
}

function RenderLog() {
  const historyLog = Array.isArray(gameState?.historyLog) ? gameState.historyLog : [];
  const latestEntry = historyLog.at(-1);
  GetElement("latestLog").textContent = latestEntry?.message || latestEntry?.text || "交通员已抵达联络点，等待本季部署。";
  const logList = GetElement("logList");
  logList.replaceChildren();
  historyLog.slice(-40).reverse().forEach((entry) => {
    const item = document.createElement("li");
    item.className = entry.type || entry.kind || "info";
    item.innerHTML = `<time>${EscapeHtml(entry.date || entry.calendar || `第${entry.turn || gameState.turn}季`)}</time><p>${EscapeHtml(entry.message || entry.text || String(entry))}</p>`;
    logList.append(item);
  });
}

function RenderGame() {
  if (!gameState) return;
  if (!GetNodeDefinition(selectedNodeId)) selectedNodeId = AsEntries(mapNodes)[0]?.id;
  if (!selectedTeamId || !gameState.teams?.[selectedTeamId]) selectedTeamId = Object.keys(gameState.teams || {})[0] || null;
  RenderHeader();
  RenderSituation();
  RenderPolicies();
  UpdateMap();
  RenderDetailPanel();
  RenderLog();
}

function EndCurrentTurn() {
  if (!gameState || gameState.status !== "active") return;
  if (gameState.actionPoints > 0 && !endTurnArmed) {
    endTurnArmed = true;
    ShowToast(`本季尚有 ${gameState.actionPoints} 次部署。再次点击即可提前结束。`, "notice");
    GetElement("endTurnButton").classList.add("armed");
    window.setTimeout(() => {
      endTurnArmed = false;
      GetElement("endTurnButton")?.classList.remove("armed");
    }, 3200);
    return;
  }
  const knownAnchors = new Set(gameState.triggeredAnchors || []);
  gameState = EndTurn(gameState);
  endTurnArmed = false;
  pendingActionId = null;
  GetElement("endTurnButton").classList.remove("armed");
  SaveGame();
  RenderGame();
  PlaySound("turn");

  const newAnchorId = (gameState.triggeredAnchors || []).find((anchorId) => !knownAnchors.has(anchorId));
  if (newAnchorId) {
    const anchor = AsEntries(historicalAnchors).find((item) => item.id === newAnchorId);
    if (anchor) ShowHistoricalAnchor(anchor);
  } else if (gameState.lastTurnReport?.message || gameState.lastTurnReport?.summary) {
    ShowToast(gameState.lastTurnReport.message || gameState.lastTurnReport.summary, "notice");
  }

  if (gameState.status !== "active" || gameState.turn > (gameState.maxTurns || 28)) {
    window.setTimeout(ShowOutcome, newAnchorId ? 900 : 350);
  } else if (Number(gameState.policyChangesRemaining) > 0 && (gameState.calendar?.quarter === 1 || gameState.calendar?.quarter === "春")) {
    window.setTimeout(OpenPolicyDialog, newAnchorId ? 900 : 450);
  }
}

function ShowHistoricalAnchor(anchor) {
  displayedAnchorIds.add(anchor.id);
  const calendar = anchor.calendar || turnCalendar?.[(anchor.turn || gameState.turn) - 1] || gameState.calendar || {};
  const dateParts = String(anchor.date || "").split("年");
  GetElement("eventYear").textContent = dateParts[0] || calendar.year || anchor.year || gameState.calendar?.year || "";
  GetElement("eventQuarter").textContent = dateParts[1] || calendar.quarterLabel || (calendar.quarter ? `第${calendar.quarter}季度` : "") || anchor.period || "";
  GetElement("eventKind").textContent = anchor.kind === "Situational" ? "情境合成" : "史实锚点";
  GetElement("eventKind").className = `event-kind ${anchor.kind === "Situational" ? "situation-kind" : "history-kind"}`;
  GetElement("eventTitle").textContent = GetDefinitionName(anchor, "历史时点");
  GetElement("eventBody").textContent = anchor.body || anchor.description || anchor.text || "这一历史时点改变了敌后战场的整体压力。";
  const note = GetElement("eventNote");
  note.textContent = anchor.note || anchor.context || "宏观历史固定发生；玩家决定的是本地网络如何应对与保存。";
  note.hidden = !note.textContent;
  const choices = GetElement("eventChoices");
  choices.replaceChildren();
  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.className = "event-choice primary";
  continueButton.innerHTML = `<span>${anchor.actionLabel || "继续部署"}</span><small>${anchor.effectText || "历史不会被改写，应对取决于下一步行动"}</small>`;
  continueButton.addEventListener("click", CloseEventModal);
  choices.append(continueButton);
  SetLayerHidden("eventModal", false);
  PlaySound("event");
}

function CloseEventModal() {
  SetLayerHidden("eventModal", true);
  if (tutorialPending) {
    tutorialPending = false;
    StartTutorial();
  }
}

function OpenPolicyDialog() {
  if (!gameState) return;
  pendingPolicyIds = [...(gameState.selectedPolicies || [])];
  RenderPolicyOptions();
  SetLayerHidden("policyModal", false);
}

function RenderPolicyOptions() {
  const policyOptions = GetElement("policyOptions");
  policyOptions.replaceChildren();
  AsEntries(policies).forEach((policy, index) => {
    const selected = pendingPolicyIds.includes(policy.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `policy-option${selected ? " selected" : ""}`;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.innerHTML = `<span class="policy-number">${String(index + 1).padStart(2, "0")}</span><span><strong>${EscapeHtml(GetDefinitionName(policy))}</strong><small>${EscapeHtml(policy.description || policy.summary || "年度工作重点")}</small></span><i aria-hidden="true"></i>`;
    button.addEventListener("click", () => TogglePendingPolicy(policy.id));
    policyOptions.append(button);
  });
  const currentPolicyIds = gameState.selectedPolicies || [];
  const sharedPolicyCount = currentPolicyIds.filter((policyId) => pendingPolicyIds.includes(policyId)).length;
  const requiredChanges = new Set([...currentPolicyIds, ...pendingPolicyIds]).size - sharedPolicyCount;
  const changesRemaining = Number(gameState.policyChangesRemaining ?? 0);
  GetElement("policySelectionHint").textContent = requiredChanges > changesRemaining
    ? `此调整需 ${requiredChanges} 次变更，本年仅余 ${changesRemaining} 次`
    : `已选择 ${pendingPolicyIds.length} / 2 · 使用 ${requiredChanges} / ${changesRemaining} 次变更`;
  GetElement("confirmPolicyButton").disabled = pendingPolicyIds.length !== 2 || requiredChanges > changesRemaining;
}

function TogglePendingPolicy(policyId) {
  if (pendingPolicyIds.includes(policyId)) {
    pendingPolicyIds = pendingPolicyIds.filter((id) => id !== policyId);
  } else if (pendingPolicyIds.length < 2) {
    pendingPolicyIds.push(policyId);
  } else {
    ShowToast("每年最多同时采用两项方针。", "notice");
    return;
  }
  RenderPolicyOptions();
  PlaySound("select");
}

function ConfirmPolicies() {
  if (pendingPolicyIds.length !== 2) return;
  const existingIds = [...(gameState.selectedPolicies || [])];
  existingIds.filter((id) => !pendingPolicyIds.includes(id)).forEach((id) => {
    gameState = SetPolicy(gameState, id, false);
  });
  pendingPolicyIds.filter((id) => !(gameState.selectedPolicies || []).includes(id)).forEach((id) => {
    gameState = SetPolicy(gameState, id, true);
  });
  SetLayerHidden("policyModal", true);
  SaveGame();
  RenderGame();
  ShowToast(`本年度方针：${pendingPolicyIds.map((id) => GetDefinitionName(AsEntries(policies).find((policy) => policy.id === id), id)).join("、")}`, "success");
  PlaySound("confirm");
}

function RenderHistoryTab(tabId) {
  activeHistoryTab = tabId;
  document.querySelectorAll("[data-history-tab]").forEach((button) => button.classList.toggle("active", button.dataset.historyTab === tabId));
  const container = GetElement("historyContent");
  if (tabId === "premise") {
    container.innerHTML = `
      <section class="history-intro"><span class="history-stamp">设计边界</span><h3>这是历史约束下的策略抽象</h3><p>地图压缩了空间与时间，但不把合成机制包装成具体史实。进入游戏前，建议先了解以下边界。</p></section>
      <div class="principle-list">${designPrinciples.map((item, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div><h4>${EscapeHtml(item.title)}</h4><p>${EscapeHtml(item.body)}</p></div></article>`).join("")}</div>
      <div class="history-notes"><h4>用语说明</h4>${situationalNotes.map((note) => `<p>${EscapeHtml(note)}</p>`).join("")}</div>`;
  } else if (tabId === "timeline") {
    container.innerHTML = `<div class="timeline-list">${timelineEntries.map((entry) => `
      <article><time>${EscapeHtml(entry.year)}</time><div><h3>${EscapeHtml(entry.title)}</h3><p>${EscapeHtml(entry.body)}</p><small>${entry.sourceIds?.length ? `来源编号：${entry.sourceIds.map(EscapeHtml).join(" · ")}` : ""}</small></div></article>`).join("")}</div>`;
  } else if (tabId === "sources") {
    const sourceMarkup = sourceLinks.length
      ? sourceLinks.map((source, index) => `<article class="source-entry"><span>${String(index + 1).padStart(2, "0")}</span><div><h3>${EscapeHtml(source.title)}</h3><p>${EscapeHtml(source.institution || "")}${source.note ? ` · ${EscapeHtml(source.note)}` : ""}</p><a href="${EscapeHtml(source.url)}" target="_blank" rel="noreferrer">打开公开来源 ↗</a><small>${EscapeHtml(source.id)}</small></div></article>`).join("")
      : '<p class="empty-state">公开来源正在整理。</p>';
    container.innerHTML = `<section class="history-intro"><span class="history-stamp">资料来源</span><h3>史实卡只引用可核查的公开资料</h3><p>游戏正文使用概述，不伪造人物引语或未经核实的精确伤亡数字。链接会在新窗口打开。</p></section><div class="source-list">${sourceMarkup}</div>`;
  } else {
    container.innerHTML = `<div class="guide-list">${guideSections.map((section, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div><h3>${EscapeHtml(section.title)}</h3><p>${EscapeHtml(section.body)}</p></div></article>`).join("")}</div>`;
  }
}

function OpenHistoryDrawer(tabId = activeHistoryTab) {
  RenderHistoryTab(tabId);
  SetLayerHidden("historyDrawer", false);
  PlaySound("paper");
}

function CloseHistoryDrawer() {
  SetLayerHidden("historyDrawer", true);
}

function ToggleLogDrawer() {
  const drawer = GetElement("logDrawer");
  const willOpen = drawer.hidden;
  SetLayerHidden(drawer, !willOpen);
  GetElement("logToggleButton").setAttribute("aria-expanded", willOpen ? "true" : "false");
  PlaySound("paper");
}

function OpenMenu() {
  SetLayerHidden("menuModal", false);
  PlaySound("paper");
}

function CloseMenu() {
  SetLayerHidden("menuModal", true);
  restartArmed = false;
  const restartButton = GetElement("restartButton");
  if (restartButton) restartButton.querySelector("small").textContent = "当前进度将被替换";
}

function StartNewGame() {
  const seed = Math.floor(Date.now() % 2147483647) || 193810;
  gameState = CreateGameState(seed);
  selectedNodeId = gameState.teams?.[Object.keys(gameState.teams || {})[0]]?.nodeId || "Taihang";
  selectedTeamId = Object.keys(gameState.teams || {})[0] || null;
  pendingActionId = null;
  displayedAnchorIds = new Set();
  tutorialPending = localStorage.getItem("ResistanceNetwork_TutorialDone") !== "1";
  SetLayerHidden("openingScreen", true);
  BuildMap();
  RenderGame();
  SaveGame();
  const openingAnchor = AsEntries(historicalAnchors).find((anchor) => Number(anchor.turn) === 1) || AsEntries(historicalAnchors)[0];
  if (openingAnchor) ShowHistoricalAnchor(openingAnchor);
  else if (tutorialPending) {
    tutorialPending = false;
    StartTutorial();
  }
  PlaySound("start");
}

function ContinueSavedGame() {
  const savedState = LoadSavedGame();
  if (!savedState) {
    ShowToast("未找到可继续的本机存档。", "warning");
    RefreshContinueButton();
    return;
  }
  gameState = savedState;
  selectedNodeId = gameState.teams?.[Object.keys(gameState.teams || {})[0]]?.nodeId || Object.keys(gameState.nodes || {})[0];
  selectedTeamId = Object.keys(gameState.teams || {})[0] || null;
  displayedAnchorIds = new Set(gameState.triggeredAnchors || []);
  SetLayerHidden("openingScreen", true);
  BuildMap();
  RenderGame();
  if (gameState.status !== "active") ShowOutcome();
  PlaySound("start");
}

function RequestRestart() {
  if (!restartArmed) {
    restartArmed = true;
    GetElement("restartButton").querySelector("small").textContent = "再次点击确认重新开始";
    ShowToast("再次点击“重新开始”将替换当前进度。", "warning");
    window.setTimeout(() => {
      restartArmed = false;
      const button = GetElement("restartButton");
      if (button) button.querySelector("small").textContent = "当前进度将被替换";
    }, 4000);
    return;
  }
  CloseMenu();
  StartNewGame();
}

function StartTutorial() {
  tutorialIndex = 0;
  SetLayerHidden("tutorialOverlay", false);
  RenderTutorialStep();
}

function RenderTutorialStep() {
  document.querySelectorAll(".tutorial-focus").forEach((element) => element.classList.remove("tutorial-focus"));
  const step = tutorialSteps[tutorialIndex];
  if (!step) {
    FinishTutorial();
    return;
  }
  GetElement("tutorialStep").textContent = `${String(tutorialIndex + 1).padStart(2, "0")} / ${String(tutorialSteps.length).padStart(2, "0")}`;
  GetElement("tutorialTitle").textContent = step.title;
  GetElement("tutorialText").textContent = step.text;
  GetElement("nextTutorialButton").textContent = tutorialIndex === tutorialSteps.length - 1 ? "开始部署" : "下一步";
  GetElement(step.focusId)?.classList.add("tutorial-focus");
  GetElement("tutorialCard").dataset.position = tutorialIndex === 1 ? "left" : tutorialIndex === 3 ? "top" : "right";
}

function AdvanceTutorial() {
  tutorialIndex += 1;
  if (tutorialIndex >= tutorialSteps.length) FinishTutorial();
  else RenderTutorialStep();
}

function FinishTutorial() {
  document.querySelectorAll(".tutorial-focus").forEach((element) => element.classList.remove("tutorial-focus"));
  SetLayerHidden("tutorialOverlay", true);
  localStorage.setItem("ResistanceNetwork_TutorialDone", "1");
  ShowToast("先选择区域与骨干队，再下达本季部署。", "notice");
}

function ShowOutcome() {
  if (!gameState) return;
  const scoreData = gameState.finalScore;
  const score = typeof scoreData === "number" ? scoreData : (scoreData?.total ?? GetCurrentScorePreview());
  const ending = gameState.ending || {};
  let title = ending.title;
  if (!title) title = score >= 70 ? "烽火成网" : score >= 45 ? "根系相连" : "火种未灭";
  let summary = ending.summary || ending.description;
  if (!summary) {
    summary = score >= 70
      ? "封锁线没能切断彼此呼应的火种。你保存了群众基础与骨干网络，也为交通牵制和局部反攻留下了力量。"
      : score >= 45
        ? "网络经历收缩与重建，仍有多条交通线坚持到历史终点。它不耀眼，却足以让联络继续。"
        : "所统筹的网络付出了沉重代价，但仍有火种被保存下来。历史胜利到来时，这段坚持没有被抹去。";
  }
  GetElement("outcomeKicker").textContent = gameState.status === "defeat" ? "你所统筹的网络被迫中断" : "历史抵达 1945 年秋";
  GetElement("outcomeTitle").textContent = title;
  GetElement("outcomeSummary").textContent = summary;
  GetElement("outcomeScore").innerHTML = `${Math.round(score)}<small>/ 100</small>`;
  const components = scoreData?.components || scoreData?.breakdown || {
    network: Math.round(GetActiveNodes().length / Math.max(1, AsEntries(mapNodes).length) * 40),
    safety: Math.round(Clamp(gameState.resources?.safety, 0, 100) * 0.3),
    contribution: Math.round(Clamp(gameState.resources?.contribution, 0, 100) * 0.2),
    connections: Math.round(GetActiveConnectionCount() / Math.max(1, AsEntries(mapConnections).length) * 10),
  };
  const componentLabels = { network: "网络存续", safety: "群众安全", contribution: "敌后贡献", connections: "跨区联络", connectivity: "跨区联络", liaison: "跨区联络" };
  GetElement("outcomeBreakdown").innerHTML = Object.entries(components).map(([key, value]) => `<span><small>${EscapeHtml(componentLabels[key] || key)}</small><strong>${Math.round(Number(value) || 0)}</strong></span>`).join("");
  DrawOutcomeNetwork();
  SetLayerHidden("outcomeModal", false);
  PlaySound("outcome");
}

function DrawOutcomeNetwork() {
  const outcomeLines = GetElement("outcomeLines");
  outcomeLines.replaceChildren();
  const nodeEntries = AsEntries(mapNodes);
  const coordinates = Object.fromEntries(nodeEntries.map((node, index) => [node.id, GetNodeCoordinate(node, index)]));
  AsEntries(mapConnections).forEach((connection) => {
    const [fromId, toId] = GetConnectionEnds(connection);
    if (!coordinates[fromId] || !coordinates[toId]) return;
    if (GetNodeState(fromId).networkLevel <= 0 || GetNodeState(toId).networkLevel <= 0) return;
    const line = CreateSvgElement("line", {
      x1: coordinates[fromId][0], y1: coordinates[fromId][1] * .8,
      x2: coordinates[toId][0], y2: coordinates[toId][1] * .8,
    });
    outcomeLines.append(line);
  });
  nodeEntries.forEach((node, index) => {
    if (GetNodeState(node.id).networkLevel <= 0) return;
    const [x, y] = GetNodeCoordinate(node, index);
    outcomeLines.append(CreateSvgElement("circle", { cx: x, cy: y * .8, r: 4 + GetNodeState(node.id).networkLevel * 2 }));
  });
}

function ShowToast(message, type = "notice") {
  const region = GetElement("toastRegion");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  region.append(toast);
  window.requestAnimationFrame(() => toast.classList.add("visible"));
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 260);
  }, 3600);
}

function EnsureAudioContext() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function PlaySound(kind) {
  if (!soundEnabled) return;
  try {
    const context = EnsureAudioContext();
    const now = context.currentTime;
    const soundProfiles = {
      select: [260, 0.035, 0.025, "sine"],
      confirm: [410, 0.11, 0.035, "triangle"],
      error: [120, 0.15, 0.035, "sawtooth"],
      paper: [180, 0.06, 0.018, "square"],
      turn: [220, 0.24, 0.03, "triangle"],
      event: [330, 0.32, 0.035, "sine"],
      start: [260, 0.45, 0.035, "triangle"],
      outcome: [392, 0.7, 0.04, "sine"],
    };
    const [frequency, duration, volume, wave] = soundProfiles[kind] || soundProfiles.select;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (["confirm", "event", "start", "outcome"].includes(kind)) oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  } catch {
    soundEnabled = false;
  }
}

function ToggleSound() {
  soundEnabled = !soundEnabled;
  GetElement("soundButton").setAttribute("aria-pressed", soundEnabled ? "true" : "false");
  GetElement("soundButton").textContent = soundEnabled ? "◉" : "◌";
  SaveSettings();
  if (soundEnabled) PlaySound("confirm");
}

function ShowResourceHint(resourceId) {
  const hints = {
    grain: "粮秣用于开辟、建设和队伍行动；生产救护与年度方针可以补充储备。",
    intel: "情报用于识别扫荡目标并提高高风险行动的把握，可通过侦察交通获得。",
    safety: "群众安全是必须守住的底线，不是可消费资源。扫荡、清乡和错误应对会降低它。",
    contribution: "敌后贡献记录交通破袭、牵制与网络协同，不等同于歼敌数字。",
  };
  ShowToast(hints[resourceId] || "", "notice");
}

function CloseTopLayer() {
  const layerIds = ["menuModal", "policyModal", "historyDrawer", "eventModal", "logDrawer"];
  const openLayerId = layerIds.find((id) => !GetElement(id)?.hidden);
  if (!openLayerId) return false;
  if (openLayerId === "eventModal") CloseEventModal();
  else if (openLayerId === "historyDrawer") CloseHistoryDrawer();
  else if (openLayerId === "menuModal") CloseMenu();
  else SetLayerHidden(openLayerId, true);
  return true;
}

function HandleKeyboard(event) {
  if (HandleLayerFocusTrap(event)) return;
  if (event.key === "Escape") {
    if (!GetElement("tutorialOverlay").hidden) FinishTutorial();
    else CloseTopLayer();
    return;
  }
  if (!GetElement("openingScreen").hidden || gameState?.status !== "active") return;
  if (event.key.toLowerCase() === "h") OpenHistoryDrawer();
  else if (event.key.toLowerCase() === "m") OpenMenu();
  else if (/^[1-6]$/.test(event.key)) {
    const action = AsEntries(actions)[Number(event.key) - 1];
    if (action) SelectAction(action.id);
  }
}

function BindEvents() {
  GetElement("newGameButton").addEventListener("click", StartNewGame);
  GetElement("continueButton").addEventListener("click", ContinueSavedGame);
  GetElement("openingHistoryButton").addEventListener("click", () => OpenHistoryDrawer("premise"));
  GetElement("brandButton").addEventListener("click", () => OpenHistoryDrawer("guide"));
  GetElement("historyButton").addEventListener("click", () => OpenHistoryDrawer("timeline"));
  GetElement("eventSourceButton").addEventListener("click", () => OpenHistoryDrawer("timeline"));
  GetElement("outcomeHistoryButton").addEventListener("click", () => OpenHistoryDrawer("timeline"));
  GetElement("policyButton").addEventListener("click", OpenPolicyDialog);
  GetElement("confirmPolicyButton").addEventListener("click", ConfirmPolicies);
  GetElement("endTurnButton").addEventListener("click", EndCurrentTurn);
  GetElement("logToggleButton").addEventListener("click", ToggleLogDrawer);
  GetElement("closeLogButton").addEventListener("click", ToggleLogDrawer);
  GetElement("menuButton").addEventListener("click", OpenMenu);
  GetElement("resumeButton").addEventListener("click", CloseMenu);
  GetElement("saveButton").addEventListener("click", () => SaveGame(true));
  GetElement("helpButton").addEventListener("click", () => { CloseMenu(); OpenHistoryDrawer("guide"); });
  GetElement("restartButton").addEventListener("click", RequestRestart);
  GetElement("outcomeRestartButton").addEventListener("click", () => { SetLayerHidden("outcomeModal", true); StartNewGame(); });
  GetElement("soundButton").addEventListener("click", ToggleSound);
  GetElement("nextTutorialButton").addEventListener("click", AdvanceTutorial);
  GetElement("skipTutorialButton").addEventListener("click", FinishTutorial);
  GetElement("closeDetailButton").addEventListener("click", () => GetElement("detailPanel").classList.remove("mobile-open"));
  GetElement("centerMapButton").addEventListener("click", () => {
    GetElement("networkMap").classList.add("map-reset-pulse");
    window.setTimeout(() => GetElement("networkMap")?.classList.remove("map-reset-pulse"), 500);
  });
  GetElement("legendButton").addEventListener("click", () => {
    const legend = GetElement("mapLegend");
    legend.hidden = !legend.hidden;
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => {
    const layerId = button.dataset.closeModal;
    if (layerId === "historyDrawer") CloseHistoryDrawer();
    else if (layerId === "menuModal") CloseMenu();
    else SetLayerHidden(layerId, true);
  }));
  document.querySelectorAll("[data-history-tab]").forEach((button) => button.addEventListener("click", () => RenderHistoryTab(button.dataset.historyTab)));
  document.querySelectorAll(".resource-chip").forEach((button) => button.addEventListener("click", () => ShowResourceHint(button.dataset.resource)));
  document.querySelectorAll(".policy-token").forEach((button) => button.addEventListener("click", OpenPolicyDialog));
  document.addEventListener("keydown", HandleKeyboard);
}

function InitializeGame() {
  soundEnabled = Boolean(GetSavedSettings().soundEnabled);
  GetElement("soundButton").setAttribute("aria-pressed", soundEnabled ? "true" : "false");
  GetElement("soundButton").textContent = soundEnabled ? "◉" : "◌";
  BindEvents();
  gameState = CreateGameState(193810);
  selectedNodeId = gameState.teams?.[Object.keys(gameState.teams || {})[0]]?.nodeId || "Taihang";
  selectedTeamId = Object.keys(gameState.teams || {})[0] || null;
  BuildMap();
  RenderGame();
  RefreshContinueButton();
  RenderHistoryTab("premise");
  SyncBlockingLayers(true);
}

InitializeGame();
