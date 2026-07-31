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

// ─────────────────────────────────────────── 音效（WebAudio 现场合成，无资源文件）
let audioCtx = null;
let masterGain = null;
function EnsureAudio() {
  if (audioCtx || bootFailed) return;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    audioCtx = new Ctor();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.36;
    masterGain.connect(audioCtx.destination);
  } catch {
    audioCtx = null;
  }
}

let noiseBuffer = null;
function NoiseBuffer() {
  if (noiseBuffer || !audioCtx) return noiseBuffer;
  const len = audioCtx.sampleRate * 1.2;
  noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return noiseBuffer;
}

function Tone(freq, dur, type, gain, sweepTo) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(masterGain);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function Noise(dur, gain, filterHz, q) {
  if (!audioCtx) return;
  const buf = NoiseBuffer();
  if (!buf) return;
  const t = audioCtx.currentTime;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const filter = audioCtx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterHz;
  filter.Q.value = q || 1;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(masterGain);
  src.start(t);
  src.stop(t + dur);
}

const SFX = {
  step_dirt: () => Noise(0.09, 0.16, 320, 1.1),
  step_stone: () => Noise(0.07, 0.2, 900, 2.0),
  cloth: () => Noise(0.13, 0.08, 1800, 0.8),
  dig: () => { Noise(0.18, 0.3, 420, 0.9); Tone(90, 0.14, "triangle", 0.16, 55); },
  bell_ring: () => {
    // 铁钟：几个不谐和的分音叠一起才像"铁"，不像"乐器"
    Tone(524, 2.6, "triangle", 0.34, 512);
    Tone(786, 2.1, "sine", 0.2, 770);
    Tone(1247, 1.5, "sine", 0.12, 1220);
    Tone(262, 3.0, "sine", 0.16, 258);
    Noise(0.14, 0.22, 2600, 1.4);
  },
  hatch_open: () => { Noise(0.42, 0.24, 260, 0.7); Tone(70, 0.3, "triangle", 0.18, 44); },
  ladder: () => Noise(0.1, 0.13, 700, 1.6),
  water: () => Noise(0.7, 0.16, 480, 0.5),
  gas: () => Noise(1.0, 0.13, 260, 0.4),
  alarm: () => { Tone(880, 0.16, "square", 0.2, 880); setTimeout(() => Tone(660, 0.22, "square", 0.2, 620), 150); },
  shout: () => { Tone(300, 0.3, "sawtooth", 0.16, 160); Noise(0.24, 0.1, 1100, 0.8); },
  dog: () => { Tone(240, 0.14, "sawtooth", 0.22, 120); setTimeout(() => Tone(220, 0.12, "sawtooth", 0.18, 110), 130); },
  pickup: () => { Tone(660, 0.1, "sine", 0.16, 880); Tone(990, 0.14, "sine", 0.1, 1200); },
  lever: () => { Noise(0.14, 0.24, 380, 1.4); Tone(140, 0.2, "square", 0.12, 90); },
  push: () => Noise(0.55, 0.2, 190, 0.6),
  land: () => { Noise(0.13, 0.26, 200, 0.8); Tone(64, 0.16, "sine", 0.2, 42); },
  breath: () => Noise(0.34, 0.06, 640, 0.5),
  heartbeat: () => { Tone(58, 0.14, "sine", 0.26, 42); setTimeout(() => Tone(52, 0.16, "sine", 0.18, 38), 190); },
};

function PlaySfx(id) {
  EnsureAudio();
  if (!audioCtx) return;
  const fn = SFX[id];
  if (fn) { try { fn(); } catch { /* 音效失败不影响玩法 */ } }
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
  el("Hud").hidden = true;

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

function SyncHud() {
  const objective = state.hud.objective || "";
  if (objective !== lastObjective) {
    hudObjective.textContent = objective;
    lastObjective = objective;
  }

  const prompt = state.hud.prompt;
  const key = prompt ? `${prompt.key}|${prompt.label}` : "";
  if (key !== lastPromptKey) {
    lastPromptKey = key;
    if (prompt) {
      hudPrompt.hidden = false;
      hudPrompt.firstElementChild.textContent = prompt.key;
      hudPrompt.lastElementChild.textContent = prompt.label;
    } else {
      hudPrompt.hidden = true;
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
      case "sfx": PlaySfx(event.id); break;
      case "codex": OpenCodex(event.id); break;
      case "objective": Toast(event.text); break;
      case "checkpoint": Toast("安全点"); break;
      case "spot": PlaySfx("alarm"); break;
      case "lost": PlaySfx("heartbeat"); break;
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
      SyncHud();
    }
    render.Sync(state, dt);
  } catch (error) {
    running = false;
    ShowBootError("frame", error);
    cancelAnimationFrame(rafId);
  }
}

function Resize() {
  if (!render) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  render.Resize(shell.clientWidth, shell.clientHeight, dpr);
}
window.addEventListener("resize", Resize);
window.addEventListener("orientationchange", () => setTimeout(Resize, 120));

// ─────────────────────────────────────────── 启动
function Boot() {
  try {
    render = CreateRenderer(canvas, { quality: isTouch ? "medium" : "high" });
  } catch (error) {
    ShowBootError("CreateRenderer", error);
    return;
  }
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
    Muted(on) { if (masterGain) masterGain.gain.value = on ? 0 : 0.36; },
    get error() { return window.__tunnelBellError || null; },
    get ready() { return !bootFailed && !!state && !!render; },
  };
}

Boot();
