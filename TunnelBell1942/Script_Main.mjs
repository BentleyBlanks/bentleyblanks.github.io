// 《地道战 · 钟声》—— 集成层：输入、主循环、界面、音效、存档。
//
// 这一层不含任何玩法规则。规则在 Script_Rules.mjs，画面在 Script_Render.mjs。
// 每帧的顺序是固定的：
//   采集输入 → Rules.StepPlay → DrainEvents 分发（UI / 音效 / 视觉）→ Render.Sync
//
// 页面暴露 window.TunnelBell 给自动化测试与截图用（见 Script_BrowserTestKit.mjs）。

import * as Rules from "./Script_Rules.mjs";
import { CHAPTERS, CODEX, PANELS } from "./Data_Story.mjs";
import { CreateRenderer } from "./Script_Render.mjs";
import { CreateAudio } from "./Script_Audio.mjs";

const shell = document.getElementById("GameShell");
const canvas = document.getElementById("GameCanvas");
const bootError = document.getElementById("BootError");

const el = (id) => document.getElementById(id);
const screens = {
  title: el("TitleScreen"),
  chapter: el("ChapterScreen"),
  panel: el("PanelScreen"),
  codex: el("CodexScreen"),
  help: el("HelpScreen"),
  end: el("EndScreen"),
};

let state = null;
let render = null;
let running = false;
let lastFrame = 0;
let rafId = 0;
let panelQueue = [];
let activePanelId = null;
let pendingAfterPanels = null;
let toastTimer = 0;
let bootFailed = false;

// ─────────────────────────────────────────── 错误可见化
// 白盒最怕"页面看着在跑但其实黑屏"。任何启动期异常都要显式打到页面上。
function ShowBootError(where, error) {
  bootFailed = true;
  const text = `[${where}] ${error && error.stack ? error.stack : String(error)}`;
  console.error(text);
  if (bootError) {
    bootError.hidden = false;
    bootError.textContent = text.slice(0, 900);
  }
  window.__tunnelBellError = text;
}
window.addEventListener("error", (e) => ShowBootError("window", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => ShowBootError("promise", e.reason));

// ─────────────────────────────────────────── 输入
const keyState = Object.create(null);
const input = {
  moveX: 0,
  up: false,
  down: false,
  crouch: false,
  sneak: false,
  interactPressed: false,
  itemPressed: false,
  callPressed: false,
};
const touchHold = Object.create(null);

const KEY_LEFT = ["KeyA", "ArrowLeft"];
const KEY_RIGHT = ["KeyD", "ArrowRight"];
const KEY_UP = ["KeyW", "ArrowUp"];
const KEY_DOWN = ["KeyS", "ArrowDown"];
const KEY_SNEAK = ["ShiftLeft", "ShiftRight"];
const KEY_USE = ["KeyE", "Space", "Enter"];

const anyKey = (list) => list.some((code) => keyState[code]);

function CollectInput() {
  const uiBlocking = !screens.panel.hidden || !screens.help.hidden || !screens.codex.hidden
    || !screens.chapter.hidden || !screens.end.hidden || !screens.title.hidden;
  if (uiBlocking) {
    input.moveX = 0;
    input.up = false;
    input.down = false;
    input.crouch = false;
    input.sneak = false;
    return;
  }
  const left = anyKey(KEY_LEFT) || touchHold.left;
  const right = anyKey(KEY_RIGHT) || touchHold.right;
  input.moveX = (right ? 1 : 0) - (left ? 1 : 0);
  input.up = anyKey(KEY_UP) || !!touchHold.up;
  input.down = anyKey(KEY_DOWN) || !!touchHold.down;
  // 下键身兼两职：地道口/竖井向下，以及猫腰。Rules 里靠有没有可下的通道区分。
  input.crouch = input.down;
  input.sneak = anyKey(KEY_SNEAK) || !!touchHold.sneak;
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) {
    keyState[e.code] = true;
    return;
  }
  keyState[e.code] = true;

  // 过场：翻页与跳过。Esc 在过场里是"跳过"，不是"打开帮助"。
  // typeof 保护是因为过场状态机由并行 agent 实现，接口没到位时不能让整页挂掉。
  if (state && state.cutscene) {
    e.preventDefault();
    if (e.code === "Escape") {
      if (state.cutscene.skippable && typeof Rules.SkipCutscene === "function") {
        Rules.SkipCutscene(state);
        AfterCutsceneInput();
      }
      return;
    }
    if (KEY_USE.includes(e.code)) {
      if (!screens.panel.hidden) AdvancePanel();
      if (typeof Rules.AdvanceCutscene === "function") Rules.AdvanceCutscene(state);
      AfterCutsceneInput();
    }
    return;
  }

  if (!screens.panel.hidden) {
    if (KEY_USE.includes(e.code) || e.code === "Escape") {
      e.preventDefault();
      AdvancePanel();
    }
    return;
  }
  if (!screens.codex.hidden) {
    if (KEY_USE.includes(e.code) || e.code === "Escape") { e.preventDefault(); CloseCodex(); }
    return;
  }
  if (!screens.help.hidden) {
    if (KEY_USE.includes(e.code) || e.code === "Escape") { e.preventDefault(); screens.help.hidden = true; }
    return;
  }
  if (!screens.title.hidden || !screens.chapter.hidden || !screens.end.hidden) return;

  if (KEY_USE.includes(e.code)) { e.preventDefault(); input.interactPressed = true; }
  if (e.code === "KeyQ") input.itemPressed = true;
  if (e.code === "KeyF") input.callPressed = true;
  if (e.code === "KeyR" && state) { Rules.RespawnAtCheckpoint(state); Toast("回到安全点"); }
  if (e.code === "Escape") OpenHelp();
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => { keyState[e.code] = false; });
window.addEventListener("blur", () => { for (const k in keyState) keyState[k] = false; });

// 触摸
const touchPad = el("TouchPad");
for (const btn of touchPad.querySelectorAll("[data-hold]")) {
  const name = btn.dataset.hold;
  const down = (e) => { e.preventDefault(); touchHold[name] = true; };
  const up = (e) => { e.preventDefault(); touchHold[name] = false; };
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("pointerleave", up);
}
for (const btn of touchPad.querySelectorAll("[data-tap]")) {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!screens.panel.hidden) { AdvancePanel(); return; }
    input.interactPressed = true;
  });
}
// 气泡屏点哪儿都能翻页
screens.panel.addEventListener("pointerdown", () => AdvancePanel());

const isTouch = matchMedia("(hover: none) and (pointer: coarse)").matches;

// ─────────────────────────────────────────── 音频
// 三层现场合成（环境 / 紧张 / 钟的母题）都在 Script_Audio.mjs 里，
// 这里只负责解锁、转发事件和每帧推进。模块自带降级：拿不到 AudioContext
// 会返回一个空壳，所有方法可调用不抛错——绝不能因为没声音就让游戏起不来。
let audio = null;

function EnsureAudio() {
  if (audio) audio.Unlock();
}

function PlaySfx(id, at) {
  if (audio) audio.Play(id, at);
}

// ─────────────────────────────────────────── 象形图标（气泡里的符号）
const ICON_PATHS = {
  bell: "M12 3a5 5 0 0 0-5 5v4l-2 3h14l-2-3V8a5 5 0 0 0-5-5zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 21z",
  run: "M13 4a2 2 0 1 0 0-.01zM8 21l3-5-2-3 1-5 4 2 3 1M6 12l3-3M14 13l3 4",
  dig: "M4 20l7-7M11 13l3-3 4 4-3 3zM14 6l4-2 2 2-2 4z",
  down: "M12 4v13M6 12l6 6 6-6",
  up: "M12 20V7M6 12l6-6 6 6",
  eye: "M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  quiet: "M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18",
  fire: "M12 2s5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s0 2 2 2 2-4 2-8z",
  water: "M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z",
  gas: "M5 16a3 3 0 0 1 0-6 4 4 0 0 1 7-2 4 4 0 0 1 7 3 3 3 0 0 1-1 5zM7 20h3M13 20h4",
  lantern: "M9 2h6M10 2v3h4V2M7 8h10l1 12H6zM12 10v6",
  heart: "M12 21S3 14 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5C21 14 12 21 12 21z",
  child: "M12 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM9 10h6l1 6h-2l-.5 5h-3L10 16H8z",
  grain: "M12 21V8M12 8s-4-1-4-4 4-2 4-2 4-1 4 2-4 4-4 4zM12 13s-3-1-3-3M12 13s3-1 3-3",
  rifle: "M3 15l14-8 3 2-14 8zM8 12l2 4M16 6l1-3",
  boot: "M7 3v10l-3 4v4h14v-3l-5-3V3z",
  tunnel: "M3 21V11a9 9 0 0 1 18 0v10M8 21v-9a4 4 0 0 1 8 0v9",
  village: "M3 21V10l6-5 6 5v11M9 21v-6h4v6M17 21V12l3-2 2 2v9",
  cross: "M12 3v18M5 9h14",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l4 2",
};

function IconSvg(name) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  const span = document.createElement("span");
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#14100b" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  return span;
}

const PORTRAIT_GLYPH = {
  laozhong: "忠",
  chuanbao: "宝",
  linxia: "霞",
  villager: "乡",
  yamada: "田",
  child: "娃",
};

// ─────────────────────────────────────────── 剧情气泡
function QueuePanels(ids, after) {
  const list = (ids || []).filter((id) => PANELS[id]);
  if (!list.length) { if (after) after(); return; }
  panelQueue = panelQueue.concat(list);
  if (after) pendingAfterPanels = after;
  if (screens.panel.hidden) ShowNextPanel();
}

function ShowNextPanel() {
  const id = panelQueue.shift();
  if (!id) {
    screens.panel.hidden = true;
    activePanelId = null;
    document.body.dataset.cinematic = "0";
    const after = pendingAfterPanels;
    pendingAfterPanels = null;
    if (after) after();
    return;
  }
  const panel = PANELS[id];
  activePanelId = id;
  document.body.dataset.cinematic = "1";
  el("PanelCard").dataset.mood = panel.mood || "talk";
  el("PanelSpeaker").textContent = panel.speaker || "";
  el("PanelText").textContent = panel.text || "";

  const portrait = el("PanelPortrait");
  const glyph = PORTRAIT_GLYPH[panel.portrait];
  portrait.hidden = !glyph;
  portrait.dataset.glyph = glyph || "";

  const icons = el("PanelIcons");
  icons.textContent = "";
  for (const name of panel.icons || []) {
    const node = IconSvg(name);
    if (node) icons.appendChild(node);
  }
  screens.panel.hidden = false;
  PlaySfx(panel.mood === "shout" ? "shout" : "cloth");
}

function AdvancePanel() {
  if (screens.panel.hidden) return;
  ShowNextPanel();
}
el("PanelNext").addEventListener("click", (e) => { e.stopPropagation(); AdvancePanel(); });

// ─────────────────────────────────────────── 其它界面
function OpenHelp() { screens.help.hidden = false; }
el("HelpButton").addEventListener("click", OpenHelp);
el("HelpClose").addEventListener("click", () => { screens.help.hidden = true; });
el("HudMenu").addEventListener("click", OpenHelp);

function OpenCodex(id) {
  const entry = CODEX.find((c) => c.id === id);
  if (!entry) return;
  el("CodexTitle").textContent = entry.title;
  el("CodexBody").textContent = entry.body;
  screens.codex.hidden = false;
}
function CloseCodex() { screens.codex.hidden = true; }
el("CodexClose").addEventListener("click", CloseCodex);

/** 过场里按了键之后，立刻把事件与画面同步一次，别等下一帧——
 *  跳过时如果晚一帧，黑边和淡入淡出会闪一下。 */
function AfterCutsceneInput() {
  DispatchEvents(Rules.DrainEvents(state));
  SyncCutscene();
}

function FlashObjective() {
  const node = el("HudObjective");
  node.dataset.flash = "1";
  setTimeout(() => { node.dataset.flash = "0"; }, 1400);
}

function Toast(text) {
  const node = el("HudToast");
  node.textContent = text;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2200);
}

// ─────────────────────────────────────────── 幕
function ShowChapterCard(chapterIndex, onGo) {
  const chapter = CHAPTERS[chapterIndex] || CHAPTERS[0];
  const cn = ["第一幕", "第二幕", "第三幕", "第四幕"];
  el("ChapterIndex").textContent = cn[chapterIndex] || `第 ${chapterIndex + 1} 幕`;
  el("ChapterTitle").textContent = chapter ? chapter.title : "";
  el("ChapterSubtitle").textContent = chapter ? (chapter.subtitle || "") : "";
  el("ChapterEpilogue").textContent = "";
  screens.chapter.hidden = false;
  el("ChapterGoButton").onclick = () => {
    screens.chapter.hidden = true;
    onGo();
  };
}

function StartLevel(levelIndex) {
  screens.title.hidden = true;
  screens.end.hidden = true;
  screens.panel.hidden = true;
  screens.codex.hidden = true;
  el("Hud").hidden = true;
  // 上一幕的收尾气泡如果还排在队里，它的回调会在新一幕开打之后才跑，
  // 把上一幕的幕终卡盖到正在玩的画面上。换幕必须把叙事队列连回调一起清干净。
  panelQueue.length = 0;
  pendingAfterPanels = null;
  activePanelId = null;
  document.body.dataset.cinematic = "0";

  ShowChapterCard(levelIndex, () => {
    try {
      if (!state) state = Rules.CreateState(levelIndex);
      else Rules.ResetLevel(state, levelIndex);
      render.BuildLevel(state.level);
      el("Hud").hidden = false;
      touchPad.hidden = !isTouch;
      const chapter = CHAPTERS[levelIndex];
      QueuePanels(chapter ? chapter.opening : []);
      canvas.focus();
      running = true;
      lastFrame = performance.now();
      Persist();
    } catch (error) {
      ShowBootError("StartLevel", error);
    }
  });
}

function FinishLevel() {
  running = false;
  const chapter = CHAPTERS[state.levelIndex];
  QueuePanels(chapter ? chapter.closing : [], () => {
    const isLast = state.levelIndex >= 2;
    el("EndTitle").textContent = isLast ? "全村都出来了" : (chapter ? chapter.title : "本幕结束");
    el("EndBody").textContent = chapter && chapter.epilogue ? chapter.epilogue : "";
    el("EndNext").hidden = isLast;
    el("EndNext").textContent = "下一幕";
    el("EndRetry").textContent = isLast ? "从头再来" : "重玩本幕";
    screens.end.hidden = false;
    el("Hud").hidden = true;
    touchPad.hidden = true;
    Persist(state.levelIndex + 1);
  });
}

el("EndNext").addEventListener("click", () => {
  const next = Math.min(2, state.levelIndex + 1);
  StartLevel(next);
});
el("EndRetry").addEventListener("click", () => {
  StartLevel(state.levelIndex >= 2 && screens.end.querySelector("#EndNext").hidden ? 0 : state.levelIndex);
});

// ─────────────────────────────────────────── 存档
function Persist(levelOverride) {
  try {
    const raw = Rules.SerializeProgress(state);
    const parsed = JSON.parse(raw);
    if (levelOverride !== undefined) parsed.levelIndex = Math.min(2, levelOverride);
    localStorage.setItem(Rules.SAVE_KEY, JSON.stringify(parsed));
  } catch { /* 隐私模式下 localStorage 不可用，静默降级 */ }
}

function ReadSave() {
  try {
    const raw = localStorage.getItem(Rules.SAVE_KEY);
    if (!raw) return null;
    return Rules.LoadProgress(raw);
  } catch { return null; }
}

// ─────────────────────────────────────────── HUD
const hudObjective = el("HudObjective");
const hudPrompt = el("HudPrompt");
const hudAlert = el("HudAlert");
const hudAlertFill = el("HudAlertFill");
const hudVillagers = el("HudVillagers");
const hudCarry = el("HudCarry");
let lastObjective = "";
let lastPromptKey = "";

// ─────────────────────────────────────────── 过场
const cutFade = el("CutFade");
const cutSkip = el("CutSkip");
let lastCutId = null;

function SyncCutscene() {
  const cut = state.cutscene;
  if (!cut) {
    if (lastCutId !== null) {
      delete document.body.dataset.cutscene;
      cutFade.style.opacity = "0";
      cutSkip.hidden = true;
      lastCutId = null;
    }
    return;
  }
  if (cut.id !== lastCutId) {
    lastCutId = cut.id;
    document.body.dataset.cutscene = cut.letterbox === "full" ? "full" : "wide";
    cutSkip.hidden = !cut.skippable;
  }
  // fade 由 Rules 推进，这里只把数值搬到画面上
  cutFade.style.opacity = String(Math.max(0, Math.min(1, cut.fade || 0)));
}

function SyncHud() {
  const objective = state.hud.objective || "";
  if (objective !== lastObjective) {
    hudObjective.textContent = objective;
    lastObjective = objective;
  }

  // 提示条：只有 key 和 label 都在才显示。
  // 不能只靠 memo 判断显隐——半成品的 prompt（label 为空）会留下一个空徽章挂在屏幕上。
  const prompt = state.hud.prompt;
  const usable = prompt && prompt.key && prompt.label;
  const key = usable ? `${prompt.key}|${prompt.label}` : "";
  if (key !== lastPromptKey) {
    lastPromptKey = key;
    hudPrompt.hidden = !usable;
    if (usable) {
      hudPrompt.firstElementChild.textContent = prompt.key;
      hudPrompt.lastElementChild.textContent = prompt.label;
    }
  }

  const suspicion = state.hud.suspicion || 0;
  hudAlert.dataset.on = suspicion > 0.04 ? "1" : "0";
  hudAlert.dataset.hot = suspicion > 0.62 ? "1" : "0";
  hudAlertFill.style.width = `${Math.min(100, suspicion * 100).toFixed(0)}%`;

  if (state.hud.villagersTotal > 0) {
    hudVillagers.hidden = false;
    hudVillagers.textContent = `乡亲 ${state.hud.villagersSafe}/${state.hud.villagersTotal}`;
  } else hudVillagers.hidden = true;

  if (state.player.carrying) {
    hudCarry.hidden = false;
    hudCarry.textContent = state.hud.carryLabel || state.player.carrying;
  } else hudCarry.hidden = true;
}

// ─────────────────────────────────────────── 事件分发
function DispatchEvents(events) {
  for (const event of events) {
    switch (event.kind) {
      case "panel": QueuePanels([event.id]); break;
      // 事件对象本身带 { x, y }，直接透传给音频层做空间化
      case "sfx": PlaySfx(event.id, event); break;
      case "codex": OpenCodex(event.id); break;
      // 新目标不弹居中大字：左上角那行已经写着同样的话，弹一次等于把同一句话说两遍。
      // 改成让角落那行闪一下，玩家的眼睛会跟过去。
      case "objective": FlashObjective(); break;
      case "checkpoint": Toast("安全点"); break;
      case "spot": PlaySfx("alarm", event); break;
      case "lost": PlaySfx("death", event); break;
      case "won": FinishLevel(); break;
      default: break;
    }
    try { render.ConsumeEvent(event); } catch { /* 视觉反馈失败不该中断玩法 */ }
  }
}

// ─────────────────────────────────────────── 主循环
function Frame(now) {
  rafId = requestAnimationFrame(Frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  if (!state || !render) return;

  try {
    if (running && screens.panel.hidden && screens.codex.hidden
        && screens.help.hidden && screens.end.hidden && screens.chapter.hidden) {
      CollectInput();
      Object.assign(state.input, input);
      Rules.StepPlay(state, dt);
      input.interactPressed = false;
      input.itemPressed = false;
      input.callPressed = false;
      DispatchEvents(Rules.DrainEvents(state));
      SyncCutscene();
      SyncHud();
    }
    render.Sync(state, dt);
    // 音频每帧都推，不受 running 限制——标题画面和过场里环境层也该继续呼吸
    if (audio) audio.Sync(state, dt);
  } catch (error) {
    running = false;
    ShowBootError("frame", error);
    cancelAnimationFrame(rafId);
  }
}

function Resize() {
  if (!render) return;
  const width = shell.clientWidth;
  const height = shell.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  render.Resize(width, height, dpr);
  // 规则层靠这个夹紧摄像机。不告诉它真实宽高比，竖屏手机上出生点会落在画面外。
  if (state && state.camera && height > 0) state.camera.aspect = width / height;
}
window.addEventListener("resize", Resize);
window.addEventListener("orientationchange", () => setTimeout(Resize, 120));

// ─────────────────────────────────────────── 启动
/**
 * 后处理是纯填充率开销：真 GPU 上几趟模糊是零点几毫秒，软件光栅上直接翻倍。
 * 桌面浏览器被拉黑 GPU 时会静默退回 SwiftShader/llvmpipe，用户看不出来，
 * 只觉得"这游戏怎么这么卡"。开渲染器之前先探一次真实的 renderer 字符串。
 */
function DetectQuality() {
  if (isTouch) return "medium";
  try {
    const probe = document.createElement("canvas").getContext("webgl2")
      || document.createElement("canvas").getContext("webgl");
    if (!probe) return "low";
    const ext = probe.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(probe.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return "low";
  } catch { /* 探测失败就按桌面默认走 */ }
  return "high";
}

function Boot() {
  try {
    render = CreateRenderer(canvas, { quality: DetectQuality() });
  } catch (error) {
    ShowBootError("CreateRenderer", error);
    return;
  }
  // 音频自带降级，不用包 try——拿不到 AudioContext 会返回空壳
  audio = CreateAudio({ volume: 0.85 });
  try {
    state = Rules.CreateState(0);
  } catch (error) {
    ShowBootError("CreateState", error);
    return;
  }
  Resize();
  rafId = requestAnimationFrame(Frame);

  const save = ReadSave();
  if (save && save.levelIndex > 0) {
    const cont = el("ContinueButton");
    cont.hidden = false;
    cont.textContent = `继续 · 第${["一", "二", "三"][Math.min(2, save.levelIndex)]}幕`;
    cont.addEventListener("click", () => { EnsureAudio(); StartLevel(Math.min(2, save.levelIndex)); });
  }
  el("BeginButton").addEventListener("click", () => { EnsureAudio(); StartLevel(0); });

  // ── 自动化测试与截图句柄 ──
  window.TunnelBell = {
    get state() { return state; },
    get render() { return render; },
    Rules,
    Begin(levelIndex = 0) {
      EnsureAudio();
      StartLevel(levelIndex);
      // 跳过幕间卡，测试要直接进游戏
      const go = el("ChapterGoButton");
      if (!screens.chapter.hidden) go.click();
    },
    /** 测试/截图用：把当前过场直接结算掉。有界循环，卡住就退出而不是空转。 */
    SkipCutscenes(maxRounds = 12) {
      for (let i = 0; i < maxRounds && state.cutscene; i += 1) {
        const before = state.cutscene.id;
        if (typeof Rules.SkipCutscene === "function") Rules.SkipCutscene(state);
        else if (typeof Rules.AdvanceCutscene === "function") Rules.AdvanceCutscene(state);
        else break;
        DispatchEvents(Rules.DrainEvents(state));
        if (state.cutscene && state.cutscene.id === before) break; // 跳不动就别死循环
      }
      SyncCutscene();
    },
    SkipPanels() {
      panelQueue.length = 0;
      const after = pendingAfterPanels;
      pendingAfterPanels = null;
      screens.panel.hidden = true;
      activePanelId = null;
      document.body.dataset.cinematic = "0";
      if (after) after();
    },
    SetInput(patch) { Object.assign(input, patch); },
    /** 用固定步长推进模拟（不依赖 rAF，截图/测试用）。 */
    Advance(seconds, patch) {
      if (patch) Object.assign(input, patch);
      const step = 1 / 60;
      let left = seconds;
      while (left > 0) {
        const dt = Math.min(step, left);
        Object.assign(state.input, input);
        Rules.StepPlay(state, dt);
        DispatchEvents(Rules.DrainEvents(state));
        input.interactPressed = false;
        input.itemPressed = false;
        input.callPressed = false;
        left -= dt;
      }
      SyncHud();
      render.Sync(state, 1 / 60);
    },
    Teleport(x, y) { Rules.DebugTeleport(state, x, y); render.Sync(state, 1 / 60); },
    Muted(on) { if (audio) audio.SetMuted(!!on); },
    get audio() { return audio; },
    get error() { return window.__tunnelBellError || null; },
    get ready() { return !bootFailed && !!state && !!render; },
  };
}

Boot();
