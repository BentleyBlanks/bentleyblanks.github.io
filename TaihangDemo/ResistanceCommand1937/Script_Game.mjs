import {
  actionDefinitions,
  CalculateOutcome,
  CalculateProductionForecast,
  chapterDefinitions,
  ChooseCrisisResponse,
  ClearPlan,
  CreateInitialState,
  DeserializeState,
  focusDefinitions,
  gameConfig,
  GetActionAvailability,
  GetChapter,
  GetConnectedRegionIds,
  GetCrisisChoiceCost,
  GetEnemyIntentPreview,
  GetFocusAvailability,
  GetNetworkSummary,
  GetPlanningSummary,
  GetRegion,
  GetRegionDefinition,
  productionDefinitions,
  QueueAction,
  regionDefinitions,
  RemovePlannedAction,
  ResolveTurn,
  SerializeState,
  SetFocus,
  SetProductionPriority,
  SetStance,
  stanceDefinitions,
  ValidateState,
} from "./Script_Rules.mjs";

let gameState = null;
let lastFocusedElement = null;
let isResolving = false;
let toastTimer = null;
let standardModalCloseHandler = null;

const resourceLabels = Object.freeze({
  grain: "粮药",
  arms: "军械",
  organization: "组织",
  intelligence: "情报",
});

const metricHelp = Object.freeze({
  peopleSafety: {
    title: "人民安全",
    body: "反映群众的生计、疏散、救治与承受能力。它不是可以拿去交换战果的资源；降到零，本战区战略任务即告失败。",
  },
  contribution: {
    title: "敌后贡献",
    body: "由基层组织、交通破袭、游击迟滞和战略牵制共同形成。它会削弱侵华日军运输、钉住兵力，并减轻全国正面战场压力。",
  },
  resilience: {
    title: "抗战韧性",
    body: "组织、交通、生产与武装骨干长期坚持的综合能力。只追求一次行动、忽视网络与民生，会让韧性迅速耗尽。",
  },
});

const resourceHelp = Object.freeze({
  grain: {
    title: "粮药",
    body: "疏散群众、救济受创地区、坚壁种粮和维持武装都需要粮药。生产配置与联网根据地会在每期结算时补充它。",
  },
  arms: {
    title: "军械",
    body: "敌后军械极其有限，破袭与伏击都会消耗。把全部生产投入军械会挤压民生储备。",
  },
  organization: {
    title: "组织力",
    body: "代表干部、交通员、地方武装骨干和基层组织能够承担的工作。联网地区越多，恢复越稳定。",
  },
  intelligence: {
    title: "情报",
    body: "决定能否看清敌军集结方向，也支撑破袭、侦察与安全转移。低情报时地图只会显示可能目标。",
  },
});

function Element(elementId) {
  return document.getElementById(elementId);
}

function EscapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function FormatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("zh-CN");
}

function SetText(elementId, value) {
  const element = Element(elementId);
  if (element) element.textContent = String(value);
}

function SetMeter(elementId, value, maximum = 100) {
  const element = Element(elementId);
  if (!element) return;
  const percent = Math.max(0, Math.min(100, Number(value) / maximum * 100));
  element.style.width = `${percent}%`;
}

function CloneForInspection(value) {
  return JSON.parse(JSON.stringify(value));
}

function Toast(message, tone = "normal") {
  const region = Element("toastRegion");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast${tone === "error" ? " error" : ""}`;
  toast.textContent = message;
  region.replaceChildren(toast);
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (region.contains(toast)) region.replaceChildren();
  }, 2600);
}

function Announce(message) {
  const liveRegion = Element("liveRegion");
  if (!liveRegion) return;
  liveRegion.textContent = "";
  window.setTimeout(() => { liveRegion.textContent = message; }, 20);
}

function SetBackgroundModalState(active) {
  document.body.classList.toggle("modalOpen", active);
  Element("openingScreen").inert = active;
  Element("gameShell").inert = active;
}

function GetActiveModal() {
  return [Element("standardModal"), Element("resolutionModal"), Element("outcomeModal")]
    .find((modal) => modal && !modal.hidden) || null;
}

function GetFocusableElements(container) {
  return [...container.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
}

function TrapModalFocus(event) {
  const modal = GetActiveModal();
  if (!modal) return;
  const focusable = GetFocusableElements(modal);
  if (!focusable.length) {
    event.preventDefault();
    modal.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!modal.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function SaveSerialized(key, serialized) {
  try {
    window.localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    return false;
  }
}

function LoadSerialized(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function RemoveSavedKey(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    // The campaign remains playable without storage.
  }
}

function SaveCampaign() {
  if (!gameState) return false;
  try {
    return SaveSerialized(gameConfig.saveKey, SerializeState(gameState));
  } catch (error) {
    return false;
  }
}

function SaveCheckpoint() {
  if (!gameState) return false;
  try {
    return SaveSerialized(gameConfig.checkpointKey, SerializeState(gameState));
  } catch (error) {
    return false;
  }
}

function LoadCampaignFromKey(key) {
  const serialized = LoadSerialized(key);
  if (!serialized) return null;
  try {
    return DeserializeState(serialized);
  } catch (error) {
    return null;
  }
}

function HasValidSave() {
  return Boolean(LoadCampaignFromKey(gameConfig.saveKey));
}

function RefreshContinueButton() {
  Element("continueButton").hidden = !HasValidSave();
}

function ShowGameShell() {
  Element("openingScreen").hidden = true;
  Element("gameShell").hidden = false;
  document.body.classList.add("gameActive");
}

function ShowOpeningScreen() {
  HideAllModals(false);
  Element("gameShell").hidden = true;
  Element("openingScreen").hidden = false;
  document.body.classList.remove("gameActive");
  RefreshContinueButton();
  Element("startButton").focus();
}

function StartNewCampaign() {
  const seed = Math.trunc(Date.now() % 2147483647);
  gameState = CreateInitialState(seed);
  RemoveSavedKey(gameConfig.checkpointKey);
  SaveCampaign();
  ShowGameShell();
  RenderAll();
  ShowCommanderBrief();
}

function ContinueCampaign() {
  const loadedState = LoadCampaignFromKey(gameConfig.saveKey);
  if (!loadedState) {
    Toast("存档无法读取，已安全保留页面并可开始新战局。", "error");
    RefreshContinueButton();
    return;
  }
  gameState = loadedState;
  ShowGameShell();
  RenderAll();
  if (gameState.status === "completed") ShowOutcome();
  else if (gameState.status === "failed" && gameState.lastReport) ShowResolution(gameState.lastReport);
}

function RetryTurn() {
  const checkpoint = LoadCampaignFromKey(gameConfig.checkpointKey);
  if (!checkpoint) {
    Toast("本期检查点不可用，请重新推演。", "error");
    ConfirmRestart();
    return;
  }
  gameState = checkpoint;
  isResolving = false;
  SaveCampaign();
  HideAllModals(false);
  RenderAll();
  Announce(`已回到${GetChapter(gameState).period}部署开始。`);
}

function FormatCost(cost) {
  const parts = [];
  for (const [resourceId, amount] of Object.entries(cost)) {
    if (amount > 0) parts.push(`${resourceLabels[resourceId]} ${amount}`);
  }
  return parts.length ? parts.join(" · ") : "不耗资源";
}

function RenderHeader() {
  const chapter = GetChapter(gameState);
  SetText("chapterPeriod", chapter.period);
  SetText("chapterDate", chapter.date);
  SetText("turnCounter", `第 ${Math.min(gameState.turn + 1, gameState.maxTurns)} / ${gameState.maxTurns} 阶段`);
  SetText("grainValue", FormatNumber(gameState.resources.grain));
  SetText("armsValue", FormatNumber(gameState.resources.arms));
  SetText("organizationValue", FormatNumber(gameState.resources.organization));
  SetText("intelligenceValue", FormatNumber(gameState.resources.intelligence));
  SetText("peopleSafetyValue", FormatNumber(gameState.national.peopleSafety));
  SetText("contributionValue", FormatNumber(gameState.national.contribution));
  SetText("resilienceValue", FormatNumber(gameState.national.resilience));
  SetMeter("peopleSafetyMeter", gameState.national.peopleSafety);
  SetMeter("contributionMeter", gameState.national.contribution);
  SetMeter("resilienceMeter", gameState.national.resilience);
  SetText("frontIntegrityValue", FormatNumber(gameState.national.frontIntegrity));
  SetText("japaneseLogisticsValue", FormatNumber(gameState.national.japaneseLogistics));
  SetText("pinnedDivisionsValue", FormatNumber(gameState.national.pinnedDivisions));
}

function RenderEnemyBrief() {
  const preview = GetEnemyIntentPreview(gameState);
  const confidenceLabels = { high: "情报确证", medium: "部分确证", low: "线索零散" };
  SetText("intelConfidence", confidenceLabels[preview.confidence]);
  SetText("enemyIntentKind", preview.kind);
  SetText("enemyIntensity", `压力 ${preview.intensity}`);
  SetText("enemyIntentSummary", preview.summary);
  const targetList = Element("enemyTargetList");
  targetList.replaceChildren();
  for (const regionId of preview.confirmedTargetIds) {
    const tag = document.createElement("span");
    tag.className = "targetTag confirmed";
    tag.textContent = `已确认 · ${GetRegionDefinition(regionId).shortName}`;
    targetList.append(tag);
  }
  for (const regionId of preview.possibleTargetIds) {
    const tag = document.createElement("span");
    tag.className = "targetTag";
    tag.textContent = `可能 · ${GetRegionDefinition(regionId).shortName}`;
    targetList.append(tag);
  }
}

function RenderFocusBrief() {
  const focus = focusDefinitions.find((entry) => entry.id === gameState.activeFocusId) || null;
  if (!focus) {
    SetText("focusName", "等待选择方针");
    SetText("focusBranch", `${gameState.completedFocusIds.length} 项已完成`);
    SetText("focusDescription", "选择下一项组织、保存、牵制或生产方针。");
    SetText("focusProgressLabel", "—");
    SetMeter("focusProgressMeter", 0);
    return;
  }
  SetText("focusName", focus.name);
  SetText("focusBranch", focus.branch);
  SetText("focusDescription", focus.description);
  SetText("focusProgressLabel", `${gameState.focusProgress} / ${focus.duration}`);
  SetMeter("focusProgressMeter", gameState.focusProgress, focus.duration);
}

function RenderCrisisChoices() {
  const chapter = GetChapter(gameState);
  const container = Element("crisisChoices");
  container.replaceChildren();
  for (const choice of chapter.choices) {
    const button = document.createElement("button");
    const active = gameState.crisisChoiceId === choice.id;
    button.type = "button";
    button.className = `crisisChoice${active ? " isActive" : ""}`;
    button.dataset.tone = choice.tone;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", active ? "true" : "false");
    const choiceCost = GetCrisisChoiceCost(choice.id);
    button.innerHTML = `<b>${EscapeHtml(choice.name)}</b><span>${EscapeHtml(choice.effect)}</span><small>本期代价：${EscapeHtml(FormatCost(choiceCost))}</small>`;
    button.addEventListener("click", () => {
      gameState = ChooseCrisisResponse(gameState, choice.id);
      SaveCampaign();
      RenderAll();
      Toast(gameState.lastCommand.message);
    });
    container.append(button);
  }
}

function RenderStanceOptions() {
  const container = Element("stanceOptions");
  container.replaceChildren();
  for (const stance of stanceDefinitions) {
    const button = document.createElement("button");
    const active = gameState.stanceId === stance.id;
    button.type = "button";
    button.className = `compactOption${active ? " isActive" : ""}`;
    button.innerHTML = `<b>${EscapeHtml(stance.name)}</b>`;
    button.title = stance.description;
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.addEventListener("click", () => {
      gameState = SetStance(gameState, stance.id);
      SaveCampaign();
      RenderAll();
      Toast(gameState.lastCommand.message);
    });
    container.append(button);
  }
}

function RenderProductionOptions() {
  const container = Element("productionOptions");
  container.replaceChildren();
  for (const production of productionDefinitions) {
    const button = document.createElement("button");
    const active = gameState.productionId === production.id;
    button.type = "button";
    button.className = `compactOption${active ? " isActive" : ""}`;
    button.innerHTML = `<b>${EscapeHtml(production.name)}</b>${EscapeHtml(production.allocation)}`;
    button.title = production.description;
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.addEventListener("click", () => {
      gameState = SetProductionPriority(gameState, production.id);
      SaveCampaign();
      RenderAll();
      Toast(gameState.lastCommand.message);
    });
    container.append(button);
  }
  const forecast = CalculateProductionForecast(gameState);
  SetText("productionForecast", `净粮药 ${forecast.net.grain >= 0 ? "+" : ""}${forecast.net.grain}`);
  SetText(
    "productionDetail",
    `本期预计：粮药 ${forecast.net.grain >= 0 ? "+" : ""}${forecast.net.grain}（含维持 -${forecast.upkeep}） · 军械 +${forecast.net.arms} · 组织 +${forecast.net.organization} · 情报 +${forecast.net.intelligence}`,
  );
}

function RenderBriefing() {
  const chapter = GetChapter(gameState);
  SetText("chapterProgress", `${String(Math.min(gameState.turn + 1, 8)).padStart(2, "0")} / 08`);
  SetText("chapterTitle", chapter.title);
  SetText("chapterSubtitle", chapter.subtitle);
  RenderEnemyBrief();
  RenderFocusBrief();
  RenderCrisisChoices();
  RenderStanceOptions();
  RenderProductionOptions();
}

function EnsureRegionNodes() {
  const layer = Element("regionLayer");
  if (layer.childElementCount === regionDefinitions.length) return;
  layer.replaceChildren();
  for (const definition of regionDefinitions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "regionNode";
    button.dataset.regionId = definition.id;
    button.style.setProperty("--x", `${definition.x}%`);
    button.style.setProperty("--y", `${definition.y}%`);
    button.addEventListener("click", () => SelectRegion(definition.id, true));
    layer.append(button);
  }
}

function NetworkColor(network) {
  return ["#797562", "#9c5949", "#b64a3c", "#c73f33", "#dc3226"][Math.max(0, Math.min(4, network))];
}

function RenderRegionNodes() {
  EnsureRegionNodes();
  const preview = GetEnemyIntentPreview(gameState);
  const connectedIds = new Set(GetConnectedRegionIds(gameState));
  const confirmedIds = new Set(preview.confirmedTargetIds);
  const possibleIds = new Set(preview.possibleTargetIds);
  for (const button of Element("regionLayer").querySelectorAll(".regionNode")) {
    const regionId = button.dataset.regionId;
    const definition = GetRegionDefinition(regionId);
    const region = GetRegion(gameState, regionId);
    button.classList.toggle("isSelected", gameState.selectedRegionId === regionId);
    button.classList.toggle("isDisconnected", !connectedIds.has(regionId));
    button.classList.toggle("isThreatened", confirmedIds.has(regionId));
    button.classList.toggle("isPossible", !confirmedIds.has(regionId) && possibleIds.has(regionId));
    button.style.setProperty("--networkColor", NetworkColor(region.network));
    const pips = Array.from({ length: 4 }, (_, index) => `<i class="${index < region.network ? "on" : ""}"></i>`).join("");
    button.innerHTML = `
      <b>${EscapeHtml(definition.shortName)}</b>
      <small><span>网 ${region.network}/4</span><span>敌压 ${Math.round(region.pressure)}</span></small>
      <span class="networkPips" aria-hidden="true">${pips}</span>`;
    const threatText = confirmedIds.has(regionId) ? "，已确认敌军来袭" : possibleIds.has(regionId) ? "，可能受袭" : "";
    button.setAttribute("aria-label", `${definition.name}，基层网络${region.network}级，敌军压力${Math.round(region.pressure)}${threatText}`);
  }
}

function DrawArrow(context, startX, startY, endX, endY, color, dashed) {
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = 10;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = dashed ? 1.5 : 2.4;
  context.setLineDash(dashed ? [6, 6] : []);
  context.beginPath();
  context.moveTo(startX, startY);
  context.quadraticCurveTo((startX + endX) / 2 + 20, (startY + endY) / 2 - 18, endX, endY);
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
  context.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
  context.restore();
}

function DrawStrategyMap() {
  const canvas = Element("strategyCanvas");
  const viewport = Element("mapViewport");
  if (!canvas || !viewport) return;
  const bounds = viewport.getBoundingClientRect();
  if (bounds.width < 2 || bounds.height < 2) return;
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(bounds.width);
  const height = Math.round(bounds.height);
  const backingWidth = Math.round(width * pixelRatio);
  const backingHeight = Math.round(height * pixelRatio);
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const Position = (regionId) => {
    const definition = GetRegionDefinition(regionId);
    return { x: definition.x / 100 * width, y: definition.y / 100 * height };
  };

  context.save();
  context.globalAlpha = .2;
  context.strokeStyle = "#454737";
  context.lineWidth = 1;
  for (let index = 0; index < 8; index += 1) {
    context.beginPath();
    const yBase = height * (.12 + index * .1);
    context.moveTo(width * .04, yBase);
    context.bezierCurveTo(width * .28, yBase - 22, width * .53, yBase + 26, width * .96, yBase - 5);
    context.stroke();
  }
  context.restore();

  context.save();
  context.strokeStyle = "rgba(72, 100, 100, .6)";
  context.lineWidth = Math.max(4, width * .008);
  context.beginPath();
  context.moveTo(width * .43, -10);
  context.bezierCurveTo(width * .38, height * .2, width * .48, height * .39, width * .42, height * .59);
  context.bezierCurveTo(width * .38, height * .74, width * .49, height * .86, width * .47, height + 10);
  context.stroke();
  context.restore();

  const drawnRailLinks = new Set();
  context.save();
  context.strokeStyle = "rgba(92, 71, 35, .76)";
  context.lineWidth = 2.2;
  context.setLineDash([7, 3, 2, 3]);
  for (const definition of regionDefinitions) {
    if (!definition.rail) continue;
    for (const linkedId of definition.links) {
      const linkedDefinition = GetRegionDefinition(linkedId);
      if (!linkedDefinition?.rail) continue;
      const linkKey = [definition.id, linkedId].sort().join(":");
      if (drawnRailLinks.has(linkKey)) continue;
      drawnRailLinks.add(linkKey);
      const start = Position(definition.id);
      const end = Position(linkedId);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
  }
  context.restore();

  const connectedIds = new Set(GetConnectedRegionIds(gameState));
  const drawnNetworkLinks = new Set();
  for (const definition of regionDefinitions) {
    for (const linkedId of definition.links) {
      const linkKey = [definition.id, linkedId].sort().join(":");
      if (drawnNetworkLinks.has(linkKey)) continue;
      drawnNetworkLinks.add(linkKey);
      const leftRegion = gameState.regions[definition.id];
      const rightRegion = gameState.regions[linkedId];
      if (leftRegion.network <= 0 || rightRegion.network <= 0) continue;
      const start = Position(definition.id);
      const end = Position(linkedId);
      const bothConnected = connectedIds.has(definition.id) && connectedIds.has(linkedId);
      context.save();
      context.strokeStyle = bothConnected ? "rgba(158, 48, 38, .76)" : "rgba(113, 68, 58, .44)";
      context.lineWidth = 1 + Math.min(leftRegion.network, rightRegion.network) * .65;
      context.setLineDash(bothConnected ? [] : [4, 6]);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
      context.restore();
    }
  }

  const preview = GetEnemyIntentPreview(gameState);
  const threatOrigin = { x: width * .96, y: height * .19 };
  preview.confirmedTargetIds.forEach((regionId, index) => {
    const target = Position(regionId);
    DrawArrow(context, threatOrigin.x - index * 8, threatOrigin.y + index * 13, target.x + 26, target.y - 24, "rgba(157, 52, 40, .86)", false);
  });
  preview.possibleTargetIds.forEach((regionId, index) => {
    const target = Position(regionId);
    DrawArrow(context, threatOrigin.x, threatOrigin.y + 22 + index * 8, target.x + 18, target.y - 16, "rgba(109, 69, 48, .62)", true);
  });
}

function RenderMap() {
  RenderRegionNodes();
  DrawStrategyMap();
  const selectedDefinition = GetRegionDefinition(gameState.selectedRegionId);
  const inspectorDirection = window.matchMedia("(max-width: 1080px)").matches ? "下方" : "右侧";
  SetText("mapStatusText", `已选：${selectedDefinition.name}。查看${inspectorDirection}命令面板，或继续点选其他战略区。`);
}

function SelectRegion(regionId, userInitiated = false) {
  if (!GetRegion(gameState, regionId)) return;
  gameState.selectedRegionId = regionId;
  SaveCampaign();
  RenderMap();
  RenderInspector();
  if (userInitiated && window.matchMedia("(max-width: 1080px)").matches) {
    window.setTimeout(() => Element("inspectorPanel").scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }
}

function RenderInspector() {
  const regionId = gameState.selectedRegionId;
  const region = GetRegion(gameState, regionId);
  const definition = GetRegionDefinition(regionId);
  const connectedIds = new Set(GetConnectedRegionIds(gameState));
  const connected = connectedIds.has(regionId);
  SetText("regionTheatre", `${definition.theatre} · ${definition.terrain}`);
  SetText("regionName", definition.name);
  SetText("regionTrait", definition.trait);
  SetText("regionNetworkValue", `${region.network} / 4`);
  SetText("regionSupportValue", FormatNumber(region.support));
  SetText("regionPressureValue", FormatNumber(region.pressure));
  SetText("regionExposureValue", FormatNumber(region.exposure));
  SetText("regionDamageValue", FormatNumber(region.damage));
  SetMeter("regionNetworkMeter", region.network, 4);
  SetMeter("regionSupportMeter", region.support);
  SetMeter("regionPressureMeter", region.pressure);
  SetMeter("regionExposureMeter", region.exposure);
  SetMeter("regionDamageMeter", region.damage);
  const connectionTag = Element("regionConnectionTag");
  connectionTag.textContent = connected ? "交通网连通" : "与后方断联";
  connectionTag.classList.toggle("offline", !connected);

  const tags = Element("regionTags");
  tags.replaceChildren();
  const tagValues = [
    { text: `根据地 ${region.baseLevel} 级`, prepared: false },
    { text: definition.rail ? "邻接敌军交通干线" : "战略后方", prepared: false },
    ...(region.prepared.evacuation > 0 ? [{ text: `疏散预案 ${region.prepared.evacuation} 期`, prepared: true }] : []),
    ...(region.prepared.grain > 0 ? [{ text: `粮食坚壁 ${region.prepared.grain} 期`, prepared: true }] : []),
    ...(region.prepared.recon > 0 ? [{ text: `侦察确认 ${region.prepared.recon} 期`, prepared: true }] : []),
  ];
  for (const tagValue of tagValues) {
    const tag = document.createElement("span");
    tag.className = `regionTag${tagValue.prepared ? " prepared" : ""}`;
    tag.textContent = tagValue.text;
    tags.append(tag);
  }

  const preview = GetEnemyIntentPreview(gameState);
  const threat = Element("threatForecast");
  const confirmed = preview.confirmedTargetIds.includes(regionId);
  const possible = preview.possibleTargetIds.includes(regionId);
  threat.classList.toggle("confirmed", confirmed);
  if (confirmed) {
    threat.innerHTML = `<b>已确认：敌军将向本区行动。</b><br>先疏散、侦察、坚壁或迟滞，能直接改变结算代价。`;
  } else if (possible) {
    threat.innerHTML = `<b>情报疑点：本区可能受袭。</b><br>侦察可核实方向；低情报意味着无法把所有地区都提前准备好。`;
  } else {
    threat.innerHTML = `<b>本期未见明确集结。</b><br>这是发展组织、恢复生产或隐蔽降暴露的窗口。`;
  }

  const actionList = Element("actionList");
  actionList.replaceChildren();
  for (const action of actionDefinitions) {
    const availability = GetActionAvailability(gameState, action.id, regionId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "actionCard";
    button.dataset.category = action.category;
    button.disabled = !availability.available;
    button.dataset.disabledReason = availability.available ? "" : availability.reason;
    button.title = `${action.description} 风险：${action.risk}`;
    button.innerHTML = `
      <b>${EscapeHtml(action.name)}</b>
      <span class="actionCommand">${action.command} 令</span>
      <span class="actionDescription">${EscapeHtml(action.description)}</span>
      <span class="actionCost">${EscapeHtml(FormatCost(action.cost))}</span>`;
    button.addEventListener("click", () => QueueRegionAction(action.id, regionId));
    actionList.append(button);
  }
}

function QueueRegionAction(actionId, regionId) {
  gameState = QueueAction(gameState, actionId, regionId);
  if (!gameState.lastCommand.success) Toast(gameState.lastCommand.message, "error");
  else Toast(gameState.lastCommand.message);
  SaveCampaign();
  RenderAll();
}

function RenderPlan() {
  const summary = GetPlanningSummary(gameState);
  SetText("commandBudgetValue", `${summary.commandRemaining} / ${gameState.commandBudget}`);
  const pips = Element("commandPips");
  pips.replaceChildren();
  for (let index = 0; index < gameState.commandBudget; index += 1) {
    const pip = document.createElement("i");
    pip.className = index < summary.commandUsed ? "spent" : "";
    pips.append(pip);
  }
  const planList = Element("planList");
  planList.replaceChildren();
  if (!gameState.plans.length) {
    const empty = document.createElement("p");
    empty.className = "emptyPlan";
    empty.innerHTML = "<b>本期尚无部署</b><span>先点地图战略区，再把行动加入计划；执行前均可撤回。</span>";
    planList.append(empty);
  } else {
    for (const planEntry of gameState.plans) {
      const action = actionDefinitions.find((entry) => entry.id === planEntry.actionId);
      const regionDefinition = GetRegionDefinition(planEntry.regionId);
      const card = document.createElement("article");
      card.className = "planCard";
      card.innerHTML = `
        <b>${EscapeHtml(regionDefinition.shortName)} · ${EscapeHtml(action.shortName)}</b>
        <span>${action.command} 令 · ${EscapeHtml(FormatCost(action.cost))}</span>`;
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "removePlanButton";
      removeButton.setAttribute("aria-label", `撤回${regionDefinition.shortName}的${action.name}`);
      removeButton.textContent = "×";
      removeButton.addEventListener("click", () => {
        gameState = RemovePlannedAction(gameState, planEntry.id);
        SaveCampaign();
        RenderAll();
        Toast(gameState.lastCommand.message);
      });
      card.append(removeButton);
      planList.append(card);
    }
  }
  Element("clearPlanButton").disabled = gameState.plans.length === 0;
  const executeButton = Element("executeTurnButton");
  executeButton.disabled = gameState.status !== "active" || !gameState.crisisChoiceId || isResolving;
  if (!gameState.crisisChoiceId) executeButton.innerHTML = "先选战略抉择";
  else if (isResolving) executeButton.innerHTML = "正在结算…";
  else executeButton.innerHTML = "执行本期 <kbd>Enter</kbd>";
}

function RenderAll() {
  if (!gameState) return;
  RenderHeader();
  RenderBriefing();
  RenderMap();
  RenderInspector();
  RenderPlan();
}

function ExecuteTurn() {
  if (!gameState || gameState.status !== "active" || isResolving) return;
  if (!gameState.crisisChoiceId) {
    Toast("先选择本期战略抉择。", "error");
    Element("crisisChoices").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  isResolving = true;
  SaveCheckpoint();
  RenderPlan();
  window.setTimeout(() => {
    const resolvedState = ResolveTurn(gameState);
    if (!resolvedState.lastCommand.success) {
      gameState = resolvedState;
      isResolving = false;
      RenderAll();
      Toast(gameState.lastCommand.message, "error");
      return;
    }
    gameState = resolvedState;
    isResolving = false;
    SaveCampaign();
    RenderAll();
    ShowResolution(gameState.lastReport);
    Announce(`${gameState.lastReport.period}结算完成。`);
  }, 220);
}

function DeltaMarkup(label, value) {
  const numericValue = Number(value) || 0;
  const tone = numericValue > 0 ? "positive" : numericValue < 0 ? "negative" : "";
  const sign = numericValue > 0 ? "+" : "";
  return `<article class="deltaCard"><span>${EscapeHtml(label)}</span><b class="${tone}">${sign}${EscapeHtml(FormatNumber(numericValue))}</b></article>`;
}

function ShowResolution(report) {
  if (!report) return;
  lastFocusedElement = document.activeElement;
  standardModalCloseHandler = null;
  SetBackgroundModalState(true);
  Element("modalBackdrop").hidden = false;
  Element("standardModal").hidden = true;
  Element("outcomeModal").hidden = true;
  const modal = Element("resolutionModal");
  modal.hidden = false;
  SetText("resolutionTitle", `${report.title} · 本期战报`);
  SetText("resolutionPeriod", report.period);
  Element("resolutionSummary").innerHTML = [
    DeltaMarkup("人民安全", report.nationalDelta.peopleSafety),
    DeltaMarkup("敌后贡献", report.nationalDelta.contribution),
    DeltaMarkup("抗战韧性", report.nationalDelta.resilience),
    DeltaMarkup("敌运输效率", report.nationalDelta.japaneseLogistics),
  ].join("");

  const actionList = Element("actionReportList");
  actionList.replaceChildren();
  if (!report.actionReports.length) {
    const item = document.createElement("div");
    item.className = "reportItem cost";
    item.innerHTML = "<b>本期没有地区命令</b>占领体系在无人干预时继续扩张。";
    actionList.append(item);
  } else {
    for (const actionReport of report.actionReports) {
      const item = document.createElement("div");
      item.className = `reportItem ${actionReport.tone}`;
      item.innerHTML = `<b>${EscapeHtml(actionReport.regionName)} · ${EscapeHtml(actionReport.actionName)}</b>${EscapeHtml(actionReport.outcome)}`;
      actionList.append(item);
    }
  }

  const enemyList = Element("enemyReportList");
  enemyList.replaceChildren();
  for (const enemyReport of report.enemyReports) {
    const prepared = [
      enemyReport.prepared.evacuated ? "已疏散" : null,
      enemyReport.prepared.grainSecured ? "已坚壁" : null,
      enemyReport.prepared.recon ? "有预警" : null,
      enemyReport.prepared.delayed ? "受迟滞" : null,
    ].filter(Boolean).join(" · ");
    const item = document.createElement("div");
    item.className = `reportItem ${enemyReport.tone}`;
    item.innerHTML = `<b>${EscapeHtml(enemyReport.regionName)} · ${EscapeHtml(enemyReport.result)}</b>${EscapeHtml(enemyReport.detail)}${prepared ? `<br><span>${EscapeHtml(prepared)}</span>` : ""}`;
    enemyList.append(item);
  }

  const cost = report.costLedger || report.enemyReports.reduce((sum, enemyReport) => ({
    familiesHarmed: sum.familiesHarmed + enemyReport.harmedFamilies,
    familiesDisplaced: sum.familiesDisplaced + enemyReport.displacedFamilies,
    grainSeized: sum.grainSeized + enemyReport.grainLoss,
    cadresLost: sum.cadresLost + enemyReport.organizationLoss,
  }), { familiesHarmed: 0, familiesDisplaced: 0, grainSeized: 0, cadresLost: 0 });
  Element("costReportList").innerHTML = `
    <div class="costMetric"><span>受难家庭</span><b>${FormatNumber(cost.familiesHarmed || 0)} 户</b></div>
    <div class="costMetric"><span>被迫转移</span><b>${FormatNumber(cost.familiesDisplaced || 0)} 户</b></div>
    <div class="costMetric"><span>粮食被夺</span><b>${FormatNumber(cost.grainSeized || 0)}</b></div>
    <div class="costMetric"><span>骨干损失</span><b>${FormatNumber(cost.cadresLost || 0)}</b></div>
    <p class="costNote">这些数字只记录侵略与战争造成的代价，不提供奖励。侵略军对扫荡中的平民暴行负全部责任。</p>`;

  const systemList = Element("systemReportList");
  systemList.replaceChildren();
  const reportLines = [
    ...report.choiceReports,
    report.production ? `战时生产（${report.production.name}）：粮药 ${report.production.grain >= 0 ? "+" : ""}${report.production.grain}、军械 +${report.production.arms}、组织 +${report.production.organization}、情报 +${report.production.intelligence}。` : null,
    report.focusCompleted ? `敌后长期方针完成：${report.focusCompleted.name}——${report.focusCompleted.description}` : null,
    ...report.systemReports,
  ].filter(Boolean);
  for (const line of reportLines) {
    const item = document.createElement("div");
    item.className = "systemReport";
    item.textContent = line;
    systemList.append(item);
  }

  const continueButton = Element("resolutionContinueButton");
  if (gameState.status === "failed") {
    SetText("resolutionLesson", report.failureReason || "本战区任务失败。可以重试本期，历史不会被改写为侵略胜利。 ");
    continueButton.textContent = "重试本期部署";
  } else if (gameState.status === "completed") {
    SetText("resolutionLesson", "1945年8月15日，日本宣布无条件投降。查看八年敌后战略总评。 ");
    continueButton.textContent = "查看抗战总评";
  } else {
    const nextChapter = GetChapter(gameState);
    SetText("resolutionLesson", `下一阶段：${nextChapter.period}「${nextChapter.title}」。前一期的受创、网络与准备都会继续影响战局。`);
    continueButton.textContent = `进入 ${nextChapter.period}`;
  }
  modal.focus();
}

function ContinueAfterResolution() {
  if (gameState.status === "failed") {
    RetryTurn();
    return;
  }
  if (gameState.status === "completed") {
    ShowOutcome();
    return;
  }
  HideAllModals(false);
  RenderAll();
  Element("mapPanel").focus?.();
}

function ShowOutcome() {
  const outcome = CalculateOutcome(gameState);
  standardModalCloseHandler = null;
  SetBackgroundModalState(true);
  Element("modalBackdrop").hidden = false;
  Element("standardModal").hidden = true;
  Element("resolutionModal").hidden = true;
  const modal = Element("outcomeModal");
  modal.hidden = false;
  SetText("outcomeGrade", outcome.grade);
  SetText("outcomeTitle", outcome.title);
  SetText("outcomeSummary", outcome.summary);
  const evidence = Element("outcomeEvidence");
  evidence.replaceChildren();
  for (const item of outcome.evidence) {
    const card = document.createElement("article");
    card.className = "evidenceCard";
    card.innerHTML = `<span>${EscapeHtml(item.name)}</span><b>${FormatNumber(item.value)}</b><small>${EscapeHtml(item.detail)}</small>`;
    evidence.append(card);
  }
  const networkSummary = GetNetworkSummary(gameState);
  Element("outcomeLedger").innerHTML = `
    <span>综合评分 <b>${outcome.score}</b></span>
    <span>保护家庭 <b>${FormatNumber(gameState.stats.familiesProtected)}</b> 户</span>
    <span>受难家庭 <b>${FormatNumber(gameState.stats.familiesHarmed)}</b> 户</span>
    <span>被迫转移 <b>${FormatNumber(gameState.stats.familiesDisplaced)}</b> 户</span>
    <span>粮食被夺 <b>${FormatNumber(gameState.stats.grainSeized)}</b></span>
    <span>骨干损失 <b>${FormatNumber(gameState.stats.cadresLost)}</b></span>
    <span>破袭交通 <b>${FormatNumber(gameState.stats.railDisruptions)}</b> 次</span>
    <span>联网地区 <b>${networkSummary.connectedCount}</b> / 8</span>`;
  modal.focus();
}

function HideAllModals(restoreFocus = true) {
  standardModalCloseHandler = null;
  Element("standardModal").hidden = true;
  Element("resolutionModal").hidden = true;
  Element("outcomeModal").hidden = true;
  Element("modalBackdrop").hidden = true;
  SetBackgroundModalState(false);
  if (restoreFocus && lastFocusedElement instanceof HTMLElement && lastFocusedElement.isConnected && !lastFocusedElement.closest("[hidden]")) {
    lastFocusedElement.focus();
  } else if (restoreFocus && gameState && !Element("gameShell").hidden) {
    Element("focusButton").focus();
  }
}

function CloseStandardModal() {
  const closeHandler = standardModalCloseHandler;
  standardModalCloseHandler = null;
  if (closeHandler) closeHandler();
  else HideAllModals();
}

function OpenStandardModal({ eyebrow = "战役手册", title, body, buttons = [], closeable = true, onClose = null }) {
  lastFocusedElement = document.activeElement;
  standardModalCloseHandler = onClose;
  SetBackgroundModalState(true);
  Element("modalBackdrop").hidden = false;
  Element("resolutionModal").hidden = true;
  Element("outcomeModal").hidden = true;
  const modal = Element("standardModal");
  modal.hidden = false;
  modal.querySelector(".modalCloseButton").hidden = !closeable;
  SetText("modalEyebrow", eyebrow);
  SetText("modalTitle", title);
  Element("modalBody").innerHTML = body;
  const footer = Element("modalFooter");
  footer.replaceChildren();
  const buttonDefinitions = buttons.length ? buttons : [{ label: "知道了", primary: true, onClick: CloseStandardModal }];
  for (const buttonDefinition of buttonDefinitions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = buttonDefinition.primary ? "primaryButton" : "secondaryButton";
    button.textContent = buttonDefinition.label;
    button.addEventListener("click", buttonDefinition.onClick);
    footer.append(button);
  }
  window.setTimeout(() => modal.focus(), 0);
}

function ShowCommanderBrief() {
  OpenStandardModal({
    eyebrow: "战役简报 · 约15分钟",
    title: "不是涂色，而是在占领体系内部坚持",
    body: `
      <p>每个历史阶段先看左侧敌情，再做三件事：选择<b>战略抉择</b>、调整<b>敌后长期方针与生产</b>、在地图地区部署最多四道命令。</p>
      <ol>
        <li><b>基层网络是根。</b>它同时产生情报、供给、疏散能力和组织恢复。</li>
        <li><b>敌军目标会追着高暴露与高价值地区走。</b>情报只能帮你看清，不能取消危险。</li>
        <li><b>疏散、坚壁、侦察与迟滞会改变同一次扫荡的代价。</b>所有命令先规划，执行前均可撤回。</li>
        <li><b>敌后行动会影响全国战局。</b>破坏交通、牵制兵力，能够减轻正面压力；只打不建则难以长期坚持。</li>
      </ol>
      <p class="historyBoundary">全民族抗战由中国人民共同承担。本作聚焦中国共产党领导的敌后战场，用组织人民、保存力量与战略牵制的因果链，展示其为什么能够成为抗日战争的中流砥柱。</p>`,
    buttons: [{ label: "开始研判 1937—1938", primary: true, onClick: () => HideAllModals() }],
  });
}

function ShowHistoryBoundary() {
  OpenStandardModal({
    eyebrow: "史实边界与表达原则",
    title: "历史不会被当作可消费的装饰",
    body: `
      <div class="historyBoundary"><b>聚焦范围</b><br>本作聚焦中国共产党领导的八路军、新四军、党领导的东北抗日联军等武装，以及共同坚持斗争的广大群众构成的敌后战场。以国民党军队为主体的正面战场与中国共产党领导的敌后战场相互配合，并与全体中国人民和世界反法西斯力量共同促成最终胜利。</div>
      <h3>固定史实</h3>
      <p>全面抗战、敌后根据地发展、1940年前后的交通破袭、1941—1942年的严酷扫荡与困难时期、1944年局部反攻，以及1945年8月15日日本宣布无条件投降，均作为固定历史背景。玩家改变的是人民与组织付出的代价、力量保存和战略贡献，不会提前“速通”战争，也不会把历史改写成侵略胜利。</p>
      <h3>侵略责任</h3>
      <p class="warningBoundary">侵华日军在扫荡、封锁、焚毁、屠杀与强征中的暴行，由侵略者负全部责任。抵抗行为不是暴行的原因。本作区分日本军国主义侵略者与今天的日本人民。</p>
      <h3>不奖励苦难</h3>
      <p>受难家庭、流离群众、粮食被夺与骨干损失只进入“代价账本”，不会转化为资源或分数。最高评价同时要求保护人民、维系基层网络、保存力量和形成战略牵制。</p>
      <h3>机制抽象</h3>
      <p>地图、地区数值、师团当量与家庭数字均为玩法尺度的合成抽象，不是精确历史统计或真实行政疆界。</p>`,
  });
}

function ShowChapterHistory() {
  const chapter = GetChapter(gameState);
  OpenStandardModal({
    eyebrow: `${chapter.period} · 史实背景 / 游戏抽象`,
    title: chapter.title,
    body: `
      <div class="historyBoundary"><b>史实背景</b><br>${EscapeHtml(chapter.history)}</div>
      <h3>本期游戏抽象</h3>
      <p>敌军行动以“${EscapeHtml(chapter.enemyKind)}”和压力 ${chapter.intensity} 表示。目标由地区暴露、铁路关系、基层网络价值与敌军压力共同决定；玩家只能争取预警、准备与减损空间。</p>
      <h3>核心问题</h3>
      <p>${EscapeHtml(chapter.subtitle)}</p>`,
  });
}

function ShowRules() {
  OpenStandardModal({
    eyebrow: "规则与操作",
    title: "八个阶段，一条完整敌后战略循环",
    body: `
      <h3>每期五步</h3>
      <ol>
        <li>读敌情：已确认目标为红色警告，问号只是可能方向。</li>
        <li>选战略抉择：三种应对都有效，但保护对象和代价不同。</li>
        <li>选敌后长期方针、战略重心与生产配置：方针需要若干期完成。</li>
        <li>点地图地区，下达最多四道命令；同一区最多两项。</li>
        <li>执行本期，查看我方部署、敌军行动和代价账本，再进入下一历史阶段。</li>
      </ol>
      <h3>网络四级</h3>
      <p>党支部 → 群众组织 → 民兵网络 → 巩固根据地。网络贯穿情报、粮药、疏散、组织恢复和反扫荡；地图联络线抽象的是跨区组织协同，并不表示所有敌后区都依赖一条连续物资通道。</p>
      <h3>三类取舍</h3>
      <p><b>组织人民</b>让一切行动有根；<b>保存力量</b>降低扫荡中的不可逆损失；<b>战略牵制</b>削弱敌运输并支援全国战局。任何一条线独走都会付出代价。</p>
      <h3>快捷操作</h3>
      <p><kbd>Enter</kbd> 执行本期 · <kbd>Esc</kbd> 关闭普通弹窗 · 所有地区与命令均可用 Tab、Enter 或触控操作。</p>`,
  });
}

function ShowFocusTree() {
  const cards = focusDefinitions.map((focus) => {
    const availability = GetFocusAvailability(gameState, focus.id);
    const active = gameState.activeFocusId === focus.id;
    const completed = gameState.completedFocusIds.includes(focus.id);
    const stateClass = completed ? " isCompleted" : active ? " isActive" : "";
    const status = completed ? "已完成" : active ? `进行中 ${gameState.focusProgress}/${focus.duration}` : availability.reason;
    return `
      <button class="focusOption${stateClass}" type="button" data-focus-id="${focus.id}" ${availability.available || active ? "" : "disabled"}>
        <b>${EscapeHtml(focus.name)}</b>
        <span>${EscapeHtml(focus.branch)} · ${focus.duration} 期</span>
        <small>${EscapeHtml(focus.description)}</small>
        <em>${EscapeHtml(status)}</em>
      </button>`;
  }).join("");
  OpenStandardModal({
    eyebrow: "敌后长期方针",
    title: "把有限时间投向长期能力",
    body: `<p>每期自动推进当前方针。更换未完成方针会失去已有进度。</p><div class="focusGrid">${cards}</div>`,
    buttons: [{ label: "返回战局", primary: true, onClick: () => HideAllModals() }],
  });
  Element("modalBody").querySelectorAll("[data-focus-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const focusId = button.dataset.focusId;
      if (gameState.activeFocusId === focusId) {
        HideAllModals();
        return;
      }
      gameState = SetFocus(gameState, focusId);
      if (!gameState.lastCommand.success) {
        Toast(gameState.lastCommand.message, "error");
        return;
      }
      SaveCampaign();
      HideAllModals();
      RenderAll();
      Toast(gameState.lastCommand.message);
    });
  });
}

function ShowResourceHelp(resourceId) {
  const help = resourceHelp[resourceId];
  if (!help) return;
  OpenStandardModal({ eyebrow: "战时资源", title: help.title, body: `<p>${EscapeHtml(help.body)}</p>` });
}

function ShowMetricHelp(metricId) {
  const help = metricHelp[metricId];
  if (!help) return;
  OpenStandardModal({ eyebrow: "全国战局指标", title: help.title, body: `<p>${EscapeHtml(help.body)}</p>` });
}

function ShowMenu() {
  OpenStandardModal({
    eyebrow: "战役菜单",
    title: "山河不屈",
    body: `<p>战局会在每次规划与结算后自动保存在当前设备。只删除本页面自己的存档，不影响其他太行玩法白盒。</p>`,
    buttons: [
      { label: "继续战局", primary: true, onClick: () => HideAllModals() },
      { label: "规则", onClick: ShowRules },
      { label: "史实边界", onClick: ShowHistoryBoundary },
      { label: "重新推演", onClick: () => ConfirmRestart(false) },
      { label: "返回标题", onClick: ShowOpeningScreen },
    ],
  });
}

function ConfirmRestart(returnToOutcome = false) {
  OpenStandardModal({
    eyebrow: "确认重新推演",
    title: "放弃当前战局？",
    body: "<p>这会删除《山河不屈》的当前战局和本期检查点，然后从1937—1938重新开始。其他页面存档不会受影响。</p>",
    onClose: returnToOutcome ? ShowOutcome : null,
    buttons: [
      { label: "取消", primary: true, onClick: CloseStandardModal },
      {
        label: "确认重开",
        onClick: () => {
          RemoveSavedKey(gameConfig.saveKey);
          RemoveSavedKey(gameConfig.checkpointKey);
          HideAllModals(false);
          StartNewCampaign();
        },
      },
    ],
  });
}

function BindEvents() {
  Element("startButton").addEventListener("click", StartNewCampaign);
  Element("continueButton").addEventListener("click", ContinueCampaign);
  Element("historyBoundaryButton").addEventListener("click", ShowHistoryBoundary);
  Element("rulesButton").addEventListener("click", ShowRules);
  Element("menuButton").addEventListener("click", ShowMenu);
  Element("focusButton").addEventListener("click", ShowFocusTree);
  Element("focusCardButton").addEventListener("click", ShowFocusTree);
  Element("chapterHistoryButton").addEventListener("click", ShowChapterHistory);
  Element("clearPlanButton").addEventListener("click", () => {
    gameState = ClearPlan(gameState);
    SaveCampaign();
    RenderAll();
    Toast(gameState.lastCommand.message);
  });
  Element("executeTurnButton").addEventListener("click", ExecuteTurn);
  Element("resolutionContinueButton").addEventListener("click", ContinueAfterResolution);
  Element("restartButton").addEventListener("click", () => ConfirmRestart(true));
  Element("standardModal").querySelector("[data-close-modal]").addEventListener("click", CloseStandardModal);
  Element("modalBackdrop").addEventListener("click", () => {
    if (!Element("standardModal").hidden) CloseStandardModal();
  });
  document.querySelectorAll("[data-resource-help]").forEach((button) => {
    button.addEventListener("click", () => ShowResourceHelp(button.dataset.resourceHelp));
  });
  document.querySelectorAll("[data-metric-help]").forEach((button) => {
    button.addEventListener("click", () => ShowMetricHelp(button.dataset.metricHelp));
  });
  window.addEventListener("resize", () => {
    if (gameState && !Element("gameShell").hidden) DrawStrategyMap();
  });
  window.addEventListener("beforeunload", SaveCampaign);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && !Element("modalBackdrop").hidden) {
      TrapModalFocus(event);
      return;
    }
    if (event.key === "Escape" && !Element("standardModal").hidden) {
      event.preventDefault();
      CloseStandardModal();
      return;
    }
    if (event.key === "Enter" && !event.repeat && Element("modalBackdrop").hidden && gameState?.status === "active") {
      const target = event.target;
      if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement || target instanceof HTMLInputElement) return;
      event.preventDefault();
      ExecuteTurn();
    }
  });
}

function Boot() {
  BindEvents();
  RefreshContinueButton();
  EnsureRegionNodes();
}

window.ResistanceCommand1937 = {
  StartNewCampaign,
  ContinueCampaign,
  ExecuteTurn,
  RetryTurn,
  RenderAll,
  SelectRegion,
  ShowRules,
  ShowHistoryBoundary,
  GetState: () => gameState ? CloneForInspection(gameState) : null,
  SetStateForTesting: (state) => {
    const validation = ValidateState(state);
    if (!validation.valid) throw new Error(validation.reason);
    gameState = CloneForInspection(state);
    ShowGameShell();
    RenderAll();
  },
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", Boot, { once: true });
else Boot();
