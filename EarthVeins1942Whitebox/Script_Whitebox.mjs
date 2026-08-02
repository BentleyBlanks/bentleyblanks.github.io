import { actorProfiles, roleDefinitions, buildOptions, levelDefinitions } from "./Data_WhiteboxCampaign.mjs";

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
].map((id) => [id, document.querySelector(`#${id}`)]));

const qaMode = new URLSearchParams(location.search).get("qa") === "1";
const startingLevel = Math.max(0, Math.min(2, Number(new URLSearchParams(location.search).get("level")) || 0));
const worldMin = -11;
const worldMax = 11;
const entrances = [-1.1, 8.6];
const requiredCollect = ["collectWood", "collectIron", "collectPowder", "collectSupplies"];
const requiredRescues = ["wounded", "grain", "courier"];
const inputKeys = { left: false, right: false, crouch: false };
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
    player: { x: level.startX, layer: level.phases[0].layer, facing: 1, crouch: false, step: 0 },
    selectedRole: level.startRole,
    completed: new Set(),
    resources: { wood: 0, iron: 0, powder: 0, medicine: 0, grain: 0 },
    buildSlots: [null, null, null],
    defense: { ventilation: 0, strength: 0, enemyUnits: 6, triggered: 0 },
    rescues: { wounded: false, grain: false, courier: false },
    memories: [],
    exposure: 0,
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
  UpdateUi();
  const opener = state.levelIndex === 0
    ? ["第一轮 · 夜", "民兵队长", "先把能救命、能施工的东西带回地道。枪声不是今晚的办法。"]
    : state.levelIndex === 1
      ? ["封锁线外", "五个同行者", "每个人只会一件事。少了任何一个，伤员都过不了村口。"]
      : ["扫荡第三日", "武工队员", "让他们追声音、追影子、追自己的恐惧；我们不在任何一次响动后停留。"];
  PlayCinematic(...opener, 2.8, state.player.x + 2.2, 1.16);
}

function OpenLevelPanel() {
  Show(ui.levelPanel);
  RenderLevelSelectors();
}

function RenderRoleDock() {
  ui.roleButtons.innerHTML = state.level.roleIds.map((roleId) => {
    const role = roleDefinitions[roleId];
    return `<button type="button" data-role="${roleId}" class="${state.selectedRole === roleId ? "active" : ""}">
      <span class="roleDot" style="--role:${actorProfiles[roleId].color}"></span><b>${role.short}</b><small>${role.skill}</small>
    </button>`;
  }).join("");
  ui.roleButtons.querySelectorAll("[data-role]").forEach((button) => button.addEventListener("click", () => SelectRole(button.dataset.role)));
}

function SelectRole(roleId) {
  if (!state.level.roleIds.includes(roleId) || IsBlocked()) return;
  state.selectedRole = roleId;
  RenderRoleDock();
  UpdateUi();
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
    Toast(entrance !== undefined ? "这里可用“地层切换”，不是行动键。" : "靠近发光的现场标记后再行动。", "neutral");
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
  if (action.crouch && !(state.player.crouch || inputKeys.crouch)) {
    Toast("这里暴露太高，先蹲伏再行动。", "warning");
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
    SetPhase("defense", "第二轮 · 扫荡入村", "机关不是终点。现在要把敌队引到没有群众的空院，再逐段关闸。", "队长");
    return;
  }
  ApplyAction(action);
}

function ApplyAction(action) {
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
      SetPhase("build", "第一轮 · 天明", "物资到齐。三处机关必须同时兼顾风路和分割能力。", "施工组");
    } else if (state.phaseId === "defense" && action.id === "triggerSlotC") {
      SetPhase("outcome", "扫荡队撤离", "没有追击。先确认群众安全，再清点空院里遗下的物资。", "队长");
    }
  } else if (state.levelIndex === 1) {
    if (state.phaseId === "survey" && state.completed.has("markPatrol")) {
      SetPhase("cooperate", "十一秒暗区", "路已经看清，但门不会自己打开。让每个人接住上一人的工作。", "叶星");
    } else if (state.phaseId === "cooperate" && state.completed.has("unbarGate")) {
      SetPhase("transfer", "门后不是终点", "伤员、粮食和联络员都要过去。遗物可以找，生命不能等。", "赵禾");
    } else if (state.phaseId === "transfer" && requiredRescues.every((key) => state.rescues[key])) {
      SetPhase("outcome", "东翻口已接通", "逐名清点。最后一个人离开时，要把门闩恢复成没人来过的样子。", "石头");
    }
  } else if (state.levelIndex === 2) {
    if (state.phaseId === "harass" && state.tricks.size >= 3 && state.morale <= 55) {
      SetPhase("panic", "士气断点", "他们开始拒绝进屋、互相照射。把错误判断连成一条退路。", "林青禾");
    } else if (state.phaseId === "panic" && action.id === "finalSignal") {
      SetPhase("outcome", "队形自行瓦解", "不追。等脚步远离村口，再从地道收取他们丢下的情报。", "林青禾");
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

function ToggleLayer() {
  if (IsBlocked()) return;
  const entrance = entrances.find((x) => Math.abs(x - state.player.x) <= 1.15);
  if (entrance === undefined) return Toast("需要靠近蓝色地道入口。", "neutral");
  state.player.layer = state.player.layer === "surface" ? "tunnel" : "surface";
  if (state.player.layer === "tunnel") state.alert = Math.max(0, state.alert - 8);
  Toast(state.player.layer === "tunnel" ? "进入地道：地表警觉开始回落。" : "回到地表：注意巡逻与暴露。", "neutral");
  UpdateUi();
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
  return state.mode !== "play" || state.cinematic || !ui.dialoguePanel.hidden || !ui.buildPanel.hidden || !ui.levelPanel.hidden || !ui.guidePanel.hidden;
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
    ui.interactionName.textContent = action.title;
  }
  ui.gameShell.dataset.layer = state.player.layer;
  ui.gameShell.dataset.level = state.level.id;
  const depthButton = document.querySelector('[data-input="depth"] span');
  if (depthButton) depthButton.textContent = state.player.layer === "surface" ? "下行" : "上行";
}

function ContextHint() {
  const action = FindNearestAction();
  if (action?.role && action.role !== state.selectedRole) return `需要：${roleDefinitions[action.role].name}`;
  if (action?.crouch && !state.player.crouch) return "此处需先蹲伏";
  if (state.levelIndex === 0 && state.phaseId === "build") return `通风 ${state.defense.ventilation}/3 · 防御 ${state.defense.strength}/4`;
  if (state.levelIndex === 2 && state.phaseId === "harass") return `至少 3 种诡计且士气 ≤ 55；已用 ${state.tricks.size} 种`;
  return `${roleDefinitions[state.selectedRole].name} · ${state.player.layer === "surface" ? "地表" : "地道"}`;
}

function Metric(label, value, detail = "", meter = null, inverse = false) {
  const fill = meter === null ? "" : `<i class="metricBar"><u style="width:${Math.max(0, Math.min(100, meter))}%" class="${inverse ? "inverse" : ""}"></u></i>`;
  return `<div class="metric"><small>${label}</small><b>${value}</b>${detail ? `<span>${detail}</span>` : ""}${fill}</div>`;
}

function MetricsMarkup() {
  if (state.levelIndex === 0) return [
    Metric("施工物资", `木 ${state.resources.wood} · 铁 ${state.resources.iron}`, `硝灰 ${state.resources.powder} / 药 ${state.resources.medicine} / 粮 ${state.resources.grain}`),
    Metric("地道通风", state.defense.ventilation, "安全线 ≥ 3", state.defense.ventilation / 5 * 100),
    Metric("分割防御", state.defense.strength, `剩余敌队 ${state.defense.enemyUnits}`, state.defense.strength / 6 * 100),
    Metric("夜间暴露", Math.round(state.exposure), state.player.crouch ? "蹲伏中" : "站立移动", state.exposure, true)
  ].join("");
  if (state.levelIndex === 1) return [
    Metric("当前角色", roleDefinitions[state.selectedRole].short, roleDefinitions[state.selectedRole].skill),
    Metric("安全转移", requiredRescues.filter((key) => state.rescues[key]).length + " / 3", "伤员 · 粮食 · 联络员", requiredRescues.filter((key) => state.rescues[key]).length / 3 * 100),
    Metric("记忆物", `${state.memories.length} / 2`, state.memories.join(" · ") || "可选，不阻塞转移"),
    Metric("协作链", `${state.completed.size}`, "每一步需要特定人物")
  ].join("");
  return [
    Metric("敌方警觉", Math.round(state.alert), state.player.layer === "tunnel" ? "正在回落" : state.player.crouch ? "增长减缓" : "地表暴露", state.alert, true),
    Metric("敌方士气", Math.round(state.morale), state.morale <= 55 ? "已到恐慌断点" : "继续制造矛盾信息", state.morale),
    Metric("不同诡计", `${state.tricks.size} / 3`, "重复同一种异常不会加速循环", state.tricks.size / 3 * 100),
    Metric("AI 状态", state.phaseId === "harass" ? "搜索" : state.phaseId === "panic" ? "恐慌连锁" : "撤离", state.nextRaid || "拒绝入屋值随士气下降")
  ].join("");
}

function Update(delta) {
  state.elapsed += delta;
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
  if (state.mode !== "play" || IsBlocked()) return;
  state.player.crouch = inputKeys.crouch;
  const direction = Number(inputKeys.right) - Number(inputKeys.left);
  if (direction) {
    state.player.facing = direction;
    state.player.x = Math.max(worldMin, Math.min(worldMax, state.player.x + direction * delta * (state.player.crouch ? 2.25 : 3.55)));
    state.player.step += delta * (state.player.crouch ? 6 : 9);
  }
  const targetX = Math.max(worldMin + 4, Math.min(worldMax - 4, state.player.x + state.player.facing * .7));
  state.camera.x = Lerp(state.camera.x, targetX, 1 - Math.pow(.002, delta));
  state.camera.zoom = Lerp(state.camera.zoom, 1, 1 - Math.pow(.01, delta));
  UpdateDanger(delta, direction);
  UpdateUi();
}

function UpdateDanger(delta, direction) {
  if (state.player.layer === "surface" && state.levelIndex === 0 && state.phaseId === "collect") {
    const inPatrol = Math.abs(state.player.x - 2.7) < 3.2 || Math.abs(state.player.x + 6) < 1.7;
    const rate = inPatrol ? (state.player.crouch ? 4 : direction ? 15 : 9) : -8;
    state.exposure = Math.max(0, Math.min(100, state.exposure + rate * delta));
    if (state.exposure >= 100) {
      state.exposure = 35;
      state.player.x = -10;
      Toast("巡逻灯扫到动静：撤回西侧阴影。已收集物资不会丢失。", "warning");
    }
  }
  if (state.levelIndex === 2) {
    let rate = state.player.layer === "tunnel" ? -10 : state.player.crouch ? -3 : direction ? 3 : .5;
    if (state.phaseId === "panic") rate *= .5;
    state.alert = Math.max(0, Math.min(100, state.alert + rate * delta));
    if (state.alert >= 100) {
      state.alert = 45;
      state.player.x = -1.1;
      state.player.layer = "tunnel";
      Toast("警觉拉满：撤回安全支洞。已完成的诡计仍保留。", "warning");
    }
  }
}

function Lerp(a, b, amount) { return a + (b - a) * amount; }

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

function Draw() {
  const { width, height } = ResizeCanvas();
  const surfaceY = height * .48;
  const tunnelY = height * .76;
  const daylight = state.levelIndex === 0 && state.phaseId === "collect" ? 0 : state.levelIndex === 2 ? .2 : .55;
  DrawSky(width, height, surfaceY, daylight);
  DrawVillage(width, height, surfaceY);
  DrawEarth(width, height, surfaceY, tunnelY);
  DrawActions(width, height, surfaceY, tunnelY);
  DrawEntrances(width, surfaceY, tunnelY);
  DrawEnemies(width, surfaceY);
  DrawActor(width, surfaceY, tunnelY);
  DrawForeground(width, height, surfaceY);
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
      const offset = state.camera.x * (4 + layer * 3);
      const y = surfaceY * (.68 + layer * .07) + Math.sin((x + offset) * .012 + layer) * (15 + layer * 5);
      context.lineTo(x, y);
    }
    context.lineTo(width, surfaceY); context.closePath();
    context.fillStyle = ["rgba(35,50,50,.34)", "rgba(42,53,49,.52)", "rgba(55,57,48,.72)"][layer]; context.fill();
  }
}

function DrawVillage(width, height, surfaceY) {
  const houses = [-9, -5.2, -.2, 4.4, 8.3];
  houses.forEach((x, index) => {
    const screenX = WorldToScreen(x, width);
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
  context.lineWidth = Math.max(34, height * .095); context.lineCap = "round"; context.lineJoin = "round";
  context.strokeStyle = "#171c1c";
  context.beginPath(); context.moveTo(0, tunnelY); context.lineTo(width * .28, tunnelY); context.lineTo(width * .34, tunnelY - 22); context.lineTo(width * .58, tunnelY - 22); context.lineTo(width * .65, tunnelY + 8); context.lineTo(width, tunnelY + 8); context.stroke();
  context.lineWidth = 3; context.strokeStyle = "rgba(203,157,96,.35)"; context.stroke();
  const supportCount = Math.ceil(width / 105);
  context.strokeStyle = "#725637"; context.lineWidth = 5;
  for (let i = 0; i < supportCount; i += 1) {
    const x = i * 105 - ((state.camera.x * 8) % 105);
    context.beginPath(); context.moveTo(x, tunnelY - 35); context.lineTo(x, tunnelY + 35); context.moveTo(x - 14, tunnelY - 34); context.lineTo(x + 14, tunnelY - 34); context.stroke();
  }
}

function DrawActions(width, height, surfaceY, tunnelY) {
  for (const action of state.level.actions) {
    if (action.phase !== state.phaseId || (state.completed.has(action.id) && action.buildSlot === undefined)) continue;
    const x = WorldToScreen(action.x, width);
    const y = action.layer === "surface" ? surfaceY - 10 : tunnelY - 8;
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

function DrawEntrances(width, surfaceY, tunnelY) {
  for (const entrance of entrances) {
    const x = WorldToScreen(entrance, width);
    context.strokeStyle = "rgba(98,196,212,.66)"; context.lineWidth = 4; context.setLineDash([5, 6]);
    context.beginPath(); context.moveTo(x, surfaceY - 3); context.bezierCurveTo(x - 18, surfaceY + 45, x + 18, tunnelY - 46, x, tunnelY); context.stroke(); context.setLineDash([]);
    context.fillStyle = "#5fc6d5"; context.beginPath(); context.arc(x, state.player.layer === "surface" ? surfaceY - 4 : tunnelY, 5, 0, Math.PI * 2); context.fill();
  }
}

function DrawEnemies(width, surfaceY) {
  if (state.levelIndex === 1 || (state.levelIndex === 0 && state.phaseId === "collect") || state.levelIndex === 2) {
    const count = state.levelIndex === 2 ? Math.max(2, Math.ceil(state.morale / 24)) : 3;
    const profile = actorProfiles.soldier;
    const scale = Math.min(width, 1100) / 26 * .038;
    const height = profile.height * 39 * scale;
    for (let i = 0; i < count; i += 1) {
      const patrolX = state.levelIndex === 1 ? 2.2 + i * 2 : state.levelIndex === 2 ? -2 + i * 2.5 : 1 + i * 2.1;
      const x = WorldToScreen(patrolX + Math.sin(state.elapsed * (.45 + i * .08) + i) * 1.3, width);
      const baseY = surfaceY - 5;
      const stride = Math.sin(state.elapsed * 4 + i) * height * .06;
      context.fillStyle = "rgba(0,0,0,.28)"; context.beginPath(); context.ellipse(x, baseY + 2, height * .2, 5, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#6e3e38"; context.lineCap = "round"; context.lineWidth = Math.max(6, height * .08);
      context.beginPath(); context.moveTo(x - height * .05, baseY - height * .34); context.lineTo(x - height * .08 + stride, baseY); context.moveTo(x + height * .05, baseY - height * .34); context.lineTo(x + height * .08 - stride, baseY); context.stroke();
      context.fillStyle = "#78443d"; context.beginPath(); context.moveTo(x - height * .18, baseY - height * .72); context.lineTo(x + height * .18, baseY - height * .72); context.lineTo(x + height * .15, baseY - height * .3); context.lineTo(x - height * .15, baseY - height * .3); context.closePath(); context.fill();
      context.fillStyle = "#b56c5d"; context.beginPath(); context.arc(x, baseY - height * .86, height * profile.head, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#4d302d"; context.fillRect(x - height * .12, baseY - height * .94, height * .24, height * .045);
      context.strokeStyle = "#78443d"; context.lineWidth = Math.max(5, height * .055); context.beginPath(); context.moveTo(x - height * .13, baseY - height * .64); context.lineTo(x - height * .26, baseY - height * .4); context.moveTo(x + height * .13, baseY - height * .64); context.lineTo(x + height * .26, baseY - height * .42); context.stroke();
      context.fillStyle = "rgba(225,196,128,.09)"; context.beginPath(); context.moveTo(x + height * .15, baseY - height * .7); context.lineTo(x + 150, baseY + 10); context.lineTo(x + height * .22, baseY + 10); context.closePath(); context.fill();
    }
  }
}

function DrawActor(width, surfaceY, tunnelY) {
  const profile = actorProfiles[state.selectedRole];
  const x = WorldToScreen(state.player.x, width);
  const baseY = state.player.layer === "surface" ? surfaceY - 5 : tunnelY + 10;
  const scale = Math.min(width, 1100) / 26 * .038;
  const height = profile.height * 39 * scale;
  context.save(); context.translate(x, baseY); context.scale(state.player.facing, 1);
  if (profile.animal) {
    context.fillStyle = profile.color; context.beginPath(); context.ellipse(0, -height * .34, height * .42, height * .2, 0, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.arc(height * .4, -height * .48, height * .16, 0, Math.PI * 2); context.fill();
    context.strokeStyle = profile.color; context.lineWidth = 4; context.beginPath(); context.moveTo(-height * .36, -height * .42); context.quadraticCurveTo(-height * .62, -height * .7, -height * .52, -height * .82); context.stroke();
    context.strokeStyle = "#2b2823"; context.lineWidth = 3; [-.2, .2].forEach((offset) => { context.beginPath(); context.moveTo(height * offset, -height * .22); context.lineTo(height * offset - 2, 0); context.stroke(); });
  } else {
    const crouch = state.player.crouch ? .66 : 1;
    context.scale(1, crouch);
    context.fillStyle = "rgba(0,0,0,.28)"; context.beginPath(); context.ellipse(0, 0, 19, 5, 0, 0, Math.PI * 2); context.fill();
    context.strokeStyle = profile.color; context.lineCap = "round"; context.lineWidth = Math.max(6, height * profile.shoulder * .22);
    const swing = Math.sin(state.player.step) * 8;
    context.beginPath(); context.moveTo(-5, -height * .35); context.lineTo(-7 + swing, -2); context.moveTo(5, -height * .35); context.lineTo(7 - swing, -2); context.stroke();
    context.fillStyle = profile.color; context.beginPath(); context.moveTo(-height * profile.shoulder * .55, -height * .72); context.lineTo(height * profile.shoulder * .55, -height * .72); context.lineTo(height * .2, -height * .28); context.lineTo(-height * .2, -height * .28); context.closePath(); context.fill();
    context.beginPath(); context.arc(0, -height * .86, height * profile.head, 0, Math.PI * 2); context.fill();
    context.strokeStyle = profile.color; context.lineWidth = 5; context.beginPath(); context.moveTo(-height * .14, -height * .64); context.lineTo(-height * .31, -height * .39 + swing * .5); context.moveTo(height * .14, -height * .64); context.lineTo(height * .31, -height * .39 - swing * .5); context.stroke();
  }
  context.restore();
  context.fillStyle = "rgba(9,13,14,.82)"; context.fillRect(x - 31, baseY + 8, 62, 17);
  context.fillStyle = "#edf1e9"; context.font = "600 11px system-ui"; context.textAlign = "center"; context.fillText(roleDefinitions[state.selectedRole].short, x, baseY + 20); context.textAlign = "left";
}

function DrawForeground(width, height, surfaceY) {
  context.strokeStyle = "rgba(22,26,23,.72)"; context.lineWidth = 3;
  for (let x = -20; x < width + 30; x += 31) {
    const sway = Math.sin(state.elapsed * .7 + x) * 4;
    context.beginPath(); context.moveTo(x, height); context.quadraticCurveTo(x + sway, surfaceY + 40, x + 9 + sway, surfaceY - 15); context.stroke();
  }
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
  const down = (event) => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); inputKeys[input] = true; button.classList.add("pressed"); };
  const up = (event) => { event.preventDefault(); inputKeys[input] = false; button.classList.remove("pressed"); if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId); };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("lostpointercapture", () => { inputKeys[input] = false; button.classList.remove("pressed"); });
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

document.querySelectorAll('[data-input="left"], [data-input="right"], [data-input="crouch"]').forEach((button) => BindHoldButton(button, button.dataset.input));
document.querySelector('[data-input="switch"]').addEventListener("click", CycleRole);
document.querySelector('[data-input="depth"]').addEventListener("click", ToggleLayer);
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
  if (["ShiftLeft", "ShiftRight"].includes(event.code)) inputKeys.crouch = true;
  if (event.repeat && ["KeyE", "KeyQ", "KeyS"].includes(event.code)) return;
  if (event.code === "KeyE") PerformAction();
  if (event.code === "KeyQ") CycleRole();
  if (event.code === "KeyS") ToggleLayer();
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
  if (["ShiftLeft", "ShiftRight"].includes(event.code)) inputKeys.crouch = false;
});
window.addEventListener("blur", () => Object.keys(inputKeys).forEach((key) => inputKeys[key] = false));
document.addEventListener("selectstart", (event) => { if (event.target.closest("#gameShell")) event.preventDefault(); });

if (qaMode) {
  window.EarthVeinsWhiteboxQa = Object.freeze({
    startLevel: (index) => StartLevel(Math.max(0, Math.min(2, Number(index) || 0))),
    getState: () => ({
      level: state.level.id, phase: state.phaseId, x: state.player.x, layer: state.player.layer,
      role: state.selectedRole, completed: [...state.completed], resources: { ...state.resources }, buildSlots: [...state.buildSlots],
      ventilation: state.defense.ventilation, defense: state.defense.strength, rescues: { ...state.rescues }, memories: [...state.memories],
      alert: state.alert, morale: state.morale, tricks: [...state.tricks]
    })
  });
}

RenderLevelSelectors();
requestAnimationFrame(Loop);
