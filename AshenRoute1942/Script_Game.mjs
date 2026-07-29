import * as THREE from "../taihang/vendor/three/build/three.module.mjs";
import * as Story from "./Data_Story.mjs?v=20260730s";
import * as Level from "./Data_Level.mjs?v=20260730s";
import * as Systems from "./Script_GameplaySystems.mjs?v=20260730s";
import * as Narrative from "./Script_NarrativeState.mjs?v=20260730s";
import * as KilnDefense from "./Script_KilnDefense.mjs?v=20260730s";
import { CreatePresentation, GetTerrainHeight } from "./Script_Presentation.mjs?v=20260730s";

const settingsKey = "AshenRoute1942_Settings_V2";
const checkpointKey = "AshenRoute1942_Checkpoint_V1";
const fixedStep = 1 / 60;
const qaMode = new URLSearchParams(window.location.search).get("qa") === "1";

function Element(id) {
  return document.getElementById(id);
}

const elements = {
  shell: Element("GameShell"),
  canvas: Element("GameCanvas"),
  loading: Element("LoadingScreen"),
  loadingFill: Element("LoadingFill"),
  loadingStatus: Element("LoadingStatus"),
  title: Element("TitleScreen"),
  begin: Element("BeginButton"),
  continueButton: Element("ContinueButton"),
  openSettings: Element("OpenSettingsButton"),
  openHistory: Element("OpenHistoryButton"),
  briefing: Element("BriefingScreen"),
  briefingEyebrow: Element("BriefingEyebrow"),
  briefingTitle: Element("BriefingTitle"),
  briefingBody: Element("BriefingBody"),
  briefingProgress: Element("BriefingProgress"),
  briefingNext: Element("BriefingNextButton"),
  hud: Element("GameHud"),
  chapterLabel: Element("ChapterLabel"),
  missionClock: Element("MissionClock"),
  missionTitle: Element("MissionTitle"),
  objectiveText: Element("ObjectiveText"),
  directionCaption: Element("DirectionCaption"),
  directionLabel: Element("DirectionLabel"),
  directionText: Element("DirectionText"),
  pauseButton: Element("PauseButton"),
  compassLabel: Element("CompassLabel"),
  companionPanel: Element("CompanionPanel"),
  companionStatus: Element("CompanionStatus"),
  companionHealth: Element("CompanionHealth"),
  healthFill: Element("HealthFill"),
  healthText: Element("HealthText"),
  staminaFill: Element("StaminaFill"),
  bottleCount: Element("BottleCount"),
  bandageCount: Element("BandageCount"),
  ammoCount: Element("AmmoCount"),
  detectionMeter: Element("DetectionMeter"),
  detectionSource: Element("DetectionSource"),
  detectionFill: Element("DetectionFill"),
  detectionState: Element("DetectionState"),
  worldMarker: Element("WorldMarker"),
  markerLabel: Element("MarkerLabel"),
  markerDistance: Element("MarkerDistance"),
  aimReticle: Element("AimReticle"),
  subtitlePanel: Element("SubtitlePanel"),
  subtitleSpeaker: Element("SubtitleSpeaker"),
  subtitleText: Element("SubtitleText"),
  interactionPrompt: Element("InteractionPrompt"),
  interactionLabel: Element("InteractionLabel"),
  controlHints: Element("ControlHints"),
  choice: Element("ChoiceScreen"),
  choiceEyebrow: Element("ChoiceEyebrow"),
  choiceTitle: Element("ChoiceTitle"),
  choiceBody: Element("ChoiceBody"),
  choiceOptions: Element("ChoiceOptions"),
  inventory: Element("InventoryScreen"),
  closeInventory: Element("CloseInventoryButton"),
  inventoryItems: Element("InventoryItems"),
  craftBandage: Element("CraftBandageButton"),
  craftDecoy: Element("CraftDecoyButton"),
  inventoryHint: Element("InventoryHint"),
  document: Element("DocumentScreen"),
  closeDocument: Element("CloseDocumentButton"),
  documentType: Element("DocumentType"),
  documentTitle: Element("DocumentTitle"),
  documentBody: Element("DocumentBody"),
  documentContext: Element("DocumentContext"),
  pause: Element("PauseScreen"),
  pauseChapterTitle: Element("PauseChapterTitle"),
  resume: Element("ResumeButton"),
  restartCheckpoint: Element("RestartCheckpointButton"),
  pauseSettings: Element("PauseSettingsButton"),
  pauseHistory: Element("PauseHistoryButton"),
  returnTitle: Element("ReturnTitleButton"),
  settings: Element("SettingsScreen"),
  history: Element("HistoryScreen"),
  soundToggle: Element("SoundToggle"),
  distressToggle: Element("DistressToggle"),
  motionToggle: Element("MotionToggle"),
  contrastToggle: Element("ContrastToggle"),
  textToggle: Element("TextToggle"),
  chapterCard: Element("ChapterCard"),
  cardNumber: Element("CardNumber"),
  cardTitle: Element("CardTitle"),
  cardTime: Element("CardTime"),
  cardObjective: Element("CardObjective"),
  cardHint: Element("CardHint"),
  failure: Element("FailureScreen"),
  failureTitle: Element("FailureTitle"),
  failureBody: Element("FailureBody"),
  retry: Element("RetryButton"),
  ending: Element("EndingScreen"),
  endingEyebrow: Element("EndingEyebrow"),
  endingTitle: Element("EndingTitle"),
  endingQuote: Element("EndingQuote"),
  endingConsequences: Element("EndingConsequences"),
  endingBody: Element("EndingBody"),
  replay: Element("ReplayButton"),
  qaPanel: Element("QaPanel"),
  qaStatus: Element("QaStatus"),
  qaHide: Element("QaHideButton"),
  qaMove: Element("QaMoveButton"),
  qaFalseTrail: Element("QaFalseTrailButton"),
  qaSeal: Element("QaSealButton"),
  qaAdvance: Element("QaAdvanceButton"),
  qaStation: Element("QaStationButton"),
  qaStealth: Element("QaStealthButton"),
  qaCombat: Element("QaCombatButton"),
  qaEnding: Element("QaEndingButton"),
  qaLowHealth: Element("QaLowHealthButton"),
  qaWalk: Element("QaWalkButton"),
  qaCrouch: Element("QaCrouchButton"),
  qaSprint: Element("QaSprintButton"),
  qaFire: Element("QaFireButton"),
  toast: Element("Toast"),
  liveRegion: Element("LiveRegion"),
  damageVeil: Element("DamageVeil"),
  detectionVeil: Element("DetectionVeil"),
};

const fallbackTargets = Object.freeze({
  oldMill: { x: 0, z: 59 },
  millStoneSignal: { x: 2.5, z: 54 },
  stationCellarDoor: { x: -4, z: 42 },
  handcartAxle: { x: 5, z: 27 },
  eastGateLatch: { x: 23.8, z: -7.7 },
  ditchObservationPoint: { x: -2, z: -4 },
  warningLine: { x: 8, z: -27 },
  culvertNorthMouth: { x: -2, z: -55 },
  limeKilnMouth: { x: 4, z: -78 },
  ridgeSignalWindow: { x: -7, z: -96 },
  culvertDecisionPoint: { x: 0, z: -106 },
  safeRidge: { x: -1, z: -114 },
});

const fallbackStages = Object.freeze([
  { stageId: "reachOldMill", objectiveId: "reachOldMill", targetId: "oldMill", mode: "reach", radius: 7, title: "无灯的磨坊" },
  { stageId: "readStoneSignal", objectiveId: "readStoneSignal", targetId: "millStoneSignal", mode: "interact", radius: 3.2, title: "三颗石子" },
  { stageId: "meetStationKeeper", objectiveId: "meetStationKeeper", targetId: "stationCellarDoor", mode: "interact", radius: 3.2, title: "站里的人" },
  { stageId: "prepareQuietPassage", objectiveId: "prepareQuietPassage", targetId: "handcartAxle", mode: "interact", radius: 3.4, title: "垫住车轴" },
  { stageId: "openEastGate", objectiveId: "openEastGate", targetId: "eastGateLatch", mode: "interact", radius: 3.2, title: "东侧小门" },
  { stageId: "reachIrrigationDitch", objectiveId: "reachIrrigationDitch", targetId: "ditchObservationPoint", mode: "interact", radius: 3.4, title: "先听再走" },
  { stageId: "disableWarningLine", objectiveId: "disableWarningLine", targetId: "warningLine", mode: "interact", radius: 3.4, title: "哑掉的铜铃" },
  { stageId: "crossDrainageCulvert", objectiveId: "crossDrainageCulvert", targetId: "culvertNorthMouth", mode: "reach", radius: 6, title: "水声盖住脚步" },
  { stageId: "holdKilnMouth", objectiveId: "holdKilnMouth", targetId: "limeKilnMouth", mode: "hold", radius: 12, holdSeconds: 18, title: "只争十八秒" },
  { stageId: "waitForClearSignal", objectiveId: "waitForClearSignal", targetId: "ridgeSignalWindow", mode: "wait", radius: 7, holdSeconds: 7, title: "亮一下，灭两下" },
  { stageId: "decideRouteFate", objectiveId: "decideRouteFate", targetId: "culvertDecisionPoint", mode: "choice", radius: 5, title: "这条路的去留" },
  { stageId: "reachSafeRidge", objectiveId: "reachSafeRidge", targetId: "safeRidge", mode: "reach", radius: 4, title: "天亮以前" },
]);

const fallbackDialogue = Object.freeze({
  reachOldMill: [["赵同岑", "没有犬叫。村口比约定安静。"], ["方向字幕", "北面山背后传来卡车低鸣。"]],
  readStoneSignal: [["赵同岑", "三颗，尖头朝沟里。站里改了路。"], ["杜湘云", "我在窑下。别走大路。"]],
  meetStationKeeper: [["杜湘云", "十二个人，两个伤员。你护前，我收尾。"], ["赵同岑", "封锁线到哪儿了？"], ["杜湘云", "听得见铜铃的地方，都不算路。"]],
  prepareQuietPassage: [["杜湘云", "垫布，别让车轴叫。布用掉就没有包扎的了。"], ["赵同岑", "先让车过去。"]],
  reachIrrigationDitch: [["杜湘云", "左边两双靴，右边一盏灯。等灯扫过去。"]],
  disableWarningLine: [["赵同岑", "线断了。下一班岗会知道有人来过。"], ["杜湘云", "先让眼前的人过去。明天的路，明天再补。"]],
  openEastGate: [["杜湘云", "门闩也裹住。何芹才会带后队出院。"], ["赵同岑", "我开门，你按住车。"]],
  crossDrainageCulvert: [["何芹", "后队到沟口了。苗叔领着，一个没少。"], ["杜湘云", "水响的时候走，水停的时候停。"]],
  holdKilnMouth: [["杜湘云", "石板卡住了。给我十八秒。不要追出去。"], ["赵同岑", "我守窑口。你只管开路。"]],
  waitForClearSignal: [["方向字幕", "山脊灯光：亮一下，灭两下。"], ["杜湘云", "十二个人都过了。现在轮到这条路。"]],
  decideRouteFate: [["杜湘云", "封死水洞，今晚就安全。留下假脚印，交通线也许还能用。没有两全。"]],
  reachSafeRidge: [["赵同岑", "纸上的路烧了。"], ["杜湘云", "人记得，就不算断。"]],
});

let presentation = null;
let runtime = null;
let mode = "Loading";
let currentBriefingIndex = 0;
let accumulator = 0;
let lastFrameTime = performance.now();
let subtitleUntil = 0;
let subtitleDelayUntil = 0;
let subtitleQueue = [];
let activeInteraction = null;
let pendingDocumentCompanionLine = "";
let toastUntil = 0;
let frameCounter = 0;
let lastFootstepDistance = 0;
let qaMotionTimer = 0;

const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,
  aim: false,
  cameraYaw: 0,
  cameraPitch: -0.15,
};

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function Distance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.z || 0) - (b?.z || 0));
}

function Normalize2(vector) {
  const length = Math.hypot(vector.x, vector.z) || 1;
  return { x: vector.x / length, z: vector.z / length };
}

function Damp(current, target, smoothing, delta) {
  return current + (target - current) * (1 - Math.exp(-smoothing * Math.max(0, delta)));
}

function ReadJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function WriteJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Checkpoints are a convenience; the game remains playable without storage.
  }
}

function DefaultSettings() {
  return {
    sound: true,
    lowerDistress: false,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    highContrast: false,
    largeText: false,
  };
}

function LoadSettings() {
  return { ...DefaultSettings(), ...(ReadJson(settingsKey, {}) || {}) };
}

function ResolveTarget(targetId) {
  const candidates = [
    ...(Level.interactables || []),
    ...(Level.levelTriggers || []),
    ...(Level.storyTriggers || []),
    ...(Level.landmarks || []),
  ];
  const entry = candidates.find((candidate) => [candidate.targetId, candidate.interactableId, candidate.triggerId, candidate.landmarkId, candidate.id].includes(targetId));
  const position = entry?.position || entry?.center || entry?.target || fallbackTargets[targetId] || { x: 0, z: 0 };
  return { x: Number(position.x ?? position[0]) || 0, z: Number(position.z ?? position[2] ?? position[1]) || 0 };
}

function ResolveCurrentObjectivePosition(stage = CurrentStage()) {
  if (runtime && stage?.stageId === "prepareQuietPassage" && !runtime.flags.has("evacuationBriefed")) {
    const briefingTrigger = (Level.storyTriggers || []).find((trigger) => (
      (trigger.triggerId || trigger.id) === "triggerEvacuationBriefComplete"
    ));
    const briefingCenter = briefingTrigger?.position || briefingTrigger?.center;
    if (briefingCenter) {
      return {
        x: Number(briefingCenter.x ?? briefingCenter[0]) || 0,
        z: Number(briefingCenter.z ?? briefingCenter[2] ?? briefingCenter[1]) || 0,
      };
    }
  }
  if (runtime?.kilnDefense && stage?.stageId === "holdKilnMouth") {
    const kilnObjective = KilnDefense.GetKilnDefenseObjective(runtime.kilnDefense);
    if (kilnObjective?.position) return { ...kilnObjective.position };
  }
  if (runtime?.kilnDefense?.completed && stage?.stageId === "waitForClearSignal") {
    return { ...KilnDefense.KilnDefenseActions.at(-1).position };
  }
  return ResolveTarget(stage?.targetId);
}

function ObjectiveForStage(stage) {
  const objectiveId = stage?.objectiveId || stage?.stageId;
  const objective = (Story.objectives || []).find((candidate) => candidate.objectiveId === objectiveId);
  return objective?.text || objective?.shortText || stage?.objective || stage?.title || "沿交通线前进";
}

function Stages() {
  const authored = Story.missionStages || Story.storyStages || [];
  if (!authored.length) return fallbackStages;
  return fallbackStages.map((fallback) => {
    const match = authored.find((stage) => stage.stageId === fallback.stageId || stage.objectiveId === fallback.objectiveId);
    return { ...fallback, ...(match || {}), targetId: match?.targetId || match?.compassTargetId || fallback.targetId };
  });
}

function CreateRuntime() {
  const settings = LoadSettings();
  const gameplaySystems = Systems.CreateGameplaySystems({ seed: 1942 });
  const systemState = gameplaySystems.CreateGameplayState({ seed: 1942 });
  const patrolDefinitions = Level.patrolRoutes?.length ? Level.patrolRoutes : [
    { patrolId: "eastPatrol", points: [{ x: 12, z: 4 }, { x: 20, z: -17 }, { x: 7, z: -31 }] },
    { patrolId: "ditchPatrol", points: [{ x: -12, z: -18 }, { x: -5, z: -39 }, { x: 9, z: -44 }] },
    { patrolId: "kilnPatrol", points: [{ x: 13, z: -66 }, { x: 6, z: -84 }, { x: -10, z: -80 }] },
    { patrolId: "ridgePatrol", points: [{ x: -14, z: -91 }, { x: 5, z: -100 }, { x: 13, z: -89 }] },
  ];
  const enemyDefinitions = patrolDefinitions.flatMap((definition) => Array.from({ length: Math.max(1, definition.enemyCount || 1) }, (_, slotIndex) => ({ ...definition, slotIndex })));
  const enemies = enemyDefinitions.slice(0, 7).map((definition, index) => {
    const rawPoints = (definition.points || definition.waypoints || []).map((point) => ({ x: Number(point.x ?? point[0]) || 0, z: Number(point.z ?? point[1]) || 0 }));
    const points = rawPoints.length ? rawPoints.map((_, pointIndex) => rawPoints[(pointIndex + definition.slotIndex) % rawPoints.length]) : rawPoints;
    const first = points[0] || { x: (index % 2 ? 8 : -8), z: 5 - index * 24 };
    const enemyId = `${definition.patrolId || definition.routeId || "patrol"}_${definition.slotIndex + 1}`;
    const ai = Systems.CreateEnemyState({
      enemyId,
      position: first,
      forward: { x: 0, z: -1 },
      patrolPoints: points.length ? points : [first],
      searchAnchors: points,
      health: 100,
    }, gameplaySystems.config);
    return {
      enemyId,
      displayName: definition.factionId === "collaborationistSecurity" ? "伪军巡逻" : (definition.displayName || "封锁哨巡逻兵"),
      position: { ...first },
      forward: { x: 0, z: -1 },
      patrolPoints: points.length ? points : [first],
      patrolIndex: 0,
      state: "patrol",
      suspicion: 0,
      stateTime: 0,
      lastKnown: null,
      investigateTarget: null,
      fireCooldown: 0,
      health: 100,
      active: true,
      radioed: false,
      ai,
      intent: null,
    };
  });
  return {
    settings,
    systems: gameplaySystems,
    systemState,
    elapsedSeconds: 0,
    stageIndex: 0,
    stageTimer: 0,
    stageEnteredAt: 0,
    player: {
      position: {
        x: Number(Level.levelMetadata?.playerSpawn?.x) || -37,
        z: Number(Level.levelMetadata?.playerSpawn?.z) || 69,
      },
      velocity: { x: 0, z: 0 },
      facing: Math.PI,
      health: 100,
      maxHealth: 100,
      stamina: 100,
      crouched: false,
      sprinting: false,
      aiming: false,
      injured: false,
    },
    companion: {
      position: {
        x: Number(Level.levelMetadata?.companionSpawn?.x) || -34.5,
        z: Number(Level.levelMetadata?.companionSpawn?.z) || 67.5,
      },
      velocity: { x: 0, z: 0 },
      facing: Math.PI,
      active: true,
      command: "follow",
      health: 100,
      assisting: false,
      rescueUsed: false,
      ai: Systems.CreateCompanionState({ companionId: "duXiangyun", position: Level.levelMetadata?.companionSpawn || { x: -34.5, z: 67.5 }, active: true, ammo: 1, bandages: 1 }),
    },
    enemies,
    noises: [],
    decoys: [],
    resources: { ammo: 4, bottle: 2, bandage: 1, cloth: 2, alcohol: 1, scrap: 1, emptyCan: 1, tinCan: 0, herb: 1, stone: 4 },
    routeChoice: null,
    triggered: new Set(),
    flags: new Set(),
    counters: {
      ...(Story.narrativeStateDefaults?.counters || {}),
      alertLevel: 0,
      shotsFired: 0,
      kilnHoldSeconds: 0,
    },
    equipment: new Set(["wireCutters"]),
    triggerProgress: new Map(),
    kilnThreatEncountered: false,
    kilnThreatIds: new Set(),
    kilnDefense: KilnDefense.CreateKilnDefenseState(),
    documentsFound: new Set(),
    activeInteractionId: null,
    isDowned: false,
    holdCompleted: false,
    metrics: {
      alerts: 0,
      shotsFired: 0,
      enemiesInjured: 0,
      luresUsed: 0,
      damageTaken: 0,
      documentsFound: 0,
      quietPassagePrepared: false,
      warningLineCut: false,
      companionCommands: 0,
    },
  };
}

function ApplySettingsToUi() {
  const settings = runtime?.settings || LoadSettings();
  elements.soundToggle.checked = settings.sound;
  elements.distressToggle.checked = settings.lowerDistress;
  elements.motionToggle.checked = settings.reducedMotion;
  elements.contrastToggle.checked = settings.highContrast;
  elements.textToggle.checked = settings.largeText;
  elements.shell.classList.toggle("lowerDistress", settings.lowerDistress);
  elements.shell.classList.toggle("reducedMotion", settings.reducedMotion);
  elements.shell.classList.toggle("highContrast", settings.highContrast);
  elements.shell.classList.toggle("largeText", settings.largeText);
  presentation?.audio?.SetMuted?.(!settings.sound);
}

function SaveSettingsFromUi() {
  if (!runtime) runtime = CreateRuntime();
  runtime.settings = {
    sound: elements.soundToggle.checked,
    lowerDistress: elements.distressToggle.checked,
    reducedMotion: elements.motionToggle.checked,
    highContrast: elements.contrastToggle.checked,
    largeText: elements.textToggle.checked,
  };
  WriteJson(settingsKey, runtime.settings);
  ApplySettingsToUi();
  ShowToast("辅助设置已保存。", 2.2);
}

function HideAllScreens() {
  [elements.title, elements.briefing, elements.hud, elements.choice, elements.inventory, elements.document, elements.pause, elements.settings, elements.history, elements.chapterCard, elements.failure, elements.ending]
    .forEach((screen) => { if (screen) screen.hidden = true; });
}

function SetMode(nextMode) {
  mode = nextMode;
  elements.shell.dataset.mode = nextMode;
  if (nextMode !== "Playing" && document.pointerLockElement === elements.canvas) document.exitPointerLock?.();
  UpdateQaStatus();
}

function OpenModal(modal) {
  modal.hidden = false;
  modal.dataset.returnMode = mode;
  if (mode === "Playing") SetMode("Modal");
  modal.querySelector("button,select,input")?.focus();
}

function CloseModal(modal) {
  modal.hidden = true;
  if (modal === elements.settings) SaveSettingsFromUi();
  const returnMode = modal.dataset.returnMode;
  if (returnMode === "Playing" || returnMode === "Paused") SetMode(returnMode);
}

function ShowToast(message, seconds = 2.2) {
  if (qaMode && /^QA[：:]/.test(String(message))) {
    toastUntil = 0;
    elements.toast.hidden = true;
    elements.liveRegion.textContent = message;
    return;
  }
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastUntil = performance.now() + seconds * 1000;
  elements.liveRegion.textContent = message;
}

function QueueDialogue(lines, replace = false) {
  const now = performance.now();
  if (replace) {
    subtitleQueue = [];
    subtitleUntil = 0;
    subtitleDelayUntil = 0;
    elements.subtitlePanel.hidden = true;
  }
  const queuedTail = subtitleQueue.length
    ? subtitleQueue.at(-1).readyAt + subtitleQueue.at(-1).duration * 1000
    : 0;
  const scheduleStart = replace ? now : Math.max(now, subtitleUntil, subtitleDelayUntil, queuedTail);
  subtitleQueue.push(...Narrative.BuildDialogueSchedule(lines || [], scheduleStart));
  if (elements.subtitlePanel.hidden) AdvanceDialogue();
}

function AdvanceDialogue() {
  if (!subtitleQueue.length) {
    elements.subtitlePanel.hidden = true;
    subtitleUntil = 0;
    subtitleDelayUntil = 0;
    return;
  }
  const now = performance.now();
  const line = subtitleQueue[0];
  if (line.readyAt > now + 1) {
    elements.subtitlePanel.hidden = true;
    subtitleUntil = 0;
    subtitleDelayUntil = line.readyAt;
    return;
  }
  subtitleQueue.shift();
  elements.subtitleSpeaker.textContent = line.speaker;
  elements.subtitleText.textContent = line.text;
  elements.subtitlePanel.hidden = false;
  subtitleDelayUntil = 0;
  subtitleUntil = now + line.duration * 1000;
}

function EventDialogue(event) {
  if (!event) return [];
  const lines = event.dialogue || event.lines || event.subtitles || (event.subtitle ? [event.subtitle] : null);
  if (Array.isArray(lines)) return lines;
  if (lines) return [lines];
  return event.text ? [{ speaker: event.speaker, text: event.text, duration: event.duration }] : [];
}

function AuthoredDialogue(stageId) {
  const storyEvents = Story.storyEvents || [];
  const matching = storyEvents.filter((event) => [event.stageId, event.triggerId, event.eventId].includes(stageId));
  const lines = matching.flatMap(EventDialogue);
  return lines.length ? lines : (fallbackDialogue[stageId] || []);
}

function BriefingCards() {
  const metadata = Story.storyMetadata || {};
  return [
    { eyebrow: metadata.dateLabel || "1942 年秋", title: "封锁在天亮前合拢", body: `日军封锁哨沿旧灌渠推进。${metadata.placeLabel || "槐树沟交通站"}得到的预警只有一句：天亮前，把人送过北坡。` },
    { eyebrow: `${metadata.placeLabel || "槐树沟"} · 复合创作地点`, title: "十二个人，不是一串数字", body: "两个伤员、三位老人、六名妇女和一名识字班教员已经离开村口。他们需要的是一条不响、不亮、没有脚印的路。" },
    { eyebrow: "赵同岑与杜湘云", title: "你们各自知道半条路", body: "赵同岑懂铁路、暗沟和封锁哨；杜湘云记得每户人家与每个临时落脚点。谁都不是谁的附属，也没有人能够独自完成转移。" },
  ];
}

function RenderBriefing() {
  const cards = BriefingCards();
  const card = cards[currentBriefingIndex];
  elements.briefingEyebrow.textContent = card.eyebrow;
  elements.briefingTitle.textContent = card.title;
  elements.briefingBody.innerHTML = `<p>${card.body}</p>`;
  elements.briefingProgress.innerHTML = cards.map((_, index) => `<i class="${index === currentBriefingIndex ? "active" : ""}"></i>`).join("");
  elements.briefingNext.querySelector("span").textContent = currentBriefingIndex === cards.length - 1 ? "出发" : "继续";
}

function BeginBriefing() {
  HideAllScreens();
  currentBriefingIndex = 0;
  RenderBriefing();
  elements.briefing.hidden = false;
  SetMode("Briefing");
  presentation?.audio?.Enable?.();
}

function AdvanceBriefing() {
  const cards = BriefingCards();
  if (currentBriefingIndex < cards.length - 1) {
    currentBriefingIndex += 1;
    RenderBriefing();
    return;
  }
  StartMission(false);
}

function ShowTitle() {
  HideAllScreens();
  elements.title.hidden = false;
  elements.continueButton.hidden = !ReadJson(checkpointKey);
  SetMode("Title");
  presentation?.audio?.SetIntensity?.(0.12);
}

function CurrentStage() {
  return Stages()[runtime?.stageIndex || 0] || Stages().at(-1);
}

function RestoreCheckpoint(checkpoint) {
  if (!checkpoint || !runtime) return;
  runtime.stageIndex = Clamp(checkpoint.stageIndex, 0, Stages().length - 1);
  runtime.player.position = { ...runtime.player.position, ...(checkpoint.playerPosition || {}) };
  runtime.player.health = Clamp(checkpoint.health ?? 100, 1, 100);
  runtime.resources = { ...runtime.resources, ...(checkpoint.resources || {}) };
  runtime.routeChoice = checkpoint.routeChoice || null;
  runtime.metrics = { ...runtime.metrics, ...(checkpoint.metrics || {}) };
  runtime.counters = { ...runtime.counters, ...(checkpoint.counters || {}) };
  (checkpoint.documentsFound || []).forEach((id) => runtime.documentsFound.add(id));
  (checkpoint.flags || []).forEach((id) => runtime.flags.add(id));
  (checkpoint.triggered || []).forEach((id) => runtime.triggered.add(id));
  runtime.companion.active = true;
  runtime.companion.position = ResolveCompanionResetPosition(runtime.player.position);
  runtime.companion.ai = Systems.CreateCompanionState({ ...runtime.companion.ai, position: runtime.companion.position, active: true, alive: true });
}

function StartMission(continueCheckpoint = false) {
  runtime = CreateRuntime();
  if (continueCheckpoint) RestoreCheckpoint(ReadJson(checkpointKey));
  ApplySettingsToUi();
  HideAllScreens();
  elements.hud.hidden = false;
  elements.controlHints.hidden = false;
  elements.qaPanel.hidden = true;
  SetMode("Playing");
  presentation?.audio?.Enable?.();
  presentation?.audio?.SetIntensity?.(0.22);
  SyncPresentation(true);
  EnterStage(runtime.stageIndex, true);
  ShowChapterCard();
}

function ShowChapterCard() {
  const stage = CurrentStage();
  elements.cardNumber.textContent = "第一章";
  elements.cardTitle.textContent = stage.title || "灯灭以后";
  elements.cardTime.textContent = "20:43";
  elements.cardObjective.textContent = ObjectiveForStage(stage);
  elements.cardHint.textContent = runtime.player.crouched ? "蹲下会降低脚步声，也会减慢移动。" : "先听，再走。交火不是唯一的通路。";
  elements.chapterCard.hidden = false;
  setTimeout(() => { elements.chapterCard.hidden = true; }, runtime.settings.reducedMotion ? 1300 : 2400);
}

function SaveCheckpoint() {
  if (!runtime) return;
  WriteJson(checkpointKey, {
    version: 1,
    stageIndex: runtime.stageIndex,
    playerPosition: runtime.player.position,
    health: runtime.player.health,
    resources: runtime.resources,
    routeChoice: runtime.routeChoice,
    metrics: runtime.metrics,
    counters: runtime.counters,
    flags: [...runtime.flags],
    triggered: [...runtime.triggered],
    documentsFound: [...runtime.documentsFound],
  });
}

function RestartCheckpoint() {
  StartMission(Boolean(ReadJson(checkpointKey)));
}

function TogglePause(forcePause = null) {
  if (!["Playing", "Paused"].includes(mode)) return;
  const shouldPause = forcePause ?? mode === "Playing";
  elements.pause.hidden = !shouldPause;
  elements.pauseChapterTitle.textContent = `第一章 · ${CurrentStage().title || "灯灭以后"}`;
  SetMode(shouldPause ? "Paused" : "Playing");
  if (!shouldPause) elements.canvas.focus();
}

function ToggleInventory(forceOpen = null) {
  if (!["Playing", "Inventory"].includes(mode)) return;
  const shouldOpen = forceOpen ?? mode === "Playing";
  elements.inventory.hidden = !shouldOpen;
  if (shouldOpen) {
    RenderInventory();
    SetMode("Inventory");
  } else {
    SetMode("Playing");
  }
}

function RenderInventory() {
  const labels = { ammo: "步枪弹", bottle: "空药瓶", bandage: "包扎带", cloth: "干净碎布", alcohol: "药酒", scrap: "铁皮", emptyCan: "空罐", tinCan: "响罐", herb: "止血草", stone: "圆石" };
  elements.inventoryItems.innerHTML = Object.entries(runtime.resources)
    .filter(([, count]) => count > 0)
    .map(([itemId, count]) => `<div><span>${labels[itemId] || itemId}</span><b>${count}</b></div>`).join("");
  const inventory = RuntimeInventory();
  elements.craftBandage.disabled = !runtime.systems.CanCraft(inventory, "bandage");
  elements.craftDecoy.disabled = !runtime.systems.CanCraft(inventory, "noiseBundle");
}

function RuntimeInventory() {
  return Systems.CreateInventory({
    materials: { cloth: runtime.resources.cloth, alcohol: runtime.resources.alcohol, scrap: runtime.resources.scrap },
    items: { bandage: runtime.resources.bandage, bottle: runtime.resources.bottle, emptyCan: runtime.resources.emptyCan, tinCan: runtime.resources.tinCan },
    weapon: { magazineCapacity: 4, magazineAmmo: runtime.resources.ammo, reserveAmmo: 0, condition: 0.82 },
  }, runtime.systems.config);
}

function ApplySystemInventory(inventory) {
  runtime.resources.cloth = inventory.materials.cloth;
  runtime.resources.alcohol = inventory.materials.alcohol;
  runtime.resources.scrap = inventory.materials.scrap;
  runtime.resources.bandage = inventory.items.bandage;
  runtime.resources.bottle = inventory.items.bottle;
  runtime.resources.emptyCan = inventory.items.emptyCan;
  runtime.resources.tinCan = inventory.items.tinCan;
  runtime.resources.ammo = inventory.weapon.magazineAmmo;
}

function Craft(recipeId) {
  const result = runtime.systems.CraftItem(RuntimeInventory(), recipeId);
  if (!result.ok) return ShowToast("手边的材料还不够。", 1.8);
  ApplySystemInventory(result.inventory);
  ShowToast(recipeId === "bandage" ? "做成一条包扎带。" : "铁皮包进空罐，声响会更远。", 2.4);
  EmitWorldNoise(runtime.player.position, 2.4, "craft");
  PlayAudio("cloth", runtime.player.position, 0.7);
  RenderInventory();
  UpdateHud();
}

async function Boot() {
  runtime = CreateRuntime();
  ApplySettingsToUi();
  elements.loadingFill.style.width = "22%";
  elements.loadingStatus.textContent = "辨认地形与风向……";
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    presentation = CreatePresentation(THREE, {
      canvas: elements.canvas,
      container: elements.shell,
      reducedMotion: runtime.settings.reducedMotion,
      enemyCount: runtime.enemies.length,
      createInterface: false,
      autoRender: false,
      muted: !runtime.settings.sound,
    });
    elements.loadingFill.style.width = "72%";
    elements.loadingStatus.textContent = "点亮远处的路标……";
    SyncPresentation(true);
    WireEvents();
    window.addEventListener("resize", () => presentation?.Resize?.());
    requestAnimationFrame(Frame);
    await new Promise((resolve) => setTimeout(resolve, 360));
    elements.loadingFill.style.width = "100%";
    elements.loadingStatus.textContent = "交通线已接通";
    await new Promise((resolve) => setTimeout(resolve, 260));
    elements.loading.hidden = true;
    ShowTitle();
    InstallQaApi();
  } catch (error) {
    console.error(error);
    elements.loadingStatus.textContent = "三维场景未能启动。请确认浏览器支持 WebGL 后刷新。";
    elements.loading.classList.add("failed");
  }
}

function WireEvents() {
  elements.begin.addEventListener("click", BeginBriefing);
  elements.continueButton.addEventListener("click", () => StartMission(true));
  elements.briefingNext.addEventListener("click", AdvanceBriefing);
  elements.openSettings.addEventListener("click", () => OpenModal(elements.settings));
  elements.openHistory.addEventListener("click", () => OpenModal(elements.history));
  elements.pauseButton.addEventListener("click", () => TogglePause(true));
  elements.resume.addEventListener("click", () => TogglePause(false));
  elements.restartCheckpoint.addEventListener("click", RestartCheckpoint);
  elements.retry.addEventListener("click", RestartCheckpoint);
  elements.pauseSettings.addEventListener("click", () => OpenModal(elements.settings));
  elements.pauseHistory.addEventListener("click", () => OpenModal(elements.history));
  elements.returnTitle.addEventListener("click", ShowTitle);
  elements.closeInventory.addEventListener("click", () => ToggleInventory(false));
  elements.closeDocument.addEventListener("click", CloseDocument);
  elements.craftBandage.addEventListener("click", () => Craft("bandage"));
  elements.craftDecoy.addEventListener("click", () => Craft("noiseBundle"));
  elements.replay.addEventListener("click", () => {
    localStorage.removeItem(checkpointKey);
    BeginBriefing();
  });
  document.querySelectorAll("[dataCloseModal]").forEach((button) => button.addEventListener("click", () => CloseModal(button.closest(".modalScreen"))));
  [elements.soundToggle, elements.distressToggle, elements.motionToggle, elements.contrastToggle, elements.textToggle]
    .forEach((control) => control.addEventListener("change", SaveSettingsFromUi));
  window.addEventListener("keydown", OnKeyDown);
  window.addEventListener("keyup", OnKeyUp);
  window.addEventListener("blur", ClearInput);
  document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "Playing") TogglePause(true); });
  elements.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  elements.canvas.addEventListener("pointerdown", OnCanvasPointerDown);
  elements.canvas.addEventListener("pointerup", OnCanvasPointerUp);
  document.addEventListener("pointermove", OnPointerMove);
  document.addEventListener("pointerlockchange", () => elements.shell.classList.toggle("pointerLocked", document.pointerLockElement === elements.canvas));
  if (qaMode) {
    elements.qaHide.addEventListener("click", () => { elements.qaPanel.hidden = true; });
    elements.qaMove.addEventListener("click", QaMoveToCurrentObjective);
    elements.qaFalseTrail.addEventListener("click", () => QaMoveToInteractable("falseTrailTools"));
    elements.qaSeal.addEventListener("click", () => QaMoveToInteractable("culvertCollapsePoint"));
    elements.qaAdvance.addEventListener("click", () => AdvanceStage("qa"));
    elements.qaStation.addEventListener("click", QaPrepareStation);
    elements.qaStealth.addEventListener("click", () => QaTeleport("reachIrrigationDitch"));
    elements.qaCombat.addEventListener("click", () => QaTeleport("holdKilnMouth"));
    elements.qaEnding.addEventListener("click", () => QaTeleport("decideRouteFate"));
    elements.qaLowHealth.addEventListener("click", () => {
      runtime.player.health = 40;
      runtime.player.injured = true;
      runtime.resources.bandage = 0;
      UpdateHud();
      ShowToast("QA：40 HP、无包扎带。", 1.8);
    });
    elements.qaWalk.addEventListener("click", () => RunQaMovement("walk"));
    elements.qaCrouch.addEventListener("click", () => RunQaMovement("crouch"));
    elements.qaSprint.addEventListener("click", () => RunQaMovement("sprint"));
    elements.qaFire.addEventListener("click", RunQaAimFireSequence);
  }
}

function OnKeyDown(event) {
  if (event.repeat && !["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(event.code)) return;
  if (mode === "Briefing" && (event.code === "Space" || event.code === "Enter")) {
    event.preventDefault();
    AdvanceBriefing();
    return;
  }
  if (event.code === "Escape") {
    if (mode === "Inventory") ToggleInventory(false);
    else if (mode === "Document") CloseDocument();
    else if (["Playing", "Paused"].includes(mode)) TogglePause();
    return;
  }
  if (mode !== "Playing") return;
  if (qaMode && event.code === "F5") {
    event.preventDefault();
    RunQaMovement("walk");
    return;
  }
  if (qaMode && event.code === "F6") {
    event.preventDefault();
    RunQaMovement("crouch");
    return;
  }
  if (qaMode && event.code === "F7") {
    event.preventDefault();
    RunQaMovement("sprint");
    return;
  }
  if (qaMode && event.code === "F8") {
    input.cameraYaw += Math.PI / 2;
    SyncPresentation(true);
    return;
  }
  if (qaMode && event.code === "F9") {
    RunQaAimFireSequence();
    return;
  }
  if (qaMode && event.code === "F10") {
    DamagePlayer(20);
    return;
  }
  if (event.code === "KeyW" || event.code === "ArrowUp") input.forward = true;
  if (event.code === "KeyS" || event.code === "ArrowDown") input.backward = true;
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = true;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = true;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") input.sprint = true;
  if (event.code === "KeyC") ToggleCrouch();
  if (event.code === "KeyF") PerformInteraction();
  if (event.code === "KeyQ") ThrowDecoy();
  if (event.code === "KeyH") UseBandage();
  if (event.code === "KeyE") ToggleCompanionCommand();
  if (event.code === "KeyI" || event.code === "Tab") {
    event.preventDefault();
    ToggleInventory(true);
  }
}

function OnKeyUp(event) {
  if (event.code === "KeyW" || event.code === "ArrowUp") input.forward = false;
  if (event.code === "KeyS" || event.code === "ArrowDown") input.backward = false;
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = false;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = false;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") input.sprint = false;
}

function OnCanvasPointerDown(event) {
  if (event.pointerType && event.pointerType !== "mouse") return;
  if (mode !== "Playing") return;
  presentation?.audio?.Enable?.();
  if (event.button === 2) {
    input.aim = true;
    runtime.player.aiming = true;
    elements.aimReticle.hidden = false;
  } else if (event.button === 0 && input.aim) {
    FireWeapon();
  } else if (event.button === 0 && document.pointerLockElement !== elements.canvas) {
    elements.canvas.requestPointerLock?.();
  }
}

function OnCanvasPointerUp(event) {
  if (event.pointerType && event.pointerType !== "mouse") return;
  if (event.button === 2) {
    input.aim = false;
    if (runtime) runtime.player.aiming = false;
    elements.aimReticle.hidden = true;
  }
}

function OnPointerMove(event) {
  if (event.pointerType && event.pointerType !== "mouse") return;
  if (mode !== "Playing" || document.pointerLockElement !== elements.canvas) return;
  input.cameraYaw -= event.movementX * 0.0023;
  input.cameraPitch = Clamp(input.cameraPitch - event.movementY * 0.0018, -0.62, 0.32);
}

function ClearInput() {
  input.forward = input.backward = input.left = input.right = input.sprint = input.aim = false;
}

function RunQaMovement(style) {
  if (!qaMode) return;
  if (!runtime || mode !== "Playing") StartMission(false);
  clearTimeout(qaMotionTimer);
  ClearInput();
  presentation?.playerRig?.animator?.Reset?.();
  runtime.player.position = {
    x: Number(Level.levelMetadata?.playerSpawn?.x) || -37,
    z: Number(Level.levelMetadata?.playerSpawn?.z) || 69,
  };
  runtime.player.velocity = { x: 0, z: 0 };
  runtime.player.stamina = 100;
  const shouldCrouch = style === "crouch";
  runtime.player.crouched = shouldCrouch;
  input.forward = true;
  input.sprint = style === "sprint";
  ShowToast(`QA：${style === "crouch" ? "蹲走" : style === "sprint" ? "冲刺" : "步行"} 3 秒`, 1.2);
  qaMotionTimer = setTimeout(() => {
    ClearInput();
    UpdateQaStatus();
    ShowToast("QA：移动采样完成", 1.2);
  }, 3000);
}

function RunQaAimFireSequence() {
  if (!qaMode) return;
  if (!runtime || mode !== "Playing") StartMission(false);
  clearTimeout(qaMotionTimer);
  ClearInput();
  runtime.player.velocity = { x: 0, z: 0 };
  runtime.player.sprinting = false;
  runtime.player.aiming = true;
  runtime.player.facing = Math.atan2(-Math.sin(input.cameraYaw), -Math.cos(input.cameraYaw));
  input.aim = true;
  runtime.resources.ammo = Math.max(1, Number(runtime.resources.ammo) || 0);
  elements.aimReticle.hidden = false;
  ShowToast("QA：举枪瞄准……", 1.1);
  UpdateHud();
  qaMotionTimer = setTimeout(() => {
    if (!runtime || mode !== "Playing") return;
    FireWeapon();
    UpdateQaStatus();
    qaMotionTimer = setTimeout(() => {
      if (!runtime) return;
      input.aim = false;
      runtime.player.aiming = false;
      elements.aimReticle.hidden = true;
      UpdateQaStatus();
    }, 900);
  }, 650);
}

function ToggleCrouch() {
  if (mode !== "Playing") return;
  runtime.player.crouched = !runtime.player.crouched;
  ShowToast(runtime.player.crouched ? "压低身体，脚步更轻。" : "站起。", 1.3);
}

function ToggleCompanionCommand() {
  if (mode !== "Playing" || !runtime.companion.active) {
    ShowToast("杜湘云还没有与你会合。", 1.8);
    return;
  }
  runtime.companion.command = runtime.companion.command === "follow" ? "stay" : "follow";
  const commandResult = Systems.SetCompanionCommand(
    runtime.companion.ai,
    runtime.companion.command === "stay" ? Systems.CompanionCommandIds.STAY : Systems.CompanionCommandIds.FOLLOW,
    { position: runtime.companion.position, timeSeconds: runtime.elapsedSeconds },
  );
  runtime.companion.ai = commandResult.state;
  runtime.metrics.companionCommands += 1;
  QueueDialogue([["赵同岑", runtime.companion.command === "stay" ? "湘云，先留在这儿。" : "湘云，跟我走。"], ["杜湘云", runtime.companion.command === "stay" ? "我看着后路。" : "走。"]]);
  UpdateHud();
}

function Frame(frameTime) {
  const delta = Clamp((frameTime - lastFrameTime) / 1000, 0, 0.05);
  lastFrameTime = frameTime;
  frameCounter += 1;
  if (mode === "Playing") {
    accumulator = Math.min(accumulator + delta, fixedStep * 5);
    while (accumulator >= fixedStep) {
      UpdateGame(fixedStep);
      accumulator -= fixedStep;
    }
  } else {
    UpdatePresentation(delta);
  }
  presentation?.Render?.();
  if (!presentation?.Render) presentation?.renderer?.render?.(presentation.scene, presentation.camera);
  if (subtitleUntil && performance.now() >= subtitleUntil) {
    subtitleUntil = 0;
    AdvanceDialogue();
  } else if (subtitleDelayUntil && performance.now() >= subtitleDelayUntil) {
    subtitleDelayUntil = 0;
    AdvanceDialogue();
  }
  if (toastUntil && performance.now() >= toastUntil) {
    toastUntil = 0;
    elements.toast.hidden = true;
  }
  requestAnimationFrame(Frame);
}

function UpdateGame(delta) {
  runtime.elapsedSeconds += delta;
  runtime.stageTimer += delta;
  UpdatePlayer(delta);
  UpdateKilnDefenseRuntime(delta);
  UpdateCompanion(delta);
  UpdateEnemies(delta);
  UpdateDecoys(delta);
  UpdateStage(delta);
  UpdateNearbyInteraction();
  UpdatePresentation(delta);
  UpdateHud();
}

function MovementAxes() {
  const keyboardX = Number(input.right) - Number(input.left);
  const keyboardY = Number(input.forward) - Number(input.backward);
  let x = Clamp(keyboardX, -1, 1);
  let y = Clamp(keyboardY, -1, 1);
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  return { x, y, magnitude: Math.min(1, length) };
}

function UpdatePlayer(delta) {
  if (runtime.isDowned) return;
  const axes = MovementAxes();
  const forward = { x: -Math.sin(input.cameraYaw), z: -Math.cos(input.cameraYaw) };
  const right = { x: Math.cos(input.cameraYaw), z: -Math.sin(input.cameraYaw) };
  const desired = Normalize2({ x: forward.x * axes.y + right.x * axes.x, z: forward.z * axes.y + right.z * axes.x });
  const canSprint = input.sprint && !runtime.player.crouched && runtime.player.stamina > 4 && axes.magnitude > 0.25;
  runtime.player.sprinting = canSprint;
  const speed = axes.magnitude * (runtime.player.crouched ? 1.75 : (canSprint ? 4.8 : 2.75));
  const targetVelocity = axes.magnitude > 0.02 ? { x: desired.x * speed, z: desired.z * speed } : { x: 0, z: 0 };
  runtime.player.velocity.x = Damp(runtime.player.velocity.x, targetVelocity.x, axes.magnitude ? 13 : 18, delta);
  runtime.player.velocity.z = Damp(runtime.player.velocity.z, targetVelocity.z, axes.magnitude ? 13 : 18, delta);
  if (canSprint) runtime.player.stamina = Math.max(0, runtime.player.stamina - 22 * delta);
  else runtime.player.stamina = Math.min(100, runtime.player.stamina + (axes.magnitude > 0.2 ? 9 : 16) * delta);
  const next = {
    x: runtime.player.position.x + runtime.player.velocity.x * delta,
    z: runtime.player.position.z + runtime.player.velocity.z * delta,
  };
  const resolved = ResolvePlayerCollision(next, runtime.player.position);
  runtime.player.position.x = resolved.x;
  runtime.player.position.z = resolved.z;
  if (runtime.player.aiming) {
    runtime.player.facing = Math.atan2(forward.x, forward.z);
  } else if (Math.hypot(runtime.player.velocity.x, runtime.player.velocity.z) > 0.12) {
    runtime.player.facing = Math.atan2(runtime.player.velocity.x, runtime.player.velocity.z);
  }
  const moved = Math.hypot(runtime.player.velocity.x, runtime.player.velocity.z) * delta;
  lastFootstepDistance += moved;
  const stepDistance = runtime.player.sprinting ? 1.25 : (runtime.player.crouched ? 2 : 1.55);
  if (lastFootstepDistance >= stepDistance) {
    lastFootstepDistance = 0;
    const radius = runtime.player.sprinting ? 10 : (runtime.player.crouched ? 2.5 : 5.1);
    EmitWorldNoise(runtime.player.position, radius, runtime.player.sprinting ? "sprint" : "footstep");
    PlayAudio(runtime.player.crouched ? "crouchStep" : "footstep", runtime.player.position, runtime.player.sprinting ? 1 : 0.62);
  }
}

function CollisionVolumes() {
  const authored = Level.collisionVolumes || Level.obstacles || [];
  if (authored.length) return authored;
  return [
    { x: -29, z: 52, radius: 4.6 }, { x: -20, z: 32, radius: 3.9 }, { x: -7, z: 20, radius: 3.6 },
    { x: 3, z: 13, radius: 4.1 }, { x: 13, z: 4, radius: 4.5 }, { x: 20, z: -7, radius: 3.7 },
    { x: 8, z: -42, radius: 4.2 }, { x: -27, z: -79, radius: 4.3 },
  ];
}

function SystemObstacles() {
  return CollisionVolumes().map((obstacle) => ({
    ...obstacle,
    position: obstacle.position || obstacle.center || { x: obstacle.x, z: obstacle.z },
    radius: obstacle.radius || obstacle.collisionRadius || 0,
    blocksVision: obstacle.blocksVision !== false,
    visionTransmission: obstacle.visionTransmission ?? 0,
    acousticTransmission: obstacle.acousticTransmission ?? 0.42,
  }));
}

function ResolvePlayerCollision(next, previous) {
  const resolved = { x: Clamp(next.x, -56, 56), z: Clamp(next.z, -112, 73) };
  for (const obstacle of CollisionVolumes()) {
    const center = obstacle.position || obstacle.center || obstacle;
    const x = Number(center.x ?? center[0]) || 0;
    const z = Number(center.z ?? center[2] ?? center[1]) || 0;
    const radius = Number(obstacle.radius || obstacle.collisionRadius || Math.max(obstacle.width || 0, obstacle.depth || 0) * 0.5) || 0;
    if (!radius) continue;
    const dx = resolved.x - x;
    const dz = resolved.z - z;
    const distance = Math.hypot(dx, dz);
    const minimum = radius + 0.52;
    if (distance < minimum) {
      if (distance < 0.001) return { ...previous };
      resolved.x = x + dx / distance * minimum;
      resolved.z = z + dz / distance * minimum;
    }
  }
  return resolved;
}

function EmitWorldNoise(position, radius, kind = "impact") {
  const kindMap = {
    footstep: Systems.NoiseKindIds.FOOTSTEP,
    sprint: Systems.NoiseKindIds.SPRINT,
    gunshot: Systems.NoiseKindIds.GUNSHOT,
    dryFire: Systems.NoiseKindIds.DRY_FIRE,
    bottleBreak: Systems.NoiseKindIds.BOTTLE_BREAK,
    craft: Systems.NoiseKindIds.IMPACT,
    bandage: Systems.NoiseKindIds.IMPACT,
    impact: Systems.NoiseKindIds.IMPACT,
  };
  const noise = runtime.systems.EmitNoise({
    eventId: `${kind}_${Math.round(runtime.elapsedSeconds * 1000)}_${runtime.noises.length}`,
    sourceId: "player",
    kindId: kindMap[kind] || Systems.NoiseKindIds.IMPACT,
    position: { x: position.x, z: position.z },
    radius,
    loudness: 1,
    timestamp: runtime.elapsedSeconds,
    durationSeconds: kind === "gunshot" ? 0.8 : 0.3,
  }, runtime.elapsedSeconds);
  runtime.noises.push(noise);
  runtime.noises = Systems.PruneNoises(runtime.noises, runtime.elapsedSeconds, runtime.systems.config);
  return noise;
}

function ThrowDecoy() {
  if (mode !== "Playing" || (runtime.resources.bottle <= 0 && runtime.resources.tinCan <= 0)) {
    if (mode === "Playing") ShowToast("没有能制造声响的东西了。", 1.8);
    return;
  }
  const forward = { x: -Math.sin(input.cameraYaw), z: -Math.cos(input.cameraYaw) };
  const typeId = runtime.resources.bottle > 0 ? Systems.LureTypeIds.BOTTLE : Systems.LureTypeIds.TIN_CAN;
  const result = runtime.systems.ThrowLure(RuntimeInventory(), {
    actorId: "zhaoTongcen",
    typeId,
    position: runtime.player.position,
    direction: forward,
    strength: 0.92,
    timeSeconds: runtime.elapsedSeconds,
  });
  if (!result.ok) return ShowToast("没有能制造声响的东西了。", 1.8);
  ApplySystemInventory(result.inventory);
  runtime.decoys.push(result.lure);
  runtime.metrics.luresUsed += 1;
  PlayAudio("cloth", runtime.player.position, 0.45);
  ShowToast(typeId === Systems.LureTypeIds.BOTTLE ? "空瓶掷出。" : "响罐掷出。", 1.2);
  UpdateHud();
}

function UpdateDecoys(delta) {
  runtime.decoys = runtime.decoys.map((decoy) => {
    const result = runtime.systems.UpdateLure(decoy, { delta, timeSeconds: runtime.elapsedSeconds, obstacles: SystemObstacles() });
    if (result.noiseEvents.length) {
      runtime.noises.push(...result.noiseEvents);
      const lastNoise = result.noiseEvents.at(-1);
      PlayAudio(result.state.typeId === Systems.LureTypeIds.BOTTLE ? "glass" : "stepStone", lastNoise.position, 1);
      presentation?.effects?.BurstDust?.({ x: lastNoise.position.x, y: GetTerrainHeight(lastNoise.position.x, lastNoise.position.z) + 0.15, z: lastNoise.position.z });
      ShowDirectionCaption(lastNoise.position, result.state.typeId === Systems.LureTypeIds.BOTTLE ? "玻璃碎裂，声音传开" : "铁皮滚动，声响沿沟传开");
    }
    return result.state;
  }).filter((decoy) => decoy.active || decoy.ageSeconds < 1.5);
  runtime.noises = Systems.PruneNoises(runtime.noises, runtime.elapsedSeconds, runtime.systems.config);
}

function UseBandage() {
  if (mode !== "Playing") return;
  if (runtime.resources.bandage <= 0) return ShowToast("没有包扎带。", 1.6);
  if (runtime.player.health >= 95) return ShowToast("现在不需要包扎。", 1.6);
  const nearestAlert = runtime.enemies.some((enemy) => enemy.active && ["alert", "engage"].includes(enemy.state) && Distance(enemy.position, runtime.player.position) < 17);
  if (nearestAlert) return ShowToast("周围太危险，无法停下包扎。", 2);
  runtime.resources.bandage -= 1;
  runtime.player.health = Math.min(100, runtime.player.health + 48);
  runtime.player.injured = runtime.player.health < 55;
  EmitWorldNoise(runtime.player.position, 1.8, "bandage");
  PlayAudio("heal", runtime.player.position, 0.75);
  ShowToast("伤口暂时压住了。", 2);
  UpdateHud();
}

function UpdateCompanion(delta) {
  const companion = runtime.companion;
  if (!companion.active) return;
  companion.ai = Systems.CreateCompanionState({
    ...companion.ai,
    position: companion.position,
    forward: { x: Math.sin(companion.facing), z: Math.cos(companion.facing) },
    health: companion.health,
    active: true,
    alive: true,
    commandId: runtime.isDowned ? Systems.CompanionCommandIds.ASSIST : companion.ai?.commandId,
  });
  const systemResult = runtime.systems.UpdateCompanion(companion.ai, {
    delta,
    timeSeconds: runtime.elapsedSeconds,
    player: {
      playerId: "zhaoTongcen",
      position: runtime.player.position,
      forward: { x: Math.sin(runtime.player.facing), z: Math.cos(runtime.player.facing) },
      health: runtime.player.health,
      maximumHealth: runtime.player.maxHealth,
      downed: runtime.isDowned,
    },
    cameraForward: { x: -Math.sin(input.cameraYaw), z: -Math.cos(input.cameraYaw) },
    cameraRight: { x: Math.cos(input.cameraYaw), z: -Math.sin(input.cameraYaw) },
    playerSprinting: runtime.player.sprinting,
    playerAiming: runtime.player.aiming,
    enemies: runtime.enemies.filter((enemy) => enemy.active).map((enemy) => enemy.ai),
    playerDowned: runtime.isDowned,
    playerUnderPressure: runtime.enemies.some((enemy) => enemy.active && enemy.state === "engage"),
  });
  companion.ai = systemResult.state;
  companion.command = companion.ai.commandId === Systems.CompanionCommandIds.STAY ? "stay" : "follow";
  const target = systemResult.intent.targetPosition;
  const distance = target ? Distance(companion.position, target) : 0;
  if (target && distance > 0.65) {
    const direction = Normalize2({ x: target.x - companion.position.x, z: target.z - companion.position.z });
    const speed = Clamp(3.2 * (systemResult.intent.speedMultiplier || 0.45), 1.1, runtime.player.sprinting ? 4.4 : 3.2);
    companion.velocity.x = Damp(companion.velocity.x, direction.x * speed, 8, delta);
    companion.velocity.z = Damp(companion.velocity.z, direction.z * speed, 8, delta);
    companion.position.x += companion.velocity.x * delta;
    companion.position.z += companion.velocity.z * delta;
    companion.facing = Math.atan2(companion.velocity.x, companion.velocity.z);
  } else {
    companion.velocity.x = Damp(companion.velocity.x, 0, 12, delta);
    companion.velocity.z = Damp(companion.velocity.z, 0, 12, delta);
  }
  companion.ai.position = { ...companion.position };
  const nearestThreatDistance = runtime.enemies.filter((enemy) => enemy.active && enemy.state !== "patrol").reduce((minimum, enemy) => Math.min(minimum, Distance(enemy.position, companion.position)), Infinity);
  if (systemResult.intent.assistActionId === "coverShot") {
    const targetEnemy = runtime.enemies.find((enemy) => enemy.enemyId === systemResult.intent.assistTargetId && enemy.active);
    if (targetEnemy) {
      PlayAudio("rifle", companion.position, 0.86);
      targetEnemy.investigateTarget = { ...companion.position };
      targetEnemy.ai.investigationPosition = { ...companion.position };
      targetEnemy.ai.awareness = Math.max(targetEnemy.ai.awareness, 0.68);
      ShowToast("杜湘云用一枪压住了窑口，没有追击。", 2.4);
    }
  }
  if (runtime.isDowned && !companion.rescueUsed && nearestThreatDistance >= 8 && Distance(companion.position, runtime.player.position) < 5) {
    companion.assisting = true;
    companion.rescueProgress = (companion.rescueProgress || 0) + delta;
    if (companion.rescueProgress > 2.4) {
      runtime.player.health = 32;
      runtime.isDowned = false;
      companion.rescueUsed = true;
      companion.assisting = false;
      companion.rescueProgress = 0;
      companion.ai = Systems.SetCompanionCommand(companion.ai, Systems.CompanionCommandIds.FOLLOW, { timeSeconds: runtime.elapsedSeconds }).state;
      QueueDialogue([["杜湘云", "起来。路还没走完。"], ["赵同岑", "我能走。"]], true);
    }
  }
}

function ResolveCompanionResetPosition(playerPosition) {
  const cameraForward = { x: -Math.sin(input.cameraYaw), z: -Math.cos(input.cameraYaw) };
  const cameraRight = { x: Math.cos(input.cameraYaw), z: -Math.sin(input.cameraYaw) };
  const companionConfig = runtime?.systems?.config?.companion || {};
  const rearDistance = Number(companionConfig.preferredFollowDistance) || 3.2;
  const lateralDistance = Number(companionConfig.cameraSafeLateralDistance) || 3.05;
  return {
    x: playerPosition.x - cameraForward.x * rearDistance - cameraRight.x * lateralDistance,
    z: playerPosition.z - cameraForward.z * rearDistance - cameraRight.z * lateralDistance,
  };
}

function IsSegmentBlocked(start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz || 1;
  return CollisionVolumes().some((obstacle) => {
    const center = obstacle.position || obstacle.center || obstacle;
    const x = Number(center.x ?? center[0]) || 0;
    const z = Number(center.z ?? center[2] ?? center[1]) || 0;
    const radius = Number(obstacle.radius || obstacle.collisionRadius || 0) || 0;
    if (!radius) return false;
    const time = Clamp(((x - start.x) * dx + (z - start.z) * dz) / lengthSquared, 0, 1);
    const nearestX = start.x + dx * time;
    const nearestZ = start.z + dz * time;
    return Math.hypot(nearestX - x, nearestZ - z) < radius * 0.82;
  });
}

function PlayerVisibilityMultiplier() {
  let multiplier = runtime.player.crouched ? 0.48 : 1;
  const coverZones = (Level.levelZones || []).filter((zone) => [zone.kind, zone.zoneType, zone.type, zone.category].some((value) => /cover|sorghum|field|reed|shadow|stealth|ravine|protected/i.test(String(value || ""))));
  const inCover = coverZones.some((zone) => {
    const center = zone.center || zone.position || zone;
    const centerPosition = { x: center.x ?? center[0], z: center.z ?? center[2] ?? center[1] };
    if (zone.halfExtents) return Math.abs(runtime.player.position.x - centerPosition.x) <= zone.halfExtents.x && Math.abs(runtime.player.position.z - centerPosition.z) <= zone.halfExtents.z;
    const radius = zone.radius || Math.max(zone.width || 0, zone.depth || 0) * 0.5;
    return Distance(runtime.player.position, centerPosition) < radius;
  });
  if (inCover) multiplier *= runtime.player.crouched ? 0.34 : 0.68;
  if (runtime.player.sprinting) multiplier *= 1.45;
  return multiplier;
}

function CurrentZoneVisibility() {
  const zone = (Level.levelZones || []).find((candidate) => {
    const center = candidate.center || candidate.position || candidate;
    const x = center.x ?? center[0];
    const z = center.z ?? center[2] ?? center[1];
    if (candidate.halfExtents) return Math.abs(runtime.player.position.x - x) <= candidate.halfExtents.x && Math.abs(runtime.player.position.z - z) <= candidate.halfExtents.z;
    return Distance(runtime.player.position, { x, z }) <= (candidate.radius || 0);
  });
  return zone?.visibilityMultiplier ?? 0.86;
}

function SetEnemyState(enemy, nextState) {
  if (enemy.state === nextState) return;
  const previous = enemy.state;
  enemy.state = nextState;
  enemy.stateTime = 0;
  enemy.ai = Systems.CreateEnemyState({
    ...(enemy.ai || {}),
    enemyId: enemy.enemyId,
    stateId: nextState,
    stateElapsedSeconds: 0,
    position: enemy.position,
    forward: enemy.forward,
    awareness: ["alert", "engage"].includes(nextState) ? Math.max(enemy.ai?.awareness || 0, 0.82) : enemy.ai?.awareness,
    suspicion: enemy.suspicion,
    lastKnownTargetPosition: enemy.lastKnown,
    investigationPosition: enemy.investigateTarget,
    health: enemy.health,
    alive: enemy.active,
    patrolPoints: enemy.patrolPoints,
    patrolIndex: enemy.patrolIndex,
  }, runtime.systems.config);
  if (["alert", "engage"].includes(nextState) && !["alert", "engage"].includes(previous)) runtime.metrics.alerts += 1;
  if (nextState === "suspicious") ShowDirectionCaption(enemy.position, "巡逻停下了脚步");
  if (nextState === "alert") QueueDialogue([["方向字幕", "哨兵呼喊，封锁哨开始搜索。"]]);
}

function UpdateEnemies(delta) {
  let strongestSuspicion = 0;
  let strongestEnemy = null;
  const systemObstacles = SystemObstacles();
  const playerVisibility = PlayerVisibilityMultiplier();
  const playerFrame = {
    playerId: "zhaoTongcen",
    position: runtime.player.position,
    forward: { x: Math.sin(runtime.player.facing), z: Math.cos(runtime.player.facing) },
    velocity: runtime.player.velocity,
    speed: Math.hypot(runtime.player.velocity.x, runtime.player.velocity.z),
    health: runtime.player.health,
    maximumHealth: runtime.player.maxHealth,
    alive: !runtime.isDowned && runtime.player.health > 0,
    isCrouched: runtime.player.crouched,
    isSprinting: runtime.player.sprinting,
    visibilityMultiplier: playerVisibility,
    concealment: Clamp(1 - playerVisibility, 0, 0.9),
    illumination: CurrentStage().stageId === "holdKilnMouth" ? 0.58 : 0.32,
  };
  const alertBroadcasts = [];
  runtime.enemies.forEach((enemy, index) => {
    if (!enemy.active) return;
    const previousState = enemy.state;
    if (Systems.ShouldRunAiTick(enemy.enemyId, frameCounter, Distance(enemy.position, runtime.player.position), runtime.systems.config)) {
      const result = runtime.systems.UpdateEnemyAi(enemy.ai, {
        delta,
        timeSeconds: runtime.elapsedSeconds,
        player: playerFrame,
        noises: runtime.noises,
        obstacles: systemObstacles,
        visibilityMultiplier: CurrentZoneVisibility(),
      });
      enemy.ai = result.state;
      enemy.intent = result.intent;
      enemy.state = result.state.stateId;
      enemy.stateTime = result.state.stateElapsedSeconds;
      enemy.suspicion = Math.max(result.state.suspicion, result.state.awareness);
      enemy.lastKnown = result.state.lastKnownTargetPosition;
      enemy.investigateTarget = result.state.investigationPosition;
      enemy.patrolIndex = result.state.patrolIndex;
      result.events.filter((event) => event.eventId === Systems.GameplayEventIds.ENEMY_ALERT_REQUESTED).forEach((event) => alertBroadcasts.push(event));
      if (previousState !== enemy.state) {
        if (["alert", "engage"].includes(enemy.state) && !["alert", "engage"].includes(previousState)) runtime.metrics.alerts += 1;
        if (enemy.state === "suspicious") ShowDirectionCaption(enemy.position, "巡逻停下了脚步");
        if (enemy.state === "alert") QueueDialogue([["方向字幕", "哨兵呼喊，封锁哨开始搜索。"]]);
      }
      UpdateEnemyMotion(enemy, delta, index);
      if (enemy.intent?.shouldFire) {
        UpdateEnemyCombat(enemy, delta, result.vision.distance, result.vision.visible);
      }
    } else {
      UpdateEnemyMotion(enemy, delta, index);
    }
    if (enemy.suspicion > strongestSuspicion) {
      strongestSuspicion = enemy.suspicion;
      strongestEnemy = enemy;
    }
  });
  if (alertBroadcasts.length) {
    runtime.enemies.forEach((enemy) => {
      if (!enemy.active) return;
      alertBroadcasts.forEach((alert) => {
        enemy.ai = Systems.ApplyEnemyAlert(enemy.ai, {
          sourceId: alert.enemyId,
          position: alert.position,
          targetPosition: alert.targetPosition,
          radius: alert.radius,
          intensity: 0.82,
        }, runtime.systems.config);
        enemy.state = enemy.ai.stateId;
        enemy.stateTime = enemy.ai.stateElapsedSeconds;
        enemy.suspicion = Math.max(enemy.ai.suspicion, enemy.ai.awareness);
        enemy.lastKnown = enemy.ai.lastKnownTargetPosition;
        enemy.investigateTarget = enemy.ai.investigationPosition;
      });
    });
  }
  elements.detectionMeter.hidden = strongestSuspicion < 0.06;
  elements.detectionFill.style.width = `${Math.round(strongestSuspicion * 100)}%`;
  elements.detectionSource.textContent = strongestEnemy?.displayName || "巡逻兵";
  elements.detectionState.textContent = strongestSuspicion > 0.88 ? "暴露" : (strongestSuspicion > 0.42 ? "察觉" : "怀疑");
  elements.detectionVeil.style.opacity = String(Clamp((strongestSuspicion - 0.45) * 0.8, 0, 0.42));
}

function UpdateEnemyMotion(enemy, delta, index) {
  const target = enemy.intent?.targetPosition || enemy.patrolPoints[enemy.patrolIndex] || enemy.position;
  const speed = 2.65 * (enemy.intent?.speedMultiplier ?? (enemy.state === "patrol" ? 0.52 : 0));
  if (!target || speed <= 0) return;
  const direction = Normalize2({ x: target.x - enemy.position.x, z: target.z - enemy.position.z });
  enemy.forward.x = Damp(enemy.forward.x, direction.x, 5, delta);
  enemy.forward.z = Damp(enemy.forward.z, direction.z, 5, delta);
  enemy.position.x += direction.x * speed * delta;
  enemy.position.z += direction.z * speed * delta;
  enemy.ai.position = { ...enemy.position };
  enemy.ai.forward = { ...enemy.forward };
}

function UpdateEnemyCombat(enemy, delta, distance, visible) {
  if (!visible || distance > 29) return;
  PlayAudio("rifle", enemy.position, 0.92);
  presentation?.effects?.MuzzleFlash?.(presentation?.enemies?.[runtime.enemies.indexOf(enemy)] || enemy.position);
  ShowDirectionCaption(enemy.position, "枪声");
  const hitChance = Clamp(0.48 - distance * 0.009 - (runtime.player.crouched ? 0.12 : 0) - (runtime.player.sprinting ? 0.08 : 0), 0.12, 0.46);
  const random = runtime.systems.random;
  if (random.Next() < hitChance) DamagePlayer(17 + random.Range(0, 11), enemy);
  else presentation?.effects?.BulletImpact?.({ x: runtime.player.position.x + random.Range(-1, 1), y: 0.4, z: runtime.player.position.z + random.Range(-1, 1) });
}

function UpdateKilnDefenseRuntime(delta) {
  if (!runtime?.kilnDefense || !["holdKilnMouth", "waitForClearSignal"].includes(CurrentStage().stageId)) return;
  const result = KilnDefense.UpdateKilnDefense(runtime.kilnDefense, {
    delta,
    playerPosition: runtime.player.position,
  });
  runtime.kilnDefense = result.state;
  runtime.counters.kilnHoldSeconds = Math.max(
    Number(runtime.counters.kilnHoldSeconds || 0),
    result.state.elapsedSeconds,
  );
}

function DamagePlayer(amount, source) {
  if (runtime.settings.lowerDistress) amount *= 0.72;
  if (
    source
    && runtime.kilnDefense
    && ["holdKilnMouth", "waitForClearSignal"].includes(CurrentStage().stageId)
  ) {
    const kilnDamage = KilnDefense.ResolveKilnIncomingDamage(runtime.kilnDefense, amount, {
      playerPosition: runtime.player.position,
    });
    runtime.kilnDefense = kilnDamage.state;
    amount = kilnDamage.appliedDamage;
    if (amount <= 0) {
      presentation?.effects?.BulletImpact?.({
        x: runtime.player.position.x + runtime.systems.random.Range(-1.4, 1.4),
        y: GetTerrainHeight(runtime.player.position.x, runtime.player.position.z) + 0.35,
        z: runtime.player.position.z + runtime.systems.random.Range(-1.4, 1.4),
      });
      ShowDirectionCaption(source.position || runtime.player.position, kilnDamage.protectedByAction ? "灰尘和遮挡吞掉了枪线" : "子弹打在窑墙上");
      return;
    }
  }
  runtime.player.health = Math.max(0, runtime.player.health - amount);
  runtime.metrics.damageTaken += amount;
  runtime.player.injured = runtime.player.health < 55;
  elements.damageVeil.style.opacity = runtime.settings.lowerDistress ? "0.22" : "0.58";
  setTimeout(() => { elements.damageVeil.style.opacity = "0"; }, 260);
  PlayAudio("hurt", runtime.player.position, 0.85);
  if (runtime.player.health <= 0) {
    const companionCanHelp = runtime.companion.active && !runtime.companion.rescueUsed && Distance(runtime.companion.position, runtime.player.position) < 7;
    if (companionCanHelp) {
      runtime.isDowned = true;
      runtime.stageTimer = 0;
      QueueDialogue([["杜湘云", "同岑！别闭眼，我过来。"]], true);
    } else {
      FailMission("封锁哨截住了交通线", source ? "你没能脱离照明与射界。回到检查点，利用地形、声音和同伴重新选择路线。" : undefined);
    }
  }
}

function FireWeapon() {
  if (mode !== "Playing") return;
  const aim = { x: -Math.sin(input.cameraYaw), z: -Math.cos(input.cameraYaw) };
  const shotResult = runtime.systems.FireWeapon(RuntimeInventory(), {
    actorId: "zhaoTongcen",
    position: runtime.player.position,
    direction: aim,
    timeSeconds: runtime.elapsedSeconds,
    isMoving: Math.hypot(runtime.player.velocity.x, runtime.player.velocity.z) > 0.5,
    isCrouched: runtime.player.crouched,
  });
  ApplySystemInventory(shotResult.inventory);
  runtime.noises.push(...shotResult.noiseEvents);
  runtime.noises = Systems.PruneNoises(runtime.noises, runtime.elapsedSeconds, runtime.systems.config);
  if (!shotResult.ok) {
    PlayAudio("dryFire", runtime.player.position, 0.7);
    ShowToast("枪膛是空的。", 1.4);
    return;
  }
  runtime.metrics.shotsFired += 1;
  runtime.counters.shotsFired = runtime.metrics.shotsFired;
  runtime.counters.alertLevel = Math.max(2, runtime.counters.alertLevel || 0);
  PlayAudio("rifle", runtime.player.position, 1);
  presentation?.effects?.MuzzleFlash?.(presentation?.playerRig);
  const spread = shotResult.shot.spreadYawRadians || 0;
  const spreadAim = {
    x: aim.x * Math.cos(spread) - aim.z * Math.sin(spread),
    z: aim.x * Math.sin(spread) + aim.z * Math.cos(spread),
  };
  let best = null;
  let bestScore = Infinity;
  runtime.enemies.forEach((enemy) => {
    if (!enemy.active) return;
    const toEnemy = { x: enemy.position.x - runtime.player.position.x, z: enemy.position.z - runtime.player.position.z };
    const distance = Math.hypot(toEnemy.x, toEnemy.z);
    const direction = Normalize2(toEnemy);
    const angleScore = 1 - (direction.x * spreadAim.x + direction.z * spreadAim.z);
    if (distance < 34 && angleScore < 0.09 && !IsSegmentBlocked(runtime.player.position, enemy.position) && angleScore * 80 + distance * 0.02 < bestScore) {
      best = enemy;
      bestScore = angleScore * 80 + distance * 0.02;
    }
  });
  if (best) {
    best.health -= shotResult.shot.damage;
    best.suspicion = 1;
    best.lastKnown = { ...runtime.player.position };
    SetEnemyState(best, "engage");
    best.ai.health = best.health;
    presentation?.effects?.HitSpark?.({ x: best.position.x, y: 1.2, z: best.position.z });
    if (best.health <= 0) {
      best.active = false;
      best.ai.alive = false;
      runtime.metrics.enemiesInjured += 1;
      ShowToast("哨兵倒下。枪声已经传开。", 2.4);
    }
  }
  runtime.enemies.forEach((enemy) => {
    if (!enemy.active) return;
    enemy.lastKnown = { ...runtime.player.position };
    enemy.suspicion = Math.max(enemy.suspicion, 0.82);
    SetEnemyState(enemy, "alert");
  });
  UpdateHud();
}

function ShowDirectionCaption(position, message) {
  const dx = position.x - runtime.player.position.x;
  const dz = position.z - runtime.player.position.z;
  const angle = Math.atan2(dx, -dz) - input.cameraYaw;
  const normalized = Math.atan2(Math.sin(angle), Math.cos(angle));
  elements.directionLabel.textContent = Math.abs(normalized) < 0.55 ? "前方" : (normalized > 0 ? "右侧" : "左侧");
  elements.directionText.textContent = message;
  elements.directionCaption.hidden = false;
  clearTimeout(ShowDirectionCaption.timeoutId);
  ShowDirectionCaption.timeoutId = setTimeout(() => { elements.directionCaption.hidden = true; }, 2400);
}

function UpdateStage(delta) {
  const stage = CurrentStage();
  const target = ResolveCurrentObjectivePosition(stage);
  const distance = Distance(runtime.player.position, target);
  if (stage.mode === "reach" && distance <= (stage.radius || 5)) {
    AdvanceStage("reach");
  } else if (stage.mode === "hold") {
    const defenseStarted = runtime.kilnDefense.active
      || runtime.kilnDefense.completed
      || runtime.kilnDefense.completedActionIds.length > 0;
    if (!defenseStarted && distance <= (stage.radius || 12)) {
      runtime.triggered.add(`${stage.stageId}_hold`);
      runtime.stageTimer = 0;
      SpawnHoldPressure();
    }
    const kilnObjective = KilnDefense.GetKilnDefenseObjective(runtime.kilnDefense);
    if (kilnObjective) {
      const stepNumber = runtime.kilnDefense.completedActionIds.length + 1;
      elements.objectiveText.textContent = `${kilnObjective.objective} · 第 ${stepNumber}/3 步`;
    } else if (runtime.kilnDefense.completed) {
      AdvanceStage("kilnDefenseComplete");
    } else {
      elements.objectiveText.textContent = "进入废窑口，利用三处掩体为转移队争路";
    }
  } else if (stage.mode === "wait" && distance <= (stage.radius || 7)) {
    if (!runtime.triggered.has(`${stage.stageId}_wait`)) {
      runtime.triggered.add(`${stage.stageId}_wait`);
      runtime.stageTimer = 0;
    }
    const remaining = Math.max(0, (stage.holdSeconds || 7) - runtime.stageTimer);
    elements.objectiveText.textContent = `观察山脊灯号 · ${Math.ceil(remaining)} 秒`;
    if (remaining <= 0) AdvanceStage("wait");
  }
  CheckStoryTriggers(delta);
}

function EnterStage(index, initial = false) {
  runtime.stageIndex = Clamp(index, 0, Stages().length - 1);
  runtime.stageTimer = 0;
  runtime.stageEnteredAt = runtime.elapsedSeconds;
  const stage = CurrentStage();
  runtime.companion.active = true;
  if (!initial || runtime.stageIndex === 0) QueueDialogue(AuthoredDialogue(stage.stageId));
  UpdateHud();
  UpdateMarker();
  if (!initial) {
    SaveCheckpoint();
    ShowChapterCard();
  }
}

function AdvanceStage(reason = "complete") {
  if (!runtime || mode !== "Playing") return;
  const previous = CurrentStage();
  if (previous.stageId === "prepareQuietPassage") runtime.metrics.quietPassagePrepared = true;
  if (previous.stageId === "disableWarningLine") runtime.metrics.warningLineCut = true;
  if (previous.stageId === "reachSafeRidge" || runtime.stageIndex >= Stages().length - 1) {
    FinishMission();
    return;
  }
  EnterStage(runtime.stageIndex + 1, false);
  if (qaMode) ShowToast(`QA：${previous.stageId} → ${CurrentStage().stageId} (${reason})`, 1.7);
}

function SpawnHoldPressure() {
  runtime.kilnDefense = KilnDefense.StartKilnDefense(runtime.kilnDefense);
  const activeEnemies = runtime.enemies.filter((enemy) => enemy.active);
  activeEnemies.slice(0, 2).forEach((enemy, index) => {
    runtime.kilnThreatIds.add(enemy.enemyId);
    enemy.position = { x: index ? -11 : 12, z: -64 - index * 5 };
    enemy.lastKnown = { x: 4, z: -78 };
    enemy.suspicion = 0.72;
    SetEnemyState(enemy, "search");
  });
  runtime.kilnThreatEncountered = runtime.kilnThreatIds.size > 0;
  QueueDialogue(AuthoredDialogue("holdKilnMouth"), true);
  presentation?.audio?.SetIntensity?.(0.72);
}

function PointInsideZone(point, zone) {
  if (!point || !zone) return false;
  const center = zone.center || zone.position || zone;
  const centerPosition = {
    x: Number(center.x ?? center[0]) || 0,
    z: Number(center.z ?? center[2] ?? center[1]) || 0,
  };
  if (zone.halfExtents) {
    return Math.abs(point.x - centerPosition.x) <= Number(zone.halfExtents.x || 0)
      && Math.abs(point.z - centerPosition.z) <= Number(zone.halfExtents.z || 0);
  }
  return Distance(point, centerPosition) <= Number(zone.radius || 0);
}

function NarrativeStateSnapshot() {
  const blockadeZone = (Level.levelZones || []).find((zone) => zone.zoneId === "blockadePostZone");
  const playerInBlockadeZone = PointInsideZone(runtime.player.position, blockadeZone);
  const playerDetected = runtime.enemies.some((enemy) => (
    enemy.active
      && ["alert", "engage"].includes(enemy.state)
      && enemy.suspicion >= 0.82
  ));
  const kilnThreats = runtime.enemies.filter((enemy) => runtime.kilnThreatIds.has(enemy.enemyId));
  const kilnThreatsEngaged = kilnThreats.some((enemy) => enemy.active && ["alert", "engage"].includes(enemy.state));
  const firstKilnThreatDisengaged = runtime.kilnThreatEncountered
    && runtime.stageTimer >= 8
    && !kilnThreatsEngaged;
  const kilnThreatsDisengaged = runtime.kilnThreatEncountered
    && CurrentStage().stageId === "waitForClearSignal"
    && !kilnThreatsEngaged;
  return {
    stageId: CurrentStage().stageId,
    flags: runtime.flags,
    counters: runtime.counters,
    equipment: runtime.equipment,
    routeChoice: runtime.routeChoice,
    playerDetectedInBlockadePostZone: playerInBlockadeZone && playerDetected,
    firstKilnThreatDisengaged,
    kilnThreatsDisengaged,
    kilnHoldSeconds: runtime.counters.kilnHoldSeconds,
  };
}

function TriggerRequirementsMet(requirements = {}) {
  return Narrative.RequirementsMet(requirements, NarrativeStateSnapshot());
}

function ResolveStoryEvent(trigger) {
  const triggerId = trigger?.triggerId || trigger?.id;
  return (Story.storyEvents || []).find((candidate) => (
    candidate.id === trigger?.eventId || [candidate.triggerId, candidate.eventId].includes(triggerId)
  ));
}

function ActivateStoryTrigger(trigger) {
  const triggerId = trigger?.triggerId || trigger?.id;
  if (!triggerId || runtime.triggered.has(triggerId)) return false;
  runtime.triggered.add(triggerId);
  const event = ResolveStoryEvent(trigger);
  [
    ...(trigger.setFlags || []),
    ...(trigger.setsFlags || []),
    ...(event?.setFlags || []),
    ...(event?.setsFlags || []),
  ].forEach((flagId) => runtime.flags.add(flagId));
  Object.entries(event?.incrementCounters || {}).forEach(([counterId, amount]) => {
    runtime.counters[counterId] = Number(runtime.counters[counterId] || 0) + Number(amount || 0);
  });
  if (event) QueueDialogue(EventDialogue(event));
  const center = trigger.position || trigger.center || trigger;
  const position = { x: Number(center.x ?? center[0]) || 0, z: Number(center.z ?? center[2] ?? center[1]) || 0 };
  if (trigger.directionCaption) ShowDirectionCaption(position, trigger.directionCaption);
  return true;
}

function CheckStoryTriggers(delta = 0) {
  const triggers = Level.storyTriggers || Level.levelTriggers || [];
  triggers.forEach((trigger) => {
    const triggerId = trigger.triggerId || trigger.id;
    if (!triggerId || runtime.triggered.has(triggerId)) return;
    const activation = trigger.activation || "enterRadius";
    if (!TriggerRequirementsMet(trigger.requires)) {
      runtime.triggerProgress.delete(triggerId);
      return;
    }
    if (activation === "systemCondition") {
      if (Narrative.SystemConditionMet(trigger.systemCondition, NarrativeStateSnapshot())) ActivateStoryTrigger(trigger);
      return;
    }
    if (!["enterRadius", "automaticOnSpawn", "lingerInRadius"].includes(activation)) return;
    const center = trigger.position || trigger.center || trigger;
    const position = { x: Number(center.x ?? center[0]) || 0, z: Number(center.z ?? center[2] ?? center[1]) || 0 };
    const radius = trigger.radius || 4;
    const inside = Distance(runtime.player.position, position) <= radius;
    if (activation === "lingerInRadius") {
      const progress = inside ? Number(runtime.triggerProgress.get(triggerId) || 0) + delta : 0;
      runtime.triggerProgress.set(triggerId, progress);
      if (progress >= Number(trigger.lingerSeconds || 0)) ActivateStoryTrigger(trigger);
      return;
    }
    if (inside) ActivateStoryTrigger(trigger);
  });
}

function EnvironmentalEntries() {
  const authored = Story.environmentalNarratives || [];
  const fallbacks = [
    { narrativeId: "grainTally", title: "灶墙上的借粮刻痕", body: "六道深痕，旁边补着两道浅痕。最后一笔写着：秋后还。扫荡没有给他们等到秋后。", context: "生活痕迹 · 不计入奖励", position: { x: -9, z: 51 } },
    { narrativeId: "schoolSlate", title: "没擦干净的识字板", body: "“路”字下面还留着半个“家”字。识字班搬走时，粉笔被掰成四截，分给四个临时落脚点。", context: "槐树沟识字班 · 复合创作", position: { x: -16, z: 27 } },
    { narrativeId: "midwifeBag", title: "接生包里的住户次序", body: "不是名单，只有月份、乳名和家门朝向。它既能帮人找到彼此，也可能让整条交通线暴露。", context: "杜湘云的记忆办法", position: { x: -5, z: 39 } },
    { narrativeId: "brokenBell", title: "缠布的铜铃", body: "铃舌被旧布一层层包住。前一班岗的人试过从这里让担架无声通过。", context: "旧灌渠封锁哨", position: { x: 7, z: -25 } },
    { narrativeId: "kilnHandprint", title: "石灰墙上的手印", body: "十二枚并不整齐的灰手印从低到高。何芹让每个人通过后按一下，免得在黑暗里把人漏下。", context: "转移队清点办法", position: { x: 7, z: -79 } },
  ];
  if (!authored.length) return fallbacks;
  return authored.map((entry) => ({
    ...entry,
    narrativeId: entry.narrativeId || entry.environmentId || entry.id,
    body: entry.body || entry.description || entry.text || "",
    context: entry.context || "槐树沟生活痕迹 · 复合创作",
  }));
}

function UpdateNearbyInteraction() {
  const stage = CurrentStage();
  const candidates = [];
  if (stage.mode === "interact") {
    const exitTrigger = (Level.storyTriggers || []).find((trigger) => (
      (trigger.triggerId || trigger.id) === stage.exitTriggerId && trigger.activation === "interact"
    ));
    const linkedInteractable = (Level.interactables || []).find((entry) => (
      [entry.interactableId, entry.id].includes(exitTrigger?.interactableId || stage.targetId)
    ));
    const center = exitTrigger?.position || exitTrigger?.center;
    const position = center
      ? { x: Number(center.x ?? center[0]) || 0, z: Number(center.z ?? center[2] ?? center[1]) || 0 }
      : ResolveTarget(stage.targetId);
    const available = Narrative.RequirementGroupsMet(
      [linkedInteractable?.requires, exitTrigger?.requires],
      NarrativeStateSnapshot(),
    );
    candidates.push({
      interactionId: `mission_${stage.stageId}`,
      position,
      radius: stage.radius || 3.4,
      label: available ? (linkedInteractable?.prompt || ObjectiveForStage(stage)) : "先完成眼前的准备",
      kind: "mission",
      stageId: stage.stageId,
      trigger: exitTrigger,
      interactable: linkedInteractable,
      available,
      unavailableReason: "前置准备还没有完成。",
    });
  }
  if (stage.mode === "choice" && !runtime.routeChoice) {
    (Story.routeChoice?.options || Story.routeChoice?.choices || []).forEach((option) => {
      const evaluation = Narrative.EvaluateRouteOption(
        Story.routeChoice,
        option.choiceId || option.optionId || option.id,
        NarrativeStateSnapshot(),
        { interactables: Level.interactables, triggers: Level.storyTriggers || Level.levelTriggers },
      );
      const interactable = evaluation.interactable;
      if (!interactable?.position) return;
      candidates.push({
        interactionId: `route_${option.choiceId || option.optionId}`,
        position: interactable.position,
        radius: Math.max(2.15, Number(interactable.radius || 0)),
        label: evaluation.available ? interactable.prompt : `${interactable.prompt}（不可行）`,
        kind: "routeChoice",
        choiceId: option.choiceId || option.optionId,
        option,
        evaluation,
        available: evaluation.available,
        unavailableReason: evaluation.reason,
      });
    });
  }
  if (stage.stageId === "holdKilnMouth" && runtime.kilnDefense.active) {
    const kilnObjective = KilnDefense.GetKilnDefenseObjective(runtime.kilnDefense);
    if (kilnObjective) {
      candidates.push({
        interactionId: `kiln_${kilnObjective.actionId}`,
        position: kilnObjective.position,
        radius: kilnObjective.radius,
        label: kilnObjective.prompt,
        kind: "kilnDefense",
        action: kilnObjective,
        available: true,
      });
    }
  }
  EnvironmentalEntries().forEach((entry) => candidates.push({
    interactionId: `document_${entry.narrativeId || entry.id}`,
    position: entry.position,
    radius: entry.radius || 2.6,
    label: entry.interactionLabel || `查看：${entry.title}`,
    kind: "document",
    data: entry,
  }));
  const supplyEntries = (Level.interactables || []).filter((entry) => /supply|resource|pickup/i.test(String(entry.kind || entry.type || "")));
  supplyEntries.forEach((entry) => {
    const entryId = entry.interactableId || entry.id;
    if (runtime.triggered.has(`pickup_${entryId}`)) return;
    if (!TriggerRequirementsMet(entry.requires)) return;
    candidates.push({ interactionId: `pickup_${entryId}`, position: entry.position, radius: entry.radius || 2.4, label: entry.label || "搜寻留下的物资", kind: "pickup", data: entry, available: true });
  });
  activeInteraction = candidates
    .map((candidate) => ({ ...candidate, distance: Distance(runtime.player.position, candidate.position) }))
    .filter((candidate) => candidate.distance <= candidate.radius)
    .sort((a, b) => (["mission", "routeChoice", "kilnDefense"].includes(a.kind) ? -1 : 0) - (["mission", "routeChoice", "kilnDefense"].includes(b.kind) ? -1 : 0) || a.distance - b.distance)[0] || null;
  elements.interactionPrompt.hidden = !activeInteraction;
  if (activeInteraction) elements.interactionLabel.textContent = activeInteraction.label;
}

function PerformInteraction() {
  if (mode !== "Playing" || !activeInteraction) return;
  const interaction = activeInteraction;
  if (interaction.available === false) {
    ShowToast(interaction.unavailableReason || "前置准备还没有完成。", 2.8);
    return;
  }
  if (interaction.kind === "mission") {
    if (!Narrative.RequirementGroupsMet(
      [interaction.interactable?.requires, interaction.trigger?.requires],
      NarrativeStateSnapshot(),
    )) {
      ShowToast("前置准备还没有完成。", 2.2);
      return;
    }
    if (interaction.stageId === "readStoneSignal") PlayAudio("stepStone", interaction.position, 0.55);
    if (interaction.stageId === "prepareQuietPassage") {
      const passageMaterial = Narrative.SelectQuietPassageMaterial(runtime.resources);
      if (!passageMaterial) {
        ShowToast("需要一块碎布或一条包扎带，才能把车轴垫紧。", 2.8);
        return;
      }
      runtime.resources[passageMaterial.itemId] -= passageMaterial.amount;
      if (passageMaterial.itemId === "bandage") ShowToast("拆开一条包扎带垫住车轴，伤口只能靠剩下的物资处理。", 3);
      runtime.metrics.quietPassagePrepared = true;
      PlayAudio("cloth", interaction.position, 0.72);
    }
    if (interaction.stageId === "openEastGate") {
      if (runtime.resources.cloth > 0) {
        runtime.resources.cloth -= 1;
        PlayAudio("cloth", interaction.position, 0.68);
      } else {
        runtime.counters.alertLevel = Math.max(1, runtime.counters.alertLevel || 0);
        EmitWorldNoise(interaction.position, interaction.interactable?.forcedInteractionNoiseRadius || 12, "impact");
        ShowToast("没有余布，只能托住门闩慢慢推开。声响传到了巷外。", 3);
      }
    }
    if (interaction.stageId === "disableWarningLine") {
      runtime.metrics.warningLineCut = true;
      PlayAudio("cloth", interaction.position, 0.52);
    }
    [...(interaction.interactable?.setsFlags || [])].forEach((flagId) => runtime.flags.add(flagId));
    if (interaction.trigger) ActivateStoryTrigger(interaction.trigger);
    AdvanceStage("interact");
  } else if (interaction.kind === "kilnDefense") {
    const result = KilnDefense.PerformKilnDefenseAction(runtime.kilnDefense, interaction.action.actionId);
    if (!result.ok) {
      ShowToast("先沿灰墙完成前一处掩护。", 2);
      return;
    }
    runtime.kilnDefense = result.state;
    result.flags.forEach((flagId) => runtime.flags.add(flagId));
    runtime.counters.kilnHoldSeconds = Math.max(
      Number(runtime.counters.kilnHoldSeconds || 0),
      result.state.elapsedSeconds,
    );
    runtime.kilnThreatIds.forEach((enemyId) => {
      const enemy = runtime.enemies.find((candidate) => candidate.enemyId === enemyId && candidate.active);
      if (!enemy) return;
      enemy.investigateTarget = { ...interaction.action.misdirectPosition };
      enemy.lastKnown = { ...interaction.action.misdirectPosition };
      enemy.suspicion = Math.min(enemy.suspicion, 0.58);
      enemy.ai.investigationPosition = { ...interaction.action.misdirectPosition };
      enemy.ai.lastKnownTargetPosition = { ...interaction.action.misdirectPosition };
      enemy.ai.awareness = Math.min(enemy.ai.awareness, 0.58);
      SetEnemyState(enemy, "search");
    });
    presentation?.effects?.BurstDust?.({
      x: interaction.action.position.x,
      y: GetTerrainHeight(interaction.action.position.x, interaction.action.position.z) + 0.35,
      z: interaction.action.position.z,
    });
    PlayAudio(interaction.action.actionId === "releaseRockslide" ? "stepStone" : "cloth", interaction.action.position, 0.9);
    ShowToast(interaction.action.completionText, 2.8);
    if (result.state.completed) {
      QueueDialogue([["杜湘云", "石板开了。沿西墙退，等山脊灯号。"], ["赵同岑", "碎石能拦他们一阵。走。"]]);
      AdvanceStage("kilnDefenseComplete");
    }
  } else if (interaction.kind === "routeChoice") {
    if (!ResolveRouteChoice(interaction.choiceId, interaction.option)) return;
  } else if (interaction.kind === "document") {
    OpenDocument(interaction.data);
  } else if (interaction.kind === "pickup") {
    const entryId = interaction.data.interactableId || interaction.data.id;
    runtime.triggered.add(`pickup_${entryId}`);
    const contents = interaction.data.contents || { cloth: 1, stone: 1 };
    Object.entries(contents).forEach(([itemId, amount]) => { runtime.resources[itemId] = (runtime.resources[itemId] || 0) + amount; });
    PlayAudio("discover", interaction.position, 0.6);
    ShowToast(interaction.data.pickupText || "收下少量物资。", 2);
  }
  activeInteraction = null;
  elements.interactionPrompt.hidden = true;
  UpdateHud();
}

function OpenDocument(entry) {
  const narrativeId = entry.narrativeId || entry.environmentId || entry.id;
  runtime.documentsFound.add(narrativeId);
  runtime.metrics.documentsFound = runtime.documentsFound.size;
  pendingDocumentCompanionLine = entry.companionLine || "";
  elements.documentType.textContent = entry.typeLabel || "环境记录";
  elements.documentTitle.textContent = entry.title || entry.displayName || "留下的痕迹";
  const body = entry.body || entry.description || entry.text || "";
  elements.documentBody.innerHTML = Array.isArray(body) ? body.map((paragraph) => `<p>${paragraph}</p>`).join("") : `<p>${body}</p>`;
  elements.documentContext.textContent = entry.context || entry.historicalNote || "复合创作环境叙事";
  elements.document.hidden = false;
  SetMode("Document");
  PlayAudio("discover", runtime.player.position, 0.48);
}

function CloseDocument() {
  elements.document.hidden = true;
  if (mode === "Document") {
    SetMode("Playing");
    if (pendingDocumentCompanionLine) QueueDialogue([{ speaker: "杜湘云", text: pendingDocumentCompanionLine }]);
  }
  pendingDocumentCompanionLine = "";
}

function ResolveRouteChoice(choiceId, option) {
  if (!runtime || runtime.routeChoice || CurrentStage().stageId !== "decideRouteFate") return false;
  const evaluation = Narrative.EvaluateRouteOption(
    Story.routeChoice,
    choiceId,
    NarrativeStateSnapshot(),
    { interactables: Level.interactables, triggers: Level.storyTriggers || Level.levelTriggers },
  );
  if (!evaluation.available || !evaluation.option) {
    ShowToast(evaluation.reason || option?.unavailableReason || "眼下不能这样处理交通线。", 3);
    return false;
  }
  const resolvedOption = evaluation.option;
  runtime.routeChoice = resolvedOption.choiceId || resolvedOption.optionId;
  [
    ...(resolvedOption.setFlags || []),
    ...(resolvedOption.setsFlags || []),
    ...(evaluation.interactable?.setFlags || []),
    ...(evaluation.interactable?.setsFlags || []),
  ].forEach((flagId) => runtime.flags.add(flagId));
  if (evaluation.trigger) ActivateStoryTrigger(evaluation.trigger);
  elements.choice.hidden = true;
  SetMode("Playing");
  ShowToast(resolvedOption.consequence || option?.consequence || "选择已经记下。", 3.4);
  AdvanceStage("sceneChoice");
  return true;
}

function PlayAudio(cueId, position = runtime?.player?.position, gain = 1) {
  const audio = presentation?.audio;
  if (!audio || runtime?.settings?.sound === false) return;
  audio.PlayCue?.(cueId, position ? { x: position.x, y: GetTerrainHeight(position.x, position.z) + 1, z: position.z } : null, { gain });
}

function SyncPresentation(immediate = false) {
  if (!presentation || !runtime) return;
  const playerRig = presentation.playerRig;
  const companionRig = presentation.companionRig;
  const playerY = GetTerrainHeight(runtime.player.position.x, runtime.player.position.z);
  playerRig?.group?.position?.set(runtime.player.position.x, playerY, runtime.player.position.z);
  if (playerRig?.group) playerRig.group.rotation.y = runtime.player.facing + Math.PI;
  const companionY = GetTerrainHeight(runtime.companion.position.x, runtime.companion.position.z);
  companionRig?.group?.position?.set(runtime.companion.position.x, companionY, runtime.companion.position.z);
  if (companionRig?.group) {
    companionRig.group.rotation.y = runtime.companion.facing + Math.PI;
    companionRig.group.visible = runtime.companion.active;
  }
  (presentation.enemies || []).forEach((rig, index) => {
    const enemy = runtime.enemies[index];
    if (!rig?.group) return;
    rig.group.visible = Boolean(enemy?.active);
    if (!enemy) return;
    rig.group.position.set(enemy.position.x, GetTerrainHeight(enemy.position.x, enemy.position.z), enemy.position.z);
    rig.group.rotation.y = Math.atan2(enemy.forward.x, enemy.forward.z) + Math.PI;
  });
  ApplyStagePresentationVisibility();
  if (immediate) UpdateCamera(1, true);
}

function ApplyStagePresentationVisibility() {
  const evacuationRoot = presentation?.environment?.evacuation?.root;
  if (!evacuationRoot || !runtime) return;
  // The handcart tableau belongs to the station preparation beat. Once the
  // east gate opens, the evacuees remain ahead of the playable camera and do
  // not re-materialize as foreground dressing at each later objective.
  evacuationRoot.visible = CurrentStage()?.stageId === "prepareQuietPassage"
    && !runtime.flags.has("eastGateOpen");
}

function UpdatePresentation(delta) {
  if (!presentation || !runtime) return;
  SyncPresentation(false);
  UpdateCamera(delta, false);
  const playerSpeed = Math.hypot(runtime.player.velocity.x, runtime.player.velocity.z) / 4.8;
  const companionSpeed = Math.hypot(runtime.companion.velocity.x, runtime.companion.velocity.z) / 4.4;
  const strongestAlert = runtime.enemies.reduce((maximum, enemy) => Math.max(maximum, enemy.active ? enemy.suspicion : 0), 0);
  const characterState = {
    player: {
      speed: Clamp(playerSpeed, 0, 1),
      crouch: runtime.player.crouched,
      injured: runtime.player.injured,
      aiming: runtime.player.aiming,
      alert: strongestAlert,
    },
    companion: {
      speed: Clamp(companionSpeed, 0, 1),
      crouch: strongestAlert > 0.45,
      injured: runtime.companion.health < 55,
      alert: strongestAlert,
    },
    enemies: runtime.enemies.map((enemy) => ({
      speed: enemy.active && ["patrol", "search", "alert", "engage", "lostTarget"].includes(enemy.state) ? (enemy.state === "engage" ? 0.85 : 0.48) : 0,
      crouch: false,
      injured: enemy.health < 60,
      aiming: enemy.state === "engage",
      alert: ["alert", "engage"].includes(enemy.state) ? 1 : enemy.suspicion,
    })),
  };
  presentation.Update?.(delta, {
    characters: characterState,
    effects: { playerPosition: runtime.player.position, cameraPosition: presentation.camera.position, intensity: strongestAlert },
    environment: { time: runtime.elapsedSeconds, playerPosition: runtime.player.position, phase: CurrentStage()?.stageId, tension: strongestAlert },
    audio: { intensity: strongestAlert, tension: strongestAlert },
    skipRender: true,
  });
  ApplyStagePresentationVisibility();
}

function UpdateCamera(delta, immediate = false) {
  const camera = presentation?.camera;
  if (!camera) return;
  const player = runtime.player.position;
  const cameraDistance = runtime.player.aiming ? 4.1 : 5.8;
  const shoulder = runtime.player.aiming ? 0.75 : 0.18;
  const sin = Math.sin(input.cameraYaw);
  const cos = Math.cos(input.cameraYaw);
  const targetHeight = runtime.player.crouched ? 1.15 : 1.55;
  const desired = new THREE.Vector3(
    player.x + sin * cameraDistance + cos * shoulder,
    GetTerrainHeight(player.x, player.z) + 2.75 + input.cameraPitch * 2.1,
    player.z + cos * cameraDistance - sin * shoulder,
  );
  if (immediate) camera.position.copy(desired);
  else camera.position.lerp(desired, 1 - Math.exp(-delta * (runtime.player.aiming ? 12 : 7.5)));
  const lookDistance = runtime.player.aiming ? 6.5 : 2.5;
  const lookAt = new THREE.Vector3(
    player.x - sin * lookDistance,
    GetTerrainHeight(player.x, player.z) + targetHeight + input.cameraPitch * 1.7,
    player.z - cos * lookDistance,
  );
  camera.lookAt(lookAt);
}

function UpdateHud() {
  if (!runtime) return;
  const stage = CurrentStage();
  elements.missionTitle.textContent = stage.title || Story.storyMetadata?.chapterTitle || "灯灭以后";
  if (!(stage.mode === "hold" && runtime.triggered.has(`${stage.stageId}_hold`)) && stage.mode !== "wait") elements.objectiveText.textContent = ObjectiveForStage(stage);
  const totalMinutes = 20 * 60 + 43 + Math.floor(runtime.elapsedSeconds);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  elements.missionClock.textContent = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  elements.healthFill.style.width = `${runtime.player.health}%`;
  elements.healthText.textContent = runtime.player.health > 72 ? "尚能行动" : (runtime.player.health > 38 ? "负伤" : "伤势严重");
  elements.staminaFill.style.width = `${runtime.player.stamina}%`;
  elements.bottleCount.textContent = runtime.resources.bottle;
  elements.bandageCount.textContent = runtime.resources.bandage;
  elements.ammoCount.textContent = runtime.resources.ammo;
  elements.companionPanel.classList.toggle("inactive", !runtime.companion.active);
  elements.companionStatus.textContent = !runtime.companion.active ? "尚未会合" : (runtime.companion.assisting ? "正在救援" : `${runtime.companion.command === "stay" ? "留守" : "跟随"} · ${runtime.enemies.some((enemy) => enemy.state === "engage") ? "受压" : "安静"}`);
  elements.companionHealth.style.width = `${runtime.companion.health}%`;
  const direction = new THREE.Vector3(-Math.sin(input.cameraYaw), 0, -Math.cos(input.cameraYaw));
  const labels = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  let angle = Math.atan2(direction.x, -direction.z);
  if (angle < 0) angle += Math.PI * 2;
  elements.compassLabel.textContent = labels[Math.round(angle / (Math.PI / 4)) % 8];
  UpdateMarker();
  UpdateQaStatus();
}

function UpdateMarker() {
  if (!presentation?.camera || !runtime || mode !== "Playing") {
    elements.worldMarker.hidden = true;
    return;
  }
  const stage = CurrentStage();
  const kilnObjective = stage.stageId === "holdKilnMouth"
    ? KilnDefense.GetKilnDefenseObjective(runtime.kilnDefense)
    : null;
  const target = ResolveCurrentObjectivePosition(stage);
  const vector = new THREE.Vector3(target.x, GetTerrainHeight(target.x, target.z) + 1.45, target.z);
  const distance = Distance(runtime.player.position, target);
  vector.project(presentation.camera);
  const behind = vector.z > 1;
  const x = Clamp((vector.x * 0.5 + 0.5) * innerWidth, 60, innerWidth - 60);
  const y = Clamp((-vector.y * 0.5 + 0.5) * innerHeight, 92, innerHeight - 130);
  const markerRadius = kilnObjective?.radius || stage.radius || 4;
  elements.worldMarker.hidden = distance < markerRadius * 0.7;
  elements.worldMarker.style.transform = `translate3d(${behind ? innerWidth * 0.5 : x}px,${behind ? 112 : y}px,0)`;
  elements.markerLabel.textContent = kilnObjective?.prompt || stage.markerLabel || stage.title || "目标";
  elements.markerDistance.textContent = `${Math.max(1, Math.round(distance))} 米`;
}

function FailMission(title, body) {
  if (mode === "Failed") return;
  HideAllScreens();
  elements.failure.hidden = false;
  elements.failureTitle.textContent = title || "交通线在这里断了";
  elements.failureBody.textContent = body || "失败不是伤亡统计。回到最近的检查点，再听一次周围的声音。";
  SetMode("Failed");
  presentation?.audio?.SetIntensity?.(0.2);
}

function FinishMission() {
  const preserved = !/seal|close|block/i.test(runtime.routeChoice || "");
  const endingEventId = preserved ? "eventEndingPreserve" : "eventEndingSeal";
  const endingEvent = (Story.storyEvents || []).find((event) => event.id === endingEventId);
  const endingLines = EventDialogue(endingEvent);
  const quiet = runtime.metrics.alerts === 0;
  const restrained = runtime.metrics.shotsFired === 0;
  const found = runtime.documentsFound.size;
  HideAllScreens();
  elements.ending.hidden = false;
  elements.endingEyebrow.textContent = "第一章完 · 转移队抵达石沟北口";
  elements.endingTitle.textContent = endingEvent?.title?.replace(/^结局：/, "") || (preserved ? "路还在人的记忆里" : "今晚，洞口没有留下脚印");
  elements.endingQuote.textContent = endingLines.length
    ? endingLines.map((line) => `${line.speaker}：“${line.text}”`).join("\n")
    : (preserved ? "“路不是画在纸上的。路是有人还肯给你开门。”" : "“先把今晚的人送到天亮。下一条路，再从人的脚下找。”");
  const consequences = [
    { label: "转移队", value: "全队抵达", detail: "秀禾扶着母亲，苗槐生守着伤员车，何芹最后清点" },
    { label: "交通线", value: preserved ? "冒险保留" : "主动封存", detail: preserved ? "此后每次通行先走一遍空路" : "槐树沟近路从此停用" },
    { label: "封锁反应", value: quiet ? "未传出警号" : "封锁哨已被惊动", detail: restrained ? "没有留下枪声" : "枪声迫使后续联络暂时停下" },
    { label: "留下的生活", value: found > 0 ? "有人会记得" : "痕迹仍留在路边", detail: found > 0 ? "粮瓮、识字板和灰手印不会被换成奖赏" : "没有把别人的生活折成收集数字" },
  ];
  elements.endingConsequences.innerHTML = consequences.map((entry) => `<section><span>${entry.label}</span><b>${entry.value}</b><small>${entry.detail}</small></section>`).join("");
  elements.endingBody.textContent = endingEvent?.endCard || (preserved
    ? "天亮后，杜湘云把假脚印的方向重新画进每个人的记忆里。那张纸没有留下，路却没有只属于纸。"
    : "天亮后，水洞被乱石封死。杜湘云从住户次序的最后一页撕下一条空白，准备去记另一条更远的路。");
  localStorage.removeItem(checkpointKey);
  SetMode("Ended");
  PlayAudio("objective", runtime.player.position, 0.7);
}

function QaTeleport(stageReference) {
  StartMission(false);
  const requestedIndex = typeof stageReference === "string"
    ? Stages().findIndex((stage) => stage.stageId === stageReference)
    : Number(stageReference);
  const index = Clamp(requestedIndex < 0 ? 0 : requestedIndex, 0, Stages().length - 1);
  EnterStage(index, true);
  const stageId = CurrentStage().stageId;
  if (["reachIrrigationDitch", "disableWarningLine", "crossDrainageCulvert", "holdKilnMouth", "waitForClearSignal", "decideRouteFate", "reachSafeRidge"].includes(stageId)) {
    ["cartMuffled", "eastGateOpen", "convoyMoving"].forEach((flagId) => runtime.flags.add(flagId));
  }
  if (["disableWarningLine", "crossDrainageCulvert", "holdKilnMouth", "waitForClearSignal", "decideRouteFate", "reachSafeRidge"].includes(stageId)) runtime.flags.add("blockadeObserved");
  if (["crossDrainageCulvert", "holdKilnMouth", "waitForClearSignal", "decideRouteFate", "reachSafeRidge"].includes(stageId)) runtime.flags.add("warningLineCut");
  if (["holdKilnMouth", "waitForClearSignal", "decideRouteFate", "reachSafeRidge"].includes(stageId)) runtime.flags.add("firstGroupClear");
  if (["decideRouteFate", "reachSafeRidge"].includes(stageId)) {
    runtime.flags.add("allCiviliansClear");
    runtime.flags.add("routeDecisionReady");
  }
  const target = ResolveTarget(CurrentStage().targetId);
  const offsets = {
    reachIrrigationDitch: { x: -4, z: 3 },
    holdKilnMouth: { x: 0, z: 4 },
    decideRouteFate: { x: 0, z: 2 },
  };
  const offset = offsets[stageId] || { x: 0, z: (CurrentStage().radius || 4) + 1 };
  runtime.player.position = { x: target.x + offset.x, z: target.z + offset.z };
  if (index >= 2) {
    runtime.companion.active = true;
    runtime.companion.position = ResolveCompanionResetPosition(runtime.player.position);
    runtime.companion.ai = Systems.CreateCompanionState({
      ...runtime.companion.ai,
      position: runtime.companion.position,
      active: true,
      alive: true,
    });
  }
  SyncPresentation(true);
  UpdateHud();
}

function QaMoveToCurrentObjective() {
  if (!runtime || mode !== "Playing") return;
  const target = ResolveCurrentObjectivePosition(CurrentStage());
  runtime.player.position = { ...target };
  runtime.player.velocity = { x: 0, z: 0 };
  SyncPresentation(true);
  UpdateNearbyInteraction();
  UpdateHud();
  ShowToast("QA：只移动位置，仍需按 F 完成真实互动。", 1.8);
}

function QaMoveToInteractable(interactableId) {
  if (!runtime || mode !== "Playing") return;
  const interactable = (Level.interactables || []).find((entry) => (
    (entry.interactableId || entry.id) === interactableId
  ));
  if (!interactable?.position) return;
  runtime.player.position = {
    x: Number(interactable.position.x) || 0,
    z: Number(interactable.position.z) || 0,
  };
  runtime.player.velocity = { x: 0, z: 0 };
  SyncPresentation(true);
  UpdateNearbyInteraction();
  UpdateHud();
  ShowToast("QA：只移动到路线实体，仍需按 F 落实选择。", 1.8);
}

function QaPrepareStation() {
  StartMission(false);
  subtitleQueue = [];
  elements.subtitlePanel.hidden = true;
  runtime.flags.add("millSignalRead");
  EnterStage(2, true);
  const stage = CurrentStage();
  const trigger = (Level.storyTriggers || []).find((entry) => (
    (entry.triggerId || entry.id) === stage.exitTriggerId
  ));
  const center = trigger?.position || trigger?.center || ResolveTarget(stage.targetId);
  const target = {
    x: Number(center.x ?? center[0]) || 0,
    z: Number(center.z ?? center[2] ?? center[1]) || 0,
  };
  runtime.player.position = { ...target };
  runtime.companion.position = ResolveCompanionResetPosition(runtime.player.position);
  runtime.companion.ai.position = { ...runtime.companion.position };
  runtime.companion.active = true;
  SyncPresentation(true);
  UpdateNearbyInteraction();
  UpdateHud();
  ShowToast("QA：已到交通站门前，请按 F 完成真实互动。", 2.4);
}

function BuildCompanionCameraAudit() {
  if (!runtime || !presentation?.camera) return null;
  presentation.camera.updateMatrixWorld?.(true);
  const cameraForward = { x: -Math.sin(input.cameraYaw), z: -Math.cos(input.cameraYaw) };
  const cameraRight = { x: Math.cos(input.cameraYaw), z: -Math.sin(input.cameraYaw) };
  const offset = {
    x: runtime.companion.position.x - runtime.player.position.x,
    z: runtime.companion.position.z - runtime.player.position.z,
  };
  const projected = new THREE.Vector3(
    runtime.companion.position.x,
    GetTerrainHeight(runtime.companion.position.x, runtime.companion.position.z) + 1.2,
    runtime.companion.position.z,
  ).project(presentation.camera);
  const rearDistance = -(offset.x * cameraForward.x + offset.z * cameraForward.z);
  const lateralDistance = offset.x * cameraRight.x + offset.z * cameraRight.z;
  const companionConfig = runtime.systems.config.companion;
  return {
    ndcX: projected.x,
    ndcY: projected.y,
    ndcZ: projected.z,
    screenXPercent: (projected.x * 0.5 + 0.5) * 100,
    onScreen: Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z >= -1 && projected.z <= 1,
    rearDistance,
    lateralDistance,
    occupiesForegroundCorridor: rearDistance > 0.2
      && rearDistance < companionConfig.cameraRearDangerDistance
      && Math.abs(lateralDistance) < companionConfig.cameraCorridorHalfWidth,
  };
}

function BuildUiLayoutAudit() {
  if (typeof getComputedStyle !== "function") return null;
  const FontSize = (element) => element ? Number.parseFloat(getComputedStyle(element).fontSize) : null;
  const subtitleRect = elements.subtitlePanel?.getBoundingClientRect?.();
  return {
    viewport: { width: innerWidth, height: innerHeight },
    fontPixels: {
      controlHint: FontSize(elements.controlHints),
      controlKey: FontSize(elements.controlHints?.querySelector("kbd")),
      healthLabel: FontSize(elements.healthText),
      resourceLabel: FontSize(elements.resourcePanel?.querySelector(".quickItems span")),
      resourceCount: FontSize(elements.resourcePanel?.querySelector(".quickItems b")),
      resourceKey: FontSize(elements.resourcePanel?.querySelector(".quickItems kbd")),
      titleFooter: FontSize(elements.title?.querySelector(".titleFooter")),
      endingDetail: FontSize(elements.endingConsequences?.querySelector("small")),
      endingFooter: FontSize(elements.ending?.querySelector("footer")),
    },
    subtitleBounds: subtitleRect ? {
      left: subtitleRect.left,
      top: subtitleRect.top,
      right: subtitleRect.right,
      bottom: subtitleRect.bottom,
      topPercent: subtitleRect.top / innerHeight * 100,
      bottomPercent: subtitleRect.bottom / innerHeight * 100,
    } : null,
  };
}

function BuildRendererAudit() {
  const renderer = presentation?.renderer;
  if (!renderer) return null;
  const contextAttributes = renderer.getContext?.()?.getContextAttributes?.();
  const shadowMapSize = presentation?.environment?.lights?.moon?.shadow?.mapSize;
  return {
    pixelRatio: renderer.getPixelRatio(),
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    antialias: Boolean(contextAttributes?.antialias),
    shadowMapEnabled: Boolean(renderer.shadowMap?.enabled),
    shadowMapType: renderer.shadowMap?.type ?? null,
    shadowMapSize: shadowMapSize ? { width: shadowMapSize.width, height: shadowMapSize.height } : null,
  };
}

function BuildCharacterModelAudit(rig) {
  if (!rig) return null;
  const muzzleAnchor = rig.nodes?.muzzleAnchor;
  let muzzle = null;
  let gripAlignment = null;
  if (muzzleAnchor?.getWorldPosition && muzzleAnchor?.getWorldQuaternion) {
    rig.group?.updateWorldMatrix?.(true, true);
    const position = muzzleAnchor.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      muzzleAnchor.getWorldQuaternion(new THREE.Quaternion()),
    );
    const cameraForward = presentation?.camera?.getWorldDirection?.(new THREE.Vector3());
    muzzle = {
      position: { x: position.x, y: position.y, z: position.z },
      forward: { x: forward.x, y: forward.y, z: forward.z },
      cameraAlignment: cameraForward ? forward.dot(cameraForward) : null,
    };
  }
  const rightHand = rig.nodes?.rightHand;
  const leftHand = rig.nodes?.leftHand;
  const rearGrip = rig.nodes?.rearGrip;
  const frontGrip = rig.nodes?.frontGrip;
  if ([rightHand, leftHand, rearGrip, frontGrip].every((object) => object?.getWorldPosition)) {
    const rightHandPosition = rightHand.getWorldPosition(new THREE.Vector3());
    const leftHandPosition = leftHand.getWorldPosition(new THREE.Vector3());
    const rearGripPosition = rearGrip.getWorldPosition(new THREE.Vector3());
    const frontGripPosition = frontGrip.getWorldPosition(new THREE.Vector3());
    gripAlignment = {
      rightHandToRearGrip: rightHandPosition.distanceTo(rearGripPosition),
      leftHandToFrontGrip: leftHandPosition.distanceTo(frontGripPosition),
    };
  }
  return {
    source: rig.modelSource || "procedural",
    loadState: rig.modelLoadState || "procedural",
    error: rig.root?.userData?.characterModelError || null,
    characterId: rig.loadedModel?.userData?.characterId || null,
    joints: rig.nodes?.skinnedMesh?.skeleton?.bones?.length || 0,
    loadedVisible: Boolean(rig.loadedModelHost?.visible),
    fallbackVisible: Boolean(rig.fallbackNodes?.motionRoot?.visible ?? rig.nodes?.motionRoot?.visible),
    sourceFrontAxis: rig.loadedModelHost?.userData?.sourceFrontAxis || "-Z",
    gameFrontAxis: rig.loadedModelHost?.userData?.gameFrontAxis || "-Z",
    muzzle,
    gripAlignment,
  };
}

function BuildQaSnapshot() {
  return {
    mode,
    stageIndex: runtime?.stageIndex,
    stageId: runtime ? CurrentStage()?.stageId : null,
    stageTimer: runtime?.stageTimer ?? 0,
    routeChoice: runtime?.routeChoice ?? null,
    renderProfile: "desktopMaximum",
    simulationProfile: runtime?.systems?.config?.performance?.profileId ?? "desktop",
    player: runtime ? structuredClone(runtime.player) : null,
    companion: runtime ? structuredClone(runtime.companion) : null,
    companionCamera: BuildCompanionCameraAudit(),
    characterModels: {
      player: BuildCharacterModelAudit(presentation?.playerRig),
      companion: BuildCharacterModelAudit(presentation?.companionRig),
    },
    evacuationTableauVisible: Boolean(presentation?.environment?.evacuation?.root?.visible),
    uiAudit: BuildUiLayoutAudit(),
    enemies: runtime ? runtime.enemies.map((enemy) => ({
      enemyId: enemy.enemyId,
      state: enemy.state,
      suspicion: enemy.suspicion,
      active: enemy.active,
      position: { ...enemy.position },
    })) : [],
    resources: runtime ? { ...runtime.resources } : null,
    metrics: runtime ? { ...runtime.metrics } : null,
    counters: runtime ? { ...runtime.counters } : null,
    flags: runtime ? [...runtime.flags] : [],
    kilnDefense: runtime ? structuredClone(runtime.kilnDefense) : null,
    subtitle: {
      visible: !elements.subtitlePanel.hidden,
      speaker: elements.subtitleSpeaker.textContent,
      text: elements.subtitleText.textContent,
      queued: subtitleQueue.length,
    },
    renderer: BuildRendererAudit(),
  };
}

function UpdateQaStatus() {
  if (!qaMode || !elements.qaStatus) return;
  const snapshot = BuildQaSnapshot();
  const activeEnemies = snapshot.enemies.filter((enemy) => enemy.active).length;
  elements.qaStatus.textContent = `${mode} · ${snapshot.stageId || "none"} · ${activeEnemies} AI · ${snapshot.player?.health?.toFixed?.(0) || 0} HP`;
  elements.qaPanel.dataset.snapshot = JSON.stringify(snapshot);
}

function InstallQaApi() {
  window.__ASHEN_ROUTE_QA__ = Object.freeze({
    Snapshot: BuildQaSnapshot,
    Start: () => StartMission(false),
    Teleport: QaTeleport,
    Station: QaPrepareStation,
    Advance: () => AdvanceStage("qaApi"),
    ThrowDecoy,
    Fire: RunQaAimFireSequence,
    Damage: (amount = 20) => DamagePlayer(amount),
    MoveTo: (position = {}) => {
      runtime.player.position = {
        x: Number(position.x) || 0,
        z: Number(position.z) || 0,
      };
      SyncPresentation(true);
      UpdateNearbyInteraction();
      UpdateHud();
      return BuildQaSnapshot();
    },
    SetHealth: (health = 100) => {
      runtime.player.health = Clamp(health, 1, runtime.player.maxHealth);
      runtime.player.injured = runtime.player.health < 55;
      UpdateHud();
      return BuildQaSnapshot();
    },
    SetAlertLevel: (alertLevel = 0) => {
      runtime.counters.alertLevel = Math.max(0, Math.floor(Number(alertLevel) || 0));
      UpdateNearbyInteraction();
      UpdateHud();
      return BuildQaSnapshot();
    },
    SetCameraYaw: (yawRadians = 0) => {
      input.cameraYaw = Number.isFinite(Number(yawRadians)) ? Number(yawRadians) : 0;
      UpdateCamera(1, true);
      return BuildQaSnapshot();
    },
    Finish: FinishMission,
  });
}

Boot();
