// 《地道里的光》 —— 主循环：横版输入、勇敢的心式镜头（硬切+慢推，永不旋转）、HUD。
import {
  GAME_VERSION, CHAPTERS, SURFACE_Y, UNDER_Y, CreateGame, StepGame,
  CurrentBeatDef, MakeChoice, GetObjective, GetHint,
} from "./Script_Core.mjs";
import { CreateWorld } from "./Script_World.js";

const canvas = document.getElementById("gameCanvas");
const world = CreateWorld(canvas);

const ui = {};
for (const id of [
  "titleScreen", "startButton", "chapterList",
  "objectiveText", "hintText", "prompt", "toast", "crouchTag",
  "cineBars", "caption", "capSpeaker", "capText",
  "detectionVignette", "fadeOverlay", "irisOverlay",
  "chapterCard", "cardNum", "cardTitle", "cardYear", "cardContinue",
  "choiceOverlay", "choicePrompt", "choiceList",
  "endScreen", "endRestart",
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
// 输入：A/D 走，W/S 爬梯口上下，E 互动，C 蹲
// ---------------------------------------------------------------------------
const keys = new Set();
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
    if (def?.kind === "choice") {
      MakeChoice(state, def.options[k === "1" ? 0 : 1].key);
      HideChoice();
    }
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
canvas.addEventListener("pointerdown", () => { advanceEdge = true; });

function ReadInput() {
  let moveX = 0, climb = 0;
  if (keys.has("a") || keys.has("arrowleft")) moveX -= 1;
  if (keys.has("d") || keys.has("arrowright")) moveX += 1;
  if (keys.has("w") || keys.has("arrowup")) climb -= 1;
  if (keys.has("s") || keys.has("arrowdown")) climb += 1;
  return { moveX, climb };
}

// ---------------------------------------------------------------------------
// 镜头：横版语法——只有 横移 / 升降 / 推拉。
// 过场：每换一行若构图变了就硬切，然后在行内慢推/慢移（pan）。
// ---------------------------------------------------------------------------
const cam = { x: 60, y: 2.2, dist: 13 };
let camSnap = true;
let lastShotKey = "";

function BaseShot(state) {
  const ch = CHAPTERS[state.chapterIndex];
  const p = state.player;
  const lookAhead = (p.heading || 1) * 2.2;
  if (ch.scene === "tunnelVillage") {
    // 剖面全景：地表与地道同框
    return { x: p.x + lookAhead, y: -1.1, dist: 15.5 };
  }
  if (ch.scene === "tunnelFort") {
    return { x: p.x + lookAhead, y: UNDER_Y + 1.7, dist: 10 };
  }
  const y = p.level === "under" ? UNDER_Y + 1.6 : 2.1;
  return { x: p.x + lookAhead, y, dist: ch.light === "night" ? 12 : 13 };
}

function HintShot(state) {
  const hint = state.camHint || { kind: "follow" };
  switch (hint.kind) {
    case "wide":
      return { x: hint.x, y: hint.y ?? 2.2, dist: 30, pan: hint.pan || 0 };
    case "shot":
      return { x: hint.x, y: hint.y ?? 1.6, dist: hint.dist ?? 8, pan: hint.pan || 0 };
    case "close": {
      const p = state.player;
      return { x: p.x, y: (p.level === "under" ? UNDER_Y : 0) + 1.3, dist: 4.8 };
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

  let shot, cut = false;
  if (inCinematic) {
    shot = HintShot(state);
    const shotKey = `${state.beatIndex}:${state.beat?.lineIndex ?? 0}:${state.microCine ? "mc" + state.microCine.i : ""}`;
    if (shotKey !== lastShotKey) { lastShotKey = shotKey; cut = true; }
    // 行内慢推 + 可选横移（勇敢的心的呼吸感）
    const prog = state.camLineD ? Math.min(1, (state.camLineT || 0) / state.camLineD) : 0;
    shot = {
      ...shot,
      x: shot.x + (shot.pan || 0) * prog,
      dist: shot.dist * (1 - 0.05 * prog),
    };
  } else {
    shot = BaseShot(state);
    if (lastShotKey !== "") { lastShotKey = ""; } // 回到跟随：平滑过去，不切
  }

  if (cut || camSnap) {
    cam.x = shot.x; cam.y = shot.y; cam.dist = shot.dist;
    camSnap = false;
  } else {
    const k = Math.min(1, dt * (inCinematic ? 2.2 : 4.5));
    cam.x += (shot.x - cam.x) * k;
    cam.y += (shot.y - cam.y) * k;
    cam.dist += (shot.dist - cam.dist) * k;
  }

  world.camera.position.set(cam.x, cam.y, cam.dist);
  world.camera.lookAt(cam.x, cam.y, 0);
  return shot.fade || 0;
}

// ---------------------------------------------------------------------------
// 圆形收光转场（iris）：过场进出与章节开场
// ---------------------------------------------------------------------------
let irisLevel = 1; // 1 = 全开
let irisTarget = 1;
let lastBeatKind = null;

function StepIris(state, dt) {
  const def = state.phase === "playing" ? CurrentBeatDef(state) : null;
  const kind = state.phase !== "playing" ? state.phase : (def?.kind === "cinematic" ? "cine" : "play");
  if (kind !== lastBeatKind) {
    if (lastBeatKind !== null && (kind === "cine" || lastBeatKind === "cine")) {
      irisLevel = 0; // 切换瞬间收到底，再张开
    }
    lastBeatKind = kind;
  }
  irisTarget = 1;
  irisLevel = Math.min(irisTarget, irisLevel + dt * 2.2);
  const r = Math.round(irisLevel * 78);
  ui.irisOverlay.style.background =
    `radial-gradient(circle at 50% 50%, transparent ${r}%, #030202 ${Math.min(100, r + 4)}%)`;
  ui.irisOverlay.style.opacity = irisLevel >= 1 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
let toastShown = null;
let choiceBuilt = false;
let fadeLevel = 1;

function HideChoice() {
  ui.choiceOverlay.hidden = true;
  choiceBuilt = false;
}

function SyncHud(state, dt, shotFade) {
  const def = state.phase === "playing" ? CurrentBeatDef(state) : null;
  const inCinematic = def?.kind === "cinematic" || !!state.microCine;

  ui.cineBars.classList.toggle("active", !!inCinematic);
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

  const objective = GetObjective(state);
  ui.objectiveText.textContent = objective || "";
  ui.hintText.textContent = (objective && GetHint(state)) || "";
  ui.objectiveText.parentElement.style.opacity = objective && !inCinematic ? 1 : 0;

  ui.prompt.textContent = state.prompt || "";
  ui.prompt.hidden = !state.prompt || inCinematic;
  ui.prompt.classList.toggle("danger", !!state.prompt && state.prompt.startsWith("！"));

  ui.crouchTag.hidden = !crouchToggle || inCinematic || state.phase !== "playing";

  if (state.toast !== toastShown) {
    toastShown = state.toast;
    if (state.toast) {
      ui.toast.textContent = state.toast.text;
      ui.toast.classList.add("show");
    } else {
      ui.toast.classList.remove("show");
    }
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
    ui.cardContinue.textContent = "按 E 继续";
    Unlock(state.chapterIndex + (showNext ? 1 : 0));
  } else {
    ui.chapterCard.hidden = true;
  }

  if (def?.kind === "choice") {
    if (!choiceBuilt) {
      choiceBuilt = true;
      ui.choicePrompt.textContent = def.prompt;
      ui.choiceList.innerHTML = "";
      def.options.forEach((opt, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.innerHTML = `<b>${i + 1} · ${opt.label}</b><span>${opt.detail}</span>`;
        btn.addEventListener("click", () => { MakeChoice(state, opt.key); HideChoice(); });
        ui.choiceList.appendChild(btn);
      });
      ui.choiceOverlay.hidden = false;
    }
  } else if (choiceBuilt) {
    HideChoice();
  }

  ui.endScreen.hidden = state.phase !== "gameEnd";

  const targetFade = state.phase === "gameEnd" ? 0.75 : shotFade;
  fadeLevel += (targetFade - fadeLevel) * Math.min(1, dt * 2.4);
  ui.fadeOverlay.style.opacity = fadeLevel.toFixed(3);
}

// ---------------------------------------------------------------------------
// 标题界面
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
  fadeLevel = 1;
  irisLevel = 0;
  lastBeatKind = null;
}

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
      interactHeld: keys.has("e") || keys.has("f"),
      advance: advanceEdge,
    }, stepDt);
    if (state.chapterIndex !== prevChapter) { camSnap = true; crouchToggle = false; irisLevel = 0; }

    world.BuildEnvironment(state);
    world.UpdateActors(state, now / 1000);
    world.UpdateProps(state, now / 1000);
    const shotFade = UpdateCamera(state, dt);
    StepIris(state, dt);
    SyncHud(state, dt, shotFade);
  }
  world.Render();
  interactEdge = false;
  advanceEdge = false;
}

function Resize() {
  world.Resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
}
window.addEventListener("resize", Resize);
Resize();
BuildTitle();

const chapterParam = parseInt(params.get("chapter") || "0", 10);
if (chapterParam >= 1 && chapterParam <= CHAPTERS.length) {
  StartGame(chapterParam - 1);
}

requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(Frame); });

// 测试挂钩
window.TunnelLight = {
  version: GAME_VERSION,
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
