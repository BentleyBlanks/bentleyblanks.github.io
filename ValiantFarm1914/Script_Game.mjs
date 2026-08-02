import {
  BeginPlay,
  CACHE_BUST,
  CreateState,
  GROUND,
  PROLOGUE_BEATS,
  Step,
  W,
} from "./Script_Sim.mjs";

let prologueIndex = 0;

const $ = (id) => document.getElementById(id);
const canvas = $("GameCanvas");
const ctx = canvas.getContext("2d");

let state = CreateState();
let last = 0;
const keys = new Set();

/** 1960s lianhuanhua plates — 100% generated; ink only if a file fails to load. */
const ART = {
  farm: `./Texture_FarmRuinWide.jpg?v=${CACHE_BUST}`,
  emile: `./Texture_PortraitEmile.png?v=${CACHE_BUST}`,
  karl: `./Texture_PortraitKarl.png?v=${CACHE_BUST}`,
  medic: `./Texture_PortraitMedic.png?v=${CACHE_BUST}`,
  emileSprite: `./Texture_SpriteEmile.png?v=${CACHE_BUST}`,
  medicSprite: `./Texture_SpriteMedic.png?v=${CACHE_BUST}`,
  dog: `./Texture_DogWalt.png?v=${CACHE_BUST}`,
  sentry: `./Texture_EnemySentry.png?v=${CACHE_BUST}`,
  cart: `./Texture_PropCart.png?v=${CACHE_BUST}`,
  wireBag: `./Texture_PropWireBag.png?v=${CACHE_BUST}`,
  tinCan: `./Texture_PropTinCan.png?v=${CACHE_BUST}`,
  grenade: `./Texture_PropGrenade.png?v=${CACHE_BUST}`,
  cutters: `./Texture_PropCutters.png?v=${CACHE_BUST}`,
  mgNest: `./Texture_PropMgNest.png?v=${CACHE_BUST}`,
  crate: `./Texture_PropCrate.png?v=${CACHE_BUST}`,
  sandbag: `./Texture_PropSandbag.png?v=${CACHE_BUST}`,
  dogGap: `./Texture_PropDogGap.png?v=${CACHE_BUST}`,
  dirtMound: `./Texture_PropDirtMound.png?v=${CACHE_BUST}`,
  barn: `./Texture_PropBarn.png?v=${CACHE_BUST}`,
};

function PickupArtKey(item) {
  if (item === "can") return "tinCan";
  if (item === "grenade") return "grenade";
  if (item === "cutters") return "cutters";
  return null;
}
const imgs = {};

function LoadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function LoadArt() {
  const entries = Object.entries(ART);
  const loaded = await Promise.all(entries.map(([, src]) => LoadImage(src)));
  entries.forEach(([key], i) => {
    if (loaded[i]) imgs[key] = loaded[i];
  });
}

function PortraitKey(speaker) {
  if (speaker === "卡尔") return "karl";
  if (speaker === "卫生员") return "medic";
  return "emile";
}

/** Fit sprite into a box without stretching (native aspect). */
function FitSpriteSize(img, maxW, maxH, mode = "contain") {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const ar = iw / ih;
  if (mode === "width") return { w: maxW, h: maxW / ar };
  if (mode === "height") return { w: maxH * ar, h: maxH };
  if (maxW / maxH > ar) return { w: maxH * ar, h: maxH };
  return { w: maxW, h: maxW / ar };
}

function DrawSprite(img, x, y, maxW, maxH, opts = {}) {
  if (!img) return false;
  const mode = opts.fit || "contain";
  const { w: drawW, h: drawH } = FitSpriteSize(img, maxW, maxH, mode);
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.flip) {
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);
  } else {
    ctx.drawImage(img, x - drawW / 2, y - drawH, drawW, drawH);
  }
  ctx.restore();
  return true;
}

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

function Bind() {
  GuardSafariZoom();
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key)) e.preventDefault();
    if (k === " " || k === "w" || k === "arrowup") state.input.jumpPressed = true;
    if (k === "e") state.input.actPressed = true;
    if (k === "f" || k === "j") state.input.throwPressed = true;
    if (state.phase === "title" && (k === "enter" || k === " ")) openPrologue();
    if (state.phase === "prologue" && (k === "enter" || k === " " || k === "e")) advancePrologue();
    if (state.phase === "win" && k === "enter") openPrologue();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  $("BtnPlay").onclick = openPrologue;
  $("BtnPrologue").onclick = advancePrologue;
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
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("selectstart", (e) => e.preventDefault());
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

  // Portrait phones, landscape phones (width often >720), and coarse pointers.
  const touchMq = matchMedia("(pointer: coarse), (max-width: 920px), (max-height: 520px)");
  const syncTouch = () => {
    touch.hidden = !touchMq.matches;
  };
  syncTouch();
  if (touchMq.addEventListener) touchMq.addEventListener("change", syncTouch);
  else if (touchMq.addListener) touchMq.addListener(syncTouch);
}

function showPrologueBeat() {
  const beat = PROLOGUE_BEATS[prologueIndex];
  if (!beat) return;
  $("PrologueSpeaker").textContent = beat.speaker;
  $("PrologueLine").textContent = beat.text;
  $("BtnPrologue").textContent = prologueIndex >= PROLOGUE_BEATS.length - 1 ? "开干" : "往下说";
  const key = PortraitKey(beat.speaker);
  const portrait = $("ProloguePortrait");
  if (ART[key]) portrait.src = ART[key];
}

function openPrologue() {
  state.phase = "prologue";
  prologueIndex = 0;
  $("Title").hidden = true;
  $("Win").hidden = true;
  $("Hud").hidden = true;
  $("Prologue").hidden = false;
  showPrologueBeat();
}

function advancePrologue() {
  if (prologueIndex < PROLOGUE_BEATS.length - 1) {
    prologueIndex += 1;
    showPrologueBeat();
    return;
  }
  start();
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
  const farm = imgs.farm;
  if (farm) {
    const parallax = state.cameraX * 0.22;
    const scale = Math.max(w / farm.width, (h * 0.72) / farm.height);
    const dw = farm.width * scale;
    const dh = farm.height * scale;
    const x = -((parallax % dw) + dw) % dw;
    ctx.drawImage(farm, x, 0, dw, dh);
    ctx.drawImage(farm, x + dw - 1, 0, dw, dh);
    // ink wash over lower sky into stage
    const wash = ctx.createLinearGradient(0, dh * 0.55, 0, h);
    wash.addColorStop(0, "rgba(203,184,146,0)");
    wash.addColorStop(0.45, "rgba(203,184,146,.35)");
    wash.addColorStop(1, "#5a6a3e");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#6d7f78");
    g.addColorStop(0.45, "#a3b29a");
    g.addColorStop(1, "#cbb892");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
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
  if (DrawSprite(imgs.barn, x, y, 300 * s, 220 * s, { fit: "width" })) return;
  if (imgs.farm) {
    const src = imgs.farm;
    const sw = src.width * 0.28;
    const sh = src.height * 0.42;
    const sx = src.width * 0.4;
    const sy = src.height * 0.28;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(src, sx, sy, sw, sh, x - 150 * s, y - 210 * s, 300 * s, 210 * s);
    ctx.restore();
  }
}

function DrawSolid(sld) {
  if (sld.kind === "ground") return;
  const s = S();
  const x = WX(sld.x);
  const y = WY(sld.y);
  const img = sld.kind === "sandbag" ? imgs.sandbag : imgs.crate;
  if (DrawSprite(img, x, y, sld.w * s, sld.h * s, { fit: "contain" })) return;
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

  if (e.type === "patrol") {
    if (e.stun <= 0) {
      ctx.fillStyle = "rgba(155,47,47,.14)";
      ctx.beginPath();
      ctx.moveTo(x, y - 30 * s);
      ctx.lineTo(x + e.facing * e.cone * s, y - 70 * s);
      ctx.lineTo(x + e.facing * e.cone * s, y + 10 * s);
      ctx.closePath();
      ctx.fill();
    }
    const drawn = DrawSprite(imgs.sentry, x, y, 48 * s, 96 * s, {
      fit: "height",
      flip: e.facing < 0,
      alpha: e.stun > 0 ? 0.5 : 1,
    });
    if (!drawn) {
      ctx.save();
      ctx.translate(x, y);
      if (e.stun > 0) ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#3e4634";
      ctx.fillRect(-13 * s, -48 * s, 26 * s, 48 * s);
      ctx.restore();
    }
    if (e.stun > 0) {
      ctx.fillStyle = "#efe2c8";
      ctx.font = `700 ${12 * s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("@", x, y - 82 * s);
    }
    return;
  }

  if (e.type === "dog") {
    const drawn = DrawSprite(imgs.dog, x, y, 72 * s, 44 * s, { fit: "height" });
    if (!drawn) {
      ctx.fillStyle = "#5a4030";
      ctx.fillRect(x - 16 * s, y - 22 * s, 28 * s, 18 * s);
    }
    ctx.fillStyle = "#efe2c8";
    ctx.strokeStyle = "#1c1710";
    ctx.lineWidth = 2;
    ctx.font = `700 ${10 * s}px Noto Serif SC, sans-serif`;
    ctx.textAlign = "center";
    ctx.strokeText("沃尔特", x, y - 52 * s);
    ctx.fillText("沃尔特", x, y - 52 * s);
    return;
  }

  if (e.type === "cart") {
    const drawn = DrawSprite(imgs.cart, x, y, 150 * s, 70 * s, { fit: "width" });
    if (!drawn) {
      ctx.fillStyle = "#5a4030";
      ctx.fillRect(x - 45 * s, y - 40 * s, 90 * s, 40 * s);
    }
    ctx.fillStyle = "#efe2c8";
    ctx.font = `700 ${11 * s}px Noto Serif SC, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("马车", x, y - 82 * s);
    return;
  }

  if (e.type === "wire" && !e.cut && imgs.wireBag) {
    DrawSprite(imgs.wireBag, x, y, Math.max(e.w, 160) * s, 90 * s, {
      fit: "width",
      alpha: 0.95,
    });
    return;
  }

  if (e.type === "medic" && !e.rescued && !e.carried && (imgs.medicSprite || imgs.medic)) {
    DrawSprite(imgs.medicSprite || imgs.medic, x, y, 70 * s, 58 * s, { fit: "height" });
    ctx.fillStyle = "#efe2c8";
    ctx.font = `700 ${10 * s}px Noto Serif SC, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("卫生员", x, y - 68 * s);
    return;
  }

  if (e.type === "pickup") {
    const key = PickupArtKey(e.item);
    const img = key ? imgs[key] : null;
    if (e.behindGap) {
      if (img) DrawSprite(img, x, y, 36 * s, 28 * s, { fit: "contain", alpha: 0.45 });
      return;
    }
    if (DrawSprite(img, x, y, 40 * s, 36 * s, { fit: "contain" })) {
      ctx.fillStyle = "#efe2c8";
      ctx.font = `700 ${10 * s}px Noto Serif SC, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(e.label || "", x, y - 42 * s);
      return;
    }
  }

  if (e.type === "gap") {
    if (DrawSprite(imgs.dogGap, x, y, 90 * s, 48 * s, { fit: "width" })) {
      ctx.fillStyle = "#c9a45a";
      ctx.font = `700 ${9 * s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("狗洞", x, y - 52 * s);
      return;
    }
  }

  if (e.type === "dirt") {
    if (e.dug) return;
    if (DrawSprite(imgs.dirtMound, x, y, Math.max(e.w, 100) * s, 70 * s, { fit: "width" })) {
      ctx.fillStyle = "#efe2c8";
      ctx.font = `700 ${10 * s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`再挖${e.hp}`, x, y - 78 * s);
      return;
    }
  }

  if (e.type === "mg") {
    if (DrawSprite(imgs.mgNest, x, y, 120 * s, 70 * s, {
      fit: "width",
      alpha: e.alive ? 1 : 0.35,
    })) {
      if (e.alive) {
        ctx.fillStyle = "#a6452f";
        ctx.font = `700 ${11 * s}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("机枪", x, y - 78 * s);
      }
      return;
    }
  }

  if (e.type === "wire") {
    if (e.cut) return;
    // Fallback ink wire if plate missing
  } else if (e.type === "medic") {
    if (e.rescued || e.carried) return;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1c1710";

  if (e.type === "pickup") {
    ctx.fillStyle = "#efe2c8";
    ctx.fillRect(-14 * s, -28 * s, 28 * s, 28 * s);
    ctx.strokeRect(-14 * s, -28 * s, 28 * s, 28 * s);
    ctx.fillStyle = "#1c1710";
    ctx.font = `700 ${11 * s}px IBM Plex Sans, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(e.label || "?", 0, -10 * s);
  } else if (e.type === "gap") {
    ctx.fillStyle = "#2a2118";
    ctx.fillRect(-20 * s, -22 * s, 40 * s, 22 * s);
    ctx.strokeRect(-20 * s, -22 * s, 40 * s, 22 * s);
  } else if (e.type === "wire") {
    ctx.strokeStyle = "#b0b0b0";
    ctx.lineWidth = 2.5 * s;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((-e.w / 2) * s, (-8 - i * 8) * s);
      ctx.lineTo((e.w / 2) * s, (-16 - i * 6) * s);
      ctx.stroke();
    }
  } else if (e.type === "dirt") {
    ctx.fillStyle = "#8a6238";
    ctx.fillRect((-e.w / 2) * s, -e.h * s, e.w * s, e.h * s);
    ctx.strokeRect((-e.w / 2) * s, -e.h * s, e.w * s, e.h * s);
  } else if (e.type === "mg") {
    if (!e.alive) ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#3a3530";
    ctx.fillRect(-30 * s, -56 * s, 60 * s, 56 * s);
    ctx.strokeRect(-30 * s, -56 * s, 60 * s, 56 * s);
  } else if (e.type === "medic") {
    ctx.fillStyle = "#c4a27a";
    ctx.fillRect(-12 * s, -36 * s, 24 * s, 24 * s);
    ctx.strokeRect(-12 * s, -36 * s, 24 * s, 24 * s);
  }
  ctx.restore();
}

function DrawPlayer() {
  const p = state.player;
  const s = S();
  const x = WX(p.x);
  const y = WY(p.y);
  const h = (p.crouching ? 38 : 56) * s;
  const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
  if (imgs.emileSprite) {
    DrawSprite(imgs.emileSprite, x, y, 44 * s, h, {
      fit: "height",
      flip: p.facing < 0,
      alpha: blink ? 0.4 : 1,
    });
    if (p.carryingMedic && (imgs.medicSprite || imgs.medic)) {
      DrawSprite(imgs.medicSprite || imgs.medic, x + p.facing * 16 * s, y - h * 0.2, 40 * s, 36 * s, {
        fit: "height",
        alpha: 0.95,
      });
    }
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(p.facing, 1);
  if (blink) ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#3a4534";
  ctx.strokeStyle = "#1c1710";
  ctx.lineWidth = 2.5 * s;
  ctx.fillRect(-14 * s, -h, 28 * s, h);
  ctx.strokeRect(-14 * s, -h, 28 * s, h);
  ctx.restore();
}

function DrawProjectiles() {
  const s = S();
  for (const p of state.projectiles) {
    const key = PickupArtKey(p.kind);
    const img = key ? imgs[key] : null;
    if (DrawSprite(img, WX(p.x), WY(p.y) + 8 * s, 28 * s, 28 * s, { fit: "contain" })) continue;
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
    if (cutters && !cutters.taken && cutters.behindGap) label = "E  让狗去叼";
    else if (state.level.entities.find((e) => e.type === "mg")?.alive && p.x > 2000) label = "E  让狗引开";
  }
  for (const e of state.level.entities) {
    if (e.type === "pickup" && !e.taken && !e.hidden && !e.behindGap && Math.abs(p.x - e.x) < 42) label = "E  捡起来";
    if (e.type === "wire" && !e.cut && e.needs === "cutters" && Math.abs(p.x - e.x) < 55) label = "E  剪开";
    if (e.type === "dirt" && !e.dug && Math.abs(p.x - e.x) < 60) label = "E  往下挖";
    if (e.type === "medic" && !e.rescued && Math.abs(p.x - e.x) < 50) label = p.carryingMedic ? "E  放下" : "E  背起来";
    if (e.type === "cart" && p.carryingMedic && Math.abs(p.x - e.x) < 70) label = "E  弄上车";
  }
  if (p.held) label = (label ? label + " · " : "") + "F  扔出去";
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
  const heldKey = state.player.carryingMedic
    ? "medicSprite"
    : PickupArtKey(state.player.held);
  const heldLabel = state.player.carryingMedic
    ? "伤员"
    : state.player.held === "can"
      ? "罐头"
      : state.player.held === "cutters"
        ? "钳子"
        : state.player.held === "grenade"
          ? "手雷"
          : "空";
  if (heldKey && ART[heldKey]) {
    hand.innerHTML = "";
    const im = document.createElement("img");
    im.src = ART[heldKey];
    im.alt = heldLabel;
    hand.appendChild(im);
  } else {
    hand.textContent = heldLabel;
  }
  const box = $("BarkBox");
  if (state.bark) {
    box.hidden = false;
    const speaker = state.barkSpeaker || "埃米尔";
    $("BarkSpeaker").textContent = speaker;
    $("Bark").textContent = state.bark;
    const bp = $("BarkPortrait");
    const key = PortraitKey(speaker);
    if (ART[key]) {
      bp.hidden = false;
      bp.src = ART[key];
    } else bp.hidden = true;
  } else box.hidden = true;
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
  // Unify plates + ink shapes under one newsprint wash
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(232,217,184,.22)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(28,23,16,.04)";
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.restore();
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
document.title = "瓦尔奈农场 · 1914";

LoadArt().then(() => {
  requestAnimationFrame(Frame);
  console.info("ValiantFarm1914", CACHE_BUST, "art", Object.keys(imgs).length);
});
