import { Chapters, GameMetadata, HistoricalSources, GetAllChildNames, GetChapter } from "./Data_World.mjs?v=20260808z11";
import { GetActionCinematic, GetChapterOpeningCinematic } from "./Data_Cinematics.mjs?v=20260808z11";
import {
  CreateGameState,
  RestoreGameState,
  SerializeGameState,
  StepGameState,
  GetAvailableAction,
  GetBlockedActionReason,
  GetGroundY,
  GetObjective,
  GetWindStrength,
  IsWindGust,
  IsChapterReady,
  AdvanceChapter,
  CompleteAction,
  RequirementsMet,
} from "./Script_Rules.mjs?v=20260808z11";
import { CreateCinematicDirector } from "./Script_Cinematics3D.mjs?v=20260808z11";
import { CreateRender3D, PreloadRender3D } from "./Script_Render3D.mjs?v=20260808z11";

const Ui = {
  shell: document.getElementById("GameShell"),
  canvas: document.getElementById("GameCanvas"),
  loading: document.getElementById("LoadingScreen"),
  loadingText: document.getElementById("LoadingText"),
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
  cinematicOverlay: document.getElementById("CinematicOverlay"),
  cinematicCaption: document.getElementById("CinematicCaption"),
  cinematicSkip: document.getElementById("SkipCinematicButton"),
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

const InputState = {
  left: false,
  right: false,
  crouch: false,
  jumpPressed: false,
  interact: false,
  interactPressed: false,
  commandPressed: false,
  cinematicSkipPressed: false,
};

const Runtime = {
  state: null,
  previewState: CreateGameState(0),
  render: null,
  previousTime: performance.now(),
  storyUntil: 0,
  storyQueue: [],
  lastSaveSignature: "",
  lastSaveAt: 0,
  introPendingState: null,
  historyReturn: "title",
  muted: false,
  audio: null,
  ambient: null,
  transientKeys: new Map(),
  chapterCompleteShown: false,
  cinematics: CreateCinematicDirector({ reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches }),
  cinematicFrame: null,
  lastCinematicEvent: "",
  pendingEnding: false,
  lastFootstepAt: 0,
  error: null,
};

function CreateAudio() {
  if (Runtime.audio) return Runtime.audio;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = Runtime.muted ? 0 : 0.3;
  master.connect(context.destination);
  Runtime.audio = { context, master };
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (0.31 + Math.sin(index * 0.00021) * 0.17);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  filter.type = "lowpass";
  filter.frequency.value = 510;
  gain.gain.value = 0.048;
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
    soft: [156, 0.052, 0.15, "sine"],
    action: [226, 0.09, 0.26, "triangle"],
    alert: [82, 0.12, 0.38, "sawtooth"],
    bell: [371, 0.15, 2.1, "sine"],
    water: [116, 0.075, 0.66, "sine"],
    paper: [244, 0.024, 0.11, "triangle"],
    wind: [94, 0.038, 0.82, "sine"],
    smoke: [68, 0.032, 0.74, "sawtooth"],
    knock: [184, 0.052, 0.09, "square"],
    cloth: [132, 0.026, 0.16, "triangle"],
    plank: [108, 0.072, 0.14, "triangle"],
    rope: [88, 0.043, 0.24, "sawtooth"],
  }[kind] || [156, 0.052, 0.15, "sine"];
  oscillator.type = settings[3];
  oscillator.frequency.setValueAtTime(settings[0], now);
  if (kind === "bell") oscillator.frequency.exponentialRampToValueAtTime(184, now + settings[2]);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(settings[1], now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[2]);
  filter.type = "lowpass";
  filter.frequency.value = kind === "alert" ? 360 : 1180;
  oscillator.connect(filter).connect(gain).connect(audio.master);
  oscillator.start(now);
  oscillator.stop(now + settings[2] + 0.05);
}

function ResetCinematic() {
  Runtime.cinematics.Finish("cancelled");
  Runtime.cinematics.ConsumeFinished();
  Runtime.cinematicFrame = null;
  Runtime.lastCinematicEvent = "";
  Runtime.pendingEnding = false;
  Ui.cinematicOverlay.hidden = true;
  Ui.shell.classList.remove("isCinematic");
}

function BeginCinematic(sequenceId) {
  if (!sequenceId || !Runtime.cinematics.Start(sequenceId)) return false;
  Runtime.cinematicFrame = Runtime.cinematics.GetFrame();
  Runtime.lastCinematicEvent = "";
  Ui.cinematicOverlay.hidden = false;
  Ui.shell.classList.add("isCinematic");
  return true;
}

function UpdateCinematic(deltaTime) {
  const frame = Runtime.cinematics.Update(deltaTime, InputState.cinematicSkipPressed);
  Runtime.cinematicFrame = frame;
  if (frame) {
    Ui.cinematicOverlay.hidden = false;
    Ui.shell.classList.add("isCinematic");
    Ui.cinematicCaption.textContent = frame.caption;
    Ui.cinematicSkip.hidden = !frame.canSkip;
    if (frame.eventKey !== Runtime.lastCinematicEvent) {
      Runtime.lastCinematicEvent = frame.eventKey;
      Ui.cinematicOverlay.classList.remove("isShotCut");
      void Ui.cinematicOverlay.offsetWidth;
      Ui.cinematicOverlay.classList.add("isShotCut");
      if (frame.soundCue) PlayTone(frame.soundCue);
    }
    Ui.storyCaption.hidden = true;
  } else {
    const finished = Runtime.cinematics.ConsumeFinished();
    if (finished) {
      Ui.cinematicOverlay.hidden = true;
      Ui.shell.classList.remove("isCinematic");
      Runtime.lastCinematicEvent = "";
      if (finished.blocksEnding && Runtime.state?.endingReady) {
        Runtime.pendingEnding = true;
        Runtime.state.mode = "ending";
      }
    }
  }
  return frame;
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

function ShowHistory(returnTarget = "title") {
  Runtime.historyReturn = returnTarget;
  Ui.history.hidden = false;
  Ui.history.scrollTop = 0;
}

function CloseHistory() {
  Ui.history.hidden = true;
  if (Runtime.historyReturn === "pause") Ui.pause.hidden = false;
}

function HasSave() {
  try { return Boolean(localStorage.getItem(GameMetadata.saveKey)); } catch { return false; }
}

function ReadSave() {
  try {
    const serialized = localStorage.getItem(GameMetadata.saveKey);
    return serialized ? RestoreGameState(serialized) : null;
  } catch { return null; }
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
  } catch { /* storage is optional */ }
}

function ClearSave() {
  try { localStorage.removeItem(GameMetadata.saveKey); } catch { /* storage is optional */ }
  Runtime.lastSaveSignature = "";
}

function SetGameplayChrome(visible) {
  Ui.gameHeader.hidden = !visible;
  Ui.objectiveCard.hidden = !visible;
  Ui.controlGuide.hidden = !visible;
  Ui.touchControls.hidden = !visible;
  if (!visible) {
    Ui.windCard.hidden = true;
    Ui.suspicionCard.hidden = true;
    Ui.teamCard.hidden = true;
    Ui.interaction.hidden = true;
  }
}

function PrepareChapterIntro(state) {
  ResetCinematic();
  const chapter = GetChapter(state.chapterIndex);
  Runtime.introPendingState = state;
  Ui.pause.hidden = true;
  Ui.complete.hidden = true;
  Ui.ending.hidden = true;
  SetGameplayChrome(false);
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
  Runtime.chapterCompleteShown = false;
  Runtime.storyQueue.length = 0;
  Runtime.storyUntil = 0;
  Runtime.pendingEnding = false;
  Ui.intro.hidden = true;
  Ui.complete.hidden = true;
  Ui.ending.hidden = true;
  SetGameplayChrome(true);
  const chapter = GetChapter(Runtime.state.chapterIndex);
  Ui.hudChapterNumber.textContent = chapter.number;
  Ui.hudChapterTitle.textContent = chapter.title;
  Runtime.state.mode = "playing";
  Runtime.render.SetChapter(Runtime.state.chapterIndex, chapter, Runtime.state);
  BeginCinematic(GetChapterOpeningCinematic(chapter.id));
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
  PrepareChapterIntro(ReadSave() || CreateGameState(0));
}

function ReturnToTitle() {
  if (Runtime.state) WriteSave(true);
  Runtime.state = null;
  Runtime.previewState = CreateGameState(0);
  Runtime.previewState.player.x = 430;
  Runtime.previewState.player.crouching = true;
  ResetCinematic();
  Runtime.render.SetChapter(0, GetChapter(0), Runtime.previewState);
  Ui.pause.hidden = true;
  Ui.complete.hidden = true;
  Ui.ending.hidden = true;
  Ui.intro.hidden = true;
  SetGameplayChrome(false);
  Ui.storyCaption.hidden = true;
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
  PrepareChapterIntro(CreateGameState(Runtime.state.chapterIndex));
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
  PrepareChapterIntro(AdvanceChapter(Runtime.state));
}

function ShowEnding() {
  if (!Runtime.state || !Ui.ending.hidden) return;
  Runtime.pendingEnding = false;
  Ui.cinematicOverlay.hidden = true;
  Ui.shell.classList.remove("isCinematic");
  SetGameplayChrome(false);
  Ui.storyCaption.hidden = true;
  Ui.ending.hidden = false;
  Ui.rollCallButton.hidden = false;
  Ui.rollCallButton.disabled = false;
  Ui.endingQuote.hidden = true;
  Ui.endingHistory.hidden = true;
  Ui.endingActions.hidden = true;
  const rollCallEntries = [
    ...GetAllChildNames().map((name) => ({ name, response: "到" })),
    { name: "阿苇", response: "到" },
    { name: "周禾老师", response: "没有回答", silent: true },
  ];
  Ui.rollCallList.replaceChildren(...rollCallEntries.map((entry) => {
    const item = document.createElement("li");
    item.textContent = entry.name;
    if (entry.silent) item.dataset.silent = "true";
    const response = document.createElement("span");
    response.textContent = entry.response;
    item.append(response);
    return item;
  }));
  ClearSave();
}

function BeginRollCall() {
  Ui.rollCallButton.disabled = true;
  Ui.rollCallButton.hidden = true;
  const items = [...Ui.rollCallList.children];
  items.forEach((item, index) => {
    window.setTimeout(() => {
      item.classList.add("isCalled");
      if (item.dataset.silent !== "true") PlayTone("soft");
    }, 420 + index * 660);
  });
  window.setTimeout(() => { Ui.endingQuote.hidden = false; PlayTone("bell"); }, 650 + items.length * 660);
  window.setTimeout(() => {
    Ui.endingHistory.hidden = false;
    Ui.endingActions.hidden = false;
  }, 2200 + items.length * 660);
}

function ShowStory(text, type = "story") {
  if (!text) return;
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
    const sequenceId = event.cue ? GetActionCinematic(event.cue) : null;
    if (sequenceId && BeginCinematic(sequenceId) && Runtime.state.cinematicCue?.actionId === event.cue) {
      Runtime.state.cinematicCue = null;
    }
    Runtime.storyQueue.push(event);
  }
  if (Runtime.cinematics.IsPlaying()) return;
  if (Runtime.storyUntil > now) return;
  if (Runtime.storyQueue.length) {
    const event = Runtime.storyQueue.shift();
    ShowStory(event.text, event.type);
    WriteSave(true);
  } else {
    Ui.storyCaption.hidden = true;
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
  Ui.dangerWash.style.opacity = String(Math.max(0, state.suspicion * 0.78));
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
    if (Ui.teamDots.children.length !== state.followers.length) Ui.teamDots.replaceChildren(...state.followers.map(() => document.createElement("i")));
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
  InputState.cinematicSkipPressed = false;
}

function UpdatePreview(deltaTime) {
  const state = Runtime.previewState;
  state.elapsed += deltaTime;
  state.player.x = 420 + Math.sin(state.elapsed * 0.18) * 52;
  state.player.y = GetGroundY(GetChapter(0), state.player.x, state, 0) ?? 0;
  state.player.vx = Math.cos(state.elapsed * 0.18) * 9;
  state.player.facing = state.player.vx >= 0 ? 1 : -1;
  state.player.crouching = false;
}

function UpdateGame(deltaTime) {
  if (!Runtime.state) return;
  const cinematic = Runtime.state.mode === "paused" ? Runtime.cinematics.GetFrame() : UpdateCinematic(deltaTime);
  if (Runtime.state.mode === "playing") {
    if (!cinematic?.locksInput) StepGameState(Runtime.state, InputState, deltaTime);
    else Runtime.state.player.vx = 0;
    DrainEvents();
    UpdateHud();
    WriteSave();
    if (!Runtime.state.endingReady && !Runtime.cinematics.IsPlaying() && IsChapterReady(Runtime.state) && Runtime.storyQueue.length === 0 && performance.now() > Runtime.storyUntil) ShowChapterComplete();
    if (Math.abs(Runtime.state.player.vx) > 30 && Runtime.state.player.grounded && performance.now() - Runtime.lastFootstepAt > (Runtime.state.player.crouching ? 620 : 390)) {
      Runtime.lastFootstepAt = performance.now();
      PlayTone("soft");
    }
  } else {
    DrainEvents();
  }
  if (Runtime.state.endingReady) {
    Runtime.pendingEnding = Runtime.cinematics.IsPlaying();
    if (!Runtime.pendingEnding) {
      Runtime.state.mode = "ending";
      ShowEnding();
    }
  }
}

function AnimationFrame(now) {
  const deltaTime = Math.min(0.05, Math.max(0, (now - Runtime.previousTime) / 1000));
  Runtime.previousTime = now;
  try {
    if (Runtime.state) {
      UpdateGame(deltaTime);
      Runtime.render.Render(Runtime.state, GetChapter(Runtime.state.chapterIndex), deltaTime, Runtime.cinematicFrame);
    } else {
      UpdatePreview(deltaTime);
      Runtime.render.Render(Runtime.previewState, GetChapter(0), deltaTime);
    }
    const stats = Runtime.render.stats;
    Ui.canvas.dataset.renderCalls = String(stats.calls || 0);
    Ui.canvas.dataset.renderTriangles = String(stats.triangles || 0);
    Ui.canvas.dataset.renderQuality = stats.quality || "unknown";
    Ui.canvas.dataset.renderChapter = stats.chapter || "school";
    Ui.canvas.dataset.blenderAssets = String(stats.blenderAssets || 0);
    Ui.canvas.dataset.assetKitReady = String(Boolean(stats.assetKitReady));
    Ui.canvas.dataset.postFxReady = String(Boolean(stats.postFxReady));
    Ui.canvas.dataset.postFxQuality = String(stats.postFxQuality ?? 0);
    Ui.canvas.dataset.cinematic = Runtime.cinematicFrame?.id || "";
    Ui.canvas.dataset.playerScreenX = String((stats.playerNdcX * 0.5 + 0.5) * Ui.canvas.clientWidth);
    Ui.canvas.dataset.playerScreenTop = String((-stats.playerTopNdcY * 0.5 + 0.5) * Ui.canvas.clientHeight);
    Ui.canvas.dataset.playerScreenHeight = String((stats.playerTopNdcY - stats.playerBottomNdcY) * 0.5 * Ui.canvas.clientHeight);
  } catch (error) {
    Runtime.error = error instanceof Error ? error.stack || error.message : String(error);
    console.error(error);
    if (Ui.loadingText) Ui.loadingText.textContent = "3D 场景初始化失败，请刷新页面或更新浏览器。";
    if (Ui.loading) Ui.loading.hidden = false;
  }
  ConsumePressedInput();
  requestAnimationFrame(AnimationFrame);
}

function HandleKeyDown(event) {
  const code = event.code;
  if (["ArrowLeft", "ArrowRight", "ArrowDown", "Space", "KeyA", "KeyD", "KeyS", "KeyE", "KeyF"].includes(code)) event.preventDefault();
  if (Runtime.cinematics.IsPlaying()) {
    if (code === "Escape" && !event.repeat) InputState.cinematicSkipPressed = true;
    return;
  }
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
  for (const button of Ui.touchControls.querySelectorAll("button[data-input]")) {
    const name = button.dataset.input;
    const press = (event) => {
      event.preventDefault();
      ResumeAudio();
      if (Runtime.cinematics.IsPlaying()) return;
      button.setPointerCapture?.(event.pointerId);
      button.classList.add("isHeld");
      if (["left", "right", "crouch"].includes(name)) InputState[name] = true;
      if (name === "interact") { InputState.interact = true; InputState.interactPressed = true; }
      if (name === "jump") InputState.jumpPressed = true;
      if (name === "command") InputState.commandPressed = true;
    };
    const release = (event) => {
      event.preventDefault();
      button.classList.remove("isHeld");
      if (["left", "right", "crouch"].includes(name)) InputState[name] = false;
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
  Ui.cinematicSkip.addEventListener("click", () => { InputState.cinematicSkipPressed = true; });
  Ui.restartStory.addEventListener("click", StartNewStory);
  Ui.soundButton.addEventListener("click", () => {
    Runtime.muted = !Runtime.muted;
    Ui.soundButton.classList.toggle("isMuted", Runtime.muted);
    if (Runtime.audio) Runtime.audio.master.gain.setTargetAtTime(Runtime.muted ? 0 : 0.3, Runtime.audio.context.currentTime, 0.05);
  });
  window.addEventListener("keydown", HandleKeyDown, { passive: false });
  window.addEventListener("keyup", HandleKeyUp);
  window.addEventListener("blur", () => {
    InputState.left = false;
    InputState.right = false;
    InputState.crouch = false;
    InputState.interact = false;
  });
  window.addEventListener("resize", () => Runtime.render?.Resize());
  document.addEventListener("visibilitychange", () => { if (document.hidden && Runtime.state?.mode === "playing") PauseGame(); });
  BindTouchControls();
}

function StartQaChapter(chapterIndex, playerX = null, completedIds = []) {
  ResetCinematic();
  Runtime.state = CreateGameState(Math.max(0, Math.min(Chapters.length - 1, chapterIndex)));
  const chapter = GetChapter(Runtime.state.chapterIndex);
  for (const action of chapter.actions) if (completedIds.includes(action.id)) CompleteAction(Runtime.state, action);
  if (chapter.cart && completedIds.includes("cartPlaced")) Runtime.state.cartX = chapter.cart.targetX;
  if (Number.isFinite(playerX)) {
    Runtime.state.player.x = playerX;
    Runtime.state.player.y = GetGroundY(GetChapter(Runtime.state.chapterIndex), playerX, Runtime.state, 0) ?? 0;
  }
  Runtime.state.mode = "paused";
  Ui.title.hidden = true;
  Ui.intro.hidden = true;
  Ui.loading.hidden = true;
  SetGameplayChrome(false);
  Runtime.render.SetChapter(Runtime.state.chapterIndex, chapter, Runtime.state);
  return Runtime.state;
}

async function Initialize() {
  PopulateHistory();
  BindUi();
  Runtime.previewState.player.x = 430;
  Runtime.previewState.player.crouching = true;
  await PreloadRender3D();
  Runtime.render = CreateRender3D(Ui.canvas, GetChapter(0), Runtime.previewState);
  Ui.continue.hidden = !HasSave();
  Ui.loading.hidden = true;
  Runtime.previousTime = performance.now();
  const query = new URLSearchParams(window.location.search);
  if (query.has("qaChapter")) {
    const completedIds = (query.get("qaCompleted") || "").split(",").map((id) => id.trim()).filter(Boolean);
    StartQaChapter(Number(query.get("qaChapter")), query.has("qaX") ? Number(query.get("qaX")) : null, completedIds);
    if (query.get("qaCinematic")) {
      Runtime.state.mode = "playing";
      BeginCinematic(query.get("qaCinematic"));
    }
  }
  requestAnimationFrame(AnimationFrame);
}

window.addEventListener("error", (event) => { Runtime.error = event.error?.stack || event.message; });
window.addEventListener("unhandledrejection", (event) => { Runtime.error = event.reason?.stack || String(event.reason); });

Initialize().catch((error) => {
  Runtime.error = error instanceof Error ? error.stack || error.message : String(error);
  console.error(error);
  if (Ui.loadingText) Ui.loadingText.textContent = "无法建立 3D 场景，请刷新页面或更新浏览器。";
});

window.ReedSignal1942 = Object.freeze({
  GetState: () => Runtime.state,
  GetError: () => Runtime.error,
  StartChapter: StartQaChapter,
  StartCinematic: BeginCinematic,
  GetCinematic: () => Runtime.cinematicFrame,
  ShowHistory,
  get render() { return Runtime.render; },
});
