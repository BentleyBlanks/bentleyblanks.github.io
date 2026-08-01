import { actorProfiles, campaignData, actorHeightRange } from "./Data_WhiteboxCampaign.mjs";

const canvas = document.querySelector("#gameCanvas");
const context = canvas.getContext("2d", { alpha: false });
const ui = {
  titleScreen: document.querySelector("#titleScreen"),
  startButton: document.querySelector("#startButton"),
  chapterButton: document.querySelector("#chapterButton"),
  guideButton: document.querySelector("#guideButton"),
  chapterPanel: document.querySelector("#chapterPanel"),
  guidePanel: document.querySelector("#guidePanel"),
  chapterList: document.querySelector("#chapterList"),
  gameHeader: document.querySelector("#gameHeader"),
  chapterNumber: document.querySelector("#chapterNumber"),
  chapterName: document.querySelector("#chapterName"),
  layerStatus: document.querySelector("#layerStatus"),
  scaleStatus: document.querySelector("#scaleStatus"),
  progressStatus: document.querySelector("#progressStatus"),
  menuButton: document.querySelector("#menuButton"),
  objectiveCard: document.querySelector("#objectiveCard"),
  objectiveText: document.querySelector("#objectiveText"),
  objectiveHint: document.querySelector("#objectiveHint"),
  suspicionHud: document.querySelector("#suspicionHud"),
  suspicionFill: document.querySelector("#suspicionFill"),
  interactionPrompt: document.querySelector("#interactionPrompt"),
  interactionVerb: document.querySelector("#interactionVerb"),
  interactionName: document.querySelector("#interactionName"),
  dialoguePanel: document.querySelector("#dialoguePanel"),
  dialogueSpeaker: document.querySelector("#dialogueSpeaker"),
  dialogueText: document.querySelector("#dialogueText"),
  dialogueNext: document.querySelector("#dialogueNext"),
  puzzlePanel: document.querySelector("#puzzlePanel"),
  puzzleTitle: document.querySelector("#puzzleTitle"),
  puzzleBrief: document.querySelector("#puzzleBrief"),
  puzzleOptions: document.querySelector("#puzzleOptions"),
  puzzleFeedback: document.querySelector("#puzzleFeedback"),
  puzzleCancel: document.querySelector("#puzzleCancel"),
  chapterComplete: document.querySelector("#chapterComplete"),
  completeTitle: document.querySelector("#completeTitle"),
  completeThesis: document.querySelector("#completeThesis"),
  nextChapterButton: document.querySelector("#nextChapterButton"),
  completeChaptersButton: document.querySelector("#completeChaptersButton"),
  endingPanel: document.querySelector("#endingPanel"),
  endingRestartButton: document.querySelector("#endingRestartButton"),
  endingChaptersButton: document.querySelector("#endingChaptersButton"),
  touchControls: document.querySelector("#touchControls"),
  touchDepthLabel: document.querySelector('[data-input="depth"] span'),
  toast: document.querySelector("#toast")
};

const world = Object.freeze({
  minimumX: -12,
  maximumX: 12,
  surfaceY: 3.25,
  tunnelY: 9.05,
  viewHeight: 11,
  entrances: Object.freeze([-6, 0, 6]),
  coverZones: Object.freeze([-9, -3, 3, 9])
});

const state = {
  mode: "title",
  panelResumeMode: "title",
  sequenceIndex: 0,
  chapter: campaignData[0],
  completed: new Set(),
  player: { x: -10, layer: "surface", facing: 1, crouch: false },
  input: { left: false, right: false, crouch: false },
  observe: false,
  cameraX: 0,
  cameraY: 4.35,
  cameraTargetY: 4.35,
  transition: null,
  nearestAction: null,
  suspicion: 0,
  patrolX: -8.5,
  patrolDirection: 1,
  patrolPause: 0,
  lastSafe: { x: -10, layer: "surface" },
  activePuzzleAction: null,
  dialogueCallback: null,
  toastUntil: 0,
  lastTime: performance.now(),
  elapsed: 0,
  viewport: { width: 1, height: 1, scale: 1, pixelRatio: 1 }
};

const markerGlyphs = Object.freeze({
  bell: "钟", group: "人", choice: "?", hatch: "口", listen: "听", tracks: "迹",
  stretcher: "担", map: "图", proof: "证", cart: "车", vent: "风", signal: "敲",
  soil: "土", timber: "木", lamp: "灯", chalk: "白", coin: "钱"
});

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function SmoothStep(value) {
  const clamped = Clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function GetLayerY(layer) {
  return layer === "surface" ? world.surfaceY : world.tunnelY;
}

function GetPlayerWorldY() {
  if (!state.transition) return GetLayerY(state.player.layer);
  const progress = SmoothStep(state.transition.progress);
  return state.transition.fromY + (state.transition.toY - state.transition.fromY) * progress;
}

function WorldToScreenX(worldX, parallax = 1) {
  const cameraContribution = state.cameraX * parallax;
  return (worldX - cameraContribution) * state.viewport.scale + state.viewport.width * .5;
}

function WorldToScreenY(worldY) {
  return (worldY - state.cameraY) * state.viewport.scale + state.viewport.height * .5;
}

function ResizeCanvas() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  state.viewport = { width, height, pixelRatio, scale: height / world.viewHeight };
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function IsOverlayOpen() {
  return state.mode !== "playing";
}

function ClosePanels() {
  ui.chapterPanel.hidden = true;
  ui.guidePanel.hidden = true;
  ui.puzzlePanel.hidden = true;
  ui.chapterComplete.hidden = true;
}

function BuildChapterList() {
  ui.chapterList.replaceChildren();
  campaignData.forEach((chapter, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapterEntry";
    button.dataset.sequence = String(index);
    const number = document.createElement("b");
    number.textContent = chapter.number;
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = chapter.title;
    const meta = document.createElement("small");
    meta.textContent = `${chapter.act} · ${chapter.date} · ${chapter.location}`;
    const arrow = document.createElement("i");
    arrow.textContent = "›";
    copy.append(title, meta);
    button.append(number, copy, arrow);
    button.addEventListener("click", () => StartSequence(index));
    ui.chapterList.append(button);
  });
}

function ShowChapterPanel() {
  ResetHeldInputs();
  if (state.mode !== "panel") state.panelResumeMode = state.mode;
  state.mode = "panel";
  ui.titleScreen.hidden = true;
  ui.endingPanel.hidden = true;
  ui.chapterComplete.hidden = true;
  ui.dialoguePanel.hidden = true;
  ui.chapterPanel.hidden = false;
  ui.guidePanel.hidden = true;
}

function ShowGuidePanel() {
  ResetHeldInputs();
  if (state.mode !== "panel") state.panelResumeMode = state.mode;
  state.mode = "panel";
  ui.titleScreen.hidden = true;
  ui.endingPanel.hidden = true;
  ui.chapterComplete.hidden = true;
  ui.dialoguePanel.hidden = true;
  ui.guidePanel.hidden = false;
  ui.chapterPanel.hidden = true;
}

function CloseNavigationPanel() {
  ui.chapterPanel.hidden = true;
  ui.guidePanel.hidden = true;
  state.mode = state.panelResumeMode;
  ui.titleScreen.hidden = state.mode !== "title";
  ui.endingPanel.hidden = state.mode !== "ending";
  ui.chapterComplete.hidden = state.mode !== "complete";
  ui.dialoguePanel.hidden = state.mode !== "dialogue";
}

function StartSequence(index) {
  const safeIndex = Clamp(Number(index) || 0, 0, campaignData.length - 1);
  ClosePanels();
  ui.titleScreen.hidden = true;
  ui.endingPanel.hidden = true;
  ui.dialoguePanel.hidden = true;
  state.mode = "playing";
  state.sequenceIndex = safeIndex;
  state.chapter = campaignData[safeIndex];
  state.completed = new Set();
  state.player.x = state.chapter.startX;
  state.player.layer = "surface";
  state.player.facing = 1;
  state.player.crouch = false;
  state.cameraX = Clamp(state.player.x + 2.1, world.minimumX + 3, world.maximumX - 3);
  state.cameraY = 4.35;
  state.cameraTargetY = 4.35;
  state.transition = null;
  state.suspicion = 0;
  state.patrolX = -8.5;
  state.patrolDirection = 1;
  state.patrolPause = 0;
  state.lastSafe = { x: state.player.x, layer: state.player.layer };
  state.activePuzzleAction = null;
  state.observe = new URLSearchParams(location.search).get("observe") === "1";
  ui.gameHeader.hidden = false;
  ui.objectiveCard.hidden = false;
  ui.suspicionHud.hidden = !state.chapter.threat;
  ui.chapterNumber.textContent = state.chapter.number;
  ui.chapterName.textContent = state.chapter.title;
  ui.scaleStatus.textContent = `角色标尺 ${actorHeightRange.minimum.toFixed(2)}–${actorHeightRange.maximum.toFixed(2)}m`;
  UpdateInterface();
  ShowToast(`${state.chapter.number} · ${state.chapter.title}`, 1250);
}

function GetNextAction() {
  return state.chapter.actions.find((action) => !state.completed.has(action.id)) || null;
}

function RequirementsMet(action) {
  return (action.requires || []).every((requirement) => state.completed.has(requirement));
}

function FindNearestAction() {
  if (state.mode !== "playing" || state.transition) return null;
  let nearest = null;
  let nearestDistance = Infinity;
  state.chapter.actions.forEach((action) => {
    if (state.completed.has(action.id) || action.layer !== state.player.layer || !RequirementsMet(action)) return;
    const distance = Math.abs(action.x - state.player.x);
    if (distance <= 1.2 && distance < nearestDistance) {
      nearest = action;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function UpdateInterface() {
  const nextAction = GetNextAction();
  const completedCount = state.completed.size;
  ui.layerStatus.textContent = state.player.layer === "surface" ? "地上" : "地下";
  ui.touchDepthLabel.textContent = state.player.layer === "surface" ? "下行" : "上行";
  ui.progressStatus.textContent = `${completedCount} / ${state.chapter.actions.length}`;
  ui.suspicionFill.style.width = `${Math.round(state.suspicion * 100)}%`;

  if (nextAction) {
    const direction = nextAction.x < state.player.x - .7 ? "向左" : nextAction.x > state.player.x + .7 ? "向右" : "就在附近";
    const targetLayer = nextAction.layer === "surface" ? "地上" : "地下";
    ui.objectiveText.textContent = nextAction.title;
    ui.objectiveHint.textContent = `${targetLayer} · ${direction}${nextAction.crouch ? " · 需要保持蹲伏" : ""}`;
  } else {
    ui.objectiveText.textContent = "这一段路线已经接通";
    ui.objectiveHint.textContent = "等待章节收束";
  }

  state.nearestAction = FindNearestAction();
  if (state.nearestAction) {
    ui.interactionPrompt.hidden = false;
    ui.interactionVerb.textContent = state.nearestAction.verb;
    ui.interactionName.textContent = state.nearestAction.title;
  } else {
    ui.interactionPrompt.hidden = true;
  }
}

function ParseDialogue(line) {
  const separator = line.indexOf("：");
  if (separator < 0) return { speaker: "现场回应", text: line };
  return { speaker: line.slice(0, separator), text: line.slice(separator + 1) };
}

function ShowDialogue(line, callback) {
  const dialogue = ParseDialogue(line);
  ResetHeldInputs();
  state.mode = "dialogue";
  state.dialogueCallback = callback || null;
  ui.dialogueSpeaker.textContent = dialogue.speaker;
  ui.dialogueText.textContent = dialogue.text;
  ui.dialoguePanel.hidden = false;
}

function ContinueDialogue() {
  if (state.mode !== "dialogue") return;
  ui.dialoguePanel.hidden = true;
  const callback = state.dialogueCallback;
  state.dialogueCallback = null;
  if (callback) callback();
  else state.mode = "playing";
  UpdateInterface();
}

function HandleAction() {
  if (state.mode === "dialogue") {
    ContinueDialogue();
    return;
  }
  if (state.mode !== "playing" || state.transition) return;
  const action = FindNearestAction();
  if (!action) {
    const nextAction = GetNextAction();
    if (nextAction && nextAction.layer !== state.player.layer) ShowToast(`目标在${nextAction.layer === "surface" ? "地上" : "地下"}，靠近竖井按 S 切换。`);
    return;
  }
  if (action.crouch && !state.player.crouch) {
    ShowToast("这一步需要保持蹲伏，避免头顶视线或低矮土层。", 1700);
    return;
  }
  if (action.puzzle) OpenPuzzle(action);
  else CompleteAction(action);
}

function OpenPuzzle(action) {
  ResetHeldInputs();
  state.mode = "puzzle";
  state.activePuzzleAction = action;
  ui.puzzleTitle.textContent = action.puzzle.title;
  ui.puzzleBrief.textContent = action.puzzle.brief;
  ui.puzzleFeedback.textContent = "";
  ui.puzzleFeedback.classList.remove("isSuccess");
  ui.puzzleOptions.replaceChildren();
  action.puzzle.options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "puzzleOption";
    button.dataset.option = option.id;
    const label = document.createElement("b");
    label.textContent = option.label;
    const note = document.createElement("span");
    note.textContent = option.note;
    button.append(label, note);
    button.addEventListener("click", () => ResolvePuzzle(option));
    ui.puzzleOptions.append(button);
  });
  ui.puzzlePanel.hidden = false;
}

function ResolvePuzzle(option) {
  const action = state.activePuzzleAction;
  if (!action) return;
  if (option.id !== action.puzzle.correct) {
    ui.puzzleFeedback.textContent = `${option.note} 选择未锁定，现场状态保持不变。`;
    ui.puzzleFeedback.classList.remove("isSuccess");
    return;
  }
  ui.puzzleFeedback.textContent = `${option.note} 因果关系成立。`;
  ui.puzzleFeedback.classList.add("isSuccess");
  window.setTimeout(() => {
    if (state.activePuzzleAction !== action) return;
    ui.puzzlePanel.hidden = true;
    state.activePuzzleAction = null;
    CompleteAction(action);
  }, 360);
}

function CancelPuzzle() {
  if (state.mode !== "puzzle") return;
  ui.puzzlePanel.hidden = true;
  state.activePuzzleAction = null;
  state.mode = "playing";
  UpdateInterface();
}

function CompleteAction(action) {
  state.completed.add(action.id);
  state.lastSafe = { x: state.player.x, layer: state.player.layer };
  state.suspicion = Math.max(0, state.suspicion - .32);
  UpdateInterface();
  ShowDialogue(action.dialogue, () => {
    if (state.completed.size >= state.chapter.actions.length) FinishSequence();
    else state.mode = "playing";
  });
}

function FinishSequence() {
  state.mode = "complete";
  ui.completeTitle.textContent = `${state.chapter.number} · ${state.chapter.title}`;
  ui.completeThesis.textContent = state.chapter.thesis;
  ui.nextChapterButton.textContent = state.sequenceIndex >= campaignData.length - 1 ? "查看白盒结局" : "进入下一章";
  ui.chapterComplete.hidden = false;
}

function GoToNextSequence() {
  if (state.sequenceIndex >= campaignData.length - 1) {
    ui.chapterComplete.hidden = true;
    ui.gameHeader.hidden = true;
    ui.objectiveCard.hidden = true;
    ui.suspicionHud.hidden = true;
    ui.interactionPrompt.hidden = true;
    ui.endingPanel.hidden = false;
    state.mode = "ending";
    return;
  }
  StartSequence(state.sequenceIndex + 1);
}

function GetNearestEntrance() {
  let nearest = null;
  let nearestDistance = Infinity;
  world.entrances.forEach((entranceX) => {
    const distance = Math.abs(state.player.x - entranceX);
    if (distance < nearestDistance) {
      nearest = entranceX;
      nearestDistance = distance;
    }
  });
  return nearestDistance <= 1.1 ? nearest : null;
}

function ToggleDepth() {
  if (state.mode !== "playing" || state.transition) return;
  const entranceX = GetNearestEntrance();
  if (entranceX === null) {
    ShowToast("先走到带蓝色竖线的入口，再切换地上与地下。", 1500);
    return;
  }
  const toLayer = state.player.layer === "surface" ? "tunnel" : "surface";
  state.player.x = entranceX;
  state.transition = {
    progress: 0,
    duration: .72,
    fromY: GetLayerY(state.player.layer),
    toY: GetLayerY(toLayer),
    toLayer
  };
  ResetHeldInputs();
}

function ToggleObserve() {
  if (state.mode !== "playing") return;
  state.observe = !state.observe;
  ShowToast(state.observe ? "观察层开启：显示米制标尺、巡逻范围和依赖线。" : "观察层关闭。", 1100);
}

function IsInsideCover(x) {
  return world.coverZones.some((coverX) => Math.abs(x - coverX) < .72);
}

function UpdatePatrol(delta) {
  if (!state.chapter.threat) {
    state.suspicion = Math.max(0, state.suspicion - delta * .55);
    return;
  }
  if (state.patrolPause > 0) {
    state.patrolPause -= delta;
  } else {
    state.patrolX += state.patrolDirection * delta * 1.42;
    if (state.patrolX > 9.2 || state.patrolX < -9.2) {
      state.patrolX = Clamp(state.patrolX, -9.2, 9.2);
      state.patrolDirection *= -1;
      state.patrolPause = .7;
    }
  }

  const surfaceExposed = state.player.layer === "surface" && !state.transition;
  const horizontalDistance = Math.abs(state.player.x - state.patrolX);
  const facingPlayer = (state.player.x - state.patrolX) * state.patrolDirection > -.4;
  const hidden = state.player.crouch && IsInsideCover(state.player.x);
  const exposed = surfaceExposed && horizontalDistance < 4.2 && facingPlayer && !hidden;
  if (exposed) state.suspicion = Math.min(1, state.suspicion + delta * (state.player.crouch ? .23 : .48));
  else state.suspicion = Math.max(0, state.suspicion - delta * .33);

  if (state.suspicion >= 1) RecoverFromExposure();
}

function RecoverFromExposure() {
  state.suspicion = .12;
  state.player.x = state.lastSafe.x;
  state.player.layer = state.lastSafe.layer;
  state.transition = null;
  state.cameraY = state.player.layer === "surface" ? 4.35 : 5.85;
  ShowToast("暴露度已满：回到最近安全节点，行动进度没有丢失。", 2200);
}

function ResetHeldInputs() {
  state.input.left = false;
  state.input.right = false;
  state.input.crouch = false;
  state.player.crouch = false;
  document.querySelectorAll("#touchControls button.isHeld").forEach((button) => button.classList.remove("isHeld"));
}

function ShowToast(message, duration = 1400) {
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  state.toastUntil = performance.now() + duration;
}

function UpdateToast(now) {
  if (!ui.toast.hidden && now >= state.toastUntil) ui.toast.hidden = true;
}

function Update(delta) {
  if (state.mode !== "playing") return;
  state.elapsed += delta;
  if (state.transition) {
    state.transition.progress += delta / state.transition.duration;
    if (state.transition.progress >= 1) {
      state.player.layer = state.transition.toLayer;
      state.transition = null;
      state.lastSafe = { x: state.player.x, layer: state.player.layer };
    }
  } else {
    const direction = Number(state.input.right) - Number(state.input.left);
    state.player.crouch = state.input.crouch;
    if (direction !== 0) {
      const speed = state.player.crouch ? 2.15 : 4.05;
      state.player.x = Clamp(state.player.x + direction * speed * delta, world.minimumX, world.maximumX);
      state.player.facing = direction;
    }
  }

  UpdatePatrol(delta);
  const cameraTargetX = Clamp(state.player.x + state.player.facing * 1.35, world.minimumX + 4, world.maximumX - 4);
  const depthBlend = state.transition
    ? SmoothStep(state.transition.progress)
    : state.player.layer === "tunnel" ? 1 : 0;
  state.cameraTargetY = 4.35 + depthBlend * 1.5;
  const followX = 1 - Math.exp(-delta / .38);
  const followY = 1 - Math.exp(-delta / (state.transition ? .08 : .32));
  state.cameraX += (cameraTargetX - state.cameraX) * followX;
  state.cameraY += (state.cameraTargetY - state.cameraY) * followY;
  UpdateInterface();
}

function DrawBackground() {
  const { width, height, scale } = state.viewport;
  const surfaceScreenY = WorldToScreenY(world.surfaceY);
  const tunnelTopScreenY = WorldToScreenY(world.tunnelY - 2.05);
  const tunnelFloorScreenY = WorldToScreenY(world.tunnelY);

  const skyGradient = context.createLinearGradient(0, 0, 0, Math.max(surfaceScreenY, 1));
  skyGradient.addColorStop(0, "#26343e");
  skyGradient.addColorStop(.65, "#596067");
  skyGradient.addColorStop(1, "#8a7760");
  context.fillStyle = skyGradient;
  context.fillRect(0, 0, width, Math.max(0, surfaceScreenY));

  context.fillStyle = "#1d282f";
  context.beginPath();
  context.moveTo(0, surfaceScreenY);
  for (let screenX = -40; screenX <= width + 40; screenX += 36) {
    const wave = Math.sin((screenX + state.cameraX * 11) * .018) * scale * .28;
    context.lineTo(screenX, surfaceScreenY - scale * 1.35 + wave);
  }
  context.lineTo(width, surfaceScreenY);
  context.closePath();
  context.fill();

  DrawVillage(surfaceScreenY);

  context.fillStyle = "#594a3d";
  context.fillRect(0, surfaceScreenY, width, Math.max(0, tunnelTopScreenY - surfaceScreenY));
  context.fillStyle = "rgba(31, 25, 21, .34)";
  for (let y = surfaceScreenY + scale * .45; y < tunnelTopScreenY; y += scale * .62) {
    context.fillRect(0, y, width, 1);
  }

  context.strokeStyle = "rgba(228, 197, 149, .11)";
  context.lineWidth = 1;
  for (let meter = Math.floor(world.minimumX); meter <= world.maximumX; meter += 1) {
    const x = WorldToScreenX(meter);
    context.beginPath();
    context.moveTo(x, surfaceScreenY);
    context.lineTo(x, tunnelTopScreenY);
    context.stroke();
  }

  context.fillStyle = "#182126";
  context.fillRect(0, tunnelTopScreenY, width, Math.max(0, tunnelFloorScreenY - tunnelTopScreenY));
  context.fillStyle = "#302a24";
  context.fillRect(0, tunnelFloorScreenY, width, height - tunnelFloorScreenY);
  context.strokeStyle = "#8c7254";
  context.lineWidth = Math.max(2, scale * .04);
  context.beginPath();
  context.moveTo(0, tunnelTopScreenY);
  context.lineTo(width, tunnelTopScreenY);
  context.moveTo(0, tunnelFloorScreenY);
  context.lineTo(width, tunnelFloorScreenY);
  context.stroke();

  for (let supportX = -11; supportX <= 11; supportX += 2.75) DrawTunnelSupport(supportX, tunnelTopScreenY, tunnelFloorScreenY);
  world.entrances.forEach((entranceX) => DrawEntrance(entranceX, surfaceScreenY, tunnelTopScreenY, tunnelFloorScreenY));

  if (state.chapter.smoke) DrawSmoke(tunnelTopScreenY, tunnelFloorScreenY);
  if (state.chapter.network) DrawNetworkLines(tunnelTopScreenY, tunnelFloorScreenY);
  if (state.observe) DrawMeterGrid();
}

function DrawVillage(surfaceScreenY) {
  const scale = state.viewport.scale;
  const housePositions = [-11, -6.6, -1.4, 4.1, 9.2, 13.4];
  housePositions.forEach((houseX, index) => {
    const x = WorldToScreenX(houseX, .83);
    const width = scale * (3.4 + (index % 2) * .45);
    const height = scale * (1.7 + (index % 3) * .12);
    context.fillStyle = index % 2 ? "#4d4c49" : "#5a544d";
    context.fillRect(x - width * .5, surfaceScreenY - height, width, height);
    context.strokeStyle = "#252a2c";
    context.lineWidth = Math.max(2, scale * .045);
    context.strokeRect(x - width * .5, surfaceScreenY - height, width, height);
    context.fillStyle = "#303538";
    context.beginPath();
    context.moveTo(x - width * .62, surfaceScreenY - height);
    context.lineTo(x, surfaceScreenY - height - scale * .62);
    context.lineTo(x + width * .62, surfaceScreenY - height);
    context.closePath();
    context.fill();
    context.fillStyle = "#20272b";
    context.fillRect(x - scale * .28, surfaceScreenY - scale * .95, scale * .56, scale * .95);
  });

  context.fillStyle = "#292d2c";
  world.coverZones.forEach((coverX, index) => {
    const x = WorldToScreenX(coverX);
    const width = scale * (1.05 + (index % 2) * .25);
    context.fillRect(x - width * .5, surfaceScreenY - scale * .65, width, scale * .65);
    context.strokeStyle = "#9b7d5d";
    context.strokeRect(x - width * .5, surfaceScreenY - scale * .65, width, scale * .65);
  });
}

function DrawTunnelSupport(worldX, topY, floorY) {
  const x = WorldToScreenX(worldX);
  const scale = state.viewport.scale;
  context.strokeStyle = "#7d654b";
  context.lineWidth = Math.max(2, scale * .07);
  context.beginPath();
  context.moveTo(x - scale * .48, floorY);
  context.lineTo(x - scale * .42, topY + scale * .12);
  context.lineTo(x + scale * .42, topY + scale * .12);
  context.lineTo(x + scale * .48, floorY);
  context.stroke();
}

function DrawEntrance(worldX, surfaceY, tunnelTopY, tunnelFloorY) {
  const x = WorldToScreenX(worldX);
  const scale = state.viewport.scale;
  const isNear = Math.abs(state.player.x - worldX) <= 1.1;
  context.fillStyle = isNear ? "rgba(83, 169, 200, .28)" : "rgba(20, 29, 34, .7)";
  context.fillRect(x - scale * .48, surfaceY, scale * .96, tunnelTopY - surfaceY);
  context.strokeStyle = isNear ? "#74b9d3" : "#466471";
  context.lineWidth = isNear ? 3 : 1.5;
  context.setLineDash([6, 5]);
  context.strokeRect(x - scale * .48, surfaceY, scale * .96, tunnelFloorY - surfaceY);
  context.setLineDash([]);
  context.fillStyle = "#12181c";
  context.fillRect(x - scale * .62, surfaceY - scale * .12, scale * 1.24, scale * .18);
  context.fillStyle = "#74b9d3";
  context.font = `${Math.max(9, scale * .15)}px Segoe UI`;
  context.textAlign = "center";
  context.fillText("入口", x, surfaceY - scale * .22);
}

function DrawSmoke(topY, floorY) {
  const scale = state.viewport.scale;
  context.save();
  context.globalAlpha = .22 + state.suspicion * .18;
  for (let index = 0; index < 12; index += 1) {
    const worldX = -5 + index * .9 + Math.sin(state.elapsed * .4 + index) * .3;
    const x = WorldToScreenX(worldX);
    const y = floorY - scale * (.4 + (index % 4) * .34);
    context.fillStyle = index % 2 ? "#a98162" : "#6e5a4d";
    context.beginPath();
    context.arc(x, Clamp(y, topY + 8, floorY - 5), scale * (.26 + (index % 3) * .08), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function DrawNetworkLines(topY, floorY) {
  const y = (topY + floorY) * .5;
  const points = [-9.4, -4.7, .1, 4.8, 9.4];
  context.strokeStyle = "rgba(116, 185, 211, .55)";
  context.lineWidth = 2;
  context.setLineDash([8, 6]);
  context.beginPath();
  points.forEach((worldX, index) => {
    const x = WorldToScreenX(worldX);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.setLineDash([]);
  points.forEach((worldX) => {
    const x = WorldToScreenX(worldX);
    context.fillStyle = "#74b9d3";
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
  });
}

function DrawMeterGrid() {
  const { width, height, scale } = state.viewport;
  context.save();
  context.strokeStyle = "rgba(116, 185, 211, .13)";
  context.lineWidth = 1;
  context.font = "9px Segoe UI";
  context.fillStyle = "rgba(181, 220, 232, .7)";
  context.textAlign = "center";
  for (let meter = Math.floor(world.minimumX); meter <= world.maximumX; meter += 1) {
    const x = WorldToScreenX(meter);
    if (x < -20 || x > width + 20) continue;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.fillText(`${meter}m`, x, height - 18);
  }
  for (let row = 0; row <= world.viewHeight; row += 1) {
    const y = row * scale - (state.cameraY - world.viewHeight * .5) * scale;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.restore();
}

function DrawActionMarkers() {
  state.chapter.actions.forEach((action, index) => {
    const completed = state.completed.has(action.id);
    const available = !completed && RequirementsMet(action);
    const layerY = GetLayerY(action.layer);
    const x = WorldToScreenX(action.x);
    const y = WorldToScreenY(layerY) - state.viewport.scale * 2.02;
    if (x < -80 || x > state.viewport.width + 80) return;
    const radius = Math.max(15, state.viewport.scale * .24);
    context.save();
    context.globalAlpha = completed ? .55 : action.layer === state.player.layer ? 1 : .28;
    context.fillStyle = completed ? "#547866" : available ? "#d79b52" : "#555d61";
    context.strokeStyle = completed ? "#8dc2a5" : available ? "#f3c07d" : "#777f83";
    context.lineWidth = completed ? 2 : 1.5;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#15191c";
    context.font = `700 ${Math.max(10, radius * .72)}px Segoe UI`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(completed ? "✓" : markerGlyphs[action.kind] || String(index + 1), x, y + 1);
    if (state.observe) {
      context.fillStyle = "rgba(231, 226, 210, .86)";
      context.font = "10px Segoe UI";
      context.fillText(`${index + 1}. ${action.verb}`, x, y - radius - 9);
      if (action.requires?.length) {
        const parent = state.chapter.actions.find((candidate) => candidate.id === action.requires[0]);
        if (parent) {
          context.strokeStyle = available || completed ? "rgba(116,185,211,.55)" : "rgba(130,130,130,.32)";
          context.setLineDash([5, 5]);
          context.beginPath();
          context.moveTo(WorldToScreenX(parent.x), WorldToScreenY(GetLayerY(parent.layer)) - state.viewport.scale * 1.5);
          context.lineTo(x, y + radius);
          context.stroke();
          context.setLineDash([]);
        }
      }
    }
    context.restore();
  });
}

function DrawActor(actor, isPlayer = false) {
  const profile = actorProfiles[actor.profile || "player"] || actorProfiles.player;
  const scale = state.viewport.scale;
  const x = WorldToScreenX(actor.x);
  const baselineY = WorldToScreenY(actor.worldY ?? GetLayerY(actor.layer || state.player.layer));
  const canonicalHeight = profile.height * scale;
  const crouch = Boolean(actor.crouch);
  const injured = Boolean(actor.injured);
  const facing = actor.facing || 1;
  const color = actor.color || "#d7dce0";
  const headRadius = canonicalHeight * profile.head;
  const shoulderWidth = profile.shoulder * scale;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(2.3, canonicalHeight * .045);

  context.globalAlpha = .22;
  context.fillStyle = "#050708";
  context.beginPath();
  context.ellipse(x, baselineY + 2, canonicalHeight * .2, canonicalHeight * .045, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = color;

  if (injured) {
    const bodyY = baselineY - canonicalHeight * .3;
    context.beginPath();
    context.arc(x - canonicalHeight * .22, bodyY - canonicalHeight * .08, headRadius, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(x - canonicalHeight * .12, bodyY);
    context.lineTo(x + canonicalHeight * .28, bodyY + canonicalHeight * .08);
    context.lineTo(x + canonicalHeight * .42, baselineY - canonicalHeight * .08);
    context.stroke();
    context.strokeStyle = "rgba(215, 220, 224, .4)";
    context.setLineDash([4, 4]);
    context.strokeRect(x - canonicalHeight * .38, baselineY - canonicalHeight, canonicalHeight * .76, canonicalHeight);
    context.setLineDash([]);
  } else if (crouch) {
    const hipY = baselineY - canonicalHeight * .34;
    const shoulderY = baselineY - canonicalHeight * .56;
    const headX = x + facing * canonicalHeight * .12;
    const headY = baselineY - canonicalHeight * .7;
    context.beginPath();
    context.arc(headX, headY, headRadius, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(x - shoulderWidth * .45, shoulderY);
    context.lineTo(x + shoulderWidth * .45, shoulderY);
    context.lineTo(x + facing * canonicalHeight * .08, hipY);
    context.lineTo(x - facing * canonicalHeight * .18, baselineY - canonicalHeight * .13);
    context.lineTo(x - facing * canonicalHeight * .36, baselineY);
    context.moveTo(x + facing * canonicalHeight * .05, hipY);
    context.lineTo(x + facing * canonicalHeight * .34, baselineY - canonicalHeight * .17);
    context.lineTo(x + facing * canonicalHeight * .48, baselineY);
    context.stroke();
  } else {
    const hipY = baselineY - canonicalHeight * .43;
    const shoulderY = baselineY - canonicalHeight * .72;
    const headY = baselineY - canonicalHeight * .9;
    context.beginPath();
    context.arc(x, headY, headRadius, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(x - shoulderWidth * .5, shoulderY);
    context.lineTo(x + shoulderWidth * .5, shoulderY);
    context.lineTo(x + canonicalHeight * .09, hipY);
    context.lineTo(x - canonicalHeight * .09, hipY);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(x - shoulderWidth * .42, shoulderY + canonicalHeight * .05);
    context.lineTo(x - facing * canonicalHeight * .2, baselineY - canonicalHeight * .37);
    context.moveTo(x + shoulderWidth * .42, shoulderY + canonicalHeight * .05);
    context.lineTo(x + facing * canonicalHeight * .24, baselineY - canonicalHeight * .36);
    context.moveTo(x - canonicalHeight * .055, hipY);
    context.lineTo(x - canonicalHeight * .12, baselineY);
    context.moveTo(x + canonicalHeight * .055, hipY);
    context.lineTo(x + canonicalHeight * .12, baselineY);
    context.stroke();
  }

  if (isPlayer) {
    context.strokeStyle = "#f3c07d";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, baselineY - canonicalHeight * .48, canonicalHeight * .34, 0, Math.PI * 2);
    context.stroke();
  }

  if (state.observe || !isPlayer) {
    const labelY = baselineY - canonicalHeight - 10;
    context.fillStyle = isPlayer ? "#f3c07d" : "#d9e0e2";
    context.font = `${Math.max(9, scale * .15)}px Segoe UI`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillText(actor.label || "林青禾", x, labelY);
  }

  if (state.observe) DrawActorScale(x, baselineY, canonicalHeight, profile.height);
  context.restore();
}

function DrawActorScale(x, baselineY, heightPixels, heightMeters) {
  const scaleX = x - Math.max(22, heightPixels * .31);
  context.save();
  context.strokeStyle = "rgba(116,185,211,.8)";
  context.fillStyle = "rgba(183,220,233,.9)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(scaleX, baselineY);
  context.lineTo(scaleX, baselineY - heightPixels);
  context.moveTo(scaleX - 4, baselineY);
  context.lineTo(scaleX + 4, baselineY);
  context.moveTo(scaleX - 4, baselineY - heightPixels);
  context.lineTo(scaleX + 4, baselineY - heightPixels);
  context.stroke();
  context.font = "8px Segoe UI";
  context.textAlign = "right";
  context.fillText(`${heightMeters.toFixed(2)}m`, scaleX - 6, baselineY - heightPixels * .5);
  context.restore();
}

function DrawActors() {
  state.chapter.actors.forEach((actor) => DrawActor({ ...actor, worldY: GetLayerY(actor.layer) }));
  if (state.chapter.threat) DrawPatrol();
  DrawActor({
    label: "林青禾",
    profile: "player",
    color: "#e4e9e8",
    x: state.player.x,
    worldY: GetPlayerWorldY(),
    layer: state.player.layer,
    crouch: state.player.crouch,
    facing: state.player.facing
  }, true);
}

function DrawPatrol() {
  const scale = state.viewport.scale;
  const patrolY = world.surfaceY;
  const facing = state.patrolDirection;
  const patrolScreenX = WorldToScreenX(state.patrolX);
  const patrolScreenY = WorldToScreenY(patrolY);
  if (state.observe || state.suspicion > .05) {
    const range = scale * 4.2;
    context.save();
    context.globalAlpha = .12 + state.suspicion * .17;
    context.fillStyle = "#d66f61";
    context.beginPath();
    context.moveTo(patrolScreenX, patrolScreenY - scale * 1.2);
    context.lineTo(patrolScreenX + facing * range, patrolScreenY - scale * .15);
    context.lineTo(patrolScreenX + facing * range, patrolScreenY - scale * 2.25);
    context.closePath();
    context.fill();
    context.restore();
  }
  DrawActor({
    label: "巡逻",
    profile: "soldier",
    color: "#d66f61",
    x: state.patrolX,
    worldY: patrolY,
    layer: "surface",
    facing
  });
}

function DrawSceneLabels() {
  const scale = state.viewport.scale;
  context.save();
  context.textAlign = "left";
  context.fillStyle = "rgba(231,226,210,.78)";
  context.font = `600 ${Math.max(10, scale * .17)}px Segoe UI`;
  context.fillText("地表 · 院墙 / 遮蔽物 / 巡逻", 16, Clamp(WorldToScreenY(world.surfaceY) - scale * 2.5, 28, state.viewport.height - 50));
  context.fillStyle = "rgba(116,185,211,.8)";
  context.fillText("地下 · 支护 / 风路 / 翻口", 16, Clamp(WorldToScreenY(world.tunnelY) - scale * 2.25, 28, state.viewport.height - 30));
  context.restore();
}

function Draw() {
  context.setTransform(state.viewport.pixelRatio, 0, 0, state.viewport.pixelRatio, 0, 0);
  context.clearRect(0, 0, state.viewport.width, state.viewport.height);
  DrawBackground();
  if (state.mode !== "title" || ui.titleScreen.hidden) {
    DrawActionMarkers();
    DrawActors();
    DrawSceneLabels();
  } else {
    DrawActor({ label: "统一角色", profile: "player", color: "#e4e9e8", x: -1.2, worldY: world.surfaceY, layer: "surface" });
    DrawActor({ label: "成年民兵", profile: "man", color: "#c77a65", x: 1, worldY: world.surfaceY, layer: "surface" });
    DrawActor({ label: "妇救会", profile: "woman", color: "#7db8a4", x: 3, worldY: world.surfaceY, layer: "surface" });
  }
}

function RenderLoop(now) {
  const delta = Math.min(.05, Math.max(0, (now - state.lastTime) / 1000));
  state.lastTime = now;
  Update(delta);
  UpdateToast(now);
  Draw();
  requestAnimationFrame(RenderLoop);
}

function BindHoldButton(button, inputName) {
  const BeginHold = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.setPointerCapture && event.pointerId !== undefined) {
      try { button.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
    }
    state.input[inputName] = true;
    button.classList.add("isHeld");
  };
  const EndHold = (event) => {
    event?.preventDefault?.();
    state.input[inputName] = false;
    button.classList.remove("isHeld");
  };
  button.addEventListener("pointerdown", BeginHold, { passive: false });
  button.addEventListener("pointerup", EndHold, { passive: false });
  button.addEventListener("pointercancel", EndHold, { passive: false });
  button.addEventListener("lostpointercapture", EndHold, { passive: false });
  button.addEventListener("contextmenu", (event) => event.preventDefault());
  button.addEventListener("selectstart", (event) => event.preventDefault());
  button.addEventListener("dragstart", (event) => event.preventDefault());
}

function BindTapButton(button, callback) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.classList.add("isHeld");
    callback();
  }, { passive: false });
  const Release = (event) => {
    event?.preventDefault?.();
    button.classList.remove("isHeld");
  };
  button.addEventListener("pointerup", Release, { passive: false });
  button.addEventListener("pointercancel", Release, { passive: false });
  button.addEventListener("lostpointercapture", Release, { passive: false });
  button.addEventListener("contextmenu", (event) => event.preventDefault());
  button.addEventListener("selectstart", (event) => event.preventDefault());
}

function BindInput() {
  const leftButton = document.querySelector('[data-input="left"]');
  const rightButton = document.querySelector('[data-input="right"]');
  const crouchButton = document.querySelector('[data-input="crouch"]');
  BindHoldButton(leftButton, "left");
  BindHoldButton(rightButton, "right");
  BindHoldButton(crouchButton, "crouch");
  BindTapButton(document.querySelector('[data-input="action"]'), HandleAction);
  BindTapButton(document.querySelector('[data-input="depth"]'), ToggleDepth);
  BindTapButton(document.querySelector('[data-input="observe"]'), ToggleObserve);

  const blockedSelectionEvents = ["contextmenu", "selectstart", "dragstart"];
  blockedSelectionEvents.forEach((eventName) => {
    ui.touchControls.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["a", "d", "s", "e", "f", "shift", "arrowleft", "arrowright", "enter", " "].includes(key)) event.preventDefault();
    if (key === "a" || key === "arrowleft") state.input.left = true;
    if (key === "d" || key === "arrowright") state.input.right = true;
    if (key === "shift") state.input.crouch = true;
    if (event.repeat) return;
    if (key === "e" || key === "enter" || key === " ") HandleAction();
    if (key === "s") ToggleDepth();
    if (key === "f") ToggleObserve();
    if (key === "escape") {
      if (state.mode === "puzzle") CancelPuzzle();
      else ShowChapterPanel();
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") state.input.left = false;
    if (key === "d" || key === "arrowright") state.input.right = false;
    if (key === "shift") state.input.crouch = false;
  });
  window.addEventListener("blur", ResetHeldInputs);
  document.addEventListener("visibilitychange", () => { if (document.hidden) ResetHeldInputs(); });
}

function BindUi() {
  ui.startButton.addEventListener("click", () => StartSequence(0));
  ui.chapterButton.addEventListener("click", ShowChapterPanel);
  ui.guideButton.addEventListener("click", ShowGuidePanel);
  document.querySelectorAll("[data-close-panel]").forEach((button) => button.addEventListener("click", CloseNavigationPanel));
  ui.menuButton.addEventListener("click", ShowChapterPanel);
  ui.dialogueNext.addEventListener("click", ContinueDialogue);
  ui.puzzleCancel.addEventListener("click", CancelPuzzle);
  ui.nextChapterButton.addEventListener("click", GoToNextSequence);
  ui.completeChaptersButton.addEventListener("click", () => {
    ShowChapterPanel();
  });
  ui.endingRestartButton.addEventListener("click", () => StartSequence(0));
  ui.endingChaptersButton.addEventListener("click", ShowChapterPanel);
}

function Initialize() {
  BuildChapterList();
  BindInput();
  BindUi();
  ResizeCanvas();
  window.addEventListener("resize", ResizeCanvas);
  const query = new URLSearchParams(location.search);
  if (query.has("qa")) {
    const chapterIndex = Clamp(Number(query.get("chapter")) || 0, 0, campaignData.length - 1);
    StartSequence(chapterIndex);
  }
  requestAnimationFrame(RenderLoop);
}

Initialize();

window.EarthVeinsWhiteboxQa = Object.freeze({
  GetState: () => ({
    mode: state.mode,
    sequenceIndex: state.sequenceIndex,
    chapterId: state.chapter.id,
    playerX: state.player.x,
    layer: state.player.layer,
    crouch: state.player.crouch,
    completed: [...state.completed],
    suspicion: state.suspicion,
    observe: state.observe,
    nearestAction: state.nearestAction?.id || null
  }),
  StartSequence,
  MoveTo: (x) => { state.player.x = Clamp(Number(x) || 0, world.minimumX, world.maximumX); UpdateInterface(); },
  SetLayer: (layer) => { if (["surface", "tunnel"].includes(layer)) state.player.layer = layer; UpdateInterface(); },
  SetCrouch: (value) => { state.input.crouch = Boolean(value); state.player.crouch = Boolean(value); },
  ToggleDepth,
  HandleAction
});
