import { characterDefinitions, GetCharacterDefinition, GetEnemyRoleDefinition } from "./Data_Characters.mjs";
import {
  GetOperationLayout,
  GetOperationLayoutByCampaignIndex,
  operationLayoutDefinitions,
} from "./Data_Operations.mjs";
import {
  GetAtmospherePalette,
  GetOperationStorylet,
  GetStoryCharacter,
} from "./Data_HistoricalAtmosphere.mjs";
import {
  AdvanceOperationClock,
  CompleteCivilianRoute,
  DropOperationCarrierItems,
  ExtractOperationCarrier,
  GetAvailableInteractionForInteractable,
  GetOperationIntegrationSnapshot,
  PickUpDroppedOperationItem,
  ResolveOperationInteraction,
} from "./Script_OperationFlow.mjs";
import { CreateAudioSystem } from "./Script_Audio.mjs";
import { GetTacticalReadout, NormalizeVisualSettings } from "./Data_Ui.mjs";
import { UpdateEnemySquad } from "./Script_Ai.mjs";
import {
  ApplyBuddyRescue,
  ApplyCampAction,
  ApplyAbilityCommand,
  ApplyMissionToCamp,
  CanBuddyRescue,
  CanSee,
  Clamp,
  CreateInitialCampState,
  CreateInitialMissionState,
  CreateSoundEvent,
  Distance,
  FindPath2D,
  GetBallisticImpact,
  GetCoverAt,
  GetCoverDamageMultiplier,
  GetCampDecisionOptions,
  GetMissionDefinitionForState,
  GetMissionEvaluation,
  GetSoundRadius,
  GetZoneAt,
  HasLineOfSight,
  IsConcealmentZone,
  IsPositionLit,
  NormalizeAngle,
  PointInsideBox,
  PrepareMissionFromCamp,
  QueueCommand,
  ResolveDeterministicShot,
  simulationConfig,
  UpdateEnemyIntel,
} from "./Script_Rules.mjs";
import { CreateWorld } from "./Script_World.mjs?v=20260824j";

const saveKey = "mountainember1941_campaign_v1";
const settingKey = "mountainember1941_settings_v1";

function GetElement(id) {
  return document.getElementById(id);
}

function GetInteractable(interactableId) {
  const definition = GetActiveMissionDefinition().interactables.find(
    (candidate) => candidate.id === interactableId,
  );
  const droppedAt = state?.interactables?.[interactableId]?.droppedAt;
  return definition && droppedAt ? { ...definition, ...droppedAt } : definition;
}

function GetActiveMissionDefinition() {
  return GetMissionDefinitionForState(state) ?? GetOperationLayoutByCampaignIndex(campState?.completedMissions ?? 0);
}

const elements = {
  canvas: GetElement("worldCanvas"),
  loadingScreen: GetElement("loadingScreen"),
  loadingHint: GetElement("loadingHint"),
  loadingProgress: GetElement("loadingProgress"),
  titleScreen: GetElement("titleScreen"),
  startButton: GetElement("startButton"),
  briefingButton: GetElement("briefingButton"),
  briefingModal: GetElement("briefingModal"),
  briefingTitle: GetElement("briefingTitle"),
  briefingStory: GetElement("briefingStory"),
  briefingRouteList: GetElement("briefingRouteList"),
  gameHud: GetElement("gameHud"),
  phaseLabel: GetElement("phaseLabel"),
  operationMeta: GetElement("operationMeta"),
  operationName: GetElement("operationName"),
  missionClock: GetElement("missionClock"),
  alertLabel: GetElement("alertLabel"),
  alertFill: GetElement("alertFill"),
  pauseButton: GetElement("pauseButton"),
  pauseGlyph: GetElement("pauseGlyph"),
  pauseLabel: GetElement("pauseLabel"),
  helpButton: GetElement("helpButton"),
  helpModal: GetElement("helpModal"),
  soundButton: GetElement("soundButton"),
  settingsButton: GetElement("settingsButton"),
  settingsModal: GetElement("settingsModal"),
  qualitySelect: GetElement("qualitySelect"),
  uiScaleSelect: GetElement("uiScaleSelect"),
  screenEffectsToggle: GetElement("screenEffectsToggle"),
  reducedMotionToggle: GetElement("reducedMotionToggle"),
  saveSettingsButton: GetElement("saveSettingsButton"),
  settingsStatus: GetElement("settingsStatus"),
  tacticalReadout: GetElement("tacticalReadout"),
  concealmentGlyph: GetElement("concealmentGlyph"),
  concealmentLabel: GetElement("concealmentLabel"),
  awarenessFill: GetElement("awarenessFill"),
  awarenessLabel: GetElement("awarenessLabel"),
  combatFeedback: GetElement("combatFeedback"),
  combatCue: GetElement("combatCue"),
  combatCueLabel: GetElement("combatCueLabel"),
  objectiveList: GetElement("objectiveList"),
  objectiveCounter: GetElement("objectiveCounter"),
  objectivePanel: GetElement("objectivePanel"),
  objectiveDrawerButton: GetElement("objectiveDrawerButton"),
  routeHintButton: GetElement("routeHintButton"),
  eventLog: GetElement("eventLog"),
  situationPanel: GetElement("situationPanel"),
  situationDrawerButton: GetElement("situationDrawerButton"),
  reinforcementStatus: GetElement("reinforcementStatus"),
  shotCount: GetElement("shotCount"),
  riskCount: GetElement("riskCount"),
  discoverCount: GetElement("discoverCount"),
  planningBanner: GetElement("planningBanner"),
  executeButton: GetElement("executeButton"),
  rosterPanel: GetElement("rosterPanel"),
  selectedSummary: GetElement("selectedSummary"),
  abilityGroup: GetElement("abilityGroup"),
  interactButton: GetElement("interactButton"),
  interactHint: GetElement("interactHint"),
  worldPrompt: GetElement("worldPrompt"),
  toastRegion: GetElement("toastRegion"),
  tutorialCard: GetElement("tutorialCard"),
  tutorialClose: GetElement("tutorialClose"),
  extractionButton: GetElement("extractionButton"),
  resultScreen: GetElement("resultScreen"),
  resultGrade: GetElement("resultGrade"),
  resultTitle: GetElement("resultTitle"),
  resultSummary: GetElement("resultSummary"),
  resultScore: GetElement("resultScore"),
  resultSections: GetElement("resultSections"),
  resultLedger: GetElement("resultLedger"),
  campButton: GetElement("campButton"),
  replayButton: GetElement("replayButton"),
  campScreen: GetElement("campScreen"),
  campDay: GetElement("campDay"),
  campOutcomeTitle: GetElement("campOutcomeTitle"),
  campOutcomeText: GetElement("campOutcomeText"),
  campReceipts: GetElement("campReceipts"),
  campRosterList: GetElement("campRosterList"),
  campResourceList: GetElement("campResourceList"),
  campCostLedger: GetElement("campCostLedger"),
  campStatus: GetElement("campStatus"),
  restartFromCampButton: GetElement("restartFromCampButton"),
};

function DetectQuality() {
  if (["low", "high", "ultra"].includes(settings.quality)) return settings.quality;
  const isMobile = matchMedia("(max-width: 760px)").matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  if (isMobile || cores <= 4 || memory <= 4) return "low";
  if (cores >= 10 && memory >= 8 && (window.devicePixelRatio || 1) <= 1.5) return "ultra";
  return "high";
}

function FormatCampaignDate(completedMissions, operation) {
  if (operation?.date) return operation.date.replace(/年|月/g, ".").replace("日", "");
  const campaignStart = Date.UTC(1941, 9, 12);
  const operationCycle = Math.floor(completedMissions / operationLayoutDefinitions.length);
  const totalOffsetDays = operationCycle * 16 + (operation.dateOffsetDays ?? 0);
  const missionDate = new Date(campaignStart + totalOffsetDays * 86400000);
  return `${missionDate.getUTCFullYear()}.${String(missionDate.getUTCMonth() + 1).padStart(2, "0")}.${String(
    missionDate.getUTCDate(),
  ).padStart(2, "0")}`;
}

function ReadSettings() {
  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    return NormalizeVisualSettings(JSON.parse(localStorage.getItem(settingKey) || "{}"), prefersReducedMotion);
  } catch {
    return NormalizeVisualSettings({}, prefersReducedMotion);
  }
}

function SaveSettings() {
  localStorage.setItem(settingKey, JSON.stringify(settings));
}

function LoadCampState() {
  try {
    const saved = JSON.parse(localStorage.getItem(saveKey) || "null");
    return saved?.version === 1 && saved.camp ? saved.camp : CreateInitialCampState();
  } catch {
    return CreateInitialCampState();
  }
}

function SaveCampState() {
  localStorage.setItem(saveKey, JSON.stringify({ version: 1, camp: campState }));
}

const settings = ReadSettings();

function ApplyVisualSettings() {
  document.documentElement.dataset.uiScale = settings.uiScale;
  document.documentElement.dataset.reducedMotion = String(Boolean(settings.reducedMotion));
  document.documentElement.dataset.screenEffects = String(Boolean(settings.screenEffects));
}

function GetLocalOperationPreviewIndex() {
  if (!["127.0.0.1", "localhost"].includes(window.location.hostname)) return null;
  const value = Number.parseInt(new URLSearchParams(window.location.search).get("operationPreview") ?? "", 10);
  return Number.isInteger(value) && value >= 0 && value < operationLayoutDefinitions.length ? value : null;
}

ApplyVisualSettings();
const audio = CreateAudioSystem();
audio.SetMuted(settings.muted);
let campState = LoadCampState();
const localOperationPreviewIndex = GetLocalOperationPreviewIndex();
if (localOperationPreviewIndex !== null) {
  campState = CreateInitialCampState();
  campState.completedMissions = localOperationPreviewIndex;
}
campState.civilianCostLedger ??= { harm: 0, risk: 0, displacement: 0 };
campState.civilianCostLedger.displacement ??= 0;
let state = PrepareMissionFromCamp(CreateInitialMissionState(), campState);
let world = null;
let screenMode = "loading";
let lastFrameTime = performance.now();
let simulationAccumulator = 0;
let aiAccumulator = 0;
let hudAccumulator = 0;
let renderAccumulator = 0;
let renderBurstUntil = 0;
let renderDirty = true;
let pointerDown = null;
let pointerMoved = false;
let pendingHoverPointer = null;
const activeTouchPointers = new Map();
let pinchDistance = null;
let pinchActive = false;
let activeAbility = null;
let activeAbilityAppend = false;
let routeHintIndex = 0;
let toastTimeout = null;
let feedbackTimeout = null;
let cueTimeout = null;
let modalReturnFocus = null;
let lastPresentedAlertLevel = state.alertLevel;
let rendererQuality = null;
let campActionUsed = false;
let frameSamples = [];
let totalWorkSamples = [];
let simulationWorkSamples = [];
let renderWorkSamples = [];
let hudWorkSamples = [];
const view = {
  hoverEnemyId: null,
  currentPointerWorld: null,
  currentInteractionId: null,
};

function RequestInteractiveRender(durationSeconds = 0.5) {
  renderDirty = true;
  renderBurstUntil = Math.max(renderBurstUntil, performance.now() + durationSeconds * 1000);
}

function PushPerformanceSample(samples, milliseconds) {
  samples.push(milliseconds);
  if (samples.length > 240) samples.shift();
}

function GetPercentile95(samples) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

function GetPerformanceSnapshot() {
  const framePacingP95 = GetPercentile95(frameSamples);
  return {
    samples: frameSamples.length,
    workSamples: totalWorkSamples.length,
    p95: framePacingP95,
    framePacingP95,
    totalWorkP95: GetPercentile95(totalWorkSamples),
    simulationWorkP95: GetPercentile95(simulationWorkSamples),
    renderWorkP95: GetPercentile95(renderWorkSamples),
    hudWorkP95: GetPercentile95(hudWorkSamples),
  };
}

function FormatTime(seconds) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remaining = Math.floor(Math.max(0, seconds) % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function PushMessage(kind, text) {
  const previous = state.messages[state.messages.length - 1];
  if (previous?.text === text && state.time - previous.time < 1.2) return;
  state.messages.push({ time: state.time, kind, text });
  if (state.messages.length > 32) state.messages.shift();
}

function ShowToast(text, alert = false) {
  const toast = document.createElement("div");
  toast.className = `toast${alert ? " isAlert" : ""}`;
  toast.textContent = text;
  elements.toastRegion.replaceChildren(toast);
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.remove(), 2800);
}

function GetStorySpeakerName(speakerId) {
  return (
    GetCharacterDefinition(speakerId)?.name ??
    GetStoryCharacter(speakerId)?.displayName ??
    GetStoryCharacter(speakerId)?.name ??
    "行动组"
  );
}

function StoryConditionMatches(condition = "always") {
  if (condition === "always") return true;
  if (condition.startsWith("flag:")) {
    return Boolean(state.operationRuntime?.flags?.[condition.slice("flag:".length)]);
  }
  const ledgerCondition = /^ledger:([A-Za-z]+)(=|>)(\d+)$/.exec(condition);
  if (!ledgerCondition) return false;
  const [, field, operator, rawValue] = ledgerCondition;
  const actualValue = Number(state.operationRuntime?.civilianCostLedger?.[field] ?? state.ledger?.[`civilian${field[0].toUpperCase()}${field.slice(1)}`] ?? 0);
  const expectedValue = Number(rawValue);
  return operator === "=" ? actualValue === expectedValue : actualValue > expectedValue;
}

function ResolveStoryletLines(storyletId) {
  const storylet = GetOperationStorylet(storyletId);
  if (!storylet) return [];
  if (!storylet.variants) return storylet.lines ?? [];
  return storylet.variants.find((variant) => StoryConditionMatches(variant.when))?.lines ?? [];
}

function FormatStoryletLine(line) {
  return `${GetStorySpeakerName(line.speakerId)}：${line.text}`;
}

function PushStorylet(storyletId) {
  const storylet = GetOperationStorylet(storyletId);
  if (!storylet) return false;
  state.storyletsSeen ??= [];
  if (storylet.once && state.storyletsSeen.includes(storyletId)) return false;
  const lines = ResolveStoryletLines(storyletId);
  if (lines.length === 0) return false;
  if (storylet.once) state.storyletsSeen.push(storyletId);
  for (const line of lines) PushMessage("brief", FormatStoryletLine(line));
  ShowToast(FormatStoryletLine(lines[0]));
  return true;
}

function TriggerFieldStorylets(trigger) {
  const layout = GetOperationLayout(state.operationLayoutId);
  for (const storyletId of layout?.narrativeRefs?.field ?? []) {
    const storylet = GetOperationStorylet(storyletId);
    if (storylet?.trigger === trigger) PushStorylet(storyletId);
  }
}

function TriggerRuntimeStorylets(previousRuntime, nextRuntime) {
  for (const objectiveId of nextRuntime?.completedObjectives ?? []) {
    if (!previousRuntime?.completedObjectives?.includes(objectiveId)) {
      TriggerFieldStorylets(`objective:${objectiveId}`);
    }
  }
  for (const [flagId, enabled] of Object.entries(nextRuntime?.flags ?? {})) {
    if (enabled && !previousRuntime?.flags?.[flagId]) TriggerFieldStorylets(`flag:${flagId}`);
  }
}

function PopulateMissionBriefing() {
  const layout = GetOperationLayout(state.operationLayoutId);
  if (!layout || !elements.briefingStory || !elements.briefingRouteList) return;
  elements.briefingTitle.textContent = `${layout.name}：行动前口述`;
  const briefingLines = ResolveStoryletLines(layout.narrativeRefs?.briefing);
  elements.briefingStory.replaceChildren(
    ...briefingLines.map((line) => {
      const paragraph = document.createElement("p");
      const speaker = document.createElement("strong");
      speaker.textContent = `${GetStorySpeakerName(line.speakerId)}：`;
      paragraph.append(speaker, line.text);
      return paragraph;
    }),
  );
  const atmosphere = GetAtmospherePalette(layout.id);
  const routeNotes = layout.tacticalPhases.slice(0, 3).map((phase) => `${phase.label}：${phase.decision}`);
  if (atmosphere?.nearSounds?.[0]) {
    routeNotes.push(`现场声景：近处${atmosphere.nearSounds[0]}；远处${atmosphere.farSounds?.[0] ?? "村路声"}`);
  }
  elements.briefingRouteList.replaceChildren(
    ...routeNotes.map((note) => {
      const item = document.createElement("li");
      item.textContent = note;
      return item;
    }),
  );
}

function ShowCombatCue(label, tone = "intel") {
  if (!elements.combatCue || !label) return;
  elements.combatCueLabel.textContent = label;
  elements.combatCue.dataset.tone = tone;
  elements.combatCue.classList.remove("isHidden", "isLeaving");
  if (cueTimeout) clearTimeout(cueTimeout);
  cueTimeout = setTimeout(() => {
    elements.combatCue.classList.add("isLeaving");
    cueTimeout = setTimeout(() => elements.combatCue.classList.add("isHidden"), 260);
  }, 1500);
}

function TriggerCombatFeedback(kind, intensity = 0.5, label = "") {
  if (label) ShowCombatCue(label, kind);
  if (!settings.screenEffects || settings.reducedMotion || !elements.combatFeedback) return;
  world?.ApplyCameraImpact?.(kind, intensity);
  const shell = GetElement("gameShell");
  shell.style.setProperty("--feedbackStrength", String(Clamp(intensity, 0.15, 1)));
  shell.classList.remove("feedbackShot", "feedbackDamage", "feedbackExplosion", "feedbackAlert", "feedbackObjective");
  void shell.offsetWidth;
  const className = {
    shot: "feedbackShot",
    damage: "feedbackDamage",
    explosion: "feedbackExplosion",
    alert: "feedbackAlert",
    objective: "feedbackObjective",
  }[kind];
  if (className) shell.classList.add(className);
  if (feedbackTimeout) clearTimeout(feedbackTimeout);
  feedbackTimeout = setTimeout(
    () => shell.classList.remove("feedbackShot", "feedbackDamage", "feedbackExplosion", "feedbackAlert", "feedbackObjective"),
    kind === "explosion" ? 720 : 430,
  );
  RequestInteractiveRender(kind === "explosion" ? 0.8 : 0.45);
}

function PopulateSettingsPanel() {
  elements.qualitySelect.value = settings.quality;
  elements.uiScaleSelect.value = settings.uiScale;
  elements.screenEffectsToggle.checked = settings.screenEffects;
  elements.reducedMotionToggle.checked = settings.reducedMotion;
  elements.settingsStatus.textContent = `当前渲染：${rendererQuality ?? DetectQuality()}；设置保存在本机。`;
}

function SaveVisualSettingsFromPanel() {
  const previousQuality = settings.quality;
  settings.quality = elements.qualitySelect.value;
  settings.uiScale = elements.uiScaleSelect.value;
  settings.screenEffects = elements.screenEffectsToggle.checked;
  settings.reducedMotion = elements.reducedMotionToggle.checked;
  SaveSettings();
  ApplyVisualSettings();
  elements.settingsStatus.textContent =
    previousQuality === settings.quality
      ? "设置已应用。"
      : "界面设置已应用；渲染质量会在下次载入战术图时生效。";
  RequestInteractiveRender();
}

function GetSelectedUnit() {
  const primaryId = state.selectedUnitIds[0];
  return state.units.find((unit) => unit.id === primaryId) ?? state.units[0];
}

function SetSelectedUnits(unitIds, focus = false) {
  const nextIds = [...new Set(unitIds)].filter((unitId) =>
    state.units.some((unit) => unit.id === unitId && unit.state !== "dead" && unit.state !== "evacuated"),
  );
  if (nextIds.length === 0) return;
  state.selectedUnitIds = nextIds;
  for (const unit of state.units) unit.selected = nextIds.includes(unit.id);
  activeAbility = null;
  RequestInteractiveRender();
  audio.Play("select");
  if (focus) {
    const unit = GetSelectedUnit();
    world?.FocusPosition(unit, 38);
  }
  RenderHud();
}

function TogglePause(forceValue = null) {
  if (screenMode !== "mission" || state.outcome) return;
  state.paused = forceValue === null ? !state.paused : Boolean(forceValue);
  state.planning = state.paused;
  RequestInteractiveRender(0.7);
  audio.Play("pause");
  RenderHud();
}

function InMissionBounds(position) {
  const mission = GetActiveMissionDefinition();
  return {
    x: Clamp(position.x, mission.bounds.minimumX, mission.bounds.maximumX),
    z: Clamp(position.z, mission.bounds.minimumZ, mission.bounds.maximumZ),
  };
}

function GetNavigationObstacles() {
  return [
    ...GetActiveMissionDefinition().obstacles,
    ...(state.environment.dynamicObstacles ?? []),
  ];
}

function PositionBlocked(position, radius = 0.65) {
  return GetNavigationObstacles().some((obstacle) => PointInsideBox(position, obstacle, radius));
}

function MoveActor(actor, target, speed, deltaTime) {
  const deltaX = target.x - actor.x;
  const deltaZ = target.z - actor.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= 0.12) return true;
  const step = Math.min(distance, speed * deltaTime);
  const next = {
    x: actor.x + (deltaX / distance) * step,
    z: actor.z + (deltaZ / distance) * step,
  };
  const bounded = InMissionBounds(next);
  if (!PositionBlocked(bounded)) {
    actor.x = bounded.x;
    actor.z = bounded.z;
  } else {
    const slideX = { x: bounded.x, z: actor.z };
    const slideZ = { x: actor.x, z: bounded.z };
    if (!PositionBlocked(slideX)) actor.x = slideX.x;
    else if (!PositionBlocked(slideZ)) actor.z = slideZ.z;
    else return false;
  }
  actor.facing = Math.atan2(deltaX, deltaZ);
  return distance <= step + 0.14;
}

function EmitSound(actor, radius, kind) {
  const soundEvent = CreateSoundEvent(actor, radius, kind, actor.id ?? "world", state.time);
  state.soundEvents.push(soundEvent);
  if (state.soundEvents.length > 64) state.soundEvents.splice(0, state.soundEvents.length - 64);
  world?.SpawnRing(actor, kind === "gunshot" || kind === "explosion" ? 0xd57959 : 0xd3bc77, radius, kind === "explosion" ? 1.2 : 0.72);
}

function DownUnit(unit) {
  if (unit.state === "downed" || unit.state === "dead") return;
  unit.state = "downed";
  unit.health = 0;
  unit.command = null;
  unit.queue = [];
  unit.downedTimer = simulationConfig.downedBleedSeconds;
  unit.stabilized = false;
  state.ledger.woundedOperatives += 1;
  TriggerCombatFeedback("damage", 1, `${unit.name}倒地`);
  PushMessage("alert", `${unit.name}倒地，${Math.round(unit.downedTimer)} 秒内可以稳定伤势。`);
  ShowToast(`${unit.name}倒地——先压住火力，再派人止血。`, true);
}

function CarryItem(unit, itemId) {
  unit.carriedItems ??= [];
  if (!unit.carriedItems.includes(itemId)) unit.carriedItems.push(itemId);
  unit.carrying = unit.carriedItems[0] ?? null;
}

function DropCarriedItems(unit) {
  const droppedItems = [...(unit.carriedItems ?? [])];
  if (droppedItems.length === 0) return;
  unit.carriedItems = [];
  unit.carrying = null;
  for (const itemId of droppedItems) {
    const runtime = state.interactables[itemId];
    if (runtime) {
      runtime.completed = false;
      runtime.progress = 0;
      runtime.discovered = true;
      runtime.droppedAt = { x: unit.x, z: unit.z };
    }
    if (itemId in state.objectives) state.objectives[itemId] = false;
  }
  state.objectives.ledger = state.units.some((candidate) => candidate.carriedItems?.includes("ledger"));
  if (state.operationRuntime) {
    state.operationRuntime = DropOperationCarrierItems(
      state.operationRuntime,
      unit.id,
      { x: unit.x, z: unit.z },
    );
  }
  PushMessage("alert", `${unit.name}携带的任务物资遗落在现场，必须重新取回。`);
}

function FinalizeCarriedItems() {
  const recovered = new Set(
    state.units
      .filter((unit) => unit.state !== "dead" && unit.state !== "downed")
      .flatMap((unit) => unit.carriedItems ?? []),
  );
  const layout = GetOperationLayout(state.operationLayoutId);
  const carryObjectiveIds = [
    ...(layout?.objectives.mandatory ?? []),
    ...(layout?.objectives.optional ?? []),
  ]
    .filter((objective) => objective.carryToExtract)
    .map((objective) => objective.id);
  for (const unit of state.units) {
    if (state.operationRuntime && unit.state !== "dead" && unit.state !== "downed") {
      state.operationRuntime = ExtractOperationCarrier(state.operationRuntime, unit.id);
    }
  }
  state.supplies.medicine = recovered.has("medicines") || recovered.has("clinicSatchel") ? 2 : 0;
  state.supplies.radioParts = recovered.has("radioParts") ? 1 : 0;
  state.supplies.tools = recovered.has("tools") || recovered.has("militaryDetonators") ? 1 : 0;
  for (const objectiveId of ["ledger", "medicines", "radioParts", "tools", ...carryObjectiveIds]) {
    state.objectives[objectiveId] = recovered.has(objectiveId);
  }
  for (const objectiveId of state.operationRuntime?.completedObjectives ?? []) {
    state.objectives[objectiveId] = true;
  }
}

function ClaimShotIndex() {
  const shotIndex = state.shotIndex ?? 0;
  state.shotIndex = shotIndex + 1;
  return shotIndex;
}

function GetMissImpactPoint(shooter, target, resolution, shotIndex) {
  const deltaX = target.x - shooter.x;
  const deltaZ = target.z - shooter.z;
  const distance = Math.max(1, Math.hypot(deltaX, deltaZ));
  const directionX = deltaX / distance;
  const directionZ = deltaZ / distance;
  const perpendicularX = -directionZ;
  const perpendicularZ = directionX;
  const spread = 1.2 + (1 - resolution.hitChance) * Math.min(5.4, distance * 0.24);
  const lateral = (resolution.roll * 2 - 1) * spread;
  const secondaryRoll = (resolution.roll * 997 + shotIndex * 0.61803398875) % 1;
  const rangeOffset = (secondaryRoll * 2 - 1) * Math.min(3.2, distance * 0.14);
  return InMissionBounds({
    x: target.x + perpendicularX * lateral + directionX * rangeOffset,
    z: target.z + perpendicularZ * lateral + directionZ * rangeOffset,
  });
}

function SpawnMissImpact(shooter, target, resolution, shotIndex, tracerColor, directObstacleImpact = null) {
  const missPoint = GetMissImpactPoint(shooter, target, resolution, shotIndex);
  const obstacleImpact = directObstacleImpact ?? GetBallisticImpact(shooter, missPoint);
  if (obstacleImpact) {
    world?.SpawnTracer(shooter, obstacleImpact, tracerColor);
    world?.SpawnImpact?.(obstacleImpact, obstacleImpact.material);
    return;
  }
  world?.SpawnTracer(shooter, missPoint, tracerColor);
  world?.SpawnImpact?.(missPoint, "earth");
}

function FireUnitAtEnemy(unit, enemy, suppressOnly = false) {
  if (unit.ammo <= 0 || enemy.health <= 0 || enemy.disabled) return false;
  if (Distance(unit, enemy) > 23) return false;
  const hasClearShot = HasLineOfSight(unit, enemy);
  const obstacleImpact = hasClearShot ? null : GetBallisticImpact(unit, enemy);
  if (!hasClearShot && !obstacleImpact) return false;
  const definition = GetCharacterDefinition(unit.id);
  const tracerColor = definition?.accent ? Number.parseInt(definition.accent.slice(1), 16) : 0xffd17a;
  const burst = suppressOnly ? Math.min(4, unit.ammo) : 1;
  const cover = GetCoverAt(enemy, unit);
  let totalDamage = 0;
  let totalSuppression = 0;
  let hitCount = 0;
  for (let round = 0; round < burst; round += 1) {
    const shotIndex = ClaimShotIndex();
    const resolution = ResolveDeterministicShot(unit, enemy, {
      time: state.time,
      seed: state.seed,
      shotIndex,
      mode: suppressOnly ? "suppress" : "aimed",
      cover,
    });
    const hit = hasClearShot && resolution.hit;
    totalSuppression += Math.round(resolution.suppression * (hasClearShot ? 1 : 0.35));
    if (hit) {
      hitCount += 1;
      totalDamage += resolution.damage;
      world?.SpawnTracer(unit, enemy, tracerColor);
      world?.SpawnImpact?.(enemy, "body");
    } else {
      SpawnMissImpact(unit, enemy, resolution, shotIndex, tracerColor, obstacleImpact);
    }
  }
  unit.ammo -= burst;
  unit.shotCooldown = unit.id === "weiShouyi" ? 0.9 : 1.25;
  state.ledger.shotsFired += burst;
  state.alertLevel = Math.max(state.alertLevel, 1);
  enemy.health = Math.max(0, enemy.health - totalDamage);
  enemy.suppression = Clamp(enemy.suppression + totalSuppression, 0, 100);
  enemy.morale = Clamp(enemy.morale - Math.max(2, Math.round(totalSuppression * (suppressOnly ? 0.36 : 0.48))), 0, 100);
  enemy.lastKnown = { x: unit.x, z: unit.z, time: state.time };
  enemy.state = enemy.health <= 0 ? "disabled" : "combat";
  if (enemy.health <= 0) {
    enemy.disabled = true;
    state.ledger.enemiesDisabled += 1;
    PushMessage("combat", `${GetEnemyRoleDefinition(enemy.role).name}失去行动能力。`);
  }
  TriggerCombatFeedback("shot", hitCount > 0 ? (suppressOnly ? 0.22 : 0.34) : 0.14);
  EmitSound(unit, unit.id === "weiShouyi" ? 54 : 46, "gunshot");
  audio.Play("gunshot");
  return true;
}

function OnEnemyShot(enemy, target) {
  if (state.paused || target.state === "downed" || target.state === "evacuated") return;
  const hasClearShot = HasLineOfSight(enemy, target);
  const obstacleImpact = hasClearShot ? null : GetBallisticImpact(enemy, target);
  const shotIndex = ClaimShotIndex();
  const resolution = ResolveDeterministicShot(enemy, target, {
    time: state.time,
    seed: state.seed,
    shotIndex,
    mode: enemy.fireIntent === "suppress" ? "suppress" : "aimed",
    cover: GetCoverAt(target, enemy),
  });
  const hit = hasClearShot && resolution.hit;
  target.suppression = Clamp(
    target.suppression + Math.round(resolution.suppression * (hasClearShot ? 1 : 0.35)),
    0,
    100,
  );
  if (hit) {
    target.health = Math.max(0, target.health - resolution.damage);
    world?.SpawnTracer(enemy, target, 0xd68b65);
    world?.SpawnImpact?.(target, "body");
    TriggerCombatFeedback("damage", Clamp(resolution.damage / 12, 0.35, 0.9), `${target.name}受击`);
  } else {
    SpawnMissImpact(enemy, target, resolution, shotIndex, 0xd68b65, obstacleImpact);
    TriggerCombatFeedback("shot", 0.12);
  }
  EmitSound(enemy, 42, "gunshot");
  audio.Play("enemyShot");
  if (target.health <= 0) DownUnit(target);
}

function OnReinforcement() {
  const existing = state.enemies.filter((enemy) => enemy.id.startsWith("reinforcement")).length;
  if (existing >= 6) return;
  const layout = GetOperationLayout(state.operationLayoutId);
  const runtime = state.operationRuntime;
  const activeReinforcementRoute = layout?.reinforcementRoutes.find(
    (route) => route.id === state.activeReinforcementRouteId,
  );
  const reinforcementRoute = activeReinforcementRoute ?? layout?.reinforcementRoutes.find((route) => {
    if (runtime?.disabledReinforcements.includes(route.id)) return false;
    if (route.disabledByFlag && runtime?.flags[route.disabledByFlag]) return false;
    if (route.enabledByFlag && !runtime?.flags[route.enabledByFlag] && !runtime?.enabledReinforcements.includes(route.id)) return false;
    return true;
  });
  if (layout && !reinforcementRoute) {
    PushMessage("brief", "敌方增援路线均被阻断，本轮未能进入行动区。 ");
    return;
  }
  const entry = reinforcementRoute?.entry ?? { x: 57, z: -7 };
  const target = state.enemies.find((enemy) => enemy.lastKnown)?.lastKnown ?? { x: 28, z: 4 };
  const reinforcementCount = reinforcementRoute?.mode === "foot" || reinforcementRoute?.mode === "messenger" ? 2 : 3;
  for (let index = 0; index < reinforcementCount; index += 1) {
    const roleId = index === 0 ? "leader" : "patrol";
    const role = GetEnemyRoleDefinition(roleId);
    state.enemies.push({
      id: `reinforcement_${existing + index}`,
      role: roleId,
      x: entry.x - index * 1.4,
      z: entry.z + index * 1.5,
      facing: Math.atan2(target.x - entry.x, target.z - entry.z),
      health: role.health,
      maximumHealth: role.health,
      morale: role.morale,
      suppression: 0,
      awareness: 100,
      state: "search",
      patrolIndex: 0,
      target: null,
      lastKnown: { ...target, time: state.time },
      lastHeard: null,
      searchTimer: 28,
      reportTimer: 0,
      shotCooldown: index * 0.3,
      disabled: false,
      bodyHidden: false,
      radioed: true,
      uncertainty: 4,
      seedOffset: state.seed + 900 + existing + index,
    });
  }
  state.alertLevel = 3;
  state.phase = "breakcontact";
  ShowToast("东公路出现增援。主目标完成后立即断接撤离。", true);
  audio.Play("alert");
}

function GetMovementSpeed(unit) {
  const definition = GetCharacterDefinition(unit.id);
  let multiplier = unit.stance === "crouch" ? 0.56 : unit.stance === "sprint" ? 1.55 : 1;
  const zone = GetZoneAt(unit);
  if (zone?.kind === "ditch") multiplier *= 0.78;
  const carriedItems = unit.carriedItems ?? [];
  if (carriedItems.includes("medicines")) multiplier *= 0.82;
  if (carriedItems.includes("ledger")) multiplier *= 0.96;
  if (carriedItems.includes("radioParts")) multiplier *= 0.94;
  if (carriedItems.includes("tools")) multiplier *= 0.92;
  if (carriedItems.includes("clinicSatchel")) multiplier *= 0.82;
  if (carriedItems.includes("stationLedger")) multiplier *= 0.96;
  if (carriedItems.includes("militaryDetonators")) multiplier *= 0.9;
  if (unit.health < unit.maximumHealth * 0.5) multiplier *= 0.82;
  if (unit.state === "wounded") multiplier *= 0.55;
  return definition.speed * multiplier * (unit.speedMultiplier ?? 1);
}

function ApplyExplosionConsequences(position, radius = 12) {
  TriggerCombatFeedback("explosion", 1, "爆炸冲击");
  const HasBlastLine = (target) =>
    HasLineOfSight(
      position,
      target,
      GetActiveMissionDefinition().obstacles.filter(
        (obstacle) => !PointInsideBox(position, obstacle, -0.08) && !PointInsideBox(target, obstacle, -0.08),
      ),
    );
  for (const enemy of state.enemies) {
    const distance = Distance(position, enemy);
    if (enemy.disabled || distance > radius || !HasBlastLine(enemy)) continue;
    const falloff = Clamp(1 - distance / radius, 0.18, 1);
    const cover = GetCoverAt(enemy, position);
    const damage = Math.round(72 * falloff * GetCoverDamageMultiplier(cover, "explosion"));
    enemy.health = Math.max(0, enemy.health - damage);
    enemy.suppression = Clamp(enemy.suppression + 55 + falloff * 45, 0, 100);
    enemy.morale = Clamp(enemy.morale - 28 - falloff * 30, 0, 100);
    if (enemy.health <= 0) {
      enemy.disabled = true;
      enemy.state = "disabled";
      state.ledger.enemiesDisabled += 1;
    } else {
      enemy.lastKnown = { x: position.x, z: position.z, time: state.time };
      enemy.state = "combat";
    }
  }
  for (const unit of state.units) {
    const distance = Distance(position, unit);
    if (["dead", "evacuated"].includes(unit.state) || distance > radius || !HasBlastLine(unit)) continue;
    const falloff = Clamp(1 - distance / radius, 0.12, 1);
    const cover = GetCoverAt(unit, position);
    const damage = Math.round(48 * falloff * GetCoverDamageMultiplier(cover, "explosion"));
    unit.health = Math.max(0, unit.health - damage);
    unit.suppression = Clamp(unit.suppression + 48 + falloff * 42, 0, 100);
    if (unit.health <= 0) DownUnit(unit);
  }
  for (const civilian of state.civilians ?? []) {
    if (["evacuated", "harmed"].includes(civilian.state)) continue;
    const distance = Distance(position, civilian);
    if (distance <= radius + 3) state.ledger.civilianRisk += Math.max(1, civilian.groupSize ?? 1);
    if (distance <= radius * 0.45 && HasBlastLine(civilian)) {
      civilian.state = "harmed";
      state.ledger.civilianHarm += Math.max(1, civilian.groupSize ?? 1);
      if (state.civilianRoutes[civilian.routeId]) state.civilianRoutes[civilian.routeId].failed = true;
    }
  }
  for (const definition of GetActiveMissionDefinition().interactables.filter(
    (candidate) => candidate.kind === "civilian" || candidate.kind === "rescue",
  )) {
    if (state.interactables[definition.id]?.completed) continue;
    const distance = Distance(position, definition);
    if (distance <= radius + 3) state.ledger.civilianRisk += 1;
    if (distance <= radius * 0.45 && HasBlastLine(definition)) state.ledger.civilianHarm += 1;
  }
}

function IsUnitHidden(unit) {
  return unit.stance === "crouch" && IsConcealmentZone(unit);
}

function SyncOperationRuntimeToState(nextRuntime = state.operationRuntime) {
  if (!nextRuntime) return;
  state.operationRuntime = nextRuntime;
  const snapshot = GetOperationIntegrationSnapshot(nextRuntime);
  if (!snapshot) return;

  state.environment.flags = { ...nextRuntime.flags };
  Object.assign(state.environment, snapshot.environment);
  state.environment.generatorDisabled =
    nextRuntime.flags.stationPowerDisabled || nextRuntime.flags.villageLampsDisabled || false;
  state.environment.alarmBellDisabled =
    nextRuntime.flags.warningGongDisabled || nextRuntime.flags.alarmBellDisabled || false;
  state.environment.eastRoadBlocked = Boolean(nextRuntime.flags.mountainRoadBlocked);
  const dynamicObstacles = [];
  if (nextRuntime.flags.rockfallTriggeredSafely || nextRuntime.flags.rockfallTriggeredBeforeClear) {
    dynamicObstacles.push({
      id: "runtimeRockfallRoadBlock",
      kind: "wall",
      impactMaterial: "stone",
      x: 49,
      z: -4,
      width: 18,
      depth: 8,
      height: 4,
      color: 0x766f60,
    });
  } else if (nextRuntime.flags.oreCartsReleased) {
    dynamicObstacles.push({
      id: "runtimeOreCartRoadBlock",
      kind: "wagon",
      impactMaterial: "metal",
      x: 5,
      z: -5,
      width: 15,
      depth: 6,
      height: 3,
      color: 0x4b4840,
    });
  }
  if (nextRuntime.blockedRoutes.includes("openThreshingCrossing")) {
    dynamicObstacles.push({
      id: "runtimeThreshingCordon",
      kind: "wall",
      impactMaterial: "wood",
      x: -42,
      z: -27,
      width: 14,
      depth: 5,
      height: 2,
      color: 0x514636,
    });
  }
  state.environment.dynamicObstacles = dynamicObstacles;
  if (
    !state.environment.dustCloud &&
    (nextRuntime.flags.rockfallTriggeredSafely || nextRuntime.flags.rockfallTriggeredBeforeClear)
  ) {
    const rockfall = GetInteractable("rockfallTimber");
    if (rockfall) state.environment.dustCloud = { x: rockfall.x, z: rockfall.z, radius: 13, remaining: 14 };
  }

  state.extractionZones = snapshot.missionDefinition.extractionZones.map((zone) => ({ ...zone }));
  for (const objectiveId of nextRuntime.completedObjectives) state.objectives[objectiveId] = true;

  const previousCosts = state.operationLedgerApplied ?? { risk: 0, harm: 0, displacement: 0 };
  const nextCosts = nextRuntime.civilianCostLedger;
  state.ledger.civilianRisk += Math.max(0, nextCosts.risk - previousCosts.risk);
  state.ledger.civilianHarm += Math.max(0, nextCosts.harm - previousCosts.harm);
  state.ledger.civilianDisplacement ??= 0;
  state.ledger.civilianDisplacement += Math.max(0, nextCosts.displacement - previousCosts.displacement);
  state.operationLedgerApplied = { ...nextCosts };

  for (const [enemyId, patrolId] of Object.entries(nextRuntime.patrolRouteOverrides)) {
    const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
    if (!enemy || enemy.patrol === patrolId) continue;
    enemy.patrol = patrolId;
    enemy.patrolIndex = 0;
    enemy.navigation = null;
  }

  for (const routeId of nextRuntime.activeCivilianRoutes) {
    if (state.civilianRoutes[routeId]) state.civilianRoutes[routeId].active = true;
  }
  for (const routeId of nextRuntime.completedCivilianRoutes) {
    if (state.civilianRoutes[routeId]) state.civilianRoutes[routeId].completed = true;
  }
  for (const dropped of nextRuntime.droppedItems) {
    const interactableRuntime = state.interactables[dropped.itemId];
    if (interactableRuntime) interactableRuntime.droppedAt = { x: dropped.x, z: dropped.z };
  }

  const eventLabels = {
    lightsOut: "探照灯熄灭，值勤兵离开原巡线检查发电机。",
    messengerDispatched: "电话失效，敌方传令兵改走地面路线。",
    westHouseholdsDepart: "西巷村民开始沿墙分批转移。",
    eastHouseholdsDepart: "东巷村民借流水声向暗渠移动。",
    workersLeaveInGroups: "民工按木梆信号分组离开采坑。",
    blastAreaClear: "最后一组民工已越过危险线，可以控制落石。",
    controlledRockfall: "定向落石封住盘山路，尘幕正在扩散。",
    uncontrolledRockfall: "落石提前触发，群众代价已永久记入账本。",
    oreCartsCrash: "矿车冲入盘山路中段，巡逻被迫上下绕行。",
    curfewTightens: "夜间封锁收紧，北侧搜索组开始进村。",
  };
  const processedEventCount = state.operationEventCount ?? 1;
  for (const entry of nextRuntime.events.slice(processedEventCount)) {
    const text = eventLabels[entry.event];
    if (text) PushMessage(entry.event === "uncontrolledRockfall" ? "alert" : "brief", text);
  }
  state.operationEventCount = nextRuntime.events.length;
}

function GetRouteSample(route, requestedDistance) {
  const totalDistance = route.points.slice(1).reduce(
    (total, point, index) => total + Distance(route.points[index], point),
    0,
  );
  const distance = Clamp(requestedDistance, 0, totalDistance);
  let traversed = 0;
  for (let index = 0; index < route.points.length - 1; index += 1) {
    const start = route.points[index];
    const end = route.points[index + 1];
    const segmentLength = Distance(start, end);
    if (distance <= traversed + segmentLength) {
      const ratio = segmentLength > 0 ? (distance - traversed) / segmentLength : 1;
      return {
        position: {
          x: start.x + (end.x - start.x) * ratio,
          z: start.z + (end.z - start.z) * ratio,
        },
        facing: Math.atan2(end.x - start.x, end.z - start.z),
        segmentIndex: index,
        nextWaypointDistance: traversed + segmentLength,
        totalDistance,
        finished: distance >= totalDistance - 0.01,
      };
    }
    traversed += segmentLength;
  }
  return {
    position: { ...route.points[route.points.length - 1] },
    facing: 0,
    segmentIndex: Math.max(0, route.points.length - 2),
    nextWaypointDistance: totalDistance,
    totalDistance,
    finished: true,
  };
}

function GetCivilianEscort(position, radius) {
  const units = state.units.filter(
    (unit) =>
      !["dead", "downed", "evacuated", "unavailable"].includes(unit.state) &&
      Distance(unit, position) <= radius,
  );
  return { units, present: units.length > 0, strength: Math.min(2, units.length) };
}

function GetCivilianThreat(position) {
  const obstacles = [
    ...GetActiveMissionDefinition().obstacles,
    ...(state.environment.dynamicObstacles ?? []),
  ];
  const zone = GetZoneAt(position, GetActiveMissionDefinition());
  const soundMasked = state.operationRuntime?.soundMasks?.includes(zone?.id);
  const nearbyRadius = (soundMasked ? 9 : 13) + (state.alertLevel >= 2 ? 4 : 0);
  const activeEnemies = state.enemies.filter((enemy) => !enemy.disabled && enemy.health > 0);
  const visibleEnemies = activeEnemies.filter((enemy) => CanSee(enemy, position, obstacles));
  const nearbyEnemies = activeEnemies.filter(
    (enemy) =>
      Distance(enemy, position) <= nearbyRadius &&
      ["patrol", "return", "suspicious", "investigate", "search", "combat", "report"].includes(enemy.state),
  );
  return {
    visibleCount: visibleEnemies.length,
    nearbyCount: nearbyEnemies.length,
    visible: visibleEnemies.length > 0,
    nearby: nearbyEnemies.length > 0,
  };
}

function HasDangerousSoundNear(position) {
  return state.soundEvents.some(
    (event) =>
      ["gunshot", "explosion"].includes(event.kind) &&
      Distance(event, position) <= Math.max(18, event.radius * 0.55),
  );
}

function GetCivilianRouteDecision(route, civilian, routeCivilians) {
  const sample = GetRouteSample(route, civilian.routeDistance ?? 0);
  const lookAhead = GetRouteSample(route, (civilian.routeDistance ?? 0) + 6);
  const escortRadius = route.behavior === "stagedEvacuation" ? 16 : 14;
  const escort = GetCivilianEscort(sample.position, escortRadius);
  const currentThreat = GetCivilianThreat(sample.position);
  const nextThreat = GetCivilianThreat(lookAhead.position);
  const threat = {
    visibleCount: Math.max(currentThreat.visibleCount, nextThreat.visibleCount),
    nearbyCount: Math.max(currentThreat.nearbyCount, nextThreat.nearbyCount),
    visible: currentThreat.visible || nextThreat.visible,
    nearby: currentThreat.nearby || nextThreat.nearby,
  };
  const combatNoise = HasDangerousSoundNear(sample.position);
  const safeWindow = !threat.visible && !threat.nearby && !combatNoise;
  let canMove = true;
  let reason = "moving";
  let speed = 1.45;

  if (route.behavior === "pauseAndYield") {
    const crossingUnit = state.units.some(
      (unit) => !["dead", "downed", "evacuated"].includes(unit.state) && Distance(unit, sample.position) <= 5.5,
    );
    canMove = safeWindow && !crossingUnit;
    reason = threat.visible ? "enemySight" : threat.nearby ? "patrolNear" : combatNoise ? "combatNoise" : crossingUnit ? "yielding" : "moving";
    speed = 1.25;
  } else if (route.behavior === "followSafeWindows") {
    canMove = escort.present && safeWindow;
    reason = !escort.present ? "needsEscort" : threat.visible ? "enemySight" : threat.nearby ? "patrolNear" : combatNoise ? "combatNoise" : "moving";
    speed = 1.2 + escort.strength * 0.16;
  } else if (route.behavior === "waitAtCover") {
    canMove = civilian.segmentCommitted || (escort.present && safeWindow);
    reason = civilian.segmentCommitted ? "reachingCover" : !escort.present ? "needsEscort" : threat.visible ? "enemySight" : threat.nearby ? "patrolNear" : combatNoise ? "combatNoise" : "moving";
    speed = 1.34 + escort.strength * 0.12;
  } else if (route.behavior === "stagedEvacuation") {
    const previousGroup = routeCivilians.find((candidate) => candidate.stageIndex === civilian.stageIndex - 1);
    const previousGroupClear =
      !previousGroup ||
      previousGroup.state === "evacuated" ||
      (previousGroup.routeDistance ?? 0) >= lookAhead.totalDistance * 0.38;
    canMove = previousGroupClear && escort.present && safeWindow;
    reason = !previousGroupClear ? "staging" : !escort.present ? "needsEscort" : threat.visible ? "enemySight" : threat.nearby ? "patrolNear" : combatNoise ? "combatNoise" : "moving";
    speed = 1.18 + escort.strength * 0.14;
  } else if (route.behavior === "leaveRoadOnAlarm") {
    canMove = !threat.visible;
    reason = threat.visible ? "enemySight" : "moving";
    speed = state.alertLevel > 0 ? 2.1 : 1.3;
  }

  return { canMove, reason, speed, sample, escort, threat, combatNoise, safeWindow };
}

function RecordCivilianExposure(route, routeState, civilian, decision, deltaTime) {
  const exposed =
    decision.threat.visible ||
    decision.combatNoise ||
    (decision.threat.nearby && (decision.canMove || !decision.escort.present)) ||
    (civilian.segmentCommitted && !decision.escort.present);
  if (!exposed) return false;
  const exposureRate = decision.threat.visible ? 1.5 : decision.combatNoise ? 2 : 1;
  civilian.exposureSeconds = (civilian.exposureSeconds ?? 0) + deltaTime * exposureRate;
  routeState.exposureSeconds = (routeState.exposureSeconds ?? 0) + deltaTime;
  const riskMilestone = Math.min(3, Math.floor(civilian.exposureSeconds / 4));
  const previousMilestone = civilian.riskMilestone ?? 0;
  let changed = false;
  if (riskMilestone > previousMilestone) {
    const cost = (riskMilestone - previousMilestone) * civilian.groupSize;
    state.operationRuntime.civilianCostLedger.risk += cost;
    civilian.riskMilestone = riskMilestone;
    routeState.riskRecorded = (routeState.riskRecorded ?? 0) + cost;
    PushMessage("alert", `${route.name}暴露在巡逻视线或交火声场中，群众风险 +${cost}。`);
    changed = true;
  }
  if (civilian.exposureSeconds >= 10 && !civilian.displacementRecorded) {
    state.operationRuntime.civilianCostLedger.displacement += civilian.groupSize;
    civilian.displacementRecorded = true;
    routeState.displacementRecorded = (routeState.displacementRecorded ?? 0) + civilian.groupSize;
    PushMessage("alert", `${route.name}被迫偏离原定隐蔽路线，流离 ${civilian.groupSize} 已记入代价账本。`);
    changed = true;
  }
  return changed;
}

function ReportCivilianRouteDecision(route, routeState, decision) {
  if (routeState.lastDecisionReason === decision.reason) return;
  if (state.time - (routeState.lastDecisionMessageAt ?? -10) < 4) return;
  routeState.lastDecisionReason = decision.reason;
  routeState.lastDecisionMessageAt = state.time;
  const messages = {
    moving: `${route.name}获得护送与安全窗口，继续移动。`,
    needsEscort: `${route.name}停在隐蔽处等待；至少一名队员需要保持在 14 米护送范围内。`,
    enemySight: `${route.name}前方进入敌军视线，暂缓通过。`,
    patrolNear: `${route.name}前方巡逻过近，等待巡逻窗口。`,
    combatNoise: `${route.name}附近出现枪声或爆炸，群众停止移动。`,
    yielding: `${route.name}正在给行动组让路。`,
    staging: `${route.name}按组次等待，前一组尚未离开危险段。`,
    reachingCover: `${route.name}已经离开掩体，正在赶往下一处遮蔽点。`,
  };
  if (messages[decision.reason]) PushMessage(decision.reason === "moving" ? "brief" : "alert", messages[decision.reason]);
}

function SpawnCivilianRouteGroups(route) {
  const representativeCount = route.behavior === "stagedEvacuation"
    ? Math.min(3, route.groupSize)
    : Math.min(4, Math.max(1, Math.ceil(route.groupSize / 3)));
  const baseGroupSize = Math.floor(route.groupSize / representativeCount);
  const remainder = route.groupSize % representativeCount;
  const first = route.points[0];
  for (let index = 0; index < representativeCount; index += 1) {
    state.civilians.push({
      id: `${route.id}_${index}`,
      routeId: route.id,
      groupSize: baseGroupSize + (index < remainder ? 1 : 0),
      stageIndex: index,
      departureDelay: route.behavior === "stagedEvacuation" ? index * 10 : index * 0.4,
      routeDistance: 0,
      formationOffset: (index - (representativeCount - 1) * 0.5) * 0.72,
      segmentCommitted: false,
      exposureSeconds: 0,
      x: first.x - index * 0.72,
      z: first.z + index * 0.46,
      facing: 0,
      stance: "crouch",
      state: "waiting",
      suppression: 0,
      health: 1,
      maximumHealth: 1,
    });
  }
}

function UpdateCivilianRoutes(deltaTime) {
  const layout = GetOperationLayout(state.operationLayoutId);
  if (!layout || !state.operationRuntime) return;
  let runtimeChanged = false;
  state.operationClockAccumulator = (state.operationClockAccumulator ?? 0) + deltaTime;
  if (state.operationClockAccumulator >= 0.1) {
    state.operationRuntime = AdvanceOperationClock(
      state.operationRuntime,
      state.operationClockAccumulator,
    );
    state.operationClockAccumulator = 0;
    runtimeChanged = true;
  }

  for (const route of layout.civilianRoutes) {
    const routeState = state.civilianRoutes[route.id];
    if (!routeState || routeState.completed) continue;
    const scheduledStart = Number.isFinite(route.scheduleSeconds) && state.time >= route.scheduleSeconds;
    const flagStart = route.startsByFlag && state.operationRuntime.flags[route.startsByFlag];
    const alarmStart = route.behavior === "leaveRoadOnAlarm" && state.alertLevel > 0;
    if ((scheduledStart || flagStart || alarmStart) && !state.operationRuntime.activeCivilianRoutes.includes(route.id)) {
      state.operationRuntime.activeCivilianRoutes.push(route.id);
      runtimeChanged = true;
    }
    routeState.active = state.operationRuntime.activeCivilianRoutes.includes(route.id);
    if (!routeState.active) continue;
    routeState.activeSeconds = (routeState.activeSeconds ?? 0) + deltaTime;

    if (!state.civilians.some((civilian) => civilian.routeId === route.id)) {
      SpawnCivilianRouteGroups(route);
    }

    const routeCivilians = state.civilians.filter((civilian) => civilian.routeId === route.id);
    for (const civilian of routeCivilians) {
      if (["harmed", "evacuated"].includes(civilian.state)) continue;
      const decision = GetCivilianRouteDecision(route, civilian, routeCivilians);
      ReportCivilianRouteDecision(route, routeState, decision);
      if (RecordCivilianExposure(route, routeState, civilian, decision, deltaTime)) runtimeChanged = true;
      if ((routeState.activeSeconds ?? 0) < civilian.departureDelay) {
        civilian.state = "waiting";
        continue;
      }
      if (!decision.canMove) {
        civilian.state = decision.threat.visible ? "exposed" : "waiting";
        continue;
      }

      civilian.state = "moving";
      if (route.behavior === "waitAtCover" && !civilian.segmentCommitted) civilian.segmentCommitted = true;
      const maximumDistance = route.behavior === "waitAtCover"
        ? decision.sample.nextWaypointDistance
        : decision.sample.totalDistance;
      civilian.routeDistance = Math.min(
        maximumDistance,
        (civilian.routeDistance ?? 0) + decision.speed * deltaTime,
      );
      let nextSample = GetRouteSample(route, civilian.routeDistance);
      if (
        route.behavior === "waitAtCover" &&
        civilian.routeDistance >= decision.sample.nextWaypointDistance - 0.01
      ) {
        civilian.segmentCommitted = false;
        civilian.state = "waiting";
      }
      civilian.x = nextSample.position.x + Math.cos(nextSample.facing) * civilian.formationOffset;
      civilian.z = nextSample.position.z - Math.sin(nextSample.facing) * civilian.formationOffset;
      civilian.facing = nextSample.facing;
      routeState.progressDistance = Math.max(routeState.progressDistance ?? 0, civilian.routeDistance);
      routeState.pointIndex = Math.max(routeState.pointIndex ?? 0, nextSample.segmentIndex);
      if (nextSample.finished) civilian.state = "evacuated";
    }

    const routeSettled = routeCivilians.every((civilian) => ["harmed", "evacuated"].includes(civilian.state));
    if (!routeSettled) continue;

    routeState.completed = true;
    if (!routeState.failed) {
      const routeResult = CompleteCivilianRoute(state.operationRuntime, route.id);
      if (routeResult.ok) {
        state.operationRuntime = routeResult.state;
        runtimeChanged = true;
      }
    }
  }
  if (runtimeChanged) SyncOperationRuntimeToState(state.operationRuntime);
}

function ConsumeEmergencyNoiseEvents(previousRuntime, nextRuntime, position) {
  const previousCount = previousRuntime?.emergencyNoiseEvents?.length ?? 0;
  const newNoiseEvents = (nextRuntime?.emergencyNoiseEvents ?? []).slice(previousCount);
  for (const noiseEvent of newNoiseEvents) {
    state.soundEvents.push(
      CreateSoundEvent(
        position,
        noiseEvent.radius,
        noiseEvent.kind,
        noiseEvent.actorId ?? "emergencyWork",
        state.time,
      ),
    );
    world?.SpawnRing(position, 0xd79d64, noiseEvent.radius, 0.78);
    const actor = state.units.find((unit) => unit.id === noiseEvent.actorId);
    PushMessage(
      "alert",
      `${actor?.name ?? "队员"}缺少对应专长，只能临时处置；额外作业声已经传出 ${Math.round(noiseEvent.radius)} 米。`,
    );
  }
  if (state.soundEvents.length > 64) state.soundEvents.splice(0, state.soundEvents.length - 64);
}

function CompleteAuthoredOperationInteraction(unit, interactable, isExplosive) {
  if (!state.operationRuntime) return false;
  const runtime = state.interactables[interactable.id];
  if (runtime?.droppedAt) {
    const previousRuntime = state.operationRuntime;
    const recovered = PickUpDroppedOperationItem(state.operationRuntime, interactable.id, unit.id);
    if (!recovered.ok) {
      ShowToast(`${interactable.name}暂时无法重新拾取。`);
      return true;
    }
    state.operationRuntime = recovered.state;
    runtime.completed = true;
    runtime.progress = 1;
    runtime.droppedAt = null;
    CarryItem(unit, interactable.id);
    state.objectives[interactable.id] = true;
    SyncOperationRuntimeToState(state.operationRuntime);
    TriggerRuntimeStorylets(previousRuntime, state.operationRuntime);
    PushMessage("objective", `${unit.name}重新取回了${interactable.name}。`);
    return true;
  }

  const interaction = GetAvailableInteractionForInteractable(
    state.operationRuntime,
    interactable.id,
    unit.id,
  );
  if (!interaction) {
    const availableForAnotherRole = GetAvailableInteractionForInteractable(
      state.operationRuntime,
      interactable.id,
      null,
    );
    ShowToast(
      availableForAnotherRole?.allowedRoles
        ? `${interactable.name}需要合适的队员执行，或尚未满足安全条件。`
        : `${interactable.name}当前没有可执行的行动。`,
      true,
    );
    return true;
  }

  const previousRuntime = state.operationRuntime;
  const resolved = ResolveOperationInteraction(
    state.operationRuntime,
    interaction.id,
    unit.id,
  );
  if (!resolved.ok) {
    ShowToast(`${interactable.name}未能完成：${resolved.reason}`);
    return true;
  }

  // Interactable storylets describe the choice at the moment it is made. In particular,
  // the quarry warning must read the pre-effect safety state, before a rockfall writes harm.
  TriggerFieldStorylets(`interactable:${interactable.id}`);
  state.operationRuntime = resolved.state;
  runtime.completed = true;
  runtime.progress = 1;
  runtime.droppedAt = null;
  for (const itemId of interaction.effects.startCarryItems ?? []) {
    CarryItem(unit, itemId);
    // This means "secured by a living carrier" for extraction gating. Final settlement only
    // occurs in ExtractOperationCarrier; dropping or losing the carrier clears it again.
    state.objectives[itemId] = true;
    TriggerFieldStorylets(`objective:${itemId}`);
  }
  SyncOperationRuntimeToState(state.operationRuntime);
  ConsumeEmergencyNoiseEvents(previousRuntime, state.operationRuntime, interactable);
  TriggerRuntimeStorylets(previousRuntime, state.operationRuntime);

  const isRockfall = interaction.id === "triggerSafeRockfall" || interaction.id === "triggerUnsafeRockfall";
  if (isRockfall) {
    world?.SpawnExplosion(interactable, true);
    EmitSound(interactable, 65, "explosion");
    ApplyExplosionConsequences(interactable, 13);
    state.alertLevel = Math.max(state.alertLevel, 2);
  } else if (interaction.id === "releaseOreCarts") {
    EmitSound(interactable, 48, "metal");
    state.alertLevel = Math.max(state.alertLevel, 1);
  } else if (
    interaction.effects.disableLighting?.length ||
    interaction.effects.disableReinforcements?.length
  ) {
    EmitSound(interactable, 8, "metal");
  }

  if (isExplosive) {
    state.alertLevel = 3;
    state.alarmState = "explosion";
    state.ledger.alarmsRaised += 1;
    world?.SpawnExplosion(interactable, true);
    EmitSound(interactable, 78, "explosion");
    if (!isRockfall) ApplyExplosionConsequences(interactable, 12);
  }

  audio.Play(isExplosive || isRockfall ? "explosion" : interactable.kind === "objective" ? "objective" : "interaction");
  TriggerCombatFeedback("objective", 0.3, `${interactable.name}：完成`);
  ShowToast(`${interactable.name}：已完成。`);
  CheckPhase();
  return true;
}

function CompleteInteraction(unit, interactable, isExplosive = false) {
  const runtime = state.interactables[interactable.id];
  if (!runtime || runtime.completed) return;
  if (CompleteAuthoredOperationInteraction(unit, interactable, isExplosive)) return;
  runtime.completed = true;
  runtime.progress = 1;
  runtime.droppedAt = null;
  audio.Play(isExplosive ? "explosion" : interactable.kind === "objective" ? "objective" : "interaction");
  if (!isExplosive) TriggerCombatFeedback("objective", 0.3, `${interactable.name}：完成`);

  if (interactable.id === "relay") {
    state.objectives.relay = true;
    if (state.reinforcementTimer !== null) {
      state.reinforcementTimer = Math.max(state.reinforcementTimer, simulationConfig.reinforcementCutlineSeconds);
    }
    PushMessage("objective", isExplosive ? "交换机被炸毁，附近哨位已被惊动。" : "进出线已剪断，敌人只能派人传令。");
  } else if (interactable.id === "ledger") {
    state.objectives.ledger = true;
    CarryItem(unit, "ledger");
    PushMessage("objective", "已取得换防传令簿与电话线路图，情报会随时间失效。");
  } else if (interactable.id === "medicines") {
    state.objectives.medicines = true;
    CarryItem(unit, "medicines");
    PushMessage("objective", "救护药箱已收回；携带者移动稍慢。");
  } else if (interactable.id === "radioParts") {
    state.objectives.radioParts = true;
    CarryItem(unit, "radioParts");
    PushMessage("objective", "收报机零件包已入手，回营后可检修设备。");
  } else if (interactable.id === "tools") {
    state.objectives.tools = true;
    CarryItem(unit, "tools");
    PushMessage("objective", "工具卷已收回。");
  } else if (interactable.id === "detainee") {
    state.objectives.detainee = true;
    const reeds = state.extractionZones.find((zone) => zone.id === "reeds");
    if (reeds) reeds.unlocked = true;
    PushMessage("objective", "交通员已解开绑绳，并指出北侧芦苇渡口。");
  } else if (interactable.id === "generator") {
    state.environment.generatorDisabled = true;
    state.objectives.generator = true;
    PushMessage("brief", "小汽油机停下了，北墙暗了些；哨兵会来查看。");
    EmitSound(interactable, 8, "metal");
  } else if (interactable.id === "alarmBell") {
    state.environment.alarmBellDisabled = true;
    state.objectives.alarmBell = true;
    PushMessage("brief", "院内铃索已断，近处哨兵仍能用呼喊报警。");
  } else if (interactable.id === "rockfall") {
    state.environment.eastRoadBlocked = true;
    state.objectives.rockfall = true;
    state.environment.dustCloud = { x: interactable.x, z: interactable.z, radius: 13, remaining: 14 };
    state.alertLevel = Math.max(state.alertLevel, 1);
    world?.SpawnExplosion(interactable, true);
    EmitSound(interactable, 65, "explosion");
    ApplyExplosionConsequences(interactable, 13);
    PushMessage("alert", "采石坡落石封住东公路，车辆增援被迫停下。");
  } else if (interactable.id === "seedGrain") {
    state.objectives.seedGrain = true;
    PushMessage("objective", "种粮已留还村里；它不会进入营地物资栏。");
  }

  if (isExplosive) {
    const wasFullAlarm = state.alertLevel >= 3;
    state.alertLevel = 3;
    state.alarmState = "explosion";
    if (!wasFullAlarm) state.ledger.alarmsRaised += 1;
    const reinforcementDelay =
      state.objectives.relay || state.environment.eastRoadBlocked
        ? simulationConfig.reinforcementCutlineSeconds
        : simulationConfig.reinforcementSeconds;
    state.reinforcementTimer =
      state.reinforcementTimer === null
        ? reinforcementDelay
        : Math.min(state.reinforcementTimer, reinforcementDelay);
    world?.SpawnExplosion(interactable, true);
    EmitSound(interactable, 78, "explosion");
    if (interactable.id !== "rockfall") ApplyExplosionConsequences(interactable, 12);
    PushMessage(
      "alert",
      state.objectives.relay || state.environment.eastRoadBlocked
        ? "爆炸触发全区警报；电话或东路受阻，增援改由步行集结。"
        : "爆炸触发全区警报，东公路增援已经出动。",
    );
  }

  ShowToast(`${interactable.name}：已完成。`);
  CheckPhase();
}

function ProcessMoveCommand(unit, command, deltaTime) {
  unit.hidden = IsUnitHidden(unit);
  const stalled = (command.stallTime ?? 0) > 0.9;
  if (!command.waypoints || stalled) {
    command.waypoints = FindPath2D(unit, command, {
      clearance: 0.68,
      obstacles: GetNavigationObstacles(),
      bounds: GetActiveMissionDefinition().bounds,
    });
    command.waypointIndex = 0;
    command.stallTime = 0;
    command.replanCount = stalled ? (command.replanCount ?? 0) + 1 : 0;
    if (command.waypoints.length === 0 || command.replanCount > 3) {
      PushMessage("brief", `${unit.name}找不到可行路线，移动指令已取消。`);
      unit.command = null;
      return;
    }
  }
  const waypoint = command.waypoints[Math.min(command.waypointIndex ?? 0, command.waypoints.length - 1)];
  const previousX = unit.x;
  const previousZ = unit.z;
  const reachedWaypoint = MoveActor(unit, waypoint, GetMovementSpeed(unit), deltaTime);
  const movedDistance = Math.hypot(unit.x - previousX, unit.z - previousZ);
  command.stallTime = movedDistance < 0.001 ? (command.stallTime ?? 0) + deltaTime : 0;
  if (reachedWaypoint) command.waypointIndex = (command.waypointIndex ?? 0) + 1;
  const reached = command.waypointIndex >= command.waypoints.length;
  unit.footstepTimer = (unit.footstepTimer ?? 0) - deltaTime;
  if (!reached && unit.footstepTimer <= 0) {
    unit.footstepTimer = unit.stance === "sprint" ? 0.38 : unit.stance === "crouch" ? 0.88 : 0.62;
    const currentZone = GetActiveMissionDefinition().zones.find((zone) => PointInsideBox(unit, zone));
    const authoredSoundMask = currentZone && state.environment.soundMasks?.includes(currentZone.id) ? 0.55 : 1;
    const radius = GetSoundRadius(unit) * authoredSoundMask;
    state.soundEvents.push(CreateSoundEvent(unit, radius, "footstep", unit.id, state.time));
    if (state.soundEvents.length > 64) state.soundEvents.shift();
    if (unit.stance === "sprint") world?.SpawnRing(unit, 0xc1b47d, radius, 0.54);
    audio.Play("footstep");
  }
  if (reached) unit.command = null;
}

function ProcessInteractCommand(unit, command, deltaTime, explosive = false) {
  if (unit.state === "wounded") {
    PushMessage("brief", `${unit.name}伤势已稳定，只能缓慢撤离。`);
    unit.command = null;
    return;
  }
  const definition = GetInteractable(command.targetId);
  const runtime = state.interactables[command.targetId];
  if (!definition || !runtime || runtime.completed) {
    unit.command = null;
    return;
  }
  const authoredInteraction = state.operationRuntime
    ? GetAvailableInteractionForInteractable(state.operationRuntime, definition.id, unit.id)
    : null;
  if (state.operationRuntime && !runtime.droppedAt && !authoredInteraction) {
    PushMessage("brief", `${unit.name}当前无法执行${definition.name}，请先满足条件或换合适队员。`);
    unit.command = null;
    return;
  }
  if (Distance(unit, definition) > definition.radius + 0.45) {
    PushMessage("brief", `${unit.name}无法够到${definition.name}，指令已中止。`);
    unit.command = null;
    return;
  }
  if (command.abilityId && !command.resourceCommitted) {
    const ability = GetCharacterDefinition(unit.id)?.abilities.find((candidate) => candidate.id === command.abilityId);
    if (!ability || (unit.cooldowns[command.abilityId] ?? 0) > 0) {
      PushMessage("brief", `${unit.name}无法执行${command.label}，指令已中止。`);
      unit.command = null;
      return;
    }
    if (ability.charges && (unit.charges[command.abilityId] ?? 0) <= 0) {
      PushMessage("brief", `${unit.name}缺少执行${command.label}的携行物。`);
      unit.command = null;
      return;
    }
    if (ability.charges) unit.charges[command.abilityId] -= 1;
    unit.cooldowns[command.abilityId] = ability.cooldown;
    command.resourceCommitted = true;
  }
  unit.facing = Math.atan2(definition.x - unit.x, definition.z - unit.z);
  const specialistScale =
    definition.action === "sabotage" && unit.id !== "hanShilei"
      ? 1.75
      : definition.action === "rescue" && unit.id !== "luLanzhi"
        ? 1.22
        : 1;
  const duration = explosive ? 3.8 : (authoredInteraction?.duration ?? definition.duration) * specialistScale;
  command.progress = (command.progress ?? 0) + deltaTime;
  runtime.progress = Clamp(command.progress / duration, 0, 1);
  if (command.progress >= duration) {
    CompleteInteraction(unit, definition, explosive);
    unit.command = null;
  }
}

function ProcessBuddyRescueCommand(unit, command) {
  if (command.resolved) {
    unit.command = null;
    return;
  }
  command.resolved = true;
  const result = ApplyBuddyRescue(state, unit.id, command.targetId);
  if (!result.success) {
    PushMessage("brief", `${unit.name}失去应急止血条件，指令已取消。`);
    unit.command = null;
    return;
  }
  const patient = state.units.find((candidate) => candidate.id === result.patientId);
  world?.SpawnRing(patient, 0x8bc5ad, 3.2, 0.48);
  PushMessage(
    "objective",
    `${unit.name}为${patient.name}完成应急止血，争取到 ${Math.ceil(result.bleedingSeconds)} 秒；仍需卫生员稳定伤势。`,
  );
  audio.Play("objective");
  unit.command = null;
}

function ProcessAbilityCommand(unit, command) {
  const result = ApplyAbilityCommand(state, unit.id, command);
  if (!result.success) {
    PushMessage("brief", `${unit.name}无法执行${command.label}，指令已中止。`);
    unit.command = null;
    return;
  }
  if (result.action === "observe") {
    const enemy = state.enemies.find((candidate) => candidate.id === result.targetId);
    PushMessage("brief", `秦素秋：记下了${GetEnemyRoleDefinition(enemy.role).name}下一段巡逻。`);
    world?.FocusPosition(enemy, 34);
    audio.Play("objective");
  } else if (result.action === "stone") {
    world?.SpawnRing(result.position, 0xd3bc77, 14, 0.72);
    audio.Play("stone");
    PushMessage("brief", "石块落地，附近巡逻只会调查声源，不会知道投掷者位置。");
  } else if (result.action === "aid") {
    const patient = state.units.find((candidate) => candidate.id === result.targetId);
    PushMessage("objective", `吕兰枝稳定了${patient.name}的伤势；这不等于痊愈。`);
    audio.Play("objective");
  } else if (result.action === "steady") {
    PushMessage("brief", "吕兰枝：看着掩体，别跟枪声走。");
    audio.Play("command");
  } else if (result.action === "suppress") {
    for (const enemyId of result.affectedEnemyIds) {
      const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
      if (enemy) world?.SpawnTracer(unit, enemy, 0xffc16d);
    }
    world?.SpawnRing(unit, 0xd57959, 58, 0.72);
    audio.Play("gunshot");
    PushMessage("combat", "魏守义：左墙压住，右边现在走。");
  } else if (result.action === "overwatch") {
    const ally = state.units.find((candidate) => candidate.id === result.targetId);
    PushMessage("brief", `魏守义与${ally.name}建立交叉警戒。`);
    audio.Play("command");
  }
  unit.command = null;
}

function ProcessAttackCommand(unit, command, deltaTime) {
  if (unit.state === "wounded") {
    unit.command = null;
    return;
  }
  const enemy = state.enemies.find((candidate) => candidate.id === command.targetId);
  if (!enemy || enemy.disabled || enemy.health <= 0) {
    unit.command = null;
    return;
  }
  if (Distance(unit, enemy) > 23) {
    unit.command = null;
    PushMessage("brief", `${unit.name}失去射线，射击指令取消。`);
    return;
  }
  unit.facing = Math.atan2(enemy.x - unit.x, enemy.z - unit.z);
  unit.shotCooldown -= deltaTime;
  command.aim = (command.aim ?? 0) + deltaTime;
  if (command.aim >= 0.38 && unit.shotCooldown <= 0) {
    const hasClearShot = HasLineOfSight(unit, enemy);
    FireUnitAtEnemy(unit, enemy, false);
    if (!hasClearShot || enemy.disabled || unit.ammo <= 0) unit.command = null;
  }
}

function CanSilentTakedown(unit, enemy) {
  if (!unit || !enemy || enemy.disabled || enemy.health <= 0 || unit.state !== "ready" || unit.stance !== "crouch") return false;
  if (Distance(unit, enemy) > 2.5 || enemy.awareness >= simulationConfig.awarenessInvestigate) return false;
  const directionToUnit = Math.atan2(unit.x - enemy.x, unit.z - enemy.z);
  return Math.abs(NormalizeAngle(directionToUnit - enemy.facing)) > Math.PI * 0.62;
}

function ProcessTakedownCommand(unit, command, deltaTime) {
  const enemy = state.enemies.find((candidate) => candidate.id === command.targetId);
  if (!enemy || !CanSilentTakedown(unit, enemy)) {
    PushMessage("brief", `${unit.name}失去静默制服窗口，指令取消。`);
    unit.command = null;
    return;
  }
  command.progress = (command.progress ?? 0) + deltaTime;
  unit.facing = Math.atan2(enemy.x - unit.x, enemy.z - unit.z);
  if (command.progress < 1.15) return;
  enemy.health = 0;
  enemy.disabled = true;
  enemy.state = "disabled";
  enemy.bodyHidden = false;
  state.ledger.enemiesDisabled += 1;
  EmitSound(enemy, 3.2, "body");
  world?.SpawnImpact?.(enemy, "takedown");
  ShowCombatCue("目标已静默控制", "objective");
  PushMessage("combat", `${unit.name}从背后静默制服了${GetEnemyRoleDefinition(enemy.role).name}；尸体若留在路上仍会暴露行动。`);
  audio.Play("interaction");
  unit.command = null;
}

function ProcessHideBodyCommand(unit, command, deltaTime) {
  const enemy = state.enemies.find((candidate) => candidate.id === command.targetId);
  if (!enemy || !enemy.disabled || enemy.bodyHidden || Distance(unit, enemy) > 2.7) {
    PushMessage("brief", `${unit.name}无法继续隐蔽这名失能敌人。`);
    unit.command = null;
    return;
  }
  command.progress = (command.progress ?? 0) + deltaTime;
  if (command.progress < 2.4) return;
  enemy.bodyHidden = true;
  PushMessage("brief", `${unit.name}把失能敌人拖入了附近遮蔽处。`);
  audio.Play("interaction");
  unit.command = null;
}

function ProcessUnit(unit, deltaTime) {
  for (const key of Object.keys(unit.cooldowns)) unit.cooldowns[key] = Math.max(0, unit.cooldowns[key] - deltaTime);
  unit.shotCooldown = Math.max(0, unit.shotCooldown - deltaTime);
  unit.suppression = Math.max(
    0,
    unit.suppression -
      deltaTime *
        (unit.id === "weiShouyi" ? 15 : 11) *
        (unit.suppressionRecoveryMultiplier ?? 1),
  );
  unit.overwatchTimer = Math.max(0, (unit.overwatchTimer ?? 0) - deltaTime);
  if (unit.state === "downed") {
    if (!unit.stabilized) unit.downedTimer -= deltaTime;
    if (unit.downedTimer <= 0) {
      unit.state = "dead";
      DropCarriedItems(unit);
      PushMessage("alert", `${unit.name}没能撤下来。`);
    }
    return;
  }
  if (unit.state === "dead" || unit.state === "evacuated") return;
  if (unit.suppression >= 100) unit.stance = "crouch";
  if (!unit.command && unit.queue.length > 0) unit.command = unit.queue.shift();
  if (!unit.command) {
    unit.hidden = IsUnitHidden(unit);
    if (unit.overwatchTimer > 0 && unit.ammo > 0) {
      const enemy = state.enemies.find(
        (candidate) => !candidate.disabled && candidate.health > 0 && Distance(unit, candidate) <= 18 && HasLineOfSight(unit, candidate),
      );
      if (enemy) {
        FireUnitAtEnemy(unit, enemy, false);
        unit.overwatchTimer = 0;
      }
    }
    return;
  }
  if (unit.command.kind === "move") ProcessMoveCommand(unit, unit.command, deltaTime);
  else if (unit.command.kind === "interact") ProcessInteractCommand(unit, unit.command, deltaTime, false);
  else if (unit.command.kind === "charge") ProcessInteractCommand(unit, unit.command, deltaTime, true);
  else if (unit.command.kind === "attack") ProcessAttackCommand(unit, unit.command, deltaTime);
  else if (unit.command.kind === "takedown") ProcessTakedownCommand(unit, unit.command, deltaTime);
  else if (unit.command.kind === "hideBody") ProcessHideBodyCommand(unit, unit.command, deltaTime);
  else if (unit.command.kind === "buddyRescue") ProcessBuddyRescueCommand(unit, unit.command);
  else if (["observe", "stone", "aid", "steady", "suppress", "overwatch"].includes(unit.command.kind)) {
    ProcessAbilityCommand(unit, unit.command);
  }
  else unit.command = null;
}

function CheckPhase() {
  const requiredActions = state.mainObjectiveIds.filter((objectiveId) => objectiveId !== "allExtracted");
  if (requiredActions.every((objectiveId) => state.objectives[objectiveId])) state.phase = "breakcontact";
  else if (state.alertLevel >= 2) state.phase = "contested";
  else if (requiredActions.some((objectiveId) => state.objectives[objectiveId])) state.phase = "objective";
  else if (state.time >= 240) state.phase = "infiltration";
  else state.phase = "recon";
}

function StepSimulation(deltaTime) {
  state.time += deltaTime;
  state.soundEvents = state.soundEvents.filter((event) => state.time - event.createdAt <= 2.5).slice(-64);
  for (const enemy of state.enemies) {
    enemy.revealedTimer = Math.max(0, (enemy.revealedTimer ?? 0) - deltaTime);
  }
  if (state.environment.dustCloud) {
    state.environment.dustCloud.remaining = Math.max(0, state.environment.dustCloud.remaining - deltaTime);
    if (state.environment.dustCloud.remaining <= 0) state.environment.dustCloud = null;
  }
  UpdateCivilianRoutes(deltaTime);
  for (const unit of state.units) {
    unit.inLight = IsPositionLit(unit, state.environment, GetActiveMissionDefinition().lightingZones);
    unit.inDust = Boolean(
      state.environment.dustCloud &&
      Distance(unit, state.environment.dustCloud) <= state.environment.dustCloud.radius,
    );
  }
  for (const definition of GetActiveMissionDefinition().interactables) {
    const runtime = state.interactables[definition.id];
    if (!runtime || runtime.discovered) continue;
    const discovered = state.units.some(
      (unit) =>
        !["dead", "evacuated"].includes(unit.state) &&
        (Distance(unit, definition) <= 7 || (Distance(unit, definition) <= 15 && HasLineOfSight(unit, definition))),
    );
    if (discovered) {
      runtime.discovered = true;
      PushMessage("brief", `发现：${definition.name}。`);
    }
  }
  for (const unit of state.units) ProcessUnit(unit, deltaTime);
  const activeLayout = GetOperationLayout(state.operationLayoutId);
  for (const zone of activeLayout?.zones ?? []) {
    if (
      state.units.some(
        (unit) =>
          unit.state !== "dead" &&
          PointInsideBox(unit, zone),
      )
    ) {
      TriggerFieldStorylets(`enterZone:${zone.id}`);
    }
  }
  aiAccumulator += deltaTime;
  while (aiAccumulator >= simulationConfig.aiStep) {
    UpdateEnemySquad(state, simulationConfig.aiStep, { OnEnemyShot, OnReinforcement });
    aiAccumulator -= simulationConfig.aiStep;
  }
  UpdateEnemyIntel(state, deltaTime);
  CheckPhase();
  if (state.units.every((unit) => unit.state === "dead" || unit.state === "downed")) EndMission(false, "行动组失去行动能力");
}

function GetApproachPoint(unit, interactable) {
  const approachRadius = Math.max(0.9, interactable.radius * 0.86);
  let best = null;
  for (let index = 0; index < 32; index += 1) {
    const angle = (index / 32) * Math.PI * 2;
    const point = InMissionBounds({
      x: interactable.x + Math.cos(angle) * approachRadius,
      z: interactable.z + Math.sin(angle) * approachRadius,
    });
    if (PositionBlocked(point, 0.68)) continue;
    const waypoints = FindPath2D(unit, point, {
      clearance: 0.68,
      obstacles: GetNavigationObstacles(),
      bounds: GetActiveMissionDefinition().bounds,
    });
    if (waypoints.length === 0) continue;
    let routeLength = 0;
    let previous = unit;
    for (const waypoint of waypoints) {
      routeLength += Distance(previous, waypoint);
      previous = waypoint;
    }
    const exposurePenalty = GetZoneAt(point)?.kind === "open" ? 4 : 0;
    const score = routeLength + exposurePenalty;
    if (!best || score < best.score) best = { ...point, score };
  }
  return best ? { x: best.x, z: best.z } : null;
}

function QueueMoveForSelected(position, append = false) {
  if (!position) return;
  const bounded = InMissionBounds(position);
  if (PositionBlocked(bounded, 0.3)) {
    ShowToast("那里被墙体或建筑挡住了。");
    return;
  }
  let queued = 0;
  const failedUnitNames = [];
  state.selectedUnitIds.forEach((unitId, index) => {
    const unit = state.units.find((candidate) => candidate.id === unitId);
    const offset = state.selectedUnitIds.length > 1 ? { x: (index % 2) * 1.4, z: Math.floor(index / 2) * 1.4 } : { x: 0, z: 0 };
    if (
      QueueCommand(
        state,
        unitId,
        { kind: "move", x: bounded.x + offset.x, z: bounded.z + offset.z, label: "移动" },
        append,
      )
    ) queued += 1;
    else if (unit) failedUnitNames.push(unit.name);
  });
  if (queued > 0) {
    RequestInteractiveRender(0.7);
    audio.Play("command");
    world?.SpawnRing(bounded, 0x8bc5ad, 1.6, 0.35);
    if (!state.paused) PushMessage("brief", `${queued} 名队员收到移动指令。`);
    if (failedUnitNames.length > 0) {
      ShowToast(`${failedUnitNames.join("、")}的指令队列已满，未加入本次移动。`);
    }
  } else {
    ShowToast("指令队列已满，每人最多 4 条。");
  }
  RenderHud();
}

function QueueInteraction(interactableId, append = false, explosive = false, abilityId = null) {
  const interactable = GetInteractable(interactableId);
  const unit = GetSelectedUnit();
  const runtime = state.interactables[interactableId];
  if (!interactable || !unit || runtime?.completed) return;
  if (unit.state === "wounded") {
    ShowToast(`${unit.name}伤势已稳定，只能缓慢撤离。`);
    return;
  }
  if (
    state.operationRuntime &&
    !runtime?.droppedAt &&
    !GetAvailableInteractionForInteractable(state.operationRuntime, interactableId, unit.id)
  ) {
    ShowToast(`${interactable.name}需要先满足行动条件，或改由对应专长队员执行。`);
    return;
  }
  const queuedCommands = [];
  if (Distance(unit, interactable) > interactable.radius + 0.25) {
    const approach = GetApproachPoint(unit, interactable);
    if (!approach) {
      ShowToast(`无法找到接近${interactable.name}的安全路线。`);
      return;
    }
    queuedCommands.push({ kind: "move", ...approach, label: `接近${interactable.name}` });
  }
  queuedCommands.push({
    kind: explosive ? "charge" : "interact",
    targetId: interactableId,
    abilityId,
    label: `${explosive ? "放置破坏包" : "互动"}：${interactable.name}`,
  });
  const existingCount = append ? unit.queue.length + (unit.command ? 1 : 0) : 0;
  if (existingCount + queuedCommands.length > simulationConfig.maximumQueueLength) {
    ShowToast("指令队列空间不足；接近与互动必须作为完整计划加入。");
    return;
  }
  let first = true;
  for (const command of queuedCommands) {
    const didQueue = QueueCommand(state, unit.id, command, first ? append : true);
    if (!didQueue) {
      ShowToast("指令队列空间不足。");
      break;
    }
    first = false;
  }
  activeAbility = null;
  RequestInteractiveRender(0.7);
  audio.Play("command");
  RenderHud();
}

function QueueBuddyRescue(patientId, append = false) {
  const rescuer = GetSelectedUnit();
  const patient = state.units.find((unit) => unit.id === patientId);
  if (!rescuer || !patient || !CanBuddyRescue(state, rescuer.id, patient.id)) return false;
  const rescueAlreadyPlanned = [rescuer.command, ...rescuer.queue].some(
    (command) => command?.kind === "buddyRescue" && command.targetId === patient.id,
  );
  if (rescueAlreadyPlanned) {
    ShowToast(`${patient.name}的应急止血已经在计划中。`);
    return true;
  }
  const didQueue = QueueCommand(
    state,
    rescuer.id,
    { kind: "buddyRescue", targetId: patient.id, label: `应急止血：${patient.name}` },
    append,
  );
  if (!didQueue) {
    ShowToast("指令队列已满，无法加入应急止血。");
    return false;
  }
  activeAbility = null;
  RequestInteractiveRender(0.7);
  audio.Play("command");
  ShowToast(state.paused ? "应急止血已纳入计划；恢复行动后结算。" : "队员开始为伤员应急止血。");
  RenderHud();
  return true;
}

function QueueAttack(enemyId, append = false) {
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
  const unit = GetSelectedUnit();
  if (!enemy || !unit) return;
  if (unit.state === "wounded") {
    ShowToast(`${unit.name}只能缓慢撤离，不能继续战斗。`);
    return;
  }
  if (unit.ammo <= 0) {
    ShowToast(`${unit.name}没有弹药。`);
    return;
  }
  if (Distance(unit, enemy) > 23 || !HasLineOfSight(unit, enemy)) {
    ShowToast("当前没有可靠射线；先移动到侧翼或掩体。");
    return;
  }
  const didQueue = QueueCommand(
    state,
    unit.id,
    { kind: "attack", targetId: enemy.id, label: `射击${GetEnemyRoleDefinition(enemy.role).name}` },
    append,
  );
  if (!didQueue) {
    ShowToast("指令队列已满，无法加入射击。");
    return;
  }
  activeAbility = null;
  activeAbilityAppend = false;
  RequestInteractiveRender();
  audio.Play("command");
  RenderHud();
}

function QueueEnemyContextAction(enemyId, append = false) {
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
  const unit = GetSelectedUnit();
  if (!enemy || !unit) return;
  if (enemy.disabled) {
    if (enemy.bodyHidden) {
      ShowToast("这名失能敌人已经被移出巡逻视线。");
      return;
    }
    if (Distance(unit, enemy) > 2.7) {
      ShowToast("靠近失能敌人后可将其拖入遮蔽处。");
      return;
    }
    const didQueue = QueueCommand(
      state,
      unit.id,
      { kind: "hideBody", targetId: enemy.id, label: "隐蔽失能敌人" },
      append,
    );
    if (!didQueue) {
      ShowToast("指令队列已满，无法加入隐蔽行动。");
      return;
    }
    audio.Play("command");
    RenderHud();
    return;
  }
  if (CanSilentTakedown(unit, enemy)) {
    const didQueue = QueueCommand(
      state,
      unit.id,
      { kind: "takedown", targetId: enemy.id, label: `静默制服${GetEnemyRoleDefinition(enemy.role).name}` },
      append,
    );
    if (!didQueue) {
      ShowToast("指令队列已满，无法加入静默制服。");
      return;
    }
    audio.Play("command");
    ShowToast(state.paused ? "静默制服已纳入计划；恢复行动后执行。" : "静默制服指令已下达。");
    RenderHud();
    return;
  }
  QueueAttack(enemyId, append);
}

function FindNearestEnemy(unit, range = 24) {
  return state.enemies
    .filter((enemy) => !enemy.disabled && enemy.health > 0 && Distance(unit, enemy) <= range && HasLineOfSight(unit, enemy))
    .sort((left, right) => Distance(unit, left) - Distance(unit, right))[0] ?? null;
}

function QueueAbilityCommand(unit, command, append = false) {
  const didQueue = QueueCommand(state, unit.id, command, append);
  if (!didQueue) {
    ShowToast("当前无法加入这项行动。");
    return false;
  }
  activeAbility = null;
  activeAbilityAppend = false;
  RequestInteractiveRender(0.7);
  audio.Play("command");
  ShowToast(state.paused ? "能力已纳入计划；恢复行动后结算。" : "能力指令已下达。");
  RenderHud();
  return true;
}

function UseAbility(abilityId, append = false) {
  const unit = GetSelectedUnit();
  const character = GetCharacterDefinition(unit.id);
  const ability = character?.abilities.find((candidate) => candidate.id === abilityId);
  if (!ability || unit.state === "downed") return;
  if (unit.state === "wounded") {
    ShowToast(`${unit.name}的伤势已稳定，只能撤离。`);
    return;
  }
  if ((unit.cooldowns[abilityId] ?? 0) > 0) {
    ShowToast(`${ability.name}还需要 ${Math.ceil(unit.cooldowns[abilityId])} 秒。`);
    return;
  }
  if (ability.charges && (unit.charges[abilityId] ?? 0) <= 0) {
    ShowToast(`${ability.name}的携行物已经用完。`);
    return;
  }

  if (abilityId === "observe") {
    const enemy = FindNearestEnemy(unit, 26);
    if (!enemy) {
      ShowToast("视野内没有可持续观察的敌人。");
      return;
    }
    QueueAbilityCommand(unit, { kind: "observe", targetId: enemy.id, label: `记哨：${GetEnemyRoleDefinition(enemy.role).name}` }, append);
  } else if (abilityId === "stone") {
    activeAbility = "stone";
    activeAbilityAppend = append;
    ShowToast("在地图上选择落点。投石会制造一处带误差的声源。");
  } else if (abilityId === "sabotage") {
    const target = FindNearestInteractable(unit, (definition) => definition.action === "sabotage");
    if (target) QueueInteraction(target.id, append, false, "sabotage");
    else {
      activeAbility = "sabotage";
      activeAbilityAppend = append;
      ShowToast("选择交换机、发电机或铃索。");
    }
  } else if (abilityId === "charge") {
    activeAbility = "charge";
    activeAbilityAppend = append;
    ShowToast("选择可破坏设施。爆炸必然触发全区警报。");
  } else if (abilityId === "aid") {
    const patient = state.units
      .filter((candidate) => candidate.state === "downed" && Distance(unit, candidate) <= 6)
      .sort((left, right) => Distance(unit, left) - Distance(unit, right))[0];
    if (!patient) {
      ShowToast("6 米内没有倒地队员。");
      return;
    }
    QueueAbilityCommand(unit, { kind: "aid", targetId: patient.id, label: `压迫止血：${patient.name}` }, append);
  } else if (abilityId === "steady") {
    QueueAbilityCommand(unit, { kind: "steady", label: "稳住附近队员" }, append);
  } else if (abilityId === "suppress") {
    if (unit.ammo < 6) {
      ShowToast("至少需要 6 发弹药建立压制。");
      return;
    }
    activeAbility = "suppress";
    activeAbilityAppend = append;
    ShowToast("在地图上指定压制方向；它创造移动窗口，不保证击倒。");
  } else if (abilityId === "overwatch") {
    const ally = state.units
      .filter((candidate) => candidate.id !== unit.id && candidate.state === "ready" && Distance(unit, candidate) <= 9)
      .sort((left, right) => Distance(unit, left) - Distance(unit, right))[0];
    if (!ally) {
      ShowToast("需要 9 米内另一名可行动队员建立交叉警戒。");
      return;
    }
    QueueAbilityCommand(unit, { kind: "overwatch", targetId: ally.id, label: `交叉警戒：${ally.name}` }, append);
  }
  RenderHud();
}

function UseTargetedAbility(position, pickedInteractableId = null, append = false) {
  const unit = GetSelectedUnit();
  if (!activeAbility || !unit) return false;
  const shouldAppend = append || activeAbilityAppend;
  if (activeAbility === "stone" && position) {
    if (Distance(unit, position) > 16) {
      ShowToast("投石落点必须在 16 米以内。");
      return true;
    }
    QueueAbilityCommand(unit, { kind: "stone", x: position.x, z: position.z, label: "投石诱敌" }, shouldAppend);
    return true;
  }
  if (activeAbility === "suppress" && position) {
    if (Distance(unit, position) > 20) {
      ShowToast("压制方向必须落在 20 米以内。");
      return true;
    }
    QueueAbilityCommand(unit, { kind: "suppress", x: position.x, z: position.z, label: "定点压制" }, shouldAppend);
    return true;
  }
  if ((activeAbility === "charge" || activeAbility === "sabotage") && pickedInteractableId) {
    const definition = GetInteractable(pickedInteractableId);
    if (activeAbility === "sabotage" && definition?.action !== "sabotage") {
      ShowToast("这不是可静默破坏的设施。");
      return true;
    }
    if (activeAbility === "charge") {
      if (!definition || !["sabotage", "trigger"].includes(definition.action)) {
        ShowToast("破坏包只能用于军事设施或预先勘察的封路点，不能用于人员与物资。");
        return true;
      }
      if ((unit.charges.charge ?? 0) <= 0) {
        ShowToast("破坏包已经用完。");
        activeAbility = null;
        return true;
      }
    }
    QueueInteraction(pickedInteractableId, shouldAppend, activeAbility === "charge", activeAbility);
    return true;
  }
  return false;
}

function FindNearestInteractable(unit, predicate = () => true) {
  return GetActiveMissionDefinition().interactables
    .map((definition) => GetInteractable(definition.id))
    .filter((definition) => !state.interactables[definition.id]?.completed && predicate(definition))
    .sort((left, right) => Distance(unit, left) - Distance(unit, right))[0] ?? null;
}

function GetNearbyInteractable(unit) {
  return (
    GetActiveMissionDefinition().interactables
      .map((definition) => GetInteractable(definition.id))
      .filter(
        (definition) =>
          !state.interactables[definition.id]?.completed && Distance(unit, definition) <= definition.radius + 1.35,
      )
      .sort((left, right) => Distance(unit, left) - Distance(unit, right))[0] ?? null
  );
}

function HandleWorldPick(pick, append = false) {
  if (screenMode !== "mission" || state.outcome || !pick) return;
  if (UseTargetedAbility(pick.position, pick.kind === "interactable" ? pick.id : null, append)) return;
  if (pick.kind === "unit") {
    const pickedUnit = state.units.find((unit) => unit.id === pick.id);
    if (pickedUnit?.state === "downed" && QueueBuddyRescue(pickedUnit.id, append)) return;
    SetSelectedUnits(append ? [...state.selectedUnitIds, pick.id] : [pick.id]);
  } else if (pick.kind === "enemy") {
    QueueEnemyContextAction(pick.id, append);
  } else if (pick.kind === "interactable") {
    QueueInteraction(pick.id, append);
  } else if (pick.position) {
    QueueMoveForSelected(pick.position, append);
  }
}

function AllActiveUnitsInsideSameExtraction() {
  const active = state.units.filter((unit) => unit.state !== "dead" && unit.state !== "evacuated");
  return state.extractionZones.find(
    (zone) =>
      zone.unlocked &&
      active.length > 0 &&
      active.every((unit) => unit.state !== "downed" && Distance(unit, zone) <= zone.radius),
  );
}

function EndMission(success = true, title = "") {
  if (state.outcome) return;
  state.paused = true;
  state.planning = true;
  if (success) FinalizeCarriedItems();
  for (const unit of state.units) {
    if (success && unit.state !== "dead") unit.state = "evacuated";
  }
  state.objectives.allExtracted = success;
  const evaluation = GetMissionEvaluation(state);
  state.outcome = evaluation;
  screenMode = "result";
  elements.gameHud.classList.add("isHidden");
  elements.resultScreen.classList.remove("isHidden");
  elements.resultGrade.textContent = evaluation.grade;
  elements.resultTitle.textContent =
    title || (evaluation.complete ? state.operation.resultTitle ?? "小队完成行动并撤出" : "行动留下缺口");
  const resultSummary = evaluation.complete
    ? state.operation.resultSummary ?? "既定任务已经完成，行动组安全撤出。"
    : evaluation.summary;
  const debriefLines = ResolveStoryletLines(GetOperationLayout(state.operationLayoutId)?.narrativeRefs?.debrief);
  elements.resultSummary.textContent = debriefLines.length > 0
    ? `${resultSummary} ${debriefLines.map(FormatStoryletLine).join(" ")}`
    : resultSummary;
  elements.resultScore.innerHTML = `${evaluation.score}<small>/ 100</small>`;
  const sectionLabels = [
    ["群众安全", evaluation.sections.civilians, 35],
    ["任务完成", evaluation.sections.completeness, 25],
    ["行动纪律", evaluation.sections.discipline, 25],
    ["队员保全", evaluation.sections.preservation, 15],
  ];
  elements.resultSections.innerHTML = sectionLabels
    .map(([label, value, maximum]) => `<div class="resultMetric"><span>${label}</span><strong>${value}<small> / ${maximum}</small></strong></div>`)
    .join("");
  elements.resultLedger.textContent =
    state.ledger.civilianHarm === 0 && state.ledger.civilianRisk === 0 && (state.ledger.civilianDisplacement ?? 0) === 0
      ? "群众代价账本：本次行动未造成群众伤亡，也未把民用品转化为战利品。击杀数不计入行动得分。"
      : `群众代价账本：受害 ${state.ledger.civilianHarm}，风险 ${state.ledger.civilianRisk}，流离 ${state.ledger.civilianDisplacement ?? 0}。这些记录不转化为物资或奖励。`;
  campState = ApplyMissionToCamp(campState, state);
  campState.civilianCostLedger ??= { harm: 0, risk: 0, displacement: 0 };
  campState.civilianCostLedger.displacement ??= 0;
  SaveCampState();
  audio.Play(evaluation.complete ? "objective" : "alert");
}

function EnterCamp() {
  screenMode = "camp";
  elements.resultScreen.classList.add("isHidden");
  elements.campScreen.classList.remove("isHidden");
  campActionUsed = false;
  RenderCamp();
}

const campDecisionPresentation = Object.freeze({
  treat: {
    facility: "clinic",
    facilityName: "救护所",
    payoff: "处理一名伤员，并提升救护轮值能力",
  },
  repair: {
    facility: "workshop",
    facilityName: "工坊",
    payoff: "补充破袭器材容量，工兵增加 1 点疲劳",
  },
  decode: {
    facility: "intelligence",
    facilityName: "情报角",
    payoff: "刷新下一行动巡逻情报，侦察员增加 1 点疲劳",
  },
  rest: {
    facility: "training",
    facilityName: "训练空地",
    payoff: "全队降低疲劳并复盘训练，旧敌情时效下降",
  },
});

function FormatCampDecisionCosts(costs) {
  const costLabels = {
    medicine: "药品",
    tools: "工具",
    radioParts: "收报零件",
    food: "口粮",
    fatigue: "工兵疲劳",
    scoutFatigue: "侦察员疲劳",
    intelFreshness: "敌情时效",
  };
  const parts = Object.entries(costs)
    .filter(([costId]) => costId !== "opportunity")
    .map(([costId, value]) => `${costLabels[costId] ?? costId} ${value}`);
  if (costs.opportunity) parts.push("占用本轮唯一整备");
  return parts.join(" · ");
}

function GetCampDecisionUnavailableReason(option) {
  if (campState.lastDecisionSortie === (campState.sorties ?? 0) || campActionUsed) return "本轮整备已经完成";
  if (option.id === "treat" && !campState.roster.some((operative) => !operative.lost && operative.wounds > 0)) {
    return "当前没有需要处理的伤员";
  }
  const resourceByCost = {
    medicine: campState.resources.medicine,
    tools: campState.resources.tools,
    radioParts: campState.resources.radioParts,
    food: campState.resources.food,
  };
  const shortage = Object.entries(option.costs).find(
    ([costId, cost]) => costId in resourceByCost && resourceByCost[costId] < cost,
  );
  if (shortage) return `${{ medicine: "药品", tools: "工具", radioParts: "收报零件", food: "口粮" }[shortage[0]]}不足`;
  return "当前条件不满足";
}

function RenderCamp() {
  const evaluation = state.outcome ?? GetMissionEvaluation(state);
  const nextOperation = GetOperationLayoutByCampaignIndex(campState.completedMissions);
  elements.campDay.textContent = String(campState.day);
  elements.campOutcomeTitle.textContent = evaluation.complete
    ? state.operation.campOutcomeTitle ?? "行动完成，队伍归营"
    : "保住了人，失去了一段路";
  elements.campOutcomeText.textContent = evaluation.complete
    ? `人员与物资已经清点。下一项行动“${nextOperation.name}”：${nextOperation.summary}`
    : "行动组带回了部分人员与物资；联络组需要重新核实失效的路。";
  const receipts = [];
  if (state.supplies.medicine) receipts.push(`敌军扣押药箱 · 药品 +${state.supplies.medicine}`);
  if (state.supplies.tools) receipts.push(`军用工具卷 · 工具 +${state.supplies.tools}`);
  if (state.supplies.radioParts) receipts.push(`待转运通信器材 · 零件 +${state.supplies.radioParts}`);
  if (state.objectives.seedGrain) receipts.push("种粮已归还村民 · 不入库");
  elements.campReceipts.innerHTML = (receipts.length ? receipts : ["本次没有物资入库"])
    .map((receipt) => `<span class="campReceipt">${receipt}</span>`)
    .join("");
  elements.campRosterList.innerHTML = campState.roster
    .map((operative) => {
      const definition = GetCharacterDefinition(operative.id);
      const woundText = operative.lost
        ? "失联 · 不可恢复"
        : operative.wounds >= 2
          ? "重伤 · 暂不可出战"
          : operative.wounds === 1
            ? "轻伤 · 可带伤行动"
            : "健康";
      return `<div class="campOperative"><strong>${definition.name}</strong><small>${woundText}｜疲劳 ${operative.fatigue}/3</small></div>`;
    })
    .join("");
  const resourceDefinitions = [
    ["药品", campState.resources.medicine],
    ["工具", campState.resources.tools],
    ["收报零件", campState.resources.radioParts],
    ["口粮", campState.resources.food],
    ["群众掩护条件", campState.resources.trust >= 65 ? "稳固" : campState.resources.trust >= 40 ? "谨慎" : "受监视"],
  ];
  elements.campResourceList.innerHTML = resourceDefinitions
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
  elements.campCostLedger.textContent =
    campState.civilianCostLedger.harm === 0
      ? `累计未记录群众伤亡；风险 ${campState.civilianCostLedger.risk}，流离 ${campState.civilianCostLedger.displacement ?? 0}。`
      : `累计受害 ${campState.civilianCostLedger.harm}，风险 ${campState.civilianCostLedger.risk}，流离 ${campState.civilianCostLedger.displacement ?? 0}。`;
  for (const option of GetCampDecisionOptions(campState)) {
    const presentation = campDecisionPresentation[option.id];
    const button = document.querySelector(`[data-camp-action="${option.id}"]`);
    if (!presentation || !button) continue;
    const facilityLevel = campState.facilities[presentation.facility] ?? 0;
    const costText = FormatCampDecisionCosts(option.costs);
    const detail = button.querySelector("small");
    const payoff = button.querySelector("[data-camp-payoff]");
    if (detail) detail.textContent = `${presentation.facilityName} Lv.${facilityLevel} · 成本：${costText}`;
    if (payoff) payoff.textContent = `收益：${presentation.payoff}`;
    button.disabled = campActionUsed || !option.available;
    button.dataset.available = String(option.available && !campActionUsed);
    const availability = button.disabled ? `不可用：${GetCampDecisionUnavailableReason(option)}` : "可执行";
    button.title = `${availability}；成本：${costText}；${presentation.payoff}`;
    button.setAttribute("aria-label", `${button.querySelector("span")?.textContent ?? presentation.facilityName}，${availability}，成本：${costText}，收益：${presentation.payoff}`);
  }
  const canDeploy = campState.roster.some((operative) => !operative.lost && operative.available && operative.wounds < 2);
  const allLost = campState.roster.every((operative) => operative.lost);
  elements.restartFromCampButton.disabled = !canDeploy && !allLost;
  elements.restartFromCampButton.textContent = canDeploy
    ? `部署下一项行动：${nextOperation.name}`
    : allLost
      ? "结束本档并重建行动组"
      : "需先恢复一名队员";
}

function HandleCampAction(actionId) {
  if (campActionUsed) return;
  const option = GetCampDecisionOptions(campState).find((candidate) => candidate.id === actionId);
  if (!option?.available) {
    elements.campStatus.textContent = option ? GetCampDecisionUnavailableReason(option) : "未知营地行动。";
    audio.Play("alert");
    RenderCamp();
    return;
  }
  const result = ApplyCampAction(campState, actionId);
  campState = result.state;
  elements.campStatus.textContent = result.message;
  if (result.success) {
    campActionUsed = true;
    SaveCampState();
    audio.Play("objective");
  } else {
    audio.Play("alert");
  }
  RenderCamp();
}

function RenderObjectives() {
  const layout = GetOperationLayout(state.operationLayoutId);
  const objectiveDefinitions = layout
    ? [...layout.objectives.mandatory, ...layout.objectives.optional].map((objective) => ({
        id: objective.id,
        name: objective.label,
        detail: `${objective.carryToExtract ? "必须携带撤出" : objective.nonRewardingDuty ? "群众责任·不计物资" : "现场完成"}`,
      }))
    : [
        { id: "ledger", name: "取得换防传令簿与线路图", detail: "交换室值房" },
        { id: "relay", name: "剪断据点有线联络", detail: "手摇电话交换机" },
        { id: "allExtracted", name: "行动组全员撤离", detail: "任选已解锁撤离点" },
      ];
  const requiredIds = state.mainObjectiveIds;
  const optionalIds = objectiveDefinitions
    .map((objective) => objective.id)
    .filter((objectiveId) => !requiredIds.includes(objectiveId))
    .slice(0, 3);
  const objectiveRows = [...requiredIds, ...optionalIds]
    .map((objectiveId) => objectiveDefinitions.find((objective) => objective.id === objectiveId))
    .filter(Boolean)
    .map((objective) => ({ ...objective, detail: `${objective.detail} · ${requiredIds.includes(objective.id) ? "必须" : "可选"}` }));
  elements.objectiveList.innerHTML = objectiveRows
    .map(
      (objective) =>
        `<li class="${state.objectives[objective.id] ? "isComplete" : ""}"><span><strong>${objective.name}</strong><small>${objective.detail}</small></span></li>`,
    )
    .join("");
  const mainCompleted = requiredIds.filter((key) => state.objectives[key]).length;
  elements.objectiveCounter.textContent = `${mainCompleted} / ${requiredIds.length}`;
}

function RenderRoster() {
  elements.rosterPanel.innerHTML = state.units
    .map((unit, index) => {
      const definition = GetCharacterDefinition(unit.id);
      const healthRatio = Clamp(unit.health / unit.maximumHealth, 0, 1);
      const queueCount = unit.queue.length + (unit.command ? 1 : 0);
      const carriedNames = (unit.carriedItems ?? []).map((itemId) => {
        if (itemId === "ledger") return "线路册";
        if (itemId === "medicines") return "药箱";
        if (itemId === "radioParts") return "通信零件";
        if (itemId === "tools") return "工具卷";
        if (itemId === "stationLedger") return "换防线路图";
        if (itemId === "clinicSatchel") return "救护药箱";
        if (itemId === "militaryDetonators") return "军用雷管盒";
        return itemId;
      });
      const stateText =
        unit.state === "downed"
          ? `失血 ${Math.ceil(unit.downedTimer)} 秒`
          : unit.state === "dead"
            ? "失联"
            : carriedNames.length > 0
              ? `携带：${carriedNames.join("、")}`
              : `${unit.ammo} 发`;
      const cardClasses = [
        "unitCard",
        unit.hidden ? "isConcealed" : "",
        unit.suppression >= 55 ? "isSuppressed" : "",
        healthRatio <= 0.35 ? "isCritical" : "",
        unit.state === "downed" || unit.state === "dead" ? "isDowned" : "",
      ].filter(Boolean).join(" ");
      return `
        <button class="${cardClasses}" style="--operativeAccent:${definition.accent}" type="button" data-unit-id="${unit.id}" data-index="F${index + 1}" data-state="${unit.state}" aria-pressed="${state.selectedUnitIds.includes(unit.id)}">
          <strong>${definition.name}</strong>
          <small>${definition.role} · ${stateText}</small>
          <span class="unitHealth" aria-label="生命 ${Math.round(healthRatio * 100)}%"><i style="width:${healthRatio * 100}%"></i></span>
          <span class="unitSuppression"><i style="width:${unit.suppression}%"></i></span>
          <span class="unitQueue">${Array.from({ length: 4 }, (_, queueIndex) => `<i class="${queueIndex < queueCount ? "isFilled" : ""}"></i>`).join("")}</span>
        </button>`;
    })
    .join("");
}

function RenderActionBar() {
  const unit = GetSelectedUnit();
  const definition = GetCharacterDefinition(unit.id);
  elements.selectedSummary.innerHTML = `<span class="selectedCallSign">${definition.callSign}</span><div><strong>${definition.name}</strong><small>${definition.role} · ${definition.weapon}</small></div>`;
  elements.abilityGroup.innerHTML = definition.abilities
    .map((ability) => {
      const cooldown = Math.ceil(unit.cooldowns[ability.id] ?? 0);
      const charges = ability.charges ? unit.charges[ability.id] ?? 0 : null;
      const status = cooldown > 0 ? `${cooldown} 秒` : charges !== null ? `剩余 ${charges}` : ability.description;
      return `<button class="abilityButton${activeAbility === ability.id ? " isActive" : ""}" type="button" data-ability-id="${ability.id}" ${cooldown > 0 || (charges !== null && charges <= 0) ? "disabled" : ""}><span>${ability.name}</span><small>${status}</small><b class="abilityKey">${ability.shortcut}</b></button>`;
    })
    .join("");
  document.querySelectorAll("[data-stance]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.stance === unit.stance));
  });
  const nearby = GetNearbyInteractable(unit);
  view.currentInteractionId = nearby?.id ?? null;
  elements.interactButton.disabled = !nearby || unit.state === "wounded";
  elements.interactHint.textContent = nearby ? nearby.name : "靠近目标";
  if (nearby) {
    const runtime = state.interactables[nearby.id];
    const percentage = Math.round((runtime?.progress ?? 0) * 100);
    elements.worldPrompt.textContent =
      percentage > 0
        ? `${nearby.name} · ${percentage}%`
        : `F 互动｜${nearby.name}｜约 ${nearby.duration} 秒`;
    elements.worldPrompt.classList.remove("isHidden");
  } else {
    elements.worldPrompt.classList.add("isHidden");
  }
}

function RenderStatus() {
  const phaseLabels = {
    recon: "侦察窗口",
    infiltration: "潜入阶段",
    objective: "目标接触",
    contested: "局面升级",
    breakcontact: "断接撤离",
  };
  elements.phaseLabel.textContent = state.paused ? "规划暂停" : phaseLabels[state.phase] ?? "行动中";
  elements.missionClock.textContent = FormatTime(state.time);
  const alertLabels = ["寂静", "局部起疑", "正在搜查", "全区警报"];
  elements.alertLabel.textContent = alertLabels[state.alertLevel] ?? "全区警报";
  elements.alertLabel.style.color = state.alertLevel >= 3 ? "var(--danger)" : state.alertLevel >= 1 ? "var(--amber)" : "var(--friendly)";
  elements.alertFill.style.width = `${[4, 32, 68, 100][state.alertLevel] ?? 100}%`;
  elements.gameHud.dataset.alertLevel = String(state.alertLevel);
  elements.gameHud.classList.toggle("isPlanning", state.paused);
  if (state.alertLevel > lastPresentedAlertLevel) {
    TriggerCombatFeedback("alert", 0.58 + state.alertLevel * 0.12, alertLabels[state.alertLevel]);
  }
  lastPresentedAlertLevel = state.alertLevel;
  elements.pauseButton.setAttribute("aria-pressed", String(state.paused));
  elements.pauseGlyph.textContent = state.paused ? "▶" : "Ⅱ";
  elements.pauseLabel.textContent = state.paused ? "执行计划" : "暂停规划";
  elements.planningBanner.classList.toggle("isHidden", !state.paused);
  const tacticalReadout = GetTacticalReadout(
    state,
    GetSelectedUnit(),
    simulationConfig.awarenessInvestigate,
  );
  elements.tacticalReadout.dataset.status = tacticalReadout.concealment.key;
  elements.concealmentGlyph.textContent = tacticalReadout.concealment.glyph;
  elements.concealmentLabel.textContent = tacticalReadout.concealment.label;
  elements.awarenessFill.style.width = `${tacticalReadout.visibleAwareness}%`;
  elements.awarenessLabel.textContent = tacticalReadout.awarenessLabel;
  elements.shotCount.textContent = String(state.ledger.shotsFired);
  elements.riskCount.textContent = String(state.ledger.civilianRisk);
  elements.discoverCount.textContent = String(
    Object.values(state.interactables).filter((runtime) => runtime.discovered || runtime.completed).length,
  );
  elements.reinforcementStatus.textContent =
    state.reinforcementTimer !== null
      ? `增援 ${FormatTime(state.reinforcementTimer)}`
      : state.objectives.relay
        ? "有线联络已断"
        : state.environment.eastRoadBlocked
          ? "东路已封"
          : "电话畅通";
}

function RenderLog() {
  elements.eventLog.innerHTML = state.messages
    .slice(-5)
    .map((message) => `<p data-kind="${message.kind}"><time>${FormatTime(message.time)}</time> ${message.text}</p>`)
    .join("");
}

function RenderExtraction() {
  const zone = AllActiveUnitsInsideSameExtraction();
  const requiredActions = state.mainObjectiveIds.filter((objectiveId) => objectiveId !== "allExtracted");
  const canExtract = Boolean(zone && requiredActions.every((objectiveId) => state.objectives[objectiveId]));
  elements.extractionButton.classList.toggle("isHidden", !canExtract);
  if (canExtract) elements.extractionButton.textContent = `确认从${zone.name}撤离`;
}

function WriteDebugDataset() {
  document.documentElement.dataset.mountainEmberDebug = JSON.stringify({
    screenMode,
    operationLayoutId: state.operationLayoutId,
    missionBounds: GetActiveMissionDefinition().bounds,
    paused: state.paused,
    time: state.time,
    quality: rendererQuality,
    uiScale: settings.uiScale,
    screenEffects: settings.screenEffects && !settings.reducedMotion,
    hoverEnemyId: view.hoverEnemyId,
    soundEventCount: state.soundEvents.length,
    operationFlags: state.operationRuntime?.flags ?? {},
    activeCivilianRoutes: state.operationRuntime?.activeCivilianRoutes ?? [],
    civilianRouteStates: state.civilianRoutes,
    civilianCostLedger: state.operationRuntime?.civilianCostLedger ?? {},
    civilians: (state.civilians ?? []).map(({ id, routeId, groupSize, state: civilianState, x, z, routeDistance, exposureSeconds }) => ({
      id,
      routeId,
      groupSize,
      state: civilianState,
      x,
      z,
      routeDistance,
      exposureSeconds,
    })),
    renderer: world?.GetStats() ?? null,
    performance: GetPerformanceSnapshot(),
    units: state.units.map((unit) => ({
      id: unit.id,
      state: unit.state,
      ammo: unit.ammo,
      suppression: unit.suppression,
      cooldowns: unit.cooldowns,
      charges: unit.charges,
      command: unit.command?.kind ?? null,
      queue: unit.queue.map((command) => command.kind),
    })),
    enemies: state.enemies.map((enemy) => ({
      id: enemy.id,
      state: enemy.state,
      awareness: enemy.awareness,
      suppression: enemy.suppression,
      radioed: enemy.radioed,
      revealedTimer: enemy.revealedTimer ?? 0,
      currentVisible: Boolean(enemy.currentVisible),
      intelState: enemy.intelState ?? "unknown",
      lastSeenTimer: enemy.lastSeenTimer ?? 0,
    })),
  });
}

function RenderHud() {
  if (screenMode !== "mission") return;
  RenderStatus();
  RenderObjectives();
  RenderRoster();
  RenderActionBar();
  RenderLog();
  RenderExtraction();
  WriteDebugDataset();
}

function OpenModal(modal) {
  if (!modal) return;
  modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.classList.remove("isHidden");
  const focusable = GetModalFocusableElements(modal);
  focusable[0]?.focus();
}

function CloseModal(modal) {
  if (!modal || modal.classList.contains("isHidden")) return;
  modal.classList.add("isHidden");
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
  modalReturnFocus = null;
}

function GetOpenModal() {
  return [elements.settingsModal, elements.helpModal, elements.briefingModal].find(
    (modal) => modal && !modal.classList.contains("isHidden"),
  ) ?? null;
}

function GetModalFocusableElements(modal) {
  if (!modal) return [];
  return [...modal.querySelectorAll(
    'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.closest(".isHidden"));
}

function TrapModalFocus(event, modal) {
  const focusable = GetModalFocusableElements(modal);
  if (focusable.length === 0) {
    event.preventDefault();
    modal.focus();
    return;
  }
  const currentIndex = focusable.indexOf(document.activeElement);
  const nextIndex = event.shiftKey
    ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
    : (currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
  event.preventDefault();
  focusable[nextIndex].focus();
}

function CloseMobileDrawers() {
  for (const panel of [elements.objectivePanel, elements.situationPanel]) panel?.classList.remove("isOpen");
  for (const button of [elements.objectiveDrawerButton, elements.situationDrawerButton]) {
    button?.setAttribute("aria-expanded", "false");
  }
}

function ToggleMobileDrawer(panelId) {
  const target = GetElement(panelId);
  if (!target) return;
  const shouldOpen = !target.classList.contains("isOpen");
  CloseMobileDrawers();
  if (!shouldOpen) return;
  target.classList.add("isOpen");
  document.querySelector(`[data-drawer-target="${panelId}"]`)?.setAttribute("aria-expanded", "true");
  target.querySelector(".mobileDrawerClose")?.focus();
}

function StartMission() {
  if (screenMode === "mission") return;
  audio.Start();
  if (state.units.length === 0) {
    screenMode = "camp";
    elements.titleScreen.classList.add("isHidden");
    elements.campScreen.classList.remove("isHidden");
    campActionUsed = false;
    elements.campStatus.textContent = "当前无人可出动；先在救护所处理至少一名重伤队员。";
    RenderCamp();
    return;
  }
  screenMode = "mission";
  elements.titleScreen.classList.add("isHidden");
  elements.briefingModal.classList.add("isHidden");
  elements.gameHud.classList.remove("isHidden");
  elements.gameHud.classList.add("isEntering");
  setTimeout(() => elements.gameHud.classList.remove("isEntering"), settings.reducedMotion ? 0 : 900);
  elements.tutorialCard.classList.toggle("isHidden", settings.tutorialClosed);
  state.paused = true;
  state.planning = true;
  ShowCombatCue("战术图已展开", "intel");
  UpdateEnemyIntel(state, 0);
  RequestInteractiveRender(0.9);
  const openingFocus = GetActiveMissionDefinition().zones[0] ?? GetActiveMissionDefinition().camera.target;
  world?.FocusPosition(openingFocus, 46, { startup: true });
  RenderHud();
  ShowToast(`${state.operation.name}：战术图已展开。空格执行；第一次报警不会立即失败。`);
}

function ShowNextRouteHint() {
  const layout = GetOperationLayout(state.operationLayoutId);
  const hints = layout
    ? layout.tacticalPhases.map((phase, index) => {
        const focus = layout.zones[index % layout.zones.length] ?? layout.camera.target;
        return { point: { x: focus.x, z: focus.z }, text: `${phase.label}：${phase.decision}` };
      })
    : [{ point: GetActiveMissionDefinition().camera.target, text: "先侦察巡逻，再确认撤路。" }];
  const hint = hints[routeHintIndex % hints.length];
  routeHintIndex += 1;
  world?.FocusPosition(hint.point, 42);
  RequestInteractiveRender(0.9);
  ShowToast(hint.text);
}

function HandleResize() {
  world?.Resize(window.innerWidth, window.innerHeight);
  RequestInteractiveRender();
}

function HandlePointerDown(event) {
  if (screenMode !== "mission" || event.button !== 0) return;
  RequestInteractiveRender();
  pendingHoverPointer = null;
  if (event.pointerType === "touch") {
    activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activeTouchPointers.size >= 2) {
      const [first, second] = [...activeTouchPointers.values()];
      pinchDistance = Math.hypot(first.x - second.x, first.y - second.y);
      pinchActive = true;
      pointerDown = null;
      pointerMoved = true;
      elements.canvas.setPointerCapture?.(event.pointerId);
      return;
    }
  }
  pointerDown = { x: event.clientX, y: event.clientY };
  pointerMoved = false;
  elements.canvas.setPointerCapture?.(event.pointerId);
}

function FlushPendingHoverPick() {
  if (!pendingHoverPointer) return;
  const sample = pendingHoverPointer;
  pendingHoverPointer = null;
  if (screenMode !== "mission") return;
  const hoverPick = world?.Pick(sample.clientX, sample.clientY);
  view.currentPointerWorld = hoverPick?.position ?? null;
  const nextHoverEnemyId = hoverPick?.kind === "enemy" ? hoverPick.id : null;
  if (view.hoverEnemyId !== nextHoverEnemyId) {
    view.hoverEnemyId = nextHoverEnemyId;
    RequestInteractiveRender();
  }
}

function HandlePointerMove(event) {
  if (event.pointerType === "touch" || pointerDown) {
    pendingHoverPointer = null;
    view.currentPointerWorld = world?.ScreenToGround(event.clientX, event.clientY);
  } else {
    pendingHoverPointer =
      screenMode === "mission" ? { clientX: event.clientX, clientY: event.clientY } : null;
  }
  if (screenMode === "mission") RequestInteractiveRender(0.2);
  if (event.pointerType === "touch" && activeTouchPointers.has(event.pointerId)) {
    activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activeTouchPointers.size >= 2) {
      const [first, second] = [...activeTouchPointers.values()];
      const nextDistance = Math.hypot(first.x - second.x, first.y - second.y);
      if (pinchDistance !== null && Math.abs(nextDistance - pinchDistance) > 10) {
        world?.Zoom(pinchDistance - nextDistance);
      }
      pinchDistance = nextDistance;
      pinchActive = true;
      return;
    }
  }
  if (!pointerDown || screenMode !== "mission") return;
  const deltaX = event.clientX - pointerDown.x;
  const deltaY = event.clientY - pointerDown.y;
  if (Math.hypot(deltaX, deltaY) > 6) pointerMoved = true;
  if (pointerMoved) {
    world?.Pan(-deltaX * 0.055, -deltaY * 0.055);
    pointerDown = { x: event.clientX, y: event.clientY };
  }
}

function HandlePointerLeave(event) {
  if (event.pointerType === "touch") return;
  pendingHoverPointer = null;
  view.currentPointerWorld = null;
  view.hoverEnemyId = null;
  RequestInteractiveRender();
}

function HandlePointerUp(event) {
  const completedPinch = pinchActive;
  if (event.pointerType === "touch") {
    activeTouchPointers.delete(event.pointerId);
    if (activeTouchPointers.size < 2) pinchDistance = null;
    if (activeTouchPointers.size === 0) pinchActive = false;
  }
  if (screenMode !== "mission") return;
  if (pointerDown && !pointerMoved && !completedPinch) {
    HandleWorldPick(world?.Pick(event.clientX, event.clientY), event.shiftKey);
  }
  pointerDown = null;
  pointerMoved = false;
  RequestInteractiveRender();
}

function HandleContextMenu(event) {
  event.preventDefault();
  if (screenMode !== "mission") return;
  HandleWorldPick(world?.Pick(event.clientX, event.clientY), event.shiftKey);
}

function HandleWheel(event) {
  if (screenMode !== "mission" && screenMode !== "title") return;
  event.preventDefault();
  world?.Zoom(event.deltaY);
  RequestInteractiveRender(0.7);
}

function HandleKeyDown(event) {
  RequestInteractiveRender();
  const openModal = GetOpenModal();
  if (openModal) {
    if (event.key === "Escape") {
      event.preventDefault();
      CloseModal(openModal);
    } else if (event.key === "Tab") {
      TrapModalFocus(event, openModal);
    }
    return;
  }
  if (event.key === "Escape") {
    activeAbility = null;
    CloseMobileDrawers();
    CloseModal(elements.helpModal);
    CloseModal(elements.briefingModal);
    CloseModal(elements.settingsModal);
    RenderHud();
    return;
  }
  if (screenMode === "title" && event.key === "Enter") {
    StartMission();
    return;
  }
  if (screenMode !== "mission") return;
  if (event.code === "Space") {
    event.preventDefault();
    TogglePause();
  } else if (/^F[1-4]$/.test(event.key)) {
    event.preventDefault();
    const index = Number(event.key.slice(1)) - 1;
    const unit = state.units[index];
    if (unit) SetSelectedUnits(event.shiftKey ? [...state.selectedUnitIds, unit.id] : [unit.id], event.detail > 1);
  } else if (event.key === "Tab") {
    event.preventDefault();
    const currentIndex = state.units.findIndex((unit) => unit.id === GetSelectedUnit().id);
    const direction = event.shiftKey ? -1 : 1;
    const nextIndex = (currentIndex + direction + state.units.length) % state.units.length;
    SetSelectedUnits([state.units[nextIndex].id]);
  } else if (event.key === "1" || event.key === "2") {
    const unit = GetSelectedUnit();
    const ability = GetCharacterDefinition(unit.id)?.abilities[Number(event.key) - 1];
    if (ability) UseAbility(ability.id, event.shiftKey);
  } else if (event.key.toLowerCase() === "f" && view.currentInteractionId) {
    QueueInteraction(view.currentInteractionId, event.shiftKey);
  } else if (event.key === "Enter" && state.paused) {
    TogglePause(false);
  }
}

function BindEvents() {
  elements.startButton.addEventListener("click", StartMission);
  elements.briefingButton.addEventListener("click", () => OpenModal(elements.briefingModal));
  elements.pauseButton.addEventListener("click", () => TogglePause());
  elements.executeButton.addEventListener("click", () => TogglePause(false));
  elements.helpButton.addEventListener("click", () => OpenModal(elements.helpModal));
  elements.settingsButton.addEventListener("click", () => {
    PopulateSettingsPanel();
    OpenModal(elements.settingsModal);
  });
  elements.saveSettingsButton.addEventListener("click", SaveVisualSettingsFromPanel);
  elements.soundButton.addEventListener("click", () => {
    settings.muted = !settings.muted;
    audio.SetMuted(settings.muted);
    elements.soundButton.setAttribute("aria-pressed", String(settings.muted));
    elements.soundButton.textContent = settings.muted ? "静" : "声";
    SaveSettings();
  });
  elements.routeHintButton.addEventListener("click", ShowNextRouteHint);
  document.querySelectorAll("[data-drawer-target]").forEach((button) => {
    button.addEventListener("click", () => ToggleMobileDrawer(button.dataset.drawerTarget));
  });
  document.querySelectorAll("[data-drawer-close]").forEach((button) => {
    button.addEventListener("click", CloseMobileDrawers);
  });
  elements.interactButton.addEventListener("click", () => {
    if (view.currentInteractionId) QueueInteraction(view.currentInteractionId);
  });
  elements.tutorialClose.addEventListener("click", () => {
    settings.tutorialClosed = true;
    SaveSettings();
    elements.tutorialCard.classList.add("isHidden");
  });
  elements.extractionButton.addEventListener("click", () => EndMission(true));
  elements.campButton.addEventListener("click", EnterCamp);
  elements.replayButton.addEventListener("click", () => window.location.reload());
  elements.restartFromCampButton.addEventListener("click", () => {
    if (campState.roster.every((operative) => operative.lost)) localStorage.removeItem(saveKey);
    window.location.reload();
  });
  document.addEventListener("click", (event) => {
    RequestInteractiveRender();
    const closeButton = event.target.closest("[data-close-modal]");
    if (closeButton) CloseModal(closeButton.closest(".modalBackdrop"));
    const unitButton = event.target.closest("[data-unit-id]");
    if (unitButton) SetSelectedUnits(event.shiftKey ? [...state.selectedUnitIds, unitButton.dataset.unitId] : [unitButton.dataset.unitId], event.detail > 1);
    const abilityButton = event.target.closest("[data-ability-id]");
    if (abilityButton) UseAbility(abilityButton.dataset.abilityId, event.shiftKey);
    const campActionButton = event.target.closest("[data-camp-action]");
    if (campActionButton) HandleCampAction(campActionButton.dataset.campAction);
  });
  document.querySelectorAll("[data-stance]").forEach((button) => {
    button.addEventListener("click", () => {
      for (const unitId of state.selectedUnitIds) {
        const unit = state.units.find((candidate) => candidate.id === unitId);
        if (unit) unit.stance = button.dataset.stance;
      }
      audio.Play("command");
      RenderHud();
    });
  });
  elements.canvas.addEventListener("pointerdown", HandlePointerDown);
  elements.canvas.addEventListener("pointermove", HandlePointerMove);
  elements.canvas.addEventListener("pointerleave", HandlePointerLeave);
  elements.canvas.addEventListener("pointerup", HandlePointerUp);
  elements.canvas.addEventListener("pointercancel", () => {
    pointerDown = null;
    pointerMoved = false;
    activeTouchPointers.clear();
    pinchDistance = null;
    pinchActive = false;
  });
  elements.canvas.addEventListener("contextmenu", HandleContextMenu);
  elements.canvas.addEventListener("wheel", HandleWheel, { passive: false });
  window.addEventListener("keydown", HandleKeyDown);
  window.addEventListener("resize", HandleResize);
  document.addEventListener("visibilitychange", () => {
    lastFrameTime = performance.now();
    simulationAccumulator = 0;
  });
}

function Frame(now) {
  const frameWorkStartedAt = performance.now();
  const rawDelta = Math.max(0, Math.min(0.1, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  const hidden = document.hidden;
  let didMeaningfulWork = false;
  if (!hidden) {
    FlushPendingHoverPick();
    const simulationActive = screenMode === "mission" && !state.paused && !state.outcome;
    if (simulationActive) {
      const simulationWorkStartedAt = performance.now();
      simulationAccumulator += rawDelta;
      let steps = 0;
      while (simulationAccumulator >= simulationConfig.fixedStep && steps < 5) {
        StepSimulation(simulationConfig.fixedStep);
        simulationAccumulator -= simulationConfig.fixedStep;
        steps += 1;
      }
      PushPerformanceSample(simulationWorkSamples, performance.now() - simulationWorkStartedAt);
      didMeaningfulWork = true;
    } else {
      simulationAccumulator = 0;
    }
    hudAccumulator += rawDelta;
    if (hudAccumulator >= 0.1) {
      if (screenMode === "mission" && !state.paused) {
        const hudWorkStartedAt = performance.now();
        RenderHud();
        PushPerformanceSample(hudWorkSamples, performance.now() - hudWorkStartedAt);
        didMeaningfulWork = true;
      }
      hudAccumulator = 0;
    }
    renderAccumulator += rawDelta;
    const effectsActive = world?.HasActiveEffects() ?? false;
    const interactiveRendering =
      renderDirty || now < renderBurstUntil || pointerDown !== null || activeTouchPointers.size > 0 || effectsActive;
    if (simulationActive || interactiveRendering || renderAccumulator >= 1 / 12) {
      const renderWorkStartedAt = performance.now();
      world?.Frame(Math.min(0.1, renderAccumulator), state, view);
      renderAccumulator = 0;
      renderDirty = false;
      WriteDebugDataset();
      PushPerformanceSample(renderWorkSamples, performance.now() - renderWorkStartedAt);
      didMeaningfulWork = true;
    }
    if (simulationActive) {
      PushPerformanceSample(frameSamples, rawDelta * 1000);
    }
    if (didMeaningfulWork) PushPerformanceSample(totalWorkSamples, performance.now() - frameWorkStartedAt);
  }
  requestAnimationFrame(Frame);
}

async function Boot() {
  try {
    elements.loadingProgress.style.width = "12%";
    elements.loadingHint.textContent = "正在读取人物与巡逻班次……";
    await Promise.resolve();
    rendererQuality = DetectQuality();
    SyncOperationRuntimeToState();
    world = CreateWorld(elements.canvas, {
      quality: rendererQuality,
      missionDefinition: GetActiveMissionDefinition(),
    });
    elements.loadingProgress.style.width = "36%";
    elements.loadingHint.textContent = "正在装配村落、电话线与队员模型……";
    const artReport = await world.LoadArtAssets();
    if (artReport.errors.length > 0) {
      console.warn("MountainEmber art assets fell back to procedural models", artReport.errors);
    }
    world.BuildActors(state);
    const operationNumber = campState.completedMissions + 1;
    elements.canvas.setAttribute("aria-label", `${state.operation.name}三维战术地图`);
    elements.operationName.textContent = state.operation.name;
    elements.operationMeta.textContent = `行动 ${String(operationNumber).padStart(2, "0")} · ${FormatCampaignDate(
      campState.completedMissions,
      state.operation,
    )}`;
    elements.operationName.closest(".operationBlock").dataset.operationName = state.operation.name;
    document.querySelector(".operationTitle").textContent = `行动 ${String(operationNumber).padStart(2, "0")} / ${
      state.operation.name
    }`;
    document.querySelector(".titleDocket h2").textContent = state.operation.name;
    document.querySelector(".titleLead").textContent = state.operation.summary;
    PopulateMissionBriefing();
    const activeLayout = GetOperationLayout(state.operationLayoutId);
    const docketObjectiveNames = Object.fromEntries(
      (activeLayout
        ? [...activeLayout.objectives.mandatory, ...activeLayout.objectives.optional]
        : [{ id: "allExtracted", label: "全员进入同一撤离点" }]
      ).map((objective) => [objective.id, objective.label]),
    );
    document.querySelector(".titleDocket ol").innerHTML = state.mainObjectiveIds
      .map(
        (objectiveId, index) =>
          `<li><span>${["壹", "贰", "叁", "肆"][index] ?? index + 1}</span>${docketObjectiveNames[objectiveId]}</li>`,
      )
      .join("");
    document.title = `山火 · 一九四一｜${state.operation.name}`;
    if (state.units.length === 0) {
      elements.startButton.querySelector("span").textContent = "回营地处理伤员";
    }
    HandleResize();
    elements.loadingProgress.style.width = "58%";
    elements.loadingHint.textContent = "正在布置旱沟、村落与电话线路……";
    BindEvents();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    world.Frame(1 / 60, state, view);
    elements.loadingProgress.style.width = "100%";
    elements.loadingHint.textContent = "战术图已装订";
    requestAnimationFrame(Frame);
    setTimeout(() => {
      elements.loadingScreen.classList.add("isLeaving");
      elements.titleScreen.classList.remove("isHidden");
      screenMode = "title";
      setTimeout(() => elements.loadingScreen.remove(), 700);
      elements.startButton.focus();
    }, 260);
  } catch (error) {
    console.error(error);
    elements.loadingHint.textContent = `启动失败：${error?.message ?? error}`;
    elements.loadingHint.style.color = "#d99580";
  }
}

Boot();

export function GetDebugSnapshot() {
  return {
    screenMode,
    state,
    campState,
    renderer: world?.GetStats(),
    performance: GetPerformanceSnapshot(),
  };
}

window.MountainEmberDebug = Object.freeze({
  GetSnapshot: GetDebugSnapshot,
});
