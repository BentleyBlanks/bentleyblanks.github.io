import {
  saveKey,
  turnLimit,
  actionDefinitions,
  doctrineDefinitions,
  policyDefinitions,
  terrainDefinitions,
  unitDefinitions,
  institutionDefinitions,
  improvementDefinitions,
  CreateInitialState,
  GetHex,
  GetNeighbors,
  GetTurnBriefing,
  GetDoctrineExperienceCost,
  FindReachableHexes,
  ListContextActions,
  GetActionPreview,
  QueueOrder,
  RemoveOrder,
  ClearOrders,
  ResolveTurn,
  UnlockDoctrine,
  SetPolicies,
  GetVictoryAssessment,
  SerializeState,
  DeserializeState,
} from "./Script_Rules.mjs?v=20260730p";
import {
  CreateEnemyRearWorld3D,
  World3DCacheIdentity,
} from "./Script_World3D.mjs?v=20260730p";
import {
  GetFixedHistoricalAnchor,
  GetHistoricalTurnNarrative,
  GetHistorySource,
  historicalTurnNarratives,
  historyBoundary,
  localPhaseDefinitions,
  ordinaryRoleDefinitions,
} from "./Data_History.mjs?v=20260730p";

const ui = {};
const activePointers = new Map();
const modalIds = ["standardModal", "reportModal", "outcomeModal"];
const terrainPalette = {
  mountain: { fill: "#756f56", line: "#343a31", mark: "山" },
  hill: { fill: "#918568", line: "#4b493a", mark: "岭" },
  forest: { fill: "#68705a", line: "#343e31", mark: "林" },
  plain: { fill: "#aaa07c", line: "#585541", mark: "田" },
  rivervalley: { fill: "#72818a", line: "#40545d", mark: "水" },
  village: { fill: "#a8926d", line: "#574936", mark: "村" },
};
const controlPalette = {
  player: "#8e3028",
  enemy: "#2a2d29",
  neutral: "#6f715f",
  contested: "#8a724a",
  base: "#8e3028",
  network: "#a04a35",
  occupied: "#2a2d29",
};

let gameState = null;
let selectedHexId = null;
let selectedUnitId = null;
let latestReport = null;
let pendingWorldActionEffects = [];
let lastFocusElement = null;
let modalSequence = 0;
let renderHandle = 0;
let mapLayer = "situation";
let pointerGesture = null;
let world3D = null;
let world3DFailed = false;
let desktopBootCompleted = false;
let mapCamera = {
  panX: 0,
  panY: 0,
  zoom: 1,
  fitScale: 1,
  centerX: 0,
  centerY: 0,
  worldCenterX: 0,
  worldCenterY: 0,
  hexSize: 42,
};

function Element(id) {
  return document.getElementById(id);
}

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function EscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function AsArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function DefinitionList(value) {
  return AsArray(value).map((item, index) => {
    if (typeof item === "string") return { id: item, name: item };
    return { id: item.id ?? item.key ?? String(index), ...item };
  });
}

function FindDefinition(collection, id) {
  if (!id) return null;
  if (collection && !Array.isArray(collection) && collection[id]) return collection[id];
  const normalizedId = String(id).toLowerCase();
  return DefinitionList(collection).find((item) =>
    String(item.id ?? item.key ?? "").toLowerCase() === normalizedId
  ) ?? null;
}

function GetHistoryContext(turn = Number(gameState?.turn ?? 1)) {
  const normalizedTurn = Clamp(Math.trunc(Number(turn) || 1), 1, turnLimit);
  const narrative = GetHistoricalTurnNarrative(normalizedTurn);
  const phase = narrative
    ? FindDefinition(localPhaseDefinitions, narrative.localPhaseId)
    : null;
  return { turn: normalizedTurn, narrative, phase };
}

function GetHistoryRole(roleId) {
  return FindDefinition(ordinaryRoleDefinitions, roleId);
}

function FormatHistoryRoleNames(roleIds) {
  return AsArray(roleIds).map((roleId) => {
    const role = GetHistoryRole(roleId);
    return role ? `${role.displayName}（${role.role}）` : roleId;
  }).join("、");
}

function IsFeature(hex, ...featureIds) {
  const normalized = String(hex?.feature ?? "").toLowerCase();
  return featureIds.some((featureId) => normalized === String(featureId).toLowerCase());
}

function ExtractStateResult(result) {
  if (result?.state?.hexes) {
    return { state: result.state, report: result.report ?? null, error: result.reason ?? null };
  }
  if (result?.hexes && result?.resources) {
    return { state: result, report: null, error: result.lastError ?? null };
  }
  return { state: null, report: null, error: result?.reason ?? "规则层没有返回有效战局" };
}

function FormatDelta(value) {
  const numeric = Number(value) || 0;
  return numeric > 0 ? `+${numeric}` : String(numeric);
}

function SetText(id, value) {
  const element = ui[id] || Element(id);
  if (element) element.textContent = String(value ?? "");
}

function Announce(message, assertive = false) {
  const target = assertive ? ui.liveRegion : ui.toastRegion;
  if (!target) return;
  target.textContent = "";
  window.setTimeout(() => {
    target.textContent = message;
  }, 15);
}

function ShowToast(message, kind = "normal") {
  if (!ui.toastRegion) return;
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  ui.toastRegion.append(toast);
  window.setTimeout(() => toast.classList.add("show"), 20);
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}

function CacheElements() {
  [
    "openingScreen", "startButton", "continueButton", "historyBoundaryButton",
    "gameShell", "dateLabel", "turnLabel", "phaseLabel", "grainValue",
    "armsValue", "medicineValue", "intelValue", "cadresValue", "peopleValue",
    "exposureValue", "contributionValue", "objectiveText", "warningText",
    "timelineList", "mapCanvas", "mapHint", "mapLegend", "hexNavigator",
    "hexScrollLeftButton", "hexScrollRightButton", "worldModeBadge",
    "zoomInButton", "zoomOutButton", "centerMapButton", "layerButton",
    "selectedTitle", "selectedMeta", "selectedStats", "selectedUnit", "actionList",
    "doctrineButton", "policyButton", "ledgerButton", "rulesButton", "saveButton",
    "menuButton", "orderList", "commandValue", "clearOrdersButton", "executeButton",
    "modalBackdrop", "standardModal", "modalEyebrow", "modalTitle", "modalBody",
    "modalFooter", "reportModal", "reportTitle", "reportSummary", "playerReportList",
    "enemyReportList", "costReportList", "reportContinueButton", "outcomeModal",
    "outcomeGrade", "outcomeTitle", "outcomeSummary", "outcomeEvidence",
    "outcomeLedger", "restartButton", "toastRegion", "liveRegion",
  ].forEach((id) => {
    ui[id] = Element(id);
  });
}

function IsDesktopViewportSupported() {
  return window.innerWidth >= 1280 && window.innerHeight >= 720;
}

function ResumeBootAtDesktopViewport() {
  if (!IsDesktopViewportSupported()) return;
  window.removeEventListener("resize", ResumeBootAtDesktopViewport);
  Boot();
}

function BlockUnsupportedViewportInteraction(event) {
  if (IsDesktopViewportSupported()) return;
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
}

function SuspendWorld3DForViewport() {
  try {
    world3D?.Dispose?.();
  } finally {
    world3D = null;
  }
}

function HandleDesktopViewportResize() {
  if (!IsDesktopViewportSupported()) {
    if (gameState) SaveGame(false);
    if (renderHandle) {
      window.cancelAnimationFrame(renderHandle);
      renderHandle = 0;
    }
    activePointers.forEach((unusedPoint, pointerId) => {
      try {
        if (ui.mapCanvas?.hasPointerCapture(pointerId)) ui.mapCanvas.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already have ended while the resize event was queued.
      }
    });
    activePointers.clear();
    pointerGesture = null;
    ui.mapCanvas?.blur();
    SuspendWorld3DForViewport();
    return;
  }
  if (!gameState) RefreshContinueButton();
  ScheduleRender();
}

function Boot() {
  CacheElements();
  if (!IsDesktopViewportSupported()) {
    window.addEventListener("resize", ResumeBootAtDesktopViewport, { passive: true });
    return;
  }
  window.removeEventListener("resize", ResumeBootAtDesktopViewport);
  if (desktopBootCompleted) return;
  desktopBootCompleted = true;
  BindStaticEvents();
  RefreshContinueButton();
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  if (ui.gameShell) ui.gameShell.hidden = true;
  if (ui.openingScreen) ui.openingScreen.hidden = false;
}

function BindStaticEvents() {
  ui.startButton?.addEventListener("click", RequestStartNewGame);
  ui.continueButton?.addEventListener("click", ContinueGame);
  ui.historyBoundaryButton?.addEventListener("click", ShowHistoryBoundary);
  ui.zoomInButton?.addEventListener("click", () => ChangeZoom(1.18));
  ui.zoomOutButton?.addEventListener("click", () => ChangeZoom(0.84));
  ui.centerMapButton?.addEventListener("click", CenterMap);
  ui.layerButton?.addEventListener("click", ToggleMapLayer);
  ui.hexScrollLeftButton?.addEventListener("click", () => ScrollHexNavigator(-1));
  ui.hexScrollRightButton?.addEventListener("click", () => ScrollHexNavigator(1));
  ui.hexNavigator?.addEventListener("scroll", UpdateHexNavigatorScrollState, { passive: true });
  ui.doctrineButton?.addEventListener("click", ShowDoctrineTree);
  ui.policyButton?.addEventListener("click", ShowPolicyBoard);
  ui.ledgerButton?.addEventListener("click", ShowCostLedger);
  ui.rulesButton?.addEventListener("click", ShowRules);
  ui.saveButton?.addEventListener("click", () => SaveGame(true));
  ui.menuButton?.addEventListener("click", ShowGameMenu);
  ui.clearOrdersButton?.addEventListener("click", ClearOrderQueue);
  ui.executeButton?.addEventListener("click", RequestExecuteTurn);
  ui.reportContinueButton?.addEventListener("click", ContinueAfterReport);
  ui.restartButton?.addEventListener("click", ConfirmRestart);
  ui.modalBackdrop?.addEventListener("click", CloseTopModal);
  document.querySelectorAll("[data-ledger-kind]").forEach((button) => {
    button.addEventListener("click", () => ShowResourceInfo(button.dataset.ledgerKind));
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", CloseTopModal);
  });
  ["click", "keydown", "pointerdown", "pointermove", "pointerup", "pointercancel"].forEach((eventName) => {
    window.addEventListener(eventName, BlockUnsupportedViewportInteraction, true);
  });
  window.addEventListener("wheel", BlockUnsupportedViewportInteraction, { capture: true, passive: false });
  window.addEventListener("keydown", HandleGlobalKeyDown);
  window.addEventListener("resize", HandleDesktopViewportResize, { passive: true });
  if (ui.mapCanvas) {
    ui.mapCanvas.addEventListener("pointerdown", HandleMapPointerDown);
    ui.mapCanvas.addEventListener("pointermove", HandleMapPointerMove);
    ui.mapCanvas.addEventListener("pointerup", HandleMapPointerUp);
    ui.mapCanvas.addEventListener("pointercancel", HandleMapPointerUp);
    ui.mapCanvas.addEventListener("wheel", HandleMapWheel, { passive: false });
    ui.mapCanvas.addEventListener("keydown", HandleMapKeyDown);
  }
}

function RefreshContinueButton() {
  if (!ui.continueButton) return;
  if (!IsDesktopViewportSupported()) {
    ui.continueButton.hidden = true;
    return;
  }
  ui.continueButton.hidden = !HasValidSave();
}

function HasValidSave() {
  try {
    const stored = localStorage.getItem(saveKey);
    if (stored) {
      const loaded = DeserializeState(stored);
      return Boolean(loaded && !loaded.lastError);
    }
  } catch {
    return false;
  }
  return false;
}

function RequestStartNewGame() {
  if (!IsDesktopViewportSupported()) return;
  if (!HasValidSave()) {
    StartNewGame();
    return;
  }
  OpenStandardModal({
    eyebrow: "存档保护",
    title: "开始新战局并覆盖现有进度？",
    body: `<p>本机已有一局可继续的敌后战局。开始新战局会覆盖现有存档、建设队列和战争损失簿；此操作不能撤销。</p>`,
    buttons: [
      { label: "保留存档", className: "secondaryButton", action: CloseTopModal },
      {
        label: "覆盖并开始",
        className: "dangerButton",
        action: () => {
          CloseAllModals();
          StartNewGame();
        },
      },
    ],
  });
}

function StartNewGame() {
  if (!IsDesktopViewportSupported()) return;
  gameState = CreateInitialState(19410918);
  const headquarters = AsArray(gameState.hexes).find((hex) =>
    IsFeature(hex, "Headquarters") || hex.control === "base"
  );
  selectedHexId = headquarters?.id ?? AsArray(gameState.hexes)[0]?.id ?? null;
  selectedUnitId = AsArray(gameState.units).find((unit) => unit.hexId === selectedHexId)?.id
    ?? AsArray(gameState.units)[0]?.id
    ?? null;
  latestReport = null;
  pendingWorldActionEffects = [];
  EnterGame();
  SaveGame(false);
  ShowScenarioBrief();
}

function ContinueGame() {
  if (!IsDesktopViewportSupported()) return;
  try {
    const stored = localStorage.getItem(saveKey);
    const loaded = stored ? DeserializeState(stored) : null;
    if (!loaded || loaded.lastError) throw new Error("存档不存在或已损坏");
    gameState = loaded;
    selectedHexId = gameState.selectedHexId
      ?? AsArray(gameState.units)[0]?.hexId
      ?? AsArray(gameState.hexes)[0]?.id
      ?? null;
    selectedUnitId = gameState.selectedUnitId ?? AsArray(gameState.units)[0]?.id ?? null;
    pendingWorldActionEffects = [];
    EnterGame();
    if (gameState.gameOver) {
      ShowOutcome();
    } else {
      ShowToast("已恢复上次的敌后战局", "good");
    }
  } catch {
    localStorage.removeItem(saveKey);
    RefreshContinueButton();
    ShowToast("存档无法读取，已安全保留在开场页", "bad");
  }
}

function EnterGame() {
  if (!IsDesktopViewportSupported() || !gameState) return;
  if (ui.openingScreen) ui.openingScreen.hidden = true;
  if (ui.gameShell) ui.gameShell.hidden = false;
  window.scrollTo(0, 0);
  CenterMap();
  RenderAll();
  window.setTimeout(() => {
    window.scrollTo(0, 0);
    FocusWithoutScroll(ui.mapCanvas);
  }, 0);
}

function SaveGame(showFeedback = false) {
  if (!gameState) return;
  try {
    gameState.selectedHexId = selectedHexId;
    gameState.selectedUnitId = selectedUnitId;
    localStorage.setItem(saveKey, SerializeState(gameState));
    RefreshContinueButton();
    if (showFeedback) ShowToast("战局已保存到本机", "good");
  } catch {
    if (showFeedback) ShowToast("保存失败：浏览器未允许本地存储", "bad");
  }
}

function ScheduleRender() {
  if (!IsDesktopViewportSupported()) return;
  if (renderHandle) return;
  renderHandle = window.requestAnimationFrame(() => {
    renderHandle = 0;
    RenderAll();
  });
}

function RenderAll() {
  if (!IsDesktopViewportSupported() || !gameState || ui.gameShell?.hidden) return;
  RenderCommandBar();
  RenderBriefing();
  RenderTimeline();
  RenderSelection();
  RenderOrders();
  RenderHexNavigator();
  RenderMap();
}

function RenderCommandBar() {
  const resources = gameState.resources || {};
  const meters = gameState.meters || {};
  const briefing = GetTurnBriefing(gameState) || {};
  SetText("dateLabel", briefing.date ?? gameState.date ?? `第 ${gameState.turn || 1} 回合`);
  SetText("turnLabel", `第 ${gameState.turn || 1} / ${turnLimit} 回合`);
  SetText("phaseLabel", briefing.phase ?? gameState.phase ?? "计划阶段");
  SetText("grainValue", resources.grain ?? 0);
  SetText("armsValue", resources.arms ?? resources.supplies ?? 0);
  SetText("medicineValue", resources.medicine ?? 0);
  SetText("intelValue", resources.intel ?? resources.intelligence ?? 0);
  SetText("cadresValue", resources.cadres ?? resources.organization ?? 0);
  SetText("peopleValue", meters.people ?? meters.peopleSafety ?? 0);
  SetText("exposureValue", meters.exposure ?? gameState.alert ?? 0);
  SetText("contributionValue", meters.contribution ?? 0);
  document.documentElement.style.setProperty(
    "--peopleMeter",
    `${Clamp(Number(meters.people ?? meters.peopleSafety ?? 0), 0, 100)}%`,
  );
  document.documentElement.style.setProperty(
    "--exposureMeter",
    `${Clamp(Number(meters.exposure ?? gameState.alert ?? 0), 0, 100)}%`,
  );
  document.documentElement.style.setProperty(
    "--contributionMeter",
    `${Clamp(Number(meters.contribution ?? 0), 0, 100)}%`,
  );
}

function RenderBriefing() {
  const briefing = GetTurnBriefing(gameState) || {};
  const historyContext = GetHistoryContext();
  const objective = briefing.objective
    ?? briefing.mission
    ?? [briefing.title, briefing.summary].filter(Boolean).join("：")
    ?? "稳住群众与根据地，完成本回合计划。";
  const phasePrefix = historyContext.phase
    ? `【地方阶段 · ${historyContext.phase.title}】`
    : "";
  const eventProgress = AsArray(briefing.historicalEvent?.hooks)
    .map((hook) => `${hook.met ? "已落实" : "待落实"}：${hook.label}`)
    .join("；");
  const openingImpact = AsArray(briefing.openingCondition?.entries)
    .map((entry) => entry.text)
    .filter(Boolean)
    .join("；");
  SetText(
    "objectiveText",
    [
      `${phasePrefix}${objective}`,
      eventProgress ? `部署证据 ${briefing.historicalEvent.metCount}/${briefing.historicalEvent.requiredCount}：${eventProgress}` : "",
      openingImpact ? `本月开局影响：${openingImpact}` : "",
    ].filter(Boolean).join(" "),
  );
  const warningEntries = AsArray(briefing.warnings);
  const warningText = warningEntries.length
    ? warningEntries.map((warning) => warning.text ?? `${warning.villageName}出现敌情`).join("；")
    : briefing.warning
      ?? briefing.enemyWarning
      ?? "当前没有明确扫荡方向；仍需维持侦察、隐蔽交通和群众准备。";
  SetText(
    "warningText",
    warningText,
  );
  if (ui.warningText) {
    ui.warningText.classList.toggle("urgent", Boolean(briefing.urgent || warningEntries.length));
  }
  if (ui.mapHint) {
    ui.mapHint.textContent = mapLayer === "situation"
      ? "单击六角格查看地块；选择我方人员后，可点相邻格规划移动。按住鼠标拖动平移，滚轮缩放。"
      : "建设图层：村庄联系、机构、地块改良与工程队列被突出显示。";
  }
  if (ui.mapLegend) {
    ui.mapLegend.dataset.layer = mapLayer;
  }
}

function RenderTimeline() {
  if (!ui.timelineList) return;
  const currentTurn = Number(gameState.turn || 1);
  const items = DefinitionList(historicalTurnNarratives);
  const visible = items.filter((item, index) => {
    const turn = Number(item.turn ?? index + 1);
    return Math.abs(turn - currentTurn) <= 2 || turn === 1 || turn === turnLimit;
  });
  const currentVisibleIndex = visible.findIndex((item, index) =>
    Number(item.turn ?? index + 1) === currentTurn
  );
  const contextVisibleIndex = currentVisibleIndex < 0
    ? -1
    : currentVisibleIndex < visible.length - 1
      ? currentVisibleIndex + 1
      : Math.max(0, currentVisibleIndex - 1);
  ui.timelineList.innerHTML = visible.map((item, index) => {
    const turn = Number(item.turn ?? index + 1);
    const status = turn < currentTurn ? "isPast" : turn === currentTurn ? "isCurrent" : "isFuture";
    const contextClass = index === contextVisibleIndex && turn !== currentTurn ? " isContext" : "";
    const phase = FindDefinition(localPhaseDefinitions, item.localPhaseId);
    const timelineTitle = phase ? `${phase.title} · ${item.title}` : item.title;
    const resolvedEvent = AsArray(gameState.eventState?.resolved)
      .find((entry) => Number(entry.turn) === turn);
    const outcomeText = resolvedEvent
      ? `【${resolvedEvent.outcomeLabel}】${resolvedEvent.summary}`
      : turn === currentTurn
        ? `【本月待落实】${item.historicalFrame ?? item.summary ?? ""}`
        : item.historicalFrame ?? item.summary ?? "";
    return `
      <li class="${status}${contextClass}">
        <time>${EscapeHtml(item.date ?? `第${turn}回合`)}</time>
        <span>
          <b>${EscapeHtml(timelineTitle ?? item.name ?? "地方历史阶段")}</b>
          <small>${EscapeHtml(outcomeText)}</small>
        </span>
      </li>`;
  }).join("");
}

function RenderHexNavigator() {
  if (!ui.hexNavigator) return;
  const important = AsArray(gameState.hexes).filter((hex) =>
    IsFeature(hex, "Village", "Headquarters", "CountySeat", "Stronghold", "RailStation")
      || hex.institution
  );
  ui.hexNavigator.innerHTML = important.map((hex) => {
    const selected = hex.id === selectedHexId;
    const known = hex.visible !== false;
    const detail = known
      ? `${ControlLabel(hex.control)}，联系 ${hex.contact ?? 0}`
      : "尚未查明";
    return `
      <button type="button" class="navigatorItem${selected ? " isSelected" : ""}"
        data-hex-id="${EscapeHtml(hex.id)}" aria-current="${selected}" aria-pressed="${selected}">
        <b>${EscapeHtml(known ? hex.name : "未明地区")}</b>
        <span>${EscapeHtml(detail)}</span>
      </button>`;
  }).join("");
  ui.hexNavigator.querySelectorAll("[data-hex-id]").forEach((button) => {
    button.addEventListener("click", () => SelectHex(button.dataset.hexId, true));
  });
  window.requestAnimationFrame(UpdateHexNavigatorScrollState);
}

function UpdateHexNavigatorScrollState() {
  if (!ui.hexNavigator) return;
  const maximumScroll = Math.max(0, ui.hexNavigator.scrollWidth - ui.hexNavigator.clientWidth);
  if (ui.hexScrollLeftButton) {
    ui.hexScrollLeftButton.disabled = maximumScroll <= 1 || ui.hexNavigator.scrollLeft <= 1;
  }
  if (ui.hexScrollRightButton) {
    ui.hexScrollRightButton.disabled = maximumScroll <= 1
      || ui.hexNavigator.scrollLeft >= maximumScroll - 1;
  }
}

function ScrollHexNavigator(direction) {
  if (!ui.hexNavigator) return;
  const distance = Math.max(220, Math.round(ui.hexNavigator.clientWidth * 0.72));
  ui.hexNavigator.scrollBy({
    left: Math.sign(direction) * distance,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

function RenderSelection() {
  if (!selectedHexId || !GetHex(gameState, selectedHexId)) {
    selectedHexId = AsArray(gameState.hexes)[0]?.id ?? null;
  }
  const hex = GetHex(gameState, selectedHexId);
  if (!hex) return;
  const visible = hex.visible !== false;
  const terrain = FindDefinition(terrainDefinitions, hex.terrain) ?? {};
  SetText("selectedTitle", visible ? hex.name : "未明地区");
  SetText(
    "selectedMeta",
    visible
      ? `${terrain.label ?? terrain.name ?? TerrainLabel(hex.terrain)} · ${ControlLabel(hex.control)}`
      : "战争迷雾 · 需要侦察或建立交通联系",
  );
  if (ui.selectedStats) {
    ui.selectedStats.innerHTML = visible ? BuildHexStats(hex) : `
      <p class="unknownNotice">这里的村庄、道路和敌情尚未查明。派工作队或游击队接近，或使用侦察行动。</p>`;
  }
  const units = AsArray(gameState.units).filter((unit) => unit.hexId === hex.id);
  const selectedUnit = AsArray(gameState.units).find((unit) => unit.id === selectedUnitId);
  if (ui.selectedUnit) {
    ui.selectedUnit.innerHTML = units.length
      ? units.map((unit) => BuildUnitCard(unit, unit.id === selectedUnitId)).join("")
      : selectedUnit
        ? BuildTravelUnitCard(selectedUnit, hex.id)
        : `<p class="emptySelection">本格没有我方人员。选择地图上的工作队、游击队或主力支队。</p>`;
    ui.selectedUnit.querySelectorAll("[data-unit-id]").forEach((button) => {
      button.addEventListener("click", () => SelectUnit(button.dataset.unitId));
    });
  }
  RenderActions(hex, selectedUnit);
  if (ui.mapCanvas) {
    ui.mapCanvas.setAttribute(
      "aria-label",
      visible
        ? `${hex.name}，${TerrainLabel(hex.terrain)}，${ControlLabel(hex.control)}。方向键切换相邻地块。`
        : "未明地区。方向键切换相邻地块。",
    );
  }
}

function BuildHexStats(hex) {
  const isVillage = IsFeature(hex, "Village");
  const hardship = Number(hex.hardship ?? 0);
  const livelihood = Number(hex.livelihood ?? 0);
  const construction = hex.construction;
  const terrainDefinition = FindDefinition(terrainDefinitions, hex.terrain) ?? {};
  const improvementDefinition = FindDefinition(improvementDefinitions, hex.improvement);
  const institutionDefinition = FindDefinition(institutionDefinitions, hex.institution);
  const baseYield = terrainDefinition.yield ?? {};
  const improvementYield = improvementDefinition?.yield ?? {};
  const yieldData = {
    grain: Number(baseYield.grain ?? 0) + Number(improvementYield.grain ?? 0),
    medicine: Number(baseYield.medicine ?? 0) + Number(improvementYield.medicine ?? 0),
    intel: Number(baseYield.intel ?? 0) + Number(improvementYield.intel ?? 0),
    production: Number(baseYield.arms ?? 0) + Number(improvementYield.arms ?? 0),
  };
  const improvement = improvementDefinition?.label ?? "尚无改良";
  const institution = institutionDefinition?.label ?? "尚无机构";
  const warningText = typeof hex.warning === "string" ? hex.warning : hex.warning?.text;
  const warning = hex.warning
    ? `<div class="selectionWarning"><b>扫荡预警</b><span>${EscapeHtml(warningText ?? "敌军可能向本地行动")}</span></div>`
    : "";
  const constructionDefinition = FindDefinition(
    institutionDefinitions,
    construction?.institutionId ?? construction?.id,
  );
  const constructionRequired = Number(construction?.required ?? construction?.cost ?? 1);
  const queue = construction
    ? `<div class="constructionQueue"><span>建设队列</span><b>${EscapeHtml(constructionDefinition?.label ?? construction.name ?? construction.id ?? "工程")}</b><i style="--progress:${Clamp(Number(construction.progress ?? 0) / Math.max(1, constructionRequired) * 100, 0, 100)}%"></i><small>${Number(construction.progress ?? 0)} / ${constructionRequired} 工程</small></div>`
    : `<div class="constructionQueue empty"><span>建设队列</span><b>空闲</b><small>可安排机构或地块改良</small></div>`;
  return `
    ${warning}
    <div class="statGrid">
      <span><small>联系度</small><b>${isVillage ? `${hex.contact ?? 0} / 100` : "—"}</b></span>
      <span><small>困苦度</small><b class="${isVillage && hardship >= 60 ? "bad" : ""}">${isVillage ? `${hardship} / 100` : "—"}</b></span>
      <span><small>生计</small><b class="${isVillage && livelihood <= 35 ? "bad" : ""}">${isVillage ? `${livelihood} / 100` : "—"}</b></span>
      <span><small>安置户</small><b>${isVillage ? (hex.households ?? 0) : "—"}</b></span>
    </div>
    <div class="yieldRow" aria-label="地块产出">
      <span>粮 <b>${FormatDelta(yieldData.grain ?? 0)}</b></span>
      <span>药 <b>${FormatDelta(yieldData.medicine ?? 0)}</b></span>
      <span>情 <b>${FormatDelta(yieldData.intel ?? 0)}</b></span>
      <span>工 <b>${FormatDelta(yieldData.production ?? 0)}</b></span>
    </div>
    <dl class="settlementFacts">
      <div><dt>地块改良</dt><dd>${EscapeHtml(improvement)}</dd></div>
      <div><dt>地方机构</dt><dd>${EscapeHtml(institution)}</dd></div>
      <div><dt>转移准备</dt><dd>${hex.evacuated ? "已部署掩护路线" : "尚未部署"}</dd></div>
    </dl>
    ${queue}`;
}

function BuildUnitCard(unit, selected) {
  const definition = FindDefinition(unitDefinitions, unit.type) ?? {};
  return `
    <button type="button" class="unitCard${selected ? " selected" : ""}"
      data-unit-id="${EscapeHtml(unit.id)}" aria-pressed="${selected}">
      <span class="unitSymbol" aria-hidden="true">${EscapeHtml(definition.symbol ?? UnitSymbol(unit.type))}</span>
      <span>
        <b>${EscapeHtml(unit.name ?? definition.label ?? definition.name ?? "抗日力量")}</b>
        <small>${EscapeHtml(definition.label ?? definition.name ?? UnitLabel(unit.type))} · 战备 ${unit.readiness ?? unit.strength ?? 0} / ${unit.maximumReadiness ?? definition.readiness ?? "—"}</small>
      </span>
      <em>${unit.acted ? "已受令" : `机动 ${unit.moves ?? definition.moves ?? 1}`}</em>
    </button>`;
}

function BuildTravelUnitCard(unit, targetHexId) {
  const reachable = new Set((FindReachableHexes(gameState, unit.id) || []).map((entry) =>
    typeof entry === "string" ? entry : entry.hexId
  ));
  return `
    <div class="travelUnitCard">
      <span>当前选择：<b>${EscapeHtml(unit.name)}</b></span>
      <small>${reachable.has(targetHexId) ? "此格在可达范围内，可规划移动。" : "此格不在本回合可达范围内。"}</small>
      <button type="button" data-unit-id="${EscapeHtml(unit.id)}">返回人员所在格</button>
    </div>`;
}

function RenderActions(hex, selectedUnit) {
  if (!ui.actionList) return;
  let actions = [];
  try {
    actions = ListContextActions(gameState, hex.id, selectedUnit?.id ?? null) || [];
  } catch {
    actions = [];
  }
  if (hex.visible === false) {
    actions = actions.filter((action) => ["move", "recon"].includes(action.actionId ?? action.id));
  }
  if (!actions.length) {
    ui.actionList.innerHTML = `
      <p class="emptySelection">当前地块没有可规划行动。选择村庄、己方人员或相邻可达格。</p>`;
    return;
  }
  ui.actionList.innerHTML = actions.map((action, index) => {
    const actionId = action.actionId ?? action.id;
    const enabled = action.enabled !== false;
    const helpText = enabled
      ? (action.description ?? "")
      : (action.reason ?? action.description ?? "当前条件不足");
    return `
      <button type="button" class="actionCard ${EscapeHtml(action.kind ?? "")}"
        data-action-id="${EscapeHtml(actionId)}" ${enabled ? "" : "disabled"}
        aria-describedby="actionHelp${index}">
        <span class="actionIndex">${index + 1}</span>
        <span>
          <b>${EscapeHtml(action.label ?? FindDefinition(actionDefinitions, actionId)?.label ?? actionId)}</b>
          <small id="actionHelp${index}">${EscapeHtml(helpText)}</small>
        </span>
        <em>${EscapeHtml(action.costText ?? "")}</em>
      </button>`;
  }).join("");
  ui.actionList.querySelectorAll("[data-action-id]").forEach((button) => {
    button.addEventListener("click", () => QueueSelectedAction(button.dataset.actionId));
  });
}

function RenderOrders() {
  if (!ui.orderList) return;
  const orders = AsArray(gameState.orders);
  const used = orders.reduce((sum, order) => sum + Number(order.commandCost ?? 1), 0);
  const maximum = Number(gameState.commandMax ?? 4);
  const remaining = Number(gameState.commandPoints ?? maximum - used);
  SetText("commandValue", `${Math.max(0, remaining)} / ${maximum}`);
  ui.orderList.innerHTML = orders.length ? orders.map((order, index) => {
    const definition = FindDefinition(actionDefinitions, order.actionId) ?? {};
    const hex = GetHex(gameState, order.targetHexId ?? order.hexId);
    const unit = AsArray(gameState.units).find((item) => item.id === order.unitId);
    return `
      <article class="orderItem">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <div>
          <b>${EscapeHtml(order.label ?? definition.label ?? order.actionId)}</b>
          <small>${EscapeHtml([unit?.name, hex?.name].filter(Boolean).join(" · "))}</small>
        </div>
        <button type="button" data-remove-order="${index}" aria-label="撤销第 ${index + 1} 道命令">撤</button>
      </article>`;
  }).join("") : `
    <p class="emptyOrders"><b>命令队列为空</b><span>先检查群众困苦和敌军预警，再安排建设、转移与有限破袭。</span></p>`;
  ui.orderList.querySelectorAll("[data-remove-order]").forEach((button) => {
    button.addEventListener("click", () => RemoveQueuedOrder(Number(button.dataset.removeOrder)));
  });
  if (ui.clearOrdersButton) ui.clearOrdersButton.disabled = orders.length === 0;
  if (ui.executeButton) ui.executeButton.disabled = Boolean(gameState.gameOver);
}

function QueueSelectedAction(actionId) {
  if (!gameState || gameState.gameOver) return;
  const unit = AsArray(gameState.units).find((item) => item.id === selectedUnitId);
  const unitlessAction = actionId === "selfProduction";
  const orderUnitId = unitlessAction ? null : selectedUnitId;
  const sourceHexId = unitlessAction ? selectedHexId : (unit?.hexId ?? selectedHexId);
  const targetHexId = selectedHexId;
  let preview = null;
  try {
    preview = GetActionPreview(gameState, actionId, selectedHexId, orderUnitId);
  } catch {
    preview = null;
  }
  const dangerous = preview?.requiresConfirmation || preview?.riskLevel === "high";
  const QueueNow = () => {
    let result;
    try {
      result = QueueOrder(gameState, {
        actionId,
        hexId: sourceHexId,
        unitId: orderUnitId,
        targetHexId,
      });
    } catch (error) {
      result = { reason: error.message };
    }
    const normalized = ExtractStateResult(result);
    if (!normalized.state || normalized.error) {
      ShowToast(normalized.error ?? "这道命令当前无法执行", "bad");
      return;
    }
    gameState = normalized.state;
    SaveGame(false);
    RenderAll();
    const label = FindDefinition(actionDefinitions, actionId)?.label ?? preview?.title ?? actionId;
    Announce(`已加入命令：${label}`);
  };
  if (dangerous) {
    OpenStandardModal({
      eyebrow: "命令风险复核",
      title: preview.title ?? "确认这道命令",
      body: BuildPreviewHtml(preview),
      buttons: [
        { label: "返回规划", className: "secondaryButton", action: CloseTopModal },
        {
          label: "加入命令队列",
          className: "primaryButton danger",
          action: () => {
            CloseTopModal();
            QueueNow();
          },
        },
      ],
    });
  } else {
    QueueNow();
  }
}

function BuildPreviewHtml(preview) {
  if (!preview) return "<p>进入队列后仍可在结算前撤回。</p>";
  const effects = AsArray(preview.effects);
  const risks = AsArray(preview.risks);
  return `
    <p>${EscapeHtml(preview.summary ?? preview.description ?? "")}</p>
    ${effects.length ? `<h3>预计作用</h3><ul>${effects.map((item) => `<li>${EscapeHtml(item)}</li>`).join("")}</ul>` : ""}
    ${risks.length ? `<h3>必须承担的风险</h3><ul class="riskList">${risks.map((item) => `<li>${EscapeHtml(item)}</li>`).join("")}</ul>` : ""}
    <p class="ethicsNote">侵略军的报复与暴行责任属于实施者；风险预估用于提前保护群众，不把受害归责于抵抗行动。</p>`;
}

function RemoveQueuedOrder(index) {
  const result = RemoveOrder(gameState, index);
  const normalized = ExtractStateResult(result);
  if (normalized.state && !normalized.error) {
    gameState = normalized.state;
    SaveGame(false);
    RenderAll();
  } else if (normalized.error) {
    ShowToast(normalized.error, "bad");
  }
}

function ClearOrderQueue() {
  const result = ClearOrders(gameState);
  const normalized = ExtractStateResult(result);
  if (!normalized.state || normalized.error) {
    ShowToast(normalized.error ?? "命令队列无法清空", "bad");
    return;
  }
  gameState = normalized.state;
  SaveGame(false);
  RenderAll();
  Announce("本回合命令队列已清空");
}

function RequestExecuteTurn() {
  if (!gameState || gameState.gameOver) return;
  if (!AsArray(gameState.orders).length) {
    OpenStandardModal({
      eyebrow: "作战会议",
      title: "本回合尚未下达命令",
      body: `
        <p>消极等待也会让封锁、饥荒和扫荡继续推进。你可以继续规划，或承担后果直接结束本月。</p>
        <p class="ethicsNote">高评价要求同时保护群众、维持组织与完成必要牵制；单纯避战不会自动安全。</p>`,
      buttons: [
        { label: "继续规划", className: "secondaryButton", action: CloseTopModal },
        {
          label: "确认等待",
          className: "primaryButton danger",
          action: () => {
            CloseTopModal();
            ExecuteTurn();
          },
        },
      ],
    });
    return;
  }
  ExecuteTurn();
}

function ExecuteTurn() {
  if (!gameState) return;
  if (ui.executeButton) ui.executeButton.disabled = true;
  let result;
  const previousState = gameState;
  const resolvedWorldActionEffects = CaptureWorldActionEffects(previousState);
  try {
    result = ResolveTurn(gameState);
  } catch (error) {
    console.error(error);
    ShowToast("结算未完成，战局没有被改写", "bad");
    if (ui.executeButton) ui.executeButton.disabled = false;
    return;
  }
  const normalized = ExtractStateResult(result);
  if (!normalized.state || normalized.error) {
    ShowToast(normalized.error ?? "结算失败，命令仍保留", "bad");
    if (ui.executeButton) ui.executeButton.disabled = false;
    return;
  }
  gameState = normalized.state;
  pendingWorldActionEffects = resolvedWorldActionEffects;
  latestReport = normalized.report ?? BuildTransitionReport(previousState, gameState);
  selectedUnitId = AsArray(gameState.units).find((unit) => unit.id === selectedUnitId)?.id
    ?? AsArray(gameState.units)[0]?.id
    ?? null;
  selectedHexId = GetHex(gameState, selectedHexId)?.id
    ?? AsArray(gameState.units)[0]?.hexId
    ?? AsArray(gameState.hexes)[0]?.id
    ?? null;
  SaveGame(false);
  RenderAll();
  ShowTurnReport(latestReport);
}

function CaptureWorldActionEffects(state) {
  return AsArray(state?.orders)
    .filter((order) => ["ambush", "sabotage"].includes(order?.actionId))
    .map((order) => {
      const actingUnit = AsArray(state?.units).find((unit) => unit.id === order.unitId);
      return {
        id: order.id,
        actionId: order.actionId,
        targetHexId: order.targetHexId ?? order.hexId,
        sourceHexId: actingUnit?.hexId ?? null,
        unitId: order.unitId ?? null,
      };
    })
    .filter((effect) => Boolean(effect.targetHexId));
}

function PlayPendingWorldActionEffects() {
  const effects = pendingWorldActionEffects;
  pendingWorldActionEffects = [];
  if (!effects.length) return;
  const activeWorld = EnsureWorld3D();
  activeWorld?.PlayActionEffects?.(effects);
}

function BuildTransitionReport(previousState, nextState) {
  const briefing = GetTurnBriefing(previousState) || {};
  const previousLogLength = AsArray(previousState.log).length;
  const openingLogEntries = new Set(
    AsArray(nextState.openingCondition?.entries)
      .map((entry) => String(entry?.text ?? ""))
      .filter(Boolean),
  );
  const newLogEntries = AsArray(nextState.log)
    .slice(previousLogLength)
    .filter((entry) => !openingLogEntries.has(String(entry)));
  const previousCostLength = AsArray(previousState.ledger?.civilianCosts).length;
  const newCosts = AsArray(nextState.ledger?.civilianCosts).slice(previousCostLength);
  const previousEventLength = AsArray(previousState.eventState?.resolved).length;
  const newEventResults = AsArray(nextState.eventState?.resolved).slice(previousEventLength);
  const enemyPattern = /敌军|搜索队|巡逻队|扫荡|封锁|据点|铁路修复|占领军|守备/;
  const playerEffectPattern = /停运铁路继续牵制敌军修复与守备力量/;
  const costPattern = /受创|损失|流离|困苦|生计|伤亡|放弃|短缺/;
  const enemyEvents = newLogEntries.filter((entry) => {
    const text = String(entry);
    return enemyPattern.test(text) && !playerEffectPattern.test(text);
  });
  const playerEvents = newLogEntries.filter((entry) => {
    const text = String(entry);
    return (!enemyPattern.test(text) || playerEffectPattern.test(text))
      && !costPattern.test(text)
      && !/任务事件“/.test(text);
  });
  const meterDeltas = [
    ["人民安全", Number(nextState.meters?.people ?? 0) - Number(previousState.meters?.people ?? 0)],
    ["基层网络", Number(nextState.meters?.network ?? 0) - Number(previousState.meters?.network ?? 0)],
    ["根据地暴露", Number(nextState.meters?.exposure ?? 0) - Number(previousState.meters?.exposure ?? 0)],
    ["敌后贡献", Number(nextState.meters?.contribution ?? 0) - Number(previousState.meters?.contribution ?? 0)],
  ];
  return {
    title: `${briefing.date ?? "本月"} · ${briefing.title ?? "战局结算"}`,
    summary: meterDeltas.map(([label, delta]) => `${label} ${FormatDelta(delta)}`).join("；"),
    player: [
      ...newEventResults.map((entry) => ({
        title: `任务事件 · ${entry.title}`,
        text: entry.summary,
        delta: entry.outcomeLabel,
        kind: `eventOutcome ${String(entry.outcomeId || "").toLowerCase()}`,
      })),
      ...playerEvents.map((text) => ({ text })),
    ],
    enemy: enemyEvents.map((text) => ({ text })),
    costs: newCosts.map((entry) => ({
      title: entry.villageName ?? "战争代价",
      text: entry.text ?? "本月新增不可逆代价。",
      delta: entry.households ? `涉及 ${entry.households} 户` : "",
      kind: "cost",
    })),
  };
}

function ShowTurnReport(report) {
  if (!ui.reportModal) return;
  const briefing = GetTurnBriefing(gameState) || {};
  SetText("reportTitle", report.title ?? `${briefing.date ?? "本月"}战局结算`);
  SetText(
    "reportSummary",
    report.summary ?? "建设、敌军行动与群众生活已经同步结算。所有代价都被保留在战争损失簿。",
  );
  RenderReportList(ui.playerReportList, report.player ?? report.playerEvents ?? report.actions, "我方本月没有执行命令。");
  RenderReportList(ui.enemyReportList, report.enemy ?? report.enemyEvents, "敌军本月以封锁和侦察为主。");
  RenderReportList(ui.costReportList, report.costs ?? report.ledger ?? report.civilian, "本月没有新增可确认的战争代价。");
  OpenModal("reportModal");
  window.setTimeout(() => {
    if (ui.reportModal) ui.reportModal.scrollTop = 0;
    FocusWithoutScroll(ui.reportModal);
  }, 0);
  Announce(report.summary ?? "本回合结算完成", true);
}

function RenderReportList(container, entries, emptyMessage) {
  if (!container) return;
  const list = AsArray(entries);
  container.innerHTML = list.length
    ? list.map((entry) => {
      const normalized = typeof entry === "string" ? { text: entry } : entry;
      return `
        <article class="reportEntry ${EscapeHtml(normalized.kind ?? "")}">
          <b>${EscapeHtml(normalized.title ?? normalized.label ?? "")}</b>
          <p>${EscapeHtml(normalized.text ?? normalized.summary ?? normalized.message ?? "")}</p>
          ${normalized.delta ? `<span>${EscapeHtml(normalized.delta)}</span>` : ""}
        </article>`;
    }).join("")
    : `<p class="emptyReport">${EscapeHtml(emptyMessage)}</p>`;
}

function ContinueAfterReport() {
  CloseModal("reportModal");
  if (gameState?.gameOver || Number(gameState?.turn || 1) > turnLimit) {
    pendingWorldActionEffects = [];
    ShowOutcome();
  } else {
    const briefing = GetTurnBriefing(gameState) || {};
    ShowToast(briefing.short ?? briefing.objective ?? "进入下一回合", "normal");
    window.setTimeout(() => {
      PlayPendingWorldActionEffects();
      ui.mapCanvas?.focus();
    }, 0);
  }
}

function ShowOutcome() {
  if (!ui.outcomeModal) return;
  const assessment = GetVictoryAssessment(gameState) || {};
  const outcomeStamp = {
    HistoricalContinuity: "坚守",
    FragileSurvival: "存续",
    CivilianDisaster: "灾难",
    NetworkBroken: "破损",
    进行中: "未结",
  }[assessment.status] ?? "战报";
  SetText("outcomeGrade", outcomeStamp);
  SetText("outcomeTitle", assessment.title ?? "火种仍在");
  SetText(
    "outcomeSummary",
    assessment.summary
      ?? assessment.historicalCoda
      ?? "最困难的年月留下了无法抹去的代价，也检验了组织与群众的韧性。",
  );
  if (ui.outcomeEvidence) {
    const componentLabels = {
      people: "人民安全",
      network: "基层网络",
      averageLivelihood: "平均生计",
      contribution: "敌后贡献",
      institutions: "建成机构",
      unity: "抗日团结",
      discipline: "群众保护组织度",
      households: "现存住户",
      averageHardship: "平均困苦",
      survivingVillages: "存续村庄",
      eventResponsibilitiesProtected: "月度责任落实",
      eventResponsibilitiesPartial: "月度责任部分落实",
      eventResponsibilitiesNeglected: "月度责任缺口",
      operationalReadiness: "现存部队战备",
      logisticsReserve: "粮药周转储备",
      aggressiveActions: "主动军事行动",
      advancedDoctrines: "进阶路线层数",
      activePolicies: "执行中方针",
      combatLosses: "部队损失记录",
    };
    const componentEvidence = Object.entries(assessment.components ?? {}).map(([key, value]) => ({
      label: componentLabels[key] ?? key,
      value,
    }));
    const evidence = AsArray(assessment.evidence ?? assessment.metrics);
    if (!evidence.length) evidence.push(...componentEvidence);
    const requirementEvidence = AsArray(assessment.unmetRequirements).map((item) => ({
      label: "未达成",
      value: item.label ?? item.id,
      note: "该门槛不能由军事贡献抵消",
    }));
    ui.outcomeEvidence.innerHTML = [...evidence, ...requirementEvidence].map((item) => {
      const normalized = typeof item === "string" ? { label: item, value: "" } : item;
      return `
        <article>
          <span>${EscapeHtml(normalized.label ?? normalized.name ?? "")}</span>
          <b>${EscapeHtml(normalized.value ?? normalized.result ?? "")}</b>
          <small>${EscapeHtml(normalized.note ?? "")}</small>
        </article>`;
    }).join("");
  }
  if (ui.outcomeLedger) {
    ui.outcomeLedger.innerHTML = BuildLedgerHtml(gameState.ledger, true);
  }
  const outcomeCoda = ui.outcomeModal.querySelector("blockquote");
  if (outcomeCoda) {
    outcomeCoda.textContent = assessment.status === "HistoricalContinuity"
      ? "本县保存了继续抗战的条件；全国胜利仍属于长期坚持抗战的中国人民，不由一县提前改写。"
      : assessment.status === "CivilianDisaster"
        ? Number(assessment.components?.aggressiveActions || 0) >= 5
          ? "既定的全国胜利不能替本县的军事冒进开脱；村庄放弃、人民受创和组织破坏必须先被完整记录。"
          : "既定的全国胜利不能掩盖本县人民安全和村庄生计的灾难；每项损失都必须先被完整记录。"
        : assessment.status === "NetworkBroken"
          ? "既定的全国胜利不能倒推为本县成功；长期不作为与组织失灵同样必须接受明确结算。"
          : "本县仍有火种，但未完成责任和不可逆代价必须带入下一阶段，不能由一句胜利叙事抹去。";
  }
  OpenModal("outcomeModal");
  window.setTimeout(() => {
    if (ui.outcomeModal) ui.outcomeModal.scrollTop = 0;
    FocusWithoutScroll(ui.outcomeModal);
  }, 0);
}

function BuildHistoryRoleCards(narrative) {
  const roles = AsArray(narrative?.event?.roleIds)
    .map((roleId) => GetHistoryRole(roleId))
    .filter(Boolean);
  return roles.map((role) => `
    <section>
      <b>${EscapeHtml(role.displayName)} · ${EscapeHtml(role.role)}</b>
      <p>${EscapeHtml(role.description)}</p>
      <small>${EscapeHtml(role.classification)}；能力边界：${EscapeHtml(role.agencyLimit)}</small>
    </section>`).join("");
}

function BuildResponsibilityChainHtml(narrative) {
  return AsArray(narrative?.responsibilityChain).map((stage) => `
    <li>
      <b>${EscapeHtml(stage.label)}</b>：${EscapeHtml(stage.action)}
      <small>责任角色：${EscapeHtml(FormatHistoryRoleNames(stage.actorRoleIds))}；若遗漏：${EscapeHtml(stage.consequenceIfMissed)}</small>
    </li>`).join("");
}

function BuildHistoricalAnchorCards(narrative) {
  return AsArray(narrative?.fixedAnchorIds).map((anchorId) => {
    const anchor = GetFixedHistoricalAnchor(anchorId);
    if (!anchor) return "";
    const sources = AsArray(anchor.sourceIds)
      .map((sourceId) => GetHistorySource(sourceId))
      .filter(Boolean)
      .map((source) => `<a href="${EscapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${EscapeHtml(source.title)}</a>`)
      .join("；");
    return `
      <section>
        <b>${EscapeHtml(anchor.date)} · ${EscapeHtml(anchor.scope)}</b>
        <p>${EscapeHtml(anchor.statement)}</p>
        <small>玩法边界：${EscapeHtml(anchor.gameplayConstraint)}</small>
        ${sources ? `<small>公开来源：${sources}</small>` : ""}
      </section>`;
  }).join("");
}

function FormatHistoryChoiceNames(collection, ids, fallback) {
  const names = AsArray(ids)
    .map((id) => FindDefinition(collection, id)?.label
      ?? FindDefinition(collection, id)?.name
      ?? id)
    .filter(Boolean);
  return names.length ? names.join("、") : fallback;
}

function BuildHistoricalEventRecordHtml(turn) {
  if (!gameState) {
    return `<p class="ethicsNote"><b>尚未进入战局：</b>档案只说明本月责任边界；进入地图后，实际命令、结果与延迟后果才会写入这里。</p>`;
  }
  const resolved = AsArray(gameState.eventState?.resolved)
    .find((entry) => Number(entry.turn) === Number(turn));
  if (!resolved) {
    const preview = Number(turn) === Number(gameState.turn)
      ? GetTurnBriefing(gameState)?.historicalEvent
      : null;
    const hooks = AsArray(preview?.hooks).map((hook) => `
      <li>
        <b>${hook.met ? "已在命令队列落实" : "待落实"}</b>：${EscapeHtml(hook.label)}
      </li>`).join("");
    return `
      <h3>本月部署钩子 · 尚未结算</h3>
      <p>${EscapeHtml(preview?.objective ?? "本月仍在规划，尚无可归档的部署结果。")}</p>
      ${hooks ? `<ol class="tutorialSteps">${hooks}</ol>` : ""}
      <p class="ethicsNote">事件不会弹出孤立选项，也不会自动替你选择；只有地图上的真实命令与已经保存的机构会成为证据。</p>`;
  }

  const actionNames = FormatHistoryChoiceNames(
    actionDefinitions,
    resolved.choice?.actionIds,
    "空命令（本月未部署）",
  );
  const policyNames = FormatHistoryChoiceNames(
    policyDefinitions,
    resolved.choice?.policyIds,
    "未配置政策",
  );
  const targetNames = AsArray(resolved.choice?.targetHexIds)
    .map((hexId) => GetHex(gameState, hexId)?.name ?? hexId)
    .filter(Boolean);
  const evidence = AsArray(resolved.evidence).map((hook) => `
    <li>
      <b>${hook.met ? "已落实" : "未落实"}</b>：${EscapeHtml(hook.label)}
    </li>`).join("");
  const consequences = [
    ...AsArray(gameState.eventState?.pendingConsequences)
      .filter((entry) => Number(entry.sourceTurn) === Number(turn))
      .map((entry) => ({ ...entry, stateLabel: `待第 ${entry.applyTurn} 回合兑现` })),
    ...AsArray(gameState.eventState?.appliedConsequences)
      .filter((entry) => Number(entry.sourceTurn) === Number(turn))
      .map((entry) => ({ ...entry, stateLabel: `已于${entry.date ?? `第 ${entry.turn} 回合`}兑现` })),
  ];
  const consequenceHtml = consequences.map((entry) => `
    <section>
      <b>${EscapeHtml(entry.stateLabel)}</b>
      <p>${EscapeHtml(entry.text)}</p>
      ${entry.responsibilityNote ? `<small>${EscapeHtml(entry.responsibilityNote)}</small>` : ""}
    </section>`).join("");
  return `
    <h3>本月选择与结果 · ${EscapeHtml(resolved.outcomeLabel)}</h3>
    <p>${EscapeHtml(resolved.summary)}</p>
    <div class="briefColumns">
      <section><b>实际命令</b><p>${EscapeHtml(actionNames)}</p></section>
      <section><b>地图目标</b><p>${EscapeHtml(targetNames.length ? targetNames.join("、") : "无指定目标")}</p></section>
      <section><b>当月政策</b><p>${EscapeHtml(policyNames)}</p></section>
    </div>
    <h3>部署证据与遗漏项</h3>
    <ol class="tutorialSteps">${evidence}</ol>
    ${consequenceHtml
      ? `<h3>延迟后果</h3><div class="briefColumns">${consequenceHtml}</div>`
      : `<p class="ethicsNote"><b>延迟后果：</b>本月没有登记待兑现的历史责任后果。</p>`}`;
}

function ShowHistoryArchive(requestedTurn = Number(gameState?.turn ?? 1)) {
  const latestVisibleTurn = Clamp(Math.trunc(Number(gameState?.turn ?? 1)), 1, turnLimit);
  const visibleTurn = Clamp(Math.trunc(Number(requestedTurn) || 1), 1, latestVisibleTurn);
  const { turn, narrative, phase } = GetHistoryContext(visibleTurn);
  if (!narrative) {
    ShowToast("当前回合没有可用的历史档案", "bad");
    return;
  }
  const buttons = [];
  if (turn > 1) {
    buttons.push({
      label: "上一月",
      className: "secondaryButton",
      action: () => ShowHistoryArchive(turn - 1),
    });
  }
  if (turn < latestVisibleTurn) {
    buttons.push({
      label: "下一月",
      className: "secondaryButton",
      action: () => ShowHistoryArchive(turn + 1),
    });
  }
  buttons.push({ label: "返回战局", className: "primaryButton", action: CloseTopModal });

  OpenStandardModal({
    eyebrow: `${narrative.date} · 第 ${turn} / ${turnLimit} 回合历史档案`,
    title: `${phase?.title ?? "地方阶段"} · ${narrative.title}`,
    body: `
      <p><b>${EscapeHtml(phase?.classification ?? "地方阶段")}：</b>${EscapeHtml(phase?.description ?? narrative.historicalFrame)}</p>
      <p class="ethicsNote">这是地方阶段，不是全国抗战重新分期。${EscapeHtml(narrative.historicalFrame)}</p>
      <h3>${EscapeHtml(narrative.event.classification)}事件 · ${EscapeHtml(narrative.event.title)}</h3>
      <p>${EscapeHtml(narrative.event.synopsis)}</p>
      <p><small>${EscapeHtml(narrative.event.disclaimer)}</small></p>
      ${BuildHistoricalEventRecordHtml(turn)}
      <div class="briefColumns">${BuildHistoryRoleCards(narrative)}</div>
      <h3>发现—准备—保护—应对—恢复责任链</h3>
      <ol class="tutorialSteps">${BuildResponsibilityChainHtml(narrative)}</ol>
      <p class="ethicsNote"><b>后果不会被战斗贡献抵消：</b>${EscapeHtml(narrative.failureCarryForward.text)}</p>
      <h3>固定史实锚点</h3>
      <div class="briefColumns">${BuildHistoricalAnchorCards(narrative)}</div>
      <p><small>档案说明：${EscapeHtml(narrative.archiveNote)} 真人只出现在可追溯的档案与来源中，不作为可操作人物或数值奖励。</small></p>`,
    buttons,
  });
}

function ShowHistoryBoundary() {
  const scoringRules = AsArray(historyBoundary.scoringRules)
    .map((rule) => `<li>${EscapeHtml(rule)}</li>`)
    .join("");
  OpenStandardModal({
    eyebrow: historyBoundary.classification,
    title: historyBoundary.title,
    body: `
      <p>${EscapeHtml(historyBoundary.geography.mapRule)}</p>
      <p><b>地方与全国分期：</b>${EscapeHtml(historyBoundary.claims.national)}</p>
      <p><b>历史终点不可由玩家改写：</b>${EscapeHtml(historyBoundary.claims.fixedVictory)}</p>
      <p><b>本局责任：</b>${EscapeHtml(historyBoundary.claims.local)}</p>
      <ol class="tutorialSteps">${scoringRules}</ol>
      <p class="ethicsNote">${EscapeHtml(historyBoundary.narrativeRules.join(" "))}</p>`,
    buttons: [
      {
        label: gameState ? "查看本回合责任档案" : "查看首月责任档案",
        className: "secondaryButton",
        action: () => ShowHistoryArchive(Number(gameState?.turn ?? 1)),
      },
      { label: "我已了解", className: "primaryButton", action: CloseTopModal },
    ],
  });
}

function ShowScenarioBrief() {
  OpenStandardModal({
    eyebrow: "第 1 号敌后战局简报",
    title: "1941 年秋 · 封锁线正在收紧",
    body: `
      <div class="briefColumns">
        <section><b>你掌握的不是一支无穷军队</b><p>只有一支工作队、一支游击队、一支主力支队、村庄民兵与少量粮药。每道命令都要由群众掩护、交通员送达并承担后果。</p></section>
        <section><b>村庄不是资源矿</b><p>先看困苦与生计，再谈组织、生产和建设。失去群众，地图上的任何“控制区”都只是空壳。</p></section>
        <section><b>胜利不是歼灭数字</b><p>完成必要破袭、牵制占领军，并让多数村庄和党群网络坚持过 1942 年，才是本局的胜利。</p></section>
      </div>
      <ol class="tutorialSteps">
        <li>点选有工作队的六角格，先侦察或走访。</li>
        <li>检查村庄困苦，优先救济、建设交通站与救护所。</li>
        <li>在预警出现时安排转移，再用有限力量破袭铁路。</li>
        <li>把命令加入队列，复核后执行本回合。</li>
      </ol>`,
    buttons: [
      { label: "查看表达边界", className: "secondaryButton", action: ShowHistoryBoundary },
      { label: "进入地图", className: "primaryButton", action: CloseTopModal },
    ],
  });
}

function ShowRules() {
  OpenStandardModal({
    eyebrow: "敌后根据地建设手册",
    title: "完整核心循环",
    body: `
      <div class="loopRibbon">
        <span>察敌情</span><i>→</i><span>组织群众</span><i>→</i><span>生产建设</span><i>→</i>
        <span>疏散隐蔽</span><i>→</i><span>有限破袭</span><i>→</i><span>反扫荡恢复</span>
      </div>
      <h3>村庄与地块</h3>
      <p>联系度决定情报、隐蔽与建设能力；困苦度和生计反映人民处境。村庄先完成工程队列，才会形成交通站、救护所、互助粮站、兵工小组或地道网。地块改良提供持续但脆弱的产出。</p>
      <h3>人员与命令</h3>
      <p>工作队擅长走访、救济和建设；游击队承担侦察、伏击和破袭；主力支队主要用于反扫荡防御，战备和粮秣负担也更重。每回合通常 4 道行动令，结算前可撤回。</p>
      <h3>敌军回合</h3>
      <p>占领军沿县城、铁路和据点补给，先侦察、再封锁、后扫荡。交通站与情报会给出方向预警；群众转移、地道网和山地隐蔽能减轻代价。警戒降低不代表侵略停止。</p>
      <h3>评价</h3>
      <p>坚持到第 ${turnLimit} 回合，依据人民保护、基层网络、根据地建设、战略牵制和战争损失综合评价。龟缩不作贡献，莽攻会摧毁人民安全，两者都不能获得高评价。</p>
      <h3>键盘与鼠标</h3>
      <p>方向键切换相邻格，方括号切换人员，数字键 1—9 选择行动，M 聚焦地图，Ctrl+Enter 结束本回合。地图支持按住鼠标拖动、滚轮缩放，所有操作都有界面按钮替代。</p>`,
    buttons: [
      { label: "本回合历史档案", className: "secondaryButton", action: () => ShowHistoryArchive() },
      { label: "返回战局", className: "primaryButton", action: CloseTopModal },
    ],
  });
}

function ShowDoctrineTree() {
  const definitions = DefinitionList(doctrineDefinitions);
  const civilianState = gameState.doctrines?.civilian ?? { experience: 0, unlocked: [] };
  const militaryState = gameState.doctrines?.military ?? { experience: 0, unlocked: [] };
  const owned = new Set([
    ...AsArray(civilianState.unlocked),
    ...AsArray(militaryState.unlocked),
  ]);
  const branches = ["civilian", "military"];
  const branchNames = { civilian: "群众路线与根据地建设", military: "游击战争与人民武装" };
  const columns = branches.map((branch) => {
    const branchState = branch === "civilian" ? civilianState : militaryState;
    const cards = definitions.filter((item, index) =>
      (item.tree ?? item.branch ?? (index % 2 ? "military" : "civilian")) === branch
    );
    return `
      <section class="doctrineBranch">
        <h3>${branchNames[branch]} <small>${branchState.experience} 路线经验</small></h3>
        ${cards.map((item) => {
          const isOwned = owned.has(item.id);
          const prerequisiteMet = !item.prerequisite || owned.has(item.prerequisite);
          const experienceCost = GetDoctrineExperienceCost(item);
          const locked = !isOwned && (!prerequisiteMet || branchState.experience < experienceCost);
          return `
            <button type="button" class="doctrineCard${isOwned ? " owned" : ""}"
              data-doctrine-id="${EscapeHtml(item.id)}" ${locked || isOwned ? "disabled" : ""}>
              <b>${EscapeHtml(item.label ?? item.name ?? item.id)}</b>
              <span>${EscapeHtml(item.description ?? item.effect ?? "")}</span>
              <em>${isOwned ? "已贯彻" : !prerequisiteMet ? "前置路线未完成" : locked ? `需要 ${experienceCost} 经验` : `贯彻 · ${experienceCost} 经验`}</em>
            </button>`;
        }).join("")}
      </section>`;
  }).join("");
  OpenStandardModal({
    eyebrow: `长期方针 · 民生 ${civilianState.experience} / 军事 ${militaryState.experience}`,
    title: "群众路线 / 游击战争双树",
    body: `<div class="doctrineTree">${columns}</div>`,
    buttons: [{ label: "返回规划", className: "secondaryButton", action: CloseTopModal }],
  });
  ui.modalBody?.querySelectorAll("[data-doctrine-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const result = UnlockDoctrine(gameState, button.dataset.doctrineId);
      const normalized = ExtractStateResult(result);
      if (!normalized.state || normalized.error) {
        ShowToast(normalized.error ?? "当前无法贯彻这项方针", "bad");
        return;
      }
      gameState = normalized.state;
      SaveGame(false);
      CloseTopModal();
      ShowDoctrineTree();
      RenderAll();
    });
  });
}

function ShowPolicyBoard() {
  const definitions = DefinitionList(policyDefinitions);
  const active = new Set(AsArray(gameState.policies).map((item) => typeof item === "string" ? item : item.id));
  OpenStandardModal({
    eyebrow: "两项政策槽 · 可随回合调整",
    title: "本月根据地方针",
    body: `
      <p>政策不是无代价加成。每项都改变生产、暴露、群众负担或部队能力；最多同时执行两项。当前群众保护组织度 <b>${gameState.meters?.discipline ?? 0}</b>。数值越高，预警、隐蔽安置与联络准备越充分，越能减轻侵略军扫荡造成的伤害；侵略暴行责任始终属于实施者。</p>
      <div class="policyGrid">
        ${definitions.map((item) => `
          <button type="button" class="policyCard${active.has(item.id) ? " active" : ""}"
            data-policy-id="${EscapeHtml(item.id)}" aria-pressed="${active.has(item.id)}">
            <b>${EscapeHtml(item.name ?? item.label ?? item.id)}</b>
            <span>${EscapeHtml(item.description ?? item.effect ?? "")}</span>
            <em>${active.has(item.id) ? "正在执行" : "选择"}</em>
          </button>`).join("")}
      </div>
      <p class="ethicsNote">群众保护、减租减息、生产自救与精兵简政等方针，必须落实为群众负担和根据地韧性的实际变化。</p>`,
    buttons: [{ label: "完成调整", className: "primaryButton", action: CloseTopModal }],
  });
  ui.modalBody?.querySelectorAll("[data-policy-id]").forEach((button) => {
    button.addEventListener("click", () => TogglePolicy(button.dataset.policyId));
  });
}

function TogglePolicy(policyId) {
  const current = AsArray(gameState.policies).map((item) => typeof item === "string" ? item : item.id);
  const next = current.includes(policyId)
    ? current.filter((id) => id !== policyId)
    : [...current, policyId].slice(-2);
  const result = SetPolicies(gameState, next);
  const normalized = ExtractStateResult(result);
  if (!normalized.state || normalized.error) {
    ShowToast(normalized.error ?? "政策调整未能执行", "bad");
    return;
  }
  gameState = normalized.state;
  SaveGame(false);
  CloseTopModal();
  ShowPolicyBoard();
  RenderAll();
}

function ShowCostLedger() {
  OpenStandardModal({
    eyebrow: "战争损失簿 · 永久记录",
    title: "这些数字不是分数",
    body: `
      ${BuildLedgerHtml(gameState.ledger)}
      <p class="ethicsNote">村庄受难、平民死伤、被迫流离、干部与战士牺牲，均不产生资源、经验或奖励。优秀决策只能尽力减少损失，不能抹去战争的残酷。</p>`,
    buttons: [{ label: "返回地图", className: "primaryButton", action: CloseTopModal }],
  });
}

function ShowResourceInfo(kind) {
  if (!gameState) return;
  const resources = gameState.resources || {};
  const meters = gameState.meters || {};
  const entries = {
    grain: {
      title: "粮秣",
      value: resources.grain ?? 0,
      meaning: "用于救济、群众转移、人员供给与生产恢复。村庄不是永久产粮点；困苦和损毁会立即中断支援。",
    },
    arms: {
      title: "军械",
      value: resources.arms ?? resources.supplies ?? 0,
      meaning: "用于必要的伏击、铁路破袭、兵工建设与战备恢复。军械不能替代群众基础。",
    },
    medicine: {
      title: "医疗",
      value: resources.medicine ?? 0,
      meaning: "用于救护伤员、建设救护所并降低扫荡后的持续损失。医疗短缺会使轻伤和疾病继续恶化。",
    },
    intel: {
      title: "情报",
      value: resources.intel ?? resources.intelligence ?? 0,
      meaning: "来自交通员、基层组织与群众掩护。用于揭示扫荡目标、安全路线和有限作战窗口。",
    },
    cadres: {
      title: "干部与交通骨干",
      value: resources.cadres ?? resources.organization ?? 0,
      meaning: "用于深入走访、建立党支部、维持交通站和恢复被破坏的基层网络。",
    },
    people: {
      title: "人民安全与群众基础",
      value: meters.people ?? meters.peopleSafety ?? 0,
      meaning: "反映人民生活、组织信任和根据地韧性。它不是可消费资源；高评价必须把人民保护放在军事数字之前。",
    },
    exposure: {
      title: "暴露与敌军警戒",
      value: meters.exposure ?? gameState.alert ?? 0,
      meaning: "高调行动、铁路破袭和暴露机构会提高风险。情报、隐蔽交通与群众转移可以降低损失，但侵略军暴行的责任始终属于实施者。",
    },
    contribution: {
      title: "敌后抗战贡献",
      value: meters.contribution ?? 0,
      meaning: "由根据地建设、基层网络、必要破袭、牵制和坚持共同形成；击杀数不是本作评价指标。",
    },
  };
  const entry = entries[kind] ?? entries.grain;
  OpenStandardModal({
    eyebrow: "战时总账 · 来源与用途",
    title: entry.title,
    body: `
      <div class="resourceBreakdown">
        <span>当前记录</span><b>${EscapeHtml(entry.value)}</b>
        <p>${EscapeHtml(entry.meaning)}</p>
      </div>
      <p class="ethicsNote">所有增减都在回合战报中给出原因；人民死伤与流离永不显示为正向产出。</p>`,
    buttons: [{ label: "返回战局", className: "primaryButton", action: CloseTopModal }],
  });
}

function BuildLedgerHtml(ledger = {}, compact = false) {
  const entries = [
    ["受影响住户", ledger.affectedHouseholds ?? ledger.civilianCasualties ?? ledger.civilianLosses ?? 0, "只记录，不计分"],
    ["被迫流离住户", ledger.displacedHouseholds ?? ledger.displaced ?? 0, "影响村庄恢复与困苦"],
    ["生计损毁", ledger.livelihoodDestroyed ?? ledger.villagesDamaged ?? ledger.destroyedVillages ?? 0, "损失不可自动恢复"],
    ["被迫放弃村庄", AsArray(ledger.villageAbandonments).length, "基层机构与建设队列同时失去"],
    ["战斗损失记录", AsArray(ledger.combatLosses).length, "不以击杀数抵销"],
    ["代价事件", AsArray(ledger.civilianCosts).length, "每一项均保留日期和因果"],
    ["延迟后果", AsArray(ledger.historicalConsequences).length, "显示源事件与兑现月份"],
  ];
  const records = [
    ...AsArray(ledger.civilianCosts).map((entry) => ({
      turn: Number(entry.turn) || 0,
      date: entry.date ?? `第 ${entry.turn ?? "?"} 回合`,
      title: entry.villageName ?? "人民与组织代价",
      text: entry.text ?? "本项代价缺少说明。",
      note: entry.temporary
        ? "保护性临时安置；不自动计作永久流离"
        : `记录类型：${entry.type ?? "战争代价"}`,
    })),
    ...AsArray(ledger.combatLosses).map((entry) => ({
      turn: Number(entry.turn) || 0,
      date: entry.date ?? `第 ${entry.turn ?? "?"} 回合`,
      title: entry.unitName ?? "部队损失",
      text: entry.text ?? "本项战斗损失缺少说明。",
      note: "不以歼敌或贡献数字抵消",
    })),
    ...AsArray(ledger.historicalConsequences).map((entry) => ({
      turn: Number(entry.turn) || 0,
      date: entry.date ?? `第 ${entry.turn ?? "?"} 回合`,
      title: `延迟后果 · ${entry.sourceTitle ?? "上月责任缺口"}`,
      text: entry.text ?? "未完成责任在本月继续产生影响。",
      note: `${entry.sourceDate ?? "此前"}形成；${entry.responsibilityNote ?? "责任与后果分别记录"}`,
    })),
  ].sort((first, second) => first.turn - second.turn);
  return `
    <div class="ledgerGrid${compact ? " compact" : ""}">
      ${entries.map(([label, value, note]) => `
        <article><span>${label}</span><b>${EscapeHtml(value)}</b><small>${note}</small></article>`).join("")}
    </div>
    <div class="reportList ledgerRecordList">
      ${records.length
        ? records.map((entry) => `
          <article class="reportEntry cost">
            <b>${EscapeHtml(entry.date)} · ${EscapeHtml(entry.title)}</b>
            <p>${EscapeHtml(entry.text)}</p>
            <span>${EscapeHtml(entry.note)}</span>
          </article>`).join("")
        : "<p class=\"emptyReport\">尚无逐条代价或延迟后果记录。</p>"}
    </div>`;
}

function ShowGameMenu() {
  OpenStandardModal({
    eyebrow: "战局菜单",
    title: "敌后火种",
    body: `
      <p>当前战局会在每次规划与回合结算后自动保存到本机。</p>
      <div class="menuSummary">
        <span>回合 <b>${gameState?.turn ?? 1} / ${turnLimit}</b></span>
        <span>命令 <b>${AsArray(gameState?.orders).length}</b></span>
        <span>损失记录 <b>${Object.values(gameState?.ledger ?? {}).reduce((sum, value) => sum + (Number(value) || 0), 0)}</b></span>
      </div>`,
    buttons: [
      { label: "继续战局", className: "primaryButton", action: CloseTopModal },
      {
        label: "立即保存",
        className: "secondaryButton",
        action: () => {
          SaveGame(true);
          CloseTopModal();
        },
      },
      { label: "重新开始", className: "dangerButton", action: ConfirmRestart },
    ],
  });
}

function ConfirmRestart() {
  if (!IsDesktopViewportSupported()) return;
  OpenStandardModal({
    eyebrow: "不可撤销操作",
    title: "放弃当前战局并重新开始？",
    body: `<p>现有本地存档会被新的 1941 年秋战局覆盖。战争损失簿、建设队列和所有未执行命令都将清空。</p>`,
    buttons: [
      {
        label: "取消",
        className: "secondaryButton",
        action: () => {
          CloseTopModal();
          window.setTimeout(() => FocusWithoutScroll(ui.menuButton), 0);
        },
      },
      {
        label: "确认重新开始",
        className: "dangerButton",
        action: () => {
          CloseAllModals();
          StartNewGame();
        },
      },
    ],
  });
}

function OpenStandardModal({ eyebrow, title, body, buttons = [] }) {
  SetText("modalEyebrow", eyebrow ?? "战局档案");
  SetText("modalTitle", title ?? "");
  if (ui.modalBody) ui.modalBody.innerHTML = body ?? "";
  if (ui.modalFooter) {
    ui.modalFooter.innerHTML = "";
    buttons.forEach((definition) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = definition.className ?? "secondaryButton";
      button.textContent = definition.label;
      button.addEventListener("click", definition.action);
      ui.modalFooter.append(button);
    });
  }
  OpenModal("standardModal");
  window.setTimeout(() => {
    if (ui.standardModal) ui.standardModal.scrollTop = 0;
    FocusWithoutScroll(ui.standardModal?.querySelector("button:not([disabled])") ?? ui.standardModal);
  }, 0);
}

function FocusWithoutScroll(element) {
  if (!(element instanceof HTMLElement)) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function OpenModal(id) {
  lastFocusElement = document.activeElement;
  document.body.classList.add("modalOpen");
  if (ui.modalBackdrop) ui.modalBackdrop.hidden = false;
  const modal = ui[id] || Element(id);
  if (modal) {
    modal.scrollTop = 0;
    modal.hidden = false;
    modal.dataset.open = "true";
    modal.dataset.modalOrder = String(++modalSequence);
    modal.style.zIndex = String(115 + modalSequence);
  }
}

function CloseModal(id) {
  const modal = ui[id] || Element(id);
  if (modal) {
    modal.hidden = true;
    delete modal.dataset.open;
    delete modal.dataset.modalOrder;
    modal.style.removeProperty("z-index");
  }
  const stillOpen = modalIds.some((modalId) => !(ui[modalId] || Element(modalId))?.hidden);
  if (ui.modalBackdrop) ui.modalBackdrop.hidden = !stillOpen;
  document.body.classList.toggle("modalOpen", stillOpen);
  const topModal = GetTopOpenModal();
  if (stillOpen) {
    const nestedFocusTarget = lastFocusElement instanceof HTMLElement
      && topModal?.contains(lastFocusElement)
      && !lastFocusElement.closest("[hidden]")
      ? lastFocusElement
      : topModal;
    window.setTimeout(() => FocusWithoutScroll(nestedFocusTarget), 0);
  } else {
    const fallbackFocusTarget = ui.gameShell && !ui.gameShell.hidden
      ? ui.menuButton
      : ui.startButton;
    const returnFocusTarget = lastFocusElement instanceof HTMLElement
      && lastFocusElement.isConnected
      && !lastFocusElement.closest("[hidden]")
      ? lastFocusElement
      : fallbackFocusTarget;
    window.setTimeout(() => FocusWithoutScroll(returnFocusTarget), 0);
  }
}

function CloseTopModal() {
  const topModal = GetTopOpenModal();
  const openId = topModal?.id;
  if (openId === "outcomeModal" || (openId === "reportModal" && gameState?.gameOver)) {
    return;
  }
  if (openId) CloseModal(openId);
}

function GetTopOpenModal() {
  return modalIds
    .map((id) => ui[id] || Element(id))
    .filter((modal) => modal && !modal.hidden)
    .sort((first, second) =>
      Number(second.dataset.modalOrder ?? 0) - Number(first.dataset.modalOrder ?? 0)
    )[0] ?? null;
}

function CloseAllModals() {
  modalIds.forEach((id) => {
    const modal = ui[id] || Element(id);
    if (modal) {
      modal.hidden = true;
      delete modal.dataset.open;
      delete modal.dataset.modalOrder;
      modal.style.removeProperty("z-index");
    }
  });
  if (ui.modalBackdrop) ui.modalBackdrop.hidden = true;
  document.body.classList.remove("modalOpen");
}

function SelectHex(hexId, recenter = false) {
  const hex = GetHex(gameState, hexId);
  if (!hex) return;
  selectedHexId = hex.id;
  const unitsHere = AsArray(gameState.units).filter((unit) => unit.hexId === hex.id);
  if (unitsHere.length && !AsArray(gameState.units).some((unit) => unit.id === selectedUnitId && unit.hexId !== hex.id)) {
    selectedUnitId = unitsHere[0].id;
  }
  if (recenter) CenterOnHex(hex.id);
  RenderSelection();
  RenderHexNavigator();
  RenderMap();
  Announce(`${hex.visible === false ? "未明地区" : hex.name}，${ControlLabel(hex.control)}`);
}

function SelectUnit(unitId) {
  const unit = AsArray(gameState.units).find((item) => item.id === unitId);
  if (!unit) return;
  selectedUnitId = unit.id;
  selectedHexId = unit.hexId;
  RenderSelection();
  RenderHexNavigator();
  RenderMap();
  Announce(`已选择${unit.name}`);
}

function CycleUnit(direction = 1) {
  const units = AsArray(gameState.units);
  if (!units.length) return;
  const current = units.findIndex((unit) => unit.id === selectedUnitId);
  const next = (current + direction + units.length) % units.length;
  SelectUnit(units[next].id);
  CenterOnHex(units[next].hexId);
}

function HandleGlobalKeyDown(event) {
  const openModalElement = GetTopOpenModal();
  if (event.key === "Escape" && openModalElement) {
    event.preventDefault();
    CloseTopModal();
    return;
  }
  if (event.key === "Tab" && openModalElement) {
    TrapModalFocus(event, openModalElement);
    return;
  }
  if (openModalElement) return;
  if (!IsDesktopViewportSupported() || !gameState || ui.gameShell?.hidden) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  if (event.key.toLowerCase() === "m") {
    event.preventDefault();
    ui.mapCanvas?.focus();
  } else if (event.key === "[") {
    event.preventDefault();
    CycleUnit(-1);
  } else if (event.key === "]") {
    event.preventDefault();
    CycleUnit(1);
  } else if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault();
    RequestExecuteTurn();
  } else if (/^[1-9]$/.test(event.key)) {
    const buttons = [...(ui.actionList?.querySelectorAll("button:not([disabled])") ?? [])];
    const button = buttons[Number(event.key) - 1];
    if (button) {
      event.preventDefault();
      button.click();
    }
  }
}

function TrapModalFocus(event, modal) {
  const focusable = [...modal.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hidden && element.getClientRects().length > 0);
  if (!focusable.length) {
    event.preventDefault();
    modal.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function HandleMapKeyDown(event) {
  if (!IsDesktopViewportSupported()) return;
  const directions = {
    ArrowRight: [1, 0],
    ArrowLeft: [-1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    d: [1, 0],
    a: [-1, 0],
    w: [0, -1],
    s: [0, 1],
  };
  if (directions[event.key]) {
    event.preventDefault();
    MoveKeyboardSelection(...directions[event.key]);
  } else if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    ChangeZoom(1.15);
  } else if (event.key === "-") {
    event.preventDefault();
    ChangeZoom(0.87);
  } else if (event.key === "Enter" && selectedHexId) {
    event.preventDefault();
    RenderSelection();
    ui.actionList?.querySelector("button:not([disabled])")?.focus();
  }
}

function MoveKeyboardSelection(deltaQ, deltaR) {
  const current = GetHex(gameState, selectedHexId);
  if (!current) return;
  const target = AsArray(gameState.hexes).find((hex) =>
    hex.q === current.q + deltaQ && hex.r === current.r + deltaR
  ) ?? GetNeighbors(gameState, current.id)?.[0];
  const targetId = typeof target === "string" ? target : target?.id;
  if (targetId) {
    SelectHex(targetId, true);
  }
}

function ToggleMapLayer() {
  mapLayer = mapLayer === "situation" ? "construction" : "situation";
  if (ui.layerButton) {
    ui.layerButton.setAttribute("aria-pressed", String(mapLayer === "construction"));
    ui.layerButton.title = mapLayer === "situation" ? "切换到建设图层" : "切换到战局图层";
  }
  RenderBriefing();
  RenderMap();
}

function ChangeZoom(factor, anchor = null) {
  const before = mapCamera.zoom;
  mapCamera.zoom = Clamp(mapCamera.zoom * factor, 0.65, 2.25);
  if (anchor && before !== mapCamera.zoom) {
    const ratio = mapCamera.zoom / before;
    const offsetX = anchor.x - mapCamera.centerX;
    const offsetY = anchor.y - mapCamera.centerY;
    mapCamera.panX = offsetX - (offsetX - mapCamera.panX) * ratio;
    mapCamera.panY = offsetY - (offsetY - mapCamera.panY) * ratio;
  }
  RenderMap();
}

function CenterMap() {
  mapCamera.panX = 0;
  mapCamera.panY = 0;
  mapCamera.zoom = 1;
  RenderMap();
}

function CenterOnHex(hexId) {
  const hex = GetHex(gameState, hexId);
  if (!hex || !ui.mapCanvas) return;
  const world = HexToWorld(hex.q, hex.r);
  const scale = mapCamera.fitScale * mapCamera.zoom;
  mapCamera.panX = -(world.x - mapCamera.worldCenterX) * scale * mapCamera.zoom;
  mapCamera.panY = -(world.y - mapCamera.worldCenterY) * scale * mapCamera.zoom;
  RenderMap();
}

function EnsureWorld3D() {
  if (!IsDesktopViewportSupported()) return null;
  if (world3D || world3DFailed || !ui.mapCanvas) return world3D;
  try {
    world3D = CreateEnemyRearWorld3D(ui.mapCanvas, {
      onSelectHex: (hexId) => SelectHex(hexId),
    });
    ui.mapCanvas.dataset.renderer = "three";
    ui.mapCanvas.dataset.cacheIdentity = World3DCacheIdentity;
    if (ui.worldModeBadge) {
      ui.worldModeBadge.textContent = "县境沙盘 · 立体战术图";
      ui.worldModeBadge.dataset.mode = "three";
    }
  } catch (error) {
    world3DFailed = true;
    ui.mapCanvas.dataset.renderer = "canvas-fallback";
    if (ui.worldModeBadge) {
      ui.worldModeBadge.textContent = "县境地图 · 平面图";
      ui.worldModeBadge.dataset.mode = "fallback";
    }
    console.warn("Three.js world initialization failed; using the accessible Canvas fallback.", error);
  }
  return world3D;
}

function MeasureMapCanvas() {
  const rect = ui.mapCanvas?.getBoundingClientRect();
  if (!rect || rect.width < 2 || rect.height < 2) return null;
  return { width: rect.width, height: rect.height };
}

function GetReachableHexIds() {
  if (!selectedUnitId || !gameState) return [];
  try {
    return (FindReachableHexes(gameState, selectedUnitId) || []).map((entry) =>
      typeof entry === "string" ? entry : entry.id ?? entry.hexId
    ).filter(Boolean);
  } catch {
    return [];
  }
}

function ResizeCanvas() {
  const canvas = ui.mapCanvas;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width: rect.width, height: rect.height, dpr };
}

function CalculateMapBounds() {
  const hexes = AsArray(gameState?.hexes);
  if (!hexes.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  const points = hexes.map((hex) => HexToWorld(hex.q, hex.r));
  return {
    minX: Math.min(...points.map((point) => point.x)) - mapCamera.hexSize,
    maxX: Math.max(...points.map((point) => point.x)) + mapCamera.hexSize,
    minY: Math.min(...points.map((point) => point.y)) - mapCamera.hexSize,
    maxY: Math.max(...points.map((point) => point.y)) + mapCamera.hexSize,
  };
}

function UpdateMapTransform(width, height) {
  const bounds = CalculateMapBounds();
  const worldWidth = bounds.maxX - bounds.minX;
  const worldHeight = bounds.maxY - bounds.minY;
  mapCamera.fitScale = Math.min((width - 38) / worldWidth, (height - 38) / worldHeight);
  mapCamera.fitScale = Clamp(mapCamera.fitScale, 0.42, 1.55);
  mapCamera.centerX = width / 2;
  mapCamera.centerY = height / 2;
  mapCamera.worldCenterX = (bounds.minX + bounds.maxX) / 2;
  mapCamera.worldCenterY = (bounds.minY + bounds.maxY) / 2;
}

function HexToWorld(q, r) {
  const size = mapCamera.hexSize;
  return {
    x: size * Math.sqrt(3) * (Number(q) + Number(r) / 2),
    y: size * 1.5 * Number(r),
  };
}

function WorldToScreen(point) {
  const scale = mapCamera.fitScale * mapCamera.zoom;
  return {
    x: mapCamera.centerX + mapCamera.panX + (point.x - mapCamera.worldCenterX) * scale,
    y: mapCamera.centerY + mapCamera.panY + (point.y - mapCamera.worldCenterY) * scale,
  };
}

function ScreenToWorld(point) {
  const scale = mapCamera.fitScale * mapCamera.zoom;
  return {
    x: ((point.x - mapCamera.centerX - mapCamera.panX) / scale) + mapCamera.worldCenterX,
    y: ((point.y - mapCamera.centerY - mapCamera.panY) / scale) + mapCamera.worldCenterY,
  };
}

function RenderMap() {
  if (!IsDesktopViewportSupported() || !gameState) return;
  const canvasMeasure = MeasureMapCanvas();
  if (!canvasMeasure) return;
  const { width, height } = canvasMeasure;
  UpdateMapTransform(width, height);
  const activeWorld = EnsureWorld3D();
  if (activeWorld) {
    activeWorld.SetState(gameState, {
      selectedHexId,
      selectedUnitId,
      mapLayer,
      reachableHexIds: GetReachableHexIds(),
      reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
      camera: { ...mapCamera },
    });
    return;
  }
  RenderMapCanvasFallback();
}

function RenderMapCanvasFallback() {
  const canvasState = ResizeCanvas();
  if (!canvasState) return;
  const { context, width, height } = canvasState;
  UpdateMapTransform(width, height);
  context.clearRect(0, 0, width, height);
  DrawMapPaper(context, width, height);
  DrawConnections(context);
  AsArray(gameState.hexes).forEach((hex) => DrawHex(context, hex));
  DrawUnits(context);
  DrawMapLabels(context);
}

function DrawMapPaper(context, width, height) {
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#b8aa83");
  background.addColorStop(0.55, "#9b916f");
  background.addColorStop(1, "#766f58");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.save();
  context.globalAlpha = 0.07;
  context.strokeStyle = "#312f28";
  context.lineWidth = 1;
  for (let x = -height; x < width + height; x += 19) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x - height, height);
    context.stroke();
  }
  context.restore();
}

function DrawConnections(context) {
  const hexes = AsArray(gameState.hexes);
  const drawn = new Set();
  context.save();
  hexes.forEach((hex) => {
    const source = WorldToScreen(HexToWorld(hex.q, hex.r));
    const neighbors = GetNeighbors(gameState, hex.id) || [];
    neighbors.forEach((neighborRef) => {
      const neighbor = typeof neighborRef === "string" ? GetHex(gameState, neighborRef) : neighborRef;
      if (!neighbor) return;
      const key = [hex.id, neighbor.id].sort().join("|");
      if (drawn.has(key)) return;
      drawn.add(key);
      const target = WorldToScreen(HexToWorld(neighbor.q, neighbor.r));
      if (hex.rail && neighbor.rail) {
        context.strokeStyle = "#282a27";
        context.lineWidth = Math.max(2, 5 * mapCamera.fitScale * mapCamera.zoom);
        context.setLineDash([8, 5]);
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.lineTo(target.x, target.y);
        context.stroke();
        context.setLineDash([]);
        context.strokeStyle = "#b7aa80";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.lineTo(target.x, target.y);
        context.stroke();
      } else if (hex.road && neighbor.road) {
        context.strokeStyle = "rgba(74,62,43,.62)";
        context.lineWidth = Math.max(1, 2.5 * mapCamera.fitScale * mapCamera.zoom);
        context.setLineDash([4, 5]);
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.lineTo(target.x, target.y);
        context.stroke();
        context.setLineDash([]);
      }
    });
  });
  context.restore();
}

function HexPath(context, center, radius) {
  context.beginPath();
  for (let corner = 0; corner < 6; corner += 1) {
    const angle = (Math.PI / 180) * (60 * corner - 30);
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    if (corner === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function DrawHex(context, hex) {
  const center = WorldToScreen(HexToWorld(hex.q, hex.r));
  const radius = mapCamera.hexSize * mapCamera.fitScale * mapCamera.zoom * 0.96;
  const terrainStyle = terrainPalette[String(hex.terrain ?? "plain").toLowerCase()] ?? terrainPalette.plain;
  const visible = hex.visible !== false;
  context.save();
  HexPath(context, center, radius);
  context.fillStyle = visible ? terrainStyle.fill : "#3e4039";
  context.fill();
  context.strokeStyle = hex.id === selectedHexId ? "#f1d48c" : terrainStyle.line;
  context.lineWidth = hex.id === selectedHexId ? 3 : 1;
  context.stroke();

  if (visible && mapLayer === "construction" && (hex.contact || hex.institution || hex.improvement)) {
    context.globalAlpha = 0.22 + Math.min(0.38, Number(hex.contact || 0) * 0.09);
    HexPath(context, center, radius * 0.84);
    context.fillStyle = controlPalette[hex.control] ?? "#8e3028";
    context.fill();
    context.globalAlpha = 1;
  } else if (visible && hex.control && hex.control !== "neutral") {
    context.strokeStyle = controlPalette[hex.control] ?? "#5b5c4e";
    context.lineWidth = Math.max(2, radius * 0.07);
    context.setLineDash(hex.control === "occupied" ? [5, 4] : []);
    HexPath(context, center, radius * 0.88);
    context.stroke();
    context.setLineDash([]);
  }

  if (visible) DrawHexFeature(context, hex, center, radius);
  else DrawFogMark(context, center, radius);

  if (hex.warning) {
    context.strokeStyle = "#b64b3e";
    context.lineWidth = 3;
    context.setLineDash([7, 5]);
    HexPath(context, center, radius * 0.73);
    context.stroke();
    context.setLineDash([]);
  }
  context.restore();
}

function DrawHexFeature(context, hex, center, radius) {
  const scale = mapCamera.fitScale * mapCamera.zoom;
  const feature = hex.feature;
  context.textAlign = "center";
  context.textBaseline = "middle";
  if (IsFeature(hex, "Village", "Headquarters", "CountySeat", "Stronghold", "RailStation")) {
    const enemyStructure = IsFeature(hex, "CountySeat", "Stronghold", "RailStation");
    context.fillStyle = enemyStructure ? "#262927" : "#eee0b5";
    context.strokeStyle = IsFeature(hex, "Headquarters") ? "#8e3028" : "#3b382d";
    context.lineWidth = Math.max(1.2, 2 * scale);
    const width = radius * (IsFeature(hex, "CountySeat") ? 0.82 : 0.64);
    const height = radius * 0.38;
    context.fillRect(center.x - width / 2, center.y - height / 2, width, height);
    context.strokeRect(center.x - width / 2, center.y - height / 2, width, height);
    context.fillStyle = enemyStructure ? "#e4d4aa" : "#2c2b25";
    context.font = `700 ${Clamp(10 * scale, 8, 15)}px "Microsoft YaHei", sans-serif`;
    context.fillText(FeatureSymbol(feature), center.x, center.y);
  } else if (scale > 0.72) {
    context.fillStyle = "rgba(41,41,34,.48)";
    context.font = `${Clamp(10 * scale, 7, 13)}px ui-serif, serif`;
    context.fillText(
      terrainPalette[String(hex.terrain ?? "").toLowerCase()]?.mark ?? "·",
      center.x,
      center.y,
    );
  }
  if (hex.institution) {
    context.beginPath();
    context.arc(center.x + radius * 0.55, center.y - radius * 0.48, Math.max(5, radius * 0.13), 0, Math.PI * 2);
    context.fillStyle = "#8e3028";
    context.fill();
    context.fillStyle = "#f0dfb5";
    context.font = `700 ${Math.max(7, radius * 0.16)}px sans-serif`;
    context.fillText("组", center.x + radius * 0.55, center.y - radius * 0.48);
  }
  if (hex.construction) {
    const progress = Clamp(
      Number(hex.construction.progress ?? 0) / Math.max(1, Number(hex.construction.cost ?? 1)),
      0,
      1,
    );
    context.strokeStyle = "#e5d49d";
    context.lineWidth = Math.max(2, radius * 0.07);
    context.beginPath();
    context.arc(center.x, center.y + radius * 0.58, radius * 0.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    context.stroke();
  }
}

function DrawFogMark(context, center, radius) {
  context.fillStyle = "rgba(230,221,192,.3)";
  context.font = `700 ${Math.max(11, radius * 0.32)}px ui-serif, serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("未明", center.x, center.y);
}

function DrawUnits(context) {
  const scale = mapCamera.fitScale * mapCamera.zoom;
  const unitGroups = new Map();
  AsArray(gameState.units).forEach((unit) => {
    if (!unitGroups.has(unit.hexId)) unitGroups.set(unit.hexId, []);
    unitGroups.get(unit.hexId).push({ ...unit, side: "player" });
  });
  AsArray(gameState.enemies).filter((enemy) => enemy.visible !== false).forEach((enemy) => {
    if (!unitGroups.has(enemy.hexId)) unitGroups.set(enemy.hexId, []);
    unitGroups.get(enemy.hexId).push({ ...enemy, side: "enemy" });
  });
  unitGroups.forEach((units, hexId) => {
    const hex = GetHex(gameState, hexId);
    if (!hex) return;
    const center = WorldToScreen(HexToWorld(hex.q, hex.r));
    units.slice(0, 3).forEach((unit, index) => {
      const offset = (index - Math.min(2, units.length - 1) / 2) * Math.max(16, 22 * scale);
      const x = center.x + offset;
      const y = center.y + Math.max(18, 23 * scale);
      const selected = unit.side === "player" && unit.id === selectedUnitId;
      context.save();
      context.fillStyle = unit.side === "player" ? "#7f2d28" : "#272a26";
      context.strokeStyle = selected ? "#f3d581" : unit.side === "player" ? "#e0c28c" : "#9b6a4f";
      context.lineWidth = selected ? 3 : 1.5;
      context.beginPath();
      context.rect(x - 12 * scale, y - 9 * scale, 24 * scale, 18 * scale);
      context.fill();
      context.stroke();
      context.fillStyle = "#f0e3bd";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `700 ${Clamp(11 * scale, 8, 15)}px sans-serif`;
      context.fillText(unit.side === "player" ? UnitSymbol(unit.type) : "敌", x, y);
      context.restore();
    });
  });
}

function DrawMapLabels(context) {
  const scale = mapCamera.fitScale * mapCamera.zoom;
  if (scale < 0.62) return;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "top";
  AsArray(gameState.hexes).filter((hex) =>
    hex.visible !== false && IsFeature(hex, "Village", "Headquarters", "CountySeat", "Stronghold", "RailStation")
  ).forEach((hex) => {
    const center = WorldToScreen(HexToWorld(hex.q, hex.r));
    const radius = mapCamera.hexSize * scale;
    context.font = `700 ${Clamp(10 * scale, 9, 14)}px ui-serif, "Songti SC", serif`;
    context.fillStyle = "#24251f";
    context.fillText(hex.name, center.x, center.y + radius * 0.28);
  });
  context.restore();
}

function FeatureSymbol(feature) {
  return {
    village: "村",
    headquarters: "部",
    countyseat: "城",
    stronghold: "据",
    railstation: "站",
    station: "站",
    bridge: "桥",
  }[String(feature ?? "").toLowerCase()] ?? "点";
}

function UnitSymbol(type) {
  return {
    workTeam: "工",
    guerrilla: "游",
    mainForce: "八",
    militia: "民",
    courier: "交",
    workteam: "工",
    mainforce: "八",
  }[type] ?? {
    workteam: "工",
    guerrilla: "游",
    mainforce: "八",
    militia: "民",
    courier: "交",
  }[String(type ?? "").toLowerCase()] ?? "队";
}

function TerrainLabel(terrain) {
  return FindDefinition(terrainDefinitions, terrain)?.label ?? {
    mountain: "山地",
    hill: "丘陵",
    forest: "林地",
    plain: "平原",
    rivervalley: "河谷",
    village: "村落",
  }[String(terrain ?? "").toLowerCase()] ?? terrain ?? "未知地形";
}

function ControlLabel(control) {
  return {
    player: "根据地网络",
    enemy: "敌军控制",
    base: "根据地",
    network: "抗日基层网络",
    contested: "游击区",
    occupied: "敌占区",
    neutral: "联系薄弱",
  }[String(control ?? "")] ?? control ?? "联系薄弱";
}

function UnitLabel(type) {
  return FindDefinition(unitDefinitions, type)?.label ?? {
    workTeam: "地方工作队",
    guerrilla: "抗日游击队",
    mainForce: "八路军主力支队",
    militia: "村庄民兵",
    courier: "交通员",
  }[type] ?? type ?? "抗日力量";
}

function CanvasPoint(event) {
  const rect = ui.mapCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function HandleMapPointerDown(event) {
  if (!IsDesktopViewportSupported() || !gameState) return;
  if (activePointers.size > 0) return;
  ui.mapCanvas.setPointerCapture(event.pointerId);
  const point = CanvasPoint(event);
  activePointers.set(event.pointerId, point);
  pointerGesture = {
    start: point,
    previous: point,
    moved: false,
    panX: mapCamera.panX,
    panY: mapCamera.panY,
  };
}

function HandleMapPointerMove(event) {
  if (!IsDesktopViewportSupported()) return;
  if (!activePointers.has(event.pointerId) || !pointerGesture) return;
  const point = CanvasPoint(event);
  activePointers.set(event.pointerId, point);
  if (pointerGesture.previous) {
    const deltaX = point.x - pointerGesture.previous.x;
    const deltaY = point.y - pointerGesture.previous.y;
    const distance = Math.hypot(point.x - pointerGesture.start.x, point.y - pointerGesture.start.y);
    if (distance > 5) pointerGesture.moved = true;
    if (pointerGesture.moved) {
      mapCamera.panX += deltaX;
      mapCamera.panY += deltaY;
      RenderMap();
    }
    pointerGesture.previous = point;
  }
}

function HandleMapPointerUp(event) {
  if (!IsDesktopViewportSupported()) return;
  if (!activePointers.has(event.pointerId)) return;
  const point = CanvasPoint(event);
  const shouldSelect = event.type !== "pointercancel"
    && activePointers.size === 1
    && pointerGesture
    && !pointerGesture.moved;
  activePointers.delete(event.pointerId);
  if (ui.mapCanvas.hasPointerCapture(event.pointerId)) {
    ui.mapCanvas.releasePointerCapture(event.pointerId);
  }
  if (shouldSelect) {
    const hex = PickHex(point);
    if (hex) SelectHex(hex.id);
  }
  pointerGesture = null;
}

function HandleMapWheel(event) {
  if (!IsDesktopViewportSupported()) return;
  event.preventDefault();
  ChangeZoom(event.deltaY < 0 ? 1.1 : 0.9, CanvasPoint(event));
}

function PickHex(screenPoint) {
  if (world3D) {
    const pickedHex = world3D.PickHex(screenPoint.x, screenPoint.y);
    if (pickedHex) return pickedHex;
  }
  const world = ScreenToWorld(screenPoint);
  const scale = Math.max(0.001, mapCamera.fitScale * mapCamera.zoom);
  const hitRadius = Math.max(mapCamera.hexSize * 0.95, 22 / scale);
  let best = null;
  let bestDistance = Infinity;
  AsArray(gameState.hexes).forEach((hex) => {
    const center = HexToWorld(hex.q, hex.r);
    const distance = Math.hypot(world.x - center.x, world.y - center.y);
    if (distance < hitRadius && distance < bestDistance) {
      best = hex;
      bestDistance = distance;
    }
  });
  return best;
}

Boot();
