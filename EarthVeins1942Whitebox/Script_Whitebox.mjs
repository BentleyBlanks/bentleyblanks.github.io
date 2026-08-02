import { actorProfiles, roleDefinitions, buildOptions, levelDefinitions, coverDefinitions } from "./Data_WhiteboxCampaign.mjs?v=20260803c";

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
  , "qaPanel", "qaLevelButtons", "qaPhaseButtons", "qaStateReadout"
].map((id) => [id, document.querySelector(`#${id}`)]));

const qaMode = new URLSearchParams(location.search).get("qa") === "1";
const startingLevel = Math.max(0, Math.min(2, Number(new URLSearchParams(location.search).get("level")) || 0));
const worldMin = -11;
const worldMax = 11;
const entrances = [-1.1, 8.6];
const requiredCollect = ["collectWood", "collectIron", "collectPowder", "collectSupplies"];
const requiredRescues = ["wounded", "grain", "courier"];
const inputKeys = { left: false, right: false };
let selectedLevel = startingLevel;
let lastTime = performance.now();
let toastTimer = 0;
let state = CreateState(startingLevel);

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
    defense: { ventilation: 0, strength: 0, enemyUnits: 6, triggered: 0 },
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
  Show(ui.gameHeader);
  Show(ui.objectiveCard);
  Show(ui.metricsPanel);
  Show(ui.roleDock, state.level.roleIds.length > 1);
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
  state.selectedRole = roleId;
  state.player.rolePulse = 1;
  state.player.actionKind = "ready";
  state.player.actionTime = .62;
  state.player.actionDuration = .62;
  RenderRoleDock();
  UpdateUi();
}

function ActorActionKind(action) {
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
  if (action.buildSlot !== undefined) {
    OpenBuildPanel(action.buildSlot);
    return;
  }
  if (action.phaseGate) {
    if (state.buildSlots.some((slot) => !slot)) return Toast("三处机关位还没有全部完工。", "warning");
    if (state.defense.ventilation < 3) return Toast("通风不足 3：烟会先伤到地道里的乡亲。请重建一处机关。", "warning");
    if (state.defense.strength < 4) return Toast("防御不足 4：还无法安全分割六人小队。", "warning");
    state.completed.add(action.id);
    BeginActorAction({ id: "closeSurfaceGate" });
    SetPhase("defense", "第二轮 · 扫荡入村", "他们进村了。照说好的，把人往空院领。", "队长");
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
  if (action.effect === "enterTunnel") state.player.layer = "tunnel";
  if (action.rescue) state.rescues[action.rescue] = true;
  if (action.memory && !state.memories.includes(action.memory)) state.memories.push(action.memory);
  if (action.trick) {
    state.tricks.add(action.id);
    state.alert = Math.min(100, state.alert + action.alert);
    state.morale = Math.max(0, state.morale + action.morale);
  }
  if (action.panicStep) state.morale = Math.max(0, state.morale + action.morale);
  if (action.triggerSlot !== undefined) {
    state.defense.triggered += 1;
    const built = buildOptions.find((option) => option.id === state.buildSlots[action.triggerSlot]);
    state.defense.enemyUnits = Math.max(0, state.defense.enemyUnits - Math.max(1, built?.defense || 1));
  }
  if (action.id === "captureIntel") state.nextRaid = "东堤 · 拂晓 · 两路合围";
  if (action.dialogue) OpenDialogue(action.dialogue, action.role ? roleDefinitions[action.role].name : roleDefinitions[state.selectedRole].name);
  EvaluateProgress(action);
  UpdateUi();
}

function EvaluateProgress(action) {
  if (state.levelIndex === 0) {
    if (state.phaseId === "collect" && requiredCollect.every((id) => state.completed.has(id))) {
      SetPhase("build", "第一轮 · 天明", "东西齐了。先把风道通开，再安闸。人在下头，得先喘得上气。", "队长");
    } else if (state.phaseId === "defense" && action.id === "triggerSlotC") {
      SetPhase("outcome", "扫荡队撤离", "别追了。先挨个问一声，人都在不在。", "队长");
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
  const title = ["村庄开始像一张会呼吸的网", "没有一个名字被留在封锁线内", "敌人的地图变成下一轮准备时间"][state.levelIndex];
  ui.completeTitle.textContent = `${state.level.title} · 循环闭合`;
  ui.completeSummary.textContent = title;
  const ledgers = state.levelIndex === 0
    ? [["通风", state.defense.ventilation], ["防御", state.defense.strength], ["剩余敌队", `${state.defense.enemyUnits}（撤离/受困）`], ["下一轮", "缴获物资用于加深支洞"]]
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
  UpdateQaReadout();
}

function RenderQaPanel() {
  if (!qaMode) return;
  Show(ui.qaPanel);
  ui.qaLevelButtons.innerHTML = levelDefinitions.map((level, index) => `<button type="button" data-qa-level="${index}" class="${index === state.levelIndex ? "active" : ""}">${level.number} ${level.title}</button>`).join("");
  ui.qaPhaseButtons.innerHTML = state.level.phases.map((phase) => `<button type="button" data-qa-phase="${phase.id}" class="${phase.id === state.phaseId ? "active" : ""}">${phase.label}</button>`).join("");
  ui.qaLevelButtons.querySelectorAll("[data-qa-level]").forEach((button) => button.addEventListener("click", () => {
    StartLevel(Number(button.dataset.qaLevel));
    EndCinematic();
    ui.qaPanel.open = true;
    RenderQaPanel();
  }));
  ui.qaPhaseButtons.querySelectorAll("[data-qa-phase]").forEach((button) => button.addEventListener("click", () => QaJumpToPhase(button.dataset.qaPhase)));
  UpdateQaReadout();
}

function UpdateQaReadout() {
  if (!qaMode || !ui.qaStateReadout) return;
  ui.qaStateReadout.textContent = `${state.level.id} / ${state.phaseId} · x ${state.player.x.toFixed(1)} · ${state.player.layer} · ${roleDefinitions[state.selectedRole].short}`;
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
      state.buildSlots = ["flipGate", "smokeBaffle", "floodGate"];
      state.resources.wood = 1; state.resources.iron = 1;
      QaComplete(["buildSlotA", "buildSlotB", "buildSlotC", "startDefense"]);
      RecalculateBuild();
      state.player.x = -8.7;
    }
    if (phaseIndex >= 3) {
      QaComplete(["placeDecoyCart", "closeSurfaceGate", "triggerSlotA", "triggerSlotB", "triggerSlotC"]);
      state.defense.triggered = 3; state.defense.enemyUnits = 0;
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
  Show(ui.titleScreen, false); Show(ui.levelPanel, false); Show(ui.levelComplete, false); Show(ui.dialoguePanel, false); Show(ui.buildPanel, false);
  Show(ui.cinematicBars, false); Show(ui.cinematicCaption, false); Show(ui.skipCinematic, false);
  Show(ui.gameHeader); Show(ui.objectiveCard); Show(ui.metricsPanel); Show(ui.roleDock, state.level.roleIds.length > 1);
  ui.levelNumber.textContent = state.level.number; ui.levelName.textContent = state.level.title;
  RenderRoleDock(); RenderQaPanel(); UpdateUi();
  ui.qaPanel.open = true;
  Toast(`DEBUG：已跳到 ${phase.label}，前置状态已补齐。`, "success");
}

function ContextHint() {
  const action = FindNearestAction();
  if (action?.role && action.role !== state.selectedRole) return `需要：${roleDefinitions[action.role].name}`;
  if (action?.cover && GetActiveCover()?.id !== action.cover) {
    const cover = GetSurfaceCovers().find((item) => item.id === action.cover);
    return `先藏到${cover?.label || "场景遮挡"}后`;
  }
  if (state.levelIndex === 0 && state.phaseId === "build") return `通风 ${state.defense.ventilation}/3 · 防御 ${state.defense.strength}/4`;
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
    if (state.phaseId === "collect") {
      const carried = state.level.actions.filter((action) => action.phase === "collect" && action.prop?.mode === "take" && state.completed.has(action.id)).map((action) => action.prop.label);
      return [resources, Metric("已携带", `${carried.length}/4`, carried.join(" · ") || "靠近场景中的实物后拿取", carried.length / 4 * 100, false, "包")].join("");
    }
    if (state.phaseId === "build") return [resources, Metric("通风", state.defense.ventilation, "安全线 ≥ 3", state.defense.ventilation / 5 * 100, false, "风"), Metric("防御", state.defense.strength, "安全线 ≥ 4", state.defense.strength / 6 * 100, false, "守")].join("");
    return [Metric("敌队", state.defense.enemyUnits, "受困或撤离后的剩余人数", state.defense.enemyUnits / 6 * 100, true, "敌"), Metric("通风", state.defense.ventilation, "安全线 ≥ 3", state.defense.ventilation / 5 * 100, false, "风"), Metric("防御", state.defense.strength, "安全线 ≥ 4", state.defense.strength / 6 * 100, false, "守")].join("");
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
  else if (state.levelIndex === 1 && state.player.layer === "surface") bases = [2.4, 5.6, 8.8];
  else if (state.levelIndex === 2) bases = [-2.2, 2.1, 6.2, 9.2].slice(0, Math.max(2, Math.ceil(state.morale / 25)));
  return bases.map((base, index) => {
    const time = state.elapsed * (.42 + index * .035) + index * 1.7;
    const travel = Math.sin(time) * (index % 2 ? 1.05 : 1.25);
    return { x: base + travel, facing: Math.cos(time) >= 0 ? 1 : -1, viewDistance: state.levelIndex === 2 ? 4.4 : 3.8, index };
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
  DrawSurfaceCovers(width, surfaceY, false);
  DrawEarth(width, height, surfaceY, tunnelY);
  DrawEntrances(width, height, surfaceY, tunnelY);
  DrawTunnelSystems(width, height, surfaceY, tunnelY);
  DrawActionProps(width, height, surfaceY, tunnelY, false);
  DrawActions(width, height, surfaceY, tunnelY);
  DrawEnemies(width, surfaceY);
  DrawActor(width, height, surfaceY, tunnelY);
  DrawSurfaceCovers(width, surfaceY, true);
  DrawActionProps(width, height, surfaceY, tunnelY, true);
  DrawPickupTransfer(width, height, surfaceY, tunnelY);
  DrawSurfaceVegetation(width, height, surfaceY);
  DrawActorVisibilityHud(width, surfaceY);
  DrawDetectionFlash(width, height, surfaceY);
  DrawDepthHint(width, height, surfaceY, tunnelY);
  if (qaMode) DrawQa(width, height, surfaceY, tunnelY);
}

function DrawSky(width, height, surfaceY, daylight) {
  const gradient = context.createLinearGradient(0, 0, 0, surfaceY);
  gradient.addColorStop(0, daylight > .4 ? "#96a4a0" : "#16242d");
  gradient.addColorStop(1, daylight > .4 ? "#d0c5a4" : "#493f3e");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = daylight > .4 ? "rgba(237,214,154,.38)" : "rgba(202,218,207,.18)";
  context.beginPath(); context.arc(width * .78, surfaceY * .25, 34, 0, Math.PI * 2); context.fill();
  for (let layer = 0; layer < 3; layer += 1) {
    context.beginPath();
    context.moveTo(0, surfaceY);
    for (let x = 0; x <= width + 80; x += 80) {
      const offset = state.camera.x * width * (.012 + layer * .009);
      const y = surfaceY * (.68 + layer * .07) + Math.sin((x + offset) * .012 + layer) * (15 + layer * 5);
      context.lineTo(x, y);
    }
    context.lineTo(width, surfaceY); context.closePath();
    context.fillStyle = ["rgba(35,50,50,.34)", "rgba(42,53,49,.52)", "rgba(55,57,48,.72)"][layer]; context.fill();
  }
}

function DrawVillage(width, height, surfaceY) {
  const rearHouses = [-15, -10.8, -6.7, -2.4, 2.1, 6.5, 10.9, 15.2];
  context.save();
  context.globalAlpha = .44;
  rearHouses.forEach((worldX, index) => {
    const screenX = LayerToScreen(worldX, width, .42);
    const size = 38 + (index % 3) * 5;
    const baseY = surfaceY - 34 - (index % 2) * 5;
    context.fillStyle = "#505248";
    context.fillRect(screenX - size * .58, baseY - size * .52, size * 1.16, size * .52);
    context.fillStyle = "#343d3a";
    context.beginPath(); context.moveTo(screenX - size * .72, baseY - size * .52); context.lineTo(screenX, baseY - size * .82); context.lineTo(screenX + size * .72, baseY - size * .52); context.closePath(); context.fill();
  });
  context.strokeStyle = "rgba(53,56,47,.52)"; context.lineWidth = 3;
  for (let row = 0; row < 2; row += 1) {
    const y = surfaceY - 17 - row * 13;
    context.beginPath(); context.moveTo(0, y);
    for (let x = 0; x <= width; x += 55) context.lineTo(x, y + Math.sin(x * .025 + row) * 3);
    context.stroke();
  }
  context.restore();

  const houses = [-9, -5.2, -.2, 4.4, 8.3];
  houses.forEach((x, index) => {
    const screenX = LayerToScreen(x, width, .76);
    const size = 55 + (index % 2) * 12;
    context.fillStyle = index % 2 ? "#6d5a48" : "#75604c";
    context.fillRect(screenX - size * .55, surfaceY - size * .72, size * 1.1, size * .72);
    context.fillStyle = "#3e3430";
    context.beginPath(); context.moveTo(screenX - size * .72, surfaceY - size * .72); context.lineTo(screenX, surfaceY - size * 1.06); context.lineTo(screenX + size * .72, surfaceY - size * .72); context.closePath(); context.fill();
    context.fillStyle = "#221f1d"; context.fillRect(screenX - 8, surfaceY - 27, 16, 27);
    context.strokeStyle = "rgba(224,199,147,.16)"; context.lineWidth = 2;
    context.beginPath(); context.moveTo(screenX - size * .45, surfaceY - size * .5); context.lineTo(screenX + size * .45, surfaceY - size * .45); context.stroke();
  });
  context.fillStyle = "#504936";
  context.fillRect(0, surfaceY - 5, width, 12);
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
  context.fillStyle = "#111819"; context.fill();
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

function DrawTunnelDepth(width, height, tunnelY) {
  const branches = [
    { x: -8.45, width: 1.25, height: 47 },
    { x: .15, width: 1.55, height: 55 },
    { x: 7.15, width: 1.3, height: 50 }
  ];
  branches.forEach((branch, branchIndex) => {
    const x = LayerToScreen(branch.x, width, .92);
    const floorY = TunnelFloorYAt(branch.x, height, tunnelY) - 5;
    const branchWidth = width / 22 * branch.width;
    const topY = floorY - branch.height;
    const shade = context.createLinearGradient(x, floorY, x, topY);
    shade.addColorStop(0, "rgba(35,48,47,.92)"); shade.addColorStop(1, "rgba(19,27,29,.96)");
    context.fillStyle = shade;
    context.beginPath(); context.moveTo(x - branchWidth * .58, floorY); context.lineTo(x - branchWidth * .44, topY + 10); context.quadraticCurveTo(x, topY - 12, x + branchWidth * .44, topY + 10); context.lineTo(x + branchWidth * .58, floorY); context.closePath(); context.fill();
    for (let frame = 0; frame < 3; frame += 1) {
      const inset = frame * branchWidth * .12;
      context.strokeStyle = `rgba(152,112,69,${.45 - frame * .1})`; context.lineWidth = Math.max(2, 5 - frame);
      context.beginPath(); context.moveTo(x - branchWidth * .5 + inset, floorY - frame * 4); context.lineTo(x - branchWidth * .38 + inset, topY + 12 + frame * 5); context.quadraticCurveTo(x, topY - 7 + frame * 5, x + branchWidth * .38 - inset, topY + 12 + frame * 5); context.lineTo(x + branchWidth * .5 - inset, floorY - frame * 4); context.stroke();
    }
    context.fillStyle = branchIndex === 1 ? "rgba(202,166,92,.23)" : "rgba(89,157,150,.12)";
    context.beginPath(); context.ellipse(x, floorY - 8, branchWidth * .34, 7, 0, 0, Math.PI * 2); context.fill();
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
    { x: -9.25, kind: "basket" }, { x: -2.45, kind: "crate" }, { x: 1.15, kind: "lamp" }, { x: 6.45, kind: "jars" }
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
    } else {
      context.fillStyle = "#70513c"; context.beginPath(); context.ellipse(x - 7, floorY - 8, 7, 9, 0, 0, Math.PI * 2); context.ellipse(x + 7, floorY - 6, 6, 7, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#a77e54"; context.lineWidth = 2; context.beginPath(); context.moveTo(x - 12, floorY - 12); context.lineTo(x - 2, floorY - 12); context.moveTo(x + 2, floorY - 10); context.lineTo(x + 12, floorY - 10); context.stroke();
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

  if (state.buildSlots.includes("floodGate")) {
    context.strokeStyle = "rgba(78,169,190,.72)"; context.lineWidth = 5; context.lineCap = "round";
    context.beginPath();
    for (let worldX = -9; worldX <= 9; worldX += .4) {
      const screenX = WorldToScreen(worldX, width); const y = TunnelFloorYAt(worldX, height, tunnelY) - 7;
      worldX === -9 ? context.moveTo(screenX, y) : context.lineTo(screenX, y);
    }
    context.stroke();
    for (let index = 0; index < 9; index += 1) {
      const progress = (state.elapsed * .16 + index / 9) % 1; const worldX = Lerp(8.5, -8.5, progress);
      context.fillStyle = "rgba(158,230,235,.85)"; context.beginPath(); context.arc(WorldToScreen(worldX, width), TunnelFloorYAt(worldX, height, tunnelY) - 7, 2.5, 0, Math.PI * 2); context.fill();
    }
  }

  if (["defense", "outcome"].includes(state.phaseId)) {
    const hasBaffle = state.buildSlots.includes("smokeBaffle");
    const smokeCount = hasBaffle ? 14 : 11;
    for (let index = 0; index < smokeCount; index += 1) {
      const progress = (state.elapsed * .09 + index / smokeCount) % 1;
      let worldX;
      let y;
      if (hasBaffle && progress > .66) {
        const rise = (progress - .66) / .34;
        worldX = exhaustX + Math.sin(index * 2.3 + state.elapsed * 1.7) * .08;
        const tunnelMouthY = TunnelCeilingYAt(exhaustX, height, tunnelY) + 2;
        y = Lerp(tunnelMouthY, surfaceY - 52, rise);
      } else {
        const run = hasBaffle ? progress / .66 : progress;
        worldX = Lerp(8.7, hasBaffle ? exhaustX : -7.5, run);
        y = TunnelCenterYAt(worldX, tunnelY) - 19 + Math.sin(index * 1.8 + state.elapsed * 1.6) * 7;
      }
      const size = 8 + (index % 4) * 2.2;
      context.fillStyle = hasBaffle ? "rgba(165,174,166,.52)" : "rgba(129,116,103,.62)";
      context.beginPath(); context.arc(WorldToScreen(worldX, width), y, size, 0, Math.PI * 2); context.fill();
      context.fillStyle = hasBaffle ? "rgba(200,207,199,.18)" : "rgba(174,155,137,.18)";
      context.beginPath(); context.arc(WorldToScreen(worldX, width) - size * .38, y - size * .24, size * .64, 0, Math.PI * 2); context.fill();
    }

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
    if (qaMode) {
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
    gradient.addColorStop(0, active ? "rgba(229,58,44,.5)" : "rgba(215,184,103,.15)");
    gradient.addColorStop(1, active ? "rgba(195,43,34,.08)" : "rgba(215,184,103,0)");
    context.fillStyle = gradient;
    context.beginPath(); context.moveTo(x + enemy.facing * height * .12, baseY - height * .69); context.lineTo(endX, surfaceY + 3); context.lineTo(x + enemy.facing * height * .18, surfaceY + 3); context.closePath(); context.fill();
    context.strokeStyle = active ? "rgba(255,91,69,.95)" : "rgba(219,186,104,.22)"; context.lineWidth = active ? 3 : 1;
    context.beginPath(); context.moveTo(x + enemy.facing * height * .12, baseY - height * .69); context.lineTo(endX, surfaceY + 3); context.stroke();
  });
  patrols.forEach((enemy) => {
      const i = enemy.index;
      const x = WorldToScreen(enemy.x, width);
      const baseY = surfaceY - 5;
      const stride = Math.sin(state.elapsed * 4 + i) * height * .06;
      context.fillStyle = "rgba(0,0,0,.28)"; context.beginPath(); context.ellipse(x, baseY + 2, height * .2, 5, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#6e3e38"; context.lineCap = "round"; context.lineWidth = Math.max(6, height * .08);
      context.beginPath(); context.moveTo(x - height * .05, baseY - height * .34); context.lineTo(x - height * .08 + stride, baseY); context.moveTo(x + height * .05, baseY - height * .34); context.lineTo(x + height * .08 - stride, baseY); context.stroke();
      context.fillStyle = "#78443d"; context.beginPath(); context.moveTo(x - height * .18, baseY - height * .72); context.lineTo(x + height * .18, baseY - height * .72); context.lineTo(x + height * .15, baseY - height * .3); context.lineTo(x - height * .15, baseY - height * .3); context.closePath(); context.fill();
      context.fillStyle = "#b56c5d"; context.beginPath(); context.arc(x, baseY - height * .86, height * profile.head, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#4d302d"; context.fillRect(x - height * .12, baseY - height * .94, height * .24, height * .045);
      context.strokeStyle = "#78443d"; context.lineWidth = Math.max(5, height * .055); context.beginPath(); context.moveTo(x - height * .13, baseY - height * .64); context.lineTo(x - height * .26, baseY - height * .4); context.moveTo(x + height * .13, baseY - height * .64); context.lineTo(x + height * .26, baseY - height * .42); context.stroke();
      context.fillStyle = "#d3aa63"; context.beginPath(); context.arc(x + enemy.facing * height * .16, baseY - height * .69, 3, 0, Math.PI * 2); context.fill();
  });
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
  DrawJointedLimb(-height * .085, -height * .34, height * .2, height * .18, rearLeg, -rearLeg * .35, profile.pants, Math.max(6, height * .07));
  DrawJointedLimb(height * .085, -height * .34, height * .2, height * .18, frontLeg, -frontLeg * .35, profile.pants, Math.max(6, height * .07));

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

  DrawJointedLimb(-height * profile.shoulder * .48, -height * .65, height * .2, height * .17, rearArm, rearForearm, profile.body, Math.max(5, height * .055));

  context.fillStyle = profile.body;
  context.beginPath(); context.moveTo(-height * profile.shoulder * .56, -height * .72); context.quadraticCurveTo(0, -height * .77, height * profile.shoulder * .56, -height * .72); context.lineTo(height * .2, -height * .32); context.lineTo(-height * .2, -height * .32); context.closePath(); context.fill();
  context.fillStyle = "rgba(255,255,255,.12)"; context.beginPath(); context.moveTo(-height * profile.shoulder * .42, -height * .69); context.lineTo(-height * .03, -height * .71); context.lineTo(-height * .03, -height * .35); context.lineTo(-height * .17, -height * .34); context.closePath(); context.fill();
  context.fillStyle = profile.accent; context.fillRect(-height * .21, -height * .39, height * .42, Math.max(3, height * .035));
  if (roleId === "blacksmith") { context.fillStyle = profile.accent; context.beginPath(); context.moveTo(-height * .18, -height * .62); context.lineTo(height * .18, -height * .62); context.lineTo(height * .24, -height * .3); context.lineTo(-height * .24, -height * .3); context.closePath(); context.fill(); }
  if (roleId === "rescuer") { context.strokeStyle = profile.accent; context.lineWidth = 3; context.beginPath(); context.moveTo(-height * .16, -height * .54); context.lineTo(height * .16, -height * .54); context.stroke(); }
  if (roleId === "scout") {
    context.strokeStyle = "rgba(218,226,209,.68)"; context.lineWidth = 2;
    context.beginPath(); context.moveTo(-height * .16, -height * .66); context.lineTo(height * .15, -height * .37); context.stroke();
    context.fillStyle = "#4b5f59"; context.fillRect(-height * .29, -height * .42, height * .19, height * .2);
    context.strokeStyle = "#9aa894"; context.strokeRect(-height * .29, -height * .42, height * .19, height * .2);
  }

  DrawRoleProp(profile, roleId, height, actionLift);
  DrawJointedLimb(height * profile.shoulder * .48, -height * .65, height * .2, height * .17, frontArm, frontForearm, profile.body, Math.max(5, height * .055));

  const headY = -height * .86;
  const headRadius = height * profile.head;
  context.fillStyle = profile.skin; context.beginPath(); context.arc(0, headY, headRadius, 0, Math.PI * 2); context.fill();
  context.fillStyle = "rgba(87,49,36,.68)"; context.beginPath(); context.arc(headRadius * .4, headY + headRadius * .12, Math.max(1.5, headRadius * .12), 0, Math.PI * 2); context.fill();
  DrawHeadwear(profile, roleId, height, headY, headRadius);
}

function DrawDogActor(profile, height) {
  const phase = state.player.step * profile.gait;
  const moving = state.player.motionBlend;
  const sniff = state.player.actionKind === "crawl" || !moving ? (.5 + Math.sin(state.elapsed * 2.8) * .5) : 0;
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

function DrawActor(width, viewportHeight, surfaceY, tunnelY) {
  const roleId = state.selectedRole;
  const profile = actorProfiles[roleId];
  const role = roleDefinitions[roleId];
  const x = WorldToScreen(state.player.x, width);
  const baseY = state.player.layer === "surface" ? surfaceY - 5 : TunnelFloorYAt(state.player.x, viewportHeight, tunnelY);
  const scale = Math.min(width, 1100) / 26 * .038;
  const height = profile.height * 39 * scale;
  context.save(); context.translate(x, baseY); context.scale(state.player.facing, 1);
  if (profile.animal) DrawDogActor(profile, height);
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
ui.startButton.addEventListener("click", () => StartLevel(selectedLevel));
ui.guideButton.addEventListener("click", () => Show(ui.guidePanel));
ui.menuButton.addEventListener("click", OpenLevelPanel);
ui.dialogueNext.addEventListener("click", CloseDialogue);
ui.buildCancel.addEventListener("click", () => Show(ui.buildPanel, false));
ui.skipCinematic.addEventListener("click", EndCinematic);
ui.replayButton.addEventListener("click", () => StartLevel(state.levelIndex));
ui.nextLevelButton.addEventListener("click", () => StartLevel((state.levelIndex + 1) % levelDefinitions.length));
ui.completeLevelsButton.addEventListener("click", () => { Show(ui.levelComplete, false); OpenLevelPanel(); });
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
    getState: () => ({
      level: state.level.id, phase: state.phaseId, x: state.player.x, layer: state.player.layer,
      role: state.selectedRole, completed: [...state.completed], resources: { ...state.resources }, buildSlots: [...state.buildSlots],
      ventilation: state.defense.ventilation, defense: state.defense.strength, rescues: { ...state.rescues }, memories: [...state.memories],
      visibility: state.visibility, detection: state.detection, detected: state.detected, cover: state.player.coverId,
      alert: state.alert, morale: state.morale, tricks: [...state.tricks]
    })
  });
}

RenderLevelSelectors();
RenderQaPanel();
requestAnimationFrame(Loop);
