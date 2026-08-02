import { actorProfiles, roleDefinitions, buildOptions, levelDefinitions, coverDefinitions } from "./Data_WhiteboxCampaign.mjs?v=20260803w";
import { CreateTunnelFluidSimulation } from "./Script_FluidSimulation.mjs?v=20260803w";
import { CreateSdfLightRenderer } from "./Script_LightSimulation.mjs?v=20260803w";

const canvas = document.querySelector("#gameCanvas");
const context = canvas.getContext("2d", { alpha: false });
const ui = Object.fromEntries([
  "gameShell", "titleScreen", "levelCards", "startButton", "guideButton", "levelPanel", "levelList", "guidePanel",
  "gameHeader", "levelNumber", "levelName", "phaseStrip", "menuButton", "objectiveCard", "phaseLabel", "objectiveText",
  "objectiveHint", "metricsPanel", "roleDock", "roleButtons", "interactionPrompt", "interactionVerb", "interactionName",
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
const startingLevel = Math.max(0, Math.min(2, Number(new URLSearchParams(location.search).get("level")) || 0));
const worldMin = -11;
const worldMax = 11;
const entrances = [-1.1, 8.6];
const requiredCollect = ["collectWood", "collectIron", "collectPowder", "collectSupplies"];
const requiredRescues = ["wounded", "grain", "courier"];
const inputKeys = { left: false, right: false };
const fluidCanvas = document.createElement("canvas");
const fluidContext = fluidCanvas.getContext("2d");
const lightRenderer = CreateSdfLightRenderer({ resolutionScale: .52, rayCount: 184 });
let selectedLevel = startingLevel;
let lastTime = performance.now();
let toastTimer = 0;
let state = CreateState(startingLevel);

function CreateCivilians() {
  return [
    { id: "elderYu", name: "于大娘", group: "elders", x: -1.1, targetX: -1.1, smokeDose: 0, waterDose: 0, pace: 1.05, mark: "老" },
    { id: "elderGao", name: "高叔", group: "elders", x: -.7, targetX: -.7, smokeDose: 0, waterDose: 0, pace: .96, mark: "老" },
    { id: "wounded", name: "伤员小周", group: "stretcher", x: .05, targetX: .05, smokeDose: 0, waterDose: 0, pace: .72, mark: "伤" },
    { id: "medic", name: "赵禾", group: "stretcher", x: .5, targetX: .5, smokeDose: 0, waterDose: 0, pace: .82, mark: "护" },
    { id: "childAn", name: "小安", group: "children", x: 1.1, targetX: 1.1, smokeDose: 0, waterDose: 0, pace: 1.35, mark: "童" },
    { id: "childShi", name: "石头", group: "children", x: 1.45, targetX: 1.45, smokeDose: 0, waterDose: 0, pace: 1.42, mark: "童" },
    { id: "mother", name: "石头娘", group: "children", x: 1.8, targetX: 1.8, smokeDose: 0, waterDose: 0, pace: 1.08, mark: "母" },
    { id: "signalman", name: "钟有田", group: "elders", x: -1.5, targetX: -1.5, smokeDose: 0, waterDose: 0, pace: 1.02, mark: "钟" }
  ];
}

function CreateState(levelIndex) {
  const level = levelDefinitions[levelIndex];
  return {
    mode: "title",
    levelIndex,
    level,
    phaseId: level.phases[0].id,
    player: { x: level.startX, layer: level.phases[0].layer, facing: 1, lowProfile: false, coverId: null, step: 0, moving: false, motionBlend: 0, actionKind: null, actionTime: 0, actionDuration: 0, rolePulse: 0, pickup: null },
    selectedRole: level.startRole,
    completed: new Set(),
    resources: { wood: 0, iron: 0, powder: 0, medicine: 0, grain: 0 },
    buildSlots: [null, null, null],
    excavated: new Set(),
    defense: { ventilation: 0, strength: 0, enemyUnits: 8, triggered: 0, activeSlots: new Set() },
    prepRemaining: levelIndex === 0 ? 92 : null,
    raid: { active: false, elapsed: 0, duration: 72, stage: "准备", announcedStage: null, smokeKnown: false, waterKnown: false, distraction: null, dogSmokeRelief: 0 },
    dog: { x: level.startX + .55, layer: level.phases[0].layer, facing: 1, step: 0, motionBlend: 0, actionKind: null, commandId: null, commandMode: "follow", targetX: level.startX + .55, targetLayer: level.phases[0].layer, workRemaining: 0, workDuration: 0, progress: 0, whistlePulse: 0, resultTime: 0, lastResult: "" },
    civilians: levelIndex === 0 ? CreateCivilians() : [],
    selectedCivilianGroup: "elders",
    missionFailure: null,
    cleanCapture: false,
    fluid: levelIndex === 0 ? CreateTunnelFluidSimulation({ columns: 152, rows: 58 }) : null,
    fluidAccumulator: 0,
    rescues: { wounded: false, grain: false, courier: false },
    memories: [],
    visibility: 0,
    detection: 0,
    detected: false,
    caught: null,
    lastSafeX: level.startX,
    alert: 18,
    morale: 100,
    tricks: new Set(),
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
      <i>${index === 0 ? "收集 → 建造 → 防御 → 缴获" : index === 1 ? "侦察 → 接力 → 转移 → 联通" : "异常 → 恐慌 → 情报"}</i>
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
  RenderRoleDock();
  RenderQaPanel();
  UpdateUi();
  const opener = state.levelIndex === 0
    ? ["第一轮 · 夜", "民兵队长", "天亮前得把木料和铁件带回来。别在空地停，等巡逻背过身，再从草垛和断墙后走。"]
    : state.levelIndex === 1
      ? ["封锁线外", "赵禾", "伤员走不了明路。咱们几个，一个接一个把门打开。"]
      : ["扫荡第三日", "林青禾", "别跟他们碰。弄出点动静就走，让他们自己乱起来。"];
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
  }
  state.player.rolePulse = 1;
  state.player.actionKind = "ready";
  state.player.actionTime = .62;
  state.player.actionDuration = .62;
  RenderRoleDock();
  UpdateUi();
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
    if (state.completed.has(action.id) && action.buildSlot === undefined) continue;
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
  if (!action) {
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
    if (state.defense.ventilation < 3) return Toast("通风不足 3：烟会先伤到地道里的乡亲。请重建一处机关。", "warning");
    if (state.defense.strength < 4) return Toast("防御不足 4：还无法安全分割八人扫荡队。", "warning");
    state.completed.add(action.id);
    BeginActorAction({ id: "closeSurfaceGate" });
    StartRaid(false);
    return;
  }
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
  if (action.resource) {
    for (const [key, amount] of Object.entries(action.resource)) state.resources[key] += amount;
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
  if (action.hazardScout === "smoke") state.raid.smokeKnown = true;
  if (action.hazardScout === "water") state.raid.waterKnown = true;
  if (action.dogRelief === "smoke") state.raid.dogSmokeRelief = Math.max(state.raid.dogSmokeRelief, 16);
  state.dog.commandId = null;
  state.dog.commandMode = "follow";
  state.dog.actionKind = null;
  state.dog.progress = 1;
  state.dog.resultTime = 3.2;
  state.dog.lastResult = action.dogCommand.task;
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

function EvaluateProgress(action) {
  if (state.levelIndex === 0) {
    if (state.phaseId === "collect" && requiredCollect.every((id) => state.completed.has(id))) {
      SetPhase("build", "第一轮 · 天明", "东西齐了。先把风道通开，再安闸。人在下头，得先喘得上气。", "队长");
    }
  } else if (state.levelIndex === 1) {
    if (state.phaseId === "survey" && state.completed.has("markPatrol")) {
      SetPhase("cooperate", "十一秒暗区", "灯转一圈是十一下。赵禾，你先补网；根生跟我抬门。", "叶星");
    } else if (state.phaseId === "cooperate" && state.completed.has("unbarGate")) {
      SetPhase("transfer", "门开了", "先抬伤员。粮袋能带多少带多少。", "赵禾");
    } else if (state.phaseId === "transfer" && requiredRescues.every((key) => state.rescues[key])) {
      SetPhase("outcome", "东翻口已接通", "伤员、粮、人……都齐了。石头，关门。", "赵禾");
    }
  } else if (state.levelIndex === 2) {
    if (state.phaseId === "harass" && state.tricks.size >= 3 && state.morale <= 55) {
      SetPhase("panic", "他们乱了", "他们不敢进屋了。再引一次，往空坡赶。", "林青禾");
    } else if (state.phaseId === "panic" && action.id === "finalSignal") {
      SetPhase("outcome", "扫荡队撤了", "别追。等他们走远，咱们再出去捡电台。", "林青禾");
    }
  }
  if (action.outcome) state.pendingComplete = true;
}

function SetPhase(phaseId, label, text, speaker) {
  state.phaseId = phaseId;
  const phase = CurrentPhase();
  if (phase.layer && phase.id !== "transfer") state.player.layer = phase.layer;
  state.camera.targetX = state.player.x;
  PlayCinematic(label, speaker, text, 2.4, state.player.x + 1.5, 1.1);
  UpdateUi();
}

function OpenBuildPanel(slotIndex) {
  state.currentBuildSlot = slotIndex;
  const existing = state.buildSlots[slotIndex];
  ui.buildBrief.textContent = `机关位 ${slotIndex + 1} · ${existing ? `当前为${buildOptions.find((item) => item.id === existing).name}，重建会退回原料` : "尚未施工"}`;
  ui.buildFeedback.textContent = "目标：三处合计通风 ≥ 3、防御 ≥ 4。不同位置允许使用同一种结构。";
  ui.buildOptions.innerHTML = buildOptions.map((option) => {
    const isCurrent = option.id === existing;
    return `<button type="button" data-build="${option.id}" class="buildOption ${isCurrent ? "current" : ""}">
      <span><b>${option.name}</b><i>${isCurrent ? "当前结构" : "选择此结构"}</i></span>
      <p>${option.note}</p>
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
  Toast(`${option.name}完工 · 通风 ${state.defense.ventilation} / 防御 ${state.defense.strength}`, state.defense.ventilation >= 3 && state.defense.strength >= 4 ? "success" : "neutral");
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
    const hasEastBaffle = state.buildSlots[2] === "smokeBaffle" || state.buildSlots.includes("smokeBaffle");
    const hasWestFloodGate = state.buildSlots[0] === "floodGate" || state.buildSlots.includes("floodGate");
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
    civilian.targetX = shelter.x + (index - (members.length - 1) / 2) * .38 + group.offset;
  });
  Toast(`${group.label}转移到${shelter.label}。他们会真实穿过地道，不会瞬移。`, "success");
  RenderCivilianCommands();
}

function RenderCivilianCommands() {
  if (!ui.civilianCommandPanel || state.levelIndex !== 0) return;
  const visible = state.phaseId === "defense" && state.mode === "play";
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
  const visible = state.levelIndex === 0 && state.mode === "play";
  Show(ui.dogCommandHud, visible);
  if (!visible) return;
  const action = state.dog.commandId ? state.level.actions.find((item) => item.id === state.dog.commandId) : null;
  let status = "跟随传宝，等待哨令";
  if (state.selectedRole === "dog") status = "玩家正在直接控制阿土";
  else if (action && state.dog.commandMode === "travel") status = `奔向${action.dogCommand.label}`;
  else if (action) status = `正在${action.dogCommand.task}`;
  else if (state.dog.resultTime > 0) status = `已完成：${state.dog.lastResult}`;
  ui.dogCommandStatus.textContent = status;
  ui.dogCommandHud.classList.toggle("commanding", Boolean(action));
  const progressFill = ui.dogCommandProgress?.querySelector("u");
  if (progressFill) progressFill.style.width = `${Math.round(Math.max(0, Math.min(1, state.dog.progress)) * 100)}%`;
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
  if (state.player.layer === "tunnel") state.alert = Math.max(0, state.alert - 8);
  Toast(state.player.layer === "tunnel" ? "进入地道：敌兵视线被土层完全隔断。" : "回到地表：先找草垛、断墙或灌木，再等巡逻转身。", "neutral");
  UpdateUi();
}

function UseContextDepth() {
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
  const title = ["村庄开始像一张会呼吸的网", "没有一个名字被留在封锁线内", "敌人的地图变成下一轮准备时间"][state.levelIndex];
  ui.completeTitle.textContent = `${state.level.title} · 循环闭合`;
  ui.completeSummary.textContent = title;
  const ledgers = state.levelIndex === 0
    ? [["通风", state.defense.ventilation], ["阿土哨令", ["whistleDraftGap", "whistleSmokeLatch"].filter((id) => state.completed.has(id)).length + "/2"], ["地表调敌", ["ringAlarmBell", "throwFirecrackers"].filter((id) => state.completed.has(id)).length + "/2"], ["已触发机关", `${state.defense.triggered}/3`], ["最高烟剂量", `${Math.round(Math.max(0, ...state.civilians.map((civilian) => civilian.smokeDose)))}%`], ["最高水剂量", `${Math.round(Math.max(0, ...state.civilians.map((civilian) => civilian.waterDose)))}%`]]
    : state.levelIndex === 1
      ? [["转移", "伤员 / 粮食 / 联络员"], ["记忆", state.memories.length ? state.memories.join("、") : "未停留搜寻"], ["原则", "遗物可选，生命优先"], ["新节点", "东翻口"]]
      : [["使用诡计", `${state.tricks.size} 种`], ["敌方士气", state.morale], ["群众伤亡", 0], ["下次扫荡", state.nextRaid || "待译码"]];
  ui.completeLedger.innerHTML = ledgers.map(([key, value]) => `<div><small>${key}</small><b>${value}</b></div>`).join("");
  ui.nextLevelButton.textContent = state.levelIndex < 2 ? "进入下一关" : "回到第一关";
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
  return state.mode !== "play" || state.cinematic || state.caught || !ui.dialoguePanel.hidden || !ui.buildPanel.hidden || !ui.levelPanel.hidden || !ui.guidePanel.hidden;
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
  ui.phaseLabel.textContent = phase.label;
  ui.objectiveText.textContent = phase.objective;
  ui.objectiveHint.textContent = ContextHint();
  ui.phaseStrip.innerHTML = state.level.phases.map((item, index) => `<span class="${item.id === state.phaseId ? "active" : index < PhaseIndex() ? "done" : ""}"><i>${index + 1}</i>${item.label}</span>`).join("");
  ui.metricsPanel.innerHTML = MetricsMarkup();
  const action = FindNearestAction();
  Show(ui.interactionPrompt, Boolean(action) && !IsBlocked());
  if (action) {
    ui.interactionVerb.textContent = action.verb;
    ui.interactionName.textContent = action.prop?.label || action.title;
  }
  ui.gameShell.dataset.layer = state.player.layer;
  ui.gameShell.dataset.level = state.level.id;
  ui.touchControls.classList.toggle("locked", Boolean(state.caught));
  const depthButton = document.querySelector('[data-input="depth"] span');
  if (depthButton) depthButton.textContent = state.player.layer === "surface" ? "↓ 下行" : "↑ 上行";
  RenderCivilianCommands();
  RenderDogCommandHud();
  UpdateQaReadout();
}

function RenderQaPanel() {
  if (!qaMode) return;
  Show(ui.qaPanel);
  ui.qaLevelButtons.innerHTML = levelDefinitions.map((level, index) => `<button type="button" data-qa-level="${index}" class="${index === state.levelIndex ? "active" : ""}">${level.number} ${level.title}</button>`).join("");
  ui.qaPhaseButtons.innerHTML = state.level.phases.map((phase) => `<button type="button" data-qa-phase="${phase.id}" class="${phase.id === state.phaseId ? "active" : ""}">${phase.label}</button>`).join("");
  ui.qaHazardButtons.innerHTML = state.levelIndex === 0 ? '<button type="button" data-qa-hazard="dog">解谜：阿土拉烟闸</button><button type="button" data-qa-hazard="bell">地表：敲警钟</button><button type="button" data-qa-hazard="crackers">地表：扔炮仗</button><button type="button" data-qa-hazard="enemies">镜头：日伪军巡逻</button><button type="button" data-qa-hazard="smoke">镜头：东口烟流</button><button type="button" data-qa-hazard="water">镜头：西井水流</button><button type="button" data-qa-hazard="safe">系统：三闸触发</button><button type="button" data-qa-hazard="clean">截图：隐藏调试</button>' : "";
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
  ui.qaStateReadout.textContent = `${state.level.id} / ${state.phaseId} · x ${state.player.x.toFixed(1)} · ${state.player.layer} · ${roleDefinitions[state.selectedRole].short} · 犬${state.dog?.commandMode || "—"}${fluid ? ` · 烟${Math.round(fluid.smokeMass)} 水${Math.round(fluid.waterMass)}` : ""}`;
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
      QaComplete(["whistleDraftGap", "briefCivilians", "digWestRefuge", "digCenterBypass", "digEastPocket", "buildSlotA", "buildSlotB", "buildSlotC", "startDefense"]);
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
    if (phaseIndex >= 1) { QaComplete(["sniffRoute", "markPatrol"]); state.selectedRole = "rescuer"; state.player.x = -3.4; }
    if (phaseIndex >= 2) { QaComplete(["repairCamo", "liftHatch", "crawlGap", "unbarGate"]); state.selectedRole = "rescuer"; state.player.x = 5.2; }
    if (phaseIndex >= 3) {
      QaComplete(["moveWounded", "moveGrain", "freeCourier"]);
      Object.assign(state.rescues, { wounded: true, grain: true, courier: true });
      state.selectedRole = "child"; state.player.x = 10;
    }
  } else {
    if (phaseIndex >= 1) {
      QaComplete(["placeHelmet", "fireCracker", "routeHorn"]);
      state.tricks = new Set(["placeHelmet", "fireCracker", "routeHorn"]);
      state.alert = 59; state.morale = 52; state.player.x = -5.8;
    }
    if (phaseIndex >= 2) {
      QaComplete(["misdirectSquad", "closeFalseGate", "finalSignal"]);
      state.morale = 6; state.player.x = 8.8;
    }
  }
  const phase = CurrentPhase();
  state.player.layer = phase.layer;
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
  const action = FindNearestAction();
  if (state.dog?.commandId) {
    const dogAction = state.level.actions.find((item) => item.id === state.dog.commandId);
    return `阿土：${state.dog.commandMode === "travel" ? `正去${dogAction?.dogCommand?.label}` : dogAction?.dogCommand?.task}`;
  }
  if (action?.role && action.role !== state.selectedRole) return `需要：${roleDefinitions[action.role].name}`;
  if (action?.cover && GetActiveCover()?.id !== action.cover) {
    const cover = GetSurfaceCovers().find((item) => item.id === action.cover);
    return `先藏到${cover?.label || "场景遮挡"}后`;
  }
  if (state.levelIndex === 0 && ["collect", "build"].includes(state.phaseId)) return `距扫荡 ${Math.ceil(state.prepRemaining)} 秒 · 通风 ${state.defense.ventilation}/3 · 防御 ${state.defense.strength}/4`;
  if (state.levelIndex === 0 && state.phaseId === "defense") {
    const distraction = state.raid.distraction ? ` · ${state.raid.distraction.label} ${Math.ceil(state.raid.distraction.remaining)}秒` : "";
    return `${state.raid.stage}${distraction} · 地表调敌，地下封闸`;
  }
  if (state.levelIndex === 2 && state.phaseId === "harass") return `至少 3 种诡计且士气 ≤ 55；已用 ${state.tricks.size} 种`;
  return `${roleDefinitions[state.selectedRole].name} · ${state.player.layer === "surface" ? "地表" : "地道"}`;
}

function Metric(label, value, detail = "", meter = null, inverse = false, icon = "·") {
  const fill = meter === null ? "" : `<i class="metricBar"><u style="width:${Math.max(0, Math.min(100, meter))}%" class="${inverse ? "inverse" : ""}"></u></i>`;
  return `<div class="metric" title="${detail}"><em class="metricIcon">${icon}</em><span class="metricCopy"><small>${label}</small><b>${value}</b></span>${fill}</div>`;
}

function MetricsMarkup() {
  if (state.levelIndex === 0) {
    const resources = Metric("材料", `木${state.resources.wood} 铁${state.resources.iron}`, `硝灰 ${state.resources.powder} / 药 ${state.resources.medicine} / 粮 ${state.resources.grain}`, null, false, "材");
    const timer = Metric("扫荡倒计时", `${Math.max(0, Math.ceil(state.prepRemaining))}秒`, "归零后敌军自动入村，未完工机关不会补齐", state.prepRemaining / 92 * 100, false, "时");
    if (state.phaseId === "collect") {
      const carried = state.level.actions.filter((action) => action.phase === "collect" && action.prop?.mode === "take" && state.completed.has(action.id)).map((action) => action.prop.label);
      return [timer, resources, Metric("已携带", `${carried.length}/4`, carried.join(" · ") || "靠近场景中的实物后拿取", carried.length / 4 * 100, false, "包")].join("");
    }
    if (state.phaseId === "build") return [timer, resources, Metric("通风", state.defense.ventilation, "安全线 ≥ 3", state.defense.ventilation / 5 * 100, false, "风"), Metric("防御", state.defense.strength, "安全线 ≥ 4", state.defense.strength / 6 * 100, false, "守")].join("");
    const highestSmoke = Math.max(0, ...state.civilians.map((civilian) => civilian.smokeDose));
    const highestWater = Math.max(0, ...state.civilians.map((civilian) => civilian.waterDose));
    const enemyMovement = state.raid.distraction ? `${state.raid.distraction.label} ${Math.ceil(state.raid.distraction.remaining)}秒` : "分散搜查";
    return [Metric("扫荡", `${Math.ceil(state.raid.elapsed)}/${state.raid.duration}秒`, state.raid.stage, state.raid.elapsed / state.raid.duration * 100, false, "袭"), Metric("敌兵动向", enemyMovement, "警钟削弱东口灌烟；炮仗削弱西井灌水", state.raid.distraction ? state.raid.distraction.remaining / state.raid.distraction.duration * 100 : 0, false, "声"), Metric("烟剂量", `${Math.round(highestSmoke)}%`, "任一乡亲达到 100% 即失败", highestSmoke, true, "烟"), Metric("水剂量", `${Math.round(highestWater)}%`, "任一乡亲达到 100% 即失败", highestWater, true, "水")].join("");
  }
  if (state.levelIndex === 1) return [
    Metric("转移", requiredRescues.filter((key) => state.rescues[key]).length + "/3", "伤员 · 粮食 · 联络员", requiredRescues.filter((key) => state.rescues[key]).length / 3 * 100, false, "转"),
    Metric("记忆", `${state.memories.length}/2`, state.memories.join(" · ") || "可选，不阻塞转移", null, false, "忆")
  ].join("");
  return [
    Metric("敌军警觉", Math.round(state.alert), "只由诡计和被发现改变", state.alert, true, "警"),
    Metric("士气", Math.round(state.morale), state.morale <= 55 ? "已到恐慌断点" : "继续制造矛盾信息", state.morale, false, "志"),
    Metric("诡计", `${state.tricks.size}/3`, "三种不同异常可触发恐慌", state.tricks.size / 3 * 100, false, "计")
  ].join("");
}

function Update(delta) {
  state.elapsed += delta;
  UpdateDogPartner(delta);
  state.player.rolePulse = Math.max(0, state.player.rolePulse - delta * .65);
  if (state.player.actionTime > 0) {
    state.player.actionTime = Math.max(0, state.player.actionTime - delta);
    if (state.player.actionTime === 0) state.player.actionKind = null;
  }
  if (state.player.pickup) {
    state.player.pickup.time = Math.max(0, state.player.pickup.time - delta);
    if (state.player.pickup.time === 0) state.player.pickup = null;
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
  const direction = Number(inputKeys.right) - Number(inputKeys.left);
  state.player.moving = Boolean(direction);
  state.player.motionBlend = Lerp(state.player.motionBlend, direction ? 1 : 0, 1 - Math.pow(.0008, delta));
  if (direction) {
    state.player.facing = direction;
    state.player.x = Math.max(worldMin, Math.min(worldMax, state.player.x + direction * delta * (state.player.lowProfile ? 2.45 : 3.55)));
    state.player.step += delta * (state.player.lowProfile ? 6.4 : 9);
  } else {
    state.player.step += delta * .72;
  }
  UpdateCoverState();
  const targetX = Math.max(worldMin + 4, Math.min(worldMax - 4, state.player.x + state.player.facing * .7));
  state.camera.x = Lerp(state.camera.x, targetX, 1 - Math.pow(.002, delta));
  state.camera.zoom = Lerp(state.camera.zoom, 1, 1 - Math.pow(.01, delta));
  UpdateDanger();
  UpdateUi();
}

function UpdateDanger() {
  state.detection = state.player.layer === "surface" ? GetDetectionStrength(state.player.x) : 0;
  const cover = GetActiveCover();
  state.visibility = state.player.layer === "tunnel" ? 0 : cover ? 0 : state.detection > 0 ? 100 : 46;
  if (state.detection > 0 && !state.detected) TriggerDetection();
}

function TriggerDetection() {
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

function GetEnemyPatrols() {
  let bases = [];
  if (state.levelIndex === 0 && state.phaseId === "collect") bases = [-6.1, 2.2, 7.2];
  else if (state.levelIndex === 0 && state.phaseId === "defense") {
    const count = Math.max(2, Math.min(5, Math.ceil(state.defense.enemyUnits / 2)));
    bases = [-8.8, -4.5, .8, 5.2, 8.7].slice(0, count);
  }
  else if (state.levelIndex === 1 && state.player.layer === "surface") bases = [2.4, 5.6, 8.8];
  else if (state.levelIndex === 2) bases = [-2.2, 2.1, 6.2, 9.2].slice(0, Math.max(2, Math.ceil(state.morale / 25)));
  const diversion = state.levelIndex === 0 && state.phaseId === "defense" && ActiveDiversion() ? state.raid.distraction : null;
  return bases.map((base, index) => {
    const time = state.elapsed * (.42 + index * .035) + index * 1.7;
    const travel = Math.sin(time) * (index % 2 ? 1.05 : 1.25);
    let x = base + travel;
    let facing = Math.cos(time) >= 0 ? 1 : -1;
    if (diversion) {
      const formationX = diversion.targetX + (index - (bases.length - 1) / 2) * .42;
      const pull = Math.min(.92, .22 + diversion.age * .27);
      x = Lerp(x, formationX, pull);
      facing = Math.sign(formationX - x) || facing;
    }
    const unitType = index % 3 === 1 ? "collaborator" : "soldier";
    const rank = index === 0 && state.phaseId === "defense" ? "sectionLeader" : "rifleman";
    return { x, facing, viewDistance: state.levelIndex === 2 ? 4.4 : diversion ? 3.25 : 3.8, index, unitType, rank, investigating: Boolean(diversion) };
  });
}

function GetSurfaceCovers() {
  return coverDefinitions[state.level.id] || [];
}

function GetActiveCover(worldX = state.player.x) {
  if (state.player.layer !== "surface") return null;
  return GetSurfaceCovers().find((cover) => Math.abs(worldX - cover.x) <= cover.width * .5) || null;
}

function UpdateCoverState() {
  const cover = GetActiveCover();
  state.player.coverId = cover?.id || null;
  state.player.lowProfile = Boolean(cover && cover.pose === "low");
  if (cover && !state.detected) state.lastSafeX = cover.x;
}

function EnemyDetection(enemy, playerX = state.player.x) {
  if (state.player.layer !== "surface") return 0;
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

function Draw() {
  const { width, height } = ResizeCanvas();
  const surfaceY = height * .48;
  const tunnelY = height * .76;
  const daylight = state.levelIndex === 0 && state.phaseId === "collect" ? 0 : state.levelIndex === 2 ? .2 : .55;
  DrawSky(width, height, surfaceY, daylight);
  DrawVillage(width, height, surfaceY);
  DrawSurfaceDepthVeil(width, height, surfaceY, daylight);
  DrawRaidDestruction(width, height, surfaceY);
  DrawSurfaceCovers(width, surfaceY, false);
  DrawEarth(width, height, surfaceY, tunnelY);
  DrawEntrances(width, height, surfaceY, tunnelY);
  DrawTunnelSystems(width, height, surfaceY, tunnelY);
  DrawFluidSimulation(width, height, tunnelY);
  DrawDogCommandEnvironment(width, height, surfaceY, tunnelY);
  DrawActionProps(width, height, surfaceY, tunnelY, false);
  DrawActions(width, height, surfaceY, tunnelY);
  DrawEnemies(width, surfaceY);
  DrawCivilians(width, height, tunnelY);
  DrawDogCompanion(width, height, surfaceY, tunnelY);
  DrawActor(width, height, surfaceY, tunnelY);
  DrawSurfaceCovers(width, surfaceY, true);
  DrawActionProps(width, height, surfaceY, tunnelY, true);
  DrawPickupTransfer(width, height, surfaceY, tunnelY);
  DrawSurfaceVegetation(width, height, surfaceY);
  DrawLighting(width, height, surfaceY, tunnelY, daylight);
  DrawSurfaceDiversions(width, height, surfaceY);
  DrawForegroundDepthFrame(width, height, surfaceY, tunnelY, daylight);
  DrawDogCommandFocus(width, height, surfaceY, tunnelY);
  DrawActorVisibilityHud(width, surfaceY);
  DrawDetectionFlash(width, height, surfaceY);
  DrawDepthHint(width, height, surfaceY, tunnelY);
  if (qaMode && !state.cleanCapture) DrawQa(width, height, surfaceY, tunnelY);
}

function SceneHash(seed) {
  return Math.abs(Math.sin(seed * 91.733 + 17.19) * 43758.5453) % 1;
}

function DrawMountainLayer(width, surfaceY, layer) {
  const offset = state.camera.x * width * layer.parallax * .018;
  context.beginPath(); context.moveTo(-80, surfaceY + 2);
  for (let x = -80; x <= width + 100; x += layer.step) {
    const broad = Math.sin((x + offset) * layer.frequency + layer.seed) * layer.amplitude;
    const ridge = Math.sin((x + offset) * layer.frequency * 2.37 + layer.seed * 1.9) * layer.amplitude * .34;
    const peak = Math.abs(Math.sin((x + offset) * layer.frequency * .61 + layer.seed * 2.4)) * layer.amplitude * .56;
    context.lineTo(x, layer.baseY + broad + ridge - peak);
  }
  context.lineTo(width + 100, surfaceY + 2); context.closePath();
  context.fillStyle = layer.color; context.fill();
  context.strokeStyle = layer.rim; context.lineWidth = layer.lineWidth; context.stroke();
}

function DrawSky(width, height, surfaceY, daylight) {
  const isDay = daylight > .4;
  const gradient = context.createLinearGradient(0, 0, 0, surfaceY);
  gradient.addColorStop(0, isDay ? "#7f9696" : "#101c27");
  gradient.addColorStop(.52, isDay ? "#a9aaa0" : "#28313a");
  gradient.addColorStop(1, isDay ? "#d2bd94" : "#594640");
  context.fillStyle = gradient; context.fillRect(0, 0, width, height);

  const celestialX = LayerToScreen(7.6, width, .035);
  const celestialY = surfaceY * .19;
  const celestialGlow = context.createRadialGradient(celestialX, celestialY, 2, celestialX, celestialY, isDay ? 72 : 58);
  celestialGlow.addColorStop(0, isDay ? "rgba(255,228,157,.72)" : "rgba(217,229,222,.38)");
  celestialGlow.addColorStop(1, "rgba(255,236,185,0)");
  context.fillStyle = celestialGlow; context.beginPath(); context.arc(celestialX, celestialY, isDay ? 72 : 58, 0, Math.PI * 2); context.fill();
  context.fillStyle = isDay ? "rgba(238,208,137,.58)" : "rgba(210,222,216,.32)"; context.beginPath(); context.arc(celestialX, celestialY, isDay ? 29 : 22, 0, Math.PI * 2); context.fill();

  if (!isDay) {
    for (let star = 0; star < 34; star += 1) {
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
    { parallax: .035, baseY: surfaceY * .53, amplitude: 23, step: 58, frequency: .008, seed: .7, color: isDay ? "#6e7c78" : "#26343a", rim: "rgba(229,224,197,.06)", lineWidth: 1 },
    { parallax: .075, baseY: surfaceY * .61, amplitude: 32, step: 52, frequency: .0092, seed: 2.1, color: isDay ? "#596d68" : "#2d393b", rim: "rgba(225,210,177,.07)", lineWidth: 1.2 },
    { parallax: .145, baseY: surfaceY * .69, amplitude: 42, step: 44, frequency: .0105, seed: 4.4, color: isDay ? "#4a5c54" : "#34403e", rim: "rgba(220,198,157,.08)", lineWidth: 1.5 },
    { parallax: .245, baseY: surfaceY * .78, amplitude: 34, step: 38, frequency: .013, seed: 6.6, color: isDay ? "#3e4d42" : "#343c37", rim: "rgba(226,190,135,.1)", lineWidth: 1.7 }
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
  const horizonY = surfaceY - 57;
  const vanishX = width * .52 - state.camera.x * width * .006;
  const fieldGradient = context.createLinearGradient(0, horizonY, 0, surfaceY + 4);
  fieldGradient.addColorStop(0, "#5a5941"); fieldGradient.addColorStop(1, "#4b4130");
  context.fillStyle = fieldGradient; context.fillRect(0, horizonY, width, surfaceY - horizonY + 6);
  for (let lane = -9; lane <= 9; lane += 1) {
    const nearX = width * .5 + lane * width * .09;
    context.strokeStyle = lane % 2 ? "rgba(209,172,93,.22)" : "rgba(48,43,31,.42)";
    context.lineWidth = Math.abs(lane) % 3 === 0 ? 4 : 2;
    context.beginPath(); context.moveTo(vanishX + lane * 6, horizonY + 3); context.lineTo(nearX, surfaceY + 5); context.stroke();
  }
  for (let row = 0; row < 5; row += 1) {
    const progress = (row + 1) / 6;
    const y = Lerp(horizonY, surfaceY, progress * progress);
    context.strokeStyle = `rgba(223,189,119,${.08 + progress * .12})`; context.lineWidth = 1 + progress * 1.5;
    context.beginPath(); context.moveTo(0, y); context.quadraticCurveTo(vanishX, y - 8 * (1 - progress), width, y + 2); context.stroke();
  }
  context.fillStyle = "rgba(61,52,38,.72)";
  context.beginPath(); context.moveTo(vanishX - 17, horizonY); context.lineTo(vanishX + 23, horizonY); context.lineTo(width * .72, surfaceY + 6); context.lineTo(width * .51, surfaceY + 6); context.closePath(); context.fill();
  context.strokeStyle = "rgba(203,164,99,.28)"; context.lineWidth = 3;
  context.beginPath(); context.moveTo(vanishX - 5, horizonY); context.lineTo(width * .57, surfaceY + 6); context.moveTo(vanishX + 12, horizonY); context.lineTo(width * .67, surfaceY + 6); context.stroke();
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
  const fenceWidth = span * width / 22 * depthScale;
  const fenceHeight = (22 + variant % 3 * 5) * depthScale;
  context.save(); context.globalAlpha = alpha;
  context.fillStyle = "rgba(18,18,15,.2)"; context.beginPath(); context.ellipse(x, baseY + 3, fenceWidth * .52, 5 * depthScale, 0, 0, Math.PI * 2); context.fill();
  if (variant % 3 === 0) {
    const postCount = Math.max(4, Math.round(span * 2.2));
    context.strokeStyle = "#564631"; context.lineCap = "round";
    for (let post = 0; post < postCount; post += 1) {
      const progress = post / Math.max(1, postCount - 1);
      const postX = x - fenceWidth / 2 + progress * fenceWidth;
      const lean = (SceneHash(worldX * 7 + post) - .5) * 6;
      const postHeight = fenceHeight * (.75 + SceneHash(worldX + post * 3) * .34);
      context.lineWidth = 3.8 * depthScale; context.beginPath(); context.moveTo(postX, baseY + 3); context.lineTo(postX + lean, baseY - postHeight); context.stroke();
      context.fillStyle = "#776046"; context.beginPath(); context.moveTo(postX + lean - 2, baseY - postHeight + 2); context.lineTo(postX + lean, baseY - postHeight - 5); context.lineTo(postX + lean + 2, baseY - postHeight + 2); context.closePath(); context.fill();
    }
    for (let rail = 0; rail < 4; rail += 1) {
      context.strokeStyle = rail % 2 ? "#735b3c" : "#655039"; context.lineWidth = 2.5 * depthScale; context.beginPath();
      for (let sample = 0; sample <= 12; sample += 1) {
        const progress = sample / 12; const railX = x - fenceWidth / 2 + progress * fenceWidth; const railY = baseY - fenceHeight * (.18 + rail * .17) + Math.sin(progress * Math.PI * 6 + rail) * 2.2;
        sample ? context.lineTo(railX, railY) : context.moveTo(railX, railY);
      }
      context.stroke();
    }
  } else if (variant % 3 === 1) {
    const stoneRows = 3;
    for (let row = 0; row < stoneRows; row += 1) {
      const stones = 5 + row;
      const stoneWidth = fenceWidth / stones;
      for (let stone = 0; stone < stones; stone += 1) {
        const stagger = row % 2 ? stoneWidth * .34 : 0;
        const stoneX = x - fenceWidth / 2 + stone * stoneWidth + stagger;
        const stoneY = baseY - row * fenceHeight / stoneRows;
        context.fillStyle = row % 2 ? "#655c4f" : "#716556";
        context.beginPath(); context.moveTo(stoneX - 1, stoneY); context.lineTo(stoneX + stoneWidth * .78, stoneY - 1); context.lineTo(stoneX + stoneWidth * .72, stoneY - fenceHeight / stoneRows + 2); context.lineTo(stoneX + 3, stoneY - fenceHeight / stoneRows); context.closePath(); context.fill();
        context.strokeStyle = "rgba(191,169,129,.2)"; context.lineWidth = 1; context.stroke();
      }
    }
    context.strokeStyle = "#534b41"; context.lineWidth = 3 * depthScale; context.beginPath(); context.moveTo(x - fenceWidth * .52, baseY - fenceHeight); context.lineTo(x + fenceWidth * .52, baseY - fenceHeight + 2); context.stroke();
  } else {
    const posts = [-.5, -.16, .18, .5];
    context.strokeStyle = "#5b432e"; context.lineCap = "square";
    posts.forEach((progress, index) => { const postX = x + progress * fenceWidth; context.lineWidth = (index === 0 || index === posts.length - 1 ? 6 : 4) * depthScale; context.beginPath(); context.moveTo(postX, baseY + 2); context.lineTo(postX + (index % 2 ? 2 : -2), baseY - fenceHeight); context.stroke(); });
    context.strokeStyle = "#765838"; context.lineWidth = 5 * depthScale;
    [0.25, .7].forEach((heightProgress) => { context.beginPath(); context.moveTo(x - fenceWidth * .52, baseY - fenceHeight * heightProgress); context.lineTo(x + fenceWidth * .52, baseY - fenceHeight * heightProgress - 3); context.stroke(); });
    context.strokeStyle = "#b18a57"; context.lineWidth = 1.5; posts.slice(1, 3).forEach((progress) => { const postX = x + progress * fenceWidth; context.beginPath(); context.arc(postX, baseY - fenceHeight * .69, 4 * depthScale, 0, Math.PI * 2); context.stroke(); });
  }
  context.restore();
}

function DrawVillageWorkProp(worldX, width, baseY, parallax, kind, variant = 0) {
  const x = LayerToScreen(worldX, width, parallax);
  const scale = .62 + parallax * .52;
  context.save(); context.translate(x, baseY); context.scale(scale, scale);
  context.fillStyle = "rgba(10,11,10,.25)"; context.beginPath(); context.ellipse(0, 4, kind === "dryingRack" ? 42 : 29, 6, 0, 0, Math.PI * 2); context.fill();
  if (kind === "wheelbarrow") {
    context.fillStyle = "#665039"; context.beginPath(); context.moveTo(-25, -25); context.lineTo(18, -22); context.lineTo(12, -3); context.lineTo(-17, -5); context.closePath(); context.fill();
    context.fillStyle = "#806345"; context.beginPath(); context.moveTo(-25, -25); context.lineTo(18, -22); context.lineTo(25, -28); context.lineTo(-16, -32); context.closePath(); context.fill();
    context.strokeStyle = "#a27a4c"; context.lineWidth = 3; context.stroke(); context.beginPath(); context.moveTo(-16, -5); context.lineTo(-29, 5); context.moveTo(12, -3); context.lineTo(31, 4); context.stroke();
    context.strokeStyle = "#302922"; context.lineWidth = 5; context.beginPath(); context.arc(-20, 1, 10, 0, Math.PI * 2); context.stroke(); context.fillStyle = "#7d633e"; context.beginPath(); context.arc(-20, 1, 3, 0, Math.PI * 2); context.fill();
  } else if (kind === "firewood") {
    for (let log = 0; log < 10; log += 1) {
      const row = Math.floor(log / 4); const column = log % 4; const logX = (column - 1.5) * 12 + (row % 2) * 5; const logY = -5 - row * 9;
      context.fillStyle = log % 2 ? "#7a5737" : "#8b6540"; context.fillRect(logX - 9, logY - 6, 22, 7); context.fillStyle = "#b78d58"; context.beginPath(); context.arc(logX + 12, logY - 2.5, 3.5, 0, Math.PI * 2); context.fill();
    }
    context.strokeStyle = "#4b392a"; context.lineWidth = 3; context.beginPath(); context.moveTo(-24, 0); context.lineTo(-18, -30); context.moveTo(25, 0); context.lineTo(18, -30); context.stroke();
    context.strokeStyle = "#9d784c"; context.lineWidth = 2; context.beginPath(); context.moveTo(-18, -15); context.lineTo(21, -11); context.stroke();
  } else if (kind === "dryingRack") {
    context.strokeStyle = "#725136"; context.lineWidth = 6; context.beginPath(); context.moveTo(-34, 2); context.lineTo(-28, -58); context.moveTo(34, 2); context.lineTo(28, -58); context.moveTo(-37, -54); context.lineTo(38, -54); context.stroke();
    context.strokeStyle = "#b98d50"; context.lineWidth = 2; context.beginPath(); context.moveTo(-28, -49); context.quadraticCurveTo(0, -43, 28, -49); context.stroke();
    for (let bundle = 0; bundle < 6; bundle += 1) {
      const bundleX = -23 + bundle * 9; const bundleY = -44 + Math.sin(bundle) * 3;
      context.fillStyle = variant % 2 ? "#a56544" : "#a88745"; context.beginPath(); context.ellipse(bundleX, bundleY + 10, 4, 11, bundle % 2 ? .14 : -.12, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#5f7049"; context.lineWidth = 1.5; context.beginPath(); context.moveTo(bundleX, bundleY); context.lineTo(bundleX - 5, bundleY - 7); context.moveTo(bundleX, bundleY); context.lineTo(bundleX + 5, bundleY - 7); context.stroke();
    }
  } else if (kind === "plow") {
    context.strokeStyle = "#765235"; context.lineWidth = 5; context.beginPath(); context.moveTo(-31, -3); context.lineTo(13, -22); context.lineTo(30, -51); context.moveTo(13, -22); context.lineTo(34, -7); context.stroke();
    context.fillStyle = "#5c5b56"; context.beginPath(); context.moveTo(-33, -5); context.lineTo(-10, -14); context.lineTo(-3, -1); context.closePath(); context.fill(); context.strokeStyle = "#a6aaa1"; context.lineWidth = 1.5; context.stroke();
  }
  context.restore();
}

function DrawVillage(width, height, surfaceY) {
  DrawFieldDepth(width, surfaceY);

  const rearHouses = [-18, -14.4, -11, -7.6, -4.1, -.7, 2.8, 6.2, 9.7, 13.1, 16.7, 20.2];
  rearHouses.forEach((worldX, index) => DrawPerspectiveHouse(worldX, width, surfaceY - 34 - index % 2 * 4, 31 + index % 4 * 4, .46, index, .42));

  context.save();
  for (let worldX = -19; worldX <= 19; worldX += 1.05) {
    const x = LayerToScreen(worldX, width, .58);
    const baseY = surfaceY - 19 + Math.sin(worldX * .8) * 3;
    const heightScale = 17 + SceneHash(worldX + 70) * 22;
    context.fillStyle = "rgba(45,55,39,.72)"; context.beginPath(); context.ellipse(x, baseY - heightScale * .55, 8 + heightScale * .18, heightScale * .55, worldX % 2 ? .14 : -.14, 0, Math.PI * 2); context.fill();
    context.strokeStyle = "rgba(72,61,42,.56)"; context.lineWidth = 2; context.beginPath(); context.moveTo(x, baseY); context.lineTo(x + Math.sin(worldX) * 3, baseY - heightScale); context.stroke();
  }
  context.restore();

  const middleHouses = [-12.6, -8.9, -5.2, -1.3, 2.5, 6.6, 10.7, 14.2];
  middleHouses.forEach((worldX, index) => DrawPerspectiveHouse(worldX, width, surfaceY - 10 - index % 2 * 3, 49 + index % 3 * 7, .7, index + 20, .72));

  [
    { x: -14.8, span: 3.2, parallax: .65, variant: 0 }, { x: -9.8, span: 2.4, parallax: .7, variant: 2 },
    { x: -4.8, span: 3, parallax: .67, variant: 1 }, { x: .5, span: 2.7, parallax: .72, variant: 0 },
    { x: 5.7, span: 2.5, parallax: .69, variant: 2 }, { x: 10.7, span: 3.1, parallax: .66, variant: 1 },
    { x: 15.2, span: 2.8, parallax: .71, variant: 0 }
  ].forEach((fence, index) => DrawVillageFenceSegment(fence.x, width, surfaceY - 8 - index % 2 * 4, fence.span, fence.parallax, fence.variant, .82));

  const mainHouses = [-9, -5.2, -.2, 4.4, 8.3];
  mainHouses.forEach((worldX, index) => DrawPerspectiveHouse(worldX, width, surfaceY - 3, 66 + index % 2 * 12, .82, index + 40, .94));

  [
    { x: -12.1, kind: "firewood", parallax: .82 }, { x: -7.2, kind: "wheelbarrow", parallax: .86 },
    { x: -2.8, kind: "dryingRack", parallax: .79 }, { x: 2.2, kind: "plow", parallax: .85 },
    { x: 6.9, kind: "firewood", parallax: .83 }, { x: 11.7, kind: "dryingRack", parallax: .8 }
  ].forEach((prop, index) => DrawVillageWorkProp(prop.x, width, surfaceY - 3, prop.parallax, prop.kind, index));

  context.fillStyle = "#4a4030"; context.fillRect(0, surfaceY - 5, width, 12);
  context.strokeStyle = "rgba(220,174,102,.26)"; context.lineWidth = 2; context.beginPath(); context.moveTo(0, surfaceY - 4); context.lineTo(width, surfaceY - 4); context.stroke();
}

function DrawSurfaceDepthVeil(width, height, surfaceY, daylight) {
  const haze = context.createLinearGradient(0, surfaceY * .42, 0, surfaceY + 12);
  haze.addColorStop(0, "rgba(214,204,177,0)");
  haze.addColorStop(.58, daylight > .4 ? "rgba(211,196,161,.08)" : "rgba(117,126,121,.035)");
  haze.addColorStop(1, "rgba(31,34,29,.08)");
  context.fillStyle = haze; context.fillRect(0, surfaceY * .38, width, surfaceY * .66);
  const dustOffset = state.camera.x * width * .01;
  for (let mote = 0; mote < 22; mote += 1) {
    const x = (SceneHash(mote + 201) * width - dustOffset + width) % width;
    const y = surfaceY * (.32 + SceneHash(mote + 230) * .61);
    const drift = Math.sin(state.elapsed * (.18 + SceneHash(mote + 250) * .2) + mote) * 8;
    context.fillStyle = `rgba(224,196,137,${.025 + SceneHash(mote + 280) * .055})`;
    context.beginPath(); context.arc(x + drift, y, 1 + SceneHash(mote + 300) * 2.2, 0, Math.PI * 2); context.fill();
  }
}

function DrawSurfaceCovers(width, surfaceY, front) {
  const sceneScale = Math.min(width, 1100) / 1100;
  const unit = width / (22 / state.camera.zoom);
  const activeId = state.player.layer === "surface" ? state.player.coverId : null;
  for (const cover of GetSurfaceCovers()) {
    const x = WorldToScreen(cover.x, width);
    const coverWidth = Math.max(44, cover.width * unit);
    const baseHeight = ({ brush: 88, hay: 84, wall: 80, cart: 86, well: 76 })[cover.kind] * sceneScale;
    const active = activeId === cover.id;
    context.save();
    context.translate(x, surfaceY - 3);

    if (!front) {
      context.fillStyle = "rgba(8,12,12,.32)";
      context.beginPath(); context.ellipse(0, 5, coverWidth * .56, 7 * sceneScale, 0, 0, Math.PI * 2); context.fill();
      if (cover.kind === "brush") {
        context.fillStyle = "#394333";
        [-.34, -.12, .12, .34].forEach((offset, index) => {
          context.beginPath(); context.ellipse(coverWidth * offset, -baseHeight * (.38 + (index % 2) * .12), coverWidth * .3, baseHeight * .46, index % 2 ? .22 : -.18, 0, Math.PI * 2); context.fill();
        });
      } else if (cover.kind === "hay") {
        context.fillStyle = "#806a3e";
        context.beginPath(); context.moveTo(-coverWidth * .52, 0); context.quadraticCurveTo(-coverWidth * .44, -baseHeight * .86, 0, -baseHeight); context.quadraticCurveTo(coverWidth * .46, -baseHeight * .84, coverWidth * .52, 0); context.closePath(); context.fill();
      } else if (cover.kind === "cart") {
        context.fillStyle = "#6f5a38"; context.fillRect(-coverWidth * .43, -baseHeight * .8, coverWidth * .86, baseHeight * .45);
        context.fillStyle = "#3e3025"; context.fillRect(-coverWidth * .5, -baseHeight * .4, coverWidth, baseHeight * .38);
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
      context.fillStyle = active ? "#8a7443" : "#78643b";
      context.beginPath(); context.moveTo(-coverWidth * .52, 0); context.quadraticCurveTo(-coverWidth * .43, -baseHeight * .82, 0, -baseHeight); context.quadraticCurveTo(coverWidth * .43, -baseHeight * .82, coverWidth * .52, 0); context.closePath(); context.fill();
      context.strokeStyle = "rgba(213,179,99,.63)"; context.lineWidth = Math.max(1, 1.6 * sceneScale);
      for (let index = 0; index < 11; index += 1) {
        const offset = (index / 10 - .5) * coverWidth * .88;
        context.beginPath(); context.moveTo(offset, -4); context.lineTo(offset + (index % 3 - 1) * 11 * sceneScale, -baseHeight * (.48 + (index % 4) * .11)); context.stroke();
      }
    } else if (cover.kind === "wall") {
      context.fillStyle = active ? "#66543f" : "#5a4938";
      context.beginPath(); context.moveTo(-coverWidth * .52, 0); context.lineTo(-coverWidth * .52, -baseHeight * .68); context.lineTo(-coverWidth * .24, -baseHeight * .84); context.lineTo(0, -baseHeight * .7); context.lineTo(coverWidth * .23, -baseHeight * .92); context.lineTo(coverWidth * .52, -baseHeight * .72); context.lineTo(coverWidth * .52, 0); context.closePath(); context.fill();
      context.strokeStyle = "rgba(187,148,96,.38)"; context.lineWidth = Math.max(1.5, 2 * sceneScale);
      for (let row = 0; row < 3; row += 1) { context.beginPath(); context.moveTo(-coverWidth * .48, -baseHeight * (.18 + row * .19)); context.lineTo(coverWidth * .47, -baseHeight * (.14 + row * .2)); context.stroke(); }
    } else if (cover.kind === "cart") {
      context.fillStyle = "#59422e"; context.fillRect(-coverWidth * .53, -baseHeight * .62, coverWidth * 1.06, baseHeight * .57);
      context.strokeStyle = "#aa7b48"; context.lineWidth = Math.max(3, 5 * sceneScale); context.strokeRect(-coverWidth * .53, -baseHeight * .62, coverWidth * 1.06, baseHeight * .57);
      context.strokeStyle = "#34271f"; context.lineWidth = Math.max(4, 6 * sceneScale);
      context.beginPath(); context.arc(-coverWidth * .32, 0, baseHeight * .22, 0, Math.PI * 2); context.arc(coverWidth * .32, 0, baseHeight * .22, 0, Math.PI * 2); context.stroke();
      context.fillStyle = "#75663f"; context.beginPath(); context.ellipse(0, -baseHeight * .72, coverWidth * .48, baseHeight * .26, 0, 0, Math.PI * 2); context.fill();
    } else if (cover.kind === "well") {
      context.fillStyle = "#5d4b39"; context.beginPath(); context.ellipse(0, -baseHeight * .58, coverWidth * .5, baseHeight * .22, 0, 0, Math.PI * 2); context.fill();
      context.fillRect(-coverWidth * .5, -baseHeight * .58, coverWidth, baseHeight * .55);
      context.fillStyle = "#201d1a"; context.beginPath(); context.ellipse(0, -baseHeight * .58, coverWidth * .35, baseHeight * .11, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#a47c4f"; context.lineWidth = Math.max(2, 4 * sceneScale); context.beginPath(); context.ellipse(0, -baseHeight * .58, coverWidth * .5, baseHeight * .22, 0, 0, Math.PI * 2); context.stroke();
    }

    if (active) {
      context.strokeStyle = "rgba(112,222,214,.78)"; context.lineWidth = Math.max(1.5, 2 * sceneScale); context.setLineDash([5 * sceneScale, 5 * sceneScale]);
      context.beginPath(); context.ellipse(0, 2, coverWidth * .55, 8 * sceneScale, 0, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
    }
    context.restore();
  }
}

function DrawActorVisibilityHud(width, surfaceY) {
  if (state.player.layer !== "surface" || (!GetEnemyPatrols().length && !state.caught)) return;
  const profile = actorProfiles[state.selectedRole];
  const actorScale = Math.min(width, 1100) / 26 * .038;
  const actorHeight = profile.height * 39 * actorScale * (state.player.lowProfile ? .7 : 1);
  const cover = GetActiveCover();
  const label = state.detected ? "被发现" : cover ? `遮蔽 · ${cover.label}` : "无遮掩";
  const tone = state.detected ? "#ef6657" : cover ? "#6ed7d3" : "#d9ae65";
  const x = WorldToScreen(state.player.x, width);
  const y = surfaceY - actorHeight - 42;
  const panelWidth = Math.max(88, Math.min(146, 52 + label.length * 11));
  context.save(); context.translate(x, y);
  context.fillStyle = "rgba(8,13,15,.9)"; context.beginPath(); context.roundRect(-panelWidth / 2, -12, panelWidth, 28, 14); context.fill();
  context.strokeStyle = tone; context.lineWidth = 1.5; context.stroke();
  context.fillStyle = tone; context.font = "800 10px system-ui, sans-serif"; context.textAlign = "center"; context.fillText(label, 0, -1);
  context.fillStyle = "rgba(255,255,255,.12)"; context.fillRect(-panelWidth * .32, 5, panelWidth * .64, 3);
  context.fillStyle = tone; context.fillRect(-panelWidth * .32, 5, panelWidth * .64 * state.visibility / 100, 3);
  context.restore();
}

function DrawDetectionFlash(width, height, surfaceY) {
  if (!state.caught) return;
  const progress = state.caught.time / state.caught.duration;
  const pulse = .13 + Math.sin(progress * Math.PI * 5) * .04;
  context.fillStyle = `rgba(170,24,22,${pulse})`; context.fillRect(0, 0, width, height);
  const x = WorldToScreen(state.player.x, width);
  context.save(); context.translate(x, surfaceY - 150);
  context.fillStyle = "#f16759"; context.beginPath(); context.arc(0, 0, 17, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#fff5e8"; context.font = "900 22px system-ui, sans-serif"; context.textAlign = "center"; context.fillText("!", 0, 8);
  context.restore();
}

function DrawEarth(width, height, surfaceY, tunnelY) {
  const gradient = context.createLinearGradient(0, surfaceY, 0, height);
  gradient.addColorStop(0, "#6a4c35"); gradient.addColorStop(.45, "#3e3027"); gradient.addColorStop(1, "#171b1c");
  context.fillStyle = gradient; context.fillRect(0, surfaceY + 4, width, height - surfaceY);
  context.strokeStyle = "rgba(181,132,86,.18)"; context.lineWidth = 1;
  for (let y = surfaceY + 30; y < height; y += 24) {
    context.beginPath(); context.moveTo(0, y);
    for (let x = 0; x <= width; x += 40) context.lineTo(x, y + Math.sin(x * .021 + y) * 4);
    context.stroke();
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
    if (!slotId) return;
    const worldX = slotWorldXs[slotIndex];
    const screenX = WorldToScreen(worldX, width);
    const centerY = TunnelCenterYAt(worldX, tunnelY);
    const localHalfHeight = TunnelHalfHeightAt(worldX, height);
    const floorY = TunnelFloorYAt(worldX, height, tunnelY);
    if (slotId === "flipGate") {
      context.strokeStyle = "#b3834e"; context.lineWidth = 5; context.beginPath(); context.moveTo(screenX - 18, floorY - 4); context.lineTo(screenX + 18, floorY - 4); context.stroke();
      context.fillStyle = "#d8aa61"; context.beginPath(); context.arc(screenX - 16, floorY - 4, 4, 0, Math.PI * 2); context.fill();
    } else if (slotId === "smokeBaffle") {
      context.fillStyle = "#8f7049"; context.beginPath(); context.moveTo(screenX - 4, centerY - localHalfHeight + 10); context.lineTo(screenX + 17, centerY - 8); context.lineTo(screenX + 8, centerY - 4); context.lineTo(screenX - 10, centerY - localHalfHeight + 16); context.closePath(); context.fill();
      DrawFlowArrow(screenX + 10, centerY - 24, 1, "#75d7d7", .9);
    } else if (slotId === "floodGate") {
      context.fillStyle = "#775b3c"; context.fillRect(screenX - 6, centerY - 25, 12, floorY - centerY + 21);
      context.fillStyle = "#5cb4c1"; context.fillRect(screenX - 3, centerY - 17, 6, 23);
      context.strokeStyle = "#72c9d2"; context.lineWidth = 3; context.beginPath(); context.moveTo(screenX - 22, floorY - 7); context.lineTo(screenX + 25, floorY - 7); context.stroke();
    }
  });

  if (["defense", "outcome"].includes(state.phaseId)) {
    const hasBaffle = state.buildSlots.includes("smokeBaffle");
    context.save();
    context.font = "600 11px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillStyle = "rgba(107,222,224,.88)";
    context.fillText("进风", WorldToScreen(intakeX, width), surfaceY - 16);
    context.fillStyle = "rgba(205,214,205,.88)";
    context.fillText(hasBaffle ? "排烟" : "烟倒灌", WorldToScreen(hasBaffle ? exhaustX : -7.5, width), surfaceY - 16);
    context.restore();
  }
}

function QaInspectHazard(kind) {
  if (!qaMode || state.levelIndex !== 0) return;
  if (kind === "clean") {
    state.cleanCapture = true;
    Show(ui.qaPanel, false);
    clearTimeout(toastTimer);
    Show(ui.toast, false);
    UpdateUi();
    return;
  }
  if (["dog", "bell", "crackers", "enemies"].includes(kind) || state.phaseId !== "defense" || state.mode !== "play") QaJumpToPhase("defense");
  EndCinematic();
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
    context.save();
    context.translate(x, floorY);
    context.globalAlpha = .93;
    if (civilian.group === "stretcher" && civilian.id === "wounded") {
      context.strokeStyle = "#8b6640"; context.lineWidth = 3;
      context.beginPath(); context.moveTo(-21, -4); context.lineTo(22, -4); context.moveTo(-18, -18); context.lineTo(19, -18); context.stroke();
      context.fillStyle = "#65776f"; context.beginPath(); context.moveTo(-15, -6); context.lineTo(-11, -20); context.lineTo(14, -20); context.lineTo(18, -6); context.closePath(); context.fill();
      context.fillStyle = "#c98e6b"; context.beginPath(); context.arc(14, -23, 4.2, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#d6c9aa"; context.fillRect(-7, -20, 12, 12);
    } else {
      const look = civilianLooks[civilian.group];
      const bodyHeight = civilian.group === "children" ? 24 : civilian.id === "signalman" ? 32 : 30;
      const shoulder = civilian.group === "children" ? 5.1 : 6.1;
      const waist = civilian.group === "children" ? 3.2 : 3.8;
      context.strokeStyle = look.pants; context.lineWidth = 2.6; context.lineCap = "round";
      context.beginPath(); context.moveTo(-2.6, -bodyHeight * .35); context.lineTo(-3.2 + gait * 2, -2); context.moveTo(2.6, -bodyHeight * .35); context.lineTo(3.2 - gait * 2, -2); context.stroke();
      context.fillStyle = look.coat;
      context.beginPath(); context.moveTo(-shoulder, -bodyHeight * .78); context.quadraticCurveTo(0, -bodyHeight * 1.02, shoulder, -bodyHeight * .78); context.lineTo(waist, -bodyHeight * .35); context.lineTo(-waist, -bodyHeight * .35); context.closePath(); context.fill();
      context.strokeStyle = "rgba(232,205,150,.42)"; context.lineWidth = 1; context.stroke();
      context.strokeStyle = look.coat; context.lineWidth = 2.3; context.beginPath(); context.moveTo(-shoulder * .8, -bodyHeight * .73); context.lineTo(-shoulder - 2, -bodyHeight * .42); context.moveTo(shoulder * .8, -bodyHeight * .73); context.lineTo(shoulder + 2, -bodyHeight * .45); context.stroke();
      context.fillStyle = look.scarf; context.fillRect(-waist * 1.2, -bodyHeight * .42, waist * 2.4, 2.5);
      context.fillStyle = "#c99370"; context.beginPath(); context.arc(0, -bodyHeight - 4.5, civilian.group === "children" ? 4.2 : 4.7, 0, Math.PI * 2); context.fill();
      context.fillStyle = civilian.group === "elders" ? "#aaa697" : "#302821"; context.beginPath(); context.arc(-.5, -bodyHeight - 6.2, civilian.group === "children" ? 4 : 4.5, Math.PI, Math.PI * 2); context.fill();
      if (civilian.id === "signalman") { context.strokeStyle = "#ad8550"; context.lineWidth = 2; context.beginPath(); context.moveTo(shoulder + 2, -bodyHeight * .45); context.lineTo(11, -2); context.stroke(); }
      if (civilian.id === "medic") { context.fillStyle = "#d8d1b7"; context.fillRect(-3, -bodyHeight * .67, 6, 6); context.fillStyle = "#688c82"; context.fillRect(-1, -bodyHeight * .66, 2, 4); context.fillRect(-2, -bodyHeight * .65, 4, 2); }
    }
    context.fillStyle = dose > 65 ? "#e46150" : "rgba(235,231,210,.9)";
    context.beginPath(); context.arc(0, -43, 8, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#172123"; context.font = "900 7px system-ui"; context.textAlign = "center"; context.fillText(civilian.mark, 0, -40.5);
    if (dose > 4) {
      context.strokeStyle = dose > 65 ? "#ef6657" : "#d2ad67"; context.lineWidth = 2;
      context.beginPath(); context.arc(0, -43, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, dose / 100)); context.stroke();
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
      context.fillStyle = "rgba(7,12,14,.94)"; context.beginPath(); context.arc(enemyX, questionY, 11, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "rgba(246,146,75,.9)"; context.lineWidth = 1.5; context.stroke();
      context.fillStyle = "#ffe09a"; context.font = "900 14px system-ui"; context.textAlign = "center"; context.fillText("?", enemyX, questionY + 5);
    });
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
    const bodyHeight = civilian.group === "children" ? 24 : civilian.id === "wounded" ? 17 : 31;
    distance = Math.min(distance, SignedDistanceToRectangle(screenX, screenY, x, floorY - bodyHeight * .5, civilian.id === "wounded" ? 17 : 6, bodyHeight * .5));
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
    [-9, -.2, 8.3].forEach((worldX, index) => surfaceLights.push({
      x: LayerToScreen(worldX, width, .76), y: surfaceY - 43 - (index % 2) * 5,
      radius: 112, intensity: .76, glow: .2, seed: index + .4, color: "238,170,76"
    }));
    GetEnemyPatrols().forEach((enemy) => surfaceLights.push({
      x: WorldToScreen(enemy.x, width), y: surfaceY - 48, radius: 118, intensity: .72, glow: .17, seed: enemy.index + 5, color: "242,151,61"
    }));
  }
  if (surfaceLights.length || daylight < .4) {
    context.save(); context.beginPath(); context.rect(0, 0, width, surfaceY + 1); context.clip();
    lightRenderer.Draw(context, width, height, surfaceLights, (x, y) => SurfaceLightSdf(x, y, width, surfaceY), daylight < .3 ? .72 : .28, state.elapsed);
    context.restore();
  }

  const tunnelLights = [-7.75, 3.8, 7.72].map((worldX, index) => ({
    x: WorldToScreen(worldX, width),
    y: TunnelFloorYAt(worldX, height, tunnelY) - 25,
    radius: 205 + index * 8, intensity: .96, glow: .15, seed: index + 9, color: "240,169,72"
  }));
  context.save(); context.beginPath(); context.rect(0, surfaceY - 1, width, height - surfaceY + 1); context.clip();
  lightRenderer.Draw(context, width, height, tunnelLights, (x, y) => TunnelLightSdf(x, y, width, height, surfaceY, tunnelY), .68, state.elapsed);
  context.restore();
}

function PropSupportLift(support) {
  return ({ ground: 0, tray: -7, lowCrate: -21, plankTable: -27, jarShelf: -16, cloth: -3, pallet: -6, wellPeg: -9, crate: -27 })[support] ?? 0;
}

function PropVisualHeight(kind) {
  return ({ timberStack: 22, ironFittings: 26, powderJar: 34, reliefBundle: 35, capturePile: 32, hiddenLetter: 27, thimble: 29, woundedStretcher: 31, grainSacks: 34, ropeCoil: 31, soldierBoot: 28, fieldRadioMap: 48 })[kind] ?? 28;
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
  } else if (empty) {
    context.strokeStyle = "rgba(187,145,84,.35)"; context.lineWidth = 2;
    context.beginPath(); context.moveTo(-18, -1); context.lineTo(-7, -5); context.moveTo(3, -2); context.lineTo(17, -5); context.stroke();
  }
  context.restore();
}

function DrawPropObject(kind, scale = 1, ghost = false) {
  context.save(); context.scale(scale, scale); context.globalAlpha = ghost ? .24 : 1;
  if (ghost) context.setLineDash([4, 3]);
  if (kind === "timberStack") {
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
  const labelWidth = Math.ceil(context.measureText(textValue).width) + 20;
  context.fillStyle = tone === "empty" ? "rgba(24,28,27,.78)" : "rgba(8,14,16,.9)"; context.fillRect(x - labelWidth / 2, y - 17, labelWidth, 21);
  context.fillStyle = tone === "empty" ? "#b9aa90" : "#f2ead7"; context.fillText(textValue, x, y - 3);
  context.strokeStyle = tone === "empty" ? "rgba(190,160,107,.35)" : "rgba(103,221,221,.62)"; context.lineWidth = 1; context.strokeRect(x - labelWidth / 2 + .5, y - 16.5, labelWidth - 1, 20);
  context.restore();
}

function DrawActionProps(width, height, surfaceY, tunnelY, front) {
  const sceneScale = Math.max(.72, Math.min(1.05, width / 980));
  const focusedProp = state.level.actions
    .filter((action) => action.phase === state.phaseId && action.layer === state.player.layer && action.prop && Math.abs(action.x - state.player.x) <= 1.9)
    .sort((a, b) => Math.abs(a.x - state.player.x) - Math.abs(b.x - state.player.x))[0] || null;
  for (const action of state.level.actions) {
    if (action.phase !== state.phaseId || !action.prop || Boolean(action.prop.front) !== front) continue;
    const completed = state.completed.has(action.id);
    const propWorldX = action.x + (action.prop.offsetX || 0);
    const x = WorldToScreen(propWorldX, width);
    const baseY = action.layer === "surface" ? surfaceY - 5 : TunnelFloorYAt(propWorldX, height, tunnelY) - 5;
    const supportLift = PropSupportLift(action.prop.support) * sceneScale;
    const present = action.prop.mode === "place" ? completed : !completed;
    const empty = action.prop.mode !== "place" && completed;
    context.save(); context.translate(x, baseY);
    DrawPropSupport(action.prop.support, sceneScale, empty);
    context.translate(0, supportLift);
    if (present) DrawPropObject(action.prop.kind, sceneScale);
    else if (action.prop.mode === "place" && !completed) DrawPropObject(action.prop.kind, sceneScale, true);
    context.restore();

    const sameLayer = action.layer === state.player.layer;
    const focused = focusedProp?.id === action.id;
    const locked = Boolean(MissingRequirement(action)) || (action.role && action.role !== state.selectedRole);
    const markerY = baseY + supportLift - PropVisualHeight(action.prop.kind) * sceneScale * .58;
    if (!completed && sameLayer) {
      const pulse = 1 + Math.sin(state.elapsed * 4.2 + action.x) * .1;
      context.save(); context.translate(x, markerY); context.scale(pulse, pulse);
      context.strokeStyle = locked ? "rgba(222,183,112,.7)" : "rgba(104,225,225,.88)"; context.lineWidth = 2;
      context.beginPath(); context.ellipse(0, 0, 17 * sceneScale, 12 * sceneScale, 0, 0, Math.PI * 2); context.stroke();
      context.fillStyle = locked ? "rgba(178,132,74,.2)" : "rgba(92,214,216,.16)"; context.fill(); context.restore();
    }
    if (focused) {
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
  const sourceBaseY = pickup.layer === "surface" ? surfaceY - 8 : TunnelFloorYAt(pickup.x, height, tunnelY) - 8;
  const actorX = WorldToScreen(state.player.x, width) + state.player.facing * 16;
  const actorBaseY = state.player.layer === "surface" ? surfaceY - 5 : TunnelFloorYAt(state.player.x, height, tunnelY);
  const targetY = actorBaseY - 48;
  const x = Lerp(sourceX, actorX, eased);
  const y = Lerp(sourceBaseY - PropVisualHeight(pickup.kind) * .45, targetY, eased) - Math.sin(progress * Math.PI) * 24;
  context.save(); context.translate(x, y); DrawPropObject(pickup.kind, Lerp(.82, .42, eased)); context.restore();
  context.strokeStyle = `rgba(112,229,225,${.55 * (1 - progress)})`; context.lineWidth = 2; context.beginPath(); context.moveTo(sourceX, sourceBaseY - 10); context.quadraticCurveTo((sourceX + actorX) / 2, y - 28, actorX, targetY); context.stroke();
}

function DrawActions(width, height, surfaceY, tunnelY) {
  for (const action of state.level.actions) {
    if (action.phase !== state.phaseId || (state.completed.has(action.id) && action.buildSlot === undefined)) continue;
    if (action.prop) continue;
    const x = WorldToScreen(action.x, width);
    const y = action.layer === "surface" ? surfaceY - 10 : TunnelCenterYAt(action.x, tunnelY) - 4;
    const locked = Boolean(MissingRequirement(action)) || (action.role && action.role !== state.selectedRole);
    const pulse = 1 + Math.sin(state.elapsed * 4 + action.x) * .12;
    context.save(); context.translate(x, y - 24); context.scale(pulse, pulse);
    context.fillStyle = locked ? "rgba(176,143,94,.36)" : "rgba(93,205,210,.82)";
    context.beginPath(); context.arc(0, 0, 8, 0, Math.PI * 2); context.fill();
    context.strokeStyle = locked ? "rgba(229,196,133,.66)" : "rgba(193,250,242,.9)"; context.lineWidth = 2;
    context.beginPath(); context.arc(0, 0, 14, 0, Math.PI * 2); context.stroke(); context.restore();
    if (qaMode && !state.cleanCapture) {
      context.fillStyle = "#fff"; context.font = "11px monospace"; context.fillText(action.id, x - 24, y - 44);
    }
  }
}

function DrawEntrances(width, height, surfaceY, tunnelY) {
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
  const phase = state.elapsed * (isCollaborator ? 4.35 : 3.85) + enemy.index * 1.7;
  const stride = Math.sin(phase) * .34;
  const investigateLift = enemy.investigating ? .32 + Math.sin(state.elapsed * 4 + enemy.index) * .08 : 0;
  const limbWidth = Math.max(3.2, height * profile.limb);

  context.save(); context.translate(x, baseY); context.scale(enemy.facing, 1);
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

  const rearArm = isCollaborator ? -.18 : .16;
  DrawJointedLimb(-shoulder * .82, -height * .655, height * .17, height * .155, rearArm, isCollaborator ? -.35 : .58, profile.body, limbWidth);
  if (isCollaborator) {
    DrawJointedLimb(shoulder * .82, -height * .655, height * .17, height * .15, .92 + investigateLift, .45, profile.body, limbWidth);
    context.strokeStyle = "#8a6a3f"; context.lineWidth = 3; context.beginPath(); context.moveTo(height * .19, -height * (.47 + investigateLift * .3)); context.lineTo(height * .38, -height * (.43 + investigateLift * .25)); context.stroke();
    context.fillStyle = "#d0a75b"; context.beginPath(); context.arc(height * .4, -height * (.425 + investigateLift * .24), height * .035, 0, Math.PI * 2); context.fill();
    context.fillStyle = "rgba(244,181,74,.18)"; context.beginPath(); context.arc(height * .4, -height * (.425 + investigateLift * .24), height * .16, 0, Math.PI * 2); context.fill();
  } else {
    DrawJointedLimb(shoulder * .82, -height * .655, height * .17, height * .155, .72 + investigateLift, .18, profile.body, limbWidth);
    context.strokeStyle = "#3b3027"; context.lineWidth = Math.max(4, height * .045); context.beginPath(); context.moveTo(-height * .33, -height * .54); context.lineTo(height * .37, -height * (.48 + investigateLift * .08)); context.stroke();
    context.strokeStyle = "#a17a46"; context.lineWidth = 2.2; context.beginPath(); context.moveTo(-height * .29, -height * .545); context.lineTo(height * .24, -height * (.5 + investigateLift * .08)); context.stroke();
    context.fillStyle = "#5e5d4b"; context.fillRect(-height * .37, -height * .565, height * .11, height * .035);
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

  if (enemy.investigating) {
    context.fillStyle = "rgba(8,13,15,.9)"; context.beginPath(); context.arc(x, baseY - height - 13, 10, 0, Math.PI * 2); context.fill();
    context.strokeStyle = isCollaborator ? "#d7c490" : "#e2bc67"; context.lineWidth = 1.5; context.stroke();
    context.fillStyle = "#f3d78f"; context.font = "900 12px system-ui"; context.textAlign = "center"; context.fillText("?", x, baseY - height - 9);
  }
}

function DrawEnemies(width, surfaceY) {
  const patrols = GetEnemyPatrols();
  if (!patrols.length) return;
  const profile = actorProfiles.soldier;
  const scale = Math.min(width, 1100) / 26 * .038;
  const height = profile.height * 39 * scale;
  const baseY = surfaceY - 5;
  patrols.forEach((enemy) => {
    const x = WorldToScreen(enemy.x, width);
    const endX = WorldToScreen(enemy.x + enemy.facing * enemy.viewDistance, width);
    const active = EnemyDetection(enemy) > 0;
    const gradient = context.createLinearGradient(x, 0, endX, 0);
    gradient.addColorStop(0, active ? "rgba(229,58,44,.48)" : "rgba(222,190,108,.13)");
    gradient.addColorStop(1, active ? "rgba(195,43,34,.06)" : "rgba(215,184,103,0)");
    context.fillStyle = gradient;
    context.beginPath(); context.moveTo(x + enemy.facing * height * .11, baseY - height * .72); context.lineTo(endX, surfaceY + 3); context.lineTo(x + enemy.facing * height * .17, surfaceY + 3); context.closePath(); context.fill();
    context.strokeStyle = active ? "rgba(255,91,69,.92)" : "rgba(219,186,104,.18)"; context.lineWidth = active ? 2.5 : 1;
    context.beginPath(); context.moveTo(x + enemy.facing * height * .11, baseY - height * .72); context.lineTo(endX, surfaceY + 3); context.stroke();
  });
  patrols.forEach((enemy) => DrawEnemyUnit(enemy, height, WorldToScreen(enemy.x, width), baseY));
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
  const profileScale = state.player.lowProfile || action === "crawl" ? .7 : 1;
  context.translate(0, bob);
  context.scale(1, profileScale);
  if (state.player.lowProfile || action === "crawl") context.rotate(-.055);

  context.fillStyle = "rgba(0,0,0,.32)"; context.beginPath(); context.ellipse(0, 1 - bob, height * .24, 5, 0, 0, Math.PI * 2); context.fill();

  let rearLeg = Math.sin(phase) * .34 * moving;
  let frontLeg = -rearLeg;
  if (action === "climb") { rearLeg = Math.sin(actionProgress * Math.PI * 4) * .42; frontLeg = -rearLeg; }
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
  const sniff = actor.actionKind === "crawl" || !moving ? (.5 + Math.sin(state.elapsed * 2.8) * .5) : 0;
  const bob = Math.abs(Math.sin(phase)) * -2 * moving;
  context.translate(0, bob);
  context.fillStyle = "rgba(0,0,0,.3)"; context.beginPath(); context.ellipse(0, 1 - bob, height * .48, 5, 0, 0, Math.PI * 2); context.fill();
  const legSwing = Math.sin(phase) * height * .08 * moving;
  context.strokeStyle = profile.pants; context.lineWidth = Math.max(3, height * .065); context.lineCap = "round";
  [-.27, -.08, .13, .31].forEach((offset, index) => { context.beginPath(); context.moveTo(height * offset, -height * .22); context.lineTo(height * offset + (index % 2 ? -legSwing : legSwing), 0); context.stroke(); });
  context.fillStyle = profile.body; context.beginPath(); context.ellipse(-height * .04, -height * .42, height * .48, height * .24, -.05, 0, Math.PI * 2); context.fill();
  context.fillStyle = "rgba(225,190,145,.48)"; context.beginPath(); context.ellipse(height * .08, -height * .37, height * .24, height * .12, 0, 0, Math.PI * 2); context.fill();
  const headY = -height * (.54 - sniff * .12);
  context.fillStyle = profile.skin; context.beginPath(); context.arc(height * .43, headY, height * .19, 0, Math.PI * 2); context.fill();
  context.fillStyle = profile.hair; context.beginPath(); context.moveTo(height * .32, headY - height * .15); context.lineTo(height * .27, headY - height * .35); context.lineTo(height * .43, headY - height * .18); context.moveTo(height * .49, headY - height * .16); context.lineTo(height * .62, headY - height * .31); context.lineTo(height * .59, headY - height * .08); context.fill();
  context.fillStyle = "#1e2422"; context.beginPath(); context.arc(height * .56, headY + 1, 2.3, 0, Math.PI * 2); context.arc(height * .44, headY - height * .04, 1.8, 0, Math.PI * 2); context.fill();
  context.fillStyle = profile.accent; context.beginPath(); context.moveTo(height * .25, -height * .53); context.lineTo(height * .48, -height * .47); context.lineTo(height * .28, -height * .33); context.closePath(); context.fill();
  const tailWave = Math.sin(state.elapsed * (moving ? 8 : 3.5)) * .35;
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
    context.beginPath(); context.arc(x, baseY - height * .53, height * (.4 + (1 - state.player.rolePulse) * .13), 0, Math.PI * 2); context.stroke();
    context.fillStyle = "rgba(8,13,15,.88)"; context.fillRect(x - 58, baseY - height - 34, 116, 24);
    context.fillStyle = "#f3efe1"; context.font = "700 12px system-ui, sans-serif"; context.fillText(`现在是 ${role.short}`, x, baseY - height - 17);
  }
  context.restore();
}

function DrawDogCompanion(width, viewportHeight, surfaceY, tunnelY) {
  if (state.levelIndex !== 0 || state.selectedRole === "dog" || state.mode === "title") return;
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
  if (state.levelIndex !== 0 || state.selectedRole === "dog" || !state.dog.commandId || state.mode !== "play") return;
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
  const baseY = state.player.layer === "surface" ? surfaceY - 5 : TunnelFloorYAt(state.player.x, viewportHeight, tunnelY);
  const scale = Math.min(width, 1100) / 26 * .038;
  const height = profile.height * 39 * scale;
  context.save(); context.translate(x, baseY); context.scale(state.player.facing, 1);
  if (profile.animal) DrawDogActor(profile, height, state.player);
  else DrawHumanActor(profile, roleId, height);
  context.restore();
  DrawActorIdentity(profile, role, x, baseY, height);
}

function DrawSurfaceVegetation(width, height, surfaceY) {
  context.save();
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
  context.strokeStyle = "rgba(18,24,21,.78)"; context.fillStyle = "rgba(23,29,24,.76)"; context.lineCap = "round";
  const foregroundClumps = [-13, -9.3, -5.4, -1.2, 3.4, 7.7, 12.1];
  foregroundClumps.forEach((worldX, clumpIndex) => {
    const baseX = LayerToScreen(worldX, width, 1.16);
    for (let stemIndex = 0; stemIndex < 5; stemIndex += 1) {
      const offset = (stemIndex - 2) * 8;
      const stemHeight = 24 + ((clumpIndex * 9 + stemIndex * 7) % 30);
      const sway = Math.sin(state.elapsed * .55 + clumpIndex + stemIndex) * 3;
      context.lineWidth = 2.5;
      context.beginPath(); context.moveTo(baseX + offset, surfaceY + 5); context.quadraticCurveTo(baseX + offset + sway, surfaceY - stemHeight * .55, baseX + offset + sway * 1.4, surfaceY - stemHeight); context.stroke();
      if (stemIndex % 2 === 0) { context.beginPath(); context.ellipse(baseX + offset + sway + 3, surfaceY - stemHeight * .66, 7, 2.5, -.5, 0, Math.PI * 2); context.fill(); }
    }
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
  vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,.48)"); context.fillStyle = vignette; context.fillRect(0, 0, width, height);
}

function DrawForegroundDepthFrame(width, height, surfaceY, tunnelY, daylight) {
  context.save();
  const nearScale = Math.max(.72, Math.min(1.18, width / 1100));
  const playerX = WorldToScreen(state.player.x, width);

  const nearStructures = [-16.2, -7.1, 3.6, 13.9, 23.1];
  nearStructures.forEach((worldX, index) => {
    const x = LayerToScreen(worldX, width, 1.2);
    if (x < -150 || x > width + 150 || (x > width * .23 && x < width * .77)) return;
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
  });

  const nearCropXs = [-18.4, -15.7, -12.2, -8.7, -4.9, -1.6, 1.8, 5.3, 9.1, 12.8, 16.2, 19.7];
  nearCropXs.forEach((worldX, clumpIndex) => {
    const baseX = LayerToScreen(worldX, width, 1.29);
    if (baseX < -90 || baseX > width + 90 || Math.abs(baseX - playerX) < 52) return;
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

  const foregroundSupports = [-11.8, -7.4, -3.1, 1.5, 5.9, 10.2, 14.6];
  foregroundSupports.forEach((worldX, index) => {
    const x = LayerToScreen(worldX, width, 1.13);
    if (x < -50 || x > width + 50 || (state.player.layer === "tunnel" && Math.abs(x - playerX) < 46)) return;
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
  });

  const rootXs = [-9.8, -6.1, -2.6, .8, 4.1, 7.8, 10.6];
  rootXs.forEach((worldX, index) => {
    const x = LayerToScreen(worldX, width, 1.09);
    const rootLength = 18 + index % 3 * 12;
    context.strokeStyle = "rgba(78,54,35,.72)"; context.lineWidth = 2.5;
    context.beginPath(); context.moveTo(x, surfaceY + 2); context.quadraticCurveTo(x + (index % 2 ? -8 : 7), surfaceY + rootLength * .55, x + (index % 3 - 1) * 11, surfaceY + rootLength); context.stroke();
  });

  const floorSamples = [];
  for (let worldX = worldMin - 4; worldX <= worldMax + 4; worldX += .42) {
    floorSamples.push({ x: LayerToScreen(worldX, width, 1.085), y: TunnelFloorYAt(worldX, height, tunnelY) + 14 + Math.sin(worldX * 2.8) * 5 });
  }
  const lipGradient = context.createLinearGradient(0, tunnelY, 0, height);
  lipGradient.addColorStop(0, "rgba(28,22,18,.18)"); lipGradient.addColorStop(1, "rgba(5,9,11,.86)");
  context.fillStyle = lipGradient; context.beginPath(); context.moveTo(-30, height); floorSamples.forEach((point) => context.lineTo(point.x, point.y)); context.lineTo(width + 30, height); context.closePath(); context.fill();
  context.strokeStyle = "rgba(123,88,49,.5)"; context.lineWidth = 4; context.beginPath(); floorSamples.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();

  const nearVignette = context.createRadialGradient(width / 2, height * .54, Math.min(width, height) * .28, width / 2, height * .54, Math.max(width, height) * .76);
  nearVignette.addColorStop(0, "rgba(0,0,0,0)"); nearVignette.addColorStop(.68, "rgba(0,0,0,.04)"); nearVignette.addColorStop(1, "rgba(0,0,0,.3)"); context.fillStyle = nearVignette; context.fillRect(0, 0, width, height);
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
ui.failureReplayButton.addEventListener("click", () => StartLevel(0));
ui.failureQaButton.addEventListener("click", () => { Show(ui.missionFailure, false); QaJumpToPhase("defense"); });
Show(ui.failureQaButton, qaMode);
document.querySelectorAll("[data-close-panel]").forEach((button) => button.addEventListener("click", () => Show(button.closest(".panelScreen"), false)));

window.addEventListener("keydown", (event) => {
  if (["KeyA", "ArrowLeft"].includes(event.code)) inputKeys.left = true;
  if (["KeyD", "ArrowRight"].includes(event.code)) inputKeys.right = true;
  if (event.repeat && ["KeyE", "KeyQ", "KeyW", "KeyS"].includes(event.code)) return;
  if (event.code === "KeyE") PerformAction();
  if (event.code === "KeyQ") CycleRole();
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
    startLevel: (index) => StartLevel(Math.max(0, Math.min(2, Number(index) || 0))),
    jumpToPhase: (phaseId) => QaJumpToPhase(String(phaseId)),
    inspectHazard: (kind) => QaInspectHazard(String(kind)),
    getState: () => ({
      level: state.level.id, phase: state.phaseId, x: state.player.x, layer: state.player.layer,
      role: state.selectedRole, completed: [...state.completed], resources: { ...state.resources }, buildSlots: [...state.buildSlots],
      ventilation: state.defense.ventilation, defense: state.defense.strength, rescues: { ...state.rescues }, memories: [...state.memories],
      visibility: state.visibility, detection: state.detection, detected: state.detected, cover: state.player.coverId,
      alert: state.alert, morale: state.morale, tricks: [...state.tricks]
      , prepRemaining: state.prepRemaining, raid: { ...state.raid }, excavated: [...state.excavated]
      , civilians: state.civilians.map((civilian) => ({ name: civilian.name, group: civilian.group, x: civilian.x, targetX: civilian.targetX, smokeDose: civilian.smokeDose, waterDose: civilian.waterDose }))
      , dog: state.dog ? { x: state.dog.x, layer: state.dog.layer, commandId: state.dog.commandId, commandMode: state.dog.commandMode, progress: state.dog.progress } : null
      , distraction: state.raid.distraction ? { ...state.raid.distraction } : null
      , enemies: GetEnemyPatrols().map((enemy) => ({ x: enemy.x, facing: enemy.facing, investigating: enemy.investigating }))
      , fluid: state.fluid?.GetStatistics() || null, failure: state.missionFailure
    })
  });
}

RenderLevelSelectors();
RenderQaPanel();
requestAnimationFrame(Loop);
