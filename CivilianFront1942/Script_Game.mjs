import {
  characterDefinitions,
  chapters,
  cellarSequence,
  epilogueLines,
  historicalFrame,
  interactionCopy,
  prologueCards,
} from "./Data_Story.mjs";
import {
  ApplyMissionEvent,
  BuildEpilogueSummary,
  CanChooseItem,
  CreateMissionState,
  CurrentObjective,
  IsMissionComplete,
} from "./Script_Rules.mjs";
import { CreateVillageWorld } from "./Script_World.mjs";

const settingsKey = "CivilianFront1942_Settings_V1";
const checkpointKey = "CivilianFront1942_Checkpoint_V1";
const fixedStep = 1 / 60;

function Element(id) {
  return document.getElementById(id);
}

const elements = {
  shell: Element("GameShell"),
  canvas: Element("GameCanvas"),
  title: Element("TitleScreen"),
  begin: Element("BeginButton"),
  openHistory: Element("OpenHistoryButton"),
  openAccess: Element("OpenAccessButton"),
  prologue: Element("PrologueScreen"),
  prologueEyebrow: Element("PrologueEyebrow"),
  prologueTitle: Element("PrologueTitle"),
  prologueBody: Element("PrologueBody"),
  prologueProgress: Element("PrologueProgress"),
  prologueNext: Element("PrologueNextButton"),
  hud: Element("GameHud"),
  chapterNumber: Element("ChapterNumber"),
  chapterTime: Element("ChapterTime"),
  chapterTitle: Element("ChapterTitle"),
  objectiveText: Element("ObjectiveText"),
  directionCaption: Element("DirectionCaption"),
  peoplePanel: Element("PeoplePanel"),
  peopleList: Element("PeopleList"),
  carryPanel: Element("CarryPanel"),
  carryLabel: Element("CarryLabel"),
  carryDetail: Element("CarryDetail"),
  worldMarker: Element("WorldMarker"),
  markerLabel: Element("MarkerLabel"),
  markerDistance: Element("MarkerDistance"),
  subtitlePanel: Element("SubtitlePanel"),
  subtitleSpeaker: Element("SubtitleSpeaker"),
  subtitleText: Element("SubtitleText"),
  interactionPrompt: Element("InteractionPrompt"),
  interactionLabel: Element("InteractionLabel"),
  touchAction: Element("TouchActionButton"),
  staminaText: Element("StaminaText"),
  staminaFill: Element("StaminaFill"),
  compassLabel: Element("CompassLabel"),
  controlHints: Element("ControlHints"),
  touchControls: Element("TouchControls"),
  moveStick: Element("MoveStick"),
  lookPad: Element("LookPad"),
  touchCrouch: Element("TouchCrouchButton"),
  touchRun: Element("TouchRunButton"),
  choice: Element("ChoiceScreen"),
  choiceItems: Element("ChoiceItems"),
  choiceCount: Element("ChoiceCount"),
  confirmChoice: Element("ConfirmChoiceButton"),
  cellar: Element("CellarScreen"),
  quietMeter: Element("QuietMeterFill"),
  cellarTime: Element("CellarTime"),
  holdBoard: Element("HoldBoardButton"),
  chapterCard: Element("ChapterCard"),
  cardNumber: Element("CardNumber"),
  cardTitle: Element("CardTitle"),
  cardTime: Element("CardTime"),
  cardObjective: Element("CardObjective"),
  cardHint: Element("CardHint"),
  pauseButton: Element("PauseButton"),
  pause: Element("PauseScreen"),
  pauseChapterTitle: Element("PauseChapterTitle"),
  resume: Element("ResumeButton"),
  restartCheckpoint: Element("RestartCheckpointButton"),
  pauseHistory: Element("PauseHistoryButton"),
  pauseAccess: Element("PauseAccessButton"),
  quit: Element("QuitButton"),
  history: Element("HistoryScreen"),
  historyStatement: Element("HistoryStatement"),
  historyBoundary: Element("HistoryBoundary"),
  access: Element("AccessScreen"),
  soundToggle: Element("SoundToggle"),
  distressToggle: Element("DistressToggle"),
  motionToggle: Element("MotionToggle"),
  contrastToggle: Element("ContrastToggle"),
  textToggle: Element("TextToggle"),
  ending: Element("EndingScreen"),
  endingOutcomes: Element("EndingOutcomes"),
  replay: Element("ReplayButton"),
  qaPanel: Element("QaPanel"),
  qaStatus: Element("QaStatus"),
  qaTeleport: Element("QaTeleportButton"),
  qaAction: Element("QaActionButton"),
  qaDialogue: Element("QaDialogueButton"),
  qaSpecial: Element("QaSpecialButton"),
  liveRegion: Element("LiveRegion"),
  damageVeil: Element("DamageVeil"),
};

elements.historyStatement.textContent = historicalFrame.statement;
elements.historyBoundary.textContent = historicalFrame.boundary;

class FieldAudio {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.lowerDistress = false;
    this.ambientNodes = [];
    this.lastStepAt = 0;
  }

  EnableFromGesture() {
    if (!this.context) {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return;
      this.context = new AudioContextType();
      this.StartAmbient();
    }
    this.context.resume?.();
  }

  SetPreferences(preferences) {
    this.enabled = preferences.sound;
    this.lowerDistress = preferences.lowerDistress;
    this.ambientNodes.forEach((node) => {
      if (node.gain) node.gain.value = this.enabled ? .014 : 0;
    });
  }

  Tone(frequency, duration, type = "sine", volume = .05, glide = 0, pan = 0) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + glide), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume * (this.lowerDistress ? .42 : 1), now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    if (this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      oscillator.connect(gain).connect(panner).connect(this.context.destination);
    } else {
      oscillator.connect(gain).connect(this.context.destination);
    }
    oscillator.start(now);
    oscillator.stop(now + duration + .03);
  }

  Noise(duration, volume = .04, filterFrequency = 900, pan = 0) {
    if (!this.enabled || !this.context) return;
    const length = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "lowpass";
    filter.frequency.value = filterFrequency;
    const now = this.context.currentTime;
    gain.gain.setValueAtTime(volume * (this.lowerDistress ? .35 : 1), now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.buffer = buffer;
    if (this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(filter).connect(gain).connect(panner).connect(this.context.destination);
    } else {
      source.connect(filter).connect(gain).connect(this.context.destination);
    }
    source.start();
  }

  Gong() {
    this.Tone(172, 2.8, "sine", .13, -44);
    this.Tone(281, 1.7, "sine", .055, -96);
  }

  Shot(pan = 0) {
    this.Noise(.17, .07, 1600, pan);
    this.Tone(92, .16, "square", .025, -35, pan);
  }

  Blast(pan = 0) {
    this.Noise(.65, .12, 520, pan);
    this.Tone(54, .55, "sawtooth", .06, -16, pan);
  }

  Step(running) {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime;
    if (now - this.lastStepAt < (running ? .29 : .45)) return;
    this.lastStepAt = now;
    this.Noise(.05, .014, 420);
  }

  StartAmbient() {
    if (!this.context || this.ambientNodes.length) return;
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < length; index += 1) {
      last = last * .985 + (Math.random() * 2 - 1) * .015;
      data[index] = last;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 600;
    gain.gain.value = this.enabled ? .014 : 0;
    source.connect(filter).connect(gain).connect(this.context.destination);
    source.start();
    this.ambientNodes.push(source, gain);
  }
}

const audio = new FieldAudio();
const preferences = LoadPreferences();
const input = {
  keys: new Set(),
  touchMoveX: 0,
  touchMoveY: 0,
  touchRun: false,
  crouching: false,
  movePointer: null,
  lookPointer: null,
  lookLastX: 0,
  lookLastY: 0,
};

let gameMode = "title";
let missionState = CreateMissionState();
let checkpointState = null;
let prologueIndex = 0;
let world = null;
let player = { x: 0, z: -19, yaw: 0, pitch: 0, stamina: 100 };
let lastFrameAt = performance.now();
let accumulator = 0;
let dialogueQueue = [];
let dialogueActive = null;
let dialogueTimer = 0;
let dialogueCallback = null;
let chapterCardTimer = null;
let openingMemoryTimer = null;
let openingMemoryActive = false;
let openingMemoryStartedAt = 0;
let directionTimer = null;
let interactionCooldown = 0;
let currentInteractTarget = null;
let cellarState = null;
let ferryPull = null;
let elapsedSaveAccumulator = 0;
let gameStarted = false;

function LoadPreferences() {
  const defaults = {
    sound: true,
    lowerDistress: false,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false,
    highContrast: false,
    largeText: false,
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(settingsKey) || "{}") };
  } catch {
    return defaults;
  }
}

function SavePreferences() {
  try {
    localStorage.setItem(settingsKey, JSON.stringify(preferences));
  } catch {
    // Device-local preferences are optional.
  }
}

function ApplyPreferences() {
  elements.soundToggle.checked = preferences.sound;
  elements.distressToggle.checked = preferences.lowerDistress;
  elements.motionToggle.checked = preferences.reducedMotion;
  elements.contrastToggle.checked = preferences.highContrast;
  elements.textToggle.checked = preferences.largeText;
  elements.shell.classList.toggle("reducedMotion", preferences.reducedMotion);
  elements.shell.classList.toggle("highContrast", preferences.highContrast);
  elements.shell.classList.toggle("largeText", preferences.largeText);
  audio.SetPreferences(preferences);
}

function EnsureWorld() {
  if (world) return;
  world = CreateVillageWorld({
    canvas: elements.canvas,
    onSuppression: ({ direction }) => {
      if (gameMode !== "play") return;
      player.stamina = Math.max(16, player.stamina - (preferences.lowerDistress ? 4 : 12));
      elements.damageVeil.classList.add("show");
      window.setTimeout(() => elements.damageVeil.classList.remove("show"), preferences.lowerDistress ? 80 : 220);
      ShowDirectionCaption(direction, preferences.lowerDistress ? "子弹从远处越过" : "子弹擦过土墙，先卧倒");
      audio.Shot(DirectionToPan(direction));
    },
    onDistantBlast: ({ direction }) => {
      if (!["Battle", "Reeds"].includes(missionState.phase)) return;
      ShowDirectionCaption(direction, preferences.lowerDistress ? "远处有沉闷爆响" : "迫击炮落在沟外");
      audio.Blast(DirectionToPan(direction));
    },
  });
  window.addEventListener("resize", () => world.Resize());
}

function SetVisible(element, visible) {
  element.hidden = !visible;
}

function HidePrimaryScreens() {
  [elements.title, elements.prologue, elements.hud, elements.choice, elements.cellar, elements.chapterCard, elements.pause, elements.ending].forEach((screen) => SetVisible(screen, false));
}

function BeginStory() {
  audio.EnableFromGesture();
  prologueIndex = 0;
  gameMode = "prologue";
  HidePrimaryScreens();
  SetVisible(elements.prologue, true);
  RenderPrologueCard();
}

function RenderPrologueCard() {
  const card = prologueCards[prologueIndex];
  elements.prologueEyebrow.textContent = card.eyebrow;
  elements.prologueTitle.textContent = card.title;
  elements.prologueBody.textContent = card.body;
  elements.prologueProgress.innerHTML = prologueCards.map((_, index) => `<i class="${index <= prologueIndex ? "active" : ""}"></i>`).join("");
  elements.prologueNext.querySelector("span").textContent = prologueIndex === prologueCards.length - 1 ? "进入青槐庄" : "继续";
}

function AdvancePrologue() {
  if (gameMode !== "prologue") return;
  audio.EnableFromGesture();
  if (prologueIndex < prologueCards.length - 1) {
    prologueIndex += 1;
    RenderPrologueCard();
    return;
  }
  StartNewGame();
}

function StartNewGame() {
  EnsureWorld();
  gameStarted = true;
  clearTimeout(directionTimer);
  elements.directionCaption.classList.remove("show");
  elements.damageVeil.classList.remove("show");
  missionState = CreateMissionState();
  checkpointState = null;
  dialogueQueue = [];
  dialogueActive = null;
  try { localStorage.removeItem(checkpointKey); } catch {}
  const spawn = world.GetSpawnForPhase("Breakfast");
  player = { x: spawn.x, z: spawn.z, yaw: spawn.yaw, pitch: 0, stamina: 100 };
  EnterPhase("Breakfast", { showCard: true, save: true, useSpawn: false });
}

function EnterPhase(phase, options = {}) {
  EnsureWorld();
  missionState.phase = phase;
  world.SetPhase(phase);
  const chapter = chapters[phase];
  if (!chapter) return;
  if (options.useSpawn) {
    const spawn = world.GetSpawnForPhase(phase);
    player.x = spawn.x;
    player.z = spawn.z;
    player.yaw = spawn.yaw;
    player.pitch = 0;
  }
  elements.chapterNumber.textContent = chapter.number;
  elements.chapterTime.textContent = chapter.time;
  elements.chapterTitle.textContent = chapter.title;
  elements.pauseChapterTitle.textContent = chapter.title;
  gameMode = "play";
  UpdateHud();
  if (options.save !== false) SaveCheckpoint();

  HidePrimaryScreens();
  SetVisible(elements.hud, true);
  gameMode = "play";

  const startChapterDialogue = () => {
    PlayDialogue(chapter.opening, () => {
      if (phase === "Choice") OpenChoice();
      if (phase === "Cellar") OpenCellar();
      if (phase === "Epilogue") ShowEndingAfterDialogue();
    });
  };
  const afterCard = () => {
    if (phase === "Breakfast") PlayOpeningMemory(startChapterDialogue);
    else startChapterDialogue();
  };
  if (options.showCard !== false) ShowChapterCard(chapter, afterCard);
  else afterCard();
}

function PlayOpeningMemory(callback) {
  SetVisible(elements.hud, false);
  gameMode = "chapter";
  openingMemoryActive = true;
  openingMemoryStartedAt = performance.now();
  UpdateOpeningMemoryCamera();
  audio.Noise(1.6, .018, 360, -.18);
  clearTimeout(openingMemoryTimer);
  openingMemoryTimer = window.setTimeout(() => {
    openingMemoryActive = false;
    SetVisible(elements.hud, true);
    gameMode = "play";
    callback?.();
  }, 10500);
}

function UpdateOpeningMemoryCamera() {
  if (!openingMemoryActive || !world) return;
  const memoryTime = (performance.now() - openingMemoryStartedAt) / 1000;
  const shots = [
    { until: 3.5, position: { x: 6.5, z: -13 }, yaw: 2.678, pitch: -.18 },
    { until: 7, position: { x: 10, z: -8 }, yaw: 2.761, pitch: -.3 },
    { until: Infinity, position: { x: -4.8, z: .5 }, yaw: -.267, pitch: -.01 },
  ];
  const shot = shots.find((candidate) => memoryTime < candidate.until) || shots[shots.length - 1];
  world.SetCamera(shot.position, shot.yaw, shot.pitch, false, 0);
}

function ShowChapterCard(chapter, callback) {
  SetVisible(elements.chapterCard, true);
  elements.cardNumber.textContent = chapter.number;
  elements.cardTitle.textContent = chapter.title;
  elements.cardTime.textContent = chapter.time;
  elements.cardObjective.textContent = chapter.objective;
  elements.cardHint.textContent = chapter.hint;
  gameMode = "chapter";
  clearTimeout(chapterCardTimer);
  chapterCardTimer = window.setTimeout(() => {
    SetVisible(elements.chapterCard, false);
    SetVisible(elements.hud, true);
    gameMode = "play";
    callback?.();
    elements.canvas.focus();
  }, preferences.reducedMotion ? 700 : 2500);
}

function PlayDialogue(lines, callback = null) {
  if (!Array.isArray(lines) || !lines.length) {
    callback?.();
    return;
  }
  dialogueQueue = [...lines];
  dialogueCallback = callback;
  ShowNextDialogue();
}

function ShowNextDialogue() {
  if (!dialogueQueue.length) {
    dialogueActive = null;
    dialogueTimer = 0;
    elements.subtitlePanel.classList.add("quiet");
    const callback = dialogueCallback;
    dialogueCallback = null;
    callback?.();
    return;
  }
  const [speakerId, text] = dialogueQueue.shift();
  const speaker = characterDefinitions[speakerId] || characterDefinitions.Narrator;
  dialogueActive = { speakerId, text };
  dialogueTimer = Math.max(2.3, Math.min(7, text.length * .105));
  elements.subtitleSpeaker.textContent = speaker.name;
  elements.subtitleText.textContent = text;
  elements.subtitlePanel.classList.remove("quiet");
  elements.subtitlePanel.style.setProperty("--speaker", `"${speaker.name.slice(0, 1)}"`);
}

function AdvanceDialogue() {
  if (!dialogueActive) return false;
  ShowNextDialogue();
  return true;
}

function OpenChoice() {
  if (missionState.phase !== "Choice") return;
  SetVisible(elements.choice, true);
  gameMode = "choice";
  RenderChoice();
}

function RenderChoice() {
  const buttons = [...elements.choiceItems.querySelectorAll("[data-item]")];
  buttons.forEach((button) => {
    const item = button.dataset.item;
    const selected = missionState.chosenItems.includes(item);
    button.classList.toggle("selected", selected);
    button.disabled = !selected && missionState.chosenItems.length >= 2;
  });
  elements.choiceCount.textContent = `已选 ${missionState.chosenItems.length} / 2`;
  elements.confirmChoice.disabled = missionState.chosenItems.length !== 2;
}

function ChooseItem(item) {
  if (!CanChooseItem(missionState, item)) return;
  missionState = ApplyMissionEvent(missionState, { type: "ChooseItem", item });
  audio.Tone(310 + missionState.chosenItems.length * 80, .16, "triangle", .04, 60);
  RenderChoice();
  UpdateHud();
}

function ConfirmChoice() {
  if (missionState.chosenItems.length !== 2) return;
  missionState = ApplyMissionEvent(missionState, { type: "EnterCellar" });
  EnterPhase("Cellar", { showCard: true, save: true, useSpawn: true });
}

function OpenCellar() {
  SetVisible(elements.hud, false);
  SetVisible(elements.cellar, true);
  gameMode = "cellar";
  cellarState = {
    secondsLeft: 12.5,
    noise: 18,
    holding: false,
    sequenceIndex: 0,
    penaltyCooldown: 0,
  };
  RenderCellar();
}

function SetBoardHolding(holding) {
  if (gameMode !== "cellar" || !cellarState) return;
  cellarState.holding = holding;
  elements.holdBoard.classList.toggle("holding", holding);
  elements.holdBoard.textContent = holding ? "稳住，别松手" : "按住木板";
}

function RenderCellar() {
  if (!cellarState) return;
  elements.cellarTime.textContent = `00:${String(Math.max(0, Math.ceil(cellarState.secondsLeft))).padStart(2, "0")}`;
  elements.quietMeter.style.width = `${cellarState.noise}%`;
  elements.quietMeter.style.background = cellarState.noise > 70 ? "#ad4f43" : cellarState.noise > 42 ? "#c39458" : "#819471";
}

function UpdateCellar(delta) {
  if (!cellarState) return;
  cellarState.penaltyCooldown = Math.max(0, cellarState.penaltyCooldown - delta);
  cellarState.secondsLeft -= delta;
  cellarState.noise += (cellarState.holding ? -22 : 18) * delta;
  cellarState.noise = Math.max(10, Math.min(100, cellarState.noise));
  const elapsed = 12.5 - cellarState.secondsLeft;
  while (cellarState.sequenceIndex < cellarSequence.length && elapsed >= cellarSequence[cellarState.sequenceIndex].at) {
    const event = cellarSequence[cellarState.sequenceIndex];
    ShowCellarLine(event.speaker, event.text);
    cellarState.sequenceIndex += 1;
    if (cellarState.sequenceIndex === 3) audio.Shot();
  }
  if (cellarState.noise >= 98 && cellarState.penaltyCooldown <= 0) {
    cellarState.noise = 66;
    cellarState.secondsLeft += 1.8;
    cellarState.penaltyCooldown = 2;
    ShowCellarLine("Brother", "姐……我压住了。");
  }
  RenderCellar();
  if (cellarState.secondsLeft <= 0) {
    cellarState = null;
    missionState = ApplyMissionEvent(missionState, { type: "CompleteCellar" });
    EnterPhase("Rescue", { showCard: true, save: true, useSpawn: true });
  }
}

function ShowCellarLine(speakerId, text) {
  const speaker = characterDefinitions[speakerId] || characterDefinitions.Narrator;
  elements.liveRegion.textContent = `${speaker.name}：${text}`;
  elements.cellar.querySelector("#CellarInstruction").textContent = `${speaker.name}：${text}`;
}

function UpdateHud() {
  const chapter = chapters[missionState.phase];
  if (chapter) {
    elements.chapterNumber.textContent = chapter.number;
    elements.chapterTime.textContent = chapter.time;
    elements.chapterTitle.textContent = chapter.title;
  }
  const objective = CurrentObjective(missionState);
  elements.objectiveText.textContent = objective.text;
  RenderPeoplePanel();
  RenderCarryPanel();
  UpdateQaStatus();
}

function UpdateQaStatus() {
  if (elements.qaPanel.hidden) return;
  elements.qaStatus.textContent = `${gameMode}/${missionState.phase}/${missionState.chosenItems.length}`;
}

function RenderPeoplePanel() {
  const rows = [];
  if (missionState.phase === "Breakfast") {
    rows.push(["梁桂芬", "在磨坊", "safe"], ["梁小栓", "等补鞋", "safe"]);
  } else if (missionState.phase === "Choice" || missionState.phase === "Cellar") {
    rows.push(["梁小栓", "跟着你", "safe"], ["梁桂芬", "去叫西巷", "unknown"], ["周文嫂", "去叫西巷", "unknown"]);
  } else if (missionState.phase === "Rescue") {
    const states = {
      Family: "母亲和小栓",
      AuntSun: "孙婶一家",
      Zhou: "周文嫂",
    };
    Object.entries(states).forEach(([id, name]) => {
      const status = missionState.rescuedGroups.includes(id)
        ? "已到水渠"
        : missionState.activeRescueGroup === id ? "跟着你" : "尚未找到";
      rows.push([name, status, status === "尚未找到" ? "unknown" : "safe"]);
    });
  } else {
    rows.push(["水渠口群众", "正在转移", "safe"], ["贺木匠小组", "沟东掩护", "danger"], ["周文嫂", "随伤员板车", "safe"]);
  }
  elements.peopleList.innerHTML = rows.map(([name, status, kind]) => `<span><i class="${kind}"></i>${name}<small>${status}</small></span>`).join("");
}

function RenderCarryPanel() {
  const objective = CurrentObjective(missionState);
  const labels = {
    Family: "扶着母亲，牵着小栓",
    AuntSun: "带着孙婶和三个孩子",
    Zhou: "扶着受伤的周文嫂",
  };
  if (missionState.activeRescueGroup) {
    elements.carryLabel.textContent = labels[missionState.activeRescueGroup];
    elements.carryDetail.textContent = "脚步会变慢，别离水渠太远";
    SetVisible(elements.carryPanel, true);
    return;
  }
  if (ferryPull) {
    elements.carryLabel.textContent = `第 ${missionState.ferryCrossings + 1} 船渡绳`;
    elements.carryDetail.textContent = "握住绳，等船进苇荡";
    SetVisible(elements.carryPanel, true);
    return;
  }
  SetVisible(elements.carryPanel, false);
}

function GetTargetLabel(targetId) {
  if (!targetId) return "";
  if (targetId === "ChoiceItems") return "选择要带走的东西";
  if (targetId === "CellarHold") return "压住木板";
  return interactionCopy[targetId]?.label || ({
    Family: "母亲和小栓",
    AuntSun: "孙婶一家",
    Zhou: "周文嫂",
    Canal: "水渠口",
    Message: "东沟小组",
    Cart: "伤员板车",
    Gate: "渠门",
    Ferry: "苇荡渡绳",
  })[targetId] || targetId;
}

function UpdateTargetMarker() {
  if (gameMode !== "play" || ferryPull) {
    SetVisible(elements.worldMarker, false);
    SetVisible(elements.interactionPrompt, false);
    currentInteractTarget = null;
    return;
  }
  const objective = CurrentObjective(missionState);
  const position = world.GetTargetPosition(objective.target);
  if (!position) {
    SetVisible(elements.worldMarker, false);
    SetVisible(elements.interactionPrompt, false);
    currentInteractTarget = null;
    return;
  }
  const dx = position.x - player.x;
  const dz = position.z - player.z;
  const distance = Math.hypot(dx, dz);
  const projected = world.ProjectWorldPosition(position);
  const label = GetTargetLabel(objective.target);
  const markerX = Math.max(48, Math.min(elements.canvas.clientWidth - 48, projected.x));
  const markerY = Math.max(145, Math.min(elements.canvas.clientHeight - 155, projected.y));
  elements.worldMarker.style.left = `${markerX}px`;
  elements.worldMarker.style.top = `${markerY}px`;
  elements.markerLabel.textContent = label;
  elements.markerDistance.textContent = `${Math.max(1, Math.round(distance))} 米`;
  SetVisible(elements.worldMarker, projected.visible || distance < 22);
  currentInteractTarget = distance <= InteractionRadius(objective.target) ? objective.target : null;
  SetVisible(elements.interactionPrompt, Boolean(currentInteractTarget));
  if (currentInteractTarget) elements.interactionLabel.textContent = label;
}

function InteractionRadius(targetId) {
  if (targetId === "Canal" || targetId === "Ferry") return 6.5;
  if (targetId === "Cart" || targetId === "Gate") return 5.5;
  return 4.7;
}

function Interact() {
  if (gameMode !== "play" || interactionCooldown > 0 || dialogueActive) return;
  if (!currentInteractTarget) return;
  interactionCooldown = .4;
  const target = currentInteractTarget;
  const beforePhase = missionState.phase;
  let dialogue = interactionCopy[target]?.dialogue || null;

  if (beforePhase === "Breakfast" && ["Mill", "Bowl", "Shoe"].includes(target)) {
    missionState = ApplyMissionEvent(missionState, { type: "CompleteBreakfastTask", task: target });
    if (target === "Mill") audio.Noise(.26, .025, 380);
    if (target === "Bowl") audio.Tone(520, .12, "sine", .025, -90);
    if (target === "Shoe") audio.Tone(360, .07, "triangle", .02, 30);
  } else if (beforePhase === "Rescue" && ["Family", "AuntSun", "Zhou"].includes(target)) {
    missionState = ApplyMissionEvent(missionState, { type: "FindRescueGroup", group: target });
  } else if (beforePhase === "Rescue" && target === "Canal") {
    missionState = ApplyMissionEvent(missionState, { type: "DeliverRescueGroup" });
    dialogue = [["Narrator", "脚步进了水渠，土墙把人影压低。还有人等着你回去。"]];
  } else if (beforePhase === "Battle" && ["Message", "Cart", "Gate"].includes(target)) {
    missionState = ApplyMissionEvent(missionState, { type: "CompleteBattleTask", task: target });
    if (target === "Cart") {
      player.stamina = Math.max(25, player.stamina - 24);
      dialogue = [["Narrator", "板车轮陷进弹坑。你和卫生员一起抬起车辕，车上的伤员咬着衣角，没有喊出声。"]];
    }
    if (target === "Gate") audio.Tone(86, .7, "sawtooth", .035, -20);
  } else if (beforePhase === "Reeds" && target === "Ferry") {
    StartFerryPull();
    return;
  }

  UpdateHud();
  const afterPhase = missionState.phase;
  PlayDialogue(dialogue || [], () => {
    if (afterPhase !== beforePhase) {
      EnterPhase(afterPhase, { showCard: true, save: true, useSpawn: false });
    } else {
      SaveCheckpoint(false);
    }
  });
}

function StartFerryPull() {
  ferryPull = { secondsLeft: 4.4, startedAt: performance.now() };
  elements.objectiveText.textContent = `拉住渡绳 · 第 ${missionState.ferryCrossings + 1} 船正在过水`;
  elements.interactionLabel.textContent = "握紧，别松手";
  SetVisible(elements.interactionPrompt, true);
  RenderCarryPanel();
  audio.Tone(118, .5, "triangle", .025, -24);
}

function UpdateFerryPull(delta) {
  if (!ferryPull) return;
  ferryPull.secondsLeft -= delta;
  elements.interactionLabel.textContent = `握紧渡绳 · ${Math.max(0, ferryPull.secondsLeft).toFixed(1)} 秒`;
  if (ferryPull.secondsLeft > 0) return;
  ferryPull = null;
  missionState = ApplyMissionEvent(missionState, { type: "CompleteFerryCrossing" });
  const crossing = missionState.ferryCrossings;
  const lines = [
    [["Narrator", "北沟自行转移的村民也赶到渡口。第一船进了苇荡：老人、孩子，还有卫生所仅剩的两副担架。"]],
    [["Narrator", "第二船过水。东沟枪声稀了，贺木匠他们在数最后几发子弹。"]],
    [["Narrator", "最后一船离岸。周文嫂把湿透的名册抱在怀里，开始一个一个点名。"]],
  ][crossing - 1] || [];
  const phaseChanged = missionState.phase === "Epilogue";
  UpdateHud();
  PlayDialogue(lines, () => {
    if (phaseChanged) EnterPhase("Epilogue", { showCard: true, save: true, useSpawn: false });
    else SaveCheckpoint(false);
  });
}

function ShowDirectionCaption(direction, message) {
  elements.directionCaption.innerHTML = `<span>${direction}</span><b>${message}</b>`;
  elements.directionCaption.classList.add("show");
  elements.liveRegion.textContent = `${direction}：${message}`;
  clearTimeout(directionTimer);
  directionTimer = window.setTimeout(() => elements.directionCaption.classList.remove("show"), preferences.lowerDistress ? 1500 : 2800);
}

function DirectionToPan(direction) {
  if (/东北|东面|东南/.test(direction)) return .72;
  if (/西北|西面|西南/.test(direction)) return -.72;
  return 0;
}

function ShowEndingAfterDialogue() {
  if (!IsMissionComplete(missionState)) return;
  const summary = BuildEpilogueSummary(missionState);
  const saved = new Set(missionState.chosenItems);
  const definitions = [
    {
      id: "Medicine",
      mark: saved.has("Medicine") ? "带出来了" : "留在村里",
      title: "卫生所药箱",
      body: saved.has("Medicine") ? epilogueLines.Medicine : epilogueLines.LostMedicine,
    },
    {
      id: "Seed",
      mark: saved.has("Seed") ? "带出来了" : "留在村里",
      title: "七斤谷种",
      body: saved.has("Seed") ? epilogueLines.Seed : epilogueLines.LostSeed,
    },
    {
      id: "Register",
      mark: saved.has("Register") ? "带出来了" : "撤离前烧毁",
      title: "交通点代号册",
      body: saved.has("Register") ? epilogueLines.Register : epilogueLines.LostRegister,
    },
  ];
  elements.endingOutcomes.innerHTML = definitions.map((outcome) => `<article><span>${outcome.mark}</span><b>${outcome.title}</b><p>${outcome.body}</p></article>`).join("");
  HidePrimaryScreens();
  SetVisible(elements.ending, true);
  gameMode = "ending";
  if (document.pointerLockElement) document.exitPointerLock?.();
  try { localStorage.removeItem(checkpointKey); } catch {}
  elements.liveRegion.textContent = summary.title;
}

function SaveCheckpoint(forceNew = true) {
  if (!gameStarted || ["title", "prologue"].includes(gameMode)) return;
  if (forceNew || !checkpointState || checkpointState.phase !== missionState.phase) {
    checkpointState = {
      phase: missionState.phase,
      missionState: JSON.parse(JSON.stringify(missionState)),
      player: { ...player },
    };
  }
  try {
    localStorage.setItem(checkpointKey, JSON.stringify(checkpointState));
  } catch {
    // Checkpoints are an enhancement, not a play blocker.
  }
}

function RestartCheckpoint() {
  let snapshot = checkpointState;
  if (!snapshot) {
    try { snapshot = JSON.parse(localStorage.getItem(checkpointKey) || "null"); } catch {}
  }
  if (!snapshot?.missionState) {
    StartNewGame();
    return;
  }
  missionState = JSON.parse(JSON.stringify(snapshot.missionState));
  player = { ...snapshot.player, stamina: 100 };
  ferryPull = null;
  dialogueQueue = [];
  dialogueActive = null;
  EnterPhase(missionState.phase, { showCard: true, save: false, useSpawn: true });
}

function PauseGame() {
  if (!["play", "chapter"].includes(gameMode)) return;
  clearTimeout(chapterCardTimer);
  SetVisible(elements.chapterCard, false);
  SetVisible(elements.pause, true);
  elements.pauseChapterTitle.textContent = chapters[missionState.phase]?.title || "青槐庄";
  gameMode = "pause";
  if (document.pointerLockElement) document.exitPointerLock?.();
}

function ResumeGame() {
  if (gameMode !== "pause") return;
  SetVisible(elements.pause, false);
  SetVisible(elements.hud, true);
  gameMode = "play";
}

function QuitToTitle() {
  dialogueQueue = [];
  dialogueActive = null;
  ferryPull = null;
  HidePrimaryScreens();
  SetVisible(elements.title, true);
  gameMode = "title";
  gameStarted = false;
  if (document.pointerLockElement) document.exitPointerLock?.();
}

function OpenModal(modal) {
  SetVisible(modal, true);
  if (gameMode === "play") {
    modal.dataset.returnMode = "play";
    gameMode = "modal";
    if (document.pointerLockElement) document.exitPointerLock?.();
  } else {
    modal.dataset.returnMode = gameMode;
  }
}

function CloseModal(modal) {
  SetVisible(modal, false);
  const returnMode = modal.dataset.returnMode || (gameStarted ? "pause" : "title");
  gameMode = returnMode;
  delete modal.dataset.returnMode;
}

function UpdatePlayer(delta) {
  if (gameMode !== "play" || ferryPull) return;
  const forwardInput = (input.keys.has("KeyW") ? 1 : 0) - (input.keys.has("KeyS") ? 1 : 0) - input.touchMoveY;
  const sideInput = (input.keys.has("KeyD") ? 1 : 0) - (input.keys.has("KeyA") ? 1 : 0) + input.touchMoveX;
  const inputLength = Math.hypot(forwardInput, sideInput);
  const running = (input.keys.has("ShiftLeft") || input.keys.has("ShiftRight") || input.touchRun)
    && player.stamina > 8
    && !missionState.activeRescueGroup
    && !input.crouching;
  const baseSpeed = input.crouching ? 2.05 : running ? 6.2 : missionState.activeRescueGroup ? 2.45 : 3.45;
  const speed = baseSpeed * (missionState.phase === "Battle" && player.stamina < 25 ? .78 : 1);
  if (inputLength > .04) {
    const normalizedForward = forwardInput / Math.max(1, inputLength);
    const normalizedSide = sideInput / Math.max(1, inputLength);
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const dx = (sin * normalizedForward + cos * normalizedSide) * speed * delta;
    const dz = (-cos * normalizedForward + sin * normalizedSide) * speed * delta;
    const resolved = world.ResolveMovement(player, { x: player.x + dx, z: player.z + dz });
    player.x = resolved.x;
    player.z = resolved.z;
    if (running) player.stamina = Math.max(0, player.stamina - delta * 16);
    else player.stamina = Math.min(100, player.stamina + delta * 7);
    audio.Step(running);
  } else {
    player.stamina = Math.min(100, player.stamina + delta * 11);
  }
  elements.staminaFill.style.width = `${player.stamina}%`;
  elements.staminaText.textContent = player.stamina > 62 ? "稳" : player.stamina > 25 ? "喘" : "快撑不住";
  world.SetCamera(player, player.yaw, player.pitch, input.crouching, inputLength > .05 && !preferences.reducedMotion ? 1 : 0);
}

function UpdateCompass() {
  const degrees = ((player.yaw * 180 / Math.PI) % 360 + 360) % 360;
  const index = Math.round(degrees / 45) % 8;
  elements.compassLabel.textContent = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"][index];
}

function Tick(delta) {
  if (gameMode === "cellar") {
    UpdateCellar(delta);
    return;
  }
  if (!world) return;
  interactionCooldown = Math.max(0, interactionCooldown - delta);
  if (dialogueActive) {
    dialogueTimer -= delta;
    if (dialogueTimer <= 0) ShowNextDialogue();
  }
  UpdateOpeningMemoryCamera();
  UpdatePlayer(delta);
  UpdateFerryPull(delta);
  missionState = ApplyMissionEvent(missionState, { type: "Tick", seconds: delta });
  world.Update(delta, player, missionState, preferences);
  UpdateTargetMarker();
  UpdateCompass();
  elapsedSaveAccumulator += delta;
  if (elapsedSaveAccumulator > 12) {
    elapsedSaveAccumulator = 0;
    SaveCheckpoint(false);
  }
}

function Frame(now) {
  const delta = Math.min(.08, Math.max(0, (now - lastFrameAt) / 1000));
  lastFrameAt = now;
  accumulator += delta;
  while (accumulator >= fixedStep) {
    Tick(fixedStep);
    accumulator -= fixedStep;
  }
  if (world) {
    world.Update(0, player, missionState, preferences);
    world.Render();
  }
  requestAnimationFrame(Frame);
}

function OnKeyDown(event) {
  if (event.code === "Space") {
    if (gameMode === "prologue") {
      event.preventDefault();
      AdvancePrologue();
      return;
    }
    if (gameMode === "cellar") {
      event.preventDefault();
      SetBoardHolding(true);
      return;
    }
    if (AdvanceDialogue()) {
      event.preventDefault();
      return;
    }
  }
  if (event.code === "Escape") {
    if (gameMode === "play" || gameMode === "chapter") PauseGame();
    else if (gameMode === "pause") ResumeGame();
    return;
  }
  if (event.code === "KeyF") {
    event.preventDefault();
    Interact();
    return;
  }
  if (event.code === "KeyC" && gameMode === "play") {
    input.crouching = !input.crouching;
    elements.touchCrouch.classList.toggle("active", input.crouching);
  }
  input.keys.add(event.code);
}

function OnKeyUp(event) {
  input.keys.delete(event.code);
  if (event.code === "Space" && gameMode === "cellar") SetBoardHolding(false);
}

function BindPointerLock() {
  elements.canvas.addEventListener("click", () => {
    if (gameMode !== "play" || matchMedia("(pointer: coarse)").matches) return;
    audio.EnableFromGesture();
    elements.canvas.requestPointerLock?.();
  });
  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== elements.canvas || gameMode !== "play") return;
    player.yaw -= event.movementX * .0021;
    player.pitch = Math.max(-1.18, Math.min(1.12, player.pitch - event.movementY * .0018));
  });
}

function BindTouchControls() {
  elements.moveStick.addEventListener("pointerdown", (event) => {
    input.movePointer = event.pointerId;
    elements.moveStick.setPointerCapture(event.pointerId);
    UpdateMoveStick(event);
  });
  elements.moveStick.addEventListener("pointermove", (event) => {
    if (event.pointerId === input.movePointer) UpdateMoveStick(event);
  });
  const endMove = (event) => {
    if (event.pointerId !== input.movePointer) return;
    input.movePointer = null;
    input.touchMoveX = 0;
    input.touchMoveY = 0;
    elements.moveStick.querySelector("i").style.transform = "";
  };
  elements.moveStick.addEventListener("pointerup", endMove);
  elements.moveStick.addEventListener("pointercancel", endMove);

  elements.lookPad.addEventListener("pointerdown", (event) => {
    input.lookPointer = event.pointerId;
    input.lookLastX = event.clientX;
    input.lookLastY = event.clientY;
    elements.lookPad.setPointerCapture(event.pointerId);
  });
  elements.lookPad.addEventListener("pointermove", (event) => {
    if (event.pointerId !== input.lookPointer || gameMode !== "play") return;
    const dx = event.clientX - input.lookLastX;
    const dy = event.clientY - input.lookLastY;
    input.lookLastX = event.clientX;
    input.lookLastY = event.clientY;
    player.yaw -= dx * .006;
    player.pitch = Math.max(-1.1, Math.min(1.05, player.pitch - dy * .0048));
  });
  const endLook = (event) => {
    if (event.pointerId === input.lookPointer) input.lookPointer = null;
  };
  elements.lookPad.addEventListener("pointerup", endLook);
  elements.lookPad.addEventListener("pointercancel", endLook);

  elements.touchRun.addEventListener("pointerdown", () => { input.touchRun = true; });
  elements.touchRun.addEventListener("pointerup", () => { input.touchRun = false; });
  elements.touchRun.addEventListener("pointercancel", () => { input.touchRun = false; });
  elements.touchCrouch.addEventListener("click", () => {
    input.crouching = !input.crouching;
    elements.touchCrouch.classList.toggle("active", input.crouching);
  });
  elements.touchAction.addEventListener("click", Interact);
}

function UpdateMoveStick(event) {
  const bounds = elements.moveStick.getBoundingClientRect();
  const dx = event.clientX - (bounds.left + bounds.width / 2);
  const dy = event.clientY - (bounds.top + bounds.height / 2);
  const radius = bounds.width * .34;
  const length = Math.hypot(dx, dy);
  const scale = length > radius ? radius / length : 1;
  const x = dx * scale;
  const y = dy * scale;
  input.touchMoveX = x / radius;
  input.touchMoveY = y / radius;
  elements.moveStick.querySelector("i").style.transform = `translate(${x}px, ${y}px)`;
}

elements.begin.addEventListener("click", BeginStory);
elements.prologueNext.addEventListener("click", AdvancePrologue);
elements.openHistory.addEventListener("click", () => OpenModal(elements.history));
elements.openAccess.addEventListener("click", () => OpenModal(elements.access));
elements.pauseButton.addEventListener("click", PauseGame);
elements.resume.addEventListener("click", ResumeGame);
elements.restartCheckpoint.addEventListener("click", RestartCheckpoint);
elements.pauseHistory.addEventListener("click", () => OpenModal(elements.history));
elements.pauseAccess.addEventListener("click", () => OpenModal(elements.access));
elements.quit.addEventListener("click", QuitToTitle);
elements.replay.addEventListener("click", StartNewGame);
[...elements.choiceItems.querySelectorAll("[data-item]")].forEach((button) => {
  button.addEventListener("click", () => ChooseItem(button.dataset.item));
});
elements.confirmChoice.addEventListener("click", ConfirmChoice);

elements.holdBoard.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  elements.holdBoard.setPointerCapture?.(event.pointerId);
  SetBoardHolding(true);
});
elements.holdBoard.addEventListener("pointerup", () => SetBoardHolding(false));
elements.holdBoard.addEventListener("pointercancel", () => SetBoardHolding(false));

[elements.history, elements.access].forEach((modal) => {
  modal.querySelectorAll("[dataCloseModal]").forEach((button) => button.addEventListener("click", () => CloseModal(modal)));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) CloseModal(modal);
  });
});

[
  [elements.soundToggle, "sound"],
  [elements.distressToggle, "lowerDistress"],
  [elements.motionToggle, "reducedMotion"],
  [elements.contrastToggle, "highContrast"],
  [elements.textToggle, "largeText"],
].forEach(([control, key]) => {
  control.addEventListener("change", () => {
    preferences[key] = control.checked;
    SavePreferences();
    ApplyPreferences();
  });
});

window.addEventListener("keydown", OnKeyDown);
window.addEventListener("keyup", OnKeyUp);
window.addEventListener("blur", () => {
  input.keys.clear();
  input.touchMoveX = 0;
  input.touchMoveY = 0;
  input.touchRun = false;
  if (gameMode === "play") PauseGame();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && gameMode === "play") PauseGame();
});

BindPointerLock();
BindTouchControls();
ApplyPreferences();
InitializeLocalQa();
requestAnimationFrame(Frame);

function InitializeLocalQa() {
  const isLocal = ["127.0.0.1", "localhost"].includes(location.hostname);
  const enabled = isLocal && new URLSearchParams(location.search).get("qa") === "1";
  if (!enabled) return;
  preferences.reducedMotion = true;
  ApplyPreferences();
  SetVisible(elements.qaPanel, true);
  UpdateQaStatus();
  elements.qaTeleport.addEventListener("click", () => {
    if (!world) return;
    const target = world.GetTargetPosition(CurrentObjective(missionState).target);
    if (!target) return;
    player.x = target.x;
    player.z = target.z + 1.25;
    world.SetCamera(player, player.yaw, player.pitch, input.crouching, 0);
    UpdateTargetMarker();
  });
  elements.qaAction.addEventListener("click", () => Interact());
  elements.qaDialogue.addEventListener("click", () => AdvanceDialogue());
  elements.qaSpecial.addEventListener("click", () => {
    if (cellarState) cellarState.secondsLeft = 0;
    if (ferryPull) ferryPull.secondsLeft = 0;
  });
}

window.CivilianFront1942Debug = Object.freeze({
  GetState: () => ({
    gameMode,
    missionState: JSON.parse(JSON.stringify(missionState)),
    player: { ...player },
    objective: CurrentObjective(missionState),
    dialogueActive: dialogueActive ? { ...dialogueActive } : null,
  }),
  Start: () => StartNewGame(),
  AdvanceDialogue: () => AdvanceDialogue(),
  TeleportToObjective: () => {
    if (!world) return false;
    const target = world.GetTargetPosition(CurrentObjective(missionState).target);
    if (!target) return false;
    player.x = target.x;
    player.z = target.z + 1.3;
    return true;
  },
  Interact: () => Interact(),
  ChooseItem: (item) => ChooseItem(item),
  ConfirmChoice: () => ConfirmChoice(),
  CompleteCellar: () => {
    if (!cellarState) return false;
    cellarState.secondsLeft = 0;
    return true;
  },
  CompleteFerryPull: () => {
    if (!ferryPull) return false;
    ferryPull.secondsLeft = 0;
    return true;
  },
});
