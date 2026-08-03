import { CHAPTERS, CACHE_BUST, PROLOGUE_PANELS } from "./Data_Story.mjs";
import {
  AdvancePanels,
  CanThrowGrenade,
  CreateCampaignState,
  CreateInputState,
  DebugCompleteGoal,
  DebugHold,
  GrenadeAimWorldArc,
  GrenadeCount,
  LoadFromStorage,
  DIG_SWING_DURATION,
  EnemyFaction,
  MELEE_DURATION,
  NextStepText,
  PLAYER_H,
  RestartChapter,
  RestartChapterToPlay,
  RespawnPlayer,
  SaveToStorage,
  StepPlay,
} from "./Script_Rules.mjs";
import { AIR, HARD, SOFT, CellWorldRect, GetCell } from "./Script_Dig.mjs";
import {
  DEPTH_NEAR,
  ParallaxOf,
  PropsBehind,
  PropsBehindBands,
  PropsFront,
  PropsPlay,
  ScaleOf,
  TintAlpha,
  YLiftOf,
} from "./Script_Depth.mjs";
import {
  CanDigWith,
  CanPlant,
  CanShoot,
  CanThrow,
  ITEM_AMMO,
  ITEM_CHARGE,
  ITEM_GRENADE,
  ITEM_META,
  ITEM_RIFLE,
  ITEM_SHOVEL,
} from "./Script_Items.mjs";
import {
  AdvanceClipTime,
  DrawPuppet,
  PaletteForSpeaker,
  PickClip,
} from "./Script_Puppet.mjs";
import { InteractPadIcon, PAD_ICON, HUD_ICON_FILES } from "./Script_PadIcons.mjs";
import { SURFACE_Y, VIEW_H, VIEW_W } from "./Script_World.mjs";

const $ = (id) => document.getElementById(id);
const canvas = $("GameCanvas");
const ctx = canvas.getContext("2d");

/** Preload every HUD plate so pad / world prompts / held slot share one art set. */
const PICTO_IMG = Object.create(null);
const PICTO_FILE = {
  shovel: "Icon_Shovel.png",
  hatch: "Icon_TunnelHatch.png",
  climb_out: "Icon_TunnelHatch.png",
  talk: "Icon_Talk.png",
  shot: "Icon_Shot.png",
  rifle: "Icon_Rifle.png",
  aim: "Icon_Aim.png",
  plan: "Icon_Plan.png",
  design: "Icon_Plan.png",
  up: "Icon_Up.png",
  down: "Icon_Down.png",
  crouch: "Icon_Crouch.png",
  left: "Icon_Left.png",
  right: "Icon_Right.png",
  warn: "Icon_Warn.png",
  grenade: "Icon_Grenade.png",
  charge: "Icon_Charge.png",
  bell: "Icon_Bell.png",
  people: "Icon_People.png",
  flip: "Icon_Flip.png",
  check: "Icon_Check.png",
  corridor: "Icon_Corridor.png",
  ammo: "Icon_Ammo.png",
  dig: "Icon_Shovel.png",
  roleHero: "Icon_RoleHero.png",
  roleElder: "Icon_RoleElder.png",
  roleWoman: "Icon_RoleWoman.png",
  roleMilitia: "Icon_RoleMilitia.png",
  roleEnemy: "Icon_RoleEnemy.png",
  roleIjp: "Icon_RoleIjp.png",
  rolePuppet: "Icon_RolePuppet.png",
  roleSpy: "Icon_RoleSpy.png",
  well: "Icon_Well.png",
  bush: "Icon_Bush.png",
  empty: "Icon_HandEmpty.png",
  handEmpty: "Icon_HandEmpty.png",
};
for (const [kind, file] of Object.entries(PICTO_FILE)) {
  const img = new Image();
  img.decoding = "async";
  img.src = `./${file}?v=${CACHE_BUST}`;
  PICTO_IMG[kind] = img;
}
// Warm the shared file list too (pad DOM may race ahead of canvas draws).
for (const file of HUD_ICON_FILES) {
  const img = new Image();
  img.decoding = "async";
  img.src = `./${file}?v=${CACHE_BUST}`;
}

let state = CreateCampaignState(0);
let lastTs = 0;
let audioCtx = null;
let prevGoalSig = "";

function EnsureAudio() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

function Beep(freq = 440, dur = 0.07, type = "square", gain = 0.03) {
  const ac = EnsureAudio();
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(ac.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.stop(ac.currentTime + dur);
}

function Show(el, on) {
  if (el) el.hidden = !on;
}

function SetModal(which) {
  // Death lock: never leave the player frozen with failed=true and no UI.
  if (!which && state?.failed) which = "fail";
  Show($("ModalLayer"), !!which);
  Show($("HelpModal"), which === "help");
  Show($("HistoryModal"), which === "history");
  Show($("PauseModal"), which === "pause");
  Show($("FailModal"), which === "fail");
  Show($("DebugModal"), which === "debug");
  // Any open modal freezes play stepping.
  if (state) state.pauseOpen = !!which;
  if (which === "debug") SyncDebugPanel();
}

function AnyModalOpen() {
  const layer = $("ModalLayer");
  return !!(layer && !layer.hidden);
}

function SyncDebugPanel() {
  const sel = $("DebugChapterSelect");
  if (!sel) return;
  if (sel.options.length !== CHAPTERS.length) {
    sel.innerHTML = CHAPTERS.map(
      (ch, i) => `<option value="${i}">${ch.act}. ${ch.title}</option>`,
    ).join("");
  }
  sel.value = String(Math.max(0, Math.min(CHAPTERS.length - 1, state.chapterIndex | 0)));
}

function EnsureTouchPadVisible() {
  const touchy =
    typeof navigator !== "undefined" &&
    (navigator.maxTouchPoints > 0 || "ontouchstart" in window);
  document.documentElement.classList.toggle("forceTouchPad", !!touchy);
}

/** Hidden QA entry: title eyebrow ×5 or pause button ×3. */
function BindHiddenDebugEntry() {
  let titleTaps = 0;
  let titleTimer = 0;
  const eyebrow = $("TitleEyebrow");
  if (eyebrow) {
    eyebrow.style.cursor = "default";
    eyebrow.addEventListener("click", (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - titleTimer > 1200) titleTaps = 0;
      titleTimer = now;
      titleTaps += 1;
      if (titleTaps >= 5) {
        titleTaps = 0;
        EnsureAudio();
        if (state.phase === "title") BeginFrom(0);
        state.phase = "play";
        SyncPhaseUi();
        SetModal("debug");
        Beep(880, 0.05, "triangle", 0.03);
      }
    });
  }
  let pauseTaps = 0;
  let pauseTimer = 0;
  const pauseBtn = $("PauseButton");
  if (pauseBtn) {
    pauseBtn.addEventListener(
      "click",
      (e) => {
        const now = performance.now();
        if (now - pauseTimer > 900) pauseTaps = 0;
        pauseTimer = now;
        pauseTaps += 1;
        if (pauseTaps >= 3) {
          pauseTaps = 0;
          e.stopImmediatePropagation();
          e.preventDefault();
          SetModal("debug");
          Beep(880, 0.05, "triangle", 0.03);
        }
      },
      true,
    );
  }
}

function SyncTitle() {
  const progress = LoadFromStorage();
  const cont = $("ContinueButton");
  if (progress && progress.unlockedActs > 1) {
    Show(cont, true);
    cont.textContent = "继续";
  } else Show(cont, false);
}

function SyncPanels() {
  const chapter = CHAPTERS[state.chapterIndex];
  const isPrologue = state.phase === "prologue";
  const list = isPrologue
    ? PROLOGUE_PANELS
    : state.phase === "panels"
      ? chapter.openPanels
      : chapter.closePanels;
  const beat = list[state.panelIndex];
  if (!beat) return;
  $("PanelKicker").textContent = isPrologue ? "开场" : `第 ${chapter.act} 页`;
  $("PanelTitle").textContent = isPrologue ? "高家庄" : chapter.title;
  $("PanelSpeaker").textContent = beat.speaker;
  $("PanelBody").textContent = beat.text || beat.body || "";
  $("PanelProgress").innerHTML = list
    .map((_, i) => `<i class="${i <= state.panelIndex ? "on" : ""}"></i>`)
    .join("");
  $("PanelCard").dataset.mood = beat.mood || "talk";
}

function PaintTouchPadIcons() {
  for (const btn of document.querySelectorAll(".touchPad [data-touch]")) {
    const kind = btn.getAttribute("data-touch");
    // Interact / aim / use icons are contextual — SyncTouchPadActions owns them.
    if (kind === "interact" || kind === "aim" || kind === "use") continue;
    const icon = PAD_ICON[kind];
    if (icon && !btn.dataset.iconReady) {
      btn.innerHTML = icon;
      btn.dataset.iconReady = "1";
    }
  }
}

/** True only for real NPC comic lines — tip/design subtitles must not steal dig. */
function IsDialogueBlockingPad(st) {
  if (st.activeTalkId) return true;
  const sub = st.subtitle;
  if (!sub?.comic || !sub.text) return false;
  const sp = sub.speaker || "";
  if (sp === "提示" || sp === "设计" || sp === "旁白") return false;
  return true;
}

/** What the single interact key should fire this frame. */
function PadInteractVerb(st) {
  const p = st.player;
  const hint = st.interactHint || "";
  // Mounted MG: big key is the trigger.
  if (p.manningMg) return "shot";
  // Design mode must NOT trap the big key on "plan" — dig exits design and carves.
  if (st.designMode && p.inTunnel && CanDigWith(p.held)) return "dig";
  if (st.designMode) return "dig";
  if (IsDialogueBlockingPad(st)) return "talk";
  if (hint === "mg_nest") return "shot";
  // Underground with shovel: dig is the default — hatch only when no diggable wall.
  if (p.inTunnel && CanDigWith(p.held)) {
    if (hint === "hatch") return "hatch";
    return "dig";
  }
  if (hint === "hatch") return "hatch";
  if (hint === "stealth_ko" || hint === "melee_risky") return "warn";
  if (hint === "pickup" || hint === "need_shovel") return "shovel";
  if (hint === "talk" || hint === "spy_talk" || hint === "shelter" || hint === "bell") return "talk";
  if (hint === "shot_port" || hint === "shoot") return "shot";
  if (hint === "plant_zone" || hint === "signal") return CanPlant(p.held) ? "use" : "talk";
  if (hint === "flip_build" || hint === "flip_trap") return "talk";
  if (hint === "dig" || hint === "follow_plan" || hint === "need_plan") return "dig";
  if (CanShoot(p.held) && p.aiming && !p.inTunnel) return "shot";
  // Pocket / held grenades: big key throws when rifle isn't ADS.
  if (CanThrowGrenade(p) && !(CanShoot(p.held) && !p.inTunnel)) return "grenade";
  if (CanThrow(p.held) || (CanThrowGrenade(p) && p.held === ITEM_GRENADE)) return "grenade";
  if (hint) return "talk";
  return "talk";
}

function SyncTouchPadActions() {
  if (state.phase !== "play") return;
  const held = state.player.held;
  const inTunnel = !!state.player.inTunnel;
  const design = !!state.designMode;

  const touchAim = $("TouchAim");
  if (touchAim) {
    const rifleAim = held === ITEM_RIFLE && !inTunnel && !design;
    const nadeAim = !rifleAim && CanThrowGrenade(state.player) && !design;
    const showAim = rifleAim || nadeAim;
    touchAim.hidden = !showAim;
    const mode = rifleAim ? "aim" : state.nadeAiming ? "nadeAimOn" : "nadeAim";
    if (showAim && touchAim.dataset.padMode !== mode) {
      touchAim.innerHTML = PAD_ICON.aim;
      touchAim.dataset.padMode = mode;
      touchAim.setAttribute("aria-label", rifleAim ? "开镜" : "调抛射角");
      touchAim.title = rifleAim ? "开镜" : "按住 · 配合↑↓调手雷角度";
    }
    touchAim.classList.toggle("isActive", !!state.nadeAiming && nadeAim);
  }

  const touchDesign = $("TouchDesign");
  if (touchDesign) {
    // Hidden from the normal pad — it stranded players in "设计蓝图中".
    // Desktop still has R; debug panel can toggle. If somehow stuck in design,
    // show a single bright EXIT control.
    const showDesign = !!design;
    touchDesign.hidden = !showDesign;
    touchDesign.classList.toggle("isNeeded", showDesign);
    touchDesign.classList.toggle("isActive", showDesign);
    if (showDesign && touchDesign.dataset.padMode !== "designExit") {
      touchDesign.innerHTML = PAD_ICON.shovel;
      touchDesign.dataset.padMode = "designExit";
      touchDesign.setAttribute("aria-label", "退出画线");
      touchDesign.title = "退出画线 · 然后用大键挖";
    }
  }

  const touchUse = $("TouchUse");
  if (touchUse) {
    // Grenades only — corridor stamp removed from mobile pad (was design-trap bait).
    const canNade = !design && CanThrowGrenade(state.player);
    const showUse = canNade;
    touchUse.hidden = !showUse;
    const nadeMode = state.nadeAiming ? "grenadeThrow" : "grenade";
    if (showUse && touchUse.dataset.padMode !== nadeMode) {
      touchUse.innerHTML = PAD_ICON.grenade;
      touchUse.dataset.padMode = nadeMode;
      touchUse.setAttribute("aria-label", state.nadeAiming ? "确认投掷" : "瞄准手雷");
      touchUse.title = state.nadeAiming ? "确认投掷" : "瞄准手雷 · 再点扔出";
    }
    touchUse.classList.toggle("isActive", !!state.nadeAiming && showUse);
  }

  const touchInteract = $("TouchInteract");
  if (touchInteract) {
    const verb = PadInteractVerb(state);
    const mode =
      verb === "chamber" || verb === "plan"
        ? "plan"
        : verb === "use"
          ? "shovel"
          : verb === "grenade"
            ? "grenade"
            : verb;
    if (touchInteract.dataset.padMode !== mode) {
      touchInteract.innerHTML = InteractPadIcon(mode);
      touchInteract.dataset.padMode = mode;
    }
    const aimingUp = !!state.input.up || (state.digAimUp || 0) > 0;
    const label =
      mode === "dig"
        ? aimingUp
          ? "往上挖"
          : "开挖"
        : mode === "shovel"
          ? "捡起"
          : mode === "shot"
            ? "开火"
            : mode === "grenade"
              ? state.nadeAiming
                ? "确认投掷"
                : "瞄准手雷"
              : mode === "hatch"
                ? "进出井口"
                : mode === "plan"
                  ? "标记蓝图格"
                  : mode === "warn"
                    ? "制住"
                    : "互动";
    touchInteract.setAttribute("aria-label", label);
    touchInteract.title = label;
    touchInteract.classList.toggle("isDig", mode === "dig" || mode === "plan");
  }
}

function SyncHud() {
  $("HeartRow").innerHTML = [0, 1, 2]
    .map((i) => `<i class="${i < state.player.hp ? "" : "off"}"></i>`)
    .join("");
  const slot = $("HeldSlot");
  if (!slot) return;
  const held = state.player.held;
  const meta = held ? ITEM_META[held] : null;
  slot.dataset.empty = held ? "0" : "1";
  const inTunnel = !!state.player.inTunnel;
  if (state.designMode) {
    slot.innerHTML = `<b data-item="shovel" style="--item:#8a7355"></b><span>铁锹 · 点大键挖</span><em>误进画线了——直接点下方大键退出并挖土</em>`;
  } else if (held === ITEM_RIFLE) {
    const nade = GrenadeCount(state.player);
    const ads = state.player.aiming
      ? "开镜中 · 大键开火"
      : nade > 0
        ? `按住开镜再打 · 手雷键扔（×${nade}）`
        : "按住开镜，再点大键打";
    slot.innerHTML = `<b data-item="rifle" style="--item:${meta.color}"></b><span>步枪 · ${state.player.ammo | 0}发</span><em>${ads}</em>`;
  } else if (held === ITEM_GRENADE || GrenadeCount(state.player) > 0) {
    const n = GrenadeCount(state.player) || (held === ITEM_GRENADE ? 1 : 0);
    const tip = state.nadeAiming
      ? `瞄准中 · 角度 ${Math.round((state.nadeAim ?? 0.55) * 100)}% · ↑高 ↓近 · 再点扔`
      : ITEM_META[ITEM_GRENADE]?.tip || "点手雷键瞄准";
    slot.innerHTML = `<b data-item="grenade" style="--item:${ITEM_META[ITEM_GRENADE].color}"></b><span>土制手雷 · ×${n}${state.nadeAiming ? " · 瞄准" : ""}</span><em>${tip}</em>`;
  } else if (state.player.manningMg) {
    slot.innerHTML = `<b data-item="rifle" style="--item:#3a3228"></b><span>机枪巢</span><em>大键连发扫射 · 打光来犯日伪军</em>`;
  } else if (inTunnel && held === ITEM_SHOVEL) {
    const aimingUp = !!state.input.up || (state.digAimUp || 0) > 0;
    const tip = aimingUp
      ? "往上挖中 · 再点大键掏顶"
      : "贴壁点大键挖 · 往上：先点↑再点大键";
    slot.innerHTML = `<b data-item="shovel" style="--item:${meta.color}"></b><span>铁锹${aimingUp ? " · 向上" : ""}</span><em>${tip}</em>`;
  } else {
    slot.innerHTML = meta
      ? `<b style="--item:${meta.color}"></b><span>${meta.label}</span><em>${meta.tip}</em>`
      : `<b data-item="empty"></b><span>空手</span><em>走近捡道具 · 绕到背后可制住敌人</em>`;
    if (meta) slot.querySelector("b").dataset.item = held;
  }
  const badge = $("DesignBadge");
  if (badge) badge.hidden = !state.designMode;
  const adsBadge = $("AdsBadge");
  if (adsBadge) adsBadge.hidden = !(state.player.aiming && held === ITEM_RIFLE);
  const step = $("StepHint");
  if (step) {
    step.textContent = NextStepText(state);
    step.hidden = false;
  }
  const ammoHud = $("AmmoHud");
  if (ammoHud) {
    // Pocket ammo / grenades — only when that stock matters this beat.
    const nades = GrenadeCount(state.player);
    const showAmmo = held === ITEM_RIFLE && state.phase === "play";
    const showNade = nades > 0 && state.phase === "play" && !showAmmo;
    ammoHud.hidden = !(showAmmo || showNade);
    if (showAmmo && nades > 0) ammoHud.textContent = `${state.player.ammo | 0}发 · 雷×${nades}`;
    else if (showAmmo) ammoHud.textContent = `${state.player.ammo | 0}发`;
    else if (showNade) ammoHud.textContent = `雷×${nades}`;
  }
  SyncTouchPadActions();
}

function SyncPhaseUi() {
  const phase = state.phase;
  Show($("TitleScreen"), phase === "title");
  Show($("PanelScreen"), phase === "prologue" || phase === "panels" || phase === "closePanels");
  Show($("EndingScreen"), phase === "ending");
  Show($("GameHud"), phase === "play");
  const letter = document.querySelector(".comicLetterbox");
  if (letter) letter.style.visibility = phase === "play" ? "visible" : "hidden";
  if (phase === "title") SyncTitle();
  if (phase === "prologue" || phase === "panels" || phase === "closePanels") SyncPanels();
  if (phase === "play") SyncHud();
  if (state.failed) SetModal("fail");
}

function BeginFrom(chapterIndex) {
  state = CreateCampaignState(chapterIndex, LoadFromStorage());
  state.phase = chapterIndex === 0 ? "prologue" : "panels";
  state.panelIndex = 0;
  SaveToStorage(state);
  SetModal(null);
  SyncPhaseUi();
  Beep(520, 0.06, "triangle", 0.04);
}

function Resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Map world → screen with camera; +y is down; SURFACE_Y(0) is ground top. */
function Scale() {
  return (canvas.clientHeight || innerHeight) / VIEW_H;
}

/** Actual world units visible horizontally — canvas aspect often wider than VIEW_W. */
function VisibleWorldWidth() {
  const s = Scale();
  const screenW = canvas?.clientWidth || globalThis.innerWidth || VIEW_W;
  if (!s || s <= 0) return VIEW_W;
  // Never narrower than design VIEW_W; widen with real aspect so soil isn't "streamed in".
  return Math.max(VIEW_W, screenW / s);
}

/** Horizontal draw cull in world space — pad past the real visible span. */
function CameraCullX(pad = 160) {
  const viewW = state.viewW || VisibleWorldWidth();
  return {
    cam0: state.cameraX - pad,
    cam1: state.cameraX + viewW + pad,
    viewW,
  };
}

function WX(x) {
  return (x - state.cameraX) * Scale();
}
function WY(y) {
  return (y - state.cameraY) * Scale();
}

// ─── Valiant Hearts 2.5D depth stack ─────────────────────────────
function DepthWX(worldX, depth) {
  const factor = ParallaxOf(depth);
  return (worldX - state.cameraX * factor) * Scale();
}

function DepthWY(depth) {
  const s = Scale();
  return WY(SURFACE_Y) + YLiftOf(depth, s);
}

function DrawSky(w, h, pal) {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(0.7, pal.skyBot);
  g.addColorStop(1, pal.haze);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Cloud slabs — slowest parallax band
  const scroll = state.cameraX * 0.05 * Scale();
  ctx.fillStyle = pal.night ? "rgba(200,210,230,.08)" : "rgba(255,248,230,.28)";
  for (let i = 0; i < 6; i++) {
    const x = ((i * 220 - scroll) % (w + 260)) - 80;
    const y = h * (0.1 + (i % 3) * 0.05);
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(x, y, 70 + i * 8, 16 + (i % 3) * 4, 0, 0, Math.PI * 2);
    else ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = pal.night ? 0.4 : 0.55;
  ctx.fillStyle = pal.night ? "#d9e2f0" : "#f0d9a0";
  ctx.beginPath();
  ctx.arc(w * 0.8, h * 0.14, pal.night ? 20 : 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function DrawRidge(w, h, camX, factor, yFrac, amp, color, alpha = 1) {
  const scale = Scale();
  const scroll = camX * factor * scale;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-20, h);
  for (let i = -20; i <= w + 40; i += 16) {
    const wx = i + scroll;
    const n = Math.sin(wx * 0.0028) * amp + Math.sin(wx * 0.0065) * amp * 0.4 + Math.sin(wx * 0.015) * amp * 0.18;
    ctx.lineTo(i, h * yFrac + n * scale);
  }
  ctx.lineTo(w + 40, h);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Far → near atmospheric bands (no gameplay props). */
function DrawDepthBackdrop(w, h, camX, pal) {
  // Three soft ridges only — fewer stacked teeth, more air between planes
  DrawRidge(w, h, camX, 0.05, 0.44, 22, pal.haze, 0.7);
  DrawRidge(w, h, camX, 0.14, 0.52, 16, pal.night ? "#243028" : "#7a9070", 0.78);
  DrawRidge(w, h, camX, 0.24, 0.58, 12, pal.night ? "#2a342c" : "#6a7d58", 0.85);

  // Distant village as sparse silhouette clusters (not a busy tooth comb)
  const baseY = h * 0.54;
  const scroll = camX * 0.14 * Scale();
  ctx.fillStyle = pal.night ? "#1c241e" : "#556850";
  for (let i = -2; i < 12; i++) {
    const x = ((i * 180 - scroll) % (w + 220)) - 50;
    const bw = 18 + ((i * 11) % 12);
    const bh = 14 + ((i * 9) % 16);
    ctx.globalAlpha = 0.32;
    ctx.fillRect(x, baseY - bh, bw, bh);
    ctx.beginPath();
    ctx.moveTo(x - 1, baseY - bh);
    ctx.lineTo(x + bw * 0.5, baseY - bh - 7);
    ctx.lineTo(x + bw + 1, baseY - bh);
    ctx.closePath();
    ctx.fill();
    // Neighbor lump — reads as one hamlet, not twenty sheds
    if (i % 2 === 0) {
      ctx.fillRect(x + bw + 4, baseY - bh * 0.7, bw * 0.65, bh * 0.7);
    }
  }
  ctx.globalAlpha = 1;

  // Mid field plate — soft, almost no furrow noise
  DrawRidge(w, h, camX, 0.35, 0.66, 10, pal.field, 0.95);
  const furrowY = h * 0.66;
  const furrowScroll = camX * 0.35 * Scale();
  ctx.strokeStyle = pal.night ? "rgba(0,0,0,.12)" : "rgba(50,60,32,.14)";
  ctx.lineWidth = 1;
  for (let i = -2; i < 14; i++) {
    const x = ((i * 90 - furrowScroll) % (w + 100)) - 30;
    ctx.beginPath();
    ctx.moveTo(x, furrowY - 4);
    ctx.lineTo(x + (x - w * 0.5) * 0.05, furrowY + 18);
    ctx.stroke();
  }

  DrawRidge(w, h, camX, 0.55, 0.74, 8, pal.earth, 1);

  // Stronger distance fog — washes far ridges into the sky
  const veilFar = ctx.createLinearGradient(0, h * 0.32, 0, h * 0.62);
  veilFar.addColorStop(0, pal.night ? "rgba(18,26,34,.48)" : "rgba(200,215,205,.42)");
  veilFar.addColorStop(0.5, pal.night ? "rgba(18,26,34,.22)" : "rgba(200,215,205,.2)");
  veilFar.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = veilFar;
  ctx.fillRect(0, h * 0.32, w, h * 0.32);

  // Second fog shelf between mid field and walk plane
  const veilMid = ctx.createLinearGradient(0, h * 0.58, 0, h * 0.78);
  veilMid.addColorStop(0, pal.night ? "rgba(14,18,22,.2)" : "rgba(190,200,170,.16)");
  veilMid.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = veilMid;
  ctx.fillRect(0, h * 0.58, w, h * 0.22);
}

/** Haze strip between depth bands — sells air between planes. */
function DrawDepthVeil(w, h, y0, y1, rgba) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.45, rgba);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, w, Math.max(4, y1 - y0));
}

/** Continuous stage floor — one solid walk plane, full viewport width. */
function DrawStageFloor(w, h, pal) {
  const s = Scale();
  const y = WY(SURFACE_Y);
  // Receding dirt plate behind the walk line (field → earth)
  const back = ctx.createLinearGradient(0, y - 90 * s, 0, y);
  back.addColorStop(0, pal.night ? "rgba(42,50,40,.0)" : "rgba(120,140,90,.0)");
  back.addColorStop(0.4, pal.night ? "#2e382c" : "#7a8f5c");
  back.addColorStop(0.78, pal.night ? "#3a3228" : "#8b6a45");
  back.addColorStop(1, pal.night ? "#32281e" : "#7a5a38");
  ctx.fillStyle = back;
  ctx.fillRect(0, y - 90 * s, w, 90 * s);

  // Walk strip toward camera (darker = nearer) — solid, no vanishing wedges
  const near = ctx.createLinearGradient(0, y, 0, h);
  near.addColorStop(0, pal.night ? "#3a3228" : "#8b6a45");
  near.addColorStop(0.28, pal.night ? "#2a241c" : "#6a4e34");
  near.addColorStop(0.65, pal.night ? "#1a1612" : "#4a3420");
  near.addColorStop(1, pal.night ? "#0c0a08" : "#2a1c12");
  ctx.fillStyle = near;
  ctx.fillRect(0, y, w, h - y + 4);

  // Soft soil grain — horizontal only, never radial trapezoid plates
  ctx.strokeStyle = pal.night ? "rgba(0,0,0,.18)" : "rgba(30,20,12,.14)";
  for (let t = 0.08; t < 0.92; t += 0.1) {
    const yy = y + (h - y) * t;
    ctx.lineWidth = 1 + t * 1.8;
    ctx.globalAlpha = 0.22 + t * 0.35;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(w, yy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Horizon seam (walk line) — continuous edge to edge
  ctx.strokeStyle = "rgba(20,14,10,.65)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  // Soft light rim just above the walk line
  const rim = ctx.createLinearGradient(0, y - 10 * s, 0, y + 6 * s);
  rim.addColorStop(0, "rgba(255,230,180,.0)");
  rim.addColorStop(0.55, pal.night ? "rgba(200,180,120,.08)" : "rgba(255,230,180,.16)");
  rim.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rim;
  ctx.fillRect(0, y - 10 * s, w, 16 * s);
}

/**
 * Continuous near-camera ground bank — one connected ribbon across the full
 * level width (and always full screen), replacing scattered mudbank trapezoids.
 */
function DrawContinuousNearGround(w, h, camX, pal) {
  const s = Scale();
  const lipY = h * 0.82;
  const dirt = pal.night ? "#14100c" : "#2a1c12";
  const lip = pal.night ? "#221810" : "#3a2818";
  const mid = pal.night ? "#1a1410" : "#322214";

  // Solid skirt fills entire bottom — no gaps at left/right camera edges
  const skirt = ctx.createLinearGradient(0, lipY - 20 * s, 0, h);
  skirt.addColorStop(0, mid);
  skirt.addColorStop(0.35, dirt);
  skirt.addColorStop(1, pal.night ? "#0a0806" : "#1a100c");
  ctx.fillStyle = skirt;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, lipY);
  // Gentle continuous lip (small wave — never breaks into separate plates)
  const step = 16;
  for (let i = 0; i <= w + step; i += step) {
    const wave = Math.sin((i + camX * 1.4) * 0.018) * 5 + Math.sin((i + camX) * 0.007) * 2.5;
    ctx.lineTo(i, lipY + wave);
  }
  ctx.lineTo(w + step, h);
  ctx.closePath();
  ctx.fill();

  // Lit continuous lip stroke
  ctx.strokeStyle = lip;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  for (let i = 0; i <= w + step; i += step) {
    const wave = Math.sin((i + camX * 1.4) * 0.018) * 5 + Math.sin((i + camX) * 0.007) * 2.5;
    if (i === 0) ctx.moveTo(i, lipY + wave);
    else ctx.lineTo(i, lipY + wave);
  }
  ctx.stroke();

  // World-width dirt band under the walk plane so the rightmost map still reads solid
  const levelW = state.level?.width || 2400;
  const yBand = DepthWY(DEPTH_NEAR) + 8 * s;
  const x0 = DepthWX(-120, DEPTH_NEAR);
  const x1 = DepthWX(levelW + 160, DEPTH_NEAR);
  const bandTop = Math.min(yBand, lipY - 8);
  const bandBot = Math.min(h, yBand + 54 * s);
  if (x1 > 0 && x0 < w && bandBot > bandTop) {
    const g = ctx.createLinearGradient(0, bandTop, 0, bandBot);
    g.addColorStop(0, pal.night ? "rgba(26,20,14,.0)" : "rgba(58,40,24,.0)");
    g.addColorStop(0.2, pal.night ? "#1a1410" : "#3a2818");
    g.addColorStop(1, dirt);
    ctx.fillStyle = g;
    ctx.fillRect(Math.max(0, x0), bandTop, Math.min(w, x1) - Math.max(0, x0) + 2, bandBot - bandTop);
  }

  // Dense overlapping soil nubs — texture only, never sparse floating trapezoids
  ctx.fillStyle = pal.night ? "#152016" : "#2a3820";
  for (let i = 0; i < 28; i++) {
    const x = ((i * 48 - camX * 1.55) % (w + 40)) - 16;
    const y0 = lipY + Math.sin((x + camX * 1.4) * 0.018) * 5;
    ctx.fillRect(x, y0 - 14, 4, 14);
  }
}

function DrawSoilCutaway(w, h, camX, pal) {
  // Layered earth cross-section: sky lip → surface ridge → soil strata
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(0.2, pal.skyBot);
  g.addColorStop(0.28, pal.earth);
  g.addColorStop(0.45, pal.soilLight);
  g.addColorStop(0.7, pal.soilMid);
  g.addColorStop(1, pal.soilDeep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const cutY = WY(SURFACE_Y);
  // Mini surface diorama ABOVE the cut — back houses on the ridge
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, Math.max(0, cutY));
  ctx.clip();
  DrawDepthBackdrop(w, h, camX, pal);
  for (const [, band] of PropsBehindBands(state.level.props)) {
    for (const prop of band) DrawProp(prop, pal, 0.55);
  }
  ctx.restore();

  // Thick cut lip (front edge of the surface plane)
  ctx.fillStyle = pal.night ? "#2a2218" : "#5a3e28";
  ctx.fillRect(0, cutY - 6, w, 14);
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, cutY);
  ctx.lineTo(w, cutY);
  ctx.stroke();
  // Soil grain under cut
  ctx.strokeStyle = "rgba(20,12,8,.2)";
  for (let i = 0; i < 30; i++) {
    const x = ((i * 48 - camX * 0.3) % (w + 40)) - 10;
    ctx.beginPath();
    ctx.moveTo(x, cutY + 20);
    ctx.lineTo(x + 30, cutY + 80 + (i % 5) * 10);
    ctx.stroke();
  }
}

/** Role glyph for a speaker / faction name. */
function RoleIconForSpeaker(speaker) {
  const name = String(speaker || "");
  if (/高传宝|^传宝$/.test(name)) return "roleHero";
  if (/高老忠|赵平原/.test(name)) return "roleElder";
  if (/林霞|大娘/.test(name)) return "roleWoman";
  if (/乡亲|小伙/.test(name)) return "people";
  if (/特务|武工/.test(name)) return "roleSpy";
  if (/伪军/.test(name)) return "rolePuppet";
  if (/鬼子|日军|山田|机枪手/.test(name)) return "roleIjp";
  if (/民兵/.test(name)) return "roleMilitia";
  return "roleMilitia";
}

/** Player-facing faction plate for enemies / surface hostiles. */
function EnemyHudPlate(ent) {
  const faction = EnemyFaction(ent);
  let name = ent.label || (faction === "puppet" ? "伪军" : "日军");
  if (name === "鬼子" || name === "巡逻") name = "日军";
  if (ent.cover) name = `${name}·掩`;
  if (ent.broken) name = `${name}·退`;
  return {
    name,
    icon: faction === "puppet" ? "rolePuppet" : "roleIjp",
    palette: faction === "puppet" ? "puppet" : "ijp",
  };
}

/**
 * Always-on head / landmark plate: cutout role glyph + readable Chinese name.
 * Expects ctx already translated to the actor's / prop's feet.
 */
function DrawNameplate(label, iconKind, headY, s) {
  const text = String(label || "").trim();
  if (!text) return;
  const icon = 13 * s;
  const padX = 4 * s;
  const padY = 3 * s;
  const gap = 3 * s;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.font = `700 ${11 * s}px "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width;
  const w = padX * 2 + icon + gap + tw;
  const h = Math.max(icon + padY * 2, 16 * s);
  const x0 = -w / 2;
  const y0 = headY - h;
  ctx.fillStyle = "rgba(239,226,200,.94)";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = Math.max(1.5, 1.8 * s);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x0, y0, w, h, 3 * s);
  else ctx.rect(x0, y0, w, h);
  ctx.fill();
  ctx.stroke();
  DrawPictogram(iconKind, x0 + padX, y0 + (h - icon) / 2, icon);
  ctx.fillStyle = "#1a1410";
  ctx.font = `700 ${11 * s}px "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x0 + padX + icon + gap, y0 + h / 2);
  ctx.restore();
}

function DrawProp(prop, pal, alphaMul = 1) {
  const depth = prop.depth ?? 0;
  const s = Scale() * ScaleOf(depth);
  const x = DepthWX(prop.x, depth);
  const y = DepthWY(depth);
  if (x < -200 || x > (canvas.clientWidth || innerWidth) + 200) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = TintAlpha(depth) * alphaMul;
  ctx.lineWidth = Math.max(1.5, 2.4 * s);
  ctx.strokeStyle = depth >= 1 ? "#0e0a08" : "#1c1712";

  // Contact shadow — stronger / wider toward camera
  const shadowW = (depth >= 2 ? 46 : depth >= 1 ? 34 : depth < 0 ? 18 : 26) * s;
  const shadowA = depth >= 1 ? 0.35 : depth < 0 ? 0.12 : 0.22;
  ctx.fillStyle = `rgba(10,6,4,${shadowA})`;
  ctx.beginPath();
  if (typeof ctx.ellipse === "function") ctx.ellipse(0, 4 * s, shadowW, 5 * s, 0, 0, Math.PI * 2);
  else ctx.arc(0, 4 * s, shadowW * 0.45, 0, Math.PI * 2);
  ctx.fill();

  const cool = depth < 0;
  const ink = cool ? (pal.night ? "#1a221c" : "#3a4a38") : "#1c1712";

  if (prop.kind === "house" || prop.kind === "farHouse") {
    const bw = (prop.kind === "farHouse" ? 42 : 96) * s;
    const bh = (prop.kind === "farHouse" ? 34 : 74) * s;
    ctx.fillStyle = cool ? (pal.night ? "#2a3228" : "#7a6a52") : prop.variant ? "#b8956a" : "#c4a27a";
    ctx.fillRect(-bw / 2, -bh, bw, bh);
    ctx.strokeStyle = ink;
    ctx.strokeRect(-bw / 2, -bh, bw, bh);
    ctx.fillStyle = cool ? "#3a2820" : "#6e2a1c";
    ctx.beginPath();
    ctx.moveTo(-bw / 2 - 6 * s, -bh);
    ctx.lineTo(0, -bh - (prop.kind === "farHouse" ? 14 : 28) * s);
    ctx.lineTo(bw / 2 + 6 * s, -bh);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (prop.kind === "house") {
      ctx.fillStyle = "#3a2418";
      ctx.fillRect(-10 * s, -36 * s, 20 * s, 36 * s);
    }
  } else if (prop.kind === "shed") {
    ctx.fillStyle = cool ? "#5a4a38" : "#8a7355";
    ctx.fillRect(-28 * s, -36 * s, 56 * s, 36 * s);
    ctx.strokeRect(-28 * s, -36 * s, 56 * s, 36 * s);
    ctx.fillStyle = "#4a3020";
    ctx.fillRect(-32 * s, -44 * s, 64 * s, 10 * s);
  } else if (prop.kind === "stack") {
    ctx.fillStyle = "#6a5a40";
    ctx.fillRect(-14 * s, -22 * s, 28 * s, 22 * s);
    ctx.strokeRect(-14 * s, -22 * s, 28 * s, 22 * s);
  } else if (prop.kind === "tree") {
    ctx.fillStyle = depth >= 1 ? "#2a1c12" : "#5c4030";
    const trunkH = (depth >= 2 ? 130 : 100) * s;
    ctx.fillRect(-7 * s, -trunkH, 14 * s, trunkH);
    ctx.fillStyle = depth >= 1 ? "#2a3828" : "#4f6344";
    ctx.beginPath();
    ctx.arc(0, -trunkH - 8 * s, (depth >= 2 ? 48 : 36) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (prop.kind === "bush") {
    // Trunk + multi-lobe foliage — must read as 灌木, not a floating egg.
    const bh = (prop.tall ? 56 : 34) * s;
    ctx.fillStyle = depth >= 2 ? "#1a120c" : "#3a2a1c";
    ctx.fillRect(-5 * s, -bh * 0.4, 10 * s, bh * 0.5);
    ctx.fillStyle = depth >= 2 ? "#152016" : "#2a3824";
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(-10 * s, -bh * 0.45, 28 * s, bh * 0.42, 0, 0, Math.PI * 2);
    else ctx.arc(-10 * s, -bh * 0.45, 22 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(14 * s, -bh * 0.4, 30 * s, bh * 0.48, 0, 0, Math.PI * 2);
    else ctx.arc(14 * s, -bh * 0.4, 24 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(0, -bh * 0.7, 24 * s, bh * 0.38, 0, 0, Math.PI * 2);
    else ctx.arc(0, -bh * 0.7, 18 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(0, -bh * 0.5, 36 * s, bh * 0.55, 0, 0, Math.PI * 2);
    else ctx.arc(0, -bh * 0.5, 28 * s, 0, Math.PI * 2);
    ctx.stroke();
  } else if (prop.kind === "wheat") {
    // Golden stalk clump / grain heads — multi-row field patch; mid/far read as continuous 麦田.
    const coolFar = depth <= -2;
    const farHaze = depth <= -3;
    const stem = farHaze
      ? pal.night
        ? "#2e3420"
        : "#6a7848"
      : coolFar
        ? pal.night
          ? "#3a4228"
          : "#8a9858"
        : depth >= 1
          ? "#2e220c"
          : "#8a6a24";
    const head = farHaze
      ? pal.night
        ? "#3a4228"
        : "#9aaa60"
      : coolFar
        ? pal.night
          ? "#4a5230"
          : "#b0bc70"
        : depth >= 1
          ? "#5a4020"
          : "#e0b24a";
    const tip = farHaze
      ? pal.night
        ? "#4a5230"
        : "#b0c078"
      : coolFar
        ? pal.night
          ? "#5a6238"
          : "#c8d488"
        : depth >= 1
          ? "#6a4e28"
          : "#f0c86a";
    const rows = Math.max(1, Math.min(3, prop.rows || 1));
    const n = Math.max(6, Math.min(18, prop.clump || 10));
    const gap = (farHaze ? 3.2 : coolFar ? 3.6 : 4.6) * s;
    for (let row = 0; row < rows; row++) {
      const yOff = row * (farHaze ? 5 : coolFar ? 7 : 9) * s;
      const xOff = (row - (rows - 1) / 2) * 2.5 * s;
      for (let i = 0; i < n; i++) {
        const ox = xOff + (i - (n - 1) / 2) * gap;
        const stalkH =
          (farHaze ? 18 : coolFar ? 26 : 40) * s + ((i + row * 3) % 4) * (farHaze ? 2.5 : 4.5) * s;
        const bend =
          Math.sin(i * 1.7 + row * 0.9 + (prop.x || 0) * 0.01) * (farHaze ? 2 : coolFar ? 3 : 5) * s;
        ctx.strokeStyle = stem;
        ctx.lineWidth = Math.max(1, (farHaze ? 1.1 : coolFar ? 1.35 : 1.8) * s);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ox, 2 * s + yOff);
        ctx.quadraticCurveTo(ox + bend, -stalkH * 0.55 + yOff, ox + bend * 0.45, -stalkH + yOff);
        ctx.stroke();
        const hx = ox + bend * 0.45;
        const hy = -stalkH - 2 * s + yOff;
        ctx.fillStyle = (i + row) % 2 === 0 ? head : tip;
        ctx.beginPath();
        if (typeof ctx.ellipse === "function") {
          ctx.ellipse(hx, hy, (farHaze ? 1.8 : 2.4) * s, (farHaze ? 4 : 5.5) * s, bend * 0.03, 0, Math.PI * 2);
        } else {
          ctx.arc(hx, hy, (farHaze ? 2.2 : 3) * s, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
  } else if (prop.kind === "post") {
    ctx.fillStyle = "#1a120c";
    ctx.fillRect(-4 * s, -62 * s, 8 * s, 62 * s);
    ctx.fillRect(-22 * s, -58 * s, 44 * s, 5 * s);
  } else if (prop.kind === "mudbank") {
    // Legacy: continuous ground is DrawContinuousNearGround — skip floating traps
  } else if (prop.kind === "lantern") {
    ctx.fillStyle = "#c9a45a";
    ctx.globalAlpha *= 0.7;
    ctx.beginPath();
    ctx.arc(0, -40 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === "well") {
    // Village well: posts + beam + crank + bucket + stone curb — labeled below.
    ctx.fillStyle = "#5a4a38";
    ctx.fillRect(-18 * s, -54 * s, 7 * s, 42 * s);
    ctx.fillRect(11 * s, -54 * s, 7 * s, 42 * s);
    ctx.fillStyle = "#6a5a40";
    ctx.fillRect(-22 * s, -58 * s, 44 * s, 8 * s);
    ctx.fillRect(20 * s, -56 * s, 12 * s, 5 * s);
    ctx.fillRect(28 * s, -66 * s, 5 * s, 14 * s);
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.2, 1.8 * s);
    ctx.beginPath();
    ctx.moveTo(0, -50 * s);
    ctx.lineTo(0, -28 * s);
    ctx.stroke();
    ctx.fillStyle = "#8a6a40";
    ctx.fillRect(-7 * s, -30 * s, 14 * s, 11 * s);
    ctx.strokeRect(-7 * s, -30 * s, 14 * s, 11 * s);
    ctx.fillStyle = "#7a7264";
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(0, -8 * s, 22 * s, 11 * s, 0, 0, Math.PI * 2);
    else ctx.arc(0, -8 * s, 18 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.fillStyle = "#2a241c";
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(0, -8 * s, 11 * s, 5 * s, 0, 0, Math.PI * 2);
    else ctx.arc(0, -8 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();
    DrawNameplate("水井", "well", -72 * s, s);
  } else if (prop.kind === "bell") {
    ctx.fillStyle = "#c9a45a";
    ctx.beginPath();
    ctx.moveTo(-14 * s, -100 * s);
    ctx.lineTo(14 * s, -100 * s);
    ctx.lineTo(18 * s, -58 * s);
    ctx.lineTo(0, -46 * s);
    ctx.lineTo(-18 * s, -58 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (prop.kind === "blockhouse") {
    ctx.fillStyle = cool ? "#3a3834" : "#5a5852";
    ctx.fillRect(-70 * s, -150 * s, 140 * s, 150 * s);
    ctx.fillStyle = "#3e3c38";
    ctx.fillRect(-45 * s, -200 * s, 90 * s, 50 * s);
    ctx.strokeRect(-70 * s, -150 * s, 140 * s, 150 * s);
    ctx.strokeRect(-45 * s, -200 * s, 90 * s, 50 * s);
  }
  ctx.restore();
}

/** Front soil lips that paint OVER the digger — tunnel 2.5D occlusion. */
/**
 * Soft front occlusion for the dig corridor.
 * Only shade the inward face of walls that touch AIR — never paint floor /
 * ceiling cells under the digger (those used to read as two mystery bars).
 */
function DrawTunnelFrontLips(pal) {
  const soil = state.level.soil;
  if (!soil) return;
  const s = Scale();
  const { cam0, cam1 } = CameraCullX(160);
  const px = state.player.x;
  const py = state.player.y;
  const lipW = Math.max(3, 5 * s);
  for (let r = 0; r < soil.rows; r++) {
    for (let c = 0; c < soil.cols; c++) {
      if (soil.cells[r][c] === AIR) continue;
      const rect = CellWorldRect(soil, c, r);
      if (rect.x + rect.w < cam0 || rect.x > cam1) continue;
      if (Math.abs(rect.x + rect.w / 2 - px) > 160) continue;
      if (rect.y > py + 30 || rect.y + rect.h < py - 90) continue;

      const airLeft = c > 0 && soil.cells[r][c - 1] === AIR;
      const airRight = c < soil.cols - 1 && soil.cells[r][c + 1] === AIR;
      // Floor (AIR above) / ceiling (AIR below) are walk planes — skip the old
      // top+bottom bars that looked like unexplained stripes under the feet.
      if (!airLeft && !airRight) continue;

      const x = WX(rect.x);
      const y = WY(rect.y);
      const rw = rect.w * s;
      const rh = rect.h * s;
      ctx.fillStyle = "rgba(14,8,5,.5)";
      if (airLeft) ctx.fillRect(x, y, lipW, rh);
      if (airRight) ctx.fillRect(x + rw - lipW, y, lipW, rh);
    }
  }
  // No bottom-of-screen dirt ellipses — they read as mystery eggs under the dig band.
}

function DrawShaft(shaft) {
  const s = Scale();
  const x = WX(shaft.x);
  const y = WY(SURFACE_Y);
  if (!state.player.inTunnel) {
    ctx.fillStyle = "#2a1c12";
    ctx.fillRect(x - 18 * s, y - 6 * s, 36 * s, 10 * s);
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 18 * s, y - 6 * s, 36 * s, 10 * s);
    DrawPictogram("hatch", x - 10 * s, y - 36 * s, 20 * s);
  }
}

function DrawPlanOverlay(pal) {
  const soil = state.level.soil;
  if (!soil?.plan) return;
  const s = Scale();
  const { cam0, cam1 } = CameraCullX(160);
  for (let r = 0; r < soil.rows; r++) {
    for (let c = 0; c < soil.cols; c++) {
      if (!soil.plan[r][c]) continue;
      const rect = CellWorldRect(soil, c, r);
      if (rect.x + rect.w < cam0 || rect.x > cam1) continue;
      const x = WX(rect.x);
      const y = WY(rect.y);
      const w = rect.w * s;
      const h = rect.h * s;
      ctx.fillStyle = "rgba(80,160,220,.28)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(120,200,255,.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.setLineDash([]);
    }
  }
  if (state.designMode && state.planCursor) {
    const rect = CellWorldRect(soil, state.planCursor.c, state.planCursor.r);
    const x = WX(rect.x);
    const y = WY(rect.y);
    const w = rect.w * s;
    const h = rect.h * s;
    ctx.strokeStyle = "#f0c27a";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(240,194,122,.2)";
    ctx.fillRect(x, y, w, h);
  }
}

/** Wrap a string into lines that fit maxW (canvas font must already be set). */
function WrapTextLines(text, maxW, maxLines = 4) {
  const lines = [];
  let line = "";
  for (const ch of String(text || "")) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) return lines;
    } else line = test;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function ComicBubbleAnchor(sub) {
  const s = Scale();
  // Narration / system lines float upper-center — not pinned to a body.
  // Keep the anchor mid-upper so the bubble (drawn above) still clears the top chrome.
  if (/旁白|提示|危险/.test(sub.speaker || "")) {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    return { x: w * 0.5, y: Math.max(h * 0.28, 120) };
  }
  let wx = sub.anchorX;
  let wy = sub.anchorY;
  if (sub.anchorId === "player" || wx == null) {
    wx = state.player.x;
    wy = state.player.y;
  } else if (sub.anchorId) {
    const ent = state.level.entities.find((e) => e.id === sub.anchorId);
    if (ent) {
      wx = ent.x;
      wy = ent.y;
    }
  }
  const crouch = sub.anchorId === "player" && state.player.crouching;
  return {
    x: WX(wx),
    y: WY(wy) - (crouch ? 48 : 72) * s,
  };
}

/**
 * Comic speech bubble over the speaker's head — who speaks is who wears the bubble.
 * Clamped inside the canvas: if the top would clip (common on PC), flip below the head.
 * E / Space / 互动 advances (see TryAdvanceActiveTalk).
 */
function DrawComicSpeechBubble(sub) {
  const s = Scale();
  const anchor = ComicBubbleAnchor(sub);
  const screenW = canvas.clientWidth || innerWidth;
  const screenH = canvas.clientHeight || innerHeight;
  // Leave room for heart/pause chrome near the top edge.
  const topSafe = Math.max(52, screenH * 0.09);
  const botSafe = Math.max(24, screenH * 0.04);
  const maxInner = Math.min(280, screenW * 0.55);
  ctx.save();
  ctx.font = `600 ${Math.max(13, 15 * s)}px "Noto Serif SC", "Source Han Serif SC", serif`;
  const lines = WrapTextLines(sub.text, maxInner - 28 * s, 4);
  const lineH = 20 * s;
  const padX = 14 * s;
  const padY = 10 * s;
  const nameH = sub.speaker ? 16 * s : 0;
  let textW = 0;
  for (const ln of lines) textW = Math.max(textW, ctx.measureText(ln).width);
  if (sub.speaker) {
    ctx.font = `700 ${Math.max(11, 12 * s)}px "Noto Serif SC", "Source Han Serif SC", serif`;
    textW = Math.max(textW, ctx.measureText(sub.speaker).width);
  }
  const boxW = Math.max(72 * s, Math.min(maxInner, textW + padX * 2));
  const iconHint = 16 * s;
  const boxH = padY * 2 + nameH + lines.length * lineH + iconHint + 4 * s;
  let bx = anchor.x - boxW / 2;
  bx = Math.max(8, Math.min(screenW - boxW - 8, bx));

  // Prefer above the head; flip below when the bubble would leave the window.
  const gap = 10 * s;
  const tail = 11 * s;
  let by = anchor.y - boxH - gap;
  let below = false;
  if (by < topSafe) {
    const belowY = anchor.y + gap + tail * 0.35;
    if (belowY + boxH <= screenH - botSafe) {
      by = belowY;
      below = true;
    } else {
      by = Math.max(topSafe, Math.min(screenH - botSafe - boxH, by));
    }
  } else if (by + boxH > screenH - botSafe) {
    by = Math.max(topSafe, screenH - botSafe - boxH);
  }

  ctx.fillStyle = "#efe2c8";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = Math.max(2, 2.5 * s);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, boxW, boxH, 8 * s);
  else ctx.rect(bx, by, boxW, boxH);
  ctx.fill();
  ctx.stroke();

  // Tail toward the speaker — points down when bubble is above, up when flipped below.
  const tipX = Math.max(bx + 16 * s, Math.min(bx + boxW - 16 * s, anchor.x));
  ctx.beginPath();
  if (below) {
    ctx.moveTo(tipX - 7 * s, by + 1);
    ctx.lineTo(tipX, by - tail);
    ctx.lineTo(tipX + 7 * s, by + 1);
  } else {
    ctx.moveTo(tipX - 7 * s, by + boxH - 1);
    ctx.lineTo(tipX, by + boxH + tail);
    ctx.lineTo(tipX + 7 * s, by + boxH - 1);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  let ty = by + padY;
  if (sub.speaker) {
    ctx.fillStyle = "#8a5a28";
    ctx.font = `700 ${Math.max(11, 12 * s)}px "Noto Serif SC", "Source Han Serif SC", serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(sub.speaker, bx + padX, ty);
    ty += nameH + 2 * s;
  }
  ctx.fillStyle = "#1a1410";
  ctx.font = `600 ${Math.max(13, 15 * s)}px "Noto Serif SC", "Source Han Serif SC", serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const ln of lines) {
    ctx.fillText(ln, bx + padX, ty);
    ty += lineH;
  }
  // Advance hint = talk pictogram (never a keyboard letter)
  DrawPictogram("talk", bx + boxW - padX - iconHint, by + boxH - padY - iconHint + 2 * s, iconHint);
  ctx.restore();
}

function DrawDialogueBanner() {
  const sub = state.subtitle;
  if (!sub || !sub.text) return;
  // Talk / story lines use the comic head bubble — no bottom strip.
  if (sub.comic) return;
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;
  const boxW = Math.min(720, w - 48);
  const x = (w - boxW) / 2;
  const y = h * 0.76;
  ctx.save();
  ctx.fillStyle = "rgba(15,12,10,.84)";
  ctx.strokeStyle = "#efe2c8";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, boxW, 96, 6);
  else ctx.rect(x, y, boxW, 96);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#c9a45a";
  ctx.font = "700 15px IBM Plex Sans, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(sub.speaker || "旁白", x + 16, y + 12);
  ctx.fillStyle = "#efe2c8";
  ctx.font = "400 16px IBM Plex Sans, sans-serif";
  const lines = WrapTextLines(sub.text, boxW - 32, 2);
  let ly = y + 34;
  for (const line of lines) {
    ctx.fillText(line, x + 16, ly);
    ly += 20;
  }
  DrawPictogram(state.designMode ? "hatch" : "talk", x + boxW - 30, y + 68, 16);
  ctx.restore();
}

function DrawSoilGrid(pal) {
  const soil = state.level.soil;
  if (!soil) return;
  const s = Scale();
  const { cam0, cam1 } = CameraCullX(160);
  for (let r = 0; r < soil.rows; r++) {
    for (let c = 0; c < soil.cols; c++) {
      const rect = CellWorldRect(soil, c, r);
      if (rect.x + rect.w < cam0 || rect.x > cam1) continue;
      const type = soil.cells[r][c];
      const x = WX(rect.x);
      const y = WY(rect.y);
      const w = rect.w * s;
      const h = rect.h * s;
      if (type === AIR) {
        ctx.fillStyle = pal.air || "#2a2118";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(90,70,45,.25)";
        ctx.strokeRect(x, y, w, h);
      } else if (type === SOFT) {
        ctx.fillStyle = pal.soft || "#9a6b3e";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(40,24,12,.35)";
        ctx.strokeRect(x, y, w, h);
        ctx.strokeStyle = "rgba(60,36,18,.2)";
        ctx.beginPath();
        ctx.moveTo(x + 4, y + h - 4);
        ctx.lineTo(x + w - 4, y + 4);
        ctx.stroke();
      } else if (type === HARD) {
        ctx.fillStyle = pal.hard || "#4a4540";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(0,0,0,.45)";
        ctx.strokeRect(x, y, w, h);
      }
    }
  }
  for (const zone of state.level.digZones || []) {
    if (state.goalsDone[zone.goal]) continue;
    const rect = CellWorldRect(soil, zone.c, zone.r);
    const x = WX(rect.x);
    const y = WY(rect.y);
    const w = zone.w * soil.cell * s;
    const h = zone.h * soil.cell * s;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "#c9a45a";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(201,164,90,.12)";
    ctx.fillRect(x, y, w, h);
    ctx.setLineDash([]);
    // VH: dashed zone only — shovel tick, no quest text
    DrawPictogram("shovel", x + 8, y + 8, 14 * s);
    ctx.restore();
  }
  const dig = state.player.digTarget;
  if (dig) {
    ctx.strokeStyle = "#f0c27a";
    ctx.lineWidth = 3;
    ctx.strokeRect(WX(dig.rect.x), WY(dig.rect.y), dig.rect.w * s, dig.rect.h * s);
  }
}

function DrawSurfaceExtras() {
  const s = Scale();
  for (const solid of state.level.surfaceSolids) {
    if (solid.id === "sg") continue;
    const x = WX(solid.x);
    const y = WY(solid.y);
    ctx.fillStyle = "#7a7264";
    ctx.strokeStyle = "#1c1712";
    ctx.fillRect(x, y, solid.w * s, solid.h * s);
    ctx.strokeRect(x, y, solid.w * s, solid.h * s);
  }
}

function DrawEntity(ent) {
  if (ent.hidden) return;
  const cutaway = state.phase === "play" && !!state.level.soil;
  if (!cutaway) {
    if (ent.layer === "tunnel" && !state.player.inTunnel) return;
    if (ent.layer === "surface" && state.player.inTunnel && ent.type !== "spy") return;
  }

  const s = Scale();
  const worldY =
    ent.type === "shot_port" && state.player.inTunnel && ent.tunnelY != null ? ent.tunnelY : ent.y;
  const x = WX(ent.x);
  const y = WY(worldY);
  ctx.save();
  ctx.translate(x, y);
  // Cutaway: other layer stays visible but quieter.
  if (cutaway && ent.layer === "tunnel" && !state.player.inTunnel) ctx.globalAlpha = 0.55;
  if (cutaway && ent.layer === "surface" && state.player.inTunnel && ent.type !== "spy") {
    ctx.globalAlpha = 0.5;
  }
  ctx.lineWidth = 2.5 * s;
  ctx.strokeStyle = "#1c1712";

  const glow = () => {
    // Foot ring under interactables — never a floating mystery ball behind the puppet.
    ctx.strokeStyle = "rgba(201,164,90,.9)";
    ctx.lineWidth = Math.max(1.5, 2.2 * s);
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(0, 2 * s, 18 * s, 5 * s, 0, 0, Math.PI * 2);
    else ctx.arc(0, 2 * s, 14 * s, 0, Math.PI * 2);
    ctx.stroke();
  };

  if (ent.kind === "pickup") {
    if (ent.taken) {
      ctx.restore();
      return;
    }
    if (Math.abs(state.player.x - ent.x) < 100) glow();
    const bob = Math.sin((performance.now() || 0) * 0.006) * 3 * s;
    ctx.translate(0, -18 * s + bob);
    const icon =
      ent.itemId === ITEM_SHOVEL
        ? "shovel"
        : ent.itemId === ITEM_CHARGE
          ? "charge"
          : ent.itemId === ITEM_GRENADE
            ? "grenade"
            : ent.itemId === ITEM_RIFLE || ent.itemId === ITEM_AMMO
              ? "shot"
              : "talk";
    DrawPictogram(icon, -12 * s, -12 * s, 24 * s);
    ctx.restore();
    return;
  }

  if (ent.type === "talk" || ent.type === "spy_talk" || ent.type === "shelter") {
    const nearTalk = Math.abs(state.player.x - ent.x) < 90;
    if (!ent.done && nearTalk) glow();
    const name = ent.speaker || (ent.type === "shelter" ? "乡亲" : "民兵");
    const pal = ent.type === "spy_talk" ? "spy" : PaletteForSpeaker(name);
    const following = ent.type === "shelter" && ent.following && !ent.done;
    const alpha = ent.done && ent.type === "shelter" ? 0.35 : 1;
    DrawPuppet(ctx, {
      x: 0,
      y: 0,
      facing: ent.facing || 1,
      scale: s,
      palette: pal,
      clip: following && ent.moving ? "walk" : "idle",
      time: ((performance.now() || 0) / 1000) + (ent.x || 0) * 0.01,
      moving: !!(following && ent.moving),
      alpha,
    });
    // Always-on who-is-who plate — puppets alone are not readable.
    DrawNameplate(
      following ? `${name}·跟上` : name,
      RoleIconForSpeaker(name),
      following ? -88 * s : -78 * s,
      s,
    );
  } else if (ent.type === "hatch") {
    if (Math.abs(state.player.x - ent.x) < 80) glow();
    ctx.fillStyle = "#2a1c12";
    ctx.fillRect(-20 * s, -8 * s, 40 * s, 10 * s);
    ctx.strokeStyle = "#c9a45a";
    ctx.strokeRect(-20 * s, -8 * s, 40 * s, 10 * s);
    DrawNameplate("地窖口", "hatch", -40 * s, s);
  } else if (ent.type === "bell") {
    if (Math.abs(state.player.x - ent.x) < 100) glow();
    ctx.fillStyle = ent.ringing ? "#f0c27a" : "#c9a45a";
    ctx.beginPath();
    ctx.moveTo(-14 * s, -96 * s);
    ctx.lineTo(14 * s, -96 * s);
    ctx.lineTo(18 * s, -54 * s);
    ctx.lineTo(0, -42 * s);
    ctx.lineTo(-18 * s, -54 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    DrawNameplate("警钟", "bell", -110 * s, s);
  } else if (ent.type === "flip_build" || ent.type === "flip_trap" || ent.type === "plant_zone" || ent.type === "signal") {
    if (!ent.done) glow();
    ctx.fillStyle = ent.done ? "#7a7264" : ent.type === "plant_zone" ? "#5a3a28" : "#a6452f";
    ctx.fillRect(-20 * s, -28 * s, 40 * s, 28 * s);
    ctx.strokeRect(-20 * s, -28 * s, 40 * s, 28 * s);
    if (ent.type === "plant_zone" && !ent.done) {
      DrawPictogram("charge", -10 * s, -48 * s, 20 * s);
    }
  } else if (ent.type === "shot_port") {
    const ready = !ent.requiresGoal || !!state.goalsDone[ent.requiresGoal];
    const nearPort = Math.abs(state.player.x - ent.x) < 70;
    if (ready && nearPort) glow();
    ctx.fillStyle = ready ? "#2f5d4a" : "#4a4538";
    ctx.fillRect(-17 * s, -26 * s, 34 * s, 26 * s);
    ctx.strokeRect(-17 * s, -26 * s, 34 * s, 26 * s);
    // Label only when the player is close enough to use it.
    if (ready && nearPort) {
      ctx.fillStyle = "#efe2c8";
      ctx.font = `700 ${11 * s}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(state.player.inTunnel ? "出井" : "开枪", 0, -34 * s);
    }
  } else if (ent.type === "mg_nest") {
    const gunner = state.level.entities.find((e) => e.id === "mg_gunner");
    const ready = !gunner || gunner.dead;
    const nearNest = Math.abs(state.player.x - ent.x) < 80;
    if (ready && nearNest && !state.player.manningMg) glow();
    const face = ent.facing || 1;
    // Sandbags
    ctx.fillStyle = "#6a5a3a";
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-28 * s, 0);
    ctx.lineTo(-22 * s, -22 * s);
    ctx.lineTo(22 * s, -22 * s);
    ctx.lineTo(28 * s, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Barrel
    ctx.fillStyle = state.player.manningMg ? "#2a241c" : "#3a3228";
    ctx.fillRect(face > 0 ? 4 * s : -30 * s, -30 * s, 26 * s, 6 * s);
    ctx.strokeRect(face > 0 ? 4 * s : -30 * s, -30 * s, 26 * s, 6 * s);
    if (nearNest || state.player.manningMg) {
      ctx.fillStyle = "#efe2c8";
      ctx.font = `700 ${11 * s}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(state.player.manningMg ? "扫射中" : ready ? "抢机枪" : "先制枪手", 0, -40 * s);
    }
  } else if (ent.type === "sandbag") {
    if (ent.broken) {
      ctx.restore();
      return;
    }
    const w = (ent.w || 54) * s;
    ctx.fillStyle = "#6a5a3a";
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.lineTo(-w * 0.42, -26 * s);
    ctx.lineTo(w * 0.42, -26 * s);
    ctx.lineTo(w * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Stacked bag seams
    ctx.strokeStyle = "rgba(26,20,16,.55)";
    ctx.beginPath();
    ctx.moveTo(-w * 0.35, -12 * s);
    ctx.lineTo(w * 0.35, -12 * s);
    ctx.stroke();
  } else if (ent.type === "enemy") {
    let alpha = 1;
    if (ent.dead) alpha = ent.ko ? 0.4 : 0.28;
    else if (ent.hurtFlash > 0) alpha = 0.55 + Math.sin(ent.hurtFlash * 40) * 0.35;
    const facing =
      ent.facing ||
      (ent.alert > 0 ? Math.sign((ent.alertX ?? ent.x) - ent.x) || 1 : Math.sin((ent.t || 0) * 0.7) >= 0 ? 1 : -1);
    const plate = EnemyHudPlate(ent);
    DrawPuppet(ctx, {
      x: 0,
      y: ent.dead ? 10 * s : 0,
      facing,
      scale: s,
      palette: plate.palette,
      clip: ent.dead ? "crouch" : ent.alert > 0 || ent.highAlert ? "alert" : "walk",
      time: ent.t || 0,
      moving: !ent.dead,
      alert: (ent.alert || 0) > 0 || !!ent.highAlert,
      hold: !ent.dead && plate.palette === "ijp" ? "rifle" : null,
      alpha,
    });
    const near = Math.abs(state.player.x - ent.x) < 150;
    const engaged = (ent.alert || 0) > 0 || !!ent.highAlert || (ent.hurtFlash || 0) > 0;
    if (!ent.dead) {
      // Always-on nameplate; cones / HP bars still on demand.
      if (engaged) {
        ctx.fillStyle = ent.highAlert ? "rgba(180,40,30,.4)" : "rgba(155,47,47,.28)";
        ctx.beginPath();
        ctx.moveTo(0, -18 * s);
        ctx.lineTo(facing * 72 * s, -44 * s);
        ctx.lineTo(facing * 72 * s, 8 * s);
        ctx.closePath();
        ctx.fill();
      }
      const maxHp = ent.maxHp || 2;
      const hp = Math.max(0, ent.hp || 0);
      DrawNameplate(plate.name, plate.icon, -78 * s, s);
      if (engaged || (near && hp < maxHp)) {
        ctx.fillStyle = "#1a1410";
        ctx.fillRect(-16 * s, -96 * s, 32 * s, 5 * s);
        ctx.fillStyle = "#a6452f";
        ctx.fillRect(-16 * s, -96 * s, 32 * s * (hp / maxHp), 5 * s);
      }
      if (ent.highAlert && (engaged || near)) {
        ctx.fillStyle = "#a6452f";
        ctx.font = `700 ${10 * s}px "Noto Sans SC","PingFang SC",sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("警戒!", 0, -104 * s);
      }
    } else {
      DrawNameplate(
        ent.ko ? (ent.discovered ? "晕·被发现" : "晕倒") : ent.discovered ? "毙·被发现" : "毙命",
        plate.icon,
        -70 * s,
        s,
      );
    }
  } else if (ent.type === "spy") {
    DrawPuppet(ctx, {
      x: 0,
      y: 0,
      facing: 1,
      scale: s,
      palette: "spy",
      clip: ent.trapped ? "crouch" : ent.exposed ? "walk" : "idle",
      time: ((performance.now() || 0) / 1000),
      moving: !!(ent.exposed && !ent.trapped),
      alpha: ent.trapped ? 0.55 : 1,
    });
    DrawNameplate(ent.trapped ? "特务·陷" : ent.exposed ? "特务" : "行商?", "roleSpy", -78 * s, s);
  } else if (ent.type === "patrol") {
    const facing = ent.facing === 1 || ent.facing === -1
      ? ent.facing
      : Math.cos((ent.t || 0) * 0.65) >= 0
        ? 1
        : -1;
    // Surface hostiles are 日军 / 伪军 — never a vague "巡逻" plate.
    if (!ent.label) ent.label = "日军";
    if (!ent.faction) ent.faction = "ijp";
    const plate = EnemyHudPlate(ent);
    const down = !!(ent.broken || ent.ko || ent.dead);
    DrawPuppet(ctx, {
      x: 0,
      y: 0,
      facing,
      scale: s,
      palette: plate.palette,
      clip: down ? "crouch" : "walk",
      time: ent.t || 0,
      moving: !down,
      hold: !down && plate.palette === "ijp" ? "rifle" : null,
      alpha: down ? 0.55 : 1,
    });
    DrawNameplate(down ? "晕倒" : plate.name, plate.icon, -78 * s, s);
    // Cone only when the player is close — not a permanent walking HUD.
    if (!down && Math.abs(state.player.x - ent.x) < 160) {
      ctx.fillStyle = "rgba(155,47,47,.22)";
      ctx.beginPath();
      ctx.moveTo(0, -20 * s);
      ctx.lineTo(facing * 80 * s, -50 * s);
      ctx.lineTo(facing * 80 * s, 10 * s);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function DrawPictogram(kind, x, y, size) {
  ctx.save();
  const plate = PICTO_IMG[kind] || null;
  // Transparent cutout glyphs — cream plate is drawn by us, ink by the PNG.
  if (plate && plate.complete && plate.naturalWidth > 0) {
    ctx.fillStyle = "#efe2c8";
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.fillRect(x, y, size, size);
    ctx.strokeRect(x, y, size, size);
    const m = size * 0.1;
    ctx.drawImage(plate, x + m, y + m, size - m * 2, size - m * 2);
    ctx.restore();
    return;
  }
  ctx.translate(x, y);
  ctx.strokeStyle = "#1a1410";
  ctx.fillStyle = "#efe2c8";
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeRect(0, 0, size, size);
  ctx.strokeStyle = "#1a1410";
  ctx.fillStyle = "#1a1410";
  const m = size * 0.12;
  const d = size - m * 2;
  if (kind === "shovel" || kind === "dig") {
    // Fallback: T-grip + pointed spade (readable without the PNG).
    ctx.beginPath();
    ctx.moveTo(m + d * 0.28, m + d * 0.08);
    ctx.lineTo(m + d * 0.72, m + d * 0.08);
    ctx.lineTo(m + d * 0.72, m + d * 0.22);
    ctx.lineTo(m + d * 0.58, m + d * 0.22);
    ctx.lineTo(m + d * 0.58, m + d * 0.58);
    ctx.lineTo(m + d * 0.78, m + d * 0.58);
    ctx.lineTo(m + d * 0.5, m + d * 0.98);
    ctx.lineTo(m + d * 0.22, m + d * 0.58);
    ctx.lineTo(m + d * 0.42, m + d * 0.58);
    ctx.lineTo(m + d * 0.42, m + d * 0.22);
    ctx.lineTo(m + d * 0.28, m + d * 0.22);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "hatch" || kind === "climb_out") {
    // Fallback: dirt mound + arched tunnel mouth + ladder.
    ctx.beginPath();
    ctx.moveTo(m + d * 0.05, m + d * 0.95);
    ctx.quadraticCurveTo(m + d * 0.15, m + d * 0.35, m + d * 0.5, m + d * 0.28);
    ctx.quadraticCurveTo(m + d * 0.85, m + d * 0.35, m + d * 0.95, m + d * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#efe2c8";
    ctx.beginPath();
    ctx.moveTo(m + d * 0.32, m + d * 0.55);
    ctx.quadraticCurveTo(m + d * 0.5, m + d * 0.38, m + d * 0.68, m + d * 0.55);
    ctx.lineTo(m + d * 0.68, m + d * 0.92);
    ctx.lineTo(m + d * 0.32, m + d * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = Math.max(1.2, size * 0.06);
    ctx.beginPath();
    ctx.moveTo(m + d * 0.4, m + d * 0.58);
    ctx.lineTo(m + d * 0.4, m + d * 0.88);
    ctx.moveTo(m + d * 0.6, m + d * 0.58);
    ctx.lineTo(m + d * 0.6, m + d * 0.88);
    ctx.moveTo(m + d * 0.4, m + d * 0.68);
    ctx.lineTo(m + d * 0.6, m + d * 0.68);
    ctx.moveTo(m + d * 0.4, m + d * 0.8);
    ctx.lineTo(m + d * 0.6, m + d * 0.8);
    ctx.stroke();
  } else if (kind === "bell") {
    ctx.beginPath();
    ctx.moveTo(m + d * 0.2, m + d * 0.25);
    ctx.lineTo(m + d * 0.8, m + d * 0.25);
    ctx.lineTo(m + d * 0.85, m + d * 0.7);
    ctx.lineTo(m + d * 0.5, m + d * 0.9);
    ctx.lineTo(m + d * 0.15, m + d * 0.7);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "talk") {
    ctx.beginPath();
    ctx.ellipse(m + d * 0.5, m + d * 0.4, d * 0.4, d * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(m + d * 0.35, m + d * 0.65);
    ctx.lineTo(m + d * 0.25, m + d * 0.95);
    ctx.lineTo(m + d * 0.55, m + d * 0.7);
    ctx.fill();
  } else if (kind === "people") {
    ctx.beginPath();
    ctx.arc(m + d * 0.35, m + d * 0.3, d * 0.15, 0, Math.PI * 2);
    ctx.arc(m + d * 0.65, m + d * 0.3, d * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(m + d * 0.2, m + d * 0.5, d * 0.25, d * 0.45);
    ctx.fillRect(m + d * 0.55, m + d * 0.5, d * 0.25, d * 0.45);
  } else if (kind === "flip") {
    ctx.strokeRect(m, m + d * 0.35, d, d * 0.35);
    ctx.beginPath();
    ctx.moveTo(m + d * 0.2, m + d * 0.35);
    ctx.lineTo(m + d * 0.5, m + d * 0.1);
    ctx.lineTo(m + d * 0.8, m + d * 0.35);
    ctx.stroke();
  } else if (kind === "shot" || kind === "rifle") {
    ctx.fillRect(m, m + d * 0.4, d * 0.7, d * 0.2);
    ctx.fillRect(m + d * 0.55, m + d * 0.25, d * 0.15, d * 0.5);
  } else if (kind === "charge") {
    ctx.beginPath();
    ctx.arc(m + d * 0.5, m + d * 0.55, d * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(m + d * 0.45, m + d * 0.1, d * 0.1, d * 0.25);
  } else if (kind === "warn") {
    ctx.beginPath();
    ctx.moveTo(m + d * 0.5, m);
    ctx.lineTo(m + d, m + d);
    ctx.lineTo(m, m + d);
    ctx.closePath();
    ctx.fillStyle = "#c9a45a";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1a1410";
    ctx.fillRect(m + d * 0.45, m + d * 0.3, d * 0.1, d * 0.35);
    ctx.fillRect(m + d * 0.45, m + d * 0.75, d * 0.1, d * 0.1);
  } else if (kind === "grenade") {
    ctx.fillRect(m + d * 0.42, m + d * 0.05, d * 0.16, d * 0.45);
    ctx.beginPath();
    ctx.ellipse(m + d * 0.5, m + d * 0.72, d * 0.28, d * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "check") {
    ctx.beginPath();
    ctx.moveTo(m + d * 0.15, m + d * 0.5);
    ctx.lineTo(m + d * 0.4, m + d * 0.75);
    ctx.lineTo(m + d * 0.85, m + d * 0.25);
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(m + d * 0.5, m + d * 0.5, d * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function DrawSpeechBubble() {
  const sub = state.subtitle;
  // Comic dialogue: text bubble over whoever is speaking
  if (sub?.text && sub.comic) {
    DrawComicSpeechBubble(sub);
    return;
  }
  // Icon-only feedback (no spoken line)
  const b = state.bubble;
  if (!b || !b.icons?.length || b.mutter) return;
  const s = Scale();
  const x = WX(state.player.x);
  const y = WY(state.player.y) - (state.player.crouching ? 40 : 70) * s;
  const iconSize = 22 * s;
  const pad = 8 * s;
  const gap = 4 * s;
  const w = pad * 2 + b.icons.length * iconSize + (b.icons.length - 1) * gap;
  const h = pad * 2 + iconSize;
  const screenW = canvas.clientWidth || innerWidth;
  const screenH = canvas.clientHeight || innerHeight;
  const topSafe = Math.max(52, screenH * 0.09);
  let bx = Math.max(8, Math.min(screenW - w - 8, x - w / 2));
  let by = y - h - 12 * s;
  let below = false;
  if (by < topSafe) {
    by = y + 14 * s;
    below = true;
    if (by + h > screenH - 24) by = Math.max(topSafe, screenH - 24 - h);
  }
  ctx.save();
  ctx.fillStyle = "#efe2c8";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, w, h, 4 * s);
  else ctx.rect(bx, by, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  if (below) {
    ctx.moveTo(x - 6 * s, by + 1);
    ctx.lineTo(x, by - 10 * s);
    ctx.lineTo(x + 6 * s, by + 1);
  } else {
    ctx.moveTo(x - 6 * s, by + h);
    ctx.lineTo(x, by + h + 10 * s);
    ctx.lineTo(x + 6 * s, by + h);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  b.icons.forEach((icon, i) => {
    DrawPictogram(icon, bx + pad + i * (iconSize + gap), by + pad, iconSize);
  });
  ctx.restore();
}

function DrawInteractPromptWorld() {
  const hint = state.interactHint;
  if (!hint) return;
  const s = Scale();
  const x = WX(state.player.x);
  const y = WY(state.player.y) - 8 * s;
  const icon =
    hint === "dig" || hint === "need_shovel" || hint === "pickup" || hint === "follow_plan"
      ? "shovel"
      : hint === "hatch" || hint === "climb_out" || hint === "design" || hint === "need_plan"
        ? "hatch"
        : hint === "bell"
          ? "bell"
          : hint === "shelter"
            ? "people"
            : hint === "shot_port" ||
                hint === "shoot" ||
                hint === "ads" ||
                hint === "need_ammo" ||
                hint === "mg_nest"
              ? "shot"
              : hint === "stealth_ko" || hint === "melee_risky"
                ? "warn"
                : hint === "flip_build" || hint === "flip_trap"
                  ? "flip"
                  : hint === "plant_zone" || hint === "signal"
                    ? "charge"
                    : "talk";
  // Icon-only float — never keyboard letters (E/J/F)
  const ix = x + 22 * s;
  const iy = y - 56 * s;
  const size = 22 * s;
  ctx.save();
  ctx.fillStyle = "#efe2c8";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(ix - 4 * s, iy - 4 * s, size + 8 * s, size + 8 * s, 4 * s);
  else ctx.rect(ix - 4 * s, iy - 4 * s, size + 8 * s, size + 8 * s);
  ctx.fill();
  ctx.stroke();
  DrawPictogram(icon, ix, iy, size);
  if (hint === "need_shovel" || hint === "need_ammo" || hint === "stealth_ko" || hint === "melee_risky") {
    DrawPictogram("warn", ix + size + 4 * s, iy + 2 * s, 14 * s);
  }
  if (hint === "dig" && state.player.digging) {
    ctx.strokeStyle = "#a6452f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      ix + size / 2,
      iy + size / 2,
      size * 0.72,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * state.player.digProgress,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function DrawPlayer() {
  const p = state.player;
  const s = Scale();
  const x = WX(p.x);
  const y = WY(p.y);
  const blink = p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0;
  const digging = (p.digSwingT || 0) > 0 || !!p.digging;
  const hold =
    p.held === ITEM_SHOVEL || digging
      ? "shovel"
      : p.held === ITEM_CHARGE
        ? "charge"
        : p.held === ITEM_GRENADE
          ? "grenade"
          : p.held === ITEM_RIFLE
            ? "rifle"
            : null;
  // Spine-style modular puppet — walk / crouch / dig / hungry melee clips
  if (p._animT == null) p._animT = 0;
  const now = (performance.now() || 0) / 1000;
  const animDt = p._animLastTs != null ? Math.min(0.05, Math.max(0, now - p._animLastTs)) : 0.016;
  p._animLastTs = now;
  const moving = Math.abs(p.vx || 0) > 18;
  const melee = (p.meleeT || 0) > 0;
  const clip = PickClip({
    melee,
    digging,
    crouching: !!p.crouching && !melee && !digging,
    vx: p.vx,
    moving: moving && !melee && !digging,
  });
  if (p._animClip !== clip) {
    p._animT = 0;
    p._animClip = clip;
  }
  if (melee) {
    // Drive strike from remaining meleeT so the chop lands mid-window.
    p._animT = Math.max(0, MELEE_DURATION - p.meleeT);
  } else if (digging && (p.digSwingT || 0) > 0) {
    // Drive shovel chop from remaining digSwingT (coil → bite → settle).
    p._animT = Math.max(0, DIG_SWING_DURATION - p.digSwingT);
  } else {
    p._animT = AdvanceClipTime(clip, p._animT, animDt, {
      vx: p.vx,
      refSpeed: clip === "crouchWalk" ? 120 : 220,
    });
  }
  DrawPuppet(ctx, {
    x,
    y,
    facing: melee && p.meleeFacing ? p.meleeFacing : p.facing,
    scale: s,
    palette: "militia",
    clip,
    time: p._animT,
    hold: melee ? null : hold,
    digging,
    crouching: !!p.crouching && !melee && !digging,
    vx: p.vx,
    moving,
    alpha: blink ? 0.4 : 1,
  });
  ctx.save();
  ctx.translate(x, y);
  DrawNameplate("高传宝", "roleHero", p.crouching || digging ? -58 * s : -78 * s, s);
  ctx.restore();
}

/** Dirt chips + cell flash + shovel slash when a dig bite lands. */
function DrawDigFx() {
  const fx = state.digFx;
  if (!fx || fx.timer <= 0) return;
  const s = Scale();
  const maxT = 0.5;
  const u = Math.max(0, Math.min(1, fx.timer / maxT));

  if ((fx.flash || 0) > 0 && state.level.soil) {
    const rect = CellWorldRect(state.level.soil, fx.cellC, fx.cellR);
    const a = Math.min(1, fx.flash / 0.2);
    const x = WX(rect.x);
    const y = WY(rect.y);
    const rw = rect.w * s;
    const rh = rect.h * s;
    ctx.fillStyle = `rgba(240,194,122,${0.4 * a})`;
    ctx.fillRect(x, y, rw, rh);
    ctx.strokeStyle = `rgba(239,226,200,${0.85 * a})`;
    ctx.lineWidth = Math.max(2, 2.5 * s);
    ctx.strokeRect(x + 1, y + 1, rw - 2, rh - 2);
  }

  // Impact crescent on the dug face (side wall / ceiling / floor).
  ctx.save();
  ctx.translate(WX(fx.x), WY(fx.y));
  ctx.globalAlpha = 0.3 + u * 0.5;
  ctx.strokeStyle = "#efe2c8";
  ctx.lineWidth = Math.max(2, 3 * s);
  const face = fx.facing || 1;
  const digDir = fx.dir || "side";
  const r = (14 + (1 - u) * 18) * s;
  ctx.beginPath();
  if (digDir === "up") ctx.arc(0, 0, r, Math.PI + 0.35, -0.35);
  else if (digDir === "down") ctx.arc(0, 0, r, 0.35, Math.PI - 0.35);
  else if (face > 0) ctx.arc(0, 0, r, -1.35, 0.75);
  else ctx.arc(0, 0, r, Math.PI - 0.75, Math.PI + 1.35);
  ctx.stroke();
  // Dust puff sprays out of the bite, not through the solid wall.
  ctx.fillStyle = `rgba(120,90,50,${0.2 + u * 0.25})`;
  const puffX = digDir === "side" ? -face * 6 * s : 0;
  const puffY = digDir === "up" ? 8 * s : digDir === "down" ? -8 * s : 4 * s;
  ctx.beginPath();
  if (typeof ctx.ellipse === "function") ctx.ellipse(puffX, puffY, 16 * s * (1.2 - u * 0.4), 7 * s, 0, 0, Math.PI * 2);
  else ctx.arc(puffX, puffY, 10 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  for (const ch of fx.chips || []) {
    if (ch.life <= 0) continue;
    const lifeU = Math.max(0, Math.min(1, ch.life / (ch.maxLife || 0.4)));
    ctx.save();
    ctx.translate(WX(ch.x), WY(ch.y));
    ctx.rotate(ch.rot || 0);
    ctx.globalAlpha = 0.35 + lifeU * 0.65;
    ctx.fillStyle = ch.tone === 1 ? "#5a3a1c" : ch.tone === 2 ? "#8a6a3a" : "#6a4a28";
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 1;
    const w = ch.size * s;
    const h = ch.size * s * 0.65;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.lineTo(-w * 0.15, -h);
    ctx.lineTo(w * 0.45, -h * 0.4);
    ctx.lineTo(w * 0.35, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/** Impact slash / fail burst for melee KO. */
function DrawMeleeFx() {
  const fx = state.meleeFx;
  if (!fx || fx.timer <= 0) return;
  const s = Scale();
  const x = WX(fx.x);
  const y = WY(fx.y);
  const maxT = fx.windup ? 0.35 : fx.ok ? 0.52 : 0.4;
  const u = Math.max(0, Math.min(1, fx.timer / maxT));
  ctx.save();
  ctx.translate(x, y);
  if (fx.windup) {
    // Coil telegraph — thin rising wedge before the chop lands.
    ctx.globalAlpha = 0.25 + (1 - u) * 0.35;
    ctx.strokeStyle = "rgba(239,226,200,.75)";
    ctx.lineWidth = 2 * s;
    const r = (10 + (1 - u) * 14) * s;
    ctx.beginPath();
    ctx.arc(0, 0, r, -2.2, -0.6);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.globalAlpha = 0.4 + u * 0.6;
  ctx.strokeStyle = fx.ok ? "#c44a2e" : "#efe2c8";
  ctx.fillStyle = fx.ok ? "rgba(196,74,46,.62)" : "rgba(239,226,200,.45)";
  ctx.lineWidth = 3.5 * s;
  const reach = (22 + (1 - u) * 22) * s;
  ctx.beginPath();
  ctx.moveTo(-reach * 0.25, -reach * 0.2);
  ctx.lineTo(reach, reach * 0.4);
  ctx.lineTo(reach * 0.5, -reach * 0.65);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Shock rings on a clean KO.
  const rings = fx.rings | 0;
  for (let i = 0; i < rings; i++) {
    const rr = (12 + (1 - u) * (18 + i * 10)) * s;
    ctx.globalAlpha = 0.15 + u * 0.35 * (1 - i * 0.25);
    ctx.beginPath();
    ctx.arc(reach * 0.35, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (!fx.ok) {
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(-12 * s, -12 * s);
    ctx.lineTo(12 * s, 12 * s);
    ctx.moveTo(12 * s, -12 * s);
    ctx.lineTo(-12 * s, 12 * s);
    ctx.stroke();
  }
  ctx.restore();
}

/** Valiant Hearts–style lob dots while grenade aiming. */
function DrawGrenadeAimArc() {
  if (!state.nadeAiming || state.player.inTunnel) return;
  const pts = GrenadeAimWorldArc(state);
  if (!pts.length) return;
  const s = Scale();
  ctx.save();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const u = i / Math.max(1, pts.length - 1);
    ctx.globalAlpha = 0.35 + (1 - u) * 0.5;
    ctx.fillStyle = i === pts.length - 1 ? "#c44a2e" : "#efe2c8";
    ctx.beginPath();
    ctx.arc(WX(p.x), WY(p.y), (i === pts.length - 1 ? 5.5 : 3.2) * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Landing ring
  const land = pts[pts.length - 1];
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(196,74,46,.85)";
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.ellipse(WX(land.x), WY(SURFACE_Y), 22 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function DrawAdsOverlay() {
  if (!state.player.aiming || state.player.held !== ITEM_RIFLE || state.player.inTunnel) return;
  const w = canvas.width;
  const h = canvas.height;
  const s = Scale();
  const cx = WX(state.player.x) + state.player.facing * 90 * s;
  const cy = WY(state.player.y) - 40 * s;
  ctx.save();
  ctx.fillStyle = "rgba(8,6,4,.45)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(239,226,200,.85)";
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(cx - 18 * s, cy);
  ctx.lineTo(cx + 18 * s, cy);
  ctx.moveTo(cx, cy - 18 * s);
  ctx.lineTo(cx, cy + 18 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 10 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function DrawProjectiles() {
  const s = Scale();
  for (const p of state.projectiles || []) {
    ctx.save();
    if (p.kind === "grenade") {
      const ang = Math.atan2(p.vy || 0, p.vx || 1);
      ctx.translate(WX(p.x), WY(p.y));
      ctx.rotate(ang);
      ctx.fillStyle = "#5a6a3a";
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 2;
      ctx.fillRect(-10 * s, -3 * s, 14 * s, 6 * s);
      ctx.beginPath();
      ctx.ellipse(6 * s, 0, 7 * s, 5.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = "#5a6a3a";
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(WX(p.x), WY(p.y), 6 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const b of state.blasts || []) {
    const t = Math.max(0, Math.min(1, b.timer / 0.5));
    const r = (b.r || 92) * (1.15 - t * 0.35) * s;
    ctx.save();
    ctx.translate(WX(b.x), WY(b.y));
    ctx.strokeStyle = `rgba(255,180,90,${0.85 * t})`;
    ctx.fillStyle = `rgba(180,60,30,${0.28 * t})`;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(0, -8 * s, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,230,160,${0.55 * t})`;
    ctx.beginPath();
    ctx.arc(0, -8 * s, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const m = state.muzzle;
  if (m && m.timer > 0 && !state.player.inTunnel) {
    ctx.save();
    ctx.translate(WX(m.x), WY(m.y));
    ctx.scale(m.facing || 1, 1);
    ctx.fillStyle = `rgba(255,210,120,${Math.min(1, m.timer * 5)})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(28 * s, -10 * s);
    ctx.lineTo(28 * s, 10 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Open climb-out shafts must read at a glance — surface mouth AND underground well.
 * Plain AIR cells look identical to corridors; timber + skylight + ↑ markers sell the exit.
 */
function DrawOpenShaftMarkers() {
  const soil = state.level.soil;
  if (!soil) return;
  const s = Scale();
  const { cam0, cam1 } = CameraCullX(160);
  const inTunnel = !!state.player.inTunnel;
  const pulse = 0.55 + 0.45 * Math.sin(((performance.now() || 0) / 1000) * 3.1);

  for (let c = 1; c < soil.cols - 1; c++) {
    if (GetCell(soil, c, 1) !== AIR && GetCell(soil, c, 0) !== AIR) continue;
    const x = soil.originX + (c + 0.5) * soil.cell;
    if (x < cam0 || x > cam1) continue;
    const sx = WX(x);
    const sy = WY(SURFACE_Y);
    const nearPlayer = Math.abs((state.player.x || 0) - x) < soil.cell * 1.35;

    // Contiguous AIR column from the crust down (the climbable well).
    let bottomR = 1;
    for (let r = 1; r < soil.rows; r++) {
      if (GetCell(soil, c, r) !== AIR) break;
      bottomR = r;
    }
    const topRect = CellWorldRect(soil, c, 1);
    const botRect = CellWorldRect(soil, c, bottomR);
    const x0 = WX(topRect.x);
    const y0 = WY(topRect.y);
    const colW = topRect.w * s;
    const colH = (botRect.y + botRect.h - topRect.y) * s;

    if (inTunnel) {
      // Sky bleed — brighter than corridor air so the well pops in cutaway.
      const glow = ctx.createLinearGradient(0, y0, 0, y0 + colH);
      glow.addColorStop(0, `rgba(240,210,130,${0.42 + pulse * 0.18})`);
      glow.addColorStop(0.28, `rgba(190,150,70,${0.22 + pulse * 0.1})`);
      glow.addColorStop(1, "rgba(50,34,16,0.04)");
      ctx.fillStyle = glow;
      ctx.fillRect(x0, y0, colW, colH);

      // Timber posts
      ctx.strokeStyle = nearPlayer
        ? `rgba(245,200,110,${0.8 + pulse * 0.2})`
        : "rgba(170,125,70,.75)";
      ctx.lineWidth = Math.max(2, 2.6 * s);
      ctx.beginPath();
      ctx.moveTo(x0 + 3 * s, y0);
      ctx.lineTo(x0 + 3 * s, y0 + colH);
      ctx.moveTo(x0 + colW - 3 * s, y0);
      ctx.lineTo(x0 + colW - 3 * s, y0 + colH);
      ctx.stroke();

      // Ladder rungs — every cell reads as climbable height.
      ctx.strokeStyle = nearPlayer
        ? `rgba(235,185,95,${0.7 + pulse * 0.2})`
        : "rgba(150,110,60,.6)";
      ctx.lineWidth = Math.max(1.5, 2 * s);
      for (let r = 1; r <= bottomR; r++) {
        const rr = CellWorldRect(soil, c, r);
        const ry = WY(rr.y + rr.h * 0.55);
        ctx.beginPath();
        ctx.moveTo(x0 + 7 * s, ry);
        ctx.lineTo(x0 + colW - 7 * s, ry);
        ctx.stroke();
      }

      // Dark mouth punched through the cut lip
      ctx.fillStyle = `rgba(8,5,3,${0.62 + pulse * 0.2})`;
      ctx.beginPath();
      if (typeof ctx.ellipse === "function") {
        ctx.ellipse(sx, sy + 2 * s, colW * 0.42, 7 * s, 0, 0, Math.PI * 2);
      } else ctx.arc(sx, sy, Math.max(8, colW * 0.35), 0, Math.PI * 2);
      ctx.fill();

      // Rising ↑ chevrons toward the mouth
      ctx.fillStyle = nearPlayer
        ? `rgba(255,220,120,${0.55 + pulse * 0.4})`
        : `rgba(230,190,100,${0.4 + pulse * 0.25})`;
      const baseY = y0 + 16 * s + (1 - pulse) * 10 * s;
      for (let i = 0; i < 3; i++) {
        const cy = baseY + i * 13 * s;
        ctx.beginPath();
        ctx.moveTo(sx, cy - 7 * s);
        ctx.lineTo(sx - 9 * s, cy + 3 * s);
        ctx.lineTo(sx + 9 * s, cy + 3 * s);
        ctx.closePath();
        ctx.fill();
      }

      DrawPictogram("hatch", sx - 11 * s, y0 + 2 * s, 22 * s);
      ctx.fillStyle = nearPlayer ? `rgba(255,236,180,${0.9})` : "rgba(220,190,130,.7)";
      ctx.font = `700 ${Math.max(10, Math.round(11 * s))}px "Noto Sans SC",sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("↑ 出井", sx, y0 + 28 * s);
    } else {
      // Surface mouth plate + hatch plate (re-enter with ↓).
      ctx.fillStyle = "rgba(42,28,18,.9)";
      ctx.fillRect(sx - 14 * s, sy - 5 * s, 28 * s, 8 * s);
      ctx.strokeStyle = nearPlayer ? `rgba(240,194,122,${0.7 + pulse * 0.3})` : "#1a1410";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 14 * s, sy - 5 * s, 28 * s, 8 * s);
      ctx.fillStyle = "rgba(10,6,4,.75)";
      ctx.beginPath();
      if (typeof ctx.ellipse === "function") ctx.ellipse(sx, sy + 2 * s, 10 * s, 5 * s, 0, 0, Math.PI * 2);
      else ctx.arc(sx, sy, 8 * s, 0, Math.PI * 2);
      ctx.fill();
      DrawPictogram("hatch", sx - 9 * s, sy - 32 * s, 18 * s);
      if (nearPlayer) {
        ctx.fillStyle = `rgba(255,236,180,${0.75 + pulse * 0.2})`;
        ctx.font = `700 ${Math.max(10, Math.round(11 * s))}px "Noto Sans SC",sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("↓ 回井", sx, sy - 34 * s);
      }
    }
  }
}

/**
 * Unified dig cutaway — surface lip + dig band visible together.
 * Replaces the old either-or surface/tunnel stacks during play with soil.
 */
function RenderPlayCutaway(w, h, camX, pal) {
  DrawSoilCutaway(w, h, camX, pal);
  ctx.save();
  ctx.globalAlpha = state.player.inTunnel ? 0.92 : 0.78;
  DrawSoilGrid(pal);
  ctx.restore();
  DrawPlanOverlay(pal);

  // Surface ridge props (already partly in DrawSoilCutaway); play-plane props on the lip.
  for (const prop of PropsPlay(state.level.props)) DrawProp(prop, pal, state.player.inTunnel ? 0.45 : 1);

  DrawOpenShaftMarkers();
  for (const shaft of state.level.shafts || []) DrawShaft(shaft);
  for (const ent of state.level.entities) DrawEntity(ent);
  DrawProjectiles();
  DrawGrenadeAimArc();
  DrawPlayer();
  DrawDigFx();
  DrawMeleeFx();
  DrawAdsOverlay();

  if (state.player.inTunnel) DrawTunnelFrontLips(pal);

  // Thin near skirt only — do NOT bury the dig band under ContinuousNearGround.
  const walkY = WY(SURFACE_Y);
  const s = Scale();
  DrawDepthVeil(
    w,
    h,
    walkY + Math.max(180, (state.level.soil.rows * state.level.soil.cell) * s * 0.55),
    h,
    pal.night ? "rgba(0,0,0,.35)" : "rgba(18,10,6,.28)",
  );

  DrawSpeechBubble();
  DrawInteractPromptWorld();
}

function RenderSurfaceStack(w, h, camX, pal, opts = {}) {
  const playable = !!opts.playable;
  const s = Scale();
  const walkY = WY(SURFACE_Y);
  // 1 far sky + ridge bands
  DrawSky(w, h, pal);
  DrawDepthBackdrop(w, h, camX, pal);
  // 2 stage floor (perspective plate)
  DrawStageFloor(w, h, pal);

  // 3 BACK props by depth band — thicker fog shelves pull planes apart
  const hazeFar = pal.night ? "rgba(18,26,34,.45)" : "rgba(195,212,200,.4)";
  const hazeMid = pal.night ? "rgba(14,20,24,.32)" : "rgba(175,192,165,.3)";
  const hazeBack = pal.night ? "rgba(12,16,20,.18)" : "rgba(160,175,145,.18)";
  for (const [depth, band] of PropsBehindBands(state.level.props)) {
    for (const prop of band) DrawProp(prop, pal);
    if (depth <= -3) DrawDepthVeil(w, h, walkY - 160 * s, walkY - 30 * s, hazeFar);
    else if (depth === -2) DrawDepthVeil(w, h, walkY - 110 * s, walkY - 8 * s, hazeMid);
    else if (depth === -1) DrawDepthVeil(w, h, walkY - 70 * s, walkY + 8 * s, hazeBack);
  }
  if (playable) DrawSurfaceExtras();

  // Soft cool wash so play plane pops warmer against the back
  DrawDepthVeil(
    w,
    h,
    walkY - 55 * s,
    walkY + 24 * s,
    pal.night ? "rgba(10,12,16,.2)" : "rgba(100,120,100,.14)",
  );

  // 4 play-plane props + actors
  for (const prop of PropsPlay(state.level.props)) DrawProp(prop, pal);
  if (playable) {
    for (const shaft of state.level.shafts) DrawShaft(shaft);
    for (const ent of state.level.entities) DrawEntity(ent);
    DrawProjectiles();
    DrawGrenadeAimArc();
    DrawPlayer();
    DrawDigFx();
    DrawMeleeFx();
    DrawAdsOverlay();
  }

  // 5 FRONT occluders — paint AFTER player (real 2.5D cover)
  // Two thin bands (FRONT then NEAR) + veil so sparse props still stack in depth
  const front = PropsFront(state.level.props);
  for (const prop of front.filter((p) => (p.depth ?? 0) === 1)) DrawProp(prop, pal);
  DrawDepthVeil(
    w,
    h,
    walkY + 18 * s,
    h * 0.95,
    pal.night ? "rgba(0,0,0,.22)" : "rgba(18,10,6,.16)",
  );
  for (const prop of front.filter((p) => (p.depth ?? 0) >= 2)) DrawProp(prop, pal);

  // Continuous near ground — full width, connected, covers rightmost map edge
  DrawContinuousNearGround(w, h, camX, pal);

  // 6 UI above EVERYTHING — dialogue must never sit under front trees
  if (playable) {
    DrawSpeechBubble();
    DrawInteractPromptWorld();
  }
}

function RenderTunnelStack(w, h, camX, pal) {
  DrawSoilCutaway(w, h, camX, pal);
  // Back wall of soil (dimmer grid)
  ctx.save();
  ctx.globalAlpha = 0.85;
  DrawSoilGrid(pal);
  ctx.restore();
  DrawPlanOverlay(pal);
  for (const shaft of state.level.shafts) DrawShaft(shaft);
  for (const ent of state.level.entities) DrawEntity(ent);
  DrawProjectiles();
  DrawPlayer();
  DrawDigFx();
  DrawMeleeFx();
  // Front lips / dirt clumps occlude the digger
  DrawTunnelFrontLips(pal);
  // Dialogue / prompts above tunnel lips
  DrawSpeechBubble();
  DrawInteractPromptWorld();
}

function Render() {
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;
  const pal = state.level.palette;
  const camX = state.cameraX;

  ctx.save();
  if ((state.shake || 0) > 0.01) {
    const mag = Math.min(12, state.shake * 28);
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag * 0.7);
  }

  if (state.phase === "title" || state.phase === "ending") {
    RenderSurfaceStack(w, h, camX * 0.35, pal, { playable: false });
  } else if (state.phase === "play" && state.level.soil) {
    // Always show ground lip + dig band together (Valiant Hearts dig cutaway).
    RenderPlayCutaway(w, h, camX, pal);
  } else if (state.player.inTunnel && state.phase === "play") {
    RenderTunnelStack(w, h, camX, pal);
  } else {
    // play / comic panels — full depth stack; actors only while playing
    RenderSurfaceStack(w, h, camX, pal, { playable: state.phase === "play" });
  }

  if (state.phase === "play") DrawDialogueBanner();

  if (state.transition > 0) {
    const a = state.transition < 0.5 ? state.transition * 2 : (1 - state.transition) * 2;
    ctx.fillStyle = `rgba(10,8,6,${Math.min(1, a)})`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/** iOS Safari double-tap zooms the page — block it for the game shell. */
function GuardSafariZoom() {
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = performance.now();
      if (now - lastTouchEnd < 320) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );
  document.addEventListener(
    "gesturestart",
    (e) => {
      e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "dblclick",
    (e) => {
      e.preventDefault();
    },
    { passive: false },
  );
}

function BindInput() {
  GuardSafariZoom();
  const setKey = (e, down) => {
    const input = state.input;
    const k = e.key.toLowerCase();
    if (["arrowleft", "a"].includes(k)) input.left = down;
    if (["arrowright", "d"].includes(k)) input.right = down;
    if (["arrowdown", "s"].includes(k)) input.crouch = down;
    if (k === "shift") {
      input.aim = down;
      if (down) e.preventDefault();
    }
    if (["j"].includes(k)) {
      input.dig = down;
      if (down) input.digPressed = true;
    }
    if (k === "r" && down) {
      input.designTogglePressed = true;
      e.preventDefault();
    }
    if (k === "t" && down) {
      input.planChamberPressed = true;
      e.preventDefault();
    }
    if (k === "c" && down && state.designMode) {
      input.planCorridorPressed = true;
      e.preventDefault();
    }
    if ((k === "x" || k === "backspace") && down) {
      input.planErasePressed = true;
    }
    if (["w", "arrowup"].includes(k)) {
      input.up = down;
      if (down) e.preventDefault();
    }
    if (down && (k === " " || k === "enter")) {
      if (state.phase === "prologue" || state.phase === "panels" || state.phase === "closePanels") {
        state = AdvancePanels(state);
        SaveToStorage(state);
        SyncPhaseUi();
        Beep(480, 0.05);
        e.preventDefault();
        return;
      }
      // Space = interact (pick up / talk / hatch) — not jump
      input.interactPressed = true;
      e.preventDefault();
    }
    if (down && k === "e") {
      if (state.phase === "prologue" || state.phase === "panels" || state.phase === "closePanels") {
        state = AdvancePanels(state);
        SaveToStorage(state);
        SyncPhaseUi();
        Beep(480, 0.05);
        return;
      }
      input.interactPressed = true;
    }
    if (down && k === "f") {
      input.usePressed = true;
      e.preventDefault();
    }
    if (down && k === "q") {
      input.dropPressed = true;
    }
    if (down && k === "escape") {
      if (state.failed) {
        SetModal("fail");
        e.preventDefault();
        return;
      }
      if (AnyModalOpen()) {
        SetModal(null);
        e.preventDefault();
        return;
      }
      if (state.phase === "play") SetModal("pause");
    }
  };
  window.addEventListener("keydown", (e) => setKey(e, true));
  window.addEventListener("keyup", (e) => setKey(e, false));

  // Tap / click the stage to advance comic dialogue (same as E / 互动)
  canvas.addEventListener("pointerdown", (e) => {
    if (state.phase !== "play" || state.pauseOpen || state.failed) return;
    if (!state.subtitle?.text && !state.activeTalkId) return;
    // Don't steal digs / UI — only when a line is on screen
    if (!state.subtitle?.comic && !state.activeTalkId) return;
    state.input.interactPressed = true;
    e.preventDefault();
  });

  for (const btn of document.querySelectorAll("[data-touch]")) {
    const kind = btn.getAttribute("data-touch");
    const setPressed = (down) => {
      btn.classList.toggle("isPressed", !!down);
      btn.setAttribute("aria-pressed", down ? "true" : "false");
    };
    const on = (down) => {
      EnsureAudio();
      setPressed(down);
      if (kind === "left") state.input.left = down;
      if (kind === "right") state.input.right = down;
      if (kind === "up") state.input.up = down;
      if (kind === "crouch") state.input.crouch = down;
      if (kind === "aim") state.input.aim = down;
      if (kind === "design" && down) {
        // Only visible while stuck in design — tap exits (same as toggle off).
        state.input.designTogglePressed = true;
      }
      if (kind === "use" && down) {
        state.input.usePressed = true; // throw grenade / fire
      }
      if (kind === "interact" && down) {
        // One action key: talk / dig / fire / throw / plan — verb from current context
        const verb = PadInteractVerb(state);
        if (verb === "chamber") state.input.planChamberPressed = true;
        else if (verb === "plan" || verb === "dig") state.input.digPressed = true;
        else if (verb === "shot" || verb === "use" || verb === "grenade") state.input.usePressed = true;
        else state.input.interactPressed = true;
      }
    };
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("selectstart", (e) => e.preventDefault());
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      on(true);
    });
    btn.addEventListener("pointerup", () => on(false));
    btn.addEventListener("pointercancel", () => on(false));
    btn.addEventListener("lostpointercapture", () => on(false));
  }
}

function BindUi() {
  $("BeginButton").addEventListener("click", () => {
    EnsureAudio();
    BeginFrom(0);
  });
  $("ContinueButton").addEventListener("click", () => {
    EnsureAudio();
    const progress = LoadFromStorage();
    BeginFrom(Math.max(0, Math.min(CHAPTERS.length - 1, (progress?.unlockedActs || 1) - 1)));
  });
  const closeModal = () => SetModal(null);
  const openHelp = () => SetModal("help");
  $("OpenHelpButton").addEventListener("click", openHelp);
  const openHelpTitle = $("OpenHelpTitleButton");
  if (openHelpTitle) openHelpTitle.addEventListener("click", openHelp);
  const pauseHelp = $("PauseHelpButton");
  if (pauseHelp) pauseHelp.addEventListener("click", openHelp);
  $("CloseHelpButton").addEventListener("click", closeModal);
  const dismissHelp = $("DismissHelpButton");
  if (dismissHelp) dismissHelp.addEventListener("click", closeModal);
  $("OpenHistoryButton").addEventListener("click", () => SetModal("history"));
  $("CloseHistoryButton").addEventListener("click", closeModal);
  const dismissHistory = $("DismissHistoryButton");
  if (dismissHistory) dismissHistory.addEventListener("click", closeModal);
  // Tap dimmed backdrop (not the card) to dismiss — mobile escape hatch.
  const modalLayer = $("ModalLayer");
  if (modalLayer) {
    modalLayer.addEventListener("pointerdown", (e) => {
      if (e.target === modalLayer) {
        e.preventDefault();
        SetModal(null);
      }
    });
  }
  $("PauseButton").addEventListener("click", () => {
    // Triple-tap opens debug (capture listener); single tap still pauses.
    if ($("DebugModal") && !$("DebugModal").hidden) return;
    if (state.failed) {
      SetModal("fail");
      return;
    }
    SetModal("pause");
  });
  $("ResumeButton").addEventListener("click", () => {
    if (state.failed) {
      SetModal("fail");
      return;
    }
    SetModal(null);
  });
  const openDebugBtn = $("OpenDebugButton");
  if (openDebugBtn) {
    openDebugBtn.addEventListener("click", () => {
      EnsureAudio();
      SetModal("debug");
      Beep(880, 0.05, "triangle", 0.03);
    });
  }
  $("RestartChapterButton").addEventListener("click", () => {
    state = RestartChapter(state);
    SetModal(null);
    SyncPhaseUi();
  });
  $("ExitTitleButton").addEventListener("click", () => {
    SaveToStorage(state);
    state.phase = "title";
    state.failed = false;
    state.input = CreateInputState();
    SetModal(null);
    SyncPhaseUi();
  });
  $("FailRespawnButton").addEventListener("click", () => {
    RespawnPlayer(state);
    SetModal(null);
    SyncHud();
    SyncPhaseUi();
    Beep(520, 0.08, "triangle", 0.04);
  });
  $("FailRetryButton").addEventListener("click", () => {
    state = RestartChapterToPlay(state);
    SetModal(null);
    SyncPhaseUi();
    Beep(480, 0.07, "triangle", 0.04);
  });
  $("FailTitleButton").addEventListener("click", () => {
    SaveToStorage(state);
    state.phase = "title";
    state.failed = false;
    state.pauseOpen = false;
    state.input = CreateInputState();
    SetModal(null);
    SyncPhaseUi();
  });
  $("PanelNextButton").addEventListener("click", () => {
    EnsureAudio();
    state = AdvancePanels(state);
    SaveToStorage(state);
    SyncPhaseUi();
  });
  $("ReplayButton").addEventListener("click", () => BeginFrom(0));
  $("EndingHomeButton").addEventListener("click", () => {
    state.phase = "title";
    SyncPhaseUi();
  });
  BindHiddenDebugEntry();
  const closeDebug = $("CloseDebugButton");
  if (closeDebug) closeDebug.addEventListener("click", () => SetModal(null));
  const jumpBtn = $("DebugJumpButton");
  if (jumpBtn) {
    jumpBtn.addEventListener("click", () => {
      const idx = Number($("DebugChapterSelect")?.value || 0);
      BeginFrom(idx);
      state.phase = "play";
      state.panelIndex = 0;
      SetModal(null);
      SyncPhaseUi();
      Beep(620, 0.06, "triangle", 0.03);
    });
  }
  const winBtn = $("DebugWinGoalsButton");
  if (winBtn) {
    winBtn.addEventListener("click", () => {
      for (const id of Object.keys(state.goalsDone || {})) DebugCompleteGoal(state, id);
      SaveToStorage(state);
      SyncHud();
      Beep(720, 0.06, "triangle", 0.03);
    });
  }
  const shovelBtn = $("DebugShovelButton");
  if (shovelBtn) {
    shovelBtn.addEventListener("click", () => {
      DebugHold(state, ITEM_SHOVEL);
      SyncHud();
    });
  }
  const nadeBtn = $("DebugNadesButton");
  if (nadeBtn) {
    nadeBtn.addEventListener("click", () => {
      state.player.grenades = (state.player.grenades || 0) + 6;
      if (!state.player.held) state.player.held = ITEM_GRENADE;
      SyncHud();
    });
  }
  const healBtn = $("DebugHealButton");
  if (healBtn) {
    healBtn.addEventListener("click", () => {
      state.player.hp = 3;
      state.player.invuln = 60;
      state.failed = false;
      SyncHud();
    });
  }
  const tunBtn = $("DebugTunnelButton");
  if (tunBtn) {
    tunBtn.addEventListener("click", () => {
      const hatch = state.level.entities.find((e) => e.type === "hatch");
      if (state.player.inTunnel) {
        state.player.inTunnel = false;
        state.player.y = SURFACE_Y;
        state.player.x = hatch?.x ?? state.player.x;
      } else {
        state.player.inTunnel = true;
        state.player.x = hatch?.tunnelX ?? state.player.x;
        state.player.y = hatch?.tunnelY ?? state.level.tunnelFloor;
        if (!state.player.held) DebugHold(state, ITEM_SHOVEL);
      }
      state.designMode = false;
      state.player.onGround = true;
      SyncHud();
    });
  }
}

function Frame(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
  lastTs = ts;

  // Keep camera / soil cull on the real canvas span (wide phones > VIEW_W).
  if (state) state.viewW = VisibleWorldWidth();

  if (state.phase === "play" && state.failed) {
    // Keep the death UI up — Esc / accidental dismiss used to freeze the run.
    if (!AnyModalOpen() || $("FailModal")?.hidden) SetModal("fail");
  }

  if (state.phase === "play" && !state.pauseOpen && !state.failed) {
    StepPlay(state, dt);
    SyncHud();
    if (state._sfxDig) {
      state._sfxDig = false;
      Beep(160, 0.05, "square", 0.04);
      Beep(85, 0.09, "triangle", 0.03);
    }
    if (state.failed) {
      Beep(120, 0.2, "sawtooth", 0.04);
      SetModal("fail");
    }
    const sig = JSON.stringify(state.goalsDone);
    if (sig !== prevGoalSig) {
      prevGoalSig = sig;
      Beep(660, 0.07, "triangle", 0.03);
      SaveToStorage(state);
    }
    if (state.completed) {
      SaveToStorage(state);
      SyncPhaseUi();
      Beep(784, 0.12, "triangle", 0.04);
    } else SyncHud();
  }

  // slow drift on title
  if (state.phase === "title" || state.phase === "ending") {
    state.cameraX += dt * 12;
  }

  Render();
  requestAnimationFrame(Frame);
}

async function Main() {
  Resize();
  window.addEventListener("resize", Resize);
  EnsureTouchPadVisible();
  PaintTouchPadIcons();
  BindInput();
  BindUi();
  SyncPhaseUi();
  document.title = `地道战 · 高家庄｜白盒 ${CACHE_BUST}`;

  // Agent / QA: /TunnelHeart1942/?preview=play boots straight into act1 surface
  const preview = new URLSearchParams(location.search).get("preview");
  if (preview === "debug") {
    BeginFrom(0);
    state.phase = "play";
    state.player.held = ITEM_SHOVEL;
    SyncPhaseUi();
    SetModal("debug");
  } else if (preview === "play" || preview === "tunnel") {
    BeginFrom(0);
    state.phase = "play";
    state.player.inTunnel = preview === "tunnel";
    if (preview === "play") {
      state.player.x = 420;
      state.player.y = SURFACE_Y;
      state.player.held = ITEM_SHOVEL;
      state.cameraX = 180;
    } else {
      const hatch = state.level.entities.find((e) => e.type === "hatch");
      if (hatch) {
        state.player.x = hatch.tunnelX || hatch.x;
        state.player.y = hatch.tunnelY || state.level.tunnelFloor;
        state.cameraX = Math.max(0, state.player.x - 300);
      }
      state.player.held = ITEM_SHOVEL;
    }
    SyncPhaseUi();
  }

  requestAnimationFrame(Frame);
}

Main();

export { state as __debugState, BeginFrom as __debugBeginFrom };
