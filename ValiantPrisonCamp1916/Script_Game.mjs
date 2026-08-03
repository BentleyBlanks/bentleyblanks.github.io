import {
  BeginPlay,
  CACHE_BUST,
  CreateState,
  ITEM_LABELS,
  LOWER,
  PROLOGUE_BEATS,
  ResetState,
  Step,
  UPPER,
  W,
} from "./Script_Sim.mjs";

void W;

let prologueIndex = 0;

const $ = (id) => document.getElementById(id);
const canvas = $("GameCanvas");
const ctx = canvas.getContext("2d");

let state = CreateState();
let last = 0;
const keys = new Set();

function Resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function SyncInput() {
  const i = state.input;
  i.left = keys.has("a") || keys.has("arrowleft");
  i.right = keys.has("d") || keys.has("arrowright");
  i.crouch = keys.has("s") || keys.has("arrowdown");
}

function GuardSafariZoom() {
  let lastTouch = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouch < 320) e.preventDefault();
      lastTouch = now;
    },
    { passive: false }
  );
}

function Show(id, on) {
  const el = $(id);
  if (!el) return;
  el.hidden = !on;
}

function SyncHud() {
  const hand = $("Hand");
  const hearts = $("Hearts");
  const barkBox = $("BarkBox");
  const goals = $("Goals");
  if (hand) {
    const label = state.hand ? ITEM_LABELS[state.hand] || state.hand : "空手";
    const ammo = state.tomatoAmmo > 0 ? ` · 番茄×${state.tomatoAmmo}` : "";
    const bag = state.inv.length ? ` · 包:${state.inv.map((i) => ITEM_LABELS[i] || i).join("/")}` : "";
    hand.textContent = label + ammo + bag;
  }
  if (hearts) {
    hearts.textContent = state.street === "upper" ? "营内街" : "外围";
  }
  if (barkBox) {
    const on = !!(state.bark && state.barkT > 0);
    barkBox.hidden = !on;
    if (on) {
      $("BarkSpeaker").textContent = "卡尔";
      $("Bark").textContent = state.bark;
    }
  }
  if (goals) {
    goals.innerHTML = state.goals
      .map((g) => `<li class="${g.done ? "done" : ""}">${g.done ? "✓ " : ""}${g.text}</li>`)
      .join("");
  }
}

function DrawBg(viewW, viewH) {
  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, "#3a4238");
  g.addColorStop(0.45, "#2a322c");
  g.addColorStop(1, "#1a1e18");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);
}

function StreetY(street, viewH) {
  const worldY = street === "lower" ? LOWER : UPPER;
  return viewH * 0.72 - (state.camY || 0) + (worldY - UPPER) * 0.55;
}

function WorldToScreen(wx, wy, viewW, viewH) {
  const scale = Math.min(viewW / 1100, viewH / 520);
  const groundScreen = viewH * 0.78;
  const base = state.street === "lower" ? LOWER : UPPER;
  const sx = (wx - state.camX) * scale + viewW * 0.08;
  const sy = groundScreen - (base - wy) * scale * 0.15 - (wy === LOWER || state.street === "lower" ? 0 : 0);
  // dual street: offset vertical by street
  const streetOff = wy >= (UPPER + LOWER) / 2 ? 0 : -viewH * 0.22;
  return { x: sx, y: sy + streetOff, scale };
}

function DrawBuilding(x, w, h, label, tone, viewW, viewH, street) {
  const gy = street === "lower" ? LOWER : UPPER;
  const p0 = WorldToScreen(x, gy, viewW, viewH);
  const p1 = WorldToScreen(x + w, gy, viewW, viewH);
  const bw = Math.max(40, p1.x - p0.x);
  const bh = h * p0.scale;
  ctx.fillStyle = tone;
  ctx.strokeStyle = "#1a1612";
  ctx.lineWidth = 2;
  ctx.fillRect(p0.x, p0.y - bh, bw, bh);
  ctx.strokeRect(p0.x, p0.y - bh, bw, bh);
  // roof
  ctx.fillStyle = "#4a4034";
  ctx.fillRect(p0.x - 4, p0.y - bh - 14, bw + 8, 14);
  ctx.fillStyle = "#e8dfc8";
  ctx.font = `700 ${Math.max(11, 13 * p0.scale)}px "Noto Serif SC", serif`;
  ctx.fillText(label, p0.x + 10, p0.y - bh + 22);
  // windows
  ctx.fillStyle = "rgba(200,180,120,.25)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(p0.x + 16 + i * (bw / 3.2), p0.y - bh + 40, 22, 28);
  }
}

function DrawGround(viewW, viewH) {
  const gyU = WorldToScreen(0, UPPER, viewW, viewH);
  const gyL = WorldToScreen(0, LOWER, viewW, viewH);
  ctx.fillStyle = "#5a4a38";
  ctx.fillRect(0, gyU.y, viewW, 18);
  ctx.fillStyle = "#3d3428";
  ctx.fillRect(0, gyU.y + 18, viewW, viewH);
  if (state.street === "lower" || state.player.x > 3000) {
    ctx.fillStyle = "#4a4034";
    ctx.fillRect(0, gyL.y, viewW, 16);
  }
}

function DrawProp(ent, viewW, viewH) {
  if (ent.hidden) return;
  const gy = ent.street === "lower" ? LOWER : UPPER;
  if (ent.street !== "both" && ent.street !== state.street && !(ent.street === "upper" && state.street === "upper")) {
    if (ent.street !== state.player.street && ent.street !== "both") return;
  }
  const street = ent.street === "both" ? state.player.street : ent.street;
  const p = WorldToScreen(ent.x, street === "lower" ? LOWER : UPPER, viewW, viewH);
  const s = p.scale;

  ctx.save();
  if (ent.type === "valve") {
    ctx.fillStyle = ent.open ? "#6a9a5a" : "#8a6a4a";
    ctx.beginPath();
    ctx.arc(p.x, p.y - 28 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1612";
    ctx.stroke();
  } else if (ent.type === "cart") {
    ctx.fillStyle = "#6a5238";
    ctx.fillRect(p.x - 40 * s, p.y - 36 * s, 80 * s, 36 * s);
    ctx.fillStyle = "#2a2418";
    ctx.beginPath();
    ctx.arc(p.x - 22 * s, p.y, 10 * s, 0, Math.PI * 2);
    ctx.arc(p.x + 22 * s, p.y, 10 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (ent.type === "fence") {
    ctx.strokeStyle = ent.cut ? "#4a6a3a" : "#c8c0a8";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(p.x - 50 * s + i * 20 * s, p.y);
      ctx.lineTo(p.x - 40 * s + i * 20 * s, p.y - 70 * s);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(p.x - 55 * s, p.y - 50 * s);
    ctx.lineTo(p.x + 55 * s, p.y - 50 * s);
    ctx.stroke();
  } else if (ent.type === "dogBowl") {
    ctx.fillStyle = ent.fed ? "#8a7a5a" : "#5a4a3a";
    ctx.fillRect(p.x - 18 * s, p.y - 28 * s, 36 * s, 28 * s);
    ctx.fillStyle = "#c8b090";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 8 * s, 16 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (ent.type === "support") {
    ctx.strokeStyle = ent.hit ? "#5a3a2a" : "#8a6a3a";
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + (ent.hit ? 20 : 0) * s, p.y - 100 * s);
    ctx.stroke();
  } else if (ent.type === "stairs") {
    ctx.fillStyle = "#6a5a48";
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(p.x - 20 * s, p.y - i * 14 * s, 50 * s, 12 * s);
    }
  } else {
    ctx.fillStyle = "#7a6a4a";
    ctx.fillRect(p.x - 12 * s, p.y - 24 * s, 24 * s, 24 * s);
    ctx.fillStyle = "#e8dfc8";
    ctx.font = `${11 * s}px sans-serif`;
    ctx.fillText(ent.label || "", p.x - 20 * s, p.y - 30 * s);
  }
  // label
  if (ent.label && ent.type !== "support") {
    ctx.fillStyle = "rgba(232,223,200,.85)";
    ctx.font = `600 ${10 * s}px "IBM Plex Sans", sans-serif`;
    ctx.fillText(ent.label, p.x - 18 * s, p.y + 14 * s);
  }
  ctx.restore();
}

function DrawLights(viewW, viewH) {
  if (state.player.street !== "lower") return;
  for (const L of state.level.lights) {
    const swing = Math.sin(state.t * ((Math.PI * 2) / L.period) + L.phase);
    const cx = L.x + swing * 70;
    const p = WorldToScreen(cx, LOWER, viewW, viewH);
    const half = L.cone * 0.5 * p.scale;
    ctx.fillStyle = "rgba(255,220,120,.18)";
    ctx.beginPath();
    ctx.moveTo(p.x, 40);
    ctx.lineTo(p.x - half, p.y);
    ctx.lineTo(p.x + half, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e8d080";
    ctx.fillRect(p.x - 6, 24, 12, 16);
  }
}

function DrawPlayer(viewW, viewH) {
  const p = state.player;
  const sp = WorldToScreen(p.x, p.y, viewW, viewH);
  const s = sp.scale;
  const h = (p.crouch ? 32 : 48) * s;
  const w = 22 * s;
  ctx.fillStyle = "#3a4a38";
  ctx.fillRect(sp.x - w / 2, sp.y - h, w, h);
  ctx.fillStyle = "#c8b090";
  ctx.beginPath();
  ctx.arc(sp.x, sp.y - h - 8 * s, 9 * s, 0, Math.PI * 2);
  ctx.fill();
  // POW stripes
  ctx.fillStyle = "#e8dfc8";
  ctx.fillRect(sp.x - w / 2 + 2, sp.y - h + 8 * s, w - 4, 4 * s);
  ctx.fillRect(sp.x - w / 2 + 2, sp.y - h + 18 * s, w - 4, 4 * s);
}

function DrawThrows(viewW, viewH) {
  for (const t of state.throws) {
    const p = WorldToScreen(t.x, t.y > UPPER - 10 ? UPPER : t.y, viewW, viewH);
    // approximate y
    const sp = WorldToScreen(t.x, UPPER, viewW, viewH);
    const y = sp.y - (UPPER - t.y) * sp.scale * 0.4;
    ctx.fillStyle = "#c44a3a";
    ctx.beginPath();
    ctx.arc(sp.x, y, 7 * sp.scale, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const b of state.bags) {
    const sp = WorldToScreen(b.x, UPPER, viewW, viewH);
    const y = sp.y - (UPPER - b.y) * sp.scale * 0.4;
    ctx.fillStyle = "#d8c8a0";
    ctx.fillRect(sp.x - 14 * sp.scale, y - 18 * sp.scale, 28 * sp.scale, 18 * sp.scale);
  }
}

function DrawWaterPipe(viewW, viewH) {
  if (!state.flags.boilerFueled) return;
  const a = WorldToScreen(400, UPPER, viewW, viewH);
  ctx.strokeStyle = state.waterOn ? "#5a9aca" : "#6a5a4a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(a.x - 40 * a.scale, a.y - 50 * a.scale);
  ctx.lineTo(a.x + 160 * a.scale, a.y - 50 * a.scale);
  ctx.stroke();
}

function Render() {
  const viewW = canvas.clientWidth || innerWidth;
  const viewH = canvas.clientHeight || innerHeight;
  DrawBg(viewW, viewH);

  if (state.mode === "play" || state.mode === "win") {
    // buildings
    if (state.player.street === "upper") {
      DrawBuilding(80, 500, 160, "澡堂", "#5a5248", viewW, viewH, "upper");
      DrawBuilding(720, 460, 150, "厨房", "#4a4a40", viewW, viewH, "upper");
      DrawBuilding(1320, 500, 140, "洗衣房", "#524840", viewW, viewH, "upper");
      DrawBuilding(1960, 400, 130, "宿舍", "#4a4038", viewW, viewH, "upper");
      DrawBuilding(2500, 460, 140, "医务室", "#484a42", viewW, viewH, "upper");
    } else {
      DrawBuilding(3400, 400, 100, "岗楼", "#3a3830", viewW, viewH, "lower");
      DrawBuilding(4000, 280, 90, "哨塔", "#35332c", viewW, viewH, "lower");
    }
    DrawGround(viewW, viewH);
    DrawWaterPipe(viewW, viewH);
    DrawLights(viewW, viewH);
    for (const e of state.level.interact) DrawProp(e, viewW, viewH);
    DrawThrows(viewW, viewH);
    DrawPlayer(viewW, viewH);
    if (state.caughtFlash > 0) {
      ctx.fillStyle = `rgba(180,40,30,${state.caughtFlash})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }
}

function Frame(ts) {
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  SyncInput();
  Step(state, dt);
  SyncHud();
  Render();
  if (state.mode === "win") {
    Show("Win", true);
    Show("Hud", false);
    Show("Touch", false);
  }
  requestAnimationFrame(Frame);
}

function StartGame() {
  state = CreateState();
  Show("Title", false);
  Show("Prologue", true);
  prologueIndex = 0;
  ShowPrologueBeat();
}

function ShowPrologueBeat() {
  const beat = PROLOGUE_BEATS[prologueIndex];
  if (!beat) {
    Show("Prologue", false);
    BeginPlay(state);
    Show("Hud", true);
    Show("Touch", matchMedia("(pointer: coarse)").matches);
    return;
  }
  $("PrologueSpeaker").textContent = beat.speaker;
  $("PrologueLine").textContent = beat.text;
}

function Bind() {
  $("BtnPlay").addEventListener("click", StartGame);
  $("BtnPrologue").addEventListener("click", () => {
    prologueIndex += 1;
    if (prologueIndex >= PROLOGUE_BEATS.length) {
      Show("Prologue", false);
      BeginPlay(state);
      Show("Hud", true);
      Show("Touch", matchMedia("(pointer: coarse)").matches);
    } else ShowPrologueBeat();
  });
  $("BtnReplay").addEventListener("click", () => {
    Show("Win", false);
    state = ResetState();
    StartGame();
  });

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === " " || k === "spacebar") {
      e.preventDefault();
      state.input.jumpPressed = true;
    }
    if (k === "e") state.input.actPressed = true;
    if (k === "f") state.input.throwPressed = true;
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  for (const btn of document.querySelectorAll("#Touch button")) {
    const k = btn.getAttribute("data-k");
    const down = (e) => {
      e.preventDefault();
      if (k === "left") keys.add("a");
      if (k === "right") keys.add("d");
      if (k === "crouch") keys.add("s");
      if (k === "jump") state.input.jumpPressed = true;
      if (k === "act") state.input.actPressed = true;
      if (k === "throw") state.input.throwPressed = true;
    };
    const up = (e) => {
      e.preventDefault();
      if (k === "left") keys.delete("a");
      if (k === "right") keys.delete("d");
      if (k === "crouch") keys.delete("s");
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointerleave", up);
  }
}

Resize();
window.addEventListener("resize", Resize);
GuardSafariZoom();
Bind();
requestAnimationFrame(Frame);
console.info("ValiantPrisonCamp1916", CACHE_BUST);

