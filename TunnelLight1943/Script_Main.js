// 《地道里的光》 —— 主循环：横版输入（键盘 + 移动端触屏）、
// 镜头语法（硬切 / 慢推 / 横移 / 过肩正反打 / 插入特写）、HUD。
import {
  GAME_VERSION, CHAPTERS, SURFACE_Y, UNDER_Y, CreateGame, StepGame,
  CurrentBeatDef, MakeChoice, GetObjective, GetHint, SplitPrompt,
  ChapterBeatList, DebugJump, SkipPrologue,
} from "./Script_Core.mjs";
import { CreateWorld } from "./Script_World.js";
import { CreateSoundtrack } from "./Script_Soundtrack.js?v=029";
import { AUDIO_DEFAULT_LEVELS } from "./Data_AudioMix.mjs?v=029";

const canvas = document.getElementById("gameCanvas");
const world = CreateWorld(canvas);
// 声音是增强项，不是依赖：合成器加载失败（旧浏览器、被拦的 WebAudio、
// 资源没部署上去）时游戏必须照常能玩，所以走动态 import + 静音替身。
const SILENT = {
  Unlock() {}, SetEnabled() {}, IsEnabled: () => false, SetMasterVolume() {},
  SetMusicVolume() {}, SetSfxVolume() {}, SetVoiceVolume() {},
  SetMood() {}, SetBgm() {}, StopBgm() {}, GetBgmState: () => null, Sfx() {}, Duck() {}, StopVoice() {}, Update() {}, Dispose() {},
  LoadSfxPack() {}, SfxPackSize: () => 0,
  PlayVoice: () => Promise.resolve(),
};
let audio = SILENT;
const soundtrack = CreateSoundtrack({
  // 转发到当前的 audio 实例：合成器是异步到位的，这层壳让上面的代码不必等
  Unlock: (...a) => audio.Unlock(...a),
  SetEnabled: (...a) => audio.SetEnabled(...a),
  IsEnabled: () => audio.IsEnabled(),
  SetMood: (...a) => audio.SetMood(...a),
  SetBgm: (...a) => audio.SetBgm(...a),
  StopBgm: () => audio.StopBgm(),
  SetMusicVolume: (...a) => audio.SetMusicVolume(...a),
  SetSfxVolume: (...a) => audio.SetSfxVolume(...a),
  SetVoiceVolume: (...a) => audio.SetVoiceVolume(...a),
  Sfx: (...a) => audio.Sfx(...a),
  LoadSfxPack: (...a) => audio.LoadSfxPack(...a),
  SfxPackSize: () => audio.SfxPackSize(),
  Duck: (...a) => audio.Duck(...a),
  PlayVoice: (...a) => audio.PlayVoice(...a),
  StopVoice: () => audio.StopVoice(),
  Update: (...a) => audio.Update(...a),
});
import("./Script_Audio.js?v=029")
  .then((m) => {
    audio = m.CreateAudio();
    audio.SetEnabled(soundOn);
    ApplyVolumes();          // 合成器是后到的，音量得在它到位之后再喂一次
    soundtrack.LoadSfxPack();  // 采样音效包也一样：这会儿才有 AudioContext 可解码
    soundtrack.SyncDurations();
  })
  .catch((e) => { console.warn("声音模块未加载，按静音运行", e); });

// 声音默认开着：旁白是这一版叙事的主体，关掉就少了一半。真正的"别吵到人"
// 由浏览器兜底——AudioContext 在第一次手势之前一直是挂起的，静静躺着不出声，
// 玩家点"从第一章开始"那一下才真正启动。不想听的按 M 或右上角关掉，记在本地。
const SOUND_KEY = "tunnelLight1943.sound";
// 三路音量各自记住。默认配乐低一些——它只是底噪，不该压住旁白。
const VOL_KEY = "tunnelLight1943.vol";
const DEFAULT_VOL = { ...AUDIO_DEFAULT_LEVELS };
let vol = { ...DEFAULT_VOL };
try {
  const saved = JSON.parse(localStorage.getItem(VOL_KEY) || "null");
  if (saved && typeof saved === "object") vol = { ...vol, ...saved };
} catch (ignored) { /* 存的东西坏了就用默认值 */ }

function ApplyVolumes() {
  audio.SetVoiceVolume(vol.voice / 100);
  audio.SetSfxVolume(vol.sfx / 100);
  audio.SetMusicVolume(vol.music / 100);
}
let soundOn = localStorage.getItem(SOUND_KEY) !== "off";
audio.SetEnabled(soundOn);

// iOS/Chrome 都要求音频在真实手势里启动，任何一次输入都拿来解锁
function UnlockAudio() {
  audio.Unlock();
}
for (const evt of ["pointerdown", "keydown", "touchstart"]) {
  window.addEventListener(evt, UnlockAudio, { passive: true });
}

const ui = {};
for (const id of [
  "titleScreen", "startButton", "chapterList",
  "objectiveText", "hintText", "prompt", "toast", "crouchTag", "itemTag", "itemName",
  "cineBars", "caption", "capSpeaker", "capText", "captionScrim",
  "detectionVignette", "fadeOverlay", "irisOverlay", "slitMatte",
  "chapterCard", "cardNum", "cardTitle", "cardYear", "cardContinue",
  "choiceOverlay", "choicePrompt", "choiceList",
  "endScreen", "endRestart", "touchControls", "rotateHint", "btnSound",
  "btnSettings", "settingsPanel", "volVoice", "volSfx", "volMusic",
  "volVoiceOut", "volSfxOut", "volMusicOut",
  "btnDebug", "debugPanel", "debugChapters", "debugBeats", "debugNow", "debugClose",
  "stick", "stickBase", "stickKnob", "btnThrow", "scribeGuide", "btnSkipCine",
  "actPrompt", "itemThrow", "pipFrame", "pipView",
]) ui[id] = document.getElementById(id);

const params = new URLSearchParams(location.search);
const fastCinematic = params.get("fast") === "1";

// ---------------------------------------------------------------------------
// 进度
// ---------------------------------------------------------------------------
const STORE_KEY = "TunnelLight1943.unlocked";
function GetUnlocked() {
  const v = parseInt(localStorage.getItem(STORE_KEY) || "0", 10);
  return Number.isFinite(v) ? Math.max(0, Math.min(CHAPTERS.length - 1, v)) : 0;
}
function Unlock(index) {
  if (index > GetUnlocked()) localStorage.setItem(STORE_KEY, String(index));
}

// ---------------------------------------------------------------------------
// 输入：键盘 + 触屏
// ---------------------------------------------------------------------------
const keys = new Set();
const touch = { act: false };
// 提示上那枚按钮画成什么，取决于玩家此刻用的是什么。混合设备（带触屏的笔记本）
// 也认：谁最后动过谁说了算——玩家刚用手指点完，提示不该还在教他按 E。
let inputMode = (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window)
  ? "touch" : "key";
// 摇杆状态：moveX/climb 是给玩法层的数字量（Core 只取符号），nx/ny 供旋钮显示
const stick = { active: false, id: null, moveX: 0, climb: 0, cx: 0, cy: 0, r: 60 };
let interactEdge = false, advanceEdge = false, crouchToggle = false, throwEdge = false;

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  inputMode = "key";
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === "e") { interactEdge = true; advanceEdge = true; }
  if (k === "f") { throwEdge = true; advanceEdge = true; }   // F 专职投掷（手里有石子才有用）
  if (k === " " || k === "enter") { advanceEdge = true; e.preventDefault(); }
  if (k === "c" || k === "control") crouchToggle = !crouchToggle;
  if (k === "`" || k === "f2" || k === "～" || k === "·") { ToggleDebug(); e.preventDefault(); return; }
  if (k === "1" || k === "2") {
    const def = state && CurrentBeatDef(state);
    if (def?.kind === "choice") { MakeChoice(state, def.options[k === "1" ? 0 : 1].key); HideChoice(); }
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "m") ToggleSound(); });
// 划线那一拍：手指（或鼠标）直接在画面上把石笔拖过去。位移驱动——
// 拖多少走多少，手上才有蹭着木头走的实感。整整一道线约等于拖过 45% 画宽。
const scribeDrag = { active: false, id: null, lastX: 0, accum: 0 };
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch" || e.pointerType === "pen") inputMode = "touch";
  advanceEdge = true;
  if (state && CurrentBeatDef(state)?.kind === "scribe") {
    scribeDrag.active = true;
    scribeDrag.id = e.pointerId;
    scribeDrag.lastX = e.clientX;
    try { canvas.setPointerCapture?.(e.pointerId); } catch (ignored) { /* 同上 */ }
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!scribeDrag.active || e.pointerId !== scribeDrag.id) return;
  const span = Math.max(120, canvas.clientWidth * 0.45);
  scribeDrag.accum += (e.clientX - scribeDrag.lastX) / span;
  scribeDrag.lastX = e.clientX;
});
for (const evt of ["pointerup", "pointercancel", "pointerleave"]) {
  canvas.addEventListener(evt, (e) => {
    if (e.pointerId === scribeDrag.id) { scribeDrag.active = false; scribeDrag.id = null; }
  });
}

// iOS Safari 会忽略 user-scalable=no：双击与捏合都得在 JS 里挡掉，
// 否则画面会被缩放，横版布局直接错位。
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 320) e.preventDefault();   // 双击缩放
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1) e.preventDefault();       // 双指捏合
}, { passive: false });
for (const evt of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });

// 触屏按钮：按下即持续，抬起清除
function BindTouchButton(el, prop, { edge = false } = {}) {
  if (!el) return;
  const on = (e) => {
    e.preventDefault();
    inputMode = "touch";
    if (edge) {
      if (prop === "act") { interactEdge = true; advanceEdge = true; touch.act = true; }
      else if (prop === "crouch") crouchToggle = !crouchToggle;
      else if (prop === "throw") throwEdge = true;
    } else touch[prop] = true;
    el.classList.add("pressed");
  };
  const off = (e) => {
    e.preventDefault();
    if (!edge) touch[prop] = false;
    if (prop === "act") touch.act = false;
    el.classList.remove("pressed");
  };
  el.addEventListener("pointerdown", on);
  el.addEventListener("pointerup", off);
  el.addEventListener("pointercancel", off);
  el.addEventListener("pointerleave", off);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

// 摇杆。一根拇指同时管走路和上下梯：横推走，竖推爬。
// 竖直分量要明显压过水平分量才判成爬梯——走路时手指难免上下漂，
// 不设这道坎的话，路过梯口就会被莫名其妙送上去。
const STICK_DEAD = 0.30;      // 死区：拇指搭着不动不该走起来
const STICK_CLIMB = 0.55;     // 竖推到这个深度才考虑爬梯
function StickGeometry() {
  const base = ui.stickBase?.getBoundingClientRect();
  if (!base || !base.width) return false;
  stick.cx = base.left + base.width / 2;
  stick.cy = base.top + base.height / 2;
  stick.r = base.width / 2;
  return true;
}
function StickApply(clientX, clientY) {
  const dx = (clientX - stick.cx) / stick.r;
  const dy = (clientY - stick.cy) / stick.r;
  const len = Math.hypot(dx, dy);
  const k = len > 1 ? 1 / len : 1;
  const nx = dx * k, ny = dy * k;
  stick.moveX = Math.abs(nx) > STICK_DEAD ? Math.sign(nx) : 0;
  stick.climb = (Math.abs(ny) > STICK_CLIMB && Math.abs(ny) > Math.abs(nx) * 1.25) ? Math.sign(ny) : 0;
  if (ui.stickKnob) {
    ui.stickKnob.style.transform = `translate(${(nx * stick.r * 0.6).toFixed(1)}px, ${(ny * stick.r * 0.6).toFixed(1)}px)`;
  }
  ui.stick?.classList.toggle("climbing", stick.climb !== 0);
}
function StickReset() {
  stick.active = false;
  stick.id = null;
  stick.moveX = 0;
  stick.climb = 0;
  if (ui.stickKnob) ui.stickKnob.style.transform = "translate(0px, 0px)";
  ui.stick?.classList.remove("active", "climbing");
}
function SetupStick() {
  const el = ui.stick;
  if (!el) return;
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    inputMode = "touch";
    if (!StickGeometry()) return;
    stick.active = true;
    stick.id = e.pointerId;
    el.classList.add("active");
    // 捕获是锦上添花：拇指滑出盘子还能继续操。指针已经抬起或是合成事件时
    // 它会抛，不接住的话整个 handler 断在这儿，摇杆就成了死的。
    try { el.setPointerCapture?.(e.pointerId); } catch (ignored) { /* 捕获不到就算了 */ }
    StickApply(e.clientX, e.clientY);
  });
  el.addEventListener("pointermove", (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    e.preventDefault();
    StickApply(e.clientX, e.clientY);
  });
  for (const evt of ["pointerup", "pointercancel", "pointerleave"]) {
    el.addEventListener(evt, (e) => {
      if (e.pointerId !== stick.id) return;
      e.preventDefault();
      StickReset();
    });
  }
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

function SetupTouch() {
  if (!ui.touchControls) return;
  SetupStick();
  BindTouchButton(document.getElementById("btnAct"), "act", { edge: true });
  BindTouchButton(document.getElementById("btnCrouch"), "crouch", { edge: true });
  BindTouchButton(document.getElementById("btnThrow"), "throw", { edge: true });
  const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (isTouch) document.body.classList.add("touchDevice");
}

function CheckOrientation() {
  const isTouch = document.body.classList.contains("touchDevice");
  const portrait = window.innerHeight > window.innerWidth;
  if (ui.rotateHint) ui.rotateHint.hidden = !(isTouch && portrait);
}

function ReadInput() {
  let moveX = 0, climb = 0;
  if (keys.has("a") || keys.has("arrowleft")) moveX -= 1;
  if (keys.has("d") || keys.has("arrowright")) moveX += 1;
  if (keys.has("w") || keys.has("arrowup")) climb -= 1;
  if (keys.has("s") || keys.has("arrowdown")) climb += 1;
  if (stick.active) { moveX += stick.moveX; climb += stick.climb; }
  return {
    moveX: Math.max(-1, Math.min(1, moveX)),
    climb: Math.max(-1, Math.min(1, climb)),
  };
}

// ---------------------------------------------------------------------------
// 镜头语法
//   基线：中距离横向跟随
//   过场：构图变了才硬切；同构图连续行不重切、推进累计（一个镜头屏住呼吸）
//   语汇：wide 全景 / shot 定点 / close 特写 / ots 过肩正反打 / insert 插入特写 / dark 黑场
// ---------------------------------------------------------------------------
const cam = { x: 60, y: 2.0, hw: 7.2 };
let camSnap = true;
let framing = { key: "", prog: 0, baseHw: 7.2 };

function ActorAt(state, id) {
  if (id === "player") return { x: state.player.x, level: state.player.level, heading: state.player.heading };
  const a = state.actors.find((x) => x.id === id && x.visible !== false);
  return a ? { x: a.x, level: a.level || "surface", heading: a.heading } : null;
}

function LevelY(level) { return level === "under" ? UNDER_Y : SURFACE_Y; }

function BaseShot(state) {
  const ch = CHAPTERS[state.chapterIndex];
  const p = state.player;
  const lookAhead = (p.heading || 1) * 2.0;
  // 景别整体推近一档（勇敢的心式：人物更大、更贴戏）——画面外的后果
  // 由角落的照片小窗兜着，不用为了"都看见"把镜头拉远
  if (ch.scene === "tunnelVillage") return { x: p.x + lookAhead, y: -1.15, hw: 8.0 };
  if (ch.scene === "tunnelFort") return { x: p.x + lookAhead, y: UNDER_Y + 1.15, hw: 6.0 };
  // 地表：中近景，人物约占画高三分之一强；视平线略高于人头，地面向后退
  const y = LevelY(p.level) + (p.level === "under" ? 1.25 : 1.85);
  return { x: p.x + lookAhead, y, hw: ch.light === "night" ? 6.15 : 6.3 };
}

function HintShot(state, hint) {
  switch (hint.kind) {
    case "wide":
      return { x: hint.x, y: hint.y ?? 2.4, hw: hint.hw ?? 26, pan: hint.pan || 0 };
    case "shot":
      return { x: hint.x, y: hint.y ?? 1.6, hw: hint.dist ?? 8, pan: hint.pan || 0 };
    case "insert":
      return { x: hint.x, y: hint.y ?? 1.4, hw: hint.dist ?? 2.4, pan: hint.pan || 0 };
    case "insertCard":
      // 专画的一张细节插画铺满画框；机位停在原地不动
      return { ...BaseShot(state), card: hint.card };
    case "close": {
      const t = ActorAt(state, hint.on || "player") || { x: state.player.x, level: state.player.level };
      return { x: t.x + (hint.dx || 0), y: LevelY(t.level) + 1.25, hw: hint.dist ?? 4.2 };
    }
    case "ots": {
      // 过肩：主体在画面偏一侧，被越过的肩膀作为前景剪影
      const subj = ActorAt(state, hint.subject);
      const other = ActorAt(state, hint.other);
      if (!subj) return BaseShot(state);
      const side = hint.side || (other && other.x > subj.x ? 1 : -1);
      return {
        x: subj.x + side * 0.9,
        y: LevelY(subj.level) + 1.25,
        hw: hint.dist ?? 3.6,
        ots: { id: hint.other, side, facing: -side },
      };
    }
    case "dark":
      return { ...BaseShot(state), fade: 0.94 };
    default:
      return BaseShot(state);
  }
}

function UpdateCamera(state, dt) {
  const inCinematic = state.phase === "playing"
    && (CurrentBeatDef(state)?.kind === "cinematic" || !!state.microCine);

  let shot;
  if (inCinematic) {
    const hint = state.camHint || { kind: "follow" };
    shot = HintShot(state, hint);
    // 构图指纹：位置/高度/景别有实质变化才算换镜头
    const fp = `${Math.round(shot.x * 2)}|${Math.round(shot.y * 3)}|${Math.round(shot.hw * 3)}|${shot.ots ? shot.ots.id + shot.ots.side : ""}`;
    if (fp !== framing.key) {
      const first = framing.key === "";
      framing = { key: fp, prog: 0, baseHw: shot.hw };
      camSnap = true;                       // 硬切
      // 转场语汇：硬切 / 黑场闪断 / 圆形收光——按行上标注的 trans 走
      const trans = (state.camHint && state.camHint.trans) || (first ? "iris" : "cut");
      if (trans === "dip") dipLevel = 1;
      else if (trans === "iris") irisClosing = true;
    }
    // 行内慢推/横移：按本行时长归一化，一行之内正好走完 pan，肉眼才看得见
    const lineD = Math.max(1.2, state.camLineD || 3.4);
    framing.prog = Math.min(1, framing.prog + dt / lineD);
    shot = {
      ...shot,
      x: shot.x + (shot.pan || 0) * framing.prog,
      hw: framing.baseHw * (1 - 0.10 * framing.prog),
    };
    world.SetOverShoulder(state, shot.ots || null);
    world.SetInsertCard(shot.card || null);
  } else {
    // 玩法段一般是跟随。但个别节拍自己指定了构图——划线要推到门框上，
    // 全景里那道线只是一个像素在动。这里不硬切，让常规的跟随插值把镜头推过去。
    const def = state.phase === "playing" ? CurrentBeatDef(state) : null;
    shot = def?.cam ? HintShot(state, def.cam) : BaseShot(state);
    if (framing.key !== "") { framing = { key: "", prog: 0, baseHw: shot.hw }; camSnap = true; } // 交给 iris 遮
    world.SetOverShoulder(state, null);
    world.SetInsertCard(null);
  }

  if (camSnap) {
    cam.x = shot.x; cam.y = shot.y; cam.hw = shot.hw;
    camSnap = false;
  } else {
    const k = Math.min(1, dt * (inCinematic ? 2.4 : 5.2));
    cam.x += (shot.x - cam.x) * k;
    cam.y += (shot.y - cam.y) * k;
    cam.hw += (shot.hw - cam.hw) * k;
  }
  const view = world.ApplyCamera(cam.x, cam.y, cam.hw);
  world.UpdateAtmosphere(state, view.viewW, view.viewH, cam.x, cam.y, view.dist);
  return shot.fade || 0;
}

// ---------------------------------------------------------------------------
// iris 圆形收光（默片式转场）
// ---------------------------------------------------------------------------
let irisLevel = 1;
let irisClosing = false;
let lastBeatKind = null;
let dipLevel = 0;   // 黑场闪断：切到新构图时短促地压一下黑

function StepIris(state, dt) {
  const def = state.phase === "playing" ? CurrentBeatDef(state) : null;
  const kind = state.phase !== "playing" ? state.phase : (def?.kind === "cinematic" ? "cine" : "play");
  if (kind !== lastBeatKind) {
    if (lastBeatKind !== null && (kind === "cine" || lastBeatKind === "cine")) irisClosing = true;
    lastBeatKind = kind;
  }
  if (irisClosing) {
    irisLevel -= dt * 5.5;
    if (irisLevel <= 0) { irisLevel = 0; irisClosing = false; }
  } else {
    irisLevel = Math.min(1, irisLevel + dt * 2.4);
  }
  const r = Math.round(irisLevel * 78);
  // iris 收在情感物件上：剧本标了 irisFocus（世界坐标）就把圆心投到它身上——
  // 第一章末尾那道刻痕，落黑的最后一眼必须是它
  let cx = 50, cy = 50;
  if (state?.irisFocus) {
    const vs = world.viewSize;
    if (vs?.w) {
      cx = Math.max(8, Math.min(92, 50 + ((state.irisFocus.x - cam.x) / vs.w) * 100));
      cy = Math.max(8, Math.min(92, 50 - ((SURFACE_Y + state.irisFocus.y - cam.y) / vs.h) * 100));
    }
  }
  ui.irisOverlay.style.background =
    `radial-gradient(circle at ${cx.toFixed(1)}% ${cy.toFixed(1)}%, transparent ${r}%, #060402 ${Math.min(100, r + 5)}%)`;
  ui.irisOverlay.style.opacity = irisLevel >= 1 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
let toastShown = null;
let choiceBuilt = false;
let fadeLevel = 1;
let lastObjective = undefined;
let objectiveT = 0;

function HideChoice() {
  ui.choiceOverlay.hidden = true;
  choiceBuilt = false;
}

// ---------------------------------------------------------------------------
// 交互徽章（勇敢的心式）
//
// 提示里不写键名——写了在手机上就是句废话。Core 只给动词，键位藏在 `E ·`
// 前缀里（见 Core.SplitPrompt），这里按当前输入设备把它翻成一枚看得懂的按钮：
// 键盘玩家看到键帽，手指玩家看到的就是右下角那几个钮的同一套线描图形。
// 徽章浮在柱子头顶上，而不是钉在屏幕底边——按哪个键、对着什么按，一眼都在。
// ---------------------------------------------------------------------------
const KEY_GLYPH = { interact: "E", throw: "F", crouch: "C", up: "W", down: "S" };
// 触屏图形与 index.html 里那三个钮逐笔一致，玩家不用在两套语汇之间翻译；
// 爬梯的上下是摇杆——画成盘子里的一支箭
const TOUCH_GLYPH = {
  interact: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 12.2V7.4M11.4 11.6V6.2M14.6 12.2V7.4"/>'
    + '<path d="M8.2 12.2v1.5c0 3 1.8 5 4.3 5s4.3-2 4.3-5V9.6"/><path d="M8.2 13.4l-2.4-2.2"/></svg>',
  throw: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="solid" cx="5.2" cy="16.4" r="1.5"/>'
    + '<path d="M6.8 14.6C9.4 8.6 14 6.4 19 8.8"/><path d="M19 8.8l-3.2-.2M19 8.8l-1-3"/></svg>',
  crouch: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6.6" r="2.2"/>'
    + '<path d="M10.6 8.9c2.6 1 4.1 2.6 4.3 5.2l-3.5 3.3.4 3.2"/><path d="M12.4 11.6l-3.4 2.6 1 3.4"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.6"/>'
    + '<path d="M12 15.8V8.6M12 8.6l-3 3M12 8.6l3 3"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.6"/>'
    + '<path d="M12 8.2v7.2M12 15.4l-3-3M12 15.4l3-3"/></svg>',
};

function KeyChipHtml(act) {
  if (!act) return "";
  return inputMode === "touch" ? (TOUCH_GLYPH[act] || "") : (KEY_GLYPH[act] || "");
}

let itemTagShown = "";             // 手里那格的指纹（物件 + 当前输入设备）
let actShown = "";                 // 换了文案/设备才重排 DOM

// ---------------------------------------------------------------------------
// 后果小窗（勇敢的心式画中画）：Core 立 state.pip = {who, hw, t}，这里管三件事——
// 相框 DOM 的显隐、把相框内窗的位置量给渲染层（world.RenderPip 往那块剪裁区里
// 再画一遍世界）、以及跟着目标演员每帧刷新第二台相机的取景。
// ---------------------------------------------------------------------------
let pipRect = null;

function SyncPip(state, inCinematic) {
  const el = ui.pipFrame;
  if (!el) return;
  const spec = state.phase === "playing" && !inCinematic ? state.pip : null;
  let shot = null;
  if (spec) {
    const a = spec.who === "player"
      ? { x: state.player.x, level: state.player.level, visible: true }
      : state.actors.find((x) => x.id === spec.who);
    if (a && a.visible !== false) {
      shot = {
        x: a.x + (spec.dx || 0),
        y: (a.level === "under" ? UNDER_Y : SURFACE_Y) + (spec.y ?? 1.1),
        hw: spec.hw ?? 3.5,
      };
    }
  }
  if (!shot) {
    if (!el.hidden) { el.hidden = true; el.classList.remove("show"); }
    pipRect = null;
    world.SetPip(null);
    return;
  }
  if (el.hidden) {
    el.hidden = false;
    // 重新触发出场动画（快门白闪 + 落下来）
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }
  world.SetPip(shot);
  // 内窗在画布上的位置：每帧量一次——出场动画在动、窗口在变尺寸，都跟得上
  const view = ui.pipView.getBoundingClientRect();
  const cRect = canvas.getBoundingClientRect();
  pipRect = {
    x: Math.round(view.left - cRect.left), y: Math.round(view.top - cRect.top),
    w: Math.round(view.width), h: Math.round(view.height),
  };
}
let actBox = { w: 96, h: 58 };     // 量过的整块尺寸：每帧读 offsetWidth 会同步刷布局

function SyncActPrompt(state, pr, fill) {
  const el = ui.actPrompt;
  if (!el) return;
  if (!pr) { el.hidden = true; actShown = ""; return; }
  const fp = `${inputMode}|${pr.act}|${pr.text}`;
  if (fp !== actShown) {
    actShown = fp;
    el.hidden = false;
    el.querySelector(".pKey").innerHTML = KeyChipHtml(pr.act);
    el.querySelector(".pVerb").textContent = pr.text;
    actBox = { w: el.offsetWidth || actBox.w, h: el.offsetHeight || actBox.h };
  }
  el.hidden = false;
  el.classList.toggle("hold", !!pr.hold);
  el.style.setProperty("--fill", (fill * 100).toFixed(1));

  // 落点：柱子头顶。世界→屏幕换算与 iris 收光同一套（cam + world.viewSize），
  // 位置一律取整像素落位——半个像素上的字就是"HUD 有点糊"的老根。
  const vs = world.viewSize;
  const cw = canvas.clientWidth, chh = canvas.clientHeight;
  if (!vs?.w || !cw || !chh) { el.style.left = "50%"; el.style.top = "70%"; return; }
  const p = state.player;
  const headY = LevelY(p.level) + (p.crouch ? 1.55 : 2.15);
  const sx = cw * (0.5 + (p.x - cam.x) / vs.w);
  const sy = chh * (0.5 - (headY - cam.y) / vs.h);
  el.style.left = Math.round(Math.max(10, Math.min(cw - actBox.w - 10, sx - actBox.w / 2))) + "px";
  el.style.top = Math.round(Math.max(10, Math.min(chh - actBox.h - 10, sy - actBox.h - 6))) + "px";
}

function SyncHud(state, dt, shotFade) {
  const def = state.phase === "playing" ? CurrentBeatDef(state) : null;
  const inCinematic = def?.kind === "cinematic" || !!state.microCine;

  ui.cineBars.classList.toggle("active", !!inCinematic);
  // noSub：有声无字（日军的日语原声不配字幕——听不懂本身就是设计）
  const hasCaption = !!(state.caption && inCinematic
    && (state.caption.say || state.caption.stage) && !state.caption.noSub);
  if (ui.captionScrim) ui.captionScrim.classList.toggle("active", hasCaption);
  // 地窖板缝 matte：第一章父亲被抓那场
  const slit = inCinematic && state.camHint?.slit;
  if (ui.slitMatte) ui.slitMatte.classList.toggle("active", !!slit);

  // 序章可跳过：只在 c1_prologue 这一段亮出跳过键
  if (ui.btnSkipCine) ui.btnSkipCine.hidden = !(def?.prologue && state.phase === "playing");

  if (hasCaption) {
    ui.caption.hidden = false;
    if (state.caption.who) {
      ui.capSpeaker.textContent = state.caption.who;
      ui.capSpeaker.hidden = false;
      ui.capText.textContent = "「" + state.caption.say + "」";
      ui.capText.classList.remove("stage");
    } else {
      ui.capSpeaker.hidden = true;
      ui.capText.textContent = state.caption.stage;
      ui.capText.classList.add("stage");
    }
  } else {
    ui.caption.hidden = true;
  }

  // 目标：只在变化时露一小会儿（勇敢的心式克制 HUD），之后画面自己说话
  const objective = GetObjective(state);
  if (objective !== lastObjective) {
    lastObjective = objective;
    objectiveT = objective ? 6.5 : 0;
    ui.objectiveText.textContent = objective || "";
    ui.hintText.textContent = (objective && GetHint(state)) || "";
  }
  if (objectiveT > 0) objectiveT -= dt;
  const objVisible = objectiveT > 0 && !inCinematic;
  ui.objectiveText.parentElement.style.opacity = objVisible ? 1 : 0;

  // 节拍自己的提示优先；没有的时候，把"这儿能上下"这件事说出来。
  // 带按键的走头顶那枚徽章，没按键的状态行（"跟上娘""！探杆就在头顶"）
  // 仍旧躺在底边——两种东西，两个位置，别混在一条 pill 里。
  // 章节卡/终局那几拍 StepGame 提前 return，state.prompt 是上一幕留下的死值——
  // 徽章现在浮在画面中间，赖着不走就直接盖在章节卡上了
  const raw = state.phase === "playing" ? (state.prompt || state.climbHint || "") : "";
  const pr = (!raw || inCinematic) ? null : SplitPrompt(raw);
  const status = pr && !pr.act ? pr : null;
  const fill = Math.max(0, Math.min(1, state.promptFill || 0));
  SyncActPrompt(state, pr && pr.act ? pr : null, fill);

  ui.prompt.textContent = status ? status.text : "";
  ui.prompt.hidden = !status;
  ui.prompt.classList.toggle("danger", !!status && status.text.startsWith("！"));
  // 进度条用 CSS 画：拿字形拼方块会因为字体缺字变成豆腐块
  ui.prompt.style.setProperty("--fill", (fill * 100).toFixed(1) + "%");
  ui.prompt.classList.toggle("metered", !!status && fill > 0);

  SyncPip(state, inCinematic);

  ui.crouchTag.hidden = true;
  // 手里那格：单格物品栏。拿着石子时顺带把 F 键提示挂上
  const item = state.player?.item;
  const showItem = !!item && !inCinematic && state.phase === "playing";
  if (ui.itemTag) {
    ui.itemTag.hidden = !showItem;
    // 能扔的东西后面挂一枚小徽章，不写"（F 投掷）"——那三个字在手机上没有对应物
    const tagFp = item ? `${inputMode}|${item.label}|${item.throwable ? 1 : 0}` : "";
    if (ui.itemName && tagFp !== itemTagShown) {
      itemTagShown = tagFp;
      ui.itemName.textContent = item ? item.label : "";
      if (ui.itemThrow) {
        ui.itemThrow.hidden = !item?.throwable;
        ui.itemThrow.innerHTML = item?.throwable ? KeyChipHtml("throw") : "";
      }
    }
  }
  // 触屏的投掷键：手里真有能扔的东西才冒出来
  if (ui.btnThrow) ui.btnThrow.hidden = !(showItem && item.throwable);

  // 划线的 QTE 轨道：石笔头跟着进度走，没动起来时轻轻晃一下招呼玩家来拖
  if (ui.scribeGuide) {
    const sc = state.scribe;
    ui.scribeGuide.hidden = !sc;
    if (sc) {
      ui.scribeGuide.style.setProperty("--fill", (sc.t * 100).toFixed(1) + "%");
      ui.scribeGuide.classList.toggle("idle", !!sc.idle);
    }
  }
  if (ui.touchControls) {
    ui.touchControls.classList.toggle("dimmed", !!inCinematic || state.phase !== "playing");
  }

  if (state.toast !== toastShown) {
    toastShown = state.toast;
    if (state.toast) {
      ui.toast.textContent = state.toast.text;
      ui.toast.classList.add("show");
    } else ui.toast.classList.remove("show");
  }

  ui.detectionVignette.style.opacity = (state.stealthActive && state.detection.level > 0.03 && !inCinematic)
    ? Math.min(0.85, state.detection.level) : 0;

  if (state.phase === "chapterCard" || state.phase === "chapterEnd") {
    const showNext = state.phase === "chapterEnd";
    const ch = CHAPTERS[state.chapterIndex + (showNext ? 1 : 0)];
    ui.chapterCard.hidden = false;
    ui.cardNum.textContent = showNext ? "下一章 · " + ch.num : ch.num;
    ui.cardTitle.textContent = ch.title;
    ui.cardYear.textContent = ch.year;
    ui.cardContinue.textContent = "点击继续";
    Unlock(state.chapterIndex + (showNext ? 1 : 0));
  } else ui.chapterCard.hidden = true;

  if (def?.kind === "choice") {
    if (!choiceBuilt) {
      choiceBuilt = true;
      ui.choicePrompt.textContent = def.prompt;
      ui.choiceList.innerHTML = "";
      const OPTION_ICON = { ground: "./Icon/Icon_ChoiceGround.png", tunnel: "./Icon/Icon_ChoiceTunnel.png" };
      def.options.forEach((opt, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        const icon = OPTION_ICON[opt.key];
        btn.innerHTML = (icon ? `<img class="choiceIcon" src="${icon}" alt="">` : "")
          + `<b>${i + 1} · ${opt.label}</b><span>${opt.detail}</span>`;
        btn.addEventListener("click", () => { MakeChoice(state, opt.key); HideChoice(); });
        ui.choiceList.appendChild(btn);
      });
      ui.choiceOverlay.hidden = false;
    }
  } else if (choiceBuilt) HideChoice();

  ui.endScreen.hidden = state.phase !== "gameEnd";

  if (dipLevel > 0) dipLevel = Math.max(0, dipLevel - dt * 3.2);
  const targetFade = state.phase === "gameEnd" ? 0.75 : shotFade;
  fadeLevel += (targetFade - fadeLevel) * Math.min(1, dt * 2.4);
  ui.fadeOverlay.style.opacity = Math.max(fadeLevel, dipLevel).toFixed(3);
}

// ---------------------------------------------------------------------------
// 标题
// ---------------------------------------------------------------------------
function BuildTitle() {
  const unlocked = GetUnlocked();
  ui.chapterList.innerHTML = "";
  CHAPTERS.forEach((ch, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.disabled = i > unlocked;
    btn.innerHTML = `<small>${ch.num}</small><b>${i <= unlocked ? ch.title : "？？？"}</b>`;
    btn.addEventListener("click", () => StartGame(i));
    ui.chapterList.appendChild(btn);
  });
}

// ---------------------------------------------------------------------------
// 调试面板：跳到任意一章的任意一幕
//
// 白盒期最贵的成本是"为了看第五章的一个镜头，把前四章重打一遍"。这个面板把
// 每一章拆成分幕清单，点哪一幕就落到哪一幕，前序按脚本结算（见 Core.DebugJump）。
// 开关：左下角 DEBUG 按钮 / ` / F2。
// ---------------------------------------------------------------------------
let debugChapter = 0;

function EscapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function BuildDebugChapters() {
  if (!ui.debugChapters) return;
  ui.debugChapters.innerHTML = "";
  CHAPTERS.forEach((ch, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${i + 1} · ${ch.title}`;
    btn.title = `${ch.num}　${ch.year}`;
    btn.setAttribute("aria-selected", i === debugChapter ? "true" : "false");
    btn.addEventListener("click", () => { debugChapter = i; BuildDebugChapters(); BuildDebugBeats(); });
    ui.debugChapters.appendChild(btn);
  });
}

function BuildDebugBeats() {
  if (!ui.debugBeats) return;
  const beats = ChapterBeatList(debugChapter);
  const atChapter = state && state.chapterIndex === debugChapter;
  ui.debugBeats.innerHTML = "";
  beats.forEach((b) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    if (atChapter && state.beatIndex === b.index) btn.classList.add("current");
    btn.innerHTML = `<i>${String(b.index + 1).padStart(2, "0")}</i>`
      + `<span><em>${EscapeHtml(b.label)}</em><small>${EscapeHtml(b.kind)} · ${EscapeHtml(b.id)}</small></span>`;
    btn.addEventListener("click", () => JumpToBeat(debugChapter, b.index));
    li.appendChild(btn);
    ui.debugBeats.appendChild(li);
  });
}

function SyncDebugNow() {
  if (!ui.debugNow) return;
  if (!state) { ui.debugNow.textContent = "未开局"; return; }
  const def = CurrentBeatDef(state);
  ui.debugNow.textContent = `${CHAPTERS[state.chapterIndex].num} · ${state.beatIndex + 1} · ${def?.id || state.phase}`;
}

function JumpToBeat(chapterIndex, beatIndex) {
  if (!state) StartGame(chapterIndex);
  DebugJump(state, chapterIndex, beatIndex);
  ui.titleScreen.hidden = true;
  ui.endScreen.hidden = true;
  HideChoice();
  Unlock(chapterIndex);
  camSnap = true;
  framing = { key: "", prog: 0, baseHw: 7.2 };
  fadeLevel = 0;
  irisLevel = 0;
  irisClosing = false;
  lastBeatKind = null;
  crouchToggle = false;
  interactEdge = false;
  advanceEdge = false;
  BuildDebugBeats();
  SyncDebugNow();
}

// 面板开着的时候跟住实际进度：正常玩过一幕，清单上的高亮也跟着走
let debugSyncKey = "";
function SyncDebugPanel() {
  if (!ui.debugPanel || ui.debugPanel.hidden || !state) return;
  const key = `${state.chapterIndex}/${state.beatIndex}/${state.phase}`;
  if (key === debugSyncKey) return;
  debugSyncKey = key;
  if (state.chapterIndex !== debugChapter) {
    debugChapter = state.chapterIndex;
    BuildDebugChapters();
  }
  BuildDebugBeats();
  SyncDebugNow();
}

function ToggleDebug(force) {
  if (!ui.debugPanel) return;
  const open = force === undefined ? ui.debugPanel.hidden : force;
  ui.debugPanel.hidden = !open;
  document.body.classList.toggle("debugOpen", open);
  if (open) {
    debugChapter = state ? state.chapterIndex : 0;
    BuildDebugChapters();
    BuildDebugBeats();
    SyncDebugNow();
  }
}

// 入口在设置面板里，点开调试就把设置收起来——两张面板都压在右上角，别叠着
ui.btnDebug?.addEventListener("click", () => {
  if (ui.settingsPanel) {
    ui.settingsPanel.hidden = true;
    ui.btnSettings?.setAttribute("aria-expanded", "false");
  }
  ToggleDebug(true);
});
ui.debugClose?.addEventListener("click", () => ToggleDebug(false));

function StartGame(chapterIndex) {
  state = CreateGame(chapterIndex);
  ui.titleScreen.hidden = true;
  ui.endScreen.hidden = true;
  camSnap = true;
  framing = { key: "", prog: 0, baseHw: 7.2 };
  fadeLevel = 1;
  irisLevel = 0;
  irisClosing = false;
  lastBeatKind = null;
}

function SyncSoundButton() {
  if (!ui.btnSound) return;
  ui.btnSound.setAttribute("aria-pressed", soundOn ? "true" : "false");
  ui.btnSound.title = soundOn ? "关闭声音" : "打开声音（旁白 / 音效 / 配乐）";
  const state = ui.btnSound.querySelector(".state");
  if (state) state.textContent = soundOn ? "开" : "关";
  // 关掉时把三条音量滑轨压暗：它们这会儿不起作用
  ui.settingsPanel?.classList.toggle("muted", !soundOn);
}
function ToggleSound() {
  soundOn = !soundOn;
  localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off");
  audio.SetEnabled(soundOn);
  if (soundOn) audio.Unlock();
  soundtrack.SyncDurations();
  SyncSoundButton();
}
if (ui.btnSound) {
  ui.btnSound.addEventListener("click", ToggleSound);
  ui.btnSound.addEventListener("contextmenu", (e) => e.preventDefault());
}
SyncSoundButton();

// —— 设置面板：三路音量 ——
function SyncVolumeUi() {
  for (const [key, input, out] of [
    ["voice", ui.volVoice, ui.volVoiceOut],
    ["sfx", ui.volSfx, ui.volSfxOut],
    ["music", ui.volMusic, ui.volMusicOut],
  ]) {
    if (!input) continue;
    input.value = String(vol[key]);
    if (out) out.textContent = vol[key] + "%";
  }
}
function OnVolumeInput(key, input, out) {
  if (!input) return;
  input.addEventListener("input", () => {
    vol[key] = Math.max(0, Math.min(100, parseInt(input.value, 10) || 0));
    if (out) out.textContent = vol[key] + "%";
    localStorage.setItem(VOL_KEY, JSON.stringify(vol));
    ApplyVolumes();
    audio.Unlock();          // 拖滑块本身就是用户手势，顺手把音频解锁了
  });
}
OnVolumeInput("voice", ui.volVoice, ui.volVoiceOut);
OnVolumeInput("sfx", ui.volSfx, ui.volSfxOut);
OnVolumeInput("music", ui.volMusic, ui.volMusicOut);
SyncVolumeUi();

if (ui.btnSettings) {
  ui.btnSettings.addEventListener("click", () => {
    const open = ui.settingsPanel.hidden;
    ui.settingsPanel.hidden = !open;
    ui.btnSettings.setAttribute("aria-expanded", open ? "true" : "false");
  });
  // 点面板以外的地方就收起来
  document.addEventListener("pointerdown", (e) => {
    if (ui.settingsPanel.hidden) return;
    if (ui.settingsPanel.contains(e.target) || ui.btnSettings.contains(e.target)) return;
    ui.settingsPanel.hidden = true;
    ui.btnSettings.setAttribute("aria-expanded", "false");
  });
}

// 序章跳过：整段结算掉直接进正戏；正在念的旁白同时收声
ui.btnSkipCine?.addEventListener("click", () => {
  if (state && SkipPrologue(state)) audio.StopVoice();
});

ui.startButton.addEventListener("click", () => StartGame(0));
ui.endRestart.addEventListener("click", () => {
  soundtrack.StopBgm();
  ui.endScreen.hidden = true;
  ui.titleScreen.hidden = false;
  state = null;
  BuildTitle();
});

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------
let state = null;
let lastT = performance.now();

function Frame(now) {
  requestAnimationFrame(Frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  RunFrame(now, dt);
}

// 一帧的全部：推进玩法、搭场景、走镜头、刷 HUD。抽出来是为了让测试也能
// 驱动它——浏览器面板不显示时 rAF 整个停摆，只调 StepGame 是看不到镜头
// 和 HUD 的（它们只在这里更新），验证会变成自欺欺人。
function RunFrame(now, dt) {
  if (state) {
    const move = state.phase === "playing" ? ReadInput() : { moveX: 0, climb: 0 };
    const def = CurrentBeatDef(state);
    // ?fast=1 是给自动截图/测试用的快进。开着声音时不生效——否则过场以 5 倍速
    // 推进、旁白还在正常语速念，每句都被切在半截，看上去就像"台词没说完就切镜头"
    // 那个老毛病又回来了。快进与听旁白本来就是互斥的两件事。
    const stepDt = (fastCinematic && !soundOn && def?.kind === "cinematic") ? dt * 5 : dt;
    const prevChapter = state.chapterIndex;
    StepGame(state, {
      moveX: move.moveX, climb: move.climb,
      crouch: crouchToggle,
      interact: interactEdge,
      interactHeld: keys.has("e") || touch.act,
      throw: throwEdge,
      dragX: scribeDrag.accum,
      advance: advanceEdge,
    }, stepDt);
    scribeDrag.accum = 0;
    if (state.chapterIndex !== prevChapter) {
      camSnap = true; crouchToggle = false; irisLevel = 0; irisClosing = false;
      framing = { key: "", prog: 0, baseHw: 7.2 };
    }

    world.BuildEnvironment(state);
    world.UpdateActors(state, now / 1000, dt);
    world.UpdateProps(state, now / 1000, dt);
    const shotFade = UpdateCamera(state, dt);
    StepIris(state, dt);
    SyncHud(state, dt, shotFade);
    soundtrack.Step(state, dt);
    SyncDebugPanel();
  }
  world.Render();
  world.RenderPip(pipRect);   // 后果小窗：主画面之后补一遍角落的剪裁区
  interactEdge = false;
  advanceEdge = false;
  throwEdge = false;
}

function Resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  world.Resize(w, h);
  CheckOrientation();
}
window.addEventListener("resize", Resize);
window.addEventListener("orientationchange", () => setTimeout(Resize, 200));
SetupTouch();
Resize();
BuildTitle();

const chapterParam = parseInt(params.get("chapter") || "0", 10);
const beatParam = parseInt(params.get("beat") || "0", 10);
if (chapterParam >= 1 && chapterParam <= CHAPTERS.length) {
  StartGame(chapterParam - 1);
  // ?beat=N 直接落到第 N 幕（1 起算），配合调试面板用
  if (beatParam >= 1) JumpToBeat(chapterParam - 1, beatParam - 1);
}
if (params.get("debug") === "1") ToggleDebug(true);

requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(Frame); });

// 测试挂钩
window.TunnelLight = {
  version: GAME_VERSION,
  world,
  get state() { return state; },
  StartGame,
  JumpToChapter: (i) => StartGame(i),
  // 走一遍真实输入路径（键盘 + 摇杆），用来验证控件确实驱动得动玩法
  ReadInput: () => ReadInput(),
  // 完整跑 n 帧（含镜头与 HUD）。面板隐藏时 rAF 停摆，验证得靠它。
  Tick: (n = 1, dt = 1 / 30) => {
    for (let i = 0; i < n; i += 1) RunFrame(performance.now(), dt);
  },
  JumpToBeat: (chapterIndex, beatIndex) => JumpToBeat(chapterIndex, beatIndex),
  ToggleDebug: (v) => ToggleDebug(v),
  GetBgmState: () => audio.GetBgmState(),
  // 采样音效包装了几个（0 = 全靠合成器兜底）
  SfxPackSize: () => audio.SfxPackSize(),
  Sfx: (name, opts) => audio.Sfx(name, opts),
  StepFrames: (n, input = {}) => {
    if (!state) return;
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false, ...input,
      }, 1 / 30);
    }
  },
  world,
  renderer: world.renderer,
};
