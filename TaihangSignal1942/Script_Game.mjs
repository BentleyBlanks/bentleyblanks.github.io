import {
  contentNotice,
  gameConfig,
  historicalSources,
  historicalTerms,
} from "./Data_History.mjs?v=2";
import {
  chapters,
  evacueeNames,
  GetChapter,
  GetConsequence,
  speakerDefinitions,
} from "./Data_Story.mjs?v=2";

const defaultSettings = Object.freeze({
  fontScale: 1,
  highContrast: false,
  reducedMotion: false,
  soundEnabled: false,
});

export function CreateInitialState() {
  return {
    saveVersion: gameConfig.saveVersion,
    chapterIndex: 0,
    stage: "intro",
    lineIndex: 0,
    observed: {},
    choices: {},
    transcript: [],
    transcriptKeys: [],
    completedChapters: [],
    rollCallIndex: 0,
    rollCallPaused: false,
    lastClueId: null,
    viewOffset: 0,
    zoom: 1,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completed: false,
  };
}

export function NormalizeState(rawState) {
  const initialState = CreateInitialState();
  if (!rawState || rawState.saveVersion !== gameConfig.saveVersion) return initialState;
  const chapterIndex = Math.max(0, Math.min(chapters.length - 1, Number(rawState.chapterIndex) || 0));
  const validStages = new Set(["intro", "explore", "ready", "dialogue", "choice", "choiceDialogue", "rollcall", "transition", "ending"]);
  const normalized = {
    ...initialState,
    ...rawState,
    chapterIndex,
    stage: validStages.has(rawState.stage) ? rawState.stage : "intro",
    lineIndex: Math.max(0, Number(rawState.lineIndex) || 0),
    observed: rawState.observed && typeof rawState.observed === "object" ? rawState.observed : {},
    choices: rawState.choices && typeof rawState.choices === "object" ? rawState.choices : {},
    transcript: Array.isArray(rawState.transcript) ? rawState.transcript.slice(-240) : [],
    transcriptKeys: Array.isArray(rawState.transcriptKeys) ? rawState.transcriptKeys.slice(-320) : [],
    completedChapters: Array.isArray(rawState.completedChapters) ? rawState.completedChapters : [],
    rollCallIndex: Math.max(0, Math.min(67, Number(rawState.rollCallIndex) || 0)),
    viewOffset: Math.max(-0.16, Math.min(0.16, Number(rawState.viewOffset) || 0)),
    zoom: Math.max(1, Math.min(1.35, Number(rawState.zoom) || 1)),
    completed: Boolean(rawState.completed),
  };
  if (normalized.stage === "transition" && !normalized.completed) {
    normalized.chapterIndex = Math.min(chapters.length - 1, normalized.chapterIndex + 1);
    normalized.stage = "intro";
    normalized.lineIndex = 0;
    normalized.lastClueId = null;
    normalized.viewOffset = 0;
    normalized.zoom = 1;
  }
  if (normalized.completed) normalized.stage = "ending";
  return normalized;
}

export function GetObservedCount(state, chapter = GetChapter(state.chapterIndex)) {
  const chapterObserved = Array.isArray(state.observed[chapter.id]) ? state.observed[chapter.id] : [];
  return chapter.requiredClues.filter((clueId) => chapterObserved.includes(clueId)).length;
}

export function CanTriggerChapterAction(state, chapter = GetChapter(state.chapterIndex)) {
  return GetObservedCount(state, chapter) >= chapter.requiredClues.length
    && ["explore", "ready"].includes(state.stage);
}

export function SelectChoice(state, choiceId) {
  const chapter = GetChapter(state.chapterIndex);
  const option = chapter.choice?.options.find((candidate) => candidate.id === choiceId);
  if (!option) return { valid: false, reason: "当前章节没有这个选择。" };
  state.choices[chapter.choice.id] = choiceId;
  state.stage = "choiceDialogue";
  state.lineIndex = 0;
  state.updatedAt = Date.now();
  return { valid: true, option };
}

function EscapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function LoadJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function SaveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function RemoveStored(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // The game remains playable when storage is unavailable.
  }
}

function InitializeGame() {
  const element = {};
  [
    "openingScreen", "openingCanvas", "startButton", "continueButton", "gameShell", "gameMain",
    "brandButton", "chapterDate", "chapterTitle", "lineStatusText", "sceneCanvas", "hotspotLayer",
    "objectiveText", "objectiveProgressText", "objectiveProgressFill", "locationText", "weatherText",
    "panLeftButton", "panRightButton", "zoomOutButton", "zoomInButton", "zoomText", "soundButton",
    "soundLabel", "clueDrawer", "clueDrawerToggle", "clueCounter", "clueList", "speakerBadge",
    "speakerName", "speakerChannel", "dialogueText", "advanceButton", "rollCallModeButton", "phoneButton", "phoneButtonLabel",
    "phoneButtonHint", "interactionHint", "modalLayer", "choiceModal", "choiceTitle", "choiceContext",
    "choiceOptions", "historyModal", "historyContent", "journalModal", "journalContent", "transcriptModal",
    "transcriptContent", "settingsModal", "fontScaleSelect", "contrastToggle", "motionToggle",
    "soundToggleSetting", "restartButton", "endingScreen", "endingCanvas", "endingConsequences", "reviewJournalButton",
    "replayButton",
  ].forEach((id) => { element[id] = document.getElementById(id); });

  let gameState = CreateInitialState();
  let settings = LoadSettings();
  let activeModal = null;
  let focusBeforeModal = null;
  let audioContext = null;
  let animationFrame = 0;
  let rollCallTimer = 0;
  let phoneHoldFrame = 0;
  let phoneHoldStart = 0;
  let phoneActionAt = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartOffset = 0;
  let latestSceneWidth = 0;
  let latestSceneHeight = 0;

  function LoadSettings() {
    const stored = LoadJson(gameConfig.settingsKey) || {};
    return {
      ...defaultSettings,
      ...stored,
      reducedMotion: stored.reducedMotion
        ?? window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
        ?? false,
    };
  }

  function SaveSettings() {
    SaveJson(gameConfig.settingsKey, settings);
  }

  function ApplySettings() {
    const root = document.documentElement;
    root.style.setProperty("--font-scale", String(settings.fontScale));
    root.dataset.highContrast = String(settings.highContrast);
    root.dataset.reducedMotion = String(settings.reducedMotion);
    element.fontScaleSelect.value = String(settings.fontScale);
    element.contrastToggle.checked = settings.highContrast;
    element.motionToggle.checked = settings.reducedMotion;
    element.soundToggleSetting.checked = settings.soundEnabled;
    element.soundButton.setAttribute("aria-pressed", String(settings.soundEnabled));
    element.soundLabel.textContent = `声音：${settings.soundEnabled ? "开" : "关"}`;
  }

  function LoadSavedState() {
    return NormalizeState(LoadJson(gameConfig.saveKey));
  }

  function HasSavedProgress() {
    const stored = LoadJson(gameConfig.saveKey);
    return Boolean(stored && stored.saveVersion === gameConfig.saveVersion);
  }

  function SaveGame() {
    gameState.updatedAt = Date.now();
    SaveJson(gameConfig.saveKey, gameState);
  }

  function StartNewGame() {
    StopRollCall();
    gameState = CreateInitialState();
    SaveGame();
    ShowGame();
    RenderGame();
    PlayTone("start");
  }

  function ContinueGame() {
    StopRollCall();
    gameState = LoadSavedState();
    ShowGame();
    if (gameState.completed || gameState.stage === "ending") {
      ShowEnding();
      return;
    }
    RenderGame();
    if (gameState.stage === "choice") OpenChoiceModal();
    if (gameState.stage === "rollcall") StartRollCall(true);
  }

  function ShowGame() {
    element.openingScreen.classList.add("hidden");
    element.endingScreen.classList.add("hidden");
    element.gameShell.classList.remove("hidden");
    element.gameMain.focus({ preventScroll: true });
    ResizeCanvases();
  }

  function CurrentChapter() {
    return GetChapter(gameState.chapterIndex);
  }

  function GetChapterObserved(chapter = CurrentChapter()) {
    if (!Array.isArray(gameState.observed[chapter.id])) gameState.observed[chapter.id] = [];
    return gameState.observed[chapter.id];
  }

  function GetSequence() {
    const chapter = CurrentChapter();
    if (gameState.stage === "intro") return chapter.intro;
    if (gameState.stage === "dialogue") return chapter.dialogue || [];
    if (gameState.stage === "choiceDialogue") {
      const choiceId = gameState.choices[chapter.choice?.id];
      return chapter.choiceDialogue?.[choiceId] || [];
    }
    return [];
  }

  function GetSpeaker(speakerId) {
    return speakerDefinitions[speakerId] || speakerDefinitions.narrator;
  }

  function GetTranscriptKey(speakerId, text) {
    return `${CurrentChapter().id}:${gameState.stage}:${gameState.lineIndex}:${speakerId}:${text.slice(0, 18)}`;
  }

  function RecordLine(speakerId, text) {
    const key = GetTranscriptKey(speakerId, text);
    if (gameState.transcriptKeys.includes(key)) return;
    const speaker = GetSpeaker(speakerId);
    gameState.transcriptKeys.push(key);
    gameState.transcript.push({
      key,
      chapterId: CurrentChapter().id,
      chapterTitle: CurrentChapter().title,
      date: CurrentChapter().date,
      speakerId,
      speakerName: speaker.name,
      text,
    });
    gameState.transcriptKeys = gameState.transcriptKeys.slice(-320);
    gameState.transcript = gameState.transcript.slice(-240);
    SaveGame();
  }

  function SetDialogue(speakerId, text, { record = true, channel = null } = {}) {
    const speaker = GetSpeaker(speakerId);
    element.speakerBadge.textContent = speaker.shortName;
    element.speakerName.textContent = speaker.name;
    element.speakerChannel.textContent = channel || (
      speakerId === "narrator" ? "环境记录" :
      speakerId === "He" ? "有线电话 · 槐树坪" :
      speakerId === "Liang" ? "有线电话 · 风口梁" : "近处人声"
    );
    element.dialogueText.classList.remove("isTyping");
    element.dialogueText.textContent = text;
    if (!settings.reducedMotion) {
      void element.dialogueText.offsetWidth;
      element.dialogueText.classList.add("isTyping");
    }
    if (record) RecordLine(speakerId, text);
  }

  function ShowCurrentSequenceLine() {
    const sequence = GetSequence();
    const line = sequence[gameState.lineIndex];
    if (!line) {
      FinishSequence();
      return;
    }
    SetDialogue(line[0], line[1]);
  }

  function FinishSequence() {
    const chapter = CurrentChapter();
    if (gameState.stage === "intro") {
      gameState.stage = chapter.requiredClues.length ? "explore" : "ready";
      gameState.lineIndex = 0;
      SaveGame();
      RenderGame();
      return;
    }
    if (gameState.stage === "dialogue" || gameState.stage === "choiceDialogue") {
      CompleteChapter();
    }
  }

  function AdvanceSequence() {
    if (activeModal) return;
    if (gameState.stage === "rollcall") {
      gameState.rollCallIndex = Math.min(63, gameState.rollCallIndex + 1);
      RenderRollCallLine();
      SaveGame();
      if (gameState.rollCallIndex >= 63) FinishRollCall();
      return;
    }
    if (!["intro", "dialogue", "choiceDialogue"].includes(gameState.stage)) return;
    const sequence = GetSequence();
    gameState.lineIndex += 1;
    if (gameState.lineIndex >= sequence.length) {
      FinishSequence();
      return;
    }
    SaveGame();
    ShowCurrentSequenceLine();
    PlayTone("paper");
  }

  function ObserveClue(clueId) {
    const chapter = CurrentChapter();
    const clue = chapter.clues.find((candidate) => candidate.id === clueId);
    if (!clue || !["explore", "ready"].includes(gameState.stage)) return;
    const observed = GetChapterObserved(chapter);
    if (!observed.includes(clueId)) {
      observed.push(clueId);
      gameState.lastClueId = clueId;
      PlayTone("clue");
    }
    const isReady = GetObservedCount(gameState, chapter) >= chapter.requiredClues.length;
    if (isReady) gameState.stage = "ready";
    SaveGame();
    RenderGame();
    if (isReady) {
      SetDialogue(
        "narrator",
        `${clue.label}：${clue.detail} 所需观察已经确认。现在点击下方“${chapter.actionLabel}”继续。`,
        { record: false, channel: "可以接线" },
      );
      element.phoneButton.focus();
    } else {
      SetDialogue("narrator", `${clue.label}：${clue.detail}`, { record: false, channel: "观察记录" });
    }
  }

  function TriggerChapterAction() {
    const chapter = CurrentChapter();
    if (!CanTriggerChapterAction(gameState, chapter) || Date.now() - phoneActionAt < 600) return;
    phoneActionAt = Date.now();
    PlayTone("phone");
    if (chapter.rollCall) {
      StartRollCall(false);
      return;
    }
    if (chapter.choice) {
      gameState.stage = "choice";
      SaveGame();
      RenderGame();
      OpenChoiceModal();
      return;
    }
    gameState.stage = "dialogue";
    gameState.lineIndex = 0;
    SaveGame();
    RenderGame();
  }

  function CompleteChapter() {
    const chapter = CurrentChapter();
    if (chapter.id === "RollCall") gameState.rollCallIndex = 67;
    if (!gameState.completedChapters.includes(chapter.id)) gameState.completedChapters.push(chapter.id);
    if (chapter.order >= chapters.length - 1) {
      gameState.completed = true;
      gameState.stage = "ending";
      SaveGame();
      ShowEnding();
      return;
    }
    gameState.stage = "transition";
    gameState.lineIndex = 0;
    SaveGame();
    SetDialogue("narrator", `${chapter.title}记录完毕。山色和线路继续向下一个时辰推进。`, {
      record: false,
      channel: "章节记录",
    });
    element.advanceButton.classList.add("hidden");
    element.phoneButton.classList.add("hidden");
    window.setTimeout(() => {
      gameState.chapterIndex += 1;
      gameState.stage = "intro";
      gameState.lineIndex = 0;
      gameState.lastClueId = null;
      gameState.viewOffset = 0;
      gameState.zoom = 1;
      SaveGame();
      RenderGame();
    }, settings.reducedMotion ? 30 : 850);
  }

  function ChooseOption(choiceId) {
    const result = SelectChoice(gameState, choiceId);
    if (!result.valid) return;
    if (CurrentChapter().id === "RollCall" && choiceId === "Listen") gameState.rollCallIndex = 67;
    CloseModal({ force: true, restoreFocus: false });
    SaveGame();
    RenderGame();
    element.advanceButton.focus({ preventScroll: true });
    PlayTone("decision");
  }

  function StartRollCall(resume) {
    const chapter = CurrentChapter();
    if (!chapter.rollCall) return;
    StopRollCall();
    gameState.stage = "rollcall";
    if (!resume) gameState.rollCallIndex = 0;
    if (!resume) gameState.rollCallPaused = false;
    SaveGame();
    RenderGame();
    const stepDelay = 2000;
    rollCallTimer = window.setInterval(() => {
      if (activeModal || document.hidden || gameState.rollCallPaused) return;
      gameState.rollCallIndex += 1;
      RenderRollCallLine();
      if (gameState.rollCallIndex % 5 === 0) SaveGame();
      if (gameState.rollCallIndex >= 63) FinishRollCall();
    }, stepDelay);
  }

  function StopRollCall() {
    if (rollCallTimer) window.clearInterval(rollCallTimer);
    rollCallTimer = 0;
  }

  function RenderRollCallLine() {
    const count = Clamp(gameState.rollCallIndex, 0, 63);
    const person = evacueeNames[Math.max(0, count - 1)];
    if (!person || count === 0) {
      SetDialogue("He", "名册第一页。准备好以后，从第一名开始。", { record: false });
      return;
    }
    const ageText = person.age === 0 ? "未满周岁" : `${person.age}岁`;
    SetDialogue(
      "narrator",
      `纸面第 ${String(count).padStart(2, "0")} 名 · ${person.name} · ${ageText}　｜　线路答复：${String(count).padStart(2, "0")}号编入`,
      { record: false, channel: `纸面看姓名 · 线上只报编号 · ${count} / 67` },
    );
    element.objectiveProgressText.textContent = `${count} / 67 已核对`;
    element.objectiveProgressFill.style.width = `${(count / 67) * 100}%`;
    if (count >= 58) SetLineStatus("线路低鸣", "warning");
  }

  function FinishRollCall() {
    StopRollCall();
    gameState.rollCallIndex = 63;
    gameState.stage = "choice";
    SaveGame();
    RenderGame();
    PlayTone("static");
    OpenChoiceModal();
  }

  function SetLineStatus(text, style = "") {
    const status = element.lineStatusText.closest(".lineStatus");
    status.classList.remove("connected", "warning");
    if (style) status.classList.add(style);
    element.lineStatusText.textContent = text;
  }

  function RenderGame() {
    const chapter = CurrentChapter();
    const observedCount = GetObservedCount(gameState, chapter);
    const requiredCount = chapter.requiredClues.length;
    element.chapterDate.textContent = `${chapter.date} · ${chapter.time}`;
    element.chapterTitle.textContent = chapter.title;
    element.objectiveText.textContent = chapter.objective;
    element.locationText.textContent = chapter.location;
    element.weatherText.textContent = chapter.weather;
    element.zoomText.textContent = `${gameState.zoom.toFixed(1)}×`;
    element.clueCounter.textContent = chapter.rollCall
      ? `${gameState.rollCallIndex} / 67`
      : `${observedCount} / ${requiredCount}`;
    element.objectiveProgressText.textContent = requiredCount
      ? `${observedCount} / ${requiredCount} 已观察`
      : chapter.rollCall ? `${gameState.rollCallIndex} / 67 已核对` : "准备接线";
    const progress = requiredCount
      ? observedCount / requiredCount
      : chapter.rollCall ? gameState.rollCallIndex / 67 : 1;
    element.objectiveProgressFill.style.width = `${Clamp(progress, 0, 1) * 100}%`;

    RenderHotspots();
    RenderClueList();
    UpdateHotspotPositions();
    element.advanceButton.classList.toggle("hidden", !["intro", "dialogue", "choiceDialogue", "rollcall"].includes(gameState.stage));
    element.advanceButton.querySelector("span").textContent = gameState.stage === "rollcall" ? "核下一名" : "继续";
    element.rollCallModeButton.classList.toggle("hidden", gameState.stage !== "rollcall");
    element.rollCallModeButton.setAttribute("aria-pressed", String(gameState.rollCallPaused));
    element.rollCallModeButton.querySelector("span").textContent = gameState.rollCallPaused ? "恢复自动核对" : "暂停自动核对";
    element.rollCallModeButton.querySelector("small").textContent = gameState.rollCallPaused
      ? "当前为手动阅读模式"
      : "每两秒一名，可随时暂停";
    element.objectiveText.closest(".objectiveCard").setAttribute(
      "aria-live",
      chapter.rollCall && ["rollcall", "choice", "choiceDialogue"].includes(gameState.stage) ? "off" : "polite",
    );
    const canTriggerChapterAction = CanTriggerChapterAction(gameState, chapter);
    element.phoneButton.classList.toggle("hidden", !canTriggerChapterAction);
    element.phoneButtonLabel.textContent = chapter.actionLabel;
    element.phoneButtonHint.textContent = chapter.actionHint;
    element.interactionHint.textContent = canTriggerChapterAction
      ? `下一步：点击“${chapter.actionLabel}”。`
      : "拖动画面观察；也可用方向键、Tab 和 Enter。";

    if (["intro", "dialogue", "choiceDialogue"].includes(gameState.stage)) {
      ShowCurrentSequenceLine();
      SetLineStatus(gameState.stage === "intro" ? "等待报告" : "通话中", gameState.stage === "intro" ? "" : "connected");
    } else if (gameState.stage === "explore") {
      const lastClue = chapter.clues.find((clue) => clue.id === gameState.lastClueId);
      if (lastClue) {
        SetDialogue("narrator", `${lastClue.label}：${lastClue.detail}`, { record: false, channel: "观察记录" });
      } else {
        SetDialogue("narrator", chapter.objective, { record: false, channel: "当前任务" });
      }
      SetLineStatus("等待校准");
    } else if (gameState.stage === "ready") {
      SetDialogue("narrator", chapter.actionHint, { record: false, channel: "可以接线" });
      SetLineStatus("可以呼叫", "connected");
    } else if (gameState.stage === "rollcall") {
      RenderRollCallLine();
      SetLineStatus(gameState.rollCallIndex >= 58 ? "线路低鸣" : "姓名核对", gameState.rollCallIndex >= 58 ? "warning" : "connected");
    } else if (gameState.stage === "choice") {
      SetDialogue("narrator", chapter.choice?.context || "需要作出选择。", { record: false, channel: "线路抉择" });
      SetLineStatus(chapter.rollCall ? "线路异常" : "等待决定", chapter.rollCall ? "warning" : "");
    }
    SaveGame();
  }

  function RenderHotspots() {
    const chapter = CurrentChapter();
    const observed = GetChapterObserved(chapter);
    const focusedClueId = document.activeElement?.classList.contains("hotspotButton")
      ? document.activeElement.dataset.clueId
      : null;
    const canObserve = ["explore", "ready"].includes(gameState.stage);
    element.hotspotLayer.innerHTML = "";
    chapter.clues.forEach((clue) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `hotspotButton${observed.includes(clue.id) ? " observed" : ""}`;
      button.dataset.clueId = clue.id;
      button.setAttribute("aria-label", `${observed.includes(clue.id) ? "已观察" : "观察"}：${clue.label}，${clue.hint}`);
      button.setAttribute("aria-pressed", String(observed.includes(clue.id)));
      button.disabled = !canObserve;
      button.innerHTML = `<span>${EscapeHtml(observed.includes(clue.id) ? clue.label : clue.hint)}</span>`;
      button.addEventListener("click", () => ObserveClue(clue.id));
      element.hotspotLayer.append(button);
    });
    if (focusedClueId && canObserve) {
      [...element.hotspotLayer.querySelectorAll("[data-clue-id]")]
        .find((button) => button.dataset.clueId === focusedClueId)
        ?.focus({ preventScroll: true });
    }
  }

  function UpdateHotspotPositions() {
    const chapter = CurrentChapter();
    const sceneWidth = latestSceneWidth || element.sceneCanvas.clientWidth || 1;
    const sceneHeight = latestSceneHeight || element.sceneCanvas.clientHeight || 1;
    element.hotspotLayer.querySelectorAll(".hotspotButton").forEach((button) => {
      const clue = chapter.clues.find((candidate) => candidate.id === button.dataset.clueId);
      if (!clue) return;
      const normalizedX = ((clue.x - 0.5 + gameState.viewOffset) * gameState.zoom) + 0.5;
      const normalizedY = ((clue.y - 0.54) * gameState.zoom) + 0.54;
      button.style.left = `${Clamp(normalizedX, 0.04, 0.96) * sceneWidth}px`;
      button.style.top = `${Clamp(normalizedY, 0.08, 0.9) * sceneHeight}px`;
      button.classList.toggle("edgeMarker", normalizedX < 0.04 || normalizedX > 0.96);
    });
  }

  function RenderClueList() {
    const chapter = CurrentChapter();
    const observed = GetChapterObserved(chapter);
    if (!chapter.clues.length) {
      element.clueList.innerHTML = `<li class="observed"><b>姓名簿</b>${gameState.rollCallIndex || 0} / 67 已核对</li>`;
      return;
    }
    element.clueList.innerHTML = chapter.clues.map((clue) => `
      <li class="${observed.includes(clue.id) ? "observed" : ""}">
        <b>${EscapeHtml(observed.includes(clue.id) ? clue.label : "尚未确认")}</b>
        ${EscapeHtml(observed.includes(clue.id) ? clue.detail : clue.hint)}
      </li>
    `).join("");
  }

  function OpenChoiceModal() {
    const chapter = CurrentChapter();
    if (!chapter.choice) return;
    element.choiceTitle.textContent = chapter.choice.prompt;
    element.choiceContext.textContent = chapter.choice.context;
    element.choiceOptions.innerHTML = chapter.choice.options.map((option, index) => `
      <button class="choiceOption" type="button" data-choice-id="${EscapeHtml(option.id)}">
        <span>选择 ${index + 1}</span>
        <b>${EscapeHtml(option.title)}</b>
        <p>${EscapeHtml(option.cost)}</p>
        <small>${EscapeHtml(option.detail)}</small>
      </button>
    `).join("");
    element.choiceOptions.querySelectorAll("[data-choice-id]").forEach((button) => {
      button.addEventListener("click", () => ChooseOption(button.dataset.choiceId));
    });
    OpenModal("choice");
  }

  function RenderHistory() {
    element.historyContent.innerHTML = `
      <section class="archiveSection warning">
        <h3>本作的边界</h3>
        <p>${EscapeHtml(gameConfig.historyBoundary)}</p>
        <p>${EscapeHtml(gameConfig.playerRole)}</p>
      </section>
      <section class="archiveSection">
        <h3>为什么是电话线，不是对讲机</h3>
        <p>${EscapeHtml(historicalTerms.find((item) => item.term === "手摇磁石式有线电话")?.definition || "")}</p>
      </section>
      <section class="archiveSection">
        <h3>内容与责任说明</h3>
        <p>${EscapeHtml(contentNotice.summary)}</p>
        <p>${EscapeHtml(contentNotice.responsibility)}</p>
      </section>
      <section class="archiveSection">
        <h3>术语</h3>
        <ul>${historicalTerms.map((item) => `<li><b>${EscapeHtml(item.term)}</b>：${EscapeHtml(item.definition)}</li>`).join("")}</ul>
      </section>
      <section class="archiveSection">
        <h3>公开资料锚点</h3>
        <ul class="sourceList">
          ${historicalSources.map((source) => `
            <li>
              <b><a href="${EscapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${EscapeHtml(source.title)}</a></b>
              <span>${EscapeHtml(source.organization)}</span>
              <small>${EscapeHtml(source.usedFor)}</small>
            </li>
          `).join("")}
        </ul>
        <p>外部网页可能更新或迁移；本页只据其核对历史背景，不把虚构对白归给真实人物。</p>
      </section>
    `;
  }

  function RenderJournal() {
    const completedChoices = Object.values(gameState.choices);
    const consequenceSections = completedChoices.map((choiceId) => GetConsequence(choiceId)).filter(Boolean);
    const rollCallVisible = gameState.chapterIndex >= 5 || gameState.completed;
    const completedNameCount = gameState.completed
      ? 67
      : Math.min(67, gameState.rollCallIndex || 0);
    const cutChoice = gameState.choices.LineChoice === "Cut";
    const nameMarkup = rollCallVisible
      ? evacueeNames.slice(0, completedNameCount).map((person) => {
        const late = cutChoice && person.number > 63;
        return `<span class="ledgerName${late ? " late" : ""}"><i>${String(person.number).padStart(2, "0")}</i><b>${EscapeHtml(person.name)}</b><em>${person.age === 0 ? "未满周岁" : `${person.age}岁`}</em></span>`;
      }).join("")
      : "";

    element.journalContent.innerHTML = `
      <section class="archiveSection">
        <h3>当前记录</h3>
        <p>${EscapeHtml(CurrentChapter().date)} · ${EscapeHtml(CurrentChapter().title)}</p>
        <p>${EscapeHtml(CurrentChapter().objective)}</p>
      </section>
      <section class="archiveSection">
        <h3>已经承担的代价</h3>
        ${consequenceSections.length
          ? `<ul>${consequenceSections.map((item) => `<li><b>${EscapeHtml(item.label)}</b>：${EscapeHtml(item.ledger)}</li>`).join("")}</ul>`
          : "<p>还没有走到必须取舍的时刻。</p>"}
      </section>
      <section class="archiveSection">
        <h3>青石峪六十七人 · 虚构名册</h3>
        ${rollCallVisible
          ? `<p>${completedNameCount} / 67 已核对。姓名全部为虚构，不对应真实村庄名录。</p><div class="ledgerGrid">${nameMarkup}${completedNameCount < 67 ? `<span class="ledgerName"><i>…</i><b>余下姓名等待核对</b><em></em></span>` : ""}</div>`
          : "<p>名册尚未开始核对。何青禾坚持：背面也能写，别让人只剩个数。</p>"}
      </section>
      <section class="archiveSection">
        <h3>本章史实注</h3>
        <p>${EscapeHtml(CurrentChapter().historyNote)}</p>
      </section>
    `;
  }

  function RenderTranscript() {
    element.transcriptContent.innerHTML = gameState.transcript.length
      ? gameState.transcript.map((line) => `
        <article class="transcriptLine">
          <b>${EscapeHtml(line.speakerName)}</b>
          <p>${EscapeHtml(line.text)}</p>
        </article>
      `).join("")
      : `<section class="archiveSection"><p>线路还没有留下通话记录。</p></section>`;
  }

  function OpenModal(type) {
    if (activeModal) CloseModal({ force: true });
    focusBeforeModal = document.activeElement;
    activeModal = type;
    if (type === "history") RenderHistory();
    if (type === "journal") RenderJournal();
    if (type === "transcript") RenderTranscript();
    const modal = element[`${type}Modal`];
    if (!modal) return;
    element.modalLayer.classList.remove("hidden");
    element.modalLayer.setAttribute("aria-hidden", "false");
    modal.classList.remove("hidden");
    window.setTimeout(() => {
      const firstFocus = modal.querySelector("button, a, select, input");
      firstFocus?.focus({ preventScroll: true });
    }, 0);
  }

  function CloseModal({ force = false, restoreFocus = true } = {}) {
    if (!activeModal) return;
    if (activeModal === "choice" && !force) return;
    const modal = element[`${activeModal}Modal`];
    modal?.classList.add("hidden");
    element.modalLayer.classList.add("hidden");
    element.modalLayer.setAttribute("aria-hidden", "true");
    activeModal = null;
    if (restoreFocus) focusBeforeModal?.focus?.({ preventScroll: true });
    focusBeforeModal = null;
  }

  function ShowEnding() {
    StopRollCall();
    element.gameShell.classList.add("hidden");
    element.openingScreen.classList.add("hidden");
    element.endingScreen.classList.remove("hidden");
    const consequenceIds = ["SupplyChoice", "RouteChoice", "LineChoice"]
      .map((choiceKey) => gameState.choices[choiceKey])
      .filter(Boolean);
    element.endingConsequences.innerHTML = consequenceIds.map((choiceId) => {
      const consequence = GetConsequence(choiceId);
      return consequence ? `
        <article class="endingConsequence">
          <b>${EscapeHtml(consequence.label)}</b>
          <p>${EscapeHtml(consequence.epilogue)}</p>
        </article>
      ` : "";
    }).join("");
    element.endingScreen.scrollTop = 0;
    ResizeCanvases();
    document.getElementById("endingTitle")?.focus();
    PlayTone("ending");
  }

  function UpdateView(deltaOffset = 0, deltaZoom = 0) {
    gameState.viewOffset = Clamp(gameState.viewOffset + deltaOffset / gameState.zoom, -0.16, 0.16);
    gameState.zoom = Clamp(Math.round((gameState.zoom + deltaZoom) * 20) / 20, 1, 1.35);
    element.zoomText.textContent = `${gameState.zoom.toFixed(1)}×`;
    UpdateHotspotPositions();
    SaveGame();
  }

  function BeginPhoneHold() {
    if (!CanTriggerChapterAction(gameState)) return;
    CancelPhoneHold();
    phoneHoldStart = performance.now();
    element.phoneButton.classList.add("isHolding");
    const TickHold = (now) => {
      const progress = Clamp((now - phoneHoldStart) / 780, 0, 1);
      element.phoneButton.style.setProperty("--hold-progress", `${progress * 100}%`);
      if (progress >= 1) {
        element.phoneButton.classList.remove("isHolding");
        element.phoneButton.style.setProperty("--hold-progress", "0%");
        phoneHoldFrame = 0;
        TriggerChapterAction();
        return;
      }
      phoneHoldFrame = requestAnimationFrame(TickHold);
    };
    phoneHoldFrame = requestAnimationFrame(TickHold);
  }

  function CancelPhoneHold() {
    if (phoneHoldFrame) cancelAnimationFrame(phoneHoldFrame);
    phoneHoldFrame = 0;
    element.phoneButton.classList.remove("isHolding");
    element.phoneButton.style.setProperty("--hold-progress", "0%");
  }

  function EnsureAudioContext() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioContext = new AudioContextClass();
    }
    if (audioContext?.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function PlayTone(type) {
    if (!settings.soundEnabled) return;
    const context = EnsureAudioContext();
    if (!context) return;
    const patterns = {
      start: [[220, 0, 0.08], [330, 0.1, 0.1]],
      paper: [[180, 0, 0.035]],
      clue: [[440, 0, 0.05], [660, 0.07, 0.06]],
      phone: [[620, 0, 0.11], [620, 0.2, 0.11], [480, 0.4, 0.18]],
      decision: [[260, 0, 0.07], [390, 0.08, 0.1]],
      static: [[90, 0, 0.14], [70, 0.15, 0.18]],
      ending: [[196, 0, 0.16], [247, 0.18, 0.16], [330, 0.36, 0.3]],
    };
    (patterns[type] || patterns.paper).forEach(([frequency, delay, duration]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type === "static" ? "sawtooth" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(type === "static" ? 0.025 : 0.055, context.currentTime + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + duration + 0.03);
    });
  }

  function ToggleSound() {
    settings.soundEnabled = !settings.soundEnabled;
    if (settings.soundEnabled) {
      EnsureAudioContext();
      window.setTimeout(() => PlayTone("paper"), 20);
    }
    ApplySettings();
    SaveSettings();
  }

  function ResizeCanvas(canvas) {
    if (!canvas) return;
    const rectangle = canvas.getBoundingClientRect();
    if (!rectangle.width || !rectangle.height) return;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rectangle.width * pixelRatio));
    const height = Math.max(1, Math.round(rectangle.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function ResizeCanvases() {
    [element.openingCanvas, element.sceneCanvas, element.endingCanvas].forEach(ResizeCanvas);
    latestSceneWidth = element.sceneCanvas.clientWidth;
    latestSceneHeight = element.sceneCanvas.clientHeight;
    UpdateHotspotPositions();
  }

  function SeededWave(value, seed) {
    return Math.sin(value * (0.83 + seed * 0.071) + seed * 1.77) * 0.56
      + Math.sin(value * (1.91 + seed * 0.043) + seed * 0.67) * 0.29
      + Math.sin(value * 4.37 + seed * 2.1) * 0.15;
  }

  function DrawMountainLayer(context, width, height, options) {
    const {
      baseline, amplitude, color, seed, offset, roughness = 1, foreground = false,
    } = options;
    context.beginPath();
    context.moveTo(0, height);
    const step = Math.max(5, width / 180);
    for (let x = -step; x <= width + step; x += step) {
      const normalized = (x / width) * 9 * roughness + offset;
      const wave = SeededWave(normalized, seed);
      const ridge = baseline - amplitude * (0.54 + wave * 0.34);
      context.lineTo(x, ridge);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = color;
    context.fill();
    if (foreground) {
      context.strokeStyle = "rgba(221, 205, 172, 0.08)";
      context.lineWidth = Math.max(1, width / 1200);
      context.stroke();
    }
  }

  function DrawTelephoneLine(context, width, height, palette, offset = 0) {
    const poleColor = "#1a201c";
    const highlight = "rgba(209, 185, 139, 0.18)";
    const poles = [
      { x: width * (0.08 + offset * 0.22), y: height * 0.42, h: height * 0.48 },
      { x: width * (0.48 + offset * 0.12), y: height * 0.5, h: height * 0.29 },
      { x: width * (0.8 + offset * 0.06), y: height * 0.54, h: height * 0.2 },
    ];
    context.lineCap = "round";
    poles.forEach((pole) => {
      context.strokeStyle = poleColor;
      context.lineWidth = Math.max(4, width / 220);
      context.beginPath();
      context.moveTo(pole.x, pole.y);
      context.lineTo(pole.x - width * 0.012, pole.y + pole.h);
      context.stroke();
      context.strokeStyle = highlight;
      context.lineWidth = Math.max(1, width / 1000);
      context.beginPath();
      context.moveTo(pole.x - width * 0.002, pole.y + 2);
      context.lineTo(pole.x - width * 0.013, pole.y + pole.h);
      context.stroke();
      context.strokeStyle = poleColor;
      context.lineWidth = Math.max(3, width / 360);
      context.beginPath();
      context.moveTo(pole.x - width * 0.034, pole.y + height * 0.03);
      context.lineTo(pole.x + width * 0.032, pole.y + height * 0.03);
      context.stroke();
      context.fillStyle = "rgba(202, 193, 166, 0.72)";
      [-0.028, 0.026].forEach((insulatorOffset) => {
        context.beginPath();
        context.ellipse(
          pole.x + width * insulatorOffset,
          pole.y + height * 0.022,
          Math.max(1.5, width / 620),
          Math.max(2, width / 500),
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
      });
    });
    context.strokeStyle = "#171a18";
    context.lineWidth = Math.max(1.5, width / 900);
    context.beginPath();
    context.moveTo(poles[0].x - width * 0.032, poles[0].y + height * 0.03);
    context.bezierCurveTo(
      width * 0.2, height * 0.37,
      width * 0.35, height * 0.52,
      poles[1].x - width * 0.032, poles[1].y + height * 0.03,
    );
    context.bezierCurveTo(
      width * 0.6, height * 0.5,
      width * 0.72, height * 0.58,
      poles[2].x - width * 0.032, poles[2].y + height * 0.03,
    );
    context.stroke();
    context.strokeStyle = `${palette.accent}66`;
    context.lineWidth = Math.max(0.7, width / 1800);
    context.stroke();
  }

  function DrawFeature(context, width, height, clue, palette, viewOffset, zoom, time) {
    const x = (((clue.x - 0.5 + viewOffset) * zoom) + 0.5) * width;
    const y = (((clue.y - 0.54) * zoom) + 0.54) * height;
    context.save();
    context.translate(x, y);
    const scale = Math.max(0.7, width / 1100) * zoom;
    context.scale(scale, scale);
    if (clue.kind === "village" || clue.kind === "granary" || clue.kind === "clinic") {
      const houseColor = clue.kind === "clinic" ? "#c1b79d" : "#4b4538";
      for (let index = 0; index < 4; index += 1) {
        const houseX = (index - 1.5) * 16;
        const houseY = (index % 2) * 5;
        context.fillStyle = houseColor;
        context.fillRect(houseX - 5, houseY - 7, 10, 7);
        context.fillStyle = "#272b26";
        context.beginPath();
        context.moveTo(houseX - 8, houseY - 7);
        context.lineTo(houseX, houseY - 13);
        context.lineTo(houseX + 8, houseY - 7);
        context.fill();
      }
    }
    if (clue.kind === "dust" || clue.kind === "smoke") {
      context.fillStyle = clue.kind === "dust" ? "rgba(205, 177, 126, 0.2)" : "rgba(180, 168, 145, 0.24)";
      for (let index = 0; index < 7; index += 1) {
        const drift = Math.sin(time * 0.00025 + index) * 5;
        context.beginPath();
        context.ellipse((index - 3) * 14 + drift, -index * 6, 26 + index * 4, 10 + index * 3, -0.18, 0, Math.PI * 2);
        context.fill();
      }
    }
    if (clue.kind === "glint") {
      context.strokeStyle = "rgba(255, 235, 180, 0.78)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-8, 4);
      context.lineTo(9, -4);
      context.stroke();
    }
    if (clue.kind === "bridge") {
      context.strokeStyle = "#9e9580";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(-24, 3);
      context.lineTo(26, -2);
      context.stroke();
    }
    if (["wire", "repair", "cloth"].includes(clue.kind)) {
      context.strokeStyle = clue.kind === "cloth" ? "#a49474" : "#342b24";
      context.lineWidth = clue.kind === "cloth" ? 7 : 2;
      context.beginPath();
      context.moveTo(-25, 3);
      context.quadraticCurveTo(0, -5, 25, 2);
      context.stroke();
    }
    if (clue.kind === "lantern") {
      context.fillStyle = "rgba(221, 161, 81, 0.48)";
      context.beginPath();
      context.arc(0, 0, 4 + Math.sin(time * 0.004) * 1.2, 0, Math.PI * 2);
      context.fill();
    }
    if (clue.kind === "patrol") {
      context.fillStyle = "rgba(24, 29, 26, 0.78)";
      [-12, 11].forEach((figureX, index) => {
        context.beginPath();
        context.arc(figureX, -8 - index * 2, 3.5, 0, Math.PI * 2);
        context.fill();
        context.fillRect(figureX - 2.5, -5 - index * 2, 5, 12);
      });
    }
    if (clue.kind === "river") {
      context.strokeStyle = "rgba(26, 34, 31, 0.82)";
      context.lineWidth = 13;
      context.beginPath();
      context.moveTo(-32, -4);
      context.bezierCurveTo(-5, 13, 7, -12, 34, 5);
      context.stroke();
    }
    if (clue.kind === "almond") {
      context.fillStyle = "#6e4c2e";
      context.beginPath();
      context.ellipse(0, 0, 4, 7, 0.25, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function DrawLandscape(canvas, chapter, time, viewOffset = 0, zoom = 1, opening = false) {
    if (!canvas?.width || !canvas?.height) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const palette = chapter.palette;
    context.clearRect(0, 0, width, height);
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(0.72, palette.skyBottom);
    sky.addColorStop(1, palette.ground);
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    const motionTime = settings.reducedMotion ? 0 : time;
    const hazeX = width * (0.75 + Math.sin(motionTime * 0.00004) * 0.025);
    const hazeY = height * 0.19;
    const haze = context.createRadialGradient(hazeX, hazeY, 0, hazeX, hazeY, width * 0.25);
    haze.addColorStop(0, `${palette.haze}52`);
    haze.addColorStop(1, `${palette.haze}00`);
    context.fillStyle = haze;
    context.fillRect(0, 0, width, height * 0.7);

    const layerOffset = viewOffset * 13;
    DrawMountainLayer(context, width, height, {
      baseline: height * 0.69,
      amplitude: height * 0.25 / zoom,
      color: palette.far,
      seed: 1,
      offset: layerOffset * 0.25,
      roughness: 0.68,
    });
    DrawMountainLayer(context, width, height, {
      baseline: height * 0.79,
      amplitude: height * 0.34 / zoom,
      color: palette.middle,
      seed: 3,
      offset: layerOffset * 0.58,
      roughness: 0.86,
    });
    DrawMountainLayer(context, width, height, {
      baseline: height * 0.93,
      amplitude: height * 0.36 / zoom,
      color: palette.near,
      seed: 5,
      offset: layerOffset,
      roughness: 1.07,
      foreground: true,
    });

    context.fillStyle = palette.ground;
    context.fillRect(0, height * 0.88, width, height * 0.12);

    chapter.clues.forEach((clue) => DrawFeature(context, width, height, clue, palette, viewOffset, zoom, motionTime));
    DrawTelephoneLine(context, width, height, palette, viewOffset);

    context.fillStyle = "rgba(8, 15, 13, 0.52)";
    for (let index = 0; index < 46; index += 1) {
      const x = (index / 45) * width;
      const bladeHeight = height * (0.025 + ((index * 17) % 13) / 420);
      context.beginPath();
      context.moveTo(x, height);
      context.lineTo(x + Math.sin(index * 3.7) * width * 0.004, height - bladeHeight);
      context.lineTo(x + width * 0.008, height);
      context.fill();
    }

    if (opening) {
      const vignette = context.createRadialGradient(width * 0.54, height * 0.45, width * 0.05, width * 0.54, height * 0.45, width * 0.72);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(5,10,9,0.43)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);
    }
  }

  function DrawFrames(time) {
    if (!element.openingScreen.classList.contains("hidden")) {
      DrawLandscape(element.openingCanvas, chapters[0], time, -0.04, 1.03, true);
    }
    if (!element.gameShell.classList.contains("hidden")) {
      DrawLandscape(element.sceneCanvas, CurrentChapter(), time, gameState.viewOffset, gameState.zoom, false);
    }
    if (!element.endingScreen.classList.contains("hidden")) {
      DrawLandscape(element.endingCanvas, chapters.at(-1), time, 0.03, 1.05, true);
    }
    animationFrame = requestAnimationFrame(DrawFrames);
  }

  function HandleKeyDown(event) {
    if (event.defaultPrevented) return;
    if (activeModal) {
      if (event.key === "Escape") CloseModal();
      if (/^[12]$/.test(event.key) && activeModal === "choice") {
        const button = element.choiceOptions.querySelectorAll("[data-choice-id]")[Number(event.key) - 1];
        button?.click();
      }
      if (event.key === "Tab") {
        const modal = element[`${activeModal}Modal`];
        const focusable = [...modal.querySelectorAll("button:not([disabled]), a[href], select:not([disabled]), input:not([disabled])")];
        if (focusable.length) {
          const currentIndex = focusable.indexOf(document.activeElement);
          const nextIndex = event.shiftKey
            ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
            : (currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1);
          event.preventDefault();
          focusable[nextIndex].focus();
        }
      }
      return;
    }
    if (!element.openingScreen.classList.contains("hidden")) return;
    const targetTag = event.target?.tagName;
    const interactiveTarget = event.target?.closest?.("button, a[href], select, input, textarea, summary");
    if (["SELECT", "INPUT", "TEXTAREA"].includes(targetTag)) return;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      event.preventDefault();
      UpdateView(0.035, 0);
    } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      event.preventDefault();
      UpdateView(-0.035, 0);
    } else if (event.key === "+" || event.key === "=" || event.key.toLowerCase() === "w") {
      event.preventDefault();
      UpdateView(0, 0.05);
    } else if (event.key === "-" || event.key === "_" || event.key.toLowerCase() === "s") {
      event.preventDefault();
      UpdateView(0, -0.05);
    } else if (event.key === "Enter") {
      if (interactiveTarget) return;
      event.preventDefault();
      AdvanceSequence();
    } else if (event.code === "Space" && CanTriggerChapterAction(gameState)) {
      if (interactiveTarget) return;
      event.preventDefault();
      if (!event.repeat) BeginPhoneHold();
    } else if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      OpenModal("journal");
    } else if (event.key.toLowerCase() === "h") {
      event.preventDefault();
      OpenModal("history");
    }
  }

  function HandleKeyUp(event) {
    if (event.code === "Space") CancelPhoneHold();
  }

  function BindEvents() {
    element.startButton.addEventListener("click", StartNewGame);
    element.continueButton.addEventListener("click", ContinueGame);
    element.advanceButton.addEventListener("click", AdvanceSequence);
    element.rollCallModeButton.addEventListener("click", () => {
      if (gameState.stage !== "rollcall") return;
      gameState.rollCallPaused = !gameState.rollCallPaused;
      SaveGame();
      RenderGame();
    });
    element.panLeftButton.addEventListener("click", () => UpdateView(0.035, 0));
    element.panRightButton.addEventListener("click", () => UpdateView(-0.035, 0));
    element.zoomOutButton.addEventListener("click", () => UpdateView(0, -0.05));
    element.zoomInButton.addEventListener("click", () => UpdateView(0, 0.05));
    element.soundButton.addEventListener("click", ToggleSound);
    element.clueDrawerToggle.addEventListener("click", () => {
      const expanded = element.clueDrawerToggle.getAttribute("aria-expanded") === "true";
      element.clueDrawerToggle.setAttribute("aria-expanded", String(!expanded));
      document.getElementById("clueListWrap").setAttribute("aria-hidden", String(expanded));
    });

    element.phoneButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      element.phoneButton.setPointerCapture?.(event.pointerId);
      BeginPhoneHold();
    });
    element.phoneButton.addEventListener("pointerup", CancelPhoneHold);
    element.phoneButton.addEventListener("pointercancel", CancelPhoneHold);
    element.phoneButton.addEventListener("pointerleave", (event) => {
      if (event.buttons) CancelPhoneHold();
    });
    element.phoneButton.addEventListener("click", TriggerChapterAction);

    element.sceneCanvas.closest(".scenePanel").addEventListener("pointerdown", (event) => {
      if (event.target.closest?.(".hotspotButton, .clueDrawer, button")) return;
      dragging = true;
      dragStartX = event.clientX;
      dragStartOffset = gameState.viewOffset;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    });
    element.sceneCanvas.closest(".scenePanel").addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const width = Math.max(1, event.currentTarget.clientWidth);
      gameState.viewOffset = Clamp(dragStartOffset + (event.clientX - dragStartX) / width / gameState.zoom, -0.16, 0.16);
      UpdateHotspotPositions();
    });
    const EndDrag = () => {
      if (!dragging) return;
      dragging = false;
      SaveGame();
    };
    element.sceneCanvas.closest(".scenePanel").addEventListener("pointerup", EndDrag);
    element.sceneCanvas.closest(".scenePanel").addEventListener("pointercancel", EndDrag);
    element.sceneCanvas.closest(".scenePanel").addEventListener("wheel", (event) => {
      if (event.target.closest?.(".clueDrawer")) return;
      event.preventDefault();
      UpdateView(0, event.deltaY < 0 ? 0.05 : -0.05);
    }, { passive: false });

    document.querySelectorAll("[data-open-modal]").forEach((button) => {
      button.addEventListener("click", () => OpenModal(button.dataset.openModal));
    });
    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => CloseModal());
    });
    element.modalLayer.addEventListener("pointerdown", (event) => {
      if (event.target === element.modalLayer) CloseModal();
    });

    element.fontScaleSelect.addEventListener("change", () => {
      settings.fontScale = Number(element.fontScaleSelect.value) || 1;
      ApplySettings();
      SaveSettings();
      ResizeCanvases();
    });
    element.contrastToggle.addEventListener("change", () => {
      settings.highContrast = element.contrastToggle.checked;
      ApplySettings();
      SaveSettings();
    });
    element.motionToggle.addEventListener("change", () => {
      settings.reducedMotion = element.motionToggle.checked;
      ApplySettings();
      SaveSettings();
    });
    element.soundToggleSetting.addEventListener("change", () => {
      settings.soundEnabled = element.soundToggleSetting.checked;
      if (settings.soundEnabled) {
        EnsureAudioContext();
        window.setTimeout(() => PlayTone("paper"), 20);
      }
      ApplySettings();
      SaveSettings();
    });
    element.restartButton.addEventListener("click", () => {
      const confirmed = window.confirm("只清除《山那边，线还通着》的本地记录并重新开始？其他页面不受影响。");
      if (!confirmed) return;
      RemoveStored(gameConfig.saveKey);
      CloseModal({ force: true });
      StartNewGame();
    });
    element.reviewJournalButton.addEventListener("click", () => OpenModal("journal"));
    element.replayButton.addEventListener("click", () => {
      RemoveStored(gameConfig.saveKey);
      StartNewGame();
    });

    document.addEventListener("keydown", HandleKeyDown);
    document.addEventListener("keyup", HandleKeyUp);
    window.addEventListener("resize", ResizeCanvases);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        CancelPhoneHold();
        SaveGame();
      }
    });
  }

  function Initialize() {
    ApplySettings();
    BindEvents();
    element.continueButton.classList.toggle("hidden", !HasSavedProgress());
    RenderHistory();
    ResizeCanvases();
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(DrawFrames);
  }

  Initialize();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  InitializeGame();
}
