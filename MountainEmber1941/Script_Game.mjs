import { characterDefinitions, GetCharacterDefinition, GetEnemyRoleDefinition } from "./Data_Characters.mjs";
import {
  campaignOperationDefinitions,
  GetInteractable as GetInteractableDefinition,
  missionDefinition,
} from "./Data_Mission.mjs";
import { CreateAudioSystem } from "./Script_Audio.mjs";
import { UpdateEnemySquad } from "./Script_Ai.mjs";
import {
  ApplyCampAction,
  ApplyAbilityCommand,
  ApplyMissionToCamp,
  Clamp,
  CreateInitialCampState,
  CreateInitialMissionState,
  CreateSoundEvent,
  Distance,
  FindPath2D,
  GetBallisticImpact,
  GetCoverAt,
  GetCoverDamageMultiplier,
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
  simulationConfig,
  UpdateEnemyIntel,
} from "./Script_Rules.mjs";
import { CreateWorld } from "./Script_World.mjs";

const saveKey = "mountainember1941_campaign_v1";
const settingKey = "mountainember1941_settings_v1";

function GetElement(id) {
  return document.getElementById(id);
}

function GetInteractable(interactableId) {
  const definition = GetInteractableDefinition(interactableId);
  const droppedAt = state?.interactables?.[interactableId]?.droppedAt;
  return definition && droppedAt ? { ...definition, ...droppedAt } : definition;
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
  const isMobile = matchMedia("(max-width: 760px)").matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  if (isMobile || cores <= 4 || memory <= 4) return "low";
  if (cores >= 10 && memory >= 8 && (window.devicePixelRatio || 1) <= 1.5) return "ultra";
  return "high";
}

function FormatCampaignDate(completedMissions, operation) {
  const campaignStart = Date.UTC(1941, 9, 12);
  const operationCycle = Math.floor(completedMissions / campaignOperationDefinitions.length);
  const totalOffsetDays = operationCycle * 16 + (operation.dateOffsetDays ?? 0);
  const missionDate = new Date(campaignStart + totalOffsetDays * 86400000);
  return `${missionDate.getUTCFullYear()}.${String(missionDate.getUTCMonth() + 1).padStart(2, "0")}.${String(
    missionDate.getUTCDate(),
  ).padStart(2, "0")}`;
}

function ReadSettings() {
  try {
    return { muted: false, tutorialClosed: false, ...JSON.parse(localStorage.getItem(settingKey) || "{}") };
  } catch {
    return { muted: false, tutorialClosed: false };
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
const audio = CreateAudioSystem();
audio.SetMuted(settings.muted);
let campState = LoadCampState();
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
const activeTouchPointers = new Map();
let pinchDistance = null;
let pinchActive = false;
let activeAbility = null;
let routeHintIndex = 0;
let toastTimeout = null;
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
  return {
    x: Clamp(position.x, missionDefinition.bounds.minimumX, missionDefinition.bounds.maximumX),
    z: Clamp(position.z, missionDefinition.bounds.minimumZ, missionDefinition.bounds.maximumZ),
  };
}

function PositionBlocked(position, radius = 0.65) {
  return missionDefinition.obstacles.some((obstacle) => PointInsideBox(position, obstacle, radius));
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
  PushMessage("alert", `${unit.name}携带的任务物资遗落在现场，必须重新取回。`);
}

function FinalizeCarriedItems() {
  const recovered = new Set(
    state.units
      .filter((unit) => unit.state !== "dead" && unit.state !== "downed")
      .flatMap((unit) => unit.carriedItems ?? []),
  );
  state.supplies.medicine = recovered.has("medicines") ? 2 : 0;
  state.supplies.radioParts = recovered.has("radioParts") ? 1 : 0;
  state.supplies.tools = recovered.has("tools") ? 1 : 0;
  for (const objectiveId of ["ledger", "medicines", "radioParts", "tools"]) {
    state.objectives[objectiveId] = recovered.has(objectiveId);
  }
}

function FireUnitAtEnemy(unit, enemy, suppressOnly = false) {
  if (unit.ammo <= 0 || enemy.health <= 0 || enemy.disabled) return false;
  if (Distance(unit, enemy) > 23) return false;
  const hasClearShot = HasLineOfSight(unit, enemy);
  const obstacleImpact = hasClearShot ? null : GetBallisticImpact(unit, enemy);
  if (!hasClearShot && !obstacleImpact) return false;
  const definition = GetCharacterDefinition(unit.id);
  const burst = unit.id === "weiShouyi" || suppressOnly ? Math.min(4, unit.ammo) : 1;
  unit.ammo -= burst;
  unit.shotCooldown = unit.id === "weiShouyi" ? 0.9 : 1.25;
  state.ledger.shotsFired += burst;
  state.alertLevel = Math.max(state.alertLevel, 1);
  if (obstacleImpact) {
    world?.SpawnTracer(unit, obstacleImpact, definition?.accent ? Number.parseInt(definition.accent.slice(1), 16) : 0xffd17a);
    world?.SpawnImpact?.(obstacleImpact, obstacleImpact.material);
    EmitSound(unit, unit.id === "weiShouyi" ? 54 : 46, "gunshot");
    audio.Play("gunshot");
    return true;
  }
  const damage = suppressOnly ? 5 : unit.id === "weiShouyi" ? 17 : unit.id === "hanShilei" ? 28 : 22;
  enemy.health = Math.max(0, enemy.health - damage);
  enemy.suppression = Clamp(enemy.suppression + (suppressOnly ? 42 : 30), 0, 100);
  enemy.morale = Clamp(enemy.morale - (suppressOnly ? 14 : 20), 0, 100);
  enemy.lastKnown = { x: unit.x, z: unit.z, time: state.time };
  enemy.state = enemy.health <= 0 ? "disabled" : "combat";
  if (enemy.health <= 0) {
    enemy.disabled = true;
    state.ledger.enemiesDisabled += 1;
    PushMessage("combat", `${GetEnemyRoleDefinition(enemy.role).name}失去行动能力。`);
  }
  world?.SpawnTracer(unit, enemy, definition?.accent ? Number.parseInt(definition.accent.slice(1), 16) : 0xffd17a);
  world?.SpawnImpact?.(enemy, "body");
  EmitSound(unit, unit.id === "weiShouyi" ? 54 : 46, "gunshot");
  audio.Play("gunshot");
  return true;
}

function OnEnemyShot(enemy, target) {
  if (state.paused || target.state === "downed" || target.state === "evacuated") return;
  target.suppression = Clamp(target.suppression + 24, 0, 100);
  const foliage = GetZoneAt(target)?.kind === "foliage";
  const cover = GetCoverAt(target, enemy);
  const baseDamage = target.stance === "crouch" || foliage ? 5 : 8;
  const damage = Math.max(1, Math.round(baseDamage * GetCoverDamageMultiplier(cover)));
  target.health = Math.max(0, target.health - damage);
  world?.SpawnTracer(enemy, target, 0xd68b65);
  world?.SpawnImpact?.(target, "body");
  EmitSound(enemy, 42, "gunshot");
  audio.Play("enemyShot");
  if (target.health <= 0) DownUnit(target);
}

function OnReinforcement() {
  const existing = state.enemies.filter((enemy) => enemy.id.startsWith("reinforcement")).length;
  if (existing >= 6) return;
  const target = state.enemies.find((enemy) => enemy.lastKnown)?.lastKnown ?? { x: 28, z: 4 };
  for (let index = 0; index < 3; index += 1) {
    const roleId = index === 0 ? "leader" : "patrol";
    const role = GetEnemyRoleDefinition(roleId);
    state.enemies.push({
      id: `reinforcement_${existing + index}`,
      role: roleId,
      x: 57 - index * 1.4,
      z: -7 + index * 2,
      facing: -1.4,
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
  if (unit.health < unit.maximumHealth * 0.5) multiplier *= 0.82;
  if (unit.state === "wounded") multiplier *= 0.55;
  return definition.speed * multiplier * (unit.speedMultiplier ?? 1);
}

function ApplyExplosionConsequences(position, radius = 12) {
  const HasBlastLine = (target) =>
    HasLineOfSight(
      position,
      target,
      missionDefinition.obstacles.filter(
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
  for (const civilianId of ["detainee", "seedGrain"]) {
    const definition = GetInteractable(civilianId);
    if (!definition || state.interactables[civilianId]?.completed) continue;
    const distance = Distance(position, definition);
    if (distance <= radius + 3) state.ledger.civilianRisk += 1;
    if (distance <= radius * 0.45 && HasBlastLine(definition)) state.ledger.civilianHarm += 1;
  }
}

function IsUnitHidden(unit) {
  return unit.stance === "crouch" && IsConcealmentZone(unit);
}

function CompleteInteraction(unit, interactable, isExplosive = false) {
  const runtime = state.interactables[interactable.id];
  if (!runtime || runtime.completed) return;
  runtime.completed = true;
  runtime.progress = 1;
  runtime.droppedAt = null;
  audio.Play(isExplosive ? "explosion" : interactable.kind === "objective" ? "objective" : "interaction");

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
    command.waypoints = FindPath2D(unit, command, { clearance: 0.68 });
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
    const radius = GetSoundRadius(unit);
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
  const duration = explosive ? 3.8 : definition.duration * specialistScale;
  command.progress = (command.progress ?? 0) + deltaTime;
  runtime.progress = Clamp(command.progress / duration, 0, 1);
  if (command.progress >= duration) {
    CompleteInteraction(unit, definition, explosive);
    unit.command = null;
  }
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
  for (const unit of state.units) {
    unit.inLight = IsPositionLit(unit, state.environment);
    unit.inDust = Boolean(
      state.environment.dustCloud &&
      Distance(unit, state.environment.dustCloud) <= state.environment.dustCloud.radius,
    );
  }
  for (const definition of missionDefinition.interactables) {
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
    const waypoints = FindPath2D(unit, point, { clearance: 0.68 });
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
  state.selectedUnitIds.forEach((unitId, index) => {
    const offset = state.selectedUnitIds.length > 1 ? { x: (index % 2) * 1.4, z: Math.floor(index / 2) * 1.4 } : { x: 0, z: 0 };
    if (
      QueueCommand(
        state,
        unitId,
        { kind: "move", x: bounded.x + offset.x, z: bounded.z + offset.z, label: "移动" },
        append,
      )
    ) queued += 1;
  });
  if (queued > 0) {
    RequestInteractiveRender(0.7);
    audio.Play("command");
    world?.SpawnRing(bounded, 0x8bc5ad, 1.6, 0.35);
    if (!state.paused) PushMessage("brief", `${queued} 名队员收到移动指令。`);
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
  QueueCommand(state, unit.id, { kind: "attack", targetId: enemy.id, label: `射击${GetEnemyRoleDefinition(enemy.role).name}` }, append);
  activeAbility = null;
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
    QueueCommand(state, unit.id, { kind: "hideBody", targetId: enemy.id, label: "隐蔽失能敌人" }, append);
    audio.Play("command");
    RenderHud();
    return;
  }
  if (CanSilentTakedown(unit, enemy)) {
    QueueCommand(
      state,
      unit.id,
      { kind: "takedown", targetId: enemy.id, label: `静默制服${GetEnemyRoleDefinition(enemy.role).name}` },
      append,
    );
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

function QueueAbilityCommand(unit, command) {
  const didQueue = QueueCommand(state, unit.id, command, false);
  if (!didQueue) {
    ShowToast("当前无法加入这项行动。");
    return false;
  }
  activeAbility = null;
  RequestInteractiveRender(0.7);
  audio.Play("command");
  ShowToast(state.paused ? "能力已纳入计划；恢复行动后结算。" : "能力指令已下达。");
  RenderHud();
  return true;
}

function UseAbility(abilityId) {
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
    QueueAbilityCommand(unit, { kind: "observe", targetId: enemy.id, label: `记哨：${GetEnemyRoleDefinition(enemy.role).name}` });
  } else if (abilityId === "stone") {
    activeAbility = "stone";
    ShowToast("在地图上选择落点。投石会制造一处带误差的声源。");
  } else if (abilityId === "sabotage") {
    const target = FindNearestInteractable(unit, (definition) => definition.action === "sabotage");
    if (target) QueueInteraction(target.id, false, false, "sabotage");
    else {
      activeAbility = "sabotage";
      ShowToast("选择交换机、发电机或铃索。");
    }
  } else if (abilityId === "charge") {
    activeAbility = "charge";
    ShowToast("选择可破坏设施。爆炸必然触发全区警报。");
  } else if (abilityId === "aid") {
    const patient = state.units
      .filter((candidate) => candidate.state === "downed" && Distance(unit, candidate) <= 6)
      .sort((left, right) => Distance(unit, left) - Distance(unit, right))[0];
    if (!patient) {
      ShowToast("6 米内没有倒地队员。");
      return;
    }
    QueueAbilityCommand(unit, { kind: "aid", targetId: patient.id, label: `压迫止血：${patient.name}` });
  } else if (abilityId === "steady") {
    QueueAbilityCommand(unit, { kind: "steady", label: "稳住附近队员" });
  } else if (abilityId === "suppress") {
    if (unit.ammo < 6) {
      ShowToast("至少需要 6 发弹药建立压制。");
      return;
    }
    activeAbility = "suppress";
    ShowToast("在地图上指定压制方向；它创造移动窗口，不保证击倒。");
  } else if (abilityId === "overwatch") {
    const ally = state.units
      .filter((candidate) => candidate.id !== unit.id && candidate.state === "ready" && Distance(unit, candidate) <= 9)
      .sort((left, right) => Distance(unit, left) - Distance(unit, right))[0];
    if (!ally) {
      ShowToast("需要 9 米内另一名可行动队员建立交叉警戒。");
      return;
    }
    QueueAbilityCommand(unit, { kind: "overwatch", targetId: ally.id, label: `交叉警戒：${ally.name}` });
  }
  RenderHud();
}

function UseTargetedAbility(position, pickedInteractableId = null) {
  const unit = GetSelectedUnit();
  if (!activeAbility || !unit) return false;
  if (activeAbility === "stone" && position) {
    if (Distance(unit, position) > 16) {
      ShowToast("投石落点必须在 16 米以内。");
      return true;
    }
    QueueAbilityCommand(unit, { kind: "stone", x: position.x, z: position.z, label: "投石诱敌" });
    return true;
  }
  if (activeAbility === "suppress" && position) {
    if (Distance(unit, position) > 20) {
      ShowToast("压制方向必须落在 20 米以内。");
      return true;
    }
    QueueAbilityCommand(unit, { kind: "suppress", x: position.x, z: position.z, label: "定点压制" });
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
    QueueInteraction(pickedInteractableId, false, activeAbility === "charge", activeAbility);
    return true;
  }
  return false;
}

function FindNearestInteractable(unit, predicate = () => true) {
  return missionDefinition.interactables
    .map((definition) => GetInteractable(definition.id))
    .filter((definition) => !state.interactables[definition.id]?.completed && predicate(definition))
    .sort((left, right) => Distance(unit, left) - Distance(unit, right))[0] ?? null;
}

function GetNearbyInteractable(unit) {
  return (
    missionDefinition.interactables
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
  if (UseTargetedAbility(pick.position, pick.kind === "interactable" ? pick.id : null)) return;
  if (pick.kind === "unit") {
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
  elements.resultSummary.textContent = evaluation.complete
    ? state.operation.resultSummary ?? "既定任务已经完成，行动组安全撤出。"
    : evaluation.summary;
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
    state.ledger.civilianHarm === 0 && state.ledger.civilianRisk === 0
      ? "群众代价账本：本次行动未造成群众伤亡，也未把民用品转化为战利品。击杀数不计入行动得分。"
      : `群众代价账本：受害 ${state.ledger.civilianHarm}，风险 ${state.ledger.civilianRisk}。这些记录不转化为物资或奖励。`;
  campState = ApplyMissionToCamp(campState, state);
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

function RenderCamp() {
  const evaluation = state.outcome ?? GetMissionEvaluation(state);
  const nextOperation =
    campaignOperationDefinitions[campState.completedMissions % campaignOperationDefinitions.length];
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
      ? `累计未记录群众伤亡；风险记录 ${campState.civilianCostLedger.risk}。`
      : `累计受害 ${campState.civilianCostLedger.harm}，风险 ${campState.civilianCostLedger.risk}。`;
  document.querySelectorAll("[data-camp-action]").forEach((button) => {
    button.disabled = campActionUsed;
  });
  const facilityLabels = {
    treat: `救护所 Lv.${campState.facilities.clinic ?? 1} · 药品 1`,
    repair: `工坊 Lv.${campState.facilities.workshop ?? 1} · 工具 1`,
    decode: `情报角 Lv.${campState.facilities.intelligence ?? 0} · 零件 1`,
    rest: `训练 Lv.${campState.facilities.training ?? 0} · 休整 1 日`,
  };
  for (const [actionId, label] of Object.entries(facilityLabels)) {
    const detail = document.querySelector(`[data-camp-action="${actionId}"] small`);
    if (detail) detail.textContent = label;
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
  const objectiveDefinitions = [
    { id: "ledger", name: "取得换防传令簿与线路图", detail: "交换室值房 · 必须" },
    { id: "relay", name: "剪断据点有线联络", detail: "手摇电话交换机 · 必须" },
    { id: "allExtracted", name: "行动组全员撤离", detail: "任选已解锁撤离点 · 必须" },
    { id: "detainee", name: "救出被扣交通员", detail: "北侧牛棚 · 可选" },
    { id: "medicines", name: "取回救护药箱", detail: "公路辎重车 · 可选" },
    { id: "generator", name: "关闭北墙探照灯", detail: "岗楼发电机 · 可选" },
    { id: "alarmBell", name: "剪断警报铃索", detail: "南院墙 · 可选" },
    { id: "rockfall", name: "引发采石坡落石", detail: "东南山路 · 可选" },
    { id: "radioParts", name: "取回通信零件", detail: "交换室外 · 可选" },
    { id: "seedGrain", name: "把种粮留还村民", detail: "兵舍北侧 · 可选" },
  ];
  const requiredIds = state.mainObjectiveIds;
  const optionalIds = ["detainee", "medicines", "seedGrain", "ledger", "relay", "radioParts", "generator", "alarmBell", "rockfall"]
    .filter((objectiveId) => !requiredIds.includes(objectiveId))
    .slice(0, 3);
  const objectiveRows = [...requiredIds, ...optionalIds]
    .map((objectiveId) => objectiveDefinitions.find((objective) => objective.id === objectiveId))
    .filter(Boolean)
    .map((objective) => ({
      ...objective,
      detail: objective.detail.replace(requiredIds.includes(objective.id) ? "可选" : "必须", requiredIds.includes(objective.id) ? "必须" : "可选"),
    }));
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
      const queueCount = unit.queue.length + (unit.command ? 1 : 0);
      const carriedNames = (unit.carriedItems ?? []).map((itemId) => {
        if (itemId === "ledger") return "线路册";
        if (itemId === "medicines") return "药箱";
        if (itemId === "radioParts") return "通信零件";
        if (itemId === "tools") return "工具卷";
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
      return `
        <button class="unitCard" type="button" data-unit-id="${unit.id}" data-index="F${index + 1}" aria-pressed="${state.selectedUnitIds.includes(unit.id)}">
          <strong>${definition.name}</strong>
          <small>${definition.role} · ${stateText}</small>
          <span class="unitHealth"><i style="width:${Clamp(unit.health / unit.maximumHealth, 0, 1) * 100}%"></i></span>
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
  elements.pauseButton.setAttribute("aria-pressed", String(state.paused));
  elements.pauseGlyph.textContent = state.paused ? "▶" : "Ⅱ";
  elements.pauseLabel.textContent = state.paused ? "执行计划" : "暂停规划";
  elements.planningBanner.classList.toggle("isHidden", !state.paused);
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
    paused: state.paused,
    time: state.time,
    hoverEnemyId: view.hoverEnemyId,
    soundEventCount: state.soundEvents.length,
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
  modal.classList.remove("isHidden");
  modal.querySelector("button")?.focus();
}

function CloseModal(modal) {
  modal?.classList.add("isHidden");
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
  elements.tutorialCard.classList.toggle("isHidden", settings.tutorialClosed);
  state.paused = true;
  state.planning = true;
  UpdateEnemyIntel(state, 0);
  RequestInteractiveRender(0.9);
  world?.FocusPosition({ x: -28, z: -15 }, 60);
  RenderHud();
  ShowToast(`${state.operation.name}：战术图已展开。空格执行；第一次报警不会立即失败。`);
}

function ShowNextRouteHint() {
  const hints = [
    { point: { x: -27, z: -18 }, text: "南侧高粱地：蹲行可降低辨认速度。" },
    { point: { x: -19, z: -2 }, text: "干水渠：遮住水平视线，但移动更慢。" },
    { point: { x: -4, z: 27 }, text: "北侧村庄：救出交通员可解锁芦苇渡口。" },
    { point: { x: 51, z: -22 }, text: "采石坡：落石能封东路，也会制造巨大声响。" },
  ];
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

function HandlePointerMove(event) {
  const hoverPick =
    screenMode === "mission" && event.pointerType !== "touch"
      ? world?.Pick(event.clientX, event.clientY)
      : null;
  view.currentPointerWorld = hoverPick?.position ?? world?.ScreenToGround(event.clientX, event.clientY);
  if (event.pointerType !== "touch") {
    const nextHoverEnemyId = hoverPick?.kind === "enemy" ? hoverPick.id : null;
    if (view.hoverEnemyId !== nextHoverEnemyId) {
      view.hoverEnemyId = nextHoverEnemyId;
      RequestInteractiveRender();
    }
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
  if (event.pointerType === "touch" || view.hoverEnemyId === null) return;
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
  if (event.key === "Escape") {
    activeAbility = null;
    CloseMobileDrawers();
    CloseModal(elements.helpModal);
    CloseModal(elements.briefingModal);
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
    if (ability) UseAbility(ability.id);
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
    if (abilityButton) UseAbility(abilityButton.dataset.abilityId);
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
    world = CreateWorld(elements.canvas, { quality: DetectQuality() });
    world.BuildActors(state);
    const operationNumber = campState.completedMissions + 1;
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
    const docketObjectiveNames = {
      ledger: "取得换防传令簿与线路图",
      relay: "剪断据点有线联络",
      detainee: "救出被扣交通员",
      medicines: "取回救护药箱",
      generator: "关闭北墙探照灯",
      alarmBell: "剪断警报铃索",
      radioParts: "取回通信零件",
      rockfall: "引发采石坡落石",
      allExtracted: "全员进入同一撤离点",
    };
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
