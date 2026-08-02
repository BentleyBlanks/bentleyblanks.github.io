import {
  BeginPlay,
  CACHE_BUST,
  CreateState,
  GROUND,
  PROLOGUE_LINE,
  Step,
  W,
} from "./Script_Sim.mjs";

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

function Bind() {
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key)) e.preventDefault();
    if (k === " " || k === "w" || k === "arrowup") state.input.jumpPressed = true;
    if (k === "e") state.input.actPressed = true;
    if (k === "f" || k === "j") state.input.throwPressed = true;
    if (state.phase === "title" && (k === "enter" || k === " ")) openPrologue();
    if (state.phase === "prologue" && (k === "enter" || k === " " || k === "e")) start();
    if (state.phase === "win" && k === "enter") openPrologue();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  $("BtnPlay").onclick = openPrologue;
  $("BtnPrologue").onclick = start;
  $("BtnReplay").onclick = openPrologue;

  const touch = $("Touch");
  const hold = { left: false, right: false, crouch: false };
  for (const btn of touch.querySelectorAll("button")) {
    const k = btn.dataset.k;
    const down = (ev) => {
      ev.preventDefault();
      if (k === "left") hold.left = true;
      if (k === "right") hold.right = true;
      if (k === "crouch") hold.crouch = true;
      if (k === "jump") state.input.jumpPressed = true;
      if (k === "act") state.input.actPressed = true;
      if (k === "throw") state.input.throwPressed = true;
    };
    const up = (ev) => {
      ev.preventDefault();
      if (k === "left") hold.left = false;
      if (k === "right") hold.right = false;
      if (k === "crouch") hold.crouch = false;
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
  }
  setInterval(() => {
    if (hold.left) keys.add("a");
    else keys.delete("a");
    if (hold.right) keys.add("d");
    else keys.delete("d");
    if (hold.crouch) keys.add("s");
    else keys.delete("s");
  }, 16);

  if (matchMedia("(max-width: 720px)").matches) touch.hidden = false;
}

function openPrologue() {
  state.phase = "prologue";
  $("Title").hidden = true;
  $("Win").hidden = true;
  $("Hud").hidden = true;
  $("Prologue").hidden = false;
  const line = $("Prologue").querySelector(".prologueLine");
  if (line) line.textContent = PROLOGUE_LINE;
}

function start() {
  BeginPlay(state);
  $("Title").hidden = true;
  $("Prologue").hidden = true;
  $("Win").hidden = true;
  $("Hud").hidden = false;
  canvas.focus();
}

function WX(x) {
  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * 14 * state.shake : 0;
  return x - state.cameraX + shakeX;
}
function WY(y) {
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * 10 * state.shake : 0;
  const h = canvas.clientHeight || innerHeight;
  const scale = h / 540;
  return y * scale + shakeY;
}
function S() {
  return (canvas.clientHeight || innerHeight) / 540;
}

function DrawSky(w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#6d7f78");
  g.addColorStop(0.45, "#a3b29a");
  g.addColorStop(1, "#cbb892");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // smoke columns
  ctx.fillStyle = "rgba(40,36,30,.18)";
  for (let i = 0; i < 6; i++) {
    const x = ((i * 280 - state.cameraX * 0.25) % (w + 200)) - 40;
    ctx.beginPath();
    ctx.ellipse(x, h * 0.2, 40 + i * 4, 70, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function DrawGround(w, h) {
  const s = S();
  const gy = WY(GROUND);
  ctx.fillStyle = "#5a6a3e";
  ctx.fillRect(0, gy, w, h - gy);
  ctx.fillStyle = "#6b4a30";
  ctx.fillRect(0, gy, w, 18 * s);
  // mud streaks
  ctx.strokeStyle = "rgba(40,28,18,.35)";
  ctx.lineWidth = 2;
  for (let x = -((state.cameraX * 0.5) % 60); x < w; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, gy + 8);
    ctx.lineTo(x + 30, gy + 22);
    ctx.stroke();
  }
}

function DrawBarn() {
  const s = S();
  const x = WX(1050);
  const y = WY(GROUND);
  ctx.fillStyle = "#6a3d2a";
  ctx.fillRect(x - 120 * s, y - 160 * s, 240 * s, 160 * s);
  ctx.fillStyle = "#3d281c";
  ctx.beginPath();
  ctx.moveTo(x - 130 * s, y - 158 * s);
  ctx.lineTo(x, y - 220 * s);
  ctx.lineTo(x + 130 * s, y - 158 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1c1710";
  ctx.fillRect(x - 28 * s, y - 70 * s, 56 * s, 70 * s);
}

function DrawSolid(sld) {
  if (sld.kind === "ground") return;
  const s = S();
  const x = WX(sld.x);
  const y = WY(sld.y);
  ctx.fillStyle = sld.kind === "sandbag" ? "#7a6a48" : "#8a6238";
  ctx.strokeStyle = "#1c1710";
  ctx.lineWidth = 2;
  ctx.fillRect(x - (sld.w / 2) * s, y - sld.h * s, sld.w * s, sld.h * s);
  ctx.strokeRect(x - (sld.w / 2) * s, y - sld.h * s, sld.w * s, sld.h * s);
}

function DrawEntity(e) {
  if (e.hidden || e.taken) return;
  const s = S();
  const x = WX(e.x);
  const y = WY(e.y);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1c1710";

  if (e.type === "pickup") {
    if (e.behindGap) {
      ctx.restore();
      return;
    }
    ctx.fillStyle = "#efe2c8";
    ctx.fillRect(-14 * s, -28 * s, 28 * s, 28 * s);
    ctx.strokeRect(-14 * s, -28 * s, 28 * s, 28 * s);
    ctx.fillStyle = "#1c1710";
    ctx.font = `700 ${11 * s}px IBM Plex Sans, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(e.label || "?", 0, -10 * s);
  } else if (e.type === "patrol") {
    if (e.stun > 0) ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#3e4634";
    ctx.fillRect(-13 * s, -48 * s, 26 * s, 48 * s);
    ctx.strokeRect(-13 * s, -48 * s, 26 * s, 48 * s);
    ctx.fillStyle = "#2a3224";
    ctx.fillRect(-16 * s, -60 * s, 32 * s, 12 * s);
    ctx.fillStyle = "#d8c2a0";
    ctx.beginPath();
    ctx.arc(0, -54 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // vision cone
    if (e.stun <= 0) {
      ctx.fillStyle = "rgba(155,47,47,.16)";
      ctx.beginPath();
      ctx.moveTo(0, -30 * s);
      ctx.lineTo(e.facing * e.cone * s, -70 * s);
      ctx.lineTo(e.facing * e.cone * s, 10 * s);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#efe2c8";
      ctx.font = `700 ${12 * s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("@", 0, -70 * s);
    }
  } else if (e.type === "dog") {
    ctx.fillStyle = "#5a4030";
    ctx.fillRect(-16 * s, -22 * s, 28 * s, 18 * s);
    ctx.fillRect(8 * s, -28 * s, 14 * s, 12 * s);
    ctx.strokeRect(-16 * s, -22 * s, 28 * s, 18 * s);
    ctx.fillStyle = "#efe2c8";
    ctx.font = `700 ${10 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Walt", 0, -34 * s);
  } else if (e.type === "gap") {
    ctx.fillStyle = "#2a2118";
    ctx.fillRect(-20 * s, -22 * s, 40 * s, 22 * s);
    ctx.strokeRect(-20 * s, -22 * s, 40 * s, 22 * s);
    ctx.fillStyle = "#c9a45a";
    ctx.font = `700 ${9 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("gap", 0, -28 * s);
  } else if (e.type === "wire") {
    if (e.cut) {
      ctx.restore();
      return;
    }
    ctx.strokeStyle = "#b0b0b0";
    ctx.lineWidth = 2.5 * s;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((-e.w / 2) * s, (-8 - i * 8) * s);
      ctx.lineTo((e.w / 2) * s, (-16 - i * 6) * s);
      ctx.stroke();
    }
  } else if (e.type === "dirt") {
    if (e.dug) {
      ctx.restore();
      return;
    }
    ctx.fillStyle = "#8a6238";
    ctx.fillRect((-e.w / 2) * s, -e.h * s, e.w * s, e.h * s);
    ctx.strokeRect((-e.w / 2) * s, -e.h * s, e.w * s, e.h * s);
    ctx.fillStyle = "#efe2c8";
    ctx.font = `700 ${10 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`dig ${e.hp}`, 0, -e.h * s - 8 * s);
  } else if (e.type === "mg") {
    if (!e.alive) ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#3a3530";
    ctx.fillRect(-30 * s, -56 * s, 60 * s, 56 * s);
    ctx.strokeRect(-30 * s, -56 * s, 60 * s, 56 * s);
    ctx.fillStyle = "#2a2824";
    ctx.fillRect(-50 * s, -40 * s, 40 * s, 8 * s);
    if (e.alive) {
      ctx.fillStyle = "#a6452f";
      ctx.font = `700 ${11 * s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("MG", 0, -64 * s);
    }
  } else if (e.type === "medic") {
    if (e.rescued) {
      ctx.restore();
      return;
    }
    ctx.fillStyle = "#c4a27a";
    ctx.fillRect(-12 * s, -36 * s, 24 * s, 24 * s);
    ctx.strokeRect(-12 * s, -36 * s, 24 * s, 24 * s);
    ctx.fillStyle = "#e7d0b0";
    ctx.beginPath();
    ctx.arc(0, -42 * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#efe2c8";
    ctx.font = `700 ${10 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(e.carried ? "" : "medic", 0, -56 * s);
  } else if (e.type === "cart") {
    ctx.fillStyle = "#5a4030";
    ctx.fillRect(-45 * s, -40 * s, 90 * s, 40 * s);
    ctx.strokeRect(-45 * s, -40 * s, 90 * s, 40 * s);
    ctx.beginPath();
    ctx.arc(-28 * s, 0, 12 * s, 0, Math.PI * 2);
    ctx.arc(28 * s, 0, 12 * s, 0, Math.PI * 2);
    ctx.fillStyle = "#1c1710";
    ctx.fill();
    ctx.fillStyle = "#efe2c8";
    ctx.font = `700 ${11 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("CART", 0, -48 * s);
  }
  ctx.restore();
}

function DrawPlayer() {
  const p = state.player;
  const s = S();
  const x = WX(p.x);
  const y = WY(p.y);
  const h = (p.crouching ? 34 : 48) * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(p.facing, 1);
  if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#3d4d3a";
  ctx.strokeStyle = "#1c1710";
  ctx.lineWidth = 2;
  ctx.fillRect(-13 * s, -h, 26 * s, h);
  ctx.strokeRect(-13 * s, -h, 26 * s, h);
  ctx.fillStyle = "#e7d0b0";
  ctx.beginPath();
  ctx.arc(0, -h - 8 * s, 8 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (p.carryingMedic) {
    ctx.fillStyle = "#c4a27a";
    ctx.fillRect(6 * s, -h + 4 * s, 18 * s, 20 * s);
    ctx.strokeRect(6 * s, -h + 4 * s, 18 * s, 20 * s);
  }
  ctx.restore();
}

function DrawProjectiles() {
  const s = S();
  for (const p of state.projectiles) {
    ctx.save();
    ctx.fillStyle = p.kind === "grenade" ? "#3a4630" : "#b0a090";
    ctx.strokeStyle = "#1c1710";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(WX(p.x), WY(p.y), (p.kind === "grenade" ? 7 : 6) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function DrawPrompt() {
  if (state.phase !== "play") return;
  const p = state.player;
  const s = S();
  let label = "";
  const dog = state.level.entities.find((e) => e.type === "dog");
  const cutters = state.level.entities.find((e) => e.id === "cutters");
  if (dog && Math.abs(p.x - dog.x) < 75) {
    if (cutters && !cutters.taken && cutters.behindGap) label = "E  Walt fetch";
    else if (state.level.entities.find((e) => e.type === "mg")?.alive && p.x > 2000) label = "E  distract";
  }
  for (const e of state.level.entities) {
    if (e.type === "pickup" && !e.taken && !e.hidden && !e.behindGap && Math.abs(p.x - e.x) < 42) label = "E / F  pick";
    if (e.type === "wire" && !e.cut && e.needs === "cutters" && Math.abs(p.x - e.x) < 55) label = "E  cut";
    if (e.type === "dirt" && !e.dug && Math.abs(p.x - e.x) < 60) label = "E  dig";
    if (e.type === "medic" && !e.rescued && Math.abs(p.x - e.x) < 50) label = p.carryingMedic ? "E  drop" : "E  carry";
    if (e.type === "cart" && p.carryingMedic && Math.abs(p.x - e.x) < 70) label = "E  load cart";
  }
  if (p.held) label = (label ? label + " · " : "") + "F  throw";
  if (!label) return;
  ctx.fillStyle = "rgba(240,226,196,.92)";
  ctx.strokeStyle = "#1c1710";
  ctx.lineWidth = 2;
  const x = WX(p.x);
  const y = WY(p.y) - 70 * s;
  ctx.font = `700 ${12 * s}px IBM Plex Sans, sans-serif`;
  const tw = ctx.measureText(label).width;
  ctx.fillRect(x - tw / 2 - 8, y - 16, tw + 16, 28);
  ctx.strokeRect(x - tw / 2 - 8, y - 16, tw + 16, 28);
  ctx.fillStyle = "#1c1710";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
}

function DrawHud() {
  const hearts = $("Hearts");
  hearts.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const el = document.createElement("i");
    if (i >= state.player.hp) el.className = "off";
    hearts.appendChild(el);
  }
  const hand = $("Hand");
  hand.textContent = state.player.carryingMedic ? "MED" : state.player.held ? state.player.held.slice(0, 4).toUpperCase() : "—";
  const bark = $("Bark");
  if (state.bark) {
    bark.hidden = false;
    bark.textContent = state.bark;
  } else bark.hidden = true;
}

function Render() {
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;
  DrawSky(w, h);
  DrawBarn();
  DrawGround(w, h);
  for (const sld of state.level.solids) DrawSolid(sld);
  const cutters = state.level.entities.find((e) => e.id === "cutters");
  if (cutters && !cutters.taken && cutters.behindGap) {
    const s = S();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#efe2c8";
    ctx.fillRect(WX(cutters.x) - 10 * s, WY(GROUND) - 24 * s, 20 * s, 20 * s);
    ctx.globalAlpha = 1;
  }
  for (const e of state.level.entities) DrawEntity(e);
  DrawProjectiles();
  if (state.phase === "play" || state.phase === "win") DrawPlayer();
  DrawPrompt();
  ctx.fillStyle = "#3a4a28";
  for (let i = 0; i < 40; i++) {
    const wx = i * 120;
    const x = WX(wx);
    if (x < -20 || x > w + 20) continue;
    const gy = WY(GROUND);
    ctx.fillRect(x, gy - 10, 3, 12);
  }
}

function Frame(ts) {
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  SyncInput();
  Step(state, dt);
  if (state.phase === "win") {
    $("Win").hidden = false;
    $("Hud").hidden = true;
  }
  if (state.phase === "play") DrawHud();
  Render();
  requestAnimationFrame(Frame);
}

Resize();
Bind();
window.addEventListener("resize", Resize);
document.title = `Valiant Farm 1914`;
requestAnimationFrame(Frame);
console.info("ValiantFarm1914", CACHE_BUST);
