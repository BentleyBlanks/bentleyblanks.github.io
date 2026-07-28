import {
  StoryMeta,
  SupplyChoices,
  ItemDefinitions,
  StudentRoster,
  MemoryObjects,
  StoryScenes,
  EndingDefinitions,
} from "./Data_Story.mjs?v=3";
import {
  HistoricalFrame,
  HistoricalSources,
  HistoricalNotes,
  HistoricalTerms,
  HistoryById,
  SourceById,
} from "./Data_History.mjs?v=3";

const archiveKey = "TaihangLetters1942_Archive_V1";
const settingsKey = "TaihangLetters1942_Settings_V1";
const stateMetrics = Object.freeze(["time", "sound", "bond", "health", "paper", "compassion"]);
const screenIds = Object.freeze(["TitleScreen", "GameScreen", "EndingScreen"]);
const itemById = new Map(
  (Array.isArray(ItemDefinitions) ? ItemDefinitions : Object.values(ItemDefinitions || {})).map((item) => [
    item.id,
    item,
  ]),
);
const memoryById = new Map(MemoryObjects.map((memory) => [memory.id, memory]));
const sceneById = new Map(StoryScenes.map((scene) => [scene.id, scene]));
const endingById = new Map(EndingDefinitions.map((ending) => [ending.id, ending]));
const chapterDefinitions = Object.freeze(
  Array.from(
    StoryScenes.reduce((chapters, scene) => {
      if (!chapters.has(scene.chapter)) {
        chapters.set(scene.chapter, {
          id: scene.chapter,
          label: scene.chapterLabel,
          firstSceneId: scene.id,
        });
      }
      return chapters;
    }, new Map()).values(),
  ).sort((left, right) => left.id - right.id),
);

let gameState = null;
let elements = null;
let toastTimer = 0;

export function ClampValue(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

export function CreateInitialState(now = Date.now()) {
  const initialStats = StoryMeta.initialStats || {};
  return {
    version: 1,
    storyId: StoryMeta.id,
    started: true,
    completed: false,
    currentSceneId: StoryMeta.startSceneId,
    endingId: null,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    time: Number(initialStats.time || 0),
    sound: Number(initialStats.sound || 0),
    bond: Number(initialStats.bond || 0),
    health: Number(initialStats.health || 0),
    paper: Number(initialStats.paper || 0),
    compassion: Number(initialStats.compassion || 0),
    items: Array.from(new Set(StoryMeta.initialItems || [])),
    words: Array.from(new Set(StoryMeta.initialWords || [])),
    flags: {},
    visitedSceneIds: [],
    choiceLog: [],
    historySeen: [],
  };
}

function NormalizeTimestamp(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Number.isFinite(new Date(value).getTime()) ? value : fallback;
}

export function NormalizeState(candidate) {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    Array.isArray(candidate) ||
    candidate.storyId !== StoryMeta.id
  ) {
    return null;
  }

  const startedAt = NormalizeTimestamp(candidate.startedAt, Date.now());
  const updatedAt = NormalizeTimestamp(candidate.updatedAt, startedAt);
  const baseline = CreateInitialState(startedAt);
  const normalized = {
    ...baseline,
    ...candidate,
    version: 1,
    storyId: StoryMeta.id,
    started: candidate.started === true || candidate.completed === true,
    completed: candidate.completed === true,
    startedAt,
    updatedAt,
    completedAt:
      candidate.completed === true
        ? NormalizeTimestamp(candidate.completedAt, updatedAt)
        : null,
    endingId: typeof candidate.endingId === "string" ? candidate.endingId : null,
    items: Array.from(new Set(Array.isArray(candidate.items) ? candidate.items : baseline.items)),
    words: Array.from(new Set(Array.isArray(candidate.words) ? candidate.words : [])),
    flags:
      candidate.flags && typeof candidate.flags === "object" && !Array.isArray(candidate.flags)
        ? { ...candidate.flags }
        : {},
    visitedSceneIds: Array.isArray(candidate.visitedSceneIds)
      ? candidate.visitedSceneIds.filter((sceneId) => sceneById.has(sceneId))
      : [],
    choiceLog: Array.isArray(candidate.choiceLog) ? candidate.choiceLog.slice(-80) : [],
    historySeen: Array.isArray(candidate.historySeen)
      ? candidate.historySeen.filter((historyId) => HistoryById[historyId])
      : [],
  };

  for (const metric of stateMetrics) {
    normalized[metric] = Number(candidate[metric] ?? baseline[metric]);
  }

  normalized.time = ClampValue(normalized.time, 0, 20);
  normalized.sound = ClampValue(normalized.sound, 0, 10);
  normalized.bond = ClampValue(normalized.bond, 0, 20);
  normalized.health = ClampValue(normalized.health, 0, 10);
  normalized.paper = ClampValue(normalized.paper, 0, 8);
  normalized.compassion = ClampValue(normalized.compassion, 0, 30);

  if (!sceneById.has(normalized.currentSceneId) && !normalized.completed) {
    normalized.currentSceneId = StoryMeta.startSceneId;
  }

  return normalized;
}

export function RequirementsAreMet(state, requirements = {}) {
  if (!requirements || Object.keys(requirements).length === 0) {
    return true;
  }

  if (
    requirements.min &&
    Object.entries(requirements.min).some(([key, value]) => Number(state[key] || 0) < Number(value))
  ) {
    return false;
  }

  if (
    requirements.max &&
    Object.entries(requirements.max).some(([key, value]) => Number(state[key] || 0) > Number(value))
  ) {
    return false;
  }

  if (
    Array.isArray(requirements.items) &&
    requirements.items.some((itemId) => !state.items.includes(itemId))
  ) {
    return false;
  }

  if (
    Array.isArray(requirements.notItems) &&
    requirements.notItems.some((itemId) => state.items.includes(itemId))
  ) {
    return false;
  }

  if (Array.isArray(requirements.flags)) {
    if (requirements.flags.some((flagId) => !state.flags[flagId])) {
      return false;
    }
  } else if (
    requirements.flags &&
    Object.entries(requirements.flags).some(([flagId, expected]) => state.flags[flagId] !== expected)
  ) {
    return false;
  }

  if (
    Array.isArray(requirements.notFlags) &&
    requirements.notFlags.some((flagId) => Boolean(state.flags[flagId]))
  ) {
    return false;
  }

  if (
    Array.isArray(requirements.words) &&
    requirements.words.some((wordId) => !state.words.includes(wordId))
  ) {
    return false;
  }

  return true;
}

export function ApplyChoiceEffects(state, choice, now = Date.now()) {
  const effects = choice.effects || {};
  const nextState = {
    ...state,
    items: [...state.items],
    words: [...state.words],
    flags: { ...state.flags },
    visitedSceneIds: [...state.visitedSceneIds],
    choiceLog: [...state.choiceLog],
    historySeen: [...state.historySeen],
    updatedAt: now,
  };

  for (const metric of stateMetrics) {
    if (Number.isFinite(effects[metric])) {
      nextState[metric] = Number(nextState[metric] || 0) + Number(effects[metric]);
    }
  }

  for (const itemId of effects.itemsAdd || []) {
    if (!nextState.items.includes(itemId)) {
      nextState.items.push(itemId);
    }
  }

  if (Array.isArray(effects.itemsRemove)) {
    nextState.items = nextState.items.filter((itemId) => !effects.itemsRemove.includes(itemId));
  }

  for (const wordId of effects.wordsAdd || []) {
    if (!nextState.words.includes(wordId)) {
      nextState.words.push(wordId);
    }
  }

  if (Array.isArray(effects.flagsSet)) {
    for (const flagId of effects.flagsSet) {
      nextState.flags[flagId] = true;
    }
  } else if (effects.flagsSet && typeof effects.flagsSet === "object") {
    Object.assign(nextState.flags, effects.flagsSet);
  }

  if (Array.isArray(effects.flagsClear)) {
    for (const flagId of effects.flagsClear) {
      delete nextState.flags[flagId];
    }
  }

  nextState.time = ClampValue(nextState.time, 0, 20);
  nextState.sound = ClampValue(nextState.sound, 0, 10);
  nextState.bond = ClampValue(nextState.bond, 0, 20);
  nextState.health = ClampValue(nextState.health, 0, 10);
  nextState.paper = ClampValue(nextState.paper, 0, 8);
  nextState.compassion = ClampValue(nextState.compassion, 0, 30);

  if (nextState.time >= 12) {
    nextState.flags.afterDaybreak = true;
  }
  if (nextState.sound >= 6) {
    nextState.flags.routeExposed = true;
  }
  if (nextState.paper <= 1) {
    nextState.flags.paperDamaged = true;
  }

  return nextState;
}

export function ResolveEndingDefinition(state, definitions = EndingDefinitions) {
  const ordered = [...definitions].sort(
    (left, right) => Number(right.priority || 0) - Number(left.priority || 0),
  );
  return ordered.find((ending) => RequirementsAreMet(state, ending.requires)) || null;
}

export function GetReachableChoices(state, scene) {
  return (scene?.choices || []).filter((choice) => RequirementsAreMet(state, choice.requires));
}

export function FindScene(sceneId) {
  return sceneById.get(sceneId) || null;
}

function CreateElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== "") {
    element.textContent = text;
  }
  return element;
}

function GetElements() {
  const ids = [
    "TitleScreen",
    "NewGameButton",
    "ContinueButton",
    "ArchiveButton",
    "TitleSettingsButton",
    "GameScreen",
    "BrandButton",
    "ChapterLabel",
    "TimeMeter",
    "TimeValue",
    "SoundMeter",
    "SoundValue",
    "BondMeter",
    "BondValue",
    "GameSettingsButton",
    "RouteRail",
    "SceneEyebrow",
    "SceneTitle",
    "StoryCopy",
    "DialogueList",
    "MemoryTray",
    "HistoryNoteButton",
    "ChoiceList",
    "InventoryList",
    "SaveStatus",
    "EndingScreen",
    "EndingKicker",
    "EndingTitle",
    "EndingCopy",
    "EndingSummary",
    "RestartButton",
    "EndingArchiveButton",
    "ArchiveDialog",
    "ArchiveContent",
    "ArchiveCloseButton",
    "SettingsDialog",
    "MotionToggle",
    "ContrastToggle",
    "TextSizeSelect",
    "SettingsCloseButton",
    "Toast",
    "LiveRegion",
  ];
  return {
    ...Object.fromEntries(ids.map((id) => [id, document.getElementById(id)])),
    TitleHeading: document.getElementById("titleHeading"),
    SkipLink: document.querySelector(".skipLink"),
  };
}

function ReadJson(storageKey, fallback) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function WriteJson(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function LoadState() {
  const stored = ReadJson(StoryMeta.saveKey, null);
  if (
    !stored ||
    typeof stored !== "object" ||
    Array.isArray(stored) ||
    stored.storyId !== StoryMeta.id
  ) {
    return null;
  }
  try {
    return NormalizeState(stored);
  } catch {
    return null;
  }
}

function SaveState() {
  if (!gameState) {
    return false;
  }
  gameState.updatedAt = Date.now();
  const saved = WriteJson(StoryMeta.saveKey, gameState);
  elements.SaveStatus.textContent = saved ? "刚刚已自动保存" : "无法写入本机存档";
  return saved;
}

function LoadSettings() {
  const systemReduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const storedValue = ReadJson(settingsKey, {});
  const stored =
    storedValue && typeof storedValue === "object" && !Array.isArray(storedValue)
      ? storedValue
      : {};
  return {
    motion: stored.motion === "reduced" || (stored.motion == null && systemReduced) ? "reduced" : "full",
    contrast: stored.contrast === "high" ? "high" : "normal",
    textSize: ["normal", "large", "largest"].includes(stored.textSize)
      ? stored.textSize
      : "normal",
  };
}

function ApplySettings(settings) {
  document.documentElement.dataset.motion = settings.motion;
  document.documentElement.dataset.contrast = settings.contrast;
  document.documentElement.dataset.textSize = settings.textSize;
  elements.MotionToggle.checked = settings.motion === "reduced";
  elements.ContrastToggle.checked = settings.contrast === "high";
  elements.TextSizeSelect.value = settings.textSize;
}

function SaveSettingsFromControls() {
  const settings = {
    motion: elements.MotionToggle.checked ? "reduced" : "full",
    contrast: elements.ContrastToggle.checked ? "high" : "normal",
    textSize: elements.TextSizeSelect.value,
  };
  ApplySettings(settings);
  WriteJson(settingsKey, settings);
}

function ShowScreen(screenId) {
  for (const id of screenIds) {
    elements[id].hidden = id !== screenId;
  }
  const skipTargets = {
    TitleScreen: { href: "#NewGameButton", label: "跳到开始按钮" },
    GameScreen: { href: "#SceneTitle", label: "跳到故事正文" },
    EndingScreen: { href: "#EndingTitle", label: "跳到结局正文" },
  };
  const skipTarget = skipTargets[screenId];
  if (elements.SkipLink && skipTarget) {
    elements.SkipLink.href = skipTarget.href;
    elements.SkipLink.textContent = skipTarget.label;
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function Announce(message) {
  elements.LiveRegion.textContent = "";
  window.requestAnimationFrame(() => {
    elements.LiveRegion.textContent = message;
  });
}

function ShowToast(message) {
  window.clearTimeout(toastTimer);
  elements.Toast.textContent = message;
  elements.Toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.Toast.hidden = true;
  }, 2400);
}

function FormatSavedTime(timestamp) {
  if (timestamp == null || timestamp === "") {
    return "未记录";
  }
  const date = new Date(Number(timestamp));
  if (!Number.isFinite(date.getTime())) {
    return "未记录";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function RenderTitle(shouldFocus = false) {
  const stored = LoadState();
  elements.ContinueButton.disabled = !stored || !stored.started || stored.completed;
  const buttonKicker = elements.ContinueButton.querySelector(".buttonKicker");
  if (buttonKicker) {
    buttonKicker.textContent =
      stored && !stored.completed ? `记录于 ${FormatSavedTime(stored.updatedAt)}` : "本机存档";
  }
  ShowScreen("TitleScreen");
  if (shouldFocus) {
    elements.TitleHeading.focus({ preventScroll: true });
  }
}

function FormatTimeStatus(timeValue) {
  if (timeValue <= 2) {
    return { label: "余量充足", percent: 92 };
  }
  if (timeValue <= 5) {
    return { label: "还有余量", percent: 70 };
  }
  if (timeValue <= 8) {
    return { label: "余量不多", percent: 46 };
  }
  if (timeValue <= 11) {
    return { label: "余量很少", percent: 22 };
  }
  return { label: "时间不足", percent: 4 };
}

function FormatSoundStatus(soundValue) {
  if (soundValue <= 0) {
    return { label: "没有动静", percent: 3 };
  }
  if (soundValue <= 2) {
    return { label: "动静很小", percent: 28 };
  }
  if (soundValue <= 4) {
    return { label: "可能被听见", percent: 57 };
  }
  if (soundValue <= 6) {
    return { label: "动静很大", percent: 78 };
  }
  return { label: "很容易被听见", percent: 100 };
}

function FormatBondStatus(bondValue) {
  if (bondValue <= 1) {
    return { label: "还不熟", percent: 12 };
  }
  if (bondValue <= 4) {
    return { label: "开始配合", percent: 36 };
  }
  if (bondValue <= 7) {
    return { label: "互相照应", percent: 66 };
  }
  return { label: "彼此信任", percent: 100 };
}

function FormatHealthStatus(healthValue) {
  if (healthValue >= 7) {
    return "脚伤已经包扎固定";
  }
  if (healthValue >= 4) {
    return "还能继续走";
  }
  return "脚伤越来越重";
}

function SetMeter(meter, valueElement, status) {
  valueElement.textContent = status.label;
  meter.setAttribute("aria-valuenow", String(Math.round(status.percent)));
  meter.setAttribute("aria-valuetext", status.label);
  const fill = meter.querySelector(".meterFill");
  if (fill) {
    fill.style.width = `${status.percent}%`;
  }
}

function RenderStatus() {
  SetMeter(elements.TimeMeter, elements.TimeValue, FormatTimeStatus(gameState.time));
  SetMeter(elements.SoundMeter, elements.SoundValue, FormatSoundStatus(gameState.sound));
  SetMeter(elements.BondMeter, elements.BondValue, FormatBondStatus(gameState.bond));
}

function RenderRoute(scene) {
  elements.RouteRail.replaceChildren();
  for (const chapter of chapterDefinitions) {
    const item = CreateElement("li");
    item.dataset.state =
      chapter.id < scene.chapter ? "past" : chapter.id === scene.chapter ? "current" : "locked";
    if (chapter.id === scene.chapter) {
      item.setAttribute("aria-current", "step");
    }
    const copy = CreateElement("span");
    copy.append(
      CreateElement("strong", "", chapter.label),
      CreateElement(
        "small",
        "",
        chapter.id < scene.chapter ? "已经经过" : chapter.id === scene.chapter ? scene.place : "还没到",
      ),
    );
    item.append(CreateElement("span", "visuallyHidden", `第${chapter.id}章`), copy);
    elements.RouteRail.append(item);
  }
  const currentItem = elements.RouteRail.querySelector('[aria-current="step"]');
  if (currentItem && window.matchMedia("(max-width: 56rem)").matches) {
    window.requestAnimationFrame(() => {
      currentItem.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
    });
  }
}

function FormatEffectHint(effects = {}) {
  const parts = [];
  if (effects.time > 0) {
    parts.push(effects.time >= 2 ? "多花一些时间" : "花一点时间");
  } else if (effects.time < 0) {
    parts.push("节省时间");
  }
  if (effects.sound > 0) {
    parts.push(effects.sound >= 2 ? "动静较大" : "会有一点动静");
  } else if (effects.sound < 0) {
    parts.push("动静更小");
  }
  if (effects.health < 0) {
    parts.push("加重脚伤");
  } else if (effects.health > 0) {
    parts.push("缓解伤势");
  }
  if (effects.paper < 0) {
    parts.push("耗用纸张");
  }
  if (effects.bond > 0) {
    parts.push("配合更好");
  }
  return parts.join(" · ");
}

function GetChoiceTone(choice) {
  const effects = choice.effects || {};
  if ((effects.sound || 0) >= 2 || (effects.health || 0) < 0) {
    return "danger";
  }
  if ((effects.bond || 0) >= 2 || (effects.compassion || 0) >= 2) {
    return "bond";
  }
  if ((effects.time || 0) >= 2) {
    return "time";
  }
  return "";
}

function RenderChoices(scene) {
  elements.ChoiceList.replaceChildren();
  const choices = GetReachableChoices(gameState, scene);

  if (choices.length === 0) {
    const empty = CreateElement(
      "p",
      "storyAside",
      "由于当前物件或先前选择有误，游戏无法继续。请返回标题页读取自动存档，或重新开始。",
    );
    elements.ChoiceList.append(empty);
    return;
  }

  choices.forEach((choice, index) => {
    const button = CreateElement("button", "choiceButton");
    button.type = "button";
    button.dataset.choiceId = choice.id;
    const tone = GetChoiceTone(choice);
    if (tone) {
      button.dataset.tone = tone;
    }

    const choiceIndex = CreateElement("span", "choiceIndex", String(index + 1));
    choiceIndex.setAttribute("aria-hidden", "true");
    const choiceCopy = CreateElement("span", "choiceCopy");
    choiceCopy.append(
      CreateElement("strong", "", choice.label),
      CreateElement("small", "", choice.hint || ""),
    );
    const choiceCost = CreateElement("span", "choiceCost", FormatEffectHint(choice.effects));
    button.append(choiceIndex, choiceCopy, choiceCost);
    button.addEventListener("click", () => AdvanceStory(choice.id));
    elements.ChoiceList.append(button);
  });
}

function RenderInventory() {
  elements.InventoryList.replaceChildren();
  const allEntries = [];

  for (const itemId of gameState.items) {
    const definition =
      itemById.get(itemId) ||
      SupplyChoices.find((supply) => supply.itemId === itemId) || {
        id: itemId,
        label: itemId,
        note: "随身带着的物件",
        glyph: "物",
      };
    allEntries.push({
      id: definition.id,
      label: definition.label,
      note: definition.note || definition.hint || "随身带着的物件",
      glyph: definition.glyph || "物",
    });
  }

  for (const wordId of gameState.words) {
    const memory = memoryById.get(wordId);
    if (memory) {
      allEntries.push({
        id: `memory:${wordId}`,
        label: memory.label,
        note: memory.title,
        glyph: memory.glyph,
        memory,
      });
    }
  }

  if (allEntries.length === 0) {
    elements.InventoryList.append(CreateElement("li", "emptyItem", "没有其他物件。"));
    return;
  }

  for (const entry of allEntries) {
    const item = CreateElement("li");
    const name = CreateElement("span", "itemName", `${entry.glyph}　${entry.label}`);
    const note = CreateElement("span", "itemNote", entry.note);
    item.append(name, note);
    if (entry.memory) {
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", `查看途中记录：${entry.memory.title}`);
      item.addEventListener("click", () => OpenMemory(entry.memory));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          OpenMemory(entry.memory);
        }
      });
    }
    elements.InventoryList.append(item);
  }
}

function RenderScene(scene) {
  elements.ChapterLabel.textContent = scene.chapterLabel;
  elements.SceneEyebrow.textContent = `${scene.timeLabel} · ${scene.place}`;
  elements.SceneTitle.textContent = scene.title;
  elements.StoryCopy.replaceChildren(
    ...(scene.copy || []).map((paragraph) => CreateElement("p", "", paragraph)),
  );
  elements.DialogueList.replaceChildren();

  for (const line of scene.dialogue || []) {
    const dialogue = CreateElement("div", "dialogueLine");
    dialogue.append(
      CreateElement("span", "dialogueName", line.speaker),
      CreateElement("span", "dialogueText", line.text),
    );
    elements.DialogueList.append(dialogue);
  }

  RenderRoute(scene);
  RenderStatus();
  RenderChoices(scene);
  RenderInventory();
  elements.HistoryNoteButton.disabled = !HistoryById[scene.historyId];
  elements.HistoryNoteButton.dataset.historyId = scene.historyId || "";
  elements.SceneTitle.focus({ preventScroll: true });
  Announce(`${scene.chapterLabel}，${scene.title}`);
}

function RenderGame() {
  const scene = FindScene(gameState.currentSceneId);
  if (!scene) {
    RenderTitle();
    ShowToast("存档中的章节无法读取，已返回标题页。");
    return;
  }
  ShowScreen("GameScreen");
  RenderScene(scene);
}

function AdvanceStory(choiceId) {
  const scene = FindScene(gameState.currentSceneId);
  if (!scene) {
    return;
  }
  const choice = GetReachableChoices(gameState, scene).find((entry) => entry.id === choiceId);
  if (!choice) {
    ShowToast("这项选择现在不可用。");
    return;
  }

  gameState = ApplyChoiceEffects(gameState, choice);
  if (!gameState.visitedSceneIds.includes(scene.id)) {
    gameState.visitedSceneIds.push(scene.id);
  }
  gameState.choiceLog.push({
    sceneId: scene.id,
    choiceId: choice.id,
    at: Date.now(),
  });
  gameState.choiceLog = gameState.choiceLog.slice(-80);

  if (scene.historyId && !gameState.historySeen.includes(scene.historyId)) {
    gameState.historySeen.push(scene.historyId);
  }

  if (choice.next === StoryMeta.endingMarker || choice.next === "__ending__") {
    CompleteJourney();
    return;
  }

  if (!sceneById.has(choice.next)) {
    ShowToast("下一个场景无法读取。");
    return;
  }

  gameState.currentSceneId = choice.next;
  SaveState();
  RenderGame();
}

function BuildEndingSummary(ending) {
  const namedWords = gameState.words
    .map((wordId) => memoryById.get(wordId)?.label)
    .filter(Boolean)
    .join("、");
  const summary = [
    {
      label: "途中记录",
      value: namedWords || "没有补充记录",
    },
    {
      label: "学生名册",
      value: gameState.flags.rosterComplete
        ? "十九名学生都有记录；去向不明的仍写“待寻”"
        : "部分去向仍待下一组人核对",
    },
    {
      label: "两人的配合",
      value: FormatBondStatus(gameState.bond).label,
    },
    {
      label: "沈老师的伤脚",
      value: FormatHealthStatus(gameState.health),
    },
    {
      label: "史实边界",
      value: "人物、村庄和学生姓名为虚构；故事不涉及或改变真实战事",
    },
  ];

  if (gameState.items.includes("mimeographKit")) {
    summary.splice(2, 0, { label: "油印工具", value: "已经带到河东，可以继续使用" });
  } else if (gameState.flags.lostMimeographKit) {
    summary.splice(2, 0, { label: "油印工具", value: "留在河滩浅水处，位置已经做了记号" });
  }

  return { ending, summary };
}

function AddArchiveEntry(ending) {
  const entries = ReadJson(archiveKey, []);
  const nextEntry = {
    id: `${Date.now()}_${ending.id}`,
    endingId: ending.id,
    endingTitle: ending.title,
    endingKicker: ending.kicker,
    finalLine: ending.finalLine,
    completedAt: gameState.completedAt,
    choiceCount: gameState.choiceLog.length,
    words: [...gameState.words],
    items: [...gameState.items],
    stats: Object.fromEntries(stateMetrics.map((metric) => [metric, gameState[metric]])),
  };
  const uniqueEntries = [nextEntry, ...(Array.isArray(entries) ? entries : [])]
    .filter(
      (entry, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.endingId === entry.endingId && candidate.completedAt === entry.completedAt,
        ) === index,
    )
    .slice(0, 8);
  WriteJson(archiveKey, uniqueEntries);
}

function CompleteJourney() {
  const ending = ResolveEndingDefinition(gameState);
  if (!ending) {
    ShowToast("结局数据无法读取。");
    return;
  }

  gameState.completed = true;
  gameState.endingId = ending.id;
  gameState.completedAt = Date.now();
  gameState.updatedAt = gameState.completedAt;
  SaveState();
  AddArchiveEntry(ending);
  RenderEnding(ending);
}

function RenderEnding(ending) {
  const result = BuildEndingSummary(ending);
  elements.EndingKicker.textContent = ending.kicker;
  elements.EndingTitle.textContent = ending.title;
  elements.EndingCopy.replaceChildren(
    ...(ending.copy || []).map((paragraph) => CreateElement("p", "", paragraph)),
    CreateElement("blockquote", "", ending.finalLine),
  );
  elements.EndingSummary.replaceChildren();
  for (const entry of result.summary) {
    const item = CreateElement("div", "summaryItem");
    item.append(
      CreateElement("small", "", entry.label),
      CreateElement("strong", "", entry.value),
    );
    elements.EndingSummary.append(item);
  }
  ShowScreen("EndingScreen");
  elements.EndingTitle.focus({ preventScroll: true });
  Announce(`游戏结束：${ending.title}。${ending.finalLine}`);
}

function StartNewGame() {
  gameState = CreateInitialState();
  SaveState();
  RenderGame();
}

function ContinueGame() {
  const stored = LoadState();
  if (!stored || stored.completed) {
    ShowToast("没有可读取的进行中存档。");
    return;
  }
  gameState = stored;
  RenderGame();
}

function AddSourceLinks(container, sourceIds) {
  const sources = (sourceIds || []).map((sourceId) => SourceById[sourceId]).filter(Boolean);
  if (sources.length === 0) {
    return;
  }
  const sourceList = CreateElement("ul", "sourceList");
  for (const source of sources) {
    const item = CreateElement("li");
    const link = CreateElement("a", "", `${source.organization}：《${source.title}》`);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener";
    item.append(link);
    sourceList.append(item);
  }
  container.append(sourceList);
}

function OpenDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) {
      dialog.showModal();
    }
  } else {
    dialog.setAttribute("open", "");
    dialog.setAttribute("aria-modal", "true");
    dialog.tabIndex = -1;
    dialog.focus();
  }
}

function DialogIsOpen(dialog) {
  return Boolean(dialog?.open || dialog?.hasAttribute("open"));
}

function CloseDialog(dialog) {
  if (typeof dialog.close === "function" && DialogIsOpen(dialog)) {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
    dialog.removeAttribute("aria-modal");
  }
}

function SetArchiveHeading(kicker, title) {
  const heading = document.getElementById("archiveHeading");
  const kickerElement = heading?.previousElementSibling;
  if (heading) {
    heading.textContent = title;
  }
  if (kickerElement) {
    kickerElement.textContent = kicker;
  }
}

function OpenHistoryNote(historyId) {
  const note = HistoryById[historyId];
  if (!note) {
    ShowToast("本章注脚尚未收录。");
    return;
  }
  SetArchiveHeading(note.label, note.title);
  elements.ArchiveContent.replaceChildren();
  const article = CreateElement("article", "archiveEntry");
  article.append(
    CreateElement("time", "", "创作依据"),
    (() => {
      const copy = CreateElement("div");
      copy.append(
        CreateElement("h3", "", note.title),
        CreateElement("p", "", note.summary),
        CreateElement("p", "", `创作边界：${note.boundary}`),
      );
      AddSourceLinks(copy, note.sourceIds);
      return copy;
    })(),
  );
  elements.ArchiveContent.append(article);
  if (gameState && !gameState.historySeen.includes(note.id)) {
    gameState.historySeen.push(note.id);
    SaveState();
  }
  OpenDialog(elements.ArchiveDialog);
}

function OpenMemory(memory) {
  SetArchiveHeading("途中记录", memory.title);
  elements.ArchiveContent.replaceChildren();
  const article = CreateElement("article", "archiveEntry");
  article.append(
    CreateElement("time", "", `记录：${memory.label}`),
    (() => {
      const copy = CreateElement("div");
      copy.append(
        CreateElement("h3", "", memory.title),
        CreateElement("p", "", memory.copy),
      );
      return copy;
    })(),
  );
  elements.ArchiveContent.append(article);
  OpenDialog(elements.ArchiveDialog);
}

function RenderJourneyArchive() {
  SetArchiveHeading("本机保存", "游戏记录和史料");
  elements.ArchiveContent.replaceChildren();
  const entries = ReadJson(archiveKey, []);

  if (!Array.isArray(entries) || entries.length === 0) {
    elements.ArchiveContent.append(
      CreateElement(
        "p",
        "emptyArchive",
        "还没有完成过故事。完成一次后，结局和本次选择会保存在这里。下方的史料来源现在就可以查看。",
      ),
    );
  } else {
    for (const entry of entries) {
      const article = CreateElement("article", "archiveEntry");
      const copy = CreateElement("div");
      const currentEnding = endingById.get(entry.endingId);
      copy.append(
        CreateElement("h3", "", currentEnding?.title || entry.endingTitle),
        CreateElement("p", "", currentEnding?.finalLine || entry.finalLine),
        CreateElement(
          "p",
          "",
          `途中记录：${
            (entry.words || [])
              .map((wordId) => memoryById.get(wordId)?.label)
              .filter(Boolean)
              .join("、") || "没有"
          }`,
        ),
      );
      article.append(
        CreateElement("time", "", FormatSavedTime(entry.completedAt)),
        copy,
      );
      elements.ArchiveContent.append(article);
    }
  }

  const boundary = CreateElement("article", "archiveEntry");
  const boundaryCopy = CreateElement("div");
  boundaryCopy.append(
    CreateElement("h3", "", "史实与虚构的界线"),
    CreateElement("p", "", HistoricalFrame.playerBoundary),
    CreateElement("p", "", HistoricalFrame.namingBoundary),
  );
  boundary.append(CreateElement("time", "", HistoricalFrame.period), boundaryCopy);
  elements.ArchiveContent.append(boundary);

  for (const term of HistoricalTerms) {
    const article = CreateElement("article", "archiveEntry");
    const copy = CreateElement("div");
    copy.append(
      CreateElement("h3", "", term.term),
      CreateElement("p", "", term.definition),
    );
    article.append(CreateElement("time", "", "用语说明"), copy);
    elements.ArchiveContent.append(article);
  }

  const sourceArticle = CreateElement("article", "archiveEntry");
  const sourceCopy = CreateElement("div");
  sourceCopy.append(
    CreateElement("h3", "", "公开资料来源"),
    CreateElement(
      "p",
      "",
      "以下链接用于核对日期、地名、战时教育、油印方式、群众工作和太行地理。本页的虚构情节不作为历史资料。",
    ),
  );
  AddSourceLinks(
    sourceCopy,
    HistoricalSources.map((source) => source.id),
  );
  sourceArticle.append(CreateElement("time", "", `${HistoricalSources.length}项`), sourceCopy);
  elements.ArchiveContent.append(sourceArticle);
  OpenDialog(elements.ArchiveDialog);
}

function OpenSettings() {
  ApplySettings(LoadSettings());
  OpenDialog(elements.SettingsDialog);
}

function HandleKeyboard(event) {
  if (event.key === "Escape") {
    if (DialogIsOpen(elements.ArchiveDialog)) {
      CloseDialog(elements.ArchiveDialog);
    }
    if (DialogIsOpen(elements.SettingsDialog)) {
      CloseDialog(elements.SettingsDialog);
    }
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return;
  }

  if (
    !elements.GameScreen.hidden &&
    !DialogIsOpen(elements.ArchiveDialog) &&
    !DialogIsOpen(elements.SettingsDialog)
  ) {
    const choiceIndex = Number.parseInt(event.key, 10) - 1;
    const choiceButtons = [...elements.ChoiceList.querySelectorAll(".choiceButton")];
    if (choiceIndex >= 0 && choiceIndex < choiceButtons.length) {
      event.preventDefault();
      choiceButtons[choiceIndex].click();
      return;
    }
    if (event.key.toLowerCase() === "h") {
      event.preventDefault();
      elements.HistoryNoteButton.click();
    }
  }

  if (event.key.toLowerCase() === "a" && !DialogIsOpen(elements.SettingsDialog)) {
    event.preventDefault();
    RenderJourneyArchive();
  }
}

function BindEvents() {
  elements.NewGameButton.addEventListener("click", StartNewGame);
  elements.ContinueButton.addEventListener("click", ContinueGame);
  elements.RestartButton.addEventListener("click", StartNewGame);
  elements.BrandButton.addEventListener("click", () => RenderTitle(true));
  elements.ArchiveButton.addEventListener("click", RenderJourneyArchive);
  elements.EndingArchiveButton.addEventListener("click", RenderJourneyArchive);
  elements.ArchiveCloseButton.addEventListener("click", () => CloseDialog(elements.ArchiveDialog));
  elements.SettingsCloseButton.addEventListener("click", () => CloseDialog(elements.SettingsDialog));
  elements.TitleSettingsButton.addEventListener("click", OpenSettings);
  elements.GameSettingsButton.addEventListener("click", OpenSettings);
  elements.HistoryNoteButton.addEventListener("click", () => {
    const historyId = elements.HistoryNoteButton.dataset.historyId;
    OpenHistoryNote(historyId);
  });

  elements.MotionToggle.addEventListener("change", SaveSettingsFromControls);
  elements.ContrastToggle.addEventListener("change", SaveSettingsFromControls);
  elements.TextSizeSelect.addEventListener("change", SaveSettingsFromControls);

  elements.ArchiveDialog.addEventListener("click", (event) => {
    if (event.target === elements.ArchiveDialog) {
      CloseDialog(elements.ArchiveDialog);
    }
  });
  elements.SettingsDialog.addEventListener("click", (event) => {
    if (event.target === elements.SettingsDialog) {
      CloseDialog(elements.SettingsDialog);
    }
  });
  document.addEventListener("keydown", HandleKeyboard);
}

function InitializeGame() {
  elements = GetElements();
  const missing = Object.entries(elements)
    .filter(([, element]) => !element)
    .map(([id]) => id);
  if (missing.length > 0) {
    throw new Error(`Missing required interface elements: ${missing.join(", ")}`);
  }
  elements.SceneTitle.tabIndex = -1;
  elements.EndingTitle.tabIndex = -1;
  elements.TitleHeading.tabIndex = -1;
  ApplySettings(LoadSettings());
  BindEvents();
  RenderTitle();
}

if (typeof document !== "undefined") {
  InitializeGame();
}
