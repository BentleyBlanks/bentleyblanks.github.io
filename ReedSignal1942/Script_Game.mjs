import {
  Chapters,
  GameMetadata,
  HistoricalSources,
  GetAllChildNames,
  GetChapter,
} from "./Data_World.mjs";
import {
  CreateGameState,
  RestoreGameState,
  SerializeGameState,
  StepGameState,
  GetAvailableAction,
  GetBlockedActionReason,
  GetGroundY,
  GetLightTarget,
  GetObjective,
  GetWindStrength,
  IsWindGust,
  IsChapterReady,
  AdvanceChapter,
  RequirementsMet,
} from "./Script_Rules.mjs";

const Ui = {
  shell: document.getElementById("GameShell"),
  canvas: document.getElementById("GameCanvas"),
  title: document.getElementById("TitleScreen"),
  start: document.getElementById("StartButton"),
  continue: document.getElementById("ContinueButton"),
  history: document.getElementById("HistoryScreen"),
  historyButton: document.getElementById("HistoryButton"),
  pauseHistoryButton: document.getElementById("PauseHistoryButton"),
  endingHistoryButton: document.getElementById("EndingHistoryButton"),
  closeHistory: document.getElementById("CloseHistoryButton"),
  historyBack: document.getElementById("HistoryBackButton"),
  historyBoundary: document.getElementById("HistoryBoundary"),
  historyResponsibility: document.getElementById("HistoryResponsibility"),
  sourceList: document.getElementById("SourceList"),
  intro: document.getElementById("IntroScreen"),
  introDate: document.getElementById("IntroDate"),
  introNumber: document.getElementById("IntroNumber"),
  introTitle: document.getElementById("IntroTitle"),
  introCopy: document.getElementById("IntroCopy"),
  introThesis: document.getElementById("IntroThesis"),
  enterChapter: document.getElementById("EnterChapterButton"),
  gameHeader: document.getElementById("GameHeader"),
  pauseButton: document.getElementById("PauseButton"),
  soundButton: document.getElementById("SoundButton"),
  hudChapterNumber: document.getElementById("HudChapterNumber"),
  hudChapterTitle: document.getElementById("HudChapterTitle"),
  objectiveCard: document.getElementById("ObjectiveCard"),
  objectiveText: document.getElementById("ObjectiveText"),
  objectiveCount: document.getElementById("ObjectiveCount"),
  windCard: document.getElementById("WindCard"),
  windFill: document.getElementById("WindFill"),
  windNeedle: document.getElementById("WindNeedle"),
  windText: document.getElementById("WindText"),
  suspicionCard: document.getElementById("SuspicionCard"),
  suspicionFill: document.getElementById("SuspicionFill"),
  teamCard: document.getElementById("TeamCard"),
  teamDots: document.getElementById("TeamDots"),
  teamState: document.getElementById("TeamState"),
  interaction: document.getElementById("InteractionPrompt"),
  interactionLabel: document.getElementById("InteractionLabel"),
  interactionHint: document.getElementById("InteractionHint"),
  interactionProgress: document.getElementById("InteractionProgress"),
  storyCaption: document.getElementById("StoryCaption"),
  storyText: document.getElementById("StoryText"),
  dangerWash: document.getElementById("DangerWash"),
  complete: document.getElementById("ChapterCompleteScreen"),
  completeTitle: document.getElementById("CompleteTitle"),
  completeLine: document.getElementById("CompleteLine"),
  completeCost: document.getElementById("CompleteCost"),
  nextChapter: document.getElementById("NextChapterButton"),
  pause: document.getElementById("PauseScreen"),
  resume: document.getElementById("ResumeButton"),
  restartChapter: document.getElementById("RestartChapterButton"),
  returnTitle: document.getElementById("ReturnTitleButton"),
  ending: document.getElementById("EndingScreen"),
  rollCallList: document.getElementById("RollCallList"),
  rollCallButton: document.getElementById("RollCallButton"),
  endingQuote: document.getElementById("EndingQuote"),
  endingHistory: document.getElementById("EndingHistory"),
  endingActions: document.getElementById("EndingActions"),
  restartStory: document.getElementById("RestartStoryButton"),
  controlGuide: document.getElementById("ControlGuide"),
  touchControls: document.getElementById("TouchControls"),
};

const Context = Ui.canvas.getContext("2d", { alpha: false });
const InputState = {
  left: false,
  right: false,
  crouch: false,
  jumpPressed: false,
  interact: false,
  interactPressed: false,
  commandPressed: false,
};

const Runtime = {
  state: null,
  previewState: CreateGameState(0),
  cameraX: 620,
  previousTime: performance.now(),
  cssWidth: 1280,
  cssHeight: 720,
  scale: 1,
  storyUntil: 0,
  storyQueue: [],
  currentStory: "",
  lastSaveSignature: "",
  lastSaveAt: 0,
  introPendingState: null,
  historyReturn: "title",
  muted: false,
  audio: null,
  ambient: null,
  transientKeys: new Map(),
  chapterCompleteShown: false,
  lastFootstepAt: 0,
  titleStartedAt: performance.now(),
};

function ResizeCanvas() {
  const rectangle = Ui.canvas.getBoundingClientRect();
  Runtime.cssWidth = Math.max(320, rectangle.width);
  Runtime.cssHeight = Math.max(240, rectangle.height);
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  Ui.canvas.width = Math.round(Runtime.cssWidth * pixelRatio);
  Ui.canvas.height = Math.round(Runtime.cssHeight * pixelRatio);
  Context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  Runtime.scale = Math.max(0.72, Math.min(1.16, Runtime.cssHeight / 720));
}

function CreateAudio() {
  if (Runtime.audio) return Runtime.audio;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const audio = new AudioContextClass();
  const master = audio.createGain();
  master.gain.value = Runtime.muted ? 0 : 0.34;
  master.connect(audio.destination);
  Runtime.audio = { context: audio, master };
  const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (0.35 + Math.sin(index * 0.00021) * 0.18);
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = buffer;
  source.loop = true;
  filter.type = "lowpass";
  filter.frequency.value = 540;
  gain.gain.value = 0.055;
  source.connect(filter).connect(gain).connect(master);
  source.start();
  Runtime.ambient = { source, gain, filter };
  return Runtime.audio;
}

function ResumeAudio() {
  const audio = CreateAudio();
  if (audio?.context.state === "suspended") audio.context.resume();
}

function PlayTone(kind = "soft") {
  if (Runtime.muted) return;
  const audio = CreateAudio();
  if (!audio) return;
  const now = audio.context.currentTime;
  const oscillator = audio.context.createOscillator();
  const gain = audio.context.createGain();
  const filter = audio.context.createBiquadFilter();
  const settings = {
    soft: [180, 0.08, 0.16, "sine"],
    action: [248, 0.11, 0.24, "triangle"],
    alert: [92, 0.14, 0.35, "sawtooth"],
    bell: [392, 0.18, 1.7, "sine"],
    water: [128, 0.09, 0.62, "sine"],
  }[kind] || [180, 0.08, 0.16, "sine"];
  oscillator.type = settings[3];
  oscillator.frequency.setValueAtTime(settings[0], now);
  if (kind === "bell") oscillator.frequency.exponentialRampToValueAtTime(196, now + settings[2]);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(settings[1], now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[2]);
  filter.type = "lowpass";
  filter.frequency.value = kind === "alert" ? 380 : 1300;
  oscillator.connect(filter).connect(gain).connect(audio.master);
  oscillator.start(now);
  oscillator.stop(now + settings[2] + 0.04);
}

function ShowHistory(returnTarget = "title") {
  Runtime.historyReturn = returnTarget;
  Ui.history.hidden = false;
  Ui.history.scrollTop = 0;
}

function CloseHistory() {
  Ui.history.hidden = true;
  if (Runtime.historyReturn === "pause") Ui.pause.hidden = false;
}

function PopulateHistory() {
  Ui.historyBoundary.textContent = GameMetadata.historyBoundary;
  Ui.historyResponsibility.textContent = GameMetadata.responsibility;
  Ui.sourceList.replaceChildren();
  for (const source of HistoricalSources) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${source.organization}：《${source.title.replace(/[《》]/g, "")}》`;
    const description = document.createElement("span");
    description.textContent = `——${source.usedFor}`;
    item.append(link, description);
    Ui.sourceList.append(item);
  }
}

function HasSave() {
  try {
    return Boolean(localStorage.getItem(GameMetadata.saveKey));
  } catch {
    return false;
  }
}

function ReadSave() {
  try {
    const serialized = localStorage.getItem(GameMetadata.saveKey);
    return serialized ? RestoreGameState(serialized) : null;
  } catch {
    return null;
  }
}

function WriteSave(force = false) {
  if (!Runtime.state || Runtime.state.mode === "ending") return;
  const now = performance.now();
  if (!force && now - Runtime.lastSaveAt < 800) return;
  const serialized = SerializeGameState(Runtime.state);
  if (!force && serialized === Runtime.lastSaveSignature) return;
  try {
    localStorage.setItem(GameMetadata.saveKey, serialized);
    Runtime.lastSaveSignature = serialized;
    Runtime.lastSaveAt = now;
    Ui.continue.hidden = false;
  } catch {
    // Local storage can be disabled; checkpoints still work for the current run.
  }
}

function ClearSave() {
  try {
    localStorage.removeItem(GameMetadata.saveKey);
  } catch {
    // No persistent storage is a supported mode.
  }
  Runtime.lastSaveSignature = "";
}

function PrepareChapterIntro(state) {
  const chapter = GetChapter(state.chapterIndex);
  Runtime.introPendingState = state;
  Ui.pause.hidden = true;
  Ui.complete.hidden = true;
  Ui.ending.hidden = true;
  Ui.gameHeader.hidden = true;
  Ui.objectiveCard.hidden = true;
  Ui.windCard.hidden = true;
  Ui.suspicionCard.hidden = true;
  Ui.teamCard.hidden = true;
  Ui.controlGuide.hidden = true;
  Ui.touchControls.hidden = true;
  Ui.interaction.hidden = true;
  Ui.title.classList.remove("isVisible");
  Ui.title.hidden = true;
  Ui.intro.hidden = false;
  Ui.introDate.textContent = `${chapter.date} · ${chapter.location}`;
  Ui.introNumber.textContent = chapter.number;
  Ui.introTitle.textContent = chapter.title;
  Ui.introCopy.replaceChildren(...chapter.intro.map((line) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    return paragraph;
  }));
  Ui.introThesis.textContent = chapter.thesis;
  Ui.enterChapter.textContent = state.chapterIndex === 0 ? "走进这一夜" : "继续向北";
}

function EnterChapter() {
  ResumeAudio();
  Runtime.state = Runtime.introPendingState || CreateGameState(0);
  Runtime.introPendingState = null;
  Runtime.cameraX = Runtime.state.player.x + 250;
  Runtime.chapterCompleteShown = false;
  Runtime.storyQueue.length = 0;
  Runtime.storyUntil = 0;
  Ui.intro.hidden = true;
  Ui.complete.hidden = true;
  Ui.ending.hidden = true;
  Ui.gameHeader.hidden = false;
  Ui.objectiveCard.hidden = false;
  Ui.controlGuide.hidden = false;
  Ui.touchControls.hidden = false;
  const chapter = GetChapter(Runtime.state.chapterIndex);
  Ui.hudChapterNumber.textContent = chapter.number;
  Ui.hudChapterTitle.textContent = chapter.title;
  Runtime.state.mode = "playing";
  Ui.canvas.focus({ preventScroll: true });
  WriteSave(true);
}

function StartNewStory() {
  ResumeAudio();
  ClearSave();
  PrepareChapterIntro(CreateGameState(0));
}

function ContinueStory() {
  ResumeAudio();
  const savedState = ReadSave();
  PrepareChapterIntro(savedState || CreateGameState(0));
}

function ReturnToTitle() {
  if (Runtime.state) WriteSave(true);
  Runtime.state = null;
  Runtime.introPendingState = null;
  Ui.pause.hidden = true;
  Ui.complete.hidden = true;
  Ui.ending.hidden = true;
  Ui.intro.hidden = true;
  Ui.gameHeader.hidden = true;
  Ui.objectiveCard.hidden = true;
  Ui.windCard.hidden = true;
  Ui.suspicionCard.hidden = true;
  Ui.teamCard.hidden = true;
  Ui.touchControls.hidden = true;
  Ui.controlGuide.hidden = true;
  Ui.interaction.hidden = true;
  Ui.title.hidden = false;
  requestAnimationFrame(() => Ui.title.classList.add("isVisible"));
  Ui.continue.hidden = !HasSave();
}

function PauseGame() {
  if (!Runtime.state || Runtime.state.mode !== "playing") return;
  Runtime.state.mode = "paused";
  Ui.pause.hidden = false;
}

function ResumeGame() {
  if (!Runtime.state) return;
  Ui.pause.hidden = true;
  Runtime.state.mode = "playing";
  Ui.canvas.focus({ preventScroll: true });
}

function RestartCurrentChapter() {
  if (!Runtime.state) return;
  const chapterIndex = Runtime.state.chapterIndex;
  PrepareChapterIntro(CreateGameState(chapterIndex));
  Ui.pause.hidden = true;
}

function ShowChapterComplete() {
  if (!Runtime.state || Runtime.chapterCompleteShown) return;
  Runtime.chapterCompleteShown = true;
  Runtime.state.mode = "chapterComplete";
  const chapter = GetChapter(Runtime.state.chapterIndex);
  Ui.completeTitle.textContent = `${chapter.number} · ${chapter.title}`;
  Ui.completeLine.textContent = chapter.endingLine;
  Ui.completeCost.textContent = Runtime.state.detections > 0
    ? `这一路被巡逻逼退过 ${Runtime.state.detections} 次；检查点只记录方法，不把危险当作分数。`
    : "没有一次失败会被换算成英雄数字；重要的是，人还在。";
  Ui.complete.hidden = false;
  Ui.interaction.hidden = true;
  WriteSave(true);
}

function GoToNextChapter() {
  if (!Runtime.state) return;
  const nextState = AdvanceChapter(Runtime.state);
  PrepareChapterIntro(nextState);
}

function ShowEnding() {
  if (!Runtime.state) return;
  Ui.gameHeader.hidden = true;
  Ui.objectiveCard.hidden = true;
  Ui.windCard.hidden = true;
  Ui.suspicionCard.hidden = true;
  Ui.teamCard.hidden = true;
  Ui.touchControls.hidden = true;
  Ui.controlGuide.hidden = true;
  Ui.interaction.hidden = true;
  Ui.storyCaption.hidden = true;
  Ui.ending.hidden = false;
  Ui.rollCallButton.hidden = false;
  Ui.rollCallButton.disabled = false;
  Ui.endingQuote.hidden = true;
  Ui.endingHistory.hidden = true;
  Ui.endingActions.hidden = true;
  Ui.rollCallList.replaceChildren(...GetAllChildNames().map((name) => {
    const item = document.createElement("li");
    item.textContent = name;
    const response = document.createElement("span");
    response.textContent = "到";
    item.append(response);
    return item;
  }));
  ClearSave();
}

function BeginRollCall() {
  Ui.rollCallButton.disabled = true;
  Ui.rollCallButton.hidden = true;
  PlayTone("soft");
  const items = [...Ui.rollCallList.children];
  items.forEach((item, index) => {
    window.setTimeout(() => {
      item.classList.add("isCalled");
      PlayTone("soft");
    }, 420 + index * 660);
  });
  window.setTimeout(() => {
    Ui.endingQuote.hidden = false;
    PlayTone("bell");
  }, 650 + items.length * 660);
  window.setTimeout(() => {
    Ui.endingHistory.hidden = false;
    Ui.endingActions.hidden = false;
  }, 2200 + items.length * 660);
}

function ShowStory(text, type = "story") {
  if (!text) return;
  Runtime.currentStory = text;
  Runtime.storyUntil = performance.now() + (type === "story" ? 3300 : 2200);
  Ui.storyText.textContent = text;
  Ui.storyCaption.hidden = false;
  if (type === "detected" || type === "warning") PlayTone("alert");
  else if (/周禾把白布|马灯/.test(text)) PlayTone("bell");
  else if (/水|浮桥|井口/.test(text)) PlayTone("water");
  else PlayTone("action");
}

function DrainEvents() {
  if (!Runtime.state) return;
  const now = performance.now();
  while (Runtime.state.eventQueue.length) {
    const event = Runtime.state.eventQueue.shift();
    if (event.onceKey) {
      const lastSeen = Runtime.transientKeys.get(event.onceKey) || 0;
      if (now - lastSeen < 1700) continue;
      Runtime.transientKeys.set(event.onceKey, now);
    }
    Runtime.storyQueue.push(event);
  }
  if (Runtime.storyUntil > now) return;
  if (Runtime.storyQueue.length) {
    const event = Runtime.storyQueue.shift();
    ShowStory(event.text, event.type);
    WriteSave(true);
  } else {
    Ui.storyCaption.hidden = true;
    Runtime.currentStory = "";
  }
}

function UpdateHud() {
  const state = Runtime.state;
  if (!state || state.mode === "ending") return;
  const chapter = GetChapter(state.chapterIndex);
  const objective = GetObjective(state);
  Ui.objectiveText.textContent = objective.label;
  Ui.objectiveCount.textContent = `${objective.done} / ${objective.total}`;
  Ui.objectiveCard.classList.toggle("isPulse", state.objectivePulse > 0);
  Ui.dangerWash.style.opacity = String(Math.max(0, state.suspicion * 0.82));
  Ui.suspicionCard.hidden = state.suspicion < 0.035;
  Ui.suspicionFill.style.width = `${Math.round(state.suspicion * 100)}%`;

  Ui.windCard.hidden = chapter.id !== "blockade";
  if (chapter.id === "blockade") {
    const wind = GetWindStrength(state.elapsed);
    Ui.windFill.style.width = `${Math.round(wind * 100)}%`;
    Ui.windNeedle.style.transform = `rotate(${(-18 + wind * 36).toFixed(1)}deg)`;
    Ui.windText.textContent = IsWindGust(state.elapsed) ? "现在——风声正满" : "看苇梢，别急着走";
  }

  Ui.teamCard.hidden = state.followers.length < 2;
  if (state.followers.length >= 2) {
    if (Ui.teamDots.children.length !== state.followers.length) {
      Ui.teamDots.replaceChildren(...state.followers.map(() => document.createElement("i")));
    }
    Ui.teamState.textContent = state.followersHolding ? "留在遮蔽后" : "跟紧阿苇";
  }

  let action = GetAvailableAction(state);
  let isCart = false;
  if (!action && chapter.cart && !state.completed.has("cartPlaced") && RequirementsMet(state, chapter.actions.find((item) => item.id === "cartPlaced")) && Math.abs(state.player.x - state.cartX) <= 92) {
    action = chapter.actions.find((item) => item.id === "cartPlaced");
    isCart = true;
  }
  Ui.interaction.hidden = !action || state.mode !== "playing";
  if (action) {
    const blockedReason = GetBlockedActionReason(state, action);
    Ui.interactionLabel.textContent = isCart ? "按住行动键并移动，推独轮车" : action.label;
    Ui.interactionHint.textContent = blockedReason || (isCart ? "蹲在车后，行动键 + 方向推到墙根" : "按住完成");
    const progress = action.seconds > 0 && state.activeActionId === action.id ? state.actionProgress / action.seconds : 0;
    Ui.interactionProgress.style.width = `${Math.min(100, Math.round(progress * 100))}%`;
  }
  Ui.controlGuide.hidden = state.elapsed > 18 || state.mode !== "playing";
}

function ConsumePressedInput() {
  InputState.jumpPressed = false;
  InputState.interactPressed = false;
  InputState.commandPressed = false;
}

function WorldXToScreen(worldX, cameraX = Runtime.cameraX) {
  return (worldX - cameraX) * Runtime.scale + Runtime.cssWidth * 0.5;
}

function WorldYToScreen(worldY) {
  return Runtime.cssHeight * 0.74 - worldY * Runtime.scale;
}

function DrawSky(chapter, state) {
  const width = Runtime.cssWidth;
  const height = Runtime.cssHeight;
  const gradient = Context.createLinearGradient(0, 0, 0, height);
  if (chapter.id === "ferry") {
    gradient.addColorStop(0, "#233337");
    gradient.addColorStop(0.63, "#42504b");
    gradient.addColorStop(1, "#111b1b");
  } else if (chapter.id === "tunnel") {
    gradient.addColorStop(0, "#171713");
    gradient.addColorStop(1, "#080b0b");
  } else {
    gradient.addColorStop(0, "#112126");
    gradient.addColorStop(0.58, "#253431");
    gradient.addColorStop(1, "#111a19");
  }
  Context.fillStyle = gradient;
  Context.fillRect(0, 0, width, height);

  if (chapter.id !== "tunnel") {
    Context.fillStyle = chapter.id === "ferry" ? "rgba(218,210,176,.63)" : "rgba(205,207,181,.38)";
    Context.beginPath();
    Context.arc(width * 0.78, height * 0.18, Math.min(width, height) * 0.052, 0, Math.PI * 2);
    Context.fill();
    const parallax = Runtime.cameraX * 0.08;
    Context.fillStyle = "rgba(21,34,34,.72)";
    Context.beginPath();
    Context.moveTo(0, height * 0.57);
    for (let x = -80; x <= width + 120; x += 120) {
      const ridgeX = x - (parallax % 120);
      const ridgeY = height * 0.5 + Math.sin((x + chapter.id.length * 47) * 0.012) * 31;
      Context.lineTo(ridgeX, ridgeY);
    }
    Context.lineTo(width, height);
    Context.lineTo(0, height);
    Context.closePath();
    Context.fill();
  }

  if (chapter.id === "tunnel") {
    Context.fillStyle = "rgba(112,86,55,.14)";
    for (let x = -40; x < width + 50; x += 92) {
      Context.fillRect(x + Math.sin(x) * 5, height * 0.18, 4, height * 0.56);
    }
  }
  DrawBackdropDetails(chapter, state);
}

function DrawBackdropDetails(chapter, state) {
  const groundScreenY = WorldYToScreen(0);
  Context.save();
  Context.fillStyle = "rgba(8,15,15,.62)";
  if (chapter.id === "school") {
    const schoolX = WorldXToScreen(410);
    Context.fillRect(schoolX - 270 * Runtime.scale, groundScreenY - 245 * Runtime.scale, 570 * Runtime.scale, 245 * Runtime.scale);
    Context.beginPath();
    Context.moveTo(schoolX - 310 * Runtime.scale, groundScreenY - 245 * Runtime.scale);
    Context.lineTo(schoolX, groundScreenY - 340 * Runtime.scale);
    Context.lineTo(schoolX + 340 * Runtime.scale, groundScreenY - 245 * Runtime.scale);
    Context.fill();
    Context.clearRect(schoolX - 40 * Runtime.scale, groundScreenY - 125 * Runtime.scale, 75 * Runtime.scale, 125 * Runtime.scale);
  } else if (chapter.id === "blockade") {
    Context.fillStyle = "rgba(5,12,13,.48)";
    Context.fillRect(0, groundScreenY + 10, Runtime.cssWidth, Runtime.cssHeight - groundScreenY);
    for (let worldX = 0; worldX < chapter.width; worldX += 115) DrawReedClump(WorldXToScreen(worldX), groundScreenY + 8, 0.55, "rgba(13,25,23,.66)");
  } else if (chapter.id === "tunnel") {
    const kilnX = WorldXToScreen(1540);
    Context.fillStyle = "rgba(65,48,31,.35)";
    Context.beginPath();
    Context.arc(kilnX, groundScreenY - 165 * Runtime.scale, 390 * Runtime.scale, Math.PI, 0);
    Context.fill();
    for (let beamX = 280; beamX < chapter.width; beamX += 440) {
      const x = WorldXToScreen(beamX);
      Context.fillStyle = "rgba(86,66,40,.72)";
      Context.fillRect(x - 7, groundScreenY - 118 * Runtime.scale, 14, 132 * Runtime.scale);
      Context.fillRect(x - 80 * Runtime.scale, groundScreenY - 120 * Runtime.scale, 160 * Runtime.scale, 10);
    }
  } else if (chapter.id === "ferry") {
    Context.fillStyle = "rgba(20,34,31,.62)";
    for (let worldX = 0; worldX < chapter.width; worldX += 150) DrawReedClump(WorldXToScreen(worldX), groundScreenY + 5, 0.65, "rgba(15,29,26,.68)");
    const boatX = WorldXToScreen(3360);
    Context.fillStyle = "#111b1a";
    Context.beginPath();
    Context.moveTo(boatX - 150 * Runtime.scale, groundScreenY - 8);
    Context.lineTo(boatX + 160 * Runtime.scale, groundScreenY - 8);
    Context.lineTo(boatX + 105 * Runtime.scale, groundScreenY + 45 * Runtime.scale);
    Context.lineTo(boatX - 105 * Runtime.scale, groundScreenY + 45 * Runtime.scale);
    Context.closePath();
    Context.fill();
  }
  Context.restore();
}

function DrawReedClump(x, groundY, size = 1, color = "#283a32") {
  Context.save();
  Context.strokeStyle = color;
  Context.lineWidth = Math.max(1, 2 * Runtime.scale * size);
  const wind = Runtime.state ? GetWindStrength(Runtime.state.elapsed) : 0.4;
  for (let index = 0; index < 8; index += 1) {
    const offset = (index - 3.5) * 8 * Runtime.scale * size;
    const height = (75 + (index % 3) * 24) * Runtime.scale * size;
    const bend = (wind * 13 + (index % 2) * 5) * Runtime.scale;
    Context.beginPath();
    Context.moveTo(x + offset, groundY);
    Context.quadraticCurveTo(x + offset - bend * 0.3, groundY - height * 0.55, x + offset + bend, groundY - height);
    Context.stroke();
  }
  Context.restore();
}

function DrawTerrain(chapter, state) {
  for (const segment of chapter.terrain) {
    if (segment.dynamic === "sluiceBridge" && !state.completed.has("raiseSluice")) continue;
    const x0 = WorldXToScreen(segment.x0);
    const x1 = WorldXToScreen(segment.x1);
    const y = WorldYToScreen(segment.y);
    Context.fillStyle = chapter.id === "tunnel" ? "#211d16" : segment.dynamic ? "#554a35" : "#1d2925";
    Context.fillRect(x0, y, x1 - x0 + 1, Runtime.cssHeight - y);
    Context.fillStyle = chapter.id === "tunnel" ? "#6f5c3e" : "#71806a";
    Context.fillRect(x0, y - 3, x1 - x0 + 1, 3);
    if (segment.dynamic) {
      for (let plankX = x0; plankX < x1; plankX += 34 * Runtime.scale) {
        Context.fillStyle = "rgba(199,177,126,.23)";
        Context.fillRect(plankX, y - 7, 25 * Runtime.scale, 5);
      }
    }
  }
  if (chapter.id === "blockade") {
    const waterX0 = WorldXToScreen(1840);
    const waterX1 = WorldXToScreen(2240);
    const waterY = WorldYToScreen(-82 + state.waterLevel * 102);
    const gradient = Context.createLinearGradient(0, waterY, 0, Runtime.cssHeight);
    gradient.addColorStop(0, "rgba(92,119,113,.82)");
    gradient.addColorStop(1, "rgba(18,40,40,.92)");
    Context.fillStyle = gradient;
    Context.fillRect(waterX0, waterY, waterX1 - waterX0, Runtime.cssHeight - waterY);
  }
}

function DrawSearchlights(chapter, state) {
  Context.save();
  Context.globalCompositeOperation = "screen";
  for (const hazard of chapter.hazards || []) {
    if (hazard.kind !== "searchlight") continue;
    const sourceX = WorldXToScreen(hazard.sourceX);
    const sourceY = WorldYToScreen(340);
    const targetX = WorldXToScreen(GetLightTarget(hazard, state));
    const targetY = WorldYToScreen(0);
    const halfWidth = hazard.width * Runtime.scale;
    const gradient = Context.createLinearGradient(sourceX, sourceY, targetX, targetY);
    gradient.addColorStop(0, "rgba(239,226,174,.05)");
    gradient.addColorStop(1, "rgba(239,226,174,.22)");
    Context.fillStyle = gradient;
    Context.beginPath();
    Context.moveTo(sourceX, sourceY);
    Context.lineTo(targetX - halfWidth, targetY + 30);
    Context.lineTo(targetX + halfWidth, targetY + 30);
    Context.closePath();
    Context.fill();
    Context.fillStyle = "rgba(238,221,158,.48)";
    Context.beginPath();
    Context.arc(sourceX, sourceY, 6 * Runtime.scale, 0, Math.PI * 2);
    Context.fill();
  }
  Context.restore();
}

function DrawCover(chapter, state, cover) {
  if (cover.requires && !state.completed.has(cover.requires)) return;
  const x0 = WorldXToScreen(cover.x0);
  const x1 = WorldXToScreen(cover.x1);
  if (x1 < -100 || x0 > Runtime.cssWidth + 100) return;
  const ground = GetGroundY(chapter, (cover.x0 + cover.x1) * 0.5, state, 0) ?? 0;
  const y = WorldYToScreen(ground);
  if (["tallReeds", "reedBank", "willows", "ferryShade"].includes(cover.kind)) {
    for (let x = x0; x <= x1; x += 45 * Runtime.scale) DrawReedClump(x, y + 4, 0.85, "rgba(20,38,32,.94)");
    return;
  }
  if (cover.kind === "underground") return;
  const heights = {
    schoolWall: 205,
    reedBlind: 148,
    collapsedWall: 92,
    ditch: 32,
    bank: 82,
    boatShed: 170,
    sluiceWall: 130,
    reedStack: 118,
    haystack: 130,
    reedScreen: 155,
    dike: 85,
  };
  const height = (heights[cover.kind] || 105) * Runtime.scale;
  Context.fillStyle = cover.kind.includes("reed") || cover.kind === "haystack" ? "#344037" : "#2c3028";
  Context.fillRect(x0, y - height, x1 - x0, height + 5);
  Context.strokeStyle = "rgba(176,164,126,.22)";
  Context.lineWidth = 1;
  for (let stripe = x0 + 10; stripe < x1; stripe += 19 * Runtime.scale) {
    Context.beginPath();
    Context.moveTo(stripe, y - height);
    Context.lineTo(stripe + 8 * Runtime.scale, y);
    Context.stroke();
  }
}

function DrawCart(chapter, state) {
  if (!chapter.cart || state.cartX === null) return;
  const x = WorldXToScreen(state.cartX);
  const y = WorldYToScreen(GetGroundY(chapter, state.cartX, state, 0) ?? 0);
  Context.fillStyle = "#544936";
  Context.fillRect(x - 62 * Runtime.scale, y - 72 * Runtime.scale, 104 * Runtime.scale, 55 * Runtime.scale);
  Context.strokeStyle = "#1b1b16";
  Context.lineWidth = 7 * Runtime.scale;
  Context.beginPath();
  Context.arc(x - 28 * Runtime.scale, y - 13 * Runtime.scale, 28 * Runtime.scale, 0, Math.PI * 2);
  Context.stroke();
  Context.strokeStyle = "#77694e";
  Context.lineWidth = 5 * Runtime.scale;
  Context.beginPath();
  Context.moveTo(x + 38 * Runtime.scale, y - 55 * Runtime.scale);
  Context.lineTo(x + 100 * Runtime.scale, y - 100 * Runtime.scale);
  Context.stroke();
}

function DrawSmoke(chapter, state) {
  if (!chapter.smoke || state.completed.has("sealEastCrack")) return;
  const x = WorldXToScreen(state.smokeFrontX);
  const gradient = Context.createLinearGradient(x - 250, 0, x + 80, 0);
  gradient.addColorStop(0, "rgba(93,98,87,0)");
  gradient.addColorStop(1, "rgba(121,123,105,.46)");
  Context.fillStyle = gradient;
  Context.fillRect(x - 260, WorldYToScreen(160), Runtime.cssWidth - x + 300, WorldYToScreen(-140) - WorldYToScreen(160));
}

function DrawActionMarkers(chapter, state) {
  const now = performance.now() * 0.004;
  for (const action of chapter.actions) {
    if (action.special === "cart" || state.completed.has(action.id) || !RequirementsMet(state, action)) continue;
    const x = WorldXToScreen(action.x);
    if (x < -40 || x > Runtime.cssWidth + 40) continue;
    const ground = GetGroundY(chapter, action.x, state, state.player.y) ?? state.player.y;
    const y = WorldYToScreen(ground) - 75 * Runtime.scale;
    const pulse = 8 + Math.sin(now + action.x) * 2;
    Context.strokeStyle = "rgba(220,202,151,.72)";
    Context.lineWidth = 1.5;
    Context.beginPath();
    Context.arc(x, y, pulse * Runtime.scale, 0, Math.PI * 2);
    Context.stroke();
    Context.fillStyle = "rgba(220,202,151,.8)";
    Context.beginPath();
    Context.arc(x, y, 2.5 * Runtime.scale, 0, Math.PI * 2);
    Context.fill();
  }
}

function DrawPerson(x, y, options = {}) {
  const child = Boolean(options.child);
  const crouching = Boolean(options.crouching);
  const facing = options.facing || 1;
  const active = options.active !== false;
  const scale = Runtime.scale * (child ? 0.72 : 1);
  const baseX = WorldXToScreen(x);
  const baseY = WorldYToScreen(y);
  const walk = Math.sin((options.walkPhase || 0) * 8) * (options.moving ? 1 : 0);
  const bodyHeight = crouching ? 47 : 74;
  Context.save();
  Context.translate(baseX, baseY);
  Context.scale(facing, 1);
  Context.strokeStyle = active ? (child ? "#c3b995" : "#d3d1bd") : "#6f7870";
  Context.fillStyle = active ? (child ? "#766c52" : "#424b43") : "#303934";
  Context.lineCap = "round";
  Context.lineWidth = 7 * scale;
  Context.beginPath();
  Context.moveTo(-8 * scale, -bodyHeight * scale * 0.52);
  Context.lineTo((-12 + walk * 8) * scale, -3 * scale);
  Context.moveTo(9 * scale, -bodyHeight * scale * 0.5);
  Context.lineTo((13 - walk * 8) * scale, -3 * scale);
  Context.stroke();
  Context.fillRect(-15 * scale, -bodyHeight * scale, 30 * scale, bodyHeight * scale * 0.58);
  Context.strokeStyle = active ? "#b7b59f" : "#626b64";
  Context.lineWidth = 6 * scale;
  Context.beginPath();
  Context.moveTo(-8 * scale, -bodyHeight * scale * 0.78);
  Context.lineTo((22 + Math.abs(walk) * 3) * scale, -bodyHeight * scale * 0.54);
  Context.stroke();
  Context.fillStyle = active ? "#c3b998" : "#6b7269";
  Context.beginPath();
  Context.arc(0, -(bodyHeight + 13) * scale, 12 * scale, 0, Math.PI * 2);
  Context.fill();
  if (options.carrying) {
    Context.fillStyle = "#83765a";
    Context.beginPath();
    Context.arc(18 * scale, -bodyHeight * scale * 0.72, 12 * scale, 0, Math.PI * 2);
    Context.fill();
  }
  Context.restore();
}

function DrawActors(chapter, state) {
  for (const follower of state.followers) {
    DrawPerson(follower.x, follower.y, {
      child: true,
      facing: follower.facing,
      moving: !state.followersHolding && Math.abs(state.player.vx) > 8,
      walkPhase: state.elapsed + follower.nameIndex * 0.17,
    });
  }
  DrawPerson(state.player.x, state.player.y, {
    facing: state.player.facing,
    crouching: state.player.crouching,
    carrying: state.player.carrying,
    moving: Math.abs(state.player.vx) > 8,
    walkPhase: state.elapsed,
  });
  if (chapter.id === "ferry" && !state.completed.has("motherSignal")) {
    DrawPerson(2020, 0, { facing: -1, active: true });
  } else if (chapter.id === "ferry" && state.completed.has("motherSignal")) {
    const motherX = 2070 + Math.min(480, Math.max(0, state.elapsed - 1) * 10);
    DrawPerson(motherX, 0, { facing: 1, active: false, moving: true, walkPhase: state.elapsed });
    const lampX = WorldXToScreen(motherX + 24);
    const lampY = WorldYToScreen(62);
    const glow = Context.createRadialGradient(lampX, lampY, 2, lampX, lampY, 60 * Runtime.scale);
    glow.addColorStop(0, "rgba(229,177,86,.65)");
    glow.addColorStop(1, "rgba(229,177,86,0)");
    Context.fillStyle = glow;
    Context.beginPath();
    Context.arc(lampX, lampY, 60 * Runtime.scale, 0, Math.PI * 2);
    Context.fill();
  }
}

function DrawForeground(chapter) {
  if (chapter.id === "tunnel") {
    Context.fillStyle = "rgba(8,9,8,.82)";
    Context.fillRect(0, 0, Runtime.cssWidth, Runtime.cssHeight * 0.13);
    return;
  }
  const y = Runtime.cssHeight + 10;
  for (let x = -30; x < Runtime.cssWidth + 50; x += 78) DrawReedClump(x, y, 1.15, "rgba(5,12,11,.72)");
}

function RenderGame(state) {
  const chapter = GetChapter(state.chapterIndex);
  DrawSky(chapter, state);
  DrawSearchlights(chapter, state);
  DrawTerrain(chapter, state);
  DrawSmoke(chapter, state);
  for (const cover of chapter.covers) DrawCover(chapter, state, cover);
  DrawCart(chapter, state);
  DrawActionMarkers(chapter, state);
  DrawActors(chapter, state);
  DrawForeground(chapter);

  Context.save();
  Context.fillStyle = "rgba(222,217,190,.35)";
  Context.font = `${Math.round(10 * Runtime.scale)}px ui-sans-serif, system-ui, sans-serif`;
  Context.letterSpacing = "1px";
  Context.fillText(`${chapter.location} · ${chapter.date}`, 18, Runtime.cssHeight - 18);
  Context.restore();
}

function UpdatePreview(deltaTime) {
  Runtime.previewState.elapsed += deltaTime;
  Runtime.previewState.player.x = 520 + Math.sin(Runtime.previewState.elapsed * 0.17) * 140;
  Runtime.previewState.player.y = GetGroundY(GetChapter(0), Runtime.previewState.player.x, Runtime.previewState, 0) ?? 0;
  Runtime.previewState.player.crouching = true;
  Runtime.cameraX += (720 - Runtime.cameraX) * Math.min(1, deltaTime * 0.4);
}

function UpdateGame(deltaTime) {
  if (!Runtime.state) return;
  if (Runtime.state.mode === "playing") {
    StepGameState(Runtime.state, InputState, deltaTime);
    const desiredCamera = Runtime.state.player.x + Runtime.state.player.facing * Math.min(250, Runtime.cssWidth * 0.18 / Runtime.scale);
    const chapter = GetChapter(Runtime.state.chapterIndex);
    const halfView = Runtime.cssWidth * 0.5 / Runtime.scale;
    const clampedCamera = Math.max(halfView * 0.72, Math.min(chapter.width - halfView * 0.72, desiredCamera));
    Runtime.cameraX += (clampedCamera - Runtime.cameraX) * Math.min(1, deltaTime * 3.1);
    DrainEvents();
    UpdateHud();
    WriteSave();
    if (Runtime.state.mode === "ending" || Runtime.state.endingReady) ShowEnding();
    else if (IsChapterReady(Runtime.state) && Runtime.storyQueue.length === 0 && performance.now() > Runtime.storyUntil) ShowChapterComplete();
    if (Math.abs(Runtime.state.player.vx) > 30 && Runtime.state.player.grounded && performance.now() - Runtime.lastFootstepAt > (Runtime.state.player.crouching ? 620 : 390)) {
      Runtime.lastFootstepAt = performance.now();
      PlayTone("soft");
    }
  } else {
    DrainEvents();
  }
}

function AnimationFrame(now) {
  const deltaTime = Math.min(0.05, Math.max(0, (now - Runtime.previousTime) / 1000));
  Runtime.previousTime = now;
  if (Runtime.state) {
    UpdateGame(deltaTime);
    RenderGame(Runtime.state);
  } else {
    UpdatePreview(deltaTime);
    RenderGame(Runtime.previewState);
  }
  ConsumePressedInput();
  requestAnimationFrame(AnimationFrame);
}

function HandleKeyDown(event) {
  const code = event.code;
  if (["ArrowLeft", "ArrowRight", "ArrowDown", "Space", "KeyA", "KeyD", "KeyS", "KeyE", "KeyF"].includes(code)) event.preventDefault();
  if (code === "Escape") {
    if (!Ui.history.hidden) CloseHistory();
    else if (Runtime.state?.mode === "paused") ResumeGame();
    else PauseGame();
    return;
  }
  if (code === "ArrowLeft" || code === "KeyA") InputState.left = true;
  if (code === "ArrowRight" || code === "KeyD") InputState.right = true;
  if (code === "ArrowDown" || code === "KeyS") InputState.crouch = true;
  if (code === "Space" && !event.repeat) InputState.jumpPressed = true;
  if (code === "KeyE") {
    if (!InputState.interact) InputState.interactPressed = true;
    InputState.interact = true;
  }
  if (code === "KeyF" && !event.repeat) InputState.commandPressed = true;
}

function HandleKeyUp(event) {
  const code = event.code;
  if (code === "ArrowLeft" || code === "KeyA") InputState.left = false;
  if (code === "ArrowRight" || code === "KeyD") InputState.right = false;
  if (code === "ArrowDown" || code === "KeyS") InputState.crouch = false;
  if (code === "KeyE") InputState.interact = false;
}

function BindTouchControls() {
  const buttons = Ui.touchControls.querySelectorAll("button[data-input]");
  for (const button of buttons) {
    const name = button.dataset.input;
    const press = (event) => {
      event.preventDefault();
      ResumeAudio();
      button.setPointerCapture?.(event.pointerId);
      button.classList.add("isHeld");
      if (name === "left" || name === "right" || name === "crouch") InputState[name] = true;
      if (name === "interact") {
        InputState.interact = true;
        InputState.interactPressed = true;
      }
      if (name === "jump") InputState.jumpPressed = true;
      if (name === "command") InputState.commandPressed = true;
    };
    const release = (event) => {
      event.preventDefault();
      button.classList.remove("isHeld");
      if (name === "left" || name === "right" || name === "crouch") InputState[name] = false;
      if (name === "interact") InputState.interact = false;
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }
}

function BindUi() {
  Ui.start.addEventListener("click", StartNewStory);
  Ui.continue.addEventListener("click", ContinueStory);
  Ui.enterChapter.addEventListener("click", EnterChapter);
  Ui.historyButton.addEventListener("click", () => ShowHistory("title"));
  Ui.pauseHistoryButton.addEventListener("click", () => { Ui.pause.hidden = true; ShowHistory("pause"); });
  Ui.endingHistoryButton.addEventListener("click", () => ShowHistory("ending"));
  Ui.closeHistory.addEventListener("click", CloseHistory);
  Ui.historyBack.addEventListener("click", CloseHistory);
  Ui.pauseButton.addEventListener("click", PauseGame);
  Ui.resume.addEventListener("click", ResumeGame);
  Ui.restartChapter.addEventListener("click", RestartCurrentChapter);
  Ui.returnTitle.addEventListener("click", ReturnToTitle);
  Ui.nextChapter.addEventListener("click", GoToNextChapter);
  Ui.rollCallButton.addEventListener("click", BeginRollCall);
  Ui.restartStory.addEventListener("click", StartNewStory);
  Ui.soundButton.addEventListener("click", () => {
    Runtime.muted = !Runtime.muted;
    Ui.soundButton.classList.toggle("isMuted", Runtime.muted);
    if (Runtime.audio) Runtime.audio.master.gain.setTargetAtTime(Runtime.muted ? 0 : 0.34, Runtime.audio.context.currentTime, 0.05);
  });
  window.addEventListener("keydown", HandleKeyDown, { passive: false });
  window.addEventListener("keyup", HandleKeyUp);
  window.addEventListener("blur", () => {
    InputState.left = false;
    InputState.right = false;
    InputState.crouch = false;
    InputState.interact = false;
  });
  window.addEventListener("resize", ResizeCanvas);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && Runtime.state?.mode === "playing") PauseGame();
  });
  BindTouchControls();
}

function Initialize() {
  PopulateHistory();
  BindUi();
  ResizeCanvas();
  Ui.continue.hidden = !HasSave();
  Runtime.previousTime = performance.now();
  requestAnimationFrame(AnimationFrame);
}

window.ReedSignal1942 = Object.freeze({
  GetState: () => Runtime.state,
  StartChapter: (chapterIndex) => {
    Runtime.introPendingState = CreateGameState(chapterIndex);
    EnterChapter();
  },
  ShowHistory,
});

Initialize();
