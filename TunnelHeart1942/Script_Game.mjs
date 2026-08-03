import { CHAPTERS, CACHE_BUST, PROLOGUE_PANELS } from "./Data_Story.mjs";
import {
  AdvancePanels,
  CreateCampaignState,
  CreateInputState,
  LoadFromStorage,
  NextStepText,
  PLAYER_H,
  RestartChapter,
  SaveToStorage,
  StepPlay,
} from "./Script_Rules.mjs";
import { AIR, HARD, SOFT, CellWorldRect } from "./Script_Dig.mjs";
import {
  ParallaxOf,
  PropsBehind,
  PropsBehindBands,
  PropsFront,
  PropsPlay,
  ScaleOf,
  TintAlpha,
  YLiftOf,
} from "./Script_Depth.mjs";
import { ITEM_CHARGE, ITEM_GRENADE, ITEM_META, ITEM_SHOVEL } from "./Script_Items.mjs";
import { DrawPuppet, PaletteForSpeaker, PickClip } from "./Script_Puppet.mjs";
import { SURFACE_Y, VIEW_H, VIEW_W } from "./Script_World.mjs";

const $ = (id) => document.getElementById(id);
const canvas = $("GameCanvas");
const ctx = canvas.getContext("2d");

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
  Show($("ModalLayer"), !!which);
  Show($("HelpModal"), which === "help");
  Show($("HistoryModal"), which === "history");
  Show($("PauseModal"), which === "pause");
  Show($("FailModal"), which === "fail");
  state.pauseOpen = which === "pause";
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

function SyncHud() {
  $("HeartRow").innerHTML = [0, 1, 2]
    .map((i) => `<i class="${i < state.player.hp ? "" : "off"}"></i>`)
    .join("");
  const slot = $("HeldSlot");
  if (!slot) return;
  const held = state.player.held;
  const meta = held ? ITEM_META[held] : null;
  slot.dataset.empty = held ? "0" : "1";
  const tutorialDig =
    !!state.level?.tutorialPlan && state.player.inTunnel && held === ITEM_SHOVEL && !state.designMode;
  if (state.designMode) {
    slot.innerHTML = `<b data-item="shovel" style="--item:#4a8ab5"></b><span>设计蓝图</span><em>光标移格 · J 标记 · T 厢室 · C 巷道 · R 退出</em>`;
  } else {
    slot.innerHTML = meta
      ? `<b style="--item:${meta.color}"></b><span>${meta.label}</span><em>${
          tutorialDig ? "顺着蓝线走到格旁，点 J 开挖" : `${meta.tip} · R 设计地道`
        }</em>`
      : `<b></b><span>空手</span><em>E 捡道具 · 洞里 R 设计蓝图再挖</em>`;
    if (meta) slot.querySelector("b").dataset.item = held;
  }
  const badge = $("DesignBadge");
  if (badge) badge.hidden = !state.designMode;
  const step = $("StepHint");
  if (step) {
    step.textContent = NextStepText(state);
    step.hidden = false;
  }
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
  // Stacked ridges — each closer band sits lower + scrolls faster
  DrawRidge(w, h, camX, 0.05, 0.42, 26, pal.haze, 0.85);
  DrawRidge(w, h, camX, 0.12, 0.5, 20, pal.night ? "#243028" : "#7a9070", 0.88);
  DrawRidge(w, h, camX, 0.22, 0.56, 16, pal.night ? "#2a342c" : "#6a7d58", 0.92);

  // Distant village tooth-row on the haze ridge
  const baseY = h * 0.52;
  const scroll = camX * 0.16 * Scale();
  ctx.fillStyle = pal.night ? "#1c241e" : "#4a5a42";
  for (let i = -3; i < 26; i++) {
    const x = ((i * 96 - scroll) % (w + 180)) - 40;
    const bw = 14 + ((i * 11) % 14);
    const bh = 18 + ((i * 9) % 22);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, baseY - bh, bw, bh);
    ctx.beginPath();
    ctx.moveTo(x - 2, baseY - bh);
    ctx.lineTo(x + bw * 0.5, baseY - bh - 10);
    ctx.lineTo(x + bw + 2, baseY - bh);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Mid field plate + furrow stripes (parallax 0.35)
  DrawRidge(w, h, camX, 0.35, 0.64, 12, pal.field, 1);
  const furrowY = h * 0.64;
  const furrowScroll = camX * 0.35 * Scale();
  ctx.strokeStyle = pal.night ? "rgba(0,0,0,.22)" : "rgba(40,50,28,.28)";
  ctx.lineWidth = 1.2;
  for (let i = -4; i < 28; i++) {
    const x = ((i * 48 - furrowScroll) % (w + 80)) - 20;
    ctx.beginPath();
    ctx.moveTo(x, furrowY - 8);
    ctx.lineTo(x + (x - w * 0.5) * 0.08, furrowY + 28);
    ctx.stroke();
  }

  DrawRidge(w, h, camX, 0.55, 0.72, 9, pal.earth, 1);
  // Soft atmospheric veil over far bands so they read as distance
  const veil = ctx.createLinearGradient(0, h * 0.38, 0, h * 0.7);
  veil.addColorStop(0, pal.night ? "rgba(20,28,36,.35)" : "rgba(180,200,190,.22)");
  veil.addColorStop(0.55, pal.night ? "rgba(20,28,36,.12)" : "rgba(180,200,190,.08)");
  veil.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, h * 0.38, w, h * 0.34);
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

/** Perspective stage floor — VH walk plane with foreshortening stripes. */
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

  // Walk strip toward camera (darker = nearer)
  const near = ctx.createLinearGradient(0, y, 0, h);
  near.addColorStop(0, pal.night ? "#3a3228" : "#8b6a45");
  near.addColorStop(0.28, pal.night ? "#2a241c" : "#6a4e34");
  near.addColorStop(0.65, pal.night ? "#1a1612" : "#4a3420");
  near.addColorStop(1, pal.night ? "#0c0a08" : "#2a1c12");
  ctx.fillStyle = near;
  ctx.fillRect(0, y, w, h - y + 4);

  // Perspective hatch lines — vanishing toward mid-horizon
  const vpX = w * 0.5;
  const vpY = y - 40 * s;
  ctx.strokeStyle = pal.night ? "rgba(0,0,0,.32)" : "rgba(40,28,16,.26)";
  ctx.lineWidth = 1.15;
  for (let i = -10; i < 22; i++) {
    const x0 = WX(state.cameraX + i * 58);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(vpX + (x0 - vpX) * 1.65, h + 8);
    ctx.stroke();
  }
  // Cross boards (nearer = thicker / wider spacing)
  ctx.strokeStyle = pal.night ? "rgba(0,0,0,.2)" : "rgba(30,20,12,.18)";
  for (let t = 0.15; t < 0.95; t += 0.12) {
    const yy = y + (h - y) * t;
    ctx.lineWidth = 1 + t * 2.5;
    ctx.globalAlpha = 0.35 + t * 0.45;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(w, yy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Horizon seam (walk line)
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
    const bh = (prop.tall ? 56 : 34) * s;
    ctx.fillStyle = depth >= 2 ? "#152016" : "#2a3824";
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(0, -bh * 0.35, 40 * s, bh * 0.6, 0, 0, Math.PI * 2);
    else ctx.arc(0, -bh * 0.35, 32 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Second lobe — denser silhouette
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(16 * s, -bh * 0.25, 26 * s, bh * 0.45, 0, 0, Math.PI * 2);
    else ctx.arc(16 * s, -bh * 0.25, 20 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === "wheat") {
    ctx.strokeStyle = depth >= 1 ? "#2a1e0c" : "#6a5a28";
    ctx.fillStyle = depth >= 1 ? "#3a2a12" : "#7a6a30";
    ctx.lineWidth = 2.5 * s;
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5 * s, 4 * s);
      ctx.quadraticCurveTo(i * 5 * s + 4 * s, -28 * s, i * 5 * s - 2 * s, -52 * s);
      ctx.stroke();
    }
  } else if (prop.kind === "post") {
    ctx.fillStyle = "#1a120c";
    ctx.fillRect(-4 * s, -62 * s, 8 * s, 62 * s);
    ctx.fillRect(-22 * s, -58 * s, 44 * s, 5 * s);
  } else if (prop.kind === "mudbank") {
    const mw = (prop.w || 80) * s;
    ctx.fillStyle = depth >= 2 ? "#1a120c" : "#2a1c12";
    ctx.beginPath();
    ctx.moveTo(-mw / 2, 14 * s);
    ctx.lineTo(-mw / 2 + 8 * s, -44 * s);
    ctx.lineTo(mw / 2 - 10 * s, -38 * s);
    ctx.lineTo(mw / 2 + 10 * s, 16 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Lit lip so it reads as volume toward camera
    ctx.fillStyle = "#3a2a18";
    ctx.fillRect(-mw * 0.35, -18 * s, mw * 0.5, 8 * s);
  } else if (prop.kind === "lantern") {
    ctx.fillStyle = "#c9a45a";
    ctx.globalAlpha *= 0.7;
    ctx.beginPath();
    ctx.arc(0, -40 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === "well") {
    ctx.fillStyle = "#7a7264";
    ctx.fillRect(-16 * s, -18 * s, 32 * s, 18 * s);
    ctx.strokeRect(-16 * s, -18 * s, 32 * s, 18 * s);
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
function DrawTunnelFrontLips(pal) {
  const soil = state.level.soil;
  if (!soil) return;
  const s = Scale();
  const cam0 = state.cameraX - 40;
  const cam1 = state.cameraX + VIEW_W + 40;
  const px = state.player.x;
  const py = state.player.y;
  for (let r = 0; r < soil.rows; r++) {
    for (let c = 0; c < soil.cols; c++) {
      if (soil.cells[r][c] === AIR) continue;
      const rect = CellWorldRect(soil, c, r);
      if (rect.x + rect.w < cam0 || rect.x > cam1) continue;
      // Only lips near the player column — frame the corridor
      if (Math.abs(rect.x + rect.w / 2 - px) > 140) continue;
      if (rect.y > py + 20 || rect.y + rect.h < py - 70) continue;
      const x = WX(rect.x);
      const y = WY(rect.y);
      const rw = rect.w * s;
      const rh = rect.h * s;
      ctx.fillStyle = "rgba(20,12,8,.42)";
      ctx.fillRect(x, y, rw, Math.min(10 * s, rh * 0.35));
      ctx.fillStyle = "rgba(10,6,4,.35)";
      ctx.fillRect(x, y + rh - 8 * s, rw, 8 * s);
    }
  }
  // Near camera dirt clumps along bottom of view
  const scroll = state.cameraX * 1.4;
  ctx.fillStyle = "rgba(18,12,8,.75)";
  for (let i = 0; i < 10; i++) {
    const x = ((i * 130 - scroll) % (VIEW_W * Scale() + 100)) - 40;
    const y = (canvas.clientHeight || innerHeight) * 0.88;
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(x, y, 40, 18, 0, 0, Math.PI * 2);
    else {
      ctx.arc(x, y, 28, 0, Math.PI * 2);
    }
    ctx.fill();
  }
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
  const cam0 = state.cameraX - 40;
  const cam1 = state.cameraX + VIEW_W + 40;
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

function DrawDialogueBanner() {
  const sub = state.subtitle;
  if (!sub || !sub.text) return;
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
  let line = "";
  let ly = y + 34;
  const max = boxW - 32;
  for (const ch of String(sub.text)) {
    const test = line + ch;
    if (ctx.measureText(test).width > max) {
      ctx.fillText(line, x + 16, ly);
      line = ch;
      ly += 20;
      if (ly > y + 72) break;
    } else line = test;
  }
  if (line && ly <= y + 72) ctx.fillText(line, x + 16, ly);
  ctx.fillStyle = "rgba(239,226,200,.55)";
  ctx.font = "600 12px IBM Plex Sans, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(state.designMode ? "R 退出设计" : "E 继续", x + boxW - 14, y + 76);
  ctx.restore();
}

function DrawSoilGrid(pal) {
  const soil = state.level.soil;
  if (!soil) return;
  const s = Scale();
  const cam0 = state.cameraX - 40;
  const cam1 = state.cameraX + VIEW_W + 40;
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
  if (ent.layer === "tunnel" && !state.player.inTunnel) return;
  if (ent.layer === "surface" && state.player.inTunnel && ent.type !== "spy") return;

  const s = Scale();
  const worldY =
    ent.type === "shot_port" && state.player.inTunnel && ent.tunnelY != null ? ent.tunnelY : ent.y;
  const x = WX(ent.x);
  const y = WY(worldY);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2.5 * s;
  ctx.strokeStyle = "#1c1712";

  const glow = () => {
    ctx.fillStyle = "rgba(201,164,90,.35)";
    ctx.beginPath();
    ctx.arc(0, -24 * s, 20 * s, 0, Math.PI * 2);
    ctx.fill();
  };

  if (ent.kind === "pickup") {
    if (ent.taken) {
      ctx.restore();
      return;
    }
    glow();
    const bob = Math.sin((performance.now() || 0) * 0.006) * 3 * s;
    ctx.translate(0, -18 * s + bob);
    const icon =
      ent.itemId === ITEM_SHOVEL ? "shovel" : ent.itemId === ITEM_CHARGE ? "charge" : ent.itemId === ITEM_GRENADE ? "warn" : "talk";
    DrawPictogram(icon, -12 * s, -12 * s, 24 * s);
    ctx.restore();
    return;
  }

  if (ent.type === "talk" || ent.type === "spy_talk" || ent.type === "shelter") {
    if (!ent.done) glow();
    const pal =
      ent.type === "spy_talk"
        ? "spy"
        : PaletteForSpeaker(ent.speaker || (ent.type === "shelter" ? "乡亲" : "民兵"));
    const alpha = ent.done && ent.type === "shelter" ? 0.35 : 1;
    DrawPuppet(ctx, {
      x: 0,
      y: 0,
      facing: ent.facing || 1,
      scale: s,
      palette: pal,
      clip: "idle",
      time: ((performance.now() || 0) / 1000) + (ent.x || 0) * 0.01,
      alpha,
    });
  } else if (ent.type === "hatch") {
    glow();
    ctx.fillStyle = "#2a1c12";
    ctx.fillRect(-20 * s, -8 * s, 40 * s, 10 * s);
    ctx.strokeStyle = "#c9a45a";
    ctx.strokeRect(-20 * s, -8 * s, 40 * s, 10 * s);
  } else if (ent.type === "bell") {
    glow();
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
    if (ready) glow();
    ctx.fillStyle = ready ? "#2f5d4a" : "#4a4538";
    ctx.fillRect(-17 * s, -26 * s, 34 * s, 26 * s);
    ctx.strokeRect(-17 * s, -26 * s, 34 * s, 26 * s);
    if (ready && !state.player.inTunnel) {
      ctx.fillStyle = "#efe2c8";
      ctx.font = `700 ${11 * s}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("开枪", 0, -34 * s);
    } else if (ready && state.player.inTunnel) {
      ctx.fillStyle = "#efe2c8";
      ctx.font = `700 ${11 * s}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("出井", 0, -34 * s);
    }
  } else if (ent.type === "enemy") {
    let alpha = 1;
    if (ent.dead) alpha = 0.28;
    else if (ent.hurtFlash > 0) alpha = 0.55 + Math.sin(ent.hurtFlash * 40) * 0.35;
    const facing = ent.alert > 0 ? Math.sign((ent.alertX ?? ent.x) - ent.x) || 1 : Math.sin((ent.t || 0) * 0.7) >= 0 ? 1 : -1;
    DrawPuppet(ctx, {
      x: 0,
      y: 0,
      facing,
      scale: s,
      palette: "enemy",
      clip: ent.dead ? "idle" : ent.alert > 0 ? "alert" : "walk",
      time: ent.t || 0,
      moving: !ent.dead,
      alert: (ent.alert || 0) > 0,
      alpha,
    });
    if (!ent.dead) {
      ctx.fillStyle = "rgba(155,47,47,.28)";
      ctx.beginPath();
      ctx.moveTo(0, -18 * s);
      ctx.lineTo(facing * 72 * s, -44 * s);
      ctx.lineTo(facing * 72 * s, 8 * s);
      ctx.closePath();
      ctx.fill();
      const maxHp = ent.maxHp || 2;
      const hp = Math.max(0, ent.hp || 0);
      ctx.fillStyle = "#1a1410";
      ctx.fillRect(-16 * s, -72 * s, 32 * s, 5 * s);
      ctx.fillStyle = "#a6452f";
      ctx.fillRect(-16 * s, -72 * s, 32 * s * (hp / maxHp), 5 * s);
      ctx.fillStyle = "#efe2c8";
      ctx.font = `700 ${10 * s}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("鬼子", 0, -78 * s);
    } else {
      ctx.fillStyle = "#7a7264";
      ctx.font = `700 ${10 * s}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("毙", 0, -70 * s);
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
    if (ent.exposed && !ent.trapped) {
      ctx.fillStyle = "#a6452f";
      ctx.font = `bold ${16 * s}px sans-serif`;
      ctx.fillText("!", -4 * s, -70 * s);
    }
  } else if (ent.type === "patrol") {
    DrawPuppet(ctx, {
      x: 0,
      y: 0,
      facing: Math.cos((ent.t || 0) * 0.65) >= 0 ? 1 : -1,
      scale: s,
      palette: "enemy",
      clip: ent.broken ? "idle" : "walk",
      time: ent.t || 0,
      moving: !ent.broken,
      alpha: ent.broken ? 0.3 : 1,
    });
    if (!ent.broken) {
      ctx.fillStyle = "rgba(155,47,47,.22)";
      ctx.beginPath();
      ctx.moveTo(0, -20 * s);
      ctx.lineTo(80 * s, -50 * s);
      ctx.lineTo(80 * s, 10 * s);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function DrawPictogram(kind, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#1a1410";
  ctx.fillStyle = "#efe2c8";
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeRect(0, 0, size, size);
  ctx.strokeStyle = "#1a1410";
  ctx.fillStyle = "#1a1410";
  const m = size * 0.2;
  const d = size - m * 2;
  if (kind === "shovel") {
    ctx.fillRect(m + d * 0.4, m, d * 0.2, d * 0.7);
    ctx.beginPath();
    ctx.moveTo(m + d * 0.15, m + d * 0.65);
    ctx.lineTo(m + d * 0.85, m + d * 0.65);
    ctx.lineTo(m + d * 0.5, m + d);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "hatch") {
    ctx.strokeRect(m + d * 0.25, m, d * 0.5, d);
    ctx.beginPath();
    ctx.moveTo(m + d * 0.35, m + d * 0.2);
    ctx.lineTo(m + d * 0.65, m + d * 0.35);
    ctx.lineTo(m + d * 0.35, m + d * 0.5);
    ctx.lineTo(m + d * 0.65, m + d * 0.65);
    ctx.lineTo(m + d * 0.35, m + d * 0.8);
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
  } else if (kind === "shot") {
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
  const b = state.bubble;
  if (!b || !b.icons?.length) return;
  const s = Scale();
  const x = WX(state.player.x);
  const y = WY(state.player.y) - (state.player.crouching ? 40 : 70) * s;
  const iconSize = 22 * s;
  const pad = 8 * s;
  const gap = 4 * s;
  const w = pad * 2 + b.icons.length * iconSize + (b.icons.length - 1) * gap;
  const h = pad * 2 + iconSize;
  const bx = x - w / 2;
  const by = y - h - 12 * s;
  ctx.save();
  ctx.fillStyle = "#efe2c8";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, w, h, 4 * s);
  else ctx.rect(bx, by, w, h);
  ctx.fill();
  ctx.stroke();
  // tail
  ctx.beginPath();
  ctx.moveTo(x - 6 * s, by + h);
  ctx.lineTo(x, by + h + 10 * s);
  ctx.lineTo(x + 6 * s, by + h);
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
  const key =
    hint === "dig" || hint === "design" || hint === "need_plan" || hint === "follow_plan"
      ? hint === "design"
        ? "J"
        : hint === "need_plan"
          ? "R"
          : hint === "follow_plan"
            ? "→"
            : "J"
      : hint === "plant_zone" && state.player.held === ITEM_CHARGE
        ? "F"
        : hint === "need_shovel"
          ? "E"
          : "E";
  const icon =
    hint === "dig" || hint === "need_shovel" || hint === "pickup" || hint === "follow_plan"
      ? "shovel"
      : hint === "hatch"
        ? "hatch"
        : hint === "bell"
          ? "bell"
          : hint === "shelter"
            ? "people"
            : hint === "shot_port"
              ? "shot"
              : hint === "flip_build" || hint === "flip_trap"
                ? "flip"
                : hint === "plant_zone" || hint === "signal"
                  ? "charge"
                  : "talk";
  // VH floating key circle
  ctx.save();
  ctx.fillStyle = "#efe2c8";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x + 28 * s, y - 36 * s, 14 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1a1410";
  ctx.font = `700 ${12 * s}px IBM Plex Sans, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(key, x + 28 * s, y - 36 * s);
  DrawPictogram(icon, x + 40 * s, y - 52 * s, 18 * s);
  if (hint === "need_shovel") {
    DrawPictogram("warn", x + 58 * s, y - 52 * s, 14 * s);
  }
  if (hint === "dig" && state.player.digging) {
    ctx.strokeStyle = "#a6452f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + 28 * s, y - 36 * s, 16 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.player.digProgress);
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
  const hold =
    p.held === ITEM_SHOVEL || p.digging
      ? "shovel"
      : p.held === ITEM_CHARGE
        ? "charge"
        : p.held === ITEM_GRENADE
          ? "grenade"
          : null;
  // Spine-style modular puppet — walk / crouch / dig clips on bone parts
  if (!p._animT) p._animT = 0;
  const moving = Math.abs(p.vx || 0) > 18;
  DrawPuppet(ctx, {
    x,
    y,
    facing: p.facing,
    scale: s,
    palette: "militia",
    clip: PickClip({
      digging: !!p.digging,
      crouching: !!p.crouching,
      vx: p.vx,
      moving,
    }),
    time: (performance.now() || 0) / 1000,
    hold,
    digging: !!p.digging,
    crouching: !!p.crouching,
    vx: p.vx,
    moving,
    alpha: blink ? 0.4 : 1,
  });
}

function DrawProjectiles() {
  const s = Scale();
  for (const p of state.projectiles || []) {
    ctx.save();
    ctx.fillStyle = "#5a6a3a";
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(WX(p.x), WY(p.y), 6 * s, 0, Math.PI * 2);
    ctx.fill();
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

function RenderSurfaceStack(w, h, camX, pal, opts = {}) {
  const playable = !!opts.playable;
  const s = Scale();
  const walkY = WY(SURFACE_Y);
  // 1 far sky + ridge bands
  DrawSky(w, h, pal);
  DrawDepthBackdrop(w, h, camX, pal);
  // 2 stage floor (perspective plate)
  DrawStageFloor(w, h, pal);

  // 3 BACK props by depth band — haze between FAR / MID / BACK
  const hazeFar = pal.night ? "rgba(18,24,32,.28)" : "rgba(170,190,180,.2)";
  const hazeMid = pal.night ? "rgba(16,20,24,.18)" : "rgba(140,150,120,.14)";
  for (const [depth, band] of PropsBehindBands(state.level.props)) {
    for (const prop of band) DrawProp(prop, pal);
    if (depth <= -3) DrawDepthVeil(w, h, walkY - 140 * s, walkY - 40 * s, hazeFar);
    else if (depth === -2) DrawDepthVeil(w, h, walkY - 90 * s, walkY - 10 * s, hazeMid);
  }
  if (playable) DrawSurfaceExtras();

  // Soft cool wash so play plane pops warmer against the back
  DrawDepthVeil(
    w,
    h,
    walkY - 50 * s,
    walkY + 20 * s,
    pal.night ? "rgba(10,12,16,.16)" : "rgba(90,110,90,.1)",
  );

  // 4 play-plane props + actors
  for (const prop of PropsPlay(state.level.props)) DrawProp(prop, pal);
  if (playable) {
    for (const shaft of state.level.shafts) DrawShaft(shaft);
    for (const ent of state.level.entities) DrawEntity(ent);
    DrawProjectiles();
    DrawPlayer();
    DrawSpeechBubble();
    DrawInteractPromptWorld();
  }

  // 5 FRONT occluders — paint AFTER player (real 2.5D cover)
  const front = PropsFront(state.level.props);
  for (const prop of front.filter((p) => (p.depth ?? 0) === 1)) DrawProp(prop, pal);
  // Darken a bit before NEAR so the closest plane punches harder
  DrawDepthVeil(
    w,
    h,
    walkY + 10 * s,
    h * 0.92,
    pal.night ? "rgba(0,0,0,.16)" : "rgba(20,12,8,.12)",
  );
  for (const prop of front.filter((p) => (p.depth ?? 0) >= 2)) DrawProp(prop, pal);

  // Near camera dirt skirt — solid bottom plane like VH stage edge
  ctx.fillStyle = pal.night ? "#0e0c0a" : "#2a1c12";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.86);
  for (let i = 0; i <= w; i += 28) {
    const wave = Math.sin((i + camX * 1.7) * 0.025) * 14 + Math.sin((i + camX) * 0.01) * 6;
    ctx.lineTo(i, h * 0.84 + wave);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // Skirt lip highlight
  ctx.strokeStyle = pal.night ? "#1a1410" : "#3a2818";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.84);
  for (let i = 0; i <= w; i += 28) {
    ctx.lineTo(i, h * 0.84 + Math.sin((i + camX * 1.7) * 0.025) * 14);
  }
  ctx.stroke();
  // Tiny near grass nubs along the skirt
  ctx.fillStyle = pal.night ? "#152016" : "#2a3820";
  for (let i = 0; i < 18; i++) {
    const x = ((i * 70 - camX * 1.6) % (w + 60)) - 20;
    const y0 = h * 0.84 + Math.sin((x + camX * 1.7) * 0.025) * 14;
    ctx.fillRect(x, y0 - 18, 5, 18);
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
  DrawSpeechBubble();
  DrawInteractPromptWorld();
  // Front lips / dirt clumps occlude the digger
  DrawTunnelFrontLips(pal);
}

function Render() {
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;
  const pal = state.level.palette;
  const camX = state.cameraX;

  if (state.phase === "title" || state.phase === "ending") {
    RenderSurfaceStack(w, h, camX * 0.35, pal, { playable: false });
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
    if (down && k === "escape" && state.phase === "play") {
      SetModal(state.pauseOpen ? null : "pause");
    }
  };
  window.addEventListener("keydown", (e) => setKey(e, true));
  window.addEventListener("keyup", (e) => setKey(e, false));

  for (const btn of document.querySelectorAll("[data-touch]")) {
    const kind = btn.getAttribute("data-touch");
    const on = (down) => {
      EnsureAudio();
      if (kind === "left") state.input.left = down;
      if (kind === "right") state.input.right = down;
      if (kind === "crouch") state.input.crouch = down;
      if (kind === "dig") {
        state.input.dig = down;
        if (down) state.input.digPressed = true;
      }
      if (kind === "design" && down) state.input.designTogglePressed = true;
      if (kind === "chamber" && down) state.input.planChamberPressed = true;
      if (kind === "corridor" && down) state.input.planCorridorPressed = true;
      if (kind === "up") state.input.up = down;
      if (kind === "interact" && down) state.input.interactPressed = true;
      if (kind === "use" && down) state.input.usePressed = true;
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
    btn.addEventListener("pointerleave", () => on(false));
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
  $("OpenHelpButton").addEventListener("click", () => SetModal("help"));
  $("CloseHelpButton").addEventListener("click", () => SetModal(null));
  $("OpenHistoryButton").addEventListener("click", () => SetModal("history"));
  $("CloseHistoryButton").addEventListener("click", () => SetModal(null));
  $("PauseButton").addEventListener("click", () => SetModal("pause"));
  $("ResumeButton").addEventListener("click", () => SetModal(null));
  $("RestartChapterButton").addEventListener("click", () => {
    state = RestartChapter(state);
    SetModal(null);
    SyncPhaseUi();
  });
  $("ExitTitleButton").addEventListener("click", () => {
    SaveToStorage(state);
    state.phase = "title";
    state.input = CreateInputState();
    SetModal(null);
    SyncPhaseUi();
  });
  $("FailRetryButton").addEventListener("click", () => {
    state = RestartChapter(state);
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
}

function Frame(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
  lastTs = ts;

  if (state.phase === "play" && !state.pauseOpen && !state.failed) {
    StepPlay(state, dt);
    SyncHud();
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
  BindInput();
  BindUi();
  SyncPhaseUi();
  document.title = `地道战 · 高家庄｜白盒 ${CACHE_BUST}`;

  // Agent / QA: /TunnelHeart1942/?preview=play boots straight into act1 surface
  const preview = new URLSearchParams(location.search).get("preview");
  if (preview === "play" || preview === "tunnel") {
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
