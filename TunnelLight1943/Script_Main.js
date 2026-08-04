// 《地道里的光》 —— 主循环：横版输入（键盘 + 移动端触屏）、
// 镜头语法（硬切 / 慢推 / 横移 / 过肩正反打 / 插入特写）、HUD。
import {
  GAME_VERSION, CHAPTERS, SURFACE_Y, UNDER_Y, CreateGame, StepGame,
  CurrentBeatDef, MakeChoice, GetObjective, GetHint,
} from "./Script_Core.mjs";
import { CreateWorld } from "./Script_World.js";
import { CreateSoundtrack } from "./Script_Soundtrack.js";

const canvas = document.getElementById("gameCanvas");
const world = CreateWorld(canvas);
// 声音是增强项，不是依赖：合成器加载失败（旧浏览器、被拦的 WebAudio、
// 资源没部署上去）时游戏必须照常能玩，所以走动态 import + 静音替身。
const SILENT = {
  Unlock() {}, SetEnabled() {}, IsEnabled: () => false, SetMasterVolume() {},
  SetMood() {}, Sfx() {}, Duck() {}, StopVoice() {}, Update() {}, Dispose() {},
  PlayVoice: () => Promise.resolve(),
};
let audio = SILENT;
const soundtrack = CreateSoundtrack({
  // 转发到当前的 audio 实例：合成器是异步到位的，这层壳让上面的代码不必等
  Unlock: (...a) => audio.Unlock(...a),
  SetEnabled: (...a) => audio.SetEnabled(...a),
  IsEnabled: () => audio.IsEnabled(),
  SetMood: (...a) => audio.SetMood(...a),
  Sfx: (...a) => audio.Sfx(...a),
  Duck: (...a) => audio.Duck(...a),
  PlayVoice: (...a) => audio.PlayVoice(...a),
  StopVoice: () => audio.StopVoice(),
  Update: (...a) => audio.Update(...a),
});
import("./Script_Audio.js")
  .then((m) => {
    audio = m.CreateAudio();
    audio.SetEnabled(soundOn);
    soundtrack.SyncDurations();
  })
  .catch((e) => { console.warn("声音模块未加载，按静音运行", e); });

// 声音默认开着：旁白是这一版叙事的主体，关掉就少了一半。真正的"别吵到人"
// 由浏览器兜底——AudioContext 在第一次手势之前一直是挂起的，静静躺着不出声，
// 玩家点"从第一章开始"那一下才真正启动。不想听的按 M 或右上角关掉，记在本地。
const SOUND_KEY = "tunnelLight1943.sound";
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
  "objectiveText", "hintText", "prompt", "toast", "crouchTag",
  "cineBars", "caption", "capSpeaker", "capText", "captionScrim",
  "detectionVignette", "fadeOverlay", "irisOverlay", "slitMatte",
  "chapterCard", "cardNum", "cardTitle", "cardYear", "cardContinue",
  "choiceOverlay", "choicePrompt", "choiceList",
  "endScreen", "endRestart", "touchControls", "rotateHint", "btnSound",
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
const touch = { left: false, right: false, up: false, down: false, act: false, crouchEdge: false };
let interactEdge = false, advanceEdge = false, crouchToggle = false;

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === "e" || k === "f") { interactEdge = true; advanceEdge = true; }
  if (k === " " || k === "enter") { advanceEdge = true; e.preventDefault(); }
  if (k === "c" || k === "control") crouchToggle = !crouchToggle;
  if (k === "1" || k === "2") {
    const def = state && CurrentBeatDef(state);
    if (def?.kind === "choice") { MakeChoice(state, def.options[k === "1" ? 0 : 1].key); HideChoice(); }
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "m") ToggleSound(); });
canvas.addEventListener("pointerdown", () => { advanceEdge = true; });

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

function SetupTouch() {
  if (!ui.touchControls) return;
  BindTouchButton(document.getElementById("btnLeft"), "left");
  BindTouchButton(document.getElementById("btnRight"), "right");
  BindTouchButton(document.getElementById("btnUp"), "up");
  BindTouchButton(document.getElementById("btnDown"), "down");
  BindTouchButton(document.getElementById("btnAct"), "act", { edge: true });
  BindTouchButton(document.getElementById("btnCrouch"), "crouch", { edge: true });
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
  if (keys.has("a") || keys.has("arrowleft") || touch.left) moveX -= 1;
  if (keys.has("d") || keys.has("arrowright") || touch.right) moveX += 1;
  if (keys.has("w") || keys.has("arrowup") || touch.up) climb -= 1;
  if (keys.has("s") || keys.has("arrowdown") || touch.down) climb += 1;
  return { moveX, climb };
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
  if (ch.scene === "tunnelVillage") return { x: p.x + lookAhead, y: -1.15, hw: 8.6 };
  if (ch.scene === "tunnelFort") return { x: p.x + lookAhead, y: UNDER_Y + 1.15, hw: 6.4 };
  // 地表：中近景，人物约占画高三分之一；视平线略高于人头，地面向后退
  const y = LevelY(p.level) + (p.level === "under" ? 1.25 : 1.95);
  return { x: p.x + lookAhead, y, hw: ch.light === "night" ? 6.6 : 7.2 };
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
    shot = BaseShot(state);
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
  ui.irisOverlay.style.background =
    `radial-gradient(circle at 50% 50%, transparent ${r}%, #060402 ${Math.min(100, r + 5)}%)`;
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

function SyncHud(state, dt, shotFade) {
  const def = state.phase === "playing" ? CurrentBeatDef(state) : null;
  const inCinematic = def?.kind === "cinematic" || !!state.microCine;

  ui.cineBars.classList.toggle("active", !!inCinematic);
  const hasCaption = !!(state.caption && inCinematic && (state.caption.say || state.caption.stage));
  if (ui.captionScrim) ui.captionScrim.classList.toggle("active", hasCaption);
  // 地窖板缝 matte：第一章父亲被抓那场
  const slit = inCinematic && state.camHint?.slit;
  if (ui.slitMatte) ui.slitMatte.classList.toggle("active", !!slit);

  if (state.caption && inCinematic && (state.caption.say || state.caption.stage)) {
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

  ui.prompt.textContent = state.prompt || "";
  ui.prompt.hidden = !state.prompt || inCinematic;
  ui.prompt.classList.toggle("danger", !!state.prompt && state.prompt.startsWith("！"));

  ui.crouchTag.hidden = true;
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

ui.startButton.addEventListener("click", () => StartGame(0));
ui.endRestart.addEventListener("click", () => {
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

  if (state) {
    const move = state.phase === "playing" ? ReadInput() : { moveX: 0, climb: 0 };
    const def = CurrentBeatDef(state);
    const stepDt = (fastCinematic && def?.kind === "cinematic") ? dt * 5 : dt;
    const prevChapter = state.chapterIndex;
    StepGame(state, {
      moveX: move.moveX, climb: move.climb,
      crouch: crouchToggle,
      interact: interactEdge,
      interactHeld: keys.has("e") || keys.has("f") || touch.act,
      advance: advanceEdge,
    }, stepDt);
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
  }
  world.Render();
  interactEdge = false;
  advanceEdge = false;
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
if (chapterParam >= 1 && chapterParam <= CHAPTERS.length) StartGame(chapterParam - 1);

requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(Frame); });

// 测试挂钩
window.TunnelLight = {
  version: GAME_VERSION,
  world,
  get state() { return state; },
  StartGame,
  JumpToChapter: (i) => StartGame(i),
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
