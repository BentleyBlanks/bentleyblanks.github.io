// 《地道里的光》 —— 主循环：横版输入（键盘 + 移动端触屏）、
// 镜头语法（硬切 / 慢推 / 横移 / 过肩正反打 / 插入特写）、HUD。
import {
  GAME_VERSION, CHAPTERS, SURFACE_Y, UNDER_Y, CreateGame, StepGame,
  CurrentBeatDef, MakeChoice, GetObjective, GetHint, SplitPrompt, BeatHintIcon,
  ChapterBeatList, DebugJump, SkipPrologue, PROLOGUE_CLIPS, SCRIBE_CARD, PLANE_CARD,
  KNOT_CARD, FOLD_CARD, WRAP_CARD, SPLIT_CARD, TEAR_CARD, SEW_CARD,
  PLAYABLE_CHAPTERS, ZHENGFU_NOTICE, AllRelics, LiveCardOn,
} from "./Script_Core.mjs";
import { DrawRelic, DrawHudBadge, DrawNoticeSheet } from "./Script_Art.mjs";
// 美术样式浏览器要按名字调很多支笔，整个模块拿进来（它本来就已经在模块图里）
import * as ART from "./Script_Art.mjs";
import { BONE as RIG_BONE } from "./Script_Rig.mjs";
import { CreateWorld } from "./Script_World.js";
import { CreateAnimLab, CreateRigStage, EnsureAnimIndex, EntriesForKind } from "./Script_AnimLab.mjs";
import { DefaultPreset, FormatRef } from "./Script_AnimIndex.mjs";
// 版本戳一律不写在这儿：全部由 index.html 的 import map 一张表盖上去
//（只盖入口、漏掉依赖，手机上就会新壳配旧芯——见那张表上的事故说明）
import { CreateSoundtrack } from "./Script_Soundtrack.js";
import { AUDIO_DEFAULT_LEVELS } from "./Data_AudioMix.mjs";
// 过场时间轴（调试面板，F3 / ?cine=1 / 设置→过场时间轴）：拖播放头定位过场的
// 某一格、把 `c1_xx@line=N,at=T` 定位串复制出来粘给 agent。见该文件头注。
import { CreateCineTimeline } from "./Script_CineTimeline.js";

const canvas = document.getElementById("gameCanvas");
const world = CreateWorld(canvas);
// 序章过场短片：登记片单，开局先把第一段拉下来，正片一开口就有画面
world.SetInsertVideoList(PROLOGUE_CLIPS);
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
import("./Script_Audio.js")
  .then((m) => {
    audio = m.CreateAudio();
    audio.SetEnabled(soundOn);
    ApplyVolumes();          // 合成器是后到的，音量得在它到位之后再喂一次
    soundtrack.LoadSfxPack();  // 采样音效包也一样：这会儿才有 AudioContext 可解码
    soundtrack.SyncDurations();
  })
  .catch((e) => { console.warn("声音模块未加载，按静音运行", e); });

// **声音默认关着**（用户定的，2026-08-14 又被"默认开"回归过一次）：旁白/音效/
// 配乐三路全在这一个开关底下，没点开之前一声不出。想听的按 M 或右上角打开，
// 开关记在本地——所以只有第一次进来是静的。
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
let soundOn = localStorage.getItem(SOUND_KEY) === "on";
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
  "titleScreen", "titleMenu", "startButton", "startNote", "btnContinue", "continueWhere",
  "btnControls", "btnTitleSettings",
  "controlsScreen", "controlsClose", "btnHelp", "btnQuit",
  "confirmOverlay", "confirmTitle", "confirmText", "confirmYes", "confirmNo",
  "prompt", "toast", "crouchTag", "itemTag", "itemName",
  "objectiveTab", "objectiveTabIcon", "objectiveTabText", "objectiveTabHint",
  "cineBars", "caption", "capSpeaker", "capText", "captionScrim",
  "detectionVignette", "fadeOverlay", "irisOverlay", "slitMatte",
  "chapterCard", "cardNum", "cardTitle", "cardYear", "cardContinue",
  "sceneTitle", "sceneTitleNum", "sceneTitleText",
  "choiceOverlay", "choicePrompt", "choiceList",
  "endScreen", "endRestart", "touchControls", "rotateHint", "btnSound",
  "btnSettings", "settingsPanel", "volVoice", "volSfx", "volMusic",
  "volVoiceOut", "volSfxOut", "volMusicOut",
  "endTitle", "endText",
  "noticeOverlay", "noticeSheet", "noticeClose",
  "btnBag", "bagBadge", "bagPanel", "bagStrip", "bagNote", "bagNoteName", "bagNoteText", "bagNoteCount",
  "btnDebug", "debugPanel", "debugChapters", "debugBeats", "debugNow", "debugClose", "btnCine",
  "btnAnim", "animPanel",
  "btnArt", "artBrowser", "artList", "artCanvas", "artMeta", "artClose", "artZoom", "artDark",
  "artRigCanvas", "artAnim", "artPlay", "artFlip", "artToLab", "artRigNote",
  "stick", "stickBase", "stickKnob", "btnSkipCine",
  "actPrompt", "itemThrow", "pipFrame", "pipView", "staminaBar",
]) ui[id] = document.getElementById(id);

const params = new URLSearchParams(location.search);
const fastCinematic = params.get("fast") === "1";

// 动画工作台（调试用，全屏）：自己一台渲染器，不碰世界；开着的时候世界停住、
// 键盘全归它（见 MenuKey 顶上那一条）。渲染器懒建——没打开过就不占 WebGL 上下文
const animLab = ui.animPanel ? CreateAnimLab({ root: ui.animPanel }) : null;
const AnimLabOpen = () => !!animLab && animLab.IsOpen();

// ---------------------------------------------------------------------------
// 进度与存档（2026-08-17 加，用户：「哪有一个线性游戏能跳关的 还没有存档？」）
//
// **一个自动存档位，按幕存**：每进一幕就把「哪一章 · 哪一幕」写下来，
// 标题页上的「继续」照它落回去。恢复走 Core.DebugJump——它把前面每一幕按脚本
// 结算一遍（人物入场、工事、分支都补上），所以存档不必记世界里的每一根骨头，
// 剧本改了也不会成为废档。三条细则：
// ① **认 id 不认序号**：往章里插一拍，老档的序号就指到别人家去了；id 是稳定的。
// ② **旗标另存一份**：结算跑的是脚本的默认分支，而玩家自己做过的抉择在
//    `state.flags` 里；跳完把存下来的**合并**回去（不整份替换——新版本加的键
//    要保留默认值）。
// ③ 关系到进度的另外两样各有各的存法，别在这儿重复：老物件在包袱那份
//    （BAG_KEY），声音与三路音量在 SOUND_KEY / VOL_KEY。这里只管"打到哪儿了"。
//
// 老的 `TunnelLight1943.unlocked`（解锁到第几章）连同标题页上那排章节牌一起
// 撤了——线性剧情不给跳关，选关退回调试面板（设置 → 调试）。
// ---------------------------------------------------------------------------
const SAVE_KEY = "tunnelLight1943.save.v1";
// 开放到第几章为止。Core 手里还是完整的八章，外壳在这儿收口。
const LAST_OPEN = Math.min(CHAPTERS.length, PLAYABLE_CHAPTERS) - 1;

/** 读存档并**校准到当前剧本**（章号夹住、幕按 id 找回来）。没有就返回 null。 */
function LoadSave() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch { return null; }
  if (!raw || typeof raw !== "object") return null;
  const chapter = Math.max(0, Math.min(LAST_OPEN, Number(raw.chapter) || 0));
  const beats = ChapterBeatList(chapter);
  if (!beats.length) return null;
  let beat = beats.findIndex((b) => b.id === raw.beatId);
  if (beat < 0) beat = Math.max(0, Math.min(beats.length - 1, Number(raw.beat) || 0));
  return {
    chapter, beat,
    label: beats[beat].label || "",
    flags: (raw.flags && typeof raw.flags === "object") ? raw.flags : null,
    at: Number(raw.at) || 0,
  };
}
/** 把眼下这一幕存下来。每进一幕调一次（见 RunFrame 的 saveKey）。 */
function WriteSave() {
  if (!state) return;
  const def = CurrentBeatDef(state);
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, game: GAME_VERSION,
      chapter: state.chapterIndex,
      beat: state.beatIndex,
      beatId: def?.id || null,
      flags: state.flags,
      at: Date.now(),
    }));
  } catch (ignored) { /* 隐私模式下写不进去：不存就是了，别把游戏搞崩 */ }
}
function ClearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (ignored) { /* 同上 */ }
}
// 存档那行小注：「第一章 · 第 7 幕 · 分了那半块」。幕名是从剧本现挖的
// （目标或第一句台词），长了截断——菜单上一行字，不是剧情梗概。
function SaveLine(save) {
  const ch = CHAPTERS[save.chapter];
  const label = save.label.length > 12 ? save.label.slice(0, 12) + "…" : save.label;
  return `${ch.num} · 第 ${save.beat + 1} 幕${label ? " · " + label : ""}`;
}
// 打完最后一个开放章：Core 那边照常进 chapterEnd（它手里还是完整的八章），
// 外壳在这儿把它接住——不给"下一章"的牌子，也不让 advance 传下去，
// 于是 ConfirmChapterCard 永远不会去 StartChapter(下一章)。
function DemoEnd(state) {
  return state.phase === "chapterEnd" && state.chapterIndex + 1 > LAST_OPEN;
}
let endScreenMode = null;

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
let interactEdge = false, advanceEdge = false, crouchToggle = false;

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  inputMode = "key";
  const k = e.key.toLowerCase();
  // 菜单开着的时候键盘归菜单（见 MenuKey）。**这一条必须在最前面**：底下那句
  // 「空格/回车 → advance + preventDefault」会把回车的默认行为一起吃掉，而按钮
  // 正是靠 keydown 上的默认行为激活的——不拦住，标题页上选中一条按回车没反应。
  if (MenuKey(e, k)) return;
  // 过场时间轴：F3 开合；开着时空格/←→/[ ]/Home/End 归它（备注框里打字它自己拦）
  if (k === "f3") { cineTimeline.Toggle(); e.preventDefault(); return; }
  if (cineTimeline.OnKey(e, k)) return;
  keys.add(k);
  if (k === "e") { interactEdge = true; advanceEdge = true; }
  // F 曾经专职投掷。投掷改成了「攥住石子往后拽」，没有按键路径了——键留着推台词，
  // 但绝不能再让 HUD 上出现一颗 F：按了没反应的键比没有更糟
  if (k === "f") advanceEdge = true;
  if (k === " " || k === "enter") { advanceEdge = true; e.preventDefault(); }
  if (k === "c" || k === "control") crouchToggle = !crouchToggle;
  if (k === "`" || k === "f2" || k === "～" || k === "·") { ToggleDebug(); e.preventDefault(); return; }
  if (k === "f4") { animLab?.Toggle(); e.preventDefault(); return; }
  // Esc ＝ 暂停：呼出设置面板（世界当帧停住）。市面上的游戏都在这颗键上。
  if (k === "escape") { OpenSettings(true); e.preventDefault(); return; }
  if (k === "1" || k === "2") {
    const def = state && CurrentBeatDef(state);
    if (def?.kind === "choice") { MakeChoice(state, def.options[k === "1" ? 0 : 1].key); HideChoice(); }
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
// M 开关声音——但打字的时候（工作台的搜索框）敲到 m 不算
window.addEventListener("keydown", (e) => {
  if (AnimLabOpen()) return;
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key.toLowerCase() === "m") ToggleSound();
});

const DEBUG_KEYS = ["`", "f2", "～", "·", "f3"];   // f3 ＝ 过场时间轴
// 菜单开着时键盘归菜单：Esc 收一层、↑↓ 在条目间挪、回车/空格按下去。
// 返回 true ＝ 这一下归菜单，玩法那段键盘分支整段跳过。
// **一层一层地收**（确认框 > 操作说明 > 设置 > 标题页）：Esc 收掉最上面那一张，
// 不是一把全关——同一颗键收两层东西，玩家会以为自己按错了。
function MenuKey(e, k) {
  // 动画工作台是最上面那一层：开着时键盘整个归它（空格播放、←→ 逐帧、Esc 关）
  if (AnimLabOpen()) {
    if (k === "f4") { animLab.Close(); e.preventDefault(); return true; }
    return animLab.Key(e, k) !== false;
  }
  // 人物美术样式浏览器（全屏）也是一层：Esc 关、空格/←→/↑↓/H 归它
  if (ui.artBrowser && !ui.artBrowser.hidden) return ArtKey(e, k);
  if (!ui.confirmOverlay.hidden) {
    if (k === "escape") { CloseConfirm(); e.preventDefault(); }
    return true;
  }
  if (!ui.controlsScreen.hidden) {
    if (k === "escape") { OpenControls(false); e.preventDefault(); }
    return true;
  }
  if (SettingsOpen()) {
    if (k === "escape") { CloseSettings(); e.preventDefault(); return true; }
    return false;   // 面板开着照旧能按 M 关声音、` 开调试
  }
  if (!ui.titleScreen.hidden) {
    if (k === "arrowdown" || k === "arrowup") {
      MoveTitleFocus(k === "arrowdown" ? 1 : -1);
      e.preventDefault();
      return true;
    }
    if (DEBUG_KEYS.includes(k) || k === "f4") return false;   // 标题页上也能开调试面板（选关就在那儿）/ 动画工作台
    return true;    // 回车/空格交给按钮的默认行为，别被玩法那几行吃掉
  }
  return false;
}
function MoveTitleFocus(step) {
  const items = [...ui.titleMenu.querySelectorAll("button")].filter((b) => !b.hidden);
  if (!items.length) return;
  const at = items.indexOf(document.activeElement);
  const next = at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length;
  items[next].focus({ preventScroll: true });
}
// 沉浸式手势的唯一入口：手按在画面上的**位置**（世界坐标 / 特写卡坐标），
// 加上竖向拖动量与点按。所有上手的玩法都从这几样里取——
// 转辘轳/打结靠 world 绕圈、勒紧靠 dy；
// 攥石笔、攥刨子靠 card：那两拍画面是一张铺满画框的特写卡，玩家按的是卡上
// 那件家伙什，世界坐标在那儿没有意义（世界里的笔十来个像素、刨子 90×45，
// 都是认不出也按不着的尺寸——实测过）。
// 故意没有横向位移量（dragX）通道：位移量拖哪儿都涨，本质是根看不见的
// slider——对物体做功必须攥住那个物体本身。
const gest = {
  active: false, id: null, lastX: 0, lastY: 0, dy: 0, downT: 0, moved: 0,
  world: null, card: null,
};
let tapEdge = false;
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch" || e.pointerType === "pen") inputMode = "touch";
  advanceEdge = true;
  if (!state) return;
  gest.active = true;
  gest.id = e.pointerId;
  gest.lastX = e.clientX;
  gest.lastY = e.clientY;
  gest.downT = performance.now();
  gest.moved = 0;
  gest.dy = 0;
  gest.world = world.ScreenToWorld(e.clientX, e.clientY);
  gest.card = world.ScreenToCard(e.clientX, e.clientY);
  // 捕获是锦上添花：手滑出画布还能接着操。指针已抬起或是合成事件时它会抛，
  // 不接住会把整个 handler 断在这儿
  try { canvas.setPointerCapture?.(e.pointerId); } catch (ignored) { /* 捕获不到就算了 */ }
});
canvas.addEventListener("pointermove", (e) => {
  if (!gest.active || e.pointerId !== gest.id) return;
  const span = Math.max(160, canvas.clientHeight * 0.55);
  gest.dy += (e.clientY - gest.lastY) / span;
  gest.moved += Math.abs(e.clientX - gest.lastX) + Math.abs(e.clientY - gest.lastY);
  gest.lastX = e.clientX;
  gest.lastY = e.clientY;
  gest.world = world.ScreenToWorld(e.clientX, e.clientY);
  gest.card = world.ScreenToCard(e.clientX, e.clientY);
});
for (const evt of ["pointerup", "pointercancel", "pointerleave"]) {
  canvas.addEventListener(evt, (e) => {
    // 捕获在手时 pointerleave 会误报，抬手与取消才算真结束
    if (evt === "pointerleave" || e.pointerId !== gest.id) return;
    if (evt === "pointerup" && performance.now() - gest.downT < 420 && gest.moved < 14) tapEdge = true;
    gest.active = false;
    gest.id = null;
    gest.dy = 0;
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
  // 这儿曾经有一颗投掷钮。扔石子改成了直接在屏幕上拖，钮和 F 键一起撤了
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
// **景别的唯一标尺**（2026-08-14 用户拿《勇敢的心》的截图重定：「现在太宽了」）。
// 量的是同一件事——**人在画高里占多少**：那张图里的大人占画高 21~22%；本作原来
// 地表 hw 6.3（画高 7.09m），骨架实高 1.37m 的大人只占 19%、柱子（体型 0.80，
// 实高 1.10m）只占 15.5%，一屏摆得下十二米村街，读出来就是"人小、街长、天多"。
// 现在按这张表收：地表画高 5.01m，柱子占 22%、大人占 27%
//（第一版收到 4.9／画高 5.5m，用户当天回「还可以再大一点（10%）」，全表除以 1.1）。
// **特写不跟着收**——那几档是照着卡面、一张脸、门框上的刻痕量出来的，
// 缩下去只会把主体挤出画（见 TightenHw 的下限）。
const PLAY_HW = {
  surface: 4.45,       // 地表白天
  surfaceNight: 4.35,  // 夜里再紧一点点（暗处看得见的本来就少）
  tunnelVillage: 5.65, // 地道村：一间洞室连着走廊，比街面退一档才装得下
  tunnelFort: 4.25,
};
// 中远景的定点镜跟着同一把尺子收。下限 3.8 是本作最宽的那一档特写——
// 比它还近的镜头一律原样过，别把脸和卡面挤出画框。
const HW_TIGHTEN = 0.71;
const HW_CLOSE = 3.8;
const HW_WIDE_MAX = 8.5;   // 「退一档」的封顶（本作没有全景，见 docs/Camera.md 镜头规范）
function TightenHw(d) {
  return d <= HW_CLOSE ? d : Math.max(HW_CLOSE, d * HW_TIGHTEN);
}

const cam = { x: 60, y: 2.0, hw: 7.2 };
let camSnap = true;
// 冻帧开关：只给实拍/调试用（TunnelLight.Freeze）。见 RunFrame 里那段注释
let frozen = false;
// 播放倍速：只给过场时间轴用（慢放看动画、快放找位置）。1 以外只在面板开着时有；
// 关面板归 1。>2 倍拆成子步喂 StepGame——一帧 0.2s 的 dt 会让绳/门这些积分的东西
// 发飘（?fast=1 那条 ×5 只在过场里用，过场没有物理）
let playSpeed = 1;
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
  if (ch.scene === "tunnelVillage") return { x: p.x + lookAhead, y: -1.15, hw: PLAY_HW.tunnelVillage };
  if (ch.scene === "tunnelFort") return { x: p.x + lookAhead, y: UNDER_Y + 1.15, hw: PLAY_HW.tunnelFort };
  // 地表：中近景，人物约占画高三分之一强；视平线略高于人头，地面向后退
  //
  // 爬梯子那两秒镜头**跟着人往下走**：Core 一按下 S 就把 level 翻成 under
  //（碰撞与玩法要按目的层算），但人还在梯子上，高度记在 p.lift 里。镜头不读
  // lift 的话就会当帧切到井底，人从画框上边慢慢掉下来——看着还是像瞬移。
  const climbing = p.climbT > 0 ? (p.lift || 0) : 0;
  let y = LevelY(p.level) + climbing + (p.level === "under" ? 1.25 : 1.85);
  const hw = ch.light === "night" ? PLAY_HW.surfaceNight : PLAY_HW.surface;
  // 走到窖口上头，镜头沉一档，把脚底下那间窖带进画框（Core 的 cellarPeek）。
  //
  // 地窖一直是画好的，可地表机位的下边沿只到 −1.7m、窖底在 −3.6m，整间窖
  // 都在画外——按 S 之前玩家根本看不见它，读起来就是"下去才凭空长出一间屋"。
  // 这是**升降**不是拉远：hw 一动不动，景别还是那一档。
  //
  // 沉多少不能写死一个米数：宽屏手机（2.16:1）的画高只有 16:9 的八成，
  // 同样沉 2 米就把柱子的脑袋切出画外了。所以按**画高**反算——
  // 留 HEAD_ROOM 给地面上的人和屋子，剩下的都让给底下。
  const peek = p.climbT > 0 ? 0 : (state.cellarPeek || 0);
  if (peek > 0.001 && p.level === "surface") {
    const halfH = (world.viewSize.h || hw) / 2;
    // 想沉多少：让下边沿落到窖底再往下 0.3m（`y − 沉 − 半高 = UNDER_Y − 0.3`）
    const want = y - halfH - (UNDER_Y - 0.3);
    // 能沉多少：上边沿不许低过 HEAD_ROOM——它量的是**画框顶离站立视平线**
    // 多高（顶沿 = 1.85 + HEAD_ROOM），0.8 正好把一间 2.4m 的土屋留在画里。
    // 这条上限是给宽屏手机的：2.16:1 的画高只有 16:9 的八成，不设限就把
    // 屋顶连人一起切出去；设太松（试过 1.7）又等于没沉，手机上还是看不见窖。
    const HEAD_ROOM = 0.8;
    const room = Math.max(0, halfH - HEAD_ROOM);
    y -= Math.max(0, Math.min(want, room)) * peek;
  }
  // 爬梯时不留提前量：人是竖着挪的，横向再往前探就成了甩镜头
  return { x: p.x + (p.climbT > 0 ? 0 : lookAhead), y, hw };
}

function HintShot(state, hint) {
  switch (hint.kind) {
    case "wide":
      // **全作没有俯瞰全村的机位**（用户 2026-08-08 定的，参考勇敢的心）：
      // 镜头从头到尾都在玩法景别上，变化只来自镜头动画（横移 pan / 换机位），
      // 不来自景别。原来 wide 的 hw 是 26——半径 26 米，整条村街连着地道剖面
      // 一屏摆完，开场第一眼就等于把地图和"藏在地下"这个题眼一起剧透了。
      // 现在 wide 的意思只剩「比玩法机位退一档」，并且封顶：写多大都不许越过 12
      return {
        x: hint.x, y: hint.y ?? 2.4,
        hw: Math.min(TightenHw(hint.hw ?? 9.5), HW_WIDE_MAX),
        pan: hint.pan || 0,
      };
    case "shot":
      // 定点镜写的 dist 有一百多处，逐个改数字只会漏、也没法一眼看出全片的
      // 景别是一把尺子。统一从 TightenHw 过一道：中远景收一档、特写原样。
      return { x: hint.x, y: hint.y ?? 1.6, hw: Math.min(TightenHw(hint.dist ?? 8), HW_WIDE_MAX), pan: hint.pan || 0 };
    case "insert":
      return { x: hint.x, y: hint.y ?? 1.4, hw: hint.dist ?? 2.4, pan: hint.pan || 0 };
    case "insertCard":
      // 专画的一张细节插画铺满画框；机位停在原地不动。
      // seg：活动插卡（每帧重画）的段号，动画按 (seg, 本行时间) 走
      // cut：**硬切**——罩子当帧掀开/盖回，不走 6.5/s 的吸附（序章那 0.5s 的
      // 刺刀一帧走吸附的话，从头到尾都蒙着一层灰）
      return { ...BaseShot(state), card: hint.card, cardSeg: hint.seg ?? 0, cut: !!hint.cut };
    case "insertVideo":
      // 序章：一行旁白一段过场短片铺满画框。card 是兜底——片子没缓冲好就先上手绘卡
      return { ...BaseShot(state), card: hint.card, video: hint.clip };
    case "close": {
      const t = ActorAt(state, hint.on || "player") || { x: state.player.x, level: state.player.level };
      return { x: t.x + (hint.dx || 0), y: LevelY(t.level) + 1.25, hw: TightenHw(hint.dist ?? 4.2) };
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
      // 黑就是黑：`1` 不是 0.94。老版留那 6% 不是为了"有点透"，是因为
      // #fadeOverlay 排在字幕**上面**——压到 1 就把台词一起盖掉了。现在
      // 罩子的 z-index 沉到字幕之下（Style_Game.css），黑得到底，字照旧在上头。
      // cut：从亮到黑**当帧盖上**（接在硬切一帧后头的那句黑）
      return { ...BaseShot(state), fade: 1, cut: !!hint.cut };
    case "free": {
      // 过场自由相机（勇敢的心式运镜，仅 cinematic 行）：from→to 机位、
      // at→atTo 注视点按本行时长插值（smoothstep），roll 单位是度。
      // 数值口径：FOV 30° 下画宽 ≈ 机位到注视点的距离（16:9），
      // 也就是旧 hint 的 dist（半宽）× 2。VO 拖长行时插值钉在终点不再动。
      const e = CineEase(state, hint);
      const F = FreeAt(hint, e);
      return {
        free: F,
        // 指纹必须取自 hint 本身：插值出来的位置每帧都变，拿它当指纹
        // 等于每帧都在"换镜头"
        freeKey: `${hint.from}|${hint.to}|${hint.at}|${hint.atTo}`,
        x: F.tx, y: F.ty, hw: 6,
      };
    }
    case "split": {
      // 左右分屏（2026-08-14）：两台过场相机各占半屏，中间一道撕口白缝。
      // 半屏的画幅是竖的（≈8:9），**同一个 dist 下人物比整屏大一圈**——
      // 所以两侧的机位要各自按"这一格里要装下什么"给，别照整屏那套抄。
      const e = CineEase(state, hint);
      const L = FreeAt(hint.left, e);
      const R = FreeAt(hint.right, e);
      return {
        free: L,                       // 主相机跟左格：画幅/雾色/层闸门都由它定
        split: { left: L, right: R, gap: hint.gap ?? 0.014 },
        freeKey: `S|${hint.left.from}|${hint.left.at}|${hint.right.from}|${hint.right.at}`,
        x: L.tx, y: L.ty, hw: 6,
      };
    }
    default:
      return BaseShot(state);
  }
}

// 过场行的插值进度：按本行时长 smoothstep（VO 把行拖长时钉在终点不再动）
function CineEase(state, hint) {
  const d = Math.max(0.6, state.camLineD || 3.4);
  const k = Math.min(1, (state.camLineT || 0) / d);
  return hint.ease === "linear" ? k : k * k * (3 - 2 * k);
}

function FreeAt(spec, e) {
  const L = (a, b) => a + (b - a) * e;
  const f = spec.from, t = spec.to || spec.from;
  const a = spec.at, a2 = spec.atTo || spec.at;
  const r0 = spec.roll || 0, r1 = spec.rollTo ?? r0;
  return {
    px: L(f[0], t[0]), py: L(f[1], t[1]), pz: L(f[2], t[2]),
    tx: L(a[0], a2[0]), ty: L(a[1], a2[1]), tz: L(a[2] || 0, a2[2] || 0),
    roll: (r0 + (r1 - r0) * e) * Math.PI / 180,
  };
}

function UpdateCamera(state, dt) {
  const inCinematic = state.phase === "playing"
    && (CurrentBeatDef(state)?.kind === "cinematic" || !!state.microCine);

  let shot;
  if (inCinematic) {
    const hint = state.camHint || { kind: "follow" };
    shot = HintShot(state, hint);
    // 构图指纹：位置/高度/景别有实质变化才算换镜头。
    // 自由镜头拿 hint 本身当指纹——插值出来的位置每帧都在变
    const fp = shot.freeKey ? "F" + shot.freeKey
      : `${Math.round(shot.x * 2)}|${Math.round(shot.y * 3)}|${Math.round(shot.hw * 3)}|${shot.ots ? shot.ots.id + shot.ots.side : ""}`;
    if (fp !== framing.key) {
      const first = framing.key === "";
      framing = { key: fp, prog: 0, baseHw: shot.hw };
      camSnap = true;                       // 硬切
      // 转场语汇：硬切 / 黑场闪断 / 圆形收光——按行上标注的 trans 走
      const trans = (state.camHint && state.camHint.trans) || (first ? "iris" : "cut");
      if (trans === "dip") dipLevel = 1;
      else if (trans === "iris") irisClosing = true;
    }
    // 行内慢推/横移：按本行时长归一化，一行之内正好走完 pan，肉眼才看得见。
    // 自由镜头的运动全在 HintShot 里插值完了，这套通用慢推别再叠上去
    const lineD = Math.max(1.2, state.camLineD || 3.4);
    framing.prog = Math.min(1, framing.prog + dt / lineD);
    if (!shot.free) {
      shot = {
        ...shot,
        x: shot.x + (shot.pan || 0) * framing.prog,
        hw: framing.baseHw * (1 - 0.10 * framing.prog),
      };
    }
    world.SetOverShoulder(state, shot.ots || null);
    world.SetInsertCard(shot.card || null, shot.video || null, state.camLineT || 0, shot.cardSeg || 0);
    // 框景与分屏都是**这一行**的事（换行＝换镜头），所以跟着 hint 走，
    // 不挂在节拍上；插卡那几行没有世界可看，框景一律让开。
    // 框景的 u/v 折算要按**这一格的画幅**：分屏时半屏是竖的（≈0.88），
    // 拿整屏的 16:9 去折，板子会横着跑出画外
    const fgAspect = shot.split
      ? Math.max(0.2, (world.viewSize.w / world.viewSize.h) * (1 - shot.split.gap) / 2)
      : (world.viewSize.w / world.viewSize.h);
    // 框景的 u/v 要按"这一格的画框"折算，而折算要一台相机。老版只在
    // `free`/`split` 两档给得出（那两档 hint 里本来就写着机位），别的一律传 null
    // ——而 `ForePlace` 见 cam 为空就**把 u/v 当世界坐标用**，板子直接飞到
    // 村东头去。于是"给 insert/shot/close/ots 那几镜加块框景"这件事，写了也是白写
    // （2026-08-16 照分镜图重排第一章时撞上的：分镜**每一张**都有一块压得很暗、
    // 被画框切掉的近景，而全章的过场当时一块都没有）。
    // 定点镜的机位是反推得出来的：FOV 30° 下 半宽 = 0.4765 × 机距。
    const foreCam = shot.split || (shot.free ? { left: shot.free } : {
      left: { px: shot.x, py: shot.y, pz: Math.max(0.3, shot.hw / 0.4765), tx: shot.x, ty: shot.y, tz: 0 },
    });
    world.SetCineFore(shot.card ? null : (hint.fg || null), foreCam, fgAspect, fp);
    world.SetSplitShot(shot.split || null);
  } else {
    // 玩法段一般是跟随。但个别节拍自己指定了构图——划线要推到门框上，
    // 全景里那道线只是一个像素在动。这里不硬切，让常规的跟随插值把镜头推过去。
    // state.closeUp 是玩法步骤级的特写（摇辘轳/打结：交互本身长在特写里，
    // 不在大全景下做），优先于节拍级的 def.cam；步骤一结束它就没了，镜头拉回。
    const def = state.phase === "playing" ? CurrentBeatDef(state) : null;
    const cu = state.phase === "playing" ? state.closeUp : null;
    shot = cu ? HintShot(state, { kind: "shot", x: cu.x, y: cu.y, dist: cu.hw })
      : def?.cam ? HintShot(state, def.cam) : BaseShot(state);
    if (framing.key !== "") { framing = { key: "", prog: 0, baseHw: shot.hw }; camSnap = true; } // 交给 iris 遮
    world.SetOverShoulder(state, null);
    world.SetInsertCard(null, null, 0);
    // 玩法段的框景只有一处来源：节拍自己声明的 `fg`，而且**只能写世界坐标**
    // （u/v 是按画框折算的，跟随镜头下画框一直在动，板子会跟着人漂）
    world.SetCineFore((def?.fg && state.phase === "playing") ? def.fg : null, null, 16 / 9, "play:" + (def?.id || ""));
    world.SetSplitShot(null);
  }
  // 分级不再按拍换挡（2026-08-17 用户：「统一游戏过场的内外」）：World 那一遍
  // 后期一直开着、过场与玩法同一条曲线，所以这儿一个字都不用管。原来这里有
  // 一段 6/s 的吸附，负责在"过场满档 ↔ 玩法不分级"之间过渡——接缝没了，
  // 过渡也就没了。要拨强度去 World.SetCineGrade，那是全局的。
  // 做功那几拍的活卡（划线 / 刨料 / 接绳 / 叠衣裳）：铺满画框、每帧重画，玩家
  // 的手就按在上面。必须排在 SetInsertCard 之后（不然当帧就被它关掉）、
  // ApplyCamera 之前（PlaceInsertCard 要给它摆位，并顺手算出屏幕↔卡面的换算比）。
  const playing = state.phase === "playing";
  world.SetLiveCard(
    playing && state.scribeCard ? { kind: "scribe", view: state.scribeCard, layout: SCRIBE_CARD }
      : playing && state.planeCard ? { kind: "plane", view: state.planeCard, layout: PLANE_CARD }
        : playing && state.knotCard ? { kind: "knot", view: state.knotCard, layout: KNOT_CARD }
          : playing && state.foldCard ? { kind: "fold", view: state.foldCard, layout: FOLD_CARD }
            : playing && state.wrapCard ? { kind: "wrap", view: state.wrapCard, layout: WRAP_CARD }
            : playing && state.splitCard ? { kind: "split", view: state.splitCard, layout: SPLIT_CARD }
            : playing && state.tearCard ? { kind: "tear", view: state.tearCard, layout: TEAR_CARD }
            : playing && state.sewCard ? { kind: "sew", view: state.sewCard, layout: SEW_CARD }
            : null,
    dt,
  );

  let view;
  if (shot.free) {
    // 自由镜头每帧直设（运动已在 HintShot 插值），不走平滑；平滑基线跟着
    // 注视点走，切回常规镜头那一下有 camSnap/iris 兜着，不会甩
    const F = shot.free;
    view = world.ApplyCineCamera(F.px, F.py, F.pz, F.tx, F.ty, F.tz, F.roll);
    cam.x = F.tx; cam.y = F.ty; cam.hw = view.viewW / 2;
    camSnap = false;
  } else {
    if (camSnap) {
      cam.x = shot.x; cam.y = shot.y; cam.hw = shot.hw;
      camSnap = false;
    } else {
      const k = Math.min(1, dt * (inCinematic ? 2.4 : 5.2));
      cam.x += (shot.x - cam.x) * k;
      cam.y += (shot.y - cam.y) * k;
      cam.hw += (shot.hw - cam.hw) * k;
    }
    view = world.ApplyCamera(cam.x, cam.y, cam.hw);
  }
  world.UpdateAtmosphere(state, view.viewW, view.viewH, cam.x, cam.y, view.dist, dt);
  // 行上标了 `cut` 的镜（硬切一帧那种）：换到这一行的当帧，罩子直接跳到目标值。
  // 认的是 hint 对象本身（＝剧本里那一行的 cam），同一行里不会反复触发
  if (shot.cut && state.camHint !== fadeCutHint) { fadeCutHint = state.camHint; fadeSnap = true; }
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
let fadeSnap = false;        // 硬切：下一次 SyncHud 把罩子直接钉到目标值
let fadeCutHint = null;      // 上一次触发硬切的那一行的 cam（防同一行反复触发）
let lastObjective = undefined;

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
const KEY_GLYPH = { interact: "E", crouch: "C", up: "W", down: "S" };
// 触屏图形与 index.html 里那三个钮逐笔一致，玩家不用在两套语汇之间翻译；
// 爬梯的上下是摇杆——画成盘子里的一支箭
const TOUCH_GLYPH = {
  interact: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 12.2V7.4M11.4 11.6V6.2M14.6 12.2V7.4"/>'
    + '<path d="M8.2 12.2v1.5c0 3 1.8 5 4.3 5s4.3-2 4.3-5V9.6"/><path d="M8.2 13.4l-2.4-2.2"/></svg>',
  crouch: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6.6" r="2.2"/>'
    + '<path d="M10.6 8.9c2.6 1 4.1 2.6 4.3 5.2l-3.5 3.3.4 3.2"/><path d="M12.4 11.6l-3.4 2.6 1 3.4"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.6"/>'
    + '<path d="M12 15.8V8.6M12 8.6l-3 3M12 8.6l3 3"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.6"/>'
    + '<path d="M12 8.2v7.2M12 15.4l-3-3M12 15.4l3-3"/></svg>',
};

// 四动词的那半个方向（E ＋ ↑/↓/←/→）：键盘给箭头键帽，触屏给摇杆里的一支箭。
// 上下沿用爬梯那两枚盘子里的箭（同一件事：摇杆往那边推），左右照抄旋 90°
const DIR_GLYPH = {
  up: TOUCH_GLYPH.up, down: TOUCH_GLYPH.down,
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.6"/>'
    + '<path d="M15.8 12H8.6M8.6 12l3-3M8.6 12l3 3"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.6"/>'
    + '<path d="M8.2 12h7.2M15.4 12l-3-3M15.4 12l-3 3"/></svg>',
  // 左右都行（掰红薯干、顺着坛肩来回抹）：盘子里一支双头箭
  horiz: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.6"/>'
    + '<path d="M7.4 12h9.2M9.6 9.6L7.2 12l2.4 2.4M14.4 9.6l2.4 2.4-2.4 2.4"/></svg>',
};
const DIR_KEY = { up: "↑", down: "↓", left: "←", right: "→", horiz: "↔" };

function KeyChipHtml(act) {
  if (!act) return "";
  return inputMode === "touch" ? (TOUCH_GLYPH[act] || "") : (KEY_GLYPH[act] || "");
}

function DirChipHtml(dir) {
  if (!dir) return "";
  return inputMode === "touch" ? (DIR_GLYPH[dir] || "") : (DIR_KEY[dir] || "");
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
  if (spec?.at) {
    // 钉在一个死点位上的小窗（打水时那扇「井底」）。**这是主相机去不了的
    // 地方**：画面底下永远压着一条近景地面带，主相机看不到地平线以下，
    // 第二台相机却可以架进井筒里——它在那条地面带**后面**（pip 机位 z 比
    // 3.3 小），于是井底那点事有地方演了
    shot = { x: spec.at.x, y: spec.at.y, hw: spec.hw ?? 1.2 };
  } else if (spec) {
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
  const fp = `${inputMode}|${pr.act}|${pr.dir || ""}|${pr.text}`;
  if (fp !== actShown) {
    actShown = fp;
    el.hidden = false;
    // 做功那一档是两枚键帽：E ＋ 方向。涟漪与进度环只长在 E 那枚上
    //（CSS 的 `.pKey:not(.pDir)`），方向那枚是"还要往哪推"的说明
    const dir = DirChipHtml(pr.dir);
    el.querySelector(".pKeys").innerHTML = `<i class="pKey">${KeyChipHtml(pr.act)}</i>`
      + (dir ? `<i class="pPlus">＋</i><i class="pKey pDir">${dir}</i>` : "");
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
  // 活卡铺满画框那几拍（抠泥封/掰红薯干/撕布/划线）看不见柱子——键帽钉在卡的
  // 下沿正中，别按他头顶的位置漂到卡上不知哪个角去
  if (LiveCardOn(state) && cw && chh) {
    el.style.left = Math.round(cw / 2 - actBox.w / 2) + "px";
    el.style.top = Math.round(chh * 0.80 - actBox.h / 2) + "px";
    return;
  }
  if (!vs?.w || !cw || !chh) { el.style.left = "50%"; el.style.top = "70%"; return; }
  const p = state.player;
  const headY = LevelY(p.level) + (p.crouch ? 1.55 : 2.15);
  const sx = cw * (0.5 + (p.x - cam.x) / vs.w);
  const sy = chh * (0.5 - (headY - cam.y) / vs.h);
  el.style.left = Math.round(Math.max(10, Math.min(cw - actBox.w - 10, sx - actBox.w / 2))) + "px";
  el.style.top = Math.round(Math.max(10, Math.min(chh - actBox.h - 10, sy - actBox.h - 6))) + "px";
}

// ---------------------------------------------------------------------------
// 角上那枚「下一件事」（勇敢的心式）——目标 HUD **只有这一处**
//
// 2026-08-17 用户：「把水带回家这种小任务和左上角的任务目标 icon 这块功能还是
// 有点重合的 合并一下吧 简化一点」。老版是两件东西说同一句话：屏幕正中一条目标
// 在换目标时闪 6.5 秒，左上角一枚图常驻、悬停/点开才给字——玩家在换目标那一刻
// 同时看见两处"把水带回家"。现在中间那条整个撤了，角上这枚牌把它的活接过来：
// **换了目标，牌自己张开把字说一遍（同样几秒）再收回图**；之后想再看，悬停
// （CSS 管）/ 点一下。图与画框边那张提示牌同一支画笔、同一套推导
// （Core.BeatHintIcon → Art.DrawHudBadge），角上认得的图走到框边还是同一张。
// 目标在过场里换的（牌那会儿藏着），等牌再露面时补说——不然那句就没人说过。
// ---------------------------------------------------------------------------
let objIconFp = "";
let objTextFp = "";
let objTabT = 0;          // 张开之后自己收回去的倒计时（悬停那条归 CSS，不进这儿）
let objFresh = false;     // 目标刚换过、字还没给玩家看过（牌藏着的时候先欠着）
const OBJ_TAB_HOLD = 6.5; // 张开多久：换目标自动张的、点一下张的，一个数

function PaintObjectiveIcon(icon) {
  const cv = ui.objectiveTabIcon;
  if (!cv) return;
  // 牌在 DOM 上只有 44px，按最高的 DPR 顶到 4 倍就够看（World 那边 HINT_SS=12
  // 是给过肩特写量的，这里照那个倍率烘纯属白扔内存）
  const ss = 4, w = 48;
  cv.width = w * ss;
  cv.height = w * ss;
  const ctx = cv.getContext("2d");
  ctx.setTransform(ss, 0, 0, ss, 0, 0);
  DrawHudBadge(ctx, w, w, icon);
}

function SetObjTabOpen(open) {
  const el = ui.objectiveTab;
  if (!el) return;
  el.classList.toggle("open", open);
  el.setAttribute("aria-expanded", open ? "true" : "false");
  objTabT = open ? OBJ_TAB_HOLD : 0;
}

function SyncObjectiveTab(state, inCinematic, objective, dt) {
  const el = ui.objectiveTab;
  if (!el) return;
  if (objective !== lastObjective) {
    lastObjective = objective;
    objFresh = !!objective;   // 藏着的时候先欠着，露面那一帧再说
  }
  const show = state.phase === "playing" && !inCinematic && !!objective;
  if (!show) {
    if (!el.hidden) { el.hidden = true; SetObjTabOpen(false); }
    return;
  }
  el.hidden = false;
  // 跳过序章那颗钮也占着左上角：它亮着的时候牌让到它底下去
  el.classList.toggle("lower", !ui.btnSkipCine?.hidden);

  const icon = BeatHintIcon(state) || { kind: "walk" };
  const fp = [icon.kind, icon.who || icon.item || icon.gesture || "", icon.id || ""].join("|");
  if (fp !== objIconFp) {
    objIconFp = fp;
    PaintObjectiveIcon(icon);
    // 顶一下。先摘 class 再回流一次，同一枚图连着换两回也还能重新触发
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  const hint = GetHint(state) || "";
  const tfp = `${objective}|${hint}`;
  if (tfp !== objTextFp) {
    objTextFp = tfp;
    ui.objectiveTabText.textContent = objective;
    ui.objectiveTabHint.textContent = hint;
    el.classList.toggle("noHint", !hint);
    el.setAttribute("aria-label", hint ? `${objective}。${hint}` : objective);
  }

  // 换了目标：牌自己张开把字说一遍（老版这句是屏幕正中那条目标条说的）
  if (objFresh) { objFresh = false; SetObjTabOpen(true); }

  if (objTabT > 0) {
    objTabT -= dt;
    if (objTabT <= 0) SetObjTabOpen(false);
  }
}

if (ui.objectiveTab) {
  ui.objectiveTab.addEventListener("click", (e) => {
    e.stopPropagation();
    SetObjTabOpen(!ui.objectiveTab.classList.contains("open"));
    // 鼠标/手指点的那一下别把键盘焦点扣在这枚牌上——玩家接着还要按 E
    //（e.detail 为 0 的是键盘敲出来的，那种就该留着焦点）
    if (e.detail) ui.objectiveTab.blur();
  });
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

  // 声明了 prologue 的整段可跳过（2026-08-13 视频序章删掉后暂时没有这样的拍，
  // 钮就一直不亮——机制留着，再加不可玩的长段落时写 `prologue: true` 即可）
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

  // 目标：只有左上角那一枚牌（换目标时它自己张开说一遍，之后画面自己说话）
  SyncObjectiveTab(state, inCinematic, GetObjective(state), dt);

  // 节拍自己的提示优先；没有的时候，把"这儿能上下"这件事说出来。
  // 带按键的走头顶那枚徽章，没按键的状态行（"跟上娘""！探杆就在头顶"）
  // 仍旧躺在底边——两种东西，两个位置，别混在一条 pill 里。
  // 章节卡/终局那几拍 StepGame 提前 return，state.prompt 是上一幕留下的死值——
  // 徽章现在浮在画面中间，赖着不走就直接盖在章节卡上了
  // 翻越的提示排在最前：被一垛柴挡住去路是此刻最要紧的事，
  // 盖过节拍那句「跟上娘」是对的——手上没按那一下，他哪儿也去不了
  const raw = state.phase === "playing"
    ? (state.vaultHint || state.prompt || state.climbHint || "") : "";
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
  // 手里那格：单格物品栏。可投的挂 F、可放下的挂 E——「放下」是常态，
  // 但提示走物品栏角标，不占画面中央那条（勇敢的心式克制）
  const item = state.player?.item;
  const showItem = !!item && !inCinematic && state.phase === "playing";
  if (ui.itemTag) {
    ui.itemTag.hidden = !showItem;
    // 能扔的/能放下的各挂一枚小徽章，不写"（F 投掷）"——键名不进文案，
    // 手机上那三个字没有对应物。「放下」提示走这里的角标，不占画面中央那条。
    const tagFp = item ? `${inputMode}|${item.label}|${item.throwable ? 1 : 0}|${state.canDrop ? 1 : 0}` : "";
    if (ui.itemName && tagFp !== itemTagShown) {
      itemTagShown = tagFp;
      ui.itemName.textContent = item ? item.label : "";
      if (ui.itemThrow) {
        // 能扔的东西不再挂键帽：扔是「攥住往后拽」，提示在中央那条 prompt 里
        //（KeyChipHtml("throw") 已随 F 键一起删掉）
        const chips = [];
        if (state.canDrop) chips.push(KeyChipHtml("interact"));
        ui.itemThrow.hidden = chips.length === 0;
        ui.itemThrow.innerHTML = chips.join("");
      }
    }
  }
  // 手势提示的小黑饼（#gestureHint）已整体拆除（2026-08-10 用户：暗圆盘里
  // 一粒点按方向做动画，"明明是按键交互 非要装自己是个圈 还给个方向？"）。
  // 方向写进提示文案（"往上使劲"），上手的交互由实物自己招呼（辘轳的引导圈、
  // 卡上会蹭的绳头、攥住石子时的拉弓预览弧）。state.gesture 通道已随之拆掉，
  // 别再造——SmokeTest 的 TestGestureBlobStaysDead 盯着。
  // 手劲条：辘轳吊着一桶水的时候，这条一直在掉——它是**读数**不是做功进度
  //（做功仍然只认手上那圈绕/那下按键）。用户 2026-08-10 点名要的那一条：
  // "放下水桶这个过程角色一点力好像都不需要用……加一个体力条"。
  if (ui.staminaBar) {
    const sm = !inCinematic && state.phase === "playing" ? state.stamina : null;
    ui.staminaBar.hidden = !sm;
    if (sm) {
      ui.staminaBar.style.setProperty("--fill", (sm.v * 100).toFixed(1) + "%");
      ui.staminaBar.classList.toggle("low", !!sm.low);
      ui.staminaBar.classList.toggle("out", !!sm.out);
    }
  }

  // 做功的节拍**没有任何 HUD 轨道**（用户明令禁止 slider，两次退回）：
  // 划线攥的是特写卡上那支笔，刨料攥的是世界里那把刨子——进度长在木头上
  // （印子/被刨亮的那一片/地上那堆刨花），招呼玩家上手的是道具自己
  // （笔会晃、刨子透光呼吸）。这里曾有一块 #scribeGuide 拖动轨道的同步代码，
  // 已连元素和 CSS 一起拆掉，别加回来。
  if (ui.touchControls) {
    ui.touchControls.classList.toggle("dimmed", !!inCinematic || state.phase !== "playing");
    // 活卡那几拍摇杆与互动钮**留着**（2026-08-17 四动词第二轮）：抠泥封/掰红薯干/
    // 撕布/划线如今全靠「互动钮 ＋ 摇杆方向」，收走就没法玩了。老版收走是因为
    // 卡面要用手拖；只剩缝三针那张还认手拖，它两条路都通，摇杆照旧留着
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

  // 戏里的章名字样（八稿：序末的「序章 · 蓝底白花」、章末的「序章结束」）
  // ——不是章节卡，不挡操作；淡入淡出交给 CSS 的过渡
  if (state.titleCard) {
    ui.sceneTitle.hidden = false;
    ui.sceneTitleNum.textContent = state.titleCard.num || "";
    ui.sceneTitleText.textContent = state.titleCard.title || "";
    const tc = state.titleCard;
    const fadeIn = tc.t > 0.05;
    const fadeOut = tc.t > (tc.dur || 3.2) - 0.6;
    ui.sceneTitle.classList.toggle("show", fadeIn && !fadeOut);
  } else if (!ui.sceneTitle.hidden) {
    ui.sceneTitle.classList.remove("show");
    ui.sceneTitle.hidden = true;
  }

  const demoEnd = DemoEnd(state);
  if (!demoEnd && (state.phase === "chapterCard" || state.phase === "chapterEnd")) {
    const showNext = state.phase === "chapterEnd";
    const ch = CHAPTERS[state.chapterIndex + (showNext ? 1 : 0)];
    ui.chapterCard.hidden = false;
    ui.cardNum.textContent = showNext ? "下一章 · " + ch.num : ch.num;
    ui.cardTitle.textContent = ch.title;
    ui.cardYear.textContent = ch.year;
    ui.cardContinue.textContent = "点击继续";
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

  // 征夫告示阅读层：跟 state.noticeOpen 走。开着时环境声收窄（Duck），
  // 背景压暗由覆盖层自己的半透明底做——世界还在画框里，不切黑
  if (ui.noticeOverlay) {
    const open = !!state.noticeOpen;
    if (ui.noticeOverlay.hidden !== !open) {
      ui.noticeOverlay.hidden = !open;
      // 纸得在**显示出来之后**画：hidden 的元素量不出画框（宽高全是 0），
      // 而尺寸是按 window 取的，所以这儿的先后其实只关系到"画没画"这一件事
      if (open) PaintNoticeSheet();
      audio.Duck(open);
    }
  }

  // 试玩收尾借的是通关那块牌子，但话得换——这不是"全篇完"，是"做到这儿"
  const showEnd = state.phase === "gameEnd" || demoEnd;
  ui.endScreen.hidden = !showEnd;
  if (showEnd && endScreenMode !== (demoEnd ? "demo" : "full")) {
    endScreenMode = demoEnd ? "demo" : "full";
    if (ui.endTitle) {
      // 章号从 CHAPTERS 取（序章／第一章……），别再按下标数——c1 现在是「序章」
      ui.endTitle.textContent = demoEnd
        ? `${CHAPTERS[LAST_OPEN]?.num || "第一章"}完` : "门框上的两道刻痕，留在了身后";
    }
    if (ui.endText) {
      ui.endText.textContent = demoEnd
        ? "后面的章节还在做。地道才挖到七叔家那头。"
        : "地道还在。人还在。日子还要往下过。";
    }
  }

  if (dipLevel > 0) dipLevel = Math.max(0, dipLevel - dt * 4.6);
  const targetFade = state.phase === "gameEnd" ? 0.75 : shotFade;
  // 指数吸附**永远到不了终点**：2.4/s 的老速度要 1.2 秒才走到九成，收黑那一下
  // 慢吞吞、亮回来更慢（一句台词都念完了画面还挂着一层灰）。提速到 6.5/s
  // （≈0.45 秒走完），并且贴近终点就吸住——不吸住的话"全黑"永远差着最后
  // 那几个千分点，屏幕上是深灰不是黑。
  // 硬切（行上标 `cut`）：不吸附，当帧钉到目标——刺刀那一帧要"啪"地亮、"啪"地黑
  if (fadeSnap) { fadeLevel = targetFade; fadeSnap = false; }
  fadeLevel += (targetFade - fadeLevel) * Math.min(1, dt * 6.5);
  if (Math.abs(targetFade - fadeLevel) < 0.01) fadeLevel = targetFade;
  ui.fadeOverlay.style.opacity = Math.max(fadeLevel, dipLevel).toFixed(3);
}

// ---------------------------------------------------------------------------
// 标题：一列条目（继续 / 新游戏 / 操作说明 / 设置）
//
// 「继续」有存档才出现——灰着的按钮是在说"这儿本该有东西"，可头一回进来的人
// 没什么可继续的。主位（灯色那一块）跟着走：有档在「继续」上，没档在「新游戏」上，
// 玩家一眼看得出该按哪一条。
// ---------------------------------------------------------------------------
function BuildTitle() {
  const save = LoadSave();
  ui.btnContinue.hidden = !save;
  if (save) ui.continueWhere.textContent = SaveLine(save);
  // 「新游戏」在有档时要把代价写在脸上（点下去会盖掉进度），不能等按了才说
  ui.startNote.textContent = save ? "从头再来一遍" : "从序 · 那天开始";
  ui.btnContinue.classList.toggle("primary", !!save);
  ui.startButton.classList.toggle("primary", !save);
}

// 主位那条上给个焦点：键盘直接回车就走得了（手柄/键盘玩家的老习惯）
function FocusTitleMenu() {
  const first = [...ui.titleMenu.querySelectorAll("button")].find((b) => !b.hidden);
  first?.focus({ preventScroll: true });
}

function ShowTitle() {
  ui.titleScreen.hidden = false;
  BuildTitle();
  FocusTitleMenu();
}

// ── 三个入口 ────────────────────────────────────────────────────
function ContinueGame() {
  const save = LoadSave();
  if (!save) { StartGame(0); return; }
  StartGame(save.chapter);
  JumpToBeat(save.chapter, save.beat);
  // 存下来的旗标**合并**回去：结算只跑得出脚本的默认分支，玩家自己选过的那些
  // （route/deduced/notesSeen…）在这儿才补得回来
  if (save.flags) Object.assign(state.flags, save.flags);
  fadeLevel = 1;          // 从黑里亮起来，别硬切
}
function NewGame() {
  ClearSave();
  StartGame(0);
}
// 新游戏是唯一会抹掉进度的按钮，所以有档时先问一句
ui.startButton.addEventListener("click", () => {
  const save = LoadSave();
  if (!save) { NewGame(); return; }
  AskConfirm({
    title: "开始新游戏？",
    text: `当前进度（${SaveLine(save)}）会被盖掉。`,
    yes: "从头开始",
    onYes: NewGame,
  });
});
ui.btnContinue.addEventListener("click", ContinueGame);
ui.btnControls.addEventListener("click", () => OpenControls(true));
ui.btnTitleSettings.addEventListener("click", () => OpenSettings(true));

// ── 操作说明 ────────────────────────────────────────────────────
// 标题页与游戏里（设置面板）共用这一页：一处内容，两个入口。
function OpenControls(open) {
  ui.controlsScreen.hidden = !open;
  if (open) {
    CloseSettings();
    ui.controlsClose.focus({ preventScroll: true });
  } else if (!ui.titleScreen.hidden) FocusTitleMenu();
}
ui.controlsClose.addEventListener("click", () => OpenControls(false));
ui.btnHelp?.addEventListener("click", () => OpenControls(true));
// 点纸外面也收（同告示阅读层的老规矩）
ui.controlsScreen.addEventListener("pointerdown", (e) => {
  if (e.target === ui.controlsScreen) OpenControls(false);
});

// ── 确认框 ──────────────────────────────────────────────────────
let confirmAction = null;
function AskConfirm({ title, text, yes, onYes }) {
  confirmAction = onYes;
  ui.confirmTitle.textContent = title;
  ui.confirmText.textContent = text;
  ui.confirmYes.textContent = yes;
  ui.confirmOverlay.hidden = false;
  ui.confirmNo.focus({ preventScroll: true });   // 默认落在"取消"上：误触不该毁存档
}
function CloseConfirm() {
  confirmAction = null;
  ui.confirmOverlay.hidden = true;
  if (!ui.titleScreen.hidden) FocusTitleMenu();
}
ui.confirmYes.addEventListener("click", () => { const f = confirmAction; CloseConfirm(); f?.(); });
ui.confirmNo.addEventListener("click", CloseConfirm);

// ── 回到标题 ────────────────────────────────────────────────────
// 收工前把这一幕钉住（正常玩每进一幕都存过，这一下是给"玩到一半就走"兜底）
function ReturnToTitle() {
  WriteSave();
  soundtrack.StopBgm();
  audio.StopVoice();
  CloseSettings();
  ToggleDebug(false);
  ui.endScreen.hidden = true;
  state = null;
  ShowTitle();
}
ui.btnQuit?.addEventListener("click", ReturnToTitle);

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

// 选关的唯一入口（2026-08-17 起）：设置 → 调试。标题页上的「设置」也走这张面板，
// 所以在标题页上一样点得进来——线性剧情不给玩家跳关，做的人照旧一步到位。
// 点开调试就把设置收起来——两张面板都压在右上角，别叠着。
ui.btnDebug?.addEventListener("click", () => {
  CloseSettings();
  ToggleDebug(true);
});
ui.debugClose?.addEventListener("click", () => ToggleDebug(false));
// 动画工作台的入口也收在设置里（同调试面板：开发工具不常驻画面）
ui.btnAnim?.addEventListener("click", () => {
  CloseSettings();
  ToggleDebug(false);
  animLab?.Open();
});

// ── 人物美术样式浏览器（2026-08-17 用户要的）────────────────────────────
// 做的人用的东西，不是玩家 UI，所以入口藏在设置面板里（同调试面板）。
// 两条设计前提：
//   ① **画的必须是游戏里真用的那几支笔**（`ART.DrawHeadPart` / `DrawLimb` /
//      `DrawTorsoPart` / `DrawFootPart` / `DrawHandPart` / `DrawCharacter`），
//      不许另画一套示意图——不然"看的"和"跑的"是两回事，改完还得进游戏碰运气。
//   ② **墨线粗细必须按游戏的比例给**：骨头贴图是 PART_PPM=480、INK_K=3.2，
//      也就是 k = 3.2·r/(headR·480)。拿 k=1 预览会看着秀气、进游戏全糊——
//      脸改了八稿，五稿是栽在这上头（见 CLAUDE.md「脸」那一节第 1 条）。
// 右边那块「名目」把 kind / 中文名 / 画笔分支 / 文件位置一起列出来，就是为了
// 跟 AI 说话时一句话定位（"改 officer 的 crown"）。
const ART_SHEET = [
  { kind: "player", name: "柱子", role: "主角（半大孩子）", hair: "短发刘海",
    where: "HeadHair（short）", note: "第一章体型 0.75、头 ×1.34（HEAD_K）、身子 ×0.88、脸长 ×0.76。颅大脸短身子细" },
  { kind: "sister", name: "妹妹", role: "被护送者", hair: "短发刘海＋头顶抓髻＋红头绳",
    where: "HeadHair（child）", note: "一二章体型 0.60、头 ×1.52、身子 ×0.80、脸长 ×0.66。头顶那枚心情气泡主要给她" },
  { kind: "family", name: "娘", role: "主角的母亲", hair: "长发刘海＋项后一道布绳",
    where: "HeadHair（long）", note: "体型 0.90。蓝底白花的短褂是全章的暗线" },
  { kind: "father", name: "爹", role: "主角的父亲（木匠）", hair: "长发刘海",
    where: "HeadHair（long）", note: "体型 1.00" },
  { kind: "villager", name: "乡亲", role: "村里人（共用一套）", hair: "盘头巾（羊肚手巾）",
    where: "HeadScarf", note: "体型 0.95。全村共用一张贴图——要逐人不同得按 id 分缓存" },
  { kind: "militia", name: "民兵", role: "区小队 / 民兵", hair: "白毛巾",
    where: "DrawHeadPart 的 militia 分支", note: "体型 0.98" },
  { kind: "puppet", name: "伪军", role: "本乡人，不做丑角", hair: "黑大盖帽＋白帽墙＋漆皮檐",
    where: "DrawHeadPart 的 puppet 分支（crown/band/visor）",
    note: "体型 0.97。一身黑号衣＋褐皮斜带＋白裹腿＋黑布鞋；跟军官同是大盖帽，分开靠白帽墙与白裹腿这两道亮" },
  { kind: "soldier", name: "日军兵", role: "扫荡的兵", hair: "战斗帽＋帽垂",
    where: "DrawHeadPart 的 soldier 分支 + DrawCapFlap", note: "体型 0.99。帽垂是侧视认日军最硬的标志" },
  { kind: "officer", name: "军官（太君）", role: "带队的军官", hair: "大盖帽＋绯红帽墙＋星徽＋圆片眼镜＋卫生胡",
    where: "DrawHeadPart 的 officer 分支（crown/band/visor/stache）", note: "体型 0.98" },
];
let artPick = 0;

function BuildArtList() {
  if (!ui.artList || ui.artList.childElementCount) return;
  ART_SHEET.forEach((c, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<b>${c.name}</b><small>${c.kind}</small>`;
    b.addEventListener("click", () => { artPick = i; PaintArt(); });
    li.appendChild(b);
    ui.artList.appendChild(li);
  });
}

function PaintArt() {
  const cv = ui.artCanvas;
  if (!cv) return;
  const c = ART_SHEET[artPick];
  [...ui.artList.children].forEach((li, i) => li.firstChild.classList.toggle("on", i === artPick));
  // 画布按自己那格的实际大小重设（高分屏也要清楚）
  const box = cv.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(360, Math.round(box.width)), H = Math.max(260, Math.round(box.height));
  cv.width = W * dpr;
  cv.height = H * dpr;
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dark = !!ui.artDark?.checked;
  g.fillStyle = dark ? "#241f18" : "#cfc7b2";
  g.fillRect(0, 0, W, H);
  const zoom = (Number(ui.artZoom?.value) || 150) / 100;

  // ① 零件一排（上半）：躯干 / 上臂 / 前臂＋手 / 大腿 / 小腿 / 脚——就是骨架烘的那几张
  const P = 480, ik = 3.2;                    // PART_PPM / INK_K，跟 Script_Rig 一个数
  const sc = 0.46 * zoom;                     // 只是摆到画布上，线宽仍按 ik 给
  const [coat, coatDark] = ART.RIG_COLOR(c.kind);
  // box = [宽m, 高m, 枢轴u, 枢轴v]，跟 Script_Rig 的 Bake 调用一个数
  const parts = [
    ["躯干 DrawTorsoPart", c.kind === "officer" ? [0.418, 0.60, 0.653, 0.88] : [0.29, 0.60, 0.5, 0.88],
      (x, y) => ART.DrawTorsoPart(g, x, y, 0.29 * P * sc, 0.52 * P * sc, c.kind, "abt" + c.kind, ik * sc)],
    ["上臂 DrawLimb", [0.115, 0.25, 0.5, 0],
      (x, y) => ART.DrawLimb(g, x, y, 0.25 * P * sc, 0.115 * P * sc, 0.092 * P * sc, coat, "aba" + c.kind, { k: ik * sc })],
    ["前臂＋手", [0.15, 0.38, 0.5, 0], (x, y) => {
      ART.DrawLimb(g, x, y, 0.24 * P * sc, 0.092 * P * sc, 0.074 * P * sc, coat, "abf" + c.kind, { k: ik * sc });
      ART.DrawHandPart(g, x, y + 0.24 * P * sc, 0.044 * P * sc, ART.PAL.skin, "abh" + c.kind, { k: ik * sc, lw: 3 });
    }],
    ["大腿 DrawLimb", [0.145, 0.31, 0.5, 0],
      (x, y) => ART.DrawLimb(g, x, y, 0.31 * P * sc, 0.145 * P * sc, 0.112 * P * sc, coatDark, "abg" + c.kind, { k: ik * sc })],
    ["小腿 DrawShinPart", [0.12, 0.31, 0.5, 0],
      (x, y) => ART.DrawShinPart(g, x, y, 0.31 * P * sc, 0.112 * P * sc, 0.086 * P * sc, c.kind, "abs" + c.kind, { k: ik * sc })],
    ["脚 DrawFootPart", [0.31, 0.15, 0.22, 0],
      (x, y) => ART.DrawFootPart(g, x, y, 0.19 * P * sc, 0.09 * P * sc, ART.RIG_LEG(c.kind).footF, "abo" + c.kind, ik * sc)],
  ];
  const stepX = Math.max(60 * zoom, Math.min(92 * zoom, (W - 40) / parts.length));
  let px2 = 30 + 0.2 * P * sc;
  const topY = Math.min(H * 0.40, 0.88 * 0.60 * P * sc + 12);   // 躯干枢轴在 0.88 高处，顶上得留得下它
  const pad = 10 * ik * sc;                   // 同 BakePart：留给墨线抖动的边
  for (const [label, box, draw] of parts) {
    const [bw, bh, pu, pv] = box;
    g.save();
    g.beginPath();
    g.rect(px2 - pu * bw * P * sc - pad, topY - pv * bh * P * sc - pad,
      bw * P * sc + pad * 2, bh * P * sc + pad * 2);
    g.clip();
    draw(px2, topY);
    g.restore();
    Label(g, px2, topY + 0.36 * P * sc + 26, label, dark);
    px2 += stepX;
  }

  // ② 头（下半左）：**按游戏的线宽比例**给 k（见上头第 ② 条）
  const rowY = topY + 0.36 * P * sc + 44;     // 零件那一排的下沿
  // 发髻/大盖帽往上长到 2.5 个头半径，帽垂/长发往下也过下巴——按这个高度给它留地方，
  // 别顶到零件那一排的标签
  const hr = Math.max(20, Math.min(74 * zoom, (H - rowY) * 0.27));   // 面板还没量出高度时也不许给负半径
  const hk = 3.2 * hr / (RIG_BONE.headR * 480);
  const headX = 30 + hr * 1.3, headY = rowY + hr * 2.55 + 4;
  g.save();
  g.translate(headX, headY);
  ART.DrawHeadPart(g, 0, 0, hr, c.kind, "ab" + c.kind, hk);
  g.restore();
  Label(g, headX, Math.min(H - 8, headY + hr * 1.25 + 12), "头 DrawHeadPart", dark);

  // ③ 整身的平贴图（HUD 牌面与背景乡亲用的那一张，下半右）：跟骨架不是同一支笔，
  // 所以放在同一张纸上看——两处得对得上，不然"牌上是甲、路上是乙"。
  // 骨架那具真整身在右栏（artRig）里动着，这里只管平贴图那一版
  const flatH = Math.max(90, (H - rowY) * 0.86);       // 立姿总高（像素）；DrawCharacter 的 H = 62·S
  const flatS = flatH / 62;
  const flatX = Math.max(headX + hr * 1.6 + flatH * 0.35, W * 0.62);
  g.save();
  g.translate(flatX, rowY + (H - rowY) * 0.94);
  // DrawCharacter 收的是 spec.scale（老版传的 S 根本没人读，所以整身一直是 62px 的小人）
  ART.DrawCharacter(g, { x: 0, y: 0, scale: flatS, kind: c.kind, id: "abc" + c.kind, facing: 1 });
  g.restore();
  Label(g, flatX, Math.min(H - 8, rowY + (H - rowY) * 0.94 + 16), "整身 DrawCharacter（平贴图：牌面 / 背景乡亲）", dark);

  ui.artMeta.innerHTML = `
    <div class="artRow"><span>kind</span><div><code>${c.kind}</code> · <b>${c.name}</b></div></div>
    <div class="artRow"><span>角色</span><div>${c.role}</div></div>
    <div class="artRow"><span>头饰</span><div>${c.hair}</div></div>
    <div class="artRow"><span>画笔</span><div><code>${c.where}</code></div></div>
    <div class="artRow"><span>文件</span><div><code>Script_Art.mjs</code> · 骨架装配 <code>Script_Rig.mjs</code></div></div>
    <div class="artRow"><span>备注</span><div>${c.note}</div></div>`;
  SyncArtRig();
}

// ── 整身·骨架实时（右栏）：CreateRig 那具真骨架按这个人在戏里的体型跑他自己的动作
// （2026-08-17 用户：「整身的样子有点小，而且不能预览动作」）。舞台与动画工作台共用
// 一层（Script_AnimLab.CreateRigStage / EnsureAnimIndex），所以看到的就是游戏里那条动画；
// 步态谁都会走所以全给，轨道/姿势按剧本里谁在用挑。想逐帧看：「工作台 ▸」带着这条过去。
const artStage = ui.artRigCanvas ? CreateRigStage({ canvas: ui.artRigCanvas, groundAt: 0.14 }) : null;   // 画框按人的个头给
let artAnimId = "loco:walk";       // 换人时尽量沿用同一条（走路谁都有）
let artRigSync = 0, artRigKind = null;
async function SyncArtRig() {
  if (!artStage || !ui.artAnim) return;
  const c = ART_SHEET[artPick];
  const preset = DefaultPreset(c.kind);
  artStage.SetKind(c.kind, preset ? preset.scale : 1);
  if (artRigKind === c.kind && ui.artAnim.options.length) return;   // 只是改了大小/底色：清单不用重搭
  artRigKind = c.kind;
  const seq = ++artRigSync;
  ui.artRigNote.textContent = "扫描动作清单…";
  const { entries, byId, index } = await EnsureAnimIndex();
  if (seq !== artRigSync) return;                    // 期间又换了人
  const mine = EntriesForKind(entries, c.kind);
  const groups = [["步态", mine.loco], [`轨道 · 剧本里 ${c.name} 用到的`, mine.tracks], [`姿势 · 剧本里 ${c.name} 用到的`, mine.poses]];
  ui.artAnim.innerHTML = groups.filter(([, list]) => list.length).map(([title, list]) =>
    `<optgroup label="${EscapeHtml(title)}（${list.length}）">${list.map((e) => {
      const meta = e.type === "track" ? `${e.dur.toFixed(2)}s ${e.loop ? "循环" : "单次"}` : e.type === "pose" ? (e.progress ? "进度" : "静态") : "";
      return `<option value="${EscapeHtml(e.id)}">${EscapeHtml(e.label)}${meta ? " · " + meta : ""}</option>`;
    }).join("")}</optgroup>`).join("");
  if (!byId.has(artAnimId) || ![...mine.loco, ...mine.tracks, ...mine.poses].some((e) => e.id === artAnimId)) artAnimId = "loco:walk";
  ui.artAnim.value = artAnimId;
  const entry = byId.get(artAnimId);
  if (entry) artStage.SetEntry(entry);
  artStage.Playing(true);
  SyncArtRigNote(entry, index);
}
function SyncArtRigNote(entry, index) {
  if (!ui.artRigNote) return;
  const c = ART_SHEET[artPick];
  const preset = DefaultPreset(c.kind);
  const cyc = artStage ? artStage.Cycle() : 0;
  ui.artRigNote.textContent = entry
    ? `${FormatRef(entry)}\n体型 ${preset ? preset.scale : 1}（戏里现在的尺寸）· 一圈 ${cyc.toFixed(2)}s · ${index?.offline ? "离线：清单只有运行时的" : "空格 播放/暂停 · ←→ 换动作 · ↑↓ 换人 · H 翻朝向"}`
    : "";
  if (ui.artPlay) ui.artPlay.textContent = artStage && artStage.Playing() ? "❚❚" : "▶";
}
function ArtAnimStep(dir) {
  const opts = ui.artAnim ? [...ui.artAnim.options] : [];
  if (!opts.length) return;
  const at = Math.max(0, opts.findIndex((o) => o.value === artAnimId));
  const next = opts[(at + dir + opts.length) % opts.length];
  ui.artAnim.value = next.value;
  ui.artAnim.dispatchEvent(new Event("change"));
}
ui.artAnim?.addEventListener("change", async () => {
  if (!ui.artAnim.value) return;
  artAnimId = ui.artAnim.value;
  const { byId, index } = await EnsureAnimIndex();
  const entry = byId.get(artAnimId);
  if (entry && artStage) { artStage.SetEntry(entry); artStage.Playing(true); }
  SyncArtRigNote(entry, index);
});
ui.artPlay?.addEventListener("click", () => { if (artStage) { artStage.Playing(!artStage.Playing()); ui.artPlay.textContent = artStage.Playing() ? "❚❚" : "▶"; } });
ui.artFlip?.addEventListener("click", () => artStage?.Flip());
ui.artToLab?.addEventListener("click", async () => {
  if (!animLab) return;
  const c = ART_SHEET[artPick];
  const preset = DefaultPreset(c.kind);
  OpenArt(false);
  await animLab.Open(artAnimId);
  if (preset) animLab.SetKind(preset.key);
});
// 面板开着时键盘归它：Esc 关、空格播放/暂停、←→ 换动作、↑↓ 换人、H 翻朝向
function ArtKey(e, k) {
  const tag = e.target && e.target.tagName;
  if (tag === "SELECT" || tag === "INPUT") { if (k === "escape") { e.target.blur(); return true; } return true; }
  if (k === "escape") { OpenArt(false); e.preventDefault(); return true; }
  if (k === " ") { ui.artPlay?.click(); e.preventDefault(); return true; }
  if (k === "arrowright") { ArtAnimStep(1); e.preventDefault(); return true; }
  if (k === "arrowleft") { ArtAnimStep(-1); e.preventDefault(); return true; }
  if (k === "arrowdown" || k === "arrowup") { artPick = (artPick + (k === "arrowdown" ? 1 : -1) + ART_SHEET.length) % ART_SHEET.length; PaintArt(); e.preventDefault(); return true; }
  if (k === "h") { artStage?.Flip(); return true; }
  return true;
}

function Label(g, x, y, text, dark) {
  g.save();
  g.font = "13px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillStyle = dark ? "rgba(226,216,192,0.72)" : "rgba(52,42,30,0.72)";
  g.fillText(text, x, y);
  g.restore();
}

function OpenArt(open) {
  if (!ui.artBrowser) return;
  ui.artBrowser.hidden = !open;
  if (open) {
    CloseSettings();
    BuildArtList();
    PaintArt();
    ui.artClose?.focus({ preventScroll: true });
  }
}
ui.btnArt?.addEventListener("click", () => OpenArt(true));
ui.artClose?.addEventListener("click", () => OpenArt(false));
ui.artZoom?.addEventListener("input", PaintArt);
ui.artDark?.addEventListener("change", PaintArt);
// 点面板外面也收（同告示阅读层的老规矩）
ui.artBrowser?.addEventListener("pointerdown", (e) => {
  if (e.target === ui.artBrowser) OpenArt(false);
});



function StartGame(chapterIndex) {
  state = CreateGame(chapterIndex);
  // 包袱跨章跨会话：把存过的收藏灌回来
  state.relicsGot = new Set(LoadBag());
  RebuildBagStrip();
  lastSaveKey = "";        // 新一局：头一幕也要落盘（不清的话它跟上一局同号，白等一幕）
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

// 这张面板在游戏里**就是暂停菜单**：开着的时候世界停住（见 RunFrame 的
// MenuFrozen），所以「操作说明」「回到标题」两条也住在这儿。不停的话，玩家
// 在车铃那一拍点开设置就等于站在伪军跟前发呆——那一拍是全章唯一会失败的。
// 标题页上点「设置」走同一张面板，只是要压过标题页（.overTitle）。
function OpenSettings(open) {
  if (!ui.settingsPanel) return;
  ui.settingsPanel.hidden = !open;
  ui.settingsPanel.classList.toggle("overTitle", open && !ui.titleScreen.hidden);
  ui.btnSettings?.setAttribute("aria-expanded", open ? "true" : "false");
  if (!open && !ui.titleScreen.hidden) FocusTitleMenu();
}
function CloseSettings() { OpenSettings(false); }
function SettingsOpen() { return ui.settingsPanel && !ui.settingsPanel.hidden; }
if (ui.btnSettings) {
  ui.btnSettings.addEventListener("click", () => OpenSettings(!SettingsOpen()));
  // 点面板以外的地方就收起来
  document.addEventListener("pointerdown", (e) => {
    if (!SettingsOpen()) return;
    if (ui.settingsPanel.contains(e.target) || ui.btnSettings.contains(e.target)) return;
    CloseSettings();
  });
}

// ── 包袱（收藏品）──────────────────────────────────────────────
// 跨章、跨会话持久：localStorage 存 id 列表；StartGame 每次灌回 state。
// Core 只管拾取与冻结，条与卡全在这儿。
const BAG_KEY = "tunnelLight1943.bag.v1";
function LoadBag() {
  try { return JSON.parse(localStorage.getItem(BAG_KEY) || "[]"); } catch { return []; }
}
function SaveBag() {
  if (state?.relicsGot) localStorage.setItem(BAG_KEY, JSON.stringify([...state.relicsGot]));
}
const BAG_ALL = AllRelics();
let bagSelected = null;
let bagPeekTimer = 0;
let bagLastCardSeq = 0;
// 格子里的小图：同一支画笔，收到的画真身、没收到的画剪影（形状即提示）
function PaintBagSlot(canvas, relic, got) {
  const ss = 2, w = 46;
  canvas.width = w * ss;
  canvas.height = w * ss;
  const ctx = canvas.getContext("2d");
  ctx.scale(ss, ss);
  DrawRelic(ctx, w / 2, w * 0.82, relic.art, "bag" + relic.id, { sil: !got, k: 1.35 });
}
function RebuildBagStrip(freshId = null) {
  if (!ui.bagStrip) return;
  ui.bagStrip.textContent = "";
  const got = state?.relicsGot || new Set();
  for (const r of BAG_ALL) {
    const li = document.createElement("li");
    const has = got.has(r.id);
    li.className = (has ? "" : "miss") + (r.id === freshId ? " fresh" : "") + (r.id === bagSelected ? " sel" : "");
    li.title = has ? r.name : "？？？";
    const cv = document.createElement("canvas");
    PaintBagSlot(cv, r, has);
    li.appendChild(cv);
    li.addEventListener("click", (e) => { e.stopPropagation(); SelectBagSlot(r.id); });
    ui.bagStrip.appendChild(li);
  }
  if (ui.bagBadge) {
    ui.bagBadge.hidden = got.size === 0;
    ui.bagBadge.textContent = String(got.size);
  }
}
function SelectBagSlot(id) {
  bagSelected = id;
  const r = BAG_ALL.find((x) => x.id === id);
  const has = state?.relicsGot?.has(id);
  if (ui.bagNote && r) {
    ui.bagNote.hidden = false;
    ui.bagNoteName.textContent = has ? r.name : "？？？";
    ui.bagNoteText.textContent = has ? r.note : "还没找到。留意路边不起眼的角落——草丛后头常有东西。";
    ui.bagNoteCount.textContent = `老物件 ${state?.relicsGot?.size || 0} / ${BAG_ALL.length}`;
  }
  RebuildBagStrip();
}
function OpenBag(open) {
  if (!ui.bagPanel) return;
  if (open) {
    clearTimeout(bagPeekTimer);
    RebuildBagStrip();
    ui.bagPanel.hidden = false;
    // open ≠ show：show 是"滑进来了"（探头也会加），open 是"玩家真打开了"。
    // 只有 open 那一档才接管触摸——探头期间世界还在跑，纸带不许截拇指
    ui.bagPanel.classList.add("open");
    requestAnimationFrame(() => ui.bagPanel.classList.add("show"));
    if (bagSelected) SelectBagSlot(bagSelected);
    if (state) state.bagOpen = true;      // 世界冻结（Core 的闸）
  } else {
    ui.bagPanel.classList.remove("show", "open");
    ui.bagPanel.hidden = true;
    ui.bagNote.hidden = true;
    if (state) state.bagOpen = false;
  }
  ui.btnBag?.setAttribute("aria-expanded", open ? "true" : "false");
}
// 收到新东西：条自己滑进来亮一下那格，几秒后退场（不冻结世界）
function PeekBag(freshId) {
  if (!ui.bagPanel || !ui.bagPanel.hidden) return;
  RebuildBagStrip(freshId);
  ui.bagNote.hidden = true;
  ui.bagPanel.hidden = false;
  requestAnimationFrame(() => ui.bagPanel.classList.add("show"));
  clearTimeout(bagPeekTimer);
  bagPeekTimer = setTimeout(() => {
    if (state?.bagOpen) return;          // 其间被玩家点开了就别收
    ui.bagPanel.classList.remove("show", "open");
    ui.bagPanel.hidden = true;
  }, 3200);
}
// 开合看的是 bagOpen 不是面板可见性：拾取后的"探头"（peek）也可见但没打开，
// 那时点按钮该是**打开**，按可见性判断会反手把它关了
ui.btnBag?.addEventListener("click", () => OpenBag(!state?.bagOpen));
document.addEventListener("pointerdown", (e) => {
  if (!ui.bagPanel || ui.bagPanel.hidden || !state?.bagOpen) return;
  if (ui.bagPanel.contains(e.target) || ui.btnBag.contains(e.target)) return;
  OpenBag(false);
});
window.addEventListener("keydown", (e) => {
  if (e.key === "b" || e.key === "B") {
    // 菜单开着时不叠第二张面板（设置面板已经把世界停住了）
    if (state && state.phase === "playing" && !MenuFrozen()) OpenBag(!state.bagOpen);
  }
});

// 序章跳过：整段结算掉直接进正戏；正在念的旁白同时收声
ui.btnSkipCine?.addEventListener("click", () => {
  if (state && SkipPrologue(state)) audio.StopVoice();
});


// ---------------------------------------------------------------------------
// 征夫告示阅读层：一张程序化画出来的纸（画笔在 Art.DrawNoticeSheet）
//
// 纸**竖长优先**（0.72）：1942 年贴墙的告示就是这个形，而且竖纸在 16:9 上正好
// 把画高吃满、字最大，两边空出来的地方留给压暗的村子——本来就该看得见。
// 只有画高矮到装不下的那一档才摊宽（见下面的 aspect），那是量出来的，不是选的。
//
// 只在**打开时与画框变了时**重画：这张纸没有一帧一帧的动画，逐帧重画一张
// 两千像素的画布纯属白烧。
// ---------------------------------------------------------------------------
let noticePainted = "";
let noticeMetrics = null;
function PaintNoticeSheet() {
  const cv = ui.noticeSheet;
  if (!cv) return;
  const availW = Math.max(120, window.innerWidth * 0.94);
  const availH = Math.max(120, window.innerHeight * 0.94);
  // 纸的形状：**竖长优先**（0.72）——那年头贴墙的告示就是竖的，而在 16:9 上
  // 竖纸正好把画高吃满，字最大。只有画高矮到装不下的那一档（横屏手机 390px）
  // 才把纸摊宽：实拍量过，竖纸在 844×390 上只有 264px 宽，字缩到 **6px**，
  // 谁也读不了；摊到跟画框同形之后回到 17px 上下。
  // **判据用画高不用画宽**（同"拇指落点"那条：竖着的东西撞的是高度）。
  const aspect = availH >= 560 ? 0.72 : Math.min(1.75, availW / availH);
  let h = availH, w = h * aspect;
  if (w > availW) { w = availW; h = w / aspect; }
  // 超采样：这张纸上全是要玩家盯着读的小字（同 HUD 那条规矩）。
  // 封到 3 是画布尺寸的现实上限——再高在手机上就该丢显存了
  const ss = Math.min(3, Math.max(1, window.devicePixelRatio || 1) * 1.5);
  const key = `${Math.round(w)}x${Math.round(h)}@${ss.toFixed(2)}`;
  if (key === noticePainted) return;
  noticePainted = key;
  cv.style.width = `${Math.round(w)}px`;
  cv.style.height = `${Math.round(h)}px`;
  cv.width = Math.round(w * ss);
  cv.height = Math.round(h * ss);
  const ctx = cv.getContext("2d");
  ctx.setTransform(ss, 0, 0, ss, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // 量出来的字号留给测试（单位是 CSS 像素，跟玩家眼睛看到的一致）
  noticeMetrics = DrawNoticeSheet(ctx, w, h, ZHENGFU_NOTICE);
}
// 字体后到（Google Fonts 走 unicode-range 分片，CJK 那几片是异步取的）：
// 不重画一次，玩家第一次打开看到的是 SimSun 顶上来的替身——一张 1942 年的
// 告示排着一身假宋体，前功尽弃
document.fonts?.ready?.then(() => { noticePainted = ""; if (state?.noticeOpen) PaintNoticeSheet(); });
window.addEventListener("resize", () => { if (state?.noticeOpen) PaintNoticeSheet(); });
ui.noticeClose?.addEventListener("click", () => { if (state) state.noticeOpen = false; });

ui.endRestart.addEventListener("click", ReturnToTitle);

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------
let state = null;
let lastT = performance.now();
// 上一次存下来的是哪一幕（换幕才写盘，见 RunFrame）
let lastSaveKey = "";
// 暂停：菜单类面板开着的时候世界停住。**包袱与告示不在此列**——那两样是
// Core 自己的闸（state.bagOpen / noticeOpen），它们还要靠 StepGame 收 E 键关掉。
function MenuFrozen() {
  // 两块全屏工作台（动画工作台 / 人物美术样式）也算菜单：开着的时候世界停住
  return SettingsOpen() || !ui.controlsScreen.hidden || !ui.confirmOverlay.hidden
    || AnimLabOpen() || !(ui.artBrowser?.hidden ?? true);
}

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
  // 暂停得让人看得出来：压暗画布（CSS 的 body.paused）。不压的话画面照旧鲜亮，
  // 读起来是"游戏还在跑，只是弹了个面板"。每帧同步，省得漏掉某个开合的路口。
  document.body.classList.toggle("paused", !!state && MenuFrozen());
  if (state) {
    const move = state.phase === "playing" ? ReadInput() : { moveX: 0, climb: 0 };
    const def = CurrentBeatDef(state);
    // ?fast=1 是给自动截图/测试用的快进。开着声音时不生效——否则过场以 5 倍速
    // 推进、旁白还在正常语速念，每句都被切在半截，看上去就像"台词没说完就切镜头"
    // 那个老毛病又回来了。快进与听旁白本来就是互斥的两件事。
    const stepDt = (fastCinematic && !soundOn && def?.kind === "cinematic") ? dt * 5 : dt;
    const prevChapter = state.chapterIndex;
    // 收藏品拾取：Core 出一张卡（带递增 seq），这儿存档 + 让包袱条探头
    if (state.relicCard && state.relicCard.seq !== bagLastCardSeq) {
      bagLastCardSeq = state.relicCard.seq;
      SaveBag();
      PeekBag(state.relicCard.id);
    }
    // 冻帧（只给实拍用，见 TunnelLight.Freeze）：**游戏钟停住、渲染照跑**。
    // 截图要的是"某一拍第几秒"那一格，可镜头缓动、立面淡出、光照换挡都得真的
    // 渲染几帧才追得上——不冻帧的话，等渲染追上的那半秒里游戏又往前走了，
    // 截出来的根本不是那一格（妹妹睡姿那次为此白跑了十几轮）。
    // 暂停（设置/操作说明/确认框开着）走的是同一条路：世界停住、画面照渲。
    if (!frozen && !MenuFrozen()) {
      const input = {
        moveX: move.moveX, climb: move.climb,
        crouch: crouchToggle,
        interact: interactEdge,
        interactHeld: keys.has("e") || touch.act,
        // 沉浸式手势：pull=本帧竖向拖动（+下 −上，归一化），
        // pointerWorld=指尖的世界坐标，pointerCard=指尖落在特写卡上的位置。
        // 这里没有 dragX 那样的"横向位移量"通道——位移量拖哪儿都涨，本质上
        // 就是根看不见的 slider（刨料曾用它，已改成攥住刨子本身），别加回来。
        pull: gest.active ? gest.dy : 0,
        pullHeld: gest.active,
        pointerHeld: gest.active,
        pointerWorld: gest.world,
        pointerCard: gest.card,
        tap: tapEdge,
        // 试玩收尾那块牌子上点一下不能把人送进第二章（见 DemoEnd）
        advance: advanceEdge && !DemoEnd(state),
      };
      // 倍速（过场时间轴）：拆成子步，一次性的按键只喂第一步
      const sub = playSpeed > 2 ? Math.ceil(playSpeed / 2) : 1;
      for (let i = 0; i < sub; i += 1) {
        StepGame(state, i === 0 ? input : { ...input, interact: false, tap: false, advance: false }, stepDt * playSpeed / sub);
      }
    }
    gest.dy = 0;
    if (state.chapterIndex !== prevChapter) {
      camSnap = true; crouchToggle = false; irisLevel = 0; irisClosing = false;
      framing = { key: "", prog: 0, baseHw: 7.2 };
    }
    // 自动存档：**换幕就存**。幕是这作品天然的检查点（每一幕自带一条目标，
    // 前序又能按脚本结算回来），所以存档不必自己再造一套检查点。
    // 调试跳幕落地的那一幕也照存——跳过去以后玩的就是那儿，两套规矩反而费解。
    const saveKey = `${state.chapterIndex}/${state.beatIndex}`;
    if (saveKey !== lastSaveKey) {
      lastSaveKey = saveKey;
      WriteSave();
    }

    world.BuildEnvironment(state);
    world.UpdateActors(state, now / 1000, dt);
    world.UpdateProps(state, now / 1000, dt);
    const shotFade = UpdateCamera(state, dt);
    StepIris(state, dt);
    SyncHud(state, dt, shotFade);
    // 过场时间轴要在 soundtrack.Step 之前看一眼 cues（它每帧把队列清空）
    cineTimeline.Frame();
    soundtrack.Step(state, dt);
    SyncDebugPanel();
  }
  // 动画工作台开着：它铺满整屏，主画面不用画（省一整帧 GPU），改画它那块
  if (AnimLabOpen()) animLab.Step(dt);
  else {
    // 后果小窗一起交给 Render：全局分级要连它一块儿过，不然那块角落是全屏
    // 唯一没走后期的地方（见 World 的 Render 注释）
    world.Render(pipRect);
    // 人物美术样式浏览器开着：右栏那具骨架要动
    if (artStage && ui.artBrowser && !ui.artBrowser.hidden) artStage.Step(dt);
  }
  interactEdge = false;
  advanceEdge = false;
  tapEdge = false;
}

// 画面被拉伸，十有八九是**画布缓冲的长宽比跟 CSS 盒对不上**：WebGL 的
// drawing buffer 是一张固定尺寸的图，浏览器把它拉满 `width:100%;height:100%`
// 的盒子——盒子的比例一变而缓冲没跟着改，整幅画就横着抻开（或竖着压扁）。
//
// 手机上这件事**不只在 `resize` 时发生**（2026-08-13 用户报「移动端横屏会被
// 拉伸」）：iOS/Android 的地址栏收起、系统手势条让位、旋转后的两段式布局、
// 分屏与画中画，都会改这个盒子，而 `window.resize` 要么不发、要么发得比布局早
// 一拍（老版为此在 orientationchange 上挂了 200ms 的 setTimeout——那是在赌）。
//
// 所以改成**盯着画布这个元素本身**：ResizeObserver 在盒子真的变了之后才回调，
// 谁改的、为什么改一概不用管；visualViewport 那两条补上 iOS 收/放地址栏时
// 盒子没变、但可视区变了的那一档。尺寸取 `getBoundingClientRect()` 的**分数**
// 值——`clientWidth` 是取整过的，2.17:1 这种比例上取整会引进零点几个百分点的
// 偏差，正是"看着有点不对劲又说不上哪儿不对"。
let lastCssW = 0, lastCssH = 0;
function Resize() {
  const r = canvas.getBoundingClientRect();
  const w = r.width || canvas.clientWidth || window.innerWidth;
  const h = r.height || canvas.clientHeight || window.innerHeight;
  if (!(w > 0 && h > 0)) return;              // 布局还没落地：这一次不算数
  if (Math.abs(w - lastCssW) < 0.5 && Math.abs(h - lastCssH) < 0.5) return;
  lastCssW = w; lastCssH = h;
  world.Resize(w, h);
  CheckOrientation();
}
window.addEventListener("resize", Resize);
window.addEventListener("orientationchange", () => setTimeout(Resize, 200));
if (typeof ResizeObserver === "function") {
  new ResizeObserver(Resize).observe(canvas);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", Resize);
  window.visualViewport.addEventListener("scroll", Resize);
}
SetupTouch();
Resize();
ShowTitle();

const chapterParam = parseInt(params.get("chapter") || "0", 10);
const beatParam = parseInt(params.get("beat") || "0", 10);
if (chapterParam >= 1 && chapterParam <= CHAPTERS.length) {
  StartGame(chapterParam - 1);
  // ?beat=N 直接落到第 N 幕（1 起算），配合调试面板用
  if (beatParam >= 1) JumpToBeat(chapterParam - 1, beatParam - 1);
}
if (params.get("debug") === "1") ToggleDebug(true);
// ?anim=1 打开动画工作台；?anim=scoopChild 直接选中那一条
if (params.get("anim") !== null && animLab) {
  const want = params.get("anim");
  animLab.Open(want && want !== "1" ? want : undefined);
}

// 过场时间轴（底栏，Unity Timeline 式）。它不改剧本，只把"演到哪儿"变成能指着
// 说的东西：拖到哪一格游戏就推到哪一格并冻住，「复制定位」给出的
// `c1_xx@line=N,at=T` 正是 shot 子命令吃的那一串。
const cineTimeline = CreateCineTimeline({
  getState: () => state,
  JumpToBeat,
  Freeze: (v) => { frozen = !!v; },
  IsFrozen: () => frozen,
  MenuFrozen,
  SetSpeed: (k) => { playSpeed = Math.max(0.1, Math.min(8, Number(k) || 1)); },
  GetSpeed: () => playSpeed,
  Settle: (n) => window.TunnelLight.Settle(n),
  world,
  canvas,
  getCam: () => cam,
});
ui.btnCine?.addEventListener("click", () => { CloseSettings(); cineTimeline.Toggle(true); });
if (params.get("cine") === "1") cineTimeline.Toggle(true);

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
  // 动画工作台：Open(name?) / Close / Select / Seek / Play / SetKind / LimbTips / Ref / Entries
  AnimLab: animLab,
  // 人物美术样式浏览器：Open(v) / Pick(kind|序号) / Anim(id) / Stage（右栏那具骨架的小舞台）
  ArtBrowser: {
    Open: (v = true) => OpenArt(v),
    Pick: (who) => {
      const i = typeof who === "number" ? who : ART_SHEET.findIndex((c) => c.kind === who || c.name === who);
      if (i < 0) return false;
      artPick = i; PaintArt(); return true;
    },
    // 任何一条动作都能塞给任何人看（不是这个人的就挂到「其他」组里）
    Anim: async (id) => {
      const { byId } = await EnsureAnimIndex();
      if (!ui.artAnim || !byId.has(id)) return false;
      if (![...ui.artAnim.options].some((o) => o.value === id)) {
        let og = ui.artAnim.querySelector('optgroup[data-other]');
        if (!og) { og = document.createElement("optgroup"); og.label = "其他（不是这个人的）"; og.dataset.other = "1"; ui.artAnim.appendChild(og); }
        const e = byId.get(id);
        const opt = document.createElement("option"); opt.value = id; opt.textContent = e.label; og.appendChild(opt);
      }
      ui.artAnim.value = id;
      ui.artAnim.dispatchEvent(new Event("change"));
      return true;
    },
    Stage: artStage,
    Ready: () => !!(ui.artAnim && ui.artAnim.options.length),
  },
  // 征夫告示那张纸这一档排出来的字号／列数（CSS 像素）。给渲染健康测试用：
  // 字小到认不出是这张纸唯一验得了对错的事
  NoticeMetrics: () => { PaintNoticeSheet(); return noticeMetrics; },
  GetBgmState: () => audio.GetBgmState(),
  // 采样音效包装了几个（0 = 全靠合成器兜底）
  SfxPackSize: () => audio.SfxPackSize(),
  Sfx: (name, opts) => audio.Sfx(name, opts),
  // 冻帧：游戏钟停住、渲染照跑。实拍要"某一拍第几秒"那一格时，先把游戏推到位
  // （StepFrames），再 Freeze(true) 让镜头/立面/光照渲染追上来，然后截图。
  Freeze: (v = true) => { frozen = !!v; return frozen; },
  // 过场时间轴（F3 那张面板）的钩子：开合 / 定位串 / 复制给 agent 的那段文本
  CineTimeline: {
    Toggle: (v) => cineTimeline.Toggle(v),
    IsOpen: () => cineTimeline.IsOpen(),
    Seek: (line, at) => cineTimeline.Seek(line, at),
    SeekTime: (t) => cineTimeline.SeekTime(t),
    Locator: () => cineTimeline.Locator(),
    SetSpeed: (k) => { playSpeed = Math.max(0.1, Math.min(8, Number(k) || 1)); return playSpeed; },
  },
  // 把游戏推到"第 line 句台词的第 at 秒"。实拍最常要的就是这个，别再拿 --dur
  // 一秒一秒地猜（猜出来的还随机器快慢漂）。返回真正落在哪儿。
  // 微过场（chain 步骤 effect 里起的那种）同样认这把尺子：微过场在跑的时候
  // 数的是 microCine.i，不是 beat.lineIndex——不然 @line= 打在窖里那段抓腕戏上
  // 会一直空转到超时（2026-08-14）。
  SeekLine: (line, at = 0) => {
    if (!state) return null;
    if (state.microCine) {
      for (let i = 0; i < 20000 && state.microCine && (state.microCine.i ?? 0) < line; i += 1) {
        StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false }, 1 / 30);
      }
      for (let i = 0; i < Math.round(at * 30); i += 1) {
        StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false }, 1 / 30);
      }
      return { line: state.microCine?.i ?? null, lineT: state.microCine?.t ?? null, micro: true };
    }
    for (let i = 0; i < 20000 && (state.beat?.lineIndex ?? 0) < line; i += 1) {
      StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false }, 1 / 30);
    }
    for (let i = 0; i < Math.round(at * 30); i += 1) {
      StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false }, 1 / 30);
    }
    return { line: state.beat?.lineIndex, lineT: state.beat?.lineT };
  },
  // 世界坐标 → 屏幕像素（实拍要裁一块近景看清楚时用）。ScreenToWorld 的逆。
  ScreenXY: (wx, wy) => {
    const a = world.ScreenToWorld(200, 300), b = world.ScreenToWorld(1400, 800);
    if (!a || !b) return null;
    const kx = (b.x - a.x) / 1200, ky = (b.y - a.y) / 500;
    return { x: 200 + (wx - a.x) / kx, y: 300 + (wy - a.y) / ky };
  },
  StepFrames: (n, input = {}) => {
    if (!state) return;
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false, ...input,
      }, 1 / 30);
    }
  },
  // 只推**渲染侧**的每帧更新，游戏钟不动（2026-08-13 加）。
  //
  // StepFrames 推的只是 StepGame；镜头缓动、立面淡出、**昼夜换挡（2.6 秒）**、
  // 板缝光柱的亮度吸附全都活在渲染这一侧，只在 rAF 真的跑一帧时才前进——
  // 而无头浏览器没有合成器，rAF 慢到几乎不动（实测 --hold e --dur 12 之后
  // 游戏钟只走了 0.58 秒）。于是"推完 dur 再截图"拍到的是**过渡刚开始**
  // 那一格：窖里该黑的还亮着，光柱该亮的还没起来，看图的人会判成"没做出来"。
  // 截图前把这边也推够数，`--dur` 才真是"这一拍走到第几秒"。
  Settle: (n = 90, dt = 1 / 30) => {
    if (!state) return;
    for (let i = 0; i < n; i += 1) {
      const now = performance.now() / 1000 + i * dt;
      world.BuildEnvironment(state);
      world.UpdateActors(state, now, dt);
      world.UpdateProps(state, now, dt);
      // HUD 这一层同样只在 rAF 里走：收黑罩的不透明度就长在 SyncHud 里，
      // 不推它的话实拍永远拍到"正在收黑"那一格（量出来 0.96，看图的人会
      // 判成"黑屏不黑到底"——2026-08-14 差点又照着这张图去改数值）
      SyncHud(state, dt, UpdateCamera(state, dt));
      StepIris(state, dt);
    }
  },
  // 转场的圆形黑幕拉开了没有（0 全黑 → 1 全开）。跳幕之后要等它拉开再截图，
  // 不然拍出来是个圆洞——Script_Cli 的 shot 靠轮询这个值定拍摄时机，
  // 比"死等 0.6 秒"稳（等待时间随机器快慢变，猜不准）
  get iris() { return irisLevel; },
  world,
  renderer: world.renderer,
};
