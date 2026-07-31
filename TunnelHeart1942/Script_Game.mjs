import { CHAPTERS, CACHE_BUST } from "./Data_Story.mjs";
import {
  AdvancePanels,
  CreateCampaignState,
  CreateInputState,
  LoadFromStorage,
  PLAYER_H,
  RestartChapter,
  SaveToStorage,
  StepPlay,
} from "./Script_Rules.mjs";
import { AIR, HARD, SOFT, CellWorldRect } from "./Script_Dig.mjs";
import { ITEM_CHARGE, ITEM_GRENADE, ITEM_META, ITEM_SHOVEL } from "./Script_Items.mjs";
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
  const list = state.phase === "panels" ? chapter.openPanels : chapter.closePanels;
  const beat = list[state.panelIndex];
  $("PanelKicker").textContent = `第 ${chapter.act} 页`;
  $("PanelTitle").textContent = chapter.title;
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
  slot.innerHTML = meta
    ? `<b style="--item:${meta.color}"></b><span>${meta.label}</span><em>${meta.tip}</em>`
    : `<b></b><span>空手</span><em>走近地上的道具按 E 捡起（一次只拿一件）</em>`;
  if (meta) slot.querySelector("b").dataset.item = held;
}

function SyncPhaseUi() {
  const phase = state.phase;
  Show($("TitleScreen"), phase === "title");
  Show($("PanelScreen"), phase === "panels" || phase === "closePanels");
  Show($("EndingScreen"), phase === "ending");
  Show($("GameHud"), phase === "play");
  const letter = document.querySelector(".comicLetterbox");
  if (letter) letter.style.visibility = phase === "play" ? "visible" : "hidden";
  if (phase === "title") SyncTitle();
  if (phase === "panels" || phase === "closePanels") SyncPanels();
  if (phase === "play") SyncHud();
  if (state.failed) SetModal("fail");
}

function BeginFrom(chapterIndex) {
  state = CreateCampaignState(chapterIndex, LoadFromStorage());
  state.phase = "panels";
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

// ─── Valiant Hearts-style layered depth ─────────────────────────
function DrawSky(w, h, pal) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(0.55, pal.skyBot);
  g.addColorStop(1, pal.earth);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // soft sun / moon
  ctx.globalAlpha = pal.night ? 0.35 : 0.5;
  ctx.fillStyle = pal.night ? "#d9e2f0" : "#f0d9a0";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.18, pal.night ? 22 : 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function DrawParallaxHills(w, h, camX, pal, factor, yBase, amp, color) {
  const scale = Scale();
  const scroll = camX * factor;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= w + 40; i += 20) {
    const wx = i + scroll;
    const n =
      Math.sin(wx * 0.0031) * amp +
      Math.sin(wx * 0.007) * amp * 0.45 +
      Math.sin(wx * 0.013) * amp * 0.2;
    const y = yBase + n * scale;
    ctx.lineTo(i, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function DrawFarVillage(w, h, camX, pal) {
  const scale = Scale();
  const scroll = camX * 0.42;
  const baseY = h * 0.58;
  ctx.fillStyle = pal.night ? "#243028" : "#5a6a4e";
  for (let i = -2; i < 18; i++) {
    const x = ((i * 140 - scroll) % (w + 200)) - 40;
    const bw = 28 + ((i * 17) % 22);
    const bh = 36 + ((i * 13) % 40);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, baseY - bh * scale, bw * scale, bh * scale);
    // roof triangle
    ctx.beginPath();
    ctx.moveTo(x - 4 * scale, baseY - bh * scale);
    ctx.lineTo(x + bw * 0.5 * scale, baseY - (bh + 16) * scale);
    ctx.lineTo(x + (bw + 4) * scale, baseY - bh * scale);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function DrawFieldBands(w, h, camX, pal) {
  DrawParallaxHills(w, h, camX, pal, 0.12, h * 0.5, 18, pal.haze);
  DrawParallaxHills(w, h, camX, pal, 0.28, h * 0.56, 14, pal.field);
  DrawFarVillage(w, h, camX, pal);
  DrawParallaxHills(w, h, camX, pal, 0.55, h * 0.64, 10, pal.earth);
}

function DrawForeground(w, h, camX, pal) {
  const scale = Scale();
  const scroll = camX * 1.35;
  ctx.strokeStyle = pal.night ? "rgba(180,200,160,.25)" : "rgba(40,50,30,.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const x = ((i * 55 - scroll) % (w + 60)) - 20;
    const hgt = (18 + (i % 5) * 6) * scale;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(x, h * 0.92);
    ctx.quadraticCurveTo(x + 4, h * 0.92 - hgt * 0.5, x - 2, h * 0.92 - hgt);
    ctx.stroke();
  }
  // fence posts
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#3a2a1c";
  for (let i = 0; i < 12; i++) {
    const x = ((i * 160 - scroll * 0.9) % (w + 80)) - 30;
    ctx.fillRect(x, h * 0.78, 4 * scale, h * 0.14);
  }
  ctx.globalAlpha = 1;
}

function DrawSoilCutaway(w, h, camX, pal) {
  // Cross-section depth bands — the VH digging-scene feel
  const bands = [
    { y0: 0.0, y1: 0.22, c: pal.skyTop, a: 0.35 },
    { y0: 0.18, y1: 0.38, c: pal.earth, a: 0.55 },
    { y0: 0.34, y1: 0.55, c: pal.soilLight, a: 0.85 },
    { y0: 0.5, y1: 0.72, c: pal.soilMid, a: 1 },
    { y0: 0.68, y1: 1, c: pal.soilDeep, a: 1 },
  ];
  for (const b of bands) {
    ctx.globalAlpha = b.a;
    ctx.fillStyle = b.c;
    ctx.fillRect(0, h * b.y0, w, h * (b.y1 - b.y0));
  }
  ctx.globalAlpha = 1;

  // tiny surface silhouettes along the cut line
  const cutY = h * 0.34;
  ctx.fillStyle = "rgba(30,40,28,.55)";
  const scroll = camX * 0.5;
  for (let i = 0; i < 14; i++) {
    const x = ((i * 120 - scroll) % (w + 100)) - 20;
    ctx.fillRect(x, cutY - 28, 22, 28);
  }
  ctx.strokeStyle = "rgba(20,14,10,.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, cutY);
  ctx.lineTo(w, cutY);
  ctx.stroke();
  ctx.fillStyle = "rgba(239,224,197,.55)";
  ctx.font = "600 12px IBM Plex Sans, sans-serif";
  ctx.fillText("地面剖线", 16, cutY - 8);
}

function DrawProp(prop, pal) {
  const s = Scale();
  const x = WX(prop.x);
  const y = WY(SURFACE_Y);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2.5 * s;
  ctx.strokeStyle = "#1c1712";
  if (prop.kind === "house") {
    const bw = 90 * s;
    const bh = 70 * s;
    ctx.fillStyle = prop.variant ? "#b8956a" : "#c4a27a";
    ctx.fillRect(-bw / 2, -bh, bw, bh);
    ctx.strokeRect(-bw / 2, -bh, bw, bh);
    ctx.fillStyle = "#6e2a1c";
    ctx.beginPath();
    ctx.moveTo(-bw / 2 - 6 * s, -bh);
    ctx.lineTo(0, -bh - 28 * s);
    ctx.lineTo(bw / 2 + 6 * s, -bh);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#3a2418";
    ctx.fillRect(-10 * s, -36 * s, 20 * s, 36 * s);
  } else if (prop.kind === "tree") {
    ctx.fillStyle = "#5c4030";
    ctx.fillRect(-5 * s, -90 * s, 10 * s, 90 * s);
    ctx.fillStyle = "#4f6344";
    ctx.beginPath();
    ctx.arc(0, -100 * s, 36 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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
    ctx.fillStyle = "#5a5852";
    ctx.fillRect(-70 * s, -150 * s, 140 * s, 150 * s);
    ctx.fillStyle = "#3e3c38";
    ctx.fillRect(-45 * s, -200 * s, 90 * s, 50 * s);
    ctx.strokeRect(-70 * s, -150 * s, 140 * s, 150 * s);
    ctx.strokeRect(-45 * s, -200 * s, 90 * s, 50 * s);
  }
  ctx.restore();
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
  const x = WX(ent.x);
  const y = WY(ent.y);
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
    ctx.fillStyle = ent.type === "spy_talk" ? "#6b7058" : ent.type === "shelter" ? "#c4a27a" : "#4a5d4a";
    if (ent.done && ent.type === "shelter") ctx.globalAlpha = 0.35;
    ctx.fillRect(-13 * s, -48 * s, 26 * s, 48 * s);
    ctx.strokeRect(-13 * s, -48 * s, 26 * s, 48 * s);
    ctx.fillStyle = "#e7d0b0";
    ctx.beginPath();
    ctx.arc(0, -56 * s, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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
    if (!ent.used) glow();
    ctx.fillStyle = "#2f5d4a";
    ctx.fillRect(-17 * s, -26 * s, 34 * s, 26 * s);
    ctx.strokeRect(-17 * s, -26 * s, 34 * s, 26 * s);
  } else if (ent.type === "spy") {
    ctx.fillStyle = ent.trapped ? "#444" : "#5a4030";
    ctx.fillRect(-13 * s, -48 * s, 26 * s, 48 * s);
    ctx.strokeRect(-13 * s, -48 * s, 26 * s, 48 * s);
    ctx.fillStyle = "#e7d0b0";
    ctx.beginPath();
    ctx.arc(0, -56 * s, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (ent.exposed && !ent.trapped) {
      ctx.fillStyle = "#a6452f";
      ctx.font = `bold ${16 * s}px sans-serif`;
      ctx.fillText("!", -4 * s, -70 * s);
    }
  } else if (ent.type === "patrol") {
    if (ent.broken) ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#3e4638";
    ctx.fillRect(-13 * s, -48 * s, 26 * s, 48 * s);
    ctx.strokeRect(-13 * s, -48 * s, 26 * s, 48 * s);
    ctx.fillStyle = "#c9b89a";
    ctx.beginPath();
    ctx.arc(0, -56 * s, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(155,47,47,.22)";
    ctx.beginPath();
    ctx.moveTo(0, -20 * s);
    ctx.lineTo(80 * s, -50 * s);
    ctx.lineTo(80 * s, 10 * s);
    ctx.closePath();
    ctx.fill();
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
    hint === "dig" ? "J" : hint === "plant_zone" && state.player.held === ITEM_CHARGE ? "F" : hint === "need_shovel" ? "E" : "E";
  const icon =
    hint === "dig" || hint === "need_shovel" || hint === "pickup"
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
  const h = (p.crouching ? PLAYER_H * 0.7 : PLAYER_H) * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(p.facing, 1);
  if (p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0) ctx.globalAlpha = 0.4;
  ctx.lineWidth = 2.5 * s;
  ctx.strokeStyle = "#1a1410";
  ctx.fillStyle = "#4d6b57";
  ctx.fillRect(-13 * s, -h, 26 * s, h);
  ctx.strokeRect(-13 * s, -h, 26 * s, h);
  ctx.fillStyle = "#e7d0b0";
  ctx.beginPath();
  ctx.arc(0, -h - 9 * s, 9 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Always show carried tool in hand (VH one-item carry)
  if (p.held === ITEM_SHOVEL || p.digging) {
    ctx.strokeStyle = "#8b6a45";
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(10 * s, -22 * s);
    ctx.lineTo(p.digging ? 32 * s : 26 * s, p.digging ? -4 * s : -10 * s);
    ctx.stroke();
    ctx.fillStyle = "#6e5a3a";
    ctx.fillRect((p.digging ? 28 : 22) * s, (p.digging ? -8 : -14) * s, 12 * s, 10 * s);
  } else if (p.held === ITEM_CHARGE) {
    ctx.fillStyle = "#4a3a2a";
    ctx.fillRect(10 * s, -28 * s, 16 * s, 14 * s);
    ctx.strokeRect(10 * s, -28 * s, 16 * s, 14 * s);
  } else if (p.held === ITEM_GRENADE) {
    ctx.fillStyle = "#5a6a3a";
    ctx.beginPath();
    ctx.arc(16 * s, -22 * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
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
}

function DrawGroundStrip(w, h, pal) {
  // Play-depth ground plane shadow under feet — anchors the stage
  const y = WY(SURFACE_Y);
  const g = ctx.createLinearGradient(0, y - 10, 0, h);
  g.addColorStop(0, pal.night ? "rgba(30,28,24,.0)" : "rgba(80,60,40,.0)");
  g.addColorStop(0.05, pal.night ? "#2a3228" : "#7a6248");
  g.addColorStop(1, pal.night ? "#1a1814" : "#4a3828");
  ctx.fillStyle = g;
  ctx.fillRect(0, y, w, h - y + 4);
  ctx.strokeStyle = "rgba(28,23,18,.45)";
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
}

function Render() {
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;
  const pal = state.level.palette;
  const camX = state.cameraX;

  if (state.player.inTunnel && state.phase === "play") {
    DrawSoilCutaway(w, h, camX, pal);
    DrawSoilGrid(pal);
  } else {
    DrawSky(w, h, pal);
    DrawFieldBands(w, h, camX, pal);
    DrawGroundStrip(w, h, pal);
  }

  if (state.phase === "play" || state.phase === "panels" || state.phase === "closePanels") {
    if (!state.player.inTunnel) {
      for (const prop of state.level.props) DrawProp(prop, pal);
      DrawSurfaceExtras();
    } else {
      ctx.globalAlpha = 0.22;
      for (const prop of state.level.props) DrawProp(prop, pal);
      ctx.globalAlpha = 1;
    }

    for (const shaft of state.level.shafts) DrawShaft(shaft);
    for (const ent of state.level.entities) DrawEntity(ent);
    if (state.phase === "play") {
      DrawProjectiles();
      DrawPlayer();
      DrawSpeechBubble();
      DrawInteractPromptWorld();
    }

    if (!state.player.inTunnel && state.phase === "play") {
      DrawForeground(w, h, camX, pal);
    }
  } else if (state.phase === "title" || state.phase === "ending") {
    DrawSky(w, h, pal);
    DrawFieldBands(w, h, camX * 0.2, pal);
    DrawGroundStrip(w, h, pal);
    DrawForeground(w, h, camX * 0.2, pal);
  }

  // hatch transition veil
  if (state.transition > 0) {
    const a = state.transition < 0.5 ? state.transition * 2 : (1 - state.transition) * 2;
    ctx.fillStyle = `rgba(10,8,6,${Math.min(1, a)})`;
    ctx.fillRect(0, 0, w, h);
  }

}

function BindInput() {
  const setKey = (e, down) => {
    const input = state.input;
    const k = e.key.toLowerCase();
    if (["arrowleft", "a"].includes(k)) input.left = down;
    if (["arrowright", "d"].includes(k)) input.right = down;
    if (["arrowdown", "s"].includes(k)) input.crouch = down;
    if (["j", "shift"].includes(k)) input.dig = down;
    if (["w", "arrowup"].includes(k)) {
      input.up = down;
      if (down) e.preventDefault();
    }
    if (down && (k === " " || k === "enter")) {
      if (state.phase === "panels" || state.phase === "closePanels") {
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
      if (state.phase === "panels" || state.phase === "closePanels") {
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
      if (kind === "dig") state.input.dig = down;
      if (kind === "up") state.input.up = down;
      if (kind === "interact" && down) state.input.interactPressed = true;
      if (kind === "use" && down) state.input.usePressed = true;
    };
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
  requestAnimationFrame(Frame);
}

Main();

export { state as __debugState, BeginFrom as __debugBeginFrom };
