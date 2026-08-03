// 《地道里的光》 —— 主循环：输入、电影镜头、HUD 同步。
import * as THREE from "three";
import {
  GAME_VERSION, CHAPTERS, LAYOUTS, CreateGame, StepGame, StartChapter,
  CurrentBeatDef, MakeChoice, GetObjective, GetHint, GetBeatTarget,
} from "./Script_Core.mjs";
import { CreateWorld } from "./Script_World.js";

const canvas = document.getElementById("gameCanvas");
const world = CreateWorld(canvas);

const ui = {};
for (const id of [
  "titleScreen", "startButton", "chapterList", "controlsNote",
  "hud", "objectiveText", "hintText", "prompt", "toast", "crouchTag",
  "cineBars", "caption", "capSpeaker", "capText",
  "detectionVignette", "fadeOverlay",
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
// 输入
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

function ReadMoveInput() {
  let ix = 0, iz = 0;
  if (keys.has("w") || keys.has("arrowup")) iz -= 1;
  if (keys.has("s") || keys.has("arrowdown")) iz += 1;
  if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
  if (keys.has("d") || keys.has("arrowright")) ix += 1;
  if (ix === 0 && iz === 0) return { x: 0, z: 0 };
  // 以相机朝向为前方
  const dir = new THREE.Vector3();
  world.camera.getWorldDirection(dir);
  const yaw = Math.atan2(dir.x, dir.z);
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  return { x: iz * sin + ix * cos, z: iz * cos - ix * sin };
}

// ---------------------------------------------------------------------------
// 电影镜头
// ---------------------------------------------------------------------------
const FOLLOW_YAW = -2.35;
function FollowShot(state, dist, pitchDeg, yaw = FOLLOW_YAW) {
  const gy = world.GroundY(state);
  const pitch = pitchDeg * Math.PI / 180;
  const p = state.player;
  return {
    pos: [p.x + Math.sin(yaw) * dist * Math.cos(pitch), gy + dist * Math.sin(pitch) + 1.4, p.z + Math.cos(yaw) * dist * Math.cos(pitch)],
    look: [p.x, gy + 1.1, p.z],
  };
}

function DefaultShot(state) {
  const ch = CHAPTERS[state.chapterIndex];
  if (ch.env === "tunnelVillage") return FollowShot(state, 12, 56);
  if (ch.env === "tunnelFort") return FollowShot(state, 9.5, 52);
  if (ch.light === "night") return FollowShot(state, 17, 47);
  return FollowShot(state, 21, 50);
}

const TF_NODES = LAYOUTS.tunnelFort.nodes;
const TV_NODES = LAYOUTS.tunnelVillage.nodes;

function CamShot(state) {
  const hint = state.camHint || { kind: "follow" };
  const gy = world.GroundY(state);
  switch (hint.kind) {
    case "high": {
      const d = hint.dist || 40;
      return { pos: [hint.x + d * 0.55, d, hint.z + d * 0.75], look: [hint.x, 0, hint.z] };
    }
    case "yard": return { pos: [-14, 6, -8], look: [-27, 1, -20] };
    case "ruin": return { pos: [-14, 4.2, -9], look: [-28, 1, -20] };
    case "doorframe": return { pos: [-23.8, 1.9, -14.6], look: [-26.5, 1.5, -19.8] };
    case "doorframeFar": return { pos: [-18, 2.8, -10], look: [-26.5, 1.5, -19.8] };
    case "stool": return { pos: [-24.2, 1.7, -16.2], look: [-27.5, 0.6, -21.5] };
    case "leaveYard": return { pos: [-31, 2.5, -13.5], look: [-16, 1.2, -20] };
    case "cellarPeek": return { pos: [-32.6, 1.1, -13.4], look: [-21.5, 1.3, -17.6] };
    case "decoy": return { pos: [8, 4.2, 8], look: [20, 1, -4] };
    case "ambush": return { pos: [47, 2.8, 13], look: [56, 1.2, 4] };
    case "ditch": return { pos: [8, 2.6, 50], look: [-1, 0.9, 43] };
    case "lamp": return FollowShot(state, 5, 18);
    case "lampOut": return FollowShot(state, 4.5, 14);
    case "close": return FollowShot(state, 4.6, 13);
    case "low": return FollowShot(state, 6.8, 20);
    case "dark": return { ...FollowShot(state, 8, 30), fade: 0.92 };
    case "tunnelWide": {
      const p = state.player;
      return { pos: [p.x + 2, gy + 17, p.z + 9], look: [p.x, gy, p.z] };
    }
    case "tunnel": return FollowShot(state, 7.5, 42);
    case "smokeE": return { pos: [12, gy + 4.5, 7], look: [TV_NODES.entE.x, gy + 1, TV_NODES.entE.z] };
    case "fieldNight": return { pos: [-31, gy + 6.5, 14], look: [TV_NODES.entW.x, gy + 1, TV_NODES.entW.z] };
    case "ventUp": return { pos: [2, gy + 1.6, -15], look: [TV_NODES.ventSpot.x, gy + 5, TV_NODES.ventSpot.z] };
    case "hatch": return { pos: [TF_NODES.cellHatch.x - 4.5, gy + 2.6, TF_NODES.cellHatch.z + 3.4], look: [TF_NODES.cellHatch.x, gy + 1.2, TF_NODES.cellHatch.z] };
    case "hatchUp": return { pos: [TF_NODES.fieldEnt.x + 3, gy + 1.8, TF_NODES.fieldEnt.z + 3], look: [TF_NODES.fieldEnt.x, gy + 3.4, TF_NODES.fieldEnt.z] };
    case "lampTurn": {
      const p = state.player;
      return { pos: [p.x + Math.sin(p.heading) * 4.4, gy + 1.7, p.z + Math.cos(p.heading) * 4.4], look: [p.x, gy + 1.2, p.z] };
    }
    case "dawn": {
      const p = state.player;
      return { pos: [p.x + 9, gy + 11, p.z + 13], look: [p.x, gy, p.z] };
    }
    default: return DefaultShot(state);
  }
}

const camPos = new THREE.Vector3(0, 30, 30);
const camLook = new THREE.Vector3(0, 0, 0);
let camSnap = true;

function UpdateCamera(state, dt) {
  const inCinematic = state.phase === "playing" && CurrentBeatDef(state)?.kind === "cinematic";
  const shot = inCinematic ? CamShot(state) : DefaultShot(state);
  const targetPos = new THREE.Vector3(...shot.pos);
  const targetLook = new THREE.Vector3(...shot.look);
  const k = camSnap ? 1 : Math.min(1, dt * (inCinematic ? 1.6 : 3.2));
  camPos.lerp(targetPos, k);
  camLook.lerp(targetLook, k);
  camSnap = false;
  world.camera.position.copy(camPos);
  world.camera.lookAt(camLook);
  return shot.fade || 0;
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
  const inCinematic = def?.kind === "cinematic";

  // 黑边与字幕
  ui.cineBars.classList.toggle("active", !!inCinematic);
  if (state.caption && inCinematic) {
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

  // 目标与提示
  const objective = GetObjective(state);
  ui.objectiveText.textContent = objective || "";
  ui.hintText.textContent = (objective && GetHint(state)) || "";
  ui.objectiveText.parentElement.style.opacity = objective && !inCinematic ? 1 : 0;

  ui.prompt.textContent = state.prompt || "";
  ui.prompt.hidden = !state.prompt || inCinematic;

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

  // 被发现的红晕
  ui.detectionVignette.style.opacity = (state.stealthActive && state.detection.level > 0.03 && !inCinematic)
    ? Math.min(0.85, state.detection.level) : 0;

  // 章节卡
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

  // 抉择
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

  // 结局
  ui.endScreen.hidden = state.phase !== "gameEnd";

  // 渐隐
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
    const move = state.phase === "playing" ? ReadMoveInput() : { x: 0, z: 0 };
    const def = CurrentBeatDef(state);
    const stepDt = (fastCinematic && def?.kind === "cinematic") ? dt * 5 : dt;
    const prevChapter = state.chapterIndex;
    StepGame(state, {
      moveX: move.x, moveZ: move.z,
      crouch: crouchToggle,
      interact: interactEdge,
      interactHeld: keys.has("e") || keys.has("f"),
      advance: advanceEdge,
    }, stepDt);
    if (state.chapterIndex !== prevChapter) { camSnap = true; crouchToggle = false; }

    world.BuildEnvironment(state);
    world.UpdateActors(state, now / 1000);
    world.UpdateProps(state, now / 1000);
    const shotFade = UpdateCamera(state, dt);
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

// URL 直达：?chapter=3 从第三章开始（1 基）
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
        moveX: 0, moveZ: 0, crouch: false, interact: false, interactHeld: false, advance: false, ...input,
      }, 1 / 30);
    }
  },
  world,
  renderer: world.renderer,
};
