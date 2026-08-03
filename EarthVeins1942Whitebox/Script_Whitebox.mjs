import { actorProfiles, roleDefinitions, buildOptions, levelDefinitions, coverDefinitions } from "./Data_WhiteboxCampaign.mjs?v=20260803zt";
import { CreateTunnelFluidSimulation } from "./Script_FluidSimulation.mjs?v=20260803zn";
import { CreateSdfLightRenderer } from "./Script_LightSimulation.mjs?v=20260803zn";

const canvas = document.querySelector("#gameCanvas");
const context = canvas.getContext("2d", { alpha: false });
const ui = Object.fromEntries([
  "gameShell", "titleScreen", "levelCards", "startButton", "guideButton", "levelPanel", "levelList", "guidePanel",
  "gameHeader", "levelNumber", "levelName", "phaseStrip", "menuButton", "objectiveCard", "phaseLabel", "objectiveText",
  "objectiveHint", "hudRoleGlyph", "hudRoleName", "hudRoleSkill", "metricsPanel", "roleDock", "roleButtons", "interactionPrompt", "interactionVerb", "interactionName",
  "dialoguePanel", "dialogueSpeaker", "dialogueText", "dialogueNext", "buildPanel", "buildBrief", "buildOptions",
  "buildFeedback", "buildCancel", "levelComplete", "completeTitle", "completeSummary", "completeLedger", "replayButton",
  "nextLevelButton", "completeLevelsButton", "touchControls", "toast", "cinematicBars", "cinematicCaption",
  "cinematicLabel", "cinematicSpeaker", "cinematicText", "cinematicProgress", "skipCinematic"
  , "civilianCommandPanel", "civilianGroupButtons", "civilianShelterButtons", "civilianStatus"
  , "missionFailure", "failureTitle", "failureSummary", "failureLedger", "failureReplayButton", "failureQaButton"
  , "qaPanel", "qaLevelButtons", "qaPhaseButtons", "qaHazardButtons", "qaStateReadout"
  , "dogCommandHud", "dogCommandStatus", "dogCommandProgress"
].map((id) => [id, document.querySelector(`#${id}`)]));

const qaMode = new URLSearchParams(location.search).get("qa") === "1";
const startingLevel = Math.max(0, Math.min(levelDefinitions.length - 1, Number(new URLSearchParams(location.search).get("level")) || 0));
const worldMin = -11;
const worldMax = 11;
const entrances = [-1.1, 8.6];
const combatDepthLinks = Object.freeze([
  Object.freeze({ id: "cellar", x: -7.15, lower: "tunnel", upper: "interior", requires: "unboltCellarHatch", name: "西屋地窖翻板" }),
  Object.freeze({ id: "roofHatch", x: .75, lower: "interior", upper: "roof", requires: "openRoofHatch", name: "房梁暗梯" })
]);
const requiredCollect = ["collectWood", "collectIron", "collectPowder", "collectSupplies"];
const requiredRescues = ["wounded", "grain", "courier"];
const takedownRoles = new Set(["leader", "blacksmith", "scout"]);
const patrolRouteSets = Object.freeze({
  collect: Object.freeze([
    Object.freeze({ anchor: -2.8, span: 3.15, speed: .3, phase: 1.1, viewDistance: 3.15 }),
    Object.freeze({ anchor: 7.55, span: 2.05, speed: .24, phase: 4.05, viewDistance: 3.05 })
  ]),
  defense: Object.freeze([
    Object.freeze({ anchor: -7.55, span: 1.75, speed: .28, phase: .45, viewDistance: 3.1 }),
    Object.freeze({ anchor: .45, span: 2.35, speed: .24, phase: 3.3, viewDistance: 3.15 }),
    Object.freeze({ anchor: 8.0, span: 1.65, speed: .31, phase: 5.15, viewDistance: 3.0 })
  ]),
  ensemble: Object.freeze([
    Object.freeze({ anchor: -2.55, span: 3.05, speed: .27, phase: .7, viewDistance: 3.15 }),
    Object.freeze({ anchor: 7.45, span: 2.15, speed: .23, phase: 4.2, viewDistance: 3.05 })
  ]),
  mindGame: Object.freeze([
    Object.freeze({ anchor: -6.95, span: 2.0, speed: .29, phase: .4, viewDistance: 3.35 }),
    Object.freeze({ anchor: .65, span: 2.45, speed: .22, phase: 3.25, viewDistance: 3.4 }),
    Object.freeze({ anchor: 8.05, span: 1.8, speed: .31, phase: 5.0, viewDistance: 3.2 })
  ]),
  rooftopBattle: Object.freeze([
    Object.freeze({ anchor: -5.15, span: 1.45, speed: .2, phase: .2, viewDistance: 3.0, layer: "roof" }),
    Object.freeze({ anchor: -1.35, span: 1.2, speed: .17, phase: 3.0, viewDistance: 2.85, layer: "roof" }),
    Object.freeze({ anchor: 3.85, span: 1.35, speed: .19, phase: 1.4, viewDistance: 3.1, layer: "roof" }),
    Object.freeze({ anchor: 7.65, span: 1.2, speed: .16, phase: 4.55, viewDistance: 3.0, layer: "roof" })
  ])
});
const inputKeys = { left: false, right: false };
const fluidCanvas = document.createElement("canvas");
const fluidContext = fluidCanvas.getContext("2d");
const lightRenderer = CreateSdfLightRenderer({ resolutionScale: .52, rayCount: 184 });
let lianhuanhuaTexture = null;
let lianhuanhuaPattern = null;
let selectedLevel = startingLevel;
let lastTime = performance.now();
let toastTimer = 0;
let state = CreateState(startingLevel);

function CreateCivilians() {
  const civilians = [
    { id: "elderYu", name: "于大娘", group: "elders", x: -1.1, targetX: -1.1, smokeDose: 0, waterDose: 0, pace: 1.05, mark: "老" },
    { id: "elderGao", name: "高叔", group: "elders", x: -.7, targetX: -.7, smokeDose: 0, waterDose: 0, pace: .96, mark: "老" },
    { id: "wounded", name: "伤员小周", group: "stretcher", x: .05, targetX: .05, smokeDose: 0, waterDose: 0, pace: .72, mark: "伤" },
    { id: "medic", name: "赵禾", group: "stretcher", x: .5, targetX: .5, smokeDose: 0, waterDose: 0, pace: .82, mark: "护" },
    { id: "childAn", name: "小安", group: "children", x: 1.1, targetX: 1.1, smokeDose: 0, waterDose: 0, pace: 1.35, mark: "童" },
    { id: "childShi", name: "石头", group: "children", x: 1.45, targetX: 1.45, smokeDose: 0, waterDose: 0, pace: 1.42, mark: "童" },
    { id: "mother", name: "石头娘", group: "children", x: 1.8, targetX: 1.8, smokeDose: 0, waterDose: 0, pace: 1.08, mark: "母" },
    { id: "signalman", name: "钟有田", group: "elders", x: -1.5, targetX: -1.5, smokeDose: 0, waterDose: 0, pace: 1.02, mark: "钟" }
  ];
  const visualX = { signalman: -3.1, elderYu: -2.35, elderGao: -1.6, wounded: -.55, medic: .25, childAn: 1.2, childShi: 1.85, mother: 2.55 };
  return civilians.map((civilian) => ({ ...civilian, x: visualX[civilian.id], targetX: visualX[civilian.id] }));
}

function CreateState(levelIndex) {
  const level = levelDefinitions[levelIndex];
  const initialLayer = level.phases[0].layer;
  const rolePositions = Object.fromEntries(level.roleIds.map((roleId, index) => [roleId, {
    x: Math.max(worldMin + .6, Math.min(worldMax - .6, level.startX + index * .34)),
    layer: initialLayer,
    facing: 1
  }]));
  return {
    mode: "title",
    levelIndex,
    level,
    phaseId: level.phases[0].id,
    player: { x: level.startX, layer: level.phases[0].layer, facing: 1, lowProfile: false, coverId: null, coverBlend: 0, step: 0, moving: false, motionBlend: 0, actionKind: null, actionTime: 0, actionDuration: 0, rolePulse: 0, pickup: null },
    selectedRole: level.startRole,
    rolePositions,
    completed: new Set(),
    resources: { wood: 0, iron: 0, powder: 0, medicine: 0, grain: 0 },
    buildSlots: [null, null, null],
    excavated: new Set(),
    defense: { ventilation: 0, strength: 0, enemyUnits: 8, triggered: 0, activeSlots: new Set(), siteMatches: [false, false, false] },
    prepRemaining: levelIndex === 0 ? 128 : null,
    raid: { active: false, elapsed: 0, duration: 72, stage: "准备", announcedStage: null, smokeKnown: false, waterKnown: false, distraction: null, dogSmokeRelief: 0 },
    patrolLure: null,
    dogBarkCooldown: 0,
    dog: { x: level.startX + .55, layer: level.phases[0].layer, facing: 1, step: 0, motionBlend: 0, actionKind: null, commandId: null, commandMode: "follow", targetX: level.startX + .55, targetLayer: level.phases[0].layer, workRemaining: 0, workDuration: 0, progress: 0, whistlePulse: 0, resultTime: 0, lastResult: "" },
    civilians: levelIndex === 0 ? CreateCivilians() : [],
    selectedCivilianGroup: "elders",
    missionFailure: null,
    cleanCapture: false,
    qaEnemyFocusId: null,
    qaFreezePatrols: false,
    qaPatrolTime: 0,
    qaSafePreview: false,
    qaPatrolReview: false,
    fluid: levelIndex === 0 ? CreateTunnelFluidSimulation({ columns: 152, rows: 58 }) : null,
    fluidAccumulator: 0,
    rescues: { wounded: false, grain: false, courier: false },
    memories: [],
    visibility: 0,
    detection: 0,
    detected: false,
    caught: null,
    takedown: null,
    takedownCount: 0,
    takedownGrace: 0,
    neutralizedEnemies: new Set(),
    unconsciousEnemies: [],
    lastSafeX: level.startX,
    alert: 18,
    morale: 100,
    tricks: new Set(),
    puzzle: {
      survey: { waterKnown: false, windKnown: false, centerKnown: false },
      links: { west: false, center: false, east: false },
      routes: { civiliansBriefed: false },
      transfer: {
        dogRouteKnown: false, patrolWindowKnown: false, camoReady: false, hatchBraced: false,
        hatchOpen: false, childInside: false, innerGateOpen: false, forkKnown: false,
        wideSupported: false, lowDrainOpen: false, woundedRoute: null, grainRoute: null,
        courierBearingKnown: false, mistakes: 0
      },
      deception: {
        approachKnown: false, echoKnown: false, emptyBranchKnown: false,
        visibleDecoy: null, acousticRoute: null, falseEntrance: null,
        solved: false, contradictions: 0, mistakes: 0, enemyBelief: "未形成"
      }
    },
    combat: {
      rifle: false, ammo: 0, grenades: 0, health: 3, alarm: false,
      shots: [], grenadesInFlight: [], blasts: [], blastScars: [], enemyShots: [],
      rifleCooldown: 0, enemyFireCooldown: .8, neutralized: 0, recoveredAmmo: 0,
      muzzleFlash: 0, damageFlash: 0, objectiveTriggered: false
    },
    nextRaid: null,
    camera: { x: level.startX, zoom: 1, targetX: level.startX, targetZoom: 1 },
    cinematic: null,
    currentBuildSlot: null,
    pendingComplete: false,
    elapsed: 0
  };
}

function CurrentPhase() {
  return state.level.phases.find((phase) => phase.id === state.phaseId);
}

function PhaseIndex() {
  return state.level.phases.findIndex((phase) => phase.id === state.phaseId);
}

function Show(element, visible = true) {
  if (element) element.hidden = !visible;
}

function RenderLevelSelectors() {
  const markup = levelDefinitions.map((level, index) => `
    <button class="levelCard ${index === selectedLevel ? "selected" : ""}" type="button" data-level="${index}">
      <small>${level.number} · ${level.subtitle}</small>
      <b>${level.title}</b>
      <span>${level.thesis}</span>
      <i>${index === 0 ? "勘探 → 建网 → 抗烟水 → 缴获" : index === 1 ? "侦察 → 隔墙接力 → 分路转移 → 联通" : index === 2 ? "听声辨路 → 三路配局 → 误导入网 → 情报" : "入室 → 取械 → 屋脊 → 撤离"}</i>
    </button>`).join("");
  ui.levelCards.innerHTML = markup;
  ui.levelList.innerHTML = markup;
  document.querySelectorAll("[data-level]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedLevel = Number(button.dataset.level);
      RenderLevelSelectors();
    });
    button.addEventListener("dblclick", () => StartLevel(Number(button.dataset.level)));
  });
}

function StartLevel(levelIndex) {
  selectedLevel = levelIndex;
  state = CreateState(levelIndex);
  state.mode = "play";
  Show(ui.titleScreen, false);
  Show(ui.levelPanel, false);
  Show(ui.guidePanel, false);
  Show(ui.levelComplete, false);
  Show(ui.missionFailure, false);
  Show(ui.gameHeader);
  Show(ui.objectiveCard);
  Show(ui.metricsPanel);
  Show(ui.roleDock, state.level.roleIds.length > 1);
  Show(ui.dogCommandHud, state.levelIndex === 0);
  Show(ui.civilianCommandPanel, false);
  ui.levelNumber.textContent = state.level.number;
  ui.levelName.textContent = state.level.title;
  ui.failureQaButton.textContent = state.levelIndex === 3 ? "DEBUG 跳到屋脊交火" : "DEBUG 跳到扫荡";
  RenderRoleDock();
  RenderQaPanel();
  UpdateUi();
  const opener = state.levelIndex === 0
    ? ["第一轮 · 夜", "民兵队长", "天亮前得把木料和铁件带回来。别在空地停，等巡逻背过身，再从草垛和断墙后走。"]
    : state.levelIndex === 1
      ? ["封锁线外", "赵禾", "伤员走不了明路。咱们几个，一个接一个把门打开。"]
      : state.levelIndex === 2
        ? ["扫荡第三日", "林青禾", "别跟他们碰。弄出点动静就走，让他们自己乱起来。"]
        : ["村北合围", "高传宝", "西屋上头被堵住了。咱从地道进屋，再上房；枪里有几发，就只打几发。"];
  PlayCinematic(...opener, 2.8, state.player.x + 2.2, 1.16);
}

function OpenLevelPanel() {
  Show(ui.levelPanel);
  RenderLevelSelectors();
}

function RenderRoleDock() {
  ui.roleButtons.innerHTML = state.level.roleIds.map((roleId) => {
    const role = roleDefinitions[roleId];
    const profile = actorProfiles[roleId];
    return `<button type="button" data-role="${roleId}" class="${state.selectedRole === roleId ? "active" : ""}">
      <span class="rolePortrait" style="--role:${profile.body};--accent:${profile.accent}"><i>${profile.mark}</i></span><span class="roleCopy"><b>${role.short}</b><small>${role.skill}</small></span>
    </button>`;
  }).join("");
  ui.roleButtons.querySelectorAll("[data-role]").forEach((button) => button.addEventListener("click", () => SelectRole(button.dataset.role)));
}

function SelectRole(roleId) {
  if (!state.level.roleIds.includes(roleId) || IsBlocked()) return;
  if (state.selectedRole === roleId) return;
  if (roleId === "dog" && state.dog.commandId) return Toast("阿土正在执行哨令，等它拉完机关再直接接管。", "warning");
  const previousRole = state.selectedRole;
  if (state.rolePositions?.[previousRole]) {
    Object.assign(state.rolePositions[previousRole], { x: state.player.x, layer: state.player.layer, facing: state.player.facing });
  }
  if (previousRole === "dog") {
    state.dog.x = state.player.x;
    state.dog.layer = state.player.layer;
    state.dog.facing = state.player.facing;
  }
  state.selectedRole = roleId;
  if (roleId === "dog") {
    state.player.x = state.dog.x;
    state.player.layer = state.dog.layer;
    state.player.facing = state.dog.facing;
  } else if (state.rolePositions?.[roleId]) {
    const position = state.rolePositions[roleId];
    state.player.x = position.x;
    state.player.layer = position.layer;
    state.player.facing = position.facing;
  }
  state.player.rolePulse = 1;
  state.player.actionKind = "ready";
  state.player.actionTime = .62;
  state.player.actionDuration = .62;
  RenderRoleDock();
  UpdateUi();
}

function SyncSelectedRolePosition() {
  const position = state.rolePositions?.[state.selectedRole];
  if (!position) return;
  Object.assign(position, { x: state.player.x, layer: state.player.layer, facing: state.player.facing });
  if (state.selectedRole === "dog") Object.assign(state.dog, position);
}

function PuzzleValue(path) {
  return String(path).split(".").reduce((value, key) => value?.[key], state.puzzle);
}

function SetPuzzleValue(path, value) {
  const keys = String(path).split(".");
  let target = state.puzzle;
  for (const key of keys.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== "object") target[key] = {};
    target = target[key];
  }
  target[keys.at(-1)] = value;
}

function PuzzleRequirement(action) {
  return (action.puzzleRequires || []).find((requirement) => PuzzleValue(requirement.path) !== requirement.value);
}

function ActionRemainsAvailable(action) {
  return !state.completed.has(action.id) || action.repeatable || action.buildSlot !== undefined;
}

function ApplyPuzzleMutation(action) {
  if (action.puzzleSet) SetPuzzleValue(action.puzzleSet.path, action.puzzleSet.value);
  if (action.puzzleChoice) {
    SetPuzzleValue(action.puzzleChoice.path, action.puzzleChoice.value);
    Toast(`路线已调整：${action.puzzleChoice.label}`, "success");
  }
}

function TryPuzzleCommit(action) {
  const commit = action.puzzleCommit;
  const mismatches = commit.expected.filter((requirement) => PuzzleValue(requirement.path) !== requirement.value);
  if (mismatches.length) {
    BeginActorAction(action);
    const family = commit.id === "deception" ? state.puzzle.deception : state.puzzle.transfer;
    family.mistakes += 1;
    if (commit.failAlert) state.alert = Math.min(100, state.alert + commit.failAlert);
    if (commit.id === "deception") {
      state.puzzle.deception.enemyBelief = `已识破 ${mismatches.length} 处顺向线索`;
      state.puzzle.deception.contradictions = Math.max(0, 3 - mismatches.length);
    }
    Toast(commit.failText, "warning");
    UpdateUi();
    return false;
  }
  if (commit.id === "deception") {
    state.puzzle.deception.solved = true;
    state.puzzle.deception.contradictions = 3;
    state.puzzle.deception.enemyBelief = "西院有痕 · 东后方有人 · 中口封土通东";
  }
  return true;
}

function ActorActionKind(action) {
  if (action.dogCommand || action.diversion) return "signal";
  if (action.excavate) return "work";
  if (["liftHatch", "unbarGate", "moveGrain", "closeSurfaceGate"].includes(action.id)) return "lift";
  if (["collectWood", "collectIron", "repairCamo", "triggerSlotA", "triggerSlotB", "triggerSlotC"].includes(action.id)) return "work";
  if (["markPatrol", "freeCourier", "routeHorn", "findLetter", "findThimble", "inventoryCapture"].includes(action.id)) return "inspect";
  if (["moveWounded", "collectSupplies", "collectPowder", "hideWellRope", "captureIntel"].includes(action.id)) return "carry";
  if (["crawlGap", "sniffRoute"].includes(action.id)) return "crawl";
  if (["placeHelmet", "fireCracker", "misdirectSquad", "finalSignal"].includes(action.id)) return "signal";
  return "interact";
}

function BeginActorAction(action, duration = .78) {
  state.player.actionKind = ActorActionKind(action);
  state.player.actionTime = Math.max(1.02, duration);
  state.player.actionDuration = Math.max(1.02, duration);
}

function CycleRole() {
  if (state.level.roleIds.length < 2 || IsBlocked()) return;
  const index = state.level.roleIds.indexOf(state.selectedRole);
  SelectRole(state.level.roleIds[(index + 1) % state.level.roleIds.length]);
}

function FindNearestAction() {
  let nearest = null;
  let distance = Infinity;
  for (const action of state.level.actions) {
    if (action.phase !== state.phaseId || action.layer !== state.player.layer) continue;
    if (!ActionRemainsAvailable(action)) continue;
    if (state.dog?.commandId === action.id) continue;
    const currentDistance = Math.abs(action.x - state.player.x);
    if (currentDistance < distance) {
      nearest = action;
      distance = currentDistance;
    }
  }
  return distance <= 1.2 ? nearest : null;
}

function MissingRequirement(action) {
  return (action.requires || []).find((id) => !state.completed.has(id));
}

function PerformAction() {
  if (IsBlocked()) return;
  const action = FindNearestAction();
  const takedownTarget = FindTakedownTarget();
  if (takedownTarget) {
    StartTakedown(takedownTarget);
    return;
  }
  const combatDrop = FindCombatDrop();
  if (combatDrop) {
    CollectCombatDrop(combatDrop);
    return;
  }
  if (state.selectedRole === "dog" && state.player.layer === "surface" && action?.role !== "dog") {
    StartDogBarkLure();
    return;
  }
  const nearbyEnemy = FindFocusedEnemy(1.45);
  if (nearbyEnemy && takedownRoles.has(state.selectedRole)) {
    const interaction = EnemyInteractionState(nearbyEnemy);
    Toast(interaction.instruction, interaction.ready ? "success" : "warning");
    return;
  }
  if (!action) {
    if (state.levelIndex === 3) {
      const nearbyLink = combatDepthLinks.find((link) => Math.abs(link.x - state.player.x) < 1.05 && (link.lower === state.player.layer || link.upper === state.player.layer));
      return Toast(nearbyLink ? `这里用 W 向上、S 向下通过${nearbyLink.name}。` : "靠近可见的枪架、弹盒、布包或翻口再行动。", "neutral");
    }
    const entrance = entrances.find((x) => Math.abs(x - state.player.x) < 1.05);
    Toast(entrance !== undefined ? (state.player.layer === "surface" ? "这里按 S 向下进入地道，不是行动键。" : "这里按 W 向上回到地表，不是行动键。") : "靠近发光的现场标记后再行动。", "neutral");
    return;
  }
  if (action.role && action.role !== state.selectedRole) {
    Toast(`这一步需要${roleDefinitions[action.role].name}。按 Q 或点角色卡切换。`, "warning");
    return;
  }
  const missing = MissingRequirement(action);
  if (missing) {
    const prerequisite = state.level.actions.find((item) => item.id === missing);
    Toast(`还缺前一步：${prerequisite?.title || missing}`, "warning");
    return;
  }
  const puzzleMissing = PuzzleRequirement(action);
  if (puzzleMissing) {
    Toast(puzzleMissing.label || `还没有满足：${puzzleMissing.path}`, "warning");
    return;
  }
  if (action.cover && GetActiveCover()?.id !== action.cover) {
    const cover = GetSurfaceCovers().find((item) => item.id === action.cover);
    Toast(`先进入${cover?.label || "场景遮挡"}后再行动；空地上压低身子不会隐身。`, "warning");
    return;
  }
  if (action.consume) {
    const missingResource = Object.entries(action.consume).find(([key, amount]) => (state.resources[key] || 0) < amount);
    if (missingResource) return Toast(`还缺${missingResource[0] === "powder" ? "一份炮仗火药" : missingResource[0]}。`, "warning");
  }
  if (action.dogCommand) {
    IssueDogCommand(action);
    return;
  }
  if (action.buildSlot !== undefined) {
    OpenBuildPanel(action.buildSlot);
    return;
  }
  if (action.phaseGate) {
    if (state.buildSlots.some((slot) => !slot)) return Toast("三处机关位还没有全部完工。", "warning");
    const expectedSites = ["floodGate", "flipGate", "smokeBaffle"];
    const wrongSites = expectedSites.map((expected, index) => state.buildSlots[index] === expected ? null : buildSiteProfiles[index].name).filter(Boolean);
    if (wrongSites.length) return Toast(`机关位置不对：${wrongSites.join("、")}没有匹配实地水路、直道或烟道。总数值够也不能迎敌。`, "warning");
    if (!state.puzzle.routes.civiliansBriefed) return Toast("三组乡亲还没有分到已连通的避险支路。", "warning");
    state.completed.add(action.id);
    BeginActorAction({ id: "closeSurfaceGate" });
    StartRaid(false);
    return;
  }
  if (action.puzzleCommit && !TryPuzzleCommit(action)) return;
  ApplyAction(action);
}

function ApplyAction(action) {
  BeginActorAction(action);
  if (action.prop?.mode === "take") {
    state.player.pickup = {
      kind: action.prop.kind,
      label: action.prop.label,
      x: action.x + (action.prop.offsetX || 0),
      layer: action.layer,
      time: 1.02,
      duration: 1.02
    };
  }
  state.completed.add(action.id);
  ApplyPuzzleMutation(action);
  if (action.resource) {
    for (const [key, amount] of Object.entries(action.resource)) state.resources[key] += amount;
  }
  if (action.combatPickup) {
    if (action.combatPickup.kind === "rifle") state.combat.rifle = true;
    if (action.combatPickup.kind === "ammo") state.combat.ammo += action.combatPickup.amount;
    if (action.combatPickup.kind === "grenade") state.combat.grenades += action.combatPickup.amount;
  }
  if (action.consume) {
    for (const [key, amount] of Object.entries(action.consume)) state.resources[key] = Math.max(0, (state.resources[key] || 0) - amount);
  }
  if (action.effect === "enterTunnel") state.player.layer = "tunnel";
  if (action.rescue) state.rescues[action.rescue] = true;
  if (action.memory && !state.memories.includes(action.memory)) state.memories.push(action.memory);
  if (action.excavate) state.excavated.add(action.excavate);
  if (action.trick) {
    state.tricks.add(action.id);
    state.alert = Math.min(100, state.alert + action.alert);
    state.morale = Math.max(0, state.morale + action.morale);
  }
  if (action.panicStep) state.morale = Math.max(0, state.morale + action.morale);
  if (action.triggerSlot !== undefined) {
    state.defense.triggered += 1;
    state.defense.activeSlots.add(action.triggerSlot);
    const built = buildOptions.find((option) => option.id === state.buildSlots[action.triggerSlot]);
    state.defense.enemyUnits = Math.max(0, state.defense.enemyUnits - Math.max(1, built?.defense || 1));
    SyncFluidStructures();
  }
  if (action.hazardScout === "smoke") state.raid.smokeKnown = true;
  if (action.hazardScout === "water") state.raid.waterKnown = true;
  if (action.diversion) StartDiversion(action);
  if (action.id === "captureIntel") state.nextRaid = "东堤 · 拂晓 · 两路合围";
  if (action.dialogue) OpenDialogue(action.dialogue, action.role ? roleDefinitions[action.role].name : roleDefinitions[state.selectedRole].name);
  SyncSelectedRolePosition();
  EvaluateProgress(action);
  UpdateUi();
}

function IssueDogCommand(action) {
  if (state.dog.commandId) {
    const activeAction = state.level.actions.find((item) => item.id === state.dog.commandId);
    return Toast(`阿土还在执行“${activeAction?.dogCommand?.task || "上一道哨令"}”。`, "warning");
  }
  const command = action.dogCommand;
  BeginActorAction(action, .92);
  state.player.facing = Math.sign(command.targetX - state.player.x) || state.player.facing;
  Object.assign(state.dog, {
    commandId: action.id,
    commandMode: "travel",
    targetX: command.targetX,
    targetLayer: command.targetLayer,
    workRemaining: command.workTime,
    workDuration: command.workTime,
    progress: 0,
    whistlePulse: 1.15,
    resultTime: 0,
    lastResult: ""
  });
  Toast(`嘘——两短一长。阿土正去${command.label}。`, "success");
  UpdateUi();
}

function MoveDogTowards(targetX, delta) {
  const dog = state.dog;
  const difference = targetX - dog.x;
  dog.facing = Math.sign(difference) || dog.facing;
  const distance = Math.abs(difference);
  const speed = dog.commandId ? 4.25 : 3.45;
  dog.x += Math.sign(difference) * Math.min(distance, speed * delta);
  dog.motionBlend = Lerp(dog.motionBlend, distance > .035 ? 1 : 0, 1 - Math.pow(.001, delta));
  dog.step += delta * (distance > .035 ? 11 : 1.1);
  return distance;
}

function UpdateDogPartner(delta) {
  if (state.levelIndex !== 0 || state.mode !== "play") return;
  const dog = state.dog;
  dog.whistlePulse = Math.max(0, dog.whistlePulse - delta * .72);
  dog.resultTime = Math.max(0, dog.resultTime - delta);
  if (state.selectedRole === "dog") {
    dog.x = state.player.x;
    dog.layer = state.player.layer;
    dog.facing = state.player.facing;
    dog.step = state.player.step;
    dog.motionBlend = state.player.motionBlend;
    return;
  }

  const action = dog.commandId ? state.level.actions.find((item) => item.id === dog.commandId) : null;
  const targetX = action?.dogCommand?.targetX ?? state.player.x - state.player.facing * .85;
  const targetLayer = action?.dogCommand?.targetLayer ?? state.player.layer;
  if (dog.layer !== targetLayer) {
    const entrance = entrances.reduce((nearest, value) => Math.abs(value - dog.x) < Math.abs(nearest - dog.x) ? value : nearest, entrances[0]);
    const distance = MoveDogTowards(entrance, delta);
    if (distance < .08) dog.layer = targetLayer;
    if (action) dog.progress = Math.min(.48, dog.progress + delta * .13);
    return;
  }

  if (action && dog.commandMode === "work") {
    dog.motionBlend = Lerp(dog.motionBlend, 0, 1 - Math.pow(.001, delta));
    dog.actionKind = "crawl";
    dog.workRemaining = Math.max(0, dog.workRemaining - delta);
    dog.progress = .76 + .24 * (1 - dog.workRemaining / Math.max(.01, dog.workDuration));
    if (dog.workRemaining === 0) CompleteDogCommand(action);
    return;
  }

  const distance = MoveDogTowards(targetX, delta);
  if (action) {
    dog.progress = Math.min(.74, dog.progress + delta * (.13 + Math.min(.18, 1 / Math.max(1, distance))));
    if (distance < .08) {
      dog.commandMode = "work";
      dog.actionKind = "crawl";
      dog.progress = .76;
    }
  } else {
    dog.actionKind = distance > .5 ? "run" : null;
    if (dog.resultTime === 0) dog.progress = 0;
  }
}

function CompleteDogCommand(action) {
  state.completed.add(action.id);
  ApplyPuzzleMutation(action);
  if (action.hazardScout === "smoke") state.raid.smokeKnown = true;
  if (action.hazardScout === "water") state.raid.waterKnown = true;
  if (action.dogRelief === "smoke") state.raid.dogSmokeRelief = Math.max(state.raid.dogSmokeRelief, 16);
  state.dog.commandId = null;
  state.dog.commandMode = "follow";
  state.dog.actionKind = null;
  state.dog.progress = 1;
  state.dog.resultTime = 3.2;
  state.dog.lastResult = action.dogCommand.task;
  if (state.rolePositions?.dog) Object.assign(state.rolePositions.dog, { x: state.dog.x, layer: state.dog.layer, facing: state.dog.facing });
  if (action.dialogue) OpenDialogue(action.dialogue, "高传宝");
  EvaluateProgress(action);
  Toast(`阿土完成：${action.dogCommand.task}。`, "success");
  UpdateUi();
}

function StartDiversion(action) {
  const diversion = action.diversion;
  state.raid.distraction = {
    kind: diversion.kind,
    label: diversion.label,
    sourceX: action.x,
    targetX: diversion.targetX,
    duration: diversion.duration,
    remaining: diversion.duration,
    age: 0,
    weakens: diversion.weakens
  };
  Toast(`${diversion.label}响起，敌军开始改变搜索方向。`, "success");
}

function ActiveDiversion(kind = null) {
  const diversion = state.raid.distraction;
  return Boolean(diversion && diversion.remaining > 0 && (!kind || diversion.kind === kind));
}

function ActivePatrolLure(kind = null) {
  const lure = state.patrolLure;
  return lure && lure.remaining > 0 && (!kind || lure.kind === kind) ? lure : null;
}

function StartDogBarkLure(qaPreview = false) {
  if (state.selectedRole !== "dog" || state.player.layer !== "surface") return false;
  if (!GetEnemyPatrols().length) {
    Toast("附近没有巡逻。阿土竖着耳朵，没有乱叫。", "neutral");
    return false;
  }
  if (!qaPreview && state.dogBarkCooldown > 0) {
    Toast(`阿土还在喘，${Math.ceil(state.dogBarkCooldown)} 秒后才能再次大声诱敌。`, "warning");
    return false;
  }
  const duration = 6.8;
  state.patrolLure = {
    kind: "dogBark",
    label: "阿土吠声",
    sourceX: state.player.x,
    targetX: Math.max(worldMin + 1, Math.min(worldMax - 1, state.player.x + state.player.facing * 1.75)),
    duration,
    remaining: duration,
    age: 0
  };
  state.dogBarkCooldown = qaPreview ? 0 : 9;
  state.player.actionKind = "signal";
  state.player.actionTime = .9;
  state.player.actionDuration = .9;
  state.player.moving = false;
  state.dog.whistlePulse = 1;
  Toast("汪！敌兵会追向这声吠叫。阿土立刻反向跑，通路就在他们身后。", "success");
  UpdateUi();
  return true;
}

function UpdatePatrolLure(delta) {
  state.dogBarkCooldown = Math.max(0, state.dogBarkCooldown - delta);
  const lure = ActivePatrolLure();
  if (!lure) return;
  lure.age += delta;
  lure.remaining = Math.max(0, lure.remaining - delta);
  if (lure.remaining > 0) return;
  state.patrolLure = null;
  Toast("吠声散了，敌兵重新回到各自巡逻线。", "neutral");
  UpdateUi();
}

function FindCombatDrop() {
  if (state.levelIndex !== 3 || !state.combat) return null;
  return state.unconsciousEnemies
    .filter((enemy) => enemy.layer === state.player.layer && enemy.ammoDrop > 0 && !enemy.lootTaken)
    .map((enemy) => ({ enemy, distance: Math.abs(enemy.x - state.player.x) }))
    .filter((candidate) => candidate.distance <= 1.15)
    .sort((left, right) => left.distance - right.distance)[0]?.enemy || null;
}

function CollectCombatDrop(enemy) {
  enemy.lootTaken = true;
  state.combat.ammo += enemy.ammoDrop;
  state.combat.recoveredAmmo += enemy.ammoDrop;
  BeginActorAction({ id: "takeAmmo" }, .62);
  state.player.pickup = { kind: "ammoBox", label: `${enemy.ammoDrop} 发散弹`, x: enemy.x, layer: enemy.layer, time: .82, duration: .82 };
  Toast(`从枪套旁摸到 ${enemy.ammoDrop} 发散弹。现在共有 ${state.combat.ammo} 发。`, "success");
  UpdateUi();
}

function TriggerCombatAlarm(source) {
  if (state.levelIndex !== 3 || state.combat.alarm) return;
  state.combat.alarm = true;
  state.alert = 100;
  state.detected = true;
  Toast(source === "grenade" ? "爆炸惊动了整条屋脊！敌兵开始还击。" : source === "rifle" ? "枪声响了！敌兵开始还击。" : "你被看见了！立刻借烟囱和屋脊挡住射线。", "warning");
}

function FireRifle() {
  if (IsBlocked() || state.levelIndex !== 3) return;
  if (!["engage", "secure"].includes(state.phaseId) || state.player.layer !== "roof") return Toast("步枪只能在屋脊交火时使用。", "neutral");
  if (!state.combat.rifle) return Toast("还没有取得墙上那支步枪。", "warning");
  if (state.combat.rifleCooldown > 0) return;
  if (state.combat.ammo <= 0) return Toast("枪膛空了。贴近背后制服，或从倒地敌兵枪套旁找散弹。", "warning");
  state.combat.ammo -= 1;
  state.combat.rifleCooldown = .48;
  state.combat.muzzleFlash = .16;
  state.player.actionKind = "shoot";
  state.player.actionTime = .42;
  state.player.actionDuration = .42;
  const candidates = GetEnemyPatrols()
    .filter((enemy) => enemy.layer === state.player.layer)
    .map((enemy) => ({ enemy, forward: (enemy.x - state.player.x) * state.player.facing }))
    .filter((candidate) => candidate.forward > .35 && candidate.forward <= 8)
    .sort((left, right) => left.forward - right.forward);
  const target = candidates[0]?.enemy || null;
  state.combat.shots.push({
    fromX: state.player.x + state.player.facing * .32,
    toX: target ? target.x : state.player.x + state.player.facing * 8,
    layer: state.player.layer,
    target: target ? { ...target } : null,
    age: 0,
    duration: .22,
    resolved: false
  });
  TriggerCombatAlarm("rifle");
  UpdateUi();
}

function ThrowGrenade() {
  if (IsBlocked() || state.levelIndex !== 3) return;
  if (!["engage", "secure"].includes(state.phaseId) || state.player.layer !== "roof") return Toast("手榴弹只能朝开阔屋脊投掷，不能在民居里使用。", "warning");
  if (state.combat.grenades <= 0) return Toast("手榴弹已经用完。", "warning");
  state.combat.grenades -= 1;
  state.player.actionKind = "throw";
  state.player.actionTime = .7;
  state.player.actionDuration = .7;
  state.combat.grenadesInFlight.push({
    startX: state.player.x + state.player.facing * .25,
    targetX: Math.max(worldMin + .6, Math.min(worldMax - .6, state.player.x + state.player.facing * 4.6)),
    layer: state.player.layer,
    age: 0,
    duration: .86,
    facing: state.player.facing
  });
  TriggerCombatAlarm("grenade");
  UpdateUi();
}

function NeutralizeCombatEnemy(enemy, cause) {
  if (!enemy || state.neutralizedEnemies.has(enemy.id)) return;
  state.neutralizedEnemies.add(enemy.id);
  state.combat.neutralized += 1;
  state.unconsciousEnemies.push({
    ...enemy,
    layer: enemy.layer || "roof",
    x: enemy.x,
    facing: enemy.facing,
    disarmed: true,
    cause,
    age: 0,
    ammoDrop: enemy.index === 1 ? 1 : 0,
    lootTaken: false
  });
}

function CheckCombatSecured() {
  if (state.levelIndex !== 3 || state.phaseId !== "engage" || state.combat.neutralized < patrolRouteSets.rooftopBattle.length || state.combat.objectiveTriggered) return;
  state.combat.objectiveTriggered = true;
  state.detected = false;
  state.detection = 0;
  SetCombatPhase("secure", "屋脊安静下来", "别在这儿停。东厢屋檐下有绳梯，把后巷撤离线放下来。", "高传宝");
}

function FailCombat() {
  if (state.missionFailure) return;
  state.missionFailure = { reason: "屋脊交火中负伤", civilian: "高传宝", smokeDose: 0, waterDose: 0 };
  state.mode = "failed";
  inputKeys.left = false;
  inputKeys.right = false;
  ui.failureTitle.textContent = "屋脊撤离线没能打开";
  ui.failureQaButton.textContent = "DEBUG 跳到屋脊交火";
  ui.failureSummary.textContent = "硬顶火力会迅速负伤。重来后先利用烟囱、屋脊和矮墙断开视线；贴到背后可无声制服。";
  ui.failureLedger.innerHTML = [
    ["已处理敌兵", `${state.combat.neutralized}/4`],
    ["剩余子弹", state.combat.ammo],
    ["剩余手雷", state.combat.grenades],
    ["无声制服", state.takedownCount]
  ].map(([label, value]) => `<div><small>${label}</small><b>${value}</b></div>`).join("");
  Show(ui.missionFailure);
}

function UpdateCombat(delta) {
  if (state.levelIndex !== 3 || !state.combat) return;
  const combat = state.combat;
  combat.rifleCooldown = Math.max(0, combat.rifleCooldown - delta);
  combat.muzzleFlash = Math.max(0, combat.muzzleFlash - delta);
  combat.damageFlash = Math.max(0, combat.damageFlash - delta);
  combat.shots.forEach((shot) => {
    shot.age += delta;
    if (!shot.resolved && shot.age >= .075) {
      shot.resolved = true;
      if (shot.target) NeutralizeCombatEnemy(shot.target, "rifle");
    }
  });
  combat.shots = combat.shots.filter((shot) => shot.age < shot.duration);
  combat.grenadesInFlight.forEach((grenade) => {
    grenade.age += delta;
    if (grenade.age < grenade.duration) return;
    combat.blasts.push({ x: grenade.targetX, layer: grenade.layer, age: 0, duration: 1.35 });
    if (!combat.blastScars.some((scar) => Math.abs(scar.x - grenade.targetX) < .45)) {
      combat.blastScars.push({ x: grenade.targetX, layer: grenade.layer });
    }
    GetEnemyPatrols().filter((enemy) => enemy.layer === grenade.layer && Math.abs(enemy.x - grenade.targetX) <= 2.15).forEach((enemy) => NeutralizeCombatEnemy(enemy, "blast"));
  });
  combat.grenadesInFlight = combat.grenadesInFlight.filter((grenade) => grenade.age < grenade.duration);
  combat.blasts.forEach((blast) => { blast.age += delta; });
  combat.blasts = combat.blasts.filter((blast) => blast.age < blast.duration);
  combat.enemyShots.forEach((shot) => {
    shot.age += delta;
    if (!shot.resolved && shot.age >= shot.duration) {
      shot.resolved = true;
      if (!GetActiveCover() && state.player.layer === shot.layer) {
        combat.health = Math.max(0, combat.health - 1);
        combat.damageFlash = .38;
        state.player.actionKind = "hit";
        state.player.actionTime = .4;
        state.player.actionDuration = .4;
        Toast(`中弹负伤。还能承受 ${combat.health} 次命中；马上进掩体。`, "warning");
        if (combat.health <= 0) FailCombat();
      }
    }
  });
  combat.enemyShots = combat.enemyShots.filter((shot) => shot.age < shot.duration + .12);
  if (combat.alarm && state.phaseId === "engage" && state.player.layer === "roof" && state.mode === "play" && !(qaMode && state.qaSafePreview)) {
    combat.enemyFireCooldown -= delta;
    if (combat.enemyFireCooldown <= 0) {
      const shooter = GetEnemyPatrols().sort((left, right) => Math.abs(left.x - state.player.x) - Math.abs(right.x - state.player.x))[0];
      if (shooter && !GetActiveCover() && Math.abs(shooter.x - state.player.x) <= shooter.viewDistance + 2.2) {
        combat.enemyShots.push({ fromX: shooter.x, toX: state.player.x, layer: shooter.layer, age: 0, duration: .28, resolved: false });
        combat.enemyFireCooldown = 1.55;
      } else combat.enemyFireCooldown = .48;
    }
  }
  CheckCombatSecured();
}

function EvaluateProgress(action) {
  if (state.levelIndex === 0) {
    if (state.phaseId === "collect" && requiredCollect.every((id) => state.completed.has(id))) {
      SetPhase("build", "第一轮 · 天明", "东西齐了。先把风道通开，再安闸。人在下头，得先喘得上气。", "队长");
    }
  } else if (state.levelIndex === 1) {
    if (state.phaseId === "survey" && state.completed.has("markPatrol")) {
      SetPhase("cooperate", "十一秒暗区", "灯一转开，各走自己那一段。赵禾补外网，根生从下头支门，石头等门缝。", "叶星");
    } else if (state.phaseId === "cooperate" && state.completed.has("unbarGate")) {
      SetPhase("transfer", "隔墙接力完成", "门开了，但岔路还没摸清。担架不能侧，粮袋过不了低梁——先让阿土探路。", "赵禾");
    } else if (state.phaseId === "transfer" && requiredRescues.every((key) => state.rescues[key])) {
      SetPhase("outcome", "东翻口已接通", "伤员、粮、人……都齐了。石头，关门。", "赵禾");
    }
  } else if (state.levelIndex === 2) {
    if (state.phaseId === "recon" && ["readSurfaceTraces", "sniffEchoNetwork", "tapEmptyBranch"].every((id) => state.completed.has(id))) {
      SetPhase("compose", "三条地道线索", "西院给他们看，东后方给他们听，中口封住却把土缝留向东。先接好三路，再试局。", "林青禾");
    } else if (state.phaseId === "compose" && action.id === "testDeception" && state.puzzle.deception.solved) {
      SetPhase("execute", "矛盾成局", "第一眼引向西，第一声从东后方来。等他们队形扭开，再把前队送进空支洞。", "林青禾");
    } else if (state.phaseId === "execute" && action.id === "dropEmptyBranchGate") {
      SetPhase("outcome", "错误路线已经形成", "别追。让撤退的人把假地图带回去，咱们只收他们落下的真地图和电台。", "林青禾");
    }
  } else if (state.levelIndex === 3) {
    if (state.phaseId === "infiltrate" && action.id === "unboltCellarHatch") {
      SetCombatPhase("arm", "翻板无声抬起", "上面是西屋地窖。顺着木梯上，先找墙边枪架。", "高传宝");
    } else if (state.phaseId === "arm" && action.id === "openRoofHatch") {
      SetCombatPhase("engage", "瓦面暗口", "屋脊上四个人。能从背后按住就别开枪；真开枪，也别把四发都打空。", "高传宝");
    }
  }
  if (action.outcome) state.pendingComplete = true;
}

function SetCombatPhase(phaseId, label, text, speaker) {
  state.phaseId = phaseId;
  state.camera.targetX = state.player.x;
  PlayCinematic(label, speaker, text, 2.4, state.player.x + 1.25, 1.12);
  UpdateUi();
}

function SetPhase(phaseId, label, text, speaker) {
  state.phaseId = phaseId;
  const phase = CurrentPhase();
  if (phase.layer && phase.id !== "transfer") state.player.layer = phase.layer;
  SyncSelectedRolePosition();
  state.camera.targetX = state.player.x;
  const revealDeceptionNetwork = state.levelIndex === 2 && phaseId === "execute" && state.puzzle.deception.solved;
  PlayCinematic(label, speaker, text, revealDeceptionNetwork ? 2.8 : 2.4, revealDeceptionNetwork ? 0 : state.player.x + 1.5, revealDeceptionNetwork ? .84 : 1.1);
  UpdateUi();
}

const buildSiteProfiles = Object.freeze([
  Object.freeze({ name: "西支洞", incoming: "西井灌水", protectedSide: "右侧高位支洞", flowDirection: 1 }),
  Object.freeze({ name: "中央短湾", incoming: "西口来敌", protectedSide: "右侧回身湾", flowDirection: 1 }),
  Object.freeze({ name: "东翻口", incoming: "东口烟气", protectedSide: "左上方空支洞", flowDirection: -1 })
]);

function BuildMechanismDiagram(optionId, slotIndex) {
  const site = buildSiteProfiles[slotIndex];
  const mirrored = site.flowDirection < 0 ? ' transform="translate(240 0) scale(-1 1)"' : "";
  const directionText = site.flowDirection > 0 ? "左 → 右" : "右 → 左";
  let assembly = "";
  if (optionId === "flipGate") {
    assembly = `<g${mirrored}>
      <path class="diagramPit" d="M91 66 L91 81 L153 81 L153 66"/>
      <rect class="diagramGhost" x="93" y="57" width="58" height="8" rx="2"/>
      <g transform="rotate(-57 95 63)"><rect class="diagramWood" x="95" y="57" width="58" height="12" rx="2"/><path class="diagramPlank" d="M108 58V68M122 58V68M136 58V68"/></g>
      <circle class="diagramPivot" cx="95" cy="63" r="6"/><circle class="diagramBolt" cx="95" cy="63" r="2"/>
      <path class="diagramMotion" d="M111 61 Q127 36 151 28"/><path class="diagramArrow" d="M151 28 L143 27 L148 35 Z"/>
    </g>`;
  } else if (optionId === "floodGate") {
    assembly = `<g${mirrored}>
      <path class="diagramWater" d="M17 62 Q38 55 61 62 T103 62"/><path class="diagramWater" d="M139 70 Q166 63 190 69 T228 68"/>
      <rect class="diagramPost" x="101" y="22" width="8" height="51"/><rect class="diagramPost" x="136" y="22" width="8" height="51"/><rect class="diagramBeam" x="94" y="20" width="57" height="8"/>
      <rect class="diagramGate" x="109" y="31" width="27" height="37"/><path class="diagramPlank" d="M109 42H136M109 53H136"/>
      <circle class="diagramWheel" cx="122.5" cy="21" r="9"/><path class="diagramWheelSpoke" d="M114 21H131M122.5 12V30M116 15L129 27M129 15L116 27"/>
      <path class="diagramChannel" d="M92 69 Q122 83 154 69"/><path class="diagramMotion" d="M154 55 Q170 65 186 69"/><path class="diagramArrow" d="M187 69 L179 64 L180 73 Z"/>
    </g>`;
  } else {
    assembly = `<g${mirrored}>
      <path class="diagramDuct" d="M21 30H96L111 18H157L171 30H222"/>
      <path class="diagramWood" d="M92 34 L118 56 L111 62 L83 40 Z"/><path class="diagramWood" d="M151 34 L125 56 L132 62 L160 40 Z"/>
      <circle class="diagramPivot" cx="91" cy="36" r="4"/><circle class="diagramPivot" cx="153" cy="36" r="4"/>
      <path class="diagramRope" d="M160 38 Q177 49 181 70"/><circle class="diagramKnot" cx="181" cy="70" r="3"/>
      <path class="diagramAir" d="M18 59 C58 59 73 58 98 53 C117 49 121 34 122 19"/><path class="diagramArrowAir" d="M122 18 L116 27 L128 26 Z"/>
      <path class="diagramAir faint" d="M26 70 C64 70 83 67 109 57"/>
    </g>`;
  }
  return `<div class="buildDiagram buildDiagram_${optionId}" aria-hidden="true">
    <svg viewBox="0 0 240 90" focusable="false"><path class="diagramTunnel" d="M8 79V29Q8 11 27 11H213Q232 11 232 29V79"/>${assembly}</svg>
    <div class="diagramAxis"><span>来向 ${directionText} · ${site.incoming}</span><span>保护 ${site.protectedSide}</span></div>
  </div>`;
}

function OpenBuildPanel(slotIndex) {
  state.currentBuildSlot = slotIndex;
  const existing = state.buildSlots[slotIndex];
  const site = buildSiteProfiles[slotIndex];
  const siteDirection = site.flowDirection > 0 ? "左→右" : "右→左";
  const currentDescription = existing ? `当前为${buildOptions.find((item) => item.id === existing).name}，重建会退回原料` : "尚未施工";
  ui.buildBrief.textContent = `机关位 ${slotIndex + 1} · ${site.name}｜来向：${site.incoming}（${siteDirection}）｜保护：${site.protectedSide}｜${currentDescription}`;
  const clueReady = [state.puzzle.survey.waterKnown, state.puzzle.survey.centerKnown, state.puzzle.survey.windKnown][slotIndex];
  ui.buildFeedback.textContent = clueReady
    ? "勘探证据已齐。不要凑总数值：要让这一处机关正好匹配它的水路、直道或烟道。"
    : "这里的水路、土层或风向还没有勘探清楚；盲装可以施工，但扫荡时会产生真实后果。";
  ui.buildOptions.innerHTML = buildOptions.map((option) => {
    const isCurrent = option.id === existing;
    return `<button type="button" data-build="${option.id}" class="buildOption ${isCurrent ? "current" : ""}">
      <span class="buildOptionHeading"><b>${option.name}</b><i>${isCurrent ? "当前结构" : option.bestUse}</i></span>
      ${BuildMechanismDiagram(option.id, slotIndex)}
      <p class="buildMechanism">${option.mechanism}</p>
      <div class="buildMotion"><span>${option.motion}</span><span>适合：${option.bestUse}</span></div>
      <p class="buildTradeoff">取舍：${option.note}</p>
      <dl><div><dt>木</dt><dd>${option.cost.wood}</dd></div><div><dt>铁</dt><dd>${option.cost.iron}</dd></div><div><dt>通风</dt><dd>+${option.ventilation}</dd></div><div><dt>防御</dt><dd>+${option.defense}</dd></div></dl>
    </button>`;
  }).join("");
  ui.buildOptions.querySelectorAll("[data-build]").forEach((button) => button.addEventListener("click", () => ChooseBuild(button.dataset.build)));
  Show(ui.buildPanel);
}

function ChooseBuild(optionId) {
  const option = buildOptions.find((item) => item.id === optionId);
  const oldId = state.buildSlots[state.currentBuildSlot];
  const old = buildOptions.find((item) => item.id === oldId);
  const availableWood = state.resources.wood + (old?.cost.wood || 0);
  const availableIron = state.resources.iron + (old?.cost.iron || 0);
  if (availableWood < option.cost.wood || availableIron < option.cost.iron) {
    ui.buildFeedback.textContent = `材料不足：可用木 ${availableWood} / 铁 ${availableIron}。可以重建其他机关调整组合。`;
    return;
  }
  if (old) {
    state.resources.wood += old.cost.wood;
    state.resources.iron += old.cost.iron;
  }
  state.resources.wood -= option.cost.wood;
  state.resources.iron -= option.cost.iron;
  state.buildSlots[state.currentBuildSlot] = option.id;
  state.completed.add(["buildSlotA", "buildSlotB", "buildSlotC"][state.currentBuildSlot]);
  BeginActorAction({ id: "collectWood" }, .9);
  RecalculateBuild();
  Show(ui.buildPanel, false);
  const matchCount = state.defense.siteMatches.filter(Boolean).length;
  Toast(`${option.name}完工 · 实地匹配 ${matchCount}/3`, state.defense.siteMatches[state.currentBuildSlot] ? "success" : "warning");
  UpdateUi();
}

function RecalculateBuild() {
  state.defense.ventilation = 0;
  state.defense.strength = 0;
  for (const slot of state.buildSlots) {
    const option = buildOptions.find((item) => item.id === slot);
    state.defense.ventilation += option?.ventilation || 0;
    state.defense.strength += option?.defense || 0;
  }
  const expectedSites = ["floodGate", "flipGate", "smokeBaffle"];
  state.defense.siteMatches = expectedSites.map((expected, index) => state.buildSlots[index] === expected);
  SyncFluidStructures();
}

function SyncFluidStructures() {
  if (!state.fluid) return;
  const activeStructures = [0, 1, 2].map((slotIndex) => state.defense.activeSlots.has(slotIndex));
  state.fluid.SetStructures(state.buildSlots, activeStructures, state.defense.ventilation);
}

function StartRaid(automatic) {
  if (state.levelIndex !== 0 || state.raid.active || state.phaseId === "outcome") return;
  state.prepRemaining = 0;
  state.raid.active = true;
  state.raid.elapsed = 0;
  state.raid.stage = "敌兵入村";
  state.raid.announcedStage = "敌兵入村";
  state.player.x = Math.min(9.2, Math.max(-9.5, state.player.x));
  SyncFluidStructures();
  SetPhase("defense", automatic ? "准备时间到 · 扫荡入村" : "提前迎敌 · 扫荡入村",
    automatic
      ? "火把已经进村。没做完的来不及了，先把乡亲从烟水来路上调开。"
      : "火把进村了。传宝盯地表，根生守机关，阿土听烟水。乡亲一个也不能少。",
    "高传宝");
}

function RaidStageAt(elapsed) {
  if (elapsed < 8) return "敌兵入村";
  if (elapsed < 28) return "东口灌烟";
  if (elapsed < 50) return "西井灌水";
  if (elapsed < 66) return "两头掘口";
  return "扫荡撤退";
}

function UpdateLevelOneSystems(delta) {
  if (state.levelIndex !== 0 || !state.fluid || state.mode !== "play") return;
  SyncFluidStructures();
  state.raid.dogSmokeRelief = Math.max(0, state.raid.dogSmokeRelief - delta);
  if (state.raid.distraction) {
    state.raid.distraction.age += delta;
    state.raid.distraction.remaining = Math.max(0, state.raid.distraction.remaining - delta);
    if (state.raid.distraction.remaining === 0) {
      Toast(`${state.raid.distraction.label}的回声散了，敌兵重新分开搜索。`, "neutral");
      state.raid.distraction = null;
    }
  }
  if (["collect", "build"].includes(state.phaseId)) {
    state.prepRemaining = Math.max(0, state.prepRemaining - delta);
    if (state.phaseId === "build" && state.defense.ventilation > 0) {
      state.fluid.Inject("tracer", -5.55, -.18, delta * .82, .24, 2.2, -.12);
    }
    if (state.prepRemaining <= 0) StartRaid(true);
  }

  if (state.raid.active && state.phaseId === "defense") {
    state.raid.elapsed += delta;
    const nextStage = RaidStageAt(state.raid.elapsed);
    state.raid.stage = nextStage;
    if (nextStage !== state.raid.announcedStage) {
      state.raid.announcedStage = nextStage;
      const warning = {
        "东口灌烟": "东翻口开始灌烟——看烟流，不要把人留在东支洞。",
        "西井灌水": "西井传来水声——把低处的人调开，根生去守水闸。",
        "两头掘口": "两头都在掘口——机关要逐个闭合，群众继续向安全支洞移动。",
        "扫荡撤退": "外头的脚步散了。再撑住几秒，先别开口。"
      }[nextStage];
      if (warning) Toast(warning, nextStage === "扫荡撤退" ? "success" : "warning");
    }

    const elapsed = state.raid.elapsed;
    const hasEastBaffle = state.buildSlots[2] === "smokeBaffle";
    const hasWestFloodGate = state.buildSlots[0] === "floodGate";
    if (elapsed >= 8 && elapsed < 58) {
      const bellDiversion = ActiveDiversion("bell") && state.raid.distraction.weakens === "smoke" ? .34 : 1;
      const dogRelief = state.raid.dogSmokeRelief > 0 ? .32 : 1;
      const sourceStrength = (hasEastBaffle && state.defense.activeSlots.has(2) ? .54 : 1) * bellDiversion * dogRelief;
      state.fluid.Inject("smoke", 9.35, -.05, delta * 1.92 * sourceStrength, .42, -4.9, -.75);
    }
    if (elapsed >= 25 && elapsed < 66) {
      const crackerDiversion = ActiveDiversion("crackers") && state.raid.distraction.weakens === "water" ? .36 : 1;
      const sourceStrength = (hasWestFloodGate && state.defense.activeSlots.has(0) ? .5 : 1) * crackerDiversion;
      state.fluid.Inject("water", -9.45, .52, delta * 1.7 * sourceStrength, .36, 4.2, 2.1);
    }
    if (elapsed >= 45 && elapsed < 64) {
      state.fluid.Inject("smoke", -9.4, .02, delta * .72, .34, 3.4, -.42);
    }
  }

  state.fluidAccumulator = Math.min(.08, state.fluidAccumulator + delta);
  let fluidSteps = 0;
  while (state.fluidAccumulator >= 1 / 60 && fluidSteps < 4) {
    state.fluid.Step(1 / 60);
    state.fluidAccumulator -= 1 / 60;
    fluidSteps += 1;
  }
  UpdateCivilians(delta);

  if (state.raid.active && state.phaseId === "defense" && state.raid.elapsed >= state.raid.duration && !state.missionFailure) {
    state.raid.active = false;
    Show(ui.civilianCommandPanel, false);
    SetPhase("outcome", "扫荡队撤离", "先别开口。挨个点名，听见自己名字就应一声。", "高传宝");
  }
}

function UpdateCivilians(delta) {
  for (const civilian of state.civilians) {
    const difference = civilian.targetX - civilian.x;
    if (Math.abs(difference) > .02) civilian.x += Math.sign(difference) * Math.min(Math.abs(difference), civilian.pace * delta);
    if (state.phaseId !== "defense") continue;
    const headSample = state.fluid.Sample(civilian.x, -.17);
    const bodySample = state.fluid.Sample(civilian.x, .57);
    const smokeExposure = Math.max(headSample.smoke, bodySample.smoke * .72);
    const waterExposure = Math.max(bodySample.water, state.fluid.Sample(civilian.x, .78).water);
    civilian.smokeDose = Math.max(0, civilian.smokeDose + Math.max(0, smokeExposure - .055) * delta * 12 - delta * .18);
    civilian.waterDose = Math.max(0, civilian.waterDose + Math.max(0, waterExposure - .12) * delta * 8 - delta * .08);
    if (civilian.smokeDose >= 100) return FailMission("烟雾吸入超过安全阈值", civilian);
    if (civilian.waterDose >= 100) return FailMission("积水浸泡与失温超过安全阈值", civilian);
  }
}

function CivilianGroupDefinition(groupId) {
  return {
    elders: { label: "老人组", offset: -.28 },
    stretcher: { label: "担架组", offset: 0 },
    children: { label: "孩子组", offset: .28 }
  }[groupId];
}

function CommandCivilianGroup(shelterId) {
  if (state.levelIndex !== 0 || state.phaseId !== "defense" || state.mode !== "play") return;
  if (state.selectedRole !== "leader") return Toast("调动乡亲要由传宝下令。按 Q 切回传宝。", "warning");
  const shelter = {
    west: { x: -8.35, label: "西支洞", excavation: "west" },
    center: { x: .05, label: "中央避难湾", excavation: "center" },
    east: { x: 7.1, label: "东翻口", excavation: "east" }
  }[shelterId];
  if (!shelter) return;
  if (!state.excavated.has(shelter.excavation)) return Toast(`${shelter.label}还没挖通，乡亲过不去。`, "warning");
  const group = CivilianGroupDefinition(state.selectedCivilianGroup);
  const members = state.civilians.filter((civilian) => civilian.group === state.selectedCivilianGroup);
  members.forEach((civilian, index) => {
    civilian.targetX = shelter.x + (index - (members.length - 1) / 2) * .72 + group.offset;
  });
  Toast(`${group.label}转移到${shelter.label}。他们会真实穿过地道，不会瞬移。`, "success");
  RenderCivilianCommands();
}

function RenderCivilianCommands() {
  if (!ui.civilianCommandPanel) return;
  const visible = state.levelIndex === 0 && state.phaseId === "defense" && state.mode === "play";
  ui.roleDock?.classList.toggle("defenseDock", visible);
  Show(ui.civilianCommandPanel, visible);
  if (!visible) return;
  ui.civilianGroupButtons.querySelectorAll("[data-civilian-group]").forEach((button) => {
    button.classList.toggle("active", button.dataset.civilianGroup === state.selectedCivilianGroup);
  });
  ui.civilianCommandPanel.classList.toggle("commandLocked", state.selectedRole !== "leader");
  const highestSmoke = Math.max(0, ...state.civilians.map((civilian) => civilian.smokeDose));
  const highestWater = Math.max(0, ...state.civilians.map((civilian) => civilian.waterDose));
  ui.civilianStatus.textContent = `${state.civilians.length} 人在地道 · 烟剂量 ${Math.round(highestSmoke)}% · 水剂量 ${Math.round(highestWater)}%`;
}

function RenderDogCommandHud() {
  if (!ui.dogCommandHud) return;
  const lure = ActivePatrolLure("dogBark");
  const visible = state.level.roleIds.includes("dog") && state.mode === "play" && !lure;
  Show(ui.dogCommandHud, visible);
  if (!visible) return;
  const action = state.dog.commandId ? state.level.actions.find((item) => item.id === state.dog.commandId) : null;
  let status = "跟随传宝，等待哨令";
  if (lure) status = `吠声诱敌 · ${GetEnemyPatrols().length} 名敌兵追向原地 · 剩 ${Math.ceil(lure.remaining)} 秒`;
  else if (state.selectedRole === "dog" && state.player.layer === "surface" && state.dogBarkCooldown > 0) status = `吠叫冷却 ${Math.ceil(state.dogBarkCooldown)} 秒 · 利用刚拉开的空档`;
  else if (state.selectedRole === "dog" && state.player.layer === "surface") status = "行动键：原地吠叫诱敌，然后立刻反向穿越";
  else if (state.selectedRole === "dog") status = "玩家正在直接控制阿土";
  else if (action && state.dog.commandMode === "travel") status = `奔向${action.dogCommand.label}`;
  else if (action) status = `正在${action.dogCommand.task}`;
  else if (state.dog.resultTime > 0) status = `已完成：${state.dog.lastResult}`;
  ui.dogCommandStatus.textContent = status;
  ui.dogCommandHud.classList.toggle("commanding", Boolean(action || lure));
  const progressFill = ui.dogCommandProgress?.querySelector("u");
  if (progressFill) {
    const progress = lure ? lure.remaining / lure.duration : action ? state.dog.progress : state.dogBarkCooldown > 0 ? 1 - state.dogBarkCooldown / 9 : 0;
    progressFill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  }
}

function FailMission(reason, civilian) {
  if (state.missionFailure) return;
  state.missionFailure = { reason, civilian: civilian.name, smokeDose: civilian.smokeDose, waterDose: civilian.waterDose };
  state.mode = "failed";
  inputKeys.left = false; inputKeys.right = false;
  Show(ui.dogCommandHud, false);
  ui.failureTitle.textContent = "乡亲没能全部撤离";
  ui.failureSummary.textContent = `${civilian.name}：${reason}。烟水模拟继续由实际地道结构与机关状态决定，请重排风路和躲避方向。`;
  ui.failureLedger.innerHTML = [
    ["烟雾剂量", `${Math.round(civilian.smokeDose)}%`],
    ["积水剂量", `${Math.round(civilian.waterDose)}%`],
    ["扫荡进度", `${Math.round(state.raid.elapsed)} / ${state.raid.duration} 秒`],
    ["已触发机关", `${state.defense.triggered} / 3`]
  ].map(([label, value]) => `<div><small>${label}</small><b>${value}</b></div>`).join("");
  Show(ui.civilianCommandPanel, false);
  Show(ui.missionFailure);
}

function ChangeLayer(targetLayer) {
  if (IsBlocked()) return;
  if (state.levelIndex === 3) {
    const movingUp = targetLayer === "surface";
    const link = combatDepthLinks.find((candidate) => {
      const correctLayer = movingUp ? candidate.lower === state.player.layer : candidate.upper === state.player.layer;
      return correctLayer && Math.abs(candidate.x - state.player.x) <= 1.15;
    });
    if (!link) {
      const directionText = movingUp ? "靠近翻板或暗梯后按 W 向上。" : "靠近屋顶暗口或地窖翻板后按 S 向下。";
      return Toast(directionText, "neutral");
    }
    if (!state.completed.has(link.requires)) return Toast(`${link.name}还没有打开。靠近机关按 E 处理。`, "warning");
    state.player.x = link.x;
    state.player.layer = movingUp ? link.upper : link.lower;
    state.player.actionKind = "climb";
    state.player.actionTime = .82;
    state.player.actionDuration = .82;
    state.camera.x = link.x;
    state.camera.targetX = link.x;
    state.detected = false;
    state.detection = 0;
    Toast(movingUp ? `沿${link.name}向上。三层位置彼此对应。` : `沿${link.name}向下。出口就在同一条竖线上。`, "neutral");
    UpdateUi();
    return;
  }
  if (!['surface', 'tunnel'].includes(targetLayer)) return;
  if (state.player.layer === targetLayer) {
    Toast(targetLayer === "surface" ? "已经在地表；向下进入地道请按 S。" : "已经在地道；向上回到地表请按 W。", "neutral");
    return;
  }
  const entrance = entrances.find((x) => Math.abs(x - state.player.x) <= 1.15);
  if (entrance === undefined) return Toast(targetLayer === "surface" ? "靠近蓝色竖井后按 W 向上攀爬。" : "靠近蓝色入口后按 S 向下进入。", "neutral");
  state.player.x = entrance;
  state.player.layer = targetLayer;
  state.player.actionKind = "climb";
  state.player.actionTime = .68;
  state.player.actionDuration = .68;
  SyncSelectedRolePosition();
  if (state.player.layer === "tunnel") state.alert = Math.max(0, state.alert - 8);
  Toast(state.player.layer === "tunnel" ? "进入地道：敌兵视线被土层完全隔断。" : "回到地表：先找草垛、断墙或灌木，再等巡逻转身。", "neutral");
  UpdateUi();
}

function UseContextDepth() {
  if (state.levelIndex === 3) {
    if (state.player.layer === "tunnel") return ChangeLayer("surface");
    if (state.player.layer === "roof") return ChangeLayer("tunnel");
    const cellarDistance = Math.abs(state.player.x - combatDepthLinks[0].x);
    const roofDistance = Math.abs(state.player.x - combatDepthLinks[1].x);
    return ChangeLayer(roofDistance < cellarDistance ? "surface" : "tunnel");
  }
  ChangeLayer(state.player.layer === "surface" ? "tunnel" : "surface");
}

function OpenDialogue(text, speaker) {
  ui.dialogueSpeaker.textContent = speaker;
  ui.dialogueText.textContent = text;
  Show(ui.dialoguePanel);
}

function CloseDialogue() {
  Show(ui.dialoguePanel, false);
  if (state.pendingComplete) {
    state.pendingComplete = false;
    CompleteLevel();
  }
}

function CompleteLevel() {
  state.mode = "complete";
  Show(ui.dogCommandHud, false);
  const title = ["村庄开始像一张会呼吸的网", "没有一个名字被留在封锁线内", "敌人的地图变成下一轮准备时间", "屋脊上的火力只为打开群众撤离的路"][state.levelIndex];
  ui.completeTitle.textContent = `${state.level.title} · 循环闭合`;
  ui.completeSummary.textContent = title;
  const ledgers = state.levelIndex === 0
    ? [["通风", state.defense.ventilation], ["阿土哨令", ["whistleDraftGap", "whistleSmokeLatch"].filter((id) => state.completed.has(id)).length + "/2"], ["地表调敌", ["ringAlarmBell", "throwFirecrackers"].filter((id) => state.completed.has(id)).length + "/2"], ["已触发机关", `${state.defense.triggered}/3`], ["最高烟剂量", `${Math.round(Math.max(0, ...state.civilians.map((civilian) => civilian.smokeDose)))}%`], ["最高水剂量", `${Math.round(Math.max(0, ...state.civilians.map((civilian) => civilian.waterDose)))}%`]]
    : state.levelIndex === 1
      ? [["转移", "伤员 / 粮食 / 联络员"], ["记忆", state.memories.length ? state.memories.join("、") : "未停留搜寻"], ["原则", "遗物可选，生命优先"], ["新节点", "东翻口"]]
      : state.levelIndex === 2
        ? [["使用诡计", `${state.tricks.size} 种`], ["敌方士气", state.morale], ["群众伤亡", 0], ["下次扫荡", state.nextRaid || "待译码"]]
        : [["屋脊敌兵", `${state.combat.neutralized}/4`], ["剩余子弹", state.combat.ammo], ["剩余手雷", state.combat.grenades], ["无声制服", state.takedownCount]];
  ui.completeLedger.innerHTML = ledgers.map(([key, value]) => `<div><small>${key}</small><b>${value}</b></div>`).join("");
  ui.nextLevelButton.textContent = state.levelIndex < levelDefinitions.length - 1 ? "进入下一关" : "回到第一关";
  Show(ui.levelComplete);
}

function PlayCinematic(label, speaker, text, duration = 2.4, targetX = state.player.x, zoom = 1.1) {
  state.cinematic = { label, speaker, text, duration, time: 0, fromX: state.camera.x, targetX, fromZoom: state.camera.zoom, zoom };
  ui.cinematicLabel.textContent = label;
  ui.cinematicSpeaker.textContent = speaker;
  ui.cinematicText.textContent = text;
  ui.cinematicProgress.style.transform = "scaleX(0)";
  Show(ui.cinematicBars);
  Show(ui.cinematicCaption);
  Show(ui.skipCinematic);
}

function EndCinematic() {
  if (!state.cinematic) return;
  state.camera.targetX = state.player.x;
  state.camera.targetZoom = 1;
  state.cinematic = null;
  Show(ui.cinematicBars, false);
  Show(ui.cinematicCaption, false);
  Show(ui.skipCinematic, false);
}

function IsBlocked() {
  return state.mode !== "play" || state.cinematic || state.caught || state.takedown || !ui.dialoguePanel.hidden || !ui.buildPanel.hidden || !ui.levelPanel.hidden || !ui.guidePanel.hidden;
}

function Toast(message, tone = "neutral") {
  ui.toast.textContent = message;
  ui.toast.dataset.tone = tone;
  Show(ui.toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => Show(ui.toast, false), 2600);
}

function UpdateUi() {
  if (state.mode === "title") return;
  const phase = CurrentPhase();
  const selectedRole = roleDefinitions[state.selectedRole];
  const selectedProfile = actorProfiles[state.selectedRole];
  ui.phaseLabel.textContent = phase.label;
  ui.hudRoleGlyph.textContent = selectedProfile.mark;
  ui.hudRoleGlyph.style.setProperty("--hud-role", selectedProfile.body);
  ui.hudRoleGlyph.style.setProperty("--hud-accent", selectedProfile.accent);
  ui.hudRoleName.textContent = selectedRole.name;
  ui.hudRoleSkill.textContent = selectedRole.skill;
  ui.objectiveText.textContent = phase.objective;
  ui.objectiveHint.textContent = ContextHint();
  ui.phaseStrip.innerHTML = state.level.phases.map((item, index) => `<span class="${item.id === state.phaseId ? "active" : index < PhaseIndex() ? "done" : ""}"><i>${index + 1}</i>${item.label}</span>`).join("");
  ui.metricsPanel.innerHTML = MetricsMarkup();
  const takedownTarget = FindTakedownTarget();
  const focusedEnemy = FindFocusedEnemy();
  const action = FindNearestAction();
  Show(ui.interactionPrompt, Boolean(action) && !takedownTarget && !focusedEnemy && !state.qaPatrolReview && !ActivePatrolLure("dogBark") && !IsBlocked());
  if (action) {
    ui.interactionVerb.textContent = action.verb;
    ui.interactionName.textContent = action.prop?.label || action.title;
  }
  ui.gameShell.dataset.layer = state.player.layer;
  ui.gameShell.dataset.level = state.level.id;
  ui.gameShell.classList.toggle("takedownCinematic", Boolean(state.takedown || state.takedownGrace > 0));
  ui.touchControls.classList.toggle("locked", Boolean(state.caught || state.takedown));
  ui.touchControls.classList.toggle("cinematic", Boolean(state.takedown));
  const depthButton = document.querySelector('[data-input="depth"] span');
  if (depthButton) {
    if (state.levelIndex !== 3) depthButton.textContent = state.player.layer === "surface" ? "↓ 下行" : "↑ 上行";
    else if (state.player.layer === "tunnel") depthButton.textContent = "入室";
    else if (state.player.layer === "roof") depthButton.textContent = "下屋";
    else depthButton.textContent = Math.abs(state.player.x - combatDepthLinks[1].x) < Math.abs(state.player.x - combatDepthLinks[0].x) ? "上房" : "下地道";
  }
  RenderCivilianCommands();
  RenderDogCommandHud();
  UpdateQaReadout();
}

function RenderQaPanel() {
  if (!qaMode) return;
  if (state.mode === "title") { Show(ui.qaPanel, false); return; }
  Show(ui.qaPanel);
  ui.qaLevelButtons.innerHTML = levelDefinitions.map((level, index) => `<button type="button" data-qa-level="${index}" class="${index === state.levelIndex ? "active" : ""}">${level.number} ${level.title}</button>`).join("");
  ui.qaPhaseButtons.innerHTML = state.level.phases.map((phase) => `<button type="button" data-qa-phase="${phase.id}" class="${phase.id === state.phaseId ? "active" : ""}">${phase.label}</button>`).join("");
  const levelOneQa = '<button type="button" data-qa-hazard="dogBark">诱敌：阿土吠叫</button><button type="button" data-qa-hazard="patrolWindow">巡逻：通行窗口</button><button type="button" data-qa-hazard="dog">解谜：阿土拉烟闸</button><button type="button" data-qa-hazard="bell">地表：敲警钟</button><button type="button" data-qa-hazard="crackers">地表：扔炮仗</button><button type="button" data-qa-hazard="enemies">镜头：日伪军巡逻</button><button type="button" data-qa-hazard="buildPanel">面板：东翻口选型</button><button type="button" data-qa-hazard="structuresIdle">镜头：三机关待机</button><button type="button" data-qa-hazard="structures">镜头：三机关工作</button><button type="button" data-qa-hazard="smoke">镜头：东口烟流</button><button type="button" data-qa-hazard="water">镜头：西井水流</button><button type="button" data-qa-hazard="safe">系统：三闸触发</button><button type="button" data-qa-hazard="clean">截图：隐藏调试</button>';
  const levelTwoQa = '<button type="button" data-qa-hazard="dogBark">诱敌：阿土吠叫</button><button type="button" data-qa-hazard="patrolWindow">巡逻：通行窗口</button><button type="button" data-qa-hazard="transferWrong">谜题：错误分路</button><button type="button" data-qa-hazard="transferSolved">谜题：正确分路</button><button type="button" data-qa-hazard="clean">截图：隐藏调试</button>';
  const levelThreeQa = '<button type="button" data-qa-hazard="patrolWindow">巡逻：通行窗口</button><button type="button" data-qa-hazard="deceptionWrong">谜题：顺向假情报</button><button type="button" data-qa-hazard="deceptionSolved">谜题：三重矛盾</button><button type="button" data-qa-hazard="enemyHud">HUD：伪军身份</button><button type="button" data-qa-hazard="enemyHudJapanese">HUD：日军身份</button><button type="button" data-qa-hazard="takedownReady">交互：靠近日军可制服</button><button type="button" data-qa-hazard="takedownReadyCollaborator">交互：靠近伪军可制服</button><button type="button" data-qa-hazard="takedownNext">交互：下一个敌人</button><button type="button" data-qa-hazard="takedown">演出：背后制服</button><button type="button" data-qa-hazard="clean">截图：隐藏调试</button>';
  const levelFourQa = '<button type="button" data-qa-hazard="combatLayers">镜头：地道入室上房</button><button type="button" data-qa-hazard="combatPickups">镜头：枪弹手雷实物</button><button type="button" data-qa-hazard="combatRoof">镜头：屋脊敌阵</button><button type="button" data-qa-hazard="combatFire">演出：有限开枪</button><button type="button" data-qa-hazard="combatGrenade">演出：手雷抛物线</button><button type="button" data-qa-hazard="combatTakedown">演出：屋顶无声制服</button><button type="button" data-qa-hazard="clean">截图：隐藏调试</button>';
  ui.qaHazardButtons.innerHTML = state.levelIndex === 0 ? levelOneQa : state.levelIndex === 1 ? levelTwoQa : state.levelIndex === 2 ? levelThreeQa : levelFourQa;
  ui.qaLevelButtons.querySelectorAll("[data-qa-level]").forEach((button) => button.addEventListener("click", () => {
    StartLevel(Number(button.dataset.qaLevel));
    EndCinematic();
    ui.qaPanel.open = true;
    RenderQaPanel();
  }));
  ui.qaPhaseButtons.querySelectorAll("[data-qa-phase]").forEach((button) => button.addEventListener("click", () => QaJumpToPhase(button.dataset.qaPhase)));
  ui.qaHazardButtons.querySelectorAll("[data-qa-hazard]").forEach((button) => button.addEventListener("click", () => QaInspectHazard(button.dataset.qaHazard)));
  UpdateQaReadout();
}

function UpdateQaReadout() {
  if (!qaMode || !ui.qaStateReadout) return;
  const fluid = state.fluid?.GetStatistics();
  const lure = ActivePatrolLure("dogBark");
  const combatReadout = state.levelIndex === 3 ? ` · 枪${state.combat.rifle ? "有" : "无"} 弹${state.combat.ammo} 雷${state.combat.grenades} 命${state.combat.health} 警${state.combat.alarm ? 1 : 0}` : "";
  ui.qaStateReadout.textContent = `${state.level.id} / ${state.phaseId} · x ${state.player.x.toFixed(1)} · ${state.player.layer} · ${roleDefinitions[state.selectedRole].short} · 敌${GetEnemyPatrols().length} · ${lure ? `追声${lure.remaining.toFixed(1)}秒` : `吠叫冷却${state.dogBarkCooldown.toFixed(1)}`} · 制服${state.takedownCount} · 犬${state.dog?.commandMode || "—"}${fluid ? ` · 烟${Math.round(fluid.smokeMass)} 水${Math.round(fluid.waterMass)}` : ""}${combatReadout}`;
}

function QaComplete(ids) {
  ids.forEach((id) => state.completed.add(id));
}

function QaJumpToPhase(phaseId) {
  if (!qaMode) return;
  const phaseIndex = state.level.phases.findIndex((phase) => phase.id === phaseId);
  if (phaseIndex < 0) return;
  const levelIndex = state.levelIndex;
  state = CreateState(levelIndex);
  state.mode = "play";
  state.phaseId = phaseId;
  state.cinematic = null;
  if (levelIndex === 0) {
    if (phaseIndex >= 1) {
      QaComplete(requiredCollect);
      Object.assign(state.resources, { wood: 6, iron: 4, powder: 2, medicine: 1, grain: 2 });
      state.player.x = -7;
    }
    if (phaseIndex >= 2) {
      state.buildSlots = ["floodGate", "flipGate", "smokeBaffle"];
      state.excavated = new Set(["west", "center", "east"]);
      state.resources.wood = 1; state.resources.iron = 1;
      Object.assign(state.puzzle.survey, { waterKnown: true, windKnown: true, centerKnown: true });
      Object.assign(state.puzzle.links, { west: true, center: true, east: true });
      state.puzzle.routes.civiliansBriefed = true;
      QaComplete(["inspectWestSeep", "whistleDraftGap", "probeCenterSoil", "briefCivilians", "digWestRefuge", "digCenterBypass", "digEastPocket", "buildSlotA", "buildSlotB", "buildSlotC", "startDefense"]);
      RecalculateBuild();
      state.prepRemaining = 0; state.raid.active = true; state.raid.elapsed = 10; state.raid.stage = "东口灌烟"; state.raid.announcedStage = "东口灌烟";
      state.selectedRole = "leader";
      state.player.x = -8.7;
    }
    if (phaseIndex >= 3) {
      QaComplete(["placeDecoyCart", "ringAlarmBell", "throwFirecrackers", "closeSurfaceGate", "whistleSmokeLatch", "triggerSlotA", "triggerSlotB", "triggerSlotC"]);
      state.defense.triggered = 3; state.defense.enemyUnits = 0; state.defense.activeSlots = new Set([0, 1, 2]);
      state.raid.active = false; state.raid.elapsed = state.raid.duration;
      SyncFluidStructures();
      state.player.x = 9.2;
    }
  } else if (levelIndex === 1) {
    if (phaseIndex >= 1) {
      QaComplete(["sniffRoute", "markPatrol"]); Object.assign(state.puzzle.transfer, { dogRouteKnown: true, patrolWindowKnown: true });
      state.selectedRole = "rescuer"; state.player.x = -3.4;
    }
    if (phaseIndex >= 2) {
      QaComplete(["repairCamo", "braceHatchBelow", "liftHatch", "crawlGap", "unbarGate"]);
      Object.assign(state.puzzle.transfer, { camoReady: true, hatchBraced: true, hatchOpen: true, childInside: true, innerGateOpen: true });
      state.selectedRole = "dog"; state.player.x = -8.35; state.player.layer = "tunnel";
    }
    if (phaseIndex >= 3) {
      QaComplete(["inspectForkClearance", "shoreWideBranch", "openLowDrain", "markWoundedWide", "markGrainLow", "moveWounded", "moveGrain", "traceCourierKnock", "freeCourier"]);
      Object.assign(state.puzzle.transfer, { forkKnown: true, wideSupported: true, lowDrainOpen: true, woundedRoute: "wide", grainRoute: "low", courierBearingKnown: true });
      Object.assign(state.rescues, { wounded: true, grain: true, courier: true });
      state.selectedRole = "child"; state.player.x = 10;
    }
  } else if (levelIndex === 2) {
    if (phaseIndex >= 1) {
      QaComplete(["readSurfaceTraces", "sniffEchoNetwork", "tapEmptyBranch"]);
      Object.assign(state.puzzle.deception, { approachKnown: true, echoKnown: true, emptyBranchKnown: true });
      state.selectedRole = "scout"; state.player.x = -1.75; state.player.layer = "tunnel";
    }
    if (phaseIndex >= 2) {
      QaComplete(["chooseDecoyWest", "routeHornEastRear", "sealCenterFalseEntrance", "testDeception"]);
      Object.assign(state.puzzle.deception, { visibleDecoy: "west", acousticRoute: "eastRear", falseEntrance: "centerSealed", solved: true, contradictions: 3, enemyBelief: "西院有痕 · 东后方有人 · 中口封土通东" });
      state.player.x = -9; state.player.layer = "surface";
    }
    if (phaseIndex >= 3) {
      QaComplete(["springWestDecoy", "pulseEastHorn", "dropEmptyBranchGate"]);
      state.tricks = new Set(["springWestDecoy", "pulseEastHorn"]); state.morale = 42;
      state.puzzle.deception.enemyBelief = "eastEmptyBranch"; state.player.x = 8.8; state.player.layer = "tunnel";
    }
  } else if (levelIndex === 3) {
    if (phaseIndex >= 1) {
      QaComplete(["unboltCellarHatch"]);
      state.player.x = -5.7;
    }
    if (phaseIndex >= 2) {
      QaComplete(["takeRifle", "takeAmmo", "takeGrenade", "openRoofHatch"]);
      Object.assign(state.combat, { rifle: true, ammo: 4, grenades: 1 });
      state.player.x = .75;
    }
    if (phaseIndex >= 3) {
      patrolRouteSets.rooftopBattle.forEach((route, index) => state.neutralizedEnemies.add(`3:roof:${index}`));
      state.combat.neutralized = 4;
      state.combat.objectiveTriggered = true;
      state.player.x = 9.25;
    }
  }
  const phase = CurrentPhase();
  state.player.layer = phase.layer;
  SyncSelectedRolePosition();
  state.camera.x = state.player.x; state.camera.targetX = state.player.x;
  state.camera.zoom = 1; state.camera.targetZoom = 1;
  Show(ui.titleScreen, false); Show(ui.levelPanel, false); Show(ui.levelComplete, false); Show(ui.missionFailure, false); Show(ui.dialoguePanel, false); Show(ui.buildPanel, false);
  Show(ui.cinematicBars, false); Show(ui.cinematicCaption, false); Show(ui.skipCinematic, false);
  Show(ui.gameHeader); Show(ui.objectiveCard); Show(ui.metricsPanel); Show(ui.roleDock, state.level.roleIds.length > 1);
  ui.levelNumber.textContent = state.level.number; ui.levelName.textContent = state.level.title;
  RenderRoleDock(); RenderQaPanel(); UpdateUi();
  ui.qaPanel.open = true;
  Toast(`DEBUG：已跳到 ${phase.label}，前置状态已补齐。`, "success");
}

function ContextHint() {
  const takedownTarget = FindTakedownTarget();
  if (takedownTarget) {
    const identity = EnemyIdentity(takedownTarget);
    return `E · 制服${identity.faction}${identity.role}｜非致命`;
  }
  const action = FindNearestAction();
  const combatDrop = FindCombatDrop();
  if (combatDrop) return `E · 拾取倒地敌兵旁的 ${combatDrop.ammoDrop} 发散弹`;
  if (state.levelIndex === 3 && ["engage", "secure"].includes(state.phaseId)) {
    if (action) return `E · ${action.verb}${action.prop?.label || action.title}`;
    return `F 开枪（${state.combat.ammo}） · G 手雷（${state.combat.grenades}） · E 背后无声制服`;
  }
  const patrolLure = ActivePatrolLure("dogBark");
  if (patrolLure) return `犬吠诱敌 · ${GetEnemyPatrols().length} 名追声中 · ${Math.ceil(patrolLure.remaining)} 秒｜立刻反向穿过`;
  if (state.selectedRole === "dog" && state.player.layer === "surface" && action?.role !== "dog") {
    return state.dogBarkCooldown > 0 ? `吠叫冷却 ${Math.ceil(state.dogBarkCooldown)} 秒｜先利用现有空档` : "E · 原地吠叫诱敌｜敌兵追声后立刻反向跑";
  }
  const focusedEnemy = FindFocusedEnemy();
  if (focusedEnemy) {
    const identity = EnemyIdentity(focusedEnemy);
    const interaction = EnemyInteractionState(focusedEnemy);
    return `${identity.faction}${identity.role} · ${interaction.status}｜${interaction.instruction}`;
  }
  if (state.dog?.commandId) {
    const dogAction = state.level.actions.find((item) => item.id === state.dog.commandId);
    return `阿土：${state.dog.commandMode === "travel" ? `正去${dogAction?.dogCommand?.label}` : dogAction?.dogCommand?.task}`;
  }
  if (action?.role && action.role !== state.selectedRole) return `需要：${roleDefinitions[action.role].name}`;
  if (action?.cover && GetActiveCover()?.id !== action.cover) {
    const cover = GetSurfaceCovers().find((item) => item.id === action.cover);
    return `先藏到${cover?.label || "场景遮挡"}后`;
  }
  if (state.levelIndex === 0 && ["collect", "build"].includes(state.phaseId)) return `距扫荡 ${Math.ceil(state.prepRemaining)} 秒 · 勘探 ${Object.values(state.puzzle.survey).filter(Boolean).length}/3 · 机关位置 ${state.defense.siteMatches.filter(Boolean).length}/3`;
  if (state.levelIndex === 0 && state.phaseId === "defense") {
    const distraction = state.raid.distraction ? ` · ${state.raid.distraction.label} ${Math.ceil(state.raid.distraction.remaining)}秒` : "";
    return `${state.raid.stage}${distraction} · 地表调敌，地下封闸`;
  }
  if (state.levelIndex === 1 && state.phaseId === "transfer") return `担架 ${state.puzzle.transfer.woundedRoute || "未定"} · 粮 ${state.puzzle.transfer.grainRoute || "未定"} · 每个角色停留在自己的位置`;
  if (state.levelIndex === 2 && state.phaseId === "compose") return `痕迹 ${state.puzzle.deception.visibleDecoy || "未定"} · 声路 ${state.puzzle.deception.acousticRoute || "未定"} · 假口 ${state.puzzle.deception.falseEntrance || "未定"}`;
  const layerName = ({ surface: "地表", tunnel: "地道", interior: "屋内", roof: "房顶" })[state.player.layer] || state.player.layer;
  return `${roleDefinitions[state.selectedRole].name} · ${layerName}`;
}

function Metric(label, value, detail = "", meter = null, inverse = false, icon = "·") {
  const fill = meter === null ? "" : `<i class="metricBar"><u style="width:${Math.max(0, Math.min(100, meter))}%" class="${inverse ? "inverse" : ""}"></u></i>`;
  return `<div class="metric" title="${detail}"><em class="metricIcon">${icon}</em><span class="metricCopy"><small>${label}</small><b>${value}</b></span>${fill}</div>`;
}

function MetricsMarkup() {
  if (state.levelIndex === 0) {
    const resources = Metric("材料", `木${state.resources.wood} 铁${state.resources.iron}`, `硝灰 ${state.resources.powder} / 药 ${state.resources.medicine} / 粮 ${state.resources.grain}`, null, false, "材");
    const timer = Metric("扫荡倒计时", `${Math.max(0, Math.ceil(state.prepRemaining))}秒`, "归零后敌军自动入村，错误位置的机关会把烟水送向乡亲", state.prepRemaining / 128 * 100, false, "时");
    if (state.phaseId === "collect") {
      const carried = state.level.actions.filter((action) => action.phase === "collect" && action.prop?.mode === "take" && state.completed.has(action.id)).map((action) => action.prop.label);
      return [timer, resources, Metric("已携带", `${carried.length}/4`, carried.join(" · ") || "靠近场景中的实物后拿取", carried.length / 4 * 100, false, "包")].join("");
    }
    if (state.phaseId === "build") return [timer, resources, Metric("勘探", `${Object.values(state.puzzle.survey).filter(Boolean).length}/3`, "水线 · 中央土层 · 风向", Object.values(state.puzzle.survey).filter(Boolean).length / 3 * 100, false, "察"), Metric("机关位置", `${state.defense.siteMatches.filter(Boolean).length}/3`, "西井回流闸 · 中央翻板闸 · 东口导烟板", state.defense.siteMatches.filter(Boolean).length / 3 * 100, false, "构")].join("");
    const highestSmoke = Math.max(0, ...state.civilians.map((civilian) => civilian.smokeDose));
    const highestWater = Math.max(0, ...state.civilians.map((civilian) => civilian.waterDose));
    const enemyMovement = state.raid.distraction ? `${state.raid.distraction.label} ${Math.ceil(state.raid.distraction.remaining)}秒` : "分散搜查";
    return [Metric("扫荡", `${Math.ceil(state.raid.elapsed)}/${state.raid.duration}秒`, state.raid.stage, state.raid.elapsed / state.raid.duration * 100, false, "袭"), Metric("敌兵动向", enemyMovement, "警钟削弱东口灌烟；炮仗削弱西井灌水", state.raid.distraction ? state.raid.distraction.remaining / state.raid.distraction.duration * 100 : 0, false, "声"), Metric("烟剂量", `${Math.round(highestSmoke)}%`, "任一乡亲达到 100% 即失败", highestSmoke, true, "烟"), Metric("水剂量", `${Math.round(highestWater)}%`, "任一乡亲达到 100% 即失败", highestWater, true, "水")].join("");
  }
  if (state.levelIndex === 1) return [
    Metric("跨层开路", `${[state.puzzle.transfer.camoReady, state.puzzle.transfer.hatchBraced, state.puzzle.transfer.childInside, state.puzzle.transfer.innerGateOpen].filter(Boolean).length}/4`, "外侧伪装 · 地下支门 · 孩子钻缝 · 内侧开闩", null, false, "接"),
    Metric("路线", `伤${state.puzzle.transfer.woundedRoute === "wide" ? "宽" : state.puzzle.transfer.woundedRoute === "low" ? "低" : "—"} 粮${state.puzzle.transfer.grainRoute === "low" ? "低" : state.puzzle.transfer.grainRoute === "wide" ? "宽" : "—"}`, "担架走支护宽洞；粮包拆小走排水低梁", null, false, "路"),
    Metric("转移", requiredRescues.filter((key) => state.rescues[key]).length + "/3", "伤员 · 粮食 · 联络员", requiredRescues.filter((key) => state.rescues[key]).length / 3 * 100, false, "转"),
    Metric("记忆", `${state.memories.length}/2`, state.memories.join(" · ") || "可选，不阻塞转移", null, false, "忆")
  ].join("");
  if (state.levelIndex === 3) return [
    Metric("步枪", state.combat.rifle ? `${state.combat.ammo} 发` : "未取得", "F 开枪；弹药不会自动补充", state.combat.ammo / 5 * 100, true, "枪"),
    Metric("手雷", `${state.combat.grenades} 枚`, "G 投掷；只允许在开阔屋脊使用", state.combat.grenades * 100, true, "雷"),
    Metric("体力", `${state.combat.health}/3`, "进入实体掩体可截断敌方射击", state.combat.health / 3 * 100, false, "命"),
    Metric("屋脊敌兵", `${state.combat.neutralized}/4`, state.combat.alarm ? "已交火：敌兵会还击" : "尚未惊动：背后 E 可无声制服", state.combat.neutralized / 4 * 100, false, "敌")
  ].join("");
  return [
    Metric("敌军警觉", Math.round(state.alert), `试错 ${state.puzzle.deception.mistakes} 次`, state.alert, true, "警"),
    Metric("矛盾", `${state.puzzle.deception.contradictions}/3`, "可见痕迹 · 声音来向 · 假翻口必须互相冲突", state.puzzle.deception.contradictions / 3 * 100, false, "疑"),
    Metric("敌军判断", state.puzzle.deception.enemyBelief, "不是压空士气条，而是让敌人形成一条具体错误路线", null, false, "误")
  ].join("");
}

function Update(delta) {
  state.elapsed += delta;
  const coverTarget = state.player.coverId ? 1 : 0;
  state.player.coverBlend = Lerp(state.player.coverBlend || 0, coverTarget, 1 - Math.pow(.00008, delta));
  state.unconsciousEnemies.forEach((enemy) => { enemy.age += delta; });
  state.takedownGrace = Math.max(0, state.takedownGrace - delta);
  UpdateCombat(delta);
  UpdateDogPartner(delta);
  if (state.mode === "play") UpdatePatrolLure(delta);
  state.player.rolePulse = Math.max(0, state.player.rolePulse - delta * .65);
  if (state.player.actionTime > 0) {
    state.player.actionTime = Math.max(0, state.player.actionTime - delta);
    if (state.player.actionTime === 0) state.player.actionKind = null;
  }
  if (state.player.pickup) {
    state.player.pickup.time = Math.max(0, state.player.pickup.time - delta);
    if (state.player.pickup.time === 0) state.player.pickup = null;
  }
  if (state.takedown) {
    UpdateTakedown(delta);
    UpdateUi();
    return;
  }
  if (state.caught) {
    UpdateCaught(delta);
    UpdateUi();
    return;
  }
  if (state.cinematic) {
    state.cinematic.time += delta;
    const progress = Math.min(1, state.cinematic.time / state.cinematic.duration);
    const eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    state.camera.x = Lerp(state.cinematic.fromX, state.cinematic.targetX, eased);
    state.camera.zoom = Lerp(state.cinematic.fromZoom, state.cinematic.zoom, eased);
    ui.cinematicProgress.style.transform = `scaleX(${progress})`;
    if (progress >= 1) EndCinematic();
    return;
  }
  if (state.mode === "play" && ui.levelPanel.hidden && ui.guidePanel.hidden && ui.dialoguePanel.hidden) {
    UpdateLevelOneSystems(delta);
  }
  if (state.mode !== "play" || IsBlocked()) {
    state.player.moving = false;
    state.player.motionBlend = Lerp(state.player.motionBlend, 0, 1 - Math.pow(.004, delta));
    state.player.step += delta * .72;
    return;
  }
  if (qaMode && state.qaCameraFocus) {
    state.player.moving = false;
    state.player.motionBlend = Lerp(state.player.motionBlend, 0, 1 - Math.pow(.004, delta));
    state.player.step += delta * .72;
    state.camera.x = Lerp(state.camera.x, state.qaCameraFocus.x, 1 - Math.pow(.0002, delta));
    state.camera.zoom = Lerp(state.camera.zoom, state.qaCameraFocus.zoom, 1 - Math.pow(.0002, delta));
    UpdateDanger();
    UpdateUi();
    return;
  }
  const direction = Number(inputKeys.right) - Number(inputKeys.left);
  state.player.moving = Boolean(direction);
  state.player.motionBlend = Lerp(state.player.motionBlend, direction ? 1 : 0, 1 - Math.pow(.0008, delta));
  if (direction) {
    state.player.facing = direction;
    const layerBounds = state.levelIndex === 3 && state.player.layer === "interior" ? [-9.2, 1.65] : [worldMin, worldMax];
    state.player.x = Math.max(layerBounds[0], Math.min(layerBounds[1], state.player.x + direction * delta * (state.player.lowProfile ? 2.45 : 3.55)));
    state.player.step += delta * (state.player.lowProfile ? 6.4 : 9);
  } else {
    state.player.step += delta * .72;
  }
  SyncSelectedRolePosition();
  UpdateCoverState();
  const targetX = Math.max(worldMin + 4, Math.min(worldMax - 4, state.player.x + state.player.facing * .7));
  state.camera.x = Lerp(state.camera.x, targetX, 1 - Math.pow(.002, delta));
  const followZoom = state.takedownGrace > 0 && innerWidth <= 640 ? 1.42 : 1;
  state.camera.zoom = Lerp(state.camera.zoom, followZoom, 1 - Math.pow(.01, delta));
  UpdateDanger();
  UpdateUi();
}

function UpdateDanger() {
  if (qaMode && state.qaSafePreview) {
    state.detection = 0;
    state.visibility = GetActiveCover() ? 0 : 36;
    return;
  }
  if (state.takedownGrace > 0) {
    state.detection = 0;
    state.visibility = GetActiveCover() ? 0 : 24;
    return;
  }
  if (FindTakedownOpportunity()) {
    state.detection = 0;
    state.visibility = GetActiveCover() ? 0 : 32;
    return;
  }
  state.detection = state.player.layer === "tunnel" || state.player.layer === "interior" ? 0 : GetDetectionStrength(state.player.x);
  const cover = GetActiveCover();
  state.visibility = ["tunnel", "interior"].includes(state.player.layer) ? 0 : cover ? 0 : state.detection > 0 ? 100 : 46;
  if (state.detection > 0 && !state.detected) TriggerDetection();
}

function TriggerDetection() {
  if (state.levelIndex === 3) {
    TriggerCombatAlarm("sight");
    state.visibility = 100;
    return;
  }
  state.detected = true;
  state.visibility = 100;
  inputKeys.left = false;
  inputKeys.right = false;
  state.player.moving = false;
  state.player.actionKind = "caught";
  state.player.actionTime = .9;
  state.player.actionDuration = .9;
  state.caught = { time: 0, duration: .9 };
  if (state.levelIndex === 2) state.alert = Math.min(100, state.alert + 10);
}

function UpdateCaught(delta) {
  state.caught.time += delta;
  state.player.motionBlend = Lerp(state.player.motionBlend, 0, 1 - Math.pow(.001, delta));
  if (state.caught.time < state.caught.duration) return;
  state.player.x = state.lastSafeX;
  state.detected = false;
  state.caught = null;
  state.detection = 0;
  state.visibility = 0;
  state.player.actionKind = null;
  state.player.actionTime = 0;
  UpdateCoverState();
  Toast(state.levelIndex === 0 ? "被巡逻看见，已退回最近的实体遮挡；拿到的材料仍保留。" : "被巡逻看见，队伍已退回最近的实体遮挡；已完成步骤仍保留。", "warning");
}

function Lerp(a, b, amount) { return a + (b - a) * amount; }

function SmoothStep(edgeA, edgeB, value) {
  const progress = Math.max(0, Math.min(1, (value - edgeA) / Math.max(.0001, edgeB - edgeA)));
  return progress * progress * (3 - 2 * progress);
}

function ForegroundFocusAlpha(screenX, width, nearRadius = 52, farRadius = 138, minimum = .18) {
  const focusXs = [WorldToScreen(state.player.x, width)];
  const focusedEnemy = FindFocusedEnemy();
  if (focusedEnemy) focusXs.push(WorldToScreen(focusedEnemy.x, width));
  state.civilians.forEach((civilian) => focusXs.push(WorldToScreen(civilian.x, width)));
  const nearest = focusXs.reduce((distance, focusX) => Math.min(distance, Math.abs(screenX - focusX)), Infinity);
  return minimum + (1 - minimum) * SmoothStep(nearRadius, farRadius, nearest);
}

function TakedownFigureScale(width) {
  if (!state.takedown && state.takedownGrace <= 0) return 1;
  return width <= 640 ? Math.min(2.35, 1 + (640 - Math.max(320, width)) / 190) : 1;
}

function EnemyIdentity(enemy) {
  const collaborator = enemy.unitType === "collaborator";
  return {
    faction: collaborator ? "伪军" : "日军",
    role: enemy.rank === "sectionLeader" ? (collaborator ? "带队头目" : "分队长") : (collaborator ? "搜查兵" : "步枪兵"),
    accent: collaborator ? "#c59a55" : "#b34a3d"
  };
}

function FindFocusedEnemy(maxDistance = 4.2) {
  if ((state.player.layer !== "surface" && state.levelIndex !== 3) || state.takedown) return null;
  if (state.qaPatrolReview || ActivePatrolLure("dogBark")) return null;
  const patrols = GetEnemyPatrols();
  const qaFocus = qaMode && state.qaEnemyFocusId ? patrols.find((enemy) => enemy.id === state.qaEnemyFocusId) : null;
  if (qaFocus && Math.abs(qaFocus.x - state.player.x) <= maxDistance) return qaFocus;
  return patrols
    .filter((enemy) => (enemy.layer || "surface") === state.player.layer)
    .map((enemy) => ({ enemy, distance: Math.abs(enemy.x - state.player.x) }))
    .filter((candidate) => candidate.distance <= maxDistance)
    .sort((left, right) => left.distance - right.distance)[0]?.enemy || null;
}

function FindTakedownOpportunity() {
  const validLayer = state.player.layer === "surface" || (state.levelIndex === 3 && ["interior", "roof"].includes(state.player.layer));
  if (!validLayer || !takedownRoles.has(state.selectedRole) || state.takedown || state.takedownGrace > 0) return null;
  return GetEnemyPatrols()
    .filter((enemy) => (enemy.layer || "surface") === state.player.layer)
    .map((enemy) => ({ enemy, distance: Math.abs(enemy.x - state.player.x), behind: (state.player.x - enemy.x) * enemy.facing }))
    .filter((candidate) => candidate.distance <= 1.35 && candidate.behind <= .22 && EnemyDetection(candidate.enemy) <= 0)
    .sort((left, right) => left.distance - right.distance)[0]?.enemy || null;
}

function EnemyInteractionState(enemy) {
  const distance = Math.abs(enemy.x - state.player.x);
  const behind = (state.player.x - enemy.x) * enemy.facing;
  const roleAllowed = takedownRoles.has(state.selectedRole);
  const unseen = !state.detected && state.detection <= 0 && EnemyDetection(enemy) <= 0;
  const rearPosition = behind <= .22;
  const ready = roleAllowed && unseen && rearPosition && distance <= 1.35 && state.takedownGrace <= 0;
  let status = enemy.investigating ? "正在搜查" : "巡逻中";
  let instruction = roleAllowed ? "贴近侧后方，等他背向你时按行动键。" : "当前角色不执行制服；切换传宝、根生或青禾。";
  if (enemy.lureKind === "dogBark") {
    status = "追声中";
    instruction = state.selectedRole === "dog" ? "敌兵正追向吠声原点，立刻反向穿过。" : "敌兵正背向通路追声，趁空档移动。";
  }
  else if (state.detected || state.detection > 0) { status = "已经发现你"; instruction = "已经暴露，先脱离视线。"; }
  else if (!rearPosition && distance <= 1.35) { status = "正面警戒"; instruction = "敌人正看着这里，绕到侧后方。"; }
  else if (ready) { status = "可非致命制服"; instruction = "按行动键制服；目标会昏迷但仍有呼吸。"; }
  else if (distance <= 2.5 && roleAllowed) status = "接近中";
  return { distance, behind, rearPosition, roleAllowed, unseen, ready, status, instruction };
}

function FindTakedownTarget() {
  const validLayer = state.player.layer === "surface" || (state.levelIndex === 3 && ["interior", "roof"].includes(state.player.layer));
  if (!validLayer || !takedownRoles.has(state.selectedRole)) return null;
  if (state.takedown || state.caught || state.detected || state.detection > 0 || state.takedownGrace > 0) return null;
  return GetEnemyPatrols()
    .filter((enemy) => (enemy.layer || "surface") === state.player.layer)
    .map((enemy) => ({ enemy, ...EnemyInteractionState(enemy) }))
    .filter((candidate) => candidate.ready)
    .sort((left, right) => left.distance - right.distance)[0]?.enemy || null;
}

function StartTakedown(enemy, qaPreview = false) {
  if (!enemy || state.takedown) return;
  inputKeys.left = false;
  inputKeys.right = false;
  state.takedownCount += 1;
  state.neutralizedEnemies.add(enemy.id);
  state.player.facing = enemy.facing;
  state.player.moving = false;
  state.player.motionBlend = 0;
  state.player.actionKind = "takedown";
  state.player.actionDuration = 2.65;
  state.player.actionTime = 2.65;
  state.takedown = {
    time: 0,
    duration: 2.65,
    progress: 0,
    startPlayerX: state.player.x,
    target: { ...enemy, x: enemy.x, facing: enemy.facing },
    impactTriggered: false,
    qaPreview
  };
  Toast("屏息。贴近。只击昏，先收武器。", "success");
}

function UpdateTakedown(delta) {
  const sequence = state.takedown;
  if (!sequence) return;
  sequence.time = Math.min(sequence.duration, sequence.time + delta);
  sequence.progress = sequence.time / sequence.duration;
  const target = sequence.target;
  const closeProgress = SmoothStep(0, .54, sequence.time);
  const behindX = target.x - target.facing * .4;
  const recoverX = target.x - target.facing * .66;
  state.player.x = Lerp(Lerp(sequence.startPlayerX, behindX, closeProgress), recoverX, SmoothStep(1.42, 2.25, sequence.time));
  state.player.facing = target.facing;
  state.player.moving = false;
  state.player.motionBlend = 0;
  const impactPulse = Math.max(0, 1 - Math.abs(sequence.time - .94) / .13);
  const settle = SmoothStep(1.72, 2.65, sequence.time);
  state.camera.x = target.x - target.facing * .04 + Math.sin(sequence.time * 96) * impactPulse * .028;
  const cinematicZoom = innerWidth <= 640 ? 1.42 : 1.18;
  state.camera.zoom = Lerp(cinematicZoom, innerWidth <= 640 ? 1.42 : 1.08, settle) + impactPulse * .055;
  if (!sequence.impactTriggered && sequence.time >= .94) {
    sequence.impactTriggered = true;
    state.player.rolePulse = 1;
  }
  if (sequence.time < sequence.duration) return;
  state.unconsciousEnemies.push({ ...target, layer: target.layer || "surface", x: target.x, facing: target.facing, disarmed: true, age: 0, ammoDrop: state.levelIndex === 3 && target.index === 1 ? 1 : 0, lootTaken: false });
  state.takedown = null;
  state.takedownGrace = 2.2;
  state.player.actionKind = "inspect";
  state.player.actionDuration = .48;
  state.player.actionTime = .48;
  if (state.levelIndex === 3) {
    state.combat.neutralized += 1;
    CheckCombatSecured();
  } else state.alert = Math.min(100, state.alert + 4);
  Toast("还有呼吸。枪已踢远，继续走。", "success");
}

function GetEnemyPatrols() {
  let routes = [];
  if (state.levelIndex === 0 && state.phaseId === "collect") routes = patrolRouteSets.collect;
  else if (state.levelIndex === 0 && state.phaseId === "defense") {
    const count = Math.min(3, Math.ceil(state.defense.enemyUnits / 3));
    routes = patrolRouteSets.defense.slice(0, count);
  }
  else if (state.levelIndex === 1 && state.player.layer === "surface") routes = patrolRouteSets.ensemble;
  else if (state.levelIndex === 2) {
    const count = state.morale > 70 ? 3 : 2;
    routes = patrolRouteSets.mindGame.slice(0, count);
  }
  else if (state.levelIndex === 3 && ["engage", "secure"].includes(state.phaseId)) routes = patrolRouteSets.rooftopBattle;
  const patrolLure = ActivePatrolLure();
  const scriptedDiversion = state.levelIndex === 0 && state.phaseId === "defense" && ActiveDiversion() ? state.raid.distraction : null;
  const diversion = patrolLure || scriptedDiversion;
  return routes.map((route, index) => {
    const patrolClock = state.qaFreezePatrols ? state.qaPatrolTime : state.elapsed;
    const time = patrolClock * route.speed + route.phase;
    const travel = Math.sin(time) * route.span;
    let x = route.anchor + travel;
    let facing = Math.cos(time) >= 0 ? 1 : -1;
    if (diversion) {
      const spacing = diversion.kind === "dogBark" ? 1.28 : .42;
      const formationX = diversion.targetX + (index - (routes.length - 1) / 2) * spacing;
      const pull = diversion.kind === "dogBark" ? Math.min(.96, .18 + diversion.age * .34) : Math.min(.92, .22 + diversion.age * .27);
      x = Lerp(x, formationX, pull);
      facing = Math.sign(formationX - x) || facing;
    }
    const unitType = index % 3 === 1 ? "collaborator" : "soldier";
    const rank = index === 0 && state.phaseId === "defense" ? "sectionLeader" : "rifleman";
    const id = state.levelIndex === 3 ? `3:roof:${index}` : `${state.levelIndex}:${state.phaseId}:${index}`;
    return {
      id, x, facing,
      viewDistance: diversion ? Math.min(route.viewDistance, diversion.kind === "dogBark" ? 2.65 : 3.05) : route.viewDistance,
      index, unitType, rank,
      investigating: Boolean(diversion),
      lureKind: diversion?.kind || null,
      layer: route.layer || "surface",
      routeMin: route.anchor - route.span,
      routeMax: route.anchor + route.span
    };
  }).filter((enemy) => !state.neutralizedEnemies.has(enemy.id));
}

function DrawPatrolRoutes(width, surfaceY) {
  if (!state.qaPatrolReview || state.player.layer !== "surface" || ActivePatrolLure("dogBark")) return;
  const patrols = GetEnemyPatrols().slice().sort((left, right) => left.routeMin - right.routeMin);
  if (!patrols.length) return;
  const review = true;
  const lineY = surfaceY + 10;
  context.save();
  context.textAlign = "center";
  patrols.forEach((enemy, index) => {
    const startX = WorldToScreen(enemy.routeMin, width);
    const endX = WorldToScreen(enemy.routeMax, width);
    const left = Math.max(4, Math.min(startX, endX));
    const right = Math.min(width - 4, Math.max(startX, endX));
    if (right <= left) return;
    context.fillStyle = review ? "rgba(160,70,55,.28)" : "rgba(141,74,56,.13)";
    context.fillRect(left, lineY - 4, right - left, 8);
    context.strokeStyle = review ? "rgba(211,127,91,.9)" : "rgba(178,113,79,.38)";
    context.lineWidth = review ? 2.2 : 1.2;
    context.beginPath(); context.moveTo(left, lineY); context.lineTo(right, lineY); context.moveTo(left, lineY - 7); context.lineTo(left, lineY + 7); context.moveTo(right, lineY - 7); context.lineTo(right, lineY + 7); context.stroke();
    if (review) {
      const centerX = (left + right) / 2;
      context.fillStyle = "rgba(18,17,15,.9)"; context.fillRect(centerX - 34, lineY + 10, 68, 17);
      context.fillStyle = "#e0b18a"; context.font = '800 9px "FangSong", serif'; context.fillText(`巡逻段 ${index + 1}`, centerX, lineY + 22);
    }
  });
  if (review) {
    for (let index = 0; index < patrols.length - 1; index += 1) {
      const gapStart = WorldToScreen(patrols[index].routeMax, width);
      const gapEnd = WorldToScreen(patrols[index + 1].routeMin, width);
      const left = Math.max(4, Math.min(gapStart, gapEnd));
      const right = Math.min(width - 4, Math.max(gapStart, gapEnd));
      if (right - left < 48) continue;
      const centerX = (left + right) / 2;
      context.fillStyle = "rgba(77,171,164,.18)"; context.fillRect(left, lineY - 5, right - left, 10);
      context.strokeStyle = "rgba(111,224,214,.92)"; context.lineWidth = 2.4;
      context.beginPath(); context.moveTo(left, lineY - 6); context.lineTo(left, lineY + 7); context.lineTo(right, lineY + 7); context.lineTo(right, lineY - 6); context.stroke();
      context.fillStyle = "rgba(8,18,18,.94)"; context.fillRect(centerX - 39, lineY + 10, 78, 17);
      context.fillStyle = "#bdf3ed"; context.font = '900 9px "FangSong", serif'; context.fillText("穿越空档", centerX, lineY + 22);
    }
  }
  context.restore();
}

function GetSurfaceCovers() {
  return coverDefinitions[state.level.id] || [];
}

function GetActiveCover(worldX = state.player.x) {
  if (state.player.layer === "tunnel") return null;
  return GetSurfaceCovers().find((cover) => (cover.layer || "surface") === state.player.layer && Math.abs(worldX - cover.x) <= cover.width * .5) || null;
}

function UpdateCoverState() {
  const cover = GetActiveCover();
  state.player.coverId = cover?.id || null;
  state.player.lowProfile = Boolean(cover && cover.pose === "low");
  if (cover && !state.detected) state.lastSafeX = cover.x;
}

function EnemyDetection(enemy, playerX = state.player.x) {
  if ((enemy.layer || "surface") !== state.player.layer) return 0;
  if (state.selectedRole === "dog" && ActivePatrolLure("dogBark")) return 0;
  if (GetActiveCover(playerX)) return 0;
  const forward = (playerX - enemy.x) * enemy.facing;
  if (forward < .18 || forward > enemy.viewDistance) return 0;
  return Math.max(.08, 1 - forward / enemy.viewDistance);
}

function GetDetectionStrength(playerX) {
  return GetEnemyPatrols().reduce((highest, enemy) => Math.max(highest, EnemyDetection(enemy, playerX)), 0);
}

function ResizeCanvas() {
  const ratio = Math.min(2, devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: rect.width, height: rect.height };
}

function WorldToScreen(x, width) {
  const scale = width / (22 / state.camera.zoom);
  return width / 2 + (x - state.camera.x) * scale;
}

function LayerToScreen(x, width, parallax) {
  const scale = width / (22 / state.camera.zoom);
  return width / 2 + (x - state.camera.x * parallax) * scale;
}

function RoofFloorYAt(worldX, surfaceY) {
  if (worldX <= 1.85) {
    const distance = Math.min(1, Math.abs(worldX + 3.75) / 5.55);
    return surfaceY - 128 - (1 - distance) * 54;
  }
  if (worldX < 2.55) return surfaceY - 126;
  const distance = Math.min(1, Math.abs(worldX - 6.15) / 3.75);
  return surfaceY - 118 - (1 - distance) * 45;
}

function LayerBaseY(layer, worldX, height, surfaceY, tunnelY) {
  if (layer === "tunnel") return TunnelFloorYAt(worldX, height, tunnelY);
  if (layer === "roof") return RoofFloorYAt(worldX, surfaceY);
  return surfaceY - 5;
}

function DrawPathArrow(fromX, fromY, toX, toY, color, dashed = false) {
  context.save(); context.strokeStyle = color; context.fillStyle = color; context.lineWidth = 2.4;
  if (dashed) context.setLineDash([7, 6]);
  context.beginPath(); context.moveTo(fromX, fromY); context.quadraticCurveTo((fromX + toX) / 2, Math.min(fromY, toY) - 13, toX, toY); context.stroke();
  const angle = Math.atan2(toY - fromY, toX - fromX); context.translate(toX, toY); context.rotate(angle);
  context.beginPath(); context.moveTo(0, 0); context.lineTo(-10, -5); context.lineTo(-10, 5); context.closePath(); context.fill(); context.restore();
}

function DrawPuzzleFocusPool(screenX, screenY, radius, tone) {
  const gradient = context.createRadialGradient(screenX, screenY, 3, screenX, screenY, radius);
  gradient.addColorStop(0, tone);
  gradient.addColorStop(.42, tone.replace(/[^,]+\)$/, ".08)"));
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.beginPath(); context.arc(screenX, screenY, radius, 0, Math.PI * 2); context.fill();
}

function DrawPuzzleNodeBadge(screenX, screenY, label, tone) {
  context.save();
  context.font = "900 9px system-ui";
  context.textAlign = "center";
  const badgeWidth = Math.max(62, Math.min(104, context.measureText(label).width + 24));
  context.shadowColor = "rgba(0,0,0,.78)";
  context.shadowBlur = 8;
  context.fillStyle = "rgba(12,17,16,.9)";
  context.strokeStyle = tone;
  context.lineWidth = 1.5;
  context.beginPath(); context.roundRect(screenX - badgeWidth / 2, screenY - 11, badgeWidth, 22, 4); context.fill(); context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = tone;
  context.beginPath(); context.arc(screenX - badgeWidth / 2 + 8, screenY, 3, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#f3ead4";
  context.fillText(label, screenX + 4, screenY + 3);
  context.restore();
}

function DrawPuzzleTopology(width, height, surfaceY, tunnelY) {
  const tunnelCenter = (worldX) => (TunnelCeilingYAt(worldX, height, tunnelY) + TunnelFloorYAt(worldX, height, tunnelY)) / 2;
  context.save(); context.font = "800 10px system-ui"; context.textAlign = "center";
  if (state.levelIndex === 0 && ["build", "defense"].includes(state.phaseId)) {
    if (state.puzzle.survey.waterKnown || state.phaseId === "defense") {
      DrawPathArrow(WorldToScreen(-9.8, width), tunnelCenter(-9.8) + 24, WorldToScreen(-7.1, width), tunnelCenter(-7.1) + 27, "rgba(75,178,194,.82)");
      context.fillStyle = "rgba(157,221,221,.82)"; context.font = "800 10px system-ui"; context.fillText("西井水线 → 低位回流", WorldToScreen(-9.25, width), tunnelCenter(-9.25) + 48);
    }
    if (state.puzzle.survey.centerKnown || state.phaseId === "defense") {
      context.strokeStyle = "rgba(221,181,103,.64)"; context.lineWidth = 5; context.beginPath(); context.moveTo(WorldToScreen(-1.6, width), tunnelCenter(-1.6)); context.lineTo(WorldToScreen(1.6, width), tunnelCenter(1.6)); context.stroke();
      context.fillStyle = "rgba(237,205,137,.8)"; context.fillText("中央直道 · 横向分割", WorldToScreen(-.7, width), tunnelCenter(-.7) - 25);
    }
    if (state.puzzle.survey.windKnown || state.phaseId === "defense") {
      DrawPathArrow(WorldToScreen(9.7, width), tunnelCenter(9.7), WorldToScreen(7.2, width), tunnelCenter(7.2) - 42, "rgba(200,205,166,.82)");
      context.fillStyle = "rgba(228,224,184,.82)"; context.fillText("东口烟气 ↗ 空支洞", WorldToScreen(7.7, width), tunnelCenter(7.7) - 52);
    }
  } else if (state.levelIndex === 1 && state.phaseId === "transfer") {
    const forkX = WorldToScreen(-8.35, width); const forkY = tunnelCenter(-8.35);
    const wideX = WorldToScreen(-2.8, width); const lowX = WorldToScreen(2.85, width);
    DrawPathArrow(forkX, forkY - 2, wideX, tunnelCenter(-2.8) - 31, state.puzzle.transfer.wideSupported ? "rgba(92,207,198,.82)" : "rgba(179,133,78,.48)");
    DrawPathArrow(forkX, forkY + 12, lowX, tunnelCenter(2.85) + 29, state.puzzle.transfer.lowDrainOpen ? "rgba(93,173,196,.82)" : "rgba(117,88,62,.58)");
    context.font = "900 10px system-ui"; context.textAlign = "center";
    context.fillStyle = state.puzzle.transfer.wideSupported ? "#bdeee4" : "#b89d74"; context.fillText(`高支洞 · ${state.puzzle.transfer.wideSupported ? "担架" : "松土"}`, WorldToScreen(-5.1, width), tunnelCenter(-5.1) - 57);
    context.fillStyle = state.puzzle.transfer.lowDrainOpen ? "#aadce4" : "#a98b68"; context.fillText(`低梁孔 · ${state.puzzle.transfer.lowDrainOpen ? "小粮包" : "积水"}`, WorldToScreen(1.35, width), tunnelCenter(1.35) + 57);
  } else if (state.levelIndex === 2 && ["compose", "execute"].includes(state.phaseId)) {
    const route = state.puzzle.deception.acousticRoute;
    const hornX = WorldToScreen(route === "westFront" ? -1.75 : .55, width);
    const sourceY = tunnelCenter(route === "westFront" ? -1.75 : .55);
    const exitWorldX = route === "westFront" ? -5.4 : 7.4;
    const exitX = WorldToScreen(exitWorldX, width);
    const decoyWorldX = state.puzzle.deception.visibleDecoy === "west" ? -9 : state.puzzle.deception.visibleDecoy === "east" ? 8.05 : -9;
    const hatchWorldX = state.puzzle.deception.falseEntrance === "centerSealed" ? 6.65 : 4.15;
    const decoyX = WorldToScreen(decoyWorldX, width);
    const hatchX = WorldToScreen(hatchWorldX, width);
    const hatchY = tunnelCenter(hatchWorldX);
    context.save();
    context.globalCompositeOperation = "screen";
    DrawPuzzleFocusPool(decoyX, surfaceY - 18, 78, "rgba(224,169,76,.18)");
    DrawPuzzleFocusPool(exitX, surfaceY - 31, 72, "rgba(72,202,205,.17)");
    DrawPuzzleFocusPool(hatchX, hatchY, 78, "rgba(224,169,76,.16)");
    context.restore();
    context.shadowColor = "rgba(75,222,224,.72)"; context.shadowBlur = 7;
    DrawPathArrow(hornX, sourceY, exitX, surfaceY - 31, route ? "rgba(103,229,227,.98)" : "rgba(111,164,163,.58)", true);
    context.shadowColor = "rgba(232,177,85,.55)"; context.shadowBlur = 6;
    context.strokeStyle = "rgba(238,185,89,.95)"; context.lineWidth = 3; context.setLineDash([5, 6]); context.beginPath();
    context.moveTo(decoyX, surfaceY - 18); context.lineTo(hatchX, hatchY); context.stroke();
    context.shadowBlur = 0; context.setLineDash([]);
    context.font = "900 10px system-ui"; context.textAlign = "center"; context.fillStyle = "rgba(248,232,195,.96)";
    context.fillText(`矛盾 ${state.puzzle.deception.contradictions}/3`, WorldToScreen(2.5, width), tunnelCenter(2.5) - 48);
  }
  context.restore();
}

function DrawPuzzleEndpointBadges(width, height, surfaceY, tunnelY) {
  if (state.levelIndex !== 2 || !["compose", "execute"].includes(state.phaseId)) return;
  const tunnelCenter = (worldX) => (TunnelCeilingYAt(worldX, height, tunnelY) + TunnelFloorYAt(worldX, height, tunnelY)) / 2;
  const route = state.puzzle.deception.acousticRoute;
  const decoyWorldX = state.puzzle.deception.visibleDecoy === "east" ? 8.05 : -9;
  const hornWorldX = route === "westFront" ? -1.75 : .55;
  const exitWorldX = route === "westFront" ? -5.4 : 7.4;
  const hatchWorldX = state.puzzle.deception.falseEntrance === "centerSealed" ? 6.65 : 4.15;
  const decoyX = WorldToScreen(decoyWorldX, width);
  const decoyY = surfaceY - 18;
  context.save();
  context.strokeStyle = "rgba(231,179,92,.92)"; context.lineWidth = 1.5;
  context.beginPath(); context.arc(decoyX, decoyY, 8, 0, Math.PI * 2); context.moveTo(decoyX, decoyY - 8); context.lineTo(decoyX, surfaceY - 76); context.stroke();
  context.restore();
  DrawPuzzleNodeBadge(decoyX, surfaceY - 88, state.puzzle.deception.visibleDecoy === "east" ? "东井假痕" : state.puzzle.deception.visibleDecoy === "west" ? "西院假痕" : "诱饵未定", "#e7b35c");
  DrawPuzzleNodeBadge(WorldToScreen(exitWorldX, width), surfaceY - 70, route === "westFront" ? "西墙出声" : route === "eastRear" ? "东后出声" : "声路未定", "#76dfdd");
  DrawPuzzleNodeBadge(WorldToScreen(hornWorldX, width), tunnelCenter(hornWorldX) - 31, "地下声门", "#76dfdd");
  DrawPuzzleNodeBadge(WorldToScreen(hatchWorldX, width), tunnelCenter(hatchWorldX) + 35, state.puzzle.deception.falseEntrance === "centerSealed" ? "中封东引" : state.puzzle.deception.falseEntrance === "westOpen" ? "西口敞开" : "假口未定", "#e7b35c");
}

function DrawInactiveRoles(width, height, surfaceY, tunnelY) {
  if (!state.rolePositions || state.levelIndex === 0 || state.mode === "title") return;
  for (const roleId of state.level.roleIds) {
    if (roleId === state.selectedRole || roleId === "dog") continue;
    const position = state.rolePositions[roleId];
    if (!position) continue;
    const profile = actorProfiles[roleId];
    const role = roleDefinitions[roleId];
    const x = WorldToScreen(position.x, width);
    const baseY = LayerBaseY(position.layer, position.x, height, surfaceY, tunnelY);
    const scale = Math.min(width, 1100) / 26 * .038;
    const figureHeight = profile.height * 39 * scale;
    context.save(); context.globalAlpha = .56; context.translate(x, baseY); context.scale(position.facing, 1); DrawHumanActor(profile, roleId, figureHeight); context.restore();
    context.save(); context.textAlign = "center"; context.font = "800 9px system-ui"; context.fillStyle = "rgba(8,13,15,.78)"; context.fillRect(x - 28, baseY + 6, 56, 17); context.fillStyle = "#e7dbc0"; context.fillText(`${role.short} · 等候`, x, baseY + 18); context.restore();
  }
}

function Draw() {
  const { width, height } = ResizeCanvas();
  const surfaceY = height * .48;
  const tunnelY = height * .76;
  const daylight = state.levelIndex === 0 && state.phaseId === "collect" ? 0 : state.levelIndex === 2 ? .26 : state.levelIndex === 3 ? .16 : .55;
  DrawSky(width, height, surfaceY, daylight);
  DrawVillage(width, height, surfaceY);
  DrawSurfaceDepthVeil(width, height, surfaceY, daylight);
  DrawRaidDestruction(width, height, surfaceY);
  DrawSurfaceCovers(width, surfaceY, false);
  DrawEarth(width, height, surfaceY, tunnelY);
  if (state.levelIndex === 3) DrawCombatArchitecture(width, height, surfaceY, tunnelY);
  DrawEntrances(width, height, surfaceY, tunnelY);
  DrawTunnelSystems(width, height, surfaceY, tunnelY);
  DrawFluidSimulation(width, height, tunnelY);
  DrawDogCommandEnvironment(width, height, surfaceY, tunnelY);
  DrawSurfaceVegetation(width, height, surfaceY);
  DrawLighting(width, height, surfaceY, tunnelY, daylight);
  DrawForegroundDepthFrame(width, height, surfaceY, tunnelY, daylight);
  DrawLianhuanhuaPostProcess(width, height, surfaceY, tunnelY, daylight);
  DrawSceneHierarchyVeil(width, height, surfaceY, tunnelY);
  DrawPuzzleTopology(width, height, surfaceY, tunnelY);
  if (state.levelIndex === 3) DrawCombatCovers(width, height, surfaceY, tunnelY, false);
  DrawActionProps(width, height, surfaceY, tunnelY, false);
  if (!state.takedown && !state.qaPatrolReview && !ActivePatrolLure("dogBark")) DrawActions(width, height, surfaceY, tunnelY);
  DrawPatrolRoutes(width, surfaceY);
  DrawEnemies(width, height, surfaceY, tunnelY);
  DrawUnconsciousEnemies(width, height, surfaceY, tunnelY);
  DrawTakedownTarget(width, height, surfaceY, tunnelY);
  DrawInactiveRoles(width, height, surfaceY, tunnelY);
  DrawCivilians(width, height, tunnelY);
  DrawDogCompanion(width, height, surfaceY, tunnelY);
  if (!ActivePatrolLure("dogBark")) DrawActor(width, height, surfaceY, tunnelY);
  DrawSurfaceCovers(width, surfaceY, true);
  if (state.levelIndex === 3) DrawCombatCovers(width, height, surfaceY, tunnelY, true);
  if (ActivePatrolLure("dogBark")) DrawActor(width, height, surfaceY, tunnelY);
  DrawActionProps(width, height, surfaceY, tunnelY, true);
  DrawPickupTransfer(width, height, surfaceY, tunnelY);
  DrawSurfaceDiversions(width, height, surfaceY);
  DrawDogBarkLure(width, surfaceY);
  DrawDogCommandFocus(width, height, surfaceY, tunnelY);
  DrawCombatEffects(width, height, surfaceY, tunnelY);
  DrawPuzzleEndpointBadges(width, height, surfaceY, tunnelY);
  DrawCombatHud(width, height);
  if (!ActivePatrolLure("dogBark")) DrawActorVisibilityHud(width, surfaceY);
  DrawDetectionFlash(width, height, surfaceY);
  DrawDepthHint(width, height, surfaceY, tunnelY);
  DrawTakedownCinematicOverlay(width, height);
  if (qaMode && !state.cleanCapture) DrawQa(width, height, surfaceY, tunnelY);
}

function DrawSceneHierarchyVeil(width, height, surfaceY, tunnelY) {
  context.save();
  if (["surface", "interior", "roof"].includes(state.player.layer)) {
    const middleDistance = context.createLinearGradient(0, surfaceY * .35, 0, surfaceY + 8);
    middleDistance.addColorStop(0, "rgba(176,180,169,.08)");
    middleDistance.addColorStop(.58, "rgba(158,145,119,.055)");
    middleDistance.addColorStop(1, "rgba(71,58,44,.015)");
    context.fillStyle = middleDistance;
    context.fillRect(0, surfaceY * .3, width, surfaceY * .72);
    const tunnelShade = context.createLinearGradient(0, surfaceY + 4, 0, height);
    tunnelShade.addColorStop(0, "rgba(9,13,14,.16)");
    tunnelShade.addColorStop(.45, "rgba(7,11,12,.34)");
    tunnelShade.addColorStop(1, "rgba(5,8,9,.5)");
    context.fillStyle = tunnelShade;
    context.fillRect(0, surfaceY + 4, width, height - surfaceY - 4);
  } else {
    const surfaceShade = context.createLinearGradient(0, 0, 0, surfaceY + 2);
    surfaceShade.addColorStop(0, "rgba(12,17,18,.47)");
    surfaceShade.addColorStop(.62, "rgba(14,18,18,.39)");
    surfaceShade.addColorStop(1, "rgba(13,15,14,.31)");
    context.fillStyle = surfaceShade;
    context.fillRect(0, 0, width, surfaceY + 2);
    context.fillStyle = "rgba(224,188,111,.035)";
    context.fillRect(0, tunnelY - height * .12, width, height - tunnelY + height * .12);
  }
  context.restore();
}

function SceneHash(seed) {
  return Math.abs(Math.sin(seed * 91.733 + 17.19) * 43758.5453) % 1;
}

function DrawMountainLayer(width, surfaceY, layer) {
  const offset = state.camera.x * width * layer.parallax * .018;
  const ridgePoints = [];
  for (let x = -100; x <= width + 120; x += layer.step * .52) {
    const broad = Math.sin((x + offset) * layer.frequency + layer.seed) * layer.amplitude;
    const ridge = Math.sin((x + offset) * layer.frequency * 2.37 + layer.seed * 1.9) * layer.amplitude * .34;
    const peakWave = Math.abs(Math.sin((x + offset) * layer.frequency * .61 + layer.seed * 2.4));
    const peak = Math.pow(peakWave, 1.8) * layer.amplitude * .72;
    const crag = (SceneHash(Math.floor((x + offset) / layer.step) + layer.seed * 31) - .5) * layer.amplitude * .23;
    ridgePoints.push({ x, y: layer.baseY + broad + ridge - peak + crag });
  }
  context.beginPath(); context.moveTo(-100, surfaceY + 2);
  ridgePoints.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(width + 100, surfaceY + 2); context.closePath();
  context.fillStyle = layer.color; context.fill();

  context.save(); context.clip();
  const detail = Math.max(.16, layer.parallax * 1.65);
  context.strokeStyle = layer.hatch || `rgba(30,31,27,${.12 + detail * .16})`;
  context.lineCap = "round";
  for (let index = 1; index < ridgePoints.length - 1; index += 1) {
    if (index % 3 !== 1) continue;
    const point = ridgePoints[index];
    const previous = ridgePoints[index - 1];
    const next = ridgePoints[index + 1];
    const slope = Math.max(-.85, Math.min(.85, (next.y - previous.y) / Math.max(1, next.x - previous.x)));
    const strokeCount = 1 + Math.floor(detail * 1.5);
    for (let stroke = 0; stroke < strokeCount; stroke += 1) {
      const inset = 7 + stroke * (8 + detail * 5) + SceneHash(index * 13 + stroke + layer.seed) * 8;
      const startX = point.x + (stroke - strokeCount * .35) * layer.step * .18;
      const startY = point.y + inset;
      const length = 10 + detail * 25 + SceneHash(index * 7 + stroke) * 13;
      context.lineWidth = .55 + detail * .75;
      context.beginPath();
      context.moveTo(startX, startY);
      context.quadraticCurveTo(startX + length * .45, startY + slope * length * .2 + 3, startX + length, startY + slope * length + 7);
      context.stroke();
    }
  }
  context.strokeStyle = `rgba(225,205,165,${.025 + (1 - layer.parallax) * .035})`;
  context.lineWidth = .7;
  ridgePoints.forEach((point, index) => {
    if (index % 5 !== 1) return;
    context.beginPath();
    context.moveTo(point.x, point.y + 6);
    context.bezierCurveTo(point.x - layer.step * .3, point.y + 19, point.x + layer.step * .35, point.y + 29, point.x + layer.step * .18, point.y + 47);
    context.stroke();
  });
  context.restore();

  context.beginPath(); ridgePoints.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.strokeStyle = layer.rim; context.lineWidth = layer.lineWidth; context.lineJoin = "round"; context.stroke();
}

function DrawSky(width, height, surfaceY, daylight) {
  const isDay = daylight > .4;
  const gradient = context.createLinearGradient(0, 0, 0, surfaceY);
  gradient.addColorStop(0, isDay ? "#96978b" : "#172126");
  gradient.addColorStop(.52, isDay ? "#b4ac96" : "#343a38");
  gradient.addColorStop(1, isDay ? "#cfb98e" : "#6a5140");
  context.fillStyle = gradient; context.fillRect(0, 0, width, height);

  const celestialX = LayerToScreen(7.6, width, .035);
  const celestialY = surfaceY * .19;
  const celestialGlow = context.createRadialGradient(celestialX, celestialY, 2, celestialX, celestialY, isDay ? 72 : 58);
  celestialGlow.addColorStop(0, isDay ? "rgba(255,228,157,.72)" : "rgba(217,229,222,.38)");
  celestialGlow.addColorStop(1, "rgba(255,236,185,0)");
  context.fillStyle = celestialGlow; context.beginPath(); context.arc(celestialX, celestialY, isDay ? 72 : 58, 0, Math.PI * 2); context.fill();
  context.fillStyle = isDay ? "rgba(238,208,137,.58)" : "rgba(210,222,216,.32)"; context.beginPath(); context.arc(celestialX, celestialY, isDay ? 29 : 22, 0, Math.PI * 2); context.fill();

  if (!isDay) {
    for (let star = 0; star < 17; star += 1) {
      const starX = (SceneHash(star + 2) * width - state.camera.x * width * .0025 + width) % width;
      const starY = 20 + SceneHash(star + 17) * surfaceY * .52;
      const twinkle = .24 + SceneHash(star + 31) * .46 + Math.sin(state.elapsed * 1.1 + star) * .08;
      context.fillStyle = `rgba(224,225,205,${twinkle})`; context.beginPath(); context.arc(starX, starY, .7 + SceneHash(star + 49) * 1.1, 0, Math.PI * 2); context.fill();
    }
  }

  const cloudLayers = [
    { y: .2, parallax: .035, scale: .55, alpha: isDay ? .12 : .055 },
    { y: .34, parallax: .075, scale: .82, alpha: isDay ? .16 : .075 }
  ];
  cloudLayers.forEach((cloud, layerIndex) => {
    const cloudOffset = state.camera.x * width * cloud.parallax * .02;
    context.fillStyle = isDay ? `rgba(230,222,196,${cloud.alpha})` : `rgba(165,176,174,${cloud.alpha})`;
    for (let cloudIndex = -1; cloudIndex < 7; cloudIndex += 1) {
      const x = cloudIndex * width * .21 - cloudOffset + (layerIndex ? 70 : 0);
      const y = surfaceY * cloud.y + Math.sin(cloudIndex * 2.2 + layerIndex) * 14;
      context.beginPath(); context.ellipse(x, y, 62 * cloud.scale, 13 * cloud.scale, -.08, 0, Math.PI * 2); context.ellipse(x + 45 * cloud.scale, y - 7, 48 * cloud.scale, 16 * cloud.scale, .05, 0, Math.PI * 2); context.fill();
    }
  });

  [
    { parallax: .035, baseY: surfaceY * .53, amplitude: 23, step: 58, frequency: .008, seed: .7, color: isDay ? "#858779" : "#313d3f", rim: "rgba(229,218,187,.11)", hatch: "rgba(32,34,31,.08)", lineWidth: 1 },
    { parallax: .075, baseY: surfaceY * .61, amplitude: 32, step: 52, frequency: .0092, seed: 2.1, color: isDay ? "#717667" : "#394342", rim: "rgba(220,204,169,.13)", hatch: "rgba(24,29,27,.12)", lineWidth: 1.25 },
    { parallax: .145, baseY: surfaceY * .69, amplitude: 42, step: 44, frequency: .0105, seed: 4.4, color: isDay ? "#5f6655" : "#444940", rim: "rgba(211,188,145,.17)", hatch: "rgba(28,29,24,.18)", lineWidth: 1.55 },
    { parallax: .245, baseY: surfaceY * .78, amplitude: 34, step: 38, frequency: .013, seed: 6.6, color: isDay ? "#4e5544" : "#4a493b", rim: "rgba(218,180,126,.2)", hatch: "rgba(28,24,19,.23)", lineWidth: 1.8 }
  ].forEach((layer) => DrawMountainLayer(width, surfaceY, layer));

  const treeBaseY = surfaceY - 31;
  for (let worldX = -20; worldX <= 20; worldX += .62) {
    const x = LayerToScreen(worldX, width, .34);
    const size = 10 + SceneHash(worldX + 100) * 18;
    context.fillStyle = isDay ? "rgba(41,55,43,.78)" : "rgba(27,36,34,.86)";
    context.beginPath(); context.ellipse(x, treeBaseY - size * .45, size * .55, size * .72, SceneHash(worldX) * .35 - .17, 0, Math.PI * 2); context.ellipse(x + size * .36, treeBaseY - size * .32, size * .44, size * .58, .15, 0, Math.PI * 2); context.fill();
  }
}

function DrawFieldDepth(width, surfaceY) {
  const horizonY = surfaceY - 72;
  const vanishX = width * .52 - state.camera.x * width * .006;
  const fieldGradient = context.createLinearGradient(0, horizonY, 0, surfaceY + 4);
  fieldGradient.addColorStop(0, "#5b5940"); fieldGradient.addColorStop(.55, "#514832"); fieldGradient.addColorStop(1, "#3f3427");
  context.fillStyle = fieldGradient; context.fillRect(0, horizonY, width, surfaceY - horizonY + 6);
  const plots = [
    { left: -.02, farLeft: -.1, farRight: -.02, right: .27, fill: "rgba(111,95,55,.38)" },
    { left: .24, farLeft: -.015, farRight: .045, right: .49, fill: "rgba(66,68,45,.34)" },
    { left: .46, farLeft: .035, farRight: .1, right: .73, fill: "rgba(111,84,49,.36)" },
    { left: .7, farLeft: .09, farRight: .16, right: 1.03, fill: "rgba(62,64,43,.4)" }
  ];
  plots.forEach((plot, plotIndex) => {
    context.fillStyle = plot.fill;
    context.beginPath();
    context.moveTo(vanishX + width * plot.farLeft, horizonY + 2 + plotIndex % 2 * 3);
    context.lineTo(vanishX + width * plot.farRight, horizonY + 3);
    context.lineTo(width * plot.right, surfaceY + 5);
    context.lineTo(width * plot.left, surfaceY + 5);
    context.closePath(); context.fill();
  });

  for (let lane = -6; lane <= 6; lane += 1) {
    const nearX = width * .5 + lane * width * .071;
    const bend = (SceneHash(lane + 402) - .5) * 24;
    context.strokeStyle = lane % 3 ? "rgba(199,155,84,.105)" : "rgba(37,34,27,.27)";
    context.lineWidth = lane % 4 === 0 ? 2.4 : 1;
    context.beginPath();
    context.moveTo(vanishX + lane * 4.2, horizonY + 3);
    context.quadraticCurveTo(Lerp(vanishX, nearX, .57) + bend, Lerp(horizonY, surfaceY, .62), nearX, surfaceY + 6);
    context.stroke();
  }
  for (let row = 0; row < 4; row += 1) {
    const progress = (row + 1) / 5;
    const y = Lerp(horizonY, surfaceY, Math.pow(progress, 1.7));
    const sag = (row % 2 ? -1 : 1) * (3 + row * .8);
    context.strokeStyle = `rgba(216,175,105,${.035 + progress * .075})`; context.lineWidth = .7 + progress * 1.15;
    context.beginPath(); context.moveTo(-20, y + Math.sin(row) * 2); context.bezierCurveTo(width * .25, y + sag, vanishX, y - sag * .7, width + 20, y + sag * .35); context.stroke();
  }

  context.fillStyle = "rgba(54,43,31,.72)";
  context.beginPath(); context.moveTo(vanishX - 10, horizonY); context.lineTo(vanishX + 22, horizonY); context.lineTo(width * .69, surfaceY + 7); context.lineTo(width * .57, surfaceY + 7); context.closePath(); context.fill();
  context.strokeStyle = "rgba(201,151,86,.38)"; context.lineWidth = 2.6;
  context.beginPath(); context.moveTo(vanishX + 1, horizonY + 1); context.quadraticCurveTo(width * .59, surfaceY - 31, width * .61, surfaceY + 6); context.moveTo(vanishX + 13, horizonY + 1); context.quadraticCurveTo(width * .65, surfaceY - 27, width * .68, surfaceY + 6); context.stroke();
}

function DrawPerspectiveHouse(worldX, width, baseY, size, parallax, variant, alpha) {
  const x = LayerToScreen(worldX, width, parallax);
  const side = variant % 2 ? 1 : -1;
  const frontWidth = size * (.92 + SceneHash(variant + 4) * .18);
  const wallHeight = size * (.52 + SceneHash(variant + 8) * .1);
  const depthX = side * size * .35;
  const depthY = -size * .11;
  context.save(); context.globalAlpha = alpha;
  context.fillStyle = "rgba(20,20,18,.26)"; context.beginPath(); context.ellipse(x + depthX * .2, baseY + 4, frontWidth * .72, size * .1, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = variant % 3 === 0 ? "#756047" : variant % 3 === 1 ? "#675541" : "#80684d";
  context.fillRect(x - frontWidth / 2, baseY - wallHeight, frontWidth, wallHeight);
  context.fillStyle = variant % 2 ? "#4f4538" : "#554333";
  context.beginPath(); context.moveTo(x + side * frontWidth / 2, baseY - wallHeight); context.lineTo(x + side * (frontWidth / 2 + Math.abs(depthX)), baseY - wallHeight + depthY); context.lineTo(x + side * (frontWidth / 2 + Math.abs(depthX)), baseY + depthY); context.lineTo(x + side * frontWidth / 2, baseY); context.closePath(); context.fill();
  context.fillStyle = "#342f2b";
  context.beginPath(); context.moveTo(x - frontWidth * .64, baseY - wallHeight); context.lineTo(x, baseY - wallHeight - size * .36); context.lineTo(x + frontWidth * .64, baseY - wallHeight); context.closePath(); context.fill();
  context.fillStyle = "#292724";
  context.beginPath(); context.moveTo(x, baseY - wallHeight - size * .36); context.lineTo(x + side * (frontWidth * .64 + Math.abs(depthX)), baseY - wallHeight + depthY); context.lineTo(x + side * frontWidth * .64, baseY - wallHeight); context.closePath(); context.fill();
  context.strokeStyle = "rgba(219,182,118,.28)"; context.lineWidth = Math.max(1, size * .018);
  for (let beam = -1; beam <= 1; beam += 1) { context.beginPath(); context.moveTo(x + beam * frontWidth * .28, baseY - wallHeight + 3); context.lineTo(x + beam * frontWidth * .28, baseY); context.stroke(); }
  context.fillStyle = "#211f1c"; context.fillRect(x - frontWidth * .13, baseY - wallHeight * .48, frontWidth * .26, wallHeight * .48);
  if (variant % 2 === 0) {
    context.fillStyle = "rgba(211,165,81,.34)"; context.fillRect(x - frontWidth * .38, baseY - wallHeight * .63, frontWidth * .16, wallHeight * .17);
    context.strokeStyle = "rgba(236,202,132,.3)"; context.strokeRect(x - frontWidth * .38, baseY - wallHeight * .63, frontWidth * .16, wallHeight * .17);
  }
  context.strokeStyle = "rgba(231,198,139,.16)"; context.lineWidth = 1;
  for (let mark = 0; mark < 4; mark += 1) { context.beginPath(); context.moveTo(x - frontWidth * .46, baseY - wallHeight * (.22 + mark * .15)); context.lineTo(x + frontWidth * .45, baseY - wallHeight * (.19 + mark * .15)); context.stroke(); }
  if (variant % 3 === 1) {
    const chimneyX = x - side * frontWidth * .27;
    const chimneyY = baseY - wallHeight - size * .25;
    context.fillStyle = "#3b3129"; context.fillRect(chimneyX - size * .055, chimneyY, size * .11, size * .26);
    for (let puff = 0; puff < 4; puff += 1) {
      const cycle = (state.elapsed * .055 + puff * .24 + variant * .17) % 1;
      const drift = side * cycle * size * .42 + Math.sin(puff * 2.4 + state.elapsed * .3) * size * .06;
      context.fillStyle = `rgba(141,139,126,${(1 - cycle) * .14})`;
      context.beginPath(); context.ellipse(chimneyX + drift, chimneyY - cycle * size * .78, size * (.08 + cycle * .16), size * (.05 + cycle * .1), -.18 * side, 0, Math.PI * 2); context.fill();
    }
  }
  context.restore();
}

function DrawVillageFenceSegment(worldX, width, baseY, span, parallax, variant, alpha = 1) {
  const x = LayerToScreen(worldX, width, parallax);
  const depthScale = .58 + parallax * .52;
  const worldScale = Math.max(.64, Math.min(1.35, (width / (22 / state.camera.zoom)) / 48));
  const fenceWidth = span * width / 22 * depthScale;
  const fenceHeight = (22 + variant % 3 * 5) * depthScale * worldScale;
  const groundYAt = (progress) => baseY + Math.sin(progress * Math.PI * 1.7 + variant) * 2.6 * depthScale + (progress - .5) * (variant % 2 ? -3 : 2) * depthScale;
  context.save(); context.globalAlpha = alpha; context.lineJoin = "round"; context.lineCap = "round";
  context.fillStyle = "rgba(19,15,12,.34)"; context.beginPath(); context.ellipse(x + 7 * depthScale, baseY + 5, fenceWidth * .56, 6.5 * depthScale, -.015, 0, Math.PI * 2); context.fill();
  if (variant % 3 === 0) {
    const postCount = Math.max(5, Math.round(span * 2.6));
    for (let post = 0; post < postCount; post += 1) {
      const progress = post / Math.max(1, postCount - 1);
      const postX = x - fenceWidth / 2 + progress * fenceWidth;
      const postBaseY = groundYAt(progress);
      const perspectiveScale = .82 + progress * .25;
      const lean = (SceneHash(worldX * 7 + post) - .5) * 7 * depthScale;
      const postHeight = fenceHeight * (.88 + SceneHash(worldX + post * 3) * .28) * perspectiveScale;
      const postWidth = 3.2 * depthScale * perspectiveScale;
      context.fillStyle = "#392b20";
      context.beginPath(); context.moveTo(postX - postWidth, postBaseY + 3); context.lineTo(postX + lean - postWidth * .7, postBaseY - postHeight + 3); context.lineTo(postX + lean, postBaseY - postHeight - 5); context.lineTo(postX + lean + postWidth * .75, postBaseY - postHeight + 3); context.lineTo(postX + postWidth, postBaseY + 3); context.closePath(); context.fill();
      context.strokeStyle = "#181511"; context.lineWidth = 1.15 * depthScale; context.stroke();
      context.strokeStyle = "rgba(183,139,79,.46)"; context.lineWidth = .75 * depthScale; context.beginPath(); context.moveTo(postX + lean - postWidth * .15, postBaseY - postHeight + 6); context.lineTo(postX - postWidth * .2, postBaseY - 2); context.stroke();
    }
    for (let rail = 0; rail < 5; rail += 1) {
      context.strokeStyle = "rgba(24,18,14,.88)"; context.lineWidth = (4.5 - rail * .16) * depthScale; context.beginPath();
      for (let sample = 0; sample <= 18; sample += 1) {
        const progress = sample / 18; const railX = x - fenceWidth / 2 + progress * fenceWidth; const railY = groundYAt(progress) - fenceHeight * (.18 + rail * .145) + Math.sin(progress * Math.PI * 5.5 + rail) * 2.3;
        sample ? context.lineTo(railX, railY) : context.moveTo(railX, railY);
      }
      context.stroke();
      context.strokeStyle = rail % 2 ? "#785b36" : "#685038"; context.lineWidth = 2.1 * depthScale; context.stroke();
    }
    for (let twig = 0; twig < postCount - 1; twig += 1) {
      const progress = (twig + .55) / postCount;
      const twigX = x - fenceWidth / 2 + progress * fenceWidth;
      const twigBaseY = groundYAt(progress);
      context.strokeStyle = "rgba(123,90,52,.75)"; context.lineWidth = 1.2 * depthScale;
      context.beginPath(); context.moveTo(twigX - 2, twigBaseY - fenceHeight * .12); context.quadraticCurveTo(twigX + (twig % 2 ? 5 : -5), twigBaseY - fenceHeight * .48, twigX, twigBaseY - fenceHeight * .76); context.stroke();
    }
  } else if (variant % 3 === 1) {
    const stoneRows = 4;
    for (let row = 0; row < stoneRows; row += 1) {
      const stones = 6 + row;
      const stoneWidth = fenceWidth / stones;
      for (let stone = 0; stone < stones; stone += 1) {
        const stagger = row % 2 ? stoneWidth * .42 : -.05 * stoneWidth;
        const stoneX = x - fenceWidth / 2 + stone * stoneWidth + stagger;
        const progress = Math.max(0, Math.min(1, (stoneX - (x - fenceWidth / 2)) / fenceWidth));
        const stoneY = groundYAt(progress) - row * fenceHeight / stoneRows;
        const topJitter = (SceneHash(stone + row * 17 + worldX) - .5) * 4 * depthScale;
        context.fillStyle = (stone + row) % 3 === 0 ? "#716452" : (stone + row) % 3 === 1 ? "#62594c" : "#7d6d56";
        context.beginPath(); context.moveTo(stoneX - 2, stoneY + 1); context.lineTo(stoneX + stoneWidth * .82, stoneY - 1); context.lineTo(stoneX + stoneWidth * .72, stoneY - fenceHeight / stoneRows + 3 + topJitter); context.lineTo(stoneX + 3, stoneY - fenceHeight / stoneRows + topJitter); context.closePath(); context.fill();
        context.strokeStyle = "rgba(28,23,18,.7)"; context.lineWidth = .9 * depthScale; context.stroke();
        if ((stone + row) % 2 === 0) {
          context.strokeStyle = "rgba(201,176,126,.2)"; context.lineWidth = .7;
          context.beginPath(); context.moveTo(stoneX + stoneWidth * .18, stoneY - 4); context.lineTo(stoneX + stoneWidth * .58, stoneY - fenceHeight / stoneRows + 7 + topJitter); context.stroke();
        }
      }
    }
    context.strokeStyle = "#2f2922"; context.lineWidth = 3.4 * depthScale; context.beginPath(); context.moveTo(x - fenceWidth * .52, baseY - fenceHeight + 2); context.quadraticCurveTo(x, baseY - fenceHeight - 4, x + fenceWidth * .52, baseY - fenceHeight + 4); context.stroke();
  } else {
    const posts = [-.5, -.16, .18, .5];
    context.strokeStyle = "#211812"; context.lineCap = "round";
    posts.forEach((offset, index) => {
      const progress = offset + .5; const postX = x + offset * fenceWidth; const postBaseY = groundYAt(progress);
      context.lineWidth = (index === 0 || index === posts.length - 1 ? 8.2 : 6.2) * depthScale; context.beginPath(); context.moveTo(postX, postBaseY + 3); context.lineTo(postX + (index % 2 ? 2 : -2), postBaseY - fenceHeight); context.stroke();
      context.strokeStyle = "#67472d"; context.lineWidth -= 3 * depthScale; context.stroke(); context.strokeStyle = "#211812";
    });
    [0.27, .72].forEach((heightProgress, railIndex) => {
      context.strokeStyle = "#251a12"; context.lineWidth = 8 * depthScale; context.beginPath(); context.moveTo(x - fenceWidth * .52, baseY - fenceHeight * heightProgress); context.lineTo(x + fenceWidth * .52, baseY - fenceHeight * heightProgress - 4); context.stroke();
      context.strokeStyle = railIndex ? "#765536" : "#65452c"; context.lineWidth = 4.5 * depthScale; context.stroke();
    });
    context.strokeStyle = "#3a2719"; context.lineWidth = 6 * depthScale; context.beginPath(); context.moveTo(x - fenceWidth * .45, baseY - fenceHeight * .12); context.lineTo(x + fenceWidth * .42, baseY - fenceHeight * .88); context.stroke();
    context.strokeStyle = "#8a633c"; context.lineWidth = 3 * depthScale; context.stroke();
    context.strokeStyle = "#b18a57"; context.lineWidth = 1.5; posts.forEach((offset) => { const postX = x + offset * fenceWidth; context.beginPath(); context.arc(postX, baseY - fenceHeight * .69, 4.5 * depthScale, 0, Math.PI * 2); context.stroke(); });
  }
  context.restore();
}

function DrawInkWheel(centerX, centerY, radius, squash = 1, spokes = 12, accent = "#9a7447") {
  context.save(); context.translate(centerX, centerY); context.scale(1, squash);
  context.strokeStyle = "#171411"; context.lineWidth = Math.max(4, radius * .2); context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.stroke();
  context.strokeStyle = accent; context.lineWidth = Math.max(2, radius * .1); context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.stroke();
  context.strokeStyle = "rgba(40,29,20,.95)"; context.lineWidth = Math.max(1.1, radius * .055);
  for (let spoke = 0; spoke < spokes; spoke += 1) {
    const angle = spoke / spokes * Math.PI * 2;
    context.beginPath(); context.moveTo(Math.cos(angle) * radius * .16, Math.sin(angle) * radius * .16); context.lineTo(Math.cos(angle) * radius * .82, Math.sin(angle) * radius * .82); context.stroke();
  }
  context.fillStyle = "#2b2119"; context.beginPath(); context.arc(0, 0, radius * .2, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#bd9560"; context.beginPath(); context.arc(-radius * .035, -radius * .04, radius * .075, 0, Math.PI * 2); context.fill();
  context.restore();
}

function DrawDetailedHaystack(hayWidth, hayHeight, active = false, variant = 0) {
  const fill = active ? "#9a7a43" : "#80663b";
  context.fillStyle = "rgba(18,14,11,.34)"; context.beginPath(); context.ellipse(5, 4, hayWidth * .58, Math.max(5, hayHeight * .09), 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = fill; context.strokeStyle = "#241b13"; context.lineWidth = Math.max(2, hayWidth * .025); context.lineJoin = "round";
  context.beginPath();
  context.moveTo(-hayWidth * .53, 0);
  context.quadraticCurveTo(-hayWidth * .55, -hayHeight * .32, -hayWidth * .33, -hayHeight * .67);
  context.quadraticCurveTo(-hayWidth * .19, -hayHeight * .91, -hayWidth * .03, -hayHeight);
  context.quadraticCurveTo(hayWidth * .2, -hayHeight * .91, hayWidth * .37, -hayHeight * .62);
  context.quadraticCurveTo(hayWidth * .56, -hayHeight * .3, hayWidth * .51, 0);
  context.quadraticCurveTo(0, hayHeight * .08, -hayWidth * .53, 0);
  context.closePath(); context.fill(); context.stroke();

  context.strokeStyle = "rgba(223,180,91,.72)"; context.lineWidth = Math.max(.85, hayWidth * .009); context.lineCap = "round";
  const strawCount = Math.max(18, Math.round(hayWidth * .28));
  for (let straw = 0; straw < strawCount; straw += 1) {
    const progress = straw / Math.max(1, strawCount - 1);
    const baseX = Lerp(-hayWidth * .48, hayWidth * .48, progress);
    const centerPull = 1 - Math.abs(progress - .5) * 1.55;
    const topY = -hayHeight * (.35 + Math.max(0, centerPull) * .58 + SceneHash(straw + variant * 29) * .12);
    const lean = (progress - .5) * hayWidth * .2 + (SceneHash(straw + 91) - .5) * hayWidth * .1;
    context.beginPath(); context.moveTo(baseX, -2 - SceneHash(straw + 18) * 5); context.quadraticCurveTo(baseX - lean * .25, topY * .55, baseX + lean, topY); context.stroke();
  }
  context.strokeStyle = "rgba(54,38,23,.62)"; context.lineWidth = Math.max(1, hayWidth * .013);
  for (let layer = 0; layer < 4; layer += 1) {
    const y = -hayHeight * (.18 + layer * .17);
    context.beginPath(); context.moveTo(-hayWidth * (.48 - layer * .06), y); context.quadraticCurveTo(0, y + hayHeight * .06, hayWidth * (.47 - layer * .05), y - hayHeight * .02); context.stroke();
  }
  context.strokeStyle = "#a74536"; context.lineWidth = Math.max(2, hayWidth * .024);
  context.beginPath(); context.moveTo(-hayWidth * .43, -hayHeight * .43); context.quadraticCurveTo(0, -hayHeight * .37, hayWidth * .43, -hayHeight * .44); context.stroke();
  context.strokeStyle = "rgba(231,189,102,.7)"; context.lineWidth = 1;
  [-.42, -.28, .34, .49].forEach((offset, index) => {
    context.beginPath(); context.moveTo(hayWidth * offset, 1); context.lineTo(hayWidth * (offset + (index % 2 ? .12 : -.09)), 8 + index % 2 * 3); context.stroke();
  });
}

function DrawDetailedCart(cartWidth, cartHeight, active = false, variant = 0) {
  const wheelRadius = cartHeight * .27;
  const bodyTop = -cartHeight * .82;
  const bodyBottom = -cartHeight * .33;
  context.fillStyle = "rgba(17,13,10,.4)"; context.beginPath(); context.ellipse(7, 5, cartWidth * .62, 8, -.02, 0, Math.PI * 2); context.fill();
  context.strokeStyle = "#20160f"; context.lineWidth = Math.max(5, cartHeight * .065); context.lineCap = "round";
  context.beginPath(); context.moveTo(cartWidth * .3, bodyBottom + 3); context.lineTo(cartWidth * .76, 4); context.moveTo(cartWidth * .3, bodyBottom - 5); context.lineTo(cartWidth * .82, -4); context.stroke();
  context.strokeStyle = "#795232"; context.lineWidth = Math.max(2.5, cartHeight * .032); context.stroke();

  DrawInkWheel(-cartWidth * .31 + 5, -wheelRadius * .08, wheelRadius * .9, .91, 12, "#7f5c37");
  DrawInkWheel(cartWidth * .25, 0, wheelRadius, .95, 14, "#936b3f");
  context.strokeStyle = "#241a12"; context.lineWidth = Math.max(4, cartHeight * .055); context.beginPath(); context.moveTo(-cartWidth * .36, -wheelRadius * .08); context.lineTo(cartWidth * .3, 0); context.stroke();
  context.fillStyle = active ? "#715034" : "#60452f"; context.strokeStyle = "#201711"; context.lineWidth = Math.max(2, cartHeight * .034);
  context.beginPath(); context.moveTo(-cartWidth * .52, bodyTop); context.lineTo(cartWidth * .39, bodyTop + cartHeight * .055); context.lineTo(cartWidth * .31, bodyBottom); context.lineTo(-cartWidth * .44, bodyBottom - cartHeight * .035); context.closePath(); context.fill(); context.stroke();
  context.fillStyle = active ? "#876241" : "#765437";
  context.beginPath(); context.moveTo(-cartWidth * .52, bodyTop); context.lineTo(cartWidth * .39, bodyTop + cartHeight * .055); context.lineTo(cartWidth * .47, bodyTop - cartHeight * .12); context.lineTo(-cartWidth * .42, bodyTop - cartHeight * .16); context.closePath(); context.fill(); context.stroke();
  context.strokeStyle = "rgba(193,144,79,.5)"; context.lineWidth = Math.max(1, cartHeight * .014);
  for (let plank = 0; plank < 5; plank += 1) {
    const progress = (plank + 1) / 6;
    const plankX = Lerp(-cartWidth * .44, cartWidth * .31, progress);
    context.beginPath(); context.moveTo(plankX, bodyTop + 3); context.lineTo(plankX - cartWidth * .025, bodyBottom - 3); context.stroke();
  }
  context.strokeStyle = "rgba(41,29,20,.62)"; context.lineWidth = 1.1;
  for (let grain = 0; grain < 6; grain += 1) {
    const grainY = Lerp(bodyTop + 7, bodyBottom - 4, grain / 6);
    context.beginPath(); context.moveTo(-cartWidth * .4, grainY); context.quadraticCurveTo(0, grainY + (grain % 2 ? 4 : -3), cartWidth * .28, grainY + 1); context.stroke();
  }
}

function DrawVillageWorkProp(worldX, width, baseY, parallax, kind, variant = 0) {
  const x = LayerToScreen(worldX, width, parallax);
  const scale = (.62 + parallax * .52) * Math.max(.7, Math.min(1.12, width / 1100)) * state.camera.zoom;
  context.save(); context.translate(x, baseY); context.scale(scale, scale);
  context.fillStyle = "rgba(10,11,10,.32)"; context.beginPath(); context.ellipse(3, 4, kind === "dryingRack" ? 45 : kind === "strawStack" ? 37 : 31, 6.5, 0, 0, Math.PI * 2); context.fill();
  if (kind === "wheelbarrow") {
    context.strokeStyle = "#21170f"; context.lineWidth = 5; context.lineCap = "round";
    context.beginPath(); context.moveTo(6, -12); context.lineTo(43, 4); context.moveTo(4, -17); context.lineTo(43, -1); context.stroke();
    context.strokeStyle = "#825936"; context.lineWidth = 2.5; context.stroke();
    context.strokeStyle = "#2c2017"; context.lineWidth = 4; context.beginPath(); context.moveTo(1, -7); context.lineTo(9, 4); context.moveTo(16, -9); context.lineTo(23, 3); context.stroke();
    context.fillStyle = "#67482f"; context.strokeStyle = "#211711"; context.lineWidth = 2.2;
    context.beginPath(); context.moveTo(-25, -31); context.lineTo(20, -28); context.lineTo(13, -8); context.lineTo(-18, -10); context.closePath(); context.fill(); context.stroke();
    context.fillStyle = "#7f5c3a"; context.beginPath(); context.moveTo(-25, -31); context.lineTo(20, -28); context.lineTo(27, -35); context.lineTo(-15, -39); context.closePath(); context.fill(); context.stroke();
    context.strokeStyle = "rgba(201,153,87,.5)"; context.lineWidth = 1.2;
    [-12, 0, 12].forEach((plankX) => { context.beginPath(); context.moveTo(plankX, -31); context.lineTo(plankX - 3, -11); context.stroke(); });
    DrawInkWheel(-20, -1, 12, .96, 12, "#966c40");
    context.strokeStyle = "#2b1e15"; context.lineWidth = 4; context.beginPath(); context.moveTo(-18, -10); context.lineTo(-20, -1); context.stroke();
  } else if (kind === "firewood") {
    for (let log = 0; log < 10; log += 1) {
      const row = Math.floor(log / 4); const column = log % 4; const logX = (column - 1.5) * 12 + (row % 2) * 5; const logY = -5 - row * 9; const logLength = 19 + SceneHash(log + variant * 9) * 8;
      context.fillStyle = log % 2 ? "#705034" : "#845e39"; context.strokeStyle = "#2c2118"; context.lineWidth = 1.4;
      context.beginPath(); context.roundRect(logX - logLength * .5, logY - 6, logLength, 7, 2); context.fill(); context.stroke();
      context.fillStyle = "#b18754"; context.beginPath(); context.ellipse(logX + logLength * .5, logY - 2.5, 3.4, 3, 0, 0, Math.PI * 2); context.fill(); context.stroke();
      context.strokeStyle = "#5b4028"; context.lineWidth = .8; context.beginPath(); context.arc(logX + logLength * .5, logY - 2.5, 1.5, 0, Math.PI * 1.65); context.stroke();
    }
    context.strokeStyle = "#4b392a"; context.lineWidth = 3; context.beginPath(); context.moveTo(-24, 0); context.lineTo(-18, -30); context.moveTo(25, 0); context.lineTo(18, -30); context.stroke();
    context.strokeStyle = "#a74536"; context.lineWidth = 2; context.beginPath(); context.moveTo(-18, -15); context.lineTo(21, -11); context.stroke();
  } else if (kind === "dryingRack") {
    context.strokeStyle = "#241a12"; context.lineWidth = 8; context.beginPath(); context.moveTo(-34, 2); context.lineTo(-28, -58); context.moveTo(34, 2); context.lineTo(28, -58); context.moveTo(-37, -54); context.lineTo(38, -54); context.stroke();
    context.strokeStyle = "#755032"; context.lineWidth = 4.4; context.stroke();
    context.strokeStyle = "#b98d50"; context.lineWidth = 2; context.beginPath(); context.moveTo(-28, -49); context.quadraticCurveTo(0, -40, 28, -49); context.stroke();
    for (let bundle = 0; bundle < 6; bundle += 1) {
      const bundleX = -23 + bundle * 9; const bundleY = -44 + Math.sin(bundle) * 3;
      context.strokeStyle = variant % 2 ? "#a96a44" : "#c0964e"; context.lineWidth = 1.25;
      for (let stem = 0; stem < 7; stem += 1) { const stemOffset = (stem - 3) * 1.2; context.beginPath(); context.moveTo(bundleX, bundleY); context.quadraticCurveTo(bundleX + stemOffset * .4, bundleY + 9, bundleX + stemOffset, bundleY + 22 + stem % 2 * 3); context.stroke(); }
      context.strokeStyle = "#8d3e32"; context.lineWidth = 1.7; context.beginPath(); context.moveTo(bundleX - 4, bundleY + 5); context.lineTo(bundleX + 4, bundleY + 5); context.stroke();
    }
  } else if (kind === "plow") {
    context.strokeStyle = "#21170f"; context.lineWidth = 7; context.lineCap = "round"; context.beginPath(); context.moveTo(-31, -3); context.lineTo(11, -22); context.lineTo(31, -53); context.moveTo(11, -22); context.lineTo(37, -9); context.stroke();
    context.strokeStyle = "#775033"; context.lineWidth = 3.8; context.stroke();
    context.fillStyle = "#5f615a"; context.strokeStyle = "#242722"; context.lineWidth = 2; context.beginPath(); context.moveTo(-35, -5); context.quadraticCurveTo(-19, -18, -5, -16); context.lineTo(-1, -1); context.lineTo(-19, -5); context.closePath(); context.fill(); context.stroke();
    context.strokeStyle = "#b4b5a7"; context.lineWidth = 1; context.beginPath(); context.moveTo(-30, -7); context.lineTo(-6, -13); context.stroke();
  } else if (kind === "strawStack") {
    DrawDetailedHaystack(70, 54, false, variant);
  }
  context.restore();
}

function DrawVillageGroundEdge(width, surfaceY) {
  const edgePoints = [];
  for (let x = -24; x <= width + 24; x += 18) {
    const broadRise = Math.sin(x * .021 + .7) * 3.3;
    const smallRise = Math.sin(x * .063 + 2.1) * 1.8;
    const clodRise = (SceneHash(x + 761) - .5) * 8.5;
    edgePoints.push({ x, y: surfaceY - 4 + broadRise + smallRise + clodRise });
  }

  context.fillStyle = "#493b2d";
  context.beginPath(); context.moveTo(-24, surfaceY + 16);
  edgePoints.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(width + 24, surfaceY + 16); context.closePath(); context.fill();

  context.lineCap = "round"; context.lineJoin = "round";
  for (let segment = 0; segment < edgePoints.length - 2; segment += 1) {
    if (SceneHash(segment + 919) < .28) continue;
    const point = edgePoints[segment];
    const next = edgePoints[segment + 1];
    context.strokeStyle = segment % 3 === 0 ? "rgba(229,181,106,.4)" : "rgba(183,132,76,.28)";
    context.lineWidth = segment % 4 === 0 ? 2.4 : 1.35;
    context.beginPath(); context.moveTo(point.x + 2, point.y); context.quadraticCurveTo((point.x + next.x) * .5, Math.min(point.y, next.y) - 1.5, next.x - 2, next.y); context.stroke();
  }

  for (let clod = 0; clod < Math.max(20, Math.round(width / 42)); clod += 1) {
    const x = SceneHash(clod + 941) * width;
    const y = surfaceY + 1 + SceneHash(clod + 967) * 9;
    const radiusX = 4 + SceneHash(clod + 983) * 10;
    const radiusY = 1.8 + SceneHash(clod + 997) * 3.4;
    context.fillStyle = clod % 3 ? "rgba(42,29,21,.42)" : "rgba(110,76,46,.4)";
    context.beginPath(); context.ellipse(x, y, radiusX, radiusY, (SceneHash(clod + 1013) - .5) * .35, 0, Math.PI * 2); context.fill();
    if (clod % 2 === 0) {
      context.strokeStyle = "rgba(210,156,91,.32)"; context.lineWidth = 1;
      context.beginPath(); context.moveTo(x - radiusX * .58, y - 1); context.lineTo(x + radiusX * .42, y + radiusY * .18); context.stroke();
    }
  }
}

function DrawVillage(width, height, surfaceY) {
  DrawFieldDepth(width, surfaceY);
  DrawVillageGroundEdge(width, surfaceY);

  const rearHouses = [-18, -12.8, -7.6, -2.4, 2.8, 8.1, 13.4, 18.7];
  rearHouses.forEach((worldX, index) => DrawPerspectiveHouse(worldX, width, surfaceY - 34 - index % 2 * 4, 31 + index % 4 * 4, .46, index, .18));

  context.save();
  for (let worldX = -19; worldX <= 19; worldX += 1.65) {
    const x = LayerToScreen(worldX, width, .58);
    const baseY = surfaceY - 19 + Math.sin(worldX * .8) * 3;
    const heightScale = 17 + SceneHash(worldX + 70) * 22;
    context.fillStyle = "rgba(45,55,39,.28)"; context.beginPath(); context.ellipse(x, baseY - heightScale * .55, 8 + heightScale * .18, heightScale * .55, worldX % 2 ? .14 : -.14, 0, Math.PI * 2); context.fill();
    context.strokeStyle = "rgba(72,61,42,.2)"; context.lineWidth = 1; context.beginPath(); context.moveTo(x, baseY); context.lineTo(x + Math.sin(worldX) * 3, baseY - heightScale); context.stroke();
  }
  context.restore();

  const middleHouses = [-12.6, -7.7, -2.4, 2.9, 8.1, 13.4];
  middleHouses.forEach((worldX, index) => DrawPerspectiveHouse(worldX, width, surfaceY - 10 - index % 2 * 3, 49 + index % 3 * 7, .7, index + 20, .42));

  [
    { x: -14.8, span: 3.2, parallax: .65, variant: 0 }, { x: -7.8, span: 2.4, parallax: .7, variant: 2 },
    { x: -.8, span: 3, parallax: .67, variant: 1 }, { x: 6.2, span: 2.7, parallax: .72, variant: 0 },
    { x: 13.2, span: 3.1, parallax: .66, variant: 1 }
  ].forEach((fence, index) => DrawVillageFenceSegment(fence.x, width, surfaceY - 8 - index % 2 * 4, fence.span, fence.parallax, fence.variant, .34));

  const mainHouses = [-9, -5.2, -.2, 4.4, 8.3];
  mainHouses.forEach((worldX, index) => DrawPerspectiveHouse(worldX, width, surfaceY - 3, 66 + index % 2 * 12, .82, index + 40, .94));

  [
    { x: -12.1, kind: "firewood", parallax: .82 }, { x: -7.2, kind: "wheelbarrow", parallax: .86 },
    { x: -2.3, kind: "dryingRack", parallax: .79 }, { x: 3.2, kind: "plow", parallax: .85 },
    { x: 9.2, kind: "strawStack", parallax: .8 }
  ].forEach((prop, index) => DrawVillageWorkProp(prop.x, width, surfaceY - 3, prop.parallax, prop.kind, index));
}

function DrawRoofTiles(leftWorld, ridgeWorld, rightWorld, width, surfaceY, tone) {
  const leftX = WorldToScreen(leftWorld, width);
  const ridgeX = WorldToScreen(ridgeWorld, width);
  const rightX = WorldToScreen(rightWorld, width);
  const leftY = RoofFloorYAt(leftWorld, surfaceY);
  const ridgeY = RoofFloorYAt(ridgeWorld, surfaceY);
  const rightY = RoofFloorYAt(rightWorld, surfaceY);
  context.fillStyle = "rgba(28,22,18,.56)";
  context.beginPath(); context.moveTo(leftX, leftY + 8); context.lineTo(ridgeX, ridgeY + 8); context.lineTo(rightX, rightY + 8); context.lineTo(rightX, rightY + 20); context.lineTo(ridgeX, ridgeY + 18); context.lineTo(leftX, leftY + 20); context.closePath(); context.fill();
  context.fillStyle = tone; context.strokeStyle = "#2a211a"; context.lineWidth = 3;
  context.beginPath(); context.moveTo(leftX, leftY); context.lineTo(ridgeX, ridgeY); context.lineTo(rightX, rightY); context.lineTo(rightX, rightY + 10); context.lineTo(ridgeX, ridgeY + 10); context.lineTo(leftX, leftY + 10); context.closePath(); context.fill(); context.stroke();
  context.save(); context.globalAlpha = .55; context.strokeStyle = "#c09058"; context.lineWidth = 1;
  const tileCount = Math.max(8, Math.round((rightX - leftX) / 28));
  for (let tile = 1; tile < tileCount; tile += 1) {
    const t = tile / tileCount;
    const onLeft = t < (ridgeX - leftX) / Math.max(1, rightX - leftX);
    const local = onLeft ? t / ((ridgeX - leftX) / Math.max(1, rightX - leftX)) : (t - (ridgeX - leftX) / Math.max(1, rightX - leftX)) / (1 - (ridgeX - leftX) / Math.max(1, rightX - leftX));
    const x = onLeft ? Lerp(leftX, ridgeX, local) : Lerp(ridgeX, rightX, local);
    const y = onLeft ? Lerp(leftY, ridgeY, local) : Lerp(ridgeY, rightY, local);
    context.beginPath(); context.moveTo(x, y + 1); context.lineTo(x - (onLeft ? 7 : -7), y + 10); context.stroke();
  }
  context.restore();
}

function DrawCombatArchitecture(width, height, surfaceY, tunnelY) {
  const westLeft = WorldToScreen(-9.45, width);
  const westRight = WorldToScreen(1.85, width);
  const eastLeft = WorldToScreen(2.55, width);
  const eastRight = WorldToScreen(9.95, width);
  const wallTop = surfaceY - 128;
  context.save();
  context.fillStyle = "rgba(119,82,52,.94)"; context.strokeStyle = "#2f241c"; context.lineWidth = 3;
  context.fillRect(westLeft, wallTop, westRight - westLeft, surfaceY - wallTop);
  context.strokeRect(westLeft, wallTop, westRight - westLeft, surfaceY - wallTop);
  context.fillStyle = "rgba(189,151,99,.36)";
  context.fillRect(westLeft + 6, wallTop + 8, westRight - westLeft - 12, surfaceY - wallTop - 14);
  context.fillStyle = "rgba(104,71,47,.96)"; context.fillRect(eastLeft, surfaceY - 118, eastRight - eastLeft, 118);
  context.strokeRect(eastLeft, surfaceY - 118, eastRight - eastLeft, 118);
  context.fillStyle = "rgba(180,139,91,.3)"; context.fillRect(eastLeft + 6, surfaceY - 110, eastRight - eastLeft - 12, 104);

  context.strokeStyle = "rgba(54,39,28,.88)"; context.lineWidth = 8;
  [-7.2, -2.3, 1.15, 5.0, 9.1].forEach((worldX) => {
    const x = WorldToScreen(worldX, width); const top = worldX < 2 ? wallTop + 4 : surfaceY - 114;
    context.beginPath(); context.moveTo(x, top); context.lineTo(x, surfaceY); context.stroke();
  });
  context.strokeStyle = "rgba(209,168,108,.55)"; context.lineWidth = 2;
  [-7.2, -2.3, 1.15, 5.0, 9.1].forEach((worldX) => {
    const x = WorldToScreen(worldX, width); const top = worldX < 2 ? wallTop + 4 : surfaceY - 114;
    context.beginPath(); context.moveTo(x + 2, top); context.lineTo(x + 2, surfaceY); context.stroke();
  });
  context.fillStyle = "#4e3424"; context.fillRect(westLeft, surfaceY - 8, westRight - westLeft, 10); context.fillRect(eastLeft, surfaceY - 8, eastRight - eastLeft, 10);

  const windowXs = [-4.35, 3.9, 7.6];
  windowXs.forEach((worldX, index) => {
    const x = WorldToScreen(worldX, width); const y = surfaceY - 88 + (index % 2) * 4;
    context.fillStyle = "#243337"; context.fillRect(x - 20, y, 40, 44);
    context.strokeStyle = "#b18a57"; context.lineWidth = 4; context.strokeRect(x - 20, y, 40, 44);
    context.lineWidth = 2; context.beginPath(); context.moveTo(x, y + 2); context.lineTo(x, y + 42); context.moveTo(x - 18, y + 22); context.lineTo(x + 18, y + 22); context.stroke();
  });
  context.fillStyle = "#6c4b31"; context.strokeStyle = "#2c2119"; context.lineWidth = 2;
  const tableX = WorldToScreen(-3.65, width); context.fillRect(tableX - 35, surfaceY - 34, 70, 7); context.fillRect(tableX - 28, surfaceY - 28, 7, 28); context.fillRect(tableX + 21, surfaceY - 28, 7, 28); context.strokeRect(tableX - 35, surfaceY - 34, 70, 7);
  const bedX = WorldToScreen(-.45, width); context.fillStyle = "#76583a"; context.fillRect(bedX - 40, surfaceY - 25, 80, 23); context.fillStyle = "#a89669"; context.fillRect(bedX - 35, surfaceY - 22, 55, 12);

  DrawRoofTiles(-9.45, -3.75, 1.85, width, surfaceY, "#63543d");
  DrawRoofTiles(2.55, 6.15, 9.95, width, surfaceY, "#574d3b");
  DrawCombatBlastDamage(width, height, surfaceY, tunnelY);
  const bridgeLeft = WorldToScreen(1.72, width); const bridgeRight = WorldToScreen(2.72, width); const bridgeY = surfaceY - 126;
  context.fillStyle = "#725036"; context.strokeStyle = "#2a2019"; context.lineWidth = 3; context.fillRect(bridgeLeft, bridgeY, bridgeRight - bridgeLeft, 12); context.strokeRect(bridgeLeft, bridgeY, bridgeRight - bridgeLeft, 12);
  context.strokeStyle = "rgba(214,169,100,.52)"; context.lineWidth = 1.4;
  for (let x = bridgeLeft + 9; x < bridgeRight; x += 13) { context.beginPath(); context.moveTo(x, bridgeY + 1); context.lineTo(x, bridgeY + 11); context.stroke(); }

  context.fillStyle = "rgba(24,20,17,.84)"; context.font = '800 9px "FangSong", serif'; context.textAlign = "left";
  context.fillText("西屋内室", westLeft + 12, surfaceY - 102); context.fillText("东厢屋", eastLeft + 12, surfaceY - 92);
  context.fillStyle = "rgba(230,207,158,.7)"; context.fillText("瓦面通路", WorldToScreen(-8.95, width), RoofFloorYAt(-8.95, surfaceY) - 16);
  context.restore();
}

function DrawCombatCovers(width, height, surfaceY, tunnelY, front) {
  if (state.levelIndex !== 3) return;
  const covers = GetSurfaceCovers().filter((cover) => cover.layer !== "surface");
  covers.forEach((cover) => {
    const shouldFront = ["ridge", "parapet", "hay"].includes(cover.kind);
    if (shouldFront !== front) return;
    const x = WorldToScreen(cover.x, width);
    const baseY = LayerBaseY(cover.layer, cover.x, height, surfaceY, tunnelY);
    const active = state.player.coverId === cover.id;
    const blasted = state.combat.blastScars.some((scar) => scar.layer === cover.layer && Math.abs(scar.x - cover.x) <= .9);
    const mobileFront = width <= 640 && front;
    context.save(); context.translate(x, baseY);
    if (front && active) context.globalAlpha = 1 - .78 * state.player.coverBlend;
    context.shadowColor = "rgba(14,10,8,.42)"; context.shadowBlur = active ? 9 : 3;
    if (cover.kind === "chimney") {
      context.fillStyle = active ? "#8c5d3f" : "#6d4935"; context.strokeStyle = "#291f19"; context.lineWidth = 3;
      if (blasted) {
        context.beginPath(); context.moveTo(-18, 4); context.lineTo(-18, -29); context.lineTo(-11, -36); context.lineTo(-3, -27); context.lineTo(5, -41); context.lineTo(12, -25); context.lineTo(18, -31); context.lineTo(18, 4); context.closePath(); context.fill(); context.stroke();
        context.fillStyle = "#211b17"; context.beginPath(); context.ellipse(1, -28, 16, 7, -.12, 0, Math.PI * 2); context.fill();
        context.strokeStyle = "rgba(211,159,94,.45)"; context.lineWidth = 1.3; context.beginPath(); context.moveTo(-16, -13); context.lineTo(16, -13); context.stroke();
        [[-29, -2, -.24], [28, 1, .18], [18, -11, -.1]].forEach(([brickX, brickY, rotation]) => { context.save(); context.translate(brickX, brickY); context.rotate(rotation); context.fillStyle = "#7d5138"; context.strokeStyle = "#2b211b"; context.fillRect(-8, -4, 16, 8); context.strokeRect(-8, -4, 16, 8); context.restore(); });
      } else {
        context.fillRect(-18, -58, 36, 62); context.strokeRect(-18, -58, 36, 62);
        context.strokeStyle = "rgba(211,159,94,.45)"; context.lineWidth = 1.3; for (let y = -49; y < -4; y += 12) { context.beginPath(); context.moveTo(-16, y); context.lineTo(16, y); context.stroke(); }
        context.fillStyle = "#2b2620"; context.fillRect(-22, -64, 44, 8);
      }
    } else if (cover.kind === "ridge") {
      context.fillStyle = active ? "#897051" : "#65543f"; context.strokeStyle = "#2b211a"; context.lineWidth = 3;
      const ridgeScale = mobileFront ? .7 : 1;
      [-34, 0, 34].forEach((offset, index) => { context.beginPath(); context.ellipse(offset * ridgeScale, (-9 - (index % 2) * 4) * ridgeScale, 27 * ridgeScale, 15 * ridgeScale, -.06, 0, Math.PI * 2); context.fill(); context.stroke(); });
    } else if (cover.kind === "parapet") {
      const parapetTop = mobileFront ? -22 : -31;
      context.fillStyle = active ? "#8a6547" : "#684b36"; context.strokeStyle = "#2d2119"; context.lineWidth = 3; context.fillRect(-35, parapetTop, 70, 4 - parapetTop); context.strokeRect(-35, parapetTop, 70, 4 - parapetTop);
      context.strokeStyle = "rgba(211,165,99,.44)"; context.lineWidth = 1.5; context.beginPath(); context.moveTo(-33, (parapetTop + 4) * .5); context.lineTo(33, (parapetTop + 4) * .5); context.moveTo(0, parapetTop + 2); context.lineTo(0, 1); context.stroke();
    } else if (cover.kind === "hay") {
      DrawDetailedHaystack(mobileFront ? 70 : 86, mobileFront ? 39 : 58, active, 7);
    } else if (cover.kind === "stove") {
      context.fillStyle = active ? "#896044" : "#6c4a36"; context.strokeStyle = "#2b2019"; context.lineWidth = 3; context.fillRect(-34, -42, 68, 45); context.strokeRect(-34, -42, 68, 45); context.fillStyle = "#251d19"; context.beginPath(); context.arc(4, -19, 11, 0, Math.PI * 2); context.fill();
    } else {
      context.fillStyle = active ? "#8b6849" : "#694d39"; context.strokeStyle = "#2c211b"; context.lineWidth = 3; context.fillRect(-42, -44, 84, 47); context.strokeRect(-42, -44, 84, 47);
    }
    if (active) { context.strokeStyle = "rgba(226,201,145,.72)"; context.lineWidth = 2; context.beginPath(); context.moveTo(-31, 9); context.lineTo(31, 9); context.stroke(); }
    context.restore();
  });
}

function DrawCombatBlastDamage(width, height, surfaceY, tunnelY) {
  if (state.levelIndex !== 3 || !state.combat?.blastScars.length) return;
  state.combat.blastScars.forEach((scar, scarIndex) => {
    const x = WorldToScreen(scar.x, width);
    const baseY = LayerBaseY(scar.layer, scar.x, height, surfaceY, tunnelY);
    context.save(); context.translate(x, baseY - 1);
    context.fillStyle = "rgba(24,19,16,.94)"; context.strokeStyle = "rgba(212,155,83,.72)"; context.lineWidth = 2;
    context.beginPath();
    for (let point = 0; point < 14; point += 1) {
      const angle = point / 14 * Math.PI * 2;
      const radius = point % 2 ? 22 + SceneHash(point + scarIndex * 17) * 8 : 12 + SceneHash(point + scarIndex * 23) * 5;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius * .34;
      if (!point) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath(); context.fill(); context.stroke();
    context.strokeStyle = "rgba(39,28,20,.9)"; context.lineWidth = 4;
    [-1, 1].forEach((side) => { context.beginPath(); context.moveTo(side * 7, -2); context.lineTo(side * 22, 10); context.lineTo(side * 34, 7); context.stroke(); });
    context.strokeStyle = "rgba(225,176,98,.58)"; context.lineWidth = 1.4;
    for (let shard = 0; shard < 6; shard += 1) {
      const side = shard % 2 ? 1 : -1;
      const shardX = side * (24 + shard * 5);
      context.beginPath(); context.moveTo(shardX - 6, 4 + shard % 3 * 3); context.lineTo(shardX + 5, 1 + shard % 2 * 5); context.lineTo(shardX + 1, 9); context.stroke();
    }
    context.restore();
  });
}

function DrawSurfaceDepthVeil(width, height, surfaceY, daylight) {
  context.save();
  const farHaze = context.createLinearGradient(0, surfaceY * .32, 0, surfaceY * .8);
  farHaze.addColorStop(0, daylight > .4 ? "rgba(192,197,190,.16)" : "rgba(111,128,130,.19)");
  farHaze.addColorStop(.56, daylight > .4 ? "rgba(180,176,157,.12)" : "rgba(119,124,119,.12)");
  farHaze.addColorStop(1, "rgba(137,118,91,0)");
  context.fillStyle = farHaze;
  context.fillRect(0, surfaceY * .28, width, surfaceY * .56);

  const horizonHaze = context.createLinearGradient(0, surfaceY * .56, 0, surfaceY + 12);
  horizonHaze.addColorStop(0, "rgba(206,203,188,0)");
  horizonHaze.addColorStop(.43, daylight > .4 ? "rgba(210,195,161,.13)" : "rgba(132,132,119,.1)");
  horizonHaze.addColorStop(.72, daylight > .4 ? "rgba(151,131,101,.065)" : "rgba(99,91,79,.055)");
  horizonHaze.addColorStop(1, "rgba(31,34,29,.025)");
  context.fillStyle = horizonHaze;
  context.fillRect(0, surfaceY * .5, width, surfaceY * .54);
  const dustOffset = state.camera.x * width * .01;
  for (let mote = 0; mote < 8; mote += 1) {
    const x = (SceneHash(mote + 201) * width - dustOffset + width) % width;
    const y = surfaceY * (.32 + SceneHash(mote + 230) * .61);
    const drift = Math.sin(state.elapsed * (.18 + SceneHash(mote + 250) * .2) + mote) * 8;
    context.fillStyle = `rgba(224,196,137,${.018 + SceneHash(mote + 280) * .026})`;
    context.beginPath(); context.arc(x + drift, y, .8 + SceneHash(mote + 300) * 1.25, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}

function DrawSurfaceCovers(width, surfaceY, front) {
  const sceneScale = Math.min(width, 1100) / 1100;
  const unit = width / (22 / state.camera.zoom);
  const verticalScale = Math.max(.52, Math.min(1.22, unit / 50));
  const activeId = state.player.layer === "surface" ? state.player.coverId : null;
  for (const cover of GetSurfaceCovers().filter((item) => (item.layer || "surface") === "surface")) {
    const x = WorldToScreen(cover.x, width);
    const coverWidth = Math.max(44, cover.width * unit);
    const baseHeight = ({ brush: 82, hay: 84, wall: 78, cart: 88, well: 78 })[cover.kind] * verticalScale;
    const active = activeId === cover.id;
    context.save();
    context.translate(x, surfaceY - 3);
    if (front && active) context.globalAlpha = 1 - .78 * state.player.coverBlend;

    if (front) {
      const shadowWidth = cover.kind === "cart" ? coverWidth * .67 : cover.kind === "hay" ? coverWidth * .6 : coverWidth * .55;
      const shadowTilt = cover.kind === "cart" ? -.035 : (SceneHash(cover.x + 1103) - .5) * .08;
      context.fillStyle = "rgba(15,10,8,.5)";
      context.beginPath(); context.ellipse(4, 6, shadowWidth, Math.max(6, baseHeight * .085), shadowTilt, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "rgba(190,126,68,.3)"; context.lineWidth = Math.max(1, 1.35 * sceneScale);
      context.beginPath(); context.ellipse(4, 5, shadowWidth * .94, Math.max(4, baseHeight * .055), shadowTilt, Math.PI * .06, Math.PI * .92); context.stroke();
    }

    if (!front) {
      context.fillStyle = "rgba(8,12,12,.32)";
      context.beginPath(); context.ellipse(0, 5, coverWidth * .56, 7 * sceneScale, 0, 0, Math.PI * 2); context.fill();
      if (cover.kind === "brush") {
        context.fillStyle = "#394333";
        [-.34, -.12, .12, .34].forEach((offset, index) => {
          context.beginPath(); context.ellipse(coverWidth * offset, -baseHeight * (.38 + (index % 2) * .12), coverWidth * .3, baseHeight * .46, index % 2 ? .22 : -.18, 0, Math.PI * 2); context.fill();
        });
      } else if (cover.kind === "hay") {
        context.fillStyle = "rgba(88,70,40,.84)";
        context.beginPath(); context.moveTo(-coverWidth * .53, 0); context.quadraticCurveTo(-coverWidth * .48, -baseHeight * .71, -coverWidth * .08, -baseHeight); context.quadraticCurveTo(coverWidth * .43, -baseHeight * .78, coverWidth * .53, 0); context.closePath(); context.fill();
      } else if (cover.kind === "cart") {
        context.fillStyle = "#5c432d"; context.beginPath(); context.moveTo(-coverWidth * .48, -baseHeight * .8); context.lineTo(coverWidth * .38, -baseHeight * .76); context.lineTo(coverWidth * .31, -baseHeight * .31); context.lineTo(-coverWidth * .4, -baseHeight * .34); context.closePath(); context.fill();
        context.strokeStyle = "#2c2118"; context.lineWidth = 5 * sceneScale; context.beginPath(); context.arc(-coverWidth * .26, -2, baseHeight * .24, 0, Math.PI * 2); context.arc(coverWidth * .26, 0, baseHeight * .26, 0, Math.PI * 2); context.stroke();
      } else if (cover.kind === "well") {
        context.strokeStyle = "#6b5236"; context.lineWidth = 7 * sceneScale;
        context.beginPath(); context.moveTo(-coverWidth * .34, -baseHeight * .98); context.lineTo(-coverWidth * .34, -baseHeight * .3); context.moveTo(coverWidth * .34, -baseHeight * .98); context.lineTo(coverWidth * .34, -baseHeight * .3); context.stroke();
        context.strokeStyle = "#927049"; context.lineWidth = 5 * sceneScale; context.beginPath(); context.moveTo(-coverWidth * .4, -baseHeight * .96); context.lineTo(coverWidth * .4, -baseHeight * .96); context.stroke();
      }
      context.restore();
      continue;
    }

    if (cover.kind === "brush") {
      context.fillStyle = active ? "#27362e" : "#303b30";
      for (let index = 0; index < 9; index += 1) {
        const offset = (index / 8 - .5) * coverWidth * .9;
        const rise = baseHeight * (.62 + (index * 17 % 31) / 100);
        context.beginPath(); context.ellipse(offset, -rise * .48, coverWidth * .18, rise * .52, index % 2 ? .22 : -.22, 0, Math.PI * 2); context.fill();
        context.strokeStyle = "#52604a"; context.lineWidth = Math.max(1.5, 2.2 * sceneScale);
        context.beginPath(); context.moveTo(offset, 1); context.quadraticCurveTo(offset + (index % 2 ? 8 : -7) * sceneScale, -rise * .52, offset + (index % 3 - 1) * 8 * sceneScale, -rise); context.stroke();
      }
    } else if (cover.kind === "hay") {
      DrawDetailedHaystack(coverWidth, baseHeight, active, cover.id.length);
    } else if (cover.kind === "wall") {
      context.fillStyle = active ? "#66543f" : "#5a4938";
      context.beginPath(); context.moveTo(-coverWidth * .52, 0); context.lineTo(-coverWidth * .52, -baseHeight * .68); context.lineTo(-coverWidth * .24, -baseHeight * .84); context.lineTo(0, -baseHeight * .7); context.lineTo(coverWidth * .23, -baseHeight * .92); context.lineTo(coverWidth * .52, -baseHeight * .72); context.lineTo(coverWidth * .52, 0); context.closePath(); context.fill();
      context.strokeStyle = "#2b2119"; context.lineWidth = Math.max(1.8, 2.4 * sceneScale); context.stroke();
      const brickRows = 4;
      for (let row = 0; row < brickRows; row += 1) {
        const rowY = -baseHeight * (.15 + row * .17);
        context.strokeStyle = "rgba(192,150,96,.42)"; context.lineWidth = Math.max(1, 1.35 * sceneScale); context.beginPath(); context.moveTo(-coverWidth * .48, rowY); context.lineTo(coverWidth * .46, rowY - (row % 2 ? 3 : -1)); context.stroke();
        for (let seam = 0; seam < 5; seam += 1) { const seamX = -coverWidth * .43 + (seam + (row % 2 ? .5 : 0)) * coverWidth * .2; context.beginPath(); context.moveTo(seamX, rowY); context.lineTo(seamX + (seam % 2 ? 2 : -2), rowY - baseHeight * .15); context.stroke(); }
      }
      context.strokeStyle = "rgba(39,28,20,.62)"; context.lineWidth = 1;
      for (let hatch = 0; hatch < 10; hatch += 1) { const hx = Lerp(-coverWidth * .44, coverWidth * .42, hatch / 9); context.beginPath(); context.moveTo(hx, -baseHeight * .12); context.lineTo(hx + 12 * sceneScale, -baseHeight * (.27 + hatch % 3 * .13)); context.stroke(); }
    } else if (cover.kind === "cart") {
      DrawDetailedCart(coverWidth, baseHeight, active, cover.id.length);
    } else if (cover.kind === "well") {
      context.fillStyle = "#645545"; context.strokeStyle = "#28231d"; context.lineWidth = Math.max(2, 3 * sceneScale); context.beginPath(); context.ellipse(0, -baseHeight * .5, coverWidth * .51, baseHeight * .21, 0, 0, Math.PI * 2); context.fill(); context.stroke();
      context.fillRect(-coverWidth * .5, -baseHeight * .5, coverWidth, baseHeight * .47);
      for (let row = 0; row < 3; row += 1) { const rowY = -baseHeight * (.1 + row * .14); context.strokeStyle = "rgba(185,153,109,.42)"; context.lineWidth = 1.2; context.beginPath(); context.moveTo(-coverWidth * .47, rowY); context.lineTo(coverWidth * .47, rowY - 2); context.stroke(); for (let seam = 0; seam < 4; seam += 1) { const seamX = -coverWidth * .4 + (seam + (row % 2 ? .5 : 0)) * coverWidth * .24; context.beginPath(); context.moveTo(seamX, rowY); context.lineTo(seamX, rowY - baseHeight * .13); context.stroke(); } }
      context.fillStyle = "#181715"; context.beginPath(); context.ellipse(0, -baseHeight * .52, coverWidth * .36, baseHeight * .11, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#936c42"; context.lineWidth = Math.max(3, 4 * sceneScale); context.beginPath(); context.ellipse(0, -baseHeight * .52, coverWidth * .51, baseHeight * .21, 0, 0, Math.PI * 2); context.stroke();
      context.strokeStyle = "#2a1d14"; context.lineWidth = Math.max(5, 6 * sceneScale); context.beginPath(); context.moveTo(-coverWidth * .37, -baseHeight * .56); context.lineTo(-coverWidth * .37, -baseHeight * 1.2); context.moveTo(coverWidth * .37, -baseHeight * .56); context.lineTo(coverWidth * .37, -baseHeight * 1.2); context.moveTo(-coverWidth * .45, -baseHeight * 1.16); context.lineTo(coverWidth * .45, -baseHeight * 1.16); context.stroke();
      context.strokeStyle = "#7b5434"; context.lineWidth = Math.max(2.5, 3 * sceneScale); context.stroke();
      context.strokeStyle = "#b48a55"; context.lineWidth = 2; context.beginPath(); context.moveTo(0, -baseHeight * 1.16); context.lineTo(0, -baseHeight * .56); context.stroke();
      context.fillStyle = "#62422c"; context.beginPath(); context.ellipse(0, -baseHeight * 1.16, coverWidth * .11, baseHeight * .07, 0, 0, Math.PI * 2); context.fill();
    }

    if (active) {
      context.strokeStyle = "rgba(189,76,59,.9)"; context.lineWidth = Math.max(1.5, 2 * sceneScale);
      const half = coverWidth * .48;
      context.beginPath(); context.moveTo(-half, 8); context.lineTo(-half, 2); context.lineTo(-half * .58, 2); context.moveTo(half, 8); context.lineTo(half, 2); context.lineTo(half * .58, 2); context.stroke();
    }
    context.restore();
  }
}

function DrawActorVisibilityHud(width, surfaceY) {
  if (state.takedown || state.takedownGrace > 0 || state.player.layer !== "surface" || (!GetEnemyPatrols().length && !state.caught)) return;
  const cover = GetActiveCover();
  const label = state.detected ? "已发现" : cover ? "遮蔽" : "可见";
  const tone = state.detected ? "#ef6657" : cover ? "#6ed7d3" : "#d9ae65";
  const x = WorldToScreen(state.player.x, width);
  const y = surfaceY + 34;
  context.save(); context.translate(x, y); context.textAlign = "center";
  context.fillStyle = "rgba(8,13,15,.7)"; context.fillRect(-31, -8, 62, 15);
  context.fillStyle = tone; context.font = "800 8px system-ui, sans-serif"; context.fillText(label, 0, 2);
  context.fillStyle = "rgba(255,255,255,.14)"; context.fillRect(-25, 8, 50, 2);
  context.fillStyle = tone; context.fillRect(-25, 8, 50 * state.visibility / 100, 2);
  context.restore();
}

function DrawDetectionFlash(width, height, surfaceY) {
  if (!state.caught) return;
  const progress = state.caught.time / state.caught.duration;
  const pulse = .13 + Math.sin(progress * Math.PI * 5) * .04;
  context.fillStyle = `rgba(170,24,22,${pulse})`; context.fillRect(0, 0, width, height);
  const x = WorldToScreen(state.player.x, width);
  context.save(); context.translate(x, surfaceY - 150);
  context.fillStyle = "#f16759"; context.rotate(Math.PI / 4); context.fillRect(-13, -13, 26, 26); context.rotate(-Math.PI / 4);
  context.fillStyle = "#fff5e8"; context.font = "900 22px system-ui, sans-serif"; context.textAlign = "center"; context.fillText("!", 0, 8);
  context.restore();
}

function DrawEarth(width, height, surfaceY, tunnelY) {
  const gradient = context.createLinearGradient(0, surfaceY, 0, height);
  gradient.addColorStop(0, "#765239"); gradient.addColorStop(.28, "#563d2e"); gradient.addColorStop(.58, "#392c25"); gradient.addColorStop(1, "#171b1c");
  context.fillStyle = gradient; context.fillRect(0, surfaceY + 4, width, height - surfaceY);

  const exposedSoilDepth = Math.max(88, tunnelY - surfaceY - 46);
  const soilBands = 5;
  for (let band = 0; band < soilBands; band += 1) {
    const clodCount = Math.max(4, Math.round(width / (230 + band * 30)));
    for (let clod = 0; clod < clodCount; clod += 1) {
      const seed = band * 137 + clod * 19;
      const cellWidth = width / clodCount;
      const centerX = (clod + .5) * cellWidth + (SceneHash(seed + 1031) - .5) * cellWidth * .7;
      const centerY = surfaceY + 17 + SceneHash(seed + 1049) * exposedSoilDepth;
      const actualDepth = Math.max(0, Math.min(1, (centerY - surfaceY) / exposedSoilDepth));
      const radiusX = cellWidth * (.16 + SceneHash(seed + 1063) * .2);
      const radiusY = 6 + SceneHash(seed + 1087) * (7 + actualDepth * 5);
      const tilt = (SceneHash(seed + 1097) - .5) * .32;
      context.fillStyle = band % 2 ? "rgba(40,28,22,.12)" : "rgba(111,72,44,.11)";
      context.beginPath();
      context.moveTo(centerX - radiusX, centerY + radiusY * .1);
      context.quadraticCurveTo(centerX - radiusX * .55, centerY - radiusY * 1.05, centerX + radiusX * .05, centerY - radiusY * .73);
      context.quadraticCurveTo(centerX + radiusX * .68, centerY - radiusY * .55, centerX + radiusX, centerY + radiusY * .18);
      context.quadraticCurveTo(centerX + radiusX * .36, centerY + radiusY * .72, centerX - radiusX, centerY + radiusY * .1);
      context.closePath(); context.fill();

      context.strokeStyle = `rgba(218,158,92,${.33 - actualDepth * .13})`;
      context.lineWidth = 1.3 + (1 - actualDepth) * .8;
      context.beginPath();
      context.moveTo(centerX - radiusX * (.92 - SceneHash(seed + 1103) * .12), centerY + radiusY * .04);
      context.quadraticCurveTo(centerX - radiusX * .54, centerY - radiusY * (.86 + SceneHash(seed + 1109) * .18), centerX + radiusX * (.18 + SceneHash(seed + 1111) * .38), centerY - radiusY * (.64 - SceneHash(seed + 1113) * .15));
      context.stroke();
      if ((clod + band) % 3 === 0) {
        context.strokeStyle = `rgba(173,112,64,${.23 - actualDepth * .07})`; context.lineWidth = 1;
        context.beginPath(); context.moveTo(centerX + radiusX * .25, centerY + radiusY * .42); context.quadraticCurveTo(centerX + radiusX * .52, centerY + radiusY * .5, centerX + radiusX * .76, centerY + radiusY * .16); context.stroke();
      }

      context.strokeStyle = `rgba(44,29,21,${.34 - actualDepth * .08})`; context.lineWidth = .8 + (1 - actualDepth) * .45;
      for (let hatch = 0; hatch < 2; hatch += 1) {
        const hatchX = centerX - radiusX * .46 + hatch * radiusX * .47;
        const hatchY = centerY - radiusY * (.24 - hatch * .17);
        const hatchLength = radiusX * (.34 + SceneHash(seed + hatch + 1117) * .18);
        context.beginPath(); context.moveTo(hatchX - hatchLength * .45, hatchY - tilt * 6); context.lineTo(hatchX + hatchLength * .55, hatchY + radiusY * .38 + tilt * 6); context.stroke();
      }
    }
  }

  const soilMarkClusters = Math.max(12, Math.round(width / 102));
  for (let cluster = 0; cluster < soilMarkClusters; cluster += 1) {
    const seed = cluster * 43 + 1181;
    const baseX = SceneHash(seed) * width;
    const baseY = surfaceY + 14 + SceneHash(seed + 7) * exposedSoilDepth;
    const actualDepth = Math.max(0, Math.min(1, (baseY - surfaceY) / exposedSoilDepth));
    const strokes = 2 + cluster % 3;
    const direction = (SceneHash(seed + 13) - .5) * .82;
    for (let stroke = 0; stroke < strokes; stroke += 1) {
      const length = 13 + SceneHash(seed + stroke * 5 + 19) * 29;
      const startX = baseX + (stroke - (strokes - 1) * .5) * (8 + SceneHash(seed + stroke + 23) * 7);
      const startY = baseY + (stroke - 1) * (4 + SceneHash(seed + stroke + 29) * 3);
      context.strokeStyle = stroke % 2 ? `rgba(40,27,20,${.24 - actualDepth * .05})` : `rgba(200,139,80,${.25 - actualDepth * .08})`;
      context.lineWidth = .8 + SceneHash(seed + stroke + 31) * .8;
      context.beginPath(); context.moveTo(startX, startY); context.quadraticCurveTo(startX + length * .46, startY + direction * length * .34 - 2, startX + length, startY + direction * length + 2); context.stroke();
    }
  }

  const stratumCount = 8;
  for (let stratum = 0; stratum < stratumCount; stratum += 1) {
    const progress = (stratum + 1) / (stratumCount + 1);
    const centerY = Lerp(surfaceY + 16, height - 30, Math.pow(progress, 1.04));
    const amplitude = 4 + progress * 9;
    context.strokeStyle = `rgba(211,151,88,${.15 + (1 - progress) * .15})`; context.lineWidth = 1.05 + progress * .9;
    const segmentWidth = Math.max(105, width / 7);
    for (let segment = -1; segment <= Math.ceil(width / segmentWidth); segment += 1) {
      if ((segment + stratum) % 5 === 2) continue;
      const x0 = segment * segmentWidth + (SceneHash(stratum * 51 + segment) - .5) * 35;
      const x1 = x0 + segmentWidth * (.68 + SceneHash(stratum * 71 + segment) * .26);
      const y0 = centerY + Math.sin(x0 * .013 + stratum) * amplitude;
      const y1 = centerY + Math.sin(x1 * .013 + stratum) * amplitude;
      context.beginPath(); context.moveTo(x0, y0); context.bezierCurveTo(Lerp(x0, x1, .3), y0 - amplitude * .7, Lerp(x0, x1, .72), y1 + amplitude * .52, x1, y1); context.stroke();
      if ((segment + stratum) % 3 === 0) {
        context.strokeStyle = "rgba(34,24,18,.36)"; context.lineWidth = .85;
        for (let hatch = 0; hatch < 3; hatch += 1) { const hx = Lerp(x0, x1, .28 + hatch * .17); const hy = Lerp(y0, y1, .28 + hatch * .17); context.beginPath(); context.moveTo(hx - 4, hy + 2); context.lineTo(hx + 7 + progress * 5, hy + 10 + progress * 4); context.stroke(); }
      }
    }
  }
  for (let pebble = 0; pebble < Math.max(34, Math.round(width / 24)); pebble += 1) {
    const x = SceneHash(pebble + 701) * width;
    const y = surfaceY + 18 + SceneHash(pebble + 739) * (height - surfaceY - 32);
    const depth = (y - surfaceY) / Math.max(1, height - surfaceY);
    const radiusX = 1.5 + SceneHash(pebble + 751) * (3.5 + depth * 2.5);
    const radiusY = radiusX * (.38 + SceneHash(pebble + 779) * .32);
    context.fillStyle = `rgba(30,23,19,${.13 + depth * .12})`; context.strokeStyle = `rgba(192,143,91,${.12 + (1 - depth) * .12})`; context.lineWidth = .65;
    context.beginPath(); context.ellipse(x, y, radiusX, radiusY, SceneHash(pebble + 801) * .8 - .4, 0, Math.PI * 2); context.fill(); context.stroke();
  }
  context.strokeStyle = "rgba(68,43,26,.6)"; context.lineWidth = 1.5;
  for (let root = 0; root < Math.max(11, Math.round(width / 110)); root += 1) {
    const rootX = SceneHash(root + 829) * width;
    const length = 14 + SceneHash(root + 847) * 42;
    context.beginPath(); context.moveTo(rootX, surfaceY + 4); context.bezierCurveTo(rootX - 7, surfaceY + length * .32, rootX + 12, surfaceY + length * .58, rootX + (SceneHash(root + 863) - .5) * 24, surfaceY + length); context.stroke();
  }
  const halfHeight = TunnelHalfHeight(height);
  const samples = [];
  for (let worldX = worldMin - 3; worldX <= worldMax + 3; worldX += .28) {
    samples.push({ worldX, screenX: WorldToScreen(worldX, width), centerY: TunnelCenterYAt(worldX, tunnelY), halfHeight: TunnelHalfHeightAt(worldX, height) });
  }
  context.beginPath();
  samples.forEach((point, index) => index ? context.lineTo(point.screenX, point.centerY - point.halfHeight) : context.moveTo(point.screenX, point.centerY - point.halfHeight));
  [...samples].reverse().forEach((point) => context.lineTo(point.screenX, point.centerY + point.halfHeight));
  context.closePath();
  const tunnelShade = context.createLinearGradient(0, tunnelY - halfHeight, 0, tunnelY + halfHeight);
  tunnelShade.addColorStop(0, "#2d3a38");
  tunnelShade.addColorStop(.44, "#202e2e");
  tunnelShade.addColorStop(1, "#111c1f");
  context.fillStyle = tunnelShade; context.fill();
  context.save(); context.clip();
  context.strokeStyle = "rgba(130,154,139,.13)"; context.lineWidth = 2;
  for (let band = -2; band <= 2; band += 1) {
    context.beginPath();
    samples.forEach((point, index) => {
      const y = point.centerY + band * 17 + Math.sin(point.worldX * 1.25 + band) * 4;
      index ? context.lineTo(point.screenX, y) : context.moveTo(point.screenX, y);
    });
    context.stroke();
  }
  context.restore();
  context.beginPath();
  samples.forEach((point, index) => index ? context.lineTo(point.screenX, point.centerY - point.halfHeight) : context.moveTo(point.screenX, point.centerY - point.halfHeight));
  [...samples].reverse().forEach((point) => context.lineTo(point.screenX, point.centerY + point.halfHeight));
  context.closePath();
  context.strokeStyle = "rgba(204,158,94,.42)"; context.lineWidth = 3; context.lineJoin = "round"; context.stroke();

  DrawTunnelDepth(width, height, tunnelY);

  context.strokeStyle = "rgba(225,190,126,.25)"; context.lineWidth = 2;
  context.beginPath(); samples.forEach((point, index) => index ? context.lineTo(point.screenX, point.centerY + point.halfHeight - 5) : context.moveTo(point.screenX, point.centerY + point.halfHeight - 5)); context.stroke();

  context.strokeStyle = "#795a37"; context.lineWidth = Math.max(4, height * .006); context.lineCap = "round";
  for (let worldX = -10; worldX <= 10; worldX += 1.8) {
    const screenX = WorldToScreen(worldX, width);
    if (screenX < -30 || screenX > width + 30 || entrances.some((entrance) => Math.abs(entrance - worldX) < .75)) continue;
    const centerY = TunnelCenterYAt(worldX, tunnelY);
    const localHalfHeight = TunnelHalfHeightAt(worldX, height);
    const top = centerY - localHalfHeight + 7;
    const floor = centerY + localHalfHeight - 6;
    context.beginPath(); context.moveTo(screenX, floor); context.lineTo(screenX, top + 7); context.moveTo(screenX - 15, top + 6); context.lineTo(screenX + 15, top + 6); context.stroke();
    context.strokeStyle = "rgba(183,132,76,.5)"; context.lineWidth = 2; context.beginPath(); context.moveTo(screenX + 5, floor); context.lineTo(screenX + 5, top + 8); context.stroke();
    context.strokeStyle = "#795a37"; context.lineWidth = Math.max(4, height * .006);
  }

  DrawTunnelProps(width, height, tunnelY);
}

function TunnelOffsetAt(worldX) {
  if (worldX <= -8.2) return 10;
  if (worldX < -6.2) return Lerp(10, -5, (worldX + 8.2) / 2);
  if (worldX < -4.7) return Lerp(-5, -24, (worldX + 6.2) / 1.5);
  if (worldX <= -1.2) return -24;
  if (worldX < .8) return Lerp(-24, -8, (worldX + 1.2) / 2);
  if (worldX < 2.8) return Lerp(-8, 14, (worldX - .8) / 2);
  if (worldX <= 5.8) return 14;
  if (worldX < 7.6) return Lerp(14, 4, (worldX - 5.8) / 1.8);
  return 4;
}

function TunnelCenterYAt(worldX, tunnelY) { return tunnelY + TunnelOffsetAt(worldX); }
function TunnelHalfHeight(height) { return Math.max(42, Math.min(64, height * .085)); }
function TunnelHalfHeightAt(worldX, height) {
  const base = TunnelHalfHeight(height);
  const westernChamber = Math.max(0, 1 - Math.abs(worldX + 8.4) / 1.5) * 15;
  const meetingChamber = Math.max(0, 1 - Math.abs(worldX - .1) / 1.8) * 18;
  const refugeChamber = Math.max(0, 1 - Math.abs(worldX - 7.1) / 1.45) * 14;
  const shortBend = Math.max(0, 1 - Math.abs(worldX + 5.15) / .72) * 11;
  return base + westernChamber + meetingChamber + refugeChamber - shortBend;
}
function TunnelFloorYAt(worldX, height, tunnelY) { return TunnelCenterYAt(worldX, tunnelY) + TunnelHalfHeightAt(worldX, height) - 6; }
function TunnelCeilingYAt(worldX, height, tunnelY) { return TunnelCenterYAt(worldX, tunnelY) - TunnelHalfHeightAt(worldX, height) + 6; }

function DrawTunnelRearNetwork(width, height, tunnelY) {
  const rearTop = tunnelY - 52;
  const rearBottom = tunnelY + 7;
  const rearGradient = context.createLinearGradient(0, rearTop, 0, rearBottom);
  rearGradient.addColorStop(0, "rgba(8,14,17,.96)"); rearGradient.addColorStop(.58, "rgba(21,33,34,.9)"); rearGradient.addColorStop(1, "rgba(13,22,24,.95)");
  context.fillStyle = rearGradient;
  context.beginPath(); context.moveTo(0, rearBottom);
  for (let worldX = -15; worldX <= 15; worldX += .45) {
    const x = LayerToScreen(worldX, width, .68);
    const y = rearTop + Math.sin(worldX * .7) * 5 + Math.max(0, 1 - Math.abs(worldX) / 14) * -4;
    context.lineTo(x, y);
  }
  context.lineTo(width, rearBottom); context.closePath(); context.fill();
  context.strokeStyle = "rgba(116,144,132,.16)"; context.lineWidth = 2;
  context.beginPath();
  for (let worldX = -15; worldX <= 15; worldX += .45) {
    const x = LayerToScreen(worldX, width, .68);
    const y = rearTop + Math.sin(worldX * .7) * 5;
    worldX === -15 ? context.moveTo(x, y) : context.lineTo(x, y);
  }
  context.stroke();

  for (let worldX = -14; worldX <= 14; worldX += 2.05) {
    const x = LayerToScreen(worldX, width, .7);
    const bayWidth = Math.max(25, width / 34);
    const bayHeight = 38 + SceneHash(worldX + 410) * 10;
    context.fillStyle = "rgba(3,8,10,.72)";
    context.beginPath(); context.moveTo(x - bayWidth * .48, rearBottom); context.lineTo(x - bayWidth * .38, rearBottom - bayHeight * .65); context.quadraticCurveTo(x, rearBottom - bayHeight, x + bayWidth * .38, rearBottom - bayHeight * .65); context.lineTo(x + bayWidth * .48, rearBottom); context.closePath(); context.fill();
    context.strokeStyle = "rgba(116,87,57,.28)"; context.lineWidth = 2;
    context.beginPath(); context.moveTo(x - bayWidth * .42, rearBottom); context.lineTo(x - bayWidth * .32, rearBottom - bayHeight * .58); context.quadraticCurveTo(x, rearBottom - bayHeight * .87, x + bayWidth * .32, rearBottom - bayHeight * .58); context.lineTo(x + bayWidth * .42, rearBottom); context.stroke();
    if (Math.round(worldX * 10) % 4 === 0) {
      context.fillStyle = "rgba(203,157,68,.15)"; context.beginPath(); context.arc(x, rearBottom - 13, 13, 0, Math.PI * 2); context.fill();
      context.fillStyle = "rgba(229,181,82,.52)"; context.beginPath(); context.arc(x, rearBottom - 13, 2.5, 0, Math.PI * 2); context.fill();
    }
  }

  context.strokeStyle = "rgba(143,108,66,.26)"; context.lineWidth = 3;
  for (let worldX = -13; worldX <= 13; worldX += 2.6) {
    const x = LayerToScreen(worldX, width, .74);
    context.beginPath(); context.moveTo(x, rearBottom); context.lineTo(x + 3, rearTop + 10); context.moveTo(x - 10, rearTop + 12); context.lineTo(x + 12, rearTop + 12); context.stroke();
  }
}

function DrawTunnelDepth(width, height, tunnelY) {
  DrawTunnelRearNetwork(width, height, tunnelY);
  const branches = [
    { id: "west", x: -8.45, width: 1.5, height: 59, skew: -1 },
    { id: "center", x: .15, width: 1.82, height: 67, skew: 1 },
    { id: "east", x: 7.15, width: 1.58, height: 61, skew: -1 }
  ];
  branches.forEach((branch, branchIndex) => {
    const x = LayerToScreen(branch.x, width, .94);
    const floorY = TunnelFloorYAt(branch.x, height, tunnelY) - 5;
    const branchWidth = width / 22 * branch.width;
    const topY = floorY - branch.height;
    const isOpen = state.levelIndex !== 0 || state.excavated.has(branch.id);
    if (!isOpen) {
      context.fillStyle = "rgba(83,59,41,.94)";
      context.beginPath(); context.ellipse(x, floorY - 22, branchWidth * .5, 37, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "rgba(191,140,79,.42)"; context.lineWidth = 2;
      for (let scar = 0; scar < 7; scar += 1) {
        const scarX = x + (scar - 3) * branchWidth * .11;
        context.beginPath(); context.moveTo(scarX - 5, floorY - 39 + (scar % 2) * 8); context.lineTo(scarX + 4, floorY - 20 + (scar % 3) * 5); context.stroke();
      }
      context.fillStyle = "rgba(222,184,112,.76)"; context.font = "800 8px system-ui"; context.textAlign = "center"; context.fillText("待挖", x, floorY - 14);
      return;
    }

    const farX = x + branch.skew * branchWidth * .18;
    const farTop = topY + 17;
    const farFloor = floorY - 13;
    const shade = context.createLinearGradient(x, floorY, farX, farTop);
    shade.addColorStop(0, "rgba(45,58,53,.94)"); shade.addColorStop(.55, "rgba(20,32,33,.97)"); shade.addColorStop(1, "rgba(5,12,15,.99)");
    context.fillStyle = shade;
    context.beginPath(); context.moveTo(x - branchWidth * .62, floorY); context.lineTo(x - branchWidth * .48, topY + 10); context.quadraticCurveTo(x, topY - 15, x + branchWidth * .48, topY + 10); context.lineTo(x + branchWidth * .62, floorY); context.closePath(); context.fill();

    context.fillStyle = "rgba(7,13,15,.96)";
    context.beginPath(); context.moveTo(farX - branchWidth * .2, farFloor); context.lineTo(farX - branchWidth * .16, farTop + 8); context.quadraticCurveTo(farX, farTop - 3, farX + branchWidth * .16, farTop + 8); context.lineTo(farX + branchWidth * .2, farFloor); context.closePath(); context.fill();

    context.fillStyle = "rgba(92,75,55,.36)";
    context.beginPath(); context.moveTo(x - branchWidth * .62, floorY); context.lineTo(farX - branchWidth * .2, farFloor); context.lineTo(farX - branchWidth * .16, farTop + 8); context.lineTo(x - branchWidth * .48, topY + 10); context.closePath(); context.fill();
    context.fillStyle = "rgba(30,41,39,.42)";
    context.beginPath(); context.moveTo(x + branchWidth * .62, floorY); context.lineTo(farX + branchWidth * .2, farFloor); context.lineTo(farX + branchWidth * .16, farTop + 8); context.lineTo(x + branchWidth * .48, topY + 10); context.closePath(); context.fill();

    context.fillStyle = branchIndex === 1 ? "rgba(211,165,74,.2)" : "rgba(91,166,153,.12)";
    context.beginPath(); context.moveTo(x - branchWidth * .54, floorY); context.lineTo(x + branchWidth * .54, floorY); context.lineTo(farX + branchWidth * .19, farFloor); context.lineTo(farX - branchWidth * .19, farFloor); context.closePath(); context.fill();
    for (let guide = 0; guide < 4; guide += 1) {
      const progress = guide / 4;
      const guideX = Lerp(x, farX, progress);
      const guideHalfWidth = Lerp(branchWidth * .5, branchWidth * .17, progress);
      const guideY = Lerp(floorY - 2, farFloor, progress);
      context.strokeStyle = `rgba(205,161,92,${.24 - progress * .035})`; context.lineWidth = Math.max(1, 3.4 - guide * .55);
      context.beginPath(); context.moveTo(guideX - guideHalfWidth, guideY); context.lineTo(guideX + guideHalfWidth, guideY); context.stroke();
    }

    for (let frame = 0; frame < 4; frame += 1) {
      const progress = frame / 4;
      const frameX = Lerp(x, farX, progress);
      const frameWidth = Lerp(branchWidth * .52, branchWidth * .18, progress);
      const frameFloor = Lerp(floorY - frame * 1.4, farFloor, progress);
      const frameTop = Lerp(topY, farTop, progress);
      context.strokeStyle = `rgba(159,116,67,${.55 - frame * .09})`; context.lineWidth = Math.max(1.7, 5.2 - frame * .85);
      context.beginPath(); context.moveTo(frameX - frameWidth, frameFloor); context.lineTo(frameX - frameWidth * .76, frameTop + 11); context.quadraticCurveTo(frameX, frameTop - 8, frameX + frameWidth * .76, frameTop + 11); context.lineTo(frameX + frameWidth, frameFloor); context.stroke();
    }

    context.fillStyle = branchIndex === 1 ? "rgba(228,180,81,.44)" : "rgba(98,183,169,.22)";
    context.beginPath(); context.ellipse(farX, farFloor - 7, branchWidth * .12, 5, 0, 0, Math.PI * 2); context.fill();
  });

  const sideNiches = [
    { x: -5.85, side: -1 }, { x: -3.2, side: 1 }, { x: 2.8, side: -1 }, { x: 5.1, side: 1 }, { x: 9.4, side: -1 }
  ];
  sideNiches.forEach((niche, index) => {
    const x = LayerToScreen(niche.x, width, .9);
    const floorY = TunnelFloorYAt(niche.x, height, tunnelY) - 6;
    const nicheWidth = Math.max(28, width / 35);
    const depth = niche.side * nicheWidth * .42;
    context.fillStyle = "rgba(7,13,15,.72)"; context.beginPath(); context.moveTo(x - nicheWidth * .5, floorY); context.lineTo(x - nicheWidth * .36, floorY - 41); context.quadraticCurveTo(x, floorY - 57, x + nicheWidth * .36, floorY - 41); context.lineTo(x + nicheWidth * .5, floorY); context.closePath(); context.fill();
    context.fillStyle = "rgba(88,69,50,.24)"; context.beginPath(); context.moveTo(x + niche.side * nicheWidth * .5, floorY); context.lineTo(x + niche.side * nicheWidth * .36, floorY - 41); context.lineTo(x + depth, floorY - 34); context.lineTo(x + depth, floorY - 6); context.closePath(); context.fill();
    context.strokeStyle = "rgba(146,105,62,.4)"; context.lineWidth = 3; context.beginPath(); context.moveTo(x - nicheWidth * .46, floorY); context.lineTo(x - nicheWidth * .33, floorY - 39); context.quadraticCurveTo(x, floorY - 53, x + nicheWidth * .33, floorY - 39); context.lineTo(x + nicheWidth * .46, floorY); context.stroke();
    if (index % 2 === 0) { context.fillStyle = "rgba(207,158,67,.28)"; context.beginPath(); context.arc(x + depth * .45, floorY - 17, 10, 0, Math.PI * 2); context.fill(); }
  });

  context.strokeStyle = "rgba(111,139,127,.14)"; context.lineWidth = 7;
  context.beginPath();
  for (let worldX = -11; worldX <= 11; worldX += .4) {
    const x = LayerToScreen(worldX, width, .96);
    const y = TunnelCeilingYAt(worldX, height, tunnelY) + 13;
    worldX === -11 ? context.moveTo(x, y) : context.lineTo(x, y);
  }
  context.stroke();
}

function DrawTunnelProps(width, height, tunnelY) {
  const props = [
    { x: -10.1, kind: "jars" }, { x: -9.25, kind: "basket" }, { x: -7.75, kind: "lamp" }, { x: -6.35, kind: "bench" },
    { x: -4.7, kind: "sacks" }, { x: -3.55, kind: "toolRack" }, { x: -2.45, kind: "crate" }, { x: -.9, kind: "rope" }, { x: 1.7, kind: "shelf" },
    { x: 2.75, kind: "stove" }, { x: 3.8, kind: "lamp" }, { x: 5.25, kind: "bench" }, { x: 6.45, kind: "jars" }, { x: 7.72, kind: "lamp" }, { x: 9.1, kind: "sacks" }
  ];
  props.forEach((prop) => {
    const x = WorldToScreen(prop.x, width);
    const floorY = TunnelFloorYAt(prop.x, height, tunnelY) - 5;
    if (prop.kind === "basket") {
      context.fillStyle = "#725439"; context.beginPath(); context.ellipse(x, floorY - 7, 12, 7, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#a47a4b"; context.lineWidth = 2; context.beginPath(); context.arc(x, floorY - 8, 9, Math.PI, Math.PI * 2); context.stroke();
    } else if (prop.kind === "crate") {
      context.fillStyle = "#60452f"; context.fillRect(x - 12, floorY - 18, 24, 18); context.strokeStyle = "#9b7144"; context.lineWidth = 2; context.strokeRect(x - 12, floorY - 18, 24, 18); context.beginPath(); context.moveTo(x - 10, floorY - 16); context.lineTo(x + 10, floorY - 2); context.stroke();
    } else if (prop.kind === "lamp") {
      context.fillStyle = "rgba(224,172,76,.18)"; context.beginPath(); context.arc(x, floorY - 23, 25, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#d4a657"; context.beginPath(); context.arc(x, floorY - 20, 4, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#83613c"; context.lineWidth = 2; context.beginPath(); context.moveTo(x, floorY - 16); context.lineTo(x, floorY); context.stroke();
    } else if (prop.kind === "jars") {
      context.fillStyle = "#70513c"; context.beginPath(); context.ellipse(x - 7, floorY - 8, 7, 9, 0, 0, Math.PI * 2); context.ellipse(x + 7, floorY - 6, 6, 7, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#a77e54"; context.lineWidth = 2; context.beginPath(); context.moveTo(x - 12, floorY - 12); context.lineTo(x - 2, floorY - 12); context.moveTo(x + 2, floorY - 10); context.lineTo(x + 12, floorY - 10); context.stroke();
    } else if (prop.kind === "bench") {
      context.fillStyle = "#67482f"; context.fillRect(x - 19, floorY - 13, 38, 7); context.fillRect(x - 15, floorY - 7, 5, 9); context.fillRect(x + 10, floorY - 7, 5, 9);
      context.strokeStyle = "rgba(190,139,77,.5)"; context.lineWidth = 1.5; context.beginPath(); context.moveTo(x - 17, floorY - 11); context.lineTo(x + 17, floorY - 11); context.stroke();
    } else if (prop.kind === "sacks") {
      context.fillStyle = "#76664a"; context.beginPath(); context.ellipse(x - 8, floorY - 9, 10, 12, -.16, 0, Math.PI * 2); context.ellipse(x + 8, floorY - 7, 9, 10, .19, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "rgba(210,178,118,.45)"; context.lineWidth = 1.5; context.beginPath(); context.moveTo(x - 15, floorY - 14); context.quadraticCurveTo(x - 8, floorY - 18, x - 1, floorY - 14); context.moveTo(x + 2, floorY - 12); context.quadraticCurveTo(x + 8, floorY - 15, x + 14, floorY - 11); context.stroke();
    } else if (prop.kind === "rope") {
      context.strokeStyle = "#9b7448"; context.lineWidth = 3; context.beginPath(); context.arc(x, floorY - 10, 11, 0, Math.PI * 2); context.arc(x, floorY - 10, 6, 0, Math.PI * 2); context.stroke();
      context.strokeStyle = "rgba(220,180,106,.42)"; context.lineWidth = 1; context.beginPath(); context.arc(x, floorY - 10, 8.5, 0, Math.PI * 2); context.stroke();
    } else if (prop.kind === "shelf") {
      context.strokeStyle = "#745337"; context.lineWidth = 4; context.beginPath(); context.moveTo(x - 20, floorY); context.lineTo(x - 18, floorY - 35); context.moveTo(x + 20, floorY); context.lineTo(x + 18, floorY - 35); context.moveTo(x - 21, floorY - 27); context.lineTo(x + 21, floorY - 27); context.moveTo(x - 21, floorY - 12); context.lineTo(x + 21, floorY - 12); context.stroke();
      context.fillStyle = "#78604a"; context.beginPath(); context.ellipse(x - 8, floorY - 32, 5, 6, 0, 0, Math.PI * 2); context.ellipse(x + 7, floorY - 31, 4, 5, 0, 0, Math.PI * 2); context.fill();
    } else if (prop.kind === "toolRack") {
      context.fillStyle = "#6f5035"; context.fillRect(x - 20, floorY - 36, 40, 6);
      context.strokeStyle = "#a27949"; context.lineWidth = 2; context.beginPath(); context.moveTo(x - 17, floorY - 33); context.lineTo(x - 17, floorY - 27); context.moveTo(x, floorY - 33); context.lineTo(x, floorY - 26); context.moveTo(x + 17, floorY - 33); context.lineTo(x + 17, floorY - 27); context.stroke();
      context.strokeStyle = "#825f3c"; context.lineWidth = 3; context.beginPath(); context.moveTo(x - 14, floorY - 29); context.lineTo(x - 9, floorY - 3); context.moveTo(x + 5, floorY - 29); context.lineTo(x + 7, floorY - 2); context.stroke();
      context.fillStyle = "#6f7470"; context.beginPath(); context.moveTo(x - 14, floorY - 29); context.lineTo(x - 21, floorY - 37); context.lineTo(x - 7, floorY - 37); context.closePath(); context.fill();
      context.strokeStyle = "#8f9490"; context.lineWidth = 3; context.beginPath(); context.moveTo(x - 2, floorY - 28); context.lineTo(x + 14, floorY - 35); context.stroke();
    } else if (prop.kind === "stove") {
      context.fillStyle = "#5c4b3d"; context.beginPath(); context.moveTo(x - 18, floorY); context.lineTo(x - 15, floorY - 24); context.quadraticCurveTo(x, floorY - 34, x + 16, floorY - 24); context.lineTo(x + 19, floorY); context.closePath(); context.fill();
      context.strokeStyle = "#967151"; context.lineWidth = 2; context.stroke();
      context.fillStyle = "#1e2220"; context.beginPath(); context.ellipse(x, floorY - 7, 8, 5, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#353532"; context.beginPath(); context.ellipse(x, floorY - 28, 14, 5, 0, 0, Math.PI * 2); context.fill(); context.fillRect(x - 9, floorY - 35, 18, 8);
      context.strokeStyle = "#77614a"; context.lineWidth = 4; context.beginPath(); context.moveTo(x + 11, floorY - 29); context.lineTo(x + 22, floorY - 43); context.stroke();
      for (let puff = 0; puff < 3; puff += 1) { const puffY = floorY - 45 - puff * 8 - Math.sin(state.elapsed * .8 + puff) * 2; context.fillStyle = `rgba(177,174,155,${.1 - puff * .02})`; context.beginPath(); context.ellipse(x + 23 + puff * 3, puffY, 5 + puff * 2, 3 + puff, -.2, 0, Math.PI * 2); context.fill(); }
    }
  });
}

function DrawFlowArrow(screenX, screenY, direction, color, alpha = 1) {
  context.save(); context.translate(screenX, screenY); context.scale(direction, 1); context.globalAlpha = alpha;
  context.strokeStyle = color; context.fillStyle = color; context.lineWidth = 2;
  context.beginPath(); context.moveTo(-7, 0); context.lineTo(6, 0); context.stroke();
  context.beginPath(); context.moveTo(6, 0); context.lineTo(1, -4); context.lineTo(1, 4); context.closePath(); context.fill(); context.restore();
}

function DrawVerticalArrow(screenX, screenY, direction, color, alpha = 1) {
  context.save(); context.translate(screenX, screenY); context.scale(1, direction); context.globalAlpha = alpha;
  context.strokeStyle = color; context.fillStyle = color; context.lineWidth = 2;
  context.beginPath(); context.moveTo(0, -7); context.lineTo(0, 6); context.stroke();
  context.beginPath(); context.moveTo(0, 6); context.lineTo(-4, 1); context.lineTo(4, 1); context.closePath(); context.fill(); context.restore();
}

function DrawStructureTag(screenX, ceilingY, scale, title, cue, status, tone) {
  const panelWidth = Math.max(86, Math.min(132, 112 * scale));
  const panelHeight = Math.max(28, 34 * scale);
  const panelY = ceilingY - panelHeight - 10;
  context.save();
  context.strokeStyle = tone; context.lineWidth = 1.2; context.setLineDash([3, 3]);
  context.beginPath(); context.moveTo(screenX, panelY + panelHeight); context.lineTo(screenX, ceilingY + 5); context.stroke(); context.setLineDash([]);
  context.fillStyle = tone; context.beginPath(); context.arc(screenX, ceilingY + 5, 2.5, 0, Math.PI * 2); context.fill();
  context.restore();
  context.save(); context.translate(screenX, panelY);
  context.fillStyle = "rgba(20,18,15,.92)";
  context.strokeStyle = tone; context.lineWidth = 1.4;
  context.beginPath(); context.roundRect(-panelWidth / 2, 0, panelWidth, panelHeight, 3); context.fill(); context.stroke();
  context.fillStyle = tone; context.fillRect(-panelWidth / 2, 0, 4, panelHeight);
  context.fillStyle = "#eadcbc"; context.font = `800 ${Math.max(8, 9.5 * scale)}px "FangSong", serif`; context.textAlign = "left";
  context.fillText(title, -panelWidth / 2 + 10, Math.max(11, 12 * scale));
  context.fillStyle = "#b9ad94"; context.font = `700 ${Math.max(6.5, 7.2 * scale)}px system-ui, sans-serif`;
  context.fillText(cue, -panelWidth / 2 + 10, Math.max(22, 25 * scale));
  context.fillStyle = status === "工作中" ? "#a84a3b" : "#827b67";
  context.fillRect(panelWidth / 2 - 31, 5, 26, 11);
  context.fillStyle = "#f0dfbd"; context.font = `800 ${Math.max(5.5, 6 * scale)}px system-ui, sans-serif`; context.textAlign = "center";
  context.fillText(status, panelWidth / 2 - 18, 13);
  context.restore();
}

function DrawEmptyStructureSite(screenX, centerY, ceilingY, floorY, scale, slotIndex) {
  const site = buildSiteProfiles[slotIndex];
  const direction = site.flowDirection;
  const frameWidth = 58 * scale;
  context.save();
  context.strokeStyle = "rgba(198,154,85,.42)"; context.lineWidth = 1.5; context.setLineDash([5, 5]);
  context.strokeRect(screenX - frameWidth / 2, centerY - 23 * scale, frameWidth, 48 * scale);
  context.setLineDash([]);
  context.fillStyle = "rgba(28,22,17,.7)";
  [-1, 1].forEach((side) => { context.beginPath(); context.arc(screenX + side * frameWidth * .38, floorY - 5, 4 * scale, 0, Math.PI * 2); context.fill(); });
  DrawFlowArrow(screenX - direction * frameWidth * .78, centerY + 4, direction, "#bb8d4c", .72);
  context.restore();
  DrawStructureTag(screenX, ceilingY, scale, `机关位 ${slotIndex + 1} · ${site.name}`, `来向 ${direction > 0 ? "左→右" : "右→左"}`, "待施工", "#9a7447");
}

function DrawFlipGateAssembly(screenX, centerY, ceilingY, floorY, scale, slotIndex, active) {
  const direction = buildSiteProfiles[slotIndex].flowDirection;
  const gateClearance = Math.max(5, 6 * scale);
  const gateLength = Math.max(58 * scale, floorY - ceilingY - gateClearance * 2);
  const gateThickness = Math.max(8, (active ? 20 : 10) * scale);
  const pivotX = screenX - direction * gateLength * .46;
  const pivotY = floorY - gateClearance;
  const flatEndX = pivotX + direction * gateLength;
  const activeEndX = pivotX + direction * 16 * scale;
  const activeEndY = ceilingY + gateClearance;

  context.save(); context.lineCap = "round"; context.lineJoin = "round";
  context.fillStyle = "rgba(11,12,11,.78)"; context.strokeStyle = "#5f4630"; context.lineWidth = 2;
  context.beginPath(); context.moveTo(pivotX - direction * 5, floorY - 3); context.lineTo(flatEndX + direction * 6, floorY - 3); context.lineTo(flatEndX + direction * 2, floorY + 9); context.lineTo(pivotX, floorY + 9); context.closePath(); context.fill(); context.stroke();

  context.strokeStyle = "rgba(205,159,89,.38)"; context.lineWidth = 1.4; context.setLineDash([4, 4]);
  context.beginPath(); context.moveTo(pivotX, pivotY); context.lineTo(active ? flatEndX : pivotX, active ? pivotY : activeEndY); context.stroke();
  context.beginPath();
  if (direction > 0) context.arc(pivotX, pivotY, gateLength * .73, active ? -Math.PI / 2 : 0, active ? 0 : -Math.PI / 2, active);
  else context.arc(pivotX, pivotY, gateLength * .73, active ? -Math.PI / 2 : Math.PI, active ? Math.PI : -Math.PI / 2, !active);
  context.stroke(); context.setLineDash([]);

  const endX = active ? activeEndX : flatEndX;
  const endY = active ? activeEndY : pivotY;
  const vectorX = endX - pivotX; const vectorY = endY - pivotY;
  const length = Math.max(1, Math.hypot(vectorX, vectorY));
  const normalX = -vectorY / length * gateThickness / 2; const normalY = vectorX / length * gateThickness / 2;
  context.fillStyle = active ? "#7e5837" : "#6e4e34"; context.strokeStyle = "#d0a367"; context.lineWidth = 2.2;
  context.beginPath(); context.moveTo(pivotX + normalX, pivotY + normalY); context.lineTo(endX + normalX, endY + normalY); context.lineTo(endX - normalX, endY - normalY); context.lineTo(pivotX - normalX, pivotY - normalY); context.closePath(); context.fill(); context.stroke();
  context.strokeStyle = "rgba(44,29,19,.75)"; context.lineWidth = 1.2;
  for (let plank = 1; plank < 5; plank += 1) { const progress = plank / 5; const plankX = Lerp(pivotX, endX, progress); const plankY = Lerp(pivotY, endY, progress); context.beginPath(); context.moveTo(plankX + normalX * .88, plankY + normalY * .88); context.lineTo(plankX - normalX * .88, plankY - normalY * .88); context.stroke(); }
  if (active) {
    context.strokeStyle = "rgba(225,184,116,.72)"; context.lineWidth = 2.2;
    context.beginPath();
    context.moveTo(Lerp(pivotX, endX, .16) + normalX * .64, Lerp(pivotY, endY, .16) + normalY * .64);
    context.lineTo(Lerp(pivotX, endX, .84) - normalX * .64, Lerp(pivotY, endY, .84) - normalY * .64);
    context.stroke();
  }
  context.fillStyle = "#a54537"; context.strokeStyle = "#e1b874"; context.lineWidth = 2; context.beginPath(); context.arc(pivotX, pivotY, 6 * scale, 0, Math.PI * 2); context.fill(); context.stroke();
  context.fillStyle = "#262019"; context.beginPath(); context.arc(pivotX, pivotY, 2.3 * scale, 0, Math.PI * 2); context.fill();
  context.strokeStyle = "#c1965d"; context.lineWidth = 3; context.beginPath();
  context.moveTo(activeEndX - 11 * scale, ceilingY + gateClearance); context.lineTo(activeEndX + 11 * scale, ceilingY + gateClearance);
  context.moveTo(activeEndX - 8 * scale, ceilingY + gateClearance); context.lineTo(activeEndX - 8 * scale, ceilingY + 16 * scale);
  context.moveTo(activeEndX + 8 * scale, ceilingY + gateClearance); context.lineTo(activeEndX + 8 * scale, ceilingY + 16 * scale);
  context.stroke();
  if (active) {
    context.fillStyle = "#a54537"; context.strokeStyle = "#e1b874"; context.lineWidth = 1.5;
    context.beginPath(); context.roundRect(activeEndX - 10 * scale, activeEndY - 4 * scale, 20 * scale, 9 * scale, 2); context.fill(); context.stroke();
  }
  DrawFlowArrow(screenX - direction * gateLength * .82, centerY + 14, direction, "#b34f3f", .86);
  context.restore();
  DrawStructureTag(screenX, ceilingY, scale, "翻板分割闸", `轴在${direction > 0 ? "左" : "右"} · 闸面↑`, active ? "工作中" : "平放", "#b34f3f");
}

function DrawFloodGateAssembly(screenX, centerY, ceilingY, floorY, scale, slotIndex, active) {
  const direction = buildSiteProfiles[slotIndex].flowDirection;
  const frameTop = ceilingY + 25 * scale;
  const frameHalfWidth = 24 * scale;
  const gateHeight = Math.min(48 * scale, floorY - frameTop - 24 * scale);
  const gateTop = active ? floorY - 7 - gateHeight : frameTop + 7 * scale;
  const gateBottom = gateTop + gateHeight;
  context.save(); context.lineCap = "round"; context.lineJoin = "round";
  context.fillStyle = "rgba(61,45,31,.66)"; context.strokeStyle = "#c1965d"; context.lineWidth = 2;
  [-1, 1].forEach((side) => { context.beginPath(); context.roundRect(screenX + side * frameHalfWidth - 5 * scale, frameTop, 10 * scale, floorY - frameTop, 2); context.fill(); context.stroke(); });
  context.fillStyle = "#6e5135"; context.fillRect(screenX - frameHalfWidth - 6 * scale, frameTop - 5 * scale, frameHalfWidth * 2 + 12 * scale, 9 * scale); context.strokeRect(screenX - frameHalfWidth - 6 * scale, frameTop - 5 * scale, frameHalfWidth * 2 + 12 * scale, 9 * scale);
  context.fillStyle = "#765537"; context.strokeStyle = "#d0a367"; context.beginPath(); context.rect(screenX - frameHalfWidth + 5 * scale, gateTop, frameHalfWidth * 2 - 10 * scale, gateBottom - gateTop); context.fill(); context.stroke();
  context.strokeStyle = "rgba(45,31,21,.72)"; context.lineWidth = 1.2;
  for (let boardY = gateTop + 9 * scale; boardY < gateBottom; boardY += 10 * scale) { context.beginPath(); context.moveTo(screenX - frameHalfWidth + 7 * scale, boardY); context.lineTo(screenX + frameHalfWidth - 7 * scale, boardY); context.stroke(); }
  context.strokeStyle = "#b98d54"; context.lineWidth = 2; context.beginPath(); context.moveTo(screenX, frameTop - 8 * scale); context.lineTo(screenX, gateTop); context.stroke();
  context.fillStyle = "#28221c"; context.strokeStyle = "#c1965d"; context.lineWidth = 2; context.beginPath(); context.arc(screenX, frameTop - 11 * scale, 10 * scale, 0, Math.PI * 2); context.fill(); context.stroke();
  context.strokeStyle = "#c1965d"; context.lineWidth = 1.4;
  for (let spoke = 0; spoke < 8; spoke += 1) { const angle = spoke / 8 * Math.PI * 2; context.beginPath(); context.moveTo(screenX + Math.cos(angle) * 2, frameTop - 11 * scale + Math.sin(angle) * 2); context.lineTo(screenX + Math.cos(angle) * 9 * scale, frameTop - 11 * scale + Math.sin(angle) * 9 * scale); context.stroke(); }
  const upstreamX = screenX - direction * frameHalfWidth;
  context.strokeStyle = "#6d9aa3"; context.lineWidth = 4; for (let wave = 0; wave < 2; wave += 1) { const waveY = floorY - 13 - wave * 8; context.beginPath(); context.moveTo(upstreamX - direction * 36 * scale, waveY); context.quadraticCurveTo(upstreamX - direction * 24 * scale, waveY - 4, upstreamX - direction * 12 * scale, waveY); context.stroke(); }
  context.strokeStyle = "#8e7049"; context.lineWidth = 5; context.beginPath(); context.moveTo(screenX - frameHalfWidth * .55, floorY - 3); context.quadraticCurveTo(screenX, floorY + 11, screenX + frameHalfWidth * .72, floorY - 3); context.stroke();
  DrawFlowArrow(upstreamX - direction * 27 * scale, floorY - 17, direction, "#6f9da5", .92);
  DrawFlowArrow(screenX + direction * frameHalfWidth * .75, floorY + 1, direction, "#6f9da5", .72);
  DrawVerticalArrow(screenX + frameHalfWidth + 11 * scale, active ? gateTop - 7 * scale : gateBottom + 7 * scale, active ? 1 : -1, "#c1965d", .72);
  context.restore();
  DrawStructureTag(screenX, ceilingY, scale, "引水回流闸", `上游在${direction > 0 ? "左" : "右"} · 水↘沟`, active ? "工作中" : "抬闸", "#6f9da5");
}

function DrawSmokeBaffleAssembly(screenX, centerY, ceilingY, floorY, scale, slotIndex, active) {
  const direction = buildSiteProfiles[slotIndex].flowDirection;
  const ductY = ceilingY + 39 * scale;
  const plateSpan = active ? 34 * scale : 25 * scale;
  context.save(); context.lineCap = "round"; context.lineJoin = "round";
  context.strokeStyle = "#927049"; context.lineWidth = 7 * scale;
  context.beginPath(); context.moveTo(screenX - 48 * scale, ductY); context.lineTo(screenX - 18 * scale, ductY); context.lineTo(screenX - 8 * scale, ceilingY + 23 * scale); context.lineTo(screenX + 25 * scale, ceilingY + 23 * scale); context.lineTo(screenX + 38 * scale, ductY); context.lineTo(screenX + 49 * scale, ductY); context.stroke();
  context.fillStyle = "#76583a"; context.strokeStyle = "#d0a367"; context.lineWidth = 2;
  const firstEndY = active ? centerY + 3 * scale : ductY + 5 * scale;
  const secondEndY = active ? centerY - 2 * scale : ductY + 5 * scale;
  context.beginPath(); context.moveTo(screenX - 22 * scale, ductY + 1); context.lineTo(screenX - 22 * scale + direction * plateSpan, firstEndY); context.lineTo(screenX - 15 * scale + direction * plateSpan, firstEndY + 6 * scale); context.lineTo(screenX - 14 * scale, ductY + 5 * scale); context.closePath(); context.fill(); context.stroke();
  context.beginPath(); context.moveTo(screenX + 20 * scale, ductY + 1); context.lineTo(screenX + 20 * scale - direction * plateSpan * .76, secondEndY); context.lineTo(screenX + 26 * scale - direction * plateSpan * .76, secondEndY + 6 * scale); context.lineTo(screenX + 27 * scale, ductY + 5 * scale); context.closePath(); context.fill(); context.stroke();
  context.fillStyle = "#a54537"; [-20, 22].forEach((offset) => { context.beginPath(); context.arc(screenX + offset * scale, ductY + 2, 4 * scale, 0, Math.PI * 2); context.fill(); });
  const ropeX = screenX + direction * 37 * scale;
  context.strokeStyle = "#c79a59"; context.lineWidth = 2; context.beginPath(); context.moveTo(screenX + direction * 21 * scale, ductY + 6); context.quadraticCurveTo(ropeX, centerY + 12, ropeX, floorY - 15); context.stroke();
  context.fillStyle = "#3e3022"; context.beginPath(); context.arc(ropeX, floorY - 14, 4 * scale, 0, Math.PI * 2); context.fill();
  const incomingX = screenX - direction * 52 * scale;
  DrawFlowArrow(incomingX, centerY + 4, direction, "#7fa5a2", .95);
  DrawFlowArrow(screenX - direction * 18 * scale, centerY - 7, direction, "#7fa5a2", .82);
  if (active) {
    context.strokeStyle = "rgba(127,165,162,.72)"; context.lineWidth = 2.4; context.beginPath(); context.moveTo(screenX, centerY - 2); context.quadraticCurveTo(screenX + direction * 14 * scale, centerY - 24 * scale, screenX + direction * 12 * scale, ceilingY + 18 * scale); context.stroke();
    context.fillStyle = "#7fa5a2"; context.beginPath(); context.moveTo(screenX + direction * 12 * scale, ceilingY + 14 * scale); context.lineTo(screenX + direction * 5 * scale, ceilingY + 24 * scale); context.lineTo(screenX + direction * 19 * scale, ceilingY + 24 * scale); context.closePath(); context.fill();
  } else {
    DrawFlowArrow(screenX + direction * 31 * scale, ductY + 14 * scale, direction, "#7fa5a2", .68);
  }
  context.restore();
  DrawStructureTag(screenX, ceilingY, scale, "防烟导流板", `烟${direction > 0 ? "→" : "←"} · ↑空支洞`, active ? "工作中" : "平送", "#899471");
}

function DrawTunnelSystems(width, height, surfaceY, tunnelY) {
  if (state.levelIndex !== 0) return;
  const intakeX = -5.6;
  const exhaustX = 4.6;
  for (const [worldX, kind] of [[intakeX, "intake"], [exhaustX, "exhaust"]]) {
    const screenX = WorldToScreen(worldX, width);
    const ceilingY = TunnelCeilingYAt(worldX, height, tunnelY) - 6;
    context.fillStyle = "#172224"; context.fillRect(screenX - 8, surfaceY - 2, 16, ceilingY - surfaceY + 10);
    context.strokeStyle = "#765a3d"; context.lineWidth = 3;
    context.beginPath(); context.moveTo(screenX - 9, surfaceY); context.lineTo(screenX - 9, ceilingY + 10); context.moveTo(screenX + 9, surfaceY); context.lineTo(screenX + 9, ceilingY + 10); context.stroke();
    context.strokeStyle = "rgba(222,192,137,.55)"; context.lineWidth = 2;
    for (let y = surfaceY + 7; y < ceilingY; y += 8) { context.beginPath(); context.moveTo(screenX - 7, y); context.lineTo(screenX + 7, y); context.stroke(); }
    context.fillStyle = "#2a3735"; context.fillRect(screenX - 13, surfaceY - 5, 26, 7);
    const flow = (state.elapsed * 28) % Math.max(16, ceilingY - surfaceY);
    const arrowY = kind === "intake" ? surfaceY + 12 + flow : ceilingY - 8 - flow;
    context.fillStyle = kind === "intake" ? "rgba(94,212,218,.85)" : "rgba(183,198,185,.78)";
    context.beginPath(); context.moveTo(screenX, arrowY + (kind === "intake" ? 5 : -5)); context.lineTo(screenX - 4, arrowY); context.lineTo(screenX + 4, arrowY); context.closePath(); context.fill();
  }

  const ventilation = state.defense.ventilation;
  if (ventilation > 0) {
    const particleCount = 5 + ventilation * 2;
    for (let index = 0; index < particleCount; index += 1) {
      const progress = (state.elapsed * (.08 + ventilation * .012) + index / particleCount) % 1;
      const worldX = Lerp(intakeX, exhaustX, progress);
      const screenX = WorldToScreen(worldX, width);
      const y = TunnelCenterYAt(worldX, tunnelY) - 18 + Math.sin(index * 2.1 + state.elapsed * 2) * 8;
      DrawFlowArrow(screenX, y, 1, "#69d4d7", .35 + ventilation * .15);
    }
  }

  const slotWorldXs = [-7, 0, 7];
  state.buildSlots.forEach((slotId, slotIndex) => {
    const worldX = slotWorldXs[slotIndex];
    const screenX = WorldToScreen(worldX, width);
    const centerY = TunnelCenterYAt(worldX, tunnelY);
    const localHalfHeight = TunnelHalfHeightAt(worldX, height);
    const ceilingY = centerY - localHalfHeight;
    const floorY = TunnelFloorYAt(worldX, height, tunnelY);
    const structureScale = Math.max(.7, Math.min(1.25, width / (22 / state.camera.zoom) / 52));
    const active = state.defense.activeSlots.has(slotIndex);
    if (!slotId) {
      if (state.phaseId === "build") DrawEmptyStructureSite(screenX, centerY, ceilingY, floorY, structureScale, slotIndex);
      return;
    }
    if (slotId === "flipGate") {
      DrawFlipGateAssembly(screenX, centerY, ceilingY, floorY, structureScale, slotIndex, active);
    } else if (slotId === "smokeBaffle") {
      DrawSmokeBaffleAssembly(screenX, centerY, ceilingY, floorY, structureScale, slotIndex, active);
    } else if (slotId === "floodGate") {
      DrawFloodGateAssembly(screenX, centerY, ceilingY, floorY, structureScale, slotIndex, active);
    }
  });

  if (["defense", "outcome"].includes(state.phaseId)) {
    const activeBaffleSlot = state.buildSlots.findIndex((slotId, slotIndex) => slotId === "smokeBaffle" && state.defense.activeSlots.has(slotIndex));
    const baffleActive = activeBaffleSlot >= 0;
    context.save();
    context.font = "600 11px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillStyle = "rgba(107,222,224,.88)";
    context.fillText("进风", WorldToScreen(intakeX, width), surfaceY - 16);
    context.fillStyle = "rgba(205,214,205,.88)";
    context.fillText(baffleActive ? "排烟" : "烟倒灌", WorldToScreen(baffleActive ? exhaustX : -7.5, width), surfaceY - 16);
    context.restore();
  }
}

function QaInspectHazard(kind) {
  if (!qaMode) return;
  if (kind === "clean") {
    state.cleanCapture = true;
    Show(ui.qaPanel, false);
    clearTimeout(toastTimer);
    Show(ui.toast, false);
    UpdateUi();
    return;
  }
  if (kind === "dogBark") {
    if (!state.level.roleIds.includes("dog")) return;
    QaJumpToPhase(state.levelIndex === 0 ? "collect" : state.levelIndex === 1 ? "survey" : "recon");
    EndCinematic();
    state.selectedRole = "dog";
    state.player.layer = "surface";
    state.player.x = -8.7;
    state.player.facing = 1;
    state.dog.layer = "surface";
    state.dog.x = state.player.x;
    state.dog.facing = state.player.facing;
    state.qaFreezePatrols = true;
    state.qaPatrolTime = 0;
    state.qaSafePreview = true;
    state.camera.x = -2.4;
    state.camera.targetX = -2.4;
    state.camera.zoom = .92;
    state.camera.targetZoom = .92;
    StartDogBarkLure(true);
    RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    return;
  }
  if (kind === "patrolWindow") {
    const phaseId = state.levelIndex === 0 ? "collect" : state.levelIndex === 1 ? "survey" : "recon";
    QaJumpToPhase(phaseId);
    EndCinematic();
    state.player.layer = "surface";
    state.player.x = -10.1;
    state.player.facing = 1;
    state.qaFreezePatrols = true;
    state.qaPatrolTime = state.levelIndex === 1 ? 8.4 : 0;
    state.qaSafePreview = true;
    state.qaPatrolReview = true;
    state.qaEnemyFocusId = null;
    state.camera.x = 0;
    state.camera.targetX = 0;
    state.camera.zoom = .84;
    state.camera.targetZoom = .84;
    state.qaCameraFocus = { x: 0, zoom: .84 };
    RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    Toast(`巡逻已错峰：${GetEnemyPatrols().length} 名敌兵分区巡逻，中间留有可穿越空档。`, "success");
    return;
  }
  if (["transferWrong", "transferSolved"].includes(kind)) {
    if (state.levelIndex !== 1) return;
    QaJumpToPhase("transfer"); EndCinematic();
    Object.assign(state.puzzle.transfer, {
      forkKnown: true, wideSupported: true, lowDrainOpen: true,
      woundedRoute: kind === "transferSolved" ? "wide" : "low",
      grainRoute: kind === "transferSolved" ? "low" : "wide"
    });
    QaComplete(["inspectForkClearance", "shoreWideBranch", "openLowDrain"]);
    state.selectedRole = kind === "transferWrong" ? "rescuer" : "student"; state.player.layer = "tunnel"; state.player.x = kind === "transferWrong" ? -2.65 : -.1;
    state.camera.x = -1.6; state.camera.targetX = -1.6; state.camera.zoom = .88; state.camera.targetZoom = .88;
    SyncSelectedRolePosition(); RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    Toast(kind === "transferSolved" ? "正确分路：担架走支护宽洞，粮包走排水低梁。" : "错误分路：担架卡低梁，粮袋占住宽洞。", kind === "transferSolved" ? "success" : "warning");
    return;
  }
  if (["deceptionWrong", "deceptionSolved"].includes(kind)) {
    if (state.levelIndex !== 2) return;
    QaJumpToPhase("compose"); EndCinematic();
    Object.assign(state.puzzle.deception, {
      visibleDecoy: "west", acousticRoute: kind === "deceptionSolved" ? "eastRear" : "westFront",
      falseEntrance: kind === "deceptionSolved" ? "centerSealed" : "westOpen",
      solved: kind === "deceptionSolved", contradictions: kind === "deceptionSolved" ? 3 : 0,
      enemyBelief: kind === "deceptionSolved" ? "西院有痕 · 东后方有人 · 中口封土通东" : "三条线索都指向西院"
    });
    state.player.layer = "tunnel"; state.player.x = 2.15; state.camera.x = 0; state.camera.targetX = 0; state.camera.zoom = .84; state.camera.targetZoom = .84;
    state.qaCameraFocus = { x: 0, zoom: .84 };
    SyncSelectedRolePosition(); RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    Toast(kind === "deceptionSolved" ? "三重矛盾成立：敌军将转入东空支洞。" : "顺向线索会被一路查穿，必须重接声门和假口。", kind === "deceptionSolved" ? "success" : "warning");
    return;
  }
  if (["enemyHud", "enemyHudJapanese", "takedownReady", "takedownReadyCollaborator", "takedownNext"].includes(kind)) {
    if (state.levelIndex !== 2) return;
    if (kind !== "takedownNext") QaJumpToPhase("recon");
    EndCinematic();
    state.selectedRole = "scout";
    state.player.layer = "surface";
    state.detected = false;
    state.detection = 0;
    state.caught = null;
    state.takedownGrace = 0;
    state.qaFreezePatrols = true;
    state.qaPatrolTime = 0;
    state.qaSafePreview = true;
    const previewPatrols = GetEnemyPatrols();
    const target = ["enemyHud", "takedownReadyCollaborator"].includes(kind) ? previewPatrols.find((enemy) => enemy.unitType === "collaborator") : previewPatrols.find((enemy) => enemy.unitType === "soldier") || previewPatrols[0];
    if (!target) return;
    state.qaEnemyFocusId = target.id;
    const approachDistance = ["takedownReady", "takedownReadyCollaborator", "takedownNext"].includes(kind) ? .86 : 2.05;
    state.player.x = target.x - target.facing * approachDistance;
    state.player.facing = target.facing;
    state.lastSafeX = state.player.x;
    state.camera.x = (target.x + state.player.x) / 2;
    state.camera.targetX = state.camera.x;
    state.camera.zoom = 1.14;
    state.camera.targetZoom = 1.14;
    UpdateCoverState();
    RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    Toast(["takedownReady", "takedownReadyCollaborator", "takedownNext"].includes(kind) ? "靠近侧后方：现在按 E 可非致命制服。" : `目标 HUD：${EnemyIdentity(target).faction}${EnemyIdentity(target).role}`, "success");
    return;
  }
  if (kind === "takedown") {
    if (state.levelIndex !== 2) return;
    QaJumpToPhase("recon");
    EndCinematic();
    const previewPatrols = GetEnemyPatrols();
    const target = { ...(previewPatrols[0] || {}), x: 1.2, facing: 1, unitType: "soldier", index: 0 };
    state.player.layer = "surface";
    state.player.x = target.x - target.facing * .86;
    state.player.facing = target.facing;
    state.lastSafeX = state.player.x;
    state.camera.x = target.x;
    state.camera.targetX = target.x;
    state.camera.zoom = 1.18;
    state.camera.targetZoom = 1.18;
    StartTakedown(target, true);
    RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    return;
  }
  if (state.levelIndex === 3 && ["combatLayers", "combatPickups", "combatRoof", "combatFire", "combatGrenade", "combatTakedown"].includes(kind)) {
    const phaseId = ["combatLayers", "combatPickups"].includes(kind) ? "arm" : "engage";
    QaJumpToPhase(phaseId);
    EndCinematic();
    state.qaSafePreview = true;
    state.qaFreezePatrols = true;
    state.qaPatrolTime = 0;
    state.player.facing = 1;
    if (kind === "combatLayers") {
      state.player.layer = "interior";
      state.player.x = -7.15;
      state.camera.x = -3.6; state.camera.targetX = -3.6; state.camera.zoom = .78; state.camera.targetZoom = .78;
      state.qaCameraFocus = { x: -3.6, zoom: .78 };
    } else if (kind === "combatPickups") {
      state.player.layer = "interior";
      state.player.x = -4.7;
      state.camera.x = -3.6; state.camera.targetX = -3.6; state.camera.zoom = 1.02; state.camera.targetZoom = 1.02;
      state.qaCameraFocus = { x: -3.6, zoom: 1.02 };
    } else {
      state.player.layer = "roof";
      state.player.x = .75;
      state.camera.x = 0; state.camera.targetX = 0; state.camera.zoom = .82; state.camera.targetZoom = .82;
      state.qaCameraFocus = { x: 0, zoom: .82 };
      if (kind === "combatFire") {
        state.player.x = -8.1;
        state.qaCameraFocus = null;
        FireRifle();
      } else if (kind === "combatGrenade") {
        state.player.x = .85;
        state.qaCameraFocus = null;
        ThrowGrenade();
      } else if (kind === "combatTakedown") {
        const target = GetEnemyPatrols()[0];
        if (target) {
          state.player.x = target.x - target.facing * .86;
          state.player.facing = target.facing;
          state.camera.x = target.x; state.camera.targetX = target.x; state.camera.zoom = 1.18; state.camera.targetZoom = 1.18;
          state.qaCameraFocus = null;
          PerformAction();
        }
      }
    }
    RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    return;
  }
  if (state.levelIndex !== 0) return;
  if (kind === "buildPanel") {
    QaJumpToPhase("build");
    state.resources.wood = 6;
    state.resources.iron = 4;
    state.excavated = new Set(["west", "center", "east"]);
    state.selectedRole = "blacksmith";
    OpenBuildPanel(2);
    RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    return;
  }
  if (["dog", "bell", "crackers", "enemies", "structures", "structuresIdle"].includes(kind) || state.phaseId !== "defense" || state.mode !== "play") QaJumpToPhase("defense");
  EndCinematic();
  if (["structures", "structuresIdle"].includes(kind)) {
    const showWorkingState = kind === "structures";
    state.defense.activeSlots = new Set(showWorkingState ? [0, 1, 2] : []);
    state.defense.triggered = showWorkingState ? 3 : 0;
    if (showWorkingState) QaComplete(["triggerSlotA", "triggerSlotB", "triggerSlotC"]);
    SyncFluidStructures();
    state.selectedRole = "blacksmith";
    state.player.layer = "tunnel";
    state.player.x = 3.45;
    state.dog.layer = "tunnel";
    state.dog.x = 3.8;
    state.civilians.forEach((civilian, index) => {
      civilian.x = 2.25 + index * .18;
      civilian.targetX = civilian.x;
    });
    state.camera.x = 0;
    state.camera.targetX = 0;
    state.camera.zoom = .88;
    state.camera.targetZoom = .88;
    state.qaCameraFocus = { x: 0, zoom: .88 };
    RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    return;
  }
  if (kind === "enemies") {
    state.selectedRole = "blacksmith";
    state.player.layer = "tunnel";
    state.player.x = .8;
    state.camera.x = .8;
    state.camera.targetX = .8;
    state.camera.zoom = 1.34;
    state.camera.targetZoom = 1.34;
    RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    return;
  }
  if (["dog", "bell", "crackers"].includes(kind)) {
    state.selectedRole = "leader";
    if (kind === "dog") {
      QaComplete(["placeDecoyCart", "closeSurfaceGate"]);
      state.player.layer = "tunnel";
      state.player.x = 4.85;
      state.dog.layer = "tunnel";
      state.dog.x = 2.7;
    } else if (kind === "bell") {
      QaComplete(["placeDecoyCart"]);
      state.player.layer = "surface";
      state.player.x = 1.85;
      state.dog.layer = "surface";
      state.dog.x = -2;
    } else {
      QaComplete(["placeDecoyCart", "ringAlarmBell"]);
      state.resources.powder = Math.max(1, state.resources.powder);
      state.player.layer = "surface";
      state.player.x = 9.35;
      state.dog.layer = "surface";
      state.dog.x = 8.35;
    }
    state.camera.x = state.player.x;
    state.camera.targetX = state.player.x;
    RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    return;
  }
  if (kind === "safe") {
    state.defense.activeSlots = new Set([0, 1, 2]);
    state.defense.triggered = 3;
    state.defense.enemyUnits = 0;
    QaComplete(["placeDecoyCart", "closeSurfaceGate", "whistleSmokeLatch", "triggerSlotA", "triggerSlotB", "triggerSlotC"]);
    SyncFluidStructures();
    state.raid.elapsed = 52;
    state.raid.stage = "两头掘口";
    state.selectedRole = "leader";
    ["elders", "stretcher", "children"].forEach((groupId) => {
      state.selectedCivilianGroup = groupId;
      CommandCivilianGroup("center");
    });
    state.selectedCivilianGroup = "elders";
    RenderRoleDock(); RenderQaPanel(); UpdateUi(); ui.qaPanel.open = true;
    return;
  }
  state.player.layer = "tunnel";
  state.player.x = kind === "smoke" ? 8.45 : -8.55;
  state.camera.x = state.player.x;
  state.camera.targetX = state.player.x;
  state.raid.elapsed = kind === "smoke" ? 18 : 31;
  state.raid.stage = kind === "smoke" ? "东口灌烟" : "西井灌水";
  for (let pulse = 0; pulse < 64; pulse += 1) {
    if (kind === "smoke") state.fluid.Inject("smoke", 9.25, -.05, .16, .5, -5.2, -.82);
    else state.fluid.Inject("water", -9.35, .4, .17, .48, 4.6, 2.05);
    state.fluid.Step(1 / 30);
  }
  RenderQaPanel();
  UpdateUi();
  ui.qaPanel.open = true;
}

function DrawFluidSimulation(width, height, tunnelY) {
  if (state.levelIndex !== 0 || !state.fluid) return;
  const simulation = state.fluid;
  if (fluidCanvas.width !== simulation.columns || fluidCanvas.height !== simulation.rows) {
    fluidCanvas.width = simulation.columns;
    fluidCanvas.height = simulation.rows;
  }
  const image = fluidContext.createImageData(simulation.columns, simulation.rows);
  image.data.set(simulation.Rasterize());
  fluidContext.putImageData(image, 0, 0);
  context.save();
  context.imageSmoothingEnabled = true;
  context.globalCompositeOperation = "source-over";
  const worldSpan = state.fluid.worldMaximum - state.fluid.worldMinimum;
  const worldStep = worldSpan / simulation.columns;
  for (let column = 0; column < simulation.columns; column += 1) {
    const worldX = simulation.worldMinimum + (column + .5) / simulation.columns * worldSpan;
    const nextWorldX = worldX + worldStep;
    const screenX = WorldToScreen(worldX, width);
    const nextScreenX = WorldToScreen(nextWorldX, width);
    const halfHeight = TunnelHalfHeightAt(worldX, height) - 5;
    const destinationY = TunnelCenterYAt(worldX, tunnelY) - halfHeight;
    context.drawImage(fluidCanvas, column, 0, 1, simulation.rows, screenX - 1, destinationY, Math.max(2, nextScreenX - screenX + 2), halfHeight * 2);
  }

  context.filter = "blur(2.4px)";
  for (let row = 2; row < simulation.rows - 2; row += 3) {
    for (let column = 2; column < simulation.columns - 2; column += 4) {
      const index = simulation.Index(column, row);
      const smoke = simulation.smoke[index];
      if (smoke < .055 || simulation.solid[index]) continue;
      const worldX = simulation.ColumnToWorld(column);
      const normalizedY = simulation.RowToNormalized(row);
      const halfHeight = TunnelHalfHeightAt(worldX, height) - 5;
      const x = WorldToScreen(worldX, width);
      const y = TunnelCenterYAt(worldX, tunnelY) + normalizedY * halfHeight;
      const velocityX = simulation.velocityX[index];
      const velocityY = simulation.velocityY[index];
      const angle = Math.atan2(velocityY, velocityX);
      const radius = 4 + smoke * 13;
      context.save(); context.translate(x, y); context.rotate(angle * .28);
      context.fillStyle = `rgba(171,164,150,${.1 + smoke * .48})`;
      context.beginPath(); context.ellipse(0, 0, radius * 1.35, radius * .82, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = `rgba(214,207,191,${smoke * .15})`;
      context.beginPath(); context.ellipse(-radius * .24, -radius * .18, radius * .7, radius * .46, 0, 0, Math.PI * 2); context.fill();
      context.restore();
    }
  }
  context.filter = "none";

  const waterSegments = [];
  let currentWaterSegment = [];
  for (let column = 2; column < simulation.columns - 2; column += 2) {
    let surfaceRow = -1;
    let density = 0;
    for (let row = 2; row < simulation.rows - 2; row += 1) {
      const value = simulation.water[simulation.Index(column, row)];
      density = Math.max(density, value);
      if (surfaceRow < 0 && value > .025) surfaceRow = row;
    }
    if (surfaceRow < 0) {
      if (currentWaterSegment.length) waterSegments.push(currentWaterSegment);
      currentWaterSegment = [];
      continue;
    }
    const worldX = simulation.ColumnToWorld(column);
    const halfHeight = TunnelHalfHeightAt(worldX, height) - 5;
    const x = WorldToScreen(worldX, width);
    const y = TunnelCenterYAt(worldX, tunnelY) + simulation.RowToNormalized(surfaceRow) * halfHeight;
    currentWaterSegment.push({ x, y, floorY: TunnelFloorYAt(worldX, height, tunnelY) - 3, density });
  }
  if (currentWaterSegment.length) waterSegments.push(currentWaterSegment);
  waterSegments.filter((segment) => segment.length > 1).forEach((segment) => {
    const topY = Math.min(...segment.map((point) => point.y));
    const bottomY = Math.max(...segment.map((point) => point.floorY));
    const density = segment.reduce((total, point) => total + point.density, 0) / segment.length;
    const gradient = context.createLinearGradient(0, topY, 0, bottomY);
    gradient.addColorStop(0, `rgba(96,207,224,${.34 + density * .35})`);
    gradient.addColorStop(.18, `rgba(44,143,181,${.42 + density * .3})`);
    gradient.addColorStop(1, `rgba(20,72,111,${.55 + density * .25})`);
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(segment[0].x, segment[0].y);
    for (let index = 1; index < segment.length; index += 1) {
      const previous = segment[index - 1];
      const point = segment[index];
      context.quadraticCurveTo(previous.x, previous.y, (previous.x + point.x) * .5, (previous.y + point.y) * .5);
    }
    const last = segment[segment.length - 1];
    context.lineTo(last.x, last.y);
    for (let index = segment.length - 1; index >= 0; index -= 1) context.lineTo(segment[index].x, segment[index].floorY);
    context.closePath(); context.fill();
    context.strokeStyle = "rgba(156,236,239,.9)"; context.lineWidth = 2;
    context.beginPath(); context.moveTo(segment[0].x, segment[0].y);
    for (let index = 1; index < segment.length; index += 1) {
      const previous = segment[index - 1]; const point = segment[index];
      context.quadraticCurveTo(previous.x, previous.y, (previous.x + point.x) * .5, (previous.y + point.y) * .5);
    }
    context.stroke();
  });
  context.restore();

  if (state.phaseId === "defense" && qaMode && !state.cleanCapture) {
    const statistics = simulation.GetStatistics();
    context.save();
    context.font = "700 9px ui-monospace, monospace";
    context.textAlign = "left";
    context.fillStyle = "rgba(224,240,234,.74)";
    context.fillText(`实时流体格 ${simulation.columns}×${simulation.rows} · 烟 ${Math.round(statistics.smokeMass)} · 水 ${Math.round(statistics.waterMass)}`, 18, height - 18);
    context.restore();
  }
}

function CivilianVisualMetrics(width, civilian) {
  const actorReferenceHeight = actorProfiles.leader.height * 39 * (Math.min(width, 1100) / 26 * .038);
  const lineScale = Math.max(.68, Math.min(1.18, actorReferenceHeight / 108));
  if (civilian.id === "wounded") {
    return {
      bodyHeight: actorReferenceHeight * .42,
      bodyWidth: actorReferenceHeight * .88,
      headRadius: actorReferenceHeight * .06,
      visualHeight: actorReferenceHeight * .54,
      shoulder: actorReferenceHeight * .12,
      waist: actorReferenceHeight * .07,
      lineScale
    };
  }
  const child = civilian.id === "childAn" || civilian.id === "childShi";
  const signalman = civilian.id === "signalman";
  const bodyHeight = actorReferenceHeight * (child ? .47 : signalman ? .73 : .7);
  const headRadius = actorReferenceHeight * (child ? .062 : .064);
  return {
    bodyHeight,
    bodyWidth: actorReferenceHeight * (child ? .2 : .27),
    headRadius,
    visualHeight: bodyHeight + headRadius * 2.15,
    shoulder: actorReferenceHeight * (child ? .072 : .094),
    waist: actorReferenceHeight * (child ? .045 : .058),
    lineScale
  };
}

function DrawCivilians(width, height, tunnelY) {
  if (state.levelIndex !== 0 || !state.civilians.length) return;
  const civilianLooks = {
    elders: { coat: "#817b69", pants: "#444a43", scarf: "#a69a7d" },
    stretcher: { coat: "#66847a", pants: "#384942", scarf: "#b5a47a" },
    children: { coat: "#aa8248", pants: "#464b40", scarf: "#9b493f" }
  };
  for (const civilian of state.civilians) {
    const x = WorldToScreen(civilian.x, width);
    const floorY = TunnelFloorYAt(civilian.x, height, tunnelY) - 1;
    const moving = Math.abs(civilian.targetX - civilian.x) > .04;
    const gait = moving ? Math.sin(state.elapsed * 8 + civilian.x * 1.7) : 0;
    const dose = Math.max(civilian.smokeDose, civilian.waterDose);
    const metrics = CivilianVisualMetrics(width, civilian);
    const { bodyHeight, headRadius, visualHeight, shoulder, waist, lineScale } = metrics;
    context.save();
    context.translate(x, floorY);
    context.globalAlpha = state.player.layer === "surface" ? .74 : .98;
    context.fillStyle = "rgba(5,8,8,.46)"; context.beginPath(); context.ellipse(0, 2, civilian.id === "wounded" ? metrics.bodyWidth * .55 : shoulder * 1.25, 4.5 * lineScale, 0, 0, Math.PI * 2); context.fill();
    if (civilian.group === "stretcher" && civilian.id === "wounded") {
      const halfWidth = metrics.bodyWidth * .5;
      context.strokeStyle = "#2c241b"; context.lineWidth = 5 * lineScale;
      context.beginPath(); context.moveTo(-halfWidth, -4); context.lineTo(halfWidth, -4); context.moveTo(-halfWidth * .86, -bodyHeight * .72); context.lineTo(halfWidth * .86, -bodyHeight * .72); context.stroke();
      context.strokeStyle = "#a87a46"; context.lineWidth = 2.8 * lineScale; context.stroke();
      context.fillStyle = "#65776f"; context.strokeStyle = "rgba(226,209,167,.62)"; context.lineWidth = 1.4 * lineScale;
      context.beginPath(); context.moveTo(-halfWidth * .78, -6); context.lineTo(-halfWidth * .61, -bodyHeight * .78); context.lineTo(halfWidth * .62, -bodyHeight * .78); context.lineTo(halfWidth * .8, -6); context.closePath(); context.fill(); context.stroke();
      context.fillStyle = "#c98e6b"; context.beginPath(); context.arc(halfWidth * .61, -bodyHeight * .9, headRadius, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#d6c9aa"; context.fillRect(-halfWidth * .31, -bodyHeight * .73, halfWidth * .55, bodyHeight * .48);
    } else {
      const look = civilianLooks[civilian.group];
      context.strokeStyle = "rgba(24,22,18,.92)"; context.lineWidth = 5.2 * lineScale; context.lineCap = "round";
      context.beginPath(); context.moveTo(-waist * .62, -bodyHeight * .35); context.lineTo(-waist * .75 + gait * 3 * lineScale, -2); context.moveTo(waist * .62, -bodyHeight * .35); context.lineTo(waist * .75 - gait * 3 * lineScale, -2); context.stroke();
      context.strokeStyle = look.pants; context.lineWidth = 2.8 * lineScale; context.stroke();
      context.fillStyle = look.coat;
      context.beginPath(); context.moveTo(-shoulder, -bodyHeight * .78); context.quadraticCurveTo(0, -bodyHeight * 1.02, shoulder, -bodyHeight * .78); context.lineTo(waist, -bodyHeight * .35); context.lineTo(-waist, -bodyHeight * .35); context.closePath(); context.fill();
      context.strokeStyle = "rgba(30,25,20,.9)"; context.lineWidth = 3.3 * lineScale; context.stroke();
      context.strokeStyle = "rgba(238,216,171,.66)"; context.lineWidth = 1.25 * lineScale; context.stroke();
      context.strokeStyle = look.coat; context.lineWidth = 3.1 * lineScale; context.beginPath(); context.moveTo(-shoulder * .8, -bodyHeight * .73); context.lineTo(-shoulder - 3 * lineScale, -bodyHeight * .42); context.moveTo(shoulder * .8, -bodyHeight * .73); context.lineTo(shoulder + 3 * lineScale, -bodyHeight * .45); context.stroke();
      context.fillStyle = look.scarf; context.fillRect(-waist * 1.2, -bodyHeight * .42, waist * 2.4, 3 * lineScale);
      const headY = -bodyHeight - headRadius * .92;
      context.fillStyle = "rgba(28,23,19,.92)"; context.beginPath(); context.arc(0, headY, headRadius + 2 * lineScale, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#c99370"; context.beginPath(); context.arc(0, headY, headRadius, 0, Math.PI * 2); context.fill();
      context.fillStyle = civilian.group === "elders" ? "#aaa697" : "#302821"; context.beginPath(); context.arc(-.5 * lineScale, headY - headRadius * .32, headRadius * .96, Math.PI, Math.PI * 2); context.fill();
      if (civilian.id === "signalman") { context.strokeStyle = "#ad8550"; context.lineWidth = 2.5 * lineScale; context.beginPath(); context.moveTo(shoulder + 2, -bodyHeight * .45); context.lineTo(shoulder * 1.75, -2); context.stroke(); }
      if (civilian.id === "medic") { const patch = Math.max(5, bodyHeight * .12); context.fillStyle = "#d8d1b7"; context.fillRect(-patch / 2, -bodyHeight * .67, patch, patch); context.fillStyle = "#688c82"; context.fillRect(-lineScale, -bodyHeight * .66, 2 * lineScale, patch * .72); context.fillRect(-patch * .36, -bodyHeight * .65 + patch * .25, patch * .72, 2 * lineScale); }
    }
    const badgeY = -visualHeight - 15 * lineScale;
    const badgeSize = Math.max(15, 16 * lineScale);
    context.fillStyle = dose > 65 ? "#e46150" : "rgba(235,231,210,.9)";
    context.fillRect(-badgeSize / 2, badgeY - badgeSize / 2, badgeSize, badgeSize);
    context.fillStyle = "#172123"; context.font = `900 ${Math.max(7, 7 * lineScale)}px system-ui`; context.textAlign = "center"; context.fillText(civilian.mark, 0, badgeY + 2.5 * lineScale);
    if (dose > 4) {
      context.strokeStyle = dose > 65 ? "#ef6657" : "#d2ad67"; context.lineWidth = 2 * lineScale;
      context.strokeRect(-badgeSize / 2 - 2, badgeY - badgeSize / 2 - 2, badgeSize + 4, badgeSize + 4);
      context.fillStyle = dose > 65 ? "#ef6657" : "#d2ad67";
      context.fillRect(-badgeSize / 2, badgeY + badgeSize / 2 + 3, badgeSize * Math.min(1, dose / 100), 2 * lineScale);
    }
    context.restore();
  }
}

function DrawRaidDestruction(width, height, surfaceY) {
  if (state.levelIndex !== 0 || state.phaseId !== "defense") return;
  const intensity = Math.min(1, state.raid.elapsed / 42);
  const damagedHouses = [-5.2, 4.4, 8.3];
  context.save();
  for (let index = 0; index < damagedHouses.length; index += 1) {
    if (state.raid.elapsed < 12 + index * 8) continue;
    const x = LayerToScreen(damagedHouses[index], width, .76);
    const baseY = surfaceY - 52 - (index % 2) * 8;
    context.strokeStyle = `rgba(35,27,24,${.36 + intensity * .35})`; context.lineWidth = 5;
    context.beginPath(); context.moveTo(x - 23, baseY - 18); context.lineTo(x - 5, baseY - 3); context.lineTo(x - 13, baseY + 16); context.moveTo(x + 18, baseY - 22); context.lineTo(x + 4, baseY + 8); context.stroke();
    for (let particle = 0; particle < 7; particle += 1) {
      const cycle = (state.elapsed * (.18 + particle * .009) + particle * .17 + index * .23) % 1;
      const driftX = Math.sin(particle * 2.9 + state.elapsed) * 14 * cycle;
      context.fillStyle = `rgba(104,91,77,${(1 - cycle) * .28})`;
      context.beginPath(); context.arc(x + driftX, baseY - cycle * 72, 5 + particle % 3 * 2, 0, Math.PI * 2); context.fill();
    }
  }
  if (state.raid.elapsed > 8) {
    const fireX = WorldToScreen(9.55, width);
    const flame = 16 + Math.sin(state.elapsed * 9) * 4;
    context.fillStyle = "rgba(223,117,49,.72)"; context.beginPath(); context.moveTo(fireX - 8, surfaceY); context.quadraticCurveTo(fireX - 5, surfaceY - flame, fireX, surfaceY - flame - 13); context.quadraticCurveTo(fireX + 10, surfaceY - flame * .6, fireX + 7, surfaceY); context.fill();
    context.fillStyle = "rgba(245,198,91,.82)"; context.beginPath(); context.moveTo(fireX - 3, surfaceY); context.quadraticCurveTo(fireX, surfaceY - flame * .7, fireX + 2, surfaceY - flame); context.quadraticCurveTo(fireX + 5, surfaceY - 5, fireX + 4, surfaceY); context.fill();
  }
  context.restore();
}

function DrawSoundRings(x, y, age, color) {
  for (let index = 0; index < 3; index += 1) {
    const phase = (age * 1.35 + index * .29) % 1;
    context.strokeStyle = color.replace("ALPHA", String((1 - phase) * .62));
    context.lineWidth = 2.2 - phase * 1.2;
    context.beginPath();
    context.arc(x, y, 16 + phase * 58, -.88, .88);
    context.stroke();
  }
}

function DrawPawMark(x, y, rotation, alpha = 1) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.globalAlpha = alpha;
  context.fillStyle = "rgba(5,10,11,.86)";
  context.beginPath(); context.ellipse(0, 2, 6.8, 7.4, 0, 0, Math.PI * 2); context.fill();
  [-5, 0, 5].forEach((toeX, index) => { context.beginPath(); context.arc(toeX, -5 - (index === 1 ? 2 : 0), 3.2, 0, Math.PI * 2); context.fill(); });
  context.fillStyle = "#efb85c";
  context.beginPath(); context.ellipse(0, 2, 4.2, 4.8, 0, 0, Math.PI * 2); context.fill();
  [-4.2, 0, 4.2].forEach((toeX, index) => { context.beginPath(); context.arc(toeX, -4.4 - (index === 1 ? 1.8 : 0), 1.9, 0, Math.PI * 2); context.fill(); });
  context.restore();
}

function DrawSurfaceDiversions(width, height, surfaceY) {
  if (state.levelIndex !== 0) return;
  const bellAction = state.level.actions.find((action) => action.id === "ringAlarmBell");
  const bellX = WorldToScreen(bellAction?.diversion?.targetX ?? .75, width);
  const bellActive = ActiveDiversion("bell");
  const bellAge = bellActive ? state.raid.distraction.age : 0;
  const bellSwing = bellActive ? Math.sin(bellAge * 12) * .18 * Math.max(.15, 1 - bellAge / 14) : 0;
  context.save();
  context.strokeStyle = "#6f4e31"; context.lineWidth = 7; context.lineCap = "round";
  context.beginPath(); context.moveTo(bellX - 32, surfaceY); context.lineTo(bellX - 27, surfaceY - 137); context.moveTo(bellX + 32, surfaceY); context.lineTo(bellX + 27, surfaceY - 137); context.moveTo(bellX - 35, surfaceY - 134); context.lineTo(bellX + 35, surfaceY - 134); context.stroke();
  context.strokeStyle = "rgba(222,174,101,.46)"; context.lineWidth = 2;
  context.beginPath(); context.moveTo(bellX - 26, surfaceY - 130); context.lineTo(bellX + 26, surfaceY - 130); context.stroke();
  context.save(); context.translate(bellX, surfaceY - 104); context.rotate(bellSwing);
  const bellGradient = context.createLinearGradient(-17, -24, 18, 8); bellGradient.addColorStop(0, "#6d4c2f"); bellGradient.addColorStop(.48, "#d2a45b"); bellGradient.addColorStop(1, "#775435");
  context.fillStyle = bellGradient; context.beginPath(); context.moveTo(-7, -23); context.quadraticCurveTo(-19, -12, -21, 8); context.quadraticCurveTo(0, 18, 21, 8); context.quadraticCurveTo(19, -12, 7, -23); context.closePath(); context.fill();
  context.strokeStyle = "#ecc77d"; context.lineWidth = 2; context.stroke();
  context.fillStyle = "#44301f"; context.beginPath(); context.arc(0, 13, 5, 0, Math.PI * 2); context.fill();
  context.strokeStyle = "#b58b52"; context.lineWidth = 2.5; context.beginPath(); context.moveTo(0, -25); context.lineTo(0, -33); context.stroke(); context.restore();
  const ropeX = WorldToScreen(bellAction?.x ?? 1.85, width);
  context.strokeStyle = "#a47a47"; context.lineWidth = 2.5; context.beginPath(); context.moveTo(bellX + 8, surfaceY - 96); context.quadraticCurveTo(ropeX - 5, surfaceY - 58, ropeX, surfaceY - 4); context.stroke();
  if (bellActive) DrawSoundRings(bellX, surfaceY - 102, bellAge, "rgba(235,194,101,ALPHA)");

  const crackerAction = state.level.actions.find((action) => action.id === "throwFirecrackers");
  const crackerSourceX = WorldToScreen(crackerAction?.x ?? 9.35, width);
  const crackersActive = ActiveDiversion("crackers");
  if (state.phaseId === "defense" && !state.completed.has("throwFirecrackers")) {
    context.strokeStyle = "#b74236"; context.lineWidth = 4; context.beginPath(); context.moveTo(crackerSourceX - 17, surfaceY - 8); context.lineTo(crackerSourceX + 13, surfaceY - 17); context.stroke();
    for (let index = 0; index < 5; index += 1) {
      context.fillStyle = index % 2 ? "#d65a43" : "#a8342f"; context.fillRect(crackerSourceX - 13 + index * 6, surfaceY - 19 - index * 1.5, 5, 10);
    }
    context.strokeStyle = "#d8b66b"; context.lineWidth = 1.5; context.beginPath(); context.moveTo(crackerSourceX + 14, surfaceY - 18); context.quadraticCurveTo(crackerSourceX + 21, surfaceY - 26, crackerSourceX + 25, surfaceY - 21); context.stroke();
  }
  if (crackersActive) {
    const diversion = state.raid.distraction;
    const targetX = WorldToScreen(diversion.targetX, width);
    const flightDuration = 1.05;
    const flightProgress = Math.min(1, diversion.age / flightDuration);
    const trajectoryPoint = (progress) => ({
      x: Lerp(crackerSourceX, targetX, progress),
      y: surfaceY - 19 - Math.sin(progress * Math.PI) * 108 + progress * 8
    });
    const drawCrackerBundle = (progress, alpha, scale = 1) => {
      const point = trajectoryPoint(progress);
      context.save(); context.translate(point.x, point.y); context.rotate(progress * 9.5 - .35); context.scale(scale, scale); context.globalAlpha = alpha;
      context.fillStyle = "rgba(24,10,9,.9)"; context.fillRect(-15, -6, 30, 12);
      context.fillStyle = "#df4d38"; context.fillRect(-13, -4, 26, 8);
      context.fillStyle = "#f18c55"; [-8, 0, 8].forEach((stripeX) => context.fillRect(stripeX - 1.2, -4, 2.4, 8));
      context.strokeStyle = "#f3c36d"; context.lineWidth = 2; context.beginPath(); context.moveTo(13, 0); context.quadraticCurveTo(19, -7, 22, -2); context.stroke();
      context.fillStyle = "#ffe094"; context.beginPath(); context.arc(22, -2, 2.5, 0, Math.PI * 2); context.fill();
      context.restore();
    };

    context.strokeStyle = "rgba(20,11,10,.78)"; context.lineWidth = 6; context.setLineDash([10, 8]);
    context.beginPath(); context.moveTo(crackerSourceX, surfaceY - 19); context.quadraticCurveTo((crackerSourceX + targetX) / 2, surfaceY - 128, targetX, surfaceY - 11); context.stroke();
    context.strokeStyle = "rgba(244,167,76,.9)"; context.lineWidth = 2.5;
    context.beginPath(); context.moveTo(crackerSourceX, surfaceY - 19); context.quadraticCurveTo((crackerSourceX + targetX) / 2, surfaceY - 128, targetX, surfaceY - 11); context.stroke(); context.setLineDash([]);

    const trailProgresses = flightProgress < 1
      ? [flightProgress - .42, flightProgress - .28, flightProgress - .14, flightProgress]
      : [.22, .43, .64, .84];
    trailProgresses.filter((progress) => progress > .02).forEach((progress, index) => {
      const landedFade = flightProgress === 1 ? Math.max(.26, 1 - (diversion.age - flightDuration) / 12) : 1;
      drawCrackerBundle(progress, (.44 + index * .14) * landedFade, .86 + index * .075);
    });

    if (flightProgress < 1) drawCrackerBundle(flightProgress, 1, 1.08);
    else {
      const burstAge = diversion.age - flightDuration;
      const pulse = .78 + Math.sin(burstAge * 19) * .18;
      const burstGlow = context.createRadialGradient(targetX, surfaceY - 12, 2, targetX, surfaceY - 12, 34);
      burstGlow.addColorStop(0, `rgba(255,225,132,${.72 * pulse})`); burstGlow.addColorStop(.45, `rgba(231,93,49,${.32 * pulse})`); burstGlow.addColorStop(1, "rgba(231,93,49,0)");
      context.fillStyle = burstGlow; context.beginPath(); context.arc(targetX, surfaceY - 12, 34, 0, Math.PI * 2); context.fill();
      context.fillStyle = "rgba(35,21,18,.75)"; context.beginPath(); context.ellipse(targetX, surfaceY - 3, 28, 6, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#cf4937"; [-12, -2, 10].forEach((offset, index) => { context.save(); context.translate(targetX + offset, surfaceY - 11 - (index % 2) * 4); context.rotate((index - 1) * .45); context.fillRect(-7, -2.5, 14, 5); context.restore(); });
      context.strokeStyle = "rgba(246,126,66,.94)"; context.lineWidth = 2.6;
      for (let ray = 0; ray < 12; ray += 1) {
        const angle = ray * Math.PI / 6 + burstAge * 1.2;
        context.beginPath(); context.moveTo(targetX + Math.cos(angle) * 9, surfaceY - 12 + Math.sin(angle) * 9); context.lineTo(targetX + Math.cos(angle) * (21 + (ray % 3) * 4), surfaceY - 12 + Math.sin(angle) * (21 + (ray % 3) * 4)); context.stroke();
      }
      DrawSoundRings(targetX, surfaceY - 12, burstAge, "rgba(239,105,61,ALPHA)");
    }

    const investigatingEnemies = GetEnemyPatrols().filter((enemy) => enemy.investigating);
    const enemyProfile = actorProfiles.soldier;
    const enemyScale = Math.min(width, 1100) / 26 * .038;
    const enemyHeight = enemyProfile.height * 39 * enemyScale;
    context.setLineDash([6, 6]); context.lineWidth = 2.5;
    investigatingEnemies.forEach((enemy) => {
      const enemyX = WorldToScreen(enemy.x, width);
      const questionY = surfaceY - 5 - enemyHeight - 13;
      const enemyY = questionY + 20;
      const controlY = surfaceY - 142 - Math.abs(enemyX - targetX) * .08;
      context.strokeStyle = "rgba(245,125,66,.78)";
      context.beginPath(); context.moveTo(targetX, surfaceY - 35); context.quadraticCurveTo((targetX + enemyX) / 2, controlY, enemyX, enemyY); context.stroke();
      const direction = Math.sign(enemyX - targetX) || 1;
      context.fillStyle = "rgba(255,177,88,.96)"; context.beginPath(); context.moveTo(enemyX, enemyY); context.lineTo(enemyX - direction * 12, enemyY - 6); context.lineTo(enemyX - direction * 9, enemyY + 7); context.closePath(); context.fill();
    });
    context.setLineDash([]);
    investigatingEnemies.forEach((enemy) => {
      const enemyX = WorldToScreen(enemy.x, width);
      const questionY = surfaceY - 5 - enemyHeight - 13;
      context.fillStyle = "rgba(7,12,14,.94)"; context.fillRect(enemyX - 10, questionY - 10, 20, 20);
      context.strokeStyle = "rgba(246,146,75,.9)"; context.lineWidth = 1.5; context.strokeRect(enemyX - 9.25, questionY - 9.25, 18.5, 18.5);
      context.fillStyle = "#ffe09a"; context.font = "900 14px system-ui"; context.textAlign = "center"; context.fillText("?", enemyX, questionY + 5);
    });
  }
  context.restore();
}

function DrawDogBarkLure(width, surfaceY) {
  const lure = ActivePatrolLure("dogBark");
  if (!lure) return;
  const sourceX = WorldToScreen(lure.sourceX, width);
  const sourceY = surfaceY - 46;
  const progress = Math.max(0, Math.min(1, lure.age / lure.duration));
  const pulseAge = lure.age % 1.18;
  const pulseProgress = pulseAge / 1.18;
  const alpha = 1 - pulseProgress;
  const enemyCount = GetEnemyPatrols().filter((enemy) => enemy.lureKind === "dogBark").length;
  const seconds = Math.max(0, Math.ceil(lure.remaining));
  const cardWidth = width <= 640 ? 142 : 174;
  const cardX = Math.max(8, Math.min(width - cardWidth - 8, sourceX - cardWidth - 14));
  const cardY = Math.max(72, sourceY - 94);

  context.save();
  context.lineCap = "round";
  context.strokeStyle = `rgba(239,194,105,${.82 * alpha})`;
  context.lineWidth = width <= 640 ? 2 : 2.6;
  [0, 1, 2].forEach((index) => {
    const radius = 15 + pulseProgress * 48 + index * 9;
    context.beginPath();
    context.arc(sourceX, sourceY, radius, -1.2, 1.2);
    context.stroke();
  });
  context.fillStyle = "rgba(10,14,14,.94)";
  context.fillRect(cardX, cardY, cardWidth, 42);
  context.fillStyle = "#d89b4f";
  context.fillRect(cardX, cardY, 5, 42);
  context.strokeStyle = "rgba(238,218,179,.26)";
  context.lineWidth = 1;
  context.strokeRect(cardX + .5, cardY + .5, cardWidth - 1, 41);
  context.fillStyle = "#f3ead5";
  context.font = `900 ${width <= 640 ? 10 : 12}px system-ui, sans-serif`;
  context.textAlign = "left";
  context.fillText(`阿土吠声 · ${enemyCount} 名追声`, cardX + 13, cardY + 17);
  context.fillStyle = "#8fe2d9";
  context.font = `700 ${width <= 640 ? 9 : 10}px system-ui, sans-serif`;
  context.fillText(`敌兵离岗｜空档还剩 ${seconds} 秒`, cardX + 13, cardY + 33);

  const corridorStart = Math.max(sourceX + 72, width * .28);
  const corridorEnd = Math.min(width - 28, corridorStart + width * .2);
  if (corridorEnd - corridorStart > 52 && progress < .92) {
    const corridorY = surfaceY - 12;
    context.fillStyle = "rgba(69,174,166,.15)"; context.fillRect(corridorStart, corridorY - 5, corridorEnd - corridorStart, 10);
    context.strokeStyle = "rgba(110,222,211,.82)";
    context.lineWidth = 2.4;
    context.beginPath(); context.moveTo(corridorStart, corridorY - 7); context.lineTo(corridorStart, corridorY + 7); context.lineTo(corridorEnd, corridorY + 7); context.lineTo(corridorEnd, corridorY - 7); context.stroke();
    const corridorCenter = (corridorStart + corridorEnd) / 2;
    context.fillStyle = "rgba(8,13,14,.9)"; context.fillRect(corridorCenter - 38, corridorY - 27, 76, 18);
    context.fillStyle = "#baf2ec"; context.font = "800 10px system-ui, sans-serif"; context.textAlign = "center"; context.fillText("通路已打开", corridorCenter, corridorY - 14);
  }
  context.restore();
}

function DrawDogCommandEnvironment(width, height, surfaceY, tunnelY) {
  if (state.levelIndex !== 0) return;
  const targets = [
    { id: "whistleDraftGap", x: -5.85, kind: "draft" },
    { id: "whistleSmokeLatch", x: 8.95, kind: "smoke" }
  ];
  context.save();
  targets.forEach((target) => {
    const x = WorldToScreen(target.x, width);
    const floorY = TunnelFloorYAt(target.x, height, tunnelY) - 3;
    const completed = state.completed.has(target.id);
    context.fillStyle = "rgba(224,166,77,.12)"; context.beginPath(); context.ellipse(x, floorY - 11, 44, 27, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#05090a"; context.beginPath(); context.ellipse(x, floorY - 15, 38, 22, 0, Math.PI, Math.PI * 2); context.lineTo(x + 38, floorY); context.lineTo(x - 38, floorY); context.closePath(); context.fill();
    context.strokeStyle = "rgba(8,12,12,.92)"; context.lineWidth = 7; context.beginPath(); context.ellipse(x, floorY - 15, 38, 22, 0, Math.PI, Math.PI * 2); context.stroke();
    context.strokeStyle = completed ? "rgba(96,225,216,.95)" : "rgba(235,177,82,.94)"; context.lineWidth = 3; context.beginPath(); context.ellipse(x, floorY - 15, 38, 22, 0, Math.PI, Math.PI * 2); context.stroke();
    context.strokeStyle = "rgba(116,83,49,.8)"; context.lineWidth = 3;
    [-23, -8, 8, 23].forEach((offset) => { context.beginPath(); context.moveTo(x + offset, floorY - 31); context.lineTo(x + offset, floorY - 2); context.stroke(); });
    DrawPawMark(x - 25, floorY - 4, .18, .82); DrawPawMark(x - 8, floorY - 6, -.16, .94); DrawPawMark(x + 12, floorY - 8, .14, 1);
    if (target.kind === "draft") {
      const clothWave = Math.sin(state.elapsed * 4) * 5;
      context.strokeStyle = "#9d7848"; context.lineWidth = 2; context.beginPath(); context.moveTo(x + 23, floorY - 27); context.lineTo(x + 23, floorY - 48); context.stroke();
      context.fillStyle = completed ? "#6ab6b0" : "#c6b37b"; context.beginPath(); context.moveTo(x + 24, floorY - 46); context.quadraticCurveTo(x + 38, floorY - 48 + clothWave, x + 44, floorY - 39); context.lineTo(x + 24, floorY - 38); context.closePath(); context.fill();
    } else {
      const ropeTop = TunnelCeilingYAt(target.x, height, tunnelY) + 14;
      context.strokeStyle = completed ? "#68c9c6" : "#c39759"; context.lineWidth = 3; context.beginPath(); context.moveTo(x + 20, ropeTop); context.quadraticCurveTo(x + (completed ? 7 : 24), (ropeTop + floorY) / 2, x + (completed ? 2 : 19), floorY - 7); context.stroke();
      context.fillStyle = completed ? "#63b9b4" : "#8b6b43"; context.fillRect(x - 23, ropeTop - 5, 46, 8);
    }
  });

  const activeAction = state.dog.commandId ? state.level.actions.find((item) => item.id === state.dog.commandId) : null;
  if (activeAction) {
    const dogX = WorldToScreen(state.dog.x, width);
    const dogY = state.dog.layer === "surface" ? surfaceY - 15 : TunnelFloorYAt(state.dog.x, height, tunnelY) - 14;
    const targetX = WorldToScreen(activeAction.dogCommand.targetX, width);
    const targetY = activeAction.dogCommand.targetLayer === "surface" ? surfaceY - 14 : TunnelFloorYAt(activeAction.dogCommand.targetX, height, tunnelY) - 15;
    context.strokeStyle = "rgba(5,10,11,.86)"; context.lineWidth = 7; context.setLineDash([10, 8]);
    context.beginPath(); context.moveTo(dogX, dogY); context.quadraticCurveTo((dogX + targetX) / 2, Math.min(dogY, targetY) - 42, targetX, targetY); context.stroke();
    context.strokeStyle = "rgba(239,184,88,.94)"; context.lineWidth = 2.8;
    context.beginPath(); context.moveTo(dogX, dogY); context.quadraticCurveTo((dogX + targetX) / 2, Math.min(dogY, targetY) - 42, targetX, targetY); context.stroke(); context.setLineDash([]);
    for (let step = 1; step <= 7; step += 1) {
      const progress = step / 8;
      const pawX = Lerp(dogX, targetX, progress);
      const pawY = Lerp(dogY, targetY, progress) - Math.sin(progress * Math.PI) * 22 + (step % 2 ? -5 : 5);
      DrawPawMark(pawX, pawY, (step % 2 ? -.18 : .18), .46 + step * .075);
    }
  }

  if (state.dog.whistlePulse > 0 && state.selectedRole === "leader") {
    const actorX = WorldToScreen(state.player.x, width);
    const actorY = state.player.layer === "surface" ? surfaceY - 66 : TunnelFloorYAt(state.player.x, height, tunnelY) - 62;
    const age = 1.15 - state.dog.whistlePulse;
    DrawSoundRings(actorX + state.player.facing * 15, actorY, age, "rgba(109,226,220,ALPHA)");
  }
  context.restore();
}

function SignedDistanceToRectangle(x, y, centerX, centerY, halfWidth, halfHeight) {
  const distanceX = Math.abs(x - centerX) - halfWidth;
  const distanceY = Math.abs(y - centerY) - halfHeight;
  const outside = Math.hypot(Math.max(distanceX, 0), Math.max(distanceY, 0));
  return outside + Math.min(Math.max(distanceX, distanceY), 0);
}

function ScreenToWorld(screenX, width) {
  const scale = width / (22 / state.camera.zoom);
  return state.camera.x + (screenX - width / 2) / scale;
}

function SurfaceLightSdf(screenX, screenY, width, surfaceY) {
  let distance = surfaceY - screenY;
  const houses = [-9, -5.2, -.2, 4.4, 8.3];
  houses.forEach((worldX, index) => {
    const houseX = LayerToScreen(worldX, width, .76);
    const size = 55 + (index % 2) * 12;
    distance = Math.min(distance, SignedDistanceToRectangle(screenX, screenY, houseX, surfaceY - size * .36, size * .55, size * .36));
  });
  for (const cover of GetSurfaceCovers()) {
    const coverX = WorldToScreen(cover.x, width);
    const coverWidth = Math.max(44, cover.width * width / (22 / state.camera.zoom));
    distance = Math.min(distance, SignedDistanceToRectangle(screenX, screenY, coverX, surfaceY - 32, coverWidth * .48, 34));
  }
  if (state.player.layer === "surface") {
    const profile = actorProfiles[state.selectedRole];
    const playerX = WorldToScreen(state.player.x, width);
    distance = Math.min(distance, SignedDistanceToRectangle(screenX, screenY, playerX, surfaceY - (profile.animal ? 13 : 28), profile.animal ? 15 : 8, profile.animal ? 13 : 28));
  }
  if (state.levelIndex === 0 && state.selectedRole !== "dog" && state.dog.layer === "surface") {
    const dogX = WorldToScreen(state.dog.x, width);
    distance = Math.min(distance, SignedDistanceToRectangle(screenX, screenY, dogX, surfaceY - 13, 15, 13));
  }
  return distance;
}

function TunnelLightSdf(screenX, screenY, width, height, surfaceY, tunnelY) {
  if (screenY < surfaceY) return -1;
  const worldX = ScreenToWorld(screenX, width);
  const ceilingY = TunnelCeilingYAt(worldX, height, tunnelY);
  const floorY = TunnelFloorYAt(worldX, height, tunnelY);
  let distance = Math.min(screenY - ceilingY, floorY - screenY);
  for (let supportX = -10; supportX <= 10; supportX += 1.8) {
    if (entrances.some((entrance) => Math.abs(entrance - supportX) < .75)) continue;
    const x = WorldToScreen(supportX, width);
    const centerY = TunnelCenterYAt(supportX, tunnelY);
    const halfHeight = TunnelHalfHeightAt(supportX, height);
    distance = Math.min(distance, SignedDistanceToRectangle(screenX, screenY, x + 4, centerY, 3.4, halfHeight - 9));
  }
  for (const civilian of state.civilians) {
    const x = WorldToScreen(civilian.x, width);
    const floorY = TunnelFloorYAt(civilian.x, height, tunnelY);
    const metrics = CivilianVisualMetrics(width, civilian);
    distance = Math.min(distance, SignedDistanceToRectangle(screenX, screenY, x, floorY - metrics.visualHeight * .5, civilian.id === "wounded" ? metrics.bodyWidth * .52 : metrics.shoulder * 1.08, metrics.visualHeight * .5));
  }
  if (state.player.layer === "tunnel") {
    const profile = actorProfiles[state.selectedRole];
    const x = WorldToScreen(state.player.x, width);
    const floorY = TunnelFloorYAt(state.player.x, height, tunnelY);
    const bodyHeight = profile.animal ? 24 : 48;
    distance = Math.min(distance, SignedDistanceToRectangle(screenX, screenY, x, floorY - bodyHeight * .5, profile.animal ? 15 : 8, bodyHeight * .5));
  }
  if (state.levelIndex === 0 && state.selectedRole !== "dog" && state.dog.layer === "tunnel") {
    const dogX = WorldToScreen(state.dog.x, width);
    const dogFloorY = TunnelFloorYAt(state.dog.x, height, tunnelY);
    distance = Math.min(distance, SignedDistanceToRectangle(screenX, screenY, dogX, dogFloorY - 12, 15, 12));
  }
  return distance;
}

function DrawLighting(width, height, surfaceY, tunnelY, daylight) {
  const surfaceLights = [];
  if (daylight < .3 || state.phaseId === "defense") {
    const lampPositions = state.levelIndex === 3 ? [-7.4, -1.5, 4.2, 8.3] : [-9, -.2, 8.3];
    lampPositions.forEach((worldX, index) => surfaceLights.push({
      x: state.levelIndex === 3 ? WorldToScreen(worldX, width) : LayerToScreen(worldX, width, .76), y: state.levelIndex === 3 ? (index < 2 ? surfaceY - 61 : RoofFloorYAt(worldX, surfaceY) - 44) : surfaceY - 43 - (index % 2) * 5,
      radius: 148, intensity: .82, glow: .24, seed: index + .4, color: "238,170,76"
    }));
    GetEnemyPatrols().forEach((enemy) => surfaceLights.push({
      x: WorldToScreen(enemy.x, width), y: LayerBaseY(enemy.layer || "surface", enemy.x, height, surfaceY, tunnelY) - 48, radius: 118, intensity: .72, glow: .17, seed: enemy.index + 5, color: "242,151,61"
    }));
  }
  if (surfaceLights.length || daylight < .4) {
    context.save(); context.beginPath(); context.rect(0, 0, width, surfaceY + 1); context.clip();
    lightRenderer.Draw(context, width, height, surfaceLights, (x, y) => SurfaceLightSdf(x, y, width, surfaceY), daylight < .3 ? .61 : .25, state.elapsed);
    context.restore();
  }

  const tunnelLights = [-7.75, 3.8, 7.72].map((worldX, index) => ({
    x: WorldToScreen(worldX, width),
    y: TunnelFloorYAt(worldX, height, tunnelY) - 25,
    radius: 205 + index * 8, intensity: .96, glow: .15, seed: index + 9, color: "240,169,72"
  }));
  context.save(); context.beginPath(); context.rect(0, surfaceY - 1, width, height - surfaceY + 1); context.clip();
  lightRenderer.Draw(context, width, height, tunnelLights, (x, y) => TunnelLightSdf(x, y, width, height, surfaceY, tunnelY), .62, state.elapsed);
  context.restore();
}

function PropSupportLift(support) {
  return ({ ground: 0, tray: -7, lowCrate: -21, plankTable: -27, jarShelf: -16, cloth: -3, pallet: -6, wellPeg: -9, crate: -27, rifleRack: -38, wallNiche: -18 })[support] ?? 0;
}

function PropVisualHeight(kind) {
  return ({ timberStack: 22, ironFittings: 26, powderJar: 34, reliefBundle: 35, capturePile: 32, hiddenLetter: 27, thimble: 29, woundedStretcher: 31, grainSacks: 34, ropeCoil: 31, soldierBoot: 28, fieldRadioMap: 48, combatRifle: 38, ammoBox: 22, combatGrenade: 27, seepBowl: 21, draftRibbon: 34, soilProbe: 39, routeMarker: 34, camoNet: 42, supportBrace: 47, drainSluice: 31, innerLatch: 37, hornValve: 42, falseHatch: 29, decoyBundle: 31 })[kind] ?? 28;
}

function DrawPropSupport(support, scale, empty) {
  context.save(); context.scale(scale, scale);
  context.fillStyle = "rgba(4,8,9,.36)";
  context.beginPath(); context.ellipse(0, 3, support === "plankTable" ? 35 : 27, 6, 0, 0, Math.PI * 2); context.fill();
  if (support === "tray") {
    context.fillStyle = "#62452d"; context.fillRect(-23, -7, 46, 8);
    context.strokeStyle = "#a37848"; context.lineWidth = 2; context.strokeRect(-23, -7, 46, 8);
  } else if (support === "lowCrate" || support === "crate") {
    const crateWidth = support === "crate" ? 43 : 36;
    const crateHeight = support === "crate" ? 27 : 21;
    context.fillStyle = "#60432b"; context.fillRect(-crateWidth / 2, -crateHeight, crateWidth, crateHeight);
    context.strokeStyle = "#9c7143"; context.lineWidth = 2; context.strokeRect(-crateWidth / 2, -crateHeight, crateWidth, crateHeight);
    context.beginPath(); context.moveTo(-crateWidth * .4, -crateHeight + 3); context.lineTo(crateWidth * .4, -3); context.moveTo(crateWidth * .4, -crateHeight + 3); context.lineTo(-crateWidth * .4, -3); context.stroke();
  } else if (support === "plankTable") {
    context.strokeStyle = "#65472e"; context.lineWidth = 5;
    context.beginPath(); context.moveTo(-29, -24); context.lineTo(-25, 0); context.moveTo(29, -24); context.lineTo(25, 0); context.stroke();
    context.fillStyle = "#876039"; context.fillRect(-36, -29, 72, 8);
    context.strokeStyle = "rgba(223,175,101,.42)"; context.lineWidth = 1.5; context.beginPath(); context.moveTo(-32, -26); context.lineTo(31, -26); context.stroke();
  } else if (support === "jarShelf") {
    context.fillStyle = "#735138"; context.fillRect(-27, -18, 54, 6);
    context.strokeStyle = "#9d7249"; context.lineWidth = 2; context.beginPath(); context.moveTo(-24, -13); context.lineTo(-20, 0); context.moveTo(24, -13); context.lineTo(20, 0); context.stroke();
    context.fillStyle = "#72513c"; context.beginPath(); context.ellipse(-12, -29, 10, 13, 0, 0, Math.PI * 2); context.fill();
    context.strokeStyle = "#a77e54"; context.beginPath(); context.moveTo(-19, -39); context.lineTo(-5, -39); context.stroke();
  } else if (support === "cloth") {
    context.fillStyle = "#436278"; context.beginPath(); context.moveTo(-23, -2); context.lineTo(-17, -13); context.lineTo(24, -9); context.lineTo(19, 0); context.closePath(); context.fill();
    context.strokeStyle = "rgba(171,205,216,.45)"; context.lineWidth = 1.5; context.stroke();
  } else if (support === "pallet") {
    context.strokeStyle = "#84603d"; context.lineWidth = 5;
    [-21, -7, 7, 21].forEach((x) => { context.beginPath(); context.moveTo(x - 7, -5); context.lineTo(x + 7, -5); context.stroke(); });
  } else if (support === "wellPeg") {
    context.strokeStyle = "#755033"; context.lineWidth = 6; context.beginPath(); context.moveTo(-18, 0); context.lineTo(-18, -43); context.stroke();
    context.strokeStyle = "#b1814c"; context.lineWidth = 2; context.beginPath(); context.arc(-13, -30, 6, -.7, 1.25); context.stroke();
  } else if (support === "rifleRack") {
    context.fillStyle = "#563b29"; context.fillRect(-43, -43, 86, 8); context.fillRect(-43, -15, 86, 7);
    context.strokeStyle = "#aa7c49"; context.lineWidth = 2; context.strokeRect(-43, -43, 86, 8); context.strokeRect(-43, -15, 86, 7);
    [-28, 28].forEach((x) => { context.strokeStyle = "#37271e"; context.lineWidth = 5; context.beginPath(); context.moveTo(x, -46); context.lineTo(x, -5); context.stroke(); });
  } else if (support === "wallNiche") {
    context.fillStyle = "rgba(15,20,18,.72)"; context.strokeStyle = "rgba(177,130,73,.55)"; context.lineWidth = 2;
    context.beginPath(); context.roundRect(-30, -44, 60, 43, 12); context.fill(); context.stroke();
    context.strokeStyle = "rgba(225,179,103,.28)"; context.beginPath(); context.moveTo(-22, -6); context.lineTo(21, -6); context.stroke();
  } else if (empty) {
    context.strokeStyle = "rgba(187,145,84,.35)"; context.lineWidth = 2;
    context.beginPath(); context.moveTo(-18, -1); context.lineTo(-7, -5); context.moveTo(3, -2); context.lineTo(17, -5); context.stroke();
  }
  context.restore();
}

function DrawPropObject(kind, scale = 1, ghost = false) {
  context.save(); context.scale(scale, scale); context.globalAlpha = ghost ? .24 : 1;
  if (ghost) context.setLineDash([4, 3]);
  if (kind === "seepBowl") {
    context.fillStyle = "#8b6546"; context.strokeStyle = "#d0a46c"; context.lineWidth = 2;
    context.beginPath(); context.ellipse(0, -5, 20, 8, 0, 0, Math.PI * 2); context.fill(); context.stroke();
    context.fillStyle = "rgba(75,156,167,.82)"; context.beginPath(); context.ellipse(0, -7, 15, 4.5, 0, 0, Math.PI * 2); context.fill();
    context.strokeStyle = "#58b8c1"; context.beginPath(); context.moveTo(-29, -2); context.quadraticCurveTo(-22, -15, -14, -7); context.moveTo(15, -8); context.quadraticCurveTo(24, -16, 30, -4); context.stroke();
  } else if (kind === "draftRibbon") {
    context.strokeStyle = "#8b623d"; context.lineWidth = 4; context.beginPath(); context.moveTo(-18, 2); context.lineTo(-18, -34); context.stroke();
    context.strokeStyle = "#d6b064"; context.lineWidth = 3; context.beginPath(); context.moveTo(-17, -29); context.bezierCurveTo(-2, -36, 8, -19, 27, -27); context.stroke();
    context.fillStyle = "#4eb9bd"; context.beginPath(); context.moveTo(27, -27); context.lineTo(17, -32); context.lineTo(20, -22); context.closePath(); context.fill();
  } else if (kind === "soilProbe") {
    context.strokeStyle = "#c0a062"; context.lineWidth = 4; context.beginPath(); context.moveTo(-22, 1); context.lineTo(15, -38); context.stroke();
    context.fillStyle = "#6f4b31"; context.fillRect(8, -44, 22, 8);
    context.strokeStyle = "#56b5b8"; context.lineWidth = 2; [-18, -3, 12].forEach((x, index) => { context.beginPath(); context.arc(x, -4 - index * 4, 4, 0, Math.PI * 2); context.stroke(); });
  } else if (kind === "routeMarker") {
    context.strokeStyle = "#805a36"; context.lineWidth = 5; context.beginPath(); context.moveTo(0, 2); context.lineTo(0, -31); context.stroke();
    context.fillStyle = "#d1aa64"; context.strokeStyle = "#3a2b20"; context.lineWidth = 2; context.beginPath(); context.moveTo(-22, -34); context.lineTo(12, -34); context.lineTo(24, -24); context.lineTo(12, -14); context.lineTo(-22, -14); context.closePath(); context.fill(); context.stroke();
    context.strokeStyle = "#a64136"; context.lineWidth = 3; context.beginPath(); context.moveTo(-13, -24); context.lineTo(13, -24); context.lineTo(8, -29); context.moveTo(13, -24); context.lineTo(8, -19); context.stroke();
  } else if (kind === "camoNet") {
    context.strokeStyle = "#796844"; context.lineWidth = 3; context.beginPath(); context.moveTo(-31, 0); context.lineTo(-27, -39); context.lineTo(28, -34); context.lineTo(31, 1); context.stroke();
    context.strokeStyle = "#a08b55"; context.lineWidth = 1.5; for (let x = -24; x <= 24; x += 12) { context.beginPath(); context.moveTo(x, -37); context.lineTo(x + 3, -1); context.stroke(); } for (let y = -31; y <= -7; y += 8) { context.beginPath(); context.moveTo(-28, y); context.lineTo(29, y + 4); context.stroke(); }
    context.fillStyle = "#5f694b"; [-20, -5, 11, 22].forEach((x, index) => { context.beginPath(); context.ellipse(x, -28 + index % 2 * 12, 8, 3, -.5, 0, Math.PI * 2); context.fill(); });
  } else if (kind === "supportBrace") {
    context.strokeStyle = "#30251c"; context.lineWidth = 9; context.beginPath(); context.moveTo(-24, 2); context.lineTo(-20, -43); context.moveTo(24, 2); context.lineTo(20, -43); context.moveTo(-24, -40); context.lineTo(24, -40); context.stroke();
    context.strokeStyle = "#a57543"; context.lineWidth = 5; context.beginPath(); context.moveTo(-24, 2); context.lineTo(-20, -43); context.moveTo(24, 2); context.lineTo(20, -43); context.moveTo(-24, -40); context.lineTo(24, -40); context.stroke();
    context.fillStyle = "#d1a05d"; context.beginPath(); context.arc(0, -40, 5, 0, Math.PI * 2); context.fill();
  } else if (kind === "drainSluice") {
    context.fillStyle = "#5d4934"; context.strokeStyle = "#c09659"; context.lineWidth = 2; context.fillRect(-19, -27, 38, 25); context.strokeRect(-19, -27, 38, 25);
    context.strokeStyle = "#56b8c2"; context.lineWidth = 3; context.beginPath(); context.moveTo(-30, 2); context.quadraticCurveTo(-9, -8, 7, 1); context.quadraticCurveTo(19, 7, 31, 0); context.stroke();
    context.strokeStyle = "#d0aa66"; context.beginPath(); context.moveTo(0, -38); context.lineTo(0, -19); context.stroke();
  } else if (kind === "innerLatch") {
    context.fillStyle = "#7c5a38"; context.strokeStyle = "#d0a15f"; context.lineWidth = 2; context.fillRect(-31, -29, 62, 8); context.strokeRect(-31, -29, 62, 8); context.fillRect(-23, -13, 46, 7); context.strokeRect(-23, -13, 46, 7);
    context.strokeStyle = "#5bb9bc"; context.lineWidth = 2; context.beginPath(); context.moveTo(25, -24); context.quadraticCurveTo(35, -10, 27, 3); context.stroke();
  } else if (kind === "hornValve") {
    context.fillStyle = "#a97d49"; context.strokeStyle = "#e0bd76"; context.lineWidth = 2; context.beginPath(); context.moveTo(-25, -18); context.lineTo(13, -32); context.lineTo(13, -5); context.closePath(); context.fill(); context.stroke();
    context.strokeStyle = "#747a68"; context.lineWidth = 7; context.beginPath(); context.moveTo(13, -18); context.lineTo(31, -18); context.stroke();
    context.fillStyle = "#a64236"; context.beginPath(); context.arc(27, -37, 8, 0, Math.PI * 2); context.fill(); context.strokeStyle = "#e0bd76"; context.lineWidth = 2; context.beginPath(); context.moveTo(27, -37); context.lineTo(27, -18); context.stroke();
  } else if (kind === "falseHatch") {
    context.fillStyle = "#705038"; context.strokeStyle = "#d0a15f"; context.lineWidth = 2; context.beginPath(); context.moveTo(-29, -7); context.lineTo(23, -25); context.lineTo(31, -7); context.lineTo(-20, 9); context.closePath(); context.fill(); context.stroke();
    context.strokeStyle = "#35271f"; context.beginPath(); context.moveTo(-15, -12); context.lineTo(-7, 4); context.moveTo(2, -18); context.lineTo(10, -2); context.stroke();
  } else if (kind === "decoyBundle") {
    context.fillStyle = "#403332"; context.beginPath(); context.moveTo(-20, -5); context.lineTo(-15, -27); context.lineTo(0, -26); context.lineTo(3, -11); context.lineTo(21, -8); context.lineTo(24, 1); context.lineTo(-21, 1); context.closePath(); context.fill();
    context.strokeStyle = "#c18e50"; context.lineWidth = 4; [8, 13, 18].forEach((radius) => { context.beginPath(); context.arc(19, -22, radius, 0, Math.PI * 1.55); context.stroke(); });
    context.fillStyle = "#a64137"; context.beginPath(); context.arc(-8, -33, 4, 0, Math.PI * 2); context.fill();
  } else if (kind === "timberStack") {
    for (let index = 0; index < 3; index += 1) {
      const y = -5 - index * 7;
      context.fillStyle = index === 1 ? "#9a7040" : "#ad7e46"; context.fillRect(-31 + index * 2, y - 6, 62, 7);
      context.strokeStyle = "#d2a263"; context.lineWidth = 1.4; context.strokeRect(-31 + index * 2, y - 6, 62, 7);
      context.fillStyle = "#6e4a2e"; context.beginPath(); context.arc(-19 + index * 14, y - 3, 2, 0, Math.PI * 2); context.fill();
    }
    context.strokeStyle = "#66513a"; context.lineWidth = 3; [-11, 13].forEach((x) => { context.beginPath(); context.moveTo(x, -25); context.lineTo(x + 2, 0); context.stroke(); });
  } else if (kind === "ironFittings") {
    context.strokeStyle = "#aeb1aa"; context.lineWidth = 4; context.beginPath(); context.ellipse(-4, -12, 17, 10, -.16, .15, Math.PI * 1.85); context.stroke();
    context.strokeStyle = "#d0d2c9"; context.lineWidth = 2.5;
    [-13, -5, 4, 13].forEach((x, index) => { context.beginPath(); context.moveTo(x, -6); context.lineTo(x + (index % 2 ? 4 : -3), -23); context.stroke(); });
    context.fillStyle = "#5b5d58"; context.beginPath(); context.arc(-4, -12, 4, 0, Math.PI * 2); context.fill();
  } else if (kind === "powderJar") {
    context.fillStyle = "#8f6848"; context.beginPath(); context.moveTo(-13, -4); context.quadraticCurveTo(-18, -18, -10, -27); context.lineTo(-7, -32); context.lineTo(7, -32); context.lineTo(10, -27); context.quadraticCurveTo(18, -18, 13, -4); context.closePath(); context.fill();
    context.strokeStyle = "#d0a06b"; context.lineWidth = 2; context.stroke(); context.fillStyle = "#483a2e"; context.fillRect(-9, -36, 18, 5);
    context.fillStyle = "#d5c08d"; context.fillRect(-7, -22, 14, 10); context.fillStyle = "#5f4a35"; context.font = "700 8px serif"; context.textAlign = "center"; context.fillText("硝", 0, -14);
  } else if (kind === "reliefBundle") {
    context.fillStyle = "#927145";
    [-13, 13].forEach((x, index) => { context.beginPath(); context.moveTo(x - 11, 0); context.quadraticCurveTo(x - 15, -18, x - 6, -29); context.quadraticCurveTo(x, -35, x + 6, -29); context.quadraticCurveTo(x + 15, -18, x + 11, 0); context.closePath(); context.fill(); context.strokeStyle = "#c3a06a"; context.lineWidth = 1.5; context.stroke(); context.beginPath(); context.moveTo(x - 5, -27); context.lineTo(x + 5, -27); context.stroke(); });
    context.fillStyle = "#d3cfba"; context.fillRect(-18, -17, 36, 13); context.strokeStyle = "#698a82"; context.lineWidth = 3; context.beginPath(); context.moveTo(0, -17); context.lineTo(0, -4); context.moveTo(-8, -10); context.lineTo(8, -10); context.stroke();
  } else if (kind === "combatRifle") {
    context.save(); context.rotate(-.08);
    context.strokeStyle = "rgba(24,19,16,.72)"; context.lineWidth = 9; context.lineCap = "round"; context.beginPath(); context.moveTo(-37, -7); context.lineTo(38, -20); context.stroke();
    context.strokeStyle = "#8b6038"; context.lineWidth = 5; context.beginPath(); context.moveTo(-37, -8); context.lineTo(18, -17); context.stroke();
    context.strokeStyle = "#b9bbb0"; context.lineWidth = 4; context.beginPath(); context.moveTo(2, -15); context.lineTo(39, -21); context.stroke();
    context.fillStyle = "#4a3526"; context.beginPath(); context.moveTo(-37, -12); context.lineTo(-24, -20); context.lineTo(-17, -10); context.lineTo(-34, -3); context.closePath(); context.fill();
    context.strokeStyle = "#d0c7ac"; context.lineWidth = 2; context.beginPath(); context.moveTo(-2, -16); context.lineTo(-2, -5); context.lineTo(7, -4); context.stroke(); context.restore();
  } else if (kind === "ammoBox") {
    context.fillStyle = "#554b35"; context.strokeStyle = "#bbb08d"; context.lineWidth = 2; context.fillRect(-24, -17, 48, 17); context.strokeRect(-24, -17, 48, 17);
    context.fillStyle = "#b79b58"; [-15, -5, 5, 15].forEach((x) => { context.fillRect(x - 2, -27, 4, 14); context.beginPath(); context.arc(x, -27, 2, Math.PI, 0); context.fill(); });
    context.fillStyle = "#d4c28e"; context.font = '800 8px "FangSong", serif'; context.textAlign = "center"; context.fillText("四发", 0, -5);
  } else if (kind === "combatGrenade") {
    context.fillStyle = "#4e5843"; context.strokeStyle = "#b7b59b"; context.lineWidth = 2; context.beginPath(); context.roundRect(-12, -24, 24, 25, 7); context.fill(); context.stroke();
    context.strokeStyle = "#252b23"; context.lineWidth = 1.5; [-6, 0, 6].forEach((x) => { context.beginPath(); context.moveTo(x, -22); context.lineTo(x, -1); context.stroke(); });
    context.fillStyle = "#747866"; context.fillRect(-7, -31, 14, 8); context.strokeStyle = "#c6a661"; context.lineWidth = 2; context.beginPath(); context.arc(8, -29, 6, -Math.PI * .7, Math.PI * .45); context.stroke();
  } else if (kind === "capturePile") {
    context.fillStyle = "#7f6040"; context.fillRect(-27, -20, 29, 20); context.strokeStyle = "#bc8d52"; context.strokeRect(-27, -20, 29, 20);
    context.fillStyle = "#d2c39b"; context.beginPath(); context.moveTo(-2, -24); context.lineTo(26, -20); context.lineTo(20, -4); context.lineTo(-4, -8); context.closePath(); context.fill();
    context.strokeStyle = "#89694a"; context.lineWidth = 1.5; context.beginPath(); context.moveTo(2, -20); context.lineTo(18, -8); context.moveTo(8, -21); context.lineTo(2, -9); context.stroke();
    context.strokeStyle = "#555653"; context.lineWidth = 5; context.beginPath(); context.moveTo(10, -28); context.lineTo(29, -4); context.stroke();
  } else if (kind === "hiddenLetter") {
    context.fillStyle = "rgba(225,190,105,.18)"; context.beginPath(); context.ellipse(0, -10, 27, 18, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#e4d5aa"; context.beginPath(); context.moveTo(-21, -20); context.lineTo(19, -23); context.lineTo(22, 0); context.lineTo(-19, -2); context.closePath(); context.fill();
    context.strokeStyle = "#987653"; context.lineWidth = 2; context.stroke();
    context.beginPath(); context.moveTo(-18, -17); context.lineTo(1, -7); context.lineTo(17, -20); context.moveTo(12, -22); context.lineTo(20, -14); context.lineTo(13, -13); context.closePath(); context.stroke();
    context.strokeStyle = "rgba(104,74,48,.58)"; context.lineWidth = 1.2; context.beginPath(); context.moveTo(-12, -11); context.lineTo(8, -12); context.moveTo(-12, -7); context.lineTo(4, -8); context.stroke();
  } else if (kind === "thimble") {
    context.fillStyle = "rgba(241,205,101,.2)"; context.beginPath(); context.arc(0, -13, 23, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#c59b56"; context.beginPath(); context.moveTo(-11, 0); context.lineTo(-8, -20); context.quadraticCurveTo(0, -30, 8, -20); context.lineTo(11, 0); context.closePath(); context.fill();
    context.strokeStyle = "#ffe0a0"; context.lineWidth = 2.4; context.stroke();
    context.strokeStyle = "#765a35"; context.lineWidth = 2; context.beginPath(); context.ellipse(0, -20, 8, 5, 0, 0, Math.PI * 2); context.ellipse(0, 0, 11, 4, 0, 0, Math.PI * 2); context.stroke();
    context.fillStyle = "#7c623d"; [-5, 0, 5].forEach((x, index) => { context.beginPath(); context.arc(x, -10 - index * 3, 1.4, 0, Math.PI * 2); context.fill(); });
  } else if (kind === "woundedStretcher") {
    context.strokeStyle = "#a87642"; context.lineWidth = 5; context.beginPath(); context.moveTo(-39, 0); context.lineTo(39, 0); context.moveTo(-35, -20); context.lineTo(35, -20); context.stroke();
    context.fillStyle = "#8f9d89"; context.beginPath(); context.moveTo(-29, -4); context.lineTo(-24, -23); context.lineTo(19, -23); context.lineTo(28, -4); context.closePath(); context.fill();
    context.fillStyle = "#d09a75"; context.beginPath(); context.arc(-24, -25, 7, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#e1d4b7"; context.beginPath(); context.moveTo(-10, -22); context.lineTo(3, -22); context.lineTo(9, -5); context.lineTo(-17, -5); context.closePath(); context.fill();
  } else if (kind === "grainSacks") {
    context.fillStyle = "#9d7949";
    [-12, 12].forEach((x, index) => { context.beginPath(); context.moveTo(x - 12, 0); context.quadraticCurveTo(x - 17, -21, x - 6, -31); context.lineTo(x + 6, -31); context.quadraticCurveTo(x + 17, -20, x + 12, 0); context.closePath(); context.fill(); context.strokeStyle = "#d0a769"; context.lineWidth = 2; context.stroke(); context.beginPath(); context.moveTo(x - 6, -28); context.lineTo(x + 6, -28); context.stroke(); });
  } else if (kind === "ropeCoil") {
    context.strokeStyle = "#ba8a50"; context.lineWidth = 4;
    [14, 10, 6].forEach((radius) => { context.beginPath(); context.arc(0, -15, radius, 0, Math.PI * 2); context.stroke(); });
    context.beginPath(); context.moveTo(11, -7); context.quadraticCurveTo(24, -2, 20, 6); context.stroke();
  } else if (kind === "soldierBoot") {
    context.fillStyle = ghost ? "#6e4e43" : "#392e2c"; context.beginPath(); context.moveTo(-9, -27); context.lineTo(7, -27); context.lineTo(8, -9); context.quadraticCurveTo(21, -5, 22, 2); context.lineTo(-11, 2); context.closePath(); context.fill();
    context.strokeStyle = "#85645a"; context.lineWidth = 2; context.stroke();
  } else if (kind === "fieldRadioMap") {
    context.fillStyle = "#3f5149"; context.fillRect(-34, -34, 31, 31); context.strokeStyle = "#a5b29e"; context.lineWidth = 2; context.strokeRect(-34, -34, 31, 31);
    context.fillStyle = "#151e1d"; context.fillRect(-29, -28, 19, 11); context.strokeStyle = "#657b70"; context.strokeRect(-29, -28, 19, 11);
    context.fillStyle = "#d3b36c"; context.beginPath(); context.arc(-27, -9, 3.5, 0, Math.PI * 2); context.arc(-15, -9, 3.5, 0, Math.PI * 2); context.fill();
    context.strokeStyle = "#c4c8b8"; context.lineWidth = 2; context.beginPath(); context.moveTo(-5, -34); context.lineTo(7, -56); context.stroke();
    context.fillStyle = "#ded0a5"; context.beginPath(); context.moveTo(7, -29); context.lineTo(42, -34); context.lineTo(40, -4); context.lineTo(9, -2); context.closePath(); context.fill();
    context.strokeStyle = "#8d6b48"; context.lineWidth = 1.5; context.stroke(); context.beginPath(); context.moveTo(12, -25); context.lineTo(35, -9); context.moveTo(27, -30); context.lineTo(15, -7); context.moveTo(22, -31); context.lineTo(23, -4); context.stroke();
    context.fillStyle = "#a3453e"; context.beginPath(); context.arc(30, -18, 3, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}

function DrawPropLabel(x, y, textValue, tone = "active") {
  context.save(); context.font = "700 11px system-ui, sans-serif"; context.textAlign = "center";
  const labelWidth = Math.ceil(context.measureText(textValue).width) + 30;
  const left = x - labelWidth / 2;
  context.shadowColor = "rgba(20,15,11,.38)"; context.shadowOffsetX = 3; context.shadowOffsetY = 3;
  context.fillStyle = tone === "empty" ? "rgba(42,35,28,.9)" : "rgba(236,220,185,.96)"; context.fillRect(left, y - 19, labelWidth, 24);
  context.shadowColor = "transparent";
  context.strokeStyle = tone === "empty" ? "rgba(198,171,126,.5)" : "#2d241c"; context.lineWidth = 2; context.strokeRect(left + 1, y - 18, labelWidth - 2, 22);
  context.fillStyle = tone === "empty" ? "#c9b793" : "#a94738"; context.fillRect(left + 6, y - 13, 7, 7);
  context.fillStyle = tone === "empty" ? "#d3c19e" : "#2d241c"; context.fillText(textValue, x + 5, y - 3);
  context.restore();
}

function DrawFocusBrackets(x, y, halfWidth, halfHeight, color) {
  const corner = Math.max(6, Math.min(11, halfWidth * .38));
  context.save(); context.translate(x, y); context.strokeStyle = color; context.lineWidth = 2.1; context.lineCap = "square";
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sideX, sideY]) => {
    context.beginPath();
    context.moveTo(sideX * halfWidth, sideY * (halfHeight - corner));
    context.lineTo(sideX * halfWidth, sideY * halfHeight);
    context.lineTo(sideX * (halfWidth - corner), sideY * halfHeight);
    context.stroke();
  });
  context.restore();
}

function DrawActionProps(width, height, surfaceY, tunnelY, front) {
  const sceneScale = Math.max(.72, Math.min(1.05, width / 980));
  const enemyFocus = FindFocusedEnemy();
  const suppressMarkers = state.qaPatrolReview || Boolean(ActivePatrolLure("dogBark"));
  const focusedProp = enemyFocus ? null : state.level.actions
    .filter((action) => action.phase === state.phaseId && action.layer === state.player.layer && action.prop && ActionRemainsAvailable(action) && Math.abs(action.x - state.player.x) <= 1.9)
    .sort((a, b) => Math.abs(a.x - state.player.x) - Math.abs(b.x - state.player.x))[0] || null;
  for (const action of state.level.actions) {
    if (action.phase !== state.phaseId || !action.prop || Boolean(action.prop.front) !== front) continue;
    const completed = state.completed.has(action.id);
    const propWorldX = action.x + (action.prop.offsetX || 0);
    const x = WorldToScreen(propWorldX, width);
    const baseY = LayerBaseY(action.layer, propWorldX, height, surfaceY, tunnelY) - 5;
    const supportLift = PropSupportLift(action.prop.support) * sceneScale;
    const persistent = ["inspect", "operate"].includes(action.prop.mode);
    const present = persistent || (action.prop.mode === "place" ? completed : !completed);
    const empty = !persistent && action.prop.mode !== "place" && completed;
    const sameLayer = action.layer === state.player.layer;
    const focused = focusedProp?.id === action.id;
    const chosenValue = action.puzzleChoice ? PuzzleValue(action.puzzleChoice.path) : null;
    const choiceSelected = Boolean(action.puzzleChoice && chosenValue === action.puzzleChoice.value);
    const choiceDimmed = Boolean(action.puzzleChoice && chosenValue !== null && !choiceSelected && !focused);
    const choiceScale = action.puzzleChoice ? .82 : 1;
    const entityScale = sceneScale * choiceScale * (focused && !completed ? 1.2 : present && sameLayer && !completed ? 1.08 : 1);
    context.save(); context.translate(x, baseY);
    if (suppressMarkers) context.globalAlpha = .34;
    else if (choiceDimmed) context.globalAlpha = .22;
    DrawPropSupport(action.prop.support, sceneScale, empty);
    context.translate(0, supportLift);
    if (present) DrawPropObject(action.prop.kind, entityScale);
    else if (action.prop.mode === "place" && !completed) DrawPropObject(action.prop.kind, entityScale, true);
    context.restore();

    const locked = Boolean(MissingRequirement(action) || PuzzleRequirement(action)) || (action.role && action.role !== state.selectedRole);
    const markerY = baseY + supportLift - PropVisualHeight(action.prop.kind) * entityScale * .58;
    if ((!completed || action.repeatable) && sameLayer && !enemyFocus && !suppressMarkers) {
      const markerColor = locked ? "rgba(177,126,74,.78)" : focused ? "rgba(239,218,176,.98)" : choiceDimmed ? "rgba(132,126,108,.42)" : choiceSelected ? "rgba(184,73,56,.92)" : "rgba(226,207,170,.88)";
      if (focused) DrawFocusBrackets(x, markerY, 25 * entityScale, 19 * entityScale, markerColor);
      else {
        context.save(); context.translate(x, markerY - 17 * entityScale); context.rotate(Math.PI / 4);
        context.fillStyle = markerColor; context.fillRect(-3.5, -3.5, 7, 7); context.restore();
      }
    }
    if (focused && !suppressMarkers) {
      const label = completed ? (action.prop.mode === "place" ? `已布置 · ${action.prop.label}` : `已取走 · ${action.prop.label}`) : action.prop.label;
      DrawPropLabel(x, markerY - 22 * sceneScale, label, completed ? "empty" : "active");
    }
  }
}

function DrawPickupTransfer(width, height, surfaceY, tunnelY) {
  const pickup = state.player.pickup;
  if (!pickup) return;
  const progress = 1 - pickup.time / pickup.duration;
  const eased = 1 - Math.pow(1 - progress, 3);
  const sourceX = WorldToScreen(pickup.x, width);
  const sourceBaseY = LayerBaseY(pickup.layer, pickup.x, height, surfaceY, tunnelY) - 8;
  const actorX = WorldToScreen(state.player.x, width) + state.player.facing * 16;
  const actorBaseY = LayerBaseY(state.player.layer, state.player.x, height, surfaceY, tunnelY);
  const targetY = actorBaseY - 48;
  const x = Lerp(sourceX, actorX, eased);
  const y = Lerp(sourceBaseY - PropVisualHeight(pickup.kind) * .45, targetY, eased) - Math.sin(progress * Math.PI) * 24;
  context.save(); context.translate(x, y); DrawPropObject(pickup.kind, Lerp(.82, .42, eased)); context.restore();
  context.strokeStyle = `rgba(112,229,225,${.55 * (1 - progress)})`; context.lineWidth = 2; context.beginPath(); context.moveTo(sourceX, sourceBaseY - 10); context.quadraticCurveTo((sourceX + actorX) / 2, y - 28, actorX, targetY); context.stroke();
}

function DrawActions(width, height, surfaceY, tunnelY) {
  if (FindFocusedEnemy()) return;
  const nearest = FindNearestAction();
  for (const action of state.level.actions) {
    if (action.phase !== state.phaseId || action.layer !== state.player.layer || !ActionRemainsAvailable(action)) continue;
    if (action.prop) continue;
    const x = WorldToScreen(action.x, width);
    const y = action.layer === "tunnel" ? TunnelCenterYAt(action.x, tunnelY) - 4 : LayerBaseY(action.layer, action.x, height, surfaceY, tunnelY) - 10;
    const locked = Boolean(MissingRequirement(action) || PuzzleRequirement(action)) || (action.role && action.role !== state.selectedRole);
    const focused = nearest?.id === action.id;
    const tone = locked ? "rgba(177,126,74,.78)" : focused ? "rgba(239,218,176,.98)" : "rgba(226,207,170,.88)";
    context.save(); context.translate(x, y - 27);
    context.strokeStyle = tone; context.lineWidth = focused ? 2.4 : 1.8;
    context.beginPath(); context.moveTo(0, 7); context.lineTo(0, 18); context.stroke();
    context.rotate(Math.PI / 4); context.fillStyle = tone; context.fillRect(focused ? -6 : -4, focused ? -6 : -4, focused ? 12 : 8, focused ? 12 : 8); context.restore();
    if (focused) DrawPropLabel(x, y - 48, action.title, locked ? "empty" : "active");
    if (qaMode && !state.cleanCapture) {
      context.fillStyle = "#fff"; context.font = "11px monospace"; context.fillText(action.id, x - 24, y - 44);
    }
  }
}

function DrawCombatEntrances(width, height, surfaceY, tunnelY) {
  const cellar = combatDepthLinks[0];
  const cellarX = WorldToScreen(cellar.x, width);
  const tunnelFloor = TunnelFloorYAt(cellar.x, height, tunnelY);
  const tunnelCeiling = TunnelCeilingYAt(cellar.x, height, tunnelY);
  const cellarOpen = state.completed.has(cellar.requires);
  const cellarNearby = Math.abs(state.player.x - cellar.x) <= 1.15 && [cellar.lower, cellar.upper].includes(state.player.layer);
  context.save();
  context.fillStyle = "rgba(12,14,13,.94)"; context.fillRect(cellarX - 24, surfaceY - 7, 48, tunnelFloor - surfaceY + 7);
  context.strokeStyle = cellarNearby ? "rgba(220,191,128,.92)" : "rgba(129,95,61,.7)"; context.lineWidth = cellarNearby ? 3 : 2; context.strokeRect(cellarX - 24, surfaceY - 7, 48, tunnelFloor - surfaceY + 7);
  context.strokeStyle = "#8a643e"; context.lineWidth = 5; context.beginPath(); context.moveTo(cellarX - 11, surfaceY - 1); context.lineTo(cellarX - 11, tunnelFloor - 7); context.moveTo(cellarX + 11, surfaceY - 1); context.lineTo(cellarX + 11, tunnelFloor - 7); context.stroke();
  context.strokeStyle = "#b28750"; context.lineWidth = 3;
  for (let y = surfaceY + 12; y < tunnelFloor - 6; y += 15) { context.beginPath(); context.moveTo(cellarX - 11, y); context.lineTo(cellarX + 11, y); context.stroke(); }
  context.fillStyle = cellarOpen ? "#745338" : "#473426"; context.strokeStyle = "#241b16"; context.lineWidth = 3; context.fillRect(cellarX - 31, surfaceY - 12, 62, 12); context.strokeRect(cellarX - 31, surfaceY - 12, 62, 12);
  if (!cellarOpen) { context.strokeStyle = "#c1a06a"; context.lineWidth = 4; context.beginPath(); context.moveTo(cellarX - 22, surfaceY - 9); context.lineTo(cellarX + 22, surfaceY - 3); context.stroke(); }
  context.fillStyle = "rgba(229,204,156,.72)"; context.font = '800 9px "FangSong", serif'; context.textAlign = "center"; context.fillText("地道 ⇄ 西屋", cellarX, tunnelCeiling - 10);

  const roofLink = combatDepthLinks[1];
  const roofX = WorldToScreen(roofLink.x, width);
  const roofY = RoofFloorYAt(roofLink.x, surfaceY);
  const roofOpen = state.completed.has(roofLink.requires);
  const roofNearby = Math.abs(state.player.x - roofLink.x) <= 1.15 && [roofLink.lower, roofLink.upper].includes(state.player.layer);
  context.strokeStyle = roofNearby ? "#d4b56f" : "#89613d"; context.lineWidth = 6; context.beginPath(); context.moveTo(roofX - 12, surfaceY - 3); context.lineTo(roofX - 12, roofY + 5); context.moveTo(roofX + 12, surfaceY - 3); context.lineTo(roofX + 12, roofY + 5); context.stroke();
  context.strokeStyle = "#d0a461"; context.lineWidth = 3;
  for (let y = surfaceY - 15; y > roofY + 7; y -= 15) { context.beginPath(); context.moveTo(roofX - 12, y); context.lineTo(roofX + 12, y); context.stroke(); }
  context.fillStyle = roofOpen ? "#756044" : "#3e3329"; context.strokeStyle = roofNearby ? "#e0c17b" : "#241d18"; context.lineWidth = 3; context.fillRect(roofX - 29, roofY - 4, 58, 12); context.strokeRect(roofX - 29, roofY - 4, 58, 12);
  context.fillStyle = "rgba(235,211,165,.78)"; context.fillText("屋内 ⇄ 房顶", roofX, roofY - 14);
  [
    { x: cellarX, y: state.player.layer === "tunnel" ? tunnelCeiling + 23 : surfaceY - 30, visible: cellarNearby, up: state.player.layer === "tunnel" },
    { x: roofX, y: state.player.layer === "roof" ? roofY + 36 : surfaceY - 88, visible: roofNearby, up: state.player.layer === "interior" }
  ].forEach((marker) => {
    if (!marker.visible) return;
    context.fillStyle = "rgba(25,20,16,.92)"; context.fillRect(marker.x - 39, marker.y - 14, 78, 22);
    context.strokeStyle = "#d2ae6d"; context.lineWidth = 1.5; context.strokeRect(marker.x - 38.5, marker.y - 13.5, 77, 21);
    context.fillStyle = "#f0dfbd"; context.font = '900 10px system-ui, sans-serif'; context.fillText(marker.up ? "W  ↑  上行" : "S  ↓  下行", marker.x, marker.y + 1);
  });
  context.restore();
}

function DrawEntrances(width, height, surfaceY, tunnelY) {
  if (state.levelIndex === 3) return DrawCombatEntrances(width, height, surfaceY, tunnelY);
  entrances.forEach((entrance, index) => {
    const x = WorldToScreen(entrance, width);
    const shaftBottom = TunnelCeilingYAt(entrance, height, tunnelY) + 16;
    const shaftHalf = index === 0 ? 16 : 20;
    const nearby = Math.abs(state.player.x - entrance) < 1.15;
    const shaftShade = context.createLinearGradient(x - shaftHalf, 0, x + shaftHalf, 0);
    shaftShade.addColorStop(0, "#0b1112"); shaftShade.addColorStop(.5, "#1b2726"); shaftShade.addColorStop(1, "#080d0f");
    context.fillStyle = shaftShade;
    context.beginPath(); context.moveTo(x - shaftHalf, surfaceY - 1); context.lineTo(x + shaftHalf, surfaceY - 1); context.lineTo(x + shaftHalf + 5, shaftBottom); context.lineTo(x - shaftHalf - 5, shaftBottom); context.closePath(); context.fill();
    context.fillStyle = "rgba(151,105,62,.24)";
    context.beginPath(); context.moveTo(x - shaftHalf - 7, surfaceY + 3); context.lineTo(x - shaftHalf - 2, surfaceY + 3); context.lineTo(x - shaftHalf - 7, shaftBottom); context.lineTo(x - shaftHalf - 13, shaftBottom); context.closePath(); context.fill();
    context.beginPath(); context.moveTo(x + shaftHalf + 2, surfaceY + 3); context.lineTo(x + shaftHalf + 7, surfaceY + 3); context.lineTo(x + shaftHalf + 13, shaftBottom); context.lineTo(x + shaftHalf + 7, shaftBottom); context.closePath(); context.fill();
    context.strokeStyle = nearby ? "rgba(98,207,213,.78)" : "rgba(177,132,78,.58)"; context.lineWidth = nearby ? 3 : 2;
    context.beginPath(); context.moveTo(x - shaftHalf, surfaceY); context.lineTo(x - shaftHalf - 5, shaftBottom); context.moveTo(x + shaftHalf, surfaceY); context.lineTo(x + shaftHalf + 5, shaftBottom); context.stroke();
    context.strokeStyle = "rgba(38,26,19,.72)"; context.lineWidth = 6;
    context.beginPath(); context.moveTo(x - 7, surfaceY + 10); context.lineTo(x - 9, shaftBottom - 5); context.moveTo(x + 9, surfaceY + 10); context.lineTo(x + 7, shaftBottom - 5); context.stroke();
    context.strokeStyle = "#9b7548"; context.lineWidth = 4;
    context.beginPath(); context.moveTo(x - 8, surfaceY + 10); context.lineTo(x - 10, shaftBottom - 5); context.moveTo(x + 8, surfaceY + 10); context.lineTo(x + 6, shaftBottom - 5); context.stroke();
    context.strokeStyle = "rgba(226,177,105,.42)"; context.lineWidth = 1;
    context.beginPath(); context.moveTo(x - 7, surfaceY + 11); context.lineTo(x - 9, shaftBottom - 6); context.moveTo(x + 9, surfaceY + 11); context.lineTo(x + 7, shaftBottom - 6); context.stroke();
    for (let y = surfaceY + 16; y < shaftBottom - 4; y += 12) {
      context.strokeStyle = "rgba(44,28,18,.78)"; context.lineWidth = 5; context.beginPath(); context.moveTo(x - 9, y + 2); context.lineTo(x + 9, y + 2); context.stroke();
      context.strokeStyle = "#a67b48"; context.lineWidth = 3; context.beginPath(); context.moveTo(x - 9, y); context.lineTo(x + 9, y); context.stroke();
    }
    context.strokeStyle = "#755436"; context.lineWidth = 5;
    context.beginPath(); context.moveTo(x - shaftHalf - 8, shaftBottom); context.lineTo(x + shaftHalf + 8, shaftBottom); context.stroke();
    context.strokeStyle = "rgba(190,139,78,.46)"; context.lineWidth = 2;
    for (let y = surfaceY + 30; y < shaftBottom - 18; y += 34) {
      context.beginPath(); context.moveTo(x - shaftHalf - 7, y); context.lineTo(x - shaftHalf + 1, y + 10); context.moveTo(x + shaftHalf + 7, y); context.lineTo(x + shaftHalf - 1, y + 10); context.stroke();
    }
    if (index === 0) {
      context.fillStyle = "#6f5135"; context.fillRect(x - 23, surfaceY - 7, 46, 8);
      context.strokeStyle = "rgba(218,174,105,.56)"; context.lineWidth = 2; context.strokeRect(x - 23, surfaceY - 7, 46, 8);
      context.strokeStyle = "rgba(42,27,18,.7)"; context.lineWidth = 1;
      [-12, 0, 12].forEach((plankX) => { context.beginPath(); context.moveTo(x + plankX, surfaceY - 6); context.lineTo(x + plankX, surfaceY); context.stroke(); });
      context.strokeStyle = "#b58a52"; context.lineWidth = 2; context.beginPath(); context.arc(x + 14, surfaceY - 4, 3, 0, Math.PI * 2); context.stroke();
    } else {
      context.fillStyle = "#2d3028"; context.beginPath(); context.ellipse(x, surfaceY - 1, 27, 9, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#8c6a45"; context.lineWidth = 6; context.beginPath(); context.ellipse(x, surfaceY - 3, 27, 9, 0, 0, Math.PI * 2); context.stroke();
      context.strokeStyle = "rgba(205,162,96,.52)"; context.lineWidth = 2;
      for (let segment = 0; segment < 6; segment += 1) { context.beginPath(); context.ellipse(x, surfaceY - 3, 27, 9, 0, segment * Math.PI / 3 + .08, segment * Math.PI / 3 + .82); context.stroke(); }
    }
    context.strokeStyle = nearby ? "rgba(111,225,226,.95)" : "rgba(92,188,196,.48)"; context.lineWidth = 2;
    context.beginPath(); context.arc(x, surfaceY - 18, nearby ? 10 : 7, 0, Math.PI * 2); context.stroke();
    context.fillStyle = nearby ? "#83e4e2" : "#5fc6d5"; context.beginPath(); context.moveTo(x - 4, surfaceY - 20); context.lineTo(x + 4, surfaceY - 20); context.lineTo(x, surfaceY - 14); context.closePath(); context.fill();
  });
}

function DrawDepthHint(width, height, surfaceY, tunnelY) {
  if (state.takedown) return;
  if (state.levelIndex === 3) return;
  const entrance = entrances.find((worldX) => Math.abs(worldX - state.player.x) <= 1.15);
  if (entrance === undefined || state.cinematic || state.caught) return;
  const x = WorldToScreen(entrance, width);
  const hint = state.player.layer === "surface" ? "S  ↓  下行" : "W  ↑  上行";
  const hintY = state.player.layer === "surface" ? surfaceY - 74 : TunnelCeilingYAt(entrance, height, tunnelY) + 28;
  context.save(); context.font = "800 11px system-ui, sans-serif"; context.textAlign = "center";
  const hintWidth = Math.ceil(context.measureText(hint).width) + 22;
  context.fillStyle = "rgba(8,14,16,.94)"; context.fillRect(x - hintWidth / 2, hintY - 17, hintWidth, 23);
  context.strokeStyle = "rgba(104,225,225,.85)"; context.lineWidth = 1.5; context.strokeRect(x - hintWidth / 2 + .75, hintY - 16.25, hintWidth - 1.5, 21.5);
  context.fillStyle = "#edf7ef"; context.fillText(hint, x, hintY - 1); context.restore();
}

function DrawEnemyUnit(enemy, height, x, baseY) {
  const profile = actorProfiles[enemy.unitType] || actorProfiles.soldier;
  const isCollaborator = enemy.unitType === "collaborator";
  const fall = Math.max(0, Math.min(1, enemy.takedownFall || 0));
  const phase = state.elapsed * (isCollaborator ? 4.35 : 3.85) + enemy.index * 1.7;
  const stride = Math.sin(phase) * .34 * (1 - fall);
  const investigateLift = enemy.investigating && !fall ? .32 + Math.sin(state.elapsed * 4 + enemy.index) * .08 : 0;
  const limbWidth = Math.max(3.2, height * profile.limb);

  const emphasized = state.qaPatrolReview || enemy.lureKind === "dogBark";
  context.save(); context.translate(x, baseY); context.scale(enemy.facing, 1);
  if (emphasized) { context.shadowColor = "rgba(238,216,165,.42)"; context.shadowBlur = 5; }
  if (enemy.focused === false) context.globalAlpha = emphasized ? .96 : .72;
  if (fall > 0) {
    context.translate(0, fall * height * .025);
    context.rotate(-fall * 1.43);
  }
  context.fillStyle = "rgba(0,0,0,.34)"; context.beginPath(); context.ellipse(0, 3, height * .18, 4.5, 0, 0, Math.PI * 2); context.fill();

  const rearFoot = DrawJointedLimb(-height * .055, -height * .34, height * .205, height * .185, stride, -stride * .38, profile.pants, limbWidth + .45);
  const frontFoot = DrawJointedLimb(height * .055, -height * .34, height * .205, height * .185, -stride, stride * .38, profile.pants, limbWidth + .45);
  context.fillStyle = isCollaborator ? "#202729" : "#3f4033"; [rearFoot, frontFoot].forEach((foot, index) => { context.beginPath(); context.ellipse(foot.x + (index ? 2 : -2), foot.y + 1, height * .058, Math.max(2.5, height * .026), index ? -.08 : .08, 0, Math.PI * 2); context.fill(); });
  context.strokeStyle = isCollaborator ? "#292f30" : "#56543f"; context.lineWidth = Math.max(3, height * .034);
  [-1, 1].forEach((side) => {
    context.beginPath(); context.moveTo(side * height * .075, -height * .17); context.lineTo(side * height * .09, -height * .035); context.stroke();
    for (let wrap = 0; wrap < 4; wrap += 1) { const wrapY = -height * (.15 - wrap * .033); context.strokeStyle = isCollaborator ? "rgba(170,177,165,.28)" : "rgba(201,191,151,.38)"; context.lineWidth = 1.2; context.beginPath(); context.moveTo(side * height * .115, wrapY); context.lineTo(side * height * .052, wrapY + 2); context.stroke(); }
  });

  const shoulder = height * profile.shoulder * .52;
  const waist = height * profile.waist;
  context.fillStyle = profile.body;
  context.beginPath(); context.moveTo(-shoulder, -height * .72); context.quadraticCurveTo(0, -height * .755, shoulder, -height * .72); context.lineTo(waist, -height * .31); context.lineTo(-waist, -height * .31); context.closePath(); context.fill();
  context.strokeStyle = "rgba(231,219,177,.18)"; context.lineWidth = 1.4; context.beginPath(); context.moveTo(-shoulder * .75, -height * .69); context.lineTo(-waist * .72, -height * .34); context.stroke();
  context.fillStyle = isCollaborator ? "#252f31" : "#4a4938"; context.fillRect(-waist * 1.15, -height * .38, waist * 2.3, Math.max(3, height * .032));

  if (isCollaborator) {
    context.fillStyle = "#ddd5bd"; context.fillRect(height * .115, -height * .615, height * .06, height * .115);
    context.strokeStyle = "#8c2f2c"; context.lineWidth = 1.5; context.beginPath(); context.moveTo(height * .118, -height * .565); context.lineTo(height * .172, -height * .55); context.stroke();
    context.fillStyle = "#313b3c"; context.fillRect(-height * .09, -height * .385, height * .075, height * .075); context.fillRect(height * .025, -height * .385, height * .075, height * .075);
  } else {
    context.fillStyle = "#4a4938"; context.fillRect(-height * .105, -height * .405, height * .075, height * .09); context.fillRect(height * .03, -height * .405, height * .075, height * .09);
    context.fillStyle = profile.accent; context.fillRect(-height * .095, -height * .69, height * .055, height * .035); context.fillRect(height * .04, -height * .69, height * .055, height * .035);
    context.strokeStyle = "#777151"; context.lineWidth = 3; context.beginPath(); context.moveTo(-shoulder * .82, -height * .66); context.lineTo(height * .1, -height * .35); context.stroke();
    context.fillStyle = "#53513d"; context.beginPath(); context.ellipse(-height * .155, -height * .47, height * .075, height * .12, -.1, 0, Math.PI * 2); context.fill();
  }

  const rearArm = fall ? Lerp(isCollaborator ? -.18 : .16, 1.34, fall) : isCollaborator ? -.18 : .16;
  DrawJointedLimb(-shoulder * .82, -height * .655, height * .17, height * .155, rearArm, fall ? 2.42 : isCollaborator ? -.35 : .58, profile.body, limbWidth);
  if (isCollaborator) {
    DrawJointedLimb(shoulder * .82, -height * .655, height * .17, height * .15, fall ? 1.86 : .92 + investigateLift, fall ? 2.68 : .45, profile.body, limbWidth);
    if (!enemy.disarmed) {
      context.strokeStyle = "#8a6a3f"; context.lineWidth = 3; context.beginPath(); context.moveTo(height * .19, -height * (.47 + investigateLift * .3)); context.lineTo(height * .38, -height * (.43 + investigateLift * .25)); context.stroke();
      context.fillStyle = "#d0a75b"; context.beginPath(); context.arc(height * .4, -height * (.425 + investigateLift * .24), height * .035, 0, Math.PI * 2); context.fill();
      context.fillStyle = "rgba(244,181,74,.18)"; context.beginPath(); context.arc(height * .4, -height * (.425 + investigateLift * .24), height * .16, 0, Math.PI * 2); context.fill();
    }
  } else {
    DrawJointedLimb(shoulder * .82, -height * .655, height * .17, height * .155, fall ? 1.76 : .72 + investigateLift, fall ? 2.56 : .18, profile.body, limbWidth);
    if (!enemy.disarmed) {
      context.strokeStyle = "#3b3027"; context.lineWidth = Math.max(4, height * .045); context.beginPath(); context.moveTo(-height * .33, -height * .54); context.lineTo(height * .37, -height * (.48 + investigateLift * .08)); context.stroke();
      context.strokeStyle = "#a17a46"; context.lineWidth = 2.2; context.beginPath(); context.moveTo(-height * .29, -height * .545); context.lineTo(height * .24, -height * (.5 + investigateLift * .08)); context.stroke();
      context.fillStyle = "#5e5d4b"; context.fillRect(-height * .37, -height * .565, height * .11, height * .035);
    }
  }

  const headY = -height * (.86 + investigateLift * .06);
  const headRadius = height * profile.head;
  context.fillStyle = profile.skin; context.beginPath(); context.arc(0, headY, headRadius, 0, Math.PI * 2); context.fill();
  context.fillStyle = "rgba(63,39,30,.68)"; context.beginPath(); context.arc(headRadius * .48, headY + headRadius * .1, Math.max(1.2, headRadius * .12), 0, Math.PI * 2); context.fill();
  if (isCollaborator) {
    context.fillStyle = "#2c3738"; context.beginPath(); context.moveTo(-headRadius * 1.05, headY - headRadius * .35); context.quadraticCurveTo(-headRadius * .2, headY - headRadius * 1.2, headRadius * .82, headY - headRadius * .52); context.lineTo(headRadius * 1.18, headY - headRadius * .28); context.lineTo(-headRadius * .78, headY - headRadius * .18); context.closePath(); context.fill();
  } else {
    context.fillStyle = "#5b5c45"; context.beginPath(); context.arc(0, headY - headRadius * .28, headRadius * 1.04, Math.PI, Math.PI * 2); context.fill();
    context.fillRect(-headRadius * .7, headY - headRadius * .42, headRadius * 1.75, Math.max(2, height * .024));
    context.fillStyle = "#4f503d"; context.beginPath(); context.moveTo(-headRadius * .92, headY - headRadius * .22); context.lineTo(-headRadius * .72, headY + headRadius * .95); context.lineTo(-headRadius * .28, headY + headRadius * .62); context.closePath(); context.fill();
    if (enemy.rank === "sectionLeader") { context.fillStyle = "#b89a5e"; context.beginPath(); context.arc(0, headY - headRadius * .58, 2, 0, Math.PI * 2); context.fill(); }
  }
  context.restore();

  if (enemy.investigating && !fall && enemy.focused !== false) {
    context.fillStyle = "rgba(8,13,15,.9)"; context.fillRect(x - 9, baseY - height - 22, 18, 18);
    context.strokeStyle = isCollaborator ? "#d7c490" : "#e2bc67"; context.lineWidth = 1.5; context.strokeRect(x - 8.25, baseY - height - 21.25, 16.5, 16.5);
    context.fillStyle = "#f3d78f"; context.font = "900 12px system-ui"; context.textAlign = "center"; context.fillText("?", x, baseY - height - 9);
  }
}

function DrawEnemies(width, viewportHeight, surfaceY, tunnelY) {
  const patrols = GetEnemyPatrols();
  if (!patrols.length) return;
  const profile = actorProfiles.soldier;
  const scale = Math.min(width, 1100) / 26 * .038;
  const combatMobileScale = state.levelIndex === 3 && width <= 640 ? 1.18 : 1;
  const height = profile.height * 39 * scale * (state.qaPatrolReview ? 1.14 : 1) * combatMobileScale;
  const focusedEnemy = FindFocusedEnemy();
  patrols.forEach((enemy) => {
    const baseY = LayerBaseY(enemy.layer || "surface", enemy.x, viewportHeight, surfaceY, tunnelY);
    const focused = focusedEnemy?.id === enemy.id;
    const active = !state.qaSafePreview && state.takedownGrace <= 0 && EnemyDetection(enemy) > 0;
    if (!focused) return;
    const x = WorldToScreen(enemy.x, width);
    const endX = WorldToScreen(enemy.x + enemy.facing * enemy.viewDistance, width);
    const originX = x + enemy.facing * height * .12;
    const originY = baseY - height * .82;
    const farTopY = Math.min(baseY - 5, originY + height * .12);
    const farBottomY = baseY + 3;
    const gradient = context.createLinearGradient(originX, 0, endX, 0);
    gradient.addColorStop(0, active ? "rgba(229,58,44,.18)" : "rgba(222,190,108,.075)");
    gradient.addColorStop(1, active ? "rgba(195,43,34,.015)" : "rgba(215,184,103,0)");
    context.fillStyle = gradient;
    context.beginPath(); context.moveTo(originX, originY); context.lineTo(endX, farTopY); context.lineTo(endX, farBottomY); context.closePath(); context.fill();
    context.strokeStyle = active ? "rgba(255,105,79,.36)" : "rgba(219,186,104,.18)"; context.lineWidth = 1;
    context.beginPath(); context.moveTo(originX, originY); context.lineTo(endX, Lerp(farTopY, farBottomY, .5)); context.stroke();
  });
  patrols.forEach((enemy) => {
    const baseY = LayerBaseY(enemy.layer || "surface", enemy.x, viewportHeight, surfaceY, tunnelY);
    context.save();
    context.globalAlpha = focusedEnemy?.id === enemy.id ? 1 : .72;
    DrawEnemyUnit({ ...enemy, detecting: EnemyDetection(enemy) > 0, focused: focusedEnemy?.id === enemy.id }, height, WorldToScreen(enemy.x, width), baseY);
    context.restore();
  });
  DrawEnemyFocusHud(width, viewportHeight, surfaceY, tunnelY, height, focusedEnemy);
}

function DrawEnemyFocusHud(width, viewportHeight, surfaceY, tunnelY, enemyHeight, target) {
  if (!target || state.takedown) return;
  const identity = EnemyIdentity(target);
  const interaction = EnemyInteractionState(target);
  const targetX = WorldToScreen(target.x, width);
  const targetBaseY = LayerBaseY(target.layer || "surface", target.x, viewportHeight, surfaceY, tunnelY);
  const mobile = width <= 640;
  const mobileCombat = state.levelIndex === 3 && mobile;
  const combatTarget = state.levelIndex === 3;
  const cardWidth = mobileCombat ? 100 : mobile ? 152 : combatTarget ? 156 : 184;
  const cardHeight = interaction.ready ? (mobileCombat ? 38 : mobile ? 54 : 62) : (mobileCombat ? 27 : mobile ? 47 : 54);
  const sideX = target.facing > 0 ? targetX - cardWidth - 18 : targetX + 18;
  const preferredX = target.facing > 0 ? targetX - cardWidth * .62 : targetX + cardWidth * .62;
  const playerScreenX = WorldToScreen(state.player.x, width);
  const mobileSideX = targetX < playerScreenX ? targetX - cardWidth - 12 : targetX + 12;
  const cardX = combatTarget
    ? Math.max(8, Math.min(width - cardWidth - 8, mobileCombat ? mobileSideX : sideX))
    : Math.max(8, Math.min(width - cardWidth - 8, preferredX - cardWidth / 2));
  const cardY = mobileCombat
    ? Math.min(viewportHeight - cardHeight - 126, targetBaseY + 18)
    : Math.max(combatTarget ? 64 : 8, targetBaseY - enemyHeight - cardHeight - (mobile ? 13 : 12));
  const titleSize = mobile ? 11 : 14;
  const bodySize = mobile ? 9 : 11;
  const statusTone = interaction.ready ? "#e9c875" : (state.detected || EnemyDetection(target) > 0) ? "#ef6657" : "#d7c99f";

  context.save();
  context.fillStyle = "rgba(13,15,14,.94)"; context.fillRect(cardX, cardY, cardWidth, cardHeight);
  context.fillStyle = identity.accent; context.fillRect(cardX, cardY, 5, cardHeight);
  context.strokeStyle = "rgba(239,226,194,.24)"; context.lineWidth = 1; context.strokeRect(cardX + .5, cardY + .5, cardWidth - 1, cardHeight - 1);
  const symbolX = cardX + (mobileCombat ? 12 : 18);
  const symbolY = cardY + (mobileCombat ? 13 : mobile ? 15 : 18);
  context.fillStyle = identity.accent;
  if (identity.faction === "日军") {
    context.save(); context.translate(symbolX, symbolY); context.rotate(Math.PI / 4); context.fillRect(-6, -6, 12, 12); context.restore();
  } else context.fillRect(symbolX - 6, symbolY - 6, 12, 12);
  context.fillStyle = "#f4ead4"; context.font = `900 ${titleSize}px system-ui, sans-serif`; context.textAlign = "left";
  context.fillText(mobileCombat ? `${identity.faction} · ${identity.role}` : `敌军 · ${identity.faction}`, cardX + (mobileCombat ? 22 : 31), cardY + (mobileCombat ? 17 : mobile ? 18 : 22));
  context.fillStyle = statusTone; context.font = `700 ${bodySize}px system-ui, sans-serif`;
  if (!mobileCombat) context.fillText(`${identity.role} · ${interaction.status}`, cardX + 12, cardY + (mobile ? 36 : 42));
  if (interaction.ready) {
    context.fillStyle = identity.accent; context.fillRect(cardX + cardWidth - (mobile ? 48 : 56), cardY + cardHeight - (mobile ? 17 : 20), mobile ? 40 : 48, mobile ? 13 : 15);
    context.fillStyle = "#fff5df"; context.font = `900 ${mobile ? 9 : 11}px system-ui, sans-serif`; context.textAlign = "center";
    context.fillText("E 制服", cardX + cardWidth - (mobile ? 28 : 32), cardY + cardHeight - (mobile ? 7 : 9));
  }

  const bracketY = targetBaseY - enemyHeight * .48;
  context.strokeStyle = identity.accent; context.lineWidth = combatTarget ? 2.5 : 2;
  context.beginPath(); context.moveTo(targetX - enemyHeight * .16, bracketY + enemyHeight * .5); context.lineTo(targetX - enemyHeight * .16, bracketY + enemyHeight * .57); context.lineTo(targetX + enemyHeight * .16, bracketY + enemyHeight * .57); context.lineTo(targetX + enemyHeight * .16, bracketY + enemyHeight * .5); context.stroke();
  context.restore();
}

function DrawDroppedEnemyEquipment(enemy, width, baseY, enemyHeight, dropProgress = 1) {
  const progress = Math.max(0, Math.min(1, dropProgress));
  const cinematicFocus = width <= 640 && Boolean(state.takedown || state.takedownGrace > 0);
  const targetWorldX = enemy.x + enemy.facing * .72;
  const startX = WorldToScreen(enemy.x + enemy.facing * .12, width);
  const endX = WorldToScreen(targetWorldX, width);
  const x = Lerp(startX, endX, progress);
  const y = baseY - (cinematicFocus ? 11 : 4) - Math.sin(progress * Math.PI) * enemyHeight * .22;
  context.save(); context.translate(x, y); context.rotate(enemy.facing * Lerp(-.35, .08, progress)); context.globalAlpha = SmoothStep(0, .22, progress);
  if (cinematicFocus) {
    context.strokeStyle = "rgba(220,190,132,.72)"; context.lineCap = "round"; context.lineWidth = enemy.unitType === "collaborator" ? 9 : 12;
    context.beginPath(); context.moveTo(enemy.unitType === "collaborator" ? -20 : -34, 0); context.lineTo(enemy.unitType === "collaborator" ? 20 : 34, 0); context.stroke();
  }
  if (enemy.unitType === "collaborator") {
    context.strokeStyle = "rgba(24,22,19,.62)"; context.lineWidth = 6; context.beginPath(); context.moveTo(-18, 2); context.lineTo(18, 2); context.stroke();
    context.strokeStyle = "#8a6a3f"; context.lineWidth = 3; context.beginPath(); context.moveTo(-18, 0); context.lineTo(17, 0); context.stroke();
    context.fillStyle = "#d0a75b"; context.beginPath(); context.arc(19, 0, 3.5, 0, Math.PI * 2); context.fill();
  } else {
    context.strokeStyle = "rgba(24,22,19,.68)"; context.lineWidth = 8; context.beginPath(); context.moveTo(-31, 3); context.lineTo(31, 3); context.stroke();
    context.strokeStyle = "#6d5035"; context.lineWidth = 4.5; context.beginPath(); context.moveTo(-31, 0); context.lineTo(31, 0); context.stroke();
    context.strokeStyle = "#b08a52"; context.lineWidth = 2; context.beginPath(); context.moveTo(-23, -1); context.lineTo(22, -1); context.stroke();
  }
  if (cinematicFocus && progress > .58) {
    context.strokeStyle = "rgba(184,63,53,.78)"; context.lineWidth = 2;
    [-1, 0, 1].forEach((ray) => { context.beginPath(); context.moveTo(ray * 9, -9); context.lineTo(ray * 13, -15 - Math.abs(ray) * 2); context.stroke(); });
  }
  context.restore();
}

function DrawProneEnemyBody(enemy, width, baseY, height, alpha = 1) {
  const profile = actorProfiles[enemy.unitType] || actorProfiles.soldier;
  const x = WorldToScreen(enemy.x, width);
  const cinematicFocus = width <= 640 && Boolean(state.takedown || state.takedownGrace > 0);
  context.save(); context.translate(x, baseY - 3); context.scale(enemy.facing, 1); context.globalAlpha = alpha;
  if (cinematicFocus) {
    context.fillStyle = "rgba(214,182,111,.18)"; context.strokeStyle = "rgba(226,199,146,.68)"; context.lineWidth = 2.4;
    context.beginPath(); context.ellipse(0, -height * .09, height * .69, height * .24, -.04, 0, Math.PI * 2); context.fill(); context.stroke();
  }
  context.fillStyle = "rgba(0,0,0,.38)"; context.beginPath(); context.ellipse(2, 3, height * .55, 6, 0, 0, Math.PI * 2); context.fill();
  context.strokeStyle = cinematicFocus ? "rgba(222,193,137,.72)" : "rgba(25,27,26,.5)"; context.lineWidth = Math.max(7, height * .075) + (cinematicFocus ? 3 : 0); context.lineCap = "round";
  context.beginPath(); context.moveTo(-height * .08, -height * .08); context.lineTo(-height * .43, -height * .02); context.stroke();
  context.strokeStyle = profile.pants; context.lineWidth = Math.max(4, height * .048); context.beginPath(); context.moveTo(-height * .08, -height * .1); context.lineTo(-height * .43, -height * .04); context.stroke();
  context.fillStyle = "#302d27"; context.beginPath(); context.ellipse(-height * .48, -height * .025, height * .09, 4, -.08, 0, Math.PI * 2); context.fill();
  context.fillStyle = profile.body; context.strokeStyle = cinematicFocus ? "rgba(229,204,157,.76)" : "rgba(32,29,24,.62)"; context.lineWidth = cinematicFocus ? 3.4 : 2;
  context.beginPath(); context.roundRect(-height * .12, -height * .24, height * .48, height * .22, 5); context.fill(); context.stroke();
  context.fillStyle = enemy.unitType === "collaborator" ? "#273234" : "#4a4938"; context.fillRect(-height * .11, -height * .1, height * .45, Math.max(3, height * .035));
  context.strokeStyle = profile.body; context.lineWidth = Math.max(5, height * .055); context.beginPath(); context.moveTo(height * .02, -height * .17); context.lineTo(height * .26, -height * .29); context.stroke();
  context.fillStyle = profile.skin; context.beginPath(); context.arc(height * .43, -height * .15, height * profile.head, 0, Math.PI * 2); context.fill();
  context.fillStyle = enemy.unitType === "collaborator" ? "#2c3738" : "#5b5c45"; context.beginPath(); context.arc(height * .43, -height * .18, height * profile.head * 1.02, Math.PI, Math.PI * 2); context.fill();
  context.fillStyle = "rgba(57,38,29,.7)"; context.beginPath(); context.arc(height * .47, -height * .14, 1.8, 0, Math.PI * 2); context.fill();
  context.restore();
}

function DrawImpactInkBurst(screenX, screenY, pulse) {
  if (pulse <= 0) return;
  context.save(); context.translate(screenX, screenY); context.globalAlpha = pulse;
  context.strokeStyle = "#ead7ad"; context.fillStyle = "#b83f35"; context.lineCap = "round";
  for (let ray = 0; ray < 11; ray += 1) {
    const angle = ray / 11 * Math.PI * 2 + .17;
    const inner = 16 + (ray % 3) * 3;
    const outer = 32 + (ray % 4) * 8;
    context.lineWidth = ray % 2 ? 1.6 : 3.1;
    context.beginPath(); context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner); context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer); context.stroke();
  }
  context.beginPath(); context.arc(0, 0, 7 + pulse * 5, 0, Math.PI * 2); context.fill();
  context.restore();
}

function DrawTakedownTarget(width, viewportHeight, surfaceY, tunnelY) {
  const sequence = state.takedown;
  if (!sequence) return;
  const target = sequence.target;
  const profile = actorProfiles[target.unitType] || actorProfiles.soldier;
  const scale = Math.min(width, 1100) / 26 * .038 * TakedownFigureScale(width);
  const height = profile.height * 39 * scale;
  const baseY = LayerBaseY(target.layer || "surface", target.x, viewportHeight, surfaceY, tunnelY);
  const fall = SmoothStep(.92, 1.54, sequence.time);
  const disarmed = sequence.time >= .96;
  const screenX = WorldToScreen(target.x, width);
  const focus = 1 - SmoothStep(.72, 1.02, sequence.time);
  if (focus > 0) {
    context.save(); context.globalAlpha = focus;
    DrawFocusBrackets(screenX, baseY - height * .52, height * .24, height * .5, "#d6b66f");
    context.restore();
  }
  const uprightAlpha = 1 - SmoothStep(.52, .86, fall);
  const proneAlpha = SmoothStep(.44, .84, fall);
  if (uprightAlpha > .01) {
    context.save(); context.globalAlpha = uprightAlpha; context.shadowColor = "rgba(214,182,111,.42)"; context.shadowBlur = sequence.time < 1.08 ? 9 : 0;
    DrawEnemyUnit({ ...target, takedownFall: fall, disarmed, investigating: false }, height, screenX, baseY);
    context.restore();
  }
  if (proneAlpha > .01) DrawProneEnemyBody(target, width, baseY, height, proneAlpha);
  if (disarmed) DrawDroppedEnemyEquipment(target, width, baseY, height, SmoothStep(.96, 1.56, sequence.time));
  const impactPulse = Math.max(0, 1 - Math.abs(sequence.time - .96) / .16);
  DrawImpactInkBurst(screenX + target.facing * height * .02, baseY - height * .83, impactPulse);
}

function DrawUnconsciousEnemies(width, viewportHeight, surfaceY, tunnelY) {
  if (!state.unconsciousEnemies.length) return;
  const scale = Math.min(width, 1100) / 26 * .038 * TakedownFigureScale(width);
  state.unconsciousEnemies.forEach((enemy) => {
    const profile = actorProfiles[enemy.unitType] || actorProfiles.soldier;
    const height = profile.height * 39 * scale;
    const baseY = LayerBaseY(enemy.layer || "surface", enemy.x, viewportHeight, surfaceY, tunnelY);
    DrawProneEnemyBody(enemy, width, baseY, height, 1);
    DrawDroppedEnemyEquipment(enemy, width, baseY, height, 1);
    const bodyX = WorldToScreen(enemy.x + enemy.facing * .04, width);
    const equipmentX = WorldToScreen(enemy.x + enemy.facing * .72, width);
    const breath = .5 + Math.sin(state.elapsed * 2.4) * .5;
    context.save(); context.textAlign = "center";
    context.strokeStyle = `rgba(214,198,154,${.28 + breath * .42})`; context.lineWidth = 1.6;
    context.beginPath(); context.arc(bodyX, baseY - 21, 10 + breath * 4, Math.PI * 1.08, Math.PI * 1.92); context.stroke();
    if (enemy.age < 4.5) {
      const alpha = Math.min(1, (4.5 - enemy.age) * .65);
      context.globalAlpha = alpha;
      context.fillStyle = "rgba(20,18,15,.92)"; context.fillRect(bodyX - 61, baseY + 38, 122, 23);
      context.strokeStyle = "rgba(143,151,118,.82)"; context.strokeRect(bodyX - 60.5, baseY + 38.5, 121, 22);
      context.fillStyle = "#e6d8b7"; context.font = '800 10px "FangSong", serif'; context.fillText(enemy.cause === "rifle" || enemy.cause === "blast" ? "已失去战斗力" : "已制服 · 尚有呼吸", bodyX, baseY + 54);
      context.strokeStyle = "rgba(184,63,53,.7)"; context.lineWidth = 1.2; context.beginPath(); context.moveTo(equipmentX, baseY + 8); context.lineTo(equipmentX, baseY + 27); context.stroke();
      context.fillStyle = "#b83f35"; context.beginPath(); context.arc(equipmentX, baseY + 30, 3, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#d5c397"; context.font = '700 8px "FangSong", serif'; context.fillText(enemy.ammoDrop > 0 && !enemy.lootTaken ? "E · 拾取 1 发散弹" : "武器已离手", equipmentX, baseY + 72);
    }
    context.restore();
  });
}

function DrawTakedownCinematicOverlay(width, height) {
  const sequence = state.takedown;
  if (!sequence) return;
  const time = sequence.time;
  const open = SmoothStep(0, .22, time) * (1 - SmoothStep(2.42, 2.65, time));
  const captions = time < .38 ? ["屏息", "先让脚步停下来"] : time < .86 ? ["贴近", "扣住持械一侧"] : time < 1.42 ? ["击昏", "一击即收，不恋战"] : ["收械", "确认呼吸，武器踢远"];
  const activeBeat = time < .38 ? 0 : time < .86 ? 1 : time < 1.42 ? 2 : 3;
  context.save();
  const vignette = context.createRadialGradient(width * .5, height * .49, width * .12, width * .5, height * .49, width * .68);
  vignette.addColorStop(0, "rgba(14,16,14,0)"); vignette.addColorStop(1, `rgba(10,9,8,${.5 * open})`);
  context.fillStyle = vignette; context.fillRect(0, 0, width, height);
  context.fillStyle = `rgba(13,12,10,${.9 * open})`; context.fillRect(0, 0, width, 42 * open); context.fillRect(0, height - 64 * open, width, 64 * open);
  context.textAlign = "center"; context.font = '800 10px "FangSong", serif';
  const beatLabels = ["屏息", "扣肩", "击昏", "收械"];
  const startX = width * .5 - 116;
  beatLabels.forEach((label, index) => {
    const x = startX + index * 78;
    context.fillStyle = index === activeBeat ? "#b83f35" : index < activeBeat ? "#7e8067" : "rgba(224,210,174,.28)";
    context.beginPath(); context.rotate(0); context.rect(x - 4, 18, 8, 8); context.fill();
    context.fillStyle = index === activeBeat ? "#f0dfbd" : "rgba(226,214,184,.55)"; context.fillText(label, x, 14);
    if (index < beatLabels.length - 1) { context.strokeStyle = "rgba(222,205,167,.24)"; context.lineWidth = 1; context.beginPath(); context.moveTo(x + 10, 22); context.lineTo(x + 68, 22); context.stroke(); }
  });
  context.fillStyle = `rgba(18,16,13,${.92 * open})`; context.fillRect(width * .5 - 118, height - 51, 236, 34);
  context.fillStyle = "#b83f35"; context.fillRect(width * .5 - 118, height - 51, 5, 34);
  context.fillStyle = "#f1dfbb"; context.font = '900 16px "FangSong", serif'; context.fillText(captions[0], width * .5 - 63, height - 30);
  context.fillStyle = "#bfb394"; context.font = '700 10px "FangSong", serif'; context.textAlign = "left"; context.fillText(captions[1], width * .5 - 25, height - 30);
  const flash = Math.max(0, 1 - Math.abs(time - .96) / .1);
  if (flash > 0) { context.fillStyle = `rgba(237,220,177,${flash * .2})`; context.fillRect(0, 0, width, height); }
  context.restore();
}

function DrawJointedLimb(originX, originY, upperLength, lowerLength, upperAngle, lowerAngle, color, width) {
  const kneeX = originX + Math.sin(upperAngle) * upperLength;
  const kneeY = originY + Math.cos(upperAngle) * upperLength;
  const endX = kneeX + Math.sin(lowerAngle) * lowerLength;
  const endY = kneeY + Math.cos(lowerAngle) * lowerLength;
  context.strokeStyle = "rgba(25,27,26,.38)"; context.lineWidth = width + 3; context.lineCap = "round"; context.lineJoin = "round";
  context.beginPath(); context.moveTo(originX + 1, originY + 2); context.lineTo(kneeX + 1, kneeY + 2); context.lineTo(endX + 1, endY + 2); context.stroke();
  context.strokeStyle = color; context.lineWidth = width;
  context.beginPath(); context.moveTo(originX, originY); context.lineTo(kneeX, kneeY); context.lineTo(endX, endY); context.stroke();
  return { x: endX, y: endY };
}

function DrawHeadwear(profile, roleId, height, headY, headRadius) {
  context.fillStyle = profile.hair;
  if (profile.headwear === "scarf") {
    context.fillStyle = profile.accent; context.beginPath(); context.moveTo(-headRadius * 1.18, headY); context.lineTo(-headRadius * 1.42, headY + headRadius * 2.2); context.lineTo(headRadius * .25, headY + headRadius * 1.25); context.closePath(); context.fill();
    context.beginPath(); context.arc(0, headY - headRadius * .18, headRadius * 1.06, Math.PI, Math.PI * 2); context.fill();
  } else if (["cap", "smallCap", "sideCap", "fieldCap"].includes(profile.headwear)) {
    if (profile.headwear === "sideCap") context.fillStyle = profile.accent;
    context.beginPath(); context.arc(0, headY - headRadius * .34, headRadius * 1.04, Math.PI, Math.PI * 2); context.fill();
    context.fillRect(profile.headwear === "sideCap" ? -headRadius * .35 : 0, headY - headRadius * .5, headRadius * 1.25, Math.max(2, height * .026));
    if (profile.headwear === "sideCap") {
      context.strokeStyle = "rgba(235,239,224,.55)"; context.lineWidth = 1.5;
      context.beginPath(); context.moveTo(-headRadius * .68, headY - headRadius * .49); context.lineTo(headRadius * .67, headY - headRadius * .62); context.stroke();
    }
  } else if (profile.headwear === "headwrap") {
    context.fillStyle = "#756457"; context.fillRect(-headRadius * 1.08, headY - headRadius * .58, headRadius * 2.16, headRadius * .54);
    context.strokeStyle = "rgba(235,211,170,.42)"; context.lineWidth = 2; context.beginPath(); context.moveTo(-headRadius, headY - headRadius * .33); context.lineTo(headRadius, headY - headRadius * .12); context.stroke();
  } else {
    context.beginPath(); context.arc(-headRadius * .14, headY - headRadius * .28, headRadius * 1.04, Math.PI, Math.PI * 2); context.fill();
  }
  if (roleId === "student") {
    context.strokeStyle = "#273b45"; context.lineWidth = 1.5;
    context.beginPath(); context.arc(-headRadius * .4, headY + 1, headRadius * .29, 0, Math.PI * 2); context.arc(headRadius * .34, headY + 1, headRadius * .29, 0, Math.PI * 2); context.moveTo(-headRadius * .1, headY + 1); context.lineTo(headRadius * .05, headY + 1); context.stroke();
  }
}

function DrawRoleProp(profile, roleId, height, actionLift) {
  context.strokeStyle = profile.accent; context.fillStyle = profile.accent; context.lineCap = "round";
  if (state.levelIndex === 3 && roleId === "leader" && state.combat.rifle) {
    const firing = state.player.actionKind === "shoot";
    context.save(); context.translate(height * .03, -height * (.55 + actionLift * .08)); context.rotate(firing ? -.08 : -.54);
    context.strokeStyle = "rgba(25,20,16,.7)"; context.lineWidth = 8; context.beginPath(); context.moveTo(-height * .2, 3); context.lineTo(height * .56, 3); context.stroke();
    context.strokeStyle = "#855d39"; context.lineWidth = 4.5; context.beginPath(); context.moveTo(-height * .2, 0); context.lineTo(height * .22, 0); context.stroke();
    context.strokeStyle = "#b8bab0"; context.lineWidth = 3.2; context.beginPath(); context.moveTo(height * .14, 0); context.lineTo(height * .6, 0); context.stroke();
    context.fillStyle = "#493328"; context.beginPath(); context.moveTo(-height * .22, -5); context.lineTo(-height * .11, -10); context.lineTo(-height * .05, 2); context.lineTo(-height * .2, 7); context.closePath(); context.fill();
    context.restore();
    return;
  }
  if (roleId === "scout" && state.player.actionKind === "takedown" && state.takedown) {
    const time = state.takedown.time;
    const windup = SmoothStep(.35, .76, time);
    const strike = SmoothStep(.76, 1.02, time);
    const secure = SmoothStep(1.28, 1.82, time);
    const angle = Lerp(-1.05, .78, windup) - strike * 1.38 + secure * .32;
    context.save();
    context.translate(height * .17, -height * .49);
    context.rotate(angle);
    context.strokeStyle = "rgba(24,22,19,.62)"; context.lineWidth = 7; context.beginPath(); context.moveTo(2, 2); context.lineTo(height * .42 + 2, 2); context.stroke();
    context.strokeStyle = "#8a6748"; context.lineWidth = 4.2; context.beginPath(); context.moveTo(0, 0); context.lineTo(height * .42, 0); context.stroke();
    context.strokeStyle = "#d2b47b"; context.lineWidth = 6.2; context.beginPath(); context.moveTo(height * .32, 0); context.lineTo(height * .43, 0); context.stroke();
    context.restore();
    return;
  }
  if (profile.prop === "map") {
    context.strokeStyle = "#8d5d3f"; context.lineWidth = 2; context.beginPath(); context.moveTo(-height * .22, -height * .61); context.lineTo(height * .2, -height * .27); context.stroke();
    context.fillStyle = "#d6c69e"; context.fillRect(height * .12, -height * .34, height * .16, height * .12);
  } else if (profile.prop === "telescope") {
    context.strokeStyle = profile.accent; context.lineWidth = Math.max(3, height * .035); context.beginPath(); context.moveTo(-height * .22, -height * .62); context.lineTo(height * .22, -height * .31); context.stroke();
    context.fillStyle = "#435d68"; context.fillRect(height * .14, -height * (.36 + actionLift * .22), height * .23, height * .055);
  } else if (profile.prop === "clothRoll") {
    context.strokeStyle = profile.accent; context.lineWidth = 2; context.beginPath(); context.moveTo(-height * .22, -height * .64); context.lineTo(height * .19, -height * .3); context.stroke();
    context.fillStyle = "#d7c5a0"; context.beginPath(); context.arc(height * .2, -height * .3, height * .09, 0, Math.PI * 2); context.fill(); context.strokeStyle = "#8c7c63"; context.beginPath(); context.arc(height * .2, -height * .3, height * .045, 0, Math.PI * 2); context.stroke();
  } else if (profile.prop === "hammer") {
    context.strokeStyle = "#8a6748"; context.lineWidth = 3; context.beginPath(); context.moveTo(height * .22, -height * .38); context.lineTo(height * .35, -height * .12); context.stroke();
    context.fillStyle = "#474441"; context.fillRect(height * .27, -height * .43, height * .22, height * .08);
  } else if (profile.prop === "satchel") {
    context.strokeStyle = profile.accent; context.lineWidth = 2; context.beginPath(); context.moveTo(-height * .18, -height * .63); context.lineTo(height * .21, -height * .29); context.stroke();
    context.fillStyle = "#8e563c"; context.fillRect(height * .14, -height * .33, height * .22, height * .17);
  } else if (profile.prop === "binoculars") {
    context.strokeStyle = profile.accent; context.lineWidth = 2; context.beginPath(); context.moveTo(-height * .18, -height * .63); context.lineTo(height * .16, -height * .34); context.stroke();
    const glassY = -height * (.42 + actionLift * .28);
    context.fillStyle = "#263d42"; context.beginPath(); context.arc(height * .13, glassY, height * .078, 0, Math.PI * 2); context.arc(height * .3, glassY, height * .078, 0, Math.PI * 2); context.fill();
    context.strokeStyle = "#9fb7b3"; context.lineWidth = 1.5; context.beginPath(); context.arc(height * .13, glassY, height * .052, 0, Math.PI * 2); context.arc(height * .3, glassY, height * .052, 0, Math.PI * 2); context.stroke();
  }
}

function DrawHumanActor(profile, roleId, height) {
  const phase = state.player.step * profile.gait;
  const moving = state.player.motionBlend;
  const actionProgress = state.player.actionDuration ? 1 - state.player.actionTime / state.player.actionDuration : 0;
  let actionLift = state.player.actionTime > 0 ? Math.sin(actionProgress * Math.PI) : 0;
  const action = state.player.actionKind;
  const limbWidth = Math.max(3.2, height * (profile.limb || .038));
  const waist = height * (profile.waist || .105);
  const idleGesture = !moving && !action ? Math.max(0, (Math.sin(state.elapsed * .92 + profile.gait * 3) - .25) / .75) : 0;
  if ((roleId === "student" || roleId === "scout") && idleGesture > 0) actionLift = idleGesture;
  const idleBreath = Math.sin(state.elapsed * (1.25 + profile.gait * .22)) * 1.1;
  const bob = Math.abs(Math.sin(phase)) * -2.1 * moving + idleBreath * (1 - moving);
  const takedownTime = action === "takedown" && state.takedown ? state.takedown.time : 0;
  const takedownKneel = action === "takedown" ? SmoothStep(1.42, 2.05, takedownTime) : 0;
  const profileScale = state.player.lowProfile || action === "crawl" ? .7 : 1 - takedownKneel * .23;
  context.translate(0, bob);
  context.scale(1, profileScale);
  if (state.player.lowProfile || action === "crawl") context.rotate(-.055);
  if (action === "takedown") context.rotate(-.075 * SmoothStep(.22, .72, takedownTime) + .045 * takedownKneel);

  context.fillStyle = "rgba(0,0,0,.32)"; context.beginPath(); context.ellipse(0, 1 - bob, height * .24, 5, 0, 0, Math.PI * 2); context.fill();

  let rearLeg = Math.sin(phase) * .34 * moving;
  let frontLeg = -rearLeg;
  if (action === "climb") { rearLeg = Math.sin(actionProgress * Math.PI * 4) * .42; frontLeg = -rearLeg; }
  if (action === "takedown") { rearLeg = .24 * takedownKneel; frontLeg = -.18 * takedownKneel; }
  const rearFoot = DrawJointedLimb(-height * .065, -height * .34, height * .2, height * .18, rearLeg, -rearLeg * .35, profile.pants, limbWidth + .55);
  const frontFoot = DrawJointedLimb(height * .065, -height * .34, height * .2, height * .18, frontLeg, -frontLeg * .35, profile.pants, limbWidth + .55);
  context.fillStyle = "#282a28"; [rearFoot, frontFoot].forEach((foot, index) => { context.beginPath(); context.ellipse(foot.x + (index ? 2 : -2), foot.y + 1, height * .055, Math.max(2.4, height * .025), index ? -.08 : .08, 0, Math.PI * 2); context.fill(); });

  let rearArm = -.12 - Math.sin(phase) * .28 * moving;
  let frontArm = .12 + Math.sin(phase) * .28 * moving;
  let rearForearm = rearArm * .65;
  let frontForearm = frontArm * .65;
  if (action === "lift" || action === "carry") { rearArm = .92 + actionLift * .5; frontArm = 1.12 + actionLift * .35; rearForearm = .3; frontForearm = .2; }
  else if (action === "work") { rearArm = .62 + actionLift * .75; frontArm = 1.05 - actionLift * .5; rearForearm = 1.28; frontForearm = .8; }
  else if (action === "inspect") { frontArm = 1.8; frontForearm = 2.8; rearArm = .5; rearForearm = .2; }
  else if (action === "signal") { frontArm = 2.65; frontForearm = 3.05; rearArm = .45; rearForearm = .2; }
  else if (action === "ready") { rearArm = -.7 * actionLift; frontArm = .72 * actionLift; rearForearm = -.2; frontForearm = .2; }
  else if (action === "climb") { rearArm = 2.45 - Math.sin(actionProgress * Math.PI * 4) * .35; frontArm = 2.45 + Math.sin(actionProgress * Math.PI * 4) * .35; rearForearm = 2.8; frontForearm = 2.8; }
  else if (action === "caught") { rearArm = 2.72; frontArm = 2.58; rearForearm = 3.05; frontForearm = 3.12; }
  else if (action === "takedown") {
    const reach = SmoothStep(.18, .56, takedownTime);
    const strike = SmoothStep(.62, .94, takedownTime) * (1 - SmoothStep(.94, 1.18, takedownTime));
    rearArm = Lerp(.05, 1.46, reach) - strike * 2.25;
    frontArm = Lerp(.18, 1.72, reach) - strike * .48;
    rearForearm = Lerp(-.1, 2.25, reach) - strike * 1.35;
    frontForearm = Lerp(.15, 2.62, reach) - strike * .82;
    if (takedownKneel > 0) {
      rearArm = Lerp(rearArm, 1.18, takedownKneel);
      frontArm = Lerp(frontArm, 1.62, takedownKneel);
      rearForearm = Lerp(rearForearm, 2.28, takedownKneel);
      frontForearm = Lerp(frontForearm, 2.72, takedownKneel);
    }
  }
  else if ((roleId === "student" || roleId === "scout") && idleGesture > 0) {
    frontArm = 1.35 + idleGesture * .48; frontForearm = 2.2 + idleGesture * .58;
    rearArm = .72 + idleGesture * .34; rearForearm = 1.55 + idleGesture * .66;
  } else if (roleId === "leader") {
    frontArm = .42 + idleGesture * .24; frontForearm = 1.28; rearArm = -.38; rearForearm = -.82;
  } else if (roleId === "rescuer") {
    frontArm = .52 + idleGesture * .24; frontForearm = 1.48; rearArm = -.22; rearForearm = -.68;
  } else if (roleId === "blacksmith") {
    frontArm = .2 + idleGesture * .34; frontForearm = .62; rearArm = -.28; rearForearm = -.48;
  } else if (roleId === "child") {
    frontArm += idleGesture * .32; frontForearm += idleGesture * .52;
  }

  const rearHand = DrawJointedLimb(-height * profile.shoulder * .5, -height * .65, height * .2, height * .17, rearArm, rearForearm, profile.body, limbWidth);
  context.fillStyle = profile.skin; context.beginPath(); context.arc(rearHand.x, rearHand.y, Math.max(2.2, height * .03), 0, Math.PI * 2); context.fill();

  context.fillStyle = profile.body;
  const shoulder = height * profile.shoulder * .53;
  context.beginPath(); context.moveTo(-shoulder, -height * .72); context.quadraticCurveTo(0, -height * .765, shoulder, -height * .72); context.lineTo(waist, -height * .32); context.lineTo(-waist, -height * .32); context.closePath(); context.fill();
  context.fillStyle = "rgba(255,255,255,.11)"; context.beginPath(); context.moveTo(-shoulder * .74, -height * .69); context.lineTo(-height * .018, -height * .715); context.lineTo(-height * .018, -height * .35); context.lineTo(-waist * .72, -height * .34); context.closePath(); context.fill();
  context.strokeStyle = "rgba(49,45,38,.36)"; context.lineWidth = 1.4; context.beginPath(); context.moveTo(-height * .04, -height * .69); context.lineTo(0, -height * .61); context.lineTo(height * .04, -height * .69); context.moveTo(0, -height * .61); context.lineTo(0, -height * .36); context.stroke();
  context.fillStyle = profile.accent; context.fillRect(-waist * 1.16, -height * .39, waist * 2.32, Math.max(3, height * .032));
  if (roleId === "blacksmith") { context.fillStyle = profile.accent; context.beginPath(); context.moveTo(-height * .115, -height * .61); context.lineTo(height * .115, -height * .61); context.lineTo(height * .145, -height * .31); context.lineTo(-height * .145, -height * .31); context.closePath(); context.fill(); context.strokeStyle = "rgba(205,163,110,.3)"; context.lineWidth = 1.5; context.beginPath(); context.moveTo(-height * .095, -height * .58); context.lineTo(height * .1, -height * .34); context.stroke(); }
  if (roleId === "rescuer") { context.strokeStyle = profile.accent; context.lineWidth = 3; context.beginPath(); context.moveTo(-height * .16, -height * .54); context.lineTo(height * .16, -height * .54); context.stroke(); }
  if (roleId === "scout") {
    context.strokeStyle = "rgba(218,226,209,.68)"; context.lineWidth = 2;
    context.beginPath(); context.moveTo(-height * .16, -height * .66); context.lineTo(height * .15, -height * .37); context.stroke();
    context.fillStyle = "#4b5f59"; context.fillRect(-height * .29, -height * .42, height * .19, height * .2);
    context.strokeStyle = "#9aa894"; context.strokeRect(-height * .29, -height * .42, height * .19, height * .2);
  }

  DrawRoleProp(profile, roleId, height, actionLift);
  const frontHand = DrawJointedLimb(height * profile.shoulder * .5, -height * .65, height * .2, height * .17, frontArm, frontForearm, profile.body, limbWidth);
  context.fillStyle = profile.skin; context.beginPath(); context.arc(frontHand.x, frontHand.y, Math.max(2.2, height * .03), 0, Math.PI * 2); context.fill();

  const headY = -height * .86;
  const headRadius = height * profile.head;
  context.fillStyle = profile.skin; context.beginPath(); context.arc(0, headY, headRadius, 0, Math.PI * 2); context.fill();
  context.fillStyle = "rgba(87,49,36,.68)"; context.beginPath(); context.arc(headRadius * .4, headY + headRadius * .12, Math.max(1.5, headRadius * .12), 0, Math.PI * 2); context.fill();
  DrawHeadwear(profile, roleId, height, headY, headRadius);
}

function DrawDogActor(profile, height, actor = state.player) {
  const phase = actor.step * profile.gait;
  const moving = actor.motionBlend;
  const barking = actor.actionKind === "signal" && actor.actionTime > 0;
  const sniff = barking ? 0 : actor.actionKind === "crawl" || !moving ? (.5 + Math.sin(state.elapsed * 2.8) * .5) : 0;
  const bob = Math.abs(Math.sin(phase)) * -2 * moving;
  context.translate(0, bob);
  context.fillStyle = "rgba(0,0,0,.3)"; context.beginPath(); context.ellipse(0, 1 - bob, height * .48, 5, 0, 0, Math.PI * 2); context.fill();
  const legSwing = Math.sin(phase) * height * .08 * moving;
  context.strokeStyle = profile.pants; context.lineWidth = Math.max(3, height * .065); context.lineCap = "round";
  [-.27, -.08, .13, .31].forEach((offset, index) => { context.beginPath(); context.moveTo(height * offset, -height * .22); context.lineTo(height * offset + (index % 2 ? -legSwing : legSwing), 0); context.stroke(); });
  context.fillStyle = profile.body; context.beginPath(); context.ellipse(-height * .04, -height * .42, height * .48, height * .24, -.05, 0, Math.PI * 2); context.fill();
  context.fillStyle = "rgba(225,190,145,.48)"; context.beginPath(); context.ellipse(height * .08, -height * .37, height * .24, height * .12, 0, 0, Math.PI * 2); context.fill();
  const headY = -height * (barking ? .69 : .54 - sniff * .12);
  context.fillStyle = profile.skin; context.beginPath(); context.arc(height * .43, headY, height * .19, 0, Math.PI * 2); context.fill();
  context.fillStyle = profile.hair; context.beginPath(); context.moveTo(height * .32, headY - height * .15); context.lineTo(height * .27, headY - height * .35); context.lineTo(height * .43, headY - height * .18); context.moveTo(height * .49, headY - height * .16); context.lineTo(height * .62, headY - height * .31); context.lineTo(height * .59, headY - height * .08); context.fill();
  context.fillStyle = "#1e2422"; context.beginPath(); context.arc(height * .56, headY + 1, 2.3, 0, Math.PI * 2); context.arc(height * .44, headY - height * .04, 1.8, 0, Math.PI * 2); context.fill();
  if (barking) {
    const jaw = height * (.075 + Math.sin(state.elapsed * 28) * .014);
    context.fillStyle = "#3c1f1a"; context.beginPath(); context.ellipse(height * .55, headY + height * .105, height * .105, jaw, .12, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#d88c78"; context.beginPath(); context.ellipse(height * .585, headY + height * .13, height * .05, height * .022, .15, 0, Math.PI * 2); context.fill();
  }
  context.fillStyle = profile.accent; context.beginPath(); context.moveTo(height * .25, -height * .53); context.lineTo(height * .48, -height * .47); context.lineTo(height * .28, -height * .33); context.closePath(); context.fill();
  const tailWave = Math.sin(state.elapsed * (barking ? 15 : moving ? 8 : 3.5)) * (barking ? .48 : .35);
  context.strokeStyle = profile.body; context.lineWidth = Math.max(4, height * .075); context.beginPath(); context.moveTo(-height * .46, -height * .47); context.quadraticCurveTo(-height * .72, -height * (.72 + tailWave), -height * .62, -height * (.88 + tailWave)); context.stroke();
}

function DrawActorIdentity(profile, role, x, baseY, height) {
  context.save();
  context.font = "700 11px system-ui, sans-serif";
  const label = role.name;
  const labelWidth = Math.ceil(context.measureText(label).width) + 28;
  const left = x - labelWidth / 2;
  context.fillStyle = "rgba(8,13,15,.9)"; context.fillRect(left, baseY + 7, labelWidth, 21);
  context.fillStyle = profile.accent; context.fillRect(left, baseY + 7, 5, 21);
  context.strokeStyle = "rgba(240,236,217,.2)"; context.lineWidth = 1; context.strokeRect(left + .5, baseY + 7.5, labelWidth - 1, 20);
  context.fillStyle = "#f1eee2"; context.textAlign = "center"; context.fillText(label, x + 2, baseY + 22);
  if (state.player.rolePulse > 0) {
    const alpha = Math.min(1, state.player.rolePulse * 1.7);
    context.globalAlpha = alpha;
    context.strokeStyle = profile.accent; context.lineWidth = 3;
    DrawFocusBrackets(x, baseY - height * .51, height * .25, height * .5, profile.accent);
    context.fillStyle = "rgba(8,13,15,.88)"; context.fillRect(x - 58, baseY - height - 34, 116, 24);
    context.fillStyle = "#f3efe1"; context.font = "700 12px system-ui, sans-serif"; context.fillText(`现在是 ${role.short}`, x, baseY - height - 17);
  }
  context.restore();
}

function DrawDogCompanion(width, viewportHeight, surfaceY, tunnelY) {
  if (!state.level.roleIds.includes("dog") || state.selectedRole === "dog" || state.mode === "title") return;
  const dog = state.dog;
  const profile = actorProfiles.dog;
  const x = WorldToScreen(dog.x, width);
  const baseY = dog.layer === "surface" ? surfaceY - 5 : TunnelFloorYAt(dog.x, viewportHeight, tunnelY);
  const scale = Math.min(width, 1100) / 26 * .038;
  const height = profile.height * 39 * scale;
  context.save(); context.translate(x, baseY); context.scale(dog.facing, 1); DrawDogActor(profile, height, dog); context.restore();
  context.save(); context.font = "800 9px system-ui, sans-serif"; context.textAlign = "center";
  const active = Boolean(dog.commandId);
  context.fillStyle = active ? "rgba(16,47,49,.92)" : "rgba(8,13,15,.76)"; context.fillRect(x - 25, baseY + 7, 50, 18);
  context.strokeStyle = active ? "rgba(102,226,220,.92)" : "rgba(235,225,200,.2)"; context.lineWidth = 1; context.strokeRect(x - 24.5, baseY + 7.5, 49, 17);
  context.fillStyle = active ? "#bff5ef" : "#eee7d5"; context.fillText(active ? "阿土 · 执行" : "阿土", x, baseY + 19);
  context.restore();
}

function DrawDogCommandFocus(width, viewportHeight, surfaceY, tunnelY) {
  if (!state.level.roleIds.includes("dog") || state.selectedRole === "dog" || !state.dog.commandId || state.mode !== "play") return;
  const dog = state.dog;
  const profile = actorProfiles.dog;
  const x = WorldToScreen(dog.x, width);
  const baseY = dog.layer === "surface" ? surfaceY - 5 : TunnelFloorYAt(dog.x, viewportHeight, tunnelY);
  const baseScale = Math.min(width, 1100) / 26 * .038;
  const height = Math.max(44, profile.height * 39 * baseScale * 1.32);
  const phase = dog.step * profile.gait;
  const stride = Math.sin(phase) * height * .075 * dog.motionBlend;
  const bob = Math.abs(Math.sin(phase)) * -2.2 * dog.motionBlend;
  const facing = dog.facing || 1;

  context.save();
  context.translate(x, baseY + bob);
  context.scale(facing, 1);
  context.shadowColor = "rgba(244,178,77,.48)";
  context.shadowBlur = 13;

  context.fillStyle = "rgba(4,8,9,.92)";
  context.beginPath(); context.ellipse(-height * .03, -height * .39, height * .54, height * .29, -.04, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#a96140"; context.strokeStyle = "#f1c782"; context.lineWidth = 2.4;
  context.beginPath(); context.ellipse(-height * .03, -height * .41, height * .47, height * .23, -.04, 0, Math.PI * 2); context.fill(); context.stroke();
  context.fillStyle = "#d7a36b"; context.beginPath(); context.ellipse(height * .12, -height * .38, height * .24, height * .12, 0, 0, Math.PI * 2); context.fill();

  const legOffsets = [-.3, -.11, .11, .3];
  context.lineCap = "round";
  legOffsets.forEach((offset, index) => {
    const footOffset = index % 2 ? -stride : stride;
    context.strokeStyle = "rgba(3,7,8,.95)"; context.lineWidth = 8;
    context.beginPath(); context.moveTo(height * offset, -height * .29); context.lineTo(height * offset + footOffset, -1); context.stroke();
    context.strokeStyle = index < 2 ? "#6f402d" : "#d29a62"; context.lineWidth = 4;
    context.beginPath(); context.moveTo(height * offset, -height * .29); context.lineTo(height * offset + footOffset, -1); context.stroke();
    context.strokeStyle = "#efd7aa"; context.lineWidth = 2.5; context.beginPath(); context.moveTo(height * offset + footOffset - 3, -1); context.lineTo(height * offset + footOffset + 4, -1); context.stroke();
  });

  const headY = -height * .55;
  context.fillStyle = "rgba(4,8,9,.96)"; context.beginPath(); context.arc(height * .45, headY, height * .24, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#d39a64"; context.strokeStyle = "#f3d7a2"; context.lineWidth = 2.2;
  context.beginPath(); context.arc(height * .45, headY, height * .19, 0, Math.PI * 2); context.fill(); context.stroke();
  context.fillStyle = "#4b2c25";
  context.beginPath(); context.moveTo(height * .32, headY - height * .13); context.lineTo(height * .27, headY - height * .36); context.lineTo(height * .45, headY - height * .16); context.closePath(); context.fill();
  context.beginPath(); context.moveTo(height * .5, headY - height * .15); context.lineTo(height * .65, headY - height * .32); context.lineTo(height * .61, headY - height * .06); context.closePath(); context.fill();
  context.fillStyle = "#f7e8bc"; context.beginPath(); context.arc(height * .47, headY - 2, 2.3, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#171d1c"; context.beginPath(); context.arc(height * .61, headY + 1, 3, 0, Math.PI * 2); context.fill();

  const tailWave = Math.sin(state.elapsed * 6.5) * .16;
  context.strokeStyle = "rgba(3,7,8,.96)"; context.lineWidth = 9; context.beginPath(); context.moveTo(-height * .46, -height * .47); context.quadraticCurveTo(-height * .76, -height * (.7 + tailWave), -height * .64, -height * (.92 + tailWave)); context.stroke();
  context.strokeStyle = "#a96140"; context.lineWidth = 5; context.beginPath(); context.moveTo(-height * .46, -height * .47); context.quadraticCurveTo(-height * .76, -height * (.7 + tailWave), -height * .64, -height * (.92 + tailWave)); context.stroke();
  context.strokeStyle = "#63d6d0"; context.lineWidth = 4; context.beginPath(); context.moveTo(height * .25, -height * .52); context.lineTo(height * .49, -height * .46); context.stroke();
  context.restore();

  context.save(); context.font = "900 10px system-ui, sans-serif"; context.textAlign = "center";
  const labelY = baseY - height - 17;
  context.fillStyle = "rgba(6,13,15,.94)"; context.fillRect(x - 43, labelY - 13, 86, 20);
  context.strokeStyle = "rgba(102,222,214,.92)"; context.lineWidth = 1.5; context.strokeRect(x - 42.25, labelY - 12.25, 84.5, 18.5);
  context.fillStyle = "#f2d092"; context.fillText("犬 · 阿土执行中", x, labelY + 1); context.restore();
}

function DrawActor(width, viewportHeight, surfaceY, tunnelY) {
  const roleId = state.selectedRole;
  const profile = actorProfiles[roleId];
  const role = roleDefinitions[roleId];
  const x = WorldToScreen(state.player.x, width);
  const baseY = LayerBaseY(state.player.layer, state.player.x, viewportHeight, surfaceY, tunnelY);
  const barkScale = profile.animal && ActivePatrolLure("dogBark") ? 1.18 : 1;
  const combatMobileScale = state.levelIndex === 3 && width <= 640 ? 1.18 : 1;
  const scale = Math.min(width, 1100) / 26 * .038 * TakedownFigureScale(width) * barkScale * combatMobileScale;
  const height = profile.height * 39 * scale;
  context.save(); context.translate(x, baseY); context.scale(state.player.facing, 1);
  if (profile.animal) DrawDogActor(profile, height, state.player);
  else DrawHumanActor(profile, roleId, height);
  context.restore();
  if (!state.takedown && !ActivePatrolLure("dogBark")) DrawActorIdentity(profile, role, x, baseY, height);
}

function DrawSurfaceVegetation(width, height, surfaceY) {
  context.save();
  context.globalAlpha = .58;
  const clumps = [-10.2, -7.6, -4.1, 2.8, 6.1, 9.5];
  context.strokeStyle = "rgba(31,35,29,.72)";
  context.fillStyle = "rgba(43,47,34,.72)";
  context.lineCap = "round";
  for (let clumpIndex = 0; clumpIndex < clumps.length; clumpIndex += 1) {
    const baseX = LayerToScreen(clumps[clumpIndex], width, .9);
    for (let stemIndex = 0; stemIndex < 4; stemIndex += 1) {
      const offset = (stemIndex - 1.5) * 5;
      const stemHeight = 10 + ((clumpIndex * 7 + stemIndex * 5) % 15);
      const sway = Math.sin(state.elapsed * .7 + clumpIndex + stemIndex * .8) * 2;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(baseX + offset, surfaceY - 2);
      context.quadraticCurveTo(baseX + offset + sway, surfaceY - stemHeight * .55, baseX + offset + sway * 1.5, surfaceY - stemHeight);
      context.stroke();
      if (stemIndex % 2 === 0) {
        context.beginPath();
        context.ellipse(baseX + offset + sway + 2, surfaceY - stemHeight * .62, 4, 1.7, -.45, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
  context.restore();

  context.save();
  context.globalAlpha = .62;
  context.strokeStyle = "rgba(18,24,21,.78)"; context.fillStyle = "rgba(23,29,24,.76)"; context.lineCap = "round";
  const foregroundClumps = [-13, -9.3, -5.4, -1.2, 3.4, 7.7, 12.1];
  foregroundClumps.forEach((worldX, clumpIndex) => {
    const baseX = LayerToScreen(worldX, width, 1.16);
    const focusAlpha = ForegroundFocusAlpha(baseX, width, 64, 154, .2);
    context.save(); context.globalAlpha *= focusAlpha;
    for (let stemIndex = 0; stemIndex < 5; stemIndex += 1) {
      const offset = (stemIndex - 2) * 8;
      const stemHeight = 24 + ((clumpIndex * 9 + stemIndex * 7) % 30);
      const sway = Math.sin(state.elapsed * .55 + clumpIndex + stemIndex) * 3;
      context.lineWidth = 2.5;
      context.beginPath(); context.moveTo(baseX + offset, surfaceY + 5); context.quadraticCurveTo(baseX + offset + sway, surfaceY - stemHeight * .55, baseX + offset + sway * 1.4, surfaceY - stemHeight); context.stroke();
      if (stemIndex % 2 === 0) { context.beginPath(); context.ellipse(baseX + offset + sway + 3, surfaceY - stemHeight * .66, 7, 2.5, -.5, 0, Math.PI * 2); context.fill(); }
    }
    context.restore();
  });

  if (state.player.layer === "tunnel") {
    const floorSamples = [];
    for (let worldX = worldMin - 3; worldX <= worldMax + 3; worldX += .45) {
      floorSamples.push({ x: LayerToScreen(worldX, width, 1.07), y: TunnelFloorYAt(worldX, height, height * .76) + 9 + Math.sin(worldX * 2.1) * 3 });
    }
    context.fillStyle = "rgba(10,14,15,.42)";
    context.beginPath(); context.moveTo(0, height);
    floorSamples.forEach((point) => context.lineTo(point.x, point.y));
    context.lineTo(width, height); context.closePath(); context.fill();
  }
  context.restore();
  const vignette = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .2, width / 2, height / 2, Math.max(width, height) * .68);
  vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,.28)"); context.fillStyle = vignette; context.fillRect(0, 0, width, height);
}

function DrawForegroundDepthFrame(width, height, surfaceY, tunnelY, daylight) {
  context.save();
  context.globalAlpha = .62;
  const nearScale = Math.max(.72, Math.min(1.18, width / 1100));
  const nearStructures = [-16.2, -7.1, 3.6, 13.9, 23.1];
  nearStructures.forEach((worldX, index) => {
    const x = LayerToScreen(worldX, width, 1.2);
    if (x < -150 || x > width + 150 || (x > width * .23 && x < width * .77)) return;
    context.save(); context.globalAlpha *= ForegroundFocusAlpha(x, width, 82, 196, .2);
    const side = x < width / 2 ? 1 : -1;
    const structureWidth = (112 + index % 2 * 26) * nearScale;
    const wallHeight = (112 + index % 3 * 18) * nearScale;
    context.fillStyle = daylight > .4 ? "rgba(43,36,29,.78)" : "rgba(16,19,20,.86)";
    context.fillRect(x - structureWidth / 2, surfaceY - wallHeight, structureWidth, wallHeight + 9);
    context.fillStyle = daylight > .4 ? "rgba(29,27,25,.94)" : "rgba(8,12,14,.97)";
    context.beginPath(); context.moveTo(x - structureWidth * .76, surfaceY - wallHeight); context.lineTo(x + side * structureWidth * .08, surfaceY - wallHeight - 52 * nearScale); context.lineTo(x + structureWidth * .76, surfaceY - wallHeight); context.closePath(); context.fill();
    context.fillStyle = "rgba(81,61,42,.72)";
    context.beginPath(); context.moveTo(x + side * structureWidth * .5, surfaceY - wallHeight); context.lineTo(x + side * structureWidth * .82, surfaceY - wallHeight - 17 * nearScale); context.lineTo(x + side * structureWidth * .82, surfaceY); context.lineTo(x + side * structureWidth * .5, surfaceY); context.closePath(); context.fill();
    context.strokeStyle = "rgba(172,124,70,.6)"; context.lineWidth = 7 * nearScale;
    context.beginPath(); context.moveTo(x - structureWidth * .43, surfaceY); context.lineTo(x - structureWidth * .43, surfaceY - wallHeight + 8); context.moveTo(x + structureWidth * .43, surfaceY); context.lineTo(x + structureWidth * .43, surfaceY - wallHeight + 8); context.moveTo(x - structureWidth * .58, surfaceY - wallHeight + 9); context.lineTo(x + structureWidth * .58, surfaceY - wallHeight + 9); context.stroke();
    context.strokeStyle = "rgba(218,169,101,.18)"; context.lineWidth = 2;
    for (let beam = 0; beam < 3; beam += 1) { const beamY = surfaceY - wallHeight * (.22 + beam * .23); context.beginPath(); context.moveTo(x - structureWidth * .48, beamY); context.lineTo(x + structureWidth * .48, beamY - 3); context.stroke(); }
    context.restore();
  });

  const nearCropXs = [-18.4, -13.6, -8.7, -3.9, 1.8, 6.7, 11.6, 16.4];
  nearCropXs.forEach((worldX, clumpIndex) => {
    const baseX = LayerToScreen(worldX, width, 1.29);
    if (baseX < -90 || baseX > width + 90) return;
    context.save(); context.globalAlpha *= ForegroundFocusAlpha(baseX, width, 66, 164, .18);
    const clumpHeight = (56 + SceneHash(worldX + 510) * 82) * nearScale;
    const stalkCount = 3 + Math.floor(SceneHash(worldX + 521) * 5);
    for (let stalk = 0; stalk < stalkCount; stalk += 1) {
      const spread = (stalk / Math.max(1, stalkCount - 1) - .5) * (34 + SceneHash(worldX + 533) * 32) * nearScale;
      const sway = Math.sin(state.elapsed * .42 + stalk + worldX) * 5 * nearScale;
      const stalkHeight = clumpHeight * (.62 + SceneHash(stalk + worldX * 3) * .4);
      const stalkLean = (SceneHash(stalk + worldX * 11) - .5) * 13 * nearScale;
      context.strokeStyle = daylight > .4 ? "rgba(28,35,23,.82)" : "rgba(11,19,18,.88)"; context.lineWidth = (2.2 + SceneHash(stalk + 607) * 2.1) * nearScale; context.lineCap = "round";
      context.beginPath(); context.moveTo(baseX + spread, surfaceY + 8); context.quadraticCurveTo(baseX + spread + sway * .35, surfaceY - stalkHeight * .55, baseX + spread + sway, surfaceY - stalkHeight); context.stroke();
      context.fillStyle = daylight > .4 ? "rgba(42,48,29,.88)" : "rgba(17,25,21,.92)";
      context.beginPath();
      context.ellipse(baseX + spread + sway + 7 + stalkLean * .25, surfaceY - stalkHeight * .73, 12 * nearScale, 3.8 * nearScale, -.62, 0, Math.PI * 2);
      if ((stalk + clumpIndex) % 3 !== 1) context.ellipse(baseX + spread + sway - 5, surfaceY - stalkHeight * .48, 10 * nearScale, 3.5 * nearScale, .58, 0, Math.PI * 2);
      context.fill();
      if ((stalk + clumpIndex) % 3 === 0) { context.fillStyle = "rgba(105,83,43,.86)"; context.beginPath(); context.ellipse(baseX + spread + sway + stalkLean * .1, surfaceY - stalkHeight - 4, 3.8 * nearScale, 10 * nearScale, -.16, 0, Math.PI * 2); context.fill(); }
    }
    context.restore();
  });

  const branchDrift = state.camera.x * 8.5;
  context.strokeStyle = daylight > .4 ? "rgba(24,27,23,.88)" : "rgba(7,12,14,.94)"; context.lineCap = "round";
  const crownSides = [
    { mirror: 1, rootX: -30, rootY: 16, reachX: width * .23 - branchDrift, reachY: 116 },
    { mirror: -1, rootX: width + 30, rootY: -4, reachX: width * .79 - branchDrift, reachY: 132 }
  ];
  crownSides.forEach((crown, sideIndex) => {
    context.lineWidth = (15 + sideIndex * 3) * nearScale;
    context.beginPath(); context.moveTo(crown.rootX, crown.rootY); context.bezierCurveTo(crown.rootX + crown.mirror * width * .08, 25, crown.reachX - crown.mirror * 60, crown.reachY - 30, crown.reachX, crown.reachY); context.stroke();
    for (let twig = 0; twig < 7; twig += 1) {
      const progress = .18 + twig * .105;
      const anchorX = Lerp(crown.rootX, crown.reachX, progress) + Math.sin(twig * 2.2 + sideIndex) * 11;
      const anchorY = Lerp(crown.rootY, crown.reachY, progress) + Math.cos(twig * 1.7) * 9;
      const upper = twig % 3 !== 1;
      const angleX = crown.mirror * (18 + SceneHash(twig + sideIndex * 40) * 27);
      const angleY = (upper ? -1 : 1) * (20 + SceneHash(twig + 87) * 28);
      const tipX = anchorX + angleX;
      const tipY = anchorY + angleY;
      context.lineWidth = (2.6 + SceneHash(twig + 101) * 3.2) * nearScale;
      context.beginPath(); context.moveTo(anchorX, anchorY); context.quadraticCurveTo(anchorX + angleX * .38 - crown.mirror * 5, anchorY + angleY * .42, tipX, tipY); context.stroke();
      if (twig % 2 === 0) {
        const forkX = tipX - crown.mirror * (8 + twig);
        const forkY = tipY + (upper ? 12 : -12);
        context.lineWidth = 2 * nearScale; context.beginPath(); context.moveTo(tipX - angleX * .28, tipY - angleY * .28); context.lineTo(forkX, forkY); context.stroke();
      }
      context.fillStyle = daylight > .4 ? "rgba(31,40,30,.9)" : "rgba(10,20,18,.94)";
      const leafCount = 2 + (twig % 3);
      for (let leaf = 0; leaf < leafCount; leaf += 1) {
        const leafX = tipX - crown.mirror * leaf * 7 + Math.sin(leaf + twig) * 4;
        const leafY = tipY + (leaf - 1) * 7;
        context.beginPath(); context.ellipse(leafX, leafY, (9 + SceneHash(leaf + twig * 6) * 6) * nearScale, (3.5 + SceneHash(leaf + twig * 9) * 2.5) * nearScale, crown.mirror * (-.45 + leaf * .2), 0, Math.PI * 2); context.fill();
      }
    }
  });

  const foregroundSupports = [-11.8, -6.2, -.7, 4.9, 10.5];
  foregroundSupports.forEach((worldX, index) => {
    const x = LayerToScreen(worldX, width, 1.13);
    if (x < -50 || x > width + 50) return;
    context.save(); context.globalAlpha *= ForegroundFocusAlpha(x, width, 56, 142, .2);
    const centerY = TunnelCenterYAt(worldX, tunnelY);
    const localHalfHeight = TunnelHalfHeightAt(worldX, height);
    const ceilingY = centerY - localHalfHeight + 2;
    const floorY = centerY + localHalfHeight + 7;
    context.strokeStyle = "rgba(24,17,13,.78)"; context.lineWidth = 13 * nearScale;
    context.beginPath(); context.moveTo(x, floorY + 18); context.lineTo(x + (index % 2 ? -5 : 5), ceilingY + 7); context.moveTo(x - 25 * nearScale, ceilingY + 6); context.lineTo(x + 26 * nearScale, ceilingY + 6); context.stroke();
    context.strokeStyle = "rgba(105,75,43,.88)"; context.lineWidth = 7 * nearScale;
    context.beginPath(); context.moveTo(x, floorY + 16); context.lineTo(x + (index % 2 ? -5 : 5), ceilingY + 8); context.moveTo(x - 24 * nearScale, ceilingY + 8); context.lineTo(x + 25 * nearScale, ceilingY + 8); context.stroke();
    context.strokeStyle = "rgba(192,139,75,.22)"; context.lineWidth = 2;
    context.beginPath(); context.moveTo(x + 4, floorY + 10); context.lineTo(x + (index % 2 ? -1 : 9), ceilingY + 12); context.stroke();
    context.restore();
  });

  const rootXs = [-9.8, -4.8, .2, 5.2, 10.2];
  rootXs.forEach((worldX, index) => {
    const x = LayerToScreen(worldX, width, 1.09);
    const rootLength = 18 + index % 3 * 12;
    context.save(); context.globalAlpha *= ForegroundFocusAlpha(x, width, 48, 128, .22);
    context.strokeStyle = "rgba(78,54,35,.42)"; context.lineWidth = 1.8;
    context.beginPath(); context.moveTo(x, surfaceY + 2); context.quadraticCurveTo(x + (index % 2 ? -8 : 7), surfaceY + rootLength * .55, x + (index % 3 - 1) * 11, surfaceY + rootLength); context.stroke();
    context.restore();
  });

  const floorSamples = [];
  for (let worldX = worldMin - 4; worldX <= worldMax + 4; worldX += .42) {
    floorSamples.push({ x: LayerToScreen(worldX, width, 1.085), y: TunnelFloorYAt(worldX, height, tunnelY) + 14 + Math.sin(worldX * 2.8) * 5 });
  }
  const lipGradient = context.createLinearGradient(0, tunnelY, 0, height);
  lipGradient.addColorStop(0, "rgba(28,22,18,.18)"); lipGradient.addColorStop(1, "rgba(5,9,11,.86)");
  context.fillStyle = lipGradient; context.beginPath(); context.moveTo(-30, height); floorSamples.forEach((point) => context.lineTo(point.x, point.y)); context.lineTo(width + 30, height); context.closePath(); context.fill();
  context.strokeStyle = "rgba(123,88,49,.3)"; context.lineWidth = 2.5; context.beginPath(); floorSamples.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();

  const nearVignette = context.createRadialGradient(width / 2, height * .54, Math.min(width, height) * .28, width / 2, height * .54, Math.max(width, height) * .76);
  nearVignette.addColorStop(0, "rgba(0,0,0,0)"); nearVignette.addColorStop(.68, "rgba(0,0,0,.025)"); nearVignette.addColorStop(1, "rgba(0,0,0,.18)"); context.fillStyle = nearVignette; context.fillRect(0, 0, width, height);
  context.restore();
}

function BuildLianhuanhuaTexture() {
  const texture = document.createElement("canvas");
  texture.width = 192; texture.height = 192;
  const ink = texture.getContext("2d");
  let seed = 1942;
  const NextPrintNoise = () => {
    seed = seed * 1664525 + 1013904223 | 0;
    return (seed >>> 0) / 4294967296;
  };
  ink.clearRect(0, 0, texture.width, texture.height);
  ink.lineCap = "round";
  for (let fiber = 0; fiber < 520; fiber += 1) {
    const x = NextPrintNoise() * texture.width;
    const y = NextPrintNoise() * texture.height;
    const length = 2 + NextPrintNoise() * 13;
    const angle = (NextPrintNoise() - .5) * .34;
    ink.strokeStyle = `rgba(41,31,22,${.018 + NextPrintNoise() * .04})`;
    ink.lineWidth = .35 + NextPrintNoise() * .6;
    ink.beginPath(); ink.moveTo(x, y); ink.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length); ink.stroke();
  }
  for (let speck = 0; speck < 210; speck += 1) {
    ink.fillStyle = `rgba(31,23,17,${.025 + NextPrintNoise() * .06})`;
    ink.beginPath(); ink.arc(NextPrintNoise() * texture.width, NextPrintNoise() * texture.height, .25 + NextPrintNoise() * .75, 0, Math.PI * 2); ink.fill();
  }
  return texture;
}

function DrawLianhuanhuaPostProcess(width, height, surfaceY, tunnelY, daylight) {
  if (!lianhuanhuaTexture) lianhuanhuaTexture = BuildLianhuanhuaTexture();
  if (!lianhuanhuaPattern) lianhuanhuaPattern = context.createPattern(lianhuanhuaTexture, "repeat");
  context.save();

  context.globalCompositeOperation = "multiply";
  context.fillStyle = daylight > .4 ? "rgba(103,72,37,.06)" : "rgba(91,56,35,.1)";
  context.fillRect(0, 0, width, height);

  context.save();
  context.beginPath(); context.rect(0, surfaceY + 3, width, height - surfaceY - 3); context.clip();
  context.strokeStyle = "rgba(31,24,19,.045)"; context.lineWidth = .65;
  const hatchSpacing = Math.max(11, Math.min(17, width / 82));
  for (let offset = -height; offset < width + height; offset += hatchSpacing) {
    context.beginPath(); context.moveTo(offset, surfaceY - 12); context.lineTo(offset - height * .48, height + 12); context.stroke();
  }
  context.strokeStyle = "rgba(227,206,163,.045)";
  for (let offset = -height; offset < width + height; offset += hatchSpacing * 2.4) {
    context.beginPath(); context.moveTo(offset, height + 6); context.lineTo(offset - height * .34, surfaceY + 4); context.stroke();
  }
  context.restore();

  context.strokeStyle = daylight > .4 ? "rgba(53,45,33,.028)" : "rgba(232,216,177,.014)";
  context.lineWidth = .7;
  for (let line = 0; line < 10; line += 1) {
    const y = 17 + line * surfaceY / 11;
    const start = SceneHash(line + 804) * width * .62;
    const length = width * (.08 + SceneHash(line + 826) * .29);
    context.beginPath(); context.moveTo(start, y); context.quadraticCurveTo(start + length * .5, y + Math.sin(line) * 2, start + length, y + (line % 3 - 1)); context.stroke();
  }

  context.globalAlpha = daylight > .4 ? .34 : .29;
  context.fillStyle = lianhuanhuaPattern;
  context.fillRect(0, 0, width, height);

  context.globalCompositeOperation = "source-over";
  const paperGlow = context.createRadialGradient(width * .48, height * .45, 20, width * .48, height * .45, Math.max(width, height) * .72);
  paperGlow.addColorStop(0, "rgba(239,224,186,.025)");
  paperGlow.addColorStop(.7, "rgba(63,43,29,.02)");
  paperGlow.addColorStop(1, "rgba(22,18,15,.18)");
  context.fillStyle = paperGlow; context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(24,19,15,.62)"; context.lineWidth = Math.max(2, Math.min(5, width * .003));
  context.beginPath();
  context.moveTo(3, 8); context.quadraticCurveTo(width * .31, 2, width - 7, 6);
  context.quadraticCurveTo(width - 2, height * .48, width - 6, height - 7);
  context.quadraticCurveTo(width * .64, height - 2, 6, height - 6);
  context.quadraticCurveTo(2, height * .57, 3, 8); context.stroke();
  context.restore();
}

function DrawCombatEffects(width, height, surfaceY, tunnelY) {
  if (state.levelIndex !== 3 || !state.combat) return;
  const combat = state.combat;
  context.save();
  combat.blastScars.forEach((scar, scarIndex) => {
    const x = WorldToScreen(scar.x, width);
    const y = LayerBaseY(scar.layer, scar.x, height, surfaceY, tunnelY) - 24;
    const drift = Math.sin(state.elapsed * .62 + scarIndex) * 7;
    context.save(); context.translate(x, y);
    context.strokeStyle = "rgba(121,112,92,.42)"; context.lineWidth = width <= 640 ? 7 : 6; context.lineCap = "round";
    for (let plume = 0; plume < 3; plume += 1) {
      const side = (plume - 1) * 9;
      context.beginPath(); context.moveTo(side, 2); context.bezierCurveTo(side - 8, -15, side + drift + 12, -29 - plume * 5, side + drift, -48 - plume * 9); context.stroke();
    }
    context.strokeStyle = "rgba(226,176,97,.7)"; context.lineWidth = 1.5;
    [[-27, 5, -.2], [21, 8, .18], [36, 2, -.08]].forEach(([tileX, tileY, rotation]) => { context.save(); context.translate(tileX, tileY); context.rotate(rotation); context.strokeRect(-7, -3, 14, 6); context.restore(); });
    context.restore();
  });
  combat.shots.forEach((shot) => {
    const progress = Math.min(1, shot.age / shot.duration);
    const head = Lerp(shot.fromX, shot.toX, Math.min(1, progress * 1.65));
    const tail = Lerp(shot.fromX, shot.toX, Math.max(0, progress * 1.65 - .22));
    const headY = LayerBaseY(shot.layer, head, height, surfaceY, tunnelY) - 55;
    const tailY = LayerBaseY(shot.layer, tail, height, surfaceY, tunnelY) - 55;
    context.strokeStyle = `rgba(247,218,148,${1 - progress * .72})`; context.lineWidth = 2.8; context.beginPath(); context.moveTo(WorldToScreen(tail, width), tailY); context.lineTo(WorldToScreen(head, width), headY); context.stroke();
  });
  combat.enemyShots.forEach((shot) => {
    const progress = Math.min(1, shot.age / shot.duration);
    const head = Lerp(shot.fromX, shot.toX, progress);
    const tail = Lerp(shot.fromX, shot.toX, Math.max(0, progress - .18));
    const headY = LayerBaseY(shot.layer, head, height, surfaceY, tunnelY) - 48;
    const tailY = LayerBaseY(shot.layer, tail, height, surfaceY, tunnelY) - 48;
    context.strokeStyle = "rgba(207,71,54,.94)"; context.lineWidth = 3; context.beginPath(); context.moveTo(WorldToScreen(tail, width), tailY); context.lineTo(WorldToScreen(head, width), headY); context.stroke();
  });
  combat.grenadesInFlight.forEach((grenade) => {
    const progress = Math.min(1, grenade.age / grenade.duration);
    const worldX = Lerp(grenade.startX, grenade.targetX, progress);
    const y = LayerBaseY(grenade.layer, worldX, height, surfaceY, tunnelY) - 34 - Math.sin(progress * Math.PI) * 92;
    const x = WorldToScreen(worldX, width);
    context.save();
    context.setLineDash([7, 7]); context.strokeStyle = "rgba(225,190,105,.48)"; context.lineWidth = width <= 640 ? 2.4 : 1.8;
    const startX = WorldToScreen(grenade.startX, width);
    const startY = LayerBaseY(grenade.layer, grenade.startX, height, surfaceY, tunnelY) - 34;
    const targetX = WorldToScreen(grenade.targetX, width);
    const targetY = LayerBaseY(grenade.layer, grenade.targetX, height, surfaceY, tunnelY) - 34;
    context.beginPath(); context.moveTo(startX, startY); context.quadraticCurveTo((startX + targetX) / 2, Math.min(startY, targetY) - 98, targetX, targetY); context.stroke(); context.setLineDash([]);
    for (let echo = 1; echo <= 4; echo += 1) {
      const echoProgress = Math.max(0, progress - echo * .065);
      const echoWorldX = Lerp(grenade.startX, grenade.targetX, echoProgress);
      const echoY = LayerBaseY(grenade.layer, echoWorldX, height, surfaceY, tunnelY) - 34 - Math.sin(echoProgress * Math.PI) * 92;
      context.fillStyle = `rgba(224,199,126,${.34 - echo * .055})`; context.beginPath(); context.arc(WorldToScreen(echoWorldX, width), echoY, Math.max(2, 5 - echo * .65), 0, Math.PI * 2); context.fill();
    }
    context.restore();
    context.save(); context.translate(x, y); context.rotate(progress * 14 * grenade.facing);
    context.shadowColor = "rgba(237,202,113,.7)"; context.shadowBlur = width <= 640 ? 11 : 7;
    context.fillStyle = "#4c5944"; context.strokeStyle = "#f0d995"; context.lineWidth = width <= 640 ? 3 : 2; context.beginPath(); context.roundRect(-8, -11, 16, 22, 4); context.fill(); context.stroke();
    context.strokeStyle = "rgba(238,201,103,.72)"; context.lineWidth = 1.5; context.beginPath(); context.moveTo(-10, -4); context.lineTo(-15, -8); context.stroke(); context.restore();
  });
  combat.blasts.forEach((blast) => {
    const progress = Math.min(1, blast.age / blast.duration);
    const pulse = Math.sin(Math.min(1, progress * 1.7) * Math.PI);
    const x = WorldToScreen(blast.x, width);
    const y = LayerBaseY(blast.layer, blast.x, height, surfaceY, tunnelY) - 15;
    context.save(); context.translate(x, y); context.globalAlpha = 1 - progress * .75;
    const flash = 1 - SmoothStep(.04, .27, progress);
    if (flash > 0) {
      const flashRadius = (width <= 640 ? 92 : 118) * (.72 + flash * .28);
      const flashGlow = context.createRadialGradient(0, -12, 3, 0, -12, flashRadius);
      flashGlow.addColorStop(0, `rgba(255,248,199,${.98 * flash})`);
      flashGlow.addColorStop(.34, `rgba(242,182,75,${.9 * flash})`);
      flashGlow.addColorStop(1, "rgba(181,62,43,0)");
      context.fillStyle = flashGlow; context.beginPath(); context.arc(0, -12, flashRadius, 0, Math.PI * 2); context.fill();
      context.fillStyle = `rgba(255,231,157,${.95 * flash})`; context.beginPath();
      for (let point = 0; point < 24; point += 1) {
        const angle = point / 24 * Math.PI * 2;
        const radius = point % 2 ? 20 + flash * 18 : 72 + flash * 34;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius * .72 - 12;
        if (!point) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.closePath(); context.fill();
    }
    context.fillStyle = `rgba(39,35,29,${.78 - progress * .34})`; context.strokeStyle = "rgba(215,183,110,.68)"; context.lineWidth = 2;
    for (let cloud = 0; cloud < 4; cloud += 1) {
      const angle = cloud / 4 * Math.PI * 2 + .2;
      const radius = 20 + pulse * (34 + cloud % 3 * 9);
      context.beginPath(); context.arc(Math.cos(angle) * radius * .55, Math.sin(angle) * radius * .43 - pulse * 30, 14 + pulse * 17, 0, Math.PI * 2); context.fill(); context.stroke();
    }
    context.strokeStyle = "rgba(181,72,57,.82)"; context.lineWidth = 2.4;
    for (let arc = 0; arc < 4; arc += 1) {
      const radius = 34 + pulse * (26 + arc * 9);
      const start = -.5 + arc * 1.52;
      context.beginPath(); context.arc(0, -5, radius, start, start + .54); context.stroke();
    }
    for (let shard = 0; shard < 6; shard += 1) {
      const angle = -.25 - Math.PI * .8 + shard / 5 * Math.PI * 1.6;
      const travel = 24 + pulse * (42 + shard % 4 * 9);
      const shardX = Math.cos(angle) * travel;
      const shardY = Math.sin(angle) * travel - pulse * 22 + progress * progress * 38;
      context.save(); context.translate(shardX, shardY); context.rotate(angle + progress * 8 * (shard % 2 ? 1 : -1));
      context.fillStyle = shard % 3 ? "#76543a" : "#b36e3e"; context.strokeStyle = "#2b2019"; context.lineWidth = 1.2; context.fillRect(-5, -2, 10, 4); context.strokeRect(-5, -2, 10, 4); context.restore();
    }
    context.strokeStyle = `rgba(231,195,121,${.62 - progress * .4})`; context.lineWidth = 2 + pulse * 2;
    context.beginPath(); context.ellipse(0, 1, 26 + pulse * 72, 7 + pulse * 17, 0, -.05, Math.PI * .7); context.stroke();
    context.beginPath(); context.ellipse(0, 1, 26 + pulse * 72, 7 + pulse * 17, 0, Math.PI * 1.1, Math.PI * 1.72); context.stroke();
    context.restore();
  });
  if (combat.muzzleFlash > 0 && state.player.layer === "roof") {
    const x = WorldToScreen(state.player.x + state.player.facing * .65, width);
    const y = LayerBaseY("roof", state.player.x, height, surfaceY, tunnelY) - 56;
    context.fillStyle = `rgba(244,200,102,${combat.muzzleFlash / .16})`; context.beginPath(); context.moveTo(x, y); context.lineTo(x + state.player.facing * 24, y - 8); context.lineTo(x + state.player.facing * 15, y); context.lineTo(x + state.player.facing * 24, y + 8); context.closePath(); context.fill();
  }
  if (combat.damageFlash > 0) { context.fillStyle = `rgba(154,45,37,${combat.damageFlash * .32})`; context.fillRect(0, 0, width, height); }
  context.restore();
}

function DrawCombatHud(width, height) {
  if (state.levelIndex !== 3 || state.mode !== "play") return;
  const compact = width <= 640;
  const panelWidth = compact ? 174 : 222;
  const panelHeight = compact ? 35 : 42;
  const x = width * .5 - panelWidth * .5;
  const y = height - (compact ? 108 : 65);
  context.save();
  context.fillStyle = "rgba(38,30,23,.9)"; context.strokeStyle = state.combat.alarm ? "#ad4437" : "rgba(211,183,127,.72)"; context.lineWidth = 2; context.fillRect(x, y, panelWidth, panelHeight); context.strokeRect(x + 1, y + 1, panelWidth - 2, panelHeight - 2);
  context.textAlign = "left"; context.fillStyle = "#e9d7b2"; context.font = `900 ${compact ? 9 : 11}px system-ui, sans-serif`;
  context.fillText(state.combat.alarm ? "交火" : "隐蔽", x + 10, y + (compact ? 14 : 17));
  context.fillStyle = state.combat.alarm ? "#c55343" : "#918b68"; context.fillRect(x + 10, y + panelHeight - 10, 42, 3);
  context.fillStyle = "#d9c18d"; context.fillText(`F  子弹 ${state.combat.ammo}`, x + (compact ? 56 : 66), y + (compact ? 14 : 17));
  context.fillText(`G  雷 ${state.combat.grenades}`, x + (compact ? 116 : 142), y + (compact ? 14 : 17));
  context.fillStyle = "#b94a3c"; context.font = `800 ${compact ? 8 : 10}px system-ui, sans-serif`; context.fillText(`体力 ${"◆".repeat(state.combat.health)}${"◇".repeat(3 - state.combat.health)}`, x + (compact ? 56 : 66), y + panelHeight - 8);
  context.restore();
}

function DrawQa(width, height, surfaceY, tunnelY) {
  context.save(); context.font = "11px monospace"; context.fillStyle = "rgba(9,15,17,.78)"; context.fillRect(10, height - 78, 310, 64);
  context.fillStyle = "#8ff0e8"; context.fillText(`QA · ${state.level.id}/${state.phaseId} · x=${state.player.x.toFixed(2)} · ${state.player.layer}`, 20, height - 55);
  context.fillText(`complete=${[...state.completed].join(",")}`, 20, height - 38);
  context.fillText(`camera=${state.camera.x.toFixed(2)} z=${state.camera.zoom.toFixed(2)}`, 20, height - 21);
  context.strokeStyle = "rgba(255,255,255,.2)"; context.lineWidth = 1;
  for (let x = -10; x <= 10; x += 1) {
    const screenX = WorldToScreen(x, width); context.beginPath(); context.moveTo(screenX, surfaceY - 8); context.lineTo(screenX, surfaceY + 8); context.stroke();
    context.fillStyle = "#fff"; context.fillText(String(x), screenX - 4, surfaceY + 22);
  }
  context.restore();
}

function Loop(now) {
  const delta = Math.min(.04, (now - lastTime) / 1000);
  lastTime = now;
  Update(delta);
  Draw();
  requestAnimationFrame(Loop);
}

function BindHoldButton(button, input) {
  const down = (event) => { event.preventDefault(); if (IsBlocked()) return; button.setPointerCapture?.(event.pointerId); inputKeys[input] = true; button.classList.add("pressed"); };
  const up = (event) => { event.preventDefault(); inputKeys[input] = false; button.classList.remove("pressed"); if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId); };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("lostpointercapture", () => { inputKeys[input] = false; button.classList.remove("pressed"); });
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

document.querySelectorAll('[data-input="left"], [data-input="right"]').forEach((button) => BindHoldButton(button, button.dataset.input));
document.querySelector('[data-input="switch"]').addEventListener("click", CycleRole);
document.querySelector('[data-input="depth"]').addEventListener("click", UseContextDepth);
document.querySelector('[data-input="shoot"]').addEventListener("click", FireRifle);
document.querySelector('[data-input="grenade"]').addEventListener("click", ThrowGrenade);
document.querySelector('[data-input="action"]').addEventListener("click", PerformAction);
ui.civilianGroupButtons.querySelectorAll("[data-civilian-group]").forEach((button) => button.addEventListener("click", () => {
  state.selectedCivilianGroup = button.dataset.civilianGroup;
  RenderCivilianCommands();
}));
ui.civilianShelterButtons.querySelectorAll("[data-shelter]").forEach((button) => button.addEventListener("click", () => CommandCivilianGroup(button.dataset.shelter)));
ui.startButton.addEventListener("click", () => StartLevel(selectedLevel));
ui.guideButton.addEventListener("click", () => Show(ui.guidePanel));
ui.menuButton.addEventListener("click", OpenLevelPanel);
ui.dialogueNext.addEventListener("click", CloseDialogue);
ui.buildCancel.addEventListener("click", () => Show(ui.buildPanel, false));
ui.skipCinematic.addEventListener("click", EndCinematic);
ui.replayButton.addEventListener("click", () => StartLevel(state.levelIndex));
ui.nextLevelButton.addEventListener("click", () => StartLevel((state.levelIndex + 1) % levelDefinitions.length));
ui.completeLevelsButton.addEventListener("click", () => { Show(ui.levelComplete, false); OpenLevelPanel(); });
ui.failureReplayButton.addEventListener("click", () => StartLevel(state.levelIndex));
ui.failureQaButton.addEventListener("click", () => { Show(ui.missionFailure, false); QaJumpToPhase(state.levelIndex === 3 ? "engage" : "defense"); });
Show(ui.failureQaButton, qaMode);
document.querySelectorAll("[data-close-panel]").forEach((button) => button.addEventListener("click", () => Show(button.closest(".panelScreen"), false)));

window.addEventListener("keydown", (event) => {
  if (["KeyA", "ArrowLeft"].includes(event.code)) inputKeys.left = true;
  if (["KeyD", "ArrowRight"].includes(event.code)) inputKeys.right = true;
  if (event.repeat && ["KeyE", "KeyQ", "KeyW", "KeyS", "KeyF", "KeyG"].includes(event.code)) return;
  if (event.code === "KeyE") PerformAction();
  if (event.code === "KeyQ") CycleRole();
  if (event.code === "KeyF") FireRifle();
  if (event.code === "KeyG") ThrowGrenade();
  if (event.code === "KeyW") ChangeLayer("surface");
  if (event.code === "KeyS") ChangeLayer("tunnel");
  if (event.code === "Escape") {
    if (!ui.dialoguePanel.hidden) CloseDialogue();
    else if (!ui.buildPanel.hidden) Show(ui.buildPanel, false);
    else if (state.cinematic) EndCinematic();
    else OpenLevelPanel();
  }
});
window.addEventListener("keyup", (event) => {
  if (["KeyA", "ArrowLeft"].includes(event.code)) inputKeys.left = false;
  if (["KeyD", "ArrowRight"].includes(event.code)) inputKeys.right = false;
});
window.addEventListener("blur", () => Object.keys(inputKeys).forEach((key) => inputKeys[key] = false));
document.addEventListener("selectstart", (event) => { if (event.target.closest("#gameShell")) event.preventDefault(); });

if (qaMode) {
  window.EarthVeinsWhiteboxQa = Object.freeze({
    startLevel: (index) => StartLevel(Math.max(0, Math.min(levelDefinitions.length - 1, Number(index) || 0))),
    jumpToPhase: (phaseId) => QaJumpToPhase(String(phaseId)),
    inspectHazard: (kind) => QaInspectHazard(String(kind)),
    getState: () => ({
      level: state.level.id, phase: state.phaseId, x: state.player.x, layer: state.player.layer,
      role: state.selectedRole, completed: [...state.completed], resources: { ...state.resources }, buildSlots: [...state.buildSlots],
      rolePositions: Object.fromEntries(Object.entries(state.rolePositions || {}).map(([roleId, position]) => [roleId, { ...position }])),
      puzzle: JSON.parse(JSON.stringify(state.puzzle)),
      ventilation: state.defense.ventilation, defense: state.defense.strength, rescues: { ...state.rescues }, memories: [...state.memories],
      visibility: state.visibility, detection: state.detection, detected: state.detected, cover: state.player.coverId,
      alert: state.alert, morale: state.morale, tricks: [...state.tricks]
      , patrolLure: state.patrolLure ? { ...state.patrolLure } : null, dogBarkCooldown: state.dogBarkCooldown
      , prepRemaining: state.prepRemaining, raid: { ...state.raid }, excavated: [...state.excavated]
      , civilians: state.civilians.map((civilian) => ({ name: civilian.name, group: civilian.group, x: civilian.x, targetX: civilian.targetX, smokeDose: civilian.smokeDose, waterDose: civilian.waterDose }))
      , dog: state.dog ? { x: state.dog.x, layer: state.dog.layer, commandId: state.dog.commandId, commandMode: state.dog.commandMode, progress: state.dog.progress } : null
      , distraction: state.raid.distraction ? { ...state.raid.distraction } : null
      , takedownCount: state.takedownCount, neutralizedEnemies: [...state.neutralizedEnemies], unconsciousCount: state.unconsciousEnemies.length
      , combat: state.combat ? { rifle: state.combat.rifle, ammo: state.combat.ammo, grenades: state.combat.grenades, health: state.combat.health, alarm: state.combat.alarm, neutralized: state.combat.neutralized, shots: state.combat.shots.length, grenadesInFlight: state.combat.grenadesInFlight.length } : null
      , enemies: GetEnemyPatrols().map((enemy) => ({ id: enemy.id, x: enemy.x, facing: enemy.facing, unitType: enemy.unitType, investigating: enemy.investigating, lureKind: enemy.lureKind, routeMin: enemy.routeMin, routeMax: enemy.routeMax }))
      , fluid: state.fluid?.GetStatistics() || null, failure: state.missionFailure
    })
  });
}

RenderLevelSelectors();
RenderQaPanel();
requestAnimationFrame(Loop);
